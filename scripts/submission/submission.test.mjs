// Unit tests for the submission scripts' pure logic (no browser, no dev server):
//   node --test scripts/submission/submission.test.mjs
// Vitest only collects src/ and eval/, and these are plain .mjs build scripts, so they use node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODE_URL, DEFAULT_TEAM, DEMO_URL, PLANNED_DEMO_URL, REPO_BRANCH, fileUrl, launchBrowser, pdfPageCount, readJson, readJsonIfExists, shortUrl } from "./lib.mjs";
import { collectFacts, optionalEvidence, testRunProblems } from "./facts.mjs";
import { e2eText, evidenceItems, liveEscapesText, onePagerHtml, overflowProbe, redteamItem } from "./onepager.mjs";
import { fixedCaptureTime } from "./capture.mjs";
import { STALE, numberChecks } from "./check-facts.mjs";

/** Minimal facts in the shape collectFacts() returns (numbers from the committed results, for realism only). */
function baseFacts(extra = {}) {
  return {
    nlp: { heldoutCases: 70, heldoutF1Pct: "94.2%", heldoutCi95: null, baselineF1Pct: null, baselineCi95: null, devCases: 245, devF1Pct: "99.9%" },
    meds: { cases: "57 of 57", expectations: "295 of 295", ablation: null },
    verifier: null,
    timelineNull: null,
    kb: { drugs: 427, beers: 89, cascades: 26 },
    fhir: { resources: 270, errors: 0, warnings: 25 },
    ai: { externalRequests: 0, liveSlipped: 3, liveSlippedText: "at least 3" },
    tests: { vitest: { passed: 1245, failed: 0, skipped: 1 }, e2eChecks: 20, e2ePassed: 20, e2eRun: 20, e2eFailed: 0, a11yScans: 46, a11yViolations: 0, a11ySerious: 0 },
    ...extra,
  };
}
const shots = { beforeAfter: "/tmp/a.png", heard: "/tmp/b.png", briefStrip: "/tmp/c.png", heardText: "Felt woozy\n(\nDizzy\n)\n getting up." };

test("lib: links point at the live demo and the submitted branch, not the repo root", () => {
  assert.equal(CODE_URL, `https://github.com/albertzorzolan/UnivaBioBabson/tree/${REPO_BRANCH}`);
  assert.equal(REPO_BRANCH, "medwatch-v2");
  assert.equal(PLANNED_DEMO_URL, DEMO_URL);
  assert.equal(shortUrl(DEMO_URL), "albertzorzolan.github.io/UnivaBioBabson");
  assert.equal(DEFAULT_TEAM, "Albert Zorzolan and Neil Shah, Babson College");
});

test("optionalEvidence: every field is null when the optional files are missing", () => {
  const e = optionalEvidence({});
  assert.deepEqual(e, { nlpBaselineF1Pct: null, nlpHeldoutCi95: null, nlpBaselineCi95: null, ablation: null, redteam: null, timelineNull: null });
  // The committed nlp-eval.json has no baseline or CI yet.
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
    independent: { moderate: "11.2%", strong: "0.3%", n: 1000, stay: null },
    clustered: { moderate: "85.8%", strong: "61.0%", n: 1000, stay: 0.8 },
  });
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

