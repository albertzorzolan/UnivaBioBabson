// Evidence chips + drawer shared by the Visit brief and Ask Kinwise: every sentence names the records it restates,
// and one tap shows them — the evidence sentence itself, the check-in days behind a count (expandable to the
// full day record) and a link to the screen where it came from.
import { useMemo, useState } from "react";
import { ArrowRight, BookOpenCheck, CalendarDays, ChartNoAxesColumn, ChevronDown, ClipboardCheck, FileQuestion, Footprints, MessageSquareQuote, NotebookPen, Pill, Pin, TriangleAlert } from "lucide-react";
import type { EvidenceItem, ISODate } from "../../../model/types";
import { formatWeekday } from "../../../model/dates";
import { getMetric, latestCheckInPerDate, metricValue } from "../../../engine/timeline/metrics";
import type { BriefEvidenceItem } from "../../../engine/brief";
import { useStore } from "../../../app/StoreProvider";
import { href, type Route } from "../../../app/router";
import { Drawer, cx } from "../../../ui";
import { DayRecord, latestFor, recordedChips } from "../../shared/caregiver-Records";
import { evidenceGroup, evidenceHeading, evidenceLabel, quoted, type EvidenceGroup } from "./evidenceLabels";
import "./evidence.css";

const GROUP_ICON: Record<EvidenceGroup, typeof Pill> = {
  signal: ChartNoAxesColumn,
  count: CalendarDays,
  falls: Footprints,
  coverage: CalendarDays,
  review: ClipboardCheck,
  med: Pill,
  concern: Pin,
  question: FileQuestion,
  note: NotebookPen,
  entry: MessageSquareQuote,
  fact: BookOpenCheck,
};

/** Max chips shown per sentence; the rest are behind "+N". */
const MAX_CHIPS = 3;

export interface EvidenceChipsProps {
  ids: string[];
  lookup: Map<string, EvidenceItem>;
  onOpen: (ids: string[], focus: string) => void;
  className?: string;
  /** Short context for screen readers ("for sentence 2"). */
  context?: string;
}

