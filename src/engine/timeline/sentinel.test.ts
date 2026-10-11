// Falls and near-falls: listed by date around each medication change, never tested (sentinel.ts).
// Fixed "today" = 2026-10-10; lorazepam started 2026-09-24, so before = Sep 3–Sep 23 and after = Sep 24–Oct 10.
import { describe, expect, it } from "vitest";
import type { CheckIn, DiaryAnswers, ISODate } from "../../model/types";
import { dateRange } from "../../model/dates";
import { latestCheckInPerDate } from "./metrics";
import { MAX_SENTENCE_LENGTH, SENTINEL_METRICS, sentinelEvents, sentinelSentence } from "./sentinel";
import { analyzeEvent, analyzeTimeline, timelineSentinels } from "./signals";
import { UNANSWERED, makeCheckIn, makeMed } from "./test-fixtures";
import type { MedChange } from "./windows";

const TODAY = "2026-10-10";
const LORAZEPAM = makeMed("med-lorazepam", "Lorazepam (Ativan)", "2026-09-24");
const START: MedChange = { medicationId: LORAZEPAM.id, kind: "started", date: "2026-09-24" };
const BANNED = /\b(caused?|causing|dangerous|safe|urgent|diagnos\w*|risk score|you should|stop taking)\b/i;

/** A fully answered, symptom-free check-in every day in [from, to], with overrides on chosen dates. */
function diary(from: ISODate, to: ISODate, events: Record<ISODate, Partial<DiaryAnswers>> = {}): CheckIn[] {
  return dateRange(from, to).map((d) => makeCheckIn(d, events[d] ?? {}));
}

function sentinelFor(checkIns: CheckIn[], med = LORAZEPAM, change = START, today = TODAY) {
  return sentinelEvents(latestCheckInPerDate(checkIns), med, change, today);
}