test("evidenceItems: at most four bullets; FHIR fills a free slot; optional bullets render only with data", () => {
  const plain = evidenceItems(baseFacts());
  assert.equal(plain.length, 3);
  assert.match(plain[0], /94\.2%.*dev set \(245 stories\) 99\.9%/);
  assert.match(plain[2], /^<b>FHIR:/);
  const full = optionalEvidence({
    nlp: { heldout: { baseline: { micro: { f1: 0.7134 } }, ci95: { f1: [0.9012, 0.9733] } } },
    ablation: { runs: [{ name: "x", passed: 33, total: 57 }] },
    redteam: { harmfulTotal: 163, caught: 72, validTotal: 87, falseRejects: 0 },
    timelineNull: { independent: { moderateRate: 0.112, strongRate: 0.003, n: 1000 } },
  });
  const f = baseFacts({ verifier: full.redteam, timelineNull: full.timelineNull });
  Object.assign(f.nlp, { heldoutCi95: full.nlpHeldoutCi95, baselineF1Pct: full.nlpBaselineF1Pct });
  f.meds.ablation = full.ablation;
  const items = evidenceItems(f);
  assert.equal(items.length, 4);
  assert.match(items[0], /94\.2%.*95% CI 90\.1–97\.3%.*held-out stories never used for tuning; lexicon-only baseline 71\.3%/);
  assert.match(items[1], /57 of 57<\/span> synthetic cases pass \(a written spec, not clinical validity\); ablated engines: 33 of 57/);
  // No before/postFixProbe in this fixture: the in-sample label is required.
  assert.match(items[2], /72 of 163<\/span> harmful drafts caught \(in-sample: the checks were hardened on this set\); 0 of 87 valid/);
  assert.match(items[3], /\(1,000 simulations, no real change\): moderate-or-strong signal on 11\.2% of changes\.$/);
  // The 1,000-change strong rate (0.3%) is never printed, and the app's "about 1 in 100" is never called a rounding up.
  assert.ok(!items[3].includes("0.3%") && !items[3].includes("rounds up"), items[3]);
  assert.ok(!items.some((s) => s.startsWith("<b>FHIR:")));
});

test("onePagerHtml: links, team line and status; no placeholder or stale wording", () => {
  const html = onePagerHtml({ facts: baseFacts(), shots, team: DEFAULT_TEAM, videoUrl: null });
  assert.ok(html.includes(`href="${DEMO_URL}"`));
  assert.ok(html.includes(`href="${CODE_URL}"`));
  assert.ok(html.includes("Albert Zorzolan and Neil Shah, Babson College"));
  assert.ok(html.includes("Demo video:</b> on the Devpost page"));
  assert.ok(html.includes("notice what changes after a medicine change, and bring a clear question to the visit"));
  for (const stale of ["Team member", "planned, not yet", "not yet deployed", "Public hosted demo", "possible side effects early", "Budnitz"]) {
    assert.ok(!html.includes(stale), `stale text: ${stale}`);
  }
  // Working / Partial / Planned, with the live demo under Working and the LLM under Partial.
  const working = html.slice(html.indexOf("<h3>Working</h3>"), html.indexOf("<h3>Partial</h3>"));
  const partial = html.slice(html.indexOf("<h3>Partial</h3>"), html.indexOf("<h3>Planned"));
  assert.match(working, /Public live demo/);
  assert.match(partial, /On-device LLM/);
  assert.match(partial, /427 medicines/);
  // The canonical Partial row's most clinically material limit (README.md, DEVPOST.md).
  assert.match(partial, /No dose or allergy checks/);
  // Alt text for the patient screenshot is built from the captured story.
  assert.ok(html.includes("Felt woozy [Dizzy] getting up."));
});

test("onePagerHtml: a video link replaces the Devpost pointer", () => {
  const html = onePagerHtml({ facts: baseFacts(), shots, team: DEFAULT_TEAM, videoUrl: "https://youtu.be/abc" });
  assert.ok(html.includes('href="https://youtu.be/abc"'));
  assert.ok(!html.includes("on the Devpost page"));
});

test("onePagerHtml: refuses to build without a team", () => {
  assert.throws(() => onePagerHtml({ facts: baseFacts(), shots, team: "  " }), /team is empty/);
  assert.throws(() => onePagerHtml({ facts: baseFacts(), shots }), /team is empty/);
});

test("fixedCaptureTime: today at 10:30 local", () => {
  const d = fixedCaptureTime(new Date(2026, 9, 17, 3, 53, 12));
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()], [2026, 9, 17, 10, 30, 0]);
});

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
  assert.ok(STALE.includes("not yet deployed") && STALE.includes("[Team member"));
});

// --- Claim-checker red team: the in-sample score is never printed alone ------------------------------------------

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

