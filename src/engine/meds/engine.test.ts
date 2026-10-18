// Unit tests for the review engine's logic, run against the fixed fixture KB (test-kb.ts) so they do not
// depend on the clinical KB's contents. The seed acceptance test (seed.review.test.ts) uses the real KB.

import { describe, expect, it } from "vitest";
import type { CheckIn, DiaryAnswers, Finding, MedReview, Medication, MetricKey, PatientProfile, Signal } from "../../model/types";
import type { KnowledgeBase } from "../../kb/types";
import { addDays } from "../../model/dates";
import { activeMeds, compareFindings, dedupe, findingKey, reviewWithKb } from "./engine";
import { CATEGORY_LABEL, CATEGORY_ORDER, findingSummaryForMed } from "./labels";
import { previewAdditionWithKb, draftMedication } from "./preview";
import { TEST_KB, med } from "./test-kb";
import { reviewMedications } from "./review";
import { REQUIRED_NOTICE, bannedWordsIn, fill, guardLanguage, listJoin, sentences } from "./text";
import { mentions } from "./rules/beers";
import type { Draft } from "./context";

const TODAY = "2026-10-10";

const PROFILE: PatientProfile = {
  displayName: "Test Person",
  preferredName: "Rose",
  age: 80,
  sex: "female",
  conditions: [],
  crclMlMin: null,
  caregiverName: "Sam",
  caregiverRelation: "son",
};

const BLANK: DiaryAnswers = {
  energy: null,
  sleep: null,
  appetite: null,
  dizziness: null,
  dizzinessSeverity: null,
  drowsiness: null,
  confusion: null,
  fall: null,
  nearFall: null,
  swelling: null,
};

function checkIn(daysAgo: number, answers: Partial<DiaryAnswers>, other: CheckIn["otherSymptoms"] = []): CheckIn {
  const date = addDays(TODAY, -daysAgo);
  return {
    id: `ci-${daysAgo}`,
    date,
    answers: { ...BLANK, ...answers },
    otherSymptoms: other,
    story: "",
    provenance: {},
    medNotes: [],
    confirmedAt: `${date}T20:00:00.000Z`,
    revision: 1,
  };
}

function review(meds: Medication[], opts: { profile?: Partial<PatientProfile>; checkIns?: CheckIn[]; signals?: Signal[]; kb?: KnowledgeBase } = {}): MedReview {
  return reviewWithKb(opts.kb ?? TEST_KB, {
    meds,
    profile: { ...PROFILE, ...opts.profile },
    checkIns: opts.checkIns ?? [],
    today: TODAY,
    signals: opts.signals,
  });
}

const of = (r: MedReview, category: Finding["category"]): Finding[] => r.findings.filter((f) => f.category === category);
const byRule = (r: MedReview, ruleId: string): Finding[] => r.findings.filter((f) => f.ruleId === ruleId);
const allText = (f: Finding): string[] => [f.title, f.plain, f.clinician, f.question];

// ---------------------------------------------------------------------------------------------

