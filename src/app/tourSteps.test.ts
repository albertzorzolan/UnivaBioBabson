// Guided-tour copy and targets that judges see first: the Gandhi figure must match the study's wording, and
// step 2 must spotlight the highlighted story itself (not the whole panel, which the card would cover).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { TOUR_STEPS } from "./TourOverlay";
import { TOUR_STEP_COUNT } from "./Tour";

const ctx = { name: "Margaret", age: 78, medCount: 8, prescribers: 3, findings: 11, topSignal: null };
const text = (i: number) => renderToStaticMarkup(TOUR_STEPS[i].body(ctx, null)).replace(/<[^>]+>/g, "");

describe("guided tour steps", () => {
  it("keeps 8 steps", () => {
    expect(TOUR_STEPS).toHaveLength(8);
    expect(TOUR_STEP_COUNT).toBe(8);
  });

  it("quotes Gandhi 2003 as an attribution, not as a cause of persistence", () => {
    const t = text(0);
    expect(t).toMatch(/attributed to the patient not telling the doctor/);
    expect(t).toMatch(/19 of 51/);
    expect(t).not.toMatch(/persisted because/);
  });

  it("spotlights the highlighted story on step 2, with the old targets as fallbacks", () => {
    const targets = TOUR_STEPS[1].targets;
    expect(targets[0]).toBe('css:[data-tour="checkin-heard"] .pt-story');
    expect(targets.slice(1)).toEqual(["checkin-heard", "checkin-story", "checkin-saved"]);
    // The selector must exist in the panel's markup.
    const heard = readFileSync(new URL("../views/patient/HeardPanel.tsx", import.meta.url), "utf8");
    expect(heard).toContain('data-tour="checkin-heard"');
    expect(heard).toMatch(/className="pt-story"/);
  });
});
