// The emergency signs, written once: the static sentence people read, and the named rules that decide whether a
// patient's check-in note describes one of them, so the check-in can show the app's static 911 line beside it.
//
// Static on purpose, like the Poison Control line (views/patient/MedSafetyLine.tsx): the words shown never change
// with what was written, they give no advice and judge nothing. The only thing that depends on the note is whether
// the fixed line appears at all. Kinwise does not triage: it does not say a symptom IS an emergency, it puts the
// numbers next to the words.
//
// Where the list comes from (no new list):
//   - EMERGENCY_SIGNS is safetyNet.ts EMERGENCY_LINE, the sentence the visit brief ends with and the Help dialog
//     prints under its 911 row (src/app/Help.tsx): sudden confusion, a fall with a head injury, trouble breathing.
//   - The other rules are the symptom forms of the Ask screen's emergency category (engine/brief/qa.ts SCOPE_RULES,
//     "emergency words", "colour change", "acute confusion", "sudden confusion", "sudden weakness or one-sided
//     symptoms"): chest pain / heart attack, stroke signs (one-sided weakness or numbness, a drooping face, slurred
//     speech), not rousable, fainting or collapse, seizure, blue lips, choking, a swelling or closing throat
//     (anaphylaxis), serious bleeding. qa.ts keeps its own copy for questions (its patterns are pinned by
//     eval/results/llm-batch.json); these are tuned for a first-person diary note, where "confused" or "short of
//     breath" alone is an everyday symptom Kinwise tracks.
//   - Not here: too much or the wrong medicine (MedSafetyLine.tsx shows Poison Control for that) and thoughts of
//     self-harm (the Help dialog's 988 row).
//
// Negation and history (describesEmergencySign): a missed emergency is worse than a false alarm, so a sign stays
// quiet only when the clause plainly negates it ("no chest pain", "didn't have any chest pain", "no chest pain or
// trouble breathing") or plainly puts it in the past ("chest pain last year, none today", "weak since my stroke")
// with nothing saying it is back ("again", "it's back", "are back", "came back", "still", or "today" / "now" / "this
// week" not negated). A sign that went away on its own today still shows the line. Hedges ("not sure if it was chest
// pain") are not negation. "Since" means ongoing (SINCE_ONGOING), except for a stroke's lasting deficits, and a "no"
// is undone when the sentence says the sign started later (ONSET_AFTER_NEGATION: "no chest pain until today").
// A negator counts only when it governs the sign (NEGATION_FILLER): in "Nitro didn't help the chest pain" the
// "didn't" belongs to "help", so the line shows. "Never ... like this" (NOVELTY) and a past event named only to
// compare (COMPARISON: "same chest pain as last year") also show it.

import { EMERGENCY_LINE } from "../brief/safetyNet";

/** The static emergency sentence (one constant: the brief, the Help dialog and the check-in all print it). */
export const EMERGENCY_SIGNS = EMERGENCY_LINE;

export interface EmergencySignRule {
  /** Plain name of the sign, used in tests and when a reviewer asks why the line appeared. */
  name: string;
  /** Tested against one lower-cased clause of the note (straight apostrophes, single spaces). */
  pattern: RegExp;
}

/** "can't", "cant", "cannot", "can not", "couldn't", "could not", "unable to", "not able to". The "not" of "not able
 * to" is inside the match, so it is never read as negation of the sign ("not able to catch my breath" shows it). */
const CANT =
  "(?:can'?t|cannot|can not|couldn'?t|could not|unable to|(?:wasn'?t|isn'?t|haven'?t been|hasn'?t been|was not|is not|not) able to)";
const WHOSE = "(?:my|her|his|their|the|a)";
/** "breathe", but not through a blocked nose ("can't breathe through my nose" is a cold, not this sign). */
const BREATHE = `breathe(?! (?:through|out of|in through) ${WHOSE} nose)`;
/** "suddenly", "all of a sudden", "out of nowhere" (misspellings on purpose, as in qa.ts SUDDEN). */
const SUDDEN = "(?:sudd?e?n(?:t?ly)?|all of a sudd?e?n|out of nowhere|out of the blue)";
/** Words for confusion (qa.ts CONFUSED, plus "myself" for a first-person note, and "wasn't making sense", which still
 * needs SUDDEN like the rest of the "sudden confusion" rule). */
