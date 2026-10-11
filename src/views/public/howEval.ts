// In-browser evaluation runners for the How-it-works page (SPEC §6.4, §9).
//
//   runNlpBenchmark()  → evaluateCorpus() over eval/nlp-corpus.dev.json + eval/nlp-corpus.heldout.json
//   runMedSuite()      → the eval/meds.eval.test.ts expectations over eval/med-cases.json, re-implemented
//                        without Node APIs (same case building, same matching rules, same precondition check)
//
// The corpora and case file are imported lazily, so the page itself stays light until someone presses Run.
// No React here: everything is pure apart from performance.now() for timing.

import type { CheckIn, ConditionTag, DiaryAnswers, FindingCategory, Medication, MedReview, PatientProfile } from "../../model/types";
import type { DrugMatch } from "../../kb/types";
import { addDays } from "../../model/dates";
import { evaluateCorpus, type Corpus, type EvalReport } from "../../engine/nlp/evaluate";
import { EVAL_MEDS, EVAL_PATIENT_NAMES, EVAL_TODAY } from "../../engine/nlp/fixtures";
import { CATEGORY_LABEL } from "../../engine/meds/labels";

/** "beers_avoid" → "Generally avoided in older adults (AGS Beers 2023)". */
const catLabel = (c: FindingCategory) => `“${CATEGORY_LABEL[c] ?? c}”`;

/** Let React paint the "running" state before a synchronous run blocks the main thread. */
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 40));

// ---------------------------------------------------------------------------------------------
// NLP benchmark

export interface ContextSubset {
  tag: string;
  label: string;
  cases: number;
  /** Cases in the subset with no core-field error. */
  clean: number;
  /** Core-field false positives (something recorded that should not have been). */
  falsePositives: number;
}

export interface CorpusRun {
  report: EvalReport;
  /** Case id → tags, so the UI can group errors. */
  context: ContextSubset[];
}

export interface CommittedNlp {
  generatedAt: string;
  devF1: number | null;
  heldoutF1: number | null;
}

export interface NlpRun {
  dev: CorpusRun;
  heldout: CorpusRun | null;
  ms: number;
  committed: CommittedNlp | null;
  /** True when the live micro-F1 equals the committed results file for every corpus scored there. */
  matchesCommitted: boolean | null;
}

/** ConText-style subsets reported separately (tags from eval/ANNOTATION-GUIDE.md). */
export const CONTEXT_SUBSETS: { tag: string; label: string }[] = [
  { tag: "negation", label: "Negation (“no dizziness”)" },
  { tag: "experiencer_other", label: "Someone else (“my granddaughter fell”)" },
  { tag: "historical", label: "Past events (“last week I…”)" },
  { tag: "hypothetical", label: "Hypothetical (“afraid I’ll fall”)" },
  { tag: "fall_vs_near_fall", label: "Fall vs near-fall" },
  { tag: "pseudo_negation", label: "Pseudo-negation (“no better”)" },
];

function contextSubsets(corpus: Corpus, report: EvalReport): ContextSubset[] {
  const coreErrors = report.errors.filter((e) => !e.field.startsWith("other:"));
  const errorCases = new Set(coreErrors.map((e) => e.id));
  return CONTEXT_SUBSETS.map(({ tag, label }) => {
    const ids = corpus.cases.filter((c) => c.tags?.includes(tag)).map((c) => c.id);
    const idSet = new Set(ids);
    return {
      tag,
      label,
      cases: ids.length,
      clean: ids.filter((id) => !errorCases.has(id)).length,
      falsePositives: coreErrors.filter((e) => idSet.has(e.id) && e.kind !== "false_negative").length,
    };
  }).filter((s) => s.cases > 0);
}

function asCorpus(x: unknown): Corpus | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Corpus;
  return Array.isArray(c.cases) ? c : null;
}

function readCommitted(x: unknown): CommittedNlp | null {
  if (!x || typeof x !== "object") return null;
  const r = x as { generatedAt?: unknown; dev?: { micro?: { f1?: unknown } } | null; heldout?: { micro?: { f1?: unknown } } | null };
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
    devF1: num(r.dev?.micro?.f1),
    heldoutF1: num(r.heldout?.micro?.f1),
  };
}

