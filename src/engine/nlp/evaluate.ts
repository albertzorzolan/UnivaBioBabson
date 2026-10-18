// Corpus evaluation for the NLP engine, implementing the scoring in eval/ANNOTATION-GUIDE.md:
//   per field: TP = proposed value equals gold; FP = proposed but not in gold, or value differs;
//              FN = gold field not proposed, or value differs.
// Conflict proposals (value null — "which is right?") are questions to the user, not predictions.
// Pure and browser-safe so the How-it-works page can run it live on the bundled dev corpus.
//
// compareWithBaseline() answers "F1 versus what?": it scores the same corpus with ConText switched off
// (lexicon-only baseline: every match counts as affirmed, current and the patient's own) and puts story-level
// bootstrap 95% confidence intervals on both micro-F1s and on their paired difference.

import type { ConceptId, DiaryField, ISODate, Medication } from "../../model/types";
import { FIELD_ORDER, NLP_ENGINE_VERSION, extractCheckIn, warmUpNlp } from "./extract";

export interface CorpusCase {
  id: string;
  story: string;
  expect: Partial<Record<DiaryField, number | boolean | string>>;
  expectOther?: Partial<Record<ConceptId, boolean>>;
  tags?: string[];
}

export interface Corpus {
  version: number;
  author?: string;
  cases: CorpusCase[];
}

export interface Prf {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  /** Number of gold labels. */
  support: number;
}

export interface FieldError {
  id: string;
  field: string;
  gold: number | boolean | string | null;
  predicted: number | boolean | string | null;
  kind: "false_positive" | "false_negative" | "wrong_value";
  tags: string[];
}

export interface SubsetReport {
  cases: number;
  errors: number;
  fp: number;
  fn: number;
}

export interface EvalReport {
  corpus: string;
  engine: string;
  cases: number;
  perField: Record<DiaryField, Prf>;
  micro: Prf;
  macroF1: number;
  within1: Record<"energy" | "sleep" | "dizzinessSeverity", { gold: number; exact: number; within1: number; rate: number }>;
  other: { micro: Prf; perConcept: Partial<Record<ConceptId, Prf>> };
  subsets: Record<string, SubsetReport>;
  negation: { goldNegatives: number; correct: number; accuracy: number; polarityFlips: number };
  exactCases: number;
  exactRate: number;
  conflictsSurfaced: number;
  latency: { meanMs: number; p95Ms: number; maxMs: number };
  errors: FieldError[];
}

/** Other-symptom concepts defined in the annotation guide (v1) — the only ones scored. */
export const GUIDE_OTHER_CONCEPTS: readonly ConceptId[] = [
  "nausea", "constipation", "dry_mouth", "headache", "cough", "blurred_vision", "urinary_problem", "low_mood", "anxiety",
  "pain", "shortness_of_breath", "tremor", "rash", "diarrhea", "palpitations",
];

function prf(tp: number, fp: number, fn: number, support: number): Prf {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1, support };
}

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

function roundPrf(p: Prf): Prf {
  return { ...p, precision: round(p.precision), recall: round(p.recall), f1: round(p.f1) };
}

