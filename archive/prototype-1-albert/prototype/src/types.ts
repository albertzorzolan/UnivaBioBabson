export type Role = "patient" | "caregiver";
export type Answers = {
  energy: number | null;
  dizziness: boolean | null;
  dizzinessSeverity: number | null;
  confusion: boolean | null;
  appetite: "better" | "same" | "worse" | null;
  sleep: number | null;
  fallsOrNearFalls: boolean | null;
};
export type Field = keyof Answers;
export type Span = { start: number; end: number; quote: string };
export type Provenance = {
  origin: "manual" | "ai_suggested" | "user_skipped" | "seed_fixture";
  sourceSpans: Span[];
};
export type Day = {
  schemaVersion: "1.0";
  id: string;
  datasetId: string;
  dateLocal: string;
  timezone: string;
  reporterRole: "patient";
  isDemoData: true;
  rawStory: string;
  answers: Answers;
  answerProvenance: Record<Field, Provenance>;
  confirmationMethod: "manual_form" | "ai_review" | "seed_fixture";
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
  recordRevision: number;
};
export type Medication = {
  id: string;
  name: string;
  dose: string;
  schedule: string;
  reason: string;
  prescriber: string;
  startDate: string;
  endDate: string | null;
};
export type MedEvent = {
  id: string;
  medicationId: string;
  dateLocal: string;
  kind: "started" | "stopped" | "record_corrected" | "added_to_list";
  label: string;
};
export type Note = {
  id: string;
  dateLocal: string;
  text: string;
  role: Role;
  pinned: boolean;
};
export type Source = {
  schemaVersion: "1.0";
  datasetId: string;
  sourceRevision: number;
  isDemoData: true;
  createdAt: string;
  updatedAt: string;
  days: Day[];
  revisions: Day[];
  medications: Medication[];
  medicationEvents: MedEvent[];
  notes: Note[];
};
export type Fact = {
  id: string;
  label: string;
  text: string;
  value: string;
  detail: string;
  entryIds: string[];
};
export type Evidence = { id: string; text: string };
export type Operation =
  | "capture"
  | "clarify"
  | "record_summary"
  | "record_qa"
  | "education"
  | "visit_brief";
export type Proposal = {
  field: Field;
  value: Answers[Field];
  certainty: "explicit" | "ambiguous";
  sourceSpans: Span[];
};
export type Narrative = { text: string; evidenceIds: string[] };
export type AIResult = {
  schemaVersion: "1.0";
  requestId: string;
  operation: Operation;
  sourceRevision: number;
  evidenceHash: string;
  status: "ok" | "insufficient_evidence" | "outside_scope";
  payload: {
    proposals?: Proposal[];
    unmappedNotes?: Span[];
    clarificationQuestionIds?: string[];
    questionIds?: string[];
    items?: Narrative[];
    observations?: Narrative[];
    questions?: Narrative[];
    limitationCodes?: string[];
    reasonCode?: string;
  };
  mode: "ai";
  model: string;
  durationMs: number;
  fingerprint: string;
};