/** Score the NLP engine on both corpora, live. Throws only if the corpora cannot be loaded. */
export async function runNlpBenchmark(): Promise<NlpRun> {
  const [devMod, heldMod, committedMod] = await Promise.all([
    import("../../../eval/nlp-corpus.dev.json"),
    import("../../../eval/nlp-corpus.heldout.json").catch(() => null),
    import("../../../eval/results/nlp-eval.json").catch(() => null),
  ]);
  const dev = asCorpus(devMod.default as unknown);
  if (!dev) throw new Error("The development corpus could not be read.");
  const held = asCorpus(heldMod?.default as unknown);
  await nextFrame();
  const ctx = { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: EVAL_PATIENT_NAMES };
  const t0 = performance.now();
  const devReport = evaluateCorpus("dev", dev, ctx);
  const heldReport = held ? evaluateCorpus("heldout", held, ctx) : null;
  const ms = performance.now() - t0;
  const committed = readCommitted(committedMod?.default as unknown);
  let matchesCommitted: boolean | null = null;
  if (committed && committed.devF1 !== null) {
    matchesCommitted =
      committed.devF1 === devReport.micro.f1 && (committed.heldoutF1 === null || heldReport === null || committed.heldoutF1 === heldReport.micro.f1);
  }
  return {
    dev: { report: devReport, context: contextSubsets(dev, devReport) },
    heldout: heldReport && held ? { report: heldReport, context: contextSubsets(held, heldReport) } : null,
    ms,
    committed,
    matchesCommitted,
  };
}

// ---------------------------------------------------------------------------------------------
// Medication-review case suite (port of eval/meds.eval.test.ts, browser-safe)

interface CaseExpectation {
  category: FindingCategory;
  ingredients: string[];
  why: string;
  source: string;
  minMatches?: number;
}

interface CaseMed {
  name: string;
  daysAgoStarted: number;
  daysAgoStopped?: number;
  reason?: string;
  confirmSuggestion?: boolean;
}

interface EvalCase {
  id: string;
  title: string;
  covers: string[];
  profile: { age: number; sex?: PatientProfile["sex"]; conditions: ConditionTag[]; crclMlMin: number | null };
  meds: CaseMed[];
  diary?: { fallsLast12Months?: boolean };
  expect: {
    mustInclude: CaseExpectation[];
    mustNotInclude: CaseExpectation[];
    acbTotalAtLeast?: number;
    acbTotalExactly?: number;
    fallRiskIngredientsInclude?: string[];
    fallRiskIngredientsExclude?: string[];
    unmatchedNames?: string[];
    noFindings?: boolean;
    beersSuppressedNotice?: boolean;
    effectiveConditionsInclude?: { tag: ConditionTag; from: "profile" | "diary" }[];
    effectiveConditionsExclude?: ConditionTag[];
    basis?: Record<string, { why: string; source: string }>;
  };
}

export interface MedExpectationResult {
  label: string;
  passed: boolean;
  /** "precondition" = a medicine the case names did not resolve in the knowledge base (coverage gap). */
  failure: "precondition" | "assertion" | null;
  detail: string;
  why: string | null;
  source: string | null;
  category: FindingCategory | null;
}

export interface MedCaseResult {
  id: string;
  title: string;
  passed: boolean;
  error: string | null;
  expectations: MedExpectationResult[];
  invariants: string[];
}

export interface MedRun {
  cases: MedCaseResult[];
  summary: {
    cases: number;
    casesPassed: number;
    expectations: number;
    expectationsPassed: number;
    preconditionFailures: number;
    assertionFailures: number;
    invariantViolations: number;
  };
  byCategory: { category: FindingCategory; total: number; passed: number }[];
  kbVersion: string | null;
  caseFileVersion: string | null;
  today: string;
  ms: number;
}

const MED_TODAY = "2026-10-10";
const FALL_DAYS_AGO = 20;

const UNANSWERED: DiaryAnswers = {
  energy: null,
  sleep: null,
  appetite: null,
  dizziness: null,
  dizzinessSeverity: null,
  drowsiness: null,
  confusion: null,
  fall: null,
  nearFall: null,
  swelling: null,
};

