// Pure record helpers for the caregiver Medications screen: drafts, validation, and the store updaters that
// add / edit / stop / remove a medicine together with its MedEvent history. No React here (unit-tested).
//
// Date semantics follow the engines (src/engine/timeline/windows.ts): startDate is the first day taken and
// endDate is the LAST day taken, so a medicine whose endDate is today still counts as active today.

import type { DrugMatch } from "../../../kb/types";
import { getDrug } from "../../../kb";
import type { ISODate, ISODateTime, Medication, MedEvent, MedEventKind, StoreData } from "../../../model/types";
import { formatShort, isValidDate } from "../../../model/dates";
import { newId } from "../../../model/ids";

/** What the Add/Edit drawer collects. */
export interface MedDraft {
  name: string;
  ingredientIds: string[];
  match: Medication["match"];
  dose: string;
  frequency: string;
  asNeeded: boolean;
  otc: boolean;
  reason: string;
  prescriber: string;
  startDate: ISODate;
}

export interface RecordContext {
  today: ISODate;
  /** Commit timestamp (ISO). */
  now: ISODateTime;
  /** Who made the change, for event details ("Alex"). */
  actorName: string;
}

export type DraftErrors = Partial<Record<keyof MedDraft, string>>;

/** The user's answer to a "Did you mean …?" suggestion. */
export type FuzzyDecision = "confirmed" | "declined" | null;

const MAX_TEXT = 120;

function clip(s: string, max = MAX_TEXT): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

export function emptyDraft(today: ISODate): MedDraft {
  return {
    name: "",
    ingredientIds: [],
    match: "none",
    dose: "",
    frequency: "",
    asNeeded: false,
    otc: false,
    reason: "",
    prescriber: "",
    startDate: today,
  };
}

export function draftFromMed(m: Medication): MedDraft {
  return {
    name: m.name,
    ingredientIds: [...m.ingredientIds],
    match: m.match,
    dose: m.dose,
    frequency: m.frequency,
    asNeeded: m.asNeeded,
    otc: m.otc,
    reason: m.reason,
    prescriber: m.prescriber,
    startDate: m.startDate,
  };
}

/**
 * Resolve a name match into what gets stored. A fuzzy match is only a suggestion: it becomes
 * "fuzzy_confirmed" when the user says yes, and "none" (saved, not reviewed) when they decline or haven't answered.
 */
export function resolveMatch(m: DrugMatch, decision: FuzzyDecision): Pick<Medication, "ingredientIds" | "match"> {
  if (m.match === "fuzzy") {
    return decision === "confirmed" ? { ingredientIds: [...m.ingredientIds], match: "fuzzy_confirmed" } : { ingredientIds: [], match: "none" };
  }
  if (m.match === "none" || m.ingredientIds.length === 0) return { ingredientIds: [], match: "none" };
  return { ingredientIds: [...m.ingredientIds], match: m.match };
}

/** "lorazepam" · "acetaminophen + diphenhydramine" — the matched generic name(s), or null when unmatched. */
export function genericLabel(ingredientIds: readonly string[]): string | null {
  if (!ingredientIds.length) return null;
  return ingredientIds.map((id) => (getDrug(id)?.display ?? id).toLowerCase()).join(" + ");
}

/** True when the entered name already reads as the generic (so "Amlodipine" doesn't repeat "amlodipine"). */
export function nameIsGeneric(name: string, ingredientIds: readonly string[]): boolean {
  const g = genericLabel(ingredientIds);
  return g !== null && name.trim().toLowerCase() === g;
}

/** Field errors for a draft (empty object = valid). */
export function validateDraft(d: MedDraft, today: ISODate, opts: { fuzzyPending?: boolean; person?: string } = {}): DraftErrors {
  const e: DraftErrors = {};
  if (!d.name.trim()) e.name = "Enter the medicine’s name as it appears on the label.";
  else if (d.name.trim().length > MAX_TEXT) e.name = `Keep the name under ${MAX_TEXT} characters.`;
  else if (opts.fuzzyPending) e.name = "Please answer the “Did you mean …?” question above.";
  if (!isValidDate(d.startDate)) e.startDate = `Enter the date ${opts.person ?? "they"} started taking it.`;
  else if (d.startDate > today) e.startDate = "The start date can’t be in the future.";
  return e;
}

