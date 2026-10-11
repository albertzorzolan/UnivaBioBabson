// Medication-review engine (SPEC §6.2, §10, §12). See review.ts for the public API.
export {
  reviewMedications,
  previewAddition,
  activeMeds,
  reviewWithKb,
  findingKey,
  compareFindings,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  BEERS_CATEGORIES,
  findingSummaryForMed,
  REQUIRED_NOTICE,
} from "./review";
export type { ReviewInput, AdditionPreview, PreviewState } from "./review";
export { previewAdditionWithKb, draftMedication } from "./preview";
