// Buttons: the one place that defines how actions look. Variants map to intent, not colour.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "../cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger-quiet" | "accent";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label (decorative). */
  iconLeft?: ReactNode;
  /** Icon rendered after the label (decorative), e.g. an arrow. */
  iconRight?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
}

export interface ButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a spinner, sets aria-busy and ignores clicks while keeping focus on the button. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

function classes({ variant = "secondary", size = "md", block }: CommonProps, extra?: string) {
  return cx("ui-btn", `ui-btn--${variant}`, `ui-btn--${size}`, block && "ui-btn--block", extra);
}

/** Small animated spinner (static under reduced motion). Decorative: announce state with text or aria-busy. */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <LoaderCircle className={cx("ui-spinner", className)} size={size} aria-hidden="true" />;
}

/** Action button. Use `variant="primary"` for the single main action of a view. */
export function Button({
  variant,
  size,
  iconLeft,
  iconRight,
  block,
  loading = false,
  className,
  children,
  onClick,
  type = "button",
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <button
      ref={ref}
      type={type}
      className={classes({ variant, size, block }, className)}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      disabled={disabled}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner /> : iconLeft}
      <span className="ui-btn__label">{children}</span>
      {!loading && iconRight}
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps, AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  ref?: Ref<HTMLAnchorElement>;
}

/** A link that looks like a button (navigation, downloads). Opens external URLs safely. */
export function ButtonLink({ variant, size, iconLeft, iconRight, block, className, children, ref, ...rest }: ButtonLinkProps) {
  const external = /^https?:\/\//.test(rest.href);
  return (
    <a
      ref={ref}
      className={classes({ variant, size, block }, className)}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      {...rest}
    >
      {iconLeft}
      <span className="ui-btn__label">{children}</span>
      {iconRight}
    </a>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name (required — there is no visible text). */
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "secondary" | "primary";
  size?: "sm" | "md" | "lg";
  ref?: Ref<HTMLButtonElement>;
}

/** Square icon-only button with a required accessible label. Minimum 44×44 px target at size "md". */
export function IconButton({ label, icon, variant = "ghost", size = "md", className, type = "button", ref, ...rest }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx("ui-icon-btn", `ui-icon-btn--${variant}`, `ui-icon-btn--${size}`, className)}
      {...rest}
    >
      {icon}
    </button>
  );
}
