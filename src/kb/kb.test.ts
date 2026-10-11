// Compiled knowledge-base tests: referential integrity, published values (ACB, Beers ratings), name matching,
// search ranking, seed coverage and the SPEC §3 language rules for every string the KB ships.

import { describe, expect, it } from "vitest";
import {
  KB,
  KB_NOT_ENCODED,
  classesOf,
  drugsInClass,
  getClass,
  getCombo,
  getDrug,
  getSource,
  kbCoverage,
  knownEffect,
  matchDrug,
  prettyName,
  searchDrugs,
  selectorMatches,
} from "./index";
import { matchDrugWithKb } from "./normalize";
import type { DrugSelector } from "./types";
import { createSeed } from "../model/seed";
import { bannedWordsIn, sentences } from "../engine/meds/text";

const METRICS = ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling", "energy", "sleep", "appetiteWorse"];

function selectors(): { where: string; sel: DrugSelector }[] {
  const out: { where: string; sel: DrugSelector }[] = [];
  for (const r of KB.beers) {
    out.push({ where: `${r.id}.appliesTo`, sel: r.appliesTo });
    if (r.with) out.push({ where: `${r.id}.with`, sel: r.with });
  }
  for (const c of KB.cascades) out.push({ where: `${c.id}.index`, sel: c.index }, { where: `${c.id}.marker`, sel: c.marker });
  for (const m of KB.monitoring) out.push({ where: m.id, sel: m.appliesTo });
  return out;
}

