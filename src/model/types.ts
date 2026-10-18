// Kinwise v2 domain contracts. Pure types only — shared by engines, AI layer and UI.
// Dates are local calendar dates in ISO form (YYYY-MM-DD) unless named *At (ISO timestamps).

export type ISODate = string;
export type ISODateTime = string;
export type Role = "patient" | "caregiver";

// ---------------------------------------------------------------------------
// Patient profile

/** Conditions that activate condition-specific (drug–disease) review rules. */
export type ConditionTag =
  | "history_of_falls"
  | "dementia_or_cognitive_impairment"
  | "delirium_history"
  | "heart_failure"
  | "chronic_kidney_disease"
  | "parkinson_disease"
  | "gi_bleeding_or_ulcer_history"
  | "hypertension"
  | "type2_diabetes"
  | "atrial_fibrillation"
  | "urinary_incontinence"
  | "benign_prostatic_hyperplasia"
  | "insomnia"
  | "depression"
  | "anxiety"
  | "osteoarthritis"
  | "osteoporosis"
  | "seizure_disorder";

export interface PatientProfile {
  displayName: string; // e.g. "Margaret Rivera"
  preferredName: string; // e.g. "Margaret"
  age: number;
  sex: "female" | "male" | "other" | null;
  conditions: ConditionTag[];
  /** Creatinine clearance in mL/min if the family knows it; enables renal rules. */
  crclMlMin: number | null;
  caregiverName: string; // e.g. "Alex"
  caregiverRelation: string; // e.g. "daughter"
}

// ---------------------------------------------------------------------------
// Medications

