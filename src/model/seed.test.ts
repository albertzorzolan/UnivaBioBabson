// Acceptance tests for the fictional demo record (docs/SPEC.md §2). The engines' demo story depends on
// every pattern below, so each one is asserted with answered-day denominators (null = unanswered, never "no").
// The last sections run the real timeline engine and the real brief verifier over the record.
import { describe, expect, it } from "vitest";
import {
  createSeed,
  DEMO_TODAY_OFFSETS,
  demoDatasetId,
  demoFreshness,
  demoSeedDate,
  refreshDemo,
  type DemoOffsetKey,
} from "./seed";
import { DEFAULT_SETTINGS, validateStore } from "./store";
import { addDays, daysBetween, isValidDate, localDate, parseDate } from "./dates";
import type { CheckIn, DiaryAnswers, Signal, StoreData, SymptomKey } from "./types";
import { analyzeTimeline, weeklyTrends } from "../engine/timeline";
import { BANNED_PATTERNS, foldText } from "../engine/brief/verify";

const TODAY = "2026-10-10";
/** Ordinary days, month/year boundaries, US DST switch days, leap days. */
const TODAYS = [
  "2026-10-10",
  "2026-10-13",
  "2026-03-08",
  "2026-03-09",
  "2026-11-01",
  "2026-11-02",
  "2026-12-31",
  "2027-01-01",
  "2026-03-01",
  "2028-02-29",
];

const off = (key: DemoOffsetKey): number => DEMO_TODAY_OFFSETS[key];

/** Check-ins whose date lies in today+from .. today+to (inclusive). */
function inWindow(data: StoreData, today: string, from: number, to: number): CheckIn[] {
  return data.checkIns.filter((c) => {
    const o = daysBetween(today, c.date);
    return o >= from && o <= to;
  });
}

/** Boolean metric: days with the symptom over days the question was answered. */
function rate(cs: CheckIn[], key: SymptomKey): { positive: number; answered: number; value: number } {
  const answered = cs.filter((c) => c.answers[key] !== null);
  const positive = answered.filter((c) => c.answers[key] === true).length;
  return { positive, answered: answered.length, value: answered.length ? positive / answered.length : NaN };
}

function mean(cs: CheckIn[], key: "energy" | "sleep"): number {
  const vals = cs.map((c) => c.answers[key]).filter((v): v is NonNullable<DiaryAnswers["energy"]> => v !== null);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Two-sided Fisher exact test (sum of tables no more likely than the observed one). Local copy so this test
 *  does not depend on the timeline engine. */
function fisherTwoSided(a: number, b: number, c: number, d: number): number {
  const lf = (n: number) => {
    let s = 0;
    for (let i = 2; i <= n; i++) s += Math.log(i);
    return s;
  };
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const p = (x: number) => Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
  const observed = p(a);
  let total = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const q = p(x);
    if (q <= observed * (1 + 1e-9)) total += q;
  }
  return Math.min(1, total);
}

function allTimestamps(d: StoreData): string[] {
  return [
    d.createdAt,
    d.updatedAt,
    ...d.medications.flatMap((m) => [m.createdAt, m.updatedAt]),
    ...d.medEvents.map((e) => e.createdAt),
    ...d.checkIns.map((c) => c.confirmedAt),
    ...d.checkInHistory.map((c) => c.confirmedAt),
    ...d.notes.map((n) => n.createdAt),
  ];
}

const seed = createSeed(TODAY);

