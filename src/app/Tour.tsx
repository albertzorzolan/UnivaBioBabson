// Guided tour (SPEC-UI "Guided tour", SPEC §8): an 8-step floating card that walks a first-time visitor
// (usually a judge) through the app, switching between Margaret's and Alex's views as it goes.
//
//   startTour()            from any button ("Take the 2-minute tour")
//   #/<any route>?tour=1   from a link (Welcome uses /c/overview?tour=1); the param is removed once read
//
// This module is deliberately tiny and eagerly loaded: it holds the tour state (sessionStorage, so a
// reload mid-tour resumes) and lazily loads the overlay (TourOverlay.tsx), which needs the engines for
// its code-rendered numbers. The overlay is only fetched once a tour starts.
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { navigate, setParams, useRoute, type Route } from "./router";
import { loginAs, useSession } from "./session";

const STORAGE_KEY = "kinwise.v1.tour";
export const TOUR_STEP_COUNT = 8;

export interface TourState {
  active: boolean;
  /** 0-based step index. */
  step: number;
}

const clampStep = (n: number) => Math.min(Math.max(Math.trunc(n), 0), TOUR_STEP_COUNT - 1);

function readInitial(): TourState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<TourState>;
      if (s.active === true && typeof s.step === "number") return { active: true, step: clampStep(s.step) };
    }
  } catch {
    /* tour persistence is optional */
  }
  return { active: false, step: 0 };
}

let state: TourState = readInitial();
const listeners = new Set<() => void>();

function setTour(next: TourState) {
  state = next;
  try {
    if (next.active) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Start (or restart) the guided tour at `step` (default: the first step). */
export function startTour(step = 0): void {
  setTour({ active: true, step: clampStep(step) });
}

/** Close the tour without marking anything. */
export function stopTour(): void {
  setTour({ active: false, step: 0 });
}

/** Move to another step of a running tour. */
export function goToTourStep(step: number): void {
  if (state.active) setTour({ active: true, step: clampStep(step) });
}

/**
 * The tour after a route change. Opening the Welcome page ("/") ends a running tour and clears its saved step:
 * the visitor has left it (the logo, "Try as …" and sign-in all go through Welcome), and it must not come back
 * at a stale step over whatever page they pick next. The tour's own steps never visit "/". The one exception is
 * the "#/?tour=1" link ("Take the guided tour"), which starts the tour afresh. Pure, for tourSteps.test.ts.
 */
export function tourAfterRoute(current: TourState, path: Route, wantsTour: boolean): TourState {
  return current.active && path === "/" && !wantsTour ? { active: false, step: 0 } : current;
}

/** Apply tourAfterRoute to the running tour (TourHost calls it on every route change). */
export function syncTourWithRoute(path: Route, wantsTour: boolean): void {
  const next = tourAfterRoute(state, path, wantsTour);
  if (next !== state) setTour(next);
}

export function useTourState(): TourState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

const TourOverlay = lazy(async () => ({ default: (await import("./TourOverlay")).TourOverlay }));

/**
 * Mounted once by App: reads ?tour=1, closes the tour on sign-out or when the visitor goes back to Welcome, and
 * shows the overlay while active.
 */
export function TourHost() {
  const tour = useTourState();
  const { path, params } = useRoute();
  const role = useSession();
  const previousRole = useRef(role);
  const wantsTour = params.get("tour") === "1";

  // Leaving through Welcome ends the tour (Skip and Esc end it from the card itself).
  useEffect(() => syncTourWithRoute(path, wantsTour), [path, wantsTour]);

  useEffect(() => {
    if (!wantsTour) return;
    setParams({ tour: undefined }, { replace: true });
    startTour(0);
    // The first step is the caregiver overview; a signed-out "#/?tour=1" link signs the demo in first.
    loginAs("caregiver");
    navigate("/c/overview");
  }, [wantsTour]);

  // Signing out ends the tour (the overlay would otherwise sign the demo back in on the next step).
  useEffect(() => {
    if (previousRole.current && !role && state.active) stopTour();
    previousRole.current = role;
  }, [role]);

  if (!tour.active || path === "/") return null;
  return (
    <Suspense fallback={null}>
      <TourOverlay step={tour.step} />
    </Suspense>
  );
}
