// Diary metrics the timeline engine analyses, how each is read from a check-in, and window summaries.
//
// Key rule (SPEC §6.3): rates and means use ANSWERED days only. A question left blank (null) is "not answered",
// never "no" — so it is excluded from the denominator rather than counted as a symptom-free day.

import type { CheckIn, ISODate, MetricKey, WindowStat } from "../../model/types";
import { isValidDate } from "../../model/dates";

export interface MetricDef {
  key: MetricKey;
  /** Plain-language label for headings and legends ("Ankle swelling"). */
  label: string;
  /** boolean = yes/no diary question (rate of "yes" days); scale = 1–5 rating (mean). */
  kind: "boolean" | "scale";
  /** true when a higher rate/mean is the less welcome direction (symptoms); false for energy and sleep. */
  higherIsWorse: boolean;
  /** Very short label for compact charts ("Dizzy"). */
  short: string;
  /** Subject of the caregiver-facing signal sentence: "<subject> was recorded…" / "<subject> averaged…". */
  subject: string;
  /** Patient-voice phrase after "You noted …" ("a near-fall"); scale metrics: unused (see patientNoun). */
  patientPhrase: string;
  /** Patient-voice noun for "No … noted" and "compare … with last week" ("near-falls", "energy ratings"). */
  patientNoun: string;
  /** Noun for "… is listed as a recognized possible effect of <medicine>" ("low energy or tiredness"). */
  effectNoun: string;
}

/** The nine diary metrics, in display order. Labels are plain language for families. */
export const METRICS: MetricDef[] = [
  {
    key: "dizziness",
    label: "Dizziness",
    kind: "boolean",
    higherIsWorse: true,
    short: "Dizzy",
    subject: "Dizziness",
    patientPhrase: "dizziness",
    patientNoun: "dizziness",
    effectNoun: "dizziness",
  },
  {
    key: "drowsiness",
    label: "Daytime drowsiness",
    kind: "boolean",
    higherIsWorse: true,
    short: "Drowsy",
    subject: "Daytime drowsiness",
    patientPhrase: "daytime drowsiness",
    patientNoun: "daytime drowsiness",
    effectNoun: "drowsiness",
  },
  {
    key: "confusion",
    label: "Confusion or memory fog",
    kind: "boolean",
    higherIsWorse: true,
    short: "Foggy",
    subject: "Confusion or memory fog",
    patientPhrase: "confusion or memory fog",
    patientNoun: "confusion or memory fog",
    effectNoun: "confusion",
  },
  {
    key: "fall",
    label: "Falls",
    kind: "boolean",
    higherIsWorse: true,
    short: "Fall",
    subject: "A fall",
    patientPhrase: "a fall",
    patientNoun: "falls",
    effectNoun: "falls",
  },
  {
    key: "nearFall",
    label: "Near-falls",
    kind: "boolean",
    higherIsWorse: true,
    short: "Near-fall",
    subject: "A near-fall",
    patientPhrase: "a near-fall",
    patientNoun: "near-falls",
    effectNoun: "unsteadiness and near-falls",
  },
  {
    key: "swelling",
    label: "Ankle swelling",
    kind: "boolean",
    higherIsWorse: true,
    short: "Swelling",
    subject: "Ankle swelling",
    patientPhrase: "ankle swelling",
    patientNoun: "ankle swelling",
    effectNoun: "ankle swelling",
  },
  {
    key: "appetiteWorse",
    label: "Poor appetite",
    kind: "boolean",
    higherIsWorse: true,
    short: "Appetite",
    subject: "Poor appetite",
    patientPhrase: "a poor appetite",
    patientNoun: "poor appetite",
    effectNoun: "reduced appetite",
  },
  {
    key: "energy",
    label: "Energy",
    kind: "scale",
    higherIsWorse: false,
    short: "Energy",
    subject: "Energy ratings",
    patientPhrase: "energy",
    patientNoun: "energy ratings",
    effectNoun: "low energy or tiredness",
  },
  {
    key: "sleep",
    label: "Sleep quality",
    kind: "scale",
    higherIsWorse: false,
    short: "Sleep",
    subject: "Sleep quality ratings",
    patientPhrase: "sleep",
    patientNoun: "sleep ratings",
    effectNoun: "changes in sleep",
  },
];

