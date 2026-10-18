// The app's timeline (src/app/recordTimeline.ts, used by useDerived) must read the medication
// event log: a dose change of another medicine near a start is a possible alternative explanation, and the
// Timeline screen's "Other medicine changes" row says "None recorded." when overlappingMedIds is empty.
// src/ai/batchHarness.ts still calls analyzeTimeline without the log, because its hash is pinned by
// eval/results/llm-batch.json; the second test shows the two give the same result on the demo seed.
import { describe, expect, it } from "vitest";
import type { Medication, MedEvent, MetricKey } from "../../model/types";
import { addDays } from "../../model/dates";
import { DEMO_TODAY_OFFSETS, createSeed } from "../../model/seed";
import { knownEffect } from "../../kb";
import { recordTimeline } from "../../app/recordTimeline";
import { analyzeTimeline } from "./signals";

const TODAY = "2026-10-10";
const LORAZEPAM_START = addDays(TODAY, DEMO_TODAY_OFFSETS.lorazepamStart);

describe("recordTimeline passes the medication event log", () => {
  it("lists another medicine's dose change within 21 days of the lorazepam start as overlapping", () => {
    const seed = createSeed(TODAY);
    // Amlodipine started months earlier, so before this event the lorazepam signals have no overlaps.
    expect(recordTimeline(seed, TODAY).signals.every((s) => s.overlappingMedIds.length === 0)).toBe(true);

    const doseChange: MedEvent = {
      id: "evt-test-amlodipine-dose",
      medicationId: "med-amlodipine",
      date: addDays(LORAZEPAM_START, 7),
      kind: "dose_changed",
      detail: "Dose changed (test).",
      createdAt: `${addDays(LORAZEPAM_START, 7)}T19:00:00-04:00`,
    };
    const result = recordTimeline({ ...seed, medEvents: [...seed.medEvents, doseChange] }, TODAY);
    const lorazepam = result.signals.filter((s) => s.medicationId === "med-lorazepam");
    expect(lorazepam.length).toBeGreaterThan(0);
    for (const s of lorazepam) expect(s.overlappingMedIds).toEqual(["med-amlodipine"]);
  });

  it("leaves the demo seed's timeline unchanged (its log has only start and added-to-list entries)", () => {
    for (const today of [TODAY, "2026-10-18", "2027-01-15"]) {
      const seed = createSeed(today);
      expect(seed.medEvents.some((e) => e.kind === "dose_changed")).toBe(false);
      const isKnownEffect = (med: Medication, m: MetricKey) => knownEffect(med.ingredientIds, m);
      // The call the app made before the event log was passed, and the one src/ai/batchHarness.ts still makes (its
      // hash is pinned by eval/results/llm-batch.json, so it is left alone): on the seed both give the same timeline.
      const withoutLog = analyzeTimeline({ checkIns: seed.checkIns, meds: seed.medications, today, isKnownEffect });
      expect(recordTimeline(seed, today)).toEqual(withoutLog);
    }
  });
});
