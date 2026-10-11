// A sideways-scrolling wrapper for wide brief content (the medication table, the before/after strip on a phone).
// Only while its content is actually wider than the box does it become a keyboard-reachable, labelled region
// (WCAG 2.1.1: a scrollable area must be focusable) and show a right-edge fade that says "more this way". When the
// content fits, or on paper, it is a plain div: no extra tab stop, no hint.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../../ui";

export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ scrollable: false, atEnd: true });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const scrollable = el.scrollWidth - el.clientWidth > 1;
      const atEnd = !scrollable || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setState((s) => (s.scrollable === scrollable && s.atEnd === atEnd ? s : { scrollable, atEnd }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, []);

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
