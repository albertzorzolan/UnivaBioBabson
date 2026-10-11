// Shared helpers for the brief engine (evidence package, template brief, FHIR export, Q&A, CMS medication list).
//
// Everything here is pure and deterministic. Wording follows SPEC §3: describe what was recorded, never why.
//
// Knowledge-base access: the KB module (src/kb/index.ts) is written by another agent. It is bound through Vite's
// import.meta.glob so this engine builds and tests whether or not that file exists yet; when it exists the glob is
// an ordinary static import. Every public function also accepts an injected `kb` (tests use a fake).

import type {
  CheckIn,
  ConceptId,
  ConditionTag,
  DiaryAnswers,
  FindingCategory,
  ISODate,
  Medication,
  MetricKey,
  PatientProfile,
  ReviewDecision,
  ReviewStatus,
} from "../../model/types";
import { formatShort, parseDate } from "../../model/dates";
import { medName } from "../timeline/text";

export const PRODUCT_NAME = "Kinwise";

// ---------------------------------------------------------------------------
// Knowledge-base adapter

/** The few KB facts the brief engine needs. */
export interface BriefKb {
  /** KB version string, or null when no KB is bound. */
  version: string | null;
  /** RxNorm ingredient RxCUI for a KB ingredient id, when verified in the KB. */
  rxcui(ingredientId: string): string | null;
  /** Display name for a KB ingredient id ("Diphenhydramine"). */
  drugDisplay(ingredientId: string): string | null;
  /** Source register entry. */
  source(id: string): { short: string; url: string | null } | null;
}

interface KbModuleShape {
  KB?: { version?: string };
  getDrug?: (id: string) => { display?: string; rxcui?: string | null } | undefined;
  getSource?: (id: string) => { short?: string; url?: string } | undefined;
}

const kbModules = import.meta.glob<KbModuleShape>("../../kb/index.ts", { eager: true });
const kbModule: KbModuleShape | undefined = Object.values(kbModules)[0];

/** Fallback short names/URLs used only when the KB module is not available (dev/test). */
function guessSource(id: string): { short: string; url: string | null } {
  const s = id.toLowerCase();
  if (s.includes("beers")) return { short: "AGS Beers Criteria 2023", url: "https://doi.org/10.1111/jgs.18372" };
  if (s.includes("acb") || s.includes("anticholinergic") || s.includes("boustani")) return { short: "ACB scale", url: null };
  if (s.includes("stoppfall")) return { short: "STOPPFall", url: null };
  if (s.includes("steadi")) return { short: "CDC STEADI", url: null };
  if (s.includes("cascade")) return { short: "Prescribing cascade literature", url: null };
  return { short: id, url: null };
}

