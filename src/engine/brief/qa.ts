// "Ask Kinwise" (SPEC §7, SPEC-UI "Ask"): bounded questions about the person's own records.
//
//   routeQuestion(q)          scope gate. Questions about diagnosis, treatment, doses, starting/stopping/switching,
//                             whether something is "safe", what to do, how serious it is, or what will happen get a
//                             fixed, kind redirect to the doctor or pharmacist (with "add to visit questions"); emergency
//                             words get the 911 line instead. Everything else is in scope.
//   retrieveForQuestion(q, …) deterministic retrieval: symptom concepts (with everyday synonyms: woozy, lightheaded,
//                             nearly went over…), medicines (names, brands and combination products via matchDrug, plus
//                             "the new pill" / "her water pill"), date phrases ("this week", "last two weeks", "since
//                             lorazepam started", "in September", "since Sep 24") and an intent (when did X start, how
//                             many X since Y, what did she say about X, Beers list, ACB, what changed, list medicines…).
//                             It returns evidence items (for the on-device model and the evidence chips) and a
//                             deterministicAnswer of 1–4 code-rendered sentences. Every answer sentence restates one
//                             evidence item it cites, and is checked with verifySentence before it is returned.
//
// Pure and deterministic: no clock, no model, no network.

import type {
  BriefSentence,
  CheckIn,
  ConceptId,
  EvidenceItem,
  EvidenceKind,
  EvidencePackage,
  Finding,
  ISODate,
  Medication,
  MedReview,
  MetricKey,
  StoreData,
} from "../../model/types";
import { addDays, daysBetween, isValidDate, minDate, parseDate } from "../../model/dates";
import { classesOf, getClass, knownEffect } from "../../kb/index";
import { matchDrug } from "../../kb/normalize";
import { getMetric, latestCheckInPerDate, metricValue, windowStatFromDays } from "../timeline/metrics";
import { eventWindows } from "../timeline/windows";
import { TIMELINE_RULES } from "../timeline/rules";
import {
  coverageText,
  evidenceId,
  fallsSinceStartText,
  fallsText,
  medText,
  metricCountText,
  mostRecentStart,
  noteText,
  rankFindings,
} from "./evidence";
import type { BriefEvidenceItem, EvidenceData } from "./evidence";
import {
  BEERS_CATEGORIES,
  CATEGORY_TEXT,
  CONCEPT_LABEL,
  DEFAULT_KB,
  PRODUCT_NAME,
  answersInWords,
  dateListWords,
  dateWords,
  decisionFor,
  excerpt,
  isActiveOn,
  joinAnd,
  medName,
  oneLine,
  patientFirstName,
  plural,
  pronounsFor,
  quotable,
  sourceShorts,
} from "./shared";
import type { BriefKb } from "./shared";
import { SAFETY_LINE, selectReviewPrompts } from "./template";
import { verifySentence } from "./verify";

// ---------------------------------------------------------------------------
// Scope gate

export type OutOfScopeCategory = "emergency" | "treatment" | "dose" | "diagnosis" | "cause" | "safety" | "urgency" | "prediction";

export type QuestionRoute =
  | { inScope: true }
  | {
      inScope: false;
      category: OutOfScopeCategory;
      /** Short plain reason shown under the redirect. */
      reason: string;
      /** The fixed redirect text. */
      redirect: string;
      /** Offer "Add to visit questions" (never for emergencies). */
      offerVisitQuestion: boolean;
      /** The name of the scope form that matched (SCOPE_RULES), for tests and walking through a redirect. */
      rule: string;
    };

/** The fixed, kind redirect for questions only a clinician can answer. */
export function redirectText(patientName?: string): string {
  const named = oneLine(patientName ?? "");
  // A placeholder kept from an older "Delete everything" ("Your relative") reads as words, not a name.
  const who = !named ? "her" : /^(?:your|my|our) /i.test(named) ? `${named.toLowerCase()}'s` : `${named}'s`;
  return `That's a question for ${who} doctor or pharmacist. Want to add it to your visit questions?`;
}

/** Shown instead of an answer when the question contains emergency words (the same numbers as the Help dialog). */
export const EMERGENCY_REDIRECT =
  `If something feels like an emergency, call 911 now. If someone took too much of a medicine or the wrong one, call Poison Control at 1-800-222-1222 (US, free, 24/7). ${PRODUCT_NAME} can't help in an emergency — it only answers questions about the records.`;

/**
 * Words for the person the questions are about. The scope rules put this in their "person" slot; routeQuestion adds
 * the profile's own names at call time (see personPattern), so "Should John stop…" is caught for any name.
 */
