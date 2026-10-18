import { describe, expect, it } from "vitest";
import { ALREADY_PLAIN, DRAFT_FAILED_CHECK, NOTHING_PLAINER, emptyDraftNote, leadWith, modelRan, repeatsRecords } from "./askDraft";

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

describe("emptyDraftNote", () => {
  // aiAnswer's report when it ran the model, and the empty one it returns when there was nothing to send.
  const ran = { raw: '{"answer":[]}', ms: 4200, evidenceShown: ["fact:count:dizziness"] };
  const skipped = { raw: "", ms: 0, evidenceShown: [] };

  it("says the model checked the answer only when it actually ran", () => {
    expect(modelRan(ran)).toBe(true);
    expect(emptyDraftNote(ran)).toBe(NOTHING_PLAINER);
    expect(NOTHING_PLAINER).toBe("The on-device AI checked this answer and had nothing plainer to add.");
  });

  it("says the draft failed the check when the model wrote sentences and the check removed all of them", () => {
    expect(emptyDraftNote(ran, 2, 0)).toBe(DRAFT_FAILED_CHECK);
    expect(DRAFT_FAILED_CHECK).toBe("The on-device AI's draft didn't pass the records check, so only the records answer is shown.");
    // Some sentences passed but only repeated the records answer: nothing plainer to add.
    expect(emptyDraftNote(ran, 1, 2)).toBe(NOTHING_PLAINER);
    expect(emptyDraftNote(ran, 0, 0)).toBe(NOTHING_PLAINER);
    expect(emptyDraftNote(skipped, 3, 0)).toBe(ALREADY_PLAIN);
  });

  it("keeps the neutral line when the model was never asked", () => {
    expect(modelRan(skipped)).toBe(false);
    expect(emptyDraftNote(skipped)).toBe(ALREADY_PLAIN);
  });
});

describe("leadWith", () => {
  it("puts the demo question first and keeps the rest in order", () => {
    const qs = ["When did the dizziness start?", "How many near-falls since lorazepam started?", "Which medicines are on the Beers list?"];
    expect(leadWith(qs, "How many near-falls since lorazepam started?")).toEqual([
      "How many near-falls since lorazepam started?",
      "When did the dizziness start?",
      "Which medicines are on the Beers list?",
    ]);
  });

  it("leaves the list unchanged when the lead question is not in it", () => {
    expect(leadWith(["a", "b"], "c")).toEqual(["a", "b"]);
  });
});
