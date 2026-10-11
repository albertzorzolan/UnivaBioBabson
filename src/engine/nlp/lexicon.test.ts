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
