// On-device clinical NLP: turn a free-text check-in into reviewable diary proposals.
//
//   story ──► normalise + spell-correct (normalize.ts)
//         ──► sentences, tokens, clause boundaries (segment.ts)
//         ──► concept lexicon + explicit ratings (lexicon.ts, numbers.ts)
//         ──► ConText: negation / temporality / experiencer per mention (context.ts)
//         ──► field resolution: ≤ 1 proposal per diary field, conflicts surfaced, reasons in plain words
//         ──► medication remarks (meds.ts)
//
// Every proposal carries exact spans into the original story (`story.slice(start, end) === quote`).
// Proposals are suggestions: the person confirms each one before anything is saved
// (applyProposals). Wording never states causes, urgency or that anything is "safe".

import type {
  ConceptId,
  DiaryAnswers,
  DiaryField,
  Extraction,
  ISODate,
  Medication,
  Mention,
  OtherSymptom,
  Proposal,
  Span,
} from "../../model/types";
import { buildTextView, type TextView } from "./normalize";
import { splitSentences, tokenize, type Segment } from "./segment";
import {
  CONCEPTS,
  dizzinessSeverity,
  isConceptId,
  matchLexicon,
  type AppetiteValue,
  type ConceptKey,
  type LexMatch,
} from "./lexicon";
import { findRatings, type RatingMatch } from "./numbers";
import {
  analyzeInSentence,
  buildSentenceContexts,
  detectVoice,
  findTriggers,
  type ContextResult,
  type SentenceContext,
  type Voice,
  type VoiceInfo,
} from "./context";
import { findMedNotes, medKnownWords } from "./meds";

export const NLP_ENGINE_VERSION = "kinwise-nlp 2.0.0";

export interface ExtractContext {
  meds: Medication[];
  today: ISODate;
  /** Names the patient may be called by ("Margaret"); helps read caregiver-written stories. */
  patientNames?: string[];
  /** Who is typing. "auto" (default) infers it from the text. */
  voice?: "auto" | Voice;
  /**
   * Evaluation baseline only (evaluate.ts): switch ConText off, so every lexicon match counts as affirmed,
   * current and about the patient (no negation, history, hypothetical, someone-else, question or correction
   * handling). Default false. Never set by the app.
   */
  noContext?: boolean;
}

export interface DetailedExtraction extends Extraction {
  /** Whether the story was read as the patient's own words or a caregiver's. */
  voice: VoiceInfo;
  /** Spelling corrections applied before matching (original offsets). */
  corrections: Array<{ start: number; end: number; from: string; to: string }>;
  engine: string;
}

/** Order of proposals in the output (same as the check-in form). */
export const FIELD_ORDER: readonly DiaryField[] = [
  "energy", "sleep", "appetite", "dizziness", "dizzinessSeverity", "drowsiness", "confusion", "fall", "nearFall", "swelling",
];

const SEVERITY_WORD = { 1: "mild", 2: "moderate", 3: "severe" } as const;
const APPETITE_WORD: Record<AppetiteValue, string> = {
  worse: "less than usual (worse)",
  better: "good or better than usual",
  same: "about the same as usual",
};

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
}

// ---------------------------------------------------------------------------
// Internal mention record

interface Item {
  source: "lexicon" | "rating";
  concept: ConceptKey;
  field: DiaryField | null;
  conceptId: ConceptId | null;
  start: number; // view coordinates
  end: number;
  value?: number | AppetiteValue;
  certainty: "explicit" | "inferred";
  anchored: boolean;
  precursor: boolean;
  /** TermDef.guess: low-confidence wording ("legs felt wobbly"), proposed only as a best guess. */
  guess: string | null;
  changeOnly: boolean;
  invalid: string | null;
  ctx: ContextResult;
  sentence: number;
  severity: { value: 1 | 2 | 3; start: number; end: number } | null;
  /** Why this mention is not mapped to today's answers (null = candidate). */
  skip: string | null;
}

interface Built {
  view: TextView;
  story: string;
  sentences: Segment[];
  scs: SentenceContext[];
  items: Item[];
  /** ExtractContext.noContext: the lexicon-only evaluation baseline. */
  noContext: boolean;
}

/** What every mention looks like with ConText switched off: affirmed, current, the patient's own. */
const NO_CONTEXT: ContextResult = {
  negated: false,
  temporality: "current",
  experiencer: "patient",
  uncertain: false,
  question: false,
  corrected: false,
  anchor: null,
  triggers: [],
};

