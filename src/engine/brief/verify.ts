// Claim checker for AI-written sentences (SPEC §3, §6.5, §7).
//
// The on-device model only ever *drafts*. Before a human sees a draft, every sentence passes through
// this module, which is pure, deterministic code with no model in the loop:
//
//   1. Evidence: the sentence cites ≥1 evidence id, and every cited id exists in the package.
//   2. Numbers: every number (digits, number words, percents, "8 of 14" pairs, dates such as "Sep 24",
//      weekdays, multipliers such as "twice") appears in the text of the items the sentence cites.
//      "N of M" pairs must appear as pairs, keep their before/after side, and stay attached to the
//      same symptom, so a swapped or re-attributed count is caught even when both numbers exist.
//   3. Medicines: any drug name in the sentence is on this person's list or in the package text.
//   4. Language (BANNED_PATTERNS): no causal claims, advice to start/stop/change medicines, urgency,
//      reassurance ("safe"), diagnosis, regulatory/validation claims or risk scores.
//      Questions get a narrow allowance: "Could the lorazepam be contributing to the dizziness?" is a
//      fair question for a clinician, while the same words as a statement are a causal claim.
//   5. Hygiene: ≤280 characters, no URLs/HTML/markdown, no echoed evidence ids, no prompt-injection
//      or assistant-meta text, quoted words must exist in the cited evidence.
//
// Failing sentences are dropped by the caller (src/ai/tasks.ts) and counted in GenerationInfo.

import type { BriefSentence, EvidenceItem, EvidencePackage } from "../../model/types";

// ---------------------------------------------------------------------------
// Public types

export type BannedCategory =
  | "causal"
  | "advice"
  | "urgency"
  | "reassurance"
  | "diagnosis"
  | "claims"
  | "risk";

export interface BannedPattern {
  pattern: RegExp;
  reason: string;
  category: BannedCategory;
  /**
   * true = the phrase is acceptable inside the interrogative clause of a genuine question addressed to
   * the clinician (e.g. "Could X be contributing to Y?"), but never in a statement, a preamble
   * ("Since X is contributing to Y, …?") or a presupposing "why" question.
   */
  allowInQuestion?: boolean;
  /** true = only applies when the sentence refers to the person (her/his/Margaret/Mom/…). */
  patientScoped?: boolean;
}

export type SentenceForm = "statement" | "question";

export interface VerifyOptions {
  /** Medication names on this person's list (as entered, generic or brand). */
  medNames?: string[];
  /** Extra drug vocabulary (e.g. every KB drug, brand and alias) used to *detect* drug names. */
  knownDrugNames?: string[];
  /** The person's names, used to scope patient-specific rules ("Margaret", "Mom"). */
  patientNames?: string[];
  /** What the slot requires. "any" accepts either; "question" requires a genuine question. */
  expect?: SentenceForm | "any";
  /** Maximum characters (default 280). */
  maxLength?: number;
  /** Require at least one cited evidence id (default true). */
  requireEvidence?: boolean;
  /** Maximum number of cited ids (default 6). */
  maxEvidenceIds?: number;
  /** Years that may be mentioned without appearing in the cited text (e.g. the brief period). */
  knownYears?: number[];
}

export interface VerifyIssue {
  code:
    | "empty"
    | "too_long"
    | "too_short"
    | "no_evidence"
    | "too_many_evidence"
    | "unknown_evidence"
    | "banned"
    | "number_unsupported"
    | "pair_unsupported"
    | "pair_context"
    | "date_unsupported"
    | "quantifier_unsupported"
    | "med_unknown"
    | "binding_unsupported"
    | "quote_unsupported"
    | "unsafe_content"
    | "id_echo"
    | "form";
  detail: string;
}

// ---------------------------------------------------------------------------
// Banned language

/** Generic words that refer to a medicine (used by the medicine-linked causal check). */
const MED_WORDS =
  "(?:medicines?|medications?|meds|pills?|tablets?|caplets?|capsules?|drugs?|prescriptions?|sleeping pills?|sleep aids?|water pills?|sedatives?|tranquili[sz]ers?)";

/**
 * Static banned patterns. Each regex is case-insensitive and tested against normalised text
 * (curly quotes/dashes folded to ASCII). Order does not matter; all matches are reported.
 */
