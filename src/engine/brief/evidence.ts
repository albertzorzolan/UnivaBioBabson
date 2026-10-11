// Evidence package (SPEC §6.5): every fact the brief, the on-device AI and Q&A may restate, as one code-rendered
// sentence per item with a stable id.
//
//   fact:*      coverage, falls/near-falls since the most recent medicine start, falls/near-falls in the period,
//               check-in coverage around each compared medicine change, ACB total, per-item counts with
//               answered-day denominators, medicine count, conditions, latest check-in (in this order of importance)
//   sig:*       one per timeline signal: its code-rendered sentence + a fixed "what was recorded" caveat
//   find:<key>  one per review finding (not dismissed): title + plain explanation + source short name
//   med:<id>    one per active medicine (and any stopped during the period)
//   concern:<id> pinned notes (visit concerns, in the writer's own words, quoted and attributed)
//   note:<id>   other notes written during the period; note:question:<id> for saved visit questions
//   entry:<id>  one per check-in: date, answers in words, quoted story excerpt (≤160 chars)
//
// Size bound and selection (documented because it decides what the AI can see):
//   The package aims to stay under EVIDENCE_LIMITS.maxChars (8,000) characters of item text. Facts, concerns,
//   up to 8 signals (strongest first), up to 12 findings (linked to recorded symptoms first, then SPEC §6.2
//   category order), medicines, up to 4 notes (newest first) and up to 5 saved questions are always included.
//   Check-in entries fill the remaining budget: days with a recorded fall or near-fall first, then the most
//   recent days; at least 3 entries are kept whatever the budget. When some entries are left out, a fact says so
//   ("fact:entries"); all counts are computed from every check-in in the period, never from the listed ones.

import type {
  CheckIn,
  EvidenceItem,
  EvidenceKind,
  EvidencePackage,
  Finding,
  ISODate,
  ISODateTime,
  Medication,
  MedReview,
  MetricKey,
  Note,
  Signal,
  StoreData,
  TimelineAnalysis,
} from "../../model/types";
import { addDays, dateRange, daysBetween, isValidDate } from "../../model/dates";
import { stableHash } from "../../model/ids";
import { getMetric, latestCheckInPerDate, metricValue, windowStatFromDays } from "../timeline/metrics";
import { eventWindows, eventsForMed } from "../timeline/windows";
import type { EventWindows, MedChange } from "../timeline/windows";
import {
  CATEGORY_ORDER,
  CONCEPT_LABEL,
  CONDITION_LABEL,
  DEFAULT_KB,
  answersInWords,
  caregiverLabel,
  dateListWords,
  dateWords,
  decisionFor,
  excerpt,
  howTaken,
  isActiveOn,
  isSelfSelected,
  joinAnd,
  medName,
  medNameWithIngredients,
  oneLine,
  patientFirstName,
  plural,
  quotable,
  sentence,
  sourceShorts,
} from "./shared";
import type { BriefKb } from "./shared";

// ---------------------------------------------------------------------------
// Public types

/** Structured pointers behind an evidence item, for "Show the records" drawers and Q&A. Not shown to the AI. */
export interface EvidenceData {
  checkInIds?: string[];
  medIds?: string[];
  noteIds?: string[];
  findingKey?: string;
  signalId?: string;
  metric?: MetricKey;
  from?: ISODate;
  to?: ISODate;
  /** Days with the item recorded (boolean metrics) or the sum of ratings (scales). */
  positive?: number;
  answered?: number;
  dates?: ISODate[];
}

/** An evidence item with its structured pointers (SPEC §6.5 `{ id, kind, text, data }`). */
export interface BriefEvidenceItem extends EvidenceItem {
  data?: EvidenceData;
}

