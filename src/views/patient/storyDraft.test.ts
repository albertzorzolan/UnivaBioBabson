// Unsaved check-in story kept across a page refresh (src/views/patient/storyDraft.ts).
import { describe, expect, it } from "vitest";
import { clearAllStoryDrafts, clearStoryDraft, DRAFT_PREFIX, readStoryDraft, writeStoryDraft } from "./storyDraft";

/** sessionStorage stand-in (the node test environment has no window). */
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** A storage whose every call throws (Safari private mode, blocked site data). */
const broken = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("story draft", () => {
  it("keeps one draft per day and reads it back", () => {
    const s = memory();
    writeStoryDraft("2026-10-17", "Felt woozy", s);
    writeStoryDraft("2026-10-16", "Slept badly", s);
    expect(readStoryDraft("2026-10-17", s)).toBe("Felt woozy");
    expect(readStoryDraft("2026-10-16", s)).toBe("Slept badly");
    expect(s.map.get(`${DRAFT_PREFIX}2026-10-17`)).toBe("Felt woozy");
  });

  it("returns null when there is no draft", () => {
    expect(readStoryDraft("2026-10-17", memory())).toBeNull();
  });

  it("removes the draft when the text is emptied, and on clear", () => {
    const s = memory();
    writeStoryDraft("2026-10-17", "Felt woozy", s);
    writeStoryDraft("2026-10-17", "   ", s);
    expect(readStoryDraft("2026-10-17", s)).toBeNull();
    writeStoryDraft("2026-10-17", "Felt woozy", s);
    clearStoryDraft("2026-10-17", s);
    expect(readStoryDraft("2026-10-17", s)).toBeNull();
  });

  it("never throws when storage is blocked or missing", () => {
    expect(() => writeStoryDraft("2026-10-17", "x", broken)).not.toThrow();
    expect(readStoryDraft("2026-10-17", broken)).toBeNull();
    expect(() => clearStoryDraft("2026-10-17", broken)).not.toThrow();
    expect(readStoryDraft("2026-10-17", null)).toBeNull();
    expect(() => writeStoryDraft("2026-10-17", "x", null)).not.toThrow();
  });
});

describe("clearAllStoryDrafts (Delete everything)", () => {
  /** sessionStorage stand-in that can also list its keys, like the real Storage. */
  function listable() {
    const s = memory();
    return {
      ...s,
      get length() {
        return s.map.size;
      },
      key: (i: number) => [...s.map.keys()][i] ?? null,
    };
  }

  it("removes the draft of every day and leaves other keys alone", () => {
    const s = listable();
    writeStoryDraft("2026-10-17", "Felt woozy", s);
    writeStoryDraft("2026-10-16", "Slept badly", s);
    writeStoryDraft("2026-10-11", "Tired", s);
    s.setItem("kinwise.v1.session", "patient");
    clearAllStoryDrafts(s);
    expect([...s.map.keys()]).toEqual(["kinwise.v1.session"]);
  });

  it("never throws when storage is blocked or missing", () => {
    expect(() => clearAllStoryDrafts({ ...broken, length: 1, key: () => `${DRAFT_PREFIX}2026-10-17` })).not.toThrow();
    expect(() => clearAllStoryDrafts(null)).not.toThrow();
  });
});
