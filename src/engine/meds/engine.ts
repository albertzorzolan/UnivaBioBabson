// The deterministic medication-review engine (SPEC §6.2, §12), parameterised by a KnowledgeBase value.
// src/engine/meds/review.ts binds it to the compiled KB; tests can bind it to fixtures.
//
// Pipeline: context (active matched medicines, effective conditions, diary facts) -> rule modules produce
// drafts -> dedupe -> relatedSymptoms + signalIds -> symptom questions -> language guard -> stable sort.

import type { Finding, Medication, MedReview, MetricKey } from "../../model/types";
import type { KnowledgeBase } from "../../kb/types";
import { buildContext, isActive, type Draft, type ReviewContext, type ReviewInput } from "./context";
import { positivesSince, NEW_MED_DAYS } from "./diary";
import { BEERS_CATEGORIES, categoryRank } from "./labels";
import { acbFinding, acbSummary } from "./rules/acb";
import { beersFindings } from "./rules/beers";
import { cascadeFindings } from "./rules/cascades";
import { duplicateFindings } from "./rules/duplicates";
import { fallRisk } from "./rules/falls";
import { monitoringFindings } from "./rules/monitoring";
import {
  METRIC_NOUN,
  METRIC_ORDER,
  REQUIRED_NOTICE,
  guardLanguage,
  listJoin,
  medName,
  possessive,
  shortDate,
} from "./text";

export type { ReviewInput } from "./context";

/** Active = no end date, or an end date today or later (SPEC §6.2). */
export function activeMeds(meds: Medication[], today: string): Medication[] {
  return (meds ?? []).filter((m) => isActive(m, today));
}

export function reviewWithKb(kb: KnowledgeBase, input: ReviewInput): MedReview {
  const { ctx, unmatched } = buildContext(kb, input);
  const acb = acbSummary(ctx);
  const falls = fallRisk(ctx);
  const beers = beersFindings(ctx);

  let drafts: Draft[] = [
    ...beers.drafts,
    ...cascadeFindings(ctx),
    ...duplicateFindings(ctx),
    ...monitoringFindings(ctx),
  ];
  const acbDraft = acbFinding(ctx, acb);
  if (acbDraft) drafts.push(acbDraft);
  if (falls.draft) drafts.push(falls.draft);
  if (!ctx.beers) drafts = drafts.filter((d) => !BEERS_CATEGORIES.includes(d.category));
  drafts = dedupe(drafts);

  const findings = drafts.map((d) => finalize(ctx, d));
  findings.sort(compareFindings);

  return {
    findings,
    acb,
    fallRiskMedIds: falls.medIds,
    unmatchedMedIds: unmatched.map((m) => m.id),
    effectiveConditions: [...ctx.conditions.entries()].map(([tag, from]) => ({ tag, from })),
    notices: notices(ctx, unmatched, beers.renalUnchecked.map((m) => m.name)),
    kbVersion: kb.version,
  };
}

// ---------------------------------------------------------------------------------------------

export function findingKey(ruleId: string, medIds: readonly string[]): string {
  return `${ruleId}:${[...medIds].sort().join("+")}`;
}

/**
 * Remove overlapping findings:
 *  - identical key (same rule, same medicines) -> keep the first;
 *  - same signature (e.g. ">= 2 strong anticholinergics" and an "anticholinergic + anticholinergic" pair rule)
 *    and medicines that are a subset of another's -> keep the larger (or, if equal, the lower priority value).
 */
export function dedupe(drafts: Draft[]): Draft[] {
  const byKey = new Map<string, Draft>();
  for (const d of drafts) {
    const k = findingKey(d.ruleId, d.medIds);
    if (!byKey.has(k)) byKey.set(k, d);
  }
  const list = [...byKey.values()];
  const drop = new Set<Draft>();
  for (const a of list) {
    if (!a.signature) continue;
    for (const b of list) {
      if (a === b || b.signature !== a.signature || drop.has(b) || drop.has(a)) continue;
      const aInB = a.medIds.every((id) => b.medIds.includes(id));
      if (!aInB) continue;
      const bInA = b.medIds.every((id) => a.medIds.includes(id));
      if (bInA) {
        // same medicines: keep the preferred one (lower priority, then rule id)
        const pa = a.priority ?? 9;
        const pb = b.priority ?? 9;
        if (pa > pb || (pa === pb && a.ruleId > b.ruleId)) drop.add(a);
        else drop.add(b);
      } else {
        drop.add(a);
      }
    }
  }
  return list.filter((d) => !drop.has(d));
}

/** Diary metrics linked to a finding: known effects of its medicines recorded present in the last 30 days. */
function relatedSymptoms(ctx: ReviewContext, d: Draft): { metrics: MetricKey[]; since: string | null } {
  const found = new Set<MetricKey>();
  let earliestNewStart: string | null = null;
  for (const id of d.medIds) {
    const m = ctx.meds.find((x) => x.med.id === id);
    if (!m) continue;
    const isNew = m.daysOn >= 0 && m.daysOn < NEW_MED_DAYS;
    const since = isNew ? m.med.startDate : ctx.diary.recentFrom;
    if (isNew && (earliestNewStart === null || m.med.startDate < earliestNewStart)) earliestNewStart = m.med.startDate;
    const effects = new Set<MetricKey>();
    for (const ing of m.ingredients) for (const e of ctx.ix.drug(ing)?.effects ?? []) effects.add(e);
    for (const e of d.extraMetrics ?? []) effects.add(e);
    for (const e of effects) if (positivesSince(ctx.diary, e, since).length > 0) found.add(e);
  }
  const metrics = METRIC_ORDER.filter((k) => found.has(k));
  const allNew = d.medIds.every((id) => {
    const m = ctx.meds.find((x) => x.med.id === id);
    return m ? m.daysOn >= 0 && m.daysOn < NEW_MED_DAYS : false;
  });
  return { metrics, since: allNew ? earliestNewStart : null };
}

