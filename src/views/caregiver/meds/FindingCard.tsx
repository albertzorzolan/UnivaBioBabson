// One review finding: what it is, which medicines, what the diary shows, the question for the visit, the
// published source, the caregiver's decision — and (when the on-device model is loaded) a simpler AI wording.
// When every diary item this card cites is already shown in full on an earlier, visible card (`diaryRepeat`, see
// diaryRepeats.ts), the block starts as a one-line "Diary entries already shown above" summary with a Show button
// that expands the full block in place.
import { useEffect, useId, useState } from "react";
import { Activity, BookmarkCheck, BookmarkPlus, ChevronRight, MessageCircleQuestion, NotebookPen, Pill, RotateCcw, Sparkles } from "lucide-react";
import type { Finding, Medication, MetricKey, ReviewDecision, ReviewStatus, Signal } from "../../../model/types";
import { getDrug, getSource } from "../../../kb";
import { aiExplainFinding, AIValidationError, useLLM } from "../../../ai";
import { AIBadge, Badge, Button, Disclosure, Segmented, SourceCitation, Spinner, cx } from "../../../ui";
import { getMetric } from "../../../engine/timeline/metrics";
import { STRENGTH_SIZE_LABEL, strengthTone } from "../../shared/caregiver-insights";
import { CATEGORY_CHIP, STATUS_LABEL } from "./reviewRecords";
import { DIARY_SIGNALS_SHOWN } from "./diaryRepeats";

export interface FindingCardProps {
  finding: Finding;
  meds: Map<string, Medication>;
  signals: Map<string, Signal>;
  /** Recent-window counts per related symptom. */
  counts: (m: MetricKey) => { positive: number; answered: number };
  decision: ReviewDecision | undefined;
  saved: boolean;
  person: string;
  /** The person's names ("Margaret", "Mom") for the AI check's patient-scoped language rules. */
  patientNames?: string[];
  highlight?: boolean;
  tourId?: string;
  /**
   * Set when every diary item this card cites is already shown in full on an earlier, visible card: the block
   * starts collapsed to one line. `items` is the number of entries the block renders (symptom counts + the first
   * DIARY_SIGNALS_SHOWN timeline patterns).
   */
  diaryRepeat?: { items: number };
  onDecision: (status: ReviewStatus, note: string) => void;
  onToggleQuestion: () => void;
  onShowRecords: (m: MetricKey) => void;
  onOpenTimeline: (medId: string) => void;
}

const STATUS_OPTIONS: { value: Exclude<ReviewStatus, "open">; label: string }[] = [
  { value: "to_discuss", label: "To discuss" },
  { value: "discussed", label: "Discussed" },
  { value: "dismissed", label: "Not relevant" },
];

function metricLabel(m: MetricKey): string {
  try {
    return getMetric(m).label;
  } catch {
    return m;
  }
}

function countText(m: MetricKey, c: { positive: number; answered: number }): string {
  const base = `${c.positive} of ${c.answered} answered ${c.answered === 1 ? "day" : "days"}`;
  return m === "energy" || m === "sleep" ? `rated 1–2 on ${base}` : base;
}

function shortModel(id: string | null): string | null {
  if (!id) return null;
  return id.replace(/-MLC$/i, "").replace(/-q\d+f\d+(_\d+)?/i, "");
}

type AiState = { kind: "idle" } | { kind: "loading" } | { kind: "done"; text: string; ms: number; dropped: number } | { kind: "error"; message: string };

