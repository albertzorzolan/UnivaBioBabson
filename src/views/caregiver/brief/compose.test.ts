import { describe, expect, it } from "vitest";
import { createSeed } from "../../../model/seed";
import { analyzeTimeline } from "../../../engine/timeline/signals";
import { reviewMedications } from "../../../engine/meds/review";
import { knownEffect } from "../../../kb";
import { evidenceId, templateGenerationInfo, toVisitBrief } from "../../../engine/brief";
import { medName } from "../../../engine/brief/shared";
import {
  checkEditedSentence,
  composeTemplate,
  currentBrief,
  defaultComposeOptions,
  editSentence,
  editSummary,
  findingKeysIn,
  isEdited,
  medTable,
  reasonFor,
  restoreSentence,
  savedIdsIn,
  savedQuestionIncluded,
  selectableFindings,
  signalStrip,
  upsertBrief,
  withContent,
  withFinding,
  withReview,
  withSavedQuestion,
  type BriefInputs,
} from "./compose";
import { evidenceGroup, evidenceLabel, quoted } from "./evidenceLabels";
import type { StoreData } from "../../../model/types";

const today = "2026-10-11";

function inputsFor(data: StoreData = createSeed(today)): BriefInputs {
  const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect: (m, k) => knownEffect(m.ingredientIds, k) });
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals });
  return { data, review, timeline, today };
}

