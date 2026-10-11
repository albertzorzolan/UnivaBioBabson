// Anticholinergic Cognitive Burden (ACB) scale: total over active medicines, band, and one finding at >= 3.
//
// Scoring: every anticholinergic ingredient of every active medicine counts (combination products score each
// ingredient), but an ingredient taken in two products counts once (contributor = the first medicine in the
// review's stable order), so the total is never inflated by a duplicate product. That duplicate is reported
// separately by the duplicate-ingredient rule.

import type { AcbSummary } from "../../../model/types";
import type { Draft, ReviewContext } from "../context";
import { ingredientName, namePart } from "../context";
import { listJoin, possessive } from "../text";

const DEFAULT_THRESHOLDS = { elevated: 3, high: 5 };

export function acbSummary(ctx: ReviewContext): AcbSummary {
  const contributors: AcbSummary["contributors"] = [];
  const counted = new Set<string>();
  for (const m of ctx.meds) {
    for (const id of m.ingredients) {
      if (counted.has(id)) continue;
      const score = ctx.ix.drug(id)?.acb ?? 0;
      if (score !== 1 && score !== 2 && score !== 3) continue;
      counted.add(id);
      contributors.push({ medId: m.med.id, ingredientId: id, score });
    }
  }
  contributors.sort((a, b) => b.score - a.score || (a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0));
  const total = contributors.reduce((s, c) => s + c.score, 0);
  const t = thresholds(ctx);
  const band: AcbSummary["band"] = total === 0 ? "none" : total >= t.high ? "high" : total >= t.elevated ? "elevated" : "low";
  return { total, band, contributors };
}

function thresholds(ctx: ReviewContext): { elevated: number; high: number } {
  const t = ctx.ix.kb.acbThresholds;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  return t && ok(t.elevated) && ok(t.high) ? { elevated: t.elevated, high: t.high } : DEFAULT_THRESHOLDS;
}

export function acbFinding(ctx: ReviewContext, acb: AcbSummary): Draft | null {
  const t = thresholds(ctx);
  if (acb.total < t.elevated) return null;
  const byMed = new Map<string, { ids: string[]; score: number }>();
  for (const c of acb.contributors) {
    const e = byMed.get(c.medId) ?? { ids: [], score: 0 };
    e.ids.push(c.ingredientId);
    e.score += c.score;
    byMed.set(c.medId, e);
  }
  const ordered = ctx.meds.filter((m) => byMed.has(m.med.id));
  ordered.sort((a, b) => (byMed.get(b.med.id)?.score ?? 0) - (byMed.get(a.med.id)?.score ?? 0));
  const parts = ordered.map((m) => {
    const e = byMed.get(m.med.id) as { ids: string[]; score: number };
    return `${namePart(ctx, m, e.ids)} ${e.score}`;
  });
  const clinParts = acb.contributors.map((c) => `${ingredientName(ctx, c.ingredientId).toLowerCase()} ${c.score}`);
  const sourceId = ctx.ix.kb.acbThresholds?.sourceId;
  return {
    ruleId: "acb-total",
    category: "anticholinergic_burden",
    medIds: ordered.map((m) => m.med.id),
    title: `Anticholinergic burden score (ACB): ${acb.total}`,
    plain:
      `${possessive(ctx.person)} medicines add up to ${acb.total} on the Anticholinergic Cognitive Burden (ACB) scale, a published list of medicines with anticholinergic effects: ${listJoin(parts)}. ` +
      `The scale's authors treat a total of ${t.elevated} or more as worth reviewing, because these effects (such as dry mouth, constipation, drowsiness and confusion) add up across medicines.`,
    clinician: `ACB total ${acb.total} (${clinParts.join(", ")}; published review threshold ${t.elevated} or more). In observational studies, ACB totals of ${t.elevated} or more were associated with cognitive impairment and higher mortality; the scale is not a prediction for an individual.`,
    question: `${possessive(ctx.person)} anticholinergic burden score (ACB) adds up to ${acb.total}. Could any of these medicines be reduced or replaced with one that has less anticholinergic effect?`,
    sourceIds: sourceId ? [sourceId] : [],
    evidenceGrade: null,
    symptomQuestion: false,
  };
}
