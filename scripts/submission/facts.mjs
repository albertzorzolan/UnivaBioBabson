// Every number the submission PDFs print, read from files in the repo at build time (there are no hand counts):
//   eval/results/nlp-eval.json, meds-eval.json, ai-live.json, llm-smoke.json   (evaluation results)
//   eval/results/meds-ablation.json, verifier-redteam.json, timeline-null.json (optional; each fact is null if absent)
//   eval/results/llm-batch.json                                                (optional: the on-device model's batch run)
//   eval/verifier-redteam.json                                                 (items tagged "live-escape": the flawed
//                                                                               AI sentences of the recorded live run)
//   src/engine/timeline/rules.ts                                               (the app's "about 1 in 10" false alarms)
//   docs/EVALUATION.md §3 + src/engine/timeline/seed.timeline.test.ts          (the demo's Fisher and runs-check p)
//   src/engine/brief/template.test.ts                                          (the brief's sleep line, engine output)
//   src/kb/data/meta.json                                                      (knowledge-base coverage)
//   docs/samples/kinwise-fhir-bundle.json + kinwise-fhir-validation.json      (HAPI FHIR R4 $validate)
//   vitest JSON report (run by make-pdfs.mjs) or SKIP_VITEST=1 → counts from the last run, if any
//   scripts/browser-test.mjs (check ids) + test-results/{e2e,a11y} (last run results, gitignored)
// branchOnlyFacts() turns these into the facts of the fallback one-pager: only evidence that exists at the linked
// branch (read with `git show`), for the case where this work has not been pushed there yet.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BUILD_DIR, REPO_BRANCH, ROOT, ensureDir, readJson, readJsonIfExists } from "./lib.mjs";

// Same formatting as the app's How it works page (src/views/public/HowItWorks.tsx `pct`): percent, one decimal, so a
// score printed in a PDF reads exactly as the live page shows it (held-out micro-F1 0.9422 → "94.2%").
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const dec = (x, d = 3) => x.toFixed(d);
// Rounds down, so a headline score is never shown higher than measured (dev F1 0.9985 → "0.998", as in README/EVALUATION).
const floorDec = (x, d = 3) => (Math.floor(x * 10 ** d + 1e-9) / 10 ** d).toFixed(d);
// The same rule as a percent (dev F1 0.9985 → "99.8%", matching README's 0.998). Used for the dev score only; the How it
// works page prints its development card with the same floorPct (src/views/public/howEval.ts), so it also reads
// "99.8%". The held-out score keeps `pct`, so the one-pager matches the live page exactly (0.9422 → "94.2%" either way).
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
 *                postFixProbe2 / postFixProbe3: { total, caught, validTotal, falseRejects, heldOut } }
 *                postFixProbe3.withCorrectedLabel { total, caught } (the same recorded run after one label correction)
 *   timelineNull eval/results/timeline-null.json { independent, clustered } × { moderateRate, strongRate, n, stay },
 *                optional per scenario: gated { moderateRate, strongRate, n } (the same simulation with the runs-aware
 *                check applied), and runsCheck { gate } at the top level. `runsGate` is true only when runsCheck.gate is
 *                exactly true, i.e. the file says the app applies that check; the one-pager prints a gated rate only then.
 *                power[] { stay, metric, detectionRate, gatedDetectionRate }: a real rise in dizziness (15% → 45% of
 *                days); `power.independent` is the stay-0 row, `power.clustered` the row at the clustered scenario's stay.
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
    //   postFixProbe2  paraphrases written after the second round's rules; `heldOut` false since two of its items were
    //                  in view when the medicine-action rule was designed (its recorded score is kept as it was);
    //   postFixProbe3  paraphrases written by an AI agent after that rule was designed and before it was run;
    //   heldOutProbe   the newest probe still held out: postFixProbe3, else postFixProbe2, else postFixProbe.
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
    const withValid = (raw, head) => {
      const ok = raw && isCount(raw.validTotal) && raw.validTotal > 0 && isCount(raw.falseRejects) && raw.falseRejects <= raw.validTotal;
      return { ...head, validTotal: ok ? raw.validTotal : null, falseRejects: ok ? raw.falseRejects : null, heldOut: raw.heldOut !== false };
    };
    const postFixProbe2 = pf2 ? withValid(pf2raw, pf2) : null;
    const pf3raw = redteam.postFixProbe3;
    const pf3 = probe(pf3raw);
    // withCorrectedLabel: the same recorded run re-scored after review relabelled one valid item as harmful
    // (10 of 22 → 10 of 23). It is the held-out figure the submission text prints; null when absent or malformed.
    const postFixProbe3 = pf3 ? { ...withValid(pf3raw, pf3), corrected: probe(pf3raw.withCorrectedLabel) } : null;
    rt = {
      before,
      postFixProbe,
      postFixProbe2,
      postFixProbe3,
      heldOutProbe: [postFixProbe3, postFixProbe2, postFixProbe].find((p) => p?.heldOut) ?? null,
      postFixUnreadable: (pf != null && postFixProbe == null) || (pf2raw != null && postFixProbe2 == null) || (pf3raw != null && postFixProbe3 == null),
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
    // The gated rates are optional and read with the same rules; a malformed `gated` is null, never a guess.
    const gm = ratePct(o?.gated?.moderateRate);
    const gs = ratePct(o?.gated?.strongRate);
    const gated = gm || gs ? { moderate: gm, strong: gs, n: isCount(o?.gated?.n) && o.gated.n > 0 ? o.gated.n : null } : null;
    return { moderate, strong, n: isCount(o?.n) && o.n > 0 ? o.n : null, stay: isNum(o?.stay) && o.stay >= 0 && o.stay <= 1 ? o.stay : null, gated };
  };
  const independent = nullRates(timelineNull?.independent);
  const clustered = nullRates(timelineNull?.clustered);
  // Power rows: the share of simulated real rises in dizziness that are flagged, by the tests alone and with the runs
  // check. Matched on `stay` (0 = independent days) so a reordered array cannot swap the two.
  const powerRows = Array.isArray(timelineNull?.power) ? timelineNull.power : [];
  const powerAt = (stay) => {
    const r = powerRows.find((x) => x && x.metric === "dizziness" && x.stay === stay);
    const tests = ratePct(r?.detectionRate);
    return tests ? { tests, gated: ratePct(r?.gatedDetectionRate), n: isCount(r?.n) && r.n > 0 ? r.n : null } : null;
  };

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
    timelineNull: independent
      ? {
          independent,
          clustered,
          runsGate: timelineNull?.runsCheck?.gate === true,
          power: { independent: powerAt(0), clustered: clustered?.stay != null ? powerAt(clustered.stay) : null },
        }
      : null,
  };
}

