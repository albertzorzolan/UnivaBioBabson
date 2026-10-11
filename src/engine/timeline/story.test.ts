// Acceptance test on a synthetic diary shaped like the SPEC §2 story (independent of src/model/seed.ts):
// 45 days of check-ins with ~15% missing days, lorazepam started today − 16, and the eight seed medications.
// Expected engine behaviour: dizziness, daytime drowsiness and confusion recorded more often after the start,
// energy rated lower — and (honestly) no SIGNAL for 2 near-falls + 1 fall vs 0, which is too few events to separate
// from chance; instead the falls are LISTED by date (sentinel path), which is what a clinician needs to see.
import { describe, expect, it } from "vitest";
import type { CheckIn, DiaryAnswers, Medication } from "../../model/types";
import { addDays } from "../../model/dates";
import { analyzeTimeline, describeSignal, weeklyTrends } from "./signals";
import { makeCheckIn, makeMed } from "./test-fixtures";

const TODAY = "2026-10-10";
const d = (offset: number) => addDays(TODAY, offset);

const MEDS: Medication[] = [
  makeMed("med-amlodipine", "Amlodipine", d(-140)),
  makeMed("med-furosemide", "Furosemide (Lasix)", d(-95)),
  makeMed("med-metformin", "Metformin", d(-900)),
  makeMed("med-atorvastatin", "Atorvastatin", d(-900)),
  makeMed("med-omeprazole", "Omeprazole", d(-400)),
  makeMed("med-oxybutynin", "Oxybutynin", d(-210)),
  makeMed("med-tylenolpm", "Tylenol PM (OTC)", d(-180)),
  makeMed("med-lorazepam", "Lorazepam (Ativan)", d(-16)),
];

const MISSING = new Set([-43, -38, -31, -25, -19, -12, -5]);
// Before window (−37…−17): 18 answered days. After window (−16…0): 15 answered days.
const BEFORE = {
  dizziness: new Set([-35, -28, -21]), // 3 of 18 (17%)
  drowsiness: new Set([-33, -26, -20]), // 3 of 18
  energy: [4, 3, 4, 3, 4, 4, 3, 3, 4, 4, 3, 4, 3, 4, 4, 3, 4, 3],
  sleep: [2, 3, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 2],
};
const AFTER = {
  dizziness: new Set([-16, -14, -11, -9, -8, -6, -3, -2, 0]), // 9 of 15 (60%)
  drowsiness: new Set([-15, -14, -13, -11, -10, -8, -6, -4, -3, -1]), // 10 of 15
  confusion: new Set([-13, -8, -4, -1]), // 4 of 15
  nearFall: new Set([-9, -2]), // 2 near-falls
  fall: new Set([-6]), // 1 fall
  energy: [2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2, 3],
  sleep: [4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4],
};

function storyDiary(): CheckIn[] {
  const out: CheckIn[] = [];
  let beforeIdx = 0;
  let afterIdx = 0;
  for (let offset = -44; offset <= 0; offset++) {
    if (MISSING.has(offset)) continue;
    const a: Partial<DiaryAnswers> = {};
    if (offset >= -16) {
      a.dizziness = AFTER.dizziness.has(offset);
      a.drowsiness = AFTER.drowsiness.has(offset);
      a.confusion = AFTER.confusion.has(offset);
      a.nearFall = AFTER.nearFall.has(offset);
      a.fall = AFTER.fall.has(offset);
      a.energy = AFTER.energy[afterIdx] as DiaryAnswers["energy"];
      a.sleep = AFTER.sleep[afterIdx] as DiaryAnswers["sleep"];
      afterIdx++;
    } else if (offset >= -37) {
      a.dizziness = BEFORE.dizziness.has(offset);
      a.drowsiness = BEFORE.drowsiness.has(offset);
      a.energy = BEFORE.energy[beforeIdx] as DiaryAnswers["energy"];
      a.sleep = BEFORE.sleep[beforeIdx] as DiaryAnswers["sleep"];
      beforeIdx++;
    } else {
      a.swelling = true; // early ankle swelling, outside every window in this test
    }
    out.push(makeCheckIn(d(offset), a));
  }
  return out;
}

