// AGS Beers Criteria® 2023 rules from the KB: Table 2 (pim), Table 3 (condition), Table 4 (caution),
// Table 5 (interaction, incl. ">= N drugs of a kind" rules), Table 6 (renal).
//
// Wording depends on the Beers category (fact-checker guidance): "generally avoid" (Table 2) vs "use with
// caution" (Table 4) vs "best avoided in people with <condition>" (Table 3, only when the condition is present)
// vs combinations (Table 5) vs kidney function (Table 6, only when CrCl is known; otherwise one notice).
//
// Machine-checkable qualifiers. src/kb/types.ts defines `minDurationDays` and `minCount`. Some criteria also
// depend on why or how recently a medicine was started; the KB may carry these optional fields, all read here:
//   reasonKeywords / requireReasonKeywords      applies only when the "reason" mentions one of the words
//                                              (a blank reason is treated as "unknown" and the rule applies,
//                                              with the qualifier shown in the text: the conservative reading)
//   excludeReasonKeywords / exceptReasonKeywords does not apply when the reason mentions one of the words
//   maxDaysSinceStart / startedWithinDays      "avoid starting": applies only to starts within N days
//   excludeDrugs / exceptDrugs                 ingredient ids that the class-level selector must not match
//   sex                                        "female" | "male": skipped when the profile records the other sex
//   crclBelow on a non-renal rule              the rule applies only when CrCl is known and below the threshold,
//                                              unless another qualifier on the same rule (duration) is met

import type { BeersRule, DrugSelector } from "../../../kb/types";
import type { Medication } from "../../../model/types";
import type { Draft, MedInfo, ReviewContext } from "../context";
import { ingredientName, namePart } from "../context";
import {
  CONDITION_PHRASE,
  capitalize,
  fill,
  firstSentences,
  guardLanguage,
  listJoin,
  period,
  possessive,
  shortDate,
  tidy,
} from "../text";

/** Optional qualifier fields a KB rule may carry beyond the typed contract. */
export interface RuleExtras {
  reasonKeywords?: string[];
  requireReasonKeywords?: string[];
  excludeReasonKeywords?: string[];
  exceptReasonKeywords?: string[];
  maxDaysSinceStart?: number;
  startedWithinDays?: number;
  excludeDrugs?: string[];
  exceptDrugs?: string[];
  sex?: "female" | "male" | null;
}

type Rule = BeersRule & RuleExtras;

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function ruleExtras(rule: BeersRule): {
  reasonAny: string[];
  reasonNone: string[];
  maxDaysSinceStart: number | null;
  excludeDrugs: string[];
  sex: "female" | "male" | null;
} {
  const r = rule as Rule;
  const sex = r.sex === "female" || r.sex === "male" ? r.sex : null;
  return {
    reasonAny: [...strs(r.reasonKeywords), ...strs(r.requireReasonKeywords)],
    reasonNone: [...strs(r.excludeReasonKeywords), ...strs(r.exceptReasonKeywords)],
    maxDaysSinceStart: num(r.maxDaysSinceStart) ?? num(r.startedWithinDays),
    excludeDrugs: [...strs(r.excludeDrugs), ...strs(r.exceptDrugs)],
    sex,
  };
}

