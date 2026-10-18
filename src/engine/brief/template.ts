// Deterministic visit brief (SPEC §6.5–6.6): always available, no model involved. Every sentence restates an
// evidence item and cites it, so the template obeys the same rules the AI draft is checked against.
//
//   reason        pinned concerns, in the writer's own words, quoted and attributed
//   noticed       top 3 timeline signals (strength, then KB-known effect, then worsening), then at most 1 "Also
//                 recorded" line when a shown medicine's same before/after comparison also recorded a change the
//                 other way (so a clinician weighs both, e.g. better sleep ratings next to more dizziness), the
//                 check-in coverage of the windows behind them, and falls/near-falls since the most recent start
//   reviewPrompts 5 findings, dismissed ones left out: ranked (linked to recorded symptoms first, then category order)
//                 and then picked for breadth — at most 2 AGS Beers prompts and 1 of every other kind on the first
//                 pass, skipping a Beers prompt whose medicines are already covered — so ACB, fall-risk and cascade
//                 prompts are not crowded out by several Beers rules about the same medicine; then filled by rank
//   questions     the questions of those findings (de-duplicated, ≤4 findings, ≤5 items) + saved questions (≤3).
//                 A finding question longer than one 280-character sentence is split into its question sentences
//                 (the follow-up is kept while there is room); each part cites what its numbers need and must pass
//                 verifySentence with the same options as the AI draft, or it is left out.
//   limitations   fixed, honest lines (coverage, as-needed doses, chance/expectation, what the review does not
//                 check, provenance)

import type {
  BriefContent,
  BriefSentence,
  EvidencePackage,
  Finding,
  GenerationInfo,
  ISODate,
  MedReview,
  Medication,
  Signal,
  StoreData,
  TimelineAnalysis,
  VisitBrief,
} from "../../model/types";
import { daysBetween } from "../../model/dates";
import { getMetric, latestCheckInPerDate } from "../timeline/metrics";
import { oneDecimal } from "../timeline/text";
import { evidenceById, evidenceId, mostRecentStart, rankFindings, rankSignals } from "./evidence";
import type { BriefEvidenceItem } from "./evidence";
import {
  BEERS_CATEGORIES,
  DEFAULT_KB,
  PRODUCT_NAME,
  caregiverLabel,
  dateWords,
  decisionFor,
  firstSentence,
  medName,
  oneLine,
  patientFirstName,
  plural,
  sentence,
  sourceShorts,
} from "./shared";
import type { BriefKb } from "./shared";
import { verifySentence } from "./verify";

export interface TemplateInput {
  data: StoreData;
  review: MedReview;
  timeline: TimelineAnalysis;
  kb?: BriefKb;
}

export const TEMPLATE_LIMITS = { noticedSignals: 3, alsoRecorded: 1, reviewPrompts: 5, findingQuestions: 4, findingQuestionItems: 5, savedQuestions: 3 } as const;

/** Fixed limitation lines (verbatim; reviewed against SPEC §3 and the regulatory fact-check). */
export const LIMITATION_LINES = {
  chance: "Recorded symptoms can change for many reasons, including chance and expectation; this record does not show cause.",
  scope:
    "This review checks published criteria (AGS Beers 2023, ACB scale, fall-risk medicines, known prescribing cascades). " +
    "It does not check doses, kidney function unless provided, allergies, or every interaction. No flag is not an all-clear for any medicine.",
  family: "Prepared by family from home records; not a clinical assessment.",
  /**
   * Shown when an as-needed medicine is on the list: the diary records symptoms, not doses (for any medicine;
   * scheduled ones are only assumed taken from their start date), so there is no per-day dose record to line up with. Kept to one printed line of the limitations column (the brief is one page).
   */
  asNeeded: "Doses taken are not logged, so as-needed medicines cannot be separated.",
} as const;

/** The persistent safety line (SPEC §3), for print and "Copy as text" footers. */
export const SAFETY_LINE =
  "Don't stop or change any medicine without talking to the prescriber. If something feels like an emergency, call 911.";

