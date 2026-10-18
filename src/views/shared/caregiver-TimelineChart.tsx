// Symptom timeline chart for the caregiver views (Overview + Symptoms & timeline).
//
// Layout: one shared x-scale (one column per calendar day) across three stacked layers
//   1. medication markers  — labelled vertical lines ("Lorazepam started"), placed at the day boundary
//   2. symptom strips      — one row per yes/no diary item; a coloured SHAPE on days it was recorded,
//                            a small neutral dot on "no" days, blank when unanswered, hatched when no check-in
//   3. energy & sleep      — two 1–5 rating lines (Recharts), gaps where a day was not answered
// A transparent column of day buttons sits on top: hover/focus shows that day's answers (crosshair + tooltip),
// Left/Right move between days, Enter opens the day (onDayClick). "View as table" swaps in an accessible table.
// Every value is read from the record; nothing here is hard-coded demo data.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import type { CheckIn, ISODate, MedEvent, Medication, MetricKey } from "../../model/types";
import { addDays, dateRange, daysBetween, formatShort, formatWeekday } from "../../model/dates";
import { latestCheckInPerDate } from "../../engine/timeline/metrics";
import { Button, SERIES_SHAPE, SERIES_VAR, TimelineDot, cx, readToken, type MarkerShape } from "../../ui";
import "./caregiver-timeline-chart.css";

// ---------------------------------------------------------------------------
// Rows and vocabulary

export type StripRowKey = "dizziness" | "drowsiness" | "confusion" | "falls" | "swelling";

export interface StripRow {
  key: StripRowKey;
  label: string;
  /** Narrow-screen label. */
  short: string;
  /** Metrics shown in the row (falls combines fall + near-fall, each with its own shape). */
  metrics: MetricKey[];
}

/** Yes/no diary rows, in the order a clinician reads them. */
export const STRIP_ROWS: StripRow[] = [
  { key: "dizziness", label: "Dizziness", short: "Dizzy", metrics: ["dizziness"] },
  { key: "drowsiness", label: "Drowsiness", short: "Drowsy", metrics: ["drowsiness"] },
  { key: "confusion", label: "Confusion", short: "Foggy", metrics: ["confusion"] },
  { key: "falls", label: "Fall / near-fall", short: "Falls", metrics: ["fall", "nearFall"] },
  { key: "swelling", label: "Ankle swelling", short: "Swelling", metrics: ["swelling"] },
];


const SEVERITY: Record<1 | 2 | 3, string> = { 1: "mild", 2: "moderate", 3: "severe" };

