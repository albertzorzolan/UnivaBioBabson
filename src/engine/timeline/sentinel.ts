// Falls and near-falls around medication changes: LISTED BY DATE, NEVER TESTED.
//
// Why a separate path: a fall is a sentinel event. A family records perhaps one to three in a month, which is far
// too few for any significance test (on the demo diary, 1 fall + 2 near-falls in the 17 days after a start vs 1
// near-fall in the 21 days before gives Fisher p ≈ 0.3–0.6). Yet clinically every fall on a fall-risk medicine is
// worth raising at the visit (CDC STEADI; AGS Beers 2023 lists history of falls as a drug–disease consideration).
// So instead of a p-value and a strength, this module reports the counts and the exact dates in both windows, in a
// code-rendered sentence such as:
//   "1 fall (Oct 5) and 2 near-falls (Sep 26, Sep 29) were recorded from Sep 24, when Lorazepam (Ativan) was
//    started, through Oct 10, compared with 1 near-fall (Sep 10) in the 21 days before."
// The sentence describes what was recorded; it makes no claim about why.

import type { CheckIn, ISODate, Medication, MetricKey, WindowStat } from "../../model/types";
import { metricValue, summarizeValues } from "./metrics";
import { dateList, windowSpans } from "./text";
import { eventWindows } from "./windows";
import type { ChangeKind, DateWindow, EventWindows, MedChange } from "./windows";

export type SentinelMetric = Extract<MetricKey, "fall" | "nearFall">;

/** The diary items treated as sentinel events, in sentence order. */
export const SENTINEL_METRICS: readonly SentinelMetric[] = ["fall", "nearFall"];

/** Evidence sentences are restated by the brief and the AI, whose checker allows at most 280 characters. */
export const MAX_SENTENCE_LENGTH = 280;

const WORDS: Record<SentinelMetric, { one: string; many: string }> = {
  fall: { one: "fall", many: "falls" },
  nearFall: { one: "near-fall", many: "near-falls" },
};

/** One sentinel item in both windows: answered-day stats plus the dates it was recorded. */
export interface SentinelCount {
  metric: SentinelMetric;
  /** positive = days it was recorded; answered = days the question was answered. */
  before: WindowStat;
  after: WindowStat;
  beforeDates: ISODate[];
  afterDates: ISODate[];
}

/** Falls and near-falls around one medication change. */
export interface SentinelEvents {
  medicationId: string;
  event: ChangeKind;
  eventDate: ISODate;
  windows: EventWindows;
  /** Always both items (fall, then near-fall), including zero counts, so "none" can be stated precisely. */
  counts: SentinelCount[];
  /** Days on which the fall or the near-fall question (or both) was answered, per window. */
  answeredDays: { before: number; after: number };
  /** Falls + near-falls recorded, per window. */
  totals: { before: number; after: number };
  /** Code-rendered sentence with counts and dates (see the header comment). */
  text: string;
}

function countIn(days: CheckIn[], metric: SentinelMetric, w: DateWindow): { stat: WindowStat; dates: ISODate[] } {
  const values: number[] = [];
  const dates: ISODate[] = [];
  for (const c of days) {
    if (c.date < w.from || c.date > w.to) continue;
    const v = metricValue(c, metric);
    if (v === null) continue;
    values.push(v);
    if (v === 1) dates.push(c.date);
  }
  return { stat: summarizeValues(values, w.from, w.to), dates: dates.sort() };
}

function answeredEither(days: CheckIn[], w: DateWindow): number {
  return days.filter((c) => c.date >= w.from && c.date <= w.to && SENTINEL_METRICS.some((m) => metricValue(c, m) !== null))
    .length;
}

function listRecorded(
  counts: SentinelCount[],
  side: "before" | "after",
  withDates: boolean,
): { text: string; total: number } {
  const parts: string[] = [];
  let total = 0;
  for (const c of counts) {
    const dates = side === "before" ? c.beforeDates : c.afterDates;
    if (dates.length === 0) continue;
    total += dates.length;
    const noun = dates.length === 1 ? WORDS[c.metric].one : WORDS[c.metric].many;
    parts.push(withDates ? `${dates.length} ${noun} (${dateList(dates)})` : `${dates.length} ${noun}`);
  }
  return { text: parts.join(" and "), total };
}

function answeredDaysPhrase(n: number): string {
  return n === 1 ? "the 1 answered day" : `the ${n} answered days`;
}

/**
 * The sentence for a SentinelEvents value (exported for the detail view and tests). Dates are listed in brackets;
 * in the rare case that makes the sentence longer than MAX_SENTENCE_LENGTH (falls on many days), only the counts
 * are given — the dates remain in `counts[].beforeDates / afterDates`.
 */
export function sentinelSentence(
  med: Medication | undefined,
  kind: ChangeKind,
  windows: EventWindows,
  counts: SentinelCount[],
  answeredDays: { before: number; after: number },
): string {
  const withDates = renderSentence(med, kind, windows, counts, answeredDays, true);
  return withDates.length <= MAX_SENTENCE_LENGTH ? withDates : renderSentence(med, kind, windows, counts, answeredDays, false);
}

function renderSentence(
  med: Medication | undefined,
  kind: ChangeKind,
  windows: EventWindows,
  counts: SentinelCount[],
  answeredDays: { before: number; after: number },
  withDates: boolean,
): string {
  const { afterSpan, beforeSpan } = windowSpans(med, kind, windows.before, windows.after);
  const after = listRecorded(counts, "after", withDates);
  const before = listRecorded(counts, "before", withDates);

  let afterClause: string;
  if (after.total > 0) {
    const verb = after.total === 1 ? "was" : "were";
    afterClause = `${after.text} ${verb} recorded ${afterSpan}`;
  } else if (answeredDays.after > 0) {
    afterClause = `No falls or near-falls were recorded on ${answeredDaysPhrase(answeredDays.after)} ${afterSpan}`;
  } else {
    afterClause = `The fall and near-fall questions were not answered ${afterSpan}`;
  }

  let beforeClause: string;
  if (before.total > 0) beforeClause = `${before.text} ${beforeSpan}`;
  else if (answeredDays.before > 0) beforeClause = `none on ${answeredDaysPhrase(answeredDays.before)} ${beforeSpan}`;
  else beforeClause = `no answered days ${beforeSpan}`;

  return `${afterClause}, compared with ${beforeClause}.`;
}

/**
 * Falls and near-falls recorded in the before/after windows of a change, or null when none was recorded in
 * either window. Descriptive only: no test, no p-value, no strength. `days` must hold at most one check-in per
 * date (the output of `latestCheckInPerDate`).
 */
export function sentinelEvents(days: CheckIn[], med: Medication, change: MedChange, today: ISODate): SentinelEvents | null {
  const windows = eventWindows(med, change, today);
  const counts: SentinelCount[] = SENTINEL_METRICS.map((metric) => {
    const b = countIn(days, metric, windows.before);
    const a = countIn(days, metric, windows.after);
    return { metric, before: b.stat, after: a.stat, beforeDates: b.dates, afterDates: a.dates };
  });
  const totals = {
    before: counts.reduce((n, c) => n + c.beforeDates.length, 0),
    after: counts.reduce((n, c) => n + c.afterDates.length, 0),
  };
  if (totals.before === 0 && totals.after === 0) return null;
  const answeredDays = { before: answeredEither(days, windows.before), after: answeredEither(days, windows.after) };
  return {
    medicationId: med.id,
    event: change.kind,
    eventDate: change.date,
    windows,
    counts,
    answeredDays,
    totals,
    text: sentinelSentence(med, change.kind, windows, counts, answeredDays),
  };
}
