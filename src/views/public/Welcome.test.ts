// Welcome's access card: the guided tour and the two "Try as" buttons are the only visible ways in; the demo
// sign-in form sits behind a closed disclosure (still a real button, still a working form once opened).
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isUnknownHash, NOT_FOUND_HINT, Welcome } from "./Welcome";

// useSession has no server snapshot (the app never renders on a server), so the static render below needs a
// signed-out session from a stub. Everything else (login, DEMO_ACCOUNTS) is the real module.
vi.mock("../../app/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../app/session")>()),
  useSession: () => null,
}));

const html = renderToStaticMarkup(createElement(Welcome));
/** The markup of the disclosure panel the trigger controls (React ids contain colons, so match them literally). */
const panel = () => {
  const trigger = html.match(/<button[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*>(?:(?!<\/button>).)*Have the demo credentials\? Sign in/s);
  expect(trigger, "disclosure trigger").not.toBeNull();
  const id = trigger![1];
  const start = html.indexOf(`id="${id}"`);
  expect(start).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<div", start), html.indexOf("</form>", start) + 2000);
};

describe("Welcome access card", () => {
  it("keeps the guided tour and both Try-as buttons visible", () => {
    expect(html).toContain("Take the 2-minute guided tour");
    expect(html).toContain("Try as Margaret");
    expect(html).toContain("Try as Alex");
    const p = panel();
    expect(p).not.toContain("Try as");
    expect(p).not.toContain("guided tour");
  });

  it("collapses the demo sign-in form, credentials and the 'not real authentication' note behind a closed disclosure", () => {
    const p = panel();
    expect(p).toMatch(/^<div[^>]*hidden=""/);
    expect(p).toContain('name="username"');
    expect(p).toContain('name="password"');
    expect(p).toContain("Demo accounts");
    expect(p).toMatch(/not real authentication/);
    expect(html).not.toMatch(/or sign in with a demo account/i);
  });

  it("promises no sign-up, not 'no accounts' (the page itself offers demo accounts)", () => {
    expect(html).toContain("No Kinwise server, no sign-up, no tracking.");
    expect(html).not.toMatch(/no accounts/i);
  });

  it("does not show the not-found hint on the home page", () => {
    expect(html).not.toContain(NOT_FOUND_HINT);
  });
});

describe("unknown routes", () => {
  it("flags a hash that names no route, and nothing else", () => {
    expect(isUnknownHash("#/no-such-page")).toBe(true);
    expect(isUnknownHash("#/c/nope?x=1")).toBe(true);
    for (const h of ["", "#", "#/", "#/?next=/c/brief", "#/c/overview", "#/how-it-works?section=how-evaluation"]) expect(isUnknownHash(h), h).toBe(false);
  });

  it("words the hint plainly", () => {
    expect(NOT_FOUND_HINT.replace(/’/g, "'")).toBe("That page doesn't exist; choose a view below.");
  });
});
