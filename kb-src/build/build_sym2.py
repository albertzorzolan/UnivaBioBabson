"""Rebuild symptom -> drug-class label evidence with context-aware hit selection.

Improvements over build_sym.py:
  * every regex match in a label section is examined (not just the first);
  * each match is classified as 'exact' (core symptom term) or 'related' (mechanism / near-synonym);
  * the sentence around the match is checked for contexts that make it weak evidence for ongoing use
    (serotonin syndrome, overdose, withdrawal, angioedema, hyperglycaemia, interaction-only statements ...);
  * best evidence = exact & clean > related & clean > context-only (context-only does NOT count as label evidence).
Uses the cached openFDA / RxNav / MedlinePlus responses from the first build (no new network calls unless missing).
"""
import sys, json, re, os, hashlib, subprocess
sys.path.insert(0, '.')
import apis, labels
from sym_data import SYMPTOMS, PAIRS as PAIRS0
from concurrent.futures import ThreadPoolExecutor

# ---- pair-level adjustments (documented in output) ----
PAIRS = []
for sid, cls, gens, note in PAIRS0:
    if (sid, cls) == ("confusion", "Sulfonylureas (via hypoglycaemia)"):
        gens = ["glimepiride", "glipizide", "glyburide"]
    PAIRS.append((sid, cls, gens, note))

EXTRA_RX = {  # pair-specific extra (related) terms
    ("confusion", "Sulfonylureas (via hypoglycaemia)"): r"ability to concentrate",
    ("urinary", "Diuretics (frequency/urgency)"): r"\bdiuresis\b",
    ("falls", "Gabapentinoids"): r"accidental injur",
    ("falls", "Alpha-1 blockers"): r"syncope",
    ("cough", "Non-selective beta-blockers (bronchospasm)"): r"bronchospasm",
}
RENAME = {
    ("cough", "Non-selective beta-blockers (bronchospasm)"): "Non-selective beta-blockers (bronchospasm; cough itself not named in label)",
    ("confusion", "SSRIs/SNRIs (via hyponatraemia)"): "SSRIs/SNRIs (listed directly; hyponatraemia warnings also name confusion)",
}

CORE = {
    "dizziness": r"dizz|light-?headed|vertigo",
    "confusion": r"confus|delirium|disorientation|memory impairment|amnesia|cognitive impairment|impaired cognition|cognitive[- ]related dysfunction",
    "falls": r"\bfall",
    "fatigue": r"fatigue|tiredness|asthenia|lethargy",
    "poor_sleep": r"insomnia|sleeplessness|difficulty sleeping|sleep disturbance",
    "sleepiness": r"somnolence|drowsiness|sedation|sleepiness",
    "appetite_nausea": r".",
    "constipation": r".",
    "dry_mouth": r".",
    "ankle_swelling": r"peripheral o?edema|leg o?edema|lower[- ]limb|o?edema,? peripheral|ankle|swelling of (the )?(feet|legs?)",
    "cough": r".",
    "urinary": r"retention|incontinence|frequency|frequent urination|pollakiuria|nocturia|urgency|difficult(y)? (in )?urinat|hesitan|hesitation|trouble urinating|dysuria|increased urination|polyuria",
}
FALLS_RX = r"\bfalls?\b(?!\s+(asleep|in\b|on\b|within|below|outside|into|to\b|under|short))|\bfalling\b(?!\s+(or staying\s+)?asleep)"

CONTEXT = [
    ("serotonin syndrome", r"serotonin syndrome|serotonergic"),
    ("adrenal insufficiency", r"adrenal insufficiency"),
    ("hepatotoxicity", r"hepatotox|liver injury|hepatic failure|jaundice"),
    ("overdose", r"overdos|toxicity of|signs of toxicity"),
    ("hypersensitivity/angioedema", r"anaphyla|angioedema|hypersensitivity|swelling of the (face|throat|lips|tongue)"),
    ("hyperglycaemia", r"hyperglyc|polydipsia"),
    ("withdrawal/discontinuation", r"withdrawal|discontinuation (symptoms|syndrome|reactions)|abrupt(ly)? (discontinu|cessation|withdraw|stop)|during taper|after discontinuation"),
    ("pancreatitis", r"pancreatitis"),
    ("neuroleptic malignant syndrome", r"neuroleptic malignant"),
    ("MAOI interaction", r"\bMAOIs?\b|monoamine oxidase"),
    ("paediatric population", r"pediatric patients|pediatric use|in children|neonat|infants?\b"),
    ("interaction-only statement", r"concomitant(ly)? (use|administ)|coadminist|co-administ|potentiation of"),
    ("lactic acidosis", r"lactic acidosis"),
    ("alcohol reaction", r"alcohol"),
]
NONPERIPHERAL_EDEMA = r"(face|facial|macular|pulmonary|cerebral|laryng|periorbital|eyelid|tongue|lip|angio|corneal|papill)\W{0,3}$"
FECAL = r"(fecal|faecal|anal|bowel)\W{0,3}$"

