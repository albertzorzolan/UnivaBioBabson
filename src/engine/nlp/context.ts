// ConText (Harkema et al., J Biomed Inform 2009) adapted to first-person health diaries.
//
// For every concept mention we decide three properties, each defaulting to the "normal" value:
//   negation     affirmed (default) | negated            "no dizziness", "didn't fall", "dizziness is gone"
//   temporality  current (default) | historical | hypothetical
//                                                        "yesterday", "last week", "on Tuesday" | "if", "afraid I'll"
//   experiencer  patient (default) | other               "my granddaughter fell", "Bob was dizzy"
//
// Algorithm (as in ConText): mark trigger terms, pseudo-triggers and termination terms; a trigger
// changes the property of every mention inside its scope. Scope runs from the trigger to the end
// of the sentence, cut short by termination terms ("but", "however", "which", ";", …).
// Adaptations for patient-written text, each a general rule rather than a per-case patch:
//   - Negation scope also ends at a new conjunct ("No falls, felt dizzy" / "didn't fall and felt
//     dizzy"): a comma or "and" followed by a new subject, finite verb or quantified noun phrase.
//   - Post-negation ("Falls? None.", "dizziness is gone") looks backward to the previous boundary.
//   - "Resolution" post-triggers ("went away", "passed") only negate when the sentence does not say
//     the symptom happened earlier today ("dizzy this morning, gone by lunch" is still today's).
//   - Historical time expressions apply in both directions ("I fell yesterday" / "Yesterday I fell");
//     current-time expressions ("today", "this morning", "last night") end their scope.
//   - Experiencer is decided by the nearest preceding person referent (subject of the clause),
//     ignoring observers ("my daughter says I seemed confused" → patient). Caregiver-voice stories
//     ("Typing for Mum: she was confused") flip pronoun resolution so "she" is the patient.
//   - Pseudo-triggers ("no better", "not only", "won't go away", "can't say I wasn't") suppress any
//     trigger they overlap — this is how double negation is handled.
//
// Pure module (no DOM, no Date). Trigger lists are typed data so they can be reviewed/extended.

import { findBoundaries, splitSentences, tokenize, type Boundary, type Segment, type Token } from "./segment";
import { buildTextView, type TextView } from "./normalize";
import { lexiconVocabulary, matchLexicon } from "./lexicon";
import type { Mention, Span } from "../../model/types";

// ---------------------------------------------------------------------------
// Trigger rules (typed data, adapted from the ConText / medspaCy English rule set)

export type TriggerKind =
  | "negation"
  | "pseudo"
  | "historical"
  | "current"
  | "hypothetical"
  | "uncertain"
  | "correction"
  | "corrective"
  | "resolution"
  | "presuppose";

export type TriggerDirection = "forward" | "backward" | "both" | "none";

export interface TriggerRule {
  id: string;
  kind: TriggerKind;
  direction: TriggerDirection;
  /** For forward hypothetical/uncertain triggers: "clause" (modal verbs) or "sentence" ("if"). */
  scope?: "clause" | "sentence";
  /** For current-time expressions: an earlier time today, or "now"/later. */
  anchor?: "earlier" | "now";
  /** Regex source over the normalised lower-case view text. */
  pattern: string;
}

const NEG_AUX =
  "(?:didn't|did not|don't|do not|doesn't|does not|wasn't|was not|weren't|were not|isn't|is not|aren't|are not|haven't|have not|hasn't|has not|hadn't|had not|ain't|am not|'m not|'re not|'s not)";
const WORRY = "(?:worried|worrying|worry|afraid|scared|frightened|terrified|nervous|anxious|concerned|fearful|petrified|panicking|dreading|dread)";
const PERSON = "(?:i|she|he|we|they|mum|mom|dad|it|you)";
const DAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const MONTH = "(?:january|february|march|april|june|july|august|september|october|november|december)";
const NUMWORD = "(?:a|one|two|three|four|five|six|seven|eight|nine|ten|a few|a couple of|a couple|several|many|\\d+)";
/** "gone" that is not a resolution: "gone to the shops", "gone down", "gone 2 (o'clock)". */
const GONE_NOT =
  "(?! (?:to|out|for|down|up|over|back|into|in|shopping|home|on|off|by|through|and|with|a|midnight|half|past|\\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?![a-z]))";

let ruleSeq = 0;
const R = (kind: TriggerKind, direction: TriggerDirection, patterns: string[], extra: Partial<TriggerRule> = {}): TriggerRule[] =>
  patterns.map((pattern) => ({ id: `${kind}-${++ruleSeq}`, kind, direction, pattern, ...extra }));

