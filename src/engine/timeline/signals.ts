// Descriptive before/after statistics around medication changes (SPEC §6.3), plus the patient's weekly
// comparison and chart rows.
//
// What this engine does: for every medication start or stop in the last 180 days it compares how often each
// diary item was recorded in the 21 days before the change with the days after it (windows: see windows.ts),
// using answered days only. A difference becomes a SIGNAL only when it is both sizeable and has p < 0.05
// (strength "moderate" or "strong"); smaller "weak" differences stay in the per-event detail. Falls and near-falls
// are additionally listed by date, untested (sentinel.ts), because they are too rare for a test yet always worth
// raising.
//
// What it does NOT do: it never claims that a medicine is responsible for a change. Every sentence it renders
// describes recorded counts; the caveat in SIGNAL_CAVEAT travels with every signal shown to a family.
//
// Requirements: ≥ 5 days since the event (else too_recent), event ≤ 180 days ago (else outside_range), and for each
// metric ≥ 5 answered days in both windows; if no metric qualifies the event is "insufficient" with the exact reason,
// and if only some qualify the event is "ok" with a reason naming what was not compared.

import type {
  CheckIn,
  ISODate,
  MedEvent,
  MedTimeline,
  Medication,
  MetricKey,
  Signal,
  TimelineAnalysis,
  WeeklyTrend,
  WindowStat,
} from "../../model/types";
import { addDays, dateRange, daysBetween, formatLong, formatShort, isValidDate } from "../../model/dates";
import {
  METRICS,
  getMetric,
  latestCheckInPerDate,
  metricValue,
  summarizeValues,
  valuesInWindow,
  windowStatFromDays,
} from "./metrics";
import type { MetricDef } from "./metrics";
import { EPS, SIGNAL_CAVEAT, STRENGTH_LABEL, TIMELINE_RULES } from "./rules";
import { sentinelEvents } from "./sentinel";
import type { SentinelEvents } from "./sentinel";
import { fisherExact, formatPValue, mannWhitneyU } from "./stats";
import { capitalizedVerb, medName, oneDecimal, reasonPhrases, windowSpans } from "./text";
import { eventWindows, eventsForMed, nearbyDoseChanges, overlappingChanges } from "./windows";
import type { ChangeKind, EventWindows, MedChange } from "./windows";

// Re-exported so existing imports from "./signals" keep working (rules and windows moved to their own files).
export {
  MULTIPLE_COMPARISONS_NOTE,
  SENTINEL_NOTE,
  SIGNAL_CAVEAT,
  STRENGTH_LABEL,
  TIMELINE_METHOD_SUMMARY,
  TIMELINE_RULES,
} from "./rules";
export { eventWindows, eventsForMed, nearbyDoseChanges, overlappingChanges } from "./windows";
export type { ChangeKind, DateWindow, EventWindows, MedChange } from "./windows";

const STRENGTH_RANK: Record<Signal["strength"], number> = { strong: 0, moderate: 1, weak: 2 };

// ---------------------------------------------------------------------------
// Types beyond the shared contracts

/** One metric compared across one event — including metrics that did not produce a signal. */
export interface MetricComparison {
  metric: MetricKey;
  before: WindowStat;
  after: WindowStat;
  /** Both windows had enough answered days, so a test was run. */
  tested: boolean;
  /** after.value − before.value (rate points 0–1, or rating points on the 1–5 scale). */
  diff: number;
  /** Two-sided p-value; null when not tested. */
  pValue: number | null;
  test: Signal["test"];
  direction: "worse" | "better" | "same";
  /** "weak" is shown in the detail view only; signals are "strong" or "moderate" (TIMELINE_RULES.signalStrengths). */
  strength: Signal["strength"] | "none";
}