describe("activeMeds and matching", () => {
  it("treats no end date and an end date today or later as active", () => {
    const meds = [
      med(TODAY, "A", ["lorazepam"], { id: "a" }),
      med(TODAY, "B", ["lorazepam"], { id: "b", end: 0 }),
      med(TODAY, "C", ["lorazepam"], { id: "c", end: 5 }),
      med(TODAY, "D", ["lorazepam"], { id: "d", end: -1 }),
    ];
    expect(activeMeds(meds, TODAY).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores stopped medicines entirely (no findings, no fall-risk listing, no ACB)", () => {
    const r = review([med(TODAY, "Ativan", ["lorazepam"], { start: -200, end: -30 }), med(TODAY, "Benadryl", ["diphenhydramine"], { start: -200, end: -1 })]);
    expect(r.findings).toEqual([]);
    expect(r.fallRiskMedIds).toEqual([]);
    expect(r.acb.total).toBe(0);
    expect(r.unmatchedMedIds).toEqual([]);
  });

  it("reports active medicines with no reference-set ingredients as unmatched, with no findings and a notice", () => {
    const tea = med(TODAY, "Grandma's herbal tea", [], { id: "tea" });
    const odd = med(TODAY, "Mystery", ["not-a-kb-drug"], { id: "odd" });
    const r = review([tea, odd]);
    expect(r.unmatchedMedIds).toEqual(["tea", "odd"]);
    expect(r.findings).toEqual([]);
    expect(r.notices.some((n) => n.includes("not in Kinwise's reference set") && n.includes("Grandma's herbal tea"))).toBe(true);
  });

  it("treats match 'none' as unmatched even if ingredient ids are present, and leaves stopped unmatched medicines out", () => {
    const r = review([
      med(TODAY, "Lorazapam?", ["lorazepam"], { id: "fz", match: "none" }),
      med(TODAY, "Old tea", [], { id: "old", end: -10 }),
    ]);
    expect(r.unmatchedMedIds).toEqual(["fz"]);
    expect(r.findings).toEqual([]);
  });

  it("always carries the required notice verbatim, even for an empty list", () => {
    const r = review([]);
    expect(r.notices).toContain(REQUIRED_NOTICE);
    expect(REQUIRED_NOTICE).toBe(
      "This review checks published criteria only (AGS Beers 2023, ACB scale, fall-risk medicines, known prescribing cascades). It does not check doses, allergies, or every interaction. No flag does not mean a medicine is safe.",
    );
    expect(r.findings).toEqual([]);
    expect(r.acb).toEqual({ total: 0, band: "none", contributors: [] });
    expect(r.kbVersion).toBe("test-1");
  });
});

describe("Beers Table 2 (generally avoid)", () => {
  it("flags a benzodiazepine with category-specific wording, a stable key, evidence grade and source", () => {
    const r = review([med(TODAY, "Lorazepam (Ativan)", ["lorazepam"], { id: "lz", start: -16 })]);
    const [f] = of(r, "beers_avoid");
    expect(f.key).toBe("pim-benzo:lz");
    expect(f.ruleId).toBe("pim-benzo");
    expect(f.medIds).toEqual(["lz"]);
    expect(f.plain.startsWith("AGS Beers 2023 lists Lorazepam (Ativan) as a medicine older adults should generally avoid.")).toBe(true);
    expect(f.evidenceGrade).toBe("AGS Beers 2023 · strong recommendation · moderate-quality evidence");
    expect(f.sourceIds).toEqual(["beers2023"]);
    expect(f.question).toBe("Is Lorazepam (Ativan) still needed?");
  });

  it("fills {med} placeholders and keeps plain text to at most two sentences", () => {
    const r = review([med(TODAY, "Ativan 0.5 mg", ["lorazepam"])]);
    for (const f of r.findings) {
      for (const t of allText(f)) expect(t).not.toMatch(/[{}]/);
      expect(sentences(f.plain).length).toBeLessThanOrEqual(2);
    }
    expect(of(r, "beers_avoid")[0].plain).toContain("Test rationale sentence for Ativan 0.5 mg.");
    expect(of(r, "beers_avoid")[0].plain).not.toContain("second sentence");
  });

  it("names the ingredient inside a combination product", () => {
    const r = review([med(TODAY, "Tylenol PM", ["acetaminophen", "diphenhydramine"], { id: "tpm" })]);
    const [f] = byRule(r, "pim-antihistamine");
    expect(f.plain.startsWith("AGS Beers 2023 lists the diphenhydramine in Tylenol PM as a medicine older adults should generally avoid.")).toBe(true);
  });

  it("applies minDurationDays (PPI for more than 8 weeks): 21 days no, 56 and 400 days yes", () => {
    expect(byRule(review([med(TODAY, "Nexium", ["omeprazole"], { start: -21 })]), "pim-ppi")).toHaveLength(0);
    expect(byRule(review([med(TODAY, "Prilosec", ["omeprazole"], { start: -56 })]), "pim-ppi")).toHaveLength(1);
    const f = byRule(review([med(TODAY, "Protonix", ["pantoprazole"], { start: -400 })]), "pim-ppi")[0];
    expect(f.plain).toContain("should generally avoid for more than 8 weeks");
  });

  it("applies a chronic-use duration to NSAIDs (10 days no, 120 days yes)", () => {
    expect(byRule(review([med(TODAY, "Advil", ["ibuprofen"], { start: -10 })]), "pim-nsaid")).toHaveLength(0);
    expect(byRule(review([med(TODAY, "Aleve", ["naproxen"], { start: -120 })]), "pim-nsaid")).toHaveLength(1);
  });

  it("applies 'avoid starting' recency (warfarin started 10 days ago yes, 2200 days ago no)", () => {
    const recent = byRule(review([med(TODAY, "Coumadin", ["warfarin"], { start: -10 })]), "pim-warfarin");
    expect(recent).toHaveLength(1);
    expect(recent[0].plain).toContain("Coumadin was started on Sep 30; AGS Beers 2023 lists starting it as a first treatment for atrial fibrillation");
    expect(byRule(review([med(TODAY, "Coumadin", ["warfarin"], { start: -2200 })]), "pim-warfarin")).toHaveLength(0);
  });

  it("applies reason-keyword qualifiers: matching reason yes, excluded reason no, blank reason yes with a caveat", () => {
    const yes = review([med(TODAY, "Aspirin 81", ["aspirin"], { reason: "Primary prevention - just in case" })]);
    expect(byRule(yes, "pim-aspirin")).toHaveLength(1);
    const no = review([med(TODAY, "Aspirin 81", ["aspirin"], { reason: "after heart stent" })]);
    expect(byRule(no, "pim-aspirin")).toHaveLength(0);
    const other = review([med(TODAY, "Aspirin 81", ["aspirin"], { reason: "headaches" })]);
    expect(byRule(other, "pim-aspirin")).toHaveLength(0);
    const blank = byRule(review([med(TODAY, "Aspirin 81", ["aspirin"])]), "pim-aspirin");
    expect(blank).toHaveLength(1);
    expect(blank[0].plain).toContain("this depends on why it is taken, which is not recorded");
  });

  it("does not apply when the reason names a listed exception (antipsychotic for schizophrenia)", () => {
    expect(byRule(review([med(TODAY, "Seroquel", ["quetiapine"], { reason: "schizophrenia" })]), "pim-antipsychotic")).toHaveLength(0);
    expect(byRule(review([med(TODAY, "Seroquel", ["quetiapine"], { reason: "sleep" })]), "pim-antipsychotic")).toHaveLength(1);
  });

  it("reads a kidney threshold on a Table 2 rule as 'CrCl below OR the duration qualifier met'", () => {
    const short = (crcl: number | null) => byRule(review([med(TODAY, "Macrobid", ["nitrofurantoin"], { start: -5 })], { profile: { crclMlMin: crcl } }), "pim-nitrofurantoin");
    expect(short(null)).toHaveLength(0);
    expect(short(45)).toHaveLength(0);
    expect(short(20)).toHaveLength(1);
    expect(byRule(review([med(TODAY, "Macrobid", ["nitrofurantoin"], { start: -200 })]), "pim-nitrofurantoin")).toHaveLength(1);
  });
});

describe("Beers Table 4 (use with caution)", () => {
  it("uses caution wording and the beers_caution category", () => {
    const r = review([med(TODAY, "Zoloft", ["sertraline"])]);
    const [f] = of(r, "beers_caution");
    expect(f.ruleId).toBe("caution-ssri");
    expect(f.plain).toContain("as a medicine to use with caution in older adults");
    expect(f.plain).not.toContain("generally avoid");
    expect(of(r, "beers_avoid")).toHaveLength(0);
  });
});

describe("Beers Table 3 (drug-disease) and effective conditions", () => {
  const zoloft = () => med(TODAY, "Zoloft", ["sertraline"], { id: "z" });

  it("does not apply a condition rule when the condition is absent", () => {
    const r = review([zoloft()]);
    expect(of(r, "beers_condition")).toHaveLength(0);
    expect(r.effectiveConditions).toEqual([]);
  });

  it("derives history_of_falls from a fall recorded in the diary in the last 365 days", () => {
    const r = review([zoloft()], { checkIns: [checkIn(20, { fall: true })] });
    expect(r.effectiveConditions).toEqual([{ tag: "history_of_falls", from: "diary" }]);
    const [f] = of(r, "beers_condition");
    expect(f.key).toBe("cond-falls:z");
    expect(f.title).toBe("With a history of falls: Zoloft");
    expect(f.plain).toContain("AGS Beers 2023 lists Zoloft as best avoided in people with a history of falls (the diary recorded a fall, most recently on Sep 20)");
  });

  it("does not derive history_of_falls from a near-fall alone, or from a fall older than a year", () => {
    expect(review([zoloft()], { checkIns: [checkIn(100, { nearFall: true })] }).effectiveConditions).toEqual([]);
    expect(review([zoloft()], { checkIns: [checkIn(100, { nearFall: true }), checkIn(200, { fall: true })] }).effectiveConditions).toEqual([{ tag: "history_of_falls", from: "diary" }]);
    expect(review([zoloft()], { checkIns: [checkIn(400, { fall: true })] }).effectiveConditions).toEqual([]);
    expect(review([zoloft()], { checkIns: [checkIn(10, { fall: false, nearFall: false })] }).effectiveConditions).toEqual([]);
  });

  it("keeps a profile condition as 'profile' (no duplicate entry when the diary agrees)", () => {
    const r = review([zoloft()], { profile: { conditions: ["history_of_falls", "depression"] }, checkIns: [checkIn(3, { fall: true })] });
    expect(r.effectiveConditions).toEqual([
      { tag: "history_of_falls", from: "profile" },
      { tag: "depression", from: "profile" },
    ]);
    expect(of(r, "beers_condition")[0].plain).not.toContain("the diary recorded");
  });

  it("respects a sex-specific rule (women): female yes, male no, unknown yes", () => {
    const run = (sex: PatientProfile["sex"]) =>
      byRule(review([med(TODAY, "Cardura", ["doxazosin"])], { profile: { sex, conditions: ["urinary_incontinence"] } }), "cond-ui-women");
    expect(run("female")).toHaveLength(1);
    expect(run("male")).toHaveLength(0);
    expect(run(null)).toHaveLength(1);
  });
});

describe("Beers Table 5 (interactions and counts)", () => {
  it("flags an opioid with a benzodiazepine on different medicines", () => {
    const r = review([med(TODAY, "Oxycodone", ["oxycodone"], { id: "ox" }), med(TODAY, "Xanax", ["alprazolam"], { id: "xa" })]);
    const [f] = byRule(r, "ddi-opioid-benzo");
    expect(f.category).toBe("beers_interaction");
    expect([...f.medIds].sort()).toEqual(["ox", "xa"]);
    expect(f.key).toBe("ddi-opioid-benzo:ox+xa");
    expect(f.plain).toContain("as a combination older adults should generally avoid");
  });

  it("does not pair two ingredients inside one product", () => {
    const r = review([med(TODAY, "Combo", ["oxycodone", "lorazepam"])]);
    expect(byRule(r, "ddi-opioid-benzo")).toHaveLength(0);
  });

  it("uses caution wording when the recommendation is not a plain 'avoid'", () => {
    const r = review([med(TODAY, "Warfarin", ["warfarin"], { start: -2000 }), med(TODAY, "Celexa-like", ["sertraline"])]);
    const [f] = byRule(r, "ddi-warfarin-ssri");
    expect(f.plain).toContain("as a combination older adults should generally avoid");
  });

  it("reports >= 2 strong anticholinergics once (count rule wins over the equivalent pair rule)", () => {
    const r = review([med(TODAY, "Oxybutynin", ["oxybutynin"], { id: "oxy" }), med(TODAY, "Tylenol PM", ["acetaminophen", "diphenhydramine"], { id: "tpm" })]);
    const hits = r.findings.filter((f) => f.ruleId.startsWith("ddi-anticholinergic"));
    expect(hits.map((f) => f.ruleId)).toEqual(["ddi-anticholinergic-2"]);
    expect([...hits[0].medIds].sort()).toEqual(["oxy", "tpm"]);
    expect(hits[0].plain).toContain("AGS Beers 2023 lists taking 2 or more medicines with strong anticholinergic effects together");
  });

  it("names a count by ingredient: two products that share diphenhydramine are one entry", () => {
    const r = review([
      med(TODAY, "Advil PM", ["ibuprofen", "diphenhydramine"], { id: "apm" }),
      med(TODAY, "Tylenol PM (OTC)", ["acetaminophen", "diphenhydramine"], { id: "tpm" }),
      med(TODAY, "Oxybutynin", ["oxybutynin"], { id: "oxy" }),
    ]);
    const [f] = byRule(r, "ddi-anticholinergic-2");
    expect(f.plain).toContain("Rose takes 2: diphenhydramine (in Advil PM and Tylenol PM (OTC)) and Oxybutynin");
    expect([...f.medIds].sort()).toEqual(["apm", "oxy", "tpm"]);
  });

  it("counts distinct drugs: the same ingredient in two products is not two anticholinergics", () => {
    const r = review([med(TODAY, "Benadryl", ["diphenhydramine"], { id: "bn" }), med(TODAY, "Tylenol PM", ["acetaminophen", "diphenhydramine"], { id: "tpm" })]);
    expect(r.findings.filter((f) => f.ruleId.startsWith("ddi-anticholinergic"))).toHaveLength(0);
    expect(byRule(r, "dup-ingredient-diphenhydramine")).toHaveLength(1);
  });

  it("reports >= 3 CNS-active medicines as cns_active_combo, and not for two", () => {
    const three = review([med(TODAY, "Ativan", ["lorazepam"]), med(TODAY, "Zoloft", ["sertraline"]), med(TODAY, "Oxycodone", ["oxycodone"])]);
    const [f] = of(three, "cns_active_combo");
    expect(f.medIds).toHaveLength(3);
    expect(f.plain).toContain("3 or more medicines that act on the brain (CNS-active)");
    const two = review([med(TODAY, "Ativan", ["lorazepam"]), med(TODAY, "Zoloft", ["sertraline"])]);
    expect(of(two, "cns_active_combo")).toHaveLength(0);
  });
});

describe("Beers Table 6 (kidney function)", () => {
  const gaba = () => med(TODAY, "Gabapentin 300 mg", ["gabapentin"], { id: "g" });

  it("applies only when CrCl is known and below the threshold", () => {
    const r40 = review([gaba()], { profile: { crclMlMin: 40 } });
    const [f] = of(r40, "beers_renal");
    expect(f.plain).toContain("creatinine clearance is below 60 mL/min; Rose's recorded value is 40 mL/min");
    expect(f.clinician.startsWith("CrCl 40 mL/min (threshold < 60).")).toBe(true);
    expect(of(review([gaba()], { profile: { crclMlMin: 75 } }), "beers_renal")).toHaveLength(0);
    expect(of(review([gaba()], { profile: { crclMlMin: 60 } }), "beers_renal")).toHaveLength(0);
  });

  it("adds one notice listing the medicines that could not be checked when CrCl is unknown", () => {
    const r = review([gaba()]);
    expect(of(r, "beers_renal")).toHaveLength(0);
    const n = r.notices.find((x) => x.includes("kidney"));
    expect(n).toBe(
      "Gabapentin 300 mg has kidney-function criteria in AGS Beers 2023; whether they apply depends on kidney function — Kinwise doesn't know Rose's. Adding a creatinine clearance (CrCl) in Settings lets Kinwise check them.",
    );
    expect(review([med(TODAY, "Zoloft", ["sertraline"])]).notices.some((x) => x.includes("kidney"))).toBe(false);
  });
});

describe("age gating", () => {
  const list = () => [
    med(TODAY, "Ativan", ["lorazepam"]),
    med(TODAY, "Benadryl", ["diphenhydramine"]),
    med(TODAY, "Oxybutynin", ["oxybutynin"]),
    med(TODAY, "Gabapentin", ["gabapentin"]),
    med(TODAY, "Zoloft", ["sertraline"]),
  ];

  it("skips every Beers-based category under 65, with a notice, but keeps ACB, falls and duplicates", () => {
    const r = review(list(), { profile: { age: 60, conditions: ["history_of_falls"], crclMlMin: 30 } });
    const cats = new Set(r.findings.map((f) => f.category));
    for (const c of ["beers_avoid", "beers_caution", "beers_condition", "beers_interaction", "beers_renal", "cns_active_combo"] as const) expect(cats.has(c)).toBe(false);
    expect(cats.has("anticholinergic_burden")).toBe(true);
    expect(cats.has("fall_risk")).toBe(true);
    expect(r.notices[0]).toContain("The AGS Beers Criteria® apply to adults aged 65 and older. Rose's age is recorded as 60");
    expect(r.notices.some((n) => n.includes("kidney-function criteria"))).toBe(false);
  });

  it("applies Beers at exactly 65", () => {
    const r = review(list(), { profile: { age: 65 } });
    expect(of(r, "beers_avoid").length).toBeGreaterThan(0);
    expect(r.notices.some((n) => /aged 65 and older/.test(n))).toBe(false);
  });
});

describe("anticholinergic burden (ACB)", () => {
  it("sums ingredients across active medicines, bands the total and emits one finding at >= 3", () => {
    const r = review([
      med(TODAY, "Oxybutynin", ["oxybutynin"], { id: "oxy" }),
      med(TODAY, "Tylenol PM", ["acetaminophen", "diphenhydramine"], { id: "tpm" }),
      med(TODAY, "Furosemide (Lasix)", ["furosemide"], { id: "fur" }),
    ]);
    expect(r.acb.total).toBe(7);
    expect(r.acb.band).toBe("high");
    expect(r.acb.contributors).toEqual([
      { medId: "tpm", ingredientId: "diphenhydramine", score: 3 },
      { medId: "oxy", ingredientId: "oxybutynin", score: 3 },
      { medId: "fur", ingredientId: "furosemide", score: 1 },
    ]);
    const [f] = of(r, "anticholinergic_burden");
    expect(f.key).toBe("acb-total:fur+oxy+tpm");
    expect(f.title).toBe("Anticholinergic burden score (ACB): 7");
    expect(f.plain).toContain("Rose's medicines add up to 7 on the Anticholinergic Cognitive Burden (ACB) scale");
    expect(f.plain).toContain("the diphenhydramine in Tylenol PM 3");
    expect(f.sourceIds).toEqual(["acb2012"]);
    expect(sentences(f.plain).length).toBeLessThanOrEqual(2);
  });

  it("counts an ingredient taken in two products once", () => {
    const r = review([med(TODAY, "Benadryl", ["diphenhydramine"]), med(TODAY, "Tylenol PM", ["acetaminophen", "diphenhydramine"])]);
    expect(r.acb.total).toBe(3);
    expect(r.acb.contributors).toHaveLength(1);
    expect(r.acb.band).toBe("elevated");
  });

  it("emits no finding below 3 (band 'low')", () => {
    const r = review([med(TODAY, "Furosemide", ["furosemide"])]);
    expect(r.acb).toMatchObject({ total: 1, band: "low" });
    expect(of(r, "anticholinergic_burden")).toHaveLength(0);
  });
});

describe("fall-risk medicines", () => {
  const meds = () => [
    med(TODAY, "Ativan", ["lorazepam"], { id: "lz", start: -16 }),
    med(TODAY, "Amlodipine", ["amlodipine"], { id: "am", start: -140 }),
    med(TODAY, "Metformin", ["metformin"], { id: "mf", start: -900 }),
  ];

  it("lists every active FRID in one finding with its sources", () => {
    const r = review(meds());
    expect(r.fallRiskMedIds).toEqual(["lz", "am"]);
    const [f] = of(r, "fall_risk");
    expect(f.key).toBe("fall-risk:am+lz");
    expect(f.title).toBe("Medicines linked to falls (2)");
    expect(f.plain).toBe("2 of Rose's medicines are on published lists of medicines linked to falls in older adults (CDC STEADI): Ativan and Amlodipine.");
    expect(f.sourceIds).toEqual(["steadi"]);
  });

  it("is emphasised when the diary recorded falls, near-falls or dizziness in the last 30 days", () => {
    const r = review(meds(), {
      checkIns: [
        checkIn(5, { fall: true, nearFall: false, dizziness: true }),
        checkIn(11, { fall: false, nearFall: true, dizziness: false }),
        checkIn(40, { fall: true }),
      ],
    });
    const [f] = of(r, "fall_risk");
    expect(f.title).toBe("Medicines linked to falls, with falls or dizziness recorded (2)");
    expect(f.plain).toContain("In the last 30 days the diary recorded 1 fall (Oct 5) and 1 near-fall (Sep 29) on 2 answered days, and dizziness on 1 of 2 answered days.");
    expect(f.question).toBe(
      "With 1 fall and 1 near-fall on 2 answered days, and dizziness on 1 of 2 answered days in the last 30 days, could any of these medicines be contributing, and could the list be reviewed for fall risk? " +
        "Could Rose's blood pressure be checked lying and standing (CDC STEADI)?",
    );
    expect(f.clinician).toContain("Diary, last 30 days: 1 fall (Oct 5) and 1 near-fall (Sep 29) on 2 answered days; dizziness on 1 of 2 answered days.");
  });

  it("gives falls and near-falls their own denominators when they were answered on different days", () => {
    const r = review(meds(), { checkIns: [checkIn(5, { fall: true, nearFall: null, dizziness: false }), checkIn(11, { fall: false, nearFall: true })] });
    const [f] = of(r, "fall_risk");
    expect(f.question).toBe(
      "With 1 fall on 2 answered days, and 1 near-fall on 1 answered day in the last 30 days, could any of these medicines be contributing, and could the list be reviewed for fall risk? " +
        "Could Rose's blood pressure be checked lying and standing (CDC STEADI)?",
    );
  });

  // CDC STEADI measures orthostatic (lying and standing) blood pressure as part of a fall-risk assessment. The
  // follow-up question is only asked when the diary recorded falls or dizziness AND a FRID lowers blood pressure.
  const BP_QUESTION = "Could Rose's blood pressure be checked lying and standing (CDC STEADI)?";

  it("does not ask about lying and standing blood pressure when no FRID lowers blood pressure", () => {
    const r = review([med(TODAY, "Ativan", ["lorazepam"], { id: "lz", start: -16 })], { checkIns: [checkIn(5, { fall: true, dizziness: true })] });
    const [f] = of(r, "fall_risk");
    expect(f.title).toContain("with falls or dizziness recorded");
    expect(f.question).not.toContain("lying and standing");
    expect(f.sourceIds).toEqual(["steadi"]);
  });

  it("does not ask about lying and standing blood pressure without falls, near-falls or dizziness", () => {
    const r = review(meds(), { checkIns: [checkIn(5, { fall: false, nearFall: false, dizziness: false })] });
    const [f] = of(r, "fall_risk");
    expect(f.title).toBe("Medicines linked to falls (2)");
    expect(f.question).toBe("Could these medicines be reviewed for fall risk, for example as part of a fall-risk check (CDC STEADI)?");
  });

  it("asks it for a water pill alone and adds the CDC STEADI source, without changing which lists name the medicine", () => {
    const r = review([med(TODAY, "Lasix", ["furosemide"], { id: "fu", start: -95 })], { checkIns: [checkIn(3, { dizziness: true })] });
    const [f] = of(r, "fall_risk");
    expect(f.question.endsWith(` ${BP_QUESTION}`)).toBe(true);
    // The lead still credits only the list that names diuretics; STEADI is cited for the blood-pressure check.
    expect(f.plain).toMatch(/^Lasix is on published lists of medicines linked to falls in older adults \(STOPPFall\)\./);
    expect(f.sourceIds).toEqual(["stoppfall", "steadi"]);
  });

  it("keeps the first question sentence unchanged and adds no banned wording", () => {
    const r = review(meds(), { checkIns: [checkIn(5, { fall: true, dizziness: true })] });
    const [f] = of(r, "fall_risk");
    const parts = sentences(f.question);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^With .* could any of these medicines be contributing, and could the list be reviewed for fall risk\?$/);
    expect(parts[1]).toBe(BP_QUESTION);
    expect(bannedWordsIn(f.question)).toEqual([]);
  });

  it("names a single FRID in the singular", () => {
    const [f] = of(review([med(TODAY, "Zoloft", ["sertraline"])]), "fall_risk");
    expect(f.plain).toBe("Zoloft is on published lists of medicines linked to falls in older adults (STOPPFall).");
  });
});

