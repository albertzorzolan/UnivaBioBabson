import { describe, expect, it } from "vitest";
import type { EvidencePackage, MetricKey, StoreData } from "../../model/types";
import { addDays } from "../../model/dates";
import { buildEvidence } from "./evidence";
import { EMERGENCY_REDIRECT, NOT_FOUND_TEXT, parseQuestion, parseRange, redirectText, retrieveForQuestion, routeQuestion } from "./qa";
import type { QaResult } from "./qa";
import { SUGGESTED_QUESTIONS } from "./index";
import { verifySentence } from "./verify";
import { BANNED_IN_TEMPLATE, FAKE_KB, FROM, TODAY, isKnownEffect, margaret } from "./test-fixtures";

const W = margaret();
const PKG = buildEvidence({ data: W.data, from: FROM, to: TODAY, review: W.review, timeline: W.timeline, kb: FAKE_KB });
const effect = (ids: string[], m: MetricKey) => isKnownEffect({ ingredientIds: ids } as never, m);

function ask(q: string, opts: { data?: StoreData; pkg?: EvidencePackage; withReview?: boolean } = {}): QaResult {
  return retrieveForQuestion(q, {
    data: opts.data ?? W.data,
    pkg: opts.pkg ?? PKG,
    today: TODAY,
    review: opts.withReview === false ? undefined : W.review,
    kb: FAKE_KB,
    isKnownEffect: effect,
  });
}

const text = (r: QaResult) => r.deterministicAnswer.map((s) => s.text).join(" ");

/** Every answer must cite ids that exist and pass the same verifier as AI text. */
function expectGrounded(r: QaResult) {
  const known = new Set([...PKG.items.map((i) => i.id), ...r.items.map((i) => i.id)]);
  const merged: EvidencePackage = { ...PKG, items: [...PKG.items, ...r.items.filter((i) => !PKG.items.some((p) => p.id === i.id))] };
  expect(r.deterministicAnswer.length).toBeLessThanOrEqual(4);
  expect(r.dropped).toBe(0);
  for (const s of r.deterministicAnswer) {
    expect(s.evidenceIds.length).toBeGreaterThan(0);
    for (const id of s.evidenceIds) expect(known.has(id), id).toBe(true);
    const v = verifySentence(s, merged, { medNames: W.data.medications.map((m) => m.name), patientNames: ["Margaret"] });
    expect(v.issues, s.text).toEqual([]);
    expect(s.text.length).toBeLessThanOrEqual(280);
    for (const re of BANNED_IN_TEMPLATE) expect(re.test(s.text), `${re} in ${s.text}`).toBe(false);
  }
}

// ---------------------------------------------------------------------------

