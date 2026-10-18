import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest } from "./llm";

// The runtime (WebGPU worker) is replaced by a scripted fake; everything else is real.
const llm = vi.hoisted(() => ({ ready: true, outputs: [] as unknown[], requests: [] as GenerateRequest[] }));
vi.mock("./llm", () => ({
  isModelReady: () => llm.ready,
  getLLMState: () => ({ model: "fake-model" }),
  generateJSON: async (req: GenerateRequest) => {
    llm.requests.push(req);
    const value = llm.outputs.shift();
    return { value, ms: 1234, raw: JSON.stringify(value), model: "fake-model", finishReason: "stop", salvaged: false, promptTokens: 1, completionTokens: 1 };
  },
}));

import { createSeed } from "../model/seed";
import { analyzeTimeline } from "../engine/timeline/signals";
import { reviewMedications } from "../engine/meds/review";
import { knownEffect } from "../kb";
import { composeTemplate, defaultComposeOptions } from "../views/caregiver/brief/compose";
import { fallbackAnalyzeContext } from "./adapters";
import { aliasEvidence, selectEvidence } from "./prompts";
import { MARGARET_FINDINGS, MARGARET_MED_NAMES, MARGARET_PACKAGE, MARGARET_TEMPLATE, QA_CASES, REFINE_CASES } from "./fixtures";
import {
  AIValidationError,
  PROMPT_VERSION,
  aiAnswer,
  aiDraftBrief,
  aiExplainFinding,
  aiRefineExtraction,
  assembleBrief,
  checkExplanation,
  checkRefinements,
  completeCitations,
  isRelevant,
  openFieldsFor,
  plainIssue,
  sharesTopic,
  softenQuestion,
  verifySection,
} from "./tasks";

const SIG = "sig:med-lorazepam:dizziness:started";
const FALLS = "fact:falls";
const BENZO = "find:beers-pim-benzodiazepine|med-lorazepam";
const ACB = "find:acb|med-furosemide+med-oxybutynin+med-tylenolpm";
const CONCERN = "concern:note-concern-1";
const opts = { medNames: MARGARET_MED_NAMES };

const GOOD_BRIEF = {
  reason: [{ evidenceIds: [CONCERN], text: "We are coming in because Alex has noticed Mom seems foggier in the mornings since urgent care started a new sleeping pill." }],
  noticed: [
    { evidenceIds: [SIG], text: "Dizziness was recorded on 9 of 14 answered days from Sep 25, when lorazepam was started, compared with 2 of 19 answered days before." },
    { evidenceIds: [FALLS], text: "A fall was recorded on 1 day and a near-fall on 2 days from Sep 25 through Oct 11." },
    { evidenceIds: [SIG], text: "Lorazepam is causing her dizziness." },
  ],
  questions: [
    { evidenceIds: [SIG, BENZO], text: "Could the lorazepam started on Sep 25 be contributing to the dizziness and near-falls recorded since then, and is there an alternative for sleep?" },
    { evidenceIds: [ACB], text: "With an anticholinergic burden score of 7, could the diphenhydramine in Tylenol PM or the oxybutynin be reviewed?" },
    { evidenceIds: [BENZO], text: "She should stop taking lorazepam right away." },
  ],
};

beforeEach(() => {
  llm.ready = true;
  llm.outputs = [];
  llm.requests = [];
});

describe("assembleBrief", () => {
  it("keeps verified sentences, drops failing ones with reasons, keeps deterministic sections", () => {
    const { content, dropped } = assembleBrief(GOOD_BRIEF, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    expect(content.reason).toHaveLength(1);
    expect(content.noticed.map((s) => s.text)).toHaveLength(2);
    expect(content.questions).toHaveLength(2);
    expect(content.reviewPrompts).toBe(MARGARET_TEMPLATE.reviewPrompts);
    expect(content.limitations).toBe(MARGARET_TEMPLATE.limitations);
    expect(dropped.map((d) => d.section).sort()).toEqual(["noticed", "questions"]);
    expect(dropped.find((d) => d.section === "noticed")!.issues.join(" ")).toMatch(/causal/);
    expect(dropped.find((d) => d.section === "questions")!.issues.join(" ")).toMatch(/advice|urgency/);
  });
  it("falls back to the template reason when the AI reason fails", () => {
    const value = { ...GOOD_BRIEF, reason: [{ evidenceIds: [CONCERN], text: "This is an emergency." }] };
    expect(assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts).content.reason).toBe(MARGARET_TEMPLATE.reason);
  });
  it("throws when fewer than 2 observations survive", () => {
    const value = { ...GOOD_BRIEF, noticed: GOOD_BRIEF.noticed.slice(1) };
    expect(() => assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts)).toThrow(AIValidationError);
  });
  it("keeps the AI observations and uses the template's questions when fewer than 2 questions survive", () => {
    const value = { ...GOOD_BRIEF, questions: [GOOD_BRIEF.questions[0], { evidenceIds: [SIG], text: "Dizziness was recorded on 9 of 14 days." }] };
    const r = assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    expect(r.sections).toEqual({ reason: "ai", noticed: "ai", questions: "template" });
    expect(r.content.noticed).toHaveLength(2);
    expect(r.content.questions).toBe(MARGARET_TEMPLATE.questions);
    expect(r.dropped.some((d) => d.section === "questions" && d.issues.some((i) => i.startsWith("form")))).toBe(true);
  });
  it("labels every section 'ai' when the whole draft passes, and the reason 'template' when only it fails", () => {
    expect(assembleBrief(GOOD_BRIEF, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts).sections).toEqual({ reason: "ai", noticed: "ai", questions: "ai" });
    const value = { ...GOOD_BRIEF, reason: [{ evidenceIds: [CONCERN], text: "This is an emergency." }] };
    expect(assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts).sections.reason).toBe("template");
  });
  it("treats malformed items and duplicates as dropped", () => {
    const value = {
      ...GOOD_BRIEF,
      noticed: [...GOOD_BRIEF.noticed.slice(0, 2), { text: 5 }, GOOD_BRIEF.noticed[0]],
    };
    const { dropped } = assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    expect(dropped.some((d) => d.issues[0].startsWith("malformed"))).toBe(true);
    expect(dropped.some((d) => d.issues[0].startsWith("duplicate"))).toBe(true);
  });
  it("rejects ids that are not in the package even if the model invents them", () => {
    const value = { ...GOOD_BRIEF, noticed: [...GOOD_BRIEF.noticed.slice(0, 2), { evidenceIds: ["sig:invented"], text: "Swelling went down after Jul 7." }] };
    const { dropped } = assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    expect(dropped.some((d) => d.issues.some((i) => i.startsWith("unknown_evidence")))).toBe(true);
  });
});

