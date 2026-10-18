// Concept lexicon for the on-device clinical NLP engine.
//
// - CONCEPTS: one table with every concept the engine can emit, its diary field (if any) and a
//   descriptive SNOMED CT reference. The engine uses only `label` and `field`; the FHIR export does not
//   read these codes (it has its own table, src/engine/brief/fhir.ts DIARY_CODES / CONCEPT_CODES).
// - TERMS: surface patterns (regular expressions over the normalised, lower-cased view text) with
//   colloquialisms ("woozy", "took a tumble", "slept like a log"), multi-word variants and
//   value mappings for the scale fields. `concept: null` entries are *blockers*: phrases that
//   contain a symptom word but are not a symptom ("fell asleep", "sleeping pill", "fall weather").
//   Overlapping matches are resolved longest-first, so blockers and longer phrases win.
// - Dizziness severity modifiers ("a bit" → 1, "quite" → 2, "very" → 3).
//
// Matching runs on the spelling-corrected view (normalize.ts); misspellings are handled there.

import type { ConceptId, DiaryField, SymptomKey } from "../../model/types";

export type AppetiteValue = "better" | "same" | "worse";
export type ConceptKey = SymptomKey | ConceptId | "energy" | "sleep" | "appetite";

export interface ConceptCoding {
  /** Plain-language label used in reasons and the explanation UI. */
  label: string;
  /** Diary field this concept fills, or null for "other symptom" concepts. */
  field: DiaryField | null;
  /** Descriptive SNOMED CT concept id (null = none confirmed; see `verify`). Not exported. */
  snomed: string | null;
  /** SNOMED CT fully specified name / preferred display. */
  display: string;
  /** Coding decision and how the export handles this concept. */
  verify?: string;
}

/**
 * Concept → coding table. SNOMED CT ids are the well-known international-edition ids for these
 * findings, kept here as a readable reference for each concept. They are not what Kinwise exports:
 * the FHIR export codes diary items and other symptoms from its own table in src/engine/brief/fhir.ts
 * (looked up on tx.fhir.org, SNOMED CT International 2025-02-01), which is the one to change for coding.
 * For scale fields the code describes the *problem* end of the scale (fatigue, poor sleep,
 * loss of appetite) and is only meaningful when the value is at that end.
 */
export const CONCEPTS: Record<ConceptKey, ConceptCoding> = {
  dizziness: { label: "dizziness", field: "dizziness", snomed: "404640003", display: "Dizziness (finding)" },
  drowsiness: { label: "drowsiness", field: "drowsiness", snomed: "271782001", display: "Drowsy (finding)" },
  confusion: { label: "confusion", field: "confusion", snomed: "286933003", display: "Confusional state (disorder)" },
  fall: { label: "a fall", field: "fall", snomed: "1912002", display: "Fall (event)" },
  nearFall: {
    label: "a near-fall", field: "nearFall", snomed: null, display: "Near fall (tripping / loss of balance)",
    verify: "Near fall: no SNOMED CT concept was confirmed when the codes were looked up on tx.fhir.org, so it is exported as text only, by design (fhir.ts DIARY_CODES.nearFall has coding: null).",
  },
  swelling: {
    label: "swelling", field: "swelling", snomed: "271809000", display: "Peripheral edema (finding)",
    verify: "Exported as 267039000 'Swollen ankle region', matching the diary's ankle-swelling question (fhir.ts); 271809000 here is descriptive only.",
  },
  energy: {
    label: "energy", field: "energy", snomed: "84229001", display: "Fatigue (finding)",
    verify: "Applies only to low energy ratings (1–2).",
  },
  sleep: {
    label: "sleep", field: "sleep", snomed: "301345002", display: "Difficulty sleeping (finding)",
    verify: "Applies only to poor sleep ratings (1–2).",
  },
  appetite: {
    label: "appetite", field: "appetite", snomed: "79890006", display: "Loss of appetite (finding)",
    verify: "Applies only to appetite = worse.",
  },
  nausea: { label: "nausea", field: null, snomed: "422587007", display: "Nausea (finding)" },
  constipation: { label: "constipation", field: null, snomed: "14760008", display: "Constipation (finding)" },
  dry_mouth: { label: "dry mouth", field: null, snomed: "87715008", display: "Xerostomia (finding)" },
  headache: { label: "headache", field: null, snomed: "25064002", display: "Headache (finding)" },
  cough: { label: "cough", field: null, snomed: "49727002", display: "Cough (finding)" },
  blurred_vision: { label: "blurred vision", field: null, snomed: "111516008", display: "Blurring of visual image (finding)" },
  urinary_problem: { label: "bladder problems", field: null, snomed: "165232002", display: "Urinary incontinence (finding)" },
  low_mood: { label: "low mood", field: null, snomed: "366979004", display: "Depressed mood (finding)" },
  anxiety: { label: "anxiety", field: null, snomed: "48694002", display: "Anxiety (finding)" },
  pain: { label: "pain", field: null, snomed: "22253000", display: "Pain (finding)" },
  shortness_of_breath: { label: "shortness of breath", field: null, snomed: "267036007", display: "Dyspnea (finding)" },
  tremor: { label: "shakiness / tremor", field: null, snomed: "26079004", display: "Tremor (finding)" },
  rash: { label: "rash", field: null, snomed: "271807003", display: "Eruption of skin (disorder)" },
  diarrhea: { label: "diarrhea", field: null, snomed: "62315008", display: "Diarrhea (finding)" },
  palpitations: { label: "palpitations", field: null, snomed: "80313002", display: "Palpitations (finding)" },
  bleeding_or_bruising: {
    label: "bleeding or bruising", field: null, snomed: "131148009", display: "Bleeding (finding)",
    verify: "Combined concept by design (SPEC §12 monitoring): bleeding and bruising share one code, 131148009 'Bleeding', with the patient's words kept as text.",
  },
  black_stools: {
    label: "black stools", field: null, snomed: "2901004", display: "Melena (disorder)",
    verify: "Patient wording is 'black/tarry stools', so the export uses the finding 35064005 'Dark stools' (fhir.ts), not the diagnosis melena; 2901004 here is descriptive only.",
  },
  shakiness_or_sweating: {
    label: "shakiness or sweating", field: null, snomed: "415690000", display: "Sweating (finding)",
    verify: "Combined concept (possible low blood sugar, SPEC §12); shakiness alone is also coded as tremor 26079004.",
  },
};

export const OTHER_CONCEPT_IDS: readonly ConceptId[] = [
  "nausea", "constipation", "dry_mouth", "headache", "cough", "blurred_vision", "urinary_problem", "low_mood",
  "anxiety", "pain", "shortness_of_breath", "tremor", "rash", "diarrhea", "palpitations", "bleeding_or_bruising",
  "black_stools", "shakiness_or_sweating",
];

export function isConceptId(k: string): k is ConceptId {
  return (OTHER_CONCEPT_IDS as readonly string[]).includes(k);
}

// ---------------------------------------------------------------------------
// Term definitions

export interface TermDef {
  /** Concept, or null for a blocker phrase that must not produce a mention. */
  concept: ConceptKey | null;
  /** Regex source over the normalised lower-case view; {MACROS} are expanded at compile time. */
  pattern: string;
  /** Scale value (energy/sleep 1–5) or appetite category carried by this wording. */
  value?: number | AppetiteValue;
  /** nearFall cues that are usually just the start of a fall ("tripped", "lost my balance"). */
  role?: "precursor";
  /** Describes a change ("swelling has gone down"), not whether the symptom is present today. */
  changeOnly?: boolean;
  /** The wording names the field itself ("energy was good", "my appetite is poor"). */
  anchored?: boolean;
  /** The wording states the category outright ("appetite was worse") → explicit certainty. */
  explicitValue?: boolean;
  /**
   * Secondary-layer terms may overlap primary terms of another concept (one phrase, two findings:
   * "up three times to pee" = poor sleep AND a bladder problem). Blockers still remove them.
   */
  secondary?: boolean;
  /**
   * Low-confidence wording: the phrase is related to the field but does not name it ("my legs felt wobbly" is not
   * "dizzy"). Value = what was heard, shown in the reason ("unsteadiness"). Such a mention is proposed only as a
   * best guess for the person to check, only when nothing explicit was said about the field, and a denied guess
   * proposes nothing (extract.ts).
   */
  guess?: string;
}

