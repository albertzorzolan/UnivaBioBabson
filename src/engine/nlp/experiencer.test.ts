// Experiencer scope (context.ts): who had the symptom.
// A person word only moves a symptom to "someone else" inside the noun phrase or clause it governs. A possessive in
// an object noun phrase ("called me by her sister's name", "borrowed my husband's car") names a thing, not the person
// who had the symptom, so it must not move the experiencer of the patient's own clause.
// The existing other-person cases ("My husband fell", "Sofia fell off her bike") must still go to someone else.
import { describe, expect, it } from "vitest";
import { extractCheckIn } from "./extract";
import { EVAL_MEDS, EVAL_PATIENT_NAMES, EVAL_TODAY } from "./fixtures";

const run = (story: string) => extractCheckIn(story, { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: EVAL_PATIENT_NAMES });
const value = (story: string, field: string) => run(story).proposals.find((p) => p.field === field)?.value;

describe("possessive object noun phrases do not move the experiencer", () => {
  it("caregiver voice: 'She was really muddled …, called me by her sister's name' is the patient's confusion", () => {
    const r = run("She was really muddled this evening, called me by her sister's name.");
    expect(r.proposals.find((p) => p.field === "confusion")?.value).toBe(true);
    expect(r.voice.voice).toBe("caregiver");
  });

  it("the shorter sentence keeps working", () => {
    expect(value("She was really muddled this evening.", "confusion")).toBe(true);
  });

  it("a caregiver who appears only as 'me' (the person spoken to) still reads as caregiver voice", () => {
    expect(value("She kept asking me what day it was, very confused tonight.", "confusion")).toBe(true);
    expect(run("He didn't recognise me this morning and seemed confused.").voice.voice).toBe("caregiver");
  });

  it("a possessive object phrase in an earlier clause does not reach the patient's next clause", () => {
    expect(value("I borrowed my husband's car and felt dizzy driving home.", "dizziness")).toBe(true);
  });

  it("a possessed thing (car, house, phone) is the subject, not the person, so the next clause stays the patient's", () => {
    expect(value("My husband's car broke down, felt dizzy all afternoon.", "dizziness")).toBe(true);
    expect(value("My son's phone was broken, felt woozy all day.", "dizziness")).toBe(true);
  });

  it("an object pronoun in an earlier clause does not reach the patient's next clause", () => {
    expect(value("I visited her and felt dizzy.", "dizziness")).toBe(true);
    expect(value("Drove him to the station, felt woozy on the way back.", "dizziness")).toBe(true);
    // Inside its own clause a possessive pronoun still owns the symptom.
    expect(value("Her ankles were swollen.", "swelling")).toBeUndefined();
  });

  it("a possessive still owns the noun phrase it governs", () => {
    expect(value("My husband's ankles were swollen.", "swelling")).toBeUndefined();
    expect(value("My husband's legs felt wobbly.", "dizziness")).toBeUndefined();
    expect(value("I noticed my husband's ankles were swollen.", "swelling")).toBeUndefined();
    expect(value("Bob's dizziness was bad today.", "dizziness")).toBeUndefined();
  });
});

describe("a possessive that is the clause subject keeps its scope over a subjectless follow-on clause", () => {
  it.each([
    ["My husband's legs were wobbly, nearly fell on the stairs.", ["fall", "nearFall", "dizziness"]],
    ["My husband's knee gave way, fell in the garden.", ["fall", "nearFall"]],
  ])("%s → someone else", (story, fields) => {
    const r = run(story);
    for (const f of fields) expect(r.proposals.find((p) => p.field === f)).toBeUndefined();
    expect(r.skipped.some((s) => s.reason.startsWith("Mentioned for someone else"))).toBe(true);
  });
});

describe("caregiver voice from an object 'me' only when 'me' is not the one with the symptom", () => {
  it("'She says the new tablets make me dizzy' is the patient (she is only reporting)", () => {
    const r = run("She says the new tablets make me dizzy.");
    expect(r.voice.voice).toBe("patient");
    expect(r.proposals.find((p) => p.field === "dizziness")?.value).toBe(true);
    expect(value("She thinks the pills make me dizzy.", "dizziness")).toBe(true);
  });

  it("a prescriber or pharmacist 'she/he' who gave 'me' a medicine: the writer is the patient", () => {
    expect(value("She gave me a new pill and it made me dizzy.", "dizziness")).toBe(true);
    expect(value("He changed the tablets and they leave me drowsy all day.", "drowsiness")).toBe(true);
  });

  it("'He was dizzy and gave me a fright' is someone else (the writer only got a fright)", () => {
    const r = run("He was dizzy and gave me a fright.");
    expect(r.voice.voice).toBe("patient");
    expect(r.proposals.find((p) => p.field === "dizziness")).toBeUndefined();
  });

  it("the person spoken to stays caregiver voice", () => {
    const r = run("She was really muddled this evening, called me by her sister's name.");
    expect(r.voice.voice).toBe("caregiver");
    expect(r.proposals.find((p) => p.field === "confusion")?.value).toBe(true);
    expect(value("She kept asking me where her keys were, very confused.", "confusion")).toBe(true);
  });
});

describe("other-person subjects still go to someone else (regression)", () => {
  it.each([
    ["My husband fell.", "fall"],
    ["My husband fell in the garden this morning.", "fall"],
    ["Sofia fell off her bike today.", "fall"],
    ["My granddaughter Sofia fell off her bike, poor thing.", "fall"],
    ["My husband nearly fell getting into the car.", "nearFall"],
    ["My sister was dizzy all day.", "dizziness"],
  ])("%s", (story, field) => {
    const r = run(story);
    expect(r.proposals.find((p) => p.field === field)).toBeUndefined();
    expect(r.skipped.some((s) => s.reason.startsWith("Mentioned for someone else"))).toBe(true);
  });

  it("a story that says 'I' or 'my' is still the patient writing, so a bare 'she' is someone else", () => {
    expect(value("She came to visit and was dizzy, I was fine.", "dizziness")).toBeUndefined();
    expect(run("She rang me this morning. My ankles are swollen.").voice.voice).toBe("patient");
    expect(value("She rang me this morning. My ankles are swollen.", "swelling")).toBe(true);
  });
});
