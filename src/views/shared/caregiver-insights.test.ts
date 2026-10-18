import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Finding } from "../../model/types";
import { createSeed } from "../../model/seed";
import { analyzeTimeline } from "../../engine/timeline/signals";
import { activeMeds, reviewMedications } from "../../engine/meds/review";
import { MULTIPLE_COMPARISONS_NOTE, RUNS_CHECK_NOTE, SIGNAL_CAVEAT, TIMELINE_METHOD_SUMMARY } from "../../engine/timeline/rules";
import {
  CHANCE_NOTE,
  RELIABILITY_TITLE,
  SIGNAL_WORDS_KEY,
  SIZE_ORDER_KEY,
  SIZE_ORDER_WORDS,
  STRENGTH_SIZE_LABEL,
  STRENGTH_SIZE_WORD,
  TEST_NAME,
  strengthTone,
  fallsComparison,
  reviewPromptsSummary,
  triggerFirstSymptoms,
  unflaggedVerdict,
  usesEngineStrengthWords,
} from "./caregiver-insights";
import { ReliabilityDisclosure } from "./caregiver-Reliability";
import { layoutMarkers, tickAlign } from "./caregiver-TimelineChart";

const TODAY = "2026-10-11";
const data = createSeed(TODAY);
const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today: TODAY });

describe("falls comparison wording", () => {
  it("states dates and answered-day denominators on both sides (brief wording)", () => {
    const s = timeline.sentinels.find((x) => x.event === "started")!;
    const out = fallsComparison(s, TODAY);
    expect(out.text).toBe(
      "1 fall (Oct 6) and 2 near-falls (Sep 27, Sep 30) on 14 answered days since Sep 25, compared with 1 near-fall (Sep 11) on 20 answered days in the 21 days before.",
    );
    expect(out.lead + out.rest).toBe(out.text);
    expect(out.text).not.toMatch(/caus|safe|danger|urgent/i);
  });

  it("says 'none' with a denominator and handles unanswered windows", () => {
    const s = timeline.sentinels[0];
    const none = {
      ...s,
      counts: s.counts.map((c) => ({ ...c, beforeDates: [] })),
      answeredDays: { before: 7, after: 1 },
    };
    expect(fallsComparison(none, TODAY).text).toMatch(/on 1 answered day since .*, compared with none on 7 answered days in the 21 days before\.$/);
    const blank = { ...s, counts: s.counts.map((c) => ({ ...c, afterDates: [] })), answeredDays: { before: 0, after: 0 } };
    expect(fallsComparison(blank, TODAY).text).toMatch(/^Falls and near-falls not answered since .*, compared with no answered days in the 21 days before\.$/);
    const ended = { ...s, windows: { ...s.windows, after: { from: "2026-09-25", to: "2026-10-09" } } };
    expect(fallsComparison(ended, TODAY).text).toMatch(/from Sep 25 through Oct 9,/);
  });
});

describe("review summary and finding symptoms", () => {
  const active = activeMeds(data.medications, TODAY);
  const review = reviewMedications({ meds: data.medications, profile: data.profile, checkIns: data.checkIns, today: TODAY, signals: timeline.signals });

  it("counts the medicines the prompts involve, not all medicines", () => {
    const text = reviewPromptsSummary(review.findings, active.map((m) => m.id));
    const involved = new Set(review.findings.flatMap((f) => f.medIds)).size;
    expect(text).toBe(`${review.findings.length} prompts involve ${involved} of ${active.length} medicines`);
    expect(reviewPromptsSummary([], ["a"])).toBe("No prompts for 1 medicine");
    expect(reviewPromptsSummary([{ medIds: ["a"] }], ["a", "b"])).toBe("1 prompt involves 1 of 2 medicines");
  });

  it("puts the symptom a prescribing cascade is about first", () => {
    const cascade = review.findings.find((f) => f.category === "prescribing_cascade");
    expect(cascade).toBeDefined();
    const ordered = triggerFirstSymptoms(cascade!);
    if (cascade!.relatedSymptoms.includes("swelling")) expect(ordered[0]).toBe("swelling");
    expect([...ordered].sort()).toEqual([...cascade!.relatedSymptoms].sort());

    const f = {
      title: "Possible prescribing cascade: Amlodipine → ankle swelling → Furosemide",
      plain: "",
      category: "prescribing_cascade",
      relatedSymptoms: ["dizziness", "fall", "nearFall", "swelling"],
    } as Pick<Finding, "title" | "plain" | "category" | "relatedSymptoms">;
    expect(triggerFirstSymptoms(f)).toEqual(["swelling", "dizziness", "fall", "nearFall"]);
    expect(triggerFirstSymptoms({ ...f, title: "Two medicines", plain: "It can lead to ankle swelling." })).toEqual(["swelling", "dizziness", "fall", "nearFall"]);
    expect(triggerFirstSymptoms({ ...f, title: "Unrelated", category: "beers_avoid" })).toEqual(["dizziness", "fall", "nearFall", "swelling"]);
  });

  it("never labels falls with a test result, and says 'Not flagged' rather than 'none'", () => {
    expect(unflaggedVerdict("fall", "none")).toBe("Listed by date, too few events to test");
    expect(unflaggedVerdict("nearFall", "weak")).toBe("Listed by date, too few events to test");
    expect(unflaggedVerdict("dizziness", "none")).toBe("Not flagged");
    expect(unflaggedVerdict("sleep", "weak")).toBe("Small difference (not flagged)");
    // The unflagged labels reuse the size vocabulary and never echo a flagged one ("Clear difference").
    expect(unflaggedVerdict("sleep", "weak").startsWith(STRENGTH_SIZE_WORD.weak)).toBe(true);
    expect(unflaggedVerdict("dizziness", "none")).not.toMatch(/clear|strength/i);
  });
});

