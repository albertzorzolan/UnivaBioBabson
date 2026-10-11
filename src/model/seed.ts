// Fictional demo record: Margaret Rivera, 78, and her daughter Alex (docs/SPEC.md §2).
//
// How this file is built (worth reading before changing any numbers):
//  - Everything is a day offset from `today`, so the demo always looks current and the clinical story
//    (lorazepam started 16 days ago, a fall 5 days ago, ...) is identical whatever date it is opened on.
//  - The diary is a hand-written grid (one row per day) instead of random draws. The patterns the engines
//    must find are therefore guaranteed by construction and can be read straight off the grid; seed.test.ts
//    asserts every one of them using answered-day denominators, and runs the real timeline engine on it.
//  - Margaret's stories are attached to specific days and agree with that day's answers. Phrases that
//    support an answer become provenance spans whose offsets are computed from the text, so
//    `story.slice(start, end) === quote` always holds (validateStore checks it).
//  - The only randomness is cosmetic (the minute each entry was saved), drawn from a mulberry32 PRNG keyed
//    by a constant and the day offset. Same `today` => identical record. Timestamps are local wall-clock
//    times serialised with toISOString(), so their UTC text depends on the host time zone, nothing else does.
//
// What the timeline engine shows for lorazepam (started today-16; "before" = today-37..-17, "after" =
// today-16..today; answered days only). seed.test.ts pins every line of this table:
//
//    Dizziness            9 of 14 answered days  vs  2 of 19   Fisher p ≈ 0.002   strong   <- listed first
//    Daytime drowsiness   8 of 14                vs  2 of 20   Fisher p ≈ 0.006   strong
//    Energy (mean 1–5)    2.6                    vs  3.5       diff −0.86         moderate
//    Sleep  (mean 1–5)    3.4                    vs  2.6       diff +0.83         moderate (better)
//    Confusion            4 of 14                vs  0 of 20   Fisher p ≈ 0.02    moderate
//    Poor appetite        3 of 13                vs  0 of 20   Fisher p ≈ 0.05    weak
//    2 near-falls and 1 fall after the start (1 near-fall before): too few to test as rates; shown as counts.
//
// The numbers are tuned so the demo cannot change under the presenter: whatever single check-in is saved
// live today, dizziness and drowsiness stay "strong", energy and sleep stay "moderate" (clear of the 0.6 and
// 1.0 thresholds), confusion stays at least "moderate", and dizziness stays the first signal unless that
// check-in itself records drowsiness without dizziness (seed.test.ts sweeps every combination of answers).
// That is why dizziness is recorded on 64% (9 of 14) of answered days after the start rather than the 55–60%
// SPEC §2 suggests: with 8 of 14 vs 2 of 19, p = 0.007, and 0.0098 after one more answered "no" day. That is a
// hair from the 0.01 "strong" bar and above drowsiness's p, so dizziness would no longer lead. The one
// unanswered dizziness question before the start (today-28) is deliberate: it is why the sentence says
// "2 of 19 answered days" for a window with 20 check-ins.
//
// Notes for the modules that consume this record:
//  - Provenance spans of different fields may nest or overlap ("quite dizzy" for dizzinessSeverity contains
//    "dizzy" for dizziness; see today-14 and today-5). Highlighters must merge ranges before slicing a story.
//  - A medNote is linked to a medicine only when its words identify exactly one listed medicine: a name or
//    brand ("Tylenol PM"), or a lay term that fits only one of them ("water pill" = the only diuretic). Remarks
//    such as "a new pill to take at bedtime" stay unlinked (medicationId: null): exactly the kind of
//    "medicine not on the list yet" remark a caregiver needs to see.
//  - A saved demo record keeps its dates. When the app is opened on a later day the story drifts (the fall is
//    no longer "5 days ago"); `demoFreshness` tells storage code whether to rebuild it (see below).
//
// All people, places and events are fictional. Health-language rules (SPEC §3) apply to every string here.

import type {
  CheckIn,
  ConceptId,
  DiaryAnswers,
  DiaryField,
  FieldProvenance,
  ISODate,
  ISODateTime,
  MedEvent,
  Medication,
  Note,
  PatientProfile,
  Span,
  StoreData,
} from "./types";
import { addDays, isValidDate, parseDate } from "./dates";

// ---------------------------------------------------------------------------
// Key moments of the story, as offsets from `today` (negative = days ago).

