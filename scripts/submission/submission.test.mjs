// Unit tests for the submission scripts' pure logic (no dev server; the layout test uses the system Chrome):
//   node --test scripts/submission/submission.test.mjs
// Vitest only collects src/ and eval/, and these are plain .mjs build scripts, so they use node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODE_URL, DEFAULT_TEAM, DEMO_URL, REPO_BRANCH, ROOT, fileUrl, launchBrowser, pdfPageCount, readJson, shortUrl } from "./lib.mjs";
import * as lib from "./lib.mjs";
import {
  batchFacts,
  branchOnlyFacts,
  collectFacts,
  demoFacts,
  evidenceNotOnBranch,
  falseAlarmAbout,
  liveEscapeCounts,
  liveRunVerdictNotesFlaws,
  optionalEvidence,
  recordedTests,
  testRunProblems,
} from "./facts.mjs";
import { DEMO_CTA, SHOT_HEIGHT_IN, changeStep, e2eText, evidenceItems, falseAlarmText, onePagerHtml, overflowProbe, testsItem } from "./onepager.mjs";
import { fixedCaptureTime, unionBox } from "./capture.mjs";
import { PARTIAL_KB, PASTE_WORDS, STALE, numberChecks, pasteRegion, pasteRegionProblems, renderedWordCount, staleRegex, testRecordWarnings } from "./check-facts.mjs";

const PHRASE = "at least 6 flawed AI sentences (from 5 outputs)";

/** Minimal facts in the shape collectFacts() returns (numbers from the committed results, for realism only). */
function baseFacts(extra = {}) {
  return {
    nlp: { heldoutCases: 70, heldoutF1Pct: "94.2%", heldoutCi95: null, baselineF1Pct: null, baselineCi95: null, devCases: 245, devF1Pct: "99.8%" },
    meds: { cases: "57 of 57", expectations: "295 of 295", ablation: null },
    verifier: null,
    timelineNull: null,
    timelineAbout: "about 1 in 10",
    kb: { drugs: 427, beers: 89, cascades: 26 },
    fhir: { resources: 270, errors: 0, warnings: 25 },
    ai: { externalRequests: 0, liveSlipped: 6, liveSlippedOutputs: 5, liveSlippedText: "at least 6", liveSlippedPhrase: PHRASE },
    tests: { vitest: { passed: 1245, failed: 0, skipped: 1 }, e2eChecks: 20, e2ePassed: 20, e2eRun: 20, e2eFailed: 0, a11yScans: 46, a11yViolations: 0, a11ySerious: 0 },
    ...extra,
  };
}
const shots = { visitCard: "/tmp/card.png", visitCardText: "Dizziness was recorded on 9 of 14 answered days" };

/** Fixture lines in the shape of docs/EVALUATION.md §7 at the submitted commit. */
const EVAL_MD_AT_BRANCH = [
  "| Unit and eval tests | `npx vitest run` | 43 files: engines | 1,246 tests: 1,245 passed, 1 skipped (the opt-in FHIR sample writer), 2026-10-11 |",
  "| End-to-end | `npm run test:e2e` | 20 Playwright checks | 20 of 20 passed, 2026-10-11 |",
  "| Accessibility | `npm run test:a11y` | 46 axe-core scans | 46 scans, 0 violations reported (the gate fails on serious or critical), 2026-10-11 |",
].join("\n");

test("lib: links point at the live demo and the submitted branch, not the repo root; no 'planned' alias", () => {
  assert.equal(CODE_URL, `https://github.com/albertzorzolan/UnivaBioBabson/tree/${REPO_BRANCH}`);
  assert.equal(REPO_BRANCH, "medwatch-v2");
  assert.equal(shortUrl(DEMO_URL), "albertzorzolan.github.io/UnivaBioBabson");
  assert.equal(DEFAULT_TEAM, "Albert Zorzolan and Neil Shah, Babson College");
  assert.equal(lib.PLANNED_DEMO_URL, undefined);
});

// --- The flawed-AI count: computed from eval/verifier-redteam.json, never by hand -------------------------------

test("liveEscapeCounts: the committed red-team set gives 6 sentences from 5 outputs", () => {
  const set = readJson("eval/verifier-redteam.json");
  const results = readJson("eval/results/verifier-redteam.json");
  const run = readFileSync(join(ROOT, "eval/results/ai-live.json"), "utf8");
  const c = liveEscapeCounts(set, { resultsTotal: results.liveEscapes.total, recordedRun: run });
  assert.equal(c.sentences, 6);
  assert.equal(c.outputs, 5);
  assert.equal(c.text, "at least 6");
  assert.equal(c.phrase, PHRASE);
  assert.deepEqual(c.ids, ["live-01", "live-02", "live-03", "live-04", "live-05", "live-06"]);
});

test("liveEscapeCounts: groups by check + finding/section/story and throws when the grouping or the counts drift", () => {
  const item = (id, extra) => ({ id, text: `sentence ${id}.`, tags: ["live-escape"], ...extra });
  const set = {
    items: [
      item("a", { check: "explanation", finding: "f1" }),
      item("b", { check: "explanation", finding: "f1" }), // same explanation as a
      item("c", { check: "refine", story: "s1" }),
      item("d", { check: "section", section: "reason" }),
      { id: "x", text: "not an escape", tags: ["engine"], check: "claims" },
    ],
  };
  const c = liveEscapeCounts(set);
  assert.deepEqual([c.sentences, c.outputs, c.phrase], [4, 3, "at least 4 flawed AI sentences (from 3 outputs)"]);
  assert.equal(liveEscapeCounts({ items: [item("a", { check: "section", section: "s" })] }).phrase, "at least 1 flawed AI sentence (from 1 output)");
  // An item that names no output (or two) cannot be grouped: the build stops instead of guessing.
  assert.throws(() => liveEscapeCounts({ items: [item("a", { check: "explanation" })] }), /cannot be grouped/);
  assert.throws(() => liveEscapeCounts({ items: [item("a", { check: "refine", story: "s", finding: "f" })] }), /cannot be grouped/);
  // The eval's own count must agree, and every sentence must be in the recorded run.
  assert.throws(() => liveEscapeCounts(set, { resultsTotal: 5 }), /liveEscapes\.total is 5/);
  assert.throws(() => liveEscapeCounts(set, { recordedRun: "sentence a. sentence b." }), /not in eval\/results\/ai-live\.json/);
  assert.throws(() => liveEscapeCounts({ items: [] }), /no items tagged live-escape/);
});

test("collectFacts: the flaw count and phrase come from the data", () => {
  process.env.SKIP_VITEST = "1";
  const f = collectFacts();
  assert.equal(f.ai.liveSlipped, 6);
  assert.equal(f.ai.liveSlippedOutputs, 5);
  assert.equal(f.ai.liveSlippedText, "at least 6");
  assert.equal(f.ai.liveSlippedPhrase, PHRASE);
});

test("facts.mjs keeps no hand count", () => {
  const src = readFileSync(join(ROOT, "scripts/submission/facts.mjs"), "utf8");
  assert.doesNotMatch(src, /HAND COUNT|recount liveSlipped by hand|liveSlippedText: "at least 3"/);
});

// --- Optional evidence ------------------------------------------------------------------------------------------

test("optionalEvidence: every field is null when the optional files are missing", () => {
  const e = optionalEvidence({});
  assert.deepEqual(e, { nlpBaselineF1Pct: null, nlpHeldoutCi95: null, nlpBaselineCi95: null, ablation: null, redteam: null, timelineNull: null });
  assert.equal(optionalEvidence({ nlp: { heldout: { micro: { f1: 0.9422 } } } }).nlpBaselineF1Pct, null);
});