const MACROS: Record<string, string> = {
  INT: "(?:a (?:little |tiny |wee )?bit|a little|a tad|a touch|bit|slightly|very|really|so|quite|pretty|extremely|terribly|awfully|rather|fairly|somewhat|super|too|real|totally|completely|incredibly|horribly|seriously|kind of|kinda|sort of|still|even|also|again|all|more|a lot more|getting|got|feeling)",
  POSS: "(?:my|her|his|both|the|their|our|mum's|mom's|dad's|grandma's|grandpa's|both my|both her|both his|both of my)",
  LIMB: "(?:ankles?|feet|foot|legs?|calf|calves|shins?|toes?|knees?|hands?|fingers?|wrists?|lower legs?)",
  NEARLY: "(?:nearly|almost|very nearly|just about|practically|all but|came close to|close to|nearly did)",
  MEAL: "(?:breakfast|lunch|dinner|supper|tea|teatime|food|meals?|brunch|sandwich|soup|plate)",
  PRO: "(?:my|her|his)",
  SELF: "(?:myself|herself|himself)",
  WAS: "(?:was|were|is|are|has been|have been|had been|'s been|'ve been|been|'s|'re|seems|seemed|looks|looked|look|felt|feels|feel|got|gets|getting|kept|keeps|has|have|had)",
  SURFACE:
    "(?:kitchen counter|counter|counters|worktop|rail|railing|rails|banister|bannister|handrail|hand rail|wall|table|chair|door ?frame|doorframe|doorway|door|sink|furniture|towel rail|grab rail|grab bar|walker|zimmer(?: frame)?|frame|cane|walking stick|stick|bedpost|bed|shelf|arm|husband|daughter|son|trolley|cart|fence|gate|car|post|lamppost|tree|dresser|sideboard|bath|shower rail|radiator|side|edge)",
  STOPSELF:
    "(?:to (?:stop|steady|keep|save|catch|hold) (?:myself|me|herself|himself|her|him)(?: up| upright)?(?: from)?(?: (?:falling|going over|going down|toppling|tipping over|falling over))?|just in time|in time|before (?:i|she|he) (?:fell|went down|went over|hit the floor))",
  SLEPTWORD:
    "(?:(?:slept|sleeping|sleep)(?:'s| has)?(?: (?:about |around |only |just |maybe |roughly |barely |nearly |almost |under |less than )?(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?: and a half)? (?:hours?|hrs?)(?: or so)?,?)?|night's sleep|nights sleep|night of sleep)",
  NIGHT: "(?:night(?:'s sleep|s sleep| of sleep)?|sleep)",
  ENERGY: "(?:energy(?: levels?| level)?(?:'s| has)?|get[ -]up[ -]and[ -]go|pep|oomph|stamina|vitality)",
  APP: "(?:appetite(?:'s| has)?)",
  WASNT: "(?:wasn't|was not|isn't|is not|weren't|were not|hasn't been|has not been)",
  // Between a field anchor and its value: punctuation ("Sleep: ok", "Energy - low") or a space with an
  // optional time phrase ("sleep last night was ok", "energy today is low").
  PUNC: "(?: ?[?:!-]+ ?| (?:(?:last night|overnight|today|this morning|this afternoon|this evening|tonight|so far(?: today)?|lately|these days|again|wise|levels?) )?)",
};

function expand(src: string): string {
  return src.replace(/\{([A-Z]+)\}/g, (_, name: string) => {
    const m = MACROS[name];
    if (!m) throw new Error(`Unknown lexicon macro {${name}}`);
    return m;
  });
}

const t = (concept: ConceptKey | null, patterns: string[], extra: Omit<TermDef, "concept" | "pattern"> = {}): TermDef[] =>
  patterns.map((pattern) => ({ concept, pattern, ...extra }));

/** Inanimate subjects: "the glasses fell", "it fell", "my blood pressure went down". */
const THING_BEFORE =
  "(?<!(?:glasses|cup|plate|phone|pills?|tablets?|bottle|picture|vase|book|keys|lid|tree|branch|leaves|snow|rain|it|that|something|pressure|sugar|sugars|temperature|numbers|price|prices|shelf|box|pan|mug|glass|spoon|hat|remote|tray|plant|pot|frame|clock|curtain|blind|paint|plaster|tile|swelling|fever|weight|bp|reading|level|levels|stock) )";

