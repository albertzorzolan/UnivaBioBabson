// personWords: the words the caregiver screens use for the person being cared for, with and without a name.
// After "Delete everything" the profile names are empty strings; no screen may then say "They takes",
// "Everything They takes", "The’s records" or put a capitalised "Your family member" mid-sentence.
import { describe, expect, it } from "vitest";
import { personWords } from "./personWords";

const empty = { preferredName: "", displayName: "", sex: null };

describe("personWords", () => {
  it("uses the preferred name when there is one", () => {
    const w = personWords({ preferredName: "Margaret", displayName: "Margaret Rivera", sex: "female" });
    expect(w).toMatchObject({
      hasName: true,
      name: "Margaret",
      Name: "Margaret",
      possessive: "Margaret’s",
      Possessive: "Margaret’s",
      takes: "Margaret takes",
      their: "her",
    });
  });

  it("falls back to the display name, trimmed", () => {
    const w = personWords({ preferredName: "  ", displayName: " Margaret Rivera ", sex: null });
    expect(w.hasName).toBe(true);
    expect(w.name).toBe("Margaret Rivera");
    expect(w.takes).toBe("Margaret Rivera takes");
  });

  it("gives grammatical fallbacks for an empty profile", () => {
    const w = personWords(empty);
    expect(w).toEqual({
      hasName: false,
      name: "your family member",
      Name: "Your family member",
      possessive: "their",
      Possessive: "Your family member’s",
      takes: "they take",
      their: "their",
    });
  });

  it("reads well in the sentences the screens build", () => {
    const w = personWords(empty);
    const lines = [
      `Everything ${w.takes}, including over-the-counter products.`,
      `From ${w.possessive} check-ins and published medicine criteria. Questions, not conclusions.`,
      `${w.Possessive} last 30 days at a glance`,
      `${w.Possessive} records changed since this brief was built`,
      `When ${w.name} saves ${w.their} first daily check-in, each day will appear here.`,
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/They takes|they takes|The’s|\bthe’s/);
      // A capitalised fallback only ever starts a sentence.
      expect(line.slice(1)).not.toMatch(/Your family member/);
    }
    expect(lines[0]).toBe("Everything they take, including over-the-counter products.");
  });

  it("picks the pronoun from the recorded sex, never from the name", () => {
    expect(personWords({ ...empty, sex: "female" }).their).toBe("her");
    expect(personWords({ ...empty, sex: "male" }).their).toBe("his");
    expect(personWords({ ...empty, sex: "other" }).their).toBe("their");
    expect(personWords({ preferredName: "Sam", displayName: "", sex: null }).their).toBe("their");
  });
});