/** Full detail for one event: the MedTimeline contract plus windows, every metric comparison and falls. */
export interface EventAnalysis extends MedTimeline {
  /** null when the event was not compared (too_recent / outside_range). */
  windows: EventWindows | null;
  comparisons: MetricComparison[];
  /** Metrics with enough answered days on both sides to be tested (METRICS order). */
  testedMetrics: MetricKey[];
  overlappingMedIds: string[];
  /** Falls and near-falls in the windows, listed by date (also for too_recent events); null when none. */
  sentinel: SentinelEvents | null;
}

/** Falls and near-falls around one change, as listed in a TimelineReport. */
export interface SentinelReport extends SentinelEvents {
  /** Unique within one analysis, e.g. "falls:med-lorazepam:started". */
  id: string;
  overlappingMedIds: string[];
  /** The KB lists falls or near-falls as a recognized possible effect of the medicine. */
  knownEffect: boolean;
}

/** analyzeTimeline's result: the shared TimelineAnalysis contract plus the falls/near-falls listing. */
export interface TimelineReport extends TimelineAnalysis {
  /** Changes with at least one fall or near-fall in either window, most recent change first. */
  sentinels: SentinelReport[];
}

export interface AnalyzeTimelineInput {
  checkIns: CheckIn[];
  meds: Medication[];
  today: ISODate;
  /** Whether the knowledge base lists the metric as an adverse effect of the medicine (injected to keep this module pure). */
  isKnownEffect?: (med: Medication, m: MetricKey) => boolean;
  /** Optional medication event log; other medicines' dose changes near an event are then listed as overlapping. */
  medEvents?: MedEvent[];
}

/**
 * One chart row: `recorded` is 1 when a check-in exists that day (else 0), then a value per metric (1/0/null for
 * yes/no items, 1–5/null for ratings). Assignable to the SPEC §10 row type `{ date; [k: string]: number | null | string }`.
 */
export type DailyRow = { date: ISODate; recorded: 0 | 1 } & Record<MetricKey, number | null>;

function assertDate(value: ISODate, name: string): void {
  if (!isValidDate(value)) throw new RangeError(`${name} must be a valid YYYY-MM-DD date (got ${String(value)})`);
}

// ---------------------------------------------------------------------------
// Comparison of one metric

/** Strength from p-value and absolute difference; "none" when no threshold pair is met. */
export function classifyStrength(kind: MetricDef["kind"], pValue: number, diff: number): Signal["strength"] | "none" {
  const t = TIMELINE_RULES.thresholds[kind];
  const size = Math.abs(diff);
  for (const level of ["strong", "moderate", "weak"] as const) {
    if (pValue < t[level].p && size >= t[level].diff - EPS) return level;
  }
  return "none";
}

/** Whether a comparison of this strength is reported as a Signal (strong and moderate only). */
export function isSignalStrength(strength: MetricComparison["strength"]): strength is Signal["strength"] {
  return strength !== "none" && TIMELINE_RULES.signalStrengths.includes(strength);
}

function directionOf(def: MetricDef, diff: number): MetricComparison["direction"] {
  if (Math.abs(diff) < EPS) return "same";
  return diff > 0 === def.higherIsWorse ? "worse" : "better";
}

/** Compare one metric across an event's windows. `days` must hold at most one check-in per date. */
export function compareMetric(days: CheckIn[], metric: MetricKey, windows: EventWindows): MetricComparison {
  const def = getMetric(metric);
  const beforeValues = valuesInWindow(days, metric, windows.before.from, windows.before.to);
  const afterValues = valuesInWindow(days, metric, windows.after.from, windows.after.to);
  const before = summarizeValues(beforeValues, windows.before.from, windows.before.to);
  const after = summarizeValues(afterValues, windows.after.from, windows.after.to);
  const test: Signal["test"] = def.kind === "boolean" ? "fisher_exact" : "mann_whitney";
  const tested = before.answered >= TIMELINE_RULES.minAnsweredDays && after.answered >= TIMELINE_RULES.minAnsweredDays;
  const diff = before.answered && after.answered ? after.value - before.value : 0;
  if (!tested) return { metric, before, after, tested, diff, pValue: null, test, direction: "same", strength: "none" };

  const pValue =
    def.kind === "boolean"
      ? // Table [[afterPos, afterNeg], [beforePos, beforeNeg]]
        fisherExact(after.positive, after.answered - after.positive, before.positive, before.answered - before.positive)
      : mannWhitneyU(afterValues, beforeValues).p;
  return {
    metric,
    before,
    after,
    tested,
    diff,
    pValue,
    test,
    direction: directionOf(def, diff),
    strength: classifyStrength(def.kind, pValue, diff),
  };
}