function span(view: TextView, story: string, start: number, end: number): Span {
  const o = view.toOriginal(start, end);
  return { start: o.start, end: o.end, quote: story.slice(o.start, o.end) };
}

/** Clause-ish quote used in reasons: from the earliest relevant trigger to the end of the clause. */
function contextQuote(b: Built, it: Item): string {
  const sc = b.scs[it.sentence];
  let start = it.start;
  for (const t of it.ctx.triggers) if (t.start < start && t.start >= sc.seg.start) start = t.start;
  let end = sc.seg.end;
  for (const bd of sc.boundaries) {
    if (bd.start >= it.end) {
      end = bd.start;
      break;
    }
  }
  for (const t of it.ctx.triggers) if (t.end > end && t.end <= sc.seg.end) end = t.end;
  let s = span(b.view, b.story, start, end).quote.trim().replace(/[\s.,;:!?]+$/, "");
  if (s.length > 90) s = span(b.view, b.story, it.start, it.end).quote;
  return s;
}

function triggerQuote(b: Built, it: Item, kind: string): string | null {
  const t = it.ctx.triggers.find((x) => x.kind === kind);
  return t ? span(b.view, b.story, t.start, t.end).quote : null;
}

/** Evidence span for a proposal: the term plus the negation words / severity words next to it. */
function evidence(_b: Built, it: Item, withSeverity: boolean): { start: number; end: number } {
  let start = it.start;
  let end = it.end;
  if (it.ctx.negated) {
    for (const t of it.ctx.triggers) {
      if (t.kind !== "negation" && t.kind !== "resolution" && t.kind !== "correction") continue;
      if (t.end <= it.start && it.start - t.end <= 40) start = Math.min(start, t.start);
      if (t.start >= it.end && t.start - it.end <= 40) end = Math.max(end, t.end);
    }
  }
  if (withSeverity && it.severity) {
    if (it.severity.end <= it.start && it.start - it.severity.end <= 30) start = Math.min(start, it.severity.start);
    if (it.severity.start >= it.end && it.severity.start - it.end <= 30) end = Math.max(end, it.severity.end);
  }
  return { start, end };
}

function correctionNote(b: Built, start: number, end: number): string {
  const o = b.view.toOriginal(start, end);
  const fixes = b.view.corrections.filter((c) => c.start >= o.start && c.end <= o.end);
  if (fixes.length === 0) return "";
  return ` (read ${fixes.map((f) => `"${f.from}" as "${f.to}"`).join(", ")})`;
}

// ---------------------------------------------------------------------------
// Stage 1: find and contextualise mentions

