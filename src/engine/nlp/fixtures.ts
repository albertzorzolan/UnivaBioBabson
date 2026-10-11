// Fixed inputs for the NLP evaluation (eval/nlp.eval.test.ts and the in-app evaluation runner):
// the SPEC §2 fictional medication list on a fixed "today", so results are reproducible.

import type { ISODate, Medication } from "../../model/types";
import { addDays } from "../../model/dates";

export const EVAL_TODAY: ISODate = "2026-10-10";
export const EVAL_PATIENT_NAMES = ["Margaret"];

function med(
  id: string,
  name: string,
  ingredientIds: string[],
  dose: string,
  frequency: string,
  reason: string,
  prescriber: string,
  startOffset: number,
  extra: Partial<Medication> = {},
): Medication {
  const startDate = addDays(EVAL_TODAY, startOffset);
  return {
    id, name, ingredientIds, match: ingredientIds.length > 1 ? "combo" : "exact", dose, frequency, asNeeded: false, otc: false,
    reason, prescriber, startDate, endDate: null, createdAt: `${startDate}T09:00:00.000Z`, updatedAt: `${startDate}T09:00:00.000Z`,
    ...extra,
  };
}

/** SPEC §2 seed medication list (fictional). */
export const EVAL_MEDS: Medication[] = [
  med("med-amlodipine", "Amlodipine", ["amlodipine"], "10 mg", "once daily", "Blood pressure", "Dr. Okafor (cardiology)", -140),
  med("med-furosemide", "Furosemide (Lasix)", ["furosemide"], "20 mg", "once daily", "Ankle swelling", "Dr. Lee (primary care)", -95, { match: "brand" }),
  med("med-metformin", "Metformin", ["metformin"], "500 mg", "twice daily", "Diabetes", "Dr. Lee", -900),
  med("med-atorvastatin", "Atorvastatin", ["atorvastatin"], "20 mg", "nightly", "Cholesterol", "Dr. Lee", -900),
  med("med-omeprazole", "Omeprazole", ["omeprazole"], "20 mg", "daily", "Heartburn", "Dr. Lee", -400),
  med("med-oxybutynin", "Oxybutynin", ["oxybutynin"], "5 mg", "twice daily", "Bladder", "Dr. Shah (urology)", -210),
  med("med-tylenolpm", "Tylenol PM (OTC)", ["acetaminophen", "diphenhydramine"], "2 caplets", "at bedtime as needed", "Sleep", "self (OTC)", -180, { asNeeded: true, otc: true }),
  med("med-lorazepam", "Lorazepam (Ativan)", ["lorazepam"], "0.5 mg", "at bedtime", "Anxiety / sleep", "Urgent care", -16, { match: "brand" }),
];
