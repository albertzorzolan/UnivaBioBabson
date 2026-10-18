import { describe, expect, it } from "vitest";
import { createSeed } from "../../../model/seed";
import { analyzeTimeline } from "../../../engine/timeline/signals";
import { reviewMedications } from "../../../engine/meds/review";
import { knownEffect } from "../../../kb";
import { evidenceId, templateGenerationInfo, toVisitBrief, verifySentence } from "../../../engine/brief";
import { medName } from "../../../engine/brief/shared";
import {
  GLANCE_NO_CHANGE,
  GLANCE_NO_CHECKINS,
  atAGlance,
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

describe("'At a glance' (the 30-second box at the top of the brief)", () => {
  const inp = inputsFor();
  const { pkg, content } = composeTemplate(inp, defaultComposeOptions(inp));
  const ids = new Set(pkg.items.map((i) => i.id));
  const lines = atAGlance(inp, content, pkg);
  const opts = { medNames: inp.data.medications.map((m) => m.name), patientNames: ["Margaret", "Mom"] };

  it("has at most 3 lines: the lead change, falls and near-falls, then the first question", () => {
    expect(lines.map((l) => l.key)).toEqual(["change", "falls", "question"]);
    expect(lines[0]).toMatchObject({
      text: "Since Lorazepam (Ativan) was started (Sep 25): dizziness on 9 of 14 answered days, vs 2 of 19 before.",
      evidenceIds: ["sig:med-lorazepam:dizziness:started"],
    });
    expect(lines[1]).toMatchObject({
      text: "1 fall (Oct 6) and 2 near-falls (Sep 27, Sep 30) on 14 answered days since Sep 25.",
      evidenceIds: ["fact:falls-since:med-lorazepam"],
    });
  });

  it("cites the same evidence as the brief sentence each line comes from", () => {
    // The change and falls lines restate a 'What we've noticed' sentence; the question is the brief's first question.
    for (const l of lines.slice(0, 2)) expect(content.noticed.some((s) => s.evidenceIds.includes(l.evidenceIds[0])), l.text).toBe(true);
    expect(lines[2].evidenceIds).toEqual(content.questions[0].evidenceIds);
    expect(content.questions[0].text.startsWith(lines[2].text)).toBe(true);
    expect(lines[2].text).toMatch(/^Could Lorazepam \(Ativan\) be contributing to .+\?$/);
    for (const l of lines) for (const id of l.evidenceIds) expect(ids.has(id), id).toBe(true);
  });

  it("passes the claim checker: every number and date is in the cited records", () => {
    for (const l of lines) {
      const res = verifySentence({ text: l.text, evidenceIds: l.evidenceIds }, pkg, { ...opts, expect: l.key === "question" ? "question" : "statement" });
      expect(res.issues, l.text).toEqual([]);
    }
    // A wrong count in the same shape is caught, so the check above is not vacuous.
    const wrong = { text: lines[0].text.replace("9 of 14", "10 of 14"), evidenceIds: lines[0].evidenceIds };
    expect(verifySentence(wrong, pkg, opts).ok).toBe(false);
  });

  it("follows the brief: a removed lead sentence is left out, never replaced by 'no flagged change'", () => {
    // The timeline still flags the change (dizziness 2 of 19 -> 9 of 14); the family only removed the sentence.
    // Saying "no flagged change" at the top would contradict the record, so the change line is simply not shown.
    const noSignals = { ...content, noticed: content.noticed.filter((s) => !s.evidenceIds.some((id) => id.startsWith("sig:"))) };
    expect(inp.timeline.signals.some((s) => ids.has(s.id))).toBe(true);
    const g = atAGlance(inp, noSignals, pkg);
    expect(g.map((l) => l.key)).toEqual(["falls", "question"]);
    expect(g.map((l) => l.text)).not.toContain(GLANCE_NO_CHANGE);
    expect(atAGlance(inp, { ...content, questions: [] }, pkg).map((l) => l.key)).toEqual(["change", "falls"]);
  });

  it("says 'no flagged change' only when the period holds check-ins and no signal at all", () => {
    expect(GLANCE_NO_CHANGE).toBe("(no flagged change in this period)");
    // Same diary, no medicines: nothing to compare before/after, so the timeline flags nothing.
    const inp2 = inputsFor({ ...inp.data, medications: [] });
    const built = composeTemplate(inp2, defaultComposeOptions(inp2));
    expect(inp2.timeline.signals.filter((s) => built.pkg.items.some((i) => i.id === s.id))).toEqual([]);
    const g = atAGlance(inp2, built.content, built.pkg);
    expect(g[0]).toEqual({ key: "change", label: "Recorded change", text: GLANCE_NO_CHANGE, evidenceIds: [] });
  });

  it("says no check-ins were recorded, not 'no flagged change', for an empty record", () => {
    expect(GLANCE_NO_CHECKINS).toBe("(no check-ins recorded in this period)");
    const empty = { ...inp.data, checkIns: [], medications: [], notes: [], savedQuestions: [] };
    const inp2 = inputsFor(empty);
    const built = composeTemplate(inp2, defaultComposeOptions(inp2));
    expect(atAGlance(inp2, built.content, built.pkg)).toEqual([{ key: "change", label: "Diary", text: GLANCE_NO_CHECKINS, evidenceIds: [] }]);
  });

  it("restates the 30-day falls fact with its own two denominators (no recent medicine start)", () => {
    // Review finding: with no start in the last 180 days the brief cites fact:falls, whose sentence gives falls and
    // near-falls separate denominators; a union count ("on 26 answered days") is not in that record.
    const data = structuredClone(inp.data);
    data.medications = data.medications.map((m) => ({ ...m, startDate: "2025-01-01" }));
    data.checkIns = data.checkIns.map((c, i) => ({
      ...c,
      answers: { ...c.answers, ...(i % 4 === 0 ? { fall: null } : {}), ...(i % 4 === 1 ? { nearFall: null } : {}) },
    }));
    const inp2 = inputsFor(data);
    const built = composeTemplate(inp2, defaultComposeOptions(inp2));
    const g = atAGlance(inp2, built.content, built.pkg);
    const falls = g.find((l) => l.key === "falls");
    expect(falls, JSON.stringify(g)).toBeDefined();
    expect(falls!.evidenceIds).toEqual([evidenceId.falls]);
    // Two different denominators, as in the fact itself (the union count would differ from both).
    const counts = [...falls!.text.matchAll(/of (\d+) answered days/g)].map((m) => m[1]);
    expect(counts.length, falls!.text).toBe(2);
    expect(counts[0]).not.toBe(counts[1]);
    expect(verifySentence({ text: falls!.text, evidenceIds: falls!.evidenceIds }, built.pkg, { ...opts, expect: "statement" }).issues).toEqual([]);
  });

  it("is deterministic", () => {
    expect(atAGlance(inp, content, pkg)).toEqual(lines);
  });
});
