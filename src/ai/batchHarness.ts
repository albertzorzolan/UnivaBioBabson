// Batch evaluation of the on-device model, run inside the browser (loaded by /ai-harness.html; driven headlessly
// by scripts/llm-batch.mjs through window.__kinwiseBatch).
//
// Unlike harness.tsx, which feeds the model the hand-written fixture of src/ai/fixtures.ts, this module runs each
// prompt through the same pipeline as the app's screens, on the demo record (the fictional Margaret story,
// src/model/seed.ts) built for a fixed "today":
//   Ask        routeQuestion → retrieveForQuestion → aiAnswer, shown unless it only repeats the records answer
//              (src/views/caregiver/Ask.tsx)
//   Brief      composeTemplate for a period and concern selection → aiDraftBrief (src/views/caregiver/VisitBrief.tsx)
//   Explain    aiExplainFinding with the KB "used for" text of the medicines involved (meds/FindingCard.tsx)
// Every model sentence goes through the app's own checks (tasks.ts). This module only records what happened: for
// each sentence the model wrote, whether the check blocked it, whether the app would show it, and the evidence it
// cites, so that every shown sentence can be audited afterwards against the records it points to.

import type { BriefSentence, EvidenceItem, EvidencePackage, Finding, ISODate, Medication, MetricKey } from "../model/types";
import { createSeed } from "../model/seed";
import { activeMeds, reviewMedications } from "../engine/meds/review";
import { analyzeTimeline } from "../engine/timeline/signals";
import { buildEvidence, defaultPeriod, retrieveForQuestion, routeQuestion } from "../engine/brief";
import { rankFindings } from "../engine/brief/evidence";
import { pronounsFor } from "../engine/brief/shared";
import { getDrug, knownEffect } from "../kb";
import { composeTemplate, defaultComposeOptions, type BriefInputs } from "../views/caregiver/brief/compose";
import { repeatsRecords } from "../views/caregiver/askDraft";
import { parseModelJSON } from "./guard";
import { LLMError, getLLMState } from "./llm";
import { KB_DRUG_NAMES } from "./adapters";
import { BRIEF_BUDGET, aliasEvidence, selectEvidence } from "./prompts";
import {
  AIValidationError,
  ANSWER_BUDGET,
  aiAnswer,
  aiDraftBrief,
  aiExplainFinding,
  checkExplanation,
  restoreEvidenceIds,
  verifySection,
  type DroppedSentence,
} from "./tasks";

// ---------------------------------------------------------------------------------------------
// The prompt set (written in scripts/llm-batch.mjs and passed in)

export interface AskPrompt {
  id: string;
  question: string;
  /** True for the five suggestion chips the Ask screen shows. */
  chip?: boolean;
}
export interface BriefPrompt {
  id: string;
  /** Brief period in days (the builder offers 14, 30 and 60). */
  days: number;
  /** Include the family's pinned concerns (the builder's default) or none. */
  concerns: boolean;
}
export interface ExplainPrompt {
  id: string;
  /** Finding key as the medication review renders it, e.g. "beers-pim-benzodiazepine|med-lorazepam". */
  findingKey: string;
}
export interface BatchPrompts {
  today: ISODate;
  ask: AskPrompt[];
  brief: BriefPrompt[];
  explain: ExplainPrompt[];
}

// ---------------------------------------------------------------------------------------------
// What is recorded

/**
 * One sentence the model wrote, and what the app did with it:
 *   shown     displayed to the family as AI text
 *   blocked   removed by the claim checker (`issues` says why)
 *   not_shown passed the check (or, for a brief that stopped after step 1, was never checked) but the app did not
 *             display it: the Ask draft only repeated the records answer or did not answer the question, a brief
 *             section fell back to the template, or an explanation had too few sentences left (`issues` says which)
 */
