// Symptoms & timeline (/c/timeline, SPEC-UI "Symptoms & timeline").
//
//   1. Medication change selector — every start/stop the engine looked at (default: the medicine with the strongest
//      signal; ?med=<id>[&event=started|stopped] selects one).
//   2. Before/after comparison for that change — every diary item with counts AND denominators and the size of the
//      difference in the Overview's words ("Large difference"; "maybe a bad stretch" under it when the runs
//      check does not back it), ONE caveat line (not what caused it, plus one short chance sentence), the low-power
//      note when nothing was flagged, other medicine changes in the same weeks, coverage of both windows, falls listed
//      by date, and the exact reason when something could not be compared. The statistics behind each row (test,
//      p-value, runs-check p), the order of the size words, the falls note and the method sit in "How reliable is
//      this?" (closed by default): moved there, never deleted.
//   3. The full timeline chart (period ?days=14|30|60|90) with the compared windows shaded.
//   4. Every check-in in the period; a row (or ?day=YYYY-MM-DD) opens the day's full record with provenance and history.
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeftRight, CalendarDays, ChevronRight, Footprints, GitCompareArrows, Info, LineChart as LineChartIcon, NotebookPen } from "lucide-react";
import type { CheckIn, ISODate, Medication, MedTimeline, MetricKey } from "../../model/types";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { setParams, useRoute } from "../../app/router";
import { daysBetween, formatLong, formatShort, formatWeekday, isValidDate } from "../../model/dates";
import { getMetric, latestCheckInPerDate, metricValue } from "../../engine/timeline/metrics";
import { analyzeEvent, type EventAnalysis, type MetricComparison } from "../../engine/timeline/signals";
import { eventsForMed } from "../../engine/timeline/windows";
import { LOW_POWER_NOTE, SENTINEL_NOTE, TIMELINE_METHOD_SUMMARY, TIMELINE_RULES } from "../../engine/timeline/rules";
import { knownEffect } from "../../kb";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  EvidenceLink,
  PageHeader,
  Segmented,
  SERIES_VAR,
  TimelineDot,
  cx,
} from "../../ui";
import { TimelineChart, excerptText, periodStart } from "../shared/caregiver-TimelineChart";
import {
  CHANCE_SHORT,
  RELIABILITY_TITLE,
  RUNS_QUALIFIER_NOTE,
  SIZE_ORDER_KEY,
  fallsComparison,
  isSentinelMetric,
  strengthTone,
  unflaggedVerdict,
} from "../shared/caregiver-insights";
import { ReliabilityDisclosure, type ReliabilityTest } from "../shared/caregiver-Reliability";
import { SizeWord } from "../shared/caregiver-SizeWord";
import { DayRecordsDrawer, RecordsDrawer, recordedChips, rangeText, type RecordGroup } from "../shared/caregiver-Records";
import "./timeline.css";

const PERIODS = [14, 30, 60, 90] as const;
/** Check-ins listed before "Show all". */
const DAY_LIST_INITIAL = 14;
type Period = (typeof PERIODS)[number];

/** Spec wording for the caveat that travels with every before/after comparison. */
const CAVEAT = "Shows a change in what was recorded, not what caused it.";

const STATUS_TEXT: Record<MedTimeline["status"], string> = {
  ok: "Compared",
  insufficient: "Not enough entries",
  too_recent: "Too recent to compare",
  outside_range: "More than 180 days ago",
};

function eventKey(e: Pick<MedTimeline, "medicationId" | "event" | "eventDate">): string {
  return `${e.medicationId}|${e.event}|${e.eventDate}`;
}

// ---------------------------------------------------------------------------
// Comparison rows

type RowKind = "flagged" | "weak" | "none" | "untested";

function rowKind(c: MetricComparison): RowKind {
  if (!c.tested) return "untested";
  if (c.strength === "strong" || c.strength === "moderate") return "flagged";
  return c.strength === "weak" ? "weak" : "none";
}

/**
 * The rows whose test and p-value are listed in "How reliable is this?": every tested row except falls and near-falls
 * that were not flagged (they are listed by date, not tested). Each keeps its runs-check p beside the test's, so the
 * disclosure shows RUNS_CHECK_NOTE exactly when one is listed.
 */
