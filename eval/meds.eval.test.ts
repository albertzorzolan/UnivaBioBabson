// Independent clinical evaluation of the Kinwise medication-review engine (docs/SPEC.md §6.2, §9).
//
// The expectations live in eval/med-cases.json. They were written from the published criteria (AGS Beers 2023,
// ACB 2012, CDC STEADI / STEADI-Rx / STOPPFall, ThinkCascades and the primary cascade studies, STOPP/START v3)
// without reading src/engine/meds/** or src/kb/data/**. See eval/MED-CASES-METHOD.md.
//
// How a case runs:
//   1. every medication name goes through matchDrug() exactly as a family would type it;
//   2. Medication objects are built with startDate = today - daysAgoStarted (today fixed at 2026-10-10);
//   3. a fall check-in 20 days ago is added when diary.fallsLast12Months is true;
//   4. reviewMedications() runs and each expectation is checked against the MedReview.
// An expectation matches a finding when the category is equal and every listed ingredient is among the
// ingredients of the medications the finding involves. Every ingredient an expectation names must also resolve
// from one of the case's names (non-vacuity), so a negative cannot pass only because a name went unmatched.
//
// The engine modules are imported dynamically so this file compiles and fails cleanly (one red test, cases
// skipped) while src/kb/normalize.ts or src/engine/meds/review.ts do not exist yet.
// Results (pass/fail per expectation) are written to eval/results/meds-eval.json for the docs.

import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { writeResultsIfChanged } from "./writeResults";
import { fileURLToPath } from "node:url";
import type {
  CheckIn,
  ConditionTag,
  DiaryAnswers,
  Finding,
  FindingCategory,
  ISODate,
  Medication,
  MedReview,
  PatientProfile,
  Signal,
} from "../src/model/types";
import type { DrugMatch } from "../src/kb/types";
import { addDays } from "../src/model/dates";

const TODAY: ISODate = "2026-10-10";
const FALL_DAYS_AGO = 20;
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CASES_PATH = fileURLToPath(new URL("./med-cases.json", import.meta.url));
// KINWISE_MED_EVAL_RESULTS / _NORMALIZE / _REVIEW exist only to test this runner against a stub engine;
// normal runs use the real modules and write the docs results file.
const RESULTS_PATH = process.env.KINWISE_MED_EVAL_RESULTS ?? fileURLToPath(new URL("./results/meds-eval.json", import.meta.url));
const NORMALIZE_MODULE = process.env.KINWISE_MED_EVAL_NORMALIZE ?? new URL("../src/kb/normalize.ts", import.meta.url).href;
const REVIEW_MODULE = process.env.KINWISE_MED_EVAL_REVIEW ?? new URL("../src/engine/meds/review.ts", import.meta.url).href;

// ---------------------------------------------------------------------------------------------
// Case-file shape (see "conventions" in med-cases.json)

interface CaseExpectation {
  category: FindingCategory;
  ingredients: string[];
  why: string;
  source: string;
  /** At least this many distinct findings must match (default 1). Used when one product meets two criteria. */
  minMatches?: number;
}

interface CaseMed {
  name: string;
  daysAgoStarted: number;
  daysAgoStopped?: number;
  reason?: string;
  /** Accept a fuzzy matchDrug suggestion as if the family confirmed it. */
  confirmSuggestion?: boolean;
}

interface CaseExpect {
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
  /** Why/source for the scalar expectations above, keyed by acbTotal, fallRisk, unmatched, noFindings ... */
  basis?: Record<string, { why: string; source: string }>;
}

interface EvalCase {
  id: string;
  title: string;
  covers: string[];
  profile: { age: number; sex?: PatientProfile["sex"]; conditions: ConditionTag[]; crclMlMin: number | null };
  meds: CaseMed[];
  diary?: { fallsLast12Months?: boolean };
  expect: CaseExpect;
}

interface CaseFile {
  version: string;
  author: string;
  method: string;
  disclaimer: string;
  today: string;
  cases: EvalCase[];
}

// Records (not arrays) so the compiler fails if model/types.ts gains a value these lists do not know about.
const CATEGORIES: Record<FindingCategory, true> = {
  beers_avoid: true,
  beers_caution: true,
  beers_condition: true,
  beers_interaction: true,
  beers_renal: true,
  anticholinergic_burden: true,
  fall_risk: true,
  prescribing_cascade: true,
  duplicate_class: true,
  cns_active_combo: true,
  monitoring: true,
};
const CONDITIONS: Record<ConditionTag, true> = {
  history_of_falls: true,
  dementia_or_cognitive_impairment: true,
  delirium_history: true,
  heart_failure: true,
  chronic_kidney_disease: true,
  parkinson_disease: true,
  gi_bleeding_or_ulcer_history: true,
  hypertension: true,
  type2_diabetes: true,
  atrial_fibrillation: true,
  urinary_incontinence: true,
  benign_prostatic_hyperplasia: true,
  insomnia: true,
  depression: true,
  anxiety: true,
  osteoarthritis: true,
  osteoporosis: true,
  seizure_disorder: true,
};
const BEERS_CATEGORIES: FindingCategory[] = ["beers_avoid", "beers_caution", "beers_condition", "beers_interaction", "beers_renal"];