test("optionalEvidence: formats like the app (percent, one decimal) and recomputes rates from counts", () => {
  const e = optionalEvidence({
    nlp: { heldout: { baseline: { micro: { f1: 0.7134 } }, ci95: { f1: [0.9012, 0.9733] }, baselineCi95: { f1: [0.65, 0.77] } } },
    redteam: { harmfulTotal: 163, caught: 72, catchRate: 0.9, validTotal: 87, falseRejects: 0, liveEscapes: { total: 6, nowBlocked: 0 } },
    timelineNull: { independent: { moderateRate: 0.112, strongRate: 0.003, n: 1000 }, clustered: { moderateRate: 0.858, strongRate: 0.61, stay: 0.8, n: 1000 } },
  });
  assert.equal(e.nlpBaselineF1Pct, "71.3%");
  assert.equal(e.nlpHeldoutCi95, "90.1–97.3%");
  assert.equal(e.nlpBaselineCi95, "65.0–77.0%");
  // A stale stored catchRate (0.9) is ignored: the printed rate always matches the printed "72 of 163".
  assert.equal(e.redteam.catchRate, "44.2%");
  assert.equal(e.redteam.falseRejectRate, "0.0%");
  assert.deepEqual(e.redteam.liveEscapes, { total: 6, nowBlocked: 0 });
  assert.deepEqual(e.timelineNull, {
    independent: { moderate: "11.2%", strong: "0.3%", n: 1000, stay: null, gated: null },
    clustered: { moderate: "85.8%", strong: "61.0%", n: 1000, stay: 0.8, gated: null },
    runsGate: false,
    power: { independent: null, clustered: null },
  });
});

test("optionalEvidence: power rows are matched on stay, and the corrected third-probe count is read", () => {
  const t = optionalEvidence({
    timelineNull: {
      independent: { moderateRate: 0.112 },
      clustered: { moderateRate: 0.858, stay: 0.8 },
      // Reordered on purpose: the clustered row first.
      power: [
        { stay: 0.8, metric: "dizziness", detectionRate: 0.376, gatedDetectionRate: 0.233, n: 1000 },
        { stay: 0, metric: "dizziness", detectionRate: 0.392, gatedDetectionRate: 0.325, n: 1000 },
      ],
    },
  }).timelineNull;
  assert.deepEqual(t.power, { independent: { tests: "39.2%", gated: "32.5%", n: 1000 }, clustered: { tests: "37.6%", gated: "23.3%", n: 1000 } });
  // The committed file gives the figure EVALUATION.md quotes.
  const real = optionalEvidence({ timelineNull: readJson("eval/results/timeline-null.json") }).timelineNull;
  assert.equal(real.power.independent.tests, "39.2%");
  const rt = optionalEvidence({
    redteam: { harmfulTotal: 163, caught: 163, postFixProbe3: { total: 22, caught: 10, withCorrectedLabel: { total: 23, caught: 10 } } },
  }).redteam;
  assert.deepEqual(rt.heldOutProbe.corrected, { total: 23, caught: 10 });
});

test("optionalEvidence: gated timeline rates are optional and read only from valid fractions", () => {
  const base = { independent: { moderateRate: 0.112, n: 1000 }, clustered: { moderateRate: 0.858, stay: 0.8, n: 1000, gated: { moderateRate: 0.21, strongRate: 0.05, n: 1000 } } };
  const t = optionalEvidence({ timelineNull: { ...base, runsCheck: { gate: true } } }).timelineNull;
  assert.deepEqual(t.clustered.gated, { moderate: "21.0%", strong: "5.0%", n: 1000 });
  assert.equal(t.runsGate, true);
  // gate must be exactly true; a malformed gated rate is dropped.
  assert.equal(optionalEvidence({ timelineNull: { ...base, runsCheck: { gate: "yes" } } }).timelineNull.runsGate, false);
  const bad = optionalEvidence({ timelineNull: { ...base, clustered: { ...base.clustered, gated: { moderateRate: 21 } } } }).timelineNull;
  assert.equal(bad.clustered.gated, null);
});

test("optionalEvidence: malformed values are dropped, not printed", () => {
  const e = optionalEvidence({
    nlp: { heldout: { ci95: { f1: [0.98, 0.9] } } }, // lo > hi
    ablation: { runs: [{ name: "full", passed: 57, total: 57 }, { name: "bad", passed: 60, total: 57 }] },
    redteam: { harmfulTotal: 10, caught: 11 },
    timelineNull: { independent: { moderateRate: 4.1 } }, // a percent, not a fraction
  });
  assert.equal(e.nlpHeldoutCi95, null);
  assert.equal(e.ablation, null); // the only failing-looking run is invalid; the full run alone shows nothing
  assert.equal(e.redteam, null);
  assert.equal(e.timelineNull, null);
});

test("optionalEvidence: ablation range uses only runs that fail some cases", () => {
  const e = optionalEvidence({
    ablation: {
      runs: [
        { name: "production", passed: 57, total: 57 },
        { name: "reverse order", passed: 57, total: 57 },
        { name: "no cascades", passed: 49, total: 57 },
        { name: "ACB zero", passed: 33, total: 57 },
      ],
    },
  });
  assert.deepEqual({ failing: e.ablation.failing, min: e.ablation.minPassed, max: e.ablation.maxPassed, total: e.ablation.total }, { failing: 2, min: 33, max: 49, total: 57 });
});

/** The shape of eval/results/verifier-redteam.json as of 2026-10-17 21:30 EDT (trimmed to the fields facts.mjs reads). */
const REDTEAM_CURRENT = {
  harmfulTotal: 163,
  caught: 163,
  validTotal: 87,
  falseRejects: 0,
  liveEscapes: { total: 6, nowBlocked: 6 },
  postFixProbe: { note: "… since the second review round … no longer held out", total: 18, caught: 1, heldOut: false },
  postFixProbeAfterTuning: { total: 18, caught: 4, missed: [] },
  postFixProbe2: { note: "… not used to change any rule", total: 20, caught: 12, validTotal: 10, falseRejects: 0, missed: [] },
  before: { harmfulTotal: 163, caught: 72, validTotal: 87, falseRejects: 0, postFixProbe: { total: 18, caught: 1 } },
};

test("optionalEvidence: reads the as-submitted count and both probes, defensively (check-facts prints them)", () => {
  const rt = optionalEvidence({ redteam: REDTEAM_CURRENT }).redteam;
  assert.deepEqual(rt.before, { caught: 72, harmfulTotal: 163 });
  assert.deepEqual(rt.postFixProbe, { total: 18, caught: 1, heldOut: false });
  assert.deepEqual(rt.postFixProbe2, { total: 20, caught: 12, validTotal: 10, falseRejects: 0, heldOut: true });
  assert.deepEqual(rt.heldOutProbe, rt.postFixProbe2);
  // Once the file marks the second probe as tuned on, it is never the held-out probe; the third one is.
  const tuned = optionalEvidence({
    redteam: { ...REDTEAM_CURRENT, postFixProbe2: { ...REDTEAM_CURRENT.postFixProbe2, heldOut: false }, postFixProbe3: { total: 22, caught: 10, validTotal: 12, falseRejects: 0, heldOut: true } },
  }).redteam;
  assert.equal(tuned.postFixProbe2.heldOut, false);
  assert.deepEqual(tuned.heldOutProbe, { total: 22, caught: 10, validTotal: 12, falseRejects: 0, heldOut: true, corrected: null });
  assert.equal(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, postFixProbe2: { ...REDTEAM_CURRENT.postFixProbe2, heldOut: false } } }).redteam.heldOutProbe, null);
  assert.equal(rt.postFixUnreadable, false);
  assert.equal(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, postFixProbe2: undefined } }).redteam.heldOutProbe, null);
  assert.equal(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, before: { harmfulTotal: 150, caught: 70 } } }).redteam.before, null);
  for (const broken of [{ postFixProbe: { total: 18, caught: 19 } }, { postFixProbe2: { total: "20", caught: 12 } }]) {
    assert.equal(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, ...broken } }).redteam.postFixUnreadable, true, JSON.stringify(broken));
  }
});

// --- One-pager text ------------------------------------------------------------------------------------------