describe("prescribing cascades", () => {
  it("reports a marker started after the index within the window, with dates and the reason", () => {
    const r = review([
      med(TODAY, "Amlodipine", ["amlodipine"], { id: "am", start: -140 }),
      med(TODAY, "Furosemide (Lasix)", ["furosemide"], { id: "fu", start: -95, reason: "Ankle swelling" }),
    ]);
    const [f] = of(r, "prescribing_cascade");
    expect(f.key).toBe("ccb-edema-loop:am+fu");
    expect(f.medIds).toEqual(["am", "fu"]);
    expect(f.plain).toBe(
      "Furosemide (Lasix) was started on Jul 7, 45 days after Amlodipine, for “ankle swelling”. Ankle swelling (peripheral edema) is a known possible effect of amlodipine-type medicines; a new medicine started for an effect like this is called a prescribing cascade.",
    );
    expect(f.question).toBe("Could the ankle swelling (peripheral edema) be linked to Amlodipine, and if so, is Furosemide (Lasix) still the best approach?");
  });

  it("does not report the reversed order (marker before index) or same-day starts", () => {
    const reversed = review([med(TODAY, "Lasix", ["furosemide"], { start: -400, reason: "swelling" }), med(TODAY, "Amlodipine", ["amlodipine"], { start: -100 })]);
    expect(of(reversed, "prescribing_cascade")).toHaveLength(0);
    const sameDay = review([med(TODAY, "Lasix", ["furosemide"], { start: -100 }), med(TODAY, "Amlodipine", ["amlodipine"], { start: -100 })]);
    expect(of(sameDay, "prescribing_cascade")).toHaveLength(0);
  });

  it("outside the window needs a reason that mentions the effect", () => {
    const late = (reason: string) =>
      of(review([med(TODAY, "Amlodipine", ["amlodipine"], { start: -500 }), med(TODAY, "Lasix", ["furosemide"], { start: -100, reason })]), "prescribing_cascade");
    expect(late("blood pressure")).toHaveLength(0);
    expect(late("swollen ankles")).toHaveLength(1);
  });

  it("windowDays null means any time after; uses KB question placeholders", () => {
    const r = review([med(TODAY, "Lisinopril", ["lisinopril"], { start: -900 }), med(TODAY, "Delsym", ["dextromethorphan"], { start: -10 })]);
    const [f] = of(r, "prescribing_cascade");
    expect(f.question).toBe("Could the cough be linked to Lisinopril?");
    expect(f.plain).toContain("890 days after Lisinopril.");
  });

  it("names a recently stopped index in the text but links only the active marker", () => {
    const r = review([
      med(TODAY, "Amlodipine", ["amlodipine"], { id: "am", start: -200, end: -20 }),
      med(TODAY, "Lasix", ["furosemide"], { id: "fu", start: -150, reason: "ankle swelling" }),
    ]);
    const [f] = of(r, "prescribing_cascade");
    expect(f.medIds).toEqual(["fu"]);
    expect(f.plain).toContain("50 days after Amlodipine (stopped on Sep 20)");
    expect(f.question).toBe("Amlodipine has been stopped; is Lasix still needed?");
    // an index stopped before the marker started does not count
    const before = review([med(TODAY, "Amlodipine", ["amlodipine"], { start: -200, end: -160 }), med(TODAY, "Lasix", ["furosemide"], { start: -150, reason: "swelling" })]);
    expect(of(before, "prescribing_cascade")).toHaveLength(0);
  });
});

