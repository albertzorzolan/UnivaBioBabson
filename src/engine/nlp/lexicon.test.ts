import { describe, expect, it } from "vitest";
import { extractCheckIn } from "./extract";
import { EVAL_MEDS, EVAL_TODAY } from "./fixtures";

const others = (story: string) =>
  extractCheckIn(story, { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: ["Margaret"] })
    .otherSymptoms.filter((o) => o.present)
    .map((o) => o.conceptId)
    .sort();

describe("shaky: one word, one symptom", () => {
  it("codes 'felt shaky' as tremor only, not also as shakiness or sweating", () => {
    expect(others("I felt shaky this afternoon.")).toEqual(["tremor"]);
    expect(others("My hands have been shaky all day.")).toEqual(["tremor"]);
  });

  it("codes sweating from its own words alongside the tremor", () => {
    expect(others("Felt shaky and sweaty before lunch, better after a biscuit.")).toEqual(["shakiness_or_sweating", "tremor"]);
    expect(others("Woke up clammy.")).toEqual(["shakiness_or_sweating"]);
  });
});

const run = (story: string) => extractCheckIn(story, { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: ["Margaret"] });
const proposal = (story: string, field: string) => run(story).proposals.find((p) => p.field === field);

describe("vertigo idioms: the room going round", () => {
  it.each([
    "Room went round and round this morning.",
    "The room went round when I sat up in bed.",
    "Everything went round and round after I bent down.",
    "The world was going round and round at lunchtime.",
    "Everything kept going round for a minute.",
  ])("%s → dizziness, as said", (story) => {
    const p = proposal(story, "dizziness");
    expect(p?.value).toBe(true);
    expect(p?.certainty).toBe("explicit");
  });

  it.each([
    "We went round to my sister's for tea.",
    "The news went round the village.",
    "The room didn't go round today.",
    // Rumination, not vertigo: thoughts going round in her head.
    "Everything went round and round in my head, worrying about money.",
    "Everything went round in my head all night.",
    "The world went round and round in her mind.",
    // Figures of speech (integration review): none of these is vertigo.
    "Love makes the world go round.",
    "Money makes the world go round, as Dad used to say.",
    "Money makes the world go round, as they say.",
    "The world keeps going round, whatever happens.",
    "The world goes round and we carry on.",
    "Everything goes around smoothly when my daughter visits.",
    "Everything went round in circles at the GP.",
    "Everything goes round in circles with the surgery.",
    "Everything went round fine today.",
    "Everything went round smoothly at the party.",
    "The world went round as usual, nothing new.",
    "The world is going round as usual.",
  ])("not a spinning room: %s", (story) => {
    expect(proposal(story, "dizziness")?.value).not.toBe(true);
  });

  it("someone else's spinning room is not hers", () => {
    expect(proposal("My husband felt the room go round and round.", "dizziness")?.value).not.toBe(true);
  });
});

describe("urinary retention wording goes under 'Also mentioned' (no diary field for it)", () => {
  const urinary = (story: string) => run(story).otherSymptoms.find((o) => o.conceptId === "urinary_problem");

  it.each([
    "I couldn't pee properly today.",
    "Couldn't wee properly this morning.",
    "Had trouble passing water.",
    "It was hard to pee this afternoon.",
    "Struggling to pass water since lunch.",
  ])("%s → bladder problems", (story) => {
    const u = urinary(story);
    expect(u?.present).toBe(true);
    // Never a diary answer: the check-in form has no bladder question.
    expect(run(story).proposals).toEqual([]);
  });

  it("a denial is recorded as denied, never as present", () => {
    expect(urinary("No trouble passing water today.")?.present).toBe(false);
  });

  it("someone else's bladder trouble is not hers", () => {
    expect(urinary("My husband couldn't pee properly.")).toBeUndefined();
  });
});
