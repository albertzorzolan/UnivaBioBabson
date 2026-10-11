// Timeline/chart helpers: one colour + one shape per diary metric, a legend, and dot markers.
// Shapes give a second, non-colour channel (WCAG 1.4.1) for charts and the day-grid.
import type { CSSProperties, ReactNode } from "react";
import type { MetricKey } from "../../model/types";
import { cx } from "../cx";

export type MarkerShape = "circle" | "ring" | "square" | "diamond" | "triangle" | "bar" | "line" | "dash";

/** CSS custom property per metric (defined in tokens.css for both themes). */
export const SERIES_VAR: Record<MetricKey, string> = {
  dizziness: "var(--series-dizziness)",
  nearFall: "var(--series-nearFall)",
  fall: "var(--series-fall)",
  drowsiness: "var(--series-drowsiness)",
  confusion: "var(--series-confusion)",
  swelling: "var(--series-swelling)",
  energy: "var(--series-energy)",
  sleep: "var(--series-sleep)",
  appetiteWorse: "var(--series-appetiteWorse)",
};

/** Default marker shape per metric so a symptom is recognisable without colour. */
export const SERIES_SHAPE: Record<MetricKey, MarkerShape> = {
  dizziness: "circle",
  nearFall: "triangle",
  fall: "diamond",
  drowsiness: "square",
  confusion: "ring",
  swelling: "bar",
  energy: "line",
  sleep: "dash",
  appetiteWorse: "square",
};

/**
 * Resolve a CSS custom property to a literal colour (for libraries that can't take var(), e.g. canvas).
 * Reads from `el` (default <html>) so the current theme is respected. Returns `fallback` outside the browser.
 */
export function readToken(name: string, el?: Element | null, fallback = "#5e6a64"): string {
  if (typeof window === "undefined") return fallback;
  const target = el ?? document.documentElement;
  const v = getComputedStyle(target).getPropertyValue(name.startsWith("--") ? name : `--${name}`).trim();
  return v || fallback;
}

export interface TimelineDotProps {
  /** Metric whose colour/shape to use, or an explicit colour. */
  metric?: MetricKey;
  color?: string;
  shape?: MarkerShape;
  size?: number;
  /** Visible label next to the dot; if omitted the dot is decorative. */
  label?: ReactNode;
  className?: string;
}

/** A small coloured shape (legend swatch, day-grid cell marker, list bullet). */
export function TimelineDot({ metric, color, shape, size = 12, label, className }: TimelineDotProps) {
  const fill = color ?? (metric ? SERIES_VAR[metric] : "var(--ink-muted)");
  const s = shape ?? (metric ? SERIES_SHAPE[metric] : "circle");
  const style = { "--dot-color": fill, "--dot-size": `${size}px` } as CSSProperties;
  const dot = <span className={cx("ui-dot", `ui-dot--${s}`, !label && className)} style={style} aria-hidden="true" />;
  if (!label) return dot;
  return (
    <span className={cx("ui-dot-label", className)}>
      {dot}
      <span>{label}</span>
    </span>
  );
}

export interface LegendItem {
  label: ReactNode;
  metric?: MetricKey;
  color?: string;
  shape?: MarkerShape;
}

/** Horizontal legend for charts and the day grid. Always shown for 2+ series. */
export function TimelineLegend({ items, className, label = "Legend" }: { items: LegendItem[]; className?: string; label?: string }) {
  return (
    <ul className={cx("ui-legend", className)} aria-label={label} role="list">
      {items.map((it, i) => (
        <li key={i}>
          <TimelineDot metric={it.metric} color={it.color} shape={it.shape} label={it.label} />
        </li>
      ))}
    </ul>
  );
}

/** Vertical marker label for a medication start/stop on a chart or strip ("Lorazepam started · Sep 24"). */
export function MedEventMarker({ label, kind = "started", className }: { label: ReactNode; kind?: "started" | "stopped"; className?: string }) {
  return (
    <span className={cx("ui-med-marker", `ui-med-marker--${kind}`, className)}>
      <span className="ui-med-marker__line" aria-hidden="true" />
      <span className="ui-med-marker__label">{label}</span>
    </span>
  );
}
