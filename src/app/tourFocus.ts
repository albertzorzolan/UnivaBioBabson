// When the guided-tour card takes keyboard focus back (used by TourOverlay.tsx; tested in tourFocus.test.ts).
//
// The card is hidden while the page settles on a new target — at a new step, and again mid-step when the
// spotlight moves (step 2: the story box becomes the extraction; step 8: the benchmark card becomes the held-out
// scorecard). A hidden element cannot keep focus, so the browser drops it, and views also move focus to their own
// <h1> after navigation. ←/→ are handled by the card, so it must take focus back when it reappears — but never
// from something the user chose to focus in the page (for example, by clicking the spotlighted element).

/** Where keyboard focus is: inside the card, on something else in the page, or nowhere (<body> or null). */
export type FocusWhere = "card" | "page" | "none";

export function focusWhere<N>(card: { contains(node: N): boolean }, active: N | null, body: N): FocusWhere {
  if (!active || active === body) return "none";
  return card.contains(active) ? "card" : "page";
}

/**
 * Whether the card should focus its title now. `owned`: the card had focus and the user has not since clicked
 * or tabbed into the page, so focus elsewhere was moved by the browser or a view, not by them.
 */
export function shouldReclaimFocus(where: FocusWhere, owned: boolean): boolean {
  if (where === "card") return false;
  if (where === "none") return true;
  return owned;
}
