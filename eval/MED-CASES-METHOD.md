# Kinwise medication-review evaluation: how the cases were written

`eval/med-cases.json` holds 57 synthetic cases with 295 expectations: 158 "must include", 59 "must not include"
and 78 checks on totals, lists and states. Each expectation names the published criterion it comes from.
`eval/meds.eval.test.ts` runs them against the real engine (`matchDrug` and `reviewMedications`, SPEC §10) and
writes `eval/results/meds-eval.json`. This is the independent case file required by the SPEC §9 quality gate.

> Synthetic, fictional cases for software testing. This is not patient data, not clinical validation and not
> medical advice. Passing these cases does not mean the engine is complete. No flag does not mean a medicine is safe.

## 1. Independence

- **Who wrote the cases.** An evaluation author separate from the engine author: Claude Code, acting as a
  clinical-pharmacist test author. The work ran in parallel with the engine build.
- **What was not read.** Neither `src/engine/meds/**` nor the compiled knowledge base (`src/kb/data/**`) was opened.
  Both directories were still empty while the cases were written (checked at the start and the end of the work).
  The only project files read were the API contracts (`src/model/types.ts`, `src/kb/types.ts`), `docs/SPEC.md`
  and the date helpers.
- **Where the expected results come from.** The primary publications, read directly on 2026-10-10 (section 2).
- **Secondary aids.** The team's research notes (`acb-frid-cascades-notes.md`, and the structure of the research
  JSON files) were used only to find the primary documents and to choose brand names a family might type. No
  expected result was copied from them. Where the notes and the primary text differed, the primary text was used.

## 2. Sources and how each was read

| Source | Used for | How it was read |
|---|---|---|
| AGS Beers Criteria 2023, J Am Geriatr Soc 2023;71:2052-2081, doi:10.1111/jgs.18372 (PMC12478568) | Tables 2-7 (PIMs, drug-disease, use with caution, drug-drug, kidney function, strong anticholinergics); Tables 8-10 (what changed in 2023) | Table rows extracted from the PMC JATS XML (NCBI efetch), then cross-checked against the text of the final journal PDF |
| Anticholinergic Cognitive Burden scale, 2012 update (Aging Brain Care, Regenstrief Institute) | ACB scores and totals | Both pages of the official card, including the "reviewed but not added" list |
| CDC STEADI "Medications Linked to Falls" (2017); STEADI-Rx Community Pharmacy Fall Risk Checklist (2019) | Fall-risk-increasing drugs (FRIDs) | Both PDFs |
| STOPPFall, Seppala 2021, Age Ageing 50:1189 (PMC8244563) | FRID classes (diuretics, alpha-blockers, centrally acting antihypertensives, vasodilators, OAB medicines ...) | Full text, Tables 1-2 |
| ThinkCascades, McCarthy 2022, Drugs Aging 39:829 (PMC9477172) | Which cascades were retained | Table 2 (Round 1 and 3 ratings, "retained" column) |
| Savage 2020 JAMA Intern Med; Gill 2005 Arch Intern Med; Avorn 1995 JAMA; Vegter 2013 Drug Saf; Gurwitz 1997 J Clin Epidemiol | Individual cascades (CCB to loop diuretic, cholinesterase inhibitor to bladder antimuscarinic, metoclopramide to levodopa, ACE inhibitor to antitussive, thiazide to anti-gout) | PubMed abstracts |
| STOPP/START v3, O'Mahony 2023, Eur Geriatr Med 14:625 | Duplicate drug class (Section A3) | Appendix 1 (publisher's supplementary PDF) |
| Budnitz 2011 NEJM 365:2002; Budnitz 2021 JAMA 326:1299 | The SPEC §12 `monitoring` classes (anticoagulants, insulin, oral hypoglycaemics, oral antiplatelets) | PubMed abstracts |
| `docs/SPEC.md` §6.1, §6.2, §12 | Engine behaviour that is a product decision rather than a criterion: age under 65, unmatched names, active medicines only, kidney rules only when CrCl is known, the diary-derived history of falls, the ACB finding threshold of 3 | Repository |

### What the primary sources showed (please check the KB against this)

