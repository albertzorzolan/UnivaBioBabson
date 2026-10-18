import { describe, expect, it } from "vitest";
import type { CheckIn, Medication, StoreData } from "../../model/types";
import { addDays } from "../../model/dates";
import { createSeed } from "../../model/seed";
import { latestCheckInPerDate, metricValue } from "../timeline/metrics";
import {
  EVIDENCE_LIMITS,
  SIGNAL_EVIDENCE_CAVEAT,
  buildEvidence,
  coverageText,
  defaultPeriod,
  entryText,
  evidenceById,
  fallsSinceStartParts,
  fallsSinceStartText,
  fallsText,
  sentinelList,
  includedConcerns,
  medText,
  metricCountText,
  mostRecentStart,
  periodDays,
  rankFindings,
  rankSignals,
} from "./evidence";
import { BANNED_PATTERNS } from "./verify";
import { FAKE_KB, FROM, TODAY, margaret } from "./test-fixtures";

const W = margaret();
const build = (over: Partial<Parameters<typeof buildEvidence>[0]> = {}) =>
  buildEvidence({ data: W.data, from: FROM, to: TODAY, review: W.review, timeline: W.timeline, kb: FAKE_KB, ...over });
const PKG = build();
const days = latestCheckInPerDate(W.data.checkIns);

describe("buildEvidence", () => {
  it("gives every item a unique id with a known prefix and one line of text", () => {
    const ids = PKG.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of PKG.items) {
      expect(i.id).toMatch(/^(fact|sig|find|med|note|concern|entry):/);
      expect(i.text).not.toMatch(/\n/);
      expect(i.text.length).toBeGreaterThan(10);
    }
  });

  it("is deterministic and its hash changes when the record changes", () => {
    expect(build()).toEqual(PKG);
    const data: StoreData = { ...W.data, checkIns: W.data.checkIns.filter((c) => c.date !== addDays(TODAY, -1)) };
    expect(build({ data }).hash).not.toBe(PKG.hash);
  });

  it("puts facts first, coverage first among them", () => {
    expect(PKG.items[0].id).toBe("fact:coverage");
    const kinds = PKG.items.map((i) => i.kind);
    expect(kinds.lastIndexOf("fact")).toBeLessThan(kinds.indexOf("signal"));
  });

  it("counts coverage over calendar days and symptoms over answered days only", () => {
    const inPeriod = days.filter((c) => c.date >= FROM && c.date <= TODAY);
    const cov = evidenceById(PKG).get("fact:coverage")!;
    expect(cov.text).toBe(`Check-ins were recorded on ${inPeriod.length} of 45 days from Aug 27 through Oct 10.`);
    const answered = inPeriod.filter((c) => metricValue(c, "dizziness") !== null);
    const yes = answered.filter((c) => metricValue(c, "dizziness") === 1);
    const item = evidenceById(PKG).get("fact:count:dizziness")!;
    expect(item.text).toBe(`Dizziness was recorded on ${yes.length} of ${answered.length} answered days from Aug 27 through Oct 10.`);
    expect(item.data).toMatchObject({ positive: yes.length, answered: answered.length, metric: "dizziness" });
  });

  it("adds the caveat (and KB-known effect) to every signal and never says 'caused'", () => {
    const signals = PKG.items.filter((i) => i.kind === "signal");
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.text.endsWith(SIGNAL_EVIDENCE_CAVEAT)).toBe(true);
      expect(s.text).not.toMatch(/\bcaused?\b/i);
    }
    expect(evidenceById(PKG).get("sig:med-lorazepam:dizziness:started")!.text).toContain(
      "Kinwise's reference set lists dizziness as a recognized possible effect of Lorazepam (Ativan).",
    );
  });

  it("includes findings the family has not dismissed, linked to recorded symptoms first", () => {
    const finds = PKG.items.filter((i) => i.kind === "finding").map((i) => i.id);
    expect(finds).toHaveLength(W.review.findings.length);
    expect(finds[0]).toBe("find:beers-pim-benzodiazepine|med-lorazepam");
    expect(finds.indexOf("find:beers-pim-ppi|med-omeprazole")).toBe(finds.length - 1);
    const data = { ...W.data, reviewDecisions: [{ findingKey: "beers-pim-ppi|med-omeprazole", status: "dismissed" as const, note: "", updatedAt: "2026-10-01T00:00:00.000Z" }] };
    expect(build({ data }).items.some((i) => i.id === "find:beers-pim-ppi|med-omeprazole")).toBe(false);
  });

  it("includes pinned notes as concerns, filtered by includedConcernIds", () => {
    const concerns = PKG.items.filter((i) => i.kind === "concern");
    expect(concerns).toHaveLength(1);
    expect(concerns[0].text).toMatch(/^Alex \(daughter\) wrote on Oct \d+: "Mom seems foggier/);
    expect(build({ includedConcernIds: [] }).items.some((i) => i.kind === "concern")).toBe(false);
    expect(includedConcerns(W.data, []).length).toBe(0);
  });

  it("keeps at least 3 entries under a tiny budget and says how many were listed", () => {
    const small = build({ maxChars: 100 });
    const entries = small.items.filter((i) => i.kind === "entry");
    expect(entries).toHaveLength(EVIDENCE_LIMITS.minEntries);
    // Fall and near-fall days come first.
    const fallDays = days.filter((c) => c.date >= FROM && (metricValue(c, "fall") === 1 || metricValue(c, "nearFall") === 1)).map((c) => `entry:${c.id}`);
    for (const e of entries) expect(fallDays).toContain(e.id);
    expect(evidenceById(small).get("fact:entries")!.text).toMatch(/^3 of the \d+ check-ins in this period are listed individually/);
    const big = build({ maxChars: 1_000_000 });
    expect(big.items.some((i) => i.id === "fact:entries")).toBe(false);
  });

  it("rejects invalid or reversed periods", () => {
    expect(() => build({ from: "2026-13-01" })).toThrow(RangeError);
    expect(() => build({ from: TODAY, to: FROM })).toThrow(/after/);
  });

  it("uses no banned language outside quoted words (patient and caregiver quotes are kept verbatim)", () => {
    for (const i of PKG.items) {
      const unquoted = i.text.replace(/"[^"]*"/g, '""');
      for (const b of BANNED_PATTERNS) {
        if (b.patientScoped || b.allowInQuestion) continue;
        expect(b.pattern.test(unquoted), `${b.reason}: ${i.text}`).toBe(false);
      }
    }
  });

  it("works for the live seed with today's check-in missing and a different 'today'", () => {
    const today = "2026-11-02";
    const data = createSeed(today);
    const w = margaret(today);
    const pkg = buildEvidence({ data, from: addDays(today, -29), to: today, review: w.review, timeline: w.timeline, kb: FAKE_KB });
    expect(evidenceById(pkg).get("fact:latest")!.text).toBe("The most recent check-in in this period was on Nov 1.");
  });
});

