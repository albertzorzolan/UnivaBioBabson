// Emoji handling in the tokeniser and sentence splitter: a variation selector (U+FE0F), a zero-width joiner
// sequence (U+200D) or a skin-tone modifier stays part of one emoji token.
import { describe, expect, it } from "vitest";
import { splitSentences, tokenize } from "./segment";

const HEART = "\u2764\uFE0F"; // red heart + emoji presentation selector
const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"; // man ZWJ woman ZWJ girl
const THUMBS_UP_TONE = "\u{1F44D}\u{1F3FD}"; // thumbs up + medium skin tone

describe("tokenize: emoji", () => {
  it.each([HEART, FAMILY, THUMBS_UP_TONE])("keeps %s as one emoji token", (emoji) => {
    const toks = tokenize(`ok ${emoji} fine`);
    expect(toks.map((t) => t.text)).toEqual(["ok", emoji, "fine"]);
    expect(toks[1].kind).toBe("emoji");
  });
});

describe("splitSentences: emoji as separators", () => {
  it("cuts after a whole emoji sequence that is followed by more words", () => {
    expect(splitSentences(`Slept well ${FAMILY} visited today`).map((s) => s.text)).toEqual([
      `Slept well ${FAMILY}`,
      "visited today",
    ]);
    expect(splitSentences(`Good day ${HEART} no falls`).map((s) => s.text)).toEqual([`Good day ${HEART}`, "no falls"]);
  });
});
