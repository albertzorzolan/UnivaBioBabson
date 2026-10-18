import json, re, os
# Paths are relative to this script (originally an absolute path into a session scratch folder);
# see kb-src/build/README.md. Helper modules and intermediate files are still read from the working
# directory, so run this from kb-src/build.
HERE = os.path.dirname(os.path.abspath(__file__))
# Current helper: writes the committed research/symptom-adr-map.json in place (review the git diff after a rerun).
# R ends with a separator because it is joined with +.
R = os.path.join(HERE, "..", "research", "")  # kb-src/research/ (committed)
tmp = json.load(open("sym_build_tmp2.json"))
casc = json.load(open(R + "cascades.json")); frid = json.load(open(R + "frids.json"))
beers = json.load(open(R + "beers-2023.json")); acb = json.load(open(R + "acb-scale.json"))
LEX = beers["drugLexicon"]
ACB = {}
for d in acb["drugs"]:
    for t in [d["generic"]] + d.get("matchTerms", []):
        ACB[t.lower()] = d["acbScore"]
FRID_EX = {}
for c in frid["classes"]:
    for e in c["examples"]:
        FRID_EX.setdefault(e["generic"].lower(), []).append(c["id"])
FRID_BY_ID = {c["id"]: c for c in frid["classes"]}
DDI = {d["id"]: d for d in beers["drugDiseaseInteractions"]}

# falls: class-level guideline evidence (frids.json is the authority for falls)
FALLS_GUIDE = {
    "Antipsychotics": ["antipsychotics"], "Gabapentinoids": ["antiepileptics"],
    "SSRIs/SNRIs (via hyponatraemia)": ["antidepressants"], "Benzodiazepines": ["benzodiazepines"],
    "Z-drug hypnotics": ["z-drugs"], "Opioids": ["opioids"],
    "Alpha-1 blockers": ["alpha-blockers-antihypertensive", "alpha-blockers-bph"],
    "Antiepileptics": ["antiepileptics"], "Skeletal muscle relaxants": ["muscle-relaxants"],
    "Tricyclic antidepressants / mirtazapine / trazodone": ["antidepressants"],
    "Cholinesterase inhibitors": [], "Dopaminergic antiparkinsonian drugs": [],
}
FALLS_GUIDE_NOTE = {
    "Gabapentinoids": "MedWatch interpretation: gabapentinoids counted under STOPPFall/Beers 'antiepileptics'; Beers 2023 lexicon lists gabapentin under t3-falls-fractures.",
    "Cholinesterase inhibitors": "Not a STOPPFall consensus FRID class (listed among no-consensus classes); AGS Beers 2023 lists AChEIs under the syncope drug-disease criterion (t3-syncope).",
    "Dopaminergic antiparkinsonian drugs": "Not a STOPPFall consensus FRID class (antiparkinson medication was a no-consensus class).",
}
CLASS_NOTES = {
    ("urinary", "Decongestants (retention in prostate enlargement)"): "OTC label wording is a caution ('ask a doctor before use if you have trouble urinating due to an enlarged prostate'), i.e. risk in men with BPH, rather than a listed adverse-reaction rate.",
    ("urinary", "First-generation antihistamines (retention)"): "Chlorpheniramine evidence is the OTC caution for men with enlarged prostate; diphenhydramine label lists urinary frequency, difficult urination and retention as adverse reactions.",
    ("urinary", "Diuretics (frequency/urgency)"): "Increased urine output is the intended pharmacological effect (label term 'diuresis'); furosemide label also warns about acute urinary retention in people with bladder-emptying problems.",
    ("urinary", "Antipsychotics (retention/incontinence)"): "Label evidence found concerns anticholinergic urinary retention (caution in pre-existing retention/prostatic hypertrophy); incontinence was not confirmed in the labels checked.",
    ("confusion", "Sulfonylureas (via hypoglycaemia)"): "Glimepiride label: hypoglycaemia may impair the ability to concentrate and react. 'Confusion' itself was not found in the sulfonylurea labels checked (glipizide/glyburide labels describe hypoglycaemia without listing symptoms). Treat as a hypoglycaemia-mediated, related-term association.",
    ("cough", "Non-selective beta-blockers (bronchospasm; cough itself not named in label)"): "UNVERIFIED for cough specifically: the propranolol label warns about bronchospasm in bronchospastic lung disease (asthma/COPD) but does not name cough. Keep as a low-priority prompt.",
    ("falls", "Gabapentinoids"): "Labels list 'accidental injury' (gabapentin PHN trials 3% vs 1% placebo; pregabalin trials) rather than 'fall'; class-level fall evidence comes from guidelines (see guidelineEvidence).",
    ("falls", "Opioids"): "FDA opioid labels checked do not use the word 'fall'; fall risk is established at class level by CDC STEADI, STOPPFall and AGS Beers 2023 (see guidelineEvidence).",
    ("falls", "Alpha-1 blockers"): "Labels warn of postural hypotension and syncope (and advise avoiding situations where injury could result) but do not use the word 'fall'; class-level evidence from STOPPFall and Beers 2023 (see guidelineEvidence).",
    ("dry_mouth", "Thiazide diuretics (fluid/electrolyte imbalance sign)"): "Label lists dryness of mouth and thirst as warning signs of fluid/electrolyte imbalance (a sign to report), not as a direct drug effect.",
    ("ankle_swelling", "Direct vasodilators"): "Labels describe sodium/fluid retention and (generalised or local) oedema; minoxidil is normally co-prescribed with a diuretic for this reason.",
}
BEERS_XREF = {
    "confusion": ["t3-delirium", "t3-dementia"],
    "falls": ["t3-falls-fractures"],
    "dizziness": ["t3-syncope"],
    "urinary": ["t3-luts-bph", "t3-urinary-incontinence-women"],
    "ankle_swelling": ["t3-heart-failure-caution", "t3-heart-failure-hfref-avoid"],
}
SEE_ALSO = {
    "confusion": "acb-scale.json (total ACB >= 3) and beers-2023.json Table 7 strong anticholinergics; Beers 2023 drug-disease criteria for delirium and dementia are cross-referenced in beers2023DrugDisease.",
    "falls": "frids.json is the authority for falls (CDC STEADI, STOPPFall, Beers 2023). FDA label text rarely uses the word 'fall'; absence of a label hit does NOT mean a class is safe.",
    "dizziness": "frids.json (orthostatic-hypotension classes) and the STEADI-Rx orthostatic BP check (supine 5 min, then standing at 1 and 3 min).",
    "urinary": "cascades.json (e.g. cholinesterase inhibitor -> bladder antimuscarinic; diuretic -> overactive-bladder drug; alpha-blocker -> incontinence).",
    "ankle_swelling": "cascades.json (CCB -> loop diuretic; gabapentinoid -> diuretic) - the most common prescribing-cascade prompts for this symptom.",
    "cough": "cascades.json (ACE inhibitor -> cough remedy).",
}
STATUS = {
    "exact": "LABELLED: the symptom term appears in current FDA label text (adverse reactions / warnings / precautions) for at least one representative drug.",
    "related": "RELATED TERM ONLY: a closely related or mechanism term was found in the FDA label text checked, but not the symptom word itself (see hits and note).",
    "none": "NOT FOUND in the FDA label text checked for the representative drugs.",
}

