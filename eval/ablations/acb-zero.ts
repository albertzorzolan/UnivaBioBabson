// Ablation stub for eval/meds.ablation.test.ts: the production engine over a knowledge base in which every
// ingredient's Anticholinergic Cognitive Burden score is 0. Classes (and so the Beers anticholinergic rules) are
// unchanged; only the ACB scores go. Everything else is the production code path.
import type { MedReview } from "../../src/model/types";
import { KB } from "../../src/kb";
import { reviewWithKb, type ReviewInput } from "../../src/engine/meds/engine";

export const ABLATION = {
  name: "acb-zero",
  description: "ACB scores set to 0 for every ingredient",
};

const ABLATED_KB = { ...KB, drugs: KB.drugs.map((d) => ({ ...d, acb: 0 as const })) };

export function reviewMedications(input: ReviewInput): MedReview {
  return reviewWithKb(ABLATED_KB, input);
}
