import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  MessageCircle,
  Pin,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  cancelGeneration,
  isClinicalRequest,
  OUTSIDE,
  runAI,
  useAI,
} from "./ai";
import { AIStatus, DraftMeta } from "./AIPanel";
import {
  dateLabel,
  displayValue,
  evidenceFor,
  factsFor,
  LABELS,
  localDate,
  rangeDays,
  shiftDate,
} from "./domain";
import type { AIResult, Evidence, Field, Role, Source } from "./types";
import { Badge, Button, Modal } from "./ui";
export function NarrativeResult({
  result,
  evidence,
  onEvidence,
}: {
  result: AIResult;
  evidence: Evidence[];
  onEvidence: (id: string) => void;
}) {
  return (
    <div className="narrative-result">
      <DraftMeta result={result} />
      {result.status !== "ok" ? (
        <p>The available records do not support an answer to this question.</p>
      ) : (
        result.payload.items?.map((item, i) => (
          <div className="narrative-item" key={i}>
            <p>{item.text}</p>
            <div className="evidence-links">
              {item.evidenceIds.map((id, n) => (
                <button
                  key={id}
                  onClick={() => onEvidence(id)}
                  title={evidence.find((e) => e.id === id)?.text}
                >
                  <FileText size={12} /> Source {n + 1}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
      <p className="small muted">
        AI wording can be wrong. Compare it with the linked records. This is
        descriptive documentation.
      </p>
    </div>
  );
}
export function Records({
  source,
  role,
  commit,
  onEvidence,
  onEdit,
  notify,
  Trend,
}: {
  source: Source;
  role: Role;
  commit: (s: Source) => boolean;
  onEvidence: (id: string, from?: string, to?: string) => void;
  onEdit: (date: string) => void;
  notify: (s: string) => void;
  Trend: React.ComponentType<{ source: Source; from: string; to: string }>;
}) {
  const today = localDate();
  const [from, setFrom] = useState(shiftDate(today, -27));
  const [to, setTo] = useState(today);
  const [filter, setFilter] = useState("all");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(false);
  const [noteDate, setNoteDate] = useState(today);
  const [result, setResult] = useState<AIResult | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [resultEvidence, setResultEvidence] = useState<Evidence[]>([]);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);
  const ai = useAI();
  const validRange =
    !!from && !!to && from <= to && to <= today && from >= shiftDate(to, -365);
  const evidence = useMemo(
    () => (validRange ? evidenceFor(source, from, to) : []),
    [source, from, to, validRange],
  );
  const facts = validRange ? factsFor(source, from, to) : [];
  const days = validRange ? rangeDays(source, from, to) : [];
  useEffect(() => {
    cancelGeneration();
    setResult(null);
    setError("");
  }, [source.sourceRevision, source.datasetId, from, to, role]);
  useEffect(() => () => cancelGeneration(), []);
  const generate = async (kind: "record_summary" | "record_qa") => {
    setError("");
    setResult(null);
    if (kind === "record_qa" && isClinicalRequest(question)) {
      setError(OUTSIDE);
      return;
    }
    let selected = evidence.filter((e) => e.id.startsWith("fact:"));
    if (kind === "record_qa") {
      if (/dizz/i.test(question))
        selected = [
          ...selected.filter((e) => e.id === "fact:dizziness"),
          ...evidence.filter(
            (e) => e.id.startsWith("entry:") && /Dizziness: Yes/.test(e.text),
          ),
        ];
      else if (/energy|average/i.test(question))
        selected = selected.filter((e) => e.id === "fact:energy");
      else if (/latest|last check|recent check/i.test(question))
        selected = evidence.filter((e) => e.id.startsWith("entry:")).slice(-1);
      else if (/pin|concern|note/i.test(question))
        selected = evidence
          .filter(
            (e) => e.id.startsWith("concern:") || e.id.startsWith("note:"),
          )
          .slice(-6);
      else {
        setError(
          "Try a record question about dizziness dates, average energy, the latest check-in, or pinned concerns. Other topics are not supported in this prototype.",
        );
        return;
      }
    }
    if (!days.length || !selected.length) {
      setError(
        "No matching records in this date range. Missing records do not mean no symptoms.",
      );
      return;
    }
    selected = selected.map((e) => ({ ...e, text: e.text.slice(0, 650) }));
    if (JSON.stringify(selected).length > 7000) {
      setError(
        "This question covers too many entries. Choose a shorter date range.",
      );
      return;
    }
    setResultEvidence(selected);
    try {
      setResult(
        await runAI({
          operation: kind,
          role,
          source,
          from,
          to,
          evidence: selected,
          question: kind === "record_qa" ? question : undefined,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const filtered = days.filter(
    (d) =>
      filter === "all" ||
      (filter === "dizziness" && d.answers.dizziness === true) ||
      (filter === "notes" && !!d.rawStory),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE EVERYDAY, IN CONTEXT</span>
          <h1>{role === "patient" ? "My history" : "Daily records"}</h1>
          <p>Confirmed patient answers and separate caregiver observations.</p>
        </div>
        <Button variant="white" onClick={() => setNoteOpen(true)}>
          <Plus size={17} />
          {role === "caregiver"
            ? "Add an observer note"
            : "Add a visit concern"}
        </Button>
      </div>
      <div className="range-toolbar">
        <label>
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <span>—</span>
        <label>
          To
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="range-presets">
          {[7, 14, 28].map((n) => (
            <button
              key={n}
              className={from === shiftDate(to, -n + 1) ? "selected" : ""}
              onClick={() => {
                setTo(today);
                setFrom(shiftDate(today, -n + 1));
              }}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      {!validRange ? (
        <p className="error">
          Choose a valid date range of up to one year, ending today or earlier.
        </p>
      ) : (
        <>
          <div className="facts-strip">
            {facts.map((f) => (
              <button key={f.id} onClick={() => onEvidence(f.id, from, to)}>
                <span>{f.label}</span>
                <strong>{f.value}</strong>
                <small>{f.detail}</small>
                <span className="fact-link">
                  View evidence <ArrowRight size={12} />
                </span>
              </button>
            ))}
          </div>
          <Trend source={source} from={from} to={to} />
          <section className="panel record-ai">
            <div className="section-title">
              <div>
                <span className="eyebrow">ASK WHAT THE RECORDS SHOW</span>
                <h2>A little help connecting the details</h2>
              </div>
              <Sparkles size={22} />
            </div>
            <AIStatus />
            <div className="row wrap">
              <Button
                variant="secondary"
                disabled={ai.status !== "ready" || !days.length}
                onClick={() => void generate("record_summary")}
              >
                <Sparkles size={16} /> Summarize this period
              </Button>
              <span className="small muted">
                Based on the dates selected above
              </span>
            </div>
            <form
              className="record-question"
              onSubmit={(e) => {
                e.preventDefault();
                void generate("record_qa");
              }}
            >
              <label htmlFor="record-question">
                Ask about the recorded observations
              </label>
              <div className="row">
                <input
                  id="record-question"
                  value={question}
                  maxLength={300}
                  onChange={(e) => {
                    cancelGeneration();
                    setQuestion(e.target.value);
                    setResult(null);
                    setError("");
                  }}
                  placeholder="Which days did I record dizziness?"
                />
                <Button
                  type="submit"
                  disabled={!question.trim() || ai.status !== "ready"}
                >
                  Ask <ArrowRight size={16} />
                </Button>
              </div>
            </form>
            <div className="question-chips">
              {[
                "Which days did I record dizziness?",
                "What was my average energy?",
                "What did my latest check-in say?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    cancelGeneration();
                    setQuestion(q);
                    setResult(null);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            {error && (
              <div className="notice" role="status">
                {error}
                {error === OUTSIDE && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setNote(question);
                      setPinned(true);
                      setNoteOpen(true);
                    }}
                  >
                    Keep this question for a visit <Plus size={14} />
                  </button>
                )}
              </div>
            )}
            {result && (
              <NarrativeResult
                result={result}
                evidence={resultEvidence}
                onEvidence={(id) => onEvidence(id, from, to)}
              />
            )}
          </section>
          <div className="section-title">
            <h2>
              Patient check-ins{" "}
              <span className="muted">({filtered.length})</span>
            </h2>
            <select
              aria-label="Filter patient check-ins"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All entries</option>
              <option value="dizziness">Dizziness recorded</option>
              <option value="notes">With a written note</option>
            </select>
          </div>
          {!filtered.length ? (
            <div className="empty-state">
              <CalendarDays size={27} />
              <h3>No matching check-ins</h3>
              <p>
                Try another date range or filter. Unrecorded days have no
                answers.
              </p>
            </div>
          ) : (
            <div className="history-list">
              {[...filtered].reverse().map((d) => (
                <div className="history-day" key={d.id}>
                  <button
                    className="day-open"
                    onClick={() => onEvidence(`entry:${d.id}`, from, to)}
                  >
                    <span>
                      <strong>{dateLabel(d.dateLocal, true)}</strong>
                      <small>
                        Patient confirmed ·{" "}
                        {d.confirmationMethod === "seed_fixture"
                          ? "fictional seed"
                          : d.confirmationMethod === "ai_review"
                            ? "AI-assisted, reviewed"
                            : "manual entry"}
                      </small>
                    </span>
                    <span>
                      Energy {displayValue("energy", d.answers.energy)}
                    </span>
                    <Badge tone={d.answers.dizziness ? "sand" : "outline"}>
                      {d.answers.dizziness
                        ? "Dizziness recorded"
                        : "Dizziness: " +
                          displayValue("dizziness", d.answers.dizziness)}
                    </Badge>
                    <ChevronRight size={18} />
                  </button>
                  {role === "patient" && (
                    <button
                      className="text-button"
                      onClick={() => onEdit(d.dateLocal)}
                    >
                      Correct entry
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <section className="observer-section">
            <div className="section-title">
              <div>
                <h2>Notes & visit concerns</h2>
                <p className="small muted">
                  Kept separate from patient answers and chart calculations.
                </p>
              </div>
            </div>
            {source.notes
              .filter((n) => n.dateLocal >= from && n.dateLocal <= to)
              .slice()
              .reverse()
              .map((n) => (
                <article className="panel observer-note" key={n.id}>
                  <div className="row between">
                    <Badge tone="outline">
                      {n.role === "caregiver"
                        ? "Caregiver observation"
                        : "Patient concern"}{" "}
                      · {dateLabel(n.dateLocal)}
                    </Badge>
                    {n.pinned && (
                      <Badge>
                        <Pin size={12} /> In visit brief
                      </Badge>
                    )}
                  </div>
                  <p>{n.text}</p>
                  <div className="row wrap">
                    {role === n.role && (
                      <>
                        <button
                          className="text-button"
                          onClick={() => {
                            if (
                              commit({
                                ...source,
                                notes: source.notes.map((x) =>
                                  x.id === n.id
                                    ? { ...x, pinned: !x.pinned }
                                    : x,
                                ),
                              })
                            )
                              notify(
                                n.pinned
                                  ? "Removed from the visit brief."
                                  : "Pinned for your next visit brief.",
                              );
                          }}
                        >
                          <Pin size={14} />
                          {n.pinned ? "Unpin" : "Pin for visit"}
                        </button>
                        <button
                          className="text-button danger-text"
                          onClick={() => setDeleteNote(n.id)}
                        >
                          <Trash2 size={14} /> Delete note
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
          </section>
        </>
      )}
      {noteOpen && (
        <Modal
          title={
            role === "caregiver"
              ? "Add your observation"
              : "Keep a question for your visit"
          }
          onClose={() => setNoteOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              if (
                commit({
                  ...source,
                  notes: [
                    ...source.notes,
                    {
                      id: crypto.randomUUID(),
                      dateLocal: noteDate,
                      text: note.trim(),
                      role,
                      pinned,
                    },
                  ],
                })
              ) {
                setNoteOpen(false);
                setNote("");
                setPinned(false);
                notify(
                  "Your note was saved separately from patient check-ins.",
                );
              }
            }}
          >
            <label className="form-label">
              Date
              <input
                type="date"
                value={noteDate}
                max={today}
                required
                onChange={(e) => setNoteDate(e.target.value)}
              />
            </label>
            <label className="form-label">
              {role === "caregiver"
                ? "What did you observe?"
                : "What would you like to discuss?"}
              <textarea
                value={note}
                required
                maxLength={1000}
                rows={5}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Use fictional details only."
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />{" "}
              Include this note in the visit brief
            </label>
            <Button type="submit" disabled={!note.trim()}>
              Save note <Check size={16} />
            </Button>
          </form>
        </Modal>
      )}
      {deleteNote && (
        <Modal title="Delete this note?" onClose={() => setDeleteNote(null)}>
          <p>
            The note and derived drafts will be removed from this browser.
            Exported copies cannot be recalled.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              if (
                commit({
                  ...source,
                  notes: source.notes.filter((n) => n.id !== deleteNote),
                })
              ) {
                setDeleteNote(null);
                notify("Note deleted. Related drafts were cleared.");
              }
            }}
          >
            Delete note
          </Button>
        </Modal>
      )}
    </>
  );
}
