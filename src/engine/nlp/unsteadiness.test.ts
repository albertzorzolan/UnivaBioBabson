// Unsteadiness wording ("my legs felt wobbly", "a bit off balance", "unsteady on my feet").
// The annotation guide (eval/ANNOTATION-GUIDE.md) counts unsteadiness as dizziness only when it is due to dizziness
// ("unsteady because of dizziness"). Unsteadiness on its own can have other causes, and the diary has no unsteadiness
// question. So these wordings go beyond the guide: the engine offers them only as a low-confidence best guess
// ("please check") under the dizziness question, which the person confirms or rejects, never as an explicit answer.
// Being pushed or knocked off balance by something outside the body is blocked and proposes no dizziness.
import { describe, expect, it } from "vitest";
import { extractCheckIn } from "./extract";
import { EVAL_MEDS, EVAL_TODAY } from "./fixtures";

const run = (story: string) => extractCheckIn(story, { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: ["Margaret"] });
const dizziness = (story: string) => run(story).proposals.find((p) => p.field === "dizziness");

describe("unsteadiness wording becomes a please-check dizziness proposal", () => {
  it.each([
    "My legs felt wobbly this morning.",
    "Margaret's legs were wobbly getting out of the chair.",
    "My legs feel like jelly today.",
    "Legs felt unsteady after lunch.",
    "My legs were shaky on the stairs.",
    "Felt a bit off balance in the kitchen.",
    "I was off-balance most of the afternoon.",
    "Unsteady on my feet today.",
    "She was unsteady on her feet after her nap.",
  ])("%s", (story) => {
    const p = dizziness(story);
    expect(p).toBeDefined();
    expect(p!.value).toBe(true);
    expect(p!.certainty).toBe("inferred");
    expect(p!.reason).toContain("please check");
  });

  it("does not propose a near-fall or a fall from the feeling alone", () => {
    const fields = run("My legs felt wobbly this morning.").proposals.map((p) => p.field);
    expect(fields).not.toContain("nearFall");
    expect(fields).not.toContain("fall");
  });

  it("keeps 'legs felt shaky' coded as tremor as well", () => {
    const others = run("My legs felt shaky.").otherSymptoms.filter((o) => o.present).map((o) => o.conceptId);
    expect(others).toContain("tremor");
  });
});

describe("respects context", () => {
  it("proposes nothing when the unsteadiness is denied (a denied wobble is not a 'no' to dizziness)", () => {
    expect(dizziness("I wasn't off balance at all today.")).toBeUndefined();
    expect(dizziness("Not unsteady on my feet today.")).toBeUndefined();
  });

  it("proposes nothing for someone else, an earlier day or a worry", () => {
    expect(dizziness("My husband's legs felt wobbly.")).toBeUndefined();
    expect(dizziness("My legs felt wobbly last week.")).toBeUndefined();
    expect(dizziness("I'm worried I'll be unsteady on my feet if I walk to the shop.")).toBeUndefined();
  });

  it("an explicit dizziness statement wins over the guess", () => {
    const yes = dizziness("Dizzy this morning and my legs felt wobbly.");
    expect(yes?.value).toBe(true);
    expect(yes?.certainty).toBe("explicit");
    const no = dizziness("No dizziness, but my legs felt like jelly.");
    expect(no?.value).toBe(false);
    expect(no?.certainty).toBe("explicit");
  });

  it.each([
    "The dog knocked me off balance and I fell.",
    "Someone bumped me off balance in the queue.",
    "The bus braking threw me off balance.",
    "A gust of wind pushed me off-balance by the gate.",
  ])("an outside push is not a dizziness guess: %s", (story) => {
    expect(dizziness(story)).toBeUndefined();
  });

  it("a fall after being knocked off balance is still a fall", () => {
    const fall = run("The dog knocked me off balance and I fell.").proposals.find((p) => p.field === "fall");
    expect(fall?.value).toBe(true);
  });

  it("'off my balance' with a stumble still reads as a near-fall, not dizziness", () => {
    const fields = run("I was knocked off my balance and nearly fell.").proposals.map((p) => p.field);
    expect(fields).toContain("nearFall");
  });
});
