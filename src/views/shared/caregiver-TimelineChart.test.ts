import { describe, expect, it } from "vitest";
import type { CheckIn, Medication } from "../../model/types";
import { createSeed } from "../../model/seed";
import { cellFor, cellWords, chartMedEvents, daySummary, excerptText, shortMedName, STRIP_ROWS } from "./caregiver-TimelineChart";
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
