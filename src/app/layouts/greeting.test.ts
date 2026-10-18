// Patient greeting words (src/app/layouts/greeting.ts): an emptied record ("Delete everything") has no names, and
// the patient screens must not print a placeholder as if it were one.
import { describe, expect, it } from "vitest";
import { helloLine, readyLine } from "./greeting";

describe("patient greeting", () => {
  it("greets by the preferred name", () => {
    expect(helloLine("Margaret")).toBe("Hello, Margaret");
    expect(readyLine(0, "Margaret")).toBe("Whenever you’re ready, Margaret — a few words are enough.");
  });

  it("says plain words when there is no name", () => {
    expect(helloLine("")).toBe("Hello");
    expect(helloLine("   ")).toBe("Hello");
    expect(readyLine(0, "")).toBe("Whenever you’re ready — a few words are enough.");
  });

  it("thanks her for the days she checked in", () => {
    expect(readyLine(3, "")).toBe("You’ve checked in on 3 of the last 7 days — thank you.");
    expect(readyLine(1, "Margaret")).toBe("You’ve checked in on 1 of the last 7 days — thank you.");
  });
});