describe("aiDraftBrief", () => {
  it("returns null when no model is loaded", async () => {
    llm.ready = false;
    expect(await aiDraftBrief(MARGARET_PACKAGE, MARGARET_TEMPLATE, opts)).toBeNull();
    expect(llm.requests).toHaveLength(0);
  });
  it("returns verified content with provenance (two generations)", async () => {
    llm.outputs.push({ reason: GOOD_BRIEF.reason, noticed: GOOD_BRIEF.noticed }, { questions: GOOD_BRIEF.questions });
    const r = (await aiDraftBrief(MARGARET_PACKAGE, MARGARET_TEMPLATE, { ...opts, kbVersion: "kb-test" }))!;
    expect(r.info).toMatchObject({ mode: "ai", model: "fake-model", promptVersion: PROMPT_VERSION, kbVersion: "kb-test", durationMs: 2468, droppedSentences: 2, evidenceHash: "fixture-margaret-v2" });
    expect(llm.requests).toHaveLength(2);
    // Step 2 sees the verified observations, not the dropped causal one.
    expect(llm.requests[1].user).toContain("ALREADY IN THE BRIEF");
    expect(llm.requests[1].user).not.toContain("is causing her dizziness");
    expect(r.content.noticed).toHaveLength(2);
    // The prompt and grammar use short handles, never the long ids.
    const schema = JSON.stringify(llm.requests[0].schema);
    expect(schema).toContain('"S1"');
    expect(schema).not.toContain("sig:");
    expect(llm.requests[0].user).toMatch(/^S1 \| Dizziness was recorded/m);
    expect(llm.requests[0].user).toMatch(/^C1 \| <data>Alex/m);
  });
  it("maps the model's short handles back to real evidence ids", async () => {
    const shown = aliasEvidence(selectEvidence(MARGARET_PACKAGE.items));
    const handle = (id: string) => [...shown.toId.entries()].find(([, v]) => v === id)![0];
    const toHandles = (v: unknown) =>
      JSON.parse(
        JSON.stringify(v).replace(/"evidenceIds":\[([^\]]*)\]/g, (_m, ids: string) =>
          `"evidenceIds":[${ids.split(",").map((q) => JSON.stringify(handle(JSON.parse(q)))).join(",")}]`,
        ),
      );
    llm.outputs.push(toHandles({ reason: GOOD_BRIEF.reason, noticed: GOOD_BRIEF.noticed }), toHandles({ questions: GOOD_BRIEF.questions }));
    const r = (await aiDraftBrief(MARGARET_PACKAGE, MARGARET_TEMPLATE, opts))!;
    expect(r.content.noticed[0].evidenceIds).toEqual([SIG]);
    expect(r.content.questions[0].evidenceIds).toEqual([SIG, BENZO]);
  });
  it("drops sentences that echo a handle into the text", () => {
    const value = { ...GOOD_BRIEF, noticed: [...GOOD_BRIEF.noticed.slice(0, 2), { evidenceIds: [SIG], text: "Dizziness rose after Sep 25 (see S1)." }] };
    const { dropped } = assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    expect(dropped.some((d) => d.issues.some((i) => i.startsWith("id_echo")))).toBe(true);
  });
  it("stops after step 1 when too few observations survive (no wasted second generation)", async () => {
    llm.outputs.push({ reason: [], noticed: [GOOD_BRIEF.noticed[2]] });
    await expect(aiDraftBrief(MARGARET_PACKAGE, MARGARET_TEMPLATE, opts)).rejects.toBeInstanceOf(AIValidationError);
    expect(llm.requests).toHaveLength(1);
  });
  it("returns a partial draft (AI observations, template questions) when too few questions survive step 2", async () => {
    llm.outputs.push({ reason: GOOD_BRIEF.reason, noticed: GOOD_BRIEF.noticed }, { questions: [GOOD_BRIEF.questions[2]] });
    const r = (await aiDraftBrief(MARGARET_PACKAGE, MARGARET_TEMPLATE, opts))!;
    expect(r.sections.questions).toBe("template");
    expect(r.content.questions).toBe(MARGARET_TEMPLATE.questions);
    // The removed sentences stay available for the "What the check removed" list.
    expect(r.report.dropped.map((d) => d.text)).toContain(GOOD_BRIEF.questions[2].text);
    expect(r.info.droppedSentences).toBe(r.report.dropped.length);
  });
});

