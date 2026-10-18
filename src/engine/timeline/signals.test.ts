// Timeline engine tests on synthetic diaries (independent of the seed module).
// Fixed "today" = 2026-10-10; the lorazepam story from SPEC §2 starts on 2026-09-24 (today − 16).
// Fisher reference p-values come from exact rational arithmetic (see stats.test.ts for sources).
import { describe, expect, it } from "vitest";
import type { CheckIn, DiaryAnswers, ISODate, MedEvent, Medication, MetricKey, Signal } from "../../model/types";
import { addDays } from "../../model/dates";
import { METRICS } from "./metrics";
import {
  LOW_POWER_BRIEF_LINE,
  LOW_POWER_NOTE,
  MULTIPLE_COMPARISONS_NOTE,
  RUNS_CHECK_NOTE,
  SENTINEL_NOTE,
  SIGNAL_CAVEAT,
  STRENGTH_LABEL,
  TIMELINE_METHOD_SUMMARY,
  TIMELINE_RULES,
  analyzeEvent,
  analyzeTimeline,
  classifyStrength,
  compareSignals,
  dailySeries,
  describeSignal,
  eventWindows,
  gatedStrength,
  eventsForMed,
  formatRunsCheckP,
  isAdverseConsistent,
  isSignalStrength,
  nearbyDoseChanges,
  overlappingChanges,
  weeklySummary,
  weeklyTrends,
} from "./signals";
import type { DailyRow } from "./signals";
import { latestCheckInPerDate } from "./metrics";
import { fisherExact } from "./stats";
import { UNANSWERED, makeCheckIn, makeMed, windowCheckIns } from "./test-fixtures";
import * as barrel from "./index";

const TODAY = "2026-10-10";
const LORAZEPAM = makeMed("med-lorazepam", "Lorazepam (Ativan)", "2026-09-24");
const BANNED = /\b(caused?|causing|dangerous|safe|urgent|diagnos\w*|risk score|you should|stop taking)\b/i;

// Before window Sep 3–Sep 23 (21 days): 15 answered. After window Sep 24–Oct 10 (17 days): 13 answered.
const BEFORE_SKIPS = [1, 4, 8, 11, 15, 19];
const AFTER_SKIPS = [2, 6, 10, 14];

function lorazepamDiary(
  before: (i: number) => Partial<DiaryAnswers>,
  after: (i: number) => Partial<DiaryAnswers>,
): CheckIn[] {
  return [
    ...windowCheckIns("2026-09-03", "2026-09-23", before, BEFORE_SKIPS),
    ...windowCheckIns("2026-09-24", "2026-10-10", after, AFTER_SKIPS),
  ];
}

/** n of the answered days have `field` = true (the first n). */
const firstN = (field: keyof DiaryAnswers, n: number) => (i: number) => ({ [field]: i < n }) as Partial<DiaryAnswers>;

function signalsFor(checkIns: CheckIn[], meds: Medication[] = [LORAZEPAM], extra: Partial<Parameters<typeof analyzeTimeline>[0]> = {}) {
  return analyzeTimeline({ checkIns, meds, today: TODAY, ...extra });
}

/** Full detail (every comparison, including weak and untested ones) for the lorazepam start. */
function lorazepamEvent(checkIns: CheckIn[], extra: Partial<Parameters<typeof analyzeEvent>[0]> = {}) {
  return analyzeEvent({
    days: latestCheckInPerDate(checkIns),
    med: LORAZEPAM,
    change: { medicationId: LORAZEPAM.id, kind: "started", date: LORAZEPAM.startDate },
    meds: [LORAZEPAM],
    today: TODAY,
    ...extra,
  });
}

describe("analyzeTimeline — boolean metrics (Fisher's exact test)", () => {
  it("reports the SPEC example: dizziness 8 of 13 after vs 2 of 15 before", () => {
    const result = signalsFor(lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8)));
    expect(result.perMed).toHaveLength(1);
    expect(result.perMed[0]).toMatchObject({
      medicationId: "med-lorazepam",
      event: "started",
      eventDate: "2026-09-24",
      status: "ok",
      reason: null,
    });
    expect(result.signals).toHaveLength(1);
    const s = result.signals[0];
    expect(s).toMatchObject({
      id: "sig:med-lorazepam:dizziness:started",
      medicationId: "med-lorazepam",
      event: "started",
      eventDate: "2026-09-24",
      metric: "dizziness",
      direction: "worse",
      strength: "moderate", // p = 0.016 (not < 0.01), diff = 0.48
      test: "fisher_exact",
      overlappingMedIds: [],
      knownEffect: false,
    });
    expect(s.before).toEqual({ from: "2026-09-03", to: "2026-09-23", answered: 15, positive: 2, value: 2 / 15 });
    expect(s.after).toEqual({ from: "2026-09-24", to: "2026-10-10", answered: 13, positive: 8, value: 8 / 13 });
    expect(s.pValue).toBeCloseTo(0.016323417238749048, 12);
    expect(s.text).toBe(
      "Dizziness was recorded on 8 of 13 answered days from Sep 24, when Lorazepam (Ativan) was started, through Oct 10, " +
        "compared with 2 of 15 answered days in the 21 days before.",
    );
    expect(result.perMed[0].signals).toEqual(result.signals);
  });

  it("is strong when the difference is large and p < 0.01 (10 of 13 vs 1 of 15)", () => {
    const [s] = signalsFor(lorazepamDiary(firstN("nearFall", 1), firstN("nearFall", 10))).signals;
    expect(s.metric).toBe("nearFall");
    expect(s.strength).toBe("strong");
    expect(s.pValue).toBeCloseTo(0.0002669717772692601, 14);
    expect(s.text.startsWith("A near-fall was recorded on 10 of 13 answered days")).toBe(true);
  });

  it("keeps a weak difference (p < 0.2, ≥ 15 points) in the event detail but does not flag it as a signal", () => {
    const diary = lorazepamDiary(firstN("confusion", 3), firstN("confusion", 7));
    const result = signalsFor(diary);
    expect(result.signals).toEqual([]);
    expect(result.perMed[0]).toMatchObject({ status: "ok", reason: null, signals: [] });
    const c = lorazepamEvent(diary).comparisons.find((x) => x.metric === "confusion")!;
    expect(c.strength).toBe("weak");
    expect(c.direction).toBe("worse");
    expect(c.pValue).toBeCloseTo(0.11406777814100469, 12);
    expect(STRENGTH_LABEL.weak).toBe("Small difference (not flagged)");
    expect(isSignalStrength("weak")).toBe(false);
    expect(isSignalStrength("moderate")).toBe(true);
    expect(isSignalStrength("none")).toBe(false);
  });

  it("reports a decrease as direction 'better'", () => {
    const [s] = signalsFor(lorazepamDiary(firstN("swelling", 9), firstN("swelling", 1))).signals;
    expect(s.metric).toBe("swelling");
    expect(s.direction).toBe("better");
    expect(s.strength).toBe("strong");
    expect(s.pValue).toBeCloseTo(0.0060259344012204424, 12);
    // A weak decrease (4 of 15 → 0 of 13) stays in the detail only.
    const weak = lorazepamEvent(lorazepamDiary(firstN("swelling", 4), firstN("swelling", 0))).comparisons.find(
      (x) => x.metric === "swelling",
    )!;
    expect(weak).toMatchObject({ direction: "better", strength: "weak" });
    expect(weak.pValue).toBeCloseTo(0.10158730158730159, 12);
  });

  it("reports poor appetite from appetite = 'worse'", () => {
    const appetite = (n: number) => (i: number): Partial<DiaryAnswers> => ({ appetite: i < n ? "worse" : "same" });
    const [s] = signalsFor(lorazepamDiary(appetite(1), appetite(9))).signals;
    expect(s.metric).toBe("appetiteWorse");
    expect(s.text.startsWith("Poor appetite was recorded on 9 of 13 answered days")).toBe(true);
    expect(s.pValue).toBeCloseTo(0.0010678871090770404, 12);
  });

  it("gives no signal when the difference is small, even though the event is analysable", () => {
    const result = signalsFor(lorazepamDiary(firstN("dizziness", 3), firstN("dizziness", 3)));
    expect(result.perMed[0].status).toBe("ok");
    expect(result.signals).toEqual([]);
  });

  it("gives no signal when p ≥ 0.2 even with a 15-point difference", () => {
    // 8 of 13 (0.62) vs 8 of 15 (0.53): diff 0.08 — and p = 0.72.
    const result = signalsFor(lorazepamDiary(firstN("dizziness", 8), firstN("dizziness", 8)));
    expect(result.signals).toEqual([]);
    const ev = analyzeEvent({
      days: latestCheckInPerDate(lorazepamDiary(firstN("dizziness", 8), firstN("dizziness", 8))),
      med: LORAZEPAM,
      change: { medicationId: LORAZEPAM.id, kind: "started", date: LORAZEPAM.startDate },
      meds: [LORAZEPAM],
      today: TODAY,
    });
    const dizzy = ev.comparisons.find((c) => c.metric === "dizziness")!;
    expect(dizzy.pValue).toBeCloseTo(0.7176829541885404, 12);
    expect(dizzy.strength).toBe("none");
    expect(dizzy.direction).toBe("worse");
  });
});

