import { describe, expect, it } from "vitest";
import { createSeed } from "../../../model/seed";
import { commitStore } from "../../../model/store";
import { previewAddition, reviewMedications } from "../../../engine/meds";
import type { Finding } from "../../../model/types";
import {
  addMedication,
  correctedFields,
  countPrescribers,
  doseChanged,
  draftFromMed,
  editMedication,
  emptyDraft,
  eventHistory,
  removeMedication,
  resolveMatch,
  restoreMedication,
  splitMeds,
  stopMedication,
  validateDraft,
  validateStop,
} from "./medRecords";
import {
  addSavedQuestion,
  decisionMap,
  diffPrompts,
  groupByCategory,
  metricRows,
  recentDiary,
  removeSavedQuestion,
  savedQuestionFor,
  setDecision,
} from "./reviewRecords";

const today = "2026-10-11";
const now = "2026-10-11T15:00:00.000Z";
const ctx = { today, now, actorName: "Alex" };

describe("medication records", () => {
  it("adds a medicine with started + added events and passes the caregiver commit rules", () => {
    const data = createSeed(today);
    const draft = { ...emptyDraft(today), name: "Paroxetine", ingredientIds: ["paroxetine"], match: "exact" as const, startDate: "2026-10-01" };
    const { data: next, med } = addMedication(data, draft, ctx);
    expect(next.medications).toHaveLength(data.medications.length + 1);
    const evs = next.medEvents.filter((e) => e.medicationId === med.id);
    expect(evs.map((e) => e.kind).sort()).toEqual(["added_to_list", "started"]);
    expect(evs.find((e) => e.kind === "started")?.date).toBe("2026-10-01");
    expect(() => commitStore(data, next, "caregiver")).not.toThrow();
    expect(() => commitStore(data, next, "patient")).toThrow();
  });

  it("records a dated dose change and a correction when editing", () => {
    const data = createSeed(today);
    const before = data.medications.find((m) => m.id === "med-amlodipine")!;
    const draft = { ...draftFromMed(before), dose: "5 mg", reason: "High blood pressure" };
    expect(doseChanged(before, draft)).toBe(true);
    expect(correctedFields(before, draft)).toEqual(["reason"]);
    const next = editMedication(data, before.id, draft, { ...ctx, doseChangeDate: "2026-10-05" });
    const evs = next.medEvents.filter((e) => e.medicationId === before.id);
    const dose = evs.find((e) => e.kind === "dose_changed");
    expect(dose?.date).toBe("2026-10-05");
    expect(dose?.detail).toContain("10 mg once daily");
    expect(dose?.detail).toContain("5 mg once daily");
    expect(evs.some((e) => e.kind === "corrected")).toBe(true);
  });

  it("moves the started event when the start date is corrected", () => {
    const data = createSeed(today);
    const before = data.medications.find((m) => m.id === "med-lorazepam")!;
    const next = editMedication(data, before.id, { ...draftFromMed(before), startDate: "2026-09-20" }, ctx);
    const started = next.medEvents.find((e) => e.medicationId === before.id && e.kind === "started");
    expect(started?.date).toBe("2026-09-20");
  });

  it("stops a medicine (endDate = last day taken) and splits active vs stopped", () => {
    const data = createSeed(today);
    const next = stopMedication(data, "med-lorazepam", { lastDay: "2026-10-10", note: "Dr. Lee advised" }, ctx);
    const med = next.medications.find((m) => m.id === "med-lorazepam")!;
    expect(med.endDate).toBe("2026-10-10");
    expect(next.medEvents.some((e) => e.medicationId === med.id && e.kind === "stopped" && e.detail.includes("Dr. Lee advised"))).toBe(true);
    const { active, stopped } = splitMeds(next.medications, today);
    expect(stopped.map((m) => m.id)).toEqual(["med-lorazepam"]);
    expect(active.some((m) => m.id === "med-lorazepam")).toBe(false);
    // A medicine whose last day is today is still active today (engine semantics).
    const todayStop = stopMedication(data, "med-lorazepam", { lastDay: today, note: "" }, ctx);
    expect(splitMeds(todayStop.medications, today).active.some((m) => m.id === "med-lorazepam")).toBe(true);
  });

  it("validates stop dates and drafts", () => {
    const data = createSeed(today);
    const med = data.medications.find((m) => m.id === "med-lorazepam")!;
    expect(validateStop(med, "2026-10-12", today)).toMatch(/future/);
    expect(validateStop(med, "2026-01-01", today)).toMatch(/before it was started/);
    expect(validateStop(med, "2026-10-10", today)).toBeNull();
    expect(validateDraft(emptyDraft(today), today).name).toBeTruthy();
    expect(validateDraft({ ...emptyDraft(today), name: "X", startDate: "2027-01-01" }, today).startDate).toMatch(/future/);
    expect(validateDraft({ ...emptyDraft(today), name: "lorazapam" }, today, { fuzzyPending: true }).name).toMatch(/Did you mean/);
  });

  it("removes and restores a medicine with its history", () => {
    const data = createSeed(today);
    const { data: next, removed } = removeMedication(data, "med-atorvastatin");
    expect(next.medications.some((m) => m.id === "med-atorvastatin")).toBe(false);
    expect(next.medEvents.some((e) => e.medicationId === "med-atorvastatin")).toBe(false);
    const back = restoreMedication(next, removed!);
    expect(back.medications).toHaveLength(data.medications.length);
    expect(back.medEvents).toHaveLength(data.medEvents.length);
  });

  it("only stores a fuzzy match once confirmed", () => {
    const fuzzy = { ingredientIds: ["lorazepam"], match: "fuzzy" as const, suggestion: "Lorazepam", normalized: "lorazapam" };
    expect(resolveMatch(fuzzy, null)).toEqual({ ingredientIds: [], match: "none" });
    expect(resolveMatch(fuzzy, "declined")).toEqual({ ingredientIds: [], match: "none" });
    expect(resolveMatch(fuzzy, "confirmed")).toEqual({ ingredientIds: ["lorazepam"], match: "fuzzy_confirmed" });
  });

  it("lists history newest first and skips events of removed medicines", () => {
    const data = createSeed(today);
    const h = eventHistory(data.medEvents, data.medications);
    for (let i = 1; i < h.length; i++) expect(h[i - 1].event.date >= h[i].event.date).toBe(true);
    expect(eventHistory(data.medEvents, data.medications.slice(1)).length).toBeLessThan(h.length);
  });
});