function buildItems(story: string, ctx: ExtractContext): Built & { voice: VoiceInfo; medView: { tokens: ReturnType<typeof tokenize> } } {
  const view = buildTextView(story, medKnownWords(ctx.meds));
  const text = view.text;
  let sentences = splitSentences(view.cased);
  if (sentences.length === 0 && text.trim()) sentences = [{ start: 0, end: text.length, text }];
  const tokens = tokenize(text);
  const lex = matchLexicon(text);
  const ratings = findRatings(text, sentences);
  const overlapsRating = (m: { start: number; end: number }) => ratings.some((r) => m.start < r.end && r.start < m.end);
  const concepts: LexMatch[] = lex.filter((m) => m.term.concept !== null && !(overlapsRating(m) && (m.term.concept === "energy" || m.term.concept === "sleep")));
  const consumed = [...lex, ...ratings].map((m) => ({ start: m.start, end: m.end }));
  const triggers = findTriggers(text);
  const voice: VoiceInfo =
    ctx.voice && ctx.voice !== "auto" ? { voice: ctx.voice, signal: "set by the app" } : detectVoice(view, tokens, ctx.patientNames);
  const scs = buildSentenceContexts(view, sentences, tokens, triggers, consumed, voice.voice, ctx.patientNames);

  const sentenceOf = (pos: number) => {
    const i = sentences.findIndex((s) => pos >= s.start && pos < s.end);
    return i >= 0 ? i : Math.max(0, sentences.findIndex((s) => pos < s.end));
  };

  const noContext = !!ctx.noContext;
  const contextOf = (sc: SentenceContext, m: { start: number; end: number }): ContextResult =>
    noContext ? { ...NO_CONTEXT, triggers: [] } : analyzeInSentence(sc, m, text);

  const items: Item[] = [];
  for (const m of concepts) {
    const concept = m.term.concept as ConceptKey;
    const si = sentenceOf(m.start);
    const sc = scs[si];
    if (!sc) continue;
    const c = contextOf(sc, m);
    const isScale = concept === "energy" || concept === "sleep" || concept === "appetite";
    items.push({
      source: "lexicon",
      concept,
      field: CONCEPTS[concept].field,
      conceptId: isConceptId(concept) ? concept : null,
      start: m.start,
      end: m.end,
      value: m.term.value,
      certainty: isScale && !m.term.explicitValue ? "inferred" : "explicit",
      anchored: !!m.term.anchored,
      precursor: m.term.role === "precursor",
      guess: m.term.guess ?? null,
      changeOnly: !!m.term.changeOnly,
      invalid: null,
      ctx: c,
      sentence: si,
      // No severity from a guess: "a bit off balance" says nothing about how dizzy.
      severity: concept === "dizziness" && !m.term.guess ? dizzinessSeverity(text, m.start, m.end, sc.seg.start, sc.seg.end) : null,
      skip: null,
    });
  }
  for (const r of ratings as RatingMatch[]) {
    const si = sentenceOf(r.start);
    const sc = scs[si];
    if (!sc) continue;
    items.push({
      source: "rating",
      concept: r.field,
      field: r.field,
      conceptId: null,
      start: r.start,
      end: r.end,
      value: r.value,
      certainty: "explicit",
      anchored: true,
      precursor: false,
      guess: null,
      changeOnly: false,
      invalid: r.valid ? null : r.problem,
      ctx: contextOf(sc, r),
      sentence: si,
      severity: null,
      skip: null,
    });
  }
  items.sort((a, b) => a.start - b.start);
  return { view, story, sentences, scs, items, noContext, voice, medView: { tokens } };
}

// ---------------------------------------------------------------------------
// Stage 2: decide which mentions count for today

function classify(b: Built): void {
  for (const it of b.items) {
    const q = () => contextQuote(b, it);
    const isScale = it.concept === "energy" || it.concept === "sleep" || it.concept === "appetite";
    if (it.invalid) {
      it.skip = `Rating "${span(b.view, b.story, it.start, it.end).quote}" ${it.invalid}`;
    } else if (it.changeOnly) {
      it.skip = `Describes a change, not whether it is there today ("${q()}")`;
    } else if (it.ctx.experiencer === "other") {
      it.skip = `Mentioned for someone else ("${q()}")`;
    } else if (it.ctx.question) {
      it.skip = `Asked as a question, not something that happened ("${q()}")`;
    } else if (it.ctx.uncertain) {
      it.skip = `Said with uncertainty ("${q()}")`;
    } else if (it.ctx.temporality === "hypothetical") {
      it.skip = `A possibility or worry, not something that happened ("${q()}")`;
    } else if (it.ctx.temporality === "historical") {
      const when = triggerQuote(b, it, "historical");
      it.skip = `About an earlier time${when ? ` ("${when}")` : ""}, not today ("${q()}")`;
    } else if (it.concept === "appetite" && it.ctx.negated && it.value === "better") {
      // Appetite is categorical: a negated "better" wording ("didn't have a good appetite",
      // "wasn't very hungry") means less than usual. Mapped as an inferred suggestion, and the
      // evidence span is widened to include the negation words.
      it.value = "worse";
      it.certainty = "inferred";
      for (const t of it.ctx.triggers) if (t.kind === "negation" && t.end <= it.start && it.start - t.end <= 40) it.start = Math.min(it.start, t.start);
    } else if (isScale && it.ctx.negated) {
      it.skip = `Negative wording does not map to a ${CONCEPTS[it.concept].label} level ("${q()}")`;
    } else if (it.guess && it.ctx.negated) {
      // "I wasn't off balance" is not a "no" to the dizziness question, so a denied guess proposes nothing.
      it.skip = `Denied ${it.guess} is not an answer about ${CONCEPTS[it.concept].label} ("${q()}")`;
    }
  }
  // Trip/slip/lost-balance cues that are part of an actual fall in the same sentence.
  const falls = b.items.filter((x) => x.concept === "fall" && !x.skip && !x.ctx.negated);
  for (const it of b.items) {
    if (it.concept !== "nearFall" || !it.precursor || it.skip || it.ctx.negated) continue;
    if (falls.some((f) => f.sentence === it.sentence)) it.skip = `Part of the fall described ("${contextQuote(b, it)}")`;
  }
}

