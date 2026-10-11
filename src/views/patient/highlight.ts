// Pure layout for the highlighted story in "Here's what I heard". Spans from different sources can nest
// or overlap ("quite dizzy" for severity contains "dizzy" for dizziness), so overlapping marks are merged
// into one segment that carries every label (most important first). Unit-tested in highlight.test.ts.

export type MarkKind = "yes" | "no" | "value" | "conflict" | "med" | "other" | "skip";

export interface StoryMark {
  start: number;
  end: number;
  kind: MarkKind;
  label: string;
  /** Keys linking the mark to cards (e.g. "p:dizziness"), for hover/focus emphasis. */
  key: string;
}

export type StorySegment =
  | { type: "text"; text: string }
  | { type: "mark"; text: string; kind: MarkKind; labels: string[]; keys: string[]; start: number; end: number };

/** Lower number = more important (wins the colour of a merged segment). */
const PRIORITY: Record<MarkKind, number> = { conflict: 0, yes: 1, value: 2, no: 3, med: 4, other: 5, skip: 6 };

/** Split `story` into plain and marked segments. Invalid or empty spans are ignored. */
export function layoutStory(story: string, marks: StoryMark[]): StorySegment[] {
  const valid = marks
    .filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.start >= 0 && m.end <= story.length && m.end > m.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const clusters: { start: number; end: number; items: StoryMark[] }[] = [];
  for (const m of valid) {
    const last = clusters[clusters.length - 1];
    if (last && m.start < last.end) {
      last.end = Math.max(last.end, m.end);
      last.items.push(m);
    } else {
      clusters.push({ start: m.start, end: m.end, items: [m] });
    }
  }
  const out: StorySegment[] = [];
  let pos = 0;
  for (const c of clusters) {
    if (c.start > pos) out.push({ type: "text", text: story.slice(pos, c.start) });
    const items = [...c.items].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.start - b.start);
    const labels = [...new Set(items.map((i) => i.label).filter(Boolean))].slice(0, 2);
    out.push({
      type: "mark",
      text: story.slice(c.start, c.end),
      kind: items[0].kind,
      labels,
      keys: [...new Set(items.map((i) => i.key))],
      start: c.start,
      end: c.end,
    });
    pos = c.end;
  }
  if (pos < story.length) out.push({ type: "text", text: story.slice(pos) });
  return out;
}
