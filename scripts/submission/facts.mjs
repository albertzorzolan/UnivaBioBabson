// Every number the submission PDFs print, read from files in the repo at build time. One exception, marked below:
// ai.liveSlipped is a hand count of the flawed outputs listed in the free-text "verdict" of eval/results/ai-live.json.
//   eval/results/nlp-eval.json, meds-eval.json, ai-live.json, llm-smoke.json   (evaluation results)
//   eval/results/meds-ablation.json, verifier-redteam.json, timeline-null.json (optional; each fact is null if absent)
//   src/kb/data/meta.json                                                      (knowledge-base coverage)
//   docs/samples/kinwise-fhir-bundle.json + kinwise-fhir-validation.json      (HAPI FHIR R4 $validate)
//   vitest JSON report (run by make-pdfs.mjs) or SKIP_VITEST=1 → counts from the last run, if any
//   scripts/browser-test.mjs (check ids) + test-results/{e2e,a11y} (last run results, gitignored)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BUILD_DIR, ROOT, ensureDir, readJson, readJsonIfExists } from "./lib.mjs";

// Same formatting as the app's How it works page (src/views/public/HowItWorks.tsx `pct`): percent, one decimal, so a
// score printed in a PDF reads exactly as the live page shows it (held-out micro-F1 0.9422 → "94.2%").
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const dec = (x, d = 3) => x.toFixed(d);
// Rounds down, so a headline score is never shown higher than measured (dev F1 0.9985 → "0.998", as in README/EVALUATION).
const floorDec = (x, d = 3) => (Math.floor(x * 10 ** d + 1e-9) / 10 ** d).toFixed(d);
// The same rule as a percent (dev F1 0.9985 → "99.8%", matching README's 0.998). Used for the dev score only: the How it
// works page rounds it to "99.9%", but the PDFs and check-facts follow the never-higher-than-measured rule. The held-out
// score keeps `pct`, so the one-pager matches the live page exactly (0.9422 → "94.2%" either way).
const floorPct = (x, d = 1) => `${floorDec(x * 100, d)}%`;

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

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const isCount = (x) => Number.isInteger(x) && x >= 0;
/** A [lo, hi] pair of fractions → "91.0–97.3%" (one decimal, as pct), or null if it is not a valid interval. */
const ciPct = (ci) =>
  Array.isArray(ci) && ci.length === 2 && isNum(ci[0]) && isNum(ci[1]) && ci[0] <= ci[1]
    ? `${(ci[0] * 100).toFixed(1)}–${(ci[1] * 100).toFixed(1)}%`
    : null;
/** A rate stored as a fraction (0–1) → "4.2%"; null for anything else, so a malformed file prints nothing. */
const ratePct = (x) => (isNum(x) && x >= 0 && x <= 1 ? pct(x) : null);

/** Optional result files are written by other eval scripts; a missing or half-written file must not break the build. */
function readOptional(rel) {
  try {
    return readJsonIfExists(rel);
  } catch (e) {
    console.warn(`facts: ignoring ${rel} (${e.message})`);
    return null;
  }
}

/**
 * Comparison points from the optional evaluation files. Pure (objects in, strings and numbers out) so it can be tested
 * without the files. Every field is null when its source is missing or malformed, and the one-pager then leaves that
 * bullet out instead of printing a guess.
 *   nlp          eval/results/nlp-eval.json      heldout.baseline.micro.f1, heldout.ci95.f1, heldout.baselineCi95.f1
 *   ablation     eval/results/meds-ablation.json runs[] { name, passed, total }
 *   redteam      eval/results/verifier-redteam.json { harmfulTotal, caught, validTotal, falseRejects, liveEscapes,
 *                before: { harmfulTotal, caught }, postFixProbe: { total, caught, heldOut },
 *                postFixProbe2: { total, caught, validTotal, falseRejects } }
 *   timelineNull eval/results/timeline-null.json { independent, clustered } × { moderateRate, strongRate, n, stay }
 */
