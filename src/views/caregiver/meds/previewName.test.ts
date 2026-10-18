// Name used in the live review preview's prompt titles (src/views/caregiver/meds/previewName.ts).
import { describe, expect, it } from "vitest";
import { matchDrug } from "../../../kb";
import { previewName } from "./previewName";

const name = (typed: string) => previewName(typed, matchDrug(typed));

describe("previewName", () => {
  it("uses the reference-list name once the match is confident", () => {
    expect(name("tylenol pm")).toBe("Tylenol PM");
    expect(name("advil pm")).toBe("Advil PM");
    expect(name("Advil PM")).toBe("Advil PM");
    expect(name("ativan")).toBe("Ativan");
    expect(name("lorazepam 0.5 mg")).toBe("Lorazepam");
    expect(name("hydrocodone/acetaminophen")).toBe("Hydrocodone + acetaminophen");
  });

  it("uses the suggested spelling for a 'Did you mean' match", () => {
    expect(name("benadril")).toBe("Diphenhydramine");
    expect(name("Gabapentn")).toBe("Gabapentin");
  });

  it("title-cases a lowercase name that is matched but has no exact label", () => {
    expect(name("tylenol pm with")).toBe("Tylenol PM With");
  });

  it("title-cases an unmatched lowercase name and keeps deliberate capitals", () => {
    expect(name("zorblaxin")).toBe("Zorblaxin");
    expect(name("zorblaxin pm")).toBe("Zorblaxin PM");
    expect(name("CoQ10")).toBe("CoQ10");
  });

  it("returns an empty string for an empty name", () => {
    expect(name("   ")).toBe("");
  });
});