export interface BuildEvidenceInput {
  data: StoreData;
  from: ISODate;
  to: ISODate;
  review: MedReview;
  timeline: TimelineAnalysis;
  /** Pinned notes to include as visit concerns; omitted = every pinned note. */
  includedConcernIds?: string[];
  /** Timestamp recorded on the package; defaults to data.updatedAt (pure engines never read the clock). */
  generatedAt?: ISODateTime;
  kb?: BriefKb;
  /** Character budget for item text (default EVIDENCE_LIMITS.maxChars). */
  maxChars?: number;
}

export const EVIDENCE_LIMITS = {
  maxChars: 8000,
  maxSignals: 8,
  maxFindings: 12,
  maxNotes: 4,
  maxSavedQuestions: 5,
  minEntries: 3,
  storyExcerptChars: 160,
  noteChars: 320,
} as const;

/**
 * Appended to every signal item. Describes, never explains. (Deliberately avoids the word "caused": the claim
 * checker in verify.ts rejects it, and the on-device model is told never to use it, so evidence must not model it.)
 */
export const SIGNAL_EVIDENCE_CAVEAT = "This shows a change in what was recorded; it does not show why.";

const PRODUCT_REF = "Kinwise's reference set";

// ---------------------------------------------------------------------------
// Item renderers (exported so Q&A renders identical text for the same record)

const DIARY_ITEMS: MetricKey[] = ["dizziness", "drowsiness", "confusion", "swelling", "appetiteWorse", "energy", "sleep"];

/** "Dizziness was recorded on 11 of 37 answered days from Aug 27 through Oct 10." */
export function metricCountText(days: CheckIn[], metric: MetricKey, from: ISODate, to: ISODate): { text: string; data: EvidenceData } {
  const def = getMetric(metric);
  const stat = windowStatFromDays(days, metric, from, to);
  const span = from === to ? `on ${dateWords(from, to)}` : `from ${dateWords(from, to)} through ${dateWords(to, to)}`;
  const checkInIds = days
    .filter((c) => c.date >= from && c.date <= to && metricValue(c, metric) !== null)
    .map((c) => c.id);
  const dates =
    def.kind === "boolean" ? days.filter((c) => c.date >= from && c.date <= to && metricValue(c, metric) === 1).map((c) => c.date) : [];
  const data: EvidenceData = { metric, from, to, positive: stat.positive, answered: stat.answered, dates, checkInIds };
  if (stat.answered === 0) {
    const noun = metric === "appetiteWorse" ? "appetite" : def.label.toLowerCase();
    return { text: `The ${noun} question was not answered ${span}.`, data };
  }
  if (def.kind === "scale") {
    return {
      text: `${def.subject} averaged ${stat.value.toFixed(1)} out of 5 on ${stat.answered} answered ${plural(stat.answered, "day")} ${span}.`,
      data,
    };
  }
  return {
    text: `${def.subject} was recorded on ${stat.positive} of ${stat.answered} answered ${plural(stat.answered, "day")} ${span}.`,
    data,
  };
}

/** "Check-ins were recorded on 38 of 45 days from Aug 27 through Oct 10." */
export function coverageText(days: CheckIn[], from: ISODate, to: ISODate): { text: string; data: EvidenceData } {
  const inRange = days.filter((c) => c.date >= from && c.date <= to);
  const total = daysBetween(from, to) + 1;
  const span = from === to ? `on ${dateWords(from, to)}` : `from ${dateWords(from, to)} through ${dateWords(to, to)}`;
  const text =
    from === to
      ? inRange.length
        ? `A check-in was recorded on ${dateWords(from, to)}.`
        : `No check-in was recorded on ${dateWords(from, to)}.`
      : `Check-ins were recorded on ${inRange.length} of ${total} days ${span}.`;
  return {
    text,
    data: { from, to, positive: inRange.length, answered: total, checkInIds: inRange.map((c) => c.id), dates: inRange.map((c) => c.date) },
  };
}

