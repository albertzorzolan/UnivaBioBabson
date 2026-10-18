// Left column of the Visit brief: what goes into the brief. Presentational — the view owns the record updates.
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { FileText, PencilLine, Plus, Settings2, Sparkles, Trash2 } from "lucide-react";
import type { Finding, FindingCategory, Note, ReviewStatus, StoreData } from "../../../model/types";
import { formatShort } from "../../../model/dates";
import { href } from "../../../app/router";
import type { LLMState } from "../../../ai";
import type { BriefSections } from "../../../ai/tasks";
import { Badge, Button, Card, CardHeader, Segmented, Spinner, cx } from "../../../ui";
import { MAX_SAVED_IN_BRIEF, PERIOD_OPTIONS, type PeriodDays } from "./compose";

const CATEGORY_SHORT: Record<FindingCategory, string> = {
  beers_avoid: "AGS Beers · avoid",
  beers_caution: "AGS Beers · caution",
  beers_condition: "AGS Beers · condition",
  beers_interaction: "AGS Beers · combination",
  beers_renal: "AGS Beers · kidney",
  anticholinergic_burden: "Anticholinergic burden",
  fall_risk: "Fall risk",
  prescribing_cascade: "Prescribing cascade",
  duplicate_class: "Same medicine group",
  cns_active_combo: "Brain-active medicines",
  monitoring: "What to watch for",
};

const STATUS_WORD: Partial<Record<ReviewStatus, string>> = { to_discuss: "To discuss", discussed: "Discussed" };

