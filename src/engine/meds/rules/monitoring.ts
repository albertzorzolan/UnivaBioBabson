// "What to watch for": medicines in the classes behind most emergency visits for medication harm in older
// adults (anticoagulants, insulin and sulfonylureas, antiplatelets, opioids, digoxin; Budnitz 2011/2021,
// Shehab 2016). These are not problem flags: the text names what is worth noticing, never urgency.

import type { ConceptId, MetricKey } from "../../../model/types";
import type { Draft, ReviewContext } from "../context";
import { namePart } from "../context";
import { fill, firstSentences, guardLanguage, listJoin, period, shortDate, tidy } from "../text";

const METRIC_KEYS: ReadonlySet<string> = new Set<MetricKey>([
  "dizziness",
  "drowsiness",
  "confusion",
  "fall",
  "nearFall",
  "swelling",
  "energy",
  "sleep",
  "appetiteWorse",
]);

const CONCEPT_PHRASE: Partial<Record<ConceptId, string>> = {
  bleeding_or_bruising: "bleeding or bruising",
  black_stools: "black stools",
  shakiness_or_sweating: "shakiness or sweating",
  tremor: "shakiness or trembling",
  nausea: "nausea",
  constipation: "constipation",
  blurred_vision: "blurred vision",
  headache: "headache",
  dry_mouth: "dry mouth",
};

export function monitoringFindings(ctx: ReviewContext): Draft[] {
  const out: Draft[] = [];
  for (const rule of ctx.ix.kb.monitoring ?? []) {
    if (!rule || !rule.appliesTo) continue;
    const hits = ctx.meds
      .map((m) => ({ m, ids: ctx.ix.matching(m.ingredients, rule.appliesTo) }))
      .filter((x) => x.ids.length > 0);
    if (!hits.length) continue;
    const names = listJoin(hits.map((h) => namePart(ctx, h.m, h.ids)));
    const vars = { med: names, meds: names, name: ctx.person, person: ctx.person };
    const watch = (rule.watchFor ?? []).filter((w) => typeof w === "string" && w.trim());
    const kbPlain = firstSentences(guardLanguage(fill(rule.plain, vars)), 1);
    const watchLine = watch.length ? `Worth watching for: ${listJoin(watch)}.` : "";

    // Coded diary concepts on the watch-list (e.g. bruising) recorded in the last 30 days, named factually.
    const recorded: string[] = [];
    for (const c of rule.relatedConcepts ?? []) {
      if (METRIC_KEYS.has(c)) continue;
      const dates = ctx.diary.concepts.get(c as ConceptId) ?? [];
      if (dates.length) recorded.push(`${CONCEPT_PHRASE[c as ConceptId] ?? c.replace(/_/g, " ")} (${dates.map(shortDate).join(", ")})`);
    }
    const recordedLine = recorded.length ? `The diary noted ${listJoin(recorded)} in the last 30 days.` : "";
    const lead = kbPlain || `${names} ${hits.length > 1 ? "are medicines" : "is a medicine"} where some effects are worth watching for.`;
    out.push({
      ruleId: rule.id,
      category: "monitoring",
      medIds: hits.map((h) => h.m.med.id),
      title: guardLanguage(fill(rule.title, vars)) || "What to watch for",
      plain: tidy(`${period(lead)} ${recordedLine || watchLine}`),
      clinician: period(firstSentences(guardLanguage(fill(rule.clinician, vars)), 2) || `Monitoring: ${listJoin(watch)}.`),
      question: guardLanguage(fill(rule.question, vars)).trim() || `What should we watch for with ${names}, and when should we call?`,
      sourceIds: rule.sourceId ? [rule.sourceId] : [],
      evidenceGrade: null,
      extraMetrics: (rule.relatedConcepts ?? []).filter((c): c is MetricKey => METRIC_KEYS.has(c)),
      symptomQuestion: false,
    });
  }
  return out;
}