export const TERMS: readonly TermDef[] = [
  // ----- Blockers (no concept) ---------------------------------------------------------------
  ...t(null, [
    "(?:fell|falling|fallen|fall|falls|drifted|drifting|dropped|dropping) (?:back )?(?:asleep|to sleep|off to sleep)",
    "(?:fell|falling|fallen|fall|falls) (?:apart|behind|for|ill|sick|short|through|silent|quiet|in love|out with|to pieces|into (?:bed|place|a routine|conversation|the habit))",
    "the fall",
    "(?:in|this|last|next|early|late|during) (?:the )?fall",
    "fall (?:weather|leaves|colou?rs|season|festival|fair|risk|alarm|detector|pendant|prevention|clinic|sensor|button|mat|clean ?up)",
    "sleeping (?:pills?|tablets?|aids?|meds?|medication|medicine|draught|bag)",
    "sleep (?:aids?|apnoea|apnea|clinic|study|mask|machine|meds?|medication|tablets?|pills?|hygiene)",
    "cough (?:medicine|mixture|syrup|drops|sweets?|lozenges?)",
    "pain ?killers?",
    "pain (?:relief|relievers?|pills?|tablets?|meds?|medication|clinic|management|specialist|patch(?:es)?|team)",
    "(?:tap|roof|pipe|faucet|tyre|tire|boat|kettle|ceiling|bucket|pen|washing machine|fridge|radiator|toilet|dishwasher|car|window|bottle) (?:was |is |has been |kept |started )?(?:leak(?:ing|ed|s)?|dripping)",
    "(?:sick and )?tired of",
    "sick (?:and tired|of|note|leave|day|pay|bag)",
    "(?:get|got|getting|gotten|wasn't|was not|weren't|not|be|been|didn't get|did not get) (?:badly |seriously )?hurt",
    "(?:shake|shook|shaking) hands",
    "(?:swollen|puffy|swelling|puffiness) (?:eyes?|eyelids?|face|glands?|gums?|lips?|tongue|throat|belly|stomach|tummy|jaw|cheeks?|nose)",
    "(?:eyes?|eyelids?|face|glands?|gums?|lips?|tongue|throat|belly|stomach|tummy|jaw|cheeks?|nose) (?:{WAS} )?(?:{INT} )?(?:swollen|puffy|swelling|puffed up)",
    "confusing",
    "(?:it was|it's|it is|the weather was|weather was|outside was|morning was|a) (?:very |really |so |quite )?foggy",
    "foggy (?:morning|day|outside|weather|night|evening|out)",
    "(?:blood )?pressure (?:{WAS} )?(?:{INT} )?(?:low|high|down|up)",
    "low (?:blood pressure|bp|sugar|blood sugar|sugars|sodium|salt|fat|calorie)",
    "(?:sugar|sugars|glucose|bp|numbers|reading|readings|weight|temperature) (?:{WAS} )?(?:{INT} )?(?:low|high|down|up)",
    "slip(?:ped|s|ping)? (?:my|her|his) mind",
    "slip(?:ped|s)? (?:out|off|on) (?:to|for|my|her|his)",
    "(?:a|the|our|my|day|bus|coach|shopping|road|little|nice|lovely|long|short|weekend|boat|round|school) trips?",
    "trip (?:to|out|into|away|home|abroad)",
    "collapsed (?:into|onto|on) (?:bed|the sofa|the couch|my chair|the chair|the settee)",
    "(?:dizzy|giddy) (?:heights|blonde)",
    "(?:headed|head) (?:out|off|home|to|for|back|over|up|down)",
    "not (?:in|on) (?:any )?pain",
    "(?:since|after|before) (?:my|her|his|the|that) (?:last |previous |recent |big |bad )?(?:fall|tumble)",
    "(?:don't|do not|no need to|not to|try not to) worry",
    "no worries",
    // Pushed or knocked off balance by something outside the body is not a dizziness symptom, so the
    // unsteadiness guess below must not fire. A fall in the same sentence is still matched on its own.
    "(?:knock(?:ed|s|ing)?|push(?:ed|es|ing)?|bump(?:ed|s|ing)?|threw|thrown|throws?|throwing|tip(?:ped|s|ping)?|jostled|jolted) (?:(?:me|her|him|{PRO} \\w+) )?off[- ]balance",
  ]),

  // ----- Dizziness ---------------------------------------------------------------------------
  ...t("dizziness", [
    "dizz(?:y|ier|iest|iness|ily)",
    "dizzy (?:spells?|turns?|episodes?|feeling|moments?|bouts?)",
    "(?:spells?|bouts?|attacks?) of (?:dizziness|giddiness|vertigo)",
    "(?:light|lite)[ -]?head(?:ed|edness|y)",
    "wooz(?:y|ier|iness|ily)",
    "giddy(?! with)",
    "giddiness",
    "vertigo",
    "(?:room|world|everything|head|ceiling|house|kitchen|floor) (?:was |were |is |kept |started |starting |began |went |seemed to be |felt like it was )?(?:spinning|spun|going round|going around|whirling|swimming|swirling|tilting|moving|swaying)",
    "(?:head|room|everything) (?:spins|swims|swam|whirled)",
    "spinning (?:head|room|sensation|feeling)",
    "(?:felt|feel|feeling|feels|went|going|was|got|getting|a bit|bit|a little|very|so|quite) faint(?:ish)?",
    "faintness",
    "(?:nearly |almost )?(?:fainted|passed out|blacked out)",
    "head ?rush(?:es)?",
    "(?:funny|dizzy|giddy|faint|queer|odd|wobbly) (?:turns?|dos?|spells?|episodes?)",
    "everything (?:went|goes|going|turned) (?:black|dark|grey|gray|white|fuzzy|blurry|swimmy)",
    "seeing stars",
    "swimmy",
  ]),
  // Unsteadiness without the word "dizzy". The annotation guide counts unsteadiness as dizziness only when it is due
  // to dizziness ("unsteady because of dizziness"); from "my legs felt wobbly" alone Kinwise cannot tell the reason
  // (weakness, tiredness and low blood sugar are also possible), and the diary has no unsteadiness question. So these
  // wordings go beyond the guide and are offered only as a low-confidence "please check" guess under the dizziness
  // question, which the person confirms or rejects. (Dev case d203 pairs "off balance" with "not as dizzy as
  // yesterday"; its dizziness label comes from "not as dizzy".) Secondary layer, so "legs felt shaky" is still coded
  // as tremor too. "off my balance" stays a near-fall cue (below); "knocked me off balance" is blocked (above).
  ...t(
    "dizziness",
    [
      "legs? (?:{WAS} )?(?:{INT} )?(?:wobbly|unsteady|shaky|like jelly|jelly)",
      "(?:wobbly|jelly) legs",
      "off[- ]balance",
      "unsteady on (?:{PRO} )?(?:feet|legs)",
    ],
    { guess: "unsteadiness", secondary: true },
  ),

  // ----- Drowsiness --------------------------------------------------------------------------
  ...t("drowsiness", [
    "drows(?:y|ier|iness|ily)",
    "sleep(?:y|ier|iness)",
    "grogg(?:y|ier|iness)",
    "(?:nodding|nodded|nod|nods|kept nodding|keep nodding) off",
    "(?:dozing|dozed|dozy|doze|dozes)(?: off)?",
    "(?:kept|keep|keeps|kept on) (?:falling|dropping|drifting|nodding) (?:asleep|off)",
    "(?:fell|falling|fallen|dropped|drifted|drifting|nodded|dozed) (?:asleep|off)(?: again)? (?:in|on|at|during|over|while|watching|in front of|halfway through)(?: (?:my|the|a|her|his))? (?:chair|armchair|recliner|sofa|couch|settee|table|lunch|dinner|breakfast|tea|tv|telly|television|book|paper|newspaper|crossword|church|meal|car|bus|programm?e?|show|news|middle|day|afternoon|morning|film|movie|puzzle)",
    "(?:fell|falling|dropped|drifted) (?:asleep|off) (?:sitting up|mid[- ]sentence|mid[- ]conversation|reading|watching \\w+)",
    "(?:couldn't|could not|could barely|could hardly|can't|cannot|can barely|can hardly|struggled to|struggling to|hard to|trouble) keep(?:ing)? (?:my|her|his) eyes open",
    "hung ?over",
    "half[ -]asleep",
    "dopey",
    "zonked(?: out)?",
    "(?:like a|felt like a|feel like a) zombie",
    "(?:felt|feel|feeling|feels) (?:{INT} )?(?:drugged|sedated|doped up|doped|knocked out)",
    "heavy[- ]eyed",
    "(?:slept|sleeping|napped|napping|dozed) (?:most of|all|half|the whole|through) (?:the )?(?:day|afternoon|morning)",
    "(?:kept|keep|keeps) (?:napping|having naps)",
    "(?:napping|napped|nap|naps) (?:a lot|all day|on and off|constantly|all afternoon)",
    "(?:lots of|several|three|four|so many) naps",
  ]),

  // ----- Confusion ---------------------------------------------------------------------------
  ...t("confusion", [
    "confus(?:ed|ion)",
    "(?:brain|memory|mental|head) fog(?:gy)?",
    "fogg(?:y|ier|iness)",
    "in a (?:fog|daze|muddle|haze)",
    "muddled(?:[- ]headed)?",
    "muddle[- ]headed",
    "befuddled",
    "addled",
    "dazed",
    "disorient(?:ed|ated|ation)",
    "bewildered",
    "mixed[ -]up",
    "(?:mixed|muddled|got) (?:up )?(?:my|her|his|the) (?:\\w+ ){0,3}(?:mixed|muddled) up",
    "(?:mixed|mixing|muddled|muddling) up (?:my|her|his|the) (?:\\w+ ){0,4}(?:pills?|tablets?|meds?|medicines?|days?|words?|names?|appointments?)",
    "forgetful(?:ness)?",
    "(?:forgot|forgotten|forgetting|forget|kept forgetting|keep forgetting) (?:what|where|why|who|how|which|whether|names?|people's names|things|stuff|everything|words?|my way|the way|the day|what day|appointments?|to turn|to switch|the kettle|the stove|the oven|the gas|her name|his name|my own)",
    "(?:couldn't|could not|can't|cannot|could hardly|could barely|struggled to|struggling to) (?:remember|recall|think straight|think clearly|concentrate|focus|follow|find (?:the|my|her|his) words)(?! (?:if|whether|to take|taking|my pills?|my tablets?|my meds?|the last time|when (?:i|she|he) last|a (?:day|time|night)))",
    "(?:didn't|did not|don't|couldn't|could not|doesn't|does not) (?:know|remember|recogni[sz]e) (?:where (?:i|she|he) was|what day it was|what day|what time it was|the day|where (?:i|she|he) put|who (?:i|she|he) was|(?:her|his|my) own)",
    "(?:lost|losing) track of (?:time|the day|the date|things|what)",
    "not (?:thinking|making) (?:straight|sense|clearly)",
    "(?:spaced|zoned) out",
    "senior moments?",
    "losing (?:my|her|his) marbles",
    "(?:fuzzy|foggy|cloudy|woolly|wooly)[- ]headed",
    "(?:head|mind|brain|thinking) (?:{WAS} )?(?:{INT} )?(?:fuzzy|foggy|cloudy|woolly|muddled|all over the place|scrambled)",
    "(?:wasn't|not|wasnt|isn't) (?:really )?with it",
    "away with the fairies",
    "(?:got|gets|getting|get) lost (?:walking|driving|on the way|coming|going|in|at|again|on|between|when|while)",
    "lost (?:my|her|his) way (?:home|back|to)",
    "(?:asking|asked|asks|ask|repeating|repeated|repeats|saying|says|said|telling|told) (?:me |us )?the same (?:questions?|things?|stor(?:y|ies)) (?:over and over|again and again|repeatedly|twice|three times|several times|all day|again|over again)",
  ]),

  // ----- Fall --------------------------------------------------------------------------------
  ...t("fall", [
    `${THING_BEFORE}fell(?: (?:over|down|off (?:my|the|a|her|his) \\w+|out of (?:bed|my chair|the chair|her chair|his chair)|backwards?|forwards?|flat|hard|in a heap|on (?:my|her|his) (?:face|back|bottom|bum|side|knees?|hip|arm|wrist)))?`,
    `${THING_BEFORE}(?:fall|falls|fallen|falling)(?: (?:over|down))?`,
    "(?:had|took|taken|take|have|having) (?:a|another|two|several) (?:tumble|spill|header|nosedive|purler|cropper|fall|bad fall|nasty fall|little fall|small fall|fall again)",
    "tumbled",
    `${THING_BEFORE}(?:went|go|going|gone) (?:down|over|flying|head over heels|sprawling)(?: hard| again| in a heap)?(?! (?:to|the|for|town|into|stairs|with|well|ok|okay|fine|the road|the street|the hall|the garden path|the list|it|them|my|her|his|everything|some|there|a treat|on (?:the )?(?:bus|train)|by|at|later|this))`,
    "(?:ended|end|wound|landed|finished) up (?:on|flat on|lying on|sitting on) (?:the|my|her|his) (?:floor|ground|bottom|back|bum|backside|face|knees|pavement)",
    "(?:found|find|finding) (?:her|him|me|mum|mom|dad|grandma|grandpa|mother|father) (?:lying |sitting )?on the (?:floor|ground)",
    "(?:landed|lying|was lying|was on) (?:on|in a heap on) the (?:floor|ground|pavement)",
    "keeled over",
    "(?:slid|slipped|sank|slumped|tumbled|rolled|slithered) (?:[a-z']+ ){0,6}?(?:onto|on to|to) the (?:floor|ground|pavement)",
    "collapsed",
    "hit the (?:floor|deck|ground|pavement)",
    "came a cropper",
    "took a (?:tumble|spill|header|nosedive|purler)",
  ]),

  // ----- Near fall (explicit) ----------------------------------------------------------------
  ...t("nearFall", [
    "{NEARLY} (?:fell|fall|falling|fallen|went over|went down|going over|took a tumble|ended up on the floor|hit the floor|toppled(?: over)?|keeled over|lost (?:my|her|his) (?:balance|footing)|tripped|slipped|stumbled|collapsed|tumbled|did fall|went flying)",
    "near[- ]?(?:falls?|miss(?:es)?)",
    "close (?:call|shave)",
    "(?:caught|steadied|saved|stopped|righted) {SELF}",
    "(?:grabbed|grab|grabbing|held|hold|holding|hung|clutched|caught|clung|reached for|had to grab|had to hold)(?: (?:onto|on to|hold of|on))? (?:the|a|my|her|his) (?:\\w+ ){0,2}?{SURFACE} {STOPSELF}",
    "(?:i|she|he|you|we)'d have (?:fallen|gone (?:over|down|flying))",
    "would(?:'ve| have) fallen",
    "(?:had to |)(?:catch|caught|grab|grabbed) (?:me|her|him) (?:before|just|as|when|to stop)",
    "had to (?:catch|grab) (?:me|her|him)",
    "would(?:'ve| have) gone (?:over|down|flying)",
  ]),

  // ----- Near fall (precursor: absorbed into an actual fall in the same sentence) -------------
  ...t(
    "nearFall",
    [
      "(?:lost|losing|lose|loses) (?:my|her|his) (?:balance|footing)",
      "(?:tripped|trip|tripping|trips)(?: (?:up|over|on))?",
      "(?:stumbled|stumble|stumbling|stumbles)",
      "(?:slipped|slip|slipping|slips)",
      "(?:wobbled|teetered|staggered|swayed|lurched|toppled)",
      "(?:missed|miss) (?:a|the|my|her|his) (?:step|stair|footing)",
      "(?:legs?|knees?) (?:gave way|buckled|gave out|went from under (?:me|her|him)|went)",
      "off (?:my|her|his) balance",
    ],
    { role: "precursor" },
  ),

  // ----- Swelling ----------------------------------------------------------------------------
  ...t("swelling", [
    "swollen",
    "swell(?:ing|ings|ed|s)?",
    "puff(?:y|ier|iness|ed up)",
    "(?:o)?edema",
    "oedema",
    "fluid (?:on|in|around) (?:my|her|his|the) {LIMB}",
    "water retention",
    "retaining (?:water|fluid)",
    "(?:socks?|stockings?) (?:left|leaving|leave|leaves|are leaving|were leaving|leaving deep) (?:marks?|dents?|indents?|indentations?|lines?|grooves?)",
    "(?:shoes|slippers|shoe) (?:{WAS} )?(?:too |very |really |so )?tight",
    "cankles",
    "rings? (?:{WAS} )?(?:{INT} )?(?:tight|stuck|digging in)",
    "(?:sock|socks|stocking) (?:marks?|lines?|dents?)",
    "marks from (?:my|her|his) socks",
    "{LIMB} (?:{WAS} )?(?:{INT} )?(?:big|fat|fatter|bigger|huge|like balloons|puffy|puffed up|ballooned|blown up)",
  ]),
  ...t(
    "swelling",
    [
      "(?:swelling|swollenness|puffiness)(?: in (?:my|her|his|both) {LIMB})?(?:'s| has| had| is| was)? (?:gone|went|come|coming|going) down",
      "(?:swelling|swollenness|puffiness)(?: in (?:my|her|his|both) {LIMB})?(?:'s| is| was) down(?: a bit| a little| somewhat)?",
    ],
    { changeOnly: true },
  ),

  // ----- Energy (qualitative; explicit numeric ratings live in numbers.ts) --------------------
  ...t("energy", [
    "exhaust(?:ed|ion)",
    "wiped out",
    "(?:felt|feel|feeling|so|completely|totally|absolutely|utterly|just) wiped",
    "knackered",
    "dead on (?:my|her|his) feet",
    "(?:bone|dog|dead) tired",
    "running on empty",
    "(?:felt|feel|feeling|feels|was|am|i'm|'m|'s|so|really|very|completely|totally|utterly|just|absolutely|all|bit|little|quite|pretty) (?:drained|worn out|worn down|done in|pooped|whacked|zapped|shattered|spent|beat)",
    "worn out",
    // Bare "Drained all day." / "Shattered." — but not "drained the potatoes" or "the glass shattered".
    "(?<!(?:glass|vase|plate|cup|mug|mirror|window|screen|bowl|dish|pan|sink|bath|pool|tank|pond|battery|it|they|that|which) )(?:drained|shattered)(?! (?:the|my|a|an|it|them|some|off|away|out|into|in|on|from|pasta|potatoes|veg|vegetables|water|glass|window|cup)(?![a-z]))",
    "(?:no|zero|not an ounce of|not a scrap of|nil) {ENERGY}(?: at all| whatsoever)?",
    "(?:had |have |got )?no (?:get[ -]up[ -]and[ -]go|oomph|pep|strength)",
    "(?:didn't|did not|don't|do not|haven't|have not|hadn't|had not) (?:have|had|got) (?:any|an ounce of) {ENERGY}",
  ], { value: 1 }),
  ...t("energy", [
    "tired(?:ness)?(?! of)",
    "fatigued?",
    "weary",
    "sluggish",
    "lethargic",
    "listless",
    "run[ -]down",
    "out of steam",
    "sapped",
  ], { value: 2 }),
  ...t("energy", [
    "{ENERGY}{PUNC}(?:{WAS} )?(?:{INT} )?(?:terrible|awful|dreadful|non-?existent|zero|nil|rock bottom|gone|at rock bottom)",
  ], { value: 1, anchored: true }),
  ...t("energy", [
    "low(?: on)? {ENERGY}",
    "{ENERGY}{PUNC}(?:{WAS} )?(?:{INT} )?(?:low|poor|down|lacking|flagging|not great|not good|not (?:very |that |too |so )?good|poor-ish)",
    "(?:not (?:much|a lot of|a great deal of|enough)|very little|little|hardly any|barely any|lacking|lack of|short on|low on|lacking in) {ENERGY}",
    "(?:didn't|did not|don't|do not|haven't|have not|hadn't|had not) (?:have|had|got|find) (?:the|enough|much) {ENERGY}",
    "{ENERGY}{PUNC}(?:{WAS} )?(?:{INT} )?(?:rubbish|lousy|pants|not up to much|so-so-ish|flagging|sapped|zapped)",
    "{ENERGY}{PUNC}{WASNT} (?:(?:very|that|too|so|particularly|all that) )?(?:good|great|high|brilliant|up to much)",
  ], { value: 2, anchored: true }),
  ...t("energy", [
    "{ENERGY}{PUNC}(?:{WAS} )?(?:{INT} )?(?:ok|okay|alright|all right|so[- ]so|average|fine|normal|not bad|not too bad|middling|fair|reasonable|moderate|medium|about normal|as usual|the same|steady|okay-ish|ok-ish)",
    "(?:ok|okay|average|so[- ]so|normal|moderate|reasonable|fair|middling|usual|medium) {ENERGY}",
    "{ENERGY}[- ]wise (?:ok|okay|alright|fine|so[- ]so|average|not bad)",
    "{ENERGY}{PUNC}{WASNT} (?:(?:too|that|so|all that) )?bad",
  ], { value: 3, anchored: true }),
  ...t("energy", [
    "{ENERGY}{PUNC}(?:{WAS} )?(?:{INT} )?(?:good|decent|pretty good|quite good|fairly good|up)",
    "(?:good|decent|plenty of|a good amount of|a fair bit of|reasonable amount of) {ENERGY}",
  ], { value: 4, anchored: true }),
  ...t("energy", [
    "(?:pretty |quite |fairly |reasonably )?energetic",
    "(?:felt|feel|feeling|feels) (?:{INT} )?(?:lively|peppy|perky|sprightly)",
  ], { value: 4 }),
  ...t("energy", [
    "{ENERGY}{PUNC}(?:{WAS} )?(?:{INT} )?(?:great|excellent|high|brilliant|amazing|fantastic|through the roof|sky high|terrific|wonderful)",
    "(?:great|loads of|lots of|tons of|bags of|bundles of|boundless|so much|full of|bursting with|heaps of|masses of|high) {ENERGY}",
  ], { value: 5, anchored: true }),
  ...t("energy", [
    "full of beans",
    "raring to go",
    "(?:very|really|so|super) energetic",
    "full of (?:life|vim|bounce|get up and go)",
    "on top of the world",
    "bright[- ]eyed and bushy[- ]tailed",
  ], { value: 5 }),

  // ----- Sleep (qualitative) -----------------------------------------------------------------
  ...t("sleep", [
    "{SLEPTWORD}{PUNC}(?:{WAS} )?(?:{INT} )?(?:terrib(?:le|ly)|awful(?:ly)?|horrib(?:le|ly)|dreadful(?:ly)?|appalling(?:ly)?|atrocious(?:ly)?|rotten|abysmal(?:ly)?|the worst|non[- ]existent)",
    "(?:terrible|awful|horrible|dreadful|appalling|rotten|sleepless|abysmal|worst|atrocious) (?:{NIGHT}|nights)",
    "(?:barely|hardly|scarcely|never) (?:slept|got any sleep|got a wink|got to sleep|went to sleep)",
    "(?:didn't|did not|couldn't|could not|could hardly|could barely|can't|cannot|haven't|have not) (?:get to )?sleep(?: (?:a wink|at all|a bit|one bit))?",
    "(?:didn't|did not|haven't|have not|hardly|barely|never|couldn't|could not) (?:get|got|had|have) (?:any|a wink of|a minute's|one minute of|much of any) sleep",
    "(?:not|didn't get|didn't sleep|did not sleep|never slept|without) a wink",
    "slept a wink",
    "no sleep(?: at all| whatsoever)?",
    "(?:up|awake) (?:all|the whole|the entire) night",
    "(?:up|awake) all night long",
  ], { value: 1, anchored: true }),
  ...t("sleep", [
    "{SLEPTWORD}{PUNC}(?:{WAS} )?(?:{INT} )?(?:badly|bad|poorly|poor|restless(?:ly)?|fitful(?:ly)?|lightly|not (?:very |that |too |so )?(?:well|good|great)|broken|disturbed|patchy|on and off|in fits and starts|lousy|rubbish|ropey|ropy|not the best|so badly|in snatches)",
    "(?:bad|poor|rough|restless|fitful|broken|disturbed|lousy|rubbish|bit of a rough|rough old|interrupted|uncomfortable|unsettled|sleepless-ish|choppy|wakeful) (?:{NIGHT}|nights)",
    "not (?:a )?(?:good|great) {NIGHT}",
    "(?:poor|bad|broken|restless|disturbed|fitful|interrupted|light) sleep",
    "(?:kept|keep|keeps|kept on) waking(?: up)?",
    "(?:woke|waking|woken|awake|wake|up|getting up|got up) (?:up )?(?:a lot|lots|several times|many times|a few times|loads|often|every (?:hour|two hours|couple of hours|few hours)|on and off|repeatedly|over and over|(?:two|three|four|five|six|2|3|4|5|6) times|twice|a couple of times|again and again)(?: (?:in|during) the night)?(?: to (?:pee|wee|use the (?:bathroom|toilet|loo)|go to the (?:bathroom|toilet|loo)))?",
    "up and down (?:all night|in the night|during the night|all night long)",
    "(?:up|awake) (?:half|most of) the night",
    "(?:tossed|tossing) and (?:turned|turning)",
    "(?:trouble|difficulty|problems?|struggled|struggling|hard time|a job) (?:getting |falling |going |getting back |getting off |staying )?(?:to sleep|asleep|sleeping)",
    "(?:couldn't|could not|can't|cannot|took ages to|took forever to|took a long time to|didn't|did not) (?:get back to sleep|get off to sleep|drop off|nod off|fall asleep|go back to sleep|get to sleep|go off to sleep)",
    "(?:didn't|did not|don't|haven't|have not|couldn't|could not) sleep (?:very |too |that |so )?(?:well|good|great|much|properly|right|soundly|long|deeply)",
    "(?:sleep|night) {WASNT} (?:very |that |too |so )?(?:good|great)",
    "not (?:much|a lot of|enough) sleep",
  ], { value: 2, anchored: true }),
  ...t("sleep", [
    "{SLEPTWORD}{PUNC}(?:{WAS} )?(?:{INT} )?(?:ok|okay|alright|all right|so[- ]so|fair|fairly well|not bad|not too bad|reasonabl[ey]|average|fine|middling|okay-ish|ok-ish|so so|adequately|as usual|about the same|normal(?:ly)?|reasonably well)",
    "(?:ok|okay|alright|so[- ]so|average|reasonable|fair|not bad|not too bad|not a bad|middling|normal|usual) {NIGHT}",
    "(?:sleep|night) {WASNT} (?:too |that |so )?bad",
  ], { value: 3, anchored: true }),
  ...t("sleep", [
    "{SLEPTWORD}{PUNC}(?:{WAS} )?(?:{INT} )?(?:well|good|nicely|soundly|sound|peacefully|pretty well|quite well|really well|very well|decently|decent|deeply|solidly)",
    "(?:good|decent|restful|sound|peaceful|solid|nice|proper|good long|long|deep|good solid) {NIGHT}",
    "(?:good|sound|restful|solid|decent|deep|peaceful) sleep",
    "slept (?:right |straight |all the way )?through(?: the night)?",
    "(?:slept|sleeping|sleep) (?:[a-z0-9']+ ){0,5}?without (?:waking|stirring|getting up|a break)",
  ], { value: 4, anchored: true }),
  ...t("sleep", [
    "{SLEPTWORD}{PUNC}(?:{WAS} )?(?:{INT} )?(?:great|wonderful(?:ly)?|brilliant(?:ly)?|excellent|fantastic(?:ally)?|amazing(?:ly)?|beautiful(?:ly)?|perfect(?:ly)?|lovely|like a (?:log|baby|top|rock|stone|lamb)|like the dead|like a dream|blissfully)",
    "(?:great|wonderful|brilliant|excellent|fantastic|amazing|beautiful|perfect|lovely|best) (?:{NIGHT}|nights)",
  ], { value: 5, anchored: true }),

  // ----- Appetite ----------------------------------------------------------------------------
  ...t("appetite", [
    "(?:not|wasn't|was not|isn't|is not|weren't|never|didn't feel|did not feel|don't feel|doesn't feel|wasn't feeling|not feeling|haven't been|hasn't been|not been)(?: (?:very|really|that|too|so|at all|particularly|especially|all that|terribly|much|even))? hungry",
    "no (?:real )?{APP}",
    "(?:lost|losing|lose|loses|lack of) (?:my|her|his|the|all) {APP}",
    "{APP}{PUNC}(?:{WAS} )?(?:{INT} )?(?:poor|bad|low|down|gone|off|non-existent|nonexistent|not great|not good|not (?:very|that|too|so) good|terrible|awful|rubbish|reduced|less|lower|not there|very small|small|smaller|poorer|not what it was|missing|nil)",
    "(?:poor|bad|low|small|no|little|reduced|not much|not much of an|hardly any|barely any|tiny|smaller|lost) {APP}",
    "{APP}{PUNC}{WASNT} (?:(?:very|that|too|so|all that|particularly) )?(?:good|great|up to much|brilliant|the best|there|big|hearty|healthy|normal|what it should be)",
    "off (?:my|her|his) (?:food|grub|tucker|meals|dinner|lunch|breakfast|tea)",
    "(?:didn't|did not|don't|couldn't|could not|can't|cannot) (?:really )?(?:feel like|fancy|face|manage|stomach) (?:eating|food|anything|much|my|her|his|breakfast|lunch|dinner|supper|tea|a thing|meals?|a bite)",
    "(?:barely|hardly|scarcely) (?:ate|eat|eaten|eating|touched)",
    "(?:didn't|did not|couldn't|could not) eat (?:much|a thing|anything|very much|properly|well|all day|(?:my|her|his) {MEAL}|a lot|more than)",
    "(?:couldn't|could not|can't|cannot) eat",
    "ate (?:very |so )?(?:little|hardly anything|next to nothing|like a bird|almost nothing|nothing|less)",
    "picked at (?:my|her|his|the) (?:food|dinner|lunch|breakfast|meals?|tea|plate|supper)",
    "(?:skipped|missed) (?:breakfast|lunch|dinner|tea|supper|a meal|meals|my meals) (?:because|as|since|cause) (?:i|she|he) (?:wasn't|was not|didn't feel|wasn't feeling|not) (?:very )?hungry",
    "(?:eating|ate|eaten) less(?: than usual)?",
    "(?:food|nothing|everything) (?:doesn't|didn't|does not|did not) (?:appeal|taste right|taste good|taste of anything)",
    "only (?:managed|ate|had|picked at|nibbled) (?:half|a bit of|a little of|a few bites of|a mouthful of|a few mouthfuls of|some)(?: (?:my|her|his|the))? ?(?:{MEAL})?",
    "nibbled at",
    "ate like a (?:bird|sparrow|mouse)",
    "nothing (?:appeals|appealed|tempts me|tempted me|tastes right|tasted right)",
    "no (?:interest in|desire for) (?:food|eating|meals|my food|dinner|lunch|breakfast)",
    "(?:pushed|moved) (?:my|her|his|the) food (?:around|round)",
  ], { value: "worse" }),
  ...t("appetite", [
    "ate (?:well|a lot|heartily|loads|plenty|everything|like a horse|really well|very well)",
    "ate (?:all|every bit of|every scrap of) (?:my|her|his|the) {MEAL}",
    "ate (?:a|my|her|his) (?:good|big|hearty|large|proper|full|whole|decent|lovely|nice) {MEAL}",
    "(?:eating|eaten|eats) (?:well|heartily|everything|loads|a lot|more|properly)",
    "(?:good|great|big|hearty|healthy|better|huge|large|excellent|bigger) {APP}",
    "hungr(?:y|ier) than usual",
    "(?:really|very|so|quite) hungry",
    "starving",
    "ravenous",
    "(?:cleaned|cleared|finished) (?:my|her|his|the) (?:plate|bowl)",
    "ate (?:it|them) all(?: up)?",
    "ate (?:the lot|every (?:bit|scrap|crumb|morsel))",
    "finished (?:all|every bit) of (?:my|her|his|the) {MEAL}",
    "(?:had|have|got|went back for) seconds",
    "enjoyed (?:my|her|his) (?:food|dinner|lunch|breakfast|meals?|tea|supper)",
  ], { value: "better" }),
  ...t("appetite", [
    "{APP}{PUNC}(?:{WAS} )?(?:{INT} )?(?:good|great|better|back|excellent|improved|up|hearty|big|huge|bigger|healthy)",
  ], { value: "better", anchored: true }),
  ...t("appetite", [
    "{APP}{PUNC}(?:{WAS} )?(?:{INT} )?(?:about |pretty much |much |just )?(?:the )?(?:same|normal|usual|as usual|unchanged|steady|average|ok|okay|fine|alright|all right|not bad|regular|so[- ]so)(?: as (?:always|usual|ever|normal|before|yesterday))?",
    "(?:normal|usual|regular|average|same old|my normal|my usual) {APP}",
    "ate (?:normally|as usual|my usual|the usual|the same as usual|about the same|my normal|as normal|the same as always|a normal amount)",
    "eating (?:normally|as usual|the same|as normal)",
  ], { value: "same", anchored: true }),
  ...t("appetite", [
    "{APP}{PUNC}(?:{WAS} )?(?:{INT} )?worse",
  ], { value: "worse", anchored: true, explicitValue: true }),

  // ----- Other symptom concepts --------------------------------------------------------------
  ...t("nausea", [
    "nause(?:a|ous|ated|ating)",
    "quea(?:sy|siness)",
    "(?:felt|feel|feeling|feels|was feeling|been feeling) (?:{INT} )?sick",
    "sick to (?:my|her|his) stomach",
    "(?:threw|throw|throwing|thrown) up",
    "vomit(?:ed|ing|s)?",
    "(?:was|been|being|were) sick",
    "(?:stomach|tummy) (?:{WAS} )?(?:{INT} )?(?:upset|churning|turning|unsettled|off|queasy)",
    "upset (?:stomach|tummy)",
    "retching",
    "heaving",
    "gagging",
    "bilious",
    "felt like (?:i was going to|i might|i'd|i would|she was going to) (?:be sick|throw up|vomit)",
  ]),
  ...t("constipation", [
    "constipat(?:ed|ion)",
    "bunged up",
    "(?:bowels?|tummy) (?:haven't|have not|hasn't|didn't|did not|not) (?:moved|opened|been|worked|gone)",
    "(?:haven't|have not|hasn't|has not|didn't|did not|couldn't|could not|can't) (?:been to the (?:toilet|loo|bathroom) (?:properly|for (?:days|a few days|two days|three days))|had a (?:bowel movement|poo|bm)|go(?:ne)? (?:for (?:days|a few days|two days|three days)|number two|#2))",
    "no bowel (?:movement|motion)",
    "(?:haven't|have not|hasn't|has not) been (?:to the (?:toilet|loo) )?(?:for|in) (?:days|\\w+ days|a few days|a couple of days|a while|ages)",
    "(?:hard|lumpy) (?:stools?|poo)",
    "straining (?:on|at) the (?:toilet|loo)",
    "(?:bowels?|i'm|i am|i was|feel|felt|feeling) backed up",
  ]),
  ...t("dry_mouth", [
    "dry mouth",
    "mouth (?:{WAS} )?(?:{INT} )?(?:{INT} )?(?:dry|parched|like sandpaper|like cotton wool|like the sahara|sticky)",
    "parched",
    "cotton ?mouth",
    "xerostomia",
    "tongue (?:sticking|stuck) to (?:the roof of )?(?:my|her|his) mouth",
  ]),
  ...t("headache", [
    "head ?aches?",
    "head ?achy",
    "migraines?",
    "(?:head|temples?) (?:{WAS} )?(?:{INT} )?(?:hurt(?:ing|s)?|pounding|throbbing|aching|banging|splitting|killing me|sore|thumping)",
    "(?:pounding|throbbing|splitting|sore|thumping|banging|thick) head(?! (?:cold|lice))",
    "my head hurt(?:s)?",
  ]),
  ...t("cough", [
    "cough(?:ing|ed|s|y)?",
    "hacking",
    "chesty",
  ]),
  ...t("blurred_vision", [
    "blurr(?:y|ed|ing) (?:vision|eyes|eyesight|sight)",
    "(?:vision|eyesight|sight|eyes) (?:{WAS} )?(?:{INT} )?(?:blurr(?:y|ed)|fuzzy|cloudy|misty|hazy|out of focus|funny|double)",
    "(?:couldn't|could not|can't|cannot) (?:see|read) (?:properly|clearly|straight|well|the (?:paper|telly|tv|print|words))",
    "(?:double|blurred|blurry|fuzzy|hazy|cloudy) vision",
    "seeing double",
    "(?:everything|things|words|print|the tv|the telly|the page) (?:{WAS} )?(?:{INT} )?(?:blurry|blurred|fuzzy|out of focus)",
  ]),
  ...t("urinary_problem", [
    "(?:leaked|leaking|leak|leaks|leakage|dribbl(?:ed|ing|e))",
    "wet (?:myself|herself|himself|the bed|my pants|my knickers|my trousers|her pants|his trousers)",
    "(?:bladder|toilet|bathroom|little|small|wee) (?:accidents?|leaks?|trouble|troubles|problems?|issues?|weakness)",
    "(?:had|having) (?:an?|a little|a small|another|another little) (?:bladder )?accident(?! (?:in the car|on the road|with the car|at work))",
    "incontinen(?:t|ce)",
    "(?:couldn't|could not|can't|cannot) (?:hold it|hold on|make it to the (?:toilet|loo|bathroom))",
    "(?:didn't|did not|never) make it to the (?:toilet|loo|bathroom)(?: in time)?",
    "(?:peeing|weeing|urinating|going to the (?:toilet|loo|bathroom)) (?:a lot|all the time|constantly|every hour|non[- ]stop|more than usual|all night)",
    "(?:burning|stinging|pain|it hurts|it hurt) when (?:i|she|he) (?:pee|wee|pass water|urinate)",
    "(?:trouble|difficulty|problems?) (?:peeing|weeing|urinating|passing water)",
    "(?:bladder|waterworks) (?:{WAS} )?(?:playing up|acting up|bad|troublesome)",
  ]),
  ...t(
    "urinary_problem",
    [
      "(?:up|getting up|got up|woke up|waking up|woken up) (?:(?:two|three|four|five|six|2|3|4|5|6|several|many|a few|a couple of) times|twice|a lot|all night|lots|repeatedly|every hour|again and again|over and over)(?: (?:in|during) the night)? (?:to|for) (?:pee|wee|the (?:toilet|loo|bathroom)|use the (?:toilet|loo|bathroom)|go to the (?:toilet|loo|bathroom)|pass water|urinate)",
      "(?:with|because of) (?:my|her|his) bladder",
    ],
    { secondary: true },
  ),
  ...t("low_mood", [
    "(?<!(?:swelling|pressure|bp|sugar|weight|temperature|it|numbers?|readings?|fever|appetite|energy|sugars|levels?) )(?:felt|feel|feeling|feels|been|was|am|i'm|'m|seemed|seems|a bit|bit|a little|quite|very|so|really|rather|pretty|bit) (?:low|down|blue|flat)(?! (?:on energy|energy|blood|pressure|the stairs|the road|the street|the hill|the garden|to|for|in the dumps|at|there|here|with|by|from|stairs|the hall|the corridor|the lane|town|below)(?![a-z]))",
    "low (?:mood|spirits)",
    "in low spirits",
    "depress(?:ed|ion)",
    "miserable",
    "tearful",
    "teary",
    "weepy",
    "gloomy",
    "despondent",
    "hopeless",
    "glum",
    "morose",
    "down in the dumps",
    "fed up",
    "unhappy",
    "(?:felt|feel|feeling|feels|been|was|am|i'm|'m|so|very|really|quite|a bit|bit|a little) sad",
    "sadness",
    "(?:crying|cried|in tears)(?! (?:with|of) laughter)",
    "heavy[- ]hearted",
  ]),
  ...t("anxiety", [
    "anxi(?:ous|ety|ousness)",
    "nervous(?:ness)?",
    "nervy",
    "on edge",
    "edgy",
    "jittery",
    "panick(?:y|ed|ing)",
    "panic(?: attacks?)?",
    "uneasy",
    "(?:worried|worrying|worries|worry|fretting|fretful|fretted)",
    "(?:stressed|stressing)(?: out)?",
    "wound up",
    "keyed up",
    "(?:felt|feel|feeling|feels|so|very|really|quite|a bit|bit) (?:scared|frightened|afraid|tense|agitated|wired|unsettled|restless)",
    "a bag of nerves",
  ]),
  ...t("pain", [
    "pain(?:s|ful)?",
    "ach(?:e|es|ed|ing|y)",
    "(?:back|hip|knee|tummy|stomach|belly|tooth|ear|neck|joint)aches?",
    "(?:hurt|hurts|hurting)(?! (?:myself|herself|himself|my feelings|her feelings|his feelings))",
    "sore(?:ness)?",
    "cramp(?:s|ing|ed|y)?",
    "arthritis (?:{WAS} )?(?:playing up|acting up|flaring|bad|terrible|awful|giving me gyp)",
    "twinges?",
    "(?:knees?|back|hips?|legs?|joints?|shoulders?|neck|feet|hands?|arms?|wrists?|stomach|tummy|chest)(?:'s| has| have)? (?:{WAS} )?(?:killing me|murdering me|playing up|acting up|giving me (?:gyp|jip|grief|trouble|hell))",
    "(?:in )?agony",
  ]),
  ...t("shortness_of_breath", [
    "short(?:ness)? of breath",
    "breathless(?:ness)?",
    "out of breath",
    "(?:couldn't|could not|can't|cannot|struggled to|struggling to) (?:catch|get) (?:my|her|his) breath",
    "(?:hard|difficult|difficulty|trouble|struggling|struggled) (?:to )?breath(?:e|ing)",
    "winded",
    "puffed(?: out)?",
    "puffing(?: and panting)?",
    "breathing (?:{WAS} )?(?:{INT} )?(?:bad|hard|difficult|laboured|labored|heavy|tight)",
  ]),
  ...t("tremor", [
    "tremor(?:s)?",
    "trembl(?:ing|ed|e|y)",
    "shak(?:y|ing|iness|es)",
    "the shakes",
    "(?:hands?|fingers?|legs?) (?:{WAS} )?(?:{INT} )?(?:shaking|shaky|trembling|jittery|quivering|twitching)",
  ]),
  ...t("rash", [
    "rash(?:es)?",
    "hives",
    "itch(?:y|ing|iness|es)?",
    "(?:red|itchy|raised) (?:spots|bumps|blotches|patches|welts)",
    "blotch(?:y|es)",
    "(?:skin|arm|leg|back|chest) (?:{WAS} )?(?:breaking out|broken out|red and itchy|blotchy)",
    "broke out in (?:a rash|spots|hives|a red rash|blotches)",
    "welts",
  ]),
  ...t("diarrhea", [
    "diarrh(?:o)?ea",
    "loose (?:stools?|bowels?|motions?|bowel movements?)",
    "the runs",
    "runny (?:tummy|bowels|stools?)",
    "the trots",
  ]),
  ...t("palpitations", [
    "palpitat(?:ions?|ing)",
    "heart (?:{WAS} )?(?:{INT} )?(?:racing|pounding|fluttering|flutters|skipping|skipped|jumping|thumping|thudding|hammering|going fast|going like the clappers|beating fast|beating hard|flip[- ]flopping|all over the place|missing beats|racing away)",
    "(?:racing|pounding|fluttering|thumping) heart",
    "flutter(?:ing|s)? in (?:my|her|his) chest",
    "(?:skipped|missed|extra) (?:heart ?)?beats",
  ]),
  ...t("bleeding_or_bruising", [
    "bruis(?:e|es|ed|ing)",
    "black and blue",
    "bleed(?:ing|s)?",
    "bled",
    "blood in (?:my |her |his |the )?(?:urine|pee|wee|stools?|poo|spit|phlegm|sputum|toilet|tissue)",
    "nose ?bleeds?",
    "(?:coughing|coughed|spitting|spat) up blood",
    "blood when (?:i|she|he) (?:brush|brushed|blow|blew|cough|coughed|spit|spat|wipe|wiped)",
  ]),
  ...t("black_stools", [
    "black (?:stools?|poos?|bowel movements?|motions?|bm)",
    "(?:stools?|poo|poos|bowel movements?|motions?) (?:{WAS} )?(?:{INT} )?(?:black|tarry|jet black|very dark|like tar)",
    "tarry (?:stools?|poos?)",
    "mela?ena",
  ]),
  ...t("shakiness_or_sweating", [
    "sweat(?:y|ing|s|ed)",
    "clammy",
    "cold sweats?",
    "night sweats",
    "perspiring",
    "drenched in sweat",
    "had a hypo",
  ]),
  ...t(
    "shakiness_or_sweating",
    ["(?:felt|feel|feeling|feels|was|were|a bit|bit|very|so|all) (?:shaky|trembly)", "the shakes"],
    { secondary: true },
  ),
];