/** Checkbox row used by every builder list. */
function CheckRow({
  checked,
  onChange,
  disabled,
  title,
  meta,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cx("cg-vb-check", checked && "is-on", disabled && "is-disabled")}>
      <input id={id} type="checkbox" className="cg-vb-check__box" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="cg-vb-check__label">
        <span className="cg-vb-check__title">{title}</span>
        {meta && <span className="cg-vb-check__meta">{meta}</span>}
      </label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft

export interface DraftPanelProps {
  period: PeriodDays;
  onPeriod: (p: PeriodDays) => void;
  llm: LLMState;
  aiBusy: boolean;
  onTemplate: () => void;
  onAI: () => void;
  onCancelAI: () => void;
  statusLine: string;
  /** Where each section of an AI brief came from (null for a template brief). */
  sections?: BriefSections | null;
}

/** The origin label for one section of an AI brief. */
const ORIGIN_ROWS: { key: keyof BriefSections; title: string; template: string }[] = [
  { key: "reason", title: "Why we’re coming in", template: "Standard template (the AI wording did not pass the check)" },
  { key: "noticed", title: "What we’ve noticed", template: "Standard template" },
  { key: "questions", title: "Our questions", template: "Standard template (the AI questions did not pass the check)" },
];

export function DraftPanel({ period, onPeriod, llm, aiBusy, onTemplate, onAI, onCancelAI, statusLine, sections }: DraftPanelProps) {
  const ready = llm.status === "ready" || llm.status === "generating";
  return (
    <Card as="section" className="cg-vb-panel" aria-labelledby="cg-vb-draft-title">
      <CardHeader level={2} id="cg-vb-draft-title" title="Draft" subtitle={statusLine} />
      {sections && (
        // A <dl> takes no aria-label (axe aria-prohibited-attr), so the group carries the name.
        <div role="group" aria-label="Who wrote each section">
          <dl className="cg-vb-origin">
            {ORIGIN_ROWS.map((r) => (
              <div key={r.key} className={cx("cg-vb-origin__row", sections[r.key] === "ai" ? "is-ai" : "is-template")}>
                <dt className="cg-vb-origin__section">{r.title}</dt>
                <dd className="cg-vb-origin__value">
                  {sections[r.key] === "ai" ? (
                    <>
                      <Sparkles size={13} aria-hidden="true" />
                      AI draft · checked
                    </>
                  ) : (
                    <>
                      <FileText size={13} aria-hidden="true" />
                      {r.template}
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <Segmented<PeriodDays>
        label="Diary period"
        value={period}
        onChange={onPeriod}
        options={PERIOD_OPTIONS.map((p) => ({ value: p, label: `${p} days` }))}
        className="cg-vb-period"
      />
      <div className="cg-vb-draft-actions">
        <Button variant="secondary" size="sm" iconLeft={<FileText size={16} aria-hidden="true" />} onClick={onTemplate} disabled={aiBusy} block>
          Use the standard template
        </Button>
        {ready ? (
          aiBusy ? (
            <div className="cg-vb-ai-busy" role="status">
              <Spinner size={16} />
              <span>{llm.message || "Drafting on this device…"}</span>
              <button type="button" className="cg-vb-mini-btn" onClick={onCancelAI}>
                Cancel
              </button>
            </div>
          ) : (
            <Button variant="accent" iconLeft={<Sparkles size={17} aria-hidden="true" />} onClick={onAI} block>
              Draft with on-device AI
            </Button>
          )
        ) : (
          <div className="cg-vb-ai-off">
            <Sparkles size={16} aria-hidden="true" />
            <p>
              {llm.status === "loading"
                ? `The on-device AI is loading (${Math.round(llm.progress * 100)}%). You can draft with it when it's ready.`
                : llm.status === "unsupported"
                  ? "This browser can't run the on-device AI (it needs WebGPU). The standard template gives the same facts."
                  : "Optional: load the on-device AI in Settings for a plainer-language draft. Every AI sentence is checked against the records."}{" "}
              {llm.status !== "unsupported" && llm.status !== "loading" && (
                <a href={href("/c/settings")} className="cg-vb-link">
                  <Settings2 size={14} aria-hidden="true" />
                  Open Settings
                </a>
              )}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Concerns

export interface ConcernsPanelProps {
  concerns: Note[];
  included: string[];
  onToggle: (id: string, on: boolean) => void;
  onAdd: (text: string) => void;
  whoWrote: (n: Note) => string;
}

export function ConcernsPanel({ concerns, included, onToggle, onAdd, whoWrote }: ConcernsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const inputId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
    setAdding(false);
  };
  return (
    <Card as="section" className="cg-vb-panel" aria-labelledby="cg-vb-concerns-title">
      <CardHeader level={2} id="cg-vb-concerns-title" title="Why we’re coming in" subtitle="Pinned concerns, in your own words." />
      {concerns.length === 0 ? (
        <p className="cg-vb-panel__empty">No pinned concerns yet. The brief opens with a general line until you add one.</p>
      ) : (
        <div className="cg-vb-checks">
          {concerns.map((n) => (
            <CheckRow
              key={n.id}
              checked={included.includes(n.id)}
              onChange={(on) => onToggle(n.id, on)}
              title={n.text}
              meta={`${whoWrote(n)} · ${formatShort(n.date)}`}
            />
          ))}
        </div>
      )}
      {adding ? (
        <form className="cg-vb-add" onSubmit={submit}>
          <label htmlFor={inputId} className="cg-vb-add__label">
            New concern (saved as a pinned note)
          </label>
          <textarea id={inputId} className="ui-input cg-vb-add__input" rows={3} maxLength={400} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Mom has been unsteady getting up at night." />
          <div className="cg-vb-add__actions">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={!text.trim()}>
              Add concern
            </Button>
          </div>
        </form>
      ) : (
        <button type="button" className="cg-vb-add-link" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" />
          Add a concern
        </button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Findings

export interface FindingsPanelProps {
  findings: Finding[];
  included: string[];
  statusOf: (key: string) => ReviewStatus;
  onToggle: (f: Finding, on: boolean) => void;
}

export function FindingsPanel({ findings, included, statusOf, onToggle }: FindingsPanelProps) {
  // Count only keys that are still selectable (a changed medicine list can leave stale keys in the brief).
  const inc = included.filter((k) => findings.some((f) => f.key === k)).length;
  return (
    <Card as="section" className="cg-vb-panel" aria-labelledby="cg-vb-findings-title">
      <CardHeader
        level={2}
        id="cg-vb-findings-title"
        title="Review prompts"
        subtitle={findings.length ? `${inc} of ${findings.length} included · about 5 fit on one page.` : undefined}
      />
      {findings.length === 0 ? (
        <p className="cg-vb-panel__empty">The medication review has no prompts for the current list (or all were marked “not relevant”).</p>
      ) : (
        <div className="cg-vb-checks">
          {findings.map((f) => {
            const st = STATUS_WORD[statusOf(f.key)];
            const linked = f.relatedSymptoms.length > 0 || f.signalIds.length > 0;
            return (
              <CheckRow
                key={f.key}
                checked={included.includes(f.key)}
                onChange={(on) => onToggle(f, on)}
                title={f.title}
                meta={
                  <>
                    <span>{CATEGORY_SHORT[f.category] ?? f.category}</span>
                    {linked && (
                      <Badge size="sm" tone="caution">
                        In the diary
                      </Badge>
                    )}
                    {st && (
                      <Badge size="sm" tone={st === "Discussed" ? "success" : "info"}>
                        {st}
                      </Badge>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Saved questions

type SavedQuestion = StoreData["savedQuestions"][number];

export interface QuestionsPanelProps {
  questions: SavedQuestion[];
  isIncluded: (q: SavedQuestion) => boolean;
  includedCount: number;
  onToggle: (q: SavedQuestion, on: boolean) => void;
  onAdd: (text: string) => void;
  onEdit: (q: SavedQuestion, text: string) => void;
  onRemove: (q: SavedQuestion) => void;
}

function SavedRow({ q, included, canInclude, onToggle, onEdit, onRemove }: { q: SavedQuestion; included: boolean; canInclude: boolean } & Pick<QuestionsPanelProps, "onToggle" | "onEdit" | "onRemove">) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const id = useId();
  if (editing) {
    return (
      <form
        className="cg-vb-add cg-vb-add--inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onEdit(q, text.trim());
          setEditing(false);
        }}
      >
        <label htmlFor={id} className="ui-visually-hidden">
          Edit saved question
        </label>
        <textarea id={id} className="ui-input cg-vb-add__input" rows={3} maxLength={400} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <div className="cg-vb-add__actions">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={!text.trim()}>
            Save
          </Button>
        </div>
      </form>
    );
  }
  return (
    <CheckRow
      checked={included}
      disabled={!included && !canInclude}
      onChange={(on) => onToggle(q, on)}
      title={q.text}
      meta={!included && !canInclude ? `Up to ${MAX_SAVED_IN_BRIEF} saved questions fit in the brief` : sourceWords(q.source)}
    >
      <span className="cg-vb-check__tools">
        <button
          type="button"
          className="cg-vb-tool"
          aria-label={`Edit question: ${q.text}`}
          onClick={() => {
            setText(q.text);
            setEditing(true);
          }}
        >
          <PencilLine size={15} aria-hidden="true" />
        </button>
        <button type="button" className="cg-vb-tool cg-vb-tool--quiet" aria-label={`Remove question: ${q.text}`} onClick={() => onRemove(q)}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </span>
    </CheckRow>
  );
}

function sourceWords(source: string): string {
  if (source.startsWith("finding:")) return "From the medication review";
  if (source.startsWith("ask")) return "From Ask Kinwise";
  if (source.startsWith("signal:") || source.startsWith("sentinel:")) return "From the overview";
  return "Typed by you";
}

export function QuestionsPanel({ questions, isIncluded, includedCount, onToggle, onAdd, onEdit, onRemove }: QuestionsPanelProps) {
  const [text, setText] = useState("");
  const inputId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <Card as="section" className="cg-vb-panel" aria-labelledby="cg-vb-questions-title">
      <CardHeader
        level={2}
        id="cg-vb-questions-title"
        title="Our questions"
       
        subtitle="Saved from the review, Ask Kinwise or typed here. Questions from the included review prompts are added automatically."
      />
      {questions.length > 0 && (
        <div className="cg-vb-checks">
          {questions.map((q) => (
            <SavedRow
              key={q.id}
              q={q}
              included={isIncluded(q)}
              canInclude={includedCount < MAX_SAVED_IN_BRIEF}
              onToggle={onToggle}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      <form className="cg-vb-add cg-vb-add--row" onSubmit={submit}>
        <label htmlFor={inputId} className="ui-visually-hidden">
          Add a question for the visit
        </label>
        <input
          id={inputId}
          className="ui-input cg-vb-add__field"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a question for the visit…"
        />
        <button type="submit" className="cg-vb-add__send" disabled={!text.trim()} aria-label="Add question">
          <Plus size={18} aria-hidden="true" />
        </button>
      </form>
    </Card>
  );
}
