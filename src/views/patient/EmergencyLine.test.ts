// The static 911 line in the patient check-in: shown when her words describe one of the app's listed emergency
// signs (engine/safety/emergencySigns.ts). The words are the Help dialog's 911 row, never built from the note.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { extractCheckIn } from "../../engine/nlp/extract";
import { EVAL_MEDS, EVAL_PATIENT_NAMES, EVAL_TODAY } from "../../engine/nlp/fixtures";
import { EMERGENCY_SIGNS } from "../../engine/safety/emergencySigns";
import { EMERGENCY_CALL, NOT_MONITORED } from "../../app/Help";
import { EmergencyLine } from "./EmergencyLine";
import { HeardPanel } from "./HeardPanel";
import { emptyForm } from "./checkin";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

describe("EmergencyLine", () => {
  const html = renderToStaticMarkup(createElement(EmergencyLine));
  const t = text(html);

  it("prints the Help dialog's 911 row word for word (title, the signs sentence, outside the US)", () => {
    expect(t).toContain(EMERGENCY_CALL.title);
    expect(t).toContain(EMERGENCY_SIGNS);
    expect(t).toContain(EMERGENCY_CALL.detail);
  });

  it("says nobody is watching the app (the Help dialog's own sentence)", () => {
    expect(t).toContain(NOT_MONITORED);
  });

  it("is a 911 phone link, a note (not an alert), with the icon hidden from screen readers", () => {
    expect(html).toContain('href="tel:911"');
    expect(html).toContain(">Call 911<");
    expect(html).toContain('role="note"');
    expect(html).not.toContain('role="alert"');
    expect(html).toMatch(/class="pt-medsafety__icon" aria-hidden="true"/);
  });
});

function renderHeard(story: string): string {
  const extraction = extractCheckIn(story, { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: EVAL_PATIENT_NAMES });
  return text(
    renderToStaticMarkup(
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
    ),
  );
}

describe("HeardPanel: the static 911 line", () => {
  it("shows it for the judge's note (chest pain, a numb left arm, can't catch my breath)", () => {
    const t = renderHeard("I had chest pain and my left arm is numb and I can't catch my breath");
    expect(t).toContain(EMERGENCY_CALL.title);
    expect(t).toContain(EMERGENCY_SIGNS);
  });

  it("does not show it for a plainly negated mention or an everyday day", () => {
    expect(renderHeard("No chest pain today, slept well.")).not.toContain(EMERGENCY_CALL.title);
    expect(renderHeard("Felt woozy getting up this morning. Slept badly.")).not.toContain(EMERGENCY_CALL.title);
  });
});
