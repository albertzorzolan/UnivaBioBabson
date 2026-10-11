// Guards WCAG 2.2 AA contrast for the design tokens in BOTH themes, so a palette tweak can't silently
// break readability (audit bug B5: settings text at 2.9–3.6:1).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AA_LARGE_OR_UI, AA_TEXT, contrastRatio, hexToRgb } from "./contrast";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

/** Extract `--name: #hex` declarations from the first rule whose selector matches `selector`. */
function block(selector: RegExp): Record<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`No rule for ${selector}`);
  const start = css.indexOf("{", m.index);
  const end = css.indexOf("\n}", start);
  const out: Record<string, string> = {};
  for (const d of css.slice(start + 1, end).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) out[d[1]] = d[2];
  return out;
}

const themes = {
  light: block(/:root,\s*\[data-theme="light"\]\s*\{/),
  dark: block(/\[data-theme="dark"\]\s*\{/),
};

// [foreground, background, minimum]
const TEXT_PAIRS: [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface-raised"],
  ["ink", "surface-sunken"],
  ["ink", "surface-tint"],
  ["ink-muted", "bg"],
  ["ink-muted", "surface"],
  ["ink-muted", "surface-raised"],
  ["ink-muted", "surface-sunken"],
  ["ink-muted", "surface-tint"],
  ["ink-subtle", "bg"],
  ["ink-subtle", "surface-raised"],
  ["ink-inverse", "surface-inverse"],
  ["primary-text", "bg"],
  ["primary-text", "surface"],
  ["primary-text", "surface-raised"],
  ["primary-ink", "primary"],
  ["primary-ink", "primary-hover"],
  ["primary-soft-ink", "primary-soft"],
  ["accent-ink", "accent"],
  ["accent-ink", "accent-hover"],
  ["info-ink", "info-soft"],
  ["caution-ink", "caution-soft"],
  ["attention-ink", "attention-soft"],
  ["attention-ink", "surface"],
  ["success-ink", "success-soft"],
  ["ink", "info-soft"],
  ["ink", "caution-soft"],
  ["ink", "attention-soft"],
  ["ink", "success-soft"],
  ["ink-muted", "primary-soft"],
  ["accent-hover", "accent-soft"], // avatar initials
  ["hero-ink", "hero-surface"],
  ["hero-ink-muted", "hero-surface"],
];

// Non-text UI: input borders, focus ring, status icons (WCAG 1.4.11, ≥ 3:1).
const UI_PAIRS: [string, string][] = [
  ["line-strong", "surface-raised"],
  ["line-strong", "bg"],
  ["focus", "bg"],
  ["focus", "surface"],
  ["focus", "surface-raised"],
  ["focus", "primary-soft"],
  ["primary", "bg"],
  ["attention", "surface"],
  ["info", "surface"],
  ["success", "surface"],
];

describe.each(Object.entries(themes))("%s theme tokens", (_name, t) => {
  it("parses a full palette", () => {
    for (const k of ["bg", "surface", "ink", "ink-muted", "primary", "focus", "line-strong"]) {
      expect(t[k], k).toBeDefined();
      expect(() => hexToRgb(t[k])).not.toThrow();
    }
  });

  it.each(TEXT_PAIRS)("text %s on %s ≥ 4.5:1", (fg, bg) => {
    expect(t[fg], fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(UI_PAIRS)("UI %s on %s ≥ 3:1", (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(AA_LARGE_OR_UI);
  });

  it("every chart series colour is distinguishable from the card surface (≥ 2.5:1, labels carry the rest)", () => {
    for (let i = 1; i <= 8; i++) expect(contrastRatio(t[`series-${i}`], t.surface), `series-${i}`).toBeGreaterThanOrEqual(2.5);
  });
});

describe("contrast helpers", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#fff", "#ffffff")).toBe(1);
  });
});
