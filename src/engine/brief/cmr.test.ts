import { describe, expect, it } from "vitest";
import type { StoreData } from "../../model/types";
import { addDays } from "../../model/dates";
import { ALLERGIES_UNKNOWN, PML_COLUMNS, SYMPTOMS_HEADING, briefToPlainText, plainTextHash, pmlToPlainText, symptomLines, toPersonalMedicationList } from "./cmr";
import { buildEvidence } from "./evidence";
import { SAFETY_LINE, templateBrief, templateGenerationInfo, toVisitBrief } from "./template";
import { BANNED_IN_TEMPLATE, FAKE_KB, FROM, TODAY, margaret } from "./test-fixtures";

const W = margaret();
const pml = (data: StoreData = W.data) => toPersonalMedicationList({ data, review: W.review, today: TODAY, kb: FAKE_KB });
const P = pml();

function visitBrief() {
  const pkg = buildEvidence({ data: W.data, from: FROM, to: TODAY, review: W.review, timeline: W.timeline, kb: FAKE_KB });
  const content = templateBrief(pkg, { data: W.data, review: W.review, timeline: W.timeline, kb: FAKE_KB });
  return toVisitBrief({ id: "b1", pkg, content, generation: templateGenerationInfo(pkg, W.review), data: W.data });
}

describe("toPersonalMedicationList (CMS Part D MTM PML layout)", () => {
  it("uses the PML columns and one row per current medicine", () => {
    expect(P.columns).toEqual(PML_COLUMNS);
    expect(P.columns).toEqual(["Medication", "How I take it", "Why I use it", "Prescriber", "Date I started"]);
    expect(P.rows).toHaveLength(8);
    expect(P.title).toBe("Personal Medication List for Margaret Rivera");
    expect(P.preparedBy).toBe("Alex (daughter)");
  });

  it("shows combination ingredients, over-the-counter choice and review flags", () => {
    const tylenol = P.rows.find((r) => r.medId === "med-tylenolpm")!;
    expect(tylenol).toMatchObject({
      medication: "Tylenol PM (OTC) (acetaminophen + diphenhydramine)",
      howITakeIt: "2 caplets at bedtime as needed",
      whyIUseIt: "Sleep",
      prescriber: "Self-selected (over the counter)",
      otc: true,
      stopped: null,
      notReviewed: false,
    });
    expect(tylenol.flags.some((f) => f.startsWith("AGS Beers Criteria"))).toBe(true);
    const lorazepam = P.rows.find((r) => r.medId === "med-lorazepam")!;
    expect(lorazepam).toMatchObject({ medication: "Lorazepam (Ativan)", prescriber: "Urgent care", started: "Sep 24" });
  });

  it("says allergies are not recorded rather than implying there are none", () => {
    expect(P.allergies).toBe(ALLERGIES_UNKNOWN);
    expect(P.allergies).toMatch(/^Not recorded in Kinwise/);
  });

  it("lists symptoms with counts and answered-day denominators, not assessed for cause", () => {
    expect(P.notes.symptomsHeading).toBe(SYMPTOMS_HEADING);
    expect(SYMPTOMS_HEADING).toBe("Symptoms recorded (not assessed for cause)");
    expect(P.notes.symptoms.length).toBeGreaterThan(0);
    for (const s of P.notes.symptoms) expect(s).toMatch(/^[A-Z][a-z -]+: recorded on \d+ of \d+ answered days? \([A-Z][a-z]{2} \d+ through Oct 10\)$/);
    expect(P.notes.symptoms[0]).toMatch(/^Dizziness: /);
    expect(symptomLines([], FROM, TODAY, TODAY)).toEqual([]);
  });

  it("includes saved questions, pinned concerns and recently stopped medicines", () => {
    const data: StoreData = {
      ...W.data,
      savedQuestions: [{ id: "q1", text: "Could her sleep be helped without pills?", source: "typed", createdAt: "2026-10-08T10:00:00.000Z" }],
      medications: W.data.medications.map((m) => (m.id === "med-omeprazole" ? { ...m, endDate: addDays(TODAY, -10) } : m)),
    };
    const p = pml(data);
    expect(p.notes.questions).toEqual(["Could her sleep be helped without pills?"]);
    expect(p.notes.concerns[0]).toMatch(/^Mom seems foggier/);
    expect(p.rows.some((r) => r.medId === "med-omeprazole")).toBe(false);
    expect(p.stoppedRecently.map((r) => [r.medId, r.stopped])).toEqual([["med-omeprazole", "Sep 30"]]);
  });

  it("marks medicines outside the reference set as not reviewed", () => {
    const data: StoreData = {
      ...W.data,
      medications: [...W.data.medications, { ...W.data.medications[0], id: "med-x", name: "Herbal sleep tea", ingredientIds: [], match: "none", prescriber: "" }],
    };
    const row = pml(data).rows.find((r) => r.medId === "med-x")!;
    expect(row.notReviewed).toBe(true);
    expect(row.prescriber).toBe("Not recorded");
    expect(pmlToPlainText(pml(data))).toContain("Not in Kinwise's reference set (not reviewed).");
  });

  it("renders as plain text with the PML headings, the safety line and the demo label", () => {
    const text = pmlToPlainText(P);
    for (const h of ["PERSONAL MEDICATION LIST FOR MARGARET RIVERA", "Allergies: Not recorded", "MY MEDICINES", "How I take it:", "Why I use it:", "MY NOTES AND QUESTIONS", SYMPTOMS_HEADING, SAFETY_LINE, "Fictional demo data."]) {
      expect(text).toContain(h);
    }
    for (const re of BANNED_IN_TEMPLATE) expect(re.test(text), String(re)).toBe(false);
  });
});

