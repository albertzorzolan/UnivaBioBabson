import json, sys, os
# Paths are relative to this script (originally an absolute path into a session scratch folder);
# see kb-src/build/README.md. Helper modules and intermediate files are still read from the working
# directory, so run this from kb-src/build.
HERE = os.path.dirname(os.path.abspath(__file__))
# SUPERSEDED by finalize_sym2.py (kept for provenance). R ends with a separator because it is joined with +.
# WARNING: a rerun overwrites the current research/symptom-adr-map.json (produced by finalize_sym2.py) with the v1 output; do not run except to reproduce history.
R = os.path.join(HERE, "..", "research", "")  # kb-src/research/ (committed)
tmp = json.load(open("sym_build_tmp.json"))
casc = json.load(open(R + "cascades.json")); frid = json.load(open(R + "frids.json"))
syms = tmp["_tmp"]
for s in syms:
    s["relatedCascades"] = [c["id"] for c in casc["cascades"] if s["id"] in c["diarySymptoms"]]
    s["relatedFridClasses"] = [c["id"] for c in frid["classes"] if s["id"] in c["diarySignalsToWatch"]]
    for c in s["drugClasses"]:
        for e in c["labelEvidence"]:
            if e.get("hits"): e["hits"] = e["hits"][:2]
    s["coverage"] = {"classesListed": len(s["drugClasses"]), "classesWithLabelEvidence": sum(1 for c in s["drugClasses"] if c["labelEvidenceFound"])}
extra = {
 "confusion": {"seeAlso": "acb-scale.json (ACB >= 3 total, Beers 2023 Table 7 strong anticholinergics). Beers 2023 also lists anticholinergics, antipsychotics, benzodiazepines, Z-drugs, corticosteroids and H2-receptor antagonists among drugs to avoid in delirium (verify in the Beers knowledge base)."},
 "falls": {"seeAlso": "frids.json - class-level fall evidence (CDC STEADI, STOPPFall, Beers 2023). Label text rarely uses the word 'fall'; absence of a label hit does NOT mean a class is safe."},
 "dizziness": {"seeAlso": "frids.json (orthostatic hypotension classes) and STEADI-Rx orthostatic BP check (lie 5 min, stand 1 and 3 min)."},
}
for s in syms:
    if s["id"] in extra: s.update(extra[s["id"]])
doc = {
 "id": "symptom-adr-map", "title": "Caregiver-diary symptoms -> drug classes with labelled adverse effects (older-adult medication review)",
 "compiled": "2026-10-10",
 "method": {
   "summary": "For each diary symptom we list drug classes commonly implicated in older adults, then check 1-6 representative generics against current FDA Structured Product Labeling (openFDA drug label API) by regex search of boxed warning, warnings/precautions, adverse reactions, geriatric use and OTC 'when using/stop use/ask a doctor' sections. Each hit stores the SPL set id, DailyMed link, label effective date, section and a short snippet. Classes with no hit are kept but marked UNVERIFIED.",
   "labelSelection": "openFDA search on openfda.generic_name, preferring single-ingredient human prescription labels with an adverse-reactions section, then most recent effective date. Labels are often generic manufacturers' SPLs; brand labels may differ slightly.",
   "limitations": ["A label listing an adverse reaction does not mean the drug caused a given person's symptom; trial frequencies and placebo rates are not captured here.",
                   "Regex hits can include negated or contextual mentions (e.g. 'no increase in dizziness'); snippets are stored so a reviewer can check.",
                   "Representative drugs stand in for classes; individual agents differ.",
                   "Older-adult specificity comes from the class choice (Beers/STOPPFall/STEADI) rather than from the labels."],
   "snomed": "Codes verified with tx.fhir.org CodeSystem/$lookup against SNOMED CT International Edition 20250201 (all active). Display = preferred term; fsn = fully specified name. SNOMED CT use in production requires an IHTSDO/NLM UMLS licence (free in member countries such as the US via NLM)."
 },
 "sources": [
   {"id": "openfda", "citation": "U.S. FDA. openFDA drug label API (Structured Product Labeling).", "url": "https://open.fda.gov/apis/drug/label/", "accessed": "2026-10-10"},
   {"id": "dailymed", "citation": "NLM DailyMed (labels referenced by set id).", "url": "https://dailymed.nlm.nih.gov/dailymed/"},
   {"id": "medlineplus", "citation": "NLM MedlinePlus drug information via MedlinePlus Connect.", "url": "https://medlineplus.gov/medlineplus-connect/web-service/"},
   {"id": "rxnav", "citation": "NLM RxNav RxNorm API.", "url": "https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html"},
   {"id": "txfhir", "citation": "HL7 FHIR terminology server tx.fhir.org, SNOMED CT International 20250201.", "url": "https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=404640003"},
   {"id": "beers2023", "citation": "AGS 2023 Beers Criteria. J Am Geriatr Soc. 2023;71(7):2052-2081.", "pmid": "37139824", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12478568/"},
   {"id": "stoppfall2021", "citation": "Seppala LJ et al. Age Ageing. 2021;50(4):1189-1199.", "pmid": "33349863", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC8244563/"},
   {"id": "cdcSteadi", "citation": "CDC STEADI Medications Linked to Falls (2017).", "url": "https://www.cdc.gov/steadi/media/pdfs/STEADI-FactSheet-MedsLinkedtoFalls-508.pdf"}
 ],
 "fhirHint": {"resource": "Observation", "category": "survey", "code": "SNOMED CT concept from snomed[] (role 'primary' or the most specific match)", "valueCodeableConcept": "present/absent via SNOMED 52101004 |Present| / 2667000 |Absent| (both verified active qualifier values via tx.fhir.org)", "note": "Use Observation.effectiveDateTime for the diary day; keep the free-text utterance in Observation.note."},
 "coverage": {"symptoms": len(syms), "classPairs": sum(len(s["drugClasses"]) for s in syms), "pairsWithLabelEvidence": sum(1 for s in syms for c in s["drugClasses"] if c["labelEvidenceFound"]),
              "unverifiedPairs": tmp["unverified"]},
 "symptoms": syms,
}
json.dump(doc, open(R + "symptom-adr-map.json", "w"), indent=1, ensure_ascii=False)
print("wrote", doc["coverage"]["symptoms"], doc["coverage"]["classPairs"], doc["coverage"]["pairsWithLabelEvidence"], tmp["unverified"])
