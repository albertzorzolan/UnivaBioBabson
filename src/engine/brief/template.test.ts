import { describe, expect, it } from "vitest";
import type { BriefContent, Finding, StoreData } from "../../model/types";
import { addDays } from "../../model/dates";
import { buildEvidence } from "./evidence";
import {
  LIMITATION_LINES,
  SAFETY_LINE,
  TEMPLATE_LIMITS,
  briefSafetyLines,
  findingSourceShort,
  missingEvidenceIds,
  promptFindings,
  selectReviewPrompts,
  templateBrief,
  templateGenerationInfo,
  toVisitBrief,
} from "./template";
import { verifyClaims, verifySentence } from "./verify";
import { safetyNetLine } from "./safetyNet";
import { BANNED_IN_TEMPLATE, FAKE_KB, FROM, TODAY, margaret } from "./test-fixtures";

const W = margaret();
function brief(data: StoreData = W.data, review = W.review, timeline = W.timeline) {
  const pkg = buildEvidence({ data, from: FROM, to: TODAY, review, timeline, kb: FAKE_KB });
  return { pkg, content: templateBrief(pkg, { data, review, timeline, kb: FAKE_KB }) };
}
const B = brief();
const allText = (c: BriefContent) =>
  [...c.reason, ...c.noticed, ...c.questions].map((s) => s.text).concat(c.reviewPrompts.map((p) => `${p.text} ${p.sourceShort}`), c.limitations);
const MED_NAMES = W.data.medications.map((m) => m.name);

