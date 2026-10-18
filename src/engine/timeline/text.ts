// Shared wording helpers for the code-rendered timeline sentences. These sentences become evidence items that the
// brief and the on-device language model restate, so they must be factual, single-line and compact.

import type { ISODate, Medication, WindowStat } from "../../model/types";
import { daysBetween, formatShort } from "../../model/dates";
import type { ChangeKind, EventWindows } from "./windows";

/** Longest medicine name placed in a sentence (characters); longer names are shortened with an ellipsis. */
export const MAX_MED_NAME_LENGTH = 60;

/**
 * The medicine's name as the family typed it, made safe to embed in a one-line sentence: control characters,
 * bidirectional-override marks and runs of whitespace (including newlines) collapse to one space, and very long
 * names are shortened. React escapes HTML when rendering, so no HTML escaping is done here. Blank names read
 * "this medicine".
 */
export function medName(med: Medication | undefined): string {
  // The class matches control characters (C0, DEL, C1) and the bidi embedding/override (U+202A-U+202E) and
  // isolate (U+2066-U+2069) marks on purpose: they are invisible and could reorder or hide words in a sentence.
  const clean = (med?.name ?? "").replace(/[\s\u0000-\u001f\u007f-\u009f\u202A-\u202E\u2066-\u2069]+/g, " ").trim();
  if (!clean) return "this medicine";
  const chars = Array.from(clean); // code points, so a surrogate pair is never split
  if (chars.length <= MAX_MED_NAME_LENGTH) return clean;
  return `${chars.slice(0, MAX_MED_NAME_LENGTH - 1).join("").trimEnd()}…`;
}

export function oneDecimal(v: number): string {
  return v.toFixed(1);
}

export function capitalizedVerb(kind: ChangeKind): string {
  return kind === "started" ? "Started" : "Stopped";
}

/** "Sep 26" / "Sep 26, Sep 29" / "Sep 1, Sep 2, Sep 3, Sep 4, Sep 5 and 3 more days" (dates sorted by caller). */
export function dateList(dates: ISODate[], max = 6): string {
  if (dates.length <= max) return dates.map(formatShort).join(", ");
  const shown = dates.slice(0, max - 1).map(formatShort).join(", ");
  const rest = dates.length - (max - 1);
  return `${shown} and ${rest} more days`;
}

/**
 * The two time phrases used in before/after sentences, e.g. for a start
 *   after:  "from Sep 24, when Lorazepam (Ativan) was started, through Oct 10"
 *   before: "in the 21 days before"
 * and for a stop (endDate = last day taken, so the after-window begins the next day)
 *   after:  "from Aug 21, after Short course was stopped on Aug 20, through Sep 10"
 *   before: "in the 21 days through Aug 20"
 * The event date is read from the windows: a start's after-window begins on it, a stop's before-window ends on it.
 */
export function windowSpans(
  med: Medication | undefined,
  kind: ChangeKind,
  before: Pick<WindowStat, "from" | "to">,
  after: Pick<WindowStat, "from" | "to">,
): { afterSpan: string; beforeSpan: string } {
  const name = medName(med);
  const beforeDays = daysBetween(before.from, before.to) + 1;
  const oneDay = after.from === after.to;
  if (kind === "started") {
    const when = `when ${name} was started`;
    return {
      afterSpan: oneDay ? `on ${formatShort(after.from)}, ${when}` : `from ${formatShort(after.from)}, ${when}, through ${formatShort(after.to)}`,
      beforeSpan: `in the ${beforeDays} days before`,
    };
  }
  const when = `after ${name} was stopped on ${formatShort(before.to)}`;
  return {
    afterSpan: oneDay ? `on ${formatShort(after.from)}, ${when}` : `from ${formatShort(after.from)}, ${when}, through ${formatShort(after.to)}`,
    beforeSpan: `in the ${beforeDays} days through ${formatShort(before.to)}`,
  };
}

/** Window phrases for status reasons ("before Sep 24" / "since Sep 24" / "from Aug 1 to Aug 4"). */
export function reasonPhrases(
  kind: ChangeKind,
  windows: EventWindows,
  today: ISODate,
): { before: string; afterShort: string; afterLong: string } {
  const before =
    kind === "started"
      ? `before ${formatShort(windows.after.from)}`
      : `from ${formatShort(windows.before.from)} to ${formatShort(windows.before.to)}`;
  if (windows.after.to >= today) {
    return { before, afterShort: "since", afterLong: `since ${formatShort(windows.after.from)}` };
  }
  const range = `from ${formatShort(windows.after.from)} to ${formatShort(windows.after.to)}`;
  return { before, afterShort: range, afterLong: range };
}
