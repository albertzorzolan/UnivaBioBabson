// Live "what would change" preview for the Add-medication drawer: review the list with and without the new
// (or edited) medicine and report the difference.

import type { CheckIn, Finding, ISODate, Medication, MedReview, PatientProfile, Signal } from "../../model/types";
import type { KnowledgeBase } from "../../kb/types";
import { reviewWithKb } from "./engine";

export interface PreviewState {
  meds: Medication[];
  profile: PatientProfile;
  checkIns: CheckIn[];
  today: ISODate;
  signals?: Signal[];
}

export interface AdditionPreview {
  /** Findings that appear with the new medicine (new findings, and combined findings that now include it). */
  added: Finding[];
  /** Findings that would no longer apply (relevant when the "addition" edits an existing medicine). */
  removed: Finding[];
  acbBefore: number;
  acbAfter: number;
  acbBandBefore: MedReview["acb"]["band"];
  acbBandAfter: MedReview["acb"]["band"];
  /** false when the new medicine is not in the reference set (nothing about it could be checked). */
  matched: boolean;
  /** The full review with the new medicine, for callers that want more than the difference. */
  after: MedReview;
}

/** Fill the fields a half-filled drawer may not have yet, so the engine sees a well-formed record. */
export function draftMedication(newMed: Partial<Medication> & Pick<Medication, "name">, today: ISODate): Medication {
  const stamp = `${today}T12:00:00.000Z`;
  return {
    id: newMed.id ?? "preview-new-medication",
    name: newMed.name,
    ingredientIds: newMed.ingredientIds ?? [],
    match: newMed.match ?? ((newMed.ingredientIds ?? []).length ? "exact" : "none"),
    dose: newMed.dose ?? "",
    frequency: newMed.frequency ?? "",
    asNeeded: newMed.asNeeded ?? false,
    otc: newMed.otc ?? false,
    reason: newMed.reason ?? "",
    prescriber: newMed.prescriber ?? "",
    startDate: newMed.startDate || today,
    endDate: newMed.endDate ?? null,
    createdAt: newMed.createdAt ?? stamp,
    updatedAt: newMed.updatedAt ?? stamp,
  };
}

export function previewAdditionWithKb(
  kb: KnowledgeBase,
  state: PreviewState,
  newMed: Partial<Medication> & Pick<Medication, "name">,
): AdditionPreview {
  const med = draftMedication(newMed, state.today);
  const base = { profile: state.profile, checkIns: state.checkIns, today: state.today, signals: state.signals };
  const before = reviewWithKb(kb, { ...base, meds: state.meds });
  const meds = state.meds.some((m) => m.id === med.id) ? state.meds.map((m) => (m.id === med.id ? med : m)) : [...state.meds, med];
  const after = reviewWithKb(kb, { ...base, meds });
  const beforeKeys = new Set(before.findings.map((f) => f.key));
  const added = after.findings.filter((f) => !beforeKeys.has(f.key));
  const removed = before.findings.filter(
    (f) => !after.findings.some((g) => g.ruleId === f.ruleId && f.medIds.every((id) => g.medIds.includes(id))),
  );
  return {
    added,
    removed,
    acbBefore: before.acb.total,
    acbAfter: after.acb.total,
    acbBandBefore: before.acb.band,
    acbBandAfter: after.acb.band,
    matched: !after.unmatchedMedIds.includes(med.id) && med.ingredientIds.length > 0,
    after,
  };
}
