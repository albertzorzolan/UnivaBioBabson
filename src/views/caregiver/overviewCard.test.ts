// The featured "What Kinwise noticed" card on the caregiver Overview, rendered from the demo record.
// It must stay short on the first screen (headline, bars, ONE caveat, the question) while every honesty line stays
// one click away in a disclosure — moved, never deleted.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSeed } from "../../model/seed";
import { analyzeTimeline } from "../../engine/timeline/signals";
import { reviewMedications } from "../../engine/meds/review";
import { CHANCE_NOTE } from "../shared/caregiver-insights";
import { COMPARISON_CAVEAT, InsightCard, QUESTION_LABEL, buildInsights, promptCountText } from "./Overview";

const TODAY = "2026-10-11";
const data = createSeed(TODAY);
const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today: TODAY });
const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY, signals: timeline.signals });
const insights = buildInsights({
  signals: timeline.signals,
  sentinels: timeline.sentinels,
  findings: review.findings,
  meds: data.medications,
  checkIns: data.checkIns,
  from: "2026-09-12",
  to: TODAY,
});

const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

/** Text a reader sees before opening anything: the markup without collapsed disclosure panels or hidden spans. */
function visibleText(html: string): string {
  return strip(
    html
      .replace(/<div id="[^"]*" class="ui-disclosure__panel" hidden="">[\s\S]*?<\/div><\/div>/g, "")
      .replace(/<span hidden="">[^<]*<\/span>/g, ""),
  );
}

function renderFeatured() {
  const ins = insights[0];
  return renderToStaticMarkup(createElement(InsightCard, { ins, featured: true, saved: false, onSave: () => {}, today: TODAY }));
}

describe("Overview featured insight", () => {
  it("is the lorazepam before/after signal in the demo record", () => {
    expect(insights[0].kind).toBe("signal");
    expect(insights[0].title).toMatch(/Lorazepam/);
  });

  it("shows one caveat with 'not what caused it', and the shared question label", () => {
    const seen = visibleText(renderFeatured());
    expect(seen).toContain(COMPARISON_CAVEAT);
    expect(seen.match(/not what caused it/g)).toHaveLength(1);
    expect(QUESTION_LABEL).toBe("Question for the doctor or pharmacist");
    expect(seen).toContain(QUESTION_LABEL);
    expect(seen).not.toContain("Question for the visit");
  });

  it("moves the long sentence and the chance note into 'How reliable is this?', not out of the card", () => {
    const html = renderFeatured();
    const seen = visibleText(html);
    const all = strip(html);
    expect(seen).not.toContain(CHANCE_NOTE);
    expect(seen).not.toContain(insights[0].lead);
    expect(all).toContain(CHANCE_NOTE);
    expect(all).toContain(insights[0].lead);
    expect(all).toContain("How reliable is this?");
  });

  it("shows the first sentence of the question and keeps the whole question in the card", () => {
    const q = insights[0].question;
    const first = q.slice(0, q.indexOf("?") + 1);
    expect(first.length).toBeGreaterThan(10);
    const html = renderFeatured();
    expect(visibleText(html)).toContain(first);
    expect(visibleText(html)).not.toContain(q.slice(first.length).trim());
    expect(strip(html)).toContain(q.slice(first.length).trim());
  });

  it("has at least 25% fewer visible words than the card it replaced (222 at 1366×860)", () => {
    const words = visibleText(renderFeatured()).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    expect(words).toBeLessThanOrEqual(Math.floor(222 * 0.75));
  });
});

describe("Overview review-summary counts", () => {
  it("are words, not step-like circled numbers", () => {
    expect(promptCountText(1)).toBe("1 prompt");
    expect(promptCountText(3)).toBe("3 prompts");
  });
});
