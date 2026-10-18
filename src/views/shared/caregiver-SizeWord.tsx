// The size word for one flagged before/after comparison ("Large difference"), shared by the caregiver Overview,
// Timeline and Medication review so all three read the same. When the runs check does not back the size word
// (Signal.runsCheck.passed === false), a plain qualifier sits right under it: "maybe a bad stretch". The qualifier
// is part of the same element, so a screen reader hears "Large difference, maybe a bad stretch" as one label.
// RUNS_QUALIFIER_NOTE in "How reliable is this?" says what it means; the runs check's p-value is there too.
import type { ReactNode } from "react";
import type { Signal } from "../../model/types";
import { Badge, cx, type Tone } from "../../ui";
import { sizeWords } from "./caregiver-insights";
import "./caregiver-size-word.css";

export function SizeWord({
  strength,
  runsCheck,
  tone = "neutral",
  icon,
  label,
  className,
}: {
  strength: Signal["strength"];
  runsCheck?: { passed: boolean } | null;
  tone?: Tone;
  icon?: ReactNode;
  /** Badge text in place of the short size word (the Review card uses the longer STRENGTH_SIZE_LABEL). */
  label?: string;
  className?: string;
}) {
  const { word, qualifier } = sizeWords(strength, runsCheck);
  return (
    <span className={cx("cg-size", qualifier && "has-qualifier", icon != null && "has-icon", className)}>
      <Badge size="sm" tone={tone} icon={icon} className="cg-size__badge">
        {label ?? word}
      </Badge>
      {qualifier && (
        <span className="cg-size__qualifier">
          <span className="ui-visually-hidden">, </span>
          {qualifier}
        </span>
      )}
    </span>
  );
}
