// The Welcome proof strip must quote the committed evaluation results exactly.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HELDOUT_BASELINE_F1, PROOF_POINTS } from "./proofPoints";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../eval/results/${p}`, import.meta.url), "utf8"));

describe("Welcome proof strip", () => {
  it("quotes the held-out NLP result and the medication-review suite from eval/results", () => {
    const nlp = read("nlp-eval.json");
    const meds = read("meds-eval.json");
    const [f1, med, device] = PROOF_POINTS;
    expect(f1.figure).toBe(`${Math.round(nlp.heldout.micro.f1 * 100)}% F1`);
    expect(f1.label).toContain(`${nlp.heldout.cases} held-out`);
    expect(med.figure).toBe(`${meds.summary.casesPassed}/${meds.summary.cases}`);
    expect(device.label).not.toMatch(/ms\b/);
  });

  it("states the privacy promise precisely (the app itself is served by GitHub Pages; model files are downloaded)", () => {
    const device = PROOF_POINTS.find((p) => p.key === "device")!;
    expect(device.label).toBe("Your records never leave this device.");
    expect(device.label).not.toMatch(/nothing is sent anywhere/i);
  });

  it("exposes the lexicon-only baseline when the results file has one (null otherwise, never a made-up number)", () => {
    const nlp = read("nlp-eval.json");
    expect(HELDOUT_BASELINE_F1).toBe(nlp.heldout?.baseline?.micro?.f1 ?? null);
  });

  it("never uses banned health words", () => {
    for (const p of PROOF_POINTS) expect(`${p.figure} ${p.label}`).not.toMatch(/caus|\bsafe|danger|urgent|diagnos|risk score/i);
  });
});
