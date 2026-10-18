// Tests for the runs-aware before/after check (blockPermutation.ts).
// The series below are written out by hand so each case can be checked by eye: 1 = symptom recorded, 0 = not,
// null = question not answered (or no check-in that day).
import { describe, expect, it } from "vitest";
import { blockPermutationTest, mulberry32, stableHash } from "./blockPermutation";
import { fisherExact } from "./stats";

const OPTS = { blockDays: 4, permutations: 999, seed: 12345 };

/** `n` copies of `v`. */
const rep = (v: number | null, n: number): (number | null)[] => Array.from({ length: n }, () => v);

describe("blockPermutationTest", () => {
  it("gives a small p for a clearly separated before/after series", () => {
    // 21 quiet days, then 21 days with the symptom every day.
    const series = [...rep(0, 21), ...rep(1, 21)];
    const r = blockPermutationTest(series, 21, OPTS);
    expect(r.observed).toBeCloseTo(1, 12);
    expect(r.p).toBeLessThan(0.01);
    expect(r.permutations).toBe(999);
    expect(r.blockDays).toBe(4);
  });

  it("gives a small p for 1–5 ratings that drop after the change", () => {
    const series = [...rep(4, 20), ...rep(2, 20)];
    const r = blockPermutationTest(series, 20, OPTS);
    expect(r.observed).toBeCloseTo(2, 12);
    expect(r.p).toBeLessThan(0.01);
  });

  it("gives a large p when the difference is one long run of days straddling the change", () => {
    // A 16-day bad spell from day 15 to day 30 (6 days before the change at day 21, 10 after).
    const series = [...rep(0, 15), ...rep(1, 16), ...rep(0, 11)];
    const r = blockPermutationTest(series, 21, OPTS);
    expect(r.observed).toBeCloseTo(4 / 21, 12);
    expect(r.p).toBeGreaterThan(0.3);
  });

  it("is more cautious than Fisher's test when the same counts come as one run ('a bad week stays a bad week')", () => {
    // Same counts both times: 2 of 21 days before, 10 of 21 after. Fisher's test cannot tell the two apart.
    const fisherP = fisherExact(10, 11, 2, 19);
    expect(fisherP).toBeLessThan(0.05);
    // Scattered: symptom days spread out on both sides.
    const scattered: number[] = [...rep(0, 42)] as number[];
    for (const i of [4, 14]) scattered[i] = 1;
    for (let i = 21; i < 41; i += 2) scattered[i] = 1;
    // One run: the 12 symptom days in a row around the change (days 19–30).
    const run = [...rep(0, 19), ...rep(1, 12), ...rep(0, 11)];
    const pScattered = blockPermutationTest(scattered, 21, OPTS).p;
    const pRun = blockPermutationTest(run, 21, OPTS).p;
    expect(pScattered).toBeLessThan(0.05);
    expect(pRun).toBeGreaterThan(pScattered);
    expect(pRun).toBeGreaterThan(0.05);
  });

  it("is deterministic: the same input and seed give the same p, a different seed may not", () => {
    const series = [0, 1, null, 0, 0, 1, 0, null, 0, 0, 1, 1, 0, 1, 1, null, 1, 0, 1, 1];
    const a = blockPermutationTest(series, 10, OPTS);
    const b = blockPermutationTest([...series], 10, OPTS);
    expect(b).toEqual(a);
    expect(a.p).toBeGreaterThan(0);
    expect(a.p).toBeLessThanOrEqual(1);
  });

  it("caches results without letting one call change another's answer", () => {
    const series = [...rep(0, 10), ...rep(1, 10)];
    const first = blockPermutationTest(series, 10, OPTS);
    first.p = 42; // a caller mutating its copy must not reach the cache
    expect(blockPermutationTest(series, 10, OPTS).p).not.toBe(42);
    // A different series, change index or seed is a different question.
    const other = [...rep(0, 10), ...rep(1, 9), 0];
    expect(blockPermutationTest(other, 10, OPTS).observed).toBeCloseTo(0.9, 12);
    expect(blockPermutationTest(series, 12, OPTS).observed).not.toBeCloseTo(1, 6);
  });

  it("returns p = 1 for an all-null window and when one side has no answered days", () => {
    expect(blockPermutationTest(rep(null, 30), 15, OPTS)).toMatchObject({ p: 1, observed: 0 });
    expect(blockPermutationTest([...rep(null, 15), ...rep(1, 15)], 15, OPTS)).toMatchObject({ p: 1, observed: 0 });
    expect(blockPermutationTest([], 0, OPTS)).toMatchObject({ p: 1, observed: 0 });
  });

  it("ignores unanswered days rather than counting them as 'no'", () => {
    // Before: 1 of 2 answered days; after: 2 of 2. Nulls must not dilute either rate.
    const r = blockPermutationTest([1, null, 0, null, 1, null, 1, null], 4, OPTS);
    expect(r.observed).toBeCloseTo(0.5, 12);
  });

  it("p is never below 1 / (B + 1)", () => {
    const r = blockPermutationTest([...rep(0, 21), ...rep(1, 21)], 21, { ...OPTS, permutations: 99 });
    expect(r.p).toBeGreaterThanOrEqual(1 / 100);
  });

  it("rejects bad options (programming errors)", () => {
    expect(() => blockPermutationTest([0, 1], 1, { ...OPTS, blockDays: 0 })).toThrow(RangeError);
    expect(() => blockPermutationTest([0, 1], 1, { ...OPTS, permutations: 0 })).toThrow(RangeError);
    expect(() => blockPermutationTest([0, 1], 3, OPTS)).toThrow(RangeError);
  });
});

describe("seeding helpers", () => {
  it("stableHash is a fixed 32-bit FNV-1a hash", () => {
    // Reference values of 32-bit FNV-1a (offset basis 2166136261, prime 16777619).
    expect(stableHash("")).toBe(2166136261);
    expect(stableHash("a")).toBe(0xe40c292c);
    expect(stableHash("med-lorazepam:started:dizziness")).toBe(stableHash("med-lorazepam:started:dizziness"));
    expect(stableHash("med-lorazepam:started:dizziness")).not.toBe(stableHash("med-lorazepam:started:drowsiness"));
  });

  it("mulberry32 repeats the same sequence for the same seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