SECTION_PRIORITY = ["adverse_reactions", "boxed_warning", "warnings_and_cautions", "warnings", "precautions", "geriatric_use",
                    "use_in_specific_populations", "when_using", "stop_use", "ask_doctor", "do_not_use", "information_for_patients"]
EVIDENCE_TYPE = {"adverse_reactions": "adverse reaction", "boxed_warning": "boxed warning", "warnings_and_cautions": "warning/precaution",
                 "warnings": "warning/precaution", "precautions": "warning/precaution", "geriatric_use": "geriatric use",
                 "use_in_specific_populations": "specific populations", "when_using": "OTC label: when using / stop use",
                 "stop_use": "OTC label: when using / stop use", "ask_doctor": "OTC label: ask a doctor before use (pre-existing-condition caution)",
                 "do_not_use": "OTC label: do not use", "information_for_patients": "patient counselling"}


def segment(txt, a, b):
    lo = max(0, a - 220); hi = min(len(txt), b + 220)
    left = txt[lo:a]; right = txt[b:hi]
    cut = max(left.rfind(". "), left.rfind("• "), left.rfind("; "), left.rfind("\n"))
    if cut >= 0: left = left[cut + 2:]
    m = re.search(r"\. |• |; |\n", right)
    if m: right = right[:m.start()]
    seg = left + txt[a:b] + right
    # adverse-reaction tables have no sentence punctuation: keep only the nearby table cells
    if len(seg) > 160 and len(re.findall(r"(?<![\w.])\d+(?:\.\d+)?%?(?!\w)", seg)) >= 6:
        seg = txt[max(0, a - 40):min(len(txt), b + 40)]
    return seg


def classify(sym, txt, m, extra):
    seg = segment(txt, m.start(), m.end())
    flags = [name for name, rx in CONTEXT if re.search(rx, seg, re.I)]
    pre = txt[max(0, m.start() - 15):m.start()]
    term = m.group(0)
    if sym == "ankle_swelling" and re.search(NONPERIPHERAL_EDEMA, pre, re.I):
        flags.append("non-peripheral oedema")
    if sym == "urinary" and re.search(FECAL, pre, re.I):
        flags.append("faecal incontinence")
    if extra and re.fullmatch(extra, term, re.I):
        level = "related"
    else:
        level = "exact" if re.search(CORE[sym], txt[max(0, m.start() - 15):m.start()] + term, re.I) else "related"
    return level, flags, seg


def best_hits(r, sym, rx, extra):
    pat = re.compile(rx + (("|" + extra) if extra else ""), re.I)
    cands = []
    for si, s in enumerate(SECTION_PRIORITY):
        for txt in r.get(s, []) or []:
            for m in pat.finditer(txt):
                level, flags, seg = classify(sym, txt, m, extra)
                etype = EVIDENCE_TYPE[s]
                if s == "use_in_specific_populations":
                    sub = list(re.finditer(r"(pediatric use|geriatric use|pregnancy|lactation|nursing mothers|labor and delivery|females and males|renal impairment|hepatic impairment|lower? (body )?weight|poor metabolizers|ethnic|gender)", txt[:m.start()], re.I))
                    if sub:
                        hdr = sub[-1].group(1).lower()
                        if hdr == "geriatric use":
                            etype = "geriatric use"
                        else:
                            flags.append("non-geriatric subpopulation (" + hdr + ")")
                a = max(0, m.start() - 100); b = min(len(txt), m.end() + 100)
                cands.append({"section": s, "evidenceType": etype, "term": m.group(0), "termMatch": level,
                              "contextFlags": flags, "snippet": re.sub(r"\s+", " ", txt[a:b]).strip(), "_rank": (bool(flags), level != "exact", si)})
    cands.sort(key=lambda h: h["_rank"])
    chosen, seen = [], set()
    for h in cands:
        if h["section"] in seen: continue
        seen.add(h["section"]); chosen.append(h)
        if len(chosen) == 3: break
    if not any(h["evidenceType"] == "geriatric use" for h in chosen):
        ger = [h for h in cands if h["evidenceType"] == "geriatric use" and not h["contextFlags"]]
        if ger: chosen.append(ger[0])
    for h in chosen: h.pop("_rank", None)
    clean = [h for h in chosen if not h["contextFlags"]]
    if clean:
        lvl = "exact" if any(h["termMatch"] == "exact" for h in clean) else "related"
        return lvl, clean[:4]
    if chosen:
        return "context-only", chosen[:2]
    return "none", []


