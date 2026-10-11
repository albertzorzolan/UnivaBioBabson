// Badge (static status label) and Chip (toggle filter). Meaning is always carried by words, never colour alone.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cx } from "../cx";

export type Tone = "neutral" | "primary" | "info" | "caution" | "attention" | "success";

/** Default icon per status tone (neutral/primary have none). */
export function toneIcon(tone: Tone, size = 14): ReactNode {
  switch (tone) {
    case "info":
      return <Info size={size} aria-hidden="true" />;
    case "caution":
      return <TriangleAlert size={size} aria-hidden="true" />;
    case "attention":
      return <CircleAlert size={size} aria-hidden="true" />;
    case "success":
      return <CircleCheck size={size} aria-hidden="true" />;
    default:
      return null;
  }
}

export interface BadgeProps {
  tone?: Tone;
  /** `true` = the tone's default icon; a node = custom icon; omitted/false = no icon. */
  icon?: ReactNode | boolean;
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
  title?: string;
}

/** Compact, non-interactive label such as "AGS Beers 2023" or "Worth asking about". */
export function Badge({ tone = "neutral", icon, size = "md", children, className, title }: BadgeProps) {
  const glyph = icon === true ? toneIcon(tone, size === "sm" ? 12 : 14) : icon || null;
  return (
    <span className={cx("ui-badge", `ui-badge--${tone}`, `ui-badge--${size}`, className)} title={title}>
      {glyph}
      <span>{children}</span>
    </span>
  );
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  icon?: ReactNode;
  /** Optional count shown after the label, e.g. number of matching days. */
  count?: number;
  children: ReactNode;
}

/** Toggle chip for filters (aria-pressed). Shows a check when on so state isn't colour-only. */
export function Chip({ pressed, onPressedChange, icon, count, children, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx("ui-chip", pressed && "ui-chip--on", className)}
      onClick={() => onPressedChange(!pressed)}
      {...rest}
    >
      {pressed ? <CircleCheck size={16} aria-hidden="true" className="ui-chip__check" /> : icon}
      <span>{children}</span>
      {count !== undefined && <span className="ui-chip__count ui-num">{count}</span>}
    </button>
  );
}
