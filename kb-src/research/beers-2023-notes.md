# AGS Beers Criteria 2023: MedWatch knowledge base notes

Companion to `beers-2023.json` (same folder). Built 2026-10-10.

## 1. What the file is

`beers-2023.json` is a machine-readable version of the **2023 American Geriatrics Society Beers Criteria®** (J Am Geriatr Soc. 2023;71(7):2052-2081, doi:10.1111/jgs.18372, PMID 37139824, PMCID PMC12478568). MedWatch's deterministic medication review engine can use it directly.

| JSON key | AGS source | Entries |
|---|---|---|
| `pims` | Table 2 (PIMs independent of diagnosis) | **36 of 36 criteria**, 123 drug rows (120 unique generics) |
| `drugDiseaseInteractions` | Table 3 (drug-disease/syndrome) | **All 9 criteria**, as 12 entries: heart failure is split into 3 sub-entries by recommendation tier, plus 1 derived CKD entry (the authoritative criterion lives in Table 6) |
| `useWithCaution` | Table 4 | **6 of 6** |
| `drugDrugInteractions` | Table 5 | **12 of 12** (all rows, with class members resolved) |
| `renalDoseAdjust` | Table 6 | **24 of 24** drugs or drug groups, each with machine-readable CrCl/eGFR rules |
| `strongAnticholinergics` | Table 7 | **40 of 40** unique drugs (promethazine appears in two groups) |
| `anticoagulantSummary` | Box 1 | 1 |
| `removedSince2019StillPIMs` | Table 8 | 37 drugs or criteria (AGS still considers them PIMs per 2019) |
| `changesSince2019` | Tables 9 and 10 | 10 additions, 30 modifications |
| `classDefinitions` | Beers classes plus MedWatch expansions | 42 classes |
| `drugLexicon` | 246 generics → RxCUI, brands, classes, FDA EPC, and every Beers entry id that applies | |
| `brandIndex` | 525 verified brand names → ingredients + how each was verified | |
| `ratingDefinitions` | Table 1 (quality of evidence, strength of recommendation), paraphrased | |

Each Table 2 to 4 entry carries:
- `recommendation`: a code (`avoid`, `avoid-conditional`, `avoid-unless`, `avoid-initiation`, `avoid-first-line`, `use-with-caution`).
- `recommendationText`: the condensed recommendation.
- `conditions`: dose, duration, indication, formulation, exceptions and sex, in machine-readable form.
- `rationaleParaphrase`: plain language for caregivers, at most 2 sentences.
- `clinicianRationale`: at most 2 sentences.
- Quality and strength ratings exactly as published. Split ratings use `"Mixed"` plus a `qualityDetail` or `strengthDetail` object.
- `changeVs2019`.
- `sourceUrls`.

## 2. How the file was verified

1. **Primary text.** All 12 table-wraps were pulled programmatically from the PMC XML via NCBI E-utilities (`efetch db=pmc id=12478568`). This copy is the NIHMS author manuscript. Every row was transcribed from that text.
2. **Comparison with the typeset article.** The PMC text was compared with two PDF copies of the article:
   - The Early View PDF (sbgg.org.br copy, pp. 1-30). Rotated landscape pages were extracted with pypdf and pdfplumber, and each table was read against the PMC text. All recommendations, thresholds and ratings match.
   - The final issue PDF (pp. 2052-2081; health.hawaii.gov copy). Its quality/strength rating lines were diffed against the Early View, and so were all recommendation and threshold lines. They are identical.
3. **Errata.** Crossref and PubMed show no erratum or correction for this DOI. PubMed lists only comment letters: jgs.18579, jgs.18587 and jgs.18721.
4. **Automated self-check.** `validate.py` (in the scratchpad `scripts/` folder) re-parses the PMC tables and checks:
   - Every Table 2, 4, 5 and 6 quality and strength rating against the JSON: 0 mismatches.
   - Every Table 6 CrCl threshold: 0 mismatches.
   - Table 7 membership: 40 of 40 match, with no extras.
   - That rationale fields are at most 2 sentences.
   - That no paraphrase shares an 8-word verbatim run with the AGS rationale text. The first draft had 25 such fields, mostly clinician rationales; all were rewritten and the result is now 0.
