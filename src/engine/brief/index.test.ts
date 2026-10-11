// End-to-end over the public barrel with the REAL engines and the compiled KB (whatever version is bound):
// seed → medication review → timeline → evidence → template brief → FHIR / Q&A / plain text. These assertions are
// invariants (grounding, validity, language), so they hold when the knowledge base content changes.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Medication, MetricKey } from "../../model/types";
import { createSeed } from "../../model/seed";
import { knownEffect } from "../../kb/index";
import { reviewMedications } from "../meds/review";
import { analyzeTimeline } from "../timeline/signals";
import * as brief from "./index";

const TODAY = "2026-10-11";

function realWorld(today = TODAY) {
  const data = createSeed(today);
  const isKnownEffect = (m: Medication, k: MetricKey) => knownEffect(m.ingredientIds, k);
  const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect });
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals });
  const { from, to } = brief.defaultPeriod(today, 30);
  const pkg = brief.buildEvidence({ data, from, to, review, timeline });
  const content = brief.templateBrief(pkg, { data, review, timeline });
  const vb = brief.toVisitBrief({ id: "brief-real", pkg, content, generation: brief.templateGenerationInfo(pkg, review), data });
  return { data, timeline, review, pkg, content, vb };
}

const R = realWorld();
const MED_NAMES = R.data.medications.map((m) => m.name);
const BANNED = [/\bcaused\b/i, /\bcausing\b/i, /\bsafe(?:ly|r|st)?\b/i, /\bshould stop\b/i, /\burgent(?:ly)?\b(?!\s+care)/i, /\bdiagnos\w*/i, /\bdangerous\b/i, /\brisk score\b/i];

describe("brief engine with the real review, timeline and KB", () => {
  it("builds a template brief whose citations all resolve", () => {
    expect(brief.missingEvidenceIds(R.content, R.pkg)).toEqual([]);
    expect(R.content.reason.length).toBeGreaterThan(0);
    expect(R.content.noticed.length).toBeGreaterThan(0);
    expect(R.content.reviewPrompts.length).toBeGreaterThan(0);
  });

  it("passes its own claim checker with the AI draft's options: every reason, observation and question", () => {
    const patientNames = ["Margaret", R.data.profile.displayName];
    for (const s of R.content.reason) expect(brief.verifySentence(s, R.pkg, { medNames: MED_NAMES, patientNames, maxLength: 400 }).issues, s.text).toEqual([]);
    for (const s of R.content.noticed) expect(brief.verifySentence(s, R.pkg, { medNames: MED_NAMES, patientNames, expect: "statement" }).issues, s.text).toEqual([]);
    expect(R.content.questions.length).toBeGreaterThanOrEqual(3);
    expect(R.content.questions.length).toBeLessThanOrEqual(brief.TEMPLATE_LIMITS.findingQuestionItems + brief.TEMPLATE_LIMITS.savedQuestions);
    for (const s of R.content.questions) expect(brief.verifySentence(s, R.pkg, { medNames: MED_NAMES, patientNames, expect: "question" }).issues, s.text).toEqual([]);
  });

  it("never gives a bare day count without its denominator ('on 10 days')", () => {
    const texts = [...R.content.reason, ...R.content.noticed, ...R.content.questions].map((s) => s.text);
    for (const t of texts) expect(/\bon \d+ (?:days|check-in days)\b/.test(t) && !/\bof \d+ (?:answered )?days\b/.test(t), t).toBe(false);
  });

  it("keeps generated (non-quoted) brief text free of banned language", () => {
    const own = [...R.content.noticed.map((s) => s.text), ...R.content.reviewPrompts.map((p) => p.text), ...R.content.limitations];
    for (const t of own) for (const re of BANNED) expect(re.test(t), `${re} in ${t}`).toBe(false);
  });

  it("exports a structurally valid FHIR document for the brief and for the bare record", () => {
    for (const b of [R.vb, null]) {
      const bundle = brief.toFhirBundle({ data: R.data, review: R.review, brief: b, today: TODAY });
      expect(brief.validateBundle(bundle)).toEqual([]);
      expect(bundle.meta?.tag?.[0].code).toBe("fictional-demo-data");
    }
  });

  it("answers every suggested question with grounded, verified sentences", () => {
    for (const q of brief.SUGGESTED_QUESTIONS) {
      expect(brief.routeQuestion(q)).toEqual({ inScope: true });
      const r = brief.retrieveForQuestion(q, { data: R.data, pkg: R.pkg, today: TODAY, review: R.review });
      expect(r.status, q).toBe("answered");
      expect(r.dropped, q).toBe(0);
      const merged = { ...R.pkg, items: [...R.pkg.items, ...r.items.filter((i) => !R.pkg.items.some((p) => p.id === i.id))] };
      for (const s of r.deterministicAnswer) {
        expect(brief.verifySentence(s, merged, { medNames: MED_NAMES, patientNames: ["Margaret"] }).issues, s.text).toEqual([]);
      }
    }
  });

  it("produces a Personal Medication List and portal text from the same record", () => {
    const pml = brief.toPersonalMedicationList({ data: R.data, review: R.review, today: TODAY });
    expect(pml.rows).toHaveLength(R.data.medications.filter((m) => !m.endDate).length);
    const text = brief.briefToPlainText(R.vb, { data: R.data, review: R.review, today: TODAY });
    expect(text).toContain(brief.SAFETY_LINE);
  });

  it("stays valid for other demo dates (the seed is relative to today)", () => {
    for (const today of ["2026-10-13", "2027-02-28"]) {
      const w = realWorld(today);
      expect(brief.missingEvidenceIds(w.content, w.pkg)).toEqual([]);
      expect(brief.validateBundle(brief.toFhirBundle({ data: w.data, review: w.review, brief: w.vb, today }))).toEqual([]);
    }
  });
});

// Regenerate the published sample (docs/samples/kinwise-fhir-bundle.json) from the real engines and the bound KB:
//   KINWISE_WRITE_FHIR_SAMPLE=1 npx vitest run src/engine/brief/index.test.ts
// then validate it against the public HAPI R4 server and save the OperationOutcome next to it:
//   curl -s -X POST -H "Content-Type: application/fhir+json" --data-binary @docs/samples/kinwise-fhir-bundle.json \
//     "https://hapi.fhir.org/baseR4/Bundle/\$validate" -o docs/samples/kinwise-fhir-validation.json
describe.runIf(process.env.KINWISE_WRITE_FHIR_SAMPLE === "1")("sample export", () => {
  it("writes the sample FHIR bundle for 2026-10-11", () => {
    const bundle = brief.toFhirBundle({ data: R.data, review: R.review, brief: R.vb, today: TODAY });
    expect(brief.validateBundle(bundle)).toEqual([]);
    writeFileSync(new URL("../../../docs/samples/kinwise-fhir-bundle.json", import.meta.url), brief.bundleToJson(bundle));
  });
});