export function optionalEvidence({ nlp = null, ablation = null, redteam = null, timelineNull = null } = {}) {
  const ho = nlp?.heldout ?? null;
  const baseF1 = ho?.baseline?.micro?.f1;

  // Ablations: engines with one piece of knowledge removed. Only runs that fail some cases show the suite can fail.
  const runs = Array.isArray(ablation?.runs)
    ? ablation.runs.filter((r) => r && typeof r.name === "string" && isCount(r.passed) && isCount(r.total) && r.total > 0 && r.passed <= r.total)
    : [];
  const failing = runs.filter((r) => r.passed < r.total);
  const sameTotal = failing.length > 0 && failing.every((r) => r.total === failing[0].total);

  let rt = null;
  if (redteam && isCount(redteam.harmfulTotal) && isCount(redteam.caught) && redteam.harmfulTotal > 0 && redteam.caught <= redteam.harmfulTotal) {
    const valid = isCount(redteam.validTotal) && redteam.validTotal > 0 && isCount(redteam.falseRejects) && redteam.falseRejects <= redteam.validTotal;
    const le = redteam.liveEscapes;
    // The checks were hardened against this same set, so `caught` is an in-sample score. These fields keep it honest:
    //   before         the checks as submitted (commit 375e1e0, the linked branch) scored on the same set;
    //   postFixProbe   paraphrases written after the first fixes; `heldOut` is false once the file says later rules
    //                  were written with them in view, and it is then never described as held out;
    //   postFixProbe2  paraphrases written after the latest rules and not used to change any rule (held out);
    //   heldOutProbe   the probe the one-pager prints: postFixProbe2, else postFixProbe only while it is held out.
    // Each is null when absent or malformed. A probe key that cannot be read sets postFixUnreadable, and the
    // one-pager then leaves the whole bullet out rather than print the in-sample score without its held-out check.
    const b = redteam.before;
    const before = b && b.harmfulTotal === redteam.harmfulTotal && isCount(b.caught) && b.caught <= b.harmfulTotal ? { caught: b.caught, harmfulTotal: b.harmfulTotal } : null;
    const probe = (p) => (p && isCount(p.total) && p.total > 0 && isCount(p.caught) && p.caught <= p.total ? { total: p.total, caught: p.caught } : null);
    const pf = redteam.postFixProbe;
    const pf1 = probe(pf);
    const postFixProbe = pf1 ? { ...pf1, heldOut: pf.heldOut !== false } : null;
    const pf2raw = redteam.postFixProbe2;
    const pf2 = probe(pf2raw);
    const pf2valid = pf2raw && isCount(pf2raw.validTotal) && pf2raw.validTotal > 0 && isCount(pf2raw.falseRejects) && pf2raw.falseRejects <= pf2raw.validTotal;
    const postFixProbe2 = pf2 ? { ...pf2, validTotal: pf2valid ? pf2raw.validTotal : null, falseRejects: pf2valid ? pf2raw.falseRejects : null } : null;
    rt = {
      before,
      postFixProbe,
      postFixProbe2,
      heldOutProbe: postFixProbe2 ?? (postFixProbe?.heldOut ? postFixProbe : null),
      postFixUnreadable: (pf != null && postFixProbe == null) || (pf2raw != null && postFixProbe2 == null),
      harmfulTotal: redteam.harmfulTotal,
      caught: redteam.caught,
      // Recomputed from the counts so the printed rate always matches the printed "x of y".
      catchRate: pct(redteam.caught / redteam.harmfulTotal),
      validTotal: valid ? redteam.validTotal : null,
      falseRejects: valid ? redteam.falseRejects : null,
      falseRejectRate: valid ? pct(redteam.falseRejects / redteam.validTotal) : null,
      liveEscapes: le && isCount(le.total) && isCount(le.nowBlocked) && le.nowBlocked <= le.total ? { total: le.total, nowBlocked: le.nowBlocked } : null,
    };
  }

  // n = simulated changes behind the rate; stay = the assumed chance that an answer repeats the day before.
  const nullRates = (o) => {
    const moderate = ratePct(o?.moderateRate);
    const strong = ratePct(o?.strongRate);
    if (!moderate && !strong) return null;
    return { moderate, strong, n: isCount(o?.n) && o.n > 0 ? o.n : null, stay: isNum(o?.stay) && o.stay >= 0 && o.stay <= 1 ? o.stay : null };
  };
  const independent = nullRates(timelineNull?.independent);

  return {
    nlpBaselineF1Pct: isNum(baseF1) ? pct(baseF1) : null,
    nlpHeldoutCi95: ciPct(ho?.ci95?.f1),
    nlpBaselineCi95: ciPct(ho?.baselineCi95?.f1),
    ablation: failing.length
      ? {
          runs,
          failing: failing.length,
          minPassed: Math.min(...failing.map((r) => r.passed)),
          maxPassed: Math.max(...failing.map((r) => r.passed)),
          total: sameTotal ? failing[0].total : null,
        }
      : null,
    redteam: rt,
    // Clustered days are only reported next to the independent-days result.
    timelineNull: independent ? { independent, clustered: nullRates(timelineNull?.clustered) } : null,
  };
}

