// Ask Kinwise helpers that need no React (unit-tested in askDraft.test.ts).

/** Lower-case words and digits only, single-spaced: compares texts ignoring case, spacing and punctuation. */
export function normalize(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * True when an AI draft only repeats the records answer, so showing it would duplicate the answer: ignoring
 * case, spacing and punctuation, the whole draft equals the whole answer, or every draft sentence is one of
 * the answer's sentences. An empty draft counts as repeating (it adds nothing).
 */
export function repeatsRecords(draft: { text: string }[], records: { text: string }[]): boolean {
  const said = new Set(records.map((s) => normalize(s.text)));
  const all = (xs: { text: string }[]) => normalize(xs.map((s) => s.text).join(" "));
  return all(draft) === all(records) || draft.every((s) => said.has(normalize(s.text)));
}

/**
 * Shown when the on-device model read the answer but its draft was empty or only repeated the records answer: the
 * model did its job, and the records answer was already the plainest wording it found.
 */
export const NOTHING_PLAINER = "The on-device AI checked this answer against the records; the records answer above is already as plain as it can make it.";
/** Shown when the model was never asked (aiAnswer had no evidence to send it), so nothing can be said about it. */
export const ALREADY_PLAIN = "The records answer is already plain.";

/**
 * Did aiAnswer actually run the model? Its no-evidence short cut returns an empty report (no output, 0 ms, no
 * evidence shown); a real run always reports the evidence it showed the model, its raw output or its time.
 */
export function modelRan(report: { raw: string; ms: number; evidenceShown: string[] }): boolean {
  return report.raw.length > 0 || report.ms > 0 || report.evidenceShown.length > 0;
}

/** Shown when the model wrote sentences but the claim check removed every one of them. */
export const DRAFT_FAILED_CHECK = "The on-device AI's draft didn't pass the records check, so only the records answer is shown.";

/**
 * The muted line under an answer when there is no separate AI draft to show. `dropped` is how many draft sentences
 * the check removed and `kept` how many passed; when the model wrote something and none of it passed, the line says
 * so instead of claiming it had nothing to add.
 */
export function emptyDraftNote(report: { raw: string; ms: number; evidenceShown: string[] }, dropped = 0, kept = 0): string {
  if (!modelRan(report)) return ALREADY_PLAIN;
  return dropped > 0 && kept === 0 ? DRAFT_FAILED_CHECK : NOTHING_PLAINER;
}

/** The suggested questions with `lead` first (the rest keep their order); unchanged when `lead` is not among them. */
export function leadWith(questions: readonly string[], lead: string): string[] {
  return questions.includes(lead) ? [lead, ...questions.filter((q) => q !== lead)] : [...questions];
}