describe("signal strength wording for caregivers", () => {
  it("describes the size of the recorded difference, never a verdict or a cause", () => {
    expect(STRENGTH_SIZE_LABEL.strong).toBe("Large difference in what was recorded");
    expect(STRENGTH_SIZE_LABEL.moderate).toBe("Clear difference in what was recorded");
    expect(STRENGTH_SIZE_LABEL.weak).toBe("Small difference");
    for (const label of Object.values(STRENGTH_SIZE_LABEL)) expect(label).not.toMatch(/strong|caus|safe|danger|risk|warning/i);
  });

  it("says in one plain visible line, without numbers, that a difference like this can appear by chance", () => {
    expect(CHANCE_NOTE).toBe(
      "Differences like this can also appear by chance, especially when symptoms come in runs of days, so it is a question for the clinician, not an answer.",
    );
    expect(CHANCE_NOTE).not.toMatch(/\d/);
    expect(CHANCE_NOTE).not.toMatch(/caus|safe|danger|stop taking|risk/i);
  });

  it("names a size word for each strength that matches its badge", () => {
    expect(STRENGTH_SIZE_WORD.strong).toBe("Large difference");
    expect(STRENGTH_SIZE_WORD.moderate).toBe("Clear difference");
    expect(STRENGTH_SIZE_WORD.weak).toBe("Small difference");
    for (const k of ["strong", "moderate", "weak"] as const) expect(STRENGTH_SIZE_LABEL[k].startsWith(STRENGTH_SIZE_WORD[k])).toBe(true);
  });

  it("colours a badge by strength only: one caution hue for a large difference, neutral otherwise, never green", () => {
    expect(strengthTone("strong")).toBe("caution");
    // tokens.css has no softer caution tone, so a clear (moderate) difference is neutral rather than a second hue.
    expect(strengthTone("moderate")).toBe("neutral");
    expect(strengthTone("weak")).toBe("neutral");
    expect(strengthTone("none")).toBe("neutral");
    for (const s of ["strong", "moderate", "weak", "none"] as const) expect(["caution", "neutral"]).toContain(strengthTone(s));
  });
});

/** Visible text of server-rendered markup (tags stripped, the entities React escapes decoded). */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("SIZE_ORDER_KEY (the key under the Timeline's flagged count)", () => {
  it("orders the size words from largest to smallest, in the badges' own words, with no numbers", () => {
    expect(SIZE_ORDER_KEY).toBe("Size of the recorded difference: Large › Clear › Small (not flagged)");
    expect(SIZE_ORDER_WORDS).toEqual(["Large", "Clear", "Small"]);
    // Each word is the start of the badge it stands for, so the key cannot drift from the badges.
    expect(STRENGTH_SIZE_WORD.strong.startsWith(SIZE_ORDER_WORDS[0])).toBe(true);
    expect(STRENGTH_SIZE_WORD.moderate.startsWith(SIZE_ORDER_WORDS[1])).toBe(true);
    expect(STRENGTH_SIZE_WORD.weak.startsWith(SIZE_ORDER_WORDS[2])).toBe(true);
    expect(SIZE_ORDER_KEY).not.toMatch(/\d/);
    // It names sizes only, never a direction, so it cannot read as "better" or "worse".
    expect(SIZE_ORDER_KEY).not.toMatch(/\b(better|worse|good|bad|improv\w*)\b/i);
  });
});

