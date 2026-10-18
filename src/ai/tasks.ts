// AI tasks (SPEC §7, §10). Each task = prompt (prompts.ts) + grammar (schemas.ts) + host-side
// verification (engine/brief/verify.ts, guard.ts, ConText) + a deterministic fallback in the UI.
//
// Division of labour: the deterministic engines compute every fact; the model only *writes* — it
// combines facts into readable sentences, drafts specific clinician questions, answers record
// questions, explains findings in plain words and spots diary answers the rules missed. Every model
// sentence is checked by code and dropped if it fails; nothing reaches a brief without human review.
//
// Contract: each task returns null when no model is loaded (the UI then uses its template/rule-based
// path) and throws when the model ran but its output did not survive verification.

import type {
  BriefContent,
  BriefSentence,
  DiaryAnswers,
  DiaryField,
  EvidenceItem,
  EvidencePackage,
  Extraction,
  Finding,
  GenerationInfo,
  ISODate,
  Medication,
  Proposal,
} from "../model/types";
import {
  detectDrugNames,
  extractNumericFacts,
  formatIssues,
  metricsIn,
  splitSentences,
  verifyClaims,
  verifySentence,
  type VerifyOptions,
} from "../engine/brief/verify";
import { analyzeContext as defaultAnalyzeContext, KB_DRUG_NAMES, KB_VERSION, type ContextAnalyzer, type ContextResult } from "./adapters";
import { dedupeByText, locateQuote, normalizeSentence, sentenceAt } from "./guard";
import { generateJSON, isModelReady, getLLMState, type GenerateResult } from "./llm";
import {
  BRIEF_BUDGET,
  HANDLE_ECHO,
  PROMPT_VERSION,
  aliasEvidence,
  buildAnswerPrompt,
  buildExplainPrompt,
  buildNoticedPrompt,
  buildQuestionsPrompt,
  buildRefinePrompt,
  selectEvidence,
  type EvidenceBudget,
} from "./prompts";
import { answerSchema, explainSchema, noticedSchema, questionsSchema, refineSchema } from "./schemas";

export { PROMPT_VERSION };

/** Thrown when the model answered but too little of its output passed verification. */
export class AIValidationError extends Error {
  readonly dropped: DroppedSentence[];
  readonly raw: string;
  constructor(message: string, dropped: DroppedSentence[], raw: string) {
    super(message);
    this.name = "AIValidationError";
    this.dropped = dropped;
    this.raw = raw;
  }
}

export interface DroppedSentence {
  section: string;
  text: string;
  issues: string[];
}

/** A host-side edit made before verification (logged for transparency and evaluation). */
export interface HostEdit {
  section: string;
  kind: "softened" | "citation_added" | "split";
  before: string;
  after: string;
}

/** Diagnostic detail for the developer harness and evaluation logs (never shown to families). */
export interface TaskReport {
  raw: string;
  model: string;
  ms: number;
  promptTokens: number | null;
  completionTokens: number | null;
  salvaged: boolean;
  dropped: DroppedSentence[];
  evidenceShown: string[];
  /** Softened wording and completed citations (see softenQuestion / completeCitations). */
  edits: HostEdit[];
  /** WebLLM throughput for the request (tokens/s, time to first token). */
  perf: GenerateResult<unknown>["perf"];
}

export interface AiOptions {
  /** Names on the medication list (as entered). Defaults to names found in the evidence. */
  medNames?: string[];
  /** The person's names ("Margaret", "Mom") for patient-scoped language rules. */
  patientNames?: string[];
  timeoutMs?: number;
}

function report(r: GenerateResult<unknown>, dropped: DroppedSentence[], shown: EvidenceItem[], edits: HostEdit[] = []): TaskReport {
  return {
    edits,
    perf: r.perf,
    raw: r.raw,
    model: r.model,
    ms: r.ms,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    salvaged: r.salvaged,
    dropped,
    evidenceShown: shown.map((i) => i.id),
  };
}

function verifyOpts(opts: AiOptions): VerifyOptions {
  return { medNames: opts.medNames, patientNames: opts.patientNames, knownDrugNames: KB_DRUG_NAMES };
}

/** Coerce one model item into a BriefSentence (or null if malformed). */
function asSentence(x: unknown): BriefSentence | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { text?: unknown; evidenceIds?: unknown };
  if (typeof o.text !== "string") return null;
  const ids = Array.isArray(o.evidenceIds) ? o.evidenceIds.filter((i): i is string => typeof i === "string") : [];
  return { text: normalizeSentence(o.text), evidenceIds: [...new Set(ids)] };
}

