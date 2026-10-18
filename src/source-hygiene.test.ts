// Source hygiene: no invisible formatting characters in the code under src/.
//
// Bidirectional-override/isolate marks (U+202A-U+202E, U+2066-U+2069), zero-width characters (U+200B-U+200F,
// U+2060-U+2064, U+FEFF) and the emoji variation selector (U+FE0F) render as nothing, so a reader cannot see them
// and GitHub flags the file as "hidden or bidirectional Unicode text". Code that needs one (the prompt-injection
// sanitiser, the emoji tokeniser) writes it as an escape such as \u202E, which means the same thing to the regex
// engine and is visible in review and in the printed code tour.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(SRC, "..");
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".html", ".md"]);
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFE0F\uFEFF]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return TEXT_EXTENSIONS.has(extname(e.name)) ? [p] : [];
  });
}

/** "src/ai/guard.ts:161:63 U+202A" for every invisible character in `file`. */
function invisibleIn(file: string): string[] {
  const out: string[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(INVISIBLE)) {
        const code = m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
        out.push(`${relative(ROOT, file)}:${i + 1}:${m.index + 1} U+${code} (write it as \\u${code})`);
      }
    });
  return out;
}

describe("source hygiene", () => {
  it("finds the source files it is meant to scan", () => {
    const files = sourceFiles(SRC).map((f) => relative(ROOT, f));
    expect(files).toContain(join("src", "ai", "guard.ts"));
    expect(files).toContain(join("src", "engine", "nlp", "segment.ts"));
  });

  it("has no literal bidi, zero-width or variation-selector characters under src/", () => {
    expect(sourceFiles(SRC).flatMap(invisibleIn)).toEqual([]);
  });
});