/** Small citation chips after a sentence. Each opens the evidence drawer at that item. */
export function EvidenceChips({ ids, lookup, onOpen, className, context }: EvidenceChipsProps) {
  const { data } = useStore();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;
  const shown = unique.slice(0, MAX_CHIPS);
  const rest = unique.length - shown.length;
  return (
    <span className={cx("cg-ev-chips", className)}>
      {shown.map((id) => {
        const Icon = GROUP_ICON[evidenceGroup(id)];
        const missing = !lookup.has(id);
        const label = evidenceLabel(id, lookup.get(id), data);
        return (
          <button
            key={id}
            type="button"
            className={cx("cg-ev-chip", missing && "cg-ev-chip--missing")}
            onClick={() => onOpen(unique, id)}
            aria-label={`Show the record: ${label}${context ? ` (${context})` : ""}`}
          >
            <Icon size={12} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
      {rest > 0 && (
        <button type="button" className="cg-ev-chip cg-ev-chip--more" onClick={() => onOpen(unique, unique[MAX_CHIPS])} aria-label={`Show ${rest} more records`}>
          +{rest}
        </button>
      )}
    </span>
  );
}

function linkFor(item: BriefEvidenceItem | undefined, id: string): { to: Route; params?: Record<string, string>; label: string } | null {
  const g = evidenceGroup(id);
  if (g === "review" && item?.data?.findingKey) return { to: "/c/review", params: { finding: item.data.findingKey }, label: "Open in Medication review" };
  if (g === "review") return { to: "/c/review", label: "Open Medication review" };
  if (g === "signal") return { to: "/c/timeline", params: item?.data?.medIds?.[0] ? { med: item.data.medIds[0] } : undefined, label: "Open in Symptoms & timeline" };
  if (g === "med") return { to: "/c/meds", label: "Open Medications" };
  return null;
}

function DayRow({ date, counted }: { date: ISODate; counted: boolean }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const c = latestFor(data.checkIns, date);
  const chips = c ? recordedChips(c) : [];
  const panel = `cg-ev-day-${date}`;
  return (
    <li className={cx("cg-ev-day", counted && "is-counted", open && "is-open")}>
      <button type="button" className="cg-ev-day__head" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <span className="cg-ev-day__date ui-num">{formatWeekday(date)}</span>
        <span className="cg-ev-day__chips">{chips.length ? chips.join(" · ") : c ? "Nothing recorded" : "No check-in"}</span>
        <ChevronDown size={16} aria-hidden="true" className="cg-ev-day__chev" />
      </button>
      <div id={panel} hidden={!open} className="cg-ev-day__panel">
        {open && <DayRecord date={date} />}
      </div>
    </li>
  );
}

function ItemBlock({ id, item, focused }: { id: string; item: BriefEvidenceItem | undefined; focused: boolean }) {
  const { data } = useStore();
  const g = evidenceGroup(id);
  const Icon = GROUP_ICON[g];
  const link = linkFor(item, id);
  // Days behind a count: every answered day, the ones that were counted first.
  const days = useMemo(() => {
    const d = item?.data;
    const counted = new Set(d?.dates ?? []);
    const byId = new Map(data.checkIns.map((c) => [c.id, c.date]));
    let dates = [...new Set((d?.checkInIds ?? []).map((x) => byId.get(x)).filter((x): x is ISODate => Boolean(x)))];
    // Items rendered for one question carry a metric + range instead of check-in ids: rebuild the answered days.
    if (dates.length === 0 && d?.metric && d.from && d.to) {
      const metric = d.metric;
      const from = d.from;
      const to = d.to;
      try {
        const answered = latestCheckInPerDate(data.checkIns).filter((c) => c.date >= from && c.date <= to && metricValue(c, metric) !== null);
        dates = answered.map((c) => c.date);
        if (counted.size === 0 && getMetric(metric).kind === "boolean")
          for (const c of answered) if (metricValue(c, metric) === 1) counted.add(c.date);
      } catch {
        dates = [];
      }
    }
    if (dates.length === 0 && counted.size > 0) dates = [...counted];
    return dates
      .sort()
      .reverse()
      .map((x) => ({ date: x, counted: counted.has(x) }))
      .sort((a, b) => Number(b.counted) - Number(a.counted));
  }, [item, data.checkIns]);
  const counted = days.filter((d) => d.counted).length;
  return (
    <section className={cx("cg-ev-item", focused && "is-focused")} aria-label={evidenceHeading(id)}>
      <p className="cg-ev-item__kind">
        <Icon size={15} aria-hidden="true" />
        <span>{evidenceHeading(id)}</span>
      </p>
      {item ? (
        <p className="cg-ev-item__text">{item.text}</p>
      ) : (
        <p className="cg-ev-item__missing">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>This record is no longer in the current evidence (the records changed). Rebuild the brief to refresh it.</span>
        </p>
      )}
      {days.length > 0 && (
        <div className="cg-ev-item__days">
          <p className="cg-ev-item__days-title">
            {g === "count" || g === "falls" || g === "signal"
              ? `${days.length} answered ${days.length === 1 ? "day" : "days"}${counted ? ` · ${counted} counted` : ""}`
              : days.length === 1
                ? "The day"
                : `${days.length} days`}
          </p>
          <ul role="list" className="cg-ev-days">
            {days.slice(0, 60).map((d) => (
              <DayRow key={d.date} date={d.date} counted={d.counted && (g === "count" || g === "falls" || g === "signal")} />
            ))}
          </ul>
        </div>
      )}
      <div className="cg-ev-item__meta">
        {link && (
          <a className="cg-ev-item__link" href={href(link.to, link.params)}>
            <span>{link.label}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        )}
        {/* The internal record id stays available for anyone tracing a citation, but out of the way. */}
        <details className="cg-ev-item__idbox">
          <summary>Record ID</summary>
          <code className="cg-ev-item__id">{id}</code>
        </details>
      </div>
    </section>
  );
}

export interface EvidenceDrawerProps {
  /** The ids to show (null = closed). */
  ids: string[] | null;
  focus?: string | null;
  lookup: Map<string, EvidenceItem>;
  onClose: () => void;
  /** The sentence these records support (shown under the title). */
  claim?: string | null;
}

/** Drawer listing the records behind one sentence. */
export function EvidenceDrawer({ ids, focus, lookup, onClose, claim }: EvidenceDrawerProps) {
  const ordered = useMemo(() => {
    if (!ids) return [];
    const list = [...new Set(ids)];
    if (focus && list.includes(focus)) return [focus, ...list.filter((x) => x !== focus)];
    return list;
  }, [ids, focus]);
  return (
    <Drawer
      open={ids !== null}
      onClose={onClose}
      size="lg"
      eyebrow="The records"
      title={ordered.length === 1 ? "The record behind this sentence" : `The ${ordered.length} records behind this sentence`}
      description={claim ? <span className="cg-ev-claim">{quoted(claim)}</span> : "Each sentence restates these records; numbers are counted by code, never by the AI."}
    >
      <div className="cg-ev-list" tabIndex={0} role="region" aria-label="Records">
        {ordered.map((id) => (
          <ItemBlock key={id} id={id} item={lookup.get(id) as BriefEvidenceItem | undefined} focused={id === focus && ordered.length > 1} />
        ))}
      </div>
    </Drawer>
  );
}