/** The KB bound at build time (src/kb/index.ts), or a fallback that knows nothing (but never throws). */
export const DEFAULT_KB: BriefKb = {
  version: kbModule?.KB?.version ?? null,
  rxcui(id) {
    const r = kbModule?.getDrug?.(id)?.rxcui;
    return typeof r === "string" && /^\d+$/.test(r) ? r : null;
  },
  drugDisplay(id) {
    const d = kbModule?.getDrug?.(id)?.display;
    return typeof d === "string" && d.trim() ? d : null;
  },
  source(id) {
    const s = kbModule?.getSource?.(id);
    if (s && typeof s.short === "string" && s.short.trim()) {
      return { short: s.short, url: typeof s.url === "string" && /^https?:\/\//.test(s.url) ? s.url : null };
    }
    return guessSource(id);
  },
};

/** Whether src/kb/index.ts was found at build time (shown in diagnostics). */
export const KB_BOUND = Boolean(kbModule?.getDrug);

/** Short citation names for a finding's sources, de-duplicated, in order ("AGS Beers Criteria 2023"). */
export function sourceShorts(sourceIds: string[], kb: BriefKb): string[] {
  const out: string[] = [];
  for (const id of sourceIds) {
    const short = (kb.source(id) ?? guessSource(id)).short;
    if (!out.includes(short)) out.push(short);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text hygiene

/** Single line: control characters, bidi overrides and whitespace runs collapse to one space. */
export function oneLine(text: string): string {
  // eslint-disable-next-line no-control-regex
  return (text ?? "").replace(/[\s\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]+/g, " ").trim();
}

/** Text safe to place inside double quotes: one line, inner double quotes become single quotes. */
export function quotable(text: string): string {
  return oneLine(text).replace(/["“”]/g, "'");
}

/** At most `max` characters, cut at a word boundary with an ellipsis. */
export function excerpt(text: string, max: number): string {
  const t = quotable(text);
  const chars = Array.from(t);
  if (chars.length <= max) return t;
  const cut = chars.slice(0, max - 1).join("");
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.—-]+$/, "")}…`;
}

/** Ensure a sentence ends with terminal punctuation. */
export function sentence(text: string): string {
  const t = oneLine(text);
  if (!t) return t;
  return /[.!?…]["')]*$/.test(t) ? t : `${t}.`;
}

/** First sentence of a paragraph (for "one-line" summaries). */
export function firstSentence(text: string): string {
  const t = oneLine(text);
  const m = /^(.+?[.!?])(?:\s+(?=[A-Z0-9"'(])|$)/.exec(t);
  return m ? m[1] : sentence(t);
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "a, b and c" */
export function joinAnd(parts: string[], conj = "and"): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${conj} ${parts[parts.length - 1]}`;
}

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return n === 1 ? one : many;
}

// ---------------------------------------------------------------------------
// Dates

/** "Sep 24", or "Sep 5, 2025" when the year differs from `refDate`'s year. */
export function dateWords(date: ISODate, refDate: ISODate): string {
  const y = date.slice(0, 4);
  return y === refDate.slice(0, 4) ? formatShort(date) : `${formatShort(date)}, ${y}`;
}

/** "Sep 26, Sep 29" / "Sep 1, Sep 2, Sep 3, Sep 4, Sep 5 and 3 more days" (dates sorted by caller). */
export function dateListWords(dates: ISODate[], refDate: ISODate, max = 6): string {
  if (dates.length <= max) return dates.map((d) => dateWords(d, refDate)).join(", ");
  const shown = dates.slice(0, max - 1).map((d) => dateWords(d, refDate)).join(", ");
  return `${shown} and ${dates.length - (max - 1)} more days`;
}

/** Calendar month name for an ISO date ("September"). */
export function monthName(date: ISODate): string {
  return parseDate(date).toLocaleDateString("en-US", { month: "long" });
}

// ---------------------------------------------------------------------------
// People

export interface Pronouns {
  subject: string; // she / he / they
  object: string; // her / him / them
  possessive: string; // her / his / their
}

export function pronounsFor(profile: PatientProfile): Pronouns {
  if (profile.sex === "female") return { subject: "she", object: "her", possessive: "her" };
  if (profile.sex === "male") return { subject: "he", object: "him", possessive: "his" };
  return { subject: "they", object: "them", possessive: "their" };
}

/** "Alex (daughter)" */
export function caregiverLabel(profile: PatientProfile): string {
  const name = oneLine(profile.caregiverName) || "The caregiver";
  const rel = oneLine(profile.caregiverRelation);
  return rel ? `${name} (${rel})` : name;
}

export function patientFirstName(profile: PatientProfile): string {
  return oneLine(profile.preferredName) || oneLine(profile.displayName).split(" ")[0] || "The patient";
}

// ---------------------------------------------------------------------------
// Medications

export { medName };

/** Active on `date`: no end date, or the end date is on/after `date` (SPEC §6.2). */
export function isActiveOn(med: Medication, date: ISODate): boolean {
  return med.startDate <= date && (!med.endDate || med.endDate >= date);
}

/** Ingredient names the entered name does not already show ("acetaminophen + diphenhydramine" for Tylenol PM). */
export function hiddenIngredients(med: Medication, kb: BriefKb): string[] {
  const name = med.name.toLowerCase();
  const ids = med.ingredientIds ?? [];
  if (ids.length === 0) return [];
  const missing = ids.filter((id) => !name.includes(id.toLowerCase()));
  if (missing.length === 0) return [];
  // For combination products show every ingredient so the pairing reads correctly.
  return (ids.length > 1 ? ids : missing).map((id) => (kb.drugDisplay(id) ?? id).toLowerCase());
}

/** "Tylenol PM (OTC) (acetaminophen + diphenhydramine)" — name as entered plus ingredients it hides. */
export function medNameWithIngredients(med: Medication, kb: BriefKb): string {
  const hidden = hiddenIngredients(med, kb);
  return hidden.length ? `${medName(med)} (${hidden.join(" + ")})` : medName(med);
}

/** "0.5 mg at bedtime", "2 caplets at bedtime as needed" */
export function howTaken(med: Medication): string {
  const dose = oneLine(med.dose);
  const freq = oneLine(med.frequency);
  let out = [dose, freq].filter(Boolean).join(" ");
  if (med.asNeeded && !/as needed|prn/i.test(out)) out = out ? `${out} as needed` : "as needed";
  return out;
}

/** True when the prescriber field says the family chose it themselves (OTC, self). */
export function isSelfSelected(med: Medication): boolean {
  return /^\s*(self|none|n\/?a|otc|over the counter|own choice)\b/i.test(med.prescriber ?? "") || (!oneLine(med.prescriber) && med.otc);
}

// ---------------------------------------------------------------------------
// Diary vocabulary

export const BOOLEAN_FIELDS = ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"] as const;
export type BooleanField = (typeof BOOLEAN_FIELDS)[number];

/** Short nouns for diary items in entry summaries. */
export const FIELD_NOUN: Record<BooleanField, string> = {
  dizziness: "dizziness",
  drowsiness: "daytime drowsiness",
  confusion: "confusion or memory fog",
  fall: "a fall",
  nearFall: "a near-fall",
  swelling: "ankle swelling",
};

/** Nouns used after "no …" in a negative list. */
export const FIELD_NEG_NOUN: Record<BooleanField, string> = {
  dizziness: "dizziness",
  drowsiness: "drowsiness",
  confusion: "confusion",
  fall: "fall",
  nearFall: "near-fall",
  swelling: "ankle swelling",
};

export const SEVERITY_WORD: Record<1 | 2 | 3, string> = { 1: "mild", 2: "moderate", 3: "severe" };

export const APPETITE_WORDS: Record<NonNullable<DiaryAnswers["appetite"]>, string> = {
  worse: "less than usual",
  same: "as usual",
  better: "more than usual",
};

export const CONCEPT_LABEL: Record<ConceptId, string> = {
  nausea: "nausea",
  constipation: "constipation",
  dry_mouth: "dry mouth",
  headache: "headache",
  cough: "cough",
  blurred_vision: "blurred vision",
  urinary_problem: "bladder or urinary trouble",
  low_mood: "low mood",
  anxiety: "anxiety or nerves",
  pain: "pain",
  shortness_of_breath: "shortness of breath",
  tremor: "tremor",
  rash: "rash",
  diarrhea: "diarrhea",
  palpitations: "palpitations",
  bleeding_or_bruising: "bleeding or bruising",
  black_stools: "black stools",
  shakiness_or_sweating: "shakiness or sweating",
};

/** Lower-case metric phrase for sentences ("dizziness", "near-falls", "energy ratings"). */
export const METRIC_PHRASE: Record<MetricKey, string> = {
  dizziness: "dizziness",
  drowsiness: "daytime drowsiness",
  confusion: "confusion or memory fog",
  fall: "falls",
  nearFall: "near-falls",
  swelling: "ankle swelling",
  appetiteWorse: "a poor appetite",
  energy: "energy ratings",
  sleep: "sleep quality ratings",
};

export const CONDITION_LABEL: Record<ConditionTag, string> = {
  history_of_falls: "history of falls",
  dementia_or_cognitive_impairment: "dementia or memory problems",
  delirium_history: "past delirium",
  heart_failure: "heart failure",
  chronic_kidney_disease: "chronic kidney disease",
  parkinson_disease: "Parkinson's disease",
  gi_bleeding_or_ulcer_history: "past stomach bleeding or ulcer",
  hypertension: "high blood pressure",
  type2_diabetes: "type 2 diabetes",
  atrial_fibrillation: "atrial fibrillation",
  urinary_incontinence: "bladder leakage (urinary incontinence)",
  benign_prostatic_hyperplasia: "enlarged prostate",
  insomnia: "insomnia",
  depression: "depression",
  anxiety: "anxiety",
  osteoarthritis: "osteoarthritis",
  osteoporosis: "osteoporosis",
  seizure_disorder: "seizure disorder",
};

// ---------------------------------------------------------------------------
// Findings

/** SPEC §6.2 category order (used for ranking review prompts). */
export const CATEGORY_ORDER: readonly FindingCategory[] = [
  "beers_avoid",
  "beers_caution",
  "beers_condition",
  "beers_interaction",
  "beers_renal",
  "anticholinergic_burden",
  "fall_risk",
  "prescribing_cascade",
  "duplicate_class",
  "cns_active_combo",
  "monitoring",
];

/** Plain labels (kept local so this engine does not depend on the review module's load order). */
export const CATEGORY_TEXT: Record<FindingCategory, string> = {
  beers_avoid: "AGS Beers Criteria: medicine older adults should generally avoid",
  beers_caution: "AGS Beers Criteria: use with caution",
  beers_condition: "AGS Beers Criteria: medicine and health condition",
  beers_interaction: "AGS Beers Criteria: medicine combination",
  beers_renal: "AGS Beers Criteria: kidney function",
  anticholinergic_burden: "Anticholinergic burden",
  fall_risk: "Fall-risk-increasing medicines",
  prescribing_cascade: "Possible prescribing cascade",
  duplicate_class: "Two medicines from the same group",
  cns_active_combo: "Several medicines acting on the brain",
  monitoring: "What to watch for",
};

export const BEERS_CATEGORIES: ReadonlySet<FindingCategory> = new Set([
  "beers_avoid",
  "beers_caution",
  "beers_condition",
  "beers_interaction",
  "beers_renal",
]);

export function decisionFor(decisions: ReviewDecision[], key: string): ReviewStatus | null {
  let found: ReviewDecision | null = null;
  for (const d of decisions ?? []) {
    if (d.findingKey !== key) continue;
    if (!found || (d.updatedAt ?? "") >= (found.updatedAt ?? "")) found = d;
  }
  return found?.status ?? null;
}

// ---------------------------------------------------------------------------
// Check-ins

/** Answers of one check-in in words, e.g. "energy 2 out of 5, sleep 3 out of 5, appetite less than usual; recorded: …". */
export function answersInWords(c: CheckIn): string {
  const a = c.answers;
  const parts: string[] = [];
  const scales: string[] = [];
  if (a.energy !== null) scales.push(`energy ${a.energy} out of 5`);
  if (a.sleep !== null) scales.push(`sleep ${a.sleep} out of 5`);
  if (a.appetite !== null) scales.push(`appetite ${APPETITE_WORDS[a.appetite]}`);
  if (scales.length) parts.push(scales.join(", "));
  const yes: string[] = [];
  const no: string[] = [];
  const unanswered: string[] = [];
  for (const f of BOOLEAN_FIELDS) {
    const v = a[f];
    if (v === true) {
      const sev = f === "dizziness" && a.dizzinessSeverity ? ` (${SEVERITY_WORD[a.dizzinessSeverity]})` : "";
      yes.push(`${FIELD_NOUN[f]}${sev}`);
    } else if (v === false) no.push(FIELD_NEG_NOUN[f]);
    else unanswered.push(FIELD_NEG_NOUN[f]);
  }
  if (a.energy === null) unanswered.unshift("energy");
  if (a.sleep === null) unanswered.unshift("sleep");
  if (a.appetite === null) unanswered.push("appetite");
  if (yes.length) parts.push(`recorded ${joinAnd(yes)}`);
  if (no.length) parts.push(`no ${joinAnd(no, "or")}`);
  if (unanswered.length) parts.push(`not answered: ${unanswered.join(", ")}`);
  return parts.join("; ");
}