describe("sentinelEvents — after a start", () => {
  it("lists counts and dates in both windows (the demo story)", () => {
    const s = sentinelFor(
      diary("2026-09-03", TODAY, {
        "2026-09-10": { nearFall: true },
        "2026-09-26": { nearFall: true },
        "2026-09-29": { nearFall: true },
        "2026-10-05": { fall: true },
      }),
    )!;
    expect(s).toMatchObject({
      medicationId: "med-lorazepam",
      event: "started",
      eventDate: "2026-09-24",
      windows: { before: { from: "2026-09-03", to: "2026-09-23" }, after: { from: "2026-09-24", to: TODAY } },
      totals: { before: 1, after: 3 },
      answeredDays: { before: 21, after: 17 },
    });
    expect(s.counts.map((c) => c.metric)).toEqual([...SENTINEL_METRICS]);
    const [fall, nearFall] = s.counts;
    expect(fall).toMatchObject({ beforeDates: [], afterDates: ["2026-10-05"] });
    expect(fall.after).toMatchObject({ answered: 17, positive: 1 });
    expect(nearFall).toMatchObject({ beforeDates: ["2026-09-10"], afterDates: ["2026-09-26", "2026-09-29"] });
    expect(s.text).toBe(
      "1 fall (Oct 5) and 2 near-falls (Sep 26, Sep 29) were recorded from Sep 24, when Lorazepam (Ativan) was started, " +
        "through Oct 10, compared with 1 near-fall (Sep 10) in the 21 days before.",
    );
  });

  it("says 'none' only over answered days, and never counts an unanswered day as 'no'", () => {
    const checkIns = [
      ...dateRange("2026-09-03", "2026-09-23").map((d, i) =>
        makeCheckIn(d, i % 3 === 0 ? { fall: null, nearFall: null } : {}),
      ),
      ...diary("2026-09-24", TODAY, { "2026-10-05": { fall: true } }),
    ];
    const s = sentinelFor(checkIns)!;
    expect(s.answeredDays.before).toBe(14);
    expect(s.text).toBe(
      "1 fall (Oct 5) was recorded from Sep 24, when Lorazepam (Ativan) was started, through Oct 10, " +
        "compared with none on the 14 answered days in the 21 days before.",
    );
  });

  it("says when the questions were not answered at all before", () => {
    const checkIns = [
      ...dateRange("2026-09-03", "2026-09-23").map((d) => makeCheckIn(d, { ...UNANSWERED, energy: 3 })),
      ...diary("2026-09-24", TODAY, { "2026-09-30": { fall: true, nearFall: true } }),
    ];
    const s = sentinelFor(checkIns)!;
    expect(s.totals).toEqual({ before: 0, after: 2 }); // a fall and a near-fall on the same day both count
    expect(s.text).toBe(
      "1 fall (Sep 30) and 1 near-fall (Sep 30) were recorded from Sep 24, when Lorazepam (Ativan) was started, " +
        "through Oct 10, compared with no answered days in the 21 days before.",
    );
  });

  it("reports falls before a start even when none were recorded after it", () => {
    const s = sentinelFor(diary("2026-09-03", TODAY, { "2026-09-10": { fall: true }, "2026-09-12": { fall: true } }))!;
    expect(s.text).toBe(
      "No falls or near-falls were recorded on the 17 answered days from Sep 24, when Lorazepam (Ativan) was started, " +
        "through Oct 10, compared with 2 falls (Sep 10, Sep 12) in the 21 days before.",
    );
    const unanswered = [
      ...diary("2026-09-03", "2026-09-23", { "2026-09-10": { nearFall: true } }),
      makeCheckIn("2026-09-25", { ...UNANSWERED, energy: 2 }),
    ];
    expect(sentinelFor(unanswered)!.text).toBe(
      "The fall and near-fall questions were not answered from Sep 24, when Lorazepam (Ativan) was started, " +
        "through Oct 10, compared with 1 near-fall (Sep 10) in the 21 days before.",
    );
  });

  it("is null when nothing was recorded in either window (falls outside the windows do not count)", () => {
    expect(sentinelFor(diary("2026-09-03", TODAY))).toBeNull();
    expect(sentinelFor(diary("2026-08-01", TODAY, { "2026-08-20": { fall: true } }))).toBeNull();
    expect(sentinelFor([])).toBeNull();
  });

  it("shortens a long list of dates", () => {
    const events = Object.fromEntries(dateRange("2026-09-24", "2026-10-01").map((d) => [d, { nearFall: true }]));
    const s = sentinelFor(diary("2026-09-03", TODAY, events))!;
    expect(s.counts[1].afterDates).toHaveLength(8);
    expect(s.text.startsWith("8 near-falls (Sep 24, Sep 25, Sep 26, Sep 27, Sep 28 and 3 more days) were recorded")).toBe(true);
  });

  it("gives counts without dates when listing every date would exceed 280 characters", () => {
    const med = makeMed("med-long", "A medicine with a rather long name typed by the family", "2026-08-01", "2026-09-23");
    const stop: MedChange = { medicationId: med.id, kind: "stopped", date: "2026-09-23" };
    const events = Object.fromEntries(dateRange("2026-09-03", TODAY).map((d) => [d, { fall: true, nearFall: true }]));
    const s = sentinelFor(diary("2026-09-01", TODAY, events), med, stop)!;
    expect(s.counts[0].afterDates).toHaveLength(17);
    expect(s.text).toBe(
      "17 falls and 17 near-falls were recorded from Sep 24, after A medicine with a rather long name typed by the family " +
        "was stopped on Sep 23, through Oct 10, compared with 21 falls and 21 near-falls in the 21 days through Sep 23.",
    );
    expect(s.text.length).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH);
  });
});

describe("sentinelEvents — around a stop (endDate = last day taken)", () => {
  it("lists falls while the medicine was taken and after it was stopped", () => {
    const med = makeMed("med-x", "Diphenhydramine", "2026-08-01", "2026-09-23");
    const stop: MedChange = { medicationId: med.id, kind: "stopped", date: "2026-09-23" };
    const s = sentinelFor(
      diary("2026-08-20", TODAY, { "2026-09-10": { fall: true }, "2026-09-23": { nearFall: true } }),
      med,
      stop,
    )!;
    expect(s.windows).toEqual({
      before: { from: "2026-09-03", to: "2026-09-23" },
      after: { from: "2026-09-24", to: TODAY },
    });
    expect(s.text).toBe(
      "No falls or near-falls were recorded on the 17 answered days from Sep 24, after Diphenhydramine was stopped on " +
        "Sep 23, through Oct 10, compared with 1 fall (Sep 10) and 1 near-fall (Sep 23) in the 21 days through Sep 23.",
    );
  });
});

