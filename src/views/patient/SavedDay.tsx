// What Margaret sees once a day is saved: a calm summary of her answers in words, a gentle sentence about
// her week (code-rendered from weeklyTrends), the static falls callout, and a place to leave a note for
// Alex or the doctor.
import { useId, useState } from "react";
import { CalendarDays, CircleCheck, NotebookPen, Pencil, Pin } from "lucide-react";
import type { CheckIn, ISODate, Note, WeeklyTrend } from "../../model/types";
import { formatLong, parseDate } from "../../model/dates";
import { newId } from "../../model/ids";
import { useStore } from "../../app/StoreProvider";
import { href } from "../../app/router";
import { Button, ButtonLink, Callout, TextArea, useToast, cx } from "../../ui";
import { answerLines } from "./checkin";
import { conceptLabel } from "./HeardPanel";

/** The static falls message (SPEC-UI Today §5). Not triage: the same words whatever was recorded. */
export function FallCallout() {
  return (
    <Callout tone="caution" title="Falls are worth telling your doctor about, even small ones." className="pt-fall">
      If you are hurt or hit your head, get help now (call 911).
    </Callout>
  );
}

/** One gentle, factual sentence about the week. Prefers an improvement, then "about the same". */
export function pickWeeklySentence(weekly: WeeklyTrend[]): string | null {
  const usable = weekly.filter((w) => w.direction !== "not_enough");
  const pick = usable.find((w) => w.direction === "better") ?? usable.find((w) => w.direction === "same") ?? usable[0];
  return pick?.text ?? null;
}

function savedTime(c: CheckIn): string | null {
  const d = new Date(c.confirmedAt);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export interface DaySummaryProps {
  checkIn: CheckIn;
  today: ISODate;
  /** "success" right after saving; "saved" when she comes back to a day that is already saved. */
  variant: "success" | "saved";
  weeklySentence: string | null;
  onChange: () => void;
}

export function DaySummary({ checkIn, today, variant, weeklySentence, onChange }: DaySummaryProps) {
  const { data } = useStore();
  const lines = answerLines(checkIn.answers);
  const answered = lines.filter((l) => l.answered);
  const open = lines.filter((l) => !l.answered);
  const isToday = checkIn.date === today;
  const dayName = isToday ? "Today" : parseDate(checkIn.date).toLocaleDateString("en-US", { weekday: "long" });
  const time = savedTime(checkIn);
  const others = checkIn.otherSymptoms.filter((o) => o.present);
  const name = data.profile.preferredName;
  const caregiver = data.profile.caregiverName || "your family";
  return (
    <section className={cx("pt-saved", `pt-saved--${variant}`)} aria-labelledby="pt-saved-title" data-tour="checkin-saved">
      <div className="pt-saved__head">
        <span className="pt-saved__icon" aria-hidden="true">
          <CircleCheck size={32} />
        </span>
        <div>
          <h2 id="pt-saved-title" className="pt-saved__title" tabIndex={-1}>
            {variant === "success" ? `Saved — thank you, ${name}.` : `${dayName} is saved`}
          </h2>
          <p className="pt-saved__meta">
            {isToday ? "Today" : formatLong(checkIn.date)}
            {time && ` · saved at ${time}`}
            {checkIn.revision > 1 && " · changed since first saved"}
            {` · ${caregiver} can see it in the family view`}
          </p>
        </div>
      </div>

      {weeklySentence && variant === "success" && (
        <p className="pt-saved__week">
          <CalendarDays size={22} aria-hidden="true" />
          <span>{weeklySentence}</span>
        </p>
      )}

      {checkIn.answers.fall === true && <FallCallout />}

      {answered.length > 0 ? (
        <dl className="pt-answers">
          {answered.map((l) => (
            <div key={l.field} className={cx("pt-answers__row", l.words.startsWith("Yes") && "is-yes")}>
              <dt>{l.label}</dt>
              <dd>{l.words}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="pt-saved__none">No questions answered for this day.</p>
      )}
      {open.length > 0 && answered.length > 0 && (
        <p className="pt-saved__open">
          Not answered: {open.map((l) => l.label.toLowerCase()).join(", ")}.
        </p>
      )}
      {others.length > 0 && <p className="pt-saved__open">Also mentioned: {others.map((o) => conceptLabel(o.conceptId).toLowerCase()).join(", ")}.</p>}

      {checkIn.story.trim() && (
        <figure className="pt-saved__story">
          <blockquote className="ui-quote">“{checkIn.story.trim()}”</blockquote>
          <figcaption>Your words</figcaption>
        </figure>
      )}

      <div className="pt-saved__actions">
        <Button variant="secondary" size="lg" iconLeft={<Pencil size={20} aria-hidden="true" />} onClick={onChange}>
          {isToday ? "Change today’s answers" : "Change this day"}
        </Button>
        {variant === "success" && (
          <ButtonLink variant="ghost" size="lg" href={href("/p/week")} iconLeft={<CalendarDays size={20} aria-hidden="true" />}>
            See my week
          </ButtonLink>
        )}
      </div>
    </section>
  );
}

/** "Anything else for Alex or the doctor?" — adds a patient note, optionally pinned for the next visit. */
export function NoteComposer({ date }: { date: ISODate }) {
  const { data, update } = useStore();
  const toast = useToast();
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinId = useId();
  const caregiver = data.profile.caregiverName || "your family";
  const mine = data.notes.filter((n) => n.author === "patient" && n.date === date).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const add = () => {
    const clean = text.trim();
    if (!clean) {
      setError("Write a few words first.");
      return;
    }
    const note: Note = { id: newId("note"), date, author: "patient", text: clean.slice(0, 1000), pinned, createdAt: new Date().toISOString() };
    const r = update("patient", (prev) => ({ ...prev, notes: [...prev.notes, note] }));
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setText("");
    setPinned(false);
    setError(null);
    toast.show({ title: "Note added", description: pinned ? "Marked for the next doctor’s visit." : `${caregiver} can see it.`, tone: "success" });
  };

  return (
    <section className="pt-note" aria-labelledby="pt-note-title">
      <h2 id="pt-note-title" className="pt-note__title">
        <NotebookPen size={24} aria-hidden="true" />
        Anything else for {caregiver} or the doctor?
      </h2>
      <TextArea
        label="Your note"
        hideLabel
        optional
        rows={3}
        maxLength={1000}
        value={text}
        error={error ?? undefined}
        placeholder="e.g. Ask the doctor about the new sleeping pill."
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        className="pt-note__field"
      />
      <div className="pt-note__row">
        <label className="pt-check" htmlFor={pinId}>
          <input id={pinId} type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <Pin size={18} aria-hidden="true" />
          <span>Bring this up at the next doctor’s visit</span>
        </label>
        <Button variant="primary" size="lg" onClick={add}>
          Add note
        </Button>
      </div>
      {mine.length > 0 && (
        <ul role="list" className="pt-note__list" aria-label="Your notes for this day">
          {mine.map((n) => (
            <li key={n.id} className="pt-note__item">
              <q>{n.text}</q>
              {n.pinned && (
                <span className="pt-note__pin">
                  <Pin size={14} aria-hidden="true" /> For the visit
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
