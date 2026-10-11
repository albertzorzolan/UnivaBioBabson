// Stat tile and Meter: numbers with their denominators, labelled so meaning never depends on colour.
import { useId, type ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cx } from "../cx";
import { EvidenceLink } from "./Evidence";
import type { Tone } from "./Badge";

export interface StatProps {
  label: ReactNode;
  /** The headline number (pre-formatted string or number). */
  value: ReactNode;
  /** Unit / denominator after the number, e.g. "of 14 answered days". */
  unit?: ReactNode;
  /** One supporting sentence, e.g. "since lorazepam started on Sep 24". */
  detail?: ReactNode;
  icon?: ReactNode;
  /** Optional change indicator. `tone` colours the arrow; the text must say what changed. */
  trend?: { direction: "up" | "down" | "same"; text: string; tone?: Tone };
  /** Shows a "Show the records" action under the number. */
  onShowRecords?: () => void;
  recordCount?: number;
  tone?: "default" | "tint";
  className?: string;
}

/** Big number + label + denominator + optional trend and evidence action. */
export function Stat({ label, value, unit, detail, icon, trend, onShowRecords, recordCount, tone = "default", className }: StatProps) {
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : trend?.direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <div className={cx("ui-stat", tone === "tint" && "ui-stat--tint", className)}>
      <div className="ui-stat__top">
        <p className="ui-stat__label">{label}</p>
        {icon && (
          <span className="ui-stat__icon" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <p className="ui-stat__figure">
        <span className="ui-stat__value ui-num">{value}</span>
        {unit && <span className="ui-stat__unit">{unit}</span>}
      </p>
      {trend && (
        <p className={cx("ui-stat__trend", trend.tone && `ui-stat__trend--${trend.tone}`)}>
          <TrendIcon size={16} aria-hidden="true" />
          <span>{trend.text}</span>
        </p>
      )}
      {detail && <p className="ui-stat__detail">{detail}</p>}
      {onShowRecords && <EvidenceLink className="ui-stat__evidence" count={recordCount} onClick={onShowRecords} />}
    </div>
  );
}

export interface MeterBand {
  /** Inclusive upper bound of the band (the last band may use Infinity). */
  upTo: number;
  label: string;
  tone: Tone;
}

export interface MeterProps {
  label: ReactNode;
  value: number;
  min?: number;
  /** Visual maximum of the track; values above it are clamped visually but reported exactly. */
  max: number;
  bands: MeterBand[];
  /** Text for assistive tech and the visible readout. Defaults to "6 of 9 · High". */
  valueText?: string;
  /** Short explanation under the bar, e.g. how the score is computed. */
  description?: ReactNode;
  className?: string;
}

/** Find the band a value falls into. */
export function bandFor(value: number, bands: MeterBand[]): MeterBand {
  return bands.find((b) => value <= b.upTo) ?? bands[bands.length - 1];
}

/**
 * ACB total ranges for the meter. The published ACB scale names no "low/high" bands, only a review threshold
 * (a total of 3 or more), so the segments are labelled with the numbers themselves; tones only shade the track.
 */
export const ACB_BANDS: MeterBand[] = [
  { upTo: 0, label: "0", tone: "success" },
  { upTo: 2, label: "1–2", tone: "info" },
  { upTo: 4, label: "3–4", tone: "caution" },
  { upTo: Infinity, label: "5+", tone: "attention" },
];

/** Caption to show under an ACB meter: the one cut-off the published scale gives. */
export const ACB_THRESHOLD_NOTE = "Published review threshold: a total of 3 or more (ACB scale).";

/**
 * Labelled, banded meter (ARIA role="meter"). The band name is printed next to the number and each band is
 * labelled under the track, so the reading never depends on colour.
 */
export function Meter({ label, value, min = 0, max, bands, valueText, description, className }: MeterProps) {
  const labelId = useId();
  const band = bandFor(value, bands);
  const clamped = Math.min(Math.max(value, min), max);
  // Integer scales are drawn as cells (0…max); the marker sits in the middle of the value's cell.
  const pct = ((clamped - min + 0.5) / (max - min + 1)) * 100;
  const text = valueText ?? `${value} of ${max} · ${band.label}`;
  // Segment widths: each band spans from the previous upper bound to its own (clamped to the track).
  let prev = min - 1;
  const segments = bands.map((b) => {
    const from = prev + 1;
    const to = Math.min(b.upTo, max);
    prev = b.upTo;
    return { ...b, from, to, width: Math.max(0, ((to - from + 1) / (max - min + 1)) * 100) };
  });
  return (
    <div className={cx("ui-meter", className)}>
      <div className="ui-meter__head">
        <span className="ui-meter__label" id={labelId}>
          {label}
        </span>
        <span className="ui-meter__readout">
          <span className="ui-meter__value ui-num">{value}</span>
          <span className={cx("ui-meter__band", `ui-meter__band--${band.tone}`)}>{band.label}</span>
        </span>
      </div>
      <div
        className="ui-meter__track"
        role="meter"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={text}
        aria-labelledby={labelId}
      >
        {segments.map((s) => (
          <span
            key={s.label}
            className={cx("ui-meter__segment", `ui-meter__segment--${s.tone}`, s.label === band.label && "is-current")}
            style={{ flexBasis: `${s.width}%` }}
          />
        ))}
        <span className="ui-meter__marker" style={{ left: `${pct}%` }} aria-hidden="true" />
      </div>
      <div className="ui-meter__scale" aria-hidden="true">
        {segments.map((s) => {
          const range = s.from === s.to ? String(s.from) : s.upTo === Infinity ? `${s.from}+` : `${s.from}–${s.to}`;
          return (
            <span key={s.label} style={{ flexBasis: `${s.width}%` }} className={cx(s.label === band.label && "is-current")}>
              {s.label}
              {/* Bands already labelled with their numbers (ACB: "0", "1–2", …) don't repeat them. */}
              {range !== s.label && <span className="ui-meter__range ui-num">{range}</span>}
            </span>
          );
        })}
      </div>
      {description && <p className="ui-meter__description">{description}</p>}
    </div>
  );
}

export interface ProgressBarProps {
  label: ReactNode;
  /** 0–1, or null for indeterminate. */
  value: number | null;
  detail?: ReactNode;
  className?: string;
}

/** Determinate/indeterminate progress (role="progressbar"), e.g. the on-device model download. */
export function ProgressBar({ label, value, detail, className }: ProgressBarProps) {
  const labelId = useId();
  const pct = value == null ? null : Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className={cx("ui-progress", className)}>
      <div className="ui-progress__head">
        <span id={labelId}>{label}</span>
        {pct != null && <span className="ui-num">{pct}%</span>}
      </div>
      <div
        className={cx("ui-progress__track", pct == null && "is-indeterminate")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-labelledby={labelId}
      >
        <span className="ui-progress__fill" style={pct == null ? undefined : { width: `${pct}%` }} />
      </div>
      {detail && <p className="ui-progress__detail">{detail}</p>}
    </div>
  );
}