function reliabilityTests(rows: MetricComparison[]): ReliabilityTest[] {
  return rows
    .filter((c) => rowKind(c) !== "untested" && (rowKind(c) === "flagged" || !isSentinelMetric(c.metric)) && c.pValue !== null)
    .map((c) => ({
      key: c.metric,
      metric: c.metric,
      label: getMetric(c.metric).label,
      test: c.test,
      pValue: c.pValue as number,
      ...(c.runsCheck ? { runsP: c.runsCheck.p } : {}),
    }));
}

/** A flagged row whose size word the runs check does not back (it reads "maybe a bad stretch"). */
function isQualified(c: MetricComparison): boolean {
  return rowKind(c) === "flagged" && c.runsCheck !== null && !c.runsCheck.passed;
}

const KIND_ORDER: Record<RowKind, number> = { flagged: 0, weak: 1, none: 2, untested: 3 };
const STRENGTH_ORDER: Record<string, number> = { strong: 0, moderate: 1, weak: 2, none: 3 };
/** Within flagged rows: strong before moderate, recorded worsening before improvement, then p-value. */
function compareRows(a: MetricComparison, b: MetricComparison): number {
  return (
    KIND_ORDER[rowKind(a)] - KIND_ORDER[rowKind(b)] ||
    STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] ||
    Number(b.direction === "worse") - Number(a.direction === "worse") ||
    (a.pValue ?? 1) - (b.pValue ?? 1)
  );
}

function changeWords(c: MetricComparison): string {
  const def = getMetric(c.metric);
  if (c.direction === "same") return "No change";
  const higher = c.after.value > c.before.value;
  return def.kind === "boolean" ? (higher ? "More often after" : "Less often after") : higher ? "Rated higher after" : "Rated lower after";
}

function windowText(c: MetricComparison, side: "before" | "after"): string {
  const w = c[side];
  if (w.answered === 0) return "no answered days";
  if (getMetric(c.metric).kind === "scale") return `avg ${w.value.toFixed(1)} · ${w.answered} days`;
  return `${w.positive} of ${w.answered} days`;
}

function barPct(c: MetricComparison, side: "before" | "after"): number {
  const w = c[side];
  if (w.answered === 0) return 0;
  const pct = getMetric(c.metric).kind === "scale" ? (w.value / 5) * 100 : w.value * 100;
  return w.positive > 0 ? Math.max(pct, 2.5) : pct;
}

/**
 * SIZE_ORDER_KEY with each "›" hidden from screen readers and read as ", then" instead, so the order is heard as
 * words rather than as a punctuation name. It is the first line of "How reliable is this?".
 */
function SizeOrderKey() {
  const parts = SIZE_ORDER_KEY.split(" › ");
  return (
    <p className="cg-rel__key">
      {parts.map((part, i) => (
        <span key={part}>
          {i > 0 && (
            <>
              <span aria-hidden="true"> › </span>
              <span className="ui-visually-hidden">, then </span>
            </>
          )}
          {part}
        </span>
      ))}
    </p>
  );
}

