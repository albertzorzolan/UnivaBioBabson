// Display components: PageHeader, Callout, EmptyState, Skeleton, Disclosure, Tooltip, Avatar.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../cx";
import { toneIcon, type Tone } from "./Badge";

export interface PageHeaderProps {
  /** Small uppercase context label, e.g. "Margaret · last 30 days". */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons aligned to the end (wrap under the title on phones). */
  actions?: ReactNode;
  /** Extra content under the subtitle (filters, meta). */
  children?: ReactNode;
  className?: string;
}

/**
 * The page's single <h1>. The heading is the router's focus target after navigation
 * (data-route-focus + tabIndex=-1), so screen-reader users hear the new page's name.
 */
export function PageHeader({ eyebrow, title, subtitle, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cx("ui-page-header", className)}>
      <div className="ui-page-header__text">
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <h1 className="ui-page-header__title" tabIndex={-1} data-route-focus="">
          {title}
        </h1>
        {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

export interface CalloutProps {
  tone?: Extract<Tone, "neutral" | "info" | "caution" | "attention" | "success">;
  title?: ReactNode;
  children?: ReactNode;
  /** Replace the tone's default icon. */
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Inline message box (info/caution/…) with icon + words. Not a live region; use Toast for announcements. */
export function Callout({ tone = "info", title, children, icon, action, className }: CalloutProps) {
  return (
    <div className={cx("ui-callout", `ui-callout--${tone}`, className)}>
      <span className="ui-callout__icon" aria-hidden="true">
        {icon ?? toneIcon(tone === "neutral" ? "info" : tone, 20)}
      </span>
      <div className="ui-callout__content">
        {title && <p className="ui-callout__title">{title}</p>}
        {children && <div className="ui-callout__body">{children}</div>}
      </div>
      {action && <div className="ui-callout__action">{action}</div>}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Heading level of the title (default h2). */
  level?: 2 | 3;
  className?: string;
}

/** Friendly "nothing here yet" block that always says what to do next. */
export function EmptyState({ icon, title, children, action, level = 2, className }: EmptyStateProps) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className={cx("ui-empty", className)}>
      {icon && (
        <span className="ui-empty__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <H className="ui-empty__title">{title}</H>
      {children && <div className="ui-empty__body">{children}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

export interface SkeletonProps {
  /** Number of text lines (last line is shorter). Ignored when `height` is set. */
  lines?: number;
  height?: string;
  width?: string;
  radius?: string;
  className?: string;
  /** Text announced while loading (visually hidden). Pass "" for purely decorative skeletons. */
  label?: string;
}

/** Loading placeholder. Decorative blocks + one visually hidden status line. */
export function Skeleton({ lines = 3, height, width, radius, className, label = "Loading…" }: SkeletonProps) {
  return (
    <div className={cx("ui-skeleton", className)} role={label ? "status" : undefined} aria-hidden={label ? undefined : true}>
      {label && <span className="ui-visually-hidden">{label}</span>}
      {height ? (
        <span className="ui-skeleton__block" aria-hidden="true" style={{ height, width, borderRadius: radius }} />
      ) : (
        Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className="ui-skeleton__line"
            aria-hidden="true"
            style={{ width: i === lines - 1 && lines > 1 ? "62%" : width }}
          />
        ))
      )}
    </div>
  );
}

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** "plain" for inline "How this was calculated" toggles, "card" for bordered sections. */
  variant?: "plain" | "card";
}

/** Show/hide section (button with aria-expanded + region). */
export function Disclosure({ summary, children, defaultOpen = false, open, onOpenChange, className, variant = "plain" }: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const id = useId();
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  return (
    <div className={cx("ui-disclosure", `ui-disclosure--${variant}`, isOpen && "is-open", className)}>
      <button type="button" className="ui-disclosure__trigger" aria-expanded={isOpen} aria-controls={id} onClick={toggle}>
        <ChevronDown className="ui-disclosure__chevron" size={18} aria-hidden="true" />
        <span>{summary}</span>
      </button>
      <div id={id} className="ui-disclosure__panel" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}

export interface TooltipProps {
  /** The trigger's visible content (rendered inside a button). */
  children: ReactNode;
  /** Tooltip text. Kept short; it is also the trigger's accessible description. */
  content: ReactNode;
  /** Which edge of the trigger the bubble aligns to. */
  align?: "start" | "end" | "center";
  className?: string;
  triggerClassName?: string;
}

/**
 * Hover/focus/tap tooltip (WCAG 1.4.13: dismissable with Esc, hoverable, persistent while hovered).
 * The trigger is a real button so touch users can open it.
 */
export function Tooltip({ children, content, align = "center", className, triggerClassName }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const bubble = useRef<HTMLSpanElement>(null);

  // Keep the bubble inside the viewport on narrow screens (shift it horizontally if it would overflow).
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!open || !el) return;
    el.style.setProperty("--tip-shift", "0px");
    const r = el.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    const shift = r.right > vw - margin ? vw - margin - r.right : r.left < margin ? margin - r.left : 0;
    el.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
  }, [open]);
  return (
    <span
      className={cx("ui-tooltip", `ui-tooltip--${align}`, open && "is-open", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={cx("ui-tooltip__trigger", triggerClassName)}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <span role="tooltip" id={id} ref={bubble} className="ui-tooltip__bubble">
        {content}
      </span>
    </span>
  );
}

/** Initials avatar (decorative; always next to the person's name). */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className={cx("ui-avatar", `ui-avatar--${size}`, className)} aria-hidden="true">
      {initials}
    </span>
  );
}
