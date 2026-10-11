// Text normalisation layer for the on-device clinical NLP engine.
//
// Every later stage (segmentation, concept lexicon, ConText triggers, ratings) works on a *view* of the
// story: lower-cased, typographic characters folded to ASCII ("’" → "'", "—" → "-"), and common
// misspellings corrected ("dizy" → "dizzy", "confussed" → "confused"). Corrections can change length,
// so the view keeps a character map back to the ORIGINAL story; every span we output is mapped back,
// which is what guarantees `story.slice(start, end) === quote` for the UI and the tests.
//
// Pure module: no DOM, no Date.

export interface TextView {
  /** The story exactly as typed. */
  readonly original: string;
  /** Normalised, lower-cased, spelling-corrected text that all matchers run on. */
  readonly text: string;
  /** Same as `text` but with the original letter case (for proper-name detection). */
  readonly cased: string;
  /** Spelling corrections applied, in original coordinates. */
  readonly corrections: ReadonlyArray<{ start: number; end: number; from: string; to: string }>;
  /** Map a [start, end) range in view coordinates back to original coordinates. */
  toOriginal(start: number, end: number): { start: number; end: number };
  /** Map an original offset to the corresponding view offset (start of the char/token). */
  toView(pos: number): number;
}

/** Single-code-unit replacements that keep string length unchanged. */
const CHAR_FOLD: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "ʼ": "'", "`": "'",
  "“": '"', "”": '"', "„": '"', "″": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", "\t": " ",
  "…": ".", // ellipsis character behaves like a full stop for segmentation
};

/**
 * Fold typographic characters and lower-case WITHOUT changing the string length (UTF-16 units).
 * Characters whose lower-case form has a different length (e.g. "İ") are kept as-is.
 */
export function foldChars(text: string, lower: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const folded = CHAR_FOLD[ch] ?? ch;
    if (!lower) {
      out += folded;
      continue;
    }
    const l = folded.toLowerCase();
    out += l.length === 1 ? l : folded;
  }
  return out;
}

/**
 * Explicit misspelling / shorthand dictionary (lower-case token → replacement).
 * Kept small and high-precision; the fuzzy matcher below handles the long tail.
 */
export const SPELLING_FIXES: Readonly<Record<string, string>> = {
  // dizziness family (too short for safe fuzzy matching)
  dizy: "dizzy", dizzey: "dizzy", dizzie: "dizzy", dizzi: "dizzy", dizzzy: "dizzy", dzzy: "dizzy", diizy: "dizzy",
  dizzyness: "dizziness", diziness: "dizziness", dizzines: "dizziness", dizzyspells: "dizzy spells",
  woozey: "woozy", whoozy: "woozy", woozie: "woozy", wozy: "woozy",
  lightheded: "lightheaded", lighthead: "lightheaded", liteheaded: "lightheaded",
  // near-fall words (too short / too close to real words for fuzzy matching: "nearby")
  neerly: "nearly", nearley: "nearly", nearlly: "nearly", nealy: "nearly", allmost: "almost", almsot: "almost",
  amost: "almost", alomst: "almost", almst: "almost", tripd: "tripped", triped: "tripped", stumbeled: "stumbled",
  stumbld: "stumbled", ballance: "balance", balence: "balance",
  // energy / sleep
  tierd: "tired", tird: "tired", exausted: "exhausted", exhausated: "exhausted", exhuasted: "exhausted",
  knackerd: "knackered", slep: "slept", sleept: "slept", terible: "terrible", teribly: "terribly", terrable: "terrible",
  awfull: "awful", awfuly: "awfully", horible: "horrible", horibly: "horribly",
  // other symptoms
  drowzy: "drowsy", drousy: "drowsy", drowsey: "drowsy", sleepey: "sleepy", grogy: "groggy",
  confussed: "confused", confuzed: "confused", confued: "confused", confuesd: "confused", consfused: "confused",
  swolen: "swollen", swollon: "swollen", sollen: "swollen", sweling: "swelling", swellin: "swelling",
  ankels: "ankles", ancles: "ankles", ankel: "ankle",
  nausious: "nauseous", nauseus: "nauseous", nausous: "nauseous", nauseas: "nausea", nausia: "nausea",
  headake: "headache", headach: "headache", hedache: "headache", headaik: "headache",
  constapated: "constipated", constipted: "constipated", diarea: "diarrhea", diarrea: "diarrhea", diahrea: "diarrhea",
  diarhea: "diarrhea", diarrhoea: "diarrhoea", breathles: "breathless", anxios: "anxious", anxiuos: "anxious",
  // function words and intensifiers
  realy: "really", relly: "really", rly: "really", verry: "very", vey: "very", abit: "a bit", alittle: "a little",
  alot: "a lot", tho: "though", thru: "through", cuz: "because", coz: "because", becuase: "because", becasue: "because",
  // contractions typed without apostrophes
  didnt: "didn't", wasnt: "wasn't", dont: "don't", doesnt: "doesn't", couldnt: "couldn't", cant: "can't",
  isnt: "isn't", arent: "aren't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", wouldnt: "wouldn't",
  shouldnt: "shouldn't", werent: "weren't", im: "i'm", ive: "i've", thats: "that's", whats: "what's",
  theres: "there's", shes: "she's", hes: "he's", wont: "won't",
};

/**
 * Words the fuzzy matcher may correct *towards* (distinctive symptom vocabulary, ≥ 6 letters).
 * Short or ambiguous words (dizzy, tired, faint, puffy, trip...) are handled by SPELLING_FIXES only.
 */