describe("duplicates", () => {
  it("flags two different members of a specific class (two SSRIs; NSAID + COX-2)", () => {
    const ssri = review([med(TODAY, "Paxil", ["paroxetine"], { id: "p" }), med(TODAY, "Zoloft", ["sertraline"], { id: "z" })]);
    const [d] = of(ssri, "duplicate_class");
    expect(d.ruleId).toBe("dup-class-ssri");
    expect(d.sourceIds).toEqual(["stopp_start_v3"]);
    const nsaid = review([med(TODAY, "Advil", ["ibuprofen"]), med(TODAY, "Celebrex", ["celecoxib"])]);
    expect(of(nsaid, "duplicate_class").map((f) => f.ruleId)).toEqual(["dup-class-nsaid"]);
  });

  it("does not treat umbrella classes as duplicates (aspirin + warfarin, metformin + glipizide)", () => {
    const r = review([med(TODAY, "Aspirin", ["aspirin"], { reason: "after stent" }), med(TODAY, "Warfarin", ["warfarin"], { start: -2000 }), med(TODAY, "Metformin", ["metformin"]), med(TODAY, "Glipizide", ["glipizide"])]);
    expect(of(r, "duplicate_class")).toHaveLength(0);
  });
});

describe("monitoring (what to watch for)", () => {
  it("adds a non-alarming watch-list finding for an anticoagulant", () => {
    const r = review([med(TODAY, "Coumadin", ["warfarin"], { id: "w", start: -2000 })]);
    const [f] = of(r, "monitoring");
    expect(f.title).toBe("Blood thinner: what to watch for");
    expect(f.plain).toBe("Coumadin is a blood thinner. Worth watching for: unusual bruising, black or tarry stools and blood in urine.");
    expect(f.question).toBe("What signs of bleeding should we watch for with Coumadin?");
  });

  it("names a matching coded diary concept factually", () => {
    const r = review([med(TODAY, "Coumadin", ["warfarin"], { start: -2000 })], {
      checkIns: [checkIn(4, {}, [{ conceptId: "bleeding_or_bruising", present: true, span: null }])],
    });
    expect(of(r, "monitoring")[0].plain).toBe("Coumadin is a blood thinner. The diary noted bleeding or bruising (Oct 6) in the last 30 days.");
  });

  it("groups all medicines of one watch-list into one finding and links watch-list diary metrics", () => {
    const r = review([med(TODAY, "Glipizide", ["glipizide"], { id: "gl" }), med(TODAY, "Lantus", ["insulin glargine"], { id: "la" })], {
      checkIns: [checkIn(2, { confusion: true })],
    });
    const [f] = of(r, "monitoring");
    expect([...f.medIds].sort()).toEqual(["gl", "la"]);
    expect(f.relatedSymptoms).toEqual(["confusion"]);
  });
});