function ComparisonRow({ c, onRecords }: { c: MetricComparison; onRecords: () => void }) {
  const def = getMetric(c.metric);
  const kind = rowKind(c);
  const need = TIMELINE_RULES.minAnsweredDays;
  return (
    <li className={cx("cg-tl-row", `is-${kind}`)}>
      <div className="cg-tl-row__metric">
        <TimelineDot metric={c.metric} size={11} label={def.label} />
        {kind !== "untested" && <span className={cx("cg-tl-row__dir", c.direction === "worse" && kind === "flagged" && "is-worse")}>{changeWords(c)}</span>}
      </div>
      {(["before", "after"] as const).map((side) => (
        <div key={side} className={cx("cg-tl-row__win", `is-${side}`)}>
          <span className="cg-tl-row__side">{side === "before" ? "Before" : "After"}</span>
          <span className="cg-tl-row__track" aria-hidden="true">
            <span className="cg-tl-row__fill" style={{ width: `${barPct(c, side)}%`, ...(side === "after" ? { background: SERIES_VAR[c.metric] } : {}) }} />
          </span>
          <span className="cg-tl-row__value ui-num">{windowText(c, side)}</span>
        </div>
      ))}
      <div className="cg-tl-row__stat">
        {kind === "untested" ? (
          <span className="cg-tl-row__untested">
            Not compared — {c.before.answered} answered {c.before.answered === 1 ? "day" : "days"} before, {c.after.answered} after ({need} needed on
            each side)
          </span>
        ) : (
          // The same size words as the Overview ("Large difference", "Clear difference"), qualified when the runs check
          // does not back them. The test, p-value and runs-check p for this row are in "How reliable is this?" below.
          kind === "flagged" && c.strength !== "none" ? (
            <SizeWord
              strength={c.strength}
              runsCheck={c.runsCheck}
              tone={strengthTone(c.strength)}
              className={cx("cg-tl-row__size", `is-${c.strength}`)}
            />
          ) : (
            <Badge size="sm" tone={strengthTone(c.strength)} className="cg-tl-row__size">
              {unflaggedVerdict(c.metric, c.strength)}
            </Badge>
          )
        )}
      </div>
      <div className="cg-tl-row__records">
        <EvidenceLink onClick={onRecords} label="Records" aria-label={`Show the records for ${def.label.toLowerCase()}`} />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Event picker (radio cards)

interface EventOption {
  key: string;
  timeline: MedTimeline;
  med: Medication | undefined;
  flagged: number;
}

function EventPicker({ options, value, onChange }: { options: EventOption[]; value: string; onChange: (key: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].key);
  };
  return (
    <div className="cg-tl-picker" role="radiogroup" aria-label="Medication change to compare">
      {options.map((o, i) => {
        const checked = o.key === value;
        const t = o.timeline;
        const status =
          // "not an all-clear": a real change can go unflagged (LOW_POWER_NOTE, shown in full in the detail below).
          t.status === "ok"
            ? o.flagged > 0
              ? `${o.flagged} ${o.flagged === 1 ? "change" : "changes"} flagged`
              : "Nothing flagged (not an all-clear)"
            : STATUS_TEXT[t.status];
        return (
          <button
            key={o.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={cx("cg-tl-picker__opt", checked && "is-checked", t.status !== "ok" && "is-muted")}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="cg-tl-picker__name">{o.med?.name ?? "Removed medicine"}</span>
            <span className="cg-tl-picker__when ui-num">
              {t.event === "started" ? "Started" : "Stopped"} {formatShort(t.eventDate)}
            </span>
            <span className={cx("cg-tl-picker__status", o.flagged > 0 && "is-flagged")}>{status}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View

export function Timeline() {
  const { data, today } = useStore();
  const { timeline } = useDerived();
  const { params } = useRoute();
  const [recordsMetric, setRecordsMetric] = useState<MetricKey | "falls" | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);
  const p = data.profile;
  const name = p.preferredName?.trim() || p.displayName?.trim() || "She";
  const possessive = `${name}’s`;
  const days = useMemo(() => latestCheckInPerDate(data.checkIns), [data.checkIns]);
  const medById = useMemo(() => new Map(data.medications.map((m) => [m.id, m])), [data.medications]);

  // ---- Events: everything compared or comparable; older changes are summarised, not offered ----
  const allEvents: EventOption[] = useMemo(
    () =>
      timeline.perMed.map((t) => ({
        key: eventKey(t),
        timeline: t,
        med: medById.get(t.medicationId),
        flagged: t.signals.length,
      })),
    [timeline.perMed, medById],
  );
  const options = allEvents.filter((o) => o.timeline.status !== "outside_range");
  const older = allEvents.length - options.length;

  const wantedMed = params.get("med");
  const wantedEvent = params.get("event");
  const strongest = timeline.signals[0];
  const selected =
    options.find((o) => o.timeline.medicationId === wantedMed && (!wantedEvent || o.timeline.event === wantedEvent)) ??
    allEvents.find((o) => o.timeline.medicationId === wantedMed && (!wantedEvent || o.timeline.event === wantedEvent)) ??
    (strongest && options.find((o) => o.key === eventKey(strongest))) ??
    options.find((o) => o.timeline.status === "ok") ??
    options[0] ??
    null;

  const ev: EventAnalysis | null = useMemo(() => {
    if (!selected) return null;
    const med = medById.get(selected.timeline.medicationId);
    if (!med) return null;
    const change = eventsForMed(med, today).find((c) => c.kind === selected.timeline.event) ?? {
      medicationId: med.id,
      kind: selected.timeline.event,
      date: selected.timeline.eventDate,
    };
    return analyzeEvent({
      days,
      med,
      change,
      meds: data.medications,
      today,
      isKnownEffect: (m, k) => knownEffect(m.ingredientIds, k),
      medEvents: data.medEvents,
    });
  }, [selected, medById, days, data.medications, data.medEvents, today]);
  const selMed = selected ? medById.get(selected.timeline.medicationId) : undefined;

  // ---- Period: honour ?days=, else the smallest period that shows the compared windows ----
  const requested = Number(params.get("days"));
  const autoPeriod: Period = (() => {
    if (!ev?.windows) return 30;
    const need = daysBetween(ev.windows.before.from, today) + 1;
    return PERIODS.find((d) => d >= need) ?? 90;
  })();
  const period: Period = (PERIODS as readonly number[]).includes(requested) ? (requested as Period) : autoPeriod;
  const from = periodStart(today, period);
  const periodDays = [...days].filter((c) => c.date >= from && c.date <= today).reverse();

  const dayParam = params.get("day");
  const openDay: ISODate | null = dayParam && isValidDate(dayParam) ? dayParam : null;

  // ---- Comparison detail ----
  const comparisons = useMemo(
    () => (ev ? [...ev.comparisons].sort(compareRows) : []),
    [ev],
  );
  const flagged = comparisons.filter((c) => rowKind(c) === "flagged");
  const knownEffects = selMed
    ? flagged
        .filter((c) => (ev?.event === "started" ? c.direction === "worse" : c.direction === "better") && knownEffect(selMed.ingredientIds, c.metric))
        .map((c) => getMetric(c.metric).effectNoun)
    : [];
  const overlapText = ev
    ? ev.overlappingMedIds
        .map((id) => medById.get(id))
        .filter((m): m is Medication => m !== undefined)
        .map((m) => {
          const changes = eventsForMed(m, today)
            .filter((c) => Math.abs(daysBetween(c.date, ev.eventDate)) <= TIMELINE_RULES.overlapDays)
            .map((c) => `${c.kind} ${formatShort(c.date)}`);
          const doses = data.medEvents
            .filter((e) => e.medicationId === m.id && e.kind === "dose_changed" && Math.abs(daysBetween(e.date, ev.eventDate)) <= TIMELINE_RULES.overlapDays)
            .map((e) => `dose changed ${formatShort(e.date)}`);
          return `${m.name} (${[...changes, ...doses].join(", ") || "changed"})`;
        })
    : [];
  const checkInsIn = (w: { from: ISODate; to: ISODate } | undefined) => (w ? days.filter((c) => c.date >= w.from && c.date <= w.to).length : 0);
  const spanDays = (w: { from: ISODate; to: ISODate }) => daysBetween(w.from, w.to) + 1;

  // ---- Records drawer for one metric (or falls) across both windows ----
  const recordGroups: RecordGroup[] = useMemo(() => {
    if (!ev?.windows || !recordsMetric) return [];
    const words = (c: CheckIn): { value: string; counted: boolean } | null => {
      if (recordsMetric === "falls") {
        if (c.answers.fall === null && c.answers.nearFall === null) return null;
        return c.answers.fall ? { value: "Fall", counted: true } : c.answers.nearFall ? { value: "Near-fall", counted: true } : { value: "Neither", counted: false };
      }
      const v = metricValue(c, recordsMetric);
      if (v === null) return null;
      if (getMetric(recordsMetric).kind === "scale") return { value: `${v} of 5`, counted: false };
      return { value: v === 1 ? "Yes" : "No", counted: v === 1 };
    };
    const comp = recordsMetric === "falls" ? null : ev.comparisons.find((c) => c.metric === recordsMetric);
    return (["after", "before"] as const).map((side) => {
      const w = ev.windows![side];
      const rows = days
        .filter((c) => c.date >= w.from && c.date <= w.to)
        .reverse()
        .map((c) => ({ c, r: words(c) }))
        .filter((x): x is { c: CheckIn; r: { value: string; counted: boolean } } => x.r !== null)
        .map(({ c, r }) => ({ date: c.date, value: r.value, counted: r.counted }));
      const summary = comp ? windowText(comp, side) : `${rows.filter((r) => r.counted).length} on ${rows.length} answered days`;
      return { heading: `${side === "before" ? "Before" : "After"} · ${rangeText(w.from, w.to)}`, summary, rows };
    });
  }, [ev, recordsMetric, days]);

  const choose = (key: string) => {
    const o = allEvents.find((x) => x.key === key);
    if (o) setParams({ med: o.timeline.medicationId, event: o.timeline.event === "stopped" ? "stopped" : undefined, days: undefined });
  };

  return (
    <div className="cg-tl">
      <PageHeader
        // Every check-in ever saved; the day list below counts only the selected period ("50 of 60 days").
        eyebrow={`${possessive} diary · ${days.length} ${days.length === 1 ? "check-in" : "check-ins"} in all`}
        title="Symptoms & timeline"
        subtitle="Every recorded day, with medicine changes marked, and what changed around each change."
      />

      {/* ---- Medication change selector ---- */}
      <section className="cg-tl-events" aria-labelledby="tl-events-title">
        <h2 id="tl-events-title" className="cg-tl-section-title">
          <ArrowLeftRight size={18} aria-hidden="true" /> Compare around a medicine change
        </h2>
        {options.length === 0 ? (
          <p className="cg-tl-muted">
            No medicine was started or stopped in the last {TIMELINE_RULES.lookbackDays} days, so there is nothing to compare yet.
            {older > 0 && ` ${older} older ${older === 1 ? "change is" : "changes are"} outside the comparison range.`}
          </p>
        ) : (
          <>
            <EventPicker options={options} value={selected?.key ?? ""} onChange={choose} />
            {older > 0 && (
              <p className="cg-tl-muted">
                {older} older {older === 1 ? "change" : "changes"} (more than {TIMELINE_RULES.lookbackDays} days ago) {older === 1 ? "is" : "are"} not compared.
              </p>
            )}
          </>
        )}
      </section>

      {/* ---- Before / after comparison ---- */}
      {ev && selMed && (
        <Card as="section" className="cg-tl-compare" aria-labelledby="tl-compare-title" data-tour="timeline-compare">
          {/* The check-in counts for both windows are in "Diary coverage" below, so the subtitle names the windows only. */}
          <CardHeader
            id="tl-compare-title"
            eyebrow="Before and after"
            icon={<GitCompareArrows size={20} />}
            title={`${selMed.name} was ${ev.event} on ${formatLong(ev.eventDate)}`}
            subtitle={
              ev.windows
                ? `${ev.status === "ok" ? "Compares" : "Would compare"} ${rangeText(ev.windows.before.from, ev.windows.before.to)} with ${rangeText(ev.windows.after.from, ev.windows.after.to)} · answered days only`
                : STATUS_TEXT[ev.status]
            }
          />

          <div className="cg-tl-compare__body">
            {ev.status !== "ok" && (
              <Callout
                tone="info"
                title={
                  ev.status === "too_recent"
                    ? "Too soon to compare"
                    : ev.status === "outside_range"
                      ? "Outside the comparison range"
                      : "Not enough diary entries to compare"
                }
              >
                <p>{ev.reason ?? ""}</p>
              </Callout>
            )}

            {ev.status === "ok" && (
              <>
                {/* The count, then the ONE caveat line: what this is not, and one short sentence on chance. */}
                {flagged.length > 0 ? (
                  <p className="cg-tl-compare__lead">
                    <strong>
                      {flagged.length} of {ev.testedMetrics.length} compared diary items
                    </strong>{" "}
                    changed enough to be flagged. {CAVEAT} {CHANCE_SHORT}
                  </p>
                ) : (
                  <>
                    <p className="cg-tl-compare__lead">
                      None of the {ev.testedMetrics.length} compared diary items changed enough to be flagged. {CAVEAT}
                    </p>
                    {/* Measured power (rules.ts, tied to timeline-null.json): an empty result is not reassurance. */}
                    <p className="cg-tl-muted cg-tl-compare__partial">{LOW_POWER_NOTE}</p>
                  </>
                )}
                {ev.reason && <p className="cg-tl-muted cg-tl-compare__partial">{ev.reason}</p>}
                <ul className="cg-tl-rows" role="list" aria-label="Diary items before and after">
                  {comparisons.map((c) => (
                    <ComparisonRow key={c.metric} c={c} onRecords={() => setRecordsMetric(c.metric)} />
                  ))}
                </ul>
              </>
            )}

            {ev.sentinel && (
              <div className="cg-tl-falls">
                <span className="cg-tl-falls__icon" aria-hidden="true">
                  <Footprints size={20} />
                </span>
                <div>
                  <p className="cg-tl-falls__title">Falls and near-falls, listed by date</p>
                  {/* Why they are listed rather than tested (SENTINEL_NOTE) is in "How reliable is this?". */}
                  <p>{fallsComparison(ev.sentinel, today).text}</p>
                </div>
                <EvidenceLink onClick={() => setRecordsMetric("falls")} label="Records" aria-label="Show the fall and near-fall records" />
              </div>
            )}

            {/* The caveat is in the lead above (once); this list holds what else was going on. */}
            <dl className="cg-tl-context">
              <div>
                <dt>Other medicine changes within {TIMELINE_RULES.overlapDays} days</dt>
                <dd>{overlapText.length ? `${overlapText.join("; ")}. Changes this close together are hard to tell apart.` : "None recorded."}</dd>
              </div>
              {knownEffects.length > 0 && (
                <div>
                  <dt>Reference list</dt>
                  <dd>
                    Kinwise’s reference list includes {knownEffects.join(", ")} among the recognized possible effects of {selMed.name}.
                  </dd>
                </div>
              )}
              {ev.windows && (
                <div>
                  <dt>Diary coverage</dt>
                  <dd>
                    {checkInsIn(ev.windows.before)} of {spanDays(ev.windows.before)} days before and {checkInsIn(ev.windows.after)} of{" "}
                    {spanDays(ev.windows.after)} days after have a check-in.
                  </dd>
                </div>
              )}
            </dl>

            {/* Same disclosure and title as the Overview's: the size-word order, what "maybe a bad stretch" means,
                the test, p-value and runs-check p of every compared row, why falls are listed, the method, the
                measured chance rates and the caveat (all from rules.ts). Closed by default; a button with
                aria-expanded (ui Disclosure). */}
            <ReliabilityDisclosure
              summary={RELIABILITY_TITLE}
              tests={ev.status === "ok" ? reliabilityTests(comparisons) : []}
              notes={
                <>
                  {ev.status === "ok" && <SizeOrderKey />}
                  {ev.status === "ok" && comparisons.some(isQualified) && <p>{RUNS_QUALIFIER_NOTE}</p>}
                  {ev.sentinel && <p>{SENTINEL_NOTE}</p>}
                </>
              }
              method={TIMELINE_METHOD_SUMMARY}
              bodyClassName="cg-tl-method"
            />
          </div>
        </Card>
      )}

      {/* ---- Full chart ---- */}
      <Card as="section" className="cg-tl-chart" aria-labelledby="tl-chart-title">
        <CardHeader
          id="tl-chart-title"
          icon={<LineChartIcon size={20} />}
          title="Day by day"
          subtitle={`${rangeText(from, today)} · ${ev?.windows ? "shaded: the two compared windows · " : ""}select a day to see her answers and words`}
          actions={
            <Segmented
              label="Period"
              hideLabel
              value={period}
              onChange={(v) => setParams({ days: String(v) })}
              options={PERIODS.map((d) => ({ value: d, label: `${d} days` }))}
              className="cg-tl-period ui-seg--filter"
            />
          }
        />
        <div className="cg-tl-chart__body">
          {data.checkIns.length === 0 ? (
            <EmptyState level={3} icon={<CalendarDays size={22} />} title="No check-ins yet">
              Each day {name} checks in will appear here.
            </EmptyState>
          ) : (
            <TimelineChart
              size="full"
              checkIns={data.checkIns}
              meds={data.medications}
              medEvents={data.medEvents}
              from={from}
              to={today}
              highlight={ev?.windows ?? null}
              focusMedId={selMed?.id ?? null}
              label={`${possessive} diary, ${rangeText(from, today)}`}
              onDayClick={(d) => setParams({ day: d })}
            />
          )}
        </div>
      </Card>

      {/* ---- Day list ---- */}
      <Card as="section" className="cg-tl-days" aria-labelledby="tl-days-title">
        <CardHeader
          id="tl-days-title"
          icon={<NotebookPen size={20} />}
          title="Every check-in"
          subtitle={`${periodDays.length} of ${period} days in ${rangeText(from, today)} · newest first`}
        />
        {periodDays.length === 0 ? (
          <p className="cg-tl-muted cg-tl-days__empty">No check-ins in this period.</p>
        ) : (
          <ul className="cg-tl-daylist" role="list">
            <li className="cg-tl-daylist__head" aria-hidden="true">
              <span>Date</span>
              <span>Recorded</span>
              <span>Energy · sleep</span>
              <span>In her words</span>
            </li>
            {(showAllDays ? periodDays : periodDays.slice(0, DAY_LIST_INITIAL)).map((c) => {
              const chips = recordedChips(c);
              const edited = c.revision > 1 || data.checkInHistory.some((h) => h.id === c.id || h.date === c.date);
              return (
                <li key={c.date}>
                  <button type="button" className="cg-tl-day" onClick={() => setParams({ day: c.date })}>
                    <span className="cg-tl-day__date ui-num">
                      {formatWeekday(c.date)}
                      {edited && (
                        <Badge size="sm" tone="info">
                          Edited
                        </Badge>
                      )}
                    </span>
                    <span className="cg-tl-day__chips">
                      {chips.length ? chips.map((t) => <span key={t} className="cg-tl-chip">{t}</span>) : <span className="cg-tl-muted">None recorded</span>}
                    </span>
                    <span className="cg-tl-day__scales ui-num">
                      Energy {c.answers.energy ?? "–"} · Sleep {c.answers.sleep ?? "–"}
                      <span className="cg-tl-muted"> (of 5)</span>
                    </span>
                    <span className="cg-tl-day__story">
                      {c.story.trim() ? <span className="ui-quote">“{excerptText(c.story, 120)}”</span> : <span className="cg-tl-muted">—</span>}
                    </span>
                    <span className="ui-visually-hidden"> — open the day’s records</span>
                    <ChevronRight size={18} aria-hidden="true" className="cg-tl-day__chev" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {periodDays.length > DAY_LIST_INITIAL && (
          <div className="cg-tl-more">
            <Button size="sm" variant="secondary" onClick={() => setShowAllDays(!showAllDays)} aria-expanded={showAllDays}>
              {showAllDays ? "Show fewer days" : `Show all ${periodDays.length} check-ins`}
            </Button>
          </div>
        )}
        <p className="cg-tl-foot">
          <Info size={15} aria-hidden="true" /> Questions left blank are “not answered”, never “no”. Edited days keep every earlier version.
        </p>
      </Card>

      <DayRecordsDrawer date={openDay} onClose={() => setParams({ day: undefined })} />
      <RecordsDrawer
        open={recordsMetric !== null}
        onClose={() => setRecordsMetric(null)}
        title={recordsMetric === "falls" ? "Falls and near-falls" : recordsMetric ? getMetric(recordsMetric).label : ""}
        description={selMed && ev ? `Around ${selMed.name} being ${ev.event} on ${formatShort(ev.eventDate)}. Only answered days are listed.` : undefined}
        groups={recordGroups}
      />
    </div>
  );
}
