// Every number the submission PDFs print, read from files in the repo at build time. One exception, marked below:
// ai.liveSlipped is a hand count of the flawed outputs listed in the free-text "verdict" of eval/results/ai-live.json.
//   eval/results/nlp-eval.json, meds-eval.json, ai-live.json, llm-smoke.json   (evaluation results)
//   src/kb/data/meta.json                                                      (knowledge-base coverage)
//   docs/samples/kinwise-fhir-bundle.json + kinwise-fhir-validation.json      (HAPI FHIR R4 $validate)
//   vitest JSON report (run by make-pdfs.mjs) or SKIP_VITEST=1 → counts from the last run, if any
//   scripts/browser-test.mjs (check ids) + test-results/{e2e,a11y} (last run results, gitignored)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BUILD_DIR, ROOT, ensureDir, readJson, readJsonIfExists } from "./lib.mjs";

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const dec = (x, d = 3) => x.toFixed(d);
// Rounds down, so a headline score is never shown higher than measured (dev F1 0.9985 → "0.998", as in README/EVALUATION).
const floorDec = (x, d = 3) => (Math.floor(x * 10 ** d + 1e-9) / 10 ** d).toFixed(d);

// The full suite includes eval/nlp.eval.test.ts and eval/meds.eval.test.ts, which rewrite these result files
// (timestamps, latency) on every run. The PDF build only counts tests, so it restores them byte for byte afterwards.
const EVAL_OUTPUTS = ["eval/results/nlp-eval.json", "eval/results/meds-eval.json"];

function runVitest() {
  const out = join(ensureDir(BUILD_DIR), "vitest-report.json");
  if (process.env.SKIP_VITEST !== "1") {
    const saved = EVAL_OUTPUTS.map((rel) => [join(ROOT, rel), existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel)) : null]);
    try {
      execFileSync(process.execPath, [join(ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "--reporter=json", `--outputFile=${out}`], {
        cwd: ROOT,
        stdio: ["ignore", "ignore", "inherit"],
        timeout: 300000,
      });
    } catch (e) {
      // A failing suite still writes the report; the counts below then show the failures.
      if (!existsSync(out)) throw e;
    } finally {
      for (const [path, bytes] of saved) if (bytes) writeFileSync(path, bytes);
    }
  }
  if (!existsSync(out)) return null;
  const r = JSON.parse(readFileSync(out, "utf8"));
  return {
    files: r.numTotalTestSuites != null ? r.testResults.length : null,
    total: r.numTotalTests,
    passed: r.numPassedTests,
    failed: r.numFailedTests,
    skipped: (r.numPendingTests ?? 0) + (r.numTodoTests ?? 0),
  };
}

export function collectFacts() {
  const nlp = readJson("eval/results/nlp-eval.json");
  const meds = readJson("eval/results/meds-eval.json");
  const live = readJson("eval/results/ai-live.json");
  const smoke = readJson("eval/results/llm-smoke.json");
  const meta = readJson("src/kb/data/meta.json");
  const bundle = readJson("docs/samples/kinwise-fhir-bundle.json");
  const validation = readJson("docs/samples/kinwise-fhir-validation.json");

  const ho = nlp.heldout;
  const dev = nlp.dev;
  const sev = (s) => validation.issue.filter((i) => i.severity === s).length;
  const smoke3b = smoke.models.find((m) => /Qwen2\.5-3B/.test(m.model));

  const e2eSrc = readFileSync(join(ROOT, "scripts", "browser-test.mjs"), "utf8");
  const e2eChecks = (e2eSrc.match(/^\s*id: "[a-z0-9-]+",$/gm) ?? []).length;
  const e2eLast = readJsonIfExists("test-results/e2e/results.json");
  const a11yLast = readJsonIfExists("test-results/a11y/report.json");

  const vitest = runVitest();

  return {
    nlp: {
      heldoutCases: ho.cases,
      heldoutSupport: ho.micro.support,
      heldoutF1: floorDec(ho.micro.f1),
      heldoutF1Pct: pct(ho.micro.f1),
      // From the raw counts: the stored 4-decimal values would round twice (0.9725 → "0.973"; 106/109 = 0.97248).
      heldoutP: dec(ho.micro.tp / (ho.micro.tp + ho.micro.fp)),
      heldoutR: dec(ho.micro.tp / (ho.micro.tp + ho.micro.fn)),
      heldoutNeg: `${ho.negation.correct} of ${ho.negation.goldNegatives}`,
      devCases: dev.cases,
      devF1: floorDec(dev.micro.f1),
      meanMs: dev.latency.meanMs,
    },
    meds: {
      cases: `${meds.summary.casesPassed} of ${meds.summary.cases}`,
      expectations: `${meds.summary.expectationsPassed} of ${meds.summary.expectations}`,
      casesPassed: meds.summary.casesPassed,
      casesTotal: meds.summary.cases,
      kbVersion: meds.kbVersion,
    },
    kb: { ...meta.counts, version: meta.version },
    fhir: {
      resources: bundle.entry.length,
      errors: sev("error") + sev("fatal"),
      warnings: sev("warning"),
      info: sev("information"),
    },
    ai: {
      model: "Qwen2.5-3B-Instruct (q4f16)",
      machine: live.machine.cpu,
      externalRequests: live.externalRequests.length,
      cachedLoadS: (live.load.cachedLoadMs / 1000).toFixed(1),
      briefS: (live.brief.wallMs / 1000).toFixed(1),
      askS: (() => {
        // Answers the model actually wrote (aiStatus "done"); the others were answered by the rules alone.
        const ms = live.ask.filter((a) => a.aiStatus === "done").map((a) => a.wallMs);
        return ms.length ? `${(Math.min(...ms) / 1000).toFixed(0)}–${(Math.max(...ms) / 1000).toFixed(0)}` : null;
      })(),
      smokeBrief: smoke3b ? `${smoke3b.summary.brief.sentencesKept} of ${smoke3b.summary.brief.sentencesKept + smoke3b.summary.brief.sentencesDropped}` : null,
      smokeExplainDropped: smoke3b ? `${smoke3b.summary.explain.sentencesDropped} of ${smoke3b.summary.explain.sentencesKept + smoke3b.summary.explain.sentencesDropped}` : null,
      smokeRefineDropped: smoke3b ? `${smoke3b.summary.refine.sentencesDropped} of ${smoke3b.summary.refine.sentencesKept + smoke3b.summary.refine.sentencesDropped}` : null,
      // HAND COUNT (the one number not computed): eval/results/ai-live.json "verdict" lists three flawed AI outputs the
      // checker let through: a garbled reason sentence, a "can cause" explanation, a diary suggestion quoted from the
      // wrong sentence. The check below fails the build if that verdict text changes, so this cannot silently drift.
      liveSlipped: (() => {
        const v = String(live.verdict ?? "");
        const listed = [/garbled/i, /Slept like a log/i, /can cause/i].filter((re) => re.test(v)).length;
        if (listed !== 3) throw new Error(`facts: ai-live.json verdict changed; recount liveSlipped by hand (matched ${listed} of 3)`);
        return 3;
      })(),
    },
    tests: {
      vitest,
      e2eChecks,
      e2ePassed: e2eLast ? e2eLast.results.filter((r) => r.ok).length : null,
      e2eRanAt: e2eLast?.ranAt ?? null,
      a11yScans: a11yLast ? a11yLast.report.length : null,
      a11yViolations: a11yLast ? a11yLast.report.reduce((n, r) => n + r.violations.length, 0) : null,
      a11yRanAt: a11yLast?.ranAt ?? null,
    },
  };
}
