// Hash router (SPEC §10). Hash URLs work on any static host (GitHub Pages) with no server rewrites,
// give every screen a shareable deep link, and make the browser Back button move between screens.
//
//   #/c/overview?tour=1   →   { path: "/c/overview", params: URLSearchParams("tour=1") }
//
// Navigation side-effects (scroll to top, focus the page heading, document.title) live in
// useNavigationEffects(), called once by <App/>.
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Role } from "../model/types";

export type Route =
  | "/"
  | "/how-it-works"
  | "/p/today"
  | "/p/week"
  | "/p/meds"
  | "/c/overview"
  | "/c/meds"
  | "/c/review"
  | "/c/timeline"
  | "/c/ask"
  | "/c/brief"
  | "/c/settings"
  | "/dev/ui";

export interface RouteInfo {
  /** Short page name used in document.title ("Overview · Kinwise"). */
  title: string;
  /** Role required to view the route; null = public. */
  role: Role | null;
}

export const ROUTES: Record<Route, RouteInfo> = {
  "/": { title: "Welcome", role: null },
  "/how-it-works": { title: "How Kinwise works", role: null },
  "/p/today": { title: "Today", role: "patient" },
  "/p/week": { title: "My week", role: "patient" },
  "/p/meds": { title: "My medicines", role: "patient" },
  "/c/overview": { title: "Overview", role: "caregiver" },
  "/c/meds": { title: "Medications", role: "caregiver" },
  "/c/review": { title: "Medication review", role: "caregiver" },
  "/c/timeline": { title: "Symptoms & timeline", role: "caregiver" },
  "/c/ask": { title: "Ask Kinwise", role: "caregiver" },
  "/c/brief": { title: "Visit brief", role: "caregiver" },
  "/c/settings": { title: "Settings", role: "caregiver" },
  "/dev/ui": { title: "Design system", role: null },
};

export const APP_NAME = "Kinwise";

export function isRoute(x: string): x is Route {
  return Object.prototype.hasOwnProperty.call(ROUTES, x);
}

export interface ParsedHash {
  path: Route;
  params: URLSearchParams;
  /** False when the hash named an unknown path (it was mapped to "/"). */
  known: boolean;
}

/** Parse "#/c/overview?tour=1" (or "" / "#") into a route + params. Pure; unknown paths map to "/". */
export function parseHash(hash: string): ParsedHash {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "" || raw === "/") return { path: "/", params: new URLSearchParams(), known: true };
  const q = raw.indexOf("?");
  let pathPart = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? "" : raw.slice(q + 1);
  if (!pathPart.startsWith("/")) pathPart = `/${pathPart}`;
  if (pathPart.length > 1 && pathPart.endsWith("/")) pathPart = pathPart.slice(0, -1);
  const known = isRoute(pathPart);
  return { path: known ? (pathPart as Route) : "/", params: new URLSearchParams(query), known };
}

/** Build "#/path?query" from a route and optional params (empty values are dropped). */
export function buildHash(path: Route, params?: Record<string, string | undefined> | URLSearchParams): string {
  const search = new URLSearchParams();
  if (params instanceof URLSearchParams) params.forEach((v, k) => search.set(k, v));
  else if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, v);
  const qs = search.toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}

/** Same as buildHash; reads better in JSX: <a href={href("/c/brief")}>. */
export const href = buildHash;

/** Role that may view `path` (null = public). */
export function routeRole(path: Route): Role | null {
  return ROUTES[path].role;
}

/** Landing page for each role. */
export function homeFor(role: Role): Route {
  return role === "patient" ? "/p/today" : "/c/overview";
}

/**
 * Role guard. Returns the route to redirect to, or null when `role` may view `path`.
 * Patient routes need a patient session, caregiver routes a caregiver session; anything else goes to "/".
 */
export function guardRoute(path: Route, role: Role | null): Route | null {
  const needed = routeRole(path);
  if (needed === null || needed === role) return null;
  return "/";
}

/** Page title for document.title. */
export function documentTitle(path: Route): string {
  return path === "/" ? `${APP_NAME} — family medicine-review co-pilot` : `${ROUTES[path].title} · ${APP_NAME}`;
}

// ---------------------------------------------------------------------------
// Browser binding

const listeners = new Set<() => void>();
let listening = false;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("hashchange", emit);
    window.addEventListener("popstate", emit);
    listening = true;
  }
  return () => {
    listeners.delete(cb);
  };
}

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

/** Current route + query params; re-renders on navigation (including Back/Forward). */
export function useRoute(): { path: Route; params: URLSearchParams } {
  const hash = useSyncExternalStore(subscribe, currentHash, () => "");
  return useMemo(() => {
    const { path, params } = parseHash(hash);
    return { path, params };
  }, [hash]);
}

/**
 * Go to `path`. Pushes a history entry (Back returns here) unless `replace` is set
 * (used for redirects so Back doesn't bounce into a guard loop).
 */
export function navigate(path: Route, params?: Record<string, string | undefined>, opts?: { replace?: boolean }): void {
  const next = buildHash(path, params);
  if (next === window.location.hash || (next === "#/" && window.location.hash === "")) return;
  if (opts?.replace) {
    const url = `${window.location.pathname}${window.location.search}${next}`;
    window.history.replaceState(window.history.state, "", url);
    emit();
  } else {
    window.location.hash = next;
  }
}

/** Update query params on the current route without a new history entry (filters, selected tab). */
export function setParams(params: Record<string, string | undefined>, opts?: { replace?: boolean }): void {
  const { path, params: current } = parseHash(currentHash());
  const merged: Record<string, string | undefined> = {};
  current.forEach((v, k) => (merged[k] = v));
  Object.assign(merged, params);
  navigate(path, merged, { replace: opts?.replace ?? true });
}

/** Move keyboard focus to the page's main heading (or <main>) once it has rendered. */
export function focusMainHeading(maxFrames = 90): () => void {
  let frame = 0;
  let id = 0;
  const tick = () => {
    const main = document.getElementById("main-content");
    const target =
      main?.querySelector<HTMLElement>("[data-route-focus]") ?? main?.querySelector<HTMLElement>("h1") ?? null;
    if (target) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      return;
    }
    // Lazy-loaded views render a frame or two later; fall back to <main> if no heading ever appears.
    if (++frame < maxFrames) id = requestAnimationFrame(tick);
    else main?.focus({ preventScroll: true });
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

/**
 * On every route change (not on first load, not on param-only changes): scroll to the top, move focus to
 * the new page's <h1> so screen readers announce it, and update document.title.
 */
export function useNavigationEffects(path: Route): void {
  const previous = useRef<Route | null>(null);
  useEffect(() => {
    document.title = documentTitle(path);
    const first = previous.current === null;
    const changed = previous.current !== path;
    previous.current = path;
    if (first || !changed) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    return focusMainHeading();
  }, [path]);
}
