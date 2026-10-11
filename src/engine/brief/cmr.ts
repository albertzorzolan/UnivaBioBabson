// Pharmacist-ready outputs (SPEC §6.5, SPEC-UI "Visit brief"):
//
//   toPersonalMedicationList  mirrors the CMS Medicare Part D MTM "Personal Medication List" (PML) that pharmacists
//                             hand out after a Comprehensive Medication Review: one row per medicine with
//                             Medication | How I take it | Why I use it | Prescriber | Date I started, an "Allergies"
//                             line (Kinwise does not record allergies, so it says so rather than implying none), and
//                             "My notes and questions" with saved questions and symptoms recorded in the diary, with
//                             counts AND denominators, explicitly "not assessed for cause".
//   briefToPlainText          the visit brief as plain text for "Copy as text" (a patient-portal message).
//
// Pure and deterministic; wording follows SPEC §3 (records, never causes; questions, never instructions).

import type { BriefContent, CheckIn, ISODate, Medication, MedReview, MetricKey, StoreData, VisitBrief } from "../../model/types";
import { addDays, formatLong, isValidDate } from "../../model/dates";
import { latestCheckInPerDate, windowStatFromDays } from "../timeline/metrics";
import { evidenceHash } from "./evidence";
import { SAFETY_LINE } from "./template";
import {
  CATEGORY_TEXT,
  DEFAULT_KB,
  PRODUCT_NAME,
  caregiverLabel,
  dateWords,
  decisionFor,
  hiddenIngredients,
  howTaken,
  isActiveOn,
  isSelfSelected,
  medName,
  oneLine,
  plural,
} from "./shared";
import type { BriefKb } from "./shared";

// ---------------------------------------------------------------------------
// Personal Medication List

export interface PmlRow {
  medId: string;
  /** Name as entered, plus hidden ingredients for combination products ("Tylenol PM (OTC) (acetaminophen + diphenhydramine)"). */
  medication: string;
  howITakeIt: string;
  whyIUseIt: string;
  prescriber: string;
  started: string;
  stopped: string | null;
  otc: boolean;
  /** Short review flags for the pharmacist ("AGS Beers Criteria: …"); empty when none. */
  flags: string[];
  /** Not in Kinwise's reference set, so not reviewed. */
  notReviewed: boolean;
}

export interface PersonalMedicationList {
  title: string;
  patientName: string;
  age: number;
  preparedOn: string;
  preparedBy: string;
  allergies: string;
  columns: readonly ["Medication", "How I take it", "Why I use it", "Prescriber", "Date I started"];
  rows: PmlRow[];
  /** Medicines stopped in the last 90 days (CMS PML keeps them with a stop date). */
  stoppedRecently: PmlRow[];
  notes: {
    questions: string[];
    /** "Dizziness: recorded on 10 of 25 answered days (Sep 12 through Oct 11)". */
    symptoms: string[];
    symptomsHeading: string;
    concerns: string[];
  };
  period: { from: ISODate; to: ISODate };
  footer: string[];
}

export const PML_COLUMNS = ["Medication", "How I take it", "Why I use it", "Prescriber", "Date I started"] as const;
export const SYMPTOMS_HEADING = "Symptoms recorded (not assessed for cause)";
export const ALLERGIES_UNKNOWN = `Not recorded in ${PRODUCT_NAME}. Please ask about allergies and past reactions.`;

const SYMPTOM_LABELS: [MetricKey, string][] = [
  ["dizziness", "Dizziness"],
  ["drowsiness", "Daytime drowsiness"],
  ["confusion", "Confusion or memory fog"],
  ["fall", "Falls"],
  ["nearFall", "Near-falls"],
  ["swelling", "Ankle swelling"],
  ["appetiteWorse", "Poor appetite"],
];

export interface PmlInput {
  data: StoreData;
  review: MedReview;
  today: ISODate;
  /** Diary period for the symptom lines (default: the 30 days ending today). */
  from?: ISODate;
  to?: ISODate;
  kb?: BriefKb;
}

