import sys, json, os
sys.path.insert(0, '.')
import apis, labels
from sym_data import SYMPTOMS, PAIRS
from concurrent.futures import ThreadPoolExecutor
# Paths are relative to this script (originally an absolute path into a session scratch folder);
# see kb-src/build/README.md. Helper modules and intermediate files are still read from the working
# directory, so run this from kb-src/build.
HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "..", "research")  # kb-src/research (committed)
# SUPERSEDED by build_sym2.py. OUT is not written here: this script writes sym_build_tmp.json and
# finalize_sym.py then wrote the research file. The ../snomed/ lookup cache it reads was not committed.
OUT = os.path.join(RES, "symptom-adr-map.json")
SNO = {}
for f in ["../snomed/snomed_extra.jsonl", "../snomed/snomed_extra2.jsonl"]:
    for l in open(f): d = json.loads(l); SNO[d["code"]] = d
import subprocess
def sno(code):
    if code in SNO: return SNO[code]
    out = subprocess.run(["python3", "-I", "../snomed/lookup.py", "lookup", code], capture_output=True, text=True).stdout
    d = json.loads(out.strip().splitlines()[0]); SNO[code] = d; return d
generics = sorted({g for p in PAIRS for g in p[2]})
with ThreadPoolExecutor(4) as ex:
    LAB = dict(zip(generics, ex.map(labels.best_label, generics)))
print("labels fetched; missing:", [g for g in generics if LAB[g] is None], file=sys.stderr)
RX = {g: apis.rxcui(g if g != "carbidopa" else "carbidopa / levodopa") for g in generics}
MP = {g: (apis.medlineplus(RX[g]["rxcui"]) if RX[g] else None) for g in generics}
symdef = {s["id"]: s for s in SYMPTOMS}
out_symptoms = []
unverified = []
for s in SYMPTOMS:
    codes = []
    for c, role in s["snomed"]:
        d = sno(c)
        codes.append({"system": "http://snomed.info/sct", "code": c, "display": d.get("display"), "fsn": d.get("fsn"), "role": role,
                      "verified": bool(d.get("display")) and d.get("inactive") is False, "verifiedVia": "tx.fhir.org CodeSystem/$lookup, SNOMED CT International 20250201, 2026-10-10"})
    classes = []
    for sid, cls, gens, note in PAIRS:
        if sid != s["id"]: continue
        ev = []
        for g in gens:
            r = LAB.get(g)
            if not r: ev.append({"generic": g, "labelFound": False}); continue
            hits = labels.find(r, s["rx"])
            ev.append({"generic": g, "labelFound": True, **labels.label_meta(r), "matched": bool(hits), "hits": hits[:3],
                       "rxnorm": RX[g], "medlineplus": MP[g]})
        ok = [e for e in ev if e.get("matched")]
        mpev = []
        if not ok:
            import re, subprocess, hashlib, os
            for g in gens:
                mp = MP.get(g)
                if not mp: continue
                p = os.path.join("cache", "mp_" + hashlib.sha1(mp["url"].encode()).hexdigest() + ".html")
                if not os.path.exists(p):
                    html = subprocess.run(["curl", "-sL", "-m", "40", mp["url"]], capture_output=True, text=True).stdout
                    open(p, "w").write(html)
                txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", open(p).read()))
                m = re.search(s["rx"], txt, re.I)
                if m:
                    a = max(0, m.start() - 90); b = min(len(txt), m.end() + 90)
                    mpev.append({"generic": g, "medlineplus": mp["url"], "term": m.group(0), "snippet": txt[a:b].strip()})
        entry = {"drugClass": cls, "representativeGenerics": gens, "labelEvidenceFound": bool(ok),
                 "labelEvidence": ev}
        OVERRIDE = {("confusion", "Sulfonylureas (via hypoglycaemia)"): "UNVERIFIED: the MedlinePlus hit describes a reaction to alcohol, not hypoglycaemia. Confusion as a hypoglycaemia symptom is an inference, not found in the label text checked.",
                    ("falls", "Gabapentinoids"): None}
        if (s["id"], cls) in OVERRIDE and OVERRIDE[(s["id"], cls)]:
            entry["medlineplusEvidence"] = mpev
            entry["status"] = OVERRIDE[(s["id"], cls)]
            unverified.append((s["id"], cls))
        elif mpev:
            entry["medlineplusEvidence"] = mpev
            entry["status"] = "Not found in the FDA label text checked; found in NLM MedlinePlus consumer drug information (see medlineplusEvidence)"
        elif not ok:
            entry["status"] = "UNVERIFIED in FDA label text for the representative drugs checked (term not found in warning/adverse-reaction sections)"
            unverified.append((s["id"], cls))
        if note: entry["note"] = note
        classes.append(entry)
    o = {"id": s["id"], "label": s["label"], "layPhrases": s["lay"], "snomed": codes, "labelSearchRegex": s["rx"], "drugClasses": classes}
    if s.get("note"): o["note"] = s["note"]
    out_symptoms.append(o)
json.dump({"_tmp": out_symptoms, "unverified": unverified}, open("sym_build_tmp.json", "w"), indent=1)
print("unverified pairs:", unverified, file=sys.stderr)
