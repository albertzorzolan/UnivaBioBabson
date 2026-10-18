// "Demo: switch to Alex's view" — lets someone trying the demo jump between the two roles without signing out
// and back in (e.g. save Margaret's check-in, then see it on Alex's timeline). Uses the same demo-only role switch
// as the guided tour (loginAs); it is not authentication (see session.ts).
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { PatientProfile, Role } from "../../model/types";
import { useStore } from "../StoreProvider";
import { loginAs } from "../session";
import { homeFor, navigate } from "../router";
import { cx } from "../../ui";
import "./shellExtras.css";

/**
 * "Demo: switch to Alex’s view" / "…Margaret’s view" from the profile, or generic words for an emptied record.
 * Read defensively: a missing name must never crash the shell (validateStore also requires both names).
 */
export function demoSwitchLabel(p: PatientProfile, to: Role): string {
  const raw: unknown = to === "caregiver" ? p.caregiverName : p.preferredName;
  const name = typeof raw === "string" ? raw.trim() : "";
  const who = name ? `${name}’s` : to === "caregiver" ? "the caregiver’s" : "the patient’s";
  return `Demo: switch to ${who} view`;
}

export function DemoSwitch({ to, onSwitch, className }: { to: Role; onSwitch?: () => void; className?: string }) {
  const { data } = useStore();
  const Icon = to === "caregiver" ? ArrowRight : ArrowLeft;
  return (
    <button
      type="button"
      className={cx("demo-switch", className)}
      onClick={() => {
        onSwitch?.();
        loginAs(to);
        navigate(homeFor(to));
      }}
    >
      {to === "patient" && <Icon size={16} aria-hidden="true" />}
      <span>{demoSwitchLabel(data.profile, to)}</span>
      {to === "caregiver" && <Icon size={16} aria-hidden="true" />}
    </button>
  );
}
