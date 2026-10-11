import { describe, expect, it } from "vitest";
import {
  compareWindows,
  countField,
  EMPTY,
  factsFor,
  KEYS,
  localDate,
  newDay,
  provenance,
  seedSource,
  shiftDate,
  sourceCommit,
} from "./domain";
import {
  isClinicalRequest,
  supportedProposal,
  splitSpans,
  validateNarrative,
  validDay,
  validEnvelope,
} from "./ai";
import type { Answers, Proposal } from "./types";
const today = "2026-09-25";
function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}
describe("confirmed records and storage", () => {
  it("seeds 25 confirmed days over 28 days, with three unrecorded days", () => {
    const s = seedSource(today);
    expect(s.days).toHaveLength(25);
    expect(new Set(s.days.map((d) => d.dateLocal)).size).toBe(25);
    expect(s.days.every((d) => validDay(d))).toBe(true);
    expect(s.medications).toHaveLength(3);
  });
  it("keeps unknown answers null and allows an incomplete record", () => {
    const s = seedSource(today);
    const day = newDay(s, today, EMPTY, "A quiet day");
    expect(validDay(day)).toBe(true);
    expect(Object.values(day.answers).every((v) => v === null)).toBe(true);
  });
  it("rejects invalid dates, range violations, and hidden extra fields", () => {
    const s = seedSource(today),
      d = newDay(s, today, EMPTY, "");
    expect(validDay({ ...d, dateLocal: "2026-02-30" })).toBe(false);
    expect(validDay({ ...d, answers: { ...EMPTY, energy: 9 } })).toBe(false);
    expect(validDay({ ...d, riskScore: 4 })).toBe(false);
  });
  it("counts answered days, not calendar days or observer notes", () => {
    const s = seedSource(today);
    s.days = [true, null, false, true, false, null, true].map((v, i) =>
      newDay(s, shiftDate(today, -i), { ...EMPTY, dizziness: v }, ""),
    );
    const c = countField(s.days, "dizziness");
    expect(c).toMatchObject({ positive: 3, answered: 5 });
    const f = factsFor(s, shiftDate(today, -6), today);
    expect(f.find((x) => x.id === "fact:dizziness")?.detail).toBe(
      "of 5 answered days",
    );
  });
  it("does not turn zero baseline or no after answers into infinity", () => {
    const s = seedSource(today);
    const b = Array.from({ length: 7 }, (_, i) =>
      newDay(s, shiftDate(today, -i), { ...EMPTY, dizziness: false }, ""),
    );
    const a = b.map((d, i) => ({
      ...d,
      answers: { ...d.answers, dizziness: i === 0 },
    }));
    expect(compareWindows(b, a)).toMatchObject({
      relativeChange: null,
      sufficient: true,
    });
    expect(compareWindows(b, []).relativeChange).toBeNull();
  });
  it("requires seven answers per comparison window", () => {
    const s = seedSource(today);
    expect(
      compareWindows(s.days.slice(0, 6), s.days.slice(7, 21)).sufficient,
    ).toBe(false);
  });
  it("commits one source revision and invalidates derived artifacts", () => {
    const s = seedSource(today),
      st = storage();
    st.setItem(KEYS.source, JSON.stringify(s));
    st.setItem(KEYS.reports, "old");
    const updated = sourceCommit(s, { ...s, notes: [] }, st, "caregiver");
    expect(updated.sourceRevision).toBe(2);
    expect(st.getItem(KEYS.reports)).toBeNull();
  });
  it("rejects stale writes and protects the role boundaries", () => {
    const s = seedSource(today),
      st = storage();
    st.setItem(KEYS.source, JSON.stringify({ ...s, sourceRevision: 2 }));
    expect(() => sourceCommit(s, s, st, "patient")).toThrow(/changed/);
    st.setItem(KEYS.source, JSON.stringify(s));
    expect(() => sourceCommit(s, { ...s, days: [] }, st, "caregiver")).toThrow(
      /patient/,
    );
    expect(() =>
      sourceCommit(
        s,
        { ...s, medications: [], medicationEvents: [] },
        st,
        "patient",
      ),
    ).toThrow(/caregiver/);
  });
  it("preserves old data when storage quota is exceeded", () => {
    const s = seedSource(today),
      st = storage();
    st.setItem(KEYS.source, JSON.stringify(s));
    const bad = {
      ...st,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() =>
      sourceCommit(s, { ...s, notes: [] }, bad, "caregiver"),
    ).toThrow("QuotaExceededError");
    expect(JSON.parse(st.getItem(KEYS.source)!).notes).toHaveLength(2);
  });
  it("rotates dataset identity on reseed", () => {
    expect(seedSource(today).datasetId).not.toBe(seedSource(today).datasetId);
  });
  it("normalizes dizziness severity when dizziness is absent", () => {
    const d = newDay(
      seedSource(today),
      today,
      { ...EMPTY, dizziness: false, dizzinessSeverity: 3 },
      "",
    );
    expect(d.answers.dizzinessSeverity).toBeNull();
  });
});
describe("AI evidence and policy gates", () => {
  const proposal = (
    story: string,
    field: Proposal["field"],
    value: Answers[Proposal["field"]],
  ): Proposal => ({
    field,
    value,
    certainty: "explicit",
    sourceSpans: splitSpans(story),
  });
  it("accepts explicit supported ratings with exact UTF-16 offsets", () => {
    const story = "I wrote 🌿. My energy is 2 out of 5.";
    const spans = splitSpans(story);
    const p = { ...proposal(story, "energy", 2), sourceSpans: [spans[1]] };
    expect(story.slice(p.sourceSpans[0].start, p.sourceSpans[0].end)).toBe(
      p.sourceSpans[0].quote,
    );
    expect(supportedProposal(p, story)).toBe(true);
  });
  it("requires an explicit combined negative for falls and near-falls", () => {
    const negative = "I did not fall today.";
    expect(
      supportedProposal(
        proposal(negative, "fallsOrNearFalls", false),
        negative,
      ),
    ).toBe(false);
    const complete = "I had no falls or near-falls today.";
    expect(
      supportedProposal(
        proposal(complete, "fallsOrNearFalls", false),
        complete,
      ),
    ).toBe(true);
  });
  it("preserves negation and does not infer positives", () => {
    const s = "I was not dizzy today.";
    expect(supportedProposal(proposal(s, "dizziness", false), s)).toBe(true);
    expect(supportedProposal(proposal(s, "dizziness", true), s)).toBe(false);
  });
  it("rejects sleep duration as a quality score", () => {
    const s = "I slept for five hours.";
    expect(supportedProposal(proposal(s, "sleep", 5), s)).toBe(false);
  });
  it("rejects vague ratings, third-person symptoms and historical symptoms", () => {
    for (const [s, f, v] of [
      ["My energy was bad.", "energy", 2],
      ["My sister fell yesterday.", "fallsOrNearFalls", true],
      ["I felt dizzy yesterday.", "dizziness", true],
    ] as const)
      expect(supportedProposal(proposal(s, f, v), s)).toBe(false);
  });
  it("rejects fabricated source offsets", () => {
    const s = "My energy is 2 out of 5.";
    const p = proposal(s, "energy", 2);
    p.sourceSpans[0].end--;
    expect(supportedProposal(p, s)).toBe(false);
  });
  it("rejects unsupported numbers and missing evidence IDs", () => {
    expect(() =>
      validateNarrative(
        [{ text: "Dizziness on 9 days.", evidenceIds: ["fact:d"] }],
        [{ id: "fact:d", text: "Dizziness on 3 days." }],
      ),
    ).toThrow(/number/);
    expect(() =>
      validateNarrative(
        [{ text: "Dizziness was recorded.", evidenceIds: ["fact:missing"] }],
        [],
      ),
    ).toThrow(/evidence/);
  });
  it("blocks clinical advice requests and unsafe generated wording", () => {
    for (const q of [
      "Should I stop taking this medicine?",
      "Is it safe to wait?",
      "Do I have a disease?",
      "What is causing this?",
    ])
      expect(isClinicalRequest(q)).toBe(true);
    expect(isClinicalRequest("Which days did I record dizziness?")).toBe(false);
    expect(() =>
      validateNarrative(
        [{ text: "You are safe to wait.", evidenceIds: ["fact:a"] }],
        [{ id: "fact:a", text: "Dizziness noted" }],
      ),
    ).toThrow(/content/);
  });
  it("rejects unsupported clarifications and additional response properties", () => {
    const r = {
      schemaVersion: "1.0",
      requestId: "test",
      operation: "clarify",
      sourceRevision: 1,
      evidenceHash: "a".repeat(64),
      status: "ok",
      payload: { questionIds: ["diagnose_stroke"] },
    };
    expect(validEnvelope(r)).toBe(false);
    expect(
      validEnvelope({
        ...r,
        payload: { questionIds: ["energy_rating", "energy_rating"] },
      }),
    ).toBe(false);
    expect(
      validEnvelope({
        ...r,
        payload: { questionIds: ["energy_rating"] },
        url: "https://example.com",
      }),
    ).toBe(false);
  });
});
