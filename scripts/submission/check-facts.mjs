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
  ];
}

async function main() {
  process.env.SKIP_VITEST ??= "1";
  const { collectFacts, evidenceNotOnBranch } = await import("./facts.mjs");
  const f = collectFacts();
  const checks = numberChecks(f);
  const failures = [];
  const seen = new Set();
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
