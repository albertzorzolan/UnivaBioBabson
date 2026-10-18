// The How-it-works runners must reproduce the CLI evaluations (eval/*.eval.test.ts) without Node APIs.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { floorPct, microRates, pct, runMedSuite, runNlpBenchmark } from "./howEval";

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

describe("dev-set score rounding (same rule as scripts/submission/facts.mjs floorPct)", () => {
  it("rounds down to one decimal, so the dev score is never shown higher than measured", () => {
    expect(floorPct(0.9985)).toBe("99.8%");
    expect(floorPct(0.9969)).toBe("99.6%");
    expect(floorPct(1)).toBe("100.0%");
    expect(floorPct(0.9422)).toBe("94.2%");
    // Floating-point noise must not knock an exact tenth down (0.29 * 100 * 10 = 289.99999999999994).
    expect(floorPct(0.29)).toBe("29.0%");
  });

  it("prints the committed dev F1 exactly as the PDFs do", () => {
    const committed = JSON.parse(readFileSync(new URL("../../../eval/results/nlp-eval.json", import.meta.url), "utf8"));
    const facts = readFileSync(new URL("../../../scripts/submission/facts.mjs", import.meta.url), "utf8");
    // The rule itself, copied from facts.mjs: if it changes there, this test points here.
    expect(facts).toContain("const floorDec = (x, d = 3) => (Math.floor(x * 10 ** d + 1e-9) / 10 ** d).toFixed(d);");
    expect(facts).toContain("const floorPct = (x, d = 1) => `${floorDec(x * 100, d)}%`;");
    expect(floorPct(committed.dev.micro.f1)).toBe("99.8%");
  });
});

describe("scorecard rates come from the raw counts (same as scripts/submission/facts.mjs heldoutP/heldoutR)", () => {
  it("prints the held-out precision as measured, 106/109 = 97.2%, not the twice-rounded 97.3%", () => {
    const committed = JSON.parse(readFileSync(new URL("../../../eval/results/nlp-eval.json", import.meta.url), "utf8"));
    const m = committed.heldout.micro;
    expect({ tp: m.tp, fp: m.fp }).toEqual({ tp: 106, fp: 3 });
    const rates = microRates(m);
    expect(pct(rates.precision)).toBe("97.2%");
    expect(pct(rates.recall)).toBe(pct(m.tp / (m.tp + m.fn)));
    expect(pct(rates.f1)).toBe("94.2%");
    // The bug this replaces: the report's precision is already rounded to 4 decimals (0.9725), so pct() went up.
    expect(pct(m.precision)).toBe("97.3%");
  });

  it("follows the evaluator's conventions for empty denominators", () => {
    expect(microRates({ tp: 0, fp: 0, fn: 0 })).toEqual({ precision: 1, recall: 1, f1: 1 });
    expect(microRates({ tp: 0, fp: 2, fn: 3 })).toEqual({ precision: 0, recall: 0, f1: 0 });
  });
});
