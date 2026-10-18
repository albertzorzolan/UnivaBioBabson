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
//
// Clustered days. Independent days are optimistic: real symptoms come in runs (a bad week, a cold), and runs make
// chance before/after differences larger. The clustered scenario keeps the same base rates but makes every item a
// two-state Markov chain: each day, with probability `stay` the answer repeats yesterday's, otherwise it is drawn
// afresh from the same base rate. This leaves each item's long-run rate unchanged (checked below) and gives a
// day-to-day correlation of `stay`. The chain also runs on unanswered days. Same seeds and the same number of
// simulated changes as the independent scenario. Results: eval/results/timeline-null.json.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CheckIn, DiaryAnswers } from "../../model/types";
import { addDays } from "../../model/dates";
import { latestCheckInPerDate } from "./metrics";
import { MULTIPLE_COMPARISONS_NOTE, TIMELINE_METHOD_SUMMARY } from "./rules";
import { analyzeEvent } from "./signals";
import { makeMed } from "./test-fixtures";
import { writeResultsIfChanged } from "../../../eval/writeResults";

const TODAY = "2026-10-10";
const N = 1000;
/** Day-to-day persistence in the clustered scenarios (0 = independent days). */
const STAY_MAIN = 0.8;
const STAY_ALT = 0.5;
const STAY_LOW = 0.3;
const RESULTS_PATH = new URL("../../../eval/results/timeline-null.json", import.meta.url);

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
  /** Share of answered days with dizziness = yes (checks that clustering kept the base rate). */
  dizzinessRate: number;
}

/**
 * Simulate N medicine changes with no real effect. `stay` = 0 draws every day independently (the original
 * scenario, unchanged random sequence); `stay` > 0 makes each item repeat yesterday's answer with that probability.
 */
