// Knowledge-base contracts. The JSON files in src/kb/data/ are compiled from the verified research
// in docs/CLINICAL-SOURCES.md. Rationale text is paraphrased; drug names, classes, scores and
// recommendation categories are recorded as published.

import type { ConditionTag, MetricKey } from "../model/types";

export interface KbSource {
  id: string; // e.g. "beers2023"
  short: string; // e.g. "AGS Beers Criteria® 2023"
  citation: string; // full citation
  url: string;
  doi: string | null;
  year: number;
  usedFor: string;
}

export interface KbClass {
  id: string; // e.g. "benzodiazepine"
  display: string; // e.g. "Benzodiazepine (sedative)"
  /** Parent/umbrella classes, e.g. benzodiazepine -> ["cns_active", "sedative_hypnotic"] */
  parents: string[];
}

export interface KbDrug {
  id: string; // lowercase generic, e.g. "lorazepam"
  display: string; // "Lorazepam"
  brands: string[]; // lowercase brand names, e.g. ["ativan"]
  aliases: string[]; // lowercase alternate spellings / common names, e.g. ["water pill"] only if unambiguous
  classes: string[]; // KbClass ids
  rxcui: string | null; // RxNorm ingredient RxCUI when verified
  otc: boolean; // commonly available over the counter in the US
  /** Anticholinergic Cognitive Burden score (0 if not on the ACB list). */
  acb: 0 | 1 | 2 | 3;
  /** Diary metrics that are recognised adverse effects (label / reviews), used for "known effect" links. */
  effects: MetricKey[];
  /** One plain-language line: what it is commonly used for. */
  usedFor: string;
}

export interface KbCombo {
  id: string; // e.g. "tylenol pm"
  display: string;
  names: string[]; // lowercase names that resolve to this combo
  ingredientIds: string[];
  otc: boolean;
}

/** Selector: matches a medication if any ingredient id is listed, or any ingredient has one of the classes. */
export interface DrugSelector {
  drugs?: string[];
  classes?: string[];
}

export interface BeersRule {
  id: string;
  table: "pim" | "condition" | "caution" | "interaction" | "renal" | "anticholinergic";
  appliesTo: DrugSelector;
  /** For "interaction": the second drug/class that must also be present. */
  with?: DrugSelector;
  /** For "condition": condition tags that activate the rule. */
  conditions?: ConditionTag[];
  /** For "renal": CrCl threshold (mL/min) below which the rule applies. */
  crclBelow?: number;
  /** Extra applicability constraints in words, shown to users (e.g. "for more than 8 weeks"). */
  qualifier: string | null;
  /** Machine-checkable qualifiers. */
  minDurationDays?: number;
  minCount?: number; // e.g. ">=3 CNS-active drugs"
  title: string;
  plain: string;
  clinician: string;
  question: string;
  recommendation: string; // e.g. "Avoid", "Use with caution", "Avoid; reduce dose if CrCl < 30"
  quality: "high" | "moderate" | "low" | null;
  strength: "strong" | "weak" | null;
  sourceId: string;
}

export interface CascadeRule {
  id: string;
  index: DrugSelector;
  adverseEffect: string; // e.g. "ankle swelling (peripheral edema)"
  /** Words in the marker medication's "reason" field that suggest it was started for the adverse effect. */
  reasonKeywords: string[];
  marker: DrugSelector;
  /** Marker must start after the index; within this many days if stated by the source (else null = any time after). */
  windowDays: number | null;
  title: string;
  plain: string;
  clinician: string;
  question: string;
  sourceId: string;
}

export interface FridClass {
  classId: string;
  display: string;
  plain: string;
  sourceId: string;
}

/** High-ADE-risk classes (Budnitz 2021: anticoagulants, diabetes agents, opioids, antiplatelets) and what families can watch for. */
export interface MonitoringRule {
  id: string;
  appliesTo: DrugSelector;
  title: string; // e.g. "Blood thinner: watch for bleeding"
  watchFor: string[]; // plain phrases, e.g. ["unusual bruising", "black or tarry stools", "blood in urine"]
  /** Diary concepts that correspond to the watch-list (for linking recorded symptoms). */
  relatedConcepts: string[]; // MetricKey or ConceptId values
  plain: string;
  clinician: string;
  question: string;
  sourceId: string;
}

export interface KnowledgeBase {
  version: string; // e.g. "2026.10.1"
  sources: KbSource[];
  classes: KbClass[];
  drugs: KbDrug[];
  combos: KbCombo[];
  beers: BeersRule[];
  cascades: CascadeRule[];
  frids: FridClass[];
  monitoring: MonitoringRule[];
  acbThresholds: { elevated: number; high: number; sourceId: string };
  coverageNote: string;
}

export interface DrugMatch {
  ingredientIds: string[];
  match: "exact" | "brand" | "alias" | "combo" | "fuzzy" | "none";
  /** For fuzzy matches: the KB display name to confirm with the user. */
  suggestion: string | null;
  /** Normalised query used for matching (after stripping dose text etc.). */
  normalized: string;
}
