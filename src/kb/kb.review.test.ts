// End-to-end checks of the compiled KB through the real name matcher and review engine: each case is a scope
// correction from the independent clinical review (route, dose, indication and source-row scope of AGS Beers 2023).

import { describe, expect, it } from "vitest";
import type { Medication, PatientProfile } from "../model/types";
import { matchDrug } from "./index";
import { reviewMedications } from "../engine/meds/review";
import { bannedWordsIn } from "../engine/meds/text";

const TODAY = "2026-10-11";

function daysAgo(n: number): string {
  return new Date(Date.UTC(2026, 9, 11) - n * 864e5).toISOString().slice(0, 10);
}

function med(name: string, startedDaysAgo: number, reason = ""): Medication {
  const m = matchDrug(name);
  return {
    id: `m-${name.toLowerCase().replace(/\W+/g, "-")}`,
    name,
    ingredientIds: m.ingredientIds,
    match: m.match === "fuzzy" ? "none" : m.match,
    dose: "",
    frequency: "",
    asNeeded: false,
    otc: false,
    reason,
    prescriber: "",
    startDate: daysAgo(startedDaysAgo),
    endDate: null,
    createdAt: `${TODAY}T00:00:00Z`,
    updatedAt: `${TODAY}T00:00:00Z`,
  };
}

function profile(over: Partial<PatientProfile> = {}): PatientProfile {
  return {
    displayName: "Test Person",
    preferredName: "Pat",
    age: 80,
    sex: "female",
    conditions: [],
    crclMlMin: null,
    caregiverName: "Sam",
    caregiverRelation: "son",
    ...over,
  };
}

function review(meds: Medication[], p: PatientProfile = profile()) {
  return reviewMedications({ meds, profile: p, checkIns: [], today: TODAY });
}

/** Rule ids of the findings that involve the medicine. */
function rulesFor(r: ReturnType<typeof review>, m: Medication): string[] {
  return r.findings.filter((f) => f.medIds.includes(m.id)).map((f) => f.ruleId);
}

describe("route-specific products are outside the oral / systemic Beers criteria", () => {
  it("Voltaren gel with Eliquis, heart failure and CrCl 25: no NSAID finding", () => {
    const gel = med("Voltaren gel", 200, "knee pain");
    const r = review([gel, med("Eliquis", 400, "atrial fibrillation"), med("hydrocortisone cream", 30, "rash")], profile({ conditions: ["heart_failure"], crclMlMin: 25 }));
    expect(rulesFor(r, gel)).toEqual([]);
    // the oral product still gets all of them
    const tabs = med("diclofenac 75 mg tablets", 200, "knee pain");
    const r2 = review([tabs, med("Eliquis", 400, "atrial fibrillation")], profile({ conditions: ["heart_failure"], crclMlMin: 25 }));
    expect(rulesFor(r2, tabs)).toEqual(expect.arrayContaining(["ddi-nsaid-antithrombotic-steroid", "cond-hf-nsaid", "renal-nsaid", "pim-nsaid-chronic"]));
  });

  it("low-dose vaginal estrogen is not flagged (Beers: acceptable), estrogen pills are", () => {
    const p = profile({ conditions: ["urinary_incontinence"] });
    for (const name of ["Vagifem", "Estring", "Premarin vaginal cream", "estradiol cream"]) {
      const m = med(name, 300, "");
      expect(rulesFor(review([m], p), m), name).toEqual([]);
    }
    const pills = med("estradiol 1 mg", 300, "hot flashes");
    expect(rulesFor(review([pills], p), pills)).toEqual(expect.arrayContaining(["pim-estrogen", "cond-urinary-incontinence-women-estrogen"]));
  });

  it("atropine eye drops: no antispasmodic rule and no ACB points; hydrocortisone cream is not a systemic steroid", () => {
    const drops = med("atropine eye drops", 10);
    const cream = med("hydrocortisone cream", 30, "rash");
    const ibu = med("ibuprofen 400 mg", 5, "back pain");
    const r = review([drops, cream, ibu], profile({ conditions: ["history_of_falls", "delirium_history"] }));
    expect(rulesFor(r, drops)).toEqual([]);
    expect(rulesFor(r, cream)).toEqual([]);
    expect(r.acb.total).toBe(0);
  });

  it("Silenor (doxepin 3-6 mg) is outside the doxepin > 6 mg/day criterion; doxepin 25 mg is inside", () => {
    const low = med("Silenor", 60, "sleep");
    expect(rulesFor(review([low]), low)).not.toContain("pim-anticholinergic-antidepressant");
    const high = med("doxepin 25 mg", 60, "depression");
    expect(rulesFor(review([high]), high)).toContain("pim-anticholinergic-antidepressant");
  });
});