describe("'How reliable is this?' disclosure", () => {
  const html = renderToStaticMarkup(
    createElement(ReliabilityDisclosure, {
      tests: [{ key: "dizziness", metric: "dizziness", label: "Dizziness", test: "fisher_exact", pValue: 0.0042, runsP: 0.007 }],
    }),
  );
  const text = textOf(html);

  it("is titled 'How reliable is this?' and starts closed", () => {
    expect(RELIABILITY_TITLE).toBe("How reliable is this?");
    expect(text).toContain("How reliable is this?");
    expect(html).toMatch(/aria-expanded="false"/);
  });

  it("renders the measured multiple-comparisons note and the signal caveat from rules.ts verbatim", () => {
    expect(text).toContain(MULTIPLE_COMPARISONS_NOTE.replace(/\s+/g, " "));
    expect(text).toContain(SIGNAL_CAVEAT);
  });

  it("names the test and p-value behind each row", () => {
    expect(TEST_NAME.fisher_exact).toBe("Fisher's exact test");
    expect(TEST_NAME.mann_whitney).toBe("Mann–Whitney U test");
    expect(text).toMatch(/Dizziness: Fisher's exact test, p = 0\.004/);
  });

  it("shows the runs-check p beside the test's p, and says the runs check is reported, not used to flag", () => {
    expect(text).toContain("Dizziness: Fisher's exact test, p = 0.0042 · runs check p = 0.007");
    expect(text).toContain(RUNS_CHECK_NOTE);
    // A row without a runs check (an older saved analysis) shows the test's p alone.
    const older = textOf(
      renderToStaticMarkup(
        createElement(ReliabilityDisclosure, { tests: [{ key: "energy", metric: "energy", label: "Energy", test: "mann_whitney", pValue: 0.0035 }] }),
      ),
    );
    expect(older).toContain("Energy: Mann–Whitney U test, p = 0.0035");
    expect(older).not.toContain("runs check p");
  });

  it("shows RUNS_CHECK_NOTE only where a runs-check p is on screen", () => {
    const render = (props: Parameters<typeof ReliabilityDisclosure>[0]) => textOf(renderToStaticMarkup(createElement(ReliabilityDisclosure, props)));
    const noRuns = [{ key: "dizziness", metric: "dizziness", label: "Dizziness", test: "fisher_exact", pValue: 0.0023 }] as const;
    // Rows without runsP (the Overview until it passes them): the note would describe a number the page does not show.
    expect(render({ tests: [...noRuns] })).not.toContain(RUNS_CHECK_NOTE);
    expect(render({})).not.toContain(RUNS_CHECK_NOTE);
    // Rows with runsP: shown by default.
    expect(render({ tests: [{ ...noRuns[0], runsP: 0.007 }] })).toContain(RUNS_CHECK_NOTE);
    // The Timeline: no rows here (its runs-check p-values are in its own comparison rows), so it passes runsNote.
    expect(render({ method: TIMELINE_METHOD_SUMMARY, runsNote: true })).toContain(RUNS_CHECK_NOTE);
    expect(render({ method: TIMELINE_METHOD_SUMMARY, runsNote: false })).not.toContain(RUNS_CHECK_NOTE);
  });

  it("keys the engine's 'strong'/'moderate' words to this page's size words, before the measured rates", () => {
    // The rates in rules.ts are written per engine strength ("a moderate signal", "a strong one"). Without a key, a
    // caregiver looking at a "Large difference" badge cannot tell which of those rates applies to it.
    // If the note is ever reworded without the engine words, no key is needed (covered by the "leaves the key out" test).
    if (!usesEngineStrengthWords(MULTIPLE_COMPARISONS_NOTE)) return;
    expect(SIGNAL_WORDS_KEY).toContain(`“${STRENGTH_SIZE_WORD.strong}”`);
    expect(SIGNAL_WORDS_KEY).toContain(`“${STRENGTH_SIZE_WORD.moderate}”`);
    // "moderate" in the measured rates counts moderate-or-strong signals, so the key must not read as Clear-only.
    expect(SIGNAL_WORDS_KEY).toMatch(/or larger/);
    expect(SIGNAL_WORDS_KEY).not.toMatch(/\d/);
    const note = text.indexOf(MULTIPLE_COMPARISONS_NOTE.replace(/\s+/g, " "));
    const key = text.indexOf(SIGNAL_WORDS_KEY);
    expect(key).toBeGreaterThan(-1);
    expect(key).toBeLessThan(note);
  });

  it("puts the key before a method text that also uses the engine words (the Timeline's)", () => {
    const t = textOf(renderToStaticMarkup(createElement(ReliabilityDisclosure, { method: TIMELINE_METHOD_SUMMARY })));
    const method = t.indexOf(TIMELINE_METHOD_SUMMARY.replace(/\s+/g, " "));
    expect(method).toBeGreaterThan(-1);
    if (usesEngineStrengthWords(TIMELINE_METHOD_SUMMARY)) {
      const key = t.indexOf(SIGNAL_WORDS_KEY);
      expect(key).toBeGreaterThan(-1);
      expect(key).toBeLessThan(method);
    }
  });

  it("leaves the key out when no text in the panel uses the engine words", () => {
    // Guard against a stale key: only checkable once rules.ts no longer says "strong"/"moderate".
    if (usesEngineStrengthWords(MULTIPLE_COMPARISONS_NOTE)) return;
    expect(text).not.toContain(SIGNAL_WORDS_KEY);
  });

  it("accepts a different summary where a script depends on the older title", () => {
    const t = textOf(renderToStaticMarkup(createElement(ReliabilityDisclosure, { summary: "How this comparison works" })));
    expect(t).toContain("How this comparison works");
    expect(t).toContain(MULTIPLE_COMPARISONS_NOTE.replace(/\s+/g, " "));
  });
});

describe("caregiver views keep one source for the numbers and one vocabulary for sizes", () => {
  const files = [
    ...readdirSync("src/views/caregiver").filter((f) => f.endsWith(".tsx")).map((f) => `src/views/caregiver/${f}`),
    ...readdirSync("src/views/shared").filter((f) => /^caregiver-.*\.tsx?$/.test(f) && !f.includes(".test.")).map((f) => `src/views/shared/${f}`),
  ];

  it("never says 'Pattern strength' or 'No clear difference'", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/Pattern strength|No clear difference/);
    }
  });

  it("does not hard-code a chance rate (the rates live in engine/timeline/rules.ts)", () => {
    for (const f of ["src/views/shared/caregiver-insights.ts", "src/views/caregiver/Overview.tsx", "src/views/caregiver/Timeline.tsx", "src/views/shared/caregiver-Reliability.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\b\d+ in \d+\b/);
    }
  });
});

