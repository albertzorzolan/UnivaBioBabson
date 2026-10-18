// A sideways-scrolling wrapper for wide brief content (the medication table, the before/after strip on a phone).
// Only while its content is actually wider than the box does it become a keyboard-reachable, labelled region
// (WCAG 2.1.1: a scrollable area must be focusable) and show a right-edge fade that says "more this way". When the
// content fits, or on paper, it is a plain div: no extra tab stop, no hint.
//
// startAtEnd: open scrolled to the right end (the before/after strip opens on its "after" days and counts). It is
// applied after mount and again whenever the box is resized, until the person scrolls the region themselves.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../../ui";

/** Events that mean the person moved the region by hand; after one, startAtEnd stops re-pinning. */
const MANUAL_SCROLL_EVENTS = ["pointerdown", "wheel", "touchstart", "keydown"] as const;

export function ScrollRegion({
  label,
  className,
  startAtEnd = false,
  children,
}: {
  label: string;
  className?: string;
  startAtEnd?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ scrollable: false, atEnd: true });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let touched = false;
    const touch = () => {
      touched = true;
    };
    const measure = () => {
      const scrollable = el.scrollWidth - el.clientWidth > 1;
      const atEnd = !scrollable || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setState((s) => (s.scrollable === scrollable && s.atEnd === atEnd ? s : { scrollable, atEnd }));
    };
    // Pin to the right end first (scrollLeft is clamped to the maximum), then measure the new position.
    const update = () => {
      if (startAtEnd && !touched) el.scrollLeft = el.scrollWidth;
      measure();
    };
    update();
    el.addEventListener("scroll", measure, { passive: true });
    for (const t of MANUAL_SCROLL_EVENTS) el.addEventListener(t, touch, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      for (const t of MANUAL_SCROLL_EVENTS) el.removeEventListener(t, touch);
      ro?.disconnect();
    };
  }, [startAtEnd]);

  return (
    <div className={cx("cg-vb-scroll", state.scrollable && "is-scrollable", state.scrollable && !state.atEnd && "has-more")}>
      <div
        ref={ref}
        className={cx("cg-vb-scroll__box", className)}
        {...(state.scrollable ? { tabIndex: 0, role: "region", "aria-label": label } : {})}
      >
        {children}
      </div>
    </div>
  );
}