const METRIC_BY_KEY = new Map<MetricKey, MetricDef>(METRICS.map((m) => [m.key, m]));

/** Definition for a metric key (throws for an unknown key — a programming error, not a data error). */
export function getMetric(key: MetricKey): MetricDef {
  const def = METRIC_BY_KEY.get(key);
  if (!def) throw new RangeError(`Unknown metric: ${String(key)}`);
  return def;
}

/**
 * The value a check-in contributes for a metric:
 * - yes/no symptoms → 1 (yes) / 0 (no);
 * - appetiteWorse → 1 when appetite was "worse", 0 for "same"/"better";
 * - energy, sleep → the 1–5 rating;
 * - null when the question was not answered (or holds an out-of-range value).
 */
export function metricValue(c: CheckIn, m: MetricKey): number | null {
  const a = c.answers;
  switch (m) {
    case "energy":
    case "sleep": {
      const v: unknown = a[m];
      return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
    }
    case "appetiteWorse": {
      const v: unknown = a.appetite;
      if (v === "worse") return 1;
      return v === "same" || v === "better" ? 0 : null;
    }
    default: {
      const v: unknown = a[m];
      return typeof v === "boolean" ? (v ? 1 : 0) : null;
    }
  }
}

/**
 * One check-in per calendar date: when a date has several (e.g. an import merged two copies), the highest
 * revision wins, then the latest confirmation time. Check-ins with malformed dates are ignored.
 * Returned sorted by date ascending.
 */
export function latestCheckInPerDate(checkIns: CheckIn[]): CheckIn[] {
  const byDate = new Map<ISODate, CheckIn>();
  for (const c of checkIns) {
    if (!isValidDate(c.date)) continue;
    const prev = byDate.get(c.date);
    if (
      !prev ||
      c.revision > prev.revision ||
      (c.revision === prev.revision && (c.confirmedAt ?? "") > (prev.confirmedAt ?? ""))
    ) {
      byDate.set(c.date, c);
    }
  }
  return [...byDate.values()].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0));
}

/**
 * All answered values of a metric between `from` and `to` inclusive, from a list that already holds at most
 * one check-in per date (the output of `latestCheckInPerDate`). Lets callers dedupe once and query many windows.
 */
export function valuesInWindow(days: CheckIn[], m: MetricKey, from: ISODate, to: ISODate): number[] {
  const out: number[] = [];
  if (from > to) return out;
  for (const c of days) {
    if (c.date < from || c.date > to) continue;
    const v = metricValue(c, m);
    if (v !== null) out.push(v);
  }
  return out;
}

/** WindowStat for answered values already extracted from the window [from, to]. */
export function summarizeValues(values: number[], from: ISODate, to: ISODate): WindowStat {
  const positive = values.reduce((sum, v) => sum + v, 0);
  return {
    from,
    to,
    answered: values.length,
    positive,
    value: values.length === 0 ? 0 : positive / values.length,
  };
}

/** WindowStat from already-deduplicated days (see `valuesInWindow`). */
export function windowStatFromDays(days: CheckIn[], m: MetricKey, from: ISODate, to: ISODate): WindowStat {
  return summarizeValues(valuesInWindow(days, m, from, to), from, to);
}

/**
 * Summary of one metric over the inclusive date window [from, to], using answered days only.
 * `positive` = days with the symptom (boolean) or the sum of ratings (scale); `value` = rate (0–1) or mean (1–5).
 * With no answered days, `value` is 0 — callers must check `answered` before interpreting it.
 * Several check-ins on one date count once (see `latestCheckInPerDate`).
 */
export function windowStat(checkIns: CheckIn[], m: MetricKey, from: ISODate, to: ISODate): WindowStat {
  return windowStatFromDays(latestCheckInPerDate(checkIns), m, from, to);
}