/** Read-only git: the text of `rel` at `ref`, or null if it does not exist there (or git is unavailable). */
function gitShow(ref, rel) {
  try {
    return execFileSync("git", ["show", `${ref}:${rel}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/**
 * Release gate for the PDFs: which printed evidence does NOT exist at the branch the links send judges to?
 * The one-pager links CODE_URL (REPO_BRANCH) and the live demo deployed from it, but the evidence bullets are read from
 * this working tree. Anything listed here cannot be reproduced from the linked code until a person merges this work
 * into REPO_BRANCH (and redeploys). Read-only: `git show <branch>:<path>`; nothing is fetched, written or pushed.
 * Returns { branch, gaps: string[] } (gaps is null when git could not be asked at all).
 */
export function evidenceNotOnBranch(branch) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${branch}^{commit}`], { cwd: ROOT, stdio: "ignore" });
  } catch {
    return { branch, gaps: null };
  }
  const gaps = [];
  for (const rel of ["eval/results/meds-ablation.json", "eval/results/verifier-redteam.json", "eval/results/timeline-null.json"]) {
    if (existsSync(join(ROOT, rel)) && gitShow(branch, rel) == null) gaps.push(`${rel} (absent at ${branch})`);
  }
  // Fields added to a file that already existed: the held-out baseline and confidence intervals.
  const local = readJsonIfExists("eval/results/nlp-eval.json");
  let remote = null;
  try {
    remote = JSON.parse(gitShow(branch, "eval/results/nlp-eval.json") ?? "null");
  } catch {
    remote = null;
  }
  for (const [label, get] of [
    ["heldout.baseline", (j) => j?.heldout?.baseline],
    ["heldout.ci95", (j) => j?.heldout?.ci95],
  ]) {
    if (get(local) != null && get(remote) == null) gaps.push(`eval/results/nlp-eval.json ${label} (absent at ${branch})`);
  }
  // The claim checker itself: the red-team "after fixes" figure describes this working tree's checks.
  const verifier = "src/engine/brief/verify.ts";
  const remoteVerifier = gitShow(branch, verifier);
  if (remoteVerifier != null && existsSync(join(ROOT, verifier)) && remoteVerifier !== readFileSync(join(ROOT, verifier), "utf8")) {
    gaps.push(`${verifier} differs from ${branch} (the claim-checker fixes are not on the linked branch)`);
  }
  return { branch, gaps };
}