/** SPEC §3 banned wording. The required disclaimer "No flag does not mean a medicine is safe" is exempt. */
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isIntAtLeast(v: unknown, min: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min;
}

/** Structural check of the case file; returns human-readable problems (empty = well-formed). */
function validateCaseFile(raw: unknown): string[] {
  const problems: string[] = [];
  if (!isRecord(raw)) return ["case file is not a JSON object"];
  for (const k of ["version", "author", "method", "disclaimer", "today"]) {
    if (!isNonEmptyString(raw[k])) problems.push(`top-level "${k}" missing`);
  }
  if (raw.today !== TODAY) problems.push(`top-level "today" must be ${TODAY} (runner date)`);
  if (typeof raw.disclaimer === "string" && !raw.disclaimer.includes(REQUIRED_DISCLAIMER)) {
    problems.push(`disclaimer must contain "${REQUIRED_DISCLAIMER}"`);
  }
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) return [...problems, "cases[] missing or empty"];
  const ids = new Set<string>();
  raw.cases.forEach((c: unknown, i: number) => {
    const at = isRecord(c) && isNonEmptyString(c.id) ? c.id : `cases[${i}]`;
    if (!isRecord(c)) return problems.push(`${at}: not an object`);
    if (!isNonEmptyString(c.id) || !/^mc-[a-z0-9-]+$/.test(c.id)) problems.push(`${at}: id must match ^mc-[a-z0-9-]+$`);
    if (ids.has(String(c.id))) problems.push(`${at}: duplicate id`);
    ids.add(String(c.id));
    if (!isNonEmptyString(c.title)) problems.push(`${at}: title missing`);
    if (!Array.isArray(c.covers) || c.covers.length === 0) problems.push(`${at}: covers[] missing`);
    const p = c.profile;
    if (!isRecord(p)) {
      problems.push(`${at}: profile missing`);
    } else {
      if (!isIntAtLeast(p.age, 0)) problems.push(`${at}: profile.age must be a non-negative integer`);
      if (!Array.isArray(p.conditions)) problems.push(`${at}: profile.conditions must be an array`);
      else for (const t of p.conditions) if (!(String(t) in CONDITIONS)) problems.push(`${at}: unknown ConditionTag "${String(t)}"`);
      if (p.crclMlMin !== null && !(typeof p.crclMlMin === "number" && p.crclMlMin > 0)) problems.push(`${at}: crclMlMin must be null or > 0`);
      if (p.sex !== undefined && p.sex !== null && !["female", "male", "other"].includes(String(p.sex))) problems.push(`${at}: bad sex`);
    }
    if (!Array.isArray(c.meds) || c.meds.length === 0) {
      problems.push(`${at}: meds[] missing`);
    } else {
      for (const m of c.meds) {
        if (!isRecord(m) || !isNonEmptyString(m.name)) { problems.push(`${at}: med without a name`); continue; }
        if (!isIntAtLeast(m.daysAgoStarted, 0)) problems.push(`${at}: ${m.name}: daysAgoStarted must be an integer >= 0`);
        if (m.daysAgoStopped !== undefined && !(isIntAtLeast(m.daysAgoStopped, 1) && Number(m.daysAgoStopped) < Number(m.daysAgoStarted))) {
          problems.push(`${at}: ${m.name}: daysAgoStopped must be >= 1 and after the start`);
        }
      }
    }
    const e = c.expect;
    if (!isRecord(e)) return problems.push(`${at}: expect missing`);
    let assertions = 0;
    for (const listKey of ["mustInclude", "mustNotInclude"]) {
      const list = e[listKey];
      if (!Array.isArray(list)) { problems.push(`${at}: expect.${listKey} must be an array`); continue; }
      assertions += list.length;
      list.forEach((x: unknown, j: number) => {
        const where = `${at}: ${listKey}[${j}]`;
        if (!isRecord(x)) return problems.push(`${where}: not an object`);
        if (!(String(x.category) in CATEGORIES)) problems.push(`${where}: unknown FindingCategory "${String(x.category)}"`);
        if (!Array.isArray(x.ingredients) || x.ingredients.some((g) => typeof g !== "string" || g !== g.toLowerCase() || g.trim() === "")) {
          problems.push(`${where}: ingredients must be lowercase strings`);
        }
        if (!isNonEmptyString(x.why)) problems.push(`${where}: why missing`);
        if (!isNonEmptyString(x.source)) problems.push(`${where}: source missing`);
        if (x.minMatches !== undefined && !isIntAtLeast(x.minMatches, 1)) problems.push(`${where}: minMatches must be an integer >= 1`);
        if (listKey === "mustNotInclude" && x.minMatches !== undefined) problems.push(`${where}: minMatches only applies to mustInclude`);
      });
    }
    const basis = isRecord(e.basis) ? e.basis : {};
    const scalar: [string, string][] = [
      ["acbTotalAtLeast", "acbTotal"],
      ["acbTotalExactly", "acbTotal"],
      ["fallRiskIngredientsInclude", "fallRisk"],
      ["fallRiskIngredientsExclude", "fallRisk"],
      ["unmatchedNames", "unmatched"],
      ["noFindings", "noFindings"],
      ["beersSuppressedNotice", "beersSuppressedNotice"],
      ["effectiveConditionsInclude", "effectiveConditions"],
      ["effectiveConditionsExclude", "effectiveConditions"],
    ];
    for (const [key, basisKey] of scalar) {
      if (e[key] === undefined) continue;
      assertions += 1;
      const b = basis[basisKey];
      if (!isRecord(b) || !isNonEmptyString(b.why) || !isNonEmptyString(b.source)) {
        problems.push(`${at}: expect.${key} needs expect.basis.${basisKey} with why and source`);
      }
    }
    for (const t of [...(Array.isArray(e.effectiveConditionsExclude) ? e.effectiveConditionsExclude : []),
      ...(Array.isArray(e.effectiveConditionsInclude) ? e.effectiveConditionsInclude.map((x) => (isRecord(x) ? x.tag : x)) : [])]) {
      if (!(String(t) in CONDITIONS)) problems.push(`${at}: unknown ConditionTag "${String(t)}" in effectiveConditions`);
    }
    if (assertions === 0) problems.push(`${at}: case asserts nothing`);
  });
  return problems;
}

