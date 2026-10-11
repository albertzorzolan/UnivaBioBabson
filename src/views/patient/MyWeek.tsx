// My week (/p/week) — this week vs last week in Margaret's own notes (weeklyTrends), a 7-day row of
// dots per item (filled = yes, hollow = no, dash = no entry; always with words for screen readers),
// and her entries with her words in quotes. Purely descriptive: no reasons, no judgements.
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BatteryMedium,
  BedDouble,
  CalendarPlus,
  CloudFog,
  Droplets,
  Footprints,
  Moon,
  Pencil,
  PersonStanding,
  Sun,
  Utensils,
  Waves,
} from "lucide-react";
import type { CheckIn, ISODate, MetricKey, WeeklyTrend } from "../../model/types";
import { addDays, dateRange, daysBetween, formatLong, formatRelative, formatShort, parseDate } from "../../model/dates";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { href, navigate } from "../../app/router";
import { METRICS, getMetric } from "../../engine/timeline/metrics";
import { Badge, Button, ButtonLink, EmptyState, PageHeader, cx } from "../../ui";
import { ENERGY_WORDS, SEVERITY_WORDS, SLEEP_WORDS, isEditableDate } from "./checkin";
import { conceptLabel } from "./HeardPanel";
import "./patient.css";

const METRIC_ICON: Record<MetricKey, ReactNode> = {
  dizziness: <Waves size={24} />,
  drowsiness: <Moon size={24} />,
  confusion: <CloudFog size={24} />,
  fall: <PersonStanding size={24} />,
  nearFall: <Footprints size={24} />,
  swelling: <Droplets size={24} />,
  appetiteWorse: <Utensils size={24} />,
  energy: <BatteryMedium size={24} />,
  sleep: <BedDouble size={24} />,
};

/** Day value for a metric from a check-in: true/false/number, or null when unanswered or no entry. */
function dayValue(c: CheckIn | undefined, m: MetricKey): boolean | number | null {
  if (!c) return null;
  const a = c.answers;
  if (m === "appetiteWorse") return a.appetite === null ? null : a.appetite === "worse";
  const v = a[m];
  return v === undefined ? null : (v as boolean | number | null);
}

function short(date: ISODate): string {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "short" });
}

