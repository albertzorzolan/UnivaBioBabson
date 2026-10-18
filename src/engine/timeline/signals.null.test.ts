// False-alarm rate under the null: how often does a medicine change with NO real effect still produce a signal?
//
// The engine compares 9 diary items per change without a multiple-comparison correction, so this rate must be
// measured and disclosed honestly (MULTIPLE_COMPARISONS_NOTE, TIMELINE_METHOD_SUMMARY). This test simulates
// diaries whose answers are drawn from the same distribution before and after a start, and fails if the
// user-facing text drifts from the measured rates. It also documents why "weak" differences are not flagged.
//
// Simulation: 45 days of diary ending today, each day missing with probability `missing`; yes/no items drawn with
// fixed base rates; 1–5 ratings = round(mean + uniform(−1.1, 1.1)) clamped to 1–5; a medicine started today − 16.
// mulberry32 with fixed seeds, so the result is deterministic. 1,000 changes per scenario; with 8,000 per scenario
// the rates were: typical 10.7–11.0% signal / 0.7–0.8% strong / 51% weak-or-stronger; frequent 17.9–19.2% /
// 2.7–2.8% / 66%. The user-facing text quotes the 1,000-change figures written to timeline-null.json.
//
// Clustered days. Independent days are optimistic: real symptoms come in runs (a bad week, a cold), and runs make
// chance before/after differences larger. The clustered scenario keeps the same base rates but makes every item a
// two-state Markov chain: each day, with probability `stay` the answer repeats yesterday's, otherwise it is drawn
// afresh from the same base rate. This leaves each item's long-run rate unchanged (checked below) and gives a
// day-to-day correlation of `stay`. The chain also runs on unanswered days.
//
// Runs check. Every simulated change also gets the runs-aware check (blockPermutation.ts), with B = 199 shuffles
// instead of the app's 999 to keep this test fast (p then moves in steps of 0.005, fine for the 0.01 and 0.05 bars).
// From one simulation we count both: "without the gate" = the Fisher / Mann–Whitney strength alone; "with the gate"
// = gatedStrength (a strength must also clear its p bar in the runs check). The runs check has its own seeded
// random numbers, so the diaries, and the rates without the gate, are exactly those of the earlier version of this
// test. Power: the same simulation with a real change (dizziness on 15% of days before the start, 45% from the start
// day on), counting how often dizziness is flagged. Results: eval/results/timeline-null.json.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CheckIn, DiaryAnswers } from "../../model/types";
import { addDays } from "../../model/dates";
import { getMetric, latestCheckInPerDate } from "./metrics";
import { LOW_POWER_BRIEF_LINE, LOW_POWER_NOTE, MULTIPLE_COMPARISONS_NOTE, TIMELINE_METHOD_SUMMARY, TIMELINE_RULES } from "./rules";
import type { MetricComparison } from "./signals";
import { analyzeEvent, classifyStrength, gatedStrength, isSignalStrength } from "./signals";
import { makeMed } from "./test-fixtures";
import { writeResultsIfChanged } from "../../../eval/writeResults";

const TODAY = "2026-10-10";
const N = 1000;
/** Shuffles per runs check in this study (the app uses TIMELINE_RULES.runsCheck.permutations = 999). */
const B = 199;
const START_OFFSET = -16;
/** Day-to-day persistence in the clustered scenarios (0 = independent days). */
const STAY_MAIN = 0.8;
const STAY_ALT = 0.5;
const STAY_LOW = 0.3;
/** Power scenario: dizziness on 15% of days before the start and 45% from the start day on. */
const POWER_AFTER_RATE = 0.45;
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

/** Share of simulated changes with ≥1 moderate-or-strong signal (`signal`) and with ≥1 strong signal. */
interface Flagged {
  signal: number;
  strong: number;
}

interface Rates extends Flagged {
  /** ≥1 comparison of any strength including weak — what flagging "weak" would have produced. */
  weakOrStronger: number;
  /** The same simulated changes with the runs-check gate applied. */
  gated: Flagged;
  /** Share of answered days before the start with dizziness = yes (checks that clustering kept the base rate). */
  dizzinessRate: number;
  /** Share of changes where dizziness itself is flagged as worse (the power scenario's detection rate). */
  dizzinessFlagged: number;
  dizzinessFlaggedGated: number;
}