describe("SPEC §2-shaped story", () => {
  const knownEffects: Record<string, string[]> = {
    "med-lorazepam": ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "energy"],
  };
  const result = analyzeTimeline({
    checkIns: storyDiary(),
    meds: MEDS,
    today: TODAY,
    isKnownEffect: (med, m) => (knownEffects[med.id] ?? []).includes(m),
  });

  it("finds the lorazepam signals, strongest first, possible side effects before the sleep improvement", () => {
    // Sleep rated higher after a sleep medicine started is reported too (direction "better") — the brief shows
    // both sides of the trade-off — but within a strength level KB-consistent changes come first.
    // p-values cross-checked with exact integer enumeration in Python.
    expect(result.signals.map((s) => [s.metric, s.direction, s.strength])).toEqual([
      ["energy", "worse", "strong"],
      ["drowsiness", "worse", "strong"],
      ["sleep", "better", "strong"],
      ["dizziness", "worse", "moderate"],
      ["confusion", "worse", "moderate"],
    ]);
    const p = Object.fromEntries(result.signals.map((s) => [s.metric, s.pValue]));
    expect(p.sleep).toBeCloseTo(1.527249957364272e-6, 15);
    expect(p.energy).toBeCloseTo(2.481781180716942e-6, 15);
    expect(p.drowsiness).toBeCloseTo(0.005154900555587309, 12);
    expect(p.confusion).toBeCloseTo(0.033357771260997066, 12);
    for (const s of result.signals) {
      expect(s.medicationId).toBe("med-lorazepam");
      expect(s.overlappingMedIds).toEqual([]);
    }
    const dizzy = result.signals.find((s) => s.metric === "dizziness")!;
    expect(dizzy.pValue).toBeCloseTo(0.01427350840708678, 12);
    expect(dizzy.knownEffect).toBe(true);
    expect(dizzy.text).toBe(
      "Dizziness was recorded on 9 of 15 answered days from Sep 24, when Lorazepam (Ativan) was started, through Oct 10, " +
        "compared with 3 of 18 answered days in the 21 days before.",
    );
    expect(result.signals.find((s) => s.metric === "sleep")!.knownEffect).toBe(false);
    const desc = describeSignal(dizzy, MEDS, TODAY);
    expect(desc.headline).toBe("Dizziness recorded more often after Lorazepam (Ativan) was started");
  });

  it("does not turn 2 near-falls and 1 fall into a signal (too few events) but lists them by date", () => {
    expect(result.signals.some((s) => s.metric === "nearFall" || s.metric === "fall")).toBe(false);
    expect(result.sentinels).toHaveLength(1);
    const [falls] = result.sentinels;
    expect(falls).toMatchObject({
      id: "falls:med-lorazepam:started",
      medicationId: "med-lorazepam",
      event: "started",
      eventDate: "2026-09-24",
      totals: { before: 0, after: 3 },
      answeredDays: { before: 18, after: 15 },
      knownEffect: true,
    });
    expect(falls.text).toBe(
      "1 fall (Oct 4) and 2 near-falls (Oct 1, Oct 8) were recorded from Sep 24, when Lorazepam (Ativan) was started, " +
        "through Oct 10, compared with none on the 18 answered days in the 21 days before.",
    );
  });

  it("explains every other medication's status", () => {
    const status = Object.fromEntries(result.perMed.map((p) => [p.medicationId, p.status]));
    expect(status).toEqual({
      "med-lorazepam": "ok",
      "med-furosemide": "insufficient",
      "med-amlodipine": "insufficient",
      "med-tylenolpm": "insufficient",
      "med-oxybutynin": "outside_range",
      "med-omeprazole": "outside_range",
      "med-atorvastatin": "outside_range",
      "med-metformin": "outside_range",
    });
    expect(result.perMed[0].medicationId).toBe("med-lorazepam");
    const furosemide = result.perMed.find((p) => p.medicationId === "med-furosemide")!;
    expect(furosemide.reason).toBe(
      "No answered days before Jul 7 and none from Jul 7 to Jul 27 — at least 5 are needed in each.",
    );
  });

  it("gives the patient a plain weekly comparison", () => {
    const weekly = Object.fromEntries(weeklyTrends(storyDiary(), TODAY).map((w) => [w.metric, w]));
    // This week Oct 4–10 (Oct 5 missing): 6 answered days; last week Sep 27–Oct 3 (Sep 28 missing): 6.
    expect(weekly.dizziness.text).toBe("You noted dizziness on 4 of 6 days this week, up from 3 of 6 last week.");
    expect(weekly.dizziness.direction).toBe("worse");
    expect(weekly.fall.text).toBe("You noted a fall on 1 of 6 days this week, up from 0 of 6 last week.");
    expect(weekly.swelling.text).toBe("No ankle swelling noted on the 6 days you answered this week or the 6 days last week.");
  });
});
