// What the diary contributes to the medication review: recent symptoms (for relatedSymptoms), falls and
// near-falls (diary-derived "history of falls"), and coded free-text concepts (for "what to watch for").
//
// Only confirmed check-ins dated on or before `today` count; when a date has several check-ins the latest
// revision wins (same rule as the timeline engine). A question left blank is "not answered", never "no".

import type { CheckIn, ConceptId, ISODate, MetricKey } from "../../model/types";
import { addDays } from "../../model/dates";
import { latestCheckInPerDate, metricValue } from "../timeline/metrics";
import { METRIC_ORDER } from "./text";

/** Look-back for "recorded recently" (relatedSymptoms, fall-risk emphasis): today and the 29 days before. */
export const RECENT_DAYS = 30;
/** Look-back for a diary-derived history of falls (SPEC §6.2: any fall/near-fall in the last 12 months). */
export const FALL_HISTORY_DAYS = 365;
/** A medicine started within this many days only links to symptoms recorded on or after its start date. */
export const NEW_MED_DAYS = 60;

export interface DiaryFacts {
  /** First date of the recent window (inclusive). */
  recentFrom: ISODate;
  /** Dates (ascending) on which each metric was recorded as present in the recent window. */
  positives: Map<MetricKey, ISODate[]>;
  /** Answered days per metric in the recent window. */
  answered: Map<MetricKey, number>;
  /** Falls and near-falls in the last 365 days (ascending). */
  fallDates: ISODate[];
  nearFallDates: ISODate[];
  /** Coded free-text concepts recorded as present in the recent window. */
  concepts: Map<ConceptId, ISODate[]>;
}

/** Scale metrics count as "present" when the rating is low (1–2 of 5): low energy, poor sleep. */
function isPositive(m: MetricKey, v: number): boolean {
  if (m === "energy" || m === "sleep") return v <= 2;
  return v === 1;
}

export function diaryFacts(checkIns: readonly CheckIn[], today: ISODate): DiaryFacts {
  const days = latestCheckInPerDate([...checkIns]).filter((c) => c.date <= today);
  const recentFrom = addDays(today, -(RECENT_DAYS - 1));
  const fallFrom = addDays(today, -(FALL_HISTORY_DAYS - 1));
  const positives = new Map<MetricKey, ISODate[]>();
  const answered = new Map<MetricKey, number>();
  const concepts = new Map<ConceptId, ISODate[]>();
  const fallDates: ISODate[] = [];
  const nearFallDates: ISODate[] = [];

  for (const c of days) {
    if (c.date >= fallFrom) {
      if (c.answers?.fall === true) fallDates.push(c.date);
      if (c.answers?.nearFall === true) nearFallDates.push(c.date);
    }
    if (c.date < recentFrom) continue;
    for (const m of METRIC_ORDER) {
      const v = metricValue(c, m);
      if (v === null) continue;
      answered.set(m, (answered.get(m) ?? 0) + 1);
      if (isPositive(m, v)) {
        const list = positives.get(m) ?? [];
        list.push(c.date);
        positives.set(m, list);
      }
    }
    for (const o of c.otherSymptoms ?? []) {
      if (!o || o.present !== true) continue;
      const list = concepts.get(o.conceptId) ?? [];
      if (!list.includes(c.date)) list.push(c.date);
      concepts.set(o.conceptId, list);
    }
  }
  return { recentFrom, positives, answered, fallDates, nearFallDates, concepts };
}

/** Recent dates on which `m` was recorded present, on or after `since` (inclusive). */
export function positivesSince(facts: DiaryFacts, m: MetricKey, since: ISODate): ISODate[] {
  return (facts.positives.get(m) ?? []).filter((d) => d >= since);
}
