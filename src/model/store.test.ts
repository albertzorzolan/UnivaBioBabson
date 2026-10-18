// Persistence + commit rules for the local record (src/model/store.ts).
import { beforeEach, describe, expect, it } from "vitest";
import {
  commitStore,
  DEFAULT_SETTINGS,
  loadStore,
  saveStore,
  STORAGE_KEY,
  UNREADABLE_PREFIX,
  validateStore,
  type StorageLike,
} from "./store";
import { createSeed, demoDatasetId, demoFreshness, refreshDemo } from "./seed";
import type { CheckIn, Medication, Note, StoreData } from "./types";

const TODAY = "2026-10-10";
const NOW = "2026-10-10T16:00:00.000Z";

/** In-memory Storage stand-in (localStorage is not available in the node test environment). */
class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  writes = 0;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Deep copy so every test edits its own record. */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

let base: StoreData;
beforeEach(() => {
  base = createSeed(TODAY);
});

function todaysCheckIn(): CheckIn {
  return {
    id: "chk-live",
    date: TODAY,
    answers: {
      energy: 3,
      sleep: 3,
      appetite: "same",
      dizziness: true,
      dizzinessSeverity: 1,
      drowsiness: false,
      confusion: false,
      fall: false,
      nearFall: false,
      swelling: false,
    },
    otherSymptoms: [],
    story: "A bit woozy this morning.",
    provenance: { dizziness: { origin: "nlp", certainty: "explicit", spans: [{ start: 6, end: 11, quote: "woozy" }] } },
    medNotes: [],
    confirmedAt: NOW,
    revision: 1,
  };
}

