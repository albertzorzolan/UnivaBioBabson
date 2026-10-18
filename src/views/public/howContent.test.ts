// How it works › the problem and "Who it's for": quoted research must match the cited sources' wording.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FLOW_STEPS, PROBLEM_STATS, WHO_FOR } from "./howContent";

const statText = (value: string) => {
  const s = PROBLEM_STATS.find((p) => p.value === value);
  return s ? `${s.value} ${s.text}` : "";
};

describe("problem section", () => {
  it("quotes Gandhi 2003 as attributions, in percentages only (the counts were never checked against the abstract)", () => {
    expect(statText("37%")).toMatch(/^37% of medication side effects .*were attributed to the patient not telling the doctor about the symptom/);
    expect(statText("63%")).toMatch(/^63% to medication-related symptoms not being acted on/);
    expect(PROBLEM_STATS.map((s) => s.text).join(" ")).not.toMatch(/of 51/);
    expect(PROBLEM_STATS.map((s) => s.text).join(" ")).not.toMatch(/persisted because/);
  });

  it("keeps the canonical trio: polypharmacy (NCHS), Gandhi and CDC falls", () => {
    const sources = PROBLEM_STATS.map((s) => s.source.short);
    expect(sources.some((s) => /NCHS/.test(s))).toBe(true);
    expect(sources.some((s) => /Gandhi/.test(s))).toBe(true);
    expect(sources.some((s) => /CDC/.test(s))).toBe(true);
    expect(statText("43%")).toMatch(/five or more prescription/);
  });

  it("explains the product in three steps", () => {
    expect(FLOW_STEPS).toHaveLength(3);
  });
});

describe("who it's for", () => {
  const all = WHO_FOR.map((w) => `${w.label}: ${w.text}`).join("\n");

  it("names the caregiver, the older adult and the visits it prepares for", () => {
    expect(all).toMatch(/caregiver/i);
    expect(all).toMatch(/older adult/i);
    expect(all).toMatch(/Annual Wellness Visit/);
    expect(all).toMatch(/pharmacist/i);
  });

  it("states EMPOWER as kb-src/research/regulatory.md records it, as a reason to test, not proof", () => {
    const research = readFileSync(new URL("../../../kb-src/research/regulatory.md", import.meta.url), "utf8");
    expect(research).toMatch(/EMPOWER.*cluster RCT, n=303.*direct-to-patient.*27% vs 5% discontinuation\*\* at 6 months/s);
    const line = WHO_FOR.find((w) => /EMPOWER/.test(w.text))!.text;
    expect(line).toMatch(/cluster RCT, n=303/);
    expect(line).toMatch(/direct-to-patient educational brochure/);
    expect(line).toMatch(/27% vs 5% benzodiazepine discontinuation at 6 months/);
    expect(line).toMatch(/a reason to test Kinwise, not proof/);
  });

  it("says the EMPOWER brochure included a taper plan, which Kinwise leaves to the clinician (as DEVPOST and REGULATORY do)", () => {
    const line = WHO_FOR.find((w) => /EMPOWER/.test(w.text))!.text;
    expect(line).toMatch(/included a taper plan, which Kinwise leaves to the clinician/);
    const regulatory = readFileSync(new URL("../../../docs/REGULATORY.md", import.meta.url), "utf8");
    expect(regulatory).toMatch(/EMPOWER; the booklet included a stepwise taper plan/);
  });

  it("describes moving between devices the way Settings works today (import replaces the record)", () => {
    const line = WHO_FOR.find((w) => /device/i.test(w.label))!.text;
    expect(line).toMatch(/one shared browser/i);
    expect(line).toMatch(/backup/);
    expect(line).toMatch(/replaces the record/);
    const settings = readFileSync(new URL("../caregiver/Settings.tsx", import.meta.url), "utf8");
    expect(settings).toMatch(/Import and replace/);
  });
});
