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

describe("more unsteadiness wordings (judge probes): a please-check guess, never an explicit answer", () => {
  it.each([
    "Felt a bit wobbly on the stairs this morning.",
    "Felt fine. Bit wobbly on my pins first thing though.",
    "Bit wobbly first thing.",
    "Wobbly on my feet this afternoon.",
    "I've been so unsteady since the new pill, had to hold the wall.",
    "Unsteady today.",
    "Had to hold on to the furniture to get round the house.",
    "Had to hold the rail all the way down the stairs.",
    "Kept having to hold onto the wall in the hallway.",
  ])("%s", (story) => {
    const p = dizziness(story);
    expect(p?.value).toBe(true);
    expect(p?.certainty).toBe("inferred");
    expect(p?.reason).toContain("please check");
  });

  it.each(["Bit wobbly on my pins", "Felt a bit wobbly on the stairs"])("the tantrum blocker leaves '%s' a guess", (story) => {
    expect(dizziness(story)?.certainty).toBe("inferred");
  });

  it("a guess carries no severity ('a bit wobbly' says nothing about how dizzy)", () => {
    expect(run("Felt a bit wobbly on the stairs.").proposals.find((p) => p.field === "dizzinessSeverity")).toBeUndefined();
  });

  it.each([
    "Was not unsteady at all today.",
    "Not wobbly at all today.",
    "Never unsteady once today.",
    "Didn't have to hold the wall today.",
  ])("a denial never becomes a yes: %s", (story) => {
    expect(dizziness(story)?.value).not.toBe(true);
  });

  it.each([
    "The kitchen table is wobbly.",
    "Got a wobbly tooth at the back.",
    "The ladder was unsteady so I left it.",
    "My hands were unsteady doing up buttons.",
    "I'll hold the rail in case I'm wobbly.",
    // British idiom: "throw / have a wobbly" is a tantrum or emotional outburst, not unsteadiness.
    "She threw a wobbly at dinner.",
    "Mum threw a wobbly when I took her keys.",
    "Mum threw a wobbly this morning.",
    "Typing for Mum: she threw a wobbly at lunch.",
    "I threw a wobbly at the pharmacist.",
    "Had a wobbly at the GP, burst into tears.",
    "Bit wobbly emotionally after the funeral.",
  ])("not her own unsteadiness today: %s", (story) => {
    expect(dizziness(story)).toBeUndefined();
  });

  it("'lost my balance' stays a near-fall, not also a dizziness guess (no double count)", () => {
    const r = run("Lost my balance in the hallway.");
    expect(r.proposals.find((p) => p.field === "nearFall")?.value).toBe(true);
    expect(r.proposals.find((p) => p.field === "dizziness")).toBeUndefined();
  });

  it("holding on to stop a fall is a near-fall, not also a dizziness guess", () => {
    const r = run("Had to grab the counter to stop myself falling.");
    expect(r.proposals.find((p) => p.field === "nearFall")?.value).toBe(true);
    expect(r.proposals.find((p) => p.field === "dizziness")).toBeUndefined();
  });
});

describe("a guess next to a near-fall or fall is part of that event", () => {
  it.each([
    "Nearly went over in the kitchen, had to grab the counter.",
    "Nearly fell on the stairs, had to hold the rail.",
    "Felt wobbly and nearly fell in the garden.",
  ])("%s → near-fall only", (story) => {
    const r = run(story);
    expect(r.proposals.find((p) => p.field === "nearFall")?.value).toBe(true);
    expect(r.proposals.find((p) => p.field === "dizziness")).toBeUndefined();
  });

  it("an explicit 'dizzy' in the same sentence is still a dizziness answer", () => {
    const r = run("Very wobbly and dizzy after the new pill, nearly went down twice.");
    expect(r.proposals.find((p) => p.field === "dizziness")?.certainty).toBe("explicit");
  });
});

it("unsteady weather is not unsteadiness", () => {
  expect(dizziness("Unsteady weather today, slept badly.")).toBeUndefined();
});
