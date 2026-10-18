// Caregiver Overview (/c/overview, SPEC-UI "Overview"): the selected period (14/30/60 days) at a glance.
//
//   1. "What Kinwise noticed" — up to 3 insights that join timeline signals (before/after a medicine change,
//      with counts, denominators and the size of the difference), falls/near-falls listed by date, and the medication
//      review findings for the same medicine. Each ends in a question for the doctor or pharmacist. The first card is
//      laid out so a caregiver sees, without scrolling at 1366×860: headline → before/after bars → ONE caveat ("not
//      what caused it") → falls → the first sentence of the question. The engine's full sentence with dates, the plain
//      line on chance, test names, p-values, the measured chance rates and the Beers detail sit one click away ("How
//      reliable is this?", "Why this medicine is on the list"): moved there, never deleted.
//   2. Stats row — check-ins, dizziness days, falls & near-falls, anticholinergic burden, medicines; every number
//      opens "Show the records".
//   3. Symptom timeline chart (shared module), Today, review summary, pinned concerns.
// All numbers are computed from the record (useStore / useDerived); the period comes from ?days=14|30|60.
import { useId, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  FileText,
  Footprints,
  Info,
  LineChart as LineChartIcon,
  MessageCircleQuestion,
  MessageSquareQuote,
  Pill,
  Pin,
  Plus,
  ScanSearch,
  Waves,
} from "lucide-react";
import type { CheckIn, Finding, FindingCategory, ISODate, Medication, MetricKey, Signal, WindowStat } from "../../model/types";
import type { SentinelReport, TimelineReport } from "../../engine/timeline/signals";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { href, navigate, setParams, useRoute } from "../../app/router";
import { newId } from "../../model/ids";
import { formatShort } from "../../model/dates";
import { getMetric, latestCheckInPerDate, windowStat } from "../../engine/timeline/metrics";
import { TIMELINE_RULES } from "../../engine/timeline/rules";
import { CATEGORY_LABEL } from "../../engine/meds/labels";
import { getSource } from "../../kb";
import {
  ACB_BANDS,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Disclosure,
  Drawer,
  EmptyState,
  EvidenceLink,
  Meter,
  PageHeader,
  Segmented,
  SERIES_VAR,
  SourceCitation,
  Stat,
  TimelineDot,
  cx,
  useToast,
} from "../../ui";
import { TimelineChart, excerptText, periodStart } from "../shared/caregiver-TimelineChart";
import { RecordsDrawer, latestFor, rangeText, type RecordGroup } from "../shared/caregiver-Records";
import {
  CHANCE_NOTE,
  STRENGTH_SIZE_WORD,
  fallsComparison,
  reviewPromptsSummary,
  triggerFirstSymptoms,
} from "../shared/caregiver-insights";
import { ReliabilityDisclosure } from "../shared/caregiver-Reliability";
import { personWords } from "../shared/personWords";
import "./overview.css";

const PERIODS = [14, 30, 60] as const;
type Period = (typeof PERIODS)[number];

/** Spec wording for the caveat that travels with every before/after comparison (the demo video points at it). */
export const COMPARISON_CAVEAT = "Shows a change in what was recorded, not what caused it.";

/** The question box's label: the same words as the Review page's label (FindingCard.tsx), which spells them out. */
export const QUESTION_LABEL = "Question for the doctor or pharmacist";

/**
 * Caption under the ACB meter: the published threshold the bands are read against (ACB scale; Boustani 2008), and
 * what the red "5+" band is. meta.json acbHighNote: Kinwise labels totals of 5 or more for display only; the scale
 * itself publishes one review threshold (3).
 */
const ACB_THRESHOLD_NOTE = "Published review threshold: a total of 3 or more (ACB scale). The 5+ band is a Kinwise display band, not part of the scale.";

/** Review-summary count as words ("1 prompt", "3 prompts"): a circled number would read as a step in a sequence. */
export function promptCountText(n: number): string {
  return `${n} ${n === 1 ? "prompt" : "prompts"}`;
}

/** The question's first sentence (up to the first "?"), shown on the card; the whole question is one click away. */
function firstSentence(q: string): string {
  const i = q.indexOf("?");
  return i > 0 && i < q.length - 1 ? q.slice(0, i + 1) : q;
}

// ---------------------------------------------------------------------------
// Insight model

interface BarRow {
  metric: MetricKey;
  label: string;
  kind: "boolean" | "scale";
  before: WindowStat;
  after: WindowStat;
  /** This row's own signal strength: each row is labelled by its own size word, never by the headline's. */
  strength: Signal["strength"];
  /** The test behind this row and its p-value, shown in "How reliable is this?". */
  test: Signal["test"];
  pValue: number;
}

interface Insight {
  key: string;
  kind: "signal" | "finding" | "falls";
  medId: string | null;
  eyebrow: string;
  title: string;
  lead: string;
  bars: BarRow[];
  sentinel: SentinelReport | null;
  /** Strength of the headline signal (worded by size, never as a verdict), or null for non-signal insights. */
  strength: Signal["strength"] | null;
  finding: Finding | null;
  moreFindings: number;
  symptomCounts: { metric: MetricKey; stat: WindowStat }[];
  question: string;
  questionSource: string;
  timelineMed: string | null;
}

