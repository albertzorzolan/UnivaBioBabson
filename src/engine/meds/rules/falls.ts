// Fall-risk-increasing drugs (FRIDs): one combined finding listing every active medicine in a FRID class
// (CDC STEADI / STEADI-Rx, EuGMS STOPPFall, AGS Beers 2023), emphasised when the diary recorded falls,
// near-falls or dizziness in the last 30 days. FRID status is a population-level association, so the text
// describes timing and counts only.

import type { Draft, MedInfo, ReviewContext } from "../context";
import { listJoin, plural, possessive, shortDate } from "../text";

export interface FallRiskResult {
  medIds: string[];
  draft: Draft | null;
}

export function fallRisk(ctx: ReviewContext): FallRiskResult {
  const frids: MedInfo[] = [];
  const sourceIds: string[] = [];
  const classNames: string[] = [];
  for (const m of ctx.meds) {
    let hit = false;
    for (const id of m.ingredients) {
      for (const f of ctx.ix.fridsOf(id)) {
        hit = true;
        if (f.sourceId && !sourceIds.includes(f.sourceId)) sourceIds.push(f.sourceId);
        if (f.display && !classNames.includes(f.display)) classNames.push(f.display);
      }
    }
    if (hit) frids.push(m);
  }
  if (frids.length === 0) return { medIds: [], draft: null };

  const since = ctx.diary.recentFrom;
  const falls = ctx.diary.fallDates.filter((d) => d >= since);
  const near = ctx.diary.nearFallDates.filter((d) => d >= since);
  const dizzy = ctx.diary.positives.get("dizziness") ?? [];
  // Every count carries its denominator (SPEC §3): answered days in the same 30-day window.
  const fallAnswered = ctx.diary.answered.get("fall") ?? 0;
  const nearAnswered = ctx.diary.answered.get("nearFall") ?? 0;
  const dizzyAnswered = ctx.diary.answered.get("dizziness") ?? 0;
  const onDays = (n: number) => `on ${plural(n, "answered day")}`;
  const fallWords = (dated: boolean) => {
    const f = falls.length ? `${plural(falls.length, "fall")}${dated ? ` (${falls.map(shortDate).join(", ")})` : ""}` : "";
    const n = near.length ? `${plural(near.length, "near-fall")}${dated ? ` (${near.map(shortDate).join(", ")})` : ""}` : "";
    if (f && n && fallAnswered === nearAnswered) return [`${f} and ${n} ${onDays(fallAnswered)}`];
    return [f ? `${f} ${onDays(fallAnswered)}` : "", n ? `${n} ${onDays(nearAnswered)}` : ""].filter(Boolean);
  };
  const dizzyWords = dizzy.length ? [`dizziness on ${dizzy.length} of ${plural(dizzyAnswered, "answered day")}`] : [];
  const events = [...fallWords(true), ...dizzyWords];
  const bareEvents = [...fallWords(false), ...dizzyWords];
  /** "A, and B" / "A, B, and C": the comma keeps "1 fall and 2 near-falls on 26 answered days" in one piece. */
  const commaJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);
  const emphasised = events.length > 0;

  const names = listJoin(frids.map((m) => m.name));
  const shorts = sourceIds.map((id) => ctx.ix.source(id)?.short).filter((s): s is string => !!s);
  const lead =
    frids.length === 1
      ? `${names} is on published lists of medicines linked to falls in older adults${shorts.length ? ` (${listJoin(shorts)})` : ""}.`
      : `${frids.length} of ${possessive(ctx.person)} medicines are on published lists of medicines linked to falls in older adults${shorts.length ? ` (${listJoin(shorts)})` : ""}: ${names}.`;
  const diaryLine = emphasised ? ` In the last 30 days the diary recorded ${commaJoin(events)}.` : "";
  const clinClasses = classNames.length ? ` (${classNames.join("; ")})` : "";
  return {
    medIds: frids.map((m) => m.med.id),
    draft: {
      ruleId: "fall-risk",
      category: "fall_risk",
      medIds: frids.map((m) => m.med.id),
      title: emphasised ? `Medicines linked to falls, with falls or dizziness recorded (${frids.length})` : `Medicines linked to falls (${frids.length})`,
      plain: `${lead}${diaryLine}`,
      clinician: `${plural(frids.length, "fall-risk-increasing drug")} (FRIDs)${clinClasses}.${emphasised ? ` Diary, last 30 days: ${events.join("; ")}.` : ""}`,
      question: emphasised
        ? `With ${commaJoin(bareEvents)} in the last 30 days, could any of these medicines be contributing, and could the list be reviewed for fall risk?`
        : `Could these medicines be reviewed for fall risk, for example as part of a fall-risk check (CDC STEADI)?`,
      sourceIds,
      evidenceGrade: null,
      symptomQuestion: false,
    },
  };
}