export const FUZZY_TARGETS: readonly string[] = [
  "dizziness", "lightheaded", "lightheadedness", "confused", "confusion", "disoriented", "forgetful", "muddled",
  "drowsy", "drowsiness", "groggy", "exhausted", "exhaustion", "fatigued", "sluggish", "swollen", "swelling",
  "nauseous", "nauseated", "nausea", "vomiting", "constipated", "constipation", "headache", "headaches", "coughing",
  "diarrhea", "palpitations", "breathless", "anxious", "nervous", "depressed", "trembling", "tremor", "vertigo",
  "terrible", "terribly", "horrible", "horribly", "really", "slightly", "extremely", "energy", "unsteady",
  "restless", "wobbly", "ankles", "appetite", "lethargic",
];

/**
 * Real English words that sit one edit away from a fuzzy target and must never be "corrected".
 * (Without this, "smelling" would become "swelling" and "angles" would become "ankles".)
 */
const FUZZY_BLOCKLIST = new Set<string>([
  "smelling", "spelling", "swilling", "dwelling", "angles", "angels", "rally", "realty", "reality", "shaving",
  "sightly", "trapped", "muddied", "tremors", "remote", "related", "relay",
  "drowse", "grossly", "horrid", "terrier", "terrace", "terribles", "deposed", "deposited", "debussed",
  "conflated", "confined", "confuses", "constipates", "vertical", "anxiously", "forgetting", "forgotten",
  "restful", "nauseate", "sluggard", "trembled", "tremble", "energize", "enemy",
]);

/** Damerau–Levenshtein (optimal string alignment) distance with an early cut-off. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prevPrev = new Array<number>(m + 1).fill(0);
  let prev = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prevPrev[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[m];
}

/**
 * Suggest a fuzzy correction for one lower-case word, or null.
 * Rules (chosen for precision over recall): word length ≥ 5, same first letter as the target,
 * distance 1 for targets up to 8 letters, distance 2 only for long words (target ≥ 9 and word ≥ 8).
 */
export function fuzzyCorrect(word: string, extraKnown?: ReadonlySet<string>): string | null {
  if (word.length < 5 || FUZZY_BLOCKLIST.has(word) || extraKnown?.has(word)) return null;
  if (FUZZY_TARGETS.includes(word)) return null;
  let best: string | null = null;
  let bestD = 3;
  for (const t of FUZZY_TARGETS) {
    if (t[0] !== word[0]) continue;
    const allowed = t.length >= 9 && word.length >= 8 ? 2 : 1;
    if (Math.abs(t.length - word.length) > allowed) continue;
    const d = editDistance(word, t, allowed);
    if (d <= allowed && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

const WORD_RE = /[a-z]+(?:'[a-z]+)*/g;

/**
 * Build the matching view of a story.
 * @param knownWords extra words that must not be fuzzy-corrected (e.g. medication names from the list).
 */
export function buildTextView(original: string, knownWords?: ReadonlySet<string>): TextView {
  const cased0 = foldChars(original, false);
  const lower0 = foldChars(original, true);

  type Edit = { start: number; end: number; to: string };
  const edits: Edit[] = [];
  WORD_RE.lastIndex = 0;
  for (let m = WORD_RE.exec(lower0); m; m = WORD_RE.exec(lower0)) {
    const word = m[0];
    const start = m.index;
    const end = start + word.length;
    let to: string | undefined = SPELLING_FIXES[word];
    if (to === undefined) {
      // Never "correct" capitalised words mid-sentence: they are usually names (Sofia, Lasix…).
      const capitalised = /[A-Z]/.test(cased0[start]) && start > 0 && !/[.!?\n]\s*$/.test(cased0.slice(Math.max(0, start - 3), start));
      if (!capitalised) to = fuzzyCorrect(word, knownWords) ?? undefined;
    }
    if (to !== undefined && to !== word) edits.push({ start, end, to });
  }

  if (edits.length === 0) {
    return {
      original,
      text: lower0,
      cased: cased0,
      corrections: [],
      toOriginal: (start, end) => ({ start, end }),
      toView: (pos) => pos,
    };
  }

  // Rebuild strings with per-character maps back to the original.
  let text = "";
  let cased = "";
  const origStart: number[] = [];
  const origEnd: number[] = [];
  const viewOfOrig = new Array<number>(original.length + 1);
  let cursor = 0;
  const pushSame = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      viewOfOrig[i] = text.length;
      origStart.push(i);
      origEnd.push(i + 1);
      text += lower0[i];
      cased += cased0[i];
    }
  };
  for (const e of edits) {
    pushSame(cursor, e.start);
    for (let i = e.start; i < e.end; i++) viewOfOrig[i] = text.length;
    for (let k = 0; k < e.to.length; k++) {
      origStart.push(e.start);
      origEnd.push(e.end);
    }
    text += e.to;
    cased += e.to;
    cursor = e.end;
  }
  pushSame(cursor, original.length);
  viewOfOrig[original.length] = text.length;

  return {
    original,
    text,
    cased,
    corrections: edits.map((e) => ({ start: e.start, end: e.end, from: original.slice(e.start, e.end), to: e.to })),
    toOriginal(start: number, end: number) {
      if (end <= start) {
        const p = start < origStart.length ? origStart[start] : original.length;
        return { start: p, end: p };
      }
      return { start: origStart[start], end: origEnd[end - 1] };
    },
    toView(pos: number) {
      if (pos <= 0) return 0;
      if (pos >= original.length) return text.length;
      return viewOfOrig[pos];
    },
  };
}
