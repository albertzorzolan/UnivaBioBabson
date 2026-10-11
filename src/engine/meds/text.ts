// Wording helpers for code-rendered finding text (SPEC §3 language rules).
//
// Every sentence a finding carries is built here or filled from KB text. Rules the helpers enforce:
//  - medicines are named as the family entered them (medName, shared with the timeline engine);
//  - dates are formatted ("Jul 7"), placeholders in KB text are filled, never left as "{med}";
//  - plain/clinician text is capped at two sentences;
//  - a last-resort scrub (guardLanguage) rewrites any banned word that slipped in from KB text.

import type { ConditionTag, ISODate, Medication, MetricKey } from "../../model/types";
import { formatShort } from "../../model/dates";
import { medName } from "../timeline/text";

export { medName };

/** "A", "A and B", "A, B and C". */
export function listJoin(items: readonly string[], conj = "and"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

export function medNames(meds: readonly Medication[]): string {
  return listJoin(meds.map((m) => medName(m)));
}

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The person's name for sentences ("Margaret"), with a neutral fallback. */
export function personName(preferred: string | undefined | null): string {
  const clean = (preferred ?? "").replace(/[\s\u0000-\u001f]+/g, " ").trim();
  return clean || "this person";
}

export function possessive(name: string): string {
  return name === "this person" ? "this person's" : `${name}'s`;
}

/**
 * Fill {placeholders} in KB text. Unknown placeholders are replaced by `fallback[key]` when given, else the
 * whole placeholder is removed together with a dangling space, so text never shows raw braces.
 */
export function fill(template: string | null | undefined, vars: Record<string, string | undefined>): string {
  if (!template) return "";
  const out = template.replace(/\{\s*([a-zA-Z_][\w]*)\s*\}/g, (_m, key: string) => {
    const v = vars[key] ?? vars[key.toLowerCase()];
    return v === undefined ? "" : v;
  });
  return tidy(out);
}

/** Collapse whitespace, remove spaces before punctuation and doubled punctuation left by empty placeholders. */
export function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/([.!?])\s*\./g, "$1")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** Split into sentences (keeps the terminal punctuation). Abbreviations like "e.g." and "Dr." are protected. */
export function sentences(text: string): string[] {
  const protectedText = text
    .replace(/\b(e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|approx|No)\./g, (m) => m.replace(/\./g, "\u0000"))
    .replace(/(\d)\.(\d)/g, "$1\u0000$2");
  const parts = protectedText.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [];
  return parts.map((p) => p.replace(/\u0000/g, ".").trim()).filter((p) => p.length > 0);
}

/** Keep at most `n` sentences. */
export function firstSentences(text: string, n: number): string {
  return sentences(text).slice(0, n).join(" ");
}

/** Ensure the text ends with sentence punctuation. */
export function period(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]["')\]]*$/.test(t) ? t : `${t}.`;
}

export function shortDate(d: ISODate): string {
  return formatShort(d);
}

/** Plain-language phrase for a condition, used after "in people with …". */
export const CONDITION_PHRASE: Record<ConditionTag, string> = {
  history_of_falls: "a history of falls",
  dementia_or_cognitive_impairment: "dementia or memory problems",
  delirium_history: "delirium (sudden confusion) or a high chance of it",
  heart_failure: "heart failure",
  chronic_kidney_disease: "chronic kidney disease",
  parkinson_disease: "Parkinson disease",
  gi_bleeding_or_ulcer_history: "a history of stomach or duodenal ulcers",
  hypertension: "high blood pressure",
  type2_diabetes: "type 2 diabetes",
  atrial_fibrillation: "atrial fibrillation",
  urinary_incontinence: "urinary incontinence (bladder leakage)",
  benign_prostatic_hyperplasia: "an enlarged prostate (BPH) or urinary symptoms",
  insomnia: "insomnia",
  depression: "depression",
  anxiety: "anxiety",
  osteoarthritis: "osteoarthritis",
  osteoporosis: "osteoporosis",
  seizure_disorder: "a seizure disorder",
};