function row(med: Medication, review: MedReview, data: StoreData, today: ISODate, kb: BriefKb): PmlRow {
  const hidden = hiddenIngredients(med, kb);
  const flags = review.findings
    .filter((f) => f.medIds.includes(med.id) && decisionFor(data.reviewDecisions, f.key) !== "dismissed")
    .map((f) => CATEGORY_TEXT[f.category] ?? f.category);
  const prescriber = isSelfSelected(med) ? (med.otc ? "Self-selected (over the counter)" : "Self-selected") : oneLine(med.prescriber) || "Not recorded";
  return {
    medId: med.id,
    medication: hidden.length ? `${medName(med)} (${hidden.join(" + ")})` : medName(med),
    howITakeIt: howTaken(med) || "Not recorded",
    whyIUseIt: oneLine(med.reason) || "Not recorded",
    prescriber,
    started: isValidDate(med.startDate) ? dateWords(med.startDate, today) : "Not recorded",
    stopped: med.endDate && isValidDate(med.endDate) && med.endDate < today ? dateWords(med.endDate, today) : null,
    otc: med.otc,
    flags: [...new Set(flags)],
    notReviewed: med.match === "none" || (med.ingredientIds ?? []).length === 0 || review.unmatchedMedIds.includes(med.id),
  };
}

/** Symptom lines with counts and answered-day denominators (only items recorded at least once). */
export function symptomLines(checkIns: CheckIn[], from: ISODate, to: ISODate, ref: ISODate): string[] {
  const days = latestCheckInPerDate(checkIns);
  const span = `${dateWords(from, ref)} through ${dateWords(to, ref)}`;
  const out: string[] = [];
  for (const [m, label] of SYMPTOM_LABELS) {
    const s = windowStatFromDays(days, m, from, to);
    if (s.answered === 0 || s.positive === 0) continue;
    out.push(`${label}: recorded on ${s.positive} of ${s.answered} answered ${plural(s.answered, "day")} (${span})`);
  }
  return out;
}

export function toPersonalMedicationList(input: PmlInput): PersonalMedicationList {
  const { data, review, today } = input;
  const kb = input.kb ?? DEFAULT_KB;
  const to = input.to ?? today;
  const from = input.from ?? addDays(to, -29);
  const prof = data.profile;
  const active = data.medications.filter((m) => isActiveOn(m, today));
  const stopped = data.medications.filter((m) => m.endDate && m.endDate < today && m.endDate >= addDays(today, -90));
  const concerns = data.notes.filter((n) => n.pinned).map((n) => oneLine(n.text)).filter(Boolean);
  const questions = (data.savedQuestions ?? []).map((q) => oneLine(q.text)).filter(Boolean);
  const footer = [
    SAFETY_LINE,
    `Prepared with ${PRODUCT_NAME}: a family-kept record, not a clinical assessment. Bring this list to every visit and to the pharmacy.`,
  ];
  if (data.isDemoData) footer.push("Fictional demo data.");
  return {
    title: `Personal Medication List for ${oneLine(prof.displayName)}`,
    patientName: oneLine(prof.displayName),
    age: prof.age,
    preparedOn: formatLong(today),
    preparedBy: caregiverLabel(prof),
    allergies: ALLERGIES_UNKNOWN,
    columns: PML_COLUMNS,
    rows: active.map((m) => row(m, review, data, today, kb)),
    stoppedRecently: stopped.map((m) => row(m, review, data, today, kb)),
    notes: { questions, symptoms: symptomLines(data.checkIns, from, to, today), symptomsHeading: SYMPTOMS_HEADING, concerns },
    period: { from, to },
    footer,
  };
}