5. **Drug names.**
   - Every generic maps to an RxNorm concept through the RxNav API. The RxCUI is recorded, and lowercase RxNorm names are used, for example `thyroid (USP)` and `estrogens, conjugated (USP)`.
   - Brand names were curated by hand. A brand was kept only if it passed one of three checks:
     - an active RxNorm brand-name (BN) concept linked to the ingredient (469 brands);
     - an obsolete or historical RxNorm BN whose ingredients include the drug, such as Flexeril, Amaryl, DiaBeta or Megace (46 brands, flagged `historical: true` with their active date range);
     - a DailyMed SPL whose title lists the ingredient. This covers OTC combinations RxNorm lacks: Advil PM, NyQuil, Coricidin HBP, Alka-Seltzer Plus, Dimetapp, Unisom SleepGels, Prempro/Premphase, Activella and Megace ES (10 brands, with setids recorded).
   - Names that failed all three checks were **dropped**: Goody's PM, Bayer PM, Goody's, Parafon Forte, Angeliq and Ditropan XL.
6. **Class membership.** Each class was cross-checked against the FDA Established Pharmacologic Class (EPC) from RxClass (relaSource FDASPL). Every member that has an EPC matches its expected class:
   - opioids 12/12, SSRIs 6/6, SNRIs 5/5, TCAs 7/7, benzodiazepines 12/12
   - ACE inhibitors 9/10, ARBs 7/7, loop diuretics 4/4
   - PPIs 6/6, H2RAs 3/3, sulfonylureas 3/4, SGLT2 inhibitors 5/6
   - systemic corticosteroids 5/5, nonselective NSAIDs 13/13, antipsychotics 15/15
   - AChEIs 3/3, macrolides 2/2, muscle relaxants 6/6, bladder antimuscarinics 6/7

   The four shortfalls are drugs with no EPC in FDASPL (moexipril, gliclazide, ertugliflozin, fesoterodine), not mismatches.
7. **Secondary cross-checks.**
   - The University of Illinois Chicago Drug Information Group summary (Aug 2023) agrees on every change it lists.
   - The AAFP practice-guideline summary (Am Fam Physician 2024;109(4):374-375) also agrees.
   - For before/after statements, the 2019 Beers PDF (doi:10.1111/jgs.15767) was read directly, including 2019 Table 4 (aspirin, dabigatran/rivaroxaban, prasugrel) and 2019 Table 2 (sulfonylureas, PPIs).

Source URLs:
- PMC full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC12478568/
- DOI: https://doi.org/10.1111/jgs.18372
- PubMed: https://pubmed.ncbi.nlm.nih.gov/37139824/
- Final-issue PDF copy: https://health.hawaii.gov/docd/files/2024/08/AGS-Beers-Criteria-2023.pdf
- Early View PDF copy: https://sbgg.org.br/wp-content/uploads/2023/05/1-American-Geriatrics-Society-2023.pdf
- UIC DIG summary: https://dig.pharmacy.uic.edu/faqs/2023-2/september-2023-faqs/a-summary-of-the-2023-american-geriatrics-society-updated-beers-criteria-for-potentially-inappropriate-medication-use-in-the-elderly/
- AAFP summary: https://www.aafp.org/pubs/afp/issues/2024/0400/practice-guidelines-inappropriate-medication-use-older-adults.html
- 2019 Beers: https://doi.org/10.1111/jgs.15767 (copy read: https://www.omedit-auvergne-rhone-alpes.ars.sante.fr/media/102884/download)
- RxNav/RxNorm API: https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html
- RxClass API: https://lhncbc.nlm.nih.gov/RxNav/APIs/RxClassAPIs.html
- DailyMed SPL API: https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json
- FDA benzodiazepine boxed-warning communication (2020), used for the "don't stop suddenly" safety text: https://www.fda.gov/drugs/drug-safety-and-availability/fda-requiring-boxed-warning-updated-improve-safe-use-benzodiazepine-drug-class
- USPSTF 2022 aspirin recommendation (cited by AGS): https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/aspirin-to-prevent-cardiovascular-disease-preventive-medication

## 3. Changes vs 2019 that matter for MedWatch

