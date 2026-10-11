// The one-page visit brief (SPEC §6.6), styled like a clinical document. Rendered twice by the Visit brief view:
// on screen ("screen": click-to-edit sentences, evidence chips, claim-checker notes) and into the print root
// ("print": plain text only). Every number on the page is code-rendered from the record.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, PencilLine, RotateCcw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import type { BriefSentence, EvidenceItem, EvidencePackage, VisitBrief } from "../../../model/types";
import { formatLong, formatShort } from "../../../model/dates";
import { CONDITION_LABEL, PRODUCT_NAME, SAFETY_LINE, evidenceId } from "../../../engine/brief";
import { caregiverLabel, medName } from "../../../engine/brief/shared";
import { LogoMark, cx } from "../../../ui";
import { BeforeAfterStrip } from "./BeforeAfterStrip";
import { ScrollRegion } from "./ScrollRegion";
import { EvidenceChips } from "./EvidenceDrawer";
import { editSummary, isEdited, medTable, periodLength, signalStrip, type BriefInputs, type EditableSection, type MarkedSentence } from "./compose";

export interface BriefDocumentProps {
  brief: VisitBrief;
  inputs: BriefInputs;
  pkg: EvidencePackage;
  lookup: Map<string, EvidenceItem>;
  mode: "screen" | "print";
  /** Unique prefix for SVG ids (the brief renders twice). */
  idPrefix: string;
  /** Claim-checker notes for an edited sentence (screen only). */
  checks?: (section: EditableSection, index: number) => string[];
  onEdit?: (section: EditableSection, index: number, text: string) => void;
  onRestore?: (section: EditableSection, index: number) => void;
  onRemove?: (section: EditableSection, index: number) => void;
  onEvidence?: (ids: string[], focus: string, claim: string | null) => void;
}

