// The "Need help now?" notes, rendered with react-dom/server (the test environment is node, and the dialog itself
// opens in a portal, so its notes are tested as their own component).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HelpLines, HelpNotes } from "./Help";
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

describe("Help lines", () => {
  const html = renderToStaticMarkup(createElement(HelpLines));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("names the everyday red flags that can be an emergency (a static line, not triage)", () => {
    expect(text).toContain("Sudden confusion, a fall with a head injury, or trouble breathing can be an emergency: call 911.");
  });

  it("shows the emergency sentence exactly once in the whole dialog (lines plus notes)", () => {
    const notes = renderToStaticMarkup(createElement(HelpNotes)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const all = `${text} ${notes}`;
    expect(all.split("can be an emergency: call 911.").length - 1).toBe(1);
  });

  it("keeps 911, Poison Control and 988 as phone links", () => {
    expect(html).toContain('href="tel:911"');
    expect(html).toContain('href="tel:18002221222"');
    expect(html).toContain('href="tel:988"');
  });
});
