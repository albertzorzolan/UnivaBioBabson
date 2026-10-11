# ACB / FRID / Prescribing-cascade / Symptom-ADR knowledge bases: coverage, sources, caveats

Compiled 2026-10-10 for MedWatch (UnivaBio hackathon). All four JSON files are in the same folder:

| File | What it holds | Size of coverage |
|---|---|---|
| `acb-scale.json` | Anticholinergic Cognitive Burden scale, 2012 update | 99 drugs (44 score 1, 12 score 2, 43 score 3), plus 7 reviewed-not-added (score 0) and 3 Beers-2023 strong anticholinergics missing from ACB |
| `frids.json` | Fall-risk-increasing drugs: CDC STEADI / STEADI-Rx, EuGMS STOPPFall, AGS Beers 2023 crosswalk | 17 classes (14 STOPPFall + muscle relaxants + other antihypertensives + sulfonylureas/insulin), 109 example generics, 17 STOPPFall no-consensus classes |
| `cascades.json` | Prescribing cascades | 71 cascades: all 65 of the 2025 PIPC consensus list, the 9 ThinkCascades (3 of them not on PIPC), 3 other documented cascades; Ontario 2022-23 PSSA statistics for all 65 PIPC entries; 24 flagged "prioritised" |
| `symptom-adr-map.json` | 12 diary symptoms -> drug classes with FDA-label evidence + SNOMED CT codes | 140 symptom-class pairs (132 with the symptom term in current FDA label text, 5 related term only, 3 not in label); 120 distinct FDA labels checked; 27 pairs with a Geriatric Use (8.5) label mention; 43 SNOMED CT codes, all verified active |

Build scripts are in `scratchpad/kbbuild/` and can be re-run; API responses are cached there. They are `build_acb.py`, `build_frids.py`, `build_casc.py`, and `build_sym2.py` followed by `finalize_sym2.py` for the symptom map. `build_sym.py`/`finalize_sym.py` are an earlier version that has been replaced.

## 1. ACB scale (`acb-scale.json`)

**Primary source:** the official 2-page Aging Brain Care card "Anticholinergic Cognitive Burden Scale, 2012 Update" (Regenstrief Institute / Indiana University), read from https://www.hii.iu.edu/resources/anticholinergic-cognitive-burden-scale.pdf. The old host agingbraincare.org did not respond. The 2012 changes match the JAGS 2013 abstract (Campbell et al., S142-S143): 10 drugs added at score 1, 1 at score 2 (nefopam), 5 at score 3 (doxylamine, fesoterodine, propiverine, solifenacin, trospium). Seven drugs were reviewed and not added: fexofenadine, gabapentin, topiramate, levetiracetam, tamoxifen, nizatidine, duloxetine.

**Each drug record holds:** generic, ACB score and category, therapeutic class, an added-in-2012 flag, a Beers-2023 "strong anticholinergic" flag, RxNorm ingredient RxCUI (all 99 resolved), brands, MedlinePlus link (91 of 99), match terms, and notes.

**Brand verification:** every brand was checked against RxNorm (brand concept -> ingredient) with an openFDA SPL fallback. Brands printed on the card that no longer resolve are kept and marked "not-found". MedWatch-added brands were kept only if they verified. For the drop list see `kbbuild/acb_build.log`.

**Interpretation (with citations in the file):**
- acbcalc.com: a total of 3 or more is associated with more cognitive impairment and higher mortality.
- EPIC-Norfolk (Myint 2015, PMID 25430550): ACB >= 3 vs 0 had an adjusted mortality HR of 1.83 (1.53-2.20) and a CVD HR of 2.17.
- Campbell 2010 (PMID 20625168): each definite anticholinergic gave an OR of 1.46 for 6-year cognitive impairment.
- Fox 2011 (PMID 21707557): definite anticholinergics gave a 0.33-point greater MMSE decline over 2 years. 2-year mortality OR was 1.68 for definite and 1.56 for possible.
- Pasina 2013: dose-response with cognition.
- Coupland 2019: dementia risk with strong anticholinergics.
- The card's claim of "+26% death risk per point" is not in the Fox 2011 abstract and is marked UNVERIFIED.

