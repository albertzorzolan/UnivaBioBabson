// Seed acceptance test: Margaret's record (SPEC §2 "Engine results this list must produce"), run through the
// real compiled KB, the real timeline engine and reviewMedications exactly as the app does (useDerived).

import { describe, expect, it } from "vitest";
import type { Finding, MedReview, Medication, MetricKey } from "../../model/types";
import { createSeed } from "../../model/seed";
import { analyzeTimeline } from "../timeline/signals";
import { knownEffect } from "../../kb";
import { reviewMedications, findingSummaryForMed, REQUIRED_NOTICE, previewAddition } from "./review";
import { bannedWordsIn, sentences } from "./text";

const TODAY = "2026-10-10";
const data = createSeed(TODAY);
const isKnownEffect = (m: Medication, k: MetricKey) => knownEffect(m.ingredientIds, k);
const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today: TODAY, isKnownEffect });
const review: MedReview = reviewMedications({
  meds: data.medications,
  profile: data.profile,
  checkIns: data.checkIns,
  today: TODAY,
  signals: timeline.signals,
});

const involving = (medId: string, category?: Finding["category"]): Finding[] =>
  review.findings.filter((f) => f.medIds.includes(medId) && (!category || f.category === category));

describe("seed acceptance: Margaret's medication review (SPEC §2)", () => {
  it("matches every seed medicine to the reference set", () => {
    expect(review.unmatchedMedIds).toEqual([]);
  });

  it("Beers PIM: lorazepam (benzodiazepine) is a medicine to generally avoid", () => {
    const [f] = involving("med-lorazepam", "beers_avoid");
    expect(f).toBeDefined();
    expect(f.plain).toMatch(/^AGS Beers 2023 lists Lorazepam \(Ativan\) as a medicine older adults should generally avoid/);
    expect(f.sourceIds.length).toBeGreaterThan(0);
    expect(f.evidenceGrade).toMatch(/^AGS Beers/);
  });

  it("Beers PIM: diphenhydramine (in Tylenol PM) is a first-generation antihistamine to generally avoid", () => {
    const fs = involving("med-tylenolpm", "beers_avoid");
    expect(fs.length).toBeGreaterThanOrEqual(1);
    expect(fs.some((f) => /diphenhydramine/i.test(f.plain) || /antihistamine/i.test(f.title))).toBe(true);
  });

  it("Beers PIM: omeprazole taken for more than 8 weeks", () => {
    expect(involving("med-omeprazole", "beers_avoid")).toHaveLength(1);
  });

  it("oxybutynin is covered through its Beers anticholinergic criteria (combination, falls) but is not itself a Table 2 PIM", () => {
    expect(involving("med-oxybutynin", "beers_avoid")).toHaveLength(0);
    expect(involving("med-oxybutynin", "beers_interaction").length).toBeGreaterThanOrEqual(1);
    expect(involving("med-oxybutynin", "beers_condition").length).toBeGreaterThanOrEqual(1);
  });

  it("anticholinergic burden: total >= 6 (diphenhydramine 3, oxybutynin 3, furosemide 1) -> high", () => {
    expect(review.acb.total).toBeGreaterThanOrEqual(6);
    expect(review.acb.band).toBe("high");
    const scores = Object.fromEntries(review.acb.contributors.map((c) => [c.ingredientId, c.score]));
    expect(scores).toMatchObject({ diphenhydramine: 3, oxybutynin: 3, furosemide: 1 });
    expect(review.acb.contributors.reduce((s, c) => s + c.score, 0)).toBe(review.acb.total);
    const [f] = review.findings.filter((x) => x.category === "anticholinergic_burden");
    expect(f.medIds).toEqual(expect.arrayContaining(["med-tylenolpm", "med-oxybutynin", "med-furosemide"]));
    expect(f.title).toBe(`Anticholinergic burden score (ACB): ${review.acb.total}`);
  });

  it("drug–drug: two or more strong anticholinergics together (Beers Table 5), reported once", () => {
    const fs = review.findings.filter(
      (f) => f.category === "beers_interaction" && f.medIds.includes("med-oxybutynin") && f.medIds.includes("med-tylenolpm"),
    );
    expect(fs).toHaveLength(1);
  });

  it("fall-risk medicines include lorazepam, diphenhydramine and furosemide, emphasised by the diary", () => {
    expect(review.fallRiskMedIds).toEqual(expect.arrayContaining(["med-lorazepam", "med-tylenolpm", "med-furosemide"]));
    const [f] = review.findings.filter((x) => x.category === "fall_risk");
    expect(f.medIds).toEqual(review.fallRiskMedIds);
    expect(f.plain).toContain("In the last 30 days the diary recorded 1 fall");
    expect(review.fallRiskMedIds).not.toContain("med-atorvastatin");
    expect(review.fallRiskMedIds).not.toContain("med-omeprazole");
  });

  it("prescribing cascade: amlodipine -> furosemide, started 45 days later for ankle swelling", () => {
    const [f] = review.findings.filter((x) => x.category === "prescribing_cascade");
    expect(f).toBeDefined();
    expect(f.medIds).toEqual(["med-amlodipine", "med-furosemide"]);
    expect(f.plain).toMatch(/^Furosemide \(Lasix\) was started on Jul 7, 45 days after Amlodipine, for “ankle swelling”\./);
    expect(f.plain).toContain("prescribing cascade");
  });

  it("drug–disease: a recorded fall adds history_of_falls (from the diary) and activates condition rules", () => {
    expect(review.effectiveConditions).toContainEqual({ tag: "history_of_falls", from: "diary" });
    const [f] = involving("med-lorazepam", "beers_condition");
    expect(f).toBeDefined();
    expect(f.plain).toContain("history of falls (the diary recorded a fall, most recently on Oct 5)");
    expect(involving("med-tylenolpm", "beers_condition").length).toBeGreaterThanOrEqual(1);
  });

  it("links lorazepam findings to the diary: relatedSymptoms include dizziness, timeline signals attached", () => {
    const [f] = involving("med-lorazepam", "beers_avoid");
    expect(f.relatedSymptoms).toContain("dizziness");
    expect(f.signalIds).toContain(timeline.signals.find((s) => s.medicationId === "med-lorazepam" && s.metric === "dizziness")?.id);
    expect(f.question).toMatch(/^Could Lorazepam \(Ativan\) be contributing to the dizziness/);
  });

  it("sorts a lorazepam finding near the top", () => {
    const first = review.findings.findIndex((f) => f.medIds.includes("med-lorazepam"));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(5);
    expect(review.findings[0].relatedSymptoms.length).toBeGreaterThan(0);
  });

  it("raises no CNS-combination or duplicate-class finding for this list", () => {
    expect(review.findings.filter((f) => f.category === "cns_active_combo")).toEqual([]);
    expect(review.findings.filter((f) => f.category === "duplicate_class")).toEqual([]);
    expect(involving("med-metformin", "beers_avoid")).toEqual([]);
    expect(involving("med-atorvastatin", "beers_avoid")).toEqual([]);
    expect(involving("med-amlodipine", "beers_avoid")).toEqual([]);
  });

  it("carries the required notice and follows the language rules everywhere", () => {
    expect(review.notices).toContain(REQUIRED_NOTICE);
    for (const f of review.findings) {
      for (const t of [f.title, f.plain, f.clinician, f.question]) {
        expect(bannedWordsIn(t), t).toEqual([]);
        expect(t, t).not.toMatch(/[{}]/);
      }
      expect(sentences(f.plain).length, f.plain).toBeLessThanOrEqual(2);
      expect(f.sourceIds.length, f.key).toBeGreaterThan(0);
      expect(f.question.trim().endsWith("?"), f.question).toBe(true);
    }
    for (const n of review.notices) expect(bannedWordsIn(n), n).toEqual([]);
  });

  it("is deterministic", () => {
    const again = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY, signals: timeline.signals });
    expect(JSON.stringify(again)).toBe(JSON.stringify(review));
  });

  it("gives medication-table badges", () => {
    expect(findingSummaryForMed(review, "med-lorazepam")).toEqual(expect.arrayContaining(["Beers", "Fall risk"]));
    expect(findingSummaryForMed(review, "med-tylenolpm")).toEqual(expect.arrayContaining(["Beers", "Combination", "ACB 3", "Fall risk"]));
    expect(findingSummaryForMed(review, "med-furosemide")).toEqual(expect.arrayContaining(["Cascade?"]));
  });

  it("previews adding a sedating antihistamine (diphenhydramine is already in Tylenol PM)", () => {
    const p = previewAddition(
      { meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY },
      { id: "new-benadryl", name: "Benadryl 25 mg", ingredientIds: ["diphenhydramine"], match: "brand" },
    );
    expect(p.acbAfter).toBe(p.acbBefore); // same ingredient counted once
    expect(p.added.some((f) => f.category === "duplicate_class" && f.medIds.includes("new-benadryl"))).toBe(true);
  });
});

