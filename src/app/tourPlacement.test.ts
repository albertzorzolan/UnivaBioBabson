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
