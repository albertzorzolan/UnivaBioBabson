// The words Margaret has typed but not saved yet, kept in sessionStorage (one draft per day) so a refresh or an
// accidental reload doesn't lose them. Session-only on purpose: the draft disappears when the tab is closed, and it
// is cleared as soon as the check-in is saved. Every storage call is guarded, so a blocked storage just means no draft.
import type { ISODate } from "../../model/types";
import { removeKeysWithPrefix, type ListableStorage, type StorageLike } from "../../model/store";

export const DRAFT_PREFIX = "kinwise.v1.storyDraft.";

/** sessionStorage when the browser allows it, otherwise null (private mode, sandboxed previews, tests). */
function sessionStore(): ListableStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStoryDraft(date: ISODate, storage: StorageLike | null = sessionStore()): string | null {
  try {
    return storage?.getItem(DRAFT_PREFIX + date) ?? null;
  } catch {
    return null;
  }
}

/** Save the draft; blank text removes it. */
export function writeStoryDraft(date: ISODate, text: string, storage: StorageLike | null = sessionStore()): void {
  try {
    if (text.trim()) storage?.setItem(DRAFT_PREFIX + date, text);
    else storage?.removeItem(DRAFT_PREFIX + date);
  } catch {
    /* the draft is a convenience; losing it is acceptable */
  }
}

export function clearStoryDraft(date: ISODate, storage: StorageLike | null = sessionStore()): void {
  try {
    storage?.removeItem(DRAFT_PREFIX + date);
  } catch {
    /* nothing to clear */
  }
}

/** Remove the unsaved drafts of every day ("Delete everything" in Settings). */
export function clearAllStoryDrafts(storage: ListableStorage | null = sessionStore()): void {
  if (storage) removeKeysWithPrefix(storage, DRAFT_PREFIX);
}