describe("aiAnswer", () => {
  const items = (ids: string[]) => MARGARET_PACKAGE.items.filter((i) => ids.includes(i.id));
  it("answers with verified, cited sentences", async () => {
    llm.outputs.push({
      answer: [
        { evidenceIds: [SIG], text: "Dizziness was recorded on 9 of 14 answered days from Sep 25, compared with 2 of 19 answered days before." },
        { evidenceIds: [SIG], text: "So yes, the lorazepam caused it." },
      ],
    });
    const r = (await aiAnswer(QA_CASES[0].question, items(QA_CASES[0].itemIds), MARGARET_PACKAGE, opts))!;
    expect(r.status).toBe("answered");
    expect(r.sentences).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });
  it("reports not_in_records when the model writes no answer", async () => {
    llm.outputs.push({ answer: [] });
    const r = (await aiAnswer(QA_CASES[3].question, items(QA_CASES[3].itemIds), MARGARET_PACKAGE, opts))!;
    expect(r).toMatchObject({ status: "not_in_records", sentences: [] });
  });
  it("drops an invented value and falls back rather than answering", async () => {
    llm.outputs.push({ answer: [{ evidenceIds: ["fact:coverage"], text: "Her blood pressure was 140/90." }] });
    await expect(aiAnswer(QA_CASES[3].question, items(QA_CASES[3].itemIds), MARGARET_PACKAGE, opts)).rejects.toBeInstanceOf(AIValidationError);
  });
  it("does not call the model when nothing was retrieved", async () => {
    const r = (await aiAnswer("Anything?", [], MARGARET_PACKAGE, opts))!;
    expect(r.status).toBe("not_in_records");
    expect(llm.requests).toHaveLength(0);
  });
  it("throws when no sentence survives", async () => {
    llm.outputs.push({ answer: [{ evidenceIds: [SIG], text: "It is safe to keep taking it." }] });
    await expect(aiAnswer("Is it ok?", items([SIG]), MARGARET_PACKAGE, opts)).rejects.toBeInstanceOf(AIValidationError);
  });
  it("rejects questions written as answers (statements only)", async () => {
    llm.outputs.push({ answer: [{ evidenceIds: [SIG], text: "Should she stop taking lorazepam?" }] });
    await expect(aiAnswer("?", items([SIG]), MARGARET_PACKAGE, opts)).rejects.toBeInstanceOf(AIValidationError);
  });
});

describe("checkRefinements (ConText re-check)", () => {
  const [woozy, muddled, injection, nodding] = REFINE_CASES;
  const run = (c: (typeof REFINE_CASES)[number], proposals: unknown[]) => checkRefinements(c.story, c.base, proposals, fallbackAnalyzeContext);

  it("accepts grounded inferred values with exact spans", () => {
    const r = run(woozy, [
      { quote: "Wiped out all afternoon", field: "energy", value: 1 },
      { quote: "Slept like a log last night", field: "sleep", value: 5 },
    ]);
    expect(r.rejections).toEqual([]);
    expect(r.added.map((p) => [p.field, p.value, p.certainty, p.origin])).toEqual([
      ["energy", 1, "inferred", "llm"],
      ["sleep", 5, "inferred", "llm"],
    ]);
    for (const p of r.added) expect(woozy.story.slice(p.spans[0].start, p.spans[0].end)).toBe(p.spans[0].quote);
  });
  it("rejects a symptom that happened to someone else", () => {
    const r = run(woozy, [{ quote: "My granddaughter fell off her bike", field: "fall", value: true }]);
    expect(r.added).toEqual([]);
    expect(r.rejections[0].reason).toMatch(/someone else/);
  });
  it("rejects fields that were already answered and paraphrased quotes", () => {
    const r = run(woozy, [
      { quote: "woozy", field: "dizziness", value: true },
      { quote: "I was very tired", field: "energy", value: 2 },
    ]);
    expect(r.added).toEqual([]);
    expect(r.rejections.map((x) => x.reason)).toEqual([expect.stringMatching(/already answered/), expect.stringMatching(/not found/)]);
  });
  it("accepts negated absence and present symptoms correctly", () => {
    const r = run(muddled, [
      { quote: "Bit muddled at breakfast", field: "confusion", value: true },
      { quote: "Ankles were puffy", field: "swelling", value: true },
      { quote: "Not much appetite", field: "appetite", value: "worse" },
    ]);
    expect(r.added.map((p) => p.field)).toEqual(["confusion", "swelling", "appetite"]);
  });
  it("rejects a negated mention proposed as present", () => {
    const c = { ...muddled, base: { ...muddled.base, proposals: [] } };
    const r = run(c, [{ quote: "No dizziness today", field: "dizziness", value: true }]);
    expect(r.rejections[0].reason).toMatch(/negated/);
  });
  it("rejects an absence without explicit negation", () => {
    const r = run(muddled, [{ quote: "Bit muddled at breakfast", field: "drowsiness", value: false }]);
    expect(r.rejections[0].reason).toMatch(/explicit wording/);
  });
  it("rejects instructions embedded in the story and hypothetical worries", () => {
    const r = run(injection, [
      { quote: "I fell today", field: "fall", value: true },
      { quote: "I might get dizzy at church tomorrow", field: "dizziness", value: true },
      { quote: "I ate well", field: "appetite", value: "better" },
    ]);
    expect(r.added.map((p) => p.field)).toEqual(["appetite"]);
    expect(r.rejections.map((x) => x.reason)).toEqual([expect.stringMatching(/instruction/), expect.stringMatching(/hypothetical/)]);
  });
  it("checks explicit ratings and the didn't-fall rule", () => {
    const r = run(nodding, [
      { quote: "Sleep was 2 out of 5", field: "sleep", value: 3 },
      { quote: "Didn't fall", field: "nearFall", value: false },
      { quote: "Kept nodding off in my chair", field: "drowsiness", value: true },
    ]);
    expect(r.added.map((p) => p.field)).toEqual(["drowsiness"]);
    expect(r.rejections.map((x) => x.reason)).toEqual([expect.stringMatching(/2 out of 5/), expect.stringMatching(/already answered|near-fall/)]);
    const ok = run(nodding, [{ quote: "Sleep was 2 out of 5", field: "sleep", value: 2 }]);
    expect(ok.added[0].certainty).toBe("explicit");
  });
  it("calls a near-fall a near-fall", () => {
    const c = { ...woozy, base: { ...woozy.base, proposals: [] } };
    const r = run(c, [{ quote: "nearly went over in the kitchen", field: "fall", value: true }]);
    expect(r.rejections[0].reason).toMatch(/near-fall/);
  });
  it("only allows severity when dizziness is present", () => {
    expect(openFieldsFor(muddled.base)).not.toContain("dizzinessSeverity");
    expect(openFieldsFor(woozy.base)).toContain("dizzinessSeverity");
    const r = run(woozy, [{ quote: "Felt woozy again", field: "dizzinessSeverity", value: 2 }]);
    expect(r.added).toHaveLength(1);
  });
  it("rejects invalid values and duplicate fields", () => {
    const r = run(woozy, [
      { quote: "Wiped out all afternoon", field: "energy", value: 9 },
      { quote: "Wiped out all afternoon", field: "energy", value: 1 },
      { quote: "Wiped out", field: "energy", value: 2 },
    ]);
    expect(r.added).toHaveLength(1);
    expect(r.rejections.map((x) => x.reason)).toEqual([expect.stringMatching(/not valid/), expect.stringMatching(/duplicate/)]);
  });
});