syms = tmp["_tmp"]
for s in syms:
    sid = s["id"]
    s["relatedCascades"] = [c["id"] for c in casc["cascades"] if sid in c.get("diarySymptoms", [])]
    s["relatedFridClasses"] = [c["id"] for c in frid["classes"] if sid in c.get("diarySignalsToWatch", [])]
    if sid in BEERS_XREF:
        s["beers2023DrugDisease"] = [{"id": i, "condition": DDI[i]["condition"], "recommendation": DDI[i].get("recommendation"),
                                      "classes": [c["class"] for c in DDI[i]["drugsOrClasses"]]} for i in BEERS_XREF[sid]]
    if sid in SEE_ALSO: s["seeAlso"] = SEE_ALSO[sid]
    for c in s["drugClasses"]:
        lvl = c["labelEvidenceLevel"]
        st = STATUS[lvl]
        if lvl == "none" and c.get("medlineplusEvidence"):
            st += " Listed in NLM MedlinePlus consumer drug information (see medlineplusEvidence)."
        c["status"] = st
        # cross-links per representative generic
        xl = []
        for g in c["representativeGenerics"]:
            lx = LEX.get(g, {})
            xl.append({"generic": g, "acbScore": ACB.get(g), "beersEntryIds": lx.get("beersEntryIds", []), "fridClasses": FRID_EX.get(g, [])})
        c["crossLinks"] = xl
        # back-compat: trim snippets / private keys
        for e in c["labelEvidence"]:
            for h in e.get("hits", []):
                h["snippet"] = h["snippet"][:260]
        if (sid, c["drugClass"]) in CLASS_NOTES:
            c["note"] = CLASS_NOTES[(sid, c["drugClass"])]
        if sid == "falls":
            base = None
            for k in FALLS_GUIDE:
                if c["drugClass"] == k: base = k
            if base is not None:
                ge = []
                for fid in FALLS_GUIDE[base]:
                    fc = FRID_BY_ID[fid]
                    ge.append({"fridClassId": fid, "name": fc["name"], "stoppFall2021": fc.get("stoppFall"),
                               "cdcSteadi": fc.get("cdcSteadi"), "beers2023HistoryOfFalls": fc.get("beers2023HistoryOfFalls"),
                               "sourceCount": fc.get("sourceCount")})
                c["guidelineEvidence"] = ge
                if base in FALLS_GUIDE_NOTE: c["guidelineNote"] = FALLS_GUIDE_NOTE[base]
                if lvl != "exact" and ge:
                    c["status"] += " Class-level fall-risk evidence from guidelines: " + "; ".join(
                        f"{g['name']} (named by {g['sourceCount']} sources in frids.json)" for g in ge) + "."
        if lvl == "none" and not c.get("medlineplusEvidence") and not c.get("guidelineEvidence"):
            c["status"] = "UNVERIFIED: " + c["status"]
    lv = [c["labelEvidenceLevel"] for c in s["drugClasses"]]
    s["coverage"] = {"classesListed": len(lv), "labelled": lv.count("exact"), "relatedTermOnly": lv.count("related"), "notFoundInLabel": lv.count("none")}

