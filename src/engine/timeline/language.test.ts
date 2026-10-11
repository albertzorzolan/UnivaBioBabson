// Contract with the brief's claim checker: every string this module renders becomes evidence text that the brief and
// the on-device model restate, so it must pass the project's real BANNED_PATTERNS (src/engine/brief/verify.ts) and
// fit verify.ts's 280-character sentence limit. Runs the engine over random diaries plus the demo seed.
import { describe, expect, it } from "vitest";
import type { CheckIn, DiaryAnswers, Medication } from "../../model/types";
import { addDays } from "../../model/dates";
import { createSeed } from "../../model/seed";
import { BANNED_PATTERNS } from "../brief/verify";
import {
  MULTIPLE_COMPARISONS_NOTE,
  SENTINEL_NOTE,
  SIGNAL_CAVEAT,
  STRENGTH_LABEL,
  TIMELINE_METHOD_SUMMARY,
} from "./rules";
import { analyzeTimeline, describeSignal, weeklyTrends } from "./signals";
import { makeMed } from "./test-fixtures";

const TODAY = "2026-10-10";

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["Lorazepam (Ativan)", "Tylenol PM (OTC)", "Furosemide (Lasix)", "x", "   "];

/** Every distinct string the engine renders for `trials` random records (starts, stops, gaps, nulls). */
function generatedTexts(trials: number): { evidence: Set<string>; other: Set<string> } {
  const evidence = new Set<string>(); // sentences that become evidence items (restated by the AI)
  const other = new Set<string>(); // reasons, headlines, labels, weekly patient texts
  for (let trial = 0; trial < trials; trial++) {
    const r = mulberry32(trial + 1);
    const meds: Medication[] = NAMES.map((name, i) => {
      const start = addDays(TODAY, -Math.floor(r() * 220));
      const end = r() < 0.4 ? addDays(start, Math.floor(r() * 60)) : null;
      return makeMed(`m${i}`, name, start, end);
    });
    const checkIns: CheckIn[] = [];
    for (let o = -240; o <= 0; o++) {
      if (r() < 0.25) continue;
      const yesNo = (p: number) => (r() < 0.1 ? null : r() < p);
      const rating = () => (r() < 0.1 ? null : ((1 + Math.floor(r() * 5)) as DiaryAnswers["energy"]));
      const answers: DiaryAnswers = {
        energy: rating(),
        sleep: rating(),
        appetite: r() < 0.1 ? null : (["better", "same", "worse"] as const)[Math.floor(r() * 3)],
        dizziness: yesNo(r() * 0.8),
        dizzinessSeverity: null,
        drowsiness: yesNo(0.3),
        confusion: yesNo(0.2),
        fall: yesNo(0.05),
        nearFall: yesNo(0.1),
        swelling: yesNo(0.3),
      };
      checkIns.push({
        id: `c${o}`,
        date: addDays(TODAY, o),
        answers,
        otherSymptoms: [],
        story: "",
        provenance: {},
        medNotes: [],
        confirmedAt: "",
        revision: 1,
      });
    }
    const result = analyzeTimeline({ checkIns, meds, today: TODAY, isKnownEffect: () => r() < 0.5 });
    for (const p of result.perMed) if (p.reason) other.add(p.reason);
    for (const s of result.signals) {
      evidence.add(s.text);
      const d = describeSignal(s, meds, TODAY);
      for (const v of [d.headline, d.statistics, d.overlap, d.knownEffect, d.strengthLabel]) if (v) other.add(v);
    }
    for (const x of result.sentinels) evidence.add(x.text);
    for (const w of weeklyTrends(checkIns, TODAY)) other.add(w.text);
  }
  const seed = createSeed(TODAY);
  const sr = analyzeTimeline({ checkIns: seed.checkIns, meds: seed.medications, today: TODAY, isKnownEffect: () => true });
  for (const s of sr.signals) evidence.add(s.text);
  for (const x of sr.sentinels) evidence.add(x.text);
  for (const t of [SIGNAL_CAVEAT, MULTIPLE_COMPARISONS_NOTE, TIMELINE_METHOD_SUMMARY, SENTINEL_NOTE, ...Object.values(STRENGTH_LABEL)]) {
    other.add(t);
  }
  return { evidence, other };
}

describe("rendered text passes the brief's claim checker", () => {
  const { evidence, other } = generatedTexts(120);

  it("generates a broad sample", () => {
    expect(evidence.size).toBeGreaterThan(150);
    expect(other.size).toBeGreaterThan(300);
  });

  it("contains no banned phrase (causal, advice, urgency, reassurance, diagnosis, claims, risk)", () => {
    const hits: string[] = [];
    for (const t of [...evidence, ...other]) {
      for (const b of BANNED_PATTERNS) if (b.pattern.test(t)) hits.push(`${b.reason}: ${t}`);
    }
    expect(hits).toEqual([]);
  });

  it("keeps every evidence sentence on one line and within 280 characters", () => {
    for (const t of evidence) {
      expect(t.length).toBeLessThanOrEqual(280);
      expect(t).not.toMatch(/[\n\r]/);
    }
  });
});
