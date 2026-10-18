// Round 4 "plain first, statistics one tap away": the short chance line, the runs-check qualifier on a size word, the
// counts line on review cards and the Review page's narrative lead. All computed from the seeded demo record.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSeed } from "../../model/seed";
import { analyzeTimeline } from "../../engine/timeline/signals";
import { activeMeds, reviewMedications } from "../../engine/meds/review";
import {
  CHANCE_NOTE,
  CHANCE_SHORT,
  RUNS_QUALIFIER,
  RUNS_QUALIFIER_NOTE,
  STRENGTH_SIZE_WORD,
  reviewNarrative,
  signalCountsLine,
  sizeWords,
} from "./caregiver-insights";
import { SizeWord } from "./caregiver-SizeWord";
import { ReliabilityDisclosure } from "./caregiver-Reliability";

const TODAY = "2026-10-11";
const data = createSeed(TODAY);
const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today: TODAY });
const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("short chance line", () => {
  it("is one plain sentence with no numbers, shorter than the disclosure's CHANCE_NOTE", () => {
    expect(CHANCE_SHORT).toMatch(/^[A-Z][^.]*chance\.$/);
    expect(CHANCE_SHORT).not.toMatch(/\d/);
    expect(CHANCE_SHORT.length).toBeLessThan(CHANCE_NOTE.length / 2);
  });
});

describe("size word and the runs-check qualifier", () => {
  it("adds the qualifier only when the runs check does not back the size word", () => {
    expect(sizeWords("strong", { passed: true })).toEqual({ word: STRENGTH_SIZE_WORD.strong, qualifier: null });
    expect(sizeWords("strong", { passed: false })).toEqual({ word: STRENGTH_SIZE_WORD.strong, qualifier: RUNS_QUALIFIER });
    expect(sizeWords("moderate", undefined).qualifier).toBeNull();
    expect(sizeWords("moderate", null).qualifier).toBeNull();
  });

  it("qualifies the demo's drowsiness (runs-check p above the strong bar) and not its dizziness", () => {
    const sig = (m: string) => timeline.signals.find((s) => s.metric === m && s.event === "started")!;
    expect(sig("drowsiness").runsCheck?.passed).toBe(false);
    expect(sizeWords(sig("drowsiness").strength, sig("drowsiness").runsCheck).qualifier).toBe(RUNS_QUALIFIER);
    expect(sizeWords(sig("dizziness").strength, sig("dizziness").runsCheck).qualifier).toBeNull();
  });

  it("renders the qualifier inside the same element, read as one label", () => {
    const html = renderToStaticMarkup(createElement(SizeWord, { strength: "strong", runsCheck: { passed: false } }));
    expect(strip(html)).toBe(`${STRENGTH_SIZE_WORD.strong} , ${RUNS_QUALIFIER}`);
    expect(strip(renderToStaticMarkup(createElement(SizeWord, { strength: "strong", runsCheck: { passed: true } })))).toBe(STRENGTH_SIZE_WORD.strong);
  });

  it("explains the qualifier in its own words, as a possibility", () => {
    expect(RUNS_QUALIFIER).toMatch(/^maybe /);
    expect(RUNS_QUALIFIER_NOTE.toLowerCase()).toContain(RUNS_QUALIFIER);
    expect(RUNS_QUALIFIER_NOTE).toMatch(/runs check/);
  });

  it("puts view notes inside the closed disclosure", () => {
    const html = renderToStaticMarkup(createElement(ReliabilityDisclosure, { notes: createElement("p", null, RUNS_QUALIFIER_NOTE) }));
    expect(html).toContain(RUNS_QUALIFIER_NOTE);
    // The ui Disclosure is a button with aria-expanded plus a hidden panel (not <details>): closed means both.
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).toMatch(/class="ui-disclosure__panel" hidden=""/);
  });
});

describe("counts line on a review card", () => {
  it("states both counts with denominators and the change", () => {
    const s = timeline.signals.find((x) => x.metric === "dizziness" && x.event === "started")!;
    const med = data.medications.find((m) => m.id === s.medicationId)!;
    expect(signalCountsLine(s, med.name)).toBe(
      `Dizziness: ${s.after.positive} of ${s.after.answered} answered days after ${med.name} started on Sep 25, vs ${s.before.positive} of ${s.before.answered} before`,
    );
    expect(signalCountsLine(s, med.name)).toContain("9 of 14 answered days");
    expect(signalCountsLine(s, med.name)).toContain("vs 2 of 19 before");
  });

  it("reads ratings as averages, with the answered days on both sides", () => {
    const s = timeline.signals.find((x) => x.metric === "energy")!;
    const line = signalCountsLine(s, "X");
    expect(line).toMatch(
      /^Energy: rated \d\.\d of 5 on average on \d+ answered days? after X (started|was stopped) on \w{3} \d+, vs \d\.\d on \d+ before$/,
    );
    expect(line).toContain(`on ${s.after.answered} answered days after`);
    expect(line).toContain(`vs ${s.before.value.toFixed(1)} on ${s.before.answered} before`);
  });
});

describe("Review page narrative", () => {
  const active = activeMeds(data.medications, TODAY);
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY, signals: timeline.signals });

  it("names the medicine in the most prompts, with the count", () => {
    const counts = new Map<string, number>();
    for (const f of review.findings) for (const id of new Set(f.medIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const top = Math.max(...counts.values());
    const line = reviewNarrative(review.findings, active, "Margaret’s");
    expect(line).toContain(`in ${top} of the ${review.findings.length} review prompts`);
    expect(line).not.toMatch(/should|stop|start|safe|danger|caus/i);
  });

  it("keeps the checked-medicines clause in the same one sentence", () => {
    const line = reviewNarrative(review.findings, active, "Margaret’s");
    expect(active.length).toBe(8);
    expect(line).toMatch(/^Kinwise checked Margaret.s 8 medicines against published criteria geriatric clinicians use; /);
    // The demo recorder looks for this exact phrase on the Review page (scripts/submission/record-demo.mjs).
    expect(line).toMatch(/checked Margaret.s 8 medicines/);
    expect(line.match(/[.!?]/g)).toHaveLength(1);
    expect(line.endsWith(".")).toBe(true);
  });

  it("names ties together, and falls back to a plain count", () => {
    const meds = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const lead = "Kinwise checked their 2 medicines against published criteria geriatric clinicians use; ";
    expect(reviewNarrative([{ medIds: ["a", "b"] }, { medIds: ["a", "b"] }], meds, "their")).toBe(
      `${lead}A and B each come up in 2 of the 2 review prompts.`,
    );
    expect(reviewNarrative([{ medIds: ["a"] }, { medIds: ["b"] }], meds, "their")).toBe(`${lead}the 2 review prompts involve 2 medicines.`);
    expect(reviewNarrative([{ medIds: ["a"] }], [{ id: "a", name: "A" }], "their")).toBe(
      "Kinwise checked their 1 medicine against published criteria geriatric clinicians use; the 1 review prompt involves 1 medicine.",
    );
    // No prompts: "" so the page keeps its own no-findings line.
    expect(reviewNarrative([], meds, "their")).toBe("");
  });
});