describe("relatedSymptoms, signals and questions", () => {
  it("links only symptoms recorded after a new medicine's start", () => {
    const lz = med(TODAY, "Ativan", ["lorazepam"], { id: "lz", start: -10 });
    const before = review([lz], { checkIns: [checkIn(20, { dizziness: true })] });
    expect(byRule(before, "pim-benzo")[0].relatedSymptoms).toEqual([]);
    const after = review([lz], { checkIns: [checkIn(20, { dizziness: true }), checkIn(3, { dizziness: true, drowsiness: true, energy: 2 })] });
    const [f] = byRule(after, "pim-benzo");
    expect(f.relatedSymptoms).toEqual(["dizziness", "drowsiness"]);
    expect(f.question).toBe("Could Ativan be contributing to the dizziness and daytime drowsiness recorded in the diary since Sep 30? Is Ativan still needed?");
  });

  it("for a long-standing medicine uses the last 30 days only", () => {
    const z = med(TODAY, "Zoloft", ["sertraline"], { start: -900 });
    expect(byRule(review([z], { checkIns: [checkIn(25, { dizziness: true })] }), "caution-ssri")[0].relatedSymptoms).toEqual(["dizziness"]);
    expect(byRule(review([z], { checkIns: [checkIn(40, { dizziness: true })] }), "caution-ssri")[0].relatedSymptoms).toEqual([]);
    const q = byRule(review([z], { checkIns: [checkIn(25, { dizziness: true })] }), "caution-ssri")[0].question;
    expect(q.startsWith("Could Zoloft be contributing to the dizziness recorded in the diary in the last 30 days?")).toBe(true);
  });

  it("uses the latest revision when a date has two check-ins, and ignores unanswered (null) answers", () => {
    const z = med(TODAY, "Zoloft", ["sertraline"], { start: -900 });
    const first = { ...checkIn(5, { dizziness: true }), revision: 1 };
    const fixed = { ...checkIn(5, { dizziness: false }), revision: 2 };
    expect(byRule(review([z], { checkIns: [first, fixed] }), "caution-ssri")[0].relatedSymptoms).toEqual([]);
    expect(byRule(review([z], { checkIns: [checkIn(5, {})] }), "caution-ssri")[0].relatedSymptoms).toEqual([]);
  });

  it("attaches timeline signals for the finding's medicines", () => {
    const sig = { id: "sig:lz:dizziness:started", medicationId: "lz" } as Signal;
    const other = { id: "sig:x:sleep:started", medicationId: "x" } as Signal;
    const r = review([med(TODAY, "Ativan", ["lorazepam"], { id: "lz" })], { signals: [sig, other] });
    expect(byRule(r, "pim-benzo")[0].signalIds).toEqual(["sig:lz:dizziness:started"]);
  });
});

