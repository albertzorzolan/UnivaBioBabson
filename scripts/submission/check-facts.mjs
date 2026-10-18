// Consistency check for the text judges read: the docs and the video subtitles must not carry stale wording, and every
// key number they print must equal what facts.mjs computes from the repo (eval results, KB meta, FHIR sample).
//
//   node scripts/submission/check-facts.mjs        # prints a report; exit code 1 if any check fails
//
// It does not run the test suite (SKIP_VITEST defaults to 1 here; test counts are not checked).
// Checked files (stale wording + numbers): README.md, submission/DEVPOST.md, docs/EVALUATION.md, docs/DEMO-SCRIPT.md,
//   submission/kinwise-demo.srt, and submission/DEVPOST-if-not-pushed.md when it exists.
// Checked for stale wording only (numbers in code are not prose): the app's public pages (src/views/public/*.ts(x),
//   tests excluded: they assert that the old wording is gone) and the guided tour (src/app/TourOverlay.tsx).
// Advisory files (reported, never fail the run): the PDF generators that still carry their own copy.
// Paste region (the DEVPOST files): the text under "## About the project" up to "## Built with" is what the team pastes
//   into Devpost, so it must hold no HTML comment or TODO (team notes live in the comment block at the top), and its
//   Status table must carry the canonical Partial wording (PARTIAL_KB). Its word count is reported against
//   PASTE_WORDS (a WARN when outside; submission.test.mjs fails on it), never failed here.
// Demo figures: the runs-check p in docs/EVALUATION.md must equal the one pinned in seed.timeline.test.ts.
// Test record (reported, never fails the run): the dated counts in docs/EVALUATION.md §7 vs the last local reports.
// Release gate (reported, never fails the run): evidence from this working tree that is absent at REPO_BRANCH.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_BRANCH, ROOT } from "./lib.mjs";

const FILES = ["README.md", "submission/DEVPOST.md", "docs/EVALUATION.md", "docs/DEMO-SCRIPT.md", "submission/kinwise-demo.srt"];
/** Checked like FILES, but only when present (the DEVPOST text for the fallback one-pager, if the team writes one). */
const OPTIONAL_FILES = ["submission/DEVPOST-if-not-pushed.md"];
const ADVISORY = ["scripts/submission/codetour.mjs", "scripts/submission/record-demo.mjs"];

/** App text judges read in the live demo: stale wording only. Test files are left out (they assert its absence). */
function appTextFiles() {
  const dir = "src/views/public";
  let names = [];
  try {
    names = readdirSync(join(ROOT, dir));
  } catch {
    names = [];
  }
  return [...names.filter((n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)).sort().map((n) => `${dir}/${n}`), "src/app/TourOverlay.tsx"];
}

/**
 * Wording that was true once, or never verified, and must not be printed (case-insensitive, whole words):
 *   - the live demo has been public since 2026-10-11 ("not yet deployed", "Planned live demo", …);
 *   - the flawed-AI count is facts.ai.liveSlippedPhrase, "at least 6 flawed AI sentences (from 5 outputs)", counted
 *     from eval/verifier-redteam.json; the old hand count was "at least 3 flawed outputs";
 *   - the NLP stories and their gold labels were written by the team with AI assistance and not double-annotated
 *     (docs/EVALUATION.md §2), so "labelled by hand" / "hand-labelled" overstates how they were made;
 *   - Gandhi 2003's "19 of 51" / "32 of 51" counts are not verified (kb-src/research/market-evidence.md §0 notes);
 *     only the 37% is printed.
 */
export const STALE = [
  "not yet deployed",
  "Planned live demo",
  "[Team member",
  "planned, not yet",
  "has not run yet",
  "persisted because",
  "at least 3 flawed",
  "labelled by hand",
  "labeled by hand",
  "hand-labelled",
  "hand-labeled",
  "hand labelled",
  "hand labeled",
  "19 of 51",
  "32 of 51",
];

/**
 * The canonical Partial-row wording for the knowledge base and the runs check. The same text is in README.md and the
 * app's status list (src/views/public/howStatus.ts); here it is required in each DEVPOST file's Status table.
 */