const O = {
  /** Alex sets Kinwise up and enters the medication list. */
  recordStarted: -61,
  firstCheckIn: -60,
  lastCheckIn: -1,
  metforminStart: -900,
  atorvastatinStart: -900,
  omeprazoleStart: -400,
  oxybutyninStart: -210,
  tylenolPmStart: -180,
  amlodipineStart: -140,
  /** 45 days after amlodipine, for "ankle swelling": the amlodipine -> furosemide prescribing cascade. */
  furosemideStart: -95,
  /** Ankle swelling is recorded on ~40% of answered days in this window, less afterwards. */
  earlySwellingStart: -60,
  earlySwellingEnd: -40,
  forgotWaterPill: -44,
  /** Timeline "before" window for lorazepam (SPEC §6.3: up to 21 days before the start). */
  beforeWindowStart: -37,
  beforeWindowEnd: -17,
  sofiaBikeStory: -31,
  catTripNearFall: -30,
  /** The one check-in in the "before" window whose dizziness question was left blank (20 check-ins, 19 answered). */
  dizzinessUnanswered: -28,
  /** Urgent care visit; first dose that night. */
  lorazepamStart: -16,
  lorazepamAddedToList: -15,
  /**
   * Timeline "after" window for lorazepam: the start day through today (the engine's window is
   * [start, min(start + 20, today)]). Today has no seeded check-in, so a live check-in lands inside it.
   */
  afterWindowStart: -16,
  afterWindowEnd: 0,
  nearFallKitchen: -14,
  /** The near-fall Alex's pinned note refers to (a Tuesday when today is 2026-10-10). */
  nearFallBathroom: -11,
  pinnedConcern: -7,
  fall: -5,
  /** Check-in saved in the morning, then corrected in the evening (audit trail demo). */
  correctedCheckIn: -3,
} as const;

/** Name of a documented moment in the story (a key of DEMO_TODAY_OFFSETS). */
export type DemoOffsetKey = keyof typeof O;

/**
 * Documented offsets used by the seed, e.g. `addDays(today, DEMO_TODAY_OFFSETS.lorazepamStart)`.
 * Typed with its exact keys (a misspelt key is a compile error, not a "NaN-NaN-NaN" date) and frozen: it is a
 * copy, so nothing a consumer does to it can change what createSeed builds.
 * Still assignable to SPEC §10's `Record<string, number>`.
 */
export const DEMO_TODAY_OFFSETS: { readonly [K in DemoOffsetKey]: number } = Object.freeze({ ...O });

// ---------------------------------------------------------------------------
// Margaret's diary, one row per day from today-60 to today-1. Today is left empty for the live demo.
//
//   E, S  energy / sleep 1–5            A   appetite: = same, + better, - worse
//   Dz    dizziness: 0 no, 1–3 yes with severity (mild/moderate/severe), y yes (severity unanswered)
//   Dr Cf Fl NF Sw   drowsiness, confusion, fall, near-fall, ankle swelling: 0 no, 1 yes
//   .     question left unanswered (null — never counted as "no")      --   no check-in that day
//   *     a story in Margaret's own words is attached (see STORIES below)

const DIARY_GRID = `
day  E S A  Dz Dr Cf Fl NF Sw
# ── Early weeks: residual ankle swelling (amlodipine started -140, furosemide -95) ──
-60  4 3 =  0  0  0  0  0  1   * first entry, weeding, puffy ankles
-59  3 2 =  0  0  0  0  0  0
-58  4 3 =  0  0  0  0  0  1
-57  3 2 =  y  0  0  0  0  0     dizzy, severity not answered
-56  3 1 =  0  0  0  0  0  0   * Biscuit at five, dry mouth
-55  --
-54  3 3 =  0  0  0  0  0  1
-53  3 3 =  0  1  0  0  0  0
-52  --                          hair appointment and lunch out, forgot to check in
-51  3 3 =  0  0  0  0  0  1
-50  --                          two days at her sister Rosa's
-49  --
-48  4 3 +  0  0  0  0  0  0   * home from Rosa's
-47  3 2 =  0  0  0  0  0  1
-46  4 3 =  1  0  0  0  0  0
-45  3 . =  0  0  0  0  0  0     sleep not answered
-44  3 2 =  0  0  0  0  0  1   * forgot the water pill
-43  4 3 =  0  0  0  0  0  0
-42  --
-41  3 2 =  0  0  0  0  0  1
-40  4 3 =  0  0  0  0  0  0   * church potluck
-39  --
-38  4 2 =  0  0  0  0  0  1
# ── Before lorazepam (-37 … -17): occasional mild dizziness, poor sleep (insomnia), two drowsy days ──
-37  4 3 =  0  0  0  0  0  0
-36  3 1 =  0  0  0  0  0  0
-35  3 3 =  1  0  0  0  0  0   * lightheaded after weeding
-34  4 3 =  0  0  0  0  0  0
-33  4 2 =  0  0  0  0  0  0     making up the spare bed for Sofia
-32  5 3 +  0  0  0  0  0  0     Sofia arrives
-31  4 3 =  0  0  0  0  0  0   * Sofia fell off her bike
-30  3 2 =  0  0  0  0  1  0   * tripped over Biscuit
-29  3 3 =  0  0  0  0  0  1
-28  4 2 =  .  0  0  0  0  0     dizziness not answered
-27  --                          a night at Alex's
-26  3 2 =  0  1  0  0  0  0   * nodding off after a night in a strange bed
-25  3 2 =  0  0  0  0  0  0
-24  4 3 =  0  0  0  0  0  .     swelling not answered
-23  3 3 =  0  0  0  0  0  0
-22  3 2 =  1  0  0  0  0  0
-21  4 3 =  0  0  0  0  0  1
-20  3 3 =  0  1  0  0  0  0   * Tylenol PM, groggy
-19  4 4 =  0  0  0  0  0  0
-18  3 2 =  0  0  0  0  0  0
-17  3 3 =  0  0  0  0  0  0
# ── After lorazepam 0.5 mg at bedtime (-16 … today, which is left for the live check-in): more dizziness,
#    drowsiness and fog; 2 near-falls, 1 fall ──
-16  3 2 =  0  0  0  0  0  0   * urgent care visit, first dose tonight
-15  3 4 =  1  1  0  0  0  0   * slept better, groggy, a little woozy
-14  2 3 =  2  1  1  0  1  0   * foggy; nearly went over in the kitchen
-13  3 4 =  0  0  0  0  0  0
-12  --
-11  2 3 -  2  0  0  0  1  0   * room spinning in the bathroom at night
-10  3 5 =  0  1  0  0  0  0   * slept like a log, eyes closing
 -9  3 3 .  1  1  1  0  0  0     appetite not answered
 -8  --
 -7  4 3 =  0  0  0  0  0  0
 -6  2 4 =  1  1  1  0  0  0   * bridge club, mixed up
 -5  1 3 -  3  1  0  1  0  0   * the fall
 -4  2 3 -  1  1  0  0  0  0
 -3  2 3 =  2  1  0  0  0  1   * corrected entry (revision 2)
 -2  3 4 =  1  0  1  0  0  0
 -1  4 4 =  0  0  0  0  0  0   * quiet day
`;