describe("sentinels in analyzeEvent / analyzeTimeline", () => {
  const story = diary("2026-09-03", TODAY, {
    "2026-09-10": { nearFall: true },
    "2026-09-26": { nearFall: true },
    "2026-09-29": { nearFall: true },
    "2026-10-05": { fall: true },
  });

  it("are listed even when it is too early to compare anything (a fall on the first days matters most)", () => {
    const med = makeMed("med-new", "New pill", "2026-10-08");
    const checkIns = diary("2026-09-20", TODAY, { "2026-10-09": { fall: true } });
    const ev = analyzeEvent({
      days: latestCheckInPerDate(checkIns),
      med,
      change: { medicationId: med.id, kind: "started", date: med.startDate },
      meds: [med],
      today: TODAY,
    });
    expect(ev.status).toBe("too_recent");
    expect(ev.sentinel!.text).toBe(
      "1 fall (Oct 9) was recorded from Oct 8, when New pill was started, through Oct 10, " +
        "compared with none on the 18 answered days in the 21 days before.", // diary starts Sep 20
    );
    const today = makeMed("med-today", "Today pill", TODAY);
    const one = analyzeTimeline({ checkIns: diary("2026-09-20", TODAY, { [TODAY]: { nearFall: true } }), meds: [today], today: TODAY });
    expect(one.sentinels[0].text.startsWith("1 near-fall (Oct 10) was recorded on Oct 10, when Today pill was started,")).toBe(
      true,
    );
  });

  it("are not listed for changes outside the 180-day range", () => {
    const old = makeMed("med-old", "Old", "2026-03-01");
    const checkIns = diary("2026-02-15", "2026-03-15", { "2026-03-05": { fall: true } });
    const ev = analyzeEvent({
      days: latestCheckInPerDate(checkIns),
      med: old,
      change: { medicationId: old.id, kind: "started", date: old.startDate },
      meds: [old],
      today: TODAY,
    });
    expect(ev.status).toBe("outside_range");
    expect(ev.sentinel).toBeNull();
  });

  it("carry an id, overlapping changes and the KB flag; most recent change first", () => {
    const furosemide = makeMed("med-furosemide", "Furosemide (Lasix)", "2026-09-12");
    const result = analyzeTimeline({
      checkIns: story,
      meds: [furosemide, LORAZEPAM],
      today: TODAY,
      isKnownEffect: (med, m) => med.id === "med-lorazepam" && m === "nearFall",
    });
    expect(result.sentinels.map((x) => [x.id, x.overlappingMedIds, x.knownEffect, x.totals])).toEqual([
      ["falls:med-lorazepam:started", ["med-furosemide"], true, { before: 1, after: 3 }],
      // Furosemide: before Aug 22–Sep 11 holds the Sep 10 near-fall; after Sep 12–Oct 2 ends before the Oct 5 fall.
      ["falls:med-furosemide:started", ["med-lorazepam"], false, { before: 1, after: 2 }],
    ]);
    // No signal for these rare events — the listing is the honest representation.
    expect(result.signals.some((s) => s.metric === "fall" || s.metric === "nearFall")).toBe(false);
    expect(timelineSentinels({ checkIns: story, meds: [furosemide, LORAZEPAM], today: TODAY })).toHaveLength(2);
  });

  it("use descriptive language only", () => {
    const texts = analyzeTimeline({ checkIns: story, meds: [LORAZEPAM], today: TODAY }).sentinels.map((x) => x.text);
    texts.push(
      sentinelSentence(
        LORAZEPAM,
        "stopped",
        { before: { from: "2026-09-03", to: "2026-09-23" }, after: { from: "2026-09-24", to: TODAY } },
        [],
        { before: 0, after: 0 },
      ),
    );
    for (const t of texts) {
      expect(t).not.toMatch(BANNED);
      expect(t.length).toBeLessThan(280);
    }
  });
});