const PERSON_WORDS = [
  "she", "he", "i", "we", "they", "him", "her", "them", "the patient",
  "mom", "mum", "mother", "dad", "father", "grandma", "grandpa", "grandmother", "grandfather", "granny", "grandad", "granddad",
  "nana", "nan", "papa", "gran", "husband", "wife", "partner",
  "(?:my|our|your) (?:mom|mum|mother|dad|father|parents?|grandma|grandpa|grandmother|grandfather|granny|nana|papa|husband|wife|partner|relative|loved one)",
];
/** Generic words for a medicine, for the "medicine" slot (the list's own names and brands are added at call time). */
const MED_NOUNS = "pills?|tablets?|caplets?|capsules?|medicines?|medications?|meds|drugs?|sleeping pills?|sleep aids?|water pills?";
/** Name parts that are words, not names ("Your relative" placeholder, titles). */
const NAME_STOP = new Set("your my our the a an of mr mrs ms miss dr relative person patient loved one".split(" "));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "(?:she|he|…|grandpa|robert|diaz)": generic person words plus each word of the names passed in. */
function personPattern(names: string[]): string {
  const parts = names.flatMap((n) => oneLine(n).toLowerCase().split(/[^a-z'-]+/)).filter((w) => w.length >= 2 && !NAME_STOP.has(w));
  return `(?:${[...new Set([...parts.map(escapeRe), ...PERSON_WORDS])].join("|")})`;
}

/** "(?:pills?|…|lorazepam|ativan)": generic medicine words plus the list's names and brands, as findMeds reads them. */
function medPattern(medNames: string[]): string {
  const names = medNames
    .flatMap((n) => [n.replace(/\(.*?\)/g, " "), ...[...n.matchAll(/\(([^)]*)\)/g)].map((x) => x[1])])
    .map((n) => oneLine(n).toLowerCase().replace(/\b(?:otc|over the counter)\b/g, "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 3);
  return `(?:${[...new Set(names.map(escapeRe)), MED_NOUNS].join("|")})`;
}
const ACTION =
  "(?:stop|start|quit|discontinue|taper|wean|switch|swap|replace|skip|halve|double|take|give|try|use|keep|continue|go back|cut|reduce|lower|increase|raise|change|avoid|come off|get off|be on|stay on|drink|mix|combine)";
/** Symptom words that make "right now" / "just now" an emergency signal rather than a records question. */
const ACUTE_SYMPTOM =
  "(?:confus\\w*|dizz\\w*|fell|fall\\w*|fallen|faint\\w*|breath\\w*|pain|bleed\\w*|blood|wake|unconscious|unresponsive|collaps\\w*|vomit\\w*|throwing up|shak\\w*|drows\\w*|sleepy|groggy|weak|numb|limp|droop\\w*|slurr\\w*|seiz\\w*|choking|hit (?:her|his) head|on the floor|can'?t (?:stand|walk|talk|speak|see)|hallucinat\\w*|seeing things)";
/** Generic words for a medicine (used with namesAMedicine for comparison questions). */
const MED_WORD = /\b(?:pills?|tablets?|meds?|medicines?|medications?|drugs?|prescriptions?|sleeping pills?|sleep aids?|melatonin)\b/;

/**
 * Does this text name a medicine (a KB drug or brand, or a generic word like "pill")? Single words only, exact,
 * brand, alias or combination matches (plus long fuzzy matches, as in findMeds), never common English words.
 */
function namesAMedicine(t: string): boolean {
  return MED_WORD.test(t) || namesADrug(t);
}

/** Does this text name a specific KB drug or brand ("lorazepam", "Ativan")? Generic words like "pills" don't count. */
function namesADrug(t: string): boolean {
  for (const w of tokenize(t)) {
    if (w.length < 4 || COMMON_WORDS.has(w) || SCOPE_STOP_WORDS.has(w)) continue;
    const m = matchDrug(w);
    if (m.match === "none" || !m.ingredientIds.length) continue;
    if (m.match !== "fuzzy" || w.length >= 7) return true;
  }
  return false;
}

/** Words never read as a medicine name by the scope gate (question words that fuzzy-match drug names). */
const SCOPE_STOP_WORDS = new Set("than that this these those which what when where would could should with have been being from into worse better best".split(" "));

/** "is X better than Y": a medicine named on both sides of the comparison (not "sleeping better than before"). */
function comparesMedicines(t: string): boolean {
  const m = /^(.*)\b(?:better|worse|safer|stronger|gentler|milder) than\b(.*)$/.exec(t);
  if (!m) return false;
  return namesAMedicine(m[1]) && namesAMedicine(m[2]) && !/\b(?:before|since|after|started|starting|last (?:week|month))\b/.test(m[2]);
}

/** "is it the lorazepam?", "could it be her water pill": a medicine offered as the explanation. */
function blamesAMedicine(t: string): boolean {
  const m = /\b(?:is|could|might|may|was|can|would) it (?:just |really |all )?(?:be |have been )?(?:because of |from |down to )?(?:the |her |his |that |this |those |these )?((?:[a-z'+-]+ ?){1,3})/.exec(t);
  return Boolean(m && namesAMedicine(m[1]));
}

/**
 * One named way of asking an out-of-scope question: a regex, a helper check (for forms that need more than one
 * regex, such as "is the word after it a medicine?"), or both; either match counts. The name is returned as
 * route.rule, so a redirect can be traced back to the form that fired.
 */
interface ScopeForm {
  name: string;
  pattern?: RegExp;
  test?: (t: string) => boolean;
  /** A reason line for this form instead of the category's (fixed text, like every reason). */
  reason?: string;
}

/** A category of question Kinwise does not answer, its reason line, and its forms (checked in order). */
interface ScopeRule {
  category: OutOfScopeCategory;
  reason: string;
  forms: ScopeForm[];
}

/** A form from a regex source (for the forms built from the person and medicine slots). */
const rx = (name: string, source: string): ScopeForm => ({ name, pattern: new RegExp(source) });

/**
 * "Is lorazepam linked to her falls?", "Can lorazepam lead to falls?", "Could Tylenol PM contribute to her confusion?":
 * a specific medicine (a KB name or brand, or a name on her list) tied to a symptom, like "is X causing". A generic
 * subject stays a reference question about the lists ("Which medicines are linked to falls?" → fall-risk answer).
 */
function linksAMedicine(t: string, MED: string, PERSON: string): boolean {
  const LINK =
    "(?:(?:is|are|was|were|be|been|being) )?(?:linked|related|connected|tied|associated) (?:to|with)\\b" +
    // "Has lorazepam had anything to do with it?"
    "|(?:have|has|had|having) (?:any|some)thing to do with\\b" +
    "|(?:(?:can|could|might|may|would|will|does|do|did) )?(?:lead|leads|led|leading|contribut\\w*|result|results|resulted) (?:to|in)\\b" +
    // "Is lorazepam a factor in her falls?", "Did the Ativan play a part in it?"
    "|(?:(?:is|was|be|been) )?(?:a |the |part of the )?(?:contributing )?(?:factor|contributor) (?:in|to)\\b" +
    "|play(?:s|ed|ing)? (?:a |any )?(?:part|role) in\\b";
  // A specific medicine: a KB name or brand, or a name on her list (not a generic word like "medicines").
  const listed = new RegExp(`\\b${MED}\\b`);
  const generic = new RegExp(`^(?:${MED_NOUNS})$`);
  const specific = (s: string) => {
    const name = listed.exec(s)?.[0];
    return namesADrug(s) || Boolean(name && !generic.test(name));
  };
  // The medicine before the link ("Is lorazepam related to her falls?") or after it, with the symptom first ("Is the
  // dizziness connected to the lorazepam?").
  const before = new RegExp(`((?:[a-z'+-]+ )?[a-z'+-]+) (?:${LINK})`, "g");
  if ([...t.matchAll(before)].some((m) => specific(m[1]))) return true;
  // "Is lorazepam affecting her memory?", "Does Tylenol PM affect her balance?": only with a specific medicine before
  // "affect" and the person after it, so "Does lorazepam affect sleep?" and "Which medicines affect balance?" stay
  // reference questions.
  const affects = new RegExp(`((?:[a-z'+-]+ )?[a-z'+-]+) affect(?:s|ed|ing)? (?:her|his|their|him|them|${PERSON})(?:'s)?\\b`, "g");
  if ([...t.matchAll(affects)].some((m) => specific(m[1]))) return true;
  if (wordsAfter(t, `(?:${LINK}) (?:the |her |his |their |that |this )?`).some(specific)) return true;
  // "Does her confusion have anything to do with the oxybutynin?", "Is the confusion something to do with lorazepam?"
  if (wordsAfter(t, "\\b(?:any|some)thing to do with (?:the |her |his |their |that |this )?").some(specific)) return true;
  // Two things tied together, one of them a medicine: "Is there a link between lorazepam and her falls?",
  // "Are lorazepam and her dizziness related?".
  const pair =
    /\b(?:link|connection|relationship|association) between (.+?) and (.+?)(?:\?|$)|\b(?:is|are|was|were|could|might) (.+?) and (.+?) (?:related|linked|connected|associated)\b/.exec(t);
  return Boolean(pair && [pair[1], pair[2], pair[3], pair[4]].some((s) => s !== undefined && specific(s)));
}

/** "Is she dizzy because of zolpidem?": a medicine (any KB name or generic word, on her list or not) offered as the reason. */
function becauseOfAMedicine(t: string): boolean {
  const m = /\b(?:because of|due to|from) (?:the |her |his |that |this )?(?:new )?([a-z'+-]+(?: [a-z'+-]+)?)\b[^?]*\?$/.exec(t);
  return Boolean(m && namesAMedicine(m[1]));
}

/** "Take John off zolpidem?": taking someone off a medicine the question names (any name in the person slot). */
function takesOffAMedicine(t: string): boolean {
  const m = /\b(?:take|taking|took|get|getting|got) [a-z'-]+ off (?:of )?(?:the |her |his |that |this |all )?([a-z'+-]+(?: [a-z'+-]+)?)/.exec(t);
  return Boolean(m && namesAMedicine(m[1]));
}

/** The 1–2 words after `prefix` (a regex source ending where the medicine would start), for namesAMedicine. */
function wordsAfter(t: string, prefix: string): string[] {
  const re = new RegExp(`${prefix}((?:[a-z'+-]+ ?){1,2})`, "g");
  return [...t.matchAll(re)].map((m) => m[1]);
}

/** Verbs of taking or giving a medicine, for the overdose forms below ("had" only where a medicine must follow). */
const TOOK = "\\b(?:took|taken|swallowed|ate|eaten|given|gave)(?: (?:him|her|them|me))?";
const POSS = "(?:her |his |my |the |their |its )?";

/**
 * A possible overdose that names the medicine itself, not a pill noun: "She took 8 lorazepam", "he took 6 ambien",
 * "took 10 of his zolpidem", "took a handful of lorazepam", "took all of her Ativan", "a whole bottle of Tylenol PM",
 * "took extra zolpidem", "took too many Ativan". The word after the amount must name a medicine (namesAMedicine:
 * the KB's names and brands, so medicines that are not on the list count too). A small count needs "of" ("took 2 of
 * her pills"; "took 2 caplets of Tylenol PM", the listed dose, stays answerable), and a strength in milligrams is
 * not a count ("took 20 mg of her water pill" reads "mg", not a medicine).
 */
function overdoseOfAMedicine(t: string, MED: string): boolean {
  const COUNT =
    "(?:(?:[2-3]|two|three) of |(?:[4-9]|[1-9]\\d+|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|a handful|handfuls|several|a bunch|a whole (?:bunch|lot|handful))\\b (?:of )?)";
  const prefixes = [
    `${TOOK} ${COUNT}${POSS}`,
    `${TOOK} all (?:of )?${POSS}`,
    `${TOOK}\\b[^?.]{0,20}\\b(?:a|the) (?:whole |entire |full )?(?:bottle|pack|packet|box|strip|blister pack) of ${POSS}`,
    `${TOOK} (?:an? |one )?(?:extra|another|more|additional|a second|second) (?:of )?${POSS}`,
    `\\b(?:took|taken|swallowed|had|given|gave)\\b[^?.]{0,30}\\btoo many (?:of )?${POSS}`,
  ];
  const listed = new RegExp(`^${MED}\\b`);
  return prefixes.some((p) => wordsAfter(t, p).some((w) => namesAMedicine(w) || listed.test(w)));
}

/** "Can grandma have another lorazepam tonight?", "could he take an extra Ambien": one more dose of a medicine. */
function anotherDoseOf(t: string, MED: string): boolean {
  const prefix = "\\b(?:can|could|may|should|shall|is it (?:ok|okay|alright|fine) (?:for|to)) (?:[a-z'-]+ ){0,3}?(?:have|get|take|give|use) (?:[a-z'-]+ )?(?:another|an extra|extra|more|one more|a second|a 2nd|an additional) (?:of )?(?:her |his |the |their )?";
  const listed = new RegExp(`^${MED}\\b`);
  return wordsAfter(t, prefix).some((w) => namesAMedicine(w) || listed.test(w));
}

/**
 * The words that make a question a what-if, read after removing an indirect frame: in "Can you check if she skipped
 * any pills this week?" the "if" only introduces a records question, and "can you" / "could you" ask the app, not a
 * hypothetical. "I wonder if she would sleep without her Ativan?" keeps its "would".
 */
const INDIRECT_FRAME =
  /\b(?:tell me|let me know|know|check|see|find out|show me|wondering|wonder|ask(?:ed)?|remember|look up)(?: \w+)? (?:if|whether)\b|\b(?:can|could|would|will) you\b/g;
function asksWhatIf(t: string): boolean {
  return /\b(?:what if|if|would|could|might|what about|how about)\b/.test(t.replace(INDIRECT_FRAME, " "));
}

/**
 * "Would less lorazepam help?", "Would she be better on less lorazepam?", "if she had half the Ativan": an amount
 * word right before a medicine, in a what-if question (asksWhatIf; not "Did she sleep better on less melatonin?").
 * The medicine must follow, so "would more naps help?" and "if she slept fewer hours" stay records questions.
 */
function lessOfAMedicine(t: string, MED: string): boolean {
  if (!asksWhatIf(t)) return false;
  const listed = new RegExp(`^${MED}\\b`);
  const prefix = "\\b(?:less|more|lower|smaller|fewer|half)(?: (?:of|a dose of|the dose of))? (?:the |her |his |their )?";
  return wordsAfter(t, prefix).some((w) => namesAMedicine(w) || listed.test(w));
}

/**
 * "What if she skipped the lorazepam?", "Would she sleep without her Ativan?", "Would she be less dizzy off the
 * lorazepam?", "What if she cut back on lorazepam?", "What if she tapered off lorazepam?", "What if she only took
 * lorazepam on bad nights?": leaving out, cutting down or rationing a medicine, asked as a what-if (asksWhatIf). A
 * named medicine must follow. Not "Did she skip any doses this week?" or "Can you check if she skipped any pills?"
 * (no what-if), and not "Has she been off her feet more?" (no medicine).
 */
function withoutAMedicine(t: string, MED: string): boolean {
  if (!asksWhatIf(t)) return false;
  const listed = new RegExp(`^${MED}\\b`);
  const THE = "(?:the |her |his |their )?";
  const prefixes = [
    `\\b(?:skip|skips|skipped|skipping|stopped|stops|stopping|quit|went off|goes off|came off|comes off|without) ${THE}`,
    `\\boff (?:of )?${THE}`,
    `\\bcut(?:s|ting)? (?:back|down)(?: on)? ${THE}`,
    `\\b(?:taper|wean)\\w*(?: (?:her|him|them))?(?: off)?(?: of)? ${THE}`,
    `\\bonly (?:took|take|takes|taking|gave|give|had|has|have) ${THE}`,
  ];
  return prefixes.some((prefix) => wordsAfter(t, prefix).some((w) => namesAMedicine(w) || listed.test(w)));
}

/**
 * "Does lorazepam interact with oxycodone?", "Do lorazepam and zolpidem interact?": a combination question that names a
 * medicine (a KB name or brand) that is not on her list. Kinwise only checks the medicines on the list, so a records
 * answer would read as if the new medicine had been checked; the question goes to her pharmacist instead. The
 * list's own names (and generic words) are removed first, so "Do lorazepam and amlodipine interact?" stays answered.
 */
function combinesAnUnlistedMedicine(t: string, MED: string): boolean {
  if (!INTERACTION_RE.test(t) && !TOGETHER_RE.test(t)) return false;
  return namesADrug(t.replace(new RegExp(`\\b${MED}\\b`, "g"), " "));
}

/** Words after a condition that make it a reference question ("Is the dementia warning on the Beers list?"). */
const REFERENCE_WORDS = "(?:warnings?|rules?|criteri\\w*|lists?|entr(?:y|ies)|sections?|tables?|flags?|prompts?|medicines?|medications?|drugs?|pills?)";
/** Conditions a diagnosis question names, and the verbs that tie them to a person ("does she have", "is he getting"). */
const CONDITION = "(?:dementia|alzheimer\\w*|parkinson\\w*|stroke|mini[- ]stroke|tia|uti|infection|depression|delirium|vertigo|cancer|tumou?r|neuropathy|hypotension|low blood pressure|heart (?:problem|failure|disease|condition)|kidney (?:problem|failure|disease)|seizure disorder|condition|disease|illness)";
const DIAGNOSIS_VERB = "(?:have|has|had|be|getting|developing|showing signs of|a sign of|signs of|symptoms? of)";
/** CONDITION without the generic words ("Is her condition stable?" is not a symptom offered as a diagnosis). */
const NAMED_CONDITION = CONDITION.replace("|condition|disease|illness)", ")");
/** "for people with dementia", "patients who have Parkinson's": a reference (Beers) question about a group, not her. */
const ABOUT_A_GROUP = /\b(?:people|patients|someone|anyone|adults|older adults|seniors|the elderly|those|residents)(?: who (?:have|has|had)| with| living with)\b/;
const DIAGNOSIS_ANY_SUBJECT = new RegExp(`\\b(?:does|do|could|might|may|is|has|can) ([a-z'-]+)\\b[^?]*\\b${DIAGNOSIS_VERB}\\b[^?]*\\b${CONDITION}\\b`);

/**
 * "Does grandpa have dementia?", "Is Robert getting Parkinson's?": any one-word subject, so a name the person slot
 * doesn't know is caught. Not when the subject is a medicine or the person asking ("Does lorazepam have a Beers
 * warning for people with dementia?", "can you…") or the condition is about a group: those are reference questions.
 */
function asksForADiagnosis(t: string): boolean {
  const m = DIAGNOSIS_ANY_SUBJECT.exec(t);
  if (!m || ABOUT_A_GROUP.test(t)) return false;
  // A determiner, possessive or quantifier is not the person ("Does the Beers list have anything about kidney
  // disease?", "Does her list have…", "Do the notes have…"); "the patient", "it", "this" stay with the PERSON rule.
  if (/^(?:the|a|an|her|his|their|my|our|your|its|any|some|every|each|all|no|there|you|u|i|we|people|patients|anyone|someone)$/.test(m[1])) return false;
  return !namesAMedicine(m[1]);
}

/**
 * Do the 1–2 words start with a medicine? The first word names one (a KB name or brand, or a word like "pill"), or
 * the words start with a name on her list (so a two-word name the reference set doesn't know, "valerian root", counts).
 */
function startsWithAMedicine(words: string, MED: string): boolean {
  return namesAMedicine(words.trim().split(" ")[0]) || new RegExp(`^${MED}\\b`).test(words);
}

/**
 * "What's the most Ativan she can take?", "the max Tylenol PM she can have", "Is there a limit on her Tylenol?",
 * "How many Tylenol PM is she allowed?": the largest amount of a medicine is for her prescriber or pharmacist to give.
 * Four shapes, checked in order:
 *   1. "max" / "maximum" straight before a medicine ("max gabapentin for nana?"): always a limit question.
 *   2. "most" / "highest" straight before a medicine, with a can / should / allowed in the question ("the most Ativan
 *      she has had" asks the records).
 *   3. "limit" / "max" / "cap" + on / for / to / of + a medicine ("Is there a maximum for her Ativan?", "is there a max
 *      on her water pill").
 *   4. "most" / "max" / "highest" + a modal + take / have / get / go, with a medicine anywhere in the question
 *      ("whats the most she can take of the lorazepam", "what's the highest she can go on lasix").
 *   5. "most" / "max" / "highest" straight before the person, then a modal and take / have / be given, with no
 *      medicine needed ("what's the most she can take?", "whats the maximum she can have"). The person must come right
 *      after the amount word, so "the most falls she can have" and "what's the most she can walk in a day" stay answered.
 *   6. "how much / how many is she allowed to take / to have" ("how many is she allowed to take"), no medicine needed.
 *   7. A medicine named, and the question ends "is the (upper / daily) limit / max" ("how many mg of furosemide is the
 *      limit").
 * Otherwise, without a medicine it stays a records question: "What's the most recent fall?", "Which day was she most
 * dizzy?", "What's the max number of falls in a week?".
 */
function asksForADoseLimit(t: string, MED: string, PERSON: string): boolean {
  const amountOf = "(?: (?:amount|number|dose|dosage) of)? (?:the |her |his |their )?";
  // 1. "max Tylenol PM"
  if (wordsAfter(t, `\\b(?:max|maximum)${amountOf}`).some((w) => startsWithAMedicine(w, MED))) return true;
  // 2. "the most Ativan she can take"
  const most = wordsAfter(t, `\\b(?:most|highest)${amountOf}`);
  if (most.some((w) => startsWithAMedicine(w, MED)) && /\b(?:can|could|should|may|might|allowed|ok|okay|alright|all right|fine|able to)\b/.test(t)) return true;
  // 3. "a (daily) limit on / a max for / a cap on her Tylenol": any upper amount of a medicine.
  if (wordsAfter(t, "\\b(?:upper limit|limit|max(?:imum)?|cap) (?:on|for|to|of) (?:how (?:much|many) )?(?:the |her |his |their )?").some((w) => startsWithAMedicine(w, MED))) return true;
  // 4. "the most she can take of the lorazepam": the medicine comes after the modal, so look for it anywhere.
  const mostSheCan = /\b(?:most|max(?:imum)?|highest)\b (?:[a-z'-]+ ){0,2}?(?:can|could|should|may|is allowed to) (?:take|have|get|go)\b/;
  if (mostSheCan.test(t) && namesAMedicineOrListed(t, MED)) return true;
  // 5. "the most she can take": the person straight after the amount word, then taking (no medicine needed).
  if (new RegExp(`\\b(?:most|max|maximum|highest) (?:${PERSON}) (?:can|could|should|may|is allowed to) (?:take|have|be given)\\b`).test(t)) return true;
  // 6. "how many is she allowed to take".
  if (new RegExp(`\\bhow (?:much|many) (?:is|are) (?:${PERSON}) allowed to (?:take|have)\\b`).test(t)) return true;
  // 7. "how many mg of furosemide is the limit": the limit word last, after the medicine.
  if (/\b(?:is|'s) the (?:upper |daily )?(?:limit|max(?:imum)?)\s*[?.!]*$/.test(t) && namesAMedicineOrListed(t, MED)) return true;
  // "How many Tylenol PM is she allowed?", "how much Tylenol PM is ok for grandma": an amount of a medicine judged
  // allowed. ("How much Tylenol PM is she taking?" asks the list and stays answered.)
  return /\bhow (?:much|many)\b[^?]*\b(?:allowed|ok|okay|alright|all right|fine)\b/.test(t) && (namesAMedicine(t) || new RegExp(`\\b${MED}\\b`).test(t));
}

/**
 * "Can she have more than 2 Tylenol PM?", "can my wife have more than one xanax": more than an amount of a medicine is
 * a dose question. A medicine must be named, so "can she have more than one visitor?" stays a records question.
 */
function asksForMoreThanAnAmount(t: string, MED: string): boolean {
  const moreThan = /\b(?:can|could|may|should|is it ok for) (?:[a-z'-]+ ){1,2}?(?:have|take|get|be given) more than (?:a |one|two|\d+)\b/;
  return moreThan.test(t) && namesAMedicineOrListed(t, MED);
}

/** A medicine anywhere in the question: a KB name or brand, a generic word like "pill", or a name on her list. */
function namesAMedicineOrListed(t: string, MED: string): boolean {
  return namesAMedicine(t) || new RegExp(`\\b${MED}\\b`).test(t);
}

/**
 * "How many can she take?", "how much Ativan can mom have": an amount with a modal, about taking or a medicine. A
 * question with neither stays a records question ("How many days could she not walk far?").
 */
function asksHowMuchSheCanTake(t: string, MED: string): boolean {
  if (!/\bhow (?:much|many)\b[^?]*\b(?:should|can|could|may|is it ok)\b/.test(t)) return false;
  return /\b(?:take|takes|taking|have|has|give|given|get|use|dose|doses|dosage)\b/.test(t) || namesAMedicineOrListed(t, MED);
}

/**
 * Words that judge whether something suits her ("Is lorazepam okay for her?", "is lorazepam a good idea for her").
 * "the right medicine for her" is the treatment rule's ("is it the right medicine").
 */
const SUITS = "(?:ok|okay|alright|all right|fine|good|a good idea|a good choice|a good fit|(?:the )?right fit|wise|right choice|appropriate|suitable)";

/**
 * "Is lorazepam okay for her?", "is Ativan fine for Mom", "Is zolpidem good for Robert?": whether a medicine suits
 * the person is a judgment for her clinician. Four shapes: any subject with the person slot after "for" (so a
 * misspelt medicine, "is lorazapam okay for her", is still caught); a medicine as the subject with any name after
 * "for" (a name the person slot doesn't know); a typed question that starts with the medicine and has no verb
 * ("ativan ok for mom?"); and a medicine as the subject followed by "to give / to take" ("is lorazepam okay to give
 * her"). Not "for her doctor" or "for the visit": those are about the app.
 */
function asksIfSomethingSuitsHer(t: string, MED: string, PERSON: string): boolean {
  const NOT_THE_PERSON = "(?!'s|\\s+(?:doctor|pharmacist|nurse|gp|clinician|prescriber|visit|appointment|records?|notes?|chart|file|list|brief|timeline)\\b)";
  const forPerson = new RegExp(`\\b(?:is|are|would|will) (?:[a-z'+-]+ ){1,3}?(?:be )?(?:still |really |even )?${SUITS} for (?:${PERSON})\\b${NOT_THE_PERSON}`);
  if (forPerson.test(t)) return true;
  const medFirst = new RegExp(`\\b(?:is|are|would|will) (?:the |her |his |their |my |this |that )?((?:[a-z'+-]+ ){0,2}?[a-z'+-]+) (?:be )?(?:still |really |even )?${SUITS} for [a-z'-]+\\b${NOT_THE_PERSON}`, "g");
  if ([...t.matchAll(medFirst)].some((m) => startsWithAMedicine(m[1], MED))) return true;
  // "ativan ok for mom?": the medicine first, no "is".
  const noVerb = new RegExp(`^(?:the |her |his )?((?:[a-z'+-]+ ){0,2}?[a-z'+-]+) (?:still )?${SUITS} for (?:${PERSON}|[a-z'-]+)\\b${NOT_THE_PERSON}`);
  const m = noVerb.exec(t);
  if (m && startsWithAMedicine(m[1], MED)) return true;
  // "is lorazepam okay to give her", "is ativan fine to take at night": a medicine as the subject, then "to give / take".
  const toGive = new RegExp(`\\b(?:is|are) (?:the |her |his |their |my |this |that )?((?:[a-z'+-]+ ){0,2}?[a-z'+-]+) (?:still |really )?${SUITS} to (?:give|take)\\b`, "g");
  return [...t.matchAll(toGive)].some((x) => startsWithAMedicine(x[1], MED));
}

/** Wordings of "a fall risk" in a which-medicines question: "risky for falls", "increase her risk of falling", "put her at risk for falls". */
const FALL_RISK_WORDS =
  "(?:risky (?:for|with) (?:falls?|falling)" +
  "|(?:raise|raises|increase|increases|add to|adds to) (?:her |his |their |the )?(?:risk|chances?) of (?:falls?|falling)" +
  "|puts? (?:her|him|them) at (?:a )?(?:higher )?risk (?:of|for) (?:falls?|falling))";

/**
 * "Which of her meds are risky for falls?", "Are any of her medications risky for falling?", "Which medicines increase
 * her risk of falling?", "What meds put her at risk for falls?": a question about which listed medicines carry a
 * published fall-risk flag. It is answered from the review findings (the fall_risk intent), not judged or predicted.
 * "Is lorazepam risky for her?" and "Is lorazepam raising her risk of falls?" name one medicine and stay redirected.
 */
function asksWhichMedicinesAreFallRisks(t: string): boolean {
  return new RegExp(`^(?:which|what|are any|is any|do any|does any|any)\\b[^?]*\\b(?:medicines?|medications?|meds|pills|drugs)\\b[^?]*\\b${FALL_RISK_WORDS}\\b`).test(t);
}

/**
 * "Which pill to drop?", "which med to cut", "what pill can I drop": choosing which medicine to leave out is a
 * prescriber decision. The words between "which" and the verb must name a medicine (or "one"), so "What can I do to
 * stop her falling?" is left to the other forms and "Which medicines did she stop?" (no "to" / modal) stays answered.
 * A taking verb with a subject in between makes it a question about what a medicine is for: "Which medicine does she
 * take to stop the swelling?", "What pill does she take to stop her bladder leaking?" stay answered.
 */
function choosesAMedicineToDrop(t: string, MED: string): boolean {
  const m =
    /\b(?:which|what)\b([^?]{0,40}?)\b(?:to|should|shall|can|could|would|might|must|do)\b (?:[a-z'-]+ ){0,2}?(?:drop|cut|stop|skip|remove|ditch|get rid of|come off|go off|eliminate|leave out|take away)\b/.exec(t);
  if (!m) return false;
  const takesItFor = /\b(?:does|did|do|is|was) (?:[a-z'-]+ )?(?:take|takes|taking|use|uses|on)\b|\b(?:she|he|they) (?:takes?|uses?)\b/;
  if (takesItFor.test(m[1])) return false;
  return /\b(?:one|ones)\b/.test(m[1]) || namesAMedicine(m[1]) || new RegExp(`\\b${MED}\\b`).test(m[1]);
}

/**
 * "She stopped taking the lorazepam yesterday", "she ran out of her water pill", "Mom quit taking her Ativan", "we
 * stopped giving her the Tylenol PM", "she's no longer taking the Ativan", "she doesn't take the Ativan anymore": a
 * statement that a medicine was stopped or has run out. It gets the treatment redirect with the app's static
 * "don't stop or change any medicine" line. A medicine must follow ("She stopped going on her walks" and "she ran out
 * of energy" stay diary questions), and questions about the records stay answered: "When did she stop lorazepam?",
 * "Did she stop the Tylenol PM?", "Can you tell me if she stopped the lorazepam?", "How many falls since she stopped it?".
 * Also "she's been off the lorazepam", "she's been skipping her lorazepam", "she hasn't taken her lorazepam in 3 days",
 * "she refuses to take her lorazepam now" (each with a medicine after it: "she's off her feet", "she hasn't had a fall",
 * "she's been skipping meals" and "she refuses to take a walk" stay answered).
 * A stop made by a clinician ("the doctor stopped her lorazepam last week, have the falls gone down?") is not a
 * family's change, so it stays a records question.
 */
function saysAMedicineWasStopped(t: string, MED: string, PERSON: string): boolean {
  // Statements only: a question, or a stop inside an if / since / after clause, asks the records.
  if (/^(?:did|does|do|has|have|had|was|were|is|are|when|which|what|why|how|can|could|would|will|tell|show|list)\b/.test(t)) return false;
  if (/\b(?:if|whether|since|after|before|until|when|once)\b(?: [a-z'-]+){0,3} (?:stopp?ed|quit|ran|run|went|came|gave|no longer)\b/.test(t)) return false;
  // A clinician as the one who stopped it: "her doctor stopped the ativan, how many falls since then?".
  const CLINICIAN_STOPPED = /\b(?:doctor|dr|prescriber|gp|nurse|pharmacist|hospital|specialist|cardiologist)\b(?: [a-z'.-]+){0,2} (?:stopp?ed|took (?:her|him|them) off|discontinued|quit)\b/;
  if (CLINICIAN_STOPPED.test(t)) return false;
  // "stopped taking the …", "ran outta her …", "stopped giving mom her …" (the person she was given it to, then the
  // medicine), "she's been off the lorazepam", "she's off her lorazepam now".
  const THE = "(?:the |her |his |their |my |all (?:of )?(?:her |his |the )?)?";
  const stopped = `\\b(?:stopp?ed|quit|ran out of|run out of|out of|ran outta|run outta|outta|went off|came off|gave up|been off|is off|'s off)(?: (?:taking|using|giving|on)(?: (?:${PERSON}))?)? (?:of )?${THE}`;
  if (wordsAfter(t, stopped).some((w) => startsWithAMedicine(w, MED))) return true;
  // Not being taken now, with the medicine after: "she's been skipping her lorazepam", "she hasn't taken her
  // lorazepam in 3 days", "she hasn't had her water pill since tuesday", "she refuses to take her lorazepam now".
  const NOT_TAKING = [
    "\\b(?:been|keeps?|keep on|is) skipping ",
    "\\b(?:hasn'?t|has not|haven'?t|have not)(?: been)? (?:taken|had|taking|having) ",
    "\\b(?:refuses?|refused|refusing|won'?t|will not) (?:to )?(?:take|have) ",
  ];
  if (NOT_TAKING.some((lead) => wordsAfter(t, `${lead}${THE}`).some((w) => startsWithAMedicine(w, MED)))) return true;
  if (/\b(?:stopp?ed|quit) (?:taking|using|giving) (?:it|them)\b/.test(t)) return true;
  // "she's no longer taking the Ativan", "not anymore on her water pill".
  if (wordsAfter(t, `\\b(?:no longer|not anymore) (?:taking|on|using|giving)(?: (?:${PERSON}))? ${THE}`).some((w) => startsWithAMedicine(w, MED))) return true;
  // "she doesn't take the Ativan anymore", "he won't take his pills any more".
  return /\b(?:doesn'?t|does not|won'?t|isn'?t) (?:take|taking)\b[^?]*\b(?:anymore|any more)\b/.test(t) && namesAMedicineOrListed(t, MED);
}

/**
 * Words for confusion that came on suddenly (the sudden-confusion emergency forms). Talking gibberish and seeing things
 * that are not there (hallucinations) count too: like "not making sense", they are signs of acute confusion.
 */
const CONFUSED =
  "(?:confus\\w*|disorient\\w*|delirious|muddled|incoherent|out of it|(?:isn'?t|is not|not) (?:herself|himself|themselves)|gibberish|talking nonsense|hallucinat\\w*|seeing things)";
/**
 * "suddenly", "all of a sudden", "out of nowhere". Common misspellings ("sudenly", "suddently", "suddnly", "all of a
 * suden") are included on purpose: a missed emergency is worse than a false alarm.
 */
const SUDDEN = "(?:sudd?e?n(?:t?ly)?|all of a sudd?e?n|out of nowhere|out of the blue)";
/** Earlier today: "confused since this morning" or "since 2pm" is happening now, not a diary question. */
const SINCE_EARLIER_TODAY =
  "since (?:this (?:morning|afternoon|evening)|today|earlier(?: today)?|last night|lunch(?:time)?|breakfast|dinner|(?:she|he|they) (?:woke|got) up|waking up|(?:an?|one|two|a few|\\d+) hours? ago|an hour|\\d{1,2}(?::\\d\\d)? ?(?:am|pm))";
/** A question that opens like a look-back at the records ("Did the confusion start suddenly after lorazepam?"). */
const RECORDS_FRAME = /^(?:did|was|were|how many|how often|when|which|what day|show|list)\b/;
/** Words that put a question in the present, so even a records-style opening is about now ("Was she suddenly confused this morning?"). */
const NOW_WORDS = /\b(?:today|now|right now|tonight|this (?:morning|afternoon|evening))\b/;
/** Words that put a question in the past ("how confused was she since lunch yesterday"): a look-back at the records. */
const PAST_WORDS = /\b(?:yesterday|last (?:week|month|year)|\d+ (?:days?|weeks?|months?) ago|(?:a few|two|three|several) (?:days|weeks|months) ago|on the days|in the records)\b/;

/**
 * A sign of confusion described as happening now. A records-style question ("was the confusion sudden or gradual in
 * the records?") or one set in the past ("how confused was she since lunch yesterday") with no present-time word is a
 * records question, not an emergency.
 */
function happeningNow(t: string, sign: RegExp): boolean {
  if (!sign.test(t)) return false;
  const looksBack = RECORDS_FRAME.test(t) || PAST_WORDS.test(t);
  return !(looksBack && !NOW_WORDS.test(t));
}
const SUDDEN_CONFUSION = new RegExp(`\\b${SUDDEN}\\b[^?.]*\\b${CONFUSED}|\\b${CONFUSED}[^?.]*\\b${SUDDEN}\\b`);
const WOKE_UP_CONFUSED = new RegExp(`\\b(?:woke|wakes|waking) up\\b[^?.]{0,20}\\b${CONFUSED}`);
/** "confused since this morning", and the other word order, "since lunch she has been really confused". */
const CONFUSED_SINCE_EARLIER = new RegExp(`\\b${CONFUSED}\\b[^?.]{0,30}\\b${SINCE_EARLIER_TODAY}\\b|\\b${SINCE_EARLIER_TODAY}\\b[^?.]{0,30}\\b${CONFUSED}`);
/** "she became confused an hour ago". */
const CONFUSED_HOURS_AGO = new RegExp(`\\b${CONFUSED}\\b[^?.]{0,30}\\b(?:an?|one|two|a few|\\d+) hours? ago\\b`);
/**
 * Confusion that started today, or is worse than her usual: "she got confused this morning", "she became confused this
 * afternoon", "she's confused this morning, worse than usual". New or worse confusion in an older adult is the
 * defining sign of delirium.
 */
const CONFUSION_NEW_TODAY = new RegExp(
  `\\b(?:got|gets|getting|became|become|becoming|went|turned|has become)\\b (?:(?:very|really|so|more|quite|a bit|a little|all) )*${CONFUSED}[^?.]{0,30}\\b(?:today|now|right now|tonight|this (?:morning|afternoon|evening))\\b` +
    `|\\b${CONFUSED}\\b[^?]{0,40}\\b(?:worse than usual|more than usual|not like (?:her|him|them)(?:self|selves)?)\\b` +
    `|\\b(?:more|worse) ${CONFUSED} than usual\\b`,
);

/**
 * The scope table: ordered categories, each with named, ordered forms. The first category with a matching form wins,
 * and within it the first matching form names the route (route.rule). Each form is tested against lower-cased,
 * punctuation-normalised text.
 *
 * Precedence (top to bottom): emergency → safety → dose → treatment → diagnosis → cause → urgency → prediction.
 * The emergency line runs first and wins over everything; every redirect runs before any record intent
 * (routeQuestion is called before retrieveForQuestion/detectIntent), so a diagnosis, dose or cause question is never
 * answered with records framed as an answer. Each form has a routing test in qa.test.ts.
 *
 * Built per profile (routeQuestion caches the last set): PERSON is the person slot (generic words such as "she",
 * "grandpa", "my mother" plus the profile's names) and MED the medicine slot (generic words such as "pills" plus the
 * list's names and brands). Where a form is about changing a treatment, a cause or a prediction, the verb carries
 * the meaning and the slot accepts any word, so a name or medicine the slots don't know is still caught.
 */
const SCOPE_RULES = (PERSON: string, MED: string): ScopeRule[] => [
  {
    // Deliberately broad: a false alarm costs one tap; a missed emergency is never acceptable.
    category: "emergency",
    reason: "This sounds like it could be an emergency.",
    forms: [
      rx(
        "emergency words (911, not breathing, chest pain, stroke, overdose, seizure, poison…)",
        "\\b(?:911|emergency|ambulance|paramedics?|unconscious|unresponsive|not breathing|can'?t breathe|cannot breathe|trouble breathing|struggling to breathe|gasping|chest pains?|heart attack|stroke|mini[- ]?stroke|tia|droop\\w*|slurr\\w*|overdos\\w*|swallowed (?:a|the|too|all|her|his)|seizures?|having a fit|convuls\\w*|passed out|fainted|collaps\\w*|hit (?:her|his|my) head|bleeding (?:a lot|heavily|badly|won'?t stop)|won'?t wake|can'?t wake|(?:hard|difficult) to (?:wake|rouse)|barely (?:wake\\w*|rous\\w*)|(?:can'?t|won'?t|cannot) (?:be )?rous\\w*|not rousable|unrousable|can'?t get up|cannot get up|can'?t move|cannot move|unable to move|suicid\\w*|kill (?:her|him|my)self|poison\\w*|choking|anaphyla\\w*|throat (?:is )?(?:swelling|closing)|(?:vomiting|throwing up|coughing up) blood)\\b",
      ),
      // "her lips are blue", "face looks grey".
      rx("colour change", "\\b(?:lips?|face|skin|fingers?) (?:are |is |look\\w* |turn\\w* |went |gone |going )+(?:blue|grey|gray|purple|white)\\b"),
      // "not making sense", "doesn't know where she is".
      rx("acute confusion: not making sense", "\\bnot making (?:any )?sense\\b|\\b(?:doesn'?t|does not|didn'?t|did not|can'?t) (?:know|recogni[sz]e) (?:where|who|what day|me|us)\\b"),
      // "Mom is suddenly very confused today", "all of a sudden she's disoriented" (both word orders). Not a look-back
      // with no present-time word: "Did the confusion start suddenly after lorazepam?" asks the records.
      { name: "sudden confusion", test: (t) => happeningNow(t, SUDDEN_CONFUSION) },
      // "confused since this morning", "disoriented since she woke up", "confused since 2pm", "since lunch she has been
      // really confused" (not "confused since lorazepam started", nor a look-back: "was she more confused since
      // breakfast on the days she took Tylenol PM").
      { name: "confusion since earlier today", test: (t) => happeningNow(t, CONFUSED_SINCE_EARLIER) },
      // "she woke up very confused this morning" (not "how often was she waking up confused?").
      { name: "woke up confused", test: (t) => happeningNow(t, WOKE_UP_CONFUSED) },
      // "she became confused an hour ago".
      { name: "confused hours ago", test: (t) => happeningNow(t, CONFUSED_HOURS_AGO) },
      // "she got confused this morning", "she's confused this morning, worse than usual" (not "was she more confused
      // than usual last week" or "how often did she get confused").
      { name: "confusion new today or worse than usual", test: (t) => happeningNow(t, CONFUSION_NEW_TODAY) },
      // Stroke signs: "weak on one side", "one side of her face", "she suddenly can't stand up".
      rx(
        "sudden weakness or one-sided symptoms",
        `\\b(?:weak|weakness|numb|numbness|tingling)\\b[^?.]{0,20}\\bone side\\b|\\bone side of (?:her|his|their) (?:face|body)\\b|\\b${SUDDEN}\\b[^?.]{0,20}\\b(?:can'?t|cannot|unable to) (?:stand|walk|talk|speak|see|lift)\\b`,
      ),
      rx(
        "medicine taken by mistake or all at once",
        "\\b(?:took|taken|take|swallowed|had|given|gave|ate)\\b[^?]*\\b(?:by mistake|by accident|accidentally|all at once|at once|at the same time|double dose|the whole (?:bottle|pack|box|week))\\b",
      ),
      rx("several pills or doses taken", "\\b(?:took|taken|swallowed|had|given) (?:two|2|three|3|four|4|double|an extra|extra|all|her whole|his whole|the whole|a week'?s?)\\b[^?]*\\b(?:pills?|tablets?|doses?|meds|medicines?|bottle)\\b"),
      // "she accidentally took her pills", "mistakenly gave him". (Not "accidentally had a fall": a fall on its own is
      // a records question.)
      rx(
        "medicine taken by mistake, adverb first",
        "\\b(?:accidentally|by mistake|by accident|mistakenly)\\b[^?.]{0,20}\\b(?:took|taken|take|swallowed|had|gave|given|ate)\\b(?! (?:a |another )?(?:fall|near-fall|trip|slip|tumble)s?\\b)",
      ),
      // "Robert took 10 of his sleeping pills", "swallowed a handful of tablets". A small count needs "of" ("took 2 of
      // her pills"); "took 2 caplets of Tylenol PM", the listed dose, and a strength in milligrams ("took 20 mg of her
      // water pill") stay answerable.
      rx(
        "possible overdose: a count of pills",
        `\\b(?:took|taken|swallowed|ate|eaten|given|gave)(?: (?:him|her|them|me))? (?:(?:[2-3]|two|three) of|(?:[4-9]|[1-9]\\d+|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|a handful|handfuls|several|a bunch|a whole (?:bunch|lot|handful))\\b(?!\\s?(?:mg|mcg|milligrams?|micrograms?|g|ml|units?|iu)\\b)(?: of)?)[^?.]{0,40}?\\b(?:${MED}|pills?|tablets?|caplets?|capsules?|gummies|meds|medicines?|medications?|doses?)\\b`,
      ),
      // "has taken too many pills", "took too many of her lorazepam"; not "had too many falls" or "took too many naps".
      rx(
        "possible overdose: too many of a medicine",
        `\\b(?:took|taken|swallowed|had|given|gave)\\b[^?.]{0,30}\\btoo many (?:of )?(?:her |his |my |the |their )?(?:[a-z'-]+ )?(?:${MED}|pills?|tablets?|caplets?|capsules?|gummies|meds|medicines?|medications?|doses?)\\b`,
      ),
      // "took a whole bottle", "he took twice his dose".
      rx("possible overdose: a whole container", "\\b(?:took|taken|swallowed|ate|eaten|had|given|gave)\\b[^?.]{0,20}\\b(?:a|the) (?:whole|entire|full) (?:bottle|pack|packet|box|strip|blister pack)\\b"),
      rx("possible overdose: a multiple of the dose", "\\b(?:took|taken|swallowed|had|given|gave)\\b[^?.]{0,20}\\b(?:twice|double|triple|three times) (?:her|his|my|the|their) (?:usual |normal |regular |prescribed )?(?:dose|dosage|amount)\\b"),
      // "she may have taken too many" with nothing after it.
      rx(
        "possible overdose: too many, nothing after",
        "\\b(?:took|taken|swallowed|given|gave)\\b[^?.]{0,30}\\btoo many(?: of (?:her|his|my|the|their) [a-z'-]+(?: [a-z'-]+)?)?(?: (?:today|tonight|last night|this morning|this evening|yesterday))?\\s*(?:[?.!,]|$)",
      ),
      // "I think she took her lorazepam twice". (Not a schedule: "twice a day", "twice daily", "twice this week".)
      rx(
        "the same medicine taken twice",
        "\\b(?:took|taken|swallowed|had|gave|given)(?: (?:him|her|them|me))? (?:her|his|my|their|the|both|all|its)(?: [a-z'-]+){1,3}? (?:twice|two times)\\b(?! (?:a|per|each|every|in a) (?:day|night|week|month)\\b| (?:this|last|that|in the past) (?:week|month|year)\\b| (?:daily|weekly)\\b)",
      ),
      rx(
        "a double or wrong dose by mistake",
        "\\b(?:double|doubled|extra|second|wrong) (?:doses?|pills?|tablets?|medicines?|medications?)\\b[^?]*\\b(?:by mistake|by accident|accidentally|in error)\\b|\\b(?:by mistake|by accident|accidentally|in error)\\b[^?]*\\b(?:double|doubled|extra|second|wrong) (?:doses?|pills?|tablets?|medicines?|medications?)\\b|\\b(?:doubled|double[- ]dosed)\\b[^?]*\\b(?:by mistake|by accident|accidentally)\\b",
      ),
      // "she fell again just now", "she just collapsed", "really confused right now".
      rx("just fell or collapsed", "\\bjust (?:fell|fallen|collapsed|passed out|fainted|had a fall)\\b"),
      rx("can't stop shaking or vomiting", "\\bcan'?t stop (?:shaking|vomiting|throwing up|bleeding|coughing|twitching)\\b"),
      rx(
        "a symptom happening now",
        `\\b(?:right now|just now|at the moment|tonight|this minute|a (?:minute|moment|few minutes) ago|minutes ago)\\b[^?]*\\b${ACUTE_SYMPTOM}|\\b${ACUTE_SYMPTOM}\\b[^?]*\\b(?:right now|just now|at the moment|tonight|this minute|a (?:minute|moment|few minutes) ago|minutes ago)\\b`,
      ),
      // "She took 8 lorazepam": the medicine named instead of "pills" (any KB medicine, listed or not).
      { name: "possible overdose: a named medicine", test: (t) => overdoseOfAMedicine(t, MED) },
    ],
  },
  {
    category: "safety",
    reason: `Whether a medicine is right for her is a judgment for her clinician; ${PRODUCT_NAME} only shows what was recorded and published criteria.`,
    forms: [
      rx("safe, dangerous, harmful, bad for her", `\\b(?:safe|safer|safely|safest|unsafe|dangerous|harmful|riskier|overmedicat\\w*|over-medicat\\w*|bad for (?:${PERSON}|me))\\b`),
      // "Is lorazepam risky for her?" (but "Which of her meds are risky for falls?" asks for the fall-risk findings).
      { name: "risky (not which medicines are risky for falls)", test: (t) => /\brisky\b/.test(t) && !asksWhichMedicinesAreFallRisks(t) },
      // "Is lorazepam okay for her?", "is Ativan fine for Mom", "Is zolpidem good for Robert?" (also "Is walking good
      // for her?": any judgment of what suits her goes to her clinician).
      { name: "is something okay for her", test: (t) => asksIfSomethingSuitsHer(t, MED, PERSON) },
      rx("is it okay / a good idea", "\\b(?:is|would) (?:it|that|this) (?:be )?(?:ok|okay|alright|all right|fine|wise|a good idea|smart|better|best)\\b"),
      rx("a better option", "\\bbe better (?:than|for)\\b|\\b(?:a |the )?better (?:option|pill|medicine|medication|drug|choice|alternative|sleeping pill|sleep aid)\\b"),
      rx("worse or better for her", `\\b(?:worse|worst|better|best|gentler|milder|stronger) for (?:${PERSON}|an? |someone|older|elderly|seniors?|the elderly)\\b`),
      rx("which one is worse", "\\bwhich (?:one|of (?:them|these|those|the two|her \\w+)|medicine|med|pill|drug|tablet)s?\\b[^?]*\\b(?:worse|worst|better|best|riskier|safer|more harmful|stronger|gentler)\\b"),
      // "Can she drink wine with lorazepam?"
      rx("alcohol or food with a medicine", "\\b(?:drink|drinking|alcohol|wine|beer|liquor|spirits|whiske?y|grapefruit)\\b[^?]*\\bwith\\b|\\bwith (?:alcohol|wine|beer|a drink|grapefruit)\\b|\\bmix(?:ing|ed)? (?:\\w+ )?with\\b"),
      // "Are lorazepam and amlodipine okay together?": whether a combination is fine is the pharmacist's call.
      rx("okay together", "\\b(?:ok|okay|alright|all right|fine)\\b[^?]*\\b(?:together|with each other|at the same time)\\b|\\b(?:together|at the same time)\\b[^?]*\\b(?:ok|okay|alright|all right|fine)\\b"),
      // "Is X better than Y?" with a medicine on both sides.
      { name: "one medicine better than another", test: comparesMedicines },
      // "Does lorazepam interact with oxycodone?": a combination with a medicine not on her list.
      { name: "a combination with an unlisted medicine", test: (t) => combinesAnUnlistedMedicine(t, MED) },
    ],
  },
  {
    category: "dose",
    reason: "Questions about how much to take need her prescriber or pharmacist.",
    forms: [
      { name: "changing the dose", pattern: /\b(?:increase|decrease|lower|raise|reduce|adjust|change|cut|double|halve|split|crush)\w*\s+(?:the |her |his |a |that |this )?(?:\w+\s+)?(?:dose|dosage|pills?|tablets?|caplets?)\b/ },
      { name: "the right, max or extra dose", pattern: /\b(?:too (?:high|much|strong|low|many)|right|correct|best|max(?:imum)?|extra|another|smaller|bigger|lower|higher) (?:dose|dosage|amount|pill|tablet)\b/ },
      // "How many can she take?" (not "How many days could she not walk far?": no taking verb or medicine).
      { name: "how much should she take", test: (t) => asksHowMuchSheCanTake(t, MED) },
      { name: "what dose should she take", pattern: /\bwhat (?:dose|dosage|amount|strength)\b[^?]*\b(?:should|can|could|may|is best)\b/ },
      { name: "is the dose right", pattern: /\b(?:dose|dosage|amount|strength)\b[^?]*\b(?:right(?! now| away)|correct|appropriate|ok|okay|fine|too (?:high|low|much)|enough)\b|^is (?:her|his|the|this) (?:\w+ )?(?:dose|dosage)\b/ },
      { name: "cutting pills in half", pattern: /\bcut (?:her |his |the )?(?:\w+ )?(?:pills?|tablets?) in half\b/ },
      // "Would it help if she took less lorazepam?", "would it help to give her less?", "what if we gave her half?"
      // (not "if she took more naps", "took half an hour to fall asleep" or "did she have to take more trips to the
      // bathroom?": "to" counts only after help / better / ok / try…). "Should she take less…" is the treatment rule's.
      {
        name: "what if she took less",
        pattern:
          /\b(?:if|what about|how about|(?:help|better|best|ok|okay|good idea|try|wise|safer) to) (?:[a-z'-]+ ){0,2}?(?:took|take|takes|taking|gave|give|giving)(?: (?:her|him|them|me))? (?:a )?(?:less|more|half|fewer|smaller|lower|bigger|higher)\b(?! (?:an? )?(?:naps?|time|hours?|minutes?|sleep|rest|walks?|steps|exercise|water|fluids?|food|meals?|care|interest|notice|part|than|trips?|breaks?|bathroom|toilet|stops?)\b)/,
      },
      // "Is 0.5 mg of lorazepam too much for her age?" (any "too much/strong/high" about a medicine or an amount).
      {
        name: "too much of a medicine",
        test: (t) => /\btoo (?:much|strong|high|many|low|often)\b/.test(t) && (namesAMedicine(t) || /\b\d+(?:\.\d+)? ?(?:mg|mcg|ml)\b|\b(?:mg|mcg|milligrams?|dose|dosage)\b/.test(t)),
      },
      // "Would less lorazepam help?" (an amount word before a named medicine, in a what-if).
      { name: "less of a medicine, as a what-if", test: (t) => lessOfAMedicine(t, MED) },
      // "What's the most Ativan she can take?", "Is there a limit on her Tylenol?", "How many Tylenol PM is she allowed?".
      { name: "the most she can take", test: (t) => asksForADoseLimit(t, MED, PERSON) },
      // "Can she have more than 2 Tylenol PM?".
      { name: "more than an amount of a medicine", test: (t) => asksForMoreThanAnAmount(t, MED) },
    ],
  },
  {
    category: "treatment",
    reason: "Starting, stopping or changing a medicine is a decision for her prescriber.",
    forms: [
      // First, so its reason line wins: "She stopped taking the lorazepam yesterday", "she ran out of her water pill".
      {
        name: "a medicine stopped or run out (statement)",
        test: (t) => saysAMedicineWasStopped(t, MED, PERSON),
        reason: `Starting, stopping or changing a medicine is a decision for her prescriber. ${SAFETY_LINE}`,
      },
      rx("should she stop / take / switch", `\\b(?:should|shall|can|could|may|might|must|ought to|need(?:s)? to|have to|has to|do(?:es)? (?:${PERSON}) (?:still )?need to)\\s+(?:${PERSON})\\s+(?:still |just |now |really |also |maybe |try to |not )*${ACTION}\\b`),
      rx("should it be stopped", `\\bshould (?:${PERSON}|it|this|that|\\w+) (?:be )?(?:stopped|started|changed|switched|reduced|lowered|increased|replaced|tapered|discontinued)\\b`),
      // Any subject, any medicine: "Should John stop zolpidem?", "Could grandpa come off the valerian root?", "Is it
      // ok for Dad to skip it?". The modal + change verb carries the meaning; up to 3 words between them.
      rx(
        "any subject, a modal and a change verb",
        `\\b(?:should|shall|can|could|may|might|must|ought to|need(?:s)? to|have to|has to|is it (?:ok|okay|alright|all right|fine) (?:for|to)|would it be (?:ok|okay|alright|fine) (?:for|to))\\s+(?:[a-z'.-]+\\s+){0,3}?(?:still |just |now |really |also |maybe |try to |not )*(?:stop|start|quit|cut|cut back on|lower|reduce|increase|double|halve|skip|pause|hold|come off|get off|switch|swap|discontinue|taper|wean)\\b(?! (?:dates?|times?|day)\\b)`,
      ),
      // "Should the zolpidem be stopped?", "Can her water pill be lowered?" with a longer subject.
      rx("can it be lowered", `\\b(?:should|can|could|must|ought to|needs? to)\\b[^?]{0,40}?\\bbe (?:stopped|started|changed|switched|reduced|lowered|increased|replaced|tapered|discontinued|cut|halved|doubled|paused|skipped)\\b`),
      // "Does she still need furosemide?" (not "Did she need to take more breaks on her walk?": a need for rest or help
      // is a diary question).
      rx(
        "does she still need it",
        `\\b(?:does|do|did) (?:${PERSON}) (?:still |really )?need\\b(?! (?:to )?(?:take |have |get |go |use )?(?:more |a |an |any |extra |some )?(?:breaks?|rests?|naps?|help|trips?|walks?|sleep|time|water|fluids?|food|meals?|assistance|support)\\b)`,
      ),
      rx("still needed", `\\bstill (?:need|needed|necessary)\\b`),
      rx("what should she do", `\\bwhat (?:should|can|could|do|shall|would) (?:${PERSON}) (?:do|give|try|use|take|change)\\b`),
      rx("what to do", `\\bwhat (?:to do|can be done|should be done)\\b`),
      rx("an alternative or a switch", `\\b(?:instead of|alternatives?|replacement for|substitute|switch(?:ing)? (?:her |him )?to|swap(?:ping)? (?:it|her|him)? ?for|other options?|another option|different (?:medicine|medication|pill|drug))\\b`),
      rx("should I stop or give", `\\b(?:should|can|could) (?:i|we) (?:stop|start|give|switch|change|cut|lower|raise|try|skip|hold)\\b`),
      rx("how do I taper or treat", `\\bhow (?:do|can|should) (?:i|we) (?:stop|taper|wean|get her off|switch|treat|fix|help her sleep|manage)\\b`),
      rx("a treatment for", `\\b(?:treat|treatment|cure|remedy|therapy) (?:for|of)\\b|\\bhow (?:to|do (?:i|we)) treat\\b`),
      rx("recommend or advise", `\\b(?:recommend|suggest|advise|advice)\\b`),
      // "Is Ativan working?", "is the zolpidem still helping": whether a medicine works is the prescriber's call.
      rx(
        "is the medicine working",
        `\\bis (?:it|this|that|(?:the |her |his |my |this |that )?[a-z'-]+(?: [a-z'-]+)?) (?:still |really |even )?(?:working|helping|effective|doing (?:her |him |them )?(?:anything|any good|its job)|the right (?:medicine|medication|choice|one))\\b`,
      ),
      // "tell me if I should take her off lorazepam", "should she still take it" with the subject first.
      rx("subject first: she should", `\\b(?:i|we|she|he|you) should\\b[^?]*\\b${ACTION}\\b`),
      rx("take her off", `\\b(?:take|taking|took|get|getting|got) (?:${PERSON}) off\\b`),
      rx("which should go first", `\\b(?:should|could|can|would|must) (?:\\w+ )?(?:go|come off|be stopped|be dropped|be cut) first\\b|\\bgo first\\b`),
      rx("what would you do / tapering", `\\bwhat would you do\\b|\\bif you were me\\b|\\bin my (?:shoes|place)\\b|\\b(?:taper|tapering|wean|weaning)\\b`),
      rx("cut some of her medicines", `\\b(?:cut|drop|get rid of|ditch) (?:out )?(?:one|some|any|which|a few) (?:of )?(?:her |his |the )?(?:medicines?|medications?|meds|pills|drugs)\\b`),
      // "Which pill to drop?", "which med to cut", "what pill can I drop".
      { name: "which medicine to drop", test: (t) => choosesAMedicineToDrop(t, MED) },
      // "Is lorazepam right for her?", "is the Ativan the right one": whether a medicine suits her (any word).
      rx("is it the right medicine", `\\bis (?:the |her |his |their |my )?(?!(?:it|this|that|there)\\b)[a-z'+-]+(?: [a-z'+-]+)? (?:the )?right (?:for|medicine|medication|one|choice|pill)\\b`),
      // "Do we keep giving the Ativan?", "should I continue giving it", "Should Bob keep taking zolpidem?".
      rx("do we keep giving it", `\\b(?:do|should|shall|can) (?:we|i) (?:keep|continue|stop) (?:giving|taking|using)\\b`),
      rx("should she keep taking it", `\\b(?:should|shall|can|could|may|must|need(?:s)? to) (?:[a-z'.-]+\\s+){1,3}?(?:keep (?:taking|giving|using)|continue (?:taking|giving|using|with|on)|stay on)\\b`),
      // "Take John off zolpidem?" (any name in the person slot).
      { name: "take someone off a medicine", test: takesOffAMedicine },
      // "Can grandma have another lorazepam tonight?" (an extra dose of a named medicine).
      { name: "another dose of a medicine", test: (t) => anotherDoseOf(t, MED) },
      // "What if she skipped the lorazepam?" (leaving a named medicine out, as a what-if).
      { name: "without a medicine, as a what-if", test: (t) => withoutAMedicine(t, MED) },
    ],
  },
  {
    category: "diagnosis",
    reason: `${PRODUCT_NAME} doesn't diagnose; her doctor can look into what's behind these symptoms.`,
    forms: [
      rx("diagnose / what's wrong", `\\bdiagnos\\w*|\\bwhat'?s wrong\\b|\\bwhat is wrong\\b|\\bwhat (?:is|could be|might be) (?:the )?(?:matter|problem|going on)\\b`),
      // (A possessive before a record is not the person: "Does her list have any medicines for low blood pressure?")
      rx(
        "does she have a condition",
        `\\b(?:does|do|could|might|may|is|has|can) (?:${PERSON}|it|this|that)\\b(?! (?:list|notes?|records?|timeline|brief|medicines?|medications?|meds|pills?|chart|diary|check-ins?|doctor|pharmacist|file)\\b)[^?]*\\b${DIAGNOSIS_VERB}\\b[^?]*\\b${CONDITION}\\b`,
      ),
      rx("is this dementia", `\\bis (?:this|it|that) (?:dementia|alzheimer\\w*|a stroke|parkinson\\w*|delirium|an infection|a uti)\\b`),
      // "Is her confusion dementia?", "Is the memory fog early Alzheimer's?", "Is her dizziness vertigo?" (any named
      // CONDITION). A preposition in the gap or a reference word after the condition is a reference question ("Is the
      // Beers list for dementia…", "Is the dementia warning on the list?").
      rx(
        "a symptom offered as the condition",
        `\\bis (?:her|his|the|this|that|[a-z'-]+'s) (?:(?!(?:for|about|with|on|in|of|to|from)\\b)[a-z'-]+ ){0,3}(?:(?:an? |the )?(?:early |first )?(?:signs?|symptoms?|start|beginning|onset) of |early )?(?:an? )?${NAMED_CONDITION}\\b(?!(?:'s)? ${REFERENCE_WORDS}\\b)`,
      ),
      // "Does her confusion mean dementia?", "Is her memory loss from Alzheimer's?", "Could the dizziness be a symptom of
      // a stroke?". The subject is not a record or a list.
      rx(
        "a symptom tied to a condition",
        `\\b(?:is|does|do|could|might|may|can) (?:her|his|the|this|that|[a-z'-]+'s) (?!(?:beers|list|lists|notes?|records?|timeline|brief|chart|diary|warnings?|criteri\\w*|medicines?|medications?|meds|pills?|drugs?)\\b)(?:[a-z'-]+ ){1,3}?(?:be )?(?:mean|means|from|due to|caused by|because of|(?:an? |the )?(?:early |first )?(?:signs?|symptoms?|start|beginning|onset) of)\\b (?:that |she has |he has |it'?s |early )?(?:an? )?${CONDITION}\\b(?!(?:'s)? ${REFERENCE_WORDS}\\b)`,
      ),
      // "Is her forgetfulness normal aging?", "Is it just old age?".
      rx(
        "ageing offered as the explanation",
        `\\b(?:is|could|might) (?:it|her|his|the|this|that|[a-z'-]+'s) (?:[a-z'-]+ ){0,3}?(?:just |only |simply )?(?:(?:a )?(?:normal )?part of )?(?:normal (?:aging|ageing)|(?:her |his )?old age|getting old(?:er)?|just (?:aging|ageing|age|her age|his age))\\b`,
      ),
      // "Does grandpa have dementia?" for any one-word subject.
      { name: "any subject has a condition", test: asksForADiagnosis },
    ],
  },
  {
    category: "cause",
    reason: `${PRODUCT_NAME} shows what was recorded and when, but can't say what is behind a symptom; that's a question for her clinician.`,
    forms: [
      // "Why is she dizzy?" (but not "why does she take lorazepam?", which asks what it is for)
      rx("why is she", `\\bwhy (?:is|was|does|did|has|have|do|are|would|could|might) (?:${PERSON}|it|this|that|the \\w+|her \\w+)\\b(?! (?:take|taking|on|prescribed|given|using|use)\\b)`),
      rx("why so dizzy", `\\bwhy (?:so |all )?(?:dizzy|dizziness|drowsy|sleepy|confused|foggy|falling|tired|swollen)\\b`),
      // "Why is grandpa so dizzy?", "why does Robert keep falling": any subject, then a symptom.
      rx(
        "why is anyone so dizzy",
        `\\bwhy (?:is|was|does|did|has|have|do|are|would|could|might) (?:[a-z'-]+ ){1,3}?(?:so |still |always |more |getting |feeling |been |keeps? )*(?:dizz\\w*|drows\\w*|sleepy|confus\\w*|foggy|fall\\w*|fell|tired|woozy|unsteady|wobbly|groggy|forgetful|swollen|swell\\w*|sick|weak|shaky)\\b`,
      ),
      rx("what's causing it", `\\b(?:what'?s|what is|what was|what'?s been|is \\w+|is (?:the|her) \\w+|could (?:the|her) \\w+|could \\w+|might \\w+|are (?:the|her) \\w+) (?:\\w+ )?(?:causing|behind|responsible for|to blame for)\\b`),
      rx("what caused her", `\\bwhat (?:caused|causes|made|makes) (?:${PERSON}|her|him|the|this|that)\\b`),
      rx("caused by", `\\b(?:caused|causing|triggered|brought on|induced) (?:by|her|his|the|this)\\b`),
      rx(
        "her symptom from something",
        `\\b(?:the|her|his|this|that|these|those|[a-z'-]+'s) (?:\\w+ )?(?:dizziness|dizzy spells|drowsiness|confusion|fog|falls?|near-falls?|swelling|tiredness|symptoms?|sleepiness)\\b[^?]*\\b(?:from|because of|due to|related to|linked to|associated with|connected (?:to|with)|tied to|caused by|a side effect|side effects|a reaction)\\b`,
      ),
      rx("is it a side effect", `\\b(?:is|are|was|were|could|might|may) (?:it|this|that|these|those|her \\w+|the \\w+|${PERSON})\\b[^?]*\\b(?:a side effect|side effects|a reaction|an adverse)\\b`),
      rx("because of her medicine", `\\b(?:because of|due to|from) (?:the |her |his )?(?:new )?${MED}\\b[^?]*\\?$`),
      // "Did lorazepam cause her dizziness?" (but not the general "Does lorazepam cause dizziness?", which is answered
      // from the reference set): a past-tense question, or one about her own symptoms.
      rx("did it cause", `\\b(?:did|was|were|has|have)\\b[^?]{0,60}\\bcaus(?:e|ed|ing)\\b`),
      rx(
        "does it cause her symptoms",
        `\\b(?:does|do|could|can|might|may|would|is|are)\\b[^?]{0,60}\\bcause\\w* (?:${PERSON}|his|the (?:falls?|near-falls?|dizziness|drowsiness|confusion|fog|swelling|symptoms?|problems?)|these|those|this|that|all (?:this|these|of this))\\b`,
      ),
      // "Did the lorazepam make Margaret dizzy?" for any name (not the general "does it make people dizzy?").
      rx(
        "did it make her dizzy",
        `\\b(?:make|made|makes|making) (?!(?:you|people|someone|anyone|one|folks|patients|older|elderly|seniors)\\b)(?:${PERSON}|[a-z'-]+) (?:so |more |feel |feeling |a bit |go )*(?:dizz\\w*|drowsy|sleepy|confused|foggy|fall\\w*|tired|woozy|unsteady|wobbly|groggy|forgetful|swell\\w*|sick)\\b`,
      ),
      rx("why she's", `\\bwhy (?:${PERSON})(?:'s| is| was| has been| keeps?| kept)\\b(?! (?:taking|on|prescribed|given|using)\\b)`),
      rx("behind it / to blame", `\\b(?:be|is|are|was|were) behind\\b|\\b(?:responsible for|to blame)\\b`),
      // "Could zolpidem be the reason John is falling?" (any subject) and "the reason she fell".
      rx("be the reason", `\\bbe (?:the |a |part of the )?(?:reason|cause)\\b`),
      // "Is lorazepam why she fell?", "Could the zolpidem be why his ankles are swollen?": any word in the medicine
      // slot. (Not "can you tell me why she takes lorazepam?", which asks what it is for.)
      rx(
        "is it why she fell",
        `\\b(?:is|was|are|were|could|might|may|can)\\b[^?]{0,40}?\\bwhy\\b(?! (?:does|did|do) )(?!(?: [a-z'-]+){1,2} (?:takes?|taking|is on|is taking|was prescribed|was given|was put on|uses?|started)\\b)`,
      ),
      // "Does zolpidem explain why he fell?", "Might the Ambien explain the falls?": a subject that explains, not the
      // person asking ("Can you explain the Beers list?") or a page of the app ("does the timeline explain…").
      rx(
        "does it explain",
        `\\b(?:does|do|did|could|might|may|would|can|is|was)\\s+(?!(?:you|u|i|we|someone|anyone|${escapeRe(PRODUCT_NAME.toLowerCase())}|(?:the|her|his|this) (?:timeline|brief|record|records|chart|list|report|app|page|score))\\b)(?:[a-z'+-]+ ){1,3}?explain(?:s|ing)?\\b(?! (?:to|what|how)\\b)`,
      ),
      rx("her medicine explains", `\\b${MED} explains?\\b`),
      // "Is the Ativan the problem?", "could her water pill be the culprit".
      rx("the problem or culprit", `\\b(?:is|was|could|might|may) (?:[a-z'-]+ ){1,3}?(?:be )?the (?:problem|culprit|issue|trouble)\\b`),
      rx(
        "the reason she",
        `\\bthe reason (?:why )?(?:${PERSON})\\b(?! (?:takes?|taking|is on|is taking|was prescribed|was given|was put on|uses?|started)\\b)|\\bthe reason for (?:her|his|the|all|these|those|this) (?!(?:taking|prescription|medicine|medication|pills?|tablets?)\\b)`,
      ),
      // "is it the lorazepam?", "could it be her water pill".
      { name: "is it the medicine", test: blamesAMedicine },
      // "Is she dizzy because of zolpidem?" (any KB name or generic word).
      { name: "because of any medicine", test: becauseOfAMedicine },
      // "Is lorazepam linked to her falls?", "Is lorazepam affecting her memory?".
      { name: "a medicine linked to her symptom", test: (t) => linksAMedicine(t, MED, PERSON) },
    ],
  },
  {
    category: "urgency",
    reason: "How serious something is needs her doctor; if it feels like an emergency, call 911.",
    forms: [
      { name: "how serious", pattern: /\bhow (?:serious|worried|concerned|bad|worrying|alarming)\b/ },
      { name: "should I be worried or call", pattern: /\bshould (?:i|we) (?:be )?(?:worried|concerned|panic|call|ring|phone|take (?:her|him)|bring (?:her|him)|see|go)\b/ },
      { name: "is this serious", pattern: /\b(?:is|was) (?:this|it|that) (?:serious|urgent|bad|normal|concerning|worrying|alarming|a problem|something to worry)\b/ },
      { name: "normal for her age", pattern: /\bnormal (?:for|at) (?:her|his|their) age\b/ },
      { name: "do we need a doctor", pattern: /\b(?:do|does) (?:i|we|she|he) need (?:to (?:call|see|go)|a doctor)\b/ },
      { name: "go to the ER or call the doctor", pattern: /\bgo to (?:the )?(?:er|a&e|hospital|emergency room|urgent care)\b|\bsee a doctor\b|\bcall (?:the|her|his) (?:doctor|gp|nurse)\b/ },
      { name: "worry or urgent", pattern: /\bworr(?:y|ied)\b|\burgent(?:ly)?\b(?! care)/ },
    ],
  },
  {
    category: "prediction",
    reason: `${PRODUCT_NAME} can't predict what will happen; her clinician can talk through her situation.`,
    forms: [
      rx("will she fall", `\\bwill (?:${PERSON}|it|this|that) (?:fall|get|be|recover|improve|need|die|happen|go away|stop|keep|have)\\b`),
      // "Will grandpa fall again?", "will Robert ever recover": any one or two words as the subject.
      rx("will anyone fall", `\\bwill (?:[a-z'-]+ ){1,2}?(?:ever |still |keep |continue to )?(?:fall|get worse|get better|recover|improve|die|need|be (?:ok|okay|alright|all right|fine|able)|go away|end up|break)\\b`),
      // ("Is there going to be a summary?" is about the app, not a person.)
      rx("is she going to", `\\b(?:is|are) (?:${PERSON}|(?!there\\b)[a-z'-]+) (?:going to|likely to|at risk|at high risk|high risk)\\b`),
      // (Not "Which medicines increase her risk of falling?": that asks for the fall-risk findings.)
      {
        name: "risk, chances or prognosis",
        test: (t) =>
          /\b(?:risk of|chances?|odds|likelihood|likely to)\b|\bprognosis\b|\bwhat (?:happens|will happen|would happen|could happen|might happen|is going to happen) (?:if|when|next|to her|to him)\b/.test(t) &&
          !asksWhichMedicinesAreFallRisks(t),
      },
      rx("if she keeps falling", `\\bif (?:${PERSON}) keeps? (?:falling|getting|being|on|taking)\\b`),
    ],
  },
];

/** Longest question considered (longer input is cut; keeps matching fast and bounded). */
export const MAX_QUESTION_CHARS = 400;

function normalizeQuestion(q: string): string {
  return oneLine(typeof q === "string" ? q : "")
    .slice(0, MAX_QUESTION_CHARS)
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RouteOptions {
  /** Personalises the redirect ("That's a question for Margaret's doctor or pharmacist …"); also a person name. */
  patientName?: string;
  /** The profile's names (displayName, preferredName): each word joins the scope rules' person slot. */
  personNames?: string[];
  /** The list's medicine names ("Lorazepam (Ativan)"): names and brands join the medicine slot. */
  medNames?: string[];
  /** The person's possessive pronoun for the reason line ("her", "his", "their"; pronounsFor(profile).possessive). */
  possessive?: string;
}

/** The last rule set built (Ask passes the same profile on every question, so this is built once per profile). */
let rulesCache: { key: string; rules: ScopeRule[]; med: RegExp; MED: string } | null = null;

function rulesFor(opts: RouteOptions): { rules: ScopeRule[]; med: RegExp; MED: string } {
  const person = personPattern([opts.patientName ?? "", ...(opts.personNames ?? [])]);
  const med = medPattern(opts.medNames ?? []);
  const key = `${person}\n${med}`;
  if (rulesCache?.key !== key) rulesCache = { key, rules: SCOPE_RULES(person, med), med: new RegExp(`\\b${med}\\b`), MED: med };
  return rulesCache;
}

/**
 * The reason line for a safety question. With a medicine in the question (a KB name or brand, a name on the list,
 * or a word like "pill"), the medicine wording; without one ("Is it okay for her to drive?"), a generic line, so the
 * card never talks about a medicine nobody asked about. A combination with a medicine not on the list gets its own
 * line (Kinwise did not check it). Code-written copy, held to the same wording rules as the UI (no "safe":
 * SPEC §3), so it says "right for".
 */
function safetyReason(t: string, med: RegExp, MED: string, opts: RouteOptions): string {
  const named = oneLine(opts.patientName ?? "");
  // A placeholder kept from an older "Delete everything" ("Your relative") reads as words, not a name.
  const who = !named ? "her" : /^(?:your|my|our) /i.test(named) ? named.toLowerCase() : named;
  const poss = oneLine(opts.possessive ?? "").toLowerCase() || "her";
  if (combinesAnUnlistedMedicine(t, MED)) {
    const whose = named ? `${who}'s` : poss;
    return `${PRODUCT_NAME} only checks combinations among the medicines on ${whose} list; ${poss} pharmacist can check a medicine that is not on it.`;
  }
  const what = namesAMedicine(t) || med.test(t) ? "a medicine" : "something";
  return `Whether ${what} is right for ${who} is a judgment for ${poss} clinician; ${PRODUCT_NAME} only shows what was recorded and published criteria.`;
}

/**
 * Decide whether Kinwise may answer a question from the records. Pass the profile's names and the list's
 * medicine names so the scope rules know them; the treatment, cause, prediction, diagnosis and overdose rules
 * also catch names and medicines they don't know (over-redirecting is the safe failure).
 */
export function routeQuestion(q: string, opts: RouteOptions = {}): QuestionRoute {
  const t = normalizeQuestion(q);
  if (!t) return { inScope: true };
  const { rules, med, MED } = rulesFor(opts);
  // Categories in order (emergency first); within a category, the first form that matches names the route.
  for (const rule of rules) {
    const form = rule.forms.find((f) => Boolean(f.pattern?.test(t)) || Boolean(f.test?.(t)));
    if (!form) continue;
    if (rule.category === "emergency") {
      return { inScope: false, category: "emergency", reason: rule.reason, redirect: EMERGENCY_REDIRECT, offerVisitQuestion: false, rule: form.name };
    }
    const reason = rule.category === "safety" ? safetyReason(t, med, MED, opts) : (form.reason ?? rule.reason);
    return { inScope: false, category: rule.category, reason, redirect: redirectText(opts.patientName), offerVisitQuestion: true, rule: form.name };
  }
  return { inScope: true };
}

// ---------------------------------------------------------------------------
// Vocabulary

/** Everyday words for each diary item. Near-falls are matched (and removed) before falls. */
const METRIC_WORDS: [MetricKey, RegExp][] = [
  ["nearFall", /\bnear[- ]?(?:falls?|miss(?:es)?)\b|\b(?:almost|nearly) (?:fell|fall(?:en|ing)?|went over|gone over|going over|went down)\b|\blost (?:her |his |my )?(?:balance|footing)\b|\bstumbl\w*|\btripp?(?:ed|ing|s)?\b|\bcaught (?:her|him|my)self\b/g],
  ["fall", /\bfalls?\b|\bfell\b|\bfallen\b|\bfalling\b|\btumbles?\b|\bon the floor\b/g],
  ["dizziness", /\bdizz\w*|\blight[- ]?headed\w*|\bwoozy\b|\bwooziness\b|\bspinning\b|\bvertigo\b|\bunsteady\b|\bwobbly\b|\boff balance\b/g],
  ["drowsiness", /\bdrows\w*|\bsleepy\b|\bsleepiness\b|\bgroggy\b|\bdoz(?:e|ed|ing|es)\b|\bdozy\b|\bnodding off\b|\bnod off\b|\bnodded off\b/g],
  ["confusion", /\bconfus\w*|\bfogg?y\b|\bfog\b|\bmuddled\b|\bmixed up\b|\bforgetful\w*|\bmemory\b|\bdisorient\w*/g],
  ["swelling", /\bswell\w*|\bswollen\b|\bpuffy\b|\bo?edema\b|\bankles?\b/g],
  ["sleep", /\bsleep\b|\bsleeping\b(?! pills?| tablets?| aids?)|\bslept\b|\binsomnia\b|\bnights?\b|\bbedtime\b/g],
  ["energy", /\benergy\b|\btired\w*|\bfatigue\w*|\bexhaust\w*|\bworn out\b|\bwiped out\b/g],
  // "appetite" questions are answered with the appetiteWorse metric (days with a poor appetite).
  ["appetiteWorse", /\bappetite\b|\beat(?:ing|s|en)?\b|\bate\b|\bhungry\b|\bmeals?\b/g],
];

/** Words that count as "talking about" a diary item inside her own story (broader than the question words). */
const STORY_WORDS: Record<MetricKey, RegExp> = {
  dizziness: /\bdizz\w*|\blight[- ]?headed\w*|\bwoozy\b|\bspinning\b|\bunsteady\b|\bwobbly\b|\bvertigo\b/i,
  drowsiness: /\bdrows\w*|\bsleepy\b|\bgroggy\b|\bdoz\w*|\bnodd\w* off\b|\beyes closing\b/i,
  confusion: /\bconfus\w*|\bfogg?y\b|\bmuddled\b|\bmixed up\b|\bforg[eo]t\w*|\blosing track\b|\blost track\b|\bcouldn'?t remember\b/i,
  fall: /\bfell\b|\bfall\b|\bfallen\b|\btumble\b|\blanded\b|\bon the floor\b/i,
  nearFall: /\bnearly\b|\balmost\b|\bcaught myself\b|\bgrab\w*\b|\btripp?ed\b|\bstumbl\w*|\blost my balance\b|\bwent over\b|\bgone down\b/i,
  swelling: /\bswell\w*|\bswollen\b|\bpuffy\b|\bankles?\b/i,
  // Night-time sleep only: "sleepy", "dozed", "nodded off" are coded as daytime drowsiness, not sleep.
  sleep: /\bsleep(?!y|iness|ily)\w*|\bslept\b|\bnight\b|\bbed\b|\binsomnia\b|\bawake\b|\bwoke\b|\blike a log\b/i,
  energy: /\benergy\b|\btired\b|\bexhaust\w*|\bworn out\b|\bfull of beans\b|\bwiped\b/i,
  appetiteWorse: /\beat\w*|\bate\b|\bappetite\b|\bhungry\b|\bfood\b|\bmeals?\b|\bsupper\b|\blunch\b|\bbreakfast\b/i,
};

/** Extra symptoms from her words (otherSymptoms concepts). */
const CONCEPT_WORDS: [ConceptId, RegExp][] = [
  ["dry_mouth", /\bdry mouth\b|\bmouth (?:is |was |feels )?dry\b/],
  ["nausea", /\bnause\w*|\bqueasy\b|\bsick to (?:her|my) stomach\b/],
  ["constipation", /\bconstipat\w*/],
  ["headache", /\bheadaches?\b/],
  ["cough", /\bcough\w*/],
  ["blurred_vision", /\bblurr\w*|\bvision\b|\beyesight\b/],
  ["urinary_problem", /\bbladder\b|\burin(?:e|ary|ating|ation)\b|\bpee(?:s|d|ing)?\b|\bleak(?:s|ed|ing|age|y)?\b|\btoilet\b/],
  // Not a bare "blue" ("her lips are blue" is an emergency, routed away before this).
  ["low_mood", /\blow mood\b|\bsad\b|\bdown in the dumps\b|\bdepressed\b|\b(?:feeling|felt|feels|been) (?:a bit |so |very )?blue\b/],
  ["anxiety", /\banxi\w*|\bnervous\b|\bnerves\b|\bworked up\b/],
  ["pain", /\bpain\w*|\bsore\b|\baches?\b|\baching\b|\bhurts?\b/],
  ["shortness_of_breath", /\bshort of breath\b|\bbreathless\w*|\bout of breath\b/],
  ["tremor", /\btremor\w*|\bshak(?:y|ing|es|iness)\b/],
  ["rash", /\brash\w*|\bitch\w*/],
  ["diarrhea", /\bdiarrh?o?ea\b|\bloose stools?\b/],
  ["palpitations", /\bpalpitations?\b|\bheart (?:racing|pounding|fluttering)\b/],
  // Whole words and phrases only: a bare "blood" ("her blood pressure", "blood sugar") is never a bleeding symptom.
  ["bleeding_or_bruising", /\bbruis(?:e|es|ed|ing)\b|\bbleed(?:s|ing)?\b|\bbled\b|\bnose ?bleeds?\b|\bbloody\b|\bblood (?:in|on|when)\b|\b(?:coughing|spitting) up blood\b/],
  ["black_stools", /\bblack stools?\b|\btarry\b/],
  ["shakiness_or_sweating", /\bsweat\w*|\bclammy\b/],
];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NUM_WORDS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3 };

/** Generic phrases for a medicine by what it is for ("her water pill", "the sleeping pill"). */
const REASON_PHRASES: [RegExp, RegExp][] = [
  [/\bwater (?:pills?|tablets?)\b|\bdiuretic\b/, /swell|fluid|water|edema|oedema|ankle/i],
  [/\bsleep(?:ing)? (?:pills?|tablets?|aids?|meds?|medicines?|medications?)\b/, /sleep|insomnia/i],
  [/\bblood pressure (?:pills?|tablets?|meds?|medicines?|medications?)\b/, /blood pressure|hypertension/i],
  [/\bbladder (?:pills?|tablets?|meds?|medicines?|medications?)\b/, /bladder|urin|incontinen/i],
  [/\b(?:diabetes|sugar) (?:pills?|tablets?|meds?|medicines?|medications?)\b/, /diabet|sugar/i],
  [/\bcholesterol (?:pills?|tablets?|meds?|medicines?|medications?)\b/, /cholesterol/i],
  [/\b(?:heartburn|stomach|acid|reflux) (?:pills?|tablets?|meds?|medicines?|medications?)\b/, /heartburn|stomach|reflux|acid/i],
  [/\b(?:anxiety|nerve|nerves) (?:pills?|tablets?|meds?|medicines?|medications?)\b/, /anxiety|nerve/i],
];
/** Everyday names for medicine groups → KB class ids (only ids present in the bound KB are used). */
const CLASS_PHRASES: [RegExp, string[]][] = [
  [/\bblood[- ]thinners?\b|\banticoagulants?\b/, ["anticoagulant", "antiplatelet"]],
  [/\bantiplatelets?\b/, ["antiplatelet"]],
  [/\bbenzo(?:diazepine)?s?\b/, ["benzodiazepine"]],
  [/\bopioids?\b|\bnarcotics?\b|\bopiates?\b/, ["opioid"]],
  [/\bantihistamines?\b/, ["first_gen_antihistamine"]],
  [/\bdiuretics?\b/, ["diuretic"]],
  [/\bstatins?\b/, ["statin"]],
  [/\bantidepressants?\b/, ["antidepressant"]],
  [/\bantipsychotics?\b/, ["antipsychotic"]],
  [/\bnsaids?\b|\banti-?inflammator\w*/, ["nsaid"]],
  [/\bsedatives?\b|\bsleeping pills?\b|\bsleep aids?\b/, ["sedative_hypnotic"]],
  [/\bppis?\b|\bproton[- ]pump\b|\bacid reducers?\b/, ["ppi"]],
  [/\binsulin\b/, ["insulin"]],
  [/\bblood[- ]pressure (?:medicines?|medications?|meds|pills?|tablets?)\b/, ["bp_lowering"]],
  [/\bdiabetes (?:medicines?|medications?|meds|pills?|tablets?)\b/, ["antidiabetic"]],
];

const NEW_MED_RE = /\bnew (?:pills?|tablets?|meds?|medicines?|medications?|prescriptions?|sleeping pills?|one|drug)\b|\bthe new\b/;

/** English words that must never be read as a misspelt medicine name. */
const COMMON_WORDS = new Set(
  "about after again against almost answered before between bladder changed changes checkin confused dizziness dizzy doctor drowsy energy evening falling feeling foggy medicine medicines medication medications morning nearly pharmacist questions recently records related relation sleeping started starting stopped swelling taking yesterday tuesday wednesday thursday saturday september october november december january february".split(
    " ",
  ),
);

// ---------------------------------------------------------------------------
// Parsing

export type QaIntent =
  | "first_onset"
  | "last_time"
  | "count"
  | "said"
  | "beers"
  | "acb"
  | "fall_risk"
  | "findings"
  | "changes"
  | "med_list"
  | "med_detail"
  | "not_listed"
  | "known_effect"
  | "missed_doses"
  | "notes"
  | "visit_questions"
  | "coverage"
  | "summary"
  | "day"
  | "med_class"
  | "metric"
  | "not_recorded"
  | "prescriber"
  | "interactions"
  | "unknown";

export interface ParsedQuestion {
  normalized: string;
  /** KB medicine groups named in the question ("blood thinners" → anticoagulant, antiplatelet). */
  classes: string[];
  metrics: MetricKey[];
  concepts: ConceptId[];
  /** Medicines on her list the question refers to. */
  meds: Medication[];
  /** KB medicines named in the question that are not on her list. */
  unlisted: { name: string; ingredientIds: string[] }[];
  range: QaRange | null;
  /** A measurement Kinwise does not record ("blood pressure", "A1C", "potassium"), or null. */
  notRecorded: NotRecordedTopic | null;
  /** Prescribers on her list named in the question ("Dr. Lee", "cardiology"), and an unmatched "Dr. X". */
  prescribers: PrescriberMatch;
  intent: QaIntent;
}

export interface NotRecordedTopic {
  /** What the question asked about, as words for the answer ("blood pressure readings"). */
  label: string;
  /** Matches a medicine's recorded reason that relates to it (null: no medicine is listed for it). */
  reason: RegExp | null;
}

export interface PrescriberMatch {
  /** Prescriber strings on the list (as entered) that the question names. */
  names: string[];
  /** "Dr. Smith" when the question names a doctor who is not on the list. */
  unknownDoctor: string | null;
}

export interface QaRange {
  from: ISODate;
  to: ISODate;
  /** How the range was chosen ("this week", "since Lorazepam (Ativan) was started"…). */
  label: string;
  kind: "phrase" | "since_med" | "before_med" | "date";
  medId?: string;
}

function tokenize(t: string): string[] {
  return t.replace(/[^a-z0-9'+-]+/g, " ").split(" ").filter(Boolean);
}

/** Medicines on the list (and KB medicines not on it) named in the question. */
function findMeds(t: string, data: StoreData, today: ISODate): { meds: Medication[]; unlisted: { name: string; ingredientIds: string[] }[] } {
  const meds: Medication[] = [];
  const pushMed = (m: Medication | null | undefined) => {
    if (m && !meds.includes(m)) meds.push(m);
  };
  const all = data.medications;
  const words = tokenize(t);
  const found: string[][] = [];
  // n-grams, longest first, so "tylenol pm" wins over "tylenol".
  const used = new Set<number>();
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if ([...Array(n).keys()].some((k) => used.has(i + k))) continue;
      const gram = words.slice(i, i + n).join(" ");
      if (gram.length < 3 || (n === 1 && COMMON_WORDS.has(gram))) continue;
      const m = matchDrug(gram);
      const fuzzyOk = m.match === "fuzzy" && n === 1 && gram.length >= 7;
      if (m.ingredientIds.length && (m.match !== "fuzzy" || fuzzyOk) && m.match !== "none") {
        // A leading-word match must cover the whole n-gram to count (avoid "lorazepam started" eating "started").
        if (n > 1 && m.normalized.split(" ").length !== n) continue;
        found.push(m.ingredientIds);
        for (let k = 0; k < n; k++) used.add(i + k);
      }
    }
  }
  // Names exactly as the family typed them ("Tylenol PM", "Furosemide (Lasix)").
  for (const med of all) {
    const names = [med.name.replace(/\(.*?\)/g, " "), ...[...med.name.matchAll(/\(([^)]*)\)/g)].map((x) => x[1])]
      .map((n) => n.toLowerCase().replace(/\b(?:otc|over the counter)\b/g, "").replace(/\s+/g, " ").trim())
      .filter((n) => n.length >= 3);
    if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))) pushMed(med);
  }
  const unlisted: { name: string; ingredientIds: string[] }[] = [];
  for (const ids of found) {
    const onList = all.filter((m) => m.ingredientIds.some((id) => ids.includes(id)));
    if (onList.length) {
      // Prefer the product whose ingredients match exactly ("diphenhydramine" → Tylenol PM is still right).
      onList.sort((a, b) => Number(isActiveOn(b, today)) - Number(isActiveOn(a, today)));
      onList.forEach(pushMed);
    } else {
      const name = ids.map((id) => DEFAULT_KB.drugDisplay(id) ?? id).join(" + ");
      if (!unlisted.some((u) => u.name === name)) unlisted.push({ name, ingredientIds: ids });
    }
  }
  for (const [phrase, reason] of REASON_PHRASES) {
    if (!phrase.test(t)) continue;
    all.filter((m) => reason.test(m.reason) && isActiveOn(m, today)).forEach(pushMed);
  }
  if (NEW_MED_RE.test(t)) pushMed(mostRecentStart(all, today));
  return { meds, unlisted };
}

function findMetrics(t: string): MetricKey[] {
  let rest = t;
  const out: MetricKey[] = [];
  for (const [key, re] of METRIC_WORDS) {
    re.lastIndex = 0;
    if (re.test(rest)) {
      if (!out.includes(key)) out.push(key);
      re.lastIndex = 0;
      rest = rest.replace(re, " ");
    }
  }
  return out;
}

function findConcepts(t: string): ConceptId[] {
  return CONCEPT_WORDS.filter(([, re]) => re.test(t)).map(([id]) => id);
}

function numberWord(w: string): number | null {
  if (/^\d+$/.test(w)) return Number(w);
  return NUM_WORDS[w] ?? null;
}

function monthIndex(word: string): number {
  return MONTHS.findIndex((m) => m.startsWith(word.slice(0, 3)));
}

/** Parse a date phrase. Returns null when the question names no period. */
export function parseRange(t: string, today: ISODate, meds: Medication[], allMeds: Medication[] = meds): QaRange | null {
  const clip = (from: ISODate, to: ISODate, label: string, kind: QaRange["kind"] = "phrase", medId?: string): QaRange => ({
    from: minDate(from, today),
    to: minDate(to, today),
    label,
    kind,
    ...(medId ? { medId } : {}),
  });
  const year = Number(today.slice(0, 4));
  // Since/after/before a medicine started.
  const medAnchor = /\b(since|after|before|prior to)\b[^?.]*?\b(?:started|starting|start|began|beginning|went on|been on|put on|got|was given|taking|on)?\b/.exec(t);
  if (medAnchor && meds.length) {
    const anchorWord = medAnchor[1];
    const med = [...meds].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
    if (isValidDate(med.startDate)) {
      if (anchorWord === "before" || anchorWord === "prior to") {
        const w = eventWindows(med, { medicationId: med.id, kind: "started", date: med.startDate }, today);
        return clip(w.before.from, w.before.to, `the 21 days before ${medName(med)} was started`, "before_med", med.id);
      }
      return clip(med.startDate, today, `since ${medName(med)} was started on ${dateWords(med.startDate, today)}`, "since_med", med.id);
    }
  }
  // Explicit dates: "since Sep 24", "on October 6", "since 9/24".
  const md = new RegExp(`\\b(since|on|from|after)\\s+${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t);
  const slash = /\b(since|on|from|after)\s+(\d{1,2})\/(\d{1,2})\b/.exec(t);
  const explicit = md
    ? { word: md[1], month: monthIndex(md[2]), day: Number(md[3]) }
    : slash
      ? { word: slash[1], month: Number(slash[2]) - 1, day: Number(slash[3]) }
      : null;
  if (explicit && explicit.month >= 0 && explicit.day >= 1 && explicit.day <= 31) {
    let date = `${year}-${String(explicit.month + 1).padStart(2, "0")}-${String(explicit.day).padStart(2, "0")}`;
    if (isValidDate(date) && date > today) date = `${year - 1}${date.slice(4)}`;
    if (isValidDate(date)) {
      if (explicit.word === "on") return clip(date, date, `on ${dateWords(date, today)}`, "date");
      return clip(date, today, `since ${dateWords(date, today)}`, "date");
    }
  }
  if (/\btoday\b/.test(t)) return clip(today, today, "today");
  if (/\byesterday\b/.test(t)) return clip(addDays(today, -1), addDays(today, -1), "yesterday");
  const lastN = /\b(?:last|past|previous|recent)\s+(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|couple of|few)\s+(days?|weeks?|months?)\b/.exec(t);
  if (lastN) {
    const n = numberWord(lastN[1].replace(" of", "")) ?? 1;
    const unit = lastN[2].startsWith("day") ? 1 : lastN[2].startsWith("week") ? 7 : 30;
    const days = Math.max(1, n * unit);
    return clip(addDays(today, -(days - 1)), today, `the last ${days} days`);
  }
  if (/\b(?:last|past) fortnight\b|\blast couple of weeks\b/.test(t)) return clip(addDays(today, -13), today, "the last 14 days");
  if (/\bthis week\b|\b(?:the )?past week\b|\bin the last week\b|\bover the last week\b|\blast 7 days\b/.test(t)) return clip(addDays(today, -6), today, "the last 7 days");
  if (/\blast week\b/.test(t)) return clip(addDays(today, -13), addDays(today, -7), "the week before last 7 days");
  if (/\bthis month\b/.test(t)) return clip(`${today.slice(0, 7)}-01`, today, "this month");
  if (/\b(?:past|in the last|over the last|during the last) month\b/.test(t)) return clip(addDays(today, -29), today, "the last 30 days");
  if (/\blast month\b/.test(t)) {
    const d = parseDate(`${today.slice(0, 7)}-01`);
    d.setMonth(d.getMonth() - 1);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return clip(from, addDays(`${today.slice(0, 7)}-01`, -1), MONTHS[d.getMonth()].replace(/^./, (c) => c.toUpperCase()));
  }
  const inMonth = new RegExp(`\\b(?:in|during|for|through|throughout|of)\\s+${MONTH_RE}\\b`).exec(t);
  if (inMonth) {
    const mi = monthIndex(inMonth[1]);
    let y = year;
    if (`${y}-${String(mi + 1).padStart(2, "0")}-01` > today) y -= 1;
    const from = `${y}-${String(mi + 1).padStart(2, "0")}-01`;
    const next = parseDate(from);
    next.setMonth(next.getMonth() + 1);
    const to = addDays(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`, -1);
    return clip(from, to, `${MONTHS[mi].replace(/^./, (c) => c.toUpperCase())}${y !== year ? ` ${y}` : ""}`);
  }
  if (/\brecent(?:ly)?\b|\blately\b|\bthese days\b/.test(t)) return clip(addDays(today, -13), today, "the last 14 days");
  // "since the new pill" with the medicine resolved from a generic phrase.
  if (/\bsince\b/.test(t) && allMeds.length && NEW_MED_RE.test(t)) {
    const med = mostRecentStart(allMeds, today);
    if (med) return clip(med.startDate, today, `since ${medName(med)} was started on ${dateWords(med.startDate, today)}`, "since_med", med.id);
  }
  return null;
}

/** Measurements and tests the diary does not record. First match wins. */
const NOT_RECORDED: [RegExp, NotRecordedTopic][] = [
  [/\b(?:blood pressure|bp)\b/, { label: "blood pressure readings", reason: /blood pressure|hypertension/i }],
  [/\b(?:blood sugars?|glucose|a1c|hba1c)\b/, { label: "blood sugar or A1C results", reason: /diabet|blood sugar|glucose/i }],
  [/\b(?:heart rate|pulse)\b/, { label: "heart rate or pulse readings", reason: /heart rate|pulse|rhythm|atrial|palpitation/i }],
  [/\bweight\b/, { label: "weight", reason: /weight/i }],
  [/\btemperature\b/, { label: "temperature", reason: null }],
  [/\bkidneys?\b/, { label: "kidney function results", reason: /kidney|renal/i }],
  [/\bpotassium\b/, { label: "potassium levels", reason: /potassium/i }],
  [/\bsodium\b/, { label: "sodium levels", reason: /sodium/i }],
  [/\blabs?\b|\blab (?:tests?|results?|work)\b|\bblood (?:tests?|work|results?)\b|\bbloodwork\b/, { label: "lab results", reason: null }],
];

/** "Which blood pressure medicines…" is about her list, not a reading. */
const LIST_WORDS = /\b(?:pills?|tablets?|meds|medicines?|medications?|drugs?|prescriptions?|prescribe[ds]?|prescribing)\b/;

function findNotRecorded(t: string): NotRecordedTopic | null {
  if (LIST_WORDS.test(t)) return null;
  for (const [re, topic] of NOT_RECORDED) if (re.test(t)) return topic;
  return null;
}

/** "Do any of her medicines interact?", "drug-drug", "medicine combinations": a question about combinations. */
const INTERACTION_RE =
  /\binteract\w*|\bclash\w*|\bdrug[- ]drug\b|\b(?:medicine|medication|drug|pill) combinations?\b|\bcombinations? of (?:her |his |the |these |those |any |two |2 )?(?:medicines?|medications?|meds|pills|drugs)\b/;
/**
 * "…taken together", "mix", "with each other": a combination only when two medicines or a medicine word are named,
 * and not a schedule question ("How many pills does she take together at bedtime?").
 */
const TOGETHER_RE = /\btogether\b|\bmix\w*|\bwith (?:each other|one another)\b/;
const SCHEDULE_RE =
  /\bhow many\b|\bat (?:bedtime|night|breakfast|lunch|dinner|supper)\b|\bin the (?:morning|evening)\b|\bwith (?:food|meals?|breakfast|lunch|dinner|supper)\b|\b(?:this|yesterday|last) (?:morning|evening|night)\b|\b(?:today|tonight)\b|\bdid (?:she|he|they|[a-z'-]+) (?:take|have)\b/;

/** Words in a prescriber entry that never identify it on their own. */
const PRESCRIBER_STOP = new Set("dr dr. doctor doc the of and care self otc md np pa clinic office her his mom".split(" "));

function prescriberWords(p: string): string[] {
  return tokenize(p.toLowerCase().replace(/[().,/]/g, " ")).filter((w) => w.length >= 3 && !PRESCRIBER_STOP.has(w));
}

/** Prescribers on the active list the question names: "dr lee", "Dr. Okafor", "cardiology", "urgent care". */
function findPrescribers(t: string, data: StoreData, today: ISODate): PrescriberMatch {
  const active = data.medications.filter((m) => isActiveOn(m, today) && oneLine(m.prescriber));
  const qWords = new Set(tokenize(t.replace(/\./g, " ")));
  const names: string[] = [];
  for (const m of active) {
    const p = oneLine(m.prescriber);
    if (names.includes(p)) continue;
    if (prescriberWords(p).some((w) => qWords.has(w))) names.push(p);
  }
  const doc = /\bdr\.? ([a-z][a-z'-]{1,})\b/.exec(t);
  const DOC_STOP = /^(?:said|says|told|asked|wants?|thinks?|prescribed|prescribes?|gave|visit|appointment|office|about|and|or|the|her|his|is|was|for|to|who|what|which|did|does)$/;
  const unknownDoctor =
    doc && !names.length && !DOC_STOP.test(doc[1]) ? `Dr. ${doc[1].charAt(0).toUpperCase()}${doc[1].slice(1)}` : null;
  return { names, unknownDoctor };
}

function findClasses(t: string): string[] {
  const out: string[] = [];
  for (const [re, ids] of CLASS_PHRASES) if (re.test(t)) for (const id of ids) if (getClass(id) && !out.includes(id)) out.push(id);
  return out;
}

/**
 * The record intent of an in-scope question (routeQuestion has already sent safety, diagnosis, dose, cause,
 * urgency and prediction questions to the redirect card, and emergencies to the 911 line, before this runs).
 *
 * Rules are checked top to bottom and the first match wins, so the narrower intents (Beers, interactions, ACB,
 * visit questions, missed doses…) sit above the broad ones (a medicine named → med_detail, a symptom named →
 * metric, "how is she doing" → summary). Each rule has a routing test in qa.test.ts; add one with any new rule.
 */
function detectIntent(t: string, p: Omit<ParsedQuestion, "intent" | "normalized">, data: StoreData): QaIntent {
  const caregiver = oneLine(data.profile.caregiverName).toLowerCase();
  const hasMetric = p.metrics.length > 0 || p.concepts.length > 0;
  // The person the questions are about: generic words plus the profile's preferred name ("When did Dorothy last fall?").
  const patient = escapeRe(oneLine(data.profile.preferredName).toLowerCase().replace(/[^a-z' -]/g, "").trim());
  const who = `(?:she|he|mom|mum|mother|dad|father${patient ? `|${patient}` : ""})`;
  // Above "beers": "Does the Beers list flag any interactions?" gets the combinations answer, with its caveat.
  // Only with medicine context: "Has she been interacting with her friends?" and "Did she clash with her aide?" are
  // diary questions, and "Which medicines did she start together?" / "mixed up" are not about combinations.
  const medContext = p.meds.length > 0 || p.unlisted.length > 0 || LIST_WORDS.test(t) || /\bdrug[- ]drug\b|\bcombinations?\b|\bbeers\b/.test(t);
  const startedTogether = /\bmixed up\b|\b(?:start|started|began|begun|stop|stopped)\b[^?]*\btogether\b/.test(t);
  if (
    (INTERACTION_RE.test(t) && medContext) ||
    (TOGETHER_RE.test(t) && !SCHEDULE_RE.test(t) && !startedTogether && (p.meds.length >= 2 || LIST_WORDS.test(t)))
  ) {
    return "interactions";
  }
  if (/\bbeers\b/.test(t)) return "beers";
  if (/\bacb\b|\banticholinergic\b/.test(t)) return "acb";
  if (/\b(?:what|which) (?:questions?|should (?:i|we) ask|to ask)\b|\bquestions? (?:for|to ask|should (?:i|we))\b|\bwhat (?:should|can|could) (?:i|we) ask\b|\bvisit questions?\b/.test(t)) return "visit_questions";
  if (/\b(?:miss(?:ed|ing)?|forg[eo]t\w*|skipp?(?:ed|ing)?)\b[^?]*\b(?:doses?|pills?|tablets?|meds?|medicines?|medications?|water pill)\b|\bdoses? (?:missed|skipped|forgotten)\b|\bdid (?:she|he) take (?:all )?(?:her|his) (?:pills|meds|medicines)\b/.test(t)) return "missed_doses";
  // "Which of her meds are risky for falls?" (routeQuestion lets this group question through; see
  // asksWhichMedicinesAreFallRisks) is the fall-risk question too.
  if (/\bfall[- ]risk\b|\b(?:medicines?|medications?|meds|pills|drugs)\b[^?]*\b(?:linked to|related to|connected to|tied to|associated with|raises?|increases?|adds? to|puts? (?:her|him|them) at (?:a )?(?:higher )?risk|risky for|risky with)\b[^?]*\bfall(?:s|ing)?\b|\bfrids?\b/.test(t)) return "fall_risk";
  if ((caregiver && new RegExp(`\\b${caregiver}\\b`).test(t)) || /\bnotes?\b|\bconcerns?\b|\bpinned\b/.test(t)) return "notes";
  if (/\bwhat (?:has |have )?(?:changed|is new|'s new|is different|'s different)\b|\b(?:any|recent|latest) changes?\b|\bwhat changes?\b|\banything (?:new|different)\b/.test(t)) return "changes";
  const saidRe = new RegExp(
    `\\b(?:did|has|does|do|what|when|how)\\b[^?]*\\b${who}\\b[^?]*\\b(?:say|said|says|saying|tell|told|write|wrote|written|mention\\w*|describe\\w*|talk\\w*|complain\\w*)\\b|\\b${who} (?:said|wrote|mentioned|told|described|complained)\\b|\\b(?:her|his) (?:own )?words\\b`,
  );
  if (saidRe.test(t)) return "said";
  // A measurement the diary doesn't hold ("what is her blood pressure?"): say so instead of guessing.
  if (p.notRecorded && !p.classes.length) return "not_recorded";
  // "What meds does Dr. Lee prescribe?": only that prescriber's medicines.
  if ((p.prescribers.names.length || p.prescribers.unknownDoctor) && !p.meds.length) return "prescriber";
  if (p.classes.length && /\b(?:any|which|what|is (?:she|he) on|does (?:she|he) take|taking|on (?:a|an))\b/.test(t)) return "med_class";
  if (p.unlisted.length && !p.meds.length) return "not_listed";
  if (/\b(?:does|do|can|could) \w+(?: \w+)? cause\b|\bis \w+(?: \w+)? a (?:known |common |possible )?(?:side effect|effect)\b|\bside effects? of\b|\bknown (?:side )?effects?\b/.test(t) && p.meds.length && hasMetric) {
    return "known_effect";
  }
  const firstRe = new RegExp(`\\bwhen did\\b[^?]*\\b(?:start|begin|began|first)\\b|\\bwhen was the first\\b|\\bfirst (?:time|recorded|noticed|noted)\\b|\\bhow long has\\b|\\bsince when\\b|\\bwhen (?:did|has) ${who} (?:first|start)\\b`);
  if (firstRe.test(t) && hasMetric) {
    return "first_onset";
  }
  const lastRe = new RegExp(`\\bwhen (?:was|did) (?:the |her |his )?(?:last|latest|most recent)\\b|\\b(?:last|latest|most recent) (?:time|one|day)\\b|\\bwhen did ${who} last\\b`);
  if (lastRe.test(t) && hasMetric) return "last_time";
  if (/\bhow (?:many|often|much|frequently)\b|\bnumber of\b|\bhow many times\b|\bcount\b|\bany (?:falls?|near-falls?)\b|\bhas (?:she|he) (?:had|been|fallen|felt)\b|\bdid (?:she|he) (?:have|feel|fall|get|record|note)\b|\bwere there\b/.test(t)) {
    if (hasMetric) return "count";
    if (/\b(?:check[- ]?ins?|entries|diary|days)\b/.test(t)) return "coverage";
  }
  if (/\bcheck(?:ed)?[- ]?ins?\b|\bdiary (?:days|entries|coverage)\b|\bentries\b|\bhow (?:often|many days) (?:did|has) (?:she|he) (?:check|fill|use|answer)\b/.test(t)) return "coverage";
  if (p.meds.length && hasMetric && p.range && (p.range.kind === "since_med" || p.range.kind === "before_med")) return "metric";
  if (p.meds.length) return "med_detail";
  if (/\b(?:what|which|list|show|all)\b[^?]*\b(?:medicines?|medications?|meds|pills|drugs|prescriptions)\b|\bmed(?:ication|icine)? list\b|\bwhat (?:is|does) (?:she|he) (?:on|take|taking)\b|\bwhat is (?:she|he) taking\b/.test(t)) {
    if (/\b(?:flag\w*|review|criteria|problem\w*|issues?|concerns?|findings?|prompts?)\b/.test(t)) return "findings";
    return "med_list";
  }
  if (/\b(?:review|findings?|flag\w*|prompts?)\b/.test(t)) return "findings";
  if (hasMetric) return "metric";
  // A single day with no other topic: "What happened on Oct 5?", "How was she yesterday?"
  if (p.range && p.range.from === p.range.to) return "day";
  if (new RegExp(`\\bhow (?:is|has) ${who} (?:been|doing)\\b|\\bsummar\\w*|\\boverview\\b|\\bhow are things\\b|\\bhow'?s ${who}\\b`).test(t)) return "summary";
  return "unknown";
}

/** Parse a question into concepts, medicines, a period and an intent (exported for tests and the UI). */
export function parseQuestion(q: string, data: StoreData, today: ISODate): ParsedQuestion {
  const t = normalizeQuestion(q);
  const metrics = findMetrics(t);
  const concepts = findConcepts(t);
  const { meds, unlisted } = findMeds(t, data, today);
  const range = parseRange(t, today, meds, data.medications);
  const classes = findClasses(t);
  // "blood thinners" names a medicine group, not the "bleeding or bruising" symptom.
  const conceptsKept = classes.length ? concepts.filter((c) => c !== "bleeding_or_bruising") : concepts;
  const notRecorded = findNotRecorded(t);
  const prescribers = findPrescribers(t, data, today);
  const base = { metrics, concepts: conceptsKept, meds, unlisted, range, classes, notRecorded, prescribers };
  return { normalized: t, ...base, intent: detectIntent(t, base, data) };
}

// ---------------------------------------------------------------------------
// Answer building

export interface QaResult {
  /** Evidence for the on-device model and the evidence chips (package items + items rendered for this question). */
  items: EvidenceItem[];
  /** 1–4 code-rendered sentences; each cites evidence ids present in `items` (or the package) and passed verifySentence. */
  deterministicAnswer: BriefSentence[];
  range: { from: ISODate; to: ISODate };
  intent: QaIntent;
  status: "answered" | "not_found";
  /** Shown when nothing in the records answers the question. */
  notFound: string | null;
  /** Sentences removed by the verifier (always 0 for code-rendered text; kept as a safety net). */
  dropped: number;
}

export interface RetrieveInput {
  data: StoreData;
  pkg: EvidencePackage;
  today: ISODate;
  /** The current medication review (useDerived().review). Optional: without it, findings are read from the package. */
  review?: MedReview;
  kb?: BriefKb;
  /** KB "known effect" lookup (defaults to the compiled KB). */
  isKnownEffect?: (ingredientIds: string[], metric: MetricKey) => boolean;
}

export const NOT_FOUND_TEXT =
  "I couldn't find that in the records. Try asking about a symptom (\"How many near-falls since lorazepam started?\"), a medicine (\"Which medicines are on the Beers list?\") or a period (\"What changed in the last two weeks?\").";

export const MAX_ANSWER_SENTENCES = 4;

/** Phrases to build a sentence about a boolean diary item ("Dizziness was" / "Near-falls were"). */
const SUBJECT_VERB: Record<MetricKey, string> = {
  dizziness: "Dizziness was",
  drowsiness: "Daytime drowsiness was",
  confusion: "Confusion or memory fog was",
  fall: "Falls were",
  nearFall: "Near-falls were",
  swelling: "Ankle swelling was",
  appetiteWorse: "A poor appetite was",
  energy: "Energy ratings were",
  sleep: "Sleep quality ratings were",
};
const NOUN: Record<MetricKey, string> = {
  dizziness: "dizziness",
  drowsiness: "daytime drowsiness",
  confusion: "confusion or memory fog",
  fall: "a fall",
  nearFall: "a near-fall",
  swelling: "ankle swelling",
  appetiteWorse: "a poor appetite",
  energy: "energy",
  sleep: "sleep",
};

class Answer {
  readonly items: BriefEvidenceItem[] = [];
  readonly sentences: BriefSentence[] = [];
  private readonly ids = new Set<string>();
  constructor(private readonly pkgIds: Map<string, BriefEvidenceItem>) {}

  /** Add an evidence item (reusing the package item when the id exists there). */
  item(id: string, kind: EvidenceKind, text: string, data?: EvidenceData): BriefEvidenceItem {
    const existing = this.pkgIds.get(id);
    const it: BriefEvidenceItem = existing ?? (data ? { id, kind, text: oneLine(text), data } : { id, kind, text: oneLine(text) });
    if (!this.ids.has(it.id)) {
      this.ids.add(it.id);
      this.items.push(it);
    }
    return it;
  }

  /** Include a package item as context without saying it. */
  context(id: string): void {
    const it = this.pkgIds.get(id);
    if (it && !this.ids.has(id)) {
      this.ids.add(id);
      this.items.push(it);
    }
  }

  /** Say one sentence that restates `text`, citing `cite` (the first cited id must contain the text's facts). */
  say(text: string, cite: string[]): void {
    if (this.sentences.length >= MAX_ANSWER_SENTENCES) return;
    const t = oneLine(text);
    if (!t || this.sentences.some((s) => s.text === t)) return;
    this.sentences.push({ text: t, evidenceIds: [...new Set(cite)].slice(0, 6) });
  }

  /** Create an item whose text IS the sentence, and say it. */
  fact(id: string, text: string, data?: EvidenceData, extraCites: string[] = []): void {
    const it = this.item(id, "fact", text, data);
    this.say(it.text, [it.id, ...extraCites.filter((x) => this.pkgIds.has(x) || this.ids.has(x))]);
  }
}

/** Evidence id for an item rendered for one question: "fact:qa:count:dizziness:2026-09-25:2026-10-11". */
function slug(prefix: string, ...parts: (string | number | undefined)[]): string {
  const rest = parts
    .filter((x) => x !== undefined && x !== "")
    .map((x) => String(x).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""));
  return [prefix, ...rest].join(":");
}

function spanWords(from: ISODate, to: ISODate, ref: ISODate): string {
  return from === to ? `on ${dateWords(from, ref)}` : `from ${dateWords(from, ref)} through ${dateWords(to, ref)}`;
}

/** Sentences of a story that mention a pattern (for quoting); null when none do. */
function quoteFor(story: string, re: RegExp | null): string | null {
  const text = quotable(story);
  if (!text) return null;
  if (!re) return excerpt(text, 160);
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const hits = sentences.map((s) => s.trim()).filter((s) => re.test(s));
  if (!hits.length) return null;
  return excerpt(hits.slice(0, 2).join(" "), 160);
}

function rangeOrDefault(parsed: ParsedQuestion, pkg: EvidencePackage, today: ISODate): { from: ISODate; to: ISODate; label: string | null } {
  if (parsed.range) return { from: parsed.range.from, to: parsed.range.to, label: parsed.range.label };
  const to = minDate(pkg.to, today);
  return { from: minDate(pkg.from, to), to, label: null };
}

/**
 * Deterministic retrieval + answer for an in-scope question (call routeQuestion first). Never throws for odd
 * input; unknown questions return status "not_found" with NOT_FOUND_TEXT.
 */
export function retrieveForQuestion(q: string, input: RetrieveInput): QaResult {
  const { data, pkg, today } = input;
  const kb = input.kb ?? DEFAULT_KB;
  const parsed = parseQuestion(q, data, today);
  const pkgIds = new Map(pkg.items.map((i) => [i.id, i as BriefEvidenceItem]));
  const a = new Answer(pkgIds);
  const days = latestCheckInPerDate(data.checkIns).filter((c) => c.date <= today);
  const first = days[0]?.date ?? null;
  const name = patientFirstName(data.profile);
  const r = rangeOrDefault(parsed, pkg, today);
  let range: { from: ISODate; to: ISODate } = { from: r.from, to: r.to };
  const visible = rankFindings(findingsOf(input, data));

  const countSentence = (m: MetricKey, from: ISODate, to: ISODate, lead?: string) => {
    // Reuse the package count when the period matches it exactly.
    const pkgId = evidenceId.count(m);
    const pkgItem = pkgIds.get(pkgId);
    if (!lead && pkgItem && pkg.from === from && pkg.to === to) {
      a.item(pkgId, "fact", pkgItem.text);
      a.say(pkgItem.text, [pkgId]);
      return;
    }
    const def = getMetric(m);
    if (m === "fall" || m === "nearFall" || def.kind === "boolean") {
      const stat = windowStatFromDays(days, m, from, to);
      const dates = days.filter((c) => c.date >= from && c.date <= to && metricValue(c, m) === 1).map((c) => c.date);
      const span = lead ?? spanWords(from, to, today);
      // One day with one answer reads as yes or no, not "0 of 1 answered day" (one check-in per day is counted).
      const oneDay = !lead && from === to && stat.answered === 1;
      const text =
        stat.answered === 0
          ? `The ${m === "appetiteWorse" ? "appetite" : def.label.toLowerCase()} question was not answered ${span}.`
          : oneDay
            ? `${SUBJECT_VERB[m]} ${stat.positive ? "" : "not "}recorded ${span} (1 check-in that day).`
            : `${SUBJECT_VERB[m]} recorded on ${stat.positive} of ${stat.answered} answered ${plural(stat.answered, "day")} ${span}${dates.length && dates.length <= 6 ? ` (${dateListWords(dates, today)})` : ""}.`;
      a.fact(slug("fact:qa:count", m, from, to), text, { metric: m, from, to, positive: stat.positive, answered: stat.answered, dates });
      return;
    }
    const res = metricCountText(days, m, from, to);
    a.fact(slug("fact:qa:count", m, from, to), res.text, res.data);
  };

  switch (parsed.intent) {
    case "count":
    case "metric": {
      const metrics = parsed.metrics.slice(0, 2);
      const anchor = parsed.range?.kind === "since_med" ? data.medications.find((m) => m.id === parsed.range?.medId) : undefined;
      for (const m of metrics) {
        if (anchor && (m === "fall" || m === "nearFall")) {
          countSentence(m, range.from, range.to, `since ${medName(anchor)} was started on ${dateWords(anchor.startDate, today)}`);
        } else if (anchor) {
          const sig = findSignal(pkgIds, anchor.id, m);
          if (sig) {
            a.context(sig.id);
            a.say(signalSentence(sig), [sig.id]);
            continue;
          }
          countSentence(m, range.from, range.to, `since ${medName(anchor)} was started on ${dateWords(anchor.startDate, today)}`);
        } else countSentence(m, range.from, range.to);
      }
      if (anchor && metrics.some((m) => m === "fall" || m === "nearFall")) {
        const res = fallsSinceStartText(days, anchor, today);
        const id = evidenceId.fallsSince(anchor.id);
        const it = a.item(id, "fact", res.text, res.data);
        if (it.text.length <= 280) a.say(it.text, [it.id]);
      } else if (parsed.range?.kind === "before_med") {
        for (const m of metrics) {
          const sig = findSignal(pkgIds, parsed.range.medId, m);
          if (sig) {
            a.context(sig.id);
            a.say(signalSentence(sig), [sig.id]);
          }
        }
      } else if (!anchor && parsed.intent === "metric") {
        for (const m of metrics) {
          const sig = findSignal(pkgIds, undefined, m);
          if (sig) {
            a.context(sig.id);
            a.say(signalSentence(sig), [sig.id]);
          }
        }
      }
      for (const c of parsed.concepts.slice(0, 2)) conceptCount(a, days, c, range.from, range.to, today);
      // "Did it get better after X?" with no before period: say why there's no comparison instead of an after-only count.
      const cmpMed = anchor ?? (parsed.range?.kind === "before_med" ? data.medications.find((m) => m.id === parsed.range?.medId) : undefined);
      if (cmpMed && metrics.length && metrics.every((m) => !findSignal(pkgIds, cmpMed.id, m))) noBeforeSentence(a, cmpMed, metrics, days, first, today);
      break;
    }
    case "first_onset":
    case "last_time": {
      const fullFrom = parsed.range?.from ?? first ?? range.from;
      const fullTo = parsed.range?.to ?? today;
      range = { from: fullFrom, to: fullTo };
      for (const m of parsed.metrics.slice(0, 2)) {
        const def = getMetric(m);
        const hits = days.filter((c) => c.date >= fullFrom && c.date <= fullTo && (def.kind === "boolean" ? metricValue(c, m) === 1 : metricValue(c, m) !== null));
        if (!hits.length) {
          a.fact(slug("fact:qa:none", m, fullFrom, fullTo), `No ${m === "fall" ? "falls were" : m === "nearFall" ? "near-falls were" : `${NOUN[m]} was`} recorded ${spanWords(fullFrom, fullTo, today)}.`, { metric: m, from: fullFrom, to: fullTo });
          continue;
        }
        const firstHit = hits[0].date;
        const lastHit = hits[hits.length - 1].date;
        const diaryStart = first ? ` (the diary starts on ${dateWords(first, today)})` : "";
        if (parsed.intent === "first_onset") {
          a.fact(
            slug("fact:qa:first", m, fullFrom, fullTo),
            `${capitalizeFirst(NOUN[m])} was first recorded on ${dateWords(firstHit, today)}${parsed.range ? "" : diaryStart}, and most recently on ${dateWords(lastHit, today)}.`,
            { metric: m, dates: [firstHit, lastHit], checkInIds: [hits[0].id, hits[hits.length - 1].id] },
          );
          const sig = findSignal(pkgIds, undefined, m);
          if (sig) {
            a.context(sig.id);
            a.say(signalSentence(sig), [sig.id]);
          } else countSentence(m, range.from, range.to);
        } else {
          a.fact(slug("fact:qa:last", m, fullFrom, fullTo), `${capitalizeFirst(NOUN[m])} was most recently recorded on ${dateWords(lastHit, today)}.`, {
            metric: m,
            dates: [lastHit],
            checkInIds: [hits[hits.length - 1].id],
          });
          const c = hits[hits.length - 1];
          const quote = quoteFor(c.story, STORY_WORDS[m]);
          if (quote) quoteSentence(a, c, quote, name, today);
        }
      }
      break;
    }
    case "said": {
      // Her own words: check-in stories (matched by wording or by the concepts coded from them, so "my mouth
      // felt like sandpaper" counts as dry mouth) and notes she wrote herself. With no period named, the whole
      // diary is searched.
      const said = parsed.range ?? { from: first ?? range.from, to: today, label: "the whole diary" };
      range = { from: said.from, to: said.to };
      const medRes = parsed.meds.flatMap((m) =>
        [m.name.replace(/\(.*?\)/g, " "), ...[...m.name.matchAll(/\(([^)]*)\)/g)].map((x) => x[1])]
          .map((n) => n.toLowerCase().replace(/\b(?:otc|over the counter)\b/g, "").replace(/\s+/g, " ").trim())
          .filter((n) => n.length >= 3)
          .map((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)),
      );
      const res = [...parsed.metrics.map((m) => STORY_WORDS[m]), ...parsed.concepts.map((c) => CONCEPT_WORDS.find(([id]) => id === c)![1]), ...medRes];
      const re = res.length ? new RegExp(res.map((x) => x.source).join("|"), "i") : null;
      const topic =
        parsed.metrics.length || parsed.concepts.length || parsed.meds.length
          ? joinAnd([...parsed.metrics.map((m) => NOUN[m].replace(/^an? /, "")), ...parsed.concepts.map((c) => CONCEPT_LABEL[c]), ...(parsed.metrics.length || parsed.concepts.length ? [] : parsed.meds.map((m) => medName(m)))])
          : null;
      const ownWords = collectOwnWords(data, days, re, parsed.concepts);
      const inWin = (d: ISODate) => d >= said.from && d <= said.to;
      const withWords = days.filter((c) => inWin(c.date) && oneLine(c.story));
      const hits = ownWords.filter((w) => inWin(w.date));
      for (const w of hits.slice(-3)) {
        if (w.kind === "story") quoteSentence(a, w.checkIn, w.quote, name, today);
        else noteSentence(a, w.note, data, today, "note");
      }
      if (!hits.length) {
        const earlier = ownWords.filter((w) => w.date < said.from).pop();
        const none = withWords.length
          ? `${name}'s own words ${spanWords(said.from, said.to, today)} do not mention ${topic ?? "that"} (${withWords.length} ${plural(withWords.length, "check-in")} with her words)`
          : `${name} did not add her own words to any check-in ${spanWords(said.from, said.to, today)}`;
        a.fact(
          slug("fact:qa:said-none", topic ?? "any", said.from, said.to),
          `${none}${earlier ? `; she most recently mentioned it on ${dateWords(earlier.date, today)}` : ""}.`,
          { from: said.from, to: said.to, checkInIds: withWords.map((c) => c.id) },
        );
        if (earlier?.kind === "story") quoteSentence(a, earlier.checkIn, earlier.quote, name, today);
        else if (earlier?.kind === "note") noteSentence(a, earlier.note, data, today, "note");
      }
      for (const m of parsed.metrics.slice(0, 1)) countSentence(m, said.from, said.to);
      break;
    }
    case "beers": {
      const beers = visible.filter((f) => BEERS_CATEGORIES.has(f.category));
      const active = data.medications.filter((m) => isActiveOn(m, today));
      const target = parsed.meds.length ? beers.filter((f) => f.medIds.some((id) => parsed.meds.some((m) => m.id === id))) : beers;
      const medIds = [...new Set(target.flatMap((f) => f.medIds))].filter((id) => !parsed.meds.length || parsed.meds.some((m) => m.id === id));
      const names = medIds.map((id) => medName(data.medications.find((m) => m.id === id)));
      const source = sourceShorts([...new Set(beers.flatMap((f) => f.sourceIds))], kb)[0] ?? "the AGS Beers Criteria";
      const findIds = target.map((f) => evidenceId.finding(f.key)).filter((id) => pkgIds.has(id));
      findIds.forEach((id) => a.context(id));
      if (parsed.meds.length && !medIds.length) {
        a.fact(slug("fact:qa:beers-none", ...parsed.meds.map((m) => m.id)), `${joinAnd(parsed.meds.map(medName))} ${parsed.meds.length === 1 ? "does" : "do"} not appear in any ${source} prompt in this review.`);
        break;
      }
      if (!medIds.length) {
        a.fact(
          "fact:qa:beers-none",
          active.length
            ? `None of ${name}'s ${active.length} current ${plural(active.length, "medicine")} appear in ${source} prompts in this review.`
            : `${name}'s medication list is empty, so nothing was checked against ${source}.`,
        );
        break;
      }
      a.fact(
        slug("fact:qa:beers", ...medIds),
        parsed.meds.length
          ? `${joinAnd(names)} ${names.length === 1 ? "appears" : "appear"} in ${source} prompts in this review.`
          : `${medIds.length} of ${name}'s ${active.length} current medicines appear in ${source} prompts: ${joinAnd(names)}.`,
        { medIds },
        findIds.slice(0, 3),
      );
      const byCat = new Map<string, string[]>();
      for (const f of target) {
        const label = BEERS_PART[f.category] ?? CATEGORY_TEXT[f.category];
        const list = byCat.get(label) ?? [];
        const n = f.medIds.map((id) => medName(data.medications.find((m) => m.id === id))).join(" with ");
        if (!list.includes(n)) list.push(n);
        byCat.set(label, list);
      }
      for (const [label, list] of byCat) a.fact(slug("fact:qa:beers-part", label), `${label}: ${joinAnd(list)}.`, { medIds });
      break;
    }
    case "acb": {
      const acb = pkgIds.get(evidenceId.acb);
      const finding = visible.find((f) => f.category === "anticholinergic_burden");
      if (finding && pkgIds.has(evidenceId.finding(finding.key))) a.context(evidenceId.finding(finding.key));
      const findId = finding ? evidenceId.finding(finding.key) : null;
      if (acb) {
        a.item(acb.id, "fact", acb.text);
        a.say(acb.text, findId && pkgIds.has(findId) ? [acb.id, findId] : [acb.id]);
      } else a.fact("fact:qa:acb-none", `None of ${name}'s current medicines are on the anticholinergic burden (ACB) scale list in ${PRODUCT_NAME}'s reference set.`);
      if (finding && acb) {
        const src = sourceShorts(finding.sourceIds, kb).join("; ");
        a.fact(
          slug("fact:qa:acb-band", finding.key),
          `The ACB scale scores each listed medicine from 1 to 3 for anticholinergic effects; the published review threshold is a total of 3 or more${src ? ` (source: ${src})` : ""}.`,
        );
      }
      break;
    }
    case "fall_risk": {
      const ids = reviewFallRisk(input).filter((id) => data.medications.some((m) => m.id === id));
      const f = visible.find((x) => x.category === "fall_risk");
      if (f && pkgIds.has(evidenceId.finding(f.key))) a.context(evidenceId.finding(f.key));
      if (!ids.length) {
        a.fact("fact:qa:frid-none", `None of ${name}'s current medicines are on the fall-risk medicine lists in ${PRODUCT_NAME}'s reference set.`);
      } else {
        a.fact(slug("fact:qa:frid", ...ids), `${ids.length} of ${name}'s medicines are on published lists of medicines linked to falls: ${joinAnd(ids.map((id) => medName(data.medications.find((m) => m.id === id))))}.`, { medIds: ids });
      }
      const falls = fallsText(days, range.from, range.to);
      a.fact(slug("fact:qa:falls", range.from, range.to), falls.text, falls.data);
      break;
    }
    case "findings": {
      if (!visible.length) {
        a.fact("fact:qa:findings-none", `The medication review has no open prompts for ${name}'s current list.`);
        break;
      }
      const top = visible.slice(0, 3);
      top.forEach((f) => a.context(evidenceId.finding(f.key)));
      a.fact(
        slug("fact:qa:findings", visible.length),
        `The medication review lists ${visible.length} ${plural(visible.length, "prompt")} to discuss; the first ${top.length}: ${top.map((f) => oneLine(f.title).replace(/[.:]+$/, "")).join("; ")}.`,
        { findingKey: top[0].key },
      );
      break;
    }
    case "changes": {
      const win = parsed.range ?? { from: addDays(today, -13), to: today, label: "the last 14 days" };
      range = { from: win.from, to: win.to };
      changesAnswer(a, data, days, win.from, win.to, today);
      break;
    }
    case "med_list": {
      const meds = pkgIds.get(evidenceId.meds);
      const active = data.medications.filter((m) => isActiveOn(m, today));
      if (meds) {
        a.item(meds.id, "fact", meds.text);
        a.say(meds.text, [meds.id]);
      }
      active.forEach((m) => a.context(evidenceId.med(m.id)));
      a.fact(slug("fact:qa:med-names", active.length), `Current list: ${joinAnd(active.map((m) => medName(m)))}.`, { medIds: active.map((m) => m.id) });
      const stopped = data.medications.filter((m) => m.endDate && m.endDate < today && m.endDate >= range.from);
      if (stopped.length) a.fact(slug("fact:qa:stopped", ...stopped.map((m) => m.id)), `Stopped during this period: ${joinAnd(stopped.map((m) => `${medName(m)} (last taken ${dateWords(m.endDate!, today)})`))}.`);
      break;
    }
    case "med_detail": {
      for (const med of parsed.meds.slice(0, 2)) {
        const lead = medLead(parsed.normalized, med, today);
        if (lead) a.fact(slug("fact:qa:med", lead.kind, med.id), lead.text, { medIds: [med.id] });
        const text = medText(med, today, kb);
        const it = a.item(evidenceId.med(med.id), "med", text, { medIds: [med.id] });
        a.say(it.text.length <= 280 ? it.text : text, [it.id]);
        const ended = med.endDate && med.endDate < today;
        if (ended) a.fact(slug("fact:qa:ended", med.id), `${medName(med)} is no longer on the current list; the last day taken was ${dateWords(med.endDate!, today)}.`);
        const fs = visible.filter((f) => f.medIds.includes(med.id));
        fs.slice(0, 3).forEach((f) => a.context(evidenceId.finding(f.key)));
        if (fs.length) {
          a.fact(
            slug("fact:qa:med-findings", med.id),
            `${medName(med)} appears in ${fs.length} medication review ${plural(fs.length, "prompt")}${fs.length > 3 ? ", including" : ""}: ${fs.slice(0, 3).map((f) => oneLine(f.title).replace(/[.:]+$/, "")).join("; ")}.`,
            { medIds: [med.id] },
          );
        }
        for (const m of parsed.metrics.slice(0, 1)) {
          const sig = findSignal(pkgIds, med.id, m);
          if (sig) {
            a.context(sig.id);
            a.say(signalSentence(sig), [sig.id]);
          }
        }
      }
      break;
    }
    case "not_listed": {
      for (const u of parsed.unlisted.slice(0, 2)) {
        a.fact(slug("fact:qa:not-listed", ...u.ingredientIds), `${capitalizeFirst(u.name)} is not on ${name}'s medication list.`);
      }
      const meds = pkgIds.get(evidenceId.meds);
      if (meds) a.context(meds.id);
      break;
    }
    case "known_effect": {
      for (const med of parsed.meds.slice(0, 1)) {
        for (const m of parsed.metrics.slice(0, 1)) {
          const listed = med.ingredientIds.length > 0 && (input.isKnownEffect ?? knownEffect)(med.ingredientIds, m);
          a.fact(
            slug("fact:qa:effect", med.id, m),
            med.ingredientIds.length === 0
              ? `${medName(med)} is not in ${PRODUCT_NAME}'s reference set, so ${PRODUCT_NAME} has no effect information for it.`
              : listed
                ? `${PRODUCT_NAME}'s reference set lists ${getMetric(m).effectNoun} as a recognized possible effect of ${medName(med)}.`
                : `${PRODUCT_NAME}'s reference set does not list ${getMetric(m).effectNoun} as an effect of ${medName(med)}; that alone says nothing either way.`,
            { medIds: [med.id], metric: m },
          );
          const sig = findSignal(pkgIds, med.id, m);
          if (sig) {
            a.context(sig.id);
            a.say(signalSentence(sig), [sig.id]);
          }
        }
      }
      break;
    }
    case "missed_doses": {
      const win = parsed.range ?? { from: first ?? range.from, to: today, label: "the whole diary" };
      range = { from: win.from, to: win.to };
      const want = parsed.meds.map((m) => m.id);
      const missed = (c: CheckIn) =>
        (c.medNotes ?? []).filter((n) => MISSED_RE.test(n.text) && (!want.length || (n.medicationId !== null && want.includes(n.medicationId))));
      const hits = days.filter((c) => c.date >= win.from && c.date <= win.to && missed(c).length);
      if (!hits.length) {
        a.fact(slug("fact:qa:missed-none", win.from, win.to), `No missed or forgotten doses were mentioned in ${name}'s check-ins ${spanWords(win.from, win.to, today)}.`, { from: win.from, to: win.to });
      }
      for (const c of hits.slice(-3)) {
        const text = missed(c).map((n) => quotable(n.text)).filter(Boolean).join("; ");
        a.item(`entry:${c.id}:med-note`, "entry", `On ${dateWords(c.date, today)}, ${name} wrote: "${excerpt(text, 120)}"`, { checkInIds: [c.id], dates: [c.date] });
        a.say(`On ${dateWords(c.date, today)}, ${name} wrote: "${excerpt(text, 120)}"`, [`entry:${c.id}:med-note`]);
      }
      break;
    }
    case "notes": {
      const concerns = pkg.items.filter((i) => i.kind === "concern");
      const notes = data.notes
        .filter((n) => n.date >= range.from && n.date <= range.to)
        .sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? 1 : -1));
      const shown = new Set<string>();
      for (const c of concerns.slice(0, 2)) {
        const note = data.notes.find((n) => evidenceId.concern(n.id) === c.id);
        if (!note) continue;
        shown.add(note.id);
        noteSentence(a, note, data, today, "concern");
      }
      for (const n of notes) {
        if (shown.has(n.id) || a.sentences.length >= 3) continue;
        shown.add(n.id);
        noteSentence(a, n, data, today, "note");
      }
      if (!shown.size) a.fact(slug("fact:qa:notes-none", range.from, range.to), `No notes were written ${spanWords(range.from, range.to, today)}.`);
      break;
    }
    case "visit_questions": {
      const saved = data.savedQuestions ?? [];
      if (saved.length) {
        a.fact(slug("fact:qa:saved", saved.length), `${saved.length} ${plural(saved.length, "question is", "questions are")} saved for the visit.`);
        for (const sq of saved.slice(0, 2)) {
          const id = evidenceId.question(sq.id);
          const it = a.item(id, "note", `Saved question for the visit: "${excerpt(sq.text, 240)}"`);
          if (it.text.length <= 280) a.say(it.text, [it.id]);
        }
      }
      // Same breadth-first pick as the brief, so the questions cover different kinds of prompts.
      const seen = new Set<string>();
      for (const f of selectReviewPrompts(visible, 5)) {
        let q = oneLine(f.question);
        // Long two-part questions: keep the first question (it carries the diary link).
        if (q.length > 280) q = q.split(/(?<=\?)\s+/)[0];
        const norm = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const id = evidenceId.finding(f.key);
        if (!q || q.length > 280 || seen.has(norm) || !pkgIds.has(id)) continue;
        seen.add(norm);
        a.context(id);
        a.item(slug("fact:qa:question", f.key), "fact", `Suggested question from the medication review: ${q}`);
        a.say(q, [slug("fact:qa:question", f.key), id]);
      }
      break;
    }
    case "coverage": {
      const cov = coverageText(days, range.from, range.to);
      const pkgCov = pkgIds.get(evidenceId.coverage);
      if (pkgCov && pkg.from === range.from && pkg.to === range.to) {
        a.item(pkgCov.id, "fact", pkgCov.text);
        a.say(pkgCov.text, [pkgCov.id]);
      } else a.fact(slug("fact:qa:coverage", range.from, range.to), cov.text, cov.data);
      if (first) a.fact("fact:qa:diary-start", `The diary starts on ${dateWords(first, today)}.`);
      break;
    }
    case "summary": {
      // "Summarise this week", "How has she been this week?": the period asked about (the same 7-day window as
      // "sleep this week"), not the package's 30 days: check-ins, falls, and the symptoms recorded on the most days.
      if (parsed.range) {
        const { from, to } = range;
        const cov = coverageText(days, from, to);
        a.fact(slug("fact:qa:coverage", from, to), cov.text, cov.data);
        const falls = fallsText(days, from, to);
        a.fact(slug("fact:qa:falls", from, to), falls.text, falls.data);
        const top = (["dizziness", "drowsiness", "confusion", "swelling", "appetiteWorse"] as MetricKey[])
          .map((m) => ({ m, n: windowStatFromDays(days, m, from, to).positive }))
          .filter((x) => x.n > 0)
          .sort((x, y) => y.n - x.n)
          .slice(0, 2);
        for (const { m } of top) countSentence(m, from, to);
        break;
      }
      // No period named: the evidence package's period (the last 30 days in Ask), as its coverage sentence says.
      const cov = pkgIds.get(evidenceId.coverage);
      if (cov) {
        a.item(cov.id, "fact", cov.text);
        a.say(cov.text, [cov.id]);
      }
      const sig = findSignal(pkgIds, undefined, undefined);
      if (sig) {
        a.context(sig.id);
        a.say(signalSentence(sig), [sig.id]);
      }
      const since = pkg.items.find((i) => i.id.startsWith("fact:falls-since:"));
      if (since && since.text.length <= 280) {
        a.item(since.id, "fact", since.text);
        a.say(since.text, [since.id]);
      }
      const acb = pkgIds.get(evidenceId.acb);
      if (acb) {
        a.item(acb.id, "fact", acb.text);
        a.say(acb.text, [acb.id]);
      }
      break;
    }
    case "day": {
      const c = days.find((d) => d.date === range.from);
      if (!c) {
        a.fact(slug("fact:qa:day-none", range.from), `No check-in was recorded on ${dateWords(range.from, today)}.`, { from: range.from, to: range.to });
        break;
      }
      const answers = excerpt(answersInWords(c), 220);
      a.fact(slug("fact:qa:day", c.id), `${dateWords(c.date, today)} check-in${c.revision > 1 ? " (edited)" : ""}: ${answers}.`, { checkInIds: [c.id], dates: [c.date] });
      const quote = quoteFor(c.story, null);
      if (quote) quoteSentence(a, c, quote, name, today);
      break;
    }
    case "med_class": {
      const active = data.medications.filter((m) => isActiveOn(m, today));
      for (const cls of parsed.classes.slice(0, 2)) {
        const display = getClass(cls)?.display ?? cls;
        const inClass = active.filter((m) => m.ingredientIds.some((id) => classesOf(id).includes(cls)));
        inClass.forEach((m) => a.context(evidenceId.med(m.id)));
        a.fact(
          slug("fact:qa:class", cls),
          inClass.length
            ? `Medicines on ${name}'s current list in the "${display}" group: ${joinAnd(inClass.map((m) => medName(m)))}.`
            : `None of ${name}'s ${active.length} current medicines is in the "${display}" group of ${PRODUCT_NAME}'s reference set.`,
          { medIds: inClass.map((m) => m.id) },
        );
      }
      const unmatched = active.filter((m) => m.ingredientIds.length === 0);
      if (unmatched.length) {
        a.fact("fact:qa:unmatched", `${unmatched.length} ${plural(unmatched.length, "medicine is", "medicines are")} not in ${PRODUCT_NAME}'s reference set and could not be checked: ${joinAnd(unmatched.map((m) => medName(m)))}.`);
      }
      break;
    }
    case "not_recorded": {
      const topic = parsed.notRecorded!;
      const active = data.medications.filter((m) => isActiveOn(m, today));
      const related = topic.reason ? active.filter((m) => topic.reason!.test(m.reason)) : [];
      a.fact(slug("fact:qa:not-recorded", topic.label), `${PRODUCT_NAME} doesn't record ${topic.label}; ${name}'s care team would have them.`);
      if (related.length) {
        related.forEach((m) => a.context(evidenceId.med(m.id)));
        a.fact(
          slug("fact:qa:not-recorded-meds", topic.label, ...related.map((m) => m.id)),
          `${name}'s medication list has ${joinAnd(related.map((m) => medForReason(m)))}.`,
          { medIds: related.map((m) => m.id) },
        );
      }
      break;
    }
    case "prescriber": {
      const active = data.medications.filter((m) => isActiveOn(m, today));
      for (const p of parsed.prescribers.names.slice(0, 2)) {
        const mine = active.filter((m) => oneLine(m.prescriber) === p);
        mine.forEach((m) => a.context(evidenceId.med(m.id)));
        a.fact(
          slug("fact:qa:prescriber", p),
          `The list records ${p} as the prescriber for ${mine.length} of ${name}'s ${active.length} current ${plural(active.length, "medicine")}: ${joinAnd(mine.map((m) => medName(m)))}.`,
          { medIds: mine.map((m) => m.id) },
        );
      }
      if (!parsed.prescribers.names.length && parsed.prescribers.unknownDoctor) {
        const all = [...new Set(active.map((m) => oneLine(m.prescriber)).filter(Boolean))];
        a.fact(
          slug("fact:qa:prescriber-none", parsed.prescribers.unknownDoctor),
          `No medicine on ${name}'s current list is recorded as prescribed by ${parsed.prescribers.unknownDoctor}${all.length ? `; the prescribers recorded are ${joinAnd(all)}` : ""}.`,
        );
      }
      break;
    }
    case "interactions": {
      // Only the combinations AGS Beers 2023 lists (its drug-drug pairs and the "3 or more brain-active medicines"
      // count), as the medication review found them. Kinwise is not an interaction checker, and the answer always
      // ends by saying so and pointing to the pharmacist. It never says a combination is fine.
      const active = data.medications.filter((m) => isActiveOn(m, today));
      const combos = visible.filter((f) => f.category === "beers_interaction" || f.category === "cns_active_combo");
      const named = parsed.meds;
      const involving = named.length ? combos.filter((f) => f.medIds.some((id) => named.some((m) => m.id === id))) : combos;
      // A question about one combination ("Do lorazepam and Tylenol PM interact?", or a medicine not on her list):
      // only a finding that includes every medicine named answers it. Others that involve them get their own lead-in,
      // so nobody reads them as the pair asked about.
      const pairQuestion = named.length >= 2 || parsed.unlisted.length > 0;
      const target = !pairQuestion ? involving : parsed.unlisted.length ? [] : involving.filter((f) => named.every((m) => f.medIds.includes(m.id)));
      // (Only with a listed medicine named: "Does oxycodone interact with anything?" names none of hers.)
      const others = pairQuestion && named.length ? involving.filter((f) => !target.includes(f)) : [];
      // A combination the family dismissed is still on her list and was still found: never answer "none was found"
      // over it. The same filter as `target`, over the dismissed combination prompts only.
      const dismissed = allFindingsOf(input).filter(
        (f) => (f.category === "beers_interaction" || f.category === "cns_active_combo") && decisionFor(data.reviewDecisions, f.key) === "dismissed",
      );
      const dismissedHere = parsed.unlisted.length
        ? []
        : dismissed.filter((f) => (named.length >= 2 ? named.every((m) => f.medIds.includes(m.id)) : !named.length || f.medIds.some((id) => named.some((m) => m.id === id))));
      const idsOf = (list: Finding[]) => list.map((f) => evidenceId.finding(f.key)).filter((id) => pkgIds.has(id));
      idsOf([...target, ...others]).forEach((id) => a.context(id));
      const describe = (list: Finding[]) =>
        list.slice(0, 2).map((f) => `${joinAnd(f.medIds.map((id) => medName(data.medications.find((m) => m.id === id))))} — ${oneLine(f.title).replace(/[.:]+$/, "")}`);
      if (!active.length) {
        a.fact("fact:qa:combos-empty", `${name}'s medication list is empty, so no medicine combinations were checked.`);
      } else {
        // A medicine that is not on her list was never checked; say so rather than "none found".
        for (const u of parsed.unlisted.slice(0, 2)) {
          a.fact(slug("fact:qa:combos-unlisted", ...u.ingredientIds), `${capitalizeFirst(u.name)} is not on ${name}'s list, so ${PRODUCT_NAME} did not check it.`);
        }
        if (!target.length && dismissedHere.length) {
          // "1 AGS Beers 2023 combination prompt on Margaret's list (Oxybutynin and Tylenol PM (OTC) — …) was marked
          // dismissed in the medication review." A fact, never "none found".
          const n = dismissedHere.length;
          a.fact(
            slug("fact:qa:combos-dismissed", ...dismissedHere.map((f) => f.key)),
            `${n} AGS Beers 2023 combination ${plural(n, "prompt")} on ${name}'s list (${describe(dismissedHere).join("; ")}) ${n === 1 ? "was" : "were"} marked dismissed in the medication review.`,
            { medIds: [...new Set(dismissedHere.flatMap((f) => f.medIds))] },
          );
        } else if (target.length) {
          a.fact(
            slug("fact:qa:combos", ...target.map((f) => f.key)),
            `${target.length} medicine ${plural(target.length, "combination")} on ${name}'s current list ${target.length === 1 ? "is" : "are"} listed in AGS Beers 2023${target.length > 2 ? ", including" : ""}: ${describe(target).join("; ")}.`,
            { medIds: [...new Set(target.flatMap((f) => f.medIds))] },
            idsOf(target).slice(0, 3),
          );
        } else if (named.length >= 2 && !parsed.unlisted.length) {
          a.fact(
            slug("fact:qa:combos-pair-none", ...named.map((m) => m.id)),
            `The combination of ${joinAnd(named.map((m) => medName(m)))} is not among the AGS Beers 2023 combinations found on ${name}'s list.`,
            { medIds: named.map((m) => m.id) },
          );
        } else if (named.length === 1 && !parsed.unlisted.length) {
          // Scoped to her list: Beers may well list combinations for this medicine with medicines she doesn't take.
          a.fact(
            slug("fact:qa:combos-none", named[0].id),
            `None of the medicine combinations listed in AGS Beers 2023 was found on ${name}'s current list for ${medName(named[0])}.`,
            { medIds: [named[0].id] },
          );
        } else if (!named.length && !parsed.unlisted.length) {
          a.fact("fact:qa:combos-none", `No medicine combination listed in AGS Beers 2023 was found on ${name}'s current list.`);
        }
        if (others.length) {
          const inv = named.filter((m) => others.some((f) => f.medIds.includes(m.id)));
          a.fact(
            slug("fact:qa:combos-also", ...others.map((f) => f.key)),
            `Also on ${name}'s list, involving ${joinAnd(inv.map((m) => medName(m)))}: ${describe(others).join("; ")}.`,
            { medIds: [...new Set(others.flatMap((f) => f.medIds))] },
            idsOf(others).slice(0, 3),
          );
        }
      }
      a.fact(
        "fact:qa:combos-scope",
        `${PRODUCT_NAME} only checks the medicine combinations listed in AGS Beers 2023; it is not a full interaction checker. Ask ${pronounsFor(data.profile).possessive} pharmacist to check interactions.`,
      );
      break;
    }
    case "unknown":
      break;
  }
  // Safety net: every sentence must pass the same checker the AI output is held to.
  const merged: EvidencePackage = { ...pkg, items: [...pkg.items, ...a.items.filter((i) => !pkgIds.has(i.id))] };
  const medNames = data.medications.map((m) => m.name);
  const kept = a.sentences.filter((s) => verifySentence(s, merged, { medNames, patientNames: [name] }).ok);
  const status = kept.length ? "answered" : "not_found";
  return {
    items: a.items,
    deterministicAnswer: kept,
    range,
    intent: parsed.intent,
    status,
    notFound: status === "not_found" ? NOT_FOUND_TEXT : null,
    dropped: a.sentences.length - kept.length,
  };
}

// ---------------------------------------------------------------------------
// Answer helpers

/** Medicine remarks that describe a missed dose ("forgot my water pill", "skipped the evening one"). */
const MISSED_RE = /\bmiss\w*|\bforg[eo]t\w*|\bskipp?\w*|\bdidn'?t take\b|\bdid not take\b|\bran out\b|\bleft (?:it|them) off\b/i;

const BEERS_PART: Partial<Record<Finding["category"], string>> = {
  beers_avoid: "Listed as medicines older adults should generally avoid",
  beers_caution: "Listed as medicines to use with caution",
  beers_condition: "Listed for a health condition or what the diary recorded",
  beers_interaction: "Listed as a combination",
  beers_renal: "Listed for kidney function",
};

/** A direct first sentence for "when did she start X / who prescribed X / what is X for / what dose of X". */
function medLead(t: string, med: Medication, today: ISODate): { kind: string; text: string } | null {
  const name = medName(med);
  if (/\bwhen\b[^?]*\b(?:stop\w*|end\w*|come off|came off)\b/.test(t)) {
    return med.endDate && med.endDate < today
      ? { kind: "stop", text: `${name} was stopped; the last day taken was ${dateWords(med.endDate, today)}.` }
      : { kind: "stop", text: `${name} is still on the current list; no stop date is recorded.` };
  }
  if (/\b(?:when|what date|how long)\b[^?]*\b(?:start\w*|begin|began|on it|been on|taking)\b/.test(t) && isValidDate(med.startDate)) {
    return { kind: "start", text: `${name} was started on ${dateWords(med.startDate, today)}.` };
  }
  if (/\bwho (?:prescribed|gave|ordered|started)\b|\bprescriber\b|\bwhich doctor\b/.test(t)) {
    const who = oneLine(med.prescriber);
    return { kind: "prescriber", text: who ? `${name} was prescribed by ${who}, as recorded by the family.` : `No prescriber is recorded for ${name}.` };
  }
  // "Reason" only as "the reason for taking it / she takes it", never "the reason she fell" (routed away as a cause question).
  if (/\bwhat (?:is|'s) (?:the |her |his )?\w+(?: \w+)? for\b|\bwhy (?:does|did|is) (?:she|he) (?:take|taking|on)\b|\bwhat (?:does|did) (?:she|he) take \w+(?: \w+)? for\b|\breason (?:for (?:taking|it|the \w+|her \w+)|(?:why )?(?:she|he) (?:takes|is (?:on|taking))|it was (?:prescribed|given|started))\b/.test(t)) {
    const reason = oneLine(med.reason);
    return {
      kind: "reason",
      text: reason ? `On the family's list, ${name} is taken for ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.` : `The family's list does not say what ${name} is taken for.`,
    };
  }
  if (/\b(?:dose|dosage|how much|how often|what strength|how many)\b/.test(t)) {
    const how = [oneLine(med.dose), oneLine(med.frequency)].filter(Boolean).join(", ");
    // "as needed" once: the frequency often says it already ("at bedtime as needed").
    const prn = med.asNeeded && !/\bas needed\b/i.test(how) ? ", as needed" : "";
    return { kind: "dose", text: how ? `The list records ${name} as ${how}${prn}.` : `No dose is recorded for ${name}.` };
  }
  return null;
}

/** "Amlodipine for blood pressure (Dr. Okafor)": a medicine with its recorded reason and prescriber. */
function medForReason(m: Medication): string {
  const reason = oneLine(m.reason);
  const who = oneLine(m.prescriber).replace(/\s*\([^)]*\)\s*/g, " ").trim();
  return `${medName(m)}${reason ? ` for ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : ""}${who ? ` (${who})` : ""}`;
}

/**
 * Why a before/after question about a medicine has no comparison: the diary starts after the medicine was started,
 * or the 21 days before it hold too few answered days (the timeline engine's own minimum).
 */
function noBeforeSentence(a: Answer, med: Medication, metrics: MetricKey[], days: CheckIn[], first: ISODate | null, today: ISODate): void {
  if (!isValidDate(med.startDate)) return;
  const name = medName(med);
  if (!first || first > med.startDate) {
    a.fact(
      slug("fact:qa:no-before", med.id),
      first
        ? `The diary starts on ${dateWords(first, today)}, after ${name} was started on ${dateWords(med.startDate, today)}, so there's no before period to compare.`
        : `No check-ins are recorded, so there's no before period to compare with ${name}.`,
      { medIds: [med.id], dates: first ? [first, med.startDate] : [med.startDate] },
    );
    return;
  }
  const w = eventWindows(med, { medicationId: med.id, kind: "started", date: med.startDate }, today);
  const need = TIMELINE_RULES.minAnsweredDays;
  const best = Math.max(0, ...metrics.map((m) => windowStatFromDays(days, m, w.before.from, w.before.to).answered));
  if (best >= need) return;
  a.fact(
    slug("fact:qa:few-before", med.id, ...metrics),
    `${best === 0 ? "No answered days" : best === 1 ? "Only 1 answered day" : `Only ${best} answered days`} in the ${daysBetween(w.before.from, w.before.to) + 1} days before ${name} was started on ${dateWords(med.startDate, today)}; at least ${need} are needed to compare before and after.`,
    { medIds: [med.id], from: w.before.from, to: w.before.to },
  );
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Every finding of the review, dismissed ones included. */
function allFindingsOf(input: RetrieveInput): Finding[] {
  return input.review?.findings ?? findingsFromPackage(input.pkg);
}

/** The review's findings the family has not dismissed. */
function findingsOf(input: RetrieveInput, data: StoreData): Finding[] {
  return allFindingsOf(input).filter((f) => decisionFor(data.reviewDecisions, f.key) !== "dismissed");
}

/**
 * Without a MedReview, findings are reconstructed from the package's find:* items (title = first sentence,
 * category from the rule id). The UI passes `review` so titles, categories and questions are exact.
 */
function findingsFromPackage(pkg: EvidencePackage): Finding[] {
  return pkg.items
    .filter((i) => i.kind === "finding")
    .map((i) => {
      const d = (i as BriefEvidenceItem).data;
      const key = d?.findingKey ?? i.id.slice("find:".length);
      return {
        key,
        ruleId: key.split(":")[0],
        category: guessCategory(key),
        title: i.text.split(/(?<=\.)\s/)[0] ?? i.text,
        medIds: d?.medIds ?? [],
        plain: "",
        clinician: "",
        question: "",
        sourceIds: [],
        evidenceGrade: null,
        relatedSymptoms: d?.metric ? [d.metric] : [],
        signalIds: [],
      };
    });
}

function guessCategory(key: string): Finding["category"] {
  if (/^pim|beers-pim/.test(key)) return "beers_avoid";
  if (/^cond|condition/.test(key)) return "beers_condition";
  if (/^ddi|interaction/.test(key)) return "beers_interaction";
  if (/^acb/.test(key)) return "anticholinergic_burden";
  if (/^fall/.test(key)) return "fall_risk";
  if (/cascade|edema/.test(key)) return "prescribing_cascade";
  if (/^caution/.test(key)) return "beers_caution";
  if (/^renal/.test(key)) return "beers_renal";
  if (/^dup/.test(key)) return "duplicate_class";
  if (/^cns/.test(key)) return "cns_active_combo";
  return "monitoring";
}

function reviewFallRisk(input: RetrieveInput): string[] {
  if (input.review) return input.review.fallRiskMedIds;
  const f = findingsFromPackage(input.pkg).find((x) => x.category === "fall_risk");
  return f?.medIds ?? [];
}

/** The strongest package signal for a medicine and/or metric (package order is strongest first). */
function findSignal(pkgIds: Map<string, BriefEvidenceItem>, medId: string | undefined, m: MetricKey | undefined): BriefEvidenceItem | null {
  for (const it of pkgIds.values()) {
    if (it.kind !== "signal") continue;
    const d = it.data;
    if (medId && !(d?.medIds ?? []).includes(medId) && !it.id.includes(`:${medId}:`)) continue;
    if (m && d?.metric !== m && !it.id.includes(`:${m}:`)) continue;
    return it;
  }
  return null;
}

/** The signal sentence without the package's caveat (short enough for an answer; numbers identical). */
function signalSentence(it: BriefEvidenceItem): string {
  const first = it.text.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? it.text;
  return first;
}

function quoteSentence(a: Answer, c: CheckIn, quote: string, name: string, today: ISODate): void {
  const id = `entry:${c.id}:words`;
  const text = `In ${name}'s words on ${dateWords(c.date, today)}: "${quote}"`;
  a.item(id, "entry", text, { checkInIds: [c.id], dates: [c.date] });
  a.say(text, [id]);
}

type OwnWords =
  | { kind: "story"; date: ISODate; checkIn: CheckIn; quote: string }
  | { kind: "note"; date: ISODate; note: StoreData["notes"][number] };

/**
 * Every place the person's own words touch a topic, oldest first: check-in stories whose wording matches `re`
 * or whose coded symptoms include one of `concepts` (quoting the coded phrase), and notes she wrote herself.
 * With no topic (`re` null and no concepts), every story and patient note counts.
 */
function collectOwnWords(data: StoreData, days: CheckIn[], re: RegExp | null, concepts: ConceptId[]): OwnWords[] {
  const out: OwnWords[] = [];
  for (const c of days) {
    if (!oneLine(c.story)) continue;
    let quote = quoteFor(c.story, re);
    if (!quote && concepts.length) {
      const coded = (c.otherSymptoms ?? []).find((o) => o.present && concepts.includes(o.conceptId));
      // Quote the sentence holding the coded phrase ("Groggy until ten, and my mouth felt like sandpaper.").
      const phrase = oneLine(coded?.span?.quote ?? "");
      if (coded) quote = (phrase && quoteFor(c.story, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))) || quoteFor(c.story, null);
    }
    if (quote) out.push({ kind: "story", date: c.date, checkIn: c, quote });
  }
  for (const n of data.notes) {
    if (n.author !== "patient" || !oneLine(n.text) || !isValidDate(n.date)) continue;
    if (re && !re.test(n.text)) continue;
    out.push({ kind: "note", date: n.date, note: n });
  }
  return out.sort((x, y) => (x.date === y.date ? (x.kind === y.kind ? 0 : x.kind === "story" ? -1 : 1) : x.date < y.date ? -1 : 1));
}

function noteSentence(a: Answer, n: StoreData["notes"][number], data: StoreData, today: ISODate, kind: "note" | "concern"): void {
  const full = noteText(n, data, today);
  const id = kind === "concern" ? evidenceId.concern(n.id) : evidenceId.note(n.id);
  if (full.length <= 280) {
    a.item(id, kind, full, { noteIds: [n.id], dates: [n.date] });
    a.say(full, [id]);
    return;
  }
  const short = full.replace(/"(.*)"$/, (_, inner: string) => `"${excerpt(inner, 200)}"`);
  const sid = `${id}:short`;
  a.item(sid, kind, short, { noteIds: [n.id], dates: [n.date] });
  a.say(short, [sid]);
}

function conceptCount(a: Answer, days: CheckIn[], c: ConceptId, from: ISODate, to: ISODate, today: ISODate): void {
  const inRange = days.filter((d) => d.date >= from && d.date <= to);
  const hits = inRange.filter((d) => (d.otherSymptoms ?? []).some((o) => o.conceptId === c && o.present));
  const label = CONCEPT_LABEL[c];
  a.fact(
    slug("fact:qa:concept", c, from, to),
    hits.length
      ? `${capitalizeFirst(label)} came up in ${hits.length} of ${inRange.length} check-ins ${spanWords(from, to, today)} (${dateListWords(hits.map((d) => d.date), today)}).`
      : `${capitalizeFirst(label)} did not come up in the ${inRange.length} ${plural(inRange.length, "check-in")} ${spanWords(from, to, today)}.`,
    { from, to, dates: hits.map((d) => d.date), checkInIds: hits.map((d) => d.id) },
  );
}

/** "What changed in the last two weeks?": medicine changes, then the biggest diary changes vs the period before. */
function changesAnswer(a: Answer, data: StoreData, days: CheckIn[], from: ISODate, to: ISODate, today: ISODate): void {
  const changes: { date: ISODate; text: string; medId: string }[] = [];
  for (const m of data.medications) {
    if (m.startDate >= from && m.startDate <= to) changes.push({ date: m.startDate, text: `${medName(m)} started ${dateWords(m.startDate, today)}`, medId: m.id });
    if (m.endDate && m.endDate >= from && m.endDate <= to && m.endDate < today) changes.push({ date: m.endDate, text: `${medName(m)} stopped after ${dateWords(m.endDate, today)}`, medId: m.id });
  }
  for (const e of data.medEvents ?? []) {
    if (e.kind !== "dose_changed" || e.date < from || e.date > to) continue;
    const m = data.medications.find((x) => x.id === e.medicationId);
    changes.push({ date: e.date, text: `${medName(m)} dose changed ${dateWords(e.date, today)}`, medId: e.medicationId });
  }
  changes.sort((x, y) => (x.date < y.date ? -1 : 1));
  const span = spanWords(from, to, today);
  if (changes.length) {
    a.fact(slug("fact:qa:med-changes", from, to), `Medicine changes ${span}: ${joinAnd(changes.slice(0, 4).map((c) => c.text))}.`, { medIds: changes.map((c) => c.medId) });
  } else {
    const prior = data.medications
      .filter((m) => m.startDate < from && daysBetween(m.startDate, from) <= 180)
      .sort((x, y) => (x.startDate < y.startDate ? 1 : -1))[0];
    a.fact(
      slug("fact:qa:med-changes", from, to),
      prior
        ? `No medicine was started or stopped ${span}; the most recent change before that was ${medName(prior)}, started ${dateWords(prior.startDate, today)}.`
        : `No medicine was started or stopped ${span}.`,
      prior ? { medIds: [prior.id] } : undefined,
    );
  }
  // Diary changes vs the same number of days just before.
  const len = daysBetween(from, to) + 1;
  const pFrom = addDays(from, -len);
  const pTo = addDays(from, -1);
  const scored: { m: MetricKey; score: number; text: string }[] = [];
  for (const m of ["dizziness", "drowsiness", "confusion", "nearFall", "fall", "swelling", "appetiteWorse", "energy", "sleep"] as MetricKey[]) {
    const def = getMetric(m);
    const now = windowStatFromDays(days, m, from, to);
    const before = windowStatFromDays(days, m, pFrom, pTo);
    if (now.answered < 3 || before.answered < 3) continue;
    const diff = now.value - before.value;
    const score = def.kind === "boolean" ? Math.abs(diff) : Math.abs(diff) / 4;
    const meaningful = def.kind === "boolean" ? Math.abs(diff) >= 0.2 && Math.abs(now.positive - before.positive) >= 2 : Math.abs(diff) >= 0.6;
    if (!meaningful) continue;
    const text =
      def.kind === "boolean"
        ? `${SUBJECT_VERB[m]} recorded on ${now.positive} of ${now.answered} answered days ${span}, compared with ${before.positive} of ${before.answered} in the ${len} days before.`
        : `${def.subject} averaged ${now.value.toFixed(1)} out of 5 ${span}, compared with ${before.value.toFixed(1)} in the ${len} days before.`;
    scored.push({ m, score, text });
  }
  scored.sort((x, y) => y.score - x.score);
  for (const s of scored.slice(0, 2)) a.fact(slug("fact:qa:change", s.m, from, to), s.text, { metric: s.m, from: pFrom, to });
  if (!scored.length) a.fact(slug("fact:qa:no-change", from, to), `The diary items changed little ${span} compared with the ${len} days before.`, { from: pFrom, to });
  const f = fallsText(days, from, to);
  if ((f.data.positive ?? 0) > 0) a.fact(slug("fact:qa:falls", from, to), f.text, f.data);
}