describe("analyzeTimeline — 1–5 ratings (Mann–Whitney U)", () => {
  const energyAfter = [2, 3, 2, 2, 1, 3, 2, 2, 3, 2, 2, 1, 2];
  const energyBefore = [4, 3, 4, 3, 4, 4, 3, 3, 4, 4, 5, 3, 4, 3, 4];

  it("reports lower energy after the start as a strong 'worse' signal", () => {
    const diary = lorazepamDiary(
      (i) => ({ energy: energyBefore[i] as DiaryAnswers["energy"] }),
      (i) => ({ energy: energyAfter[i] as DiaryAnswers["energy"] }),
    );
    const [s] = signalsFor(diary).signals;
    expect(s.metric).toBe("energy");
    expect(s.test).toBe("mann_whitney");
    expect(s.direction).toBe("worse");
    expect(s.strength).toBe("strong");
    expect(s.pValue).toBeCloseTo(4.4869206263741195e-6, 15); // exact tied permutation distribution
    expect(s.before).toMatchObject({ answered: 15, positive: 55 });
    expect(s.after).toMatchObject({ answered: 13, positive: 27 });
    expect(s.text).toBe(
      "Energy ratings averaged 2.1 out of 5 on 13 answered days from Sep 24, when Lorazepam (Ativan) was started, " +
        "through Oct 10, compared with 3.7 out of 5 on 15 answered days in the 21 days before.",
    );
  });

  it("keeps a weak sleep change in the detail and treats higher ratings as 'better'", () => {
    const sleepAfter = [3, 3, 2, 3, 4, 3, 2, 3, 3, 3];
    const sleepBefore = [3, 4, 3, 3, 4, 3, 4, 3, 3, 4, 3, 4];
    const weakDiary = lorazepamDiary(
      (i) => ({ sleep: (sleepBefore[i] ?? null) as DiaryAnswers["sleep"] }),
      (i) => ({ sleep: (sleepAfter[i] ?? null) as DiaryAnswers["sleep"] }),
    );
    expect(signalsFor(weakDiary).signals).toEqual([]);
    const lower = lorazepamEvent(weakDiary).comparisons.find((c) => c.metric === "sleep")!;
    expect(lower).toMatchObject({ metric: "sleep", strength: "weak", direction: "worse", test: "mann_whitney" });
    expect(lower.pValue).toBeCloseTo(0.08536045997346307, 12);
    expect(lower.after.answered).toBe(10); // nulls excluded from the denominator
    expect(lower.before.answered).toBe(12);
    expect(lower.after.value).toBeCloseTo(2.9, 12);
    expect(lower.before.value).toBeCloseTo(41 / 12, 12);

    const higher = signalsFor(
      lorazepamDiary(
        (i) => ({ sleep: energyAfter[i] as DiaryAnswers["sleep"] }),
        (i) => ({ sleep: energyBefore[i] as DiaryAnswers["sleep"] }),
      ),
    ).signals[0];
    expect(higher).toMatchObject({ metric: "sleep", direction: "better" });
  });
});

describe("signal ordering", () => {
  it("sorts strongest first, then known effects, then by p-value; weak differences are not signals", () => {
    const energyAfter = [2, 3, 2, 2, 1, 3, 2, 2, 3, 2, 2, 1, 2];
    const energyBefore = [4, 3, 4, 3, 4, 4, 3, 3, 4, 4, 5, 3, 4, 3, 4];
    const diary = lorazepamDiary(
      (i) => ({
        energy: energyBefore[i] as DiaryAnswers["energy"],
        nearFall: i < 1, // strong, p = 0.00027
        dizziness: i < 2, // moderate, p = 0.016
        drowsiness: i < 2, // moderate, identical counts and p to dizziness
        confusion: i < 1, // weak, p = 0.15 — detail only
      }),
      (i) => ({
        energy: energyAfter[i] as DiaryAnswers["energy"],
        nearFall: i < 10,
        dizziness: i < 8,
        drowsiness: i < 8,
        confusion: i < 4,
      }),
    );
    const knownDrowsy = (_med: Medication, m: MetricKey) => m === "drowsiness";
    const result = signalsFor(diary, [LORAZEPAM], { isKnownEffect: knownDrowsy });
    expect(result.signals.map((s) => [s.metric, s.strength])).toEqual([
      ["energy", "strong"],
      ["nearFall", "strong"],
      ["drowsiness", "moderate"], // known effect comes first within a strength level
      ["dizziness", "moderate"],
    ]);
    expect(result.signals.find((s) => s.metric === "drowsiness")!.knownEffect).toBe(true);
    expect(result.signals.find((s) => s.metric === "dizziness")!.knownEffect).toBe(false);

    // Without the KB callback the tie falls back to the stable id order.
    const plain = signalsFor(diary).signals.map((s) => s.metric);
    expect(plain.indexOf("dizziness")).toBeLessThan(plain.indexOf("drowsiness"));
  });
});

describe("classifyStrength thresholds", () => {
  it.each([
    ["boolean", 0.009, 0.3, "strong"],
    ["boolean", 0.009, 0.7 - 0.4, "strong"], // 0.29999999999999993 still counts as 30 points
    ["boolean", 0.009, -0.31, "strong"],
    ["boolean", 0.009, 0.29, "moderate"],
    ["boolean", 0.049, 0.2, "moderate"],
    ["boolean", 0.049, 0.19, "weak"],
    ["boolean", 0.19, 0.15, "weak"],
    ["boolean", 0.04, 0.14, "none"],
    ["boolean", 0.2, 0.9, "none"],
    ["scale", 0.009, 1.0, "strong"],
    ["scale", 0.009, 0.99, "moderate"],
    ["scale", 0.049, 0.6, "moderate"],
    ["scale", 0.1, 0.4, "weak"],
    ["scale", 0.1, -0.39, "none"],
    ["scale", 0.01, 2, "moderate"], // p must be strictly below 0.01 for strong
  ] as const)("%s p=%f diff=%f → %s", (kind, p, diff, expected) => {
    expect(classifyStrength(kind, p, diff)).toBe(expected);
  });
});

