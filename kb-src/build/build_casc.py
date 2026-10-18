import sys, json, re, os
sys.path.insert(0, '.')
from casc_data import C, SOURCE_EXAMPLES
from casc_rows import EV, R
# Paths are relative to this script (originally an absolute path into a session scratch folder);
# see kb-src/build/README.md. Helper modules and intermediate files are still read from the working
# directory, so run this from kb-src/build.
HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "..", "research")  # kb-src/research (committed)
# Writes the committed research file in place: review `git diff kb-src/research/cascades.json` after a rerun.
OUT = os.path.join(RES, "cascades.json")
pipc = json.load(open("pipc_rows.json"))
t3 = json.load(open("bmj_t3.json")); t4 = json.load(open("bmj_t4.json"))
used = set()
def match(p):
    a, ae, b = p
    for i, r in enumerate(pipc):
        if r["drugA"].startswith(a) and r["adverseEvent"].startswith(ae) and r["drugB"].startswith(b):
            if i in used: continue
            used.add(i); return r
    raise SystemExit("no PIPC match for %r" % (p,))
TC_ROUND3 = {"ccb-edema-diuretic": "25/31 (80.6%)", "diuretic-incontinence-oab": "24/31 (77.4%)", "antipsychotic-eps-antiparkinsonian": "25/31 (80.6%)",
             "benzodiazepine-cognition-chei": "25/31 (80.6%)", "benzodiazepine-agitation-antipsychotic": "22/30 (73.3%)", "ssri-snri-insomnia-sleep-agent": "22/31 (71.0%)",
             "nsaid-hypertension-antihypertensive": "22/31 (71.0%)", "urinary-anticholinergic-cognition-chei": "25/31 (80.6%)", "alpha-blocker-dizziness-vestibular-suppressant": "23/31 (74.2%)"}
def cls(keys):
    out = []
    for k in keys:
        out.append({"class": k.replace("_", " "), "examples": C[k], "examplesSource": SOURCE_EXAMPLES.get(k, "MedWatch-illustrative (class membership, not named by the source)")})
    return out
def parse_asr(s):
    m = re.match(r"([\d.]+) \(([\d.]+) to ([\d.]+)\)", s or "")
    return {"aSR": float(m.group(1)), "lower95": float(m.group(2)), "upper95": float(m.group(3))} if m else None
items = []
for r in R:
    row = match(r["pipc"]) if r.get("pipc") else r.get("pipcManual")
    if r.get("pipcManual"): pass
    o = {"id": r["id"],
         "indexDrugs": cls(r["idx"]),
         "adverseEvent": r["ae"],
         "markerDrugs": cls(r["mk"]),
         "diarySymptoms": r["sym"],
         "plainLanguage": r["plain"],
         "clinicianNote": r["clin"],
         "lists": {"pipc2025": bool(row), "thinkCascades2022": r["tc"], "thinkCascadesRound3Rating": TC_ROUND3.get(r["id"]),
                   "thinkCascadesRound1Only": bool(r.get("tcRound1")) and not r["tc"]}}
    if row:
        o["pipcRow"] = {"system": row["system"], "level": row["level"], "drugA": row["drugA"], "adverseEvent": row["adverseEvent"], "drugB": row["drugB"]}
    if r.get("bmj"):
        b = t3[r["bmj"]]
        a = parse_asr(b["adjustedSR"])
        o["ontarioPSSA2022_23"] = {"analysis": r["bmj"], "initialBeforeSubsequent": b["initialBeforeSubsequent"], "initialAfterSubsequent": b["initialAfterSubsequent"],
            "adjustedSequenceRatio": b["adjustedSR"], **({"parsed": a, "populationSignal": (a["lower95"] > 1.0)} if a else {"populationSignal": None, "note": "suppressed/too few events"}),
            "prioritised": r["bmj"] in t4, **({"prioritisedData": t4[r["bmj"]]} if r["bmj"] in t4 else {}), "windowDays": 365, "source": "rochon2026bmj"}
    ev = [{"ref": k, **{x: EV[k][x] for x in ("finding", "windowDays") if x in EV[k]}} for k in r["ev"]]
    o["evidence"] = ev
    wins = sorted({e["windowDays"] for e in ev if e.get("windowDays")})
    o["timeWindow"] = {"studyWindowsDays": wins, "pssaWindowDays": 365 if r.get("bmj") else None,
                       "suggestedLookbackDays": 365,
                       "basis": "Marker drug started after the index drug within the lookback is 'timing consistent with a possible cascade' (descriptive only). 365 days follows the BMJ 2026 PSSA primary window and Doherty 2022 (cascades seen 3 months to 1 year after the first drug)."}
    if r["id"] in ("nsaid-gi-gastroprotective",):
        o["appropriatenessCaveat"] = "Often intentional and appropriate (ThinkCascades excluded it for this reason)."
    if r["id"] in ("amiodarone-hypothyroidism-levothyroxine", "ics-thrush-antifungal", "iron-constipation-laxative"):
        o["appropriatenessCaveat"] = "Marker drug is frequently an appropriate response; present as information, not as a problem."
    sources = (["pipc2025"] if row else []) + (["thinkcascades2022"] if r["tc"] or r.get("tcRound1") else []) + (["rochon2026bmj"] if r.get("bmj") else []) + r["ev"]
    o["sources"] = sorted(set(sources), key=sources.index)
    items.append(o)
assert len(used) == 64, len(used)
doc = {
 "id": "cascades", "title": "Prescribing cascades relevant to older adults - machine-readable knowledge base",
 "compiled": "2026-10-10",
 "definition": {"text": "A prescribing cascade occurs when an adverse drug event is misinterpreted as a new medical condition and a further drug is prescribed to treat it.", "sources": ["rochon1997", "rochon2017", "mccarthy2019"]},
 "coverage": {"pipc2025": 65, "thinkCascades2022": 9, "thinkCascadesOnly": 3, "otherDocumented": 3, "total": len(items),
              "ontarioPrioritised": sum(1 for i in items if i.get("ontarioPSSA2022_23", {}).get("prioritised"))},
 "sources": EV,
 "licenseNotes": {"pipc2025": "CC BY 4.0 (after 2026 correction) - list reproduced with attribution.", "thinkCascades2022": "Not CC-licensed: PMC record says it is available via the PMC Open Access Subset under COVID-19 emergency permissions with acknowledgement; MedWatch uses only the cascade names/structure (facts) and writes its own descriptions.", "rochon2026bmj": "CC BY-NC open access per BMJ page; numbers transcribed as facts."},
 "engineGuidance": {
   "matching": "Match the person's medication list against indexDrugs[].examples and markerDrugs[].examples (generic or RxNorm ingredient); require marker start date AFTER index start date. Without dates, show 'possible cascade - order unknown'.",
   "language": "Never say a drug caused a symptom. Say 'X was started N days after Y; Y is known to sometimes cause Z (source). Worth asking the prescriber.'",
   "ranking": "Rank: ThinkCascades or Ontario-prioritised first; then entries with populationSignal true; entries with populationSignal false/null are still valid individual-level prompts but lower priority (MedWatch heuristic).",
   "diaryLink": "diarySymptoms links to symptom ids in symptom-adr-map.json so a diary symptom (e.g. ankle_swelling) can surface the relevant cascade."
 },
 "labelClaimChecks": {"note": "FDA label text checks (openFDA, 2026-10-10) supporting statements in clinicianNote fields.", **json.load(open("claim_checks.json"))},
 "cascades": items,
}
json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
print("wrote", OUT, doc["coverage"])
