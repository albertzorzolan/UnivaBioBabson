// Demo-context components: the compact "Fictional demo data" chip and the "being built" placeholder card.
import type { ReactNode } from "react";
import { FlaskConical, Hammer } from "lucide-react";
import { cx } from "../cx";
import { PageHeader, Tooltip } from "./Display";

/** Persistent but compact reminder that every record is fictional (SPEC §8). Tap/hover for details. */
export function DemoDataChip({ align = "end", className }: { align?: "start" | "end" | "center"; className?: string }) {
  return (
    <Tooltip
      align={align}
      className={cx("ui-demo-chip", className)}
      triggerClassName="ui-demo-chip__trigger"
      content={
        <>
          Margaret, Alex and every record here are invented for this demo. Please don’t enter real health information —
          it stays in this browser only.
        </>
      }
    >
      <FlaskConical size={14} aria-hidden="true" />
      <span>Fictional demo data</span>
    </Tooltip>
  );
}

export interface ViewPlaceholderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** What this screen will do, in a few bullets. */
  plans: string[];
  children?: ReactNode;
}

/** Tasteful "this screen is being built" page used by routes whose feature module hasn't landed yet. */
export function ViewPlaceholder({ eyebrow, title, subtitle, plans, children }: ViewPlaceholderProps) {
  return (
    <div className="ui-placeholder">
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <section className="ui-card ui-card--outline ui-card--pad-lg ui-placeholder__card" aria-labelledby="placeholder-title">
        <span className="ui-placeholder__icon" aria-hidden="true">
          <Hammer size={22} />
        </span>
        <div>
          <h2 id="placeholder-title" className="ui-placeholder__title">
            This screen is being built
          </h2>
          <p className="ui-placeholder__lead">Here is what it will show:</p>
          <ul className="ui-placeholder__list">
            {plans.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {children}
        </div>
      </section>
    </div>
  );
}