const CONFUSED =
  "(?:confus\\w*|disorient\\w*|delirious|muddled|incoherent|out of it|(?:isn'?t|is not|not|wasn'?t|was not|'m not|am not) (?:myself|herself|himself|themselves)|gibberish|talking nonsense|hallucinat\\w*|seeing things" +
  "|(?:not|wasn'?t|isn'?t|aren'?t|weren'?t) making (?:any )?sense)";

const rule = (name: string, source: string): EmergencySignRule => ({ name, pattern: new RegExp(`(?<![a-z'])(?:${source})(?![a-z])`) });

/** The signs, in the order the line's reasons are listed. Each pattern needs the sign itself, not just a body part. */
export const EMERGENCY_SIGN_RULES: readonly EmergencySignRule[] = [
  // Help / EMERGENCY_LINE "trouble breathing"; qa.ts "can't breathe", "trouble breathing", "gasping". Not "short of
  // breath" or "out of breath" on their own (an everyday symptom she logs), and not a blocked nose.
  rule(
    "trouble breathing",
    `${CANT} (?:${BREATHE}|catch ${WHOSE} breath|get (?:${WHOSE} |enough |any )?(?:breath|air))` +
      // "I can barely breathe", "could hardly catch my breath", "barely able to breathe": nearly can't is can't.
      `|(?:can|could) (?:barely|hardly|scarcely) (?:${BREATHE}|catch ${WHOSE} breath|get (?:any |enough )?air)` +
      `|(?:barely|hardly|scarcely) able to (?:${BREATHE}|catch ${WHOSE} breath)` +
      "|not breathing|stopped breathing|hard to breathe|gasping|fighting for (?:breath|air)|struggling for (?:breath|air)" +
      "|(?:trouble|difficulty|struggling|struggled|struggle|a hard time|problems?) (?:to )?(?:breathing|breathe|catching (?:my|her|his) breath)" +
      // "Breathing is really hard today", "it's hard to catch my breath", and too breathless to finish a sentence (a
      // classic sign of severe breathlessness). Not "my breathing exercises".
      `|breathing (?:is|was|feels)(?: really| very| so)? (?:hard|difficult|a struggle)|hard to catch ${WHOSE} breath` +
      `|${CANT} (?:finish|complete) (?:a|my) sentences?`,
  ),
  // qa.ts "chest pains?", "heart attack". Pressure, tightness and discomfort are the same sign in other words
  // ("discomfort" is how many people, often older women, describe a heart attack).
  rule(
    "chest pain or pressure",
    "chest (?:pains?|pressure|tightness|discomfort|is (?:tight|hurting|aching|sore)|feels? (?:[a-z]+ )?(?:tight|heavy|crushed|squeezed)|hurts?|aches?|aching)" +
      `|(?:pains?|pressure|tightness|discomfort|ache|aching|squeezing) (?:in|across|on) ${WHOSE} chest|tight chest|heart attack` +
      // Pain that spreads from the chest ("pain spreading from my chest to my left arm", "pain going down my left arm
      // from my chest"), and heavy or crushing chest sensations in everyday words ("crushing feeling in my chest",
      // "my chest feels like an elephant is sitting on it", "something heavy on my chest", "my chest is killing me").
      `|(?:pains?|pressure|tightness|discomfort|ache|aching)(?: [a-z']+){0,6} from ${WHOSE} chest` +
      `|(?:crushing|heavy|squeezing|tight) (?:feeling|sensation|weight) (?:in|on|across) ${WHOSE} chest` +
      `|chest is killing|chest feels? like|(?:weight|something heavy|elephant)(?: [a-z']+){0,3} on ${WHOSE} chest`,
  ),
  // qa.ts "sudden weakness or one-sided symptoms": "weak on one side", "one side of her face", and a named side
  // ("my left arm is numb", "numbness in my left arm"), or "suddenly can't stand".
  rule(
    "weakness or numbness on one side",
    "(?:weak|weakness|numb|numbness|tingling|no feeling)(?: [a-z']+){0,4} one side|one side of (?:my|her|his|their) (?:face|body|mouth)" +
      // A named side of the face or body is the same sign as "one side of my face" ("left side of my face feels numb").
      `|(?:left|right) side of ${WHOSE} (?:face|body|mouth)` +
      "|(?:left|right) (?:arm|leg|hand|foot|side|face)(?: [a-z']+){0,3} (?:numb|weak|tingl\\w*|dead|limp|floppy)" +
      `|(?:numb|numbness|weak|weakness|tingling|no feeling)(?: [a-z']+){0,3} (?:in|on|down) ${WHOSE} (?:left|right)` +
      `|${CANT} (?:move|lift|feel) ${WHOSE} (?:left|right) (?:arm|leg|hand|foot|side)` +
      // A single limb with no side named ("I can't move my arm"), and sudden numbness or weakness in either order
      // ("my arm went numb and weak suddenly", "suddenly felt weak").
      `|${CANT} (?:move|lift|feel) ${WHOSE} (?:arm|leg|hand|foot)` +
      `|${SUDDEN}(?: [a-z']+){0,4} (?:numb|numbness|weak|weakness)|(?:numb|numbness|weak|weakness)(?: [a-z']+){0,4} ${SUDDEN}` +
      `|${SUDDEN}(?: [a-z']+){0,4} ${CANT} (?:stand|walk|talk|speak|see|lift)`,
  ),
  // qa.ts "droop", for the face only: drooping eyelids after lunch are the drowsiness she logs.
  rule(
    "a drooping face",
    "(?:face|mouth|lips?|smile|cheek)(?: [a-z']+){0,3} droop\\w*|droop\\w*(?: [a-z']+){0,3} (?:face|mouth|lips?|smile|cheek)" +
      // A crooked or uneven face in lay words ("my smile is crooked", "lopsided mouth"), and "half my face won't move".
      "|(?:crooked|lopsided|uneven) (?:face|mouth|smile)|(?:face|mouth|smile)(?: [a-z']+){0,2} (?:crooked|lopsided|uneven)" +
      `|half (?:of )?${WHOSE} (?:face|body)`,
  ),
  // qa.ts "slurr", plus trouble getting words out. Not "couldn't talk to Alex".
  rule(
    "trouble speaking",
    "slurr\\w*|speech (?:is |was )?(?:slurred|garbled|jumbled)|words (?:came|come|coming) out (?:wrong|jumbled|garbled|funny)" +
      // "my husband said my words were jumbled".
      "|words (?:were|are|was) (?:jumbled|garbled|slurred|mixed up)" +
      `|(?:trouble|difficulty|struggling|struggled|a hard time|problems?) (?:speaking|talking|getting ${WHOSE} words out|saying ${WHOSE} words)` +
      `|${CANT} (?:speak|talk|get ${WHOSE} words out)(?! (?:to|with|about|on|for)(?![a-z]))` +
      // Word-finding trouble ("can't find my words", "struggling finding her words"), but not a word game ("couldn't
      // find my words for the crossword"). "the words" is left out: "couldn't find the words to thank her" is an idiom.
      `|(?:${CANT} find|(?:trouble|struggling|struggled|difficulty) (?:finding|to find)) (?:my|her|his|their) words` +
      "(?! for (?:the |a |my )?(?:crossword|puzzle|scrabble|card|letter|speech|poem|quiz))",
  ),
  // qa.ts "stroke", "mini-stroke" (not "TIA": it is also a first name). "my stroke" names a past event (see PAST_EVENT_NAME).
  rule("a stroke", "(?:having|had|have|is|was|it'?s|think|thought|maybe|like) (?:a |another )?(?:mini[- ]?)?stroke|stroke symptoms"),
  // Help / EMERGENCY_LINE "sudden confusion"; qa.ts "sudden confusion" and "acute confusion". Confusion alone is a
  // symptom she logs, so it needs "suddenly" or not knowing where or who she is.
  rule(
    "sudden confusion",
    `${SUDDEN}(?: [a-z']+){0,6} ${CONFUSED}|${CONFUSED}(?: [a-z']+){0,6} ${SUDDEN}` +
      "|(?:didn'?t|did not|don'?t|do not|couldn'?t|could not|doesn'?t|does not) (?:know|recogni[sz]e) (?:where (?:i|she|he|they) (?:was|am|is|were)|who (?:i|she|he|they) (?:was|am|is|were)|what day it (?:was|is)|my own (?:home|house|family))",
  ),
  // qa.ts "won't wake", "unresponsive", "not rousable". Someone else could not wake her (or him): "I couldn't wake
  // up this morning" is a tired morning, not this sign.
  rule(
    "not waking or not responding",
    "unconscious|unresponsive|unrousable|not rousable|(?:won'?t|wouldn'?t|can'?t|couldn'?t|could not|cannot) (?:wake|rouse) (?:me|her|him|them)(?! up early)" +
      "|(?:hard|difficult|impossible) to (?:wake|rouse) (?:me|her|him|them)|(?:she|he|they) (?:won'?t|wouldn'?t|didn'?t|couldn'?t) wake up" +
      // "Nobody could wake me": the "no" of "nobody" / "no one" is inside the match, so it is never read as negation.
      "|(?:nobody|no one) could (?:wake|rouse)",
  ),
  // qa.ts "passed out", "fainted", "collapsed". Not "felt faint" (light-headedness she logs as dizziness).
  rule("fainting or collapse", "fainted|fainting|passed out|blacked out|black out|lost consciousness|knocked out|collaps\\w*"),
  // Help / EMERGENCY_LINE "a fall with a head injury"; qa.ts "hit her head". Any knock to the head counts: a missed
  // head injury after a fall is worse than a false alarm after a bump on a cupboard.
  // Present-tense verbs too ("I did bang my head"), a part of the head between ("hit the back of my head"), and a
  // bleeding or cut head ("I fell and my head is bleeding", "a cut on my head").
  rule(
    "a knock to the head",
    `(?:hit|bang(?:ed)?|bump(?:ed)?|knock(?:ed)?|cracked|smack(?:ed)?|whack(?:ed)?|bash(?:ed)?) (?:(?:the )?(?:back|side|front|top) of )?${WHOSE} head` +
      `|head injury|hurt ${WHOSE} head|head (?:is |was )?(?:bleeding|cut|gashed)|(?:cut|gash) on ${WHOSE} head`,
  ),
  // qa.ts "seizures?", "having a fit", "convulsions". Not a medicine for seizures.
  rule("a seizure", "seizures?(?! (?:medicine|medication|meds|pills?|tablets?|disorder))|(?:having|had) a fit|convuls\\w*"),
  // qa.ts "colour change".
  rule("blue or grey lips or face", "(?:lips?|face|skin|fingers?) (?:(?:are|is|look\\w*|turn\\w*|went|gone|going|got) )+(?:blue|grey|gray|purple)"),
  // qa.ts "choking", "bleeding a lot", "coughing up blood".
  rule("choking", "choking"),
  // qa.ts "anaphyla\w*", "throat (?:is )?(?:swelling|closing)", plus a tight throat and a swelling tongue or lips
  // (the same allergic sign in the words a patient writes). Not "sore throat" or "scratchy throat". Up to four words
  // may sit between "throat" and "closing" or "swell" ("throat feels like it's closing", "making my throat swell
  // up"), but not a negator ("my throat is not swollen" stays quiet).
  rule(
    "throat swelling or closing",
    "anaphyla\\w*|throat (?:is |feels? )?tight" +
      "|throat(?: (?!(?:not|no|never|isn'?t|wasn'?t|aren'?t|hasn'?t|didn'?t)(?![a-z']))[a-z']+){0,4} (?:clos(?:ing|es|ed)|swell\\w*|swollen)" +
      "|(?:tongue|lips?) (?:is |are )?(?:swell\\w*|swollen)",
  ),
  rule(
    "serious bleeding",
    "bleeding (?:a lot|heavily|badly|won'?t stop|that won'?t stop)|(?:won'?t|wouldn'?t|can'?t|couldn'?t) stop bleeding" +
      "|(?:vomiting|vomited|throwing up|threw up|coughing up|coughed up|spitting up) blood",
  ),
];