describe("signals attach only where the diary item fits the finding", () => {
  it("a warfarin + ibuprofen bleeding prompt shows no drowsiness or energy signals (real KB)", () => {
    const wa = med(TODAY, "Warfarin", ["warfarin"], { id: "wa", start: -400 });
    const ib = med(TODAY, "Ibuprofen", ["ibuprofen"], { id: "ib", start: -20 });
    const sig = (metric: MetricKey, medicationId: string) => ({ id: `sig:${medicationId}:${metric}:started`, medicationId, metric }) as Signal;
    const r = reviewMedications({
      meds: [wa, ib],
      profile: { ...PROFILE },
      checkIns: [],
      today: TODAY,
      signals: [sig("drowsiness", "ib"), sig("energy", "ib"), sig("swelling", "ib")],
    });
    const f = r.findings.find((x) => x.category === "beers_interaction" && x.medIds.includes("wa") && x.medIds.includes("ib"));
    expect(f).toBeDefined();
    expect(f!.signalIds).not.toContain("sig:ib:drowsiness:started");
    expect(f!.signalIds).not.toContain("sig:ib:energy:started");
    // Swelling is a recognised effect of ibuprofen, so it still fits.
    expect(f!.signalIds).toContain("sig:ib:swelling:started");
  });

  it("keeps every signal on fall-risk and avoid prompts, where sedation is the mechanism", () => {
    const lz = med(TODAY, "Ativan", ["lorazepam"], { id: "lz", start: -16 });
    const s = { id: "sig:lz:energy:started", medicationId: "lz", metric: "energy" } as Signal;
    const r = review([lz], { signals: [s] });
    expect(of(r, "fall_risk")[0].signalIds).toEqual(["sig:lz:energy:started"]);
    expect(byRule(r, "pim-benzo")[0].signalIds).toEqual(["sig:lz:energy:started"]);
  });
});