/**
 * The flawed AI sentences that got through in the recorded live run, counted from the red-team set
 * (eval/verifier-redteam.json). Each item tagged "live-escape" is one sentence copied verbatim from the run
 * (eval/results/ai-live.json). Sentences are grouped into the AI output they came from by check + finding (one
 * explanation), section (one brief section) or story (one set of check-in suggestions): live-03 and live-04 are two
 * sentences of the same explanation, so 6 sentences come from 5 outputs. Always "at least": the list is what a review
 * of one run found, not an exhaustive audit.
 *
 * Sanity checks (each throws, so the build stops instead of printing a number that has drifted):
 *   - every live-escape item has a check and exactly one grouping key, and is a non-empty sentence;
 *   - `resultsTotal` (eval/results/verifier-redteam.json liveEscapes.total, counted by the eval) equals the count;
 *   - `recordedRun` (the text of ai-live.json), when given, contains every sentence verbatim.
 * Returns { sentences, outputs, ids, texts, text: "at least 6", phrase: "at least 6 flawed AI sentences (from 5 outputs)" }.
 */
export function liveEscapeCounts(set, { resultsTotal = null, recordedRun = null } = {}) {
  const items = (Array.isArray(set?.items) ? set.items : []).filter((i) => Array.isArray(i?.tags) && i.tags.includes("live-escape"));
  if (!items.length) throw new Error("facts: eval/verifier-redteam.json has no items tagged live-escape");
  const groups = new Set();
  for (const i of items) {
    const keys = ["finding", "section", "story"].filter((k) => typeof i[k] === "string" && i[k].trim());
    if (typeof i.check !== "string" || keys.length !== 1 || typeof i.text !== "string" || !i.text.trim()) {
      throw new Error(`facts: live-escape item ${i.id ?? "?"} cannot be grouped into an output (check + one of finding/section/story); update liveEscapeCounts()`);
    }
    groups.add(`${i.check}|${keys[0]}|${i[keys[0]]}`);
    if (recordedRun != null && !recordedRun.includes(i.text)) throw new Error(`facts: live-escape item ${i.id} is not in eval/results/ai-live.json verbatim`);
  }
  if (resultsTotal != null && resultsTotal !== items.length) {
    throw new Error(`facts: eval/results/verifier-redteam.json liveEscapes.total is ${resultsTotal}, but the set tags ${items.length} live-escape items; re-run the red-team eval`);
  }
  const sentences = items.length;
  const outputs = groups.size;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return {
    sentences,
    outputs,
    ids: items.map((i) => i.id),
    texts: items.map((i) => i.text),
    text: `at least ${sentences}`,
    phrase: `at least ${plural(sentences, "flawed AI sentence")} (from ${plural(outputs, "output")})`,
  };
}