export interface BatchSentence {
  /** Stable id for the audit labels: "<prompt id>#<n>". */
  id: string;
  section: string;
  text: string;
  verdict: "shown" | "blocked" | "not_shown";
  issues: string[];
  /** Ids of the records the sentence cites (explanations cite the finding and KB text instead). */
  evidenceIds: string[];
  /** The text of what it cites, for the audit. */
  cited: string[];
}

export interface BatchResult {
  id: string;
  task: "ask" | "brief" | "explain";
  input: Record<string, unknown>;
  /** Did the app call the model? (No for questions routed out of scope or with nothing in the records.) */
  modelRan: boolean;
  /** What the family would see, in a few words. */
  outcome: string;
  /** Wall time of the AI call in the page, ms (null when no model ran). */
  ms: number | null;
  /** Model generation time as the task reports it (two generations for a brief), ms. */
  modelMs: number | null;
  error: string | null;
  raw: string;
  sentences: BatchSentence[];
  /** For Ask: the records-based answer the AI draft sits under. */
  recordsAnswer?: string[];
}

export interface BatchPlanRow {
  id: string;
  task: BatchResult["task"];
  ok: boolean;
  note: string;
}

// ---------------------------------------------------------------------------------------------
// The demo record, as the app derives it (src/app/useDerived.ts)

interface Context {
  today: ISODate;
  inputs: BriefInputs;
  askPkg: EvidencePackage;
  medNames: string[];
  patientNames: string[];
  findings: Finding[];
  meds: Map<string, Medication>;
}

function context(today: ISODate): Context {
  const data = createSeed(today);
  const isKnownEffect = (med: Medication, m: MetricKey) => knownEffect(med.ingredientIds, m);
  const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect });
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals });
  const per = defaultPeriod(today, 30);
  const p = data.profile;
  return {
    today,
    inputs: { data, review, timeline, today },
    askPkg: buildEvidence({ data, from: per.from, to: per.to, review, timeline }),
    medNames: data.medications.map((m) => m.name),
    // Ask, VisitBrief and Review all pass these names.
    patientNames: [p.preferredName, p.displayName, "Mom"].filter((n): n is string => Boolean(n)),
    findings: rankFindings(review.findings),
    meds: new Map(activeMeds(data.medications, today).map((m) => [m.id, m])),
  };
}

const errorText = (e: unknown) => `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`;
const rawOf = (e: unknown) => (e instanceof AIValidationError ? e.raw : e instanceof LLMError ? (e.raw ?? "") : "");

