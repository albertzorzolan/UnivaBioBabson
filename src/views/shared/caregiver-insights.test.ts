import { describe, expect, it } from "vitest";
import type { Finding } from "../../model/types";
import { createSeed } from "../../model/seed";
import { analyzeTimeline } from "../../engine/timeline/signals";
import { activeMeds, reviewMedications } from "../../engine/meds/review";
import { MULTIPLE_COMPARISONS_NOTE } from "../../engine/timeline/rules";
import {
  STRENGTH_SIZE_LABEL,
  STRENGTH_SIZE_WORD,
  strengthTone,
  fallsComparison,
  reviewPromptsSummary,
  strengthCalibration,
  triggerFirstSymptoms,
  unflaggedVerdict,
} from "./caregiver-insights";
import { layoutMarkers, tickAlign } from "./caregiver-TimelineChart";

const TODAY = "2026-10-11";
const data = createSeed(TODAY);
const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today: TODAY });

describe("falls comparison wording", () => {
  it("states dates and answered-day denominators on both sides (brief wording)", () => {
    const s = timeline.sentinels.find((x) => x.event === "started")!;
    const out = fallsComparison(s, TODAY);
    expect(out.text).toBe(
      "1 fall (Oct 6) and 2 near-falls (Sep 27, Sep 30) on 14 answered days since Sep 25, compared with 1 near-fall (Sep 11) on 20 answered days in the 21 days before.",
    );
    expect(out.lead + out.rest).toBe(out.text);
    expect(out.text).not.toMatch(/caus|safe|danger|urgent/i);
  });

  it("says 'none' with a denominator and handles unanswered windows", () => {
    const s = timeline.sentinels[0];
    const none = {
      ...s,
      counts: s.counts.map((c) => ({ ...c, beforeDates: [] })),
      answeredDays: { before: 7, after: 1 },
    };
    expect(fallsComparison(none, TODAY).text).toMatch(/on 1 answered day since .*, compared with none on 7 answered days in the 21 days before\.$/);
    const blank = { ...s, counts: s.counts.map((c) => ({ ...c, afterDates: [] })), answeredDays: { before: 0, after: 0 } };
    expect(fallsComparison(blank, TODAY).text).toMatch(/^Falls and near-falls not answered since .*, compared with no answered days in the 21 days before\.$/);
    const ended = { ...s, windows: { ...s.windows, after: { from: "2026-09-25", to: "2026-10-09" } } };
    expect(fallsComparison(ended, TODAY).text).toMatch(/from Sep 25 through Oct 9,/);
  });
});

describe("review summary and finding symptoms", () => {
  const active = activeMeds(data.medications, TODAY);
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY, signals: timeline.signals });

  it("counts the medicines the prompts involve, not all medicines", () => {
    const text = reviewPromptsSummary(review.findings, active.map((m) => m.id));
    const involved = new Set(review.findings.flatMap((f) => f.medIds)).size;
    expect(text).toBe(`${review.findings.length} prompts involve ${involved} of ${active.length} medicines`);
    expect(reviewPromptsSummary([], ["a"])).toBe("No prompts for 1 medicine");
    expect(reviewPromptsSummary([{ medIds: ["a"] }], ["a", "b"])).toBe("1 prompt involves 1 of 2 medicines");
  });

  it("puts the symptom a prescribing cascade is about first", () => {
    const cascade = review.findings.find((f) => f.category === "prescribing_cascade");
    expect(cascade).toBeDefined();
    const ordered = triggerFirstSymptoms(cascade!);
    if (cascade!.relatedSymptoms.includes("swelling")) expect(ordered[0]).toBe("swelling");
    expect([...ordered].sort()).toEqual([...cascade!.relatedSymptoms].sort());

    const f = {
      title: "Possible prescribing cascade: Amlodipine → ankle swelling → Furosemide",
      plain: "",
      category: "prescribing_cascade",
      relatedSymptoms: ["dizziness", "fall", "nearFall", "swelling"],
    } as Pick<Finding, "title" | "plain" | "category" | "relatedSymptoms">;
    expect(triggerFirstSymptoms(f)).toEqual(["swelling", "dizziness", "fall", "nearFall"]);
    expect(triggerFirstSymptoms({ ...f, title: "Two medicines", plain: "It can lead to ankle swelling." })).toEqual(["swelling", "dizziness", "fall", "nearFall"]);
    expect(triggerFirstSymptoms({ ...f, title: "Unrelated", category: "beers_avoid" })).toEqual(["dizziness", "fall", "nearFall", "swelling"]);
  });

  it("never labels falls with a test result, and says 'No clear difference' rather than 'none'", () => {
    expect(unflaggedVerdict("fall", "none")).toBe("Listed by date, too few events to test");
    expect(unflaggedVerdict("nearFall", "weak")).toBe("Listed by date, too few events to test");
    expect(unflaggedVerdict("dizziness", "none")).toBe("No clear difference");
    expect(unflaggedVerdict("sleep", "weak")).toBe("Pattern strength: weak (not flagged)");
  });
});

