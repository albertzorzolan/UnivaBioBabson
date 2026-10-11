// False-alarm rate under the null: how often does a medicine change with NO real effect still produce a signal?
//
// The engine compares 9 diary items per change without a multiple-comparison correction, so this rate must be
// measured and disclosed honestly (MULTIPLE_COMPARISONS_NOTE, TIMELINE_METHOD_SUMMARY). This test simulates
// diaries whose answers are drawn from the same distribution before and after a start, and fails if the rates
// drift away from what the user-facing text says. It also documents why "weak" differences are not flagged.
//
// Simulation: 45 days of diary ending today, each day missing with probability `missing`; yes/no items drawn with
// fixed base rates; 1–5 ratings = round(mean + uniform(−1.1, 1.1)) clamped to 1–5; a medicine started today − 16.
// mulberry32 with fixed seeds, so the result is deterministic. 1,000 changes per scenario (~2 s total); with 8,000
// per scenario the rates were: typical 10.7–11.0% signal / 0.7–0.8% strong / 51% weak-or-stronger;
// frequent 17.9–19.2% / 2.7–2.8% / 66%. The bounds below allow for the smaller sample.
import { describe, expect, it } from "vitest";
import type { CheckIn, DiaryAnswers } from "../../model/types";
import { addDays } from "../../model/dates";
import { latestCheckInPerDate } from "./metrics";
import { MULTIPLE_COMPARISONS_NOTE, TIMELINE_METHOD_SUMMARY } from "./rules";
import { analyzeEvent } from "./signals";
import { makeMed } from "./test-fixtures";

const TODAY = "2026-10-10";
const N = 1000;

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Scenario {
  dizziness: number;
  drowsiness: number;
  confusion: number;
  fall: number;
  nearFall: number;
  swelling: number;
  appetiteWorse: number;
  energy: number;
  sleep: number;
  missing: number;
}

/** Base rates similar to the demo diary before lorazepam. */
const TYPICAL: Scenario = {
  dizziness: 0.15,
  drowsiness: 0.1,
  confusion: 0.05,
  fall: 0.02,
  nearFall: 0.05,
  swelling: 0.2,
  appetiteWorse: 0.1,
  energy: 3.3,
  sleep: 2.9,
  missing: 0.15,
};

/** Someone who records symptoms often (more room for chance differences in yes/no items). */
const FREQUENT: Scenario = {
  dizziness: 0.35,
  drowsiness: 0.3,
  confusion: 0.2,
  fall: 0.05,
  nearFall: 0.1,
  swelling: 0.4,
  appetiteWorse: 0.25,
  energy: 2.8,
  sleep: 3.0,
  missing: 0.15,
};

interface Rates {
  /** ≥1 signal (moderate or strong) — what the family sees flagged. */
  signal: number;
  strong: number;
  /** ≥1 comparison of any strength including weak — what flagging "weak" would have produced. */
  weakOrStronger: number;
}

function simulate(sc: Scenario, seedBase: number): Rates {
  const med = makeMed("med-new", "New pill", addDays(TODAY, -16));
  const change = { medicationId: med.id, kind: "started" as const, date: med.startDate };
  let signal = 0;
  let strong = 0;
  let weakOrStronger = 0;
  for (let trial = 0; trial < N; trial++) {
    const r = mulberry32(seedBase + trial * 7919);
    const checkIns: CheckIn[] = [];
    for (let offset = -45; offset <= 0; offset++) {
      if (r() < sc.missing) continue;
      const rating = (mean: number) => Math.max(1, Math.min(5, Math.round(mean + (r() - 0.5) * 2.2))) as DiaryAnswers["energy"];
      const answers: DiaryAnswers = {
        energy: rating(sc.energy),
        sleep: rating(sc.sleep),
        appetite: r() < sc.appetiteWorse ? "worse" : "same",
        dizziness: r() < sc.dizziness,
        dizzinessSeverity: null,
        drowsiness: r() < sc.drowsiness,
        confusion: r() < sc.confusion,
        fall: r() < sc.fall,
        nearFall: r() < sc.nearFall,
        swelling: r() < sc.swelling,
      };
      checkIns.push({
        id: `c${trial}:${offset}`,
        date: addDays(TODAY, offset),
        answers,
        otherSymptoms: [],
        story: "",
        provenance: {},
        medNotes: [],
        confirmedAt: "",
        revision: 1,
      });
    }
    const ev = analyzeEvent({ days: latestCheckInPerDate(checkIns), med, change, meds: [med], today: TODAY });
    if (ev.signals.length > 0) signal++;
    if (ev.signals.some((s) => s.strength === "strong")) strong++;
    if (ev.comparisons.some((c) => c.strength !== "none" && c.direction !== "same")) weakOrStronger++;
  }
  return { signal: signal / N, strong: strong / N, weakOrStronger: weakOrStronger / N };
}

describe("false-alarm rate with no real change (disclosed in MULTIPLE_COMPARISONS_NOTE)", () => {
  const typical = simulate(TYPICAL, 3);
  const frequent = simulate(FREQUENT, 1_000_003);

  it("flags about 1 in 10 changes for typical diaries", () => {
    expect(typical.signal).toBeGreaterThan(0.07);
    expect(typical.signal).toBeLessThan(0.15);
    expect(MULTIPLE_COMPARISONS_NOTE).toContain("about 1 in 10 medicine changes");
    expect(TIMELINE_METHOD_SUMMARY).toContain("about 1 in 10 medicine changes");
  });

  it("flags nearly 1 in 5 when symptoms are recorded often", () => {
    expect(frequent.signal).toBeGreaterThan(0.14);
    expect(frequent.signal).toBeLessThan(0.23);
    expect(MULTIPLE_COMPARISONS_NOTE).toContain("nearly 1 in 5");
    expect(TIMELINE_METHOD_SUMMARY).toContain("nearly 1 in 5");
  });

  it("produces a strong signal about 1 in 100 times (1 in 35 when symptoms are frequent)", () => {
    expect(typical.strong).toBeLessThan(0.02);
    expect(frequent.strong).toBeLessThan(0.05);
    expect(MULTIPLE_COMPARISONS_NOTE).toContain("about 1 in 100 a strong one");
  });

  it("would flag about half of all changes if weak differences were signals — which is why they are not", () => {
    expect(typical.weakOrStronger).toBeGreaterThan(0.4);
    expect(frequent.weakOrStronger).toBeGreaterThan(0.55);
  });
});
