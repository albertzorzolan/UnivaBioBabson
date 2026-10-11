// Today (/p/today) — Margaret's daily check-in, the hero interaction (SPEC-UI "Patient app › Today").
//
//   her words ──► extractCheckIn (on-device clinical NLP, < 10 ms, no model) ──► "Here's what I heard"
//             ──► quick form (pre-filled only where she said it outright) ──► "Is this right?" ──► saved
//
// ?date=YYYY-MM-DD opens one of the last 7 days for changes; ?example=1|2|3 fills and reads one of the
// example stories (used by the guided tour). Nothing is saved until she confirms.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock, MessageSquareQuote, Sparkles } from "lucide-react";
import type { CheckIn, DiaryAnswers, DiaryField, ISODate, OtherSymptom, Proposal } from "../../model/types";
import { formatLong, parseDate } from "../../model/dates";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { href, useRoute } from "../../app/router";
import { extractCheckIn, warmUpNlp, type DetailedExtraction } from "../../engine/nlp/extract";
import { aiRefineExtraction, getModelOption, useLLM } from "../../ai";
import { Button, ButtonLink, Callout, Modal, PageHeader, TextArea } from "../../ui";
import {
  MAIN_FIELDS,
  acceptProposal,
  answerLines,
  answeredCount,
  applyExtraction,
  buildCheckIn,
  checkedInDays,
  commitCheckIn,
  emptyForm,
  formFromCheckIn,
  isEditableDate,
  isEmptyCheckIn,
  setAnswer,
  unacceptProposal,
  type CheckInForm,
} from "./checkin";
import { HeardPanel, conceptLabel, type AiState } from "./HeardPanel";
import { QuickForm } from "./QuickForm";
import { DaySummary, NoteComposer, pickWeeklySentence } from "./SavedDay";
import "./patient.css";

/** Example days in Margaret's voice. Each one exercises a different part of the reading. */
export const EXAMPLE_STORIES: { label: string; text: string }[] = [
  {
    label: "A wobbly morning",
    text:
      "Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. " +
      "Slept badly. My granddaughter Sofia fell off her bike, poor thing. Forgot my water pill.",
  },
  {
    label: "A tired day",
    text:
      "Pretty tired today, no energy at all. Not dizzy and no falls. My ankles were swollen last week " +
      "but they look fine now. Mouth very dry.",
  },
  {
    label: "A foggy afternoon",
    text:
      "Slept like a log last night. A bit foggy and sleepy after lunch, didn’t feel like eating. " +
      "If I get dizzy again I’ll ring Alex.",
  },
];

function weekday(date: ISODate): string {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "long" });
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function scrollToId(id: string, focusSelector?: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    const target = focusSelector ? el.querySelector<HTMLElement>(focusSelector) : el;
    target?.focus({ preventScroll: true });
  });
}

// ---------------------------------------------------------------------------
// Editing one day

interface Reading {
  story: string;
  extraction: DetailedExtraction;
}

interface EditorProps {
  date: ISODate;
  existing: CheckIn | null;
  example: number | null;
  onSaved: () => void;
  onCancel: (() => void) | null;
}

