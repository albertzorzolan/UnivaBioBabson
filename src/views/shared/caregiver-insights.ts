// Pure wording helpers shared by the caregiver Overview and Timeline (kept out of the views so they can be tested).
//
//   fallsComparison        — falls and near-falls around a medicine change, by date, with answered-day denominators
//                            on BOTH sides (the visit brief's wording).
//   triggerFirstSymptoms   — a finding's related diary symptoms, the ones its title names first (so a prescribing
//                            cascade about ankle swelling shows ankle swelling, not just the first three in order).
//   reviewPromptsSummary   — "11 prompts involve 6 of 8 medicines".
//   comparisonVerdict      — the label for a before/after row (falls are listed by date, never tested).
//   STRENGTH_SIZE_LABEL    — neutral, size-based badge wording for a signal ("Large difference in what was recorded").
//   strengthTone           — badge colour by strength only (direction never turns a change "good" green).
//   STRENGTH_SIZE_WORD     — the short form for one before/after row ("Large difference"), on Overview AND Timeline.
//   SIZE_ORDER_KEY         — "Size of the recorded difference: Large › Clear › Small (not flagged)", the Timeline's
//                            key to the order of those words (sizes only: no direction, no colour).
//   CHANCE_NOTE            — the one plain, number-free line under a finding: differences can appear by chance.
//   RELIABILITY_TITLE      — "How reliable is this?", the disclosure that holds the test, p-value and the measured
//                            rates (rendered by caregiver-Reliability.tsx straight from engine/timeline/rules.ts).
//   TEST_NAME              — the statistical test's name in words.
import type { Finding, ISODate, MetricKey, Signal } from "../../model/types";
import type { Tone } from "../../ui";
import type { SentinelEvents } from "../../engine/timeline/sentinel";
import { daysBetween, formatShort } from "../../model/dates";
import { getMetric } from "../../engine/timeline/metrics";
import { dateList } from "../../engine/timeline/text";

const FALL_WORDS: Record<"fall" | "nearFall", [string, string]> = {
  fall: ["fall", "falls"],
  nearFall: ["near-fall", "near-falls"],
};

function answeredDays(n: number): string {
  return `${n} answered ${n === 1 ? "day" : "days"}`;
}

function recorded(s: SentinelEvents, side: "before" | "after"): string {
  const parts = s.counts
    .map((c) => ({ c, dates: side === "after" ? c.afterDates : c.beforeDates }))
    .filter(({ dates }) => dates.length > 0)
    .map(({ c, dates }) => `${dates.length} ${FALL_WORDS[c.metric][dates.length === 1 ? 0 : 1]} (${dateList(dates)})`);
  return parts.join(" and ");
}

export interface FallsComparison {
  /** What was recorded after the change, e.g. "1 fall (Oct 6) and 2 near-falls (Sep 27, Sep 30)". */
  lead: string;
  /** The rest of the sentence, starting with a space: " on 14 answered days since Sep 25, compared with …". */
  rest: string;
  /** lead + rest. */
  text: string;
}

/**
 * "1 fall (Oct 6) and 2 near-falls (Sep 27, Sep 30) on 14 answered days since Sep 25, compared with 1 near-fall
 * (Sep 11) on 20 answered days in the 21 days before." Counts only answered days; descriptive, never tested.
 */
export function fallsComparison(s: SentinelEvents, today: ISODate): FallsComparison {
  const { before: wb, after: wa } = s.windows;
  const span = wa.to >= today ? `since ${formatShort(wa.from)}` : wa.from === wa.to ? `on ${formatShort(wa.from)}` : `from ${formatShort(wa.from)} through ${formatShort(wa.to)}`;
  const beforeLen = daysBetween(wb.from, wb.to) + 1;
  const after = recorded(s, "after");
  const before = recorded(s, "before");

  let lead: string;
  let afterRest: string;
  if (s.answeredDays.after === 0) {
    lead = "Falls and near-falls not answered";
    afterRest = ` ${span}`;
  } else {
    lead = after || "No falls or near-falls";
    afterRest = ` on ${answeredDays(s.answeredDays.after)} ${span}`;
  }
  const beforeText =
    s.answeredDays.before === 0
      ? `no answered days in the ${beforeLen} days before`
      : `${before || "none"} on ${answeredDays(s.answeredDays.before)} in the ${beforeLen} days before`;
  const rest = `${afterRest}, compared with ${beforeText}.`;
  return { lead, rest, text: lead + rest };
}

/**
 * A finding's related symptoms with the ones its title names first (title order kept stable otherwise), e.g. the
 * cascade "Amlodipine → ankle swelling → Furosemide" puts ankle swelling first.
 */
export function triggerFirstSymptoms(f: Pick<Finding, "title" | "plain" | "category" | "relatedSymptoms">): MetricKey[] {
  const named = (text: string) => {
    const t = text.toLowerCase();
    return (m: MetricKey) => {
      const def = getMetric(m);
      return t.includes(def.label.toLowerCase()) || t.includes(def.effectNoun.toLowerCase());
    };
  };
  const inTitle = named(f.title);
  let first = f.relatedSymptoms.filter(inTitle);
  // A cascade is about the effect the second medicine may be treating; its explanation always names it.
  if (first.length === 0 && f.category === "prescribing_cascade") first = f.relatedSymptoms.filter(named(f.plain));
  return [...first, ...f.relatedSymptoms.filter((m) => !first.includes(m))];
}

