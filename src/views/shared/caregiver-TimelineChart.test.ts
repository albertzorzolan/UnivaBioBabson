import { describe, expect, it } from "vitest";
import type { CheckIn, Medication } from "../../model/types";
import { createSeed } from "../../model/seed";
import { TIP_WIDTH, cellFor, cellWords, chartMedEvents, daySummary, excerptText, placeTip, shortMedName, STRIP_ROWS, tipWidthFor } from "./caregiver-TimelineChart";
import { storySegments } from "./caregiver-Records";

const TODAY = "2026-10-11";
const data = createSeed(TODAY);
const row = (k: string) => STRIP_ROWS.find((r) => r.key === k)!;
const byDate = (d: string) => data.checkIns.find((c) => c.date === d) as CheckIn;

describe("timeline chart helpers", () => {
  it("shortens medicine names for markers", () => {
    expect(shortMedName({ name: "Lorazepam (Ativan)" })).toBe("Lorazepam");
    expect(shortMedName({ name: "  " })).toBe("A medicine");
  });

  it("places start and stop markers at day boundaries inside the range only", () => {
    const meds = data.medications;
    const ev = chartMedEvents(meds, data.medEvents, "2026-09-12", TODAY);
    expect(ev.map((e) => e.label)).toEqual(["Lorazepam started"]);
    expect(ev[0].boundary).toBe(13); // Sep 25 is the 14th day from Sep 12
    const stopped: Medication = { ...meds[0], id: "m-stop", name: "Short course", startDate: "2026-09-01", endDate: "2026-09-20" };
    const ev2 = chartMedEvents([stopped], [], "2026-09-12", TODAY);
    expect(ev2.map((e) => [e.kind, e.boundary])).toEqual([["stopped", 9]]); // end of Sep 20
  });

  it("never reads a blank answer as 'no'", () => {
    const c = byDate("2026-10-06");
    expect(cellFor(c, row("falls")).state).toBe("yes");
    expect(cellWords(c, row("dizziness"))).toBe("Yes (severe)");
    const blank = { ...c, answers: { ...c.answers, confusion: null, fall: null, nearFall: null } };
    expect(cellFor(blank, row("confusion")).state).toBe("unanswered");
    expect(cellWords(blank, row("falls"))).toBe("Not answered");
    expect(cellFor(undefined, row("dizziness")).state).toBe("missing");
  });

  it("summarises a day for screen readers", () => {
    expect(daySummary("2026-10-06", byDate("2026-10-06"))).toMatch(/fall/);
    expect(daySummary("2026-10-11", undefined)).toMatch(/no check-in/);
  });

  it("cuts excerpts at a word boundary", () => {
    expect(excerptText("alpha bravo charlie delta", 16)).toBe("alpha bravo…");
    expect(excerptText("short", 16)).toBe("short");
  });
});

describe("story highlighting", () => {
  it("merges nested spans and keeps the text intact", () => {
    for (const c of data.checkIns.filter((x) => x.story)) {
      const segs = storySegments(c.story, c.provenance, [], c.answers);
      expect(segs.map((s) => s.text).join("")).toBe(c.story);
    }
    const c = byDate("2026-10-08");
    const segs = storySegments(c.story, c.provenance, [], c.answers);
    expect(segs.filter((s) => s.labels.length).map((s) => s.text)).toContain("woozy");
  });

  it("labels negated phrases with their answer", () => {
    const c = byDate("2026-10-10");
    const labels = storySegments(c.story, c.provenance, [], c.answers).flatMap((s) => s.labels);
    expect(labels).toContain("dizziness · no");
  });
});

describe("day tooltip placement", () => {
  it("sits beside the column on the preferred side when there is room", () => {
    // Wide screen, no sideways scroll: the whole plot (and the label column, x < 0) is visible.
    expect(placeTip({ colLeft: 100, colRight: 110, width: 248, visibleFrom: -156, visibleTo: 1000, prefer: "start" })).toBe(120);
    expect(placeTip({ colLeft: 700, colRight: 710, width: 248, visibleFrom: -156, visibleTo: 1000, prefer: "end" })).toBe(700 - 10 - 248);
  });

  it("flips to the other side when the preferred side would leave the visible area", () => {
    expect(placeTip({ colLeft: 900, colRight: 910, width: 248, visibleFrom: -156, visibleTo: 1000, prefer: "start" })).toBe(900 - 10 - 248);
    expect(placeTip({ colLeft: 20, colRight: 30, width: 248, visibleFrom: 0, visibleTo: 1000, prefer: "end" })).toBe(40);
  });

  it("stays inside the visible part of a scrolled plot on a phone (390 px)", () => {
    // 60 days on a 542 px plot scrolled to its end; 312 px of scroll box are visible, 84 px of them over the
    // sticky row labels (the tooltip is drawn above them), so plot x 230..542 is on screen.
    const width = tipWidthFor(312);
    for (let day = 0; day < 60; day++) {
      const colLeft = (day / 60) * 542;
      if (colLeft < 230) continue; // under the row labels until scrolled
      const left = placeTip({ colLeft, colRight: colLeft + 542 / 60, width, visibleFrom: 230, visibleTo: 542, prefer: day / 60 > 0.6 ? "end" : "start" });
      expect(left).toBeGreaterThanOrEqual(230);
      expect(left + width).toBeLessThanOrEqual(542);
    }
  });

  it("never grows wider than the scroll box, and pins to its left edge when even that does not fit", () => {
    expect(tipWidthFor(1200)).toBe(TIP_WIDTH);
    expect(tipWidthFor(200)).toBe(192);
    expect(placeTip({ colLeft: 50, colRight: 60, width: 300, visibleFrom: 10, visibleTo: 250, prefer: "start" })).toBe(10);
  });
});
