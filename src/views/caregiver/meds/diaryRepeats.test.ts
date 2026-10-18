import { describe, expect, it } from "vitest";
import type { Finding } from "../../../model/types";
import { createSeed } from "../../../model/seed";
import { analyzeTimeline } from "../../../engine/timeline/signals";
import { reviewMedications } from "../../../engine/meds/review";
import { DIARY_SIGNALS_SHOWN, diaryItemCount, diaryItems, repeatedDiaryBlocks, shownSignalIds } from "./diaryRepeats";

type F = Pick<Finding, "key" | "relatedSymptoms" | "signalIds">;
const f = (key: string, relatedSymptoms: F["relatedSymptoms"], signalIds: string[] = []): F => ({ key, relatedSymptoms, signalIds });
/** Every signal id resolves (the timeline knows it). */
const all = (_id: string) => true;

describe("diary block de-duplication on the review page", () => {
  it("lists the diary items a finding's block renders (symptom counts and timeline patterns)", () => {
    expect(diaryItems(f("a", ["dizziness", "fall"], ["s1"]), all)).toEqual(["metric:dizziness", "metric:fall", "signal:s1"]);
    expect(diaryItems(f("a", []), all)).toEqual([]);
    expect(diaryItemCount(f("a", ["dizziness", "fall"], ["s1"]), all)).toBe(3);
  });

  it("counts only the first two signals that resolve, as FindingCard renders them", () => {
    expect(DIARY_SIGNALS_SHOWN).toBe(2);
    const card = f("a", ["fall"], ["gone", "s1", "s2", "s3", "s4"]);
    const has = (id: string) => id !== "gone";
    expect(shownSignalIds(card, has)).toEqual(["s1", "s2"]);
    expect(diaryItems(card, has)).toEqual(["metric:fall", "signal:s1", "signal:s2"]);
    expect(diaryItemCount(card, has)).toBe(3);
  });

  it("shows each set in full on the first card that cites it and collapses later cards with the same set", () => {
    const list = [f("a", ["dizziness", "fall"]), f("b", []), f("c", ["fall", "dizziness"]), f("d", ["swelling"]), f("e", ["dizziness", "fall"])];
    expect([...repeatedDiaryBlocks(list, { hasSignal: all })].sort()).toEqual(["c", "e"]);
  });

  it("also collapses a card whose every item is already shown above, but never one with something new", () => {
    const list = [
      f("a", ["dizziness", "fall", "nearFall"], ["s1"]),
      f("b", ["dizziness", "nearFall"]), // all shown on a → collapsed
      f("c", ["dizziness", "swelling"]), // swelling is new → shown in full
      f("d", ["swelling", "fall"]), // swelling (c) + fall (a) → collapsed
      f("e", ["dizziness"], ["s2"]), // s2 is new → shown in full
    ];
    expect([...repeatedDiaryBlocks(list, { hasSignal: all })].sort()).toEqual(["b", "d"]);
  });

  it("does not count a set-aside (hidden) card as shown above", () => {
    const list = [f("a", ["dizziness", "swelling"]), f("b", ["dizziness", "swelling"]), f("c", ["dizziness", "swelling"])];
    const out = repeatedDiaryBlocks(list, { hasSignal: all, isHidden: (key) => key === "a" });
    // a is collapsed to "Set aside", so b is the first card that shows the block in full; c repeats b.
    expect([...out]).toEqual(["c"]);
  });

  it("counts as shown only the signals a card renders, so a third signal is still new on a later card", () => {
    const list = [f("a", ["fall"], ["s1", "s2", "s3"]), f("b", ["fall"], ["s3"]), f("c", ["fall"], ["s1", "s2", "s3"])];
    // a renders s1, s2 (s3 is "1 more pattern on the timeline"); b's s3 is new; c renders s1, s2 again → repeat.
    expect([...repeatedDiaryBlocks(list, { hasSignal: all })]).toEqual(["c"]);
  });

  it("on the seed review, every collapsed card's rendered items appear on an earlier visible card", () => {
    const TODAY = "2026-10-11";
    const data = createSeed(TODAY);
    const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today: TODAY });
    const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY, signals: timeline.signals });
    const known = new Set(timeline.signals.map((s) => s.id));
    const hasSignal = (id: string) => known.has(id);

    const check = (isHidden: (key: string) => boolean) => {
      const out = repeatedDiaryBlocks(review.findings, { hasSignal, isHidden });
      const shown = new Set<string>();
      for (const x of review.findings) {
        if (isHidden(x.key)) {
          expect(out.has(x.key)).toBe(false);
          continue;
        }
        if (out.has(x.key)) for (const item of diaryItems(x, hasSignal)) expect(shown.has(item)).toBe(true);
        else for (const item of diaryItems(x, hasSignal)) shown.add(item);
      }
      return out;
    };

    const none = check(() => false);
    expect(none.has(review.findings[0].key)).toBe(false);
    expect(none.size).toBeGreaterThan(0);
    // Setting the first card aside (the reviewer's repro) must not leave a later card pointing at it.
    const firstKey = review.findings[0].key;
    check((key) => key === firstKey);
  });
});