**Alternative scales noted:**
- ARS (Rudolph 2008)
- ADS (Carnahan 2006)
- CRIDECO/CALS (Ramos 2022; 217 drugs)
- GABS (Kiesel 2018)
- The Lisibach 2021 systematic review of 19 scales (ACB and GABS rated highest quality; outcome results conflict)
- Beers 2023 Table 7

**Caveats and decisions:**
- **Licence:** the card is copyright Regenstrief Institute and says use must follow its Terms of Use (contact acb@agingbraincare.org). This is fine for a non-commercial hackathon demo with attribution. Get permission before any commercial use. This is our reading, not legal advice.
- **Card errors corrected or flagged:**
  - The card prints "Diuril" for chlorthalidone. RxNorm maps Diuril to chlorothiazide, so it is excluded.
  - "Immodium" is a misspelling.
  - "Codeine Contin" is a Canadian brand.
  - Cortaid is an OTC topical, but the scale is applied to systemic drugs.
- **Zantac safety trap:** RxNorm still maps "Zantac" to ranitidine, which FDA withdrew on 2020-04-01. Today's "Zantac 360" is famotidine, which is not on the ACB. "zantac" is therefore an ambiguous term and is not used to match ranitidine.
- **Beers 2023 Table 7 disagrees with ACB** on clidinium (ACB 1), cyclobenzaprine (2) and cyproheptadine (2). It also lists prochlorperazine, triprolidine and homatropine, which the ACB does not. These are flagged separately, and no ACB score is invented for them.
- **Dose:** the scale ignores dose. Low-dose doxepin (6 mg or less) is considered placebo-like by Beers, but the ACB card does not separate doses.
- **MedWatch scoring rules (our own, labelled as such):** score systemic products only, score each ingredient of a combination product, and count a duplicate ingredient once.

## 2. FRIDs (`frids.json`)

**Sources read in full:**
- CDC "Medications Linked to Falls" fact sheet (2017). This is still the current CDC link.
- CDC SAFE Medication Review framework (2017).
- STEADI-Rx Community Pharmacy Fall Risk Checklist (2019). Its 9 classes plus OTC: anticonvulsants, antidepressants, antihypertensives, antipsychotics, antispasmodics, benzodiazepines, opioids, sedative hypnotics, TCAs.
- STEADI-Rx Guide for Community Pharmacists (2020). It sets the screening trigger: age 65 or over with 4 or more chronic meds, or at least 1 high-risk med, or an acute fall. It also gives the orthostatic BP protocol.
- The STEADI-Rx Provider Consult - Medication form. Its "Medication Therapy Problem / Recommendation / Accept-Decline-Discuss" layout is a ready-made template for the MedWatch clinician brief.
- STOPPFall (Seppala 2021, Age Ageing, PMC8244563) full text and supplementary Appendix IV-V. This covers:
  - the 14 classes with their Delphi consensus round
  - 18 statements about which subclasses carry more risk (TCAs, strong opioids, loop diuretics, non-selective alpha-blockers, first-generation antihistamines, older antiepileptics, sulfonylureas)
  - Table 2 deprescribing guidance: when to consider withdrawal, whether stepwise withdrawal is needed, and what to monitor
  - taper examples from the decision trees
- The 17 no-consensus classes: antiparkinson drugs, beta-blockers, cardiac glycosides, oral hypoglycaemics, CCBs, beta-blocker eye drops, chemotherapy, bolus vitamin D, ACE inhibitors, laxatives, corticosteroids, antiarrhythmics, AChEIs, fluoroquinolones, PPIs, nootropics, NSAIDs.
- AGS Beers 2023 "history of falls or fractures" criterion.

**Each class record holds:** the STOPPFall class and round, CDC wording, Beers wording, subclass notes, paraphrased deprescribing guidance, diary symptoms to watch (these link to `symptom-adr-map.json` ids), and example generics with RxCUI and verified brands. `sourceCount` says how many sources name the class.

