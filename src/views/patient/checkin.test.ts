import { describe, expect, it } from "vitest";
import type { Proposal } from "../../model/types";
import { createSeed } from "../../model/seed";
import { commitStore, validateStore } from "../../model/store";
import { addDays } from "../../model/dates";
import { extractCheckIn } from "../../engine/nlp/extract";
import {
  acceptProposal,
  answerLines,
  answeredCount,
  applyExtraction,
  buildCheckIn,
  checkedInDays,
  commitCheckIn,
  dedupeSkipped,
  emptyForm,
  formFromCheckIn,
  friendlySkip,
  isAccepted,
  isEditableDate,
  reconcileSpan,
  setAnswer,
  unacceptProposal,
} from "./checkin";

const TODAY = "2026-10-11";
const NOW = "2026-10-11T18:00:00.000Z";
const STORY =
  "Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. Slept badly. " +
  "My granddaughter Sofia fell off her bike, poor thing. Forgot my water pill.";

function seedAndExtract() {
  const data = createSeed(TODAY);
  const ex = extractCheckIn(STORY, { meds: data.medications, today: TODAY, voice: "patient" });
  return { data, ex };
}

describe("form model", () => {
  it("auto-accepts explicit proposals only; best guesses wait for her", () => {
    const { ex } = seedAndExtract();
    const form = applyExtraction(emptyForm(), ex.proposals);
    expect(form.answers.dizziness).toBe(true);
    expect(form.answers.nearFall).toBe(true);
    expect(form.answers.sleep).toBeNull(); // "Slept badly" is an inferred 2 of 5
    expect(form.answers.fall).toBeNull(); // the granddaughter's fall is not hers
    expect(form.fromWords.dizziness?.spans[0].quote).toBe("woozy");
    const sleep = ex.proposals.find((p) => p.field === "sleep")!;
    expect(isAccepted(form, sleep)).toBe(false);
    const accepted = acceptProposal(form, sleep);
    expect(accepted.answers.sleep).toBe(2);
    expect(isAccepted(accepted, sleep)).toBe(true);
    expect(unacceptProposal(accepted, sleep).answers.sleep).toBeNull();
  });

  it("never overwrites an answer she gave by hand", () => {
    const { ex } = seedAndExtract();
    const manual = setAnswer(emptyForm(), "dizziness", false);
    const form = applyExtraction(manual, ex.proposals);
    expect(form.answers.dizziness).toBe(false);
    expect(form.fromWords.dizziness).toBeUndefined();
  });

  it("stores Not sure as unanswered and clears severity when dizziness is not yes", () => {
    let form = setAnswer(emptyForm(), "dizziness", true);
    form = setAnswer(form, "dizzinessSeverity", 2);
    form = setAnswer(form, "dizziness", "unsure");
    expect(form.answers.dizziness).toBeNull();
    expect(form.answers.dizzinessSeverity).toBeNull();
    expect(form.unsure).toContain("dizziness");
    expect(answeredCount(form.answers)).toBe(0);
  });

  it("settles a conflict with the value she chose and no certainty claim", () => {
    const conflict: Proposal = {
      field: "dizziness",
      value: null,
      certainty: "conflict",
      origin: "nlp",
      spans: [{ start: 0, end: 5, quote: "Dizzy" }],
      reason: "both",
    };
    const form = acceptProposal(emptyForm(), conflict, false);
    expect(form.answers.dizziness).toBe(false);
    expect(form.fromWords.dizziness?.certainty).toBeNull();
    expect(isAccepted(form, conflict)).toBe(true);
  });

  it("accepting a severity also answers dizziness yes", () => {
    const sev: Proposal = {
      field: "dizzinessSeverity",
      value: 1,
      certainty: "inferred",
      origin: "nlp",
      spans: [{ start: 0, end: 11, quote: "a bit dizzy" }],
      reason: "",
    };
    const form = acceptProposal(emptyForm(), sev);
    expect(form.answers.dizziness).toBe(true);
    expect(form.answers.dizzinessSeverity).toBe(1);
  });

  it("describes answers in words, folding severity into dizziness", () => {
    const form = setAnswer(setAnswer(setAnswer(emptyForm(), "dizziness", true), "dizzinessSeverity", 1), "energy", 2);
    const lines = answerLines(form.answers);
    expect(lines.find((l) => l.field === "dizziness")?.words).toBe("Yes — a little");
    expect(lines.find((l) => l.field === "energy")?.words).toBe("Low (2 of 5)");
    expect(lines.find((l) => l.field === "fall")?.words).toBe("Not answered");
  });
});

