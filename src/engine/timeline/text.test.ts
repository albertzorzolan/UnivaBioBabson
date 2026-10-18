// medName: a family-typed medicine name becomes one safe line inside a code-rendered sentence.
import { describe, expect, it } from "vitest";
import { MAX_MED_NAME_LENGTH, medName } from "./text";
import { makeMed } from "./test-fixtures";

const named = (name: string) => makeMed("m1", name, "2025-09-01");

describe("medName", () => {
  it("collapses control characters, bidi overrides/isolates and newlines to one space", () => {
    expect(medName(named("Amlo\u202Edipine"))).toBe("Amlo dipine"); // right-to-left override
    expect(medName(named("\u2066Lisinopril\u2069 10 mg"))).toBe("Lisinopril 10 mg"); // left-to-right isolate pair
    expect(medName(named("Metformin\u202A\u202B\u202C\u202D"))).toBe("Metformin");
    expect(medName(named("Aspirin\n\u0007\u0085 81"))).toBe("Aspirin 81"); // newline, BEL, C1 NEL
  });

  it("leaves ordinary accented and curly-quote text alone", () => {
    expect(medName(named("Tylenol\u00AE Extra \u2019Strength\u2019"))).toBe("Tylenol\u00AE Extra \u2019Strength\u2019");
  });

  it("reads 'this medicine' for a blank or invisible-only name, and shortens long names", () => {
    expect(medName(undefined)).toBe("this medicine");
    expect(medName(named(" \u202E\u2066 "))).toBe("this medicine");
    const long = medName(named("x".repeat(100)));
    expect(Array.from(long)).toHaveLength(MAX_MED_NAME_LENGTH);
    expect(long.endsWith("\u2026")).toBe(true);
  });
});
