// Tour step 8 ("Check our work") presses the benchmark's Run button and waits for the scores. Its copy must be true
// in every state the page can be in while the card is up: idle, scoring ("Scoring every story on this device…"),
// failed ("The benchmark could not run"), finished, or re-running after "Run again". The spotlit target does not tell
// those states apart (after "Run again" the spotlight can stay on the benchmark card with the scores on screen), so
// the copy is the same for every target and claims neither that the benchmark "just ran" nor that it "is running".
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { searchWindowMs, TOUR_STEPS } from "./TourOverlay";

const ctx = { name: "Margaret", age: 78, medCount: 8, prescribers: 3, findings: 11, topSignal: null };
const step = TOUR_STEPS[7];
const text = (matched: string | null) => renderToStaticMarkup(step.body(ctx, matched)).replace(/<[^>]+>/g, "");
const MATCHES = ["how-eval-heldout", "how-eval-scores", "how-eval", "how-arch", null];

describe("tour step 8 benchmark copy", () => {
  it("is the benchmark step", () => {
    expect(step.runBenchmark).toBe(true);
    expect(step.title).toBe("Check our work");
  });

  it.each(MATCHES)("with target %s, claims neither that the benchmark ran nor that it is running", (matched) => {
    const t = text(matched);
    expect(t).not.toMatch(/just ran|has run|already ran|\bran\b|is running|still running|finished running/i);
    expect(t).toMatch(/over hundreds of fictional, AI-written stories with gold labels/);
    expect(t).toMatch(/held-out set was never used for tuning/);
  });

  it("reads the same whatever is spotlit (the spotlight does not track the run's state)", () => {
    const first = text(MATCHES[0]);
    for (const matched of MATCHES) expect(text(matched), String(matched)).toBe(first);
  });
});

// The spotlight (and so the copy) only moves to the scorecard if the target search is still polling when the run
// ends; a slow device can take longer than the ordinary 10 s window, so the benchmark step searches for longer.
describe("tour step 8 target search", () => {
  it("keeps looking for the scorecard longer than an ordinary step", () => {
    expect(searchWindowMs(step)).toBeGreaterThan(searchWindowMs(TOUR_STEPS[3]));
    expect(searchWindowMs(TOUR_STEPS[3])).toBe(10_000);
    expect(searchWindowMs(step)).toBe(60_000);
  });
});