/**
 * Whether a recorded change is consistent with a KB-listed ADVERSE effect: worse after a start, or better after a
 * stop (the "dechallenge" pattern). An improvement after a start is never labelled a known effect, so the UI never
 * pairs "energy rated higher" with "low energy is a recognized possible effect".
 */
export function isAdverseConsistent(kind: ChangeKind, direction: MetricComparison["direction"]): boolean {
  return kind === "started" ? direction === "worse" : direction === "better";
}

// ---------------------------------------------------------------------------
// Text

/**
 * Code-rendered sentence for a signal, e.g.
 * "Dizziness was recorded on 9 of 14 answered days from Sep 24, when Lorazepam (Ativan) was started, through Oct 10,
 *  compared with 2 of 19 answered days in the 21 days before."
 * For a stop: "… from Aug 21, after X was stopped on Aug 20, through Sep 10, compared with … in the 21 days through Aug 20."
 */
export function signalSentence(med: Medication, kind: ChangeKind, metric: MetricKey, before: WindowStat, after: WindowStat): string {
  const def = getMetric(metric);
  const { afterSpan, beforeSpan } = windowSpans(med, kind, before, after);
  if (def.kind === "boolean") {
    return (
      `${def.subject} was recorded on ${after.positive} of ${after.answered} answered days ${afterSpan}, ` +
      `compared with ${before.positive} of ${before.answered} answered days ${beforeSpan}.`
    );
  }
  return (
    `${def.subject} averaged ${oneDecimal(after.value)} out of 5 on ${after.answered} answered days ${afterSpan}, ` +
    `compared with ${oneDecimal(before.value)} out of 5 on ${before.answered} answered days ${beforeSpan}.`
  );
}

function answeredDaysPhrase(n: number): string {
  if (n === 0) return "No answered days";
  return n === 1 ? "Only 1 answered day" : `Only ${n} answered days`;
}

/** Exact reason no metric could be compared, e.g. "Only 3 answered days before Sep 24 — at least 5 are needed." */
function insufficientReason(comparisons: MetricComparison[], windows: EventWindows, change: MedChange, today: ISODate): string {
  const need = TIMELINE_RULES.minAnsweredDays;
  const bestBefore = Math.max(0, ...comparisons.map((c) => c.before.answered));
  const bestAfter = Math.max(0, ...comparisons.map((c) => c.after.answered));
  const p = reasonPhrases(change.kind, windows, today);
  if (bestBefore < need && bestAfter < need) {
    const later = bestAfter === 0 ? "none" : `only ${bestAfter}`;
    return `${answeredDaysPhrase(bestBefore)} ${p.before} and ${later} ${p.afterShort} — at least ${need} are needed in each.`;
  }
  if (bestBefore < need) return `${answeredDaysPhrase(bestBefore)} ${p.before} — at least ${need} are needed.`;
  if (bestAfter < need) return `${answeredDaysPhrase(bestAfter)} ${p.afterLong} — at least ${need} are needed.`;
  return `No diary question was answered on at least ${need} days both ${p.before} and ${p.afterLong}.`;
}

function itemList(keys: MetricKey[]): string {
  return keys.map((k) => getMetric(k).label.toLowerCase()).join(", ");
}

/**
 * When only some items could be compared, say which — so a missing signal is never read as "compared, nothing
 * changed". null when every item was compared.
 */