/**
 * The app's own false-alarm wording ("about 1 in 10" medicine changes with no real effect still showed a moderate
 * signal), from MULTIPLE_COMPARISONS_NOTE in src/engine/timeline/rules.ts. Used when timeline-null.json is absent
 * (it is not on the linked branch). Returns "about 1 in 10", or null if the sentence is not found.
 */
export function falseAlarmAbout(rulesSrc) {
  const m = /about (\d+ in \d+) medicine changes still showed a moderate signal/.exec(String(rulesSrc ?? ""));
  return m ? `about ${m[1]}` : null;
}

/**
 * The demo story's headline figures, read from committed files (pure: texts in, strings out; null when not found):
 *   runsCheckP       docs/EVALUATION.md §3 "Runs-check p: dizziness 0.007" (the runs check on the seeded diary)
 *   runsCheckPinned  the same p as pinned in src/engine/timeline/seed.timeline.test.ts (`runs.dizziness).toEqual({ p: … `);
 *                    check-facts fails when the two differ, so the docs cannot drift from the engine
 *   fisherP          seed.timeline.test.ts `d.statistics` ("Fisher's exact test, two-sided p = 0.0023 …")
 *   sleep            src/engine/brief/template.test.ts, the brief's "Also recorded" line asserted word for word on the
 *                    seed (engine output): { after: "3.4", before: "2.6", afterDays: 14, beforeDays: 20 }
 */
