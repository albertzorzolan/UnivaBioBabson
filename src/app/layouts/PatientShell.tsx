// Patient layout (tablet-first, built for an older adult):
//  - base font 20px (data-shell="patient" on <html>), every target ≥ 56px
//  - a warm greeting, then three big tabs: Today / My week / My medicines (bottom bar on phones)
//  - "Need help now?" and "Sign out" always visible, with words (on a narrow phone, or at large text sizes where
//    they would wrap, "Sign out" keeps its icon and accessible name and drops the visible word)
//  - "Demo: switch to Alex's view" next to the demo-data chip, and the recovery notice above the page when needed
import type { ReactNode } from "react";
import { useStore } from "../StoreProvider";
import { logout } from "../session";
import { href, navigate, type Route } from "../router";
import { useHelp } from "../Help";
import { parseDate } from "../../model/dates";
import { PATIENT_NAV } from "./nav";
import { useShellAttribute } from "./useDocumentSettings";
import { SafetyFooter, SkipLink } from "./ShellParts";
import { DemoSwitch } from "./DemoSwitch";
import { RecoveryNotice } from "./RecoveryNotice";
import { DemoDataChip, ICONS, LogoMark } from "../../ui";

export interface PatientShellProps {
  current: Route;
  children: ReactNode;
}

/** "Saturday, October 10" */
function longDay(date: string): string {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** App frame for every patient route. */
export function PatientShell({ current, children }: PatientShellProps) {
  useShellAttribute("patient");
  const { data, today } = useStore();
  const { openHelp } = useHelp();
  const HelpIcon = ICONS.help;
  const SignOutIcon = ICONS.signOut;

  return (
    <div className="pt-shell">
      <SkipLink />
      <header className="pt-header">
        <div className="pt-header__inner">
          <div className="pt-topline">
            <a className="pt-brand" href={href("/p/today")} aria-label="Kinwise — Today">
              <LogoMark size={36} />
              <span className="pt-brand__word" aria-hidden="true">
                Kinwise
              </span>
            </a>
            <div className="pt-actions">
              <button type="button" className="pt-help" onClick={openHelp}>
                <HelpIcon size={24} aria-hidden="true" />
                <span>Need help now?</span>
              </button>
              <button
                type="button"
                className="pt-signout"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
              >
                <SignOutIcon size={22} aria-hidden="true" />
                <span className="pt-signout__label">Sign out</span>
              </button>
            </div>
          </div>
          <div className="pt-greeting">
            <div className="pt-greeting__meta">
              <p className="pt-greeting__date">{longDay(today)}</p>
              {data.isDemoData && <DemoDataChip align="start" />}
              <DemoSwitch to="caregiver" />
            </div>
            <p className="pt-greeting__hello">Hello, {data.profile.preferredName}</p>
          </div>
        </div>
      </header>

      <nav className="pt-tabs" aria-label="Your pages">
        <ul role="list" className="pt-tabs__list">
          {PATIENT_NAV.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={item.path}>
                <a className="pt-tab" href={href(item.path)} aria-current={item.path === current ? "page" : undefined}>
                  <Icon size={26} aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <main id="main-content" className="pt-main" tabIndex={-1}>
        <RecoveryNotice />
        {children}
      </main>
      <SafetyFooter className="pt-footer" />
    </div>
  );
}