/** Findings shown as review prompts: not dismissed, ranked (linked to recorded symptoms first, then category order). */
export function promptFindings(review: MedReview, data: StoreData): Finding[] {
  return rankFindings(review.findings.filter((f) => decisionFor(data.reviewDecisions, f.key) !== "dismissed"));
}

/** How many prompts of each kind the first, breadth-first pass of selectReviewPrompts takes. */
const PROMPT_QUOTA = { beers: 2, other: 1 } as const;

/**
 * Pick `n` review prompts from ranked findings for breadth (see the header comment). The result keeps the
 * ranked order. Deterministic.
 */
export function selectReviewPrompts(ranked: Finding[], n: number = TEMPLATE_LIMITS.reviewPrompts): Finding[] {
  const chosen = new Set<number>();
  const used = new Map<string, number>();
  const coveredByBeers = new Set<string>();
  ranked.forEach((f, i) => {
    if (chosen.size >= n) return;
    const beers = BEERS_CATEGORIES.has(f.category);
    const group = beers ? "beers" : f.category;
    const quota = beers ? PROMPT_QUOTA.beers : PROMPT_QUOTA.other;
    if ((used.get(group) ?? 0) >= quota) return;
    if (beers && f.medIds.length > 0 && f.medIds.every((id) => coveredByBeers.has(id))) return;
    chosen.add(i);
    used.set(group, (used.get(group) ?? 0) + 1);
    if (beers) f.medIds.forEach((id) => coveredByBeers.add(id));
  });
  ranked.forEach((_, i) => {
    if (chosen.size < n) chosen.add(i);
  });
  return ranked.filter((_, i) => chosen.has(i));
}

/** Short citation for a finding ("AGS Beers Criteria® 2023"). */
export function findingSourceShort(f: Finding, kb: BriefKb = DEFAULT_KB): string {
  const shorts = sourceShorts(f.sourceIds ?? [], kb);
  return shorts.length ? shorts.join("; ") : `${PRODUCT_NAME} reference set`;
}