describe("statuses and exact reasons", () => {
  const fullAfter = windowCheckIns("2026-09-24", "2026-10-10", () => ({}));
  const fullBefore = windowCheckIns("2026-09-03", "2026-09-23", () => ({}));

  function onlyStatus(checkIns: CheckIn[], meds: Medication[] = [LORAZEPAM]) {
    const { perMed, signals } = signalsFor(checkIns, meds);
    expect(signals).toEqual([]);
    return perMed;
  }

  it("insufficient before: names the count and the date", () => {
    const diary = [...windowCheckIns("2026-09-20", "2026-09-23", () => ({}), [1]), ...fullAfter];
    const [p] = onlyStatus(diary);
    expect(p.status).toBe("insufficient");
    expect(p.reason).toBe("Only 3 answered days before Sep 24 — at least 5 are needed.");
  });

  it("insufficient after", () => {
    const diary = [...fullBefore, ...windowCheckIns("2026-09-24", "2026-09-27", () => ({}))];
    const [p] = onlyStatus(diary);
    expect(p.reason).toBe("Only 4 answered days since Sep 24 — at least 5 are needed.");
  });

  it("insufficient on both sides, including zero and one day", () => {
    const two = windowCheckIns("2026-09-24", "2026-09-25", () => ({}));
    expect(onlyStatus(two)[0].reason).toBe(
      "No answered days before Sep 24 and only 2 since — at least 5 are needed in each.",
    );
    const one = [makeCheckIn("2026-09-23")];
    expect(onlyStatus(one)[0].reason).toBe(
      "Only 1 answered day before Sep 24 and none since — at least 5 are needed in each.",
    );
  });

  it("counts answered days, not check-ins: blank check-ins do not help", () => {
    const blankBefore = windowCheckIns("2026-09-03", "2026-09-23", () => UNANSWERED);
    const [p] = onlyStatus([...blankBefore, ...fullAfter]);
    expect(p.reason).toBe("No answered days before Sep 24 — at least 5 are needed.");
  });

  it("explains when each window has data but never for the same question", () => {
    const before = windowCheckIns("2026-09-10", "2026-09-20", () => ({ ...UNANSWERED, dizziness: true }));
    const after = windowCheckIns("2026-09-24", "2026-10-05", () => ({ ...UNANSWERED, energy: 2 }));
    const [p] = onlyStatus([...before, ...after]);
    expect(p.status).toBe("insufficient");
    expect(p.reason).toBe("No diary question was answered on at least 5 days both before Sep 24 and since Sep 24.");
  });

  it("too_recent: fewer than 5 days since the change", () => {
    const diary = windowCheckIns("2026-09-01", TODAY, () => ({}));
    const cases: [string, string | null, string][] = [
      [TODAY, null, "Started today (Oct 10) — at least 5 days after a change are needed before comparing."],
      ["2026-10-09", null, "Started 1 day ago (Oct 9) — at least 5 days after a change are needed before comparing."],
      ["2026-10-07", null, "Started 3 days ago (Oct 7) — at least 5 days after a change are needed before comparing."],
    ];
    for (const [start, end, reason] of cases) {
      const [p] = onlyStatus(diary, [makeMed("med-new", "New pill", start, end)]);
      expect(p.status).toBe("too_recent");
      expect(p.reason).toBe(reason);
    }
    const stopped = onlyStatus(diary, [makeMed("med-old", "Old pill", "2026-03-01", "2026-10-08")]);
    const stop = stopped.find((p) => p.event === "stopped")!;
    expect(stop.status).toBe("too_recent");
    expect(stop.reason).toBe("Stopped 2 days ago (Oct 8) — at least 5 days after a change are needed before comparing.");
  });

  it("5 days after the change is no longer too recent", () => {
    const diary = windowCheckIns("2026-09-01", TODAY, () => ({}));
    const [p] = onlyStatus(diary, [makeMed("med-new", "New pill", "2026-10-05")]);
    expect(p.status).toBe("ok");
  });

  it("outside_range: changes more than 180 days ago are listed but not compared", () => {
    const start181 = addDays(TODAY, -181);
    expect(start181).toBe("2026-04-12");
    const [old] = onlyStatus([], [makeMed("med-metformin", "Metformin", start181)]);
    expect(old.status).toBe("outside_range");
    expect(old.reason).toBe(
      "Started on April 12, 2026, more than 180 days ago — Kinwise compares only changes from the last 180 days.",
    );
    const [edge] = onlyStatus([], [makeMed("med-tylenolpm", "Tylenol PM (OTC)", addDays(TODAY, -180))]);
    expect(edge.status).toBe("insufficient"); // exactly 180 days: in range
  });

  it("caps a start's after-window at the stop date and says so in the reason", () => {
    const diary = windowCheckIns("2026-07-01", TODAY, () => ({}));
    const med = makeMed("med-short", "Short course", "2026-08-01", "2026-08-04");
    const perMed = onlyStatus(diary, [med]);
    const start = perMed.find((p) => p.event === "started")!;
    const stop = perMed.find((p) => p.event === "stopped")!;
    expect(start.status).toBe("insufficient");
    expect(start.reason).toBe("Only 4 answered days from Aug 1 to Aug 4 — at least 5 are needed.");
    // endDate is the last day taken: the stop's before-window is Aug 1–Aug 4 (the same 4 days "on" the medicine)
    // and its after-window starts Aug 5, so no day counts as both on and off it.
    expect(stop.reason).toBe("Only 4 answered days from Aug 1 to Aug 4 — at least 5 are needed.");
  });

  it("caps on both sides at once", () => {
    const diary = windowCheckIns("2026-07-01", TODAY, () => ({}), Array.from({ length: 40 }, (_, i) => 31 + i));
    // Check-ins only in July (indexes 31+ skipped) and nothing in August: start Aug 1 has 0 after (capped), 21 before.
    const med = makeMed("med-short", "Short course", "2026-08-01", "2026-08-04");
    const start = onlyStatus(diary, [med]).find((p) => p.event === "started")!;
    expect(start.reason).toBe("No answered days from Aug 1 to Aug 4 — at least 5 are needed.");
    const tiny = windowCheckIns("2026-07-30", "2026-08-02", () => ({}));
    const both = onlyStatus(tiny, [med]).find((p) => p.event === "started")!;
    expect(both.reason).toBe(
      "Only 2 answered days before Aug 1 and only 2 from Aug 1 to Aug 4 — at least 5 are needed in each.",
    );
  });
});

describe("partial comparisons (status ok, but not every item had enough answers)", () => {
  it("has reason null and lists all 9 items as tested when everything was compared", () => {
    const ev = lorazepamEvent(lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8)));
    expect(ev.status).toBe("ok");
    expect(ev.reason).toBeNull();
    expect(ev.testedMetrics).toEqual(METRICS.map((m) => m.key));
  });

  it("names the few items that were compared, so no signal is not read as 'nothing changed'", () => {
    // The family answered only energy; dizziness was answered once.
    const diary = lorazepamDiary(
      (i) => ({ ...UNANSWERED, energy: 3, dizziness: i === 0 ? true : null }),
      () => ({ ...UNANSWERED, energy: 3 }),
    );
    const ev = lorazepamEvent(diary);
    expect(ev.status).toBe("ok");
    expect(ev.signals).toEqual([]);
    expect(ev.testedMetrics).toEqual(["energy"]);
    expect(ev.reason).toBe(
      "Compared only 1 of 9 diary items (energy). The others had fewer than 5 answered days before Sep 24 or since Sep 24.",
    );
    expect(signalsFor(diary).perMed[0]).toMatchObject({ status: "ok", reason: ev.reason });
  });

  it("names the items left out when most were compared", () => {
    const diary = lorazepamDiary(
      () => ({ fall: null, nearFall: null }),
      () => ({ fall: null, nearFall: null }),
    );
    const ev = lorazepamEvent(diary);
    expect(ev.testedMetrics).toHaveLength(7);
    expect(ev.reason).toBe(
      "Compared 7 of 9 diary items. Not compared, with fewer than 5 answered days before Sep 24 or since Sep 24: falls, near-falls.",
    );
  });

  it("uses the stop's own window wording", () => {
    const med = makeMed("med-x", "X", "2026-01-01", "2026-09-23");
    const diary = lorazepamDiary(() => ({ sleep: null }), () => ({ sleep: null }));
    const stop = signalsFor(diary, [med]).perMed.find((p) => p.event === "stopped")!;
    expect(stop.reason).toBe(
      "Compared 8 of 9 diary items. Not compared, with fewer than 5 answered days from Sep 3 to Sep 23 or since Sep 24: " +
        "sleep quality.",
    );
  });
});

