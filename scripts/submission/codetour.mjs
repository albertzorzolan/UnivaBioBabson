// "Code tour" PDF: a curated, readable selection of the Kinwise source (the full tree is far too long to print).
//
// Layout is done in the browser: every page is a fixed US-Letter box, code lines are poured into pages until they
// overflow, then page numbers, running heads, the table of contents and the "claim → code" index are filled in
// from where each file and line actually landed. So every page number printed in the PDF is exact.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PLANNED_DEMO_URL, REPO_BRANCH, REPO_URL, ROOT, TOKENS_CSS, escapeHtml as h, fontFaceCss } from "./lib.mjs";
import { highlightLines } from "./highlight.mjs";

// ---------------------------------------------------------------------------------------------------------------
// What the tour prints, in reading order. `find` patterns resolve to real line numbers at build time (a missing
// pattern fails the build, so the notes cannot drift from the code).

export const SECTIONS = [
  {
    id: "store",
    title: "The local record",
    intro:
      "There is no backend. The whole record (profile, medicines, check-ins, notes, briefs) is one JSON value in the browser’s localStorage. store.ts is pure (validation, load, save, commit with revision and audit fields) so tests and the in-app evaluation runner use it without React; StoreProvider.tsx is the only React binding.",
    files: [
      {
        path: "src/model/store.ts",
        purpose: "Pure persistence and commit rules for the local record.",
        pointers: [
          ["loadStore: validate, fall back to the seed", "export function loadStore"],
          ["commitStore: revision + who/when on every write", "export function commitStore"],
        ],
      },
      { path: "src/app/StoreProvider.tsx", purpose: "React provider and hook over the store; persists every commit.", pointers: [] },
    ],
  },
  {
    id: "kb",
    title: "Knowledge base and drug-name matching",
    intro:
      "The knowledge base is compiled from cited research by kb-src/build_kb.py into src/kb/data/*.json (AGS Beers 2023, ACB scale, STOPPFall/STEADI fall-risk classes, prescribing cascades, monitoring rules, {KB_SOURCES} sources). It has not been reviewed by a licensed clinician. normalize.ts turns what a family types into ingredient ids; a fuzzy match is only a suggestion the person must confirm.",
    files: [
      {
        path: "src/kb/index.ts",
        purpose: "Assembles the compiled KB and exposes lookups, class ancestry and search.",
        pointers: [
          ["selectorMatches: does a rule apply to these ingredients?", "export function selectorMatches"],
          ["kbCoverage: the counts shown on How it works", "export function kbCoverage"],
        ],
      },
      {
        path: "src/kb/normalize.ts",
        purpose: "Brand / generic / combination / misspelling matching to KB ingredient ids.",
        pointers: [
          ["damerauLevenshtein: bounded edit distance for suggestions", "function damerauLevenshtein"],
          ["matchDrugWithKb: the ordered matching attempts", "export function matchDrugWithKb"],
        ],
      },
    ],
  },
  {
    id: "meds",
    title: "Medication-review engine",
    intro:
      "Deterministic and parameterised by a KnowledgeBase value: same input, same output. A review builds a context (active matched medicines, effective conditions, diary facts), runs one module per criterion family, de-duplicates, links related diary symptoms and signals, and sorts. Every finding carries source ids and ends as a question for the clinician. The eval suite (eval/med-cases.json) runs this exact function.",
    files: [
      { path: "src/engine/meds/review.ts", purpose: "Public API bound to the compiled KB.", pointers: [["reviewMedications", "export function reviewMedications"]] },
      {
        path: "src/engine/meds/engine.ts",
        purpose: "The review pipeline: context → rule modules → dedupe → finalize → stable sort.",
        pointers: [
          ["reviewWithKb: the whole pipeline in 30 lines", "export function reviewWithKb"],
          ["dedupe", "export function dedupe"],
          ["finalize: related symptoms, signal links, wording guard", "function finalize"],
        ],
      },
      {
        path: "src/engine/meds/context.ts",
        purpose: "Per-run review context and the draft-finding shape.",
        pointers: [
          ["buildContext", "export function buildContext"],
          ["history of falls from a fall recorded in the diary", "if \\(!conditions\\.has\\(\"history_of_falls\"\\) && diary\\.fallDates"],
        ],
      },
      {
        path: "src/engine/meds/rules/beers.ts",
        purpose: "AGS Beers 2023: avoid, drug–disease, caution, interactions, CNS-active counts, kidney dosing.",
        pointers: [
          ["contextGate: age and condition gates", "function contextGate"],
          ["conditionDraft: drug–disease (e.g. history of falls)", "function conditionDraft"],
          ["countDraft: 3+ CNS-active medicines", "function countDraft"],
          ["pairDrafts: Table 5 interactions", "function pairDrafts"],
        ],
      },
      { path: "src/engine/meds/rules/acb.ts", purpose: "Anticholinergic burden total and finding.", pointers: [["acbSummary", "export function acbSummary"]] },
      { path: "src/engine/meds/rules/falls.ts", purpose: "Fall-risk medicine list (STEADI-Rx, STOPPFall).", pointers: [["fallRisk", "export function fallRisk"]] },
      { path: "src/engine/meds/rules/cascades.ts", purpose: "Prescribing cascades (index drug → effect → marker drug, in time order).", pointers: [["cascadeFindings", "export function cascadeFindings"]] },
    ],
  },
  {
    id: "timeline",
    title: "Timeline statistics",
    intro:
      "For each medicine start or stop in the last 180 days, every diary item is compared in the 21 days before with the days after, using answered days only (a blank is never counted as “no”). Yes/no items use Fisher’s exact test, 1–5 ratings use Mann–Whitney U. A difference is reported only when both the p-value and the size thresholds in rules.ts are met. Falls and near-falls are too rare to test, so they are listed by date. Sentences describe counts; none says why.",
    files: [
      {
        path: "src/engine/timeline/stats.ts",
        purpose: "Fisher’s exact test and Mann–Whitney U (exact and normal approximation), no dependencies.",
        pointers: [
          ["fisherExact", "export function fisherExact"],
          ["exactRankSumP: exact distribution with ties", "function exactRankSumP"],
          ["mannWhitneyU", "export function mannWhitneyU"],
        ],
      },
      { path: "src/engine/timeline/rules.ts", purpose: "Thresholds and fixed wording, with the measured false-alarm rates.", pointers: [["thresholds (p AND size)", "thresholds: \\{"]] },
      { path: "src/engine/timeline/windows.ts", purpose: "Before/after windows around starts and stops; overlapping changes.", pointers: [["eventWindows", "export function eventWindows"]] },
      {
        path: "src/engine/timeline/signals.ts",
        purpose: "Per-change comparisons → signals, code-rendered sentences, weekly view, chart rows.",
        pointers: [
          ["classifyStrength", "export function classifyStrength"],
          ["compareMetric: Fisher for yes/no, Mann–Whitney for ratings", "export function compareMetric"],
          ["signalSentence: “recorded on N of M answered days”", "export function signalSentence"],
          ["analyzeTimeline", "export function analyzeTimeline"],
        ],
      },
      { path: "src/engine/timeline/sentinel.ts", purpose: "Falls and near-falls listed by date, never tested.", pointers: [["sentinelEvents", "export function sentinelEvents"]] },
    ],
  },
  {
    id: "nlp",
    title: "Clinical NLP with ConText",
    intro:
      "A check-in story becomes reviewable diary proposals on the device: normalise and spell-correct, segment, match a concept lexicon and explicit ratings, then decide negation, time (current, past, hypothetical) and who it happened to with ConText (Harkema et al., 2009), adapted to first-person diaries. Each proposal keeps the exact span of the words it came from, and the person confirms it before anything is saved.",
    files: [
      {
        path: "src/engine/nlp/extract.ts",
        purpose: "The pipeline and field resolution (one proposal per field, conflicts surfaced).",
        pointers: [
          ["classify: apply ConText results to each mention", "function classify"],
          ["resolveBoolean", "function resolveBoolean"],
          ["extractCheckIn: public entry point", "export function extractCheckIn"],
        ],
      },
      {
        path: "src/engine/nlp/context.ts",
        purpose: "ConText triggers, scopes and terminations; voice and experiencer detection.",
        pointers: [
          ["CONTEXT_RULES: the trigger table", "export const CONTEXT_RULES"],
          ["detectVoice: who is writing", "export function detectVoice"],
          ["analyzeInSentence: scope resolution for one mention", "export function analyzeInSentence"],
        ],
      },
    ],
  },
  {
    id: "brief",
    title: "Visit brief: claim checker and FHIR export",
    intro:
      "The evidence package (engine/brief/evidence.ts, not listed) turns every fact into one code-written sentence with a stable id. verify.ts is the gate between the language model and a person: each AI sentence must cite evidence ids that exist, every number, date and “N of M” pair must appear in the cited text on the same side and for the same symptom, medicine names must be on the list, and banned wording (causal claims, advice, urgency, “safe”) is checked for and rejected. The patterns are not complete: the live run in eval/results/ai-live.json found a “can cause” sentence that got through. fhir.ts exports the record as a FHIR R4 document Bundle; the sample in docs/samples was validated against the public HAPI R4 server.",
    files: [
      {
        path: "src/engine/brief/verify.ts",
        purpose: "Deterministic claim checker for AI-written sentences.",
        pointers: [
          ["BANNED_PATTERNS", "export const BANNED_PATTERNS"],
          ["extractNumericFacts: numbers, dates, N-of-M pairs", "export function extractNumericFacts"],
          ["verifyClaims", "export function verifyClaims"],
        ],
      },
      {
        path: "src/engine/brief/fhir.ts",
        purpose: "FHIR R4 document Bundle: Composition, Patient, MedicationStatement, Observation, DetectedIssue.",
        pointers: [
          ["medicationStatement (RxNorm when known)", "function medicationStatement"],
          ["toFhirBundle", "export function toFhirBundle"],
          ["validateBundle: structural checks, references resolve", "export function validateBundle"],
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "On-device AI layer",
    intro:
      "Optional. WebLLM runs a quantised Qwen2.5 model in a Web Worker on WebGPU; only model files are downloaded, and prompts and outputs stay in the tab. Prompts are versioned and fence family-written text as data; a JSON-schema grammar limits evidence ids to the ones shown. The model only writes: tasks.ts (not listed) runs every output through verify.ts and guard.ts, drops failing sentences, and falls back to the template when too few survive.",
    files: [
      {
        path: "src/ai/llm.ts",
        purpose: "WebLLM worker client: status store, single-flight queue, cancel, timeouts.",
        pointers: [
          ["loadModel", "export async function loadModel"],
          ["cancel", "export function cancel"],
          ["generateJSON: queue, grammar, timeout", "export function generateJSON"],
        ],
      },
      {
        path: "src/ai/prompts.ts",
        purpose: "Versioned prompts, evidence handles, evidence selection under a token budget.",
        pointers: [
          ["RULES: the hard language rules", "const RULES ="],
          ["selectEvidence", "export function selectEvidence"],
        ],
      },
      {
        path: "src/ai/guard.ts",
        purpose: "Tolerant JSON parsing, untrusted-text fencing, quote location.",
        pointers: [
          ["parseModelJSON", "export function parseModelJSON"],
          ["wrapData: user text is data, never instructions", "export function wrapData"],
          ["locateQuote", "export function locateQuote"],
        ],
      },
    ],
  },
  {
    id: "test",
    title: "A representative test",
    intro:
      "One of the {TEST_FILES} test files in src/. It runs the production review over the fictional seed record and asserts the findings the demo story depends on (Beers avoid for lorazepam and diphenhydramine, the ACB total, the fall-risk list, the amlodipine → furosemide cascade, history of falls from the diary), that it is deterministic, and that the SPEC §3 wording rules hold, including answered-day denominators.",
    files: [{ path: "src/engine/meds/seed.review.test.ts", purpose: "Acceptance test of the review engine on the demo seed.", pointers: [] }],
  },
];

/** Product claims a judge might want to check, mapped to the line that implements them. */
const CLAIMS = [
  ["“Dizziness on 2 of 19 days before vs 9 of 14 after” — answered days, Fisher’s exact test", "src/engine/timeline/signals.ts", "export function compareMetric"],
  ["A difference is shown only if p-value AND size thresholds are met", "src/engine/timeline/rules.ts", "thresholds: \\{"],
  ["Falls are listed by date, never tested", "src/engine/timeline/sentinel.ts", "export function sentinelEvents"],
  ["“ACB score 7” for Margaret", "src/engine/meds/rules/acb.ts", "export function acbSummary"],
  ["Amlodipine → ankle swelling → furosemide cascade", "src/engine/meds/rules/cascades.ts", "export function cascadeFindings"],
  ["Beers “history of falls” rule turns on after a fall recorded in the diary", "src/engine/meds/context.ts", "if \\(!conditions\\.has\\(\"history_of_falls\"\\) && diary\\.fallDates"],
  ["“my granddaughter fell” is not her fall (experiencer)", "src/engine/nlp/context.ts", "export function analyzeInSentence"],
  ["Every AI number must appear in the cited evidence", "src/engine/brief/verify.ts", "export function extractNumericFacts"],
  ["Causal, advice and urgency wording is checked against BANNED_PATTERNS (the live run found gaps, e.g. one “can cause”: eval/results/ai-live.json)", "src/engine/brief/verify.ts", "export const BANNED_PATTERNS"],
  ["Family-written text is fenced as data, not instructions, before it reaches the model", "src/ai/guard.ts", "export function wrapData"],
  ["One generation at a time; cancel and timeout", "src/ai/llm.ts", "export function generateJSON"],
  ["FHIR Bundle references resolve inside the bundle", "src/engine/brief/fhir.ts", "export function validateBundle"],
  ["The record is stored only in this browser’s localStorage; it leaves only when the family prints or exports it", "src/model/store.ts", "export function saveStore"],
];

/** One line per folder for the repo map. */
const FOLDER_PURPOSE = {
  src: "Entry point (main.tsx)",
  "src/engine": "Pure, deterministic engines (no React, no browser APIs)",
  "src/views": "Screens, by audience",
  "src/model": "Domain types, local store (persistence, revisions), the fictional seed record, dates and ids",
  "src/kb": "Knowledge-base lookup API and drug-name matching",
  "src/kb/data": "Compiled KB (generated by kb-src/build_kb.py): medicines, classes, combinations, Beers rules, cascades, fall-risk classes, monitoring rules, sources",
  "src/engine/meds": "Deterministic medication review: context, pipeline, ordering, wording, add-medicine preview",
  "src/engine/meds/rules": "One module per criterion family: Beers, ACB, falls, cascades, duplicates, monitoring",
  "src/engine/timeline": "Before/after windows, Fisher / Mann–Whitney, signals, falls by date, weekly view",
  "src/engine/nlp": "Clinical NLP: normalise, segment, lexicon, numbers, ConText, field resolution, medicine remarks",
  "src/engine/brief": "Evidence package, template brief, claim checker, FHIR R4 export, record Q&A, CMS-style medication list",
  "src/ai": "On-device LLM: WebLLM worker client, model registry, prompts, JSON schemas, guards, tasks, dev harness",
  "src/app": "App shell: hash router, session, store provider, error boundaries, guided tour",
  "src/app/layouts": "Public, patient and caregiver shells and navigation",
  "src/ui": "Design system: tokens (light/dark), base CSS, fonts, icons",
  "src/ui/components": "Buttons, cards, badges, dialogs, tabs, fields, toasts, evidence chips, chart kit",
  "src/views/public": "Welcome (sign-in, one-click demo) and How it works (runs the evaluations live in the browser)",
  "src/views/patient": "Large-text patient view: Today check-in, My week, My medicines",
  "src/views/caregiver": "Overview, Medications, Medication review, Timeline, Ask, Visit brief, Settings",
  "src/views/caregiver/brief": "Visit-brief builder, document, evidence drawer, print and export controls",
  "src/views/caregiver/meds": "Medication editor, drug search, review cards and finding cards",
  "src/views/shared": "Caregiver timeline chart, records drawer and wording helpers",
};

const OTHER_DIRS = [
  ["eval/", "NLP corpora (dev + held-out), medication cases, eval runners, results/*.json"],
  ["kb-src/", "KB build script, research notes, source register"],
  ["scripts/", "E2E and accessibility runners (Playwright + system Chrome), LLM smoke test, model download, these PDFs"],
  ["docs/", "SPEC.md, SPEC-UI.md, CLINICAL-SOURCES.md, FHIR sample bundle + HAPI validation"],
  ["archive/", "Earlier prototypes, kept unchanged"],
];

// ---------------------------------------------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function countLines(text) {
  if (!text) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function srcStats() {
  const files = walk(join(ROOT, "src")).map((p) => {
    const rel = relative(ROOT, p);
    const text = readFileSync(p, "utf8");
    return { rel, dir: rel.slice(0, rel.lastIndexOf("/")), ext: rel.slice(rel.lastIndexOf(".") + 1), lines: countLines(text), test: /\.test\.tsx?$/.test(rel) };
  });
  const byDir = new Map();
  for (const f of files) {
    const d = byDir.get(f.dir) ?? { files: 0, lines: 0, tests: 0 };
    d.files++;
    d.lines += f.lines;
    if (f.test) d.tests++;
    byDir.set(f.dir, d);
  }
  const sum = (pred) => files.filter(pred).reduce((n, f) => n + f.lines, 0);
  return {
    files: files.length,
    lines: sum(() => true),
    code: sum((f) => (f.ext === "ts" || f.ext === "tsx") && !f.test),
    tests: sum((f) => f.test),
    testFiles: files.filter((f) => f.test).length,
    css: sum((f) => f.ext === "css"),
    json: sum((f) => f.ext === "json"),
    byDir,
  };
}

function resolvePointer(lines, file, pattern) {
  const re = new RegExp(pattern);
  const idx = lines.findIndex((l) => re.test(l));
  if (idx < 0) throw new Error(`code tour: pattern /${pattern}/ not found in ${file}`);
  return idx + 1;
}

function treeHtml(stats) {
  const set = new Set(stats.byDir.keys());
  for (const d of [...set]) {
    const parts = d.split("/");
    for (let k = 1; k < parts.length; k++) set.add(parts.slice(0, k).join("/"));
  }
  const dirs = [...set].sort();
  const rows = dirs.map((d) => {
    const depth = d.split("/").length - 1;
    const s = stats.byDir.get(d) ?? { files: 0, lines: 0 };
    const name = d.split("/").pop() + "/";
    const purpose = FOLDER_PURPOSE[d] ?? "";
    return `<tr><td class="tree" style="padding-left:${(depth - 0) * 11}px"><span class="tw">${depth ? "└ " : ""}</span>${h(name)}</td><td class="r">${s.files || "–"}</td><td class="r">${s.lines ? s.lines.toLocaleString("en-US") : "–"}</td><td>${h(purpose)}</td></tr>`;
  });
  return `<table class="map"><thead><tr><th>Folder</th><th class="r">Files</th><th class="r">Lines</th><th>Purpose</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

export function codeTourHtml({ facts }) {
  const stats = srcStats();
  const t = facts.tests;
  const vt = t.vitest;

  // Resolve files, lines and pointers.
  let tourLines = 0;
  const fill = (text) => text.replace("{TEST_FILES}", String(stats.testFiles)).replace("{KB_SOURCES}", String(facts.kb.sources));
  const sections = SECTIONS.map((s) => ({
    ...s,
    intro: fill(s.intro),
    files: s.files.map((f) => {
      const text = readFileSync(join(ROOT, f.path), "utf8");
      const raw = text.split("\n");
      if (text.endsWith("\n")) raw.pop();
      const pointers = f.pointers.map(([label, pat]) => ({ label, line: resolvePointer(raw, f.path, pat) }));
      tourLines += raw.length;
      return { ...f, id: `f-${f.path.replace(/[^a-z0-9]+/gi, "-")}`, lineCount: raw.length, html: highlightLines(text), pointers };
    }),
  }));
  const claims = CLAIMS.map(([claim, path, pat]) => {
    const raw = readFileSync(join(ROOT, path), "utf8").split("\n");
    return { claim, path, line: resolvePointer(raw, path, pat), fileId: `f-${path.replace(/[^a-z0-9]+/gi, "-")}` };
  });
  const tourFiles = sections.reduce((n, s) => n + s.files.length, 0);

  const toc = sections
    .map(
      (s, si) => `<div class="toc-sec"><a href="#s-${s.id}"><span class="toc-n">${si + 1}</span>${h(s.title)}</a><span class="toc-p" data-page-of="s-${s.id}"></span></div>
      ${s.files
        .map(
          (f) => `<div class="toc-file"><a href="#${f.id}"><code>${h(f.path)}</code></a><span class="toc-lines">${f.lineCount} lines</span><span class="toc-p" data-page-of="${f.id}"></span></div>`,
        )
        .join("")}`,
    )
    .join("");

  const claimRows = claims
    .map(
      (c) => `<tr><td>${h(c.claim)}</td><td><a href="#${c.fileId}-L${c.line}"><code>${h(c.path.replace(/^src\//, ""))}:${c.line}</code></a></td><td class="r"><span data-page-of="${c.fileId}-L${c.line}"></span></td></tr>`,
    )
    .join("");

  const testRows = [
    ["npx vitest run", vt ? `${vt.total.toLocaleString("en-US")} tests in ${vt.files ?? stats.testFiles} files (src/ and eval/): ${vt.passed.toLocaleString("en-US")} passed, ${vt.failed} failed, ${vt.skipped} skipped` : "unit and integration tests"],
    ["npm run eval:nlp", `NLP benchmark. Held-out (${facts.nlp.heldoutCases} stories, never used for tuning): micro F1 ${facts.nlp.heldoutF1}, precision ${facts.nlp.heldoutP}, recall ${facts.nlp.heldoutR}. Dev (${facts.nlp.devCases} stories): F1 ${facts.nlp.devF1}.`],
    ["npm run eval:meds", `Medication-review cases: ${facts.meds.cases} cases, ${facts.meds.expectations} expectations pass (KB ${facts.meds.kbVersion}).`],
    ["npm run test:e2e", t.e2ePassed != null ? `${t.e2ePassed} of ${t.e2eChecks} browser checks passed in the last run (system Chrome, own Vite server).` : `${t.e2eChecks} browser checks (system Chrome, own Vite server).`],
    ["npm run test:a11y", t.a11yScans != null ? `${t.a11yScans} axe scans (WCAG 2.2 AA rule tags, light and dark): ${t.a11yViolations} violations reported in the last run (the gate fails on serious or critical).` : "axe scans of every route, light and dark."],
    ["npm run typecheck / npm run build", "TypeScript strict, Vite production build."],
    ["node scripts/llm-smoke.mjs", "On-device LLM smoke test on WebGPU (needs local model files); results in eval/results/llm-smoke.json."],
  ]
    .map(([cmd, what]) => `<tr><td><code>${h(cmd)}</code></td><td>${h(what)}</td></tr>`)
    .join("");

  // Hidden source of all listing blocks; the in-page script paginates them.
  const blocks = sections
    .map((s, si) =>
      s.files
        .map((f, fi) => {
          const sectionIntro =
            fi === 0
              ? `<div class="sec-intro" id="s-${s.id}"><div class="sec-k">Part ${si + 1}</div><h1>${h(s.title)}</h1><p>${h(s.intro)}</p></div>`
              : "";
          const pointers = f.pointers.length
            ? `<div class="ptrs"><span class="ptrs-k">Look for</span>${f.pointers.map((p) => `<span class="ptr"><a href="#${f.id}-L${p.line}">${h(p.label)}</a> <span class="ln-ref">line ${p.line}</span></span>`).join("")}</div>`
            : "";
          const fileHead = `<div class="file-head" id="${f.id}"><h2><code>${h(f.path)}</code></h2><div class="file-meta">${f.lineCount} lines · ${h(f.purpose)}</div>${pointers}</div>`;
          const lines = f.html.map((l, k) => `<div class="ln" id="${f.id}-L${k + 1}"><span class="no">${k + 1}</span><span class="code">${l || " "}</span></div>`).join("");
          return `<section class="block" data-file="${h(f.path)}" data-file-id="${f.id}" data-section="${h(s.title)}"><div class="intro">${sectionIntro}${fileHead}</div>${lines}</section>`;
        })
        .join(""),
    )
    .join("");

  const css = `
${fontFaceCss()}
${TOKENS_CSS}
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: var(--font-sans); color: var(--ink); font-size: 9.6pt; line-height: 1.42; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
a { color: inherit; text-decoration: none; }
code { font-family: var(--font-mono); font-size: 0.92em; }
.page { width: 8.5in; height: 11in; position: relative; overflow: hidden; break-after: page; page-break-after: always; padding: 0.55in 0.6in 0.6in; display: flex; flex-direction: column; }
.page:last-child { break-after: auto; page-break-after: auto; }
.rh { position: absolute; top: 0.24in; left: 0.6in; right: 0.6in; display: flex; justify-content: space-between; font-size: 7.4pt; color: var(--ink-muted); letter-spacing: 0.02em; border-bottom: 1px solid var(--line); padding-bottom: 3px; }
.rh b { color: var(--primary); font-weight: 600; }
.rf { position: absolute; bottom: 0.24in; left: 0.6in; right: 0.6in; display: flex; justify-content: space-between; font-size: 7.4pt; color: var(--ink-muted); }
.page.code-page { padding: 0.48in 0.5in 0.46in; }
.page.code-page .rh, .page.code-page .rf { left: 0.5in; right: 0.5in; }
.body { flex: 1; min-height: 0; overflow: hidden; }

/* cover */
.cover { justify-content: space-between; background: var(--bg); }
.cover .mark { width: 54px; height: 54px; border-radius: 14px; background: var(--primary); display: grid; place-items: center; }
.cover h1 { font-family: var(--font-serif); font-weight: 600; font-size: 40pt; line-height: 1.05; margin: 22px 0 8px; letter-spacing: -0.01em; }
.cover .lede { font-family: var(--font-serif); font-size: 14pt; line-height: 1.35; max-width: 6in; color: var(--ink); }
.kv { display: grid; grid-template-columns: 1.45in 1fr; gap: 6px 14px; font-size: 10pt; margin-top: 26px; }
.kv dt { color: var(--ink-muted); }
.kv dd { margin: 0; }
.cover .note { font-size: 9pt; color: var(--ink-muted); max-width: 6.2in; }
.figs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 22px; }
.fig { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.fig .n { font-family: var(--font-serif); font-size: 20pt; font-weight: 600; color: var(--primary); line-height: 1.1; }
.fig .l { font-size: 8.4pt; color: var(--ink-muted); }

h1.pt { font-family: var(--font-serif); font-size: 22pt; font-weight: 600; margin: 0 0 10px; }
h3 { font-size: 8.6pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin: 14px 0 6px; }
p { margin: 0 0 8px; }

/* toc */
.toc-sec { display: flex; align-items: baseline; margin-top: 9px; font-weight: 600; font-size: 10.4pt; border-bottom: 1px solid var(--line); padding-bottom: 2px; }
.toc-sec a { flex: 1; }
.toc-n { display: inline-block; width: 22px; color: var(--accent); }
.toc-file { display: flex; align-items: baseline; padding: 1.5px 0 1.5px 22px; font-size: 9.2pt; }
.toc-file a { flex: 1; }
.toc-lines { color: var(--ink-muted); font-size: 8.2pt; margin-right: 16px; }
.toc-p { min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; color: var(--ink); }

table { border-collapse: collapse; width: 100%; }
th { text-align: left; font-size: 7.8pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); border-bottom: 1.5px solid var(--ink); padding: 3px 6px; }
td { border-bottom: 1px solid var(--line); padding: 3px 6px; vertical-align: top; font-size: 8.6pt; }
td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
.map td.tree { font-family: var(--font-mono); font-size: 8.2pt; white-space: nowrap; }
.tw { color: var(--line-strong); }
.flowd { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 4px 0 10px; }
.flowd div { border: 1px solid var(--line-strong); border-radius: 8px; padding: 6px 8px; font-size: 8.3pt; line-height: 1.3; }
.flowd div b { display: block; color: var(--primary); font-size: 8.8pt; }
.flowd div.ai { border-color: var(--accent); background: var(--accent-soft); }
.flowd div.ai b { color: var(--accent); }

/* listings */
.sec-intro { background: var(--surface-tint); border-radius: 8px; padding: 9px 12px 8px; margin-bottom: 9px; }
.sec-k { font-size: 7.6pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
.sec-intro h1 { font-family: var(--font-serif); font-size: 17pt; font-weight: 600; margin: 1px 0 4px; }
.sec-intro p { font-size: 8.9pt; margin: 0; line-height: 1.4; }
.file-head { border-top: 2px solid var(--ink); padding: 5px 0 5px; margin-bottom: 4px; }
.intro.follow { margin-top: 14px; }
.file-head h2 { font-size: 11pt; margin: 0; }
.file-head h2 code { font-size: 10.5pt; font-weight: 600; }
.file-meta { font-size: 8.4pt; color: var(--ink-muted); }
.ptrs { display: flex; flex-wrap: wrap; gap: 3px 6px; margin-top: 4px; font-size: 7.9pt; align-items: baseline; }
.ptrs-k { font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.08em; font-size: 7.2pt; margin-right: 2px; }
.ptr { background: var(--primary-soft); color: var(--primary-soft-ink); border-radius: 4px; padding: 0 5px; }
.ln-ref { color: var(--ink-muted); }
.ln { display: grid; grid-template-columns: 30px 1fr; font-family: var(--font-mono); font-size: 7.15pt; line-height: 1.28; }
.ln .no { color: #9aa29d; text-align: right; padding-right: 7px; user-select: none; }
.ln .code { white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere; color: #1f2a26; border-left: 1px solid var(--line); padding-left: 7px; }
.com { color: #5f7a6c; font-style: italic; }
.str { color: #a9573a; }
.re { color: #8a4b9a; }
.kw { color: #25584a; font-weight: 600; }
.num { color: #2f5f8a; }
.ty { color: #7d5210; }
#source { display: none; }
`;

  const LOGO = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>`;

  const front = `
<div class="page cover fm">
  <div>
    <div class="mark">${LOGO}</div>
    <h1>Kinwise<br>code tour</h1>
    <p class="lede">A guided, readable selection of the source behind Kinwise, the private, on-device co-pilot that helps families bring a clear medication question to the doctor or pharmacist.</p>
    <dl class="kv">
      <dt>Repository</dt><dd><a href="${REPO_URL}">${h(REPO_URL)}</a></dd>
      <dt>Branch</dt><dd>${h(REPO_BRANCH)}</dd>
      <dt>Live demo</dt><dd>${h(PLANNED_DEMO_URL)} <i>(planned, not yet deployed)</i></dd>
      <dt>Stack</dt><dd>React 19 · TypeScript (strict) · Vite 7 · WebLLM/WebGPU · Vitest · Playwright</dd>
      <dt>This document</dt><dd>${tourFiles} files, ${tourLines.toLocaleString("en-US")} lines, printed in full with line numbers. Line numbers match the files on the branch at the time this PDF was generated.</dd>
    </dl>
    <div class="figs">
      <div class="fig"><div class="n">${stats.files}</div><div class="l">files in src/</div></div>
      <div class="fig"><div class="n">${stats.code.toLocaleString("en-US")}</div><div class="l">lines of TypeScript (excl. tests)</div></div>
      <div class="fig"><div class="n">${stats.tests.toLocaleString("en-US")}</div><div class="l">lines of tests in ${stats.testFiles} files</div></div>
      <div class="fig"><div class="n">${stats.css.toLocaleString("en-US")}</div><div class="l">lines of CSS (+ ${stats.json.toLocaleString("en-US")} lines of compiled KB JSON)</div></div>
    </div>
  </div>
  <p class="note">Why a tour: src/ holds ${stats.lines.toLocaleString("en-US")} lines, too many to read on paper. This PDF prints the parts that carry the product’s claims (the medication-review engine, timeline statistics, clinical NLP, the claim checker, FHIR export, the on-device AI layer, the knowledge base and the local store) and leaves out views, styles and most tests. Everything else is in the repository. All people and records in the code and tests are fictional.</p>
</div>

<div class="page fm" data-fm="toc">
  <div class="body">
    <h1 class="pt">Contents</h1>
    <div class="toc-sec"><a href="#fm-map"><span class="toc-n">·</span>Repository map</a><span class="toc-p" data-page-of="fm-map"></span></div>
    <div class="toc-sec"><a href="#fm-arch"><span class="toc-n">·</span>How the parts fit, and where each claim lives</a><span class="toc-p" data-page-of="fm-arch"></span></div>
    <div class="toc-sec"><a href="#fm-tests"><span class="toc-n">·</span>Tests and evaluations</a><span class="toc-p" data-page-of="fm-tests"></span></div>
    ${toc}
  </div>
</div>

<div class="page fm" id="fm-map">
  <div class="body">
    <h1 class="pt">Repository map</h1>
    <p>Every folder under <code>src/</code>, with the files and lines directly inside it (counted when this PDF was built) and what it is for. Pure engines (<code>engine/</code>, <code>kb/</code>, <code>model/</code>) import no React or browser APIs, so the same code runs in Vitest, in Node and in the in-app evaluation runner.</p>
    ${treeHtml(stats)}
    <h3>Outside src/</h3>
    <table><tbody>${OTHER_DIRS.map(([d, p]) => `<tr><td style="width:1.1in"><code>${h(d)}</code></td><td>${h(p)}</td></tr>`).join("")}</tbody></table>
  </div>
</div>

<div class="page fm" id="fm-arch">
  <div class="body">
    <h1 class="pt">How the parts fit</h1>
    <p>Deterministic code decides; the optional language model only writes; a person reviews. Each box is a folder in this tour.</p>
    <div class="flowd">
      <div><b>Check-in → diary</b>engine/nlp: story to proposals with exact spans; the person confirms</div>
      <div><b>Medicines → findings</b>kb + engine/meds: cited Beers, ACB, fall-risk, cascade findings</div>
      <div><b>Diary → signals</b>engine/timeline: before/after counts, Fisher / Mann–Whitney</div>
      <div><b>Evidence package</b>engine/brief: one code-written sentence per fact, stable ids</div>
      <div class="ai"><b>Draft → check</b>ai + verify.ts: model cites ids; code checks every sentence</div>
    </div>
    <p>The brief is always available from the deterministic template. When the model is loaded, its sentences replace template wording only if they pass <code>verifyClaims</code>; the medicine table, counts and limitations stay code-written. Everything is stored by <code>model/store.ts</code> in this browser only.</p>
    <h3>Where each claim lives</h3>
    <p>Product claims from the demo, the line that implements each one, and the page in this PDF.</p>
    <table><thead><tr><th>Claim</th><th>Code</th><th class="r">Page</th></tr></thead><tbody>${claimRows}</tbody></table>
  </div>
</div>

<div class="page fm" id="fm-tests">
  <div class="body">
    <h1 class="pt">Tests and evaluations</h1>
    <p>All commands run from the repository root after <code>npm ci</code>. Browser checks start their own Vite server and drive the system Chrome headless. Counts below are read from the reports when this PDF was built (Vitest is run by the generator; the E2E and accessibility counts come from the last run’s reports in <code>test-results/</code>).</p>
    <table><thead><tr><th style="width:2.1in">Command</th><th>What it checks</th></tr></thead><tbody>${testRows}</tbody></table>
    <h3>What the evaluations do not show</h3>
    <p>The diary stories and medication cases are synthetic and were written by the team. The knowledge base has not been reviewed by a licensed clinician. The medication eval checks that published criteria fire correctly, not clinical outcomes, and no flag does not mean a medicine is free of risk. In a live end-to-end run of the on-device model (<code>eval/results/ai-live.json</code>), the claim checker let ${facts.ai.liveSlipped} flawed AI outputs through (a garbled sentence, a “can cause” explanation, a diary suggestion quoted from the wrong sentence); that is why the template brief stays the default and every AI draft needs a person’s review.</p>
    <h3>How to regenerate this PDF</h3>
    <p><code>node scripts/submission/make-pdfs.mjs --only=code</code> (or without <code>--only</code> for all three submission PDFs). It starts Vite on port 5222 unless <code>BASE_URL</code> is set, uses the system Chrome through Playwright, and writes to <code>submission/</code>.</p>
  </div>
</div>`;

  const script = `
(() => {
  const pages = document.getElementById("pages");
  const source = document.getElementById("source");
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  function newCodePage(file, section, cont) {
    const p = document.createElement("div");
    p.className = "page code-page";
    p.innerHTML = '<div class="rh"><span><b>' + esc(section) + '</b></span><span class="files"><code>' + esc(file) + '</code>' + (cont ? ' (continued)' : '') + '</span></div><div class="body"></div><div class="rf"><span>Kinwise code tour</span><span class="pn"></span></div>';
    pages.appendChild(p);
    return p.querySelector(".body");
  }
  const over = (b) => b.scrollHeight > b.clientHeight + 0.5;
  let body = null;
  let lastSection = null;
  const KEEP = 6; // a file header always stays with at least this many lines of its code
  for (const block of [...source.children]) {
    const file = block.dataset.file, section = block.dataset.section;
    const intro = block.querySelector(".intro");
    const lines = [...block.querySelectorAll(".ln")];
    const head = lines.slice(0, KEEP);
    if (!body || section !== lastSection) {
      body = newCodePage(file, section, false);
      body.append(intro, ...head);
    } else {
      // Same section: continue on the current page if the header and the first lines fit.
      intro.classList.add("follow");
      body.append(intro, ...head);
      if (over(body)) {
        for (const el of [intro, ...head]) el.remove();
        body = newCodePage(file, section, false);
        body.append(intro, ...head);
      } else {
        const files = body.parentElement.querySelector(".rh .files");
        files.insertAdjacentHTML("beforeend", ' · <code>' + esc(file) + '</code>');
      }
    }
    lastSection = section;
    for (const ln of lines.slice(KEEP)) {
      body.appendChild(ln);
      if (over(body)) {
        body.removeChild(ln);
        body = newCodePage(file, section, true);
        body.appendChild(ln);
      }
    }
  }
  const all = [...document.querySelectorAll(".page")];
  const total = all.length;
  all.forEach((p, i) => {
    if (!p.classList.contains("cover")) {
      let rf = p.querySelector(".rf");
      if (!rf) { rf = document.createElement("div"); rf.className = "rf"; rf.innerHTML = '<span>Kinwise code tour</span><span class="pn"></span>'; p.appendChild(rf); }
      rf.querySelector(".pn").textContent = (i + 1) + " / " + total;
    }
  });
  const pageOf = (id) => { const el = document.getElementById(id); if (!el) return null; const p = el.closest(".page"); return p ? all.indexOf(p) + 1 : null; };
  for (const el of document.querySelectorAll("[data-page-of]")) {
    const n = pageOf(el.dataset.pageOf);
    el.textContent = n ?? "?";
    if (n == null) el.style.color = "red";
  }
  const overflow = all.filter((p) => { const b = p.querySelector(".body") || p; return b.scrollHeight > b.clientHeight + 1; }).map((p) => all.indexOf(p) + 1);
  window.__tour = { total, overflow, done: true };
})();`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Kinwise — code tour</title><style>${css}</style></head>
<body>
<div id="pages">${front}</div>
<div id="source">${blocks}</div>
<script>${script}</script>
</body>
</html>`;
}