/** The PML as plain text (for printing on any device or pasting into a message). */
export function pmlToPlainText(pml: PersonalMedicationList): string {
  const lines: string[] = [];
  lines.push(pml.title.toUpperCase());
  lines.push(`Age ${pml.age} · Prepared ${pml.preparedOn} by ${pml.preparedBy}`);
  lines.push("");
  lines.push(`Allergies: ${pml.allergies}`);
  lines.push("");
  lines.push("MY MEDICINES");
  if (!pml.rows.length) lines.push("- No medicines on the list.");
  for (const r of pml.rows) {
    lines.push(`- ${r.medication}`);
    lines.push(`  How I take it: ${r.howITakeIt}`);
    lines.push(`  Why I use it: ${r.whyIUseIt}`);
    lines.push(`  Prescriber: ${r.prescriber} · Started: ${r.started}`);
    if (r.flags.length) lines.push(`  To ask about: ${r.flags.join("; ")}`);
    if (r.notReviewed) lines.push(`  Not in ${PRODUCT_NAME}'s reference set (not reviewed).`);
  }
  if (pml.stoppedRecently.length) {
    lines.push("");
    lines.push("STOPPED RECENTLY");
    for (const r of pml.stoppedRecently) lines.push(`- ${r.medication}: last taken ${r.stopped}`);
  }
  lines.push("");
  lines.push("MY NOTES AND QUESTIONS");
  for (const c of pml.notes.concerns) lines.push(`- Concern: ${c}`);
  for (const q of pml.notes.questions) lines.push(`- Question: ${q}`);
  if (!pml.notes.concerns.length && !pml.notes.questions.length) lines.push("- No saved questions yet.");
  lines.push("");
  lines.push(`${pml.notes.symptomsHeading}:`);
  if (pml.notes.symptoms.length) for (const s of pml.notes.symptoms) lines.push(`- ${s}`);
  else lines.push("- None of the diary symptoms were recorded in this period.");
  lines.push("");
  for (const f of pml.footer) lines.push(f);
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Visit brief as plain text ("Copy as text")

export interface PlainTextOptions {
  data: StoreData;
  review: MedReview;
  today: ISODate;
  kb?: BriefKb;
  /**
   * Hard character budget for portal messages (the returned string, trailing newline included, never exceeds it).
   * When the full text is longer, sections are shortened in order (medication list and limitations, then review
   * prompts, then observations, then whole sections by priority: questions first), a line says the message was
   * shortened, and the safety line is always kept. Default: no limit.
   */
  maxChars?: number;
}

function isVisitBrief(b: VisitBrief | BriefContent): b is VisitBrief {
  return (b as VisitBrief).content !== undefined;
}

/**
 * Plain-text visit brief for a patient-portal message. Same sections as the printed page (SPEC §6.6), the
 * persistent safety line, and a "not yet reviewed" line when the family has not marked the brief reviewed.
 */
export function briefToPlainText(brief: VisitBrief | BriefContent, opts: PlainTextOptions): string {
  const { data, today } = opts;
  const kb = opts.kb ?? DEFAULT_KB;
  const content = isVisitBrief(brief) ? brief.content : brief;
  const meta = isVisitBrief(brief) ? brief : null;
  const prof = data.profile;
  const from = meta?.from;
  const to = meta?.to;
  const head: string[] = [];
  const period = from && to ? `, ${dateWords(from, to)} to ${dateWords(to, to)}, ${to.slice(0, 4)}` : "";
  head.push(`Visit brief for ${oneLine(prof.displayName)} (age ${prof.age})${period}`);
  head.push(`Prepared by ${caregiverLabel(prof)} with ${PRODUCT_NAME} on ${formatLong(today)}. A family-kept record, not a clinical assessment.`);
  if (meta && !meta.reviewedAt) head.push("Draft: not yet marked as reviewed by the family.");
  if (data.isDemoData) head.push("Fictional demo data.");

  const section = (title: string, lines: string[], numbered = false) =>
    [title, ...(lines.length ? lines.map((l, i) => `${numbered ? `${i + 1}.` : "-"} ${oneLine(l)}`) : ["- None."])].join("\n");

  const reason = section("1. Why we're coming in", content.reason.map((s) => s.text));
  const noticed = section("2. What we've noticed", content.noticed.map((s) => s.text));
  const prompts = section("3. Medication review prompts", content.reviewPrompts.map((p) => `${p.text} (${p.sourceShort})`));
  const questions = section("4. Our questions", content.questions.map((s) => s.text), true);
  const active = data.medications.filter((m) => isActiveOn(m, to ?? today));
  const medLines = active.map((m) => {
    const hidden = hiddenIngredients(m, kb);
    const name = hidden.length ? `${medName(m)} (${hidden.join(" + ")})` : medName(m);
    const parts = [howTaken(m), oneLine(m.reason) ? `for ${oneLine(m.reason).toLowerCase()}` : "", isSelfSelected(m) ? "over the counter" : oneLine(m.prescriber)];
    return `${name}: ${parts.filter(Boolean).join(", ")}`;
  });
  const meds = section(`5. Current medicines (${active.length})`, medLines);
  const limits = section("6. Diary coverage and limitations", content.limitations);
  const tail = [SAFETY_LINE];

  const full = `${[head.join("\n"), reason, noticed, prompts, questions, meds, limits, tail.join("\n")].join("\n\n")}\n`;
  const max = opts.maxChars;
  if (!max || full.length <= max) return full;

  // Shortened variants, least to most compact. Each keeps the header, a "shortened" line and the safety line.
  const note = "(Shortened for this message; the printed brief has every section.)";
  const build = (blocks: string[]) => `${[head.join("\n"), ...blocks.filter(Boolean), note, tail.join("\n")].join("\n\n")}\n`;
  const promptTitle = (t: string) => t.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? t;
  const nLimits = content.limitations.length;
  const shortMeds = `5. Current medicines (${active.length}): ${active.map((m) => medName(m)).join(", ") || "none"}`;
  const countMeds = `5. Current medicines: ${active.length} (see the printed brief)`;
  const shortLimits =
    `6. Diary coverage and limitations\n- ${oneLine(content.limitations[0] ?? "None.")}` +
    (nLimits > 1 ? `\n- (${nLimits - 1} more ${plural(nLimits - 1, "line")} in the full brief.)` : "");
  const shortPrompts = section("3. Medication review prompts", content.reviewPrompts.map((p) => `${promptTitle(p.text)} (${p.sourceShort})`));
  const countPrompts = `3. Medication review prompts: ${content.reviewPrompts.length} (see the printed brief)`;
  const firstTwo = (title: string, list: string[]) => section(title, list.slice(0, 2).concat(list.length > 2 ? [`(${list.length - 2} more in the full brief.)`] : []));
  const shortReason = firstTwo("1. Why we're coming in", content.reason.map((s) => s.text));
  const shortNoticed = firstTwo("2. What we've noticed", content.noticed.map((s) => s.text));
  const variants = [
    [reason, noticed, prompts, questions, shortMeds, shortLimits],
    [reason, noticed, shortPrompts, questions, shortMeds, shortLimits],
    [shortReason, shortNoticed, shortPrompts, questions, countMeds, shortLimits],
    [shortReason, shortNoticed, countPrompts, questions, countMeds, ""],
  ];
  for (const v of variants) {
    const t = build(v);
    if (t.length <= max) return t;
  }
  // Still too long: the questions first (as many as fit, in order, with a line saying how many were left out),
  // then whole sections by priority (observations, reason, prompts, medicines), shown in their usual order.
  const kept: [number, string][] = [];
  const qs: string[] = [];
  content.questions.forEach((s, i) => {
    const line = `${i + 1}. ${oneLine(s.text)}`;
    const rest = content.questions.length - qs.length - 1;
    const block = ["4. Our questions", ...qs, line, ...(rest > 0 ? [`(${rest} more in the full brief.)`] : [])].join("\n");
    if (qs.length === i && build([block]).length <= max) qs.push(line);
  });
  if (qs.length) {
    const rest = content.questions.length - qs.length;
    kept.push([4, ["4. Our questions", ...qs, ...(rest > 0 ? [`(${rest} more in the full brief.)`] : [])].join("\n")]);
  }
  for (const entry of [[2, shortNoticed], [1, shortReason], [3, countPrompts], [5, countMeds]] as [number, string][]) {
    const trial = [...kept, entry].sort((a, b) => a[0] - b[0]);
    if (build(trial.map((x) => x[1])).length <= max) kept.push(entry);
  }
  const t = build(kept.sort((a, b) => a[0] - b[0]).map((x) => x[1]));
  if (t.length <= max) return t;
  // A budget too small for the header: the safety line alone (cut only if the budget cannot hold it).
  const minimal = `${note}\n\n${SAFETY_LINE}\n`;
  return minimal.length <= max ? minimal : `${SAFETY_LINE}\n`.slice(0, max);
}

/** Stable fingerprint of a plain-text export (lets the UI show "copied" for the current version only). */
export function plainTextHash(text: string): string {
  return evidenceHash([{ id: "text", kind: "fact", text }]);
}
