// The "Need help now?" notes, rendered with react-dom/server (the test environment is node, and the dialog itself
// opens in a portal, so its notes are tested as their own component).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HelpNotes } from "./Help";
import { SAFETY_NET_FOR_ANYONE } from "../engine/brief/safetyNet";

describe("Help notes", () => {
  const text = renderToStaticMarkup(createElement(HelpNotes)).replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

  it("tells people they need not wait for the visit (the same static line the brief prints)", () => {
    expect(text).toContain(SAFETY_NET_FOR_ANYONE);
  });

  it("keeps the 'not monitored' and 'don't stop or change medicines' notes", () => {
    expect(text).toContain("Kinwise is not monitored by anyone and does not notify anyone.");
    expect(text).toContain("Don’t stop or change medicines without talking to the prescriber.");
  });
});