export const CONTEXT_RULES: readonly TriggerRule[] = [
  // ----- Pseudo-triggers: contain a trigger word but do not trigger (incl. double negation) -----
  ...R("pseudo", "none", [
    "no (?:better|worse|different|change|changes|doubt|wonder|question|joke|fun|end of|matter|idea|sooner|thanks|problem with|easier)",
    "not (?:only|just|merely|simply|necessarily|to mention|that (?:bad|much)|too bad|so bad|as bad|that i (?:know|noticed|can tell)|sure|a (?:good|great) (?:day|morning|afternoon|week))",
    `${NEG_AUX} (?:get|getting|feel|feeling|been|any) (?:any )?(?:better|easier)`,
    "not (?:much |any )?(?:better|improved|improving|getting better)",
    "(?:not|n't) as(?= (?:\\w+ ){0,2}?as )",
    "(?:aren't|isn't|wasn't|weren't|not) as",
    "nothing but",
    "never (?:felt|been|had|seen|known)(?: (?:anything|it))? (?:so|this|that|such|more|worse|as)",
    `${NEG_AUX} (?:help|helped|helping|work|working)`,
    "no (?:help|relief|use)",
    `(?:won't|wouldn't|didn't|doesn't|don't|isn't|hasn't|hadn't|not|never) (?:seem to |seems to )?(?:go(?:ing)? away|gone away|stop(?:ping)?|ease up|let up|clear up|shift|budge)`,
    "(?:can't|cannot|couldn't|could not) (?:stop|shake|get rid of|help)",
    "not (?:great|good|well|so good|too good|the best|brilliant|myself|herself|himself|right|too clever|so clever)",
    `(?:not|${NEG_AUX}) (?:feel|feeling|felt) (?:so |too |very |that )?(?:great|well|good|right|myself|herself|himself|the best|brilliant|100%)`,
    "(?:can't|cannot|couldn't|could not) complain",
    "(?:if|whether) or not",
    "not unless",
    // double negation ⇒ affirmed
    `(?:can't|cannot|can not|won't|wouldn't|couldn't|not going to|i'm not|not) (?:say|pretend|claim|saying|pretending|claiming)(?: that)? ${PERSON}(?:'m| am| was| were|'s)? ${NEG_AUX.slice(0, -1)}|not)`,
    "(?:can't|cannot|can not|won't|wouldn't|couldn't|not going to|no point|not|no use|no sense) (?:deny|denying)",
    "not a (?:day|moment|minute|night|morning|time|week|hour) (?:goes by |passes |went by |passed )?(?:without|that (?:i|she|he) (?:wasn't|didn't|was not|did not))",
    "there (?:wasn't|was not|isn't|is not|hasn't been|has not been) (?:a|one) (?:moment|minute|day|time|hour|morning|night)(?: (?:today|this week))?(?: (?:when|that))? (?:i|she|he) (?:wasn't|didn't|was not|did not)",
    "never not",
    "not without",
    // things that look like modal/hypothetical triggers but are not
    "(?:i'd|i would|would|she'd|she would|he'd) (?:say|give|rate|put|call|guess|think)",
    "(?:could|can) (?:barely|hardly|not|only|feel|tell|see|hear|sense|still)",
    "should (?:mention|say|add|note|tell)",
    "(?:get|got|getting|be|am|'m|is|are) used to",
    "(?:than|since|as|like|from|unlike|compared (?:to|with)|same as|worse than|better than) (?:yesterday|the other day|last (?:week|month|night|time|year)|on " + DAY + "|" + DAY + "|before)",
    "the day before",
    "if (?:anything|possible|needed|necessary|so)",
    "as if",
    "even though",
    "may i",
    "(?:just|only) in time",
    "(?:can't|cannot|can not|don't|do not|couldn't) (?:remember|recall) (?:the last time|when (?:i|she|he) last)",
    "(?:the )?(?:first|best|worst) (?:time|day|night) in (?:ages|years|months|weeks|a while|a long time)",
  ]),

  // ----- Negation: backward (post-negation) -------------------------------------------------------
  ...R("negation", "backward", [
    "[:?-] ?(?:no|none|nope|nah|nil|not really|not today|not at all|zero|0)(?=\\s*(?:[.,;!?)]|$))",
    "no(?=\\s*(?:[.,;!]|$))",
    "none(?=\\s*(?:[.,;!?)]|$| today| at all| so far))",
    "nope",
    "nil",
    "not today",
    "not really(?=\\s*(?:[.,;!?)]|$))",
    "not present",
    "not (?:a|an) (?:problem|issue)(?: today)?",
    "(?:is|was|are|were) (?:not|no) (?:a )?(?:problem|issue)",
  ]),
  ...R("negation", "both", ["not at all"]),

  // ----- Negation: forward (pre-negation) --------------------------------------------------------
  ...R("negation", "forward", [
    "no",
    "not",
    "never",
    "without",
    "w/o",
    "nor",
    "neither",
    "none of(?: the)?",
    "free (?:of|from)",
    NEG_AUX,
    "denies|denied|deny|denying",
    "no (?:more|longer|sign of|signs of|trace of|real|further)",
    "not (?:any|a single|one|once|a hint of|a trace of|a sign of)",
    "zero|0",
    "(?:lack|absence) of",
    "(?:hardly|barely|scarcely) any",
    "not (?:much|a lot of)",
    "nothing like",
    "nothing in the way of",
    "nary a",
  ]),

  // ----- Resolution ----------------------------------------------------------------------------
  // State-resolution post-triggers say the symptom is absent NOW ("the dizziness has gone",
  // "swelling gone", "no longer there"): they negate unless the sentence places the symptom
  // earlier today. Episode-resolution in the simple past ("went away after a sit-down", "wore off",
  // "passed", "had gone by lunch") reports an episode that DID happen today, so it is a pseudo-trigger.
  ...R("resolution", "backward", [
    `(?:has |have |is |are |'s |'ve )(?:all |completely |totally |finally |now |since |entirely )?gone(?: away| now| completely| altogether| for good)?${GONE_NOT}`,
    `(?:all |completely |totally )?gone(?: now| completely| altogether| for good)${GONE_NOT}`,
    "gone(?=\\s*(?:[.,;!]|$))",
    "(?:has|have|'s|'ve) (?:now |completely |finally |totally |all )?(?:disappeared|vanished|cleared(?: up)?|resolved|stopped|worn off|passed|subsided|settled(?: down)?|gone away)(?! (?:out|water|the|my|a|by|me|taking|using|for|to)(?![a-z]))",
    "no longer (?:there|a problem|an issue|bothering me|troubling me)",
  ]),
  ...R("pseudo", "none", [
    "(?:went|go|goes) away",
    "(?:wore|had worn) off",
    "had (?:all |completely )?gone",
    "(?:passed|subsided|cleared up|settled(?: down)?|eased(?: off)?|let up)(?! (?:out|water|the|my|a|by|me)(?![a-z]))",
  ]),

  // ----- Historical (both directions unless noted) ------------------------------------------------
  ...R("historical", "both", [
    "yesterday(?:'s)?",
    "the day before yesterday",
    "the other (?:day|night|week|morning|afternoon|evening)",
    `${NUMWORD} (?:days?|weeks?|months?|years?|nights?) ago`,
    "(?:a while|ages|years|weeks|months|long) (?:ago|back)",
    "(?:last|past) (?:week|month|year|weekend|summer|winter|spring|autumn|christmas|easter|time|visit|" + DAY + ")",
    `(?:on|last|this past) ${DAY}(?: (?:morning|afternoon|evening|night))?`,
    `${DAY}(?: (?:morning|afternoon|evening|night))?`,
    "(?:on|at|over) the weekend",
    "earlier (?:this|in the|last) week",
    "(?:at|over) christmas",
    "in the past",
    `in ${MONTH}`,
    "in (?:19|20)\\d\\d",
    "back (?:in|when)",
    "when (?:i|she|he) was (?:younger|young|a (?:child|kid|girl|boy|teenager)|working|little|in (?:hospital|my|her|his))",
    "as a (?:child|kid|girl|boy|young woman|young man)",
    "previously",
    "once before",
  ]),
  ...R("historical", "forward", ["used to", "(?:a |past |had a )?history of"]),

  // ----- Current-time anchors (end historical scope; mark earlier-today / now) --------------------
  ...R("current", "none", [
    "this (?:morning|afternoon|am|a\\.m\\.)",
    "earlier(?: today| on)?",
    "first thing",
    "when (?:i|she|he) (?:woke|got up|first got up|stood up this morning)",
    "on waking",
    "(?:after|at|before|during) (?:breakfast|lunch|lunchtime|elevenses|morning coffee)",
    "in the morning",
    "last night",
    "overnight",
    "(?:during|in) the night",
  ], { anchor: "earlier" }),
  ...R("current", "none", [
    "now",
    "right now",
    "just now",
    "at the moment",
    "currently",
    "anymore",
    "any more",
    "since then",
    "by (?:lunch|lunchtime|noon|the afternoon|the evening|evening|dinner|dinnertime|bedtime|tea|teatime|now|then|the time)",
  ], { anchor: "now" }),
  ...R("current", "none", ["today", "tonight", "this evening", "so far today"]),

  // ----- Hypothetical ------------------------------------------------------------------------------
  ...R("hypothetical", "forward", [
    "if(?: ever)?",
    "even if",
    "(?:just )?in case",
    "what if",
    "unless",
    "in the event",
    "whether",
    "(?:for )?fear of",
    `${WORRY} (?:of|about)(?= [a-z]+ing)`,
    `${WORRY}(?: that)?(?: (?:i|she|he|mum|mom|dad|it|i'll|she'll|he'll))?(?: might| may| could| would| will|'ll|'d| am going to| is going to|'m going to|'s going to| was going to| were going to| gonna| might be going to)`,
  ], { scope: "sentence" }),
  ...R("hypothetical", "forward", [
    "(?<!i )(?<!i've )asked(?: me| her| him)? (?:about|if|whether)",
    "(?:to |will |going to )?(?:check|screen|test)(?:ed|ing)?(?: me| her| him)? (?:for|if)",
    "watch(?:ing)?(?: out)? for",
    "look(?:ing)? out for",
    "keep(?:ing)? an eye (?:out )?(?:on|for)",
    "warn(?:ed|s|ing)?(?: me| us| her| him)? (?:about|of|that)",
    "side[- ]effects? (?:like|such as|include|including|of|are|is|can be|may be)",
    "(?:can|could|may|might|will|would|sometimes) (?:cause|causes|make you|make me|make her|make him|make people|give you|give me|lead to|bring on|trigger|result in)",
    "(?:risk|chance|danger|likelihood) of",
    "(?:to|so as to|in order to) (?:prevent|avoid|stop)",
    "so (?:that )?(?:i|she|he|we) (?:don't|do not|won't|wouldn't|doesn't|didn't|can't|will not)",
    "so as not to",
    "in order not to",
    "careful not to",
    "(?:try|trying|tried|tries) not to",
    "hope (?:i|she|he|it) (?:don't|doesn't|won't|do not|does not|isn't)",
    "hoping(?: (?:i|she|he))? (?:don't|won't|not to|doesn't)",
    "(?:i |we )?hop(?:e|ing|ed) (?:i|she|he|it|to|that|we|for|tonight|tomorrow)",
    "(?:i|she|he|you|we)'d (?:be|get|feel|fall|have|end up)",
    "might",
    "(?<!(?:in|since|of|early|late|mid|last|next|this|until|till|from|by) )may(?! \\d)",
    "could",
    "would",
    "should",
    "(?:going to|gonna) (?:be|fall|faint|get|feel|have|pass out|throw up|collapse|keel over|end up|lose|go)",
    "(?:i|she|he|you|we|it)'ll",
    "(?:i|she|he|you|we|it) will",
    "possibly",
    "potentially",
  ], { scope: "clause" }),
  ...R("hypothetical", "backward", [
    "(?:is|are|can be|could be|may be|might be) (?:a |one of the )?(?:common |possible |known |rare |listed )?side[- ]effects?",
    "(?:can|may|might|could) (?:happen|occur)",
    "is (?:possible|common|listed|a risk)",
  ], { scope: "clause" }),

  // ----- Uncertainty (reported as hypothetical: not mapped to today's answers) --------------------
  ...R("uncertain", "forward", [
    "(?:not sure|unsure|uncertain) (?:if|whether)",
    "(?:don't|do not|didn't|did not) know (?:if|whether)",
    "(?:can't|cannot|couldn't) tell (?:if|whether)",
    "(?:wonder|wondering|wondered) (?:if|whether)",
    "(?:could|might|may) have been",
  ], { scope: "sentence" }),

  // ----- Corrections ("I thought I was dizzy, but actually no") -----------------------------------
  ...R("correction", "backward", [
    "actually,? no",
    "no,? actually",
    "actually,? (?:i|she|he) (?:wasn't|didn't|haven't|hadn't|was not|did not)",
    "on second thoughts?,? no",
    "scratch that",
    "i mean,? no",
    "wait,? no",
    "turns out (?:i|she|he) (?:wasn't|didn't|was not|did not)",
    "come to think of it,? no",
    "or rather,? no",
  ]),
  ...R("corrective", "none", ["actually", "on second thoughts?", "i mean", "correction", "turns out", "come to think of it", "scratch that", "or rather"]),

  // ----- Presupposition: cancels a hypothetical when the symptom is presented as real ------------
  ...R("presuppose", "none", [
    "(?:is|are|be|been|'s|'re)(?: what's)? (?:making|giving|causing) (?:me|my|her|him|his)",
    "(?:made|makes|make) (?:me|her|him)(?: feel)?",
    "why (?:i'm|i am|i've been|i was|i feel|i felt|i keep|i get|my|she's|she is|she was|he's|he is|he was|she keeps|he keeps)",
    "the reason (?:i'm|i am|i was|my|she's|she was|he's|he was)",
    "(?:feel|feeling|be|being|get|getting|so|this) (?:this|so|that)(?= [a-z])",
  ]),
];

