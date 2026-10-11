// Fast, read-only lookups over a KnowledgeBase object for the review engine.
//
// The engine works from a KnowledgeBase *value* (not module globals) so tests can run it against small
// fixture knowledge bases and the app runs it against the compiled KB (src/kb). Lookups are cached per
// KnowledgeBase object in a WeakMap, so building the index is a one-off cost.

import type { DrugSelector, FridClass, KbClass, KbDrug, KbSource, KnowledgeBase } from "../../kb/types";

export interface KbIndex {
  kb: KnowledgeBase;
  drug(id: string): KbDrug | undefined;
  /** Direct classes plus every ancestor (transitive), as a set. Empty for unknown ingredients. */
  classesOf(ingredientId: string): ReadonlySet<string>;
  /** The ingredient ids (from `ingredientIds`) that the selector matches, in input order. */
  matching(ingredientIds: readonly string[], sel: DrugSelector | undefined): string[];
  source(id: string): KbSource | undefined;
  classInfo(id: string): KbClass | undefined;
  /** FRID class entries that apply to an ingredient (via its transitive classes or a FRID entry naming the drug id). */
  fridsOf(ingredientId: string): FridClass[];
}

const cache = new WeakMap<KnowledgeBase, KbIndex>();

export function indexKb(kb: KnowledgeBase): KbIndex {
  const hit = cache.get(kb);
  if (hit) return hit;

  const drugs = new Map<string, KbDrug>();
  for (const d of kb.drugs ?? []) if (d && typeof d.id === "string") drugs.set(d.id, d);
  const classes = new Map<string, KbClass>();
  for (const c of kb.classes ?? []) if (c && typeof c.id === "string") classes.set(c.id, c);
  const sources = new Map<string, KbSource>();
  for (const s of kb.sources ?? []) if (s && typeof s.id === "string") sources.set(s.id, s);

  const ancestorsMemo = new Map<string, ReadonlySet<string>>();
  const ancestorsOfClass = (id: string, seen: Set<string> = new Set()): ReadonlySet<string> => {
    const memo = ancestorsMemo.get(id);
    if (memo) return memo;
    const out = new Set<string>([id]);
    if (seen.has(id)) return out; // cycle guard (a malformed KB must not hang the engine)
    seen.add(id);
    for (const p of classes.get(id)?.parents ?? []) for (const a of ancestorsOfClass(p, seen)) out.add(a);
    ancestorsMemo.set(id, out);
    return out;
  };

  const classesMemo = new Map<string, ReadonlySet<string>>();
  const classesOf = (ingredientId: string): ReadonlySet<string> => {
    const memo = classesMemo.get(ingredientId);
    if (memo) return memo;
    const out = new Set<string>();
    for (const c of drugs.get(ingredientId)?.classes ?? []) for (const a of ancestorsOfClass(c)) out.add(a);
    classesMemo.set(ingredientId, out);
    return out;
  };

  const ingredientMatches = (id: string, sel: DrugSelector): boolean => {
    if (sel.drugs?.includes(id)) return true;
    if (!sel.classes?.length) return false;
    const cs = classesOf(id);
    return sel.classes.some((c) => cs.has(c));
  };

  const fridByClass = new Map<string, FridClass[]>();
  for (const f of kb.frids ?? []) {
    const list = fridByClass.get(f.classId) ?? [];
    list.push(f);
    fridByClass.set(f.classId, list);
  }
  const fridsMemo = new Map<string, FridClass[]>();
  const fridsOf = (ingredientId: string): FridClass[] => {
    const memo = fridsMemo.get(ingredientId);
    if (memo) return memo;
    const out: FridClass[] = [...(fridByClass.get(ingredientId) ?? [])];
    for (const c of classesOf(ingredientId)) for (const f of fridByClass.get(c) ?? []) if (!out.includes(f)) out.push(f);
    fridsMemo.set(ingredientId, out);
    return out;
  };

  const index: KbIndex = {
    kb,
    drug: (id) => drugs.get(id),
    classesOf,
    matching: (ingredientIds, sel) => (sel ? ingredientIds.filter((id) => ingredientMatches(id, sel)) : []),
    source: (id) => sources.get(id),
    classInfo: (id) => classes.get(id),
    fridsOf,
  };
  cache.set(kb, index);
  return index;
}