describe("visit brief composition", () => {
  const inp = inputsFor();
  const opts = defaultComposeOptions(inp);
  const { pkg, content } = composeTemplate(inp, opts);
  const ids = new Set(pkg.items.map((i) => i.id));

  it("builds a 30-day template brief whose citations all resolve", () => {
    expect(opts.to).toBe(today);
    expect(content.reason.length).toBeGreaterThan(0);
    expect(content.reviewPrompts.length).toBeLessThanOrEqual(5);
    for (const s of [...content.reason, ...content.noticed, ...content.questions]) for (const id of s.evidenceIds) expect(ids.has(id)).toBe(true);
    for (const p of content.reviewPrompts) expect(ids.has(evidenceId.finding(p.findingKey))).toBe(true);
  });

  it("toggles a finding's prompt and question together, in ranked order", () => {
    const ranked = selectableFindings(inp, pkg);
    const extra = ranked.find((f) => !findingKeysIn(content).includes(f.key))!;
    const on = withFinding(content, extra, true, ranked, pkg, inp.data);
    expect(findingKeysIn(on)).toContain(extra.key);
    const order = ranked.map((f) => f.key).filter((k) => findingKeysIn(on).includes(k));
    expect(findingKeysIn(on)).toEqual(order);
    const off = withFinding(on, extra, false, ranked, pkg, inp.data);
    expect(findingKeysIn(off)).toEqual(findingKeysIn(content));
    expect(off.questions.some((q) => q.evidenceIds[0] === evidenceId.finding(extra.key))).toBe(false);
  });

  it("never asks a question with a bare day count (fall question rebuilt for the period)", () => {
    const bare = (t: string) => /\bon \d+ days?\b/i.test(t) && !/ of /.test(t);
    const ranked = selectableFindings(inp, pkg);
    const all = composeTemplate(inp, { ...opts, findingKeys: ranked.map((f) => f.key) });
    const texts = [...content.questions, ...all.content.questions].map((q) => q.text);
    // Toggling each finding on from an empty selection asks the same question the template asks.
    const none = composeTemplate(inp, { ...opts, findingKeys: [] }).content;
    for (const f of ranked) texts.push(...withFinding(none, f, true, ranked, pkg, inp.data).questions.map((q) => q.text));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(bare(t), t).toBe(false);
    const fall = ranked.find((f) => f.category === "fall_risk");
    if (fall && /^With the .+ recorded recently, /i.test(fall.question)) {
      expect(texts.some((t) => /^With the /i.test(t))).toBe(false);
      expect(texts.some((t) => /recorded from .+ through /.test(t))).toBe(true);
    }
  });

  it("rebuilds with the template's pick when none of the kept review prompts still exist", () => {
    const gone = composeTemplate(inp, { ...opts, findingKeys: ["no-longer-a-finding"] }).content;
    expect(findingKeysIn(gone)).toEqual(findingKeysIn(content));
    expect(composeTemplate(inp, { ...opts, findingKeys: [] }).content.reviewPrompts).toEqual([]);
  });

  it("includes saved questions and reports them", () => {
    const q = { id: "q-test", text: "Could the bladder pill add to her dry mouth?", source: "typed", createdAt: "2026-10-11T00:00:00Z" };
    const data = { ...inp.data, savedQuestions: [q] };
    const inp2 = inputsFor(data);
    const built = composeTemplate(inp2, defaultComposeOptions(inp2));
    expect(savedIdsIn(built.content)).toEqual(["q-test"]);
    expect(savedQuestionIncluded(built.content, q)).toBe(true);
    const off = withSavedQuestion(built.content, q, false);
    expect(savedQuestionIncluded(off, q)).toBe(false);
    expect(savedQuestionIncluded(withSavedQuestion(off, q, true), q)).toBe(true);
  });

  it("marks edits, restores them and checks edited sentences with the claim checker", () => {
    const edited = editSentence(content, "noticed", 0, "Lorazepam caused dizziness on 12 of 14 days.", "Alex");
    expect(isEdited(edited.noticed[0])).toBe(true);
    expect(editSummary(edited)).toEqual({ count: 1, editors: ["Alex"] });
    const notes = checkEditedSentence(edited.noticed[0], "noticed", pkg, inp.data);
    expect(notes.some((n) => n.startsWith("Wording"))).toBe(true);
    expect(notes.some((n) => /numbers/.test(n))).toBe(true);
    expect(checkEditedSentence(content.noticed[0], "noticed", pkg, inp.data)).toEqual([]);
    const restored = restoreSentence(edited, "noticed", 0);
    expect(restored.noticed[0].text).toBe(content.noticed[0].text);
    expect(isEdited(restored.noticed[0])).toBe(false);
    // Typing the original wording back clears the mark too.
    expect(isEdited(editSentence(edited, "noticed", 0, content.noticed[0].text, "Alex").noticed[0])).toBe(false);
  });

  it("falls back to the general reason when no concern is included", () => {
    const none = composeTemplate(inp, { ...opts, includedConcernIds: [] });
    const reason = reasonFor(content.reason, none.pkg, none.content.reason);
    expect(reason.every((s) => !s.evidenceIds.some((id) => id.startsWith("concern:")))).toBe(true);
    expect(reason.length).toBeGreaterThan(0);
  });

  it("stores briefs, clears review on change and keeps review marks", () => {
    const b = toVisitBrief({ id: "brief-1", pkg, content, generation: templateGenerationInfo(pkg, inp.review), data: inp.data, includedConcernIds: opts.includedConcernIds });
    const reviewed = withReview(b, true, "caregiver", "2026-10-11T10:00:00Z");
    expect(reviewed.reviewedAt).not.toBeNull();
    expect(withContent(reviewed, content).reviewedAt).toBeNull();
    const data = upsertBrief(upsertBrief(inp.data, b), reviewed);
    expect(data.briefs).toHaveLength(1);
    expect(currentBrief(data)?.reviewedBy).toBe("caregiver");
  });

  it("renders the medication table with short flags and the before/after strip", () => {
    const rows = medTable(inp, { from: opts.from, to: opts.to });
    expect(rows).toHaveLength(inp.data.medications.filter((m) => !m.endDate).length);
    const lorazepam = rows.find((r) => r.medId === "med-lorazepam");
    expect(lorazepam?.isNew).toBe(true);
    expect(lorazepam?.short.some((f) => f.startsWith("Beers"))).toBe(true);
    const strip = signalStrip(inp, content, pkg, medName);
    expect(strip).not.toBeNull();
    expect(strip!.rows.length).toBeGreaterThan(0);
    for (const r of strip!.rows) expect(r.cells).toHaveLength(strip!.days.length);
    expect(strip!.days[strip!.eventIndex]).toBe(strip!.eventDate);
  });

  it("copes with an empty record", () => {
    const empty = { ...inp.data, checkIns: [], medications: [], notes: [], savedQuestions: [] };
    const inp3 = inputsFor(empty);
    const built = composeTemplate(inp3, defaultComposeOptions(inp3));
    expect(built.content.reviewPrompts).toEqual([]);
    expect(medTable(inp3, { from: built.pkg.from, to: built.pkg.to })).toEqual([]);
    expect(signalStrip(inp3, built.content, built.pkg, medName)).toBeNull();
  });

  it("quotes a claim once, never doubling quote marks", () => {
    expect(quoted("Dizzy on 5 of 14 days.")).toBe("“Dizzy on 5 of 14 days.”");
    expect(quoted('She wrote "dizzy again Wednesday."')).toBe('She wrote "dizzy again Wednesday."');
    expect(quoted("“Felt wobbly” on Oct 5.")).toBe("“Felt wobbly” on Oct 5.");
  });

  it("labels evidence ids for chips", () => {
    expect(evidenceGroup("sig:med-lorazepam:dizziness:started")).toBe("signal");
    expect(evidenceLabel("sig:med-lorazepam:dizziness:started", undefined, inp.data)).toBe("Before vs after · dizziness");
    expect(evidenceLabel("entry:chk-2026-10-05:words", undefined, inp.data)).toBe("Check-in Oct 5");
    expect(evidenceLabel("med:med-lorazepam", undefined, inp.data)).toBe("Lorazepam (Ativan)");
    expect(evidenceGroup("note:question:q1")).toBe("question");
  });
});
