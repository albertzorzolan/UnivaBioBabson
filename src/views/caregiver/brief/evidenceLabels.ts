// Short, plain labels for evidence ids ("Before vs after", "Check-in Oct 5"), used on evidence chips in the
// visit brief and in Ask Kinwise. Pure: derived from the id format in engine/brief/evidence.ts (+ qa.ts).
import type { EvidenceItem, ISODate, StoreData } from "../../../model/types";
import { formatShort, isValidDate } from "../../../model/dates";
import type { BriefEvidenceItem } from "../../../engine/brief";
import { medName } from "../../../engine/brief/shared";
import { getMetric } from "../../../engine/timeline/metrics";
import type { MetricKey } from "../../../model/types";

export type EvidenceGroup = "signal" | "count" | "falls" | "coverage" | "review" | "med" | "concern" | "question" | "note" | "entry" | "fact";

/** Group of an evidence id (for icons and ordering). */
export function evidenceGroup(id: string): EvidenceGroup {
  if (id.startsWith("sig:")) return "signal";
  if (id.startsWith("find:") || id.startsWith("fact:qa:beers") || id === "fact:acb") return "review";
  if (id.startsWith("med:") || id === "fact:meds" || id.startsWith("fact:qa:med")) return "med";
  if (id.startsWith("concern:")) return "concern";
  if (id.startsWith("note:question:")) return "question";
  if (id.startsWith("note:")) return "note";
  if (id.startsWith("entry:")) return "entry";
  if (/^fact:(qa:)?(falls|fall)/.test(id) || id.startsWith("fact:falls-since")) return "falls";
  if (id.startsWith("fact:coverage") || id === "fact:entries" || id === "fact:latest") return "coverage";
  if (id.startsWith("fact:count:") || id.startsWith("fact:qa:count") || id.startsWith("fact:qa:change") || id.startsWith("fact:qa:first")) return "count";
  return "fact";
}

function dateIn(id: string, item?: BriefEvidenceItem): ISODate | null {
  const d = item?.data?.dates?.[0];
  if (d && isValidDate(d)) return d;
  const m = /\d{4}-\d{2}-\d{2}/.exec(id);
  return m && isValidDate(m[0]) ? m[0] : null;
}

function metricIn(id: string, item?: BriefEvidenceItem): MetricKey | null {
  if (item?.data?.metric) return item.data.metric;
  const m = /^(?:fact:count|sig:[^:]+):([A-Za-z]+)/.exec(id);
  if (!m) return null;
  try {
    return getMetric(m[1] as MetricKey).key;
  } catch {
    return null;
  }
}

function metricShort(m: MetricKey | null): string | null {
  if (!m) return null;
  try {
    return getMetric(m).label;
  } catch {
    return null;
  }
}

/** Chip label for one evidence id. */
export function evidenceLabel(id: string, item: EvidenceItem | undefined, data: StoreData): string {
  const it = item as BriefEvidenceItem | undefined;
  switch (evidenceGroup(id)) {
    case "signal": {
      const m = metricShort(metricIn(id, it));
      return m ? `Before vs after · ${m.toLowerCase()}` : "Before vs after";
    }
    case "count": {
      const m = metricShort(metricIn(id, it));
      return m ? `Diary · ${m.toLowerCase()}` : "Diary count";
    }
    case "falls":
      return "Falls log";
    case "coverage":
      return "Diary coverage";
    case "review":
      return id === "fact:acb" ? "ACB score" : "Review prompt";
    case "med": {
      if (id.startsWith("med:")) {
        const med = data.medications.find((m) => m.id === id.slice(4));
        if (med) return medName(med);
      }
      return "Medicine list";
    }
    case "concern":
      return "Pinned concern";
    case "question":
      return "Saved question";
    case "note":
      return "Note";
    case "entry": {
      const d = dateIn(id, it);
      return d ? `Check-in ${formatShort(d)}` : "Check-in";
    }
    default:
      return id.startsWith("fact:conditions") ? "Conditions" : "Record";
  }
}

/** Heading used in the evidence drawer for one item. */
export function evidenceHeading(id: string): string {
  switch (evidenceGroup(id)) {
    case "signal":
      return "Before vs after a medicine change";
    case "count":
      return "Diary count";
    case "falls":
      return "Falls and near-falls";
    case "coverage":
      return "How often the diary was kept";
    case "review":
      return "Medication review";
    case "med":
      return "Medication list";
    case "concern":
      return "Pinned concern";
    case "question":
      return "Saved visit question";
    case "note":
      return "Note";
    case "entry":
      return "Daily check-in";
    default:
      return "From the record";
  }
}

const QUOTE_CHARS = /^["'“”‘’]|["'“”‘’]$/;

/** The claim in curly quotes, unless it already starts or ends with a quote mark (no doubled “…””). */
export function quoted(claim: string): string {
  const t = claim.trim();
  return QUOTE_CHARS.test(t) ? t : `“${t}”`;
}