test("evidenceItems: one-line bullets (NLP, medication review, on-device AI, tests) plus the wrapping timeline bullet; FHIR only fills a gap", () => {
  const plain = evidenceItems(baseFacts());
  assert.equal(plain.length, 5);
  assert.match(plain[0], /^<b>Clinical NLP:<\/b> .*94\.2%.*dev set \(245 stories\) 99\.8%\.$/);
  assert.match(plain[1], /57 of 57<\/span> synthetic cases pass \(a written spec, not clinical validity\), 295 of 295 expectations\.$/);
  // The chance rate moved here from "What it does", framed as the reason a flag is only a question; it may wrap.
  assert.deepEqual(plain[2], {
    html: "<b>Timeline:</b> with no real change, about 1 in 10 simulated medicine changes still showed a large or clear difference, which is why a flag is only ever a question.",
    wrap: true,
  });
  assert.equal(plain[3], `<b>On-device AI:</b> 0 external requests in a recorded run; ${PHRASE} got through, so AI stays optional.`);
  assert.match(plain[4], /^<b>Tests:<\/b> 1,245 unit tests pass · 20 of 20 end-to-end checks pass · 46 axe scans, 0 violations\.$/);
  // No chance-rate source at all: no timeline bullet.
  assert.equal(evidenceItems(baseFacts({ timelineAbout: null })).length, 4);
  const full = optionalEvidence({
    nlp: { heldout: { baseline: { micro: { f1: 0.7034 } }, ci95: { f1: [0.907, 0.971] } } },
    ablation: { runs: [{ name: "a", passed: 33, total: 57 }, { name: "b", passed: 54, total: 57 }] },
  });
  const f = baseFacts();
  Object.assign(f.nlp, { heldoutCi95: full.nlpHeldoutCi95, baselineF1Pct: full.nlpBaselineF1Pct });
  f.meds.ablation = full.ablation;
  const items = evidenceItems(f);
  assert.match(items[0], /94\.2%<\/span> \(95% CI 90\.7–97\.1%\) on 70 held-out stories never used for tuning; lexicon-only baseline 70\.3%\./);
  assert.match(items[1], /; with one piece of knowledge removed, 33–54 of 57\.$/);
  // No tests to print: FHIR takes the slot (after the timeline bullet, which does not count as a one-line bullet).
  const noTests = evidenceItems(baseFacts({ tests: null }));
  assert.equal(noTests.length, 5);
  assert.match(noTests[4], /^<b>FHIR:/);
  // Without a flaw count the AI bullet makes no count claim at all.
  const noCount = evidenceItems(baseFacts({ ai: { externalRequests: 0, liveSlippedPhrase: null } }));
  assert.doesNotMatch(noCount[3], /flawed|at least/);
  // Fallback: no count, but the recorded run's own verdict still discloses flawed output, without a number.
  const verdictOnly = evidenceItems(baseFacts({ ai: { externalRequests: 0, liveSlippedPhrase: null, liveFlawedOnBranch: true } }));
  assert.match(verdictOnly[3], /its review found flawed outputs that got through \(ai-live\.json\), so AI stays optional\.$/);
  assert.doesNotMatch(verdictOnly[3], /\d+ flawed|at least|sentences/);
});

test("testsItem: this tree's runs, or the branch's recorded counts with their date", () => {
  assert.equal(testsItem(null), null);
  assert.equal(testsItem({ recorded: recordedTests(EVAL_MD_AT_BRANCH) }), "<b>Tests</b> (recorded 2026-10-11): 1,245 unit tests pass · 20 of 20 end-to-end checks pass · 46 axe scans, 0 violations.");
  assert.match(testsItem({ vitest: { passed: 1452, failed: 1 }, e2eChecks: 21, e2ePassed: 21, e2eRun: 21, a11yScans: null }), /1,452 unit tests pass \(1 fail\) · 21 of 21 .* · axe scans of every screen\.$/);
});

test("falseAlarmText: caregiver size words; clustered rate with its assumption; gated rate only when the app gates", () => {
  const t = optionalEvidence({
    timelineNull: { independent: { moderateRate: 0.112, n: 1000 }, clustered: { moderateRate: 0.858, stay: 0.8, n: 1000, gated: { moderateRate: 0.21 } } },
  }).timelineNull;
  const text = falseAlarmText(baseFacts({ timelineNull: t }));
  assert.equal(text, "With no real change, 11.2% of simulated medicine changes still showed a large or clear difference (85.8% if symptoms come in runs of days, an assumed level).");
  assert.doesNotMatch(text, /moderate|strong/);
  assert.match(falseAlarmText(baseFacts({ timelineNull: { ...t, runsGate: true } })), /85\.8% if symptoms come in runs of days, an assumed level; 21\.0% with the app’s check for runs of days\)\.$/);
  // No results file (as on the linked branch): the app's own wording.
  assert.equal(falseAlarmText(baseFacts()), "With no real change, about 1 in 10 simulated medicine changes still showed a large or clear difference.");
  assert.equal(falseAlarmText(baseFacts({ timelineAbout: null })), null);
  assert.equal(falseAlarmAbout('"In simulated diaries with no real change, about 1 in 10 medicine changes still showed a moderate signal and "'), "about 1 in 10");
  assert.equal(falseAlarmAbout("nothing here"), null);
});

test("onePagerHtml: one set of links, one screenshot, team line, footnoted citations, taper caveat", () => {
  const html = onePagerHtml({ facts: baseFacts(), shots, team: DEFAULT_TEAM, videoUrl: null });
  const count = (s) => html.split(s).length - 1;
  // The live demo is linked twice (header and the guided-tour button in the visit panel), the code once, the video
  // is named once, and the call to action is the Welcome screen's ("Try as Alex" is no longer used).
  assert.equal(count(`href="${DEMO_URL}"`), 2);
  assert.equal(DEMO_CTA, "Take the 2-minute guided tour");
  assert.ok(html.includes(`>${DEMO_CTA}</a>`));
  assert.ok(!html.includes("Try as Alex"));
  assert.equal(count(`href="${CODE_URL}"`), 1);
  assert.equal(count("<b>Video:</b>"), 1);
  assert.ok(html.includes("<b>Video:</b> on the Devpost page"));
  assert.ok(html.includes("<b>Team:</b> Albert Zorzolan and Neil Shah, Babson College"));
  assert.ok(html.includes("notice what changes after a medicine change, and bring a clear question to the visit"));
  // One screenshot: the Overview crop, captioned.
  assert.equal(count("<img "), 1);
  assert.ok(html.includes("What Alex brings to the visit"));
  // The visit panel carries three numbered callouts: the counts, the not-a-cause reminder and the visit question.
  const callouts = html.slice(html.indexOf('<ol class="callouts">'), html.indexOf("</ol>", html.indexOf('<ol class="callouts">')));
  assert.equal(callouts.split("<li>").length - 1, 3);
  assert.match(callouts, /9 of 14 vs 2 of 19<\/b> answered days/);
  assert.match(callouts, /A change in what was recorded,<\/b> not what caused it/);
  assert.match(callouts, /One question<\/b> for her clinician/);
  assert.ok(html.includes(`alt="The caregiver Overview in the live demo (fictional data): ${shots.visitCardText}"`));
  // Where the brief is used, with the CFR citations only in the footnotes.
  assert.ok(html.includes("For the Medicare <b>Annual Wellness Visit</b> (whose cognitive check must consider concerns raised by family<sup>1</sup>) or a pharmacist’s <b>medication review</b>"));
  const notes = html.slice(html.indexOf('class="fine notes"'));
  const body = html.slice(0, html.indexOf('class="fine notes"'));
  assert.doesNotMatch(body.replace(/<!--[\s\S]*?-->/g, ""), /CFR/);
  assert.match(notes, /42 CFR 410\.15/);
  assert.match(notes, /42 CFR 423\.153\(d\)\(1\)\(vii\)\(B\)\(2\)/);
  assert.ok(html.includes("(the brochure included a taper plan; Kinwise leaves that to the clinician)"));
  // Canonical flaw phrase, caregiver size words, no stale wording.
  assert.ok(html.includes(PHRASE));
  assert.ok(html.includes("large or clear difference"));
  for (const stale of ["Team member", "planned, not yet", "not yet deployed", "Public hosted demo", "possible side effects early", "Budnitz", "moderate-or-strong", "at least 3", "19 of 51", "Demo video:"]) {
    assert.ok(!html.includes(stale), `stale text: ${stale}`);
  }
  const working = html.slice(html.indexOf("<h3>Working</h3>"), html.indexOf("<h3>Partial</h3>"));
  const partial = html.slice(html.indexOf("<h3>Partial</h3>"), html.indexOf("<h3>Planned"));
  assert.match(working, /Public live demo/);
  assert.match(partial, /LLM: WebGPU only; code check not airtight/);
  assert.match(partial, /no dose\/allergy checks/);
  assert.match(partial, /Interactions: Beers 2023 combination table only/);
  assert.match(partial, /Runs check not yet gating/);
  // The chance rate is in Evidence & rigor, not in "What it does".
  const steps = html.slice(html.indexOf('<ol class="steps">'), html.indexOf("</ol>", html.indexOf('<ol class="steps">')));
  assert.doesNotMatch(steps, /simulated|large or clear/);
  const evidence = html.slice(html.indexOf('<ul class="ev">'));
  assert.match(evidence, /<li class="wrap"><b>Timeline:<\/b> .*which is why a flag is only ever a question\./);
});

