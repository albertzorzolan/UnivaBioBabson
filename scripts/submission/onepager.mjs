// One-page project description (US Letter). Wording follows SPEC §3: no causal claims, no safe/unsafe, no advice,
// counts always with denominators, no validation/clearance/compliance claims, finished vs partial vs planned stated
// plainly. Sources of every number:
//   - problem statistics: kb-src/research/market-evidence.md §0 rows 1, 7 and 4 (NCHS, Gandhi 2003, CDC). Only the
//     37% is printed for Gandhi: the "19 of 51" count is not yet checked into the research file;
//   - "what's different": market-evidence.md §2 (vendor pages checked 2026-10-10; "not documented" ≠ absent);
//   - where it is used and why it could help: kb-src/research/regulatory.md §5.1 (42 CFR 423.153(d)(1)(vii)(B)(2),
//     the CMR with a caregiver), §5.2 (Annual Wellness Visit) and §5.5 (EMPOWER figures as recorded there; the 62% is
//     of the brochure arm and the conversation was with a physician or pharmacist);
//   - demo-story numbers: the live app (captured in the screenshots) and src/views/public/journeyFigures.ts;
//   - everything else: facts.mjs (eval results, KB meta, FHIR validation, test runs). Optional evidence bullets render
//     only when facts.mjs found their result file.
import { CODE_URL, DEMO_URL, VIDEO_URL, TOKENS_CSS, escapeHtml as h, fileUrl, fontFaceCss, shortUrl } from "./lib.mjs";

/** Height of the screenshot row; each screen is scaled to fit its box (whole cards, no crops). */
const SHOT_H_IN = 1.05;
/** Column widths of the three screens: caregiver card, patient check-in, visit-brief strip (sum + 2 gaps = 7.66in).
 *  Sized to the captures' aspect ratios (about 1.9 : 2.4 : 3.4) so the Before vs after card, the core demo evidence,
 *  fills its box at ~2in wide and its labels stay readable on paper. */
const SHOT_COLS_IN = [1.97, 2.45, 2.96];