describe("review records", () => {
  it("keeps one decision per finding and clears it back to open", () => {
    const data = createSeed(today);
    let next = setDecision(data, "k1", "to_discuss", "  ask   Dr. Lee ", now);
    next = setDecision(next, "k1", "discussed", "", now);
    expect(next.reviewDecisions).toHaveLength(1);
    expect(decisionMap(next.reviewDecisions).get("k1")?.status).toBe("discussed");
    expect(setDecision(next, "k1", "open", "", now).reviewDecisions).toHaveLength(0);
    expect(setDecision(data, "k2", "dismissed", "  ask   Dr. Lee ", now).reviewDecisions[0].note).toBe("ask Dr. Lee");
  });

  it("saves a finding's question once and removes it", () => {
    const data = createSeed(today);
    const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today });
    const f = review.findings[0];
    const once = addSavedQuestion(data, f, now);
    expect(addSavedQuestion(once, f, now).savedQuestions).toHaveLength(once.savedQuestions.length);
    const q = savedQuestionFor(once, f)!;
    expect(q.text).toBe(f.question);
    expect(removeSavedQuestion(once, q.id).savedQuestions).toHaveLength(data.savedQuestions.length);
  });

  it("groups findings by category in engine order", () => {
    const data = createSeed(today);
    const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today });
    const groups = groupByCategory(review.findings);
    expect(groups.reduce((n, g) => n + g.findings.length, 0)).toBe(review.findings.length);
    expect(groups[0].category).toBe(review.findings[0].category);
  });

  it("record rows match the recent-window counts", () => {
    const data = createSeed(today);
    const facts = recentDiary(data, today);
    const rows = metricRows(data, "dizziness", facts.recentFrom, today);
    expect(rows.length).toBe(facts.answered.get("dizziness") ?? 0);
    expect(rows.filter((r) => r.counted).length).toBe(facts.positives.get("dizziness")?.length ?? 0);
  });
});