/** The morning version of the corrected check-in (kept in checkInHistory as revision 1). */
const CORRECTION = {
  offset: O.correctedCheckIn,
  originalRow: "3 3 =  0  0  0  0  0  0",
  originalStory: "Feeling fine this morning.",
};

// ---------------------------------------------------------------------------
// Stories in Margaret's voice. `evidence` lists the phrases that support that day's recorded answers.

interface Evidence {
  quotes: string[];
  certainty: "explicit" | "inferred";
}

interface StoryBeat {
  offset: number;
  text: string;
  evidence?: Partial<Record<DiaryField, Evidence>>;
  other?: { conceptId: ConceptId; present: boolean; quote: string }[];
  /** Medication remarks. Linked to a medicine only when the words identify exactly one listed medicine. */
  medNotes?: { medicationId: string | null; quote: string }[];
}

/** Stated outright ("dizzy", "no falls"). */
const said = (...quotes: string[]): Evidence => ({ quotes, certainty: "explicit" });
/** Mapped from everyday wording ("slept like a log" -> sleep 5). */
const meant = (...quotes: string[]): Evidence => ({ quotes, certainty: "inferred" });

const STORIES: StoryBeat[] = [
  {
    offset: -60,
    text: "First go at this diary — Alex set it up for me. Spent the morning weeding the rose bed and my ankles were puffy by supper.",
    evidence: { swelling: said("ankles were puffy") },
  },
  {
    offset: -56,
    text: "Biscuit had me up at five o'clock demanding his breakfast, so I hardly slept. Mouth dry as a bone again.",
    evidence: { sleep: meant("hardly slept") },
    other: [{ conceptId: "dry_mouth", present: true, quote: "Mouth dry as a bone" }],
  },
  {
    offset: -48,
    text: "Home again after two days at my sister Rosa's. Ate well and had a good long chat with the neighbors over the fence.",
    evidence: { appetite: meant("Ate well") },
  },
  {
    offset: O.forgotWaterPill,
    text: "Forgot my water pill this morning and my ankles are puffy again tonight.",
    evidence: { swelling: said("ankles are puffy") },
    medNotes: [{ medicationId: "med-furosemide", quote: "Forgot my water pill" }],
  },
  {
    offset: -40,
    text: "Church potluck supper tonight. I brought my lemon bars and they were gone in ten minutes! I'd give my energy a 4 out of 5.",
    evidence: { energy: said("energy a 4 out of 5") },
  },
  {
    offset: -35,
    text: "A little lightheaded when I stood up too fast after weeding, but it passed. No swelling in my ankles today.",
    evidence: {
      dizziness: said("lightheaded"),
      dizzinessSeverity: meant("A little lightheaded"),
      swelling: said("No swelling in my ankles"),
    },
  },
  {
    // Someone else's fall (experiencer = other) next to a negated symptom of Margaret's own.
    offset: O.sofiaBikeStory,
    text: "My granddaughter Sofia is staying for a few days. This afternoon Sofia fell off her bike in the driveway and scraped both knees, poor lamb. I'm fine — no dizziness today.",
    evidence: { dizziness: said("no dizziness today") },
  },
  {
    offset: O.catTripNearFall,
    text: "Tripped over Biscuit in the hall this morning but caught myself on the door frame. That cat is always underfoot.",
    evidence: { nearFall: meant("caught myself on the door frame") },
  },
  {
    offset: -26,
    text: "Home again after a night at Alex's. I never sleep well in a strange bed, and I kept nodding off in my chair this afternoon.",
    evidence: {
      sleep: meant("never sleep well in a strange bed"),
      drowsiness: said("nodding off in my chair"),
    },
  },
  {
    offset: -20,
    text: "My knees were aching so I took a Tylenol PM last night. Groggy until ten, and my mouth felt like sandpaper.",
    evidence: { drowsiness: said("Groggy until ten") },
    other: [
      { conceptId: "pain", present: true, quote: "knees were aching" },
      { conceptId: "dry_mouth", present: true, quote: "my mouth felt like sandpaper" },
    ],
    medNotes: [{ medicationId: "med-tylenolpm", quote: "took a Tylenol PM last night" }],
  },
  {
    offset: O.lorazepamStart,
    text: "Slept badly again, so I went to the urgent care clinic this afternoon about my nerves and the not sleeping. They gave me a new pill to take at bedtime.",
    evidence: { sleep: meant("Slept badly") },
    other: [{ conceptId: "anxiety", present: true, quote: "my nerves" }],
    // Not linked: lorazepam is not on the list until tomorrow, and "a new pill" names no medicine.
    medNotes: [{ medicationId: null, quote: "a new pill to take at bedtime" }],
  },
  {
    offset: -15,
    text: "Took the new pill last night and slept much better, but I was groggy until lunch and a little woozy on the stairs.",
    evidence: {
      sleep: meant("slept much better"),
      drowsiness: said("groggy until lunch"),
      dizziness: said("woozy"),
      dizzinessSeverity: meant("a little woozy"),
    },
    // Not linked: "the new pill" names no medicine (Alex adds lorazepam to the list later that evening).
    medNotes: [{ medicationId: null, quote: "Took the new pill last night" }],
  },
  {
    offset: O.nearFallKitchen,
    text: "Foggy all morning — couldn't remember if I'd fed Biscuit. Turned around too fast at the sink, felt quite dizzy and nearly went over in the kitchen. Caught myself on the counter.",
    evidence: {
      confusion: said("Foggy all morning"),
      dizziness: said("dizzy"),
      dizzinessSeverity: meant("quite dizzy"),
      nearFall: meant("nearly went over in the kitchen", "Caught myself on the counter"),
    },
  },
  {
    offset: O.nearFallBathroom,
    text: "Got up in the night for the bathroom and the room was spinning. Had to grab the towel rail or I'd have gone down. Didn't feel like eating today.",
    evidence: {
      dizziness: said("the room was spinning"),
      nearFall: meant("Had to grab the towel rail or I'd have gone down"),
      appetite: meant("Didn't feel like eating"),
    },
  },
  {
    offset: -10,
    text: "Slept like a log, but I could hardly keep my eyes open after lunch. Dozed right through my programs.",
    evidence: {
      sleep: meant("Slept like a log"),
      drowsiness: said("could hardly keep my eyes open", "Dozed right through my programs"),
    },
  },
  {
    offset: -6,
    text: "Bridge club at Dottie's, but I kept losing track of the bidding. Mixed up and sleepy all afternoon — not like me at all.",
    evidence: {
      confusion: said("kept losing track of the bidding", "Mixed up"),
      drowsiness: said("sleepy all afternoon"),
    },
  },
  {
    offset: O.fall,
    text: "Took a tumble this evening. I was very dizzy getting up and landed on my bottom in the bathroom. Nothing broken, just sore and shaken. Alex is coming over tomorrow.",
    evidence: {
      fall: said("Took a tumble", "landed on my bottom in the bathroom"),
      dizziness: said("dizzy"),
      dizzinessSeverity: meant("very dizzy"),
    },
    other: [{ conceptId: "pain", present: true, quote: "sore" }],
  },
  {
    offset: O.correctedCheckIn,
    text: "Felt fine first thing, but after lunch I got quite woozy and dozed off in my chair. Ankles a bit puffy tonight too.",
    evidence: {
      dizziness: said("woozy"),
      dizzinessSeverity: meant("quite woozy"),
      drowsiness: said("dozed off in my chair"),
      swelling: said("Ankles a bit puffy"),
    },
  },
  {
    offset: -1,
    text: "Quiet day. Did the crossword with my coffee and sat out in the garden with Biscuit. No dizziness today and no falls, thank goodness.",
    evidence: { dizziness: said("No dizziness today"), fall: said("no falls") },
  },
];

