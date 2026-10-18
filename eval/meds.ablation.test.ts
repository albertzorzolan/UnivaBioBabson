// Ablations of the medication-review engine: does the case suite (eval/med-cases.json) actually fail when a piece
// of clinical knowledge is removed? Each stub in eval/ablations/ is the production engine over a knowledge base with
// one thing taken out (or, for the control, the medication list reversed). The same case runner as
// eval/meds.eval.test.ts (eval/medsRunner.ts) scores every stub.
//
// Run: npx vitest run eval/meds.ablation.test.ts. Results: eval/results/meds-ablation.json
// (passed/total = cases, expectationsPassed/expectationsTotal = individual expectations).
// The bands asserted below are loose on purpose: they check that each removal breaks something and that the
// production engine and the control still pass, not the exact counts (those are in the results file).

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { writeResultsIfChanged } from "./writeResults";
import { PRODUCTION_NORMALIZE_MODULE, PRODUCTION_REVIEW_MODULE, loadCaseFile, loadEngine, runAllCases, type SuiteTally } from "./medsRunner";

const RESULTS_PATH = fileURLToPath(new URL("./results/meds-ablation.json", import.meta.url));

/** The stubs, in the order the docs list them. reversed-order is a control (nothing removed). */
const ABLATIONS = ["reversed-order.ts", "no-falls-rule.ts", "no-cascades.ts", "acb-zero.ts"] as const;
const CONTROLS = ["production", "reversed-order"];
const REMOVALS = ["no-falls-rule", "no-cascades", "acb-zero"];

interface Run extends SuiteTally {
  name: string;
  description: string;
}

async function runStub(name: string, description: string, reviewModule: string): Promise<Run> {
  const loaded = await loadEngine(PRODUCTION_NORMALIZE_MODULE, reviewModule);
  if (!loaded.engine) throw new Error(`${name}: ${loaded.problems.join("; ")}`);
  return { name, description, ...runAllCases(cases, loaded.engine) };
}

const caseFile = loadCaseFile();
if (!caseFile.file) throw new Error(`eval/med-cases.json is invalid: ${caseFile.problems.join("; ")}`);
const cases = caseFile.file.cases;

const runs: Run[] = [await runStub("production", "None (production engine and knowledge base)", PRODUCTION_REVIEW_MODULE)];
for (const file of ABLATIONS) {
  const href = new URL(`./ablations/${file}`, import.meta.url).href;
  const mod = (await import(/* @vite-ignore */ href)) as { ABLATION: { name: string; description: string } };
  runs.push(await runStub(mod.ABLATION.name, mod.ABLATION.description, href));
}
const byName = new Map(runs.map((r) => [r.name, r]));

describe("medication-review ablations (eval/ablations/*.ts)", () => {
  it("writes eval/results/meds-ablation.json", () => {
    for (const r of runs) {
      console.log(
        `${r.name.padEnd(16)} ${r.casesPassed}/${r.cases} cases, ${r.expectationsPassed}/${r.expectations} expectations` +
          (r.failedCases.length ? `  failed: ${r.failedCases.join(", ")}` : ""),
      );
    }
    writeResultsIfChanged(RESULTS_PATH, {
      generatedAt: process.env.EVAL_TIMESTAMP ?? new Date().toISOString(),
      method:
        "eval/meds.ablation.test.ts: every case in eval/med-cases.json scored by the eval/medsRunner.ts case runner against the " +
        "production engine and against stub engines (eval/ablations/*.ts) that remove one piece of knowledge from the knowledge base. " +
        "passed/total count cases (a case passes when all its expectations pass).",
      caseFileVersion: caseFile.file?.version ?? null,
      runs: runs.map((r) => ({
        name: r.name,
        description: r.description,
        passed: r.casesPassed,
        total: r.cases,
        expectationsPassed: r.expectationsPassed,
        expectationsTotal: r.expectations,
        failedCases: r.failedCases,
      })),
    });
  });

  it("the production engine and the reversed-order control pass every case", () => {
    for (const name of CONTROLS) {
      const r = byName.get(name)!;
      expect(r.casesPassed, `${name}: ${r.failedCases.join(", ")}`).toBe(r.cases);
    }
  });

  it("each removal makes at least one case fail (the suite can fail)", () => {
    for (const name of REMOVALS) {
      const r = byName.get(name)!;
      expect(r.casesPassed, name).toBeLessThan(r.cases);
      expect(r.expectationsPassed, name).toBeLessThan(r.expectations);
    }
  });
});
