// Runs-aware before/after check: a seeded circular block-permutation test.
//
// The idea in one paragraph. Fisher's exact test and the Mann–Whitney U test treat every answered day as an
// independent coin toss. Real symptoms come in runs (a bad week, a cold), and a run that happens to start near a
// medicine change looks like a before/after difference. So we also ask: if we cut the days around the change into
// short runs of days and shuffle those runs, keeping the days inside each run together, how often does the shuffled
// diary show a before/after difference at least as large as the real one? We shuffle whole runs of days instead of
// single days, so a bad week stays a bad week. If the real difference is no larger than what shuffled runs often
// produce, the runs alone could explain it, and the p-value says so.
//
// Recipe (all pure and deterministic; the same input always gives the same p):
//   1. series = one value per calendar day over the before and after windows (1/0 for yes/no items, 1–5 for
//      ratings, null when the question was not answered); `changeIndex` = number of before days.
//   2. statistic = |mean of answered after-days − mean of answered before-days| (a rate for yes/no, a mean rating
//      for 1–5). Cheap to compute, and it is the same difference the signal sentence describes.
//   3. Each permutation: rotate the series by a random offset (so block edges fall in a different place every
//      time — "circular"), cut it into consecutive blocks of `blockDays` days (the last one may be shorter),
//      shuffle the blocks, and recompute the statistic with the first `changeIndex` days as "before".
//   4. p = (1 + number of permutations with a statistic ≥ the observed one) / (permutations + 1).
//      A shuffle that leaves one side with no answered days counts as "at least as large" (the cautious choice).
// The random numbers come from mulberry32 seeded with a hash of the event and the metric, so a result never
// changes between renders.

/** Small, fast PRNG (public-domain mulberry32); returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a hash of a string: a stable seed, e.g. stableHash("med-lorazepam:started:dizziness"). */
export function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface BlockPermutationOptions {
  /** Length of each shuffled run of days. */
  blockDays: number;
  /** Number of shuffles (B). */
  permutations: number;
  /** PRNG seed (use stableHash of the event id and metric). */
  seed: number;
}

export interface BlockPermutationResult {
  /** (1 + #shuffles at least as large as observed) / (B + 1); 1 when either side has no answered days. */
  p: number;
  /** |after mean − before mean| over answered days; 0 when either side has no answered days. */
  observed: number;
  blockDays: number;
  permutations: number;
}

/** Floating-point slack: a shuffle that reproduces the observed difference exactly must count as "≥". */
const TIE_EPS = 1e-9;

/**
 * Results already computed, keyed by every input. The app re-analyses the same diary on every render (and the seed
 * tests re-analyse it thousands of times with one day changed), so most calls repeat an earlier one. The function
 * is deterministic, so a cached answer is exactly what recomputing would give. Cleared when it gets large.
 */
const cache = new Map<string, BlockPermutationResult>();
const CACHE_LIMIT = 2000;

/**
 * |mean(after) − mean(before)| over answered days for one arrangement of the diary: the series rotated by `offset`
 * days, cut into blocks of `blockDays`, and laid out in `blockOrder`; the first `changeIndex` days of that layout
 * count as "before". The real diary is the unshuffled arrangement (offset 0, blocks in order).
 * `twice` is the series written out twice with NaN for unanswered days, so "day d after rotating by offset" is
 * simply twice[d + offset] (a speed-up: no wrap-around arithmetic inside the loop, which runs ~10⁷ times in the
 * null study). null when either side has no answered days.
 */
function arrangedDiff(
  twice: Float64Array,
  changeIndex: number,
  blockDays: number,
  blockOrder: number[],
  offset: number,
): number | null {
  const n = twice.length / 2;
  let sumBefore = 0;
  let nBefore = 0;
  let sumAfter = 0;
  let nAfter = 0;
  let pos = 0; // position in the new layout
  for (const b of blockOrder) {
    const end = Math.min((b + 1) * blockDays, n);
    for (let d = b * blockDays; d < end; d++, pos++) {
      const v = twice[d + offset];
      if (Number.isNaN(v)) continue; // not answered
      if (pos < changeIndex) {
        sumBefore += v;
        nBefore++;
      } else {
        sumAfter += v;
        nAfter++;
      }
    }
  }
  if (nBefore === 0 || nAfter === 0) return null;
  return Math.abs(sumAfter / nAfter - sumBefore / nBefore);
}

/**
 * Circular block-permutation test for a before/after difference (see the header comment).
 * `series` is in calendar order with unanswered days as null; days [0, changeIndex) are "before".
 */
export function blockPermutationTest(
  series: (number | null)[],
  changeIndex: number,
  options: BlockPermutationOptions,
): BlockPermutationResult {
  const { blockDays, permutations, seed } = options;
  if (!Number.isInteger(blockDays) || blockDays < 1) throw new RangeError(`blockDays must be a positive integer (got ${blockDays})`);
  if (!Number.isInteger(permutations) || permutations < 1) {
    throw new RangeError(`permutations must be a positive integer (got ${permutations})`);
  }
  const n = series.length;
  if (!Number.isInteger(changeIndex) || changeIndex < 0 || changeIndex > n) {
    throw new RangeError(`changeIndex must lie between 0 and the series length ${n} (got ${changeIndex})`);
  }

  const key = `${blockDays}|${permutations}|${seed}|${changeIndex}|${series.join(",")}`;
  const hit = cache.get(key);
  if (hit) return { ...hit };
  const result = runTest(series, changeIndex, blockDays, permutations, seed);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, result);
  return { ...result };
}

/** The test itself (see the header comment); blockPermutationTest validates the inputs and caches the result. */
function runTest(
  series: (number | null)[],
  changeIndex: number,
  blockDays: number,
  permutations: number,
  seed: number,
): BlockPermutationResult {
  const n = series.length;
  const twice = new Float64Array(2 * n);
  series.forEach((v, i) => {
    twice[i] = twice[i + n] = v === null ? NaN : v;
  });
  const blockCount = Math.ceil(n / blockDays);
  const blockOrder = Array.from({ length: blockCount }, (_, b) => b);
  const observed = arrangedDiff(twice, changeIndex, blockDays, blockOrder, 0);
  if (observed === null) return { p: 1, observed: 0, blockDays, permutations };

  const random = mulberry32(seed);
  let atLeastAsLarge = 0;
  for (let k = 0; k < permutations; k++) {
    // A random circular offset, so block edges fall somewhere new each time (block b then holds the days
    // offset + b·L … offset + b·L + L − 1, wrapping around the end of the window).
    const offset = Math.floor(random() * n);
    // Fisher–Yates shuffle of the block order.
    for (let i = blockCount - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const t = blockOrder[i];
      blockOrder[i] = blockOrder[j];
      blockOrder[j] = t;
    }
    const diff = arrangedDiff(twice, changeIndex, blockDays, blockOrder, offset);
    if (diff === null || diff >= observed - TIE_EPS) atLeastAsLarge++;
  }
  return { p: (1 + atLeastAsLarge) / (permutations + 1), observed, blockDays, permutations };
}