/** Score one corpus. Deterministic apart from latency figures. */
export function evaluateCorpus(
  name: string,
  corpus: Corpus,
  ctx: { meds: Medication[]; today: ISODate; patientNames?: string[] },
  opts: { noContext?: boolean } = {},
): EvalReport {
  warmUpNlp();
  const counts = Object.fromEntries(FIELD_ORDER.map((f) => [f, { tp: 0, fp: 0, fn: 0, support: 0 }])) as Record<
    DiaryField,
    { tp: number; fp: number; fn: number; support: number }
  >;
  const otherCounts: Partial<Record<ConceptId, { tp: number; fp: number; fn: number; support: number }>> = {};
  const within1 = {
    energy: { gold: 0, exact: 0, within1: 0, rate: 0 },
    sleep: { gold: 0, exact: 0, within1: 0, rate: 0 },
    dizzinessSeverity: { gold: 0, exact: 0, within1: 0, rate: 0 },
  };
  const subsets: Record<string, SubsetReport> = {};
  const errors: FieldError[] = [];
  const negation = { goldNegatives: 0, correct: 0, accuracy: 0, polarityFlips: 0 };
  const latencies: number[] = [];
  let exactCases = 0;
  let conflictsSurfaced = 0;

  for (const c of corpus.cases) {
    const ex = extractCheckIn(c.story, { meds: ctx.meds, today: ctx.today, patientNames: ctx.patientNames, noContext: opts.noContext });
    latencies.push(ex.durationMs);
    const tags = c.tags ?? [];
    for (const t of tags) subsets[t] ??= { cases: 0, errors: 0, fp: 0, fn: 0 };
    for (const t of tags) subsets[t].cases++;
    const predicted = new Map<DiaryField, number | boolean | string>();
    for (const p of ex.proposals) {
      if (p.certainty === "conflict" || p.value === null) {
        conflictsSurfaced++;
        continue;
      }
      predicted.set(p.field, p.value);
    }
    let caseErrors = 0;
    for (const field of FIELD_ORDER) {
      const gold = c.expect[field];
      const pred = predicted.get(field);
      const hasGold = gold !== undefined && gold !== null;
      const hasPred = pred !== undefined;
      if (hasGold) counts[field].support++;
      if (hasGold && typeof gold === "boolean") {
        if (gold === false) {
          negation.goldNegatives++;
          if (pred === false) negation.correct++;
        }
        if (hasPred && typeof pred === "boolean" && pred !== gold) negation.polarityFlips++;
      }
      if (hasGold && (field === "energy" || field === "sleep" || field === "dizzinessSeverity")) {
        within1[field].gold++;
        if (hasPred && pred === gold) within1[field].exact++;
        if (hasPred && Math.abs(Number(pred) - Number(gold)) <= 1) within1[field].within1++;
      }
      let kind: FieldError["kind"] | null = null;
      if (hasGold && hasPred && pred === gold) counts[field].tp++;
      else if (hasGold && hasPred) {
        counts[field].fp++;
        counts[field].fn++;
        kind = "wrong_value";
      } else if (hasGold) {
        counts[field].fn++;
        kind = "false_negative";
      } else if (hasPred) {
        counts[field].fp++;
        kind = "false_positive";
      }
      if (kind) {
        caseErrors++;
        errors.push({ id: c.id, field, gold: hasGold ? (gold as number | boolean | string) : null, predicted: hasPred ? pred : null, kind, tags });
        for (const t of tags) {
          subsets[t].errors++;
          if (kind !== "false_negative") subsets[t].fp++;
          if (kind !== "false_positive") subsets[t].fn++;
        }
      }
    }
    if (caseErrors === 0) exactCases++;

    // Other concepts (reported, not part of the core micro-F1).
    const predOther = new Map(ex.otherSymptoms.map((o) => [o.conceptId, o.present]));
    for (const id of GUIDE_OTHER_CONCEPTS) {
      const gold = c.expectOther?.[id];
      const pred = predOther.get(id);
      if (gold === undefined && pred === undefined) continue;
      const k = (otherCounts[id] ??= { tp: 0, fp: 0, fn: 0, support: 0 });
      if (gold !== undefined) k.support++;
      if (gold !== undefined && pred === gold) k.tp++;
      else {
        if (pred !== undefined) k.fp++;
        if (gold !== undefined) k.fn++;
        errors.push({
          id: c.id, field: `other:${id}`, gold: gold ?? null, predicted: pred ?? null,
          kind: gold === undefined ? "false_positive" : pred === undefined ? "false_negative" : "wrong_value", tags,
        });
      }
    }
  }

  const perField = Object.fromEntries(
    FIELD_ORDER.map((f) => [f, roundPrf(prf(counts[f].tp, counts[f].fp, counts[f].fn, counts[f].support))]),
  ) as Record<DiaryField, Prf>;
  const sum = (k: "tp" | "fp" | "fn" | "support") => FIELD_ORDER.reduce((s, f) => s + counts[f][k], 0);
  const micro = roundPrf(prf(sum("tp"), sum("fp"), sum("fn"), sum("support")));
  const scored = FIELD_ORDER.filter((f) => counts[f].support > 0);
  const macroF1 = round(scored.reduce((s, f) => s + perField[f].f1, 0) / Math.max(1, scored.length));
  for (const k of Object.keys(within1) as Array<keyof typeof within1>) {
    within1[k].rate = round(within1[k].gold === 0 ? 1 : within1[k].within1 / within1[k].gold);
  }
  const perConcept: Partial<Record<ConceptId, Prf>> = {};
  let otp = 0, ofp = 0, ofn = 0, osup = 0;
  for (const [id, k] of Object.entries(otherCounts) as Array<[ConceptId, { tp: number; fp: number; fn: number; support: number }]>) {
    perConcept[id] = roundPrf(prf(k.tp, k.fp, k.fn, k.support));
    otp += k.tp; ofp += k.fp; ofn += k.fn; osup += k.support;
  }
  negation.accuracy = round(negation.goldNegatives === 0 ? 1 : negation.correct / negation.goldNegatives);
  const sorted = [...latencies].sort((a, z) => a - z);
  const latency = {
    meanMs: round(latencies.reduce((s, x) => s + x, 0) / Math.max(1, latencies.length), 3),
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0, 3),
    maxMs: round(sorted[sorted.length - 1] ?? 0, 3),
  };
  return {
    corpus: name,
    engine: NLP_ENGINE_VERSION,
    cases: corpus.cases.length,
    perField,
    micro,
    macroF1,
    within1,
    other: { micro: roundPrf(prf(otp, ofp, ofn, osup)), perConcept },
    subsets,
    negation,
    exactCases,
    exactRate: round(exactCases / Math.max(1, corpus.cases.length)),
    conflictsSurfaced,
    latency,
    errors,
  };
}