describe("knownEffect is direction-aware (KB effects are ADVERSE effects)", () => {
  const always = () => true;
  const energyUp = lorazepamDiary(() => ({ energy: 2 }), () => ({ energy: 4 }));

  it("is false for an improvement after a start, so the UI never pairs 'rated higher' with 'low energy'", () => {
    const [s] = signalsFor(energyUp, [LORAZEPAM], { isKnownEffect: always }).signals;
    expect(s).toMatchObject({ metric: "energy", direction: "better", knownEffect: false });
    expect(describeSignal(s, [LORAZEPAM], TODAY).knownEffect).toBeNull();
  });

  it("is true for worsening after a start and for improvement after a stop (dechallenge)", () => {
    const [worse] = signalsFor(lorazepamDiary(() => ({ energy: 4 }), () => ({ energy: 2 })), [LORAZEPAM], {
      isKnownEffect: always,
    }).signals;
    expect(worse).toMatchObject({ direction: "worse", knownEffect: true });
    const stopped = makeMed("med-x", "X", "2026-01-01", "2026-09-23");
    const dechallenge = signalsFor(lorazepamDiary(() => ({ energy: 2 }), () => ({ energy: 4 })), [stopped], {
      isKnownEffect: always,
    }).signals.find((s) => s.event === "stopped")!;
    expect(dechallenge).toMatchObject({ direction: "better", knownEffect: true });
    expect(describeSignal(dechallenge, [stopped], TODAY).knownEffect).toBe(
      "Kinwise's reference set lists low energy or tiredness as a recognized possible effect of X.",
    );
    const worseAfterStop = signalsFor(lorazepamDiary(() => ({ energy: 4 }), () => ({ energy: 2 })), [stopped], {
      isKnownEffect: always,
    }).signals.find((s) => s.event === "stopped")!;
    expect(worseAfterStop).toMatchObject({ direction: "worse", knownEffect: false });
  });

  it("isAdverseConsistent", () => {
    expect(isAdverseConsistent("started", "worse")).toBe(true);
    expect(isAdverseConsistent("started", "better")).toBe(false);
    expect(isAdverseConsistent("stopped", "better")).toBe(true);
    expect(isAdverseConsistent("stopped", "worse")).toBe(false);
    expect(isAdverseConsistent("started", "same")).toBe(false);
  });

  it("ranks, within one strength level, known effects, then other worsening, then improvements — before p-value", () => {
    const base: Omit<Signal, "id" | "metric" | "direction" | "knownEffect" | "pValue"> = {
      medicationId: "m",
      event: "started",
      eventDate: "2026-09-24",
      before: { from: "", to: "", answered: 0, positive: 0, value: 0 },
      after: { from: "", to: "", answered: 0, positive: 0, value: 0 },
      strength: "moderate",
      test: "fisher_exact",
      overlappingMedIds: [],
      text: "",
    };
    const better: Signal = { ...base, id: "a", metric: "sleep", direction: "better", knownEffect: false, pValue: 0.001 };
    const worse: Signal = { ...base, id: "b", metric: "confusion", direction: "worse", knownEffect: false, pValue: 0.04 };
    const known: Signal = { ...base, id: "c", metric: "dizziness", direction: "worse", knownEffect: true, pValue: 0.049 };
    const strong: Signal = { ...better, id: "d", strength: "strong", pValue: 0.009 };
    expect([better, worse, known, strong].sort(compareSignals).map((s) => s.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("events and windows", () => {
  it("lists starts and stops that have happened, skipping future and malformed dates", () => {
    expect(eventsForMed(makeMed("a", "A", "2026-09-01"), TODAY)).toEqual([
      { medicationId: "a", kind: "started", date: "2026-09-01" },
    ]);
    expect(eventsForMed(makeMed("b", "B", "2026-09-01", "2026-09-20"), TODAY).map((e) => e.kind)).toEqual([
      "started",
      "stopped",
    ]);
    expect(eventsForMed(makeMed("c", "C", "2026-10-20"), TODAY)).toEqual([]); // future start
    expect(eventsForMed(makeMed("d", "D", "2026-09-01", "2026-12-31"), TODAY).map((e) => e.kind)).toEqual(["started"]);
    expect(eventsForMed(makeMed("e", "E", "not a date", "2026-09-20"), TODAY).map((e) => e.kind)).toEqual(["stopped"]);
    expect(eventsForMed(makeMed("f", "F", "2026-09-10", "2026-09-01"), TODAY).map((e) => e.kind)).toEqual(["started"]);
    expect(eventsForMed(makeMed("g", "G", "2026-09-10", "2026-9-1"), TODAY).map((e) => e.kind)).toEqual(["started"]);
  });

  it("builds 21-day windows with the event day in the after-window", () => {
    const w = eventWindows(LORAZEPAM, { medicationId: LORAZEPAM.id, kind: "started", date: "2026-09-24" }, TODAY);
    expect(w).toEqual({
      before: { from: "2026-09-03", to: "2026-09-23" },
      after: { from: "2026-09-24", to: "2026-10-10" },
    });
    const older = makeMed("m", "M", "2026-08-01");
    expect(eventWindows(older, { medicationId: "m", kind: "started", date: "2026-08-01" }, TODAY).after).toEqual({
      from: "2026-08-01",
      to: "2026-08-21", // event + 20: 21 days including the event day
    });
  });

  it("treats endDate as the last day taken: a stop's before-window ends on it and the after-window starts the next day", () => {
    const med = makeMed("m", "M", "2026-09-10", "2026-09-24");
    const w = eventWindows(med, { medicationId: "m", kind: "stopped", date: "2026-09-24" }, TODAY);
    expect(w.before).toEqual({ from: "2026-09-10", to: "2026-09-24" }); // no earlier than the start date
    expect(w.after).toEqual({ from: "2026-09-25", to: "2026-10-10" });
    // Full-length windows: 21 days through the end date, up to 21 days after it.
    const long = makeMed("l", "L", "2026-01-01", "2026-08-20");
    const lw = eventWindows(long, { medicationId: "l", kind: "stopped", date: "2026-08-20" }, TODAY);
    expect(lw.before).toEqual({ from: "2026-07-31", to: "2026-08-20" });
    expect(lw.after).toEqual({ from: "2026-08-21", to: "2026-09-10" });
    // The start's after-window ends ON the end date — the same "on" days as the stop's before-window.
    const sw = eventWindows(long, { medicationId: "l", kind: "started", date: "2026-01-01" }, "2026-01-10");
    expect(sw.after.to).toBe("2026-01-10");
    const short = makeMed("s", "S", "2026-08-01", "2026-08-20");
    expect(eventWindows(short, { medicationId: "s", kind: "started", date: "2026-08-01" }, TODAY).after.to).toBe("2026-08-20");
    expect(eventWindows(short, { medicationId: "s", kind: "stopped", date: "2026-08-20" }, TODAY).after.from).toBe("2026-08-21");
  });

  it("does not treat a medicine ending today as stopped (SPEC §6.2: endDate ≥ today is still active)", () => {
    expect(eventsForMed(makeMed("t", "T", "2026-09-01", TODAY), TODAY).map((e) => e.kind)).toEqual(["started"]);
    expect(eventsForMed(makeMed("y", "Y", "2026-09-01", "2026-10-09"), TODAY).map((e) => e.kind)).toEqual([
      "started",
      "stopped",
    ]);
  });
});

describe("stopped events", () => {
  it("reports fewer recorded symptoms after a stop as 'better' with a stop-specific sentence", () => {
    // Last dose Sep 23: before = Sep 3–Sep 23 (on it), after = Sep 24–Oct 10 (off it).
    const med = makeMed("med-diphen", "Diphenhydramine", "2026-08-01", "2026-09-23");
    const result = signalsFor(lorazepamDiary(firstN("drowsiness", 9), firstN("drowsiness", 1)), [med]);
    const start = result.perMed.find((p) => p.event === "started")!;
    expect(start.status).toBe("insufficient"); // no diary before Aug 1
    const [s] = result.signals;
    expect(s).toMatchObject({
      id: "sig:med-diphen:drowsiness:stopped",
      event: "stopped",
      eventDate: "2026-09-23",
      direction: "better",
      strength: "strong",
    });
    expect(s.pValue).toBeCloseTo(0.0060259344012204424, 12);
    expect(s.text).toBe(
      "Daytime drowsiness was recorded on 1 of 13 answered days from Sep 24, after Diphenhydramine was stopped on Sep 23, " +
        "through Oct 10, compared with 9 of 15 answered days in the 21 days through Sep 23.",
    );
  });

  it("describes a shortened before-window by its real length", () => {
    const med = makeMed("med-short", "Short course", "2026-09-10", "2026-09-23");
    const diary = lorazepamDiary(firstN("dizziness", 15), firstN("dizziness", 0)); // 10 of 10 on it, 0 of 13 after
    const stop = signalsFor(diary, [med]).signals.find((s) => s.event === "stopped")!;
    expect(stop.before.from).toBe("2026-09-10");
    expect(stop.text.endsWith("in the 14 days through Sep 23.")).toBe(true);
  });
});

describe("overlapping medication changes", () => {
  const furosemide = makeMed("med-furosemide", "Furosemide (Lasix)", "2026-09-10"); // 14 days before
  const amlodipine = makeMed("med-amlodipine", "Amlodipine", "2026-09-02"); // 22 days before
  const stoppedNear = makeMed("med-omeprazole", "Omeprazole", "2025-01-01", "2026-10-05"); // stop 11 days after
  const futureStop = makeMed("med-atorvastatin", "Atorvastatin", "2024-01-01", "2026-10-15"); // not yet
  const metformin = makeMed("med-metformin", "Metformin", "2024-01-01");
  const meds = [LORAZEPAM, furosemide, amlodipine, stoppedNear, futureStop, metformin];
  const change = { medicationId: LORAZEPAM.id, kind: "started" as const, date: "2026-09-24" };

  it("lists other starts/stops within ±21 days that have already happened", () => {
    expect(overlappingChanges(LORAZEPAM, change, meds, TODAY)).toEqual(["med-furosemide", "med-omeprazole"]);
    const edge = makeMed("med-edge", "Edge", "2026-09-03"); // exactly 21 days before
    expect(overlappingChanges(LORAZEPAM, change, [edge], TODAY)).toEqual(["med-edge"]);
  });

  it("adds other medicines' dose changes from the event log when provided", () => {
    const events: MedEvent[] = [
      { id: "e1", medicationId: "med-metformin", date: "2026-09-30", kind: "dose_changed", detail: "", createdAt: "" },
      { id: "e2", medicationId: "med-lorazepam", date: "2026-09-30", kind: "dose_changed", detail: "", createdAt: "" },
      { id: "e3", medicationId: "med-amlodipine", date: "2026-09-30", kind: "added_to_list", detail: "", createdAt: "" },
      { id: "e4", medicationId: "med-amlodipine", date: "bad", kind: "dose_changed", detail: "", createdAt: "" },
      { id: "e5", medicationId: "med-amlodipine", date: "2026-11-30", kind: "dose_changed", detail: "", createdAt: "" },
    ];
    expect(overlappingChanges(LORAZEPAM, change, meds, TODAY, events)).toEqual([
      "med-furosemide",
      "med-metformin",
      "med-omeprazole",
    ]);
  });

  it("ignores started/stopped log entries: starts and stops come from the medication record (the log can be stale)", () => {
    // Amlodipine's start date was corrected to Sep 2 (outside ±21 days); the log still says "started Sep 30".
    const stale: MedEvent[] = [
      { id: "s1", medicationId: "med-amlodipine", date: "2026-09-30", kind: "started", detail: "", createdAt: "" },
      { id: "s2", medicationId: "med-metformin", date: "2026-09-30", kind: "stopped", detail: "", createdAt: "" },
      { id: "s3", medicationId: "med-metformin", date: "2026-09-30", kind: "corrected", detail: "", createdAt: "" },
    ];
    expect(overlappingChanges(LORAZEPAM, change, meds, TODAY, stale)).toEqual(["med-furosemide", "med-omeprazole"]);
    expect(nearbyDoseChanges("med-metformin", "2026-09-24", TODAY, stale)).toEqual([]);
  });

  it("attaches overlaps to every signal of the event and describes them", () => {
    const events: MedEvent[] = [
      { id: "e1", medicationId: "med-metformin", date: "2026-09-30", kind: "dose_changed", detail: "", createdAt: "" },
    ];
    const result = signalsFor(lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8)), meds, {
      medEvents: events,
    });
    const s = result.signals.find((x) => x.medicationId === LORAZEPAM.id)!;
    expect(s.overlappingMedIds).toEqual(["med-furosemide", "med-metformin", "med-omeprazole"]);
    // With the same event log the analysis used, each dose change is labelled with its date.
    expect(describeSignal(s, meds, TODAY, events).overlap).toBe(
      "Other medicine changes within 21 days of Sep 24: Furosemide (Lasix) (started Sep 10); Metformin (dose changed Sep 30); " +
        "Omeprazole (stopped Oct 5). Changes this close together are hard to tell apart.",
    );
    // Without it, the label falls back to "dose changed" (the only way a medicine without a nearby start/stop is listed).
    expect(describeSignal(s, meds, TODAY).overlap).toContain("Metformin (dose changed);");
  });
});

describe("knownEffect injection", () => {
  it("defaults to false and uses the callback when given", () => {
    const diary = lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8));
    expect(signalsFor(diary).signals[0].knownEffect).toBe(false);
    const calls: [string, MetricKey][] = [];
    const isKnownEffect = (med: Medication, m: MetricKey) => {
      calls.push([med.id, m]);
      return med.id === "med-lorazepam" && m === "dizziness";
    };
    expect(signalsFor(diary, [LORAZEPAM], { isKnownEffect }).signals[0].knownEffect).toBe(true);
    expect(calls).toEqual([["med-lorazepam", "dizziness"]]); // only consulted for actual signals
  });
});

describe("analyzeTimeline — general behaviour", () => {
  it("orders perMed by most recent change first and keeps the shared contract shape", () => {
    const diary = windowCheckIns("2026-06-01", TODAY, () => ({}));
    const meds = [
      makeMed("med-a", "A", "2026-03-01"),
      makeMed("med-b", "B", "2026-09-01", "2026-09-20"),
      LORAZEPAM,
      makeMed("med-c", "C", "2026-09-24"),
    ];
    const { perMed } = signalsFor(diary, meds);
    expect(perMed.map((p) => `${p.medicationId}:${p.event}:${p.eventDate}`)).toEqual([
      "med-c:started:2026-09-24",
      "med-lorazepam:started:2026-09-24",
      "med-b:stopped:2026-09-20",
      "med-b:started:2026-09-01",
      "med-a:started:2026-03-01",
    ]);
    for (const p of perMed) {
      expect(Object.keys(p).sort()).toEqual(["event", "eventDate", "medicationId", "reason", "signals", "status"]);
    }
  });

  it("orders a same-day start and stop deterministically (started first)", () => {
    const { perMed } = signalsFor([], [makeMed("med-day", "One day", "2026-09-20", "2026-09-20")]);
    expect(perMed.map((p) => p.event)).toEqual(["started", "stopped"]);
  });

  it("does not double-count dates with several check-ins", () => {
    const diary = lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8));
    const copies = diary.map((c) => ({ ...c, id: `${c.id}-copy`, revision: 0, answers: { ...c.answers, dizziness: true } }));
    const [s] = signalsFor([...diary, ...copies]).signals;
    expect(s.after.answered).toBe(13);
    expect(s.after.positive).toBe(8);
  });

  it("returns empty results for no medications or no diary", () => {
    expect(signalsFor([], [])).toEqual({ perMed: [], signals: [], sentinels: [] });
    const { perMed } = signalsFor([], [LORAZEPAM]);
    expect(perMed[0].status).toBe("insufficient");
  });

  it("rejects an invalid today", () => {
    expect(() => analyzeTimeline({ checkIns: [], meds: [], today: "10/10/2026" })).toThrow(RangeError);
    expect(() => weeklyTrends([], "2026-02-30")).toThrow(RangeError);
  });

  it("analyzeEvent exposes every metric comparison and the windows", () => {
    const diary = lorazepamDiary(firstN("dizziness", 2), (i) => ({ dizziness: i < 8, fall: i < 5 ? null : false }));
    const ev = analyzeEvent({
      days: latestCheckInPerDate(diary),
      med: LORAZEPAM,
      change: { medicationId: LORAZEPAM.id, kind: "started", date: "2026-09-24" },
      meds: [LORAZEPAM],
      today: TODAY,
    });
    expect(ev.windows).toEqual({
      before: { from: "2026-09-03", to: "2026-09-23" },
      after: { from: "2026-09-24", to: "2026-10-10" },
    });
    expect(ev.comparisons.map((c) => c.metric)).toEqual(METRICS.map((m) => m.key));
    const fall = ev.comparisons.find((c) => c.metric === "fall")!;
    expect(fall.after.answered).toBe(8);
    expect(fall.tested).toBe(true);
    expect(fall.pValue).toBe(1);
    expect(fall.direction).toBe("same");
    const dizzy = ev.comparisons.find((c) => c.metric === "dizziness")!;
    expect(dizzy.pValue).toBeCloseTo(fisherExact(8, 5, 2, 13), 14);
    expect(dizzy.diff).toBeCloseTo(8 / 13 - 2 / 15, 14);
    expect(ev.testedMetrics).toEqual(METRICS.map((m) => m.key));
    expect(ev.sentinel).toBeNull(); // no fall or near-fall recorded
  });

  it("never uses banned health language in any rendered text", () => {
    const diary = lorazepamDiary(
      (i) => ({ dizziness: i < 2, drowsiness: i < 1, energy: 4, sleep: 4, nearFall: i === 3 }),
      (i) => ({ dizziness: i < 8, drowsiness: i < 9, energy: 2, sleep: 2, fall: i === 4 }),
    );
    const result = signalsFor(diary);
    expect(result.sentinels).toHaveLength(1);
    const texts = [
      ...result.signals.map((s) => s.text),
      ...result.signals.flatMap((s) => Object.values(describeSignal(s, [LORAZEPAM], TODAY)).filter(Boolean) as string[]),
      ...result.perMed.map((p) => p.reason ?? ""),
      ...weeklyTrends(diary, TODAY).map((w) => w.text),
      ...result.sentinels.map((x) => x.text),
      SIGNAL_CAVEAT,
      MULTIPLE_COMPARISONS_NOTE,
      TIMELINE_METHOD_SUMMARY,
      SENTINEL_NOTE,
      LOW_POWER_NOTE,
      LOW_POWER_BRIEF_LINE,
      RUNS_CHECK_NOTE,
      ...Object.values(STRENGTH_LABEL),
    ];
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) expect(t).not.toMatch(BANNED);
  });
});