/** Strength without and with the runs-check gate, whatever TIMELINE_RULES.runsCheck.gate says. */
function strengths(c: MetricComparison): { plain: MetricComparison["strength"]; gated: MetricComparison["strength"] } {
  if (!c.tested || c.pValue === null || c.runsCheck === null) return { plain: "none", gated: "none" };
  const kind = getMetric(c.metric).kind;
  return { plain: classifyStrength(kind, c.pValue, c.diff), gated: gatedStrength(kind, c.pValue, c.runsCheck.p, c.diff) };
}

/** Flagged as a signal: moderate or strong, and not "same" (as in analyzeEvent). */
const flagged = (c: MetricComparison, s: MetricComparison["strength"]) => isSignalStrength(s) && c.direction !== "same";

/**
 * Simulate N medicine changes. `stay` = 0 draws every day independently (the original scenario, unchanged random
 * sequence); `stay` > 0 makes each item repeat yesterday's answer with that probability. `dizzinessAfter` (power
 * scenario) is the dizziness base rate from the start day on; by default there is no real effect.
 */
function simulate(sc: Scenario, seedBase: number, stay = 0, dizzinessAfter = sc.dizziness): Rates {
  const med = makeMed("med-new", "New pill", addDays(TODAY, START_OFFSET));
  const change = { medicationId: med.id, kind: "started" as const, date: med.startDate };
  const count = { signal: 0, strong: 0, gatedSignal: 0, gatedStrong: 0, weakOrStronger: 0, dizzy: 0, dizzyGated: 0 };
  let baselineAnswered = 0;
  let baselineDizzy = 0;
  for (let trial = 0; trial < N; trial++) {
    const r = mulberry32(seedBase + trial * 7919);
    const checkIns: CheckIn[] = [];
    // Yesterday's underlying answers; only kept in the clustered scenario, so `stay` = 0 draws no extra numbers.
    let prev: DiaryAnswers | null = null;
    const rating = (mean: number) => Math.max(1, Math.min(5, Math.round(mean + (r() - 0.5) * 2.2))) as DiaryAnswers["energy"];
    /** Yesterday's value with probability `stay`, otherwise a fresh draw from the base rate. */
    const pick = <K extends keyof DiaryAnswers>(key: K, fresh: () => DiaryAnswers[K]): DiaryAnswers[K] =>
      prev !== null && r() < stay ? prev[key] : fresh();
    const draw = (offset: number): DiaryAnswers => ({
      energy: pick("energy", () => rating(sc.energy)),
      sleep: pick("sleep", () => rating(sc.sleep)),
      appetite: pick("appetite", () => (r() < sc.appetiteWorse ? "worse" : "same")),
      dizziness: pick("dizziness", () => r() < (offset >= START_OFFSET ? dizzinessAfter : sc.dizziness)),
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
        answers = draw(offset);
        prev = answers;
        if (r() < sc.missing) continue;
      } else {
        if (r() < sc.missing) continue;
        answers = draw(offset);
      }
      if (offset < START_OFFSET) {
        baselineAnswered++;
        if (answers.dizziness) baselineDizzy++;
      }
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
    const ev = analyzeEvent({
      days: latestCheckInPerDate(checkIns),
      med,
      change,
      meds: [med],
      today: TODAY,
      runsCheckPermutations: B,
    });
    const rows = ev.comparisons.map((c) => ({ c, ...strengths(c) }));
    if (rows.some((x) => flagged(x.c, x.plain))) count.signal++;
    if (rows.some((x) => flagged(x.c, x.plain) && x.plain === "strong")) count.strong++;
    if (rows.some((x) => flagged(x.c, x.gated))) count.gatedSignal++;
    if (rows.some((x) => flagged(x.c, x.gated) && x.gated === "strong")) count.gatedStrong++;
    if (rows.some((x) => x.plain !== "none" && x.c.direction !== "same")) count.weakOrStronger++;
    const dizzy = rows.find((x) => x.c.metric === "dizziness")!;
    if (flagged(dizzy.c, dizzy.plain) && dizzy.c.direction === "worse") count.dizzy++;
    if (flagged(dizzy.c, dizzy.gated) && dizzy.c.direction === "worse") count.dizzyGated++;
  }
  return {
    signal: count.signal / N,
    strong: count.strong / N,
    weakOrStronger: count.weakOrStronger / N,
    gated: { signal: count.gatedSignal / N, strong: count.gatedStrong / N },
    dizzinessRate: baselineDizzy / baselineAnswered,
    dizzinessFlagged: count.dizzy / N,
    dizzinessFlaggedGated: count.dizzyGated / N,
  };
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const asResult = (r: Rates) => ({
  moderateRate: round4(r.signal),
  strongRate: round4(r.strong),
  weakOrStrongerRate: round4(r.weakOrStronger),
  n: N,
  gated: { moderateRate: round4(r.gated.signal), strongRate: round4(r.gated.strong), n: N, B },
});

/**
 * A rate in plain words, never rounded up: 0.858 → "more than 8 in 10", 0.192 → "nearly 2 in 10",
 * 0.036 → "more than 3 in 100", 0.003 → "fewer than 1 in 100". Rates under 1 in 10 are put "in 100".
 */
function inWords(rate: number): string {
  const scale = rate >= 0.1 ? 10 : 100;
  const x = rate * scale;
  const k = Math.floor(x + 1e-9);
  if (k === 0) return `fewer than 1 in ${scale}`;
  if (x - k < 0.05) return `about ${k} in ${scale}`;
  if (k + 1 - x <= 0.1) return `nearly ${k + 1} in ${scale}`;
  return `more than ${k} in ${scale}`;
}

// One simulation per scenario, shared by every test below (~1 s each).
const typical = simulate(TYPICAL, 3);
const frequent = simulate(FREQUENT, 1_000_003);
const clustered = simulate(TYPICAL, 3, STAY_MAIN);
const clusteredAlt = simulate(TYPICAL, 3, STAY_ALT);
const clusteredLow = simulate(TYPICAL, 3, STAY_LOW);
const clusteredFrequent = simulate(FREQUENT, 1_000_003, STAY_MAIN);
const power = simulate(TYPICAL, 2_000_003, 0, POWER_AFTER_RATE);
const powerClustered = simulate(TYPICAL, 2_000_003, STAY_MAIN, POWER_AFTER_RATE);

describe("inWords (the rounding rule for the user-facing rates)", () => {
  it.each([
    [0.858, "more than 8 in 10"],
    [0.61, "more than 6 in 10"],
    [0.112, "more than 1 in 10"],
    [0.192, "nearly 2 in 10"],
    [0.302, "about 3 in 10"],
    [0.036, "more than 3 in 100"],
    [0.003, "fewer than 1 in 100"],
    [0, "fewer than 1 in 100"],
  ])("%f → %s", (rate, words) => {
    expect(inWords(rate)).toBe(words);
  });
});

describe("false-alarm rate with no real change, independent days (Fisher / Mann–Whitney alone)", () => {
  it("flags more than 1 in 10 changes for typical diaries", () => {
    expect(typical.signal).toBeGreaterThan(0.07);
    expect(typical.signal).toBeLessThan(0.15);
  });

  it("flags nearly 2 in 10 when symptoms are recorded often", () => {
    expect(frequent.signal).toBeGreaterThan(0.14);
    expect(frequent.signal).toBeLessThan(0.23);
  });

  it("rarely produces a strong signal", () => {
    expect(typical.strong).toBeLessThan(0.02);
    expect(frequent.strong).toBeLessThan(0.05);
  });

  it("would flag about half of all changes if weak differences were signals — which is why they are not", () => {
    expect(typical.weakOrStronger).toBeGreaterThan(0.4);
    expect(frequent.weakOrStronger).toBeGreaterThan(0.55);
  });
});

describe("false-alarm rate when symptoms cluster in runs of days (same base rates)", () => {
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
});

describe("the runs-check gate, measured with and without", () => {
  const all = [typical, frequent, clustered, clusteredAlt, clusteredLow, clusteredFrequent];

  it("can only lower the false-alarm rate (it adds a requirement)", () => {
    for (const r of all) {
      expect(r.gated.signal).toBeLessThanOrEqual(r.signal);
      expect(r.gated.strong).toBeLessThanOrEqual(r.strong);
    }
  });

  it("lowers false alarms more where days come in runs", () => {
    expect(clustered.signal - clustered.gated.signal).toBeGreaterThan(typical.signal - typical.gated.signal);
  });

  it("can only lower the chance of flagging a real change too (power)", () => {
    expect(power.dizzinessFlaggedGated).toBeLessThanOrEqual(power.dizzinessFlagged);
    expect(powerClustered.dizzinessFlaggedGated).toBeLessThanOrEqual(powerClustered.dizzinessFlagged);
    expect(power.dizzinessFlagged).toBeGreaterThan(0.2); // a 30-point rise is flagged often, but far from always
  });
});

describe("the user-facing text quotes the measured rates (never rounded up)", () => {
  // The app's flagged signals use the gate only when TIMELINE_RULES.runsCheck.gate is on, so the text quotes the
  // rates of the rule the app applies, and the other rule's clustered-days rates as the comparison.
  const shown = (r: Rates): Flagged => (TIMELINE_RULES.runsCheck.gate ? r.gated : r);
  const other = (r: Rates): Flagged => (TIMELINE_RULES.runsCheck.gate ? r : r.gated);

  it("MULTIPLE_COMPARISONS_NOTE: independent days, typical and frequent symptoms", () => {
    expect(MULTIPLE_COMPARISONS_NOTE).toContain(
      `In simulated diaries with no real change, ${inWords(shown(typical).signal)} medicine changes still showed a ` +
        `moderate signal and ${inWords(shown(typical).strong)} a strong one (${inWords(shown(frequent).signal)} and ` +
        `${inWords(shown(frequent).strong)} when symptoms were recorded often).`,
    );
  });

  it("MULTIPLE_COMPARISONS_NOTE: clustered days", () => {
    expect(MULTIPLE_COMPARISONS_NOTE).toContain(
      `in a clustered-days simulation ${inWords(shown(clustered).signal)} medicine changes showed a moderate signal ` +
        `and ${inWords(shown(clustered).strong)} a strong one.`,
    );
  });

  it("MULTIPLE_COMPARISONS_NOTE: the runs check and what it changes, ending on its role", () => {
    const o = other(clustered);
    expect(MULTIPLE_COMPARISONS_NOTE).toContain(
      `requiring it would still have left ${inWords(o.signal)} changes with a moderate signal and ${inWords(o.strong)} with a strong one`,
    );
    // Says whether the check changes what is flagged, as TIMELINE_RULES.runsCheck.gate does.
    expect(MULTIPLE_COMPARISONS_NOTE.includes("It does not yet change which differences are flagged")).toBe(!TIMELINE_RULES.runsCheck.gate);
    expect(MULTIPLE_COMPARISONS_NOTE).toMatch(/A signal is a prompt for a conversation, not a conclusion\.$/);
  });

  it("TIMELINE_METHOD_SUMMARY: the independent-days rate and the runs check", () => {
    expect(TIMELINE_METHOD_SUMMARY).toContain(`${inWords(shown(typical).signal)} medicine changes with no real effect`);
    expect(TIMELINE_METHOD_SUMMARY).toContain(`(${inWords(shown(frequent).signal)} when symptoms are recorded often)`);
    expect(TIMELINE_METHOD_SUMMARY).toContain(`runs of ${TIMELINE_RULES.runsCheck.blockDays} days`);
    expect(TIMELINE_METHOD_SUMMARY).toContain(`${TIMELINE_RULES.runsCheck.permutations} times`);
    expect(TIMELINE_METHOD_SUMMARY.includes("does not yet change which differences are flagged")).toBe(!TIMELINE_RULES.runsCheck.gate);
  });
});

describe("LOW_POWER_NOTE quotes the measured power (never rounded up); LOW_POWER_BRIEF_LINE states it without a figure", () => {
  // "No flagged difference is not an all-clear": the power scenario is a real tripling of dizziness days
  // (15% → 45%), and the note says it was flagged fewer than 4 times in 10. That wording holds while the measured
  // rate stays in [0.3, 0.4): at 0.4 or more "fewer than 4" is false; below 0.3 it would understate the gap.
  it("describes the simulated scenario: a tripling, with 2–3 weeks of entries on each side", () => {
    expect(POWER_AFTER_RATE / TYPICAL.dizziness).toBeCloseTo(3, 9);
    expect(LOW_POWER_NOTE).toContain("even a tripling of dizziness days");
    // Before window: 21 days; after window: start day to today = 17 days (≈ 2.4 weeks).
    expect(TIMELINE_RULES.windowDays).toBe(21);
    expect(-START_OFFSET + 1).toBeGreaterThanOrEqual(14);
    // The weeks are the windows on each side of the change, not the diary's length (a longer diary is not compared).
    expect(LOW_POWER_NOTE).toContain("with 2–3 weeks of entries before and after a new medicine");
  });

  it("says 'fewer than 4 times in 10', as the simulation measures, with independent and with clustered days", () => {
    expect(LOW_POWER_NOTE).toContain("was flagged fewer than 4 times in 10");
    // The brief's clause carries no figure, so it cannot drift; "can go unflagged" holds while power is this low.
    expect(LOW_POWER_BRIEF_LINE).toBe("A real change can go unflagged.");
    expect(LOW_POWER_BRIEF_LINE).not.toMatch(/\d/);
    for (const r of [power, powerClustered]) {
      expect(r.dizzinessFlagged).toBeGreaterThanOrEqual(0.3);
      expect(r.dizzinessFlagged).toBeLessThan(0.4);
    }
  });

  it("matches the committed eval/results/timeline-null.json (power[0].detectionRate)", () => {
    const committed = JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as { power: { detectionRate: number; afterRate: number; beforeRate: number }[] };
    const [p0] = committed.power;
    expect(p0.beforeRate).toBe(TYPICAL.dizziness);
    expect(p0.afterRate).toBe(POWER_AFTER_RATE);
    expect(p0.detectionRate).toBeGreaterThanOrEqual(0.3);
    expect(p0.detectionRate).toBeLessThan(0.4);
  });
});

describe("eval/results/timeline-null.json", () => {
  it("is written with the rates with and without the gate, the power study, n and B", () => {
    writeResultsIfChanged(fileURLToPath(RESULTS_PATH), {
      generatedAt: process.env.EVAL_TIMESTAMP ?? new Date().toISOString(),
      method:
        "src/engine/timeline/signals.null.test.ts: 45-day simulated diaries, 15% of days unanswered, a medicine started 16 days ago, " +
        "no real effect. Independent: every day drawn afresh. Clustered: each item repeats yesterday's answer with probability `stay`, " +
        "otherwise it is drawn from the same base rate (same long-run rates). Rates are the share of simulated changes with at least one " +
        "moderate-or-strong signal (moderateRate), at least one strong signal (strongRate), or any weak-or-stronger difference, " +
        "from Fisher's exact / Mann-Whitney alone. `gated` = the same simulated changes when a strength must also clear its p bar " +
        "(strong 0.01, moderate 0.05) in the runs check, a seeded circular block-permutation test (src/engine/timeline/blockPermutation.ts) " +
        "with blocks of runsCheck.blockDays days and runsCheck.B shuffles per comparison (the app uses runsCheck.appPermutations). " +
        "runsCheck.gate says whether the app applies the gate (false = computed and reported, strengths unchanged). " +
        "`power` = the same simulation with a real change (dizziness on 15% of days before the start, 45% from the start day on): the " +
        "share of simulated changes where dizziness is flagged as worse. Each row uses n = 1,000 simulated changes, so it is noisier " +
        "than the 8,000-change figures in the test header (e.g. independent strongRate 0.003 = 3 of 1,000 vs about 0.8% with 8,000). " +
        "stay values are assumed levels of clustering, not measured from real diaries.",
      runsCheck: {
        blockDays: TIMELINE_RULES.runsCheck.blockDays,
        B,
        appPermutations: TIMELINE_RULES.runsCheck.permutations,
        gate: TIMELINE_RULES.runsCheck.gate,
      },
      independent: { scenario: "typical", ...asResult(typical) },
      clustered: { scenario: "typical", stay: STAY_MAIN, ...asResult(clustered) },
      additional: [
        { scenario: "typical", stay: STAY_ALT, ...asResult(clusteredAlt) },
        { scenario: "typical", stay: STAY_LOW, ...asResult(clusteredLow) },
        { scenario: "frequent", stay: 0, ...asResult(frequent) },
        { scenario: "frequent", stay: STAY_MAIN, ...asResult(clusteredFrequent) },
      ],
      power: [
        { stay: 0, r: power },
        { stay: STAY_MAIN, r: powerClustered },
      ].map(({ stay, r }) => ({
        scenario: "typical",
        stay,
        metric: "dizziness",
        beforeRate: TYPICAL.dizziness,
        afterRate: POWER_AFTER_RATE,
        n: N,
        B,
        detectionRate: round4(r.dizzinessFlagged),
        gatedDetectionRate: round4(r.dizzinessFlaggedGated),
      })),
    });
    expect(existsSync(RESULTS_PATH)).toBe(true);
  });
});
