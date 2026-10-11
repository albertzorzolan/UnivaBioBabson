// Small DOM hooks shared by the components (focus management, media queries).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** All keyboard-focusable, visible descendants of `root`, in DOM order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0 && el.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Keep Tab / Shift+Tab inside `ref` while `active`. Native <dialog>.showModal() already makes the page inert;
 * this additionally wraps focus at the edges instead of escaping to the browser chrome.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusableIn(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [ref, active]);
}

/**
 * Remember the element that had focus when `active` became true and give focus back to it when `active`
 * turns false (or the component unmounts). Used by Modal and Drawer.
 */
export function useReturnFocus(active: boolean): void {
  const previous = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!active) return;
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const el = previous.current;
      if (el && el.isConnected) {
        // Defer so the dialog has closed and the page is no longer inert.
        requestAnimationFrame(() => el.focus({ preventScroll: true }));
      }
    };
  }, [active]);
}

/** Subscribe to a CSS media query. Returns false during the first render on the server/tests. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" && "matchMedia" in window ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Call `handler` when Escape is pressed anywhere while `active`. */
export function useEscape(active: boolean, handler: () => void): void {
  const saved = useRef(handler);
  useLayoutEffect(() => {
    saved.current = handler;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") saved.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}
