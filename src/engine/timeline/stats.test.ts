// Statistics tests. Reference numbers and their sources:
// - Fisher exact: R `fisher.test` documentation (tea-tasting: p = 0.4857), Wikipedia's worked example
//   ([[1,9],[11,3]]: p ≈ 0.002759), the closed form 2 / C(20,10) for [[10,0],[0,10]], and exact rational
//   arithmetic (Python `fractions`, hypergeometric enumeration) for the remaining tables. An independent BigInt
//   implementation in this file cross-checks hundreds of random tables exactly.
// - Mann–Whitney: R `?wilcox.test` example (Hollander & Wolfe 1973, p. 69): W = 35, one-sided exact p = 0.1272,
//   so two-sided exact p = 0.2544; other values from exact enumeration with Python integers (all subsets / generating
//   function) and the normal approximation computed with Python's `math.erfc` using R's formula
//   (tie-corrected variance, 0.5 continuity correction). Brute-force enumeration in this file cross-checks the DP.
// - erfc: Python `math.erfc` (C libm).
import { describe, expect, it } from "vitest";
import {
  MANN_WHITNEY_EXACT_LIMIT,
  erfc,
  fisherExact,
  formatPValue,
  logFactorial,
  mannWhitneyU,
  normalCdf,
  normalTwoSidedP,
} from "./stats";

/** Relative-error assertion suitable for p-values spanning many orders of magnitude. */
function expectRel(actual: number, expected: number, tol = 1e-9): void {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(tol);
    return;
  }
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(tol);
}

