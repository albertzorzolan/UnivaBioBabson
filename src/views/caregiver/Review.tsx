// Caregiver › Medication review (/c/review): the deterministic, citation-backed review of the medication list —
// ACB meter, fall-risk medicines, Beers summary, findings grouped by category with diary links, the question for
// each visit, and the caregiver's decisions (SPEC-UI "Medication review").
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, FileText, Info, PackageSearch, Pill, ShieldCheck, X } from "lucide-react";
import type { FindingCategory, MetricKey, ReviewStatus } from "../../model/types";
import { formatShort } from "../../model/dates";
import { CATEGORY_LABEL, REQUIRED_NOTICE } from "../../engine/meds";
import { CONDITION_PHRASE } from "../../engine/meds/text";
import { KB, kbCoverage } from "../../kb";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { href, navigate, useRoute } from "../../app/router";
import { Badge, ButtonLink, Callout, Card, CardHeader, Chip, EmptyState, PageHeader, SourceCitation, useToast } from "../../ui";
import { RecordsDrawer, rangeText, type RecordGroup } from "../shared/caregiver-Records";
import { FindingCard } from "./meds/FindingCard";
import { AcbCard, BeersCard, FallsCard } from "./meds/ReviewCards";
import {
  CATEGORY_CHIP,
  addSavedQuestion,
  decisionMap,
  groupByCategory,
  metricCount,
  metricRows,
  recentDiary,
  removeSavedQuestion,
  savedQuestionFor,
  setDecision,
} from "./meds/reviewRecords";
import { getMetric } from "../../engine/timeline/metrics";
import "./meds.css";
import "./review.css";

type Filter = "all" | FindingCategory;

function metricLabel(m: MetricKey): string {
  try {
    return getMetric(m).label;
  } catch {
    return m;
  }
}

