// Differential false-reject check for verifier changes (run by hand; not part of `npm test`).
//
// The template brief, the finding questions and the Ask answers are code-written, and each sentence must pass
// verifySentence or it is left out. A stricter verifier could therefore drop the app's own sentences without
// any test failing. This check renders those sentences for the fictional seed on 20 dates (Oct 5–24, 2026) and
// many Ask questions, once with the submitted verifier and once with today's, and fails if any sentence kept by
// the submitted verifier is missing today. Steps (eval/VERIFIER-REDTEAM.md):
//
//   npx vitest run --config eval/verifier-baseline.config.ts eval/verifier-engine-diff.check.ts
//   KINWISE_VERIFIER=current npx vitest run --config eval/verifier-baseline.config.ts eval/verifier-engine-diff.check.ts
//
// Output goes to tmp/verifier-diff/ (not committed).

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Medication, MetricKey } from "../src/model/types";
import { createSeed } from "../src/model/seed";
import { addDays } from "../src/model/dates";
import { analyzeTimeline } from "../src/engine/timeline/signals";
import { knownEffect } from "../src/kb";
import { reviewMedications } from "../src/engine/meds/review";
import { SUGGESTED_QUESTIONS, buildEvidence, defaultPeriod, findingQuestionSentences, retrieveForQuestion, templateBrief } from "../src/engine/brief";

const OUT_DIR = fileURLToPath(new URL("../tmp/verifier-diff/", import.meta.url));
const MODE = process.env.KINWISE_VERIFIER === "current" ? "current" : "submitted";

const QUESTIONS = [
  ...SUGGESTED_QUESTIONS,
  "Any headaches lately?",
  "did she mention dry mouth this week?",
  "Did she miss any doses?",
  "Did the ankle swelling get better after furosemide?",
  "Does she take any opioids?",
  "how many times did she feel dizzy",
  "How was her sleep before lorazepam?",
  "How was she today?",
  "Is she taking ibuprofen?",
  "Tell me about lorazepam",
  "Tell me about furosemide",
  "Tell me about oxybutynin",
  "Tell me about Tylenol PM",
  "Tell me about omeprazole",
  "What did Dr. Okafor prescribe?",
  "what did she say about her bladder pills",
  "What did she say about sleep?",
  "What dose of lorazepam is she on?",
  "What happened on Oct 5?",
  "What is the Tylenol PM for?",
  "what meds does dr lee prescribe",
  "What's her ACB?",
  "What's the reason she takes Tylenol PM?",
  "When did she start taking Ativan?",
  "When was her last fall?",
  "which blood pressure medicines is she on",
  "Which medicines did cardiology prescribe?",
  "Which of her medicines are benzodiazepines?",
  "Who prescribed the lorazepam?",
  "How is her energy?",
  "Has she been confused?",
  "How is her appetite?",
  "Any swelling?",
  "How many falls this month?",
  "Is she drowsy during the day?",
  "What changed since lorazepam started?",
];

const isKnownEffect = (m: Medication, k: MetricKey) => knownEffect(m.ingredientIds, k);

/** Every code-written sentence the engines keep, per date, as "<where> | <text>". */
function render(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (let d = 0; d < 20; d++) {
    const today = addDays("2026-10-05", d);
    const data = createSeed(today);
    const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect, medEvents: data.medEvents });
    const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals });
    const { from, to } = defaultPeriod(today);
    const pkg = buildEvidence({ data, from, to, review, timeline });
    const brief = templateBrief(pkg, { data, review, timeline });
    const lines = [...brief.reason, ...brief.noticed, ...brief.questions].map((s) => `brief | ${s.text}`);
    for (const f of review.findings) for (const s of findingQuestionSentences(f, pkg, data)) lines.push(`question ${f.key} | ${s.text}`);
    for (const q of QUESTIONS) {
      const r = retrieveForQuestion(q, { data, pkg, today, review, isKnownEffect: knownEffect });
      for (const s of r.deterministicAnswer) lines.push(`ask ${q} | ${s.text}`);
    }
    out[today] = lines;
  }
  return out;
}

describe(`engine sentences under the ${MODE} verifier`, () => {
  it("renders and saves them; today's verifier keeps every sentence the submitted one kept", { timeout: 120_000 }, () => {
    const now = render();
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}${MODE}.json`, JSON.stringify(now, null, 1));
    const other = `${OUT_DIR}submitted.json`;
    if (MODE !== "current" || !existsSync(other)) return;
    const submitted = JSON.parse(readFileSync(other, "utf8")) as Record<string, string[]>;
    const lost = Object.entries(submitted).flatMap(([day, lines]) => lines.filter((l) => !(now[day] ?? []).includes(l)).map((l) => `${day} ${l}`));
    const total = Object.values(submitted).reduce((n, l) => n + l.length, 0);
    console.log(`engine sentences compared: ${total} over ${Object.keys(submitted).length} dates; lost: ${lost.length}`);
    expect(lost).toEqual([]);
  });
});