function CheckInEditor({ date, existing, example, onSaved, onCancel }: EditorProps) {
  const { data, today, update } = useStore();
  const { active } = useDerived();
  const llm = useLLM();
  const [story, setStory] = useState(existing?.story ?? "");
  const [reading, setReading] = useState<Reading | null>(null);
  const [form, setForm] = useState<CheckInForm>(() => (existing ? formFromCheckIn(existing) : emptyForm()));
  const [others, setOthers] = useState<OtherSymptom[]>(existing?.otherSymptoms ?? []);
  const [removedOthers, setRemovedOthers] = useState<string[]>([]);
  const [medNotes, setMedNotes] = useState<CheckIn["medNotes"]>(existing?.medNotes ?? []);
  const [removedMedNotes, setRemovedMedNotes] = useState<number[]>([]);
  const [aiProposals, setAiProposals] = useState<Proposal[]>([]);
  const [ai, setAi] = useState<AiState>({ status: "idle", added: 0, ms: null, model: null });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const aiRun = useRef(0);
  const isToday = date === today;
  const dayWord = isToday ? "today" : weekday(date);

  useEffect(() => warmUpNlp(), []);

  const read = (text: string) => {
    if (!text.trim()) {
      setStoryError("Write a few words about your day first — or answer the questions below.");
      return;
    }
    setStoryError(null);
    const extraction = extractCheckIn(text, {
      meds: active,
      today: date,
      voice: "patient",
      patientNames: [data.profile.preferredName, data.profile.displayName.split(" ")[0]].filter(Boolean),
    });
    aiRun.current++;
    setReading({ story: text, extraction });
    setForm((f) => applyExtraction(f, extraction.proposals));
    setOthers(extraction.otherSymptoms);
    setRemovedOthers([]);
    setMedNotes(extraction.medNotes);
    setRemovedMedNotes([]);
    setAiProposals([]);
    setAi({ status: "idle", added: 0, ms: null, model: null });
    setError(null);
    scrollToId("pt-heard-anchor", "#pt-heard-title");
  };

  // Guided tour / deep link: ?example=N fills and reads that example once.
  const exampleDone = useRef(false);
  useEffect(() => {
    if (exampleDone.current || example === null) return;
    const ex = EXAMPLE_STORIES[example - 1];
    if (!ex) return;
    exampleDone.current = true;
    setStory(ex.text);
    read(ex.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [example]);

  const runAi = async () => {
    if (!reading) return;
    const run = ++aiRun.current;
    setAi((s) => ({ ...s, status: "running" }));
    try {
      const r = await aiRefineExtraction(reading.story, reading.extraction, { meds: active, today: date });
      if (run !== aiRun.current) return;
      if (!r) {
        setAi({ status: "error", added: 0, ms: null, model: null });
        return;
      }
      setAiProposals(r.added);
      setAi({ status: "done", added: r.added.length, ms: r.ms, model: getModelOption(llm.model)?.label ?? llm.model });
    } catch {
      if (run === aiRun.current) setAi({ status: "error", added: 0, ms: null, model: null });
    }
  };

  const onAnswer = (field: DiaryField, value: DiaryAnswers[DiaryField] | "unsure") => {
    setForm((f) => setAnswer(f, field, value));
    setError(null);
  };

  const focusQuestion = (field: DiaryField) => {
    const target = field === "dizzinessSeverity" && form.answers.dizziness !== true ? "dizziness" : field;
    scrollToId(`pt-q-${target}`, '[role="radio"][tabindex="0"]');
  };

  const keptOthers = others.filter((o) => !removedOthers.includes(o.conceptId));
  const keptMedNotes = medNotes.filter((_, i) => !removedMedNotes.includes(i));
  const answered = answeredCount(form.answers);
  const empty = isEmptyCheckIn(form, story);

  const openConfirm = () => {
    if (empty) {
      setError("Answer at least one question, or write a few words about your day, before saving.");
      return;
    }
    setError(null);
    setConfirming(true);
  };

  const save = () => {
    const checkIn = buildCheckIn({
      date,
      story: story.trim(),
      form,
      otherSymptoms: keptOthers,
      medNotes: keptMedNotes,
      existing,
      now: new Date().toISOString(),
    });
    const r = update("patient", (prev) => commitCheckIn(prev, checkIn));
    setConfirming(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSaved();
  };

  const llmReady = llm.status === "ready" || llm.status === "generating";
  const lines = answerLines(form.answers);

  return (
    <div className="pt-today__flow">
      {existing && (
        <Callout tone="info" title={`You’re changing ${isToday ? "today’s" : `${weekday(date)}’s`} saved answers`}>
          Your answers and words are filled in below. When you save, the earlier version is kept in the history.
        </Callout>
      )}
      {/* Step 1 — her words */}
      <section className="pt-tell" aria-labelledby="pt-tell-title" data-tour="checkin-story">
        <p className="ui-eyebrow">In your own words</p>
        <h2 id="pt-tell-title" className="pt-section-title">
          Tell me about {isToday ? "your day" : `${weekday(date)}`}
        </h2>
        <p className="pt-section-lead">
          Write it the way you’d tell {data.profile.caregiverName || "a friend"}. I’ll fill in the questions for you to check — nothing is
          saved until you say so.
        </p>
        <TextArea
          label={`Tell me about ${isToday ? "your day" : weekday(date)}`}
          hideLabel
          rows={4}
          maxLength={2000}
          value={story}
          error={storyError ?? undefined}
          placeholder="e.g. Felt a bit woozy getting up this morning, slept badly, no falls."
          onChange={(e) => {
            setStory(e.target.value);
            if (storyError) setStoryError(null);
          }}
          className="pt-tell__field"
        />
        <div className="pt-examples">
          <p className="pt-examples__label" id="pt-examples-label">
            <MessageSquareQuote size={20} aria-hidden="true" />
            Try an example:
          </p>
          <ul role="list" className="pt-examples__list" aria-labelledby="pt-examples-label">
            {EXAMPLE_STORIES.map((ex, i) => (
              <li key={ex.label}>
                <button
                  type="button"
                  className="pt-example"
                  data-tour={i === 0 ? "checkin-example" : undefined}
                  onClick={() => {
                    setStory(ex.text);
                    read(ex.text);
                  }}
                >
                  {ex.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="pt-tell__actions">
          <Button variant="primary" size="xl" iconLeft={<Sparkles size={22} aria-hidden="true" />} onClick={() => read(story)}>
            Fill in my check-in
          </Button>
          <p className="pt-tell__privacy">
            <Lock size={16} aria-hidden="true" />
            <span>Read on this device. Your words never leave it.</span>
          </p>
        </div>
      </section>

      <div id="pt-heard-anchor" className="pt-anchor" />
      {reading && (
        <HeardPanel
          story={reading.story}
          extraction={reading.extraction}
          aiProposals={aiProposals}
          form={form}
          meds={data.medications}
          others={others}
          removedOthers={removedOthers}
          onToggleOther={(id) => setRemovedOthers((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))}
          medNotes={medNotes}
          removedMedNotes={removedMedNotes}
          onToggleMedNote={(i) => setRemovedMedNotes((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i]))}
          onAccept={(p, chosen) => setForm((f) => acceptProposal(f, p, chosen))}
          onUnaccept={(p) => setForm((f) => unacceptProposal(f, p))}
          onChange={focusQuestion}
          ai={llmReady || ai.status !== "idle" ? { state: ai, onRun: runAi } : null}
          stale={story !== reading.story}
        />
      )}

      <QuickForm form={form} onAnswer={onAnswer} />

      <section className="pt-savebar" aria-label="Save">
        <div className="pt-savebar__text">
          <p className="pt-savebar__count ui-num">
            <strong>{answered}</strong> of {MAIN_FIELDS.length} questions answered
          </p>
          <p className="pt-savebar__hint">You’ll see everything once more before it’s saved.</p>
        </div>
        <div className="pt-savebar__actions">
          {onCancel && (
            <Button variant="ghost" size="lg" onClick={onCancel}>
              Keep my saved answers
            </Button>
          )}
          <Button variant="accent" size="xl" onClick={openConfirm} data-tour="checkin-save">
            {isToday ? "Save today’s check-in" : `Save ${weekday(date)}’s check-in`}
          </Button>
        </div>
        {error && (
          <Callout tone="attention" className="pt-savebar__error" title="Not saved yet">
            {error}
          </Callout>
        )}
      </section>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Is this right?"
        description={`This is what will be saved for ${isToday ? "today, " : ""}${formatLong(date)}.`}
        size="md"
        className="pt-confirm"
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setConfirming(false)}>
              Go back and change
            </Button>
            <Button variant="primary" size="lg" onClick={save}>
              Yes, save {dayWord === "today" ? "it" : dayWord}
            </Button>
          </>
        }
      >
        <dl className="pt-confirm__list">
          {lines.map((l) => (
            <div key={l.field} className={l.answered ? "pt-confirm__row" : "pt-confirm__row is-open"}>
              <dt>{l.label}</dt>
              <dd>{l.words}</dd>
            </div>
          ))}
        </dl>
        {keptOthers.length > 0 && (
          <p className="pt-confirm__extra">
            <strong>Also mentioned:</strong>{" "}
            {keptOthers.map((o) => (o.present ? conceptLabel(o.conceptId) : `No ${conceptLabel(o.conceptId).toLowerCase()}`)).join(", ")}
          </p>
        )}
        {keptMedNotes.length > 0 && (
          <p className="pt-confirm__extra">
            <strong>About your medicines:</strong> {keptMedNotes.map((n) => `“${n.text}”`).join(", ")}
          </p>
        )}
        {story.trim() && (
          <figure className="pt-confirm__story">
            <figcaption>Your words, kept as you wrote them</figcaption>
            <blockquote className="ui-quote">“{story.trim()}”</blockquote>
          </figure>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One day: saved summary ⇄ editor ⇄ success

function Day({ date, example }: { date: ISODate; example: number | null }) {
  const { data, today } = useStore();
  const { weekly } = useDerived();
  const saved = data.checkIns.find((c) => c.date === date) ?? null;
  const [mode, setMode] = useState<"view" | "edit" | "done">(() => (saved && example === null && date === today ? "view" : "edit"));

  if (mode !== "edit" && saved) {
    return (
      <div className="pt-today__flow">
        <DaySummary
          checkIn={saved}
          today={today}
          variant={mode === "done" ? "success" : "saved"}
          weeklySentence={pickWeeklySentence(weekly)}
          onChange={() => {
            setMode("edit");
            scrollToId("main-content");
          }}
        />
        <NoteComposer date={date} />
      </div>
    );
  }
  return (
    <CheckInEditor
      date={date}
      existing={saved}
      example={example}
      onCancel={saved ? () => setMode("view") : null}
      onSaved={() => {
        setMode("done");
        scrollToId("main-content", "#pt-saved-title");
      }}
    />
  );
}

export function Today() {
  const { data, today } = useStore();
  const { params } = useRoute();
  const dateParam = params.get("date");
  const exampleParam = Number(params.get("example"));
  const example = Number.isInteger(exampleParam) && exampleParam >= 1 && exampleParam <= EXAMPLE_STORIES.length ? exampleParam : null;
  const date = isEditableDate(dateParam, today) ? dateParam : today;
  const badDate = dateParam !== null && dateParam !== date && dateParam !== today;
  const isToday = date === today;
  const days = useMemo(() => checkedInDays(data.checkIns, today), [data.checkIns, today]);
  const name = data.profile.preferredName;

  const progress =
    days === 0
      ? `Whenever you’re ready, ${name} — a few words are enough.`
      : `You’ve checked in on ${days} of the last 7 days — thank you.`;

  return (
    <div className="pt-today">
      <PageHeader
        eyebrow={isToday ? "Today’s check-in" : "Changing an earlier day"}
        title={isToday ? "How has your day been?" : `How was ${weekday(date)}?`}
        subtitle={isToday ? progress : formatLong(date)}
        actions={
          isToday ? undefined : (
            <ButtonLink href={href("/p/today")} variant="secondary" size="lg" iconLeft={<ArrowLeft size={20} aria-hidden="true" />}>
              Back to today
            </ButtonLink>
          )
        }
        className="pt-page-header"
      />
      {badDate && (
        <Callout tone="info" className="pt-today__notice" title="You can change the last 7 days">
          That day is too long ago to change here, so this is today’s check-in.
        </Callout>
      )}
      <Day key={`${date}|${example ?? ""}`} date={date} example={example} />
    </div>
  );
}