/** The JSON value of one raw model output, as generateJSON parsed it (null when there is none or it cannot be read). */
function valueOf(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try {
    const v = parseModelJSON<Record<string, unknown>>(raw).value;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/**
 * The tasks return what the family sees, not every sentence the checker passed (an Ask draft that only repeats the
 * records answer, a brief section that fell back to the template). So each output is checked again here with the same
 * pure functions and the same inputs as in tasks.ts: they give the same result, and every task cross-checks its count
 * of removed sentences against the one the app reported. Sentences are counted as the checker counts them: a model item
 * that packs several statements is split first.
 */
interface Recheck {
  kept: { section: string; s: BriefSentence }[];
  dropped: DroppedSentence[];
}

const verifyOpts = (ctx: Context) => ({ medNames: ctx.medNames, patientNames: ctx.patientNames, knownDrugNames: KB_DRUG_NAMES });

/** aiAnswer's check (tasks.ts): evidence selection and aliasing, the merged package, one "answer" section of 3. */
function recheckAnswer(ctx: Context, items: EvidenceItem[], raw: string): Recheck {
  const shown = selectEvidence(items, ANSWER_BUDGET);
  const aliased = aliasEvidence(shown);
  const known = new Set(ctx.askPkg.items.map((i) => i.id));
  const merged: EvidencePackage = { ...ctx.askPkg, items: [...ctx.askPkg.items, ...items.filter((i) => !known.has(i.id))] };
  const value = valueOf(raw);
  if (!value) return { kept: [], dropped: [] };
  const answer = restoreEvidenceIds(value, aliased.restore).answer;
  const { kept, dropped } = verifySection("answer", answer, merged, { ...verifyOpts(ctx), expect: "statement", max: 3, pool: shown, edits: [] });
  return { kept: kept.map((s) => ({ section: "answer", s })), dropped };
}

/**
 * aiDraftBrief's checks: step 1 (reason + observations) and step 2 (questions) arrive as one raw text joined by "---".
 * With both steps, the three sections are checked as assembleBrief checks them; when step 1 failed, only its
 * observations were checked (check1) and its reason sentences never were.
 */
function recheckBrief(ctx: Context, pkg: EvidencePackage, raw: string): Recheck & { unchecked: { section: string; s: BriefSentence }[] } {
  const pool = selectEvidence(pkg.items, BRIEF_BUDGET);
  const aliased = aliasEvidence(pool);
  const [raw1 = "", raw2] = raw.split("\n---\n");
  const v1 = valueOf(raw1);
  const step1 = v1 ? restoreEvidenceIds(v1, aliased.restore) : {};
  const v = { ...verifyOpts(ctx), pool, edits: [] };
  const noticed = verifySection("noticed", step1.noticed, pkg, { ...v, expect: "statement", max: 4 });
  const tag = (section: string, list: BriefSentence[]) => list.map((s) => ({ section, s }));
  if (raw2 === undefined) {
    const unchecked = (Array.isArray(step1.reason) ? step1.reason : []).map((x) => ({ section: "reason", s: { text: String((x as { text?: unknown })?.text ?? ""), evidenceIds: [] } }));
    return { kept: tag("noticed", noticed.kept), dropped: noticed.dropped, unchecked: unchecked.filter((u) => u.s.text.trim()) };
  }
  const v2 = valueOf(raw2);
  const step2 = v2 ? restoreEvidenceIds(v2, aliased.restore) : {};
  const reason = verifySection("reason", step1.reason, pkg, { ...v, expect: "statement", max: 1 });
  const questions = verifySection("questions", step2.questions, pkg, { ...v, expect: "question", max: 5 });
  return {
    kept: [...tag("reason", reason.kept), ...tag("noticed", noticed.kept), ...tag("questions", questions.kept)],
    dropped: [...reason.dropped, ...noticed.dropped, ...questions.dropped],
    unchecked: [],
  };
}

/** Number each sentence of one output: shown first, then blocked, then the rest. */
export function numberSentences(
  promptId: string,
  parts: { shown: { section: string; s: BriefSentence }[]; blocked: DroppedSentence[]; notShown: { section: string; s: BriefSentence; why: string }[] },
  citedOf: (s: BriefSentence) => string[],
): BatchSentence[] {
  const out: BatchSentence[] = [];
  const add = (b: Omit<BatchSentence, "id">) => out.push({ id: `${promptId}#${out.length + 1}`, ...b });
  for (const { section, s } of parts.shown) add({ section, text: s.text, verdict: "shown", issues: [], evidenceIds: s.evidenceIds, cited: citedOf(s) });
  for (const d of parts.blocked) add({ section: d.section, text: d.text, verdict: "blocked", issues: d.issues, evidenceIds: [], cited: [] });
  for (const { section, s, why } of parts.notShown) add({ section, text: s.text, verdict: "not_shown", issues: [why], evidenceIds: s.evidenceIds, cited: [] });
  return out;
}

/** "" when the re-check removed as many sentences as the app reported, else a note (recorded as the result's error). */
const mismatch = (again: number, app: number) => (again === app ? null : `re-check mismatch: ${again} removed here vs ${app} reported by the app`);

const sameText = (a: BriefSentence, b: BriefSentence) => a.text === b.text;

// ---------------------------------------------------------------------------------------------
// Ask

function routeAndRetrieve(ctx: Context, question: string) {
  const p = ctx.inputs.data.profile;
  const route = routeQuestion(question, {
    patientName: p.preferredName,
    personNames: [p.displayName, p.preferredName],
    medNames: ctx.medNames,
    possessive: pronounsFor(p).possessive,
  });
  const result = route.inScope ? retrieveForQuestion(question, { data: ctx.inputs.data, pkg: ctx.askPkg, today: ctx.today, review: ctx.inputs.review }) : null;
  return { route, result };
}

async function runAsk(ctx: Context, a: AskPrompt): Promise<BatchResult> {
  const { route, result } = routeAndRetrieve(ctx, a.question);
  const base = { id: a.id, task: "ask" as const, input: { question: a.question, chip: Boolean(a.chip) } };
  if (!route.inScope || !result || result.status !== "answered") {
    const outcome = !route.inScope ? `routed to the clinician (${route.category})` : "nothing in the records";
    return { ...base, modelRan: false, outcome, ms: null, modelMs: null, error: null, raw: "", sentences: [] };
  }
  const lookup = new Map<string, EvidenceItem>([...ctx.askPkg.items, ...result.items].map((i) => [i.id, i]));
  const citedOf = (s: BriefSentence) => s.evidenceIds.map((id) => lookup.get(id)?.text ?? `(unknown record ${id})`);
  const recordsAnswer = result.deterministicAnswer.map((s) => s.text);
  const started = performance.now();
  try {
    const res = await aiAnswer(a.question, result.items, ctx.askPkg, { medNames: ctx.medNames, patientNames: ctx.patientNames });
    const ms = Math.round(performance.now() - started);
    if (!res) throw new Error("model not ready");
    const again = recheckAnswer(ctx, result.items, res.report.raw);
    // Ask.tsx shows the draft only when it answers the question and says more than the records answer.
    const display = res.status === "answered" && res.sentences.length > 0 && !repeatsRecords(res.sentences, result.deterministicAnswer);
    const why = res.status === "not_in_records" ? "not shown: the draft did not answer the question" : "not shown: the draft only repeated the records answer";
    const outcome = display ? "AI draft shown under the records answer" : `AI draft ${why.replace("not shown: the draft ", "")}; not shown`;
    return {
      ...base,
      modelRan: true,
      outcome,
      ms,
      modelMs: res.report.ms,
      error: mismatch(again.dropped.length, res.report.dropped.length),
      raw: res.report.raw,
      recordsAnswer,
      sentences: numberSentences(
        a.id,
        {
          shown: display ? res.sentences.map((s) => ({ section: "answer", s })) : [],
          blocked: res.report.dropped,
          notShown: display ? again.kept.filter((k) => !res.sentences.some((s) => sameText(s, k.s))).map((k) => ({ ...k, why: "not shown" })) : again.kept.map((k) => ({ ...k, why })),
        },
        citedOf,
      ),
    };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    const raw = rawOf(e);
    const again = recheckAnswer(ctx, result.items, raw);
    const appDropped = e instanceof AIValidationError ? e.dropped : again.dropped;
    return {
      ...base,
      modelRan: true,
      outcome: "AI draft blocked; only the records answer is shown",
      ms,
      modelMs: null,
      error: [errorText(e), mismatch(again.dropped.length, appDropped.length)].filter(Boolean).join("; "),
      raw,
      recordsAnswer,
      sentences: numberSentences(a.id, { shown: [], blocked: appDropped, notShown: again.kept.map((k) => ({ ...k, why: "not shown: the draft was blocked" })) }, citedOf),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Brief

function briefBuild(ctx: Context, b: BriefPrompt) {
  const opts = defaultComposeOptions(ctx.inputs, b.days);
  return composeTemplate(ctx.inputs, b.concerns ? opts : { ...opts, includedConcernIds: [] });
}

async function runBrief(ctx: Context, b: BriefPrompt): Promise<BatchResult> {
  const built = briefBuild(ctx, b);
  const base = { id: b.id, task: "brief" as const, input: { days: b.days, concerns: b.concerns, from: built.pkg.from, to: built.pkg.to, evidenceItems: built.pkg.items.length } };
  const lookup = new Map(built.pkg.items.map((i) => [i.id, i]));
  const citedOf = (s: BriefSentence) => s.evidenceIds.map((id) => lookup.get(id)?.text ?? `(unknown record ${id})`);
  const started = performance.now();
  try {
    const res = await aiDraftBrief(built.pkg, built.content, { medNames: ctx.medNames, patientNames: ctx.patientNames, kbVersion: ctx.inputs.review.kbVersion });
    const ms = Math.round(performance.now() - started);
    if (!res) throw new Error("model not ready");
    const again = recheckBrief(ctx, built.pkg, res.report.raw);
    // The app's sections (res.sections) say which parts of the brief are AI-written; only those are shown as AI text.
    const sec = res.sections;
    const shown = (["reason", "noticed", "questions"] as const).flatMap((k) => (sec[k] === "ai" ? res.content[k].map((s) => ({ section: k, s })) : []));
    const notShown = again.kept
      .filter((k) => !shown.some((x) => x.section === k.section && sameText(x.s, k.s)))
      .map((k) => ({ ...k, why: "not shown: this section of the brief came from the template" }));
    return {
      ...base,
      modelRan: true,
      outcome: `AI draft shown: why we're coming in from the ${sec.reason === "ai" ? "AI" : "template"}, what we've noticed from the AI, questions from the ${sec.questions === "ai" ? "AI" : "template"}`,
      ms,
      modelMs: res.info.durationMs,
      error: mismatch(again.dropped.length, res.report.dropped.length),
      raw: res.report.raw,
      sentences: numberSentences(b.id, { shown, blocked: res.report.dropped, notShown }, citedOf),
    };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    const raw = rawOf(e);
    const again = recheckBrief(ctx, built.pkg, raw);
    const appDropped = e instanceof AIValidationError ? e.dropped : again.dropped;
    const notShown = [
      ...again.kept.map((k) => ({ ...k, why: "not shown: too few observations passed, so the template brief is shown" })),
      ...again.unchecked.map((k) => ({ ...k, why: "not shown and not checked: the draft stopped after step 1" })),
    ];
    return {
      ...base,
      modelRan: true,
      outcome: "AI draft not used; the standard template brief is shown",
      ms,
      modelMs: null,
      error: [errorText(e), mismatch(again.dropped.length, appDropped.length)].filter(Boolean).join("; "),
      raw,
      sentences: numberSentences(b.id, { shown: [], blocked: appDropped, notShown }, citedOf),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Explain

async function runExplain(ctx: Context, x: ExplainPrompt): Promise<BatchResult> {
  const f = ctx.findings.find((k) => k.key === x.findingKey);
  const base = { id: x.id, task: "explain" as const, input: { findingKey: x.findingKey, title: f?.title ?? null } };
  if (!f) return { ...base, modelRan: false, outcome: "finding not in the review", ms: null, modelMs: null, error: "finding not found", raw: "", sentences: [] };
  const involved = f.medIds.map((id) => ctx.meds.get(id)).filter((m): m is Medication => Boolean(m));
  const kbText = involved.flatMap((m) => m.ingredientIds.map((id) => getDrug(id)?.usedFor ?? "")).filter(Boolean);
  const opts = { kbText, medNames: involved.map((m) => m.name), patientNames: ctx.patientNames };
  // An explanation is checked against the finding and the KB text, not against records: those are what it "cites".
  const support = [f.title, f.plain, f.clinician, f.question, f.evidenceGrade ?? "", ...kbText].filter(Boolean);
  const citedOf = () => support;
  const recheck = (raw: string) => checkExplanation(f, valueOf(raw)?.sentences, opts);
  const asS = (text: string) => ({ section: "explanation", s: { text, evidenceIds: [] } });
  const started = performance.now();
  try {
    const r = await aiExplainFinding(f, opts);
    const ms = Math.round(performance.now() - started);
    if (!r) throw new Error("model not ready");
    const again = recheck(r.report.raw);
    return {
      ...base,
      modelRan: true,
      outcome: "AI explanation shown under the reviewed text",
      ms,
      modelMs: r.ms,
      error: mismatch(again.dropped.length, r.report.dropped.length),
      raw: r.report.raw,
      sentences: numberSentences(
        x.id,
        { shown: r.sentences.map(asS), blocked: r.report.dropped, notShown: again.kept.slice(3).map((t) => ({ ...asS(t), why: "not shown: an explanation shows at most 3 sentences" })) },
        citedOf,
      ),
    };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    const raw = rawOf(e);
    const again = recheck(raw);
    const appDropped = e instanceof AIValidationError ? e.dropped : again.dropped;
    return {
      ...base,
      modelRan: true,
      outcome: "AI explanation blocked; the reviewed text stays",
      ms,
      modelMs: null,
      error: [errorText(e), mismatch(again.dropped.length, appDropped.length)].filter(Boolean).join("; "),
      raw,
      sentences: numberSentences(x.id, { shown: [], blocked: appDropped, notShown: again.kept.map((t) => ({ ...asS(t), why: "not shown: fewer than 2 sentences passed" })) }, citedOf),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Entry points

/**
 * Check the prompt set without the model: every Ask question must reach the model (in scope, answered from the
 * records) and every finding key must exist in the review. The script refuses to start the GPU run otherwise.
 */
export function planBatch(prompts: BatchPrompts): BatchPlanRow[] {
  const ctx = context(prompts.today);
  const rows: BatchPlanRow[] = [];
  for (const a of prompts.ask) {
    const { route, result } = routeAndRetrieve(ctx, a.question);
    const ok = route.inScope && result?.status === "answered";
    rows.push({ id: a.id, task: "ask", ok, note: !route.inScope ? `routed out (${route.category})` : (result?.status ?? "no result") });
  }
  for (const b of prompts.brief) {
    const built = briefBuild(ctx, b);
    rows.push({ id: b.id, task: "brief", ok: built.pkg.items.length > 0, note: `${built.pkg.from}…${built.pkg.to}, ${built.pkg.items.length} evidence items` });
  }
  for (const x of prompts.explain) {
    const f = ctx.findings.find((k) => k.key === x.findingKey);
    rows.push({ id: x.id, task: "explain", ok: Boolean(f), note: f?.title ?? "not found" });
  }
  return rows;
}

/** The ranked finding keys of the demo review (to pick explanation prompts). */
export function findingKeys(today: ISODate): { key: string; title: string }[] {
  return context(today).findings.map((f) => ({ key: f.key, title: f.title }));
}

/** Run every prompt in order (one generation at a time, as the app does). */
export async function runBatch(prompts: BatchPrompts): Promise<BatchResult[]> {
  const ctx = context(prompts.today);
  const out: BatchResult[] = [];
  const log = (r: BatchResult) => {
    const v = (k: BatchSentence["verdict"]) => r.sentences.filter((s) => s.verdict === k).length;
    console.info(`[batch] ${r.task} ${r.id} ${r.ms ?? "-"} ms shown ${v("shown")} blocked ${v("blocked")} not-shown ${v("not_shown")} · ${r.outcome}${r.error ? ` · ${r.error.slice(0, 160)}` : ""}`);
    out.push(r);
  };
  for (const a of prompts.ask) log(await runAsk(ctx, a));
  for (const b of prompts.brief) log(await runBrief(ctx, b));
  for (const x of prompts.explain) log(await runExplain(ctx, x));
  return out;
}

declare global {
  interface Window {
    __kinwiseBatch?: { plan: typeof planBatch; findingKeys: typeof findingKeys; run: typeof runBatch; model: () => string | null };
  }
}

if (typeof window !== "undefined") {
  window.__kinwiseBatch = { plan: planBatch, findingKeys, run: runBatch, model: () => getLLMState().model };
}