1. **Oxybutynin is not a Beers 2023 Table 2 "avoid" drug.** Table 2 has no criterion for bladder antimuscarinics.
   Oxybutynin and tolterodine appear only in Table 7 (strong anticholinergics). Table 7 feeds Table 3 (dementia,
   delirium, history of falls; men with BPH are exempted for these drugs) and the Table 5 anticholinergic pair.
   SPEC §2 lists oxybutynin as a Beers PIM "verify in KB". The cases therefore assert that there is **no**
   `beers_avoid` finding for oxybutynin or tolterodine.
2. **Table 3 in 2023 has no chronic-kidney-disease row.** The NSAID criterion moved to Table 6 (CrCl <30). Table 3 also
   has no insomnia or seizure row. The `chronic_kidney_disease` and `seizure_disorder` tags do not drive any 2023
   drug-disease rule; kidney function matters only through CrCl.
3. **2023 additions that the cases test:**
   - anticholinergics in "history of falls";
   - opioids in "delirium";
   - all sulfonylureas, including glipizide;
   - warfarin as a new start, with long-term users allowed to continue;
   - aspirin for primary prevention and rivaroxaban moved into Table 2;
   - SGLT2 inhibitors and ticagrelor in Table 4;
   - warfarin with SSRIs, and lithium with ARBs/ARNIs, in Table 5;
   - skeletal muscle relaxants in the ≥3 CNS-active combination;
   - baclofen in Table 6;
   - the apixaban kidney rule removed.
4. **ACB card.** Lorazepam, temazepam, clonazepam, sertraline, citalopram, escitalopram, tramadol, oxycodone,
   hydrocodone, famotidine, metoclopramide and amlodipine are not on the card. Gabapentin, levetiracetam and duloxetine
   were "reviewed but not added" (score 0). The seed list's ACB total is therefore exactly 7: diphenhydramine 3,
   oxybutynin 3 and furosemide 1.
5. **Table 5 "≥3 CNS-active drugs"** counts only these types: antiepileptics (including gabapentinoids),
   TCA/SSRI/SNRI antidepressants, antipsychotics, benzodiazepines, Z-drugs, opioids and skeletal muscle relaxants.
   First-generation antihistamines are not on the list.
6. **Table 5 warfarin row** excludes azithromycin. The RAS-inhibitor row names only amiloride and triamterene as
   potassium-sparing diuretics, and applies only in CKD stage 3a or worse.

## 3. How the cases were built