/** Short medicine name for markers: "Lorazepam (Ativan)" → "Lorazepam". */
export function shortMedName(med: Pick<Medication, "name"> | undefined): string {
  const name = (med?.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return "A medicine";
  const short = name.replace(/\s*\(.*?\)\s*/g, " ").trim() || name;
  return short.length > 28 ? `${short.slice(0, 27).trimEnd()}…` : short;
}

// ---------------------------------------------------------------------------
// Medication markers

export interface ChartMedEvent {
  key: string;
  medicationId: string;
  kind: "started" | "stopped" | "dose_changed";
  /** Calendar date of the change (for a stop: the last day taken). */
  date: ISODate;
  /** Day boundary (0…n) the marker is drawn at, relative to `from`. */
  boundary: number;
  label: string;
}

/**
 * Medication starts, stops and dose changes that fall inside [from, to], as chart markers.
 * Starts and stops come from the medication record (the source of truth); dose changes from the event log.
 */
export function chartMedEvents(meds: Medication[], medEvents: MedEvent[], from: ISODate, to: ISODate): ChartMedEvent[] {
  const out: ChartMedEvent[] = [];
  const inRange = (d: ISODate | null | undefined): d is ISODate => !!d && d >= from && d <= to;
  for (const m of meds) {
    const name = shortMedName(m);
    if (inRange(m.startDate)) {
      out.push({
        key: `${m.id}:started:${m.startDate}`,
        medicationId: m.id,
        kind: "started",
        date: m.startDate,
        boundary: daysBetween(from, m.startDate),
        label: `${name} started`,
      });
    }
    // endDate is the last day taken: the marker sits at the end of that day.
    if (inRange(m.endDate) && m.endDate < to) {
      out.push({
        key: `${m.id}:stopped:${m.endDate}`,
        medicationId: m.id,
        kind: "stopped",
        date: m.endDate,
        boundary: daysBetween(from, m.endDate) + 1,
        label: `${name} stopped`,
      });
    }
  }
  for (const e of medEvents) {
    if (e.kind !== "dose_changed" || !inRange(e.date)) continue;
    const med = meds.find((m) => m.id === e.medicationId);
    out.push({
      key: `${e.id}`,
      medicationId: e.medicationId,
      kind: "dose_changed",
      date: e.date,
      boundary: daysBetween(from, e.date),
      label: `${shortMedName(med)} dose changed`,
    });
  }
  return out.sort((a, b) => a.boundary - b.boundary || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Day reading helpers (shared with the table and tooltip)

export type CellState = "yes" | "no" | "unanswered" | "missing";

/** State of one strip row on one day, and the metric to draw when recorded. */
export function cellFor(c: CheckIn | undefined, row: StripRow): { state: CellState; metric: MetricKey } {
  if (!c) return { state: "missing", metric: row.metrics[0] };
  if (row.key === "falls") {
    const { fall, nearFall } = c.answers;
    if (fall === true) return { state: "yes", metric: "fall" };
    if (nearFall === true) return { state: "yes", metric: "nearFall" };
    if (fall === false || nearFall === false) return { state: "no", metric: "fall" };
    return { state: "unanswered", metric: "fall" };
  }
  const v = c.answers[row.metrics[0] as "dizziness" | "drowsiness" | "confusion" | "swelling"];
  return { state: v === true ? "yes" : v === false ? "no" : "unanswered", metric: row.metrics[0] };
}

/** One row value in words, for the tooltip, the table and screen readers. */
export function cellWords(c: CheckIn | undefined, row: StripRow): string {
  if (!c) return "No check-in";
  if (row.key === "falls") {
    const { fall, nearFall } = c.answers;
    if (fall === true && nearFall === true) return "Fall and near-fall";
    if (fall === true) return "Fall";
    if (nearFall === true) return "Near-fall";
    if (fall === null && nearFall === null) return "Not answered";
    return "No";
  }
  const { state } = cellFor(c, row);
  if (state === "yes") {
    const sev = row.key === "dizziness" ? c.answers.dizzinessSeverity : null;
    return sev ? `Yes (${SEVERITY[sev]})` : "Yes";
  }
  return state === "no" ? "No" : "Not answered";
}

function ratingWords(v: number | null): string {
  return v === null ? "Not answered" : `${v} of 5`;
}

/** Whole-day summary for screen readers: "Thu, Oct 6: dizziness (severe), fall; energy 1 of 5, sleep 3 of 5." */
export function daySummary(date: ISODate, c: CheckIn | undefined): string {
  const head = formatWeekday(date);
  if (!c) return `${head}: no check-in.`;
  const yes = STRIP_ROWS.map((r) => ({ r, w: cellWords(c, r) }))
    .filter(({ w }) => w !== "No" && w !== "Not answered")
    .map(({ r, w }) => (r.key === "falls" ? w.toLowerCase() : `${r.label.toLowerCase()}${w.startsWith("Yes (") ? ` ${w.slice(4)}` : ""}`));
  const recorded = yes.length ? `recorded ${yes.join(", ")}` : "none of the symptoms recorded";
  return `${head}: ${recorded}; energy ${ratingWords(c.answers.energy)}, sleep ${ratingWords(c.answers.sleep)}.`;
}

// ---------------------------------------------------------------------------
// Theme-aware colours for Recharts (SVG attributes need literal colours)

function useSeriesColors(): { energy: string; sleep: string; grid: string; surface: string } {
  const read = () => ({
    energy: readToken("--series-6", null, "#3b7d23"),
    sleep: readToken("--series-4", null, "#c98a00"),
    grid: readToken("--chart-grid", null, "#e6e3da"),
    surface: readToken("--surface", null, "#fffdf9"),
  });
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);
  return colors;
}

/**
 * Width (border box) of an element, kept current with a ResizeObserver. Returns a callback ref, so the observer
 * follows the element when it is re-mounted (e.g. after switching from the table view back to the chart).
 */
function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number, T | null] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      const w = e?.borderBoxSize?.[0]?.inlineSize ?? e?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width, el];
}

// ---------------------------------------------------------------------------
// Component

export interface ChartWindowHighlight {
  before: { from: ISODate; to: ISODate };
  after: { from: ISODate; to: ISODate };
}