/**
 * Questions only: soften the two wordings small models most often produce despite the rules, so a
 * useful question is not lost for one word. Each rewrite only weakens the claim ("be causing" →
 * "be contributing to"; "a safer alternative" → "an alternative") and the result is still verified.
 * Statements are never rewritten.
 */
const SOFTENINGS: [RegExp, string][] = [
  [/\b(be|is|are)\s+causing\b/gi, "$1 contributing to"],
  [/\ba safer (alternative|option)\b/gi, "an $1"],
  [/\bsafer (alternatives|options)\b/gi, "$1"],
  [/\b(alternative|option)s? that (?:is|are|would be) safer\b/gi, "$1"],
];
export function softenQuestion(text: string): string {
  let t = text;
  for (const [re, to] of SOFTENINGS) t = t.replace(re, to);
  return t;
}

/**
 * Citation completion. When a sentence restates a date or number that is missing from the items it
 * cited, the host looks for the *shown* item it came from and adds it (at most two):
 *   - a medicine, signal or fact item about a medicine the sentence names, or
 *   - a diary entry, concern or note that contains the missing date AND the same symptom
 *     ("near-fall recorded on Oct 6" ← "Oct 6 check-in: … near-fall yes").
 * The rule "every number appears in the cited evidence" still holds; the host has only found the
 * evidence the model forgot to cite.
 */
export function completeCitations(s: BriefSentence, pool: EvidenceItem[], vocab: string[] = KB_DRUG_NAMES): BriefSentence {
  const cited = new Set(s.evidenceIds);
  const citedText = () => pool.filter((i) => cited.has(i.id)).map((i) => i.text).join(" \n ");
  const claim = extractNumericFacts(s.text);
  const missing = () => {
    const have = extractNumericFacts(citedText());
    return {
      dates: claim.dates.filter((d) => !have.dates.includes(d)),
      numbers: claim.numbers.filter((n) => !have.numbers.includes(n)),
    };
  };
  let gap = missing();
  if (!gap.dates.length && !gap.numbers.length) return s;
  const drugs = detectDrugNames(s.text, vocab);
  const symptoms = metricsIn(s.text);
  const order: EvidenceItem["kind"][] = ["med", "signal", "fact", "entry", "concern", "note"];
  const candidates = pool
    .filter((i) => {
      if (cited.has(i.id)) return false;
      if (i.kind === "med" || i.kind === "signal" || i.kind === "fact") return drugs.some((d) => i.text.toLowerCase().includes(d));
      // Family-written items only supply dates, and only for the same symptom.
      const f = extractNumericFacts(i.text);
      return gap.dates.some((d) => f.dates.includes(d)) && metricsIn(i.text).some((m) => symptoms.includes(m));
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  if (!candidates.length) return s;
  let added = 0;
  for (const c of candidates) {
    if (added >= 2 || (!gap.dates.length && !gap.numbers.length)) break;
    const f = extractNumericFacts(c.text);
    if (gap.dates.some((d) => f.dates.includes(d)) || gap.numbers.some((n) => f.numbers.includes(n))) {
      cited.add(c.id);
      added++;
      gap = missing();
    }
  }
  return added ? { ...s, evidenceIds: [...cited] } : s;
}

/**
 * Verify a list of model sentences for one section. Returns survivors (deduplicated) and dropped ones
 * with reasons. Exported for unit tests.
 */
export function verifySection(
  section: string,
  items: unknown,
  pkg: EvidencePackage,
  opts: VerifyOptions & { expect: "statement" | "question"; max: number; pool?: EvidenceItem[]; edits?: HostEdit[] },
): { kept: BriefSentence[]; dropped: DroppedSentence[] } {
  const dropped: DroppedSentence[] = [];
  const kept: BriefSentence[] = [];
  // Statement items that pack several sentences ("A. B. C.") are split into separate items with the
  // same citations, so each sentence is verified (and kept or dropped) on its own.
  const expanded: unknown[] = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const s0 = asSentence(raw);
    const parts = s0 && opts.expect === "statement" ? splitSentences(s0.text) : [];
    if (s0 && parts.length > 1) {
      opts.edits?.push({ section, kind: "split", before: s0.text, after: parts.join(" | ") });
      for (const text of parts) expanded.push({ text, evidenceIds: s0.evidenceIds });
    } else expanded.push(raw);
  }
  for (const raw of expanded) {
    let s = asSentence(raw);
    if (!s) {
      dropped.push({ section, text: JSON.stringify(raw).slice(0, 200), issues: ["malformed: not a {text, evidenceIds} object"] });
      continue;
    }
    if (opts.expect === "question") {
      const softened = softenQuestion(s.text);
      if (softened !== s.text) {
        opts.edits?.push({ section, kind: "softened", before: s.text, after: softened });
        s = { ...s, text: softened };
      }
    }
    if (opts.pool) {
      const completed = completeCitations(s, opts.pool, opts.knownDrugNames);
      if (completed.evidenceIds.length !== s.evidenceIds.length) {
        opts.edits?.push({ section, kind: "citation_added", before: s.evidenceIds.join(","), after: completed.evidenceIds.join(",") });
        s = completed;
      }
    }
    const v = verifySentence(s, pkg, opts);
    const issues = HANDLE_ECHO.test(s.text) ? [...v.issues, "id_echo: evidence handles belong in evidenceIds, not in the sentence"] : v.issues;
    // A question's evidence chips must be about what it asks: the runtime audit found every AI question
    // citing the same "Before vs after · dizziness" chip, including one about Tylenol PM and drowsiness.
    if (opts.expect === "question") {
      for (const id of s.evidenceIds) {
        const item = pkg.items.find((i) => i.id === id);
        if (item && !sharesTopic(s.text, item, opts.knownDrugNames)) {
          issues.push(`evidence_topic: ${id} is about something other than what the question asks`);
        }
      }
    }
    if (issues.length === 0) kept.push(s);
    else dropped.push({ section, text: s.text, issues });
  }
  const { kept: unique, dropped: dupes } = dedupeByText(kept);
  for (const d of dupes) dropped.push({ section, text: d.text, issues: ["duplicate: repeats an earlier sentence"] });
  const overflow = unique.slice(opts.max);
  for (const o of overflow) dropped.push({ section, text: o.text, issues: [`overflow: more than ${opts.max} sentences`] });
  return { kept: unique.slice(0, opts.max), dropped };
}

/** Replace prompt handles (S1, F2, …) in every cited sentence with the real evidence ids. */
export function restoreEvidenceIds<T>(value: T, restore: (handles: string[]) => string[]): T {
  if (Array.isArray(value)) return value.map((v) => restoreEvidenceIds(v, restore)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === "evidenceIds" && Array.isArray(v) ? restore(v.filter((x): x is string => typeof x === "string")) : restoreEvidenceIds(v, restore);
    }
    return out as T;
  }
  return value;
}