/** Lower-case words of a reason text, for keyword matching at word starts ("swell" matches "swollen"? no; "swelling" yes). */
function normalizeText(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** True when `text` contains `keyword` starting at a word boundary (keyword may be a stem: "nause" ⊂ "nauseous"). */
export function mentions(text: string, keywords: readonly string[]): boolean {
  const t = normalizeText(text);
  if (t.trim() === "") return false;
  return keywords.some((k) => {
    const kw = normalizeText(k).trim();
    return kw !== "" && t.includes(` ${kw}`);
  });
}

function isBlank(s: string | null | undefined): boolean {
  return !s || s.trim() === "";
}

/** Profile sex excludes the rule (a women-only row for a man, or the reverse)? Unknown sex never excludes. */
function sexExcluded(ctx: ReviewContext, rule: BeersRule): boolean {
  const sex = ruleExtras(rule).sex;
  return !!sex && (ctx.profile.sex === "female" || ctx.profile.sex === "male") && ctx.profile.sex !== sex;
}

/**
 * Context gate for rules outside Table 3 that carry `conditions` and/or `crclBelow` (e.g. the Table 5 RAS row,
 * "CKD stage 3a or worse"): applies when one of the conditions is in effect or CrCl is known and below the
 * threshold. Rules with neither field always pass.
 */
function contextGate(ctx: ReviewContext, rule: BeersRule): boolean {
  const conds = rule.conditions ?? [];
  const t = num(rule.crclBelow);
  if (!conds.length && t === null) return true;
  const crcl = ctx.profile.crclMlMin;
  const kidneyMet = t !== null && typeof crcl === "number" && crcl > 0 && crcl < t;
  return conds.some((c) => ctx.conditions.has(c)) || kidneyMet;
}

/** "AGS Beers 2023 · strong recommendation · moderate-quality evidence" (null parts omitted). */
export function evidenceGrade(ctx: ReviewContext, rule: BeersRule): string {
  const short = ctx.ix.source(rule.sourceId)?.short ?? "AGS Beers 2023";
  const parts = [short];
  if (rule.strength) parts.push(`${rule.strength} recommendation`);
  if (rule.quality) parts.push(`${rule.quality}-quality evidence`);
  return parts.join(" · ");
}

/** Ingredient ids of `m` matched by the selector, minus explicit exclusions. */
function matchedIngredients(ctx: ReviewContext, m: MedInfo, sel: DrugSelector | undefined, exclude: string[]): string[] {
  return ctx.ix.matching(m.ingredients, sel).filter((id) => !exclude.includes(id));
}

/** A short qualifier phrase from KB words ("for more than 8 weeks"); long or sentence-like text is not inlined. */
function inlineQualifier(q: string | null): string {
  if (!q) return "";
  const t = q.trim().replace(/[.;]+$/, "");
  if (!t || t.length > 90 || /[.;]/.test(t) || /^[A-Z]/.test(t)) return "";
  return ` ${t}`;
}

function kbVars(ctx: ReviewContext, m: MedInfo | null, extra: Record<string, string> = {}): Record<string, string> {
  return {
    med: m?.name ?? "",
    name: ctx.person,
    person: ctx.person,
    date: m ? shortDate(m.med.startDate) : "",
    startDate: m ? shortDate(m.med.startDate) : "",
    days: m ? String(Math.max(0, m.daysOn)) : "",
    reason: m?.med.reason?.trim() ?? "",
    ...extra,
  };
}

/** KB rationale text (filled, guarded), limited to `n` sentences, without sentences that repeat the lead's framing. */
function kbText(text: string | null | undefined, vars: Record<string, string>, n: number, dropBeersFraming: boolean): string {
  const filled = guardLanguage(fill(text ?? "", vars));
  const kept = dropBeersFraming
    ? firstSentences(filled, 4)
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !/\bBeers\b/i.test(s) && !/^(avoid|use with caution)\b/i.test(s.trim()))
        .join(" ")
    : filled;
  return firstSentences(kept, n);
}

function joinPlain(lead: string, rest: string): string {
  return tidy([period(lead), rest ? period(rest) : ""].filter(Boolean).join(" "));
}

function question(text: string | null | undefined, vars: Record<string, string>, fallback: string): string {
  const q = guardLanguage(fill(text ?? "", vars)).trim();
  return q ? q : fallback;
}

/** Does the reason qualify? Returns null when the rule does not apply, else a note for the text ("" = none). */
function reasonCheck(med: Medication, reasonAny: string[], reasonNone: string[]): string | null {
  if (reasonNone.length && !isBlank(med.reason) && mentions(med.reason, reasonNone)) return null;
  if (reasonAny.length) {
    if (isBlank(med.reason)) return "unknown"; // conservative: apply, and say it depends on the reason
    if (!mentions(med.reason, reasonAny)) return null;
  }
  return "";
}

