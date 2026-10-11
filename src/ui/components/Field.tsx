// Form fields. Every control has a visible label; hints and errors are wired with aria-describedby,
// and errors are announced (role="alert") and also marked with an icon + words.
import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { cx } from "../cx";

export interface FieldIds {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Show "Optional" after the label (preferred over marking required fields with *). */
  optional?: boolean;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  /** Use a fixed id for the control (otherwise generated). */
  id?: string;
  className?: string;
  /** Render the control with the generated ids. */
  children: (ids: FieldIds) => ReactNode;
}

/** Label + hint + error wrapper for any control; use it for custom inputs. */
export function Field({ label, hint, error, optional, hideLabel, id, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f${auto}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("ui-field", Boolean(error) && "ui-field--invalid", className)}>
      <label htmlFor={controlId} className={cx("ui-field__label", hideLabel && "ui-visually-hidden")}>
        {label}
        {optional && <span className="ui-field__optional">Optional</span>}
      </label>
      {hint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {children({ id: controlId, describedBy, invalid: Boolean(error) })}
      {error && (
        <p id={errorId} className="ui-field__error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

type FieldChrome = Omit<FieldProps, "children" | "id">;

export interface TextInputProps extends FieldChrome, Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  ref?: Ref<HTMLInputElement>;
}

/** Labelled single-line text input. */
export function TextInput({ label, hint, error, optional, hideLabel, className, id, ref, ...input }: TextInputProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} id={id} className={className}>
      {(ids) => (
        <input
          ref={ref}
          id={ids.id}
          className="ui-input"
          aria-describedby={ids.describedBy}
          aria-invalid={ids.invalid || undefined}
          {...input}
        />
      )}
    </Field>
  );
}

export interface TextAreaProps extends FieldChrome, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> {
  /** Show a live "120 / 2,000" counter when maxLength is set. */
  showCount?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Labelled multi-line input with an optional character counter. */
export function TextArea({ label, hint, error, optional, hideLabel, className, id, showCount, ref, ...area }: TextAreaProps) {
  const length = typeof area.value === "string" ? area.value.length : 0;
  return (
    <Field label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} id={id} className={className}>
      {(ids) => (
        <>
          <textarea
            ref={ref}
            id={ids.id}
            className="ui-input ui-textarea"
            aria-describedby={ids.describedBy}
            aria-invalid={ids.invalid || undefined}
            {...area}
            rows={area.rows ?? 4}
          />
          {showCount && area.maxLength != null && (
            <p className="ui-field__count ui-num" aria-live="off">
              {length.toLocaleString("en-US")} / {area.maxLength.toLocaleString("en-US")}
            </p>
          )}
        </>
      )}
    </Field>
  );
}

export interface SelectProps extends FieldChrome, Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: { value: string; label: string; disabled?: boolean }[];
  ref?: Ref<HTMLSelectElement>;
}

/** Labelled native select (best accessibility + mobile pickers) with a custom chevron. */
export function Select({ label, hint, error, optional, hideLabel, className, id, options, ref, ...select }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} id={id} className={className}>
      {(ids) => (
        <span className="ui-select">
          <select
            ref={ref}
            id={ids.id}
            className="ui-input ui-select__control"
            aria-describedby={ids.describedBy}
            aria-invalid={ids.invalid || undefined}
            {...select}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="ui-select__chevron" size={18} aria-hidden="true" />
        </span>
      )}
    </Field>
  );
}