export const BANNED_PATTERNS: BannedPattern[] = [
  // --- causal claims ------------------------------------------------------------------------------
  { category: "causal", reason: "asserts that something caused a symptom", pattern: /\bcaused\b/i },
  {
    category: "causal",
    reason: "asserts that something is causing a symptom",
    pattern: /\b(?:is|are|was|were|be|been|being|it's|they're)\s+(?:\w+\s+)?causing\b/i,
  },
  {
    category: "causal",
    reason: "names a cause of this person's symptom",
    pattern: /\b(?:causes?|cause of|causing)\b/i,
    patientScoped: true,
  },
  {
    category: "causal",
    reason: "asserts that a medicine is making the person feel a certain way",
    pattern: /\b(?:is|are|was|were|be|been|it's)\s+(?:\w+\s+)?making\s+(?:her|him|them|me|you|mom|dad)\b|\b(?:made|makes)\s+(?:her|him|them|me|you|mom|dad)\s+(?:\w+\s+)?(?:dizz|drows|sleep|confus|fall|fell|unsteady|wobbl|fogg|tired|woozy|groggy|sick|weak)/i,
  },
  {
    category: "causal",
    reason: "assigns blame or responsibility for a symptom",
    pattern: /\b(?:responsible for|to blame|culprit|brought on by|triggered by|induced by|[a-z]+-induced|resulted in|resulting in|as a result of|the result of|the reason for|the reason (?:she|he) )/i,
  },
  {
    category: "causal",
    reason: "links a symptom to a medicine as a statement",
    // "contribute to the anticholinergic burden score" is how the published ACB scale is described.
    pattern: /\bcontribut\w*\s+to\b(?!\s+(?:an?\s+|the\s+|her\s+|his\s+|this\s+|a\s+)?(?:total\s+|combined\s+|overall\s+)?(?:anticholinergic|acb|burden|score|total))/i,
    allowInQuestion: true,
  },
  {
    category: "causal",
    reason: "calls this person's symptom a side effect",
    pattern: /\b(?:side[- ]?effects?|adverse (?:effects?|reactions?|drug reactions?)|(?:drug |allergic )?reactions?)\s+(?:of|from|to)\b|\b(?:is|are|was|were|be|seems?|looks?|appears?)\s+(?:\w+\s+){0,2}(?:a |an )?(?:side[- ]?effect|adverse effect|reaction)\b/i,
    allowInQuestion: true,
    patientScoped: true,
  },
  {
    category: "causal",
    reason: "links a symptom to a medicine as a statement",
    pattern: new RegExp(
      `\\b(?:because of|due to|related to|linked to|attributable to|attributed to|associated with|explained by|from|on account of)\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+|this\\s+|that\\s+|these\\s+|those\\s+)?(?:new\\s+)?${MED_WORDS}\\b`,
      "i",
    ),
    allowInQuestion: true,
  },
  {
    category: "causal",
    reason: "uses a medicine to explain a symptom as a statement",
    pattern: /\b(?:explains?|explained|explaining|accounts? for)\s+(?:her|his|the|this|these|those|their)\s+(?:\w+\s+)?(?:dizz|fall|near|drows|confus|fog|swell|symptom|tired|sleep|energy|unsteady)/i,
    allowInQuestion: true,
  },

  // --- advice to start / stop / change ------------------------------------------------------------
  {
    category: "advice",
    reason: "tells someone to start, stop or change a medicine",
    pattern: /\b(?:you|she|he|we|they|margaret|mom|mum|dad|the patient|the family)\s+(?:should|must|ought to|needs? to|has to|have to|had better)\s+(?:not\s+)?(?:stop|start|take|quit|avoid|reduce|lower|increase|raise|cut|change|switch|discontinue|taper|skip|halve|double|try|come off|wean)\b/i,
    allowInQuestion: true,
  },
  {
    category: "advice",
    reason: "says a medicine should be changed",
    pattern: /\b(?:should|must|needs? to|ought to)\s+be\s+(?:stopped|started|discontinued|reduced|lowered|increased|changed|switched|tapered|halved|doubled|adjusted|replaced|removed|deprescribed|avoided)\b/i,
    allowInQuestion: true,
  },
  {
    category: "advice",
    reason: "tells someone to start or stop taking a medicine",
    pattern: /\b(?:stop|start|quit|keep|continue|resume|begin)\s+(?:taking|using|giving)\b/i,
    allowInQuestion: true,
  },
  {
    category: "advice",
    reason: "proposes a dose change",
    pattern: /\b(?:increase|increasing|reduce|reducing|lower|lowering|raise|raising|change|changing|adjust|adjusting|cut|cutting|double|doubling|halve|halving|decrease|decreasing)\s+(?:the\s+|her\s+|his\s+|your\s+|its\s+|this\s+|that\s+)?(?:\w+\s+)?dos(?:e|es|age|ing)\b/i,
    allowInQuestion: true,
  },
  {
    category: "advice",
    reason: "proposes switching medicines",
    pattern: /\bswitch(?:ing|ed)?\s+(?:her\s+|him\s+|them\s+|you\s+|it\s+)?(?:over\s+)?to\b/i,
    allowInQuestion: true,
  },
  {
    category: "advice",
    reason: "proposes tapering or discontinuing",
    pattern: /\b(?:taper(?:ing|ed)?|wean(?:ing|ed)?|discontinu\w*|deprescrib\w*|come off|coming off|consider (?:stopping|starting|switching|reducing|lowering|changing|tapering|adding))\b/i,
    allowInQuestion: true,
  },
  {
    category: "advice",
    reason: "gives a recommendation",
    pattern: /\b(?:i|we)\s+(?:would\s+)?(?:recommend|advise|suggest)\b|\brecommend(?:s|ed|ing)?\s+(?:that|stopping|starting|taking|reducing|switching|lowering|increasing|changing)\b|\b(?:my|our) (?:advice|recommendation)\b/i,
  },
  {
    category: "advice",
    reason: "gives an instruction about taking a medicine",
    pattern: /\b(?:do not|don't|never)\s+(?:take|give|stop|start|change|skip|use)\b|^\s*(?:please\s+)?(?:stop|start|take|give|avoid|reduce|increase|switch|discontinue|skip|try|call)\b/i,
  },
  {
    category: "advice",
    reason: "tells the family what is best to do",
    // "It's important to discuss this with the doctor" is exactly what Kinwise wants families to do.
    pattern: /\b(?:it is|it's|it would be|would be)\s+(?:best|better|wise|advisable|important|necessary|essential)\s+to\b(?!\s+(?:discuss|ask|talk|mention|bring|raise|share|tell|review|keep|write|note|check with))/i,
    allowInQuestion: true,
  },

  // --- urgency / alarm ----------------------------------------------------------------------------
  {
    category: "urgency",
    reason: "assigns urgency",
    // "Urgent care" is a place (the seed's lorazepam prescriber), not an urgency claim.
    pattern: /\burgent(?:ly)?\b(?!\s+care)|\bemergenc(?:y|ies)\b|\bimmediate(?:ly)?\b|\bright away\b|\bas soon as possible\b|\basap\b|\bwithout delay\b|\btime[- ]sensitive\b|\bdo not wait\b|\bdon't wait\b/i,
  },
  {
    category: "urgency",
    reason: "directs the family to emergency care",
    pattern: /\b(?:call|dial)\s+911\b|\b911\b|\bgo to (?:the )?(?:er|e\.r\.|hospital|emergency)|\bseek (?:immediate |urgent |emergency |medical )?(?:care|attention|help)\b/i,
  },
  {
    category: "urgency",
    reason: "uses alarming language",
    pattern: /\b(?:life[- ]threatening|critical(?:ly)?|danger(?:ous|ously)?|unsafe|alarming|worrying|frightening|serious(?:ly)? (?:risk|concern|problem|danger|harm|condition))\b/i,
  },

  // --- reassurance --------------------------------------------------------------------------------
  { category: "reassurance", reason: 'calls something "safe"', pattern: /\bsafe(?:r|st|ly)?\b/i },
  {
    category: "reassurance",
    reason: "offers reassurance",
    pattern: /\b(?:nothing to worry|no need to|not to worry|don't worry|do not worry|harmless|nothing serious|not serious|no cause for concern|nothing to be concerned|normal (?:for|at) (?:her|his|their) age|just (?:old age|aging|ageing)|benign(?!\s+prostatic)|no (?:real )?risk|risk[- ]free|without risk|(?:fine|okay|ok|alright) to (?:take|continue|keep|use))\b/i,
  },

  // --- diagnosis ----------------------------------------------------------------------------------
  { category: "diagnosis", reason: "talks about diagnosis", pattern: /\bdiagnos\w*/i },
  {
    category: "diagnosis",
    reason: "suggests a diagnosis",
    pattern: /\b(?:has|have|had|is developing|developed|developing|is showing signs? of|shows? signs? of|signs? of|symptoms? of|suffer(?:s|ing)? from|consistent with|indicative of|indicates|suggests|points to)\s+(?:early\s+|mild\s+|possible\s+|probable\s+|some\s+)?(?:dementia|alzheimer\w*|parkinson\w*|delirium|a stroke|stroke|a tia|depression|an? (?:infection|uti)|uti|cognitive (?:decline|impairment)|neuropathy|vertigo|orthostatic hypotension|hypotension|an? (?:heart|kidney|liver) (?:problem|condition|disease)|heart failure|kidney disease)\b/i,
  },
  {
    category: "diagnosis",
    reason: "labels the person with a condition",
    pattern: /\bis suffering\b|\bsuffers from\b|\bis (?:demented|delirious|senile)\b|\bdisease progression\b|\bdeteriorat\w*/i,
  },

  // --- predictions about this person ---------------------------------------------------------------
  {
    category: "risk",
    reason: "predicts what will happen to this person",
    pattern: /\b(?:she|he|they|margaret|mom|mum|dad|the patient)\s+(?:might|may|could|will|would|is likely to|are likely to|is going to|can)\s+(?:\w+\s+)?(?:experience|develop|get|suffer|fall|become|end up|have (?:a|another|more))\b/i,
    allowInQuestion: true,
  },

  // --- regulatory / validation / certainty claims -------------------------------------------------
  {
    category: "claims",
    reason: "makes a regulatory or validation claim",
    pattern: /\bfda[- ]?(?:approved|cleared|clearance|approval)\b|\bclinically (?:validated|proven|tested|approved)\b|\bhipaa\b|\bvalidated\b|\bcertified\b|\bguarantee\w*/i,
  },
  {
    category: "claims",
    reason: "overstates what the records show",
    pattern: /\b(?:statistically\s+)?significant(?:ly)?\b|\bprove[sn]?\b|\bproof\b|\bconfirms? that\b|\bclearly shows?\b|\bdefinitely\b|\bcertainly\b|\bundoubtedly\b/i,
  },

  // --- risk labels --------------------------------------------------------------------------------
  { category: "risk", reason: 'uses a "risk score"', pattern: /\brisk scores?\b/i },
  {
    category: "risk",
    reason: "predicts this person's risk as a statement",
    pattern: /\b(?:increase[sd]?|increasing|raise[sd]?|raising|heighten\w*|double[sd]?|put(?:s|ting)?\s+(?:her|him|them)\s+at)\s+(?:her|his|their|margaret's|mom's)?\s*(?:\w+\s+)?risk\b/i,
    allowInQuestion: true,
    patientScoped: true,
  },
  {
    category: "risk",
    reason: "labels the person's risk level",
    pattern: /\b(?:she|he|margaret|mom|mum|dad|the patient|they)\s+(?:is|are|was)\s+(?:now\s+)?(?:at\s+)?(?:a\s+)?(?:very\s+)?(?:high|higher|low|lower|increased|elevated|great|significant|serious)[- ]risk\b|\bhigh[- ]risk (?:patient|person|woman|man)\b/i,
  },
];

/** Assistant-meta, prompt-injection and formatting debris that must never reach a brief. */
const UNSAFE_CONTENT: { pattern: RegExp; reason: string }[] = [
  { reason: "contains a link", pattern: /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|org|net|gov|io|ai)\b/i },
  { reason: "contains HTML or code", pattern: /<\/?[a-z!][^>]*>|javascript:|```|[{}[\]]|&lt;|&gt;/i },
  { reason: "contains chat-template markers", pattern: /<\|[^|]*\|>|\bim_start\b|\bim_end\b/i },
  {
    reason: "echoes an instruction or prompt",
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier|preceding)\b|\bsystem prompt\b|\bdeveloper (?:message|mode)\b|\bjailbreak\b|\byou are now\b|\bnew instructions?\b|\bprompt injection\b/i,
  },
  {
    reason: "contains assistant meta-talk",
    pattern: /\bas an ai\b|\blanguage model\b|\bi (?:cannot|can't|am unable|am not able|apologi[sz]e)\b|\bi'm (?:sorry|unable|not able)\b|\bas kinwise\b/i,
  },
  { reason: "contains markdown formatting", pattern: /\*\*|__|^\s*(?:[-*•]|\d+[.)])\s|^#+\s/ },
];

/** Echoed evidence ids ("sig:med-lorazepam:dizziness") belong in evidenceIds, never in prose. */
const ID_ECHO = /\b(?:fact|sig|find|med|note|concern|entry):[\w-]/i;

const PATIENT_REF = /\b(?:she|her|hers|herself|he|him|his|himself|mom|mum|mother|dad|father|the patient|patient's|my (?:mother|father|mom|dad))\b/i;

// ---------------------------------------------------------------------------
// Text helpers

/** Fold typographic characters so regexes see plain ASCII punctuation. */
export function foldText(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split text into sentences (keeps the terminal punctuation). Abbreviations like "Dr." are kept. */
export function splitSentences(text: string): string[] {
  const t = foldText(text);
  if (!t) return [];
  const pieces = [...t.matchAll(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)].map((m) => m[0]);
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < pieces.length; i++) {
    buf += pieces[i];
    const next = pieces[i + 1] ?? "";
    // Keep going after abbreviations ("Dr.", "e.g.") and inside decimals ("0.5": "0." + "5 mg").
    const abbreviation = /\b(?:dr|mr|mrs|ms|st|vs|e\.g|i\.e|approx|no)\.\s*$/i.test(buf);
    const decimal = /\d\.$/.test(buf) && /^\d/.test(next);
    if (abbreviation || decimal) continue;
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const INTERROGATIVE =
  /^(?:could|can|should|would|will|shall|is|are|was|were|do|does|did|has|have|had|may|might|must|what|which|when|where|why|how|who|whom|whose|whether|are there|is there)\b/i;
const TAG_QUESTION =
  /,\s*(?:isn't|aren't|wasn't|weren't|doesn't|don't|didn't|hasn't|haven't|won't|wouldn't|couldn't|can't|right|correct|true|no|yes)\b[^?]*\?\s*["')\]]*$/i;

export interface SentenceShape {
  form: SentenceForm;
  /** Text before the interrogative clause (checked with statement rules). Whole text for statements. */
  preamble: string;
  /** The interrogative clause ("" for statements). */
  clause: string;
  /** "why"/"how come" questions presuppose their content, so causal allowances do not apply. */
  presupposing: boolean;
}

/**
 * Decide whether a sentence is a genuine question. A question must end with "?" and contain an
 * interrogative clause (auxiliary or wh-word) either at the start or after a comma/colon. Declarative
 * sentences with a question mark ("Lorazepam is contributing to it?") and tag questions
 * ("…, isn't it?") are treated as statements.
 */
export function sentenceShape(sentence: string): SentenceShape {
  const s = foldText(sentence).replace(/^["'(\[]+/, "");
  const stripped = s.replace(/["')\]]+$/, "");
  if (!stripped.endsWith("?") || TAG_QUESTION.test(s)) {
    return { form: "statement", preamble: s, clause: "", presupposing: false };
  }
  let start = -1;
  if (INTERROGATIVE.test(s)) start = 0;
  else {
    const re = /[,;:—-]\s+/g;
    for (const m of s.matchAll(re)) {
      const at = (m.index ?? 0) + m[0].length;
      if (INTERROGATIVE.test(s.slice(at))) {
        start = at;
        break;
      }
    }
  }
  if (start < 0) return { form: "statement", preamble: s, clause: "", presupposing: false };
  const clause = s.slice(start);
  return {
    form: "question",
    preamble: s.slice(0, start),
    clause,
    presupposing: /^(?:why|how come)\b/i.test(clause),
  };
}

// ---------------------------------------------------------------------------
// Numbers, dates and quantities

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100, dozen: 12,
};
const NUMBER_WORD_RE = new RegExp(
  `\\b(?:(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)|${Object.keys(NUMBER_WORDS).join("|")})\\b`,
  "gi",
);
/** "one" is only a number when it counts something ("one fall", "one of 13 days"). */
const ONE_COUNTED =
  /^\s+(?:(?:more|other|single|extra)\s+)?(?:days?|nights?|times?|falls?|near-falls?|weeks?|months?|entr(?:y|ies)|check-ins?|doses?|tablets?|pills?|caplets?|episodes?|occasions?|medicines?|medications?|of\s+(?:the\s+)?(?:\d|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)|in\s+\d)/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};
const MONTH_ALT =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_MD_RE = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, "gi");
const DATE_DM_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\b\\.?(?:,?\\s+(\\d{4})\\b)?`, "gi");
const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DATE_SLASH_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
const WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi;
/** Multipliers and absolute quantifiers are claims too: they must appear in the cited text. */
const QUANTIFIER_RE =
  /\b(?:once|twice|thrice|double[ds]?|doubling|triple[ds]?|tripling|quadrupled|halved|half|every (?:day|night|single day)|each day|most days|majority|nearly every|almost every|all (?:of the )?days|never|always|constantly|daily)\b/gi;

export interface NumericFacts {
  /** Plain numbers (digits, number words, percents, years). */
  numbers: number[];
  percents: number[];
  /** "8 of 14" / "8 out of 14" / "8/14" pairs with their surrounding context. */
  pairs: {
    a: number;
    b: number;
    side: "before" | "after" | null;
    /** Symptom keywords in the pair's clause. */
    metrics: string[];
    /** Symptom keywords anywhere in the pair's sentence (fallback for evidence text). */
    sentenceMetrics: string[];
  }[];
  /** "MM-DD" month-day tokens. */
  dates: string[];
  weekdays: string[];
  quantifiers: string[];
}

function toNumber(token: string): number | null {
  const t = token.toLowerCase().replace(/,/g, "");
  if (/^\d+(?:\.\d+)?$|^\.\d+$/.test(t)) return Number(t);
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  const hy = /^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(\w+)$/.exec(t);
  if (hy && hy[2] in NUMBER_WORDS) return NUMBER_WORDS[hy[1]] + NUMBER_WORDS[hy[2]];
  return null;
}

const METRIC_KEYWORDS: [string, RegExp][] = [
  ["nearFall", /\bnear[- ]?falls?\b|\balmost fell\b|\bnearly fell\b|\bnear-miss/i],
  ["fall", /\bfalls?\b|\bfell\b/i],
  ["dizziness", /\bdizz\w*|\blight-?headed\w*|\bwoozy\b|\bunsteady\b|\bvertigo\b/i],
  ["drowsiness", /\bdrows\w*|\bsleepy\b|\bgroggy\b|\bsedat\w*/i],
  ["confusion", /\bconfus\w*|\bfogg?y\b|\bfog\b|\bmuddled\b|\bmemory\b/i],
  ["swelling", /\bswell\w*|\bswollen\b|\bo?edema\b|\bpuffy\b/i],
  ["energy", /\benergy\b|\bfatigue\w*|\btired\w*/i],
  ["sleep", /\bsleep(?:ing)? (?:rating|quality|score)|\bsleep was\b|\bslept\b|\bsleep\b(?! aid| ?pill)/i],
  ["appetite", /\bappetite\b|\beating\b/i],
];

/** Metric keywords present in a span of text ("near-falls" does not also count as "falls"). */
export function metricsIn(text: string): string[] {
  let t = text;
  const out: string[] = [];
  for (const [key, re] of METRIC_KEYWORDS) {
    if (re.test(t)) {
      out.push(key);
      if (key === "nearFall") t = t.replace(new RegExp(re.source, "gi"), " ");
    }
  }
  return out;
}

/** Split a sentence into clauses so a count stays attached to the symptom it describes. */
function clauses(text: string): { text: string; start: number }[] {
  // Splits on punctuation and coordinating words; good enough for code-rendered evidence and short
  // AI sentences, and errs towards smaller clauses (which only ever makes the check stricter).
  const out: { text: string; start: number }[] = [];
  const re = /[,;:]|\band\b|\bwhile\b|\bwhereas\b|\bcompared\b|\bversus\b|\bvs\.?/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push({ text: text.slice(last, m.index), start: last });
    last = (m.index ?? 0) + m[0].length;
  }
  out.push({ text: text.slice(last), start: last });
  return out;
}

const PAIR_RE =
  /\b(\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:of(?:\s+the)?|out of|\/)\s*(\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi;

/** The before/after side named in a clause fragment (nearest occurrence). */
function sideIn(fragment: string, nearestFromEnd = false): "before" | "after" | null {
  const hits = [...fragment.matchAll(/\b(before|prior|earlier|after|since|following|afterwards)\b/gi)];
  const m = nearestFromEnd ? hits[hits.length - 1] : hits[0];
  if (!m) return null;
  return /before|prior|earlier/i.test(m[1]) ? "before" : "after";
}

/** Pull every number-like claim out of a text. Dates are removed first so "Sep 24" is not "24". */
export function extractNumericFacts(input: string): NumericFacts {
  let text = foldText(input);
  const facts: NumericFacts = { numbers: [], percents: [], pairs: [], dates: [], weekdays: [], quantifiers: [] };
  const mmdd = (m: number, d: number) => `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const blank = (s: string) => " ".repeat(s.length);

  text = text.replace(DATE_ISO_RE, (all, y: string, m: string, d: string) => {
    facts.dates.push(mmdd(Number(m), Number(d)));
    facts.numbers.push(Number(y));
    return blank(all);
  });
  text = text.replace(DATE_SLASH_RE, (all, m: string, d: string, y: string) => {
    facts.dates.push(mmdd(Number(m), Number(d)));
    facts.numbers.push(y.length === 2 ? 2000 + Number(y) : Number(y));
    return blank(all);
  });
  const monthDay = (all: string, monthText: string, day: string, year?: string) => {
    // "may" is only a month when capitalised ("May 5"), never the modal verb ("may 5 …" is rare anyway).
    if (/^may$/i.test(monthText) && monthText !== "May") return all;
    const month = MONTHS[monthText.toLowerCase().replace(/\.$/, "")];
    const dd = Number(day);
    if (!month || dd < 1 || dd > 31) return all;
    facts.dates.push(mmdd(month, dd));
    if (year) facts.numbers.push(Number(year));
    return blank(all);
  };
  text = text.replace(DATE_MD_RE, (all, mo: string, d: string, y?: string) => monthDay(all, mo, d, y));
  text = text.replace(DATE_DM_RE, (all, d: string, mo: string, y?: string) => monthDay(all, mo, d, y));
  for (const m of text.matchAll(WEEKDAY_RE)) facts.weekdays.push(m[1].toLowerCase());
  for (const m of text.matchAll(QUANTIFIER_RE)) facts.quantifiers.push(m[0].toLowerCase());

  // Pairs ("8 of 14 answered days after …") with the side and the symptom they belong to, both
  // read from the pair's own clause so "…8 of 14 days, up from 2 of 13 before" keeps each side apart.
  for (const sentence of splitSentences(text)) {
    const sentenceMetrics = metricsIn(sentence);
    for (const c of clauses(sentence)) {
      for (const m of c.text.matchAll(PAIR_RE)) {
        const a = toNumber(m[1]);
        const b = toNumber(m[2]);
        if (a === null || b === null) continue;
        const at = m.index ?? 0;
        const side = sideIn(c.text.slice(at + m[0].length)) ?? sideIn(c.text.slice(0, at), true);
        facts.pairs.push({ a, b, side, metrics: metricsIn(c.text), sentenceMetrics });
      }
    }
  }

  // Percents.
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/gi, (all, n: string) => {
    facts.percents.push(Number(n));
    facts.numbers.push(Number(n));
    return blank(all);
  });
  // Digits (ordinals like "24th" included; thousands separators folded).
  for (const m of text.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|\.\d+)(?:st|nd|rd|th)?(?![\w])/g)) {
    const n = toNumber(m[1]);
    if (n !== null) facts.numbers.push(n);
  }
  // Number words.
  for (const m of text.matchAll(NUMBER_WORD_RE)) {
    const word = m[0].toLowerCase();
    if (word === "one" && !ONE_COUNTED.test(text.slice((m.index ?? 0) + m[0].length))) continue;
    const n = toNumber(word);
    if (n !== null) facts.numbers.push(n);
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Medication names

/**
 * Built-in detection vocabulary: common generic and brand names in older-adult prescribing plus OTC
 * products. It only *detects* drug names; a detected name is accepted when it is on the person's list
 * or appears in the evidence. Callers add the full KB vocabulary via `knownDrugNames`.
 */
const BUILTIN_DRUGS = `acetaminophen paracetamol ibuprofen naproxen aspirin diclofenac celecoxib meloxicam indomethacin
ketorolac tramadol oxycodone hydrocodone morphine codeine fentanyl hydromorphone methadone buprenorphine tapentadol
gabapentin pregabalin duloxetine amitriptyline nortriptyline doxepin imipramine trazodone mirtazapine sertraline
citalopram escitalopram fluoxetine paroxetine venlafaxine bupropion lorazepam alprazolam diazepam clonazepam
temazepam triazolam chlordiazepoxide zolpidem eszopiclone zaleplon diphenhydramine doxylamine hydroxyzine
chlorpheniramine meclizine promethazine cetirizine loratadine fexofenadine melatonin quetiapine olanzapine
risperidone haloperidol aripiprazole donepezil memantine rivastigmine galantamine oxybutynin tolterodine solifenacin
trospium darifenacin fesoterodine mirabegron tamsulosin finasteride doxazosin terazosin prazosin amlodipine
nifedipine diltiazem verapamil lisinopril enalapril ramipril benazepril losartan valsartan irbesartan olmesartan
metoprolol atenolol carvedilol propranolol bisoprolol hydrochlorothiazide chlorthalidone furosemide bumetanide
torsemide spironolactone clonidine hydralazine isosorbide nitroglycerin digoxin amiodarone warfarin apixaban
rivaroxaban dabigatran edoxaban clopidogrel prasugrel ticagrelor heparin enoxaparin atorvastatin simvastatin
rosuvastatin pravastatin lovastatin ezetimibe metformin glipizide glyburide glimepiride insulin sitagliptin
linagliptin empagliflozin dapagliflozin canagliflozin semaglutide liraglutide dulaglutide pioglitazone
levothyroxine omeprazole esomeprazole pantoprazole lansoprazole rabeprazole famotidine ranitidine cimetidine
metoclopramide ondansetron prochlorperazine loperamide docusate senna bisacodyl dicyclomine hyoscyamine
scopolamine prednisone prednisolone methylprednisolone dexamethasone allopurinol colchicine alendronate
risedronate levetiracetam phenytoin carbamazepine valproate lamotrigine topiramate baclofen cyclobenzaprine
methocarbamol carisoprodol tizanidine ropinirole pramipexole carbidopa levodopa benztropine trihexyphenidyl
nitrofurantoin ciprofloxacin levofloxacin amoxicillin azithromycin doxycycline sulfamethoxazole trimethoprim
cephalexin sildenafil tadalafil montelukast albuterol tiotropium fluticasone budesonide guaifenesin
dextromethorphan pseudoephedrine phenylephrine
ativan xanax valium klonopin restoril ambien lunesta benadryl unisom tylenol advil motrin aleve zzzquil nyquil
excedrin lasix bumex norvasc procardia cardizem zestril prinivil cozaar diovan lopressor toprol coreg tenormin
microzide aldactone lipitor zocor crestor pravachol glucophage januvia jardiance farxiga ozempic trulicity
synthroid prilosec nexium protonix prevacid pepcid zantac reglan zofran ditropan detrol vesicare myrbetriq
flomax proscar eliquis xarelto coumadin plavix lexapro zoloft prozac paxil celexa cymbalta effexor wellbutrin
desyrel remeron elavil seroquel zyprexa risperdal haldol aricept namenda neurontin lyrica ultram flexeril
robaxin requip mirapex sinemet vistaril atarax antivert phenergan zyrtec claritin allegra singulair medrol
zyloprim fosamax keppra dilantin tegretol depakote lamictal topamax zanaflex cipro levaquin macrobid bactrim
sudafed mucinex robitussin imodium colace senokot dulcolax miralax lomotil bentyl levsin`
  .split(/\s+/)
  .filter(Boolean);

const BUILTIN_DRUG_SET = new Set(BUILTIN_DRUGS);

/** Drug-like suffixes (needs ≥3 letters before the suffix) catch generics missing from the vocabulary. */
const DRUG_SUFFIX_RE =
  /\b[a-z]{3,}(?:azepam|azolam|zolam|dipine|olol|pril|sartan|statin|prazole|tidine|floxacin|cycline|cillin|mycin|semide|thiazide|gliptin|gliflozin|glutide|triptan|setron|profen|coxib|codone|morphone|oxetine|triptyline|ipramine|lukast|dronate|parin|xaban|gatran|butynin|fenacin|terodine|olone|asone|sonide|tadine|azosin|ulosin|piprazole|apine|idone|zodone|pidem|iclone)\b/gi;

function nameTokens(name: string): string[] {
  const lower = foldText(name).toLowerCase();
  const out = new Set<string>();
  // Whole name, name without parentheticals, each parenthetical, and each word ≥4 letters.
  out.add(lower.trim());
  out.add(lower.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim());
  for (const m of lower.matchAll(/\(([^)]*)\)/g)) out.add(m[1].trim());
  for (const part of lower.split(/[^a-z0-9-]+/)) if (part.length >= 4) out.add(part);
  out.delete("");
  return [...out];
}

/** Drug names detected in a text (lowercase, de-duplicated). */
export function detectDrugNames(text: string, extraVocabulary: string[] = []): string[] {
  const lower = foldText(text).toLowerCase();
  const found = new Set<string>();
  const vocab = extraVocabulary.length ? new Set([...BUILTIN_DRUG_SET, ...extraVocabulary.map((v) => v.toLowerCase())]) : BUILTIN_DRUG_SET;
  // Multi-word vocabulary entries first ("tylenol pm"), then single words.
  for (const v of vocab) {
    if (!v.includes(" ")) continue;
    if (new RegExp(`\\b${escapeRegExp(v)}\\b`).test(lower)) found.add(v);
  }
  for (const w of lower.match(/[a-z][a-z-]*[a-z]/g) ?? []) {
    const singular = w.endsWith("s") && vocab.has(w.slice(0, -1)) ? w.slice(0, -1) : w;
    if (vocab.has(singular)) found.add(singular);
  }
  for (const m of lower.matchAll(DRUG_SUFFIX_RE)) found.add(m[0]);
  return [...found];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Core check

/**
 * Check one piece of AI text against the texts it claims to restate. Returns an empty array when the
 * text is acceptable. `support` is the text of the cited evidence (or KB text for explanations);
 * `context` is everything the model was shown (used only to accept medicine names).
 */
export function verifyClaims(
  text: string,
  support: string[] | EvidenceItem[],
  opts: VerifyOptions & { context?: string[] } = {},
): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const raw = text ?? "";
  const t = foldText(raw);
  const supportTexts = (support as (string | EvidenceItem)[]).map((s) => foldText(typeof s === "string" ? s : s.text));
  const supportJoined = supportTexts.join(" \n ");
  const maxLength = opts.maxLength ?? 280;

  if (!t) return [{ code: "empty", detail: "the sentence is empty" }];
  if (t.length > maxLength) issues.push({ code: "too_long", detail: `${t.length} characters (limit ${maxLength})` });
  if (t.split(" ").length < 3 || t.length < 12) issues.push({ code: "too_short", detail: "fewer than 3 words" });

  // Hygiene.
  for (const u of UNSAFE_CONTENT) if (u.pattern.test(raw) || u.pattern.test(t)) issues.push({ code: "unsafe_content", detail: u.reason });
  if (ID_ECHO.test(t)) issues.push({ code: "id_echo", detail: "evidence ids belong in evidenceIds, not in the sentence" });

  // Language rules, sentence by sentence (a question may follow a banned statement).
  const patientNames = (opts.patientNames ?? []).filter((n) => n.trim().length > 1);
  const patientRe = patientNames.length
    ? new RegExp(`${PATIENT_REF.source}|\\b(?:${patientNames.map(escapeRegExp).join("|")})\\b`, "i")
    : PATIENT_REF;
  const sentences = splitSentences(t);
  const expect = opts.expect ?? "any";
  for (const sentence of sentences) {
    const shape = sentenceShape(sentence);
    const asStatement = expect === "statement" || shape.form === "statement";
    const statementPart = asStatement ? sentence : shape.preamble;
    const questionPart = asStatement ? "" : shape.clause;
    const mentionsPatient = patientRe.test(sentence);
    for (const b of BANNED_PATTERNS) {
      if (b.patientScoped && !mentionsPatient) continue;
      const scope = b.allowInQuestion && !shape.presupposing ? statementPart : `${statementPart} ${questionPart}`;
      const m = b.pattern.exec(scope);
      if (m) issues.push({ code: "banned", detail: `${b.category}: ${b.reason} ("${m[0].trim()}")` });
    }
    // Medicine-linked causal phrasing with a named drug ("dizzy from the lorazepam", "due to Ativan").
    const drugsHere = detectDrugNames(statementPart, opts.knownDrugNames);
    for (const d of drugsHere) {
      const re = new RegExp(
        `\\b(?:because of|due to|related to|linked to|attributable to|attributed to|explained by|from|on account of|reaction to)\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+|this\\s+|that\\s+)?(?:new\\s+)?${escapeRegExp(d)}`,
        "i",
      );
      const m = re.exec(statementPart);
      if (m) issues.push({ code: "banned", detail: `causal: links a symptom to ${d} as a statement ("${m[0]}")` });
    }
  }

  // Sentence form required by the slot.
  if (expect === "question") {
    const last = sentences[sentences.length - 1] ?? "";
    if (sentenceShape(last).form !== "question") issues.push({ code: "form", detail: "expected a question for the clinician" });
  } else if (expect === "statement") {
    if (sentences.some((s) => sentenceShape(s).form === "question" || /\?\s*$/.test(s))) {
      issues.push({ code: "form", detail: "expected a statement, not a question" });
    }
  }

  // Numbers.
  const claim = extractNumericFacts(t);
  const have = extractNumericFacts(supportJoined);
  const haveNumbers = new Set(have.numbers);
  // Years name sources and periods ("AGS Beers Criteria 2023"); any year shown to the model may be used.
  const knownYears = new Set([...(opts.knownYears ?? []), ...extractNumericFacts((opts.context ?? []).join(" \n ")).numbers.filter((n) => n >= 1900 && n <= 2100)]);
  for (const n of new Set(claim.numbers)) {
    if (haveNumbers.has(n)) continue;
    if (n >= 1900 && n <= 2100 && knownYears.has(n)) continue;
    issues.push({ code: "number_unsupported", detail: `${n} does not appear in the cited evidence` });
  }
  for (const p of claim.percents) {
    if (!have.percents.includes(p) && !haveNumbers.has(p)) {
      issues.push({ code: "number_unsupported", detail: `${p}% does not appear in the cited evidence` });
    }
  }
  for (const pair of claim.pairs) {
    const matches = have.pairs.filter((h) => h.a === pair.a && h.b === pair.b);
    if (!matches.length) {
      issues.push({ code: "pair_unsupported", detail: `"${pair.a} of ${pair.b}" does not appear as a pair in the cited evidence` });
      continue;
    }
    if (pair.side && matches.every((h) => h.side && h.side !== pair.side)) {
      issues.push({ code: "pair_context", detail: `"${pair.a} of ${pair.b}" is described as ${pair.side}, but the evidence has it ${pair.side === "after" ? "before" : "after"}` });
    }
    if (pair.metrics.length) {
      const evidenceMetrics = new Set<string>();
      for (const h of matches) (h.metrics.length ? h.metrics : h.sentenceMetrics).forEach((m) => evidenceMetrics.add(m));
      const wrong = pair.metrics.filter((m) => !evidenceMetrics.has(m));
      if (evidenceMetrics.size && wrong.length) {
        issues.push({ code: "pair_context", detail: `"${pair.a} of ${pair.b}" is attached to ${wrong.join(", ")}, but the evidence count is for ${[...evidenceMetrics].join(", ")}` });
      }
    }
  }
  for (const d of new Set(claim.dates)) {
    if (!have.dates.includes(d)) issues.push({ code: "date_unsupported", detail: `date ${d} does not appear in the cited evidence` });
  }
  for (const w of new Set(claim.weekdays)) {
    if (!have.weekdays.includes(w)) issues.push({ code: "date_unsupported", detail: `"${w}" does not appear in the cited evidence` });
  }
  const supportLower = supportJoined.toLowerCase();
  for (const q of new Set(claim.quantifiers)) {
    if (!supportLower.includes(q)) issues.push({ code: "quantifier_unsupported", detail: `"${q}" is not stated in the cited evidence` });
  }

  // Medicine names: detected names must be on the list or in what the model was shown.
  const allowed = new Set<string>();
  for (const n of opts.medNames ?? []) nameTokens(n).forEach((x) => allowed.add(x));
  const contextTexts = [...supportTexts, ...(opts.context ?? []).map(foldText)];
  for (const ctx of contextTexts) detectDrugNames(ctx, opts.knownDrugNames).forEach((x) => allowed.add(x));
  const contextLower = contextTexts.join(" \n ").toLowerCase();
  for (const d of detectDrugNames(t, opts.knownDrugNames)) {
    const ok = allowed.has(d) || nameTokens(d).every((x) => allowed.has(x)) || new RegExp(`\\b${escapeRegExp(d)}\\b`).test(contextLower);
    if (!ok) issues.push({ code: "med_unknown", detail: `"${d}" is not on the medication list or in the evidence` });
  }

  // Drug bindings in parentheses ("diphenhydramine (in Tylenol PM)", "Tylenol PM (acetaminophen +
  // diphenhydramine)") are factual claims about which medicine contains or is which: the same pairing
  // must exist in a parenthetical in the evidence, in either direction.
  const evidenceBindings = parentheticalBindings(contextTexts.join(" \n "), opts.knownDrugNames);
  for (const b of parentheticalBindings(t, opts.knownDrugNames)) {
    const ok = evidenceBindings.some((e) => (e.head === b.head && e.inner === b.inner) || (e.head === b.inner && e.inner === b.head));
    if (!ok) issues.push({ code: "binding_unsupported", detail: `"${b.head} (${b.inner})" is not how the evidence describes these medicines` });
  }

  // Quoted words must exist in the cited evidence (no invented quotes).
  for (const m of t.matchAll(/"([^"]{8,})"/g)) {
    const quote = m[1].toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const hay = supportLower.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ");
    if (quote && !hay.includes(quote)) issues.push({ code: "quote_unsupported", detail: `quoted words "${m[1]}" are not in the cited evidence` });
  }

  return dedupeIssues(issues);
}

/** Pairs of drug names joined by a parenthetical: "<head drug …> (<… inner drug …>)". */
function parentheticalBindings(text: string, vocab?: string[]): { head: string; inner: string }[] {
  const out: { head: string; inner: string }[] = [];
  const t = foldText(text).toLowerCase();
  // The head may be followed by one other parenthetical first: "Tylenol PM (OTC) (acetaminophen + …)".
  for (const m of t.matchAll(/([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})(?:\s*\([^()]*\))?\s*\(([^()]{2,120})\)/g)) {
    const heads = detectDrugNames(m[1], vocab);
    const inners = detectDrugNames(m[2], vocab);
    for (const head of heads) for (const inner of inners) if (head !== inner) out.push({ head, inner });
  }
  return out;
}

function dedupeIssues(issues: VerifyIssue[]): VerifyIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.code}|${i.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Render issues as stable "code: detail" strings (the SPEC §10 shape). */
export function formatIssues(issues: VerifyIssue[]): string[] {
  return issues.map((i) => `${i.code}: ${i.detail}`);
}

/**
 * Verify one AI sentence against the evidence package (SPEC §10). Cited ids must exist; numbers, dates
 * and medicine names must be supported by the cited items; banned language is rejected.
 */
export function verifySentence(
  s: BriefSentence,
  pkg: EvidencePackage,
  opts: VerifyOptions = {},
): { ok: boolean; issues: string[] } {
  const issues: VerifyIssue[] = [];
  const byId = new Map(pkg.items.map((i) => [i.id, i]));
  const ids = [...new Set(s.evidenceIds ?? [])];
  const requireEvidence = opts.requireEvidence ?? true;
  const maxIds = opts.maxEvidenceIds ?? 6;
  if (requireEvidence && ids.length === 0) issues.push({ code: "no_evidence", detail: "the sentence cites no evidence" });
  if (ids.length > maxIds) issues.push({ code: "too_many_evidence", detail: `${ids.length} evidence ids (limit ${maxIds})` });
  const unknown = ids.filter((id) => !byId.has(id));
  for (const id of unknown) issues.push({ code: "unknown_evidence", detail: `${id} is not in the evidence package` });
  const cited = ids.map((id) => byId.get(id)).filter((x): x is EvidenceItem => Boolean(x));
  const years = [pkg.from, pkg.to].map((d) => Number(d.slice(0, 4))).filter((y) => Number.isFinite(y));
  issues.push(
    ...verifyClaims(s.text, cited, {
      ...opts,
      knownYears: [...(opts.knownYears ?? []), ...years],
      context: pkg.items.map((i) => i.text),
    }),
  );
  const all = dedupeIssues(issues);
  return { ok: all.length === 0, issues: formatIssues(all) };
}