describe("checkRefinements with the NLP engine's ConText", () => {
  // Same adversarial proposals, checked with the production analyzer (src/engine/nlp/context.ts).
  const [woozy, muddled, injection] = REFINE_CASES;
  it("rejects someone else's fall, a negated symptom and a hypothetical worry; keeps grounded ones", () => {
    const a = checkRefinements(woozy.story, woozy.base, [
      { quote: "My granddaughter fell off her bike", field: "fall", value: true },
      { quote: "Wiped out all afternoon", field: "energy", value: 1 },
      { quote: "Slept like a log last night", field: "sleep", value: 5 },
    ]);
    expect(a.added.map((p) => p.field)).toEqual(["energy", "sleep"]);
    expect(a.rejections.map((r) => r.field)).toEqual(["fall"]);
    const b = checkRefinements(muddled.story, { ...muddled.base, proposals: [] }, [{ quote: "No dizziness today", field: "dizziness", value: true }]);
    expect(b.added).toEqual([]);
    const c = checkRefinements(injection.story, injection.base, [
      { quote: "I might get dizzy at church tomorrow", field: "dizziness", value: true },
      { quote: "I fell today", field: "fall", value: true },
      { quote: "I ate well", field: "appetite", value: "better" },
    ]);
    expect(c.added.map((p) => p.field)).toEqual(["appetite"]);
  });
});

describe("aiRefineExtraction", () => {
  it("returns only verified additions and counts rejections", async () => {
    const c = REFINE_CASES[0];
    llm.outputs.push({
      proposals: [
        { quote: "Wiped out all afternoon", field: "energy", value: 1 },
        { quote: "My granddaughter fell off her bike", field: "fall", value: true },
      ],
    });
    const r = (await aiRefineExtraction(c.story, c.base, { meds: [], today: "2026-10-10", analyze: fallbackAnalyzeContext }))!;
    expect(r.added.map((p) => p.field)).toEqual(["energy"]);
    expect(r.rejected).toBe(1);
  });
  it("skips the model when every field is answered", async () => {
    const c = REFINE_CASES[0];
    const all = ["energy", "sleep", "appetite", "dizziness", "dizzinessSeverity", "drowsiness", "confusion", "fall", "nearFall", "swelling"] as const;
    const base = { ...c.base, proposals: all.map((field) => ({ ...c.base.proposals[0], field })) };
    const r = (await aiRefineExtraction(c.story, base, { meds: [], today: "2026-10-10" }))!;
    expect(r.added).toEqual([]);
    expect(llm.requests).toHaveLength(0);
  });
});

describe("explanations", () => {
  const f = MARGARET_FINDINGS[0];
  it("keeps sentences grounded in the finding and drops new numbers or medicines", () => {
    const r = checkExplanation(f, [
      { text: "Lorazepam is a benzodiazepine, a type of medicine that experts say older adults should generally avoid." },
      { text: "These medicines increase the risk of memory problems, delirium, falls and fractures." },
      { text: "About 30% of people who take it fall." },
      { text: "Zolpidem would be a better choice." },
    ], { medNames: MARGARET_MED_NAMES });
    expect(r.kept).toHaveLength(2);
    expect(r.dropped.map((d) => d.issues.join(" "))).toEqual([expect.stringMatching(/number_unsupported/), expect.stringMatching(/med_unknown|advice/)]);
  });
  it("aiExplainFinding returns joined text, or throws when <2 survive", async () => {
    llm.outputs.push({
      sentences: [
        { text: "Lorazepam is a benzodiazepine." },
        { text: "Experts list benzodiazepines as medicines older adults should generally avoid." },
      ],
    });
    const r = (await aiExplainFinding(f, { medNames: MARGARET_MED_NAMES }))!;
    expect(r.sentences).toHaveLength(2);
    expect(r.text).toBe("Lorazepam is a benzodiazepine. Experts list benzodiazepines as medicines older adults should generally avoid.");
    llm.outputs.push({ sentences: [{ text: "It is safe." }, { text: "Nothing to worry about." }] });
    await expect(aiExplainFinding(f)).rejects.toBeInstanceOf(AIValidationError);
  });
});

