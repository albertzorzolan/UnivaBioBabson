// The static "safety-net" line: the family does not have to wait for the booked visit to reach the clinician.
//
// Static on purpose (docs/REGULATORY.md §2.4): the words never depend on what was recorded — not on a fall in the
// diary, not on a signal, not on a finding — so Kinwise is not triaging anyone. It names three everyday reasons to
// get in touch between visits (a fall, a new medicine, new confusion) and who to contact. It avoids "urgent" and
// "immediately" (that would be triage) and says nothing about starting, stopping or changing a medicine.
// Emergencies stay with SAFETY_LINE ("call 911").
//
// Used by the visit brief footer (template.ts briefSafetyLines → BriefDocument) and the "Need help now?" dialog.

import { oneLine } from "./shared";

function lineFor(whose: string): string {
  return `You don't have to wait for the visit: ${whose} doctor or pharmacist can be contacted at any time about a fall, a new medicine or new confusion.`;
}

/**
 * "You don't have to wait for the visit: Margaret's doctor or pharmacist can be contacted at any time about a fall,
 * a new medicine or new confusion." With no name (an emptied record): "… your relative's doctor or pharmacist …".
 */
export function safetyNetLine(name: string): string {
  const n = oneLine(name);
  return lineFor(n && !/^your relative$/i.test(n) ? `${n}'s` : "your relative's");
}

/** The same line for the Help dialog, which Margaret and Alex both open, so it names nobody. */
export const SAFETY_NET_FOR_ANYONE = lineFor("the");