function timeWords(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function dateOf(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Auto-sizing textarea for editing one sentence. */
function SentenceEditor({
  initial,
  label,
  onSave,
  onCancel,
}: {
  initial: string;
  label: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useEffect(() => {
    resize();
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave(text);
    }
  };
  return (
    <div className="cg-vb-sent__editor">
      <textarea
        ref={ref}
        className="cg-vb-sent__textarea"
        value={text}
        aria-label={label}
        maxLength={600}
        onChange={(e) => {
          setText(e.target.value);
          resize();
        }}
        onKeyDown={onKey}
        rows={2}
      />
      <div className="cg-vb-sent__editor-actions">
        <span className="cg-vb-sent__hint">Ctrl/⌘ + Enter to save · Esc to cancel</span>
        <button type="button" className="cg-vb-mini-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="cg-vb-mini-btn cg-vb-mini-btn--primary" onClick={() => onSave(text)} disabled={!text.trim()}>
          <Check size={14} aria-hidden="true" />
          Save
        </button>
      </div>
    </div>
  );
}

interface SentenceProps extends Pick<BriefDocumentProps, "lookup" | "onEdit" | "onRestore" | "onRemove" | "onEvidence" | "checks"> {
  s: BriefSentence;
  section: EditableSection;
  index: number;
  screen: boolean;
  editor: string;
  removable: boolean;
}

function Sentence({ s, section, index, screen, lookup, onEdit, onRestore, onRemove, onEvidence, checks, editor, removable }: SentenceProps) {
  const [editing, setEditing] = useState(false);
  const m = s as MarkedSentence;
  const edited = isEdited(s);
  if (!screen) return <span className="cg-vb-sent__text">{s.text}</span>;
  const issues = edited ? (checks?.(section, index) ?? []) : [];
  const where = `${SECTION_TITLE[section]}, sentence ${index + 1}`;
  return (
    <div className={cx("cg-vb-sent", edited && "is-edited", editing && "is-editing")}>
      {editing ? (
        <SentenceEditor
          initial={s.text}
          label={`Edit: ${where}`}
          onCancel={() => setEditing(false)}
          onSave={(text) => {
            setEditing(false);
            if (text.trim() !== s.text) onEdit?.(section, index, text);
          }}
        />
      ) : (
        <span className="cg-vb-sent__text">{s.text}</span>
      )}
      {!editing && (
        <span className="cg-vb-sent__meta ui-no-print">
          <EvidenceChips ids={s.evidenceIds} lookup={lookup} onOpen={(ids, focus) => onEvidence?.(ids, focus, s.text)} context={where} />
          {edited && <span className="cg-vb-sent__edited">Edited by {m.editedBy ?? editor}</span>}
          <span className="cg-vb-sent__tools">
            <button type="button" className="cg-vb-tool" onClick={() => setEditing(true)} aria-label={`Edit ${where}`} title="Edit this sentence">
              <PencilLine size={14} aria-hidden="true" />
            </button>
            {edited && (
              <button type="button" className="cg-vb-tool" onClick={() => onRestore?.(section, index)} aria-label={`Restore the original wording of ${where}`} title="Restore the original wording">
                <RotateCcw size={14} aria-hidden="true" />
              </button>
            )}
            {removable && (
              <button type="button" className="cg-vb-tool cg-vb-tool--quiet" onClick={() => onRemove?.(section, index)} aria-label={`Remove ${where}`} title="Remove this sentence">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        </span>
      )}
      {issues.length > 0 && !editing && (
        <span className="cg-vb-sent__issues ui-no-print" role="note">
          <TriangleAlert size={14} aria-hidden="true" />
          <span>{issues.join(" ")}</span>
        </span>
      )}
    </div>
  );
}

const SECTION_TITLE: Record<EditableSection, string> = {
  reason: "Why we’re coming in",
  noticed: "What we’ve noticed",
  questions: "Our questions",
};

function SectionHead({ n, title, ai }: { n: number; title: string; ai?: boolean }) {
  return (
    <h3 className="cg-vb-sec__title">
      <span className="cg-vb-sec__num" aria-hidden="true">
        {n}
      </span>
      <span>{title}</span>
      {ai && (
        <span className="cg-vb-sec__ai ui-no-print">
          <Sparkles size={12} aria-hidden="true" />
          AI draft · checked
        </span>
      )}
    </h3>
  );
}

export function BriefDocument(props: BriefDocumentProps) {
  const { brief, inputs, pkg, lookup, mode, idPrefix, onEvidence } = props;
  const { data, review } = inputs;
  const screen = mode === "screen";
  const headingId = useId();
  const p = data.profile;
  const c = brief.content;
  const ai = brief.generation.mode === "ai";
  const editor = p.caregiverName || "the caregiver";
  const rows = medTable(inputs, brief);
  const strip = signalStrip(inputs, c, pkg, medName);
  const edits = editSummary(c);
  const madeOn = dateOf(brief.generation.generatedAt, inputs.today);
  const year = brief.to.slice(0, 4);
  const conditions = p.conditions.map((t) => CONDITION_LABEL[t] ?? t);
  const sentenceProps = {
    lookup,
    onEdit: props.onEdit,
    onRestore: props.onRestore,
    onRemove: props.onRemove,
    onEvidence,
    checks: props.checks,
    screen,
    editor,
  };

  const list = (section: EditableSection, ordered = false) => {
    const items = c[section];
    if (items.length === 0) return <p className="cg-vb-empty">{section === "questions" ? "No questions added yet." : "Nothing to show for this period."}</p>;
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag className={cx("cg-vb-list", ordered && "cg-vb-list--numbered")} role="list">
        {items.map((s, i) => (
          <li key={`${section}-${i}`} className="cg-vb-list__item">
            <Sentence s={s} section={section} index={i} removable={section !== "reason" || items.length > 1} {...sentenceProps} />
          </li>
        ))}
      </Tag>
    );
  };

  const provenance =
    brief.generation.mode === "ai"
      ? `Drafted on this device by ${brief.generation.model ?? "the on-device model"} (prompt ${brief.generation.promptVersion ?? "n/a"}); every sentence checked against the records${brief.generation.droppedSentences ? `, ${brief.generation.droppedSentences} removed by the check` : ""}. Review prompts, medicine table and counts are rendered by code.`
      : `Written by ${PRODUCT_NAME}'s standard template (deterministic, no AI) from ${pkg.items.length} evidence records.`;

  return (
    <article
      className={cx("cg-vb-doc", `cg-vb-doc--${mode}`)}
      data-theme="light"
      aria-labelledby={headingId}
      {...(screen ? { "data-tour": "brief-doc" } : {})}
    >
      <header className="cg-vb-doc__head">
        <div className="cg-vb-doc__band">
          <span className="cg-vb-doc__kind">
            <LogoMark size={18} />
            Visit brief · for the clinician
          </span>
          <span className="cg-vb-doc__tagline">Prepared with {PRODUCT_NAME} — a family-kept record, not a clinical assessment.</span>
          <span className={cx("cg-vb-doc__status", brief.reviewedAt ? "is-reviewed" : "is-draft")}>
            {brief.reviewedAt ? `Reviewed by ${editor}` : "Draft · not reviewed yet"}
          </span>
        </div>
        <div className="cg-vb-doc__id">
          <div>
            <h2 id={headingId} className="cg-vb-doc__name">
              {p.displayName}
            </h2>
            <p className="cg-vb-doc__demo">
              {p.age} years{p.sex && p.sex !== "other" ? ` · ${p.sex}` : ""}
              {data.isDemoData ? " · fictional demo patient" : ""}
            </p>
          </div>
          <dl className="cg-vb-doc__meta">
            <div>
              <dt>Period</dt>
              <dd>
                {formatShort(brief.from)} – {formatShort(brief.to)}, {year} <span className="cg-vb-muted">({periodLength(brief)} days)</span>
              </dd>
            </div>
            <div>
              <dt>Prepared by</dt>
              <dd>{caregiverLabel(p)}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatLong(madeOn)}</dd>
            </div>
          </dl>
        </div>
        {conditions.length > 0 && (
          <p className="cg-vb-doc__conditions">
            <span className="cg-vb-doc__label">Conditions (family-reported):</span> {conditions.join(", ")}
          </p>
        )}
      </header>

      <section className="cg-vb-sec cg-vb-sec--reason">
        <SectionHead n={1} title={SECTION_TITLE.reason} />
        {list("reason")}
      </section>

      <section className={cx("cg-vb-sec cg-vb-sec--noticed", strip && "has-chart")}>
        <SectionHead n={2} title={SECTION_TITLE.noticed} ai={ai && screen} />
        <div className="cg-vb-noticed">
          {strip && (
            <div className="cg-vb-noticed__chart">
              <BeforeAfterStrip chart={strip} idPrefix={idPrefix} />
              {screen && (
                <span className="cg-vb-chart-ev ui-no-print">
                  <EvidenceChips ids={strip.signalIds} lookup={lookup} onOpen={(ids, focus) => onEvidence?.(ids, focus, null)} context="chart" />
                </span>
              )}
            </div>
          )}
          {list("noticed")}
        </div>
      </section>

      <div className="cg-vb-pair">
      <section className="cg-vb-sec cg-vb-sec--prompts">
        <SectionHead n={3} title="Medication review prompts" />
        {c.reviewPrompts.length === 0 ? (
          <p className="cg-vb-empty">No review prompts included.</p>
        ) : (
          <ul className="cg-vb-list cg-vb-prompts" role="list">
            {c.reviewPrompts.map((pr) => (
              <li key={pr.findingKey} className="cg-vb-list__item">
                <span className="cg-vb-sent__text">
                  {pr.text} <span className="cg-vb-source">({pr.sourceShort})</span>
                </span>
                {screen && (
                  <span className="cg-vb-sent__meta ui-no-print">
                    <EvidenceChips ids={[evidenceId.finding(pr.findingKey)]} lookup={lookup} onOpen={(ids, focus) => onEvidence?.(ids, focus, pr.text)} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cg-vb-sec cg-vb-sec--questions">
        <SectionHead n={4} title={SECTION_TITLE.questions} ai={ai && screen} />
        {list("questions", true)}
      </section>
      </div>

      <section className="cg-vb-sec cg-vb-sec--meds">
        <SectionHead n={5} title={`Current medication list (${rows.length})`} />
        {rows.length === 0 ? (
          <p className="cg-vb-empty">No medicines on the list.</p>
        ) : (
          <ScrollRegion className="cg-vb-table-wrap" label="Current medication list (scrolls sideways)">
            <table className="cg-vb-table">
              <colgroup>
                <col className="cg-vb-col-med" />
                <col className="cg-vb-col-for" />
                <col className="cg-vb-col-pres" />
                <col className="cg-vb-col-start" />
                <col className="cg-vb-col-flags" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Medicine · how taken</th>
                  <th scope="col">For</th>
                  <th scope="col">Prescriber</th>
                  <th scope="col">Started</th>
                  <th scope="col">Review flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.medId}>
                    <th scope="row">
                      <span className="cg-vb-med">
                        {r.medication}
                        {r.isNew && <span className="cg-vb-new">new</span>}
                      </span>
                      <span className="cg-vb-how">{r.howITakeIt}</span>
                    </th>
                    <td>{r.whyIUseIt}</td>
                    <td>{r.prescriber}</td>
                    <td className="cg-vb-nowrap">{r.started}</td>
                    <td>
                      {r.short.length ? (
                        <span className="cg-vb-flags">
                          {r.short.map((f) => (
                            <span key={f} className={cx("cg-vb-flag", /avoid|Fall risk/.test(f) && "cg-vb-flag--strong")}>
                              {f}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="cg-vb-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className="cg-vb-table-note">
          Flags: AGS Beers Criteria® 2023 · ACB = anticholinergic burden (1–3) · fall-risk lists (STEADI-Rx, STOPPFall) · cascade = possible
          prescribing cascade. No flag is not an all-clear. Allergies are not recorded.
        </p>
      </section>

      <section className="cg-vb-sec cg-vb-sec--limits">
        <SectionHead n={6} title="Diary coverage & limitations" />
        <ul className="cg-vb-limits" role="list">
          {c.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>

      <footer className="cg-vb-doc__foot">
        <p className="cg-vb-doc__safety">{SAFETY_LINE}</p>
        <p className="cg-vb-doc__prov">
          {provenance} Knowledge base {review.kbVersion || "n/a"} · evidence {brief.generation.evidenceHash.slice(0, 8)}
          {edits.count > 0 && ` · ${edits.count} ${edits.count === 1 ? "sentence" : "sentences"} edited by ${edits.editors.join(", ")}`}
          {" · "}
          {brief.reviewedAt ? `Reviewed by ${editor} on ${timeWords(brief.reviewedAt)}.` : "Not reviewed yet."}
          {data.isDemoData && " Fictional demo data."}
        </p>
      </footer>
    </article>
  );
}

/** Printed instead of the brief while it is not reviewed (SPEC-UI: review required for print). */
export function NotReviewedNotice({ name, caregiver }: { name: string; caregiver: string }) {
  return (
    <div className="cg-vb-unreviewed" data-theme="light">
      <p className="cg-vb-unreviewed__kind">Visit brief · {name}</p>
      <h2 className="cg-vb-unreviewed__title">This brief hasn’t been reviewed yet</h2>
      <p>
        {PRODUCT_NAME} only prints a visit brief after {caregiver} has read it through. Open {PRODUCT_NAME} → Visit brief, check each
        sentence, then tick “I’ve reviewed this brief” and print again.
      </p>
      <p className="cg-vb-unreviewed__safety">{SAFETY_LINE}</p>
    </div>
  );
}
