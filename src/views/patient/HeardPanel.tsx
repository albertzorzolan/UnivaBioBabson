// "Here's what I heard": the result of reading Margaret's story on the device.
//   1. her story with the words that were used highlighted (colour + underline + a small label — never colour alone)
//   2. one card per proposed answer with how sure the reading is and Accept / Change
//   3. what was deliberately NOT added and why ("that's about someone else")
//   4. other symptoms and medicine remarks she can keep or remove (with the static Poison Control line when a remark
//      says too much of a medicine, or the wrong one, was taken: MedSafetyLine.tsx)
//   5. optionally, a second look by the on-device language model (only when it is already loaded)
// When her words describe one of the app's listed emergency signs, the static 911 line (EmergencyLine.tsx: the Help
// dialog's 911 row, word for word) comes first, right under the heading.
// When the story gives no answer to fill in, it says so and offers a jump to the questions (the quick form below).
import { useMemo, useState } from "react";
import {
  ArrowDown,
  Check,
  CircleCheck,
  CircleSlash,
  Lock,
  Pencil,
  Pill,
  Sparkles,
  Undo2,
} from "lucide-react";
import type { CheckIn, DiaryAnswers, DiaryField, Extraction, Medication, OtherSymptom, Proposal } from "../../model/types";
import { CONCEPTS, isConceptId } from "../../engine/nlp/lexicon";
import { AIBadge, Badge, Button, Callout, cx, type Tone } from "../../ui";
import { layoutStory, type MarkKind, type StoryMark } from "./highlight";
import { MedSafetyLine, needsPoisonLine } from "./MedSafetyLine";
import { EmergencyLine, describesEmergencySign } from "./EmergencyLine";
import { CrisisLine, describesSelfHarm } from "./CrisisLine";
import { FIELD_LABEL, FIELD_TAG, MAIN_FIELDS, answerWords, dedupeSkipped, isAccepted, type CheckInForm } from "./checkin";

const NO_TAG: Partial<Record<DiaryField, string>> = {
  dizziness: "Not dizzy",
  drowsiness: "Not drowsy",
  confusion: "Not foggy",
  fall: "No fall",
  nearFall: "No near-fall",
  swelling: "No swelling",
};