/** Health-language rules (SPEC §3) apply to the case file too: it can be shown on the How-it-works page. */
function lintCaseFileWording(raw: unknown): string[] {
  const problems: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === "string") {
      const hits = bannedIn(v);
      if (hits.length) problems.push(`${path}: banned wording (${hits.join(", ")})`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (isRecord(v)) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(raw, "$");
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Engine loading (dynamic, so a missing module is a clear failure instead of a crash)

type MatchDrugFn = (input: string) => DrugMatch;
type ReviewFn = (input: { meds: Medication[]; profile: PatientProfile; checkIns: CheckIn[]; today: ISODate; signals?: Signal[] }) => MedReview;
interface Engine {
  matchDrug: MatchDrugFn;
  reviewMedications: ReviewFn;
}

/** First line of an error message, with the local checkout path removed (results are committed to the docs). */
function firstLine(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).split(REPO_ROOT).join("");
  return msg.split("\n")[0] ?? msg;
}

async function loadEngine(): Promise<{ engine: Engine | null; problems: string[] }> {
  const problems: string[] = [];
  let matchDrug: MatchDrugFn | null = null;
  let reviewMedications: ReviewFn | null = null;
  try {
    const mod: unknown = await import(/* @vite-ignore */ NORMALIZE_MODULE);
    const fn = isRecord(mod) ? mod.matchDrug : undefined;
    if (typeof fn === "function") matchDrug = fn as MatchDrugFn;
    else problems.push("src/kb/normalize.ts loaded but does not export matchDrug(input) (SPEC §10).");
  } catch (e) {
    problems.push(`src/kb/normalize.ts could not be loaded: ${firstLine(e)}`);
  }
  try {
    const mod: unknown = await import(/* @vite-ignore */ REVIEW_MODULE);
    const fn = isRecord(mod) ? mod.reviewMedications : undefined;
    if (typeof fn === "function") reviewMedications = fn as ReviewFn;
    else problems.push("src/engine/meds/review.ts loaded but does not export reviewMedications(input) (SPEC §10).");
  } catch (e) {
    problems.push(`src/engine/meds/review.ts could not be loaded: ${firstLine(e)}`);
  }
  return { engine: matchDrug && reviewMedications ? { matchDrug, reviewMedications } : null, problems };
}

function loadCaseFile(): { file: CaseFile | null; problems: string[]; wording: string[] } {
  try {
    const raw: unknown = JSON.parse(readFileSync(CASES_PATH, "utf8"));
    const problems = validateCaseFile(raw);
    // Wording problems are reported by the schema test but do not stop the cases from running.
    return { file: problems.length === 0 ? (raw as CaseFile) : null, problems, wording: lintCaseFileWording(raw) };
  } catch (e) {
    return { file: null, problems: [`could not read eval/med-cases.json: ${firstLine(e)}`], wording: [] };
  }
}

const LOADED = await loadEngine();
const CASE_FILE = loadCaseFile();
const CASES: EvalCase[] = CASE_FILE.file?.cases ?? [];

// ---------------------------------------------------------------------------------------------
// Building engine input from a case

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

interface NameResolution {
  name: string;
  medId: string;
  match: DrugMatch["match"] | "error";
  ingredientIds: string[];
  suggestion: string | null;
  normalized: string | null;
  usedAs: Medication["match"];
  error?: string;
}

interface BuiltCase {
  meds: Medication[];
  resolutions: NameResolution[];
  profile: PatientProfile;
  checkIns: CheckIn[];
}

function buildCase(c: EvalCase, matchDrug: MatchDrugFn): BuiltCase {
  const stamp = `${TODAY}T12:00:00.000Z`;
  const resolutions: NameResolution[] = [];
  const meds = c.meds.map((m, i): Medication => {
    const medId = `${c.id}:m${i + 1}`;
    let dm: DrugMatch | null = null;
    let error: string | undefined;
    try {
      dm = matchDrug(m.name);
    } catch (e) {
      error = firstLine(e);
    }
    let ingredientIds: string[] = [];
    let usedAs: Medication["match"] = "none";
    switch (dm?.match) {
      case "exact":
      case "brand":
      case "alias":
      case "combo":
        ingredientIds = [...dm.ingredientIds];
        usedAs = dm.match;
        break;
      case "fuzzy":
        // A suggestion is only used when the family confirmed it (case flag); otherwise it stays unmatched.
        if (m.confirmSuggestion && dm.ingredientIds.length > 0) {
          ingredientIds = [...dm.ingredientIds];
          usedAs = "fuzzy_confirmed";
        }
        break;
      default:
        break;
    }
    resolutions.push({
      name: m.name,
      medId,
      match: dm ? dm.match : "error",
      ingredientIds: dm ? [...dm.ingredientIds] : [],
      suggestion: dm ? dm.suggestion : null,
      normalized: dm ? dm.normalized : null,
      usedAs,
      ...(error ? { error } : {}),
    });
    return {
      id: medId,
      name: m.name,
      ingredientIds,
      match: usedAs,
      dose: "",
      frequency: "",
      asNeeded: false,
      otc: false,
      reason: m.reason ?? "",
      prescriber: "",
      startDate: addDays(TODAY, -m.daysAgoStarted),
      endDate: m.daysAgoStopped === undefined ? null : addDays(TODAY, -m.daysAgoStopped),
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
    const date = addDays(TODAY, -FALL_DAYS_AGO);
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
  return { meds, resolutions, profile, checkIns };
}

// ---------------------------------------------------------------------------------------------
// Evaluation

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
/** Token match: "trimethoprim" matches "sulfamethoxazole_trimethoprim"; "insulin" matches "insulin glargine". */
function ingredientMatches(actual: string, expected: string): boolean {
  return `_${norm(actual)}_`.includes(`_${norm(expected)}_`);
}

type ExpectationKind =
  | "mustInclude"
  | "mustNotInclude"
  | "acbTotalAtLeast"
  | "acbTotalExactly"
  | "fallRiskInclude"
  | "fallRiskExclude"
  | "unmatchedNames"
  | "noFindings"
  | "beersSuppressedNotice"
  | "effectiveConditionsInclude"
  | "effectiveConditionsExclude";

interface ExpectationResult {
  kind: ExpectationKind;
  label: string;
  category: FindingCategory | null;
  ingredients: string[];
  passed: boolean;
  /** "precondition" = an expected ingredient did not resolve from any of the case's names. */
  failure: "precondition" | "assertion" | null;
  detail: string;
  why: string | null;
  source: string | null;
}

interface FindingSummary {
  key: string;
  ruleId: string;
  category: string;
  title: string;
  meds: string[];
  ingredients: string[];
  sourceIds: string[];
}

interface CaseRun {
  id: string;
  title: string;
  covers: string[];
  passed: boolean;
  error: string | null;
  resolutions: NameResolution[];
  expectations: ExpectationResult[];
  invariants: string[];
  actual: {
    findings: FindingSummary[];
    acb: { total: number | null; band: string | null; contributors: string[] };
    fallRisk: string[];
    unmatched: string[];
    effectiveConditions: string[];
    notices: string[];
    kbVersion: string | null;
  } | null;
}

function summarizeFindings(findings: Finding[], medById: Map<string, Medication>): FindingSummary[] {
  return findings.map((f) => {
    const meds = (Array.isArray(f.medIds) ? f.medIds : []).map((id) => medById.get(id));
    return {
      key: String(f.key),
      ruleId: String(f.ruleId),
      category: String(f.category),
      title: String(f.title),
      meds: meds.map((m, i) => m?.name ?? `unknown med id ${String(f.medIds[i])}`),
      ingredients: [...new Set(meds.flatMap((m) => m?.ingredientIds ?? []))].sort(),
      sourceIds: Array.isArray(f.sourceIds) ? f.sourceIds.map(String) : [],
    };
  });
}

function describeFinding(f: FindingSummary): string {
  return `${f.category} "${f.title}" (rule ${f.ruleId}) on ${f.meds.join(" + ")} [${f.ingredients.join(", ")}]`;
}

function evaluateCase(c: EvalCase, engine: Engine): CaseRun {
  const built = buildCase(c, engine.matchDrug);
  const run: CaseRun = {
    id: c.id,
    title: c.title,
    covers: c.covers,
    passed: false,
    error: null,
    resolutions: built.resolutions,
    expectations: [],
    invariants: [],
    actual: null,
  };
  let review: MedReview;
  const input = { meds: built.meds, profile: built.profile, checkIns: built.checkIns, today: TODAY };
  try {
    review = engine.reviewMedications(input);
  } catch (e) {
    const stack = e instanceof Error ? (e.stack ?? e.message) : String(e);
    run.error = `reviewMedications threw: ${stack.split(REPO_ROOT).join("").split("\n").slice(0, 4).join(" | ")}`;
    return run;
  }

  const medById = new Map(built.meds.map((m) => [m.id, m] as const));
  const findings: Finding[] = Array.isArray(review?.findings) ? review.findings : [];
  if (!Array.isArray(review?.findings)) run.invariants.push("review.findings is not an array");
  const summaries = summarizeFindings(findings, medById);
  const fallRiskIds: string[] = Array.isArray(review?.fallRiskMedIds) ? review.fallRiskMedIds : [];
  const unmatchedIds: string[] = Array.isArray(review?.unmatchedMedIds) ? review.unmatchedMedIds : [];
  const effective = Array.isArray(review?.effectiveConditions) ? review.effectiveConditions : [];
  const notices: string[] = Array.isArray(review?.notices) ? review.notices.map(String) : [];
  const acbTotal = typeof review?.acb?.total === "number" ? review.acb.total : null;

  run.actual = {
    findings: summaries,
    acb: {
      total: acbTotal,
      band: review?.acb?.band ?? null,
      contributors: (Array.isArray(review?.acb?.contributors) ? review.acb.contributors : []).map((x) => `${String(x?.ingredientId)} ${String(x?.score)}`),
    },
    fallRisk: fallRiskIds.map((id) => medById.get(id)?.name ?? `unknown med id ${id}`),
    unmatched: unmatchedIds.map((id) => medById.get(id)?.name ?? `unknown med id ${id}`),
    effectiveConditions: effective.map((x) => `${x.tag} (${x.from})`),
    notices,
    kbVersion: typeof review?.kbVersion === "string" ? review.kbVersion : null,
  };

  // Ingredients that any of the case's names resolved to (used for the non-vacuity precondition).
  const resolvedIngredients = [...new Set(built.meds.flatMap((m) => m.ingredientIds))];
  const unresolved = (wanted: string[]): string[] => wanted.filter((w) => !resolvedIngredients.some((a) => ingredientMatches(a, w)));
  const resolutionText = built.resolutions
    .map((r) => `${r.name} -> ${r.match}${r.ingredientIds.length ? ` [${r.ingredientIds.join(", ")}]` : ""}${r.suggestion ? ` (suggestion ${r.suggestion})` : ""}${r.error ? ` (threw: ${r.error})` : ""}`)
    .join("; ");
  const leftUnmatched = built.resolutions
    .filter((r) => r.usedAs === "none")
    .map((r) => `${r.name} -> ${r.match}${r.suggestion ? ` (suggestion ${r.suggestion})` : ""}${r.error ? ` (threw: ${r.error})` : ""}`);
  const preconditionFail = (missing: string[]): string =>
    `precondition: no medication name in this case resolved to ${missing.map((m) => `"${m}"`).join(", ")} via matchDrug; ` +
    (leftUnmatched.length ? `names left unmatched: ${leftUnmatched.join("; ")}` : `resolutions: ${resolutionText}`);

  const push = (r: Omit<ExpectationResult, "failure"> & { failure?: ExpectationResult["failure"] }): void => {
    run.expectations.push({ ...r, failure: r.passed ? null : (r.failure ?? "assertion") });
  };
  const basis = (key: string): { why: string | null; source: string | null } => ({
    why: c.expect.basis?.[key]?.why ?? null,
    source: c.expect.basis?.[key]?.source ?? null,
  });

  const findingMatches = (exp: CaseExpectation): FindingSummary[] =>
    summaries.filter((f) => f.category === exp.category && exp.ingredients.every((w) => f.ingredients.some((a) => ingredientMatches(a, w))));
  const sameCategory = (cat: FindingCategory): string => {
    const xs = summaries.filter((f) => f.category === cat);
    return xs.length ? xs.map(describeFinding).join(" | ") : `no ${cat} findings at all`;
  };

  for (const exp of c.expect.mustInclude) {
    const label = `mustInclude ${exp.category} [${exp.ingredients.join(", ")}]${exp.minMatches ? ` x${exp.minMatches}` : ""}`;
    const missing = unresolved(exp.ingredients);
    if (missing.length) {
      push({ kind: "mustInclude", label, category: exp.category, ingredients: exp.ingredients, passed: false, failure: "precondition", detail: preconditionFail(missing), why: exp.why, source: exp.source });
      continue;
    }
    const hits = findingMatches(exp);
    const need = exp.minMatches ?? 1;
    const passed = hits.length >= need;
    push({
      kind: "mustInclude",
      label,
      category: exp.category,
      ingredients: exp.ingredients,
      passed,
      detail: passed
        ? hits.map(describeFinding).join(" | ")
        : `expected ${need} ${exp.category} finding(s) involving all of [${exp.ingredients.join(", ")}], found ${hits.length}. Present: ${sameCategory(exp.category)}`,
      why: exp.why,
      source: exp.source,
    });
  }

  for (const exp of c.expect.mustNotInclude) {
    const label = `mustNotInclude ${exp.category} [${exp.ingredients.length ? exp.ingredients.join(", ") : "any"}]`;
    const missing = unresolved(exp.ingredients);
    if (missing.length) {
      push({ kind: "mustNotInclude", label, category: exp.category, ingredients: exp.ingredients, passed: false, failure: "precondition", detail: preconditionFail(missing), why: exp.why, source: exp.source });
      continue;
    }
    const hits = findingMatches(exp);
    push({
      kind: "mustNotInclude",
      label,
      category: exp.category,
      ingredients: exp.ingredients,
      passed: hits.length === 0,
      detail: hits.length === 0 ? "none present" : `unexpected: ${hits.map(describeFinding).join(" | ")}`,
      why: exp.why,
      source: exp.source,
    });
  }

  const e = c.expect;
  if (e.acbTotalExactly !== undefined) {
    push({ kind: "acbTotalExactly", label: `ACB total = ${e.acbTotalExactly}`, category: null, ingredients: [], passed: acbTotal === e.acbTotalExactly, detail: `actual ${String(acbTotal)} (contributors: ${run.actual.acb.contributors.join(", ") || "none"})`, ...basis("acbTotal") });
  }
  if (e.acbTotalAtLeast !== undefined) {
    push({ kind: "acbTotalAtLeast", label: `ACB total >= ${e.acbTotalAtLeast}`, category: null, ingredients: [], passed: acbTotal !== null && acbTotal >= e.acbTotalAtLeast, detail: `actual ${String(acbTotal)} (contributors: ${run.actual.acb.contributors.join(", ") || "none"})`, ...basis("acbTotal") });
  }
  const fallIngredients = [...new Set(fallRiskIds.flatMap((id) => medById.get(id)?.ingredientIds ?? []))];
  if (e.fallRiskIngredientsInclude) {
    const missingResolve = unresolved(e.fallRiskIngredientsInclude);
    const missing = e.fallRiskIngredientsInclude.filter((w) => !fallIngredients.some((a) => ingredientMatches(a, w)));
    push({
      kind: "fallRiskInclude",
      label: `fallRiskMedIds include [${e.fallRiskIngredientsInclude.join(", ")}]`,
      category: null,
      ingredients: e.fallRiskIngredientsInclude,
      passed: missing.length === 0,
      failure: missingResolve.length ? "precondition" : "assertion",
      detail: missingResolve.length ? preconditionFail(missingResolve) : missing.length ? `missing [${missing.join(", ")}]; actual fall-risk meds: ${run.actual.fallRisk.join(", ") || "none"}` : `actual: ${run.actual.fallRisk.join(", ")}`,
      ...basis("fallRisk"),
    });
  }
  if (e.fallRiskIngredientsExclude) {
    const missingResolve = unresolved(e.fallRiskIngredientsExclude);
    const present = e.fallRiskIngredientsExclude.filter((w) => fallIngredients.some((a) => ingredientMatches(a, w)));
    push({
      kind: "fallRiskExclude",
      label: `fallRiskMedIds exclude [${e.fallRiskIngredientsExclude.join(", ")}]`,
      category: null,
      ingredients: e.fallRiskIngredientsExclude,
      passed: missingResolve.length === 0 && present.length === 0,
      failure: missingResolve.length ? "precondition" : "assertion",
      detail: missingResolve.length ? preconditionFail(missingResolve) : present.length ? `unexpected [${present.join(", ")}]; actual fall-risk meds: ${run.actual.fallRisk.join(", ")}` : `actual: ${run.actual.fallRisk.join(", ") || "none"}`,
      ...basis("fallRisk"),
    });
  }
  if (e.unmatchedNames) {
    const missing = e.unmatchedNames.filter((name) => {
      const ids = built.meds.filter((m) => m.name === name).map((m) => m.id);
      return ids.length === 0 || !ids.every((id) => unmatchedIds.includes(id));
    });
    push({ kind: "unmatchedNames", label: `unmatched: ${e.unmatchedNames.join(", ")}`, category: null, ingredients: [], passed: missing.length === 0, detail: missing.length ? `not reported as unmatched: ${missing.join(", ")}; unmatchedMedIds -> ${run.actual.unmatched.join(", ") || "none"}; ${resolutionText}` : "all reported", ...basis("unmatched") });
  }
  if (e.noFindings) {
    push({ kind: "noFindings", label: "no findings", category: null, ingredients: [], passed: summaries.length === 0, detail: summaries.length ? `unexpected: ${summaries.map(describeFinding).join(" | ")}` : "none", ...basis("noFindings") });
  }
  if (e.beersSuppressedNotice) {
    const ok = notices.some((n) => /beers/i.test(n));
    push({ kind: "beersSuppressedNotice", label: "notice explains Beers suppression", category: null, ingredients: [], passed: ok, detail: ok ? notices.join(" | ") : `notices: ${notices.join(" | ") || "none"}`, ...basis("beersSuppressedNotice") });
  }
  for (const want of e.effectiveConditionsInclude ?? []) {
    const ok = effective.some((x) => x.tag === want.tag && x.from === want.from);
    push({ kind: "effectiveConditionsInclude", label: `effectiveConditions include ${want.tag} (${want.from})`, category: null, ingredients: [], passed: ok, detail: `actual: ${run.actual.effectiveConditions.join(", ") || "none"}`, ...basis("effectiveConditions") });
  }
  for (const tag of e.effectiveConditionsExclude ?? []) {
    const ok = !effective.some((x) => x.tag === tag);
    push({ kind: "effectiveConditionsExclude", label: `effectiveConditions exclude ${tag}`, category: null, ingredients: [], passed: ok, detail: `actual: ${run.actual.effectiveConditions.join(", ") || "none"}`, ...basis("effectiveConditions") });
  }

  run.invariants.push(...checkInvariants(findings, review, built, engine, input));
  run.passed = run.error === null && run.expectations.every((x) => x.passed);
  return run;
}

/** Integrity and language checks that every review must satisfy, whatever the case. */
function checkInvariants(findings: Finding[], review: MedReview, built: BuiltCase, engine: Engine, input: Parameters<ReviewFn>[0]): string[] {
  const out: string[] = [];
  const medById = new Map(built.meds.map((m) => [m.id, m] as const));
  const isActive = (m: Medication): boolean => m.endDate === null || m.endDate >= TODAY;
  const keys = new Set<string>();
  for (const f of findings) {
    const tag = `finding ${String(f.key)} (${String(f.category)})`;
    if (!(String(f.category) in CATEGORIES)) out.push(`${tag}: unknown category`);
    if (keys.has(String(f.key))) out.push(`${tag}: duplicate key`);
    keys.add(String(f.key));
    if (!Array.isArray(f.medIds) || f.medIds.length === 0) out.push(`${tag}: no medIds`);
    for (const id of Array.isArray(f.medIds) ? f.medIds : []) {
      const m = medById.get(id);
      if (!m) out.push(`${tag}: medId ${id} is not in the input`);
      else if (m.ingredientIds.length === 0) out.push(`${tag}: involves unmatched medication "${m.name}"`);
      else if (!isActive(m)) out.push(`${tag}: involves stopped medication "${m.name}"`);
    }
    if (!Array.isArray(f.sourceIds) || f.sourceIds.length === 0) out.push(`${tag}: no sourceIds`);
    for (const field of ["title", "plain", "clinician", "question"] as const) {
      const text = f[field];
      if (!isNonEmptyString(text)) out.push(`${tag}: empty ${field}`);
      else {
        const hits = bannedIn(text);
        if (hits.length) out.push(`${tag}: ${field} uses banned wording (${hits.join(", ")}): "${text}"`);
      }
    }
  }
  for (const id of Array.isArray(review?.fallRiskMedIds) ? review.fallRiskMedIds : []) {
    const m = medById.get(id);
    if (!m) out.push(`fallRiskMedIds: ${id} is not in the input`);
    else if (!isActive(m)) out.push(`fallRiskMedIds: stopped medication "${m.name}"`);
  }
  for (const m of built.meds) {
    if (m.ingredientIds.length === 0 && isActive(m) && !(review?.unmatchedMedIds ?? []).includes(m.id)) {
      out.push(`unmatchedMedIds: "${m.name}" has no ingredients but is not reported as unmatched`);
    }
  }
  const acb = review?.acb;
  if (!acb || typeof acb.total !== "number") out.push("acb.total missing");
  else if (Array.isArray(acb.contributors)) {
    const sum = acb.contributors.reduce((s, x) => s + (typeof x.score === "number" ? x.score : 0), 0);
    if (sum !== acb.total) out.push(`acb.total ${acb.total} differs from the sum of contributor scores ${sum}`);
  }
  for (const n of Array.isArray(review?.notices) ? review.notices : []) {
    const hits = bannedIn(String(n));
    if (hits.length) out.push(`notice uses banned wording (${hits.join(", ")}): "${String(n)}"`);
  }
  try {
    const again = engine.reviewMedications(input);
    if (JSON.stringify(again) !== JSON.stringify(review)) out.push("not deterministic: a second run on the same input gave a different MedReview");
  } catch (e) {
    out.push(`second run threw: ${firstLine(e)}`);
  }
  return out;
}

function formatFailure(r: CaseRun): string {
  const lines = [`[${r.id}] ${r.title}`];
  if (r.error) lines.push(`  ERROR ${r.error}`);
  const failed = r.expectations.filter((x) => !x.passed);
  if (failed.length) lines.push(`  ${failed.length} of ${r.expectations.length} expectations failed:`);
  for (const x of failed) {
    lines.push(`  - ${x.label}${x.failure === "precondition" ? " [precondition]" : ""}`);
    lines.push(`      ${x.detail}`);
    if (x.why) lines.push(`      why: ${x.why}`);
    if (x.source) lines.push(`      source: ${x.source}`);
  }
  lines.push("  names: " + r.resolutions.map((n) => `${n.name} -> ${n.usedAs}${n.ingredientIds.length ? ` [${n.ingredientIds.join(", ")}]` : ""}`).join("; "));
  if (r.actual) {
    lines.push(`  actual findings (${r.actual.findings.length}):`);
    for (const f of r.actual.findings) lines.push(`    ${describeFinding(f)}`);
    lines.push(`  ACB total ${String(r.actual.acb.total)}; fall-risk: ${r.actual.fallRisk.join(", ") || "none"}; unmatched: ${r.actual.unmatched.join(", ") || "none"}`);
    lines.push(`  effective conditions: ${r.actual.effectiveConditions.join(", ") || "none"}; notices: ${r.actual.notices.join(" | ") || "none"}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Results file (eval/results/meds-eval.json)

const RUNS = new Map<string, CaseRun>();
function getRun(c: EvalCase, engine: Engine): CaseRun {
  let r = RUNS.get(c.id);
  if (!r) {
    r = evaluateCase(c, engine);
    RUNS.set(c.id, r);
  }
  return r;
}

function tally(results: ExpectationResult[]): { total: number; passed: number } {
  return { total: results.length, passed: results.filter((x) => x.passed).length };
}

function writeResults(): void {
  const runs = CASES.map((c) => RUNS.get(c.id)).filter((r): r is CaseRun => r !== undefined);
  const all = runs.flatMap((r) => r.expectations);
  const byKind: Record<string, { total: number; passed: number }> = {};
  for (const k of new Set(all.map((x) => x.kind))) byKind[k] = tally(all.filter((x) => x.kind === k));
  const byCategory: Record<string, { mustInclude: { total: number; passed: number }; mustNotInclude: { total: number; passed: number } }> = {};
  for (const cat of Object.keys(CATEGORIES)) {
    const inc = all.filter((x) => x.kind === "mustInclude" && x.category === cat);
    const exc = all.filter((x) => x.kind === "mustNotInclude" && x.category === cat);
    if (inc.length || exc.length) byCategory[cat] = { mustInclude: tally(inc), mustNotInclude: tally(exc) };
  }
  const status = !CASE_FILE.file ? "case_file_invalid" : !LOADED.engine ? "engine_unavailable" : runs.length < CASES.length ? "partial" : "complete";
  const report = {
    suite: "Kinwise medication-review evaluation (independent cases, eval/med-cases.json)",
    status,
    problems: [...CASE_FILE.problems, ...CASE_FILE.wording, ...LOADED.problems],
    caseFileVersion: CASE_FILE.file?.version ?? null,
    today: TODAY,
    ranAt: new Date().toISOString(),
    kbVersion: runs.find((r) => r.actual?.kbVersion)?.actual?.kbVersion ?? null,
    disclaimer: CASE_FILE.file?.disclaimer ?? null,
    summary: {
      cases: CASES.length,
      casesRun: runs.length,
      casesPassed: runs.filter((r) => r.passed).length,
      expectations: all.length,
      expectationsPassed: all.filter((x) => x.passed).length,
      preconditionFailures: all.filter((x) => x.failure === "precondition").length,
      invariantViolations: runs.reduce((s, r) => s + r.invariants.length, 0),
      byKind,
      byCategory,
    },
    cases: CASES.map((c) => {
      const r = RUNS.get(c.id);
      if (!r) return { id: c.id, title: c.title, covers: c.covers, status: "not_run" };
      return {
        id: r.id,
        title: r.title,
        covers: r.covers,
        status: r.passed ? "pass" : "fail",
        error: r.error,
        names: r.resolutions.map((n) => ({ name: n.name, match: n.match, usedAs: n.usedAs, ingredientIds: n.ingredientIds, suggestion: n.suggestion })),
        expectations: r.expectations.map((x) => ({ label: x.label, passed: x.passed, failure: x.failure, detail: x.detail, why: x.why, source: x.source })),
        invariants: r.invariants,
        actual: r.actual,
      };
    }),
  };
  writeResultsIfChanged(RESULTS_PATH, report);
  const s = report.summary;
  console.log(
    `Kinwise med eval (${status}): ${s.casesPassed}/${s.cases} cases, ${s.expectationsPassed}/${s.expectations} expectations passed` +
      (s.preconditionFailures ? `, ${s.preconditionFailures} precondition failures` : "") +
      (s.invariantViolations ? `, ${s.invariantViolations} invariant violations` : "") +
      ` -> ${RESULTS_PATH.split(REPO_ROOT).join("")}`,
  );
}

// ---------------------------------------------------------------------------------------------
// Tests

describe("Kinwise medication review: independent clinical cases (eval/med-cases.json)", () => {
  afterAll(writeResults);

  it("case file is well-formed and every expectation has a reason and a source", () => {
    expect(CASE_FILE.problems, CASE_FILE.problems.join("\n")).toEqual([]);
    expect(CASES.length).toBeGreaterThanOrEqual(45);
  });

  it("case file wording follows the SPEC §3 health-language rules", () => {
    expect(CASE_FILE.wording, CASE_FILE.wording.join("\n")).toEqual([]);
  });

  it("engine modules load (SPEC §10: matchDrug in src/kb/normalize.ts, reviewMedications in src/engine/meds/review.ts)", () => {
    expect(LOADED.problems, `Cannot run the evaluation yet:\n${LOADED.problems.join("\n")}`).toEqual([]);
  });

  describe.skipIf(!LOADED.engine || !CASE_FILE.file)("cases", () => {
    for (const c of CASES) {
      it(`${c.id}: ${c.title}`, () => {
        const r = getRun(c, LOADED.engine as Engine);
        expect(r.passed, formatFailure(r)).toBe(true);
      });
    }

    it("every review keeps integrity and language invariants (ids, active meds only, sources, SPEC §3 wording, determinism)", () => {
      const violations = CASES.flatMap((c) => getRun(c, LOADED.engine as Engine).invariants.map((v) => `[${c.id}] ${v}`));
      expect(violations, violations.join("\n")).toEqual([]);
    });

    it("no Beers finding is produced for anyone under 65 in any case", () => {
      const offenders = CASES.filter((c) => c.profile.age < 65).flatMap((c) =>
        (getRun(c, LOADED.engine as Engine).actual?.findings ?? [])
          .filter((f) => (BEERS_CATEGORIES as string[]).includes(f.category))
          .map((f) => `[${c.id}] ${describeFinding(f)}`),
      );
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  });
});