function sameText(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

function describeSchedule(m: Pick<Medication, "dose" | "frequency" | "asNeeded">): string {
  const parts = [m.dose.trim(), m.frequency.trim()].filter(Boolean);
  if (m.asNeeded) parts.push("as needed");
  return parts.join(" ") || "no dose recorded";
}

function sortEvents(events: MedEvent[]): MedEvent[] {
  return [...events].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

/** Add a new medicine plus its "started" and "added to list" events. */
export function addMedication(data: StoreData, d: MedDraft, ctx: RecordContext): { data: StoreData; med: Medication } {
  const med: Medication = {
    id: newId("med"),
    name: clip(d.name),
    ingredientIds: [...d.ingredientIds],
    match: d.match,
    dose: clip(d.dose),
    frequency: clip(d.frequency),
    asNeeded: d.asNeeded,
    otc: d.otc,
    reason: clip(d.reason),
    prescriber: clip(d.prescriber),
    startDate: d.startDate,
    endDate: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const startedDetail = [
    `Started ${describeSchedule(med)}`,
    med.reason ? `for ${med.reason.toLowerCase()}` : "",
    med.prescriber ? `(prescriber: ${med.prescriber})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const events: MedEvent[] = [
    { id: newId("evt"), medicationId: med.id, date: med.startDate, kind: "started", detail: `${startedDetail}.`, createdAt: ctx.now },
    { id: newId("evt"), medicationId: med.id, date: ctx.today, kind: "added_to_list", detail: `Added to Kinwise by ${ctx.actorName}.`, createdAt: ctx.now },
  ];
  return {
    med,
    data: { ...data, medications: [...data.medications, med], medEvents: sortEvents([...data.medEvents, ...events]) },
  };
}

/** True when the dose, frequency or as-needed flag differ (a dose change worth dating). */
export function doseChanged(before: Medication, d: MedDraft): boolean {
  return !sameText(before.dose, d.dose) || !sameText(before.frequency, d.frequency) || before.asNeeded !== d.asNeeded;
}

/** Fields other than the dose that were corrected, in plain words. */
export function correctedFields(before: Medication, d: MedDraft): string[] {
  const out: string[] = [];
  if (!sameText(before.name, d.name) || before.ingredientIds.join("+") !== d.ingredientIds.join("+")) out.push("name");
  if (before.startDate !== d.startDate) out.push("start date");
  if (!sameText(before.reason, d.reason)) out.push("reason");
  if (!sameText(before.prescriber, d.prescriber)) out.push("prescriber");
  if (before.otc !== d.otc) out.push("over-the-counter flag");
  return out;
}

/**
 * Save edits. A dose/schedule change becomes a dated "dose_changed" event (the timeline lists it as a nearby
 * change); other edits become one "corrected" event. A corrected start date also moves the "started" event.
 */
export function editMedication(
  data: StoreData,
  id: string,
  d: MedDraft,
  ctx: RecordContext & { doseChangeDate?: ISODate },
): StoreData {
  const before = data.medications.find((m) => m.id === id);
  if (!before) return data;
  const after: Medication = {
    ...before,
    name: clip(d.name),
    ingredientIds: [...d.ingredientIds],
    match: d.match,
    dose: clip(d.dose),
    frequency: clip(d.frequency),
    asNeeded: d.asNeeded,
    otc: d.otc,
    reason: clip(d.reason),
    prescriber: clip(d.prescriber),
    startDate: d.startDate,
    updatedAt: ctx.now,
  };
  const events: MedEvent[] = [];
  if (doseChanged(before, d)) {
    const date = ctx.doseChangeDate && isValidDate(ctx.doseChangeDate) ? ctx.doseChangeDate : ctx.today;
    events.push({
      id: newId("evt"),
      medicationId: id,
      date,
      kind: "dose_changed",
      detail: `Dose changed from ${describeSchedule(before)} to ${describeSchedule(after)}.`,
      createdAt: ctx.now,
    });
  }
  const fields = correctedFields(before, d);
  if (fields.length) {
    events.push({
      id: newId("evt"),
      medicationId: id,
      date: ctx.today,
      kind: "corrected",
      detail: `${ctx.actorName} corrected the ${joinWords(fields)}.`,
      createdAt: ctx.now,
    });
  }
  const moved =
    before.startDate !== after.startDate
      ? data.medEvents.map((e) => (e.medicationId === id && e.kind === "started" && e.date === before.startDate ? { ...e, date: after.startDate } : e))
      : data.medEvents;
  return {
    ...data,
    medications: data.medications.map((m) => (m.id === id ? after : m)),
    medEvents: sortEvents([...moved, ...events]),
  };
}

/** Error text for a "last day taken" date, or null when it is acceptable. */
export function validateStop(med: Medication, lastDay: ISODate, today: ISODate, person = "they"): string | null {
  if (!isValidDate(lastDay)) return `Enter the last day ${person} took it.`;
  if (lastDay > today) return "The last day can’t be in the future.";
  if (lastDay < med.startDate) return `That is before it was started (${formatShort(med.startDate)}).`;
  return null;
}

/** Record that a medicine was stopped: endDate = last day taken, plus a dated "stopped" event. */
export function stopMedication(data: StoreData, id: string, input: { lastDay: ISODate; note: string }, ctx: RecordContext): StoreData {
  const med = data.medications.find((m) => m.id === id);
  if (!med) return data;
  const note = clip(input.note, 240);
  const event: MedEvent = {
    id: newId("evt"),
    medicationId: id,
    date: input.lastDay,
    kind: "stopped",
    detail: note ? `Stopped. ${ctx.actorName}’s note: “${note}”` : `Stopped (recorded by ${ctx.actorName}).`,
    createdAt: ctx.now,
  };
  return {
    ...data,
    medications: data.medications.map((m) => (m.id === id ? { ...m, endDate: input.lastDay, updatedAt: ctx.now } : m)),
    medEvents: sortEvents([...data.medEvents, event]),
  };
}

/** Remove a medicine entered by mistake, with its events. Returns what was removed so it can be restored. */
export function removeMedication(data: StoreData, id: string): { data: StoreData; removed: { med: Medication; events: MedEvent[] } | null } {
  const med = data.medications.find((m) => m.id === id);
  if (!med) return { data, removed: null };
  const events = data.medEvents.filter((e) => e.medicationId === id);
  return {
    data: { ...data, medications: data.medications.filter((m) => m.id !== id), medEvents: data.medEvents.filter((e) => e.medicationId !== id) },
    removed: { med, events },
  };
}

/** Undo for removeMedication. No-op if a medicine with that id exists again. */
export function restoreMedication(data: StoreData, removed: { med: Medication; events: MedEvent[] }): StoreData {
  if (data.medications.some((m) => m.id === removed.med.id)) return data;
  return { ...data, medications: [...data.medications, removed.med], medEvents: sortEvents([...data.medEvents, ...removed.events]) };
}

/** Active (no end date or last day ≥ today) vs stopped (last day before today), each sorted for display. */
export function splitMeds(meds: Medication[], today: ISODate): { active: Medication[]; stopped: Medication[] } {
  const active = meds.filter((m) => !m.endDate || m.endDate >= today).sort((a, b) => a.name.localeCompare(b.name));
  const stopped = meds
    .filter((m) => m.endDate && m.endDate < today)
    .sort((a, b) => ((b.endDate ?? "") < (a.endDate ?? "") ? -1 : (b.endDate ?? "") > (a.endDate ?? "") ? 1 : 0));
  return { active, stopped };
}

export const EVENT_LABEL: Record<MedEventKind, string> = {
  started: "Started",
  stopped: "Stopped",
  dose_changed: "Dose changed",
  added_to_list: "Added to the list",
  corrected: "Details corrected",
};

/** Events newest first (by date, then entry time), joined with their medicine (events of removed medicines are dropped). */
export function eventHistory(events: MedEvent[], meds: Medication[]): { event: MedEvent; med: Medication }[] {
  const byId = new Map(meds.map((m) => [m.id, m]));
  return events
    .flatMap((event) => {
      const med = byId.get(event.medicationId);
      return med ? [{ event, med }] : [];
    })
    .sort((a, b) =>
      a.event.date === b.event.date ? b.event.createdAt.localeCompare(a.event.createdAt) || b.event.id.localeCompare(a.event.id) : a.event.date < b.event.date ? 1 : -1,
    );
}

/** Distinct prescribers already on the list (for the prescriber field's suggestions). */
export function knownPrescribers(meds: Medication[]): string[] {
  return [...new Set(meds.map((m) => m.prescriber.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Matches prescriber text that names the person themselves, not a clinician: "Self (OTC)", "OTC", "over the counter". */
const SELF_PRESCRIBER = /^self\b|\botc\b|over the counter/i;

/**
 * Distinct clinicians behind a list of medicines (case-insensitive). Over-the-counter entries and
 * "Self (OTC)"-style prescribers don't count: they are not prescribers. Pass the active list.
 */
export function countPrescribers(meds: readonly Pick<Medication, "prescriber" | "otc">[]): number {
  const names = new Set<string>();
  for (const m of meds) {
    const p = m.prescriber.trim().toLowerCase();
    if (!p || m.otc || SELF_PRESCRIBER.test(p)) continue;
    names.add(p);
  }
  return names.size;
}

/** "a", "a and b", "a, b and c". */
export function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