export function conceptLabel(id: string): string {
  const label = isConceptId(id) ? CONCEPTS[id].label : id.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function proposalKey(p: Proposal): string {
  return `${p.origin}:${p.field}`;
}

function proposalMark(p: Proposal): { kind: MarkKind; label: string } {
  if (p.certainty === "conflict") return { kind: "conflict", label: `${FIELD_TAG[p.field]}?` };
  if (p.value === true) return { kind: "yes", label: FIELD_TAG[p.field] };
  if (p.value === false) return { kind: "no", label: NO_TAG[p.field] ?? `No ${FIELD_TAG[p.field].toLowerCase()}` };
  const guess = p.certainty === "inferred" ? "?" : "";
  if (p.field === "energy" || p.field === "sleep") return { kind: "value", label: `${FIELD_TAG[p.field]} ${String(p.value)} of 5${guess}` };
  if (p.field === "appetite") return { kind: "value", label: `Appetite: ${answerWords("appetite", p.value).toLowerCase()}${guess}` };
  return { kind: "value", label: `${answerWords(p.field, p.value)}${guess}` };
}

function skipTag(why: string): string {
  if (why.includes("someone else")) return "Someone else";
  if (why.includes("another day")) return "Another day";
  if (why.includes("worry")) return "A worry";
  return "Not added";
}

const CERTAINTY: Record<Proposal["certainty"], { tone: Tone; text: string }> = {
  explicit: { tone: "success", text: "You said this" },
  inferred: { tone: "caution", text: "My best guess — please check" },
  conflict: { tone: "info", text: "You said both — please choose" },
};

/** Proposals that need her decision come first, then the ones she stated outright. */
function orderProposals(ps: Proposal[]): Proposal[] {
  const rank = (p: Proposal) => (p.certainty === "conflict" ? 0 : p.certainty === "inferred" ? 1 : 2);
  return [...ps].sort((a, b) => rank(a) - rank(b));
}

export interface AiState {
  status: "idle" | "running" | "done" | "error";
  added: number;
  ms: number | null;
  model: string | null;
}

export interface HeardPanelProps {
  story: string;
  extraction: Extraction & { durationMs: number };
  aiProposals: Proposal[];
  form: CheckInForm;
  meds: Medication[];
  others: OtherSymptom[];
  removedOthers: string[];
  onToggleOther: (conceptId: string) => void;
  medNotes: CheckIn["medNotes"];
  removedMedNotes: number[];
  onToggleMedNote: (index: number) => void;
  onAccept: (p: Proposal, chosen?: DiaryAnswers[DiaryField]) => void;
  onUnaccept: (p: Proposal) => void;
  onChange: (field: DiaryField) => void;
  /** Present only when the on-device model is loaded. */
  ai: { state: AiState; onRun: () => void } | null;
  /** The story box has changed since this reading. */
  stale: boolean;
}

function ProposalCard({
  p,
  form,
  active,
  onHover,
  onAccept,
  onUnaccept,
  onChange,
}: {
  p: Proposal;
  form: CheckInForm;
  active: boolean;
  onHover: (key: string | null) => void;
  onAccept: HeardPanelProps["onAccept"];
  onUnaccept: HeardPanelProps["onUnaccept"];
  onChange: HeardPanelProps["onChange"];
}) {
  const accepted = isAccepted(form, p);
  const key = proposalKey(p);
  const c = CERTAINTY[p.certainty];
  const quotes = [...new Set(p.spans.map((s) => s.quote))].slice(0, 3);
  const isBool = typeof form.answers[p.field] === "boolean" || ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"].includes(p.field);
  const chosen = accepted && p.certainty === "conflict" ? form.answers[p.field] : null;
  const label = FIELD_LABEL[p.field];
  return (
    <li
      className={cx("pt-prop", `pt-prop--${p.certainty}`, accepted && "is-accepted", active && "is-active")}
      onMouseEnter={() => onHover(key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(key)}
      onBlur={() => onHover(null)}
    >
      <div className="pt-prop__badges">
        <Badge tone={c.tone} icon size="sm">
          {c.text}
        </Badge>
        {p.origin === "llm" && (
          <Badge tone="primary" icon={<Sparkles size={12} aria-hidden="true" />} size="sm">
            AI suggestion
          </Badge>
        )}
      </div>
      <p className="pt-prop__field">{label}</p>
      <p className="pt-prop__value">
        {p.certainty === "conflict" ? (chosen === null ? "Which is right for today?" : answerWords(p.field, chosen)) : answerWords(p.field, p.value)}
      </p>
      <p className="pt-prop__quote">
        <span className="ui-visually-hidden">From your words: </span>
        {quotes.map((q, i) => (
          <span key={q}>
            {i > 0 && <span className="pt-prop__and"> and </span>}
            <q>{q}</q>
          </span>
        ))}
      </p>
      <div className="pt-prop__actions">
        {p.certainty === "conflict" && !accepted && isBool ? (
          <>
            <Button size="lg" variant="secondary" iconLeft={<Check size={20} aria-hidden="true" />} onClick={() => onAccept(p, true)} aria-label={`${label}: Yes`}>
              Yes
            </Button>
            <Button size="lg" variant="secondary" onClick={() => onAccept(p, false)} aria-label={`${label}: No`}>
              No
            </Button>
          </>
        ) : p.certainty === "conflict" && !accepted ? (
          <Button size="lg" variant="secondary" iconLeft={<Pencil size={18} aria-hidden="true" />} onClick={() => onChange(p.field)}>
            Choose below
          </Button>
        ) : accepted ? (
          <>
            <span className="pt-prop__done">
              <CircleCheck size={20} aria-hidden="true" />
              Added
            </span>
            <Button size="lg" variant="ghost" iconLeft={<Undo2 size={18} aria-hidden="true" />} onClick={() => onUnaccept(p)} aria-label={`Undo ${label}`}>
              Undo
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" variant="primary" iconLeft={<Check size={20} aria-hidden="true" />} onClick={() => onAccept(p)} aria-label={`Yes, that’s right — ${label}: ${answerWords(p.field, p.value)}`}>
              Yes, that’s right
            </Button>
            <Button size="lg" variant="ghost" iconLeft={<Pencil size={18} aria-hidden="true" />} onClick={() => onChange(p.field)} aria-label={`Change ${label}`}>
              Change
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function HeardPanel(props: HeardPanelProps) {
  const { story, extraction, aiProposals, form, meds, others, removedOthers, medNotes, removedMedNotes, ai, stale } = props;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const proposals = useMemo(() => orderProposals([...extraction.proposals, ...aiProposals]), [extraction.proposals, aiProposals]);
  const skipped = useMemo(() => dedupeSkipped(extraction.skipped), [extraction.skipped]);
  const medName = (id: string | null) => meds.find((m) => m.id === id)?.name ?? null;

  const segments = useMemo(() => {
    const marks: StoryMark[] = [];
    for (const p of proposals) {
      const { kind, label } = proposalMark(p);
      for (const s of p.spans) marks.push({ start: s.start, end: s.end, kind, label, key: proposalKey(p) });
    }
    medNotes.forEach((n, i) => {
      if (n.span) marks.push({ start: n.span.start, end: n.span.end, kind: "med", label: "Medicine", key: `med:${i}` });
    });
    for (const o of others) {
      if (o.span)
        marks.push({ start: o.span.start, end: o.span.end, kind: "other", label: o.present ? conceptLabel(o.conceptId) : `No ${conceptLabel(o.conceptId).toLowerCase()}`, key: `other:${o.conceptId}` });
    }
    for (const s of skipped) {
      const sp = s.item.mention.span;
      marks.push({ start: sp.start, end: sp.end, kind: "skip", label: skipTag(s.why), key: `skip:${sp.start}` });
    }
    return layoutStory(story, marks);
  }, [story, proposals, medNotes, others, skipped]);

  const needDecision = proposals.filter((p) => p.certainty !== "explicit" && !isAccepted(form, p)).length;
  const counts = [
    proposals.length > 0 ? `${proposals.length} ${proposals.length === 1 ? "answer" : "answers"}` : null,
    others.length > 0 ? `${others.length} other ${others.length === 1 ? "symptom" : "symptoms"}` : null,
    medNotes.length > 0 ? `${medNotes.length} ${medNotes.length === 1 ? "note" : "notes"} about your medicines` : null,
  ].filter(Boolean) as string[];
  const ms = extraction.durationMs;
  // No answer to fill in: say so plainly and offer the questions, starting with the first one still open.
  const noAnswers = proposals.length === 0;
  const firstOpen = MAIN_FIELDS.find((f) => form.answers[f] === null) ?? MAIN_FIELDS[0];
  const countsText = counts.length > 1 ? `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}` : counts[0];

  return (
    <section className="pt-heard" aria-labelledby="pt-heard-title" data-tour="checkin-heard">
      <div className="pt-heard__head">
        <div>
          <p className="ui-eyebrow">Check what I found</p>
          <h2 id="pt-heard-title" className="pt-section-title" tabIndex={-1}>
            Here’s what I heard
          </h2>
          <p className="pt-section-lead" aria-live="polite">
            {noAnswers && others.length === 0 && medNotes.length === 0
              ? "I didn’t find a symptom I can fill in."
              : noAnswers
                ? `I found ${countsText}, but no symptom I can fill in.`
                : `I found ${countsText}.`}
            {needDecision > 0 && ` ${needDecision === 1 ? "One needs" : `${needDecision} need`} your check.`}
          </p>
        </div>
        <p className="pt-heard__privacy">
          <Lock size={16} aria-hidden="true" />
          <span>
            Read on this device in <span className="ui-num">{ms < 1 ? "under 1" : Math.round(ms)}</span> ms · nothing was sent anywhere
          </span>
        </p>
      </div>

      {/* Read from the words this panel shows (the reading's story), before anything to check or accept. */}
      {describesEmergencySign(story) && <EmergencyLine className="pt-emergency--top" />}
      {describesSelfHarm(story) && <CrisisLine className="pt-emergency--top" />}

      {stale && (
        <p className="pt-heard__stale" role="status">
          <Pencil size={16} aria-hidden="true" />
          You’ve changed your words since I read them. Tap “Fill in my check-in” again to update this.
        </p>
      )}

      {noAnswers && (
        // The button sits in the body (not the side action slot) so it wraps under the text on a phone.
        <Callout tone="info">
          <p>You can answer the questions below directly.</p>
          <Button size="lg" variant="secondary" iconRight={<ArrowDown size={18} aria-hidden="true" />} onClick={() => props.onChange(firstOpen)}>
            Go to the questions
          </Button>
        </Callout>
      )}

      <blockquote className="pt-story" aria-label="Your words, with the parts I used marked">
        {segments.map((s, i) =>
          s.type === "text" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <mark key={i} className={cx("pt-hl", `pt-hl--${s.kind}`, activeKey && s.keys.includes(activeKey) && "is-active")}>
              {s.text}
              <span className="ui-visually-hidden"> (</span>
              <span className="pt-hl__tag">{s.labels.join(" · ")}</span>
              <span className="ui-visually-hidden">)</span>
            </mark>
          ),
        )}
      </blockquote>

      {proposals.length > 0 && (
        <ul role="list" className="pt-props" aria-label="Answers I found">
          {proposals.map((p) => (
            <ProposalCard
              key={proposalKey(p)}
              p={p}
              form={form}
              active={activeKey === proposalKey(p)}
              onHover={setActiveKey}
              onAccept={props.onAccept}
              onUnaccept={props.onUnaccept}
              onChange={props.onChange}
            />
          ))}
        </ul>
      )}

      {(skipped.length > 0 || others.length > 0 || medNotes.length > 0) && (
        <div className="pt-heard__extras">
          {skipped.length > 0 && (
            <div className="pt-extra">
              <h3 className="pt-extra__title">
                <CircleSlash size={20} aria-hidden="true" />
                Things I didn’t add
              </h3>
              <ul role="list" className="pt-skips">
                {skipped.map((s) => (
                  <li key={`${s.quote}-${s.item.mention.span.start}`} className="pt-skip">
                    <q className="pt-skip__quote">{s.quote}</q>
                    <span className="pt-skip__why"> — {s.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {others.length > 0 && (
            <div className="pt-extra">
              <h3 className="pt-extra__title">Also mentioned</h3>
              <p className="pt-extra__hint">These are kept with today’s check-in. Tap one to take it off.</p>
              <ul role="list" className="pt-keep-list">
                {others.map((o) => {
                  const kept = !removedOthers.includes(o.conceptId);
                  const label = o.present ? conceptLabel(o.conceptId) : `No ${conceptLabel(o.conceptId).toLowerCase()}`;
                  return (
                    <li key={o.conceptId}>
                      <button
                        type="button"
                        className={cx("pt-keep", kept && "is-kept")}
                        aria-pressed={kept}
                        onClick={() => props.onToggleOther(o.conceptId)}
                      >
                        {kept ? <CircleCheck size={20} aria-hidden="true" /> : <CircleSlash size={20} aria-hidden="true" />}
                        <span>{label}</span>
                        <span className="pt-keep__state">{kept ? "Kept" : "Taken off"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {medNotes.length > 0 && (
            <div className="pt-extra">
              <h3 className="pt-extra__title">
                <Pill size={20} aria-hidden="true" />
                About your medicines
              </h3>
              <p className="pt-extra__hint">Alex will see these notes. Nothing about your medicines is changed.</p>
              <ul role="list" className="pt-keep-list pt-keep-list--stack">
                {medNotes.map((n, i) => {
                  const kept = !removedMedNotes.includes(i);
                  const name = medName(n.medicationId);
                  return (
                    <li key={`${n.text}-${i}`}>
                      <button type="button" className={cx("pt-keep pt-keep--wide", kept && "is-kept")} aria-pressed={kept} onClick={() => props.onToggleMedNote(i)}>
                        {kept ? <CircleCheck size={20} aria-hidden="true" /> : <CircleSlash size={20} aria-hidden="true" />}
                        <span className="pt-keep__text">
                          <q>{n.text}</q>
                          {name && <span className="pt-keep__sub">About: {name}</span>}
                        </span>
                        <span className="pt-keep__state">{kept ? "Kept" : "Taken off"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* Shown for every note read from the story, kept or taken off: taking a note off hides it from Alex,
                  it does not change what happened. */}
              {needsPoisonLine(medNotes) && <MedSafetyLine />}
            </div>
          )}
        </div>
      )}

      {ai && (
        <div className="pt-ai" aria-live="polite">
          {ai.state.status === "done" ? (
            <p className="pt-ai__result">
              <AIBadge model={ai.state.model} ms={ai.state.ms} />
              <span>
                {ai.state.added > 0
                  ? `Added ${ai.state.added} ${ai.state.added === 1 ? "suggestion" : "suggestions"} — marked “AI suggestion” above. Please check ${ai.state.added === 1 ? "it" : "them"}.`
                  : "No extra suggestions — everything I could find is already above."}
              </span>
            </p>
          ) : (
            <>
              <p className="pt-ai__text">
                <Sparkles size={18} aria-hidden="true" />
                <span>Smarter suggestions are available on this device.</span>
              </p>
              <Button
                variant="secondary"
                size="lg"
                loading={ai.state.status === "running"}
                iconLeft={<Sparkles size={18} aria-hidden="true" />}
                onClick={ai.onRun}
              >
                {ai.state.status === "running" ? "Checking…" : "Check with on-device AI"}
              </Button>
              {ai.state.status === "error" && (
                <p className="pt-ai__error">The on-device AI couldn’t check this time. Your answers are not affected.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