**Caveats:**
- STOPPFall guidance is paraphrased because the article is CC BY-NC-ND.
- Several mappings are MedWatch interpretations and are labelled as such:
  - prochlorperazine counted as an antipsychotic
  - gabapentinoids counted as antiepileptics
  - "vasodilators used in cardiac diseases" mapped to nitrates (ATC C01D)
  - mirabegron assumed lower-risk than antimuscarinics
- CDC's claim that deprescribing reduces falls by 39-66% is quoted as CDC's statement and marked UNVERIFIED.
- STOPPFall itself notes that deprescribing FRIDs on its own has uncertain effect on falls. It should be one part of a multifactorial fall-prevention plan.

## 3. Prescribing cascades (`cascades.json`)

**Sources:**
- **PIPC list (Rochon 2025, Eur Geriatr Med, PMC12712104).** 65 potentially inappropriate cascades, parsed directly from the JATS XML table. Licensed CC BY 4.0 after the 2026 correction.
- **ThinkCascades (McCarthy 2022, Drugs Aging, PMC9477172).** The final 9 cascades were read from the Table 3 image. Round 1 and Round 3 ratings come from Table 2.
- **Rochon 2026 BMJ (e100499).** Population PSSA in 2.3 million Ontario adults aged 66 and over, with a 1-year window. It gives the adjusted sequence ratio (aSR) for all 65 PIPC entries and the 24 "prioritised" cascades. Tables 3 and 4 were transcribed.
- **Primary studies attached as evidence, with their time windows:**

| Cascade | Studies (time window) |
|---|---|
| CCB -> diuretic | Savage 2020 (90 d), Vouri 2019 (360 d), Rochon 2024 (90 d; HR 1.21 for ED visits and admissions) |
| ACEi -> antitussive | Vegter 2010 (about 6 months; aSR 2.2) |
| NSAID -> antihypertensive | Gurwitz 1994 (OR 1.66, dose-response) |
| ChEI -> bladder antimuscarinic | Gill 2005 (HR 1.55), Masurkar 2021 (6 months), Tucker 2026 (60 d) |
| Metoclopramide -> levodopa | Avorn 1995 JAMA (OR 3.09) |
| Neuroleptic -> antiparkinsonian | Avorn 1995 AJM (90 d; OR 5.4), Kalish 1995 |
| Thiazide -> anti-gout | Gurwitz 1997 (up to 2 years; HCTZ-equivalent 25 mg/day or more) |
| Gabapentinoid -> diuretic | Read 2021 (90 d), Hayes 2026 (median 36 d), Growdon 2025 JAMA Netw Open |
| Loop diuretic -> urinary symptom meds | Growdon 2025 (6 months; no overall signal) |
| Beta-blocker -> loop diuretic | Vouri 2022 (90 d) |
| Background reviews | Doherty 2022 systematic review (cascades appear 3 months to 1 year after the first drug) |

**Each cascade record holds:**
- `indexDrugs[]` and `markerDrugs[]`, each with class, example generics and whether the source named the examples
- `adverseEvent`
- `diarySymptoms` (links to symptom ids)
- `plainLanguage`, written for caregivers and non-causal
- `clinicianNote`
- list membership
- `ontarioPSSA2022_23` (aSR, CI, population-signal flag, prioritised data)
- `evidence[]`
- `timeWindow` (study windows, and a suggested 365-day lookback)
- `sources`

Label facts used in clinician notes were confirmed in FDA labels and stored in `labelClaimChecks`. They are: amlodipine edema is dose-related, the DPP-4 arthralgia warning, the pioglitazone heart-failure boxed warning, digoxin toxicity causing nausea, tramadol serotonin syndrome, the metoclopramide tardive dyskinesia boxed warning, and others.

