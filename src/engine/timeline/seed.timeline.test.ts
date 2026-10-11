// The demo judges will see: the timeline engine run on the real seed record (createSeed). Locks the SPEC §2 story —
// "lorazepam start → dizziness, near-falls, drowsiness and confusion recorded more often after vs before; energy
// lower" — so that a change to the seed (or to the engine) cannot silently alter what the demo shows.
// If this fails after an intentional seed edit, update the expectations AND tell the demo-script owner.
import { describe, expect, it } from "vitest";
import type { Medication, MetricKey } from "../../model/types";
import { addDays, formatShort } from "../../model/dates";
import { DEMO_TODAY_OFFSETS, createSeed } from "../../model/seed";
import { analyzeTimeline, describeSignal } from "./signals";

const TODAY = "2026-10-10";
const O = DEMO_TODAY_OFFSETS;
const day = (offset: number, today = TODAY) => formatShort(addDays(today, offset));

/** Stand-in for the KB lookup (src/kb is built by another agent): lorazepam's labelled CNS effects. */
const LORAZEPAM_EFFECTS: MetricKey[] = ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "energy"];
const isKnownEffect = (med: Medication, m: MetricKey) => med.id === "med-lorazepam" && LORAZEPAM_EFFECTS.includes(m);

function run(today = TODAY) {
  const seed = createSeed(today);
  return {
    seed,
    result: analyzeTimeline({
      checkIns: seed.checkIns,
      meds: seed.medications,
      medEvents: seed.medEvents,
      today,
      isKnownEffect,
    }),
  };
}

describe("timeline on the demo seed (createSeed)", () => {
  const { seed, result } = run();

  it("compares the lorazepam start on all 9 diary items", () => {
    const lorazepam = result.perMed.find((p) => p.medicationId === "med-lorazepam")!;
    expect(lorazepam).toMatchObject({ event: "started", eventDate: addDays(TODAY, O.lorazepamStart), status: "ok", reason: null });
    expect(result.perMed[0]).toBe(lorazepam); // most recent change first
  });

  it("finds exactly the SPEC §2 signals, possible side effects first", () => {
    expect(result.signals.map((s) => [s.metric, s.direction, s.strength, s.knownEffect])).toEqual([
      ["dizziness", "worse", "strong", true],
      ["drowsiness", "worse", "strong", true],
      ["energy", "worse", "moderate", true],
      ["confusion", "worse", "moderate", true],
      ["sleep", "better", "moderate", false], // the sleeping pill's intended effect, shown last
    ]);
    for (const s of result.signals) {
      expect(s.medicationId).toBe("med-lorazepam");
      expect(s.overlappingMedIds).toEqual([]); // the seed's other medicines changed months earlier
    }
    const counts = Object.fromEntries(
      result.signals.map((s) => [s.metric, [s.after.positive, s.after.answered, s.before.positive, s.before.answered]]),
    );
    expect(counts.dizziness).toEqual([9, 14, 2, 19]);
    expect(counts.drowsiness).toEqual([8, 14, 2, 20]);
    expect(counts.confusion).toEqual([4, 14, 0, 20]);
    const p = Object.fromEntries(result.signals.map((s) => [s.metric, s.pValue]));
    expect(p.dizziness).toBeCloseTo(0.0022596, 6);
    expect(p.drowsiness).toBeCloseTo(0.0060732, 6);
    expect(p.confusion).toBeCloseTo(0.0215844, 6);
    expect(p.energy).toBeCloseTo(0.0035176, 6);
  });

  it("renders the sentences the brief and the demo script quote", () => {
    const dizzy = result.signals[0];
    expect(dizzy.text).toBe(
      `Dizziness was recorded on 9 of 14 answered days from ${day(O.lorazepamStart)}, when Lorazepam (Ativan) was ` +
        `started, through ${day(0)}, compared with 2 of 19 answered days in the 21 days before.`,
    );
    const d = describeSignal(dizzy, seed.medications, TODAY, seed.medEvents);
    expect(d.headline).toBe("Dizziness recorded more often after Lorazepam (Ativan) was started");
    expect(d.statistics).toBe("Fisher's exact test, two-sided p = 0.0023.");
    expect(d.knownEffect).toBe("Kinwise's reference set lists dizziness as a recognized possible effect of Lorazepam (Ativan).");
    expect(d.overlap).toBeNull();
  });

  it("does not test falls or near-falls (too few) — it lists every one by date instead", () => {
    expect(result.signals.some((s) => s.metric === "fall" || s.metric === "nearFall" || s.metric === "appetiteWorse")).toBe(
      false,
    );
    expect(result.sentinels).toHaveLength(1);
    const [falls] = result.sentinels;
    expect(falls).toMatchObject({
      id: "falls:med-lorazepam:started",
      medicationId: "med-lorazepam",
      totals: { before: 1, after: 3 },
      knownEffect: true,
      overlappingMedIds: [],
    });
    expect(falls.counts.find((c) => c.metric === "fall")!.afterDates).toEqual([addDays(TODAY, O.fall)]);
    expect(falls.counts.find((c) => c.metric === "nearFall")!.afterDates).toEqual([
      addDays(TODAY, O.nearFallKitchen),
      addDays(TODAY, O.nearFallBathroom),
    ]);
    expect(falls.text).toBe(
      `1 fall (${day(O.fall)}) and 2 near-falls (${day(O.nearFallKitchen)}, ${day(O.nearFallBathroom)}) were recorded ` +
        `from ${day(O.lorazepamStart)}, when Lorazepam (Ativan) was started, through ${day(0)}, ` +
        `compared with 1 near-fall (${day(O.catTripNearFall)}) in the 21 days before.`,
    );
  });

  it("explains why every other medicine was not compared", () => {
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
    for (const p of result.perMed.filter((x) => x.status !== "ok")) expect(p.reason).toBeTruthy();
    expect(result.perMed.find((p) => p.medicationId === "med-furosemide")!.reason).toBe(
      `No answered days before ${day(O.furosemideStart)} and none from ${day(O.furosemideStart)} to ` +
        `${day(O.furosemideStart + 20)} — at least 5 are needed in each.`,
    );
  });

  it("tells the same story whatever date the demo is opened on (the seed is offset-based)", () => {
    const shape = (r: ReturnType<typeof run>["result"]) => ({
      signals: r.signals.map((s) => [s.metric, s.strength, s.before.positive, s.before.answered, s.after.positive, s.after.answered]),
      sentinels: r.sentinels.map((x) => x.totals),
      statuses: r.perMed.map((p) => p.status),
    });
    const base = shape(result);
    for (const other of ["2026-10-13", "2026-11-02", "2027-03-14"]) expect(shape(run(other).result)).toEqual(base);
  });
});