describe("knowledge base: referential integrity", () => {
  it("has a version and honest coverage counts", () => {
    expect(KB.version).toBe("2026.10.2");
    const c = kbCoverage();
    expect(c.drugs).toBeGreaterThanOrEqual(400);
    expect(c.combos).toBeGreaterThanOrEqual(80);
    expect(c.beersRules).toBeGreaterThanOrEqual(80);
    expect(c.beers_pim).toBeGreaterThanOrEqual(30);
    expect(c.beers_renal).toBe(24);
    expect(c.strongAnticholinergics).toBe(40);
    expect(c.cascades).toBeGreaterThanOrEqual(20);
    expect(KB.coverageNote).toMatch(/not reviewed by a licensed clinician/);
    expect(KB_NOT_ENCODED.length).toBeGreaterThan(5);
  });

  it("ids are unique within each table", () => {
    for (const list of [KB.drugs, KB.classes, KB.combos, KB.beers, KB.cascades, KB.monitoring, KB.sources] as { id: string }[][]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every class parent, drug class, combo ingredient and selector resolves", () => {
    for (const c of KB.classes) for (const p of c.parents) expect(getClass(p), `${c.id} -> ${p}`).toBeDefined();
    for (const d of KB.drugs) for (const c of d.classes) expect(getClass(c), `${d.id}: ${c}`).toBeDefined();
    for (const c of KB.combos) for (const i of c.ingredientIds) expect(getDrug(i), `${c.id}: ${i}`).toBeDefined();
    for (const { where, sel } of selectors()) {
      expect((sel.drugs?.length ?? 0) + (sel.classes?.length ?? 0), where).toBeGreaterThan(0);
      for (const d of sel.drugs ?? []) expect(getDrug(d), `${where}: ${d}`).toBeDefined();
      for (const c of sel.classes ?? []) {
        expect(getClass(c), `${where}: ${c}`).toBeDefined();
        expect(drugsInClass(c).length, `${where}: class ${c} has no members`).toBeGreaterThan(0);
      }
    }
    for (const f of KB.frids) expect(getClass(f.classId), f.classId).toBeDefined();
    for (const r of KB.beers) for (const d of ((r as { excludeDrugs?: string[] }).excludeDrugs ?? [])) expect(getDrug(d), `${r.id}: ${d}`).toBeDefined();
  });

  it("every source id resolves and every source has a citation and URL", () => {
    const used = [
      ...KB.beers.map((r) => r.sourceId),
      ...KB.cascades.map((c) => c.sourceId),
      ...KB.frids.map((f) => f.sourceId),
      ...KB.monitoring.map((m) => m.sourceId),
      KB.acbThresholds.sourceId,
    ];
    for (const id of used) expect(getSource(id), id).toBeDefined();
    for (const s of KB.sources) {
      expect(s.short.length, s.id).toBeGreaterThan(2);
      expect(s.citation.length, s.id).toBeGreaterThan(20);
      expect(s.url, s.id).toMatch(/^https:\/\//);
      if (s.doi) expect(s.doi, s.id).toMatch(/^10\.\d{4,}\//);
    }
    expect(getSource("beers2023")?.short).toBe("AGS Beers Criteria® 2023");
    expect(getSource("beers2023")?.doi).toBe("10.1111/jgs.18372");
  });

  it("no name (generic, brand, alias or combination) maps to two different meanings", () => {
    const owner = new Map<string, string>();
    const claim = (name: string, who: string) => {
      const prev = owner.get(name);
      expect(prev === undefined || prev === who, `${name}: ${prev} vs ${who}`).toBe(true);
      owner.set(name, who);
    };
    for (const d of KB.drugs) {
      claim(d.id, d.id);
      for (const b of d.brands) claim(b, d.id);
      for (const a of d.aliases) claim(a, d.id);
    }
    for (const c of KB.combos) for (const n of c.names) claim(n, `combo:${c.id}`);
  });

  it("drug fields have the documented shape", () => {
    for (const d of KB.drugs) {
      expect(d.id).toBe(d.id.toLowerCase());
      expect(d.display.length).toBeGreaterThan(1);
      for (const b of [...d.brands, ...d.aliases]) expect(b, d.id).toBe(b.toLowerCase().trim());
      expect([0, 1, 2, 3]).toContain(d.acb);
      if (d.rxcui !== null) expect(d.rxcui, d.id).toMatch(/^\d{1,8}$/);
      for (const e of d.effects) expect(METRICS).toContain(e);
      expect(d.usedFor.length, d.id).toBeGreaterThan(3);
    }
    expect(KB.drugs.filter((d) => d.rxcui).length / KB.drugs.length).toBeGreaterThan(0.9);
  });

  it("the class walker is transitive", () => {
    expect(classesOf("lorazepam")).toEqual(expect.arrayContaining(["benzodiazepine", "cns_active", "sedative_hypnotic"]));
    expect(classesOf("gabapentin")).toEqual(expect.arrayContaining(["gabapentinoid", "antiepileptic", "cns_active"]));
    expect(classesOf("amlodipine")).toEqual(expect.arrayContaining(["ccb_dihydropyridine", "ccb", "bp_lowering"]));
    expect(classesOf("metoprolol")).not.toContain("bp_lowering"); // beta-blockers are not FRIDs (de Vries 2018)
    expect(selectorMatches(["furosemide"], { classes: ["diuretic"] })).toBe(true);
    expect(selectorMatches(["acetaminophen"], { classes: ["nsaid"] })).toBe(false);
  });
});

describe("knowledge base: published values", () => {
  it("ACB 2012 scores", () => {
    const acb = (id: string) => getDrug(id)?.acb;
    expect(acb("diphenhydramine")).toBe(3);
    expect(acb("oxybutynin")).toBe(3);
    expect(acb("quetiapine")).toBe(3);
    expect(acb("paroxetine")).toBe(3);
    expect(acb("amitriptyline")).toBe(3);
    expect(acb("cyclobenzaprine")).toBe(2);
    expect(acb("carbamazepine")).toBe(2);
    expect(acb("furosemide")).toBe(1);
    expect(acb("warfarin")).toBe(1);
    expect(acb("metoprolol")).toBe(1);
    expect(acb("isosorbide mononitrate")).toBe(1);
    expect(acb("lorazepam")).toBe(0);
    expect(acb("gabapentin")).toBe(0); // reviewed and not added in the 2012 update
    expect(acb("acetaminophen")).toBe(0);
    expect(KB.acbThresholds).toEqual({ elevated: 3, high: 5, sourceId: "acb2012" });
  });

  it("Beers Table 7 strong anticholinergics carry the class", () => {
    for (const id of ["diphenhydramine", "oxybutynin", "tolterodine", "paroxetine", "amitriptyline", "promethazine", "prochlorperazine", "cyclobenzaprine", "benztropine", "hyoscyamine"]) {
      expect(getDrug(id)?.classes, id).toContain("strong_anticholinergic");
    }
    for (const id of ["sertraline", "furosemide", "quetiapine", "loratadine"]) expect(getDrug(id)?.classes, id).not.toContain("strong_anticholinergic");
  });

  it("Beers ratings and machine-checkable qualifiers", () => {
    const rule = (id: string) => {
      const r = KB.beers.find((x) => x.id === id);
      expect(r, id).toBeDefined();
      return r as (typeof KB.beers)[number] & Record<string, unknown>;
    };
    expect(rule("pim-benzodiazepine")).toMatchObject({ table: "pim", quality: "moderate", strength: "strong" });
    expect(rule("pim-ppi")).toMatchObject({ minDurationDays: 56, quality: "high" });
    expect(rule("pim-warfarin-initial").maxDaysSinceStart).toBe(90);
    expect(rule("pim-aspirin-primary-prevention").reasonKeywords).toContain("primary prevention");
    expect(rule("ddi-anticholinergic-2").minCount).toBe(2);
    expect(rule("ddi-cns-3")).toMatchObject({ minCount: 3, quality: "high" });
    expect(rule("cond-bph-men").sex).toBe("male");
    expect(rule("renal-gabapentin").crclBelow).toBe(60);
    expect(rule("caution-sglt2")).toMatchObject({ table: "caution", strength: "weak" });
    for (const r of KB.beers) {
      expect(["pim", "condition", "caution", "interaction", "renal"]).toContain(r.table);
      if (r.table === "condition") expect(r.conditions?.length, r.id).toBeGreaterThan(0);
      if (r.table === "renal") expect(typeof r.crclBelow, r.id).toBe("number");
      if (r.table === "interaction") expect(!!r.with || typeof r.minCount === "number", r.id).toBe(true);
      expect(r.sourceId, r.id).toBe("beers2023");
    }
  });

  it("FRIDs follow STEADI / STOPPFall and leave out beta-blockers", () => {
    const fridClasses = new Set(KB.frids.map((f) => f.classId));
    const isFrid = (id: string) => classesOf(id).some((c) => fridClasses.has(c));
    for (const id of ["lorazepam", "zolpidem", "quetiapine", "oxycodone", "sertraline", "gabapentin", "furosemide", "amlodipine", "doxazosin", "diphenhydramine", "oxybutynin", "isosorbide mononitrate", "clonidine"]) {
      expect(isFrid(id), id).toBe(true);
    }
    for (const id of ["metoprolol", "atorvastatin", "metformin", "omeprazole", "acetaminophen", "levothyroxine"]) expect(isFrid(id), id).toBe(false);
  });

  it("monitoring rules cover the SPEC §12 classes", () => {
    const covers = (id: string) => KB.monitoring.some((m) => selectorMatches([id], m.appliesTo));
    for (const id of ["warfarin", "apixaban", "clopidogrel", "aspirin", "insulin glargine", "glipizide", "oxycodone", "digoxin"]) expect(covers(id), id).toBe(true);
    expect(covers("metformin")).toBe(false);
  });
});

describe("knowledge base: route and dose entries", () => {
  type Variant = { of: string; words?: string[]; baseWords?: string[]; maxDoseMg?: number };
  const variants = KB.drugs.flatMap((d) => {
    const v = (d as { variant?: Variant }).variant;
    return v ? [{ d, v }] : [];
  });

  it("each refines an existing medicine and sits outside the rules its base is subject to", () => {
    expect(variants.map(({ d }) => d.id).sort()).toEqual(
      expect.arrayContaining(["atropine ophthalmic", "conjugated estrogens vaginal", "diclofenac topical", "diphenhydramine topical", "doxepin low dose", "estradiol vaginal", "hydrocortisone topical"]),
    );
    const ruleDrugs = new Set(KB.beers.flatMap((r) => [...(r.appliesTo.drugs ?? []), ...(r.with?.drugs ?? [])]));
    for (const { d, v } of variants) {
      const base = getDrug(v.of);
      expect(base, d.id).toBeDefined();
      expect(d.rxcui, d.id).toBe(base?.rxcui);
      expect(d.acb, d.id).toBe(0);
      expect(d.classes, d.id).not.toContain("strong_anticholinergic");
      expect(ruleDrugs.has(d.id), d.id).toBe(false);
    }
    for (const [id, notIn] of [
      ["diclofenac topical", "nsaid"],
      ["estradiol vaginal", "estrogen"],
      ["conjugated estrogens vaginal", "estrogen"],
      ["hydrocortisone topical", "corticosteroid_systemic"],
      ["diphenhydramine topical", "first_gen_antihistamine"],
      ["prednisolone ophthalmic", "corticosteroid_systemic"],
      ["ketorolac ophthalmic", "nsaid"],
    ] as const) {
      expect(classesOf(id), id).not.toContain(notIn);
    }
  });
});

describe("knowledge base: scope corrections from the clinical review", () => {
  const rule = (id: string) => KB.beers.find((r) => r.id === id) as (typeof KB.beers)[number] & Record<string, string[] | undefined>;

  it("Beers rows name only the medicines AGS names", () => {
    expect(rule("pim-central-alpha-agonist-bp").appliesTo.drugs).toEqual(["clonidine", "guanfacine"]); // methyldopa: Table 8
    expect(rule("pim-antipsychotic").excludeDrugs).toContain("pimavanserin");
    expect(rule("pim-amiodarone").reasonKeywords).toEqual(expect.arrayContaining(["atrial", "afib"]));
    expect(rule("pim-amiodarone").excludeReasonKeywords).toEqual(expect.arrayContaining(["heart failure", "lvh"]));
    expect(rule("caution-tmp-smx-ras").appliesTo.drugs).toContain("trimethoprim");
    expect(rule("renal-tmp-smx").appliesTo.drugs).toContain("trimethoprim");
    // "to prevent a heart attack" is primary prevention: the exclusions are history phrases only
    const ex = rule("pim-aspirin-primary-prevention").excludeReasonKeywords ?? [];
    expect(ex).not.toContain("heart attack");
    expect(ex).not.toContain("stroke");
  });

  it("cascades cite ThinkCascades only for its retained cascades", () => {
    const tc = KB.cascades.filter((c) => c.sourceId === "thinkcascades").map((c) => c.id).sort();
    expect(tc).toEqual(["alpha-blocker-dizziness-vestibular", "anticholinergic-memory-dementia-medicine", "benzodiazepine-agitation-antipsychotic", "diuretic-incontinence-bladder-medicine", "ssri-insomnia-hypnotic"]);
    expect(KB.cascades.find((c) => c.id === "amiodarone-hypothyroidism-levothyroxine")).toBeUndefined();
    for (const c of KB.cascades) if (c.sourceId === "pipc2025") expect(c.clinician, c.id).not.toMatch(/ThinkCascades/);
  });

  it("FRIDs leave out beta-3 agonists and the source register carries verified DOIs", () => {
    expect(KB.frids.map((f) => f.classId)).not.toContain("beta3_agonist");
    expect(getSource("avorn1995jama")?.doi).toBe("10.1001/jama.1995.03530220046031");
    expect(getSource("gurwitz1994")?.doi).toBe("10.1001/jama.1994.03520100043031");
  });
});

describe("knowledge base: record shapes (the JSON is cast, so check it here)", () => {
  const str = (x: unknown) => typeof x === "string" && x.length > 0;
  const strs = (x: unknown) => Array.isArray(x) && x.every((y) => typeof y === "string");
  const optStrs = (x: unknown) => x === undefined || strs(x);
  const sel = (x: unknown) => !!x && typeof x === "object" && optStrs((x as DrugSelector).drugs) && optStrs((x as DrugSelector).classes);

  it("every record has the fields and types the engine reads", () => {
    for (const d of KB.drugs) {
      expect(str(d.id) && str(d.display) && strs(d.brands) && strs(d.aliases) && strs(d.classes) && strs(d.effects) && str(d.usedFor), d.id).toBe(true);
      expect(d.rxcui === null || typeof d.rxcui === "string", d.id).toBe(true);
      expect(typeof d.otc, d.id).toBe("boolean");
    }
    for (const c of KB.combos) expect(str(c.id) && str(c.display) && strs(c.names) && strs(c.ingredientIds) && typeof c.otc === "boolean", c.id).toBe(true);
    for (const c of KB.classes) expect(str(c.id) && str(c.display) && strs(c.parents), c.id).toBe(true);
    for (const r of KB.beers) {
      const x = r as (typeof KB.beers)[number] & Record<string, unknown>;
      expect(str(r.id) && sel(r.appliesTo) && (r.with === undefined || sel(r.with)) && str(r.title) && str(r.plain) && str(r.question), r.id).toBe(true);
      for (const k of ["reasonKeywords", "excludeReasonKeywords", "excludeDrugs", "conditions"]) expect(optStrs(x[k]), `${r.id}.${k}`).toBe(true);
      for (const k of ["crclBelow", "minDurationDays", "minCount", "maxDaysSinceStart"]) expect(x[k] === undefined || typeof x[k] === "number", `${r.id}.${k}`).toBe(true);
      expect(x.sex === undefined || x.sex === "female" || x.sex === "male", r.id).toBe(true);
    }
    for (const c of KB.cascades) {
      expect(sel(c.index) && sel(c.marker) && strs(c.reasonKeywords) && str(c.adverseEffect) && str(c.sourceId), c.id).toBe(true);
      expect(c.windowDays === null || typeof c.windowDays === "number", c.id).toBe(true);
    }
    for (const m of KB.monitoring) expect(sel(m.appliesTo) && strs(m.watchFor) && strs(m.relatedConcepts), m.id).toBe(true);
    for (const f of KB.frids) expect(str(f.classId) && str(f.plain) && str(f.sourceId), f.classId).toBe(true);
  });
});

describe("knowledge base: known effects (diary links)", () => {
  it("is conservative and label-based", () => {
    expect(getDrug("lorazepam")?.effects).toEqual(["dizziness", "drowsiness", "confusion", "fall", "nearFall"]);
    expect(knownEffect(["amlodipine"], "swelling")).toBe(true);
    expect(knownEffect(["amlodipine"], "dizziness")).toBe(true);
    expect(knownEffect(["metformin"], "dizziness")).toBe(false);
    expect(knownEffect(["atorvastatin"], "dizziness")).toBe(false);
    expect(knownEffect(["acetaminophen"], "drowsiness")).toBe(false);
    expect(knownEffect(["acetaminophen", "diphenhydramine"], "drowsiness")).toBe(true);
    expect(knownEffect(["furosemide"], "fall")).toBe(true);
    expect(knownEffect(["meclizine"], "dizziness")).toBe(false); // it is taken for dizziness
    expect(knownEffect(["cyproheptadine"], "appetiteWorse")).toBe(false); // it increases appetite
    expect(knownEffect(["donepezil"], "appetiteWorse")).toBe(true);
    expect(knownEffect(["not-a-drug"], "dizziness")).toBe(false);
  });
});

describe("knowledge base: language rules (SPEC §3)", () => {
  it("no banned wording in any shipped text, and questions end with a question mark", () => {
    const texts: [string, string][] = [];
    for (const r of KB.beers) texts.push([`${r.id}.title`, r.title], [`${r.id}.plain`, r.plain], [`${r.id}.clinician`, r.clinician], [`${r.id}.question`, r.question], [`${r.id}.qualifier`, r.qualifier ?? ""]);
    for (const c of KB.cascades) texts.push([`${c.id}.title`, c.title], [`${c.id}.plain`, c.plain], [`${c.id}.clinician`, c.clinician], [`${c.id}.question`, c.question]);
    for (const m of KB.monitoring) texts.push([`${m.id}.plain`, m.plain], [`${m.id}.clinician`, m.clinician], [`${m.id}.question`, m.question], ...m.watchFor.map((w): [string, string] => [m.id, w]));
    for (const f of KB.frids) texts.push([f.classId, f.plain]);
    for (const d of KB.drugs) texts.push([d.id, d.usedFor]);
    texts.push(["coverageNote", KB.coverageNote]);
    for (const [where, t] of texts) {
      expect(bannedWordsIn(t), `${where}: ${t}`).toEqual([]);
      expect(t, where).not.toMatch(/\bcaus(e|es|ed|ing)\b/i);
    }
    for (const q of [...KB.beers.map((r) => r.question), ...KB.cascades.map((c) => c.question), ...KB.monitoring.map((m) => m.question)]) {
      expect(q.trim().endsWith("?"), q).toBe(true);
    }
  });

  it("Beers rationale is one sentence, so the finding text stays within two", () => {
    for (const r of KB.beers) expect(sentences(r.plain).length, `${r.id}: ${r.plain}`).toBe(1);
  });
});

// ------------------------------------------------------------------------------------------------
// Name matching: realistic inputs, typed the way families and pharmacy labels write them.

type Row = [input: string, match: string, ingredients: string[]];
const MATCH_TABLE: Row[] = [
  // seed medicines exactly as entered in the demo
  ["Amlodipine", "exact", ["amlodipine"]],
  ["Furosemide (Lasix)", "exact", ["furosemide"]],
  ["Metformin", "exact", ["metformin"]],
  ["Atorvastatin", "exact", ["atorvastatin"]],
  ["Omeprazole", "exact", ["omeprazole"]],
  ["Oxybutynin", "exact", ["oxybutynin"]],
  ["Tylenol PM (OTC)", "combo", ["acetaminophen", "diphenhydramine"]],
  ["Lorazepam (Ativan)", "exact", ["lorazepam"]],
  // dose, route and frequency text
  ["Lorazepam 0.5mg tab at bedtime", "exact", ["lorazepam"]],
  ["Lasix 20mg daily", "brand", ["furosemide"]],
  ["Amlodipine besylate 10 mg", "exact", ["amlodipine"]],
  ["Metoprolol succinate ER 50 mg", "exact", ["metoprolol"]],
  ["metoprolol tartrate 25mg bid", "exact", ["metoprolol"]],
  ["atorvastatin calcium 40 mg", "exact", ["atorvastatin"]],
  ["levothyroxine sodium 75mcg", "exact", ["levothyroxine"]],
  ["Eliquis 5 mg twice daily", "brand", ["apixaban"]],
  ["Lantus 20 units at night", "brand", ["insulin glargine"]],
  ["trazodone 50 mg at bedtime", "exact", ["trazodone"]],
  ["acetaminophen 650 mg q6h prn", "exact", ["acetaminophen"]],
  ["gabapentin 300mg tid", "exact", ["gabapentin"]],
  ["Lasix (furosemide) 40 mg tablet", "brand", ["furosemide"]],
  ["Motrin 600", "brand", ["ibuprofen"]],
  ["Plavix 75", "brand", ["clopidogrel"]],
  ["ATIVAN 1 MG", "brand", ["lorazepam"]],
  // brands and OTC products
  ["Ativan", "brand", ["lorazepam"]],
  ["Toprol XL", "brand", ["metoprolol"]],
  ["Lipitor", "brand", ["atorvastatin"]],
  ["Xarelto", "brand", ["rivaroxaban"]],
  ["Coumadin", "brand", ["warfarin"]],
  ["Prilosec OTC", "brand", ["omeprazole"]],
  ["Zantac 360", "brand", ["famotidine"]],
  ["ZzzQuil", "brand", ["diphenhydramine"]],
  ["Unisom", "brand", ["doxylamine"]],
  ["Unisom SleepGels", "brand", ["diphenhydramine"]],
  ["Dramamine", "brand", ["dimenhydrinate"]],
  ["Dramamine Less Drowsy", "brand", ["meclizine"]],
  ["Ozempic pen", "brand", ["semaglutide"]],
  ["Flomax 0.4 mg", "brand", ["tamsulosin"]],
  ["Detrol LA", "brand", ["tolterodine"]],
  ["Z-Pak", "brand", ["azithromycin"]],
  ["Pepto-Bismol", "brand", ["bismuth subsalicylate"]],
  ["K-Dur", "brand", ["potassium chloride"]],
  ["Centrum Silver", "brand", ["multivitamin"]],
  // aliases
  ["baby aspirin", "alias", ["aspirin"]],
  ["ASA 81", "alias", ["aspirin"]],
  ["HCTZ", "alias", ["hydrochlorothiazide"]],
  ["Vitamin D3 2000 IU", "alias", ["cholecalciferol"]],
  ["fish oil", "alias", ["omega-3 fatty acids"]],
  ["B12", "alias", ["cyanocobalamin"]],
  ["stool softener", "alias", ["docusate"]],
  ["paracetamol", "alias", ["acetaminophen"]],
  // combination products
  ["Tylenol PM extra strength", "combo", ["acetaminophen", "diphenhydramine"]],
  ["Tylenol p.m.", "combo", ["acetaminophen", "diphenhydramine"]],
  ["Advil PM", "combo", ["ibuprofen", "diphenhydramine"]],
  ["Aleve PM", "combo", ["naproxen", "diphenhydramine"]],
  ["Excedrin PM", "combo", ["acetaminophen", "diphenhydramine"]],
  ["Motrin PM", "combo", ["ibuprofen", "diphenhydramine"]],
  ["NyQuil", "combo", ["acetaminophen", "dextromethorphan", "doxylamine"]],
  ["Excedrin Migraine", "combo", ["acetaminophen", "aspirin", "caffeine"]],
  ["Norco 5/325", "combo", ["hydrocodone", "acetaminophen"]],
  ["Percocet 5/325", "combo", ["oxycodone", "acetaminophen"]],
  ["hydrocodone/acetaminophen 5-325", "combo", ["hydrocodone", "acetaminophen"]],
  ["Tylenol #3", "combo", ["acetaminophen", "codeine"]],
  ["Bactrim DS", "combo", ["sulfamethoxazole", "trimethoprim"]],
  ["Sinemet 25/100", "combo", ["carbidopa", "levodopa"]],
  ["Fioricet", "combo", ["butalbital", "acetaminophen", "caffeine"]],
  ["Hyzaar", "combo", ["losartan", "hydrochlorothiazide"]],
  ["Maxzide-25", "combo", ["triamterene", "hydrochlorothiazide"]],
  ["lisinopril/hctz 20/12.5", "combo", ["lisinopril", "hydrochlorothiazide"]],
  ["losartan and hydrochlorothiazide", "combo", ["losartan", "hydrochlorothiazide"]],
  ["lisinopril and amlodipine", "combo", ["lisinopril", "amlodipine"]],
  ["Entresto", "combo", ["sacubitril", "valsartan"]],
  // OTC products that hide a sedating antihistamine or aspirin (DailyMed SPL titles, 2026-10-11)
  ["Tylenol Simply Sleep", "brand", ["diphenhydramine"]],
  ["Unisom PM Pain", "combo", ["acetaminophen", "diphenhydramine"]],
  ["Bayer PM", "combo", ["aspirin", "diphenhydramine"]],
  ["ZzzQuil Night Pain", "combo", ["acetaminophen", "diphenhydramine"]],
  ["Advil Allergy Sinus", "combo", ["ibuprofen", "chlorpheniramine", "pseudoephedrine"]],
  ["Advil Cold & Sinus", "combo", ["ibuprofen", "pseudoephedrine"]],
  ["Advil Cold and Sinus", "combo", ["ibuprofen", "pseudoephedrine"]],
  ["Tylenol Cold + Flu Severe Night", "combo", ["acetaminophen", "dextromethorphan", "doxylamine", "phenylephrine"]],
  ["Tylenol Cold Multi-Symptom Nighttime", "combo", ["acetaminophen", "dextromethorphan", "doxylamine"]],
  ["Mucinex Nightshift", "combo", ["acetaminophen", "dextromethorphan", "triprolidine"]],
  ["Mucinex Fast-Max Night", "combo", ["acetaminophen", "dextromethorphan", "triprolidine"]],
  ["Sudafed PE Sinus + Allergy", "combo", ["phenylephrine", "chlorpheniramine"]],
  ["Coricidin HBP", "combo", ["acetaminophen", "chlorpheniramine"]],
  ["Alka-Seltzer Plus", "combo", ["aspirin", "chlorpheniramine", "phenylephrine"]],
  ["Alka-Seltzer Plus Night", "combo", ["acetaminophen", "dextromethorphan", "doxylamine", "phenylephrine"]],
  ["Theraflu Nighttime", "combo", ["acetaminophen", "diphenhydramine", "phenylephrine"]],
  ["Dimetapp", "combo", ["brompheniramine", "phenylephrine"]],
  ["Robitussin Nighttime", "combo", ["dextromethorphan", "doxylamine"]],
  ["Midol Complete", "combo", ["acetaminophen", "caffeine", "pyrilamine"]],
  ["BC Powder", "combo", ["aspirin", "caffeine"]],
  ["Goody's powder", "combo", ["acetaminophen", "aspirin", "caffeine"]],
  ["Percogesic", "combo", ["acetaminophen", "diphenhydramine"]],
  // a product line that usually adds ingredients is not guessed as its base ingredient
  ["acetaminophen PM", "none", []],
  ["Tylenol Cold & Flu Daytime Plus", "none", []],
  ["Advil Congestion Relief", "none", []],
  ["Benadryl for sleep", "brand", ["diphenhydramine"]],
  ["lorazepam for sleep", "exact", ["lorazepam"]],
  ["Claritin 24 hour allergy", "brand", ["loratadine"]],
  // route-specific entries (Beers 2023 scopes NSAIDs to oral use, estrogen to systemic use, atropine excluding the eye)
  ["Voltaren gel", "brand", ["diclofenac topical"]],
  ["Voltaren", "brand", ["diclofenac topical"]],
  ["Voltaren 75 mg tablets", "brand", ["diclofenac"]],
  ["diclofenac 1% gel", "exact", ["diclofenac topical"]],
  ["Flector patch", "brand", ["diclofenac topical"]],
  ["diclofenac sodium 75mg EC", "exact", ["diclofenac"]],
  ["Vagifem", "brand", ["estradiol vaginal"]],
  ["Estring", "brand", ["estradiol vaginal"]],
  ["estradiol cream", "exact", ["estradiol vaginal"]],
  ["Premarin vaginal cream", "brand", ["conjugated estrogens vaginal"]],
  ["Premarin 0.3 mg", "brand", ["conjugated estrogens"]],
  ["estradiol patch 0.05 mg", "exact", ["estradiol"]],
  ["estradiol gel", "exact", ["estradiol"]],
  ["atropine eye drops", "exact", ["atropine ophthalmic"]],
  ["Isopto Atropine", "brand", ["atropine ophthalmic"]],
  ["ketorolac eye drops", "exact", ["ketorolac ophthalmic"]],
  ["ketorolac 10 mg", "exact", ["ketorolac"]],
  ["Pred Forte", "brand", ["prednisolone ophthalmic"]],
  ["hydrocortisone cream 1%", "exact", ["hydrocortisone topical"]],
  ["Cortaid", "brand", ["hydrocortisone topical"]],
  ["hydrocortisone 10 mg tablets", "exact", ["hydrocortisone"]],
  ["Benadryl itch stopping cream", "brand", ["diphenhydramine topical"]],
  ["Benadryl cream", "brand", ["diphenhydramine topical"]],
  ["diphenhydramine 25 mg gel caps", "exact", ["diphenhydramine"]],
  // dose-specific entry (Beers 2023: doxepin > 6 mg/day)
  ["Silenor", "brand", ["doxepin low dose"]],
  ["doxepin 3 mg", "exact", ["doxepin low dose"]],
  ["doxepin 25 mg", "exact", ["doxepin"]],
  // older or bare brand names people still type
  ["Hytrin", "brand", ["terazosin"]],
  ["Thorazine", "brand", ["chlorpromazine"]],
  ["ProAir", "brand", ["albuterol"]],
  ["Ventolin inhaler", "brand", ["albuterol"]],
  ["Clinoril", "brand", ["sulindac"]],
  ["Breo Ellipta", "combo", ["fluticasone", "vilanterol"]],
  ["Trelegy", "combo", ["fluticasone", "umeclidinium", "vilanterol"]],
  ["Cosopt", "combo", ["dorzolamide", "timolol"]],
  ["Jalyn", "combo", ["dutasteride", "tamsulosin"]],
  ["Belsomra", "brand", ["suvorexant"]],
  ["Vitamin B-12", "alias", ["cyanocobalamin"]],
  // misspellings: suggestions only
  ["lorazapam", "fuzzy", ["lorazepam"]],
  ["metforman", "fuzzy", ["metformin"]],
  ["amlodapine", "fuzzy", ["amlodipine"]],
  ["lisinipril", "fuzzy", ["lisinopril"]],
  ["hydroclorothiazide", "fuzzy", ["hydrochlorothiazide"]],
  ["omeprazol", "fuzzy", ["omeprazole"]],
  // not in the reference set
  ["Grandma's herbal tea", "none", []],
  ["chamomile tea", "none", []],
  ["CBD gummies", "none", []],
  ["XYZ-123", "none", []],
  ["my water pill", "none", []],
  ["", "none", []],
];

describe("matchDrug", () => {
  it(`resolves ${MATCH_TABLE.length} realistic inputs`, () => {
    expect(MATCH_TABLE.length).toBeGreaterThanOrEqual(60);
    for (const [input, match, ingredients] of MATCH_TABLE) {
      const m = matchDrug(input);
      expect({ input, match: m.match, ids: [...m.ingredientIds].sort() }).toEqual({ input, match, ids: [...ingredients].sort() });
    }
  });

  it("a separately entered strength selects a dose-specific entry", () => {
    expect(matchDrug("doxepin", "3 mg").ingredientIds).toEqual(["doxepin low dose"]);
    expect(matchDrug("doxepin", "10 mg").ingredientIds).toEqual(["doxepin"]);
    expect(matchDrug("doxepin").ingredientIds).toEqual(["doxepin"]);
  });

  it("fuzzy suggestions keep the first letter and the vitamin letter", () => {
    const tiny = { ...KB, drugs: KB.drugs.filter((d) => ["lorazepam", "ascorbic acid"].includes(d.id)), combos: [] };
    expect(matchDrugWithKb(tiny, "lorazepan")).toMatchObject({ match: "fuzzy", suggestion: "Lorazepam" });
    expect(matchDrugWithKb(tiny, "korazepam").match).toBe("none");
    expect(matchDrugWithKb(tiny, "vitamin e").match).toBe("none"); // not "Vitamin C?"
    expect(matchDrug("Vitamin B-13").suggestion ?? "").not.toMatch(/Vitamin C/);
    expect(matchDrug("Cortaid").ingredientIds).toEqual(["hydrocortisone topical"]); // was a "Nadolol?" suggestion
  });

  it("fuzzy matches are suggestions with a display name; exact ones are not", () => {
    expect(matchDrug("lorazapam").suggestion).toBe("Lorazepam");
    expect(matchDrug("Lorazepam").suggestion).toBeNull();
    expect(matchDrug("Lorazepam 0.5mg tab at bedtime").normalized).toBe("lorazepam");
    expect(matchDrug("Tylenol PM (OTC)").normalized).toBe("tylenol pm");
  });

  it("every seed medicine resolves to the seed's ingredients", () => {
    const seed = createSeed("2026-10-10");
    for (const m of seed.medications) {
      expect([...matchDrug(m.name).ingredientIds].sort(), m.name).toEqual([...m.ingredientIds].sort());
      for (const id of m.ingredientIds) expect(getDrug(id), id).toBeDefined();
    }
  });

  it("works against a fixture KB too", () => {
    const tiny = { ...KB, drugs: KB.drugs.filter((d) => d.id === "lorazepam"), combos: [] };
    expect(matchDrugWithKb(tiny, "Ativan").ingredientIds).toEqual(["lorazepam"]);
    expect(matchDrugWithKb(tiny, "Lasix").match).toBe("none");
  });
});

describe("searchDrugs", () => {
  it("ranks exact and prefix matches first, with readable brand → generic details", () => {
    const ati = searchDrugs("ati");
    expect(ati[0]).toMatchObject({ label: "Ativan", kind: "brand", detail: "Ativan → lorazepam", ingredientIds: ["lorazepam"] });
    const lasix = searchDrugs("lasix");
    expect(lasix[0]).toMatchObject({ label: "Lasix", kind: "brand", ingredientIds: ["furosemide"] });
    const lor = searchDrugs("loraz");
    expect(lor[0]).toMatchObject({ label: "Lorazepam", kind: "drug" });
  });

  it("finds combination products and shows their ingredients", () => {
    const hits = searchDrugs("tylenol pm");
    expect(hits[0]).toMatchObject({ label: "Tylenol PM", kind: "combo", detail: "Tylenol PM → acetaminophen + diphenhydramine" });
    expect(searchDrugs("tylenol").map((h) => h.label)).toContain("Tylenol PM");
    expect(searchDrugs("norco")[0]).toMatchObject({ label: "Norco", ingredientIds: ["hydrocodone", "acetaminophen"] });
  });

  it("labels re-match to the same ingredients when picked", () => {
    for (const q of ["ati", "tylenol", "amlo", "hydro", "metop", "pm", "nor", "insulin", "aspirin"]) {
      for (const h of searchDrugs(q)) {
        const m = matchDrug(h.label);
        expect([...m.ingredientIds].sort(), `${q} -> ${h.label}`).toEqual([...h.ingredientIds].sort());
      }
    }
  });

  it("dedupes, respects the limit, and offers a close spelling when nothing matches", () => {
    const hits = searchDrugs("tylenol", 8);
    expect(hits.length).toBeLessThanOrEqual(8);
    expect(new Set(hits.map((h) => h.label.toLowerCase())).size).toBe(hits.length);
    expect(searchDrugs("")).toEqual([]);
    expect(searchDrugs("lorazapam")[0]).toMatchObject({ label: "Lorazepam", detail: "Did you mean Lorazepam?" });
    expect(searchDrugs("zzzzqqq")).toEqual([]);
  });

  it("prettyName keeps packaging capitals", () => {
    expect(prettyName("toprol xl")).toBe("Toprol XL");
    expect(prettyName("claritin-d")).toBe("Claritin-D");
    expect(prettyName("diovan hct")).toBe("Diovan HCT");
    expect(prettyName("doan's pm")).toBe("Doan's PM");
  });

  it("getCombo returns combination products by id", () => {
    expect(getCombo("tylenol pm")?.ingredientIds).toEqual(["acetaminophen", "diphenhydramine"]);
  });
});