describe("chart label placement", () => {
  const ev = [{ key: "k", medicationId: "m", kind: "started" as const, date: "2026-09-25", boundary: 43, label: "Lorazepam started" }];

  it("keeps a marker label inside the visible part of a scrolled plot", () => {
    // 60 days on a 542px plot, opened scrolled so only x >= 314 is visible (phone width).
    const [m] = layoutMarkers(ev, 60, 542, 314);
    const w = m.showDate ? (17 + 9) * 6.9 + 20 : 17 * 6.9 + 20;
    const left = m.anchor === "end" ? m.offset : m.anchor === "start" ? (43 / 60) * 542 : m.offset;
    expect(left).toBeGreaterThanOrEqual(314);
    expect(left + w).toBeLessThanOrEqual(542);
  });

  it("keeps the date and the right-hand placement when there is room", () => {
    const [m] = layoutMarkers(ev, 60, 1000, 0);
    expect(m.anchor).toBe("start");
    expect(m.showDate).toBe(true);
  });

  it("clamps a label that fits on neither side", () => {
    const [m] = layoutMarkers([{ ...ev[0], boundary: 30, label: "A very long medicine name started" }], 60, 300, 100);
    expect(m.anchor).toBe("free");
    expect(m.offset).toBeGreaterThanOrEqual(100);
  });

  it("aligns edge ticks so the first date is not cut off", () => {
    expect(tickAlign(0, 14, 200, 0, "Sep 28")).toBe("start");
    expect(tickAlign(7, 14, 200, 0, "Oct 5")).toBe("center");
    expect(tickAlign(5, 30, 272, 44, "Sep 17")).toBe("start");
    expect(tickAlign(2, 30, 272, 44, "Sep 14")).toBe("end");
  });
});
