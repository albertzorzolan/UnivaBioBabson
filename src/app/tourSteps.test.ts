// Guided-tour copy and targets that judges see first: the Gandhi figure must match the study's wording, and
// step 2 must spotlight the highlighted story itself (not the whole panel, which the card would cover).
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { TOUR_STEPS } from "./TourOverlay";
import { startTour, stopTour, syncTourWithRoute, TOUR_STEP_COUNT, tourAfterRoute } from "./Tour";

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
    expect(t).toMatch(/37% of medication side effects/);
    expect(t).not.toMatch(/of 51/);
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

  it("spotlights the featured Overview card's before/after bars, which stay on the card", () => {
    const step = TOUR_STEPS.find((s) => s.title === "What Kinwise noticed")!;
    expect(step.targets[0]).toBe('css:[data-tour="overview-noticed"] .cg-ov-insight.is-featured .cg-ov-insight__aside');
    const overview = readFileSync(new URL("../views/caregiver/Overview.tsx", import.meta.url), "utf8");
    expect(overview).toContain('data-tour="overview-noticed"');
    expect(overview).toContain('className="cg-ov-insight__aside"');
    // The one caveat the tour and the demo video point at stays on the card, in the spec's words.
    expect(overview).toContain('COMPARISON_CAVEAT = "Shows a change in what was recorded, not what caused it."');
  });

  it("ends on the held-out scorecard, with the benchmark card as the fallback that holds the Run button", () => {
    const last = TOUR_STEPS[7];
    expect(last.targets[0]).toBe("how-eval-heldout");
    expect(last.targets).toContain("how-eval");
    const how = readFileSync(new URL("../views/public/HowItWorks.tsx", import.meta.url), "utf8");
    // Passed to the held-out Scorecard, which renders it as data-tour.
    expect(how).toContain('tour="how-eval-heldout"');
  });

  it("describes the benchmark stories as fictional and AI-written, not hand-labelled", () => {
    const t = text(7);
    expect(t).toMatch(/over hundreds of fictional, AI-written stories with gold labels/);
    expect(t).not.toMatch(/hand-labelled|by hand/);
  });

  it("says where the two views meet today, at the switch from Margaret’s view to Alex’s", () => {
    expect(TOUR_STEPS[1].role).toBe("patient");
    expect(TOUR_STEPS[2].role).toBe("caregiver");
    expect(text(2)).toContain("Today both views share one device (or a backup file); family sharing is planned.");
  });

  it("uses the size words, not “Pattern strength”", () => {
    for (let i = 0; i < TOUR_STEPS.length; i++) expect(text(i)).not.toMatch(/Pattern strength/i);
  });
});

// Leaving the tour through the Welcome page (the logo, "Try as …", sign-in) ends it, so it never comes back at
// a stale step over an unrelated page. The ?tour=1 link from "Take the guided tour" starts it fresh instead.
describe("guided tour state", () => {
  const store = new Map<string, string>();
  const fakeSession = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => {
    stopTour();
    store.clear();
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it("ends a running tour when the Welcome page opens, unless it was opened to start the tour", () => {
    const running = { active: true, step: 4 };
    expect(tourAfterRoute(running, "/", false)).toEqual({ active: false, step: 0 });
    expect(tourAfterRoute(running, "/", true)).toBe(running);
    expect(tourAfterRoute(running, "/c/review", false)).toBe(running);
    const idle = { active: false, step: 0 };
    expect(tourAfterRoute(idle, "/", false)).toBe(idle);
  });

  it("clears the saved step when the tour is left via Welcome, and starts again at step 1", () => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = fakeSession;
    startTour(4);
    expect(JSON.parse(store.get("kinwise.v1.tour")!)).toEqual({ active: true, step: 4 });
    syncTourWithRoute("/", false);
    expect(store.has("kinwise.v1.tour")).toBe(false);
    // "Try as Alex" then lands on the overview: nothing is running, so nothing reappears.
    syncTourWithRoute("/c/overview", false);
    expect(store.has("kinwise.v1.tour")).toBe(false);
    // "Take the guided tour" starts fresh.
    startTour();
    expect(JSON.parse(store.get("kinwise.v1.tour")!)).toEqual({ active: true, step: 0 });
  });
});