describe("signal strength wording for caregivers", () => {
  it("describes the size of the recorded difference, never a verdict or a cause", () => {
    expect(STRENGTH_SIZE_LABEL.strong).toBe("Large difference in what was recorded");
    expect(STRENGTH_SIZE_LABEL.moderate).toBe("Clear difference in what was recorded");
    expect(STRENGTH_SIZE_LABEL.weak).toBe("Small difference");
    for (const label of Object.values(STRENGTH_SIZE_LABEL)) expect(label).not.toMatch(/strong|caus|safe|danger|risk|warning/i);
  });

  it("quotes the chance rates measured in rules.ts, including the frequent-symptom and clustered-days figures", () => {
    // The figures are copied from MULTIPLE_COMPARISONS_NOTE (measured in signals.null.test.ts); if that note changes,
    // this test fails so the Overview line cannot drift from what the engine says.
    expect(MULTIPLE_COMPARISONS_NOTE).toContain("about 1 in 10 medicine changes still showed a moderate signal");
    expect(MULTIPLE_COMPARISONS_NOTE).toContain("about 1 in 100 a strong one");
    expect(MULTIPLE_COMPARISONS_NOTE).toContain("nearly 1 in 5 and 1 in 35 when symptoms were recorded often");
    expect(MULTIPLE_COMPARISONS_NOTE).toContain("about 9 in 10 medicine changes showed a moderate signal and about 6 in 10 a strong one");
    expect(strengthCalibration("strong")).toBe(
      "In simulated diaries with no real change, about 1 in 100 medicine changes showed a difference rated “large” " +
        "(1 in 35 when symptoms were recorded often), and about 6 in 10 when symptoms came in runs of days.",
    );
    expect(strengthCalibration("moderate")).toBe(
      "In simulated diaries with no real change, about 1 in 10 medicine changes showed a difference rated “clear” or larger " +
        "(nearly 1 in 5 when symptoms were recorded often), and about 9 in 10 when symptoms came in runs of days.",
    );
    expect(strengthCalibration("weak")).toBeNull();
  });

  it("names a size word for each strength that matches its badge", () => {
    expect(STRENGTH_SIZE_WORD.strong).toBe("Large difference");
    expect(STRENGTH_SIZE_WORD.moderate).toBe("Clear difference");
    expect(STRENGTH_SIZE_WORD.weak).toBe("Small difference");
    for (const k of ["strong", "moderate", "weak"] as const) expect(STRENGTH_SIZE_LABEL[k].startsWith(STRENGTH_SIZE_WORD[k])).toBe(true);
  });

  it("colours a badge by strength only, never green for a recorded change in either direction", () => {
    expect(strengthTone("strong")).toBe("caution");
    expect(strengthTone("moderate")).toBe("info");
    expect(strengthTone("weak")).toBe("neutral");
    expect(strengthTone("none")).toBe("neutral");
  });
});

describe("chart label placement", () => {
  const ev = [{ key: "k", medicationId: "m", kind: "started" as const, date: "2026-09-25", boundary: 43, label: "Lorazepam started" }];

  it("keeps a marker label inside the visible part of a scrolled plot", () => {
    // 60 days on a 542px plot, opened scrolled so only x >= 314 is visible (phone width).
    const [m] = layoutMarkers(ev, 60, 542, 314);
    const w = m.showDate ? (17 + 9) * 6.9 + 20 : 17 * 6.9 + 20;
    const left = m.anchor === "end" ? m.offset : m.anchor === "start" ? (43 / 60) * 542 : m.offset;
    expect(left).toBeGreaterThanOrEqual(314);
    expect(left + w).toBeLessThanOrEqual(542);
  });

  it("keeps the date and the right-hand placement when there is room", () => {
    const [m] = layoutMarkers(ev, 60, 1000, 0);
    expect(m.anchor).toBe("start");
    expect(m.showDate).toBe(true);
  });

  it("clamps a label that fits on neither side", () => {
    const [m] = layoutMarkers([{ ...ev[0], boundary: 30, label: "A very long medicine name started" }], 60, 300, 100);
    expect(m.anchor).toBe("free");
    expect(m.offset).toBeGreaterThanOrEqual(100);
  });

  it("aligns edge ticks so the first date is not cut off", () => {
    expect(tickAlign(0, 14, 200, 0, "Sep 28")).toBe("start");
    expect(tickAlign(7, 14, 200, 0, "Oct 5")).toBe("center");
    expect(tickAlign(5, 30, 272, 44, "Sep 17")).toBe("start");
    expect(tickAlign(2, 30, 272, 44, "Sep 14")).toBe("end");
  });
});
