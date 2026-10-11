// Duplicates: two or more active medicines that share
//   (a) the same ingredient in different products (e.g. "Benadryl" + "Tylenol PM" both contain diphenhydramine;
//       acetaminophen in two pain products), or
//   (b) a specific therapeutic class (two SSRIs, two NSAIDs, two benzodiazepines, ...).
// Umbrella classes used by other rules (cns_active, sedative_hypnotic, antidepressant, diuretic, bp_lowering,
// antidiabetic, antiplatelet, ...) are not duplicate classes: combinations across them are often intended
// (aspirin + a P2Y12 inhibitor after a stent; basal + mealtime insulin) or are covered by Beers Table 5.
// A class duplicate needs at least two *different* ingredients of the class, so a duplicated ingredient is
// reported once, by (a).

import type { Draft, MedInfo, ReviewContext } from "../context";
import { ingredientName } from "../context";
import { listJoin } from "../text";

/** Specific therapeutic classes for which two concurrent members are worth a question. */
export const DUPLICATE_CLASSES: readonly string[] = [
  "benzodiazepine",
  "z_drug",
  "barbiturate",
  "antipsychotic",
  "ssri",
  "snri",
  "tca",
  "gabapentinoid",
  "opioid",
  "skeletal_muscle_relaxant",
  "first_gen_antihistamine",
  "second_gen_antihistamine",
  "bladder_antimuscarinic",
  "nsaid",
  "ppi",
  "h2ra",
  "acei",
  "arb",
  "ccb_dihydropyridine",
  "ccb_nondihydropyridine",
  "beta_blocker",
  "loop_diuretic",
  "thiazide_diuretic",
  "statin",
  "anticoagulant",
  "p2y12_inhibitor",
  "sulfonylurea",
  "dpp4_inhibitor",
  "sglt2_inhibitor",
  "glp1_agonist",
  "thiazolidinedione",
  "insulin_basal",
  "insulin_rapid",
  "alpha1_blocker",
  "central_alpha_agonist",
  "bisphosphonate",
  "thyroid_hormone",
  "corticosteroid_systemic",
  "cholinesterase_inhibitor",
  "dopamine_antagonist_antiemetic",
  "mineralocorticoid_antagonist",
  "fluoroquinolone",
  "macrolide",
];

/** Source for duplicate findings: STOPP/START (duplicate drug class) when the KB registers it, else none. */
function duplicateSourceIds(ctx: ReviewContext): string[] {
  const src = (ctx.ix.kb.sources ?? []).find((s) => /stopp/i.test(s.id) && !/fall/i.test(s.id));
  return src ? [src.id] : [];
}

function classLabel(ctx: ReviewContext, classId: string): string {
  const d = ctx.ix.classInfo(classId)?.display ?? classId.replace(/_/g, " ");
  return d;
}

export function duplicateFindings(ctx: ReviewContext): Draft[] {
  const out: Draft[] = [];
  const sourceIds = duplicateSourceIds(ctx);

  // (a) same ingredient in two or more products
  const byIngredient = new Map<string, MedInfo[]>();
  for (const m of ctx.meds) for (const id of m.ingredients) byIngredient.set(id, [...(byIngredient.get(id) ?? []), m]);
  for (const [id, meds] of [...byIngredient.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (meds.length < 2) continue;
    const ing = ingredientName(ctx, id).toLowerCase();
    const names = listJoin(meds.map((m) => m.name));
    out.push({
      ruleId: `dup-ingredient-${id.replace(/[^a-z0-9]+/gi, "-")}`,
      category: "duplicate_class",
      medIds: meds.map((m) => m.med.id),
      title: `The same ingredient in ${meds.length} medicines: ${ing}`,
      plain: `${names} all contain ${ing}. Taking the same ingredient in more than one product adds up the amount taken, which is easy to miss.`,
      clinician: `Duplicate ingredient: ${ing} in ${names}.`,
      question: `Is it intended that ${ing} is taken in both ${names}?`,
      sourceIds,
      evidenceGrade: null,
      symptomQuestion: false,
    });
  }

  // (b) two or more different ingredients from one specific class
  const known = DUPLICATE_CLASSES.filter((c) => ctx.ix.classInfo(c));
  for (const classId of known) {
    const meds: MedInfo[] = [];
    const ingredients = new Set<string>();
    for (const m of ctx.meds) {
      const hits = m.ingredients.filter((id) => ctx.ix.classesOf(id).has(classId));
      if (!hits.length) continue;
      meds.push(m);
      for (const h of hits) ingredients.add(h);
    }
    if (meds.length < 2 || ingredients.size < 2) continue;
    const label = classLabel(ctx, classId);
    const names = listJoin(meds.map((m) => m.name));
    out.push({
      ruleId: `dup-class-${classId}`,
      category: "duplicate_class",
      medIds: meds.map((m) => m.med.id),
      title: `${meds.length} medicines of the same kind: ${label}`,
      plain: `${names} are all in the same group of medicines (${label}). Sometimes two of the same kind are intended; sometimes one was meant to replace the other.`,
      clinician: `Therapeutic duplication (${label}): ${[...ingredients].map((i) => ingredientName(ctx, i).toLowerCase()).sort().join(", ")}.`,
      question: `Are ${names} meant to be taken together, or was one meant to replace the other?`,
      sourceIds,
      evidenceGrade: null,
      symptomQuestion: false,
    });
  }
  return out;
}