function simulate(sc: Scenario, seedBase: number, stay = 0): Rates {
  const med = makeMed("med-new", "New pill", addDays(TODAY, -16));
  const change = { medicationId: med.id, kind: "started" as const, date: med.startDate };
  let signal = 0;
  let strong = 0;
  let weakOrStronger = 0;
  let answered = 0;
  let dizzyDays = 0;
  for (let trial = 0; trial < N; trial++) {
    const r = mulberry32(seedBase + trial * 7919);
    const checkIns: CheckIn[] = [];
    // Yesterday's underlying answers; only kept in the clustered scenario, so `stay` = 0 draws no extra numbers.
    let prev: DiaryAnswers | null = null;
    const rating = (mean: number) => Math.max(1, Math.min(5, Math.round(mean + (r() - 0.5) * 2.2))) as DiaryAnswers["energy"];
    /** Yesterday's value with probability `stay`, otherwise a fresh draw from the base rate. */
    const pick = <K extends keyof DiaryAnswers>(key: K, fresh: () => DiaryAnswers[K]): DiaryAnswers[K] =>
      prev !== null && r() < stay ? prev[key] : fresh();
    const draw = (): DiaryAnswers => ({
      energy: pick("energy", () => rating(sc.energy)),
      sleep: pick("sleep", () => rating(sc.sleep)),
      appetite: pick("appetite", () => (r() < sc.appetiteWorse ? "worse" : "same")),
      dizziness: pick("dizziness", () => r() < sc.dizziness),
      dizzinessSeverity: null,
      drowsiness: pick("drowsiness", () => r() < sc.drowsiness),
      confusion: pick("confusion", () => r() < sc.confusion),
      fall: pick("fall", () => r() < sc.fall),
      nearFall: pick("nearFall", () => r() < sc.nearFall),
      swelling: pick("swelling", () => r() < sc.swelling),
    });
    for (let offset = -45; offset <= 0; offset++) {
      let answers: DiaryAnswers;
      if (stay > 0) {
        // The symptom process runs every day; whether the diary was filled in is independent of it.
        answers = draw();
        prev = answers;
        if (r() < sc.missing) continue;
      } else {
        if (r() < sc.missing) continue;
        answers = draw();
      }
      answered++;
      if (answers.dizziness) dizzyDays++;
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
  return { signal: signal / N, strong: strong / N, weakOrStronger: weakOrStronger / N, dizzinessRate: dizzyDays / answered };
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const asResult = (r: Rates) => ({ moderateRate: round4(r.signal), strongRate: round4(r.strong), weakOrStrongerRate: round4(r.weakOrStronger), n: N });

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

describe("false-alarm rate when symptoms cluster in runs of days (same base rates)", () => {
  const typical = simulate(TYPICAL, 3);
  const frequent = simulate(FREQUENT, 1_000_003);
  const clustered = simulate(TYPICAL, 3, STAY_MAIN);
  const clusteredAlt = simulate(TYPICAL, 3, STAY_ALT);
  const clusteredLow = simulate(TYPICAL, 3, STAY_LOW);
  const clusteredFrequent = simulate(FREQUENT, 1_000_003, STAY_MAIN);

  it("keeps each item's long-run rate (dizziness on about 15% of answered days)", () => {
    expect(typical.dizzinessRate).toBeCloseTo(TYPICAL.dizziness, 1);
    expect(clustered.dizzinessRate).toBeCloseTo(TYPICAL.dizziness, 1);
    expect(clusteredAlt.dizzinessRate).toBeCloseTo(TYPICAL.dizziness, 1);
    expect(clusteredLow.dizzinessRate).toBeCloseTo(TYPICAL.dizziness, 1);
  });

  it("flags more changes than with independent days (loose bands; exact figures in timeline-null.json)", () => {
    expect(clustered.signal).toBeGreaterThan(typical.signal);
    expect(clustered.signal).toBeGreaterThan(0.5);
    expect(clustered.signal).toBeLessThan(0.98);
    // More persistence, more false alarms: independent < stay 0.3 < stay 0.5 < stay 0.8.
    expect(clusteredLow.signal).toBeGreaterThan(typical.signal);
    expect(clusteredAlt.signal).toBeGreaterThan(clusteredLow.signal);
    expect(clustered.signal).toBeGreaterThan(clusteredAlt.signal);
    expect(clustered.strong).toBeGreaterThan(typical.strong);
  });

  it("is disclosed in MULTIPLE_COMPARISONS_NOTE with the measured figure, rounded plainly", () => {
    const moderateInTen = Math.round(clustered.signal * 10);
    const strongInTen = Math.round(clustered.strong * 10);
    expect(MULTIPLE_COMPARISONS_NOTE).toContain(
      `in a clustered-days simulation about ${moderateInTen} in 10 medicine changes showed a moderate signal and about ${strongInTen} in 10 a strong one`,
    );
  });

  it("writes eval/results/timeline-null.json", () => {
    writeResultsIfChanged(fileURLToPath(RESULTS_PATH), {
      generatedAt: process.env.EVAL_TIMESTAMP ?? new Date().toISOString(),
      method:
        "src/engine/timeline/signals.null.test.ts: 45-day simulated diaries, 15% of days unanswered, a medicine started 16 days ago, " +
        "no real effect. Independent: every day drawn afresh. Clustered: each item repeats yesterday's answer with probability `stay`, " +
        "otherwise it is drawn from the same base rate (same long-run rates). Rates are the share of simulated changes with at least one " +
        "moderate-or-strong signal (moderateRate), at least one strong signal (strongRate), or any weak-or-stronger difference. " +
        "Each row uses n = 1,000 simulated changes, so it is noisier than the 8,000-change figures in rules.ts and docs/EVALUATION.md " +
        "(e.g. independent strongRate 0.003 = 3 of 1,000 vs about 0.8% with 8,000; the app's 'about 1 in 100' rounds the 8,000-change figure). " +
        "stay values are assumed levels of clustering, not measured from real diaries.",
      independent: { scenario: "typical", ...asResult(typical) },
      clustered: { scenario: "typical", stay: STAY_MAIN, ...asResult(clustered) },
      additional: [
        { scenario: "typical", stay: STAY_ALT, ...asResult(clusteredAlt) },
        { scenario: "typical", stay: STAY_LOW, ...asResult(clusteredLow) },
        { scenario: "frequent", stay: 0, ...asResult(frequent) },
        { scenario: "frequent", stay: STAY_MAIN, ...asResult(clusteredFrequent) },
      ],
    });
    expect(existsSync(RESULTS_PATH)).toBe(true);
  });
});