// ---------------------------------------------------------------------------
// Medication list (SPEC §2 table). Ids are stable; ingredient ids are KB generic ids.

interface MedSeed {
  id: string;
  name: string;
  ingredientIds: string[];
  match: Medication["match"];
  dose: string;
  frequency: string;
  asNeeded: boolean;
  otc: boolean;
  reason: string;
  prescriber: string;
  startOffset: number;
  addedOffset: number;
  startedDetail: string;
}

const LEE = "Dr. Lee (primary care)";

const MEDS: MedSeed[] = [
  {
    id: "med-amlodipine",
    name: "Amlodipine",
    ingredientIds: ["amlodipine"],
    match: "exact",
    dose: "10 mg",
    frequency: "once daily",
    asNeeded: false,
    otc: false,
    reason: "Blood pressure",
    prescriber: "Dr. Okafor (cardiology)",
    startOffset: O.amlodipineStart,
    addedOffset: O.recordStarted,
    startedDetail: "Started by Dr. Okafor (cardiology) for blood pressure.",
  },
  {
    id: "med-furosemide",
    name: "Furosemide (Lasix)",
    ingredientIds: ["furosemide"],
    match: "exact",
    dose: "20 mg",
    frequency: "once daily",
    asNeeded: false,
    otc: false,
    reason: "Ankle swelling",
    prescriber: LEE,
    startOffset: O.furosemideStart,
    addedOffset: O.recordStarted,
    startedDetail: "Started by Dr. Lee (primary care) for ankle swelling.",
  },
  {
    id: "med-metformin",
    name: "Metformin",
    ingredientIds: ["metformin"],
    match: "exact",
    dose: "500 mg",
    frequency: "twice daily",
    asNeeded: false,
    otc: false,
    reason: "Diabetes",
    prescriber: LEE,
    startOffset: O.metforminStart,
    addedOffset: O.recordStarted,
    startedDetail: "Started by Dr. Lee (primary care) for diabetes.",
  },
  {
    id: "med-atorvastatin",
    name: "Atorvastatin",
    ingredientIds: ["atorvastatin"],
    match: "exact",
    dose: "20 mg",
    frequency: "nightly",
    asNeeded: false,
    otc: false,
    reason: "Cholesterol",
    prescriber: LEE,
    startOffset: O.atorvastatinStart,
    addedOffset: O.recordStarted,
    startedDetail: "Started by Dr. Lee (primary care) for cholesterol.",
  },
  {
    id: "med-omeprazole",
    name: "Omeprazole",
    ingredientIds: ["omeprazole"],
    match: "exact",
    dose: "20 mg",
    frequency: "once daily",
    asNeeded: false,
    otc: false,
    reason: "Heartburn",
    prescriber: LEE,
    startOffset: O.omeprazoleStart,
    addedOffset: O.recordStarted,
    startedDetail: "Started by Dr. Lee (primary care) for heartburn.",
  },
  {
    id: "med-oxybutynin",
    name: "Oxybutynin",
    ingredientIds: ["oxybutynin"],
    match: "exact",
    dose: "5 mg",
    frequency: "twice daily",
    asNeeded: false,
    otc: false,
    reason: "Bladder",
    prescriber: "Dr. Shah (urology)",
    startOffset: O.oxybutyninStart,
    addedOffset: O.recordStarted,
    startedDetail: "Started by Dr. Shah (urology) for bladder control.",
  },
  {
    id: "med-tylenolpm",
    name: "Tylenol PM (OTC)",
    ingredientIds: ["acetaminophen", "diphenhydramine"],
    match: "combo",
    dose: "2 caplets",
    frequency: "at bedtime as needed",
    asNeeded: true,
    otc: true,
    reason: "Sleep",
    prescriber: "Self (OTC)",
    startOffset: O.tylenolPmStart,
    addedOffset: O.recordStarted,
    startedDetail: "Started taking over the counter for sleep.",
  },
  {
    id: "med-lorazepam",
    name: "Lorazepam (Ativan)",
    ingredientIds: ["lorazepam"],
    match: "exact",
    dose: "0.5 mg",
    frequency: "at bedtime",
    asNeeded: false,
    otc: false,
    reason: "Anxiety / sleep",
    prescriber: "Urgent care",
    startOffset: O.lorazepamStart,
    addedOffset: O.lorazepamAddedToList,
    startedDetail: "Started by urgent care for anxiety and sleep.",
  },
];

