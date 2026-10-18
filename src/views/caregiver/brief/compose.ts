// Visit brief composition for the caregiver builder (SPEC-UI "Visit brief"). Pure functions over the brief engine
// (src/engine/brief): they choose what goes into a brief, apply the builder's checkboxes to an existing brief without
// losing the family's edits, track "edited by" marks, and prepare the medication table and the before/after strip.
//
// Rules kept here (so the view stays declarative):
//   - Every sentence keeps the evidence ids it was built from; edits change the words, never the citations.
//   - Any change to the content clears the "reviewed" mark (the family reviews what will actually print).
//   - Review prompts are engine text (title + first plain sentence + citation) and are never reworded.
//   - Quoted concerns get typographic quotes (“…”, ’) for print; the claim checker folds them back to ASCII.

import type {
  BriefContent,
  BriefSentence,
  CheckIn,
  EvidencePackage,
  Finding,
  FindingCategory,
  ISODate,
  ISODateTime,
  Medication,
  MedReview,
  MetricKey,
  Role,
  Signal,
  StoreData,
  TimelineAnalysis,
  VisitBrief,
} from "../../../model/types";
import { dateRange, daysBetween } from "../../../model/dates";
import {
  buildEvidence,
  defaultPeriod,
  evidenceId,
  findingQuestionText,
  findingSourceShort,
  promptFindings,
  rankSignals,
  selectReviewPrompts,
  templateBrief,
  TEMPLATE_LIMITS,
  toPersonalMedicationList,
  verifySentence,
} from "../../../engine/brief";
import type { BriefEvidenceItem, PmlRow } from "../../../engine/brief";
import { firstSentence, oneLine, sentence } from "../../../engine/brief/shared";
import { getMetric, latestCheckInPerDate, metricValue } from "../../../engine/timeline/metrics";

// ---------------------------------------------------------------------------
// Types

/** The derived engine results a brief is built from (useStore + useDerived). */
export interface BriefInputs {
  data: StoreData;
  review: MedReview;
  timeline: TimelineAnalysis;
  today: ISODate;
}

/** A brief sentence that may carry an edit mark (stored in data.briefs; extra fields are ignored by other readers). */
export interface MarkedSentence extends BriefSentence {
  /** The generated wording, kept when the family rewrites the sentence. */
  original?: string;
  /** Display name of the person who edited it ("Alex"). */
  editedBy?: string;
}

export type EditableSection = "reason" | "noticed" | "questions";

export const PERIOD_OPTIONS = [14, 30, 60] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];
export const DEFAULT_PERIOD: PeriodDays = 30;

/** The evidence package carries up to 5 saved questions, so a brief can include at most 5. */
export const MAX_SAVED_IN_BRIEF = 5;
/** Briefs kept in the record (oldest dropped first). */
export const MAX_STORED_BRIEFS = 8;

// ---------------------------------------------------------------------------
// Small helpers

