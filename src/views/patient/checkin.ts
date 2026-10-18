// Pure helpers for Margaret's check-in (no React): the form model, how accepted proposals fill it,
// how the confirmed answers become a CheckIn with provenance, and how that CheckIn is committed to the
// record (revision + checkInHistory audit trail). Unit-tested in checkin.test.ts.
//
//   extractCheckIn(story) ──► proposals ──► acceptProposal() ──► CheckInForm ──► buildCheckIn() ──► commitCheckIn()
//                                                  ▲
//                         setAnswer() (taps on the quick form)
//
// Rules carried here (SPEC §3, §6.4, SPEC-UI "Today"):
//  - "Not sure" is remembered by the form but stored as null (unanswered), never as "no".
//  - A field filled from her words keeps the exact spans; touching the field by hand turns it into a manual answer.
//  - Saved spans always satisfy story.slice(start, end) === quote (validateStore rejects anything else).

import type {
  CheckIn,
  ConceptId,
  DiaryAnswers,
  DiaryField,
  FieldProvenance,
  ISODate,
  ISODateTime,
  OtherSymptom,
  Proposal,
  Span,
  StoreData,
} from "../../model/types";
import { addDays, daysBetween, isValidDate } from "../../model/dates";

// ---------------------------------------------------------------------------
// Field vocabulary (patient voice)

export const FORM_FIELDS: readonly DiaryField[] = [
  "energy", "sleep", "appetite", "dizziness", "dizzinessSeverity", "drowsiness", "confusion", "fall", "nearFall", "swelling",
];

/** Questions counted in "N of M answered" (severity is a follow-up, not its own question). */
export const MAIN_FIELDS: readonly DiaryField[] = FORM_FIELDS.filter((f) => f !== "dizzinessSeverity");

/** Short label used on proposal cards, the confirmation sheet and summaries. */
export const FIELD_LABEL: Record<DiaryField, string> = {
  energy: "Energy",
  sleep: "Sleep last night",
  appetite: "Appetite",
  dizziness: "Dizzy or light-headed",
  dizzinessSeverity: "How strong the dizziness was",
  drowsiness: "Drowsy during the day",
  confusion: "Confused or foggy",
  fall: "A fall",
  nearFall: "A near-fall (lost your balance)",
  swelling: "Ankle swelling",
};

/** Very short label for highlight tags in the story. */
export const FIELD_TAG: Record<DiaryField, string> = {
  energy: "Energy",
  sleep: "Sleep",
  appetite: "Appetite",
  dizziness: "Dizzy",
  dizzinessSeverity: "How strong",
  drowsiness: "Drowsy",
  confusion: "Foggy",
  fall: "Fall",
  nearFall: "Near-fall",
  swelling: "Swelling",
};

