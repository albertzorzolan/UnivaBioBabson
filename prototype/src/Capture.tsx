import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Leaf,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AIResult,
  Answers,
  Day,
  Field,
  Provenance,
  Source,
} from "./types";
import {
  dateLabel,
  displayValue,
  EMPTY,
  KEYS,
  LABELS,
  localDate,
  newDay,
  provenance,
} from "./domain";
import {
  cancelGeneration,
  eligibleQuestions,
  QUESTIONS,
  runAI,
  useAI,
  validDay,
} from "./ai";
import { AIStatus, DraftMeta } from "./AIPanel";
import { Badge, Button, Modal } from "./ui";
export function AnswerControl({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: Answers[Field];
  onChange: (v: Answers[Field]) => void;
}) {
  const opts =
    field === "energy" || field === "sleep"
      ? [1, 2, 3, 4, 5, null]
      : field === "dizzinessSeverity"
        ? [1, 2, 3, null]
        : field === "appetite"
          ? ["better", "same", "worse", null]
          : [true, false, null];
  return (
    <fieldset id={`field-${field}`} className="answer-control">
      <legend>
        {LABELS[field]}
        {(field === "energy" || field === "sleep") && (
          <span>1 = low · 5 = high</span>
        )}
        {field === "dizzinessSeverity" && (
          <span>Your own description, not a clinical severity assessment</span>
        )}
      </legend>
      <div className="choices">
        {opts.map((v, i) => (
          <button
            type="button"
            aria-pressed={v === value}
            key={i}
            className={v === value ? "selected" : ""}
            onClick={() => onChange(v as Answers[Field])}
          >
            {v === null
              ? "Not sure / skip"
              : typeof v === "number" && field !== "dizzinessSeverity"
                ? v
                : displayValue(field, v as Answers[Field])}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function CheckIn({
  source,
  commit,
  onSaved,
  initialDate,
}: {
  source: Source;
  commit: (s: Source) => boolean;
  onSaved: () => void;
  initialDate?: string;
}) {
  const initial = source.days.find(
    (d) => d.dateLocal === (initialDate ?? localDate()),
  );
  const restore = () => {
    try {
      const d = JSON.parse(localStorage.getItem(KEYS.drafts) ?? "null");
      return d?.kind === "capture" &&
        d.datasetId === source.datasetId &&
        d.revision === source.sourceRevision &&
        !initialDate
        ? d
        : null;
    } catch {
      return null;
    }
  };
  const restored = useRef(restore());
  const [answers, setAnswers] = useState<Answers>(
    restored.current?.answers ?? initial?.answers ?? { ...EMPTY },
  );
  const [story, setStory] = useState(
    restored.current?.story ?? initial?.rawStory ?? "",
  );
  const [date, setDate] = useState(
    restored.current?.date ?? initialDate ?? localDate(),
  );
  const [origins, setOrigins] = useState<Record<Field, Provenance>>(
    initial?.answerProvenance ?? provenance(answers),
  );
  const [result, setResult] = useState<AIResult | null>(null);
  const [selected, setSelected] = useState<Field[]>([]);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [savedByAI, setSavedByAI] = useState(false);
  const [applied, setApplied] = useState(false);
  const ai = useAI();
  useEffect(() => () => cancelGeneration(), []);
  useEffect(() => {
    try {
      localStorage.setItem(
        KEYS.drafts,
        JSON.stringify({
          kind: "capture",
          datasetId: source.datasetId,
          revision: source.sourceRevision,
          date,
          answers,
          story,
        }),
      );
    } catch {
      setError(
        "The draft could not be saved locally. Keep this tab open until you save your check-in.",
      );
    }
  }, [source.datasetId, source.sourceRevision, date, answers, story]);
  const resetDraft = () => {
    cancelGeneration();
    setResult(null);
    setSelected([]);
    setApplied(false);
    setError("");
  };
  const setField = (field: Field, value: Answers[Field]) => {
    cancelGeneration();
    setAnswers((a) => ({
      ...a,
      [field]: value,
      ...(field === "dizziness" && value !== true
        ? { dizzinessSeverity: null }
        : {}),
    }));
    setOrigins((p) => ({
      ...p,
      [field]: {
        origin: value === null ? "user_skipped" : "manual",
        sourceSpans: [],
      },
      ...(field === "dizziness" && value !== true
        ? {
            dizzinessSeverity: {
              origin: "user_skipped" as const,
              sourceSpans: [],
            },
          }
        : {}),
    }));
  };
  const generate = async () => {
    setError("");
    setResult(null);
    setApplied(false);
    try {
      const r = await runAI({
        operation: "capture",
        role: "patient",
        source,
        from: date,
        to: date,
        rawStory: story,
        answers,
      });
      setResult(r);
      setSelected([]);
      setQuestions(r.payload.clarificationQuestionIds ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const apply = () => {
    const next = { ...answers };
    const p = { ...origins };
    for (const proposal of result?.payload.proposals ?? []) {
      if (selected.includes(proposal.field) && next[proposal.field] === null) {
        (next as Record<string, unknown>)[proposal.field] = proposal.value;
        p[proposal.field] = {
          origin: "ai_suggested",
          sourceSpans: proposal.sourceSpans,
        };
      }
    }
    if (next.dizziness !== true) {
      next.dizzinessSeverity = null;
      p.dizzinessSeverity = { origin: "user_skipped", sourceSpans: [] };
    }
    setAnswers(next);
    setOrigins(p);
    setApplied(true);
    setSavedByAI(true);
  };
  const save = () => {
    setError("");
    if (!date || date > localDate()) {
      setError("Choose a valid date up to today.");
      return;
    }
    const old = source.days.find((x) => x.dateLocal === date);
    const normalized = {
      ...answers,
      dizzinessSeverity:
        answers.dizziness === true ? answers.dizzinessSeverity : null,
    };
    const p = { ...origins };
    for (const key of Object.keys(EMPTY) as Field[])
      if (normalized[key] === null)
        p[key] = { origin: "user_skipped", sourceSpans: [] };
    const day = newDay(
      source,
      date,
      normalized,
      story,
      savedByAI ? "ai_review" : "manual_form",
      p,
    );
    if (!validDay(day)) {
      setError("Please check the fields before saving.");
      return;
    }
    if (
      commit({
        ...source,
        days: [...source.days.filter((x) => x.dateLocal !== date), day].sort(
          (a, b) => a.dateLocal.localeCompare(b.dateLocal),
        ),
        revisions: old ? [...source.revisions, old] : source.revisions,
      })
    ) {
      localStorage.removeItem(KEYS.drafts);
      onSaved();
    }
  };
  return (
    <div className="checkin-container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A MOMENT FOR YOURSELF</span>
          <h1>How has your day been, Margaret?</h1>
          <p>Small details are worth remembering. You can skip anything.</p>
        </div>
        <Badge>
          <Leaf size={13} /> Your daily story
        </Badge>
      </div>
      <AIStatus />
      <section className="panel checkin">
        <div className="row between">
          <h2>Your daily check-in</h2>
          <input
            aria-label="Check-in date"
            type="date"
            max={localDate()}
            value={date}
            onChange={(e) => {
              resetDraft();
              setDate(e.target.value);
              const old = source.days.find(
                (d) => d.dateLocal === e.target.value,
              );
              setAnswers(old?.answers ?? { ...EMPTY });
              setStory(old?.rawStory ?? "");
              setOrigins(old?.answerProvenance ?? provenance(EMPTY));
              setSavedByAI(false);
            }}
          />
        </div>
        {source.days.some((d) => d.dateLocal === date) && (
          <div className="notice">
            You already recorded this day. Saving creates a correction and keeps
            the earlier version.
          </div>
        )}
        <label className="story-label">
          In your own words <span>Optional · {story.length}/2,000</span>
          <textarea
            value={story}
            onChange={(e) => {
              resetDraft();
              setStory(e.target.value);
              setOrigins(provenance(answers));
              setSavedByAI(false);
            }}
            maxLength={2000}
            placeholder="For example: My energy was 2 out of 5. I felt dizzy today."
            rows={4}
          />
        </label>
        <div className="row wrap">
          <Button
            variant="secondary"
            disabled={!story.trim() || ai.status !== "ready"}
            onClick={() => void generate()}
          >
            <Sparkles size={18} /> Suggest answers from my story
          </Button>
          <span className="small muted">
            You choose which suggestions to use.
          </span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="capture-review">
            <DraftMeta result={result} />
            <h3>Does this match what you meant?</h3>
            {!result.payload.proposals?.length && (
              <p>
                No supported form answers were found. Your story is preserved;
                you can fill in the form below.
              </p>
            )}
            {result.payload.proposals?.map((p) => (
              <label className="proposal" key={p.field}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.field)}
                  disabled={answers[p.field] !== null || applied}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, p.field]
                        : s.filter((f) => f !== p.field),
                    )
                  }
                />
                <span>
                  <strong>
                    {LABELS[p.field]}: {displayValue(p.field, p.value)}
                  </strong>
                  <q>{p.sourceSpans.map((s) => s.quote).join(" ")}</q>
                  {answers[p.field] !== null && !applied && (
                    <small>
                      Your form already has an answer; it will be kept.
                    </small>
                  )}
                </span>
              </label>
            ))}
            {!!result.payload.proposals?.length && (
              <Button disabled={!selected.length || applied} onClick={apply}>
                {applied ? (
                  <>
                    <CheckCircle2 size={17} /> Added to your form
                  </>
                ) : (
                  <>
                    Use selected suggestions <ArrowRight size={17} />
                  </>
                )}
              </Button>
            )}
            <p className="small muted">
              Suggestions are not saved until you confirm the complete check-in.
            </p>
          </div>
        )}
        {questions.length > 0 && (
          <div className="clarifications">
            <h3>A couple of details, if you’d like</h3>
            {questions.map((id) => (
              <p key={id}>{QUESTIONS[id]}</p>
            ))}
            <small>
              Use the date and answer controls below. Anything unanswered stays
              unknown.
            </small>
            <button className="text-button" onClick={() => setQuestions([])}>
              Skip these prompts
            </button>
          </div>
        )}
        <div className="form-section-title">
          <span className="eyebrow">YOUR WORDS, YOUR CHOICES</span>
          <h2>Review your day</h2>
          <p>You can use this form with or without AI.</p>
        </div>
        {(Object.keys(EMPTY) as Field[])
          .filter(
            (f) => f !== "dizzinessSeverity" || answers.dizziness === true,
          )
          .map((field) => (
            <AnswerControl
              key={field}
              field={field}
              value={answers[field]}
              onChange={(v) => setField(field, v)}
            />
          ))}
        <div className="row wrap clarification-action">
          <Button
            variant="ghost"
            disabled={
              ai.status !== "ready" || !eligibleQuestions(answers).length
            }
            onClick={() => {
              setError("");
              void runAI({
                operation: "clarify",
                source,
                role: "patient",
                from: date,
                to: date,
                answers,
                questionIds: eligibleQuestions(answers),
              })
                .then((r) => setQuestions(r.payload.questionIds ?? []))
                .catch((e) => setError(e.message));
            }}
          >
            Help me fill a gap <Sparkles size={16} />
          </Button>
          <small className="muted">Optional documentation prompts</small>
        </div>
        <div className="save-bar">
          <span>
            <ShieldCheck size={17} /> Saved only on this device
          </span>
          <Button
            disabled={!date || date > localDate()}
            onClick={() => setReview(true)}
          >
            Review & save check-in <ArrowRight size={18} />
          </Button>
        </div>
      </section>
      {review && (
        <Modal title="Your day, ready to save" onClose={() => setReview(false)}>
          <Badge>{dateLabel(date, true)}</Badge>
          {story && <p className="record-story">“{story}”</p>}
          <div className="evidence-grid">
            {Object.entries(answers).map(([f, v]) => (
              <div key={f}>
                <small>{LABELS[f as Field]}</small>
                <strong>{displayValue(f as Field, v)}</strong>
              </div>
            ))}
          </div>
          <p className="small muted">
            Unanswered fields stay “Not recorded.” This check-in is your
            description of the day.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="row wrap">
            <Button onClick={save}>
              Confirm & save check-in <Check size={18} />
            </Button>
            <Button variant="ghost" onClick={() => setReview(false)}>
              Keep editing
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