describe("routeQuestion — out of scope gets the fixed, kind redirect", () => {
  const OUT: [string, string][] = [
    ["Should she stop taking lorazepam?", "treatment"],
    ["Can I stop her lorazepam?", "treatment"],
    ["Should Mom take less Tylenol PM?", "treatment"],
    ["Can she take ibuprofen with her other pills?", "treatment"],
    ["Should we switch her to melatonin instead?", "treatment"],
    ["Is there an alternative to lorazepam?", "treatment"],
    ["Does she still need furosemide?", "treatment"],
    ["Should she keep taking omeprazole?", "treatment"],
    ["What should I do about the dizziness?", "treatment"],
    ["What dose of lorazepam should she take?", "dose"],
    ["Should we lower the dose?", "dose"],
    ["Can I give her an extra dose tonight?", "dose"],
    ["Is it ok to cut her pills in half?", "safety"],
    ["Is it safe to give her Tylenol PM with lorazepam?", "safety"],
    ["Is lorazepam dangerous for her?", "safety"],
    ["Does she have dementia?", "diagnosis"],
    ["Is this Alzheimer's?", "diagnosis"],
    ["Could she have Parkinson's?", "diagnosis"],
    ["What's wrong with Mom?", "diagnosis"],
    ["Can you diagnose her symptoms?", "diagnosis"],
    ["Is lorazepam causing her dizziness?", "cause"],
    ["Why is she so dizzy?", "cause"],
    ["Is the dizziness a side effect of the lorazepam?", "cause"],
    ["What caused her fall?", "cause"],
    ["Is it serious?", "urgency"],
    ["Should I call her doctor?", "urgency"],
    ["How worried should I be?", "urgency"],
    ["Is her dizziness normal for her age?", "urgency"],
    ["Will she fall again?", "prediction"],
    ["What are the chances she breaks a hip?", "prediction"],
    // Review regressions: causal questions in everyday words.
    ["Did lorazepam cause her dizziness?", "cause"],
    ["Did the new pill cause the falls?", "cause"],
    ["did the lorazepam make her dizzy", "cause"],
    ["is the ativan why she's falling", "cause"],
    ["could the new pill be behind her falls", "cause"],
    ["is it the lorazepam?", "cause"],
    ["could it be the lorazepam", "cause"],
    ["which medicine is responsible for the dizziness", "cause"],
    ["is lorazepam the reason she fell?", "cause"],
    ["how many days was she dizzy? also is it the lorazepam", "cause"],
    // Treatment, dose, safety and prediction questions dressed up as data questions.
    ["what's a better sleeping pill for her", "safety"],
    ["would melatonin be better than tylenol pm", "safety"],
    ["is lorazepam better than tylenol pm for sleep", "safety"],
    ["Lorazepam or Tylenol PM — which one is worse for her?", "safety"],
    ["Can she drink wine with lorazepam?", "safety"],
    ["is she overmedicated?", "safety"],
    ["is 0.5 mg of lorazepam too much for her age", "dose"],
    ["Is she on too many meds?", "dose"],
    ["Which medicine should go first?", "treatment"],
    ["list the dates she was dizzy and tell me if I should take her off lorazepam", "treatment"],
    ["which of her meds can I cut out", "treatment"],
    ["her doctor said to taper — how fast?", "treatment"],
    ["what would you do if you were me", "treatment"],
    ["what happens if she keeps falling", "prediction"],
  ];
  it.each(OUT)("%s → %s", (q, category) => {
    const r = routeQuestion(q, { patientName: "Margaret" });
    expect(r.inScope).toBe(false);
    if (r.inScope) return;
    expect(r.category).toBe(category);
    expect(r.redirect).toBe(
      "That's a question for Margaret's doctor or pharmacist. Want to add it to your visit questions?",
    );
    expect(r.offerVisitQuestion).toBe(true);
  });

  it.each([
    "She fell and hit her head",
    "Mom is not breathing properly",
    "She has chest pain",
    "I think she took too many pills",
    "She won't wake up",
    "Is this an emergency?",
    // Review regressions: everyday emergency phrasings.
    "I think she had a stroke",
    "Could she have had a stroke?",
    "she just collapsed",
    "her lips are blue",
    "she's slurring her words",
    "mom is not making sense and her face looks droopy",
    "she took two lorazepam by mistake",
    "Margaret took her whole week of pills at once",
    "she fell and can't move her leg",
    "she fell again just now",
    "she's really confused right now and doesn't know where she is",
    "she can't stop shaking",
    "Mom is very confused and agitated tonight, what do I do",
  ])("emergency words get the 911 line: %s", (q) => {
    const r = routeQuestion(q);
    expect(r.inScope).toBe(false);
    if (r.inScope) return;
    expect(r.category).toBe("emergency");
    expect(r.redirect).toBe(EMERGENCY_REDIRECT);
    expect(r.redirect).toContain("call 911");
    expect(r.offerVisitQuestion).toBe(false);
  });

  it("uses 'her' when no name is given", () => {
    expect(redirectText()).toBe("That's a question for her doctor or pharmacist. Want to add it to your visit questions?");
  });
});

describe("routeQuestion — record questions stay in scope", () => {
  it.each([
    ...SUGGESTED_QUESTIONS,
    "how many times did she feel dizzy",
    "When did she stop taking furosemide?",
    "Why does she take lorazepam?",
    "What dose of lorazepam is she on?",
    "Does lorazepam cause dizziness?",
    "Is lorazepam on the Beers list?",
    "Can you list her medicines?",
    "Can you show me the near-falls since Ativan started?",
    "What should I ask the doctor?",
    "Has she been dizzier since the new pill?",
    "Is she sleeping better since the lorazepam?",
    "Who prescribed the lorazepam?",
    "Did she miss any doses?",
    "What's her ACB score?",
    "What did Alex write about the fall?",
    // Near misses of the wider rules that must stay answerable.
    "Is she sleeping better than before the lorazepam?",
    "Has she been feeling blue?",
    "When did the swelling start?",
    "What's the reason she takes lorazepam?",
    "Does Tylenol PM cause drowsiness?",
    "How many falls since lorazepam started?",
    "What did she say about the fall on Oct 6?",
    "Has she been less dizzy this week?",
    "",
  ])("%s", (q) => {
    expect(routeQuestion(q)).toEqual({ inScope: true });
  });
});

