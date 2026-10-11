// Medication remarks in diary text: "forgot my evening tablets", "took two of the sleeping tablets by
// mistake", "skipped the Lasix today". Matches medicines from the person's own list by name, brand
// (parenthesised in the entered name) or ingredient, tolerates small misspellings, and resolves
// generic phrases ("water pill", "the new sleeping pill") only when exactly one listed medicine fits.
// The note text is the person's own clause, verbatim.

import type { ISODate, Medication } from "../../model/types";
import { daysBetween } from "../../model/dates";
import { editDistance, type TextView } from "./normalize";
import type { Boundary, Segment, Token } from "./segment";

export type MedNoteKind = "missed" | "extra" | "late" | "mix_up" | "stopped" | "started" | "taken" | "mention";

export interface MedNoteHit {
  medicationId: string | null;
  kind: MedNoteKind;
  /** Clause span in view coordinates. */
  start: number;
  end: number;
  /** Span of the medicine words themselves (view coordinates). */
  nameStart: number;
  nameEnd: number;
}

const KIND_PATTERNS: Array<[MedNoteKind, RegExp]> = [
  ["missed", /(?<![a-z])(?:forgot|forgotten|forget|forgetting|missed|miss|skipped|skip|skipping|didn't take|did not take|never took|haven't taken|hadn't taken|have not taken|ran out of|run out of|running out of|out of|left off|couldn't find|no more)(?![a-z])/],
  ["extra", /(?<![a-z])(?:(?:took|taken|had|take) (?:two|2|three|an extra|another|double|a double|twice|too many|the wrong)|double(?:d)? (?:up|dose|dosed)|by mistake|accidentally (?:took|taken|had)|extra (?:dose|pill|tablet)|took (?:it|them) twice|twice by mistake)(?![a-z])/],
  ["late", /(?<![a-z])(?:(?:took|taken|had) (?:[a-z']+ ){0,4}late|late (?:with|taking)|hours late|later than (?:usual|normal))(?![a-z])/],
  ["mix_up", /(?<![a-z])(?:mixed up|muddled up|mixed|mix-up|mix up|got (?:my |her |his )?(?:\w+ ){0,3}(?:mixed|muddled) up|confused)(?![a-z])/],
  ["stopped", /(?<![a-z])(?:stopped|stop|quit|came off|coming off|come off|gave up)(?: taking)?(?![a-z])/],
  ["started", /(?<![a-z])(?:started|starting|start|began|begun|begin|new)(?: taking| on)?(?![a-z])/],
  ["taken", /(?<![a-z])(?:took|taken|take|takes|had|have)(?![a-z])/],
];

/** Generic phrases → which listed medicines they could mean (by ingredient or by "reason" text). */
const GENERIC_PHRASES: Array<{ re: RegExp; ingredients: string[]; reason: RegExp }> = [
  {
    re: /water (?:pills?|tablets?|meds?)/,
    ingredients: ["furosemide", "hydrochlorothiazide", "chlorthalidone", "torsemide", "bumetanide", "spironolactone", "triamterene", "indapamide", "metolazone", "amiloride", "eplerenone"],
    reason: /fluid|swell|edema|oedema|water|ankle/,
  },
  {
    re: /(?:sleeping|sleep|night-?time|bedtime) (?:pills?|tablets?|aids?|meds?|medicine|medication)|sleeping draught|something to help (?:me|her|him) sleep/,
    ingredients: ["zolpidem", "zopiclone", "eszopiclone", "zaleplon", "temazepam", "triazolam", "diphenhydramine", "doxylamine", "trazodone", "mirtazapine", "melatonin", "suvorexant", "lemborexant", "ramelteon"],
    reason: /sleep|insomnia/,
  },
  {
    re: /(?:blood pressure|bp|pressure) (?:pills?|tablets?|meds?|medicine|medication)/,
    ingredients: ["amlodipine", "lisinopril", "losartan", "valsartan", "ramipril", "enalapril", "nifedipine", "metoprolol", "atenolol", "hydrochlorothiazide", "chlorthalidone", "irbesartan", "olmesartan", "candesartan", "diltiazem", "verapamil"],
    reason: /blood pressure|hypertension|\bbp\b/,
  },
  {
    re: /(?:bladder|waterworks|wee|incontinence) (?:pills?|tablets?|meds?|medicine|medication)/,
    ingredients: ["oxybutynin", "tolterodine", "solifenacin", "mirabegron", "trospium", "darifenacin", "fesoterodine", "vibegron"],
    reason: /bladder|urin|incontinen/,
  },
  {
    re: /(?:diabetes|diabetic|sugar|blood sugar) (?:pills?|tablets?|meds?|medicine|medication)/,
    ingredients: ["metformin", "glipizide", "glimepiride", "glyburide", "gliclazide", "sitagliptin", "linagliptin", "empagliflozin", "dapagliflozin", "pioglitazone"],
    reason: /diabet|sugar|glucose/,
  },
  {
    re: /(?:cholesterol|statin) (?:pills?|tablets?|meds?|medicine|medication)|(?:my|her|his|the) statin/,
    ingredients: ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin", "pitavastatin", "ezetimibe"],
    reason: /cholesterol|lipid/,
  },
  {
    re: /(?:heartburn|acid|stomach|reflux|indigestion) (?:pills?|tablets?|meds?|medicine|medication)/,
    ingredients: ["omeprazole", "pantoprazole", "esomeprazole", "lansoprazole", "rabeprazole", "famotidine", "ranitidine"],
    reason: /heartburn|reflux|acid|stomach|ulcer|gerd|indigestion/,
  },
  {
    re: /(?:anxiety|nerve|nerves|calming) (?:pills?|tablets?|meds?|medicine|medication)/,
    ingredients: ["lorazepam", "alprazolam", "diazepam", "clonazepam", "buspirone", "chlordiazepoxide", "oxazepam"],
    reason: /anxi|nerve|panic/,
  },
  {
    re: /(?:pain|arthritis) (?:pills?|tablets?|meds?|medicine|medication)|pain ?killers?/,
    ingredients: ["acetaminophen", "ibuprofen", "naproxen", "tramadol", "oxycodone", "hydrocodone", "codeine", "celecoxib", "diclofenac", "meloxicam"],
    reason: /pain|arthritis|ache/,
  },
  {
    re: /blood thinners?|(?:thinning|anticoagulant) (?:pills?|tablets?|meds?)/,
    ingredients: ["warfarin", "apixaban", "rivaroxaban", "dabigatran", "edoxaban"],
    reason: /clot|thin|atrial|\baf\b|afib|stroke/,
  },
];

/** Generic "my evening pills" style references (no specific medicine). */
const GENERIC_ANY =
  /(?:my|her|his|the|all (?:my|her|his)|all the|some of (?:my|her|his)) (?:(?:morning|evening|night|night-?time|bedtime|lunchtime|afternoon|usual|regular|daily|new|other) )?(?:pills?|tablets?|meds|medicines?|medication|meds|dose|doses|capsules?|tabs)(?![a-z])/g;

const DOSE_TEXT = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|iu)\b.*$/;

/** Lower-case name variants for one medication: entered name, bracketed brand, ingredients. */
export function medNameVariants(med: Medication): string[] {
  const out = new Set<string>();
  const raw = med.name.toLowerCase().replace(/[’`]/g, "'");
  const inParens = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  const base = raw.replace(/\([^)]*\)/g, " ").replace(DOSE_TEXT, "").replace(/\s+/g, " ").trim();
  if (base.length >= 3) out.add(base);
  for (const p of inParens) {
    for (const part of p.split(/[,/]/)) {
      const v = part.replace(DOSE_TEXT, "").trim();
      if (v.length >= 3 && !/^(?:otc|over the counter|prn|as needed|generic)$/.test(v)) out.add(v);
    }
  }
  for (const id of med.ingredientIds) if (id.length >= 4) out.add(id.toLowerCase());
  return [...out];
}

/** Words from the medication list (so the spelling corrector never "fixes" them). */
export function medKnownWords(meds: Medication[]): Set<string> {
  const s = new Set<string>();
  for (const m of meds) for (const v of medNameVariants(m)) for (const w of v.split(/[^a-z']+/)) if (w.length >= 3) s.add(w);
  return s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isActive(med: Medication, today: ISODate): boolean {
  return !med.endDate || med.endDate >= today;
}

/** Resolve a generic phrase to exactly one listed medicine, or null when ambiguous/unknown. */
function resolveGeneric(
  entry: (typeof GENERIC_PHRASES)[number],
  meds: Medication[],
  today: ISODate,
  saysNew: boolean,
): string | null {
  const cands = meds.filter(
    (m) => isActive(m, today) && (m.ingredientIds.some((i) => entry.ingredients.includes(i)) || entry.reason.test(m.reason.toLowerCase())),
  );
  if (cands.length === 1) return cands[0].id;
  if (cands.length > 1 && saysNew) {
    // "the new sleeping pill": the one started most recently, if clearly the newest (≤ 60 days).
    const sorted = [...cands].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    const newest = sorted[0];
    const age = daysBetween(newest.startDate, today);
    if (age >= 0 && age <= 60 && sorted[1].startDate < newest.startDate) return newest.id;
  }
  return null;
}

/** Kind of remark made in a clause about a medicine. */
export function medNoteKind(clause: string): MedNoteKind {
  const t = clause.toLowerCase().replace(/[’`]/g, "'");
  for (const [kind, re] of KIND_PATTERNS) {
    if (kind === "started" && !/(?<![a-z])(?:started|starting|start|began|begun|begin)(?![a-z])/.test(t)) continue;
    if (re.test(t)) return kind;
  }
  return "mention";
}

/**
 * Find medication remarks. Named medicines always produce a note; generic references ("my
 * evening tablets") only when the clause reports an event (missed, extra, late, mix-up, stop/start).
 */
export function findMedNotes(
  view: TextView,
  sentences: Segment[],
  boundariesBySentence: Boundary[][],
  tokens: Token[],
  meds: Medication[],
  today: ISODate,
): MedNoteHit[] {
  const text = view.text;
  const hits: Array<{ medicationId: string | null; start: number; end: number; generic: boolean }> = [];

  // 1) Named medicines (exact, then fuzzy single words).
  const variants = meds.flatMap((m) => medNameVariants(m).map((v) => ({ id: m.id, v })));
  for (const { id, v } of variants) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(v)}(?![a-z0-9])`, "g");
    for (let m = re.exec(text); m; m = re.exec(text)) hits.push({ medicationId: id, start: m.index, end: m.index + m[0].length, generic: false });
  }
  const singleWord = variants.filter((x) => /^[a-z]{6,}$/.test(x.v));
  for (const tk of tokens) {
    if (tk.kind !== "word" || tk.norm.length < 6) continue;
    if (hits.some((h) => h.start <= tk.start && tk.end <= h.end)) continue;
    for (const { id, v } of singleWord) {
      if (v[0] !== tk.norm[0]) continue;
      const allowed = v.length >= 9 ? 2 : 1;
      if (editDistance(tk.norm, v, allowed) <= allowed) {
        hits.push({ medicationId: id, start: tk.start, end: tk.end, generic: false });
        break;
      }
    }
  }

  // 2) Generic phrases ("water pill", "the new sleeping pill").
  for (const entry of GENERIC_PHRASES) {
    const re = new RegExp(entry.re.source, "g");
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (hits.some((h) => m!.index < h.end && h.start < m!.index + m![0].length)) continue;
      const saysNew = /(?<![a-z])new\s+$/.test(text.slice(Math.max(0, m.index - 8), m.index));
      hits.push({ medicationId: resolveGeneric(entry, meds, today, saysNew), start: m.index, end: m.index + m[0].length, generic: false });
    }
  }

  // 3) Any other pill reference ("my evening tablets") — only kept when an event is reported.
  GENERIC_ANY.lastIndex = 0;
  for (let m = GENERIC_ANY.exec(text); m; m = GENERIC_ANY.exec(text)) {
    if (hits.some((h) => m!.index < h.end && h.start < m!.index + m![0].length)) continue;
    hits.push({ medicationId: null, start: m.index, end: m.index + m[0].length, generic: true });
  }

  // Clause around each hit; one note per (clause, medicine).
  const out: MedNoteHit[] = [];
  for (const h of hits.sort((a, b) => a.start - b.start)) {
    const si = sentences.findIndex((s) => s.start <= h.start && h.end <= s.end);
    if (si < 0) continue;
    const s = sentences[si];
    const bs = boundariesBySentence[si] ?? [];
    let start = s.start;
    let end = s.end;
    for (const b of bs) {
      if (b.end <= h.start) start = Math.max(start, b.kind === "termination" && /^[a-z]/.test(b.word) ? b.end : b.end);
      else if (b.start >= h.end) {
        end = Math.min(end, b.start);
        break;
      }
    }
    const comma = text.indexOf(",", h.end);
    if (comma !== -1 && comma < end) end = comma;
    const prevComma = text.lastIndexOf(",", h.start);
    if (prevComma >= start) start = prevComma + 1;
    while (start < end && /[\s,;:-]/.test(text[start])) start++;
    while (end > start && /[\s.!?,;:]/.test(text[end - 1])) end--;
    const kind = medNoteKind(text.slice(start, end));
    if (h.generic && (kind === "taken" || kind === "mention")) continue;
    if (out.some((o) => o.start === start && o.end === end && o.medicationId === h.medicationId)) continue;
    // A specific medicine supersedes a generic null-medicine note for the same clause.
    if (h.medicationId === null && out.some((o) => o.start === start && o.end === end)) continue;
    out.push({ medicationId: h.medicationId, kind, start, end, nameStart: h.start, nameEnd: h.end });
  }
  return out;
}
