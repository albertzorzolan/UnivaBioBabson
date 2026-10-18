// Brief engine public API (SPEC §6.5–6.6, §10): evidence package, deterministic template brief, claim checker,
// FHIR R4 export, record Q&A and pharmacist-ready outputs. Pure modules: safe to import from views, the AI layer,
// tests and the in-app evaluation runner.

export {
  buildEvidence,
  defaultPeriod,
  evidenceById,
  evidenceHash,
  evidenceId,
  includedConcerns,
  periodDays,
  rankFindings,
  rankSignals,
  mostRecentStart,
  EVIDENCE_LIMITS,
  SIGNAL_EVIDENCE_CAVEAT,
} from "./evidence";
export type { BriefEvidenceItem, BuildEvidenceInput, EvidenceData } from "./evidence";

export {
  templateBrief,
  templateGenerationInfo,
  toVisitBrief,
  missingEvidenceIds,
  promptFindings,
  selectReviewPrompts,
  findingSourceShort,
  findingQuestionSentences,
  findingQuestionText,
  LIMITATION_LINES,
  SAFETY_LINE,
  TEMPLATE_LIMITS,
} from "./template";
export type { TemplateInput } from "./template";

export { BANNED_PATTERNS, verifySentence, verifyClaims, formatIssues } from "./verify";
export type { BannedPattern, VerifyIssue, VerifyOptions } from "./verify";

export {
  toFhirBundle,
  validateBundle,
  bundleSummary,
  bundleToJson,
  fhirFileName,
  deterministicUuid,
  DEMO_TAG,
  TEST_DATA_LABEL,
} from "./fhir";
export type { FhirBundle, FhirBundleEntry, FhirResource, FhirExportInput } from "./fhir";

export {
  routeQuestion,
  retrieveForQuestion,
  parseQuestion,
  redirectText,
  EMERGENCY_REDIRECT,
  CRISIS_REDIRECT,
  CRISIS_RULE,
  NOT_FOUND_TEXT,
  MAX_ANSWER_SENTENCES,
} from "./qa";
export type { QuestionRoute, OutOfScopeCategory, QaIntent, QaResult, RetrieveInput, ParsedQuestion } from "./qa";

export { toPersonalMedicationList, pmlToPlainText, briefToPlainText, symptomLines, PML_COLUMNS, SYMPTOMS_HEADING, ALLERGIES_UNKNOWN } from "./cmr";
export type { PersonalMedicationList, PmlRow, PmlInput, PlainTextOptions } from "./cmr";

export { PRODUCT_NAME, DEFAULT_KB, CATEGORY_TEXT, CONDITION_LABEL, METRIC_PHRASE } from "./shared";
export type { BriefKb } from "./shared";

/** Suggested questions for "Ask Kinwise" (SPEC-UI). Each is answered from the records by retrieveForQuestion. */
export const SUGGESTED_QUESTIONS = [
  "When did the dizziness start?",
  "How many near-falls since lorazepam started?",
  "What did Mom say about sleep this week?",
  "Which medicines are on the Beers list?",
  "What changed in the last two weeks?",
] as const;
