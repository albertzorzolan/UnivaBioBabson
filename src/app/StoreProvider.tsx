// React binding for the local record: one provider, one hook. Derived engine results live in useDerived.ts.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ISODate, StoreData } from "../model/types";
import { localDate } from "../model/dates";
import {
  commitStore,
  emptyRecord,
  loadStore,
  removeUnreadableCopies,
  saveStore,
  STORAGE_KEY,
  type Actor,
  type ListableStorage,
} from "../model/store";
import { refreshDemo } from "../model/seed";

export type UpdateResult = { ok: true } | { ok: false; error: string };

interface StoreApi {
  data: StoreData;
  today: ISODate;
  loadStatus: "loaded" | "seeded" | "recovered";
  /**
   * Set while the "saved data couldn't be read" notice should show (loadStatus "recovered", not dismissed yet).
   * backupKey names the localStorage key holding the unreadable copy, or null if no copy could be written.
   */
  recovery: { backupKey: string | null } | null;
  dismissRecovery: () => void;
  /** Raw text stored under `key` (used to download the unreadable copy), or null. */
  readStored: (key: string) => string | null;
  /**
   * Set while the "Demo dates are from …" notice should show: the saved demo record was built for an earlier day
   * and has been changed since, so loadStore kept it rather than rebuild it (LoadResult.staleDemo). Null otherwise,
   * or once dismissed or refreshed.
   */
  staleDemo: { builtFor: ISODate } | null;
  dismissStaleDemo: () => void;
  /** Apply a change as `actor`. The updater must return a new object (no mutation). */
  update: (actor: Actor, updater: (prev: StoreData) => StoreData) => UpdateResult;
  /** Back to the demo record for today (Settings › Restore, and "Refresh demo dates"). Display settings are kept. */
  resetDemo: () => void;
  replaceAll: (data: StoreData) => UpdateResult;
  /**
   * "Delete everything": an empty record replaces this one, and the copies of unreadable data that loadStore kept
   * in localStorage are removed too. (Unsaved story drafts live in sessionStorage; Settings clears those.)
   */
  deleteEverything: () => UpdateResult;
}

const StoreContext = createContext<StoreApi | null>(null);

function safeStorage(): ListableStorage | null {
  try {
    const t = "__mw_probe__";
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** In-memory fallback when localStorage is blocked (private mode, sandboxed previews). */
const memory = new Map<string, string>();
const memoryStorage: ListableStorage = {
  get length() {
    return memory.size;
  },
  key: (i: number) => [...memory.keys()][i] ?? null,
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

export function StoreProvider({ children, today: todayOverride }: { children: ReactNode; today?: ISODate }) {
  const today = todayOverride ?? localDate();
  const storage = useMemo(() => safeStorage() ?? memoryStorage, []);
  const [state, setState] = useState(() => loadStore(storage, today));
  const [recoveryOpen, setRecoveryOpen] = useState(() => state.status === "recovered");
  const [staleOpen, setStaleOpen] = useState(true);

  // Keep tabs in sync: another tab's commit replaces ours.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const next = loadStore(storage, today);
      setState(next);
      if (next.status === "recovered") setRecoveryOpen(true);
      setStaleOpen(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storage, today]);

  const update = useCallback<StoreApi["update"]>(
    (actor, updater) => {
      try {
        const next = commitStore(state.data, updater(state.data), actor);
        saveStore(storage, next);
        setState({ ...state, data: next });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "The change could not be saved." };
      }
    },
    [state, storage],
  );

  const resetDemo = useCallback(() => {
    const data = refreshDemo(state.data, today);
    saveStore(storage, data);
    setState({ data, status: "seeded", backupKey: null, staleDemo: null });
    setRecoveryOpen(false);
  }, [state.data, storage, today]);

  const replaceAll = useCallback<StoreApi["replaceAll"]>(
    (data) => {
      try {
        const next = commitStore(state.data, data, "system");
        saveStore(storage, next);
        setState({ data: next, status: "loaded", backupKey: null, staleDemo: null });
        setRecoveryOpen(false);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "That file could not be imported." };
      }
    },
    [state, storage],
  );

  const deleteEverything = useCallback<StoreApi["deleteEverything"]>(() => {
    const result = replaceAll(emptyRecord(state.data, new Date().toISOString()));
    if (result.ok) removeUnreadableCopies(storage);
    return result;
  }, [replaceAll, state.data, storage]);

  const dismissRecovery = useCallback(() => setRecoveryOpen(false), []);
  const dismissStaleDemo = useCallback(() => setStaleOpen(false), []);
  const staleDemo = useMemo(
    () => (staleOpen && state.staleDemo ? { builtFor: state.staleDemo } : null),
    [staleOpen, state.staleDemo],
  );
  const readStored = useCallback<StoreApi["readStored"]>(
    (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    [storage],
  );
  const recovery = useMemo(
    () => (recoveryOpen && state.status === "recovered" ? { backupKey: state.backupKey } : null),
    [recoveryOpen, state.status, state.backupKey],
  );

  const api = useMemo<StoreApi>(
    () => ({
      data: state.data,
      today,
      loadStatus: state.status,
      recovery,
      dismissRecovery,
      readStored,
      staleDemo,
      dismissStaleDemo,
      update,
      resetDemo,
      replaceAll,
      deleteEverything,
    }),
    [state, today, recovery, dismissRecovery, readStored, staleDemo, dismissStaleDemo, update, resetDemo, replaceAll, deleteEverything],
  );
  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
