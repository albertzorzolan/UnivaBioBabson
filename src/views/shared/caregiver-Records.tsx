// "Show the records" building blocks for the caregiver views: the full record of one day (answers with their
// provenance in Margaret's own words, other symptoms, medicine remarks, revision history) and a drawer that lists
// the check-ins behind a number. Everything is read from the stored record; nothing is summarised by AI here.
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, History, MessageSquareQuote, NotebookPen, PencilLine } from "lucide-react";
import type { CheckIn, DiaryAnswers, DiaryField, FieldProvenance, ISODate, Note, Span, StoreData } from "../../model/types";
import { formatShort, formatWeekday, parseDate } from "../../model/dates";
import { useStore } from "../../app/StoreProvider";
import { Badge, Drawer, EmptyState, cx } from "../../ui";
import { excerptText } from "./caregiver-TimelineChart";
import "./caregiver-records.css";

// ---------------------------------------------------------------------------
// Vocabulary

/** Diary questions in the order the check-in form asks them. */
export const FIELD_ORDER: DiaryField[] = [
  "dizziness",
  "dizzinessSeverity",
  "drowsiness",
  "confusion",
  "fall",
  "nearFall",
  "swelling",
  "energy",
  "sleep",
  "appetite",
];

export const FIELD_LABEL: Record<DiaryField, string> = {
  energy: "Energy",
  sleep: "Sleep last night",
  appetite: "Appetite",
  dizziness: "Dizzy or light-headed",
  dizzinessSeverity: "How strong the dizziness was",
  drowsiness: "Drowsy during the day",
  confusion: "Confused or foggy",
  fall: "Fall",
  nearFall: "Near-fall (lost balance)",
  swelling: "Ankle swelling",
};

const ENERGY_WORD = ["", "Very low", "Low", "OK", "Good", "Great"];
const SLEEP_WORD = ["", "Very poor", "Poor", "OK", "Good", "Very good"];
const SEVERITY_WORD = ["", "A little", "Quite", "Very"];
const APPETITE_WORD: Record<NonNullable<DiaryAnswers["appetite"]>, string> = {
  worse: "Less than usual",
  same: "Usual",
  better: "More than usual",
};

/** One answer in words ("Yes", "2 of 5 · Low", "Not answered"). */
export function answerWords(a: DiaryAnswers, f: DiaryField): string {
  const v = a[f];
  if (v === null || v === undefined) return "Not answered";
  switch (f) {
    case "energy":
      return `${v} of 5 · ${ENERGY_WORD[v as number] ?? ""}`;
    case "sleep":
      return `${v} of 5 · ${SLEEP_WORD[v as number] ?? ""}`;
    case "dizzinessSeverity":
      return SEVERITY_WORD[v as number] ?? String(v);
    case "appetite":
      return APPETITE_WORD[v as NonNullable<DiaryAnswers["appetite"]>] ?? String(v);
    default:
      return v ? "Yes" : "No";
  }
}

/** Fields shown for a check-in: severity only when dizziness was recorded. */
function visibleFields(a: DiaryAnswers): DiaryField[] {
  return FIELD_ORDER.filter((f) => f !== "dizzinessSeverity" || a.dizziness === true);
}

/** Symptoms recorded "yes" on a check-in, for compact chips ("Dizzy · moderate", "Near-fall"). */
export function recordedChips(c: CheckIn): string[] {
  const a = c.answers;
  const out: string[] = [];
  if (a.dizziness) out.push(a.dizzinessSeverity ? `Dizzy · ${SEVERITY_WORD[a.dizzinessSeverity].toLowerCase()}` : "Dizzy");
  if (a.drowsiness) out.push("Drowsy");
  if (a.confusion) out.push("Foggy");
  if (a.fall) out.push("Fall");
  if (a.nearFall) out.push("Near-fall");
  if (a.swelling) out.push("Swelling");
  if (a.appetite === "worse") out.push("Poor appetite");
  return out;
}

