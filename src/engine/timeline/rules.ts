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
   * A Benjamini–Hochberg gate (FDR 10%) was evaluated earlier and rejected because it roughly halved the chance of
   * flagging a real single-symptom change. That run's code is not in the repo, so its figures are not reproducible:
   * it reported false alarms of 2–5% and dizziness rising from 15% to 45% of days flagged 41% → 20% of the time.
   * The reproducible figure without any gate is 39.2% (eval/results/timeline-null.json, power[0].detectionRate).
   */
  signalStrengths: ["strong", "moderate"] as readonly Signal["strength"][],
  /**
   * Runs-aware check (blockPermutation.ts): shuffle whole runs of `blockDays` days instead of single days and see
   * how often the shuffled diary shows a difference at least as large. 4 days because, in the strongest clustering
   * simulated (each answer repeats the day before with probability 0.8), an answer is copied forward for
   * 1 / (1 − 0.8) = 5 days on average, and the compared window (up to 21 + 21 = 42 days) still holds about 10 blocks, so the smallest p the
   * test can give stays below 0.01 (the "strong" bar). 999 shuffles in the app, so p is never below 0.001.
   * With `gate` on, a difference must also clear the strength's p bar in this check (strong 0.01, moderate 0.05);
   * with it off, the check is computed and stored with every comparison but does not change any strength.
   *
   * Decision: gate OFF (report-only) for now. Measured in signals.null.test.ts (eval/results/timeline-null.json,
   * n = 1,000 simulated changes per row, 199 shuffles each), the gate would cut chance signals from 85.8% to 57.2%
   * of changes at stay 0.8 (strong 61.0% → 13.3%) and from 11.2% to 7.3% with independent days, for a power cost
   * of 39.2% → 32.5% (independent days) and 37.6% → 23.3% (stay 0.8) on dizziness rising from 15% to 45% of days.
   * On the demo diary it keeps every flagged item but makes the strong drowsiness signal moderate (runs-check
   * p = 0.011), and after a neutral live check-in dizziness too, which src/model/seed.test.ts and
   * src/engine/timeline/story.test.ts pin as "strong" so the demo cannot change under the presenter.
   */
  runsCheck: { blockDays: 4, permutations: 999, gate: false as boolean },
  /** Weekly comparison (patient view): answered days needed in each week, and the change treated as "same". */
  weekly: { minAnsweredDays: 3, booleanDiff: 0.15, scaleDiff: 0.5 },
} as const;

/** Shown with every signal. Deliberately avoids causal language (SPEC §3). */
export const SIGNAL_CAVEAT =
  "This describes a change in what was recorded. On its own it cannot show whether the medicine was responsible.";

/**
 * Honest note about multiple comparisons, for the signal detail view and the How-it-works page.
 * The figures are measured, not assumed: signals.null.test.ts simulates diaries with no real change and fails if
 * this sentence drifts from the rates it writes to eval/results/timeline-null.json (n = 1,000 per row). They are
 * never rounded up: 0.858 is "more than 8 in 10". The first figures assume independent days (0.112 / 0.003; often:
 * 0.192 / 0.036); the clustered-days figures come from the same test with each answer repeating the previous day's
 * with probability 0.8 (0.858 / 0.61), because real symptoms come in runs and the tests assume they do not. The
 * last figures are the same clustered simulation with the runs check required (0.572 / 0.133; not applied yet).
 */
export const MULTIPLE_COMPARISONS_NOTE =
  "Kinwise compares 9 diary items around each medicine change, so some differences will appear by chance. " +
  "In simulated diaries with no real change, more than 1 in 10 medicine changes still showed a moderate signal and " +
  "fewer than 1 in 100 a strong one (nearly 2 in 10 and more than 3 in 100 when symptoms were recorded often). " +
  "Those simulations treat each day separately. When symptoms come in runs of days (a bad week, a cold), chance " +
  "signals are much more common: in a clustered-days simulation more than 8 in 10 medicine changes showed a " +
  "moderate signal and more than 6 in 10 a strong one. " +
  "Kinwise also runs a second check that shuffles whole runs of days instead of single days. It does not yet " +
  "change which differences are flagged; in the same clustered-days simulation, requiring it would still have left " +
  "more than 5 in 10 changes with a moderate signal and more than 1 in 10 with a strong one. " +
  "A signal is a prompt for a conversation, not a conclusion.";