// ---------------------------------------------------------------------------------------------
// Single-medicine tables: pim (beers_avoid), caution (beers_caution), condition (beers_condition), renal

interface SingleHit {
  rule: BeersRule;
  m: MedInfo;
  ingredients: string[];
  reasonUnknown: boolean;
}

function singleHits(ctx: ReviewContext, rule: BeersRule): SingleHit[] {
  const ex = ruleExtras(rule);
  if (sexExcluded(ctx, rule)) return [];
  if ((rule.table === "pim" || rule.table === "caution") && (rule.conditions ?? []).length && !(rule.conditions ?? []).some((c) => ctx.conditions.has(c))) return [];
  const out: SingleHit[] = [];
  for (const m of ctx.meds) {
    const ingredients = matchedIngredients(ctx, m, rule.appliesTo, ex.excludeDrugs);
    if (ingredients.length === 0) continue;
    const r = reasonCheck(m.med, ex.reasonAny, ex.reasonNone);
    if (r === null) continue;
    if (ex.maxDaysSinceStart !== null && m.daysOn > ex.maxDaysSinceStart) continue;
    const minDur = num(rule.minDurationDays);
    const durationMet = minDur === null || m.daysOn >= minDur;
    if (rule.table !== "renal" && num(rule.crclBelow) !== null) {
      // e.g. nitrofurantoin: "CrCl < 30 OR long-term use" - applies when either part is known to be met.
      const crcl = ctx.profile.crclMlMin;
      const kidneyMet = typeof crcl === "number" && crcl < (rule.crclBelow as number);
      const durationGiven = minDur !== null;
      if (!(kidneyMet || (durationGiven && durationMet))) continue;
    } else if (!durationMet) continue;
    out.push({ rule, m, ingredients, reasonUnknown: r === "unknown" });
  }
  return out;
}

function recommendationVerb(rule: BeersRule): "avoid" | "caution" {
  const r = (rule.recommendation ?? "").toLowerCase();
  if (rule.table === "caution") return "caution";
  if (/caution/.test(r) && !/\bavoid\b/.test(r)) return "caution";
  return "avoid";
}

function avoidOrCautionDraft(ctx: ReviewContext, h: SingleHit): Draft {
  const { rule, m } = h;
  const subject = namePart(ctx, m, h.ingredients);
  const q = inlineQualifier(rule.qualifier);
  const ex = ruleExtras(rule);
  let lead: string;
  if (rule.table === "caution" || recommendationVerb(rule) === "caution") {
    lead = `AGS Beers 2023 lists ${subject} as a medicine to use with caution in older adults${q}`;
  } else if (ex.maxDaysSinceStart !== null) {
    lead = `${capitalize(subject)} was started on ${shortDate(m.med.startDate)}; AGS Beers 2023 lists starting it${q} as something older adults should generally avoid`;
  } else {
    lead = `AGS Beers 2023 lists ${subject} as a medicine older adults should generally avoid${q}`;
  }
  if (h.reasonUnknown) lead += " (this depends on why it is taken, which is not recorded)";
  const vars = kbVars(ctx, m);
  const plain = joinPlain(lead, kbText(rule.plain, vars, 1, true));
  const clinician = kbText(rule.clinician, vars, 2, false) || `${rule.recommendation}${rule.qualifier ? ` (${rule.qualifier})` : ""}.`;
  return {
    ruleId: rule.id,
    category: rule.table === "caution" || recommendationVerb(rule) === "caution" ? "beers_caution" : "beers_avoid",
    medIds: [m.med.id],
    title: guardLanguage(fill(rule.title, vars)) || `${m.name}: AGS Beers 2023`,
    plain,
    clinician: period(clinician),
    question: question(rule.question, vars, `Is ${m.name} still the best choice for ${ctx.person}?`),
    sourceIds: [rule.sourceId],
    evidenceGrade: evidenceGrade(ctx, rule),
    symptomQuestion: true,
  };
}

