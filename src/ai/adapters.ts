// Adapters to sibling modules the AI layer uses but does not own:
//   - analyzeContext (src/engine/nlp/context.ts, ConText) — re-checks AI extraction proposals,
//   - KB (src/kb/index.ts) — drug vocabulary for the claim checker and the KB version for provenance.
//
// The KB is bound through Vite's import.meta.glob so this layer builds and tests while src/kb/index.ts
// is still being written: when the file exists the glob is a normal static import of it; when it does
// not, the claim checker's built-in vocabulary is used and ADAPTER_STATUS says so (shown in the AI
// harness). fallbackAnalyzeContext is a small ConText used by unit tests to exercise the refinement
// checks independently of the full NLP engine.

import type { Mention, Span } from "../model/types";
import { analyzeContext as engineAnalyzeContext } from "../engine/nlp/context";

export interface ContextResult {
  negated: boolean;
  temporality: Mention["temporality"];
  experiencer: Mention["experiencer"];
  triggers: Span[];
}
export type ContextAnalyzer = (sentence: string, target: { start: number; end: number }) => ContextResult;

interface KbLike {
  version: string;
  drugs: { id: string; display: string; brands: string[]; aliases: string[] }[];
  combos: { names: string[] }[];
}

const kbModules = import.meta.glob<{ KB?: KbLike }>("../kb/index.ts", { eager: true });
const realKb = Object.values(kbModules)[0]?.KB;

// ---------------------------------------------------------------------------
// Minimal ConText for unit tests (the app uses the full engine in src/engine/nlp/context.ts)

const NEG_PRE = /\b(?:no|not|never|without|denies|deny|denied|free of|didn'?t|don'?t|doesn'?t|wasn'?t|weren'?t|isn'?t|aren'?t|haven'?t|hasn'?t|hadn'?t|nor|neither|none)\b/gi;
const PSEUDO_NEG = /\b(?:no better|not only|no change|not sure|no worse|not much better)\b/i;
const NEG_POST = /\b(?:gone|went away|has gone|wore off|is better now|stopped)\b/i;
const HISTORICAL = /\b(?:yesterday|last (?:week|month|year|tuesday|monday|wednesday|thursday|friday|saturday|sunday|night)|used to|in the past|years ago|the other day|earlier this week|a while ago|back in)\b/gi;
const HYPOTHETICAL = /\b(?:if|in case|worried (?:that|i'?ll|about)|afraid (?:that|i'?ll)|scared (?:that|i'?ll)|might|could|may|would|what if|tomorrow|next (?:week|time)|later on)\b/gi;
const OTHER = /\b(?:my (?:sister|brother|husband|wife|daughter|son|granddaughter|grandson|grandkids?|grandchildren|friend|neighbou?r|mother|father|mum|mom|dad|aunt|uncle|cousin|niece|nephew|partner|carer|caregiver)|(?:he|she|they)\b)/gi;
const TERMINATION = /\b(?:but|however|although|though|except|aside from|apart from|which|yet)\b|[;:,.!?]/gi;

/** Index where the current clause (containing `at`) begins. */
function clauseStart(sentence: string, at: number): number {
  let start = 0;
  for (const m of sentence.matchAll(TERMINATION)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end <= at) start = end;
  }
  return start;
}
function clauseEnd(sentence: string, from: number): number {
  TERMINATION.lastIndex = 0;
  for (const m of sentence.matchAll(TERMINATION)) if ((m.index ?? 0) >= from) return m.index ?? sentence.length;
  return sentence.length;
}

function spansOf(re: RegExp, text: string, offset: number): Span[] {
  return [...text.matchAll(re)].map((m) => ({ start: offset + (m.index ?? 0), end: offset + (m.index ?? 0) + m[0].length, quote: m[0] }));
}

/** Simplified ConText: scope = the target's clause; pre-triggers before the target, a few post-triggers after. */
export function fallbackAnalyzeContext(sentence: string, target: { start: number; end: number }): ContextResult {
  const cs = clauseStart(sentence, target.start);
  const ce = clauseEnd(sentence, target.end);
  const before = sentence.slice(cs, target.start);
  const after = sentence.slice(target.end, ce);
  const triggers: Span[] = [];
  const neg = PSEUDO_NEG.test(before) ? [] : spansOf(NEG_PRE, before, cs);
  const negPost = NEG_POST.test(after);
  const hist = [...spansOf(HISTORICAL, before, cs), ...spansOf(HISTORICAL, after, target.end)];
  const hypo = spansOf(HYPOTHETICAL, before, cs);
  const other = spansOf(OTHER, before, cs);
  triggers.push(...neg, ...hist, ...hypo, ...other);
  return {
    negated: neg.length > 0 || negPost,
    temporality: hypo.length ? "hypothetical" : hist.length ? "historical" : "current",
    experiencer: other.length ? "other" : "patient",
    triggers,
  };
}

/** The ConText implementation used to re-check AI proposals: the NLP engine's. */
export const analyzeContext: ContextAnalyzer = (sentence, target) => engineAnalyzeContext(sentence, target);

// ---------------------------------------------------------------------------
// KB

/** Every drug, brand, alias and combination name in the KB (lowercase), for drug-name detection. */
export const KB_DRUG_NAMES: string[] = realKb
  ? [
      ...new Set(
        [
          ...realKb.drugs.flatMap((d) => [d.id, d.display, ...d.brands, ...d.aliases]),
          ...realKb.combos.flatMap((c) => c.names),
        ]
          .map((n) => n.toLowerCase().trim())
          // Aliases like "water pill" are descriptions, not names; keep single tokens and known multi-word brands.
          .filter((n) => n.length >= 4 && !/\b(?:pill|tablet|medicine)\b/.test(n)),
      ),
    ]
  : [];

export const KB_VERSION: string = realKb?.version ?? "unknown";

export const ADAPTER_STATUS = {
  context: "engine/nlp/context (ConText)",
  kb: realKb ? `kb ${realKb.version}` : "built-in vocabulary (kb/index.ts not found)",
} as const;
