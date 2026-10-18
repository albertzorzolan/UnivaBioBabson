// Caregiver layout.
//  ≥1024px: sticky left sidebar with its own scroll (never clips "Need help now?" / "Sign out", even at
//           short heights or 200% zoom), patient card, nav, footer links.
//  <1024px: sticky top bar (static on very short screens) + fixed bottom tab bar with five destinations
//           and a "More" sheet for the rest.
//  Both: "Demo: switch to Margaret's view" under the patient card, and the recovery notice above the page when needed.
import { useState, type ReactNode } from "react";
import { MoreHorizontal, PlayCircle } from "lucide-react";
import { useStore } from "../StoreProvider";
import { logout } from "../session";
import { href, navigate, type Route } from "../router";
import { useHelp } from "../Help";
import { startTour } from "../Tour";
import { CAREGIVER_NAV, CAREGIVER_PRIMARY, type NavItem } from "./nav";
import { useShellAttribute } from "./useDocumentSettings";
import { SkipLink, SafetyFooter } from "./ShellParts";
import { DemoSwitch } from "./DemoSwitch";
import { RecoveryNotice } from "./RecoveryNotice";
import { Avatar, DemoDataChip, Drawer, ICONS, Logo, cx } from "../../ui";

export interface ShellProps {
  /** The current route (for aria-current on the nav). */
  current: Route;
  children: ReactNode;
}

function signOut() {
  logout();
  navigate("/");
}

/** Patient identity card: who this record is about. */
function PatientCard({ compact }: { compact?: boolean }) {
  const { data } = useStore();
  const p = data.profile;
  return (
    <div className={cx("cg-patient", compact && "cg-patient--compact")}>
      <Avatar name={p.displayName} />
      <div className="cg-patient__text">
        {/* An emptied record (Settings › Delete everything) has no name and age 0, meaning "not entered". */}
        <p className="cg-patient__name">{p.displayName.trim() || "Name not recorded"}</p>
        <p className="cg-patient__meta">
          {p.age > 0 ? `${p.age} · ` : ""}
          {data.isDemoData ? "fictional patient" : "patient"}
        </p>
      </div>
    </div>
  );
}

function NavLink({ item, current, onNavigate }: { item: NavItem; current: Route; onNavigate?: () => void }) {
  const Icon = ICONS[item.icon];
  const active = item.path === current;
  return (
    <a className="cg-nav__link" href={href(item.path)} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      <Icon size={20} aria-hidden="true" />
      <span>{item.label}</span>
    </a>
  );
}