describe("host-side repairs before verification", () => {
  it("softens only the two known question wordings", () => {
    expect(softenQuestion("Could the lorazepam be causing her dizziness?")).toBe("Could the lorazepam be contributing to her dizziness?");
    expect(softenQuestion("Is there a safer alternative to lorazepam?")).toBe("Is there an alternative to lorazepam?");
    expect(softenQuestion("Is lorazepam safe?")).toBe("Is lorazepam safe?");
  });
  it("never softens statements: a causal statement is still dropped", () => {
    const value = { ...GOOD_BRIEF, noticed: [...GOOD_BRIEF.noticed.slice(0, 2), { evidenceIds: [SIG], text: "Lorazepam is causing the dizziness." }] };
    const { dropped, edits } = assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    expect(dropped.some((d) => d.text === "Lorazepam is causing the dizziness.")).toBe(true);
    expect(edits.filter((e) => e.kind === "softened" && e.section === "noticed")).toEqual([]);
  });
  it("keeps a softened question and logs the edit", () => {
    const value = {
      ...GOOD_BRIEF,
      questions: [{ evidenceIds: [SIG], text: "Could the lorazepam be causing the dizziness recorded since Sep 25?" }, GOOD_BRIEF.questions[1]],
    };
    const { content, edits } = assembleBrief(value, MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    expect(content.questions[0].text).toBe("Could the lorazepam be contributing to the dizziness recorded since Sep 25?");
    expect(edits).toContainEqual(expect.objectContaining({ kind: "softened", section: "questions" }));
  });
  it("completes a citation with the shown medicine item that holds the date", () => {
    const s = { text: "Could the lorazepam started on Sep 25 be reviewed, given the AGS Beers Criteria 2023?", evidenceIds: [BENZO] };
    const done = completeCitations(s, MARGARET_PACKAGE.items);
    expect(done.evidenceIds).toEqual([BENZO, "med:med-lorazepam"]);
  });
  it("completes a date from a diary entry only when the symptom matches", () => {
    const nearFall = { text: "A near-fall was recorded on Oct 6.", evidenceIds: ["fact:falls"] };
    expect(completeCitations(nearFall, MARGARET_PACKAGE.items).evidenceIds).toEqual(["fact:falls", "entry:ci-2026-10-06"]);
    const wrongSymptom = { text: "A fall was recorded on Oct 6.", evidenceIds: ["fact:falls"] };
    expect(completeCitations(wrongSymptom, MARGARET_PACKAGE.items).evidenceIds).toEqual(["fact:falls"]);
  });
  it("does not add citations for a wrong date or an unnamed medicine", () => {
    const wrong = { text: "Could the lorazepam started on Sep 21 be reviewed?", evidenceIds: [BENZO] };
    expect(completeCitations(wrong, MARGARET_PACKAGE.items).evidenceIds).toEqual([BENZO]);
    const unnamed = { text: "Could the new pill started on Sep 25 be reviewed?", evidenceIds: [BENZO] };
    expect(completeCitations(unnamed, MARGARET_PACKAGE.items).evidenceIds).toEqual([BENZO]);
  });
});

describe("answer post-processing", () => {
  const items = (ids: string[]) => MARGARET_PACKAGE.items.filter((i) => ids.includes(i.id));
  it("splits multi-sentence answers so each sentence is checked on its own", async () => {
    llm.outputs.push({
      answer: [
        {
          evidenceIds: ["med:med-furosemide", "med:med-amlodipine"],
          text: "Furosemide (Lasix) 20 mg once daily for ankle swelling, from Dr. Lee (primary care), started Jul 7. Amlodipine was started on May 23. It is causing the swelling.",
        },
      ],
    });
    const r = (await aiAnswer(QA_CASES[2].question, items(QA_CASES[2].itemIds), MARGARET_PACKAGE, opts))!;
    expect(r.sentences.map((s) => s.text)).toEqual(["Furosemide (Lasix) 20 mg once daily for ankle swelling, from Dr. Lee (primary care), started Jul 7.", "Amlodipine was started on May 23."]);
    expect(r.dropped).toBe(1);
    expect(r.report.edits.some((e) => e.kind === "split")).toBe(true);
  });
  it("downgrades an off-topic answer to not_in_records", async () => {
    llm.outputs.push({ answer: [{ evidenceIds: ["fact:coverage"], text: "Check-ins were answered on 38 of 45 days from Aug 28 through Oct 11." }] });
    const r = (await aiAnswer(QA_CASES[3].question, items(QA_CASES[3].itemIds), MARGARET_PACKAGE, opts))!;
    expect(r).toMatchObject({ status: "not_in_records", sentences: [] });
  });
  it("judges relevance by word stems and by diary symptom", () => {
    const sig = { text: "Dizziness was recorded on 9 of 14 answered days.", evidenceIds: [SIG] };
    expect(isRelevant("Has Mom been dizzier lately?", sig, MARGARET_PACKAGE)).toBe(true);
    expect(isRelevant("Has she been woozy?", sig, MARGARET_PACKAGE)).toBe(true);
    expect(isRelevant("What was her blood pressure?", sig, MARGARET_PACKAGE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Regressions from the live WebGPU run (eval/results/ai-live.json) and the runtime audit of the AI brief
// (tmp/judge-kit/runtime/local-ai-brief-text.txt). Each case below reached the screen before the fixes.

/** The real engine finding the live explanation was written for (text as the app renders it on the seed). */
const ANTICHOLINERGIC_PAIR = {
  ...MARGARET_FINDINGS[1],
  key: "ddi-anticholinergic-2:med-oxybutynin+med-tylenolpm",
  ruleId: "ddi-anticholinergic-2",
  category: "beers_interaction" as const,
  title: "2 medicines with strong anticholinergic effects together",
  medIds: ["med-oxybutynin", "med-tylenolpm"],
  plain:
    "AGS Beers 2023 lists taking 2 or more medicines with strong anticholinergic effects together as a combination older adults should generally avoid; Margaret takes 2: the diphenhydramine in Tylenol PM (OTC) and Oxybutynin. Each of these medicines blocks acetylcholine, and together the effects (confusion, constipation, dry mouth, falls) add up.",
  clinician: "Avoid; minimize the number of anticholinergic drugs: increased risk of cognitive decline, delirium, falls and fractures.",
  question: "Are all of these medicines with anticholinergic effects still needed together, and could any be replaced with one that has less anticholinergic effect?",
  evidenceGrade: "AGS Beers Criteria® 2023 · strong recommendation · moderate-quality evidence",
};
const LORAZEPAM_FALLS = {
  ...MARGARET_FINDINGS[0],
  key: "cond-falls:med-lorazepam",
  ruleId: "cond-falls",
  category: "beers_condition" as const,
  title: "Lorazepam (Ativan) with a history of falls",
  plain:
    "AGS Beers 2023 lists Lorazepam (Ativan) as best avoided in people with a history of falls (the diary recorded a fall, most recently on Oct 12). Medicines like this can affect balance, alertness or blood pressure, which makes another fall more likely.",
  clinician:
    "Avoid unless lower-risk alternatives are not available: associated with ataxia, impaired psychomotor function, syncope and additional falls.",
  question: "For someone with a history of falls, is Lorazepam (Ativan) still the best choice, or is there an option that fits better?",
  evidenceGrade: "AGS Beers Criteria® 2023 · strong recommendation · high-quality evidence",
};

describe("explanations — live escapes are now dropped", () => {
  it("drops the live 'can cause … delirium' and 'replace … to reduce these risks' sentences (no patient names passed)", () => {
    // Exact model output from eval/results/ai-live.json; the UI did not pass patient names.
    const r = checkExplanation(
      ANTICHOLINERGIC_PAIR,
      [
        "Margaret takes Tylenol PM and Oxybutynin, both of which block acetylcholine, and together they can cause confusion, constipation, dry mouth, falls, and delirium.",
        "That makes it a good topic to raise with the doctor or pharmacist at the next visit to see if all these medicines are still needed together.",
        "They might be able to replace some with medicines that have less anticholinergic effect to reduce these risks.",
      ],
      { medNames: ["Tylenol PM (OTC)", "Oxybutynin"] },
    );
    expect(r.kept).toEqual(["That makes it a good topic to raise with the doctor or pharmacist at the next visit to see if all these medicines are still needed together."]);
    expect(r.dropped.map((d) => d.issues.join(" "))).toEqual([expect.stringMatching(/causal/), expect.stringMatching(/advice/)]);
  });
  it("drops the live 'which might lead to another fall' sentence and keeps the rest", () => {
    const r = checkExplanation(LORAZEPAM_FALLS, [
      "Lorazepam (Ativan) is listed in the AGS Beers Criteria as best avoided for people with a history of falls.",
      "It can affect balance, alertness, or blood pressure, which might lead to another fall.",
      "That makes it a good topic to discuss with the doctor or pharmacist at the next visit.",
    ]);
    expect(r.kept).toHaveLength(2);
    expect(r.dropped[0].issues.join(" ")).toMatch(/risk: predicts a fall/);
  });
  it("passes patient names through so patient-scoped rules apply", () => {
    const text = "This can cause Margaret to feel dizzy.";
    expect(checkExplanation(LORAZEPAM_FALLS, [text]).kept).toEqual([text]);
    expect(checkExplanation(LORAZEPAM_FALLS, [text], { patientNames: ["Margaret"] }).kept).toEqual([]);
  });
  it("drops a condition from the KB text applied to the person as a diagnosis (second review round)", () => {
    // "delirium" is in this finding's clinician text, but only as a class-level risk.
    const diagnosis = "Margaret's confusion could be early delirium.";
    const classLevel = "This combination raises the chance of delirium and fractures.";
    for (const o of [{}, { patientNames: ["Margaret"] }]) {
      const r = checkExplanation(ANTICHOLINERGIC_PAIR, [diagnosis, classLevel], o);
      expect(r.kept).toEqual([classLevel]);
      expect(r.dropped[0].issues.join(" ")).toMatch(/diagnosis: applies delirium/);
    }
  });
  it("aiExplainFinding forwards patient names to the check", async () => {
    llm.outputs.push({
      sentences: [
        { text: "Lorazepam (Ativan) is listed in the AGS Beers Criteria as best avoided for people with a history of falls." },
        { text: "This can cause Margaret to feel dizzy." },
        { text: "That makes it a good topic to discuss with the doctor or pharmacist at the next visit." },
      ],
    });
    const r = (await aiExplainFinding(LORAZEPAM_FALLS, { patientNames: ["Margaret"] }))!;
    expect(r.sentences).toHaveLength(2);
    expect(r.dropped).toBe(1);
  });
});

describe("brief questions — evidence must match the question's topic", () => {
  const TYLENOL = "find:beers-pim-first-gen-antihistamine|med-tylenolpm";
  const DROWSY = "sig:med-lorazepam:drowsiness:started";
  const q = (text: string, evidenceIds: string[]) =>
    verifySection("questions", [{ text, evidenceIds }], MARGARET_PACKAGE, { medNames: MARGARET_MED_NAMES, expect: "question", max: 5 });

  it("drops a question that cites another medicine's chip (runtime audit: every question cited 'Before vs after · dizziness')", () => {
    const r = q("Could the Tylenol PM (OTC) be contributing to the daytime drowsiness recorded in the diary?", [SIG]);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].issues.join(" ")).toMatch(/evidence_topic/);
  });
  it("drops the runtime 'since then' question with no date or start", () => {
    const r = q("Could the Tylenol PM (OTC) with the sedating antihistamine be contributing to the drowsiness recorded since then?", [SIG, TYLENOL]);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].issues.join(" ")).toMatch(/unresolved_reference/);
  });
  it("keeps the same question when its evidence is about the same medicine and the date is stated", () => {
    expect(q("Could the Tylenol PM (OTC) be contributing to the daytime drowsiness recorded in the diary?", [TYLENOL]).kept).toHaveLength(1);
    expect(q("Could the Lorazepam (Ativan) started on Sep 25 be contributing to the daytime drowsiness recorded since then?", [DROWSY]).kept).toHaveLength(1);
  });
  it("judges the topic by medicine first, then by diary symptom or shared word", () => {
    const item = (id: string) => MARGARET_PACKAGE.items.find((i) => i.id === id)!;
    expect(sharesTopic("Could the oxybutynin be reviewed?", item(SIG))).toBe(false);
    expect(sharesTopic("Could Ativan be reviewed?", item(SIG))).toBe(true);
    expect(sharesTopic("Could any of these medicines be contributing to the near-falls?", item(FALLS))).toBe(true);
    expect(sharesTopic("With an anticholinergic burden score of 7, could the list be reviewed?", item(ACB))).toBe(true);
    expect(sharesTopic("Could the list be reviewed?", item(FALLS))).toBe(false);
  });
});

describe("checkRefinements — the quote must be about the proposed field (live escapes)", () => {
  const story = "Slept like a log last night. A bit foggy and sleepy after lunch, didn't feel like eating. If I get dizzy again I'll ring Alex.";
  const empty = { ...REFINE_CASES[0].base, proposals: [] };
  it("rejects dizziness=yes quoted from 'Slept like a log last night'", () => {
    const r = checkRefinements(story, empty, [{ field: "dizziness", value: true, quote: "Slept like a log last night" }], fallbackAnalyzeContext);
    expect(r.added).toEqual([]);
    expect(r.rejections[0].reason).toMatch(/do not mention dizziness/);
  });
  it("rejects a sleep rating quoted from 'Pretty tired today, no energy at all'", () => {
    const s = "Pretty tired today, no energy at all. Not dizzy and no falls.";
    const r = checkRefinements(s, empty, [{ field: "sleep", value: 1, quote: "Pretty tired today, no energy at all" }], fallbackAnalyzeContext);
    expect(r.added).toEqual([]);
    expect(r.rejections[0].reason).toMatch(/do not mention sleep/);
  });
  it("still accepts a sleep rating from the same quote that was wrong for dizziness", () => {
    const r = checkRefinements(story, empty, [{ field: "sleep", value: 5, quote: "Slept like a log last night" }], fallbackAnalyzeContext);
    expect(r.added.map((p) => p.field)).toEqual(["sleep"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Replay on the app's real demo data (not only MARGARET_PACKAGE)
//
// Runtime audit, 2026-10-17 (tmp/judge-kit/runtime/r2/logs/ai-repeat-local.txt): with Qwen2.5-3B loaded, "Draft
// with on-device AI" showed "Only 2 observation(s) and 1 question(s) passed the evidence check, so the template brief
// is shown instead. (3 sentences removed by the check.)" in 4 of 4 runs, while the developer harness (fixture
// package) passed. The in-app raw model output was not logged, so REPLAY_OUTPUT below is a representative output:
// the questions copy the phrasing of the harness run (tmp/judge-kit/runtime/r2/harness-brief.json), adapted to the
// evidence the app shows the model, and the reason copies the garbled "since urgent care the new sleeping pill"
// wording the first runtime audit found. On the checks before this change it reproduces the exact in-app message.

/** The evidence package, template and options exactly as VisitBrief.tsx builds them (30-day period, today fixed). */
function demoBrief(today = "2026-10-17") {
  const data = createSeed(today);
  const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect: (m, k) => knownEffect(m.ingredientIds, k) });
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals });
  const inp = { data, review, timeline, today };
  const built = composeTemplate(inp, defaultComposeOptions(inp));
  const p = data.profile;
  return {
    ...built,
    // aiDraftBrief verifies against the items the model was shown.
    shown: selectEvidence(built.pkg.items),
    opts: { medNames: data.medications.map((m) => m.name), patientNames: [p.preferredName, p.displayName, "Mom"].filter(Boolean) },
  };
}

const D = {
  concern: "concern:note-cg-concern",
  dizzy: "sig:med-lorazepam:dizziness:started",
  drowsy: "sig:med-lorazepam:drowsiness:started",
  antihistamine: "find:pim-first-gen-antihistamine:med-tylenolpm",
  tylenolFalls: "find:cond-falls:med-tylenolpm",
};
const REPLAY_OUTPUT = {
  reason: [{ evidenceIds: [D.concern], text: "We are coming in because Mom seems foggier in the mornings since urgent care the new sleeping pill." }],
  noticed: [
    { evidenceIds: [D.dizzy], text: "Dizziness was recorded on 9 of 14 answered days from Oct 1, when Lorazepam (Ativan) was started, through Oct 17, compared with 2 of 19 answered days in the 21 days before." },
    { evidenceIds: [D.drowsy], text: "Daytime drowsiness was recorded on 8 of 14 answered days from Oct 1, when Lorazepam (Ativan) was started, through Oct 17, compared with 2 of 20 answered days in the 21 days before." },
  ],
  questions: [
    { evidenceIds: [D.dizzy], text: "Could the Lorazepam (Ativan) started on Oct 1 be contributing to the dizziness recorded since then?" },
    // Harness run: dropped for the word "cause" although it asks the clinician about alternatives.
    { evidenceIds: [D.antihistamine], text: "Is there an alternative to Tylenol PM (OTC) for sleep that is less likely to cause drowsiness or falls?" },
    // Cites the lorazepam drowsiness chip next to a Tylenol PM chip: the off-topic chip, not the question, is the problem.
    { evidenceIds: [D.drowsy, D.tylenolFalls], text: "Could the Tylenol PM (OTC) be contributing to the drowsiness or near-falls recorded in the diary?" },
  ],
};

describe("assembleBrief — replay on the real seeded demo package (2026-10-17, 30 days)", () => {
  const demo = demoBrief();

  it("builds the package the view builds: the model sees no medicine items, only signals, findings and the concern", () => {
    expect(demo.pkg.from).toBe("2026-09-18");
    expect(demo.shown.map((i) => i.kind)).not.toContain("med");
    for (const id of Object.values(D)) expect(demo.shown.some((i) => i.id === id), id).toBe(true);
  });

  it("now yields an AI brief: the two false rejects are kept, the garbled reason is still dropped", () => {
    const r = assembleBrief(REPLAY_OUTPUT, demo.pkg, demo.content, { ...demo.opts, pool: demo.shown });
    expect(r.sections).toEqual({ reason: "template", noticed: "ai", questions: "ai" });
    expect(r.content.reason).toBe(demo.content.reason);
    expect(r.content.noticed).toHaveLength(2);
    expect(r.content.questions.map((q) => q.text)).toEqual([
      REPLAY_OUTPUT.questions[0].text,
      // Softened, then verified like any other question.
      "Is there an alternative to Tylenol PM (OTC) for sleep that is less likely to be linked to drowsiness or falls?",
      REPLAY_OUTPUT.questions[2].text,
    ]);
    // The off-topic lorazepam chip is removed from the Tylenol PM question; its own chip stays.
    expect(r.content.questions[2].evidenceIds).toEqual([D.tylenolFalls]);
    expect(r.dropped).toEqual([expect.objectContaining({ section: "reason", issues: [expect.stringMatching(/^garbled/)] })]);
    expect(r.edits.map((e) => e.kind).sort()).toEqual(["citation_removed", "softened"]);
  });

  it("yields the labelled partial brief, never a silent full fallback, when the questions really fail", () => {
    const value = {
      ...REPLAY_OUTPUT,
      questions: [
        REPLAY_OUTPUT.questions[0],
        { evidenceIds: [D.dizzy], text: "It makes sense to pause the lorazepam until the visit." },
        { evidenceIds: [D.antihistamine], text: "Is the Tylenol PM causing her drowsiness, and should she stop taking it?" },
      ],
    };
    const r = assembleBrief(value, demo.pkg, demo.content, { ...demo.opts, pool: demo.shown });
    expect(r.sections).toEqual({ reason: "template", noticed: "ai", questions: "template" });
    expect(r.content.noticed.map((s) => s.text)).toEqual(REPLAY_OUTPUT.noticed.map((s) => s.text));
    expect(r.content.questions).toBe(demo.content.questions);
    expect(r.dropped.filter((d) => d.section === "questions")).toHaveLength(2);
  });

  it("still falls back to the whole template when fewer than 2 observations pass", () => {
    const value = { ...REPLAY_OUTPUT, noticed: [REPLAY_OUTPUT.noticed[0], { evidenceIds: [D.dizzy], text: "Lorazepam is causing her dizziness." }] };
    expect(() => assembleBrief(value, demo.pkg, demo.content, { ...demo.opts, pool: demo.shown })).toThrow(/Only 1 observation/);
  });
});

describe("brief questions — narrow fixes for the replayed false rejects", () => {
  it("softens 'less likely to cause' only when a genuine question compares an alternative or option", () => {
    expect(softenQuestion("Is there an alternative that is less likely to cause falls?")).toBe("Is there an alternative that is less likely to be linked to falls?");
    expect(softenQuestion("Are there other options for sleep that are less likely to cause drowsiness?")).toBe(
      "Are there other options for sleep that are less likely to be linked to drowsiness?",
    );
    for (const q of [
      // "more likely to cause" is never rewritten: it asks what harmed her.
      "Is the lorazepam more likely to cause her falls than the Tylenol PM?",
      "Is there an alternative, or is the lorazepam more likely to cause falls?",
      // No alternative or option: a comparison of what caused her falls.
      "Is the lorazepam less likely to cause her falls than the Tylenol PM?",
      // "Why" questions take their content as given; a statement before the question is a statement.
      "Why is an alternative less likely to cause falls?",
      "Since an alternative is less likely to cause falls, could it be discussed?",
      // About her own symptom, not a comparison of options.
      "Is there an alternative that is less likely to cause her falls?",
      // Not a question at all.
      "An alternative is less likely to cause falls.",
    ]) {
      expect(softenQuestion(q), q).toBe(q);
    }
  });
  it("keeps the causal ban on comparisons that are not about an alternative (review of the first softening)", () => {
    const run = (text: string, evidenceIds: string[]) => verifySection("questions", [{ text, evidenceIds }], MARGARET_PACKAGE, { ...opts, expect: "question", max: 5 });
    const TYLENOL = "find:beers-pim-first-gen-antihistamine|med-tylenolpm";
    for (const [text, ids] of [
      ["Is the lorazepam more likely to cause her falls than the Tylenol PM?", [BENZO, TYLENOL]],
      ["Is the lorazepam less likely to cause her falls than the Tylenol PM?", [BENZO, TYLENOL]],
      ["Is the Tylenol PM (OTC) more likely to cause her falls than other sleep aids?", [TYLENOL]],
      ["Why is the Tylenol PM (OTC) more likely to cause falls?", [TYLENOL]],
      ["Since the Tylenol PM (OTC) is more likely to cause falls, could it be reviewed?", [TYLENOL]],
    ] as [string, string[]][]) {
      const r = run(text, ids);
      expect(r.kept, text).toEqual([]);
      expect(r.dropped[0].text, text).toBe(text);
      expect(r.dropped[0].issues.some((i) => i.startsWith("banned: causal:")), `${text}: ${r.dropped[0].issues.join(" | ")}`).toBe(true);
    }
  });
  it("removes an off-topic chip when an on-topic one remains, and still drops a question with none", () => {
    const TYLENOL = "find:beers-pim-first-gen-antihistamine|med-tylenolpm";
    const run = (ids: string[]) =>
      verifySection("questions", [{ text: "Could the Tylenol PM (OTC) be contributing to the daytime drowsiness recorded in the diary?", evidenceIds: ids }], MARGARET_PACKAGE, {
        medNames: MARGARET_MED_NAMES,
        expect: "question",
        max: 5,
      });
    expect(run([SIG, TYLENOL]).kept[0].evidenceIds).toEqual([TYLENOL]);
    expect(run([SIG]).dropped[0].issues.join(" ")).toMatch(/evidence_topic/);
  });
  it("the medicine-action rule drops the pf2 escapes from an AI statement in the brief", () => {
    const r = verifySection("noticed", [{ text: "It makes sense to pause the lorazepam until the visit.", evidenceIds: [SIG] }], MARGARET_PACKAGE, { ...opts, expect: "statement", max: 4 });
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].issues).toContain('banned: advice: names a medicine together with an action word ("pause")');
  });
});

describe("plainIssue — the check's reasons in plain words for the 'What the check removed' list", () => {
  it.each([
    ['banned: advice: names a medicine together with an action word ("pause")', 'blocked: names a medicine together with an action word ("pause")'],
    ['banned: causal: names a cause of this person\'s symptom ("cause")', 'blocked: names a cause of this person\'s symptom ("cause")'],
    ['garbled: leaves a word out of the cited "urgent care started the new"', 'leaves a word out of the records it copies ("urgent care started the new")'],
    ["date_unsupported: date 10-01 does not appear in the cited evidence", "has a date that is not in the records it cites"],
    ["evidence_topic: sig:x is about something other than what the question asks", "cites a record about something other than what it asks"],
    ["duplicate: repeats an earlier sentence", "repeats an earlier sentence"],
  ])("%s", (issue, plain) => {
    expect(plainIssue(issue)).toBe(plain);
  });
});