function conditionDraft(ctx: ReviewContext, h: SingleHit, tag: NonNullable<BeersRule["conditions"]>[number]): Draft {
  const { rule, m } = h;
  const subject = namePart(ctx, m, h.ingredients);
  const from = ctx.conditions.get(tag);
  let provenance = "";
  if (from === "diary" && tag === "history_of_falls") {
    const last = [...ctx.diary.fallDates].sort().pop();
    provenance = last ? ` (the diary recorded a fall, most recently on ${shortDate(last)})` : "";
  }
  const verb = recommendationVerb(rule) === "caution" ? "as a medicine to use with caution" : "as best avoided";
  const lead = `AGS Beers 2023 lists ${subject} ${verb} in people with ${CONDITION_PHRASE[tag]}${provenance}`;
  const vars = kbVars(ctx, m, { condition: CONDITION_PHRASE[tag] });
  const plain = joinPlain(lead, kbText(rule.plain, vars, 1, true));
  return {
    ruleId: rule.id,
    category: "beers_condition",
    medIds: [m.med.id],
    title: guardLanguage(fill(rule.title, vars)) || `${m.name} with ${CONDITION_PHRASE[tag]}`,
    plain,
    clinician: period(kbText(rule.clinician, vars, 2, false) || `${rule.recommendation} in ${CONDITION_PHRASE[tag]}.`),
    question: question(rule.question, vars, `With ${possessive(ctx.person)} ${CONDITION_PHRASE[tag]}, is ${m.name} still the best choice?`),
    sourceIds: [rule.sourceId],
    evidenceGrade: evidenceGrade(ctx, rule),
    symptomQuestion: true,
  };
}

