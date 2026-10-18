import { describe, expect, it } from "vitest";
import { SAFETY_NET_FOR_ANYONE, safetyNetLine } from "./safetyNet";
import { buildEvidence } from "./evidence";
import { verifySentence } from "./verify";
import { BANNED_IN_TEMPLATE, FAKE_KB, FROM, TODAY, margaret } from "./test-fixtures";

const W = margaret();
const pkg = buildEvidence({ data: W.data, from: FROM, to: TODAY, review: W.review, timeline: W.timeline, kb: FAKE_KB });

describe("safetyNetLine", () => {
  it("names the person's doctor or pharmacist and the three reasons to call", () => {
    expect(safetyNetLine("Margaret")).toBe(
      "You don't have to wait for the visit: Margaret's doctor or pharmacist can be contacted at any time about a fall, a new medicine or new confusion.",
    );
  });

  it("says 'your relative' (lower case) when the name is empty or blank", () => {
    expect(safetyNetLine("")).toContain(": your relative's doctor or pharmacist");
    expect(safetyNetLine("   ")).toBe(safetyNetLine(""));
    expect(SAFETY_NET_FOR_ANYONE).toContain(": the doctor or pharmacist can be contacted at any time");
  });

  it("is static: never triage words, never an instruction about medicines", () => {
    for (const line of [safetyNetLine("Margaret"), safetyNetLine(""), SAFETY_NET_FOR_ANYONE]) {
      expect(line).not.toMatch(/\b(urgent|urgently|immediately|right away|emergency|stop|start|change)\b/i);
      for (const re of BANNED_IN_TEMPLATE) expect(re.test(line), `${re} in: ${line}`).toBe(false);
    }
  });

  it("passes the same claim checker as every brief sentence (it states no numbers, dates or causes)", () => {
    for (const text of [safetyNetLine("Margaret"), safetyNetLine(""), SAFETY_NET_FOR_ANYONE]) {
      const res = verifySentence({ text, evidenceIds: [] }, pkg, { medNames: W.data.medications.map((m) => m.name), patientNames: ["Margaret"], requireEvidence: false });
      expect(res.issues, text).toEqual([]);
    }
  });
});