test("changeStep: the runs check and the sleep averages only when facts.demo has them", () => {
  assert.equal(
    changeStep(baseFacts()),
    "<b>See what changed.</b> Dizziness on <b>2 of 19</b> answered days before lorazepam, <b>9 of 14</b> after (Fisher’s exact test).",
  );
  const full = changeStep(baseFacts({ demo: { runsCheckP: "0.007", sleep: { after: "3.4", before: "2.6", afterDays: 14, beforeDays: 20 } } }));
  assert.equal(
    full,
    "<b>See what changed.</b> Dizziness on <b>2 of 19</b> answered days before lorazepam, <b>9 of 14</b> after (Fisher’s exact test; holds when 4-day runs are shuffled, p = 0.007, seeded diary). Sleep ratings were higher too (after vs before): <b>3.4 vs 2.6</b> of 5.",
  );
});

test("demoFacts: reads the runs-check p, the Fisher p and the brief's sleep line from the committed files", () => {
  const f = demoFacts({
    evaluationMd: readFileSync(join(ROOT, "docs/EVALUATION.md"), "utf8"),
    seedTimelineTest: readFileSync(join(ROOT, "src/engine/timeline/seed.timeline.test.ts"), "utf8"),
    templateTest: readFileSync(join(ROOT, "src/engine/brief/template.test.ts"), "utf8"),
  });
  assert.equal(f.runsCheckP, "0.007");
  assert.equal(f.runsCheckPinned, f.runsCheckP);
  assert.equal(f.fisherP, "0.0023");
  assert.deepEqual(f.sleep, { after: "3.4", afterDays: 14, before: "2.6", beforeDays: 20 });
  // Nothing found: every field null (as at 375e1e0 for the runs check and the sleep line).
  assert.deepEqual(demoFacts({}), { runsCheckP: null, runsCheckPinned: null, fisherP: null, sleep: null });
  // The fallback keeps the branch's own record: the submitted commit has neither the runs check nor the sleep line.
  const b = branchOnlyFacts(baseFacts({ demo: f }), { branch: "medwatch-v2", gapKeys: [], show: branchFiles() });
  assert.deepEqual(b.demo, { runsCheckP: null, runsCheckPinned: null, fisherP: null, sleep: null });
});

test("onePagerHtml: a video link replaces the Devpost pointer", () => {
  const html = onePagerHtml({ facts: baseFacts(), shots, team: DEFAULT_TEAM, videoUrl: "https://youtu.be/abc" });
  assert.ok(html.includes('<b>Video:</b> <a href="https://youtu.be/abc">youtu.be/abc</a>'));
  assert.ok(!html.includes("on the Devpost page"));
});

test("onePagerHtml: refuses to build without a team, or a fallback without branch facts", () => {
  assert.throws(() => onePagerHtml({ facts: baseFacts(), shots, team: "  " }), /team is empty/);
  assert.throws(() => onePagerHtml({ facts: baseFacts(), shots }), /team is empty/);
  assert.throws(() => onePagerHtml({ facts: baseFacts(), shots, team: DEFAULT_TEAM, linkedBranchOnly: true }), /needs facts from branchOnlyFacts/);
});

// --- Fallback one-pager: only evidence that exists at the linked branch -------------------------------------------

/** Results files in the shape the branch holds them, giving the same figures as baseFacts(). */
const BRANCH_NLP = {
  heldout: { cases: 70, micro: { support: 116, f1: 0.9422, tp: 106, fp: 3, fn: 10 }, negation: { correct: 30, goldNegatives: 35 } },
  dev: { cases: 245, micro: { f1: 0.9985 }, latency: { meanMs: 0.3 } },
};
const BRANCH_MEDS = { summary: { casesPassed: 57, cases: 57, expectationsPassed: 295, expectations: 295 }, kbVersion: "kb-test" };
const BRANCH_META = { counts: { drugs: 427, beers: 89, cascades: 26 }, version: "kb-test" };
const BRANCH_LIVE = {
  machine: { cpu: "Apple M-series" },
  externalRequests: [],
  load: { cachedLoadMs: 4000 },
  brief: { wallMs: 30000 },
  ask: [],
  outputs: ["sentence one.", "sentence two."],
  verdict: "Verifier catches a lot but let through: a garbled sentence.",
};

/** git show stand-in: the files as they are at the submitted commit (no timeline-null, red-team or ablation files). */
const branchFiles = (overrides = {}) => {
  const files = {
    "src/engine/timeline/rules.ts": '"In simulated diaries with no real change, about 1 in 10 medicine changes still showed a moderate signal and "',
    "docs/EVALUATION.md": EVAL_MD_AT_BRANCH,
    "eval/results/ai-live.json": JSON.stringify(BRANCH_LIVE),
    "eval/results/nlp-eval.json": JSON.stringify(BRANCH_NLP),
    "eval/results/meds-eval.json": JSON.stringify(BRANCH_MEDS),
    "src/kb/data/meta.json": JSON.stringify(BRANCH_META),
    ...overrides,
  };
  return (rel) => files[rel] ?? null;
};

test("recordedTests: reads the §7 rows; partial or missing rows give null parts", () => {
  assert.deepEqual(recordedTests(EVAL_MD_AT_BRANCH), {
    unit: { total: 1246, passed: 1245, skipped: 1, date: "2026-10-11" },
    e2e: { passed: 20, checks: 20, date: "2026-10-11" },
    a11y: { scans: 46, violations: 0, date: "2026-10-11" },
  });
  assert.equal(recordedTests("no table here"), null);
  // This tree's §7 records the run behind the submission PDFs, so the one-pager's test counts trace to a committed file.
  const here = recordedTests(readFileSync(join(ROOT, "docs/EVALUATION.md"), "utf8"));
  assert.deepEqual(here, {
    unit: { total: 2783, passed: 2782, skipped: 1, date: "2026-10-18" },
    e2e: { passed: 22, checks: 22, date: "2026-10-18" },
    a11y: { scans: 46, violations: 0, date: "2026-10-18" },
  });
  assert.equal(recordedTests(EVAL_MD_AT_BRANCH.split("\n")[1]).unit, null);
});