All items below are from 2023 Tables 9 and 10 and the article text. Where a 2019 value is given, it was read from the 2019 PDF.

**Antithrombotics.** This is the biggest change set.
- **Aspirin for primary prevention.** 2019 Table 4: "use with caution" in adults ≥70 (Moderate/Strong). 2023 Table 2: **avoid starting** aspirin for primary prevention and **consider deprescribing** in current users (High/Strong), in line with the 2022 USPSTF recommendation. Secondary prevention is explicitly *not* covered. MedWatch must therefore know the indication, or ask "Has this person had a heart attack, stroke or stent?"
- **Warfarin (new).** Avoid starting it as initial therapy for nonvalvular AF or VTE unless DOACs are contraindicated or there are substantial barriers such as cost or access (High/Strong). Long-term users with a well-controlled INR (time in therapeutic range >70%) may reasonably continue. **This is not a "stop warfarin" flag for stable users.**
- **Rivaroxaban.** Moved from Table 4 (2019: "use with caution" for VTE/AF in adults ≥75, shared with dabigatran) to Table 2 **avoid** for long-term AF/VTE treatment (Moderate/Strong). The reason is higher major and GI bleeding than other DOACs, especially apixaban. It may still be reasonable when once-daily dosing is needed for adherence.
- **Dabigatran.** Remains "use with caution" (Moderate/Strong), now framed as caution in choosing it over other DOACs such as apixaban, with no age cutoff.
- **Apixaban.** Its 2019 Table 6 criterion (avoid at CrCl <25) was **removed**. Apixaban now appears in no criterion.
- **Ticagrelor.** Added to the prasugrel caution: use with caution, especially at age ≥75. Prasugrel 5 mg should be considered at ≥75. The rating is now Moderate/Strong (2019 prasugrel: Moderate/Weak).
- **Warfarin + SSRIs.** Added to the Table 5 warfarin interaction list, alongside amiodarone, ciprofloxacin, macrolides excluding azithromycin, and TMP-SMX.
- **Warfarin + NSAIDs and corticosteroids + NSAIDs.** Removed from Table 5 and absorbed into the Table 2 oral NSAID criterion, which now says to avoid even *short-term scheduled* NSAID use alongside corticosteroids, anticoagulants or antiplatelets unless alternatives fail and a PPI or misoprostol is used.

**Diabetes.**
- **Sulfonylureas** expanded from long-acting only (2019: chlorpropamide, glimepiride, glyburide; High/Strong) to **all sulfonylureas**. Avoid them as first- or second-line monotherapy or add-on therapy unless there are substantial barriers. If one is used, prefer short-acting glipizide.
  - Quality is split: hypoglycemia High, CV events and all-cause mortality Moderate, CV death and ischemic stroke Low. Strength is Strong.
  - Glimepiride and glyburide are the most common sulfonylureas in US older adults, so this is a high-yield flag.