export function collectFacts() {
  const nlp = readJson("eval/results/nlp-eval.json");
  const meds = readJson("eval/results/meds-eval.json");
  const live = readJson("eval/results/ai-live.json");
  const smoke = readJson("eval/results/llm-smoke.json");
  const meta = readJson("src/kb/data/meta.json");
  const bundle = readJson("docs/samples/kinwise-fhir-bundle.json");
  const validation = readJson("docs/samples/kinwise-fhir-validation.json");
  const extra = optionalEvidence({
    nlp,
    ablation: readOptional("eval/results/meds-ablation.json"),
    redteam: readOptional("eval/results/verifier-redteam.json"),
    timelineNull: readOptional("eval/results/timeline-null.json"),
  });

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
      heldoutCi95: extra.nlpHeldoutCi95,
      baselineF1Pct: extra.nlpBaselineF1Pct,
      baselineCi95: extra.nlpBaselineCi95,
      // From the raw counts: the stored 4-decimal values would round twice (0.9725 → "0.973"; 106/109 = 0.97248).
      heldoutP: dec(ho.micro.tp / (ho.micro.tp + ho.micro.fp)),
      heldoutR: dec(ho.micro.tp / (ho.micro.tp + ho.micro.fn)),
      heldoutNeg: `${ho.negation.correct} of ${ho.negation.goldNegatives}`,
      devCases: dev.cases,
      devF1: floorDec(dev.micro.f1),
      devF1Pct: floorPct(dev.micro.f1),
      meanMs: dev.latency.meanMs,
    },
    meds: {
      cases: `${meds.summary.casesPassed} of ${meds.summary.cases}`,
      expectations: `${meds.summary.expectationsPassed} of ${meds.summary.expectations}`,
      casesPassed: meds.summary.casesPassed,
      casesTotal: meds.summary.cases,
      kbVersion: meds.kbVersion,
      ablation: extra.ablation,
    },
    verifier: extra.redteam,
    timelineNull: extra.timelineNull,
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
      // Three is a floor, not a total: the verdict lists what one person noticed in one run, not an exhaustive audit,
      // so the materials say "at least 3" (liveSlippedText).
      liveSlipped: (() => {
        const v = String(live.verdict ?? "");
        const listed = [/garbled/i, /Slept like a log/i, /can cause/i].filter((re) => re.test(v)).length;
        if (listed !== 3) throw new Error(`facts: ai-live.json verdict changed; recount liveSlipped by hand (matched ${listed} of 3)`);
        return 3;
      })(),
      liveSlippedText: "at least 3",
    },
    tests: {
      vitest,
      e2eChecks,
      e2ePassed: e2eLast ? e2eLast.results.filter((r) => r.ok).length : null,
      // A partial run (another process still writing) has fewer results than checks: e2eRun tells them apart.
      e2eRun: e2eLast ? e2eLast.results.length : null,
      e2eFailed: e2eLast ? e2eLast.results.filter((r) => !r.ok).length : null,
      e2eRanAt: e2eLast?.ranAt ?? null,
      a11yScans: a11yLast ? a11yLast.report.length : null,
      a11yViolations: a11yLast ? a11yLast.report.reduce((n, r) => n + r.violations.length, 0) : null,
      // The a11y gate (scripts/a11y.mjs) fails only on serious or critical violations.
      a11ySerious: a11yLast ? a11yLast.report.reduce((n, r) => n + r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").length, 0) : null,
      a11yRanAt: a11yLast?.ranAt ?? null,
    },
  };
}

/**
 * Problems with the last browser-test results that must keep a one-pager out of submission/: a partial e2e run (fewer
 * results than checks, e.g. another process was still running it), failing e2e checks, or serious/critical axe
 * violations. Missing results are not listed: the one-pager then prints the check counts without pass numbers.
 */
export function testRunProblems(t) {
  const out = [];
  if (t?.e2eRun != null) {
    if (t.e2eRun < t.e2eChecks) out.push(`end-to-end results are partial: ${t.e2eRun} of ${t.e2eChecks} checks ran (re-run npm run test:e2e)`);
    if (t.e2eFailed) out.push(`${t.e2eFailed} end-to-end check(s) failed`);
  }
  if (t?.a11ySerious) out.push(`${t.a11ySerious} serious/critical accessibility violation(s)`);
  return out;
}