describe("countPrescribers", () => {
  it("counts distinct clinicians and skips OTC / self entries", () => {
    const m = (prescriber: string, otc = false) => ({ prescriber, otc });
    expect(
      countPrescribers([
        m("Dr. Lee"),
        m("dr. lee "),
        m("Dr. Shah (urology)"),
        m("Self (OTC)", true),
        m("Self"),
        m("OTC"),
        m("Over the counter"),
        m("Dr. Okafor", true),
        m(""),
        m("Urgent care"),
      ]),
    ).toBe(3);
  });

  it("gives 4 prescribers for Margaret's seed list (matches the tour)", () => {
    const data = createSeed(today);
    const { active } = splitMeds(data.medications, today);
    expect(countPrescribers(active)).toBe(4);
  });
});

describe("diffPrompts", () => {
  const f = (ruleId: string, medIds: string[], category: Finding["category"] = "anticholinergic_burden"): Finding => ({
    key: `${ruleId}:${[...medIds].sort().join("+")}`,
    ruleId,
    category,
    title: ruleId,
    medIds,
    plain: "",
    clinician: "",
    question: "",
    sourceIds: [],
    evidenceGrade: null,
    relatedSymptoms: [],
    signalIds: [],
  });

  it("treats a combined prompt whose medicines changed as one changed prompt, not new + removed", () => {
    const before = [f("acb-total", ["a", "b"]), f("fall-risk", ["a"], "fall_risk")];
    const after = [f("acb-total", ["a", "new"]), f("fall-risk", ["a"], "fall_risk"), f("beers-x", ["new"], "beers_avoid")];
    const d = diffPrompts(before, after);
    expect(d.fresh.map((x) => x.ruleId)).toEqual(["beers-x"]);
    expect(d.changed.map((c) => [c.before.key, c.after.key])).toEqual([["acb-total:a+b", "acb-total:a+new"]]);
    expect(d.removed).toEqual([]);
  });

  it("keeps separate instances of one rule apart and reports a cleared one as removed", () => {
    const before = [f("dup", ["a", "b"], "duplicate_class"), f("dup", ["c", "d"], "duplicate_class")];
    const after = [f("dup", ["a", "b", "x"], "duplicate_class")];
    const d = diffPrompts(before, after);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].before.medIds).toEqual(["a", "b"]);
    expect(d.removed.map((x) => x.key)).toEqual(["dup:c+d"]);
    expect(d.fresh).toEqual([]);
  });

  it("does not list the ACB total as both new and no longer applying when Advil PM is added", () => {
    const data = createSeed(today);
    const state = { meds: data.medications, profile: data.profile, checkIns: data.checkIns, today };
    const p = previewAddition(state, { name: "Advil PM", ingredientIds: ["ibuprofen", "diphenhydramine"], match: "exact" });
    const d = diffPrompts(reviewMedications(state).findings, p.after.findings);
    const acb = (list: Finding[]) => list.filter((x) => x.ruleId === "acb-total");
    expect(acb(d.fresh)).toEqual([]);
    expect(acb(d.removed)).toEqual([]);
    expect(d.changed.filter((c) => c.after.ruleId === "acb-total")).toHaveLength(1);
    // Every engine-reported addition is accounted for exactly once.
    expect(d.fresh.length + d.changed.length).toBe(p.added.length);
  });
});