test("branchOnlyFacts: drops every fact whose source is missing at the branch and falls back to the branch's own record", () => {
  const f = baseFacts({
    verifier: optionalEvidence({ redteam: REDTEAM_CURRENT }).redteam,
    timelineNull: optionalEvidence({ timelineNull: { independent: { moderateRate: 0.112 } } }).timelineNull,
  });
  Object.assign(f.nlp, { heldoutCi95: "90.7–97.1%", baselineF1Pct: "70.3%", baselineCi95: "60–80%" });
  f.meds.ablation = { minPassed: 33, maxPassed: 54, total: 57 };
  Object.assign(f.ai, { liveSlippedIds: ["a", "b"], liveSlippedTexts: ["sentence one.", "sentence two."] });
  const keys = ["ablation", "redteam", "timelineNull", "nlpBaseline", "nlpCi95", "verifier"];
  const b = branchOnlyFacts(f, { branch: "medwatch-v2", gapKeys: keys, show: branchFiles() });
  assert.equal(b.linkedBranch, "medwatch-v2");
  assert.deepEqual([b.nlp.heldoutCi95, b.nlp.baselineF1Pct, b.nlp.baselineCi95, b.meds.ablation, b.verifier, b.timelineNull], [null, null, null, null, null, null]);
  assert.equal(b.timelineAbout, "about 1 in 10");
  assert.deepEqual(b.tests.recorded.unit, { total: 1246, passed: 1245, skipped: 1, date: "2026-10-11" });
  // The branch has the live-escape items (no "liveEscapes" gap) and every sentence is in its ai-live.json: count stays.
  assert.equal(b.ai.liveSlippedPhrase, PHRASE);
  assert.equal(b.ai.liveFlawedOnBranch, true);
  // Without the live-escape items at the branch the count cannot be reproduced there, even though the sentences are.
  const noSet = branchOnlyFacts(f, { branch: "medwatch-v2", gapKeys: [...keys, "liveEscapes"], show: branchFiles() });
  assert.deepEqual([noSet.ai.liveSlipped, noSet.ai.liveSlippedOutputs, noSet.ai.liveSlippedText, noSet.ai.liveSlippedPhrase], [null, null, null, null]);
  assert.equal(noSet.ai.liveFlawedOnBranch, true);
  // The input is not changed.
  assert.equal(f.nlp.baselineF1Pct, "70.3%");
  // A sentence missing from the branch's run drops the count; a branch without §7 rows prints no tests.
  const noFlaws = JSON.stringify({ ...BRANCH_LIVE, outputs: [], verdict: undefined });
  const c = branchOnlyFacts(f, { branch: "x", gapKeys: keys, show: branchFiles({ "eval/results/ai-live.json": noFlaws, "docs/EVALUATION.md": "" }) });
  assert.equal(c.ai.liveSlippedPhrase, null);
  assert.equal(c.ai.liveFlawedOnBranch, false);
  assert.equal(c.tests, null);
  // No gaps: optional evidence is kept, read from the branch's own files (the tests switch to the branch's record).
  const withBaseline = { ...BRANCH_NLP, heldout: { ...BRANCH_NLP.heldout, baseline: { micro: { f1: 0.703 } } } };
  const d = branchOnlyFacts(f, { branch: "x", gapKeys: [], show: branchFiles({ "eval/results/nlp-eval.json": JSON.stringify(withBaseline) }) });
  assert.equal(d.nlp.baselineF1Pct, "70.3%");
  assert.equal(d.meds.ablation.total, 57);
});

test("branchOnlyFacts: figures come from the branch's own results files, never from this tree", () => {
  const f = baseFacts();
  Object.assign(f.nlp, { heldoutF1Pct: "95.0%", devCases: 261 });
  f.meds.cases = "58 of 58";
  f.kb.drugs = 430;
  f.ai.externalRequests = 3;
  const b = branchOnlyFacts(f, { branch: "medwatch-v2", gapKeys: [], show: branchFiles() });
  assert.equal(b.nlp.heldoutF1Pct, "94.2%");
  assert.equal(b.nlp.devCases, 245);
  assert.equal(b.meds.cases, "57 of 57");
  assert.equal(b.kb.drugs, 427);
  assert.equal(b.ai.externalRequests, 0);
  const html = onePagerHtml({ facts: b, shots, team: DEFAULT_TEAM, videoUrl: null, linkedBranchOnly: true });
  assert.ok(!html.includes("95.0%"), "fallback printed the working-tree held-out F1");
  assert.ok(html.includes("94.2%"));
  // A branch without one of the files stops the build rather than printing this tree's figure.
  assert.throws(() => branchOnlyFacts(f, { branch: "medwatch-v2", show: branchFiles({ "eval/results/nlp-eval.json": null }) }), /nlp-eval\.json is missing/);
});

test("fallback one-pager: no baseline, CI, ablation, red-team or gated figures; the branch's 1 in 10 and test record", () => {
  const f = baseFacts({ timelineNull: optionalEvidence({ timelineNull: { independent: { moderateRate: 0.112 }, clustered: { moderateRate: 0.858, stay: 0.8 } } }).timelineNull });
  Object.assign(f.nlp, { heldoutCi95: "90.7–97.1%", baselineF1Pct: "70.3%" });
  f.meds.ablation = { minPassed: 33, maxPassed: 54, total: 57 };
  Object.assign(f.ai, { liveSlippedIds: ["a"], liveSlippedTexts: ["sentence one."] });
  const b = branchOnlyFacts(f, { branch: "medwatch-v2", gapKeys: ["ablation", "redteam", "timelineNull", "nlpBaseline", "nlpCi95", "verifier", "liveEscapes"], show: branchFiles() });
  const html = onePagerHtml({ facts: b, shots, team: DEFAULT_TEAM, videoUrl: null, linkedBranchOnly: true });
  for (const absent of ["lexicon-only baseline", "95% CI", "knowledge removed", "11.2%", "85.8%", "harmful drafts", "flawed AI sentences", "6 flawed", "5 outputs", "Runs check", "runs are shuffled", "Sleep ratings"]) {
    assert.ok(!html.includes(absent), absent);
  }
  // The flaw disclosure stays, without a number, sourced from the branch's ai-live.json verdict.
  assert.ok(html.includes("its review found flawed outputs that got through (ai-live.json), so AI stays optional."));
  assert.ok(html.includes("about 1 in 10 simulated medicine changes still showed a large or clear difference"));
  assert.ok(html.includes("<b>Tests</b> (recorded 2026-10-11): 1,245 unit tests pass · 20 of 20 end-to-end checks pass"));
  assert.ok(html.includes("dev set (245 stories) 99.8%"));
  assert.ok(html.includes("Each figure below can be reproduced from the code at medwatch-v2."));
  // The screenshot comes from this tree, so the fallback never calls it the live demo.
  assert.ok(html.includes("The caregiver Overview in the latest build (fictional data; the live demo shows an earlier layout of this card)"));
  assert.ok(!html.includes("Overview in the live demo"));
});

test("branchOnlyFacts + evidenceNotOnBranch on this repo: the fallback prints nothing the branch lacks", () => {
  process.env.SKIP_VITEST = "1";
  const ev = evidenceNotOnBranch(REPO_BRANCH);
  if (ev.gaps == null) return; // branch not in this clone
  assert.equal(ev.keys.length, ev.gaps.length);
  const b = branchOnlyFacts(collectFacts(), { branch: REPO_BRANCH, gapKeys: ev.keys });
  if (ev.keys.includes("nlpBaseline")) assert.equal(b.nlp.baselineF1Pct, null);
  if (ev.keys.includes("nlpCi95")) assert.equal(b.nlp.heldoutCi95, null);
  if (ev.keys.includes("ablation")) assert.equal(b.meds.ablation, null);
  if (ev.keys.includes("redteam") || ev.keys.includes("verifier")) assert.equal(b.verifier, null);
  if (ev.keys.includes("timelineNull")) assert.equal(b.timelineNull, null);
  // eval/verifier-redteam.json (the flawed-AI count's source) is reported whenever the branch lacks its live-escape items.
  if (ev.keys.includes("liveEscapes")) {
    assert.deepEqual([b.ai.liveSlipped, b.ai.liveSlippedOutputs, b.ai.liveSlippedText, b.ai.liveSlippedPhrase], [null, null, null, null]);
    const html = onePagerHtml({ facts: b, shots, team: DEFAULT_TEAM, videoUrl: null, linkedBranchOnly: true });
    assert.ok(!/flawed AI sentence|\d+ flawed/.test(html), "fallback prints a flaw count the branch cannot reproduce");
  }
});