/** Words for the week-over-week badge. Neutral tone on purpose: these are notes, not verdicts. */
function changeWords(t: WeeklyTrend): { text: string; icon: ReactNode } | null {
  if (t.direction === "not_enough") return null;
  if (t.direction === "same") return { text: "About the same as last week", icon: <ArrowRight size={14} aria-hidden="true" /> };
  const up = t.thisWeek.value > t.lastWeek.value;
  const kind = getMetric(t.metric).kind;
  const text = kind === "scale" ? (up ? "Higher than last week" : "Lower than last week") : up ? "More days than last week" : "Fewer days than last week";
  return { text, icon: up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" /> };
}

function DotRow({ metric, days, byDate }: { metric: MetricKey; days: ISODate[]; byDate: Map<ISODate, CheckIn> }) {
  const def = getMetric(metric);
  return (
    <ol className="pt-dots" aria-label={`${def.label}, day by day`}>
      {days.map((d) => {
        const v = dayValue(byDate.get(d), metric);
        const entry = byDate.has(d);
        let state: "yes" | "no" | "none" | "scale";
        let words: string;
        if (def.kind === "scale") {
          state = v === null ? "none" : "scale";
          words = v === null ? (entry ? "not answered" : "no entry") : `${String(v)} out of 5`;
        } else {
          state = v === true ? "yes" : v === false ? "no" : "none";
          words = v === true ? "yes" : v === false ? "no" : entry ? "not answered" : "no entry";
        }
        return (
          <li key={d} className="pt-dots__day">
            <span className={cx("pt-dot", `pt-dot--${state}`)} data-metric={metric} aria-hidden="true">
              {state === "scale" ? String(v) : null}
            </span>
            <span className="pt-dots__label" aria-hidden="true">
              <span className="pt-dots__long">{short(d)}</span>
              <span className="pt-dots__short">{short(d).slice(0, 2)}</span>
            </span>
            <span className="ui-visually-hidden">
              {formatShort(d)}: {words}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function TrendCard({ t, days, byDate }: { t: WeeklyTrend; days: ISODate[]; byDate: Map<ISODate, CheckIn> }) {
  const def = getMetric(t.metric);
  const change = changeWords(t);
  return (
    <li className="pt-trend" data-metric={t.metric}>
      <div className="pt-trend__head">
        <span className="pt-trend__icon" aria-hidden="true">
          {METRIC_ICON[t.metric]}
        </span>
        <h3 className="pt-trend__title">{def.label}</h3>
        {change && (
          <Badge tone="neutral" size="sm" icon={change.icon} className="pt-trend__change">
            {change.text}
          </Badge>
        )}
      </div>
      <p className="pt-trend__text">{t.text}</p>
      <DotRow metric={t.metric} days={days} byDate={byDate} />
    </li>
  );
}

/** Short, factual chips for one entry: what was noted, plus energy and sleep ratings. */
function entryChips(c: CheckIn): string[] {
  const a = c.answers;
  const out: string[] = [];
  if (a.dizziness) out.push(a.dizzinessSeverity ? `Dizzy — ${SEVERITY_WORDS[a.dizzinessSeverity].toLowerCase()}` : "Dizzy");
  if (a.drowsiness) out.push("Drowsy");
  if (a.confusion) out.push("Confused or foggy");
  if (a.fall) out.push("A fall");
  if (a.nearFall) out.push("A near-fall");
  if (a.swelling) out.push("Ankle swelling");
  if (a.appetite === "worse") out.push("Appetite less than usual");
  for (const o of c.otherSymptoms) if (o.present) out.push(conceptLabel(o.conceptId));
  return out;
}

function Entry({ date, c, today }: { date: ISODate; c: CheckIn | undefined; today: ISODate }) {
  const editable = isEditableDate(date, today);
  const isToday = date === today;
  const dateTitle = parseDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const ago = daysBetween(date, today);
  const relative = ago < 7 ? formatRelative(date, today) : null;
  const open = () => navigate("/p/today", isToday ? undefined : { date });
  if (!c) {
    return (
      <li className="pt-entry pt-entry--empty">
        <div className="pt-entry__head">
          <h3 className="pt-entry__date">
            {dateTitle}
            {relative && <span className="pt-entry__rel"> · {relative}</span>}
          </h3>
          {editable && (
            <Button variant="ghost" size="lg" iconLeft={<CalendarPlus size={20} aria-hidden="true" />} onClick={open} aria-label={`Add ${dateTitle}`}>
              Add this day
            </Button>
          )}
        </div>
        <p className="pt-entry__none">No entry for this day — that’s fine.</p>
      </li>
    );
  }
  const chips = entryChips(c);
  const a = c.answers;
  const answered = [a.energy, a.sleep, a.appetite, a.dizziness, a.drowsiness, a.confusion, a.fall, a.nearFall, a.swelling].filter((v) => v !== null).length;
  return (
    <li className="pt-entry">
      <div className="pt-entry__head">
        <h3 className="pt-entry__date">
          {dateTitle}
          {relative && <span className="pt-entry__rel"> · {relative}</span>}
          {c.revision > 1 && <span className="pt-entry__edited">Changed later</span>}
        </h3>
        {editable && (
          <Button variant="ghost" size="lg" iconLeft={<Pencil size={18} aria-hidden="true" />} onClick={open} aria-label={`Change ${dateTitle}`}>
            Change this day
          </Button>
        )}
      </div>
      {c.story.trim() && <blockquote className="pt-entry__story">“{c.story.trim()}”</blockquote>}
      <ul role="list" className="pt-entry__chips" aria-label="What you noted">
        {a.energy !== null && (
          <li className="pt-chip pt-chip--scale">
            <BatteryMedium size={16} aria-hidden="true" /> Energy: {ENERGY_WORDS[a.energy].toLowerCase()} ({a.energy} of 5)
          </li>
        )}
        {a.sleep !== null && (
          <li className="pt-chip pt-chip--scale">
            <BedDouble size={16} aria-hidden="true" /> Sleep: {SLEEP_WORDS[a.sleep].toLowerCase()} ({a.sleep} of 5)
          </li>
        )}
        {chips.map((t) => (
          <li key={t} className="pt-chip pt-chip--yes">
            {t}
          </li>
        ))}
        {chips.length === 0 && answered > 0 && <li className="pt-chip">No symptoms noted</li>}
      </ul>
      <p className="pt-entry__meta">
        {answered} of 9 questions answered
      </p>
    </li>
  );
}

export function MyWeek() {
  const { data, today } = useStore();
  const { weekly } = useDerived();
  const [showOlder, setShowOlder] = useState(false);
  const from = addDays(today, -6);
  const days = useMemo(() => dateRange(from, today), [from, today]);
  const byDate = useMemo(() => {
    const m = new Map<ISODate, CheckIn>();
    for (const c of data.checkIns) m.set(c.date, c);
    return m;
  }, [data.checkIns]);
  const weekCount = days.filter((d) => byDate.has(d)).length;

  const trends = useMemo(() => {
    const byMetric = new Map(weekly.map((t) => [t.metric, t]));
    return METRICS.map((m) => byMetric.get(m.key)).filter((t): t is WeeklyTrend => Boolean(t));
  }, [weekly]);
  const noted = trends.filter((t) => getMetric(t.metric).kind === "boolean" && t.thisWeek.positive > 0);
  const scales = trends.filter((t) => getMetric(t.metric).kind === "scale");
  const quiet = trends.filter((t) => getMetric(t.metric).kind === "boolean" && t.thisWeek.positive === 0);

  // Entries: the last 7 days always (including days without an entry), then older check-ins on request.
  const recent = [...days].reverse();
  const older = data.checkIns
    .filter((c) => c.date < from)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const olderShown = showOlder ? older : older.slice(0, 7);

  const header = (
    <PageHeader
      eyebrow="My week"
      title="How this week went"
      subtitle={`${formatShort(from)} – ${formatShort(today)} · ${weekCount === 0 ? "no check-ins this week yet" : `you checked in on ${weekCount} of 7 days`}.`}
      className="pt-page-header"
    />
  );

  if (data.checkIns.length === 0) {
    return (
      <div className="pt-week">
        {header}
        <section className="pt-panel">
          <EmptyState
            icon={<Sun size={28} />}
            title="No entries yet"
            action={
              <ButtonLink href={href("/p/today")} variant="primary" size="lg">
                Do today’s check-in
              </ButtonLink>
            }
          >
            Once you’ve told me about a few days, you’ll see how this week compares with last week here.
          </EmptyState>
        </section>
      </div>
    );
  }

  return (
    <div className="pt-week">
      {header}
      <div className="pt-week__flow">
        <section className="pt-panel" aria-labelledby="pt-week-noted">
          <div className="pt-section-head">
            <div>
              <h2 id="pt-week-noted" className="pt-section-title">
                What you noted
              </h2>
              <p className="pt-section-lead">This week compared with the week before, counting only the days you answered.</p>
            </div>
            <ul role="list" className="pt-legend" aria-label="How to read the dots">
              <li>
                <span className="pt-dot pt-dot--yes pt-dot--legend" aria-hidden="true" /> Yes
              </li>
              <li>
                <span className="pt-dot pt-dot--no pt-dot--legend" aria-hidden="true" /> No
              </li>
              <li>
                <span className="pt-dot pt-dot--none pt-dot--legend" aria-hidden="true" /> No entry
              </li>
            </ul>
          </div>
          {noted.length === 0 && (
            <p className="pt-week__calm">Nothing from the list was noted this week.</p>
          )}
          <ul role="list" className="pt-trends">
            {[...noted, ...scales].map((t) => (
              <TrendCard key={t.metric} t={t} days={days} byDate={byDate} />
            ))}
          </ul>
        </section>

        {quiet.length > 0 && (
          <section className="pt-panel" aria-labelledby="pt-week-quiet">
            <h2 id="pt-week-quiet" className="pt-section-title">
              Not noted this week
            </h2>
            <ul role="list" className="pt-quiet">
              {quiet.map((t) => (
                <li key={t.metric} className="pt-quiet__row">
                  <span className="pt-quiet__icon" aria-hidden="true">
                    {METRIC_ICON[t.metric]}
                  </span>
                  <div className="pt-quiet__text">
                    <h3 className="pt-quiet__title">{getMetric(t.metric).label}</h3>
                    <p className="pt-quiet__sentence">{t.text}</p>
                  </div>
                  <DotRow metric={t.metric} days={days} byDate={byDate} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="pt-panel" aria-labelledby="pt-week-entries">
          <h2 id="pt-week-entries" className="pt-section-title">
            Your entries
          </h2>
          <p className="pt-section-lead">Your own words, newest first. You can change any of the last 7 days.</p>
          <ol className="pt-entries">
            {recent.map((d) => (
              <Entry key={d} date={d} c={byDate.get(d)} today={today} />
            ))}
          </ol>
          {older.length > 0 && (
            <>
              <h3 className="pt-entries__older">Earlier</h3>
              <ol className="pt-entries">
                {olderShown.map((c) => (
                  <Entry key={c.date} date={c.date} c={c} today={today} />
                ))}
              </ol>
              {older.length > olderShown.length && (
                <Button variant="secondary" size="lg" onClick={() => setShowOlder(true)} className="pt-entries__more">
                  Show {older.length - olderShown.length} older {older.length - olderShown.length === 1 ? "entry" : "entries"}
                </Button>
              )}
            </>
          )}
        </section>

        <p className="pt-week__footnote">
          These are your own notes. They don’t explain why something happens — that’s a conversation for your doctor.
          <span className="ui-visually-hidden"> Week of {formatLong(from)}.</span>
        </p>
      </div>
    </div>
  );
}