// ---------------------------------------------------------------------------
// 1. Visit-brief draft

interface BriefOutput {
  reason?: unknown;
  noticed?: unknown;
  questions?: unknown;
}

/**
 * Validate a raw brief output against the package and merge it with the template. Pure (no model);
 * exported so the post-processing is unit-tested and can be replayed on logged outputs.
 */
export function assembleBrief(
  value: BriefOutput,
  pkg: EvidencePackage,
  template: BriefContent,
  opts: AiOptions & { pool?: EvidenceItem[] } = {},
): { content: BriefContent; dropped: DroppedSentence[]; edits: HostEdit[] } {
  const edits: HostEdit[] = [];
  const v = { ...verifyOpts(opts), pool: opts.pool ?? pkg.items, edits };
  const reason = verifySection("reason", value.reason, pkg, { ...v, expect: "statement", max: 1 });
  const noticed = verifySection("noticed", value.noticed, pkg, { ...v, expect: "statement", max: 4 });
  const questions = verifySection("questions", value.questions, pkg, { ...v, expect: "question", max: 5 });
  const dropped = [...reason.dropped, ...noticed.dropped, ...questions.dropped];
  if (noticed.kept.length < 2 || questions.kept.length < 2) {
    throw new AIValidationError(
      `Only ${noticed.kept.length} observation(s) and ${questions.kept.length} question(s) passed the evidence check, so the template brief is shown instead.`,
      dropped,
      JSON.stringify(value),
    );
  }
  return {
    content: {
      reason: reason.kept.length ? reason.kept : template.reason,
      noticed: noticed.kept,
      // Review prompts and limitations stay deterministic: they come straight from the engines.
      reviewPrompts: template.reviewPrompts,
      questions: questions.kept,
      limitations: template.limitations,
    },
    dropped,
    edits,
  };
}

/**
 * Draft "Why we're coming in", "What we've noticed" and "Our questions" from the evidence package, in
 * two focused generations: (1) reason + observations, verified; (2) clinician questions, which see the
 * verified observations. Throws AIValidationError (→ template brief) when fewer than 2 observations
 * or 2 questions survive verification.
 */
