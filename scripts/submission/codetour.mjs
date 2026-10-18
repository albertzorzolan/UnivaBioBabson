// "Code tour" PDF: a curated, readable walk through the Kinwise source, plus an index of every source file.
//
// Layout is done in the browser: every page is a fixed US-Letter box, code lines are poured into pages until they
// overflow, then page numbers, running heads, the table of contents and the "claim → code" index are filled in
// from where each file and line actually landed. So every page number printed in the PDF is exact.
//
// Every line number printed outside a listing (the 5-minute walkthrough, the "Look for" pointers, the claim table)
// is found at build time by searching the current file for a declaration or pattern. A missing or ambiguous
// symbol throws, so the PDF can never print a line number that has drifted from the code.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// Namespace import: CODE_URL, DEMO_URL and DEFAULT_TEAM are optional exports (older lib.mjs versions lack them).
import * as lib from "./lib.mjs";
import { highlightLines, tokenize } from "./highlight.mjs";

const { ROOT, TOKENS_CSS, escapeHtml: h, fontFaceCss } = lib;

/** The branch judges should read (the repo's default branch still holds an earlier prototype). */
const CODE_URL = lib.CODE_URL ?? `${lib.REPO_URL}/tree/${lib.REPO_BRANCH}`;
/** Per-file links: …/blob/<branch>/<path>. */
const BLOB_URL = CODE_URL.includes("/tree/") ? CODE_URL.replace("/tree/", "/blob/") : `${lib.REPO_URL}/blob/${lib.REPO_BRANCH}`;
const DEMO_URL = lib.DEMO_URL ?? lib.PLANNED_DEMO_URL;
const TEAM = lib.DEFAULT_TEAM ?? "Albert Zorzolan and Neil Shah, Babson College";

/** GitHub link to one file (optionally one line) on the code branch. */
function blobUrl(path, line) {
  return `${BLOB_URL}/${path.split("/").map(encodeURIComponent).join("/")}${line ? `#L${line}` : ""}`;
}

/**
 * Regex source for the line that declares `name`: a TS/JS function, const, let, class, interface or type (exported
 * or not, top level or nested), or a Python def / class.
 */
export function sym(name) {
  return `^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\*?|const|let|class|interface|type|def)\\s+${name}\\b`;
}

/**
 * The banned-wording list of the AI claim checker. Anchored to its exported declaration (re-exported from
 * engine/brief/index.ts and imported by the tests), not to the loop that uses it, which changes more often.
 */
const BANNED_DECL = sym("BANNED_PATTERNS");

