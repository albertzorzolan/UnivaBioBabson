// Medicine-name field with autocomplete over the KB (generics, brands, combination products).
// ARIA 1.2 combobox pattern: the input keeps focus, options are referenced with aria-activedescendant,
// ↑/↓ move, Enter picks, Esc closes the list (without closing the surrounding drawer), Tab leaves.
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { CircleAlert, Search } from "lucide-react";
import { searchDrugs, type DrugSearchHit } from "../../../kb";
import { cx } from "../../../ui";

const KIND_LABEL: Record<DrugSearchHit["kind"], string> = {
  drug: "Generic",
  brand: "Brand",
  combo: "Combination",
};

export interface DrugComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user picks a suggestion (after onChange with its label). */
  onPick?: (hit: DrugSearchHit) => void;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Rendered between the input and the error (the live match indicator). */
  status?: ReactNode;
  autoFocus?: boolean;
}

/** Safe search: a KB change must never break typing. */
function safeSearch(q: string): DrugSearchHit[] {
  try {
    return q.trim().length >= 2 ? searchDrugs(q, 8) : [];
  } catch {
    return [];
  }
}

export function DrugCombobox({ value, onChange, onPick, label, hint, error, status, autoFocus }: DrugComboboxProps) {
  const base = useId();
  const inputId = `${base}-input`;
  const listId = `${base}-list`;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const hits = useMemo(() => safeSearch(value), [value]);
  // Hide the list when the only suggestion is exactly what's typed (nothing left to choose).
  const redundant = hits.length === 1 && hits[0].label.toLowerCase() === value.trim().toLowerCase();
  const expanded = open && hits.length > 0 && !redundant;
  // The value already names a known medicine (e.g. the Edit drawer opening on a saved med).
  const exact = hits.some((h) => h.label.toLowerCase() === value.trim().toLowerCase());
  const optionId = (i: number) => `${base}-opt-${i}`;

  const pick = (hit: DrugSearchHit) => {
    onChange(hit.label);
    onPick?.(hit);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!expanded) {
          setOpen(true);
          setActive(0);
        } else setActive((i) => (i + 1) % hits.length);
        break;
      case "ArrowUp":
        if (!expanded) return;
        e.preventDefault();
        setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
        break;
      case "Enter":
        if (expanded && active >= 0 && hits[active]) {
          e.preventDefault();
          pick(hits[active]);
        }
        break;
      case "Escape":
        if (expanded) {
          // Close the list only; keep the drawer open.
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          setActive(-1);
        }
        break;
      case "Home":
      case "End":
        setActive(-1);
        break;
    }
  };

  return (
    <div className={cx("ui-field", "cg-combo", Boolean(error) && "ui-field--invalid")}>
      <label htmlFor={inputId} className="ui-field__label">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      <div className="cg-combo__control">
        <Search className="cg-combo__icon" size={18} aria-hidden="true" />
        <input
          id={inputId}
          className="ui-input cg-combo__input"
          type="text"
          role="combobox"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={120}
          placeholder="e.g. Ativan, lorazepam, Tylenol PM"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          // Don't pop the list over Dose / How often when the name is already a known medicine.
          onFocus={() => setOpen(!exact)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="cg-combo__list"
          // Not a Tab stop: focus stays on the input (aria-activedescendant); Tab leaves the field.
          tabIndex={-1}
          hidden={!expanded}
        >
          {expanded &&
            hits.map((hit, i) => (
              <li
                key={`${hit.kind}-${hit.label}-${hit.ingredientIds.join("+")}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={cx("cg-combo__option", i === active && "is-active")}
                // mousedown (not click) so the input keeps focus and blur doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(hit);
                }}
                onMouseMove={() => setActive(i)}
              >
                <span className="cg-combo__option-main">
                  <span className="cg-combo__option-label">{hit.label}</span>
                  <span className="cg-combo__option-detail">{hit.detail}</span>
                </span>
                <span className={cx("cg-combo__kind", `cg-combo__kind--${hit.kind}`)}>{KIND_LABEL[hit.kind]}</span>
              </li>
            ))}
        </ul>
      </div>
      <p className="ui-visually-hidden" aria-live="polite">
        {expanded ? `${hits.length} suggestion${hits.length === 1 ? "" : "s"}. Use the up and down arrows to choose.` : ""}
      </p>
      {status}
      {error && (
        <p id={errorId} className="ui-field__error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