export function demoFacts({ evaluationMd = "", seedTimelineTest = "", templateTest = "" } = {}) {
  const runs = /Runs-check p: dizziness (0\.\d+)/.exec(String(evaluationMd));
  const pinned = /runs\.dizziness\)\.toEqual\(\{ p: (0\.\d+)/.exec(String(seedTimelineTest));
  const fisher = /d\.statistics\)\.toBe\("Fisher's exact test, two-sided p = (0\.\d+)/.exec(String(seedTimelineTest));
  // The test splits the sentence over two string literals ("… on 14 answered " + "days after, …"), so the literal
  // boundary is matched as optional quote-plus-whitespace.
  const sleep = new RegExp(
    String.raw`sleep quality ratings averaged (\d\.\d) out of 5 on (\d+) answered (?:"\s*\+\s*")?days after, compared with (\d\.\d) out of 5 on (\d+) answered days before`,
  ).exec(String(templateTest));
  return {
    runsCheckP: runs ? runs[1] : null,
    runsCheckPinned: pinned ? pinned[1] : null,
    fisherP: fisher ? fisher[1] : null,
    sleep: sleep ? { after: sleep[1], afterDays: Number(sleep[2]), before: sleep[3], beforeDays: Number(sleep[4]) } : null,
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
 * Returns { branch, gaps: string[], keys: string[] } (both null when git could not be asked at all). `keys` names the
 * facts each gap feeds, for branchOnlyFacts(): "ablation", "redteam", "timelineNull", "nlpBaseline", "nlpCi95",
 * "verifier", "liveEscapes", "llmBatch".
 */
export function evidenceNotOnBranch(branch) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${branch}^{commit}`], { cwd: ROOT, stdio: "ignore" });
  } catch {
    return { branch, gaps: null, keys: null };
  }
  const gaps = [];
  const keys = [];
  const gap = (key, text) => {
    gaps.push(text);
    keys.push(key);
  };
  for (const [key, rel] of [
    ["ablation", "eval/results/meds-ablation.json"],
    ["redteam", "eval/results/verifier-redteam.json"],
    ["timelineNull", "eval/results/timeline-null.json"],
    ["llmBatch", "eval/results/llm-batch.json"],
  ]) {
    if (existsSync(join(ROOT, rel)) && gitShow(branch, rel) == null) gap(key, `${rel} (absent at ${branch})`);
  }
  // The flawed-AI count ("at least 6 flawed AI sentences (from 5 outputs)") is counted from the items tagged
  // "live-escape" in the red-team set. The branch's ai-live.json holds the same sentences but does not label or group
  // them (its verdict names 3 flawed outputs), so without those tagged items at the branch the count is not
  // reproducible there.
  const setRel = "eval/verifier-redteam.json";
  if (existsSync(join(ROOT, setRel)) && !branchHasLiveEscapes(gitShow(branch, setRel))) {
    gap("liveEscapes", `${setRel} live-escape items (absent at ${branch}; they give the flawed-AI count)`);
  }
  // Fields added to a file that already existed: the held-out baseline and confidence intervals.
  const local = readJsonIfExists("eval/results/nlp-eval.json");
  let remote = null;
  try {
    remote = JSON.parse(gitShow(branch, "eval/results/nlp-eval.json") ?? "null");
  } catch {
    remote = null;
  }
  for (const [key, label, get] of [
    ["nlpBaseline", "heldout.baseline", (j) => j?.heldout?.baseline],
    ["nlpCi95", "heldout.ci95", (j) => j?.heldout?.ci95],
  ]) {
    if (get(local) != null && get(remote) == null) gap(key, `eval/results/nlp-eval.json ${label} (absent at ${branch})`);
  }
  // The claim checker itself: the red-team "after fixes" figure describes this working tree's checks.
  const verifier = "src/engine/brief/verify.ts";
  const remoteVerifier = gitShow(branch, verifier);
  if (remoteVerifier != null && existsSync(join(ROOT, verifier)) && remoteVerifier !== readFileSync(join(ROOT, verifier), "utf8")) {
    gap("verifier", `${verifier} differs from ${branch} (the claim-checker fixes are not on the linked branch)`);
  }
  return { branch, gaps, keys };
}

/** True when `text` (the red-team set at some ref) parses and has at least one item tagged "live-escape". */
function branchHasLiveEscapes(text) {
  try {
    const set = JSON.parse(text ?? "null");
    return Array.isArray(set?.items) && set.items.some((i) => Array.isArray(i?.tags) && i.tags.includes("live-escape"));
  } catch {
    return false;
  }
}

/**
 * Test results as recorded in docs/EVALUATION.md §7 (the "Engineering gates" table) of some version of the repo:
 *   "1,246 tests: 1,245 passed, 1 skipped (…), 2026-10-11" · "20 of 20 passed, 2026-10-11" · "46 scans, 0 violations
 *   reported (…), 2026-10-11". Pure (text in). Each part is null when its row is not found; returns null if none is.
 */
export function recordedTests(evaluationMd) {
  const text = String(evaluationMd ?? "");
  const row = (cmd) => text.split("\n").find((l) => l.startsWith("|") && l.includes(`\`${cmd}\``)) ?? "";
  const num = (s) => Number(s.replace(/,/g, ""));
  const unit = /\| ([\d,]+) tests: ([\d,]+) passed, (\d+) skipped[^|]*?, (\d{4}-\d{2}-\d{2}) \|\s*$/.exec(row("npx vitest run"));
  const e2e = /\| (\d+) of (\d+) passed, (\d{4}-\d{2}-\d{2}) \|\s*$/.exec(row("npm run test:e2e"));
  const a11y = /\| (\d+) scans, (\d+) violations reported[^|]*?, (\d{4}-\d{2}-\d{2}) \|\s*$/.exec(row("npm run test:a11y"));
  if (!unit && !e2e && !a11y) return null;
  return {
    unit: unit ? { total: num(unit[1]), passed: num(unit[2]), skipped: num(unit[3]), date: unit[4] } : null,
    e2e: e2e ? { passed: num(e2e[1]), checks: num(e2e[2]), date: e2e[3] } : null,
    a11y: a11y ? { scans: num(a11y[1]), violations: num(a11y[2]), date: a11y[3] } : null,
  };
}

