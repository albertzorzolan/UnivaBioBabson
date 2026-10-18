// How it works › copy that judges read about the benchmarks: who wrote the stories and cases, and what 57/57 means.
// Read from the component source (the strings are props of a client-only view).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./HowItWorks.tsx", import.meta.url), "utf8");

describe("How it works benchmark provenance", () => {
  it("says the diary stories were written by separate AI agents with gold labels (not “hand” labels)", () => {
    expect(src).toContain(
      "Hundreds of fictional check-in stories written by separate AI agents directed by the team, with gold labels that follow our annotation guide, including negations, other people’s falls, past events and “what ifs”.",
    );
    expect(src).not.toMatch(/labelled\s+by\s+hand|hand-?\s?labelled/);
  });

  it("says the medication cases are not a blind test (eval/MED-CASES-METHOD.md)", () => {
    expect(src).toContain(
      "Test cases written from the published criteria (AGS Beers 2023, ACB, STEADI/STOPPFall, ThinkCascades, STOPP/START) by a separate AI agent, directed by the team, that did not read the engine code; not clinician-reviewed. The case file was available while the engine was built, so 57/57 shows the code meets a written spec, not a blind test.",
    );
    // Both benchmarks name their authors the same way (eval/MED-CASES-METHOD.md; med-cases.json "author").
    const subtitle = src.match(/subtitle="(Test cases written from the published criteria[^"]*)"/)?.[1] ?? "";
    expect(subtitle).toContain("AI agent");
    expect(subtitle).toContain("not clinician-reviewed");
    expect(src).not.toContain("by an author who did not read the engine");
    const method = readFileSync(new URL("../../../eval/MED-CASES-METHOD.md", import.meta.url), "utf8");
    expect(method).toMatch(/It is not a blind test/);
  });

  it("describes the held-out set as written separately, never 'independently' (docs/EVALUATION.md)", () => {
    expect(src).not.toContain("written independently");
    expect(src).toContain("stories written separately from the dev set, never used for tuning");
  });

  it("scorecards print rates recomputed from tp/fp/fn (as facts.mjs does), not the evaluator's rounded ones", () => {
    expect(src).toContain("microRates(r.micro)");
    expect(src).not.toMatch(/fmt\(r\.micro\.(precision|recall|f1)\)/);
  });

  it("explains why the recorded verdict names three escapes while the panel lists six sentences", () => {
    // JSX wraps long text across lines and marks the file path as code, so compare the text without either.
    expect(src.replace(/<\/?code>/g, "").replace(/\s+/g, " ")).toContain(
      "The verdict named three; a later read of the same log for the red-team set found three more sentences (eval/verifier-redteam.json live-04 to live-06), which are listed above.",
    );
  });

  it("puts the held-out scorecard first and marks it for the tour", () => {
    const held = src.indexOf('title="Held-out set"');
    const dev = src.indexOf('title="Development set"');
    expect(held).toBeGreaterThan(-1);
    expect(dev).toBeGreaterThan(held);
    expect(src).toContain('tour="how-eval-heldout"');
  });

  it("never promises records never leave the device, and has no ESLint directives (there is no ESLint)", () => {
    expect(src).not.toMatch(/never\s+leave/);
    expect(src).not.toMatch(/eslint-disable/);
  });

  it("renders the AI draft hint (howContent.ts) in the recorded-run section", () => {
    expect(src).toMatch(/import \{[^}]*\bAI_DRAFT_HINT\b[^}]*\} from "\.\/howContent"/);
    const run = src.slice(src.indexOf("function ModelRun()"), src.indexOf("function ModelRun()") + 4000);
    expect(run).toContain("{AI_DRAFT_HINT}");
  });
});