// ---------------------------------------------------------------------------
// Notes. The pinned concern is the SPEC §2 text; its weekday is computed from the bathroom near-fall date.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface NoteSeed {
  id: string;
  offset: number;
  author: Note["author"];
  pinned: boolean;
  text: (today: ISODate) => string;
}

const NOTES: NoteSeed[] = [
  {
    id: "note-cg-ankles",
    offset: -24,
    author: "caregiver",
    pinned: false,
    text: () => "Mom sounded bright on the phone tonight. Her ankle swelling seems less than it was a month or two ago.",
  },
  {
    id: "note-pt-dry-mouth",
    offset: -19,
    author: "patient",
    pinned: false,
    text: () => "Ask about my bladder pills — dry mouth bothers me",
  },
  {
    id: "note-cg-new-med",
    offset: O.lorazepamAddedToList,
    author: "caregiver",
    pinned: false,
    text: () =>
      "Urgent care gave Mom lorazepam (Ativan) 0.5 mg at bedtime yesterday, for sleep and nerves. Added it to her list. Dr. Lee doesn't know about it yet.",
  },
  {
    id: "note-cg-concern",
    offset: O.pinnedConcern,
    author: "caregiver",
    pinned: true,
    text: (today) => {
      const weekday = WEEKDAYS[parseDate(addDays(today, O.nearFallBathroom)).getDay()];
      return `Mom seems foggier in the mornings since urgent care started the new sleeping pill. She almost fell in the bathroom on ${weekday}.`;
    },
  },
  {
    id: "note-cg-after-fall",
    offset: O.fall + 1,
    author: "caregiver",
    pinned: false,
    text: () =>
      "Went over after Mom's fall in the bathroom last night. She landed on her bottom and is bruised, but moving around okay. Put down a non-slip mat and a night-light.",
  },
];

