// Control for eval/meds.ablation.test.ts (not a removal): the production engine and KB, with the medication list
// given in reverse order. Every case should still pass, which shows the review does not depend on input order.
import type { MedReview } from "../../src/model/types";
import { KB } from "../../src/kb";
import { reviewWithKb, type ReviewInput } from "../../src/engine/meds/engine";

export const ABLATION = {
  name: "reversed-order",
  description: "Medication list given in reverse order (control: nothing removed)",
};

export function reviewMedications(input: ReviewInput): MedReview {
  return reviewWithKb(KB, { ...input, meds: [...input.meds].reverse() });
}
