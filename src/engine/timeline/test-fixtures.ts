// Test-only builders for synthetic check-ins and medications (not imported by application code).
import type { CheckIn, DiaryAnswers, ISODate, Medication } from "../../model/types";
import { dateRange } from "../../model/dates";

/** Every question unanswered. */
export const UNANSWERED: DiaryAnswers = {
  energy: null,
  sleep: null,
  appetite: null,
  dizziness: null,
  dizzinessSeverity: null,
  drowsiness: null,
  confusion: null,
  fall: null,
  nearFall: null,
  swelling: null,
};

/** A fully answered, symptom-free day with middle ratings. */
export const QUIET_DAY: DiaryAnswers = {
  energy: 3,
  sleep: 3,
  appetite: "same",
  dizziness: false,
  dizzinessSeverity: null,
  drowsiness: false,
  confusion: false,
  fall: false,
  nearFall: false,
  swelling: false,
};

let counter = 0;

export function makeCheckIn(date: ISODate, answers: Partial<DiaryAnswers> = {}, extra: Partial<CheckIn> = {}): CheckIn {
  counter += 1;
  return {
    id: `ci-test-${counter}`,
    date,
    answers: { ...QUIET_DAY, ...answers },
    otherSymptoms: [],
    story: "",
    provenance: {},
    medNotes: [],
    confirmedAt: `${date}T20:00:00.000Z`,
    revision: 1,
    ...extra,
  };
}

export function makeMed(id: string, name: string, startDate: ISODate, endDate: ISODate | null = null): Medication {
  return {
    id,
    name,
    ingredientIds: [],
    match: "none",
    dose: "",
    frequency: "",
    asNeeded: false,
    otc: false,
    reason: "",
    prescriber: "",
    startDate,
    endDate,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * Check-ins on `count` of the dates in [from, to], skipping the dates listed in `skip` (by index from the start).
 * `answer(i)` gives the answers for the i-th check-in actually written (0-based).
 */
export function windowCheckIns(
  from: ISODate,
  to: ISODate,
  answer: (i: number, date: ISODate) => Partial<DiaryAnswers>,
  skipIndexes: number[] = [],
): CheckIn[] {
  const skip = new Set(skipIndexes);
  const out: CheckIn[] = [];
  dateRange(from, to).forEach((date, idx) => {
    if (skip.has(idx)) return;
    out.push(makeCheckIn(date, answer(out.length, date)));
  });
  return out;
}

