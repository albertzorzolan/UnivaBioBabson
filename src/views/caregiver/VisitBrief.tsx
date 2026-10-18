// Caregiver › Visit brief (/c/brief, SPEC-UI "Visit brief", SPEC §6.6): build, check and share a one-page brief for
// the doctor or pharmacist.
//
//   Left (builder)  period · standard template / on-device AI draft · pinned concerns · review prompts · saved
//                   questions · FHIR R4 export (validity checked in the browser).
//   Right           "I've reviewed this brief" (required for printing; any change unticks it) and the brief itself,
//                   styled like a clinical document. Sentences are click-to-edit ("edited by Alex"), each with
//                   evidence chips that open the records behind it; edited sentences are re-checked by the claim checker.
//   Print           a portal outside the app root holds only the brief (or the medication list); brief-print.css
//                   hides everything else and lays it out on US Letter. An unreviewed brief prints a notice instead.
//   AI draft        sections that passed the claim check are AI-written; the rest come from the standard template, and
//                   each section is labelled with where it came from. "What the check removed" lists the AI sentences
//                   that were not put in the brief, with the reason in plain words.
//
// Briefs persist in data.briefs (VisitBrief); the newest is the one being worked on.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { ClipboardCopy, FileText, ListChecks, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import type { BriefContent, Finding, GenerationInfo, Note, StoreData, VisitBrief as VisitBriefRecord } from "../../model/types";
import { newId } from "../../model/ids";
import { formatShort } from "../../model/dates";
import {
  briefToPlainText,
  templateBrief,
  templateGenerationInfo,
  toPersonalMedicationList,
  toVisitBrief,
} from "../../engine/brief";
import { decisionFor } from "../../engine/brief/shared";
import { AIValidationError, LLMError, aiDraftBrief, cancel as cancelAI, useLLM, type DroppedSentence } from "../../ai";
import type { BriefSections } from "../../ai/tasks";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { Button, Callout, EmptyState, Modal, PageHeader, cx, formatDuration, useToast } from "../../ui";
import { BriefDocument, NotReviewedNotice } from "./brief/BriefDocument";
import { CheckRemoved } from "./brief/CheckRemoved";
import { ConcernsPanel, DraftPanel, FindingsPanel, QuestionsPanel } from "./brief/Builder";
import { EvidenceDrawer } from "./brief/EvidenceDrawer";
import { FhirExportCard, PmlSheet } from "./brief/Exports";
import {
  briefPackage,
  checkEditedSentence,
  composeOptionsFrom,
  composeTemplate,
  currentBrief,
  defaultComposeOptions,
  editSentence,
  editSummary,
  findingKeysIn,
  mergeQuestions,
  packageOptionsFor,
  periodOption,
  pinnedConcerns,
  reasonFor,
  removeSentence,
  restoreSentence,
  savedIdsIn,
  savedQuestionIncluded,
  savedQuestionSentences,
  selectableFindings,
  upsertBrief,
  withContent,
  withFinding,
  withReview,
  withSavedQuestion,
  withSavedQuestionText,
  type BriefInputs,
  type ComposeOptions,
  type EditableSection,
  type PeriodDays,
} from "./brief/compose";
import { personWords } from "../shared/personWords";
import "./brief.css";
import "./brief-print.css";

type SavedQuestion = StoreData["savedQuestions"][number];
type Notice = { tone: "info" | "success" | "caution"; title: string; body?: string } | null;
type Pending = { kind: "template" | "ai"; days?: PeriodDays } | null;

const nowIso = () => new Date().toISOString();

/**
 * An AI brief's generation info with the origin of each section. Stored in data.briefs next to the GenerationInfo
 * fields (like MarkedSentence's extra fields, other readers ignore it), so the labels survive a reload.
 */
type AiGeneration = GenerationInfo & { sections?: BriefSections };

