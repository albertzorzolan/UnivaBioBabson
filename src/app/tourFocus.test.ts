// When the guided-tour card takes keyboard focus back (TourOverlay.tsx). The card hides while the page settles
// on a new target, and Chrome then drops the focus that was inside it; ←/→ only work while the card has focus, so
// it must take focus back when it reappears — but never from something the user chose to focus in the page.
import { describe, expect, it } from "vitest";
import { focusWhere, shouldReclaimFocus } from "./tourFocus";

// Stand-ins for DOM nodes: focusWhere only needs `contains` on the card.
const title = { id: "title" };
const pageButton = { id: "page-button" };
const body = { id: "body" };
const card = { contains: (n: unknown) => n === title };

describe("tour card focus", () => {
  it("tells apart focus in the card, in the page, and nowhere", () => {
    expect(focusWhere(card, title, body)).toBe("card");
    expect(focusWhere(card, pageButton, body)).toBe("page");
    expect(focusWhere(card, body, body)).toBe("none");
    expect(focusWhere(card, null, body)).toBe("none");
  });

  it("leaves focus alone while it is already in the card", () => {
    expect(shouldReclaimFocus("card", true)).toBe(false);
    expect(shouldReclaimFocus("card", false)).toBe(false);
  });

  it("takes focus back when the browser dropped it (hidden card, removed element)", () => {
    expect(shouldReclaimFocus("none", true)).toBe(true);
    expect(shouldReclaimFocus("none", false)).toBe(true);
  });

  it("takes focus back from the page only while the card still owns it", () => {
    // A view moved focus to its own <h1> after navigation: the user did not, so the card takes it back.
    expect(shouldReclaimFocus("page", true)).toBe(true);
    // The user clicked or tabbed into the page (e.g. the spotlighted element): focus stays where they put it.
    expect(shouldReclaimFocus("page", false)).toBe(false);
  });
});