describe("item renderers", () => {
  const lorazepam = W.data.medications.find((m) => m.id === "med-lorazepam")!;

  it("metricCountText handles scales, single days and unanswered periods", () => {
    expect(metricCountText(days, "energy", FROM, TODAY).text).toMatch(/^Energy ratings averaged \d\.\d out of 5 on \d+ answered days from Aug 27 through Oct 10\.$/);
    const quiet = addDays(TODAY, 30);
    expect(metricCountText(days, "dizziness", quiet, quiet).text).toBe("The dizziness question was not answered on Nov 9.");
    expect(metricCountText(days, "appetiteWorse", quiet, quiet).text).toBe("The appetite question was not answered on Nov 9.");
  });

  it("coverageText reads naturally for one day", () => {
    expect(coverageText(days, TODAY, TODAY).text).toBe("No check-in was recorded on Oct 10.");
    const y = addDays(TODAY, -1);
    expect(coverageText(days, y, y).text).toBe("A check-in was recorded on Oct 9.");
  });

  it("fallsText lists dates with answered-day denominators", () => {
    expect(fallsText(days, FROM, TODAY).text).toMatch(/^Falls were recorded on 1 of \d+ answered days \(Oct 5\) and near-falls on \d+ of \d+ answered days \(/);
    const none = fallsText(days, addDays(TODAY, -60), addDays(TODAY, -50));
    expect(none.text).toMatch(/^No falls or near-falls were recorded/);
    const empty = fallsText([], FROM, TODAY);
    expect(empty.text).toBe("The fall and near-fall questions were not answered from Aug 27 through Oct 10.");
  });

  it("fallsSinceStartText compares the 21 days before the start", () => {
    const r = fallsSinceStartText(days, lorazepam, TODAY);
    expect(r.text).toMatch(/^From Sep 24, when Lorazepam \(Ativan\) was started, through Oct 10: 1 fall \(Oct 5\) and 2 near-falls \(Sep 26, Sep 29\) were recorded on \d+ answered days, compared with .* in the 21 days before\.$/);
  });

  it("fallsSinceStartParts exposes the same falls/near-falls lists the sentence is built from", () => {
    const parts = fallsSinceStartParts(days, lorazepam, TODAY);
    const r = fallsSinceStartText(days, lorazepam, TODAY);
    expect(parts.after.text).toBe("1 fall (Oct 5) and 2 near-falls (Sep 26, Sep 29)");
    expect(r.text).toContain(`${parts.after.text} were recorded on ${parts.after.answered} answered days`);
    expect(parts.after.falls).toEqual(["2026-10-05"]);
    expect(parts.after.nearFalls).toEqual(["2026-09-26", "2026-09-29"]);
    expect(parts.windows.after.from).toBe(lorazepam.startDate);
    expect(r.data.positive).toBe(parts.after.dates.length);
  });

  it("sentinelList lists falls and near-falls of one window with their dates", () => {
    const s = sentinelList(days, lorazepam.startDate, TODAY, TODAY);
    expect(s.text).toBe("1 fall (Oct 5) and 2 near-falls (Sep 26, Sep 29)");
    expect(s.dates).toEqual(["2026-09-26", "2026-09-29", "2026-10-05"]);
    expect(sentinelList(days, addDays(TODAY, -60), addDays(TODAY, -50), TODAY).text).toBe("no falls or near-falls");
  });

  it("medText shows hidden ingredients, over-the-counter status and stop dates", () => {
    const tylenol = W.data.medications.find((m) => m.id === "med-tylenolpm")!;
    expect(medText(tylenol, TODAY, FAKE_KB)).toBe(
      "Tylenol PM (OTC) (acetaminophen + diphenhydramine) 2 caplets at bedtime as needed, started Apr 13, for sleep, bought over the counter.",
    );
    const stopped: Medication = { ...lorazepam, endDate: "2026-10-01" };
    expect(medText(stopped, TODAY, FAKE_KB)).toContain("stopped after Oct 1");
  });

  it("entryText marks edited check-ins and quotes her words", () => {
    const edited = days.find((c) => c.revision > 1)!;
    expect(entryText(edited, W.data, TODAY)).toMatch(/^Oct \d+ check-in \(edited\): /);
    const fall = days.find((c) => c.answers.fall === true)!;
    expect(entryText(fall, W.data, TODAY)).toMatch(/In Margaret's words: "Took a tumble/);
  });

  it("ranks signals by strength then known effect, and finds the most recent start", () => {
    const ranked = rankSignals(W.timeline.signals);
    expect(ranked[0].strength).toBe("strong");
    expect(mostRecentStart(W.data.medications, TODAY)!.id).toBe("med-lorazepam");
    expect(mostRecentStart(W.data.medications, addDays(TODAY, 200))).toBeNull();
  });

  it("rankFindings keeps original order within a category", () => {
    const ranked = rankFindings(W.review.findings).map((f) => f.key);
    expect(ranked.indexOf("beers-pim-benzodiazepine|med-lorazepam")).toBeLessThan(ranked.indexOf("beers-pim-first-gen-antihistamine|med-tylenolpm"));
  });

  it("defaultPeriod and periodDays cover inclusive calendar days", () => {
    expect(defaultPeriod(TODAY)).toEqual({ from: addDays(TODAY, -29), to: TODAY });
    expect(periodDays({ from: FROM, to: TODAY })).toHaveLength(45);
  });

  it("never counts an unanswered question as 'no'", () => {
    const c: CheckIn = { ...days[days.length - 1], date: TODAY, answers: { ...days[0].answers, dizziness: null } };
    const r = metricCountText([c], "dizziness", TODAY, TODAY);
    expect(r.data.answered).toBe(0);
  });
});