/** Falls and near-falls in a range, with answered-day denominators and dates. */
export function fallsText(days: CheckIn[], from: ISODate, to: ISODate): { text: string; data: EvidenceData } {
  const span = from === to ? `on ${dateWords(from, to)}` : `from ${dateWords(from, to)} through ${dateWords(to, to)}`;
  const part = (metric: "fall" | "nearFall") => {
    const answered = days.filter((c) => c.date >= from && c.date <= to && metricValue(c, metric) !== null);
    const dates = answered.filter((c) => metricValue(c, metric) === 1).map((c) => c.date);
    return { answered: answered.length, dates, ids: answered.filter((c) => metricValue(c, metric) === 1).map((c) => c.id) };
  };
  const f = part("fall");
  const n = part("nearFall");
  const recorded = (p: typeof f, many: string) => `${many} on ${p.dates.length} of ${p.answered} answered days (${dateListWords(p.dates, to)})`;
  const none = (p: typeof f, one: string, many: string) =>
    p.answered ? `no ${many} were recorded on ${p.answered} answered ${plural(p.answered, "day")}` : `the ${one} question was not answered`;
  let text: string;
  if (f.answered === 0 && n.answered === 0) {
    text = `The fall and near-fall questions were not answered ${span}.`;
  } else if (f.dates.length === 0 && n.dates.length === 0) {
    text = `No falls or near-falls were recorded ${span} (fall question answered on ${f.answered} ${plural(f.answered, "day")}, near-fall question on ${n.answered} ${plural(n.answered, "day")}).`;
  } else if (f.dates.length > 0 && n.dates.length > 0) {
    text = `Falls were recorded on ${f.dates.length} of ${f.answered} answered days (${dateListWords(f.dates, to)}) and ${recorded(n, "near-falls")} ${span}.`;
  } else if (f.dates.length > 0) {
    text = `Falls were recorded on ${f.dates.length} of ${f.answered} answered days (${dateListWords(f.dates, to)}) ${span}; ${none(n, "near-fall", "near-falls")}.`;
  } else {
    text = `Near-falls were recorded on ${n.dates.length} of ${n.answered} answered days (${dateListWords(n.dates, to)}) ${span}; ${none(f, "fall", "falls")}.`;
  }
  const all = [...f.dates, ...n.dates].sort();
  return { text, data: { from, to, dates: all, checkInIds: [...f.ids, ...n.ids], positive: f.dates.length + n.dates.length } };
}

/** "1 fall (Oct 5) and 2 near-falls (Sep 26, Sep 29)" / "no falls or near-falls" for one window. */
function sentinelList(days: CheckIn[], from: ISODate, to: ISODate, ref: ISODate): { text: string; answered: number; dates: ISODate[]; ids: string[] } {
  const inWin = days.filter((c) => c.date >= from && c.date <= to);
  const answered = inWin.filter((c) => metricValue(c, "fall") !== null || metricValue(c, "nearFall") !== null).length;
  const falls = inWin.filter((c) => metricValue(c, "fall") === 1);
  const nears = inWin.filter((c) => metricValue(c, "nearFall") === 1);
  const parts: string[] = [];
  if (falls.length) parts.push(`${falls.length} ${plural(falls.length, "fall")} (${dateListWords(falls.map((c) => c.date), ref)})`);
  if (nears.length) parts.push(`${nears.length} ${plural(nears.length, "near-fall")} (${dateListWords(nears.map((c) => c.date), ref)})`);
  return {
    text: parts.length ? parts.join(" and ") : "no falls or near-falls",
    answered,
    dates: [...falls, ...nears].map((c) => c.date).sort(),
    ids: [...falls, ...nears].map((c) => c.id),
  };
}

/**
 * Falls and near-falls since a medicine was started, compared with the 21 days before, with answered-day
 * denominators: "From Sep 24, when Lorazepam (Ativan) was started, through Oct 10: 1 fall (Oct 5) and 2 near-falls
 * (Sep 26, Sep 29) were recorded on 14 answered days, compared with 1 near-fall (Sep 10) on 20 answered days in the
 * 21 days before."
 */
