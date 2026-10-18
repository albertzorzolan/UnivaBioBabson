// The static "safety-net" line: the family does not have to wait for the booked visit to reach the clinician.
//
// Static on purpose (docs/REGULATORY.md §2.4): the words never depend on what was recorded — not on a fall in the
// diary, not on a signal, not on a finding — so Kinwise is not triaging anyone. It names three everyday reasons to
// get in touch between visits (a fall, a new medicine, new confusion) and who to contact. It avoids "urgent" and
// "immediately" (that would be triage) and says nothing about starting, stopping or changing a medicine.
//
// It then names, in one fixed sentence (EMERGENCY_LINE), the few situations where waiting for a call back is wrong:
// confusion that comes on suddenly in an older adult can be delirium or a stroke, a fall with a head injury can mean
// bleeding inside the skull (more likely on blood thinners), and new or severe trouble breathing can be a 911 matter. That
// sentence is general public guidance, the same for every person and every record (it is not built from a diary
// answer), so it still does not triage anyone; "can be" keeps it from judging any one person's symptoms. Without it,
// "new confusion" alone read as a routine reason to phone the doctor even when it is sudden.
//
// Used by the visit brief footer (template.ts briefSafetyLines → BriefDocument) and the "Need help now?" dialog.
// The dialog shows only the routine part (SAFETY_NET_FOR_ANYONE): it already prints EMERGENCY_LINE under its 911
// row (src/app/Help.tsx), and the same sentence twice in one dialog would read as a mistake.

import { oneLine } from "./shared";

/** The static emergency sentence that ends every safety-net line. Never depends on the record. */
export const EMERGENCY_LINE = "Sudden confusion, a fall with a head injury, or trouble breathing can be an emergency: call 911.";

function lineFor(whose: string, withEmergency: boolean): string {
  const routine = `You don't have to wait for the visit: ${whose} doctor or pharmacist can be contacted at any time about a fall, a new medicine or new confusion.`;
  return withEmergency ? `${routine} ${EMERGENCY_LINE}` : routine;
}

/**
 * "You don't have to wait for the visit: Margaret's doctor or pharmacist can be contacted at any time about a fall,
 * a new medicine or new confusion. Sudden confusion, a fall with a head injury, or trouble breathing can be an
 * emergency: call 911." With no name (an emptied record): "… your relative's doctor or pharmacist …".
 */
export function safetyNetLine(name: string): string {
  const n = oneLine(name);
  return lineFor(n && !/^your relative$/i.test(n) ? `${n}'s` : "your relative's", true);
}

/**
 * The routine part of the line for the Help dialog, which Margaret and Alex both open, so it names nobody. It leaves
 * out EMERGENCY_LINE because the dialog's 911 row already shows it (src/app/Help.tsx).
 */
export const SAFETY_NET_FOR_ANYONE = lineFor("the", false);
