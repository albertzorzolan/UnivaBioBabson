import { describe, expect, it } from "vitest";
import { EMERGENCY_LINE, SAFETY_NET_FOR_ANYONE, safetyNetLine } from "./safetyNet";
import { buildEvidence } from "./evidence";
import { verifySentence } from "./verify";
import { BANNED_IN_TEMPLATE, FAKE_KB, FROM, TODAY, margaret } from "./test-fixtures";

const W = margaret();
const pkg = buildEvidence({ data: W.data, from: FROM, to: TODAY, review: W.review, timeline: W.timeline, kb: FAKE_KB });

describe("safetyNetLine", () => {
  it("names the person's doctor or pharmacist and the three reasons to call, then the static 911 sentence", () => {
    expect(safetyNetLine("Margaret")).toBe(
      "You don't have to wait for the visit: Margaret's doctor or pharmacist can be contacted at any time about a fall, a new medicine or new confusion. " +
        "Sudden confusion, a fall with a head injury, or trouble breathing can be an emergency: call 911.",
    );
  });

  it("separates sudden confusion (possible delirium) from new confusion with one static 911 sentence", () => {
    expect(EMERGENCY_LINE).toBe("Sudden confusion, a fall with a head injury, or trouble breathing can be an emergency: call 911.");
    // Static: the same words for every person, never built from the record.
    for (const line of [safetyNetLine("Margaret"), safetyNetLine(""), safetyNetLine("Someone Else")]) {
      expect(line.endsWith(` ${EMERGENCY_LINE}`)).toBe(true);
    }
    // The Help dialog's copy is the routine part only: its 911 row already shows EMERGENCY_LINE (src/app/Help.tsx).
    expect(SAFETY_NET_FOR_ANYONE).not.toContain(EMERGENCY_LINE);
    expect(SAFETY_NET_FOR_ANYONE.endsWith("a new medicine or new confusion.")).toBe(true);
    // "can be an emergency", never "is": it names when to call, it does not judge anyone's symptoms.
    expect(EMERGENCY_LINE).not.toMatch(/\b(is an emergency|urgent|urgently|immediately|right away|stop|start|change|cause\w*|safe)\b/i);
  });

  it("says 'your relative' (lower case) when the name is empty or blank", () => {
    expect(safetyNetLine("")).toContain(": your relative's doctor or pharmacist");
    expect(safetyNetLine("   ")).toBe(safetyNetLine(""));
    expect(SAFETY_NET_FOR_ANYONE).toContain(": the doctor or pharmacist can be contacted at any time");
  });

  it("is static: never triage words, never an instruction about medicines", () => {
    for (const line of [safetyNetLine("Margaret"), safetyNetLine(""), SAFETY_NET_FOR_ANYONE]) {
      // The routine part: "emergency" belongs only to the static 911 sentence checked above.
      const routine = line.endsWith(EMERGENCY_LINE) ? line.slice(0, line.length - EMERGENCY_LINE.length) : line;
      expect(routine).not.toMatch(/\b(urgent|urgently|immediately|right away|emergency|stop|start|change)\b/i);
      expect(line).not.toMatch(/\b(urgent|urgently|immediately|right away|stop|start|change)\b/i);
      for (const re of BANNED_IN_TEMPLATE) expect(re.test(line), `${re} in: ${line}`).toBe(false);
    }
  });

  it("passes the same claim checker as every brief sentence (it states no numbers, dates or causes)", () => {
    // The routine part only. EMERGENCY_LINE, like SAFETY_LINE ("… call 911."), is fixed code-written text: the checker
    // rightly rejects "emergency" and "call 911" in a sentence about the record, which is why they live here instead.
    for (const line of [safetyNetLine("Margaret"), safetyNetLine(""), SAFETY_NET_FOR_ANYONE]) {
      const text = (line.endsWith(EMERGENCY_LINE) ? line.slice(0, line.length - EMERGENCY_LINE.length) : line).trim();
      const res = verifySentence({ text, evidenceIds: [] }, pkg, { medNames: W.data.medications.map((m) => m.name), patientNames: ["Margaret"], requireEvidence: false });
      expect(res.issues, text).toEqual([]);
    }
  });
});
