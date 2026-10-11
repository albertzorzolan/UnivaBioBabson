// Explicit 1–5 ratings for the scale fields ("energy was 2 out of 5", "sleep 4/5", "a 3 for energy",
// "I'd give my sleep a four", "Energy: 4") plus number words. Out-of-range ratings ("10 out of 10",
// "6/10", "2.5", "2-3") are returned as invalid so the extractor can explain why it ignored them.
// Durations and counts ("slept 6 hours", "up 3 times", "took 2 pills") are never ratings.

import type { Segment } from "./segment";

export type RatedField = "energy" | "sleep";

export interface RatingMatch {
  field: RatedField;
  /** Parsed number (may be out of range when `valid` is false). */
  value: number;
  /** Scale denominator if stated ("out of 5" → 5), else null. */
  outOf: number | null;
  /** Span of the whole rating phrase in the text that was searched. */
  start: number;
  end: number;
  valid: boolean;
  /** Human-readable reason when invalid, e.g. "is on a 10-point scale". */
  problem: string | null;
  /** Rating that reuses the previous rating's field ("Energy a 4 this morning, a 2 by evening"). */
  elliptical: boolean;
}

export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0, nil: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Parse "4", "4.5", "four" → number; anything else → null. */
export function parseNumber(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  return t in NUMBER_WORDS ? NUMBER_WORDS[t] : null;
}

const NUM = "(\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)";
const OUTOF = "(?:\\s*(?:out of|outta|/|of)\\s*(\\d+|five|ten))?";
const RANGE = "(?:\\s*(?:-|to|or)\\s*(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?![a-z0-9]))?";
/** Units/counts after a number mean it is not a rating. */
const NOT_UNITS =
  "(?!\\s*(?:hours?|hrs?|h(?![a-z])|minutes?|mins?|times?|am(?![a-z])|pm(?![a-z])|a\\.m|p\\.m|o'?clock|mg|mcg|ml|pills?|tablets?|caplets?|days?|nights?|years?|weeks?|months?|%|percent|cups?|glasses|steps|miles|km|kg|lbs?|pounds|stone|naps?|visits?|people|trips?|[:.,]\\d))";

const ENERGY_ANCHOR = "(?:(?:my|her|his|the|today's)\\s+)?(?:energy(?:\\s+levels?)?|get[ -]up[ -]and[ -]go|pep|stamina|vitality)(?:[- ]wise)?";
const SLEEP_ANCHOR = "(?:(?:my|her|his|the|last night's)\\s+)?(?:sleep(?:\\s+quality|\\s+score)?|night's sleep)(?:[- ]wise)?";

const FILLER_WORDS =
  "was|is|were|has been|felt|feels|seemed|seems|about|around|roughly|approximately|approx|maybe|probably|perhaps|possibly|only|just|level|rating|score|i'd say|i would say|would say|id say|i guess|i think|like|today|this morning|tonight|last night|definitely|barely|say|solid|good|real|of|at best|at most|honestly|overall";
/** Words allowed between an anchor and its number ("energy was maybe a 2"). */
const FILLER_ENERGY = `(?:\\s*(?:[:=,?\\-]|(?:${FILLER_WORDS}|at)(?![a-z'])))*\\s*`;
const FILLER_SLEEP = `(?:\\s*(?:[:=,?\\-]|(?:${FILLER_WORDS})(?![a-z'])))*\\s*`;

const GIVE = "(?:give|gave|giving|rate|rated|rating|score|scored|put|i'd give|i would give|i'd rate|i would rate|i'd put|i would put|id give)";

interface Pattern {
  field: RatedField;
  re: RegExp;
  /** Capture group indexes. */
  num: number;
  outOf: number;
  range: number;
}

function mk(field: RatedField, src: string, num: number, outOf: number, range: number): Pattern {
  return { field, re: new RegExp(`(?<![a-z0-9'])${src}`, "g"), num, outOf, range };
}

