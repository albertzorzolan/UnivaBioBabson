// Small, dependency-free statistics used by the timeline engine.
//
// Everything here is deterministic and runs identically in the browser, in vitest/node and in the in-app
// evaluation runner. Reference values for the tests come from exact rational arithmetic (Python `fractions`)
// and from the worked examples in R's documentation (?fisher.test, ?wilcox.test); see stats.test.ts.

// ---------------------------------------------------------------------------
// Log-factorials (cached), used by Fisher's exact test

const logFactorialCache: number[] = [0];

/** ln(n!) for a non-negative integer n. Cached; exact summation of logs (n stays small in this app). */
export function logFactorial(n: number): number {
  for (let i = logFactorialCache.length; i <= n; i++) {
    logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i);
  }
  return logFactorialCache[n];
}

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`fisherExact: ${name} must be a non-negative integer (got ${value})`);
  }
}

// ---------------------------------------------------------------------------
// Fisher's exact test

/**
 * Two-sided Fisher's exact test for the 2×2 table
 *
 *            outcome+  outcome−
 *   group 1     a         b
 *   group 2     c         d
 *
 * Conditioning on the margins, the count `a` follows a hypergeometric distribution. The two-sided p-value
 * is the total probability of every table that is no more likely than the observed one (the definition
 * used by R's `fisher.test`, including its 1e-7 relative tolerance for floating-point ties).
 *
 * Degenerate tables (an empty row or column, so only one table fits the margins) return 1.
 */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  assertCount(a, "a");
  assertCount(b, "b");
  assertCount(c, "c");
  assertCount(d, "d");

  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;
  const n = row1 + row2;

  const lo = Math.max(0, col1 - row2);
  const hi = Math.min(row1, col1);
  if (lo === hi) return 1; // only one possible table (includes n === 0)

  const base = logFactorial(row1) + logFactorial(row2) + logFactorial(col1) + logFactorial(col2) - logFactorial(n);
  const logProb = (k: number): number =>
    base - logFactorial(k) - logFactorial(row1 - k) - logFactorial(col1 - k) - logFactorial(row2 - col1 + k);

  const observed = logProb(a);
  const cutoff = observed + Math.log1p(1e-7); // R: d <= d_obs * (1 + 1e-7)
  let p = 0;
  for (let k = lo; k <= hi; k++) {
    const lp = logProb(k);
    if (lp <= cutoff) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

// ---------------------------------------------------------------------------
// Normal distribution

const SQRT_PI = Math.sqrt(Math.PI);

/**
 * Complementary error function erfc(x), accurate to ~1e-14 relative for the range used here.
 * - |x| < 2: non-alternating Taylor series erf(x) = (2/√π)·e^(−x²)·Σ 2ⁿx^(2n+1)/(1·3·…·(2n+1)) (no cancellation).
 * - x ≥ 2: Laplace continued fraction erfc(x) = e^(−x²)/√π · 1/(x + ½/(x + 1/(x + 3⁄2/(x + …)))),
 *   evaluated bottom-up with a fixed depth that is ample for x ≥ 2.
 */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) {
    let term = x;
    let sum = x;
    for (let n = 1; n < 200; n++) {
      term *= (2 * x * x) / (2 * n + 1);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    return 1 - (2 / SQRT_PI) * Math.exp(-x * x) * sum;
  }
  if (x > 27) return 0; // underflows double precision
  let f = x;
  for (let k = 120; k >= 1; k--) f = x + k / 2 / f;
  return Math.exp(-x * x) / SQRT_PI / f;
}

/** Standard normal cumulative distribution Φ(z). */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Two-sided p-value for a standard normal statistic: P(|Z| ≥ |z|). */
export function normalTwoSidedP(z: number): number {
  return Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
}

// ---------------------------------------------------------------------------
// Mann–Whitney U (Wilcoxon rank-sum) test

export interface MannWhitneyResult {
  /** U for the first sample: R₁ − n₁(n₁+1)/2 using mid-ranks (equals R's `W`). */
  u: number;
  /** Two-sided p-value. */
  p: number;
  /** "exact" = exact permutation distribution of the mid-rank sum (ties handled); "normal" = approximation. */
  method: "exact" | "normal";
  /** Continuity-corrected z statistic (normal method only). */
  z: number | null;
}

export interface MannWhitneyOptions {
  /** "auto" (default): exact when n₁·n₂ ≤ MANN_WHITNEY_EXACT_LIMIT, otherwise normal approximation. */
  method?: "auto" | "exact" | "normal";
}

/**
 * Largest n₁·n₂ for which "auto" uses the exact permutation distribution. 441 = 21 × 21, the largest comparison
 * the timeline's 21-day windows can produce, so the most complete diaries never fall back to the approximation
 * (which differed in strength class from the exact p in ~2% of simulated 21 × 21 rating samples). An exact
 * 21 × 21 test takes well under 1 ms.
 */
export const MANN_WHITNEY_EXACT_LIMIT = 441;

/** Mid-ranks of `values`, doubled so they are always integers (a tie group spanning positions i..j gets i+j+2). */
function doubledMidRanks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    for (let k = i; k <= j; k++) ranks[order[k].i] = i + j + 2;
    i = j + 1;
  }
  return ranks;
}

/** Σ(t³ − t) over tie groups, used in the variance tie correction. */
function tieTerm(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let total = 0;
  for (const t of counts.values()) total += t * t * t - t;
  return total;
}