describe("templateBrief", () => {
  it("cites only evidence ids that exist in the package", () => {
    expect(missingEvidenceIds(B.content, B.pkg)).toEqual([]);
  });

  it("restates evidence in every sentence: each passes the same verifier as AI drafts", () => {
    for (const s of [...B.content.reason, ...B.content.noticed]) {
      expect(verifySentence(s, B.pkg, { medNames: MED_NAMES, patientNames: ["Margaret"], maxLength: 400 }).issues, s.text).toEqual([]);
    }
    for (const s of B.content.questions) {
      expect(verifySentence(s, B.pkg, { medNames: MED_NAMES, patientNames: ["Margaret"], expect: "question" }).issues, s.text).toEqual([]);
    }
  });

  it("opens with the pinned concern in the caregiver's own words", () => {
    expect(B.content.reason).toHaveLength(1);
    expect(B.content.reason[0].text).toMatch(/^Alex \(daughter\) wrote on Oct \d+: "Mom seems foggier in the mornings/);
  });

  it("notices the strongest signals, their window coverage and the falls since the newest medicine", () => {
    const ids = B.content.noticed.flatMap((s) => s.evidenceIds);
    // The top signals plus one "Also recorded" line for the same medicine's sleep comparison (next test).
    expect(ids.filter((id) => id.startsWith("sig:"))).toHaveLength(TEMPLATE_LIMITS.noticedSignals + TEMPLATE_LIMITS.alsoRecorded);
    expect(ids[0]).toBe("sig:med-lorazepam:dizziness:started");
    expect(ids).toContain("fact:coverage:med-lorazepam:started");
    expect(ids[ids.length - 1]).toBe("fact:falls-since:med-lorazepam");
  });

  describe("recorded benefit alongside harms", () => {
    const SLEEP = "sig:med-lorazepam:sleep:started";
    const line = (c: BriefContent) => c.noticed.find((s) => s.text.startsWith("Also recorded"));

    it("adds one neutral 'Also recorded' line for a medicine whose shown change is worse but which also has a better one", () => {
      const s = line(B.content)!;
      expect(s.text).toBe(
        "Also recorded around the time Lorazepam (Ativan) was started: sleep quality ratings averaged 3.4 out of 5 on 14 answered " +
          "days after, compared with 2.6 out of 5 on 20 answered days before.",
      );
      expect(s.evidenceIds).toEqual([SLEEP]);
      expect(B.content.noticed.filter((x) => x.text.startsWith("Also recorded"))).toHaveLength(TEMPLATE_LIMITS.alsoRecorded);
      // Placed right after the signals, before the window-coverage line.
      const at = B.content.noticed.indexOf(s);
      expect(B.content.noticed[at - 1].evidenceIds[0]).toMatch(/^sig:/);
      expect(B.content.noticed[at + 1].evidenceIds[0]).toBe("fact:coverage:med-lorazepam:started");
    });

    it("passes the claim checker against its own cited evidence", () => {
      const s = line(B.content)!;
      const support = B.pkg.items.filter((i) => s.evidenceIds.includes(i.id));
      expect(verifyClaims(s.text, support, { medNames: MED_NAMES, patientNames: ["Margaret"] })).toEqual([]);
      expect(verifySentence(s, B.pkg, { medNames: MED_NAMES, patientNames: ["Margaret"] }).issues).toEqual([]);
    });

    it("is built from the signal's own numbers, not fixed text", () => {
      const sleep = W.timeline.signals.find((x) => x.id === SLEEP)!;
      const edited = {
        ...sleep,
        before: { ...sleep.before, answered: 18, value: 2.2 },
        after: { ...sleep.after, answered: 12, value: 3.9 },
        text: sleep.text.replace("3.4 out of 5 on 14", "3.9 out of 5 on 12").replace("2.6 out of 5 on 20", "2.2 out of 5 on 18"),
      };
      const timeline = { ...W.timeline, signals: W.timeline.signals.map((x) => (x.id === SLEEP ? edited : x)) };
      const { pkg, content } = brief(W.data, W.review, timeline);
      const s = line(content)!;
      expect(s.text).toContain("averaged 3.9 out of 5 on 12 answered days after, compared with 2.2 out of 5 on 18 answered days before");
      expect(verifySentence(s, pkg, { medNames: MED_NAMES, patientNames: ["Margaret"] }).issues).toEqual([]);
    });

    it("is left out when no 'better' change was recorded", () => {
      const timeline = { ...W.timeline, signals: W.timeline.signals.filter((x) => x.direction !== "better") };
      expect(line(brief(W.data, W.review, timeline).content)).toBeUndefined();
    });

    it("words a stop event as 'was stopped', like the signal sentences", () => {
      // The seed has no stop event, so relabel the started comparisons as a stop of the same medicine.
      const asStopped = (x: (typeof W.timeline.signals)[number]) => ({
        ...x,
        id: x.id.replace(/:started$/, ":stopped"),
        event: "stopped" as const,
        text: x.text.replace("was started", "was stopped"),
      });
      const keep = ["dizziness", "drowsiness", "confusion", "sleep"].map((m) => `sig:med-lorazepam:${m}:started`);
      const signals = W.timeline.signals.filter((x) => keep.includes(x.id)).map(asStopped);
      expect(signals).toHaveLength(4);
      const { pkg, content } = brief(W.data, W.review, { ...W.timeline, signals });
      const s = line(content)!;
      expect(s.text).toBe(
        "Also recorded around the time Lorazepam (Ativan) was stopped: sleep quality ratings averaged 3.4 out of 5 on 14 answered " +
          "days after, compared with 2.6 out of 5 on 20 answered days before.",
      );
      expect(s.evidenceIds).toEqual(["sig:med-lorazepam:sleep:stopped"]);
      expect(verifySentence(s, pkg, { medNames: MED_NAMES, patientNames: ["Margaret"] }).issues).toEqual([]);
    });

    it("is left out when the better change is already among the signals shown", () => {
      // Only two signals left (dizziness worse, sleep better): both fit in the top 3, so sleep is shown as written.
      const keep = new Set(["sig:med-lorazepam:dizziness:started", SLEEP]);
      const timeline = { ...W.timeline, signals: W.timeline.signals.filter((x) => keep.has(x.id)) };
      const { content } = brief(W.data, W.review, timeline);
      expect(content.noticed.flatMap((s) => s.evidenceIds)).toContain(SLEEP);
      expect(line(content)).toBeUndefined();
    });
  });

  it("picks review prompts for breadth: Beers, ACB, fall-risk and the prescribing cascade", () => {
    const keys = B.content.reviewPrompts.map((p) => p.findingKey);
    expect(keys).toHaveLength(TEMPLATE_LIMITS.reviewPrompts);
    expect(keys).toContain("beers-pim-benzodiazepine|med-lorazepam");
    expect(keys).toContain("acb|med-furosemide+med-oxybutynin+med-tylenolpm");
    expect(keys).toContain("fall-risk:med-amlodipine+med-furosemide+med-lorazepam+med-oxybutynin+med-tylenolpm");
    expect(keys).toContain("cascade-ccb-edema-loop|med-amlodipine+med-furosemide");
    expect(B.content.reviewPrompts[0].sourceShort).toBe("AGS Beers Criteria® 2023");
    expect(B.content.reviewPrompts[0].text).toMatch(/^Lorazepam is a benzodiazepine\. The AGS Beers Criteria 2023 list/);
  });

  it("asks at most 4 finding questions plus saved questions, de-duplicated", () => {
    const data: StoreData = {
      ...W.data,
      savedQuestions: [
        { id: "q1", text: "Could her sleep be helped without pills?", source: "typed", createdAt: "2026-10-08T10:00:00.000Z" },
        { id: "q2", text: "Is lorazepam still the best choice for her sleep and nerves, given the dizziness and near-falls recorded since it started?", source: "typed", createdAt: "2026-10-08T10:00:00.000Z" },
      ],
    };
    const { content } = brief(data);
    const texts = content.questions.map((q) => q.text);
    expect(texts).toContain("Could her sleep be helped without pills?");
    expect(texts.filter((t) => t.startsWith("Is lorazepam still the best choice"))).toHaveLength(1);
    expect(content.questions.length).toBeLessThanOrEqual(TEMPLATE_LIMITS.findingQuestions + TEMPLATE_LIMITS.savedQuestions);
    expect(content.questions.find((q) => q.text.startsWith("Could her sleep"))!.evidenceIds).toEqual(["note:question:q1"]);
  });

  it("leaves dismissed findings out of prompts and questions", () => {
    const data: StoreData = {
      ...W.data,
      reviewDecisions: [{ findingKey: "beers-pim-benzodiazepine|med-lorazepam", status: "dismissed", note: "", updatedAt: "2026-10-09T00:00:00.000Z" }],
    };
    const { content } = brief(data);
    expect(content.reviewPrompts.some((p) => p.findingKey === "beers-pim-benzodiazepine|med-lorazepam")).toBe(false);
    expect(promptFindings(W.review, data).some((f) => f.key === "beers-pim-benzodiazepine|med-lorazepam")).toBe(false);
  });

  it("lists honest limitations, never calls anything safe, and keeps one scope line", () => {
    const review = { ...W.review, notices: ["This review checks published criteria only (AGS Beers 2023, …). No flag does not mean a medicine is safe.", "Kidney function was not provided"] };
    const { content } = brief(W.data, review);
    expect(content.limitations[0]).toMatch(/^Check-ins were recorded on \d+ of 45 days from Aug 27 through Oct 10; days without a check-in are left out of every count\.$/);
    expect(content.limitations).toContain(LIMITATION_LINES.chance);
    expect(content.limitations).toContain(LIMITATION_LINES.scope);
    expect(content.limitations).toContain("Kidney function was not provided.");
    expect(content.limitations.filter((l) => /published criteria/.test(l))).toHaveLength(1);
    expect(content.limitations[content.limitations.length - 1]).toBe(LIMITATION_LINES.family);
    expect(content.limitations.join(" ")).not.toMatch(/\bsafe\b/i);
  });

  it("says that as-needed doses are not recorded day by day, only when an as-needed medicine is on the list", () => {
    expect(LIMITATION_LINES.asNeeded).toBe("Doses taken are not logged, so as-needed medicines cannot be separated.");
    // The seed's Tylenol PM is taken "at bedtime as needed".
    expect(B.content.limitations).toContain(LIMITATION_LINES.asNeeded);
    expect(B.content.limitations.indexOf(LIMITATION_LINES.asNeeded)).toBeLessThan(B.content.limitations.indexOf(LIMITATION_LINES.chance));
    const scheduled: StoreData = { ...W.data, medications: W.data.medications.map((m) => ({ ...m, asNeeded: false })) };
    expect(brief(scheduled).content.limitations).not.toContain(LIMITATION_LINES.asNeeded);
  });

  it("names medicines that were not reviewed, without implying anything about them", () => {
    const review = { ...W.review, unmatchedMedIds: ["med-metformin"] };
    const { content } = brief(W.data, review);
    expect(content.limitations).toContain("Not in Kinwise's reference set, so not reviewed: Metformin. That says nothing either way about these medicines.");
  });

  it("notes when the diary was kept much less often after a change than before", () => {
    const start = W.data.medications.find((m) => m.id === "med-lorazepam")!.startDate;
    const thinned: StoreData = { ...W.data, checkIns: W.data.checkIns.filter((c) => c.date < start || c.date > addDays(start, 10) || c.answers.dizziness === true) };
    const w = margaret();
    const timeline = { ...w.timeline };
    const { content } = brief(thinned, W.review, timeline);
    expect(content.limitations.some((l) => /^The diary was kept on \d+ of \d+ days before Lorazepam \(Ativan\) was started and on \d+ of \d+ days after/.test(l))).toBe(true);
  });

  it("falls back to a plain reason and recorded counts when there are no concerns or signals", () => {
    const data: StoreData = { ...W.data, notes: W.data.notes.map((n) => ({ ...n, pinned: false })) };
    const { pkg, content } = brief(data, W.review, { ...W.timeline, signals: [], perMed: [] });
    expect(content.reason[0].text).toMatch(/^Alex \(daughter\) would like to go over Margaret's 8 current medicines and what the diary recorded from Aug 27 through Oct 10\.$/);
    expect(content.noticed[0].evidenceIds[0]).toMatch(/^fact:count:/);
    expect(missingEvidenceIds(content, pkg)).toEqual([]);
  });

  it("words the plain reason for an emptied record: no '0 medicines', no capitalised placeholder mid-sentence", () => {
    // "Delete everything" (store.ts emptyRecord) leaves the names empty and the medicine list empty.
    const profile = { ...W.data.profile, displayName: "", preferredName: "", caregiverName: "", caregiverRelation: "", age: 0 };
    const empty: StoreData = { ...W.data, profile, notes: [], medications: [], checkIns: [], savedQuestions: [] };
    const none = { ...W.timeline, signals: [], perMed: [] };
    const review = { ...W.review, findings: [], fallRiskMedIds: [], acb: { ...W.review.acb, total: 0, contributors: [] } };
    expect(brief(empty, review, none).content.reason[0].text).toBe("The caregiver would like to go over what the diary recorded from Aug 27 through Oct 10.");
    // A name is missing but there are medicines: "your relative's", in lower case mid-sentence.
    const withMeds: StoreData = { ...empty, medications: W.data.medications };
    expect(brief(withMeds, review, none).content.reason[0].text).toMatch(
      /^The caregiver would like to go over your relative's \d+ current medicines and what the diary recorded from Aug 27 through Oct 10\.$/,
    );
    // An older empty record stored the placeholder "Your relative" as the name.
    const legacy: StoreData = { ...withMeds, profile: { ...profile, displayName: "Your relative" } };
    expect(brief(legacy, review, none).content.reason[0].text).toContain(" over your relative's ");
  });

  it("ends every brief with the safety line and the static safety-net line", () => {
    expect(briefSafetyLines(W.data.profile)).toEqual([SAFETY_LINE, safetyNetLine("Margaret")]);
    expect(briefSafetyLines({ ...W.data.profile, displayName: "", preferredName: "" })[1]).toContain("your relative's doctor or pharmacist");
  });

  it("contains no banned language anywhere", () => {
    for (const t of allText(B.content)) for (const re of BANNED_IN_TEMPLATE) expect(re.test(t), `${re} in: ${t}`).toBe(false);
    expect(SAFETY_LINE).toBe("Don't stop or change any medicine without talking to the prescriber. If something feels like an emergency, call 911.");
  });

  it("is deterministic", () => {
    expect(brief().content).toEqual(B.content);
  });
});

describe("selectReviewPrompts", () => {
  const f = (key: string, category: Finding["category"], medIds: string[]): Finding => ({
    key,
    ruleId: key,
    category,
    title: key,
    medIds,
    plain: "",
    clinician: "",
    question: "",
    sourceIds: [],
    evidenceGrade: null,
    relatedSymptoms: [],
    signalIds: [],
  });

  it("takes at most two Beers prompts first, skips Beers prompts about already-covered medicines, then fills by rank", () => {
    const ranked = [
      f("a", "beers_avoid", ["m1"]),
      f("b", "beers_condition", ["m1"]),
      f("c", "beers_avoid", ["m2"]),
      f("d", "beers_avoid", ["m3"]),
      f("e", "anticholinergic_burden", ["m2", "m3"]),
      f("g", "fall_risk", ["m1"]),
    ];
    expect(selectReviewPrompts(ranked, 4).map((x) => x.key)).toEqual(["a", "c", "e", "g"]);
    expect(selectReviewPrompts(ranked, 6).map((x) => x.key)).toEqual(["a", "b", "c", "d", "e", "g"]);
    expect(selectReviewPrompts([], 5)).toEqual([]);
  });
});

describe("provenance helpers", () => {
  it("records template provenance and starts the brief unreviewed", () => {
    const info = templateGenerationInfo(B.pkg, W.review);
    expect(info).toMatchObject({ mode: "template", model: null, droppedSentences: 0, evidenceHash: B.pkg.hash, kbVersion: "test-kb-1" });
    const vb = toVisitBrief({ id: "b1", pkg: B.pkg, content: B.content, generation: info, data: W.data });
    expect(vb).toMatchObject({ id: "b1", from: FROM, to: TODAY, reviewedAt: null, reviewedBy: null, sourceRevision: W.data.revision });
    expect(vb.includedConcernIds).toEqual(["note-cg-concern"]);
  });

  it("falls back to the reference-set label when a finding has no sources", () => {
    const finding = { ...W.review.findings[0], sourceIds: [] };
    expect(findingSourceShort(finding, FAKE_KB)).toBe("Kinwise reference set");
  });

  it("reports cited ids missing from a package", () => {
    const content: BriefContent = { ...B.content, noticed: [{ text: "x", evidenceIds: ["sig:nope"] }] };
    expect(missingEvidenceIds(content, B.pkg)).toEqual(["sig:nope"]);
  });
});
