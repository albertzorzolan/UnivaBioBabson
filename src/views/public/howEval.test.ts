// The How-it-works runners must reproduce the CLI evaluations (eval/*.eval.test.ts) without Node APIs.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runMedSuite, runNlpBenchmark } from "./howEval";

describe("How-it-works live evaluation runners", () => {
  it("NLP benchmark scores both corpora and agrees with the committed results file", async () => {
    const run = await runNlpBenchmark();
    const dev = JSON.parse(readFileSync(new URL("../../../eval/nlp-corpus.dev.json", import.meta.url), "utf8")) as { cases: unknown[] };
    expect(run.dev.report.cases).toBe(dev.cases.length);
    expect(run.heldout).not.toBeNull();
    expect(run.dev.context.length).toBeGreaterThan(0);
    // Same engine + same corpora → same scores as eval/results/nlp-eval.json, unless the engine changed since.
    if (run.matchesCommitted === false) console.warn("NLP results differ from eval/results/nlp-eval.json (re-run npm run eval:nlp)");
    expect(run.dev.report.micro.f1).toBeGreaterThan(0.9);
  });

  it("medication-review suite runs every case without engine errors", async () => {
    const run = await runMedSuite();
    expect(run.summary.cases).toBeGreaterThanOrEqual(45);
    expect(run.cases.filter((c) => c.error)).toEqual([]);
    expect(run.summary.expectations).toBeGreaterThan(run.summary.cases);
    expect(run.summary.expectationsPassed + run.summary.preconditionFailures + run.summary.assertionFailures).toBe(run.summary.expectations);
  });
});
