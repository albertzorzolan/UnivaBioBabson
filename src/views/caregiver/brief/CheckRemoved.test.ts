// "What the check removed" as it renders, through react-dom/server (the test environment is node, so the markup is
// read as text). The list quotes blocked AI text word for word, so the caution around it matters as much as the list.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The stylesheet imports are irrelevant to the markup.
vi.mock("./check-removed.css", () => ({}));
vi.mock("./check-removed-card.css", () => ({}));
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

// The same disclosure on a review card (FindingCard.tsx), for an "Explain in simpler words" run: the check compares
// each AI sentence with the prompt and its reference text (tasks.ts checkExplanation), not with the brief.
describe("CheckRemoved on a review card", () => {
  const CARD_ITEMS = [
    { section: "explanation", text: "Pausing the lorazepam would stop the dizziness.", issues: ['banned: advice: names a medicine together with an action word ("pausing")'] },
    { section: "explanation", text: "This happens to 30% of older adults.", issues: ["number_unsupported: 30 is not in the cited evidence"] },
  ];
  const card = () => renderToStaticMarkup(createElement(CheckRemoved, { items: CARD_ITEMS, name: "", variant: "card" }));

  it("is collapsed by default, counts the removed sentences and carries the card modifier", () => {
    expect(card()).toMatch(/^<details class="cg-vb-removed cg-vb-removed--card">/);
    expect(card()).not.toMatch(/<details[^>]*\bopen\b/);
    expect(text(card())).toContain("What the check removed (2)");
  });
  it("says the sentences are kept off this card, and talks about the finding rather than the brief", () => {
    const t = text(card());
    expect(t).toContain("The on-device AI wrote these sentences, but the code check kept them off this card.");
    expect(t).toContain("Each one broke a wording rule (for example, it suggested changing a medicine) or said something that is not in the finding or its reference text.");
    expect(t).not.toContain("brief");
  });
  it("puts the not-advice caution before the first quoted sentence", () => {
    const t = text(card());
    expect(t).toContain("These sentences are not advice. Don’t start, stop or change any medicine because of them; ask the prescriber or pharmacist.");
    expect(t.indexOf("not advice")).toBeLessThan(t.indexOf("Pausing the lorazepam"));
  });
  it("gives each sentence its reason in plain words", () => {
    const t = text(card());
    expect(t).toContain('Blocked: names a medicine together with an action word ("pausing")');
    expect(t).toContain("Reason: has a number that is not in the finding or its reference text");
  });
});

// A card's check only knows the medicines this finding is about (tasks.ts checkExplanation passes the finding's own
// medicines as medNames), so a med_unknown issue there must not claim the medicine is missing from the list.
describe("CheckRemoved reasons depend on where the check ran", () => {
  const MED = { section: "explanation", text: "Lorazepam can add to this.", issues: ['med_unknown: "lorazepam" is not on the medication list or in the evidence'] };
  const render = (variant: "brief" | "card", items = [MED]) => text(renderToStaticMarkup(createElement(CheckRemoved, { items, name: "Margaret", variant })));

  it("on a card, a medicine the finding is not about is not called missing from the list", () => {
    const t = render("card");
    expect(t).toContain('Reason: names a medicine this finding is not about ("lorazepam")');
    expect(t).not.toContain("not on the list");
  });
  it("in the brief, the same issue still says the medicine is not on the list", () => {
    expect(render("brief")).toContain('Reason: names a medicine that is not on the list ("lorazepam")');
  });
  it("on a card, unsafe text does not belong on this card rather than in a brief", () => {
    const t = render("card", [{ section: "explanation", text: "<b>x</b>", issues: ["unsafe_content"] }]);
    expect(t).toContain("Reason: contains text that does not belong on this card");
    expect(t).not.toContain("brief");
  });
  it("on a card, unsupported numbers, dates and counts are checked against the finding, not 'the records it cites'", () => {
    const t = render("card", [
      { section: "explanation", text: "This happens to 30% of older adults.", issues: ["number_unsupported: 30 is not in the cited evidence"] },
      { section: "explanation", text: "It began on 3 May.", issues: ["date_unsupported: 3 May"] },
      { section: "explanation", text: "It happened on 4 of 7 days.", issues: ["pair_unsupported: 4 of 7"] },
    ]);
    expect(t).toContain("Reason: has a number that is not in the finding or its reference text");
    expect(t).toContain("Reason: has a date that is not in the finding or its reference text");
    expect(t).toContain("Reason: has a count that does not match the finding or its reference text");
    expect(t).not.toContain("records it cites");
  });
  it("on a card, a blocked wording keeps the brief's wording", () => {
    const t = render("card", [ITEMS[0]]);
    expect(t).toContain('Blocked: names a medicine together with an action word ("pause")');
  });
});

describe("CheckRemoved with one sentence", () => {
  const one = (variant: "brief" | "card") => text(renderToStaticMarkup(createElement(CheckRemoved, { items: [ITEMS[1]], name: "Margaret", variant })));
  it("speaks of one sentence, not 'these sentences'", () => {
    expect(one("card")).toContain("What the check removed (1)");
    expect(one("card")).toContain("The on-device AI wrote this sentence, but the code check kept it off this card. It broke a wording rule");
    expect(one("card")).toContain("This sentence is not advice. Don’t start, stop or change any medicine because of it; ask the prescriber or pharmacist.");
    expect(one("brief")).toContain("The on-device AI wrote this sentence, but it is not in the brief. It broke a wording rule");
    expect(one("brief")).not.toContain("These sentences");
  });
});