/** Where each section of this brief came from, or null for a template brief (or an AI brief saved before sections were recorded). */
function sectionsOf(b: VisitBriefRecord): BriefSections | null {
  if (b.generation.mode !== "ai") return null;
  return (b.generation as AiGeneration).sections ?? null;
}

function timeWords(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function VisitBrief() {
  const { data, today, update } = useStore();
  const { review, timeline } = useDerived();
  const llm = useLLM();
  const toast = useToast();
  const p = data.profile;
  // "Margaret’s" / "Your family member’s" (see personWords.ts); the eyebrow drops its name prefix without a name.
  const who = personWords(p);
  const editorName = p.caregiverName || "the caregiver";

  const inputs: BriefInputs = useMemo(() => ({ data, review, timeline, today }), [data, review, timeline, today]);
  const brief = currentBrief(data);
  /** Built from older records (or a period that has ended): it must be rebuilt before review and printing. */
  const briefStale = (b: VisitBriefRecord) => b.sourceRevision !== data.revision || b.to < today;

  const [evidence, setEvidence] = useState<{ ids: string[]; focus: string; claim: string | null } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [pmlOpen, setPmlOpen] = useState(false);
  const [printTarget, setPrintTarget] = useState<"brief" | "pml">("brief");
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  /**
   * AI sentences the claim check removed in the last AI run (shown as "What the check removed"), with the id of the
   * brief that run saved. It is shown only while that brief is the current one, so a brief replaced in any other
   * way (the standard template, a period change, a reset of the records) never shows sentences from an older run.
   */
  const [removed, setRemoved] = useState<{ briefId: string; items: DroppedSentence[] } | null>(null);
  const reviewBox = useRef<HTMLInputElement>(null);

  // ---- Build a template brief the first time the screen opens -------------------------------------------
  const [buildError, setBuildError] = useState<string | null>(null);
  useEffect(() => {
    if (brief) return;
    try {
      const b = makeTemplate(defaultComposeOptions(inputs));
      update("caregiver", (prev) => (prev.briefs.length ? prev : upsertBrief(prev, b)));
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "The brief could not be built.");
    }
    // Runs only when there is no brief yet (brief === null flips once). Listing inputs or update here would rebuild
    // the template on every record change and overwrite the family's brief, so the dependency list is kept narrow.
  }, [brief === null]);

  // Return to the brief after printing the medication list.
  useEffect(() => {
    const after = () => setPrintTarget("brief");
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  // ---- Derived for the current brief ----------------------------------------------------------------------
  const pkg = useMemo(() => {
    if (!brief) return null;
    try {
      return briefPackage(inputs, packageOptionsFor(brief));
    } catch {
      return null;
    }
  }, [inputs, brief]);
  const lookup = useMemo(() => new Map((pkg?.items ?? []).map((i) => [i.id, i])), [pkg]);
  const findings = useMemo(() => (pkg ? selectableFindings(inputs, pkg) : []), [inputs, pkg]);
  const concerns = useMemo(() => pinnedConcerns(data), [data]);
  const pml = useMemo(() => toPersonalMedicationList({ data, review, today, from: brief?.from, to: brief?.to }), [data, review, today, brief]);

  // ---- Helpers ----------------------------------------------------------------------------------------------
  function makeTemplate(opts: ComposeOptions, inp: BriefInputs = inputs): VisitBriefRecord {
    const { pkg: pk, content } = composeTemplate(inp, opts);
    const generation = { ...templateGenerationInfo(pk, inp.review), generatedAt: nowIso() };
    return toVisitBrief({ id: newId("brief"), pkg: pk, content, generation, data: inp.data, includedConcernIds: opts.includedConcernIds });
  }

  const save = (fn: (prev: StoreData, b: VisitBriefRecord) => StoreData) => {
    const res = update("caregiver", (prev) => {
      const b = currentBrief(prev);
      return b ? fn(prev, b) : prev;
    });
    if (!res.ok) toast.show({ tone: "attention", title: "Couldn’t save that", description: res.error });
    return res.ok;
  };
  const changeContent = (fn: (c: BriefContent, b: VisitBriefRecord) => BriefContent) =>
    save((prev, b) => upsertBrief(prev, withContent(b, fn(b.content, b))));

  // ---- Generation -------------------------------------------------------------------------------------------
  const optionsFor = (days?: PeriodDays): ComposeOptions => (brief ? composeOptionsFrom(inputs, brief, days) : defaultComposeOptions(inputs, days));

  const runTemplate = (days?: PeriodDays) => {
    try {
      const b = makeTemplate(optionsFor(days));
      if (save((prev) => upsertBrief(prev, b))) {
        setNotice(null);
        setRemoved(null);
        toast.show({ tone: "success", title: "Brief rebuilt from the records", description: "Standard template · review it before printing." });
      }
    } catch (e) {
      toast.show({ tone: "attention", title: "The brief couldn’t be built", description: e instanceof Error ? e.message : undefined });
    }
  };

  const runAI = async (days?: PeriodDays) => {
    const opts = optionsFor(days);
    let built: ReturnType<typeof composeTemplate>;
    try {
      built = composeTemplate(inputs, opts);
    } catch (e) {
      toast.show({ tone: "attention", title: "The brief couldn’t be built", description: e instanceof Error ? e.message : undefined });
      return;
    }
    setAiBusy(true);
    setNotice(null);
    setRemoved(null);
    const base = { pkg: built.pkg, data, includedConcernIds: opts.includedConcernIds };
    try {
      const res = await aiDraftBrief(built.pkg, built.content, {
        medNames: data.medications.map((m) => m.name),
        patientNames: [p.preferredName, p.displayName, "Mom"].filter(Boolean),
        kbVersion: review.kbVersion,
      });
      if (!res) {
        setNotice({ tone: "info", title: "The on-device AI isn’t loaded", body: "Load it in Settings, or use the standard template — it states the same facts." });
        return;
      }
      const savedIds = opts.savedIds ?? data.savedQuestions.map((q) => q.id);
      const content: BriefContent = { ...res.content, questions: mergeQuestions(res.content.questions, savedQuestionSentences(data, savedIds, built.pkg)) };
      const generation: AiGeneration = { ...res.info, sections: res.sections };
      const b = toVisitBrief({ id: newId("brief"), ...base, content, generation });
      save((prev) => upsertBrief(prev, b));
      setRemoved({ briefId: b.id, items: res.report.dropped });
      const dropped = res.info.droppedSentences;
      const checked = `Every AI sentence was checked against the records${dropped ? `; ${dropped} ${dropped === 1 ? "sentence was" : "sentences were"} removed because ${dropped === 1 ? "it" : "they"} didn’t match` : " and all of them matched"}.`;
      // Partial draft: the AI observations passed, too few AI questions did (assembleBrief).
      const partial = res.sections.questions === "template";
      setNotice({
        tone: partial ? "info" : "success",
        title: partial ? `AI draft ready in ${formatDuration(res.info.durationMs ?? 0)}, with standard questions` : `AI draft ready in ${formatDuration(res.info.durationMs ?? 0)}`,
        body: partial
          ? `${checked} Fewer than 2 AI questions passed, so “Our questions” uses the standard template’s questions. Review prompts, the medicine table and the limitations stay code-written.`
          : `${checked} Review prompts, the medicine table and the limitations stay code-written.`,
      });
    } catch (e) {
      if (e instanceof LLMError && e.code === "cancelled") {
        setNotice({ tone: "info", title: "AI draft cancelled", body: "The brief was left as it was." });
        return;
      }
      // Validation failure, timeout or engine error → the standard template, with a visible notice (SPEC §7).
      const generation = { ...templateGenerationInfo(built.pkg, review), generatedAt: nowIso() };
      const fallback = toVisitBrief({ id: newId("brief"), ...base, content: built.content, generation });
      save((prev) => upsertBrief(prev, fallback));
      if (e instanceof AIValidationError) setRemoved({ briefId: fallback.id, items: e.dropped });
      const why =
        e instanceof AIValidationError
          ? `${e.message}${e.dropped.length ? ` (${e.dropped.length} ${e.dropped.length === 1 ? "sentence" : "sentences"} removed by the check.)` : ""}`
          : e instanceof LLMError && e.code === "timeout"
            ? "The on-device model took too long, so the standard template is shown instead."
            : "The on-device model couldn’t finish, so the standard template is shown instead.";
      setNotice({ tone: "caution", title: "Showing the standard template", body: why });
    } finally {
      setAiBusy(false);
    }
  };

  const request = (kind: "template" | "ai", days?: PeriodDays) => {
    if (brief && editSummary(brief.content).count > 0) setPending({ kind, days });
    else if (kind === "ai") void runAI(days);
    else runTemplate(days);
  };

  // ---- Builder actions -------------------------------------------------------------------------------------
  const toggleConcern = (id: string, on: boolean) =>
    save((prev, b) => {
      const ids = on ? [...new Set([...b.includedConcernIds, id])] : b.includedConcernIds.filter((x) => x !== id);
      const inp = { ...inputs, data: prev };
      const pk = briefPackage(inp, { ...packageOptionsFor(b), includedConcernIds: ids });
      const fallback = templateBrief(pk, { data: prev, review, timeline }).reason;
      return upsertBrief(prev, withContent(b, { ...b.content, reason: reasonFor(b.content.reason, pk, fallback) }, { includedConcernIds: ids }));
    });

  const addConcern = (text: string) => {
    const ok = save((prev, b) => {
      const note: Note = { id: newId("note"), date: today, author: "caregiver", text, pinned: true, createdAt: nowIso() };
      const next = { ...prev, notes: [...prev.notes, note] };
      const ids = [...b.includedConcernIds, note.id];
      const pk = briefPackage({ ...inputs, data: next }, { ...packageOptionsFor(b), includedConcernIds: ids });
      const fallback = templateBrief(pk, { data: next, review, timeline }).reason;
      const nb = withContent(b, { ...b.content, reason: reasonFor(b.content.reason, pk, fallback) }, { includedConcernIds: ids, sourceRevision: prev.revision + 1 });
      return upsertBrief(next, nb);
    });
    if (ok) toast.show({ tone: "success", title: "Concern added", description: "Saved as a pinned note and added to the brief." });
  };

  const toggleFinding = (f: Finding, on: boolean) => {
    if (!pkg) return;
    changeContent((c) => withFinding(c, f, on, findings, pkg, data));
  };

  const toggleSaved = (q: SavedQuestion, on: boolean) => changeContent((c) => withSavedQuestion(c, q, on));

  const addSaved = (text: string) => {
    const ok = save((prev, b) => {
      const q: SavedQuestion = { id: newId("q"), text, source: "typed:brief", createdAt: nowIso() };
      const next = { ...prev, savedQuestions: [...prev.savedQuestions, q] };
      const room = savedIdsIn(b.content).length < 5;
      const nb = room ? withContent(b, withSavedQuestion(b.content, q, true), { sourceRevision: prev.revision + 1 }) : { ...b, sourceRevision: prev.revision + 1 };
      return upsertBrief(next, nb);
    });
    if (ok) toast.show({ tone: "success", title: "Question added", description: "Saved for the visit and added to the brief." });
  };

  const editSaved = (q: SavedQuestion, text: string) =>
    save((prev, b) => {
      const next = { ...prev, savedQuestions: prev.savedQuestions.map((x) => (x.id === q.id ? { ...x, text } : x)) };
      const included = savedQuestionIncluded(b.content, q);
      const nb = included ? withContent(b, withSavedQuestionText(b.content, q, text), { sourceRevision: prev.revision + 1 }) : { ...b, sourceRevision: prev.revision + 1 };
      return upsertBrief(next, nb);
    });

  const removeSaved = (q: SavedQuestion) => {
    const ok = save((prev, b) => {
      const next = { ...prev, savedQuestions: prev.savedQuestions.filter((x) => x.id !== q.id) };
      const included = savedQuestionIncluded(b.content, q);
      const nb = included ? withContent(b, withSavedQuestion(b.content, q, false), { sourceRevision: prev.revision + 1 }) : { ...b, sourceRevision: prev.revision + 1 };
      return upsertBrief(next, nb);
    });
    if (ok) toast.show({ title: "Question removed" });
  };

  const onEdit = (section: EditableSection, index: number, text: string) => changeContent((c) => editSentence(c, section, index, text, editorName));
  const onRestore = (section: EditableSection, index: number) => changeContent((c) => restoreSentence(c, section, index));
  const onRemove = (section: EditableSection, index: number) => changeContent((c) => removeSentence(c, section, index));

  const setReviewed = (on: boolean) => {
    setNudge(false);
    save((prev, b) => upsertBrief(prev, withReview(b, on, "caregiver", nowIso())));
  };

  // ---- Sharing ---------------------------------------------------------------------------------------------
  const printBrief = () => {
    if (!brief || briefStale(brief)) return;
    if (!brief.reviewedAt) {
      setNudge(true);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      reviewBox.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      reviewBox.current?.focus({ preventScroll: true });
      return;
    }
    flushSync(() => setPrintTarget("brief"));
    window.print();
  };
  const printPml = () => {
    flushSync(() => setPrintTarget("pml"));
    window.print();
  };
  const copyText = async () => {
    if (!brief) return;
    // A brief built from older records never goes out marked as reviewed.
    const stale = briefStale(brief);
    const text = briefToPlainText(stale ? { ...brief, reviewedAt: null } : brief, { data, review, today });
    try {
      await navigator.clipboard.writeText(text);
      toast.show({
        tone: "success",
        title: "Brief copied as text",
        description: brief.reviewedAt && !stale ? "Paste it into a patient-portal message." : "It’s marked as a draft until you review it.",
      });
    } catch {
      setCopyFallback(text);
    }
  };

  // ---- Render ----------------------------------------------------------------------------------------------
  const header = (
    <PageHeader
      eyebrow={who.hasName ? `${who.name} · next appointment` : "Next appointment"}
      title="Visit brief"
      subtitle={`One page for ${who.possessive} doctor or pharmacist, built from the records. Click any sentence to edit it; every sentence links to the entries behind it.`}
      actions={
        brief && (
          <div className="cg-vb-header-actions">
            <Button variant="ghost" iconLeft={<ClipboardCopy size={18} aria-hidden="true" />} onClick={() => void copyText()}>
              Copy as text
            </Button>
            <Button variant="secondary" iconLeft={<ListChecks size={18} aria-hidden="true" />} onClick={() => setPmlOpen(true)}>
              Medication list
            </Button>
            <Button
              variant="primary"
              iconLeft={<Printer size={18} aria-hidden="true" />}
              onClick={printBrief}
              disabled={briefStale(brief)}
              aria-describedby="cg-vb-print-hint"
            >
              Print / Save as PDF
            </Button>
          </div>
        )
      }
    />
  );

  if (!brief || !pkg) {
    return (
      <div className="cg-vb-page">
        {header}
        {buildError ? (
          <EmptyState icon={<FileText size={26} />} title="The brief couldn’t be built" action={<Button onClick={() => runTemplate()}>Try again</Button>}>
            {buildError}
          </EmptyState>
        ) : (
          <div className="cg-vb-loading" role="status">
            Building the brief from the records…
          </div>
        )}
      </div>
    );
  }

  const recordsChanged = briefStale(brief);
  // While the brief is stale it can't be marked reviewed or printed: rebuild first.
  const reviewed = Boolean(brief.reviewedAt) && !recordsChanged;
  // The document (and the FHIR export) never show a stale brief as "Reviewed".
  const shown: VisitBriefRecord = recordsChanged && brief.reviewedAt ? { ...brief, reviewedAt: null, reviewedBy: null } : brief;
  const edits = editSummary(brief.content);
  const includedFindings = findingKeysIn(brief.content);
  const includedSaved = savedIdsIn(brief.content);
  const statusLine =
    brief.generation.mode === "ai"
      ? `On-device AI draft · ${timeWords(brief.generation.generatedAt)}${brief.generation.durationMs ? ` · ${formatDuration(brief.generation.durationMs)}` : ""}`
      : `Standard template · built ${timeWords(brief.generation.generatedAt)}`;
  const sections = sectionsOf(brief);
  const checks = (section: EditableSection, index: number) => checkEditedSentence(brief.content[section][index], section, pkg, data);
  const whoWrote = (n: Note) => (n.author === "caregiver" ? p.caregiverName || "You" : p.preferredName || "Patient");

  return (
    <div className="cg-vb-page">
      {header}

      <div className="cg-vb-layout">
        <div className="cg-vb-main">
          <div className={cx("cg-vb-reviewbar", reviewed && "is-reviewed", nudge && !reviewed && "is-nudged")}>
            <label className="cg-vb-review">
              <input
                ref={reviewBox}
                type="checkbox"
                className="cg-vb-review__box"
                checked={reviewed}
                disabled={recordsChanged}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <span className="cg-vb-review__text">
                <span className="cg-vb-review__title">I’ve reviewed this brief</span>
                <span className="cg-vb-review__sub" id="cg-vb-print-hint">
                  {recordsChanged
                    ? brief.to < today && brief.sourceRevision === data.revision
                      ? `Rebuild first. This brief ends on ${formatShort(brief.to)}.`
                      : "Rebuild first. The records changed."
                    : reviewed
                    ? `Reviewed by ${editorName} · ${timeWords(brief.reviewedAt)}. Ready to print.`
                    : nudge
                      ? "Please read the brief and tick this box first — it’s required before printing."
                      : "Required before printing. Editing anything unticks it."}
                </span>
              </span>
            </label>
            <span className="cg-vb-reviewbar__meta">
              <ShieldCheck size={16} aria-hidden="true" />
              {edits.count > 0 ? `${edits.count} ${edits.count === 1 ? "sentence" : "sentences"} edited by ${edits.editors.join(", ")}` : "No edits"}
            </span>
          </div>

          {notice && (
            <Callout tone={notice.tone === "success" ? "success" : notice.tone} title={notice.title} className="cg-vb-callout">
              {notice.body}
            </Callout>
          )}
          {removed?.briefId === brief.id && removed.items.length > 0 && <CheckRemoved items={removed.items} name={p.preferredName || p.displayName} />}
          {recordsChanged && (
            <Callout
              tone="info"
              title={brief.to < today ? `This brief ends on ${formatShort(brief.to)}` : `${who.Possessive} records changed since this brief was built`}
              className="cg-vb-callout"
              action={
                <Button size="sm" variant="secondary" iconLeft={<RefreshCw size={16} aria-hidden="true" />} onClick={() => request("template")}>
                  Rebuild
                </Button>
              }
            >
              Rebuild it to include the latest check-ins and medicines{edits.count ? " (your edited sentences will be rewritten)" : ""}.
            </Callout>
          )}

          {/* BriefDocument labels only the sections the AI drafted (generation.sections); the builder lists each one's origin. */}
          <div className="cg-vb-paper">
            <BriefDocument
              brief={shown}
              inputs={inputs}
              pkg={pkg}
              lookup={lookup}
              mode="screen"
              idPrefix="cg-vb-screen"
              checks={checks}
              onEdit={onEdit}
              onRestore={onRestore}
              onRemove={onRemove}
              onEvidence={(ids, focus, claim) => setEvidence({ ids, focus, claim })}
            />
          </div>
        </div>

        <aside className="cg-vb-builder" aria-label="Build the brief">
          <DraftPanel
            period={periodOption(brief)}
            onPeriod={(d) => request("template", d)}
            llm={llm}
            aiBusy={aiBusy}
            onTemplate={() => request("template")}
            onAI={() => request("ai")}
            onCancelAI={() => cancelAI("Cancelled by the caregiver.")}
            statusLine={statusLine}
            sections={sections}
          />
          <ConcernsPanel concerns={concerns} included={brief.includedConcernIds} onToggle={toggleConcern} onAdd={addConcern} whoWrote={whoWrote} />
          <FindingsPanel
            findings={findings}
            included={includedFindings}
            statusOf={(key) => decisionFor(data.reviewDecisions, key) ?? "open"}
            onToggle={toggleFinding}
          />
          <QuestionsPanel
            questions={data.savedQuestions}
            isIncluded={(q) => savedQuestionIncluded(brief.content, q)}
            includedCount={includedSaved.length}
            onToggle={toggleSaved}
            onAdd={addSaved}
            onEdit={editSaved}
            onRemove={removeSaved}
          />
          <FhirExportCard
            data={data}
            review={review}
            brief={shown}
            today={today}
            onDownloaded={(file, n) => toast.show({ tone: "success", title: "FHIR bundle downloaded", description: `${file} · ${n} resources` })}
          />
        </aside>
      </div>

      <EvidenceDrawer ids={evidence?.ids ?? null} focus={evidence?.focus} claim={evidence?.claim} lookup={lookup} onClose={() => setEvidence(null)} />

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        size="sm"
        title="Rewrite the brief?"
        description={`This rebuilds the brief from the records and replaces ${edits.count} edited ${edits.count === 1 ? "sentence" : "sentences"}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Keep my edits
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const job = pending;
                setPending(null);
                if (job?.kind === "ai") void runAI(job.days);
                else runTemplate(job?.days);
              }}
            >
              Rebuild
            </Button>
          </>
        }
      >
        <p className="cg-vb-modal-text">Your review prompts, concerns and saved questions stay selected.</p>
      </Modal>

      <Modal
        open={pmlOpen}
        onClose={() => setPmlOpen(false)}
        size="lg"
        title="Personal Medication List"
        description="In the layout Medicare pharmacists use after a medication review (CMS Personal Medication List). Bring it to every visit and to the pharmacy."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPmlOpen(false)}>
              Close
            </Button>
            <Button variant="primary" iconLeft={<Printer size={18} aria-hidden="true" />} onClick={printPml}>
              Print the list
            </Button>
          </>
        }
      >
        <div className="cg-vb-pml-frame">
          <PmlSheet pml={pml} isDemo={data.isDemoData} />
        </div>
      </Modal>

      <Modal
        open={copyFallback !== null}
        onClose={() => setCopyFallback(null)}
        title="Copy the brief as text"
        description="Your browser blocked automatic copying. Select the text below and copy it."
      >
        <textarea className="ui-input cg-vb-copy" readOnly rows={14} value={copyFallback ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Brief as plain text" />
      </Modal>

      {createPortal(
        <div className={cx("cg-vb-print-root", `cg-vb-print-root--${printTarget}`)} aria-hidden="true" data-theme="light">
          {printTarget === "pml" ? (
            <PmlSheet pml={pml} isDemo={data.isDemoData} />
          ) : reviewed ? (
            <BriefDocument brief={brief} inputs={inputs} pkg={pkg} lookup={lookup} mode="print" idPrefix="cg-vb-print" />
          ) : (
            // It prints "Visit brief · <name>": never an orphan "·" when the profile has no name.
            <NotReviewedNotice name={p.displayName.trim() || who.Name} caregiver={editorName} />
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
