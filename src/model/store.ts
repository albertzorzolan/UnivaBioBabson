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

/** Prefix of the key under which loadStore keeps a copy of unreadable data before reseeding. */
export const UNREADABLE_PREFIX = `${STORAGE_KEY}.unreadable-`;

/** A plain object (not null, not an array). */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** A diary entry: what every screen reads (id, a real calendar date, the answers object and the story text). */
const isCheckIn = (c: unknown) => isObj(c) && isStr(c.id) && isValidDate(c.date) && isObj(c.answers) && isStr(c.story);

/**
 * Structural validation of a stored record. Rejects anything that could crash the UI.
 * Every list item is checked for the fields the screens read; optional fields (pinned, createdAt, detail...) are not
 * required, so records from slightly older builds still load.
 */
export function validateStore(x: unknown): x is StoreData {
  if (!x || typeof x !== "object") return false;
  const s = x as StoreData;
  if (s.schemaVersion !== 2 || typeof s.datasetId !== "string" || !Number.isSafeInteger(s.revision)) return false;
  if (!s.profile || typeof s.profile.displayName !== "string" || typeof s.profile.age !== "number") return false;
  // Both shells show these names (greeting, demo role switch). They may be empty, but must be strings.
  if (typeof s.profile.preferredName !== "string" || typeof s.profile.caregiverName !== "string") return false;
  const arrays = [s.medications, s.medEvents, s.checkIns, s.checkInHistory, s.notes, s.reviewDecisions, s.briefs, s.savedQuestions];
  if (!arrays.every(Array.isArray)) return false;
  if (!s.medications.every((m) => m && typeof m.id === "string" && typeof m.name === "string" && isValidDate(m.startDate)))
    return false;
  if (!s.checkIns.every(isCheckIn) || !s.checkInHistory.every(isCheckIn)) return false;
  if (new Set(s.checkIns.map((c) => c.date)).size !== s.checkIns.length) return false;
  for (const c of s.checkIns)
    for (const p of Object.values(c.provenance ?? {}))
      for (const span of p?.spans ?? []) if (c.story.slice(span.start, span.end) !== span.quote) return false;
  const events: unknown[] = s.medEvents;
  if (!events.every((e) => isObj(e) && isStr(e.id) && isStr(e.medicationId) && isValidDate(e.date))) return false;
  const notes: unknown[] = s.notes;
  if (!notes.every((n) => isObj(n) && isStr(n.id) && (n.author === "patient" || n.author === "caregiver") && isStr(n.text)))
    return false;
  const briefs: unknown[] = s.briefs;
  if (!briefs.every((b) => isObj(b) && isStr(b.id) && isObj(b.content))) return false;
  // Review decisions are keyed by the finding they belong to, not by an id of their own.
  const decisions: unknown[] = s.reviewDecisions;
  if (!decisions.every((d) => isObj(d) && isStr(d.findingKey) && isStr(d.status))) return false;
  const questions: unknown[] = s.savedQuestions;
  if (!questions.every((q) => isObj(q) && isStr(q.id) && isStr(q.text))) return false;
  return true;
}

export interface LoadResult {
  data: StoreData;
  /** "seeded" = first run; "recovered" = stored data was unreadable and a fresh demo record was created. */
  status: "loaded" | "seeded" | "recovered";
  /** When recovered: the storage key holding a copy of the unreadable data (null if the copy could not be written). */
  backupKey: string | null;
}

/**
 * Read the record. Unreadable data (broken JSON, another app's data, a newer schema version) is never thrown away
 * silently: a copy is kept under `kinwise.v1.store.unreadable-<ISO time>` before the demo record replaces it.
 */
export function loadStore(storage: StorageLike, today: ISODate, now = new Date().toISOString()): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    const data = createSeed(today);
    saveStore(storage, data);
    return { data, status: "seeded", backupKey: null };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validateStore(parsed)) {
      parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      return { data: parsed, status: "loaded", backupKey: null };
    }
  } catch {
    /* fall through to recovery */
  }
  let backupKey: string | null = `${UNREADABLE_PREFIX}${now}`;
  try {
    storage.setItem(backupKey, raw);
  } catch {
    backupKey = null; // storage full or blocked: recover anyway, but don't claim a copy exists
  }
  const data = createSeed(today);
  saveStore(storage, data);
  return { data, status: "recovered", backupKey };
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
      throw new Error(`Only ${prev.profile.displayName.trim() || "the patient"} can change these daily check-ins.`);
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