export function fallsSinceStartText(days: CheckIn[], med: Medication, today: ISODate): { text: string; data: EvidenceData } {
  const change: MedChange = { medicationId: med.id, kind: "started", date: med.startDate };
  const w: EventWindows = eventWindows(med, change, today);
  const after = sentinelList(days, w.after.from, w.after.to, today);
  const before = sentinelList(days, w.before.from, w.before.to, today);
  const beforeDays = daysBetween(w.before.from, w.before.to) + 1;
  const name = medName(med);
  const lead =
    w.after.from === w.after.to
      ? `On ${dateWords(w.after.from, today)}, when ${name} was started`
      : `From ${dateWords(w.after.from, today)}, when ${name} was started, through ${dateWords(w.after.to, today)}`;
  const afterVerb = after.dates.length === 0 ? "were recorded" : after.dates.length === 1 ? "was recorded" : "were recorded";
  const afterPart = after.answered
    ? `${after.text} ${afterVerb} on ${after.answered} answered ${plural(after.answered, "day")}`
    : "the fall and near-fall questions were not answered";
  const beforePart = before.answered
    ? `${before.text} on ${before.answered} answered ${plural(before.answered, "day")} in the ${beforeDays} days before`
    : `no answered days in the ${beforeDays} days before`;
  return {
    text: `${lead}: ${afterPart}, compared with ${beforePart}.`,
    data: {
      medIds: [med.id],
      from: w.before.from,
      to: w.after.to,
      dates: [...before.dates, ...after.dates],
      checkInIds: [...before.ids, ...after.ids],
      positive: after.dates.length,
      answered: after.answered,
    },
  };
}

/** Check-in coverage of the before/after windows of a compared change (ascertainment check). */
export function windowCoverageText(days: CheckIn[], med: Medication | undefined, signal: Pick<Signal, "event" | "eventDate" | "before" | "after">, ref: ISODate): string {
  const count = (from: ISODate, to: ISODate) => days.filter((c) => c.date >= from && c.date <= to).length;
  const len = (from: ISODate, to: ISODate) => daysBetween(from, to) + 1;
  const b = signal.before;
  const a = signal.after;
  const verb = signal.event === "started" ? "start" : "stop";
  return (
    `Around the ${verb} of ${medName(med)} on ${dateWords(signal.eventDate, ref)}, check-ins were recorded on ` +
    `${count(b.from, b.to)} of ${len(b.from, b.to)} days before (${dateWords(b.from, ref)} through ${dateWords(b.to, ref)}) ` +
    `and on ${count(a.from, a.to)} of ${len(a.from, a.to)} days after (${dateWords(a.from, ref)} through ${dateWords(a.to, ref)}).`
  );
}

/** "Lorazepam (Ativan) 0.5 mg at bedtime, started Sep 24, for anxiety / sleep, prescribed by Urgent care." */
export function medText(med: Medication, ref: ISODate, kb: BriefKb): string {
  const parts: string[] = [];
  const how = howTaken(med);
  parts.push(how ? `${medNameWithIngredients(med, kb)} ${how}` : medNameWithIngredients(med, kb));
  if (isValidDate(med.startDate)) parts.push(`started ${dateWords(med.startDate, ref)}`);
  if (med.endDate && isValidDate(med.endDate) && med.endDate < ref) parts.push(`stopped after ${dateWords(med.endDate, ref)}`);
  const reason = oneLine(med.reason);
  if (reason) parts.push(`for ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`);
  if (isSelfSelected(med)) parts.push(med.otc ? "bought over the counter" : "taken without a prescription");
  else if (oneLine(med.prescriber)) parts.push(`prescribed by ${oneLine(med.prescriber)}`);
  if (med.otc && !isSelfSelected(med) && !/otc|over the counter/i.test(med.name)) parts.push("available over the counter");
  return sentence(parts.join(", "));
}

