import { describe, expect, it } from "vitest";
import { createSeed } from "../../../model/seed";
import { analyzeTimeline } from "../../../engine/timeline/signals";
import { reviewMedications } from "../../../engine/meds/review";
import { knownEffect } from "../../../kb";
import { verifySentence } from "../../../engine/brief";
import { metricValue } from "../../../engine/timeline/metrics";
import { formatShort } from "../../../model/dates";
import type { StoreData } from "../../../model/types";
import { composeTemplate, curlyQuotes, defaultComposeOptions, patientQuotes, reasonFor, type BriefInputs } from "./compose";

const today = "2026-10-11";

function inputsFor(data: StoreData = createSeed(today)): BriefInputs {
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

describe("'In her words': verbatim quotes under the lead change and the most recent fall", () => {
  const inp = inputsFor();
  const { pkg, content } = composeTemplate(inp, defaultComposeOptions(inp));
  const quotes = patientQuotes(inp, content, pkg);
  const byId = new Map(inp.data.checkIns.map((c) => [c.id, c]));

  it("quotes at most twice, from two different check-ins", () => {
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.length).toBeLessThanOrEqual(2);
    expect(new Set(quotes.map((q) => q.checkInId)).size).toBe(quotes.length);
  });

  it("is an exact substring of the story it came from, at its recorded span, with that check-in's date", () => {
    for (const q of quotes) {
      const c = byId.get(q.checkInId)!;
      expect(c, q.checkInId).toBeDefined();
      expect(c.story.slice(q.start, q.end)).toBe(q.quote);
      expect(c.story.includes(q.quote)).toBe(true);
      expect(q.date).toBe(c.date);
      expect(q.text).toBe(`In her words (${formatShort(c.date)}): “${q.quote}”`);
      // The day really recorded the item (a negated mention such as "no dizziness today" is never quoted).
      expect(metricValue(c, q.metric)).toBe(1);
    }
  });

  it("cites the check-in's own evidence item and sits under a sentence the brief shows", () => {
    const ids = new Set(pkg.items.map((i) => i.id));
    for (const q of quotes) {
      expect(q.evidenceId).toBe(`entry:${q.checkInId}`);
      expect(ids.has(q.evidenceId)).toBe(true);
      expect(content.noticed.some((s) => s.evidenceIds.includes(q.anchorId))).toBe(true);
    }
  });

  it("picks the most recent day, then the shortest span (seed: the fall day, then the night the room was spinning)", () => {
    const fall = quotes.find((q) => q.anchorId === "fact:falls-since:med-lorazepam")!;
    expect(fall).toMatchObject({ date: "2026-10-06", quote: "Took a tumble", metric: "fall" });
    const lead = quotes.find((q) => q.anchorId === "sig:med-lorazepam:dizziness:started")!;
    expect(lead).toMatchObject({ date: "2026-09-30", quote: "the room was spinning", metric: "dizziness" });
    expect(lead.text).toBe("In her words (Sep 30): “the room was spinning”");
  });

  it("uses the person's own pronoun and quotes nothing when no story was written", () => {
    const he = inputsFor({ ...createSeed(today), profile: { ...createSeed(today).profile, sex: "male" } });
    const b = composeTemplate(he, defaultComposeOptions(he));
    expect(patientQuotes(he, b.content, b.pkg)[0].text).toMatch(/^In his words \(/);
    const seed = createSeed(today);
    const silent = inputsFor({ ...seed, checkIns: seed.checkIns.map((c) => ({ ...c, story: "", provenance: {} })) });
    const s = composeTemplate(silent, defaultComposeOptions(silent));
    expect(patientQuotes(silent, s.content, s.pkg)).toEqual([]);
  });

  it("never quotes a span that no longer matches its story (an edited story)", () => {
    const seed = createSeed(today);
    const fallDay = seed.checkIns.find((c) => c.date === "2026-10-06")!;
    const edited = { ...seed, checkIns: seed.checkIns.map((c) => (c.id === fallDay.id ? { ...c, story: `Edited. ${c.story}` } : c)) };
    const e = inputsFor(edited);
    const b = composeTemplate(e, defaultComposeOptions(e));
    for (const q of patientQuotes(e, b.content, b.pkg)) expect(q.checkInId).not.toBe(fallDay.id);
  });
});
