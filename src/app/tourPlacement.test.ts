import { describe, expect, it } from "vitest";
import { clampSpot, GAP, intersects, MIN_SIDE_WIDTH, placeDocked, placeFloating, scrollGoal, type Box } from "./tourPlacement";

const vp = { width: 1440, height: 900 };
const card = { width: 384, height: 480 };
const cardBox = (p: ReturnType<typeof placeFloating>, h = card.height): Box => ({
  top: p.card.top,
  left: p.card.left,
  width: p.card.width ?? card.width,
  height: h,
});

describe("tour placement", () => {
  it("clamps the spotlight to the viewport and below a sticky top bar", () => {
    const s = clampSpot({ top: -300, left: 330, width: 1060, height: 2000 }, { ...vp, topInset: 80 })!;
    expect(s.top).toBe(86);
    expect(s.top + s.height).toBe(894);
    expect(clampSpot({ top: 2000, left: 0, width: 100, height: 100 }, vp)).toBeNull();
  });

  it("puts the card beside a narrow target", () => {
    const spot = clampSpot({ top: 260, left: 970, width: 345, height: 340 }, vp)!;
    const p = placeFloating(spot, card, vp);
    expect(p.mode).toBe("left");
    expect(intersects(cardBox(p), p.spot!)).toBe(false);
  });

  it("uses a narrower card in the sidebar gutter beside a wide, tall target", () => {
    const spot = clampSpot({ top: 88, left: 372, width: 1020, height: 1400 }, vp)!;
    const p = placeFloating(spot, card, vp, 560);
    expect(p.mode).toBe("side-compact");
    expect(p.card.width).toBeGreaterThanOrEqual(MIN_SIDE_WIDTH);
    expect(p.card.left).toBeGreaterThanOrEqual(GAP);
    expect(intersects(cardBox(p, 560), p.spot!)).toBe(false);
  });

  it("trims the spotlight above the card when no gutter is wide enough", () => {
    const spot = clampSpot({ top: 40, left: 60, width: 1320, height: 1400 }, vp)!;
    const p = placeFloating(spot, card, vp);
    expect(p.mode).toBe("trimmed");
    expect(p.spot!.height).toBeGreaterThanOrEqual(160);
    expect(intersects(cardBox(p), p.spot!)).toBe(false);
  });

  it("never overlaps at the sizes the tour is demoed on", () => {
    for (const v of [
      { width: 1366, height: 860 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
    ]) {
      for (const t of [
        { top: 88, left: 330, width: v.width - 380, height: 1600 }, // whole section
        { top: 300, left: 330, width: v.width - 380, height: 420 }, // wide, medium
        { top: 120, left: 900, width: 340, height: 300 }, // narrow block
      ]) {
        const spot = clampSpot(t, v)!;
        const p = placeFloating(spot, card, v, 600);
        expect(p.mode).not.toBe("overlap");
        expect(intersects(cardBox(p, p.mode === "side-compact" ? 600 : card.height), p.spot!)).toBe(false);
      }
    }
  });

  it("tries below, then above, then left, then right of the target", () => {
    // A short, wide target with room both below and to the right: below wins (reading order).
    const v = { width: 1366, height: 860 };
    const c = { width: 384, height: 400 };
    const spot = clampSpot({ top: 100, left: 300, width: 400, height: 150 }, v)!;
    expect(placeFloating(spot, c, v).mode).toBe("below");
    // No room below: above.
    const low = clampSpot({ top: 560, left: 300, width: 400, height: 150 }, v)!;
    expect(placeFloating(low, c, v).mode).toBe("above");
    // A tall target near the right edge: left.
    const right = clampSpot({ top: 200, left: 900, width: 420, height: 460 }, v)!;
    expect(placeFloating(right, c, v).mode).toBe("left");
    // A tall target near the left edge: right.
    const left = clampSpot({ top: 200, left: 340, width: 420, height: 460 }, v)!;
    expect(placeFloating(left, c, v).mode).toBe("right");
  });

  // Step 8 ("Check our work") at 1366×860: the held-out scorecard sits in the right half of the page, with the
  // "Run again" button above it. Measured in Chrome from the tour (card 384×423, the scorecard's own box).
  const step8 = { width: 1366, height: 860 };
  const step8Card = { width: 384, height: 423 };
  const padded = (t: Box): Box => ({ top: t.top - 8, left: t.left - 8, width: t.width + 16, height: t.height + 16 });
  const inViewport = (b: Box, v: { width: number; height: number }) =>
    b.top >= 0 && b.left >= 0 && b.top + b.height <= v.height && b.left + b.width <= v.width;

  it("keeps the step-8 card clear of the held-out scorecard at 1366 wide", () => {
    const target = { top: 221, left: 368, width: 520, height: 418 };
    const p = placeFloating(clampSpot(target, step8), step8Card, step8);
    const box = cardBox(p, step8Card.height);
    expect(intersects(box, padded(target))).toBe(false);
    expect(inViewport(box, step8)).toBe(true);
  });

  it("keeps the card clear of a target near the right edge, at 1366 and 768 wide", () => {
    for (const v of [step8, { width: 768, height: 860 }, { width: 768, height: 1024 }]) {
      for (const target of [
        { top: 221, left: v.width - 540, width: 520, height: 418 }, // the scorecard pushed to the right edge
        { top: 120, left: v.width - 420, width: 400, height: 260 }, // a short block at the right edge
        { top: 96, left: 24, width: v.width - 48, height: 300 }, // a full-width block (the 768 layout)
      ]) {
        const spot = clampSpot(target, v)!;
        const p = placeFloating(spot, step8Card, v, 600);
        const h = p.mode === "side-compact" ? 600 : step8Card.height;
        const box = cardBox(p, h);
        expect(intersects(box, p.spot!)).toBe(false);
        if (p.mode !== "trimmed") expect(intersects(box, padded(target)), `${v.width}: ${p.mode}`).toBe(false);
        expect(inViewport(box, v), `${v.width}: ${p.mode}`).toBe(true);
      }
    }
  });

  it("docks the card in the corner only when no side and no trim works", () => {
    // A target filling a small viewport: nothing fits beside, above or below it, and too little is left to trim.
    const v = { width: 700, height: 500 };
    const p = placeFloating(clampSpot({ top: 10, left: 10, width: 680, height: 480 }, v), step8Card, v);
    expect(p.mode).toBe("overlap");
    expect(p.card).toEqual({ top: 500 - 423 - GAP, left: 700 - 384 - GAP });
  });

  it("scrolls tall or wide targets to the top and centres narrow ones", () => {
    expect(scrollGoal({ top: 500, left: 330, width: 1000, height: 800 }, card, vp, false)).toBe(24);
    expect(scrollGoal({ top: 500, left: 330, width: 1000, height: 800 }, card, { ...vp, topInset: 80 }, false)).toBe(104);
    expect(scrollGoal({ top: 500, left: 900, width: 300, height: 300 }, card, vp, false)).toBe(300);
    expect(scrollGoal({ top: 500, left: 0, width: 390, height: 300 }, card, { width: 390, height: 844 }, true)).toBe(12);
  });

  it("ends the phone spotlight above the docked sheet", () => {
    const p = placeDocked({ top: 70, left: 8, width: 374, height: 770 }, 500);
    expect(p.spot!.top + p.spot!.height).toBeLessThanOrEqual(500 - GAP / 2);
    expect(placeDocked({ top: 495, left: 8, width: 374, height: 300 }, 500).spot).toBeNull();
  });
});