// ---------------------------------------------------------------------------
// Trigger matching

export interface TriggerHit {
  rule: TriggerRule;
  start: number;
  end: number;
  text: string;
}

const BL = "(?<![a-z0-9'])";
const BR = "(?![a-z0-9])";
let compiledRules: Array<{ rule: TriggerRule; re: RegExp }> | null = null;

function rulesCompiled() {
  if (!compiledRules) {
    compiledRules = CONTEXT_RULES.map((rule) => {
      // Rules that start with punctuation must not demand a word boundary on the left.
      const left = /^\[|^[:?;,-]/.test(rule.pattern) ? "" : BL;
      return { rule, re: new RegExp(left + "(?:" + rule.pattern + ")" + BR, "g") };
    });
  }
  return compiledRules;
}

/** Order used to break equal-length overlaps: pseudo beats everything (it exists to suppress). */
const KIND_RANK: Record<TriggerKind, number> = {
  pseudo: 9, correction: 8, uncertain: 7, hypothetical: 6, presuppose: 5, resolution: 4, negation: 3, historical: 2,
  corrective: 1, current: 0,
};

/**
 * Find trigger terms in normalised text. Overlaps are resolved longest-first (ties by kind
 * rank) so pseudo-triggers and longer phrases suppress the shorter triggers inside them.
 * "current"/"corrective"/"presuppose" markers are kept even when they overlap other triggers.
 */
export function findTriggers(text: string): TriggerHit[] {
  const all: TriggerHit[] = [];
  for (const { rule, re } of rulesCompiled()) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      all.push({ rule, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  const markers = all.filter((h) => h.rule.kind === "current" || h.rule.kind === "corrective" || h.rule.kind === "presuppose");
  const scoped = all.filter((h) => !markers.includes(h));
  scoped.sort((a, b) => b.end - b.start - (a.end - a.start) || KIND_RANK[b.rule.kind] - KIND_RANK[a.rule.kind] || a.start - b.start);
  const taken: TriggerHit[] = [];
  for (const h of scoped) {
    if (taken.some((x) => h.start < x.end && x.start < h.end)) continue;
    taken.push(h);
  }
  // Markers: drop ones swallowed by a longer scoped trigger (e.g. "today" inside "not today").
  const keptMarkers = markers.filter((mk) => !taken.some((x) => x.start <= mk.start && mk.end <= x.end && x.end - x.start > mk.end - mk.start));
  return [...taken.filter((h) => h.rule.kind !== "pseudo"), ...keptMarkers].sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Experiencer: voice + person referents

export type Voice = "patient" | "caregiver";

const FIRST_PERSON = new Set(["i", "i'm", "i've", "i'd", "i'll", "me", "my", "mine", "myself", "we", "we're", "we've", "we'd", "us", "our", "ourselves"]);
const FIRST_SUBJECT = new Set(["i", "i'm", "i've", "i'd", "i'll", "we", "we're", "we've", "we'd"]);
const THIRD_SUBJECT = new Set(["she", "he", "she's", "he's", "she'd", "he'd", "she'll", "he'll", "they", "they're", "they've", "they'd", "they'll"]);
const THIRD_OTHER_FORMS = new Set(["her", "him", "his", "hers", "herself", "himself", "them", "their", "themselves"]);
const PLURAL_THIRD = new Set(["they", "they're", "they've", "they'd", "they'll", "them", "their", "themselves"]);

/** Parent/grandparent words: a caregiver writing about the patient. */
export const PARENT_KIN = new Set([
  "mom", "mum", "mommy", "mummy", "mama", "mamma", "mother", "dad", "daddy", "father", "papa", "grandma", "grandmother",
  "granny", "gran", "nana", "nan", "nanna", "grandpa", "grandfather", "grandad", "granddad", "gramps", "grampa",
]);

/** Person (and pet) nouns that make someone else the experiencer when they are the subject. */
const OTHER_PERSON_NOUNS = new Set([
  "husband", "hubby", "wife", "partner", "sister", "brother", "sibling", "daughter", "son", "granddaughter", "grandson",
  "grandchild", "grandchildren", "grandkid", "grandkids", "grandbaby", "niece", "nephew", "cousin", "aunt", "auntie",
  "uncle", "friend", "friends", "neighbour", "neighbor", "neighbours", "neighbors", "roommate", "flatmate", "carer",
  "caregiver", "aide", "nurse", "doctor", "gp", "pharmacist", "physio", "dog", "cat", "puppy", "kitten", "pet", "bird",
  "budgie", "boyfriend", "girlfriend", "companion", "lady", "ladies", "man", "men", "woman", "women", "gentleman", "fellow",
  "guy", "chap", "people", "kids", "children", "child", "baby", "family", "folks", "girls", "boys", "everyone", "everybody",
  "someone", "somebody", "nobody", "anyone", "mother-in-law", "father-in-law", "sister-in-law", "brother-in-law",
  "daughter-in-law", "son-in-law", "in-law", "in-laws", "stepdaughter", "stepson", "vicar", "pastor", "priest", "driver", "receptionist",
  "mom", "mum", "mother", "dad", "father", "grandma", "grandmother", "grandpa", "grandfather", "nan", "nana", "gran", "granny",
]);
/** Nouns that can be a subject without a determiner ("Husband was dizzy", "Everyone had a cough"). */
const BARE_OK = new Set([
  "husband", "hubby", "wife", "grandson", "granddaughter", "son", "daughter", "sister", "brother", "everyone", "everybody",
  "someone", "somebody", "nobody", "people", "folks", "partner", "neighbour", "neighbor",
]);
const DETERMINERS = new Set(["my", "our", "her", "his", "their", "the", "a", "an", "your", "this", "that", "some", "another", "one", "every"]);

/** Verbs that make a referent an *observer* rather than the person with the symptom. */
const OBSERVER_VERBS = new Set([
  "said", "says", "say", "told", "tells", "tell", "thinks", "thought", "think", "noticed", "notices", "notice", "saw",
  "sees", "see", "reckons", "reckoned", "mentioned", "mentions", "asked", "asks", "worries", "wonders", "wondered",
  "believes", "believed", "suggested", "suggests", "warned", "warns", "explained", "called", "phoned", "rang", "rings",
  "texted", "emailed", "wrote", "writes", "found", "heard", "commented", "pointed", "insists", "insisted", "checked",
  "noted", "observed", "spotted", "guess", "suppose", "hope", "doubt", "know", "knew", "remember", "remembered",
  "reported", "reports", "agreed", "agrees", "wonder", "worry", "reckon", "believe",
]);
const SKIP_AFTER_REFERENT = new Set([
  "too", "also", "just", "really", "always", "both", "all", "again", "next", "door", "as", "well", "here", "now", "then",
  "finally", "actually", "certainly", "definitely", "apparently", "obviously", "clearly", "only", "still", "nearly",
  "almost", "sometimes", "often", "usually", "suddenly",
]);
const PREPOSITIONS = new Set(["at", "from", "in", "of", "on", "with", "across", "near", "by", "down", "up", "over", "upstairs", "downstairs", "round"]);
const NON_SUBJECT_FOLLOWERS = new Set(["and", "or", "but", "so", "to", "for", "about", "into", "than", "then", "because", "if", "when", "while", "as"]);

/** Capitalised words that are not personal names. */
const NAME_STOPWORDS = new Set([
  "i", "today", "yesterday", "tonight", "this", "that", "the", "a", "an", "felt", "feeling", "feel", "was", "had", "have",
  "slept", "sleep", "no", "not", "nearly", "almost", "got", "woke", "went", "it", "my", "our", "we", "they", "he", "she",
  "also", "and", "but", "so", "then", "energy", "appetite", "well", "still", "really", "very", "bit", "little", "quite",
  "just", "again", "after", "before", "when", "while", "morning", "afternoon", "evening", "night", "last", "good", "bad",
  "okay", "ok", "fine", "great", "pretty", "kept", "keep", "took", "take", "forgot", "missed", "ate", "lots", "some", "any",
  "much", "dizzy", "tired", "nothing", "everything", "busy", "lovely", "quiet", "not", "never", "maybe", "probably", "sleep",
  "dr", "doctor", "nurse", "mr", "mrs", "ms", "miss", "dear", "god", "christmas", "easter", "church", "lasix", "tylenol",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april",
  "may", "june", "july", "august", "september", "october", "november", "december", "spent", "visited", "watched", "had",
  "managed", "walked", "breakfast", "lunch", "dinner", "tea", "head", "heart", "legs", "ankles", "feet", "mouth", "skin",
  "stomach", "tummy", "back", "bladder", "vision", "sleep", "bed", "bath", "shower", "kitchen", "garden", "stairs",
  "pharmacist", "pills", "tablets", "meds", "medication", "medicine", "weather", "rain", "snow", "sun", "heat", "cold",
  "typing", "writing", "here", "hi", "hello", "thanks", "thank", "yes", "yeah", "honestly", "otherwise", "overall",
  "anyway", "although", "though", "however", "because", "since", "until", "both", "neither", "either", "every", "each",
  "mostly", "mainly", "only", "even", "since", "nearly", "couldn't", "didn't", "wasn't", "can't", "don't", "won't",
  "isn't", "haven't", "hadn't", "i'm", "i've", "i'd", "i'll", "used", "getting", "being", "bruised", "stood",
]);

export interface Referent {
  start: number;
  end: number;
  who: "patient" | "other";
  /** Pronoun or possessive form — the only referents that count *inside* a symptom phrase ("her ankles"). */
  pronounLike: boolean;
  /** Subject followed by a reporting/observing verb ("my daughter says…"). */
  observer: boolean;
  /** A subject (or possessive) referent that can own a symptom. */
  qualified: boolean;
  text: string;
}

export interface VoiceInfo {
  voice: Voice;
  /** Why the story was read as caregiver voice (for the explanation UI). */
  signal: string | null;
}

/**
 * Decide whether the story is written by the patient ("I felt dizzy") or by a caregiver about the
 * patient ("Mum was dizzy", "Typing for Dad", "She slept badly" with no "I").
 */
export function detectVoice(view: TextView, tokens: Token[], patientNames: string[] = []): VoiceInfo {
  const text = view.text;
  if (/(?<![a-z])(?:typing|writing|texting|filling (?:this |it )?in) (?:for|on behalf of)(?![a-z])|on (?:her|his) behalf/.test(text)) {
    return { voice: "caregiver", signal: "written on someone's behalf" };
  }
  const names = patientNames.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 1);
  for (const tk of tokens) {
    const w = tk.norm.replace(/'s$/, "");
    if (names.includes(w)) return { voice: "caregiver", signal: `mentions ${tk.text.replace(/'s$/i, "")} by name` };
  }
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].norm.replace(/'s$/, "");
    if (!PARENT_KIN.has(w)) continue;
    const prev = tokens[i - 1]?.norm;
    if (prev && DETERMINERS.has(prev) && prev !== "my" && prev !== "our") continue; // "her mother"
    if (prev === "my" || prev === "our") {
      // "my mother" — caregiver voice unless clearly about the past ("my mother used to…", "passed away").
      const sentEnd = text.indexOf(".", tokens[i].end);
      const rest = text.slice(tokens[i].end, sentEnd === -1 ? text.length : sentEnd);
      if (/(?<![a-z])(?:used to|passed|died|late|when i was|years ago|always said|had the same)(?![a-z])/.test(rest)) continue;
      return { voice: "caregiver", signal: `writes about "${prev} ${tokens[i].text.replace(/'s$/i, "")}"` };
    }
    return { voice: "caregiver", signal: `writes about "${tokens[i].text.replace(/'s$/i, "")}"` };
  }
  const sig = /^\s*([A-Z][a-z]+) here(?![a-z])|(?:[Tt]his is|[Ii]t's) ([A-Z][a-z]+) (?:here|writing|typing)/.exec(view.cased);
  if (sig) {
    const who = (sig[1] ?? sig[2]).toLowerCase();
    if (!names.includes(who) && !NAME_STOPWORDS.has(who)) return { voice: "caregiver", signal: `signed by ${sig[1] ?? sig[2]}` };
  }
  // Third-person-only story ("She slept badly and wasn't dizzy") with no other person introduced.
  const hasFirstSingular = tokens.some((t) => ["i", "i'm", "i've", "i'd", "i'll", "me", "my", "myself", "mine"].includes(t.norm));
  const firstThird = tokens.findIndex((t) => t.norm === "she" || t.norm === "he" || t.norm === "she's" || t.norm === "he's");
  if (!hasFirstSingular && firstThird >= 0) {
    const before = tokens.slice(0, firstThird);
    const otherIntroduced = before.some((t, k) => OTHER_PERSON_NOUNS.has(t.norm) || isProperName(view, before, k));
    if (!otherIntroduced) return { voice: "caregiver", signal: "describes \"she/he\" without any \"I\"" };
  }
  return { voice: "patient", signal: null };
}

function isCapitalised(view: TextView, t: Token): boolean {
  return /^[A-Z][a-z]+(?:'s)?$/.test(view.cased.slice(t.start, t.end));
}

let notNames: Set<string> | null = null;

/** Words that are never treated as personal names: stopwords + all lexicon and trigger vocabulary. */
function notNameWords(): Set<string> {
  if (notNames) return notNames;
  notNames = new Set([...NAME_STOPWORDS, ...lexiconVocabulary()]);
  for (const r of CONTEXT_RULES) for (const w of r.pattern.replace(/\\[a-z]/g, " ").match(/[a-z]{3,}/g) ?? []) notNames.add(w);
  return notNames;
}

function isProperName(view: TextView, toks: Token[], k: number): boolean {
  const t = toks[k];
  if (t.kind !== "word" || !isCapitalised(view, t)) return false;
  const base = t.norm.replace(/'s$/, "");
  if (base.length < 2 || PARENT_KIN.has(base) || OTHER_PERSON_NOUNS.has(base) || notNameWords().has(base)) return false;
  if (/(?:ly|ing|ed)$/.test(base)) return false; // adverbs / participles ("Hardly", "Feeling", "Bruised")
  return true;
}

/** Position where a new sentence-like unit starts (start, or after ? ! : ; " ( -). */
function startsUnit(toks: Token[], k: number): boolean {
  if (k === 0) return true;
  return /^[?!:;"(\-]$/.test(toks[k - 1].norm);
}

/**
 * Inspect what follows a referent to decide if it is a clause subject (and whether it is an
 * observer). Returns null when the referent is not in subject position ("I visited my sister and…").
 */
function subjectRole(toks: Token[], next: number): { observer: boolean; verbIndex: number } | null {
  let j = next;
  let guard = 0;
  while (j < toks.length && SKIP_AFTER_REFERENT.has(toks[j].norm) && guard++ < 3) j++;
  // Skip a short prepositional phrase: "Everyone at bridge club had…", "Bob next door fell".
  if (j < toks.length && PREPOSITIONS.has(toks[j].norm)) {
    let k = j + 1;
    let n = 0;
    while (k < toks.length && n < 3 && toks[k].kind === "word" && !NON_SUBJECT_FOLLOWERS.has(toks[k].norm) && !isVerbish(toks[k].norm)) {
      k++;
      n++;
    }
    if (k < toks.length && isVerbish(toks[k].norm)) j = k;
    else return null;
  }
  const t = toks[j];
  if (!t) return null;
  if (t.kind !== "word") return null;
  if (NON_SUBJECT_FOLLOWERS.has(t.norm)) return null;
  if (DETERMINERS.has(t.norm) && t.norm !== "that") return null; // object NP follows: "I visited my sister" ← (this is the verb's object)
  const observer = OBSERVER_VERBS.has(t.norm);
  return { observer, verbIndex: j };
}

const VERBISH =
  /^(?:was|were|is|are|am|has|had|have|'s|'ve|'d|did|does|do|been|got|gets|fell|falls|felt|feels|feel|seemed|seems|looked|looks|kept|keeps|said|says|told|tells|thinks|thought|noticed|complained|complains|nearly|almost|tripped|slipped|went|took|ended|came|comes|visited|rang|phoned|called|gets|get|can't|couldn't|didn't|doesn't|wasn't|isn't|hasn't|hadn't|won't|wouldn't|could|can|will|would|might|may|must|should|started|stumbled|collapsed|cried|coughed|sneezed|needed|needs|needed|woke|wakes|slept|sleeps|ate|eats|seemed|became|becomes|stayed|stays|had|hurt|hurts|broke|broken|caught|lost|nodded|dozed|passed|fainted|struggled|struggles|uses|used|developed|suffers|suffered|gets|got|went|goes|sounded|sounds|appeared|appears|walked|sat|stood)$/;

function isVerbish(w: string): boolean {
  return VERBISH.test(w) || /^[a-z]+(?:ed)$/.test(w);
}

/** Verb list without the generic "-ed" rule (used to confirm sentence-initial names). */
const STRICT_VERB = VERBISH;

/**
 * Find person referents in one sentence. Patient referents: I/me/my (patient voice) or the parent
 * kin word / patient name / she-he (caregiver voice). Other referents: kin and person nouns,
 * proper names and pronouns that refer to someone else.
 */
export function findReferents(view: TextView, toks: Token[], voice: Voice, patientNames: string[] = []): Referent[] {
  const out: Referent[] = [];
  const names = patientNames.map((n) => n.toLowerCase());
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "word") continue;
    const w = t.norm;
    const base = w.replace(/'s$/, "");
    const possessive = w.endsWith("'s") && !["it's", "she's", "he's", "that's", "there's", "what's", "let's", "who's"].includes(w);

    if (FIRST_PERSON.has(w)) {
      const role = FIRST_SUBJECT.has(w) ? subjectRole(toks, i + 1) : null;
      out.push({
        start: t.start, end: t.end, text: t.text, who: voice === "caregiver" ? "other" : "patient",
        observer: !!role?.observer, qualified: true, pronounLike: true,
      });
      continue;
    }
    if (THIRD_SUBJECT.has(w) || THIRD_OTHER_FORMS.has(w)) {
      const role = THIRD_SUBJECT.has(w) ? subjectRole(toks, i + 1) : null;
      const who = voice === "caregiver" && !PLURAL_THIRD.has(w) ? "patient" : "other";
      out.push({ start: t.start, end: t.end, text: t.text, who, observer: !!role?.observer, qualified: true, pronounLike: true });
      continue;
    }
    if (names.includes(base)) {
      const role = possessive ? null : subjectRole(toks, i + 1);
      out.push({ start: t.start, end: t.end, text: t.text, who: "patient", observer: !!role?.observer, qualified: true, pronounLike: possessive });
      continue;
    }
    if (OTHER_PERSON_NOUNS.has(base)) {
      const prev = toks[i - 1]?.norm;
      const prev2 = toks[i - 2]?.norm;
      const hasDet = !!prev && (DETERMINERS.has(prev) || (prev2 === "one" && prev === "of") || /'s$/.test(prev));
      const isParent = PARENT_KIN.has(base);
      if (!hasDet && !BARE_OK.has(base) && !isParent) continue;
      if (isParent && prev && DETERMINERS.has(prev) && prev !== "my" && prev !== "our") {
        // "her mother" — someone else's parent.
      } else if (isParent && voice === "caregiver") {
        const role = possessive ? null : subjectRole(toks, i + 1);
        const s = hasDet && toks[i - 1] ? toks[i - 1].start : t.start;
        out.push({ start: s, end: t.end, text: view.text.slice(s, t.end), who: "patient", observer: !!role?.observer, qualified: true, pronounLike: possessive });
        continue;
      }
      const role = possessive ? { observer: false, verbIndex: i } : subjectRole(toks, i + 1);
      const s = hasDet && toks[i - 1] ? toks[i - 1].start : t.start;
      out.push({ start: s, end: t.end, text: view.text.slice(s, t.end), who: "other", observer: !!role?.observer, qualified: !!role, pronounLike: possessive });
      continue;
    }
    if (isProperName(view, toks, i)) {
      const first = startsUnit(toks, i);
      const role = possessive ? { observer: false, verbIndex: i } : subjectRole(toks, i + 1);
      // Sentence-initial capitalised words are names only when followed by a verb ("Sofia fell").
      if (first && !role) continue;
      if (first && role && !possessive && !STRICT_VERB.test(toks[role.verbIndex]?.norm ?? "")) continue;
      out.push({ start: t.start, end: t.end, text: t.text, who: "other", observer: !!role?.observer, qualified: !!role, pronounLike: possessive });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-sentence context and per-mention analysis

export interface SentenceContext {
  seg: Segment;
  tokens: Token[];
  boundaries: Boundary[];
  triggers: TriggerHit[];
  referents: Referent[];
  isQuestion: boolean;
  corrective: boolean;
}

export interface ContextResult {
  negated: boolean;
  temporality: Mention["temporality"];
  experiencer: Mention["experiencer"];
  /** Set when the mention is hedged ("not sure if I was dizzy"); reported as hypothetical. */
  uncertain: boolean;
  /** Asked as a question without saying it happened ("Can lorazepam cause dizziness?"). */
  question: boolean;
  /** Negated by a correction ("…but actually no"). */
  corrected: boolean;
  /**
   * Time-of-day anchor nearest to the mention in its own clause: "earlier" (this morning, after
   * breakfast, last night), "now" (now, by lunchtime, anymore) or null. Used to tell "dizzy this
   * morning, gone now" (it happened today) from an unresolved conflict.
   */
  anchor: "earlier" | "now" | null;
  /** Trigger spans (view coordinates) that set non-default values, incl. the other-person referent. */
  triggers: Array<{ start: number; end: number; kind: TriggerKind | "experiencer" }>;
}

/** Spans (view coordinates) of concept matches whose internal triggers must be ignored. */
export interface ConsumedSpan {
  start: number;
  end: number;
}

/**
 * Build per-sentence context. `consumed` = lexicon/rating matches: triggers fully inside them are
 * part of the concept wording ("not hungry", "didn't sleep well") and are dropped — unless the
 * phrase is followed by "or"/"nor" ("not hungry or dizzy" still negates dizzy).
 */
export function buildSentenceContexts(
  view: TextView,
  sentences: Segment[],
  allTokens: Token[],
  triggers: TriggerHit[],
  consumed: ConsumedSpan[],
  voice: Voice,
  patientNames: string[] = [],
): SentenceContext[] {
  const text = view.text;
  const live = triggers.filter((tr) => {
    const host = consumed.find((c) => c.start <= tr.start && tr.end <= c.end);
    if (!host) return true;
    if (tr.rule.kind !== "negation") return tr.rule.kind === "current" || tr.rule.kind === "corrective";
    return /^\s*,?\s*(?:or|nor)(?![a-z])/.test(text.slice(host.end, host.end + 6));
  });
  return sentences.map((seg) => {
    const tokens = allTokens.filter((t) => t.start >= seg.start && t.end <= seg.end);
    const trig = live.filter((t) => t.start >= seg.start && t.end <= seg.end);
    return {
      seg,
      tokens,
      boundaries: findBoundaries(text, seg.start, seg.end, tokens),
      triggers: trig,
      referents: findReferents(view, tokens, voice, patientNames),
      isQuestion: /\?\s*["')]*\s*$/.test(seg.text),
      corrective: trig.some((t) => t.rule.kind === "corrective" || t.rule.kind === "correction"),
    };
  });
}

const FINITE_AFTER_CONTENT = new Set([
  "felt", "feel", "feels", "was", "were", "is", "am", "are", "had", "has", "have", "got", "gets", "slept", "ate", "went",
  "kept", "took", "woke", "needed", "spent", "managed", "made", "did", "tried", "walked", "started", "seemed", "looked",
  "ended", "nearly", "almost", "fell", "stumbled", "tripped", "slipped", "caught", "grabbed", "came", "sat", "stayed",
  "just", "only", "mostly", "more", "rather", "instead",
]);

/** Words that do not count as the negated content itself ("didn't *really feel* dizzy"). */
const NEG_TRANSPARENT = new Set([
  "really", "actually", "even", "ever", "at", "all", "too", "very", "so", "much", "quite", "once", "still", "yet", "exactly",
  "particularly", "especially", "honestly", "properly", "any", "a", "an", "the", "have", "had", "has", "been", "be", "feel",
  "feeling", "felt", "get", "getting", "got", "notice", "noticed", "seem", "seemed", "look", "looked", "i", "she", "he",
  "think", "today", "that", "experience", "experienced", "suffer", "suffered", "from", "with", "of", "my", "her", "his",
  "single", "one", "bit", "little", "sign", "signs", "trace", "hint",
]);

/** End of a forward negation scope starting at `from` within the sentence. */
function negationScopeEnd(sc: SentenceContext, from: number): number {
  let end = sc.seg.end;
  for (const b of sc.boundaries) {
    if (b.start >= from) {
      end = Math.min(end, b.start);
      break;
    }
  }
  // A finite verb after some content opens a new predicate ("No falls today felt dizzy").
  let seenContent = false;
  for (let i = 0; i < sc.tokens.length; i++) {
    const t = sc.tokens[i];
    if (t.start < from) continue;
    if (t.start >= end) break;
    if (t.kind !== "word") continue;
    if (seenContent && FINITE_AFTER_CONTENT.has(t.norm)) {
      const prev = sc.tokens[i - 1]?.norm;
      if (prev !== "or" && prev !== "nor") {
        end = t.start;
        break;
      }
    }
    if (!NEG_TRANSPARENT.has(t.norm)) seenContent = true;
  }
  return end;
}

function prevBoundaryEnd(sc: SentenceContext, before: number, kinds: Array<Boundary["kind"]>): number {
  let start = sc.seg.start;
  for (const b of sc.boundaries) {
    if (b.end <= before && kinds.includes(b.kind)) start = Math.max(start, b.end);
  }
  return start;
}

function nextBoundaryStart(sc: SentenceContext, after: number, kinds: Array<Boundary["kind"]>): number {
  for (const b of sc.boundaries) {
    if (b.start >= after && kinds.includes(b.kind)) return b.start;
  }
  return sc.seg.end;
}

/** Analyse one mention [start, end) (view coordinates) inside its sentence context. */
export function analyzeInSentence(sc: SentenceContext, target: { start: number; end: number }, viewText: string): ContextResult {
  const res: ContextResult = {
    negated: false, temporality: "current", experiencer: "patient", uncertain: false, question: false, corrected: false,
    anchor: null, triggers: [],
  };
  const outside = sc.triggers.filter((t) => t.end <= target.start || t.start >= target.end);
  const currentMarks = outside.filter((t) => t.rule.kind === "current");
  // The mention's own clause (between termination/conjunct boundaries).
  const clauseStart = prevBoundaryEnd(sc, target.start, ["termination", "conjunct"]);
  const clauseEnd = nextBoundaryStart(sc, target.end, ["termination", "conjunct"]);
  const inClause = (t: { start: number; end: number }) => t.start >= clauseStart && t.end <= clauseEnd;
  // Nearest time-of-day anchor: prefer the mention's own clause, else the nearest in the sentence.
  {
    const dist = (t: TriggerHit) => (t.end <= target.start ? target.start - t.end : t.start - target.end);
    const anchored = currentMarks.filter((t) => t.rule.anchor);
    const pool = anchored.some(inClause) ? anchored.filter(inClause) : anchored;
    const nearest = [...pool].sort((a, b) => dist(a) - dist(b))[0];
    res.anchor = nearest?.rule.anchor ?? null;
  }

  // --- Negation --------------------------------------------------------------------------------
  const negTriggers: TriggerHit[] = [];
  for (const tr of outside) {
    const k = tr.rule.kind;
    if (k !== "negation" && k !== "resolution" && k !== "correction") continue;
    const dir = tr.rule.direction;
    if ((dir === "forward" || dir === "both") && tr.end <= target.start) {
      if (target.start < negationScopeEnd(sc, tr.end)) negTriggers.push(tr);
    }
    if ((dir === "backward" || dir === "both") && tr.start >= target.end) {
      const start = k === "correction" ? sc.seg.start : prevBoundaryEnd(sc, tr.start, ["termination", "conjunct"]);
      if (target.start >= start) {
        if (k === "resolution" && res.anchor === "earlier") continue; // "the dizziness from this morning has gone"
        negTriggers.push(tr);
      }
    }
  }
  if (negTriggers.length > 0) {
    // "didn't feel dizzy until lunch" = it did happen.
    const fwd = negTriggers.filter((t) => t.end <= target.start);
    const after = viewText.slice(target.end, negationScopeEnd(sc, target.end));
    const notUntil = fwd.length > 0 && /(?<![a-z])(?:until|till|til|'til)(?![a-z])/.test(after);
    if (!notUntil) {
      res.negated = true;
      res.corrected = negTriggers.some((t) => t.rule.kind === "correction");
      for (const t of negTriggers) res.triggers.push({ start: t.start, end: t.end, kind: t.rule.kind });
    }
  }

  // --- Hypothetical / uncertain ----------------------------------------------------------------
  for (const tr of outside) {
    const k = tr.rule.kind;
    if (k !== "hypothetical" && k !== "uncertain") continue;
    let inScope = false;
    if (tr.rule.direction === "forward" && tr.end <= target.start) {
      const kinds: Array<Boundary["kind"]> = tr.rule.scope === "clause" ? ["termination", "conjunct"] : ["termination"];
      inScope = target.start < nextBoundaryStart(sc, tr.end, kinds);
    } else if (tr.rule.direction === "backward" && tr.start >= target.end) {
      inScope = target.start >= prevBoundaryEnd(sc, tr.start, ["termination", "conjunct"]);
    }
    if (!inScope) continue;
    // Presupposed: "could the new pill be making me dizzy?" → the dizziness is real.
    const presupposed = sc.triggers.some(
      (p) => p.rule.kind === "presuppose" && p.end <= target.start && target.start - p.end <= 12 && p.start >= tr.start,
    );
    if (presupposed) continue;
    res.temporality = "hypothetical";
    if (k === "uncertain") res.uncertain = true;
    res.triggers.push({ start: tr.start, end: tr.end, kind: k });
    break;
  }

  // --- Historical ------------------------------------------------------------------------------
  // A clause with its own current-time marker ("…and my hip is sore today") is not reached by a
  // historical trigger in another clause ("Took a tumble yesterday…") — ConText's "Recent" terms.
  const clauseIsCurrent = currentMarks.some(inClause);
  if (res.temporality === "current") {
    for (const tr of outside) {
      if (tr.rule.kind !== "historical") continue;
      if (clauseIsCurrent && !inClause(tr)) continue;
      let inScope = false;
      if ((tr.rule.direction === "forward" || tr.rule.direction === "both") && tr.end <= target.start) {
        const termEnd = nextBoundaryStart(sc, tr.end, ["termination"]);
        const cur = currentMarks.find((c) => c.start >= tr.end && c.start < termEnd);
        inScope = target.start < (cur ? cur.start : termEnd);
      }
      if (!inScope && (tr.rule.direction === "backward" || tr.rule.direction === "both") && tr.start >= target.end) {
        let start = prevBoundaryEnd(sc, tr.start, ["termination", "conjunct"]);
        for (const c of currentMarks) if (c.end <= tr.start && c.end > start) start = c.end;
        inScope = target.start >= start;
      }
      if (inScope) {
        res.temporality = "historical";
        res.triggers.push({ start: tr.start, end: tr.end, kind: "historical" });
        break;
      }
    }
  }

  // --- Experiencer -------------------------------------------------------------------------------
  const inside = sc.referents.find((r) => r.pronounLike && r.start >= target.start && r.end <= target.end);
  let chosen: Referent | undefined = inside;
  if (!chosen) {
    for (let i = sc.referents.length - 1; i >= 0; i--) {
      const r = sc.referents[i];
      if (r.end > target.start) continue;
      if (r.observer) continue;
      // Other-person nouns/names only count as subjects (or when directly before the symptom).
      const adjacent = /^\s*$/.test(viewText.slice(r.end, target.start));
      if (r.who === "other" && !r.qualified && !adjacent) continue;
      chosen = r;
      break;
    }
  }
  if (chosen && chosen.who === "other") {
    res.experiencer = "other";
    res.triggers.push({ start: chosen.start, end: chosen.end, kind: "experiencer" });
  }

  // --- Questions ---------------------------------------------------------------------------------
  if (sc.isQuestion && res.temporality === "current" && !res.negated) {
    const patientRef = chosen && chosen.who === "patient";
    const presupposed = sc.triggers.some((p) => p.rule.kind === "presuppose" && p.end <= target.start);
    if (!patientRef && !presupposed) {
      res.question = true;
      res.temporality = "hypothetical";
    }
  }

  res.triggers.sort((a, b) => a.start - b.start);
  return res;
}

// ---------------------------------------------------------------------------
// Public API (SPEC §10): analyse a target span inside a single sentence.

/**
 * ConText analysis of `target` (UTF-16 offsets into `sentence`). Returns negation, temporality,
 * experiencer and the trigger spans (offsets into `sentence`) that set them.
 */
export function analyzeContext(
  sentence: string,
  target: { start: number; end: number },
  opts: { voice?: Voice; patientNames?: string[] } = {},
): { negated: boolean; temporality: Mention["temporality"]; experiencer: Mention["experiencer"]; triggers: Span[] } {
  const view = buildTextView(sentence);
  const vStart = view.toView(target.start);
  const vEnd = Math.max(vStart + 1, view.toView(target.end));
  const tokens = tokenize(view.text);
  const voice = opts.voice ?? detectVoice(view, tokens, opts.patientNames).voice;
  const consumed = matchLexicon(view.text).filter((m) => !(m.start === vStart && m.end === vEnd));
  // Treat the whole input as one sentence: the caller passes a sentence.
  const seg: Segment = { start: 0, end: view.text.length, text: view.text };
  const sentencesFound = splitSentences(view.cased);
  const host = sentencesFound.find((s) => s.start <= vStart && vEnd <= s.end) ?? seg;
  const [sc] = buildSentenceContexts(view, [host], tokens, findTriggers(view.text), consumed, voice, opts.patientNames);
  const r = analyzeInSentence(sc, { start: vStart, end: vEnd }, view.text);
  return {
    negated: r.negated,
    temporality: r.temporality,
    experiencer: r.experiencer,
    triggers: r.triggers.map((t) => {
      const o = view.toOriginal(t.start, t.end);
      return { start: o.start, end: o.end, quote: sentence.slice(o.start, o.end) };
    }),
  };
}
