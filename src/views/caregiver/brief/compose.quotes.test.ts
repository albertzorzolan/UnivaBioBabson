import { describe, expect, it } from "vitest";
import { createSeed } from "../../../model/seed";
import { analyzeTimeline } from "../../../engine/timeline/signals";
import { reviewMedications } from "../../../engine/meds/review";
import { knownEffect } from "../../../kb";
import { verifySentence } from "../../../engine/brief";
import { composeTemplate, curlyQuotes, defaultComposeOptions, reasonFor, type BriefInputs } from "./compose";

const today = "2026-10-11";

function inputsFor(): BriefInputs {
  const data = createSeed(today);
  const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect: (m, k) => knownEffect(m.ingredientIds, k) });
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals });
  return { data, review, timeline, today };
}

describe("curly quotes in 'Why we're coming in'", () => {
  it("turns straight double quotes and apostrophes into typographic ones", () => {
    expect(curlyQuotes('Alex (daughter) wrote on Oct 4: "Mom\'s foggier." In Margaret\'s words: "dizzy"')).toBe(
      "Alex (daughter) wrote on Oct 4: “Mom’s foggier.” In Margaret’s words: “dizzy”",
    );
    expect(curlyQuotes("(\"a\") and \"b\"")).toBe("(“a”) and “b”");
    expect(curlyQuotes("Already “curly”.")).toBe("Already “curly”.");
    expect(curlyQuotes("No quotes here.")).toBe("No quotes here.");
  });

  const inp = inputsFor();
  const { pkg, content } = composeTemplate(inp, defaultComposeOptions(inp));
  const opts = { medNames: inp.data.medications.map((m) => m.name), patientNames: ["Margaret", "Mom"] };

  it("quotes the pinned concern with curly quotes and keeps its evidence id", () => {
    const concern = content.reason.find((s) => s.evidenceIds.some((id) => id.startsWith("concern:")))!;
    expect(concern.text).toMatch(/wrote on Oct \d+: “Mom seems foggier/);
    expect(concern.text).not.toContain('"');
    expect(verifySentence(concern, pkg, { ...opts, maxLength: 400 }).issues).toEqual([]);
  });

  it("uses curly quotes when a concern is added back in the builder", () => {
    const reason = reasonFor([], pkg, []);
    expect(reason.length).toBeGreaterThan(0);
    for (const s of reason) expect(s.text).not.toContain('"');
  });
});
