// The two shell additions from src/app/layouts: the recovery notice (RecoveryNotice.tsx) and the demo role switch
// label (DemoSwitch.tsx). The test environment is node (no DOM), so the notice is rendered to HTML with
// react-dom/server through the real StoreProvider: a broken record in a stand-in localStorage must make the provider
// recover, keep a copy, and show the notice. Dismissing is a click, which the browser test covers.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../StoreProvider";
import { RecoveryNotice } from "./RecoveryNotice";
import { demoSwitchLabel } from "./DemoSwitch";
import { STORAGE_KEY, UNREADABLE_PREFIX } from "../../model/store";
import { createSeed } from "../../model/seed";

const TODAY = "2026-10-10";

/** Minimal localStorage stand-in; `failCopy` makes writes of the unreadable copy throw (storage full). */
function fakeStorage(initial: Record<string, string>, failCopy = false) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failCopy && k.startsWith(UNREADABLE_PREFIX)) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

/** Render the notice inside a real StoreProvider whose window.localStorage is `storage`. */
function renderNotice(storage: ReturnType<typeof fakeStorage>): string {
  vi.stubGlobal("window", { localStorage: storage });
  return renderToStaticMarkup(createElement(StoreProvider, { today: TODAY, children: createElement(RecoveryNotice) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RecoveryNotice", () => {
  it("shows the notice, keeps a copy and offers it as a download when the saved record is broken JSON", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: "{not json" });
    const html = renderNotice(storage);
    expect(html).toContain("Saved data couldn’t be read, so the demo record was loaded.");
    expect(html).toContain("A copy of the unreadable data was kept in this browser.");
    expect(html).toContain("Download the copy");
    expect(html).toContain('aria-label="Dismiss this message"');
    const copies = [...storage.map.keys()].filter((k) => k.startsWith(UNREADABLE_PREFIX));
    expect(copies).toHaveLength(1);
    expect(storage.map.get(copies[0])).toBe("{not json");
  });

  it("says plainly that no copy exists when the copy could not be written, and offers no download", () => {
    const html = renderNotice(fakeStorage({ [STORAGE_KEY]: "{not json" }, true));
    expect(html).toContain("Saved data couldn’t be read, so the demo record was loaded.");
    expect(html).toContain("A copy of it couldn’t be kept in this browser.");
    expect(html).not.toContain("Download the copy");
  });

  it("shows nothing when the saved record loads, or on a first visit", () => {
    expect(renderNotice(fakeStorage({ [STORAGE_KEY]: JSON.stringify(createSeed(TODAY)) }))).toBe("");
    expect(renderNotice(fakeStorage({}))).toBe("");
  });
});

describe("demoSwitchLabel", () => {
  const profile = createSeed(TODAY).profile;

  it("uses the names from the profile", () => {
    expect(demoSwitchLabel(profile, "caregiver")).toBe(`Demo: switch to ${profile.caregiverName}’s view`);
    expect(demoSwitchLabel(profile, "patient")).toBe(`Demo: switch to ${profile.preferredName}’s view`);
  });

  it("falls back to generic words for empty, blank or missing names instead of crashing", () => {
    expect(demoSwitchLabel({ ...profile, caregiverName: "  " }, "caregiver")).toBe("Demo: switch to the caregiver’s view");
    const noNames = { ...profile } as Record<string, unknown>;
    delete noNames.caregiverName;
    delete noNames.preferredName;
    expect(demoSwitchLabel(noNames as unknown as typeof profile, "caregiver")).toBe("Demo: switch to the caregiver’s view");
    expect(demoSwitchLabel(noNames as unknown as typeof profile, "patient")).toBe("Demo: switch to the patient’s view");
  });
});
