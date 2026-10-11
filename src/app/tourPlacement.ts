// Pure geometry for the guided tour (TourOverlay.tsx): where to scroll, which part of the target to
// spotlight, and where the card goes so that it never covers the spotlight.
//
// All boxes are viewport coordinates (getBoundingClientRect). Nothing here touches the DOM, so it is
// unit-tested in tourPlacement.test.ts.

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Bottom edge of a sticky/fixed bar at the top of the page (0 if none). Spotlights start below it. */
  topInset?: number;
}

/** Space between the card, the spotlight and the viewport edges. */
export const GAP = 16;
/** Padding drawn around the target. */
export const PAD = 8;
/** Narrowest card we will squeeze into a side gutter (beside a wide target, e.g. over the sidebar). */
export const MIN_SIDE_WIDTH = 272;
/** A spotlight trimmed to make room for the card must keep at least this much of the target visible. */
export const MIN_TRIMMED_SPOT = 160;
/** A target taller than this share of the viewport is scrolled to the top instead of centred. */
export const TALL_SHARE = 0.6;

const bottomOf = (b: Box) => b.top + b.height;
const rightOf = (b: Box) => b.left + b.width;

/** The target's padded box clipped to the visible viewport (below any sticky top bar). Null if <8px remains. */
export function clampSpot(target: Box, vp: Viewport): Box | null {
  const edge = 6;
  const top = Math.max(target.top - PAD, (vp.topInset ?? 0) + edge);
  const left = Math.max(target.left - PAD, edge);
  const bottom = Math.min(bottomOf(target) + PAD, vp.height - edge);
  const right = Math.min(rightOf(target) + PAD, vp.width - edge);
  if (bottom - top < 8 || right - left < 8) return null;
  return { top, left, width: right - left, height: bottom - top };
}

export function intersects(a: Box, b: Box): boolean {
  return a.left < rightOf(b) && rightOf(a) > b.left && a.top < bottomOf(b) && bottomOf(a) > b.top;
}

/** Widest side gutter (left or right of the target) available for the card, minus the gaps. */
function sideGutters(target: Box, vp: Viewport): { left: number; right: number } {
  return {
    left: target.left - PAD - 2 * GAP,
    right: vp.width - (rightOf(target) + PAD) - 2 * GAP,
  };
}

/**
 * Where the target's top should land after scrolling (viewport y), or null to leave the scroll alone.
 * Tall targets, and wide ones the card cannot sit beside, go near the top so the card has room below;
 * narrow ones are centred. Docked (phone) cards sit at the bottom, so the target always goes to the top.
 */
export function scrollGoal(target: Box, card: Size, vp: Viewport, docked: boolean): number {
  const top = (vp.topInset ?? 0) + 24;
  if (docked) return top - 12;
  if (target.height > vp.height * TALL_SHARE) return top;
  const g = sideGutters(target, vp);
  const besideFits = Math.max(g.left, g.right) >= Math.min(card.width, MIN_SIDE_WIDTH);
  if (besideFits) return Math.max(top, (vp.height - target.height) / 2);
  return top;
}

export interface Placement {
  /** Card position; `width` is set only when the card must be narrower than its natural width. */
  card: { top: number; left: number; width?: number };
  /** Spotlight to draw (possibly trimmed so the card fits beside it). */
  spot: Box | null;
  /** How the card was placed (for tests and debugging). */
  mode: "center" | "right" | "left" | "below" | "above" | "side-compact" | "trimmed" | "docked" | "overlap";
}

/**
 * Place a floating (desktop) card next to the spotlight. `card` is the card's natural size at its normal
 * width; `compactHeight` (optional) is its measured height at the compact width from a previous pass.
 */
export function placeFloating(spot: Box | null, card: Size, vp: Viewport, compactHeight?: number): Placement {
  const clampX = (x: number, w = card.width) => Math.min(Math.max(x, GAP), vp.width - w - GAP);
  const clampY = (y: number, h = card.height) => Math.min(Math.max(y, GAP), vp.height - h - GAP);
  if (!spot) return { card: { top: clampY((vp.height - card.height) / 2), left: clampX((vp.width - card.width) / 2) }, spot, mode: "center" };

  const right = rightOf(spot);
  const bottom = bottomOf(spot);
  if (right + GAP + card.width <= vp.width - GAP) return { card: { top: clampY(spot.top), left: right + GAP }, spot, mode: "right" };
  if (spot.left - GAP - card.width >= GAP) return { card: { top: clampY(spot.top), left: spot.left - GAP - card.width }, spot, mode: "left" };
  if (bottom + GAP + card.height <= vp.height - GAP) return { card: { top: bottom + GAP, left: clampX(spot.left) }, spot, mode: "below" };
  if (spot.top - GAP - card.height >= GAP) return { card: { top: spot.top - GAP - card.height, left: clampX(spot.left) }, spot, mode: "above" };

  // A narrower card in the wider side gutter (on desktop: over the dimmed sidebar).
  const leftGutter = spot.left - 2 * GAP;
  const rightGutter = vp.width - right - 2 * GAP;
  const gutter = Math.max(leftGutter, rightGutter);
  const h = compactHeight ?? card.height;
  if (gutter >= MIN_SIDE_WIDTH && h <= vp.height - 2 * GAP) {
    const width = Math.min(card.width, Math.floor(gutter));
    const left = leftGutter >= rightGutter ? spot.left - GAP - width : right + GAP;
    return { card: { top: clampY(spot.top, h), left, width }, spot, mode: "side-compact" };
  }

  // Trim the spotlight to the part above the card, which sits at the bottom (the target was scrolled to the top).
  const cardTop = vp.height - card.height - GAP;
  const trimmedBottom = cardTop - GAP;
  if (trimmedBottom - spot.top >= MIN_TRIMMED_SPOT) {
    return {
      card: { top: cardTop, left: clampX(spot.left + (spot.width - card.width) / 2) },
      spot: { ...spot, height: trimmedBottom - spot.top },
      mode: "trimmed",
    };
  }
  return { card: { top: vp.height - card.height - GAP, left: vp.width - card.width - GAP }, spot, mode: "overlap" };
}

/** Phones: the card is docked to the bottom by CSS; trim the spotlight so it ends above the sheet. */
export function placeDocked(spot: Box | null, sheetTop: number): Placement {
  if (!spot) return { card: { top: sheetTop, left: 0 }, spot, mode: "docked" };
  const bottom = Math.min(bottomOf(spot), sheetTop - GAP / 2);
  const height = bottom - spot.top;
  return { card: { top: sheetTop, left: 0 }, spot: height >= 24 ? { ...spot, height } : null, mode: "docked" };
}