// ---------------------------------------------------------------------------
// Stage 3: resolve fields

type Resolved<V> = { kind: "value"; value: V; items: Item[]; certainty: "explicit" | "inferred" } | { kind: "conflict"; items: Item[] } | null;

/** Later statements in a corrective sentence ("Actually…") win; otherwise disagreement = conflict. */
function correctiveWinner(cands: Item[], b: Built): Item | null {
  const isCorrective = (c: Item) => !b.noContext && (!!b.scs[c.sentence]?.corrective || c.ctx.corrected);
  const corrective = cands.filter(isCorrective);
  if (corrective.length === 0) return null;
  const last = corrective[corrective.length - 1];
  // Only a correction if it comes after an earlier, different statement.
  return cands.some((c) => !isCorrective(c) && c.start < last.start) ? last : null;
}

function resolveBoolean(cands: Item[], b: Built): Resolved<boolean> {
  if (cands.length === 0) return null;
  const pos = cands.filter((c) => !c.ctx.negated);
  const neg = cands.filter((c) => c.ctx.negated);
  if (neg.length === 0) return { kind: "value", value: true, items: pos, certainty: "explicit" };
  if (pos.length === 0) return { kind: "value", value: false, items: neg, certainty: "explicit" };
  const win = correctiveWinner(cands, b);
  if (win) return { kind: "value", value: !win.ctx.negated, items: [win], certainty: "explicit" };
  // Happened earlier today, gone now ("Dizzy this morning, not dizzy now") → it still happened today.
  // Anchors are clause-local, so "No dizziness this morning but by lunchtime I was dizzy" stays a conflict.
  const earlier = pos.some((c) => c.ctx.anchor === "earlier");
  const nowNeg = neg.every((c) => c.ctx.anchor === "now");
  if (earlier && nowNeg) return { kind: "value", value: true, items: pos, certainty: "explicit" };
  return { kind: "conflict", items: cands };
}

function resolveScale(cands: Item[], b: Built): Resolved<number> {
  if (cands.length === 0) return null;
  const explicit = cands.filter((c) => c.source === "rating");
  const pool = explicit.length > 0 ? explicit : cands;
  const values = [...new Set(pool.map((c) => c.value as number))];
  const certainty = explicit.length > 0 ? "explicit" : "inferred";
  if (values.length === 1) return { kind: "value", value: values[0], items: pool, certainty };
  const win = correctiveWinner(pool, b);
  if (win) return { kind: "value", value: win.value as number, items: [win], certainty };
  const spread = Math.max(...values) - Math.min(...values);
  if (explicit.length === 0 && spread <= 1) {
    // Close wordings ("tired but okay"): prefer wording that names the field, else the lower level.
    const anchored = pool.filter((c) => c.anchored);
    const chosenPool = anchored.length > 0 && new Set(anchored.map((c) => c.value)).size === 1 ? anchored : pool;
    const v = Math.min(...chosenPool.map((c) => c.value as number));
    return { kind: "value", value: v, items: chosenPool.filter((c) => c.value === v), certainty };
  }
  return { kind: "conflict", items: pool };
}

function resolveCategory(cands: Item[], b: Built): Resolved<AppetiteValue> {
  if (cands.length === 0) return null;
  const values = [...new Set(cands.map((c) => c.value as AppetiteValue))];
  const certainty = cands.every((c) => c.certainty === "explicit") ? "explicit" : "inferred";
  if (values.length === 1) return { kind: "value", value: values[0], items: cands, certainty };
  const win = correctiveWinner(cands, b);
  if (win) return { kind: "value", value: win.value as AppetiteValue, items: [win], certainty: win.certainty };
  return { kind: "conflict", items: cands };
}

// ---------------------------------------------------------------------------
// Public API

let warmed = false;

/**
 * Compile and JIT every pattern once (one-byte and two-byte strings), so the first real check-in
 * is as fast as the rest (~0.3 ms). Safe to call repeatedly.
 */