export const ENERGY_WORDS = { 1: "Very low", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" } as const;
export const SLEEP_WORDS = { 1: "Very badly", 2: "Badly", 3: "Okay", 4: "Well", 5: "Very well" } as const;
export const APPETITE_WORDS = { worse: "Less than usual", same: "Usual", better: "More than usual" } as const;
export const SEVERITY_WORDS = { 1: "A little", 2: "Quite", 3: "Very" } as const;

/** An answer in plain words. null → "Not answered". */
export function answerWords(field: DiaryField, value: DiaryAnswers[DiaryField]): string {
  if (value === null || value === undefined) return "Not answered";
  switch (field) {
    case "energy":
      return `${ENERGY_WORDS[value as 1 | 2 | 3 | 4 | 5] ?? String(value)} (${String(value)} of 5)`;
    case "sleep":
      return `${SLEEP_WORDS[value as 1 | 2 | 3 | 4 | 5] ?? String(value)} (${String(value)} of 5)`;
    case "appetite":
      return APPETITE_WORDS[value as keyof typeof APPETITE_WORDS] ?? String(value);
    case "dizzinessSeverity":
      return SEVERITY_WORDS[value as 1 | 2 | 3] ?? String(value);
    default:
      return value === true ? "Yes" : value === false ? "No" : String(value);
  }
}

/** "Dizzy or light-headed: Yes — a little" style line for a whole answer set (severity folded into dizziness). */
export function answerLines(a: DiaryAnswers): { field: DiaryField; label: string; words: string; answered: boolean }[] {
  return MAIN_FIELDS.map((field) => {
    let words = answerWords(field, a[field]);
    if (field === "dizziness" && a.dizziness === true && a.dizzinessSeverity !== null) {
      words = `Yes — ${SEVERITY_WORDS[a.dizzinessSeverity].toLowerCase()}`;
    }
    return { field, label: FIELD_LABEL[field], words, answered: a[field] !== null };
  });
}

export function emptyAnswers(): DiaryAnswers {
  return {
    energy: null, sleep: null, appetite: null, dizziness: null, dizzinessSeverity: null,
    drowsiness: null, confusion: null, fall: null, nearFall: null, swelling: null,
  };
}

/** Number of main questions with an answer. */
export function answeredCount(a: DiaryAnswers): number {
  return MAIN_FIELDS.filter((f) => a[f] !== null).length;
}

// ---------------------------------------------------------------------------
// Form model

/** Where a form value came from when it was filled from her words. */
export interface WordsSource {
  origin: FieldProvenance["origin"];
  certainty: FieldProvenance["certainty"];
  spans: Span[];
}

export interface CheckInForm {
  answers: DiaryAnswers;
  /** Questions she answered "Not sure" (stored as null). */
  unsure: DiaryField[];
  /** Fields whose current value came from her words (an accepted proposal or a saved story). */
  fromWords: Partial<Record<DiaryField, WordsSource>>;
}

export function emptyForm(): CheckInForm {
  return { answers: emptyAnswers(), unsure: [], fromWords: {} };
}

/** Form pre-filled from a saved check-in (editing a day). Spans are kept so "from your words" tags reappear. */
export function formFromCheckIn(c: CheckIn): CheckInForm {
  const fromWords: CheckInForm["fromWords"] = {};
  for (const field of FORM_FIELDS) {
    const p = c.provenance?.[field];
    if (p && p.origin !== "manual" && p.spans.length > 0 && c.answers[field] !== null) {
      fromWords[field] = { origin: p.origin, certainty: p.certainty, spans: p.spans.map((s) => ({ ...s })) };
    }
  }
  return { answers: { ...emptyAnswers(), ...c.answers }, unsure: [], fromWords };
}

function without<T>(xs: readonly T[], x: T): T[] {
  return xs.filter((y) => y !== x);
}

function omit<K extends string, V>(rec: Partial<Record<K, V>>, ...keys: K[]): Partial<Record<K, V>> {
  const next = { ...rec };
  for (const k of keys) delete next[k];
  return next;
}

/** Severity only exists while dizziness is "yes". */
function normaliseSeverity(form: CheckInForm): CheckInForm {
  if (form.answers.dizziness === true) return form;
  if (form.answers.dizzinessSeverity === null && !form.unsure.includes("dizzinessSeverity") && !form.fromWords.dizzinessSeverity) return form;
  return {
    answers: { ...form.answers, dizzinessSeverity: null },
    unsure: without(form.unsure, "dizzinessSeverity"),
    fromWords: omit(form.fromWords, "dizzinessSeverity"),
  };
}

/** A tap on the quick form. "unsure" = Not sure (stored as null). Clears any "from your words" link. */
export function setAnswer(form: CheckInForm, field: DiaryField, value: DiaryAnswers[DiaryField] | "unsure"): CheckInForm {
  const unsure = value === "unsure";
  return normaliseSeverity({
    answers: { ...form.answers, [field]: unsure ? null : value } as DiaryAnswers,
    unsure: unsure ? [...without(form.unsure, field), field] : without(form.unsure, field),
    fromWords: omit(form.fromWords, field),
  });
}

/**
 * Accept a proposal (or, for a conflict, the value she chose). The field takes the value and remembers
 * the words it came from. Accepting a severity also answers dizziness "yes" if it was still open.
 */
export function acceptProposal(form: CheckInForm, p: Proposal, chosen?: DiaryAnswers[DiaryField]): CheckInForm {
  const value = p.certainty === "conflict" ? (chosen ?? null) : p.value;
  if (value === null || value === undefined) return form;
  const source: WordsSource = {
    origin: p.origin,
    // A conflict she settled herself is neither "stated outright" nor "inferred".
    certainty: p.certainty === "conflict" ? null : p.certainty,
    spans: p.spans.map((s) => ({ ...s })),
  };
  let answers = { ...form.answers, [p.field]: value } as DiaryAnswers;
  let fromWords = { ...form.fromWords, [p.field]: source };
  let unsure = without(form.unsure, p.field);
  if (p.field === "dizzinessSeverity" && answers.dizziness !== true) {
    answers = { ...answers, dizziness: true };
    fromWords = { ...fromWords, dizziness: { ...source, certainty: "explicit" } };
    unsure = without(unsure, "dizziness");
  }
  return normaliseSeverity({ answers, unsure, fromWords });
}

/** Undo an accepted proposal: the field goes back to unanswered (only if it still holds the proposal's value). */
export function unacceptProposal(form: CheckInForm, p: Proposal): CheckInForm {
  if (!isAccepted(form, p)) return form;
  return normaliseSeverity({
    answers: { ...form.answers, [p.field]: null } as DiaryAnswers,
    unsure: form.unsure,
    fromWords: omit(form.fromWords, p.field),
  });
}

function sameSpans(a: Span[], b: Span[]): boolean {
  return a.length === b.length && a.every((s, i) => s.start === b[i].start && s.end === b[i].end);
}

/** The proposal is what the form currently holds for its field (accepted, not changed since). */
export function isAccepted(form: CheckInForm, p: Proposal): boolean {
  const src = form.fromWords[p.field];
  if (!src || !sameSpans(src.spans, p.spans)) return false;
  return p.certainty === "conflict" ? form.answers[p.field] !== null : form.answers[p.field] === p.value;
}

/**
 * After a new reading of the story: drop "from your words" links that pointed at the previous reading,
 * then accept every explicit proposal for a question that is still open. Best guesses (inferred) and
 * conflicts wait for her decision. Answers she gave by hand are never overwritten.
 */
export function applyExtraction(form: CheckInForm, proposals: Proposal[]): CheckInForm {
  let next: CheckInForm = { ...form, fromWords: {} };
  for (const field of Object.keys(form.fromWords) as DiaryField[]) {
    // Values that came from the old reading become open again unless the new reading proposes the same thing.
    const again = proposals.find((p) => p.field === field && p.certainty !== "conflict" && p.value === form.answers[field]);
    next = again ? acceptProposal(next, again) : { ...next, answers: { ...next.answers, [field]: null } as DiaryAnswers };
  }
  for (const p of proposals) {
    if (p.certainty !== "explicit" || p.value === null) continue;
    if (next.answers[p.field] !== null || next.unsure.includes(p.field)) continue;
    if (p.field === "dizzinessSeverity") continue;
    next = acceptProposal(next, p);
  }
  return normaliseSeverity(next);
}

// ---------------------------------------------------------------------------
// Building the CheckIn

/** Keep a span only if it still points at the same words; re-locate it if the story moved; else drop it. */
export function reconcileSpan(story: string, span: Span | null | undefined): Span | null {
  if (!span || !span.quote) return null;
  if (story.slice(span.start, span.end) === span.quote) return { ...span };
  const at = story.indexOf(span.quote);
  return at >= 0 ? { start: at, end: at + span.quote.length, quote: span.quote } : null;
}

export interface BuildCheckInInput {
  date: ISODate;
  story: string;
  form: CheckInForm;
  otherSymptoms: OtherSymptom[];
  medNotes: CheckIn["medNotes"];
  /** The saved check-in for this date, when she is changing it. */
  existing: CheckIn | null;
  now: ISODateTime;
}

/** The CheckIn exactly as it will be saved: confirmed answers, provenance per answered field, verbatim story. */
export function buildCheckIn({ date, story, form, otherSymptoms, medNotes, existing, now }: BuildCheckInInput): CheckIn {
  const answers: DiaryAnswers = { ...form.answers };
  if (answers.dizziness !== true) answers.dizzinessSeverity = null;
  const provenance: CheckIn["provenance"] = {};
  for (const field of FORM_FIELDS) {
    if (answers[field] === null) continue;
    const src = form.fromWords[field];
    const spans = (src?.spans ?? []).map((s) => reconcileSpan(story, s)).filter((s): s is Span => s !== null);
    provenance[field] =
      src && spans.length > 0
        ? { origin: src.origin, certainty: src.certainty, spans: spans.sort((a, b) => a.start - b.start) }
        : { origin: "manual", certainty: null, spans: [] };
  }
  const seen = new Set<string>();
  const others: OtherSymptom[] = [];
  for (const o of otherSymptoms) {
    if (seen.has(o.conceptId)) continue;
    seen.add(o.conceptId);
    others.push({ conceptId: o.conceptId, present: o.present, span: reconcileSpan(story, o.span) });
  }
  const notes = medNotes
    .map((n) => ({ medicationId: n.medicationId, text: n.text, span: reconcileSpan(story, n.span) }))
    .filter((n) => n.text.trim() !== "");
  return {
    id: existing?.id ?? `chk-${date}`,
    date,
    answers,
    otherSymptoms: others,
    story,
    provenance,
    medNotes: notes,
    confirmedAt: now,
    revision: (existing?.revision ?? 0) + 1,
  };
}

/** Insert or replace the day's check-in; the replaced version moves to checkInHistory (audit trail). */
export function commitCheckIn(data: StoreData, next: CheckIn): StoreData {
  const prev = data.checkIns.find((c) => c.date === next.date) ?? null;
  const checkIns = [...data.checkIns.filter((c) => c.date !== next.date), next].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    ...data,
    checkIns,
    checkInHistory: prev ? [...data.checkInHistory, prev] : data.checkInHistory,
  };
}

