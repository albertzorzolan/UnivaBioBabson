// NLP benchmark: `npm run eval:nlp`.
// - Dev corpus (eval/nlp-corpus.dev.json): used during development; targets are asserted.
// - Held-out corpus (eval/nlp-corpus.heldout.json): written independently and never used for tuning.
//   It is scored and reported when present, but nothing is asserted on it and per-case errors are
//   not printed (they are written to the results file, without story text, for the final report).
// - Baseline: both corpora are also scored with ConText switched off (lexicon-only baseline), and story-level
//   bootstrap 95% intervals (2,000 resamples, fixed seed) are added for the engine F1, the baseline F1 and their
//   paired difference: heldout.baseline / ci95 / baselineCi95 / deltaCi95 / subsetDeltas (same for dev).
// Results: eval/results/nlp-eval.json (timestamp from EVAL_TIMESTAMP or the current time).

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { writeResultsIfChanged } from "./writeResults";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareWithBaseline,
  countsPerCase,
  evaluateCorpus,
  falsePositivesInSubset,
  type BaselineComparison,
  type Corpus,
  type EvalReport,
} from "../src/engine/nlp/evaluate";
import { EVAL_MEDS, EVAL_PATIENT_NAMES, EVAL_TODAY } from "../src/engine/nlp/fixtures";

const here = dirname(fileURLToPath(import.meta.url));
const DEV_PATH = join(here, "nlp-corpus.dev.json");
const HELDOUT_PATH = join(here, "nlp-corpus.heldout.json");
const OUT_PATH = join(here, "results", "nlp-eval.json");

const ctx = { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: EVAL_PATIENT_NAMES };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function summary(r: EvalReport): string {
  const lines = [
    `${r.corpus}: ${r.cases} cases · micro P ${pct(r.micro.precision)} R ${pct(r.micro.recall)} F1 ${pct(r.micro.f1)} · ` +
      `macro F1 ${pct(r.macroF1)} · exact cases ${r.exactCases}/${r.cases} · negation acc ${pct(r.negation.accuracy)} · ` +
      `latency mean ${r.latency.meanMs} ms, p95 ${r.latency.p95Ms} ms`,
    ...Object.entries(r.perField).map(
      ([f, p]) => `  ${f.padEnd(18)} P ${pct(p.precision).padStart(6)} R ${pct(p.recall).padStart(6)} F1 ${pct(p.f1).padStart(6)} (n=${p.support})`,
    ),
    `  within ±1: energy ${pct(r.within1.energy.rate)}, sleep ${pct(r.within1.sleep.rate)}, severity ${pct(r.within1.dizzinessSeverity.rate)}`,
    `  other concepts micro F1 ${pct(r.other.micro.f1)} (n=${r.other.micro.support})`,
    `  subsets (errors fp/fn): ` +
      ["negation", "experiencer_other", "historical", "hypothetical", "fall_vs_near_fall", "double_negation", "pseudo_negation", "conflict", "caregiver_voice", "typo"]
        .filter((t) => r.subsets[t])
        .map((t) => `${t} ${r.subsets[t].errors} (${r.subsets[t].fp}/${r.subsets[t].fn})`)
        .join(", "),
  ];
  return lines.join("\n");
}

const ci = (c: { f1: [number, number] }) => `[${pct(c.f1[0])}, ${pct(c.f1[1])}]`;

function baselineSummary(r: EvalReport, b: BaselineComparison): string {
  const subsets = Object.entries(b.subsetDeltas)
    .map(([t, d]) => `${t} ${d.engineErrors} vs ${d.baselineErrors}`)
    .join(", ");
  return [
    `${r.corpus}: engine F1 ${pct(r.micro.f1)} 95% CI ${ci(b.ci95)} · baseline (no ConText) F1 ${pct(b.baseline.micro.f1)} ` +
      `(P ${pct(b.baseline.micro.precision)} R ${pct(b.baseline.micro.recall)}) 95% CI ${ci(b.baselineCi95)} · ` +
      `difference ${pct(b.deltaCi95.pointEstimate)} 95% CI ${ci(b.deltaCi95)}`,
    `  errors engine vs baseline: ${subsets}; baseline negation acc ${pct(b.baseline.negation.accuracy)}`,
  ].join("\n");
}