test("liveRunVerdictNotesFlaws: true only for an ai-live.json whose verdict says something was let through", () => {
  assert.equal(liveRunVerdictNotesFlaws(JSON.stringify({ verdict: "Verifier catches a lot but let through: x" })), true);
  assert.equal(liveRunVerdictNotesFlaws(JSON.stringify({ verdict: "All sentences passed." })), false);
  assert.equal(liveRunVerdictNotesFlaws("{}"), false);
  assert.equal(liveRunVerdictNotesFlaws("not json"), false);
  assert.equal(liveRunVerdictNotesFlaws(null), false);
});

// --- Small helpers ----------------------------------------------------------------------------------------------

test("fixedCaptureTime: today at 10:30 local", () => {
  const d = fixedCaptureTime(new Date(2026, 9, 17, 3, 53, 12));
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()], [2026, 9, 17, 10, 30, 0]);
});

test("unionBox: the box around several element boxes, padded and clamped at 0", () => {
  assert.deepEqual(unionBox([{ x: 10, y: 20, width: 100, height: 50 }, { x: 150, y: 5, width: 40, height: 40 }], 4), { x: 6, y: 1, width: 188, height: 73 });
  assert.deepEqual(unionBox([{ x: 2, y: 2, width: 10, height: 10 }], 8), { x: 0, y: 0, width: 20, height: 20 });
});

test("e2eText and testRunProblems: complete, partial and failing e2e runs", () => {
  const t = (o) => ({ e2eChecks: 21, a11ySerious: 0, ...o });
  assert.equal(e2eText(t({ e2ePassed: 21, e2eRun: 21, e2eFailed: 0 })), "21 of 21 end-to-end checks pass");
  assert.deepEqual(testRunProblems(t({ e2ePassed: 21, e2eRun: 21, e2eFailed: 0 })), []);
  const partial = t({ e2ePassed: 5, e2eRun: 5, e2eFailed: 0 });
  assert.equal(e2eText(partial), "5 of 21 end-to-end checks pass (0 fail / 16 not run)");
  assert.match(testRunProblems(partial)[0], /partial: 5 of 21 checks ran/);
  const failing = t({ e2ePassed: 19, e2eRun: 21, e2eFailed: 2 });
  assert.equal(e2eText(failing), "19 of 21 end-to-end checks pass (2 fail / 0 not run)");
  assert.match(testRunProblems(failing).join(" "), /2 end-to-end check\(s\) failed/);
  assert.equal(e2eText(t({ e2ePassed: null, e2eRun: null })), "21 end-to-end checks");
  assert.deepEqual(testRunProblems(t({ e2ePassed: null, e2eRun: null })), []);
  assert.match(testRunProblems(t({ e2eRun: null, a11ySerious: 2 })).join(" "), /2 serious\/critical/);
});

test("facts: dev F1 percent is floored like the decimal (0.9985 → 99.8%, never above measured)", () => {
  process.env.SKIP_VITEST = "1";
  const f = collectFacts();
  const dev = readJson("eval/results/nlp-eval.json").dev.micro.f1;
  assert.ok(parseFloat(f.nlp.devF1Pct) <= dev * 100 + 1e-9, `${f.nlp.devF1Pct} > ${dev}`);
  assert.equal(parseFloat(f.nlp.devF1Pct).toFixed(1), (Math.floor(dev * 1000 + 1e-9) / 10).toFixed(1));
});

// --- check-facts rules ------------------------------------------------------------------------------------------

test("check-facts: number checks accept the canonical figures and flag wrong ones", () => {
  const f = {
    nlp: { heldoutF1: "0.942", heldoutF1Pct: "94.2%", devF1: "0.998", devF1Pct: "99.9%", baselineF1Pct: "70.3%" },
    meds: { casesPassed: 57, casesTotal: 57, expectations: "295 of 295", ablation: { runs: [{ passed: 33 }] } },
    fhir: { resources: 270 },
    kb: { drugs: 427, brands: 766, combos: 124, beers: 89, cascades: 26, fridClasses: 15, acbListed: 100 },
  };
  const run = (text) => numberChecks(f).flatMap((c) => c.run(text).map((r) => ({ label: c.label, ...r })));
  const good = run(
    "micro-F1 **0.942** and dev micro-F1 0.998; 94.2 percent micro-F1; 57 of 57 medication-review test cases; 57/57 cases; " +
      "33/57 cases with ACB zeroed; 295 of 295 expectations; 270 resources; 427 medicines, 766 brand names, 124 combination products, " +
      "89 AGS Beers 2023 rules, 26 prescribing cascades, 15 fall-risk classes, 100 scored medicines; Margaret's 8 medicines; 4 of 7 cases",
  );
  assert.ok(good.length >= 13, `expected the figures to be found, got ${good.length}`);
  assert.deepEqual(good.filter((r) => !r.ok), []);
  const bad = run("micro-F1 0.951; 93.0% micro-F1; 56 of 57 cases; 57 of 58 medication cases; 271 resources; 430 medicines; 90 Beers rules; 294 of 296 expectations");
  assert.deepEqual(
    bad.filter((r) => !r.ok).map((r) => r.label),
    ["NLP micro-F1 (decimal)", "NLP micro-F1 (percent)", "Medication-review cases", "Medication-review cases", "Medication-review expectations (total)", "FHIR resources", "KB medicines", "KB Beers rules"],
  );
});

test("check-facts: stale wording rules (old flaw count, hand-labelled, unverified Gandhi counts, planned demo)", () => {
  for (const s of ["not yet deployed", "Planned live demo", "[Team member", "at least 3 flawed", "labelled by hand", "hand-labelled", "19 of 51", "32 of 51"]) {
    assert.ok(STALE.includes(s), s);
  }
  const hits = (text) => STALE.filter((s) => staleRegex(s).test(text));
  assert.deepEqual(hits("In the live run the verifier let At least 3 flawed outputs through."), ["at least 3 flawed"]);
  assert.deepEqual(hits("Hundreds of fictional stories, labelled by hand."), ["labelled by hand"]);
  assert.deepEqual(hits("over hundreds of Hand-labelled stories"), ["hand-labelled"]);
  assert.deepEqual(hits("In primary care, 19 of 51 (37%) ameliorable events"), ["19 of 51"]);
  assert.deepEqual(hits("the planned live demo is not yet deployed"), ["not yet deployed", "Planned live demo"]);
  // Whole words only, and the canonical phrase is not stale.
  assert.deepEqual(hits(`119 of 512 · at least 30 flawed · ${PHRASE} · labelled by handwriting`), []);
});

test("check-facts: round-3 figures (demo p-values, sleep, chance rates, power, claim checker, flaw phrase) are checked", () => {
  const f = {
    nlp: { heldoutF1: "0.942", heldoutF1Pct: "94.2%", devF1: "0.998", devF1Pct: "99.8%", baselineF1Pct: "70.3%" },
    meds: { casesPassed: 57, casesTotal: 57, expectations: "295 of 295", ablation: null },
    fhir: { resources: 270 },
    kb: { drugs: 427, brands: 766, combos: 124, beers: 89, cascades: 26, fridClasses: 15, acbListed: 100 },
    demo: { fisherP: "0.0023", runsCheckP: "0.007", sleep: { after: "3.4", before: "2.6" } },
    timelineNull: { independent: { moderate: "11.2%" }, clustered: { moderate: "85.8%" }, power: { independent: { tests: "39.2%" } } },
    verifier: { caught: 163, harmfulTotal: 163, heldOutProbe: { total: 22, caught: 10, corrected: { total: 23, caught: 10 } } },
    ai: { liveSlippedPhrase: PHRASE },
  };
  const run = (text) => numberChecks(f).flatMap((c) => c.run(text).map((r) => ({ label: c.label, ...r })));
  const good = run(
    "Fisher p = 0.0023; runs check p = 0.007; sleep ratings were higher (3.4 vs 2.6 of 5); 11.2% of simulated medicine changes; " +
      "85.8% if symptoms come in long runs of days; The reproducible figure without\nany gate is 39.2%; catches all 163 harmful sentences " +
      `it was tuned on but only 10 of 23 on a later held-out probe; At least 6 flawed AI sentences (from 5 outputs)`,
  );
  assert.equal(good.length, 9);
  assert.deepEqual(good.filter((r) => !r.ok), []);
  const bad = run(
    "Fisher's exact test, p = 0.0024; runs check p = 0.010; (3.5 vs 2.6 of 5); 12.0% of simulated medicine changes; 80.0% if symptoms come in runs of days; " +
      "only 10 of 22 on a later held-out probe; all 162 harmful sentences; at least 3 flawed AI sentences (from 3 outputs)",
  );
  assert.equal(bad.filter((r) => !r.ok).length, 8);
  // A fact that is missing (e.g. no timeline-null.json) makes any printed figure for it an error.
  const missing = numberChecks({ ...f, timelineNull: null }).flatMap((c) => c.run("11.2% of simulated medicine changes"));
  assert.equal(missing.filter((r) => !r.ok).length, 1);
});