allc = [(s["id"], c) for s in syms for c in s["drugClasses"]]
doc = {
    "id": "symptom-adr-map",
    "title": "Caregiver-diary symptoms -> drug classes with labelled adverse effects (older-adult medication review)",
    "compiled": "2026-10-10",
    "purpose": "Lets MedWatch say, for a symptom logged in the diary, which of the person's medicines are known (from FDA labelling) to list that symptom as a possible side effect - as a discussion prompt for the clinician/pharmacist, never as a causal claim.",
    "method": {
        "summary": "For each diary symptom we list drug classes commonly implicated in older adults (class choice guided by AGS Beers 2023, STOPPFall, CDC STEADI and geriatric pharmacology), then check 1-6 representative generics against current FDA Structured Product Labeling via the openFDA drug-label API. Every regex match in the boxed warning, adverse reactions, warnings/precautions, geriatric use and OTC 'when using / stop use / ask a doctor' sections is examined and classified.",
        "hitClassification": {
            "termMatch": "'exact' = the symptom's core term (coreTermRegex) appears; 'related' = only a mechanism/near-synonym term (e.g. 'syncope', 'thinking abnormal', 'diuresis', 'accidental injury', 'bronchospasm').",
            "contextFlags": "The sentence (or nearby table cells) around a match is checked for contexts that make it weak evidence of an ongoing-use side effect: serotonin syndrome, adrenal insufficiency, hepatotoxicity, overdose, hypersensitivity/angioedema, hyperglycaemia, withdrawal/discontinuation, pancreatitis, NMS, MAOI interaction, paediatric-only statements, interaction-only statements, lactic acidosis, alcohol reactions. Flagged matches are never counted as evidence; for each drug the best clean hit per section is kept (max 3).",
            "geriatricUseLabelMention": "Generics whose label mentions the symptom in its Geriatric Use subsection (8.5) - direct older-adult labelling evidence.",
            "labelEvidenceLevel": "Per class: 'exact' if any representative drug has a clean exact hit; 'related' if only clean related-term hits; 'none' otherwise.",
        },
        "labelSelection": "openFDA search on openfda.generic_name, preferring single-ingredient human prescription labels with an adverse-reactions section, then the most recent effective date. Labels are often generic manufacturers' SPLs; brand labels may differ slightly. Each hit stores SPL set id, DailyMed link, effective date, section, matched term and a snippet so a reviewer can check it.",
        "fallback": "If no exact label hit, NLM MedlinePlus consumer drug information (resolved via MedlinePlus Connect from the RxNorm RxCUI) is searched with the same rules and stored as medlineplusEvidence.",
        "limitations": [
            "A label listing an adverse reaction does not mean the drug caused a given person's symptom; trial frequencies and placebo rates are not captured as structured data (they are often visible in the snippet).",
            "Representative drugs stand in for classes; individual agents differ (e.g. peripheral oedema is mostly a dihydropyridine-CCB effect; verapamil is the CCB most associated with constipation).",
            "Older-adult specificity comes from the class choice (Beers/STOPPFall/STEADI) and crossLinks, not from the labels, which describe the general adult population.",
            "Regex classification can still miss negated statements (e.g. 'no increase in X'); snippets are stored for human review.",
            "Labels rarely use the word 'fall'; frids.json is the authority for falls.",
        ],
        "snomed": "Codes verified with tx.fhir.org CodeSystem/$lookup against SNOMED CT International Edition 20250201 (all active on 2026-10-10). display = preferred term; fsn = fully specified name. Production use of SNOMED CT requires a licence (free in IHTSDO member countries such as the US via the NLM UMLS licence).",
    },
    "sources": [
        {"id": "openfda", "citation": "U.S. FDA. openFDA drug label API (Structured Product Labeling).", "url": "https://open.fda.gov/apis/drug/label/", "accessed": "2026-10-10"},
        {"id": "dailymed", "citation": "NLM DailyMed (labels referenced by SPL set id in each hit).", "url": "https://dailymed.nlm.nih.gov/dailymed/"},
        {"id": "medlineplus", "citation": "NLM MedlinePlus drug information via MedlinePlus Connect.", "url": "https://medlineplus.gov/medlineplus-connect/web-service/"},
        {"id": "rxnav", "citation": "NLM RxNav RxNorm API (RxCUI for each representative generic).", "url": "https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html"},
        {"id": "txfhir", "citation": "HL7 FHIR terminology server tx.fhir.org, SNOMED CT International Edition 20250201.", "url": "https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=404640003"},
        {"id": "beers2023", "citation": "2023 AGS Beers Criteria Update Expert Panel. J Am Geriatr Soc. 2023;71(7):2052-2081. doi:10.1111/jgs.18372", "pmid": "37139824", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12478568/"},
        {"id": "stoppfall2021", "citation": "Seppala LJ et al. STOPPFall (Screening Tool of Older Persons Prescriptions in older adults with high fall risk): a Delphi study by the EuGMS Task and Finish Group on Fall-Risk-Increasing Drugs. Age Ageing. 2021;50(4):1189-1199.", "pmid": "33349863", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC8244563/"},
        {"id": "cdcSteadi", "citation": "CDC STEADI. Medications Linked to Falls (fact sheet), 2017.", "url": "https://www.cdc.gov/steadi/media/pdfs/STEADI-FactSheet-MedsLinkedtoFalls-508.pdf"},
        {"id": "acb2012", "citation": "Aging Brain Care. Anticholinergic Cognitive Burden Scale, 2012 Update.", "url": "https://www.hii.iu.edu/resources/anticholinergic-cognitive-burden-scale.pdf"},
    ],
    "fhirHint": {"resource": "Observation", "category": "survey", "code": "SNOMED CT concept from snomed[] (role 'primary' or the most specific match)",
                 "valueCodeableConcept": "present/absent via SNOMED 52101004 |Present| / 2667000 |Absent| (both verified active qualifier values via tx.fhir.org, SNOMED CT International 20250201)",
                 "note": "Use Observation.effectiveDateTime for the diary day; keep the free-text utterance in Observation.note; link a suspected medicine with Observation.focus or a separate AdverseEvent only after clinician review."},
    "engineGuidance": {
        "language": "Say 'X is listed on its FDA label as a possible cause of <symptom> (source)'. Never say X caused the symptom. Combine with timing from the diary (e.g. 'dizziness was logged on 9 of 14 days after X was started; 2 of 14 before').",
        "ranking": "Rank classes for a logged symptom by: labelEvidenceLevel exact > related > none-with-guideline/MedlinePlus; then whether the person's drug is a Beers PIM / FRID / ACB >= 2 (crossLinks); then recency of start or dose change.",
        "matching": "Match the person's medicines to classes by ingredient (RxNorm RxCUI or generic); representativeGenerics are examples, not the full class.",
    },
    "coverage": {
        "symptoms": len(syms),
        "classPairs": len(allc),
        "labelled": sum(1 for _, c in allc if c["labelEvidenceLevel"] == "exact"),
        "relatedTermOnly": [f"{sid} / {c['drugClass']}" for sid, c in allc if c["labelEvidenceLevel"] == "related"],
        "notFoundInLabel": [f"{sid} / {c['drugClass']}" + (" (MedlinePlus)" if c.get("medlineplusEvidence") else "") + (" (guideline evidence)" if c.get("guidelineEvidence") else "") for sid, c in allc if c["labelEvidenceLevel"] == "none"],
        "classesWithGeriatricUseLabelMention": [f"{sid} / {c['drugClass']} ({', '.join(c['geriatricUseLabelMention'])})" for sid, c in allc if c.get("geriatricUseLabelMention")],
        "representativeLabelsChecked": len({e["splSetId"] for _, c in allc for e in c["labelEvidence"] if e.get("splSetId")}),
        "snomedCodes": sum(len(s["snomed"]) for s in syms),
        "snomedVerified": sum(1 for s in syms for x in s["snomed"] if x["verified"]),
    },
    "index": {s["id"]: [{"drugClass": c["drugClass"], "level": c["labelEvidenceLevel"], "generics": c["representativeGenerics"],
                         "guideline": bool(c.get("guidelineEvidence"))} for c in s["drugClasses"]] for s in syms},
    "symptoms": syms,
}
json.dump(doc, open(R + "symptom-adr-map.json", "w"), indent=1, ensure_ascii=False)
print(json.dumps(doc["coverage"], indent=1))
