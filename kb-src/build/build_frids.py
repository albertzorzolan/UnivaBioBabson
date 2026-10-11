import sys, json
sys.path.insert(0, '.')
import apis, labels
from brandcheck import brand_check
from frid_data import FRID, STOPPFALL_NO_CONSENSUS, DEPRESCRIBE
from concurrent.futures import ThreadPoolExecutor
OUT = "/private/tmp/claude-501/-Users-mb-pro-Desktop-UnivaBio-Hackathon/c6caa03c-8210-4b85-9270-2eab2bd171d9/scratchpad/research/frids.json"
pairs = [(g, b) for c in FRID for g, bs in c["examples"] for b in bs]
with ThreadPoolExecutor(4) as ex:
    BC = dict(zip(pairs, ex.map(lambda p: brand_check(*p), pairs)))
gens = sorted({g for c in FRID for g, _ in c["examples"]})
RXN = {"valproate": "valproic acid", "insulin glargine": "insulin glargine"}
with ThreadPoolExecutor(6) as ex:
    RX = dict(zip(gens, ex.map(lambda g: apis.rxcui(RXN.get(g, g)), gens)))
# selected label facts used in notes
facts = {}
for g, pat, key in [("tamsulosin", r"alpha\s*1A|α1A|alpha1A", "tamsulosin_alpha1A"), ("silodosin", r"alpha[\s-]*1A|α[\s-]*1A|α1A|selective", "silodosin_alpha1A"),
                    ("clonidine", r"rebound|withdrawal|abrupt", "clonidine_withdrawal"), ("quetiapine", r"\bfalls\b", "quetiapine_falls"),
                    ("gabapentin", r"\bfall\b|\bfalls\b|accidental injury", "gabapentin_falls"), ("sertraline", r"can lead to falls|falls", "sertraline_falls")]:
    r = labels.best_label(g)
    if r:
        hits = labels.find(r, pat, labels.SECTIONS + ["clinical_pharmacology", "mechanism_of_action", "dosage_and_administration"])
        facts[key] = {"generic": g, **labels.label_meta(r), "matched": bool(hits), "hits": hits[:2]}
classes = []
for c in FRID:
    ex = []
    for g, bs in c["examples"]:
        brands = []
        for b in bs:
            bc = BC[(g, b)]
            if bc["status"].startswith("verified"): brands.append(bc)
            else: print("drop brand", g, b, bc["status"], file=sys.stderr)
        ex.append({"generic": g, "rxnorm": RX[g], "brands": brands})
    o = {"id": c["id"], "name": c["name"],
         "stoppFall": ({"class": c["stoppfall"], "consensusRound": c["stoppfallRound"]} if c["stoppfall"] else None),
         "cdcSteadi": {"medsLinkedToFalls2017": c["src"].get("cdc2017"), "steadiRxChecklist2019": c["src"].get("rxChecklist"), "steadiRxGuide2020": c["src"].get("rxGuide")},
         "beers2023HistoryOfFalls": c["src"].get("beers2023Falls"),
         "subclassRiskNotes": c["subclass"],
         "deprescribing": DEPRESCRIBE.get(c["id"]),
         "diarySignalsToWatch": c["diary"],
         "examples": ex}
    if c.get("note"): o["note"] = c["note"]
    o["sourceCount"] = sum(1 for v in [o["stoppFall"], c["src"].get("cdc2017"), c["src"].get("rxChecklist"), c["src"].get("rxGuide"), c["src"].get("beers2023Falls")] if v)
    classes.append(o)