export async function aiDraftBrief(
  pkg: EvidencePackage,
  template: BriefContent,
  opts: AiOptions & { kbVersion?: string; budget?: EvidenceBudget } = {},
): Promise<{ content: BriefContent; info: GenerationInfo; report: TaskReport } | null> {
  if (!isModelReady()) return null;
  const shown = selectEvidence(pkg.items, opts.budget ?? BRIEF_BUDGET);
  if (!shown.length) throw new AIValidationError("There is no evidence to draft from yet.", [], "");
  const aliased = aliasEvidence(shown);
  const handles = aliased.items.map((i) => i.id);
  const hasConcern = shown.some((i) => i.kind === "concern");

  // Step 1: reason + observations.
  const r1 = await generateJSON<BriefOutput>({
    ...buildNoticedPrompt(pkg, aliased.items),
    schema: noticedSchema(handles, { allowReason: hasConcern, maxIds: 3 }),
    maxTokens: 520,
    timeoutMs: opts.timeoutMs ?? 60_000,
    label: "Drafting what we've noticed",
  });
  const step1 = restoreEvidenceIds(r1.value, aliased.restore);
  const check1 = verifySection("noticed", step1.noticed, pkg, { ...verifyOpts(opts), expect: "statement", max: 4, pool: shown });
  if (check1.kept.length < 2) {
    throw new AIValidationError(`Only ${check1.kept.length} observation(s) passed the evidence check, so the template brief is shown instead.`, check1.dropped, r1.raw);
  }

  // Step 2: questions that build on the verified observations.
  const r2 = await generateJSON<BriefOutput>({
    ...buildQuestionsPrompt(pkg, aliased.items, check1.kept.map((k) => k.text)),
    schema: questionsSchema(handles, { maxIds: 3 }),
    maxTokens: 520,
    timeoutMs: opts.timeoutMs ?? 60_000,
    label: "Drafting questions for the clinician",
  });
  const step2 = restoreEvidenceIds(r2.value, aliased.restore);
  const raw = `${r1.raw}\n---\n${r2.raw}`;
  let assembled: ReturnType<typeof assembleBrief>;
  try {
    assembled = assembleBrief({ reason: step1.reason, noticed: step1.noticed, questions: step2.questions }, pkg, template, { ...opts, pool: shown });
  } catch (err) {
    if (err instanceof AIValidationError) throw new AIValidationError(err.message, err.dropped, raw);
    throw err;
  }
  const ms = r1.ms + r2.ms;
  const sum = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
  const info: GenerationInfo = {
    mode: "ai",
    model: r2.model,
    promptVersion: PROMPT_VERSION,
    kbVersion: opts.kbVersion ?? KB_VERSION,
    durationMs: ms,
    droppedSentences: assembled.dropped.length,
    evidenceHash: pkg.hash,
    generatedAt: new Date().toISOString(),
  };
  const rep: TaskReport = {
    ...report(r2, assembled.dropped, shown, assembled.edits),
    raw,
    ms,
    promptTokens: sum(r1.promptTokens, r2.promptTokens),
    completionTokens: sum(r1.completionTokens, r2.completionTokens),
    salvaged: r1.salvaged || r2.salvaged,
  };
  return { content: assembled.content, info, report: rep };
}

// ---------------------------------------------------------------------------
// 2. Record Q&A

export const ANSWER_BUDGET: EvidenceBudget = {
  maxChars: 5200,
  order: ["signal", "fact", "finding", "med", "concern", "note", "entry"],
  caps: { signal: 6, fact: 6, finding: 6, med: 10, concern: 3, note: 4, entry: 12 },
};

interface AnswerOutput {
  answer?: unknown;
}

/**
 * Answer a question about the person's own records from deterministically retrieved items.
 * (Out-of-scope questions — diagnosis, dosing, urgency — are routed away before this is called.)
 */
