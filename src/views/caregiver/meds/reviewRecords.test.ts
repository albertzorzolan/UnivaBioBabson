// Chip labels on the Medication review screen (src/views/caregiver/meds/reviewRecords.ts), against the real KB.
import { describe, expect, it } from "vitest";
import { KB } from "../../../kb";
import { createSeed } from "../../../model/seed";
import { reviewMedications } from "../../../engine/meds";
import { CATEGORY_CHIP, findingChip } from "./reviewRecords";

describe("findingChip", () => {
  it("shows a conditional Beers rule's own condition instead of the generic 'Generally avoided'", () => {
    // AGS Beers 2023 targets scheduled PPI use beyond 8 weeks, not every PPI.
    expect(findingChip({ category: "beers_avoid", ruleId: "pim-ppi" })).toBe("Generally avoided when taken daily for more than 8 weeks");
    expect(findingChip({ category: "beers_avoid", ruleId: "pim-nsaid-chronic" })).toBe("Generally avoided when taken regularly for 3 months or more");
  });

  it("drops a parenthetical aside from the condition, and keeps the generic label when nothing is left", () => {
    expect(findingChip({ category: "beers_avoid", ruleId: "pim-estrogen" })).toBe("Generally avoided as pills or patches");
    expect(findingChip({ category: "beers_avoid", ruleId: "pim-anticholinergic-antidepressant" })).toBe(CATEGORY_CHIP.beers_avoid);
  });

  it("uses the generic label for unconditional rules, unknown rules and other categories", () => {
    const unconditional = KB.beers.find((r) => r.table === "pim" && !r.qualifier);
    expect(unconditional).toBeDefined();
    expect(findingChip({ category: "beers_avoid", ruleId: unconditional!.id })).toBe(CATEGORY_CHIP.beers_avoid);
    expect(findingChip({ category: "beers_avoid", ruleId: "no-such-rule" })).toBe(CATEGORY_CHIP.beers_avoid);
    expect(findingChip({ category: "fall_risk", ruleId: "fall-risk" })).toBe(CATEGORY_CHIP.fall_risk);
  });

  it("every conditional chip stays short enough to read at a glance", () => {
    for (const r of KB.beers.filter((x) => x.table === "pim")) {
      expect(findingChip({ category: "beers_avoid", ruleId: r.id }).length, r.id).toBeLessThanOrEqual(90);
    }
  });

  it("the seed's omeprazole prompt shows the more-than-8-weeks condition", () => {
    const TODAY = "2026-10-10";
    const data = createSeed(TODAY);
    const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY });
    const [f] = review.findings.filter((x) => x.category === "beers_avoid" && x.medIds.includes("med-omeprazole"));
    expect(f).toBeDefined();
    expect(findingChip(f)).toBe("Generally avoided when taken daily for more than 8 weeks");
  });
});