function newMed(): Medication {
  return {
    id: "med-new",
    name: "Melatonin",
    ingredientIds: [],
    match: "none",
    dose: "3 mg",
    frequency: "at bedtime",
    asNeeded: false,
    otc: true,
    reason: "Sleep",
    prescriber: "Self (OTC)",
    startDate: TODAY,
    endDate: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function note(author: Note["author"], id = `note-${author}-new`): Note {
  return { id, date: TODAY, author, text: "Something to mention at the visit.", pinned: false, createdAt: NOW };
}

// ---------------------------------------------------------------------------

describe("validateStore", () => {
  it("accepts the seed and a minimal empty record", () => {
    expect(validateStore(base)).toBe(true);
    const empty: StoreData = { ...base, medications: [], medEvents: [], checkIns: [], checkInHistory: [], notes: [] };
    expect(validateStore(empty)).toBe(true);
  });

  it.each([null, undefined, 0, "store", [], true])("rejects a non-object (%j)", (x) => {
    expect(validateStore(x)).toBe(false);
  });

  it("rejects the wrong schema version, dataset id or revision", () => {
    expect(validateStore({ ...base, schemaVersion: 1 })).toBe(false);
    expect(validateStore({ ...base, datasetId: 42 })).toBe(false);
    expect(validateStore({ ...base, revision: 1.5 })).toBe(false);
    expect(validateStore({ ...base, revision: "1" })).toBe(false);
  });

  it("rejects a missing or malformed profile", () => {
    expect(validateStore({ ...base, profile: undefined })).toBe(false);
    expect(validateStore({ ...base, profile: { ...base.profile, displayName: null } })).toBe(false);
    expect(validateStore({ ...base, profile: { ...base.profile, age: "78" } })).toBe(false);
  });

  it("rejects a profile without the patient's preferred name or the caregiver's name (both shells read them)", () => {
    for (const key of ["preferredName", "caregiverName"] as const) {
      const missing = clone(base);
      delete (missing.profile as unknown as Record<string, unknown>)[key];
      expect(validateStore(missing)).toBe(false);
      expect(validateStore({ ...base, profile: { ...base.profile, [key]: null } })).toBe(false);
    }
    // An empty name is fine: the screens fall back to "the patient" / "the caregiver".
    expect(validateStore({ ...base, profile: { ...base.profile, preferredName: "", caregiverName: "" } })).toBe(true);
  });

  it.each(["medications", "medEvents", "checkIns", "checkInHistory", "notes", "reviewDecisions", "briefs", "savedQuestions"])(
    "rejects a record whose %s is missing or not an array",
    (key) => {
      const missing = clone(base) as unknown as Record<string, unknown>;
      delete missing[key];
      expect(validateStore(missing)).toBe(false);
      expect(validateStore({ ...base, [key]: {} })).toBe(false);
      expect(validateStore({ ...base, [key]: null })).toBe(false);
    },
  );

  it.each(["2026-02-30", "2026-13-01", "10/10/2026", "2026-1-5", "", "2026-10-10T00:00:00Z"])(
    "rejects a medication start date of %j",
    (startDate) => {
      const d = clone(base);
      d.medications[0].startDate = startDate;
      expect(validateStore(d)).toBe(false);
    },
  );

  it("rejects a medication without an id or name", () => {
    const noId = clone(base);
    (noId.medications[0] as unknown as Record<string, unknown>).id = undefined;
    expect(validateStore(noId)).toBe(false);
    const noName = clone(base);
    (noName.medications[0] as unknown as Record<string, unknown>).name = 7;
    expect(validateStore(noName)).toBe(false);
  });

  it.each(["2026-02-29", "2026-00-10", "yesterday"])("rejects a check-in date of %j", (date) => {
    const d = clone(base);
    d.checkIns[0].date = date;
    expect(validateStore(d)).toBe(false);
  });

  it("rejects check-ins without answers or a story string", () => {
    const noAnswers = clone(base);
    (noAnswers.checkIns[0] as unknown as Record<string, unknown>).answers = null;
    expect(validateStore(noAnswers)).toBe(false);
    const noStory = clone(base);
    (noStory.checkIns[0] as unknown as Record<string, unknown>).story = undefined;
    expect(validateStore(noStory)).toBe(false);
  });

  it("rejects two check-ins on the same date", () => {
    const d = clone(base);
    d.checkIns.push({ ...d.checkIns[0], id: "chk-duplicate" });
    expect(validateStore(d)).toBe(false);
  });

  it("rejects a provenance span that does not quote the story exactly", () => {
    const withSpan = base.checkIns.findIndex((c) => Object.values(c.provenance).some((p) => p && p.spans.length));
    expect(withSpan).toBeGreaterThanOrEqual(0);
    const field = Object.keys(base.checkIns[withSpan].provenance)[0] as keyof CheckIn["provenance"];

    const shifted = clone(base);
    const span = shifted.checkIns[withSpan].provenance[field]!.spans[0];
    span.start += 1;
    span.end += 1;
    expect(validateStore(shifted)).toBe(false);

    const outOfRange = clone(base);
    const s2 = outOfRange.checkIns[withSpan].provenance[field]!.spans[0];
    s2.start = 5000;
    s2.end = 5010;
    expect(validateStore(outOfRange)).toBe(false);

    const editedStory = clone(base);
    editedStory.checkIns[withSpan].story = editedStory.checkIns[withSpan].story.toUpperCase();
    expect(validateStore(editedStory)).toBe(false);
  });

  // Every list item is checked for the fields the screens read, so a malformed import or a hand-edited
  // record is refused instead of crashing the app on the next load.
  it("rejects arrays whose items are not records (code-audit probe)", () => {
    expect(validateStore({ ...base, notes: [null], medEvents: [42], briefs: ["x"] })).toBe(false);
    expect(validateStore({ ...base, notes: [null] })).toBe(false);
    expect(validateStore({ ...base, medEvents: [42] })).toBe(false);
    expect(validateStore({ ...base, briefs: ["x"] })).toBe(false);
    expect(validateStore({ ...base, reviewDecisions: [[]] })).toBe(false);
    expect(validateStore({ ...base, savedQuestions: [undefined] })).toBe(false);
    expect(validateStore({ ...base, checkInHistory: [7] })).toBe(false);
  });

  it("rejects a note without an id, a known author or text", () => {
    const n = note("caregiver");
    expect(validateStore({ ...base, notes: [{ ...n, id: 1 }] })).toBe(false);
    expect(validateStore({ ...base, notes: [{ ...n, author: "doctor" }] })).toBe(false);
    expect(validateStore({ ...base, notes: [{ ...n, text: null }] })).toBe(false);
  });

  it("rejects a medication event without an id, a medication id or a valid date", () => {
    const e = { id: "evt-1", medicationId: "med-1", date: TODAY, kind: "started", detail: "", createdAt: NOW };
    expect(validateStore({ ...base, medEvents: [e] })).toBe(true);
    expect(validateStore({ ...base, medEvents: [{ ...e, id: undefined }] })).toBe(false);
    expect(validateStore({ ...base, medEvents: [{ ...e, medicationId: 3 }] })).toBe(false);
    expect(validateStore({ ...base, medEvents: [{ ...e, date: "2026-02-30" }] })).toBe(false);
  });

  it("rejects briefs, review decisions and saved questions missing their key fields", () => {
    expect(validateStore({ ...base, briefs: [{ content: {} }] })).toBe(false);
    expect(validateStore({ ...base, briefs: [{ id: "b1", content: null }] })).toBe(false);
    expect(validateStore({ ...base, reviewDecisions: [{ status: "open" }] })).toBe(false);
    expect(validateStore({ ...base, reviewDecisions: [{ findingKey: "k", status: 2 }] })).toBe(false);
    expect(validateStore({ ...base, savedQuestions: [{ id: "q1" }] })).toBe(false);
    expect(validateStore({ ...base, savedQuestions: [{ text: "Ask about sleep" }] })).toBe(false);
  });

  it("rejects check-in history entries without an id, a valid date or a story", () => {
    const old = clone(base.checkIns[0]);
    expect(validateStore({ ...base, checkInHistory: [old] })).toBe(true);
    expect(validateStore({ ...base, checkInHistory: [{ ...old, date: "soon" }] })).toBe(false);
    expect(validateStore({ ...base, checkInHistory: [{ ...old, story: 4 }] })).toBe(false);
  });

  it("stays lenient about optional fields", () => {
    const { pinned: _p, createdAt: _c, ...bareNote } = note("patient");
    expect(validateStore({ ...base, notes: [bareNote] })).toBe(true);
    expect(validateStore({ ...base, savedQuestions: [{ id: "q1", text: "Ask about sleep" }] })).toBe(true);
    expect(validateStore({ ...base, reviewDecisions: [{ findingKey: "k", status: "to_discuss" }] })).toBe(true);
    expect(validateStore({ ...base, briefs: [{ id: "b1", content: {} }] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("loadStore / saveStore", () => {
  it("seeds a fresh demo record when storage is empty, and saves it", () => {
    const storage = new MemoryStorage();
    const r = loadStore(storage, TODAY);
    expect(r.status).toBe("seeded");
    expect(r.data).toEqual(createSeed(TODAY));
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(r.data));
  });

  it("loads what was saved", () => {
    const storage = new MemoryStorage();
    const d = clone(base);
    d.notes.push(note("caregiver"));
    saveStore(storage, d);
    const r = loadStore(storage, TODAY);
    expect(r.status).toBe("loaded");
    expect(r.data).toEqual(d);
  });

  // Current loadStore behaviour: a saved record is returned as it is, even when it is demo data built for an
  // earlier day. The story's dates then drift (the fall is no longer "5 days ago"). demoFreshness (seed.ts)
  // detects this; whether loadStore refreshes automatically is the lead's decision. These tests show that the
  // pieces compose, so wiring them in is a small change to loadStore.
  it("returns a demo record saved on an earlier day as it is, and demoFreshness flags it", () => {
    const storage = new MemoryStorage();
    saveStore(storage, base);
    const r = loadStore(storage, "2026-10-12");
    expect(r.status).toBe("loaded");
    expect(r.data.datasetId).toBe(base.datasetId);
    expect(demoFreshness(r.data, "2026-10-12")).toBe("refresh");
    expect(demoFreshness(r.data, TODAY)).toBe("current");
  });

  it("an unedited stale demo record can be rebuilt for the new day without losing settings", () => {
    const storage = new MemoryStorage();
    const themed = commitStore(base, { ...base, settings: { ...base.settings, theme: "dark", tourCompleted: true } }, "patient", NOW);
    saveStore(storage, themed);
    const later = "2026-10-13";
    const loaded = loadStore(storage, later).data;
    expect(demoFreshness(loaded, later)).toBe("refresh");
    const rebuilt = refreshDemo(loaded, later);
    saveStore(storage, rebuilt);
    const again = loadStore(storage, later);
    expect(again.status).toBe("loaded");
    expect(again.data.datasetId).toBe(demoDatasetId(later));
    expect(again.data.settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark", tourCompleted: true });
    expect(demoFreshness(again.data, later)).toBe("current");
  });

  it("a demo record that someone has changed is 'stale', so the app asks before rebuilding it", () => {
    const withCheckIn = commitStore(base, { ...base, checkIns: [...base.checkIns, todaysCheckIn()] }, "patient", NOW);
    expect(withCheckIn.revision).toBe(2);
    expect(demoFreshness(withCheckIn, TODAY)).toBe("current");
    expect(demoFreshness(withCheckIn, "2026-10-11")).toBe("stale");
    const withNote = commitStore(base, { ...base, notes: [...base.notes, note("caregiver")] }, "caregiver", NOW);
    expect(demoFreshness(withNote, "2026-10-11")).toBe("stale");
  });

  it("fills settings added in later versions with defaults", () => {
    const storage = new MemoryStorage();
    const old = clone(base) as unknown as Record<string, unknown>;
    old.settings = { theme: "dark" };
    storage.setItem(STORAGE_KEY, JSON.stringify(old));
    const r = loadStore(storage, TODAY);
    expect(r.status).toBe("loaded");
    expect(r.data.settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark" });
  });

  it.each([
    ["unparseable JSON", "{not json"],
    ["JSON null", "null"],
    ["a different app's data", JSON.stringify({ hello: "world" })],
    ["an old schema version", JSON.stringify({ schemaVersion: 1, entries: [] })],
  ])("recovers from %s by reseeding and overwriting storage", (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    const r = loadStore(storage, TODAY);
    expect(r.status).toBe("recovered");
    expect(r.data).toEqual(createSeed(TODAY));
    expect(validateStore(JSON.parse(storage.getItem(STORAGE_KEY)!))).toBe(true);
  });

  it("keeps a copy of unreadable data under a timestamped key before reseeding", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const r = loadStore(storage, TODAY, NOW);
    expect(r.status).toBe("recovered");
    expect(r.backupKey).toBe(`${UNREADABLE_PREFIX}${NOW}`);
    expect(r.backupKey).toBe("kinwise.v1.store.unreadable-2026-10-10T16:00:00.000Z");
    expect(storage.getItem(r.backupKey!)).toBe("{not json");
    expect(validateStore(JSON.parse(storage.getItem(STORAGE_KEY)!))).toBe(true);
  });

  it("keeps a copy of data saved by a newer version too", () => {
    const storage = new MemoryStorage();
    const newer = JSON.stringify({ ...base, schemaVersion: 3 });
    storage.setItem(STORAGE_KEY, newer);
    const r = loadStore(storage, TODAY, NOW);
    expect(r.status).toBe("recovered");
    expect(storage.getItem(r.backupKey!)).toBe(newer);
  });

  it("still recovers when the copy cannot be written (storage full), and reports no copy", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const full: StorageLike = {
      getItem: (k) => storage.getItem(k),
      removeItem: (k) => storage.removeItem(k),
      setItem: (k, v) => {
        if (k.startsWith(UNREADABLE_PREFIX)) throw new Error("QuotaExceededError");
        storage.setItem(k, v);
      },
    };
    const r = loadStore(full, TODAY, NOW);
    expect(r.status).toBe("recovered");
    expect(r.backupKey).toBeNull();
    expect(validateStore(JSON.parse(storage.getItem(STORAGE_KEY)!))).toBe(true);
  });

  it("makes no copy when there was nothing to recover", () => {
    const storage = new MemoryStorage();
    expect(loadStore(storage, TODAY, NOW).backupKey).toBeNull();
    expect(loadStore(storage, TODAY, NOW).backupKey).toBeNull();
    expect([...storage.map.keys()]).toEqual([STORAGE_KEY]);
  });

  it("recovers from structurally broken data (duplicate check-in dates)", () => {
    const storage = new MemoryStorage();
    const bad = clone(base);
    bad.checkIns[1] = { ...bad.checkIns[1], date: bad.checkIns[0].date };
    saveStore(storage, bad);
    expect(loadStore(storage, TODAY).status).toBe("recovered");
  });

  it("does not write to storage when loading a valid record", () => {
    const storage = new MemoryStorage();
    saveStore(storage, base);
    const writes = storage.writes;
    loadStore(storage, TODAY);
    expect(storage.writes).toBe(writes);
  });
});

// ---------------------------------------------------------------------------

describe("commitStore — role permissions", () => {
  it("lets the patient add today's check-in", () => {
    const next = commitStore(base, { ...base, checkIns: [...base.checkIns, todaysCheckIn()] }, "patient", NOW);
    expect(next.checkIns).toHaveLength(base.checkIns.length + 1);
  });

  it("lets the patient correct a check-in and keep the old version in history", () => {
    const old = base.checkIns[0];
    const fixed: CheckIn = { ...old, answers: { ...old.answers, energy: 2 }, revision: old.revision + 1 };
    const next = commitStore(
      base,
      { ...base, checkIns: base.checkIns.map((c) => (c.id === old.id ? fixed : c)), checkInHistory: [...base.checkInHistory, old] },
      "patient",
      NOW,
    );
    expect(next.checkIns[0].answers.energy).toBe(2);
  });

  it("does not let the caregiver change check-ins or their history", () => {
    expect(() => commitStore(base, { ...base, checkIns: [...base.checkIns, todaysCheckIn()] }, "caregiver", NOW)).toThrow(
      /Only Margaret Rivera can change/,
    );
    const edited = clone(base);
    edited.checkIns[3].answers.dizziness = !edited.checkIns[3].answers.dizziness;
    expect(() => commitStore(base, edited, "caregiver", NOW)).toThrow(/Only Margaret Rivera can change/);
    expect(() => commitStore(base, { ...base, checkInHistory: [] }, "caregiver", NOW)).toThrow(/Only Margaret Rivera can change/);
  });

  it("names the patient from the profile when refusing a caregiver check-in change", () => {
    const joe = { ...base, profile: { ...base.profile, displayName: "Joe Bloggs" } };
    expect(() => commitStore(joe, { ...joe, checkIns: [...joe.checkIns, todaysCheckIn()] }, "caregiver", NOW)).toThrow(
      "Only Joe Bloggs can change these daily check-ins.",
    );
    const unnamed = { ...base, profile: { ...base.profile, displayName: "  " } };
    expect(() => commitStore(unnamed, { ...unnamed, checkInHistory: [] }, "caregiver", NOW)).toThrow(
      "Only the patient can change these daily check-ins.",
    );
  });

  it("does not let the patient change the medication list or its events", () => {
    expect(() => commitStore(base, { ...base, medications: [...base.medications, newMed()] }, "patient", NOW)).toThrow(
      /Only the caregiver can edit the medication list/,
    );
    const stopped = clone(base);
    stopped.medications[7].endDate = TODAY;
    expect(() => commitStore(base, stopped, "patient", NOW)).toThrow(/medication list/);
    expect(() => commitStore(base, { ...base, medEvents: base.medEvents.slice(1) }, "patient", NOW)).toThrow(/medication list/);
  });

  it("does not let the patient change the profile or review decisions", () => {
    expect(() => commitStore(base, { ...base, profile: { ...base.profile, age: 70 } }, "patient", NOW)).toThrow(
      /profile or review decisions/,
    );
    const decision = { findingKey: "beers:lorazepam", status: "to_discuss" as const, note: "", updatedAt: NOW };
    expect(() => commitStore(base, { ...base, reviewDecisions: [decision] }, "patient", NOW)).toThrow(
      /profile or review decisions/,
    );
  });

  it("lets the caregiver change medications, profile and review decisions", () => {
    const decision = { findingKey: "beers:lorazepam", status: "to_discuss" as const, note: "Ask Dr. Lee", updatedAt: NOW };
    const next = commitStore(
      base,
      {
        ...base,
        medications: [...base.medications, newMed()],
        medEvents: [
          ...base.medEvents,
          { id: "evt-new", medicationId: "med-new", date: TODAY, kind: "added_to_list", detail: "Added.", createdAt: NOW },
        ],
        profile: { ...base.profile, conditions: [...base.profile.conditions, "anxiety"] },
        reviewDecisions: [decision],
      },
      "caregiver",
      NOW,
    );
    expect(next.medications).toHaveLength(9);
    expect(next.reviewDecisions).toEqual([decision]);
  });

  it("lets each role add and edit only its own notes", () => {
    const withCg = commitStore(base, { ...base, notes: [...base.notes, note("caregiver")] }, "caregiver", NOW);
    expect(withCg.notes).toHaveLength(base.notes.length + 1);
    const withPt = commitStore(base, { ...base, notes: [...base.notes, note("patient")] }, "patient", NOW);
    expect(withPt.notes).toHaveLength(base.notes.length + 1);

    // Caregiver unpins her own pinned concern: allowed.
    const unpinned = base.notes.map((n) => (n.pinned ? { ...n, pinned: false } : n));
    expect(() => commitStore(base, { ...base, notes: unpinned }, "caregiver", NOW)).not.toThrow();

    // Patient edits her own note: allowed.
    const ptEdited = base.notes.map((n) => (n.author === "patient" ? { ...n, text: `${n.text}, please` } : n));
    expect(() => commitStore(base, { ...base, notes: ptEdited }, "patient", NOW)).not.toThrow();
  });

  it("does not let a role add, edit, pin or delete the other role's notes", () => {
    expect(() => commitStore(base, { ...base, notes: [...base.notes, note("patient")] }, "caregiver", NOW)).toThrow(
      /your own notes/,
    );
    expect(() => commitStore(base, { ...base, notes: [...base.notes, note("caregiver")] }, "patient", NOW)).toThrow(
      /your own notes/,
    );
    const ptDeleted = base.notes.filter((n) => n.author !== "patient");
    expect(() => commitStore(base, { ...base, notes: ptDeleted }, "caregiver", NOW)).toThrow(/your own notes/);
    const cgPinnedByPatient = base.notes.map((n) => (n.author === "caregiver" && !n.pinned ? { ...n, pinned: true } : n));
    expect(() => commitStore(base, { ...base, notes: cgPinnedByPatient }, "patient", NOW)).toThrow(/your own notes/);
    const cgEdited = base.notes.map((n) => (n.pinned ? { ...n, text: "changed" } : n));
    expect(() => commitStore(base, { ...base, notes: cgEdited }, "patient", NOW)).toThrow(/your own notes/);
  });

  it("lets 'system' (seed, reset, import) change anything", () => {
    const next = commitStore(
      base,
      {
        ...base,
        checkIns: [...base.checkIns, todaysCheckIn()],
        medications: [...base.medications, newMed()],
        profile: { ...base.profile, age: 79 },
        notes: [],
      },
      "system",
      NOW,
    );
    expect(next.profile.age).toBe(79);
    expect(next.notes).toEqual([]);
  });

  it("still validates for every actor, including 'system'", () => {
    const dup = { ...base, checkIns: [...base.checkIns, { ...todaysCheckIn(), date: base.checkIns[0].date }] };
    for (const actor of ["patient", "caregiver", "system"] as const)
      expect(() => commitStore(base, dup, actor, NOW)).toThrow(/incomplete/);
    expect(() => commitStore(base, { ...base, medications: null } as unknown as StoreData, "system", NOW)).toThrow(
      /incomplete/,
    );
  });

  it("does not mutate the previous state", () => {
    const snapshot = JSON.stringify(base);
    commitStore(base, { ...base, notes: [...base.notes, note("caregiver")] }, "caregiver", NOW);
    try {
      commitStore(base, { ...base, checkIns: [] }, "caregiver", NOW);
    } catch {
      /* expected */
    }
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------

describe("commitStore — revision and timestamps", () => {
  it("bumps the revision when source records change", () => {
    const viaPatient = commitStore(base, { ...base, checkIns: [...base.checkIns, todaysCheckIn()] }, "patient", NOW);
    expect(viaPatient.revision).toBe(base.revision + 1);
    const viaCaregiver = commitStore(base, { ...base, medications: [...base.medications, newMed()] }, "caregiver", NOW);
    expect(viaCaregiver.revision).toBe(base.revision + 1);
    const viaNote = commitStore(base, { ...base, notes: [...base.notes, note("patient")] }, "patient", NOW);
    expect(viaNote.revision).toBe(base.revision + 1);
  });

  it("bumps exactly once per commit, whatever revision the caller passes", () => {
    const next = commitStore(base, { ...base, revision: 99, notes: [...base.notes, note("caregiver")] }, "caregiver", NOW);
    expect(next.revision).toBe(base.revision + 1);
    const twice = commitStore(next, { ...next, notes: [...next.notes, note("caregiver", "note-2")] }, "caregiver", NOW);
    expect(twice.revision).toBe(base.revision + 2);
  });

  it("does NOT bump the revision for settings-only changes (theme, text size, tour)", () => {
    for (const actor of ["patient", "caregiver", "system"] as const) {
      const next = commitStore(
        base,
        { ...base, settings: { ...base.settings, theme: "dark", textSize: "large", tourCompleted: true } },
        actor,
        NOW,
      );
      expect(next.revision).toBe(base.revision);
      expect(next.settings.theme).toBe("dark");
      expect(next.updatedAt).toBe(NOW);
    }
  });

  it("does NOT bump the revision for briefs-only changes", () => {
    const brief = {
      id: "brief-1",
      from: "2026-09-10",
      to: TODAY,
      content: { reason: [], noticed: [], reviewPrompts: [], questions: [], limitations: [] },
      generation: {
        mode: "template" as const,
        model: null,
        promptVersion: null,
        kbVersion: "test",
        durationMs: null,
        droppedSentences: 0,
        evidenceHash: "abc",
        generatedAt: NOW,
      },
      includedConcernIds: [],
      reviewedAt: null,
      reviewedBy: null,
      sourceRevision: base.revision,
    };
    const next = commitStore(base, { ...base, briefs: [brief] }, "caregiver", NOW);
    expect(next.revision).toBe(base.revision);
    expect(next.briefs).toHaveLength(1);
  });

  it("does not bump the revision for a no-op commit, but records the time", () => {
    const next = commitStore(base, { ...base }, "patient", NOW);
    expect(next.revision).toBe(base.revision);
    expect(next.updatedAt).toBe(NOW);
  });

  it("stamps updatedAt with the commit time", () => {
    const next = commitStore(base, { ...base, notes: [...base.notes, note("caregiver")] }, "caregiver", NOW);
    expect(next.updatedAt).toBe(NOW);
  });
});