export async function aiAnswer(
  question: string,
  items: EvidenceItem[],
  pkg: EvidencePackage,
  opts: AiOptions = {},
): Promise<{ sentences: BriefSentence[]; dropped: number; ms: number; status: "answered" | "not_in_records"; report: TaskReport } | null> {
  if (!isModelReady()) return null;
  if (!items.length) {
    return { sentences: [], dropped: 0, ms: 0, status: "not_in_records", report: emptyReport() };
  }
  const shown = selectEvidence(items, ANSWER_BUDGET);
  const aliased = aliasEvidence(shown);
  // Retrieved items are normally package items; merge so verification can resolve every cited id.
  const known = new Set(pkg.items.map((i) => i.id));
  const merged: EvidencePackage = { ...pkg, items: [...pkg.items, ...items.filter((i) => !known.has(i.id))] };
  const generated = await generateJSON<AnswerOutput>({
    ...buildAnswerPrompt(question, aliased.items),
    schema: answerSchema(aliased.items.map((i) => i.id)),
    maxTokens: 360,
    timeoutMs: opts.timeoutMs,
    label: "Answering from the records",
  });
  const r = { ...generated, value: restoreEvidenceIds(generated.value, aliased.restore) };
  const written = Array.isArray(r.value.answer) ? r.value.answer : [];
  if (!written.length) {
    return { sentences: [], dropped: 0, ms: r.ms, status: "not_in_records", report: report(r, [], shown) };
  }
  const edits: HostEdit[] = [];
  const { kept, dropped } = verifySection("answer", r.value.answer, merged, { ...verifyOpts(opts), expect: "statement", max: 3, pool: shown, edits });
  // An "answer" that shares no topic with the question (e.g. diary coverage for a blood-pressure
  // question) means the records do not answer it.
  if (kept.length && !kept.some((s) => isRelevant(question, s, merged))) {
    return { sentences: [], dropped: dropped.length + kept.length, ms: r.ms, status: "not_in_records", report: report(r, dropped, shown, edits) };
  }
  if (!kept.length) {
    throw new AIValidationError("The AI answer did not pass the evidence check; the records-based answer is shown instead.", dropped, r.raw);
  }
  return { sentences: kept, dropped: dropped.length, ms: r.ms, status: "answered", report: report(r, dropped, shown, edits) };
}

const QUESTION_STOP = new Set(
  "what when where which who why how has have had does did do was were is are been being the a an and or of to in on for with since from her his she he mom dad margaret my our their they them this that these those any some much many more most last week month day days today recently ever still been about there".split(" "),
);
function stems(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !QUESTION_STOP.has(w))
      .map((w) => w.slice(0, 5)),
  );
}
/**
 * Does an answer sentence (with its cited evidence) share a topic with the question? Topic = a word
 * stem of 5 letters ("dizzier" ~ "dizziness") or the same diary symptom ("wobbly" ~ "dizziness").
 */
export function isRelevant(question: string, s: BriefSentence, pkg: EvidencePackage): boolean {
  const cited = pkg.items.filter((i) => s.evidenceIds.includes(i.id)).map((i) => i.text).join(" ");
  const answer = `${s.text} ${cited}`;
  const q = stems(question);
  const a = stems(answer);
  if ([...q].some((w) => a.has(w))) return true;
  const qm = metricsIn(question);
  return qm.length > 0 && metricsIn(answer).some((m) => qm.includes(m));
}

/** Word stems too common in questions and evidence to say what either is about. */
const GENERIC_TOPIC_STEMS = new Set(
  "recor diary answe medic contr still neede revie could would shoul given after befor there which other alter optio choic best worth inclu since start check".split(" "),
);

/**
 * Is one cited evidence item about what a question asks? Medicines decide first: when both name medicines,
 * they must share one ("Tylenol PM" ≠ the lorazepam signal; "Ativan" = "Lorazepam (Ativan)"). Otherwise the
 * same diary symptom, or a shared uncommon word stem ("anticholinergic"), is enough. Two kinds of item fit
 * any question, as the app's own questions use them: a general fact with no medicine or symptom (diary
 * coverage, behind "on 26 answered days"), and any medicine item when the question asks about "these
 * medicines" without naming one. Exported for tests.
 */
export function sharesTopic(question: string, item: EvidenceItem, vocab: string[] = KB_DRUG_NAMES): boolean {
  const qDrugs = detectDrugNames(question, vocab);
  const iDrugs = new Set(detectDrugNames(item.text, vocab));
  if (item.kind === "fact" && !iDrugs.size && !metricsIn(item.text).length) return true;
  if (qDrugs.length && iDrugs.size) return qDrugs.some((d) => iDrugs.has(d));
  if (!qDrugs.length && iDrugs.size && /\b(?:medicines?|medications?|meds)\b/i.test(question)) return true;
  const qm = metricsIn(question);
  if (qm.length && metricsIn(item.text).some((m) => qm.includes(m))) return true;
  const a = stems(item.text);
  return [...stems(question)].some((w) => !GENERIC_TOPIC_STEMS.has(w) && a.has(w));
}

function emptyReport(): TaskReport {
  return { raw: "", model: getLLMState().model ?? "", ms: 0, promptTokens: null, completionTokens: null, salvaged: false, dropped: [], evidenceShown: [], edits: [], perf: null };
}

// ---------------------------------------------------------------------------
// 3. Extraction refinement

const ALL_FIELDS: DiaryField[] = ["energy", "sleep", "appetite", "dizziness", "dizzinessSeverity", "drowsiness", "confusion", "fall", "nearFall", "swelling"];
const BOOLEAN_FIELDS = new Set<DiaryField>(["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"]);

