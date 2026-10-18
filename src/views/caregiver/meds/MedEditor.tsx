// Add / Edit medication drawer: name autocomplete + live match indicator, the medication details, and the
// live review preview. Saving writes the Medication and its MedEvents through the store (caregiver only).
import { useId, useMemo, useState, type FormEvent } from "react";
import { CircleCheck, CircleHelp, Info, TriangleAlert } from "lucide-react";
import type { DrugMatch } from "../../../kb/types";
import { KB, getClass, getDrug, matchDrug, searchDrugs } from "../../../kb";
import type { ISODate, Medication, StoreData } from "../../../model/types";
import { formatShort } from "../../../model/dates";
import { previewAddition, reviewMedications } from "../../../engine/meds";
import { useStore } from "../../../app/StoreProvider";
import { Button, Drawer, TextInput, cx } from "../../../ui";
import { DrugCombobox } from "./DrugCombobox";
import { ReviewPreview } from "./ReviewPreview";
import { previewName } from "./previewName";
import { diffPrompts } from "./reviewRecords";
import {
  addMedication,
  doseChanged,
  draftFromMed,
  editMedication,
  emptyDraft,
  genericLabel,
  knownPrescribers,
  resolveMatch,
  validateDraft,
  type DraftErrors,
  type FuzzyDecision,
  type MedDraft,
} from "./medRecords";

export interface MedEditorResult {
  mode: "added" | "edited";
  med: Medication;
  /** New review prompts the change added (same rule-level diff as the live preview). */
  addedPrompts: number;
  /** Existing prompts the medicine joined or changed (e.g. the ACB total now includes it). */
  joinedPrompts: number;
}

export interface MedEditorProps {
  open: boolean;
  /** The medicine to edit; null to add a new one. */
  editing: Medication | null;
  onClose: () => void;
  onSaved: (r: MedEditorResult) => void;
}

const NO_MATCH: DrugMatch = { ingredientIds: [], match: "none", suggestion: null, normalized: "" };