test("optionalEvidence: reads the as-submitted count and both probes, defensively", () => {
  const rt = optionalEvidence({ redteam: REDTEAM_CURRENT }).redteam;
  assert.deepEqual(rt.before, { caught: 72, harmfulTotal: 163 });
  assert.deepEqual(rt.postFixProbe, { total: 18, caught: 1, heldOut: false });
  assert.deepEqual(rt.postFixProbe2, { total: 20, caught: 12, validTotal: 10, falseRejects: 0 });
  // The printed probe is the second one: the first is marked as tuned on.
  assert.deepEqual(rt.heldOutProbe, rt.postFixProbe2);
  assert.equal(rt.postFixUnreadable, false);
  // Without a second probe, a tuned-on first probe is never used as the held-out one.
  assert.equal(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, postFixProbe2: undefined } }).redteam.heldOutProbe, null);
  // An older file without the heldOut flag still counts its first probe as held out.
  const old = optionalEvidence({ redteam: { ...REDTEAM_CURRENT, postFixProbe: { total: 18, caught: 1 }, postFixProbe2: undefined } }).redteam;
  assert.deepEqual(old.heldOutProbe, { total: 18, caught: 1, heldOut: true });
  // A "before" scored on a different set is not comparable, so it is dropped.
  assert.equal(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, before: { harmfulTotal: 150, caught: 70 } } }).redteam.before, null);
  // A probe that cannot be read is flagged, not silently dropped.
  for (const broken of [{ postFixProbe: { total: 18, caught: 19 } }, { postFixProbe2: { total: "20", caught: 12 } }]) {
    const bad = optionalEvidence({ redteam: { ...REDTEAM_CURRENT, ...broken } }).redteam;
    assert.equal(bad.postFixUnreadable, true, JSON.stringify(broken));
  }
  const none = optionalEvidence({ redteam: { harmfulTotal: 163, caught: 163 } }).redteam;
  assert.deepEqual([none.before, none.postFixProbe, none.postFixProbe2, none.heldOutProbe, none.postFixUnreadable], [null, null, null, null, false]);
});

test("redteamItem: with the current file shape, 163 of 163 comes with 72 as submitted and the held-out 12 of 20", () => {
  const item = redteamItem(optionalEvidence({ redteam: REDTEAM_CURRENT }).redteam);
  assert.match(item, /AI-written, not clinician-reviewed/);
  assert.match(item, /72 of 163<\/span> harmful drafts caught as submitted, 163 of 163 after fixes tuned on that set/);
  assert.match(item, /new paraphrases not used for tuning: 12\u00a0of\u00a020 caught/);
  assert.match(item, /0 of 87 valid sentences rejected/);
  // The tuned-on first probe is never presented as a held-out result.
  assert.ok(!item.includes("18"), item);
});

test("redteamItem: whenever caught == harmfulTotal, a held-out probe or an in-sample label appears", () => {
  const variants = [
    REDTEAM_CURRENT,
    { ...REDTEAM_CURRENT, before: undefined },
    { ...REDTEAM_CURRENT, postFixProbe2: undefined },
    { ...REDTEAM_CURRENT, postFixProbe2: undefined, before: undefined },
    { harmfulTotal: 163, caught: 163 },
  ];
  for (const raw of variants) {
    const item = redteamItem(optionalEvidence({ redteam: raw }).redteam);
    assert.ok(/not used for tuning: \d+\u00a0of\u00a0\d+ caught/.test(item) || /in-sample: the checks were hardened on this set/.test(item) || /after fixes tuned on that set/.test(item), item);
    if (!raw.before) assert.match(item, /in-sample|not used for tuning/);
    if (raw.postFixProbe?.heldOut === false && !raw.postFixProbe2) assert.ok(!/not used for tuning/.test(item), item);
  }
  // Probe present but unreadable: no bullet at all, so the in-sample score cannot appear without it.
  assert.equal(redteamItem(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, postFixProbe: { total: "18" } } }).redteam), null);
  assert.equal(redteamItem(optionalEvidence({ redteam: { ...REDTEAM_CURRENT, postFixProbe2: { total: 20 } } }).redteam), null);
  assert.equal(redteamItem(null), null);
});

test("redteamItem: the committed results file renders with its held-out probe", () => {
  const raw = readJsonIfExists("eval/results/verifier-redteam.json");
  if (!raw) return; // optional file
  const rt = optionalEvidence({ redteam: raw }).redteam;
  const item = redteamItem(rt);
  if (rt && rt.caught === rt.harmfulTotal) {
    const p = rt.heldOutProbe;
    assert.ok(item == null || (p ? item.includes(`${p.caught}\u00a0of\u00a0${p.total} caught`) : /in-sample/.test(item)), item);
    if (rt.before) assert.ok(item.includes(`${rt.before.caught} of ${rt.harmfulTotal}</span> harmful drafts caught as submitted`));
  }
  if (raw.postFixProbe?.heldOut === false && item) assert.ok(!item.includes(`${raw.postFixProbe.caught}\u00a0of\u00a0${raw.postFixProbe.total}`), item);
});