/**
 * Splits the note where one statement ends and another begins: sentence ends, commas, semicolons, and the joining
 * words that start a new statement ("but", "and", "then", "because", "when"). "or" and "nor" do not split, so "no
 * chest pain or trouble breathing" keeps both signs under its "no". "and" splits, so in "no chest pain and my arm
 * went numb" the "no" does not reach the arm. "since" and "as" do not split: "weak since my stroke" and "as a child"
 * are the history words that quiet a past mention.
 */
const CLAUSE_BREAK =
  /[.!?;,:\n]+|\s(?:but|and|then|though|although|however|yet|except|plus|also|so|because|'?cause|when|while|until|till|'?til|after|before)\s/;
const SENTENCE_BREAK = /[.!?;\n]+/;

/** Hedges that contain "not" or "no" but negate nothing: "not sure if it was chest pain". */
const HEDGE = /(?<![a-z])(?:not (?:sure|certain|quite sure)|don'?t know|do not know|didn'?t know|no idea|oh no|can'?t tell|not clear)(?![a-z])/g;

/** A plain negation before the sign, in the same clause: "no", "not", "never", "didn't have", "neither", "without". */
const NEGATION =
  /(?<![a-z'])(?:no|not|never|neither|nor|without|none|zero|denies|denied|haven'?t|hasn'?t|hadn'?t|didn'?t|don'?t|doesn'?t|did not|do not|does not|no more|no longer|free of)(?![a-z])/g;

/**
 * NEGATION_FILLER: the only words that may stand between a negator and the sign for the negator to govern it.
 * "I haven't had any problems with chest pain" and "no chest pain or trouble breathing" (other signs joined by
 * "or" / "nor" are taken out first) are negated. Any other word means the negator belongs to something else:
 * "Nitro didn't help the chest pain", "didn't sleep with this chest pain", "I don't like this chest pain". "just"
 * and "only" are not filler on purpose, so they reopen the sign: "no headache just chest pain" shows the line.
 */
const NEGATION_FILLER =
  /^(?:have|has|had|having|been|ever|even|really|any|feel|felt|feeling|get|got|getting|notice|noticed|experienc\w*|a|an|the|my|her|his|their|more|further|signs?|of|problems?|issues?|with|or|nor|trouble)$/;

/**
 * NOVELTY: after a "never" or "haven't / didn't (have)" negation, "like this", "this bad", "so bad", "worst" or
 * "before" says the sign is happening now and is new: "never had chest pain like this before", "never felt chest
 * pressure this bad", "I haven't had chest pain like this before". Read in the next few words of the sentence (a
 * clause can end at "before": "never had chest pain before today"). Not after "no": "no chest pain like before".
 */
const NOVELTY = /(?<![a-z])(?:like (?:this|that|it)|this bad|so bad|as bad|worst|before)(?![a-z])/;
const NOVELTY_NEGATOR = /^(?:never|haven'?t|hasn'?t|hadn'?t|didn'?t|did not)$/;
const NOVELTY_REACH = 6;

/**
 * COMPARISON: a past event named only to compare with now does not put the sign in the past: "chest pain like my
 * heart attack in 2019", "same chest pain as last year", "chest pain worse than last year".
 */
const COMPARISON = /(?<![a-z])(?:like|same|as (?:bad|before)|than|similar|just as)(?![a-z])/;

/** Words of a clause, split on single spaces. */
const words = (text: string): string[] => text.split(" ").filter(Boolean);

/**
 * True when a negator before the sign governs it: only NEGATION_FILLER words (or other signs) between them. A
 * "without" counts only when it opens the clause ("without chest pain today"): after a verb it says the sign
 * happens ("can't walk to the mailbox without chest pain", "can't lie down without gasping"). A "never" is undone
 * by NOVELTY in `after` (so are "haven't" and "didn't").
 */
function negates(before: string, after: string): boolean {
  for (const m of before.matchAll(NEGATION)) {
    const between = EMERGENCY_SIGN_RULES.reduce((t, r) => t.replace(new RegExp(r.pattern.source, "g"), " "), before.slice(m.index + m[0].length));
    if (!words(between).every((w) => NEGATION_FILLER.test(w))) continue;
    if (m[0] === "without" && !words(before.slice(0, m.index)).every((w) => NEGATION_FILLER.test(w))) continue;
    if (NOVELTY_NEGATOR.test(m[0]) && NOVELTY.test(words(after).slice(0, NOVELTY_REACH).join(" "))) continue;
    return true;
  }
  return false;
}

/**
 * ONSET_AFTER_NEGATION: a negated sign that the same sentence says started later still shows the line, because the
 * "no" covers only the time before. (a) UNTIL: the words after the sign go on to "until", "till", "'til", "up until"
 * or "up to" ("haven't had any chest pain until today", "never had chest pain till today"). Read like NOVELTY, in the
 * words after the sign, since "until" also ends the clause. (b) LATER: the sign's clause names an earlier time
 * ("yesterday", "this morning", "last night", "earlier") and a later clause of the sentence says it is now, or that
 * something started ("no chest pain yesterday but today it is bad", "no chest pain this morning but now it hurts a
 * lot"). "No chest pain today", "haven't had any chest pain" and "chest pain last year, none today" stay quiet.
 */
const ONSET_UNTIL = /^(?:(?:at all|whatsoever|up) )?(?:until|till|'?til|up to)(?![a-z])/;
const ONSET_EARLIER_TIME = /(?<![a-z])(?:yesterday|this morning|last night|earlier|at first)(?![a-z])/;
const ONSET_STARTED = /(?<![a-z])(?:started|starting|began|begun|came on|come on|kicked in)(?![a-z])/;

function onsetAfterNegation(after: string, clause: string, rest: string): boolean {
  if (ONSET_UNTIL.test(words(after).join(" "))) return true;
  return ONSET_EARLIER_TIME.test(clause) && (saysNow(rest, NOW) || ONSET_STARTED.test(rest));
}

/**
 * PAST: words that put a clause in the past: a year, "last year", "a few years ago", "as a child". Not "yesterday" or
 * "last night": a sign from last night is recent enough that the line should still show.
 */
const PAST = new RegExp(
  "(?<![a-z])(?:" +
    [
      "last (?:year|month|week|winter|summer|spring|autumn|fall|christmas|easter)",
      "(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|several|a few|a couple of|many|some) (?:weeks?|months?|years?) (?:ago|back|before)",
      "(?:in|back in|since) (?:19|20)\\d\\d",
      "as a (?:child|kid|girl|boy|teenager)",
      "when i was (?:young|younger|little|a child|a kid|\\d+)",
      "in the past|a long time ago|years ago|long ago|(?:a|my|her|his) history of|used to (?:have|get)|previously",
    ].join("|") +
    ")(?![a-z])",
);

/**
 * SINCE_ONGOING: "since" says a sign has gone on from then until now, so for the sudden signs (chest pain,
 * breathing, fainting and the rest) the words from "since" on are not a past marker: "chest pain since my heart
 * attack last week", "since my heart attack I've had chest pain", "ever since my heart attack 3 days ago". Chest pain
 * after a recent heart attack is a red flag. A negated mention still stays quiet through NEGATION ("no chest pain
 * since my heart attack").
 */
const SINCE_ONGOING = /(?<![a-z])(?:ever )?since(?![a-z]).*$/;

/**
 * STROKE_RESIDUAL: a lasting deficit after a stroke ("my left arm has been weak since my stroke", "trouble speaking
 * since her stroke") is the one place "since" puts a sign in the past, and only for these two rules, and only with no
 * word saying it is happening now. Not "since my fall" (new one-sided weakness after a fall is a possible bleed) and
 * not "since my heart attack".
 */
const STROKE_RESIDUAL_RULES: ReadonlySet<string> = new Set(["weakness or numbness on one side", "trouble speaking"]);
const STROKE_HISTORY = /(?<![a-z])(?:(?:since|after) (?:my|her|his|the) |(?:my|her|his) (?:old |previous |last |first |earlier )?)(?:mini[- ]?)?stroke(?![a-z])/;

/**
 * PAST_EVENT_NAME: a sign word that names a past event with a possessive ("my heart attack", "her stroke", "his
 * seizure") is the event, not a sign happening now, unless the note says it is back or happening now ("my heart
 * attack symptoms are back"). It quiets only that mention, never another sign in the same clause.
 */
const PAST_EVENT_WORD = /(?:heart attack|stroke|seizure)/;
const PAST_EVENT_NAME = /(?<![a-z'])(?:my|her|his|their) (?:old |previous |last |first |earlier |recent )?(?:mini[- ]?)?$/;

/** Words that bring a past sign back to now, anywhere in the note: "again", "it's back", "came back", "still", "are back". */
const RETURN =
  /(?<![a-z])(?:again|still|returned|recurr\w*|(?:it'?s|its|it is|is|are|they'?re|they are|has come|have come|came|come|coming|was|were) back)(?![a-z])/g;
/** Words that put a sentence in the present: counted only when not negated ("none today", "fine today"). */
const NOW =
  /(?<![a-z])(?:today|tonight|now|this (?:morning|afternoon|evening|week)|at the moment|currently|right now|just now|every day|lately|these days|recently)(?![a-z])/g;
/** What turns a present or return word into "not now": "none today", "fine today", "it's not back". */
const NOT_NOW = /(?<![a-z'])(?:no|not|none|nothing|never|n't|fine|ok|okay|better|gone|clear|free|all right|alright)(?:\s+[a-z']+)?\s*$/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[ \t]+/g, " ");
}

/** True when a present or return word in `text` is not itself negated ("it's back today" yes, "none today" no). */
function saysNow(text: string, words: RegExp): boolean {
  for (const m of text.matchAll(words)) {
    const before = text.slice(0, m.index).replace(/n't\b/g, " n't");
    if (!NOT_NOW.test(before)) return true;
  }
  return false;
}

/** Splits text on a break pattern, keeping the pieces only. */
function split(text: string, br: RegExp): string[] {
  return text.split(new RegExp(br.source, "g")).map((s) => s.trim()).filter(Boolean);
}

/**
 * One clause: does a sign appear in it that is neither negated nor plainly in the past? Every mention is checked,
 * so a negated one does not hide a later one. `rest` is the sentence after this clause (for NOVELTY).
 */
function signsIn(clause: string, rest: string, sentence: string, returnsInNote: boolean): string[] {
  const found: string[] = [];
  for (const r of EMERGENCY_SIGN_RULES) {
    for (const m of clause.matchAll(new RegExp(r.pattern.source, "g"))) {
      const end = m.index + m[0].length;
      const before = clause.slice(0, m.index);
      const after = clause.slice(end) + " " + rest;
      // Negation: a negator in this clause that governs the sign, with hedges taken out, unless the sentence says the
      // sign started later (ONSET_AFTER_NEGATION).
      if (negates(before.replace(HEDGE, " "), after) && !onsetAfterNegation(after, clause, rest)) continue;
      // History: the mention names a past event (PAST_EVENT_NAME), or a past marker is in this clause (PAST, with
      // SINCE_ONGOING for the sudden signs, STROKE_HISTORY for a stroke's lasting deficits) with no COMPARISON; and
      // nothing in the sentence or note says it is happening now.
      const namesPastEvent = PAST_EVENT_WORD.test(m[0]) && PAST_EVENT_NAME.test(before);
      const past = STROKE_RESIDUAL_RULES.has(r.name)
        ? PAST.test(clause) || STROKE_HISTORY.test(clause)
        : PAST.test(clause.replace(SINCE_ONGOING, " "));
      if ((namesPastEvent || (past && !COMPARISON.test(clause))) && !returnsInNote && !saysNow(sentence, NOW)) continue;
      found.push(r.name);
      break;
    }
  }
  return found;
}

/**
 * The names of the emergency signs a check-in note describes as happening (not negated, not plainly past). Empty
 * when there are none. Used for tests and to explain why the line appeared; the line itself never names a sign.
 */
export function findEmergencySigns(text: string): string[] {
  const t = normalize(text);
  if (!t.trim()) return [];
  const returnsInNote = saysNow(t, RETURN);
  const found = new Set<string>();
  for (const sentence of split(t, SENTENCE_BREAK)) {
    let from = 0;
    for (const clause of split(sentence, CLAUSE_BREAK)) {
      const at = sentence.indexOf(clause, from);
      from = at < 0 ? from : at + clause.length;
      for (const name of signsIn(clause, sentence.slice(from), sentence, returnsInNote)) found.add(name);
    }
  }
  return [...found];
}

/** True when the note describes one of the app's listed emergency signs: the check-in then shows the static 911 line. */
export function describesEmergencySign(text: string): boolean {
  return findEmergencySigns(text).length > 0;
}
