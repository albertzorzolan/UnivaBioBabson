import { describe, expect, it } from "vitest";
import type { EvidencePackage, MetricKey, StoreData } from "../../model/types";
import { addDays } from "../../model/dates";
import { buildEvidence } from "./evidence";
import { EMERGENCY_REDIRECT, NOT_FOUND_TEXT, parseQuestion, parseRange, redirectText, retrieveForQuestion, routeQuestion } from "./qa";
import type { QaResult, RouteOptions } from "./qa";
import { SUGGESTED_QUESTIONS } from "./index";
import { verifySentence } from "./verify";
import { SAFETY_LINE } from "./template";
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
      ["Which medicines are linked to falls?", /5 of Margaret's medicines are on published lists of medicines linked to falls/],
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

describe("routeQuestion — safety routing works for any name or medicine (code audit round 2)", () => {
  // Internal review probe, 2026-10-17 (not committed): each of these questions was answered before, because the
  // scope rules only knew "Margaret", "mom", "dad" and the demo's medicine names. The inputs are inlined below.
  it.each([
    ["Should John stop zolpidem?", "treatment"],
    ["Should grandma stop the lorazepam?", "treatment"],
    ["Should my grandmother stop lorazepam?", "treatment"],
    ["Why is grandma so dizzy?", "cause"],
    ["Will grandpa fall again?", "prediction"],
    ["Will Dad fall again?", "prediction"],
    ["Does grandpa have dementia?", "diagnosis"],
    ["Is Ativan working?", "treatment"],
    ["Could zolpidem be the reason John is falling?", "cause"],
    ["Robert took 10 of his sleeping pills", "emergency"],
  ])("%s → %s (with or without the profile's names)", (q, category) => {
    for (const opts of [{}, { patientName: "John" }, { patientName: "Robert", personNames: ["Robert Diaz"], medNames: ["Zolpidem (Ambien)"] }]) {
      const r = routeQuestion(q, opts);
      expect(r.inScope, JSON.stringify(opts)).toBe(false);
      if (!r.inScope) expect(r.category, JSON.stringify(opts)).toBe(category);
    }
  });

  // The same questions for three different people, with the profile's names and medicines passed the way Ask passes
  // them. {who} is how the family might refer to the person, {med} a medicine on (or typed for) their list.
  const PROFILES = [
    { label: "Margaret / lorazepam", who: "Margaret", pos: "her", med: "lorazepam", opts: { patientName: "Margaret", personNames: ["Margaret Rivera", "Margaret"], medNames: W.data.medications.map((m) => m.name) } },
    { label: "Robert / zolpidem", who: "Robert", pos: "his", med: "zolpidem", opts: { patientName: "Robert", personNames: ["Robert Diaz", "Robert"], medNames: ["Zolpidem (Ambien)", "Lisinopril"] } },
    // A placeholder name and a medicine the reference set doesn't know: the family types "grandpa".
    { label: "Your relative / unlisted medicine", who: "grandpa", pos: "his", med: "valerian root", opts: { patientName: "Your relative", personNames: ["Your relative"], medNames: ["Valerian root"] } },
  ];
  const QUESTIONS: [string, "in" | string][] = [
    ["Should {who} stop {med}?", "treatment"],
    ["Can {who} come off the {med}?", "treatment"],
    ["Could {who} switch from {med} to something else?", "treatment"],
    ["Is the {med} working?", "treatment"],
    ["Take {who} off {med}?", "treatment"],
    ["Why is {who} so dizzy?", "cause"],
    ["Could {med} be the reason {who} is falling?", "cause"],
    ["Is {who}'s dizziness from the {med}?", "cause"],
    ["Did the {med} make {who} dizzy?", "cause"],
    ["Will {who} fall again?", "prediction"],
    ["Is {who} going to get worse?", "prediction"],
    ["Does {who} have dementia?", "diagnosis"],
    ["Is {who} getting Parkinson's?", "diagnosis"],
    ["{who} is not breathing", "emergency"],
    ["{who} collapsed and won't wake up", "emergency"],
    ["{who} took 10 of {pos} {med} pills", "emergency"],
    ["{who} swallowed a handful of the {med} tablets", "emergency"],
    ["I gave {who} a double dose by mistake", "emergency"],
    ["{who} may have taken too many pills", "emergency"],
    ["{who} accidentally took {pos} {med} twice", "emergency"],
    ["Is {med} why {who} fell?", "cause"],
    ["Could the {med} be why {pos} ankles are swollen?", "cause"],
    ["Does {med} explain why {who} fell?", "cause"],
    // Overdose with the medicine named and no pill noun after it (integration review).
    ["{who} took 8 {med}", "emergency"],
    ["{who} took a handful of {med}", "emergency"],
    ["{who} took too many {med}", "emergency"],
    ["{who} took a whole bottle of {med}", "emergency"],
    ["{who} took all of {pos} {med}", "emergency"],
    ["{who} took 10 of {pos} {med}", "emergency"],
    ["{who} took extra {med} last night", "emergency"],
    ["Is {med} bad for {who}?", "safety"],
    ["Is {med} right for {who}?", "treatment"],
    ["Can {who} have another {med} tonight?", "treatment"],
    ["Do we keep giving {pos} {med}?", "treatment"],
    // Record questions that must keep being answered.
    ["When did {who} start {med}?", "in"],
    ["How many near-falls since {med} started?", "in"],
    ["What dose of {med} is {who} on?", "in"],
    ["What did {who} say about sleep this week?", "in"],
    ["Why does {who} take {med}?", "in"],
    // A listed dose and a date lookup: neither is an overdose nor a treatment change.
    ["{who} took 2 caplets of {med} last night, is that on the list?", "in"],
    ["Can I see the start date for {med}?", "in"],
  ];
  const fill = (q: string, p: (typeof PROFILES)[number]) => q.replace("{who}", p.who).replace("{pos}", p.pos).replace("{med}", p.med);
  const cases = PROFILES.flatMap((p) => QUESTIONS.map(([q, want]) => [p.label, fill(q, p), want, p.opts] as const));
  it.each(cases)("%s: %s → %s", (_label, q, want, opts) => {
    const r = routeQuestion(q, opts);
    if (want === "in") {
      expect(r).toEqual({ inScope: true });
      return;
    }
    expect(r.inScope).toBe(false);
    if (!r.inScope) expect(r.category).toBe(want);
  });

  it("overdose questions get the emergency line with 911 and Poison Control", () => {
    for (const q of ["Robert took 10 of his sleeping pills", "she took a handful of her pills", "I think he has taken five tablets", "Gave her a double dose by mistake"]) {
      const r = routeQuestion(q);
      expect(r.inScope, q).toBe(false);
      if (r.inScope) continue;
      expect(r.category, q).toBe("emergency");
      expect(r.redirect).toBe(EMERGENCY_REDIRECT);
    }
    expect(EMERGENCY_REDIRECT).toContain("call 911");
    expect(EMERGENCY_REDIRECT).toContain("Poison Control at 1-800-222-1222");
  });

  it("sends an accidental double dose to emergency however it is phrased", () => {
    for (const q of ["She accidentally took her pills twice", "I think she took her lorazepam twice", "Robert accidentally took his pills twice", "He took his zolpidem twice last night", "she took too many of her lorazepam"]) {
      const r = routeQuestion(q);
      expect(r.inScope, q).toBe(false);
      if (!r.inScope) expect(r.category, q).toBe("emergency");
    }
  });

  it("sends overdoses that name the medicine to emergency, with 911 and Poison Control", () => {
    const margaretOpts = { patientName: "Margaret", personNames: ["Margaret Rivera"], medNames: W.data.medications.map((m) => m.name) };
    for (const q of ["She took a whole bottle of Tylenol PM", "he took 6 ambien", "She took too many Ativan", "Grandpa took too many zolpidem", "She swallowed 20 Ativan", "He took twice his dose"]) {
      for (const opts of [{}, margaretOpts]) {
        const r = routeQuestion(q, opts);
        expect(r.inScope ? "in" : r.category, q).toBe("emergency");
        if (!r.inScope) expect(r.redirect).toBe(EMERGENCY_REDIRECT);
      }
    }
  });

  it("answers record questions that only look like a diagnosis, a dose or a prediction", () => {
    for (const q of [
      "Does the Beers list have anything about kidney disease?",
      "Does her list have any medicines for low blood pressure?",
      "Does any medicine on her list have a warning for delirium?",
      "Does the timeline have any notes about low blood pressure?",
      "Do the notes have anything about an infection?",
      "Is there going to be a summary?",
      "She took another nap",
      "She took two hours to fall asleep after lorazepam",
    ]) {
      expect(routeQuestion(q, { patientName: "Margaret", personNames: ["Margaret Rivera"], medNames: W.data.medications.map((m) => m.name) }), q).toEqual({ inScope: true });
    }
  });

  it("does not raise an emergency for 'too many' falls, dizzy spells or naps, or a dose in milligrams", () => {
    // A false 911 alarm about the demo's own symptom questions is not the accepted kind of safe failure.
    for (const q of [
      "Has she had too many falls this month?",
      "Has she had too many dizzy spells?",
      "She took too many naps, is that recorded?",
      "She's had too many dizzy days, what does the timeline show?",
      "Did she have too many near-falls last week?",
      "She took 20 mg of her water pill this morning, is that recorded?",
      "Does she take her furosemide twice a day?",
    ]) {
      const r = routeQuestion(q, { patientName: "Margaret", personNames: ["Margaret Rivera"], medNames: W.data.medications.map((m) => m.name) });
      expect(r.inScope ? "in" : r.category, q).not.toBe("emergency");
    }
  });

  it("keeps Beers questions about people with a condition in scope, but redirects a diagnosis of the patient", () => {
    const margaretOpts = { patientName: "Margaret", personNames: ["Margaret Rivera"], medNames: W.data.medications.map((m) => m.name) };
    for (const opts of [{}, margaretOpts]) {
      for (const q of [
        "Is lorazepam on the Beers list for people who have dementia?",
        "Does lorazepam have a Beers warning for people with dementia?",
        "Is Tylenol PM a problem for people who have dementia?",
      ]) {
        expect(routeQuestion(q, opts), q).toEqual({ inScope: true });
      }
      for (const q of ["Does grandpa have dementia?", "Is Robert getting Parkinson's?"]) {
        const r = routeQuestion(q, opts);
        expect(r.inScope ? "in" : r.category, q).toBe("diagnosis");
      }
    }
  });

  it("redirects 'is <medicine> why…' and '<medicine> explains…' for any name, but answers what a medicine is for", () => {
    for (const q of ["Is lorazepam why she fell?", "Is zolpidem why John fell?", "Could the amlodipine be why her ankles are swollen?", "Might the Ambien explain the falls?", "Does zolpidem explain why he fell?"]) {
      for (const opts of [{}, { patientName: "Margaret", personNames: ["Margaret Rivera"], medNames: W.data.medications.map((m) => m.name) }]) {
        const r = routeQuestion(q, opts);
        expect(r.inScope ? "in" : r.category, q).toBe("cause");
      }
    }
    for (const q of ["Why does she take lorazepam?", "Can you tell me why she takes lorazepam?", "Can you explain the Beers list?"]) {
      expect(routeQuestion(q), q).toEqual({ inScope: true });
    }
  });

  it("does not read a placeholder name as a person's name in the redirect", () => {
    expect(redirectText("Your relative")).toBe("That's a question for your relative's doctor or pharmacist. Want to add it to your visit questions?");
  });
});

describe("retrieveForQuestion — wording fixes (code audit round 2)", () => {
  it("says 'as needed' once when the frequency already says it (Tylenol PM)", () => {
    const first = ask("What dose of Tylenol PM does she take?").deterministicAnswer[0].text;
    expect(first).toBe("The list records Tylenol PM (OTC) as 2 caplets, at bedtime as needed.");
    expect(first.match(/as needed/g)).toHaveLength(1);
  });

  it("phrases a single answered day without a '0 of 1 answered day' fraction", () => {
    const r = ask("Was she dizzy yesterday?");
    expect(r.deterministicAnswer[0].text).toBe("Dizziness was not recorded on Oct 9 (1 check-in that day).");
    expect(ask("Did she fall on Oct 5?").deterministicAnswer[0].text).toBe("Falls were recorded on Oct 5 (1 check-in that day).");
    expect(text(r)).not.toMatch(/of 1 answered day\b/);
    expectGrounded(r);
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

describe("off-script questions (internal review probes)", () => {
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

  // Internal review probe, 2026-10-17 (not committed): paraphrases of a diagnosis, a dose change and a cause that used
  // to get a records answer. The first one got confusion counts framed around the lorazepam start, which reads as an
  // implied answer; each now gets the redirect card.
  const MARGARET_OPTS = { patientName: "Margaret", personNames: ["Margaret Rivera", "Margaret"], medNames: W.data.medications.map((m) => m.name) };
  it.each([
    ["Is her confusion dementia?", "diagnosis"],
    ["Is the memory fog early Alzheimer's?", "diagnosis"],
    ["Is Margaret's forgetfulness a sign of dementia?", "diagnosis"],
    ["Is her confusion an early sign of dementia?", "diagnosis"],
    ["Is her confusion the beginning of Alzheimer's?", "diagnosis"],
    ["Does her confusion mean dementia?", "diagnosis"],
    ["Is her memory loss from Alzheimer's?", "diagnosis"],
    ["Is her forgetfulness normal aging?", "diagnosis"],
    ["Would it help if she took less lorazepam?", "dose"],
    ["What if we gave her a smaller amount of Ativan?", "dose"],
    ["Would it help to give her less lorazepam?", "dose"],
    ["Would less lorazepam help?", "dose"],
    ["Would she be better on less lorazepam?", "dose"],
    ["What if she skipped the lorazepam?", "treatment"],
    ["Is lorazepam linked to her falls?", "cause"],
    ["Is the Ativan tied to the dizziness?", "cause"],
    ["Can lorazepam lead to falls?", "cause"],
    ["Could Tylenol PM contribute to her confusion?", "cause"],
    ["Is lorazepam related to her falls?", "cause"],
    ["Is the dizziness associated with amlodipine?", "cause"],
    ["Is the dizziness connected to the lorazepam?", "cause"],
    ["Is her confusion associated with Tylenol PM?", "cause"],
    ["Is there a link between lorazepam and her falls?", "cause"],
    ["Are lorazepam and her dizziness related?", "cause"],
    ["Is lorazepam a factor in her falls?", "cause"],
    ["Does her confusion have anything to do with the oxybutynin?", "cause"],
    // Integration review, round 3: what-ifs about changing a medicine, "affect" and "something to do with" causes,
    // and any named condition offered as the diagnosis.
    ["Would she be less dizzy off the lorazepam?", "treatment"],
    ["What if she only took lorazepam on bad nights?", "treatment"],
    ["Would cutting back on lorazepam help?", "treatment"],
    ["Would cutting down on the lorazepam help?", "treatment"],
    ["What if she cut back on lorazepam?", "treatment"],
    ["What if she tapered off lorazepam?", "treatment"],
    ["Is the confusion something to do with lorazepam?", "cause"],
    ["Is lorazepam affecting her memory?", "cause"],
    ["Could the oxybutynin be affecting her memory?", "cause"],
    ["Does lorazepam affect her balance?", "cause"],
    ["Does Tylenol PM affect her memory?", "cause"],
    ["Has lorazepam had anything to do with it?", "cause"],
    ["Is her dizziness vertigo?", "diagnosis"],
    ["Is her tiredness depression?", "diagnosis"],
    ["Is her dizziness low blood pressure?", "diagnosis"],
    ["Is the swelling heart failure?", "diagnosis"],
    ["Is her swelling a heart problem?", "diagnosis"],
  ])("redirects the paraphrase '%s' (%s) to the redirect card", (q, category) => {
    for (const opts of [{}, MARGARET_OPTS] as RouteOptions[]) {
      const r = routeQuestion(q, opts);
      expect(r.inScope ? "in" : r.category, `${q} ${JSON.stringify(opts)}`).toBe(category);
      if (!r.inScope) {
        expect(r.offerVisitQuestion).toBe(true);
        expect(r.redirect).toBe(redirectText(opts.patientName));
      }
    }
  });

  it.each([
    "Which medicines are linked to falls?",
    "Which medicines can lead to falls?",
    "Are any of her medicines linked to falls?",
    "Has she been taking more naps?",
    "She took half an hour to fall asleep",
    "Is lorazepam on the Beers list for people who have dementia?",
    "Has her confusion been worse this week?",
    "Is the dementia warning on the Beers list?",
    "Did she skip any doses this week?",
    "Which of her medicines are associated with falls?",
    "Is lorazepam on the Beers list?",
    // Integration review, round 3.
    "Can you check if she skipped any pills this week?",
    "Do you know if she skipped her lorazepam yesterday?",
    "Can you tell me if she stopped the lorazepam?",
    "Did she have to take more trips to the bathroom at night?",
    "Did she need to take more breaks on her walk?",
    "Did she take her lorazepam last night?",
    "When did she start lorazepam?",
    "Has she been off her feet more?",
    "Does lorazepam affect sleep?",
    "Which medicines affect balance?",
    "Is the Beers list for heart failure patients?",
    "Is her blood pressure medicine on the Beers list?",
    "Is the kidney disease warning on her list?",
    "What is her blood pressure?",
  ])("keeps the near miss '%s' in scope", (q) => {
    expect(routeQuestion(q, MARGARET_OPTS)).toEqual({ inScope: true });
  });

  it("answers indirect records questions from the records ('Can you check if she skipped any pills this week?')", () => {
    expect(ask("Can you check if she skipped any pills this week?").intent).toBe("missed_doses");
    expect(ask("What is her blood pressure?").intent).toBe("not_recorded");
  });

  it("reads 'related to falls' as the fall-risk question, not a medicine name ('related' is not Relafen)", () => {
    for (const q of ["Which medicines are related to falls?", "Which medicines are linked to falls?", "Which of her medicines are associated with falls?"]) {
      expect(routeQuestion(q, MARGARET_OPTS), q).toEqual({ inScope: true });
      const r = ask(q);
      expect(r.intent, q).toBe("fall_risk");
      expect(text(r), q).not.toMatch(/Nabumetone/);
    }
  });

  it("gives a generic reason for a safety question that names no medicine ('Is it okay for her to drive?')", () => {
    const r = routeQuestion("Is it okay for her to drive?", MARGARET_OPTS);
    expect(r.inScope ? "in" : r.category).toBe("safety");
    if (!r.inScope) {
      expect(r.reason).toBe("Whether something is right for Margaret is a judgment for her clinician; Kinwise only shows what was recorded and published criteria.");
      expect(r.reason).not.toMatch(/\bmedicine\b|\bsafe\b/i);
    }
    const robert = routeQuestion("Is it okay for him to drive?", { patientName: "Robert", possessive: "his" });
    expect(robert.inScope).toBe(false);
    if (!robert.inScope) expect(robert.reason).toBe("Whether something is right for Robert is a judgment for his clinician; Kinwise only shows what was recorded and published criteria.");
    const anon = routeQuestion("Is it okay for her to drive?");
    expect(anon.inScope).toBe(false);
    if (!anon.inScope) expect(anon.reason).toBe("Whether something is right for her is a judgment for her clinician; Kinwise only shows what was recorded and published criteria.");
    // A medicine in the question keeps the medicine wording.
    const med = routeQuestion("Is it okay for her to take lorazepam at night?", MARGARET_OPTS);
    expect(med.inScope ? "in" : med.category).toBe("safety");
    if (!med.inScope) expect(med.reason).toMatch(/^Whether a medicine is right for Margaret is a judgment for her clinician;/);
  });

  const NOT_A_CHECKER = "Kinwise only checks the medicine combinations listed in AGS Beers 2023; it is not a full interaction checker. Ask her pharmacist to check interactions.";

  it("answers interaction questions with the AGS Beers 2023 combinations only, and says it is not a full checker", () => {
    for (const q of ["Which medicines interact with each other?", "Do any of her medicines interact?", "Which of her pills shouldn't be taken together?"]) {
      expect(routeQuestion(q, MARGARET_OPTS), q).toEqual({ inScope: true });
      const r = ask(q);
      expect(r.intent, q).toBe("interactions");
      expect(r.status, q).toBe("answered");
      const t = text(r);
      expect(t, q).toMatch(/^1 medicine combination on Margaret's current list is listed in AGS Beers 2023: /);
      expect(t, q).toContain("Oxybutynin");
      expect(t, q).toContain("Tylenol PM (OTC)");
      expect(r.deterministicAnswer.at(-1)!.text, q).toBe(NOT_A_CHECKER);
      expect(t, q).not.toMatch(/\bsafe\b/i);
      expect(r.items.some((i) => i.id === "find:ddi-anticholinergic-2:med-oxybutynin+med-tylenolpm"), q).toBe(true);
      expectGrounded(r);
    }
    // Without medicine context, "interacting" and "clash" are diary words, and medicines started or mixed up together
    // are not a combination question.
    for (const q of [
      "Has she been interacting with her friends?",
      "Is she interacting less with people?",
      "Did she clash with her aide?",
      "Which medicines did she start together?",
      "What did the doctor say about her medicines being mixed up?",
    ]) {
      expect(ask(q).intent, q).not.toBe("interactions");
    }
    expect(ask("Does the Beers list flag any interactions?").intent).toBe("interactions");
    // A schedule question or two symptoms "together" is not about combinations.
    expect(ask("How many pills does she take together at bedtime?").intent).not.toBe("interactions");
    expect(ask("Did she take her pills together this morning?").intent).not.toBe("interactions");
    expect(ask("Were dizziness and drowsiness recorded together?").intent).not.toBe("interactions");
  });

  it("says when no listed combination includes the medicines asked about, or none was found at all", () => {
    const pair = ask("Do lorazepam and amlodipine interact?");
    expect(pair.intent).toBe("interactions");
    // (The medicines are named in list order.) The sentence is about her list, not about the medicines in general.
    expect(text(pair)).toMatch(
      /^The combination of (?:Amlodipine and Lorazepam \(Ativan\)|Lorazepam \(Ativan\) and Amlodipine) is not among the AGS Beers 2023 combinations found on Margaret's list\./,
    );
    expect(pair.deterministicAnswer.at(-1)!.text).toBe(NOT_A_CHECKER);
    expectGrounded(pair);
    const one = ask("Does amlodipine interact with anything?");
    expect(one.intent).toBe("interactions");
    expect(text(one)).toMatch(/^None of the medicine combinations listed in AGS Beers 2023 was found on Margaret's current list for Amlodipine\./);
    expect(one.deterministicAnswer.at(-1)!.text).toBe(NOT_A_CHECKER);
    expectGrounded(one);
    const data = {
      ...W.data,
      reviewDecisions: [{ findingKey: "ddi-anticholinergic-2:med-oxybutynin+med-tylenolpm", status: "dismissed" as const, note: "", updatedAt: "2026-10-09T10:00:00.000Z" }],
    };
    // A dismissed prompt is still on her list and was still found: the answer says it was dismissed, never "none".
    const dismissed = ask("Which medicines interact with each other?", { data });
    expect(text(dismissed)).toMatch(
      /^1 AGS Beers 2023 combination prompt on Margaret's list \(Oxybutynin and Tylenol PM \(OTC\) — [^)]*\) was marked dismissed in the medication review\./,
    );
    expect(text(dismissed)).not.toMatch(/No medicine combination .* was found/);
    expect(text(dismissed)).not.toMatch(/\bsafe\b/i);
    expect(dismissed.deterministicAnswer.at(-1)!.text).toBe(NOT_A_CHECKER);
    for (const q of ["Does oxybutynin interact with anything?", "Do oxybutynin and Tylenol PM interact?"]) {
      const t = text(ask(q, { data }));
      expect(t, q).toMatch(/was marked dismissed in the medication review\./);
      expect(t, q).not.toMatch(/\bNone of\b|\bnot among\b/);
    }
    // With no combination in the review at all, "none was found" is true.
    const review = { ...W.review, findings: W.review.findings.filter((f) => f.category !== "beers_interaction" && f.category !== "cns_active_combo") };
    const pkgNo = buildEvidence({ data: W.data, from: FROM, to: TODAY, review, timeline: W.timeline, kb: FAKE_KB });
    const none = retrieveForQuestion("Which medicines interact with each other?", { data: W.data, pkg: pkgNo, today: TODAY, review, kb: FAKE_KB, isKnownEffect: effect });
    expect(text(none)).toMatch(/^No medicine combination listed in AGS Beers 2023 was found on Margaret's current list\./);
    expect(none.deterministicAnswer.at(-1)!.text).toBe(NOT_A_CHECKER);
  });

  it("answers a pair question about that pair, and lists other combinations only under their own lead-in", () => {
    // Lorazepam + Tylenol PM is not a listed pair here; Oxybutynin + Tylenol PM is. The answer must not read as if the
    // pair asked about were flagged.
    const r = ask("Do lorazepam and Tylenol PM interact?");
    expect(r.intent).toBe("interactions");
    const [first, second] = r.deterministicAnswer.map((s) => s.text);
    expect(first).toMatch(
      /^The combination of (?:Tylenol PM \(OTC\) and Lorazepam \(Ativan\)|Lorazepam \(Ativan\) and Tylenol PM \(OTC\)) is not among the AGS Beers 2023 combinations found on Margaret's list\.$/,
    );
    expect(second).toMatch(/^Also on Margaret's list, involving Tylenol PM \(OTC\): Oxybutynin and Tylenol PM \(OTC\) — /);
    expect(r.deterministicAnswer.at(-1)!.text).toBe(NOT_A_CHECKER);
    expectGrounded(r);
    // The listed pair itself is named as listed.
    const listed = ask("Do oxybutynin and Tylenol PM interact?");
    expect(text(listed)).toMatch(/^1 medicine combination on Margaret's current list is listed in AGS Beers 2023: Oxybutynin and Tylenol PM \(OTC\) — /);
    expectGrounded(listed);
  });

  it("never reads a medicine that is not on her list as checked ('Does lorazepam interact with oxycodone?')", () => {
    // A hypothetical new combination is a question for the pharmacist: the scope gate sends it to the redirect card.
    for (const q of ["Does lorazepam interact with oxycodone?", "Do lorazepam and zolpidem interact?"]) {
      const route = routeQuestion(q, MARGARET_OPTS);
      expect(route.inScope ? "in" : route.category, q).toBe("safety");
      if (!route.inScope) {
        expect(route.reason, q).toBe("Kinwise only checks combinations among the medicines on Margaret's list; her pharmacist can check a medicine that is not on it.");
      }
      // And if the records answer is asked for directly, it says the medicine was not checked.
      const r = ask(q);
      expect(r.intent, q).toBe("interactions");
      const t = text(r);
      expect(t, q).not.toMatch(/\bNo\b[^.]*\bwas found for Lorazepam/);
      expect(t, q).not.toMatch(/\bwas found\b[^.]*\bLorazepam/);
      expect(t, q).toMatch(/^(?:Oxycodone|Zolpidem) is not on Margaret's list, so Kinwise did not check it\./);
      expect(r.deterministicAnswer.at(-1)!.text, q).toBe(NOT_A_CHECKER);
      expectGrounded(r);
    }
    // Two listed medicines stay a records question.
    expect(routeQuestion("Do lorazepam and amlodipine interact?", MARGARET_OPTS)).toEqual({ inScope: true });
    // Whether a combination is fine is the pharmacist's call, never a records answer.
    const ok = routeQuestion("Are lorazepam and amlodipine okay together?", MARGARET_OPTS);
    expect(ok.inScope ? "in" : ok.category).toBe("safety");
  });

  it("uses the profile's pronoun in the not-a-full-checker sentence", () => {
    const data: StoreData = { ...W.data, profile: { ...W.data.profile, sex: "male" } };
    const r = ask("Which medicines interact with each other?", { data });
    expect(r.deterministicAnswer.at(-1)!.text).toBe(NOT_A_CHECKER.replace("Ask her", "Ask his"));
  });

  it("summarises 'this week' over the last 7 days, not the 30-day package", () => {
    for (const q of ["Summarise this week", "How has she been this week?"]) {
      const r = ask(q);
      expect(r.intent, q).toBe("summary");
      expect(r.range, q).toEqual({ from: addDays(TODAY, -6), to: TODAY });
      expect(r.deterministicAnswer[0].text, q).toMatch(/^Check-ins were recorded on \d+ of 7 days from /);
      expect(text(r), q).not.toMatch(/of 30 days/);
      expectGrounded(r);
    }
    // With no period named, the summary covers the evidence package's period (30 days in Ask; FROM–TODAY here).
    const all = ask("How is she doing?");
    expect(all.range).toEqual({ from: PKG.from, to: PKG.to });
    expect(all.deterministicAnswer[0].evidenceIds).toEqual(["fact:coverage"]);
  });
});

describe("retrieveForQuestion — any person's name, not only the demo's", () => {
  // A profile that is not Margaret: the intents must read "Dorothy" the way they read "she" and "Margaret".
  const data: StoreData = { ...W.data, profile: { ...W.data.profile, preferredName: "Dorothy", displayName: "Dorothy Hale" } };
  const pkg = buildEvidence({ data, from: FROM, to: TODAY, review: W.review, timeline: W.timeline, kb: FAKE_KB });
  const askD = (q: string) => ask(q, { data, pkg });

  it.each([
    ["When did Dorothy first get dizzy?", "first_onset", /^Dizziness was first recorded on /],
    // Only the preferred-name alternative of firstRe matches this one ("when has <name> first …").
    ["When has Dorothy first felt dizzy?", "first_onset", /^Dizziness was first recorded on /],
    ["When did Dorothy last fall?", "last_time", /^A fall was most recently recorded on Oct 5\./],
    ["How is Dorothy doing?", "summary", /^Check-ins were recorded on /],
  ])("%s → %s", (q, intent, re) => {
    const r = askD(q);
    expect(r.intent).toBe(intent);
    expect(r.status).toBe("answered");
    expect(r.dropped).toBe(0);
    expect(r.deterministicAnswer[0].text).toMatch(re);
  });
});

describe("routeQuestion — final critic probes (round 4)", () => {
  // The options Ask.tsx passes for the demo profile (src/views/caregiver/Ask.tsx › ask).
  const ASK_OPTS: RouteOptions = { patientName: "Margaret", personNames: ["Margaret Rivera", "Margaret"], medNames: W.data.medications.map((m) => m.name), possessive: "her" };
  // Another person and medicine, and a placeholder name with a medicine the reference set may not know.
  const ROBERT_OPTS: RouteOptions = { patientName: "Robert", personNames: ["Robert Diaz", "Robert"], medNames: ["Zolpidem (Ambien)", "Lisinopril"], possessive: "his" };
  const RELATIVE_OPTS: RouteOptions = { patientName: "Your relative", personNames: ["Your relative"], medNames: ["Valerian root"], possessive: "his" };
  const routed = (q: string, opts: RouteOptions = ASK_OPTS) => {
    const r = routeQuestion(q, opts);
    return r.inScope ? "in" : r.category;
  };

  it.each([
    // (a) The most she can have: a dose limit is the prescriber's or pharmacist's to give, never a records answer.
    "what's the max tylenol pm she can have",
    "what's the most ativan she can take",
    "is there a limit on her tylenol",
    "whats the maximum oxybutinin mom can take",
    "most lorazepam my mother should have in a day?",
    "Is there a daily limit for her furosemide?",
    "how many tylenol pm is she allowed",
    "how much tylenol pm is ok for grandma",
    "What's the max amount of Lasix she could take?",
    "max gabapentin for nana?",
    // A preposition between "max" and the medicine, the medicine after the modal, and "more than" an amount.
    "Is there a maximum for her Ativan?",
    "is there a max on her tylenol",
    "whats the max for tylenol pm",
    "is there a max on her water pill",
    "whats the most she can take of the lorazepam",
    "what's the highest she can go on lasix",
    "can she have more than 2 tylenol pm",
    "can my wife have more than one xanax",
  ])("sends the dose-limit question '%s' to the dose redirect", (q) => {
    expect(routed(q), q).toBe("dose");
    const r = routeQuestion(q, ASK_OPTS);
    if (!r.inScope) expect(r.redirect).toBe(redirectText("Margaret"));
  });

  it.each([
    ["What's the most {med} {who} can take?", ROBERT_OPTS, "zolpidem", "Robert"],
    ["Is there a limit on {med} for {who}?", RELATIVE_OPTS, "valerian root", "grandpa"],
  ])("sends '%s' to the dose redirect for another person and medicine", (q, opts, med, who) => {
    expect(routed(q.replace("{med}", med).replace("{who}", who), opts)).toBe("dose");
  });

  it.each([
    // (b) "Is X okay for her?": whether a medicine suits her is a judgment, for any medicine and any name.
    ["is lorazepam okay for her", ASK_OPTS],
    ["is ativan fine for mom", ASK_OPTS],
    ["Is furosemide alright for her?", ASK_OPTS],
    ["is the oxybutynin ok for my mom", ASK_OPTS],
    ["is lorazapam okay for her", ASK_OPTS],
    ["is amlodipine all right for grandma", ASK_OPTS],
    ["Is Tylenol PM good for Margaret?", ASK_OPTS],
    ["is zolpidem good for him", ASK_OPTS],
    ["Is zolpidem fine for Robert?", ROBERT_OPTS],
    // A name the person slot doesn't know, with a medicine from the reference set.
    ["Is zolpidem fine for Robert?", {}],
    ["Is valerian root okay for grandpa?", RELATIVE_OPTS],
    ["Is the lisinopril alright for my dad?", ROBERT_OPTS],
    // "a good idea", and a typed question that starts with the medicine (no "is").
    ["is lorazepam a good idea for her", ASK_OPTS],
    ["ativan ok for mom?", ASK_OPTS],
    ["zolpidem fine for my grandad?", ROBERT_OPTS],
  ] as [string, RouteOptions][])("sends '%s' to the safety redirect", (q, opts) => {
    expect(routed(q, opts), q).toBe("safety");
  });

  it.each([
    // (c) Choosing which medicine to leave out is a prescriber decision.
    "which pill to drop",
    "which med to cut",
    "Which med to stop?",
    "which medicine to skip tonight",
    "what pill can i drop",
    "which of her meds should we drop",
    "Which one of her pills could we cut?",
    // Whether a medicine is working, with the person in the phrase.
    "is the ativan doing her any good",
  ])("sends '%s' to the treatment redirect", (q) => {
    expect(routed(q), q).toBe("treatment");
  });

  it.each([
    // (d) Confusion that came on suddenly, or since earlier today, gets the 911 line (both word orders).
    "Mom is suddenly very confused today",
    "all of a sudden she's disoriented",
    "confused since this morning",
    "she's been really confused since this morning",
    "Dad is disoriented all of a sudden",
    "suddenly confused and cant find her words",
    "grandma became confused out of nowhere this afternoon",
    "She's been disoriented since she woke up",
    "Is she suddenly confused?",
    "Was she suddenly confused this morning?",
    // Common misspellings of "suddenly" (a missed emergency is worse than a false alarm).
    "sudenly confused today",
    "suddently very confused",
    "she is all of a suden confused",
    "she's sudenly confused",
    // Other words for confused, waking up confused, and a clock time or hours ago.
    "grandad's suddenly really muddled",
    "she woke up very confused this morning",
    "she became confused an hour ago",
    "confused since 2pm",
    // Stroke signs: one-sided weakness, or suddenly unable to stand.
    "mom is suddenly very dizzy and weak on one side",
    "she suddenly can't stand up",
  ])("sends the sudden confusion '%s' to the emergency line", (q) => {
    for (const opts of [ASK_OPTS, {}] as RouteOptions[]) {
      const r = routeQuestion(q, opts);
      expect(r.inScope ? "in" : r.category, q).toBe("emergency");
      if (!r.inScope) {
        expect(r.redirect).toBe(EMERGENCY_REDIRECT);
        expect(r.offerVisitQuestion).toBe(false);
      }
    }
  });

  it.each([
    // (e) A medicine stopped or run out of, said as a statement: the treatment redirect with the safety line.
    "She stopped taking the lorazepam yesterday",
    "she ran out of her water pill",
    "Mom quit taking her Ativan",
    "I think dad stopped his metformin on his own",
    "she's out of tylenol pm",
    "She has run out of oxybutynin",
    "she stopped her zolpidem last week",
    // The caregiver as the giver, "no longer" / "anymore", and "outta".
    "we stopped giving her the tylenol pm",
    "I stopped giving mom her lorazepam",
    "she's no longer taking the ativan",
    "she doesn't take the ativan anymore",
    "mum ran outta her tablets",
  ])("sends the statement '%s' to the treatment redirect with the don't-stop line", (q) => {
    const r = routeQuestion(q, ASK_OPTS);
    expect(r.inScope ? "in" : r.category, q).toBe("treatment");
    if (!r.inScope) {
      expect(r.reason, q).toContain("Don't stop or change any medicine without talking to the prescriber.");
      expect(r.redirect).toBe(redirectText("Margaret"));
      expect(r.offerVisitQuestion).toBe(true);
    }
  });

  it("keeps the usual treatment reason when nothing was stopped", () => {
    const r = routeQuestion("Should she stop taking lorazepam?", ASK_OPTS);
    expect(r.inScope ? "in" : r.category).toBe("treatment");
    if (!r.inScope) expect(r.reason).toBe("Starting, stopping or changing a medicine is a decision for her prescriber.");
  });

  it.each([
    // (f) A question about which listed medicines carry a published fall-risk flag is answered from the criteria.
    "Which of her meds are risky for falls?",
    "what are her fall-risk medicines",
    "are any of her medications risky for falling",
    "Which medicines are risky for falls?",
  ])("answers the fall-risk reference question '%s' from the published criteria", (q) => {
    expect(routeQuestion(q, ASK_OPTS), q).toEqual({ inScope: true });
    const r = ask(q);
    expect(r.intent, q).toBe("fall_risk");
    expect(r.status, q).toBe("answered");
    expectGrounded(r);
  });

  it.each([
    // Judgement questions about one medicine and her stay redirected.
    "is lorazepam risky for her",
    "Is Ativan risky for Margaret?",
    "Is lorazepam risky for her falls?",
    "Is the oxybutynin too risky for mom?",
  ])("keeps the judgement question '%s' on the safety redirect", (q) => {
    expect(routed(q), q).toBe("safety");
  });

  it.each([
    // Records questions near the new forms: they keep being answered from the records.
    "How often was confusion recorded?",
    "was she confused after lorazepam started",
    "Has she been confused since lorazepam started?",
    "When did the confusion start?",
    "Was she confused this morning?",
    "When did she stop lorazepam?",
    "Can you tell me if she stopped the lorazepam?",
    "She stopped going on her walks",
    "she ran out of energy by noon",
    "Did she stop the Tylenol PM?",
    "how much tylenol pm is she taking",
    "What's the most recent fall?",
    "What is the dose of her lorazepam?",
    "how many falls since she started the ativan",
    "Which medicines were stopped this month?",
    "Which day was she most dizzy?",
    "What did she say about her sleep this week?",
    "Which medicine did she start most recently?",
    "When was she most confused?",
    "Is her diary good for the visit?",
    // Near the dose-limit forms.
    "What's the max number of falls in a week?",
    "what is the maximum number of falls in a week",
    "whats the most ativan she's ever had",
    "which day was she most confused",
    "how many days could she not walk far",
    // Near the "is it okay for her" form.
    "is the brief good for her appointment",
    // What a medicine is for, not which one to drop.
    "which medicine does she take to stop the swelling",
    "what pill does she take to stop her bladder leaking",
    // Past-tense records questions about the confusion (no "today" / "now").
    "Did the confusion start suddenly after lorazepam?",
    "was the confusion sudden or gradual in the records?",
    "how often was she disoriented in the morning",
    "how many days was she confused since the morning walk started",
    "was she more confused after the ativan was added",
    // Near the "stopped" statement form.
    "she stopped drinking coffee",
    "she stopped her walks",
    "she ran out of steam on her walk",
    "how many falls since she ran out of ativan",
  ])("keeps the records question '%s' in scope", (q) => {
    expect(routeQuestion(q, ASK_OPTS), q).toEqual({ inScope: true });
  });

  it("names the rule that redirected a question, so the routing can be walked through", () => {
    const names = [
      "what's the most ativan she can take",
      "is lorazepam okay for her",
      "which pill to drop",
      "Mom is suddenly very confused today",
      "She stopped taking the lorazepam yesterday",
    ].map((q) => {
      const r = routeQuestion(q, ASK_OPTS);
      return r.inScope ? "" : r.rule;
    });
    for (const n of names) expect(n).toMatch(/\S/);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("routeQuestion — integration review probes (round 4 fixes)", () => {
  const ASK_OPTS: RouteOptions = { patientName: "Margaret", personNames: ["Margaret Rivera", "Margaret"], medNames: W.data.medications.map((m) => m.name), possessive: "her" };
  const routed = (q: string) => {
    const r = routeQuestion(q, ASK_OPTS);
    return r.inScope ? "in" : r.category;
  };

  it.each([
    // New or acute confusion described as happening now, in either word order, and other acute signs.
    "she suddnly got very confused",
    "mom has been very confused since lunch",
    "confusion since this morning?",
    "since this morning she's been disoriented",
    "since lunch she has been really confused",
    "she got confused this morning",
    "she became confused this afternoon",
    "she's confused this morning, worse than usual",
    "she suddenly started talking gibberish",
    "she suddenly started talking nonsense",
    "she's hallucinating right now",
    "grandma is seeing things that aren't there tonight",
    // Hard to rouse (oversedation).
    "she's suddenly very drowsy and hard to wake",
    "she's barely rousable",
  ])("sends '%s' to the emergency line", (q) => {
    const r = routeQuestion(q, ASK_OPTS);
    expect(r.inScope, q).toBe(false);
    if (!r.inScope) {
      expect(r.category, q).toBe("emergency");
      expect(r.redirect).toBe(EMERGENCY_REDIRECT);
    }
  });

  it("over-redirects a look-back at being hard to wake (the emergency words have no look-back guard; the safe side)", () => {
    expect(routed("how often was she hard to wake in the morning last month")).toBe("emergency");
  });

  it.each([
    // Look-backs at the records near the confusion forms.
    "was she more confused since breakfast on the days she took tylenol pm",
    "how confused was she since lunch yesterday",
    "confused since she started lorazepam?",
    "has she been confused since the ativan",
    "was she more confused than usual last week",
    "how often did she get confused",
    "how many days did she report seeing things",
    "was the confusion sudden or gradual in the records?",
    // A clinician stopped the medicine: a records question, not a family's change.
    "the doctor stopped her lorazepam last week, have the falls gone down?",
    "her doctor stopped the ativan, how many falls since then?",
    // Near the dose-limit shapes with no medicine.
    "the most falls she can have",
    "what's the most she can walk in a day",
    "most days can she walk without help?",
    "what's the max dizziness she had",
    "what's the highest dose of lorazepam on her list",
    // Near the "not taking it" statements.
    "she's been off her feet all day",
    "she's off her feet more",
    "she hasn't had a fall since tuesday",
    "she's been skipping meals",
    "she refuses to take a walk",
    "did she skip her lorazepam this week",
  ])("keeps the records question '%s' in scope", (q) => {
    expect(routeQuestion(q, ASK_OPTS), q).toEqual({ inScope: true });
  });

  it.each([
    "what's the most she can take?",
    "whats the maximum she can have",
    "how many is she allowed to take",
    "how many mg of furosemide is the limit",
  ])("sends the dose-limit question '%s' to the dose redirect", (q) => {
    expect(routed(q), q).toBe("dose");
  });

  it.each(["is lorazepam okay to give her", "is ativan fine to take at night", "is amlodipine a good fit for her"])(
    "sends '%s' to the safety redirect",
    (q) => {
      expect(routed(q), q).toBe("safety");
    },
  );

  it.each([
    "she stopped the lorazepam two weeks ago, did her dizziness get better?",
    "she's been off the lorazepam for 3 days",
    "she's been skipping her lorazepam",
    "she hasn't taken her lorazepam in 3 days",
    "she hasn't had her water pill since tuesday",
    "she refuses to take her lorazepam now",
    "she's off her lorazepam now",
  ])("answers the statement '%s' with the treatment redirect and the do-not-stop line", (q) => {
    const r = routeQuestion(q, ASK_OPTS);
    expect(r.inScope, q).toBe(false);
    if (!r.inScope) {
      expect(r.category, q).toBe("treatment");
      expect(r.reason).toContain(SAFETY_LINE);
    }
  });

  it.each(["which medicines increase her risk of falling", "what meds put her at risk for falls"])(
    "answers the fall-risk reference question '%s' from the published criteria",
    (q) => {
      expect(routeQuestion(q, ASK_OPTS), q).toEqual({ inScope: true });
      const r = ask(q);
      expect(r.intent, q).toBe("fall_risk");
      expectGrounded(r);
    },
  );

  it("keeps a risk question about one medicine redirected", () => {
    expect(routed("is lorazepam raising her risk of falls")).not.toBe("in");
  });
});