function normalizeQuestion(text: string): string {
  return oneLine(text).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Check-in coverage ratio of a window (days with a check-in / calendar days). */
function windowCoverage(data: StoreData, from: ISODate, to: ISODate): { n: number; d: number } {
  const n = latestCheckInPerDate(data.checkIns).filter((c) => c.date >= from && c.date <= to).length;
  return { n, d: daysBetween(from, to) + 1 };
}

/**
 * "Also recorded around the time Lorazepam (Ativan) was started: sleep quality ratings averaged 3.4 out of 5 on 14
 * answered days after, compared with 2.6 out of 5 on 20 answered days before." Restates a signal's own numbers, in
 * the signal sentence's wording ("was started" / "was stopped"), and says nothing about why or whether it is good.
 * "after"/"before" sit right after each count so the claim checker reads each pair on its own side.
 */
export function alsoRecordedText(s: Signal, med: Medication | undefined): string {
  const def = getMetric(s.metric);
  const subject = def.subject.charAt(0).toLowerCase() + def.subject.slice(1);
  const lead = `Also recorded around the time ${medName(med)} was ${s.event === "started" ? "started" : "stopped"}: ${subject}`;
  const { before: b, after: a } = s;
  return def.kind === "boolean"
    ? `${lead} was recorded on ${a.positive} of ${a.answered} answered days after, compared with ${b.positive} of ${b.answered} answered days before.`
    : `${lead} averaged ${oneDecimal(a.value)} out of 5 on ${a.answered} answered days after, compared with ${oneDecimal(b.value)} out of 5 on ${b.answered} answered days before.`;
}

/** Longest sentence the claim checker accepts (verify.ts default). */
const MAX_SENTENCE_CHARS = 280;

/**
 * A finding's question text for a period. The fall-risk question now carries its own denominators ("With 1 fall
 * and 2 near-falls on 26 answered days … in the last 30 days"), so every question is used as written.
 */
export function findingQuestionText(f: Finding, _period: Pick<EvidencePackage, "from" | "to">, _data: StoreData): string {
  return oneLine(f.question);
}

/**
 * A finding's question as brief sentences: the whole question when it fits one sentence, else its question
 * sentences in order. Each part cites the finding (+ up to 2 linked signals) and, when its numbers need them,
 * the coverage or count items; parts that still fail verifySentence (the AI draft's checker) are left out.
 * Exported so the brief builder in the UI asks exactly the questions the template asks.
 */
export function findingQuestionSentences(f: Finding, pkg: EvidencePackage, data: StoreData): BriefSentence[] {
  const byId = evidenceById(pkg);
  const has = (id: string) => byId.has(id);
  const text = oneLine(f.question);
  if (!text) return [];
  const base = [evidenceId.finding(f.key), ...(f.signalIds ?? []).filter(has).slice(0, 2)].filter(has);
  const parts = text.length <= MAX_SENTENCE_CHARS ? [text] : text.split(/(?<=\?)\s+(?=[A-Z])/).map(oneLine).filter(Boolean);
  // Items that can carry a number a question mentions ("in the last 30 days" → the period's coverage; "since
  // Sep 25" → the medicine's own item with its start date).
  const helpers = [
    evidenceId.coverage,
    evidenceId.falls,
    ...(["dizziness", "drowsiness", "confusion", "swelling"] as const).map(evidenceId.count),
    ...f.medIds.map(evidenceId.med),
  ].filter(has);
  const opts = {
    medNames: data.medications.map((m) => m.name),
    patientNames: [patientFirstName(data.profile), oneLine(data.profile.displayName)].filter(Boolean),
    expect: "question" as const,
  };
  const out: BriefSentence[] = [];
  for (const part of parts) {
    const tries = [base, ...helpers.filter((h) => !base.includes(h)).map((h) => [...base, h])];
    const ok = tries.map((ids) => ({ text: part, evidenceIds: ids.slice(0, 6) })).find((s) => s.evidenceIds.length && verifySentence(s, pkg, opts).ok);
    if (ok) out.push(ok);
  }
  return out;
}

export function templateBrief(pkg: EvidencePackage, input: TemplateInput): BriefContent {
  const { data, review, timeline } = input;
  const kb = input.kb ?? DEFAULT_KB;
  const byId = evidenceById(pkg);
  const has = (id: string) => byId.has(id);
  const item = (id: string): BriefEvidenceItem | undefined => byId.get(id);

  // 1) Why we're coming in -----------------------------------------------------
  const reason: BriefSentence[] = pkg.items.filter((i) => i.kind === "concern").map((i) => ({ text: i.text, evidenceIds: [i.id] }));
  if (reason.length === 0) {
    const ids = [evidenceId.meds, evidenceId.coverage].filter(has);
    const meds = item(evidenceId.meds)?.data?.medIds?.length ?? 0;
    if (ids.length) {
      reason.push({
        text:
          `${caregiverLabel(data.profile)} would like to go over ${patientFirstName(data.profile)}'s ${meds} current ` +
          `${plural(meds, "medicine")} and what the diary recorded from ${dateWords(pkg.from, pkg.to)} through ${dateWords(pkg.to, pkg.to)}.`,
        evidenceIds: ids,
      });
    }
  }

  // 2) What we've noticed --------------------------------------------------------
  const noticed: BriefSentence[] = [];
  const topSignals = rankSignals(timeline.signals.filter((s) => has(s.id))).slice(0, TEMPLATE_LIMITS.noticedSignals);
  for (const s of topSignals) noticed.push({ text: oneLine(s.text), evidenceIds: [s.id] });
  // Benefit next to harm: for a medicine shown with a 'worse' change, the strongest 'better' change from the same
  // before/after comparison (same medicine and event) that is not already shown. Described, never weighed.
  const shownIds = new Set(topSignals.map((s) => s.id));
  const otherWay = rankSignals(timeline.signals.filter((s) => has(s.id) && !shownIds.has(s.id) && s.direction === "better"))
    .filter((b) => topSignals.some((w) => w.direction === "worse" && w.medicationId === b.medicationId && w.event === b.event))
    .slice(0, TEMPLATE_LIMITS.alsoRecorded);
  for (const s of otherWay) {
    noticed.push({ text: alsoRecordedText(s, data.medications.find((m) => m.id === s.medicationId)), evidenceIds: [s.id] });
  }
  const events: Signal[] = [];
  for (const s of topSignals) if (!events.some((e) => e.medicationId === s.medicationId && e.event === s.event)) events.push(s);
  for (const e of events) {
    const id = evidenceId.windowCoverage(e.medicationId, e.event);
    const it = item(id);
    if (it) noticed.push({ text: it.text, evidenceIds: [id] });
  }
  if (topSignals.length === 0) {
    // No compared change stood out: show the most frequently recorded diary symptoms instead.
    const counts = (["dizziness", "drowsiness", "confusion", "swelling", "appetiteWorse"] as const)
      .map((m) => item(evidenceId.count(m)))
      .filter((it): it is BriefEvidenceItem => Boolean(it && (it.data?.positive ?? 0) > 0 && (it.data?.answered ?? 0) > 0))
      .sort((a, b) => (b.data!.positive! / b.data!.answered!) - (a.data!.positive! / a.data!.answered!))
      .slice(0, TEMPLATE_LIMITS.noticedSignals);
    for (const it of counts) noticed.push({ text: it.text, evidenceIds: [it.id] });
  }
  const recent = mostRecentStart(data.medications, pkg.to);
  const sinceId = recent ? evidenceId.fallsSince(recent.id) : null;
  const since = sinceId ? item(sinceId) : undefined;
  if (since && sinceId && ((since.data?.dates?.length ?? 0) > 0 || (recent && recent.startDate >= pkg.from))) {
    noticed.push({ text: since.text, evidenceIds: [sinceId] });
  } else if ((item(evidenceId.falls)?.data?.positive ?? 0) > 0) {
    noticed.push({ text: item(evidenceId.falls)!.text, evidenceIds: [evidenceId.falls] });
  }
  if (noticed.length === 0 && has(evidenceId.coverage)) {
    noticed.push({ text: item(evidenceId.coverage)!.text, evidenceIds: [evidenceId.coverage] });
  }

  // 3) Medication review prompts -------------------------------------------------
  const ranked = promptFindings(review, data).filter((f) => has(evidenceId.finding(f.key)));
  const top = selectReviewPrompts(ranked, TEMPLATE_LIMITS.reviewPrompts);
  const reviewPrompts = top.map((f) => ({
    findingKey: f.key,
    text: oneLine(f.plain) ? `${sentence(f.title)} ${firstSentence(f.plain)}` : sentence(f.title),
    sourceShort: findingSourceShort(f, kb),
  }));

  // 4) Our questions ------------------------------------------------------------
  // First pass: the lead question of up to 4 findings; second pass: their follow-up sentences while there is
  // room (each follow-up placed right after its lead).
  const groups: BriefSentence[][] = [];
  const seen = new Set<string>();
  for (const f of top) {
    if (groups.length >= TEMPLATE_LIMITS.findingQuestions) break;
    const parts = findingQuestionSentences(f, pkg, data).filter((s) => !seen.has(normalizeQuestion(s.text)));
    if (!parts.length) continue;
    parts.forEach((s) => seen.add(normalizeQuestion(s.text)));
    groups.push(parts);
  }
  let room = TEMPLATE_LIMITS.findingQuestionItems - groups.length;
  const questions: BriefSentence[] = groups.flatMap((parts) => {
    const follow = parts.slice(1, 1 + Math.max(0, room));
    room -= follow.length;
    return [parts[0], ...follow];
  });
  let saved = 0;
  for (const q of data.savedQuestions ?? []) {
    if (saved >= TEMPLATE_LIMITS.savedQuestions) break;
    const id = evidenceId.question(q.id);
    const text = oneLine(q.text);
    const norm = normalizeQuestion(text);
    if (!text || !has(id) || seen.has(norm)) continue;
    seen.add(norm);
    questions.push({ text, evidenceIds: [id] });
    saved++;
  }

  // 6) Diary coverage & limitations -------------------------------------------------
  const limitations: string[] = [];
  const cov = item(evidenceId.coverage);
  limitations.push(
    cov
      ? `${cov.text.replace(/\.$/, "")}; days without a check-in are left out of every count.`
      : "Days without a check-in are left out of every count.",
  );
  for (const e of events) {
    const b = windowCoverage(data, e.before.from, e.before.to);
    const a = windowCoverage(data, e.after.from, e.after.to);
    if (b.d > 0 && a.d > 0 && Math.abs(b.n / b.d - a.n / a.d) >= 0.2) {
      const med = data.medications.find((m) => m.id === e.medicationId);
      limitations.push(
        `The diary was kept on ${b.n} of ${b.d} days before ${medName(med)} was ${e.event} and on ${a.n} of ${a.d} days after; ` +
          "a change in how often the diary is kept can change how often symptoms appear in it.",
      );
    }
  }
  // Any as-needed medicine taken during the period (the diary records symptoms, not doses).
  if (data.medications.some((m) => m.asNeeded && m.startDate <= pkg.to && (!m.endDate || m.endDate >= pkg.from))) {
    limitations.push(LIMITATION_LINES.asNeeded);
  }
  limitations.push(LIMITATION_LINES.chance, LIMITATION_LINES.scope);
  const unmatched = (review.unmatchedMedIds ?? [])
    .map((id) => data.medications.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => medName(m));
  if (unmatched.length) {
    limitations.push(`Not in ${PRODUCT_NAME}'s reference set, so not reviewed: ${unmatched.join(", ")}. That says nothing either way about these medicines.`);
  }
  // The review engine's own scope notice repeats LIMITATION_LINES.scope; keep one.
  for (const n of review.notices ?? []) if (oneLine(n) && !/published criteria/i.test(n)) limitations.push(sentence(n));
  limitations.push(LIMITATION_LINES.family);

  return { reason, noticed, reviewPrompts, questions, limitations };
}

/** Provenance for a template brief (SPEC §6.6 footer). */
export function templateGenerationInfo(pkg: EvidencePackage, review: MedReview): GenerationInfo {
  return {
    mode: "template",
    model: null,
    promptVersion: null,
    kbVersion: review.kbVersion,
    durationMs: null,
    droppedSentences: 0,
    evidenceHash: pkg.hash,
    generatedAt: pkg.generatedAt,
  };
}

/** Assemble a VisitBrief record (the caller supplies the id, e.g. newId("brief")). Starts unreviewed. */
export function toVisitBrief(input: {
  id: string;
  pkg: EvidencePackage;
  content: BriefContent;
  generation: GenerationInfo;
  data: StoreData;
  includedConcernIds?: string[];
}): VisitBrief {
  return {
    id: input.id,
    from: input.pkg.from,
    to: input.pkg.to,
    content: input.content,
    generation: input.generation,
    includedConcernIds:
      input.includedConcernIds ?? input.pkg.items.filter((i) => i.kind === "concern").map((i) => i.id.slice("concern:".length)),
    reviewedAt: null,
    reviewedBy: null,
    sourceRevision: input.data.revision,
  };
}

/** Every evidence id cited by a brief that is missing from the package (empty = consistent). */
export function missingEvidenceIds(content: BriefContent, pkg: EvidencePackage): string[] {
  const ids = new Set(pkg.items.map((i) => i.id));
  const cited = [
    ...content.reason,
    ...content.noticed,
    ...content.questions,
  ].flatMap((s) => s.evidenceIds);
  const prompts = content.reviewPrompts.map((p) => evidenceId.finding(p.findingKey));
  return [...new Set([...cited, ...prompts])].filter((id) => !ids.has(id));
}
