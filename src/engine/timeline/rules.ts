// The timeline engine's rules and fixed wording, in one place so the How-it-works page, the brief and the tests
// all show exactly the numbers the code uses (SPEC §6.3).

import type { Signal } from "../../model/types";

export const TIMELINE_RULES = {
  /** Length of the before window and maximum length of the after window, in calendar days. */
  windowDays: 21,
  /** Minimum answered days in each window before a metric is compared. */
  minAnsweredDays: 5,
  /** Minimum whole days between the change and today before comparing. */
  minDaysSinceEvent: 5,
  /** Only changes this many days old or newer are analysed. */
  lookbackDays: 180,
  /** Other medicine changes within ± this many days are listed as overlapping. */
  overlapDays: 21,
  /** Strength thresholds: p-value AND size of the difference must both be met (rate points or rating points). */
  thresholds: {
    boolean: {
      strong: { p: 0.01, diff: 0.3 },
      moderate: { p: 0.05, diff: 0.2 },
      weak: { p: 0.2, diff: 0.15 },
    },
    scale: {
      strong: { p: 0.01, diff: 1.0 },
      moderate: { p: 0.05, diff: 0.6 },
      weak: { p: 0.2, diff: 0.4 },
    },
  },
  /**
   * Strengths that are reported as signals. "weak" differences stay visible in the per-event detail
   * (EventAnalysis.comparisons) but are not flagged. Measured in signals.null.test.ts on simulated diaries with NO
   * real change (9 items compared per change; 8,000 simulated changes per scenario): ≥1 weak-or-stronger
   * difference in ~51% of medicine changes (~66% when symptoms are frequent); ≥1 moderate-or-strong in ~11%
   * (~18–19% when frequent); ≥1 strong in ~0.8% (~2.7% when frequent).
   * A Benjamini–Hochberg gate (FDR 10%) was evaluated and rejected: it cut false alarms to 2–5% but halved the
   * chance of flagging a real single-symptom change (dizziness 15% → 45% of days: 41% → 20%).
   */
  signalStrengths: ["strong", "moderate"] as readonly Signal["strength"][],
  /** Weekly comparison (patient view): answered days needed in each week, and the change treated as "same". */
  weekly: { minAnsweredDays: 3, booleanDiff: 0.15, scaleDiff: 0.5 },
} as const;

/** Shown with every signal. Deliberately avoids causal language (SPEC §3). */
export const SIGNAL_CAVEAT =
  "This describes a change in what was recorded. On its own it cannot show whether the medicine was responsible.";

/**
 * Honest note about multiple comparisons, for the signal detail view and the How-it-works page.
 * The figures are measured, not assumed: signals.null.test.ts simulates diaries with no real change and fails if
 * the rates drift from what this sentence says. The first figures assume independent days; the clustered-days
 * figure comes from the same test with each answer repeating the previous day's with probability 0.8
 * (eval/results/timeline-null.json), because real symptoms come in runs and the tests assume they do not.
 */
export const MULTIPLE_COMPARISONS_NOTE =
  "Kinwise compares 9 diary items around each medicine change, so some differences will appear by chance. " +
  "In simulated diaries with no real change, about 1 in 10 medicine changes still showed a moderate signal and " +
  "about 1 in 100 a strong one (nearly 1 in 5 and 1 in 35 when symptoms were recorded often). " +
  "Those simulations treat each day separately. When symptoms come in runs of days (a bad week, a cold), chance " +
  "signals are much more common: in a clustered-days simulation about 9 in 10 medicine changes showed a moderate " +
  "signal and about 6 in 10 a strong one. " +
  "A signal is a prompt for a conversation, not a conclusion.";

/** Plain-language method summary for the How-it-works page. */
export const TIMELINE_METHOD_SUMMARY =
  "For each medicine started or stopped in the last 180 days, Kinwise compares the 21 days before the change with " +
  "up to 21 days after it, counting only days when the question was answered (at least 5 on each side). The start " +
  "day counts as \"after\", even when the first dose is taken that evening. Yes/no " +
  "items use Fisher's exact test; 1–5 ratings use the Mann–Whitney U test. A difference is flagged only when it is " +
  "sizeable and its p-value is below 0.05; smaller or less certain differences stay in the detail view. Because 9 " +
  "items are compared each time, about 1 in 10 medicine changes with no real effect would still show a moderate " +
  "signal (nearly 1 in 5 when symptoms are recorded often). Falls and near-falls are too rare to test this " +
  "way, so each one recorded around a change is listed by date.";

/** Wording for falls and near-falls, which are listed rather than tested. */
export const SENTINEL_NOTE =
  "Falls and near-falls are listed by date rather than tested, because a few events cannot be told apart from " +
  "chance statistically, yet each one is worth mentioning to the clinician.";

export const STRENGTH_LABEL: Record<Signal["strength"], string> = {
  strong: "Strong signal",
  moderate: "Moderate signal",
  /** Only seen on per-event comparisons: weak differences are never flagged as signals. */
  weak: "Small difference (not flagged)",
};

/** Floating-point slack for threshold comparisons (0.7 − 0.4 must count as 30 points). */
export const EPS = 1e-9;
