// Demo dates and "Delete everything" through the real StoreProvider (src/app/StoreProvider.tsx), with a stand-in
// localStorage. The test environment is node (no DOM): the notice is rendered to HTML with react-dom/server, and
// the provider's API is captured from a render to call deleteEverything directly. Clicks are covered by the
// browser tests.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "../StoreProvider";
import { RecoveryNotice } from "./RecoveryNotice";
import { commitStore, STORAGE_KEY, UNREADABLE_PREFIX } from "../../model/store";
import { createSeed } from "../../model/seed";

const BUILT = "2026-10-17";
const LATER = "2026-10-26";

/** localStorage stand-in that can list its keys, like the real Storage. */
function fakeStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

type Api = ReturnType<typeof useStore>;

/** Render RecoveryNotice inside a StoreProvider for `today`; returns the HTML and the provider's API. */
function render(storage: ReturnType<typeof fakeStorage>, today: string): { html: string; api: Api } {
  vi.stubGlobal("window", { localStorage: storage });
  let api: Api | null = null;
  const Capture = () => {
    api = useStore();
    return null;
  };
  const html = renderToStaticMarkup(
    createElement(StoreProvider, { today, children: [createElement(RecoveryNotice, { key: "n" }), createElement(Capture, { key: "c" })] }),
  );
  return { html, api: api! };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo dates", () => {
  it("rebuilds an untouched demo record from an earlier day without a banner", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(createSeed(BUILT)) });
    const { html, api } = render(storage, LATER);
    expect(html).toBe("");
    expect(api.data.datasetId).toBe(createSeed(LATER).datasetId);
    expect(api.staleDemo).toBeNull();
  });

  it("offers to refresh the dates of an edited demo record from an earlier day", () => {
    const seed = createSeed(BUILT);
    const note = { id: "note-x", author: "caregiver" as const, date: BUILT, text: "Ask about the fall.", pinned: false, createdAt: `${BUILT}T12:00:00.000Z` };
    const edited = commitStore(seed, { ...seed, notes: [...seed.notes, note] }, "caregiver");
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(edited) });
    const { html, api } = render(storage, LATER);
    expect(html).toContain("Demo dates are from Saturday, October 17.");
    expect(html).toContain("Refresh demo dates");
    expect(html).toContain('aria-label="Dismiss this message"');
    expect(api.staleDemo).toEqual({ builtFor: BUILT });
    expect(api.data.datasetId).toBe(seed.datasetId); // kept until the user chooses
  });

  it("shows no banner for a record built today", () => {
    expect(render(fakeStorage({ [STORAGE_KEY]: JSON.stringify(createSeed(LATER)) }), LATER).html).toBe("");
  });
});

describe("deleteEverything", () => {
  it("saves an empty record and removes the copies of unreadable data", () => {
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify(createSeed(LATER)),
      [`${UNREADABLE_PREFIX}2026-10-12T08:00:00.000Z`]: "{not json",
      [`${UNREADABLE_PREFIX}2026-10-14T08:00:00.000Z`]: "null",
      "kinwise.v1.session": "caregiver",
    });
    const { api } = render(storage, LATER);
    expect(api.deleteEverything()).toEqual({ ok: true });
    expect([...storage.map.keys()].sort()).toEqual(["kinwise.v1.session", STORAGE_KEY]);
    const saved = JSON.parse(storage.map.get(STORAGE_KEY)!);
    expect(saved.isDemoData).toBe(false);
    expect(saved.medications).toEqual([]);
    expect(saved.profile.preferredName).toBe("");
  });
});