/** "11 prompts involve 6 of 8 medicines" (only active medicines are counted). */
export function reviewPromptsSummary(findings: Pick<Finding, "medIds">[], activeIds: string[]): string {
  const active = new Set(activeIds);
  const involved = new Set(findings.flatMap((f) => f.medIds).filter((id) => active.has(id))).size;
  const prompts = `${findings.length} ${findings.length === 1 ? "prompt" : "prompts"}`;
  if (findings.length === 0) return `No prompts for ${activeIds.length} ${activeIds.length === 1 ? "medicine" : "medicines"}`;
  return `${prompts} ${findings.length === 1 ? "involves" : "involve"} ${involved} of ${activeIds.length} ${activeIds.length === 1 ? "medicine" : "medicines"}`;
}

/** Falls and near-falls are listed by date rather than tested (rules.ts SENTINEL_NOTE). */
export function isSentinelMetric(m: MetricKey): m is "fall" | "nearFall" {
  return m === "fall" || m === "nearFall";
}

/**
 * Label for a before/after row that was compared but not flagged. It reuses the size vocabulary ("Small
 * difference") and never echoes a flagged label: a "no clear ..." label beside "Clear difference" read as a verdict.
 */
export function unflaggedVerdict(metric: MetricKey, strength: "strong" | "moderate" | "weak" | "none"): string {
  if (isSentinelMetric(metric)) return "Listed by date, too few events to test";
  return strength === "weak" ? `${STRENGTH_SIZE_WORD.weak} (not flagged)` : "Not flagged";
}

/**
 * Caregiver-facing wording for a signal's strength. It names the SIZE of the recorded difference, not how sure we
 * are that a medicine did anything: "strong" next to a warning icon reads as "the medicine did it", which SPEC §3
 * forbids. The test name and p-value stay one click away ("How reliable is this?") and beside each Timeline row.
 */
export const STRENGTH_SIZE_LABEL: Record<Signal["strength"], string> = {
  strong: "Large difference in what was recorded",
  moderate: "Clear difference in what was recorded",
  weak: "Small difference",
};

/**
 * Badge tone for a compared item, by strength alone: one hue, used once. A large difference is caution; everything
 * else is neutral (tokens.css has no softer caution tone, and a second hue such as blue read as a different kind
 * of finding). A change in the "better" direction is never green: a recorded improvement is not an endorsement.
 */
export function strengthTone(strength: Signal["strength"] | "none"): Tone {
  return strength === "strong" ? "caution" : "neutral";
}

/** The short size word for a bar row on the Overview ("Large difference"); each badge label starts with it. */
export const STRENGTH_SIZE_WORD: Record<Signal["strength"], string> = {
  strong: "Large difference",
  moderate: "Clear difference",
  weak: "Small difference",
};

/**
 * The size words in order, largest first: the first word of each STRENGTH_SIZE_WORD, so the key under the Timeline's
 * flagged count cannot drift from the badges. The key names sizes only. Direction is said in words on each row and
 * never by colour (strengthTone), so the key cannot read as "good" or "bad".
 */
export const SIZE_ORDER_WORDS = (["strong", "moderate", "weak"] as const).map((s) => STRENGTH_SIZE_WORD[s].split(" ")[0]);

/** "Size of the recorded difference: Large › Clear › Small (not flagged)". The view hides "›" from screen readers. */
export const SIZE_ORDER_KEY = `Size of the recorded difference: ${SIZE_ORDER_WORDS.join(" › ")} (not flagged)`;

/**
 * The one visible line under a before/after finding about chance. It deliberately carries no numbers: the measured
 * rates (MULTIPLE_COMPARISONS_NOTE in engine/timeline/rules.ts, from signals.null.test.ts) sit in the "How reliable
 * is this?" disclosure, so they have one source and a caregiver is not left reading two paragraphs of rates.
 */
export const CHANCE_NOTE =
  "Differences like this can also appear by chance, especially when symptoms come in runs of days, so it is a question for the clinician, not an answer.";

/**
 * The key between the engine's words and this page's. The measured rates in rules.ts are written per engine strength
 * ("a moderate signal", "a strong one"), while every caregiver badge says "Large difference" / "Clear difference".
 * Without this line a caregiver could not tell which rate applies to the badge in front of them. "Moderate" in those
 * rates counts moderate-OR-strong signals (signals.null.test.ts: "≥1 signal (moderate or strong)"), so the key says
 * "or larger" for it. It is built from STRENGTH_SIZE_WORD so the two cannot drift, and carries no numbers (the rates
 * stay in rules.ts only).
 */
export const SIGNAL_WORDS_KEY =
  `In the notes below, a “strong” signal is what this page calls a “${STRENGTH_SIZE_WORD.strong}”, ` +
  `and a “moderate” signal a “${STRENGTH_SIZE_WORD.moderate}” or larger.`;

/** True when a text uses the engine's strength words, so the panel needs SIGNAL_WORDS_KEY before it. */
export function usesEngineStrengthWords(text: string): boolean {
  return /\b(strong|moderate)\b/i.test(text);
}

/** Title of the disclosure that holds the test, the p-value and the measured chance rates. */
export const RELIABILITY_TITLE = "How reliable is this?";

/** The statistical test behind a comparison, in words. */
export const TEST_NAME: Record<Signal["test"], string> = {
  fisher_exact: "Fisher's exact test",
  mann_whitney: "Mann–Whitney U test",
};
