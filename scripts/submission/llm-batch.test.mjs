// The on-device model's batch run (scripts/llm-batch.mjs, eval/results/llm-batch.json): its statistics, prompt set and
// runtime version, and two release guards. Lives in scripts/submission/ so `npm run test:submission` runs it:
//   1. the committed results were produced by the code now in the tree (hashes of the files the numbers depend on);
//   2. the README batch line (under "Rigor at a glance") is exactly the one facts.mjs builds from the results file.
// Run alone with: node --test scripts/submission/llm-batch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUDIT_LABELS, PROMPTS, applyAudit, percentile, summarize, webllmVersion, wilson } from "../llm-batch.mjs";

test("Wilson 95% interval matches published values", () => {
  // Newcombe 1998, Table I: 0/10 → 0–0.2775; 5/10 → 0.2366–0.7634 (z = 1.96).
  assert.deepEqual(wilson(0, 10), [0, 0.2775]);
  assert.deepEqual(wilson(5, 10), [0.2366, 0.7634]);
  assert.deepEqual(wilson(10, 10), [0.7225, 1]);
  assert.equal(wilson(1, 0), null);
  assert.equal(wilson(11, 10), null);
});

test("nearest-rank percentiles", () => {
  const xs = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(percentile(xs, 0.5), 5);
  assert.equal(percentile(xs, 0.95), 10);
  assert.equal(percentile([7], 0.95), 7);
  assert.equal(percentile([], 0.5), null);
});

test("the prompt set is 30 Ask questions (5 chips), 5 briefs and 5 explanations, with unique ids", () => {
  assert.equal(PROMPTS.ask.length, 30);
  assert.equal(PROMPTS.ask.filter((a) => a.chip).length, 5);
  assert.equal(PROMPTS.brief.length, 5);
  assert.equal(PROMPTS.explain.length, 5);
  const ids = [...PROMPTS.ask, ...PROMPTS.brief, ...PROMPTS.explain].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

const s = (id, verdict) => ({ id, verdict, text: id, section: "answer", issues: [], evidenceIds: [], cited: [] });
const results = [
  { id: "a", task: "ask", modelRan: true, ms: 1000, sentences: [s("a#1", "shown"), s("a#2", "blocked")] },
  { id: "b", task: "ask", modelRan: true, ms: 3000, sentences: [s("b#1", "not_shown")] },
  { id: "c", task: "ask", modelRan: false, ms: null, sentences: [] },
  { id: "d", task: "brief", modelRan: true, ms: 40000, sentences: [s("d#1", "shown"), s("d#2", "shown"), s("d#3", "blocked")] },
  { id: "e", task: "explain", modelRan: true, ms: 5000, sentences: [s("e#1", "shown")] },
];

test("the runtime version written into the report is the installed WebLLM package's, read at run time", async () => {
  const { readFileSync } = await import("node:fs");
  const installed = JSON.parse(readFileSync(new URL("../../node_modules/@mlc-ai/web-llm/package.json", import.meta.url), "utf8")).version;
  assert.equal(webllmVersion(), installed);
});

test("summarize counts verdicts and latency per task, only over prompts where the model ran", () => {
  const sum = summarize(results);
  assert.equal(sum.prompts, 5);
  assert.equal(sum.modelRuns, 4);
  assert.equal(sum.sentencesGenerated, 7);
  assert.equal(sum.blocked, 2);
  assert.equal(sum.shown, 4);
  assert.equal(sum.notShown, 1);
  assert.equal(sum.blockedRate, 0.2857);
  assert.deepEqual(sum.byTask.ask.latencyMs, { p50: 1000, p95: 3000, max: 3000 });
  assert.equal(sum.byTask.brief.shown, 2);
});

test("applyAudit labels only shown sentences and computes the escape rate with its Wilson interval", () => {
  const copy = structuredClone(results);
  const a = applyAudit(copy, { "a#1": { label: "ok" }, "d#1": { label: "advice", note: "suggests a change" }, "d#2": { label: "ok" }, "e#1": { label: "ok" } });
  assert.equal(a.shownTotal, 4);
  assert.equal(a.complete, true);
  assert.equal(a.flawed, 1);
  assert.deepEqual(a.flawedIds, ["d#1"]);
  assert.equal(a.byLabel.advice, 1);
  assert.deepEqual(a.escapeWilson95, wilson(1, 4));
  assert.equal(copy[3].sentences[0].audit.note, "suggests a change");
  assert.ok(Object.keys(AUDIT_LABELS).includes("wrong-number"));
  assert.throws(() => applyAudit(structuredClone(results), { "a#2": { label: "ok" } }), /not a shown sentence/);
  assert.throws(() => applyAudit(structuredClone(results), { "a#1": { label: "fine" } }), /unknown audit label/);
  assert.equal(applyAudit(structuredClone(results), { "a#1": { label: "ok" } }).complete, false);
});

test("the committed results were produced by the code in this working tree (else repeat the run)", async (t) => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const url = new URL("../../eval/results/llm-batch.json", import.meta.url);
  if (!existsSync(url)) return t.skip("no eval/results/llm-batch.json");
  const report = JSON.parse(readFileSync(url, "utf8"));
  const stale = Object.entries(report.code?.sha256 ?? {}).filter(
    ([file, hash]) => createHash("sha256").update(readFileSync(new URL(`../../${file}`, import.meta.url))).digest("hex").slice(0, 16) !== hash,
  );
  assert.deepEqual(stale.map(([f]) => f), [], "these files changed since the batch run: run node scripts/llm-batch.mjs again and re-audit");
  // The audit covers every shown sentence, and its interval is the one this script computes.
  assert.equal(report.audit?.complete, true);
  assert.deepEqual(report.audit.escapeWilson95, wilson(report.audit.flawed, report.audit.labelled));
  assert.deepEqual(summarize(report.results), report.summary);
});

test("the README batch line is exactly the one facts.mjs builds from the results file", async (t) => {
  const { existsSync, readFileSync } = await import("node:fs");
  const url = new URL("../../eval/results/llm-batch.json", import.meta.url);
  if (!existsSync(url)) return t.skip("no eval/results/llm-batch.json");
  const { batchFacts } = await import("./facts.mjs");
  const f = batchFacts(JSON.parse(readFileSync(url, "utf8")));
  assert.ok(f, "batchFacts returned null (malformed file or incomplete audit)");
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.ok(readme.split("\n").includes(f.line), "README.md lacks the batch line printed by facts.mjs batchFacts().line");
  // Spot-check the line's numbers against the file.
  assert.match(f.line, new RegExp(`${f.flawed} of ${f.shown} shown sentences were flawed`));
  assert.ok(f.line.includes(`95% CI ${f.escapeCi95}`));
});