describe("buildCheckIn + commitCheckIn", () => {
  it("creates today's check-in with provenance spans that match the story and passes the store's rules", () => {
    const { data, ex } = seedAndExtract();
    let form = applyExtraction(emptyForm(), ex.proposals);
    form = acceptProposal(form, ex.proposals.find((p) => p.field === "sleep")!);
    form = setAnswer(form, "energy", 3);
    form = setAnswer(form, "swelling", "unsure");
    const c = buildCheckIn({ date: TODAY, story: STORY, form, otherSymptoms: ex.otherSymptoms, medNotes: ex.medNotes, existing: null, now: NOW });

    expect(c.id).toBe(`chk-${TODAY}`);
    expect(c.revision).toBe(1);
    expect(c.answers.swelling).toBeNull();
    expect(c.provenance.dizziness).toMatchObject({ origin: "nlp", certainty: "explicit" });
    expect(c.provenance.sleep).toMatchObject({ origin: "nlp", certainty: "inferred" });
    expect(c.provenance.energy).toEqual({ origin: "manual", certainty: null, spans: [] });
    expect(c.provenance.swelling).toBeUndefined();
    for (const p of Object.values(c.provenance)) for (const s of p!.spans) expect(STORY.slice(s.start, s.end)).toBe(s.quote);
    expect(c.medNotes[0]).toMatchObject({ medicationId: "med-furosemide" });

    const next = commitCheckIn(data, c);
    expect(validateStore(next)).toBe(true);
    const committed = commitStore(data, next, "patient", NOW);
    expect(committed.revision).toBe(data.revision + 1);
    expect(committed.checkIns.filter((x) => x.date === TODAY)).toHaveLength(1);
    expect(committed.checkInHistory).toHaveLength(data.checkInHistory.length);
  });

  it("changing a saved day bumps its revision and keeps the old version in checkInHistory", () => {
    const data = createSeed(TODAY);
    const day = addDays(TODAY, -1);
    const existing = data.checkIns.find((c) => c.date === day)!;
    const form = setAnswer(formFromCheckIn(existing), "energy", 5);
    const c = buildCheckIn({
      date: day, story: existing.story, form, otherSymptoms: existing.otherSymptoms, medNotes: existing.medNotes, existing, now: NOW,
    });
    expect(c.id).toBe(existing.id);
    expect(c.revision).toBe(existing.revision + 1);
    const next = commitStore(data, commitCheckIn(data, c), "patient", NOW);
    expect(next.checkIns.find((x) => x.date === day)?.answers.energy).toBe(5);
    expect(next.checkInHistory.at(-1)).toEqual(existing);
    expect(next.checkIns).toHaveLength(data.checkIns.length);
  });

  it("re-locates or drops spans when the story was edited after reading it", () => {
    expect(reconcileSpan("I was woozy", { start: 0, end: 5, quote: "woozy" })).toEqual({ start: 6, end: 11, quote: "woozy" });
    expect(reconcileSpan("All fine", { start: 0, end: 5, quote: "woozy" })).toBeNull();
    const { ex } = seedAndExtract();
    const form = applyExtraction(emptyForm(), ex.proposals);
    const c = buildCheckIn({ date: TODAY, story: "All good today.", form, otherSymptoms: [], medNotes: [], existing: null, now: NOW });
    expect(c.provenance.dizziness).toEqual({ origin: "manual", certainty: null, spans: [] });
  });
});

describe("dates and wording", () => {
  it("allows changing today and the 6 days before", () => {
    expect(isEditableDate(TODAY, TODAY)).toBe(true);
    expect(isEditableDate(addDays(TODAY, -6), TODAY)).toBe(true);
    expect(isEditableDate(addDays(TODAY, -7), TODAY)).toBe(false);
    expect(isEditableDate(addDays(TODAY, 1), TODAY)).toBe(false);
    expect(isEditableDate("2026-02-30", TODAY)).toBe(false);
    expect(isEditableDate(null, TODAY)).toBe(false);
  });

  it("counts check-in days in the last week", () => {
    const data = createSeed(TODAY);
    const n = checkedInDays(data.checkIns, TODAY);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(7);
  });

  it("explains skipped mentions in plain words", () => {
    const { ex } = seedAndExtract();
    const lines = dedupeSkipped(ex.skipped);
    expect(lines[0].why).toBe("that's about someone else");
    expect(lines[0].quote).toContain("fell off her bike");
    const hist = friendlySkip({
      mention: { span: { start: 0, end: 7, quote: "swollen" }, negated: false, temporality: "historical", experiencer: "patient" },
      reason: 'About an earlier time ("last week"), not today ("swollen last week")',
    });
    expect(hist).toEqual({ quote: "swollen last week", why: "that was on another day, not today" });
  });
});