**Key findings for the product:**
- The strongest population signal is alpha-1 blocker -> vestibular suppressant such as meclizine (aSR 8.70). Others are corticosteroid -> antipsychotic (2.55), laxative -> antidiarrheal (2.53), ChEI -> antiemetic (2.24) and SGLT2 -> antifungal (2.12). CCB -> diuretic is 1.65 and prioritised, with an incidence of 7.5% a year.
- Several "classic" cascades showed **no** population-level signal in 2022-23 Ontario data. These are antipsychotic -> antiparkinsonian (0.80), metoclopramide-type -> antiparkinsonian (0.50), diuretic -> OAB (0.95; US VA data 0.74), diuretic -> anti-gout (0.82) and benzodiazepine -> ChEI (0.88). The engine should show these as individual-level discussion prompts at lower priority, not as established patterns.
- Not every cascade is inappropriate. These are marked with an `appropriatenessCaveat`:
  - NSAID -> PPI, which ThinkCascades excluded as usually appropriate
  - amiodarone -> levothyroxine
  - iron -> laxative
  - inhaled corticosteroid -> antifungal
- **Data quirk:** in PIPC row "PPI -> vitamin/mineral deficiency", the Drug B column says "Vitamin or Mineral Deficiency". The BMJ analysis labels it "vitamin or mineral supplement", and the file notes this.
- Class example lists are mostly MedWatch-illustrative, and each one is labelled with where it came from.

## 4. Symptom -> ADR map (`symptom-adr-map.json`)

**Covered symptoms (12):** dizziness, confusion, falls, fatigue, poor sleep, sleepiness, appetite/nausea, constipation, dry mouth, ankle swelling, cough and urinary. "Poor sleep" and "excessive sleepiness" are split because their drug classes differ.

**Each symptom record holds:**
- lay phrases, for the NLP extractor
- verified SNOMED CT codes
- a label-search regex and a core-term regex
- drug classes (6-19 per symptom), each with 1-6 representative generics checked against current FDA SPL through openFDA
- `relatedCascades`, `relatedFridClasses` and, where relevant, `beers2023DrugDisease`. These cross-reference Beers 2023 Table 3: delirium and dementia for confusion, falls/fractures, syncope for dizziness, LUTS/BPH and incontinence in women for urinary symptoms, and heart failure for ankle swelling.

**Each class holds:**
- `labelEvidenceLevel`: exact, related or none
- `status`, a sentence that says how strong the evidence is
- `geriatricUseLabelMention`: the generics whose label names the symptom in its Geriatric Use section
- `crossLinks`, giving each representative generic's ACB score, Beers entry ids and FRID classes, drawn from the other knowledge bases
- for falls, `guidelineEvidence` from frids.json (STOPPFall round, CDC wording, Beers wording, source count)

Each label check stores the SPL set id, DailyMed link, effective date, section, evidence type, matched term, `termMatch` (exact or related), `contextFlags` and a snippet. It also stores the RxCUI and a MedlinePlus link.

A top-level `index` gives a compact symptom -> classes view for the engine. `engineGuidance` sets out the wording, ranking and matching rules.

**How a label hit is chosen (build_sym2.py):** the script examines every regex match in the boxed warning, adverse reactions, warnings/precautions, geriatric use, specific-populations and OTC sections. It reads the sentence around each match, or the nearby cells if the match is in a table. A match is flagged and never counted as evidence if that text is about:
- serotonin syndrome
- adrenal insufficiency
- hepatotoxicity
- overdose
- angioedema or hypersensitivity
- hyperglycaemia
- withdrawal or discontinuation
- pancreatitis or NMS
- an MAOI interaction or an interaction-only statement
- a paediatric, pregnancy or lactation subsection

Hits in a Geriatric Use subsection are always kept. This replaced a first pass that took the first regex match per section. That pass produced false positives, which a manual review of every hit then caught:
- olanzapine "appears to fall on a continuum"
- ropinirole "a fall in blood pressure"
- MedlinePlus gabapentin "difficulty falling asleep"
- gabapentin "angioedema" counted as ankle swelling
- antipsychotic "polyuria" in a hyperglycaemia sentence
- SSRI neonatal "vomiting"

**SNOMED CT:** all codes were verified with `CodeSystem/$lookup` on tx.fhir.org against SNOMED CT International 20250201, and all are active. Primary codes:

| Symptom | Code |
|---|---|
| Dizziness | 404640003 |
| Lightheadedness | 386705008 |
| Postural dizziness | 103017008 |
| Confusional state | 286933003 |
| Memory impairment | 386807006 |
| Fall (event) | 1912002 |
| Falls (finding) | 161898004 |
| Fatigue | 84229001 |
| Lack of energy | 248274002 |
| Insomnia | 193462001 |
| Difficulty sleeping | 301345002 |
| Drowsy | 271782001 |
| Excessive somnolence | 372947007 |
| Loss of appetite | 79890006 |
| Nausea | 422587007 |
| Constipation | 14760008 |
| Xerostomia (finding) | 87715008 |
| Ankle edema | 26237000 |
| Edema of lower extremity | 102572006 |
| Cough | 49727002 |
| Urinary incontinence | 165232002 |
| Urgent desire to urinate | 75088002 |
| Increased frequency of urination | 162116003 |
| Nocturia | 139394000 |
| Retention of urine | 267064002 |
| Difficulty passing urine | 102835006 |

No International concept for "near fall" was found, so the file uses Stumbling 82612009, Tripping 75941004 or Impairment of balance 387603000. That choice is labelled as ours.

The `fhirHint` field gives Present 52101004 and Absent 2667000 qualifiers for coding diary observations.

**Classes that are not "labelled" (8 of 140), all marked in the file:**

| Symptom / class | Evidence level | What the evidence actually is |
|---|---|---|
| confusion / sulfonylureas | related | The glimepiride label says hypoglycaemia can impair the ability to concentrate and react. "Confusion" is not in the glipizide or glyburide labels. The earlier MedlinePlus "mental confusion" hit described a reaction to alcohol, so it was rejected. |
| falls / gabapentinoids | related | Labels list "accidental injury" (gabapentin postherpetic-neuralgia trials: 3% vs 1% on placebo). Guideline evidence is via antiepileptics; Beers lists gabapentin under falls/fractures. |
| falls / alpha-1 blockers | related | Labels warn of syncope and postural hypotension. Guideline evidence: STOPPFall alpha-blocker classes and Beers syncope. |
| falls / opioids | none | No label hit. Class-level evidence from CDC STEADI, STOPPFall and Beers 2023 (5 sources). |
| ankle swelling / direct vasodilators | related | Minoxidil and hydralazine labels say "edema" or fluid retention without saying "peripheral". |
| cough / non-selective beta-blockers | related | The propranolol label warns of bronchospasm. Cough itself is **UNVERIFIED**. |
| appetite or nausea and constipation / iron | none | Not in the openFDA OTC iron labels. MedlinePlus lists nausea and constipation. |

**Caveats:**
- A labelled adverse reaction is not causation. Frequencies and placebo rates are not stored as structured data, though they are often visible in the snippets.
- Labels describe the general adult population. Relevance to older adults comes from the class choice (Beers, STOPPFall, STEADI), the `crossLinks` and the 27 Geriatric Use mentions.
- The regex classifier can still miss some negations. A scan for "no/not/without" before each term found no true negations, only phrases like "with or without symptoms". Snippets are stored for human review.
- Some urinary evidence is an OTC caution ("ask a doctor if you have trouble urinating due to an enlarged prostate") rather than an adverse-reaction rate. Diuretic "frequency" is the drug's intended effect (diuresis). Both are noted on the class.
- Labels rarely use the word "fall", so `frids.json` is the authority for falls.
- Representative generics are examples, not complete class lists. Labels are often a generic manufacturer's SPL, and the chosen set id is recorded.

## Cross-cutting caveats for MedWatch

1. All four files describe population-level associations. MedWatch must describe timing and counts only, for example "X started 23 days after Y; Y is known to sometimes cause Z (source)". It must never say a drug caused a symptom.
2. Fields marked UNVERIFIED or "MedWatch-illustrative" or "MedWatch assumption" were not confirmed against a primary source. Keep those labels visible in any judge-facing material.
3. **Production gaps:**
   - SNOMED CT licensing, which is free in the US via the NLM UMLS
   - ACB commercial permission
   - keeping the knowledge current: Beers updates, PIPC/ThinkCascades revisions and label changes