const PATTERNS: Pattern[] = [
  // "energy was 2 out of 5", "Energy: 4", "energy about a three", "my energy is ten out of ten"
  mk("energy", `${ENERGY_ANCHOR}${FILLER_ENERGY}(?:\\s*(?:a|an)\\s+)?${NUM}${RANGE}${OUTOF}${NOT_UNITS}(?![a-z0-9])`, 1, 3, 2),
  mk("sleep", `${SLEEP_ANCHOR}${FILLER_SLEEP}(?:\\s*(?:a|an)\\s+)?${NUM}${RANGE}${OUTOF}${NOT_UNITS}(?![a-z0-9])`, 1, 3, 2),
  // "2 out of 5 for energy", "a 3 for energy", "two out of five for sleep"
  mk("energy", `(?:(?:a|an)\\s+)?${NUM}${RANGE}${OUTOF}\\s*(?:for|on|re|regarding|in)\\s+${ENERGY_ANCHOR}(?![a-z0-9])`, 1, 3, 2),
  mk("sleep", `(?:(?:a|an)\\s+)?${NUM}${RANGE}${OUTOF}\\s*(?:for|on|re|regarding|in)\\s+${SLEEP_ANCHOR}(?![a-z0-9])`, 1, 3, 2),
  // "I'd give my energy a 2", "rate my sleep at 4/5"
  mk("energy", `${GIVE}\\s+${ENERGY_ANCHOR}\\s+(?:(?:a|an|at|as)\\s+)?${NUM}${RANGE}${OUTOF}${NOT_UNITS}(?![a-z0-9])`, 1, 3, 2),
  mk("sleep", `${GIVE}\\s+${SLEEP_ANCHOR}\\s+(?:(?:a|an|at|as)\\s+)?${NUM}${RANGE}${OUTOF}${NOT_UNITS}(?![a-z0-9])`, 1, 3, 2),
  // "slept 4 out of 5" (a bare "slept 4" is ambiguous with hours, so the scale is required)
  mk("sleep", `slept\\s+(?:(?:a|an|about|around|maybe)\\s+)?${NUM}()\\s*(?:out of|outta|/)\\s*(\\d+|five|ten)(?![a-z0-9])`, 1, 3, 2),
];

const ANCHOR_WORDS = /(?<![a-z])(?:energy|sleep|slept|pep|stamina|appetite|mood|pain)(?![a-z])/;

function validate(value: number, outOf: number | null, range: boolean): { valid: boolean; problem: string | null } {
  if (range) return { valid: false, problem: "gives a range, not a single 1–5 rating" };
  if (outOf !== null && outOf !== 5) return { valid: false, problem: `is on a ${outOf}-point scale, not the 1–5 scale` };
  if (!Number.isInteger(value)) return { valid: false, problem: "is not a whole number on the 1–5 scale" };
  if (value < 1 || value > 5) return { valid: false, problem: "is outside the 1–5 scale" };
  return { valid: true, problem: null };
}

/**
 * Find explicit energy/sleep ratings. `sentences` (optional) limits elliptical follow-ups
 * ("…, a 2 by evening") to the sentence of the anchored rating.
 */
export function findRatings(text: string, sentences?: Segment[]): RatingMatch[] {
  const found: RatingMatch[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
      const value = parseNumber(m[p.num] ?? "");
      if (value === null) continue;
      const outOf = m[p.outOf] ? parseNumber(m[p.outOf]) : null;
      const range = !!m[p.range];
      found.push({ field: p.field, value, outOf, start: m.index, end: m.index + m[0].length, ...validate(value, outOf, range), elliptical: false });
    }
  }
  // Longest match wins where patterns overlap.
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const out: RatingMatch[] = [];
  for (const r of found) if (!out.some((x) => r.start < x.end && x.start < r.end)) out.push(r);
  out.sort((a, b) => a.start - b.start);

  // Elliptical follow-up ratings in the same sentence.
  const extra: RatingMatch[] = [];
  for (const r of out) {
    const sent = sentences?.find((s) => s.start <= r.start && r.end <= s.end);
    const limit = sent ? sent.end : text.length;
    const rest = text.slice(r.end, limit);
    const ell = new RegExp(
      `^([^.!?;]*?(?:,|;|(?<![a-z])(?:and|but|then)(?![a-z]))\\s*(?:it was |was |then |down to |up to |dropped to |dropping to |going to |more like )?)((?:a|an)\\s+${NUM}${RANGE}${OUTOF})${NOT_UNITS}(?![a-z0-9])`,
    ).exec(rest);
    if (!ell || ANCHOR_WORDS.test(ell[1])) continue;
    const value = parseNumber(ell[3]);
    if (value === null) continue;
    const outOf = ell[5] ? parseNumber(ell[5]) : null;
    const start = r.end + ell[1].length;
    const end = start + ell[2].length;
    if (out.some((x) => start < x.end && x.start < end)) continue;
    extra.push({ field: r.field, value, outOf, start, end, ...validate(value, outOf, !!ell[4]), elliptical: true });
  }
  return [...out, ...extra].sort((a, b) => a.start - b.start);
}