describe("ordering, keys, determinism", () => {
  const list = () => [
    med(TODAY, "Amlodipine", ["amlodipine"], { id: "am", start: -140 }),
    med(TODAY, "Furosemide (Lasix)", ["furosemide"], { id: "fu", start: -95, reason: "Ankle swelling" }),
    med(TODAY, "Omeprazole", ["omeprazole"], { id: "om", start: -400 }),
    med(TODAY, "Oxybutynin", ["oxybutynin"], { id: "ox", start: -210 }),
    med(TODAY, "Tylenol PM (OTC)", ["acetaminophen", "diphenhydramine"], { id: "tp", start: -180 }),
    med(TODAY, "Lorazepam (Ativan)", ["lorazepam"], { id: "lz", start: -16 }),
    med(TODAY, "Coumadin", ["warfarin"], { id: "wa", start: -2000 }),
  ];
  const diary = () => [checkIn(5, { fall: true, dizziness: true }), checkIn(3, { dizziness: true, drowsiness: true })];

  it("sorts symptom-linked findings first, then by category order, then title", () => {
    const r = review(list(), { checkIns: diary() });
    const linked = r.findings.filter((f) => f.relatedSymptoms.length > 0);
    expect(r.findings.slice(0, linked.length)).toEqual(linked);
    const rest = r.findings.slice(linked.length);
    for (let i = 1; i < rest.length; i++) expect(compareFindings(rest[i - 1], rest[i])).toBeLessThan(0);
    expect(CATEGORY_ORDER.indexOf(rest[0].category)).toBeLessThanOrEqual(CATEGORY_ORDER.indexOf(rest[rest.length - 1].category));
  });

  it("is deterministic and independent of input order", () => {
    const a = review(list(), { checkIns: diary() });
    const b = review(list(), { checkIns: diary() });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const shuffled = review([...list()].reverse(), { checkIns: [...diary()].reverse() });
    expect(shuffled.findings.map((f) => f.key)).toEqual(a.findings.map((f) => f.key));
    expect(shuffled.fallRiskMedIds).toEqual(a.fallRiskMedIds);
  });

  it("builds keys as ruleId + ':' + sorted medicine ids, unique within a review", () => {
    const r = review(list(), { checkIns: diary() });
    for (const f of r.findings) expect(f.key).toBe(`${f.ruleId}:${[...f.medIds].sort().join("+")}`);
    expect(new Set(r.findings.map((f) => f.key)).size).toBe(r.findings.length);
    expect(findingKey("x", ["b", "a"])).toBe("x:a+b");
  });

  it("dedupe drops a same-signature finding whose medicines are a subset of another's", () => {
    const d = (ruleId: string, medIds: string[], priority?: number): Draft => ({
      ruleId, category: "beers_interaction", medIds, title: ruleId, plain: "", clinician: "", question: "", sourceIds: ["s"], evidenceGrade: null, signature: "sig", priority,
    });
    const out = dedupe([d("pair", ["a", "b"], 1), d("count", ["a", "b", "c"], 0), d("pair", ["a", "b"], 1)]);
    expect(out.map((x) => x.ruleId)).toEqual(["count"]);
  });
});

describe("badges and labels", () => {
  it("summarises a medicine's findings as small badges", () => {
    const r = review(
      [
        med(TODAY, "Amlodipine", ["amlodipine"], { id: "am", start: -140 }),
        med(TODAY, "Lasix", ["furosemide"], { id: "fu", start: -95, reason: "ankle swelling" }),
        med(TODAY, "Tylenol PM", ["acetaminophen", "diphenhydramine"], { id: "tp" }),
        med(TODAY, "Oxybutynin", ["oxybutynin"], { id: "ox" }),
        med(TODAY, "Tea", [], { id: "tea" }),
      ],
      { checkIns: [checkIn(10, { fall: true })] },
    );
    expect(findingSummaryForMed(r, "tp")).toEqual(["Beers", "Combination", "ACB 3", "Fall risk"]);
    expect(findingSummaryForMed(r, "fu")).toEqual(["ACB 1", "Fall risk", "Cascade?"]);
    expect(findingSummaryForMed(r, "tea")).toEqual(["Not checked"]);
    expect(findingSummaryForMed(r, "nope")).toEqual([]);
  });

  it("has a label for every category and a complete order", () => {
    expect(Object.keys(CATEGORY_LABEL).sort()).toEqual([...CATEGORY_ORDER].sort());
    expect(CATEGORY_ORDER[0]).toBe("prescribing_cascade");
    expect(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]).toBe("monitoring");
  });

  it("ranks the Beers >= 3 CNS-active combination with the other combinations, ahead of cautions and duplicates", () => {
    const at = (c: (typeof CATEGORY_ORDER)[number]) => CATEGORY_ORDER.indexOf(c);
    expect(at("cns_active_combo")).toBe(at("beers_interaction") + 1);
    expect(at("cns_active_combo")).toBeLessThan(at("beers_caution"));
    expect(at("cns_active_combo")).toBeLessThan(at("duplicate_class"));
  });
});