export interface Medication {
  id: string;
  /** Name exactly as entered by the family (may be a brand or combination product). */
  name: string;
  /** Canonical KB ingredient ids this entry resolved to (empty if not in the reference set). */
  ingredientIds: string[];
  /** How the name was matched; "none" = not in Kinwise's reference set (never implies "safe"). */
  match: "exact" | "brand" | "alias" | "combo" | "fuzzy_confirmed" | "none";
  dose: string;
  frequency: string;
  asNeeded: boolean;
  otc: boolean;
  reason: string;
  prescriber: string;
  startDate: ISODate;
  endDate: ISODate | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type MedEventKind = "started" | "stopped" | "dose_changed" | "added_to_list" | "corrected";

export interface MedEvent {
  id: string;
  medicationId: string;
  date: ISODate;
  kind: MedEventKind;
  detail: string;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Daily check-ins (patient-reported, confirmed before saving)

/** Structured diary fields. null = not answered (never treated as "no"). */
export interface DiaryAnswers {
  energy: 1 | 2 | 3 | 4 | 5 | null;
  sleep: 1 | 2 | 3 | 4 | 5 | null;
  appetite: "better" | "same" | "worse" | null;
  dizziness: boolean | null;
  dizzinessSeverity: 1 | 2 | 3 | null; // mild / moderate / severe, only when dizziness === true
  drowsiness: boolean | null;
  confusion: boolean | null;
  fall: boolean | null;
  nearFall: boolean | null;
  swelling: boolean | null;
}
export type DiaryField = keyof DiaryAnswers;

/** Boolean diary symptoms used by the timeline + review engines. */
export type SymptomKey = "dizziness" | "drowsiness" | "confusion" | "fall" | "nearFall" | "swelling";
/** 1–5 scale metrics. */
export type ScaleKey = "energy" | "sleep";
/** Everything the timeline engine can analyse. "appetiteWorse" = appetite === "worse". */
export type MetricKey = SymptomKey | ScaleKey | "appetiteWorse";

/** Additional symptom concepts captured from free text (coded, outside the core form). */
export type ConceptId =
  | "nausea"
  | "constipation"
  | "dry_mouth"
  | "headache"
  | "cough"
  | "blurred_vision"
  | "urinary_problem"
  | "low_mood"
  | "anxiety"
  | "pain"
  | "shortness_of_breath"
  | "tremor"
  | "rash"
  | "diarrhea"
  | "palpitations"
  | "bleeding_or_bruising"
  | "black_stools"
  | "shakiness_or_sweating";

export interface Span {
  start: number; // UTF-16 offset into the story
  end: number;
  quote: string; // must equal story.slice(start, end)
}

export type ProvenanceOrigin = "manual" | "nlp" | "llm" | "seed";

export interface FieldProvenance {
  origin: ProvenanceOrigin;
  /** explicit = stated outright; inferred = mapped from wording (user confirmed); */
  certainty: "explicit" | "inferred" | null;
  spans: Span[];
}

export interface OtherSymptom {
  conceptId: ConceptId;
  present: boolean;
  span: Span | null;
}

export interface CheckIn {
  id: string;
  date: ISODate;
  answers: DiaryAnswers;
  otherSymptoms: OtherSymptom[];
  /** The patient's own words, kept verbatim. */
  story: string;
  provenance: Partial<Record<DiaryField, FieldProvenance>>;
  /** Medication remarks found in the story, e.g. "forgot my evening pill". */
  medNotes: { medicationId: string | null; text: string; span: Span | null }[];
  confirmedAt: ISODateTime;
  revision: number;
}

export interface Note {
  id: string;
  date: ISODate;
  author: Role;
  text: string;
  /** Pinned notes are visit concerns: always included in the brief unless deselected there. */
  pinned: boolean;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Medication review (deterministic engine output)

export type FindingCategory =
  | "beers_avoid"
  | "beers_caution"
  | "beers_condition"
  | "beers_interaction"
  | "beers_renal"
  | "anticholinergic_burden"
  | "fall_risk"
  | "prescribing_cascade"
  | "duplicate_class"
  | "cns_active_combo"
  /** Not a problem flag: high-ADE-risk medicines (anticoagulants, insulin, sulfonylureas, opioids…) with what to watch for. */
  | "monitoring";

export interface Finding {
  /** Stable key: ruleId + sorted med ids. Used to persist review decisions. */
  key: string;
  ruleId: string;
  category: FindingCategory;
  title: string;
  medIds: string[];
  /** Plain-language explanation for families (≤2 sentences). */
  plain: string;
  /** Clinician-facing rationale (≤2 sentences). */
  clinician: string;
  /** Question to bring to the clinician/pharmacist. Never an instruction. */
  question: string;
  sourceIds: string[];
  /** e.g. "AGS Beers 2023 · strong recommendation · moderate-quality evidence" */
  evidenceGrade: string | null;
  /** Diary symptoms that are known effects of the involved meds AND were recorded in the last 30 days. */
  relatedSymptoms: MetricKey[];
  /** Timeline signal ids that involve the same medication(s). */
  signalIds: string[];
}

export interface AcbSummary {
  total: number;
  band: "none" | "low" | "elevated" | "high"; // 0 / 1-2 / 3-4 / >=5 (document thresholds in KB)
  contributors: { medId: string; ingredientId: string; score: 1 | 2 | 3 }[];
}

export interface MedReview {
  findings: Finding[];
  acb: AcbSummary;
  fallRiskMedIds: string[];
  unmatchedMedIds: string[];
  /** Conditions in effect for this review, including diary-derived ones (e.g. history_of_falls). */
  effectiveConditions: { tag: ConditionTag; from: "profile" | "diary" }[];
  notices: string[]; // e.g. "Beers criteria apply to adults 65+; age is 52 so they were not applied."
  kbVersion: string;
}

export type ReviewStatus = "open" | "to_discuss" | "discussed" | "dismissed";

export interface ReviewDecision {
  findingKey: string;
  status: ReviewStatus;
  note: string;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Timeline signals (deterministic engine output)

export interface WindowStat {
  from: ISODate;
  to: ISODate;
  answered: number;
  /** For boolean metrics: days with the symptom. For scale metrics: sum of ratings. */
  positive: number;
  /** Rate (0–1) for boolean metrics, mean (1–5) for scale metrics. */
  value: number;
}

/**
 * Runs-aware check of a before/after difference: a seeded circular block-permutation test that shuffles whole runs
 * of days instead of single days (engine/timeline/blockPermutation.ts).
 */
export interface RunsCheck {
  /** (1 + shuffles with a difference at least as large) / (permutations + 1). */
  p: number;
  /** Length of each shuffled run of days. */
  blockDays: number;
  permutations: number;
  /** true when the runs check supports the strength the Fisher / Mann–Whitney test gave on its own. */
  passed: boolean;
}

export interface Signal {
  id: string; // e.g. "sig:med-lorazepam:dizziness:started"
  medicationId: string;
  event: "started" | "stopped";
  eventDate: ISODate;
  metric: MetricKey;
  before: WindowStat;
  after: WindowStat;
  direction: "worse" | "better";
  strength: "strong" | "moderate" | "weak";
  pValue: number;
  test: "fisher_exact" | "mann_whitney";
  /** Other medication starts/stops within ±21 days of eventDate. */
  overlappingMedIds: string[];
  /** The KB lists this metric as a recognised effect of the medication. */
  knownEffect: boolean;
  text: string; // code-rendered sentence with counts
  /** Runs-aware check of the same difference (optional: older saved analyses and fixtures do not have it). */
  runsCheck?: RunsCheck;
}

export interface MedTimeline {
  medicationId: string;
  event: "started" | "stopped";
  eventDate: ISODate;
  status: "ok" | "insufficient" | "too_recent" | "outside_range";
  reason: string | null;
  signals: Signal[];
}

export interface TimelineAnalysis {
  perMed: MedTimeline[];
  signals: Signal[]; // all signals, strongest first
}

export interface WeeklyTrend {
  metric: MetricKey;
  direction: "better" | "worse" | "same" | "not_enough";
  thisWeek: WindowStat;
  lastWeek: WindowStat;
  text: string; // plain language for the patient view
}

// ---------------------------------------------------------------------------
// NLP extraction

export interface Proposal {
  field: DiaryField;
  value: DiaryAnswers[DiaryField];
  certainty: "explicit" | "inferred" | "conflict";
  spans: Span[];
  /** Human-readable reason, e.g. 'From "nearly went over in the kitchen"'. */
  reason: string;
  origin: "nlp" | "llm";
}

export interface Mention {
  concept: DiaryField | ConceptId;
  span: Span;
  negated: boolean;
  temporality: "current" | "historical" | "hypothetical";
  experiencer: "patient" | "other";
  /** The trigger words that set negation/temporality/experiencer, for explanation UI. */
  triggers: Span[];
}

export interface Extraction {
  proposals: Proposal[];
  otherSymptoms: OtherSymptom[];
  mentions: Mention[];
  medNotes: CheckIn["medNotes"];
  /** Mentions deliberately NOT mapped to today's answers, with reasons (someone else, last week, hypothetical). */
  skipped: { mention: Mention; reason: string }[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Evidence package, brief, AI provenance

export type EvidenceKind = "fact" | "signal" | "finding" | "med" | "note" | "concern" | "entry";

export interface EvidenceItem {
  id: string; // "fact:coverage", "sig:...", "find:<key>", "med:<id>", "note:<id>", "concern:<id>", "entry:<id>"
  kind: EvidenceKind;
  /** One factual, code-rendered sentence. AI must only restate what is here. */
  text: string;
}

export interface EvidencePackage {
  from: ISODate;
  to: ISODate;
  generatedAt: ISODateTime;
  items: EvidenceItem[];
  hash: string; // stable hash of items (for staleness checks)
}

export interface BriefSentence {
  text: string;
  evidenceIds: string[];
}

export interface BriefContent {
  reason: BriefSentence[]; // "Why we're coming in"
  noticed: BriefSentence[]; // "What we've noticed"
  reviewPrompts: { findingKey: string; text: string; sourceShort: string }[];
  questions: BriefSentence[]; // "Our questions"
  limitations: string[];
}

export interface GenerationInfo {
  mode: "template" | "ai";
  model: string | null;
  promptVersion: string | null;
  kbVersion: string;
  durationMs: number | null;
  droppedSentences: number; // AI sentences removed by verification
  evidenceHash: string;
  generatedAt: ISODateTime;
}

export interface VisitBrief {
  id: string;
  from: ISODate;
  to: ISODate;
  content: BriefContent;
  generation: GenerationInfo;
  includedConcernIds: string[];
  reviewedAt: ISODateTime | null;
  reviewedBy: Role | null;
  sourceRevision: number;
}

// ---------------------------------------------------------------------------
// Persistent store

export interface Settings {
  textSize: "standard" | "large" | "extra";
  theme: "light" | "dark" | "system";
  aiModel: string; // WebLLM model id the user chose
  tourCompleted: boolean;
}

export interface StoreData {
  schemaVersion: 2;
  datasetId: string;
  /** Increments on every committed change to source records. */
  revision: number;
  isDemoData: boolean;
  profile: PatientProfile;
  medications: Medication[];
  medEvents: MedEvent[];
  checkIns: CheckIn[];
  /** Prior versions of edited check-ins (audit trail). */
  checkInHistory: CheckIn[];
  notes: Note[];
  reviewDecisions: ReviewDecision[];
  briefs: VisitBrief[];
  /** Questions the caregiver saved for the visit (from findings, Q&A redirects or typed). */
  savedQuestions: { id: string; text: string; source: string; createdAt: ISODateTime }[];
  settings: Settings;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