describe("robustness to imported or hand-typed data", () => {
  it("keeps signal and falls ids unique when two medication records share an id", () => {
    const diary = lorazepamDiary(
      (i) => ({ dizziness: i < 2, nearFall: i === 0 }),
      (i) => ({ dizziness: i < 8, nearFall: i === 1 }),
    );
    const meds = [makeMed("dup", "A", "2026-09-24"), makeMed("dup", "B", "2026-09-24"), makeMed("dup", "C", "2026-09-10")];
    const result = signalsFor(diary, meds);
    const ids = result.signals.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("sig:dup:dizziness:started");
    expect(ids).toContain("sig:dup:dizziness:started:2026-09-24");
    const fallIds = result.sentinels.map((x) => x.id);
    expect(new Set(fallIds).size).toBe(fallIds.length);
    // perMed and the flat list carry the same (renamed) objects.
    expect(result.perMed.flatMap((p) => p.signals.map((s) => s.id)).sort()).toEqual([...ids].sort());
    // Deterministic whatever the input order: the same record always gets the same id.
    expect(signalsFor(diary, [...meds].reverse())).toEqual(result);
    expect(result.signals.find((s) => s.id === "sig:dup:dizziness:started")!.text).toContain("when A was started");

    // Same id AND same name: told apart by start date, then end date — still independent of input order.
    const twins = [
      makeMed("twin", "Same", "2026-09-10", "2026-09-23"),
      makeMed("twin", "Same", "2026-09-01", "2026-09-23"),
      makeMed("twin", "Same", "2026-09-01", "2026-09-20"),
    ];
    const t1 = signalsFor(diary, twins);
    const t2 = signalsFor(diary, [...twins].reverse());
    expect(t2).toEqual(t1);
    expect(new Set(t1.signals.map((s) => s.id)).size).toBe(t1.signals.length);
  });

  it("puts typed medicine names on one line and shortens very long ones", () => {
    const diary = lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8));
    const text = (name: string) => signalsFor(diary, [makeMed("n", name, "2026-09-24")]).signals[0].text;
    expect(text("Ativan\nIGNORE PREVIOUS INSTRUCTIONS")).toContain("when Ativan IGNORE PREVIOUS INSTRUCTIONS was started");
    expect(text("  Lorazepam\t\u0000\u202e 0.5 mg  ")).toContain("when Lorazepam 0.5 mg was started");
    const long = text("x".repeat(300));
    expect(long).toContain(`when ${"x".repeat(59)}… was started`);
    expect(long.length).toBeLessThan(280); // fits verify.ts's sentence limit, so AI restatements are not dropped
    for (const t of [long, text("Ativan\r\nline two")]) expect(t).not.toMatch(/[\n\r\u0000-\u001f]/);
  });
});