/**
 * Facts for the fallback one-pager (make-pdfs.mjs --linked-branch-only, kinwise-one-pager-if-not-pushed.pdf): every
 * fact whose source `gapKeys` (evidenceNotOnBranch(branch).keys) reports as missing at `branch` is set to null, so
 * its bullet or clause is dropped, and the rest falls back to what the branch itself holds:
 *   - timeline false alarms → the branch's rules.ts wording ("about 1 in 10") instead of timeline-null.json;
 *   - tests → the counts recorded in the branch's docs/EVALUATION.md §7 (with their date), or none;
 *   - the demo's runs-check p and the brief's sleep averages → demoFacts() on the branch's own files (null at 375e1e0);
 *   - the flawed-AI count → kept only if the branch has the live-escape items it is counted from (no "liveEscapes"
 *     gap) and every one of those sentences is in the branch's ai-live.json verbatim. Otherwise the count is null and
 *     `ai.liveFlawedOnBranch` says whether the branch's own ai-live.json verdict records flawed output that got through
 *     ("let through"), so the one-pager can still disclose it, without a number.
 * The red-team, ablation, baseline and CI facts are not on the branch, so they are always null here. Pure apart from
 * read-only `git show` (`show` is injectable for tests). Returns a new object; `facts` is not changed.
 */
export function branchOnlyFacts(facts, { branch, gapKeys = [], show = (rel) => gitShow(branch, rel) } = {}) {
  const f = structuredClone(facts);
  const gaps = new Set(gapKeys);
  f.linkedBranch = branch;
  // The figures that exist at the branch are taken from the branch's own files (same formatting as collectFacts), so
  // a later re-run of an eval in this tree can never print under the "reproducible at <branch>" header. A file the
  // fallback needs but the branch lacks stops the build instead of printing this tree's number.
  const branchJson = (rel) => {
    try {
      const j = JSON.parse(show(rel) ?? "null");
      if (j && typeof j === "object") return j;
    } catch {
      /* falls through */
    }
    throw new Error(`fallback one-pager: ${rel} is missing or unreadable at ${branch}`);
  };
  const bNlp = nlpFacts(branchJson("eval/results/nlp-eval.json"));
  Object.assign(f.nlp, bNlp);
  Object.assign(f.meds, medsFacts(branchJson("eval/results/meds-eval.json")));
  f.kb = kbFacts(branchJson("src/kb/data/meta.json"));
  Object.assign(f.ai, liveRunFacts(branchJson("eval/results/ai-live.json")));
  if (gaps.has("nlpBaseline")) Object.assign(f.nlp, { baselineF1Pct: null, baselineCi95: null });
  if (gaps.has("nlpCi95")) f.nlp.heldoutCi95 = null;
  if (gaps.has("ablation")) f.meds.ablation = null;
  // The "after fixes" red-team score describes this tree's claim checker, so either gap drops it.
  if (gaps.has("redteam") || gaps.has("verifier")) f.verifier = null;
  if (gaps.has("timelineNull")) f.timelineNull = null;
  if (gaps.has("llmBatch")) f.llmBatch = null;
  f.timelineAbout = falseAlarmAbout(show("src/engine/timeline/rules.ts"));
  // The demo's runs-check p and the brief's sleep line exist only where the branch's own files state them (neither
  // does at 375e1e0), so the fallback prints them only then.
  f.demo = demoFacts({
    evaluationMd: show("docs/EVALUATION.md") ?? "",
    seedTimelineTest: show("src/engine/timeline/seed.timeline.test.ts") ?? "",
    templateTest: show("src/engine/brief/template.test.ts") ?? "",
  });
  // Tests: this tree's suite is not the branch's, so the branch's own record is used (or nothing).
  const rec = recordedTests(show("docs/EVALUATION.md"));
  f.tests = rec ? { recorded: rec, vitest: null, e2eChecks: null, e2ePassed: null, e2eRun: null, e2eFailed: null, a11yScans: null, a11yViolations: null, a11ySerious: null } : null;
  const run = show("eval/results/ai-live.json");
  if (gaps.has("liveEscapes") || !run || !f.ai.liveSlippedIds?.length || !f.ai.liveSlippedTexts?.every((t) => run.includes(t))) {
    Object.assign(f.ai, { liveSlipped: null, liveSlippedOutputs: null, liveSlippedText: null, liveSlippedPhrase: null });
  }
  f.ai.liveFlawedOnBranch = liveRunVerdictNotesFlaws(run);
  return f;
}