export function warmUpNlp(): void {
  if (warmed) return;
  warmed = true;
  const today = "2026-01-01";
  extractCheckIn("Felt a bit dizzy this morning, no falls. Energy 3/5, slept badly.", { meds: [], today });
  extractCheckIn("Woozy 😕 ankles swollen, didn’t eat much — my sister fell.", { meds: [], today });
}

/**
 * Extract diary proposals from a check-in story. Pure and synchronous.
 * @returns Extraction (SPEC §10) plus voice/corrections details for the explanation UI.
 */
export function extractCheckIn(story: string, ctx: ExtractContext): DetailedExtraction {
  const t0 = nowMs();
  const built = buildItems(story, ctx);
  const b: Built = built;
  classify(b);

  const proposals: Proposal[] = [];
  const toSpan = (s: number, e: number) => span(b.view, story, s, e);
  const candidates = (pred: (it: Item) => boolean) => b.items.filter((it) => !it.skip && pred(it));

  // Boolean core fields.
  let dizzinessTrue: Item[] = [];
  for (const field of ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"] as const) {
    // Best-guess wordings ("legs felt wobbly") count only when nothing explicit was said about the field.
    const all = candidates((it) => it.field === field);
    const firm = all.filter((it) => !it.guess);
    const r = resolveBoolean(firm.length > 0 ? firm : all, b);
    if (!r) continue;
    if (r.kind === "conflict") {
      const quotes = r.items.map((it) => {
        const e = evidence(b, it, false);
        return `"${toSpan(e.start, e.end).quote}"`;
      });
      proposals.push({
        field, value: null, certainty: "conflict", origin: "nlp",
        spans: r.items.map((it) => { const e = evidence(b, it, false); return toSpan(e.start, e.end); }),
        reason: `Mentioned both ways (${[...new Set(quotes)].join(" and ")}) — which is right for today?`,
      });
      continue;
    }
    const lead = r.items[0];
    const e = evidence(b, lead, false);
    const sp = toSpan(e.start, e.end);
    // Only guesses left (firm is empty): shown as "My best guess — please check" and never auto-accepted.
    const guess = lead.guess;
    proposals.push({
      field, value: r.value, certainty: guess ? "inferred" : "explicit", origin: "nlp",
      spans: [sp, ...r.items.slice(1, 3).map((it) => { const x = evidence(b, it, false); return toSpan(x.start, x.end); })],
      reason: guess
        ? `"${sp.quote}" suggests ${guess}, filed under ${CONCEPTS[field].label} — please check${correctionNote(b, e.start, e.end)}`
        : `From "${sp.quote}"${correctionNote(b, e.start, e.end)}`,
    });
    if (field === "dizziness" && r.value === true) dizzinessTrue = r.items;
  }

  // Dizziness severity: only when dizziness is proposed as present.
  const sev = dizzinessTrue.filter((it) => it.severity).sort((a, z) => (z.severity!.value - a.severity!.value));
  if (sev.length > 0) {
    const it = sev[0];
    const e = evidence(b, it, true);
    const sp = toSpan(e.start, e.end);
    const v = it.severity!.value;
    proposals.push({
      field: "dizzinessSeverity", value: v, certainty: "inferred", origin: "nlp", spans: [sp],
      reason: `"${sp.quote}" suggests ${SEVERITY_WORD[v]} dizziness (${v} of 3) — please check${correctionNote(b, e.start, e.end)}`,
    });
  }

  // Scale fields.
  for (const field of ["energy", "sleep"] as const) {
    const r = resolveScale(candidates((it) => it.field === field), b);
    if (!r) continue;
    if (r.kind === "conflict") {
      const quotes = [...new Set(r.items.map((it) => `"${toSpan(it.start, it.end).quote}"`))];
      proposals.push({
        field, value: null, certainty: "conflict", origin: "nlp", spans: r.items.map((it) => toSpan(it.start, it.end)),
        reason: `Different ${field} levels mentioned (${quotes.join(" and ")}) — which fits today?`,
      });
      continue;
    }
    const lead = r.items[0];
    const sp = toSpan(lead.start, lead.end);
    const value = r.value as 1 | 2 | 3 | 4 | 5;
    proposals.push({
      field, value, certainty: r.certainty, origin: "nlp", spans: [sp],
      reason:
        r.certainty === "explicit"
          ? `From "${sp.quote}"${correctionNote(b, lead.start, lead.end)}`
          : `"${sp.quote}" suggests ${field} ${value} of 5 — please check${correctionNote(b, lead.start, lead.end)}`,
    });
  }
  {
    const r = resolveCategory(candidates((it) => it.field === "appetite"), b);
    if (r && r.kind === "conflict") {
      const quotes = [...new Set(r.items.map((it) => `"${toSpan(it.start, it.end).quote}"`))];
      proposals.push({
        field: "appetite", value: null, certainty: "conflict", origin: "nlp", spans: r.items.map((it) => toSpan(it.start, it.end)),
        reason: `Appetite described in different ways (${quotes.join(" and ")}) — which fits today?`,
      });
    } else if (r) {
      const lead = r.items[0];
      const sp = toSpan(lead.start, lead.end);
      proposals.push({
        field: "appetite", value: r.value, certainty: r.certainty, origin: "nlp", spans: [sp],
        reason:
          r.certainty === "explicit"
            ? `From "${sp.quote}"`
            : `"${sp.quote}" suggests appetite ${APPETITE_WORD[r.value]} — please check${correctionNote(b, lead.start, lead.end)}`,
      });
    }
  }
  proposals.sort((a, z) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(z.field));

  // Other symptom concepts (outside the core form).
  const otherSymptoms: OtherSymptom[] = [];
  const otherIds = [...new Set(b.items.filter((it) => it.conceptId).map((it) => it.conceptId as ConceptId))];
  for (const id of otherIds) {
    const r = resolveBoolean(candidates((it) => it.conceptId === id), b);
    if (!r || r.kind === "conflict") continue;
    const e = evidence(b, r.items[0], false);
    otherSymptoms.push({ conceptId: id, present: r.value, span: toSpan(e.start, e.end) });
  }

  // Mentions + skipped (for the explanation UI).
  const mentions: Mention[] = [];
  const skipped: Extraction["skipped"] = [];
  for (const it of b.items) {
    const mention: Mention = {
      concept: (it.field ?? it.conceptId) as Mention["concept"],
      span: toSpan(it.start, it.end),
      negated: it.ctx.negated,
      temporality: it.ctx.temporality,
      experiencer: it.ctx.experiencer,
      triggers: it.ctx.triggers.map((t) => toSpan(t.start, t.end)),
    };
    mentions.push(mention);
    if (it.skip) skipped.push({ mention, reason: it.skip });
  }

  // Medication remarks.
  const medHits = findMedNotes(
    b.view,
    b.sentences,
    b.scs.map((sc) => sc.boundaries),
    built.medView.tokens,
    ctx.meds,
    ctx.today,
  );
  const medNotes: Extraction["medNotes"] = medHits.map((h) => {
    const sp = toSpan(h.start, h.end);
    return { medicationId: h.medicationId, text: sp.quote, span: sp };
  });

  return {
    proposals,
    otherSymptoms,
    mentions,
    medNotes,
    skipped,
    durationMs: Math.max(0, nowMs() - t0),
    voice: built.voice,
    corrections: [...b.view.corrections],
    engine: NLP_ENGINE_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Applying confirmed proposals

function setField(a: DiaryAnswers, field: DiaryField, value: Proposal["value"]): void {
  switch (field) {
    case "energy":
    case "sleep":
      if (value === null || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5)) {
        a[field] = value as DiaryAnswers["energy"];
      }
      return;
    case "dizzinessSeverity":
      if (value === null || value === 1 || value === 2 || value === 3) a.dizzinessSeverity = value;
      return;
    case "appetite":
      if (value === null || value === "better" || value === "same" || value === "worse") a.appetite = value;
      return;
    case "dizziness":
    case "drowsiness":
    case "confusion":
    case "fall":
    case "nearFall":
    case "swelling":
      if (value === null || typeof value === "boolean") a[field] = value;
      return;
  }
}

/**
 * Apply the proposals the person accepted. Conflict proposals and invalid values are ignored;
 * severity is cleared whenever dizziness is not "yes". Returns a new object.
 */
export function applyProposals(answers: DiaryAnswers, proposals: Proposal[], accepted: DiaryField[]): DiaryAnswers {
  const next: DiaryAnswers = { ...answers };
  const ordered = [...proposals].sort((a, z) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(z.field));
  for (const p of ordered) {
    if (!accepted.includes(p.field) || p.certainty === "conflict" || p.value === null) continue;
    setField(next, p.field, p.value);
  }
  if (next.dizziness !== true) next.dizzinessSeverity = null;
  return next;
}
