// Segmentation: tokens, sentences and clause boundaries with exact UTF-16 offsets.
//
// Works on the normalised view text (see normalize.ts) but every function is offset-preserving, so
// it can equally be called on raw text. Handles the way people actually type diary notes: missing
// punctuation, emoji used as separators, "Dizzy? No." form-style answers, ellipses, run-on sentences
// joined with "and"/"but", and abbreviations such as "Dr." or "a.m.".

export type TokenKind = "word" | "number" | "punct" | "emoji";

export interface Token {
  /** Token text as it appears in the input string. */
  text: string;
  /** Lower-case form (apostrophe-normalised) used for comparisons. */
  norm: string;
  start: number;
  end: number;
  kind: TokenKind;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

// Words keep internal apostrophes ("didn't") and "-in-law" compounds ("brother-in-law's") so that
// person nouns stay one token for the experiencer rules.
const TOKEN_RE =
  /in-laws?(?![A-Za-z])|[A-Za-zÀ-ɏ]+(?:-in-laws?)?(?:['’][A-Za-zÀ-ɏ]+)*|\d+(?:[.,]\d+)?|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*|[^\s]/gu;

/** Tokenise into words, numbers, emoji and single punctuation characters, keeping offsets. */
export function tokenize(text: string, from = 0, to = text.length): Token[] {
  const out: Token[] = [];
  TOKEN_RE.lastIndex = from;
  for (let m = TOKEN_RE.exec(text); m && m.index < to; m = TOKEN_RE.exec(text)) {
    const t = m[0];
    const first = t.codePointAt(0) ?? 0;
    let kind: TokenKind = "punct";
    if (/^[A-Za-zÀ-ɏ]/.test(t)) kind = "word";
    else if (/^\d/.test(t)) kind = "number";
    else if (/\p{Extended_Pictographic}/u.test(String.fromCodePoint(first))) kind = "emoji";
    out.push({ text: t, norm: t.toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + t.length, kind });
  }
  return out;
}

/** Abbreviations whose trailing "." does not end a sentence. */
const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "st", "vs", "etc", "approx", "jr", "sr", "prof", "no", "e.g", "i.e", "a.m", "p.m", "am", "pm",
  "mt", "ft", "inc", "dept", "tab", "tabs", "caps", "wk", "hr", "hrs", "min", "mins",
]);

/** Short answers that, after a "?", belong to the same sentence ("Dizzy? No."). */
const ANSWER_MAX_WORDS = 3;
const QUESTION_MAX_WORDS = 3;

function wordsIn(s: string): number {
  const m = s.match(/[A-Za-zÀ-ɏ']+/g);
  return m ? m.length : 0;
}

function trimSegment(text: string, start: number, end: number): Segment | null {
  while (start < end && /[\s"'()\-,;:]/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end <= start || !/[A-Za-z0-9À-ɏ]/.test(text.slice(start, end))) return null;
  return { start, end, text: text.slice(start, end) };
}

/**
 * Split text into sentences. Boundaries: . ! ? (runs), newlines, ellipses, and emoji followed by
 * more text. Not boundaries: decimals (0.5), abbreviations (Dr.), and form-style question/answer
 * pairs ("Falls? None." stays one sentence so the answer can negate the question word).
 */
export function splitSentences(text: string): Segment[] {
  const cuts: number[] = [];
  const re = /[.!?]+|\n+|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
  let lastCut = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const tok = m[0];
    const at = m.index;
    const after = at + tok.length;
    const next = text.slice(after, after + 2);
    if (tok[0] === "\n") {
      cuts.push(after);
      lastCut = after;
      continue;
    }
    if (/\p{Extended_Pictographic}/u.test(tok)) {
      // Emoji as a separator only when followed by more words.
      if (/^\s*[A-Za-z0-9]/.test(text.slice(after, after + 3))) {
        cuts.push(after);
        lastCut = after;
      }
      continue;
    }
    if (tok === ".") {
      const before = text.slice(Math.max(0, at - 8), at);
      const prevWord = (before.match(/([A-Za-z.]+)$/)?.[1] ?? "").toLowerCase();
      if (/\d$/.test(before) && /^\d/.test(next)) continue; // decimal 0.5
      if (ABBREVIATIONS.has(prevWord) || ABBREVIATIONS.has(prevWord.replace(/\.$/, ""))) {
        if (!(prevWord === "no" && !/^\s*\d/.test(next))) continue;
      }
      if (/(^|[^A-Za-z])[A-Za-z]$/.test(before) && /^[A-Za-z]\./.test(text.slice(after, after + 2))) continue; // a.m.
      if (/^[A-Za-z]/.test(next) && /[a-z]$/.test(before) && !/^[A-Z]/.test(next)) continue; // "e.g" style lower.lower
    }
    if (tok.includes("?")) {
      // Form-style "Question? Answer." pairs stay together.
      const q = text.slice(lastCut, at);
      const rest = text.slice(after);
      const ans = rest.match(/^\s*([^.!?\n]*)([.!]|\n|$)/);
      if (ans && wordsIn(q) <= QUESTION_MAX_WORDS && wordsIn(ans[1]) >= 1 && wordsIn(ans[1]) <= ANSWER_MAX_WORDS && !/\?/.test(ans[1])) {
        continue;
      }
    }
    if (after >= text.length || /^[\s"')\]]/.test(next) || /^[A-Z]/.test(next) || /\p{Extended_Pictographic}/u.test(next)) {
      cuts.push(after);
      lastCut = after;
    }
  }
  const out: Segment[] = [];
  let start = 0;
  for (const c of [...cuts, text.length]) {
    const seg = trimSegment(text, start, c);
    if (seg) out.push(seg);
    start = c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Clause boundaries

export type BoundaryKind = "termination" | "conjunct";

export interface Boundary {
  start: number;
  end: number;
  kind: BoundaryKind;
  word: string;
}

/**
 * Termination terms (Harkema et al. 2009, "But"/"Which"/etc. groups) — end the scope of
 * negation, hypothetical and historical triggers.
 */
const TERMINATION_RE =
  /(?<![a-z0-9'])(?:but|however|although|though|except(?: for| that)?|apart from|aside from|other than|whereas|yet|which|who|whose|because|as a result|otherwise|still|nevertheless|instead)(?![a-z0-9'])|;|(?<=\s)-+(?=\s)|\(|\)/g;

/** Words that start a new predicate/subject after "and", "," etc. */
export const SUBJECT_STARTERS = new Set([
  "i", "i'm", "i've", "i'd", "i'll", "me", "my", "we", "we're", "we've", "our", "she", "she's", "she'd", "he", "he's", "he'd",
  "they", "they're", "it", "it's", "there", "there's", "mom", "mum", "dad", "everything", "everyone", "this", "that",
  "the", "a", "an", "some", "her", "his", "their", "your", "you",
]);

/** Finite verbs / predicate starters commonly following an elided subject in diary text. */
export const FINITE_VERBS = new Set([
  "felt", "feel", "feels", "feeling", "was", "were", "is", "am", "are", "had", "has", "have", "got", "get", "gets",
  "slept", "sleep", "ate", "eat", "went", "go", "kept", "keep", "took", "take", "woke", "needed", "spent", "managed",
  "made", "did", "could", "couldn't", "can", "can't", "tried", "walked", "started", "seemed", "seems", "looked", "looks",
  "ended", "nearly", "almost", "fell", "stumbled", "tripped", "slipped", "lost", "caught", "grabbed", "still", "then",
  "also", "just", "only", "mostly", "mainly", "more", "rather", "instead", "think", "thought", "noticed", "found",
  "came", "sat", "stayed", "headed", "spent", "enjoyed", "used", "having", "been", "became", "become", "must",
]);

/** Quantifiers / determiners / intensifiers that open a new noun phrase with its own polarity. */
const NEW_NP_STARTERS = new Set([
  "a", "an", "some", "lots", "plenty", "bit", "little", "quite", "very", "really", "so", "pretty", "slight", "slightly",
  "mild", "terrible", "awful", "bad", "severe", "constant", "my", "her", "his", "the", "lot", "loads", "much",
]);

/** Time expressions that open a new clause. */
const TIME_STARTERS = new Set([
  "today", "tonight", "yesterday", "later", "earlier", "afterwards", "after", "then", "now", "this", "last", "by",
  "overnight", "lunchtime", "morning", "evening", "afternoon",
]);

const CONJUNCTIONS = new Set(["and", "&", "so", "then", "plus", "but", "also"]);

/**
 * Compute clause boundaries inside [from, to) of `text` (normally one sentence).
 * - termination: but / however / although / though / except / apart from / which / ; / " - " …
 * - conjunct: "," or "and"/"so"/"then"/"plus" followed by a new subject, a finite verb, a new
 *   quantified noun phrase ("a bit of", "some") or a time expression — i.e. a new clause or a new
 *   conjunct with its own polarity. A bare noun after a comma ("no dizziness, nausea or headache")
 *   is NOT a boundary, so list negation still distributes.
 * - a comma chunk that ends with "though"/"however"/"anyway" is contrastive: boundary at its comma.
 */
export function findBoundaries(text: string, from: number, to: number, tokens?: Token[]): Boundary[] {
  const out: Boundary[] = [];
  const slice = text.slice(from, to);
  TERMINATION_RE.lastIndex = 0;
  for (let m = TERMINATION_RE.exec(slice); m; m = TERMINATION_RE.exec(slice)) {
    out.push({ start: from + m.index, end: from + m.index + m[0].length, kind: "termination", word: m[0] });
  }
  const toks = (tokens ?? tokenize(text, from, to)).filter((t) => t.start >= from && t.end <= to);
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    const isComma = t.norm === ",";
    const isConj = CONJUNCTIONS.has(t.norm);
    if (!isComma && !isConj) continue;
    let j = i + 1;
    // ", and I…" / ", then…" — look past a conjunction that follows a comma.
    if (isComma && j < toks.length && CONJUNCTIONS.has(toks[j].norm)) j++;
    const nxt = toks[j];
    if (!nxt) continue;
    const w = nxt.norm;
    const opensClause = SUBJECT_STARTERS.has(w) || FINITE_VERBS.has(w) || NEW_NP_STARTERS.has(w) || TIME_STARTERS.has(w);
    if (opensClause && !(isConj && t.norm === "but")) {
      out.push({ start: t.start, end: t.end, kind: "conjunct", word: t.norm });
    }
  }
  // Contrastive "though" at the end of a comma chunk: "Not dizzy, tired though."
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].norm !== ",") continue;
    let k = i + 1;
    while (k < toks.length && toks[k].norm !== "," && toks[k].norm !== ".") k++;
    const lastWord = toks[k - 1]?.norm;
    if (k - 1 > i && (lastWord === "though" || lastWord === "however" || lastWord === "anyway" || lastWord === "tho")) {
      out.push({ start: toks[i].start, end: toks[i].end, kind: "conjunct", word: "," });
    }
  }
  // Dedupe + sort.
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out.filter((b, i) => i === 0 || b.start !== out[i - 1].start);
}