/** True when nothing would be saved (no answers and no words). */
export function isEmptyCheckIn(form: CheckInForm, story: string): boolean {
  return answeredCount(form.answers) === 0 && story.trim() === "";
}

// ---------------------------------------------------------------------------
// Dates

/** Days she may still change: today and the 6 days before it. */
export const EDITABLE_DAYS = 7;

export function isEditableDate(date: string | null | undefined, today: ISODate): date is ISODate {
  if (!date || !isValidDate(date)) return false;
  const n = daysBetween(date, today);
  return n >= 0 && n < EDITABLE_DAYS;
}

/** Days with a check-in among the last `days` days (including today). */
export function checkedInDays(checkIns: CheckIn[], today: ISODate, days = 7): number {
  const from = addDays(today, -(days - 1));
  return new Set(checkIns.filter((c) => c.date >= from && c.date <= today).map((c) => c.date)).size;
}

// ---------------------------------------------------------------------------
// "Things I didn't add" in her words

export interface SkippedLike {
  mention: { span: Span; negated: boolean; temporality: "current" | "historical" | "hypothetical"; experiencer: "patient" | "other" };
  reason: string;
}

/** Friendly reason + the words it is about, e.g. { quote: "fell off her bike", why: "that's about someone else" }. */
export function friendlySkip(s: SkippedLike): { quote: string; why: string } {
  const inReason = /\("([^"]{1,120})"\)\s*$/.exec(s.reason);
  const quote = (inReason?.[1] ?? s.mention.span.quote).trim();
  const r = s.reason.toLowerCase();
  let why: string;
  if (s.mention.experiencer === "other" || r.includes("someone else")) why = "that's about someone else";
  else if (r.includes("question")) why = "that sounded like a question";
  else if (r.includes("uncertain")) why = "you weren't sure, so I left it for you";
  else if (s.mention.temporality === "hypothetical" || r.includes("possibility")) why = "that sounds like a worry, not something that happened";
  else if (s.mention.temporality === "historical" || r.includes("earlier time")) why = "that was on another day, not today";
  else if (r.includes("part of the fall")) why = "that's part of the fall you described";
  else if (r.includes("change")) why = "that describes a change, not how today was";
  else why = s.reason.replace(/\s*\("[^"]*"\)\s*$/, "").replace(/^./, (c) => c.toLowerCase());
  return { quote, why };
}

/** Skipped mentions, one line per distinct quote. */
export function dedupeSkipped<T extends SkippedLike>(skipped: T[]): { quote: string; why: string; item: T }[] {
  const out: { quote: string; why: string; item: T }[] = [];
  for (const s of skipped) {
    const f = friendlySkip(s);
    if (out.some((o) => o.quote.toLowerCase() === f.quote.toLowerCase())) continue;
    out.push({ ...f, item: s });
  }
  return out;
}

export type { ConceptId };