function norm(text: string): string {
  return oneLine(text).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Straight quotes to typographic ones: `"` opens after the start, a space or a bracket and closes elsewhere; an
 * apostrophe between letters becomes ’ ("Mom's" → "Mom’s"). Already-curly text is unchanged. Typography only: the
 * claim checker's foldText maps these back, so quoted words still match their evidence.
 */
export function curlyQuotes(text: string): string {
  return text.replace(/(\p{L})'(?=\p{L})/gu, "$1’").replace(/"/g, (_, at: number, all: string) => (at === 0 || /[\s([{]/.test(all[at - 1]) ? "“" : "”"));
}

/** A "Why we're coming in" sentence for a pinned concern, worded as the evidence package has it. */
function concernSentence(c: { id: string; text: string }): BriefSentence {
  return { text: curlyQuotes(c.text), evidenceIds: [c.id] };
}

const SAVED_PREFIX = "note:question:";
const CONCERN_PREFIX = "concern:";
const FINDING_PREFIX = "find:";

/** Saved-question ids a brief cites. */
export function savedIdsIn(content: BriefContent): string[] {
  const out: string[] = [];
  for (const q of content.questions)
    for (const id of q.evidenceIds) if (id.startsWith(SAVED_PREFIX) && !out.includes(id.slice(SAVED_PREFIX.length))) out.push(id.slice(SAVED_PREFIX.length));
  return out;
}

/** Finding keys shown as review prompts. */
export function findingKeysIn(content: BriefContent): string[] {
  return content.reviewPrompts.map((p) => p.findingKey);
}

/** Period length in days (inclusive) of a brief. */
export function periodLength(b: Pick<VisitBrief, "from" | "to">): number {
  return daysBetween(b.from, b.to) + 1;
}

/** The period option closest to a brief's length (for the period control). */
export function periodOption(b: Pick<VisitBrief, "from" | "to"> | null): PeriodDays {
  if (!b) return DEFAULT_PERIOD;
  const n = periodLength(b);
  return PERIOD_OPTIONS.reduce((best, p) => (Math.abs(p - n) < Math.abs(best - n) ? p : best), DEFAULT_PERIOD);
}

// ---------------------------------------------------------------------------
// Evidence package for a brief

/** Saved questions included in the brief come first, so they are inside the package's 5-question window. */
function dataForPackage(data: StoreData, includedSavedIds: string[]): StoreData {
  const inc = new Set(includedSavedIds);
  const saved = [...(data.savedQuestions ?? [])].sort((a, b) => (inc.has(a.id) ? 0 : 1) - (inc.has(b.id) ? 0 : 1));
  return { ...data, savedQuestions: saved };
}

export interface PackageOptions {
  from: ISODate;
  to: ISODate;
  includedConcernIds: string[];
  includedSavedIds: string[];
}

/** The evidence package a brief cites (rebuilt from the live record; ids are stable across rebuilds). */
export function briefPackage(inp: BriefInputs, opts: PackageOptions): EvidencePackage & { items: BriefEvidenceItem[] } {
  return buildEvidence({
    data: dataForPackage(inp.data, opts.includedSavedIds),
    from: opts.from,
    to: opts.to,
    review: inp.review,
    timeline: inp.timeline,
    includedConcernIds: opts.includedConcernIds,
  });
}

/** Package options for an existing brief. */
export function packageOptionsFor(b: VisitBrief): PackageOptions {
  return { from: b.from, to: b.to, includedConcernIds: b.includedConcernIds, includedSavedIds: savedIdsIn(b.content) };
}

// ---------------------------------------------------------------------------
// What can be included

/** Findings the builder can include: not dismissed, present in the package, ranked (diary-linked first). */
export function selectableFindings(inp: BriefInputs, pkg: EvidencePackage): Finding[] {
  const ids = new Set(pkg.items.map((i) => i.id));
  return promptFindings(inp.review, inp.data).filter((f) => ids.has(evidenceId.finding(f.key)));
}

/** Pinned notes (visit concerns), newest first. */
export function pinnedConcerns(data: StoreData) {
  return data.notes.filter((n) => n.pinned).sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1));
}

/** A review prompt line, exactly as the template renders it. */
export function promptFor(f: Finding): BriefContent["reviewPrompts"][number] {
  return {
    findingKey: f.key,
    text: oneLine(f.plain) ? `${sentence(f.title)} ${firstSentence(f.plain)}` : sentence(f.title),
    sourceShort: findingSourceShort(f),
  };
}

/**
 * The visit question of a finding, citing the finding and up to two of its signals. The wording comes from the
 * template's findingQuestionText, so the fall-risk question is rebuilt for the brief period without bare counts.
 */
export function findingQuestion(
  f: Finding,
  pkgIds: Set<string>,
  period: Pick<EvidencePackage, "from" | "to">,
  data: StoreData,
): MarkedSentence | null {
  const text = oneLine(findingQuestionText(f, period, data));
  if (!text) return null;
  return { text, evidenceIds: [evidenceId.finding(f.key), ...(f.signalIds ?? []).filter((id) => pkgIds.has(id)).slice(0, 2)] };
}

function savedSentence(q: StoreData["savedQuestions"][number]): MarkedSentence {
  return { text: oneLine(q.text), evidenceIds: [evidenceId.question(q.id)] };
}

function hasQuestion(list: BriefSentence[], text: string): boolean {
  const n = norm(text);
  return list.some((q) => norm(q.text) === n || norm((q as MarkedSentence).original ?? "") === n);
}