describe("createSeed — structure and determinism", () => {
  it.each(TODAYS)("passes validateStore for today = %s", (today) => {
    expect(validateStore(createSeed(today))).toBe(true);
  });

  it.each(TODAYS)("is deterministic for today = %s", (today) => {
    expect(JSON.stringify(createSeed(today))).toBe(JSON.stringify(createSeed(today)));
  });

  it("returns fresh objects each call (callers may not mutate shared state)", () => {
    const a = createSeed(TODAY);
    const b = createSeed(TODAY);
    a.checkIns[0].answers.energy = 1;
    a.profile.conditions.push("depression");
    a.medications[0].ingredientIds.push("x");
    expect(b).toEqual(seed);
    expect(createSeed(TODAY)).toEqual(seed);
  });

  it("keeps the same story on every date: answers and stories depend only on the day offset", () => {
    const byOffset = (d: StoreData, today: string) =>
      d.checkIns.map((c) => ({ o: daysBetween(today, c.date), answers: c.answers, story: c.story, revision: c.revision }));
    for (const today of TODAYS) expect(byOffset(createSeed(today), today)).toEqual(byOffset(seed, TODAY));
  });

  it("rejects an invalid today", () => {
    expect(() => createSeed("2026-02-30")).toThrow(RangeError);
    expect(() => createSeed("10/10/2026")).toThrow(RangeError);
  });

  it("has the documented top-level defaults", () => {
    expect(seed.schemaVersion).toBe(2);
    expect(seed.datasetId).toBe("demo-margaret-2026-10-10");
    expect(seed.revision).toBe(1);
    expect(seed.isDemoData).toBe(true);
    expect(seed.reviewDecisions).toEqual([]);
    expect(seed.briefs).toEqual([]);
    expect(seed.savedQuestions).toEqual([]);
    expect(seed.settings).toEqual(DEFAULT_SETTINGS);
    expect(seed.settings).toEqual({ textSize: "standard", theme: "light", aiModel: "", tourCompleted: false });
  });

  it("has Margaret's profile", () => {
    expect(seed.profile).toEqual({
      displayName: "Margaret Rivera",
      preferredName: "Margaret",
      age: 78,
      sex: "female",
      conditions: ["hypertension", "type2_diabetes", "urinary_incontinence", "insomnia", "osteoarthritis"],
      crclMlMin: null,
      caregiverName: "Alex",
      caregiverRelation: "daughter",
    });
  });

  it("uses unique ids across every collection", () => {
    for (const today of TODAYS) {
      const d = createSeed(today);
      const ids = [...d.medications, ...d.medEvents, ...d.checkIns, ...d.notes].map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    }
  });

  it("produces valid, ordered, non-future timestamps whose local date matches the record date", () => {
    for (const today of TODAYS) {
      const d = createSeed(today);
      const startOfToday = new Date(`${today}T00:00:00`).getTime();
      for (const t of allTimestamps(d)) {
        expect(Number.isNaN(Date.parse(t))).toBe(false);
        expect(Date.parse(t)).toBeLessThan(startOfToday);
        expect(t <= d.updatedAt).toBe(true);
        expect(t >= d.createdAt).toBe(true);
      }
      for (const c of [...d.checkIns, ...d.checkInHistory]) expect(localDate(new Date(c.confirmedAt))).toBe(c.date);
      for (const n of d.notes) expect(localDate(new Date(n.createdAt))).toBe(n.date);
      expect(localDate(new Date(d.createdAt))).toBe(addDays(today, off("recordStarted")));
    }
  });

  it("documents the key offsets", () => {
    expect(DEMO_TODAY_OFFSETS.lorazepamStart).toBe(-16);
    expect(DEMO_TODAY_OFFSETS.firstCheckIn).toBe(-60);
    expect(DEMO_TODAY_OFFSETS.lastCheckIn).toBe(-1);
    expect(DEMO_TODAY_OFFSETS.beforeWindowStart).toBe(-37);
    expect(DEMO_TODAY_OFFSETS.beforeWindowEnd).toBe(-17);
    // The engine's after window is [start, min(start + 20, today)]: it runs through today, not yesterday.
    expect(DEMO_TODAY_OFFSETS.afterWindowStart).toBe(-16);
    expect(DEMO_TODAY_OFFSETS.afterWindowEnd).toBe(0);
    expect(DEMO_TODAY_OFFSETS.dizzinessUnanswered).toBe(-28);
    expect(DEMO_TODAY_OFFSETS.fall).toBe(-5);
    expect(Object.values(DEMO_TODAY_OFFSETS).every(Number.isInteger)).toBe(true);
  });

  it("types the offsets with their exact keys and still satisfies the SPEC §10 contract", () => {
    // Compile-time checks (tsc fails if either line stops being true).
    const asSpec: Record<string, number> = DEMO_TODAY_OFFSETS;
    // @ts-expect-error a misspelt key is a type error, not a silent "NaN-NaN-NaN" date
    const typo: number = DEMO_TODAY_OFFSETS.lorazepamStrat;
    expect(asSpec.lorazepamStart).toBe(-16);
    expect(typo).toBeUndefined();
  });

  it("freezes the exported offsets so no consumer can change what createSeed builds", () => {
    expect(Object.isFrozen(DEMO_TODAY_OFFSETS)).toBe(true);
    const writable = DEMO_TODAY_OFFSETS as unknown as Record<string, number>;
    expect(() => {
      writable.nearFallBathroom = -12; // ES modules run in strict mode: writing a frozen property throws
    }).toThrow(TypeError);
    expect(DEMO_TODAY_OFFSETS.nearFallBathroom).toBe(-11);
    expect(createSeed(TODAY)).toEqual(seed);
  });
});