/**
 * The other half of the honesty about chance: a real change can be missed. Shown next to "Nothing flagged" on the
 * Timeline, so an empty result is never read as reassurance (the visit brief prints the shorter LOW_POWER_BRIEF_LINE).
 * It opens with the Timeline's own label ("Nothing flagged") and the review's "all-clear" wording
 * (LIMITATION_LINES.scope). The "2–3 weeks" are the compared windows on each side of the change, not the diary's
 * length: the engine never looks further than 21 days before or after, so a longer diary does not catch more.
 * Measured, not assumed: the power scenario in signals.null.test.ts (dizziness on 15% of days before a start and 45%
 * from the start day on, i.e. a tripling; 21 days before and 17 after, 15% of days unanswered) flags dizziness as
 * worse in 39.2% of 1,000 simulated changes with independent days and 37.6% with clustered days
 * (eval/results/timeline-null.json, power[].detectionRate). Never rounded up, so "fewer than 4 times in 10";
 * signals.null.test.ts fails if either rate leaves [0.3, 0.4), the band this wording is true for.
 */
export const LOW_POWER_NOTE =
  "Nothing flagged is not an all-clear: in simulated diaries with 2–3 weeks of entries before and after a new " +
  "medicine, even a tripling of dizziness days was flagged fewer than 4 times in 10.";

/**
 * LOW_POWER_NOTE for the visit brief: the same limit as one figure-free clause, which the brief appends to its chance
 * limitation (template.ts), so false flags and missed changes are said together. It has no figure because the seed
 * brief has less than one printed line to spare: even a 76-character line with the figure moved the footer onto a
 * second page. The measured figure stays on the Timeline (LOW_POWER_NOTE, tied to timeline-null.json).
 */
export const LOW_POWER_BRIEF_LINE = "A real change can go unflagged.";

/**
 * One plain line beside the runs-check p-values (the "How reliable is this?" rows and the Timeline rows), so a
 * second p-value is not read as a second, independent verdict. Follows TIMELINE_RULES.runsCheck: it names the
 * block size and says the check only reports while the gate is off. "Days in a bad stretch move together" stays true
 * for any block size (a 7-day week spans two or three 4-day runs, so "a bad week" would not be).
 */
export const RUNS_CHECK_NOTE =
  `The runs check shuffles the diary in runs of ${TIMELINE_RULES.runsCheck.blockDays} days, so days in a bad ` +
  "stretch move together instead of counting as many separate days; " +
  (TIMELINE_RULES.runsCheck.gate ? "a flag must also pass it." : "it is reported, not used to decide flags.");

/** Plain-language method summary for the How-it-works page. */
export const TIMELINE_METHOD_SUMMARY =
  "For each medicine started or stopped in the last 180 days, Kinwise compares the 21 days before the change with " +
  "up to 21 days after it, counting only days when the question was answered (at least 5 on each side). The start " +
  "day counts as \"after\", even when the first dose is taken that evening. Yes/no " +
  "items use Fisher's exact test; 1–5 ratings use the Mann–Whitney U test. A difference is flagged only when it is " +
  "sizeable and its p-value is below 0.05; smaller or less certain differences stay in the detail view. Because 9 " +
  "items are compared each time, more than 1 in 10 medicine changes with no real effect would still show a " +
  "moderate signal (nearly 2 in 10 when symptoms are recorded often). Both tests treat each day separately, so " +
  "Kinwise also compares each difference with the same diary cut into runs of 4 days and shuffled 999 times, " +
  "which keeps short runs of bad days together; this check is worked out for every comparison but does not yet change which " +
  "differences are flagged. Falls and near-falls are too rare to test this way, so each one recorded around a " +
  "change is listed by date.";

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