def mp_text(url):
    p = os.path.join("cache", "mp_" + hashlib.sha1(url.encode()).hexdigest() + ".html")
    if not os.path.exists(p):
        html = subprocess.run(["curl", "-sL", "-m", "40", url], capture_output=True, text=True).stdout
        open(p, "w").write(html)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", open(p).read()))


def main():
    generics = sorted({g for p in PAIRS for g in p[2]})
    with ThreadPoolExecutor(4) as ex:
        LAB = dict(zip(generics, ex.map(labels.best_label, generics)))
    RX = {g: apis.rxcui(g if g != "carbidopa" else "carbidopa / levodopa") for g in generics}
    MP = {g: (apis.medlineplus(RX[g]["rxcui"]) if RX[g] else None) for g in generics}
    SNO = {}
    for f in ["../snomed/snomed_extra.jsonl", "../snomed/snomed_extra2.jsonl"]:
        for l in open(f):
            d = json.loads(l); SNO[d["code"]] = d
    def sno(code):
        if code in SNO: return SNO[code]
        out = subprocess.run(["python3", "-I", "../snomed/lookup.py", "lookup", code], capture_output=True, text=True).stdout
        d = json.loads(out.strip().splitlines()[0]); SNO[code] = d; return d
    out = []
    stats = {"exact": 0, "related": 0, "context-only": 0, "none": 0}
    for s in SYMPTOMS:
        sid = s["id"]
        rx = FALLS_RX if sid == "falls" else s["rx"]
        codes = []
        for c, role in s["snomed"]:
            d = sno(c)
            codes.append({"system": "http://snomed.info/sct", "code": c, "display": d.get("display"), "fsn": d.get("fsn"), "role": role,
                          "verified": bool(d.get("display")) and d.get("inactive") is False,
                          "verifiedVia": "tx.fhir.org CodeSystem/$lookup, SNOMED CT International Edition 20250201, 2026-10-10"})
        classes = []
        for psid, cls, gens, note in PAIRS:
            if psid != sid: continue
            extra = EXTRA_RX.get((sid, cls))
            ev = []
            for g in gens:
                r = LAB.get(g)
                if not r:
                    ev.append({"generic": g, "labelFound": False}); continue
                lvl, hits = best_hits(r, sid, rx, extra)
                ev.append({"generic": g, "labelFound": True, **labels.label_meta(r), "evidenceLevel": lvl, "hits": hits,
                           "rxnorm": RX[g], "medlineplus": MP[g]})
            levels = [e.get("evidenceLevel", "none") for e in ev]
            lvl = "exact" if "exact" in levels else "related" if "related" in levels else "context-only" if "context-only" in levels else "none"
            ger = sorted({e["generic"] for e in ev for h in e.get("hits", []) if h["evidenceType"] == "geriatric use"})
            entry = {"drugClass": RENAME.get((sid, cls), cls), "representativeGenerics": gens, "geriatricUseLabelMention": ger,
                     "labelEvidenceLevel": lvl, "labelEvidenceFound": lvl in ("exact", "related"), "labelEvidence": ev}
            if extra: entry["extraRelatedTerms"] = extra
            if lvl not in ("exact",):
                mpev = []
                for g in gens:
                    mp = MP.get(g)
                    if not mp: continue
                    txt = mp_text(mp["url"])
                    for m in re.finditer(rx + (("|" + extra) if extra else ""), txt, re.I):
                        level, flags, seg = classify(sid, txt, m, extra)
                        if flags: continue
                        a = max(0, m.start() - 100); b = min(len(txt), m.end() + 100)
                        mpev.append({"generic": g, "medlineplus": mp["url"], "term": m.group(0), "termMatch": level, "snippet": txt[a:b].strip()})
                        break
                if mpev: entry["medlineplusEvidence"] = mpev
            stats[lvl] += 1
            if note: entry["note"] = note
            classes.append(entry)
        o = {"id": sid, "label": s["label"], "layPhrases": s["lay"], "snomed": codes, "labelSearchRegex": rx,
             "coreTermRegex": CORE[sid], "drugClasses": classes}
        if s.get("note"): o["note"] = s["note"]
        out.append(o)
    json.dump({"_tmp": out, "stats": stats}, open("sym_build_tmp2.json", "w"), indent=1)
    print("stats", stats, file=sys.stderr)


if __name__ == "__main__":
    main()