describe("retrieveForQuestion — the suggested questions", () => {
  it("'When did the dizziness start?' gives the first recorded day and the before/after comparison", () => {
    const r = ask("When did the dizziness start?");
    expect(r.status).toBe("answered");
    expect(r.intent).toBe("first_onset");
    expect(r.deterministicAnswer[0].text).toMatch(/^Dizziness was first recorded on [A-Z][a-z]{2} \d{1,2} \(the diary starts on [A-Z][a-z]{2} \d{1,2}\), and most recently on/);
    expect(r.deterministicAnswer[1].evidenceIds).toEqual(["sig:med-lorazepam:dizziness:started"]);
    expect(r.deterministicAnswer[1].text).toMatch(/Lorazepam \(Ativan\) was started/);
    expectGrounded(r);
  });

  it("'How many near-falls since lorazepam started?' counts near-falls on answered days since the start date", () => {
    const r = ask("How many near-falls since lorazepam started?");
    const start = W.data.medications.find((m) => m.id === "med-lorazepam")!.startDate;
    expect(r.range).toEqual({ from: start, to: TODAY });
    expect(r.deterministicAnswer[0].text).toMatch(/^Near-falls were recorded on 2 of \d+ answered days since Lorazepam \(Ativan\) was started on Sep 24/);
    expect(r.deterministicAnswer[1].evidenceIds).toEqual(["fact:falls-since:med-lorazepam"]);
    expect(r.deterministicAnswer[1].text).toContain("1 fall");
    expectGrounded(r);
  });

  it("'What did Mom say about sleep this week?' quotes her own words from the last 7 days and the sleep ratings", () => {
    const r = ask("What did Mom say about sleep this week?");
    expect(r.intent).toBe("said");
    expect(r.range).toEqual({ from: addDays(TODAY, -6), to: TODAY });
    const quotes = r.deterministicAnswer.filter((s) => s.text.startsWith("In Margaret's words on"));
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) expect(q.text).toMatch(/"[^"]{8,}"$/);
    expect(text(r)).toMatch(/Sleep quality ratings averaged \d\.\d out of 5 on \d+ answered days/);
    expectGrounded(r);
  });

  it("'Which medicines are on the Beers list?' names every medicine in an AGS Beers prompt", () => {
    const r = ask("Which medicines are on the Beers list?");
    expect(r.intent).toBe("beers");
    const first = r.deterministicAnswer[0].text;
    expect(first).toMatch(/^4 of Margaret's 8 current medicines appear in AGS Beers Criteria® 2023 prompts:/);
    for (const name of ["Lorazepam (Ativan)", "Tylenol PM (OTC)", "Oxybutynin", "Omeprazole"]) expect(first).toContain(name);
    expect(text(r)).toContain("Listed as medicines older adults should generally avoid");
    expect(r.items.some((i) => i.id.startsWith("find:"))).toBe(true);
    expectGrounded(r);
  });

  it("'What changed in the last two weeks?' reports medicine changes and the biggest diary changes", () => {
    const r = ask("What changed in the last two weeks?");
    expect(r.intent).toBe("changes");
    expect(r.range).toEqual({ from: addDays(TODAY, -13), to: TODAY });
    expect(r.deterministicAnswer[0].text).toMatch(/Lorazepam \(Ativan\) started Sep 24|most recent change before that was Lorazepam \(Ativan\)/);
    expect(text(r)).toMatch(/compared with \d+ of \d+ in the 14 days before/);
    expectGrounded(r);
  });

  it("answers every suggested question from the records", () => {
    for (const q of SUGGESTED_QUESTIONS) {
      const r = ask(q);
      expect(r.status, q).toBe("answered");
      expect(r.deterministicAnswer.length).toBeGreaterThanOrEqual(1);
      expectGrounded(r);
    }
  });
});