// ---------------------------------------------------------------------------
// Deterministic helpers

/** mulberry32: tiny, well-distributed 32-bit PRNG. Never Math.random in seed data. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRNG_KEY = 0x4d415247; // "MARG"

/** Minute of the day in [from, to], stable for a given (offset, purpose) whatever `today` is. */
function minuteFor(offset: number, purpose: number, from: number, to: number): number {
  const rand = mulberry32(PRNG_KEY ^ Math.imul(offset + 10_000, 0x9e3779b1) ^ Math.imul(purpose, 0x85ebca6b));
  return from + Math.floor(rand() * (to - from + 1));
}

const hm = (h: number, m = 0) => h * 60 + m;

/** Local wall-clock time on `date` (between 08:00 and 23:00, so never inside a DST gap) as an ISO timestamp. */
function localTimestamp(date: ISODate, minuteOfDay: number): ISODateTime {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0).toISOString();
}

function spanOf(story: string, quote: string): Span {
  const start = story.indexOf(quote);
  if (start < 0) throw new Error(`Seed story is missing the quoted phrase "${quote}"`);
  return { start, end: start + quote.length, quote };
}

// ---------------------------------------------------------------------------
// Grid parsing (strict: any typo in the grid fails loudly in tests)

function parseScale(tok: string): DiaryAnswers["energy"] {
  if (tok === ".") return null;
  if (/^[1-5]$/.test(tok)) return Number(tok) as 1 | 2 | 3 | 4 | 5;
  throw new Error(`Bad 1–5 rating "${tok}" in seed grid`);
}

function parseBool(tok: string): boolean | null {
  if (tok === ".") return null;
  if (tok === "0" || tok === "1") return tok === "1";
  throw new Error(`Bad yes/no value "${tok}" in seed grid`);
}

function parseAppetite(tok: string): DiaryAnswers["appetite"] {
  const map: Record<string, DiaryAnswers["appetite"]> = { "=": "same", "+": "better", "-": "worse", ".": null };
  if (tok in map) return map[tok];
  throw new Error(`Bad appetite value "${tok}" in seed grid`);
}

function parseDizziness(tok: string): Pick<DiaryAnswers, "dizziness" | "dizzinessSeverity"> {
  if (tok === ".") return { dizziness: null, dizzinessSeverity: null };
  if (tok === "0") return { dizziness: false, dizzinessSeverity: null };
  if (tok === "y") return { dizziness: true, dizzinessSeverity: null };
  if (/^[1-3]$/.test(tok)) return { dizziness: true, dizzinessSeverity: Number(tok) as 1 | 2 | 3 };
  throw new Error(`Bad dizziness value "${tok}" in seed grid`);
}

/** Parses "E S A Dz Dr Cf Fl NF Sw" tokens into answers. */
function parseRow(cells: string[]): DiaryAnswers {
  if (cells.length !== 9) throw new Error(`Seed grid row needs 9 values, got ${cells.length}: ${cells.join(" ")}`);
  const [e, s, a, dz, dr, cf, fl, nf, sw] = cells;
  return {
    energy: parseScale(e),
    sleep: parseScale(s),
    appetite: parseAppetite(a),
    ...parseDizziness(dz),
    drowsiness: parseBool(dr),
    confusion: parseBool(cf),
    fall: parseBool(fl),
    nearFall: parseBool(nf),
    swelling: parseBool(sw),
  };
}

/**
 * offset -> answers (null = no check-in that day). Every day firstCheckIn..lastCheckIn must appear exactly once,
 * and the "*" markers must match the days that have a story, so the grid can be trusted when read on its own.
 */
function parseGrid(grid: string, storyOffsets: number[]): Map<number, DiaryAnswers | null> {
  const days = new Map<number, DiaryAnswers | null>();
  const starred: number[] = [];
  for (const raw of grid.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("day")) continue;
    // Columns are offset + 9 values; anything after them is a human comment.
    const tokens = line.split(/\s+/);
    const offset = Number(tokens[0]);
    if (!Number.isInteger(offset)) throw new Error(`Bad day offset in seed grid: "${line}"`);
    if (days.has(offset)) throw new Error(`Day ${offset} appears twice in the seed grid`);
    days.set(offset, tokens[1] === "--" ? null : parseRow(tokens.slice(1, 10)));
    if (tokens[10] === "*") starred.push(offset);
  }
  for (let o: number = O.firstCheckIn; o <= O.lastCheckIn; o++)
    if (!days.has(o)) throw new Error(`Day ${o} is missing from the seed grid`);
  if (days.size !== O.lastCheckIn - O.firstCheckIn + 1) throw new Error("Seed grid has days outside the diary range");
  const stories = [...storyOffsets].sort((a, b) => a - b).join(",");
  if (starred.sort((a, b) => a - b).join(",") !== stories)
    throw new Error("Seed grid '*' markers do not match the days that have stories");
  for (const o of storyOffsets) if (!days.get(o)) throw new Error(`Story attached to day ${o}, which has no check-in`);
  return days;
}