export function Review() {
  const { data, today, update } = useStore();
  const { review, timeline, active } = useDerived();
  const { params } = useRoute();
  const toast = useToast();
  const person = data.profile.preferredName || "they";
  const Person = data.profile.preferredName || "They";
  const whose = data.profile.preferredName ? `${data.profile.preferredName}’s` : "their";

  const [filter, setFilter] = useState<Filter>("all");
  const [records, setRecords] = useState<{ title: string; groups: RecordGroup[] } | null>(null);
  const medFilter = params.get("med");
  const focusKey = params.get("finding");

  const meds = useMemo(() => new Map(data.medications.map((m) => [m.id, m])), [data.medications]);
  const activeMap = useMemo(() => new Map(active.map((m) => [m.id, m])), [active]);
  const signals = useMemo(() => new Map(timeline.signals.map((s) => [s.id, s])), [timeline.signals]);
  const facts = useMemo(() => recentDiary(data, today), [data, today]);
  const decisions = useMemo(() => decisionMap(data.reviewDecisions), [data.reviewDecisions]);
  const filterMed = medFilter ? meds.get(medFilter) : undefined;

  const scoped = useMemo(
    () => (filterMed ? review.findings.filter((f) => f.medIds.includes(filterMed.id)) : review.findings),
    [review.findings, filterMed],
  );
  const categories = useMemo(() => groupByCategory(scoped).map((g) => ({ category: g.category, count: g.findings.length })), [scoped]);
  const effectiveFilter: Filter = filter !== "all" && !categories.some((c) => c.category === filter) ? "all" : filter;
  const visible = effectiveFilter === "all" ? scoped : scoped.filter((f) => f.category === effectiveFilter);
  const groups = groupByCategory(visible);
  const topKey = visible[0]?.key;

  const statusCounts = useMemo(() => {
    const c: Record<ReviewStatus, number> = { open: 0, to_discuss: 0, discussed: 0, dismissed: 0 };
    for (const f of review.findings) c[decisions.get(f.key)?.status ?? "open"]++;
    return c;
  }, [review.findings, decisions]);
  const linkedCount = review.findings.filter((f) => f.relatedSymptoms.length > 0 || f.signalIds.length > 0).length;

  // A new medicine scope starts from all categories.
  useEffect(() => setFilter("all"), [medFilter]);

  // Deep link to one finding (#/c/review?finding=<key>): scroll it into view once it renders.
  useEffect(() => {
    if (!focusKey) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById(`finding-${focusKey}`)?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusKey]);

  const unmatched = review.unmatchedMedIds.map((id) => meds.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const notices = review.notices.filter((n) => n !== REQUIRED_NOTICE && !(unmatched.length > 0 && /reference set/.test(n)));
  const coverage = useMemo(() => {
    try {
      return kbCoverage();
    } catch {
      return null;
    }
  }, []);

  const now = () => new Date().toISOString();
  const onDecision = (key: string, status: ReviewStatus, note: string) => {
    const res = update("caregiver", (prev) => setDecision(prev, key, status, note, now()));
    if (!res.ok) toast.show({ tone: "attention", title: "Couldn’t save that", description: res.error });
  };
  const onToggleQuestion = (key: string) => {
    const f = review.findings.find((x) => x.key === key);
    if (!f) return;
    const existing = savedQuestionFor(data, f);
    const res = update("caregiver", (prev) => (existing ? removeSavedQuestion(prev, existing.id) : addSavedQuestion(prev, f, now())));
    if (!res.ok) {
      toast.show({ tone: "attention", title: "Couldn’t save that", description: res.error });
      return;
    }
    if (!existing)
      toast.show({
        tone: "success",
        title: "Added to visit questions",
        description: `${data.savedQuestions.length + 1} saved for the visit brief.`,
        action: { label: "Open visit brief", onClick: () => navigate("/c/brief") },
      });
  };

  const showMetricRecords = (m: MetricKey) => {
    const c = metricCount(facts, m);
    setRecords({
      title: `${metricLabel(m)} · last 30 days`,
      groups: [{ heading: rangeText(facts.recentFrom, today), summary: `${c.positive} of ${c.answered} answered days`, rows: metricRows(data, m, facts.recentFrom, today) }],
    });
  };
  const showFallRecords = () => {
    const make = (m: MetricKey, heading: string): RecordGroup => {
      const c = metricCount(facts, m);
      return { heading, summary: `${c.positive} of ${c.answered} answered days`, rows: metricRows(data, m, facts.recentFrom, today) };
    };
    setRecords({
      title: `Falls, near-falls and dizziness · ${rangeText(facts.recentFrom, today)}`,
      groups: [make("fall", "Falls"), make("nearFall", "Near-falls"), make("dizziness", "Dizziness")],
    });
  };

  // ---- Empty record ---------------------------------------------------------
  if (active.length === 0) {
    return (
      <div className="cg-review">
        <PageHeader eyebrow={`${data.profile.preferredName || "Patient"} · medication review`} title="Medication review" />
        <Card padding="lg">
          <EmptyState
            icon={<Pill size={28} />}
            title="No current medicines to review"
            action={
              <ButtonLink href={href("/c/meds", { add: "1" })} variant="primary">
                Add a medication
              </ButtonLink>
            }
          >
            <p>
              Once {whose} medicines are on the list, Kinwise checks them against published criteria geriatric clinicians use and turns
              anything worth asking about into a question for the visit.
            </p>
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="cg-review">
      <PageHeader
        eyebrow={`${data.profile.preferredName || "Patient"} · medication review`}
        title="Medication review"
        subtitle={`Kinwise checked ${whose} ${active.length} ${active.length === 1 ? "medicine" : "medicines"} against published criteria geriatric clinicians use. These are questions to bring to ${data.profile.sex === "male" ? "his" : data.profile.sex === "female" ? "her" : "their"} doctor or pharmacist — not instructions.`}
        actions={
          <ButtonLink href={href("/c/brief")} variant="secondary" iconLeft={<FileText size={18} aria-hidden="true" />}>
            Prepare visit brief
          </ButtonLink>
        }
      >
        <p className="cg-review__safety">
          <ShieldCheck size={16} aria-hidden="true" />
          Don’t stop or change any medicine without talking to the prescriber.
        </p>
      </PageHeader>

      <ul className="cg-review__tally" role="list" aria-label="Review progress">
        <li>
          <strong className="ui-num">{review.findings.length}</strong> review {review.findings.length === 1 ? "prompt" : "prompts"}
        </li>
        <li>
          <strong className="ui-num">{linkedCount}</strong> seen in the diary
        </li>
        <li>
          <strong className="ui-num">{statusCounts.to_discuss}</strong> to discuss
        </li>
        <li>
          <strong className="ui-num">{statusCounts.discussed}</strong> discussed
        </li>
        <li>
          <strong className="ui-num">{statusCounts.dismissed}</strong> not relevant
        </li>
        <li>
          <a href={href("/c/brief")}>
            <strong className="ui-num">{data.savedQuestions.length}</strong> visit {data.savedQuestions.length === 1 ? "question" : "questions"} saved
          </a>
        </li>
      </ul>

      <div className="cg-review__cards">
        <AcbCard review={review} meds={activeMap} person={person} />
        <FallsCard review={review} meds={activeMap} facts={facts} person={person} onShowRecords={showFallRecords} />
        <BeersCard review={review} meds={activeMap} person={person} />
      </div>

      <section className="cg-review__findings" aria-labelledby="cg-review-findings">
        <div className="cg-review__findings-head">
          <h2 id="cg-review-findings" className="cg-review__h2">
            Questions worth asking
          </h2>
          <p className="cg-review__lead">Prompts connected to what {person} recorded in the diary come first.</p>
        </div>

        <Callout tone="info" className="cg-review__notice">
          {REQUIRED_NOTICE}
        </Callout>
        {notices.map((n) => (
          <Callout key={n} tone="caution" className="cg-review__notice">
            {n}
          </Callout>
        ))}

        {scoped.length > 0 && (
          <div className="cg-review__filters" role="group" aria-label="Filter prompts by kind">
            <Chip pressed={effectiveFilter === "all"} onPressedChange={() => setFilter("all")} count={scoped.length}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.category}
                pressed={effectiveFilter === c.category}
                onPressedChange={(on) => setFilter(on ? c.category : "all")}
                count={c.count}
              >
                {CATEGORY_CHIP[c.category] ?? c.category}
              </Chip>
            ))}
          </div>
        )}

        {filterMed && (
          <p className="cg-review__scope">
            <span>
              Showing prompts that involve <strong>{filterMed.name}</strong>
            </span>
            <button type="button" className="cg-review__scope-clear" onClick={() => navigate("/c/review")}>
              <X size={14} aria-hidden="true" /> Show all
            </button>
          </p>
        )}

        {review.findings.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon={<BookOpen size={28} />} title="No review prompts from the criteria Kinwise checks" level={3}>
              <p>That isn’t a guarantee. The pharmacist can also check doses, allergies and interactions Kinwise doesn’t cover.</p>
            </EmptyState>
          </Card>
        ) : visible.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon={<BookOpen size={28} />} title="No prompts match" level={3}>
              <p>{filterMed ? `None of the review prompts involve ${filterMed.name}.` : "Try another filter."}</p>
            </EmptyState>
          </Card>
        ) : (
          groups.map((g) => (
            <section key={g.category} className="cg-review__group" aria-labelledby={`cg-group-${g.category}`}>
              <h3 id={`cg-group-${g.category}`} className="cg-review__group-title">
                {CATEGORY_LABEL[g.category] ?? g.category}
                <span className="cg-review__group-count ui-num">{g.findings.length}</span>
              </h3>
              <div className="cg-review__list">
                {g.findings.map((f) => (
                  <FindingCard
                    key={f.key}
                    finding={f}
                    meds={meds}
                    signals={signals}
                    counts={(m) => metricCount(facts, m)}
                    decision={decisions.get(f.key)}
                    saved={Boolean(savedQuestionFor(data, f))}
                    person={person}
                    highlight={focusKey === f.key}
                    tourId={f.key === topKey ? "review-finding" : undefined}
                    onDecision={(status, note) => onDecision(f.key, status, note)}
                    onToggleQuestion={() => onToggleQuestion(f.key)}
                    onShowRecords={showMetricRecords}
                    onOpenTimeline={(medId) => navigate("/c/timeline", { med: medId })}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </section>

      {unmatched.length > 0 && (
        <Card as="section" tone="sunken" aria-labelledby="cg-review-unmatched" className="cg-review__unmatched">
          <CardHeader
            id="cg-review-unmatched"
            icon={<PackageSearch size={20} />}
            title="Not reviewed"
            subtitle="These aren’t in Kinwise’s reference list, so none of the checks above include them."
          />
          <ul className="cg-unmatched-list" role="list">
            {unmatched.map((m) => (
              <li key={m.id}>
                <p>
                  Kinwise has no reference information for <strong>{m.name}</strong> — that doesn’t mean anything about {m.name}; ask the
                  pharmacist.
                </p>
                <a className="cg-unmatched-list__fix" href={href("/c/meds", { edit: m.id })}>
                  Check the spelling<span className="ui-visually-hidden"> of {m.name}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card as="section" aria-labelledby="cg-review-about" className="cg-review__about">
        <CardHeader id="cg-review-about" icon={<Info size={20} />} title="About this review" level={2} />
        <div className="cg-about">
          <div className="cg-about__col">
            <p className="cg-about__label">What was considered</p>
            {review.effectiveConditions.length > 0 ? (
              <ul className="cg-about__conditions" role="list">
                {review.effectiveConditions.map((c) => (
                  <li key={c.tag}>
                    <span>{CONDITION_PHRASE[c.tag]?.replace(/^(a|an) /, "") ?? c.tag}</span>
                    <Badge size="sm" tone={c.from === "diary" ? "info" : "neutral"}>
                      {c.from === "diary" ? "from the diary" : "from the profile"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cg-about__text">No health conditions are recorded. Add them in Settings so condition-specific criteria can apply.</p>
            )}
            <p className="cg-about__text">
              {Person}, age {data.profile.age} · kidney function{" "}
              {data.profile.crclMlMin != null ? `CrCl ${data.profile.crclMlMin} mL/min` : "not recorded"} · {active.length} current{" "}
              {active.length === 1 ? "medicine" : "medicines"}
            </p>
          </div>
          <div className="cg-about__col">
            <p className="cg-about__label">Reference list</p>
            <p className="cg-about__text">{KB.coverageNote}</p>
            {coverage && (
              <p className="cg-about__text ui-num">
                {coverage.drugs} medicines · {coverage.combos} combination products · {coverage.beersRules} Beers rules · {coverage.cascades}{" "}
                prescribing cascades · {coverage.fridClasses} fall-risk classes
              </p>
            )}
            <p className="cg-about__meta">
              Reference version {review.kbVersion} · list checked {formatShort(today)} · runs on this device
            </p>
          </div>
        </div>
        {KB.sources.length > 0 && (
          <div className="cg-about__sources">
            <p className="cg-about__label">Sources</p>
            <div className="cg-about__chips">
              {KB.sources.map((s) => (
                <SourceCitation key={s.id} source={s} />
              ))}
            </div>
          </div>
        )}
      </Card>

      <RecordsDrawer
        open={records !== null}
        onClose={() => setRecords(null)}
        title={records?.title ?? ""}
        description="Each answered check-in in this period. Days without a check-in aren’t counted."
        groups={records?.groups ?? []}
      />
    </div>
  );
}
