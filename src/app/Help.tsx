// "Need help now?" — a static, always-available dialog. Kinwise does no triage: it only points to the
// people who can help and states plainly that nobody monitors the app.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarClock, HeartHandshake, Phone, PhoneCall, ShieldAlert, Siren } from "lucide-react";
import { Button, Modal } from "../ui";
import { SAFETY_NET_FOR_ANYONE } from "../engine/brief/safetyNet";
import { EMERGENCY_SIGNS } from "../engine/safety/emergencySigns";

interface HelpApi {
  openHelp: () => void;
}

const HelpContext = createContext<HelpApi | null>(null);

/** Provides useHelp() and renders the single Help dialog instance. Mounted once by App. */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openHelp = useCallback(() => setOpen(true), []);
  const api = useMemo(() => ({ openHelp }), [openHelp]);
  return (
    <HelpContext.Provider value={api}>
      {children}
      <HelpDialog open={open} onClose={() => setOpen(false)} />
    </HelpContext.Provider>
  );
}

/** Open the Help dialog from anywhere: const { openHelp } = useHelp(). */
export function useHelp(): HelpApi {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used inside <HelpProvider>");
  return ctx;
}

/**
 * The phone numbers, written once: shown here and, statically, next to a "too much / the wrong medicine" note on
 * the patient check-in (views/patient/MedSafetyLine.tsx). `text` uses non-breaking hyphens so a number never
 * wraps across two lines on a phone; `tel` is what the phone dials.
 */
export const EMERGENCY_NUMBER = { text: "911", tel: "911" } as const;
export const POISON_CONTROL = { text: "1\u2011800\u2011222\u20111222", tel: "18002221222" } as const;

/**
 * A static line under the 911 row: everyday warning signs in an older adult that can be an emergency. Like the
 * rest of this dialog it never depends on what was recorded, so it is not triage. One constant holds the sentence
 * (safetyNet.ts EMERGENCY_LINE, which also ends the brief's safety-net line), shared through
 * engine/safety/emergencySigns.ts with the rules that decide when the patient check-in shows this row's words
 * (views/patient/EmergencyLine.tsx). The dialog shows it only here.
 */
export { EMERGENCY_SIGNS };

/**
 * The 911 row's own words, written once: the dialog's first row and the check-in's static 911 line
 * (views/patient/EmergencyLine.tsx) print the same sentences.
 */
export const EMERGENCY_CALL = {
  title: `If this is an emergency, call ${EMERGENCY_NUMBER.text}`,
  detail: "Outside the US, call your local emergency number.",
  telLabel: `Call ${EMERGENCY_NUMBER.text}`,
} as const;

/** Nobody watches Kinwise: said in the dialog's notes and next to the check-in's 911 line. */
export const NOT_MONITORED = "Kinwise is not monitored by anyone and does not notify anyone.";

const LINES: { icon: ReactNode; title: string; detail: string; note?: string; tel: string; telLabel: string }[] = [
  {
    icon: <Siren size={22} />,
    title: EMERGENCY_CALL.title,
    detail: EMERGENCY_CALL.detail,
    note: EMERGENCY_SIGNS,
    tel: EMERGENCY_NUMBER.tel,
    telLabel: EMERGENCY_CALL.telLabel,
  },
  {
    icon: <ShieldAlert size={22} />,
    title: `Poison Control: ${POISON_CONTROL.text}`,
    detail: "Free, confidential advice 24/7 if someone took too much of a medicine or the wrong one (US).",
    tel: POISON_CONTROL.tel,
    telLabel: "Call Poison Control",
  },
  {
    icon: <HeartHandshake size={22} />,
    title: "988 Suicide & Crisis Lifeline",
    detail: "Call or text 988 to talk with someone, any time (US).",
    tel: "988",
    telLabel: "Call 988",
  },
];

/**
 * The notes under the numbers. The middle one is the static safety-net line the visit brief also prints
 * (engine/brief/safetyNet.ts): it never depends on what was recorded, so it is not triage. Exported for tests.
 */
export function HelpNotes() {
  return (
    <div className="help-notes">
      <p>
        <Phone size={16} aria-hidden="true" />
        <span>
          <strong>{NOT_MONITORED}</strong> Alex can see your entries
          when they open Kinwise, but no one is alerted.
        </span>
      </p>
      <p>
        <CalendarClock size={16} aria-hidden="true" />
        <span>{SAFETY_NET_FOR_ANYONE}</span>
      </p>
      <p>
        <ShieldAlert size={16} aria-hidden="true" />
        <span>
          <strong>Don’t stop or change medicines without talking to the prescriber.</strong> Bring questions to the doctor
          or pharmacist — the visit brief can help.
        </span>
      </p>
    </div>
  );
}

/** The numbers to call, one row each (exported for tests: the dialog itself renders in a portal). */
export function HelpLines() {
  return (
    <ul className="help-lines" role="list">
      {LINES.map((l) => (
        <li key={l.tel} className="help-line">
          <span className="help-line__icon" aria-hidden="true">
            {l.icon}
          </span>
          <div className="help-line__text">
            <p className="help-line__title">{l.title}</p>
            {l.note && <p className="help-line__note">{l.note}</p>}
            <p className="help-line__detail">{l.detail}</p>
          </div>
          <a className="ui-btn ui-btn--secondary ui-btn--sm help-line__call" href={`tel:${l.tel}`}>
            <PhoneCall size={16} aria-hidden="true" />
            <span>{l.telLabel}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The dialog itself (exported for the /dev/ui gallery). */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Focus "Close" on open so a stray Enter can never start a phone call.
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      initialFocusRef={closeRef}
      title="Need help now?"
      description="Kinwise can’t help in an emergency. These people can."
      footer={
        <Button ref={closeRef} variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <HelpLines />
      <HelpNotes />
    </Modal>
  );
}
