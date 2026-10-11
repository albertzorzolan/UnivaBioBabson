// Live "what would this change?" panel in the Add/Edit medication drawer. Runs the deterministic review
// engine on the list with and without the draft medicine (previewAddition) on every keystroke.
import { useDeferredValue, useMemo } from "react";
import { ArrowRight, CircleCheck, Sparkle } from "lucide-react";
import type { Medication } from "../../../model/types";
import { previewAddition, draftMedication, CATEGORY_LABEL, type AdditionPreview } from "../../../engine/meds";
import { useStore } from "../../../app/StoreProvider";
import { useDerived } from "../../../app/useDerived";
import { Badge, cx } from "../../../ui";
import type { MedDraft } from "./medRecords";
import { acbThresholds, diffPrompts, type PromptChange } from "./reviewRecords";

const MAX_LISTED = 4;
/** The example offered in the empty Add drawer: a common OTC sleep aid that shows the preview at work. */
export const TRY_EXAMPLE = "Advil PM";

export interface ReviewPreviewProps {
  draft: MedDraft;
  /** The medicine being edited (null when adding). */
  editing: Medication | null;
  /** Set while a fuzzy suggestion awaits confirmation: the preview shows "If this is <name>…". */
  assumedName?: string | null;
  /** The typed text is still a prefix of autocomplete suggestions: show a hint instead of "can't check". */
  choosing?: boolean;
  /** Fills the name field with an example (empty Add drawer only). Must not save anything. */
  onTry?: (name: string) => void;
}

/** The ACB scale publishes one review threshold, not named severity bands: say where the new total sits. */
function thresholdNote(): string {
  return `review threshold: ${acbThresholds().elevated}`;
}

/** Integer cells 0…max: filled up to `before`, then the change highlighted up to `after`. */
function AcbCells({ before, after }: { before: number; after: number }) {
  const max = Math.max(9, before, after);
  const lo = Math.min(before, after);
  const hi = Math.max(before, after);
  return (
    <span className="cg-pv-cells" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const state = n <= lo ? "base" : n <= hi ? (after > before ? "up" : "down") : "empty";
        return <span key={n} className={cx("cg-pv-cells__cell", `is-${state}`)} />;
      })}
    </span>
  );
}

function acbSentence(p: AdditionPreview, verb: string): string {
  if (p.acbAfter > p.acbBefore)
    return `${verb} would raise the anticholinergic burden score (ACB) from ${p.acbBefore} to ${p.acbAfter}.`;
  if (p.acbAfter < p.acbBefore)
    return `${verb} would lower the anticholinergic burden score (ACB) from ${p.acbBefore} to ${p.acbAfter}.`;
  return `The anticholinergic burden score (ACB) would stay at ${p.acbAfter}.`;
}

