// Internal review probes regression set: eval/nlp-probe-judges.json.
// This file holds probes written by simulated AI review agents, not hackathon judges. During internal review
// (2026-10-17) the team ran AI agents that role-played reviewers and wrote probe sentences: not written by the NLP
// author, but not independent of the team and not user testing. The file and its `judgeExpected` field keep their
// original names because other docs link them. Relabelled from eval/ANNOTATION-GUIDE.md.
// It is a regression file, not a third benchmark: the dev and held-out scores (eval/nlp.eval.test.ts) do not include it.
// For every case the engine's firm answers must equal `expect`, its low-confidence "please check" guesses must equal
// `expectGuess`, and every `expectOther` symptom must match. Cases marked `knownMiss` document an error the engine still
// makes; the test checks that they still miss, so the file cannot quietly claim a fix (remove the mark when one lands).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCheckIn } from "../src/engine/nlp/extract";
import { evaluateCorpus, type CorpusCase } from "../src/engine/nlp/evaluate";
import { EVAL_MEDS, EVAL_PATIENT_NAMES, EVAL_TODAY } from "../src/engine/nlp/fixtures";
import type { ConceptId, DiaryField } from "../src/model/types";

type Value = number | boolean | string;
interface ProbeCase extends CorpusCase {
  source: string;
  expectGuess?: Partial<Record<DiaryField, boolean>>;
  judgeExpected?: Partial<Record<DiaryField, Value>>; // the review agent's own expected values (original field name)
  note?: string;
  knownMiss?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const probe = JSON.parse(readFileSync(join(here, "nlp-probe-judges.json"), "utf8")) as { version: number; cases: ProbeCase[] };
const ctx = { meds: EVAL_MEDS, today: EVAL_TODAY, patientNames: EVAL_PATIENT_NAMES };
const BOOLEAN_FIELDS = new Set<DiaryField>(["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"]);

/** Split the engine's proposals into firm answers and boolean best guesses (inferred = "please check"). */
function read(story: string) {
  const ex = extractCheckIn(story, ctx);
  const firm: Partial<Record<DiaryField, Value>> = {};
  const guess: Partial<Record<DiaryField, Value>> = {};
  for (const p of ex.proposals) {
    if (p.certainty === "conflict" || p.value === null) continue;
    if (BOOLEAN_FIELDS.has(p.field) && p.certainty === "inferred") guess[p.field] = p.value;
    else firm[p.field] = p.value;
  }
  const other: Partial<Record<ConceptId, boolean>> = {};
  for (const o of ex.otherSymptoms) other[o.conceptId] = o.present;
  return { firm, guess, other };
}

function matches(c: ProbeCase): boolean {
  const r = read(c.story);
  const otherOk = Object.entries(c.expectOther ?? {}).every(([k, v]) => r.other[k as ConceptId] === v);
  return JSON.stringify(sorted(r.firm)) === JSON.stringify(sorted(c.expect)) && JSON.stringify(sorted(r.guess)) === JSON.stringify(sorted(c.expectGuess ?? {})) && otherOk;
}
const sorted = (o: object) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

describe("internal review probes regression set (eval/nlp-probe-judges.json)", () => {
  it("is well formed", () => {
    expect(probe.cases.length).toBeGreaterThanOrEqual(34);
    expect(new Set(probe.cases.map((c) => c.id)).size).toBe(probe.cases.length);
    for (const c of probe.cases) expect(c.source.length).toBeGreaterThan(0);
  });

  it.each(probe.cases.filter((c) => !c.knownMiss).map((c) => [c.id, c.story, c] as const))("%s %s", (_id, _story, c) => {
    const r = read(c.story);
    expect(sorted(r.firm)).toEqual(sorted(c.expect));
    expect(sorted(r.guess)).toEqual(sorted(c.expectGuess ?? {}));
    for (const [k, v] of Object.entries(c.expectOther ?? {})) expect(r.other[k as ConceptId]).toBe(v);
  });

  it.each(probe.cases.filter((c) => c.knownMiss).map((c) => [c.id, c.story, c] as const))("known miss still documented: %s %s", (_id, _story, c) => {
    // If this fails, the engine now gets the case right: remove its knownMiss mark and update eval/NLP-ERRORS.md.
    expect(matches(c)).toBe(false);
  });

  it("never turns a denial of unsteadiness into a yes", () => {
    const c = probe.cases.find((x) => x.id === "jp20")!;
    const r = read(c.story);
    expect(r.firm.dizziness).not.toBe(true);
    expect(r.guess.dizziness).not.toBe(true);
  });

  it("reports both views: the review agent's own script check and strict guide scoring", () => {
    // 1. The simulated AI-scientist review agent's script: each judgeExpected field counts as a hit when the proposed value matches
    //    (any certainty), and a proposed yes for an unlisted symptom counts as a false positive. Before this work: 18/25, 0 FP.
    let hit = 0;
    let total = 0;
    let fp = 0;
    for (const c of probe.cases.filter((x) => x.judgeExpected)) {
      const r = read(c.story);
      const got = { ...r.firm, ...r.guess };
      for (const [k, v] of Object.entries(c.judgeExpected!)) {
        total++;
        if (got[k as DiaryField] === v) hit++;
      }
      for (const [k, v] of Object.entries(got)) if (!(k in c.judgeExpected!) && BOOLEAN_FIELDS.has(k as DiaryField) && v === true) fp++;
    }
    // 2. Strict guide scoring of all cases (guesses count as proposals, so the unsteadiness guesses are false positives).
    const strict = evaluateCorpus("probe", probe, ctx);
    console.log(
      `internal review probes: review-agent script ${hit}/${total} hits, ${fp} false positives · strict guide micro ` +
        `P ${(strict.micro.precision * 100).toFixed(1)}% R ${(strict.micro.recall * 100).toFixed(1)}% F1 ${(strict.micro.f1 * 100).toFixed(1)}% ` +
        `(tp ${strict.micro.tp}, fp ${strict.micro.fp}, fn ${strict.micro.fn}) · known misses ${probe.cases.filter((c) => c.knownMiss).length}`,
    );
    expect(total).toBe(25);
    expect(hit).toBeGreaterThanOrEqual(21);
    expect(fp).toBe(0);
  });
});