/** Wording that looks like an instruction to the software rather than a description of the day. */
const INSTRUCTION_CUE =
  /\b(?:ignore|disregard|pretend|instructions?|system prompt)\b|\b(?:mark|record|write|put|set|enter|log|say|answer)\s+(?:down\s+)?(?:that|it as|me as|as|yes|no|true|false)\b/i;
const NEAR_FALL_CUE = /\b(?:nearly|almost|near|caught (?:my|her|him)sel(?:f|ves)|lost (?:my|her|his) (?:balance|footing)|stumbl|trip(?:ped)?|wobbl|grab(?:bed)?)/i;
const OVERNIGHT_CUE = /\b(?:last night|overnight|during the night|in the night|this morning)\b/i;
const EXPLICIT_RATING = /\b([1-5])\s*(?:out of|\/|of)\s*(?:5|five)\b/i;

/**
 * Words a quote needs before it can support a field. The live run accepted dizziness = yes quoted from
 * "Slept like a log last night" and a sleep rating from "Pretty tired today, no energy at all".
 */
const DIZZY_CUE = /\bdizz|\bwoozy|\blight-?headed|\bspinning|\bunsteady|\bwobbl|\bgiddy|\bvertigo|\boff balance|\bhead (?:was )?swimming/i;
const FIELD_CUES: Record<DiaryField, RegExp> = {
  dizziness: DIZZY_CUE,
  dizzinessSeverity: DIZZY_CUE,
  drowsiness: /\bdrows|\bsleepy|\bnodd(?:ing|ed) off|\bnod off|\bdoz(?:e|ed|ing)|\bgroggy|\beyes open|\bstay awake|\bnap|\bdrift(?:ing|ed)? off/i,
  confusion: /\bconfus|\bmuddl|\bfogg?y?\b|\bmemory|\bforg[eo]t|\bmixed up|\bdisorient|\blost track|\bcouldn't find|\bcould not find/i,
  fall: /\bfell\b|\bfalls?\b|\btumble|\bon the floor|\bwent down|\bslipped/i,
  nearFall: new RegExp(`${NEAR_FALL_CUE.source}|\\bfell\\b|\\bfalls?\\b|\\bbalance`, "i"),
  swelling: /\bswell|\bswollen|\bpuffy|\bo?edema|\bankles?\b|\bshoes? (?:felt |were )?tight/i,
  energy: /\benergy|\btired|\bwiped out|\bexhaust|\bfatigue|\bworn out|\bsluggish|\bdrained|\bget up and go|\bpep\b|\blively|\bwhacked|\bknackered/i,
  sleep: /\bslept|\bsleep|\bnight|\bawake|\binsomnia|\bbed\b|\bwink|\btoss|\brestless|\bwoke|\brested/i,
  appetite: /\bappetite|\beat(?:ing|en)?\b|\bate\b|\bhungry|\bfood|\bmeals?\b|\bbreakfast|\blunch|\bdinner|\bpeckish/i,
};
const FIELD_LABELS: Record<DiaryField, string> = {
  dizziness: "dizziness",
  dizzinessSeverity: "dizziness",
  drowsiness: "drowsiness",
  confusion: "confusion",
  fall: "a fall",
  nearFall: "a near-fall",
  swelling: "swelling",
  energy: "energy",
  sleep: "sleep",
  appetite: "appetite",
};

export interface RefineRejection {
  field: string;
  quote: string;
  reason: string;
}

interface RefineOutput {
  proposals?: unknown;
}

const TEMPORAL_RANK: Record<ContextResult["temporality"], number> = { current: 0, historical: 1, hypothetical: 2 };

/**
 * Model quotes are phrases ("My granddaughter fell off her bike", "No dizziness today"), not single
 * concept words, so ConText triggers can sit inside the quote itself. Analyse both the whole quote and
 * its last word as the target and combine conservatively (any "other", the least-current time).
 */
function contextOfQuote(analyze: ContextAnalyzer, sentence: string, start: number, end: number): ContextResult {
  const whole = analyze(sentence, { start, end });
  const last = /\S+\s*$/.exec(sentence.slice(start, end));
  const tailStart = last ? start + last.index : Math.max(start, end - 1);
  const tail = analyze(sentence, { start: tailStart, end });
  return {
    negated: whole.negated || tail.negated,
    temporality: TEMPORAL_RANK[whole.temporality] >= TEMPORAL_RANK[tail.temporality] ? whole.temporality : tail.temporality,
    experiencer: whole.experiencer === "other" || tail.experiencer === "other" ? "other" : "patient",
    triggers: [...whole.triggers, ...tail.triggers],
  };
}