describe("createSeed — medication list (SPEC §2 table)", () => {
  const med = (id: string) => {
    const m = seed.medications.find((x) => x.id === id);
    if (!m) throw new Error(`missing ${id}`);
    return m;
  };

  it("has the eight stable medication ids in table order", () => {
    expect(seed.medications.map((m) => m.id)).toEqual([
      "med-amlodipine",
      "med-furosemide",
      "med-metformin",
      "med-atorvastatin",
      "med-omeprazole",
      "med-oxybutynin",
      "med-tylenolpm",
      "med-lorazepam",
    ]);
  });

  it.each([
    ["med-amlodipine", "Amlodipine", ["amlodipine"], "exact", -140, "Dr. Okafor (cardiology)", "Blood pressure"],
    ["med-furosemide", "Furosemide (Lasix)", ["furosemide"], "exact", -95, "Dr. Lee (primary care)", "Ankle swelling"],
    ["med-metformin", "Metformin", ["metformin"], "exact", -900, "Dr. Lee (primary care)", "Diabetes"],
    ["med-atorvastatin", "Atorvastatin", ["atorvastatin"], "exact", -900, "Dr. Lee (primary care)", "Cholesterol"],
    ["med-omeprazole", "Omeprazole", ["omeprazole"], "exact", -400, "Dr. Lee (primary care)", "Heartburn"],
    ["med-oxybutynin", "Oxybutynin", ["oxybutynin"], "exact", -210, "Dr. Shah (urology)", "Bladder"],
    ["med-tylenolpm", "Tylenol PM (OTC)", ["acetaminophen", "diphenhydramine"], "combo", -180, "Self (OTC)", "Sleep"],
    ["med-lorazepam", "Lorazepam (Ativan)", ["lorazepam"], "exact", -16, "Urgent care", "Anxiety / sleep"],
  ] as const)("%s: %s", (id, name, ingredients, match, start, prescriber, reason) => {
    const m = med(id);
    expect(m.name).toBe(name);
    expect(m.ingredientIds).toEqual(ingredients);
    expect(m.match).toBe(match);
    expect(m.startDate).toBe(addDays(TODAY, start));
    expect(m.prescriber).toBe(prescriber);
    expect(m.reason).toBe(reason);
    expect(m.endDate).toBeNull();
    expect(m.dose.length).toBeGreaterThan(0);
    expect(m.frequency.length).toBeGreaterThan(0);
  });

  it("marks Tylenol PM as OTC and as-needed, and nothing else", () => {
    expect(seed.medications.filter((m) => m.otc).map((m) => m.id)).toEqual(["med-tylenolpm"]);
    expect(seed.medications.filter((m) => m.asNeeded).map((m) => m.id)).toEqual(["med-tylenolpm"]);
  });

  it("has doses and schedules from the table", () => {
    expect([med("med-amlodipine").dose, med("med-amlodipine").frequency]).toEqual(["10 mg", "once daily"]);
    expect([med("med-metformin").dose, med("med-metformin").frequency]).toEqual(["500 mg", "twice daily"]);
    expect([med("med-lorazepam").dose, med("med-lorazepam").frequency]).toEqual(["0.5 mg", "at bedtime"]);
    expect(med("med-tylenolpm").dose).toBe("2 caplets");
  });

  it("sets up the amlodipine → furosemide cascade: furosemide started 45 days later for ankle swelling", () => {
    expect(daysBetween(med("med-amlodipine").startDate, med("med-furosemide").startDate)).toBe(45);
    expect(med("med-furosemide").reason.toLowerCase()).toContain("swelling");
  });

  it("has a 'started' and an 'added_to_list' event for every medication", () => {
    for (const m of seed.medications) {
      const evts = seed.medEvents.filter((e) => e.medicationId === m.id);
      const started = evts.filter((e) => e.kind === "started");
      const added = evts.filter((e) => e.kind === "added_to_list");
      expect(started).toHaveLength(1);
      expect(added).toHaveLength(1);
      expect(started[0].date).toBe(m.startDate);
      expect(added[0].date >= m.startDate).toBe(true);
      expect(localDate(new Date(m.createdAt))).toBe(added[0].date);
    }
    expect(seed.medEvents).toHaveLength(seed.medications.length * 2);
    expect(seed.medEvents.every((e) => isValidDate(e.date))).toBe(true);
    const dates = seed.medEvents.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("records lorazepam being added the day after urgent care started it", () => {
    const added = seed.medEvents.find((e) => e.medicationId === "med-lorazepam" && e.kind === "added_to_list");
    expect(added?.date).toBe(addDays(TODAY, -15));
  });
});

describe("createSeed — diary coverage", () => {
  it.each(TODAYS)("covers today-60 .. today-1 with natural gaps and leaves today empty (%s)", (today) => {
    const d = createSeed(today);
    const dates = d.checkIns.map((c) => c.date);
    expect(dates).not.toContain(today);
    expect(dates.every((x) => x >= addDays(today, -60) && x <= addDays(today, -1))).toBe(true);
    expect([...dates].sort()).toEqual(dates);
    expect(dates[0]).toBe(addDays(today, -60));
    expect(dates[dates.length - 1]).toBe(addDays(today, -1));
    const missing = 60 - dates.length;
    expect(missing / 60).toBeGreaterThanOrEqual(0.1);
    expect(missing / 60).toBeLessThanOrEqual(0.2);
    // Gaps are short (a day or two away), never long silent stretches.
    for (let i = 1; i < dates.length; i++) expect(daysBetween(dates[i - 1], dates[i])).toBeLessThanOrEqual(3);
  });

  it("answers every question on most days, with a few deliberately unanswered fields", () => {
    const nulls = seed.checkIns.flatMap((c) =>
      (Object.keys(c.answers) as (keyof DiaryAnswers)[])
        .filter((k) => k !== "dizzinessSeverity" && c.answers[k] === null)
        .map((k) => `${c.date}:${k}`),
    );
    expect(nulls.length).toBeGreaterThanOrEqual(3);
    expect(nulls.length).toBeLessThanOrEqual(8);
    const fieldsWithNulls = new Set(nulls.map((n) => n.split(":")[1]));
    expect(fieldsWithNulls.size).toBeGreaterThanOrEqual(3);
  });

  it("only records a dizziness severity when dizziness was recorded, and usually does", () => {
    for (const c of seed.checkIns) if (c.answers.dizziness !== true) expect(c.answers.dizzinessSeverity).toBeNull();
    const dizzy = seed.checkIns.filter((c) => c.answers.dizziness === true);
    const withSeverity = dizzy.filter((c) => c.answers.dizzinessSeverity !== null);
    expect(withSeverity.length / dizzy.length).toBeGreaterThan(0.8);
    expect(new Set(withSeverity.map((c) => c.answers.dizzinessSeverity))).toEqual(new Set([1, 2, 3]));
  });

  it("has a story on about a third of check-in days", () => {
    const withStory = seed.checkIns.filter((c) => c.story.length > 0).length;
    expect(withStory / seed.checkIns.length).toBeGreaterThanOrEqual(0.28);
    expect(withStory / seed.checkIns.length).toBeLessThanOrEqual(0.4);
  });
});

describe("createSeed — clinical patterns (answered-day denominators)", () => {
  // The same windows the timeline engine uses for lorazepam (see DEMO_TODAY_OFFSETS).
  const before = () => inWindow(seed, TODAY, off("beforeWindowStart"), off("beforeWindowEnd"));
  const after = () => inWindow(seed, TODAY, off("afterWindowStart"), off("afterWindowEnd"));

  it("before lorazepam (today-37..today-17): occasional dizziness, little drowsiness, no falls", () => {
    const cs = before();
    expect(rate(cs, "dizziness").value).toBeGreaterThanOrEqual(0.1);
    expect(rate(cs, "dizziness").value).toBeLessThanOrEqual(0.2);
    expect(rate(cs, "drowsiness").value).toBeLessThanOrEqual(0.15);
    expect(rate(cs, "confusion").positive).toBeLessThanOrEqual(1);
    expect(rate(cs, "nearFall").positive).toBeLessThanOrEqual(1);
    expect(rate(cs, "fall").positive).toBe(0);
    expect(mean(cs, "energy")).toBeGreaterThanOrEqual(3.3);
    expect(mean(cs, "energy")).toBeLessThanOrEqual(3.7);
    expect(mean(cs, "sleep")).toBeGreaterThanOrEqual(2.5);
    expect(mean(cs, "sleep")).toBeLessThanOrEqual(3);
  });

  it("after lorazepam (today-16..today): more dizziness, drowsiness, confusion, 2 near-falls, 1 fall", () => {
    const cs = after();
    // SPEC §2 asks for ~55–60%. The seed records 9 of 14 (64%): 8 of 14 vs 2 of 19 gives Fisher p = 0.007, and
    // 0.0098 once a live "no" check-in is saved today (8 of 15). That is a hair from the p < 0.01 bar for
    // "strong" and above drowsiness's p, so the headline signal would change mid-demo. Hence the 0.55–0.65 band.
    expect(rate(cs, "dizziness").value).toBeGreaterThanOrEqual(0.55);
    expect(rate(cs, "dizziness").value).toBeLessThanOrEqual(0.65);
    expect(rate(cs, "drowsiness").value).toBeGreaterThanOrEqual(0.5);
    expect(rate(cs, "drowsiness").value).toBeLessThanOrEqual(0.7);
    expect(rate(cs, "confusion").positive).toBeGreaterThanOrEqual(3);
    expect(rate(cs, "confusion").positive).toBeLessThanOrEqual(4);
    expect(rate(cs, "nearFall").positive).toBe(2);
    expect(rate(cs, "fall").positive).toBe(1);
    expect(mean(cs, "energy")).toBeGreaterThanOrEqual(2.3);
    expect(mean(cs, "energy")).toBeLessThanOrEqual(2.7);
    expect(mean(cs, "sleep")).toBeGreaterThanOrEqual(3);
    expect(mean(cs, "sleep")).toBeLessThanOrEqual(3.5);
  });

  it("pins the exact counts the demo script quotes", () => {
    expect(rate(after(), "dizziness")).toMatchObject({ positive: 9, answered: 14 });
    expect(rate(before(), "dizziness")).toMatchObject({ positive: 2, answered: 19 });
    expect(rate(after(), "drowsiness")).toMatchObject({ positive: 8, answered: 14 });
    expect(rate(before(), "drowsiness")).toMatchObject({ positive: 2, answered: 20 });
    expect(rate(after(), "confusion")).toMatchObject({ positive: 4, answered: 14 });
    expect(rate(before(), "confusion")).toMatchObject({ positive: 0, answered: 20 });
    expect(after().filter((c) => c.answers.appetite === "worse")).toHaveLength(3);
    expect(after().filter((c) => c.answers.appetite !== null)).toHaveLength(13);
    expect(before().filter((c) => c.answers.appetite === "worse")).toHaveLength(0);
    expect(after()).toHaveLength(14);
    expect(before()).toHaveLength(20);
  });

  it("leaves exactly one dizziness question blank before the start, so 20 check-ins give 19 answered days", () => {
    const blank = before().filter((c) => c.answers.dizziness === null);
    expect(blank.map((c) => c.date)).toEqual([addDays(TODAY, off("dizzinessUnanswered"))]);
  });

  it("energy is lower and sleep better after the start, by margins clear of the engine's thresholds", () => {
    // Means: after 37/14 ≈ 2.64 vs before 70/20 = 3.5 (diff −0.86); sleep 48/14 ≈ 3.43 vs 52/20 = 2.6 (+0.83).
    // "Moderate" needs |diff| ≥ 0.6, "strong" needs ≥ 1.0. Adding any single rating (1–5) today moves each mean
    // by at most 0.17, so both stay in the moderate band (asserted with the real engine below).
    expect(mean(after(), "energy") - mean(before(), "energy")).toBeCloseTo(37 / 14 - 3.5, 10);
    expect(mean(after(), "sleep") - mean(before(), "sleep")).toBeCloseTo(48 / 14 - 2.6, 10);
  });

  it("dizziness and drowsiness differences reach two-sided Fisher exact p < 0.01", () => {
    for (const key of ["dizziness", "drowsiness"] as const) {
      const a = rate(after(), key);
      const b = rate(before(), key);
      const p = fisherTwoSided(a.positive, a.answered - a.positive, b.positive, b.answered - b.positive);
      expect(p).toBeLessThan(0.01);
      expect(a.value - b.value).toBeGreaterThanOrEqual(0.3); // "strong" also needs ≥30 points (SPEC §6.3)
    }
  });

  it("the real fall is ~5 days ago, minor, in the bathroom", () => {
    const falls = seed.checkIns.filter((c) => c.answers.fall === true);
    expect(falls).toHaveLength(1);
    expect(falls[0].date).toBe(addDays(TODAY, -5));
    expect(falls[0].story).toContain("landed on my bottom in the bathroom");
    expect(falls[0].answers.nearFall).toBe(false);
  });

  it("both near-falls after lorazepam fall on the documented days", () => {
    const nearFalls = after().filter((c) => c.answers.nearFall === true).map((c) => c.date);
    expect(nearFalls).toEqual([addDays(TODAY, off("nearFallKitchen")), addDays(TODAY, off("nearFallBathroom"))]);
  });

  it("ankle swelling: ~40% of answered days in today-60..today-40, 10–15% afterwards", () => {
    const early = rate(inWindow(seed, TODAY, -60, -40), "swelling");
    const later = rate(inWindow(seed, TODAY, -39, -1), "swelling");
    expect(early.value).toBeGreaterThanOrEqual(0.35);
    expect(early.value).toBeLessThanOrEqual(0.45);
    expect(later.value).toBeGreaterThanOrEqual(0.1);
    expect(later.value).toBeLessThanOrEqual(0.15);
  });

  it("appetite: mostly 'same', a few 'worse' only after lorazepam", () => {
    const answered = seed.checkIns.filter((c) => c.answers.appetite !== null);
    const same = answered.filter((c) => c.answers.appetite === "same").length;
    expect(same / answered.length).toBeGreaterThan(0.8);
    const worse = (cs: CheckIn[]) => cs.filter((c) => c.answers.appetite === "worse").length;
    expect(worse(after())).toBeGreaterThanOrEqual(2);
    expect(worse(after())).toBeLessThanOrEqual(4);
    expect(worse(inWindow(seed, TODAY, -60, -17))).toBe(0);
  });

  it("no record of dizziness/drowsiness on the lorazepam start day itself (first dose is that night)", () => {
    const start = seed.checkIns.find((c) => c.date === addDays(TODAY, -16));
    expect(start?.answers.dizziness).toBe(false);
    expect(start?.answers.drowsiness).toBe(false);
  });
});

describe("createSeed — stories, spans and provenance", () => {
  const stories = seed.checkIns.map((c) => c.story).filter(Boolean);
  const all = stories.join("\n").toLowerCase();

  it.each([
    "no dizziness today", // negation
    "sofia fell off her bike", // someone else's symptom (experiencer = other)
    "woozy",
    "nearly went over in the kitchen",
    "slept like a log",
    "didn't feel like eating",
    "forgot my water pill", // medication mention
    "landed on my bottom in the bathroom",
    "nodding off in my chair", // drowsiness in everyday words, before lorazepam
  ])("includes the phrase %j", (phrase) => {
    expect(all).toContain(phrase);
  });

  it.each(["weeding", "sofia", "church", "bridge club", "biscuit"])("mentions everyday life: %s", (word) => {
    expect(all).toContain(word);
  });

  it("stories with a negated symptom record that symptom as 'no'", () => {
    const neg = seed.checkIns.filter((c) => /no dizziness today/i.test(c.story));
    expect(neg.length).toBeGreaterThanOrEqual(1);
    for (const c of neg) expect(c.answers.dizziness).toBe(false);
  });

  it("Sofia's fall is not recorded as Margaret's fall", () => {
    const c = seed.checkIns.find((x) => x.story.includes("Sofia fell off her bike"));
    expect(c?.answers.fall).toBe(false);
    expect(c?.provenance.fall).toBeUndefined();
  });

  it.each(TODAYS)("every span quotes its story exactly (%s)", (today) => {
    const d = createSeed(today);
    let spans = 0;
    for (const c of [...d.checkIns, ...d.checkInHistory]) {
      const check = (s: { start: number; end: number; quote: string }) => {
        spans++;
        expect(c.story.slice(s.start, s.end)).toBe(s.quote);
        expect(s.end).toBeGreaterThan(s.start);
      };
      for (const p of Object.values(c.provenance)) p?.spans.forEach(check);
      for (const o of c.otherSymptoms) if (o.span) check(o.span);
      for (const m of c.medNotes) if (m.span) check(m.span);
    }
    expect(spans).toBeGreaterThan(30);
  });

  it("provenance is 'seed', only on story days, and only for answered fields", () => {
    for (const c of seed.checkIns) {
      const entries = Object.entries(c.provenance);
      if (!c.story) expect(entries).toHaveLength(0);
      for (const [field, p] of entries) {
        expect(p?.origin).toBe("seed");
        expect(["explicit", "inferred"]).toContain(p?.certainty);
        expect(p?.spans.length).toBeGreaterThan(0);
        expect(c.answers[field as keyof DiaryAnswers]).not.toBeNull();
      }
    }
    expect(seed.checkIns.filter((c) => Object.keys(c.provenance).length > 0).length).toBeGreaterThanOrEqual(15);
  });

  it("records the forgotten water pill as a medication note linked to furosemide", () => {
    const notes = seed.checkIns.flatMap((c) => c.medNotes.map((m) => ({ ...m, date: c.date })));
    const water = notes.find((m) => /forgot my water pill/i.test(m.text));
    expect(water?.medicationId).toBe("med-furosemide");
    expect(water?.date).toBe(addDays(TODAY, off("forgotWaterPill")));
  });

  it("links a medication note only to a medicine that was already on the list that day", () => {
    const addedOn = new Map(seed.medEvents.filter((e) => e.kind === "added_to_list").map((e) => [e.medicationId, e.date]));
    const notes = seed.checkIns.flatMap((c) => c.medNotes.map((m) => ({ ...m, date: c.date })));
    for (const m of notes) {
      if (m.medicationId === null) continue;
      expect(addedOn.has(m.medicationId)).toBe(true);
      expect(addedOn.get(m.medicationId)! < m.date).toBe(true);
    }
    // Margaret's remarks about the urgent care prescription name no medicine, and lorazepam was not on the list
    // yet, so they stay unlinked: the "medicine not on the list" situation the caregiver needs to see.
    const unlinked = notes.filter((m) => m.medicationId === null);
    expect(unlinked.map((m) => [daysBetween(TODAY, m.date), m.text])).toEqual([
      [off("lorazepamStart"), "a new pill to take at bedtime"],
      [off("lorazepamAddedToList"), "Took the new pill last night"],
    ]);
    expect(notes.filter((m) => m.medicationId !== null).map((m) => m.medicationId)).toEqual(["med-furosemide", "med-tylenolpm"]);
  });

  it("has provenance spans that nest across fields on known days (fixtures for story highlighters)", () => {
    // "quite dizzy" (dizzinessSeverity) contains "dizzy" (dizziness). Highlighters must merge ranges first.
    for (const o of [-35, -15, -14, -5, -3]) {
      const c = seed.checkIns.find((x) => x.date === addDays(TODAY, o))!;
      const dz = c.provenance.dizziness!.spans[0];
      const sev = c.provenance.dizzinessSeverity!.spans[0];
      expect(sev.start <= dz.start && dz.end <= sev.end).toBe(true);
    }
    const kitchen = seed.checkIns.find((x) => x.date === addDays(TODAY, off("nearFallKitchen")))!;
    expect(kitchen.provenance.dizziness!.spans[0].quote).toBe("dizzy");
    expect(kitchen.provenance.dizzinessSeverity!.spans[0].quote).toBe("quite dizzy");
  });
});

/** Every string anywhere in the record (stories, notes, medication fields, event details, medNotes, ids, …). */
function allStrings(x: unknown, path = "seed", out: { path: string; text: string }[] = []): { path: string; text: string }[] {
  if (typeof x === "string") out.push({ path, text: x });
  else if (Array.isArray(x)) x.forEach((v, i) => allStrings(v, `${path}[${i}]`, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) allStrings(v, `${path}.${k}`, out);
  return out;
}

describe("createSeed — health-language rules (SPEC §3)", () => {
  const strings = allStrings(seed);

  it("walks every kind of seeded text", () => {
    const paths = strings.map((s) => s.path).join("\n");
    for (const field of [".story", ".text", ".detail", ".name", ".reason", ".prescriber", ".dose", ".frequency", ".quote"])
      expect(paths).toContain(field);
    expect(paths).toContain("checkInHistory[0].story");
    expect(paths).toContain(".medNotes[0].text");
    expect(paths).toContain("profile.displayName");
  });

  // The verifier that screens AI sentences (engine/brief/verify.ts). A seeded note that it rejects would make every
  // AI sentence citing that note fail in the live demo, so every string must pass every pattern. Patterns that
  // the verifier only applies to sentences about the person are applied to everything here (stricter).
  it.each(BANNED_PATTERNS.map((b) => [b.category, b.reason, b.pattern] as const))(
    "no seeded text matches the verifier's %s rule: %s",
    (_category, _reason, pattern) => {
      // The verifier matches typography-folded text (curly quotes and dashes to ASCII); check both forms.
      const hits = strings.filter((s) => pattern.test(s.text) || pattern.test(foldText(s.text))).map((s) => `${s.path}: ${s.text}`);
      expect(hits).toEqual([]);
    },
  );

  it("passes the short local list too (kept as a fallback if the verifier's list changes)", () => {
    const banned = [
      /\bcaus(e|ed|es|ing)\b/i,
      /\bdangerous\b/i,
      /\bsafe(ly|ty)?\b/i,
      /\burgent\b(?!\s+care)/i, // "urgent care" is a place, not a triage level
      /\byou should\b/i,
      /\bdiagnos/i,
      /\brisk score\b/i,
    ];
    for (const { text } of strings) for (const re of banned) expect(text).not.toMatch(re);
  });
});

describe("createSeed — notes", () => {
  const SPEC_CONCERN =
    "Mom seems foggier in the mornings since urgent care started the new sleeping pill. She almost fell in the bathroom on Tuesday.";

  it("has 4 caregiver notes in the last 30 days, exactly one pinned", () => {
    const cg = seed.notes.filter((n) => n.author === "caregiver");
    expect(cg).toHaveLength(4);
    for (const n of cg) {
      expect(daysBetween(n.date, TODAY)).toBeGreaterThanOrEqual(1);
      expect(daysBetween(n.date, TODAY)).toBeLessThanOrEqual(30);
    }
    expect(seed.notes.filter((n) => n.pinned)).toHaveLength(1);
    expect(cg.filter((n) => n.pinned)).toHaveLength(1);
  });

  it("uses the SPEC concern text verbatim when today is 2026-10-10", () => {
    expect(seed.notes.find((n) => n.pinned)?.text).toBe(SPEC_CONCERN);
  });

  it.each(TODAYS)("names the weekday of a real bathroom near-fall in the 6 days before the note (%s)", (today) => {
    const d = createSeed(today);
    const pinned = d.notes.find((n) => n.pinned);
    expect(pinned?.text.startsWith("Mom seems foggier in the mornings since urgent care started the new sleeping pill.")).toBe(true);
    const weekday = /in the bathroom on (\w+day)\.$/.exec(pinned?.text ?? "")?.[1];
    expect(weekday).toBeDefined();
    const match = d.checkIns.filter((c) => {
      const gap = daysBetween(c.date, pinned!.date);
      const name = parseDate(c.date).toLocaleDateString("en-US", { weekday: "long" });
      return c.answers.nearFall === true && gap >= 1 && gap <= 6 && name === weekday && /bathroom/i.test(c.story);
    });
    expect(match).toHaveLength(1);
    // ...and the pinned note comes after lorazepam started, as its text says.
    expect(pinned!.date > addDays(today, off("lorazepamStart"))).toBe(true);
  });

  it("has one unpinned patient note about dry mouth", () => {
    const pt = seed.notes.filter((n) => n.author === "patient");
    expect(pt).toHaveLength(1);
    expect(pt[0].pinned).toBe(false);
    expect(pt[0].text).toMatch(/dry mouth/i);
  });

  it("orders notes by date", () => {
    const dates = seed.notes.map((n) => n.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("createSeed — audit trail", () => {
  it("keeps the first version of one corrected check-in in checkInHistory", () => {
    expect(seed.checkInHistory).toHaveLength(1);
    const old = seed.checkInHistory[0];
    const live = seed.checkIns.find((c) => c.id === old.id);
    expect(live).toBeDefined();
    expect(old.date).toBe(addDays(TODAY, off("correctedCheckIn")));
    expect(live!.date).toBe(old.date);
    expect(old.revision).toBe(1);
    expect(live!.revision).toBe(2);
    expect(old.confirmedAt < live!.confirmedAt).toBe(true);
    expect(old.answers).not.toEqual(live!.answers);
    expect(old.story).not.toBe(live!.story);
    // Every other live check-in is on its first revision.
    expect(seed.checkIns.filter((c) => c.revision !== 1).map((c) => c.id)).toEqual([old.id]);
  });
});

// ---------------------------------------------------------------------------
// Demo acceptance with the real timeline engine (SPEC §6.3). These are the numbers the Overview card, the
// timeline and the visit brief put on screen, so they are pinned here rather than in each consumer.

const BLANK: DiaryAnswers = {
  energy: null,
  sleep: null,
  appetite: null,
  dizziness: null,
  dizzinessSeverity: null,
  drowsiness: null,
  confusion: null,
  fall: null,
  nearFall: null,
  swelling: null,
};

/** The seed plus one check-in saved live today (as in the guided tour or a judge trying the app). */
function withLiveCheckIn(answers: Partial<DiaryAnswers>, base: StoreData = seed): StoreData {
  const live: CheckIn = {
    id: "chk-live",
    date: TODAY,
    answers: { ...BLANK, ...answers },
    otherSymptoms: [],
    story: "",
    provenance: {},
    medNotes: [],
    confirmedAt: "2026-10-10T15:00:00.000Z",
    revision: 1,
  };
  return { ...base, checkIns: [...base.checkIns, live] };
}

function signalsOf(d: StoreData): Signal[] {
  return analyzeTimeline({ checkIns: d.checkIns, meds: d.medications, today: TODAY }).signals;
}

/**
 * "metric:strength[:better]" for each flagged signal (strong or moderate), in the engine's display order.
 * Whether "weak" differences are returned as signals is the engine's presentation policy, so they are ignored here.
 */
const labels = (ss: Signal[]) =>
  ss.filter((s) => s.strength !== "weak").map((s) => `${s.metric}:${s.strength}${s.direction === "better" ? ":better" : ""}`);
const strengthOf = (ss: Signal[], metric: string) => ss.find((s) => s.metric === metric)?.strength ?? "none";

/** The flagged lorazepam signals (poor appetite, 3 of 13 vs 0 of 20, is a small difference that is not flagged). */
const EXPECTED_SIGNALS = ["dizziness:strong", "drowsiness:strong", "energy:moderate", "sleep:moderate:better", "confusion:moderate"];

describe("createSeed — what the timeline engine shows", () => {
  const analysis = analyzeTimeline({ checkIns: seed.checkIns, meds: seed.medications, today: TODAY });

  it("finds the lorazepam signals, led by dizziness", () => {
    expect(labels(analysis.signals).slice(0, 2)).toEqual(["dizziness:strong", "drowsiness:strong"]);
    expect([...labels(analysis.signals)].sort()).toEqual([...EXPECTED_SIGNALS].sort());
    expect(analysis.signals.every((s) => s.medicationId === "med-lorazepam" && s.event === "started")).toBe(true);
    expect(analysis.signals.every((s) => s.eventDate === addDays(TODAY, off("lorazepamStart")))).toBe(true);
  });

  it("renders the headline sentence with answered-day counts and a window that runs through today", () => {
    const dizzy = analysis.signals[0];
    expect(dizzy.after).toMatchObject({ positive: 9, answered: 14, from: "2026-09-24", to: TODAY });
    expect(dizzy.before).toMatchObject({ positive: 2, answered: 19, from: "2026-09-03", to: "2026-09-23" });
    expect(dizzy.pValue).toBeLessThan(0.005);
    expect(dizzy.text).toBe(
      "Dizziness was recorded on 9 of 14 answered days from Sep 24, when Lorazepam (Ativan) was started, " +
        "through Oct 10, compared with 2 of 19 answered days in the 21 days before.",
    );
  });

  it("keeps energy and sleep clear of the strength thresholds (0.6 moderate, 1.0 strong)", () => {
    const energy = analysis.signals.find((s) => s.metric === "energy")!;
    const sleep = analysis.signals.find((s) => s.metric === "sleep")!;
    expect(energy.after.value - energy.before.value).toBeCloseTo(-0.857, 3);
    expect(sleep.after.value - sleep.before.value).toBeCloseTo(0.829, 3);
    expect(energy.pValue).toBeLessThan(0.01);
    expect(sleep.pValue).toBeLessThan(0.01);
  });

  it("only lorazepam can be compared; older changes say exactly why not", () => {
    const status = Object.fromEntries(analysis.perMed.map((p) => [p.medicationId, p.status]));
    expect(status).toEqual({
      "med-lorazepam": "ok",
      "med-furosemide": "insufficient", // started before the diary began (SPEC §2: diary is ~60 days)
      "med-amlodipine": "insufficient",
      "med-tylenolpm": "insufficient",
      "med-oxybutynin": "outside_range",
      "med-omeprazole": "outside_range",
      "med-atorvastatin": "outside_range",
      "med-metformin": "outside_range",
    });
    for (const p of analysis.perMed) if (p.status !== "ok") expect(p.reason).toMatch(/\S/);
  });

  it("shows the same signals on every date the demo might be opened", () => {
    for (const today of TODAYS) {
      const d = createSeed(today);
      const ss = analyzeTimeline({ checkIns: d.checkIns, meds: d.medications, today }).signals;
      expect(labels(ss)).toEqual(labels(analysis.signals));
      expect(ss.map((s) => s.pValue)).toEqual(analysis.signals.map((s) => s.pValue));
    }
  });

  it("does not change after a neutral check-in is saved live today", () => {
    const neutral = withLiveCheckIn({
      energy: 3,
      sleep: 3,
      appetite: "same",
      dizziness: false,
      drowsiness: false,
      confusion: false,
      fall: false,
      nearFall: false,
      swelling: false,
    });
    const ss = signalsOf(neutral);
    expect(labels(ss).slice(0, 2)).toEqual(["dizziness:strong", "drowsiness:strong"]);
    expect([...labels(ss)].sort()).toEqual([...EXPECTED_SIGNALS].sort());
  });

  it("still leads with dizziness when the knowledge base marks lorazepam's recognized effects (as the app runs it)", () => {
    // Benzodiazepine labeling lists dizziness, drowsiness, confusion and falls; the ordering must not depend on
    // which of these the KB happens to include, so try each subset that contains dizziness and drowsiness.
    const extras = ["confusion", "energy", "fall", "nearFall"] as const;
    for (let mask = 0; mask < 1 << extras.length; mask++) {
      const known = new Set<string>(["dizziness", "drowsiness", ...extras.filter((_, i) => mask & (1 << i))]);
      const ss = analyzeTimeline({
        checkIns: seed.checkIns,
        meds: seed.medications,
        today: TODAY,
        isKnownEffect: (med, metric) => med.id === "med-lorazepam" && known.has(metric),
      }).signals;
      expect(labels(ss).slice(0, 2)).toEqual(["dizziness:strong", "drowsiness:strong"]);
      expect(ss[0].knownEffect).toBe(true);
    }
  });

  it("does not change after the guided tour's example story is saved (woozy, slept badly, no falls)", () => {
    const ss = signalsOf(withLiveCheckIn({ dizziness: true, dizzinessSeverity: 1, sleep: 2, fall: false }));
    expect(labels(ss).slice(0, 2)).toEqual(["dizziness:strong", "drowsiness:strong"]);
    expect([...labels(ss)].sort()).toEqual([...EXPECTED_SIGNALS].sort());
  });

  it("stays stable whatever single check-in is saved live today (every combination of answers)", () => {
    const tri = [true, false, null] as const;
    const scale = [1, 2, 3, 4, 5, null] as const;
    const problems: string[] = [];
    let scenarios = 0;
    for (const energy of scale)
      for (const sleep of scale)
        for (const dizziness of tri)
          for (const drowsiness of tri)
            for (const confusion of tri) {
              scenarios++;
              const answers = { energy, sleep, dizziness, dizzinessSeverity: dizziness ? (1 as const) : null, drowsiness, confusion };
              const ss = signalsOf(withLiveCheckIn({ ...answers, appetite: "same", fall: false, nearFall: false }));
              const say = (what: string) => problems.push(`${what}: ${JSON.stringify(answers)} -> ${labels(ss).join(", ")}`);
              if (strengthOf(ss, "dizziness") !== "strong") say("dizziness not strong");
              if (strengthOf(ss, "drowsiness") !== "strong") say("drowsiness not strong");
              if (strengthOf(ss, "energy") !== "moderate") say("energy left the moderate band");
              if (strengthOf(ss, "sleep") !== "moderate") say("sleep left the moderate band");
              // A live "yes" can lift confusion to strong (5 of 15 vs 0 of 20); it never drops below moderate.
              if (!["strong", "moderate"].includes(strengthOf(ss, "confusion"))) say("confusion below moderate");
              // Dizziness leads unless today's own entry records drowsiness without dizziness.
              const drowsyOnlyToday = drowsiness === true && dizziness !== true;
              if (!drowsyOnlyToday && ss[0]?.metric !== "dizziness") say("dizziness not first");
            }
    expect(scenarios).toBe(972);
    expect(problems).toEqual([]);
  });

  it("keeps the remaining items in range whatever is answered today for appetite, falls and near-falls", () => {
    for (const appetite of ["worse", "same", "better", null] as const)
      for (const fall of [true, false, null])
        for (const nearFall of [true, false, null]) {
          const ss = signalsOf(withLiveCheckIn({ energy: 3, sleep: 3, dizziness: false, drowsiness: false, appetite, fall, nearFall }));
          expect(labels(ss).slice(0, 2)).toEqual(["dizziness:strong", "drowsiness:strong"]);
          // Poor appetite is a small difference (3 of 13 vs 0 of 20, p ≈ 0.05); a live "worse" makes it moderate (4 of 14).
          if (appetite === "worse") expect(strengthOf(ss, "appetiteWorse")).toBe("moderate");
          else expect(["weak", "none"]).toContain(strengthOf(ss, "appetiteWorse"));
          // Falls and near-falls are too rare to test as rates; they are shown as counts instead.
          expect(strengthOf(ss, "fall")).toBe("none");
          expect(strengthOf(ss, "nearFall")).toBe("none");
        }
  });

  it("gives Margaret's 'My week' view more dizziness and drowsiness than last week", () => {
    const week = Object.fromEntries(weeklyTrends(seed.checkIns, TODAY).map((w) => [w.metric, w]));
    expect(week.dizziness.direction).toBe("worse");
    expect([week.dizziness.thisWeek.positive, week.dizziness.thisWeek.answered]).toEqual([5, 6]);
    expect([week.dizziness.lastWeek.positive, week.dizziness.lastWeek.answered]).toEqual([2, 5]);
    expect(week.drowsiness.direction).toBe("worse");
    expect(week.energy.direction).toBe("worse");
    expect(week.sleep.direction).toBe("same");
    expect(Object.values(week).every((w) => w.direction !== "not_enough")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Keeping a saved demo record current (helpers for store.ts / Settings)

describe("demo freshness helpers", () => {
  it("builds and reads the dataset id", () => {
    expect(demoDatasetId(TODAY)).toBe("demo-margaret-2026-10-10");
    expect(seed.datasetId).toBe(demoDatasetId(TODAY));
    expect(demoSeedDate(seed)).toBe(TODAY);
    expect(demoSeedDate(createSeed("2028-02-29"))).toBe("2028-02-29");
  });

  it("does not treat other records as demo data", () => {
    expect(demoSeedDate({ ...seed, isDemoData: false })).toBeNull();
    expect(demoSeedDate({ ...seed, datasetId: "household-7f3a" })).toBeNull();
    expect(demoSeedDate({ ...seed, datasetId: "demo-margaret-2026-02-30" })).toBeNull();
    expect(demoSeedDate({ ...seed, datasetId: "demo-margaret-" })).toBeNull();
    expect(demoFreshness({ ...seed, isDemoData: false, revision: 9 }, "2027-01-01")).toBe("current");
  });

  it("is current on the day the record was built", () => {
    expect(demoFreshness(seed, TODAY)).toBe("current");
    expect(demoFreshness({ ...seed, revision: 5 }, TODAY)).toBe("current");
  });

  it("can be refreshed silently on a later (or earlier) day when nobody has changed it", () => {
    expect(demoFreshness(seed, "2026-10-11")).toBe("refresh");
    expect(demoFreshness(seed, "2026-10-09")).toBe("refresh");
    // Settings-only changes keep revision 1 and are carried over, so they do not block a refresh.
    const darkTheme: StoreData = { ...seed, settings: { ...seed.settings, theme: "dark" } };
    expect(demoFreshness(darkTheme, "2026-10-13")).toBe("refresh");
  });

  it("is stale (ask first) when it was changed or holds a saved brief", () => {
    expect(demoFreshness({ ...seed, revision: 2 }, "2026-10-11")).toBe("stale");
    const brief = { id: "brief-1" } as unknown as StoreData["briefs"][number];
    expect(demoFreshness({ ...seed, briefs: [brief] }, "2026-10-11")).toBe("stale");
  });

  it("refreshDemo rebuilds the story for the new day and keeps the viewer's settings", () => {
    const settings = { textSize: "large", theme: "dark", aiModel: "Qwen2.5-3B-Instruct-q4f16_1-MLC", tourCompleted: true } as const;
    const refreshed = refreshDemo({ settings }, "2026-10-13");
    expect(refreshed).toEqual({ ...createSeed("2026-10-13"), settings });
    expect(demoFreshness(refreshed, "2026-10-13")).toBe("current");
    expect(validateStore(refreshed)).toBe(true);
    // The fall is "5 days ago" again.
    expect(refreshed.checkIns.find((c) => c.answers.fall === true)?.date).toBe(addDays("2026-10-13", off("fall")));
  });
});
