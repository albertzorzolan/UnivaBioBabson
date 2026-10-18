// One-page project description (US Letter). Wording follows SPEC §3: no causal claims, no safe/unsafe, no advice,
// counts always with denominators, no validation/clearance/compliance claims, finished vs partial vs planned stated
// plainly. Sources of every number:
//   - problem statistics: kb-src/research/market-evidence.md §0 rows 1, 7 and 4 (NCHS, Gandhi 2003, CDC). Only the
//     37% is printed for Gandhi: its underlying counts are not verified in the research file;
//   - "what's different": market-evidence.md §2 (vendor pages checked 2026-10-10; "not documented" ≠ absent);
//   - where it is used and why it could help: kb-src/research/regulatory.md §5.2 (Annual Wellness Visit, 42 CFR
//     410.15: cognitive-impairment detection gives "due consideration" to concerns raised by family), §5.1 (42 CFR
//     423.153(d)(1)(vii)(B)(2), the CMR with a caregiver when the patient is cognitively impaired) and §5.5 (EMPOWER figures as recorded there; the 62% is of
//     the brochure arm and the conversation was with a physician or pharmacist); the taper-plan caveat is
//     market-evidence.md §0 row 13 (as in submission/DEVPOST.md);
//   - the screenshot: the live app (capture.mjs), fictional demo data; step 3's counts: src/views/public/journeyFigures.ts;
//     step 3's runs-check p and sleep averages: facts.demo (demoFacts: docs/EVALUATION.md §3, seed.timeline.test.ts,
//     template.test.ts), each printed only when found (the fallback build gets nulls at 375e1e0 and leaves them out);
//   - everything else: facts.mjs (eval results, KB meta, FHIR validation, test runs). Optional facts render only when
//     facts.mjs found their source; the fallback build (linkedBranchOnly) gets its facts from branchOnlyFacts(). The
//     flawed-AI count is counted from eval/verifier-redteam.json, which the linked branch lacks, so the fallback prints
//     no number there: it says the recorded run's own verdict (eval/results/ai-live.json) found flawed output.
import { CODE_URL, DEMO_URL, VIDEO_URL, TOKENS_CSS, escapeHtml as h, fileUrl, fontFaceCss, shortUrl } from "./lib.mjs";

/** Minimum width of the caption column beside the screenshot; the image takes the rest of the 7.66in text width. */
const SHOT_CAPTION_IN = 2.15;
/**
 * Fixed height of the screenshot box. The crop comes from the live UI (capture.mjs), so its proportions change whenever
 * the Overview card does; a fixed height keeps the page layout independent of the card. A taller card is drawn a
 * little narrower (object-fit: contain) and the caption column takes the freed width.
 */
export const SHOT_HEIGHT_IN = 1.95;

