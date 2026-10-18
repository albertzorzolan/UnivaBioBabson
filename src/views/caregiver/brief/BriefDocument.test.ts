// The brief document as it renders (screen and print), through react-dom/server: the test environment is node, so
// the markup is read as text. Covers what only the view adds: the 'At a glance' box, the 'In her words' quotes, the
// static safety-net line in the footer and the wording of an emptied record.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../../app/StoreProvider";
import { createSeed } from "../../../model/seed";
import { emptyRecord } from "../../../model/store";
import type { BriefContent, StoreData } from "../../../model/types";
import { analyzeTimeline } from "../../../engine/timeline/signals";
import { reviewMedications } from "../../../engine/meds/review";
import { knownEffect } from "../../../kb";
import { SAFETY_LINE, templateGenerationInfo, toVisitBrief } from "../../../engine/brief";
import { safetyNetLine } from "../../../engine/brief/safetyNet";
import { BriefDocument } from "./BriefDocument";
import { GLANCE_NO_CHANGE, GLANCE_NO_CHECKINS, atAGlance, composeTemplate, defaultComposeOptions, patientQuotes, type BriefInputs } from "./compose";

const today = "2026-10-11";

function inputsFor(data: StoreData): BriefInputs {
  const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect: (m, k) => knownEffect(m.ingredientIds, k) });
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals });
  return { data, review, timeline, today };
}

/**
 * Render the template brief for a record; returns the HTML and its text (tags stripped, entities decoded). SSR
 * applies no CSS, so the text includes elements print hides: screen-only elements are checked by their class.
 * `edit` changes the composed content first, like the family's edits in the builder.
 */
function render(data: StoreData, mode: "screen" | "print", edit: (c: BriefContent) => BriefContent = (c) => c) {
  const inputs = inputsFor(data);
  const composed = composeTemplate(inputs, defaultComposeOptions(inputs));
  const pkg = composed.pkg;
  const content = edit(composed.content);
  const brief = toVisitBrief({ id: "b1", pkg, content, generation: templateGenerationInfo(pkg, inputs.review), data });
  const lookup = new Map(pkg.items.map((i) => [i.id, i]));
  const doc = createElement(BriefDocument, { brief, inputs, pkg, lookup, mode, idPrefix: mode });
  // On screen the evidence chips read the record for their labels, so the screen brief renders inside the provider.
  const html = renderToStaticMarkup(mode === "screen" ? createElement(StoreProvider, { today, children: doc }) : doc);
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return { html, text, inputs, pkg, content };
}