const STORY_BY_OFFSET = new Map(STORIES.map((s) => [s.offset, s]));
if (STORY_BY_OFFSET.size !== STORIES.length) throw new Error("Two seed stories share a day");
const DIARY = parseGrid(DIARY_GRID, STORIES.map((s) => s.offset));

// ---------------------------------------------------------------------------
// Builders

function buildCheckIn(
  date: ISODate,
  answers: DiaryAnswers,
  beat: StoryBeat | undefined,
  confirmedAt: ISODateTime,
  revision: number,
): CheckIn {
  const story = beat?.text ?? "";
  const provenance: Partial<Record<DiaryField, FieldProvenance>> = {};
  for (const [field, ev] of Object.entries(beat?.evidence ?? {}) as [DiaryField, Evidence][]) {
    if (answers[field] === null) throw new Error(`Story on ${date} supports "${field}" but that answer is empty`);
    const spans = ev.quotes.map((q) => spanOf(story, q)).sort((x, y) => x.start - y.start);
    provenance[field] = { origin: "seed", certainty: ev.certainty, spans };
  }
  return {
    id: `chk-${date}`,
    date,
    answers,
    otherSymptoms: (beat?.other ?? []).map((o) => ({ conceptId: o.conceptId, present: o.present, span: spanOf(story, o.quote) })),
    story,
    provenance,
    medNotes: (beat?.medNotes ?? []).map((m) => ({ medicationId: m.medicationId, text: m.quote, span: spanOf(story, m.quote) })),
    confirmedAt,
    revision,
  };
}

function buildDiary(today: ISODate): { checkIns: CheckIn[]; checkInHistory: CheckIn[] } {
  const checkIns: CheckIn[] = [];
  const checkInHistory: CheckIn[] = [];
  for (const [offset, answers] of [...DIARY.entries()].sort((a, b) => a[0] - b[0])) {
    if (!answers) continue; // a day off from the diary — no streaks, no nagging
    const beat = STORY_BY_OFFSET.get(offset);
    const date = addDays(today, offset);
    const evening = localTimestamp(date, minuteFor(offset, 1, hm(18, 30), hm(21, 30)));
    if (offset === CORRECTION.offset) {
      // Saved in the morning, corrected in the evening: revision 1 goes to history, revision 2 is live.
      const morning = localTimestamp(date, minuteFor(offset, 2, hm(8, 30), hm(9, 45)));
      const original = parseRow(CORRECTION.originalRow.split(/\s+/));
      checkInHistory.push(buildCheckIn(date, original, { offset, text: CORRECTION.originalStory }, morning, 1));
      checkIns.push(buildCheckIn(date, answers, beat, evening, 2));
    } else {
      checkIns.push(buildCheckIn(date, answers, beat, evening, 1));
    }
  }
  return { checkIns, checkInHistory };
}

function buildMedications(today: ISODate): { medications: Medication[]; medEvents: MedEvent[] } {
  const medications: Medication[] = [];
  const medEvents: MedEvent[] = [];
  // Alex enters the long-standing list in one sitting; lorazepam is added the day after urgent care.
  const setupMinute = minuteFor(O.recordStarted, 3, hm(19, 0), hm(19, 30));
  MEDS.forEach((m, i) => {
    const addedDate = addDays(today, m.addedOffset);
    const minute = m.addedOffset === O.recordStarted ? setupMinute + i : minuteFor(m.addedOffset, 4, hm(19, 0), hm(20, 0));
    const recordedAt = localTimestamp(addedDate, minute);
    const startDate = addDays(today, m.startOffset);
    medications.push({
      id: m.id,
      name: m.name,
      ingredientIds: [...m.ingredientIds],
      match: m.match,
      dose: m.dose,
      frequency: m.frequency,
      asNeeded: m.asNeeded,
      otc: m.otc,
      reason: m.reason,
      prescriber: m.prescriber,
      startDate,
      endDate: null,
      createdAt: recordedAt,
      updatedAt: recordedAt,
    });
    const key = m.id.replace(/^med-/, "");
    medEvents.push(
      { id: `evt-${key}-started`, medicationId: m.id, date: startDate, kind: "started", detail: m.startedDetail, createdAt: recordedAt },
      {
        id: `evt-${key}-added`,
        medicationId: m.id,
        date: addedDate,
        kind: "added_to_list",
        detail: "Added to Kinwise by Alex.",
        createdAt: recordedAt,
      },
    );
  });
  medEvents.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
  return { medications, medEvents };
}

