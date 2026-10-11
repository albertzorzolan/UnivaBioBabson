// FHIR R4 export of the family-kept record (SPEC §6.5, §10): "Export for clinician" on the Visit brief screen.
//
// Bundle type: "document". A document bundle is the FHIR shape of "a set of resources assembled into one clinical
// document with a fixed presentation": the first entry is a Composition (the visit brief, with the same numbered
// sections as the printed page and human-readable narrative), every other entry is reachable from it, and the bundle
// carries an identifier + timestamp. A receiving EHR can therefore show the brief as-is and also import its
// structured parts. (A "collection" bundle would validate too, but carries no reading order or narrative.)
//
//   Composition        the brief: status preliminary until a family member marks it reviewed (then final, with an
//                      attester); LOINC 51855-5 "Patient Note"; authors = the caregiver (RelatedPerson) + Kinwise (Device)
//   Patient            fictional, no identifiers, no birth date (only an age is recorded)
//   RelatedPerson      the caregiver who keeps the record (informationSource of every MedicationStatement)
//   Device             the Kinwise software (author of the DetectedIssues: screening prompts, not clinical judgments)
//   Medication         only for combination products ("Tylenol PM" → acetaminophen + diphenhydramine ingredients)
//   MedicationStatement one per medicine on the list: RxNorm ingredient coding when the KB has a verified RxCUI,
//                      else text; status active/completed by end date; family-entered dose text, reason, prescriber
//   Observation        one per answered diary item per check-in day in the period (category "survey", performer =
//                      the patient); unanswered items are never exported as "no". The day's own words, when given,
//                      are a separate Observation (LOINC 61150-9 "Subjective Narrative") that the coded items derive from.
//   DetectedIssue      one per review finding the family has not dismissed; status preliminary; severity omitted on
//                      purpose (Kinwise never triages); implicated → MedicationStatements, evidence.detail → Observations
//
// Ids are deterministic (urn:uuid from stable hashes of the dataset id + record ids) so the same record exports
// byte-identical JSON. Bundle.id/identifier also hash the content, so each changed version (draft → reviewed →
// edited) is a new document; Composition.identifier stays the same across versions of one brief. Every SNOMED CT / LOINC / HL7 code below was checked with tx.fhir.org $lookup on 2026-10-11
// (all active). "Near-fall" has no SNOMED CT concept; it is exported as text only rather than mis-coded.

import type {
  BriefContent,
  BriefSentence,
  CheckIn,
  ConceptId,
  DiaryAnswers,
  EvidenceItem,
  EvidencePackage,
  Finding,
  FindingCategory,
  ISODate,
  ISODateTime,
  Medication,
  MedReview,
  MetricKey,
  Note,
  StoreData,
  VisitBrief,
} from "../../model/types";
import { addDays, isValidDate } from "../../model/dates";
import { stableHash } from "../../model/ids";
import { latestCheckInPerDate, metricValue } from "../timeline/metrics";
import { coverageText, evidenceId, fallsText, findingText, includedConcerns, medText, metricCountText, noteText } from "./evidence";
import {
  LIMITATION_LINES,
  SAFETY_LINE,
  TEMPLATE_LIMITS,
  findingQuestionSentences,
  findingQuestionText,
  findingSourceShort,
  promptFindings,
  selectReviewPrompts,
} from "./template";
import {
  CATEGORY_TEXT,
  CONCEPT_LABEL,
  DEFAULT_KB,
  PRODUCT_NAME,
  caregiverLabel,
  dateWords,
  decisionFor,
  howTaken,
  isActiveOn,
  isSelfSelected,
  medName,
  oneLine,
  sourceShorts,
} from "./shared";
import type { BriefKb } from "./shared";

// ---------------------------------------------------------------------------
// Minimal FHIR R4 types (only what this module emits)

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}
export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}
export interface FhirReference {
  reference: string;
  display?: string;
}
export interface FhirMeta {
  tag?: FhirCoding[];
  security?: FhirCoding[];
}
export interface FhirNarrative {
  status: "generated" | "additional";
  div: string;
}
/** Any FHIR resource. Fields beyond resourceType/id are typed loosely on purpose (this is an export format). */
export interface FhirResource {
  resourceType: string;
  id: string;
  meta?: FhirMeta;
  text?: FhirNarrative;
  [key: string]: unknown;
}
export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirResource;
}
export interface FhirBundle {
  resourceType: "Bundle";
  id: string;
  /** Present (demo tag + HTEST label) while the record is the fictional demo dataset. */
  meta?: FhirMeta;
  identifier: { system: string; value: string };
  type: "document";
  timestamp: ISODateTime;
  entry: FhirBundleEntry[];
}

export interface FhirExportInput {
  data: StoreData;
  review: MedReview;
  /** The visit brief to export as the Composition; null = a record export with sections built from the review. */
  brief: VisitBrief | null;
  today: ISODate;
  kb?: BriefKb;
}

// ---------------------------------------------------------------------------
// Code systems and verified codes

export const SYSTEMS = {
  snomed: "http://snomed.info/sct",
  loinc: "http://loinc.org",
  rxnorm: "http://www.nlm.nih.gov/research/umls/rxnorm",
  obsCategory: "http://terminology.hl7.org/CodeSystem/observation-category",
  msCategory: "http://terminology.hl7.org/CodeSystem/medication-statement-category",
  actCode: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  roleCode: "http://terminology.hl7.org/CodeSystem/v3-RoleCode",
  actReason: "http://terminology.hl7.org/CodeSystem/v3-ActReason",
  participationMode: "http://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
  /** Tag system for the demo-data label (".example" is reserved for documentation, RFC 2606). */
  kinwiseTag: "https://kinwise.example/fhir/CodeSystem/tag",
  uri: "urn:ietf:rfc:3986",
} as const;

/** The tag every exported resource carries while the record is the fictional demo dataset. */
export const DEMO_TAG: FhirCoding = { system: SYSTEMS.kinwiseTag, code: "fictional-demo-data", display: "Fictional demo data" };
/** HL7 v3 ActReason HTEST "test health data": the standard security label for non-real records. */
export const TEST_DATA_LABEL: FhirCoding = { system: SYSTEMS.actReason, code: "HTEST", display: "test health data" };

