// The static 911 line in the patient check-in, shown when her words describe one of the app's listed emergency
// signs ("I had chest pain and my left arm is numb and I can't catch my breath").
//
// Static on purpose, like the Poison Control line beside medicine notes (MedSafetyLine.tsx): every word is the Help
// dialog's 911 row (src/app/Help.tsx EMERGENCY_CALL and EMERGENCY_SIGNS) plus its "not monitored" note, so the line
// never names her symptom, never says it IS an emergency and gives no advice of its own. The only thing that depends
// on her words is whether the line is shown (engine/safety/emergencySigns.ts describesEmergencySign, which also
// documents where the sign list comes from and how "no chest pain" or "chest pain last year" stay quiet).
//
// role="note", not "alert": it should not interrupt a screen reader mid-sentence. It sits at the top of "Here's what
// I heard", right after the heading that takes focus when the reading finishes, so it is the first thing read next.
import { PhoneCall, Siren } from "lucide-react";
import { EMERGENCY_CALL, EMERGENCY_NUMBER, NOT_MONITORED } from "../../app/Help";
import { EMERGENCY_SIGNS } from "../../engine/safety/emergencySigns";
import { cx } from "../../ui";
import "./MedSafetyLine.css";

export { describesEmergencySign } from "../../engine/safety/emergencySigns";

export function EmergencyLine({ className }: { className?: string }) {
  return (
    <div role="note" className={cx("pt-medsafety pt-emergency", className)}>
      <span className="pt-medsafety__icon" aria-hidden="true">
        <Siren size={24} />
      </span>
      <div className="pt-medsafety__text pt-emergency__text">
        <p className="pt-emergency__title">{EMERGENCY_CALL.title}.</p>
        <p>{EMERGENCY_SIGNS}</p>
        <p>
          {EMERGENCY_CALL.detail} {NOT_MONITORED}
        </p>
      </div>
      <div className="pt-medsafety__calls">
        <a className="ui-btn ui-btn--secondary ui-btn--lg" href={`tel:${EMERGENCY_NUMBER.tel}`}>
          <PhoneCall size={20} aria-hidden="true" />
          <span>{EMERGENCY_CALL.telLabel}</span>
        </a>
      </div>
    </div>
  );
}
