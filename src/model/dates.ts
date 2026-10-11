// Local-calendar date helpers. All diary math uses local dates (YYYY-MM-DD) at noon to avoid DST edges.
import type { ISODate } from "./types";

export function localDate(d: Date = new Date()): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDate(date: ISODate): Date {
  return new Date(`${date}T12:00:00`);
}

export function isValidDate(date: unknown): date is ISODate {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && localDate(parseDate(date)) === date;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** Inclusive list of dates from..to. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** "Sep 24" */
export function formatShort(date: ISODate): string {
  return parseDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "September 24, 2026" */
export function formatLong(date: ISODate): string {
  return parseDate(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "Thu, Sep 24" */
export function formatWeekday(date: ISODate): string {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "today", "yesterday", "3 days ago", "Sep 2" */
export function formatRelative(date: ISODate, today: ISODate): string {
  const n = daysBetween(date, today);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n > 1 && n < 7) return `${n} days ago`;
  return formatShort(date);
}