/** Categories whose concern is the sedating, fall-linked or anticholinergic effect itself: any diary signal fits. */
const ANY_SIGNAL_CATEGORIES = new Set<Finding["category"]>(["beers_avoid", "fall_risk", "anticholinergic_burden", "cns_active_combo"]);

/**
 * Does a timeline signal belong on this finding? Only when its diary item is one the finding is about: a related
 * symptom, a recognised effect of one of its medicines, or a metric the rule declares. So a warfarin + ibuprofen
 * bleeding prompt never shows a drowsiness signal as "Seen in the diary".
 */
function signalFits(ctx: ReviewContext, d: Draft, related: MetricKey[], metric: MetricKey): boolean {
  if (ANY_SIGNAL_CATEGORIES.has(d.category)) return true;
  if (related.includes(metric) || (d.extraMetrics ?? []).includes(metric)) return true;
  return d.medIds.some((id) => ctx.meds.find((x) => x.med.id === id)?.ingredients.some((ing) => (ctx.ix.drug(ing)?.effects ?? []).includes(metric)));
}

function finalize(ctx: ReviewContext, d: Draft): Finding {
  const { metrics, since } = relatedSymptoms(ctx, d);
  const ids = new Set(d.medIds);
  const signalIds = ctx.signals.filter((s) => ids.has(s.medicationId) && signalFits(ctx, d, metrics, s.metric)).map((s) => s.id);
  let question = d.question.trim();
  if (d.symptomQuestion && metrics.length > 0) {
    const meds = d.medIds.map((id) => ctx.meds.find((m) => m.med.id === id)?.name).filter((n): n is string => !!n);
    const when = since ? ` since ${shortDate(since)}` : " in the last 30 days";
    const symptoms = listJoin(metrics.map((k) => METRIC_NOUN[k]));
    const lead = `Could ${listJoin(meds)} be contributing to the ${symptoms} recorded in the diary${when}?`;
    question = question ? `${lead} ${question}` : lead;
  }
  return {
    key: findingKey(d.ruleId, d.medIds),
    ruleId: d.ruleId,
    category: d.category,
    title: guardLanguage(d.title),
    medIds: [...d.medIds],
    plain: guardLanguage(d.plain),
    clinician: guardLanguage(d.clinician),
    question: guardLanguage(question),
    sourceIds: [...new Set(d.sourceIds.filter((s) => typeof s === "string" && s))],
    evidenceGrade: d.evidenceGrade,
    relatedSymptoms: metrics,
    signalIds,
  };
}

/** Findings linked to recorded symptoms first, then category order (SPEC §6.2), then title, then key. */
export function compareFindings(a: Finding, b: Finding): number {
  const sa = a.relatedSymptoms.length > 0 ? 0 : 1;
  const sb = b.relatedSymptoms.length > 0 ? 0 : 1;
  if (sa !== sb) return sa - sb;
  const ca = categoryRank(a.category);
  const cb = categoryRank(b.category);
  if (ca !== cb) return ca - cb;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function notices(ctx: ReviewContext, unmatched: Medication[], renalUnchecked: string[]): string[] {
  const out: string[] = [];
  if (!ctx.beers) {
    // Age 0 means "not entered" (an emptied record); the sentence then says so instead of "recorded as 0".
    const who = possessive(ctx.person);
    const ageText = ctx.profile.age > 0 ? `${who.charAt(0).toUpperCase()}${who.slice(1)} age is recorded as ${ctx.profile.age}` : "No age is recorded";
    out.push(
      `The AGS Beers Criteria® apply to adults aged 65 and older. ${ageText}, so Beers-based checks (medicines to avoid, combinations, conditions, kidney function) were not applied.`,
    );
  }
  if (unmatched.length) {
    const names = listJoin(unmatched.map((m) => medName(m)));
    out.push(
      `${unmatched.length === 1 ? "1 medicine is" : `${unmatched.length} medicines are`} not in Kinwise's reference set, so ${unmatched.length === 1 ? "it was" : "they were"} not checked: ${names}. Ask the pharmacist to review ${unmatched.length === 1 ? "it" : "them"}.`,
    );
  }
  if (ctx.beers && renalUnchecked.length) {
    out.push(
      `${listJoin(renalUnchecked)} ${renalUnchecked.length === 1 ? "has" : "have"} kidney-function criteria in AGS Beers 2023; whether they apply depends on kidney function — Kinwise doesn't know ${possessive(ctx.person)}. Adding a creatinine clearance (CrCl) in Settings lets Kinwise check them.`,
    );
  }
  out.push(REQUIRED_NOTICE);
  return out.map(guardNotice);
}

function guardNotice(n: string): string {
  // The required notice contains the one allowed use of "safe"; everything else passes the language guard.
  return n === REQUIRED_NOTICE ? n : guardLanguage(n);
}