/** 'Alex (daughter) wrote on Oct 3: "…"' / 'Margaret wrote on Sep 21: "…"' */
export function noteText(note: Note, data: StoreData, ref: ISODate): string {
  const who = note.author === "caregiver" ? caregiverLabel(data.profile) : patientFirstName(data.profile);
  return `${who} wrote on ${dateWords(note.date, ref)}: "${excerpt(note.text, EVIDENCE_LIMITS.noteChars)}"`;
}

/** 'Oct 5 check-in: energy 1 out of 5, …; recorded dizziness (severe), a fall; … In Margaret's words: "…"' */
export function entryText(c: CheckIn, data: StoreData, ref: ISODate): string {
  const edited = c.revision > 1 ? " (edited)" : "";
  let text = `${dateWords(c.date, ref)} check-in${edited}: ${answersInWords(c)}.`;
  const others = (c.otherSymptoms ?? []).filter((o) => o.present).map((o) => CONCEPT_LABEL[o.conceptId] ?? String(o.conceptId));
  if (others.length) text += ` Also mentioned: ${joinAnd([...new Set(others)])}.`;
  const notes = (c.medNotes ?? []).map((m) => quotable(m.text)).filter(Boolean);
  if (notes.length) text += ` Medicine note: "${excerpt(notes.join("; "), 80)}".`;
  if (oneLine(c.story)) text += ` In ${patientFirstName(data.profile)}'s words: "${excerpt(c.story, EVIDENCE_LIMITS.storyExcerptChars)}"`;
  return text;
}

/** "<title>. <plain> Source: AGS Beers Criteria 2023." (relatedSymptoms stay in `data`; signals carry the counts.) */
export function findingText(f: Finding, kb: BriefKb): string {
  const title = sentence(f.title);
  const plain = oneLine(f.plain);
  const shorts = sourceShorts(f.sourceIds ?? [], kb);
  const source = shorts.length ? ` Source: ${shorts.join("; ")}.` : "";
  return `${title}${plain ? ` ${sentence(plain)}` : ""}${source}`;
}

/** Ranking used for findings everywhere in the brief: linked to recorded symptoms first, then category order. */
export function rankFindings(findings: Finding[]): Finding[] {
  const order = (f: Finding) => {
    const i = CATEGORY_ORDER.indexOf(f.category);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const ra = a.f.relatedSymptoms?.length ? 0 : 1;
      const rb = b.f.relatedSymptoms?.length ? 0 : 1;
      return ra - rb || order(a.f) - order(b.f) || a.i - b.i;
    })
    .map((x) => x.f);
}

/** Ranking for signals: strength, KB-known effect first, worsening first, then p-value, then id. */
export function rankSignals(signals: Signal[]): Signal[] {
  const strength: Record<Signal["strength"], number> = { strong: 0, moderate: 1, weak: 2 };
  return [...signals].sort(
    (a, b) =>
      strength[a.strength] - strength[b.strength] ||
      (a.knownEffect === b.knownEffect ? 0 : a.knownEffect ? -1 : 1) ||
      (a.direction === b.direction ? 0 : a.direction === "worse" ? -1 : 1) ||
      a.pValue - b.pValue ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The most recent medication start on or before `to` within the last 180 days (the "since … started" anchor). */
export function mostRecentStart(meds: Medication[], to: ISODate): Medication | null {
  let best: Medication | null = null;
  for (const m of meds) {
    if (!eventsForMed(m, to).some((e) => e.kind === "started")) continue;
    if (daysBetween(m.startDate, to) > 180) continue;
    if (!best || m.startDate > best.startDate || (m.startDate === best.startDate && m.id < best.id)) best = m;
  }
  return best;
}

/** Evidence id helpers (single place for the id formats). */
export const evidenceId = {
  coverage: "fact:coverage",
  latest: "fact:latest",
  falls: "fact:falls",
  conditions: "fact:conditions",
  meds: "fact:meds",
  acb: "fact:acb",
  entries: "fact:entries",
  count: (m: MetricKey) => `fact:count:${m}`,
  fallsSince: (medId: string) => `fact:falls-since:${medId}`,
  windowCoverage: (medId: string, event: Signal["event"]) => `fact:coverage:${medId}:${event}`,
  finding: (key: string) => `find:${key}`,
  med: (id: string) => `med:${id}`,
  concern: (id: string) => `concern:${id}`,
  note: (id: string) => `note:${id}`,
  question: (id: string) => `note:question:${id}`,
  entry: (id: string) => `entry:${id}`,
};

// ---------------------------------------------------------------------------
// Builder

/** Stable hash over ids + texts (staleness check). */
export function evidenceHash(items: EvidenceItem[]): string {
  return stableHash(items.map((i) => `${i.id}␟${i.text}`).join("␞"));
}

/** Pinned notes included as concerns for this brief. */
export function includedConcerns(data: StoreData, includedConcernIds?: string[]): Note[] {
  return data.notes
    .filter((n) => n.pinned && (includedConcernIds === undefined || includedConcernIds.includes(n.id)))
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1));
}