export function FindingCard({
  finding: f,
  meds,
  signals,
  counts,
  decision,
  saved,
  person,
  patientNames,
  highlight,
  tourId,
  diaryRepeat,
  onDecision,
  onToggleQuestion,
  onShowRecords,
  onOpenTimeline,
}: FindingCardProps) {
  const status: ReviewStatus = decision?.status ?? "open";
  const [note, setNote] = useState(decision?.note ?? "");
  const [ai, setAi] = useState<AiState>({ kind: "idle" });
  const [collapsedOpen, setCollapsedOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const diaryId = useId();
  const diaryCollapsed = Boolean(diaryRepeat) && !diaryOpen;
  const llm = useLLM();

  useEffect(() => setNote(decision?.note ?? ""), [decision?.note]);

  const involved = f.medIds.map((id) => meds.get(id)).filter((m): m is Medication => Boolean(m));
  const findingSignals = f.signalIds.map((id) => signals.get(id)).filter((s): s is Signal => Boolean(s));
  const sources = f.sourceIds.map((id) => getSource(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const linked = f.relatedSymptoms.length > 0 || findingSignals.length > 0;
  const dismissed = status === "dismissed";

  const explain = async () => {
    setAi({ kind: "loading" });
    try {
      const kbText = involved.flatMap((m) => m.ingredientIds.map((id) => getDrug(id)?.usedFor ?? "")).filter(Boolean);
      const r = await aiExplainFinding(f, { kbText, medNames: involved.map((m) => m.name), patientNames });
      if (!r) setAi({ kind: "error", message: "The on-device model isn’t loaded any more. Load it again in Settings." });
      else setAi({ kind: "done", text: r.text, ms: r.ms, dropped: r.dropped });
    } catch (e) {
      setAi({
        kind: "error",
        message:
          e instanceof AIValidationError
            ? "The AI wording didn’t pass the source check, so it isn’t shown. The original text above stays."
            : "The on-device model couldn’t finish this time. The original text above stays.",
      });
    }
  };

  const commitNote = () => {
    if (status !== "open" && note.trim() !== (decision?.note ?? "")) onDecision(status, note);
  };

  const showAiButton = llm.status === "ready" || ai.kind === "loading";

  return (
    <article
      id={`finding-${f.key}`}
      className={cx("cg-finding", dismissed && "cg-finding--dismissed", highlight && "cg-finding--highlight", `cg-finding--${status}`)}
      data-tour={tourId}
      aria-labelledby={`finding-${f.key}-title`}
    >
      <header className="cg-finding__head">
        <div className="cg-finding__tags">
          <Badge size="sm" tone="primary">
            {CATEGORY_CHIP[f.category] ?? "Review prompt"}
          </Badge>
          {linked && (
            <Badge size="sm" tone="info" icon={<Activity size={12} aria-hidden="true" />}>
              Seen in the diary
            </Badge>
          )}
        </div>
        {status !== "open" && (
          <span className={cx("cg-finding__status", `cg-finding__status--${status}`)}>{STATUS_LABEL[status]}</span>
        )}
      </header>

      <h3 id={`finding-${f.key}-title`} className="cg-finding__title">
        {f.title}
      </h3>

      {involved.length > 0 && (
        <ul className="cg-finding__meds" role="list" aria-label="Medicines involved">
          {involved.map((m) => (
            <li key={m.id}>
              <Pill size={14} aria-hidden="true" />
              {m.name}
            </li>
          ))}
        </ul>
      )}

      {dismissed && !collapsedOpen ? (
        <div className="cg-finding__collapsed">
          <p>
            Set aside{decision?.note ? <> — “{decision.note}”</> : "."} It stays out of the visit brief.
          </p>
          <div className="cg-finding__collapsed-actions">
            <Button size="sm" variant="ghost" onClick={() => setCollapsedOpen(true)} iconRight={<ChevronRight size={16} aria-hidden="true" />}>
              Show details
            </Button>
            <Button size="sm" variant="ghost" iconLeft={<RotateCcw size={16} aria-hidden="true" />} onClick={() => onDecision("open", "")}>
              Reopen
            </Button>
          </div>
        </div>
      ) : (
        <div className="cg-finding__grid">
          <div className="cg-finding__main">
            <p className="cg-finding__plain">{f.plain}</p>

            {linked && (
              <section
                className={cx("cg-finding__diary", diaryCollapsed && "cg-finding__diary--repeat")}
                aria-label={`Recorded in ${person}’s diary`}
              >
                <p className="cg-finding__label">
                  <NotebookPen size={15} aria-hidden="true" />
                  <span>
                    {diaryRepeat ? "Diary entries already shown above" : `Recorded in ${person}’s diary`}
                    {diaryRepeat && (
                      <span className="cg-finding__diary-count ui-num">
                        {" "}
                        · {diaryRepeat.items} {diaryRepeat.items === 1 ? "item" : "items"}
                      </span>
                    )}
                  </span>
                  {/* The toggle stays in place when it opens or closes, so keyboard focus is never lost. */}
                  {diaryRepeat && (
                    <button
                      type="button"
                      className="cg-finding__link cg-finding__diary-toggle"
                      aria-expanded={diaryOpen}
                      aria-controls={diaryId}
                      onClick={() => setDiaryOpen(!diaryOpen)}
                    >
                      {diaryOpen ? "Hide" : "Show"}
                      <span className="ui-visually-hidden"> the diary entries for this prompt</span>
                    </button>
                  )}
                </p>
                <div id={diaryId} className="cg-finding__diary-body" hidden={diaryCollapsed}>
                  {findingSignals.slice(0, DIARY_SIGNALS_SHOWN).map((s) => (
                    <p key={s.id} className="cg-finding__signal">
                      <span>{s.text}</span>
                      <span className="cg-finding__signal-meta">
                        <Badge size="sm" tone={strengthTone(s.strength)}>
                          {STRENGTH_SIZE_LABEL[s.strength]}
                        </Badge>
                        <button type="button" className="cg-finding__link" onClick={() => onOpenTimeline(s.medicationId)}>
                          See on timeline
                        </button>
                      </span>
                    </p>
                  ))}
                  {findingSignals.length > DIARY_SIGNALS_SHOWN && (
                    <p className="cg-finding__more">
                      and {findingSignals.length - DIARY_SIGNALS_SHOWN} more pattern{findingSignals.length - DIARY_SIGNALS_SHOWN === 1 ? "" : "s"} on the timeline
                    </p>
                  )}
                  {f.relatedSymptoms.length > 0 && (
                    <ul className="cg-finding__symptoms" role="list" aria-label="Recorded in the last 30 days">
                      {f.relatedSymptoms.map((m) => {
                        const c = counts(m);
                        return (
                          <li key={m}>
                            <button type="button" className="cg-sym-chip" onClick={() => onShowRecords(m)}>
                              <span className="cg-sym-chip__dot" data-metric={m} aria-hidden="true" />
                              <span className="cg-sym-chip__label">{metricLabel(m)}</span>
                              <span className="cg-sym-chip__count ui-num">{countText(m, c)}</span>
                              <span className="ui-visually-hidden"> in the last 30 days — show the records</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {f.relatedSymptoms.length > 0 && <p className="cg-finding__caveat">Last 30 days. Counts show what was recorded, not why it happened.</p>}
                </div>
              </section>
            )}

            <Disclosure summary="Why this matters" className="cg-finding__why">
              <div className="cg-finding__why-body">
                <p className="cg-finding__clinician">{f.clinician}</p>
                <dl className="cg-finding__facts">
                  {f.evidenceGrade && (
                    <div>
                      <dt>Evidence</dt>
                      <dd>{f.evidenceGrade}</dd>
                    </div>
                  )}
                  {sources.length > 0 && (
                    <div>
                      <dt>{sources.length === 1 ? "Source" : "Sources"}</dt>
                      <dd className="cg-finding__sources">
                        {sources.map((s) => (
                          <SourceCitation key={s.id} source={s} />
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </Disclosure>

            {(showAiButton || ai.kind !== "idle") && (
              <div className="cg-finding__ai" aria-live="polite">
                {ai.kind === "done" ? (
                  <div className="cg-ai-note">
                    <AIBadge model={shortModel(llm.model)} ms={ai.ms} />
                    <p className="cg-ai-note__text">{ai.text}</p>
                    <p className="cg-ai-note__meta">
                      Checked by code against the finding and the reference text{ai.dropped > 0 ? ` · ${ai.dropped} sentence${ai.dropped === 1 ? "" : "s"} removed` : ""}. Review before sharing.
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => setAi({ kind: "idle" })}>
                      Hide AI wording
                    </Button>
                  </div>
                ) : ai.kind === "error" ? (
                  <p className="cg-ai-note cg-ai-note--error">{ai.message}</p>
                ) : ai.kind === "loading" ? (
                  <p className="cg-ai-note cg-ai-note--loading">
                    <Spinner size={16} /> Writing a simpler version on this device…
                  </p>
                ) : (
                  <Button size="sm" variant="ghost" iconLeft={<Sparkles size={16} aria-hidden="true" />} onClick={explain}>
                    Explain in simpler words
                  </Button>
                )}
              </div>
            )}

          </div>
          <div className="cg-finding__side">
            <div className="cg-finding__question">
              <p className="cg-finding__label">
                <MessageCircleQuestion size={15} aria-hidden="true" /> Question for the doctor or pharmacist
              </p>
              <p className="cg-finding__question-text">{f.question}</p>
              <Button
                size="sm"
                variant={saved ? "ghost" : "secondary"}
                aria-pressed={saved}
                iconLeft={saved ? <BookmarkCheck size={16} aria-hidden="true" /> : <BookmarkPlus size={16} aria-hidden="true" />}
                onClick={onToggleQuestion}
              >
                {saved ? "In visit questions" : "Add to visit questions"}
              </Button>
            </div>

            <footer className="cg-finding__decide">
              <Segmented
                label="Where does this stand?"
                value={status === "open" ? null : status}
                onChange={(v) => onDecision(v, note)}
                options={STATUS_OPTIONS}
                className="cg-finding__seg"
              />
              {status !== "open" && (
                <div className="cg-finding__note">
                  <label className="ui-visually-hidden" htmlFor={`note-${f.key}`}>
                    Note about this prompt
                  </label>
                  <input
                    id={`note-${f.key}`}
                    className="ui-input cg-finding__note-input"
                    placeholder="Add a note (optional) — e.g. “Dr. Lee will review at the Oct visit”"
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={commitNote}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitNote();
                      }
                    }}
                  />
                  <Button size="sm" variant="ghost" iconLeft={<RotateCcw size={15} aria-hidden="true" />} onClick={() => onDecision("open", "")}>
                    Clear
                  </Button>
                </div>
              )}
            </footer>
          </div>
        </div>
      )}
    </article>
  );
}