/** True when the text of an ai-live.json has a verdict saying the checker "let through" some output. */
export function liveRunVerdictNotesFlaws(runText) {
  try {
    const verdict = JSON.parse(runText ?? "null")?.verdict;
    return typeof verdict === "string" && /\blet through\b/i.test(verdict);
  } catch {
    return false;
  }
}

// The facts read from one results file each. collectFacts() reads this working tree's files; branchOnlyFacts() reads
// the linked branch's copies through the same functions, so both print with the same formatting.

/** NLP benchmark facts from an eval/results/nlp-eval.json object. */
export function nlpFacts(nlp) {
  const ho = nlp.heldout;
  const dev = nlp.dev;
  const extra = optionalEvidence({ nlp });
  return {
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
  };
}

/** Medication-review suite facts from an eval/results/meds-eval.json object (ablations are added by the caller). */
export function medsFacts(meds) {
  return {
    cases: `${meds.summary.casesPassed} of ${meds.summary.cases}`,
    expectations: `${meds.summary.expectationsPassed} of ${meds.summary.expectations}`,
    casesPassed: meds.summary.casesPassed,
    casesTotal: meds.summary.cases,
    kbVersion: meds.kbVersion,
  };
}

/** Knowledge-base counts from a src/kb/data/meta.json object. */
export function kbFacts(meta) {
  return { ...meta.counts, version: meta.version };
}

/** The recorded live AI run's facts from an eval/results/ai-live.json object. */
export function liveRunFacts(live) {
  return {
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
  };
}

/**
 * The on-device model's batch run (eval/results/llm-batch.json, written by scripts/llm-batch.mjs; method in
 * eval/LLM-BATCH.md). Pure. Null when the file is absent, a count is malformed, or the audit of the shown sentences is
 * not complete: the submission then states nothing about the batch rather than a partial figure. The escape interval is
 * the Wilson 95% interval the script computed and stored (escapeWilson95); `line` is the exact DEVPOST line.
 */
export function batchFacts(b) {
  const s = b?.summary;
  const t = s?.byTask;
  const a = b?.audit;
  const counts = [s?.prompts, s?.sentencesGenerated, s?.blocked, s?.shown];
  if (!s || !t || !counts.every(isCount) || s.sentencesGenerated === 0 || s.blocked + s.shown > s.sentencesGenerated) return null;
  const lat = (task) => {
    const l = t[task]?.latencyMs;
    return isNum(l?.p50) && isNum(l?.p95) ? { p50S: (l.p50 / 1000).toFixed(1), p95S: (l.p95 / 1000).toFixed(1) } : null;
  };
  const ask = lat("ask");
  const brief = lat("brief");
  const explain = lat("explain");
  const ci = ciPct(a?.escapeWilson95);
  if (!ask || !brief || !explain || a?.complete !== true || !isCount(a.labelled) || !isCount(a.flawed) || a.labelled !== s.shown || !ci) return null;
  const blockedPct = pct(s.blocked / s.sentencesGenerated);
  const shownPct = pct(s.shown / s.sentencesGenerated);
  const set = b.promptSet ?? {};
  const facts = {
    date: typeof b.date === "string" ? b.date : null,
    prompts: s.prompts,
    askPrompts: set.ask ?? null,
    briefPrompts: set.brief ?? null,
    explainPrompts: set.explain ?? null,
    generated: s.sentencesGenerated,
    blocked: s.blocked,
    blockedPct,
    shown: s.shown,
    shownPct,
    flawed: a.flawed,
    labelled: a.labelled,
    escapePct: pct(a.flawed / a.labelled),
    escapeCi95: ci,
    labelledBy: a.labelledBy ?? null,
    externalRequests: Array.isArray(b.externalRequestsBlocked) ? b.externalRequestsBlocked.length : null,
    ask,
    brief,
    explain,
  };
  // One plain line under DEVPOST's "AI and rigor at a glance" table (the table keeps its 4 rows).
  facts.line =
    `**On-device model, batch of ${facts.prompts} prompts** ([LLM-BATCH.md](https://github.com/albertzorzolan/UnivaBioBabson/blob/${REPO_BRANCH}/eval/LLM-BATCH.md)): ` +
    `the checker blocked ${blockedPct} of ${facts.generated} AI sentences; ${facts.flawed} of ${facts.shown} shown sentences were flawed ` +
    `(95% CI ${ci}; audit by an AI agent, not a clinician); median ${ask.p50S} s per Ask answer, ${brief.p50S} s per brief draft.`;
  return facts;
}

