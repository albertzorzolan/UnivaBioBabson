// The static Poison Control line: shown only next to "too much / the wrong medicine" notes, never for a missed or
// late dose. Pure helper plus a static render (react-dom/server, no DOM needed).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MedSafetyLine, needsPoisonLine } from "./MedSafetyLine";

const note = (text: string) => ({ medicationId: null, text, span: null });

describe("needsPoisonLine", () => {
  it("is true for an extra dose ('took two … by mistake')", () => {
    expect(needsPoisonLine([note("I took two of my sleeping pills last night by mistake")])).toBe(true);
  });

  it("is true for a mix-up", () => {
    expect(needsPoisonLine([note("Got my tablets mixed up this morning")])).toBe(true);
  });

  it("is false for a missed dose", () => {
    expect(needsPoisonLine([note("Forgot my water pill")])).toBe(false);
  });

  it("is false for no notes", () => {
    expect(needsPoisonLine([])).toBe(false);
  });

  // The note reading checks "missed" and "taken" before "extra", so these double doses come back as a plain
  // "taken" or "missed" note; the line's own wording check still finds them.
  it("is true for a double dose the note reading files as 'taken' or 'missed'", () => {
    expect(needsPoisonLine([note("I took my sleeping pill twice last night")])).toBe(true);
    expect(needsPoisonLine([note("Took my water pill again by accident")])).toBe(true);
    expect(needsPoisonLine([note("I forgot I had already taken my evening pills")])).toBe(true);
  });

  it("is true for someone else's pills", () => {
    expect(needsPoisonLine([note("Took my husband's pills this morning")])).toBe(true);
  });

  it("is true for a mix-up told with 'confused with my tablets'", () => {
    expect(needsPoisonLine([note("Got confused with my tablets and took the wrong ones")])).toBe(true);
    expect(needsPoisonLine([note("Got confused with my tablets")])).toBe(true);
  });

  // Confusion is a symptom Kinwise tracks; a poisoning notice beside it would hint at a cause.
  it("is false for confusion as a symptom", () => {
    expect(needsPoisonLine([note("Feeling confused since starting the new sleeping pill")])).toBe(false);
  });

  it("is false for a side effect that only shares a word ('double vision', 'today's pills')", () => {
    expect(needsPoisonLine([note("The new sleeping pill gives me double vision")])).toBe(false);
    expect(needsPoisonLine([note("I forgot today's pills")])).toBe(false);
  });

  // A skipped dose is not too much: "by accident" / "by mistake" alone must not turn a missed note into a poisoning
  // notice (review finding, round 3).
  it("is false for a missed dose told with 'by accident' or 'by mistake'", () => {
    for (const t of [
      "I accidentally skipped my water pill this morning",
      "I missed my water pill by mistake",
      "Forgot my water pill by accident",
      "I accidentally forgot my sleeping pill last night",
    ]) {
      expect(needsPoisonLine([note(t)]), t).toBe(false);
    }
  });

  // Confusion and side effects told in the patient's own words: a poisoning notice beside them would hint at a cause.
  it("is false for confusion or a side effect told with 'mixed up', 'muddled', 'again' or 'the wrong'", () => {
    for (const t of [
      "Feeling mixed up and foggy since the new sleeping pill",
      "My head feels muddled after the sleeping pill",
      "I had the dizzy spell again after my water pill",
      "Had a bad night again even with the sleeping pill",
      "Took my water pill again this morning",
      "Took my water pill late again",
      "The sleeping pill is the wrong one for me, it makes me groggy",
      "My water pill makes me feel the wrong kind of tired",
    ]) {
      expect(needsPoisonLine([note(t)]), t).toBe(false);
    }
  });

  it("stays true for the double doses and wrong medicine told plainly", () => {
    for (const t of [
      "Took two of the sleeping tablets by mistake",
      "Took my water pill twice yesterday",
      "Accidentally took my evening pills twice",
      "Got confused with my tablets and took the wrong ones",
    ]) {
      expect(needsPoisonLine([note(t)]), t).toBe(true);
    }
  });

  it("is true when any one of several notes is an extra dose", () => {
    expect(needsPoisonLine([note("Forgot my water pill"), note("Accidentally took my evening pills twice")])).toBe(true);
  });
});

describe("MedSafetyLine", () => {
  const html = renderToStaticMarkup(createElement(MedSafetyLine));

  it("is a note, not an alert, so it does not interrupt a screen reader", () => {
    expect(html).toContain('role="note"');
    expect(html).not.toContain('role="alert"');
  });

  it("gives the Poison Control and 911 numbers as phone links", () => {
    expect(html).toContain('href="tel:18002221222"');
    expect(html).toContain('href="tel:911"');
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("If someone took too much of a medicine or the wrong one, call Poison Control at 1‑800‑222‑1222 (US, free, 24/7).");
    expect(text).toContain("In an emergency call 911.");
  });
});
