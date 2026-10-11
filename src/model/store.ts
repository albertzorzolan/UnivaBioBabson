// Pure persistence + commit rules for the local record. No React here (usable from tests and the eval runner).
import type { ISODate, Role, Settings, StoreData } from "./types";
import { isValidDate } from "./dates";
import { createSeed } from "./seed";

export const STORAGE_KEY = "kinwise.v1.store";
export const SESSION_KEY = "kinwise.v1.session";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEFAULT_SETTINGS: Settings = {
  textSize: "standard",
  theme: "light",
  aiModel: "",
  tourCompleted: false,
};

/** Structural validation of a stored record. Rejects anything that could crash the UI. */
export function validateStore(x: unknown): x is StoreData {
  if (!x || typeof x !== "object") return false;
  const s = x as StoreData;
  if (s.schemaVersion !== 2 || typeof s.datasetId !== "string" || !Number.isSafeInteger(s.revision)) return false;
  if (!s.profile || typeof s.profile.displayName !== "string" || typeof s.profile.age !== "number") return false;
  const arrays = [s.medications, s.medEvents, s.checkIns, s.checkInHistory, s.notes, s.reviewDecisions, s.briefs, s.savedQuestions];
  if (!arrays.every(Array.isArray)) return false;
  if (!s.medications.every((m) => m && typeof m.id === "string" && typeof m.name === "string" && isValidDate(m.startDate)))
    return false;
  if (!s.checkIns.every((c) => c && typeof c.id === "string" && isValidDate(c.date) && c.answers && typeof c.story === "string"))
    return false;
  if (new Set(s.checkIns.map((c) => c.date)).size !== s.checkIns.length) return false;
  for (const c of s.checkIns)
    for (const p of Object.values(c.provenance ?? {}))
      for (const span of p?.spans ?? []) if (c.story.slice(span.start, span.end) !== span.quote) return false;
  return true;
}

export interface LoadResult {
  data: StoreData;
  /** "seeded" = first run; "recovered" = stored data was unreadable and a fresh demo record was created. */
  status: "loaded" | "seeded" | "recovered";
}

export function loadStore(storage: StorageLike, today: ISODate): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    const data = createSeed(today);
    saveStore(storage, data);
    return { data, status: "seeded" };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validateStore(parsed)) {
      parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      return { data: parsed, status: "loaded" };
    }
  } catch {
    /* fall through to recovery */
  }
  const data = createSeed(today);
  saveStore(storage, data);
  return { data, status: "recovered" };
}

export function saveStore(storage: StorageLike, data: StoreData): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export type Actor = Role | "system";

/**
 * Validate a proposed next state against role permissions, then bump the revision.
 * - Only the patient changes daily check-ins (answers are patient-reported).
 * - Only the caregiver changes the medication list, profile and review decisions.
 * - Each role edits only its own notes.
 * "system" (seed/reset/import) bypasses role checks but not validation.
 */
export function commitStore(prev: StoreData, next: StoreData, actor: Actor, now = new Date().toISOString()): StoreData {
  if (!validateStore(next)) throw new Error("This change would leave the record incomplete, so it was not saved.");
  if (actor !== "system") {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (actor === "caregiver" && (!same(prev.checkIns, next.checkIns) || !same(prev.checkInHistory, next.checkInHistory)))
      throw new Error("Only Margaret can change her own daily check-ins.");
    if (actor === "patient" && (!same(prev.medications, next.medications) || !same(prev.medEvents, next.medEvents)))
      throw new Error("Only the caregiver can edit the medication list.");
    if (actor === "patient" && (!same(prev.profile, next.profile) || !same(prev.reviewDecisions, next.reviewDecisions)))
      throw new Error("Only the caregiver can change the profile or review decisions.");
    const others = (s: StoreData) => s.notes.filter((n) => n.author !== actor);
    if (!same(others(prev), others(next))) throw new Error("You can only change your own notes.");
  }
  // Settings-only changes (theme, text size, tour) do not invalidate drafts.
  const sourceChanged =
    JSON.stringify({ ...prev, settings: null, briefs: null, updatedAt: null, revision: null }) !==
    JSON.stringify({ ...next, settings: null, briefs: null, updatedAt: null, revision: null });
  return { ...next, revision: sourceChanged ? prev.revision + 1 : prev.revision, updatedAt: now };
}