describe("indication and source-row scope", () => {
  it("aspirin: 'to prevent a heart attack' is primary prevention; 'after a heart attack' is not", () => {
    for (const reason of ["to prevent a heart attack", "prevent stroke", "heart health"]) {
      const a = med("baby aspirin", 900, reason);
      expect(rulesFor(review([a]), a), reason).toContain("pim-aspirin-primary-prevention");
    }
    for (const reason of ["after a heart attack in 2019", "had a stroke", "history of stent", "to prevent another stroke"]) {
      const a = med("baby aspirin", 900, reason);
      expect(rulesFor(review([a]), a), reason).not.toContain("pim-aspirin-primary-prevention");
    }
  });

  it("amiodarone: the first-line criterion is about atrial fibrillation", () => {
    const af = med("amiodarone 200 mg", 200, "afib");
    expect(rulesFor(review([af]), af)).toContain("pim-amiodarone");
    const vt = med("amiodarone 200 mg", 200, "ventricular tachycardia");
    expect(rulesFor(review([vt]), vt)).not.toContain("pim-amiodarone");
    const hf = med("amiodarone 200 mg", 200, "afib with heart failure");
    expect(rulesFor(review([hf]), hf)).not.toContain("pim-amiodarone");
  });

  it("Bactrim + lisinopril with reduced kidney function names the combination, and trimethoprim alone is covered", () => {
    const p = profile({ crclMlMin: 40 });
    const bactrim = med("Bactrim DS", 3, "UTI");
    const lis = med("lisinopril 10 mg", 800, "blood pressure");
    const f = review([bactrim, lis], p).findings.find((x) => x.ruleId === "caution-tmp-smx-ras");
    expect(f?.plain).toMatch(/trimethoprim/);
    const primsol = med("Primsol", 3, "UTI");
    expect(rulesFor(review([primsol, lis], p), primsol)).toContain("caution-tmp-smx-ras");
  });

  it("methyldopa is not a Beers 2023 'avoid' medicine; pimavanserin is not flagged as an antipsychotic to avoid", () => {
    const md = med("methyldopa", 400, "blood pressure");
    expect(rulesFor(review([md]), md)).not.toContain("pim-central-alpha-agonist-bp");
    const pim = med("Nuplazid", 100, "");
    expect(rulesFor(review([pim]), pim)).not.toContain("pim-antipsychotic");
  });

  it("mirabegron is not counted as a fall-risk medicine; oxybutynin is", () => {
    const mira = med("Myrbetriq", 100, "bladder");
    const oxy = med("oxybutynin 5 mg", 100, "bladder");
    const r = review([mira, oxy]);
    expect(r.fallRiskMedIds).toContain(oxy.id);
    expect(r.fallRiskMedIds).not.toContain(mira.id);
  });

  it("hidden sedating antihistamines in OTC products are found", () => {
    for (const name of ["Tylenol Simply Sleep", "Unisom PM Pain", "Bayer PM", "Coricidin HBP", "Mucinex Nightshift", "Theraflu Nighttime", "Advil Allergy Sinus"]) {
      const m = med(name, 30, "");
      expect(rulesFor(review([m]), m), name).toContain("pim-first-gen-antihistamine");
    }
  });

  it("every finding text in these cases follows the SPEC §3 language rules", () => {
    const meds = [
      med("Voltaren gel", 200), med("Bactrim DS", 3), med("lisinopril", 800, "blood pressure"), med("baby aspirin", 900, "to prevent a heart attack"),
      med("amiodarone", 200, "afib"), med("Silenor", 60), med("Unisom PM Pain", 30), med("lorazepam 0.5 mg", 300, "sleep"),
    ];
    const r = review(meds, profile({ crclMlMin: 40, conditions: ["history_of_falls"] }));
    expect(r.findings.length).toBeGreaterThan(5);
    for (const f of r.findings) for (const t of [f.title, f.plain, f.clinician, f.question]) expect(bannedWordsIn(t), `${f.ruleId}: ${t}`).toEqual([]);
  });
});
