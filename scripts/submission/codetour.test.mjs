// Tests for the code-tour generator (no browser): links on the cover, build-time line anchors, drift detection and
// the "every source file" appendix.
//   node --test scripts/submission/codetour.test.mjs
// Vitest only collects src/ and eval/, and this is a plain .mjs build script, so it uses node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_URL, DEMO_URL, ROOT } from "./lib.mjs";
import { WALK, branchSync, codeTourHtml, indexedPaths, sym } from "./codetour.mjs";

/** The facts fields codeTourHtml reads, in the shape collectFacts() returns (values are placeholders). */
const facts = {
  nlp: { heldoutCases: 70, heldoutF1: "0.942", heldoutP: "0.950", heldoutR: "0.935", devCases: 245, devF1: "0.998" },
  meds: { cases: "57 of 57", expectations: "295 of 295", kbVersion: "test" },
  kb: { sources: 40 },
  ai: { liveSlipped: 6, liveSlippedOutputs: 5, liveSlippedText: "at least 6", liveSlippedPhrase: "at least 6 flawed AI sentences (from 5 outputs)" },
  fhir: { resources: 30, errors: 0, warnings: 25, info: 11 },
  tests: { vitest: { total: 1246, files: 50, passed: 1245, failed: 0, skipped: 1 }, e2eChecks: 20, e2ePassed: 20, a11yScans: 46, a11yViolations: 0 },
};

/** 1-based line of the first line in `path` matching `re` (the test's own, independent search). */
function lineOf(path, re) {
  const i = readFileSync(join(ROOT, path), "utf8").split("\n").findIndex((l) => re.test(l));
  assert.ok(i >= 0, `${re} not found in ${path}`);
  return i + 1;
}

// Built once: the generator reads and highlights a few thousand lines.
const html = codeTourHtml({ facts });

test("sym() matches TS and Python declarations, not uses", () => {
  const re = new RegExp(sym("verifyClaims"));
  assert.ok(re.test("export function verifyClaims("));
  assert.ok(re.test("  const verifyClaims = () => {"));
  assert.ok(!re.test("  const r = verifyClaims(text);"));
  assert.ok(!re.test("export function verifyClaimsFast("));
  assert.ok(new RegExp(sym("check_text")).test("def check_text(where, text, problems):"));
});

test("cover: clickable code branch and live demo links, team, no 'planned'", () => {
  assert.match(CODE_URL, /\/tree\/medwatch-v2$/);
  assert.ok(html.includes(`<a href="${CODE_URL}">${CODE_URL}</a>`));
  assert.ok(html.includes(`<a href="${DEMO_URL}">${DEMO_URL}</a>`));
  assert.ok(html.includes("Albert Zorzolan and Neil Shah, Babson College"));
  assert.ok(html.includes("This PDF is a guided tour plus an index of every source file; the complete source is at the Code link."));
  const cover = html.slice(html.indexOf('class="page cover'), html.indexOf('id="fm-walk"'));
  assert.doesNotMatch(cover, /planned|not yet deployed/i);
});

test("cover: tells a judge where to start, with page numbers filled from the layout", () => {
  const cover = html.slice(html.indexOf('class="page cover'), html.indexOf('id="fm-walk"'));
  assert.ok(
    cover.includes('Start with pages <span data-page-of="fm-walk">2</span>–<span data-page-of="fm-tests">6</span> (5-minute walkthrough, claim-to-code table, limits); the rest is reference.'),
  );
  // The pages it names are the walkthrough (first) and the tests-and-limits page (last), with the claim table between.
  const order = ['id="fm-walk"', 'id="fm-arch"', 'class="claims"', 'id="fm-tests"', "What the evaluations do not show"].map((s) => html.indexOf(s));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), JSON.stringify(order));
});