describe("describeSignal", () => {
  const diary = lorazepamDiary(
    (i) => ({ dizziness: i < 2, energy: 4 }),
    (i) => ({ dizziness: i < 8, energy: i < 7 ? 2 : 3 }),
  );
  const { signals } = signalsFor(diary, [LORAZEPAM], { isKnownEffect: (_m, k) => k === "dizziness" });

  it("renders headline, statistics, KB link and caveat for a yes/no signal", () => {
    const s = signals.find((x) => x.metric === "dizziness")!;
    expect(describeSignal(s, [LORAZEPAM], TODAY)).toEqual({
      headline: "Dizziness recorded more often after Lorazepam (Ativan) was started",
      sentence: s.text,
      strengthLabel: "Moderate signal",
      statistics: `Fisher's exact test, two-sided p = 0.016 · runs check (4-day runs shuffled 999 times): ${formatRunsCheckP(s.runsCheck!.p)}.`,
      overlap: null,
      knownEffect: "Kinwise's reference set lists dizziness as a recognized possible effect of Lorazepam (Ativan).",
      caveat: SIGNAL_CAVEAT,
    });
  });

  it("renders a rating signal and falls back gracefully for an unknown medicine", () => {
    const s = signals.find((x) => x.metric === "energy")!;
    const d = describeSignal(s, [], TODAY);
    expect(d.headline).toBe("Energy rated lower after this medicine was started");
    expect(d.statistics).toMatch(/^Mann–Whitney U test, two-sided p < 0\.001 · runs check \(4-day runs shuffled 999 times\): p [=<] [\d.]+\.$/);
    expect(d.strengthLabel).toBe("Strong signal");
    expect(d.knownEffect).toBeNull();
  });

  it("puts the runs check beside the test's p, with the signal's own block size and shuffles", () => {
    const s = signals.find((x) => x.metric === "dizziness")!;
    const custom = { ...s, runsCheck: { p: 0.042, blockDays: 3, permutations: 199, passed: true } };
    expect(describeSignal(custom, [LORAZEPAM], TODAY).statistics).toBe(
      "Fisher's exact test, two-sided p = 0.016 · runs check (3-day runs shuffled 199 times): p = 0.042.",
    );
    // Older saved analyses and fixtures have no runs check: the test's p alone, as before.
    const { runsCheck: _omit, ...older } = s;
    expect(describeSignal(older, [LORAZEPAM], TODAY).statistics).toBe("Fisher's exact test, two-sided p = 0.016.");
  });

  it("formats a runs-check p without trailing zeros (a shuffle p is a whole number of thousandths; 1 reads 'p = 1')", () => {
    expect(formatRunsCheckP(0.007)).toBe("p = 0.007");
    expect(formatRunsCheckP(0.011)).toBe("p = 0.011");
    expect(formatRunsCheckP(0.05)).toBe("p = 0.05");
    expect(formatRunsCheckP(0.001)).toBe("p = 0.001");
    expect(formatRunsCheckP(0.0005)).toBe("p < 0.001");
    expect(formatRunsCheckP(1)).toBe("p = 1");
  });

  it("uses 'less often' / 'rated higher' for decreases and increases", () => {
    const med = makeMed("med-x", "X", "2026-08-01", "2026-09-24");
    const stopDiary = lorazepamDiary(
      (i) => ({ drowsiness: i < 9, energy: 2 }),
      (i) => ({ drowsiness: i < 1, energy: 4 }),
    );
    const res = signalsFor(stopDiary, [med]).signals;
    expect(describeSignal(res.find((s) => s.metric === "drowsiness")!, [med], TODAY).headline).toBe(
      "Daytime drowsiness recorded less often after X was stopped",
    );
    expect(describeSignal(res.find((s) => s.metric === "energy")!, [med], TODAY).headline).toBe(
      "Energy rated higher after X was stopped",
    );
  });

  it("labels overlaps only with changes that have happened (a scheduled future stop is left out)", () => {
    const other = makeMed("med-y", "Y", "2026-09-20", "2026-10-12"); // stop is scheduled after today
    const s = signalsFor(diary, [LORAZEPAM, other]).signals[0];
    expect(describeSignal(s, [LORAZEPAM, other], TODAY).overlap).toBe(
      "Other medicine changes within 21 days of Sep 24: Y (started Sep 20). Changes this close together are hard to tell apart.",
    );
    const both = makeMed("med-z", "Z", "2026-09-20", "2026-10-01");
    const s2 = signalsFor(diary, [LORAZEPAM, both]).signals.find((x) => x.medicationId === LORAZEPAM.id)!;
    expect(describeSignal(s2, [LORAZEPAM, both], TODAY).overlap).toContain("Z (started Sep 20, stopped Oct 1)");
  });

  it("uses 'this medicine' when the name is blank", () => {
    const blank = makeMed("med-blank", "   ", "2026-09-24");
    const [s] = signalsFor(lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8)), [blank]).signals;
    expect(s.text).toContain("when this medicine was started");
  });
});

