// "Need help now?" — a static, always-available dialog. Kinwise does no triage: it only points to the
// people who can help and states plainly that nobody monitors the app.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarClock, HeartHandshake, Phone, PhoneCall, ShieldAlert, Siren } from "lucide-react";
import { Button, Modal } from "../ui";
import { SAFETY_NET_FOR_ANYONE } from "../engine/brief/safetyNet";

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

const LINES: { icon: ReactNode; title: string; detail: string; tel: string; telLabel: string }[] = [
  {
    icon: <Siren size={22} />,
    title: "If this is an emergency, call 911",
    detail: "Outside the US, call your local emergency number.",
    tel: "911",
    telLabel: "Call 911",
  },
  {
    icon: <ShieldAlert size={22} />,
    title: "Poison Control: 1\u2011800\u2011222\u20111222",
    detail: "Free, confidential advice 24/7 if someone took too much of a medicine or the wrong one (US).",
    tel: "18002221222",
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
          <strong>Kinwise is not monitored by anyone and does not notify anyone.</strong> Alex can see your entries
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
      <ul className="help-lines" role="list">
        {LINES.map((l) => (
          <li key={l.tel} className="help-line">
            <span className="help-line__icon" aria-hidden="true">
              {l.icon}
            </span>
            <div className="help-line__text">
              <p className="help-line__title">{l.title}</p>
              <p className="help-line__detail">{l.detail}</p>
            </div>
            <a className="ui-btn ui-btn--secondary ui-btn--sm help-line__call" href={`tel:${l.tel}`}>
              <PhoneCall size={16} aria-hidden="true" />
              <span>{l.telLabel}</span>
            </a>
          </li>
        ))}
      </ul>
      <HelpNotes />
    </Modal>
  );
}
