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
//   STRENGTH_SIZE_WORD     — the short form for one before/after row ("Large difference").
//   strengthCalibration    — one line on how often a difference that size appears by chance (from rules.ts).
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

/** Label for a before/after row that was compared but not flagged. */
export function unflaggedVerdict(metric: MetricKey, strength: "strong" | "moderate" | "weak" | "none"): string {
  if (isSentinelMetric(metric)) return "Listed by date, too few events to test";
  return strength === "weak" ? "Pattern strength: weak (not flagged)" : "No clear difference";
}

/**
 * Caregiver-facing wording for a signal's strength. It names the SIZE of the recorded difference, not how sure we
 * are that a medicine did anything: "strong" next to a warning icon reads as "the medicine did it", which SPEC §3
 * forbids. The test name and p-value stay one click away ("How this comparison works") and on the Timeline.
 */
export const STRENGTH_SIZE_LABEL: Record<Signal["strength"], string> = {
  strong: "Large difference in what was recorded",
  moderate: "Clear difference in what was recorded",
  weak: "Small difference",
};

/**
 * Badge tone for a compared item, by strength alone: strong = caution, moderate = info, otherwise neutral. A change
 * in the "better" direction is not shown green, because a recorded improvement is not an endorsement either.
 */
export function strengthTone(strength: Signal["strength"] | "none"): Tone {
  if (strength === "strong") return "caution";
  if (strength === "moderate") return "info";
  return "neutral";
}

/** The short size word for a bar row on the Overview ("Large difference"); each badge label starts with it. */
export const STRENGTH_SIZE_WORD: Record<Signal["strength"], string> = {
  strong: "Large difference",
  moderate: "Clear difference",
  weak: "Small difference",
};

/**
 * How often a difference of this strength showed up by chance, in one line. The rates are quoted from
 * MULTIPLE_COMPARISONS_NOTE in engine/timeline/rules.ts (measured by signals.null.test.ts on simulated diaries with
 * no real change): the independent-days figure, the frequent-symptom figure, and the clustered-days figure. The
 * clustered figure comes from one simulation with an assumed persistence (each answer repeats the previous day's
 * with probability 0.8, eval/results/timeline-null.json), not measured from real diaries; it shows how much
 * clustering can inflate chance signals. caregiver-insights.test.ts fails if that note stops
 * saying these numbers. Weak differences are never flagged, so they get no line.
 */
export function strengthCalibration(strength: Signal["strength"]): string | null {
  const lead = "In simulated diaries with no real change, about";
  if (strength === "strong")
    return `${lead} 1 in 100 medicine changes showed a difference rated “large” (1 in 35 when symptoms were recorded often), and about 6 in 10 when symptoms came in runs of days.`;
  if (strength === "moderate")
    return `${lead} 1 in 10 medicine changes showed a difference rated “clear” or larger (nearly 1 in 5 when symptoms were recorded often), and about 9 in 10 when symptoms came in runs of days.`;
  return null;
}
