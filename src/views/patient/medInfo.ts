// Patient-voice "Mention to your doctor if you notice" lists for My medicines (/p/meds).
// Two KB sources feed it: the recognised diary-metric effects of each ingredient (drug labels), and the
// "what to watch for" lists of KB.monitoring rules (blood thinners, insulin and sulfonylureas, opioids,
// antiplatelets, digoxin), matched with the same transitive selector the caregiver review uses.
// Information only: no flags, urgency or triage words.
import type { Medication, MetricKey } from "../../model/types";
import type { KbSource } from "../../kb/types";
import { KB, getDrug, getSource, selectorMatches } from "../../kb";

/** Patient-voice phrases for KB effects. Falls and near-falls share one phrase. */
export const EFFECT_PHRASE: Record<MetricKey, string> = {
  dizziness: "feeling dizzy or light-headed",
  drowsiness: "feeling sleepy during the day",
  confusion: "feeling confused or foggy",
  fall: "losing your balance or falling",
  nearFall: "losing your balance or falling",
  swelling: "swollen ankles or feet",
  appetiteWorse: "not feeling like eating",
  energy: "feeling unusually tired",
  sleep: "changes in your sleep",
};

/** The KB source that backs drug effect lists (drug labels), if the knowledge base names one. */
export function effectsSource(): KbSource | null {
  const sources = Array.isArray(KB.sources) ? KB.sources : [];
  return (
    sources.find((s) => /label|dailymed|medlineplus|fda/i.test(`${s.id} ${s.short}`)) ??
    sources.find((s) => /effect|adverse|side/i.test(s.usedFor ?? "")) ??
    null
  );
}

export interface MedInfo {
  med: Medication;
  generic: string | null;
  usedFor: string | null;
  /** Things to mention, watch-for items first, deduplicated. */
  phrases: string[];
  /** Sources behind `phrases`, deduplicated by id (label effects first, then monitoring rules). */
  sources: KbSource[];
  known: boolean;
}

export function describeMed(med: Medication, labelSource: KbSource | null = effectsSource()): MedInfo {
  const ingredientIds = Array.isArray(med.ingredientIds) ? med.ingredientIds : [];
  const drugs = ingredientIds.map((id) => getDrug(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));

  // Monitoring rules ("what to watch for") that apply to any ingredient, directly or through its classes.
  const rules = (Array.isArray(KB.monitoring) ? KB.monitoring : []).filter(
    (r) => r && r.appliesTo && selectorMatches(ingredientIds, r.appliesTo),
  );
  // Diary metrics a matched watch-list already covers in its own words (e.g. "dizziness", "new confusion").
  const covered = new Set<string>();
  for (const r of rules) for (const c of Array.isArray(r.relatedConcepts) ? r.relatedConcepts : []) covered.add(c);
  if (covered.has("fall")) covered.add("nearFall");

  const label: string[] = [];
  for (const d of drugs)
    for (const e of Array.isArray(d.effects) ? d.effects : []) if (EFFECT_PHRASE[e] && !covered.has(e)) label.push(EFFECT_PHRASE[e]);
  const watch: string[] = [];
  for (const r of rules) for (const w of Array.isArray(r.watchFor) ? r.watchFor : []) if (typeof w === "string") watch.push(w);
  // Watch-for items lead (they name the signs behind most medication-harm visits), then label effects.
  const phrases = dedupe([...watch, ...label]);

  const sources: KbSource[] = [];
  const cite = (s: KbSource | null | undefined) => {
    if (s && !sources.some((x) => x.id === s.id)) sources.push(s);
  };
  if (label.length > 0) cite(labelSource);
  for (const r of rules) if ((r.watchFor ?? []).some((w) => typeof w === "string" && w.trim())) cite(getSource(r.sourceId));

  const names = drugs.map((d) => d.display);
  const generic = names.length > 0 && names.join(" + ").toLowerCase() !== med.name.toLowerCase() ? names.join(" + ") : null;
  const usedFor = drugs.length === 1 && drugs[0].usedFor && drugs[0].usedFor !== "test" ? drugs[0].usedFor : null;
  return { med, generic, usedFor, phrases, sources, known: drugs.length > 0 };
}

/** Trimmed, non-empty, first occurrence wins (case-insensitive). */
function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = x.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

/** "a, b or c"; with a serial comma when an item has its own commas ("pink, red or brown urine, or a fall"). */
export function joinWords(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  const serial = xs.length > 2 && xs.some((x) => x.includes(",")) ? "," : "";
  return `${xs.slice(0, -1).join(", ")}${serial} or ${xs[xs.length - 1]}`;
}