const LOGO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>`;

/** The live demo's call to action, worded as the Welcome screen's button (src/views/public/Welcome.tsx) and DEVPOST.md. */
export const DEMO_CTA = "Take the 2-minute guided tour";

/** A clickable link whose text is the URL without "https://" (print readers type what they see). */
const link = (url, text = shortUrl(url)) => `<a href="${h(url)}">${h(text)}</a>`;

/**
 * Chance differences, in the app's caregiver-facing size words: "large" and "clear" are what the app calls strong and
 * moderate signals (src/views/shared/caregiver-insights.ts), so "a large or clear difference" is the moderate-or-strong
 * rate of eval/results/timeline-null.json. The clustered figure assumes each answer repeats the day before with
 * probability `stay` (an assumed level, not measured from real diaries). A gated rate (the same simulation with the
 * runs-aware check) is printed only when the file says the app applies that check (runsGate). Without the file (as on
 * the linked branch) it falls back to the app's own "about 1 in 10" wording from rules.ts. Returns null for no sentence.
 */
export function falseAlarmText(f) {
  const t = f.timelineNull;
  if (t?.independent?.moderate) {
    const c = t.clustered;
    const gated = t.runsGate && c?.gated?.moderate ? `; ${c.gated.moderate} with the app’s check for runs of days` : "";
    const runs = c?.moderate && c.stay != null ? ` (${c.moderate} if symptoms come in runs of days, an assumed level${gated})` : "";
    return `With no real change, ${t.independent.moderate} of simulated medicine changes still showed a large or clear difference${runs}.`;
  }
  if (f.timelineAbout) return `With no real change, ${f.timelineAbout} simulated medicine changes still showed a large or clear difference.`;
  return null;
}

/** "21 of 21 end-to-end checks pass" only for a complete, all-passing run; otherwise the failures and gaps are named. */
export function e2eText(t) {
  if (t.e2ePassed == null) return `${t.e2eChecks} end-to-end checks`;
  const run = t.e2eRun ?? t.e2ePassed;
  if (run >= t.e2eChecks && t.e2ePassed === t.e2eChecks) return `${t.e2ePassed} of ${t.e2eChecks} end-to-end checks pass`;
  const failed = t.e2eFailed ?? run - t.e2ePassed;
  return `${t.e2ePassed} of ${t.e2eChecks} end-to-end checks pass (${failed} fail / ${Math.max(0, t.e2eChecks - run)} not run)`;
}

/**
 * The tests bullet: this tree's last runs (vitest report, test-results/) or, in the fallback build, the counts the
 * linked branch records in its docs/EVALUATION.md (`tests.recorded`, with their date). Null when there is nothing.
 */
export function testsItem(t) {
  if (!t) return null;
  const n = (x) => x.toLocaleString("en-US");
  if (t.recorded) {
    const r = t.recorded;
    const parts = [
      r.unit && `${n(r.unit.passed)} unit tests pass`,
      r.e2e && `${r.e2e.passed} of ${r.e2e.checks} end-to-end checks pass`,
      r.a11y && `${r.a11y.scans} axe scans, ${r.a11y.violations} violations`,
    ].filter(Boolean);
    const dates = [...new Set([r.unit?.date, r.e2e?.date, r.a11y?.date].filter(Boolean))];
    return parts.length ? `<b>Tests</b>${dates.length === 1 ? ` (recorded ${dates[0]})` : ""}: ${parts.join(" · ")}.` : null;
  }
  const vt = t.vitest;
  const parts = [
    vt ? `${n(vt.passed)} unit tests pass${vt.failed ? ` (${vt.failed} fail)` : ""}` : "unit tests (npx vitest run)",
    e2eText(t),
    t.a11yScans != null ? `${t.a11yScans} axe scans, ${t.a11yViolations} violations` : "axe scans of every screen",
  ];
  return `<b>Tests:</b> ${parts.join(" · ")}.`;
}

/**
 * Evidence & rigor: one-line bullets, each with a comparison point when facts.mjs has one: held-out NLP vs a
 * lexicon-only baseline, the medication suite vs engines with one piece of knowledge removed, the timeline's chance
 * rate (falseAlarmText; the only bullet allowed to wrap, marked { wrap: true }), the on-device AI with the canonical
 * flaw count (facts.ai.liveSlippedPhrase), and the tests. Without four one-line bullets, FHIR fills the gap.
 * Returns strings, except the timeline bullet, which is { html, wrap: true }.
 */
export function evidenceItems(f) {
  const items = [];
  const n = f.nlp;
  items.push(
    `<b>Clinical NLP:</b> micro-F1 <span class="num">${n.heldoutF1Pct}</span>${n.heldoutCi95 ? ` (95% CI ${n.heldoutCi95})` : ""} on ${n.heldoutCases} held-out stories never used for tuning` +
      (n.baselineF1Pct ? `; lexicon-only baseline ${n.baselineF1Pct}.` : `; dev set (${n.devCases} stories) ${n.devF1Pct}.`),
  );
  const ab = f.meds.ablation;
  // 57/57 shows the code meets a written spec (the case file was available while building), not clinical validity.
  items.push(
    `<b>Medication review:</b> <span class="num">${f.meds.cases}</span> synthetic cases pass (a written spec, not clinical validity)` +
      (ab && ab.total
        ? `; with one piece of knowledge removed, ${ab.minPassed === ab.maxPassed ? ab.minPassed : `${ab.minPassed}–${ab.maxPassed}`} of ${ab.total}.`
        : `, ${f.meds.expectations} expectations.`),
  );
  // Why a flag is only ever a question: the measured chance rate (or the app's "about 1 in 10" in the fallback).
  const chance = falseAlarmText(f);
  if (chance) items.push({ html: `<b>Timeline:</b> ${h(chance.charAt(0).toLowerCase() + chance.slice(1).replace(/\.$/, ""))}, which is why a flag is only ever a question.`, wrap: true });
  // The flaw disclosure never disappears: the counted phrase when its source is available, else (fallback build) the
  // recorded run's own verdict without a number, else the plain default.
  const flawed = f.ai.liveSlippedPhrase;
  items.push(
    `<b>On-device AI:</b> ${f.ai.externalRequests} external requests in a recorded run` +
      (flawed
        ? `; ${h(flawed)} got through, so AI stays optional.`
        : f.ai.liveFlawedOnBranch
          ? `; its review found flawed outputs that got through (ai-live.json), so AI stays optional.`
          : `; AI stays optional (the template brief is the default).`),
  );
  const tests = testsItem(f.tests);
  if (tests) items.push(tests);
  if (items.filter((i) => typeof i === "string").length < 4) {
    items.push(`<b>FHIR:</b> sample Bundle (${f.fhir.resources} resources): <span class="num">${f.fhir.errors} errors</span> on the public HAPI R4 validator (${f.fhir.warnings} warnings: unknown code systems).`);
  }
  return items;
}

/**
 * Step 3 of "What it does": the demo's counts, then (when facts.demo has them) the runs check and the brief's sleep
 * averages. Every figure after the counts comes from demoFacts(); a null fact drops its clause.
 */
export function changeStep(f) {
  const d = f.demo ?? {};
  const runs = d.runsCheckP ? `; holds when 4-day runs are shuffled, p = ${h(d.runsCheckP)}, seeded diary` : "";
  const sleep = d.sleep ? ` Sleep ratings were higher too (after vs before): <b>${h(d.sleep.after)} vs ${h(d.sleep.before)}</b> of 5.` : "";
  return `<b>See what changed.</b> Dizziness on <b>2 of 19</b> answered days before lorazepam, <b>9 of 14</b> after (Fisher’s exact test${runs}).${sleep}`;
}

/**
 * The one-pager. `shots` comes from capture.mjs captureScreens (visitCard: the PNG path; visitCardText: its text, for
 * the alt text). `linkedBranchOnly`: the fallback build, whose facts must come from branchOnlyFacts() (facts.linkedBranch).
 */
export function onePagerHtml({ facts: f, shots, team, videoUrl = VIDEO_URL, linkedBranchOnly = false }) {
  // No placeholder path: a one-pager without a team line must never be built.
  const teamLine = String(team ?? "").trim();
  if (!teamLine) throw new Error("onePagerHtml: team is empty (set TEAM or use DEFAULT_TEAM from lib.mjs)");
  if (linkedBranchOnly && !f.linkedBranch) throw new Error("onePagerHtml: linkedBranchOnly needs facts from branchOnlyFacts()");
  const evidence = evidenceItems(f);
  const video = videoUrl ? link(videoUrl) : "on the Devpost page";
  const branchNote = linkedBranchOnly ? `Each figure below can be reproduced from the code at ${h(f.linkedBranch)}.` : "";
  // The screenshot is always captured from this tree. In the fallback the live demo still runs the linked branch, whose
  // Overview card has an earlier layout, so the caption must not say the picture is the live demo.
  const shotWhere = linkedBranchOnly
    ? `The caregiver Overview in the latest build (fictional data; the live demo shows an earlier layout of this card)`
    : `The caregiver Overview in the live demo (fictional data)`;
  // The visible caption under the callouts is short (the alt text carries the full wording above).
  const shotNote = linkedBranchOnly ? "From the latest build; the live demo shows an earlier layout." : "From the live demo (fictional data).";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Kinwise — project description</title>
<style>
${fontFaceCss()}
${TOKENS_CSS}
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: var(--font-sans); color: var(--ink); font-size: 8.9pt; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 8.5in; height: 11in; padding: 0.28in 0.42in 0.22in; overflow: hidden; position: relative; display: flex; flex-direction: column; gap: 0.055in; }
.page > * { flex: none; }
.page > .spacer { flex: 1; }
p { margin: 0; }
b, strong { font-weight: 600; }
a { color: var(--primary); text-decoration: none; font-weight: 600; }
sup { font-size: 0.68em; line-height: 0; color: var(--ink-muted); font-weight: 600; }

/* Header: brand, pitch, team, and the only links on the page (live demo and code in the row, the video beside the pills). */
.head { padding-bottom: 0.07in; border-bottom: 2px solid var(--ink); }
.toprow { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.2in; }
.brand { display: flex; align-items: center; gap: 9px; }
.mark { width: 32px; height: 32px; border-radius: 9px; background: var(--primary); display: grid; place-items: center; flex: none; }
.name { font-size: 21pt; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.name i { color: var(--accent-bright); font-style: normal; }
.sub { font-size: 8.4pt; color: var(--ink-muted); margin-top: 2px; white-space: nowrap; }
.pitch { font-family: var(--font-serif); font-size: 12.6pt; line-height: 1.26; margin-top: 5px; }
.meta { text-align: right; font-size: 8pt; color: var(--ink-muted); line-height: 1.5; flex: none; }
.meta b { color: var(--ink); }
.meta .pill { display: inline-block; background: var(--primary-soft); color: var(--primary-soft-ink); border-radius: 999px; padding: 1px 9px; font-weight: 600; margin-bottom: 3px; }
.meta .demo { display: inline-block; background: var(--caution-soft); color: var(--caution-ink); border-radius: 999px; padding: 1px 8px; font-weight: 600; margin-left: 4px; }
.links { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 0.12in; margin-top: 6px; font-size: 8.1pt; }
.links .go { background: var(--primary); color: #fff; border-radius: 999px; padding: 1px 10px 2px; font-weight: 500; }
.links .go b { font-weight: 700; }

/* Section heads: sentence case in the serif, like the app's own headings. */
h2 { font-family: var(--font-serif); font-size: 10.6pt; font-weight: 650; color: var(--primary); margin: 0 0 3px; line-height: 1.2; }
/* A plain-text note on the same line as a heading (the fallback's "reproduced from the code at <branch>"). */
h2 .h2note { font-family: var(--font-sans); font-size: 7.8pt; font-weight: 400; color: var(--ink-muted); margin-left: 6px; }

/* Problem */
.stats { display: grid; grid-template-columns: 1.1fr 1.4fr 0.9fr; gap: 0.12in; }
.stat { background: var(--surface-sunken); border-radius: 8px; padding: 5px 9px 4px; display: flex; flex-direction: column; }
/* Number and source share the first line; the claim follows. */
.stat .top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0 8px; }
.stat .n { font-family: var(--font-serif); font-size: 16pt; font-weight: 600; line-height: 1; color: var(--accent); }
.stat .n small { font-size: 9pt; font-weight: 600; }
.stat p { margin-top: 2px; }
.stat p { font-size: 8.4pt; }
.stat .src { font-size: 7.4pt; color: var(--ink-muted); white-space: nowrap; }
.diff { margin-top: 5px; }

/* The one screenshot: a contiguous crop of the live app's Overview card at a fixed height (SHOT_HEIGHT_IN), as wide as
   its proportions allow up to the page width less SHOT_CAPTION_IN for the caption; the caption column takes the rest.
   The page height therefore never depends on the card's height. A wide crop is centred vertically in the box. */
.shot { margin: 0; display: grid; grid-template-columns: auto minmax(${SHOT_CAPTION_IN}in, 1fr); border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--surface); }
.shot img { display: block; height: ${SHOT_HEIGHT_IN}in; width: auto; max-width: calc(7.66in - 2px - ${SHOT_CAPTION_IN}in); object-fit: contain; object-position: left center; border-right: 1px solid var(--line); }
.shot figcaption { padding: 8px 10px; background: var(--primary-soft); display: flex; flex-direction: column; gap: 5px; }
.shot figcaption > b { font-family: var(--font-serif); font-size: 12pt; line-height: 1.15; font-weight: 650; color: var(--primary-soft-ink); }
.shot figcaption .src { font-size: 7.2pt; color: var(--ink-muted); line-height: 1.25; }
/* Three callouts: what the card shows, in the order a clinician reads it (counts, the caveat, the question). */
.callouts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; counter-reset: c; }
.callouts li { display: grid; grid-template-columns: 15px 1fr; gap: 6px; counter-increment: c; font-size: 8.2pt; line-height: 1.26; }
.callouts li::before { content: counter(c); width: 15px; height: 15px; border-radius: 50%; background: var(--primary-soft-ink); color: #fff; font-weight: 700; font-size: 7.4pt; display: grid; place-items: center; margin-top: 1px; }
.shot figcaption .tour { align-self: flex-start; margin-top: auto; background: var(--primary); color: #fff; border-radius: 999px; padding: 2px 10px 3px; font-size: 8pt; font-weight: 600; }

/* Body */
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.22in; font-size: 8.6pt; }
.col { display: flex; flex-direction: column; gap: 0.07in; }
.col p + p { margin-top: 3px; }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; counter-reset: s; }
.steps li { display: grid; grid-template-columns: 16px 1fr; gap: 6px; counter-increment: s; }
.steps li::before { content: counter(s); width: 16px; height: 16px; border-radius: 50%; background: var(--primary); color: #fff; font-weight: 700; font-size: 7.8pt; display: grid; place-items: center; margin-top: 1px; }
/* How it works: heading, pipeline chips and one sentence side by side, full width. */
.how { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 2px 0.14in; }
.how h2 { margin: 0; }
.how p { grid-column: 1 / -1; }
.flow { display: flex; flex-wrap: nowrap; align-items: center; gap: 2px; }
.flow .chip { border: 1px solid var(--line-strong); border-radius: 5px; padding: 0 3px; font-size: 7.3pt; line-height: 1.35; background: #fff; font-weight: 600; color: var(--primary); }
.flow .chip.ai { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.flow .arr { color: var(--ink-muted); font-size: 7pt; }
.num { font-weight: 700; color: var(--primary); }
.col p.why { border-left: 3px solid var(--accent-bright); padding-left: 7px; margin-top: 5px; }

/* Evidence: full width, one line per bullet (overflowProbe reports a bullet that runs past the margin). */
.ev { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1px; font-size: 8.3pt; }
.ev li { padding-left: 9px; position: relative; white-space: nowrap; }
.ev li.wrap { white-space: normal; }
.ev li::before { content: ""; position: absolute; left: 0; top: 0.55em; width: 4px; height: 4px; border-radius: 50%; background: var(--primary); }

/* Status: working / partial / planned */
/* Partial is the longest list, so its column is a little wider and each item stays on one line. */
.status { display: grid; grid-template-columns: 0.95fr 1.18fr 1.04fr; gap: 0.12in; }
.status div { border-radius: 7px; padding: 5px 8px; }
.status .now { background: var(--success-soft); }
.status .part { background: var(--caution-soft); }
.status .plan { background: var(--surface-sunken); }
.status h3 { margin: 0 0 2px; font-family: var(--font-serif); font-size: 9.4pt; font-weight: 650; }
.status .now h3 { color: #33603f; }
.status .part h3 { color: var(--caution-ink); }
.status .plan h3 { color: var(--ink-muted); }
.status ul { margin: 0; padding-left: 11px; font-size: 7.9pt; line-height: 1.28; }

/* Footer: the disclaimer, then the footnotes (and, in the fallback, which branch reproduces the figures), full width.
   The team line sits in the header with the other links. */
.foot { border-top: 1px solid var(--line-strong); padding-top: 5px; display: flex; flex-direction: column; gap: 2px; }
.fine { font-size: 7.6pt; color: var(--ink-muted); line-height: 1.3; }
</style>
</head>
<body>
<div class="page" id="page">

  <header class="head">
    <div class="toprow">
      <div class="brand">
        <div class="mark">${LOGO}</div>
        <div>
          <div class="name">Kinwise<i>.</i></div>
          <div class="sub">Family medicine-review co-pilot · private, on-device AI</div>
        </div>
      </div>
      <div class="meta">
        <span class="pill">UnivaBio 2026 · AI for Human Health</span> <span class="demo">Fictional demo data</span><br>
        <b>Video:</b> ${video} · runs in the browser, no backend<br>
        <b>Team:</b> ${h(teamLine)}
      </div>
    </div>
    <p class="pitch">Helps families caring for an older adult on many medicines notice what changes after a medicine change, and bring a clear question to the visit.</p>
    <div class="links">
      <a class="go" href="${h(DEMO_URL)}"><b>Live demo:</b> ${h(shortUrl(DEMO_URL))}</a>
      <span><b>Code:</b> ${link(CODE_URL)}</span>
    </div>
  </header>

  <section>
    <h2>The problem</h2>
    <div class="stats">
      <div class="stat">
        <div class="top"><div class="n">43.0%</div><span class="src">NCHS, Health, United States</span></div>
        <p>of US adults 65+ took <b>5 or more prescription drugs</b> in a 30-day period (2017–Mar 2020).</p>
      </div>
      <div class="stat">
        <div class="top"><div class="n">37%</div><span class="src">Gandhi et al., NEJM 2003</span></div>
        <p>of adverse drug events in primary care whose harm could have been reduced were attributed to <b>the patient not telling the doctor</b>.</p>
      </div>
      <div class="stat">
        <div class="top"><div class="n"><small>More than</small> 1 in 4</div><span class="src">CDC, Facts About Older Adult Falls</span></div>
        <p>older adults <b>fall each year</b>, but <b>less than half tell their doctor</b>.</p>
      </div>
    </div>
    <p class="diff"><b>What’s different.</b> Diary apps (MyTherapy, CareClinic) chart symptoms but do not document before/after counts around medicine starts; clinician tools (MedStopper, MedSafer) apply Beers/STOPP-type rules without the family’s observations. Kinwise does both.<sup>4</sup></p>
  </section>

  <figure class="shot">
    <img src="${fileUrl(shots.visitCard)}" alt="${h(`${shotWhere}: ${shots.visitCardText ?? ""}`)}">
    <figcaption>
      <b>What Alex brings to the visit</b>
      <ol class="callouts">
        <li><span><b>9 of 14 vs 2 of 19</b> answered days with dizziness, after vs before</span></li>
        <li><span><b>A change in what was recorded,</b> not what caused it</span></li>
        <li><span><b>One question</b> for her clinician</span></li>
      </ol>
      <span class="src">${shotNote}</span>
      <a class="tour" href="${h(DEMO_URL)}">${DEMO_CTA}</a>
    </figcaption>
  </figure>

  <div class="cols">
    <div class="col">
      <section>
        <h2>Who it is for, and where</h2>
        <p>The <b>family caregiver</b> (Alex) and the <b>older adult</b> (Margaret, 78, 8 medicines); the brief is for her <b>doctor or pharmacist</b>.</p>
        <p>For the Medicare <b>Annual Wellness Visit</b> (whose cognitive check must consider concerns raised by family<sup>1</sup>) or a pharmacist’s <b>medication review</b>, which may be done with the caregiver<sup>2</sup>.</p>
        <p class="why"><b>Why it could help:</b> in EMPOWER<sup>3</sup> (cluster RCT, 303 long-term benzodiazepine users, 65–95), <b>62%</b> given a brochure raised stopping with their doctor or pharmacist, and <b>27% vs 5%</b> (usual care) had discontinued at 6 months (the brochure included a taper plan; Kinwise leaves that to the clinician). A reason to test Kinwise, not proof it works.</p>
      </section>
    </div>

    <div class="col">
      <section>
        <h2>What it does</h2>
        <ol class="steps">
          <li><div><b>Check in, in her own words.</b> On-device NLP turns “felt woozy” into answers she confirms.</div></li>
          <li><div><b>Review her medicines</b> against AGS Beers 2023, anticholinergic burden, fall-risk drugs and cascades; each finding is cited and ends as a question.</div></li>
          <li><div>${changeStep(f)}</div></li>
          <li><div><b>Bring one reviewed page to the visit,</b> plus a FHIR R4 export.</div></li>
        </ol>
      </section>
    </div>
  </div>

  <section class="how">
    <h2>How it works</h2>
    <div class="flow">
      <span class="chip">Cited KB</span><span class="arr">→</span>
      <span class="chip">Engines</span><span class="arr">→</span>
      <span class="chip ai">LLM rewords</span><span class="arr">→</span>
      <span class="chip">Code checks</span><span class="arr">→</span>
      <span class="chip">Human review</span>
    </div>
    <p>Deterministic TypeScript engines over a cited knowledge base (${f.kb.drugs} medicines, ${f.kb.beers} Beers rules, ${f.kb.cascades} cascades) compute every fact. An optional on-device LLM (Qwen2.5, WebGPU) only rewords them; code drops sentences that fail a number, name or wording check.</p>
  </section>

  <section>
    <h2>Evidence &amp; rigor${branchNote ? ` <span class="h2note">${branchNote}</span>` : ""}</h2>
    <ul class="ev">
      ${evidence.map((s) => (typeof s === "string" ? `<li>${s}</li>` : `<li class="wrap">${s.html}</li>`)).join("\n      ")}
    </ul>
  </section>

  <div class="spacer"></div>

  <section class="status">
    <!-- Shortened from the canonical Working / Partial / Planned table in README.md and submission/DEVPOST.md. -->
    <div class="now">
      <h3>Working</h3>
      <ul>
        <li>Public live demo, no install</li>
        <li>NLP check-in · medicine matching</li>
        <li>Cited review · timeline · Ask Kinwise</li>
        <li>Reviewed brief · print · FHIR R4 export</li>
      </ul>
    </div>
    <div class="part">
      <h3>Partial</h3>
      <ul>
        <li>LLM: WebGPU only; code check not airtight</li>
        <li>No clinician KB review; no dose/allergy checks</li>
        <li>Interactions: Beers 2023 combination table only</li>
        <li>${/* The runs check is not in the linked branch's code, so the fallback page leaves it out. */ linkedBranchOnly ? "" : "Runs check not yet gating · "}English only</li>
        <li>One device, no sync · no FHIR receiver</li>
      </ul>
    </div>
    <div class="plan">
      <h3>Planned (not built)</h3>
      <ul>
        <li>Pharmacist KB review · validation pilot</li>
        <li>Encrypted family sharing and storage</li>
        <li>Pharmacy/portal import · voice · Spanish</li>
      </ul>
    </div>
  </section>

  <footer class="foot">
    <p class="fine">Hackathon prototype: not FDA reviewed or cleared, not clinically validated, no HIPAA claim. Designed never to say a medicine caused a symptom or to advise a change; the clinician decides. Emergency: call 911. <span class="fine notes"><sup>1</sup> 42 CFR 410.15. <sup>2</sup> Part D CMR with a caregiver if cognitive impairment prevents the patient taking part: 42 CFR 423.153(d)(1)(vii)(B)(2). <sup>3</sup> Tannenbaum et al., JAMA Intern Med 2014. <sup>4</sup> Vendor pages, Oct 2026; “not documented” is not proof of absence.</span></p>
  </footer>
</div>
</body>
</html>`;
}

