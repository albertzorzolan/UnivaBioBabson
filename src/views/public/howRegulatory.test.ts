// How it works › the FDA bullets say no more than docs/REGULATORY.md: Kinwise is designed toward FDA's published
// examples (Appendix A #12–13; Appendix B #18), it has not been reviewed, and enforcement discretion is not an exemption.
// Read from the component source (the strings are props of a client-only view).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const flat = (s: string) => s.replace(/\s+/g, " ");
const src = flat(readFileSync(new URL("./HowItWorks.tsx", import.meta.url), "utf8"));
const doc = flat(readFileSync(new URL("../../../docs/REGULATORY.md", import.meta.url), "utf8"));

describe("How it works regulatory wording", () => {
  it("says the records and communication functions are designed to fit Appendix A #12–13, not that they match", () => {
    expect(src).toContain("are designed to fit FDA’s examples of software that is not a medical device (Appendix A, #12–13)");
    expect(src).not.toContain("match FDA’s examples");
    expect(doc).toContain("Appendix A #12: simple tools to organize and record health information");
    expect(doc).toContain("#13 (help patients document and communicate to health care professionals)");
  });

  it("says the medication report sits closest to Appendix B #18, enforcement discretion and not an exemption", () => {
    expect(src).toContain("sits closest to FDA’s Appendix B example #18 (enforcement discretion, not an exemption)");
    expect(src).not.toContain("is FDA’s Appendix B example #18");
    expect(doc).toContain("enforcement discretion is a statement of FDA's current intent, not an exemption");
  });
});