// ---------------------------------------------------------------------------------------------------------------
// What the tour prints, in reading order. Pointer patterns resolve to real line numbers at build time (a missing
// pattern fails the build, so the notes cannot drift from the code). A file with `excerpts` prints only those
// ranges, with their real line numbers; every other file is printed in full.
//
// Excerpt forms:  { at: sym("x") }                  the declaration of x, its leading comment, to the end of its body
//                 { from: pattern, to: pattern }     from the first line matching `from` to the next line matching `to`
//                 { from: pattern, toEndOf: sym() }  from `from` to the end of the body of that declaration

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
          ["loadStore: validate, fall back to the seed", sym("loadStore")],
          ["commitStore: revision + who/when on every write", sym("commitStore")],
        ],
      },
      { path: "src/app/StoreProvider.tsx", purpose: "React provider and hook over the store; persists every commit.", pointers: [] },
    ],
  },
  {
    id: "kb",
    title: "Knowledge base and drug-name matching",
    intro:
      "The knowledge base is compiled from cited research by kb-src/build_kb.py into src/kb/data/*.json (AGS Beers 2023, ACB scale, STOPPFall/STEADI fall-risk classes, prescribing cascades, monitoring rules, {KB_SOURCES} sources). The compiler checks every user-facing KB string for the SPEC §3 banned words ({KB_BANNED}), the list the review engine’s wording check in engine/meds/text.ts mirrors (a shorter list than the AI claim checker’s BANNED_PATTERNS), and refuses to write anything if a rule cites an unknown medicine, class or source. It has not been reviewed by a licensed clinician. normalize.ts turns what a family types into ingredient ids; a fuzzy match is only a suggestion the person must confirm.",
    files: [
      {
        path: "kb-src/build_kb.py",
        purpose: "Python compiler: curated sources + research extracts → src/kb/data/*.json; --check validates without writing.",
        excerpts: [
          { from: "^#!/usr/bin/env python3", to: '^"""$' },
          { from: "^# SPEC §3 language rules", to: "^\\]\\]$" },
          { at: sym("Problems") },
          { from: sym("build"), to: "rx_extra = load\\(rx_extra_path\\)" },
          { at: sym("check_selector") },
          { at: sym("check_text") },
          { from: '^    data = \\{"sources"', to: "^    return data, report, problems$" },
          { at: sym("main") },
          { from: '^if __name__ == "__main__":', to: "sys\\.exit\\(main" },
        ],
        pointers: [
          ["check_text: banned wording, placeholders, sentence limits", sym("check_text")],
          ["main: --check validates only; otherwise writes the JSON", sym("main")],
        ],
      },
      {
        path: "src/kb/index.ts",
        purpose: "Assembles the compiled KB and exposes lookups, class ancestry and search.",
        pointers: [
          ["selectorMatches: does a rule apply to these ingredients?", sym("selectorMatches")],
          ["kbCoverage: the counts shown on How it works", sym("kbCoverage")],
        ],
      },
      {
        path: "src/kb/normalize.ts",
        purpose: "Brand / generic / combination / misspelling matching to KB ingredient ids.",
        pointers: [
          ["damerauLevenshtein: bounded edit distance for suggestions", sym("damerauLevenshtein")],
          ["matchDrugWithKb: the ordered matching attempts", sym("matchDrugWithKb")],
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
      { path: "src/engine/meds/review.ts", purpose: "Public API bound to the compiled KB.", pointers: [["reviewMedications", sym("reviewMedications")]] },
      {
        path: "src/engine/meds/engine.ts",
        purpose: "The review pipeline: context → rule modules → dedupe → finalize → stable sort.",
        pointers: [
          ["reviewWithKb: the whole pipeline in 30 lines", sym("reviewWithKb")],
          ["dedupe", sym("dedupe")],
          ["finalize: related symptoms, signal links, wording guard", sym("finalize")],
        ],
      },
      {
        path: "src/engine/meds/context.ts",
        purpose: "Per-run review context and the draft-finding shape.",
        pointers: [
          ["buildContext", sym("buildContext")],
          ["history of falls from a fall recorded in the diary", "if \\(!conditions\\.has\\(\"history_of_falls\"\\) && diary\\.fallDates"],
        ],
      },
      {
        path: "src/engine/meds/rules/beers.ts",
        purpose: "AGS Beers 2023: avoid, drug–disease, caution, interactions, CNS-active counts, kidney dosing.",
        pointers: [
          ["contextGate: age and condition gates", sym("contextGate")],
          ["conditionDraft: drug–disease (e.g. history of falls)", sym("conditionDraft")],
          ["countDraft: 3+ CNS-active medicines", sym("countDraft")],
          ["pairDrafts: Table 5 interactions", sym("pairDrafts")],
        ],
      },
      { path: "src/engine/meds/rules/acb.ts", purpose: "Anticholinergic burden total and finding.", pointers: [["acbSummary", sym("acbSummary")]] },
      { path: "src/engine/meds/rules/falls.ts", purpose: "Fall-risk medicine list (STEADI-Rx, STOPPFall).", pointers: [["fallRisk", sym("fallRisk")]] },
      { path: "src/engine/meds/rules/cascades.ts", purpose: "Prescribing cascades (index drug → effect → marker drug, in time order).", pointers: [["cascadeFindings", sym("cascadeFindings")]] },
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
          ["fisherExact", sym("fisherExact")],
          ["exactRankSumP: exact distribution with ties", sym("exactRankSumP")],
          ["mannWhitneyU", sym("mannWhitneyU")],
        ],
      },
      { path: "src/engine/timeline/rules.ts", purpose: "Thresholds and fixed wording, with the measured false-alarm rates.", pointers: [["thresholds (p AND size)", "thresholds: \\{"]] },
      { path: "src/engine/timeline/windows.ts", purpose: "Before/after windows around starts and stops; overlapping changes.", pointers: [["eventWindows", sym("eventWindows")]] },
      {
        path: "src/engine/timeline/signals.ts",
        purpose: "Per-change comparisons → signals, code-rendered sentences, weekly view, chart rows.",
        pointers: [
          ["classifyStrength", sym("classifyStrength")],
          ["compareMetric: Fisher for yes/no, Mann–Whitney for ratings", sym("compareMetric")],
          ["signalSentence: “recorded on N of M answered days”", sym("signalSentence")],
          ["analyzeTimeline", sym("analyzeTimeline")],
        ],
      },
      { path: "src/engine/timeline/sentinel.ts", purpose: "Falls and near-falls listed by date, never tested.", pointers: [["sentinelEvents", sym("sentinelEvents")]] },
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
          ["classify: apply ConText results to each mention", sym("classify")],
          ["resolveBoolean", sym("resolveBoolean")],
          ["extractCheckIn: public entry point", sym("extractCheckIn")],
        ],
      },
      {
        path: "src/engine/nlp/context.ts",
        purpose: "ConText triggers, scopes and terminations; voice and experiencer detection.",
        pointers: [
          ["CONTEXT_RULES: the trigger table", sym("CONTEXT_RULES")],
          ["detectVoice: who is writing", sym("detectVoice")],
          ["analyzeInSentence: scope resolution for one mention", sym("analyzeInSentence")],
        ],
      },
    ],
  },
  {
    id: "checkin",
    title: "The check-in screen: her words → proposals → confirm",
    intro:
      "One user-facing view, to show where the engines meet a person. Today.tsx reads the story with extractCheckIn on the device, shows the proposals in HeardPanel (Accept or Change, plus what was deliberately not added), lets her answer the large-text quick form, and shows everything once more in an “Is this right?” dialog. Nothing is committed until she presses “Yes, save”. The other {TSX_FILES} .tsx files and {CSS_FILES} stylesheets in src/ are listed in the appendix.",
    files: [
      {
        path: "src/views/patient/Today.tsx",
        purpose: "Margaret’s daily check-in (the hero interaction); excerpt of the editor.",
        excerpts: [
          { from: "^// Today \\(/p/today\\)", to: "Nothing is saved until she confirms" },
          { at: sym("read") },
          { at: sym("openConfirm") },
          { at: sym("save") },
          { from: "^      \\{reading && \\($", to: "^      \\)\\}$" },
          { from: "^      <Modal$", to: "^      </Modal>$" },
        ],
        pointers: [
          ["read: extractCheckIn → proposals → pre-filled form", sym("read")],
          ["save: commitCheckIn only after “Yes, save”", sym("save")],
          ["the “Is this right?” dialog", "^      <Modal$"],
        ],
      },
    ],
  },
  {
    id: "brief",
    title: "Visit brief: claim checker and FHIR export",
    intro:
      "The evidence package (engine/brief/evidence.ts, in the appendix) turns every fact into one code-written sentence with a stable id. verify.ts is the gate between the language model and a person: each AI sentence must cite evidence ids that exist, every number, date and “N of M” pair must appear in the cited text on the same side and for the same symptom, medicine names must be on the list, and banned wording (causal claims, advice, urgency, “safe”) is checked for and rejected. The patterns are not complete: the live run in eval/results/ai-live.json found a “can cause” sentence that got through. fhir.ts exports the record as a FHIR R4 document Bundle; the sample in docs/samples returned {FHIR_RESULT} from the public HAPI FHIR R4 $validate endpoint.",
    files: [
      {
        path: "src/engine/brief/verify.ts",
        purpose: "Deterministic claim checker for AI-written sentences.",
        pointers: [
          ["extractNumericFacts: numbers, dates, N-of-M pairs", sym("extractNumericFacts")],
          ["verifyClaims", sym("verifyClaims")],
          ["BANNED_PATTERNS: causal, advice, urgency and “safe” wording", BANNED_DECL],
          ["verifySentence: cited ids exist, then verifyClaims", sym("verifySentence")],
        ],
      },
      {
        path: "src/engine/brief/fhir.ts",
        purpose: "FHIR R4 document Bundle: Composition, Patient, MedicationStatement, Observation, DetectedIssue.",
        pointers: [
          ["medicationStatement (RxNorm when known)", sym("medicationStatement")],
          ["toFhirBundle", sym("toFhirBundle")],
          ["validateBundle: structural checks, references resolve", sym("validateBundle")],
        ],
      },
    ],
  },
  {
    id: "ask",
    title: "Ask: answers from the records, redirects for the rest",
    intro:
      "Ask Kinwise answers bounded questions about the person’s own records. Before any retrieval, routeQuestion runs ordered scope rules over the normalised question: emergency words get the 911 line, and questions about diagnosis, treatment, changing a dose or whether a dose is right (looking up the recorded dose is answered from the list), causes, whether something is “safe”, how serious it is or what will happen get a fixed redirect to the doctor or pharmacist with an “add to visit questions” button. Only the rest reach retrieveForQuestion, which answers in code-rendered sentences, each restating the evidence it cites (the rest of qa.ts is in the appendix). When the on-device model is loaded, aiAnswer (src/ai/tasks.ts) may also write a plainer-language answer from the same retrieved items. It is labelled “AI draft” and checked sentence by sentence with verifySection. The records-based answer always stays on screen.",
    files: [
      {
        path: "src/engine/brief/qa.ts",
        purpose: "Ask: scope gate, deterministic retrieval and answers; excerpt of the scope gate.",
        excerpts: [
          { from: '^// "Ask Kinwise"', to: "^// Pure and deterministic" },
          { from: "^// Scope gate$", toEndOf: sym("routeQuestion") },
        ],
        pointers: [
          ["redirectText: the fixed redirect", sym("redirectText")],
          ["SCOPE_RULES: ordered, first match wins", sym("SCOPE_RULES")],
          ["routeQuestion", sym("routeQuestion")],
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "On-device AI layer",
    intro:
      "Optional. WebLLM runs a quantised model (Qwen2.5-3B-Instruct by default; the live run in eval/results/ai-live.json used it) in a Web Worker on WebGPU; only model files are downloaded, and prompts and outputs stay in the tab. Prompts are versioned and fence family-written text as data; a JSON-schema grammar limits evidence ids to the ones shown. The model only writes: tasks.ts runs every output through verify.ts and guard.ts, drops failing sentences, and the UI falls back to the template when too few survive.",
    files: [
      {
        path: "src/ai/tasks.ts",
        purpose: "The AI tasks: prompt + grammar + host-side verification; excerpt of the checks.",
        excerpts: [
          { from: "^// AI tasks \\(SPEC", to: "^// path\\) and throws when the model ran" },
          { at: sym("verifySection") },
          { at: sym("checkExplanation") },
          { at: sym("aiExplainFinding") },
        ],
        pointers: [
          ["verifySection: split, soften, check, dedupe, cap", sym("verifySection")],
          ["checkExplanation: only the finding + KB text as support", sym("checkExplanation")],
          ["aiExplainFinding: fewer than 2 survivors → fallback", sym("aiExplainFinding")],
        ],
      },
      {
        path: "src/ai/llm.ts",
        purpose: "WebLLM worker client: status store, single-flight queue, cancel, timeouts.",
        pointers: [
          ["loadModel", sym("loadModel")],
          ["cancel", sym("cancel")],
          ["generateJSON: queue, grammar, timeout", sym("generateJSON")],
        ],
      },
      {
        path: "src/ai/prompts.ts",
        purpose: "Versioned prompts, evidence handles, evidence selection under a token budget.",
        pointers: [
          ["RULES: the hard language rules", sym("RULES")],
          ["selectEvidence", sym("selectEvidence")],
        ],
      },
      {
        path: "src/ai/guard.ts",
        purpose: "Tolerant JSON parsing, untrusted-text fencing, quote location.",
        pointers: [
          ["parseModelJSON", sym("parseModelJSON")],
          ["wrapData: user text is data, never instructions", sym("wrapData")],
          ["locateQuote", sym("locateQuote")],
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

/**
 * "Walk through the code in 5 minutes": the same five stops as the README. One sentence each; the file:line of every
 * anchor is computed from the current source when the PDF is built.
 */
export const WALK = [
  {
    title: "Before / after, on answered days",
    text: "For each medicine start or stop, compareMetric counts a diary item only on the days it was answered before and after the change (a blank is never a “no”), tests yes/no items with fisherExact and 1–5 ratings with Mann–Whitney U, and reports a difference only when both the p-value and the size thresholds are met.",
    anchors: [
      ["src/engine/timeline/signals.ts", "compareMetric"],
      ["src/engine/timeline/stats.ts", "fisherExact"],
    ],
  },
  {
    title: "A cited review over the compiled knowledge base",
    text: "reviewWithKb builds one context from the active, matched medicines and the diary, runs one rule module per criterion family over the compiled KB (Beers 2023, ACB, fall risk, duplicates, monitoring, and in cascades.ts the index → effect → marker prescribing cascades), then de-duplicates and sorts findings that each carry their source ids.",
    anchors: [
      ["src/engine/meds/engine.ts", "reviewWithKb"],
      ["src/engine/meds/rules/cascades.ts", "cascadeFindings"],
    ],
  },
  {
    title: "ConText: negation, time and who it happened to",
    text: "analyzeInSentence applies ConText trigger scopes (Harkema et al., 2009) to one mention and decides whether it is negated, current, past or hypothetical, and whose experience it is, so “my granddaughter fell off her bike” is not proposed as her fall.",
    anchors: [["src/engine/nlp/context.ts", "analyzeInSentence"]],
  },
  {
    title: "The model drafts, code checks every sentence",
    text: "The on-device model only drafts sentences that cite evidence ids; verifySection softens questions and adds missing citations, then checks each sentence through verifySentence and verifyClaims (the cited ids exist, every number, date and “N of M” pair appears in the cited evidence, medicine names are known, none of the BANNED_PATTERNS causal, advice or urgency wording) and drops the ones that fail. The patterns are not exhaustive: in a live run the checker let {LIVE_SLIPPED} flawed outputs through (eval/results/ai-live.json), so the template brief stays the default and a person reviews every AI draft.",
    anchors: [
      ["src/ai/tasks.ts", "verifySection"],
      ["src/engine/brief/verify.ts", "verifyClaims"],
    ],
  },
  {
    title: "Ask answers from records and redirects treatment questions",
    text: "routeQuestion runs ordered scope rules before any answer: emergency words get the 911 line, diagnosis, treatment, dose-change, cause, safety, urgency and prediction questions get a fixed redirect to the doctor or pharmacist, and only the rest are answered from the records.",
    anchors: [["src/engine/brief/qa.ts", "routeQuestion"]],
  },
];

/** Product claims a judge might want to check, mapped to the line that implements them (pattern or sym()). */
const CLAIMS = [
  ["“Dizziness on 2 of 19 days before vs 9 of 14 after” — answered days, Fisher’s exact test", "src/engine/timeline/signals.ts", sym("compareMetric")],
  ["A difference is shown only if p-value AND size thresholds are met", "src/engine/timeline/rules.ts", "thresholds: \\{"],
  ["Falls are listed by date, never tested", "src/engine/timeline/sentinel.ts", sym("sentinelEvents")],
  ["“ACB score 7” for Margaret", "src/engine/meds/rules/acb.ts", sym("acbSummary")],
  ["Amlodipine → ankle swelling → furosemide cascade", "src/engine/meds/rules/cascades.ts", sym("cascadeFindings")],
  ["Beers “history of falls” rule turns on after a fall recorded in the diary", "src/engine/meds/context.ts", "if \\(!conditions\\.has\\(\"history_of_falls\"\\) && diary\\.fallDates"],
  ["“my granddaughter fell” is not her fall (experiencer)", "src/engine/nlp/context.ts", sym("analyzeInSentence")],
  ["Every AI number must appear in the cited evidence", "src/engine/brief/verify.ts", sym("extractNumericFacts")],
  ["Causal, advice and urgency wording is checked against BANNED_PATTERNS (the live run found gaps, e.g. one “can cause”: eval/results/ai-live.json)", "src/engine/brief/verify.ts", BANNED_DECL],
  ["Each AI sentence is checked on its own and dropped if it fails", "src/ai/tasks.ts", sym("verifySection")],
  ["Treatment, dose-change and diagnosis questions get a fixed redirect, not an answer", "src/engine/brief/qa.ts", sym("routeQuestion")],
  ["KB text is checked for the SPEC §3 banned words ({KB_BANNED}), the list the review engine uses, when the KB is compiled", "kb-src/build_kb.py", sym("check_text")],
  ["Family-written text is fenced as data, not instructions, before it reaches the model", "src/ai/guard.ts", sym("wrapData")],
  ["One generation at a time; cancel and timeout", "src/ai/llm.ts", sym("generateJSON")],
  ["FHIR Bundle references resolve inside the bundle", "src/engine/brief/fhir.ts", sym("validateBundle")],
  ["The record is stored only in this browser’s localStorage; it leaves only when the family prints or exports it", "src/model/store.ts", sym("saveStore")],
];

/** One line per folder for the repo map (and the fallback purpose of a file without a leading comment). */
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

/** Folder purposes outside src/, for the appendix. */
const OTHER_FOLDER_PURPOSE = {
  "": "Repository root: package scripts and dependencies, TypeScript and Vite config, HTML entry points",
  ".github/workflows": "GitHub Actions: build the app and publish it to GitHub Pages",
  eval: "NLP corpora (dev + held-out), medication cases and the evaluation runners",
  "eval/results": "Evaluation results (JSON) and notes, written by the runners",
  "kb-src": "KB compiler (build_kb.py), its build report and the CLINICAL-SOURCES template",
  "kb-src/build": "Helper scripts and intermediate tables from the KB research runs (label, cascade, ACB and fall-risk extraction)",
  "kb-src/kb": "Hand-curated KB inputs for build_kb.py (taxonomy, drugs, combinations, rules) and RxNorm / DailyMed lookup caches",
  "kb-src/research": "Research notes and machine-readable extracts of the sources (Beers 2023, ACB, cascades, FRIDs, ConText rules)",
  scripts: "E2E and accessibility runners (Playwright + system Chrome), LLM smoke test, model download",
  "scripts/submission": "Generators for the submission PDFs and the demo video",
};

/** Root files have no folder purpose of their own; these say what each one is. */
const ROOT_FILE_PURPOSE = {
  ".gitattributes": "Marks binary file types (PDF, PNG, fonts, video) for git",
  ".gitignore": "Untracked paths: node_modules, dist, test results, tmp/, downloaded model weights",
  "package.json": "npm scripts (dev, test, typecheck, build, evals, e2e, a11y) and dependencies",
  "package-lock.json": "Exact dependency versions for npm ci",
  "tsconfig.json": "TypeScript compiler options (strict)",
  "vite.config.ts": "Vite build and Vitest configuration",
};

/** Folders listed as a single appendix line (cached copies of external documents, not code). */
const FOLDED_DIRS = {
  "kb-src/research/regsrc": "Cached copies of the primary regulatory and standards documents read for kb-src/research/regulatory.md (not listed one by one)",
};

/** What `git ls-files` is run over for the appendix (plus the files at the repository root). */
const INDEX_ROOTS = ["src", "eval", "kb-src", "scripts", ".github"];

const OTHER_DIRS = [
  ["eval/", "NLP corpora (dev + held-out), medication cases, eval runners, results/*.json"],
  ["kb-src/", "KB build script, research notes, source register"],
  ["scripts/", "E2E and accessibility runners (Playwright + system Chrome), LLM smoke test, model download, these PDFs"],
  ["docs/", "SPEC.md, SPEC-UI.md, CLINICAL-SOURCES.md, FHIR sample bundle + HAPI validation"],
  ["archive/", "Earlier prototypes, kept unchanged"],
];

// ---------------------------------------------------------------------------------------------------------------

function countLines(text) {
  if (!text) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function splitLines(text) {
  const raw = text.split("\n");
  if (text.endsWith("\n")) raw.pop();
  return raw;
}

/**
 * Counts for the cover and the repository map. Built from the appendix's own file list (sourceIndex), so the cover's
 * "files in src/" always equals the number of src/ rows in the appendix.
 */
function srcStats(index) {
  const files = index.files
    .filter((f) => f.rel.startsWith("src/"))
    .map((f) => ({ rel: f.rel, dir: f.dir, ext: f.rel.slice(f.rel.lastIndexOf(".") + 1), lines: f.lines ?? 0, test: /\.test\.tsx?$/.test(f.rel) }));
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
    tsxFiles: files.filter((f) => f.ext === "tsx").length,
    cssFiles: files.filter((f) => f.ext === "css").length,
    css: sum((f) => f.ext === "css"),
    json: sum((f) => f.ext === "json"),
    byDir,
  };
}

/**
 * Line number (1-based) of the single line matching `pattern`. Throws if none matches, or if a declaration
 * pattern (sym()) matches more than one line, so a renamed, moved or duplicated symbol fails the build.
 */
function resolvePointer(lines, file, pattern, from = 0) {
  const re = new RegExp(pattern);
  const hits = [];
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) hits.push(i);
  if (!hits.length) {
    throw new Error(`code tour: /${pattern}/ not found in ${file}${from ? ` after line ${from}` : ""}. The code moved or was renamed; update SECTIONS, WALK or CLAIMS in scripts/submission/codetour.mjs.`);
  }
  if (hits.length > 1 && pattern.startsWith("^\\s*(?:export") && from === 0) {
    throw new Error(`code tour: /${pattern}/ is ambiguous in ${file} (lines ${hits.map((i) => i + 1).join(", ")}); make the pointer more specific.`);
  }
  return hits[0] + 1;
}

// --- Excerpts ----------------------------------------------------------------------------------------------------

const isPython = (path) => path.endsWith(".py");

/** Extend a start line upwards over the comment (or decorator) block directly above it. */
function withLeadingComment(lines, start, python) {
  const re = python ? /^\s*(?:#|@)/ : /^\s*(?:\/\/|\/\*|\*|\*\/)/;
  let s = start;
  while (s > 1 && re.test(lines[s - 2])) s--;
  return s;
}

/**
 * Last line of the TS/JS declaration starting at `startLine`: brackets are counted with the tour's own tokenizer (so
 * strings, comments, template literals and regexes are skipped), and a bracket that closes to depth 0 ends the
 * declaration unless the code continues (a return type before the body, an arrow, a method chain, …).
 */
function tsBlockEnd(text, startLine, file) {
  const toks = tokenize(text.replace(/\r\n/g, "\n"));
  const OPEN = new Set(["{", "(", "["]);
  const CLOSE = new Set(["}", ")", "]"]);
  const CONTINUES = new Set(["{", "(", "[", "=>", ":", "=", "|", "&", ".", "?.", "?", "extends", "as", "satisfies"]);
  let line = 1;
  let depth = 0;
  let opened = false;
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    const at = line;
    line += (tk.s.match(/\n/g) ?? []).length;
    if (at < startLine || tk.t) continue;
    if (OPEN.has(tk.s)) {
      depth++;
      opened = true;
    } else if (CLOSE.has(tk.s) && opened) {
      depth--;
      if (depth === 0) {
        const next = toks.slice(i + 1).find((x) => x.t !== "com" && !/^\s+$/.test(x.s));
        if (!next || !CONTINUES.has(next.s)) return at;
      }
    }
  }
  throw new Error(`code tour: could not find the end of the declaration at ${file}:${startLine}`);
}

/** Last line of the Python def / class starting at `startLine` (indentation-based). */
function pyBlockEnd(lines, startLine) {
  const indent = (l) => /^\s*/.exec(l)[0].length;
  const base = indent(lines[startLine - 1]);
  let i = startLine - 1;
  while (i < lines.length && !/:\s*(?:#.*)?$/.test(lines[i])) i++; // end of a multi-line signature
  let last = i + 1;
  for (let k = i + 1; k < lines.length; k++) {
    if (!lines[k].trim()) continue;
    if (indent(lines[k]) <= base) break;
    last = k + 1;
  }
  return last;
}

function blockEnd(path, text, lines, startLine) {
  return isPython(path) ? pyBlockEnd(lines, startLine) : tsBlockEnd(text, startLine, path);
}

/** Resolve a file's excerpt specs to sorted, merged [start, end] line ranges (1-based, inclusive). */
function excerptRanges(path, text, lines, specs) {
  const ranges = specs.map((spec) => {
    if (spec.at) {
      const decl = resolvePointer(lines, path, spec.at);
      return [withLeadingComment(lines, decl, isPython(path)), blockEnd(path, text, lines, decl)];
    }
    const start = resolvePointer(lines, path, spec.from);
    if (spec.toEndOf) return [start, blockEnd(path, text, lines, resolvePointer(lines, path, spec.toEndOf))];
    return [start, resolvePointer(lines, path, spec.to, start - 1)];
  });
  for (const [s, e] of ranges) if (e < s) throw new Error(`code tour: empty excerpt ${s}–${e} in ${path}`);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    // Ranges closer than three lines are joined (the blank lines between two functions are not worth a gap marker).
    if (last && r[0] <= last[1] + 3) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

// --- Python highlighting (highlight.mjs covers TS/TSX only) ------------------------------------------------------

const PY_KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "),
);
const PY_TOKEN =
  /(#[^\n]*)|((?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*)|(\s+|[^\sA-Za-z_\d#"']+|.)/g;

/** Comments, strings (incl. triple-quoted), numbers, keywords and Capitalised names; one HTML string per line. */
function highlightPython(src) {
  const lines = [""];
  const emit = (cls, s) =>
    s.split("\n").forEach((p, k) => {
      if (k > 0) lines.push("");
      if (p) lines[lines.length - 1] += cls ? `<span class="${cls}">${h(p)}</span>` : h(p);
    });
  for (const m of src.replace(/\r\n/g, "\n").matchAll(PY_TOKEN)) {
    if (m[1]) emit("com", m[1]);
    else if (m[2]) emit("str", m[2]);
    else if (m[3]) emit("num", m[3]);
    else if (m[4]) emit(PY_KEYWORDS.has(m[4]) ? "kw" : /^[A-Z][a-z]/.test(m[4]) ? "ty" : null, m[4]);
    else emit(null, m[0]);
  }
  if (src.endsWith("\n")) lines.pop();
  return lines;
}

function highlightFor(path, text) {
  if (isPython(path)) return highlightPython(text);
  if (/\.(?:[cm]?[jt]sx?)$/.test(path)) return highlightLines(text);
  return splitLines(text).map((l) => h(l));
}

// --- Appendix: every source file ----------------------------------------------------------------------------------

function gitLsFiles(args) {
  return execFileSync("git", ["ls-files", "-z", ...args], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

/** First sentence of a comment paragraph, cut to `max` characters on a word boundary. */
function oneLine(text, max = 112) {
  let t = text.replace(/\s+/g, " ").trim();
  // "e.g." and "i.e." do not end a sentence.
  const stop = /^((?:[^.!?]|\b(?:e\.g|i\.e)\.)+?[.!?])(?:\s|$)/.exec(t);
  if (stop && stop[1].length >= 24) t = stop[1];
  // A comment that introduces a list ("Drives the real app for the submission PDFs:") reads as a purpose without it.
  t = t.replace(/\s*:$/, "");
  if (t.length > max) t = `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  return t;
}

/**
 * The file's own one-line purpose: its leading comment (TS/JS/CSS/YAML/Python, after imports and directives), a
 * Python module docstring, an HTML title, or a Markdown heading. null when the file has none (JSON, plain text).
 */
function leadingComment(rel, text) {
  const lines = splitLines(text);
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "txt") return null;
  if (ext === "json") {
    // A top-level "title" or "description" string is the file's own description; other JSON has none.
    const m = /^\{\s*(?:"[^"]*":\s*(?:"[^"]*"|[\d.]+),\s*){0,3}"(?:title|description)":\s*"((?:[^"\\]|\\.)+)"/.exec(text);
    return m ? oneLine(m[1]) : null;
  }
  if (ext === "md") {
    // Skip YAML front matter; prefer the first heading (or a "Title:" line of a saved web page).
    let body = lines;
    if (lines[0]?.trim() === "---") body = lines.slice(lines.findIndex((l, i) => i > 0 && l.trim() === "---") + 1);
    const first = body.find((l) => /^#+\s|^Title:\s/.test(l)) ?? body.find((l) => l.trim());
    return first ? oneLine(first.replace(/^#+\s*|^Title:\s*/, "")) : null;
  }
  if (ext === "html") {
    const t = /<title>([^<]+)<\/title>/i.exec(text);
    return t ? oneLine(t[1]) : null;
  }
  const hash = ext === "py" || ext === "yml" || ext === "yaml" || rel.endsWith(".gitignore") || rel.endsWith(".gitattributes");
  const para = [];
  let inBlock = false;
  let inImport = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (inBlock) {
      const body = l.replace(/\*\/.*$/, "").replace(/^\*+\s?/, "").trim();
      if (para.length && (!body || /^\*\s?[-•]\s|^\*\s{2,}/.test(l))) break;
      if (body) para.push(body);
      if (l.includes("*/")) break;
      continue;
    }
    if (inImport) {
      if (/;\s*$|\bfrom\s+["']/.test(l)) inImport = false;
      continue;
    }
    if (!l) {
      if (para.length) break;
      continue;
    }
    if (l.startsWith("#!") || /^\/\/\/\s*<reference|^\/\/\s*(?:@vitest-environment|eslint-|@ts-)|^["']use strict["']/.test(l)) continue;
    if (hash && l.startsWith("#")) {
      const body = l.replace(/^#+\s?/, "").trim();
      if (para.length && (!body || /^#+\s{2,}|^#+\s?[-*•]\s/.test(l))) break;
      if (body && !/^-+$/.test(body)) para.push(body);
      continue;
    }
    if (ext === "py" && /^(?:[rRuU])?("""|''')/.test(l)) {
      const body = l.replace(/^(?:[rRuU])?("""|''')/, "").replace(/("""|''').*$/, "").trim();
      return body ? oneLine(body) : null;
    }
    if (!hash && l.startsWith("//")) {
      const body = l.replace(/^\/\/+\s?/, "").trim();
      if (para.length && (!body || /^\/\/+\s{2,}|^\/\/+\s?[-*•]\s/.test(l))) break;
      if (body && !/^[-=─]+$/.test(body)) para.push(body);
      continue;
    }
    if (!hash && l.startsWith("/*")) {
      const body = l.replace(/^\/\*+\s?/, "").replace(/\*\/.*$/, "").trim();
      if (body) para.push(body);
      if (!l.includes("*/")) inBlock = true;
      else if (para.length) break;
      continue;
    }
    if (para.length) break;
    // Imports may come before the file's first comment; anything else ends the search.
    if (!hash && /^(?:import|export)\b[^;]*\bfrom\b|^import\s+["']/.test(l)) continue;
    if (!hash && /^import\b/.test(l)) {
      inImport = !/;\s*$/.test(l);
      continue;
    }
    if (ext === "py" && /^(?:import|from)\s/.test(l)) continue;
    break;
  }
  return para.length ? oneLine(para.join(" ")) : null;
}

/**
 * The appendix's file list: every file under INDEX_ROOTS plus the root files that git tracks, and the ones not yet
 * committed (untracked but not ignored). Read-only git. Exported for the tests, which check the same lists.
 */
export function indexedPaths() {
  const atRoot = (p) => !p.includes("/");
  const tracked = new Set([...gitLsFiles(["--", ...INDEX_ROOTS]), ...gitLsFiles([]).filter(atRoot)]);
  const others = ["--others", "--exclude-standard"];
  const untracked = new Set([...gitLsFiles([...others, "--", ...INDEX_ROOTS]), ...gitLsFiles(others).filter(atRoot)]);
  // A tracked file deleted in the working tree (another change in progress) is left out, with a warning.
  const deleted = [...tracked].filter((p) => !existsSync(join(ROOT, p)));
  for (const p of deleted) tracked.delete(p);
  if (deleted.length) console.warn(`code tour: ${deleted.length} tracked file(s) missing from the working tree, not indexed: ${deleted.join(", ")}`);
  return { tracked, untracked };
}

/** Every source file of indexedPaths(), with line count, one-line purpose and whether it is committed yet. */
function sourceIndex() {
  const { tracked: trackedSet, untracked } = indexedPaths();
  const tracked = [...trackedSet, ...untracked];
  const files = [];
  const folded = new Map();
  for (const rel of [...new Set(tracked)].sort()) {
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    const fold = Object.keys(FOLDED_DIRS).find((d) => rel.startsWith(`${d}/`));
    if (fold) {
      folded.set(fold, (folded.get(fold) ?? 0) + 1);
      continue;
    }
    const buf = readFileSync(join(ROOT, rel));
    const binary = buf.includes(0);
    const text = binary ? "" : buf.toString("utf8");
    const own = binary ? null : leadingComment(rel, text);
    const name = rel.slice(dir ? dir.length + 1 : 0);
    const sibling = /\.test\.tsx?$/.test(name) ? tracked.find((p) => p === `${dir}/${name.replace(/\.test\.(tsx?)$/, ".$1")}` || p === `${dir}/${name.replace(/\.test\.tsx?$/, ".tsx")}`) : null;
    // Root config files: what the file is for beats its first comment (vite.config.ts opens on a base-path detail).
    let purpose = ROOT_FILE_PURPOSE[rel] ?? own;
    let fallback = false;
    if (!purpose && sibling) purpose = `Vitest tests for ${sibling.slice(dir.length + 1)}`;
    if (!purpose) {
      purpose = FOLDER_PURPOSE[dir] ?? OTHER_FOLDER_PURPOSE[dir] ?? "";
      fallback = true;
    }
    files.push({ rel, dir, name, lines: binary ? null : countLines(text), purpose: oneLine(purpose), fallback, uncommitted: untracked.has(rel) });
  }
  const dirs = [...new Set([...files.map((f) => f.dir), ...folded.keys()])].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  return { files, dirs, folded, lines: files.reduce((n, f) => n + (f.lines ?? 0), 0), uncommitted: files.filter((f) => f.uncommitted).length };
}

function appendixRowsHtml(index) {
  const out = [];
  for (const d of index.dirs) {
    if (index.folded.has(d)) {
      const n = index.folded.get(d);
      out.push(
        `<div class="ix-row ix-dir ix-fold"><span class="ix-dname"><a href="${h(`${CODE_URL}/${d}`)}">${h(d)}/</a><span class="ix-cnt">${n} files</span></span><span class="ix-p">${h(FOLDED_DIRS[d])}</span></div>`,
      );
      continue;
    }
    const fs = index.files.filter((f) => f.dir === d);
    const lines = fs.reduce((n, f) => n + (f.lines ?? 0), 0);
    const purpose = d === "" ? OTHER_FOLDER_PURPOSE[""] : FOLDER_PURPOSE[d] ?? OTHER_FOLDER_PURPOSE[d] ?? "";
    out.push(
      `<div class="ix-row ix-dir"><span class="ix-dname">${h(d ? `${d}/` : "(repository root)")}<span class="ix-cnt">${fs.length} ${fs.length === 1 ? "file" : "files"} · ${lines.toLocaleString("en-US")} lines</span></span><span class="ix-p">${h(oneLine(purpose, 130))}</span></div>`,
    );
    for (const f of fs) {
      // A file that is not committed yet has no GitHub page to link to; the mark leads the (wide) purpose column so a
      // long file name can never clip it.
      const name = f.uncommitted ? h(f.name) : `<a href="${h(blobUrl(f.rel))}">${h(f.name)}</a>`;
      const mark = f.uncommitted ? `<span class="ix-new">not yet committed</span>` : "";
      out.push(
        `<div class="ix-row ix-file"><span class="ix-name">${name}</span><span class="ix-n">${f.lines == null ? "binary" : f.lines.toLocaleString("en-US")}</span><span class="ix-p${f.fallback ? " fb" : ""}">${mark}${h(f.purpose)}</span></div>`,
      );
    }
  }
  return out.join("");
}

// --- Do the printed line numbers match GitHub? --------------------------------------------------------------------

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
}

/**
 * Compares the working tree with the branch the GitHub links point to (lib.REPO_BRANCH, as known to this clone),
 * read-only. `git diff --name-only <commit> -- <paths>` lists the tracked files whose working-tree content differs
 * from that commit; files not committed at all differ by definition. `printed` are the files the tour prints (every
 * walkthrough, pointer and claim anchor is inside one of them, which codeTourHtml enforces).
 */
export function branchSync(printed, index) {
  const branch = lib.REPO_BRANCH;
  const head = git(["rev-parse", "--short", "HEAD"]).trim();
  let sha = null;
  for (const ref of [branch, `origin/${branch}`]) {
    try {
      sha = git(["rev-parse", "--short", "--verify", `${ref}^{commit}`]).trim();
      break;
    } catch {
      // not known under this name; try the next
    }
  }
  const uncommitted = new Set(index.files.filter((f) => f.uncommitted).map((f) => f.rel));
  const changed = sha ? new Set(git(["diff", "--name-only", "--no-renames", sha, "--", ...printed]).split("\n").filter(Boolean)) : new Set(printed);
  const differ = printed.filter((p) => changed.has(p) || uncommitted.has(p));
  const dirty = git(["status", "--porcelain", "--", ...printed]).trim() !== "";
  return { branch, sha, head, dirty, differ, total: printed.length, clean: Boolean(sha) && differ.length === 0 };
}

/** One sentence for the cover and the walkthrough: do the line numbers match the files on GitHub? */
function syncSentence(sync) {
  if (sync.clean) return `Line numbers match the files on ${sync.branch} at commit ${sync.sha}.`;
  const base = sync.dirty ? `Built from uncommitted changes (HEAD ${sync.head})` : `Built from HEAD ${sync.head}`;
  const vs = sync.sha ? `${sync.branch} (${sync.sha})` : `${sync.branch} (not found in this clone)`;
  return `${base}: ${sync.differ.length} of the ${sync.total} printed files differ from ${vs}, so the GitHub line links match only once this tree is pushed to ${sync.branch}. The line numbers printed in this PDF are those of the tree it was built from.`;
}

// --- Facts quoted in the text, read from the files they describe ------------------------------------------------

/** The SPEC §3 words build_kb.py rejects in KB text, from its BANNED table ("cause/caused (causal wording)" → "cause/caused"). */
function kbBannedWords() {
  const src = readFileSync(join(ROOT, "kb-src/build_kb.py"), "utf8");
  const block = /^BANNED = \[[\s\S]*?^\]\]/m.exec(src);
  const words = block ? [...block[0].matchAll(/,\s*"([^"]+)"\),?\s*$/gm)].map((m) => m[1].replace(/\s*\(.*\)$/, "")) : [];
  if (!words.length) throw new Error("code tour: the BANNED table was not found in kb-src/build_kb.py; update kbBannedWords()");
  return words.join(", ");
}

/** HAPI $validate result of the sample bundle ("0 errors (25 terminology warnings, …)"), from facts or the file itself. */
function fhirResult(facts) {
  let f = facts.fhir;
  if (!f) {
    const v = JSON.parse(readFileSync(join(ROOT, "docs/samples/kinwise-fhir-validation.json"), "utf8"));
    const sev = (x) => v.issue.filter((i) => i.severity === x).length;
    f = { errors: sev("error") + sev("fatal"), warnings: sev("warning"), info: sev("information") };
  }
  const n = (k, one) => `${k} ${one}${k === 1 ? "" : "s"}`;
  return `${n(f.errors, "error")} (${n(f.warnings, "terminology warning")}, ${n(f.info, "information message")})`;
}

// ---------------------------------------------------------------------------------------------------------------

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

const fileId = (path) => `f-${path.replace(/[^a-z0-9]+/gi, "-")}`;

export function codeTourHtml({ facts }) {
  const index = sourceIndex();
  const stats = srcStats(index);
  const t = facts.tests;
  const vt = t.vitest;

  // Resolve files, excerpts and pointers.
  let tourLines = 0;
  const vars = {
    "{TEST_FILES}": String(stats.testFiles),
    "{KB_SOURCES}": String(facts.kb.sources),
    "{TSX_FILES}": String(stats.tsxFiles - 1),
    "{CSS_FILES}": String(stats.cssFiles),
    "{KB_BANNED}": kbBannedWords(),
    "{FHIR_RESULT}": fhirResult(facts),
    "{LIVE_SLIPPED}": String(facts.ai.liveSlippedText ?? facts.ai.liveSlipped),
  };
  const fill = (text) => {
    const out = Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(k, v), text);
    if (/\{[A-Z_]+\}/.test(out)) throw new Error(`code tour: unfilled placeholder in "${out.slice(0, 80)}…"`);
    return out;
  };
  /** path → { lines (raw text), printed (Set of printed line numbers), id } for every printed file. */
  const printed = new Map();
  const sections = SECTIONS.map((s) => ({
    ...s,
    intro: fill(s.intro),
    files: s.files.map((f) => {
      const text = readFileSync(join(ROOT, f.path), "utf8");
      const raw = splitLines(text);
      const ranges = f.excerpts ? excerptRanges(f.path, text, raw, f.excerpts) : [[1, raw.length]];
      const shown = new Set();
      for (const [a, b] of ranges) for (let n = a; n <= b; n++) shown.add(n);
      const pointers = f.pointers.map(([label, pat]) => {
        const line = resolvePointer(raw, f.path, pat);
        if (!shown.has(line)) throw new Error(`code tour: pointer "${label}" (${f.path}:${line}) is outside the printed excerpt`);
        return { label, line };
      });
      tourLines += shown.size;
      const id = fileId(f.path);
      printed.set(f.path, { raw, shown, id });
      return { ...f, id, lineCount: raw.length, ranges, excerpt: Boolean(f.excerpts), shownCount: shown.size, html: highlightFor(f.path, text), pointers };
    }),
  }));
  const tourFiles = sections.reduce((n, s) => n + s.files.length, 0);
  const excerptFiles = sections.reduce((n, s) => n + s.files.filter((f) => f.excerpt).length, 0);

  /** A line anchor outside the listings: file:line, the internal link target, and whether that line is printed. */
  const anchor = (path, pattern) => {
    const p = printed.get(path);
    const raw = p ? p.raw : splitLines(readFileSync(join(ROOT, path), "utf8"));
    const line = resolvePointer(raw, path, pattern);
    if (p && !p.shown.has(line)) throw new Error(`code tour: ${path}:${line} is referenced but not inside the printed excerpt`);
    return { path, line, target: p ? `${p.id}-L${line}` : null };
  };
  const claims = CLAIMS.map(([claim, path, pat]) => ({ claim: fill(claim), ...anchor(path, pat) }));
  for (const c of claims) if (!c.target) throw new Error(`code tour: claim "${c.claim}" points to ${c.path}, which the tour does not print`);
  const walk = WALK.map((w) => ({ ...w, text: fill(w.text), anchors: w.anchors.map(([path, name]) => ({ name, ...anchor(path, sym(name)) })) }));
  for (const w of walk) for (const a of w.anchors) if (!a.target) throw new Error(`code tour: walkthrough stop ${a.path} is not printed in the tour`);

  // Every anchor above is inside a printed file, so comparing the printed files with the branch covers them all.
  const sync = branchSync([...printed.keys()], index);
  const syncText = syncSentence(sync);
  if (!sync.clean) console.warn(`code tour: ${syncText} Differing: ${sync.differ.join(", ")}`);
  const syncNote = sync.clean ? "" : `<p class="sync-note"><b>Note on GitHub links.</b> ${h(syncText)}</p>`;

  // Only lines something links to get an id (keeps the PDF's named destinations small).
  const linked = new Set([
    ...claims.map((c) => c.target),
    ...walk.flatMap((w) => w.anchors.map((a) => a.target)),
    ...sections.flatMap((s) => s.files.flatMap((f) => f.pointers.map((p) => `${f.id}-L${p.line}`))),
  ]);

  const fileLinesLabel = (f) => (f.excerpt ? `excerpt, ${f.shownCount} of ${f.lineCount} lines` : `${f.lineCount} lines`);
  const toc = sections
    .map(
      (s, si) => `<div class="toc-sec"><a href="#s-${s.id}"><span class="toc-n">${si + 1}</span>${h(s.title)}</a><span class="toc-p" data-page-of="s-${s.id}"></span></div>
      ${s.files
        .map(
          (f) => `<div class="toc-file"><a href="#${f.id}"><code>${h(f.path)}</code></a><span class="toc-lines">${fileLinesLabel(f)}</span><span class="toc-p" data-page-of="${f.id}"></span></div>`,
        )
        .join("")}`,
    )
    .join("");

  const claimRows = claims
    .map(
      (c) => `<tr><td>${h(c.claim)}</td><td><a href="#${c.target}"><code>${h(c.path.replace(/^src\//, ""))}:${c.line}</code></a></td><td class="r"><span data-page-of="${c.target}"></span></td></tr>`,
    )
    .join("");

  const walkRows = walk
    .map(
      (w, i) => `<div class="stop"><div class="stop-n">${i + 1}</div><div class="stop-b"><h2>${h(w.title)}</h2><div class="stop-a">${w.anchors
        .map(
          (a) =>
            `<span class="anc"><a href="#${a.target}"><code>${h(a.path)}:${a.line}</code></a> <span class="anc-sym">${h(a.name)}</span> <span class="anc-pg">p. <span data-page-of="${a.target}"></span></span> <a class="gh" href="${h(blobUrl(a.path, a.line))}">GitHub ↗</a></span>`,
        )
        .join("")}</div><p>${h(w.text)}</p></div></div>`,
    )
    .join("");

  const testRows = [
    ["npx vitest run", vt ? `${vt.total.toLocaleString("en-US")} tests in ${vt.files ?? stats.testFiles} files (src/ and eval/): ${vt.passed.toLocaleString("en-US")} passed, ${vt.failed} failed, ${vt.skipped} skipped` : "unit and integration tests"],
    ["npm run eval:nlp", `NLP benchmark. Held-out (${facts.nlp.heldoutCases} stories, never used for tuning): micro F1 ${facts.nlp.heldoutF1}, precision ${facts.nlp.heldoutP}, recall ${facts.nlp.heldoutR}. Dev (${facts.nlp.devCases} stories): F1 ${facts.nlp.devF1}.`],
    ["npm run eval:meds", `Medication-review cases: ${facts.meds.cases} cases, ${facts.meds.expectations} expectations pass (KB ${facts.meds.kbVersion}).`],
    ["npm run test:e2e", t.e2ePassed != null ? `${t.e2ePassed} of ${t.e2eChecks} browser checks passed in the last run (system Chrome, own Vite server).` : `${t.e2eChecks} browser checks (system Chrome, own Vite server).`],
    ["npm run test:a11y", t.a11yScans != null ? `${t.a11yScans} axe scans (WCAG 2.2 AA rule tags, light and dark): ${t.a11yViolations} violations reported in the last run (the gate fails on serious or critical).` : "axe scans of every route, light and dark."],
    ["npm run typecheck / npm run build", "TypeScript strict, Vite production build."],
    ["python3 -I kb-src/build_kb.py --check", "Rebuilds the knowledge base in memory and validates it (references, wording, placeholders) without writing."],
    ["node scripts/llm-smoke.mjs", "On-device LLM smoke test on WebGPU (needs local model files); results in eval/results/llm-smoke.json."],
  ]
    .map(([cmd, what]) => `<tr><td><code>${h(cmd)}</code></td><td>${h(what)}</td></tr>`)
    .join("");

  // Hidden source of all listing blocks; the in-page script paginates them.
  const lineHtml = (f, n) => {
    const id = `${f.id}-L${n}`;
    return `<div class="ln"${linked.has(id) ? ` id="${id}"` : ""}><span class="no">${n}</span><span class="code">${f.html[n - 1] || " "}</span></div>`;
  };
  const gapHtml = (a, b) => `<div class="ln gap"><span class="no"></span><span class="code">⋯ lines ${a}–${b} not printed (${b - a + 1} lines; full file on GitHub)</span></div>`;
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
          const ranges = f.excerpt ? ` (lines ${f.ranges.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(", ")})` : "";
          const meta = `${fileLinesLabel(f)}${ranges} · ${h(f.purpose)} · <a class="gh" href="${h(blobUrl(f.path))}">GitHub ↗</a>`;
          const fileHead = `<div class="file-head" id="${f.id}"><h2><code>${h(f.path)}</code></h2><div class="file-meta">${meta}</div>${pointers}</div>`;
          let lines = "";
          let next = 1;
          for (const [a, b] of f.ranges) {
            if (a > next) lines += gapHtml(next, a - 1);
            for (let n = a; n <= b; n++) lines += lineHtml(f, n);
            next = b + 1;
          }
          if (next <= f.lineCount) lines += gapHtml(next, f.lineCount);
          return `<section class="block" data-file="${h(f.path)}" data-file-id="${f.id}" data-section="${h(s.title)}"><div class="intro">${sectionIntro}${fileHead}</div>${lines}</section>`;
        })
        .join(""),
    )
    .join("");

  const roots = `${INDEX_ROOTS.map((r) => `${r}/`).join(", ")} and the repository root`;
  const foldedNote = [...index.folded].map(([d, n]) => `${d}/ (${n} cached documents) is listed as one line`).join("; ");
  const appendixIntro = `<div class="ix-intro" id="appendix"><div class="sec-k">Appendix</div><h1>Every source file</h1><p>Generated from <code>git ls-files</code> over ${h(roots)} when this PDF was built: <b>${index.files.length} files, ${index.lines.toLocaleString("en-US")} lines</b>${index.uncommitted ? `, of which ${index.uncommitted} are not yet committed (marked; no GitHub link until they are pushed)` : ""}. Each name links to the file on GitHub (branch ${h(lib.REPO_BRANCH)}). The purpose is the file’s own first comment, docstring, title or heading; where a file has none (JSON data, for example) the folder’s purpose is shown <span class="fb">in grey italics</span>. ${h(foldedNote)}. Not listed: <code>docs/</code> (specs and research write-ups), <code>public/</code> (fonts, icons), <code>submission/</code> and <code>archive/</code> (earlier prototypes, kept unchanged).</p></div>`;

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
.page.code-page, .page.ix-page { padding: 0.48in 0.5in 0.46in; }
.page.code-page .rh, .page.code-page .rf, .page.ix-page .rh, .page.ix-page .rf { left: 0.5in; right: 0.5in; }
.body { flex: 1; min-height: 0; overflow: hidden; }
a.gh { color: var(--info); }

/* cover */
.cover { justify-content: space-between; background: var(--bg); }
.cover .mark { width: 54px; height: 54px; border-radius: 14px; background: var(--primary); display: grid; place-items: center; }
.cover h1 { font-family: var(--font-serif); font-weight: 600; font-size: 40pt; line-height: 1.05; margin: 22px 0 8px; letter-spacing: -0.01em; }
.cover .lede { font-family: var(--font-serif); font-size: 14pt; line-height: 1.35; max-width: 6in; color: var(--ink); }
.cover .what { font-size: 10.4pt; margin-top: 12px; max-width: 6.2in; font-weight: 500; color: var(--primary); }
.kv { display: grid; grid-template-columns: 1.45in 1fr; gap: 6px 14px; font-size: 10pt; margin-top: 22px; }
.kv dt { color: var(--ink-muted); }
.kv dd { margin: 0; }
.kv a { color: var(--primary); text-decoration: underline; text-underline-offset: 2px; }
.cover .note { font-size: 9pt; color: var(--ink-muted); max-width: 6.2in; }
.figs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 22px; }
.fig { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.fig .n { font-family: var(--font-serif); font-size: 20pt; font-weight: 600; color: var(--primary); line-height: 1.1; }
.fig .l { font-size: 8.4pt; color: var(--ink-muted); }

h1.pt { font-family: var(--font-serif); font-size: 22pt; font-weight: 600; margin: 0 0 10px; }
h3 { font-size: 8.6pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin: 14px 0 6px; }
p { margin: 0 0 8px; }

/* 5-minute walkthrough */
.stop { display: grid; grid-template-columns: 34px 1fr; gap: 0 10px; border-top: 1px solid var(--line); padding: 7px 0 6px; }
.stop-n { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: #fff; font-weight: 700; font-size: 12pt; display: grid; place-items: center; }
.stop h2 { font-family: var(--font-serif); font-size: 12.5pt; font-weight: 600; margin: 1px 0 3px; }
.stop-a { display: flex; flex-direction: column; gap: 2px; margin-bottom: 5px; font-size: 8.6pt; }
.stop-a code { font-weight: 600; color: var(--primary); font-size: 8.8pt; }
.anc-sym { font-family: var(--font-mono); font-size: 8pt; background: var(--primary-soft); color: var(--primary-soft-ink); border-radius: 4px; padding: 0 5px; }
.anc-pg { color: var(--ink-muted); margin-left: 4px; }
.stop p { font-size: 9pt; line-height: 1.38; margin: 0; }
.walk-run { margin-top: 8px; background: var(--surface-tint); border-radius: 8px; padding: 9px 12px; font-size: 8.8pt; }
.walk-run p { margin: 0 0 3px; }

/* toc */
.toc-sec { display: flex; align-items: baseline; margin-top: 5px; font-weight: 600; font-size: 9.8pt; line-height: 1.32; border-bottom: 1px solid var(--line); padding-bottom: 1px; }
.toc-sec a { flex: 1; }
.toc-n { display: inline-block; width: 22px; color: var(--accent); }
.toc-file { display: flex; align-items: baseline; padding: 0 0 0 22px; font-size: 8.7pt; line-height: 1.34; }
.toc-file a { flex: 1; }
.toc-lines { color: var(--ink-muted); font-size: 8pt; margin-right: 16px; }
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
.claims td { padding: 2.5px 6px; font-size: 8.3pt; }

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
.ln .no { color: #9aa29d; text-align: right; padding-right: 7px; user-select: none; white-space: pre; }
.ln .no .wrap { color: var(--accent); }
.ln .code { white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere; color: #1f2a26; border-left: 1px solid var(--line); padding-left: 7px; }
.ln.gap .code { color: var(--ink-muted); font-family: var(--font-sans); font-style: italic; background: var(--surface-sunken); padding-top: 1px; padding-bottom: 1px; margin: 2px 0; border-radius: 0 4px 4px 0; }
.com { color: #5f7a6c; font-style: italic; }
.str { color: #a9573a; }
.re { color: #8a4b9a; }
.kw { color: #25584a; font-weight: 600; }
.num { color: #2f5f8a; }
.ty { color: #7d5210; }
#source, #ix-source { display: none; }

/* appendix: every source file */
.ix-intro { background: var(--surface-tint); border-radius: 8px; padding: 9px 12px 8px; margin-bottom: 8px; }
.ix-intro h1 { font-family: var(--font-serif); font-size: 17pt; font-weight: 600; margin: 1px 0 4px; }
.ix-intro p { font-size: 8.4pt; margin: 0; line-height: 1.4; }
/* Whole-pixel padding and borders: fractional ones round differently on screen (where rows are poured) and in print. */
.ix-row { display: grid; grid-template-columns: 2.25in 0.62in 1fr; gap: 0 8px; font-size: 6.9pt; line-height: 13px; height: 14px; padding: 0; border-bottom: 1px solid var(--line); }
.ix-row > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-dir { grid-template-columns: calc(2.87in + 8px) 1fr; margin-top: 5px; border-bottom: 1px solid var(--ink); font-weight: 600; height: 16px; padding-top: 2px; }
.ix-cnt { font-family: var(--font-sans); font-weight: 500; color: var(--ink-muted); margin-left: 8px; }
.ix-dir .ix-p { font-weight: 400; color: var(--ink-muted); }
.ix-dname { font-family: var(--font-mono); color: var(--primary); }
.ix-name { font-family: var(--font-mono); padding-left: 10px; }
.ix-name a { color: var(--ink); }
.ix-n { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-muted); }
.fb { color: var(--ink-muted); font-style: italic; }
.ix-new { font-style: normal; font-weight: 600; font-size: 6.2pt; color: var(--accent); margin-right: 6px; }
.sync-note { font-size: 8.4pt; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 6px 6px 0; padding: 4px 9px; margin: 8px 0 6px; max-width: 6.6in; }
`;

  const LOGO = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>`;

  const front = `
<div class="page cover fm">
  <div>
    <div class="mark">${LOGO}</div>
    <h1>Kinwise<br>code tour</h1>
    <p class="lede">A guided, readable selection of the source behind Kinwise, the private, on-device co-pilot that helps families bring a clear medication question to the doctor or pharmacist.</p>
    <p class="what">This PDF is a guided tour plus an index of every source file; the complete source is at the Code link.</p>
    <dl class="kv">
      <dt>Code</dt><dd><a href="${h(CODE_URL)}">${h(CODE_URL)}</a></dd>
      <dt>Live demo</dt><dd><a href="${h(DEMO_URL)}">${h(DEMO_URL)}</a></dd>
      <dt>Team</dt><dd>${h(TEAM)}</dd>
      <dt>Stack</dt><dd>React 19 · TypeScript (strict) · Vite 7 · WebLLM/WebGPU · Vitest · Playwright · Python (KB compiler)</dd>
      <dt>This document</dt><dd>A 5-minute walkthrough; ${tourFiles - excerptFiles} files printed in full and ${excerptFiles} excerpts (${tourLines.toLocaleString("en-US")} lines with their real line numbers); an index of all ${index.files.length} source files with links. ${sync.clean ? h(syncText) : "Line numbers are those of the tree this PDF was built from (see the note below)."}</dd>
    </dl>
    ${syncNote}
    <div class="figs">
      <div class="fig"><div class="n">${stats.files}</div><div class="l">files in src/</div></div>
      <div class="fig"><div class="n">${stats.code.toLocaleString("en-US")}</div><div class="l">lines of TypeScript (excl. tests)</div></div>
      <div class="fig"><div class="n">${stats.tests.toLocaleString("en-US")}</div><div class="l">lines of tests in ${stats.testFiles} files</div></div>
      <div class="fig"><div class="n">${stats.css.toLocaleString("en-US")}</div><div class="l">lines of CSS (+ ${stats.json.toLocaleString("en-US")} lines of compiled KB JSON)</div></div>
    </div>
  </div>
  <p class="note">Why a tour: src/ holds ${stats.lines.toLocaleString("en-US")} lines, too many to read on paper. This PDF prints the parts that carry the product’s claims (the medication-review engine, timeline statistics, clinical NLP, the claim checker, FHIR export, the on-device AI layer, the knowledge base and the local store) in full, excerpts of the AI checks, the Ask scope gate, the KB compiler and the check-in screen, and ends with an index of every source file. All people and records in the code and tests are fictional.</p>
</div>

<div class="page fm" id="fm-walk">
  <div class="body">
    <h1 class="pt">Walk through the code in 5 minutes</h1>
    <p>Five stops that carry the product’s main claims. Each <code>file:line</code> was found in the current source when this PDF was built; it links to the listing in this PDF (page shown) and to the same line on GitHub${sync.clean ? ` (${h(lib.REPO_BRANCH)} at ${h(sync.sha)})` : ""}.</p>
    ${syncNote}
    ${walkRows}
    <div class="walk-run">
      <p><b>Run it yourself:</b> <code>npm ci</code>, then <code>npm run dev</code> (serves http://127.0.0.1:5174/) or <code>npm test</code>. There is no backend; the demo record is fictional.</p>
      <p><b>Live demo:</b> <a class="gh" href="${h(DEMO_URL)}">${h(DEMO_URL)}</a></p>
    </div>
  </div>
</div>

<div class="page fm" data-fm="toc">
  <div class="body">
    <h1 class="pt">Contents</h1>
    <div class="toc-sec"><a href="#fm-walk"><span class="toc-n">·</span>Walk through the code in 5 minutes</a><span class="toc-p" data-page-of="fm-walk"></span></div>
    <div class="toc-sec"><a href="#fm-map"><span class="toc-n">·</span>Repository map</a><span class="toc-p" data-page-of="fm-map"></span></div>
    <div class="toc-sec"><a href="#fm-arch"><span class="toc-n">·</span>How the parts fit, and where each claim lives</a><span class="toc-p" data-page-of="fm-arch"></span></div>
    <div class="toc-sec"><a href="#fm-tests"><span class="toc-n">·</span>Tests and evaluations</a><span class="toc-p" data-page-of="fm-tests"></span></div>
    ${toc}
    <div class="toc-sec"><a href="#appendix"><span class="toc-n">A</span>Appendix: every source file (${index.files.length} files)</a><span class="toc-p" data-page-of="appendix"></span></div>
  </div>
</div>

<div class="page fm" id="fm-map">
  <div class="body">
    <h1 class="pt">Repository map</h1>
    <p>Every folder under <code>src/</code>, with the files and lines directly inside it (counted when this PDF was built) and what it is for. Pure engines (<code>engine/</code>, <code>kb/</code>, <code>model/</code>) import no React or browser APIs, so the same code runs in Vitest, in Node and in the in-app evaluation runner. The appendix lists every file.</p>
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
      <div class="ai"><b>Draft → check</b>ai/tasks.ts verifySection + verify.ts: model cites ids; code checks every sentence</div>
    </div>
    <p>The brief is always available from the deterministic template. When the model is loaded, its sentences replace template wording only if they pass <code>verifyClaims</code>; the medicine table, counts and limitations stay code-written. Everything is stored by <code>model/store.ts</code> in this browser only.</p>
    <h3>Where each claim lives</h3>
    <p>Product claims from the demo, the line that implements each one (found in the source when this PDF was built), and the page in this PDF.</p>
    <table class="claims"><thead><tr><th>Claim</th><th>Code</th><th class="r">Page</th></tr></thead><tbody>${claimRows}</tbody></table>
  </div>
</div>

<div class="page fm" id="fm-tests">
  <div class="body">
    <h1 class="pt">Tests and evaluations</h1>
    <p>All commands run from the repository root after <code>npm ci</code>. Browser checks start their own Vite server and drive the system Chrome headless. Counts below are read from the reports when this PDF was built (Vitest is run by the generator; the E2E and accessibility counts come from the last run’s reports in <code>test-results/</code>).</p>
    <table><thead><tr><th style="width:2.1in">Command</th><th>What it checks</th></tr></thead><tbody>${testRows}</tbody></table>
    <h3>What the evaluations do not show</h3>
    <p>The diary stories and medication cases are synthetic, written by the team with AI assistance (the medication cases by an AI agent directed by the team; see <code>eval/MED-CASES-METHOD.md</code>), and were not reviewed by a clinician. The knowledge base has not been reviewed by a licensed clinician. The medication eval checks that published criteria fire correctly, not clinical outcomes, and no flag does not mean a medicine is free of risk. In a live end-to-end run of the on-device model (<code>eval/results/ai-live.json</code>), the claim checker let ${facts.ai.liveSlippedText ?? facts.ai.liveSlipped} flawed AI outputs through (a garbled sentence, a “can cause” explanation, a diary suggestion quoted from the wrong sentence); that is why the template brief stays the default and every AI draft needs a person’s review.</p>
    <h3>How to regenerate this PDF</h3>
    <p><code>node scripts/submission/make-pdfs.mjs --only=code</code> (or without <code>--only</code> for all three submission PDFs). It starts Vite on port 5222 unless <code>BASE_URL</code> is set, uses the system Chrome through Playwright, and writes to <code>submission/</code>. The build fails if any symbol the walkthrough, pointers or claim table refer to has been renamed, moved out of an excerpt or duplicated, and it prints a note on the cover and the walkthrough (and warns on the console) when the printed files differ from ${h(lib.REPO_BRANCH)}, whose GitHub pages the line links open.</p>
  </div>
</div>`;

  const script = `
(() => {
  const pages = document.getElementById("pages");
  const source = document.getElementById("source");
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  function newPage(cls, left, right) {
    const p = document.createElement("div");
    p.className = "page " + cls;
    p.innerHTML = '<div class="rh"><span><b>' + left + '</b></span><span class="files">' + right + '</span></div><div class="body"></div><div class="rf"><span>Kinwise code tour</span><span class="pn"></span></div>';
    pages.appendChild(p);
    return p.querySelector(".body");
  }
  function newCodePage(file, section, cont) {
    return newPage("code-page", esc(section), '<code>' + esc(file) + '</code>' + (cont ? ' (continued)' : ''));
  }
  const over = (b) => b.scrollHeight > b.clientHeight + 0.5;

  // Wrap marker: a code line taller than one row wrapped, so its gutter gets a "↪" for every continuation row.
  let rowHeight = 0;
  function markWraps(ln) {
    if (ln.classList.contains("gap")) return;
    const code = ln.querySelector(".code");
    if (!rowHeight) {
      const probe = ln.cloneNode(true);
      probe.removeAttribute("id");
      probe.querySelector(".code").textContent = "x";
      ln.parentNode.insertBefore(probe, ln);
      rowHeight = probe.querySelector(".code").getBoundingClientRect().height;
      probe.remove();
    }
    const rows = Math.round(code.getBoundingClientRect().height / rowHeight);
    if (rows > 1) {
      const no = ln.querySelector(".no");
      no.innerHTML = esc(no.textContent) + '<span class="wrap">' + "\\n↪".repeat(rows - 1) + "</span>";
    }
  }

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
    head.forEach(markWraps);
    lastSection = section;
    for (const ln of lines.slice(KEEP)) {
      body.appendChild(ln);
      markWraps(ln);
      if (over(body)) {
        body.removeChild(ln);
        body = newCodePage(file, section, true);
        body.appendChild(ln);
      }
    }
  }

  // Appendix: pour the index rows; a folder header never ends a page, and a folder that continues repeats it.
  const ix = [...document.getElementById("ix-source").children];
  let ixBody = newPage("ix-page", "Appendix", "Every source file");
  ixBody.appendChild(ix[0]);
  let dirRow = null;
  for (const row of ix.slice(1)) {
    if (row.classList.contains("ix-dir")) dirRow = row;
    ixBody.appendChild(row);
    if (!over(ixBody)) continue;
    ixBody.removeChild(row);
    const prev = ixBody.lastElementChild;
    const carry = prev && prev.classList.contains("ix-dir") ? prev : null;
    ixBody = newPage("ix-page", "Appendix", "Every source file (continued)");
    if (carry) ixBody.appendChild(carry);
    else if (row !== dirRow && dirRow) {
      const again = dirRow.cloneNode(true);
      again.querySelector(".ix-cnt").insertAdjacentText("afterbegin", "continued · ");
      ixBody.appendChild(again);
    }
    ixBody.appendChild(row);
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
  const missing = [];
  for (const el of document.querySelectorAll("[data-page-of]")) {
    const n = pageOf(el.dataset.pageOf);
    el.textContent = n ?? "?";
    if (n == null) { el.style.color = "red"; missing.push(el.dataset.pageOf); }
  }
  const overflow = all.filter((p) => { const b = p.querySelector(".body") || p; return b.scrollHeight > b.clientHeight + 1; }).map((p) => all.indexOf(p) + 1);
  const indexed = document.querySelectorAll("#pages .ix-file").length;
  window.__tour = { total, overflow, missing, indexed, done: true };
})();`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Kinwise — code tour</title><style>${css}</style></head>
<body>
<div id="pages">${front}</div>
<div id="source">${blocks}</div>
<div id="ix-source">${appendixIntro}${appendixRowsHtml(index)}</div>
<script>${script}</script>
</body>
</html>`;
}