const sct = (code: string, display: string): FhirCoding => ({ system: SYSTEMS.snomed, code, display });

/** Diary items → code + plain text. Verified on tx.fhir.org (SNOMED CT International 2025-02-01). */
export const DIARY_CODES: Record<keyof DiaryAnswers, { coding: FhirCoding | null; text: string } | null> = {
  dizziness: { coding: sct("404640003", "Dizziness"), text: "Dizzy or light-headed (self-reported)" },
  dizzinessSeverity: null, // exported as a component of the dizziness Observation
  drowsiness: { coding: sct("271782001", "Drowsy"), text: "Drowsy during the day (self-reported)" },
  confusion: { coding: sct("286933003", "Confusional state"), text: "Confused or foggy (self-reported)" },
  fall: { coding: sct("1912002", "Fall"), text: "Fall today (self-reported)" },
  nearFall: { coding: null, text: "Near-fall today: lost balance without falling (self-reported)" },
  swelling: { coding: sct("267039000", "Swollen ankle region"), text: "Ankle swelling (self-reported)" },
  energy: { coding: sct("359755007", "Energy / stamina"), text: "Self-rated energy, 1 (very low) to 5 (great)" },
  sleep: { coding: sct("248254009", "Quality of sleep"), text: "Self-rated sleep last night, 1 (very poor) to 5 (very good)" },
  appetite: { coding: sct("364663004", "Appetite observable"), text: "Appetite compared with usual (self-reported)" },
};

export const APPETITE_CODES: Record<NonNullable<DiaryAnswers["appetite"]>, FhirCodeableConcept> = {
  worse: { coding: [sct("64379006", "Decrease in appetite")], text: "Less than usual" },
  same: { coding: [sct("161825005", "Appetite normal")], text: "As usual" },
  better: { coding: [sct("72405004", "Increased appetite")], text: "More than usual" },
};

export const SEVERITY_CODES: Record<1 | 2 | 3, FhirCodeableConcept> = {
  1: { coding: [sct("255604002", "Mild")], text: "A little" },
  2: { coding: [sct("6736007", "Moderate severity")], text: "Quite" },
  3: { coding: [sct("24484000", "Severe")], text: "Very" },
};
const SEVERITY_ATTRIBUTE = sct("246112005", "Severity");

/** Extra symptoms from the patient's words. */
export const CONCEPT_CODES: Record<ConceptId, FhirCoding> = {
  nausea: sct("422587007", "Nausea"),
  constipation: sct("14760008", "Constipation"),
  dry_mouth: sct("87715008", "Xerostomia"),
  headache: sct("25064002", "Headache"),
  cough: sct("49727002", "Cough"),
  blurred_vision: sct("111516008", "Blurring of visual image"),
  urinary_problem: sct("165232002", "Urinary incontinence"),
  low_mood: sct("366979004", "Depressed mood"),
  anxiety: sct("48694002", "Anxiety"),
  pain: sct("22253000", "Pain"),
  shortness_of_breath: sct("267036007", "Dyspnea"),
  tremor: sct("26079004", "Tremor"),
  rash: sct("271807003", "Eruption"),
  diarrhea: sct("62315008", "Diarrhea"),
  palpitations: sct("80313002", "Palpitations"),
  bleeding_or_bruising: sct("131148009", "Bleeding"),
  black_stools: sct("35064005", "Dark stools"),
  shakiness_or_sweating: sct("415690000", "Sweating"),
};

const NARRATIVE_CODE: FhirCoding = { system: SYSTEMS.loinc, code: "61150-9", display: "Subjective Narrative" };
const PATIENT_NOTE: FhirCoding = { system: SYSTEMS.loinc, code: "51855-5", display: "Patient Note" };
const SECTION_CODES = {
  reason: { system: SYSTEMS.loinc, code: "29299-5", display: "Reason for visit Narrative" },
  symptoms: { system: SYSTEMS.loinc, code: "10187-3", display: "Review of systems Narrative - Reported" },
  meds: { system: SYSTEMS.loinc, code: "10160-0", display: "History of Medication use Narrative" },
} as const;

/** HL7 v3 ActCode detected-issue codes for review categories that map cleanly; others are text only. */
export const ISSUE_CODES: Partial<Record<FindingCategory, FhirCoding>> = {
  beers_avoid: { system: SYSTEMS.actCode, code: "AGE", display: "Age Alert" },
  beers_caution: { system: SYSTEMS.actCode, code: "AGE", display: "Age Alert" },
  beers_condition: { system: SYSTEMS.actCode, code: "COND", display: "Condition Alert" },
  beers_renal: { system: SYSTEMS.actCode, code: "COND", display: "Condition Alert" },
  beers_interaction: { system: SYSTEMS.actCode, code: "DRG", display: "Drug Interaction Alert" },
  cns_active_combo: { system: SYSTEMS.actCode, code: "DRG", display: "Drug Interaction Alert" },
  duplicate_class: { system: SYSTEMS.actCode, code: "DUPTHPY", display: "Duplicate Therapy Alert" },
};

const RELATION_CODES: Record<string, FhirCoding> = {
  daughter: { system: SYSTEMS.roleCode, code: "DAUC", display: "daughter" },
  son: { system: SYSTEMS.roleCode, code: "SONC", display: "son" },
  child: { system: SYSTEMS.roleCode, code: "CHILD", display: "child" },
  wife: { system: SYSTEMS.roleCode, code: "WIFE", display: "wife" },
  husband: { system: SYSTEMS.roleCode, code: "HUSB", display: "husband" },
  spouse: { system: SYSTEMS.roleCode, code: "SPS", display: "spouse" },
  sister: { system: SYSTEMS.roleCode, code: "SIS", display: "sister" },
  brother: { system: SYSTEMS.roleCode, code: "BRO", display: "brother" },
  niece: { system: SYSTEMS.roleCode, code: "NIECE", display: "niece" },
  granddaughter: { system: SYSTEMS.roleCode, code: "GRNDDAU", display: "granddaughter" },
  grandchild: { system: SYSTEMS.roleCode, code: "GRNDCHILD", display: "grandchild" },
  friend: { system: SYSTEMS.roleCode, code: "FRND", display: "unrelated friend" },
};

