// "Here's what I heard": when the story gives no answer to fill in, the panel says so and points to the questions
// instead of a bare "I didn't find anything". Rendered to static HTML (no DOM needed).
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { extractCheckIn } from "../../engine/nlp/extract";
import { EVAL_MEDS, EVAL_PATIENT_NAMES, EVAL_TODAY } from "../../engine/nlp/fixtures";
import { HeardPanel } from "./HeardPanel";
import { emptyForm } from "./checkin";

function render(story: string): string {
  const extraction = extractCheckIn(story, { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: EVAL_PATIENT_NAMES });
  return renderToStaticMarkup(
    createElement(HeardPanel, {
      story,
      extraction,
      aiProposals: [],
      form: emptyForm(),
      meds: EVAL_MEDS,
      others: extraction.otherSymptoms,
      removedOthers: [],
      onToggleOther: () => {},
      medNotes: extraction.medNotes,
      removedMedNotes: [],
      onToggleMedNote: () => {},
      onAccept: () => {},
      onUnaccept: () => {},
      onChange: () => {},
      ai: null,
      stale: false,
    }),
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

describe("HeardPanel: nothing to fill in", () => {
  it("explains and offers the questions when a story has no symptom to fill in", () => {
    const t = text(render("Lovely walk in the park with the grandchildren."));
    expect(t).toContain("I didn’t find a symptom I can fill in.");
    expect(t).toContain("You can answer the questions below directly.");
    expect(t).toContain("Go to the questions");
    expect(t).not.toContain("I didn’t find anything");
  });

  it("still lists what was set aside, e.g. a denied unsteadiness", () => {
    const t = text(render("Was not unsteady at all today."));
    expect(t).toContain("I didn’t find a symptom I can fill in.");
    expect(t).toContain("Things I didn’t add");
  });

  it("with only 'also mentioned' symptoms, says what it found and still points to the questions", () => {
    const t = text(render("I couldn't pee properly today."));
    expect(t).toContain("I found 1 other symptom, but no symptom I can fill in.");
    expect(t).toContain("Go to the questions");
    expect(t).toContain("Bladder problems");
  });

  it("shows no hint when there are answers to check", () => {
    const t = text(render("Felt dizzy this morning."));
    expect(t).not.toContain("Go to the questions");
    expect(t).toContain("I found 1 answer.");
  });
});

describe("HeardPanel: Poison Control line next to 'too much / wrong medicine' notes", () => {
  it("shows the static Poison Control line with a phone link for 'took two … by mistake'", () => {
    const html = render("I took two of my sleeping pills last night by mistake and I feel very confused and wobbly this morning");
    expect(text(html)).toContain("About your medicines");
    expect(text(html)).toContain("call Poison Control at 1‑800‑222‑1222");
    expect(html).toContain('href="tel:18002221222"');
  });

  it("shows it for 'took … twice, by mistake', which the reading files as a 'taken' note", () => {
    const html = render("I took my sleeping pill twice last night, by mistake");
    expect(text(html)).toContain("About your medicines");
    expect(html).toContain('href="tel:18002221222"');
  });

  it("does not show it next to confusion told as a symptom", () => {
    const html = render("Feeling confused since starting the new sleeping pill");
    expect(text(html)).toContain("About your medicines");
    expect(html).not.toContain("Poison Control");
  });

  it("does not show it next to 'mixed up' or 'muddled' told as a symptom", () => {
    for (const story of ["Feeling mixed up and foggy since the new sleeping pill", "My head feels muddled after the sleeping pill"]) {
      expect(render(story), story).not.toContain("Poison Control");
    }
  });

  it("does not show it for a missed dose told with 'by mistake'", () => {
    expect(render("I missed my water pill by mistake.")).not.toContain("Poison Control");
  });

  it("does not show it for a missed dose", () => {
    const html = render("Forgot my water pill.");
    expect(text(html)).toContain("About your medicines");
    expect(html).not.toContain("Poison Control");
  });
});