export interface TimelineChartProps {
  checkIns: CheckIn[];
  meds: Medication[];
  medEvents?: MedEvent[];
  from: ISODate;
  to: ISODate;
  /** Accessible name of the chart, e.g. "Margaret's diary, Sep 12 to Oct 11". */
  label: string;
  /** Shade the before/after windows of one medication change. */
  highlight?: ChartWindowHighlight | null;
  /** Medication whose markers are emphasised (others are drawn quieter). */
  focusMedId?: string | null;
  /** Open a day (e.g. the records drawer). Without it, day columns only show the tooltip. */
  onDayClick?: (date: ISODate) => void;
  size?: "compact" | "full";
  className?: string;
}

interface LaidOutMarker extends ChartMedEvent {
  lane: number;
  /** start = label to the right of the line, end = to the left, free = clamped inside the plot (offset in px). */
  anchor: "start" | "end" | "free";
  offset: number;
  /** False when the plot is too narrow for the date suffix. */
  showDate: boolean;
}

/** Estimated rendered width of a marker label (0.72rem semibold text plus pill padding). */
function markerLabelWidth(label: string, withDate: boolean): number {
  return (label.length + (withDate ? 9 : 0)) * 6.9 + 20;
}

/**
 * Assign marker labels to lanes so they never overlap (estimated label width; at most 3 lanes).
 *
 * `visibleFrom` is the first plot x (px) that is visible when the chart first shows: on a narrow screen the plot
 * scrolls sideways and opens on the most recent days, so everything left of it sits under the sticky row labels.
 * A label is kept inside [visibleFrom, plotWidth]: beside its line (right, then left) with the date, then without
 * the date, and only otherwise clamped ("free") inside the visible part of the plot.
 */
export function layoutMarkers(events: ChartMedEvent[], n: number, plotWidth: number, visibleFrom = 0): LaidOutMarker[] {
  const laneEnds: number[] = [];
  const minX = Math.max(0, Math.min(visibleFrom, plotWidth));
  const visible = plotWidth - minX;
  return events.map((e) => {
    const x = (e.boundary / n) * plotWidth;
    const dated = markerLabelWidth(e.label, true);
    const plain = markerLabelWidth(e.label, false);
    const datedFits = dated <= visible * 0.9;
    const options: { anchor: "start" | "end"; w: number; showDate: boolean }[] = [
      ...(datedFits ? [{ anchor: "start" as const, w: dated, showDate: true }, { anchor: "end" as const, w: dated, showDate: true }] : []),
      { anchor: "start", w: plain, showDate: false },
      { anchor: "end", w: plain, showDate: false },
    ];
    const fit = options.find((o) => (o.anchor === "start" ? x >= minX && x + o.w <= plotWidth : x <= plotWidth && x - o.w >= minX));
    const showDate = fit ? fit.showDate : datedFits;
    const w = fit ? fit.w : showDate ? dated : plain;
    const anchor: LaidOutMarker["anchor"] = fit ? fit.anchor : "free";
    const left = anchor === "start" ? x : anchor === "end" ? x - w : Math.max(minX, Math.min(x - w / 2, plotWidth - w));
    const right = left + w;
    let lane = laneEnds.findIndex((end) => left > end + 6);
    if (lane === -1) lane = laneEnds.length < 3 ? laneEnds.length : laneEnds.length - 1;
    laneEnds[lane] = right;
    return { ...e, lane, anchor, offset: left, showDate };
  });
}

/**
 * How each x-axis date label is aligned so none is cut off by the sticky row labels: a tick whose centred label
 * would cross `visibleFrom` is left-aligned at its day (centre still visible) or right-aligned (centre hidden, so
 * it sits wholly under the row labels until the plot is scrolled).
 */
export function tickAlign(i: number, n: number, plotWidth: number, visibleFrom: number, text: string): "center" | "start" | "end" {
  if (plotWidth <= 0 || n <= 0) return "center";
  const centre = ((i + 0.5) / n) * plotWidth;
  const half = text.length * 3.4 + 2;
  if (centre - half >= visibleFrom) return "center";
  return centre >= visibleFrom ? "start" : "end";
}

/** The day tooltip's width (15.5rem at the default 16px root size); tipWidthFor narrows it on a small screen. */
export const TIP_WIDTH = 248;

/** Tooltip width for a scroll box `viewport` px wide: never wider than the box, with 4px clear on each side. */
export function tipWidthFor(viewport: number): number {
  return viewport > 0 ? Math.min(TIP_WIDTH, viewport - 8) : TIP_WIDTH;
}

