// One-page project description (US Letter). Wording follows SPEC §3: no causal claims, no safe/unsafe, no advice,
// counts always with denominators, no validation/clearance/compliance claims, finished vs planned stated plainly.
// Problem statistics: kb-src/research/market-evidence.md §0 (rows 1, 2 and 4). Demo-story numbers: the live app
// (captured in the screenshots) and src/views/public/journeyFigures.ts. Every other number comes from facts.mjs.
import { PLANNED_DEMO_URL, REPO_BRANCH, REPO_URL, TOKENS_CSS, escapeHtml as h, fileUrl, fontFaceCss } from "./lib.mjs";

/** Width of the Visit-brief thumbnail; its two screenshots scale to it (≈0.7× app size, so the strip stays legible). */
const BRIEF_SHOT_IN = 3.85;
/** Height of the screenshot row; the square "Before vs after" card is this wide too. */
const SHOT_H_IN = 1.6;

const LOGO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>`;

export function onePagerHtml({ facts: f, shots, team }) {
  const t = f.tests;
  const vt = t.vitest;
  const unit = vt
    ? `${vt.passed.toLocaleString("en-US")} unit tests pass${vt.skipped ? ` (${vt.skipped} skipped)` : ""}${vt.failed ? `, ${vt.failed} fail` : ""}`
    : "unit tests (npx vitest run)";
  const e2e = t.e2ePassed != null ? `${t.e2ePassed} of ${t.e2eChecks} browser end-to-end checks pass` : `${t.e2eChecks} browser end-to-end checks`;
  const a11y =
    t.a11yScans != null ? `${t.a11yScans} axe accessibility scans, ${t.a11yViolations} violations reported` : "axe accessibility scans of every screen";
  const teamText = team?.trim() ? h(team.trim()) : `<span class="placeholder">[Team member names, roles]</span>`;

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
body { font-family: var(--font-sans); color: var(--ink); font-size: 8.6pt; line-height: 1.34; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 8.5in; height: 11in; padding: 0.34in 0.42in 0.28in; overflow: hidden; position: relative; display: flex; flex-direction: column; gap: 0.085in; }
.page > * { flex: none; }
.page > .spacer { flex: 1; }
p { margin: 0; }
b, strong { font-weight: 600; }

/* Header */
.head { padding-bottom: 0.07in; border-bottom: 2px solid var(--ink); }
.toprow { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.2in; }
.brand { display: flex; align-items: center; gap: 9px; }
.mark { width: 32px; height: 32px; border-radius: 9px; background: var(--primary); display: grid; place-items: center; flex: none; }
.name { font-size: 21pt; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.name i { color: var(--accent-bright); font-style: normal; }
.sub { font-size: 8pt; color: var(--ink-muted); margin-top: 2px; white-space: nowrap; }
.pitch { font-family: var(--font-serif); font-size: 12.4pt; line-height: 1.27; margin-top: 5px; }
.meta { text-align: right; font-size: 7.8pt; color: var(--ink-muted); line-height: 1.5; flex: none; }
.meta .pill { display: inline-block; background: var(--primary-soft); color: var(--primary-soft-ink); border-radius: 999px; padding: 1px 9px; font-weight: 600; margin-bottom: 3px; }
.meta .demo { display: inline-block; background: var(--caution-soft); color: var(--caution-ink); border-radius: 999px; padding: 1px 8px; font-weight: 600; margin-left: 4px; }

h2 { font-size: 7.8pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin: 0 0 3px; }

/* Problem */
.stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.12in; }
.stat { background: var(--surface-sunken); border-radius: 8px; padding: 6px 9px 5px; display: flex; flex-direction: column; }
.stat .n { font-family: var(--font-serif); font-size: 17pt; font-weight: 600; line-height: 1; color: var(--accent); }
.stat .n small { font-size: 9pt; font-weight: 600; }
.stat p { margin-top: 2px; }
.stat .src { margin-top: auto; padding-top: 2px; font-size: 7.3pt; color: var(--ink-muted); }
.gap { margin-top: 5px; font-family: var(--font-serif); font-style: italic; font-size: 9.6pt; }

/* Screens: whole cards from the live app (no mid-sentence crops), sized so their text stays legible. */
.shots { display: grid; grid-template-columns: ${SHOT_H_IN}in ${BRIEF_SHOT_IN}in minmax(0, 1fr); grid-template-rows: ${SHOT_H_IN}in; gap: 0.14in; }
.shot { border: 1px solid var(--line); border-radius: 7px; overflow: hidden; background: #fff; min-width: 0; min-height: 0; }
.shot.ba { background: #efede6; }
.shot.ba img { display: block; width: 100%; height: 100%; object-fit: contain; }
.shot.brief { display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: 5px 8px; background: #fffdf9; }
.shot.brief img { display: block; width: 100%; height: auto; flex: none; }
.shot.brief .cut { border-top: 1px dashed var(--line-strong); margin: 1px 0; flex: none; }
.caps { display: flex; flex-direction: column; justify-content: center; gap: 4px; font-size: 7.4pt; color: var(--ink-muted); line-height: 1.32; }
.caps b { color: var(--ink); }

/* Body */
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.2in; }
.col { display: flex; flex-direction: column; gap: 0.08in; }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; counter-reset: s; }
.steps li { display: grid; grid-template-columns: 16px 1fr; gap: 6px; counter-increment: s; }
.steps li::before { content: counter(s); width: 16px; height: 16px; border-radius: 50%; background: var(--primary); color: #fff; font-weight: 700; font-size: 7.6pt; display: grid; place-items: center; margin-top: 1px; }
.flow { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; margin: 1px 0 4px; }
.flow .chip { border: 1px solid var(--line-strong); border-radius: 5px; padding: 0 5px; font-size: 8pt; line-height: 1.35; background: #fff; font-weight: 600; color: var(--primary); }
.flow .chip.ai { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.flow .arr { color: var(--ink-muted); font-size: 8.5pt; }
.ev { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.ev li { padding-left: 9px; position: relative; }
.ev li::before { content: ""; position: absolute; left: 0; top: 0.55em; width: 4px; height: 4px; border-radius: 50%; background: var(--primary); }
.num { font-weight: 700; color: var(--primary); }

.status { display: grid; grid-template-columns: 1fr 1fr; gap: 0.2in; }
.status div { border-radius: 7px; padding: 5px 8px; }
.status .now { background: var(--success-soft); }
.status .plan { background: var(--surface-sunken); }
.status h3 { margin: 0 0 2px; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.1em; }
.status .now h3 { color: #33603f; }
.status .plan h3 { color: var(--ink-muted); }
.status ul { margin: 0; padding-left: 11px; }

.foot { border-top: 1px solid var(--line-strong); padding-top: 5px; display: grid; grid-template-columns: 1.3fr 1fr; gap: 0.2in; font-size: 7.9pt; }
.foot a { color: var(--primary); text-decoration: none; font-weight: 600; }
.placeholder { background: var(--caution-soft); color: var(--caution-ink); padding: 0 4px; border-radius: 3px; }
.fine { font-size: 7.3pt; color: var(--ink-muted); line-height: 1.3; }
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
        Working prototype · web app, no backend
      </div>
    </div>
    <p class="pitch">Helps families caring for an older adult on many medicines notice possible side effects early, and bring a clear, evidence-backed question to the doctor or pharmacist.</p>
  </header>

  <section>
    <h2>The problem</h2>
    <div class="stats">
      <div class="stat">
        <div class="n">43.0%</div>
        <p>of US adults 65+ used <b>5 or more prescription drugs</b> in a 30-day period (2017–Mar 2020), up from 33.3% in 2001–04.</p>
        <div class="src">NCHS, Health, United States</div>
      </div>
      <div class="stat">
        <div class="n">12.1 <small>per 1,000 a year</small></div>
        <p><b>emergency visits for medication harms</b>, adults 65+ (2017–2019), vs 5.0 under 65; <b>95.8%</b> with medicines taken as intended.</p>
        <div class="src">Budnitz et al., JAMA 2021</div>
      </div>
      <div class="stat">
        <div class="n"><small>More than</small> 1 in 4</div>
        <p>older adults <b>fall each year</b>, but <b>less than half tell their doctor</b>.</p>
        <div class="src">CDC, Facts About Older Adult Falls</div>
      </div>
    </div>
    <p class="gap">Clinicians have the criteria but not the home observations; diary apps, the reverse. Kinwise connects the two for the visit.</p>
  </section>

  <section class="shots">
    <div class="shot ba"><img src="${fileUrl(shots.beforeAfter)}" alt="Before vs after card: dizziness 2 of 19 answered days before, 9 of 14 after"></div>
    <div class="shot brief">
      <img class="band" src="${fileUrl(shots.briefBand)}" alt="Visit brief header, reviewed by Alex">
      <div class="cut"></div>
      <img src="${fileUrl(shots.briefStrip)}" alt="Visit brief day-by-day strip before and after lorazepam">
    </div>
    <div class="caps">
      <p><b>Left:</b> the caregiver Overview’s “Before vs after” card for lorazepam (answered days only).</p>
      <p><b>Right:</b> the Visit brief after Alex ticks “I’ve reviewed this brief”: its header and the day-by-day strip from section 2.</p>
      <p>Screenshots of the live app. The full printout is attached: <b>kinwise-sample-visit-brief.pdf</b>.</p>
    </div>
  </section>

  <div class="cols">
    <div class="col">
      <section>
        <h2>Who it is for</h2>
        <p>The <b>family caregiver</b> (Alex in the demo) and the <b>older adult</b> (Margaret, 78, 8 medicines from several prescribers), who checks in on a large-text screen. Written for her <b>doctor or pharmacist</b>.</p>
      </section>
      <section>
        <h2>What it does</h2>
        <ol class="steps">
          <li><div><b>Check in, in her own words.</b> On-device NLP turns “felt woozy… nearly went over in the kitchen” into diary answers she confirms, and skips “my granddaughter fell” (ConText).</div></li>
          <li><div><b>Keep the medicine list.</b> Brands, combinations (“Tylenol PM”) and misspellings match to ${f.kb.drugs} medicines.</div></li>
          <li><div><b>Review against published criteria.</b> AGS Beers 2023, anticholinergic burden (ACB 7), fall-risk lists, cascades; each finding is cited and ends as a question.</div></li>
          <li><div><b>See what changed.</b> Dizziness on <b>2 of 19</b> answered days before lorazepam started, <b>9 of 14</b> after (Fisher’s exact test).</div></li>
          <li><div><b>Bring one page to the visit.</b> A brief the family reviews before printing, plus a FHIR R4 export.</div></li>
        </ol>
      </section>
      <section>
        <h2>Privacy &amp; safety by design</h2>
        <p>No account, no server: the record stays in the browser and the model runs on the device (only model files are downloaded); nothing leaves unless the family prints or exports. Kinwise is designed never to say a medicine caused a symptom or to advise stopping one; screens carry <i>“Don’t stop or change any medicine without talking to the prescriber.”</i> No flag does not mean a medicine is free of risk.</p>
      </section>
    </div>

    <div class="col">
      <section>
        <h2>How it works</h2>
        <div class="flow">
          <span class="chip">Cited KB</span><span class="arr">→</span>
          <span class="chip">Engines decide</span><span class="arr">→</span>
          <span class="chip">Evidence ids</span><span class="arr">→</span>
          <span class="chip ai">LLM writes</span><span class="arr">→</span>
          <span class="chip">Code checks</span><span class="arr">→</span>
          <span class="chip">Person reviews</span>
        </div>
        <p>Deterministic TypeScript engines over a cited knowledge base (${f.kb.drugs} medicines, ${f.kb.beers} Beers rules, ${f.kb.cascades} cascades) compute every fact as a sentence with an id. The optional on-device LLM (Qwen2.5 on WebGPU) only rewords cited facts; code checks numbers, medicine names and wording and drops failing sentences. Without WebGPU, the template brief works the same way.</p>
      </section>
      <section>
        <h2>Evidence &amp; rigor</h2>
        <ul class="ev">
          <li><b>Clinical NLP:</b> micro F1 <span class="num">${f.nlp.heldoutF1}</span> (precision ${f.nlp.heldoutP}, recall ${f.nlp.heldoutR}) on ${f.nlp.heldoutCases} held-out diary stories never used for tuning; dev set (${f.nlp.devCases} stories): ${f.nlp.devF1}.</li>
          <li><b>Medication review:</b> <span class="num">${f.meds.cases}</span> synthetic cases and ${f.meds.expectations} expectations pass.</li>
          <li><b>FHIR:</b> sample Bundle (${f.fhir.resources} resources): <span class="num">${f.fhir.errors} errors</span> on the public HAPI R4 validator (${f.fhir.warnings} warnings: unknown code systems).</li>
          <li><b>On-device AI</b> (${h(f.ai.model)}, ${h(f.ai.machine)}): ${f.ai.externalRequests} external requests; answers ${f.ai.askS} s, brief ${f.ai.briefS} s. A live run found ${f.ai.liveSlipped} AI outputs the checker should have stopped (a garbled sentence, a “can cause” explanation, a mis-quoted diary suggestion), so the template stays the default.</li>
          <li><b>Software:</b> ${unit}; ${e2e}; ${a11y}.</li>
        </ul>
      </section>
    </div>
  </div>

  <div class="spacer"></div>

  <section class="status">
    <div class="now">
      <h3>Working now (in the prototype)</h3>
      <ul>
        <li>Check-in with on-device NLP · medicine name matching</li>
        <li>Cited medication review · before/after statistics · record Q&amp;A</li>
        <li>Visit brief, print and FHIR R4 export · optional on-device LLM</li>
      </ul>
    </div>
    <div class="plan">
      <h3>Planned (not built)</h3>
      <ul>
        <li>Clinician review of the KB (not yet done); user study</li>
        <li>Import from pharmacy or portal · family sharing · Spanish</li>
        <li>Public hosted demo (GitHub Pages)</li>
      </ul>
    </div>
  </section>

  <footer class="foot">
    <div>
      <div><b>Code:</b> <a href="${REPO_URL}">${h(REPO_URL.replace(/^https:\/\//, ""))}</a> (branch ${h(REPO_BRANCH)})</div>
      <div><b>Live demo (planned, not yet deployed):</b> ${h(PLANNED_DEMO_URL.replace(/^https:\/\//, ""))}</div>
      <div><b>Team:</b> ${teamText}</div>
    </div>
    <p class="fine">Hackathon prototype: not reviewed or cleared by the FDA (no exemption claimed), not clinically validated, no HIPAA claim. The doctor or pharmacist decides. In an emergency, call 911.</p>
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