/**
 * Exact two-sided p-value from the permutation distribution of the (doubled) mid-rank sum of a subset of size
 * `k` drawn from `ranks`. Counts subsets with a dynamic programme over (subset size, rank sum), which is exact
 * under the permutation null hypothesis *conditional on the observed ties* — the version that makes sense for
 * 1–5 ratings, where ties are the rule. p = 2·min(P(S ≤ s), P(S ≥ s)), capped at 1 (R's convention).
 */
function exactRankSumP(ranks: number[], k: number, observed: number): number {
  const n = ranks.length;
  const maxRank = 2 * n;
  // counts[j][s] = number of size-j subsets (of the items processed so far) with doubled-rank sum s.
  const counts: Float64Array[] = [];
  for (let j = 0; j <= k; j++) counts.push(new Float64Array(k * maxRank + 1));
  counts[0][0] = 1;
  let prefix = 0;
  for (let idx = 0; idx < n; idx++) {
    const r = ranks[idx];
    prefix += r;
    for (let j = Math.min(k, idx + 1); j >= 1; j--) {
      const row = counts[j];
      const prev = counts[j - 1];
      const top = Math.min(prefix, j * maxRank);
      for (let s = top; s >= r; s--) {
        const add = prev[s - r];
        if (add !== 0) row[s] += add;
      }
    }
  }
  let total = 0;
  let lower = 0;
  let upper = 0;
  const dist = counts[k];
  for (let s = 0; s < dist.length; s++) {
    const c = dist[s];
    if (c === 0) continue;
    total += c;
    if (s <= observed) lower += c;
    if (s >= observed) upper += c;
  }
  return Math.min(1, (2 * Math.min(lower, upper)) / total);
}

/**
 * Two-sided Mann–Whitney U test comparing samples `x` and `y` (e.g. ratings after vs before a change).
 *
 * - Exact (default when n₁·n₂ ≤ 441, i.e. up to 21 × 21): permutation distribution of the mid-rank sum, ties handled exactly.
 * - Normal approximation: mean n₁n₂/2, variance n₁n₂/12·[(n+1) − Σ(t³−t)/(n(n−1))] (tie correction) and a
 *   0.5 continuity correction toward the mean — the same formula as R's `wilcox.test(exact = FALSE)`.
 *
 * Empty samples, or samples where every value is identical, carry no evidence and return p = 1.
 */
export function mannWhitneyU(x: number[], y: number[], options: MannWhitneyOptions = {}): MannWhitneyResult {
  for (const v of [...x, ...y]) {
    if (!Number.isFinite(v)) throw new RangeError(`mannWhitneyU: values must be finite numbers (got ${v})`);
  }
  const n1 = x.length;
  const n2 = y.length;
  const method = options.method ?? "auto";
  const useExact = method === "exact" || (method === "auto" && n1 * n2 <= MANN_WHITNEY_EXACT_LIMIT);
  if (n1 === 0 || n2 === 0) return { u: 0, p: 1, method: useExact ? "exact" : "normal", z: useExact ? null : 0 };

  const pooled = [...x, ...y];
  const n = n1 + n2;
  const ranks = doubledMidRanks(pooled);
  let rankSumX2 = 0;
  for (let i = 0; i < n1; i++) rankSumX2 += ranks[i];
  const u = rankSumX2 / 2 - (n1 * (n1 + 1)) / 2;

  if (useExact) {
    // Enumerate subsets of the smaller sample (memory/time ∝ size); the two-sided p is symmetric under the swap.
    const xIsSmaller = n1 <= n2;
    const k = xIsSmaller ? n1 : n2;
    const observed = xIsSmaller ? rankSumX2 : n * (n + 1) - rankSumX2;
    return { u, p: exactRankSumP(ranks, k, observed), method: "exact", z: null };
  }

  const variance = ((n1 * n2) / 12) * (n + 1 - tieTerm(pooled) / (n * (n - 1)));
  if (!(variance > 0)) return { u, p: 1, method: "normal", z: 0 };
  const delta = u - (n1 * n2) / 2;
  const z = (delta - Math.sign(delta) * 0.5) / Math.sqrt(variance);
  return { u, p: normalTwoSidedP(z), method: "normal", z };
}

// ---------------------------------------------------------------------------
// Presentation helpers

/** Thresholds that p-values are compared against elsewhere; formatting never rounds across them. */
const P_THRESHOLDS = [0.01, 0.05, 0.2];

/**
 * Human-readable p-value: "p < 0.001", otherwise two significant figures ("p = 0.016", "p = 0.11"), with extra
 * digits only when two would round across a reporting threshold (0.0496 reads "p = 0.0496", not "p = 0.050").
 * A value within rounding distance of a threshold even at 6 digits reads "p < <threshold>".
 */
export function formatPValue(p: number): string {
  if (!Number.isFinite(p)) return "p not available";
  if (p < 0.001) return "p < 0.001";
  if (p >= 0.9995) return "p = 1.00";
  let crossed = 0;
  for (let digits = 2; digits <= 6; digits++) {
    const shown = Number(p.toPrecision(digits));
    crossed = P_THRESHOLDS.find((t) => p < t && shown >= t) ?? 0;
    if (!crossed) return `p = ${p.toPrecision(digits)}`;
  }
  return `p < ${crossed}`;
}