// ---------------------------------------------------------------------------
// Compilation + matching

export interface CompiledTerm extends TermDef {
  id: number;
  re: RegExp;
}

export interface LexMatch {
  term: CompiledTerm;
  start: number;
  end: number;
  text: string;
}

const BOUNDARY_L = "(?<![a-z0-9'])";
const BOUNDARY_R = "(?![a-z0-9])";

let compiled: CompiledTerm[] | null = null;

/** Compile all terms once (lazily) — ~300 regexes, a few ms on first use. */
export function compiledTerms(): CompiledTerm[] {
  if (compiled) return compiled;
  compiled = TERMS.map((def, id) => ({ ...def, id, re: new RegExp(BOUNDARY_L + "(?:" + expand(def.pattern) + ")" + BOUNDARY_R, "g") }));
  return compiled;
}

/** Specificity used to break ties between equal-length overlapping matches. */
function priority(t: CompiledTerm): number {
  if (t.concept === null) return 3; // blockers win ties
  if (t.anchored) return 2;
  return t.role === "precursor" ? 0 : 1;
}

/**
 * Find concept mentions in normalised text. Returns non-overlapping matches (longest first,
 * blockers included with `term.concept === null`) sorted by position.
 */
export function matchLexicon(text: string): LexMatch[] {
  const all: LexMatch[] = [];
  for (const term of compiledTerms()) {
    term.re.lastIndex = 0;
    for (let m = term.re.exec(text); m; m = term.re.exec(text)) {
      if (m[0].length === 0) {
        term.re.lastIndex++;
        continue;
      }
      all.push({ term, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  all.sort((a, b) => b.end - b.start - (a.end - a.start) || priority(b.term) - priority(a.term) || a.start - b.start);
  const taken: LexMatch[] = [];
  const overlaps = (a: LexMatch, b: LexMatch) => a.start < b.end && b.start < a.end;
  for (const m of all) {
    const conflict = taken.some((x) => {
      if (!overlaps(m, x)) return false;
      // Secondary-layer terms only compete with their own layer and with blockers.
      const mSec = !!m.term.secondary;
      const xSec = !!x.term.secondary;
      if (mSec !== xSec) return x.term.concept === null || m.term.concept === null;
      return true;
    });
    if (!conflict) taken.push(m);
  }
  // One word, one symptom: "felt shaky" is coded as tremor only, not also as the secondary "shakiness or sweating"
  // (which then showed twice under "Also mentioned"). Sweating still codes shakiness_or_sweating from its own words
  // ("shaky and sweaty" → tremor + shakiness_or_sweating, as the annotation guide's gold case d243 expects).
  const kept = taken.filter(
    (m) => !(m.term.secondary && m.term.concept === "shakiness_or_sweating" && taken.some((x) => x.term.concept === "tremor" && overlaps(m, x))),
  );
  return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Every literal word used by the lexicon (fuzzy matching must not "correct" these). */
export function lexiconVocabulary(): Set<string> {
  const vocab = new Set<string>();
  for (const def of TERMS) {
    for (const w of expand(def.pattern).replace(/\(\?<?[=!:]/g, " ").replace(/\\w|\\s|\\d/g, " ").match(/[a-z]{3,}/g) ?? []) vocab.add(w);
  }
  return vocab;
}

// ---------------------------------------------------------------------------
// Dizziness severity (guide: slightly/a little/a bit/mild → 1; moderately/quite/fairly → 2;
// very/really bad/badly/severe/terribly → 3; no intensity word → no severity).
// The intensity adverb decides when it modifies "bad": "quite bad" → 2, "really bad" → 3,
// "not too bad" → 1.

const SEV_MILD = "a (?:little |tiny |wee )?bit|a little|a tad|a touch|bit|slightly|mildly|mild|slight|a smidge|little bit";
const SEV_MODERATE = "quite|moderately|moderate|fairly|rather|pretty|reasonably|somewhat";
const SEV_SEVERE_ADV =
  "very|really|so|extremely|terribly|awfully|horribly|incredibly|severely|badly|seriously|super|too|properly|dreadfully|desperately";
const SEV_SEVERE_ADJ = "bad|severe|terrible|awful|horrible|nasty|dreadful|massive|shocking|horrendous";
const SEV_MILD_PHRASE = "not (?:too|that|so|very|overly|all that) bad|nothing (?:too )?serious|manageable|bearable";

/** One severity phrase, e.g. "a bit", "quite", "really bad", "not too bad". */
const SEV_PHRASE =
  `(?:${SEV_MILD_PHRASE}|(?:${SEV_MODERATE}|${SEV_SEVERE_ADV}) (?:${SEV_SEVERE_ADJ})|(?:${SEV_SEVERE_ADV})(?: (?:very|really|so))?|` +
  `${SEV_SEVERE_ADJ}|${SEV_MILD}|${SEV_MODERATE})`;

/** Map a severity phrase to 1–3 (first matching rule wins). */
export function severityOfPhrase(phrase: string): 1 | 2 | 3 | null {
  const p = phrase.trim();
  if (new RegExp(`^(?:${SEV_MILD_PHRASE})$`).test(p)) return 1;
  if (new RegExp(`^(?:${SEV_MILD})$`).test(p)) return 1;
  if (new RegExp(`^(?:${SEV_MODERATE})(?: (?:${SEV_SEVERE_ADJ}))?$`).test(p)) return 2;
  if (new RegExp(`^(?:${SEV_SEVERE_ADV})(?: (?:very|really|so))?(?: (?:${SEV_SEVERE_ADJ}))?$`).test(p)) return 3;
  if (new RegExp(`^(?:${SEV_SEVERE_ADJ})$`).test(p)) return 3;
  return null;
}

/** Modifier right before the mention: "a bit dizzy", "quite woozy and sick", "really bad dizzy spell", "a bit of dizziness". */
const SEV_PRE = new RegExp(`(?:^|[^a-z'])(${SEV_PHRASE})(?: of(?: the)?)?(?: [a-z]+ (?:and|&) |, ?[a-z]+ (?:and|&) | )$`);

/** Predicate after the mention: "dizziness was really bad", "dizzy, but not too bad", "dizzy spells - mild". */
const SEV_POST = new RegExp(
  `^(?: (?:spells?|turns?|episodes?|feeling|sensation))?(?:\\s*(?:,|but|-|and|\\?|:))?\\s*(?:(?:it |which |that |this )?(?:was|were|is|has been|got|been|felt|'s|seemed) )?` +
    `((?:${SEV_SEVERE_ADV}|${SEV_MODERATE}) (?:${SEV_SEVERE_ADJ})|${SEV_SEVERE_ADJ}|${SEV_MILD_PHRASE}|mild|slight|moderate|badly|terribly|severely|a (?:little|bit)|slightly|moderately|fairly)(?![a-z])`,
);

/** Trailing fragment at the end of the sentence: "Head swimming after my tablets, moderately bad." */
const SEV_TAIL = new RegExp(`(?:,|-|:)\\s*(${SEV_PHRASE})\\s*[.!]*\\s*$`);

/**
 * Severity modifier attached to a dizziness mention at [start, end) within the sentence
 * [clauseStart, clauseEnd). Returns the value and the modifier's span, or null.
 */
export function dizzinessSeverity(
  text: string,
  start: number,
  end: number,
  clauseStart: number,
  clauseEnd: number,
): { value: 1 | 2 | 3; start: number; end: number } | null {
  const before = text.slice(clauseStart, start);
  const pre = SEV_PRE.exec(before);
  if (pre) {
    const v = severityOfPhrase(pre[1]);
    if (v) {
      const s = clauseStart + pre.index + pre[0].indexOf(pre[1]);
      return { value: v, start: s, end: s + pre[1].length };
    }
  }
  const after = text.slice(end, clauseEnd);
  const post = SEV_POST.exec(after);
  const tail = post ? null : SEV_TAIL.exec(after);
  const hit = post ?? tail;
  if (hit) {
    const v = severityOfPhrase(hit[1]);
    if (v) {
      const s = end + hit.index + hit[0].lastIndexOf(hit[1]);
      return { value: v, start: s, end: s + hit[1].length };
    }
  }
  return null;
}
