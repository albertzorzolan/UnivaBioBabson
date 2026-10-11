// Corpus evaluation for the NLP engine, implementing the scoring in eval/ANNOTATION-GUIDE.md:
//   per field: TP = proposed value equals gold; FP = proposed but not in gold, or value differs;
//              FN = gold field not proposed, or value differs.
// Conflict proposals (value null — "which is right?") are questions to the user, not predictions.
// Pure and browser-safe so the How-it-works page can run it live on the bundled dev corpus.

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
    const ex = extractCheckIn(c.story, { meds: ctx.meds, today: ctx.today, patientNames: ctx.patientNames });
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
