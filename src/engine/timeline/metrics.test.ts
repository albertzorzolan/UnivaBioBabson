import { describe, expect, it } from "vitest";
import type { MetricKey } from "../../model/types";
import { METRICS, getMetric, latestCheckInPerDate, metricValue, valuesInWindow, windowStat } from "./metrics";
import { UNANSWERED, makeCheckIn } from "./test-fixtures";

describe("METRICS", () => {
  it("lists the nine diary metrics in display order with plain-language labels", () => {
    expect(METRICS.map((m) => [m.key, m.label])).toEqual([
      ["dizziness", "Dizziness"],
      ["drowsiness", "Daytime drowsiness"],
      ["confusion", "Confusion or memory fog"],
      ["fall", "Falls"],
      ["nearFall", "Near-falls"],
      ["swelling", "Ankle swelling"],
      ["appetiteWorse", "Poor appetite"],
      ["energy", "Energy"],
      ["sleep", "Sleep quality"],
    ]);
  });

  it("marks symptoms as higher-is-worse booleans and energy/sleep as 1–5 scales", () => {
    for (const m of METRICS) {
      if (m.key === "energy" || m.key === "sleep") {
        expect(m.kind).toBe("scale");
        expect(m.higherIsWorse).toBe(false);
      } else {
        expect(m.kind).toBe("boolean");
        expect(m.higherIsWorse).toBe(true);
      }
      expect(m.short.length).toBeGreaterThan(0);
      expect(m.short.length).toBeLessThanOrEqual(10);
    }
  });

  it("has unique keys and resolves each with getMetric", () => {
    expect(new Set(METRICS.map((m) => m.key)).size).toBe(METRICS.length);
    for (const m of METRICS) expect(getMetric(m.key)).toBe(m);
    expect(() => getMetric("pain" as MetricKey)).toThrow(RangeError);
  });

  it("uses no banned health language in any label or phrase", () => {
    const banned = /\b(caused?|causing|dangerous|safe|urgent|diagnos\w*|risk score|you should)\b/i;
    for (const m of METRICS) {
      for (const text of [m.label, m.short, m.subject, m.patientPhrase, m.patientNoun, m.effectNoun]) {
        expect(text).not.toMatch(banned);
      }
    }
  });
});

describe("metricValue", () => {
  it("maps yes/no answers to 1/0 and leaves unanswered as null", () => {
    const yes = makeCheckIn("2026-10-01", { dizziness: true, fall: false, nearFall: null });
    expect(metricValue(yes, "dizziness")).toBe(1);
    expect(metricValue(yes, "fall")).toBe(0);
    expect(metricValue(yes, "nearFall")).toBeNull();
  });

  it("maps appetite worse/same/better to 1/0/0 and null to null", () => {
    expect(metricValue(makeCheckIn("2026-10-01", { appetite: "worse" }), "appetiteWorse")).toBe(1);
    expect(metricValue(makeCheckIn("2026-10-01", { appetite: "same" }), "appetiteWorse")).toBe(0);
    expect(metricValue(makeCheckIn("2026-10-01", { appetite: "better" }), "appetiteWorse")).toBe(0);
    expect(metricValue(makeCheckIn("2026-10-01", { appetite: null }), "appetiteWorse")).toBeNull();
  });

  it("returns 1–5 ratings and rejects out-of-range or malformed ratings", () => {
    expect(metricValue(makeCheckIn("2026-10-01", { energy: 1, sleep: 5 }), "energy")).toBe(1);
    expect(metricValue(makeCheckIn("2026-10-01", { energy: 1, sleep: 5 }), "sleep")).toBe(5);
    expect(metricValue(makeCheckIn("2026-10-01", { energy: null }), "energy")).toBeNull();
    const bad = makeCheckIn("2026-10-01");
    (bad.answers as unknown as Record<string, unknown>).energy = 7;
    (bad.answers as unknown as Record<string, unknown>).sleep = 2.5;
    (bad.answers as unknown as Record<string, unknown>).dizziness = "yes";
    expect(metricValue(bad, "energy")).toBeNull();
    expect(metricValue(bad, "sleep")).toBeNull();
    expect(metricValue(bad, "dizziness")).toBeNull();
  });

  it("returns null for every metric on a fully unanswered check-in", () => {
    const blank = makeCheckIn("2026-10-01", UNANSWERED);
    for (const m of METRICS) expect(metricValue(blank, m.key)).toBeNull();
  });
});