/** Core-field false positives in cases carrying `tag` (used for the experiencer/hypothetical gates). */
export function falsePositivesInSubset(report: EvalReport, tag: string): FieldError[] {
  return report.errors.filter((e) => !e.field.startsWith("other:") && e.tags.includes(tag) && e.kind !== "false_negative");
}

// ---------------------------------------------------------------------------
// Lexicon-only baseline and story-level bootstrap confidence intervals

/** Engine name recorded for the baseline run. */
export const BASELINE_NAME = "lexicon-only baseline (same lexicon and field resolution, ConText switched off)";
/** Bootstrap settings: fixed seed so the committed intervals are reproducible. */
export const BOOTSTRAP = { resamples: 2000, seed: 20261010 } as const;
/** Subsets whose error counts are compared between the engine and the baseline. */
export const CONTEXT_SUBSETS = ["negation", "experiencer_other", "hypothetical", "historical", "pseudo_negation", "double_negation"] as const;

/** mulberry32: tiny, well-distributed 32-bit PRNG (same generator as src/model/seed.ts and the timeline tests). */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CaseCounts {
  tp: number;
  fp: number;
  fn: number;
}

/**
 * Core-field TP/FP/FN per story, recovered from the report: FP = false-positive or wrong-value errors,
 * FN = false-negative or wrong-value errors, TP = labelled fields − FN (a labelled field is either right or an FN).
 */
export function countsPerCase(corpus: Corpus, report: EvalReport): CaseCounts[] {
  const byId = new Map<string, CaseCounts>();
  for (const c of corpus.cases) {
    const support = FIELD_ORDER.filter((f) => c.expect[f] !== undefined && c.expect[f] !== null).length;
    byId.set(c.id, { tp: support, fp: 0, fn: 0 });
  }
  for (const e of report.errors) {
    if (e.field.startsWith("other:")) continue;
    const k = byId.get(e.id);
    if (!k) continue;
    if (e.kind !== "false_negative") k.fp++;
    if (e.kind !== "false_positive") {
      k.fn++;
      k.tp--;
    }
  }
  return corpus.cases.map((c) => byId.get(c.id) as CaseCounts);
}