function renalDraft(ctx: ReviewContext, h: SingleHit, crcl: number): Draft {
  const { rule, m } = h;
  const subject = namePart(ctx, m, h.ingredients);
  const threshold = rule.crclBelow as number;
  const lead = `AGS Beers 2023 has a kidney-function criterion for ${subject} when creatinine clearance is below ${threshold} mL/min; ${possessive(ctx.person)} recorded value is ${crcl} mL/min`;
  const vars = kbVars(ctx, m, { crcl: String(crcl), threshold: String(threshold) });
  return {
    ruleId: rule.id,
    category: "beers_renal",
    medIds: [m.med.id],
    title: guardLanguage(fill(rule.title, vars)) || `${m.name} and kidney function`,
    plain: joinPlain(lead, kbText(rule.plain, vars, 1, true)),
    clinician: period(
      tidy(`CrCl ${crcl} mL/min (threshold < ${threshold}). ${kbText(rule.clinician, vars, 1, false) || rule.recommendation}`),
    ),
    question: question(rule.question, vars, `With a creatinine clearance of ${crcl} mL/min, is the dose of ${m.name} right?`),
    sourceIds: [rule.sourceId],
    evidenceGrade: evidenceGrade(ctx, rule),
    symptomQuestion: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Table 5: pairs ("X with Y") and ">= N of a kind" rules

const GROUP_NOUN: Record<string, string> = {
  cns_active: "medicines that act on the brain (CNS-active)",
  strong_anticholinergic: "medicines with strong anticholinergic effects",
  anticholinergic: "medicines with strong anticholinergic effects",
};

function groupNoun(ctx: ReviewContext, sel: DrugSelector): string {
  for (const c of sel.classes ?? []) if (GROUP_NOUN[c]) return GROUP_NOUN[c];
  const c = sel.classes?.[0];
  const display = c ? ctx.ix.classInfo(c)?.display : undefined;
  return display ? `medicines of this kind (${display.replace(/\s*\(.*\)\s*$/, "").toLowerCase()})` : "medicines of this kind";
}

export function isCnsCountRule(rule: BeersRule): boolean {
  return num(rule.minCount) !== null && (rule.appliesTo.classes ?? []).includes("cns_active");
}

/**
 * Names for a ">= N of a kind" count, grouped by ingredient so the list matches the count: two products that share
 * diphenhydramine read "diphenhydramine (in Advil PM and Tylenol PM (OTC))", not two separate entries.
 */
function countNames(ctx: ReviewContext, involved: { m: MedInfo; ingredients: string[] }[]): string {
  const groups: { meds: MedInfo[]; ingredients: string[] }[] = [];
  const productsOf = new Map<string, MedInfo[]>();
  for (const x of involved) for (const i of x.ingredients) productsOf.set(i, [...(productsOf.get(i) ?? []), x.m]);
  for (const [ing, meds] of productsOf) {
    const key = meds.map((m) => m.med.id).join("|");
    const g = groups.find((x) => x.meds.map((m) => m.med.id).join("|") === key);
    if (g) g.ingredients.push(ing);
    else groups.push({ meds, ingredients: [ing] });
  }
  return listJoin(
    groups.map((g) => {
      if (g.meds.length === 1) return namePart(ctx, g.meds[0], g.ingredients);
      const ings = g.ingredients.map((id) => ingredientName(ctx, id).toLowerCase());
      return `${listJoin(ings)} (in ${listJoin(g.meds.map((m) => m.name))})`;
    }),
  );
}

function countDraft(ctx: ReviewContext, rule: BeersRule): Draft | null {
  if (sexExcluded(ctx, rule) || !contextGate(ctx, rule)) return null;
  const minCount = num(rule.minCount) as number;
  const ex = ruleExtras(rule);
  const involved: { m: MedInfo; ingredients: string[] }[] = [];
  const distinct = new Set<string>();
  for (const m of ctx.meds) {
    const ingredients = matchedIngredients(ctx, m, rule.appliesTo, ex.excludeDrugs);
    if (!ingredients.length) continue;
    involved.push({ m, ingredients });
    for (const i of ingredients) distinct.add(i);
  }
  if (distinct.size < minCount) return null;
  const cns = isCnsCountRule(rule);
  const noun = groupNoun(ctx, rule.appliesTo);
  const names = countNames(ctx, involved);
  const lead = `AGS Beers 2023 lists taking ${minCount} or more ${noun} together as a combination older adults should generally avoid; ${ctx.person} takes ${distinct.size}: ${names}`;
  const vars = kbVars(ctx, null, { meds: names, count: String(distinct.size), list: names });
  return {
    ruleId: rule.id,
    category: cns ? "cns_active_combo" : "beers_interaction",
    medIds: involved.map((x) => x.m.med.id),
    title: guardLanguage(fill(rule.title, vars)) || (cns ? `${distinct.size} brain-active medicines together` : `${distinct.size} ${noun} together`),
    plain: joinPlain(lead, kbText(rule.plain, vars, 1, true)),
    clinician: period(kbText(rule.clinician, vars, 2, false) || `${rule.recommendation}.`),
    question: question(rule.question, vars, `Are all ${distinct.size} of these medicines still needed together?`),
    sourceIds: [rule.sourceId],
    evidenceGrade: evidenceGrade(ctx, rule),
    signature: `count:${[...(rule.appliesTo.classes ?? [])].sort().join(",")}|${[...(rule.appliesTo.drugs ?? [])].sort().join(",")}`,
    priority: 0,
  };
}

function pairDrafts(ctx: ReviewContext, rule: BeersRule): Draft[] {
  if (!rule.with || sexExcluded(ctx, rule) || !contextGate(ctx, rule)) return [];
  const ex = ruleExtras(rule);
  const seen = new Set<string>();
  const out: Draft[] = [];
  for (const a of ctx.meds) {
    const ia = matchedIngredients(ctx, a, rule.appliesTo, ex.excludeDrugs);
    if (!ia.length) continue;
    for (const b of ctx.meds) {
      if (b.med.id === a.med.id) continue;
      const ib = matchedIngredients(ctx, b, rule.with, ex.excludeDrugs);
      if (!ib.length) continue;
      // The same single drug on both sides (two products of one ingredient) is a duplicate, not a combination.
      if (new Set([...ia, ...ib]).size < 2) continue;
      const pairKey = [a.med.id, b.med.id].sort().join("|");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const minDur = num(rule.minDurationDays);
      if (minDur !== null && Math.min(a.daysOn, b.daysOn) < minDur) continue;
      const an = namePart(ctx, a, ia);
      const bn = namePart(ctx, b, ib);
      const verb = recommendationVerb(rule) === "caution" ? "a combination to use with caution" : "a combination older adults should generally avoid";
      const lead = `AGS Beers 2023 lists taking ${an} together with ${bn} as ${verb}`;
      const vars = kbVars(ctx, a, { med: a.name, med1: a.name, med2: b.name, other: b.name, with: b.name });
      const sameSelector = JSON.stringify(normSel(rule.appliesTo)) === JSON.stringify(normSel(rule.with));
      out.push({
        ruleId: rule.id,
        category: "beers_interaction",
        medIds: [a.med.id, b.med.id],
        title: guardLanguage(fill(rule.title, vars)) || `${a.name} with ${b.name}`,
        plain: joinPlain(lead, kbText(rule.plain, vars, 1, true)),
        clinician: period(kbText(rule.clinician, vars, 2, false) || `${rule.recommendation}.`),
        question: question(rule.question, vars, `Is taking ${a.name} and ${b.name} together the best option for ${ctx.person}?`),
        sourceIds: [rule.sourceId],
        evidenceGrade: evidenceGrade(ctx, rule),
        // A pair rule whose two sides are the same group (e.g. "anticholinergic + anticholinergic") overlaps
        // with the ">= 2 of the group" rule; the dedupe step keeps one finding.
        signature: sameSelector ? `count:${[...(rule.appliesTo.classes ?? [])].sort().join(",")}|${[...(rule.appliesTo.drugs ?? [])].sort().join(",")}` : undefined,
        priority: 1,
      });
    }
  }
  return out;
}

function normSel(s: DrugSelector): { d: string[]; c: string[] } {
  return { d: [...(s.drugs ?? [])].sort(), c: [...(s.classes ?? [])].sort() };
}

// ---------------------------------------------------------------------------------------------

export interface BeersResult {
  drafts: Draft[];
  /** Active medicines with a Table 6 (renal) criterion that could not be checked because CrCl is unknown. */
  renalUnchecked: MedInfo[];
}

export function beersFindings(ctx: ReviewContext): BeersResult {
  const drafts: Draft[] = [];
  const renalUnchecked: MedInfo[] = [];
  if (!ctx.beers) return { drafts, renalUnchecked };
  const crcl = ctx.profile.crclMlMin;
  const crclKnown = typeof crcl === "number" && Number.isFinite(crcl) && crcl > 0;

  for (const rule of ctx.ix.kb.beers ?? []) {
    if (!rule || !rule.appliesTo) continue;
    switch (rule.table) {
      case "pim":
      case "caution":
        for (const h of singleHits(ctx, rule)) drafts.push(avoidOrCautionDraft(ctx, h));
        break;
      case "condition": {
        const tag = (rule.conditions ?? []).find((c) => ctx.conditions.has(c));
        if (!tag) break;
        for (const h of singleHits(ctx, rule)) drafts.push(conditionDraft(ctx, h, tag));
        break;
      }
      case "renal": {
        const threshold = num(rule.crclBelow);
        if (threshold === null) break;
        const hits = singleHits(ctx, rule);
        if (!crclKnown) {
          for (const h of hits) if (!renalUnchecked.includes(h.m)) renalUnchecked.push(h.m);
          break;
        }
        if ((crcl as number) >= threshold) break;
        for (const h of hits) drafts.push(renalDraft(ctx, h, crcl as number));
        break;
      }
      case "interaction":
      case "anticholinergic": {
        if (num(rule.minCount) !== null) {
          const d = countDraft(ctx, rule);
          if (d) drafts.push(d);
        } else if (rule.with) {
          drafts.push(...pairDrafts(ctx, rule));
        }
        // A Table 7 listing without a count or partner adds nothing beyond the ACB finding and Table 2/3 rules.
        break;
      }
      default:
        break;
    }
  }
  return { drafts, renalUnchecked };
}
