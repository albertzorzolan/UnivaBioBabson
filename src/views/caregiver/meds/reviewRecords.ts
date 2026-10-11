// Pure helpers for the Medication review screen: review decisions, saved visit questions, short labels and
// the diary counts shown next to findings. No React here (unit-tested).

import type {
  Finding,
  FindingCategory,
  ISODate,
  ISODateTime,
  MetricKey,
  ReviewDecision,
  ReviewStatus,
  StoreData,
} from "../../../model/types";
import { KB, classesOf } from "../../../kb";
import type { FridClass } from "../../../kb/types";
import { diaryFacts, type DiaryFacts } from "../../../engine/meds/diary";
import { latestCheckInPerDate, metricValue } from "../../../engine/timeline/metrics";
import { newId } from "../../../model/ids";

/** Short chip labels per category (the section headings use the engine's longer CATEGORY_LABEL). */
export const CATEGORY_CHIP: Record<FindingCategory, string> = {
  prescribing_cascade: "Possible cascade",
  beers_interaction: "Combinations",
  beers_condition: "Health conditions",
  beers_avoid: "Generally avoided",
  anticholinergic_burden: "Anticholinergic burden",
  fall_risk: "Falls",
  beers_renal: "Kidney function",
  beers_caution: "Use with caution",
  duplicate_class: "Same kind of medicine",
  cns_active_combo: "Brain-active medicines",
  monitoring: "What to watch for",
};

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  open: "Not reviewed yet",
  to_discuss: "To discuss",
  discussed: "Discussed",
  dismissed: "Not relevant",
};

/** Latest decision per finding key (later updatedAt wins). */
export function decisionMap(decisions: readonly ReviewDecision[]): Map<string, ReviewDecision> {
  const out = new Map<string, ReviewDecision>();
  for (const d of decisions ?? []) {
    const prev = out.get(d.findingKey);
    if (!prev || (d.updatedAt ?? "") >= (prev.updatedAt ?? "")) out.set(d.findingKey, d);
  }
  return out;
}

/** Replace (or clear, with status "open" and no note) the decision for one finding. */
export function setDecision(data: StoreData, findingKey: string, status: ReviewStatus, note: string, now: ISODateTime): StoreData {
  const others = data.reviewDecisions.filter((d) => d.findingKey !== findingKey);
  const clean = note.replace(/\s+/g, " ").trim().slice(0, 500);
  if (status === "open" && !clean) return { ...data, reviewDecisions: others };
  return { ...data, reviewDecisions: [...others, { findingKey, status, note: clean, updatedAt: now }] };
}

/** The `source` string used for questions saved from a finding. */
export function questionSource(findingKey: string): string {
  return `finding:${findingKey}`;
}

