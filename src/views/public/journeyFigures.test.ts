// The Welcome illustration must show the same lorazepam/dizziness counts as every live screen.
import { describe, expect, it } from "vitest";
import { createSeed } from "../../model/seed";
import { analyzeTimeline } from "../../engine/timeline/signals";
import { knownEffect } from "../../kb";
import {
  JOURNEY_AFTER_LABEL,
  JOURNEY_AFTER_PCT,
  JOURNEY_BEFORE_LABEL,
  JOURNEY_BEFORE_PCT,
  JOURNEY_DIZZINESS,
  JOURNEY_QUESTION,
} from "./journeyFigures";

describe("Welcome journey illustration", () => {
  for (const today of ["2026-10-11", "2026-10-13", "2027-02-01"]) {
    it(`matches the timeline engine on the demo seed (today ${today})`, () => {
      const seed = createSeed(today);
      const report = analyzeTimeline({
        checkIns: seed.checkIns,
        meds: seed.medications,
        today,
        isKnownEffect: (med, m) => knownEffect(med.ingredientIds, m),
      });
      const sig = report.signals.find((s) => s.medicationId === "med-lorazepam" && s.metric === "dizziness");
      expect(sig).toBeDefined();
      expect({
        before: { positive: sig!.before.positive, answered: sig!.before.answered },
        after: { positive: sig!.after.positive, answered: sig!.after.answered },
      }).toEqual(JOURNEY_DIZZINESS);
    });
  }

  it("renders labels, bar widths and the question from those counts", () => {
    expect(JOURNEY_BEFORE_LABEL).toBe("2 of 19 days");
    expect(JOURNEY_AFTER_LABEL).toBe("9 of 14 days");
    expect(JOURNEY_BEFORE_PCT).toBeCloseTo(10.5, 1);
    expect(JOURNEY_AFTER_PCT).toBeCloseTo(64.3, 1);
    expect(JOURNEY_QUESTION).toBe(
      "Dizziness was recorded on 9 of 14 answered days after lorazepam started, compared with 2 of 19 before. Is this medicine worth reviewing?",
    );
    expect(JOURNEY_QUESTION).not.toMatch(/caus|safe|danger|urgent|stop/i);
  });
});