function partialReason(comparisons: MetricComparison[], windows: EventWindows, change: MedChange, today: ISODate): string | null {
  const tested = comparisons.filter((c) => c.tested).map((c) => c.metric);
  const untested = comparisons.filter((c) => !c.tested).map((c) => c.metric);
  if (untested.length === 0) return null;
  const need = TIMELINE_RULES.minAnsweredDays;
  const p = reasonPhrases(change.kind, windows, today);
  const total = comparisons.length;
  if (tested.length <= untested.length) {
    return (
      `Compared only ${tested.length} of ${total} diary items (${itemList(tested)}). The others had fewer than ` +
      `${need} answered days ${p.before} or ${p.afterLong}.`
    );
  }
  return (
    `Compared ${tested.length} of ${total} diary items. Not compared, with fewer than ${need} answered days ` +
    `${p.before} or ${p.afterLong}: ${itemList(untested)}.`
  );
}

function tooRecentReason(change: MedChange, days: number): string {
  const ago = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return (
    `${capitalizedVerb(change.kind)} ${ago} (${formatShort(change.date)}) — at least ` +
    `${TIMELINE_RULES.minDaysSinceEvent} days after a change are needed before comparing.`
  );
}

function outsideRangeReason(change: MedChange): string {
  return (
    `${capitalizedVerb(change.kind)} on ${formatLong(change.date)}, more than ${TIMELINE_RULES.lookbackDays} days ago — ` +
    `Kinwise compares only changes from the last ${TIMELINE_RULES.lookbackDays} days.`
  );
}

// ---------------------------------------------------------------------------
// Event + timeline analysis

/** Within one strength level: KB-consistent changes first, then other worsening, then improvements. */
function concernRank(s: Signal): number {
  if (s.knownEffect) return 0;
  return s.direction === "worse" ? 1 : 2;
}

/**
 * Ordering for signals: strength; then, within a strength level, changes consistent with a KB-listed adverse
 * effect, then other recorded worsening, then improvements (a medication-review brief leads with possible
 * side effects); then p-value; ties broken deterministically (most recent change, then id).
 */