describe("previewAddition", () => {
  const state = (meds: Medication[]) => ({ meds, profile: PROFILE, checkIns: [], today: TODAY });

  it("reports added findings and the ACB change for a new medicine", () => {
    const p = previewAdditionWithKb(TEST_KB, state([med(TODAY, "Tylenol PM", ["acetaminophen", "diphenhydramine"], { id: "tp" })]), {
      id: "new",
      name: "Oxybutynin",
      ingredientIds: ["oxybutynin"],
    });
    expect(p.acbBefore).toBe(3);
    expect(p.acbAfter).toBe(6);
    expect(p.acbBandAfter).toBe("high");
    expect(p.added.map((f) => f.ruleId)).toEqual(expect.arrayContaining(["ddi-anticholinergic-2", "acb-total"]));
    expect(p.added.every((f) => f.medIds.includes("new"))).toBe(true);
    expect(p.removed).toEqual([]);
    expect(p.matched).toBe(true);
  });

  it("reports findings that go away when an existing medicine is edited, and unmatched additions", () => {
    const lz = med(TODAY, "Ativan", ["lorazepam"], { id: "lz" });
    const edit = previewAdditionWithKb(TEST_KB, state([lz]), { ...lz, name: "Herbal sleep tea", ingredientIds: [], match: "none" });
    expect(edit.removed.map((f) => f.ruleId)).toEqual(expect.arrayContaining(["pim-benzo", "fall-risk"]));
    expect(edit.added).toEqual([]);
    expect(edit.matched).toBe(false);
  });

  it("fills a half-filled drawer record", () => {
    const m = draftMedication({ name: "Ativan", ingredientIds: ["lorazepam"] }, TODAY);
    expect(m).toMatchObject({ id: "preview-new-medication", startDate: TODAY, endDate: null, match: "exact" });
  });
});

describe("language rules", () => {
  it("rewrites banned KB wording and never leaves raw placeholders", () => {
    const kb: KnowledgeBase = {
      ...TEST_KB,
      beers: [
        {
          ...TEST_KB.beers[0],
          title: "Not safe: {med}",
          plain: "This is dangerous and caused falls; it is causing harm, so you should stop it. Use {unknownPlaceholder} urgently.",
          clinician: "Risk score high; diagnosis unclear.",
          question: "Should she stop taking {med}?",
        },
      ],
    };
    const r = review([med(TODAY, "Ativan", ["lorazepam"])], { kb });
    const f = byRule(r, "pim-benzo")[0];
    for (const t of allText(f)) {
      expect(bannedWordsIn(t)).toEqual([]);
      expect(t).not.toMatch(/[{}]/);
    }
  });

  it("text helpers: fill, listJoin, mentions, sentences", () => {
    expect(fill("{med} on {date}{missing}.", { med: "A", date: "Sep 1" })).toBe("A on Sep 1.");
    expect(listJoin(["a", "b", "c"])).toBe("a, b and c");
    expect(mentions("Swollen ankles", ["swollen"])).toBe(true);
    expect(mentions("unswollen", ["swollen"])).toBe(false);
    expect(mentions("", ["x"])).toBe(false);
    expect(sentences("Take 0.5 mg e.g. at night. Then stop? No.")).toEqual(["Take 0.5 mg e.g. at night.", "Then stop?", "No."]);
    expect(guardLanguage("This caused it and is causing more; safer options")).toBe("This been linked to it and may be contributing to more; lower-risk options");
  });

  it("flags 'side effect of <the person's medicine>' for any name, not only the demo's", () => {
    for (const t of ["Dizziness is a side effect of her lorazepam.", "A side effect of Dorothy's zolpidem.", "a side effect of Robert's pills", "side effect of their water pill"]) {
      expect(bannedWordsIn(t), t).toContain("side effect of <patient's drug>");
    }
    // General drug information without a possessive stays allowed.
    expect(bannedWordsIn("Drowsiness is a recognized side effect of lorazepam.")).toEqual([]);
  });

  it("survives a class cycle in a malformed KB", () => {
    const r = review([med(TODAY, "Cyclo", ["cyclodrug"])]);
    expect(r.findings).toEqual([]);
  });

  it("uses no banned language across 400 generated medication lists (all text and notices)", () => {
    let seed = 20261010;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pool = TEST_KB.drugs.filter((d) => d.id !== "cyclodrug").map((d) => d.id);
    const reasons = ["", "sleep", "ankle swelling", "primary prevention", "schizophrenia", "cough", "pain"];
    const conds: PatientProfile["conditions"] = ["history_of_falls", "dementia_or_cognitive_impairment", "urinary_incontinence", "depression"];
    const problems: string[] = [];
    for (let i = 0; i < 400; i++) {
      const n = 1 + Math.floor(rnd() * 8);
      const meds: Medication[] = [];
      for (let k = 0; k < n; k++) {
        const ids = rnd() < 0.15 ? ["acetaminophen", "diphenhydramine"] : [pool[Math.floor(rnd() * pool.length)]];
        meds.push(
          med(TODAY, `Med ${k} ${ids.join("/")}`, ids, {
            id: `g${i}-${k}`,
            start: -Math.floor(rnd() * 1500),
            end: rnd() < 0.1 ? -Math.floor(rnd() * 20) - 1 : null,
            reason: reasons[Math.floor(rnd() * reasons.length)],
          }),
        );
      }
      const checkIns = Array.from({ length: Math.floor(rnd() * 10) }, (_, j) =>
        checkIn(Math.floor(rnd() * 60) + j * 0, {
          dizziness: rnd() < 0.5,
          fall: rnd() < 0.1,
          confusion: rnd() < 0.3,
          energy: (1 + Math.floor(rnd() * 5)) as 1 | 2 | 3 | 4 | 5,
        }),
      );
      const r = review(meds, {
        profile: {
          age: 55 + Math.floor(rnd() * 40),
          conditions: conds.filter(() => rnd() < 0.3),
          crclMlMin: rnd() < 0.5 ? null : 15 + Math.floor(rnd() * 80),
          sex: rnd() < 0.5 ? "female" : "male",
        },
        checkIns,
      });
      for (const f of r.findings) {
        for (const t of allText(f)) {
          const hits = bannedWordsIn(t);
          if (hits.length) problems.push(`${f.key}: ${hits.join(",")}: ${t}`);
          if (/[{}]/.test(t)) problems.push(`${f.key}: placeholder: ${t}`);
          if (!t.trim()) problems.push(`${f.key}: empty text`);
        }
        if (sentences(f.plain).length > 2) problems.push(`${f.key}: plain has ${sentences(f.plain).length} sentences`);
        if (f.sourceIds.length === 0) problems.push(`${f.key}: no sources`);
        for (const id of f.medIds) if (!meds.find((m) => m.id === id && (m.endDate === null || m.endDate >= TODAY))) problems.push(`${f.key}: inactive or unknown med ${id}`);
      }
      for (const n2 of r.notices) {
        const hits = bannedWordsIn(n2);
        if (hits.length) problems.push(`notice: ${hits.join(",")}: ${n2}`);
      }
      expect(r.acb.contributors.reduce((s, c) => s + c.score, 0)).toBe(r.acb.total);
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });
});