test("sync note: never prints a commit hash for the build tree (it would be stale once the PDF is committed)", () => {
  assert.doesNotMatch(html, /Built from (uncommitted changes \()?HEAD [0-9a-f]{7}/);
  const sync = branchSync(["src/engine/brief/verify.ts"], { files: [] });
  assert.match(sync.head, /^[0-9a-f]{7,}$/); // still read at build time, for the console warning
  if (!sync.clean) assert.match(html, /Built from (uncommitted changes on )?(branch [\w./-]+|a detached checkout): \d+ of the \d+ printed files differ/);
});

test("the tour refuses to build without the canonical flaw phrase", () => {
  assert.throws(() => codeTourHtml({ facts: { ...facts, ai: { liveSlipped: 6 } } }), /liveSlippedPhrase is missing/);
});

test("walkthrough: the five canonical stops, each with the line found in the current source", () => {
  assert.deepEqual(
    WALK.flatMap((w) => w.anchors.map(([p, n]) => `${p} ${n}`)),
    [
      "src/engine/timeline/signals.ts compareMetric",
      "src/engine/timeline/stats.ts fisherExact",
      "src/engine/meds/engine.ts reviewWithKb",
      "src/engine/meds/rules/cascades.ts cascadeFindings",
      "src/engine/nlp/context.ts analyzeInSentence",
      "src/ai/tasks.ts verifySection",
      "src/engine/brief/verify.ts verifyClaims",
      "src/engine/brief/qa.ts routeQuestion",
    ],
  );
  for (const w of WALK) {
    for (const [path, name] of w.anchors) {
      const line = lineOf(path, new RegExp(`^export function ${name}\\b`));
      assert.ok(html.includes(`<code>${path}:${line}</code>`), `${path}:${line} (${name}) missing from the walkthrough`);
    }
  }
});

test("a renamed symbol fails the build instead of printing a stale line", () => {
  const saved = WALK[0].anchors[0][1];
  WALK[0].anchors[0][1] = "compareMetricRenamedForTest";
  try {
    assert.throws(() => codeTourHtml({ facts }), /not found in src\/engine\/timeline\/signals\.ts/);
  } finally {
    WALK[0].anchors[0][1] = saved;
  }
});

test("excerpts: AI checks, Ask scope gate, KB compiler and the check-in view are printed", () => {
  for (const id of ["f-src-ai-tasks-ts", "f-src-engine-brief-qa-ts", "f-kb-src-build-kb-py", "f-src-views-patient-Today-tsx"]) {
    assert.ok(html.includes(`data-file-id="${id}"`), `${id} not printed`);
  }
  for (const [path, name] of [
    ["src/ai/tasks.ts", "verifySection"],
    ["src/ai/tasks.ts", "checkExplanation"],
    ["src/engine/brief/qa.ts", "routeQuestion"],
    ["kb-src/build_kb.py", "check_text"],
  ]) {
    const id = `f-${path.replace(/[^a-z0-9]+/gi, "-")}-L${lineOf(path, new RegExp(sym(name)))}`;
    assert.ok(html.includes(`id="${id}"`), `${path} ${name} is not inside a printed excerpt`);
  }
});

test("appendix: one row per file under the indexed folders (tracked + not yet committed); cover count agrees", () => {
  const ls = (args) => execFileSync("git", ["ls-files", "-z", ...args], { cwd: ROOT }).toString("utf8").split("\0").filter(Boolean);
  const roots = ["src", "eval", "kb-src", "scripts", ".github"];
  const atRoot = (p) => !p.includes("/");
  const others = ["--others", "--exclude-standard"];
  const all = new Set([...ls(["--", ...roots]), ...ls([]).filter(atRoot), ...ls([...others, "--", ...roots]), ...ls(others).filter(atRoot)]);
  const listed = [...all].filter((p) => !p.startsWith("kb-src/research/regsrc/") && existsSync(join(ROOT, p)));
  const rows = html.match(/class="ix-row ix-file"/g) ?? [];
  assert.equal(rows.length, listed.length);
  const blob = CODE_URL.replace("/tree/", "/blob/");
  for (const p of ["src/ai/tasks.ts", "kb-src/build_kb.py", "package.json"]) assert.ok(html.includes(`href="${blob}/${p}"`), `${p} link missing`);
  // Not-yet-committed files are marked and get no GitHub link.
  const { untracked } = indexedPaths();
  const marks = html.match(/class="ix-new"/g) ?? [];
  assert.equal(marks.length, [...untracked].filter((p) => !p.startsWith("kb-src/research/regsrc/")).length);
  for (const p of untracked) assert.ok(!html.includes(`href="${blob}/${p}"`), `${p} is not committed but linked`);
  // The cover's "files in src/" is the appendix's src/ count.
  const srcCount = listed.filter((p) => p.startsWith("src/")).length;
  assert.ok(html.includes(`<div class="n">${srcCount}</div><div class="l">files in src/</div>`), `cover does not show ${srcCount} files in src/`);
});

test("GitHub line links: the cover says whether they match the branch, never claims a match that is false", () => {
  const sync = branchSync(["src/engine/brief/verify.ts", "src/ai/tasks.ts"], { files: [] });
  assert.equal(sync.total, 2);
  const cover = html.slice(html.indexOf('class="page cover'), html.indexOf('id="fm-walk"'));
  const walk = html.slice(html.indexOf('id="fm-walk"'), html.indexOf('data-fm="toc"'));
  if (sync.clean) {
    assert.match(cover, new RegExp(`Line numbers match the files on medwatch-v2 at commit ${sync.sha}`));
  } else {
    // At least one of these differs from the branch, so the tour must say so on the cover and the walkthrough.
    for (const page of [cover, walk]) {
      assert.match(page, /class="sync-note"/);
      assert.match(page, /GitHub line links match only once this tree is pushed to medwatch-v2/);
    }
    assert.doesNotMatch(cover, /Line numbers match the files on/);
  }
});

test("claim checker anchors and caveats: BANNED_PATTERNS declaration, live-run gaps, KB word list, FHIR result", () => {
  const line = lineOf("src/engine/brief/verify.ts", /^export const BANNED_PATTERNS\b/);
  assert.ok(html.includes(`<code>engine/brief/verify.ts:${line}</code>`), `claim row does not point to verify.ts:${line}`);
  assert.match(html, /The patterns are not exhaustive: in a live run the checker let at least 6 flawed AI sentences \(from 5 outputs\) through/);
  assert.match(html, /the claim checker let at least 6 flawed AI sentences \(from 5 outputs\) through \(among them/);
  // Both places cite where the count comes from (the live-escape items), not only the run whose verdict names 3 outputs.
  assert.match(html, /\(from 5 outputs\) through \(the sentences tagged live-escape in eval\/verifier-redteam\.json, copied from the run in eval\/results\/ai-live\.json\)/);
  assert.match(html, /eval\/results\/ai-live\.json<\/code>; the flawed sentences are listed as live-escape items in <code>eval\/verifier-redteam\.json<\/code>\), the claim checker let/);
  assert.doesNotMatch(html, /at least 3 flawed/);
  assert.match(html, /verify\.ts is the gate between the language model and a person; it opens with a numbered list of its checks and is organised as one commented section per check/);
  assert.match(html, /SPEC §3 banned words \(cause\/caused, safe, dangerous, urgent, diagnosis, stop taking, should stop, risk score\)/);
  assert.match(html, /returned 0 errors \(25 terminology warnings, 11 information messages\) from the public HAPI FHIR R4/);
  assert.match(html, /written by the team with AI assistance/);
  assert.doesNotMatch(html, /\{(?:TEST_FILES|KB_SOURCES|TSX_FILES|CSS_FILES|KB_BANNED|FHIR_RESULT|LIVE_SLIPPED)\}/);
});