const LOGO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>`;

/** A clickable link whose text is the URL without "https://" (print readers type what they see). */
const link = (url, text = shortUrl(url)) => `<a href="${h(url)}">${h(text)}</a>`;

/** "Felt woozy\n(\nDizzy\n)…" (innerText of the highlighted story) → "Felt woozy [Dizzy]…", for the image's alt text. */
function storyAlt(text) {
  return String(text ?? "")
    .replace(/\s*\(\s*([^()]+?)\s*\)/g, " [$1]")
    .replace(/\s+/g, " ")
    .replace(/ ([.,])/g, "$1")
    .trim();
}

/**
 * The claim-checker red-team bullet, worded so it can never read as held-out performance. The checks were hardened
 * against this AI-written set, so the "after fixes" count is in-sample; it is always printed next to the as-submitted
 * count (`before`, what the linked branch scores) and a held-out probe (`heldOutProbe`: paraphrases not used for
 * tuning; facts.mjs never picks a probe the results file marks heldOut: false) when the file has them, and labelled
 * in-sample when it does not. If the file has a probe that facts.mjs could not read, the bullet is left out entirely.
 * Returns null for no bullet.
 */
export function redteamItem(v) {
  if (!v || v.postFixUnreadable) return null;
  const head = `<b>Claim checker red team</b> (AI-written, not clinician-reviewed):`;
  const fixed = `${v.caught} of ${v.harmfulTotal}`;
  const caught = v.before
    ? `<span class="num">${v.before.caught} of ${v.harmfulTotal}</span> harmful drafts caught as submitted, ${fixed} after fixes tuned on that set`
    : `<span class="num">${fixed}</span> harmful drafts caught (in-sample: the checks were hardened on this set)`;
  const p = v.heldOutProbe;
  // No-break spaces keep "12 of 20" on one line (a count split across lines is easy to misread).
  const probe = p ? `; new paraphrases not used for tuning: ${p.caught * 2 < p.total ? "only " : ""}${p.caught}\u00a0of\u00a0${p.total} caught` : "";
  const valid = v.validTotal != null ? `; ${v.falseRejects} of ${v.validTotal} valid sentences rejected` : "";
  return `${head} ${caught}${probe}${valid}.`;
}

/**
 * How many flawed AI sentences got through in the recorded live run: the red-team file's list of live escapes when
 * present (it itemises them, as submission/DEVPOST.md does), else the hand count from ai-live.json's verdict.
 * Always "at least": neither is an exhaustive audit. The unit is sentences, not outputs: the red-team list has 6
 * strings from 5 AI outputs (live-03 and live-04 are two sentences of one explanation), so the one-pager says
 * "flawed sentences". The app and README count outputs named in the verdict ("at least 3 flawed AI outputs").
 */
export function liveEscapesText(f) {
  const n = f.verifier?.liveEscapes?.total;
  return n ? `at least ${n}` : (f.ai.liveSlippedText ?? `at least ${f.ai.liveSlipped}`);
}

/** Evidence bullets, at most four, each with a comparison point. Optional ones render only when facts.mjs has them;
 *  the FHIR result fills a free slot. */
export function evidenceItems(f) {
  const items = [];
  const n = f.nlp;
  items.push(
    `<b>Clinical NLP:</b> micro-F1 <span class="num">${n.heldoutF1Pct}</span>${n.heldoutCi95 ? ` (95% CI ${n.heldoutCi95})` : ""} on ${n.heldoutCases} held-out stories never used for tuning` +
      (n.baselineF1Pct ? `; lexicon-only baseline ${n.baselineF1Pct}` : `; dev set (${n.devCases} stories) ${n.devF1Pct}`) +
      ".",
  );
  const ab = f.meds.ablation;
  // 57/57 shows the code meets a written spec (the case file was available while building), not clinical validity.
  items.push(
    `<b>Medication review:</b> <span class="num">${f.meds.cases}</span> synthetic cases pass (a written spec, not clinical validity)` +
      (ab && ab.total
        ? `; ablated engines: ${ab.minPassed === ab.maxPassed ? ab.minPassed : `${ab.minPassed}–${ab.maxPassed}`} of ${ab.total}.`
        : `, ${f.meds.expectations} expectations.`),
  );
  const rt = redteamItem(f.verifier);
  if (rt) items.push(rt);
  const t = f.timelineNull;
  if (t) {
    // timeline-null.json: moderate = share of simulated medicine changes (no real effect) with at least one
    // moderate-or-strong signal. Only that rate is printed: the strong rate in this file comes from 1,000 changes
    // (0.3% = 3 changes, sampling noise; the 8,000-change run in rules.ts gives about 0.8%, the app's "about 1 in
    // 100"), so quoting it alone would understate it. The clustered figure assumes each answer repeats the previous
    // day's with probability `stay` (an assumed level, not measured from real diaries); n and stay come from the file.
    const r = t.independent;
    const c = t.clustered;
    if (r.moderate) {
      const n = r.n ? `${r.n.toLocaleString("en-US")} ` : "";
      const clustered =
        c?.moderate && c.stay != null
          ? `; ${c.moderate} if each answer repeats the day before with probability ${c.stay} (assumed)`
          : "";
      items.push(`<b>Timeline false alarms</b> (${n}simulations, no real change): moderate-or-strong signal on ${r.moderate} of changes${clustered}.`);
    }
  }
  if (items.length < 4) {
    items.push(
      `<b>FHIR:</b> sample Bundle (${f.fhir.resources} resources): <span class="num">${f.fhir.errors} errors</span> on the public HAPI R4 validator (${f.fhir.warnings} warnings: unknown code systems).`,
    );
  }
  return items.slice(0, 4);
}

/** "21 of 21 end-to-end checks pass" only for a complete, all-passing run; otherwise the failures and gaps are named. */
export function e2eText(t) {
  if (t.e2ePassed == null) return `${t.e2eChecks} end-to-end checks`;
  const run = t.e2eRun ?? t.e2ePassed;
  if (run >= t.e2eChecks && t.e2ePassed === t.e2eChecks) return `${t.e2ePassed} of ${t.e2eChecks} end-to-end checks pass`;
  const failed = t.e2eFailed ?? run - t.e2ePassed;
  return `${t.e2ePassed} of ${t.e2eChecks} end-to-end checks pass (${failed} fail / ${Math.max(0, t.e2eChecks - run)} not run)`;
}

export function onePagerHtml({ facts: f, shots, team, videoUrl = VIDEO_URL }) {
  // No placeholder path: a one-pager without a team line must never be built.
  const teamLine = String(team ?? "").trim();
  if (!teamLine) throw new Error("onePagerHtml: team is empty (set TEAM or use DEFAULT_TEAM from lib.mjs)");
  const t = f.tests;
  const vt = t.vitest;
  const evidence = evidenceItems(f);
  const software = [
    vt ? `${vt.passed.toLocaleString("en-US")} unit tests pass${vt.failed ? ` (${vt.failed} fail)` : ""}` : "unit tests (npx vitest run)",
    e2eText(t),
    t.a11yScans != null ? `${t.a11yScans} axe scans, ${t.a11yViolations} violations` : "axe scans of every screen",
  ]
    .filter(Boolean)
    .join(" · ");
  const video = videoUrl ? `<b>Video:</b> ${link(videoUrl)}` : `<b>Demo video:</b> on the Devpost page`;

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
body { font-family: var(--font-sans); color: var(--ink); font-size: 9pt; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 8.5in; height: 11in; padding: 0.32in 0.42in 0.26in; overflow: hidden; position: relative; display: flex; flex-direction: column; gap: 0.07in; }
.page > * { flex: none; }
.page > .spacer { flex: 1; }
p { margin: 0; }
b, strong { font-weight: 600; }
a { color: var(--primary); text-decoration: none; font-weight: 600; }

/* Header */
.head { padding-bottom: 0.06in; border-bottom: 2px solid var(--ink); }
.toprow { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.2in; }
.brand { display: flex; align-items: center; gap: 9px; }
.mark { width: 32px; height: 32px; border-radius: 9px; background: var(--primary); display: grid; place-items: center; flex: none; }
.name { font-size: 21pt; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.name i { color: var(--accent-bright); font-style: normal; }
.sub { font-size: 8.4pt; color: var(--ink-muted); margin-top: 2px; white-space: nowrap; }
.pitch { font-family: var(--font-serif); font-size: 12.6pt; line-height: 1.26; margin-top: 5px; }
.meta { text-align: right; font-size: 8pt; color: var(--ink-muted); line-height: 1.5; flex: none; }
.meta .pill { display: inline-block; background: var(--primary-soft); color: var(--primary-soft-ink); border-radius: 999px; padding: 1px 9px; font-weight: 600; margin-bottom: 3px; }
.meta .demo { display: inline-block; background: var(--caution-soft); color: var(--caution-ink); border-radius: 999px; padding: 1px 8px; font-weight: 600; margin-left: 4px; }
.links { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 0.16in; margin-top: 5px; font-size: 8.6pt; }
.links .go { background: var(--primary); color: #fff; border-radius: 999px; padding: 1px 10px 2px; font-weight: 500; }
.links .go b { font-weight: 700; }

h2 { font-size: 8pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin: 0 0 3px; }

/* Problem */
.stats { display: grid; grid-template-columns: 0.95fr 1.4fr 0.95fr; gap: 0.12in; }
.stat { background: var(--surface-sunken); border-radius: 8px; padding: 5px 9px 4px; display: flex; flex-direction: column; }
.stat .n { font-family: var(--font-serif); font-size: 16pt; font-weight: 600; line-height: 1; color: var(--accent); }
.stat .n small { font-size: 9pt; font-weight: 600; }
.stat p { margin-top: 2px; }
.stat .src { margin-top: auto; padding-top: 2px; font-size: 7.8pt; color: var(--ink-muted); }
.diff { margin-top: 5px; }
.diff .fine { margin-left: 4px; }

/* Screens: whole cards from the live app (no mid-sentence crops), each scaled to fit its box. */
.shots { display: grid; grid-template-columns: ${SHOT_COLS_IN.map((w) => `${w}in`).join(" ")}; gap: 0.14in; }
.shots figure { margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.shots .frame { height: ${SHOT_H_IN}in; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; display: grid; place-items: center; padding: 4px; background: #fffdf9; }
.shots .frame img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
.shots .frame.ba { background: #efede6; padding: 0; }
.shots .frame.ba img { width: 100%; height: 100%; }
.shots figcaption { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 7.8pt; color: var(--ink-muted); line-height: 1.28; }
.shots figcaption b { color: var(--ink); }

/* Body */
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.2in; }
.col { display: flex; flex-direction: column; gap: 0.07in; }
.col p + p { margin-top: 3px; }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; counter-reset: s; }
.steps li { display: grid; grid-template-columns: 16px 1fr; gap: 6px; counter-increment: s; }
.steps li::before { content: counter(s); width: 16px; height: 16px; border-radius: 50%; background: var(--primary); color: #fff; font-weight: 700; font-size: 7.8pt; display: grid; place-items: center; margin-top: 1px; }
.flow { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 1px 0 4px; }
.flow .chip { border: 1px solid var(--line-strong); border-radius: 5px; padding: 0 3px; font-size: 7.3pt; line-height: 1.35; background: #fff; font-weight: 600; color: var(--primary); }
.flow .chip.ai { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.flow .arr { color: var(--ink-muted); font-size: 7pt; }
.ev { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.ev li { padding-left: 9px; position: relative; }
.ev li::before { content: ""; position: absolute; left: 0; top: 0.55em; width: 4px; height: 4px; border-radius: 50%; background: var(--primary); }
.num { font-weight: 700; color: var(--primary); }
.col p.why { border-left: 3px solid var(--accent-bright); padding-left: 7px; margin-top: 5px; }

/* Status: working / partial / planned */
.status { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.12in; }
.status div { border-radius: 7px; padding: 5px 8px; }
.status .now { background: var(--success-soft); }
.status .part { background: var(--caution-soft); }
.status .plan { background: var(--surface-sunken); }
.status h3 { margin: 0 0 2px; font-size: 7.8pt; text-transform: uppercase; letter-spacing: 0.1em; }
.status .now h3 { color: #33603f; }
.status .part h3 { color: var(--caution-ink); }
.status .plan h3 { color: var(--ink-muted); }
.status ul { margin: 0; padding-left: 11px; font-size: 8.4pt; line-height: 1.28; }

.foot { border-top: 1px solid var(--line-strong); padding-top: 5px; display: grid; grid-template-columns: 4.05in 1fr; gap: 0.18in; font-size: 8.2pt; }
.foot > div > div { white-space: nowrap; }
.fine { font-size: 7.8pt; color: var(--ink-muted); line-height: 1.3; }
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
        Working prototype · runs in the browser, no backend
      </div>
    </div>
    <p class="pitch">Helps families caring for an older adult on many medicines notice what changes after a medicine change, and bring a clear question to the visit.</p>
    <div class="links">
      <a class="go" href="${h(DEMO_URL)}"><b>Live demo</b> (no install): ${h(shortUrl(DEMO_URL))} → Try as Alex</a>
      <span>${video}</span>
      <span><b>Code:</b> ${link(CODE_URL)}</span>
    </div>
  </header>

  <section>
    <h2>The problem</h2>
    <div class="stats">
      <div class="stat">
        <div class="n">43.0%</div>
        <p>of US adults 65+ took <b>5 or more prescription drugs</b> in a 30-day period (2017–Mar 2020).</p>
        <div class="src">NCHS, Health, United States</div>
      </div>
      <div class="stat">
        <div class="n">37%</div>
        <p>of adverse drug events in primary care whose harm could have been reduced were attributed to <b>the patient not telling the doctor</b>.</p>
        <div class="src">Gandhi et al., NEJM 2003</div>
      </div>
      <div class="stat">
        <div class="n"><small>More than</small> 1 in 4</div>
        <p>older adults <b>fall each year</b>, but <b>less than half tell their doctor</b>.</p>
        <div class="src">CDC, Facts About Older Adult Falls</div>
      </div>
    </div>
    <p class="diff"><b>What’s different.</b> Diary apps (MyTherapy, CareClinic) record and chart symptoms but do not document a before/after count against a medicine’s start date; clinician tools (MedStopper, MedSafer) apply Beers/STOPP-type rules without the family’s home observations. Kinwise does both, on the device.<span class="fine">(Vendor pages, Oct 2026; “not documented” is not proof of absence.)</span></p>
  </section>

  <section class="shots">
    <figure>
      <div class="frame ba"><img src="${fileUrl(shots.beforeAfter)}" alt="Caregiver Overview, Before vs after card for lorazepam: dizziness on 2 of 19 answered days before, 9 of 14 after"></div>
      <figcaption><b>Alex:</b> before vs after</figcaption>
    </figure>
    <figure>
      <div class="frame"><img src="${fileUrl(shots.heard)}" alt="${h(`Margaret's check-in, “Here’s what I heard”: ${storyAlt(shots.heardText)}`)}"></div>
      <figcaption><b>Margaret (patient):</b> her words, read on-device</figcaption>
    </figure>
    <figure>
      <div class="frame"><img src="${fileUrl(shots.briefStrip)}" alt="Visit brief, day-by-day strip: dizzy on 2 of 19 answered days before lorazepam started, 9 of 14 after"></div>
      <figcaption><b>Visit brief</b> strip · full sample in the brief PDF</figcaption>
    </figure>
  </section>

  <div class="cols">
    <div class="col">
      <section>
        <h2>Who it is for, and where</h2>
        <p>The <b>family caregiver</b> (Alex) and the <b>older adult</b> (Margaret, 78, 8 medicines), who checks in on a large-text screen; the brief is for her <b>doctor or pharmacist</b>.</p>
        <p><b>Designed for use before</b> a Medicare <b>Annual Wellness Visit</b> or a pharmacist’s <b>Comprehensive Medication Review</b>, which may be done with the caregiver if she cannot take part because of cognitive impairment (42 CFR 423.153(d)(1)(vii)(B)(2)).</p>
        <p class="why"><b>Why it could help:</b> in EMPOWER (JAMA Intern Med 2014; cluster RCT, 303 long-term benzodiazepine users aged 65–95), <b>62%</b> of those given a brochure raised stopping with their doctor or pharmacist, and <b>27% vs 5%</b> (brochure vs usual care) had discontinued at 6 months. A reason to test Kinwise, not proof it works; Kinwise only prompts the conversation.</p>
      </section>
      <section>
        <h2>What it does</h2>
        <ol class="steps">
          <li><div><b>Check in, in her own words.</b> On-device NLP turns “felt woozy” into answers she confirms.</div></li>
          <li><div><b>Review her medicines</b> against AGS Beers 2023, anticholinergic burden, fall-risk drugs and cascades; each finding is cited and ends as a question.</div></li>
          <li><div><b>See what changed.</b> Dizziness on <b>2 of 19</b> answered days before lorazepam, <b>9 of 14</b> after (Fisher’s exact test).</div></li>
          <li><div><b>Bring one reviewed page to the visit,</b> plus a FHIR R4 export.</div></li>
        </ol>
      </section>
    </div>

    <div class="col">
      <section>
        <h2>How it works</h2>
        <div class="flow">
          <span class="chip">Cited KB</span><span class="arr">→</span>
          <span class="chip">Engines</span><span class="arr">→</span>
          <span class="chip ai">LLM rewords</span><span class="arr">→</span>
          <span class="chip">Code checks</span><span class="arr">→</span>
          <span class="chip">Human review</span>
        </div>
        <p>Deterministic TypeScript engines over a cited knowledge base (${f.kb.drugs} medicines, ${f.kb.beers} Beers rules, ${f.kb.cascades} cascades) compute every fact. An optional on-device LLM (Qwen2.5, WebGPU) only rewords them, and code drops any sentence that fails its number, name and wording checks. No account, no server.</p>
      </section>
      <section>
        <h2>Evidence &amp; rigor</h2>
        <ul class="ev">
          ${evidence.map((s) => `<li>${s}</li>`).join("\n          ")}
          <li><b>On-device AI:</b> ${f.ai.externalRequests} external requests in a recorded run; ${h(liveEscapesText(f))} flawed sentences got through; the template stays the default.</li>
          <li><b>Software:</b> ${software}.</li>
        </ul>
      </section>
    </div>
  </div>

  <div class="spacer"></div>

  <section class="status">
    <!-- Shortened from the canonical Working / Partial / Planned table in README.md and submission/DEVPOST.md. -->
    <div class="now">
      <h3>Working</h3>
      <ul>
        <li>Public live demo, no install</li>
        <li>NLP check-in · medicine matching</li>
        <li>Cited review · before/after · Ask Kinwise</li>
        <li>Reviewed brief · print · FHIR R4 export</li>
      </ul>
    </div>
    <div class="part">
      <h3>Partial</h3>
      <ul>
        <li>On-device LLM: optional, WebGPU only</li>
        <li>KB: ${f.kb.drugs} medicines, no clinician review</li>
        <li>No dose or allergy checks · English only</li>
        <li>One device, no sync · no FHIR receiver</li>
      </ul>
    </div>
    <div class="plan">
      <h3>Planned (not built)</h3>
      <ul>
        <li>Pharmacist KB review · validation pilot</li>
        <li>Encrypted family sharing and storage</li>
        <li>Pharmacy, portal import · voice · Spanish</li>
      </ul>
    </div>
  </section>

  <footer class="foot">
    <div>
      <div><b>Live demo:</b> ${link(DEMO_URL)}</div>
      <div><b>Video:</b> ${videoUrl ? link(videoUrl) : "on the Devpost page"}</div>
      <div><b>Code:</b> ${link(CODE_URL)}</div>
      <div><b>Team:</b> ${h(teamLine)}</div>
    </div>
    <p class="fine">Hackathon prototype: not FDA reviewed or cleared, not clinically validated, no HIPAA claim. Designed never to say a medicine caused a symptom or to advise a change; the clinician decides. Emergency: call 911.</p>
  </footer>
</div>
</body>
</html>`;
}

/** In-page check: how far (CSS px) any element reaches past the page's padding box (≤ 0 means it fits), and the spare
 * height left in the flexible spacer above the status row. */
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
  return { overBottom: Math.round(max - limit), overRight: Math.round(maxR - right), slack: spacer ? Math.round(spacer.getBoundingClientRect().height) : null };
}