/** Deterministic PRNG (mulberry32) for property tests. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Independent exact Fisher implementation (BigInt binomials, exact comparison of probabilities) -------------
function binom(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
  return r;
}
function fisherBigInt(a: number, b: number, c: number, d: number): number {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(r1, c1);
  const den = binom(r1 + r2, c1);
  const obs = binom(r1, a) * binom(r2, c1 - a);
  let num = 0n;
  for (let k = lo; k <= hi; k++) {
    const w = binom(r1, k) * binom(r2, c1 - k);
    if (w <= obs) num += w;
  }
  // Scale to keep precision when converting the ratio of two big integers.
  return Number((num * 10n ** 18n) / den) / 1e18;
}

// --- Brute-force exact Mann–Whitney (enumerate every subset) ---------------------------------------------------
function bruteForceMW(x: number[], y: number[]): { u: number; p: number } {
  const pooled = [...x, ...y];
  const sorted = [...pooled].sort((p, q) => p - q);
  const rankOf = (v: number) => {
    const first = sorted.indexOf(v);
    const last = sorted.lastIndexOf(v);
    return (first + last + 2) / 2;
  };
  const ranks = pooled.map(rankOf);
  const n1 = x.length;
  const obs = ranks.slice(0, n1).reduce((s, r) => s + r, 0);
  let lower = 0;
  let upper = 0;
  let total = 0;
  const pick = (start: number, left: number, sum: number) => {
    if (left === 0) {
      total++;
      if (sum <= obs + 1e-9) lower++;
      if (sum >= obs - 1e-9) upper++;
      return;
    }
    for (let i = start; i <= pooled.length - left; i++) pick(i + 1, left - 1, sum + ranks[i]);
  };
  pick(0, n1, 0);
  return { u: obs - (n1 * (n1 + 1)) / 2, p: Math.min(1, (2 * Math.min(lower, upper)) / total) };
}

describe("logFactorial", () => {
  it("matches ln(n!) for small n", () => {
    expect(logFactorial(0)).toBe(0);
    expect(logFactorial(1)).toBe(0);
    expectRel(logFactorial(5), Math.log(120), 1e-14);
    expectRel(logFactorial(20), Math.log(2432902008176640000), 1e-14);
  });
});

describe("fisherExact (two-sided)", () => {
  it.each([
    // [a, b, c, d, expected two-sided p, source]
    [8, 2, 5, 13, 0.016323417238749048, "R fisher.test(matrix(c(8,5,2,13),2)) — exact rational"],
    [3, 1, 1, 3, 0.4857142857142857, "Fisher's tea-tasting, R ?fisher.test: 0.4857"],
    [10, 0, 0, 10, 1.082508822446903e-5, "2 / choose(20,10)"],
    [1, 9, 11, 3, 0.0027594561852200836, "Wikipedia worked example (dieting)"],
    [6, 2, 1, 4, 0.10256410256410256, "exact rational"],
    [2, 10, 15, 3, 0.0005367241191434358, "R ?fisher.test 'Convictions' table — exact rational"],
    [0, 15, 4, 11, 0.09961685823754789, "exact rational"],
    [7, 6, 3, 12, 0.11406777814100469, "exact rational"],
    [1, 12, 0, 15, 0.4642857142857143, "exact rational"],
    [10, 3, 1, 14, 0.0002669717772692601, "exact rational"],
  ])("[[%i,%i],[%i,%i]] → %f (%s)", (a, b, c, d, expected) => {
    expectRel(fisherExact(a, b, c, d), expected as number, 1e-9);
  });

  it("is invariant to transposing and swapping rows or columns", () => {
    const p = fisherExact(8, 2, 5, 13);
    expectRel(fisherExact(8, 5, 2, 13), p, 1e-12); // transpose
    expectRel(fisherExact(5, 13, 8, 2), p, 1e-12); // swap rows
    expectRel(fisherExact(2, 8, 13, 5), p, 1e-12); // swap columns
  });

  it("returns 1 for degenerate tables (only one table fits the margins)", () => {
    expect(fisherExact(0, 0, 0, 0)).toBe(1);
    expect(fisherExact(0, 0, 5, 5)).toBe(1); // empty first row
    expect(fisherExact(0, 5, 0, 5)).toBe(1); // empty first column
    expect(fisherExact(7, 0, 4, 0)).toBe(1); // empty second column
  });

  it("returns 1 for identical rates", () => {
    expectRel(fisherExact(5, 5, 5, 5), 1, 1e-12);
  });

  it("rejects negative, fractional or non-finite counts", () => {
    expect(() => fisherExact(-1, 2, 3, 4)).toThrow(RangeError);
    expect(() => fisherExact(1, 2.5, 3, 4)).toThrow(RangeError);
    expect(() => fisherExact(1, 2, Number.NaN, 4)).toThrow(RangeError);
    expect(() => fisherExact(1, 2, 3, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("agrees with an independent exact BigInt implementation on 300 random tables", () => {
    const rand = rng(20261013);
    for (let i = 0; i < 300; i++) {
      const cell = () => Math.floor(rand() * 16);
      const [a, b, c, d] = [cell(), cell(), cell(), cell()];
      const p = fisherExact(a, b, c, d);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(Math.abs(p - fisherBigInt(a, b, c, d))).toBeLessThan(1e-10);
    }
  });
});

describe("erfc and the normal distribution", () => {
  it.each([
    [0.5, 0.4795001221869535],
    [1, 0.15729920705028516],
    [1.96, 0.005573724535172132],
    [2, 0.0046777349810472645],
    [3, 2.2090496998585438e-5],
    [5, 1.537459794428035e-12],
    [8, 1.1224297172982926e-29],
  ])("erfc(%f) matches libm", (x, expected) => {
    expectRel(erfc(x), expected, 1e-12);
  });

  it("handles 0, negative arguments, NaN and underflow", () => {
    expect(erfc(0)).toBe(1);
    expectRel(erfc(-1), 2 - 0.15729920705028516, 1e-14);
    expect(Number.isNaN(erfc(Number.NaN))).toBe(true);
    expect(erfc(30)).toBe(0);
  });

  it("gives familiar normal values", () => {
    expectRel(normalCdf(1.959963984540054), 0.975, 1e-12);
    expectRel(normalCdf(0), 0.5, 1e-15);
    expectRel(normalTwoSidedP(1.959963984540054), 0.05, 1e-10);
    expectRel(normalTwoSidedP(-1.959963984540054), 0.05, 1e-10);
    expect(normalTwoSidedP(0)).toBe(1);
  });
});

describe("mannWhitneyU (two-sided)", () => {
  const hwX = [0.8, 0.83, 1.89, 1.04, 1.45, 1.38, 1.91, 1.64, 0.73, 1.46];
  const hwY = [1.15, 0.88, 0.9, 0.74, 1.21];

  it("reproduces R's ?wilcox.test example exactly (W = 35, two-sided p = 2 × 0.1272)", () => {
    const r = mannWhitneyU(hwX, hwY);
    expect(r.method).toBe("exact");
    expect(r.u).toBe(35);
    expect(r.z).toBeNull();
    expectRel(r.p, 0.2544122544122544, 1e-12);
  });

  it("reproduces the normal approximation with continuity correction (R: exact = FALSE)", () => {
    const r = mannWhitneyU(hwX, hwY, { method: "normal" });
    expect(r.method).toBe("normal");
    expect(r.u).toBe(35);
    expectRel(r.p, 0.24462360512698328, 1e-10);
    expect(r.z).toBeGreaterThan(0);
  });

  it("handles heavy ties exactly and by normal approximation (1–5 ratings)", () => {
    const x = [2, 2, 3, 1, 2, 2, 3, 2];
    const y = [4, 3, 4, 3, 5, 4, 3, 4];
    const exact = mannWhitneyU(x, y);
    expect(exact.u).toBe(3);
    expectRel(exact.p, 0.001554001554001554, 1e-10); // all-subsets enumeration, Python integers
    const normal = mannWhitneyU(x, y, { method: "normal" });
    expectRel(normal.p, 0.0018733772679604508, 1e-10); // tie-corrected variance
    expect(normal.z).toBeLessThan(0);
  });

  it("matches the exact tied distribution for a diary-sized sample (13 vs 15 ratings)", () => {
    const after = [2, 3, 2, 2, 1, 3, 2, 2, 3, 2, 2, 1, 2];
    const before = [4, 3, 4, 3, 4, 4, 3, 3, 4, 4, 5, 3, 4, 3, 4];
    const r = mannWhitneyU(after, before);
    expect(r.method).toBe("exact"); // 13 × 15 = 195 ≤ 441
    expect(r.u).toBe(9);
    expectRel(r.p, 4.4869206263741195e-6, 1e-9); // generating-function enumeration, Python integers
    expectRel(mannWhitneyU(after, before, { method: "normal" }).p, 2.3974697203740058e-5, 1e-9);
  });

  it("uses the exact method for the fullest diaries the 21-day windows allow (21 × 21)", () => {
    expect(MANN_WHITNEY_EXACT_LIMIT).toBeGreaterThanOrEqual(21 * 21);
    const rand = rng(21);
    const x = Array.from({ length: 21 }, () => 1 + Math.floor(rand() * 5));
    const y = Array.from({ length: 21 }, () => 2 + Math.floor(rand() * 4));
    const r = mannWhitneyU(x, y);
    expect(r.method).toBe("exact");
    expect(r.z).toBeNull();
    expect(r.p).toBeCloseTo(mannWhitneyU(x, y, { method: "exact" }).p, 15);
    // 20 × 21 and 21 × 20 too (one window a day short).
    expect(mannWhitneyU(x.slice(1), y).method).toBe("exact");
    expect(mannWhitneyU(x, y.slice(1)).method).toBe("exact");
  });

  it("uses the normal approximation above the exact limit", () => {
    const x = [1, 3, 5, 2, 4, 1, 3, 5, 2, 4, 1, 3, 5, 2, 4, 1, 3, 5, 2, 4, 1, 3, 5, 2, 4];
    const y = [5, 4, 2, 5, 5, 1, 4, 2, 5, 3, 1, 4, 5, 5, 3, 1, 5, 2, 5, 3];
    expect(x.length * y.length).toBeGreaterThan(MANN_WHITNEY_EXACT_LIMIT);
    const r = mannWhitneyU(x, y);
    expect(r.method).toBe("normal");
    expect(r.u).toBe(200);
    expectRel(r.p, 0.24700011341777087, 1e-9);
  });

  it("smallest possible exact p for 3 vs 3 is 2/20", () => {
    const r = mannWhitneyU([1, 2, 3], [4, 5, 6]);
    expect(r.u).toBe(0);
    expectRel(r.p, 0.1, 1e-12);
  });

  it("swapping samples mirrors U and keeps p", () => {
    const x = [3, 4, 2, 5, 3];
    const y = [3, 3, 4, 2, 3, 4];
    const a = mannWhitneyU(x, y);
    const b = mannWhitneyU(y, x);
    expect(a.u).toBe(16.5);
    expect(b.u).toBe(13.5);
    expect(a.u + b.u).toBe(x.length * y.length);
    expectRel(a.p, 0.9090909090909091, 1e-12);
    expectRel(b.p, a.p, 1e-12);
  });

  it("is exact for very unbalanced samples (1 vs 20) without blowing up", () => {
    const many = Array.from({ length: 20 }, (_, i) => i + 1);
    const r = mannWhitneyU([10], many);
    expect(r.method).toBe("exact");
    expect(r.u).toBe(9.5);
    expect(r.p).toBe(1);
    const extreme = mannWhitneyU([100], many);
    expectRel(extreme.p, 2 / 21, 1e-12);
    // Larger sample listed first: the DP enumerates the smaller side.
    const swapped = mannWhitneyU(many, [100]);
    expectRel(swapped.p, 2 / 21, 1e-12);
    expect(swapped.u).toBe(0);
  });

  it("returns p = 1 when there is no information", () => {
    expect(mannWhitneyU([3, 3, 3], [3, 3, 3, 3]).p).toBe(1); // all tied, exact
    const normalTies = mannWhitneyU([3, 3, 3], [3, 3, 3, 3], { method: "normal" });
    expect(normalTies.p).toBe(1);
    expect(normalTies.z).toBe(0);
    expect(mannWhitneyU([], [1, 2, 3])).toEqual({ u: 0, p: 1, method: "exact", z: null });
    expect(mannWhitneyU([1, 2], [], { method: "normal" })).toEqual({ u: 0, p: 1, method: "normal", z: 0 });
  });

  it("gives p = 1 when U sits within half a unit of its mean (continuity correction)", () => {
    const centred = mannWhitneyU([1, 4], [2, 3], { method: "normal" });
    expect(centred.u).toBe(2); // U equals its mean n1·n2/2
    expect(centred.p).toBe(1);
    const halfAway = mannWhitneyU([2, 3], [1, 3], { method: "normal" });
    expect(halfAway.u).toBe(2.5); // U − mean = 0.5 → corrected z = 0
    expect(halfAway.z).toBe(0);
    expect(halfAway.p).toBe(1);
  });

  it("rejects non-finite values", () => {
    expect(() => mannWhitneyU([1, Number.NaN], [2])).toThrow(RangeError);
    expect(() => mannWhitneyU([1], [Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });

  it("exact DP agrees with brute-force enumeration on 120 random tied samples", () => {
    const rand = rng(424242);
    for (let i = 0; i < 120; i++) {
      const n1 = 1 + Math.floor(rand() * 7);
      const n2 = 1 + Math.floor(rand() * 7);
      const draw = () => 1 + Math.floor(rand() * 5);
      const x = Array.from({ length: n1 }, draw);
      const y = Array.from({ length: n2 }, draw);
      const fast = mannWhitneyU(x, y, { method: "exact" });
      const slow = bruteForceMW(x, y);
      expect(fast.u).toBeCloseTo(slow.u, 12);
      expect(Math.abs(fast.p - slow.p)).toBeLessThan(1e-12);
    }
  });

  it("normal approximation tracks the exact p in the decision-relevant range (p < 0.25)", () => {
    // With heavy ties the exact two-sided p counts the observed atom in both tails, so the two methods can differ
    // by a few hundredths when p > 0.5; near the 0.01/0.05/0.2 thresholds they agree closely.
    const rand = rng(7);
    for (let i = 0; i < 20; i++) {
      const x = Array.from({ length: 15 }, () => 1 + Math.floor(rand() * 5));
      const y = Array.from({ length: 15 }, () => 1 + Math.floor(rand() * 5) + (i % 2));
      const exact = mannWhitneyU(x, y, { method: "exact" }).p;
      const approx = mannWhitneyU(x, y, { method: "normal" }).p;
      if (Math.min(exact, approx) < 0.25) expect(Math.abs(exact - approx)).toBeLessThan(0.015);
    }
  });
});

describe("formatPValue", () => {
  it("formats typical values", () => {
    expect(formatPValue(0.0002)).toBe("p < 0.001");
    expect(formatPValue(0.016323)).toBe("p = 0.016");
    expect(formatPValue(0.114)).toBe("p = 0.11");
    expect(formatPValue(0.4857)).toBe("p = 0.49");
    expect(formatPValue(1)).toBe("p = 1.00");
    expect(formatPValue(Number.NaN)).toBe("p not available");
  });

  it("never rounds across a reporting threshold", () => {
    expect(formatPValue(0.0496)).toBe("p = 0.0496");
    expect(formatPValue(0.00996)).toBe("p = 0.00996");
    expect(formatPValue(0.1996)).toBe("p = 0.1996");
    expect(formatPValue(0.0499999999)).toBe("p < 0.05"); // still rounds to the threshold at 6 figures
  });
});