// The provider reads window.localStorage (node has no window): an empty stand-in makes it start from the seed.
// Stubbed at load time because the briefs below render while the tests are collected.
const stored = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v), removeItem: (k: string) => void stored.delete(k) },
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("BriefDocument", () => {
  for (const mode of ["screen", "print"] as const) {
    describe(`seed record (${mode})`, () => {
      const r = render(createSeed(today), mode);

      it("opens with an 'At a glance' box of at most 3 lines, before section 1", () => {
        const lines = atAGlance(r.inputs, r.content, r.pkg);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.length).toBeLessThanOrEqual(3);
        expect(r.text).toContain("At a glance");
        for (const l of lines) expect(r.text).toContain(l.text);
        expect(r.html.indexOf("cg-vb-glance")).toBeLessThan(r.html.indexOf("cg-vb-sec--reason"));
        expect((r.html.match(/class="cg-vb-glance__row/g) ?? []).length).toBe(lines.length);
      });

      it("shows the verbatim quotes under the sentences they belong to", () => {
        const quotes = patientQuotes(r.inputs, r.content, r.pkg);
        expect(quotes.length).toBe(2);
        for (const q of quotes) expect(r.text).toContain(q.text);
      });

      it("ends with the safety line; the static safety-net line is on screen only", () => {
        expect(r.text).toContain(SAFETY_LINE);
        // The safety-net line is in the markup in both modes, but marked screen-only: brief-print.css hides
        // .ui-no-print, so the printed brief (and the sample PDF) carries SAFETY_LINE and not this line.
        const net = r.html.match(/<p class="([^"]*cg-vb-doc__safetynet[^"]*)">([^<]*)<\/p>/);
        expect(net?.[2].replace(/&#x27;/g, "'")).toBe(safetyNetLine("Margaret"));
        expect(net?.[1].split(" ")).toContain("ui-no-print");
        const safety = r.html.match(/<p class="(cg-vb-doc__safety(?: [^"]*)?)">/);
        expect(safety?.[1].split(" ")).not.toContain("ui-no-print");
      });

      it("shows age and sex for the demo patient", () => {
        expect(r.text).toContain("78 years · female · fictional demo patient");
      });
    });
  }

  describe("seed record with every signal sentence removed by the family", () => {
    const noSignals = (c: BriefContent): BriefContent => ({ ...c, noticed: c.noticed.filter((s) => !s.evidenceIds.some((id) => id.startsWith("sig:"))) });
    for (const mode of ["screen", "print"] as const) {
      it(`never claims 'no flagged change' at the top (${mode})`, () => {
        // The timeline still flags the dizziness change; a removed sentence must not read as an all-clear.
        const r = render(createSeed(today), mode, noSignals);
        expect(r.text).not.toContain(GLANCE_NO_CHANGE);
        expect(r.html).not.toContain("cg-vb-glance__row--change");
        expect(r.text).toContain("At a glance");
      });
    }
  });

  describe("an emptied record ('Delete everything')", () => {
    const empty = emptyRecord(createSeed(today), "2026-10-11T10:00:00.000Z");
    const r = render(empty, "print");

    it("never prints '0 years', 'You' as the preparer or a count of 0 medicines", () => {
      expect(r.text).not.toMatch(/\b0 years\b/);
      expect(r.text).not.toMatch(/Prepared by You\b/i);
      expect(r.text).not.toMatch(/\b0 current medicines\b/);
      expect(r.text).not.toMatch(/\bYour relative's\b/);
    });

    it("falls back to 'the caregiver' and a named placeholder heading", () => {
      expect(r.text).toMatch(/Prepared by The caregiver/i);
      expect(r.text).toContain("The caregiver would like to go over what the diary recorded from");
      expect(r.html).toMatch(/<h2[^>]*>Name not recorded<\/h2>/);
      expect(r.text).toContain(safetyNetLine(""));
      // Nothing was recorded, so the glance says so instead of "no flagged change" (which reads as reassurance).
      expect(r.text).toContain(GLANCE_NO_CHECKINS);
      expect(r.text).not.toContain(GLANCE_NO_CHANGE);
    });
  });
});

describe("provenance of a partial AI draft (questions from the template)", () => {
  function renderAi(mode: "screen" | "print", sections?: Record<"reason" | "noticed" | "questions", "ai" | "template">) {
    const inputs = inputsFor(createSeed(today));
    const composed = composeTemplate(inputs, defaultComposeOptions(inputs));
    const pkg = composed.pkg;
    const base = templateGenerationInfo(pkg, inputs.review);
    const generation = { ...base, mode: "ai" as const, model: "Qwen2.5-3B", promptVersion: "brief-v9", droppedSentences: 2, ...(sections ? { sections } : {}) };
    const brief = toVisitBrief({ id: "b-ai", pkg, content: composed.content, generation, data: inputs.data });
    const lookup = new Map(pkg.items.map((i) => [i.id, i]));
    const doc = createElement(BriefDocument, { brief, inputs, pkg, lookup, mode, idPrefix: `ai-${mode}` });
    const html = renderToStaticMarkup(mode === "screen" ? createElement(StoreProvider, { today, children: doc }) : doc);
    return { html, text: html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ") };
  }

  it("names only the AI-drafted sections in the printed footer", () => {
    const { text } = renderAi("print", { reason: "template", noticed: "ai", questions: "template" });
    expect(text).toContain("What we’ve noticed drafted on this device by Qwen2.5-3B (prompt brief-v9) and checked against the records, 2 removed by the check;");
    expect(text).toContain("Why we’re coming in and Our questions: Kinwise's standard template (no AI).");
    expect(text).not.toContain("every sentence checked");
  });

  it("marks only the AI-drafted sections 'AI draft · checked' on screen", () => {
    const partial = renderAi("screen", { reason: "template", noticed: "ai", questions: "template" });
    expect(partial.html.match(/AI draft · checked/g)?.length).toBe(1);
    const full = renderAi("screen", { reason: "ai", noticed: "ai", questions: "ai" });
    expect(full.html.match(/AI draft · checked/g)?.length).toBe(3);
    expect(renderAi("print", { reason: "ai", noticed: "ai", questions: "ai" }).text).toContain("every sentence checked against the records");
  });

  it("keeps the original wording for an AI brief saved before sections were recorded", () => {
    const { html, text } = renderAi("screen");
    expect(text).toContain("Drafted on this device by Qwen2.5-3B (prompt brief-v9); every sentence checked against the records");
    expect(html.match(/AI draft · checked/g)?.length).toBe(2);
  });
});