/** App frame for every caregiver route. */
export function CaregiverShell({ current, children }: ShellProps) {
  useShellAttribute("caregiver");
  const { openHelp } = useHelp();
  const { data } = useStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const HowIcon = ICONS.howItWorks;
  const HelpIcon = ICONS.help;
  const SignOutIcon = ICONS.signOut;
  const secondary = CAREGIVER_NAV.filter((n) => !CAREGIVER_PRIMARY.includes(n.path));
  const moreActive = secondary.some((n) => n.path === current) || current === "/how-it-works";

  return (
    <div className="cg-shell">
      <SkipLink />

      {/* ---- Phone / tablet top bar ---- */}
      <header className="cg-topbar">
        <a className="cg-topbar__brand" href={href("/c/overview")} aria-label="Kinwise — Overview">
          <Logo size={30} />
        </a>
        <div className="cg-topbar__end">
          {data.isDemoData && <DemoDataChip />}
          <button type="button" className="cg-topbar__help" onClick={openHelp}>
            <HelpIcon size={20} aria-hidden="true" />
            <span>Help</span>
          </button>
        </div>
      </header>

      {/* ---- Desktop sidebar ---- */}
      <aside className="cg-sidebar" aria-label="Caregiver navigation">
        <div className="cg-sidebar__inner">
          <a className="cg-sidebar__brand" href={href("/c/overview")} aria-label="Kinwise — Overview">
            <Logo size={34} tagline={"Family medicine-review co\u2011pilot"} />
          </a>
          <div className="cg-sidebar__patient">
            <p className="cg-sidebar__label">Caring for</p>
            <PatientCard />
            <DemoSwitch to="patient" />
          </div>
          <nav className="cg-nav" aria-label="Main">
            <ul role="list">
              {CAREGIVER_NAV.map((item) => (
                <li key={item.path}>
                  <NavLink item={item} current={current} />
                </li>
              ))}
            </ul>
          </nav>
          <div className="cg-sidebar__footer">
            <a className="cg-nav__link" href={href("/how-it-works")} aria-current={current === "/how-it-works" ? "page" : undefined}>
              <HowIcon size={20} aria-hidden="true" />
              <span>How Kinwise works</span>
            </a>
            <button type="button" className="cg-nav__link" onClick={() => startTour()}>
              <PlayCircle size={20} aria-hidden="true" />
              <span>Take the 2-minute tour</span>
            </button>
            <button type="button" className="cg-nav__link cg-nav__link--help" onClick={openHelp}>
              <HelpIcon size={20} aria-hidden="true" />
              <span>Need help now?</span>
            </button>
            <button type="button" className="cg-nav__link" onClick={signOut}>
              <SignOutIcon size={20} aria-hidden="true" />
              <span>Sign out</span>
            </button>
            {data.isDemoData && (
              <div className="cg-sidebar__demo">
                <DemoDataChip align="start" />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ---- Page ---- */}
      <div className="cg-main-wrap">
        <main id="main-content" className="cg-main" tabIndex={-1}>
          <div className="cg-content">
            <RecoveryNotice />
            {children}
          </div>
        </main>
        <SafetyFooter className="cg-footer" />
      </div>

      {/* ---- Phone / tablet bottom bar ---- */}
      <nav className="cg-bottombar" aria-label="Main">
        <ul role="list">
          {CAREGIVER_PRIMARY.map((path) => {
            const item = CAREGIVER_NAV.find((n) => n.path === path)!;
            const Icon = ICONS[item.icon];
            return (
              <li key={path}>
                <a className="cg-tab" href={href(path)} aria-current={path === current ? "page" : undefined}>
                  <span className="cg-tab__icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="cg-tab__label">{item.short}</span>
                </a>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className={cx("cg-tab", moreActive && "is-active")}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
            >
              <span className="cg-tab__icon">
                <MoreHorizontal size={22} aria-hidden="true" />
              </span>
              <span className="cg-tab__label">More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More" eyebrow="Kinwise">
        <div className="cg-more">
          <PatientCard compact />
          <DemoSwitch to="patient" onSwitch={() => setMoreOpen(false)} />
          <ul role="list" className="cg-more__list">
            {secondary.map((item) => (
              <li key={item.path}>
                <NavLink item={item} current={current} onNavigate={() => setMoreOpen(false)} />
              </li>
            ))}
            <li>
              <a
                className="cg-nav__link"
                href={href("/how-it-works")}
                aria-current={current === "/how-it-works" ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
              >
                <HowIcon size={20} aria-hidden="true" />
                <span>How Kinwise works</span>
              </a>
            </li>
            <li>
              <button
                type="button"
                className="cg-nav__link"
                onClick={() => {
                  setMoreOpen(false);
                  startTour();
                }}
              >
                <PlayCircle size={20} aria-hidden="true" />
                <span>Take the 2-minute tour</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="cg-nav__link cg-nav__link--help"
                onClick={() => {
                  setMoreOpen(false);
                  openHelp();
                }}
              >
                <HelpIcon size={20} aria-hidden="true" />
                <span>Need help now?</span>
              </button>
            </li>
            <li>
              <button type="button" className="cg-nav__link" onClick={signOut}>
                <SignOutIcon size={20} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </li>
          </ul>
        </div>
      </Drawer>
    </div>
  );
}