export function ReviewPreview({ draft, editing, assumedName, choosing, onTry }: ReviewPreviewProps) {
  const { data, today } = useStore();
  const { timeline, review: current } = useDerived();
  const deferred = useDeferredValue(draft);
  const name = deferred.name.trim();

  const preview = useMemo<AdditionPreview | null>(() => {
    if (!name) return null;
    try {
      return previewAddition(
        { meds: data.medications, profile: data.profile, checkIns: data.checkIns, today, signals: timeline.signals },
        {
          ...deferred,
          name,
          id: editing?.id,
          endDate: editing?.endDate ?? null,
          createdAt: editing?.createdAt,
          updatedAt: editing?.updatedAt,
        },
      );
    } catch {
      return null;
    }
  }, [name, deferred, editing, data.medications, data.profile, data.checkIns, today, timeline.signals]);

  const verb = editing ? "This change" : "Adding this";
  const whose = data.profile.preferredName ? `${data.profile.preferredName}’s` : "the";

  if (!name || (choosing && preview && !preview.matched)) {
    return (
      <section className="cg-pv cg-pv--idle" aria-label="Live review preview">
        <p className="cg-pv__eyebrow">
          <Sparkle size={14} aria-hidden="true" /> Live review preview
        </p>
        <p className="cg-pv__idle">
          {name
            ? "Pick one of the suggestions (or finish typing) to see what it would change."
            : `Start typing a medicine name to see what it would change in ${whose} medication review.`}
        </p>
        {!name && !editing && onTry && (
          <p className="cg-pv__try">
            <button type="button" className="ui-chip cg-pv__try-chip" onClick={() => onTry(TRY_EXAMPLE)}>
              <Sparkle size={14} aria-hidden="true" />
              <span>Try it: {TRY_EXAMPLE}</span>
            </button>
            <span className="cg-pv__try-note">Only fills in the name. Nothing is saved until you choose Save.</span>
          </p>
        )}
      </section>
    );
  }
  if (!preview) return null;

  if (!preview.matched) {
    return (
      <section className="cg-pv cg-pv--unmatched" aria-label="Live review preview" aria-live="polite">
        <p className="cg-pv__eyebrow">
          <Sparkle size={14} aria-hidden="true" /> Live review preview
        </p>
        <p className="cg-pv__headline">Kinwise can’t check this one.</p>
        <p className="cg-pv__text">
          It isn’t in Kinwise’s reference list, so it will be saved but not reviewed. The pharmacist can check how it fits with the other
          medicines.
        </p>
      </section>
    );
  }

  // Diff by rule, not by finding key: a combined finding (ACB total, fall-risk list, …) gets a new key when its
  // medicines change, but it is the same prompt changing — listed once, never as both "new" and "no longer applies".
  const { fresh, changed: extended, removed } = diffPrompts(current.findings, preview.after.findings);
  const added = [...fresh.map((f) => ({ f, change: null as PromptChange | null })), ...extended.map((c) => ({ f: c.after, change: c }))];
  const draftId = editing?.id ?? draftMedication({ name }, today).id;
  const medName = assumedName || name;
  const changeTag = (c: PromptChange): string => {
    const had = c.before.medIds.includes(draftId);
    const has = c.after.medIds.includes(draftId);
    const what = !had && has ? `would include ${medName}` : had && !has ? `would no longer include ${medName}` : "would change";
    const score =
      c.after.ruleId === "acb-total" && preview.acbAfter !== preview.acbBefore ? ` · score ${preview.acbBefore} → ${preview.acbAfter}` : "";
    return `Existing prompt · ${what}${score}`;
  };
  const acbChanged = preview.acbAfter !== preview.acbBefore;
  const quiet = added.length === 0 && removed.length === 0 && !acbChanged;
  const headline = quiet
    ? editing
      ? "This change doesn’t alter the review."
      : "No new review prompts from the criteria Kinwise checks."
    : fresh.length > 0
      ? `${verb} would add ${fresh.length} new review prompt${fresh.length === 1 ? "" : "s"}`
      : extended.length > 0
        ? `No new prompts — it would ${editing ? "change" : "join"} ${extended.length} existing one${extended.length === 1 ? "" : "s"}`
        : removed.length > 0
          ? `${verb} would clear ${removed.length} review prompt${removed.length === 1 ? "" : "s"}`
          : acbSentence(preview, verb);

  return (
    <section className={cx("cg-pv", !quiet && "cg-pv--active")} aria-label="Live review preview" aria-live="polite" aria-atomic="true">
      <p className="cg-pv__eyebrow">
        <Sparkle size={14} aria-hidden="true" /> Live review preview
        {assumedName && <span className="cg-pv__assumed">If this is {assumedName}</span>}
      </p>
      <p className="cg-pv__headline">{headline}</p>
      {fresh.length > 0 && extended.length > 0 && (
        <p className="cg-pv__text">
          It would also {editing ? "change" : "join"} {extended.length} existing prompt{extended.length === 1 ? "" : "s"}.
        </p>
      )}

      {acbChanged && (
        <div className="cg-pv__acb">
          <p className="cg-pv__text">{acbSentence(preview, verb)}</p>
          <div className="cg-pv__acb-visual">
            <AcbCells before={preview.acbBefore} after={preview.acbAfter} />
            <span className="cg-pv__acb-figures ui-num" aria-hidden="true">
              <span>{preview.acbBefore}</span>
              <ArrowRight size={16} />
              <strong>{preview.acbAfter}</strong>
              <small>{thresholdNote()}</small>
            </span>
          </div>
        </div>
      )}

      {added.length > 0 && (
        <ul className="cg-pv__list" role="list">
          {added.slice(0, MAX_LISTED).map(({ f, change }) => (
            <li key={f.key} className={cx("cg-pv__item", change && "cg-pv__item--grown")}>
              <span className="cg-pv__item-cat">
                {CATEGORY_LABEL[f.category] ?? "Review prompt"}
                {change && <span className="cg-pv__item-tag">{changeTag(change)}</span>}
              </span>
              <span className="cg-pv__item-title">{f.title}</span>
            </li>
          ))}
          {added.length > MAX_LISTED && <li className="cg-pv__more">and {added.length - MAX_LISTED} more</li>}
        </ul>
      )}

      {removed.length > 0 && (
        <div className="cg-pv__removed">
          <p className="cg-pv__sub">Would no longer apply</p>
          <ul className="cg-pv__list" role="list">
            {removed.slice(0, MAX_LISTED).map((f) => (
              <li key={f.key} className="cg-pv__item cg-pv__item--removed">
                <span className="cg-pv__item-cat">{CATEGORY_LABEL[f.category] ?? "Review prompt"}</span>
                <span className="cg-pv__item-title">{f.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {quiet ? (
        <p className="cg-pv__text cg-pv__note">
          <CircleCheck size={16} aria-hidden="true" />
          <span>That isn’t a guarantee — the pharmacist can also check doses, allergies and other interactions.</span>
        </p>
      ) : (
        <p className="cg-pv__foot">
          <Badge size="sm" tone="neutral">
            Questions for the prescriber, not instructions
          </Badge>
        </p>
      )}
    </section>
  );
}