/** Fields the model may still propose given the rule-based extraction. */
export function openFieldsFor(base: Extraction): DiaryField[] {
  const proposed = new Set(base.proposals.map((p) => p.field));
  const dizzy = base.proposals.find((p) => p.field === "dizziness");
  return ALL_FIELDS.filter((f) => {
    if (proposed.has(f)) return false;
    // Severity only makes sense once dizziness is present (it may be proposed in the same batch).
    if (f === "dizzinessSeverity") return !dizzy || dizzy.value === true;
    return true;
  });
}

function validValue(field: DiaryField, value: unknown): value is DiaryAnswers[DiaryField] {
  if (BOOLEAN_FIELDS.has(field)) return typeof value === "boolean";
  if (field === "energy" || field === "sleep") return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
  if (field === "dizzinessSeverity") return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3;
  if (field === "appetite") return value === "better" || value === "same" || value === "worse";
  return false;
}

/**
 * Check raw model proposals against the story. Pure; exported for tests. Every accepted proposal
 * cites an exact span of the story and passes a ConText check (negation, time, who it happened to).
 */
export function checkRefinements(
  story: string,
  base: Extraction,
  rawProposals: unknown,
  analyze: ContextAnalyzer = defaultAnalyzeContext,
): { added: Proposal[]; rejections: RefineRejection[] } {
  const open = new Set(openFieldsFor(base));
  const added: Proposal[] = [];
  const rejections: RefineRejection[] = [];
  const reject = (field: string, quote: string, reason: string) => rejections.push({ field, quote, reason });
  const baseDizzy = base.proposals.find((p) => p.field === "dizziness")?.value === true;

  for (const p of Array.isArray(rawProposals) ? rawProposals : []) {
    const o = (p ?? {}) as { field?: unknown; value?: unknown; quote?: unknown };
    const field = String(o.field ?? "") as DiaryField;
    const quote = typeof o.quote === "string" ? o.quote : "";
    if (!open.has(field)) {
      reject(field, quote, "field was already answered or is not a diary field");
      continue;
    }
    if (added.some((a) => a.field === field)) {
      reject(field, quote, "duplicate proposal for this field");
      continue;
    }
    if (!validValue(field, o.value)) {
      reject(field, quote, "value is not valid for this field");
      continue;
    }
    const span = locateQuote(story, quote);
    if (!span) {
      reject(field, quote, "quoted words were not found in the story");
      continue;
    }
    const sentence = sentenceAt(story, span);
    if (INSTRUCTION_CUE.test(sentence.text)) {
      reject(field, span.quote, "the sentence reads like an instruction, not a description of the day");
      continue;
    }
    const ctx = contextOfQuote(analyze, sentence.text, span.start - sentence.start, span.end - sentence.start);
    if (ctx.experiencer === "other") {
      reject(field, span.quote, "this describes someone else");
      continue;
    }
    const overnight = field === "sleep" && OVERNIGHT_CUE.test(sentence.text);
    if (ctx.temporality === "hypothetical" || (ctx.temporality === "historical" && !overnight)) {
      reject(field, span.quote, `this is ${ctx.temporality}, not about today`);
      continue;
    }
    const value = o.value as DiaryAnswers[DiaryField];
    let certainty: Proposal["certainty"] = "inferred";
    if (BOOLEAN_FIELDS.has(field)) {
      if (value === true && ctx.negated) {
        reject(field, span.quote, "the wording is negated (e.g. 'no …')");
        continue;
      }
      if (value === false && !ctx.negated) {
        reject(field, span.quote, "an absence needs explicit wording such as 'no dizziness'");
        continue;
      }
      if (field === "fall" && value === true && NEAR_FALL_CUE.test(span.quote)) {
        reject(field, span.quote, "this describes a near-fall, not a fall");
        continue;
      }
      if (field === "nearFall" && value === false && !NEAR_FALL_CUE.test(span.quote) && !/\bnear|almost|balance/i.test(span.quote)) {
        reject(field, span.quote, "'didn't fall' does not rule out a near-fall");
        continue;
      }
      if (value === false) certainty = "explicit";
    } else if (field === "energy" || field === "sleep") {
      const m = EXPLICIT_RATING.exec(span.quote);
      if (m) {
        if (Number(m[1]) !== value) {
          reject(field, span.quote, `the quote says ${m[1]} out of 5, not ${String(value)}`);
          continue;
        }
        certainty = "explicit";
      }
    } else if (field === "dizzinessSeverity") {
      const dizzyNow = baseDizzy || added.some((a) => a.field === "dizziness" && a.value === true);
      if (!dizzyNow) {
        reject(field, span.quote, "severity needs dizziness to be present");
        continue;
      }
    }
    // Last, so the more specific reasons above are reported first.
    if (!FIELD_CUES[field].test(span.quote)) {
      reject(field, span.quote, `the quoted words do not mention ${FIELD_LABELS[field]}`);
      continue;
    }
    added.push({
      field,
      value,
      certainty,
      spans: [span],
      reason: `From "${span.quote}" (on-device AI suggestion)`,
      origin: "llm",
    });
  }
  return { added, rejections };
}

