// Evidence & provenance primitives: source citations, "Show the records" links, the AI-draft badge.
// These make Kinwise's "show your work" promise visible on every screen.
import type { ButtonHTMLAttributes } from "react";
import { ExternalLink, ListChecks, Sparkles } from "lucide-react";
import type { KbSource } from "../../kb/types";
import { cx } from "../cx";

/** The fields of a KB source a citation needs. Accepts a full KbSource. */
export type CitationSource = Pick<KbSource, "short" | "url"> & Partial<Pick<KbSource, "citation" | "id" | "year">>;

export interface SourceCitationProps {
  source: CitationSource;
  /** "inline" = text link in a sentence; "chip" = small bordered pill (lists of sources). */
  variant?: "inline" | "chip";
  className?: string;
}

/**
 * Short-form citation ("AGS Beers Criteria® 2023") linking to the source in a new tab.
 * The full citation is exposed as a tooltip and to assistive tech.
 */
export function SourceCitation({ source, variant = "chip", className }: SourceCitationProps) {
  const safeUrl = /^https:\/\//.test(source.url) ? source.url : undefined;
  const label = `${source.short}${source.citation ? ` — ${source.citation}` : ""} (opens in a new tab)`;
  if (!safeUrl) {
    return (
      <cite className={cx("ui-cite", `ui-cite--${variant}`, className)} title={source.citation}>
        {source.short}
      </cite>
    );
  }
  return (
    <a
      className={cx("ui-cite", `ui-cite--${variant}`, className)}
      href={safeUrl}
      target="_blank"
      rel="noreferrer noopener"
      title={source.citation}
      aria-label={label}
    >
      <cite>{source.short}</cite>
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

export interface EvidenceLinkProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Number of records behind the claim; shown as "Show the 8 records". */
  count?: number;
  /** Override the visible label. */
  label?: string;
}

/** Small "Show the records" button that opens the evidence drawer for a number or claim. */
export function EvidenceLink({ count, label, className, type = "button", ...rest }: EvidenceLinkProps) {
  const text = label ?? (count === undefined ? "Show the records" : count === 1 ? "Show the record" : `Show the ${count} records`);
  return (
    <button type={type} className={cx("ui-evidence-link", className)} {...rest}>
      <ListChecks size={15} aria-hidden="true" />
      <span>{text}</span>
    </button>
  );
}

export interface AIBadgeProps {
  /** Model label, e.g. "Qwen2.5-3B". */
  model?: string | null;
  /** Generation time in milliseconds. */
  ms?: number | null;
  className?: string;
}

/** Formats milliseconds for provenance lines: 840 → "0.8 s", 12_400 → "12 s". */
export function formatDuration(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/** Provenance badge on every AI output: "AI draft · on this device · <model> · <time>". */
export function AIBadge({ model, ms, className }: AIBadgeProps) {
  const parts = ["AI draft", "on this device"];
  if (model) parts.push(model);
  if (ms != null) parts.push(formatDuration(ms));
  return (
    <span className={cx("ui-ai-badge", className)}>
      <Sparkles size={14} aria-hidden="true" />
      <span>{parts.join(" · ")}</span>
    </span>
  );
}