export function compareSignals(a: Signal, b: Signal): number {
  return (
    STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] ||
    concernRank(a) - concernRank(b) ||
    a.pValue - b.pValue ||
    (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export interface AnalyzeEventInput {
  /** Check-ins with at most one per date (use `latestCheckInPerDate`). */
  days: CheckIn[];
  med: Medication;
  change: MedChange;
  meds: Medication[];
  today: ISODate;
  isKnownEffect?: (med: Medication, m: MetricKey) => boolean;
  medEvents?: MedEvent[];
}

/** Analyse one medication change in full detail (all metric comparisons, windows, status, signals and falls). */
export function analyzeEvent(input: AnalyzeEventInput): EventAnalysis {
  const { days, med, change, meds, today } = input;
  const isKnownEffect = input.isKnownEffect ?? (() => false);
  const overlappingMedIds = overlappingChanges(med, change, meds, today, input.medEvents);
  const base = { medicationId: med.id, event: change.kind, eventDate: change.date, overlappingMedIds };
  const since = daysBetween(change.date, today);

  if (since > TIMELINE_RULES.lookbackDays) {
    return {
      ...base,
      status: "outside_range",
      reason: outsideRangeReason(change),
      signals: [],
      windows: null,
      comparisons: [],
      testedMetrics: [],
      sentinel: null,
    };
  }
  // Falls are listed even when it is too early to compare anything else.
  const sentinel = sentinelEvents(days, med, change, today);
  if (since < TIMELINE_RULES.minDaysSinceEvent) {
    return {
      ...base,
      status: "too_recent",
      reason: tooRecentReason(change, since),
      signals: [],
      windows: null,
      comparisons: [],
      testedMetrics: [],
      sentinel,
    };
  }

  const windows = eventWindows(med, change, today);
  const comparisons = METRICS.map((m) => compareMetric(days, m.key, windows));
  const testedMetrics = comparisons.filter((c) => c.tested).map((c) => c.metric);
  if (testedMetrics.length === 0) {
    return {
      ...base,
      status: "insufficient",
      reason: insufficientReason(comparisons, windows, change, today),
      signals: [],
      windows,
      comparisons,
      testedMetrics,
      sentinel,
    };
  }

  const signals: Signal[] = [];
  for (const c of comparisons) {
    if (!isSignalStrength(c.strength) || c.pValue === null || c.direction === "same") continue;
    signals.push({
      id: `sig:${med.id}:${c.metric}:${change.kind}`,
      medicationId: med.id,
      event: change.kind,
      eventDate: change.date,
      metric: c.metric,
      before: c.before,
      after: c.after,
      direction: c.direction,
      strength: c.strength,
      pValue: c.pValue,
      test: c.test,
      overlappingMedIds,
      knownEffect: isAdverseConsistent(change.kind, c.direction) && isKnownEffect(med, c.metric),
      text: signalSentence(med, change.kind, c.metric, c.before, c.after),
    });
  }
  signals.sort(compareSignals);
  return {
    ...base,
    status: "ok",
    reason: partialReason(comparisons, windows, change, today),
    signals,
    windows,
    comparisons,
    testedMetrics,
    sentinel,
  };
}

/** Returns `id`, or `id:<date>` / `id:<date>:<n>` when it is already taken (duplicate medication ids in imported data). */
function uniqueId(id: string, date: ISODate, used: Set<string>): string {
  let out = id;
  if (used.has(out)) out = `${id}:${date}`;
  for (let n = 2; used.has(out); n++) out = `${id}:${date}:${n}`;
  used.add(out);
  return out;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byRecentChange(a: { eventDate: ISODate; medicationId: string; event: ChangeKind }, b: typeof a): number {
  return (
    (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0) ||
    (a.medicationId < b.medicationId ? -1 : a.medicationId > b.medicationId ? 1 : 0) ||
    (a.event < b.event ? -1 : a.event > b.event ? 1 : 0)
  );
}

/**
 * Before/after analysis for every medication start and stop (SPEC §6.3). Pure: `today` is an input.
 * perMed is ordered most recent change first; signals strongest first; sentinels most recent change first.
 * The result is a TimelineAnalysis (shared contract) with an extra `sentinels` listing.
 */
export function analyzeTimeline(input: AnalyzeTimelineInput): TimelineReport {
  assertDate(input.today, "today");
  const days = latestCheckInPerDate(input.checkIns);
  const isKnownEffect = input.isKnownEffect ?? (() => false);
  const perMed: MedTimeline[] = [];
  const sentinels: SentinelReport[] = [];
  const usedSignalIds = new Set<string>();
  const usedSentinelIds = new Set<string>();

  // Process changes in output order so that, if two records share an id, the suffixes are assigned
  // deterministically whatever the input order (records with the same id are told apart by name, then dates).
  const changes = input.meds
    .flatMap((med) => eventsForMed(med, input.today).map((change) => ({ med, change })))
    .sort(
      (x, y) =>
        byRecentChange(
          { eventDate: x.change.date, medicationId: x.med.id, event: x.change.kind },
          { eventDate: y.change.date, medicationId: y.med.id, event: y.change.kind },
        ) ||
        compareText(x.med.name, y.med.name) ||
        compareText(x.med.startDate, y.med.startDate) ||
        compareText(x.med.endDate ?? "", y.med.endDate ?? ""),
    );

  for (const { med, change } of changes) {
    const ev = analyzeEvent({
      days,
      med,
      change,
      meds: input.meds,
      today: input.today,
      isKnownEffect,
      medEvents: input.medEvents,
    });
    const signals = ev.signals.map((s) => ({ ...s, id: uniqueId(s.id, s.eventDate, usedSignalIds) }));
    // Keep the shared contract shape (EventAnalysis detail is available via analyzeEvent).
    perMed.push({
      medicationId: ev.medicationId,
      event: ev.event,
      eventDate: ev.eventDate,
      status: ev.status,
      reason: ev.reason,
      signals,
    });
    if (ev.sentinel) {
      sentinels.push({
        ...ev.sentinel,
        id: uniqueId(`falls:${med.id}:${change.kind}`, change.date, usedSentinelIds),
        overlappingMedIds: ev.overlappingMedIds,
        knownEffect: isKnownEffect(med, "fall") || isKnownEffect(med, "nearFall"),
      });
    }
  }
  const signals = perMed.flatMap((p) => p.signals).sort(compareSignals);
  return { perMed, signals, sentinels };
}

/** Falls and near-falls around every recent medication change (the `sentinels` part of analyzeTimeline). */
export function timelineSentinels(input: AnalyzeTimelineInput): SentinelReport[] {
  return analyzeTimeline(input).sentinels;
}

// ---------------------------------------------------------------------------
// Signal description for the UI and the brief

export interface SignalDescription {
  /** Short heading, e.g. "Dizziness recorded more often after Lorazepam (Ativan) was started". */
  headline: string;
  /** The code-rendered count sentence (signal.text). */
  sentence: string;
  strengthLabel: string;
  /** e.g. "Fisher's exact test, two-sided p = 0.016." */
  statistics: string;
  /** Overlapping medicine changes, or null when there were none. */
  overlap: string | null;
  /** Knowledge-base link, or null when the KB does not list this effect (or the change is an improvement). */
  knownEffect: string | null;
  caveat: string;
}

function describeChange(other: Medication, center: ISODate, today: ISODate, medEvents: MedEvent[]): string {
  const lo = addDays(center, -TIMELINE_RULES.overlapDays);
  const hi = addDays(center, TIMELINE_RULES.overlapDays);
  const parts = eventsForMed(other, today)
    .filter((e) => e.date >= lo && e.date <= hi)
    .map((e) => `${e.kind} ${formatShort(e.date)}`);
  for (const d of nearbyDoseChanges(other.id, center, today, medEvents)) parts.push(`dose changed ${formatShort(d)}`);
  return `${medName(other)} (${parts.length > 0 ? parts.join(", ") : "dose changed"})`;
}

/**
 * Plain-language pieces for showing a signal: headline, counts, statistics, overlaps, KB link and caveat.
 * Pass the same `today` (and `medEvents`, if any) the analysis used, so overlaps are labelled as they were counted.
 */
export function describeSignal(signal: Signal, meds: Medication[], today: ISODate, medEvents: MedEvent[] = []): SignalDescription {
  const def = getMetric(signal.metric);
  const med = meds.find((m) => m.id === signal.medicationId);
  const name = medName(med);
  const higher = signal.after.value > signal.before.value;
  const change =
    def.kind === "boolean" ? `recorded ${higher ? "more" : "less"} often` : `rated ${higher ? "higher" : "lower"}`;
  const others = signal.overlappingMedIds
    .map((id) => meds.find((m) => m.id === id))
    .filter((m): m is Medication => m !== undefined)
    .map((m) => describeChange(m, signal.eventDate, today, medEvents));
  const testName = signal.test === "fisher_exact" ? "Fisher's exact test" : "Mann–Whitney U test";
  return {
    headline: `${def.label} ${change} after ${name} was ${signal.event}`,
    sentence: signal.text,
    strengthLabel: STRENGTH_LABEL[signal.strength],
    statistics: `${testName}, two-sided ${formatPValue(signal.pValue)}.`,
    overlap:
      others.length > 0
        ? `Other medicine changes within ${TIMELINE_RULES.overlapDays} days of ${formatShort(signal.eventDate)}: ` +
          `${others.join("; ")}. Changes this close together are hard to tell apart.`
        : null,
    knownEffect: signal.knownEffect
      ? `Kinwise's reference set lists ${def.effectNoun} as a recognized possible effect of ${name}.`
      : null,
    caveat: SIGNAL_CAVEAT,
  };
}

// ---------------------------------------------------------------------------
// Weekly comparison (patient view)

function relation(diff: number, same: boolean): string {
  if (same || Math.abs(diff) < EPS) return "compared with";
  return diff > 0 ? "up from" : "down from";
}

function weeklyText(def: MetricDef, thisWeek: WindowStat, lastWeek: WindowStat, same: boolean): string {
  const diff = thisWeek.value - lastWeek.value;
  const rel = relation(diff, same);
  if (def.kind === "scale") {
    return (
      `Your ${def.patientNoun} averaged ${oneDecimal(thisWeek.value)} out of 5 over ${thisWeek.answered} days this week, ` +
      `${rel} ${oneDecimal(lastWeek.value)} over ${lastWeek.answered} days last week.`
    );
  }
  if (thisWeek.positive === 0 && lastWeek.positive === 0) {
    return `No ${def.patientNoun} noted on the ${thisWeek.answered} days you answered this week or the ${lastWeek.answered} days last week.`;
  }
  if (thisWeek.positive === 0) {
    return (
      `No ${def.patientNoun} noted on the ${thisWeek.answered} days you answered this week, ` +
      `${rel} ${lastWeek.positive} of ${lastWeek.answered} last week.`
    );
  }
  return (
    `You noted ${def.patientPhrase} on ${thisWeek.positive} of ${thisWeek.answered} days this week, ` +
    `${rel} ${lastWeek.positive} of ${lastWeek.answered} last week.`
  );
}

/**
 * This week (today−6…today) vs last week (today−13…today−7) for every metric, in METRICS order.
 * "not_enough" when either week has fewer than 3 answered days. Texts describe recorded counts only.
 * Direction uses metric polarity (more dizziness = "worse"; higher energy = "better"); small changes are "same".
 */
export function weeklyTrends(checkIns: CheckIn[], today: ISODate): WeeklyTrend[] {
  assertDate(today, "today");
  const days = latestCheckInPerDate(checkIns);
  const thisWindow = { from: addDays(today, -6), to: today };
  const lastWindow = { from: addDays(today, -13), to: addDays(today, -7) };
  const rules = TIMELINE_RULES.weekly;
  return METRICS.map((def) => {
    const thisWeek = windowStatFromDays(days, def.key, thisWindow.from, thisWindow.to);
    const lastWeek = windowStatFromDays(days, def.key, lastWindow.from, lastWindow.to);
    if (thisWeek.answered < rules.minAnsweredDays || lastWeek.answered < rules.minAnsweredDays) {
      return {
        metric: def.key,
        direction: "not_enough",
        thisWeek,
        lastWeek,
        text: `Not enough entries yet to compare ${def.patientNoun} with last week.`,
      };
    }
    const diff = thisWeek.value - lastWeek.value;
    const threshold = def.kind === "boolean" ? rules.booleanDiff : rules.scaleDiff;
    const same = Math.abs(diff) < threshold - EPS;
    const direction: WeeklyTrend["direction"] = same ? "same" : diff > 0 === def.higherIsWorse ? "worse" : "better";
    return { metric: def.key, direction, thisWeek, lastWeek, text: weeklyText(def, thisWeek, lastWeek, same) };
  });
}

/** Alias using the name in SPEC §6.3. */
export const weeklySummary = weeklyTrends;

// ---------------------------------------------------------------------------
// Chart rows

/**
 * One row per calendar date from `from` to `to` inclusive (empty when from > to or a date is malformed).
 * `recorded` is 1 when a check-in exists that day, else 0; unanswered questions and missing days are null, so
 * charts show gaps rather than zeros.
 */
export function dailySeries(checkIns: CheckIn[], from: ISODate, to: ISODate): DailyRow[] {
  if (!isValidDate(from) || !isValidDate(to) || from > to) return [];
  const byDate = new Map(latestCheckInPerDate(checkIns).map((c) => [c.date, c]));
  return dateRange(from, to).map((date) => {
    const c = byDate.get(date);
    const row = { date, recorded: c ? 1 : 0 } as DailyRow;
    for (const m of METRICS) row[m.key] = c ? metricValue(c, m.key) : null;
    return row;
  });
}