/** Lower-case noun for a diary metric when it is named as a recorded symptom ("dizziness", "low energy"). */
export const METRIC_NOUN: Record<MetricKey, string> = {
  dizziness: "dizziness",
  drowsiness: "daytime drowsiness",
  confusion: "confusion or memory fog",
  fall: "falls",
  nearFall: "near-falls",
  swelling: "ankle swelling",
  energy: "low energy",
  sleep: "poor sleep",
  appetiteWorse: "poor appetite",
};

/** Display order for metrics (matches the timeline engine's METRICS order). */
export const METRIC_ORDER: readonly MetricKey[] = [
  "dizziness",
  "drowsiness",
  "confusion",
  "fall",
  "nearFall",
  "swelling",
  "energy",
  "sleep",
  "appetiteWorse",
];

// ---------------------------------------------------------------------------------------------
// Language guard

/**
 * Words the review must never use (SPEC §3 + fact-checker guidance). The required notice
 * "No flag does not mean a medicine is safe." is the single allowed use of "safe" and is exempted by callers.
 */
export const BANNED_REVIEW_WORDS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bcaused\b/i, label: "caused" },
  { pattern: /\bcausing\b/i, label: "causing" },
  { pattern: /\bcauses\b/i, label: "causes" },
  { pattern: /\bsafe(ly|ty|r|st)?\b/i, label: "safe" },
  { pattern: /\bshould stop\b/i, label: "should stop" },
  { pattern: /\bstop taking\b/i, label: "stop taking" },
  { pattern: /\burgent(ly)?\b/i, label: "urgent" },
  { pattern: /\bdangerous\b/i, label: "dangerous" },
  { pattern: /\bdiagnos(is|e|ed)\b/i, label: "diagnosis" },
  { pattern: /\brisk score\b/i, label: "risk score" },
  { pattern: /\bside effect of (her|his|their|your|margaret)/i, label: "side effect of <patient's drug>" },
];

export const REQUIRED_NOTICE =
  "This review checks published criteria only (AGS Beers 2023, ACB scale, fall-risk medicines, known prescribing cascades). It does not check doses, allergies, or every interaction. No flag does not mean a medicine is safe.";

const NOTICE_EXEMPT = "No flag does not mean a medicine is safe";

export function bannedWordsIn(text: string): string[] {
  const scrubbed = text.split(NOTICE_EXEMPT).join("");
  return BANNED_REVIEW_WORDS.filter((b) => b.pattern.test(scrubbed)).map((b) => b.label);
}

/**
 * Last-resort rewrite of KB-sourced wording that would break the language rules. KB text is reviewed, so this
 * should rarely change anything; it exists so a KB edit can never put a banned word in front of a family.
 */
export function guardLanguage(text: string): string {
  let t = text;
  t = t.replace(/\bis causing\b/gi, "may be contributing to");
  t = t.replace(/\bcaused by\b/gi, "linked to");
  t = t.replace(/\bcaused\b/gi, "been linked to");
  t = t.replace(/\bcausing\b/gi, "contributing to");
  t = t.replace(/\bcan causes\b/gi, "can lead to");
  t = t.replace(/\bcauses\b/gi, "can lead to");
  t = t.replace(/\bsafer\b/gi, "lower-risk");
  t = t.replace(/\bsafest\b/gi, "lowest-risk");
  t = t.replace(/\bsafely\b/gi, "carefully");
  t = t.replace(/\bsafety\b/gi, "risk");
  t = t.replace(/\bsafe\b/gi, "suitable");
  t = t.replace(/\byou should stop\b/gi, "you could ask about stopping");
  t = t.replace(/\bshould stop\b/gi, "could ask about stopping");
  t = t.replace(/\bstop taking\b/gi, "ask about stopping");
  t = t.replace(/\burgently\b/gi, "promptly");
  t = t.replace(/\burgent\b/gi, "prompt");
  t = t.replace(/\bdangerous\b/gi, "risky");
  t = t.replace(/\bdiagnosis\b/gi, "condition");
  t = t.replace(/\brisk score\b/gi, "score");
  return t;
}
