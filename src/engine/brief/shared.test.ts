// oneLine / quotable: user text placed in the brief stays on one visible line.
import { describe, expect, it } from "vitest";
import { oneLine, quotable } from "./shared";

describe("oneLine", () => {
  it("collapses control characters, bidi overrides/isolates and whitespace runs to one space", () => {
    expect(oneLine("Alex\u202E (daughter)")).toBe("Alex (daughter)");
    expect(oneLine("\u2067Rosa\u2069\n\tMartinez")).toBe("Rosa Martinez");
    expect(oneLine("a\u0000b\u009Fc\u202Ad")).toBe("a b c d");
  });

  it("keeps visible text, including zero-width-free emoji and accents, unchanged", () => {
    expect(oneLine("Jos\u00E9 \u{1F44D}")).toBe("Jos\u00E9 \u{1F44D}");
  });
});

describe("quotable", () => {
  it("turns inner double quotes into single quotes on one line", () => {
    expect(quotable('He said "dizzy"\nafter \u201Cthe new pill\u201D')).toBe("He said 'dizzy' after 'the new pill'");
  });
});