/** "Saved 6:12 PM" style time for a confirmation timestamp. */
function timeOf(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function longWeekday(date: ISODate): string {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Story with highlighted phrases

interface Segment {
  text: string;
  labels: string[];
}

/** Split a story into plain and highlighted segments. Overlapping/nested spans are merged (SPEC: seed note). */
export function storySegments(
  story: string,
  provenance: CheckIn["provenance"],
  extra: { span: Span; label: string }[] = [],
  answers?: DiaryAnswers,
): Segment[] {
  const marks: { start: number; end: number; label: string }[] = [];
  for (const f of Object.keys(provenance) as DiaryField[]) {
    if (f === "dizzinessSeverity") continue; // contained in the dizziness phrase; its label would repeat
    for (const s of provenance[f]?.spans ?? []) {
      const no = answers?.[f] === false ? " · no" : "";
      if (s.start >= 0 && s.end <= story.length && s.end > s.start) marks.push({ start: s.start, end: s.end, label: `${FIELD_SHORT[f]}${no}` });
    }
  }
  for (const e of extra) {
    if (e.span.start >= 0 && e.span.end <= story.length && e.span.end > e.span.start) marks.push({ ...e.span, label: e.label });
  }
  if (marks.length === 0) return [{ text: story, labels: [] }];
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number; labels: string[] }[] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) {
      last.end = Math.max(last.end, m.end);
      if (!last.labels.includes(m.label)) last.labels.push(m.label);
    } else merged.push({ start: m.start, end: m.end, labels: [m.label] });
  }
  const out: Segment[] = [];
  let at = 0;
  for (const m of merged) {
    if (m.start > at) out.push({ text: story.slice(at, m.start), labels: [] });
    out.push({ text: story.slice(m.start, m.end), labels: m.labels });
    at = m.end;
  }
  if (at < story.length) out.push({ text: story.slice(at), labels: [] });
  return out;
}

const FIELD_SHORT: Record<DiaryField, string> = {
  energy: "energy",
  sleep: "sleep",
  appetite: "appetite",
  dizziness: "dizziness",
  dizzinessSeverity: "how strong",
  drowsiness: "drowsiness",
  confusion: "confusion",
  fall: "fall",
  nearFall: "near-fall",
  swelling: "swelling",
};