- **Profile.** Each case sets age, sex, conditions (the model's `ConditionTag` values only) and CrCl (`null` = unknown).
  Ages run from 60 to 86. The age-60 case checks that Beers findings are suppressed; the age-65 case checks the boundary.
- **Names typed the way a family would.** The 57 cases contain 154 medication entries. They mix:
  - brands: "Ativan 0.5mg", "Xarelto 15 mg", "Lantus";
  - generics with dose text: "Gabapentin 300 mg";
  - the seed's "Generic (Brand)" style: "Furosemide (Lasix)";
  - OTC combinations: "Tylenol PM", "Advil PM";
  - prescription combinations: "Norco 5/325", "Percocet", "Fioricet", "Maxzide", "Bactrim", "Sinemet";
  - one misspelling the family confirms: "Lorazapam 1 mg";
  - names outside the reference set: "Grandma's herbal tea", "XYZ-123".
- **Dates.** Today is fixed at 2026-10-10. `startDate` is today minus `daysAgoStarted`. One case stops a medicine
  30 days ago to check that only active medicines are reviewed.
- **Diary.** `diary.fallsLast12Months: true` adds one confirmed check-in 20 days ago with `fall: true`. The engine should
  derive `history_of_falls` from the diary. Twin cases, identical except for the recorded fall, check that it does
  this and that nothing is derived when there was no fall.
- **Encoding decisions** where a criterion depends on something the data model does not hold exactly:

  | Criterion | Encoding in the cases | Any engine threshold in this range passes |
  |---|---|---|
  | Warfarin "initial therapy" vs "long-term" | 10 days vs 1200-2200 days | treats a start within N days as initial therapy, N = 10 to 1199 |
  | Chronic NSAID use | 120-365 days daily; a 10-day course as the short-term negative | treats ≥ N days as chronic, N = 11 to 120 |
  | PPI "> 8 weeks" | 150 and 400 days positive; 21 days negative | the published 56 days |
  | Aspirin for primary prevention | the `reason` field says "primary prevention - no heart disease" | n/a (no secondary-prevention negative is asserted) |
  | Indication exceptions (e.g. haloperidol for schizophrenia) | not asserted either way | n/a |
  | Women-only or men-only rows (UI in women, BPH in men, alpha-blocker + loop diuretic in women) | `profile.sex` set accordingly | n/a |
  | Kidney rules | CrCl given, or `null`; a CKD label without CrCl must not trigger Table 6 | n/a |

- **Twins.** Several lists run twice, once with and once without the deciding fact:
  - CrCl given vs unknown: 3 pairs;
  - fall recorded vs not;
  - prescribing cascades in the published order vs the reversed order (the "marker" drug started first): 2 pairs;
  - CrCl just above vs below a threshold (gabapentin at CrCl 75; triamterene at CrCl 45).

## 4. How an expectation is checked

- A **must-include** passes when the review contains a finding of that category whose medications (`medIds` →
  `Medication.ingredientIds`) include every listed ingredient. Ingredient ids are compared by token, so
  "trimethoprim" matches "sulfamethoxazole_trimethoprim" and "insulin" matches "insulin glargine".
- A **must-not-include** passes when no such finding exists. An empty ingredient list means "no finding of this
  category at all".
- **No vacuous passes.** Every ingredient an expectation names must resolve from one of the case's names through
  `matchDrug`. If it does not, the expectation fails as a *precondition* failure, which shows how each name resolved.
  This also makes normalization gaps visible.
- **Combination products.** Assertions work at medication level, so every ingredient of a combination counts as
  involved. `minMatches: 2` is used where one product (Advil PM) meets two Table 2 criteria.
- **Fuzzy matches** stay unmatched unless the case sets `confirmSuggestion: true` (the family confirmed it).
- **Totals and lists.** The runner checks:
  - the exact ACB total (40 cases) or a minimum;
  - fall-risk medicines that must be included (26 cases) or excluded (3 cases);
  - unmatched names;
  - "no findings at all" (2 cases);
  - the under-65 notice;
  - which conditions are in effect and where each came from.
- **Invariants checked on every review.** These are reported in a separate test:
  - every `medId` exists in the input;
  - no finding involves an unmatched or stopped medicine;
  - every finding has sources, a title, plain text, clinician text and a question;
  - the SPEC §3 banned wording does not appear in findings or notices;
  - ACB contributors add up to the total;
  - running the review twice on the same input gives the same result.

## 5. Coverage

`covers` tags on each case record what it tests. Counts below are expectations.

| Area | What is tested | + | − |
|---|---|---|---|
| Beers Table 2 (`beers_avoid`) | **Drug classes:** benzodiazepines (lorazepam, alprazolam, clonazepam, temazepam); Z-drug (zolpidem); first-generation antihistamines (diphenhydramine alone and in Tylenol PM / Advil PM, promethazine); TCA and paroxetine; antipsychotics (quetiapine, risperidone); muscle relaxant (cyclobenzaprine); sulfonylureas (glyburide, glimepiride, glipizide); barbiturate (butalbital in Fioricet); benztropine. **Situational:** chronic NSAIDs (naproxen, ibuprofen) and indomethacin; PPIs > 8 weeks (omeprazole, pantoprazole); aspirin for primary prevention; warfarin new start; rivaroxaban long-term; digoxin; nitrofurantoin long-term; doxazosin and terazosin for blood pressure; clonidine; amiodarone; megestrol; metoclopramide; oral estradiol; testosterone. **Negatives:** sertraline; oxybutynin and tolterodine; metformin; atorvastatin; amlodipine; loratadine; celecoxib; basal insulin; clopidogrel; dabigatran and ticagrelor (Table 4 only); apixaban; a 10-day NSAID; a 21-day PPI; long-term warfarin; baclofen and tizanidine; a stopped benzodiazepine; age under 65 | 47 | 24 |
| Beers Table 3 (`beers_condition`) | **History of falls:** SSRI (diary), gabapentin, tramadol, zolpidem, amitriptyline (profile), tolterodine (2023 anticholinergics, diary), lorazepam, oxybutynin, diphenhydramine (seed). **Dementia:** diphenhydramine, risperidone, temazepam, oxybutynin. **Delirium:** famotidine, prednisone, oxycodone (2023). **Heart failure:** ibuprofen, diltiazem, pioglitazone. **Parkinson disease:** metoclopramide, promethazine. **Ulcer history:** ibuprofen. **UI in women:** doxazosin, estradiol. **BPH:** diphenhydramine. **Negatives:** amlodipine in heart failure, quetiapine in Parkinson, celecoxib with ulcer history, tolterodine with BPH, sertraline with no fall, age under 65 | 25 | 6 |
| Beers Table 4 (`beers_caution`) | dabigatran, ticagrelor at 80, empagliflozin (2023). Negatives: apixaban, clopidogrel, age under 65 | 3 | 3 |
| Beers Table 5 (`beers_interaction`, `cns_active_combo`) | opioid + benzodiazepine; opioid + gabapentinoid ×2; two strong anticholinergics ×3; ≥3 CNS-active ×3 (incl. 2023 muscle relaxant); RAS inhibitor + triamterene in CKD; lithium + ACE inhibitor; lithium + loop diuretic; alpha-1 blocker + loop diuretic in a woman; phenytoin + TMP-SMX; theophylline + cimetidine; theophylline + ciprofloxacin; warfarin + amiodarone / ciprofloxacin / TMP-SMX / SSRI. Negatives: warfarin + azithromycin; fewer than 3 CNS-active drugs ×5; antihistamine as the "third" CNS drug; age under 65 (×2) | 20 | 9 |
| Beers Table 6 (`beers_renal`) | gabapentin <60, dofetilide <60, rivaroxaban <50, levetiracetam ≤80, nitrofurantoin <30, spironolactone <30, famotidine <50, baclofen (2023), NSAID <30 (moved from Table 3 in 2023). Negatives: threshold not reached (gabapentin at 75, triamterene at 45), apixaban rule removed, six lists without CrCl, age under 65 | 9 | 10 |
| ACB (`anticholinergic_burden`, `acb.total`) | Exact totals from 0 to 7 in 40 cases (incl. the 3 + 3 + 1 = 7 seed pattern, "reviewed but not added" drugs scoring 0, three score-1 drugs reaching 3); findings at ≥3; no finding at totals of 0 or 2 | 4 (+40 totals) | 3 |
| Fall-risk drugs (`fall_risk`, `fallRiskMedIds`) | benzodiazepines, Z-drug, sedating antihistamines, antidepressants (SSRI, SNRI, TCA), antipsychotics, opioids, anticonvulsants, muscle relaxant, diuretics, alpha-blockers, clonidine, isosorbide, amlodipine, OAB antimuscarinics. Negatives: statin, metformin, levothyroxine, PPI, a stopped benzodiazepine | 25 (+26 lists) | 1 (+3 lists) |
| Prescribing cascades | CCB → loop diuretic (seed and a stand-alone case); ACE inhibitor → antitussive; cholinesterase inhibitor → bladder antimuscarinic; bladder antimuscarinic → cholinesterase inhibitor; metoclopramide → levodopa; thiazide → allopurinol; antipsychotic → benztropine. Negatives: CCB/loop diuretic and thiazide/allopurinol in reversed order | 8 | 2 |
| Duplicate class | two SSRIs; two NSAIDs ×2 (incl. celecoxib + ibuprofen); seed negative (antihistamine + bladder antimuscarinic is not a duplicate) | 3 | 1 |
| Monitoring (SPEC §12) | warfarin, rivaroxaban, dabigatran, apixaban; glyburide, glimepiride, glipizide, insulin; clopidogrel, ticagrelor | 14 | 0 |
| Engine contract | age under 65 (notice), age 65 boundary, unmatched names, stopped medicine, confirmed fuzzy match, conditions derived from the diary vs the profile, a clean list with no findings, the full SPEC §2 seed list | 9 checks | — |

### Deliberately not covered

These are also listed in `notCovered` in the case file:

- **Not captured by the data model:** nifedipine immediate release (formulation) and sliding-scale insulin (regimen).
  The basal-insulin negative is tested.
- **Dose thresholds:** digoxin > 0.125 mg/day, doxepin > 6 mg/day, aspirin > 325 mg/day. Dose is free text.
- **Indication exceptions:** antipsychotics for schizophrenia, testosterone for hypogonadism, metoclopramide for
  gastroparesis up to 12 weeks, amiodarone with heart failure.
- **Aspirin for secondary prevention:** no negative is asserted, because asking "is this for primary or secondary
  prevention?" is acceptable.
- **Table 3 syncope:** the model has no ConditionTag for it.
- **Table 4 hyponatremia/SIADH items:** an engine may add these and is not penalised.
- **Low-use Table 2 entries.**
- **Table 6 rows not listed above.** They use the same mechanism as those tested.
- **Other cascades:** the rest of the PIPC and ThinkCascades lists.
- **Out of scope for this suite:** `relatedSymptoms`, `signalIds`, sort order and finding wording beyond the
  banned-phrase check.

## 6. Limitations

- **Synthetic cases and one author.** The cases are synthetic and were written by a single author (Claude Code acting
  as a clinical-pharmacist test author). There was no second rater and no adjudication, so expected results reflect one
  careful reading of the criteria. A licensed pharmacist should review them before any claim is made about them.
- **Not clinical validation.** A passing run shows that the engine applies the published criteria as encoded here to
  these lists. It does not show clinical accuracy, usefulness, or anything about patient outcomes.
- **Beers flags are possibilities, not verdicts.** The AGS describes Beers medicines as *potentially* inappropriate,
  not definitely inappropriate (Table 11). Many criteria have exceptions that depend on indication, dose, formulation
  or kidney function. The model does not hold most of these, and the cases avoid asserting where they could apply.
- **Not every criterion is covered.** Coverage is broad, not complete. Coverage of Table 2 is the deepest.
- **Medication-level matching.** For combination products the suite cannot tell which ingredient a finding was
  about (section 4).
- **Choices between published lists.** Fall-risk lists differ between CDC, STEADI-Rx and STOPPFall. Each fall-risk
  expectation cites the source that names the class; amlodipine, for example, comes from STEADI-Rx "antihypertensives".
- **Cascade timing.** Cascade cases place the second drug 45-60 days after the first. That fits the 90-day window in
  Savage 2020 and the longer windows in the other studies. The suite does not test window edges.
- **Monitoring classes** follow SPEC §12 and Budnitz 2011/2021. They are not a published criteria set.
- **Copyright.** AGS Beers Criteria® and the ACB card are copyrighted. The case file paraphrases rationale and quotes
  only short phrases, with attribution.

## 7. Running, reading and extending

- **Run:** `npm run eval:meds` or `npx vitest run eval/meds.eval.test.ts`.
- **Before the engine exists:** one test ("engine modules load") fails with the missing module path, and the cases
  are skipped. Nothing crashes. The results file then says `"status": "engine_unavailable"`.
- **Results:** `eval/results/meds-eval.json` holds the summary (by expectation kind and by finding category). For each
  case it holds the name resolutions, every expectation with pass/fail, detail, reason and source, the invariants,
  and a summary of the actual review.
- **Failure messages** name the case id and the failed expectation, with its reason and source, and list all actual
  findings.
- **Adding a case:** append a case to `eval/med-cases.json`. Every expectation needs `why` and `source`. Every scalar
  check needs a matching `expect.basis` entry. The schema test enforces both, and also checks the SPEC §3 wording
  rules on the file.
- **Testing the runner itself:** set `KINWISE_MED_EVAL_NORMALIZE`, `KINWISE_MED_EVAL_REVIEW` and
  `KINWISE_MED_EVAL_RESULTS` to point it at stub modules and a scratch results path.
