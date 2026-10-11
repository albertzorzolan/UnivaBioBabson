// Display labels, category order and per-medication badges for review findings.

import type { FindingCategory, MedReview } from "../../model/types";

/** Plain-language heading for each finding category (caregiver UI, brief, FHIR DetectedIssue text). */
export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  prescribing_cascade: "Possible prescribing cascade",
  beers_interaction: "Medicine combination listed in AGS Beers 2023",
  beers_condition: "Medicine and health condition (AGS Beers 2023)",
  beers_avoid: "Generally avoided in older adults (AGS Beers 2023)",
  anticholinergic_burden: "Anticholinergic burden (ACB scale)",
  fall_risk: "Medicines linked to falls",
  beers_renal: "Depends on kidney function (AGS Beers 2023)",
  beers_caution: "Use with caution in older adults (AGS Beers 2023)",
  duplicate_class: "Two medicines of the same kind",
  cns_active_combo: "Three or more brain-active medicines (AGS Beers 2023)",
  monitoring: "What to watch for",
};

/**
 * Sort order within the "linked to recorded symptoms" group and within the rest (SPEC §6.2).
 * The two AGS Beers Table 5 combination categories sit together: ">= 3 CNS-active medicines" is a strong,
 * high-quality-evidence criterion and ranks ahead of single-medicine cautions and duplicates.
 */
export const CATEGORY_ORDER: readonly FindingCategory[] = [
  "prescribing_cascade",
  "beers_interaction",
  "cns_active_combo",
  "beers_condition",
  "beers_avoid",
  "anticholinergic_burden",
  "fall_risk",
  "beers_renal",
  "beers_caution",
  "duplicate_class",
  "monitoring",
];

/** Categories that come from the AGS Beers Criteria (suppressed under age 65). */
export const BEERS_CATEGORIES: readonly FindingCategory[] = [
  "beers_avoid",
  "beers_caution",
  "beers_condition",
  "beers_interaction",
  "beers_renal",
  "cns_active_combo",
];

export function categoryRank(c: FindingCategory): number {
  const i = CATEGORY_ORDER.indexOf(c);
  return i < 0 ? CATEGORY_ORDER.length : i;
}

/**
 * Small badges for one medication in the medications table, in a fixed order, e.g.
 * ["Beers", "ACB 3", "Fall risk", "Cascade?"]. Empty when nothing applies (which never means "safe").
 */
export function findingSummaryForMed(review: MedReview, medId: string): string[] {
  const has = (...cats: FindingCategory[]): boolean =>
    review.findings.some((f) => cats.includes(f.category) && f.medIds.includes(medId));
  const out: string[] = [];
  if (has("beers_avoid", "beers_condition")) out.push("Beers");
  else if (has("beers_caution")) out.push("Beers caution");
  if (has("beers_interaction", "cns_active_combo")) out.push("Combination");
  if (has("beers_renal")) out.push("Kidney");
  const acb = review.acb.contributors.filter((c) => c.medId === medId).reduce((s, c) => s + c.score, 0);
  if (acb > 0) out.push(`ACB ${acb}`);
  if (review.fallRiskMedIds.includes(medId)) out.push("Fall risk");
  if (has("prescribing_cascade")) out.push("Cascade?");
  if (has("duplicate_class")) out.push("Duplicate");
  if (has("monitoring")) out.push("Watch for");
  if (review.unmatchedMedIds.includes(medId)) out.push("Not checked");
  return out;
}
