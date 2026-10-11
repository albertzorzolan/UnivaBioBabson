// Shared state for one review run, and the draft-finding shape the rule modules produce.

import type {
  CheckIn,
  ConditionTag,
  FindingCategory,
  ISODate,
  Medication,
  MetricKey,
  PatientProfile,
  Signal,
} from "../../model/types";
import type { KnowledgeBase } from "../../kb/types";
import { daysBetween } from "../../model/dates";
import { diaryFacts, type DiaryFacts } from "./diary";
import { indexKb, type KbIndex } from "./kbIndex";
import { medName, personName } from "./text";

export interface ReviewInput {
  meds: Medication[];
  profile: PatientProfile;
  checkIns: CheckIn[];
  today: ISODate;
  signals?: Signal[];
}

/** AGS Beers Criteria apply to adults aged 65 and older. */
export const BEERS_MIN_AGE = 65;
/** A stopped medicine can still be the "index" of a prescribing cascade for this many days after its end date. */
export const CASCADE_STOPPED_INDEX_DAYS = 180;

export interface MedInfo {
  med: Medication;
  /** Ingredient ids that exist in the KB (others are ignored; a medicine with none is "unmatched"). */
  ingredients: string[];
  /** Name as entered, made safe for sentences. */
  name: string;
  /** Whole days since the start date (0 = started today; negative = future start). */
  daysOn: number;
}

export interface ReviewContext {
  ix: KbIndex;
  today: ISODate;
  profile: PatientProfile;
  /** "Margaret" (preferred name) or "this person". */
  person: string;
  /** Active medicines with at least one KB ingredient, in a stable order (see sortMeds). */
  meds: MedInfo[];
  /** Medicines stopped within CASCADE_STOPPED_INDEX_DAYS (matched only). */
  recentlyStopped: MedInfo[];
  conditions: Map<ConditionTag, "profile" | "diary">;
  diary: DiaryFacts;
  /** false when age < 65: Beers-based categories are skipped. */
  beers: boolean;
  signals: Signal[];
}

/** A finding before relatedSymptoms, signalIds, dedupe and sorting. */
export interface Draft {
  ruleId: string;
  category: FindingCategory;
  medIds: string[];
  title: string;
  plain: string;
  clinician: string;
  question: string;
  sourceIds: string[];
  evidenceGrade: string | null;
  /** Diary metrics linked to this finding beyond the KB effects of its medicines (e.g. a watch-list). */
  extraMetrics?: MetricKey[];
  /** Add a "Could X be contributing to the … recorded?" question when symptoms are linked. */
  symptomQuestion?: boolean;
  /** Findings sharing a signature are deduplicated (a subset of another's medicines is dropped). */
  signature?: string;
  /** Lower wins when two drafts with the same signature have the same medicines. */
  priority?: number;
}

/** Stable order: most recently started first, then name, then id (input order never matters). */
export function sortMeds(meds: MedInfo[]): MedInfo[] {
  return [...meds].sort(
    (a, b) =>
      (a.med.startDate < b.med.startDate ? 1 : a.med.startDate > b.med.startDate ? -1 : 0) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.med.id < b.med.id ? -1 : a.med.id > b.med.id ? 1 : 0),
  );
}

export function isActive(med: Medication, today: ISODate): boolean {
  return med.endDate === null || med.endDate === undefined || med.endDate === "" || med.endDate >= today;
}

export function knownIngredients(ix: KbIndex, med: Medication): string[] {
  if (med.match === "none") return [];
  const out: string[] = [];
  for (const id of med.ingredientIds ?? []) if (ix.drug(id) && !out.includes(id)) out.push(id);
  return out;
}

export function medInfo(ix: KbIndex, med: Medication, today: ISODate): MedInfo {
  return {
    med,
    ingredients: knownIngredients(ix, med),
    name: medName(med),
    daysOn: med.startDate ? daysBetween(med.startDate, today) : 0,
  };
}

export function buildContext(kb: KnowledgeBase, input: ReviewInput): {
  ctx: ReviewContext;
  unmatched: Medication[];
} {
  const ix = indexKb(kb);
  const { today, profile } = input;
  const active: MedInfo[] = [];
  const unmatched: Medication[] = [];
  const recentlyStopped: MedInfo[] = [];
  for (const med of input.meds ?? []) {
    const info = medInfo(ix, med, today);
    if (isActive(med, today)) {
      if (info.ingredients.length === 0) unmatched.push(med);
      else active.push(info);
    } else if (info.ingredients.length > 0 && med.endDate && daysBetween(med.endDate, today) <= CASCADE_STOPPED_INDEX_DAYS) {
      recentlyStopped.push(info);
    }
  }
  const diary = diaryFacts(input.checkIns ?? [], today);
  const conditions = new Map<ConditionTag, "profile" | "diary">();
  for (const c of profile.conditions ?? []) conditions.set(c, "profile");
  // Only a recorded fall counts as a history of falls (the Beers criterion); near-falls stay as related symptoms.
  if (!conditions.has("history_of_falls") && diary.fallDates.length > 0) {
    conditions.set("history_of_falls", "diary");
  }
  const age = profile.age;
  const ctx: ReviewContext = {
    ix,
    today,
    profile,
    person: personName(profile.preferredName),
    meds: sortMeds(active),
    recentlyStopped: sortMeds(recentlyStopped),
    conditions,
    diary,
    beers: !(typeof age === "number" && Number.isFinite(age) && age < BEERS_MIN_AGE),
    signals: input.signals ?? [],
  };
  return { ctx, unmatched };
}

/** Display name of a KB ingredient ("Diphenhydramine"), falling back to the id. */
export function ingredientName(ctx: ReviewContext, id: string): string {
  return ctx.ix.drug(id)?.display ?? id;
}

/**
 * How to name the part of a medicine a rule is about: the medicine's own name when it is a single
 * ingredient or its name already says the ingredient ("Lorazepam (Ativan)"), otherwise
 * "the diphenhydramine in Tylenol PM".
 */
export function namePart(ctx: ReviewContext, m: MedInfo, ingredientIds: string[]): string {
  if (m.ingredients.length <= 1 || ingredientIds.length === 0) return m.name;
  const lowerName = m.name.toLowerCase();
  const parts = ingredientIds.map((id) => ingredientName(ctx, id).toLowerCase());
  if (parts.every((p) => lowerName.includes(p))) return m.name;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `the ${list} in ${m.name}`;
}