describe("NLP benchmark", () => {
  const dev = JSON.parse(readFileSync(DEV_PATH, "utf8")) as Corpus;
  const devReport = evaluateCorpus("dev", dev, ctx);
  // NLP_EVAL_SKIP_HELDOUT=1 keeps held-out numbers out of sight during development iterations.
  const useHeldout = process.env.NLP_EVAL_SKIP_HELDOUT !== "1" && existsSync(HELDOUT_PATH);
  const heldout = useHeldout ? (JSON.parse(readFileSync(HELDOUT_PATH, "utf8")) as Corpus) : null;
  const heldoutReport = heldout ? evaluateCorpus("heldout", heldout, ctx) : null;
  const devBaseline = compareWithBaseline("dev", dev, ctx, devReport);
  const heldoutBaseline = heldout && heldoutReport ? compareWithBaseline("heldout", heldout, ctx, heldoutReport) : null;

  it("writes eval/results/nlp-eval.json", () => {
    console.log(summary(devReport));
    const devCore = devReport.errors.filter((e) => !e.field.startsWith("other:"));
    console.log(`dev core-field errors (${devCore.length}):`);
    for (const e of devCore) console.log(`  ${e.id} ${e.field}: gold=${JSON.stringify(e.gold)} predicted=${JSON.stringify(e.predicted)} [${e.tags.join(",")}]`);
    const devOther = devReport.errors.filter((e) => e.field.startsWith("other:"));
    console.log(`dev other-concept errors (${devOther.length}): ` + devOther.map((e) => `${e.id} ${e.field} ${e.gold}->${e.predicted}`).join("; "));
    console.log(baselineSummary(devReport, devBaseline));
    if (heldoutReport) console.log("\n" + summary(heldoutReport) + "\n(held-out per-case errors are written to the results file only)");
    else console.log("held-out corpus not scored in this run");
    if (heldoutReport && heldoutBaseline) console.log(baselineSummary(heldoutReport, heldoutBaseline));

    const generatedAt = process.env.EVAL_TIMESTAMP ?? new Date().toISOString();
    writeResultsIfChanged(OUT_PATH, {
      generatedAt,
      engine: devReport.engine,
      protocol:
        "Scoring per eval/ANNOTATION-GUIDE.md. Dev set used for development; held-out set written independently and never used for tuning (reported, not asserted).",
      today: EVAL_TODAY,
      // The existing report fields stay as they were; the baseline comparison is added beside them.
      dev: { ...devReport, ...devBaseline },
      heldout: heldoutReport && heldoutBaseline ? { ...heldoutReport, ...heldoutBaseline } : heldoutReport,
    });
    expect(existsSync(OUT_PATH)).toBe(true);
  });

  it("dev: core micro-F1 ≥ 0.95", () => {
    expect(devReport.micro.f1).toBeGreaterThanOrEqual(0.95);
  });

  it("dev: zero false positives in experiencer-other and hypothetical cases", () => {
    expect(falsePositivesInSubset(devReport, "experiencer_other")).toEqual([]);
    expect(falsePositivesInSubset(devReport, "hypothetical")).toEqual([]);
  });

  it("baseline: switching ConText off is worse on dev, with an interval that excludes no difference", () => {
    expect(devBaseline.baseline.micro.f1).toBeLessThan(devReport.micro.f1);
    expect(devBaseline.deltaCi95.f1[0]).toBeGreaterThan(0);
    expect(devBaseline.ci95.f1[0]).toBeLessThanOrEqual(devReport.micro.f1);
    expect(devBaseline.ci95.f1[1]).toBeGreaterThanOrEqual(devReport.micro.f1);
  });

  it("bootstrap per-story counts add up to the reported micro TP/FP/FN (dev)", () => {
    const k = countsPerCase(dev, devReport).reduce((s, c) => ({ tp: s.tp + c.tp, fp: s.fp + c.fp, fn: s.fn + c.fn }), { tp: 0, fp: 0, fn: 0 });
    expect(k).toEqual({ tp: devReport.micro.tp, fp: devReport.micro.fp, fn: devReport.micro.fn });
  });

  it("dev: every case is processed well under 5 ms on average", () => {
    expect(devReport.latency.meanMs).toBeLessThan(5);
  });
});