export const PARTIAL_KB =
  "Knowledge base: not clinician-reviewed, no dose or allergy checks; interactions limited to the AGS Beers 2023 combination table (not a full drug-interaction checker). Timeline runs check: computed for every comparison, not yet gating.";

/**
 * Word bounds for each DEVPOST paste region, as rendered (renderedWordCount). Judges asked for an About of about
 * 700 words with the problem, what it does, the demo link and an honest status line on the first screen, and the
 * evaluation table moved to the README. The text is written to `target` (650–800 words); `max` adds about 30–45
 * words for the one-line-per-teammate notes the team writes under "Team" (TODO(team) in each file's top block).
 */
export const PASTE_WORDS = { min: 650, target: 800, max: 830 };

/**
 * The part of a DEVPOST file that is pasted into Devpost's "About the project" field: from the line after the
 * "## About the project" heading up to (not including) "## Built with". Returns { text, firstLine } (firstLine is the
 * 1-based line number of the region's first line in the file), or null when either heading is missing.
 */
export function pasteRegion(md) {
  const lines = String(md ?? "").split("\n");
  const start = lines.findIndex((l) => /^## About the project\b/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^## Built with\b/.test(l));
  if (start < 0 || end < 0) return null;
  return { text: lines.slice(start + 1, end).join("\n"), firstLine: start + 2 };
}

/**
 * Problems in a paste region, each { line, msg } with file line numbers: an HTML comment ("<!--") or a TODO would be
 * pasted onto the public page, and the Status table must contain PARTIAL_KB verbatim.
 */
export function pasteRegionProblems(md) {
  const region = pasteRegion(md);
  if (!region) return [{ line: 1, msg: 'paste region not found (needs "## About the project" … "## Built with")' }];
  const out = [];
  region.text.split("\n").forEach((l, i) => {
    if (l.includes("<!--")) out.push({ line: region.firstLine + i, msg: "HTML comment inside the paste region (move team notes to the top block)" });
    if (/\bTODO\b/.test(l)) out.push({ line: region.firstLine + i, msg: "TODO inside the paste region (move it to the top block)" });
  });
  if (!region.text.includes(PARTIAL_KB)) out.push({ line: region.firstLine, msg: "the Status table lacks the canonical Partial wording (PARTIAL_KB)" });
  return out;
}

/** Words a reader sees in a markdown region: link targets, table pipes and emphasis marks are not counted. */
export function renderedWordCount(md) {
  const plain = String(md ?? "")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/[|*#`[\]]/g, " ")
    .replace(/(^|\s)(?:-{2,}|[-→›])(?=\s|$)/g, " ");
  return plain.split(/\s+/).filter(Boolean).length;
}

/** A STALE phrase as a case-insensitive global regex; word boundaries at word-character ends, so "19 of 51" does not match "119 of 512". */
export function staleRegex(phrase) {
  const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${/^\w/.test(phrase) ? "\\b" : ""}${body}${/\w$/.test(phrase) ? "\\b" : ""}`, "gi");
}

/** 1-based line number of a character offset. */
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** Every regex match with its line number; `re` must be global. */
function matches(text, re) {
  return [...text.matchAll(re)].map((m) => ({ m, line: lineOf(text, m.index) }));
}

/**
 * The number checks. Each returns problems ({ line, found, expected }) for one file's text; `seen` collects which
 * canonical values appeared anywhere, so a figure that silently vanished from every file is reported too.
 */
export function numberChecks(f) {
  const ablationPassed = new Set((f.meds.ablation?.runs ?? []).map((r) => r.passed));
  const f1Decimals = new Set([f.nlp.heldoutF1, f.nlp.devF1]);
  const f1Pcts = new Set([f.nlp.heldoutF1Pct, f.nlp.devF1Pct, f.nlp.baselineF1Pct].filter(Boolean));
  const kb = f.kb;
  const counted = (label, re, expected, { skip = () => false } = {}) => ({
    label,
    run: (text) =>
      matches(text, re)
        .filter(({ m }) => !skip(m))
        .map(({ m, line }) => ({ line, found: m[0], ok: Number(m[1].replace(/,/g, "")) === expected, expected: String(expected) })),
  });
  return [
    {
      label: "NLP micro-F1 (decimal)",
      run: (text) =>
        matches(text, /micro[- ]F1\**\s*\**\s*(0\.\d{3})\b/gi).map(({ m, line }) => ({
          line,
          found: m[0],
          ok: f1Decimals.has(m[1]),
          expected: `held-out ${f.nlp.heldoutF1} or dev ${f.nlp.devF1}`,
          canonical: m[1] === f.nlp.heldoutF1 ? "heldoutF1" : null,
        })),
    },
    {
      label: "NLP micro-F1 (percent)",
      run: (text) =>
        matches(text, /(\d{1,3}\.\d)(?:%| percent)\**\s+(?:held-out\s+)?micro[- ]F1/gi).map(({ m, line }) => ({
          line,
          found: m[0],
          ok: f1Pcts.has(`${m[1]}%`),
          expected: [...f1Pcts].join(" or "),
          canonical: `${m[1]}%` === f.nlp.heldoutF1Pct ? "heldoutF1" : null,
        })),
    },
    {
      // "57 of 57 cases", "57 of 57 medication-review test cases", "57/57 cases". Only medication-review counts are
      // checked: the denominator is the case total, or the phrase says "medication". Ablation results are allowed.
      label: "Medication-review cases",
      run: (text) =>
        matches(text, /(\d+)\**\s*(?:of|\/)\s*\**(\d+)\**((?:\s+[\w-]+){0,3}?)\s+cases\b/gi)
          .filter(({ m }) => Number(m[2]) === f.meds.casesTotal || /medication/i.test(m[3]))
          .map(({ m, line }) => {
            const passed = Number(m[1]);
            const ok = Number(m[2]) === f.meds.casesTotal && (passed === f.meds.casesPassed || ablationPassed.has(passed));
            return { line, found: m[0], ok, expected: `${f.meds.casesPassed} of ${f.meds.casesTotal}`, canonical: ok && passed === f.meds.casesPassed ? "medsCases" : null };
          }),
    },
    {
      label: "Medication-review expectations (total)",
      run: (text) =>
        matches(text, /(\d+)\**\s*(?:of|\/)\s*\**(\d+)\**\s+expectations\b/gi).map(({ m, line }) => {
          const [passed, total] = f.meds.expectations.split(" of ").map(Number);
          return { line, found: m[0], ok: Number(m[2]) === total && Number(m[1]) <= total, expected: `… of ${total}`, canonical: Number(m[1]) === passed ? "medsExpectations" : null };
        }),
    },
    counted("FHIR resources", /(\d[\d,]*) resources\b/g, f.fhir.resources),
    // "427 medicines" (KB size). Small counts ("8 medicines") and ACB phrasing ("100 medicines scored") are other facts.
    counted("KB medicines", /\b(\d{3,}) medicines\b(?! scored| with an)/g, kb.drugs),
    counted("KB brand names", /\b(\d+) brand names\b/g, kb.brands),
    counted("KB combination products", /\b(\d+) combination products\b/g, kb.combos),
    counted("KB Beers rules", /\b(\d+) (?:AGS )?Beers(?: 2023)?(?: Criteria)?(?:®)? rules\b/g, kb.beers),
    counted("KB prescribing cascades", /\b(\d+) (?:prescribing )?cascades\b/g, kb.cascades),
    counted("KB fall-risk classes", /\b(\d+) fall-risk(?: drug)? classes\b/g, kb.fridClasses),
    counted("KB ACB-scored medicines", /\b(\d+) (?:scored medicines|medicines scored)\b/g, kb.acbListed),
    ...demoAndRateChecks(f),
  ];
}

/**
 * Checks for the figures added to the submission text in round 3, each against facts.mjs (null facts expect nothing,
 * so any match is then reported): the demo's Fisher and runs-check p and the brief's sleep averages (demoFacts), the
 * timeline chance rates and power (timeline-null.json), the claim checker's in-sample and held-out counts
 * (verifier-redteam.json) and the canonical flawed-AI phrase (liveEscapeCounts).
 */
function demoAndRateChecks(f) {
  const d = f.demo ?? {};
  const t = f.timelineNull ?? null;
  const v = f.verifier ?? null;
  const held = v?.heldOutProbe ? (v.heldOutProbe.corrected ?? v.heldOutProbe) : null;
  const one = (label, re, expected, pick = (m) => m[1]) => ({
    label,
    run: (text) => matches(text, re).map(({ m, line }) => ({ line, found: m[0], ok: expected != null && pick(m) === expected, expected: String(expected) })),
  });
  return [
    one("Demo Fisher p (dizziness)", /Fisher(?:['’]s exact)?(?: test)?,? (?:two-sided )?p = (0\.\d+)/gi, d.fisherP ?? null),
    one("Demo runs-check p (dizziness)", /runs[- ]check p\s*=\s*(0\.\d+)/gi, d.runsCheckP ?? null),
    one("Brief sleep averages (after vs before)", /\b(\d\.\d) vs (\d\.\d) of 5\b/g, d.sleep ? `${d.sleep.after} vs ${d.sleep.before}` : null, (m) => `${m[1]} vs ${m[2]}`),
    one("Timeline chance rate, independent days", /(\d+\.\d)% of simulated medicine changes/gi, t?.independent?.moderate ?? null, (m) => `${m[1]}%`),
    one("Timeline chance rate, runs of days", /(\d+\.\d)% if symptoms come in (?:long )?runs of days/gi, t?.clustered?.moderate ?? null, (m) => `${m[1]}%`),
    one("Timeline power without a gate", /reproducible figure without\s+any gate is (\d+\.\d)%/gi, t?.power?.independent?.tests ?? null, (m) => `${m[1]}%`),
    one("Claim checker, in-sample", /\ball (\d+) harmful sentences\b/gi, v && v.caught === v.harmfulTotal ? String(v.caught) : null),
    one("Claim checker, held-out probe", /\bonly (\d+) of (\d+) on (?:a|the) later held-out probe\b/gi, held ? `${held.caught} of ${held.total}` : null, (m) => `${m[1]} of ${m[2]}`),
    one("Flawed AI sentences (canonical phrase)", /\bat least \d+ flawed AI sentences? \(from \d+ outputs?\)/gi, f.ai?.liveSlippedPhrase ?? null, (m) => m[0].charAt(0).toLowerCase() + m[0].slice(1)),
  ];
}

/**
 * The dated test counts in docs/EVALUATION.md §7 against the last local reports (vitest JSON in BUILD_DIR, test-results/).
 * Returns warning strings; empty when they agree or when there is nothing local to compare with.
 */
export function testRecordWarnings(t) {
  const out = [];
  const r = t?.recordedHere;
  if (!r) return ["docs/EVALUATION.md §7 has no dated test counts (recordedTests found none)"];
  const vt = t.vitest;
  if (vt && r.unit && (vt.passed !== r.unit.passed || vt.skipped !== r.unit.skipped)) {
    out.push(`unit tests: EVALUATION.md §7 records ${r.unit.passed} passed / ${r.unit.skipped} skipped (${r.unit.date}), the last vitest report has ${vt.passed} / ${vt.skipped}`);
  }
  if (t.e2ePassed != null && r.e2e && (t.e2ePassed !== r.e2e.passed || t.e2eChecks !== r.e2e.checks)) {
    out.push(`end-to-end: EVALUATION.md §7 records ${r.e2e.passed} of ${r.e2e.checks} (${r.e2e.date}), the last run has ${t.e2ePassed} of ${t.e2eChecks}`);
  }
  if (t.a11yScans != null && r.a11y && (t.a11yScans !== r.a11y.scans || t.a11yViolations !== r.a11y.violations)) {
    out.push(`accessibility: EVALUATION.md §7 records ${r.a11y.scans} scans / ${r.a11y.violations} violations (${r.a11y.date}), the last run has ${t.a11yScans} / ${t.a11yViolations}`);
  }
  return out;
}

async function main() {
  process.env.SKIP_VITEST ??= "1";
  const { collectFacts, evidenceNotOnBranch } = await import("./facts.mjs");
  const f = collectFacts();
  const checks = numberChecks(f);
  const failures = [];
  const seen = new Set();
  const notes = [];
  const out = [];
  out.push("check-facts: canonical values (facts.mjs)");
  out.push(`  held-out micro-F1 ${f.nlp.heldoutF1} / ${f.nlp.heldoutF1Pct} · dev ${f.nlp.devF1} / ${f.nlp.devF1Pct}${f.nlp.baselineF1Pct ? ` · lexicon baseline ${f.nlp.baselineF1Pct}` : ""}`);
  out.push(`  medication review ${f.meds.cases} cases, ${f.meds.expectations} expectations${f.meds.ablation ? ` · ablations ${f.meds.ablation.minPassed}–${f.meds.ablation.maxPassed} of ${f.meds.ablation.total}` : ""}`);
  out.push(`  FHIR ${f.fhir.resources} resources · KB ${f.kb.drugs} medicines, ${f.kb.brands} brands, ${f.kb.combos} combinations, ${f.kb.beers} Beers rules, ${f.kb.cascades} cascades, ${f.kb.fridClasses} fall-risk classes, ${f.kb.acbListed} ACB-scored`);
  if (f.verifier) {
    const v = f.verifier;
    out.push(
      `  claim checker red team: ${v.before ? `${v.before.caught} of ${v.harmfulTotal} as submitted, ` : ""}${v.caught} of ${v.harmfulTotal} after fixes (in-sample)` +
        `${v.postFixProbe ? ` · post-fix probe ${v.postFixProbe.caught} of ${v.postFixProbe.total}${v.postFixProbe.heldOut ? " (held out)" : " (before tuning; no longer held out)"}` : ""}` +
        `${v.postFixProbe2 ? ` · second probe ${v.postFixProbe2.caught} of ${v.postFixProbe2.total}${v.postFixProbe2.heldOut ? " (held out)" : " (recorded held out; since used for tuning)"}` : ""}` +
        `${v.postFixProbe3 ? ` · third probe ${v.postFixProbe3.caught} of ${v.postFixProbe3.total}${v.postFixProbe3.heldOut ? " (held out; written by an AI agent, not independent of the team)" : " (since used for tuning)"}` : ""}` +
        `${v.postFixUnreadable ? " · a probe is UNREADABLE (one-pager omits the bullet)" : ""}` +
        `${v.liveEscapes ? ` · live escapes listed: ${v.liveEscapes.total}` : ""}`,
    );
  }
  out.push(`  live AI run: ${f.ai.liveSlippedPhrase} (eval/verifier-redteam.json live-escape items: ${f.ai.liveSlippedIds.join(", ")})`);
  out.push(`  demo: Fisher p ${f.demo?.fisherP ?? "–"} · runs check p ${f.demo?.runsCheckP ?? "–"} (pinned ${f.demo?.runsCheckPinned ?? "–"}) · brief sleep ${f.demo?.sleep ? `${f.demo.sleep.after} vs ${f.demo.sleep.before} of 5` : "–"}`);
  out.push(`  optional results: verifier red team ${f.verifier ? "present" : "absent"} · timeline null ${f.timelineNull ? "present" : "absent"} · meds ablation ${f.meds.ablation ? "present" : "absent"}`);

  const scan = (rel, { advisory = false, wordingOnly = false } = {}) => {
    const path = join(ROOT, rel);
    if (!existsSync(path)) {
      out.push(`\n${rel}: MISSING`);
      if (!advisory) failures.push(`${rel}: file missing`);
      return;
    }
    const text = readFileSync(path, "utf8");
    const lines = [];
    for (const s of STALE) {
      for (const { line } of matches(text, staleRegex(s))) lines.push({ ok: false, msg: `stale wording "${s}" (line ${line})` });
    }
    if (rel.startsWith("submission/DEVPOST")) {
      for (const p of pasteRegionProblems(text)) lines.push({ ok: false, msg: `${p.msg} (line ${p.line})` });
      const region = pasteRegion(text);
      if (region) {
        const words = renderedWordCount(region.text);
        const inBounds = words >= PASTE_WORDS.min && words <= PASTE_WORDS.max;
        notes.push(
          `${inBounds ? "" : "WARN "}${rel}: paste region ${words.toLocaleString("en-US")} words as rendered ` +
            `(written to ${PASTE_WORDS.min}–${PASTE_WORDS.target}; allowed up to ${PASTE_WORDS.max} with the teammate lines)`,
        );
      }
    }
    if (!advisory && !wordingOnly) {
      for (const c of checks) {
        for (const r of c.run(text)) {
          if (r.canonical) seen.add(r.canonical);
          lines.push({ ok: r.ok, msg: `${c.label}: "${r.found.replace(/\s+/g, " ")}" (line ${r.line})${r.ok ? "" : ` → expected ${r.expected}`}` });
        }
      }
    }
    const bad = lines.filter((l) => !l.ok);
    const tag = advisory ? " (advisory)" : wordingOnly ? " (wording only)" : "";
    out.push(`\n${rel}${tag}: ${bad.length ? `${bad.length} problem(s)` : "OK"}${wordingOnly ? "" : ` · ${lines.filter((l) => l.ok).length} number(s) match`}`);
    for (const l of bad) out.push(`  ${advisory ? "WARN" : "FAIL"} ${l.msg}`);
    if (!advisory) for (const l of bad) failures.push(`${rel}: ${l.msg}`);
  };

  for (const rel of FILES) scan(rel);
  for (const rel of OPTIONAL_FILES) if (existsSync(join(ROOT, rel))) scan(rel);
  for (const rel of appTextFiles()) scan(rel, { wordingOnly: true });
  for (const rel of ADVISORY) scan(rel, { advisory: true });

  // The headline figures must still be stated somewhere (a deleted claim is fine only if it is deliberate).
  for (const [key, label] of [
    ["heldoutF1", `held-out micro-F1 (${f.nlp.heldoutF1} or ${f.nlp.heldoutF1Pct})`],
    ["medsCases", `medication review ${f.meds.cases} cases`],
  ]) {
    if (!seen.has(key)) failures.push(`no checked file states the ${label}`);
  }

  // The demo's runs-check p is stated in docs/EVALUATION.md and pinned by the engine test; the two must agree.
  if (!f.demo?.runsCheckP || f.demo.runsCheckP !== f.demo.runsCheckPinned) {
    failures.push(`runs-check p: docs/EVALUATION.md says ${f.demo?.runsCheckP ?? "nothing"}, src/engine/timeline/seed.timeline.test.ts pins ${f.demo?.runsCheckPinned ?? "nothing"}`);
    out.push(`\nFAIL runs-check p: EVALUATION.md ${f.demo?.runsCheckP ?? "–"} vs seed.timeline.test.ts ${f.demo?.runsCheckPinned ?? "–"}`);
  }
  for (const n of notes) out.push(`\n${n}`);
  // Test record (warning only): the dated §7 counts vs the last local runs.
  const testWarn = testRecordWarnings(f.tests);
  if (testWarn.length) for (const w of testWarn) out.push(`\nWARN test record: ${w}`);
  else out.push(`\ntest record: docs/EVALUATION.md §7 matches the last local reports (${f.tests.recordedHere.unit?.passed ?? "?"} unit, ${f.tests.recordedHere.e2e?.passed ?? "?"} e2e, ${f.tests.recordedHere.a11y?.scans ?? "?"} a11y scans)`);

  // Release gate (warning only): evidence the PDFs print that is not on the branch they link.
  const { branch, gaps } = evidenceNotOnBranch(REPO_BRANCH);
  if (gaps == null) out.push(`\nWARN could not compare the evidence with branch ${branch}`);
  else if (gaps.length) {
    out.push(`\nWARN release gate: the materials link ${branch}, but this evidence is not on it (merge and redeploy before uploading the PDFs):`);
    for (const g of gaps) out.push(`  WARN ${g}`);
  } else out.push(`\nrelease gate: all printed evidence exists at ${branch}`);

  out.push(`\n${failures.length ? `FAILED: ${failures.length} problem(s)` : "PASSED: no stale wording; every checked number matches facts.mjs"}`);
  console.log(out.join("\n"));
  if (failures.length) process.exitCode = 1;
}

// Run only when invoked as a script (the unit tests import numberChecks and STALE).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