describe("seed acceptance: counts carry denominators (SPEC §3)", () => {
  it("the fall-risk prompt states falls, near-falls and dizziness with answered-day denominators", () => {
    const [f] = review.findings.filter((x) => x.category === "fall_risk");
    expect(f.question).toBe(
      "With 1 fall and 2 near-falls on 26 answered days, and dizziness on 10 of 25 answered days in the last 30 days, could any of these medicines be contributing, and could the list be reviewed for fall risk?",
    );
    expect(f.question).not.toMatch(/recorded recently/);
  });

  it("no finding's plain text, clinician text or question gives a bare 'on N days' count", () => {
    for (const f of review.findings) {
      for (const text of [f.plain, f.clinician, f.question]) {
        for (const m of text.matchAll(/\bon (\d+) (?:\w+ )?days?\b/g)) {
          const before = text.slice(Math.max(0, m.index - 40), m.index + m[0].length);
          // "on 26 answered days" (falls and near-falls over the answered days) or "on 10 of 25 answered days".
          expect(/\bon \d+ (?:of \d+ )?answered days?\b/.test(before) || / of /.test(m[0]), `${f.key}: ${text}`).toBe(true);
        }
        expect(/\bon \d+ days?\b/.test(text) && !/\bon \d+ of \d+/.test(text), `${f.key}: ${text}`).toBe(false);
      }
    }
  });
});
