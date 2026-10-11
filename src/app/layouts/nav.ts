// Navigation model shared by the shells (sidebar, bottom bar, "More" sheet) and the guided tour.
import type { Route } from "../router";
import type { IconName } from "../../ui/icons";

export interface NavItem {
  path: Route;
  /** Full label (sidebar, page titles). */
  label: string;
  /** Short label for the phone bottom bar. */
  short: string;
  icon: IconName;
}

export const CAREGIVER_NAV: NavItem[] = [
  { path: "/c/overview", label: "Overview", short: "Overview", icon: "overview" },
  { path: "/c/meds", label: "Medications", short: "Meds", icon: "medications" },
  { path: "/c/review", label: "Medication review", short: "Review", icon: "review" },
  { path: "/c/timeline", label: "Symptoms & timeline", short: "Timeline", icon: "timeline" },
  { path: "/c/ask", label: "Ask Kinwise", short: "Ask", icon: "ask" },
  { path: "/c/brief", label: "Visit brief", short: "Brief", icon: "brief" },
  { path: "/c/settings", label: "Settings", short: "Settings", icon: "settings" },
];

/** The five destinations on the phone bottom bar; the rest live under "More". */
export const CAREGIVER_PRIMARY: Route[] = ["/c/overview", "/c/meds", "/c/review", "/c/timeline", "/c/brief"];

export const PATIENT_NAV: NavItem[] = [
  { path: "/p/today", label: "Today", short: "Today", icon: "today" },
  { path: "/p/week", label: "My week", short: "My week", icon: "week" },
  { path: "/p/meds", label: "My medicines", short: "Medicines", icon: "medications" },
];
