// Card: the basic surface. Header/Body/Footer are optional slots with consistent spacing.
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export type CardTone = "default" | "tint" | "sunken" | "outline" | "primary";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render (section/article/div/li). Use "section" with a CardHeader title for landmarks-light grouping. */
  as?: ElementType;
  tone?: CardTone;
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds hover elevation; use when the whole card is a link/button target. */
  interactive?: boolean;
}

/** Rounded surface with a soft border and shadow. */
export function Card({ as: Tag = "div", tone = "default", padding = "md", interactive, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(
        "ui-card",
        `ui-card--${tone}`,
        `ui-card--pad-${padding}`,
        interactive && "ui-card--interactive",
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  /** Decorative icon shown in a tinted tile before the title. */
  icon?: ReactNode;
  /** Buttons/links aligned to the end. */
  actions?: ReactNode;
  /** Heading level for the title (default h2). */
  level?: 2 | 3 | 4;
  id?: string;
  className?: string;
}

/** Card title row: optional icon tile, eyebrow, title (real heading), subtitle and actions. */
export function CardHeader({ title, eyebrow, subtitle, icon, actions, level = 2, id, className }: CardHeaderProps) {
  const H = `h${level}` as ElementType;
  return (
    <div className={cx("ui-card__header", className)}>
      {icon && (
        <span className="ui-card__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="ui-card__titles">
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <H id={id} className="ui-card__title">
          {title}
        </H>
        {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-card__actions">{actions}</div>}
    </div>
  );
}

/** Main content area of a card. */
export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-card__body", className)} {...rest} />;
}

/** Bottom row of a card, separated by a hairline; usually holds actions or provenance. */
export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-card__footer", className)} {...rest} />;
}