describe("latestCheckInPerDate", () => {
  it("keeps one check-in per date (highest revision, then latest confirmation) sorted by date", () => {
    const a1 = makeCheckIn("2026-10-02", { dizziness: false }, { revision: 1 });
    const a2 = makeCheckIn("2026-10-02", { dizziness: true }, { revision: 2 });
    const b1 = makeCheckIn("2026-10-01", { energy: 2 }, { confirmedAt: "2026-10-01T08:00:00.000Z" });
    const b2 = makeCheckIn("2026-10-01", { energy: 4 }, { confirmedAt: "2026-10-01T21:00:00.000Z" });
    const days = latestCheckInPerDate([a2, b2, a1, b1]);
    expect(days.map((d) => d.id)).toEqual([b2.id, a2.id]);
  });

  it("ignores malformed dates", () => {
    const days = latestCheckInPerDate([
      makeCheckIn("2026-10-01"),
      makeCheckIn("2026-13-01"),
      makeCheckIn("2026-02-30"),
      makeCheckIn("yesterday"),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-01"]);
  });
});

describe("windowStat", () => {
  const diary = [
    makeCheckIn("2026-09-30", { dizziness: true, energy: 5 }), // outside window
    makeCheckIn("2026-10-01", { dizziness: true, energy: 2 }), // from (inclusive)
    makeCheckIn("2026-10-02", { dizziness: null, energy: null }), // unanswered → excluded from denominator
    makeCheckIn("2026-10-03", { dizziness: false, energy: 3 }),
    // 2026-10-04 missing entirely
    makeCheckIn("2026-10-05", { dizziness: true, energy: 4 }), // to (inclusive)
    makeCheckIn("2026-10-06", { dizziness: true, energy: 1 }), // outside window
  ];

  it("uses answered days only for a yes/no metric, with inclusive bounds", () => {
    expect(windowStat(diary, "dizziness", "2026-10-01", "2026-10-05")).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
      answered: 3,
      positive: 2,
      value: 2 / 3,
    });
  });

  it("averages ratings for a scale metric (positive = sum of ratings)", () => {
    const s = windowStat(diary, "energy", "2026-10-01", "2026-10-05");
    expect(s.answered).toBe(3);
    expect(s.positive).toBe(9);
    expect(s.value).toBe(3);
  });

  it("returns zero answered days and value 0 for an empty or inverted window", () => {
    expect(windowStat(diary, "dizziness", "2026-11-01", "2026-11-30")).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      answered: 0,
      positive: 0,
      value: 0,
    });
    expect(windowStat(diary, "dizziness", "2026-10-05", "2026-10-01").answered).toBe(0);
    expect(valuesInWindow(diary, "dizziness", "2026-10-05", "2026-10-01")).toEqual([]);
  });

  it("counts a date once when it has several check-ins", () => {
    const dup = [
      makeCheckIn("2026-10-01", { dizziness: true }, { revision: 1 }),
      makeCheckIn("2026-10-01", { dizziness: false }, { revision: 3 }),
    ];
    expect(windowStat(dup, "dizziness", "2026-10-01", "2026-10-01")).toMatchObject({ answered: 1, positive: 0 });
  });

  it("is order-independent", () => {
    const shuffled = [...diary].reverse();
    expect(windowStat(shuffled, "energy", "2026-09-30", "2026-10-06")).toEqual(
      windowStat(diary, "energy", "2026-09-30", "2026-10-06"),
    );
  });
});