describe("retrieveForQuestion — other intents", () => {
  it("counts with answered-day denominators ('how many times did she feel dizzy')", () => {
    const r = ask("how many times did she feel dizzy");
    expect(r.intent).toBe("count");
    expect(r.deterministicAnswer[0].evidenceIds).toEqual(["fact:count:dizziness"]);
    expect(r.deterministicAnswer[0].text).toMatch(/recorded on \d+ of \d+ answered days/);
    expectGrounded(r);
  });

  it("answers medicine details directly (start date, prescriber, reason, dose)", () => {
    expect(ask("When did she start taking Ativan?").deterministicAnswer[0].text).toBe("Lorazepam (Ativan) was started on Sep 24.");
    expect(ask("Who prescribed the lorazepam?").deterministicAnswer[0].text).toBe("Lorazepam (Ativan) was prescribed by Urgent care, as recorded by the family.");
    expect(ask("What is the Tylenol PM for?").deterministicAnswer[0].text).toBe("On the family's list, Tylenol PM (OTC) is taken for sleep.");
    expect(ask("What dose of lorazepam is she on?").deterministicAnswer[0].text).toBe("The list records Lorazepam (Ativan) as 0.5 mg, at bedtime.");
    expect(ask("When did she stop taking furosemide?").deterministicAnswer[0].text).toBe("Furosemide (Lasix) is still on the current list; no stop date is recorded.");
  });

  it("reads 'reason' as what a medicine is for only in that sense", () => {
    expect(ask("What's the reason she takes Tylenol PM?").deterministicAnswer[0].text).toBe("On the family's list, Tylenol PM (OTC) is taken for sleep.");
    expect(ask("Tell me about lorazepam").deterministicAnswer[0].text).not.toMatch(/is taken for/);
  });

  it("finds her own words across the whole diary: coded symptoms and notes she wrote herself", () => {
    for (const q of ["did she mention dry mouth?", "has she complained about dry mouth"]) {
      const r = ask(q);
      expect(r.intent, q).toBe("said");
      const t = text(r);
      expect(t, q).toContain("my mouth felt like sandpaper");
      expect(t, q).toMatch(/Margaret wrote on Sep \d+: "Ask about my bladder pills/);
      expect(t, q).not.toMatch(/do not mention/);
      expectGrounded(r);
    }
    const bladder = ask("what did she say about her bladder pills");
    expect(text(bladder)).toContain("Ask about my bladder pills");
    expectGrounded(bladder);
  });

  it("says when her words last mentioned a topic outside the period asked about", () => {
    const r = ask("did she mention dry mouth this week?");
    expect(r.deterministicAnswer[0].text).toMatch(/do not mention dry mouth .*; she most recently mentioned it on Sep \d+\.$/);
    expect(text(r)).toContain("Ask about my bladder pills");
    expectGrounded(r);
  });

  it("never reads a bare 'blue' as low mood", () => {
    expect(parseQuestion("what about the blue pill", W.data, TODAY).concepts).not.toContain("low_mood");
    expect(parseQuestion("has she been feeling blue", W.data, TODAY).concepts).toContain("low_mood");
  });

  it("says plainly when a named medicine is not on her list", () => {
    const r = ask("Is she taking ibuprofen?");
    expect(r.intent).toBe("not_listed");
    expect(r.deterministicAnswer[0].text).toBe("Ibuprofen is not on Margaret's medication list.");
    expectGrounded(r);
  });

  it("answers general drug-information questions from the reference set, with the record alongside", () => {
    const r = ask("Does lorazepam cause dizziness?");
    expect(r.intent).toBe("known_effect");
    expect(r.deterministicAnswer[0].text).toBe("Kinwise's reference set lists dizziness as a recognized possible effect of Lorazepam (Ativan).");
    expect(r.deterministicAnswer[1].evidenceIds).toEqual(["sig:med-lorazepam:dizziness:started"]);
    const none = ask("Does metformin cause dizziness?");
    expect(none.deterministicAnswer[0].text).toMatch(/does not list dizziness as an effect of Metformin; that alone says nothing either way/);
  });

  it("finds missed doses in her medicine remarks only", () => {
    const r = ask("Did she miss any doses?");
    expect(r.intent).toBe("missed_doses");
    expect(r.deterministicAnswer.length).toBeGreaterThan(0);
    for (const s of r.deterministicAnswer) expect(s.text).toMatch(/forg[eo]t|miss|skip/i);
    expectGrounded(r);
  });

  it("returns ACB, med list, notes, visit questions, coverage, summary and fall-risk answers", () => {
    const cases: [string, RegExp][] = [
      ["What's her ACB?", /anticholinergic burden score \(ACB\) adds up to 7/],
      ["What medicines is she taking?", /^8 medicines are on the current list/],
      ["What did Alex write?", /Alex \(daughter\) wrote on/],
      ["What should I ask the doctor?", /\?/],
      ["How many check-ins this month?", /Check-ins were recorded on \d+ of \d+ days/],
      ["How is she doing?", /Check-ins were recorded/],
      ["Which medicines are linked to falls?", /4 of Margaret's medicines are on published lists of medicines linked to falls/],
      ["What did the medication review find?", /The medication review lists \d+ prompts/],
    ];
    for (const [q, re] of cases) {
      const r = ask(q);
      expect(r.status, q).toBe("answered");
      expect(text(r), q).toMatch(re);
      expectGrounded(r);
    }
  });

  it("answers 'when was her last fall' with the date and her words that day", () => {
    const r = ask("When was her last fall?");
    expect(r.intent).toBe("last_time");
    expect(r.deterministicAnswer[0].text).toMatch(/^A fall was most recently recorded on Oct 5\.$/);
    expect(r.deterministicAnswer[1].text).toMatch(/^In Margaret's words on Oct 5: "/);
    expectGrounded(r);
  });

  it("handles 'before <medicine>' ranges with the before/after signal", () => {
    const r = ask("How was her sleep before lorazepam?");
    expect(r.intent).toBe("metric");
    expect(r.range).toEqual({ from: addDays("2026-09-24", -21), to: "2026-09-23" });
    expect(r.deterministicAnswer[0].text).toMatch(/^Sleep quality ratings averaged \d\.\d out of 5 on \d+ answered days from Sep 3 through Sep 23\.$/);
    expectGrounded(r);
  });

  it("answers questions about one day with that day's answers and her words", () => {
    const r = ask("What happened on Oct 5?");
    expect(r.intent).toBe("day");
    expect(r.deterministicAnswer[0].text).toMatch(/^Oct 5 check-in: energy \d out of 5, .*recorded dizziness \(severe\).*a fall/);
    expect(r.deterministicAnswer[1].text).toMatch(/^In Margaret's words on Oct 5: "Took a tumble/);
    expectGrounded(r);
    expect(ask("How was she today?").deterministicAnswer[0].text).toBe("No check-in was recorded on Oct 10.");
  });

  it("answers medicine-group questions from KB classes ('blood thinners' is not a bleeding symptom)", () => {
    const thinners = ask("Is she on any blood thinners?");
    expect(thinners.intent).toBe("med_class");
    expect(thinners.deterministicAnswer[0].text).toMatch(/^None of Margaret's 8 current medicines is in the "Anticoagulant[^"]*" group/);
    const benzo = ask("Which of her medicines are benzodiazepines?");
    expect(benzo.deterministicAnswer[0].text).toMatch(/group: Lorazepam \(Ativan\)\.$/);
    expectGrounded(benzo);
    const data: StoreData = { ...W.data, medications: [...W.data.medications, { ...W.data.medications[0], id: "med-tea", name: "Valerian tea", ingredientIds: [], match: "none" }] };
    expect(ask("Does she take any opioids?", { data }).deterministicAnswer.map((s) => s.text)).toContain(
      "1 medicine is not in Kinwise's reference set and could not be checked: Valerian tea.",
    );
  });

  it("says when a symptom from her words did not come up", () => {
    const r = ask("Any headaches lately?");
    expect(r.deterministicAnswer[0].text).toMatch(/^Headache did not come up in the \d+ check-ins from/);
  });

  it("works from the package alone when no review is passed", () => {
    const r = ask("Which medicines are on the Beers list?", { withReview: false });
    expect(r.status).toBe("answered");
    expect(r.deterministicAnswer[0].text).toContain("Lorazepam (Ativan)");
    expectGrounded(r);
  });

  it("leaves dismissed findings out of the Beers answer", () => {
    const data = {
      ...W.data,
      reviewDecisions: [{ findingKey: "beers-pim-ppi|med-omeprazole", status: "dismissed" as const, note: "", updatedAt: "2026-10-09T10:00:00.000Z" }],
    };
    const r = ask("Which medicines are on the Beers list?", { data });
    expect(r.deterministicAnswer[0].text).not.toContain("Omeprazole");
    expect(r.deterministicAnswer[0].text).toMatch(/^3 of Margaret's 8/);
  });

  it("returns a graceful not-found for questions the records can't answer", () => {
    for (const q of ["What's the weather tomorrow?", "Tell me a joke", "asdfgh"]) {
      const r = ask(q);
      expect(r.status).toBe("not_found");
      expect(r.deterministicAnswer).toEqual([]);
      expect(r.notFound).toBe(NOT_FOUND_TEXT);
      expect(NOT_FOUND_TEXT.startsWith("I couldn't find that in the records.")).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(ask("What changed in the last two weeks?")).toEqual(ask("What changed in the last two weeks?"));
  });

  it("keeps every answer grounded across many phrasings", () => {
    const questions = [
      "Has she been woozy since the new pill?",
      "Was she lightheaded in September?",
      "How often was she drowsy last week?",
      "Any near falls in the past 10 days?",
      "how many falls since Ativan",
      "What did she say about her ankles?",
      "What did she say about the fall?",
      "Did she mention dry mouth?",
      "When did the swelling start?",
      "How was her appetite recently?",
      "How was her energy since Sep 20?",
      "Was she confused yesterday?",
      "What did she say on Oct 5?",
      "Is Tylenol PM on the Beers list?",
      "Is metformin on the Beers list?",
      "Why does she take oxybutynin?",
      "When was the most recent near-fall?",
      "How many days did she check in?",
      "What changed this month?",
      "Did she forget her water pill?",
      "What concerns are pinned?",
      "Tell me about her dizziness",
    ];
    for (const q of questions) {
      expect(routeQuestion(q).inScope, q).toBe(true);
      const r = ask(q);
      expect(r.status, q).toBe("answered");
      expectGrounded(r);
    }
  });
});

describe("parseQuestion / parseRange", () => {
  const meds = W.data.medications;
  const lorazepam = meds.find((m) => m.id === "med-lorazepam")!;

  it("maps everyday words to diary items (near-falls never count as falls)", () => {
    expect(parseQuestion("Has she been woozy or lightheaded?", W.data, TODAY).metrics).toEqual(["dizziness"]);
    expect(parseQuestion("How many near-falls?", W.data, TODAY).metrics).toEqual(["nearFall"]);
    expect(parseQuestion("Did she nearly fall or fall?", W.data, TODAY).metrics).toEqual(["nearFall", "fall"]);
    expect(parseQuestion("Was she groggy and foggy?", W.data, TODAY).metrics).toEqual(["drowsiness", "confusion"]);
    expect(parseQuestion("Are her ankles puffy?", W.data, TODAY).metrics).toEqual(["swelling"]);
  });

  it("resolves medicines by name, brand, combination product, purpose and 'the new pill'", () => {
    const ids = (q: string) => parseQuestion(q, W.data, TODAY).meds.map((m) => m.id);
    expect(ids("since Ativan started")).toEqual(["med-lorazepam"]);
    expect(ids("is tylenol pm ok")).toEqual(["med-tylenolpm"]);
    expect(ids("what about Lasix")).toEqual(["med-furosemide"]);
    expect(ids("her water pill")).toEqual(["med-furosemide"]);
    expect(ids("since the new pill")).toEqual(["med-lorazepam"]);
    expect(parseQuestion("is she on warfarin", W.data, TODAY).unlisted.map((u) => u.name)).toEqual(["Warfarin"]);
  });

  it("parses date phrases relative to today", () => {
    const range = (q: string) => {
      const r = parseRange(q, TODAY, [], meds);
      return r ? [r.from, r.to] : null;
    };
    expect(range("this week")).toEqual([addDays(TODAY, -6), TODAY]);
    expect(range("in the last two weeks")).toEqual([addDays(TODAY, -13), TODAY]);
    expect(range("last week")).toEqual([addDays(TODAY, -13), addDays(TODAY, -7)]);
    expect(range("in september")).toEqual(["2026-09-01", "2026-09-30"]);
    expect(range("in december")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(range("since sep 20")).toEqual(["2026-09-20", TODAY]);
    expect(range("on october 5")).toEqual(["2026-10-05", "2026-10-05"]);
    expect(range("since 9/30")).toEqual(["2026-09-30", TODAY]);
    expect(range("yesterday")).toEqual([addDays(TODAY, -1), addDays(TODAY, -1)]);
    expect(range("today")).toEqual([TODAY, TODAY]);
    expect(range("last month")).toEqual(["2026-09-01", "2026-09-30"]);
    expect(range("over the last month")).toEqual([addDays(TODAY, -29), TODAY]);
    expect(range("this month")).toEqual(["2026-10-01", TODAY]);
    expect(range("recently")).toEqual([addDays(TODAY, -13), TODAY]);
    expect(range("since the new pill")).toEqual([lorazepam.startDate, TODAY]);
    expect(range("how is she")).toBeNull();
  });

  it("anchors 'since/before <medicine>' on its start date", () => {
    const since = parseRange("since lorazepam started", TODAY, [lorazepam]);
    expect(since).toMatchObject({ from: lorazepam.startDate, to: TODAY, kind: "since_med", medId: "med-lorazepam" });
    const before = parseRange("before she started lorazepam", TODAY, [lorazepam]);
    expect(before).toMatchObject({ from: addDays(lorazepam.startDate, -21), to: addDays(lorazepam.startDate, -1), kind: "before_med" });
  });
});

describe("robustness", () => {
  it("never throws and stays fast for odd input", () => {
    const odd = ["", "   ", "?", "🙂🙂🙂", "<script>alert(1)</script>", "x".repeat(5000), "dizzy ".repeat(400), "since since since", "in in in september september", "1/1", "on feb 31"];
    const t0 = performance.now();
    for (const q of odd) {
      expect(() => routeQuestion(q)).not.toThrow();
      const r = ask(q);
      expect(["answered", "not_found"]).toContain(r.status);
      expectGrounded(r);
    }
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("empty record", () => {
  it("answers 'not found' or plain zero-counts without throwing when nothing is recorded", () => {
    const data: StoreData = { ...W.data, checkIns: [], medications: [], notes: [], medEvents: [], savedQuestions: [] };
    const review = { ...W.review, findings: [], fallRiskMedIds: [], acb: { total: 0, band: "none" as const, contributors: [] } };
    const pkg = buildEvidence({ data, from: FROM, to: TODAY, review, timeline: { perMed: [], signals: [] }, kb: FAKE_KB });
    for (const q of [...SUGGESTED_QUESTIONS, "What's her ACB?", "What medicines is she taking?", "Did she miss any doses?", "What did Alex write?", "Which medicines are linked to falls?"]) {
      const r = retrieveForQuestion(q, { data, pkg, today: TODAY, review, kb: FAKE_KB, isKnownEffect: effect });
      expect(["answered", "not_found"]).toContain(r.status);
      expect(r.dropped).toBe(0);
    }
    const beers = retrieveForQuestion("Which medicines are on the Beers list?", { data, pkg, today: TODAY, review, kb: FAKE_KB });
    expect(beers.deterministicAnswer[0].text).toMatch(/^Margaret's medication list is empty, so nothing was checked against/);
  });
});

describe("off-script questions (judge regressions)", () => {
  it("says a measurement is not recorded instead of answering about bleeding ('what is her blood pressure')", () => {
    const r = ask("what is her blood pressure");
    expect(r.intent).toBe("not_recorded");
    expect(text(r)).toMatch(/^Kinwise doesn't record blood pressure readings; Margaret's care team would have them\./);
    expect(text(r)).toContain("Amlodipine for blood pressure (Dr. Okafor)");
    expect(text(r)).not.toMatch(/bleed|bruis/i);
    expectGrounded(r);
    for (const q of ["What was her A1C?", "how much does she weigh — what's her weight", "Is her potassium ok in the labs?", "what's her pulse"]) {
      const x = ask(q);
      expect(x.intent, q).toBe("not_recorded");
      expect(text(x), q).toMatch(/^Kinwise doesn't record /);
      expectGrounded(x);
    }
  });

  it("never reads a bare 'blood' as the bleeding or bruising symptom", () => {
    for (const q of ["what is her blood pressure", "how is her blood sugar", "any blood tests?"]) {
      expect(parseQuestion(q, W.data, TODAY).concepts, q).not.toContain("bleeding_or_bruising");
    }
    expect(parseQuestion("has she had any bruising or bleeding?", W.data, TODAY).concepts).toContain("bleeding_or_bruising");
    expect(parseQuestion("was there blood in her urine?", W.data, TODAY).concepts).toContain("bleeding_or_bruising");
  });

  it("keeps medicine-group questions about blood pressure on the medicine list", () => {
    expect(ask("which blood pressure medicines is she on").intent).toBe("med_class");
  });

  it("lists only the named prescriber's medicines ('what meds does dr lee prescribe')", () => {
    const r = ask("what meds does dr lee prescribe");
    expect(r.intent).toBe("prescriber");
    expect(text(r)).toBe(
      "The list records Dr. Lee (primary care) as the prescriber for 4 of Margaret's 8 current medicines: Furosemide (Lasix), Metformin, Atorvastatin and Omeprazole.",
    );
    expectGrounded(r);
    expect(text(ask("What did Dr. Okafor prescribe?"))).toContain("1 of Margaret's 8 current medicines: Amlodipine.");
    expect(text(ask("Which medicines did cardiology prescribe?"))).toContain("Dr. Okafor (cardiology)");
    const none = ask("what did dr smith prescribe");
    expect(text(none)).toMatch(/^No medicine on Margaret's current list is recorded as prescribed by Dr\. Smith; the prescribers recorded are /);
    expectGrounded(none);
    // A named medicine still gets the medicine answer.
    expect(ask("Who prescribed the lorazepam?").intent).toBe("med_detail");
  });

  it.each(["What dose of lorazepam is right?", "Is her lorazepam dose too high?", "Is the dose of furosemide correct?", "Is her dose ok?"])(
    "redirects dose judgments with the adjective after the noun: %s",
    (q) => {
      const r = routeQuestion(q);
      expect(r.inScope).toBe(false);
      if (!r.inScope) expect(r.category).toBe("dose");
    },
  );

  it.each(["What dose of lorazepam is she on?", "What is her lorazepam dose?", "What dose is she on right now?"])("keeps dose look-ups in scope: %s", (q) => {
    expect(routeQuestion(q)).toEqual({ inScope: true });
  });

  it("uses plain redirect and reason copy (no 'treatment' for every category, no 'safe')", () => {
    const safety = routeQuestion("Is lorazepam dangerous for her?");
    expect(safety.inScope).toBe(false);
    if (!safety.inScope) {
      expect(safety.reason).toBe("Whether a medicine is right for her is a judgment for her clinician; Kinwise only shows what was recorded and published criteria.");
      expect(safety.redirect).not.toMatch(/treatment/);
    }
    const diag = routeQuestion("Does she have dementia?");
    if (!diag.inScope) expect(diag.redirect).toBe("That's a question for her doctor or pharmacist. Want to add it to your visit questions?");
  });

  it("describes the ACB scale as published (1 to 3, threshold of 3 or more), with no band words", () => {
    const r = ask("What's her ACB?");
    expect(text(r)).toContain("The ACB scale scores each listed medicine from 1 to 3 for anticholinergic effects; the published review threshold is a total of 3 or more");
    expect(text(r)).not.toMatch(/\bband\b|0 to 3/);
    expectGrounded(r);
  });

  it("says there is no before period when the diary starts after the medicine was started", () => {
    const r = ask("Did the ankle swelling get better after furosemide?");
    expect(text(r)).toMatch(/The diary starts on [A-Z][a-z]{2} \d{1,2}, after Furosemide \(Lasix\) was started on Jul 7, so there's no before period to compare\./);
    expectGrounded(r);
  });

  it("does not count drowsiness words ('sleepy', 'dozed') as sleep in her own words", () => {
    const r = ask("What did she say about sleep?");
    for (const s of r.deterministicAnswer.filter((x) => x.text.includes("words on"))) {
      const quote = /"(.*)"/.exec(s.text)?.[1] ?? "";
      expect(/\bsleep(?!y|iness)\w*|\bslept\b|\bnight\b|\bbed\b|\binsomnia\b|\bawake\b|\bwoke\b|\blike a log\b/i.test(quote), quote).toBe(true);
    }
  });
});