function normalize(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The saved question that came from this finding (or has the same wording), if any. */
export function savedQuestionFor(data: StoreData, f: Finding): StoreData["savedQuestions"][number] | undefined {
  const src = questionSource(f.key);
  const norm = normalize(f.question);
  return (data.savedQuestions ?? []).find((q) => q.source === src || normalize(q.text) === norm);
}

export function addSavedQuestion(data: StoreData, f: Finding, now: ISODateTime): StoreData {
  if (savedQuestionFor(data, f) || !f.question.trim()) return data;
  return {
    ...data,
    savedQuestions: [...(data.savedQuestions ?? []), { id: newId("q"), text: f.question.trim(), source: questionSource(f.key), createdAt: now }],
  };
}

export function removeSavedQuestion(data: StoreData, id: string): StoreData {
  return { ...data, savedQuestions: (data.savedQuestions ?? []).filter((q) => q.id !== id) };
}

/** Diary facts for the last 30 days — the same window and counting rules the review engine uses. */
export function recentDiary(data: StoreData, today: ISODate): DiaryFacts {
  return diaryFacts(data.checkIns ?? [], today);
}

/** "dizziness on 10 of 24 answered days" style counts for one metric in the recent window. */
export function metricCount(facts: DiaryFacts, m: MetricKey): { positive: number; answered: number } {
  return { positive: facts.positives.get(m)?.length ?? 0, answered: facts.answered.get(m) ?? 0 };
}

/** The fall-risk (FRID) classes a medicine belongs to, from the KB. */
export function fridClassesFor(ingredientIds: readonly string[]): FridClass[] {
  const classes = new Set(ingredientIds.flatMap((id) => classesOf(id)));
  return KB.frids.filter((f) => classes.has(f.classId));
}

/** ACB bands derived from the KB thresholds (falls back to the published 3 / 5 cut-offs). */
export function acbThresholds(): { elevated: number; high: number } {
  const t = KB.acbThresholds;
  const elevated = Number.isFinite(t?.elevated) && t.elevated > 1 ? t.elevated : 3;
  const high = Number.isFinite(t?.high) && t.high > elevated ? t.high : 5;
  return { elevated, high };
}

/** Group findings by category, keeping the engine's order (a group appears where its first finding is). */
export function groupByCategory(findings: readonly Finding[]): { category: FindingCategory; findings: Finding[] }[] {
  const groups = new Map<FindingCategory, Finding[]>();
  for (const f of findings) {
    const list = groups.get(f.category) ?? [];
    list.push(f);
    groups.set(f.category, list);
  }
  return [...groups.entries()].map(([category, list]) => ({ category, findings: list }));
}

/** Low ratings count as "present" for energy and sleep (1–2 of 5), matching the review engine. */
export function isPositiveValue(m: MetricKey, v: number): boolean {
  return m === "energy" || m === "sleep" ? v <= 2 : v === 1;
}

/**
 * The answered days behind a recent-window count, newest first, as rows for the "Show the records" drawer:
 * { date, value in words, counted }.
 */
export function metricRows(data: StoreData, m: MetricKey, from: ISODate, to: ISODate): { date: ISODate; value: string; counted: boolean }[] {
  return latestCheckInPerDate(data.checkIns ?? [])
    .filter((c) => c.date >= from && c.date <= to)
    .flatMap((c) => {
      const v = metricValue(c, m);
      if (v === null) return [];
      const value = m === "energy" || m === "sleep" ? `${v} of 5` : v === 1 ? "Yes" : "No";
      return [{ date: c.date, value, counted: isPositiveValue(m, v) }];
    })
    .reverse();
}

/** One review prompt that exists before and after a medicine change (same rule), with its old and new form. */
export interface PromptChange {
  before: Finding;
  after: Finding;
}

export interface PromptDiff {
  /** Prompts with no counterpart before the change. */
  fresh: Finding[];
  /** Prompts that exist before and after (same rule and category) but whose medicines changed. */
  changed: PromptChange[];
  /** Prompts that would no longer apply at all. */
  removed: Finding[];
}

const ruleKey = (f: Finding) => `${f.ruleId}|${f.category}`;
const overlap = (a: Finding, b: Finding) => a.medIds.filter((id) => b.medIds.includes(id)).length;

/**
 * Compare the review before and after a medicine change by rule (`ruleId|category`), not by finding key.
 * A combined prompt such as the ACB total gets a new key whenever its medicines change; that is the same
 * prompt changing, not one prompt cleared and another added. Within a rule, a leftover "after" prompt is paired
 * with the leftover "before" prompt it shares the most medicines with (or the only one left on each side).
 */
export function diffPrompts(before: readonly Finding[], after: readonly Finding[]): PromptDiff {
  const afterKeys = new Set(after.map((f) => f.key));
  const beforeKeys = new Set(before.map((f) => f.key));
  const groups = new Map<string, { b: Finding[]; a: Finding[] }>();
  const group = (k: string) => {
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { b: [], a: [] }));
    return g;
  };
  for (const f of before) if (!afterKeys.has(f.key)) group(ruleKey(f)).b.push(f);
  for (const f of after) if (!beforeKeys.has(f.key)) group(ruleKey(f)).a.push(f);

  const fresh: Finding[] = [];
  const changed: PromptChange[] = [];
  const removed: Finding[] = [];
  for (const { b, a } of groups.values()) {
    const left = [...b];
    for (const f of a) {
      let best = -1;
      let bestOverlap = 0;
      left.forEach((g, i) => {
        const n = overlap(f, g);
        if (n > bestOverlap) {
          best = i;
          bestOverlap = n;
        }
      });
      if (best < 0 && a.length === 1 && left.length === 1) best = 0;
      if (best >= 0) changed.push({ before: left.splice(best, 1)[0], after: f });
      else fresh.push(f);
    }
    // A leftover "before" prompt whose medicines all moved into an "after" prompt of the same rule merged into it.
    for (const g of left) if (!after.some((f) => ruleKey(f) === ruleKey(g) && g.medIds.every((id) => f.medIds.includes(id)))) removed.push(g);
  }
  // Keep the engine's order (most important first).
  const order = (list: readonly Finding[]) => (f: Finding) => list.indexOf(f);
  const afterOrder = order(after);
  fresh.sort((x, y) => afterOrder(x) - afterOrder(y));
  changed.sort((x, y) => afterOrder(x.after) - afterOrder(y.after));
  const beforeOrder = order(before);
  removed.sort((x, y) => beforeOrder(x) - beforeOrder(y));
  return { fresh, changed, removed };
}