function buildNotes(today: ISODate): Note[] {
  return NOTES.map((n) => {
    const date = addDays(today, n.offset);
    return {
      id: n.id,
      date,
      author: n.author,
      text: n.text(today),
      pinned: n.pinned,
      createdAt: localTimestamp(date, minuteFor(n.offset, 5, hm(20, 15), hm(22, 0))),
    };
  });
}

const PROFILE: PatientProfile = {
  displayName: "Margaret Rivera",
  preferredName: "Margaret",
  age: 78,
  sex: "female",
  conditions: ["hypertension", "type2_diabetes", "urinary_incontinence", "insomnia", "osteoarthritis"],
  crclMlMin: null,
  caregiverName: "Alex",
  caregiverRelation: "daughter",
};

/** Prefix of the demo record's dataset id; the rest is the `today` it was built for (see demoDatasetId). */
const DATASET_PREFIX = "demo-margaret-";

// ---------------------------------------------------------------------------

/**
 * Build Margaret's fictional record as it looks on `today` (local calendar date, YYYY-MM-DD).
 * Pure and deterministic: the same `today` always yields the same record. Today itself has no check-in,
 * so the live demo can record one.
 */
export function createSeed(today: ISODate): StoreData {
  if (!isValidDate(today)) throw new RangeError(`createSeed needs a calendar date (YYYY-MM-DD), got "${String(today)}"`);

  const { medications, medEvents } = buildMedications(today);
  const { checkIns, checkInHistory } = buildDiary(today);
  const notes = buildNotes(today);

  const createdAt = localTimestamp(addDays(today, O.recordStarted), minuteFor(O.recordStarted, 3, hm(19, 0), hm(19, 30)));
  const stamps = [
    createdAt,
    ...medications.map((m) => m.updatedAt),
    ...checkIns.map((c) => c.confirmedAt),
    ...notes.map((n) => n.createdAt),
  ];
  const updatedAt = stamps.reduce((a, b) => (b > a ? b : a));

  return {
    schemaVersion: 2,
    datasetId: demoDatasetId(today),
    revision: 1,
    isDemoData: true,
    profile: { ...PROFILE, conditions: [...PROFILE.conditions] },
    medications,
    medEvents,
    checkIns,
    checkInHistory,
    notes,
    reviewDecisions: [],
    briefs: [],
    savedQuestions: [],
    settings: { textSize: "standard", theme: "light", aiModel: "", tourCompleted: false },
    createdAt,
    updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Keeping a saved demo record current
//
// The record is saved with absolute dates. Opened on a later day (a rehearsal the day before, a judge returning
// after the deadline), "the fall 5 days ago" becomes 6, 7, ... days ago, the weekly comparison runs out of
// entries and the lorazepam windows shift. These helpers let storage code notice and rebuild the record; the
// decision of when to do so belongs to loadStore / the Settings screen.

/** Dataset id of the demo record built for `today`. Storage code should call this rather than copy the format. */
export function demoDatasetId(today: ISODate): string {
  return `${DATASET_PREFIX}${today}`;
}

/** The `today` a demo record was built for (read from its dataset id), or null for any other record. */
export function demoSeedDate(data: Pick<StoreData, "datasetId" | "isDemoData">): ISODate | null {
  if (data.isDemoData !== true || typeof data.datasetId !== "string" || !data.datasetId.startsWith(DATASET_PREFIX))
    return null;
  const date = data.datasetId.slice(DATASET_PREFIX.length);
  return isValidDate(date) ? date : null;
}

/**
 * - "current": not demo data, or demo data built for `today`. Use it as it is.
 * - "refresh": demo data built for another day that nobody has changed (revision 1 and no saved brief).
 *              Rebuilding it with `refreshDemo` loses nothing except the out-of-date dates.
 * - "stale":   demo data built for another day that someone has changed (a live check-in, a note, a review
 *              decision, a saved brief). Rebuilding would discard that work, so offer it instead
 *              (e.g. a "Refresh demo dates" banner, or the reset in Settings).
 */
export type DemoFreshness = "current" | "refresh" | "stale";

/** Whether a saved record still tells the demo story on `today` (see DemoFreshness). */
export function demoFreshness(data: Pick<StoreData, "datasetId" | "isDemoData" | "revision" | "briefs">, today: ISODate): DemoFreshness {
  const builtFor = demoSeedDate(data);
  if (builtFor === null || builtFor === today) return "current";
  // Settings changes (theme, text size, tour) never bump the revision, and they are carried over by refreshDemo.
  return data.revision === 1 && data.briefs.length === 0 ? "refresh" : "stale";
}

/** A new demo record for `today` that keeps the viewer's settings (theme, text size, tour progress, AI model). */
export function refreshDemo(previous: Pick<StoreData, "settings">, today: ISODate): StoreData {
  const fresh = createSeed(today);
  return { ...fresh, settings: { ...fresh.settings, ...previous.settings } };
}
