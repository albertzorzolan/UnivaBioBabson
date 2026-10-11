// Segmented choice: big touch options with radio-group semantics (one answer per question).
// Built for the patient check-in: 48px+ targets ("lg" = tap cards with icon + words), arrow-key navigation,
// and no option pre-selected — an unanswered question is null, never "Not sure".
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "../cx";

export interface SegmentedOption<T> {
  value: T;
  label: ReactNode;
  /** Secondary line, e.g. "Very tired" under "1". */
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T> {
  /** The question, rendered as the group's visible label. */
  label: ReactNode;
  hint?: ReactNode;
  value: T | null;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** "md" = 48px pills (caregiver), "lg" = 56px+ tap cards (patient). */
  size?: "md" | "lg";
  /** Fixed number of columns for "lg" cards (defaults to an even auto-fit). */
  columns?: number;
  /** Visually hide the label. */
  hideLabel?: boolean;
  className?: string;
  /** Label level: render the label as a heading element (e.g. "h3") inside forms with many questions. */
  labelAs?: "p" | "h2" | "h3" | "h4";
}

/** Single-choice group with role="radiogroup"; Left/Right/Up/Down move and select, Home/End jump. */
export function Segmented<T extends string | number | boolean>({
  label,
  hint,
  value,
  onChange,
  options,
  size = "md",
  columns,
  hideLabel,
  className,
  labelAs: LabelTag = "p",
}: SegmentedProps<T>) {
  const base = useId();
  const labelId = `${base}-label`;
  const hintId = hint ? `${base}-hint` : undefined;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = options.findIndex((o) => o.value === value);
  // Roving tabindex: the selected option, else the first enabled option, is the single tab stop.
  const tabStop = selectedIndex >= 0 ? selectedIndex : (enabled[0] ?? 0);

  const move = (from: number, delta: number) => {
    const pos = enabled.indexOf(from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    refs.current[next]?.focus();
    onChange(options[next].value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(index, -1);
        break;
      case "Home":
        e.preventDefault();
        move(enabled[0], 0);
        break;
      case "End":
        e.preventDefault();
        move(enabled[enabled.length - 1], 0);
        break;
    }
  };

  return (
    <div className={cx("ui-seg", `ui-seg--${size}`, className)}>
      <LabelTag id={labelId} className={cx("ui-seg__label", hideLabel && "ui-visually-hidden")}>
        {label}
      </LabelTag>
      {hint && (
        <p id={hintId} className="ui-seg__hint">
          {hint}
        </p>
      )}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="ui-seg__options"
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((o, i) => {
          const checked = o.value === value;
          return (
            <button
              key={String(o.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={o.disabled}
              tabIndex={i === tabStop ? 0 : -1}
              className={cx("ui-seg__option", checked && "is-checked")}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {o.icon && (
                <span className="ui-seg__icon" aria-hidden="true">
                  {o.icon}
                </span>
              )}
              <span className="ui-seg__text">
                <span className="ui-seg__option-label">{o.label}</span>
                {o.description && <span className="ui-seg__description">{o.description}</span>}
              </span>
              <span className="ui-seg__check" aria-hidden="true">
                <Check size={size === "lg" ? 18 : 14} strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
