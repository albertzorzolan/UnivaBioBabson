// Clinical-criteria evaluation of the Kinwise medication-review engine (docs/SPEC.md §6.2, §9), on a separately
// written case file (an AI agent directed by the team, not the engine author; not clinician-reviewed).
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
// The case runner itself (case-file schema, engine loading, expectation checks) is in eval/medsRunner.ts.

import { afterAll, describe, expect, it } from "vitest";
import { writeResultsIfChanged } from "./writeResults";
import { fileURLToPath } from "node:url";
import {
  BEERS_CATEGORIES,
  CATEGORIES,
  PRODUCTION_NORMALIZE_MODULE,
  PRODUCTION_REVIEW_MODULE,
  REPO_ROOT,
  TODAY,
  describeFinding,
  evaluateCase,
  formatFailure,
  loadCaseFile,
  loadEngine,
  type CaseRun,
  type Engine,
  type EvalCase,
  type ExpectationResult,
} from "./medsRunner";

// KINWISE_MED_EVAL_RESULTS / _NORMALIZE / _REVIEW exist only to test this runner against a stub engine;
// normal runs use the real modules and write the docs results file. The documented ablations
// (eval/ablations/*.ts) run through eval/meds.ablation.test.ts instead.
const RESULTS_PATH = process.env.KINWISE_MED_EVAL_RESULTS ?? fileURLToPath(new URL("./results/meds-eval.json", import.meta.url));
const NORMALIZE_MODULE = process.env.KINWISE_MED_EVAL_NORMALIZE ?? PRODUCTION_NORMALIZE_MODULE;
const REVIEW_MODULE = process.env.KINWISE_MED_EVAL_REVIEW ?? PRODUCTION_REVIEW_MODULE;

const LOADED = await loadEngine(NORMALIZE_MODULE, REVIEW_MODULE);
const CASE_FILE = loadCaseFile();
const CASES: EvalCase[] = CASE_FILE.file?.cases ?? [];

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
    // Label kept as committed so the results file is not rewritten; the cases are separately written, see the header.
    suite: "Kinwise medication-review evaluation (separately written cases, eval/med-cases.json)",
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

describe("Kinwise medication review: separately written clinical cases (eval/med-cases.json)", () => {
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
