// How Kinwise works — the page for judges and clinicians (SPEC §4, §5, §9, §12; SPEC-UI "Public").
//
// Visible by default (what a judge needs in a few minutes):
//   problem → three steps + who it's for → "What is AI here?" → LIVE evaluation (NLP benchmark + medication-review
//   case suite, both run in this browser) → a recorded real model run → finished / partial / planned + limits
//   → privacy and what Kinwise never does → team and source code.
// Behind native <details> in "Reference": the architecture diagram, knowledge-base coverage with every source,
// and the regulatory notes. Deep links (?section=…) open the block they point to.
//
// Every number about Kinwise itself (scores, KB counts) is computed on this page from the code and data that
// ship with it, or read from a committed results file named next to it; the research figures are quoted with
// their sources (howContent.ts).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpenCheck,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock3,
  Code,
  Cpu,
  FileText,
  FlaskConical,
  Gauge,
  History,
  ListChecks,
  LockKeyhole,
  PlayCircle,
  ScanText,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { Avatar, Badge, Button, ButtonLink, Callout, Card, CardBody, CardHeader, cx, Disclosure, PageHeader, SourceCitation, useMediaQuery } from "../../ui";
import { KB, kbCoverage } from "../../kb";
import { CATEGORY_LABEL } from "../../engine/meds/review";
import type { DiaryField, FindingCategory } from "../../model/types";
import type { FieldError } from "../../engine/nlp/evaluate";
import { startTour } from "../../app/Tour";
import { useRoute } from "../../app/router";
import { HowArchitecture } from "./HowArchitecture";
import { floorPct, microRates, pct, runMedSuite, runNlpBenchmark, type CorpusRun, type MedRun, type NlpRun } from "./howEval";
import { AI_DRAFT_HINT, FLOW_STEPS, PROBLEM_STATS, REFS, WHO_FOR, type Ref } from "./howContent";
import { LIMITATIONS, statusGroups, type Status } from "./howStatus";
import { BATCH_SENTENCE, RECORDED_RUN, RED_TEAM, RED_TEAM_SENTENCE, RUN_MORE_SUMMARY, type RecordedAsk } from "./modelRun";
import { HELDOUT_BASELINE_F1 } from "./proofPoints";
import { CODE_TOUR_URL, SOURCE_CODE_URL } from "./links";
import "./public-how.css";
import "./how-extras.css";

// ---------------------------------------------------------------------------------------------
// Static content (research quotes live in howContent.ts, each with its source)

const SECTIONS: { id: string; label: string }[] = [
  { id: "how-problem", label: "Problem" },
  { id: "how-flow", label: "Who it’s for" },
  { id: "how-ai", label: "What is AI here?" },
  { id: "how-evaluation", label: "Live evaluation" },
  { id: "how-model-run", label: "Recorded AI run" },
  { id: "how-honesty", label: "Finished vs planned" },
  { id: "how-trust", label: "Privacy" },
  { id: "how-reference", label: "Sources" },
  { id: "how-team", label: "Team & code" },
];

/** Collapsed reference blocks that ?section= may also open (older links used these ids as sections). */
const REFERENCE_BLOCKS = ["how-architecture", "how-knowledge", "how-regulation"];

const FIELD_LABEL: Record<DiaryField, string> = {
  energy: "Energy (1–5)",
  sleep: "Sleep (1–5)",
  appetite: "Appetite",
  dizziness: "Dizziness",
  dizzinessSeverity: "Dizziness strength",
  drowsiness: "Drowsiness",
  confusion: "Confusion",
  fall: "Fall",
  nearFall: "Near-fall",
  swelling: "Ankle swelling",
};

const COVERAGE_LABEL: Record<string, string> = {
  drugs: "medicines",
  combos: "combination products",
  beersRules: "AGS Beers rules",
  acbListed: "with an anticholinergic score",
  fridClasses: "fall-risk drug classes",
  cascades: "prescribing cascades",
  monitoringRules: "“what to watch for” rules",
  sources: "published sources",
};

const BEERS_TABLE_LABEL: Record<string, string> = {
  beers_pim: "Table 2 · generally avoid",
  beers_condition: "Table 3 · medicine + condition",
  beers_caution: "Table 4 · use with caution",
  beers_interaction: "Table 5 · combinations",
  beers_renal: "Table 6 · kidney function",
  beers_anticholinergic: "Table 7 · anticholinergics",
};

// ---------------------------------------------------------------------------------------------
// Small helpers

