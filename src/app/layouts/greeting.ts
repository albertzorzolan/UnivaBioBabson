// The patient's greeting words, shared by the patient shell ("Hello, Margaret") and Today's subtitle. The name may
// be empty (a record emptied in Settings, or a profile without a preferred name): then the words simply leave it out.

/** "Hello, Margaret", or "Hello" without a name. */
export function helloLine(name: string): string {
  const n = name.trim();
  return n ? `Hello, ${n}` : "Hello";
}

/** Today's subtitle: an invitation before any check-in this week, then thanks for the days she has checked in. */
export function readyLine(daysCheckedIn: number, name: string): string {
  if (daysCheckedIn > 0) return `You’ve checked in on ${daysCheckedIn} of the last 7 days — thank you.`;
  const n = name.trim();
  return n ? `Whenever you’re ready, ${n} — a few words are enough.` : "Whenever you’re ready — a few words are enough.";
}