/**
 * Left edge (plot px) of the day tooltip. It sits beside the hovered column, 10px away, on the preferred side, then
 * on the other side, and only otherwise is clamped over the column. It always stays inside [visibleFrom, visibleTo],
 * the stretch of plot x that is on screen. That stretch includes the strip under the sticky row labels (negative x
 * when the plot is not scrolled), because the tooltip is drawn above them (z-index in caregiver-timeline-chart.css).
 */
export function placeTip(o: { colLeft: number; colRight: number; width: number; visibleFrom: number; visibleTo: number; prefer: "start" | "end" }): number {
  const gap = 10;
  const right = o.colRight + gap;
  const left = o.colLeft - gap - o.width;
  const rightFits = right + o.width <= o.visibleTo;
  const leftFits = left >= o.visibleFrom;
  if (o.prefer === "start" ? rightFits : !leftFits && rightFits) return right;
  if (leftFits) return left;
  return Math.max(o.visibleFrom, Math.min(right, o.visibleTo - o.width));
}

/** Symptom strips + rating lines + medication markers on one shared day axis. */
export function TimelineChart({
  checkIns,
  meds,
  medEvents = [],
  from,
  to,
  label,
  highlight,
  focusMedId,
  onDayClick,
  size = "compact",
  className,
}: TimelineChartProps) {
  const id = useId();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [active, setActive] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [plotRef, plotWidth] = useElementWidth<HTMLDivElement>();
  const [scrollRef, scrollWidth, scrollEl] = useElementWidth<HTMLDivElement>();
  const [labelsRef, labelsWidth] = useElementWidth<HTMLDivElement>();
  // How far the plot is scrolled sideways (narrow screens), so the tooltip can stay on screen.
  const [scrollLeft, setScrollLeft] = useState(0);
  const colors = useSeriesColors();
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const days = useMemo(() => (from <= to ? dateRange(from, to) : []), [from, to]);
  const n = days.length;
  const byDate = useMemo(() => new Map(latestCheckInPerDate(checkIns).map((c) => [c.date, c])), [checkIns]);
  const markers = useMemo(() => chartMedEvents(meds, medEvents, from, to), [meds, medEvents, from, to]);
  // The plot opens scrolled to its most recent days; this is the first plot x not hidden under the row labels.
  // (The scroll box has 2px padding each side for focus rings; 6px keeps a label clear of the row labels' edge.)
  const hiddenPx = plotWidth > 0 && scrollWidth > 0 && labelsWidth > 0 ? plotWidth - (scrollWidth - 4 - labelsWidth) : 0;
  const visibleFrom = hiddenPx > 0.5 ? hiddenPx + 6 : 0;
  const laid = useMemo(() => layoutMarkers(markers, Math.max(n, 1), plotWidth || 600, visibleFrom), [markers, n, plotWidth, visibleFrom]);
  const lanes = laid.length ? Math.max(...laid.map((m) => m.lane)) + 1 : 0;

  const lineData = useMemo(
    () =>
      days.map((d, i) => {
        const c = byDate.get(d);
        return { i, energy: c?.answers.energy ?? null, sleep: c?.answers.sleep ?? null };
      }),
    [days, byDate],
  );
  const anyRatings = lineData.some((r) => r.energy !== null || r.sleep !== null);

  // X-axis ticks: about six evenly spaced dates, always including the last day.
  const ticks = useMemo(() => {
    if (n === 0) return [] as number[];
    const room = plotWidth > 0 ? Math.max(2, Math.floor(plotWidth / 64)) : 6;
    const step = Math.max(1, Math.ceil(n / Math.min(room, size === "full" ? 9 : 7)));
    const out: number[] = [];
    for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
    return out;
  }, [n, size, plotWidth]);

  // On narrow screens the plot scrolls sideways: start at the most recent days, where the story usually is.
  useLayoutEffect(() => {
    const el = scrollEl;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
    setScrollLeft(el?.scrollLeft ?? 0);
  }, [from, to, view, scrollEl]);

  if (n === 0) return null;

  const colW = plotWidth > 0 ? plotWidth / n : 14;
  const dot = Math.max(5, Math.min(13, Math.floor(colW * 0.62)));
  const noDot = Math.max(3, Math.min(5, Math.floor(colW * 0.28)));
  const lineHeight = size === "full" ? 150 : 112;
  const pct = (i: number) => `${(i / n) * 100}%`;
  const tabStop = cursor ?? n - 1;

  const focusDay = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    setCursor(next);
    setActive(next);
    btnRefs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1, PageUp: i - 7, PageDown: i + 7 };
    if (e.key in map) {
      e.preventDefault();
      focusDay(map[e.key]);
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const activeDate = active !== null ? days[active] : null;
  const activeCheckIn = activeDate ? byDate.get(activeDate) : undefined;
  // The tooltip sits beside the hovered column (never over it when there is room): to its right on the left 60% of
  // the part on screen, else to its left, and clamped inside what is on screen. In plot px, the scroll box shows
  // x = scrollLeft − labels width (the sticky labels, which the tooltip covers) to scrollLeft + box − labels width.
  const viewport = Math.max(0, scrollWidth - 4); // the scroll box has 2px padding each side
  const tipFrom = scrollLeft - labelsWidth;
  const tipTo = viewport > labelsWidth ? Math.min(plotWidth, scrollLeft + viewport - labelsWidth) : plotWidth;
  const tipWidth = tipWidthFor(viewport);
  const plotShownFrom = Math.max(0, scrollLeft); // first plot x not under the row labels
  const tipLeft =
    active !== null && plotWidth > 0
      ? placeTip({
          colLeft: (active / n) * plotWidth,
          colRight: ((active + 1) / n) * plotWidth,
          width: tipWidth,
          visibleFrom: tipFrom,
          visibleTo: tipTo,
          prefer: ((active + 0.5) / n) * plotWidth - plotShownFrom > 0.6 * (tipTo - plotShownFrom) ? "end" : "start",
        })
      : 0;

  const style = {
    "--tlc-days": n,
    "--tlc-dot": `${dot}px`,
    "--tlc-no-dot": `${noDot}px`,
    "--tlc-lanes": lanes,
    "--tlc-plot-min": `${n * (size === "full" ? 9 : 7)}px`,
    "--tlc-lines-h": `${lineHeight}px`,
  } as CSSProperties;

  return (
    <div className={cx("cg-tlc", `cg-tlc--${size}`, className)} style={style}>
      <div className="cg-tlc__toolbar">
        <ul className="cg-tlc__legend" role="list" aria-label="Legend">
          {(["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"] as MetricKey[]).map((m) => (
            <li key={m}>
              <TimelineDot metric={m} size={11} label={LEGEND_LABEL[m]} />
            </li>
          ))}
          <li>
            <TimelineDot metric="energy" shape="line" size={11} label="Energy (1–5)" />
          </li>
          <li>
            <TimelineDot metric="sleep" shape="dash" size={11} label="Sleep (1–5)" />
          </li>
          <li className="cg-tlc__legend-key">
            <span className="cg-tlc__key-no" aria-hidden="true" /> No
          </li>
          <li className="cg-tlc__legend-key">
            <span className="cg-tlc__key-missing" aria-hidden="true" /> No check-in
          </li>
        </ul>
        <Button
          size="sm"
          variant="ghost"
          iconLeft={view === "chart" ? <Table2 size={16} aria-hidden="true" /> : <BarChart3 size={16} aria-hidden="true" />}
          aria-pressed={view === "table"}
          onClick={() => setView(view === "chart" ? "table" : "chart")}
        >
          {view === "chart" ? "View as table" : "View as chart"}
        </Button>
      </div>

      {view === "table" ? (
        <ChartTable days={days} byDate={byDate} markers={markers} label={label} onDayClick={onDayClick} />
      ) : (
        <div className="cg-tlc__scroll" ref={scrollRef} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
          <figure className="cg-tlc__figure" aria-labelledby={`${id}-cap`}>
            <figcaption id={`${id}-cap`} className="ui-visually-hidden">
              {label}. One column per day. Use the day buttons or "View as table" for the values.
            </figcaption>
            <div className="cg-tlc__grid">
              {/* ---- Labels column ---- */}
              <div className="cg-tlc__labels" aria-hidden="true" ref={labelsRef}>
                {/* Names the marker lane, on the same line as the first marker (lane 0) so it doesn't read as a heading
                    for the symptom rows below. The --lane modifier (caregiver-timeline-chart.css) switches the shared
                    all-caps label to sentence case and centres the text on lane 0. */}
                <div className="cg-tlc__label-markers cg-tlc__label-markers--lane">
                  {lanes > 0 && (
                    <span className="cg-tlc__label-lane-text">
                      <span className="cg-tlc__label-full">Medicine changes</span>
                      <span className="cg-tlc__label-short">Changes</span>
                    </span>
                  )}
                </div>
                {STRIP_ROWS.map((r) => (
                  <div key={r.key} className="cg-tlc__label-row">
                    {r.key === "falls" ? (
                      <span className="cg-tlc__label-shapes">
                        <TimelineDot metric="fall" size={9} />
                        <TimelineDot metric="nearFall" size={9} />
                      </span>
                    ) : (
                      <TimelineDot metric={r.metrics[0]} size={9} />
                    )}
                    <span className="cg-tlc__label-full">{r.label}</span>
                    <span className="cg-tlc__label-short">{r.short}</span>
                  </div>
                ))}
                <div className="cg-tlc__label-lines">
                  <span className="cg-tlc__label-lines-title">Energy &amp; sleep</span>
                  <span className="cg-tlc__label-tick cg-tlc__label-tick--top ui-num">
                    5<span className="cg-tlc__label-full"> · great</span>
                  </span>
                  <span className="cg-tlc__label-tick cg-tlc__label-tick--bottom ui-num">
                    1<span className="cg-tlc__label-full"> · very low</span>
                  </span>
                </div>
                <div className="cg-tlc__label-axis" />
              </div>

              {/* ---- Plot column ---- */}
              <div className="cg-tlc__plot" ref={plotRef}>
                {/* Window shading + no-check-in hatching + crosshair live behind the marks */}
                <div className="cg-tlc__bg" aria-hidden="true">
                  {highlight && <WindowBand days={days} w={highlight.before} kind="before" />}
                  {highlight && <WindowBand days={days} w={highlight.after} kind="after" />}
                  {days.map((d, i) =>
                    byDate.has(d) ? null : <span key={d} className="cg-tlc__missing" style={{ left: pct(i), width: pct(1) }} />,
                  )}
                  {active !== null && <span className="cg-tlc__crosshair" style={{ left: pct(active), width: pct(1) }} />}
                </div>

                <div className="cg-tlc__markers" aria-hidden="true">
                  {laid.map((m) => (
                    <span
                      key={m.key}
                      className={cx(
                        "cg-tlc__marker-label",
                        `cg-tlc__marker-label--${m.kind}`,
                        `is-${m.anchor}`,
                        focusMedId && m.medicationId !== focusMedId && "is-quiet",
                      )}
                      style={{ left: m.anchor === "free" ? `${m.offset}px` : pct(m.boundary), "--lane": m.lane } as CSSProperties}
                    >
                      {m.label}
                      {m.showDate && <span className="cg-tlc__marker-date"> · {formatShort(m.date)}</span>}
                    </span>
                  ))}
                </div>

                {STRIP_ROWS.map((r) => (
                  <div key={r.key} className="cg-tlc__row" aria-hidden="true">
                    {days.map((d) => {
                      const { state, metric } = cellFor(byDate.get(d), r);
                      return (
                        <span key={d} className={cx("cg-tlc__cell", `is-${state}`)}>
                          {state === "yes" && <CellMark metric={metric} />}
                        </span>
                      );
                    })}
                  </div>
                ))}

                <div className="cg-tlc__lines" aria-hidden="true">
                  {plotWidth > 0 && anyRatings && (
                    <LineChart
                      width={Math.max(1, plotWidth)}
                      height={lineHeight}
                      data={lineData}
                      margin={{ top: 10, right: 0, bottom: 10, left: 0 }}
                      accessibilityLayer={false}
                    >
                      <XAxis type="number" dataKey="i" domain={[-0.5, n - 0.5]} hide allowDataOverflow />
                      <YAxis type="number" domain={[1, 5]} hide width={0} />
                      {[1, 3, 5].map((y) => (
                        <ReferenceLine key={y} y={y} stroke={colors.grid} strokeDasharray={y === 3 ? "2 4" : undefined} ifOverflow="extendDomain" />
                      ))}
                      <Line
                        type="linear"
                        dataKey="energy"
                        stroke={colors.energy}
                        strokeWidth={2}
                        connectNulls={false}
                        isAnimationActive={false}
                        dot={{ r: Math.min(3.5, dot / 3), fill: colors.energy, stroke: colors.surface, strokeWidth: 1.5 }}
                        activeDot={false}
                      />
                      <Line
                        type="linear"
                        dataKey="sleep"
                        stroke={colors.sleep}
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        connectNulls={false}
                        isAnimationActive={false}
                        dot={<SquareDot fill={colors.sleep} stroke={colors.surface} size={Math.min(6.5, dot / 1.7)} />}
                        activeDot={false}
                      />
                    </LineChart>
                  )}
                  {!anyRatings && <p className="cg-tlc__no-ratings">No energy or sleep ratings in this period.</p>}
                </div>

                <div className="cg-tlc__axis" aria-hidden="true">
                  {ticks.map((i) => {
                    const text = formatShort(days[i]);
                    const align = i === n - 1 ? "center" : tickAlign(i, n, plotWidth, Math.max(0, hiddenPx), text);
                    return (
                      <span
                        key={i}
                        className={cx("cg-tlc__tick", i === n - 1 && "is-last", align === "start" && "is-start", align === "end" && "is-end")}
                        style={{ left: `${((i + 0.5) / n) * 100}%` }}
                      >
                        {text}
                      </span>
                    );
                  })}
                </div>

                {/* Medication marker lines span every layer */}
                <div className="cg-tlc__marker-lines" aria-hidden="true">
                  {markers.map((m) => (
                    <span
                      key={m.key}
                      className={cx("cg-tlc__marker-line", `cg-tlc__marker-line--${m.kind}`, focusMedId && m.medicationId !== focusMedId && "is-quiet")}
                      style={{ left: pct(m.boundary) }}
                    />
                  ))}
                </div>

                {/* Interactive day columns */}
                <div className="cg-tlc__hits" role="group" aria-label={`${label}: days. Use the arrow keys to move between days.`}>
                  {days.map((d, i) => (
                    <button
                      key={d}
                      ref={(el) => {
                        btnRefs.current[i] = el;
                      }}
                      type="button"
                      className="cg-tlc__hit"
                      style={{ left: pct(i), width: pct(1) }}
                      tabIndex={i === tabStop ? 0 : -1}
                      aria-label={`${daySummary(d, byDate.get(d))}${onDayClick && byDate.has(d) ? " Open the day's records." : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseLeave={() => setActive((a) => (a === i ? null : a))}
                      onFocus={() => {
                        setCursor(i);
                        setActive(i);
                      }}
                      onBlur={() => setActive((a) => (a === i ? null : a))}
                      onKeyDown={(e) => onKey(e, i)}
                      onClick={() => {
                        if (onDayClick && byDate.has(d)) onDayClick(d);
                        else setActive(i);
                      }}
                    />
                  ))}
                </div>

                {activeDate && (
                  <div className="cg-tlc__tip" style={{ left: `${tipLeft}px`, width: `${tipWidth}px` }} aria-hidden="true">
                    <DayTip date={activeDate} c={activeCheckIn} canOpen={!!onDayClick && !!activeCheckIn} markers={markers.filter((m) => m.date === activeDate)} />
                  </div>
                )}
              </div>
            </div>
          </figure>
        </div>
      )}
    </div>
  );
}

const LEGEND_LABEL: Partial<Record<MetricKey, string>> = {
  dizziness: "Dizziness",
  drowsiness: "Drowsiness",
  confusion: "Confusion",
  fall: "Fall",
  nearFall: "Near-fall",
  swelling: "Ankle swelling",
};

function CellMark({ metric }: { metric: MetricKey }) {
  const shape: MarkerShape = SERIES_SHAPE[metric];
  return <span className={cx("ui-dot", `ui-dot--${shape}`, "cg-tlc__mark")} style={{ "--dot-color": SERIES_VAR[metric] } as CSSProperties} />;
}

function SquareDot(props: { cx?: number; cy?: number; fill: string; stroke: string; size: number; value?: number | null }) {
  const { cx: x, cy: y, fill, stroke, size, value } = props;
  if (x == null || y == null || value == null) return <g />;
  return <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={1} fill={fill} stroke={stroke} strokeWidth={1.5} />;
}

function WindowBand({ days, w, kind }: { days: ISODate[]; w: { from: ISODate; to: ISODate }; kind: "before" | "after" }) {
  const n = days.length;
  const first = days[0];
  const last = days[n - 1];
  if (w.to < first || w.from > last) return null;
  const a = Math.max(0, daysBetween(first, w.from));
  const b = Math.min(n - 1, daysBetween(first, w.to));
  return (
    <span className={cx("cg-tlc__band", `cg-tlc__band--${kind}`)} style={{ left: `${(a / n) * 100}%`, width: `${((b - a + 1) / n) * 100}%` }}>
      <span className="cg-tlc__band-label">{kind === "before" ? "Before" : "After"}</span>
    </span>
  );
}

function DayTip({ date, c, canOpen, markers }: { date: ISODate; c: CheckIn | undefined; canOpen: boolean; markers: ChartMedEvent[] }) {
  return (
    <div className="cg-tlc__tip-card">
      <p className="cg-tlc__tip-date">{formatWeekday(date)}</p>
      {markers.map((m) => (
        <p key={m.key} className="cg-tlc__tip-med">
          {m.label}
        </p>
      ))}
      {!c ? (
        <p className="cg-tlc__tip-empty">No check-in this day</p>
      ) : (
        <>
          <ul className="cg-tlc__tip-list" role="list">
            {STRIP_ROWS.filter((r) => cellFor(c, r).state === "yes").map((r) => (
              <li key={r.key} className="is-yes">
                <span className="cg-tlc__tip-key">
                  <TimelineDot metric={cellFor(c, r).metric} size={9} />
                  {r.label}
                </span>
                <span>{cellWords(c, r)}</span>
              </li>
            ))}
            <li>
              <span className="cg-tlc__tip-key">
                <TimelineDot metric="energy" shape="line" size={9} />
                Energy · sleep
              </span>
              <span className="ui-num">
                {c.answers.energy ?? "–"} · {c.answers.sleep ?? "–"} of 5
              </span>
            </li>
          </ul>
          {tipList(c, "no") && <p className="cg-tlc__tip-rest">No: {tipList(c, "no")}</p>}
          {tipList(c, "unanswered") && <p className="cg-tlc__tip-rest">Not answered: {tipList(c, "unanswered")}</p>}
          {c.story.trim() && <p className="cg-tlc__tip-story ui-quote">“{excerptText(c.story, 80)}”</p>}
          {canOpen && <p className="cg-tlc__tip-hint">Click to open the day’s records</p>}
        </>
      )}
    </div>
  );
}

/** Lower-case list of the rows in a given state ("confusion, ankle swelling"), or "" when none. */
function tipList(c: CheckIn, state: CellState): string {
  return STRIP_ROWS.filter((r) => cellFor(c, r).state === state)
    .map((r) => r.label.toLowerCase())
    .join(", ");
}

/** At most `max` characters, cut at a word boundary. */
export function excerptText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.—-]+$/, "")}…`;
}

function ChartTable({
  days,
  byDate,
  markers,
  label,
  onDayClick,
}: {
  days: ISODate[];
  byDate: Map<ISODate, CheckIn>;
  markers: ChartMedEvent[];
  label: string;
  onDayClick?: (date: ISODate) => void;
}) {
  const rows = [...days].reverse();
  return (
    <div className="ui-table-wrap cg-tlc__table-wrap">
      <table className="ui-table cg-tlc__table">
        <caption>{label} — newest first</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {STRIP_ROWS.map((r) => (
              <th key={r.key} scope="col">
                {r.label}
              </th>
            ))}
            <th scope="col">Energy</th>
            <th scope="col">Sleep</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const c = byDate.get(d);
            const dayMarkers = markers.filter((m) => m.date === d);
            return (
              <tr key={d} className={cx(!c && "is-missing")}>
                <th scope="row">
                  {onDayClick && c ? (
                    <button type="button" className="cg-tlc__table-day" onClick={() => onDayClick(d)}>
                      {formatWeekday(d)}
                    </button>
                  ) : (
                    formatWeekday(d)
                  )}
                  {dayMarkers.map((m) => (
                    <span key={m.key} className="cg-tlc__table-med">
                      {m.label}
                    </span>
                  ))}
                </th>
                {c ? (
                  <>
                    {STRIP_ROWS.map((r) => {
                      const w = cellWords(c, r);
                      return (
                        <td key={r.key} className={cx(cellFor(c, r).state === "yes" && "is-yes")}>
                          {w}
                        </td>
                      );
                    })}
                    <td className="ui-num">{ratingWords(c.answers.energy)}</td>
                    <td className="ui-num">{ratingWords(c.answers.sleep)}</td>
                  </>
                ) : (
                  <td colSpan={STRIP_ROWS.length + 2} className="cg-tlc__table-none">
                    No check-in
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The `from` date for a period of `days` days ending on `to` (inclusive). */
export function periodStart(to: ISODate, days: number): ISODate {
  return addDays(to, -(Math.max(1, days) - 1));
}