- **SGLT2 inhibitors (new, Table 4).** Use with caution and monitor for urogenital infections (especially women in the first month) and euglycemic DKA (Moderate/**Weak**).
  - AGS explicitly says it values these drugs. MedWatch should present this as monitoring advice, never as "avoid".
- **Sliding-scale insulin.** Unchanged (Moderate/Strong).

**Other Table 2 changes.**
- **PPIs.** The rationale now also cites pneumonia and GI malignancies. Quality is split: C. difficile, bone loss and fractures High; pneumonia and GI malignancies Moderate. The >8-week scheduled-use rule is unchanged.
- **Systemic estrogen.** "Do not initiate" and consider deprescribing. Starting HRT at age ≥60 carries more risk than benefit. Low-dose vaginal estrogen remains acceptable.
- **Antipsychotics.** Stronger language, including mortality independent of dementia and periodic deprescribing attempts.
- **Benzodiazepines.** Abuse, misuse and addiction risk added, plus the opioid co-use warning.
- **Androgens.** Prostate cancer changed from "contraindicated" to "potential risks".
- **Dronedarone.** Caution added for milder (NYHA I-II) HFrEF.
- **Digoxin.** Caution added about withdrawing it in long-term users with HFrEF.
- **Skeletal muscle relaxants.** Clarified that baclofen and tizanidine for spasticity are excluded.

**Table 3 (drug-disease).**
- Opioids added to **delirium**.
- Anticholinergics added to **history of falls or fractures**.
- Quality for falls with antidepressants lowered from High to Moderate. SNRIs were already added in 2019.
- Dextromethorphan-quinidine added to **heart failure**.
- The **CKD + NSAIDs** criterion moved to Table 6 (CrCl <30: avoid).

**Table 5 (drug-drug interactions).**
- Skeletal muscle relaxants added to the **≥3 CNS-active drugs** rule, and its quality was raised to **High**.
- Anticholinergic + anticholinergic now names specific harms: cognitive decline, delirium, falls and fractures.
- Lithium + ARBs/ARNIs added.
- ARNIs are named among RAS inhibitors.

**Table 6 (kidney function).**
- **Baclofen** added: avoid if eGFR <60, because of the encephalopathy risk.
- Rivaroxaban CrCl cutoffs now defer to the label.
- Nitrofurantoin duplicated here from Table 2.

**Table 8.**
- 28 low-use or off-market Table 2 drugs were moved off the main tables, along with rosiglitazone, thioridazine, meperidine (subsumed under opioids for delirium), ranitidine, apixaban <25, loxapine and trifluoperazine. Examples include flurazepam, chlorpropamide, ketoprofen and methyldopa.
- AGS states these are **still PIMs per 2019**. The JSON keeps them with RxCUIs so MedWatch can label them "2019 criteria".

## 4. What could not be verified, ambiguities, and MedWatch decisions

Items marked **UNVERIFIED** or **AMBIGUOUS** should not be overstated to judges.

- **Class expansions are MedWatch's, not AGS's.** AGS names classes and gives example drugs. Its footnote says every drug in a named class is covered "unless stated otherwise." Where AGS gives no list, MedWatch filled in members: opioids, antiepileptics, SSRIs, SNRIs, ACE inhibitors, ARBs, loop and other diuretics, systemic corticosteroids, macrolides, the selective alpha-1 blocker alfuzosin, and SGLT2 inhibitors approved after the criteria (bexagliflozin, sotagliflozin). These lists are tagged `basis: medwatch-expansion` and were checked against FDA EPC (section 2.6). The exact intended membership is **UNVERIFIED** with AGS.
- **AMBIGUOUS: potassium-sparing diuretics in the Table 5 RAS row.** AGS names only amiloride and triamterene. Spironolactone and eplerenone (FDA EPC "Aldosterone Antagonist") are left as `ambiguousMembers`, and MedWatch should show "possible match - ask clinician."
- **AMBIGUOUS: baclofen and tizanidine in the "≥3 CNS-active drugs" rule.** Table 2 excludes them from its muscle-relaxant criterion, but Table 5 says "skeletal muscle relaxants" without that exclusion. They are treated as a possible match.
- **AMBIGUOUS: routes.**
  - Topical, ophthalmic and otic products are treated as out of scope. Table 2 NSAIDs are oral, diphenhydramine is "oral", and atropine "excludes ophthalmic".
  - Table 7 does not say whether ophthalmic **homatropine** is excluded. MedWatch excludes it by analogy (an assumption).
  - **Intranasal ketorolac (Sprix)** is not explicitly addressed. AGS names oral and parenteral ketorolac.
- **Brand pitfalls found and fixed.** These are worth mentioning to judges:
  - **Procardia and Adalat.** The only current RxNorm Procardia products are extended-release (Procardia XL), and Adalat is a historical name whose remaining US product, Adalat CC, is extended-release. Both were removed from the nifedipine criterion, which covers immediate-release only; matching them would have produced false flags.
  - **Voltaren.** The current US RxNorm product is a topical gel, so it was removed from the oral NSAID brands.
  - **Unisom.** SleepTabs contain doxylamine, while SleepGels and SleepMelts contain diphenhydramine.
  - **Flonase Nighttime** is oral triprolidine, not fluticasone.
  - **Primsol** (trimethoprim alone) was removed, because the TMP-SMX criteria apply only to the combination.
  - **Dextromethorphan.** OTC dextromethorphan must not trigger the dextromethorphan-quinidine criteria, which are encoded as `combinationMembers`.
  - **Clidinium-chlordiazepoxide.** Only clidinium is counted as the Table 7 anticholinergic. Chlordiazepoxide is covered by the benzodiazepine criteria.
- **OTC product lines vary within one brand.** The DailyMed check confirms the ingredient in at least one product, but the specific product must be confirmed. This applies to Coricidin HBP (chlorpheniramine vs doxylamine vs none), Alka-Seltzer Plus, NyQuil, Dimetapp (Nighttime contains diphenhydramine) and Excedrin PM (Triple Action adds aspirin).
- **Historical brand names** are included for recognition only and flagged. Examples: Flexeril, Amaryl, DiaBeta, Megace, Librium and Sinequan.
- **Gliclazide** is listed by AGS but is not marketed in the US. RxNorm has an ingredient concept for it, but there are no US brands and no FDA EPC.
- **CrCl formula.** AGS uses "CrCl (mL/min)" throughout Table 6, except baclofen (eGFR <60) and the RAS row (CKD stage 3a). The article does not name an estimating equation (searched; no mention of Cockcroft-Gault), so **which equation AGS intends is UNVERIFIED**. MedWatch should show the threshold and leave the calculation to the clinician.
- **AAFP wording.** The AAFP summary's statement "For patients with reduced kidney function, only apixaban is recommended" is the AFP editors' gloss, not AGS text. AGS only removed apixaban from Table 6. It was **not** encoded.
- **Typos in the AGS tables.** Correct spellings are used and each typo is recorded in `sourceSpellingNote` or the Table 8 reason: Mirtazipine, Canigliflozin, Emplaglifozin, Ertuglifozin, Butobarbital, Trifluoperazone, Dextrobromphiniramine.
- **Copyright.** Rationale text is MedWatch's own paraphrase. The automated 8-word-overlap check returns 0 for all rationale and risk fields. `recommendationText` is deliberately kept close to the AGS wording, because thresholds and exceptions are clinical facts whose precision matters. The article's own tables should not be reproduced in the app or demo. "AGS Beers Criteria®" is a registered trademark, and the JSON says the knowledge base is unofficial and not endorsed by AGS.
- **Not derived from AGS.** Safety copy telling caregivers not to stop a medicine abruptly comes from FDA (the benzodiazepine boxed warning), not AGS. It is tagged with its FDA source URL.

## 5. How the engine should use the file

These are MedWatch design notes, not AGS content.

1. **Normalize the medication list.** Look up the free-text name in `brandIndex`, then `drugLexicon`, which gives the generic name(s) and RxCUI. Expand combination products to all of their ingredients, for example Tylenol PM → acetaminophen + diphenhydramine.
2. **Collect candidate criteria.** For each generic, `drugLexicon[g].beersEntryIds` lists every Table 2 to 7 entry that might apply. Entries in `combinationOnlyEntryIds` apply only when the partner ingredient is also present, as with TMP-SMX and dextromethorphan-quinidine; Table 6 uses `matchRequiresAllDrugs` for the same purpose.
3. **Apply context gates.** Gate on indication, dose (digoxin >0.125 mg/day, doxepin >6 mg/day, aspirin >325 mg/day), duration (PPI >8 weeks, metoclopramide >12 weeks), formulation (IR nifedipine, oral NSAIDs, systemic estrogen), regimen (sliding-scale insulin only applies when no `basal-insulin` member is present), CrCl/eGFR, sex, and diagnoses (`conditionKeywords`).
   - If context is missing, output "needs clinician confirmation" rather than a definite flag.
   - `brandsLikelyOutOfScope` marks products such as Silenor, Vagifem and seizure-rescue benzodiazepines.
4. **Count distinct drugs** for the anticholinergic (≥2) and CNS-active (≥3) rules. A drug that sits in two classes counts once. Note that Table 7 is not exhaustive. `acb-scale.json` in this folder, produced by a separate task, can complement it.
5. **Never present a flag as a stop instruction.** AGS defines "avoid" as "avoid except under unusual circumstances," says the criteria are not to be used punitively, and excludes hospice and end-of-life care. Every flag should show the quality and strength ratings and the AGS citation, which is the rigor point for judges.
