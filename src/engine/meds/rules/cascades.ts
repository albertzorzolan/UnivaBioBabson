// Prescribing cascades: a "marker" medicine started after an "index" medicine whose known effect the marker
// may be treating (e.g. amlodipine -> ankle swelling -> furosemide).
//
// A cascade is reported when
//   - the marker is active and the index is active, or was stopped within CASCADE_STOPPED_INDEX_DAYS and was
//     still being taken when the marker started;
//   - the index started strictly before the marker (same-day starts: order unknown, not reported);
//   - the marker started within the rule's windowDays after the index (any time after when windowDays is null),
//     OR the marker's "reason" mentions the adverse effect (rule.reasonKeywords).
// Only active medicines appear in medIds: a stopped index is named in the text, not linked.

import type { CascadeRule } from "../../../kb/types";
import { daysBetween } from "../../../model/dates";
import type { Draft, MedInfo, ReviewContext } from "../context";
import { capitalize, fill, firstSentences, guardLanguage, period, plural, shortDate, tidy } from "../text";
import { mentions } from "./beers";

function reasonQuote(reason: string): string {
  const r = reason.replace(/[\s\u0000-\u001f]+/g, " ").trim().replace(/[.]+$/, "");
  if (!r) return "";
  const shortened = r.length > 80 ? `${r.slice(0, 79).trimEnd()}…` : r;
  const lowered = /^[A-Z][a-z]/.test(shortened) ? shortened[0].toLowerCase() + shortened.slice(1) : shortened;
  return `“${lowered}”`;
}

/** "ankle swelling (peripheral edema)" -> "Ankle swelling (peripheral edema)". */
function effectPhrase(rule: CascadeRule): string {
  return (rule.adverseEffect ?? "").trim() || "this effect";
}

export function cascadeFindings(ctx: ReviewContext): Draft[] {
  const out: Draft[] = [];
  const indexPool: { m: MedInfo; stopped: boolean }[] = [
    ...ctx.meds.map((m) => ({ m, stopped: false })),
    ...ctx.recentlyStopped.map((m) => ({ m, stopped: true })),
  ];
  for (const rule of ctx.ix.kb.cascades ?? []) {
    if (!rule || !rule.index || !rule.marker) continue;
    for (const marker of ctx.meds) {
      const markerIngredients = ctx.ix.matching(marker.ingredients, rule.marker);
      if (!markerIngredients.length) continue;
      for (const { m: index, stopped } of indexPool) {
        if (index.med.id === marker.med.id) continue;
        const indexIngredients = ctx.ix.matching(index.ingredients, rule.index);
        if (!indexIngredients.length) continue;
        if (!(index.med.startDate < marker.med.startDate)) continue;
        if (stopped && index.med.endDate && index.med.endDate < marker.med.startDate) continue;
        const gap = daysBetween(index.med.startDate, marker.med.startDate);
        const inWindow = rule.windowDays === null || rule.windowDays === undefined || gap <= rule.windowDays;
        const reasonMatch = (rule.reasonKeywords ?? []).length > 0 && mentions(marker.med.reason ?? "", rule.reasonKeywords);
        if (!inWindow && !reasonMatch) continue;
        out.push(draft(ctx, rule, index, marker, gap, stopped, indexIngredients));
      }
    }
  }
  return out;
}

function draft(
  ctx: ReviewContext,
  rule: CascadeRule,
  index: MedInfo,
  marker: MedInfo,
  gap: number,
  stopped: boolean,
  indexIngredients: string[],
): Draft {
  const reason = reasonQuote(marker.med.reason ?? "");
  const indexDisplay = indexIngredients.map((id) => ctx.ix.drug(id)?.display ?? id).join(" and ").toLowerCase();
  const stoppedNote = stopped && index.med.endDate ? ` (stopped on ${shortDate(index.med.endDate)})` : "";
  const timing =
    `${marker.name} was started on ${shortDate(marker.med.startDate)}, ${plural(gap, "day")} after ${index.name}${stoppedNote}` +
    (reason ? `, for ${reason}.` : ".");
  const effect = capitalize(effectPhrase(rule));
  const known = `${effect} is a known possible effect of ${indexDisplay}-type medicines; a new medicine started for an effect like this is called a prescribing cascade.`;
  const vars: Record<string, string> = {
    index: index.name,
    marker: marker.name,
    med: marker.name,
    indexDate: shortDate(index.med.startDate),
    markerDate: shortDate(marker.med.startDate),
    date: shortDate(marker.med.startDate),
    days: String(gap),
    reason: reason.replace(/[“”]/g, ""),
    effect: effectPhrase(rule),
    name: ctx.person,
    person: ctx.person,
  };
  const kbClin = guardLanguage(fill(rule.clinician, vars));
  const clinician = tidy(
    `${index.name} started ${shortDate(index.med.startDate)}${stoppedNote}; ${marker.name} started ${shortDate(marker.med.startDate)} (+${gap} days)${reason ? ` for ${reason}` : ""}. ${firstSentences(kbClin, 1)}`,
  );
  const kbQ = guardLanguage(fill(rule.question, vars)).trim();
  const question =
    kbQ ||
    (stopped
      ? `${index.name} has been stopped; is ${marker.name} still needed?`
      : `Could the ${effectPhrase(rule)} be linked to ${index.name}, and if so, is ${marker.name} still the best approach?`);
  const medIds = stopped ? [marker.med.id] : [index.med.id, marker.med.id];
  return {
    ruleId: rule.id,
    category: "prescribing_cascade",
    medIds,
    title: guardLanguage(fill(rule.title, vars)) || `${index.name} then ${marker.name}: possible prescribing cascade`,
    plain: `${timing} ${known}`,
    clinician: period(clinician),
    question,
    sourceIds: rule.sourceId ? [rule.sourceId] : [],
    evidenceGrade: null,
    symptomQuestion: false,
  };
}
