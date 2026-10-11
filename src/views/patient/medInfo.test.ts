import { describe, expect, it } from "vitest";
import type { Medication } from "../../model/types";
import { KB } from "../../kb";
import { describeMed, joinWords } from "./medInfo";

const med = (name: string, ingredientIds: string[]): Medication => ({
  id: name,
  name,
  ingredientIds,
  match: ingredientIds.length ? "exact" : "none",
  dose: "",
  frequency: "",
  asNeeded: false,
  otc: false,
  reason: "",
  prescriber: "",
  startDate: "2026-01-01",
  endDate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const BANNED = /\b(caus(e|ed|ing)|safe|dangerous|urgent|stop taking|should stop|diagnos|risk score)\b/i;

describe("describeMed (My medicines: mention to your doctor)", () => {
  it("gives warfarin the blood-thinner watch-for list, cited to its monitoring source", () => {
    const info = describeMed(med("Coumadin", ["warfarin"]));
    expect(joinWords(info.phrases)).toBe(
      "unusual bruising, bleeding gums or nosebleeds that are hard to stop, black or tarry stools, pink, red or brown urine, or a fall or a bump to the head",
    );
    const rule = KB.monitoring.find((r) => r.id === "mon-anticoagulant")!;
    expect(info.sources.map((s) => s.id)).toContain(rule.sourceId);
  });

  it("gives insulin glargine (insulin_basal → insulin) the low-blood-sugar list via the class hierarchy", () => {
    const info = describeMed(med("Lantus", ["insulin glargine"]));
    expect(info.phrases).toEqual(KB.monitoring.find((r) => r.id === "mon-hypoglycemia")!.watchFor);
    expect(info.sources.length).toBeGreaterThan(0);
  });

  it("does not repeat a diary effect a watch-list already covers (glipizide: dizziness once)", () => {
    const info = describeMed(med("Glucotrol", ["glipizide"]));
    expect(info.phrases).toContain("dizziness");
    expect(info.phrases).not.toContain("feeling dizzy or light-headed");
  });

  it("keeps uncovered label effects after the watch-for items, citing both sources", () => {
    const info = describeMed(med("Lanoxin", ["digoxin"]));
    const watch = KB.monitoring.find((r) => r.id === "mon-digoxin")!.watchFor;
    expect(info.phrases.slice(0, watch.length)).toEqual(watch);
    expect(info.phrases).toContain("feeling dizzy or light-headed");
    expect(info.phrases).not.toContain("feeling confused or foggy");
    expect(info.sources.length).toBeGreaterThanOrEqual(1);
  });

  it("dedupes across ingredients and leaves non-monitoring medicines on label effects only", () => {
    const info = describeMed(med("Ativan", ["lorazepam"]));
    expect(new Set(info.phrases).size).toBe(info.phrases.length);
    expect(info.phrases).toContain("feeling sleepy during the day");
    expect(info.phrases).not.toContain("unusual bruising");
  });

  it("joins plainly, adding a serial comma only when an item has its own commas", () => {
    expect(joinWords(["a", "b", "c"])).toBe("a, b or c");
    expect(joinWords(["a", "b"])).toBe("a or b");
    expect(joinWords(["x, y or z", "b", "c"])).toBe("x, y or z, b, or c");
  });

  it("handles medicines outside the reference set", () => {
    const info = describeMed(med("Grandma's tonic", []));
    expect(info).toMatchObject({ phrases: [], sources: [], known: false });
  });

  it("uses no triage or causal words in any phrase for any KB drug", () => {
    for (const d of KB.drugs) for (const p of describeMed(med(d.display, [d.id])).phrases) expect(p, d.id).not.toMatch(BANNED);
  });
});
