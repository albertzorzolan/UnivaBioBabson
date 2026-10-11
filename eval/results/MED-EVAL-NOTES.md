# Medication-review evaluation: results notes

Run: `npm run eval:meds` (or `npx vitest run eval/meds.eval.test.ts`). The runner writes
`eval/results/meds-eval.json`. Run date 2026-10-11, KB version 2026.10.2, case file `eval/med-cases.json`.

| | Passed | Total |
|---|---|---|
| Cases | 57 | 57 |
| Expectations | 295 | 295 |
| `mustInclude` (finding present) | 158 | 158 |
| `mustNotInclude` (finding absent) | 59 | 59 |
| ACB totals (exact) | 40 | 40 |
| Fall-risk list (include / exclude) | 29 | 29 |
| Other (effective conditions, unmatched names, no-findings, Beers age notice) | 9 | 9 |
| Precondition failures (an expected ingredient did not resolve from the typed name) | 0 | — |
| Invariant violations (ids, active medicines only, sources, SPEC §3 wording, determinism) | 0 | — |

## Disagreements with the case file

None. Every expectation passes against the real compiled KB and the production `reviewMedications`.
`eval/med-cases.json` has not been edited, and no expectation needed to be overruled.

## How we checked that the passes are genuine

1. **No special-casing.** We read the engine (`src/engine/meds/engine.ts`, `context.ts`, `rules/*.ts`). Every rule is
   driven by KB data (selectors, classes, thresholds, qualifiers). Nothing refers to case ids, case names or eval
   fixtures, and the KB generator does not read the case file.
2. **The eval can fail.** We ran the same runner against stub engines that remove one piece of knowledge, using
   the runner's `KINWISE_MED_EVAL_REVIEW` / `KINWISE_MED_EVAL_RESULTS` hooks so the docs results file was not
   touched. Results:

   | Change to the engine | Cases passed | Expectations passed |
   |---|---|---|
   | None (production) | 57/57 | 295/295 |
   | Medication list given in reverse order | 57/57 | 295/295 |
   | Beers "history of falls" rule for anticholinergics, antipsychotics, benzodiazepines and Z-drugs removed | 54/57 | 289/295 |
   | All prescribing-cascade rules removed | 49/57 | 287/295 |
   | ACB scores set to 0 | 33/57 | 267/295 |

   The reversed list shows that the output does not depend on input order. Each removal breaks the cases that
   depend on it.
3. **We checked judgement calls against the primary source.** Some results are plausible but easy to get wrong,
   so we checked the 2023 Beers full text (PMC12478568) directly:
   - *Anticholinergics count in "history of falls or fractures" (Table 3).* This is why oxybutynin, Tylenol PM
     (diphenhydramine) and tolterodine are flagged in people who have fallen. Table 3 lists "Anticholinergics (see
     Table 7); antidepressants (selected classes: SNRIs, SSRIs, TCAs); antiepileptics; antipsychotics;
     benzodiazepines; nonbenzodiazepine hypnotics … opioids". Table 9 records anticholinergics as *added* in 2023
     ("Emerging data and consistency across recommendations"). The KB matches the source.
   - *Dementia (Table 3)* lists "Anticholinergics; antipsychotics (chronic or persistent as-needed use);
     benzodiazepines; nonbenzodiazepine hypnotics". *Delirium* also lists "corticosteroids (oral and parenteral);
     H2-receptor antagonists …; opioids". These rows are why prednisone, famotidine and oxycodone are flagged in
     mc-delirium.

## Observations outside the case file (not failures; recorded for reviewers)

- **Beers Table 4 sodium criterion is broad.** "Antipsychotics, carbamazepine, diuretics, mirtazapine,
  oxcarbazepine, SNRIs, SSRIs, TCAs, tramadol: use with caution … may exacerbate or cause SIADH or hyponatremia".
  The engine therefore adds a "can lower sodium levels" caution to many common lists, for example any loop or thiazide
  diuretic. This matches the source. Table 4 cautions sort below the avoid, condition, combination, kidney, ACB
  and fall-risk findings.
- **Review order fix (engine).** The Beers Table 5 rule "3 or more CNS-active medicines" (strong recommendation,
  high-quality evidence) used to sort below Table 4 cautions and duplicate-class findings. It now sorts directly
  after the other Table 5 combinations (`CATEGORY_ORDER` in `src/engine/meds/labels.ts`, with a unit test). The
  eval results do not change, because the eval does not test order.
- **Fall-risk classes.** The fall-risk list follows CDC STEADI (antihypertensives) and STOPPFall (diuretics,
  alpha-blockers, centrally acting antihypertensives, vasodilators, sedating antihistamines, anticholinergics). It
  includes ACE inhibitors, ARBs and calcium-channel blockers. It leaves out beta-blockers, which STOPPFall did not
  adopt as FRIDs. The case file asserts the included classes, for example amlodipine (calcium-channel blocker) and
  hydrochlorothiazide. It does not assert ACE inhibitors or the beta-blocker exclusion (mc-acb-low only checks metoprolol's ACB
  score). A clinician reviewer may want a different cut.
- **Scope.** The cases are synthetic, the KB has not been reviewed by a licensed clinician, and the eval tests
  whether published criteria fire correctly, not clinical outcomes. No flag does not mean a medicine is safe.
