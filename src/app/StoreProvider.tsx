// React binding for the local record: one provider, one hook. Derived engine results live in useDerived.ts.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ISODate, StoreData } from "../model/types";
import { localDate } from "../model/dates";
import { commitStore, loadStore, saveStore, STORAGE_KEY, type Actor } from "../model/store";
import { createSeed } from "../model/seed";

export type UpdateResult = { ok: true } | { ok: false; error: string };

interface StoreApi {
  data: StoreData;
  today: ISODate;
  loadStatus: "loaded" | "seeded" | "recovered";
  /** Apply a change as `actor`. The updater must return a new object (no mutation). */
  update: (actor: Actor, updater: (prev: StoreData) => StoreData) => UpdateResult;
  resetDemo: () => void;
  replaceAll: (data: StoreData) => UpdateResult;
}

const StoreContext = createContext<StoreApi | null>(null);

function safeStorage(): Storage | null {
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
const memoryStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

export function StoreProvider({ children, today: todayOverride }: { children: ReactNode; today?: ISODate }) {
  const today = todayOverride ?? localDate();
  const storage = useMemo(() => safeStorage() ?? memoryStorage, []);
  const [state, setState] = useState(() => loadStore(storage, today));

  // Keep tabs in sync: another tab's commit replaces ours.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      setState(loadStore(storage, today));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storage, today]);

  const update = useCallback<StoreApi["update"]>(
    (actor, updater) => {
      try {
        const next = commitStore(state.data, updater(state.data), actor);
        saveStore(storage, next);
        setState({ data: next, status: state.status });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "The change could not be saved." };
      }
    },
    [state, storage],
  );

  const resetDemo = useCallback(() => {
    const data = createSeed(today);
    saveStore(storage, data);
    setState({ data, status: "seeded" });
  }, [storage, today]);

  const replaceAll = useCallback<StoreApi["replaceAll"]>(
    (data) => {
      try {
        const next = commitStore(state.data, data, "system");
        saveStore(storage, next);
        setState({ data: next, status: "loaded" });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "That file could not be imported." };
      }
    },
    [state, storage],
  );

  const api = useMemo<StoreApi>(
    () => ({ data: state.data, today, loadStatus: state.status, update, resetDemo, replaceAll }),
    [state, today, update, resetDemo, replaceAll],
  );
  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