describe("weeklyTrends (this week vs last week)", () => {
  // This week = Oct 4–Oct 10; last week = Sep 27–Oct 3.
  function weeks(
    thisWeek: Partial<DiaryAnswers>[],
    lastWeek: Partial<DiaryAnswers>[],
  ): CheckIn[] {
    return [
      ...thisWeek.map((a, i) => makeCheckIn(addDays("2026-10-04", i), a)),
      ...lastWeek.map((a, i) => makeCheckIn(addDays("2026-09-27", i), a)),
    ];
  }
  const days = (n: number, f: (i: number) => Partial<DiaryAnswers>) => Array.from({ length: n }, (_, i) => f(i));
  const trend = (checkIns: CheckIn[], m: MetricKey) => weeklyTrends(checkIns, TODAY).find((t) => t.metric === m)!;

  it("returns one trend per metric in METRICS order, with the right windows", () => {
    const t = weeklyTrends([], TODAY);
    expect(t.map((x) => x.metric)).toEqual(METRICS.map((m) => m.key));
    expect(t[0].thisWeek).toMatchObject({ from: "2026-10-04", to: "2026-10-10" });
    expect(t[0].lastWeek).toMatchObject({ from: "2026-09-27", to: "2026-10-03" });
    expect(weeklySummary).toBe(weeklyTrends);
  });

  it("says not enough when either week has fewer than 3 answered days", () => {
    const ci = weeks(days(2, () => ({})), days(7, () => ({})));
    const d = trend(ci, "dizziness");
    expect(d.direction).toBe("not_enough");
    expect(d.text).toBe("Not enough entries yet to compare dizziness with last week.");
    expect(trend(ci, "fall").text).toBe("Not enough entries yet to compare falls with last week.");
    expect(trend(ci, "energy").text).toBe("Not enough entries yet to compare energy ratings with last week.");
    expect(trend(weeks(days(6, () => ({})), days(2, () => ({}))), "sleep").direction).toBe("not_enough");
  });

  it("describes increases with 'up from' (more symptoms → direction worse)", () => {
    const d = trend(weeks(days(6, (i) => ({ dizziness: i < 4 })), days(5, (i) => ({ dizziness: i < 1 }))), "dizziness");
    expect(d.direction).toBe("worse");
    expect(d.text).toBe("You noted dizziness on 4 of 6 days this week, up from 1 of 5 last week.");
    expect(d.thisWeek).toMatchObject({ answered: 6, positive: 4 });
  });

  it("describes decreases with 'down from' (fewer symptoms → direction better)", () => {
    const d = trend(weeks(days(6, (i) => ({ nearFall: i < 1 })), days(5, (i) => ({ nearFall: i < 3 }))), "nearFall");
    expect(d.direction).toBe("better");
    expect(d.text).toBe("You noted a near-fall on 1 of 6 days this week, down from 3 of 5 last week.");
  });

  it("treats a difference under 15 points as 'same'", () => {
    const d = trend(weeks(days(6, (i) => ({ dizziness: i < 1 })), days(5, (i) => ({ dizziness: i < 1 }))), "dizziness");
    expect(d.direction).toBe("same");
    expect(d.text).toBe("You noted dizziness on 1 of 6 days this week, compared with 1 of 5 last week.");
    const fall = trend(weeks(days(7, (i) => ({ fall: i < 1 })), days(7, () => ({ fall: false }))), "fall");
    expect(fall.direction).toBe("same"); // 1 of 7 vs 0 of 7 = 14 points
    expect(fall.text).toBe("You noted a fall on 1 of 7 days this week, compared with 0 of 7 last week.");
    const fallUp = trend(weeks(days(6, (i) => ({ fall: i < 1 })), days(5, () => ({ fall: false }))), "fall");
    expect(fallUp.text).toBe("You noted a fall on 1 of 6 days this week, up from 0 of 5 last week.");
  });

  it("phrases zero counts naturally", () => {
    const none = trend(weeks(days(6, () => ({})), days(5, () => ({}))), "swelling");
    expect(none.direction).toBe("same");
    expect(none.text).toBe("No ankle swelling noted on the 6 days you answered this week or the 5 days last week.");
    const dropped = trend(weeks(days(6, () => ({})), days(5, (i) => ({ swelling: i < 3 }))), "swelling");
    expect(dropped.direction).toBe("better");
    expect(dropped.text).toBe("No ankle swelling noted on the 6 days you answered this week, down from 3 of 5 last week.");
    const small = trend(weeks(days(7, () => ({})), days(7, (i) => ({ appetite: i < 1 ? "worse" : "same" }))), "appetiteWorse");
    expect(small.text).toBe("No poor appetite noted on the 7 days you answered this week, compared with 1 of 7 last week.");
  });

  it("describes ratings with averages", () => {
    const energyThis = [2, 2, 3, 2, 3, 3];
    const energyLast = [3, 4, 3, 4, 3];
    const ci = weeks(
      days(6, (i) => ({ energy: energyThis[i] as DiaryAnswers["energy"], sleep: i < 5 ? 3 : 4 })),
      days(5, (i) => ({ energy: energyLast[i] as DiaryAnswers["energy"], sleep: 3 })),
    );
    const e = trend(ci, "energy");
    expect(e.direction).toBe("worse");
    expect(e.text).toBe("Your energy ratings averaged 2.5 out of 5 over 6 days this week, down from 3.4 over 5 days last week.");
    const s = trend(ci, "sleep");
    expect(s.direction).toBe("same");
    expect(s.text).toBe("Your sleep ratings averaged 3.2 out of 5 over 6 days this week, compared with 3.0 over 5 days last week.");
    const up = trend(weeks(days(4, () => ({ sleep: 4 })), days(4, () => ({ sleep: 2 }))), "sleep");
    expect(up.direction).toBe("better");
    expect(up.text).toBe("Your sleep ratings averaged 4.0 out of 5 over 4 days this week, up from 2.0 over 4 days last week.");
  });

  it("never describes health as better or worse in the text", () => {
    const ci = weeks(days(6, (i) => ({ dizziness: i < 4, energy: 2 })), days(5, (i) => ({ dizziness: i < 1, energy: 4 })));
    for (const t of weeklyTrends(ci, TODAY)) {
      expect(t.text).not.toMatch(/\b(better|worse|improv\w*|deteriorat\w*)\b/i);
    }
  });
});