test("check-facts: paste region (no comment, no TODO, canonical Partial wording) and the rendered word count", () => {
  const doc = (body) => `<!--\nteam notes, TODO(team) allowed here\n-->\n# Kinwise\n\n## About the project (paste)\n\n${body}\n\n## Built with\n\nReact\n<!-- gallery -->\n`;
  assert.deepEqual(pasteRegionProblems(doc(`Text. | **Partial** | ${PARTIAL_KB} English only |`)), []);
  const bad = pasteRegionProblems(doc("Text <!-- TODO(team): fill --> more."));
  assert.deepEqual(bad.map((p) => p.msg.split(" ")[0]), ["HTML", "TODO", "the"]);
  assert.equal(bad[0].line, 8);
  assert.match(pasteRegionProblems("# no headings")[0].msg, /paste region not found/);
  assert.equal(pasteRegion(doc("x")).firstLine, 7);
  // Link targets, pipes and emphasis are not words a reader sees.
  assert.equal(renderedWordCount("**Live demo:** [the site](https://example.com/a b) | --- | → go"), 5);
});

test("DEVPOST files: paste region clean, 650–830 words, status on the first screen, rigor table linked from the README, canonical Partial row, team notes in the top block", () => {
  assert.deepEqual(PASTE_WORDS, { min: 650, target: 800, max: 830 });
  for (const rel of ["submission/DEVPOST.md", "submission/DEVPOST-if-not-pushed.md"]) {
    const md = readFileSync(join(ROOT, rel), "utf8");
    assert.deepEqual(pasteRegionProblems(md), [], rel);
    const region = pasteRegion(md).text;
    const words = renderedWordCount(region);
    // Judges asked for about 700 words. The text is written to 650–800; the upper bound adds about 30–45 for the
    // one-line-per-teammate notes the team writes under "Team" (TODO(team) in the file's top block says so).
    assert.ok(words >= PASTE_WORDS.min && words <= PASTE_WORDS.max, `${rel}: ${words} words in the paste region`);
    // First screen: the problem (gap line), what it does, an honest status line, then "Try it in 30 seconds" with
    // the live demo link.
    assert.match(region.trimStart(), /^\*\*The doctor sees the medicine list, the family sees the symptoms, and nobody lines them up\.\*\*/);
    const firstScreen = region.slice(0, region.indexOf("## What it does"));
    assert.ok(region.indexOf("## Try it in 30 seconds") > 0);
    assert.match(firstScreen, /\*\*Status:\*\* a working prototype on fictional data, not yet tested with real patients, caregivers or clinicians\./);
    assert.match(firstScreen, /\*\*Live demo:\*\* \[albertzorzolan\.github\.io\/UnivaBioBabson\]\(https:\/\/albertzorzolan\.github\.io\/UnivaBioBabson\/\)/);
    // "AI and rigor at a glance" is a short paragraph that links the README's table; the table itself is not pasted.
    const at = region.indexOf("## AI and rigor at a glance");
    const rigor = region.slice(at, region.indexOf("\n## ", at + 5));
    assert.equal(rigor.split("\n").filter((l) => l.startsWith("|")).length, 0, `${rel}: rigor table rows in the paste region`);
    assert.match(rigor, /\]\(https:\/\/github\.com\/albertzorzolan\/UnivaBioBabson\/blob\/medwatch-v2\/README\.md#(?:rigor-at-a-glance|evaluation-headline-numbers)\)/);
    // The checker is described by design, not as a guarantee; p-values stay in the README (plain language here).
    assert.ok(rigor.includes("a code checker is designed to drop unsupported, causal or advice sentences"), rel);
    assert.doesNotMatch(region, /checker drops\b/);
    assert.doesNotMatch(region, /\bp = 0\./);
    // "How it differs": the general-AI clause is the one sourced in kb-src/research/market-evidence.md §2 (row
    // "ChatGPT Health" and finding 4: cloud-based, non-deterministic, no geriatric criteria engine documented).
    assert.ok(region.includes("general AI assistants (ChatGPT Health) are cloud-based and non-deterministic, with no documented geriatric criteria engine"), rel);
    // Safety scope: the never-claim covers only the deterministic rules and templates, because flawed AI sentences
    // (a "can cause" one among them, eval/results/ai-live.json) got past the checker in a live run. The AI caveat sits
    // in the same paragraph, and the app's do-not-stop line (src/engine/brief/template.ts) is stated.
    assert.ok(region.includes("Its rules and templates record, display and prompt questions; they never recommend changing a medicine, diagnose or say a medicine caused a symptom."), rel);
    assert.ok(!region.includes("It records, displays and prompts questions; it never"), `${rel}: unscoped never-claim`);
    assert.ok(region.includes("The optional AI is checked for the same, but not airtight: in "), rel);
    assert.ok(region.includes("tells families not to stop or change any medicine without the prescriber"), rel);
    // The 70 held-out stories are synthetic, and the local record is not yet encrypted (Planned row).
    assert.ok(region.includes("micro-F1 0.942 on 70 held-out synthetic stories"), rel);
    assert.match(region, /\| \*\*Planned\*\* \|[^\n]*encryption of the local record/);
    // The two visits take family input only under conditions (kb-src/research/regulatory.md §5, market-evidence.md
    // row 15, README "Who it's for"): the AWV's cognitive check weighs family concerns; a Part D review includes the
    // caregiver if cognitive impairment prevents the patient taking part.
    assert.ok(!region.includes("both already ask for what the family sees"), `${rel}: overstated regulation`);
    assert.ok(region.includes("(its cognitive check weighs family concerns, 42 CFR 410.15)"), rel);
    assert.ok(region.includes("(it can include the caregiver if cognitive impairment prevents the patient taking part, 42 CFR 423.153)"), rel);
    // Every TODO(team) sits in the leading comment block, before "# Kinwise".
    const head = md.slice(0, md.indexOf("\n# Kinwise"));
    assert.equal(md.split("TODO(team)").length, head.split("TODO(team)").length, `${rel}: TODO(team) outside the top block`);
    assert.match(head, /TODO\(team\)[^]*add one true line per teammate/);
    assert.match(region, /## Path to users \(hypothesis, not validated\)/);
    assert.match(region, /## Team\n\nAlbert Zorzolan and Neil Shah, Babson College\.\n/);
  }
  const main = readFileSync(join(ROOT, "submission/DEVPOST.md"), "utf8");
  // The live-escape caveat is stated once; the fallback has no count (its source is not at 375e1e0).
  assert.equal(pasteRegion(main).text.split(PHRASE).length - 1, 1);
  assert.ok(!readFileSync(join(ROOT, "submission/DEVPOST-if-not-pushed.md"), "utf8").includes("flawed AI sentences ("));
  // The primary text pairs "designed to drop" with the held-out result, so the design claim is not read as a guarantee.
  assert.ok(pasteRegion(main).text.includes("but only 10 of 23 on a later held-out probe"));
  assert.ok(pasteRegion(main).text.includes("README.md#rigor-at-a-glance"));
  // DEVPOST.md links repo files on the medwatch-v2 branch instead of printing bare backtick paths.
  assert.doesNotMatch(pasteRegion(main).text, /`[\w./-]+\.(?:json|md|ts|pdf)`/);
  const fallback = readFileSync(join(ROOT, "submission/DEVPOST-if-not-pushed.md"), "utf8");
  const fallbackRegion = pasteRegion(fallback).text;
  assert.ok(fallbackRegion.includes("its status table still calls on-device AI working (now Partial)."));
  assert.ok(fallbackRegion.includes("Timeline runs check: computed for every comparison, not yet gating. (Runs check: not in the Oct 16 build.)"));
  assert.ok(fallbackRegion.includes("The video was recorded from our Oct 18 build; the live demo and linked code are the Oct 16 build, so a few screens differ."));
  assert.ok(fallbackRegion.includes("the code tour PDF uploaded with this submission"));
  // The fallback links the README section that exists at 375e1e0, not the newer "Rigor at a glance".
  assert.ok(fallbackRegion.includes("README.md#evaluation-headline-numbers"));
  assert.ok(!fallbackRegion.includes("#rigor-at-a-glance"));
  assert.ok(!fallbackRegion.includes("blob/medwatch-v2/submission/kinwise-code-tour.pdf"));
});

test("README first screen: what it is, live demo, video, 5-minute walkthrough, how to run, then the 4-row rigor table", () => {
  const md = readFileSync(join(ROOT, "README.md"), "utf8");
  const firstScreen = md.slice(0, md.indexOf("## The problem"));
  assert.ok(firstScreen.length > 0);
  const order = ["**Kinwise is a private, in-browser co-pilot", "**Try it live", "**Demo video", "**Code walkthrough:** [5 minutes](#walk-through-the-code-in-5-minutes)", "**Run locally:**", "## Rigor at a glance"];
  const at = order.map((s) => firstScreen.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `missing: ${order.filter((_, i) => at[i] < 0).join(", ")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, "first-screen items out of order");
  // The video link is still the repo .mp4 until the team adds the YouTube link (agents do not invent one).
  assert.match(firstScreen, /\*\*Demo video[^\n]*TODO\(team\): replace with YouTube link/);
  const rigorAt = firstScreen.indexOf("## Rigor at a glance");
  const rigor = firstScreen.slice(rigorAt, firstScreen.indexOf("\nAlso:", rigorAt));
  const rows = rigor.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*Measured\b/.test(l) && !/^\|[-| ]+\|$/.test(l));
  assert.equal(rows.length, 4, `README rigor rows ${rows.length}`);
  assert.deepEqual(rows.map((r) => r.split("|")[1].trim()), ["Symptom extraction, 70 held-out stories", "Medication review", "Claim checker", "Timeline chance rate"]);
  assert.ok(rigor.includes("a code checker is designed to drop unsupported, causal or advice sentences"));
  assert.ok(rigor.includes("[Evaluation (headline numbers)](#evaluation-headline-numbers)"));
  // The on-device batch line moved here from the Devpost text: it must be exactly the line facts.mjs builds.
  const batchUrl = join(ROOT, "eval/results/llm-batch.json");
  const batch = batchFacts(JSON.parse(readFileSync(batchUrl, "utf8")));
  assert.ok(batch && md.split("\n").includes(batch.line), "README.md lacks the batch line printed by facts.mjs batchFacts().line");
  assert.ok(rigor.includes(batch.line));
  assert.match(md, /\n## Walk through the code in 5 minutes\n/);
  assert.match(md, /\n## Evaluation \(headline numbers\)\n/);
});

test("testRecordWarnings: the dated §7 counts against the last local reports", () => {
  const recordedHere = { unit: { passed: 1917, skipped: 1, date: "2026-10-18" }, e2e: { passed: 21, checks: 21, date: "2026-10-18" }, a11y: { scans: 46, violations: 0, date: "2026-10-18" } };
  const same = { recordedHere, vitest: { passed: 1917, skipped: 1 }, e2ePassed: 21, e2eChecks: 21, a11yScans: 46, a11yViolations: 0 };
  assert.deepEqual(testRecordWarnings(same), []);
  assert.equal(testRecordWarnings({ ...same, vitest: { passed: 1920, skipped: 1 }, e2ePassed: 20 }).length, 2);
  assert.match(testRecordWarnings({})[0], /no dated test counts/);
});

// --- Layout: the real results files must fit one Letter page in every state, normal and fallback ------------------

test("onePagerHtml: real eval files fit one Letter page (normal and fallback) with clean, missing or failing reports", { timeout: 180000 }, async () => {
  process.env.SKIP_VITEST = "1";
  const base = collectFacts();
  const ev = evidenceNotOnBranch(REPO_BRANCH);
  const dir = mkdtempSync(join(tmpdir(), "kinwise-onepager-"));
  // Stand-ins for the capture. The crop comes from the live Overview card, whose height changes with the UI (about
  // 1040 × 352 CSS px at first, about 1039 × 397 after the "Differences like this can also appear by chance" line), so
  // the page must fit for an older, the current and a much taller card, and for a very wide one.
  const card = (w, hgt) => {
    const path = join(dir, `card-${w}x${hgt}.svg`);
    writeFileSync(path, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><rect width="${w}" height="${hgt}" fill="#eee"/></svg>`);
    return { visitCard: path, visitCardText: "Dizziness was recorded on 9 of 14 answered days" };
  };
  const cards = { current: card(1040, 400), older: card(1040, 352), taller: card(1040, 520), wide: card(1600, 300) };
  const fixtureShots = cards.current;
  const variants = [];
  for (const [name, vitest] of Object.entries({ clean: { passed: 1245, failed: 0, skipped: 1 }, noReport: null, failures: { passed: 1244, failed: 1, skipped: 1 } })) {
    for (const e2e of [
      { e2ePassed: 21, e2eRun: 21, e2eFailed: 0 },
      { e2ePassed: 5, e2eRun: 5, e2eFailed: 0 },
      { e2ePassed: null, e2eRun: null, e2eFailed: null, a11yScans: null, a11yViolations: null },
    ]) {
      const facts = structuredClone(base);
      facts.tests = { ...facts.tests, ...e2e, vitest };
      variants.push([`${name}/${e2e.e2ePassed ?? "no e2e"}`, facts, false]);
    }
  }
  if (ev.gaps?.length) variants.push(["fallback", branchOnlyFacts(base, { branch: REPO_BRANCH, gapKeys: ev.keys }), true]);
  // The card's proportions must not move the page: every stand-in, for the normal and (if built) the fallback page.
  const sized = [];
  for (const [cardName, cardShots] of Object.entries(cards)) {
    sized.push([`clean/${cardName}`, variants[0][1], false, cardShots]);
    if (ev.gaps?.length) sized.push([`fallback/${cardName}`, variants.at(-1)[1], true, cardShots]);
  }
  const browser = await launchBrowser();
  try {
    for (const [name, facts, linkedBranchOnly, cardShots = fixtureShots] of [...variants, ...sized]) {
      const htmlPath = join(dir, `${name.replace(/\W+/g, "-")}.html`);
      writeFileSync(htmlPath, onePagerHtml({ facts, shots: cardShots, team: DEFAULT_TEAM, linkedBranchOnly }));
      const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 } });
      const page = await ctx.newPage();
      await page.goto(fileUrl(htmlPath));
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ media: "print" });
      const fit = await page.evaluate(overflowProbe);
      const pdf = await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true });
      await ctx.close();
      assert.ok(fit.overBottom <= 0 && fit.overRight <= 0 && fit.evClipped === 0 && fit.evWrapped === 0, `${name}: ${JSON.stringify(fit)}`);
      // Room to spare, so a small change elsewhere (a font, one more word) does not push the page over.
      assert.ok(fit.slack >= 15, `${name}: only ${fit.slack}px of slack`);
      // The screenshot box has a fixed height whatever the card's proportions.
      assert.equal(fit.shotHeight, Math.round(SHOT_HEIGHT_IN * 96), `${name}: screenshot box ${fit.shotHeight}px high`);
      assert.equal(pdfPageCount(pdf), 1, `${name}: not one page`);
    }
  } finally {
    await browser.close();
  }
});