/** SPEC §3 banned wording (the required "No flag does not mean a medicine is safe" disclaimer is exempt). */
const BANNED: { pattern: RegExp; label: string }[] = [
  { pattern: /\bcaused\b/i, label: "caused" },
  { pattern: /\bis causing\b/i, label: "is causing" },
  { pattern: /\bdangerous\b/i, label: "dangerous" },
  { pattern: /\bsafe\b/i, label: "safe" },
  { pattern: /\byou should stop\b/i, label: "you should stop" },
  { pattern: /\burgent\b/i, label: "urgent" },
  { pattern: /\bdiagnosis\b/i, label: "diagnosis" },
  { pattern: /\brisk score\b/i, label: "risk score" },
];
const REQUIRED_DISCLAIMER = "No flag does not mean a medicine is safe";
function bannedIn(text: string): string[] {
  const scrubbed = text.split(REQUIRED_DISCLAIMER).join("");
  return BANNED.filter((b) => b.pattern.test(scrubbed)).map((b) => b.label);
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
/** Token match: "trimethoprim" matches "sulfamethoxazole_trimethoprim". */
function ingredientMatches(actual: string, expected: string): boolean {
  return `_${norm(actual)}_`.includes(`_${norm(expected)}_`);
}

type MatchDrugFn = (input: string) => DrugMatch;
type ReviewFn = (input: { meds: Medication[]; profile: PatientProfile; checkIns: CheckIn[]; today: string }) => MedReview;

function buildCase(c: EvalCase, matchDrug: MatchDrugFn) {
  const stamp = `${MED_TODAY}T12:00:00.000Z`;
  const meds = c.meds.map((m, i): Medication => {
    let dm: DrugMatch | null = null;
    try {
      dm = matchDrug(m.name);
    } catch {
      dm = null;
    }
    let ingredientIds: string[] = [];
    let usedAs: Medication["match"] = "none";
    if (dm && (dm.match === "exact" || dm.match === "brand" || dm.match === "alias" || dm.match === "combo")) {
      ingredientIds = [...dm.ingredientIds];
      usedAs = dm.match;
    } else if (dm?.match === "fuzzy" && m.confirmSuggestion && dm.ingredientIds.length > 0) {
      ingredientIds = [...dm.ingredientIds];
      usedAs = "fuzzy_confirmed";
    }
    return {
      id: `${c.id}:m${i + 1}`,
      name: m.name,
      ingredientIds,
      match: usedAs,
      dose: "",
      frequency: "",
      asNeeded: false,
      otc: false,
      reason: m.reason ?? "",
      prescriber: "",
      startDate: addDays(MED_TODAY, -m.daysAgoStarted),
      endDate: m.daysAgoStopped === undefined ? null : addDays(MED_TODAY, -m.daysAgoStopped),
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
  const profile: PatientProfile = {
    displayName: `Evaluation case ${c.id}`,
    preferredName: "Case",
    age: c.profile.age,
    sex: c.profile.sex ?? null,
    conditions: [...c.profile.conditions],
    crclMlMin: c.profile.crclMlMin,
    caregiverName: "Evaluator",
    caregiverRelation: "test author",
  };
  const checkIns: CheckIn[] = [];
  if (c.diary?.fallsLast12Months) {
    const date = addDays(MED_TODAY, -FALL_DAYS_AGO);
    checkIns.push({
      id: `ci-${c.id}-fall`,
      date,
      answers: { ...UNANSWERED, fall: true },
      otherSymptoms: [],
      story: "",
      provenance: { fall: { origin: "manual", certainty: "explicit", spans: [] } },
      medNotes: [],
      confirmedAt: `${date}T20:00:00.000Z`,
      revision: 1,
    });
  }
  return { meds, profile, checkIns };
}

function evaluateMedCase(c: EvalCase, matchDrug: MatchDrugFn, review: ReviewFn): { result: MedCaseResult; kbVersion: string | null } {
  const built = buildCase(c, matchDrug);
  const result: MedCaseResult = { id: c.id, title: c.title, passed: false, error: null, expectations: [], invariants: [] };
  let r: MedReview;
  try {
    r = review({ meds: built.meds, profile: built.profile, checkIns: built.checkIns, today: MED_TODAY });
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return { result, kbVersion: null };
  }
  const medById = new Map(built.meds.map((m) => [m.id, m] as const));
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const summaries = findings.map((f) => ({
    category: f.category,
    title: f.title,
    ingredients: [...new Set(f.medIds.flatMap((id) => medById.get(id)?.ingredientIds ?? []))],
  }));
  const resolved = [...new Set(built.meds.flatMap((m) => m.ingredientIds))];
  const unresolved = (wanted: string[]) => wanted.filter((w) => !resolved.some((a) => ingredientMatches(a, w)));
  const matches = (exp: CaseExpectation) =>
    summaries.filter((f) => f.category === exp.category && exp.ingredients.every((w) => f.ingredients.some((a) => ingredientMatches(a, w))));
  const basis = (key: string) => ({ why: c.expect.basis?.[key]?.why ?? null, source: c.expect.basis?.[key]?.source ?? null });
  const push = (x: Omit<MedExpectationResult, "failure"> & { failure?: MedExpectationResult["failure"] }) =>
    result.expectations.push({ ...x, failure: x.passed ? null : (x.failure ?? "assertion") });

  for (const exp of c.expect.mustInclude) {
    const label = `Should flag ${catLabel(exp.category)} for ${exp.ingredients.join(" + ") || "any medicine"}`;
    const missing = unresolved(exp.ingredients);
    if (missing.length) {
      push({ label, passed: false, failure: "precondition", detail: `Not in the reference list: ${missing.join(", ")}`, why: exp.why, source: exp.source, category: exp.category });
      continue;
    }
    const hits = matches(exp);
    const need = exp.minMatches ?? 1;
    push({
      label,
      passed: hits.length >= need,
      detail: hits.length >= need ? hits.map((h) => h.title).join(" · ") : `Expected ${need}, found ${hits.length}`,
      why: exp.why,
      source: exp.source,
      category: exp.category,
    });
  }
  for (const exp of c.expect.mustNotInclude) {
    const label = `Should not flag ${catLabel(exp.category)}${exp.ingredients.length ? ` for ${exp.ingredients.join(" + ")}` : ""}`;
    const missing = unresolved(exp.ingredients);
    if (missing.length) {
      push({ label, passed: false, failure: "precondition", detail: `Not in the reference list: ${missing.join(", ")}`, why: exp.why, source: exp.source, category: exp.category });
      continue;
    }
    const hits = matches(exp);
    push({ label, passed: hits.length === 0, detail: hits.length ? `Unexpected: ${hits.map((h) => h.title).join(" · ")}` : "None present", why: exp.why, source: exp.source, category: exp.category });
  }
  const e = c.expect;
  const acbTotal = typeof r.acb?.total === "number" ? r.acb.total : null;
  if (e.acbTotalExactly !== undefined) {
    push({ label: `Anticholinergic total = ${e.acbTotalExactly}`, passed: acbTotal === e.acbTotalExactly, detail: `Got ${String(acbTotal)}`, ...basis("acbTotal"), category: null });
  }
  if (e.acbTotalAtLeast !== undefined) {
    push({ label: `Anticholinergic total ≥ ${e.acbTotalAtLeast}`, passed: acbTotal !== null && acbTotal >= e.acbTotalAtLeast, detail: `Got ${String(acbTotal)}`, ...basis("acbTotal"), category: null });
  }
  const fallIngredients = [...new Set((r.fallRiskMedIds ?? []).flatMap((id) => medById.get(id)?.ingredientIds ?? []))];
  if (e.fallRiskIngredientsInclude) {
    const missingResolve = unresolved(e.fallRiskIngredientsInclude);
    const missing = e.fallRiskIngredientsInclude.filter((w) => !fallIngredients.some((a) => ingredientMatches(a, w)));
    push({
      label: `Fall-risk list includes ${e.fallRiskIngredientsInclude.join(", ")}`,
      passed: missing.length === 0,
      failure: missingResolve.length ? "precondition" : "assertion",
      detail: missingResolve.length ? `Not in the reference list: ${missingResolve.join(", ")}` : missing.length ? `Missing ${missing.join(", ")}` : "All present",
      ...basis("fallRisk"),
      category: "fall_risk",
    });
  }
  if (e.fallRiskIngredientsExclude) {
    const missingResolve = unresolved(e.fallRiskIngredientsExclude);
    const present = e.fallRiskIngredientsExclude.filter((w) => fallIngredients.some((a) => ingredientMatches(a, w)));
    push({
      label: `Fall-risk list excludes ${e.fallRiskIngredientsExclude.join(", ")}`,
      passed: missingResolve.length === 0 && present.length === 0,
      failure: missingResolve.length ? "precondition" : "assertion",
      detail: missingResolve.length ? `Not in the reference list: ${missingResolve.join(", ")}` : present.length ? `Unexpected ${present.join(", ")}` : "None present",
      ...basis("fallRisk"),
      category: "fall_risk",
    });
  }
  if (e.unmatchedNames) {
    const missing = e.unmatchedNames.filter((name) => {
      const ids = built.meds.filter((m) => m.name === name).map((m) => m.id);
      return ids.length === 0 || !ids.every((id) => (r.unmatchedMedIds ?? []).includes(id));
    });
    push({ label: `Reported as not reviewed: ${e.unmatchedNames.join(", ")}`, passed: missing.length === 0, detail: missing.length ? `Not reported: ${missing.join(", ")}` : "All reported", ...basis("unmatched"), category: null });
  }
  if (e.noFindings) {
    push({ label: "No findings", passed: summaries.length === 0, detail: summaries.length ? `Unexpected: ${summaries.map((s) => s.title).join(" · ")}` : "None", ...basis("noFindings"), category: null });
  }
  if (e.beersSuppressedNotice) {
    const ok = (r.notices ?? []).some((n) => /beers/i.test(n));
    push({ label: "Explains why Beers rules were not applied", passed: ok, detail: (r.notices ?? []).join(" · ") || "No notice", ...basis("beersSuppressedNotice"), category: null });
  }
  for (const want of e.effectiveConditionsInclude ?? []) {
    const ok = (r.effectiveConditions ?? []).some((x) => x.tag === want.tag && x.from === want.from);
    push({ label: `Uses condition ${want.tag} (${want.from})`, passed: ok, detail: ok ? "Present" : "Missing", ...basis("effectiveConditions"), category: null });
  }
  for (const tag of e.effectiveConditionsExclude ?? []) {
    const ok = !(r.effectiveConditions ?? []).some((x) => x.tag === tag);
    push({ label: `Does not use condition ${tag}`, passed: ok, detail: ok ? "Absent" : "Present", ...basis("effectiveConditions"), category: null });
  }

  // Integrity + language invariants (subset of the test file's checks that need no Node APIs).
  for (const f of findings) {
    if (!f.sourceIds?.length) result.invariants.push(`${f.title}: no source`);
    for (const field of ["title", "plain", "clinician", "question"] as const) {
      const hits = bannedIn(String(f[field] ?? ""));
      if (hits.length) result.invariants.push(`${f.title}: ${field} uses banned wording (${hits.join(", ")})`);
    }
  }
  result.passed = result.error === null && result.expectations.every((x) => x.passed) && result.invariants.length === 0;
  return { result, kbVersion: typeof r.kbVersion === "string" ? r.kbVersion : null };
}

/** Run every case in eval/med-cases.json through matchDrug + reviewMedications, live. */
export async function runMedSuite(): Promise<MedRun> {
  const [fileMod, kbMod, reviewMod] = await Promise.all([
    import("../../../eval/med-cases.json"),
    import("../../kb"),
    import("../../engine/meds/review"),
  ]);
  const file = fileMod.default as unknown as { version?: string; cases?: EvalCase[] };
  const cases = Array.isArray(file.cases) ? file.cases : [];
  await nextFrame();
  const t0 = performance.now();
  const results: MedCaseResult[] = [];
  let kbVersion: string | null = null;
  for (const c of cases) {
    const { result, kbVersion: v } = evaluateMedCase(c, kbMod.matchDrug, reviewMod.reviewMedications as ReviewFn);
    results.push(result);
    kbVersion ??= v;
  }
  const ms = performance.now() - t0;
  const all = results.flatMap((r) => r.expectations);
  const cats = new Map<FindingCategory, { total: number; passed: number }>();
  for (const x of all) {
    if (!x.category) continue;
    const k = cats.get(x.category) ?? { total: 0, passed: 0 };
    k.total++;
    if (x.passed) k.passed++;
    cats.set(x.category, k);
  }
  return {
    cases: results,
    summary: {
      cases: results.length,
      casesPassed: results.filter((r) => r.passed).length,
      expectations: all.length,
      expectationsPassed: all.filter((x) => x.passed).length,
      preconditionFailures: all.filter((x) => x.failure === "precondition").length,
      assertionFailures: all.filter((x) => x.failure === "assertion").length,
      invariantViolations: results.reduce((s, r) => s + r.invariants.length, 0),
    },
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total),
    kbVersion: kbVersion ?? kbMod.KB.version,
    caseFileVersion: typeof file.version === "string" ? file.version : null,
    today: MED_TODAY,
    ms,
  };
}