export function buildEvidence(input: BuildEvidenceInput): EvidencePackage & { items: BriefEvidenceItem[] } {
  const { data, from, to, review, timeline } = input;
  if (!isValidDate(from) || !isValidDate(to)) throw new RangeError(`buildEvidence needs valid dates (got ${from} – ${to})`);
  if (from > to) throw new RangeError(`buildEvidence: from (${from}) is after to (${to})`);
  const kb = input.kb ?? DEFAULT_KB;
  const maxChars = input.maxChars ?? EVIDENCE_LIMITS.maxChars;
  const days = latestCheckInPerDate(data.checkIns);
  const inPeriod = days.filter((c) => c.date >= from && c.date <= to);
  const medById = new Map(data.medications.map((m) => [m.id, m]));

  const used = new Set<string>();
  const make = (id: string, kind: EvidenceKind, text: string, d?: EvidenceData): BriefEvidenceItem => {
    let unique = id;
    for (let n = 2; used.has(unique); n++) unique = `${id}#${n}`;
    used.add(unique);
    return d ? { id: unique, kind, text: oneLine(text), data: d } : { id: unique, kind, text: oneLine(text) };
  };

  // Facts -------------------------------------------------------------------
  const facts: BriefEvidenceItem[] = [];
  const cov = coverageText(days, from, to);
  facts.push(make(evidenceId.coverage, "fact", cov.text, cov.data));
  const latest = [...days].reverse().find((c) => c.date <= to);
  if (latest) {
    const inside = latest.date >= from;
    facts.push(
      make(
        evidenceId.latest,
        "fact",
        `The most recent check-in ${inside ? "in this period" : "before this period"} was on ${dateWords(latest.date, to)}.`,
        { checkInIds: [latest.id], dates: [latest.date] },
      ),
    );
  } else {
    facts.push(make(evidenceId.latest, "fact", `No check-ins were recorded on or before ${dateWords(to, to)}.`, {}));
  }
  for (const m of DIARY_ITEMS) {
    const r = metricCountText(days, m, from, to);
    facts.push(make(evidenceId.count(m), "fact", r.text, r.data));
  }
  const falls = fallsText(days, from, to);
  facts.push(make(evidenceId.falls, "fact", falls.text, falls.data));
  const recent = mostRecentStart(data.medications, to);
  if (recent) {
    const r = fallsSinceStartText(days, recent, to);
    facts.push(make(evidenceId.fallsSince(recent.id), "fact", r.text, r.data));
  }
  // Check-in coverage of the windows behind each compared change that produced a signal.
  const signals = timeline.signals.filter((s) => s.after.to >= from).slice(0, EVIDENCE_LIMITS.maxSignals);
  const events = new Map<string, Signal>();
  for (const s of signals) {
    const k = evidenceId.windowCoverage(s.medicationId, s.event);
    if (!events.has(k)) events.set(k, s);
  }
  for (const [k, s] of events) {
    facts.push(make(k, "fact", windowCoverageText(days, medById.get(s.medicationId), s, to), { medIds: [s.medicationId], from: s.before.from, to: s.after.to }));
  }
  const profileConds = data.profile.conditions.map((c) => CONDITION_LABEL[c] ?? c);
  const diaryConds = (review.effectiveConditions ?? []).filter((c) => c.from === "diary").map((c) => CONDITION_LABEL[c.tag] ?? c.tag);
  if (profileConds.length || diaryConds.length) {
    let t = profileConds.length ? `Health conditions recorded by the family: ${profileConds.join(", ")}.` : "No health conditions were recorded by the family.";
    if (diaryConds.length) t += ` Added from the diary for this review: ${diaryConds.join(", ")}.`;
    facts.push(make(evidenceId.conditions, "fact", t));
  }
  const active = data.medications.filter((m) => isActiveOn(m, to));
  const otc = active.filter((m) => m.otc).length;
  facts.push(
    make(
      evidenceId.meds,
      "fact",
      `${active.length} ${plural(active.length, "medicine is", "medicines are")} on the current list${otc ? `, ${otc} of them over the counter` : ""}.`,
      { medIds: active.map((m) => m.id) },
    ),
  );
  if (review.acb && review.acb.total > 0) {
    const parts = review.acb.contributors.map((c) => {
      const med = medById.get(c.medId);
      const ing = (kb.drugDisplay(c.ingredientId) ?? c.ingredientId).toLowerCase();
      const name = med ? medName(med) : ing;
      return name.toLowerCase().includes(ing) ? `${name} ${c.score}` : `${ing} ${c.score} (in ${name})`;
    });
    facts.push(
      make(
        evidenceId.acb,
        "fact",
        `The anticholinergic burden score (ACB) adds up to ${review.acb.total}${parts.length ? `: ${parts.join(", ")}` : ""}.`,
        { medIds: review.acb.contributors.map((c) => c.medId) },
      ),
    );
  }

  // Concerns ------------------------------------------------------------------
  const concerns = includedConcerns(data, input.includedConcernIds).map((n) =>
    make(evidenceId.concern(n.id), "concern", noteText(n, data, to), { noteIds: [n.id], dates: [n.date] }),
  );

  // Signals -------------------------------------------------------------------
  const signalItems = signals.map((s) => {
    const med = medById.get(s.medicationId);
    let text = oneLine(s.text);
    if (s.knownEffect && s.direction === "worse") {
      text += ` ${PRODUCT_REF} lists ${getMetric(s.metric).effectNoun} as a recognized possible effect of ${medName(med)}.`;
    }
    text += ` ${SIGNAL_EVIDENCE_CAVEAT}`;
    return make(s.id.startsWith("sig:") ? s.id : `sig:${s.id}`, "signal", text, {
      signalId: s.id,
      medIds: [s.medicationId],
      metric: s.metric,
      from: s.before.from,
      to: s.after.to,
      positive: s.after.positive,
      answered: s.after.answered,
    });
  });

  // Findings ------------------------------------------------------------------
  const visible = review.findings.filter((f) => decisionFor(data.reviewDecisions, f.key) !== "dismissed");
  const findingItems = rankFindings(visible)
    .slice(0, EVIDENCE_LIMITS.maxFindings)
    .map((f) => make(evidenceId.finding(f.key), "finding", findingText(f, kb), { findingKey: f.key, medIds: [...f.medIds], metric: f.relatedSymptoms?.[0] }));

  // Medicines -----------------------------------------------------------------
  const listed = data.medications.filter((m) => isActiveOn(m, to) || (m.endDate !== null && m.endDate >= from && m.endDate < to));
  const medItems = listed.map((m) => make(evidenceId.med(m.id), "med", medText(m, to, kb), { medIds: [m.id], dates: [m.startDate] }));

  // Notes and saved questions -------------------------------------------------
  const concernIds = new Set(data.notes.filter((n) => n.pinned).map((n) => n.id));
  const noteItems = data.notes
    .filter((n) => !concernIds.has(n.id) && n.date >= from && n.date <= to)
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1))
    .slice(0, EVIDENCE_LIMITS.maxNotes)
    .map((n) => make(evidenceId.note(n.id), "note", noteText(n, data, to), { noteIds: [n.id], dates: [n.date] }));
  const questionItems = (data.savedQuestions ?? [])
    .slice(0, EVIDENCE_LIMITS.maxSavedQuestions)
    .map((q) => make(evidenceId.question(q.id), "note", `Saved question for the visit: "${excerpt(q.text, 240)}"`, {}));

  // Entries (budgeted) --------------------------------------------------------
  const fixed = [...facts, ...concerns, ...signalItems, ...findingItems, ...medItems, ...noteItems, ...questionItems];
  const fixedChars = fixed.reduce((n, i) => n + i.text.length, 0);
  const reserve = 220; // room for the fact:entries note
  let budget = maxChars - fixedChars - reserve;
  const sentinelDay = (c: CheckIn) => metricValue(c, "fall") === 1 || metricValue(c, "nearFall") === 1;
  const candidates = [...inPeriod].sort((a, b) => {
    const sa = sentinelDay(a) ? 0 : 1;
    const sb = sentinelDay(b) ? 0 : 1;
    return sa - sb || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  });
  const chosen: { c: CheckIn; text: string }[] = [];
  for (const c of candidates) {
    const text = entryText(c, data, to);
    const mustKeep = chosen.length < EVIDENCE_LIMITS.minEntries;
    if (!mustKeep && text.length > budget) continue;
    chosen.push({ c, text });
    budget -= text.length;
  }
  chosen.sort((a, b) => (a.c.date < b.c.date ? 1 : a.c.date > b.c.date ? -1 : 0));
  const entryItems = chosen.map(({ c, text }) => make(evidenceId.entry(c.id), "entry", text, { checkInIds: [c.id], dates: [c.date] }));
  if (chosen.length < inPeriod.length) {
    facts.push(
      make(
        evidenceId.entries,
        "fact",
        `${chosen.length} of the ${inPeriod.length} check-ins in this period are listed individually (days with a fall or near-fall first, then the most recent); all counts use every check-in.`,
        { checkInIds: chosen.map((x) => x.c.id) },
      ),
    );
  }

  // Facts in order of importance (consumers such as the AI prompt builder take the first few).
  const factRank = (id: string): number => {
    const order = ["fact:coverage", "fact:falls-since:", "fact:falls", "fact:coverage:", "fact:acb", "fact:count:", "fact:meds", "fact:conditions", "fact:latest", "fact:entries"];
    const exact = order.indexOf(id);
    if (exact >= 0) return exact;
    const prefix = order.findIndex((o) => o.endsWith(":") && id.startsWith(o));
    return prefix >= 0 ? prefix : order.length;
  };
  facts.sort((a, b) => factRank(a.id) - factRank(b.id));

  const items: BriefEvidenceItem[] = [...facts, ...concerns, ...signalItems, ...findingItems, ...medItems, ...noteItems, ...questionItems, ...entryItems];
  return {
    from,
    to,
    generatedAt: input.generatedAt ?? data.updatedAt,
    items,
    hash: evidenceHash(items),
  };
}

/** Map of evidence id → item. */
export function evidenceById(pkg: EvidencePackage): Map<string, BriefEvidenceItem> {
  return new Map(pkg.items.map((i) => [i.id, i as BriefEvidenceItem]));
}

/** Default brief period: the last `days` calendar days ending `today` (inclusive). */
export function defaultPeriod(today: ISODate, days = 30): { from: ISODate; to: ISODate } {
  return { from: addDays(today, -(days - 1)), to: today };
}

/** All calendar days of a package period (for charts). */
export function periodDays(pkg: Pick<EvidencePackage, "from" | "to">): ISODate[] {
  return dateRange(pkg.from, pkg.to);
}