/** Boolean diary fields in export order. */
const BOOL_FIELDS = ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"] as const;
/** Metrics whose positive days are linked as DetectedIssue evidence (diary field per metric). */
const METRIC_FIELD: Partial<Record<MetricKey, keyof DiaryAnswers>> = {
  dizziness: "dizziness",
  drowsiness: "drowsiness",
  confusion: "confusion",
  fall: "fall",
  nearFall: "nearFall",
  swelling: "swelling",
  appetiteWorse: "appetite",
};
const MAX_EVIDENCE_REFS = 12;

// ---------------------------------------------------------------------------
// Deterministic ids and small helpers

/** RFC 4122-shaped UUID derived from a key (version nibble 5, variant 10xx). Deterministic; not cryptographic. */
export function deterministicUuid(key: string): string {
  const hex = `${stableHash(key)}${stableHash(`${key}|b`)}${stableHash(`${key}|c`)}`.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "89ab"[parseInt(hex[16], 16) % 4];
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function escapeXml(text: string): string {
  return oneLine(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** XHTML narrative: `parts` are already-escaped fragments. */
function narrative(...parts: string[]): FhirNarrative {
  return { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${parts.join("")}</div>` };
}
const p = (text: string) => `<p>${escapeXml(text)}</p>`;
const list = (items: string[], ordered = false) => {
  const tag = ordered ? "ol" : "ul";
  return items.length ? `<${tag}>${items.map((i) => `<li>${escapeXml(i)}</li>`).join("")}</${tag}>` : "";
};

/** FHIR instant: ISO timestamp with seconds and a zone; null when the input is not one. */
function asInstant(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(ts) ? ts : null;
}

/** Remove keys whose value is undefined, null, "" or an empty array (FHIR forbids empty elements). */
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

/** Text or nothing (avoids empty "text" elements). */
function textOrUndefined(text: string | null | undefined): string | undefined {
  const t = oneLine(text ?? "");
  return t ? t : undefined;
}

// ---------------------------------------------------------------------------
// Builder

interface Ctx {
  data: StoreData;
  today: ISODate;
  period: { from: ISODate; to: ISODate };
  kb: BriefKb;
  meta: FhirMeta | undefined;
  uuid: (key: string) => string;
  entries: FhirBundleEntry[];
}

function add(ctx: Ctx, key: string, resource: Omit<FhirResource, "id">): FhirReference {
  const id = ctx.uuid(key);
  const full: FhirResource = compact({ resourceType: resource.resourceType, id, meta: ctx.meta, ...resource }) as FhirResource;
  ctx.entries.push({ fullUrl: `urn:uuid:${id}`, resource: full });
  return { reference: `urn:uuid:${id}` };
}

function ref(r: FhirReference, display?: string): FhirReference {
  return display ? { reference: r.reference, display: oneLine(display) } : r;
}

/** Period exported: the brief's period, or the 30 days ending today. */
function exportPeriod(brief: VisitBrief | null, today: ISODate): { from: ISODate; to: ISODate } {
  if (brief && isValidDate(brief.from) && isValidDate(brief.to) && brief.from <= brief.to) return { from: brief.from, to: brief.to };
  return { from: addDays(today, -29), to: today };
}

function patientResource(data: StoreData): Omit<FhirResource, "id"> {
  const prof = data.profile;
  const display = oneLine(prof.displayName) || "Patient";
  const words = display.split(" ");
  const given = oneLine(prof.preferredName) || words[0];
  const family = words.length > 1 ? words[words.length - 1] : undefined;
  const gender = prof.sex === "female" || prof.sex === "male" || prof.sex === "other" ? prof.sex : "unknown";
  const fictional = data.isDemoData ? "Fictional demo patient. " : "";
  return {
    resourceType: "Patient",
    text: narrative(p(`${fictional}${display}, age ${prof.age} (as recorded by the family). No identifiers are included in this export.`)),
    name: [compact({ use: "usual", text: display, family, given: [given] })],
    gender,
  };
}

function relatedPersonResource(data: StoreData, patient: FhirReference): Omit<FhirResource, "id"> {
  const prof = data.profile;
  const relation = oneLine(prof.caregiverRelation).toLowerCase();
  const coding = RELATION_CODES[relation];
  const name = oneLine(prof.caregiverName) || "Caregiver";
  return {
    resourceType: "RelatedPerson",
    text: narrative(p(`${caregiverLabel(prof)}: keeps the medicine list and diary with ${oneLine(prof.preferredName) || "the patient"}.`)),
    patient: ref(patient, prof.displayName),
    relationship: [compact({ coding: coding ? [coding] : undefined, text: textOrUndefined(prof.caregiverRelation) ?? "Family caregiver" })],
    name: [{ text: name }],
  };
}

function deviceResource(kbVersion: string | null): Omit<FhirResource, "id"> {
  return {
    resourceType: "Device",
    text: narrative(
      p(`${PRODUCT_NAME}: on-device software that keeps a family medication list and symptom diary and checks the list against published criteria. It does not diagnose or advise on treatment.`),
    ),
    deviceName: [{ name: PRODUCT_NAME, type: "user-friendly-name" }],
    type: { text: "Family medication and symptom diary software" },
    version: kbVersion ? [{ type: { text: "Knowledge base version" }, value: kbVersion }] : undefined,
  };
}

/** RxNorm coding for a single KB ingredient (only verified numeric RxCUIs). */
function rxCoding(ingredientId: string, kb: BriefKb): FhirCoding | null {
  const rxcui = kb.rxcui(ingredientId);
  if (!rxcui) return null;
  return { system: SYSTEMS.rxnorm, code: rxcui, display: (kb.drugDisplay(ingredientId) ?? ingredientId).toLowerCase() };
}

function medicationStatement(ctx: Ctx, med: Medication, patient: FhirReference, caregiver: FhirReference): FhirReference {
  const { kb, today } = ctx;
  const name = medName(med);
  const ids = med.ingredientIds ?? [];
  let medication: Record<string, unknown>;
  if (ids.length > 1) {
    // Combination product: a Medication with one coded ingredient per KB ingredient.
    const m = add(ctx, `medication:${med.id}`, {
      resourceType: "Medication",
      text: narrative(p(`${name}: ${ids.map((id) => (kb.drugDisplay(id) ?? id).toLowerCase()).join(" + ")}.`)),
      code: { text: name },
      ingredient: ids.map((id) => {
        const c = rxCoding(id, kb);
        return { itemCodeableConcept: compact({ coding: c ? [c] : undefined, text: (kb.drugDisplay(id) ?? id).toLowerCase() }) };
      }),
    });
    medication = { medicationReference: ref(m, name) };
  } else {
    const c = ids.length === 1 ? rxCoding(ids[0], kb) : null;
    medication = { medicationCodeableConcept: compact({ coding: c ? [c] : undefined, text: name }) };
  }
  const ended = med.endDate !== null && isValidDate(med.endDate) && med.endDate < today;
  const status = med.startDate > today ? "intended" : ended ? "completed" : "active";
  const how = howTaken(med);
  const notes: { text: string }[] = [];
  const prescriber = oneLine(med.prescriber);
  if (isSelfSelected(med)) notes.push({ text: med.otc ? "Bought over the counter (no prescriber)." : "Taken without a prescription." });
  else if (prescriber) notes.push({ text: `Prescriber, as recorded by the family: ${prescriber}.` });
  if (med.otc && !isSelfSelected(med)) notes.push({ text: "Available over the counter." });
  if (med.match === "none" || ids.length === 0) notes.push({ text: `Not in ${PRODUCT_NAME}'s reference set, so not reviewed against the criteria.` });
  const created = asInstant(med.updatedAt) ?? asInstant(med.createdAt);
  const summary = [`${name}${how ? `, ${how}` : ""}`, oneLine(med.reason) ? `for ${oneLine(med.reason)}` : "", isValidDate(med.startDate) ? `started ${med.startDate}` : "", ended ? `last taken ${med.endDate}` : "", `(${status})`]
    .filter(Boolean)
    .join(" ");
  return add(ctx, `ms:${med.id}`, {
    resourceType: "MedicationStatement",
    text: narrative(p(`${summary}.`), ...notes.map((n) => p(n.text))),
    status,
    category: { coding: [{ system: SYSTEMS.msCategory, code: "patientspecified", display: "Patient Specified" }] },
    ...medication,
    subject: ref(patient),
    effectivePeriod: compact({ start: isValidDate(med.startDate) ? med.startDate : undefined, end: ended ? med.endDate : undefined }),
    dateAsserted: created ?? undefined,
    informationSource: ref(caregiver, caregiverLabel(ctx.data.profile)),
    reasonCode: textOrUndefined(med.reason) ? [{ text: oneLine(med.reason) }] : undefined,
    note: notes,
    dosage: how ? [compact({ text: how, asNeededBoolean: med.asNeeded || undefined })] : undefined,
  });
}

interface DayObservations {
  date: ISODate;
  byField: Map<string, FhirReference>;
}

function observationsForCheckIn(ctx: Ctx, c: CheckIn, patient: FhirReference): DayObservations {
  const out: DayObservations = { date: c.date, byField: new Map() };
  const status = c.revision > 1 ? "amended" : "final";
  const issued = asInstant(c.confirmedAt) ?? undefined;
  const base = {
    resourceType: "Observation",
    status,
    category: [{ coding: [{ system: SYSTEMS.obsCategory, code: "survey", display: "Survey" }] }],
    subject: ref(patient),
    effectiveDateTime: c.date,
    issued,
    performer: [ref(patient)],
  };
  let story: FhirReference | null = null;
  const words = oneLine(c.story);
  if (words) {
    story = add(ctx, `obs:${c.id}:story`, {
      ...base,
      text: narrative(p(`${c.date}, in the patient's own words: "${words}"`)),
      code: { coding: [NARRATIVE_CODE], text: "The day in the patient's own words" },
      valueString: words,
    });
    out.byField.set("story", story);
  }
  const derived = (field: keyof DiaryAnswers) => (story && (c.provenance?.[field]?.spans?.length ?? 0) > 0 ? [story] : undefined);
  const code = (field: keyof DiaryAnswers): FhirCodeableConcept => {
    const def = DIARY_CODES[field]!;
    return compact({ coding: def.coding ? [def.coding] : undefined, text: def.text });
  };
  const a = c.answers;
  for (const f of BOOL_FIELDS) {
    const v = a[f];
    if (v === null || v === undefined) continue;
    const component =
      f === "dizziness" && v === true && a.dizzinessSeverity
        ? [{ code: { coding: [SEVERITY_ATTRIBUTE], text: "How strong" }, valueCodeableConcept: SEVERITY_CODES[a.dizzinessSeverity] }]
        : undefined;
    const sev = component ? ` (${SEVERITY_CODES[a.dizzinessSeverity!].text!.toLowerCase()})` : "";
    out.byField.set(
      f,
      add(ctx, `obs:${c.id}:${f}`, { ...base, text: obsText(c, f, `${v ? "yes" : "no"}${sev}`), code: code(f), valueBoolean: v, component, derivedFrom: derived(f) }),
    );
  }
  for (const f of ["energy", "sleep"] as const) {
    const v = a[f];
    if (v === null || v === undefined) continue;
    out.byField.set(f, add(ctx, `obs:${c.id}:${f}`, { ...base, text: obsText(c, f, `${v} out of 5`), code: code(f), valueInteger: v, derivedFrom: derived(f) }));
  }
  if (a.appetite) {
    const value = APPETITE_CODES[a.appetite];
    out.byField.set(
      "appetite",
      add(ctx, `obs:${c.id}:appetite`, { ...base, text: obsText(c, "appetite", value.text!.toLowerCase()), code: code("appetite"), valueCodeableConcept: value, derivedFrom: derived("appetite") }),
    );
  }
  const seen = new Set<string>();
  for (const o of c.otherSymptoms ?? []) {
    const coding = CONCEPT_CODES[o.conceptId];
    if (!coding || seen.has(o.conceptId)) continue;
    seen.add(o.conceptId);
    out.byField.set(`other:${o.conceptId}`, add(ctx, `obs:${c.id}:other:${o.conceptId}`, {
      ...base,
      text: narrative(p(`${c.date}: ${CONCEPT_LABEL[o.conceptId] ?? o.conceptId} ${o.present ? "mentioned" : "mentioned as absent"} in the patient's own words.`)),
      code: { coding: [coding], text: `${CONCEPT_LABEL[o.conceptId] ?? o.conceptId} (from the patient's own words)` },
      valueBoolean: o.present,
      derivedFrom: story && o.span ? [story] : undefined,
    }));
  }
  return out;
}

function obsText(c: CheckIn, field: keyof DiaryAnswers, value: string): FhirNarrative {
  return narrative(p(`${c.date}: ${DIARY_CODES[field]!.text}: ${value}.${c.revision > 1 ? " Corrected by the family after first saving." : ""}`));
}

/** Positive-day Observations for a finding's related symptoms (most recent first, capped). */
function evidenceRefs(days: DayObservations[], data: StoreData, f: Finding): FhirReference[] {
  const byDate = new Map(latestCheckInPerDate(data.checkIns).map((c) => [c.date, c]));
  const out: FhirReference[] = [];
  for (const d of [...days].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const c = byDate.get(d.date);
    if (!c) continue;
    for (const m of f.relatedSymptoms ?? []) {
      const field = METRIC_FIELD[m];
      if (!field || metricValue(c, m) !== 1) continue;
      const r = d.byField.get(field);
      if (r && !out.some((x) => x.reference === r.reference)) out.push(r);
    }
    if (out.length >= MAX_EVIDENCE_REFS) break;
  }
  return out.slice(0, MAX_EVIDENCE_REFS);
}

function detectedIssue(
  ctx: Ctx,
  f: Finding,
  patient: FhirReference,
  device: FhirReference,
  msByMed: Map<string, FhirReference>,
  days: DayObservations[],
): FhirReference {
  const coding = ISSUE_CODES[f.category];
  const implicated = f.medIds.map((id) => msByMed.get(id)).filter((r): r is FhirReference => Boolean(r));
  const detailRefs = evidenceRefs(days, ctx.data, f);
  const symptoms = (f.relatedSymptoms ?? []).map((m) => ({ text: `Recorded in the diary: ${metricLabel(m)}` }));
  const evidence = symptoms.length || detailRefs.length ? [compact({ code: symptoms, detail: detailRefs })] : undefined;
  const sources = sourceShorts(f.sourceIds ?? [], ctx.kb);
  const url = (f.sourceIds ?? []).map((id) => ctx.kb.source(id)?.url).find((u): u is string => Boolean(u));
  const detail = [
    oneLine(f.plain),
    oneLine(f.clinician) ? `For the clinician: ${oneLine(f.clinician)}` : "",
    f.evidenceGrade ? `Evidence: ${oneLine(f.evidenceGrade)}.` : "",
    sources.length ? `Source: ${sources.join("; ")}.` : "",
    findingQuestionText(f, ctx.period, ctx.data) ? `Question for the visit: ${findingQuestionText(f, ctx.period, ctx.data)}` : "",
    "A screening prompt from published criteria, not a clinical judgment.",
  ]
    .filter(Boolean)
    .join(" ");
  const status = decisionFor(ctx.data.reviewDecisions, f.key);
  return add(ctx, `issue:${f.key}`, {
    resourceType: "DetectedIssue",
    text: narrative(p(`${oneLine(f.title)}.`), p(detail)),
    status: "preliminary",
    code: compact({ coding: coding ? [coding] : undefined, text: `${CATEGORY_TEXT[f.category] ?? f.category}: ${oneLine(f.title)}` }),
    patient: ref(patient),
    identifiedDateTime: ctx.today,
    author: ref(device, PRODUCT_NAME),
    implicated,
    evidence,
    detail,
    reference: url,
    mitigation: status === "discussed" ? [{ action: { text: "Discussed with the clinician (recorded by the family)" } }] : undefined,
  });
}

function metricLabel(m: MetricKey): string {
  const labels: Record<MetricKey, string> = {
    dizziness: "dizziness",
    drowsiness: "daytime drowsiness",
    confusion: "confusion or memory fog",
    fall: "a fall",
    nearFall: "a near-fall",
    swelling: "ankle swelling",
    appetiteWorse: "poor appetite",
    energy: "energy ratings",
    sleep: "sleep ratings",
  };
  return labels[m];
}

/**
 * Brief-like section content when no VisitBrief was supplied (a "record export"): the same breadth-first review
 * prompts and verified finding questions as the template brief, and "What we've noticed" from the period's counts
 * (diary items recorded at least once, then falls), each restating an evidence item built here.
 */
function contentFromRecord(data: StoreData, review: MedReview, kb: BriefKb, today: ISODate, period: { from: ISODate; to: ISODate }): BriefContent {
  const concerns = includedConcerns(data);
  const ranked = promptFindings(review, data);
  const findings = selectReviewPrompts(ranked, TEMPLATE_LIMITS.reviewPrompts);
  const days = latestCheckInPerDate(data.checkIns);
  const { from, to } = period;
  const counts = (["dizziness", "drowsiness", "confusion", "swelling", "appetiteWorse"] as const)
    .map((m) => ({ id: evidenceId.count(m), ...metricCountText(days, m, from, to) }))
    .filter((c) => (c.data.positive ?? 0) > 0);
  const falls = { id: evidenceId.falls, ...fallsText(days, from, to) };
  const items: EvidenceItem[] = [
    { id: evidenceId.coverage, kind: "fact", text: coverageText(days, from, to).text },
    { id: falls.id, kind: "fact", text: falls.text },
    ...counts.map((c) => ({ id: c.id, kind: "fact" as const, text: c.text })),
    ...data.medications.map((m) => ({ id: evidenceId.med(m.id), kind: "med" as const, text: medText(m, to, kb) })),
    ...ranked.map((f) => ({ id: evidenceId.finding(f.key), kind: "finding" as const, text: findingText(f, kb) })),
  ];
  const pkg: EvidencePackage = { from, to, generatedAt: data.updatedAt, items, hash: "" };
  const questions: BriefSentence[] = [];
  for (const f of findings) {
    for (const q of findingQuestionSentences(f, pkg, data)) if (!questions.some((x) => x.text === q.text)) questions.push(q);
  }
  for (const q of data.savedQuestions ?? []) {
    const text = oneLine(q.text);
    if (text && !questions.some((x) => x.text === text)) questions.push({ text, evidenceIds: [] });
  }
  const noticed = [...counts.slice(0, 3), ...((falls.data.positive ?? 0) > 0 ? [falls] : [])].map((c) => ({ text: c.text, evidenceIds: [c.id] }));
  return {
    reason: concerns.map((n: Note) => ({ text: noteText(n, data, today), evidenceIds: [] })),
    noticed,
    reviewPrompts: findings.map((f) => ({ findingKey: f.key, text: oneLine(f.title), sourceShort: findingSourceShort(f, kb) })),
    questions: questions.slice(0, 8),
    limitations: [LIMITATION_LINES.chance, LIMITATION_LINES.scope, LIMITATION_LINES.family],
  };
}

/**
 * Build the FHIR R4 document bundle. Pure and deterministic: the same record, review, brief and `today`
 * produce identical JSON.
 */
export function toFhirBundle(input: FhirExportInput): FhirBundle {
  const { data, review, brief, today } = input;
  if (!isValidDate(today)) throw new RangeError(`toFhirBundle needs a valid date (got ${today})`);
  const kb = input.kb ?? DEFAULT_KB;
  const scope = `${data.datasetId}|${brief?.id ?? "record"}`;
  const period = exportPeriod(brief, today);
  const ctx: Ctx = {
    data,
    today,
    period,
    kb,
    meta: data.isDemoData ? { tag: [DEMO_TAG], security: [TEST_DATA_LABEL] } : undefined,
    uuid: (key) => deterministicUuid(`${data.datasetId}|${key}`),
    entries: [],
  };
  const prof = data.profile;

  // Composition placeholder goes first; it is filled in at the end (it references everything else).
  const compositionId = deterministicUuid(`${scope}|composition`);

  const patient = add(ctx, "patient", patientResource(data));
  const caregiver = add(ctx, "caregiver", relatedPersonResource(data, patient));
  const device = add(ctx, "device", deviceResource(review.kbVersion || kb.version));

  // Medicines: active on the period end, or stopped during the period.
  const meds = data.medications.filter(
    (m) => isActiveOn(m, period.to) || (m.endDate !== null && m.endDate >= period.from && m.endDate < period.to) || isActiveOn(m, today),
  );
  const msByMed = new Map<string, FhirReference>();
  for (const m of meds) msByMed.set(m.id, medicationStatement(ctx, m, patient, caregiver));

  // Diary observations for the period (latest revision per day).
  const days = latestCheckInPerDate(data.checkIns).filter((c) => c.date >= period.from && c.date <= period.to);
  const dayObs = days.map((c) => observationsForCheckIn(ctx, c, patient));

  // Review findings the family has not dismissed.
  const findings = promptFindings(review, data);
  const issueByKey = new Map<string, FhirReference>();
  for (const f of findings) issueByKey.set(f.key, detectedIssue(ctx, f, patient, device, msByMed, dayObs));

  // Sections -----------------------------------------------------------------
  const content = brief?.content ?? contentFromRecord(data, review, kb, today, period);
  const sections: Record<string, unknown>[] = [];
  const periodWords = `${dateWords(period.from, period.to)} through ${dateWords(period.to, period.to)}`;

  sections.push({
    title: "1. Why we're coming in",
    code: { coding: [SECTION_CODES.reason] },
    text: narrative(content.reason.length ? list(content.reason.map((s) => s.text)) : p("No concerns were added for this visit.")),
  });
  sections.push({
    title: "2. What we've noticed",
    code: { coding: [SECTION_CODES.symptoms] },
    text: narrative(
      content.noticed.length ? list(content.noticed.map((s) => s.text)) : p("See the diary observations section for what was recorded."),
      p("These are home records. They show what was recorded, not why."),
    ),
  });
  const promptIssues = content.reviewPrompts.map((rp) => issueByKey.get(rp.findingKey)).filter((r): r is FhirReference => Boolean(r));
  sections.push(
    compact({
      title: "3. Medication review prompts",
      text: narrative(
        content.reviewPrompts.length
          ? list(content.reviewPrompts.map((rp) => `${rp.text} (${rp.sourceShort})`))
          : p("No review prompts were selected."),
        p(`${findings.length} screening ${findings.length === 1 ? "prompt is" : "prompts are"} included as DetectedIssue resources. They are questions to ask, not instructions.`),
      ),
      entry: [...new Set([...promptIssues, ...issueByKey.values()].map((r) => r.reference))].map((reference) => ({ reference })),
    }),
  );
  sections.push({
    title: "4. Our questions",
    text: narrative(content.questions.length ? list(content.questions.map((s) => s.text), true) : p("No questions were added.")),
  });
  const medRows = meds.map((m) => {
    const flags = review.findings.filter((f) => f.medIds.includes(m.id)).map((f) => CATEGORY_TEXT[f.category] ?? f.category);
    const cells = [medName(m), howTaken(m) || "-", oneLine(m.reason) || "-", isSelfSelected(m) ? "Over the counter (self)" : oneLine(m.prescriber) || "-", isValidDate(m.startDate) ? dateWords(m.startDate, today) : "-", [...new Set(flags)].join("; ") || "-"];
    return `<tr>${cells.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>`;
  });
  sections.push(
    compact({
      title: "5. Current medication list",
      code: { coding: [SECTION_CODES.meds] },
      text: narrative(
        `<table><thead><tr><th>Medicine</th><th>How taken</th><th>Why</th><th>Prescriber</th><th>Started</th><th>Review flags</th></tr></thead><tbody>${medRows.join("")}</tbody></table>`,
      ),
      entry: [...msByMed.values()].map((r) => ({ reference: r.reference })),
    }),
  );
  const counts = (["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"] as const).map(
    (m) => metricCountText(days, m, period.from, period.to).text,
  );
  const obsRefs = dayObs.flatMap((d) => [...d.byField.values()]);
  sections.push(
    compact({
      title: "6. Diary observations",
      text: narrative(
        p(`${days.length} check-in ${days.length === 1 ? "day" : "days"} from ${periodWords}, exported as ${obsRefs.length} Observation resources. Unanswered questions are left out, never recorded as "no".`),
        list(counts),
      ),
      entry: obsRefs.map((r) => ({ reference: r.reference })),
      emptyReason: obsRefs.length ? undefined : { text: "No check-ins in this period" },
    }),
  );
  sections.push({
    title: "7. Diary coverage and limitations",
    text: narrative(list(content.limitations), p(SAFETY_LINE), p(`Prepared with ${PRODUCT_NAME}: a family-kept record, not a clinical assessment.`)),
  });

  const reviewed = Boolean(brief?.reviewedAt && asInstant(brief.reviewedAt));
  // The document's time is when this version came to be: generated, or later marked reviewed.
  const generated = asInstant(brief?.generation.generatedAt) ?? asInstant(data.updatedAt) ?? `${today}T12:00:00Z`;
  const timestamp = reviewed && Date.parse(brief!.reviewedAt!) > Date.parse(generated) ? brief!.reviewedAt! : generated;
  const composition: FhirResource = compact({
    resourceType: "Composition",
    id: compositionId,
    meta: ctx.meta,
    // Version-independent identifier of this brief (the same across draft, reviewed and edited exports).
    identifier: { system: SYSTEMS.uri, value: `urn:uuid:${deterministicUuid(`${scope}|composition-identifier`)}` },
    text: narrative(
      p(`${brief ? "Visit brief" : "Record export"} for ${oneLine(prof.displayName)}, ${periodWords}. Prepared by ${caregiverLabel(prof)} with ${PRODUCT_NAME}.`),
      p(reviewed ? "Reviewed by the family before sharing." : "Not yet marked as reviewed by the family."),
    ),
    status: reviewed ? "final" : "preliminary",
    type: { coding: [PATIENT_NOTE], text: brief ? "Family-prepared visit brief" : "Family-kept record export" },
    subject: ref(patient, prof.displayName),
    date: timestamp,
    author: [ref(caregiver, caregiverLabel(prof)), ref(device, PRODUCT_NAME)],
    title: `${PRODUCT_NAME} ${brief ? "visit brief" : "record export"}: ${oneLine(prof.displayName)}, ${periodWords}`,
    attester: reviewed ? [{ mode: "personal", time: brief!.reviewedAt!, party: ref(caregiver) }] : undefined,
    section: sections,
  }) as FhirResource;

  const entry: FhirBundleEntry[] = [{ fullUrl: `urn:uuid:${compositionId}`, resource: composition }, ...ctx.entries];
  // FHIR documents are immutable: any change (status, attestation, an edited question, new diary data) is a new
  // document with a new Bundle.id and Bundle.identifier, derived from the content so the same content still
  // exports byte-identical JSON. Receivers that de-duplicate on Bundle.identifier keep every version.
  const version = stableHash(JSON.stringify(entry));
  const bundle: FhirBundle = {
    resourceType: "Bundle",
    id: deterministicUuid(`${scope}|${version}|bundle`),
    ...(ctx.meta ? { meta: ctx.meta } : {}),
    identifier: { system: SYSTEMS.uri, value: `urn:uuid:${deterministicUuid(`${scope}|${version}|document`)}` },
    type: "document",
    timestamp,
    entry,
  };
  return bundle;
}

// ---------------------------------------------------------------------------
// Structural validation (no network; the sample bundle is also validated against HAPI, see docs/samples)

const ID_RE = /^[A-Za-z0-9\-.]{1,64}$/;
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const DATETIME_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const REQUIRED: Record<string, string[]> = {
  Composition: ["status", "type", "date", "author", "title"],
  Patient: [],
  RelatedPerson: ["patient"],
  Device: [],
  Medication: [],
  MedicationStatement: ["status", "subject"],
  Observation: ["status", "code"],
  DetectedIssue: ["status"],
};

const STATUS: Record<string, string[]> = {
  Composition: ["preliminary", "final", "amended", "entered-in-error"],
  MedicationStatement: ["active", "completed", "entered-in-error", "intended", "stopped", "on-hold", "unknown", "not-taken"],
  Observation: ["registered", "preliminary", "final", "amended", "corrected", "cancelled", "entered-in-error", "unknown"],
  DetectedIssue: ["registered", "preliminary", "final", "amended", "corrected", "cancelled", "entered-in-error", "unknown"],
};

/**
 * Structural checks a receiving system relies on: bundle shape, document rules (Composition first, identifier,
 * timestamp), resource types and ids, required elements, status codes, date formats, no empty elements, codings
 * with system + code, XHTML narrative, and every reference resolving to an entry in the bundle.
 * Returns human-readable problems; an empty array means the bundle passed.
 */
export function validateBundle(b: unknown): string[] {
  const errors: string[] = [];
  if (!b || typeof b !== "object") return ["bundle: not an object"];
  const bundle = b as Partial<FhirBundle> & Record<string, unknown>;
  if (bundle.resourceType !== "Bundle") errors.push("bundle: resourceType must be \"Bundle\"");
  if (bundle.type !== "document" && bundle.type !== "collection") errors.push(`bundle: unexpected type ${String(bundle.type)}`);
  if (!Array.isArray(bundle.entry) || bundle.entry.length === 0) return [...errors, "bundle: no entries"];
  if (bundle.type === "document") {
    if (!bundle.identifier?.system || !bundle.identifier?.value) errors.push("bundle: a document needs an identifier with system and value (bdl-9)");
    if (!bundle.timestamp || !INSTANT_RE.test(bundle.timestamp)) errors.push("bundle: a document needs an instant timestamp (bdl-10)");
    if (bundle.entry[0]?.resource?.resourceType !== "Composition") errors.push("bundle: the first entry of a document must be a Composition (bdl-11)");
  }
  const fullUrls = new Set<string>();
  bundle.entry.forEach((e, i) => {
    const where = `entry[${i}]`;
    if (!e || typeof e !== "object") {
      errors.push(`${where}: not an object`);
      return;
    }
    if (typeof e.fullUrl !== "string" || !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(e.fullUrl)) {
      errors.push(`${where}: fullUrl must be a urn:uuid`);
    } else if (fullUrls.has(e.fullUrl)) errors.push(`${where}: duplicate fullUrl ${e.fullUrl}`);
    else fullUrls.add(e.fullUrl);
    const r = e.resource;
    if (!r || typeof r !== "object") {
      errors.push(`${where}: missing resource`);
      return;
    }
    const type = r.resourceType;
    const label = `${where} ${type ?? "?"}`;
    if (!(type in REQUIRED)) errors.push(`${label}: unexpected resourceType`);
    if (typeof r.id !== "string" || !ID_RE.test(r.id)) errors.push(`${label}: invalid id`);
    else if (typeof e.fullUrl === "string" && e.fullUrl !== `urn:uuid:${r.id}`) errors.push(`${label}: fullUrl does not match id`);
    for (const k of REQUIRED[type] ?? []) if (r[k] === undefined) errors.push(`${label}: missing ${k}`);
    if (STATUS[type] && !STATUS[type].includes(String(r.status))) errors.push(`${label}: invalid status ${String(r.status)}`);
    if (type === "MedicationStatement" && !r.medicationCodeableConcept && !r.medicationReference) errors.push(`${label}: missing medication[x]`);
    if (type === "Observation") {
      const values = Object.keys(r).filter((k) => k.startsWith("value"));
      if (values.length > 1) errors.push(`${label}: more than one value[x]`);
      if (r.effectiveDateTime !== undefined && !DATETIME_RE.test(String(r.effectiveDateTime))) errors.push(`${label}: invalid effectiveDateTime`);
      if (r.issued !== undefined && !INSTANT_RE.test(String(r.issued))) errors.push(`${label}: invalid issued instant`);
    }
    if (type === "DetectedIssue" && r.severity !== undefined) errors.push(`${label}: severity must be omitted (Kinwise does not triage)`);
    if (type === "Composition") {
      if (!DATETIME_RE.test(String(r.date))) errors.push(`${label}: invalid date`);
      const sections = Array.isArray(r.section) ? (r.section as Record<string, unknown>[]) : [];
      sections.forEach((s, j) => {
        if (!s.text && !s.entry && !s.section) errors.push(`${label}: section[${j}] needs text, entries or sub-sections (cmp-1)`);
      });
    }
    walk(r, label, errors);
  });
  // References resolve inside the bundle.
  bundle.entry.forEach((e, i) => {
    if (!e?.resource) return;
    for (const reference of collectReferences(e.resource)) {
      if (reference.startsWith("#")) continue;
      if (!fullUrls.has(reference)) errors.push(`entry[${i}] ${e.resource.resourceType}: reference ${reference} does not resolve inside the bundle`);
    }
  });
  return errors;
}

/** Recursive element checks: no empty values, codings complete, dates well-formed, narrative XHTML. */
function walk(value: unknown, path: string, errors: string[]): void {
  if (Array.isArray(value)) {
    if (value.length === 0) errors.push(`${path}: empty array`);
    value.forEach((v, i) => walk(v, `${path}[${i}]`, errors));
    return;
  }
  if (value === null) {
    errors.push(`${path}: null value`);
    return;
  }
  if (typeof value === "string") {
    if (value.trim() === "") errors.push(`${path}: empty string`);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) errors.push(`${path}: empty object`);
  if ("system" in obj && "code" in obj && (typeof obj.system !== "string" || typeof obj.code !== "string" || !obj.code)) {
    errors.push(`${path}: coding needs system and code`);
  }
  if ("div" in obj && typeof obj.div === "string" && !obj.div.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')) {
    errors.push(`${path}: narrative div must be XHTML`);
  }
  for (const k of keys) {
    const v = obj[k];
    if ((k === "start" || k === "end") && typeof v === "string" && !DATETIME_RE.test(v)) errors.push(`${path}.${k}: invalid dateTime`);
    if (/DateTime$/.test(k) && typeof v === "string" && !DATETIME_RE.test(v)) errors.push(`${path}.${k}: invalid dateTime`);
    if (k === "birthDate" && typeof v === "string" && !DATE_RE.test(v)) errors.push(`${path}.${k}: invalid date`);
    walk(v, `${path}.${k}`, errors);
  }
}

/**
 * Every Reference.reference string inside a resource. (DetectedIssue.reference at the top level is a uri to the
 * published authority, not a Reference, and is skipped.)
 */
export function collectReferences(value: unknown, out: string[] = [], depth = 0): string[] {
  if (Array.isArray(value)) value.forEach((v) => collectReferences(v, out, depth + 1));
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "reference" && typeof v === "string") {
        if (!(depth === 0 && obj.resourceType === "DetectedIssue")) out.push(v);
      } else collectReferences(v, out, depth + 1);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// UI helpers

/** "Valid FHIR R4 document · 312 resources" summary for the export card. */
export function bundleSummary(b: FhirBundle): { valid: boolean; errors: string[]; resourceCount: number; byType: Record<string, number>; label: string } {
  const errors = validateBundle(b);
  const byType: Record<string, number> = {};
  for (const e of b.entry ?? []) byType[e.resource.resourceType] = (byType[e.resource.resourceType] ?? 0) + 1;
  const n = b.entry?.length ?? 0;
  return {
    valid: errors.length === 0,
    errors,
    resourceCount: n,
    byType,
    label: errors.length === 0 ? `Valid FHIR R4 ${b.type} bundle · ${n} resources` : `FHIR bundle has ${errors.length} problem${errors.length === 1 ? "" : "s"}`,
  };
}

/** Pretty JSON for download (application/fhir+json). */
export function bundleToJson(b: FhirBundle): string {
  return `${JSON.stringify(b, null, 2)}\n`;
}

/** "kinwise-margaret-rivera-2026-10-11.fhir.json" */
export function fhirFileName(data: StoreData, today: ISODate): string {
  const slug = oneLine(data.profile.displayName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "record";
  return `kinwise-${slug}-${today}.fhir.json`;
}