doc = {
 "id": "frids", "title": "Fall-risk-increasing drugs (FRIDs): CDC STEADI / STEADI-Rx, EuGMS STOPPFall and AGS Beers 2023 crosswalk",
 "compiled": "2026-10-10", "compiledBy": "MedWatch research (UnivaBio hackathon); class lists transcribed from primary sources, deprescribing guidance paraphrased (not verbatim), brands verified via RxNorm/openFDA.",
 "sources": [
  {"id": "cdcMedsLinkedToFalls", "citation": "CDC STEADI. Medications Linked to Falls (fact sheet), 2017.", "url": "https://www.cdc.gov/steadi/media/pdfs/STEADI-FactSheet-MedsLinkedtoFalls-508.pdf", "alsoAt": "https://www.cdc.gov/steadi/pdf/STEADI-FactSheet-MedsLinkedtoFalls-508.pdf", "accessed": "2026-10-10",
   "content": {"psychoactive": ["Anticonvulsants", "Antidepressants (TCAs and SSRIs)", "Antipsychotics", "Benzodiazepines", "Opioids", "Sedative-hypnotics (eszopiclone, zaleplon, zolpidem)"],
               "otherCausingDizzinessSedationConfusionBlurredVisionOrOrthostaticHypotension": ["Anticholinergics", "Antihistamines", "Medications affecting blood pressure", "Muscle relaxants"],
               "actions": ["STOP medications when possible", "SWITCH to safer alternatives", "REDUCE to the lowest effective dose", "Develop a monitoring plan and use non-drug strategies"],
               "scope": "Review prescription, OTC and herbal products for all patients 65+"}},
  {"id": "cdcSAFE", "citation": "CDC STEADI. SAFE Medication Review Framework (fact sheet), 2017.", "url": "https://www.cdc.gov/steadi/media/pdfs/STEADI-FactSheet-SAFEMedReview-508.pdf",
   "content": {"steps": ["Screen for medications that may increase fall risk", "Assess the patient to manage health conditions (goals, side effects, preferences, barriers)", "Formulate a medication action plan (stop, switch, reduce, simplify, monitor)", "Educate patient and caregiver"]}},
  {"id": "steadiRxPage", "citation": "CDC. Pharmacy Care (STEADI-Rx). Page updated Aug 3, 2025.", "url": "https://www.cdc.gov/steadi/hcp/clinical-resources/pharmacy-care.html"},
  {"id": "steadiRxChecklist", "citation": "STEADI-Rx Community Pharmacy Fall Risk Checklist (UNC Eshelman School of Pharmacy / CDC), 2019.", "url": "https://www.cdc.gov/steadi/pdf/provider/steadi-rx/STEADIRx_pharmacy_fallrisk_checklist-508.pdf",
   "content": {"medicationClassesWithFallRisk": ["Anticonvulsants", "Antidepressants", "Antihypertensives", "Antipsychotics", "Antispasmodics", "Benzodiazepines", "Opioids", "Sedative hypnotics", "Tricyclic antidepressants", "Other (e.g., OTC agents)"],
               "screeningQuestions": ["Any falls in the past year?", "Worries about falling?", "Feels unsteady when standing or walking?", "Lightheadedness or dizziness from lying to standing?"]}},
  {"id": "steadiRxGuide", "citation": "STEADI-Rx: Older Adult Fall Prevention Guide for Community Pharmacists (CDC/UNC), 2020, 32 pp.", "url": "https://www.cdc.gov/steadi/pdf/Steadi-Implementation-Plan-508.pdf",
   "content": {"classesNamedInIntroduction": ["anticonvulsants", "antidepressants", "antihistamines", "antihypertensives", "antipsychotics", "benzodiazepines", "muscle relaxants", "opioids", "sedative hypnotics"],
               "screenWho": "Adults >=65 taking >=4 chronic medications or >=1 high-risk medication, or presenting with an acute fall; screen yearly.",
               "threeKeyQuestions": ["Fallen in the past year?", "Unsteady when standing or walking?", "Worried about falling?"],
               "orthostaticCheck": "Lie down 5 minutes and measure BP; stand and re-measure at 1 and 3 minutes.",
               "claimedEffect": "The guide states that reducing medications whose risks outweigh benefits may reduce falls by 39-66% (citing Gillespie 2012 Cochrane and Pit 2007); this is CDC's summary, not independently re-checked here (UNVERIFIED)."}},
  {"id": "steadiRxConsultForm", "citation": "STEADI-Rx Provider Consult - Medication form, 2019.", "url": "https://www.cdc.gov/steadi/pdf/provider/steadi-rx/STEADIRx_provider_consult_medication_form-508.pdf",
   "note": "Template for pharmacist-to-prescriber communication: fall risk factors (falls in past year, worry, unsteadiness, orthostatic symptoms, >=4 chronic meds, >=1 high-risk med) + 'Medication Therapy Problem / Recommendation / Accept-Decline-Discuss'. Useful model for the MedWatch clinician brief."},
  {"id": "stoppfall2021", "citation": "Seppala LJ, Petrovic M, Ryg J, et al. STOPPFall (Screening Tool of Older Persons Prescriptions in older adults with high fall risk): a Delphi study by the EuGMS Task and Finish Group on Fall-Risk-Increasing Drugs. Age Ageing. 2021;50(4):1189-1199.", "pmid": "33349863", "doi": "10.1093/ageing/afaa249", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC8244563/", "license": "CC BY-NC-ND 4.0 (per PMC record) - content here is paraphrased.",
   "content": {"method": "3 Delphi rounds, 24 panellists from 13 European countries (2019-2020), 70% agreement threshold.", "classesIncluded": 14, "classesNoConsensus": 17,
               "onlineDecisionTrees": "https://kik.amc.nl/falls/decision-tree/", "decisionTreesAppendix": "Appendix IV-V of the article supplement (Europe PMC supplementary files)"}},
  {"id": "beers2023", "citation": "2023 American Geriatrics Society Beers Criteria Update Expert Panel. J Am Geriatr Soc. 2023;71(7):2052-2081.", "pmid": "37139824", "doi": "10.1111/jgs.18372", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12478568/",
   "content": {"criterion": "Drug-disease interaction: history of falls or fractures", "drugs": ["Anticholinergics (Table 7)", "Antidepressants: SNRIs, SSRIs, TCAs", "Antiepileptics", "Antipsychotics", "Benzodiazepines", "Z-drugs (eszopiclone, zaleplon, zolpidem)", "Opioids"],
               "recommendation": "Avoid unless safer alternatives are not available; antiepileptics: avoid except for seizure and mood disorders; opioids: avoid except for pain management in severe acute pain. If one must be used, reduce other CNS-active drugs and use other fall-prevention strategies.",
               "qualityOfEvidence": "Antidepressants and opioids: moderate; all others: high", "strength": "Strong"}},
  {"id": "seppala2018meta", "citation": "de Vries M, Seppala LJ, et al. JAMDA 2018;19:371.e1-9 (cardiovascular); Seppala LJ, et al. JAMDA 2018;19:371.e11-17 (psychotropics); Seppala LJ, et al. JAMDA 2018;19:372.e1-8 (others).", "note": "The three meta-analyses that informed STOPPFall (cited as refs 2-4 in the STOPPFall paper); not re-read in this session."},
  {"id": "rxnav", "citation": "NLM RxNav (RxNorm) REST API, queried 2026-10-10 for ingredient RxCUIs and brand -> ingredient verification.", "url": "https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html"},
  {"id": "openfda", "citation": "openFDA drug label API, queried 2026-10-10.", "url": "https://open.fda.gov/apis/drug/label/"}
 ],
 "stoppFallNoConsensusClasses": STOPPFALL_NO_CONSENSUS,
 "stoppFallGeneralDeprescribing": DEPRESCRIBE["_always"],
 "labelFacts": facts,
 "engineGuidance": {
   "flagRule": "Flag a medication as a FRID if it belongs to any class below; show which sources name the class (sourceCount) so the brief can say e.g. 'named by CDC STEADI and STOPPFall'.",
   "priorityHint": "Classes named by >=3 sources (benzodiazepines, Z-drugs, antipsychotics, opioids, antidepressants, antiepileptics) are the core psychoactive FRIDs; >=2 FRIDs or any FRID plus a reported fall/near-fall/dizziness is the strongest discussion prompt (MedWatch heuristic, not a validated score).",
   "steadiRxScreenTrigger": "Per STEADI-Rx, screen when age >=65 and (>=4 chronic medications or >=1 high-risk medication) or an acute fall.",
   "noCausalClaims": "FRID status is a population-level association; MedWatch must describe timing and counts only."
 },
 "classes": classes,
}
json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
print("wrote", OUT, len(classes), file=sys.stderr)
