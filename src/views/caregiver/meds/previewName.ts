// The medicine name the live review preview puts into prompt titles. Titles are built from the medication's name,
// so the raw search text ("tylenol pm", "benadril") would read as "tylenol pm with a history of falls". Once the
// match is confident we use the reference list's own label ("Tylenol PM"); otherwise the typed name, title-cased.
// Only the preview uses this: the saved medication keeps the name exactly as the family entered it.
import type { DrugMatch } from "../../../kb/types";
import { getDrug, prettyName, searchDrugs } from "../../../kb";

/** "Tylenol PM" → "tylenolpm": compare labels without case, spaces or punctuation. */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** Title-case only text typed all in lowercase; "CoQ10" or "Advil PM" were capitalised on purpose. */
function tidyTyped(typed: string): string {
  return typed === typed.toLowerCase() ? prettyName(typed) : typed;
}

export function previewName(typed: string, match: Pick<DrugMatch, "ingredientIds" | "match" | "suggestion" | "normalized">): string {
  const t = typed.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (match.ingredientIds.length === 0) return tidyTyped(t);
  // "Did you mean …?": the suggested reference name is what the preview assumes (and what the user confirms).
  if (match.match === "fuzzy" && match.suggestion) return match.suggestion;
  // The autocomplete label that is exactly this name ("advil pm" → "Advil PM", "ativan" → "Ativan").
  const q = match.normalized || t;
  try {
    const hit = searchDrugs(q, 8).find((h) => compact(h.label) === compact(q) && sameIds(h.ingredientIds, match.ingredientIds));
    if (hit) return hit.label;
  } catch {
    /* fall back below */
  }
  if (match.ingredientIds.length === 1 && compact(q) === compact(match.ingredientIds[0]))
    return getDrug(match.ingredientIds[0])?.display ?? tidyTyped(t);
  return tidyTyped(t);
}

/**
 * A prompt title for the preview list without a repeated drug name: Beers titles are "{med}: {rule label}", so
 * "Warfarin: warfarin as the first blood thinner" becomes "Warfarin as the first blood thinner". The prefix is
 * dropped only when the label starts with the same name as a whole word; any other title is returned unchanged.
 */
export function previewTitle(title: string): string {
  const m = /^([^:]+):\s+(.+)$/.exec(title.trim());
  if (!m) return title;
  const [, drug, label] = m;
  const head = label.slice(0, drug.length);
  const next = label.charAt(drug.length);
  if (head.toLowerCase() !== drug.toLowerCase() || /[a-z0-9]/i.test(next)) return title;
  return `${drug}${label.slice(drug.length)}`;
}