/** Order in which review findings are offered as stand-alone insights (most explanatory first). */
const OVERVIEW_ORDER: FindingCategory[] = [
  "prescribing_cascade",
  "anticholinergic_burden",
  "beers_interaction",
  "beers_condition",
  "beers_avoid",
  "cns_active_combo",
  "fall_risk",
  "duplicate_class",
  "beers_renal",
  "beers_caution",
  "monitoring",
];

/** Linked finding for a medicine with a signal: Beers "avoid" reads clearest, then drug–condition, then the rest. */
const LINKED_ORDER: FindingCategory[] = ["beers_avoid", "beers_condition", "beers_caution", "fall_risk", "anticholinergic_burden"];

function rank<T>(order: T[], x: T): number {
  const i = order.indexOf(x);
  return i < 0 ? order.length : i;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function medLabel(med: Medication | undefined): string {
  const n = (med?.name ?? "").replace(/\s+/g, " ").trim();
  return n || "this medicine";
}

function signalTitle(worse: Signal[], med: Medication | undefined, event: Signal["event"], date: ISODate): string {
  const booleans = worse.filter((s) => getMetric(s.metric).kind === "boolean").slice(0, 2);
  const when = event === "started" ? `since ${medLabel(med)} started on ${formatShort(date)}` : `after ${medLabel(med)} was stopped on ${formatShort(date)}`;
  if (booleans.length) {
    const names = booleans.map((s, i) => (i === 0 ? getMetric(s.metric).label : getMetric(s.metric).label.toLowerCase()));
    return `${joinAnd(names)} recorded more often ${when}`;
  }
  return `${getMetric(worse[0].metric).label} rated lower ${when}`;
}

export function buildInsights(input: {
  signals: Signal[];
  sentinels: SentinelReport[];
  findings: Finding[];
  meds: Medication[];
  checkIns: CheckIn[];
  from: ISODate;
  to: ISODate;
  /** Possessive pronoun for the person (personWords().their): "her", "his" or "their". */
  their?: string;
}): Insight[] {
  const { signals, sentinels, findings, meds, checkIns, from, to, their = "their" } = input;
  const out: Insight[] = [];
  const coveredMeds = new Set<string>();
  const usedFindings = new Set<string>();
  const medById = new Map(meds.map((m) => [m.id, m]));

  // 1. Medicine changes with signals (strongest first; signals arrive sorted).
  const groups = new Map<string, Signal[]>();
  for (const s of signals) {
    const k = `${s.medicationId}|${s.event}|${s.eventDate}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  for (const [k, group] of groups) {
    if (out.length >= 2) break;
    const worse = group.filter((s) => s.direction === "worse");
    if (worse.length === 0) continue;
    const top = worse[0];
    const med = medById.get(top.medicationId);
    const sentinel = sentinels.find((x) => x.medicationId === top.medicationId && x.event === top.event && x.eventDate === top.eventDate) ?? null;
    const medFindings = findings
      .filter((f) => f.medIds.includes(top.medicationId))
      .sort((a, b) => rank(LINKED_ORDER, a.category) - rank(LINKED_ORDER, b.category));
    const linked = medFindings[0] ?? null;
    if (linked) usedFindings.add(linked.key);
    const bars = [...worse.filter((s) => getMetric(s.metric).kind === "boolean"), ...worse.filter((s) => getMetric(s.metric).kind === "scale")]
      .slice(0, 3)
      .map((s) => ({
        metric: s.metric,
        label: getMetric(s.metric).label,
        kind: getMetric(s.metric).kind,
        before: s.before,
        after: s.after,
        strength: s.strength,
        test: s.test,
        pValue: s.pValue,
      }));
    out.push({
      key: `sig:${k}`,
      kind: "signal",
      medId: top.medicationId,
      eyebrow: top.event === "started" ? "After a new medicine" : "After a medicine was stopped",
      title: signalTitle(worse, med, top.event, top.eventDate),
      lead: top.text,
      bars,
      sentinel,
      strength: top.strength,
      finding: linked,
      moreFindings: Math.max(0, medFindings.length - 1),
      symptomCounts: [],
      question:
        linked?.question ??
        `${getMetric(top.metric).label} was recorded more often after ${medLabel(med)} was ${top.event}. Could the two be related, and is ${medLabel(med)} still needed?`,
      questionSource: linked ? `finding:${linked.key}` : `signal:${top.id}`,
      timelineMed: top.medicationId,
    });
    coveredMeds.add(top.medicationId);
  }

  // 2. Falls or near-falls around a change that had no signal.
  for (const s of sentinels) {
    if (out.length >= 3) break;
    if (coveredMeds.has(s.medicationId) || s.totals.after === 0) continue;
    const med = medById.get(s.medicationId);
    out.push({
      key: `falls:${s.id}`,
      kind: "falls",
      medId: s.medicationId,
      eyebrow: "Falls and near-falls",
      title: `${s.totals.after} ${s.totals.after === 1 ? "fall or near-fall" : "falls or near-falls"} recorded since ${medLabel(med)} ${s.event === "started" ? "started" : "was stopped"}`,
      lead: s.text,
      bars: [],
      sentinel: s,
      strength: null,
      finding: null,
      moreFindings: findings.filter((f) => f.medIds.includes(s.medicationId)).length,
      symptomCounts: [],
      question: `Falls and near-falls were recorded after ${medLabel(med)} was ${s.event}. Could any of ${their} medicines be playing a part?`,
      questionSource: `sentinel:${s.id}`,
      timelineMed: s.medicationId,
    });
    coveredMeds.add(s.medicationId);
  }

  // 3. Review findings about other medicines, one per category, symptom-linked first (engine order).
  const candidates = findings
    .filter((f) => !usedFindings.has(f.key) && f.medIds.some((id) => !coveredMeds.has(id)))
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        Number(b.f.relatedSymptoms.length > 0) - Number(a.f.relatedSymptoms.length > 0) ||
        rank(OVERVIEW_ORDER, a.f.category) - rank(OVERVIEW_ORDER, b.f.category) ||
        a.i - b.i,
    );
  const usedCats = new Set<FindingCategory>();
  for (const { f } of candidates) {
    if (out.length >= 3) break;
    if (usedCats.has(f.category)) continue;
    usedCats.add(f.category);
    const symptomCounts = triggerFirstSymptoms(f)
      .filter((m) => getMetric(m).kind === "boolean")
      .slice(0, 3)
      .map((metric) => ({ metric, stat: windowStat(checkIns, metric, from, to) }))
      .filter((x) => x.stat.answered > 0);
    out.push({
      key: `find:${f.key}`,
      kind: "finding",
      medId: f.medIds[0] ?? null,
      eyebrow: CATEGORY_LABEL[f.category] ?? "Medication review",
      title: f.title,
      lead: f.plain,
      bars: [],
      sentinel: null,
      strength: null,
      finding: f,
      moreFindings: 0,
      symptomCounts,
      question: f.question,
      questionSource: `finding:${f.key}`,
      timelineMed: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small presentational pieces

/** Before/after bar pair for one metric, numerators and denominators always visible. */
function BeforeAfterBars({ row }: { row: BarRow }) {
  const scale = row.kind === "scale";
  const pctOf = (w: WindowStat) => (w.answered === 0 ? 0 : scale ? (w.value / 5) * 100 : w.value * 100);
  const text = (w: WindowStat) =>
    w.answered === 0 ? "no answered days" : scale ? `avg ${w.value.toFixed(1)} of 5 · ${w.answered} days` : `${w.positive} of ${w.answered} days`;
  return (
    <div className="cg-ov-bars">
      <div className="cg-ov-bars__label">
        <TimelineDot metric={row.metric} size={10} label={row.label} />
        {/* Neutral size word for THIS row (dizziness may be "Large" while confusion is "Clear"); info icon, not a
            warning, because it describes what was recorded, not a verdict. */}
        <Badge size="sm" tone="neutral" icon={<Info size={12} aria-hidden="true" />} className="cg-ov-bars__size">
          {STRENGTH_SIZE_WORD[row.strength]}
        </Badge>
      </div>
      <div className="cg-ov-bars__rows">
        {(["before", "after"] as const).map((side) => (
          <div key={side} className={cx("cg-ov-bars__row", `is-${side}`)}>
            <span className="cg-ov-bars__side">{side === "before" ? "Before" : "After"}</span>
            <span className="cg-ov-bars__track" aria-hidden="true">
              <span
                className="cg-ov-bars__fill"
                style={{ width: `${Math.max(pctOf(row[side]), row[side].positive > 0 ? 3 : 0)}%`, ...(side === "after" ? { background: SERIES_VAR[row.metric] } : {}) }}
              />
            </span>
            <span className="cg-ov-bars__value ui-num">{text(row[side])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FallsLine({ s, today }: { s: SentinelReport; today: ISODate }) {
  const { lead, rest } = fallsComparison(s, today);
  return (
    <div className="cg-ov-falls">
      <span className="cg-ov-falls__icon" aria-hidden="true">
        <Footprints size={18} />
      </span>
      <p>
        <strong>{lead}</strong>
        {rest}
      </p>
    </div>
  );
}

function FindingLine({ f, more }: { f: Finding; more: number }) {
  const src = f.sourceIds.map((id) => getSource(id)).find((s) => s !== undefined);
  return (
    <div className="cg-ov-finding">
      <span className="cg-ov-finding__icon" aria-hidden="true">
        <BookOpenCheck size={18} />
      </span>
      <div className="cg-ov-finding__text">
        <p>
          <span className="cg-ov-finding__cat">{CATEGORY_LABEL[f.category] ?? "Medication review"}:</span> {f.title}
        </p>
        <p className="cg-ov-finding__meta">
          {src && <SourceCitation source={src} variant="inline" />}
          {f.evidenceGrade && <span>{f.evidenceGrade}</span>}
          {more > 0 && (
            <a href={href("/c/review")} className="cg-ov-finding__more">
              +{more} more review {more === 1 ? "prompt" : "prompts"}
            </a>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * "How reliable is this?": the test and p-value behind each bar; then the engine's full sentence with its dates and
 * windows (the bars show the same counts), the plain line on chance, and the flagging rule (read from rules.ts so it
 * always matches the code; "moderate" is the lowest flagged strength); then the measured chance rates and the
 * caveat, rendered verbatim from rules.ts by the shared disclosure. The shared disclosure wraps `method` in one <p>,
 * so the three lines are block spans inside it.
 */
function MethodDisclosure({ bars, lead }: { bars: BarRow[]; lead: string }) {
  return (
    <ReliabilityDisclosure
      className="cg-ov-insight__disclosure"
      bodyClassName="cg-ov-method"
      tests={bars.map((b) => ({ key: b.metric, metric: b.metric, label: b.label, test: b.test, pValue: b.pValue }))}
      method={
        <>
          <span className="cg-ov-method__line">{lead}</span>
          <span className="cg-ov-method__line">{CHANCE_NOTE}</span>
          <span className="cg-ov-method__line">
            Only days with an answer are counted. A difference is shown when it is sizeable and its p-value is below{" "}
            {TIMELINE_RULES.thresholds.boolean.moderate.p}.
          </span>
        </>
      }
    />
  );
}

/**
 * The question box: neutral sage wash (the rust tone is kept for falls). The card shows the question's first sentence;
 * the rest opens in place. "Add to visit questions" always saves the whole question.
 */
function QuestionBox({ question }: { question: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const teaser = firstSentence(question);
  const rest = question.slice(teaser.length).trim();
  return (
    <div className="cg-ov-question">
      <p className="cg-ov-question__label">
        <MessageCircleQuestion size={15} aria-hidden="true" />
        {QUESTION_LABEL}
      </p>
      <p className="cg-ov-question__text" id={id}>
        {teaser}
        {rest && <span hidden={!open}> {rest}</span>}
      </p>
      {rest && (
        <button type="button" className="cg-ov-question__more" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read the whole question"}
        </button>
      )}
    </div>
  );
}

export function InsightCard({
  ins,
  featured,
  saved,
  onSave,
  today,
}: {
  ins: Insight;
  featured: boolean;
  saved: boolean;
  onSave: (ins: Insight) => void;
  today: ISODate;
}) {
  // Reading order (and, on the featured card, the first screen): headline → before/after bars → caveat → falls →
  // question. Supporting detail (the engine's long sentence, chance, Beers listing, test names, p-values) is collapsed
  // below the bars. On the featured card the side column (falls, question) sits beside the bars; on narrow screens it
  // follows them. One hedge per card: a signal shows only the caveat; its other hedges live in "How reliable is this?".
  return (
    <article className={cx("cg-ov-insight", featured && "is-featured", `is-${ins.kind}`)} aria-labelledby={`ins-${ins.key}`}>
      <header className="cg-ov-insight__head">
        {/* Signal titles already say which change they follow ("since Lorazepam started"); others name their kind
            unless the title already starts with it ("Possible prescribing cascade: …"). */}
        {ins.kind !== "signal" && !ins.title.toLowerCase().startsWith(ins.eyebrow.toLowerCase()) && (
          <p className="cg-ov-insight__eyebrow">{ins.eyebrow}</p>
        )}
        <h3 id={`ins-${ins.key}`} className="cg-ov-insight__title">
          {ins.title}
        </h3>
      </header>

      <div className="cg-ov-insight__main">
        {/* A signal's lead repeats the bars' counts with dates; it opens in "How reliable is this?". Falls and finding
            cards keep theirs: it is their evidence. */}
        {ins.kind !== "signal" && <p className="cg-ov-insight__lead">{ins.lead}</p>}
        {ins.bars.length > 0 && (
          <div className="cg-ov-insight__aside" role="group" aria-label="Before and after, answered days only">
            <p className="cg-ov-insight__aside-title">
              Before vs after <span>· answered days only</span>
            </p>
            <div className="cg-ov-insight__bars">
              {ins.bars.map((b) => (
                <BeforeAfterBars key={b.metric} row={b} />
              ))}
            </div>
          </div>
        )}
        {/* The one caveat on the card. The plain line on chance and the measured rates are in "How reliable is
            this?" below the question, so the question and its button come first on a phone. */}
        {ins.kind === "signal" && (
          <div className="cg-ov-insight__caveat">
            <Info size={16} aria-hidden="true" />
            <p className="cg-ov-insight__caveat-main">{COMPARISON_CAVEAT}</p>
          </div>
        )}
        {/* Without bars (a falls-only card) the falls line is the evidence itself, so it stays in the main column. */}
        {ins.sentinel && ins.bars.length === 0 && <FallsLine s={ins.sentinel} today={today} />}
        {ins.kind === "finding" && ins.finding && (
          <p className="cg-ov-insight__meta">
            {ins.finding.sourceIds
              .map((id) => getSource(id))
              .filter((s): s is NonNullable<typeof s> => s !== undefined)
              .slice(0, 2)
              .map((s) => (
                <SourceCitation key={s.id} source={s} />
              ))}
          </p>
        )}
        {ins.symptomCounts.length > 0 && (
          <ul className="cg-ov-insight__symptoms" role="list" aria-label="Recorded in the diary in this period">
            {ins.symptomCounts.map(({ metric, stat }) => (
              <li key={metric}>
                <TimelineDot metric={metric} size={9} />
                <span>
                  {getMetric(metric).label}: <strong className="ui-num">{stat.positive}</strong> of {stat.answered} answered days
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cg-ov-insight__side">
        {/* Beside the bars: falls and near-falls by date, then the question they lead to. */}
        {ins.sentinel && ins.bars.length > 0 && <FallsLine s={ins.sentinel} today={today} />}
        <QuestionBox question={ins.question} />
        <div className="cg-ov-insight__actions">
          {saved ? (
            <Badge tone="success" icon className="cg-ov-saved">
              Added to visit questions
            </Badge>
          ) : (
            // Outline, as on the Review page (FindingCard): "Prepare visit brief" is the page's only filled button.
            <Button size="sm" variant="secondary" iconLeft={<Plus size={16} aria-hidden="true" />} onClick={() => onSave(ins)}>
              Add to visit questions
            </Button>
          )}
          {ins.timelineMed ? (
            <ButtonLink
              href={href("/c/timeline", { med: ins.timelineMed })}
              size="sm"
              variant="ghost"
              iconLeft={<LineChartIcon size={16} aria-hidden="true" />}
            >
              See timeline
            </ButtonLink>
          ) : (
            <ButtonLink href={href("/c/review")} size="sm" variant="ghost" iconLeft={<BookOpenCheck size={16} aria-hidden="true" />}>
              See in review
            </ButtonLink>
          )}
        </div>
      </div>

      {/* Detail one click away; after the question on narrow screens, under the bars on wide ones. */}
      {((ins.finding && ins.kind !== "finding") || (ins.strength && ins.bars.length > 0)) && (
        <div className="cg-ov-insight__more">
          {ins.finding && ins.kind !== "finding" && (
            <Disclosure summary="Why this medicine is on the list" className="cg-ov-insight__disclosure">
              <FindingLine f={ins.finding} more={ins.moreFindings} />
            </Disclosure>
          )}
          {ins.strength && ins.bars.length > 0 && <MethodDisclosure bars={ins.bars} lead={ins.lead} />}
        </div>
      )}
    </article>
  );
}

function ListCardRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="cg-ov-list__row">
      <span className="cg-ov-list__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="cg-ov-list__text">{children}</div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// View

type DrawerKind = "checkins" | "dizziness" | "falls" | "acb" | "meds" | null;

export function Overview() {
  const { data, today, update } = useStore();
  const { review, timeline, active } = useDerived();
  const { params } = useRoute();
  const toast = useToast();
  const [drawer, setDrawer] = useState<DrawerKind>(null);

  const requested = Number(params.get("days"));
  const period: Period = (PERIODS as readonly number[]).includes(requested) ? (requested as Period) : 30;
  const from = periodStart(today, period);
  const p = data.profile;
  // "Margaret" / "Margaret’s"; with an empty profile "your family member" / "their" (sentence start: "Your family member’s").
  const who = personWords(p);

  const sentinels = useMemo(() => (timeline as Partial<TimelineReport>).sentinels ?? [], [timeline]);
  const insights = useMemo(
    () =>
      buildInsights({
        signals: timeline.signals,
        sentinels,
        findings: review.findings,
        meds: data.medications,
        checkIns: data.checkIns,
        from,
        to: today,
        their: who.their,
      }),
    [timeline.signals, sentinels, review.findings, data.medications, data.checkIns, from, today, who.their],
  );

  // ---- Period numbers (answered days only) ----
  const days = useMemo(() => latestCheckInPerDate(data.checkIns).filter((c) => c.date >= from && c.date <= today), [data.checkIns, from, today]);
  const dizzy = windowStat(data.checkIns, "dizziness", from, today);
  const fall = windowStat(data.checkIns, "fall", from, today);
  const nearFall = windowStat(data.checkIns, "nearFall", from, today);
  const fallsAnswered = days.filter((c) => c.answers.fall !== null || c.answers.nearFall !== null).length;
  const otc = active.filter((m) => m.otc).length;
  const unmatched = active.filter((m) => review.unmatchedMedIds.includes(m.id)).length;
  const lastCheckIn = days[days.length - 1] ?? latestCheckInPerDate(data.checkIns).slice(-1)[0];
  const todayCheckIn = latestFor(data.checkIns, today);
  const latestStory = [...latestCheckInPerDate(data.checkIns)].reverse().find((c) => c.story.trim());
  const pinned = data.notes.filter((n) => n.pinned).sort((a, b) => (a.date < b.date ? 1 : -1));
  const savedTexts = new Set(data.savedQuestions.map((q) => q.text.trim()));
  const focusMed = insights.find((i) => i.timelineMed)?.timelineMed ?? null;

  const saveQuestion = (ins: Insight) => {
    if (savedTexts.has(ins.question.trim())) return;
    const res = update("caregiver", (prev) => ({
      ...prev,
      savedQuestions: [
        ...prev.savedQuestions,
        { id: newId("q"), text: ins.question.trim(), source: ins.questionSource, createdAt: new Date().toISOString() },
      ],
    }));
    if (res.ok) toast.show({ title: "Added to visit questions", description: "It will appear in the visit brief.", tone: "success" });
    else toast.show({ title: "Couldn’t add the question", description: res.error, tone: "attention" });
  };

  // ---- Review summary ----
  const byCategory = useMemo(() => {
    const m = new Map<FindingCategory, number>();
    for (const f of review.findings) m.set(f.category, (m.get(f.category) ?? 0) + 1);
    return [...m.entries()];
  }, [review.findings]);
  const statusOf = (key: string) => {
    let best: { status: string; updatedAt: string } | null = null;
    for (const d of data.reviewDecisions) if (d.findingKey === key && (!best || d.updatedAt >= best.updatedAt)) best = d;
    return best?.status ?? "open";
  };
  const toDiscuss = review.findings.filter((f) => statusOf(f.key) === "to_discuss").length;
  const discussed = review.findings.filter((f) => statusOf(f.key) === "discussed").length;

  // ---- Records drawers ----
  const groupFor = (metric: MetricKey | null): RecordGroup[] => {
    const rows = [...days].reverse().map((c) => {
      // A plain check-in is not a recorded symptom, so it takes neutral ink (no attention colour or dot).
      if (!metric) return { date: c.date, value: "Checked in", counted: false };
      const v = metric === "fall" ? c.answers.fall : metric === "nearFall" ? c.answers.nearFall : c.answers[metric as "dizziness"];
      return { date: c.date, value: v === true ? "Yes" : v === false ? "No" : "Not answered", counted: v === true };
    });
    return [{ heading: rangeText(from, today), rows }];
  };
  const fallGroups: RecordGroup[] = [
    {
      heading: rangeText(from, today),
      summary: `${fall.positive + nearFall.positive} on ${fallsAnswered} answered days`,
      rows: [...days]
        .reverse()
        .filter((c) => c.answers.fall !== null || c.answers.nearFall !== null)
        .map((c) => ({
          date: c.date,
          value: c.answers.fall ? "Fall" : c.answers.nearFall ? "Near-fall" : "Neither",
          counted: c.answers.fall === true || c.answers.nearFall === true,
        })),
    },
  ];

  const acbMeds = review.acb.contributors.map((c) => ({ ...c, med: data.medications.find((m) => m.id === c.medId) }));

  return (
    <div className="cg-ov">
      <PageHeader
        eyebrow={who.hasName ? `Caring for ${p.displayName.trim() || who.name} · ${rangeText(from, today)}` : rangeText(from, today)}
        title={`${who.Possessive} last ${period} days at a glance`}
        actions={
          <div className="cg-ov-header-actions">
            {/* Filter-style chips (soft green when chosen), so the chosen period never looks like the filled
                "Prepare visit brief" button beside it. */}
            <Segmented
              label="Period"
              hideLabel
              value={period}
              onChange={(v) => setParams({ days: String(v) })}
              options={PERIODS.map((d) => ({ value: d, label: `${d} days` }))}
              className="cg-ov-period ui-seg--filter"
            />
            <Button variant="primary" iconLeft={<FileText size={18} aria-hidden="true" />} onClick={() => navigate("/c/brief")}>
              Prepare visit brief
            </Button>
          </div>
        }
      />

      {/* ---- What Kinwise noticed ---- */}
      <section className="cg-ov-noticed" aria-labelledby="ov-noticed-title" data-tour="overview-noticed">
        <header className="cg-ov-noticed__head">
          <span className="cg-ov-noticed__icon" aria-hidden="true">
            <ScanSearch size={22} />
          </span>
          <div>
            <h2 id="ov-noticed-title" className="cg-ov-noticed__title">
              What Kinwise noticed
            </h2>
            <p className="cg-ov-noticed__subtitle">
              {`From ${who.possessive} check-ins and published medicine criteria. Questions, not conclusions.`}
            </p>
          </div>
        </header>
        {insights.length === 0 ? (
          <EmptyState level={3} icon={<CalendarCheck2 size={22} />} title="Nothing stands out yet">
            {days.length < 5
              ? `Kinwise needs at least 5 answered days before and after a medicine change to compare them. ${days.length} of the last ${period} days have a check-in so far.`
              : "No before/after change or medication review prompt to show right now. The timeline below still shows every recorded day."}
          </EmptyState>
        ) : (
          <div className="cg-ov-noticed__list">
            {insights.map((ins, i) => (
              <InsightCard key={ins.key} ins={ins} featured={i === 0} saved={savedTexts.has(ins.question.trim())} onSave={saveQuestion} today={today} />
            ))}
          </div>
        )}
      </section>

      {/* ---- Stats ---- */}
      <section className="cg-ov-stats" aria-label={`Numbers for ${rangeText(from, today)}`}>
        <Stat
          label="Check-ins"
          icon={<CalendarDays size={18} />}
          value={days.length}
          unit={`of ${period} days`}
          detail={lastCheckIn ? `Last check-in ${formatShort(lastCheckIn.date)}` : "No check-ins yet"}
          onShowRecords={days.length ? () => setDrawer("checkins") : undefined}
        />
        <Stat
          label="Dizziness"
          icon={<Waves size={18} />}
          value={dizzy.positive}
          unit={`of ${dizzy.answered} answered days`}
          detail={dizzy.answered ? `Recorded on ${Math.round(dizzy.value * 100)}% of answered days` : "Not answered in this period"}
          onShowRecords={dizzy.answered ? () => setDrawer("dizziness") : undefined}
        />
        <Stat
          label="Falls & near-falls"
          icon={<Footprints size={18} />}
          value={fall.positive + nearFall.positive}
          unit={`on ${fallsAnswered} answered days`}
          detail={`${fall.positive} ${fall.positive === 1 ? "fall" : "falls"} · ${nearFall.positive} ${nearFall.positive === 1 ? "near-fall" : "near-falls"}`}
          onShowRecords={fallsAnswered ? () => setDrawer("falls") : undefined}
        />
        <Stat
          label="Medicines"
          icon={<Pill size={18} />}
          value={active.length}
          unit="active"
          detail={`${otc} over the counter${unmatched ? ` · ${unmatched} not in the reference list` : ""}`}
          onShowRecords={active.length ? () => setDrawer("meds") : undefined}
        />
        <div className="ui-stat cg-ov-acb">
          <Meter
            label="Anticholinergic burden (ACB)"
            value={review.acb.total}
            max={Math.max(6, review.acb.total)}
            bands={ACB_BANDS}
            valueText={`ACB total ${review.acb.total}`}
          />
          {acbMeds.length > 0 ? (
            <ul className="cg-ov-acb__list" role="list">
              {acbMeds.map((c) => (
                <li key={`${c.medId}-${c.ingredientId}`}>
                  <span className="cg-ov-acb__med">{c.med?.name ?? c.ingredientId}</span>
                  <span className="cg-ov-acb__score ui-num">+{c.score}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cg-ov-muted">None of the active medicines is listed on the ACB scale.</p>
          )}
          <p className="cg-ov-acb__note">Each medicine on the published ACB scale scores 1 to 3; the total adds them up.</p>
          <p className="cg-ov-acb__note cg-ov-acb__threshold">{ACB_THRESHOLD_NOTE}</p>
          {acbMeds.length > 0 && <EvidenceLink className="ui-stat__evidence" label="Show the medicines" onClick={() => setDrawer("acb")} />}
        </div>
      </section>

      {/* ---- Timeline chart ---- */}
      <Card as="section" className="cg-ov-chart" aria-labelledby="ov-chart-title" data-tour="overview-chart">
        <CardHeader
          id="ov-chart-title"
          title="Symptom timeline"
          subtitle={`${rangeText(from, today)} · one column per day · hover, tap or use the arrow keys to read a day`}
          icon={<LineChartIcon size={20} />}
          actions={
            <ButtonLink href={href("/c/timeline", focusMed ? { med: focusMed } : undefined)} size="sm" variant="ghost" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
              Open full timeline
            </ButtonLink>
          }
        />
        <div className="cg-ov-chart__body">
          {data.checkIns.length === 0 ? (
            <EmptyState level={3} icon={<CalendarDays size={22} />} title="No check-ins yet">
              When {who.name} saves {who.their} first daily check-in, each day will appear here.
            </EmptyState>
          ) : (
            <TimelineChart
              checkIns={data.checkIns}
              meds={data.medications}
              medEvents={data.medEvents}
              from={from}
              to={today}
              focusMedId={focusMed}
              label={`${who.Possessive} diary, ${rangeText(from, today)}`}
              onDayClick={(d) => navigate("/c/timeline", { day: d, ...(focusMed ? { med: focusMed } : {}) })}
            />
          )}
        </div>
      </Card>

      {/* ---- Today · review · concerns ---- */}
      <div className="cg-ov-lower">
        <Card as="section" aria-labelledby="ov-today-title" className="cg-ov-today">
          <CardHeader id="ov-today-title" title="Today" icon={<CalendarCheck2 size={20} />} subtitle={formatShort(today)} />
          <div className="cg-ov-today__body">
            {todayCheckIn ? (
              <Badge tone="success" icon>
                {who.Name} checked in today
              </Badge>
            ) : (
              <Badge tone="neutral">Not checked in yet today</Badge>
            )}
            {latestStory ? (
              <figure className="cg-ov-today__quote">
                <blockquote className="ui-quote">“{excerptText(latestStory.story, 180)}”</blockquote>
                <figcaption>
                  {who.Name}, {latestStory.date === today ? "today" : formatShort(latestStory.date)}
                </figcaption>
              </figure>
            ) : (
              <p className="cg-ov-muted">
                No stories written yet. {who.hasName ? who.name : "They"} can describe the day in {who.their} own words on the Today screen.
              </p>
            )}
          </div>
        </Card>

        <Card as="section" aria-labelledby="ov-review-title" className="cg-ov-review">
          <CardHeader
            id="ov-review-title"
            title="Medication review"
            icon={<BookOpenCheck size={20} />}
            subtitle={reviewPromptsSummary(review.findings, active.map((m) => m.id))}
          />
          {byCategory.length === 0 ? (
            <p className="cg-ov-muted">No review prompts for the current list. That doesn’t mean the list has been checked by a clinician.</p>
          ) : (
            <ul className="cg-ov-list" role="list">
              {byCategory.slice(0, 5).map(([cat, n]) => (
                // Category name, then its count as words at the right edge ("3 prompts"): a count, not a step number.
                <li key={cat} className="cg-ov-list__row cg-ov-list__row--count">
                  <span className="cg-ov-list__text">{CATEGORY_LABEL[cat] ?? cat}</span>
                  <span className="cg-ov-count ui-num">{promptCountText(n)}</span>
                </li>
              ))}
              {byCategory.length > 5 && (
                <li className="cg-ov-list__more">
                  +{byCategory.slice(5).reduce((s, [, n]) => s + n, 0)} more in {byCategory.length - 5} other{" "}
                  {byCategory.length - 5 === 1 ? "category" : "categories"}
                </li>
              )}
            </ul>
          )}
          <div className="cg-ov-review__foot">
            <span className="cg-ov-muted">
              To discuss: <strong className="ui-num">{toDiscuss}</strong> · Discussed: <strong className="ui-num">{discussed}</strong>
            </span>
            <ButtonLink href={href("/c/review")} size="sm" variant="secondary" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
              Open review
            </ButtonLink>
          </div>
        </Card>

        <Card as="section" aria-labelledby="ov-pinned-title" className="cg-ov-pinned">
          <CardHeader id="ov-pinned-title" title="Pinned concerns" icon={<Pin size={20} />} subtitle="Included in the visit brief" />
          {pinned.length === 0 ? (
            <p className="cg-ov-muted">No pinned concerns. Pinned notes become “Why we’re coming in” on the visit brief.</p>
          ) : (
            <ul className="cg-ov-list" role="list">
              {pinned.slice(0, 3).map((n) => (
                <ListCardRow key={n.id} icon={<MessageSquareQuote size={16} />}>
                  <p className="cg-ov-pinned__text">{n.text}</p>
                  <p className="cg-ov-pinned__meta">
                    {n.author === "caregiver" ? p.caregiverName || "Caregiver" : who.Name} · {formatShort(n.date)}
                  </p>
                </ListCardRow>
              ))}
            </ul>
          )}
          <div className="cg-ov-review__foot">
            <span className="cg-ov-muted">
              <ClipboardList size={15} aria-hidden="true" className="cg-ov-inline-icon" />
              <strong className="ui-num">{data.savedQuestions.length}</strong> visit {data.savedQuestions.length === 1 ? "question" : "questions"} saved
            </span>
            <ButtonLink href={href("/c/brief")} size="sm" variant="secondary" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
              Visit brief
            </ButtonLink>
          </div>
        </Card>
      </div>

      {/* ---- Drawers ---- */}
      <RecordsDrawer
        open={drawer === "checkins"}
        onClose={() => setDrawer(null)}
        title="Check-ins"
        description={`${days.length} of ${period} days have a check-in. Days without one are left out of every count.`}
        groups={groupFor(null)}
      />
      <RecordsDrawer
        open={drawer === "dizziness"}
        onClose={() => setDrawer(null)}
        title="Dizziness"
        description={`Recorded on ${dizzy.positive} of ${dizzy.answered} answered days. Unanswered days are not counted as “no”.`}
        groups={groupFor("dizziness").map((g) => ({ ...g, summary: `${dizzy.positive} of ${dizzy.answered} answered days`, rows: g.rows.filter((r) => r.value !== "Not answered") }))}
      />
      <RecordsDrawer
        open={drawer === "falls"}
        onClose={() => setDrawer(null)}
        title="Falls & near-falls"
        description="Falls and near-falls are listed by date. Each one is worth mentioning to the clinician."
        groups={fallGroups}
      />
      <Drawer open={drawer === "acb"} onClose={() => setDrawer(null)} eyebrow="The records" title="Anticholinergic burden (ACB)" size="md"
        description={`Total ${review.acb.total} (${review.acb.band}). Each listed medicine scores 1–3 on the Anticholinergic Cognitive Burden scale; the total adds them up.`}
      >
        <ul className="cg-ov-drawer-list" role="list">
          {acbMeds.length === 0 && <li className="cg-ov-muted">None of the active medicines is listed on the ACB scale.</li>}
          {acbMeds.map((c) => (
            <li key={`${c.medId}-${c.ingredientId}`}>
              <span>
                <strong>{c.med?.name ?? c.ingredientId}</strong>
                <span className="cg-ov-muted"> · {c.ingredientId}</span>
              </span>
              <span className="cg-ov-score ui-num">ACB {c.score}</span>
            </li>
          ))}
        </ul>
      </Drawer>
      <Drawer open={drawer === "meds"} onClose={() => setDrawer(null)} eyebrow="The records" title="Active medicines" size="md"
        description={`${active.length} active · ${otc} over the counter. Edit the list on the Medications screen.`}
      >
        <ul className="cg-ov-drawer-list" role="list">
          {active.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.name}</strong>
                <span className="cg-ov-muted">
                  {" "}
                  · {[m.dose, m.frequency].filter(Boolean).join(", ")}
                  {m.reason ? ` · ${m.reason}` : ""}
                </span>
              </span>
              <span className="cg-ov-drawer-tags">
                {m.otc && <Badge size="sm">OTC</Badge>}
                {review.unmatchedMedIds.includes(m.id) && <Badge size="sm" tone="info">Not in reference list</Badge>}
                <span className="cg-ov-muted ui-num">since {formatShort(m.startDate)}</span>
              </span>
            </li>
          ))}
        </ul>
        <ButtonLink href={href("/c/meds")} variant="secondary" size="sm" className="cg-ov-drawer-link" onClick={() => setDrawer(null)}>
          Open Medications
        </ButtonLink>
      </Drawer>
    </div>
  );
}