test("liveEscapesText: the red-team list of live escapes when present, else the verdict hand count", () => {
  assert.equal(liveEscapesText(baseFacts()), "at least 3");
  assert.equal(liveEscapesText(baseFacts({ verifier: { liveEscapes: { total: 6, nowBlocked: 6 } } })), "at least 6");
});

// --- Browser-test results: a partial or failing run is never printed as a pass ----------------------------------

test("e2eText and testRunProblems: complete, partial and failing e2e runs", () => {
  const t = (o) => ({ e2eChecks: 21, a11ySerious: 0, ...o });
  assert.equal(e2eText(t({ e2ePassed: 21, e2eRun: 21, e2eFailed: 0 })), "21 of 21 end-to-end checks pass");
  assert.deepEqual(testRunProblems(t({ e2ePassed: 21, e2eRun: 21, e2eFailed: 0 })), []);
  // Another process was still writing the results file: 5 results, all passing.
  const partial = t({ e2ePassed: 5, e2eRun: 5, e2eFailed: 0 });
  assert.equal(e2eText(partial), "5 of 21 end-to-end checks pass (0 fail / 16 not run)");
  assert.match(testRunProblems(partial)[0], /partial: 5 of 21 checks ran/);
  const failing = t({ e2ePassed: 19, e2eRun: 21, e2eFailed: 2 });
  assert.equal(e2eText(failing), "19 of 21 end-to-end checks pass (2 fail / 0 not run)");
  assert.match(testRunProblems(failing).join(" "), /2 end-to-end check\(s\) failed/);
  // No results file: counts only, and nothing to refuse.
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

// --- Layout: the real results files must fit one Letter page in every test-report state -------------------------

test("onePagerHtml: real eval files fit one Letter page with a clean, missing or failing vitest report", { timeout: 120000 }, async () => {
  process.env.SKIP_VITEST = "1";
  const base = collectFacts();
  // Screenshot frames have a fixed size, so a 1×1 image lays out exactly like the real captures.
  const dir = mkdtempSync(join(tmpdir(), "kinwise-onepager-"));
  const png = join(dir, "px.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));
  const fixtureShots = { beforeAfter: png, heard: png, briefStrip: png, heardText: "Felt woozy (Dizzy) getting up" };
  const variants = {
    clean: { passed: 1245, failed: 0, skipped: 1 },
    noReport: null,
    failures: { passed: 1244, failed: 1, skipped: 1 },
  };
  const browser = await launchBrowser();
  try {
    for (const [name, vitest] of Object.entries(variants)) {
      for (const e2e of [
        { e2ePassed: 21, e2eRun: 21, e2eFailed: 0 },
        { e2ePassed: 5, e2eRun: 5, e2eFailed: 0 },
        { e2ePassed: null, e2eRun: null, e2eFailed: null, a11yScans: null, a11yViolations: null },
      ]) {
        const facts = structuredClone(base);
        facts.tests = { ...facts.tests, ...e2e, vitest };
        const htmlPath = join(dir, `${name}.html`);
        writeFileSync(htmlPath, onePagerHtml({ facts, shots: fixtureShots, team: DEFAULT_TEAM }));
        const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 } });
        const page = await ctx.newPage();
        await page.goto(fileUrl(htmlPath));
        await page.evaluate(() => document.fonts.ready);
        await page.emulateMedia({ media: "print" });
        const fit = await page.evaluate(overflowProbe);
        const pdf = await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true });
        await ctx.close();
        assert.ok(fit.overBottom <= 0 && fit.overRight <= 0, `${name}/${e2e.e2ePassed ?? "no e2e"}: ${JSON.stringify(fit)}`);
        assert.equal(pdfPageCount(pdf), 1, `${name}: not one page`);
      }
    }
  } finally {
    await browser.close();
  }
});