function safeMatch(name: string): DrugMatch {
  try {
    return name.trim() ? matchDrug(name) : NO_MATCH;
  } catch {
    return NO_MATCH;
  }
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** "lorazepam (Ativan)" · "Tylenol PM → acetaminophen + diphenhydramine" */
function matchedText(m: Pick<DrugMatch, "ingredientIds" | "match" | "normalized">): string {
  const generic = genericLabel(m.ingredientIds) ?? "";
  if (m.ingredientIds.length > 1) {
    const combo = KB.combos.find((c) => c.names.includes(m.normalized) || c.id === m.normalized);
    return `${combo?.display ?? titleCase(m.normalized)} → ${generic}`;
  }
  const drug = getDrug(m.ingredientIds[0]);
  if (m.match === "brand" && m.normalized) return `${generic} (${titleCase(m.normalized)})`;
  if (m.match === "alias" && m.normalized) return `${generic} (from “${m.normalized}”)`;
  const brand = drug?.brands[0];
  return brand ? `${generic} (${titleCase(brand)})` : generic;
}

/** KB context for a matched single-ingredient medicine: its class and what it is commonly used for. */
function MatchContext({ ids }: { ids: string[] }) {
  if (ids.length !== 1) return null;
  const drug = getDrug(ids[0]);
  if (!drug) return null;
  const cls = drug.classes.map((c) => getClass(c)?.display).find(Boolean);
  return (
    <span className="cg-match__context">
      {cls && <span className="cg-match__class">{cls}</span>}
      {drug.usedFor && <span>Commonly used for {drug.usedFor.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}.</span>}
    </span>
  );
}

function MatchStatus({
  name,
  match,
  stored,
  decision,
  onDecide,
}: {
  name: string;
  match: DrugMatch;
  /** The saved match, when editing and the name hasn't changed. */
  stored: Pick<Medication, "ingredientIds" | "match"> | null;
  decision: FuzzyDecision;
  onDecide: (d: FuzzyDecision) => void;
}) {
  if (!name.trim()) return null;
  if (stored) {
    if (stored.match === "none" || stored.ingredientIds.length === 0) return <NotInList />;
    return (
      <div className="cg-match cg-match--ok">
        <CircleCheck size={18} aria-hidden="true" />
        <div>
          <p className="cg-match__title">
            Matched: {genericLabel(stored.ingredientIds)}
            {stored.match === "fuzzy_confirmed" && <span className="cg-match__aside"> · spelling confirmed by you</span>}
          </p>
          <MatchContext ids={stored.ingredientIds} />
        </div>
      </div>
    );
  }
  if (match.match === "fuzzy") {
    if (decision === "confirmed") {
      return (
        <div className="cg-match cg-match--ok">
          <CircleCheck size={18} aria-hidden="true" />
          <div>
            <p className="cg-match__title">
              Matched: {genericLabel(match.ingredientIds)} <span className="cg-match__aside">· you confirmed the spelling</span>
            </p>
            <MatchContext ids={match.ingredientIds} />
          </div>
          <button type="button" className="cg-match__undo" onClick={() => onDecide(null)}>
            Undo
          </button>
        </div>
      );
    }
    if (decision === "declined") return <NotInList onUndo={() => onDecide(null)} />;
    return (
      <div className="cg-match cg-match--ask">
        <CircleHelp size={18} aria-hidden="true" />
        <div className="cg-match__body">
          <p className="cg-match__title">Did you mean {match.suggestion}?</p>
          <p className="cg-match__context">Kinwise only reviews a medicine once you confirm the name.</p>
          <div className="cg-match__actions">
            <Button size="sm" variant="primary" onClick={() => onDecide("confirmed")}>
              Yes, it’s {match.suggestion}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDecide("declined")}>
              No, keep “{name.trim()}”
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (match.match === "none" || match.ingredientIds.length === 0) return <NotInList />;
  return (
    <div className="cg-match cg-match--ok">
      <CircleCheck size={18} aria-hidden="true" />
      <div>
        <p className="cg-match__title">Matched: {matchedText(match)}</p>
        <MatchContext ids={match.ingredientIds} />
      </div>
    </div>
  );
}

function NotInList({ onUndo }: { onUndo?: () => void }) {
  return (
    <div className="cg-match cg-match--none">
      <Info size={18} aria-hidden="true" />
      <div>
        <p className="cg-match__title">Not in Kinwise’s reference list — it will be saved, but not reviewed.</p>
        <p className="cg-match__context">That says nothing about the medicine itself; the pharmacist can check it.</p>
      </div>
      {onUndo && (
        <button type="button" className="cg-match__undo" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  );
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label className="cg-check" htmlFor={id}>
      <input id={id} type="checkbox" className="cg-check__input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="cg-check__box" aria-hidden="true">
        <CircleCheck size={14} />
      </span>
      <span className="cg-check__text">
        <span className="cg-check__label">{label}</span>
        {hint && <span className="cg-check__hint">{hint}</span>}
      </span>
    </label>
  );
}

/** Review prompts this save adds or joins (same engine call and rule-level diff as the live preview). */
function countPromptChanges(data: StoreData, today: ISODate, d: MedDraft, editing: Medication | null): { added: number; joined: number } {
  try {
    const state = { meds: data.medications, profile: data.profile, checkIns: data.checkIns, today };
    const p = previewAddition(state, { ...d, id: editing?.id, endDate: editing?.endDate ?? null });
    if (!p.matched) return { added: 0, joined: 0 };
    const diff = diffPrompts(reviewMedications(state).findings, p.after.findings);
    return { added: diff.fresh.length, joined: diff.changed.length };
  } catch {
    return { added: 0, joined: 0 };
  }
}

/** Wrapper that remounts the form whenever the drawer opens for a different medicine (fresh state). */
export function MedEditor(props: MedEditorProps) {
  const { open, editing, onClose } = props;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow={editing ? "Edit medication" : "Add medication"}
      title={editing ? editing.name : "Add a medicine"}
      description={
        editing
          ? "Fix details or record a dose change. To record that it was stopped, use “Stop” on the list."
          : "Prescriptions, over-the-counter products and supplements all count — enter the name as it appears on the label."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="cg-med-form">
            {editing ? "Save changes" : "Save medication"}
          </Button>
        </>
      }
    >
      {open && <MedForm key={editing?.id ?? "new"} {...props} />}
    </Drawer>
  );
}

function MedForm({ editing, onSaved }: MedEditorProps) {
  const { data, today, update } = useStore();
  const person = data.profile.preferredName || "they";
  const caregiver = data.profile.caregiverName || "the caregiver";
  const [draft, setDraft] = useState<MedDraft>(() => (editing ? draftFromMed(editing) : emptyDraft(today)));
  const [decision, setDecision] = useState<FuzzyDecision>(null);
  const [otcTouched, setOtcTouched] = useState(Boolean(editing));
  const [doseDate, setDoseDate] = useState<ISODate>(today);
  const [submitted, setSubmitted] = useState(false);
  // The name a Save was attempted with while its "Did you mean …?" question was unanswered. The reminder to answer
  // it only shows for that name, so typing a new name never greets the user with an error before they press Save.
  const [unansweredAtSave, setUnansweredAtSave] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const prescriberListId = useId();

  const set = <K extends keyof MedDraft>(k: K, v: MedDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Editing with the name unchanged keeps the stored match (including a confirmed fuzzy match).
  const stored = editing && draft.name.trim() === editing.name.trim() ? { ingredientIds: editing.ingredientIds, match: editing.match } : null;
  const nameChanged = stored === null;
  const match = useMemo(() => (nameChanged ? safeMatch(draft.name) : NO_MATCH), [draft.name, nameChanged]);
  const resolved = stored ?? resolveMatch(match, decision);
  const fuzzyPending = nameChanged && match.match === "fuzzy" && decision === null;
  // Still typing towards a suggestion ("tylen" → Tylenol PM): don't announce "can't check" yet.
  const choosing = useMemo(() => {
    const q = draft.name.trim().toLowerCase();
    if (!nameChanged || match.match !== "none" || q.length < 2) return false;
    try {
      return searchDrugs(q, 8).some((h) => h.label.toLowerCase() !== q && h.label.toLowerCase().startsWith(q));
    } catch {
      return false;
    }
  }, [draft.name, nameChanged, match.match]);

  // OTC follows the KB until the user sets it themselves.
  const kbOtc = resolved.ingredientIds.length > 0 && resolved.ingredientIds.every((id) => getDrug(id)?.otc === true);
  const otc = otcTouched ? draft.otc : kbOtc;
  const full: MedDraft = { ...draft, ...resolved, otc };
  // While a suggestion awaits a yes/no, preview it as if confirmed (clearly labelled).
  // Prompt titles use the reference-list name ("Tylenol PM", not the typed "tylenol pm"); an unchanged saved name stays as it is.
  const previewDraft: MedDraft = {
    ...(fuzzyPending ? { ...full, ingredientIds: match.ingredientIds, match: "fuzzy_confirmed" as const } : full),
    name: stored ? draft.name : previewName(draft.name, match),
  };

  const askReminder = fuzzyPending && unansweredAtSave === draft.name;
  const errors: DraftErrors = submitted ? validateDraft(full, today, { fuzzyPending: askReminder, person }) : {};
  const showDoseDate = editing !== null && doseChanged(editing, full);

  // Same ingredient already on the active list (another entry)?
  const duplicate = useMemo(() => {
    if (!resolved.ingredientIds.length) return null;
    return (
      data.medications.find(
        (m) => m.id !== editing?.id && (!m.endDate || m.endDate >= today) && m.ingredientIds.some((i) => resolved.ingredientIds.includes(i)),
      ) ?? null
    );
  }, [resolved.ingredientIds, data.medications, editing, today]);

  const prescribers = useMemo(() => knownPrescribers(data.medications), [data.medications]);

  const onNameChange = (v: string) => {
    set("name", v);
    setDecision(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setUnansweredAtSave(fuzzyPending ? draft.name : null);
    setSaveError(null);
    const errs = validateDraft(full, today, { fuzzyPending, person });
    if (showDoseDate && (doseDate > today || doseDate < full.startDate)) errs.dose = "Check the date the dose changed.";
    if (Object.keys(errs).length) {
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("#cg-med-form [aria-invalid='true']")?.focus());
      return;
    }
    // "Diphenhydramine 25 mg" with an empty dose field: keep the strength in the dose, not the name.
    const strength = /^(.*\S)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|units?|iu)\b.*)$/i.exec(full.name.trim());
    if (strength && !full.dose.trim()) {
      full.name = strength[1];
      full.dose = strength[2];
    }
    const now = new Date().toISOString();
    const ctx = { today, now, actorName: caregiver };
    let saved: Medication | null = null;
    const prompts = countPromptChanges(data, today, full, editing);
    const res = update("caregiver", (prev: StoreData) => {
      if (editing) {
        const next = editMedication(prev, editing.id, full, { ...ctx, doseChangeDate: doseDate });
        saved = next.medications.find((m) => m.id === editing.id) ?? null;
        return next;
      }
      const r = addMedication(prev, full, ctx);
      saved = r.med;
      return r.data;
    });
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    if (saved) onSaved({ mode: editing ? "edited" : "added", med: saved, addedPrompts: prompts.added, joinedPrompts: prompts.joined });
  };

  return (
    <form
      id="cg-med-form"
      className="cg-med-form"
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        // Enter in the name box picks a suggestion (handled by the combobox) but never saves the whole form:
        // people press Enter to "search", and an early Save attempt would show errors before they finished.
        const t = e.target as HTMLElement;
        if (e.key === "Enter" && !e.defaultPrevented && t.getAttribute("role") === "combobox") e.preventDefault();
      }}
    >
      <DrugCombobox
        label="Medicine name"
        hint="Brand, generic or combination product. Dose text like “0.5 mg” is fine — Kinwise ignores it when matching."
        value={draft.name}
        onChange={onNameChange}
        error={errors.name}
        autoFocus={!editing}
        status={
          <div aria-live="polite" className="cg-match-live">
            <MatchStatus
              name={draft.name}
              match={match}
              stored={stored}
              decision={decision}
              onDecide={setDecision}
            />
          </div>
        }
      />

      {duplicate && (
        <p className="cg-med-form__dup">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            {person}’s list already has <strong>{duplicate.name}</strong> (started {formatShort(duplicate.startDate)}), which contains{" "}
            {genericLabel(duplicate.ingredientIds.filter((i) => resolved.ingredientIds.includes(i)))}. Is this the same medicine?
          </span>
        </p>
      )}

      <ReviewPreview
        draft={previewDraft}
        editing={editing}
        assumedName={fuzzyPending ? match.suggestion : null}
        choosing={choosing}
        onTry={(example) => {
          // Same as picking the suggestion: fills the name only; nothing is saved.
          onNameChange(example);
          // The chip disappears with the empty state: put focus back on the name field (its list stays closed on an exact name).
          window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#cg-med-form [role='combobox']")?.focus());
        }}
      />

      <fieldset className="cg-med-form__group">
        <legend className="cg-med-form__legend">How it’s taken</legend>
        <div className="cg-med-form__grid">
          <TextInput label="Dose" optional placeholder="e.g. 0.5 mg, 2 caplets" maxLength={120} value={draft.dose} onChange={(e) => set("dose", e.target.value)} error={errors.dose} />
          <TextInput
            label="How often"
            optional
            placeholder="e.g. once daily, at bedtime"
            maxLength={120}
            value={draft.frequency}
            onChange={(e) => set("frequency", e.target.value)}
          />
        </div>
        <div className="cg-med-form__checks">
          <Check label="Taken only as needed" checked={draft.asNeeded} onChange={(v) => set("asNeeded", v)} />
          <Check
            label="Over the counter"
            hint={!otcTouched && kbOtc ? "Usually sold without a prescription" : undefined}
            checked={otc}
            onChange={(v) => {
              setOtcTouched(true);
              set("otc", v);
            }}
          />
        </div>
        {showDoseDate && (
          <TextInput
            className="cg-med-form__dose-date"
            label="When did the dose change?"
            hint="Dated dose changes appear on the timeline next to the diary."
            type="date"
            max={today}
            min={full.startDate}
            value={doseDate}
            onChange={(e) => setDoseDate(e.target.value)}
          />
        )}
      </fieldset>

      <fieldset className="cg-med-form__group">
        <legend className="cg-med-form__legend">Why and who</legend>
        <div className="cg-med-form__grid">
          <TextInput label="What it’s for" optional placeholder="e.g. Sleep, Blood pressure" maxLength={120} value={draft.reason} onChange={(e) => set("reason", e.target.value)} />
          <TextInput
            label="Prescriber"
            optional
            placeholder="e.g. Dr. Lee, Self (OTC)"
            maxLength={120}
            list={prescriberListId}
            value={draft.prescriber}
            onChange={(e) => set("prescriber", e.target.value)}
          />
          <datalist id={prescriberListId}>
            {prescribers.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <TextInput
            label="Started on"
            hint="The first day taken. The timeline compares the diary before and after this date."
            type="date"
            max={today}
            value={draft.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            error={errors.startDate}
            className={cx("cg-med-form__start")}
          />
        </div>
      </fieldset>

      {saveError && (
        <p className="ui-field__error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>{saveError}</span>
        </p>
      )}
    </form>
  );
}
