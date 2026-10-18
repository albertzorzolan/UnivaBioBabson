// Ablation stub for eval/meds.ablation.test.ts: the production engine over a knowledge base without the Beers 2023
// Table 3 "history of falls or fractures" rule for anticholinergics, antipsychotics, benzodiazepines and Z-drugs
// (KB rule id "cond-falls"). The antidepressant/opioid and antiepileptic falls rows stay in.
// Everything else is the production code path, so any case that fails depends on this one rule.
import type { MedReview } from "../../src/model/types";
import { KB } from "../../src/kb";
import { reviewWithKb, type ReviewInput } from "../../src/engine/meds/engine";

export const ABLATION = {
  name: "no-falls-rule",
  description:
    'Beers "history of falls" rule for anticholinergics, antipsychotics, benzodiazepines and Z-drugs removed (KB rule cond-falls)',
};

const ABLATED_KB = { ...KB, beers: KB.beers.filter((rule) => rule.id !== "cond-falls") };
if (ABLATED_KB.beers.length !== KB.beers.length - 1) throw new Error("no-falls-rule ablation: KB rule cond-falls not found");

export function reviewMedications(input: ReviewInput): MedReview {
  return reviewWithKb(ABLATED_KB, input);
}