/** In-page check: how far (CSS px) any element reaches past the page's padding box (≤ 0 means it fits), the spare
 * height left in the flexible spacer above the status row, and how many evidence bullets do not fit on one line
 * (evClipped: text runs past the margin; evWrapped: the bullet wrapped). The page fits when all four are ≤ 0.
 * shotHeight (the screenshot box, CSS px) lets tests confirm the box keeps its fixed height for any card. */
export function overflowProbe() {
  const page = document.getElementById("page");
  const pr = page.getBoundingClientRect();
  const limit = pr.bottom - parseFloat(getComputedStyle(page).paddingBottom);
  let max = -Infinity;
  for (const el of page.querySelectorAll("*")) max = Math.max(max, el.getBoundingClientRect().bottom);
  const right = pr.right - parseFloat(getComputedStyle(page).paddingRight);
  let maxR = -Infinity;
  for (const el of page.querySelectorAll("*")) maxR = Math.max(maxR, el.getBoundingClientRect().right);
  const spacer = document.querySelector(".spacer");
  // Evidence bullets are nowrap: a too-long one keeps its box and spills text past it (scrollWidth > clientWidth), which
  // the box checks above cannot see. evWrapped also catches a wrapped bullet if nowrap is ever removed.
  // The timeline bullet (li.wrap) may wrap by design; every other bullet must fit one line.
  const items = [...document.querySelectorAll(".ev li:not(.wrap)")];
  const lineH = (el) => parseFloat(getComputedStyle(el).lineHeight) || 12;
  const evClipped = items.filter((li) => li.scrollWidth > li.clientWidth + 1).length;
  const evWrapped = items.filter((li) => li.getBoundingClientRect().height > lineH(li) * 1.5).length;
  const shot = document.querySelector(".shot img");
  return {
    overBottom: Math.round(max - limit),
    overRight: Math.round(maxR - right),
    slack: spacer ? Math.round(spacer.getBoundingClientRect().height) : null,
    evClipped,
    evWrapped,
    shotHeight: shot ? Math.round(shot.getBoundingClientRect().height) : null,
  };
}
