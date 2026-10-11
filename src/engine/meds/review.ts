// Public API of the medication-review engine (SPEC §10), bound to the compiled knowledge base.
//
//   reviewMedications(input)            -> MedReview (findings, ACB, fall-risk list, notices, ...)
//   activeMeds(meds, today)             -> medicines with no end date or an end date today or later
//   CATEGORY_LABEL                      -> plain-language heading per finding category
//   previewAddition(state, newMed)      -> what would change if a medicine were added (Add-medication drawer)
//   findingSummaryForMed(review, medId) -> small badges for the medications table
//
// The engine itself lives in engine.ts and takes the KnowledgeBase as a value (see reviewWithKb), so it is
// testable against fixtures. Everything here is pure and deterministic: same input, same output.

import type { Medication, MedReview } from "../../model/types";
import { KB } from "../../kb";
import { reviewWithKb, type ReviewInput } from "./engine";
import { previewAdditionWithKb, type AdditionPreview, type PreviewState } from "./preview";

export { activeMeds, reviewWithKb, findingKey, compareFindings } from "./engine";
export type { ReviewInput } from "./engine";
export { CATEGORY_LABEL, CATEGORY_ORDER, BEERS_CATEGORIES, findingSummaryForMed } from "./labels";
export { REQUIRED_NOTICE } from "./text";
export type { AdditionPreview, PreviewState } from "./preview";

export function reviewMedications(input: ReviewInput): MedReview {
  return reviewWithKb(KB, input);
}

export function previewAddition(state: PreviewState, newMed: Partial<Medication> & Pick<Medication, "name">): AdditionPreview {
  return previewAdditionWithKb(KB, state, newMed);
}
