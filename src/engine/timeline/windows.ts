// Medication changes (starts and stops) and the before/after date windows compared around them.
//
// Date semantics (SPEC §6.2: a medicine is active while it has no endDate or endDate ≥ today):
//   startDate = the first day the medicine was taken; endDate = the LAST day it was taken.
//   A stop is therefore a change only once endDate < today.
//
// Windows (all bounds inclusive):
//   start:  before = [start − 21, start − 1]               after = [start, min(start + 20, endDate, today)]
//   stop:   before = [max(startDate, end − 20), end]       after = [end + 1, min(end + 21, today)]
// Each window is at most 21 calendar days. A start's after-window and a stop's before-window are both
// "on the medicine"; a day is never counted as both on and off it.

import type { ISODate, MedEvent, Medication, Signal } from "../../model/types";
import { addDays, isValidDate, maxDate, minDate } from "../../model/dates";
import { TIMELINE_RULES } from "./rules";

export type ChangeKind = Signal["event"];

/** A medication start or stop on a given date (for a stop: the last day taken). */
export interface MedChange {
  medicationId: string;
  kind: ChangeKind;
  date: ISODate;
}

export interface DateWindow {
  from: ISODate;
  to: ISODate;
}

export interface EventWindows {
  before: DateWindow;
  after: DateWindow;
}

/**
 * The start and stop of a medication that have already happened by `today`.
 * Future starts are omitted; a stop counts only when endDate < today (endDate is the last day taken, so a
 * medicine ending today is still active). Malformed dates and an endDate before the startDate are skipped.
 */
export function eventsForMed(med: Medication, today: ISODate): MedChange[] {
  const out: MedChange[] = [];
  const startOk = isValidDate(med.startDate);
  if (startOk && med.startDate <= today) out.push({ medicationId: med.id, kind: "started", date: med.startDate });
  if (med.endDate && isValidDate(med.endDate) && med.endDate < today && (!startOk || med.endDate >= med.startDate)) {
    out.push({ medicationId: med.id, kind: "stopped", date: med.endDate });
  }
  return out;
}

/** Before/after windows for a change (see the header comment). */
export function eventWindows(med: Medication, change: MedChange, today: ISODate): EventWindows {
  const { windowDays } = TIMELINE_RULES;
  if (change.kind === "started") {
    let afterTo = minDate(addDays(change.date, windowDays - 1), today);
    if (med.endDate && isValidDate(med.endDate) && med.endDate >= change.date) afterTo = minDate(afterTo, med.endDate);
    return {
      before: { from: addDays(change.date, -windowDays), to: addDays(change.date, -1) },
      after: { from: change.date, to: afterTo },
    };
  }
  let beforeFrom = addDays(change.date, -(windowDays - 1));
  if (isValidDate(med.startDate)) beforeFrom = maxDate(beforeFrom, med.startDate);
  return {
    before: { from: beforeFrom, to: change.date },
    after: { from: addDays(change.date, 1), to: minDate(addDays(change.date, windowDays), today) },
  };
}

/** True when the date lies within ±overlapDays of `center` and has already happened. */
function nearCenter(date: ISODate, center: ISODate, today: ISODate): boolean {
  const lo = addDays(center, -TIMELINE_RULES.overlapDays);
  const hi = minDate(addDays(center, TIMELINE_RULES.overlapDays), today);
  return date >= lo && date <= hi;
}

/**
 * Dose changes of `medicationId` from the event log within ±21 days of `center` (on or before today), sorted.
 * Starts and stops come from the Medication record itself, never from the log: a log entry can be stale (for
 * example after a start date was corrected), and the record is the source of truth.
 */
export function nearbyDoseChanges(medicationId: string, center: ISODate, today: ISODate, medEvents: MedEvent[] = []): ISODate[] {
  const dates = new Set<ISODate>();
  for (const e of medEvents) {
    if (e.medicationId !== medicationId || e.kind !== "dose_changed" || !isValidDate(e.date)) continue;
    if (nearCenter(e.date, center, today)) dates.add(e.date);
  }
  return [...dates].sort();
}

/**
 * Other medications started, stopped or (with `medEvents`) dose-changed within ±21 days of the change — possible
 * alternative explanations a clinician will want to see. Only changes on or before `today` count.
 */
export function overlappingChanges(
  med: Medication,
  change: MedChange,
  meds: Medication[],
  today: ISODate,
  medEvents: MedEvent[] = [],
): string[] {
  const ids = new Set<string>();
  for (const other of meds) {
    if (other.id === med.id) continue;
    if (eventsForMed(other, today).some((e) => nearCenter(e.date, change.date, today))) ids.add(other.id);
  }
  for (const e of medEvents) {
    if (e.medicationId === med.id || ids.has(e.medicationId)) continue;
    if (nearbyDoseChanges(e.medicationId, change.date, today, [e]).length > 0) ids.add(e.medicationId);
  }
  return [...ids].sort();
}
