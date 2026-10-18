import { describe, expect, it } from "vitest";
import { repeatsRecords } from "./askDraft";

// The records answer the on-device model repeated word for word in the runtime audit
// (tmp/judge-kit/runtime/local-ai-ask.txt, "How has her sleep been since the lorazepam started?").
const sleep =
  "Sleep quality ratings averaged 3.4 out of 5 on 14 answered days from Oct 1, when Lorazepam (Ativan) was started, through Oct 17, compared with 2.6 out of 5 on 20 answered days in the 21 days before.";

describe("repeatsRecords", () => {
  it("is true for a character-identical draft", () => {
    expect(repeatsRecords([{ text: sleep }], [{ text: sleep }])).toBe(true);
  });

  it("ignores case, spacing and punctuation", () => {
    const loose = sleep.toUpperCase().replace(/,/g, "").replace(/ /g, "  ");
    expect(repeatsRecords([{ text: loose }], [{ text: sleep }])).toBe(true);
  });

  it("is true when the draft only repeats some of the answer's sentences", () => {
    const records = [{ text: "Dizziness was recorded on 2 of 5 answered days." }, { text: "In Margaret's words on Oct 6: the room was spinning." }];
    expect(repeatsRecords([records[1]], records)).toBe(true);
  });

  it("is true for an empty draft", () => {
    expect(repeatsRecords([], [{ text: sleep }])).toBe(true);
  });

  it("is false for a reworded draft (the demo's near-falls answer)", () => {
    const records = [{ text: "Near-falls were recorded on 2 of 14 answered days since lorazepam started, compared with 1 of 20 answered days before." }];
    const draft = [{ text: "2 near-falls were recorded on 14 answered days since Sep 25, compared with 1 near-fall on 20 answered days before." }];
    expect(repeatsRecords(draft, records)).toBe(false);
  });
});
