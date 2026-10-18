// The timeline analysis of a whole record, as the app's screens see it (useDerived.ts). Pure: no React, no browser
// APIs. src/ai/batchHarness.ts makes the same call without the event log; its file hash is pinned by
// eval/results/llm-batch.json, and on the demo seed (no dose changes) both give the same result
// (src/engine/timeline/medEvents.app.test.ts).
import type { ISODate, Medication, MetricKey, StoreData, TimelineAnalysis } from "../model/types";
import { analyzeTimeline } from "../engine/timeline/signals";
import { knownEffect } from "../kb";

/** The parts of the record the timeline reads. */
export type TimelineRecord = Pick<StoreData, "checkIns" | "medications" | "medEvents">;

/**
 * Passes the medication event log so that another medicine's dose change within 21 days of a start or stop is
 * listed among the overlapping changes (starts and stops already come from the medication records themselves).
 */
export function recordTimeline(data: TimelineRecord, today: ISODate): TimelineAnalysis {
  const isKnownEffect = (med: Medication, m: MetricKey) => knownEffect(med.ingredientIds, m);
  return analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, medEvents: data.medEvents, today, isKnownEffect });
}