const microF1 = (k: CaseCounts) => prf(k.tp, k.fp, k.fn, 0).f1;

/** Percentile of a sorted array, linear interpolation between order statistics (type 7, R's default). */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export interface Ci95 {
  f1: [number, number];
  resamples: number;
  seed: number;
  unit: "story";
}

export interface SubsetDelta {
  cases: number;
  engineErrors: number;
  baselineErrors: number;
  /** baselineErrors − engineErrors: how many errors ConText removes on this subset (negative = it adds errors). */
  errorsAvoided: number;
}

export interface BaselineComparison {
  baseline: {
    engine: string;
    micro: Prf;
    macroF1: number;
    subsets: Record<string, SubsetReport>;
    negation: EvalReport["negation"];
    exactCases: number;
  };
  /** Engine micro-F1 interval. */
  ci95: Ci95;
  baselineCi95: Ci95;
  /** Paired interval of engine F1 − baseline F1 (the same resampled stories for both). */
  deltaCi95: Ci95 & { pointEstimate: number };
  subsetDeltas: Partial<Record<(typeof CONTEXT_SUBSETS)[number], SubsetDelta>>;
}

/**
 * Score the lexicon-only baseline on the same corpus and bootstrap both micro-F1s.
 * Bootstrap: resample stories with replacement (`resamples` times, fixed `seed`), recompute micro-F1 from the
 * summed core-field TP/FP/FN of the drawn stories; 95% interval = 2.5th and 97.5th percentiles. The difference
 * uses the same draws for both systems (paired), so it reflects only the effect of ConText.
 */
export function compareWithBaseline(
  name: string,
  corpus: Corpus,
  ctx: { meds: Medication[]; today: ISODate; patientNames?: string[] },
  engineReport: EvalReport,
  settings: { resamples: number; seed: number } = BOOTSTRAP,
): BaselineComparison {
  const base = evaluateCorpus(name, corpus, ctx, { noContext: true });
  const eng = countsPerCase(corpus, engineReport);
  const bas = countsPerCase(corpus, base);
  const n = corpus.cases.length;
  const rand = mulberry32(settings.seed);
  const fe: number[] = [];
  const fb: number[] = [];
  const fd: number[] = [];
  for (let b = 0; b < settings.resamples; b++) {
    const se = { tp: 0, fp: 0, fn: 0 };
    const sb = { tp: 0, fp: 0, fn: 0 };
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      se.tp += eng[j].tp; se.fp += eng[j].fp; se.fn += eng[j].fn;
      sb.tp += bas[j].tp; sb.fp += bas[j].fp; sb.fn += bas[j].fn;
    }
    const e = microF1(se);
    const x = microF1(sb);
    fe.push(e);
    fb.push(x);
    fd.push(e - x);
  }
  const ci = (xs: number[]): Ci95 => {
    const sorted = [...xs].sort((a, z) => a - z);
    return { f1: [round(quantile(sorted, 0.025)), round(quantile(sorted, 0.975))], resamples: settings.resamples, seed: settings.seed, unit: "story" };
  };
  const subsetDeltas: BaselineComparison["subsetDeltas"] = {};
  for (const t of CONTEXT_SUBSETS) {
    const e = engineReport.subsets[t];
    const x = base.subsets[t];
    if (!e || !x) continue;
    subsetDeltas[t] = { cases: e.cases, engineErrors: e.errors, baselineErrors: x.errors, errorsAvoided: x.errors - e.errors };
  }
  return {
    baseline: {
      engine: BASELINE_NAME,
      micro: base.micro,
      macroF1: base.macroF1,
      subsets: base.subsets,
      negation: base.negation,
      exactCases: base.exactCases,
    },
    ci95: ci(fe),
    baselineCi95: ci(fb),
    deltaCi95: { ...ci(fd), pointEstimate: round(engineReport.micro.f1 - base.micro.f1) },
    subsetDeltas,
  };
}