export function collectFacts() {
  const nlp = readJson("eval/results/nlp-eval.json");
  const meds = readJson("eval/results/meds-eval.json");
  const live = readJson("eval/results/ai-live.json");
  const smoke = readJson("eval/results/llm-smoke.json");
  const meta = readJson("src/kb/data/meta.json");
  const bundle = readJson("docs/samples/kinwise-fhir-bundle.json");
  const validation = readJson("docs/samples/kinwise-fhir-validation.json");
  const redteamResults = readOptional("eval/results/verifier-redteam.json");
  const extra = optionalEvidence({
    nlp,
    ablation: readOptional("eval/results/meds-ablation.json"),
    redteam: redteamResults,
    timelineNull: readOptional("eval/results/timeline-null.json"),
  });
  // Counted from the red-team set, cross-checked against the eval's own count and the recorded run (see the function).
  const escapes = liveEscapeCounts(readJson("eval/verifier-redteam.json"), {
    resultsTotal: isCount(redteamResults?.liveEscapes?.total) ? redteamResults.liveEscapes.total : null,
    recordedRun: readFileSync(join(ROOT, "eval/results/ai-live.json"), "utf8"),
  });

  const sev = (s) => validation.issue.filter((i) => i.severity === s).length;
  const smoke3b = smoke.models.find((m) => /Qwen2\.5-3B/.test(m.model));

  const e2eSrc = readFileSync(join(ROOT, "scripts", "browser-test.mjs"), "utf8");
  const e2eChecks = (e2eSrc.match(/^\s*id: "[a-z0-9-]+",$/gm) ?? []).length;
  const e2eLast = readJsonIfExists("test-results/e2e/results.json");
  const a11yLast = readJsonIfExists("test-results/a11y/report.json");

  const vitest = runVitest();
  const text = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");

  return {
    nlp: nlpFacts(nlp),
    meds: { ...medsFacts(meds), ablation: extra.ablation },
    verifier: extra.redteam,
    timelineNull: extra.timelineNull,
    llmBatch: batchFacts(readOptional("eval/results/llm-batch.json")),
    demo: demoFacts({
      evaluationMd: text("docs/EVALUATION.md"),
      seedTimelineTest: text("src/engine/timeline/seed.timeline.test.ts"),
      templateTest: text("src/engine/brief/template.test.ts"),
    }),
    // The app's own wording, printed when timeline-null.json is absent (as on the linked branch).
    timelineAbout: falseAlarmAbout(readFileSync(join(ROOT, "src/engine/timeline/rules.ts"), "utf8")),
    kb: kbFacts(meta),
    fhir: {
      resources: bundle.entry.length,
      errors: sev("error") + sev("fatal"),
      warnings: sev("warning"),
      info: sev("information"),
    },
    ai: {
      ...liveRunFacts(live),
      smokeBrief: smoke3b ? `${smoke3b.summary.brief.sentencesKept} of ${smoke3b.summary.brief.sentencesKept + smoke3b.summary.brief.sentencesDropped}` : null,
      smokeExplainDropped: smoke3b ? `${smoke3b.summary.explain.sentencesDropped} of ${smoke3b.summary.explain.sentencesKept + smoke3b.summary.explain.sentencesDropped}` : null,
      smokeRefineDropped: smoke3b ? `${smoke3b.summary.refine.sentencesDropped} of ${smoke3b.summary.refine.sentencesKept + smoke3b.summary.refine.sentencesDropped}` : null,
      // Flawed AI sentences that got through in the recorded live run, counted from eval/verifier-redteam.json
      // (liveEscapeCounts): 6 sentences from 5 outputs as of 2026-10-17. Every material prints liveSlippedPhrase,
      // "at least 6 flawed AI sentences (from 5 outputs)", so the unit (sentences) and the floor ("at least") never drift.
      liveSlipped: escapes.sentences,
      liveSlippedOutputs: escapes.outputs,
      liveSlippedText: escapes.text,
      liveSlippedPhrase: escapes.phrase,
      liveSlippedIds: escapes.ids,
      liveSlippedTexts: escapes.texts,
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
      // The dated counts committed in docs/EVALUATION.md §7, which the printed counts must trace to (check-facts
      // compares them with the last vitest report and the browser-test results).
      recordedHere: recordedTests(text("docs/EVALUATION.md")),
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
