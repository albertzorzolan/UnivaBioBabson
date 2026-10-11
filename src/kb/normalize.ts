// Drug-name matching (SPEC §6.1): turns what a family types ("Lorazepam 0.5mg tab at bedtime",
// "Furosemide (Lasix)", "Tylenol PM extra strength", "Norco 5/325", "Voltaren gel") into KB ingredient ids. Fuzzy
// matches are only *suggestions* the user must confirm; an unknown name is "not in Kinwise's reference set" — never
// implied to be free of risk.
//
// Order of attempts (first hit wins):
//   1. the whole cleaned text, with and without parentheses, then with dose/route/frequency words removed,
//      then the text inside parentheses ("Furosemide (Lasix)" -> "lasix");
//   2. a combination typed as ingredients ("lisinopril/hctz", "hydrocodone and acetaminophen") -> the
//      matching combination product, or the ingredient set itself;
//   3. the longest leading run of words that names a product ("tylenol pm extra strength" -> "tylenol pm",
//      "metoprolol succinate er" -> "metoprolol"), unless the words after it name a product line that usually adds
//      ingredients ("Tylenol Cold + Flu", "Advil Allergy Sinus", "acetaminophen PM"): then nothing is matched,
//      because guessing "acetaminophen" would hide the sedating antihistamine or decongestant in the product;
//   4. fuzzy (Damerau-Levenshtein <= 1 for 4-6 letters, <= 2 for 7+, same first letter): a suggestion only.
// Then route and dose: a single-ingredient match moves to its route- or dose-specific entry when the text says so
// ("diclofenac gel" -> topical diclofenac, "estradiol cream" -> vaginal estradiol, "doxepin 3 mg" -> low-dose
// doxepin), because the Beers criteria are scoped by route or dose (see V() in kb-src/kb/drugs_src.py).

import type { DrugMatch, KnowledgeBase } from "./types";
import { KB, type KbDrugCompiled, type KbDrugVariant } from "./compiled";

type Kind = "exact" | "brand" | "alias" | "combo";
interface Entry {
  ids: string[];
  kind: Kind;
  display: string;
}

interface KbLookup {
  names: Map<string, Entry>;
  comboBySet: Map<string, Entry>;
  /** Route/dose entries by the base ingredient they refine. */
  variantsOf: Map<string, { id: string; v: KbDrugVariant }[]>;
  /** Route/dose entries by their own id. */
  variantById: Map<string, KbDrugVariant>;
  display: Map<string, string>;
}

const lookupCache = new WeakMap<KnowledgeBase, KbLookup>();

function setKey(ids: readonly string[]): string {
  return [...new Set(ids)].sort().join("+");
}

function lookupFor(kb: KnowledgeBase): KbLookup {
  const hit = lookupCache.get(kb);
  if (hit) return hit;
  const names = new Map<string, Entry>();
  const comboBySet = new Map<string, Entry>();
  const variantsOf = new Map<string, { id: string; v: KbDrugVariant }[]>();
  const variantById = new Map<string, KbDrugVariant>();
  const display = new Map<string, string>();
  const put = (name: string, e: Entry) => {
    const k = clean(name);
    if (k && !names.has(k)) names.set(k, e);
  };
  const drugs = (kb.drugs ?? []) as KbDrugCompiled[];
  // Order sets precedence: generic names, then combination products, then brands, then aliases.
  for (const d of drugs) put(d.id, { ids: [d.id], kind: "exact", display: d.display });
  for (const d of drugs) put(d.display, { ids: [d.id], kind: "exact", display: d.display });
  for (const c of kb.combos ?? []) {
    const e: Entry = { ids: c.ingredientIds, kind: "combo", display: c.display };
    put(c.id, e);
    put(c.display, e);
    for (const n of c.names) put(n, e);
    const key = setKey(c.ingredientIds);
    if (!comboBySet.has(key)) comboBySet.set(key, e);
  }
  for (const d of drugs) for (const b of d.brands) put(b, { ids: [d.id], kind: "brand", display: d.display });
  for (const d of drugs) for (const a of d.aliases) put(a, { ids: [d.id], kind: "alias", display: d.display });
  for (const d of drugs) {
    display.set(d.id, d.display);
    const v = d.variant;
    if (!v || typeof v.of !== "string") continue;
    variantById.set(d.id, v);
    const list = variantsOf.get(v.of) ?? [];
    list.push({ id: d.id, v });
    variantsOf.set(v.of, list);
  }
  const out: KbLookup = { names, comboBySet, variantsOf, variantById, display };
  lookupCache.set(kb, out);
  return out;
}