function fmtValue(v: FieldError["gold"]): string {
  if (v === null || v === undefined) return "—";
  if (v === true) return "yes";
  if (v === false) return "no";
  return String(v);
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RefLink({ r }: { r: Ref }) {
  return <SourceCitation source={{ short: r.short, url: r.url, citation: r.citation }} variant="inline" />;
}

/** One page section. The h2 carries the section's name (no separate label above it), so the page stays short. */
function Section({
  id,
  title,
  lead,
  tour,
  children,
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  tour?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="pub-how-section" aria-labelledby={`${id}-title`} data-tour={tour}>
      <header className="pub-how-section__head">
        <h2 id={`${id}-title`} className="pub-how-section__title" tabIndex={-1}>
          {title}
        </h2>
        {lead && <p className="pub-how-section__lead">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

/** 0–1 score as a thin bar (decorative; the number is always printed next to it). */
function ScoreBar({ value }: { value: number }) {
  return (
    <span className="pub-how-bar" aria-hidden="true">
      <span className="pub-how-bar__fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Live evaluation: NLP benchmark

type RunState<T> = { status: "idle" } | { status: "running" } | { status: "done"; run: T } | { status: "error"; message: string };

/**
 * One corpus' scores. `baseline` (held-out only) is the lexicon-only F1 from the committed results file, shown for
 * comparison when that file has one; it is not re-run live.
 *
 * The held-out card is the headline ("primary": first, larger figure; the tour's last step spotlights it). The
 * development card is "secondary" and prints its scores with `floorPct` (rounded down, as in the PDFs), because the
 * rules were tuned on that set and its score is the one most likely to flatter.
 *
 * The three headline rates are recomputed from tp/fp/fn (`microRates`), as scripts/submission/facts.mjs does: the
 * report's own rates are pre-rounded to four decimals, and formatting them again would print 97.3% for 106/109.
 */
function Scorecard({
  title,
  note,
  c,
  baseline = null,
  rank = "primary",
  fmt = pct,
  tour,
}: {
  title: string;
  note: string;
  c: CorpusRun;
  baseline?: number | null;
  rank?: "primary" | "secondary";
  fmt?: (x: number) => string;
  tour?: string;
}) {
  const r = c.report;
  const rates = microRates(r.micro);
  return (
    <div className={`pub-how-score pub-how-score--${rank}`} data-tour={tour}>
      <div className="pub-how-score__head">
        {rank === "primary" && <p className="pub-how-score__eyebrow">Headline score</p>}
        <h4 className="pub-how-score__title">{title}</h4>
        <p className="pub-how-score__note">{note}</p>
      </div>
      <div className="pub-how-score__hero">
        <span className="pub-how-score__big ui-num">{fmt(rates.f1)}</span>
        <span className="pub-how-score__big-label">
          micro-F1 over {r.micro.support} labelled answers
          <br />
          precision {fmt(rates.precision)} · recall {fmt(rates.recall)}
          {baseline !== null && (
            <>
              <br />
              <span className="pub-how-baseline">
                versus lexicon-only baseline {pct(baseline)} <span className="pub-how-muted">(ConText off; committed results)</span>
              </span>
            </>
          )}
        </span>
      </div>
      <dl className="pub-how-score__grid">
        <div>
          <dt>Negations kept as “no”</dt>
          <dd className="ui-num">
            {r.negation.correct} of {r.negation.goldNegatives}
          </dd>
        </div>
        <div>
          <dt>Stories with every answer right</dt>
          <dd className="ui-num">
            {r.exactCases} of {r.cases}
          </dd>
        </div>
        <div>
          <dt>Yes ↔ no flips</dt>
          <dd className="ui-num">{r.negation.polarityFlips}</dd>
        </div>
        <div>
          <dt>Time per story</dt>
          <dd className="ui-num">
            {r.latency.meanMs.toFixed(2)} ms <span className="pub-how-muted">(p95 {r.latency.p95Ms.toFixed(2)})</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function NlpResults({ run }: { run: NlpRun }) {
  const { dev, heldout } = run;
  const fields = (Object.keys(FIELD_LABEL) as DiaryField[]).filter(
    (f) => dev.report.perField[f]?.support > 0 || (heldout?.report.perField[f]?.support ?? 0) > 0,
  );
  const errors = [
    ...(heldout ? heldout.report.errors.map((e) => ({ ...e, corpus: "Held-out" })) : []),
    ...dev.report.errors.map((e) => ({ ...e, corpus: "Dev" })),
  ];
  const coreErrors = errors.filter((e) => !e.field.startsWith("other:"));
  const otherErrors = errors.length - coreErrors.length;
  const heldCtx = new Map(heldout?.context.map((s) => [s.tag, s]) ?? []);

  return (
    <div className="pub-how-results" aria-live="polite">
      <p className="pub-how-results__meta">
        <Timer size={16} aria-hidden="true" />
        <span>
          Scored {dev.report.cases + (heldout?.report.cases ?? 0)} stories in {fmtMs(run.ms)} on this device · engine{" "}
          <code>{dev.report.engine}</code>
        </span>
        {run.matchesCommitted === true && run.committed && (
          <Badge tone="success" icon size="sm">
            Matches the committed results ({fmtDate(run.committed.generatedAt)})
          </Badge>
        )}
        {run.matchesCommitted === false && run.committed && (
          <Badge tone="info" icon size="sm">
            Differs from the results file of {fmtDate(run.committed.generatedAt)} — the engine has changed since
          </Badge>
        )}
      </p>

      {/* Held-out first (left on desktop, top on phones): it is the score that was never used for tuning. */}
      <div className="pub-how-scores" data-tour="how-eval-scores">
        {heldout ? (
          <Scorecard
            title="Held-out set"
            note={`${heldout.report.cases} stories written separately from the dev set, never used for tuning`}
            c={heldout}
            baseline={HELDOUT_BASELINE_F1}
            tour="how-eval-heldout"
          />
        ) : (
          <Callout tone="neutral" title="Held-out set not found">
            Only the development set was available in this build.
          </Callout>
        )}
        <Scorecard
          title="Development set"
          note={`${dev.report.cases} stories, used while building the rules`}
          c={dev}
          rank="secondary"
          fmt={floorPct}
        />
      </div>

      <div className="pub-how-table-wrap">
        <table className="pub-how-table">
          <caption>Per-field precision (P), recall (R) and F1</caption>
          <thead>
            <tr>
              <th scope="col">Diary field</th>
              <th scope="col">Development</th>
              {heldout && <th scope="col">Held-out</th>}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const d = dev.report.perField[f];
              const h = heldout?.report.perField[f];
              return (
                <tr key={f}>
                  <th scope="row">{FIELD_LABEL[f]}</th>
                  <td>
                    <span className="pub-how-cell">
                      <ScoreBar value={d.f1} />
                      <strong className="ui-num">{d.support ? pct(d.f1) : "—"}</strong>
                      <span className="pub-how-muted ui-num">
                        P {pct(d.precision, 0)} · R {pct(d.recall, 0)} · n={d.support}
                      </span>
                    </span>
                  </td>
                  {heldout && (
                    <td>
                      {h && h.support > 0 ? (
                        <span className="pub-how-cell">
                          <ScoreBar value={h.f1} />
                          <strong className="ui-num">{pct(h.f1)}</strong>
                          <span className="pub-how-muted ui-num">
                            P {pct(h.precision, 0)} · R {pct(h.recall, 0)} · n={h.support}
                          </span>
                        </span>
                      ) : (
                        <span className="pub-how-muted">not in this set</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pub-how-table-wrap">
        <table className="pub-how-table">
          <caption>ConText: negation, who it happened to, and when — stories handled with no wrong answer</caption>
          <thead>
            <tr>
              <th scope="col">Situation in the story</th>
              <th scope="col">Development</th>
              {heldout && <th scope="col">Held-out</th>}
              <th scope="col">Answers wrongly added</th>
            </tr>
          </thead>
          <tbody>
            {dev.context.map((s) => {
              const h = heldCtx.get(s.tag);
              return (
                <tr key={s.tag}>
                  <th scope="row">{s.label}</th>
                  <td className="ui-num">
                    {s.clean} of {s.cases}
                  </td>
                  {heldout && <td className="ui-num">{h ? `${h.clean} of ${h.cases}` : "—"}</td>}
                  <td className="ui-num">{s.falsePositives + (h?.falsePositives ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Disclosure
        variant="card"
        summary={
          coreErrors.length === 0
            ? "No diary-field errors — see other-symptom details"
            : `Show every error (${coreErrors.length} diary-field${otherErrors ? `, ${otherErrors} other-symptom` : ""})`
        }
      >
        {errors.length === 0 ? (
          <p className="pub-how-muted">No errors in either set.</p>
        ) : (
          <div className="pub-how-table-wrap pub-how-table-wrap--scroll">
            <table className="pub-how-table pub-how-table--compact">
              <caption className="ui-visually-hidden">Every extraction error</caption>
              <thead>
                <tr>
                  <th scope="col">Set</th>
                  <th scope="col">Story</th>
                  <th scope="col">Field</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Kinwise</th>
                  <th scope="col">Type</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={`${e.corpus}-${e.id}-${e.field}-${i}`}>
                    <td>{e.corpus}</td>
                    <td>
                      <code>{e.id}</code>
                    </td>
                    <td>{e.field.startsWith("other:") ? `Other: ${e.field.slice(6).replace(/_/g, " ")}` : (FIELD_LABEL[e.field as DiaryField] ?? e.field)}</td>
                    <td className="ui-num">{fmtValue(e.gold)}</td>
                    <td className="ui-num">{fmtValue(e.predicted)}</td>
                    <td>
                      {e.kind === "false_positive" ? "added" : e.kind === "false_negative" ? "missed" : "wrong value"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="pub-how-fine">
          Missed answers are the cheaper mistake: she fills them in on the form. Every proposal is shown with the words it
          came from and is saved only after she confirms it.
        </p>
      </Disclosure>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Live evaluation: medication-review suite

function MedResults({ run }: { run: MedRun }) {
  const s = run.summary;
  const failures = run.cases.flatMap((c) =>
    [...c.expectations.filter((x) => !x.passed).map((x) => ({ c, x })), ...(c.error ? [{ c, x: null }] : [])],
  );
  const invariants = run.cases.flatMap((c) => c.invariants.map((v) => ({ c, v })));
  return (
    <div className="pub-how-results" aria-live="polite">
      <p className="pub-how-results__meta">
        <Timer size={16} aria-hidden="true" />
        <span>
          {s.cases} cases in {fmtMs(run.ms)} on this device · knowledge base <code>{run.kbVersion ?? "unknown"}</code> ·
          case file v{run.caseFileVersion ?? "?"} · dates relative to {run.today}
        </span>
      </p>
      <dl className="pub-how-tiles">
        <div className="pub-how-tile">
          <dt>Cases fully passed</dt>
          <dd className="ui-num">
            {s.casesPassed} <span>of {s.cases}</span>
          </dd>
        </div>
        <div className="pub-how-tile">
          <dt>Expectations met</dt>
          <dd className="ui-num">
            {s.expectationsPassed} <span>of {s.expectations}</span>
          </dd>
        </div>
        <div className="pub-how-tile">
          <dt>Wrong or missing flags</dt>
          <dd className="ui-num">{s.assertionFailures}</dd>
        </div>
        <div className="pub-how-tile">
          <dt>Medicine not in the reference list</dt>
          <dd className="ui-num">{s.preconditionFailures}</dd>
        </div>
        <div className="pub-how-tile">
          <dt>Wording or integrity violations</dt>
          <dd className="ui-num">{s.invariantViolations}</dd>
        </div>
      </dl>

      {run.byCategory.length > 0 && (
        <div className="pub-how-table-wrap">
          <table className="pub-how-table">
            <caption>Expectations met, by kind of finding</caption>
            <thead>
              <tr>
                <th scope="col">Kind of finding</th>
                <th scope="col">Met</th>
              </tr>
            </thead>
            <tbody>
              {run.byCategory.map((c) => (
                <tr key={c.category}>
                  <th scope="row">{CATEGORY_LABEL[c.category as FindingCategory] ?? c.category}</th>
                  <td>
                    <span className="pub-how-cell">
                      <ScoreBar value={c.total ? c.passed / c.total : 0} />
                      <strong className="ui-num">
                        {c.passed} of {c.total}
                      </strong>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Disclosure variant="card" summary={failures.length || invariants.length ? `Show what did not pass (${failures.length + invariants.length})` : "Every expectation passed"}>
        {failures.length === 0 && invariants.length === 0 ? (
          <p className="pub-how-muted">Nothing to show.</p>
        ) : (
          <ul className="pub-how-fails" role="list">
            {failures.map(({ c, x }, i) => (
              <li key={`${c.id}-${i}`}>
                <p className="pub-how-fails__case">
                  <code>{c.id}</code> {c.title}
                </p>
                {x ? (
                  <>
                    <p className="pub-how-fails__label">
                      <Badge tone={x.failure === "precondition" ? "neutral" : "caution"} size="sm">
                        {x.failure === "precondition" ? "Not in reference list" : "Did not match"}
                      </Badge>{" "}
                      {x.label} — {x.detail}
                    </p>
                    {x.source && <p className="pub-how-fails__source">Expected per: {x.source}</p>}
                  </>
                ) : (
                  <p className="pub-how-fails__label">The review engine stopped with an error: {c.error}</p>
                )}
              </li>
            ))}
            {invariants.map(({ c, v }, i) => (
              <li key={`inv-${c.id}-${i}`}>
                <p className="pub-how-fails__case">
                  <code>{c.id}</code> {c.title}
                </p>
                <p className="pub-how-fails__label">
                  <Badge tone="attention" size="sm">
                    Invariant
                  </Badge>{" "}
                  {v}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </div>
  );
}

function LiveEvaluation() {
  const [nlp, setNlp] = useState<RunState<NlpRun>>({ status: "idle" });
  const [med, setMed] = useState<RunState<MedRun>>({ status: "idle" });

  const runNlp = useCallback(async () => {
    setNlp({ status: "running" });
    try {
      setNlp({ status: "done", run: await runNlpBenchmark() });
    } catch (e) {
      setNlp({ status: "error", message: e instanceof Error ? e.message : "The benchmark could not run." });
    }
  }, []);
  const runMed = useCallback(async () => {
    setMed({ status: "running" });
    try {
      setMed({ status: "done", run: await runMedSuite() });
    } catch (e) {
      setMed({ status: "error", message: e instanceof Error ? e.message : "The case suite could not run." });
    }
  }, []);

  return (
    <div className="pub-how-eval">
      <Card as="article" padding="lg" className="pub-how-eval__card" aria-labelledby="eval-nlp-title" data-tour="how-eval">
        <CardHeader
          id="eval-nlp-title"
          level={3}
          icon={<ScanText size={20} />}
          eyebrow="Benchmark 1 · clinical language processing"
          title="Does it hear her correctly?"
          subtitle="Hundreds of fictional check-in stories written by separate AI agents directed by the team, with gold labels that follow our annotation guide, including negations, other people’s falls, past events and “what ifs”."
          actions={
            <Button variant="primary" iconLeft={<PlayCircle size={18} />} loading={nlp.status === "running"} onClick={runNlp}>
              {nlp.status === "done" ? "Run again" : "Run the extraction benchmark now"}
            </Button>
          }
        />
        <CardBody>
          {nlp.status === "idle" && (
            <p className="pub-how-idle">
              <Gauge size={18} aria-hidden="true" />
              <span>Runs the real extraction engine over the development and held-out sets right here — nothing is sent anywhere.</span>
            </p>
          )}
          {nlp.status === "running" && <p className="pub-how-idle" role="status">Scoring every story on this device…</p>}
          {nlp.status === "error" && <Callout tone="caution" title="The benchmark could not run">{nlp.message}</Callout>}
          {nlp.status === "done" && <NlpResults run={nlp.run} />}
        </CardBody>
      </Card>

      <Card as="article" padding="lg" className="pub-how-eval__card" aria-labelledby="eval-med-title">
        <CardHeader
          id="eval-med-title"
          level={3}
          icon={<ListChecks size={20} />}
          eyebrow="Benchmark 2 · medication review"
          title="Does it flag what the criteria say?"
          subtitle="Test cases written from the published criteria (AGS Beers 2023, ACB, STEADI/STOPPFall, ThinkCascades, STOPP/START) by a separate AI agent, directed by the team, that did not read the engine code; not clinician-reviewed. The case file was available while the engine was built, so 57/57 shows the code meets a written spec, not a blind test."
          actions={
            <Button variant="secondary" iconLeft={<PlayCircle size={18} />} loading={med.status === "running"} onClick={runMed}>
              {med.status === "done" ? "Run again" : "Run the medication-review suite"}
            </Button>
          }
        />
        <CardBody>
          {med.status === "idle" && (
            <p className="pub-how-idle">
              <ListChecks size={18} aria-hidden="true" />
              <span>Each case checks flags that must appear, flags that must not, anticholinergic totals and fall-risk lists — plus the wording rules.</span>
            </p>
          )}
          {med.status === "running" && <p className="pub-how-idle" role="status">Running every case on this device…</p>}
          {med.status === "error" && <Callout tone="caution" title="The case suite could not run">{med.message}</Callout>}
          {med.status === "done" && <MedResults run={med.run} />}
        </CardBody>
      </Card>

      <p className="pub-how-fine">
        Both also run in continuous testing (<code>npm run eval:nlp</code>, <code>npm run eval:meds</code>). Fictional,
        author-written cases: they show the software does what the criteria say, not that it improves care.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Knowledge base

function KnowledgeBase() {
  const coverage = useMemo(() => kbCoverage(), []);
  const tiles = Object.keys(COVERAGE_LABEL).filter((k) => typeof coverage[k] === "number");
  const tables = Object.keys(BEERS_TABLE_LABEL).filter((k) => (coverage[k] ?? 0) > 0);
  const sources = [...KB.sources].sort((a, b) => a.short.localeCompare(b.short));
  return (
    <div className="pub-how-kb">
      <dl className="pub-how-tiles pub-how-tiles--kb">
        {tiles.map((k) => (
          <div key={k} className="pub-how-tile">
            <dt>{COVERAGE_LABEL[k]}</dt>
            <dd className="ui-num">{coverage[k]}</dd>
          </div>
        ))}
      </dl>
      {tables.length > 0 && (
        <p className="pub-how-kb__tables">
          <span className="pub-how-muted">AGS Beers 2023 rules by table:</span>
          {tables.map((k) => (
            <Badge key={k} tone="neutral" size="sm">
              {BEERS_TABLE_LABEL[k]} · {coverage[k]}
            </Badge>
          ))}
        </p>
      )}
      <Callout tone="info" title={`Knowledge base version ${KB.version}`}>
        {KB.coverageNote} A medicine outside this list is shown as “not reviewed” — never as fine.
      </Callout>

      <div className="pub-how-sources">
        <h3 className="pub-how-subtitle">Source register</h3>
        <p className="pub-how-muted">Every flag Kinwise shows links to one of these.</p>
        <ul className="pub-how-sources__chips" role="list">
          {sources.map((s) => (
            <li key={s.id}>
              <SourceCitation source={s} />
            </li>
          ))}
        </ul>
        <Disclosure variant="card" summary={`Full citations (${sources.length})`}>
          <ol className="pub-how-reflist">
            {sources.map((s) => (
              <li key={s.id}>
                <p className="pub-how-reflist__cite">{s.citation}</p>
                <p className="pub-how-reflist__meta">
                  <span>Used for: {s.usedFor}</span>
                  {s.doi && <span>DOI {s.doi}</span>}
                  {/^https:\/\//.test(s.url) && (
                    <a href={s.url} target="_blank" rel="noreferrer noopener">
                      Open source<span className="ui-visually-hidden"> (opens in a new tab)</span>
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </Disclosure>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A recorded model run (eval/results/ai-live.json via modelRun.ts)

/** One recorded Ask outcome: the question, what happened, and the AI panel's text exactly as logged. */
function AskOutcome({ a, tone, label }: { a: RecordedAsk; tone: "success" | "caution"; label: string }) {
  // Line 0 of a passed answer is the panel header ("AI draft · on this device · … · 5.1 s"); the evidence chips
  // and the closing "Checked against the records…" note follow the sentence.
  const [header, sentence, ...rest] = a.lines;
  const chips = rest.filter((l) => !/^Checked against/.test(l));
  return (
    <li className="pub-how-run__ask">
      <p className="pub-how-run__q">“{a.question}”</p>
      <p className="pub-how-run__outcome">
        <Badge tone={tone} size="sm">
          {label}
        </Badge>
      </p>
      {a.lines.length > 1 ? (
        <>
          <p className="pub-how-run__meta">{header}</p>
          <blockquote className="pub-how-run__quote">{sentence.trim()}</blockquote>
          {chips.length > 0 && <p className="pub-how-run__meta">Evidence linked: {chips.join(", ")}</p>}
        </>
      ) : (
        <blockquote className="pub-how-run__quote pub-how-run__quote--system">{a.lines[0]}</blockquote>
      )}
    </li>
  );
}

function ModelRun() {
  const r = RECORDED_RUN;
  // Six sentences come from five outputs (two share one explanation); the explanations are also shown whole below.
  const flawedOutputs = [...new Set(r.flawed.map((f) => f.output))];
  const flawedFull = flawedOutputs.flatMap((output) => {
    const full = r.flawed.find((f) => f.output === output && f.full)?.full;
    return full ? [{ output, ...full }] : [];
  });
  return (
    <div className="pub-how-run">
      <p className="pub-how-run__stamp">
        <History size={16} aria-hidden="true" />
        <span>
          Recorded on <strong>{r.dateLabel}</strong> with <code>{r.model}</code> on {r.machine} (headless Chrome via
          Playwright, with WebGPU), from <code>eval/results/ai-live.json</code>. External network requests during the run:{" "}
          <span className="ui-num">{r.externalRequests}</span> (model files were served from a local copy for this run; the
          public demo downloads them once from Hugging Face). Quoted exactly as logged.
        </span>
      </p>

      {/* The live path for visitors with WebGPU: the brief's AI draft is where the check's removals show. */}
      <Callout tone="info" icon={<Sparkles size={20} />} className="pub-how-run__try">
        {AI_DRAFT_HINT}
      </Callout>

      <div className="pub-how-run__pair">
        <section aria-labelledby="run-ask-title" className="pub-how-run__block">
          <h3 id="run-ask-title" className="pub-how-run__title">
            Ask Kinwise: the AI draft panel as logged
          </h3>
          <p className="pub-how-run__meta">The run logged only the AI panel; the records-based answer above it was not recorded.</p>
          <ul className="pub-how-run__asks" role="list">
            <AskOutcome a={r.ask.passed} tone="success" label="AI draft passed the code check" />
            <AskOutcome a={r.ask.blocked} tone="caution" label="AI draft blocked by the code check" />
          </ul>
        </section>

        <section aria-labelledby="run-flawed-title" className="pub-how-run__block pub-how-run__flawed">
          <h3 id="run-flawed-title" className="pub-how-run__title">
            <TriangleAlert size={18} aria-hidden="true" /> What the code check let through
          </h3>
          <p className="pub-how-run__meta">
            At least <span className="ui-num">{r.flawed.length}</span> flawed sentences from{" "}
            <span className="ui-num">{flawedOutputs.length}</span> AI outputs, each quoted exactly as logged.
          </p>
          <ul className="pub-how-run__flaws pub-how-run__flaws--stack" role="list">
            {/* One sentence per item, so nothing is shortened; the two explanations appear whole further down. */}
            {r.flawed.map((f) => (
              <li key={f.where}>
                <span className="pub-how-run__where">{f.where}</span>
                <q className="pub-how-run__flaw-quote">{f.quote}</q>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <More id="how-model-run-more" summary={RUN_MORE_SUMMARY}>
        <div className="pub-how-run__grid">
          <section aria-labelledby="run-routed-title" className="pub-how-run__block">
            <h3 id="run-routed-title" className="pub-how-run__title">
              Out-of-scope questions
            </h3>
            <p className="pub-how-run__meta">
              <span className="ui-num">{r.routedOutOfScope}</span> questions in the run asked about treatment or cause. For
              each, the app said this is one for the doctor or pharmacist and offered an “Add to visit questions” button; no
              AI ran and nothing was sent.
            </p>
          </section>
          <section aria-labelledby="run-brief-title" className="pub-how-run__block">
            <h3 id="run-brief-title" className="pub-how-run__title">
              Visit brief draft
            </h3>
            <p className="pub-how-run__lead">What the app reported after checking every AI sentence:</p>
            <blockquote className="pub-how-run__quote pub-how-run__quote--system">{r.brief.notice}</blockquote>
            <p className="pub-how-run__meta">
              <span className="ui-num">{r.brief.evidenceChips}</span> evidence links in the draft. The garbled “Why we’re
              coming in” sentence above was one of the sentences it kept.
            </p>
          </section>
          <section aria-labelledby="run-explain-title" className="pub-how-run__block">
            <h3 id="run-explain-title" className="pub-how-run__title">
              Explanation blocked by the source check
            </h3>
            <p className="pub-how-run__q">{r.blockedExplain.finding}</p>
            <blockquote className="pub-how-run__quote pub-how-run__quote--system">{r.blockedExplain.message}</blockquote>
          </section>
        </div>
        {flawedFull.length > 0 && (
          <ul className="pub-how-run__flaws pub-how-run__flaws--full" role="list" aria-label="The flawed explanations in full">
            {flawedFull.map((f) => (
              <li key={f.output}>
                <span className="pub-how-run__where">Explanation of “{f.finding}”, in full</span>
                <q className="pub-how-run__flaw-quote">{f.text}</q>
              </li>
            ))}
          </ul>
        )}
        <figure className="pub-how-run__verdict">
          <figcaption>Verdict written with the run</figcaption>
          <blockquote>{r.verdict}</blockquote>
        </figure>
        {/* The verdict text stays as recorded; this line accounts for the gap between its three and the six above. */}
        <p className="pub-how-fine">
          The verdict named three; a later read of the same log for the red-team set found three more sentences
          (<code>eval/verifier-redteam.json</code> live-04 to live-06), which are listed above.
        </p>
        <p className="pub-how-fine">
          The run’s demo dates differ from today’s because the demo record is generated relative to the current date.
          {/* Shown only with its post-fix probe (modelRun.ts redTeamSentence): the score alone would overstate the check. */}
          {RED_TEAM && RED_TEAM_SENTENCE && (
            <>
              {" "}
              {RED_TEAM_SENTENCE} Source: <code>eval/results/verifier-redteam.json</code>
              {RED_TEAM.generatedAt ? ` (${fmtDate(RED_TEAM.generatedAt)})` : ""}.
            </>
          )}
        </p>
        {/* The same model over a fixed set of 40 prompts (modelRun.ts batchSentence); left out without the file. */}
        {BATCH_SENTENCE && (
          <p className="pub-how-fine">
            {BATCH_SENTENCE} Source: <code>eval/results/llm-batch.json</code>; method in <code>eval/LLM-BATCH.md</code>.
          </p>
        )}
      </More>

    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Honesty, trust, team

function StatusBadge({ status }: { status: Status }) {
  if (status === "working")
    return (
      <Badge tone="success" icon={<CircleCheck size={13} aria-hidden="true" />} size="sm">
        Working in this demo
      </Badge>
    );
  if (status === "partial")
    return (
      <Badge tone="caution" icon={<CircleDashed size={13} aria-hidden="true" />} size="sm">
        Partial
      </Badge>
    );
  return (
    <Badge tone="neutral" icon={<Clock3 size={13} aria-hidden="true" />} size="sm">
      Planned
    </Badge>
  );
}

/** How many limitations stay visible (howStatus.ts puts first: not tested with people, then the AI code-check gap). */
const LIMITS_SHOWN = 2;

/**
 * The canonical Working / Partial / Planned table: one row per status (the same split as README.md and the
 * Devpost text). Items are spans, not list items, so each status stays one row for the demo recorder.
 */
function Honesty() {
  const coverage = useMemo(() => kbCoverage(), []);
  const groups = statusGroups(coverage);
  return (
    <div className="pub-how-honesty">
      <div className="pub-how-table-wrap">
        <table className="pub-how-table pub-how-table--canon">
          <caption className="ui-visually-hidden">What is working, partial and planned</caption>
          {/* The status badges label each row, so the column headings are for screen readers only. */}
          <thead className="ui-visually-hidden">
            <tr>
              <th scope="col">Status</th>
              <th scope="col">What</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.status}>
                <th scope="row">
                  <StatusBadge status={g.status} />
                </th>
                <td>
                  <span className="pub-how-canon">
                    {g.items.map((i) => (
                      <span key={i.item} className={cx("pub-how-canon__item", (i.detail?.length ?? 0) > 110 && "pub-how-canon__item--wide")}>
                        <strong>{i.item}</strong>
                        {i.detail && <span className="pub-how-canon__detail">: {i.detail}</span>}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="pub-how-limits" aria-labelledby="limits-title">
        <h3 id="limits-title" className="pub-how-subtitle pub-how-limits__title">
          <FlaskConical size={20} aria-hidden="true" /> Limitations we want you to know
        </h3>
        <ul className="pub-how-bullets pub-how-limits__list">
          {LIMITATIONS.slice(0, LIMITS_SHOWN).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <More id="how-limits-more" summary={`${LIMITATIONS.length - LIMITS_SHOWN} more limitations: benchmarks, diary data, language, coverage, storage`}>
          <ul className="pub-how-bullets pub-how-limits__list">
            {LIMITATIONS.slice(LIMITS_SHOWN).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </More>
      </section>
    </div>
  );
}

const NEVER = [
  "Claims a medicine is behind a symptom, or how likely that is",
  "Suggests starting, stopping or changing a medicine or a dose",
  "Ranks how serious or time-sensitive something is",
  "Diagnoses a condition or rates a person’s overall risk",
  "Sends records anywhere — nothing leaves the device unless you print or export it",
];

function Trust() {
  return (
    <div className="pub-how-trust pub-how-trust--pair">
      <Card as="section" padding="md" aria-labelledby="privacy-title">
        <CardHeader id="privacy-title" level={3} icon={<LockKeyhole size={20} />} title="Privacy by architecture" />
        <CardBody>
          <ul className="pub-how-bullets pub-how-bullets--icons">
            <li>
              <CircleCheck size={18} aria-hidden="true" />
              <span>Records are stored in this browser on this device. There is no Kinwise server, account or database to breach.</span>
            </li>
            <li>
              <CircleCheck size={18} aria-hidden="true" />
              <span>No analytics, advertising trackers or cookies.</span>
            </li>
            <li>
              <CircleCheck size={18} aria-hidden="true" />
              <span>
                The app’s files come from GitHub Pages, like any web page. The optional AI model downloads once from Hugging
                Face (its graphics library from the WebLLM project’s GitHub). Your records stay on this device unless you print or
                export them.
              </span>
            </li>
            <li>
              <CircleCheck size={18} aria-hidden="true" />
              <span>Sharing happens only when you print, export or copy — never automatically.</span>
            </li>
          </ul>
          <p className="pub-how-fine">
            Why it matters: 79% of sampled medicine-related apps shared user data with other companies (<RefLink r={REFS.grundy} />).
          </p>
        </CardBody>
      </Card>

      <Card as="section" padding="md" tone="tint" aria-labelledby="never-title">
        <CardHeader id="never-title" level={3} icon={<ShieldCheck size={20} />} title="What Kinwise never does" />
        <CardBody>
          <ul className="pub-how-bullets pub-how-bullets--icons">
            {NEVER.map((n) => (
              <li key={n}>
                <CircleSlash size={18} aria-hidden="true" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
          <p className="pub-how-safety">
            Don’t stop or change any medicine without talking to the prescriber. If something feels like an emergency, call 911.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Regulatory() {
  return (
    <ul className="pub-how-bullets">
      <li>
        <strong>What it is:</strong> a family’s preparation and documentation tool for medicine conversations — not a
        diagnostic or treatment tool.
      </li>
      <li>
        <strong>Records and communication:</strong> keeping a medication list and symptom diary and sharing it with a
        clinician are designed to fit FDA’s examples of software that is not a medical device (Appendix A, #12–13). <RefLink r={REFS.fdaMma} />
      </li>
      <li>
        <strong>Caregiver medication report:</strong> information about interactions and side effects based on age,
        conditions and current medicines sits closest to FDA’s Appendix B example #18 (enforcement discretion, not an
        exemption).
      </li>
      <li>
        <strong>Clinician brief:</strong> shows its basis — rule, source and version, inputs and missing data — as the
        Clinical Decision Support guidance asks. <RefLink r={REFS.fdaCds} />
      </li>
      <li>
        <strong>Lines we do not cross:</strong> dose advice, stop instructions, cause-and-effect claims, triage or
        personal risk scores (the ACB total is a sum of published per-medicine scores, shown with its sources). No FDA
        clearance is claimed.
      </li>
      <li>
        <strong>Privacy law:</strong> a consumer tool with no clinic relationship is generally outside HIPAA, so we make
        no HIPAA claim; keeping data on the device keeps the FTC Health Breach Notification Rule exposure minimal.
      </li>
    </ul>
  );
}

/** A collapsed reference block: native <details>, so it opens with the keyboard and in find-in-page. */
function More({ id, summary, children, tour }: { id: string; summary: ReactNode; children: ReactNode; tour?: string }) {
  return (
    <details id={id} className="pub-how-more" data-tour={tour}>
      <summary className="pub-how-more__summary">
        <span>{summary}</span>
        <ChevronDown size={20} aria-hidden="true" className="pub-how-more__chevron" />
      </summary>
      <div className="pub-how-more__body">{children}</div>
    </details>
  );
}

const TEAM = [
  { name: "Albert Zorzolan", school: "Babson College" },
  { name: "Neil Shah", school: "Babson College" },
];

// ---------------------------------------------------------------------------------------------

export function HowItWorks() {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coverage = useMemo(() => kbCoverage(), []);
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Reference blocks are closed <details>: open the one asked for (and any it sits in) before scrolling.
    for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    (el.querySelector<HTMLElement>("h2") ?? el.querySelector<HTMLElement>("summary"))?.focus({ preventScroll: true });
  };

  // Deep links from the Welcome page: #/how-it-works?section=how-evaluation opens that section. Waits until
  // the router's own "new page" scroll-to-top and heading focus have run.
  const section = useRoute().params.get("section");
  useEffect(() => {
    if (!section || !(SECTIONS.some((s) => s.id === section) || REFERENCE_BLOCKS.includes(section))) return;
    const timer = window.setTimeout(() => jump(section), 250);
    return () => window.clearTimeout(timer);
    // Deliberately keyed on `section` alone: `jump` is recreated on every render and `reduceMotion` only changes how
    // it scrolls, so re-running on them would jump back to the section after the reader has scrolled away.
  }, [section]);

  return (
    <div className="pub-how">
      <PageHeader
        eyebrow="How Kinwise works"
        title="Private by design. Checkable by anyone."
        subtitle="Every number links to its records and every review prompt to a published source, all in this browser. Check the work yourself."
        actions={
          <>
            <Button variant="secondary" iconLeft={<PlayCircle size={18} />} onClick={() => startTour()}>
              Take the 2-minute tour
            </Button>
            <Button variant="primary" iconLeft={<Gauge size={18} />} onClick={() => jump("how-evaluation")}>
              Run the live evaluation
            </Button>
          </>
        }
      />

      <nav className="pub-how-toc" aria-label="On this page">
        <ul role="list">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button type="button" className="pub-how-toc__link" onClick={() => jump(s.id)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Section
        id="how-problem"
        title="The problem: noticed at home, lost before the visit"
        lead="Families see the dizziness, the near-fall, the new fogginess. Clinicians have minutes and a medication list."
      >
        <ul className="pub-how-stats pub-how-stats--four" role="list">
          {PROBLEM_STATS.map((s) => (
            <li key={s.value + s.text} className="pub-how-stat">
              <p className="pub-how-stat__value ui-num">{s.value}</p>
              <p className="pub-how-stat__text">{s.text}</p>
              <p className="pub-how-stat__source">
                <RefLink r={s.source} />
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="how-flow"
        title="Three steps, and who it’s for"
        lead={
          <>
            Clinician tools have the criteria but not the home observations. Diary apps have the observations but not the
            criteria. <strong>Kinwise connects the two for the visit.</strong>
          </>
        }
      >
        <div className="pub-how-flow">
          <ol className="pub-how-flow__steps" role="list">
            {FLOW_STEPS.map((f, i) => (
              <li key={f.title} className="pub-how-flow__step">
                <span className="pub-how-flow__num" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="pub-how-flow__title">{f.title}</h3>
                  <p className="pub-how-flow__text">{f.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <section className="pub-how-for" aria-labelledby="how-for-title">
            <h3 id="how-for-title" className="pub-how-for__title">
              Who it’s for and where it fits
            </h3>
            <dl className="pub-how-for__list">
              {WHO_FOR.map((w) => (
                <div key={w.label} className={w.source ? "pub-how-for__wide" : undefined}>
                  <dt>{w.label}</dt>
                  <dd>
                    {w.text}
                    {w.source && (
                      <>
                        {" "}
                        <RefLink r={w.source} />
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </Section>

      <Section
        id="how-ai"
        title="What is AI here? The right tool for each job"
        lead="Published studies show general language models are unreliable at drug-safety judgments, so they make none here."
      >
        <div className="pub-how-table-wrap">
          <table className="pub-how-table pub-how-table--ai pub-how-table--compact">
            <caption className="ui-visually-hidden">The three kinds of logic in Kinwise</caption>
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">How it works</th>
                <th scope="col">What it decides</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  <span className="pub-how-ai__part">
                    <ScanText size={18} aria-hidden="true" /> Clinical language processing
                  </span>
                </th>
                <td>
                  Rule-based clinical NLP: a symptom lexicon (with SNOMED CT codes) plus ConText rules for negation, timing and
                  who it happened to (<RefLink r={REFS.harkema} />). Runs in milliseconds.
                </td>
                <td>Proposes diary answers, each tied to her exact words. She confirms every one.</td>
              </tr>
              <tr>
                <th scope="row">
                  <span className="pub-how-ai__part">
                    <BookOpenCheck size={18} aria-hidden="true" /> Deterministic engines
                  </span>
                </th>
                <td>Rules compiled from published criteria with their sources; Fisher’s exact and Mann–Whitney tests for the timeline.</td>
                <td>
                  <strong>All safety logic</strong>: every flag, count, comparison and citation.
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <span className="pub-how-ai__part">
                    <Cpu size={18} aria-hidden="true" /> On-device language model
                  </span>
                </th>
                <td>
                  Optional small open model in a WebGPU worker, constrained to a JSON schema. Every sentence must cite evidence
                  IDs; a code check tests numbers, medicine names and banned phrases.
                </td>
                <td>
                  <strong>Language only</strong>: drafting brief sentences, answering questions about the records, plainer
                  explanations. It decides nothing about medicines.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <More id="how-ai-studies" summary="Why: what four published studies found when language models judged medicines">
          <ul className="pub-how-research" role="list">
            <li>
              <p className="pub-how-research__finding">Interaction detection below 26% accuracy, even when brand/generic names were matched well.</p>
              <RefLink r={REFS.gallifant} />
            </li>
            <li>
              <p className="pub-how-research__finding">Interaction performance and consistency fell as medication lists grew — exactly the polypharmacy case.</p>
              <RefLink r={REFS.blotske} />
            </li>
            <li>
              <p className="pub-how-research__finding">A deprescribing pipeline found the right criteria but often misapplied them (PPV 0.47 for applicability).</p>
              <RefLink r={REFS.socrates} />
            </li>
            <li>
              <p className="pub-how-research__finding">Best results came from a grounded model working alongside a pharmacist — not on its own.</p>
              <RefLink r={REFS.ong} />
            </li>
          </ul>
        </More>
      </Section>

      <Section
        id="how-evaluation"
        title="Live evaluation: don’t take our word for it, run it"
        lead="Both test suites ship with the app. Press Run and the real engines score every case in this browser, in a second or two."
      >
        <LiveEvaluation />
      </Section>

      <Section
        id="how-model-run"
        title="See a real model run (recorded, not live)"
        lead="The optional on-device model needs WebGPU and a 1.7 GB download, so most visitors never see it. Here is one real run."
      >
        <ModelRun />
      </Section>

      <Section id="how-honesty" title="Finished vs planned, and the limits">
        <Honesty />
      </Section>

      <Section id="how-trust" title="Privacy, and the lines Kinwise never crosses">
        <Trust />
      </Section>

      <Section id="how-reference" title="Reference: architecture, sources and regulation">
        <div className="pub-how-more-list">
          <More id="how-architecture" tour="how-arch" summary="Architecture: code decides, AI only helps with words, people approve">
            <p className="pub-how-section__lead pub-how-more__lead">
              Everything runs in the browser. Every box in the top band is deterministic and unit-tested; the language model
              in the lower band is optional, and nothing it writes reaches the brief without passing a code check and a person.
            </p>
            <Card padding="lg" className="pub-how-arch-card">
              <HowArchitecture />
            </Card>
          </More>
          <More
            id="how-knowledge"
            summary={`Knowledge base: ${coverage.drugs ?? 0} medicines, ${coverage.beersRules ?? 0} Beers rules and all ${KB.sources.length} sources`}
          >
            <p className="pub-how-section__lead pub-how-more__lead">Counted live from the knowledge base bundled with this page.</p>
            <KnowledgeBase />
            <p className="pub-how-fine pub-how-rigor">
              <Sparkles size={16} aria-hidden="true" />
              <span>
                A rigor note: medicines on the Beers “avoid” list account for only 1–2% of emergency visits for medication harm;
                blood thinners, diabetes medicines and opioids account for most (<RefLink r={REFS.budnitz2011} />,{" "}
                <RefLink r={REFS.shehab} />). So Kinwise also lists “what to watch for” on those medicines — without calling them
                wrong.
              </span>
            </p>
          </More>
          <More id="how-regulation" summary="Regulatory positioning (student research, not legal advice)">
            <Regulatory />
          </More>
        </div>
      </Section>

      <Section id="how-team" title="Team and source code" lead="Built for UnivaBio “AI for Human Health” 2026. Margaret, Alex and every record in the demo are fictional.">
        <ul className="pub-how-team" role="list">
          {TEAM.map((t) => (
            <li key={t.name} className="pub-how-person">
              <Avatar name={t.name} size="md" />
              <div>
                <p className="pub-how-person__name">{t.name}</p>
                <p className="pub-how-person__meta">{t.school}</p>
              </div>
            </li>
          ))}
          <li className="pub-how-person pub-how-code">
            <ButtonLink href={SOURCE_CODE_URL} variant="secondary" size="sm" iconLeft={<Code size={17} aria-hidden="true" />}>
              Source code on GitHub<span className="ui-visually-hidden"> (opens in a new tab)</span>
            </ButtonLink>
            <ButtonLink href={CODE_TOUR_URL} variant="ghost" size="sm" iconLeft={<FileText size={17} aria-hidden="true" />}>
              Code tour (PDF)<span className="ui-visually-hidden"> (opens in a new tab)</span>
            </ButtonLink>
            <p className="pub-how-fine">Branch medwatch-v2, the version this demo is built from.</p>
          </li>
        </ul>
      </Section>
    </div>
  );
}
