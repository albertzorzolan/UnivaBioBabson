// Demo-context component: the compact "Fictional demo data" chip.
import { FlaskConical } from "lucide-react";
import { cx } from "../cx";
import { Tooltip } from "./Display";

/** Persistent but compact reminder that every record is fictional (SPEC §8). Tap/hover for details. */
export function DemoDataChip({ align = "end", className }: { align?: "start" | "end" | "center"; className?: string }) {
  return (
    <Tooltip
      align={align}
      className={cx("ui-demo-chip", className)}
      triggerClassName="ui-demo-chip__trigger"
      content={
        <>
          Margaret, Alex and every record here are invented for this demo. Please don’t enter real health information —
          it stays in this browser only.
        </>
      }
    >
      <FlaskConical size={14} aria-hidden="true" />
      <span>Fictional demo data</span>
    </Tooltip>
  );
}
