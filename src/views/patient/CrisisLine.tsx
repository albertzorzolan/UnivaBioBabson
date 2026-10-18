// The static 988 line in the patient check-in, shown when her words describe thoughts of dying or self-harm ("I don't
// want to live anymore").
//
// Static on purpose, like the 911 line (EmergencyLine.tsx) and the Poison Control line (MedSafetyLine.tsx): every
// word is the Help dialog's 988 row (src/app/Help.tsx CRISIS_LINE) plus its "not monitored" note, so the line never
// repeats her words, never judges them and gives no advice of its own. The only thing that depends on her words is
// whether the line is shown (engine/safety/emergencySigns.ts describesSelfHarm).
//
// role="note", not "alert", for the same reason as the 911 line: it should not interrupt a screen reader.
import { HeartHandshake, PhoneCall } from "lucide-react";
import { CRISIS_LINE, NOT_MONITORED } from "../../app/Help";
import { cx } from "../../ui";
import "./MedSafetyLine.css";

export { describesSelfHarm } from "../../engine/safety/emergencySigns";

export function CrisisLine({ className }: { className?: string }) {
  return (
    <div role="note" className={cx("pt-medsafety pt-crisis", className)}>
      <span className="pt-medsafety__icon" aria-hidden="true">
        <HeartHandshake size={24} />
      </span>
      <div className="pt-medsafety__text">
        <p className="pt-emergency__title">{CRISIS_LINE.title}</p>
        <p>
          {CRISIS_LINE.detail} {NOT_MONITORED}
        </p>
      </div>
      <div className="pt-medsafety__calls">
        <a className="ui-btn ui-btn--secondary ui-btn--lg" href={`tel:${CRISIS_LINE.tel}`}>
          <PhoneCall size={20} aria-hidden="true" />
          <span>{CRISIS_LINE.telLabel}</span>
        </a>
      </div>
    </div>
  );
}