/**
 * Ask the model for diary answers the rule-based extractor missed. Proposals for already-answered
 * fields are ignored; each new one needs an exact quote that passes the ConText re-check. The person
 * still confirms every proposal before it is saved.
 */
export async function aiRefineExtraction(
  story: string,
  base: Extraction,
  ctx: { meds: Medication[]; today: ISODate; analyze?: ContextAnalyzer; timeoutMs?: number },
): Promise<{ added: Proposal[]; rejected: number; ms: number; rejections: RefineRejection[]; report: TaskReport } | null> {
  if (!isModelReady()) return null;
  const open = openFieldsFor(base);
  if (!open.length || story.trim().length < 8) {
    return { added: [], rejected: 0, ms: 0, rejections: [], report: emptyReport() };
  }
  const r = await generateJSON<RefineOutput>({
    ...buildRefinePrompt(story, base, open),
    schema: refineSchema(open),
    maxTokens: 360,
    timeoutMs: ctx.timeoutMs ?? 45_000,
    label: "Reading the check-in",
  });
  const { added, rejections } = checkRefinements(story, base, r.value.proposals, ctx.analyze);
  const dropped = rejections.map((x) => ({ section: x.field, text: x.quote, issues: [x.reason] }));
  return { added, rejected: rejections.length, ms: r.ms, rejections, report: report(r, dropped, []) };
}

// ---------------------------------------------------------------------------
// 4. Finding explanation

interface ExplainOutput {
  sentences?: unknown;
}

/**
 * Verify explanation sentences against the finding + KB text only. Pure; exported for tests.
 * `patientNames` turns on the patient-scoped rules for "Margaret"; without them the medicine-scoped rule
 * still bans "can cause" in any sentence that names a medicine (the live run's escape).
 */
export function checkExplanation(
  f: Finding,
  rawSentences: unknown,
  opts: { kbText?: string[]; medNames?: string[]; patientNames?: string[] } = {},
): { kept: string[]; dropped: DroppedSentence[] } {
  const support = [f.title, f.plain, f.clinician, f.question, f.evidenceGrade ?? "", ...(opts.kbText ?? [])].filter(Boolean);
  const kept: string[] = [];
  const dropped: DroppedSentence[] = [];
  for (const raw of Array.isArray(rawSentences) ? rawSentences : []) {
    const text = normalizeSentence(typeof raw === "string" ? raw : String((raw as { text?: unknown })?.text ?? ""));
    const issues = verifyClaims(text, support, {
      medNames: opts.medNames,
      patientNames: opts.patientNames,
      knownDrugNames: KB_DRUG_NAMES,
      expect: "statement",
      maxLength: 260,
    });
    if (issues.length) dropped.push({ section: "explanation", text, issues: formatIssues(issues) });
    else if (kept.some((k) => k.toLowerCase() === text.toLowerCase())) dropped.push({ section: "explanation", text, issues: ["duplicate"] });
    else kept.push(text);
  }
  return { kept: kept.slice(0, 3), dropped };
}

/**
 * Explain a review finding in 2–3 plain sentences grounded only in the finding and KB text
 * (no new numbers, medicines or claims). Throws if fewer than 2 sentences pass.
 */
export async function aiExplainFinding(
  f: Finding,
  opts: { kbText?: string[]; medNames?: string[]; patientNames?: string[]; timeoutMs?: number } = {},
): Promise<{ text: string; sentences: string[]; dropped: number; ms: number; report: TaskReport } | null> {
  if (!isModelReady()) return null;
  const r = await generateJSON<ExplainOutput>({
    ...buildExplainPrompt(f, opts.kbText),
    schema: explainSchema(),
    maxTokens: 320,
    timeoutMs: opts.timeoutMs ?? 45_000,
    label: "Explaining this finding",
  });
  const { kept, dropped } = checkExplanation(f, r.value.sentences, opts);
  if (kept.length < 2) {
    throw new AIValidationError("The AI explanation did not pass the source check; the reviewed text is shown instead.", dropped, r.raw);
  }
  return { text: kept.join(" "), sentences: kept, dropped: dropped.length, ms: r.ms, report: report(r, dropped, []) };
}
