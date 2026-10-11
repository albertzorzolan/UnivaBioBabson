// Brand mark + the semantic icon vocabulary. Views should import icons from here (or lucide-react directly)
// so the same concept always gets the same picture: a pill is always a medicine, a shield is always privacy.
import {
  Activity,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageCircleQuestion,
  Pill,
  Settings as SettingsIcon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cx } from "./cx";

/** Semantic icon names used by navigation and page headers. */
export const ICONS = {
  overview: LayoutDashboard,
  medications: Pill,
  review: ClipboardCheck,
  timeline: Activity,
  ask: MessageCircleQuestion,
  brief: FileText,
  settings: SettingsIcon,
  howItWorks: BookOpen,
  help: LifeBuoy,
  signOut: LogOut,
  today: Sun,
  week: CalendarDays,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Kinwise logo mark: a heartbeat line inside a rounded square (decorative; pair with the wordmark or a label). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cx("ui-logo__mark", className)}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="18" fill="var(--primary)" />
      <path
        d="M13 35h10l6-15 8 26 6-11h8"
        fill="none"
        stroke="var(--primary-ink)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logo mark + "Kinwise" wordmark. The wordmark is real text, so it reads correctly to screen readers. */
export function Logo({ size = 32, className, tagline }: { size?: number; className?: string; tagline?: string }) {
  return (
    <span className={cx("ui-logo", className)}>
      <LogoMark size={size} />
      <span className="ui-logo__text">
        <span className="ui-logo__word">
          Kinwise<span className="ui-logo__dot" aria-hidden="true">.</span>
        </span>
        {tagline && <span className="ui-logo__tagline">{tagline}</span>}
      </span>
    </span>
  );
}
