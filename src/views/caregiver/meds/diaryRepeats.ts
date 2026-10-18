// Review page: which finding cards would only repeat diary entries that an earlier card already shows in full.
//
// Several prompts cite the same diary items (every fall-risk medicine lists dizziness, falls and near-falls; each
// lorazepam prompt lists the same before/after patterns). The counts are the same on every card (one 30-day window,
// one set of timeline signals), so a card is collapsed when every diary item it cites is already shown in full on an
// earlier, visible card. It then starts with a one-line "Diary entries already shown above" summary that expands
// inline. A card with even one item not shown yet keeps its full block.
//
// "Shown in full" means what FindingCard actually renders: all related symptom counts plus the first
// DIARY_SIGNALS_SHOWN timeline patterns that resolve (the rest are summarised as "and N more patterns on the
// timeline"). A card the caregiver set aside ("Not relevant") collapses to one line, so it shows nothing and never
// counts as "above". Nothing is hidden for good: every count and "show the records" link stays one click away.
import type { Finding } from "../../../model/types";

type DiaryCitation = Pick<Finding, "relatedSymptoms" | "signalIds">;

/** How many timeline patterns a finding card shows in its diary block; FindingCard uses the same limit. */
export const DIARY_SIGNALS_SHOWN = 2;

/** The signal ids a card's diary block renders: the first DIARY_SIGNALS_SHOWN that the timeline still knows. */
export function shownSignalIds(f: DiaryCitation, hasSignal: (id: string) => boolean): string[] {
  return f.signalIds.filter(hasSignal).slice(0, DIARY_SIGNALS_SHOWN);
}

/** The diary items a finding's block renders: its related symptom counts and its shown timeline patterns. */
export function diaryItems(f: DiaryCitation, hasSignal: (id: string) => boolean): string[] {
  return [...f.relatedSymptoms.map((m) => `metric:${m}`), ...shownSignalIds(f, hasSignal).map((id) => `signal:${id}`)];
}

/** Number of diary items in a finding's block, counted from the same list the block renders. */
export function diaryItemCount(f: DiaryCitation, hasSignal: (id: string) => boolean): number {
  return diaryItems(f, hasSignal).length;
}

/**
 * For findings in display order: the keys of findings whose every rendered diary item is already shown in full on
 * an earlier, visible card. `isHidden` marks cards that show no diary block (set aside): they add nothing to what
 * is "above" and are never marked as repeats themselves. Findings with no diary items are never in the set.
 */
export function repeatedDiaryBlocks(
  findings: readonly (DiaryCitation & Pick<Finding, "key">)[],
  opts: { hasSignal: (id: string) => boolean; isHidden?: (key: string) => boolean },
): Set<string> {
  const shown = new Set<string>();
  const repeats = new Set<string>();
  for (const f of findings) {
    if (opts.isHidden?.(f.key)) continue;
    const items = diaryItems(f, opts.hasSignal);
    if (items.length === 0) continue;
    if (items.every((item) => shown.has(item))) repeats.add(f.key);
    else for (const item of items) shown.add(item);
  }
  return repeats;
}