function buildQuestions(
  chosen: Finding[],
  saved: StoreData["savedQuestions"],
  pkgIds: Set<string>,
  period: Pick<EvidencePackage, "from" | "to">,
  data: StoreData,
): MarkedSentence[] {
  const out: MarkedSentence[] = [];
  let fromFindings = 0;
  for (const f of chosen) {
    if (fromFindings >= TEMPLATE_LIMITS.findingQuestions) break;
    const q = findingQuestion(f, pkgIds, period, data);
    if (!q || hasQuestion(out, q.text)) continue;
    out.push(q);
    fromFindings++;
  }
  for (const q of saved) {
    if (!pkgIds.has(evidenceId.question(q.id)) || !oneLine(q.text) || hasQuestion(out, q.text)) continue;
    out.push(savedSentence(q));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fresh template brief

export interface ComposeOptions {
  from: ISODate;
  to: ISODate;
  includedConcernIds: string[];
  /** Finding keys to include; null = the template's own breadth-first pick of 5. */
  findingKeys: string[] | null;
  /** Saved question ids to include; null = every saved question (up to MAX_SAVED_IN_BRIEF). */
  savedIds: string[] | null;
}

/** Default builder options for a new brief: last 30 days, every pinned concern, template picks, all saved questions. */
export function defaultComposeOptions(inp: BriefInputs, days: number = DEFAULT_PERIOD): ComposeOptions {
  const p = defaultPeriod(inp.today, days);
  return { from: p.from, to: p.to, includedConcernIds: pinnedConcerns(inp.data).map((n) => n.id), findingKeys: null, savedIds: null };
}

/** Options that rebuild an existing brief with the same selections (new period optional). */
export function composeOptionsFrom(inp: BriefInputs, b: VisitBrief, days?: number): ComposeOptions {
  const p = days ? defaultPeriod(inp.today, days) : defaultPeriod(inp.today, periodLength(b));
  const pinned = new Set(pinnedConcerns(inp.data).map((n) => n.id));
  return {
    from: p.from,
    to: p.to,
    includedConcernIds: b.includedConcernIds.filter((id) => pinned.has(id)),
    findingKeys: findingKeysIn(b.content),
    savedIds: savedIdsIn(b.content),
  };
}

/** Build the deterministic brief for a selection (template wording; selection applied to prompts + questions). */
export function composeTemplate(inp: BriefInputs, opts: ComposeOptions): { pkg: EvidencePackage & { items: BriefEvidenceItem[] }; content: BriefContent } {
  const savedIds = (opts.savedIds ?? (inp.data.savedQuestions ?? []).map((q) => q.id)).slice(0, MAX_SAVED_IN_BRIEF);
  const pkg = briefPackage(inp, { from: opts.from, to: opts.to, includedConcernIds: opts.includedConcernIds, includedSavedIds: savedIds });
  const pkgIds = new Set(pkg.items.map((i) => i.id));
  const template = templateBrief(pkg, { data: dataForPackage(inp.data, savedIds), review: inp.review, timeline: inp.timeline });
  const isConcern = (s: BriefSentence) => s.evidenceIds.length === 1 && s.evidenceIds[0].startsWith(CONCERN_PREFIX);
  const base = { ...template, reason: template.reason.map((s) => (isConcern(s) ? { ...s, text: curlyQuotes(s.text) } : s)) };
  const ranked = selectableFindings(inp, pkg);
  // A kept selection whose prompts all disappeared (the medicine list changed) falls back to the template's pick;
  // an explicit empty selection stays empty.
  const kept = opts.findingKeys ? ranked.filter((f) => opts.findingKeys!.includes(f.key)) : [];
  const chosen = opts.findingKeys && (kept.length > 0 || opts.findingKeys.length === 0) ? kept : selectReviewPrompts(ranked);
  const savedById = new Map((inp.data.savedQuestions ?? []).map((q) => [q.id, q]));
  const saved = savedIds.map((id) => savedById.get(id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
  return {
    pkg,
    content: { ...base, reviewPrompts: chosen.map(promptFor), questions: buildQuestions(chosen, saved, pkgIds, pkg, inp.data) },
  };
}

/** Saved questions the family selected, as sentences (appended to an AI draft, which writes its own questions). */
export function savedQuestionSentences(data: StoreData, savedIds: string[], pkg: EvidencePackage): MarkedSentence[] {
  const pkgIds = new Set(pkg.items.map((i) => i.id));
  return (data.savedQuestions ?? [])
    .filter((q) => savedIds.includes(q.id) && pkgIds.has(evidenceId.question(q.id)) && oneLine(q.text))
    .map(savedSentence);
}

/** Merge extra questions into a list without duplicates (by normalised text). */
export function mergeQuestions(list: BriefSentence[], extra: BriefSentence[]): BriefSentence[] {
  const out = [...list];
  for (const q of extra) if (!hasQuestion(out, q.text)) out.push(q);
  return out;
}

// ---------------------------------------------------------------------------
// Builder toggles on an existing brief (edits elsewhere are kept)

/** Include or leave out one finding: its review prompt and its visit question. */
export function withFinding(
  content: BriefContent,
  f: Finding,
  on: boolean,
  ranked: Finding[],
  pkg: EvidencePackage,
  data: StoreData,
): BriefContent {
  const id = evidenceId.finding(f.key);
  const present = content.reviewPrompts.some((p) => p.findingKey === f.key);
  if (on) {
    if (present) return content;
    const keys = new Set([...findingKeysIn(content), f.key]);
    const existing = new Map(content.reviewPrompts.map((p) => [p.findingKey, p]));
    const order = ranked.filter((x) => keys.has(x.key)).map((x) => existing.get(x.key) ?? promptFor(x));
    // Prompts the ranking no longer knows (e.g. a dismissed finding) stay at the end rather than vanish silently.
    for (const p of content.reviewPrompts) if (!order.some((o) => o.findingKey === p.findingKey)) order.push(p);
    const q = findingQuestion(f, new Set(pkg.items.map((i) => i.id)), pkg, data);
    let questions = content.questions;
    if (q && !hasQuestion(questions, q.text)) {
      const lastFinding = questions.reduce((at, s, i) => (s.evidenceIds[0]?.startsWith(FINDING_PREFIX) ? i : at), -1);
      questions = [...questions.slice(0, lastFinding + 1), q, ...questions.slice(lastFinding + 1)];
    }
    return { ...content, reviewPrompts: order, questions };
  }
  if (!present) return content;
  return {
    ...content,
    reviewPrompts: content.reviewPrompts.filter((p) => p.findingKey !== f.key),
    questions: content.questions.filter((q) => q.evidenceIds[0] !== id),
  };
}

/** Include or leave out one saved question. */
export function withSavedQuestion(content: BriefContent, q: StoreData["savedQuestions"][number], on: boolean): BriefContent {
  const id = evidenceId.question(q.id);
  if (on) {
    if (content.questions.some((s) => s.evidenceIds.includes(id)) || hasQuestion(content.questions, q.text)) return content;
    return { ...content, questions: [...content.questions, savedSentence(q)] };
  }
  const n = norm(q.text);
  return { ...content, questions: content.questions.filter((s) => !s.evidenceIds.includes(id) && norm(s.text) !== n) };
}

/** Whether a saved question is in the brief (cited, or the same words as a finding question already there). */
export function savedQuestionIncluded(content: BriefContent, q: StoreData["savedQuestions"][number]): boolean {
  const id = evidenceId.question(q.id);
  return content.questions.some((s) => s.evidenceIds.includes(id)) || hasQuestion(content.questions, q.text);
}

/** Keep the brief's question in step when a saved question is reworded in the builder. */
export function withSavedQuestionText(content: BriefContent, q: StoreData["savedQuestions"][number], text: string): BriefContent {
  const id = evidenceId.question(q.id);
  return { ...content, questions: content.questions.map((s) => (s.evidenceIds.includes(id) ? { text: oneLine(text), evidenceIds: s.evidenceIds } : s)) };
}

/**
 * "Why we're coming in" for a new concern selection. Sentences citing a still-included concern keep their
 * (possibly edited) wording; newly included concerns use the package text; with no concern the template's
 * general sentence is used.
 */
export function reasonFor(current: BriefSentence[], pkg: EvidencePackage, fallback: BriefSentence[]): BriefSentence[] {
  const concerns = pkg.items.filter((i) => i.kind === "concern");
  if (concerns.length === 0) {
    const general = current.filter((s) => !s.evidenceIds.some((id) => id.startsWith(CONCERN_PREFIX)));
    return general.length ? general : fallback;
  }
  return concerns.map((c) => current.find((s) => s.evidenceIds.includes(c.id)) ?? concernSentence(c));
}

// ---------------------------------------------------------------------------
// Sentence edits

export function isEdited(s: BriefSentence): boolean {
  const m = s as MarkedSentence;
  return m.original !== undefined && m.original !== s.text;
}

/** Rewrite one sentence; restoring the original wording clears the edit mark. */
export function editSentence(content: BriefContent, section: EditableSection, index: number, text: string, editor: string): BriefContent {
  const list = content[section] as MarkedSentence[];
  const s = list[index];
  if (!s) return content;
  const t = oneLine(text);
  const original = s.original ?? s.text;
  const next: MarkedSentence = t === original ? { text: original, evidenceIds: s.evidenceIds } : { text: t, evidenceIds: s.evidenceIds, original, editedBy: editor };
  return { ...content, [section]: list.map((x, i) => (i === index ? next : x)) };
}

export function restoreSentence(content: BriefContent, section: EditableSection, index: number): BriefContent {
  const list = content[section] as MarkedSentence[];
  const s = list[index];
  if (!s || s.original === undefined) return content;
  return { ...content, [section]: list.map((x, i) => (i === index ? { text: s.original!, evidenceIds: s.evidenceIds } : x)) };
}

export function removeSentence(content: BriefContent, section: EditableSection, index: number): BriefContent {
  return { ...content, [section]: content[section].filter((_, i) => i !== index) };
}

/** Number of edited sentences and who edited them. */
export function editSummary(content: BriefContent): { count: number; editors: string[] } {
  const all = [...content.reason, ...content.noticed, ...content.questions] as MarkedSentence[];
  const edited = all.filter(isEdited);
  return { count: edited.length, editors: [...new Set(edited.map((s) => s.editedBy ?? "the family"))] };
}

/** Friendly notes from the claim checker for an edited sentence (empty when it matches its records). */
export function checkEditedSentence(s: BriefSentence, section: EditableSection, pkg: EvidencePackage, data: StoreData): string[] {
  if (!isEdited(s)) return [];
  const res = verifySentence(s, pkg, {
    medNames: data.medications.map((m) => m.name),
    patientNames: [data.profile.preferredName, data.profile.displayName, "Mom", "Mum"].filter(Boolean),
    expect: section === "questions" ? "question" : "statement",
    maxLength: 420,
  });
  return res.issues.map(friendlyIssue).filter((x, i, a) => a.indexOf(x) === i);
}

/** "code: detail" from the verifier → a short plain note for the family. */
export function friendlyIssue(issue: string): string {
  const at = issue.indexOf(":");
  const code = at > 0 ? issue.slice(0, at) : issue;
  const detail = at > 0 ? issue.slice(at + 1).trim() : "";
  switch (code) {
    case "banned":
      return `Wording: this ${detail.replace(/^[a-z]+:\s*/, "").replace(/\s*\(.*\)$/, "")}. Kinwise briefs describe what was recorded — not causes, safety or what to do.`;
    case "number_unsupported":
    case "pair_unsupported":
    case "pair_context":
    case "quantifier_unsupported":
      return "Some numbers here don't match the linked records.";
    case "date_unsupported":
      return `A date here isn't in the linked records (${detail}).`;
    case "med_unknown":
      return `A medicine named here isn't on the list (${detail}).`;
    case "form":
      return "Questions for the clinician should end with a question mark.";
    case "too_long":
      return "This is long for a one-page brief.";
    case "empty":
    case "too_short":
      return "This sentence is empty.";
    default:
      return detail ? `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` : "This sentence doesn't match its records.";
  }
}

// ---------------------------------------------------------------------------
// Brief records in the store

/** The brief the builder works on: the most recently created one. */
export function currentBrief(data: StoreData): VisitBrief | null {
  const list = data.briefs ?? [];
  return list.length ? list[list.length - 1] : null;
}

/** Replace (by id) or append a brief, keeping the newest MAX_STORED_BRIEFS. */
export function upsertBrief(data: StoreData, brief: VisitBrief): StoreData {
  const list = data.briefs ?? [];
  const at = list.findIndex((b) => b.id === brief.id);
  const next = at >= 0 ? list.map((b, i) => (i === at ? brief : b)) : [...list, brief];
  return { ...data, briefs: next.slice(-MAX_STORED_BRIEFS) };
}

/** A content change: the family has to review the brief again. */
export function withContent(b: VisitBrief, content: BriefContent, patch: Partial<VisitBrief> = {}): VisitBrief {
  return { ...b, ...patch, content, reviewedAt: null, reviewedBy: null };
}

export function withReview(b: VisitBrief, reviewed: boolean, by: Role, at: ISODateTime): VisitBrief {
  return reviewed ? { ...b, reviewedAt: at, reviewedBy: by } : { ...b, reviewedAt: null, reviewedBy: null };
}

// ---------------------------------------------------------------------------
// Medication table

const FLAG_SHORT: Partial<Record<FindingCategory, string>> = {
  beers_avoid: "Beers avoid",
  beers_caution: "Beers caution",
  beers_condition: "Beers condition",
  beers_interaction: "Beers combo",
  beers_renal: "Beers kidney",
  prescribing_cascade: "Cascade?",
  duplicate_class: "Same group",
  cns_active_combo: "CNS combination",
  monitoring: "Watch for",
};

export interface MedTableRow extends PmlRow {
  /** Short flags for the table ("Beers: avoid", "ACB 3", "Fall risk", "Cascade?"). */
  short: string[];
  /** Started inside the brief period (shown as "new"). */
  isNew: boolean;
}

/** Medication rows (CMS PML wording) with short review flags. Dismissed findings are not flagged. */
export function medTable(inp: BriefInputs, b: Pick<VisitBrief, "from" | "to">): MedTableRow[] {
  const { data, review } = inp;
  const pml = toPersonalMedicationList({ data, review, today: b.to, from: b.from, to: b.to });
  const dismissed = new Set(data.reviewDecisions.filter((d) => d.status === "dismissed").map((d) => d.findingKey));
  const acb = new Map<string, number>();
  for (const c of review.acb.contributors) acb.set(c.medId, Math.max(acb.get(c.medId) ?? 0, c.score));
  const medById = new Map(data.medications.map((m) => [m.id, m]));
  return pml.rows.map((r) => {
    const short: string[] = [];
    const cats = new Set(review.findings.filter((f) => f.medIds.includes(r.medId) && !dismissed.has(f.key)).map((f) => f.category));
    // All AGS Beers flags of one medicine in one tag ("Beers avoid + condition + combination").
    const beers = (["beers_avoid", "beers_caution", "beers_condition", "beers_interaction", "beers_renal"] as FindingCategory[])
      .filter((c) => cats.has(c))
      .map((c) => FLAG_SHORT[c]!.replace(/^Beers /, ""));
    if (beers.length) short.push(`Beers ${beers.join(" + ")}`);
    if (acb.has(r.medId)) short.push(`ACB ${acb.get(r.medId)}`);
    if (review.fallRiskMedIds.includes(r.medId)) short.push("Fall risk");
    for (const c of ["prescribing_cascade", "duplicate_class", "cns_active_combo", "monitoring"] as FindingCategory[])
      if (cats.has(c)) short.push(FLAG_SHORT[c]!);
    if (r.notReviewed) short.push("Not reviewed");
    const med: Medication | undefined = medById.get(r.medId);
    return { ...r, short: [...new Set(short)], isNew: Boolean(med && med.startDate >= b.from && med.startDate <= b.to) };
  });
}

// ---------------------------------------------------------------------------
// Before/after day strip (the brief's mini chart)

export type StripCell = "yes" | "no" | "none" | "fall" | "near";

export interface StripRow {
  key: string;
  label: string;
  cells: StripCell[];
  before: { positive: number; answered: number };
  after: { positive: number; answered: number };
}

export interface StripChart {
  medicationId: string;
  medName: string;
  event: Signal["event"];
  eventDate: ISODate;
  days: ISODate[];
  /** Index of the event day in `days`. */
  eventIndex: number;
  rows: StripRow[];
  signalIds: string[];
}

/** The signal the brief leads with: the first one "What we've noticed" cites, else the strongest in the period. */
export function leadSignal(inp: BriefInputs, content: BriefContent, pkg: EvidencePackage): Signal | null {
  const byId = new Map(inp.timeline.signals.map((s) => [s.id, s]));
  for (const s of content.noticed) for (const id of s.evidenceIds) if (byId.has(id)) return byId.get(id)!;
  const inPeriod = inp.timeline.signals.filter((s) => s.after.to >= pkg.from);
  return rankSignals(inPeriod)[0] ?? null;
}

function count(days: CheckIn[], m: MetricKey, from: ISODate, to: ISODate) {
  let positive = 0;
  let answered = 0;
  for (const c of days) {
    if (c.date < from || c.date > to) continue;
    const v = metricValue(c, m);
    if (v === null) continue;
    answered++;
    if (v === 1) positive++;
  }
  return { positive, answered };
}

/**
 * Day-by-day strip around the lead signal's medication change: up to 3 yes/no diary items that changed (same
 * medication + event), plus a falls/near-falls row when any were recorded in the window. Unanswered days are
 * shown as "no entry", never as "no".
 */
export function signalStrip(inp: BriefInputs, content: BriefContent, pkg: EvidencePackage, medName: (m: Medication | undefined) => string): StripChart | null {
  const lead = leadSignal(inp, content, pkg);
  if (!lead) return null;
  const group = rankSignals(
    inp.timeline.signals.filter(
      (s) => s.medicationId === lead.medicationId && s.event === lead.event && s.eventDate === lead.eventDate && getMetric(s.metric).kind === "boolean",
    ),
  );
  const rows = [lead, ...group.filter((s) => s.id !== lead.id)].filter((s) => getMetric(s.metric).kind === "boolean").slice(0, 3);
  if (rows.length === 0) return null;
  const from = rows.reduce((d, s) => (s.before.from < d ? s.before.from : d), rows[0].before.from);
  const to = rows.reduce((d, s) => (s.after.to > d ? s.after.to : d), rows[0].after.to);
  const days = dateRange(from, to);
  const byDate = new Map(latestCheckInPerDate(inp.data.checkIns).map((c) => [c.date, c]));
  const out: StripRow[] = rows.map((s) => ({
    key: s.metric,
    label: getMetric(s.metric).short,
    cells: days.map((d) => {
      const c = byDate.get(d);
      const v = c ? metricValue(c, s.metric) : null;
      return v === null ? "none" : v === 1 ? "yes" : "no";
    }),
    before: { positive: s.before.positive, answered: s.before.answered },
    after: { positive: s.after.positive, answered: s.after.answered },
  }));
  const dayCheckIns = days.map((d) => byDate.get(d)).filter((c): c is CheckIn => Boolean(c));
  const beforeTo = rows[0].before.to;
  const afterFrom = rows[0].after.from;
  const falls = (lo: ISODate, hi: ISODate) => {
    const f = count(dayCheckIns, "fall", lo, hi);
    const n = count(dayCheckIns, "nearFall", lo, hi);
    const answered = dayCheckIns.filter((c) => c.date >= lo && c.date <= hi && (metricValue(c, "fall") !== null || metricValue(c, "nearFall") !== null)).length;
    return { positive: f.positive + n.positive, answered };
  };
  const fb = falls(from, beforeTo);
  const fa = falls(afterFrom, to);
  if (fb.positive + fa.positive > 0) {
    out.push({
      key: "falls",
      label: "Fall / near-fall",
      cells: days.map((d) => {
        const c = byDate.get(d);
        if (!c) return "none";
        const fall = metricValue(c, "fall");
        const near = metricValue(c, "nearFall");
        if (fall === 1) return "fall";
        if (near === 1) return "near";
        return fall === null && near === null ? "none" : "no";
      }),
      before: fb,
      after: fa,
    });
  }
  const med = inp.data.medications.find((m) => m.id === lead.medicationId);
  return {
    medicationId: lead.medicationId,
    medName: medName(med),
    event: lead.event,
    eventDate: lead.eventDate,
    days,
    eventIndex: Math.max(0, days.indexOf(lead.eventDate)),
    rows: out,
    signalIds: rows.map((s) => s.id),
  };
}
