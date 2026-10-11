// Daylight-saving boundaries. Diary math uses local calendar dates; these tests run the engine in several time
// zones (switched at runtime via process.env.TZ, which Node honours) across real 2026 transitions — including
// America/Santiago and America/Havana, where clocks jump at midnight so local "00:00" does not exist that day.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dateRange, daysBetween, formatShort } from "../../model/dates";
import { analyzeTimeline, dailySeries, eventWindows, weeklyTrends } from "./signals";
import { windowStat } from "./metrics";
import { makeCheckIn, makeMed } from "./test-fixtures";

const ZONES: { tz: string; transitions: { date: string; label: string }[] }[] = [
  {
    tz: "America/New_York",
    transitions: [
      { date: "2026-03-08", label: "Mar 8" }, // spring forward 02:00 → 03:00
      { date: "2026-11-01", label: "Nov 1" }, // fall back 02:00 → 01:00
    ],
  },
  {
    tz: "Europe/London",
    transitions: [
      { date: "2026-03-29", label: "Mar 29" },
      { date: "2026-10-25", label: "Oct 25" },
    ],
  },
  {
    tz: "Australia/Sydney",
    transitions: [
      { date: "2026-04-05", label: "Apr 5" },
      { date: "2026-10-04", label: "Oct 4" },
    ],
  },
  {
    tz: "America/Santiago",
    transitions: [
      { date: "2026-04-05", label: "Apr 5" },
      { date: "2026-09-06", label: "Sep 6" }, // clocks jump at midnight
    ],
  },
  {
    tz: "America/Havana",
    transitions: [
      { date: "2026-03-08", label: "Mar 8" }, // clocks jump at midnight
      { date: "2026-11-01", label: "Nov 1" },
    ],
  },
];

const originalTz = process.env.TZ;
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe.each(ZONES)("time zone $tz", ({ tz, transitions }) => {
  beforeAll(() => {
    process.env.TZ = tz;
  });

  it("is really running in that zone", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
  });

  it.each(transitions)("date arithmetic is exact across $date", ({ date }) => {
    expect(addDays(date, 1)).toBe(addDays(addDays(date, 2), -1));
    expect(addDays(addDays(date, -1), 1)).toBe(date);
    expect(daysBetween(addDays(date, -10), addDays(date, 10))).toBe(20);
    const range = dateRange(addDays(date, -3), addDays(date, 3));
    expect(range).toHaveLength(7);
    expect(new Set(range).size).toBe(7);
    expect(range[3]).toBe(date);
  });

  it.each(transitions)("windows and counts are exact when a medicine starts on $date", ({ date, label }) => {
    const today = addDays(date, 10);
    const med = makeMed("med-x", "Medicine X", date);
    const windows = eventWindows(med, { medicationId: med.id, kind: "started", date }, today);
    expect(dateRange(windows.before.from, windows.before.to)).toHaveLength(21);
    expect(dateRange(windows.after.from, windows.after.to)).toHaveLength(11);

    // A check-in every day: no dizziness before the start, dizziness every day from the start.
    const diary = dateRange(addDays(date, -30), today).map((d) => makeCheckIn(d, { dizziness: d >= date }));
    expect(windowStat(diary, "dizziness", windows.before.from, windows.before.to)).toMatchObject({ answered: 21, positive: 0 });

    const result = analyzeTimeline({ checkIns: diary, meds: [med], today });
    expect(result.perMed[0].status).toBe("ok");
    const s = result.signals.find((x) => x.metric === "dizziness")!;
    expect(s.after).toMatchObject({ answered: 11, positive: 11 });
    expect(s.before).toMatchObject({ answered: 21, positive: 0 });
    expect(s.text).toContain(`from ${label}, when Medicine X was started, through ${formatShort(today)}`);
    expect(s.text).toContain("in the 21 days before");

    // Weekly windows straddling the transition still hold 7 days each.
    const weekly = weeklyTrends(diary, addDays(date, 3));
    expect(weekly[0].thisWeek).toMatchObject({ answered: 7, from: addDays(date, -3) });
    expect(weekly[0].lastWeek).toMatchObject({ answered: 7, to: addDays(date, -4) });

    // Chart rows: one per calendar day, no duplicates or gaps at the transition.
    const rows = dailySeries(diary, addDays(date, -2), addDays(date, 2));
    expect(rows.map((r) => r.date)).toEqual(dateRange(addDays(date, -2), addDays(date, 2)));
    expect(rows.map((r) => r.dizziness)).toEqual([0, 0, 1, 1, 1]);
  });
});