describe("dailySeries", () => {
  it("returns one row per date with gaps as nulls and a 0/1 recorded flag", () => {
    const ci = [
      makeCheckIn("2026-10-01", { dizziness: true, energy: 2, appetite: "worse" }),
      makeCheckIn("2026-10-03", { ...UNANSWERED, sleep: 4 }),
    ];
    const rows = dailySeries(ci, "2026-09-30", "2026-10-04");
    expect(rows.map((r) => r.date)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(rows.map((r) => r.recorded)).toEqual([0, 1, 0, 1, 0]);
    expect(rows[1]).toEqual({
      date: "2026-10-01",
      recorded: 1,
      dizziness: 1,
      drowsiness: 0,
      confusion: 0,
      fall: 0,
      nearFall: 0,
      swelling: 0,
      appetiteWorse: 1,
      energy: 2,
      sleep: 3,
    });
    expect(rows[3].sleep).toBe(4);
    expect(rows[3].dizziness).toBeNull(); // recorded day, unanswered question
    for (const m of METRICS) expect(rows[0][m.key]).toBeNull(); // missing day
  });

  it("uses the latest revision for a date with several check-ins", () => {
    const rows = dailySeries(
      [
        makeCheckIn("2026-10-01", { dizziness: true }, { revision: 1 }),
        makeCheckIn("2026-10-01", { dizziness: false }, { revision: 2 }),
      ],
      "2026-10-01",
      "2026-10-01",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].dizziness).toBe(0);
  });

  it("satisfies the SPEC §10 chart-row contract (checked by tsc)", () => {
    // If DailyRow drifts from `{ date: ISODate; [k: string]: number | null | string }`, `npm run build` fails here.
    const rows: { date: ISODate; [k: string]: number | null | string }[] = dailySeries([], "2026-10-01", "2026-10-02");
    const row: DailyRow = dailySeries([makeCheckIn("2026-10-01")], "2026-10-01", "2026-10-01")[0];
    expect(rows).toHaveLength(2);
    expect(Object.values(rows[0]).every((v) => v === null || typeof v === "number" || typeof v === "string")).toBe(true);
    expect(row.recorded).toBe(1);
  });

  it("returns [] for inverted or malformed ranges", () => {
    expect(dailySeries([], "2026-10-05", "2026-10-01")).toEqual([]);
    expect(dailySeries([], "2026-10-01", "soon")).toEqual([]);
    expect(dailySeries([], "2026-02-30", "2026-03-02")).toEqual([]);
  });
});

describe("public API (index.ts)", () => {
  it("exports the SPEC §10 functions", () => {
    for (const name of [
      "fisherExact",
      "mannWhitneyU",
      "METRICS",
      "metricValue",
      "windowStat",
      "analyzeTimeline",
      "weeklyTrends",
      "dailySeries",
      "eventsForMed",
      "describeSignal",
      "sentinelEvents",
      "timelineSentinels",
      "medName",
      "isSignalStrength",
    ]) {
      expect(barrel).toHaveProperty(name);
    }
    expect(TIMELINE_RULES.windowDays).toBe(21);
    expect(TIMELINE_RULES.minAnsweredDays).toBe(5);
    expect(TIMELINE_RULES.signalStrengths).toEqual(["strong", "moderate"]);
  });
});

describe("runs check (circular block permutation, blockPermutation.ts)", () => {
  // Same counts as the SPEC example (2 of 15 before, 8 of 13 after); only the order of the days differs.
  const clustered = lorazepamDiary(firstN("dizziness", 2), firstN("dizziness", 8));
  /** Symptom days spread evenly through each window instead of bunched at its start. */
  const spread = lorazepamDiary(
    (i) => ({ dizziness: i === 3 || i === 10 }),
    (i) => ({ dizziness: i % 3 !== 2 && i < 12 }),
  );

  it("adds a runs check to every tested comparison (and none to untested ones)", () => {
    const ev = lorazepamEvent([...clustered, makeCheckIn("2026-08-01")]);
    for (const c of ev.comparisons) {
      expect(c.runsCheck).not.toBeNull();
      expect(c.runsCheck).toMatchObject({ blockDays: TIMELINE_RULES.runsCheck.blockDays, permutations: 999 });
      expect(c.runsCheck!.p).toBeGreaterThan(0);
      expect(c.runsCheck!.p).toBeLessThanOrEqual(1);
    }
    const untested = lorazepamEvent(clustered.slice(0, 3));
    expect(untested.status).toBe("insufficient");
    for (const c of untested.comparisons) expect(c.runsCheck).toBeNull();
  });

  it("keeps Fisher's p-value and the effect description unchanged", () => {
    const dizzy = lorazepamEvent(clustered).comparisons.find((c) => c.metric === "dizziness")!;
    expect(dizzy.pValue).toBeCloseTo(0.016323417238749048, 12);
    expect(dizzy.diff).toBeCloseTo(8 / 13 - 2 / 15, 14);
    expect(dizzy.direction).toBe("worse");
  });

  it("is deterministic, and does not depend on the calendar date (the seed is the event id + metric)", () => {
    const a = lorazepamEvent(clustered);
    const b = lorazepamEvent(clustered.map((c) => ({ ...c })));
    expect(b.comparisons.map((c) => c.runsCheck)).toEqual(a.comparisons.map((c) => c.runsCheck));
    // The same diary one week later gives the same p-values.
    const shifted = clustered.map((c) => ({ ...c, date: addDays(c.date, 7) }));
    const later = analyzeEvent({
      days: latestCheckInPerDate(shifted),
      med: { ...LORAZEPAM, startDate: addDays(LORAZEPAM.startDate, 7) },
      change: { medicationId: LORAZEPAM.id, kind: "started", date: addDays(LORAZEPAM.startDate, 7) },
      meds: [LORAZEPAM],
      today: addDays(TODAY, 7),
    });
    expect(later.comparisons.map((c) => c.runsCheck)).toEqual(a.comparisons.map((c) => c.runsCheck));
  });

  it("is more cautious when the symptom days come in one run than when they are spread out", () => {
    const run = lorazepamEvent(clustered).comparisons.find((c) => c.metric === "dizziness")!;
    const even = lorazepamEvent(spread).comparisons.find((c) => c.metric === "dizziness")!;
    expect(even.before.positive).toBe(2);
    expect(even.after.positive).toBe(8);
    expect(even.pValue).toBeCloseTo(run.pValue!, 14); // Fisher's test cannot tell the two diaries apart
    expect(run.runsCheck!.p).toBeGreaterThan(even.runsCheck!.p);
  });

  it("gatedStrength uses the larger of the two p-values against the same bars", () => {
    expect(gatedStrength("boolean", 0.001, 0.005, 0.5)).toBe("strong");
    expect(gatedStrength("boolean", 0.001, 0.03, 0.5)).toBe("moderate");
    expect(gatedStrength("boolean", 0.03, 0.1, 0.5)).toBe("weak");
    expect(gatedStrength("boolean", 0.03, 0.3, 0.5)).toBe("none");
    expect(gatedStrength("scale", 0.001, 0.001, 0.7)).toBe("moderate"); // size bars unchanged
  });

  it("applies the gate as TIMELINE_RULES says, and records whether the runs check agreed", () => {
    for (const diary of [clustered, spread]) {
      const ev = lorazepamEvent(diary);
      for (const c of ev.comparisons) {
        const kind = METRICS.find((m) => m.key === c.metric)!.kind;
        const plain = classifyStrength(kind, c.pValue!, c.diff);
        const gated = gatedStrength(kind, c.pValue!, c.runsCheck!.p, c.diff);
        expect(c.strength).toBe(TIMELINE_RULES.runsCheck.gate ? gated : plain);
        expect(c.runsCheck!.passed).toBe(gated === plain);
      }
      for (const s of ev.signals) {
        expect(s.runsCheck).toEqual(ev.comparisons.find((c) => c.metric === s.metric)!.runsCheck);
      }
    }
  });
});

describe("RUNS_CHECK_NOTE (the plain line beside the runs-check p-values)", () => {
  it("names the block size and says whether the check decides flags, as TIMELINE_RULES.runsCheck.gate does", () => {
    expect(RUNS_CHECK_NOTE).toContain(`runs of ${TIMELINE_RULES.runsCheck.blockDays} days`);
    expect(RUNS_CHECK_NOTE.includes("it is reported, not used to decide flags")).toBe(!TIMELINE_RULES.runsCheck.gate);
    // True for any block size: only the runs move together, so it never claims "a bad week" is shuffled as one.
    expect(RUNS_CHECK_NOTE).toContain("so days in a bad stretch move together");
    expect(RUNS_CHECK_NOTE).not.toMatch(/\bweek\b/i);
  });
});
