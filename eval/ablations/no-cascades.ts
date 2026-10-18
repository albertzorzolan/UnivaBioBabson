// Ablation stub for eval/meds.ablation.test.ts: the production engine over a knowledge base with every
// prescribing-cascade rule removed (KB cascades = []). Everything else is the production code path.
import type { MedReview } from "../../src/model/types";
import { KB } from "../../src/kb";
import { reviewWithKb, type ReviewInput } from "../../src/engine/meds/engine";

export const ABLATION = {
  name: "no-cascades",
  description: "All prescribing-cascade rules removed",
};

const ABLATED_KB = { ...KB, cascades: [] };

export function reviewMedications(input: ReviewInput): MedReview {
  return reviewWithKb(ABLATED_KB, input);
}