/** Lowercase, strip accents and trademark marks, unify punctuation, "&"/"and" and whitespace ("p.m." -> "pm"). */
function clean(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™*"“”'’`]/g, "")
    .replace(/\b([a-z])\.([a-z])\.(?=\s|$)/g, "$1$2")
    .replace(/\s*&\s*|\s+and\s+/g, " + ") // "Cold & Flu", "Cold and Flu" and "Cold + Flu" are one name
    .replace(/\s*\+\s*/g, " + ")
    .replace(/[^a-z0-9%./+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Dose, form, route and schedule words. Bare "day" and "night" are *not* stripped: they are part of product names
// ("DayQuil", "Tylenol Cold + Flu Night"); only schedule phrases ("at night", "every day") are.
const DOSE_WORDS =
  /\b(\d+(\.\d+)?\s*(mg|mcg|µg|g|ml|units?|iu|%|meq)?(\/\s*\d+(\.\d+)?\s*(mg|mcg|ml)?)*|mg|mcg|ml|tabs?|tablets?|caps?|capsules?|caplets?|softgels?|gelcaps?|pills?|oral|po|er|xr|xl|sr|cr|dr|ec|od|ir|hcl|hydrochloride|extended release|delayed release|immediate release|once|twice|daily|nightly|at bedtime|bedtime|qd|bid|tid|qid|qhs|prn|as needed|in the morning|morning|evening|at night|every day|each day|every night|each night|per night|a day|per day|every|patch|cream|gel|drops?|inhaler|injection|pen|solution|liquid|syrup|generic|otc|rx|extra strength|maximum strength|regular strength|low dose)\b/g;

/** Words that often lead a typed name but are not part of it ("my lasix", "generic zocor"). */
const LEADING_FILLER = new Set(["my", "her", "his", "the", "a", "an", "rx", "otc", "generic", "brand", "take", "takes", "taking"]);

/** Words after which the text is the reason, not the product ("lorazepam for sleep"). */
const REASON_START = new Set(["for", "because", "when", "if", "prn"]);

/**
 * Words after a product name that usually mean extra ingredients (a sedating antihistamine, a decongestant, a cough
 * suppressant). Applies to generic names too ("acetaminophen PM" is acetaminophen + diphenhydramine).
 */
const ADDS_INGREDIENTS = new Set([
  "pm", "night", "nighttime", "nite", "nightshift", "cold", "flu", "sinus", "congestion", "cough", "multi-symptom", "multisymptom",
  "severe", "dm", "d", "cf", "plus", "+",
]);
/** Brand product lines only: "Tylenol Simply Sleep" is diphenhydramine, not acetaminophen. */
const BRAND_ADDS_INGREDIENTS = new Set(["sleep", "sleepgels", "sleeptabs", "allergy-sinus"]);

/** Strip dose/strength/route/frequency words, leaving the product name. */
function stripDose(s: string): string {
  const out = s.replace(DOSE_WORDS, " ").replace(/(^|\s)[./+%-]+(?=\s|$)/g, " ").replace(/[./+%-]+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
  const words = out.split(" ");
  while (words.length > 1 && LEADING_FILLER.has(words[0])) words.shift();
  return words.join(" ");
}

function damerauLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Do the words after a matched product name suggest a multi-ingredient product line? */
function addsIngredients(e: Entry, rest: string[]): boolean {
  for (const w of rest) {
    if (REASON_START.has(w)) return false;
    if (ADDS_INGREDIENTS.has(w)) return true;
    if (e.kind !== "exact" && BRAND_ADDS_INGREDIENTS.has(w)) return true;
  }
  return false;
}

type Leading = { e: Entry } | { blocked: true } | null;

/** The entry named by the whole text or by its longest leading run of words ("losartan potassium" -> losartan). */
function leading(map: Map<string, Entry>, text: string): Leading {
  const words = text.split(" ");
  for (let n = words.length; n >= 1; n--) {
    const e = map.get(words.slice(0, n).join(" "));
    if (!e) continue;
    return addsIngredients(e, words.slice(n)) ? { blocked: true } : { e };
  }
  return null;
}

/** "lisinopril/hctz", "hydrocodone and acetaminophen", "losartan + hydrochlorothiazide" -> ingredient set. */
function ingredientSet(lk: KbLookup, text: string): Entry | null {
  const parts = text
    .split(/\s*(?:\bw\/|\/|\+|-|\band\b|\bwith\b)\s*/)
    .map((p) => stripDose(p.trim()))
    .filter(Boolean);
  if (parts.length < 2) return null;
  const ids: string[] = [];
  for (const p of parts) {
    const l = leading(lk.names, p);
    if (!l || !("e" in l) || l.e.kind === "combo" || l.e.ids.length !== 1) return null;
    ids.push(l.e.ids[0]);
  }
  if (new Set(ids).size < 2) return null;
  const known = lk.comboBySet.get(setKey(ids));
  if (known) return known;
  const display = ids.map((id) => lk.display.get(id) ?? id).join(" + ");
  return { ids: [...new Set(ids)], kind: "combo", display };
}

// ---------------------------------------------------------------------------------------------
// Route and dose variants

/** The words of the typed name that describe the product (the reason after "for …" is cut off). */
function productTokens(raw: string): string[] {
  const words = raw.replace(/[()]/g, " ").split(" ").filter(Boolean);
  const cut = words.findIndex((w) => REASON_START.has(w));
  return cut === -1 ? words : words.slice(0, cut);
}

const NOT_ROUTE_AFTER_GEL = new Set(["cap", "caps", "capsule", "capsules", "tab", "tabs"]);

/** Does the token list contain the phrase? "#mg" matches any "<number> mg" / "<number>mg". */
function hasPhrase(tokens: string[], phrase: string): boolean {
  if (phrase === "#mg") return tokens.some((t, i) => /^\d+(\.\d+)?mg$/.test(t) || (t === "mg" && i > 0 && /^\d+(\.\d+)?$/.test(tokens[i - 1])));
  const p = phrase.split(" ");
  for (let i = 0; i + p.length <= tokens.length; i++) {
    if (p.every((w, j) => tokens[i + j] === w)) {
      if (phrase === "gel" && NOT_ROUTE_AFTER_GEL.has(tokens[i + 1] ?? "")) continue; // "gel caps" are swallowed
      return true;
    }
  }
  return false;
}

const hasAny = (tokens: string[], phrases: readonly string[] | undefined) => (phrases ?? []).some((p) => hasPhrase(tokens, p));

/** First "<number> mg" in the text (the typed strength), or null. */
function strengthMg(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*mg\b/.exec(text);
  return m ? Number(m[1]) : null;
}

/** Move a single-ingredient match to its route- or dose-specific entry (or back to the base) when the text says so. */
function applyVariant(lk: KbLookup, ids: string[], raw: string, dose: string): string[] {
  if (ids.length !== 1) return ids;
  const id = ids[0];
  const tokens = productTokens(raw);
  const own = lk.variantById.get(id);
  if (own) {
    // A route entry reached by a brand ("Voltaren 50 mg tablets") goes back to the base when the text says so.
    return hasAny(tokens, own.baseWords) && !hasAny(tokens, own.words) ? [own.of] : ids;
  }
  const options = lk.variantsOf.get(id);
  if (!options) return ids;
  for (const { id: vid, v } of options) if (hasAny(tokens, v.words)) return [vid];
  const mg = strengthMg(raw) ?? strengthMg(clean(dose));
  if (mg !== null && mg > 0) for (const { id: vid, v } of options) if (typeof v.maxDoseMg === "number" && mg <= v.maxDoseMg) return [vid];
  return ids;
}

/**
 * Fuzzy candidates start with the same letter and have no more words than the probe, and a shared first word
 * needs a matching second one: "vitamin b-12" (or just "vitamin") must not suggest "vitamin c".
 */
function plausibleSpelling(probe: string, name: string): boolean {
  if (probe[0] !== name[0]) return false;
  const p = probe.split(" ");
  const n = name.split(" ");
  if (n.length > p.length) return false;
  if (p.length > 1 && n.length > 1 && p[0] === n[0] && p[1][0] !== n[1][0]) return false;
  return true;
}

/**
 * Match a free-text medicine name against a knowledge base (exported for tests with fixture KBs). `dose` is the
 * separately entered strength, if any ("3 mg"): it can select a dose-specific entry such as low-dose doxepin.
 */
export function matchDrugWithKb(kb: KnowledgeBase, input: string, dose = ""): DrugMatch {
  const lk = lookupFor(kb);
  const map = lk.names;
  const raw = clean(input ?? "");
  if (!raw) return { ingredientIds: [], match: "none", suggestion: null, normalized: "" };
  const noParens = raw.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  const normalized = stripDose(noParens) || stripDose(raw.replace(/[()]/g, " "));
  const done = (e: Entry): DrugMatch => ({
    ingredientIds: e.kind === "combo" ? [...e.ids] : applyVariant(lk, e.ids, raw, dose ?? ""),
    match: e.kind,
    suggestion: null,
    normalized,
  });

  // 1. Whole-text candidates, most specific first.
  const candidates: string[] = [];
  const add = (c: string) => {
    const t = c.replace(/\s+/g, " ").trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };
  add(raw.replace(/[()]/g, " "));
  add(noParens);
  add(normalized);
  for (const m of raw.matchAll(/\(([^)]*)\)/g)) add(stripDose(m[1]));
  add(stripDose(raw.replace(/[()]/g, " ")));
  for (const c of candidates) {
    const e = map.get(c);
    if (e) return done(e);
  }

  // 2. Combination typed as its ingredients ("lisinopril/hctz", "losartan and hydrochlorothiazide").
  for (const c of candidates) {
    const e = ingredientSet(lk, c);
    if (e) return done(e);
  }

  // 3. Longest leading run of words that names a product; a product line that adds ingredients matches nothing.
  let blocked = false;
  for (const c of candidates) {
    const l = leading(map, c);
    if (!l) continue;
    if ("e" in l) return done(l.e);
    blocked = true;
  }
  if (blocked) return { ingredientIds: [], match: "none", suggestion: null, normalized };

  // 4. Fuzzy: a suggestion only (the user confirms). The whole name first, then its first word.
  const probes = [normalized, normalized.split(" ")[0] ?? ""].filter((p, i, a) => p.length >= 4 && /[a-z]{3}/.test(p) && a.indexOf(p) === i);
  for (const probe of probes) {
    const max = probe.length >= 7 ? 2 : 1;
    let best: { e: Entry; dist: number; name: string } | null = null;
    for (const [name, e] of map) {
      if (name.length < 4 || !plausibleSpelling(probe, name)) continue;
      const dist = damerauLevenshtein(probe, name, max);
      if (dist <= max && (!best || dist < best.dist || (dist === best.dist && name < best.name))) best = { e, dist, name };
    }
    if (best) return { ingredientIds: [...best.e.ids], match: "fuzzy", suggestion: best.e.display, normalized };
  }
  return { ingredientIds: [], match: "none", suggestion: null, normalized };
}

/** Match against the compiled Kinwise knowledge base (`dose`: the separately entered strength, optional). */
export function matchDrug(input: string, dose?: string): DrugMatch {
  return matchDrugWithKb(KB, input, dose ?? "");
}

/** Exposed for the search box and tests: the cleaning applied to every name before lookup. */
export function cleanDrugName(s: string): string {
  return clean(s);
}
