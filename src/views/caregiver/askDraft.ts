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
