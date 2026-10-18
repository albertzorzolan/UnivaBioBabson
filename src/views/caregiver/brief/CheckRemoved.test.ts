// "What the check removed" as it renders, through react-dom/server (the test environment is node, so the markup is
// read as text). The list quotes blocked AI text word for word, so the caution around it matters as much as the list.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The stylesheet import is irrelevant to the markup.
vi.mock("./check-removed.css", () => ({}));
import { CheckRemoved } from "./CheckRemoved";

const ITEMS = [
  { section: "questions", text: "It makes sense to pause the lorazepam until the visit.", issues: ['banned: advice: names a medicine together with an action word ("pause")'] },
  { section: "noticed", text: "Dizziness was recorded on 12 of 14 days.", issues: ["number_unsupported: 12 is not in the cited evidence"] },
];
const html = (name = "Margaret") => renderToStaticMarkup(createElement(CheckRemoved, { items: ITEMS, name }));
const text = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

describe("CheckRemoved", () => {
  it("is collapsed by default and counts the removed sentences", () => {
    expect(html()).toMatch(/^<details class="cg-vb-removed">/);
    expect(html()).not.toMatch(/<details[^>]*\bopen\b/);
    expect(text(html())).toContain("What the check removed (2)");
  });
  it("says why the sentences are missing: a wording rule or the records, not only the records", () => {
    const t = text(html());
    expect(t).toContain("The on-device AI wrote these sentences, but they are not in the brief.");
    expect(t).toContain("Each one broke a wording rule (for example, it suggested changing a medicine) or did not match Margaret’s records.");
  });
  it("tells the family the removed sentences are not advice and to ask the prescriber or pharmacist", () => {
    const t = text(html());
    expect(t).toContain("These sentences are not advice. Don’t start, stop or change any medicine because of them; ask the prescriber or pharmacist.");
    // The caution comes before the quoted sentences, so nobody reads a blocked "pause the lorazepam" first.
    expect(t.indexOf("not advice")).toBeLessThan(t.indexOf("pause the lorazepam"));
  });
  it("lists each sentence with its section and the reason in plain words", () => {
    const t = text(html());
    expect(t).toContain("Our questions · not in the brief");
    expect(t).toContain('Blocked: names a medicine together with an action word ("pause")');
    expect(t).not.toContain("Reason: blocked:");
    expect(t).toContain("Reason: has a number that is not in the records it cites");
  });
  it("works without a name", () => {
    expect(text(html(""))).toContain("or did not match the records.");
  });
});