describe("briefToPlainText ('Copy as text')", () => {
  const vb = visitBrief();

  it("has the six brief sections, the safety line and a draft notice until reviewed", () => {
    const text = briefToPlainText(vb, { data: W.data, review: W.review, today: TODAY, kb: FAKE_KB });
    expect(text.startsWith("Visit brief for Margaret Rivera (age 78), Aug 27 to Oct 10, 2026\n")).toBe(true);
    for (const h of ["1. Why we're coming in", "2. What we've noticed", "3. Medication review prompts", "4. Our questions", "5. Current medicines (8)", "6. Diary coverage and limitations"]) {
      expect(text).toContain(h);
    }
    expect(text).toContain("Draft: not yet marked as reviewed by the family.");
    expect(text).toContain("Fictional demo data.");
    expect(text.trimEnd().endsWith(SAFETY_LINE)).toBe(true);
    expect(text).toContain("1. ");
    expect(text).toContain("Tylenol PM (OTC) (acetaminophen + diphenhydramine): 2 caplets at bedtime as needed, for sleep, over the counter");
    for (const re of BANNED_IN_TEMPLATE) expect(re.test(text), String(re)).toBe(false);
  });

  it("drops the draft notice once reviewed and accepts bare content", () => {
    const reviewed = briefToPlainText({ ...vb, reviewedAt: "2026-10-10T15:00:00.000Z", reviewedBy: "caregiver" }, { data: W.data, review: W.review, today: TODAY, kb: FAKE_KB });
    expect(reviewed).not.toContain("Draft:");
    const bare = briefToPlainText(vb.content, { data: { ...W.data, isDemoData: false }, review: W.review, today: TODAY, kb: FAKE_KB });
    expect(bare.startsWith("Visit brief for Margaret Rivera (age 78)\n")).toBe(true);
    expect(bare).not.toContain("Fictional demo data.");
  });

  it("shortens for portal limits by saying what was left out, never silently", () => {
    const full = briefToPlainText(vb, { data: W.data, review: W.review, today: TODAY, kb: FAKE_KB });
    const short = briefToPlainText(vb, { data: W.data, review: W.review, today: TODAY, kb: FAKE_KB, maxChars: full.length - 200 });
    expect(short.length).toBeLessThan(full.length);
    expect(short).toMatch(/more lines? in the full brief/);
    expect(short).toContain("5. Current medicines (8): Amlodipine,");
    expect(short.length).toBeLessThanOrEqual(full.length - 200);
    expect(short).toContain("(Shortened for this message; the printed brief has every section.)");
    expect(short.trimEnd().endsWith(SAFETY_LINE)).toBe(true);
  });

  it("treats maxChars as a hard limit at every size, keeping questions first and the safety line always", () => {
    const full = briefToPlainText(vb, { data: W.data, review: W.review, today: TODAY, kb: FAKE_KB });
    for (const max of [full.length - 1, 2000, 1500, 1200, 900, 600, 400, 300, 200, 120, 40]) {
      const t = briefToPlainText(vb, { data: W.data, review: W.review, today: TODAY, kb: FAKE_KB, maxChars: max });
      expect(t.length, String(max)).toBeLessThanOrEqual(max);
      if (max >= SAFETY_LINE.length + 1) expect(t, String(max)).toContain(SAFETY_LINE);
    }
    const mid = briefToPlainText(vb, { data: W.data, review: W.review, today: TODAY, kb: FAKE_KB, maxChars: 1200 });
    expect(mid).toContain("4. Our questions\n1. ");
    expect(mid.startsWith("Visit brief for Margaret Rivera")).toBe(true);
  });

  it("fingerprints text stably", () => {
    expect(plainTextHash("a")).toBe(plainTextHash("a"));
    expect(plainTextHash("a")).not.toBe(plainTextHash("b"));
  });
});