/** Margaret's words with the phrases the diary answers came from underlined and labelled. */
export function HighlightedStory({ checkIn, className }: { checkIn: CheckIn; className?: string }) {
  const extra = checkIn.otherSymptoms
    .filter((o) => o.present && o.span)
    .map((o) => ({ span: o.span as Span, label: o.conceptId.replace(/_/g, " ") }));
  const segments = storySegments(checkIn.story, checkIn.provenance ?? {}, extra, checkIn.answers);
  return (
    <blockquote className={cx("cg-rec-story ui-quote", className)}>
      “
      {segments.map((s, i) =>
        s.labels.length ? (
          <mark key={i} className="cg-rec-mark">
            {s.text}
            <span className="cg-rec-mark__label">{s.labels.join(" · ")}</span>
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
      ”
    </blockquote>
  );
}

// ---------------------------------------------------------------------------
// Provenance line for one answer

function ProvenanceLine({ prov, value }: { prov: FieldProvenance | undefined; value: unknown }) {
  if (value === null || value === undefined) return <span className="cg-rec-prov is-muted">Left blank — not counted as “no”</span>;
  const quotes = (prov?.spans ?? []).map((s) => s.quote).filter(Boolean);
  if (prov && quotes.length > 0) {
    const how =
      prov.origin === "llm"
        ? "Suggested by the on-device AI, confirmed by her"
        : prov.certainty === "inferred"
          ? "Read from her wording, confirmed by her"
          : "She said this";
    return (
      <span className="cg-rec-prov">
        <MessageSquareQuote size={14} aria-hidden="true" />
        <span>
          From her words: {quotes.map((q, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <q className="ui-quote">{q}</q>
            </span>
          ))}
          <span className="cg-rec-prov__how"> · {how}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="cg-rec-prov is-muted">
      <PencilLine size={14} aria-hidden="true" />
      Chosen on the check-in form
    </span>
  );
}

// ---------------------------------------------------------------------------
// Revision history

interface Change {
  field: DiaryField;
  from: string;
  to: string;
}

function changesBetween(older: CheckIn, newer: CheckIn): Change[] {
  const out: Change[] = [];
  for (const f of FIELD_ORDER) {
    if (older.answers[f] !== newer.answers[f]) out.push({ field: f, from: answerWords(older.answers, f), to: answerWords(newer.answers, f) });
  }
  return out;
}

/** Prior versions of a check-in (same id, or same date when ids differ), oldest first. */
export function historyFor(data: StoreData, c: CheckIn): CheckIn[] {
  return (data.checkInHistory ?? [])
    .filter((h) => h.id === c.id || h.date === c.date)
    .sort((a, b) => a.revision - b.revision || (a.confirmedAt < b.confirmedAt ? -1 : 1));
}

function RevisionHistory({ current, history }: { current: CheckIn; history: CheckIn[] }) {
  const versions = [...history, current];
  return (
    <ol className="cg-rec-history" role="list">
      {versions
        .map((v, i) => ({ v, i, changes: i > 0 ? changesBetween(versions[i - 1], v) : [] }))
        .reverse()
        .map(({ v, i, changes }) => (
          <li key={`${v.revision}-${i}`} className={cx("cg-rec-history__item", i === versions.length - 1 && "is-current")}>
            <p className="cg-rec-history__head">
              <span className="cg-rec-history__version">Version {i + 1}</span>
              {i === versions.length - 1 && (
                <Badge size="sm" tone="primary">
                  Current
                </Badge>
              )}
              <span className="cg-rec-history__time">saved {timeOf(v.confirmedAt)}</span>
            </p>
            {i === 0 ? (
              <p className="cg-rec-history__text">First saved{v.story.trim() ? <> — “{excerptText(v.story, 90)}”</> : "."}</p>
            ) : changes.length ? (
              <ul className="cg-rec-history__changes" role="list">
                {changes.map((ch) => (
                  <li key={ch.field}>
                    {FIELD_LABEL[ch.field]}: <s>{ch.from}</s> → <strong>{ch.to}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cg-rec-history__text">Story edited; answers unchanged.</p>
            )}
          </li>
        ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// One day's full record

/** Everything recorded on one date, with provenance. */
export function DayRecord({ date }: { date: ISODate }) {
  const { data } = useStore();
  const c = useMemo(() => latestFor(data.checkIns, date), [data.checkIns, date]);
  const notes = data.notes.filter((n) => n.date === date);
  const meds = data.medications;

  if (!c) {
    return (
      <div className="cg-rec">
        <EmptyState level={3} icon={<NotebookPen size={22} />} title="No check-in on this day">
          Days without a check-in are left out of every count — they are never treated as “no symptoms”.
        </EmptyState>
        {notes.length > 0 && <NotesList notes={notes} />}
      </div>
    );
  }
  const history = historyFor(data, c);
  const others = c.otherSymptoms.filter((o) => o.present);
  return (
    <div className="cg-rec">
      {c.story.trim() ? (
        <section className="cg-rec-section" aria-label="In her words">
          <p className="cg-rec-section__title">In her words</p>
          <HighlightedStory checkIn={c} />
        </section>
      ) : (
        <p className="cg-rec-note">She answered the questions without writing about her day.</p>
      )}

      <section className="cg-rec-section" aria-label="Answers">
        <p className="cg-rec-section__title">Answers</p>
        <dl className="cg-rec-answers">
          {visibleFields(c.answers).map((f) => {
            const v = c.answers[f];
            const yes = v === true || (f === "appetite" && v === "worse");
            return (
              <div key={f} className={cx("cg-rec-answer", yes && "is-yes", (v === null || v === undefined) && "is-blank")}>
                <dt>{FIELD_LABEL[f]}</dt>
                <dd>
                  <span className="cg-rec-answer__value">{answerWords(c.answers, f)}</span>
                  <ProvenanceLine prov={c.provenance?.[f]} value={v} />
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {others.length > 0 && (
        <section className="cg-rec-section" aria-label="Other things she mentioned">
          <p className="cg-rec-section__title">Other things she mentioned</p>
          <ul className="cg-rec-chips" role="list">
            {others.map((o, i) => (
              <li key={i}>
                <Badge tone="neutral">{o.conceptId.replace(/_/g, " ")}</Badge>
                {o.span && <q className="ui-quote cg-rec-chips__quote">{o.span.quote}</q>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.medNotes.length > 0 && (
        <section className="cg-rec-section" aria-label="About her medicines">
          <p className="cg-rec-section__title">About her medicines</p>
          <ul className="cg-rec-list" role="list">
            {c.medNotes.map((m, i) => {
              const med = meds.find((x) => x.id === m.medicationId);
              return (
                <li key={i}>
                  <q className="ui-quote">{m.span?.quote ?? m.text}</q>
                  <span className="cg-rec-list__meta">{med ? ` — about ${med.name}` : " — not linked to a listed medicine"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="cg-rec-section" aria-label="Revision history">
        <p className="cg-rec-section__title">
          <History size={15} aria-hidden="true" /> History
        </p>
        <RevisionHistory current={c} history={history} />
      </section>

      {notes.length > 0 && <NotesList notes={notes} />}
    </div>
  );
}

function NotesList({ notes }: { notes: Note[] }) {
  const { data } = useStore();
  return (
    <section className="cg-rec-section" aria-label="Notes from this day">
      <p className="cg-rec-section__title">Notes from this day</p>
      <ul className="cg-rec-list" role="list">
        {notes.map((n) => (
          <li key={n.id}>
            <span className="cg-rec-list__meta">
              {n.author === "caregiver" ? data.profile.caregiverName : data.profile.preferredName}
              {n.pinned ? " · pinned concern" : ""}:{" "}
            </span>
            {n.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The check-in stored for a date (highest revision wins). */
export function latestFor(checkIns: CheckIn[], date: ISODate): CheckIn | undefined {
  let best: CheckIn | undefined;
  for (const c of checkIns) {
    if (c.date !== date) continue;
    if (!best || c.revision > best.revision || (c.revision === best.revision && c.confirmedAt > best.confirmedAt)) best = c;
  }
  return best;
}

/** Drawer showing one day's full record. Open when `date` is set. */
export function DayRecordsDrawer({ date, onClose }: { date: ISODate | null; onClose: () => void }) {
  const { data } = useStore();
  const c = date ? latestFor(data.checkIns, date) : undefined;
  const edited = c ? c.revision > 1 || historyFor(data, c).length > 0 : false;
  return (
    <Drawer
      open={date !== null}
      onClose={onClose}
      size="lg"
      eyebrow="Day record"
      title={date ? longWeekday(date) : ""}
      description={
        c ? (
          <>
            Checked in by {data.profile.preferredName} · saved {timeOf(c.confirmedAt)}
            {edited ? " · edited" : ""}
          </>
        ) : (
          "No check-in saved"
        )
      }
    >
      {date && (
        // Focusable region: the record has few controls, so keyboard users can still scroll it (axe: scrollable-region-focusable).
        <div className="cg-rec-region" tabIndex={0} role="region" aria-label={`Record for ${longWeekday(date)}`}>
          <DayRecord date={date} />
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// List of records behind a number

export interface RecordRow {
  date: ISODate;
  /** Value of the counted item that day, in words ("Yes", "2 of 5"). */
  value: string;
  /** Emphasise rows that contributed to the count. */
  counted?: boolean;
}

export interface RecordGroup {
  heading: string;
  /** e.g. "9 of 14 answered days" */
  summary?: string;
  rows: RecordRow[];
}

/** Drawer for "Show the records": the check-ins behind a number, grouped (e.g. before / after). */
export function RecordsDrawer({
  open,
  onClose,
  title,
  description,
  groups,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  groups: RecordGroup[];
  footer?: ReactNode;
}) {
  return (
    <Drawer open={open} onClose={onClose} title={title} description={description} eyebrow="The records" size="lg">
      <div className="cg-rec">
        {groups.map((g) => (
          <section key={g.heading} className="cg-rec-section" aria-label={g.heading}>
            <p className="cg-rec-section__title">
              {g.heading}
              {g.summary && <span className="cg-rec-section__summary ui-num">{g.summary}</span>}
            </p>
            {g.rows.length === 0 ? (
              <p className="cg-rec-note">No check-ins in this period.</p>
            ) : (
              <ul className="cg-rec-rows" role="list">
                {g.rows.map((r) => (
                  <RecordRowItem key={r.date} row={r} />
                ))}
              </ul>
            )}
          </section>
        ))}
        {footer}
      </div>
    </Drawer>
  );
}

function RecordRowItem({ row }: { row: RecordRow }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const c = latestFor(data.checkIns, row.date);
  const panelId = `rec-${row.date}`;
  return (
    <li className={cx("cg-rec-row", row.counted && "is-counted", open && "is-open")}>
      <button type="button" className="cg-rec-row__head" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <span className="cg-rec-row__date ui-num">{formatWeekday(row.date)}</span>
        <span className="cg-rec-row__value">{row.value}</span>
        <span className="cg-rec-row__story ui-quote">{c && c.story.trim() ? `“${excerptText(c.story, 70)}”` : ""}</span>
        <ChevronDown size={16} aria-hidden="true" className="cg-rec-row__chev" />
      </button>
      <div id={panelId} hidden={!open} className="cg-rec-row__panel">
        {open && <DayRecord date={row.date} />}
      </div>
    </li>
  );
}

/** "Sep 4 – Sep 24" */
export function rangeText(from: ISODate, to: ISODate): string {
  return from === to ? formatShort(from) : `${formatShort(from)} – ${formatShort(to)}`;
}

