// Caregiver › Medications (/c/meds): the active list with review flags, stopped medicines, the change history,
// and the Add/Edit drawer with name matching and the live review preview (SPEC-UI "Medications").
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarX2,
  CirclePlus,
  ClipboardCheck,
  History,
  Pencil,
  Pill,
  Plus,
  RefreshCw,
  Trash2,
  Activity,
} from "lucide-react";
import type { ISODate, Medication, MedEventKind } from "../../model/types";
import { daysBetween, formatShort } from "../../model/dates";
import { findingSummaryForMed } from "../../engine/meds";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { href, navigate, useRoute } from "../../app/router";
import { Badge, Button, ButtonLink, Card, CardHeader, Disclosure, EmptyState, IconButton, PageHeader, Segmented, cx, useToast, type Tone } from "../../ui";
import { MedEditor, type MedEditorResult } from "./meds/MedEditor";
import { RemoveDialog, StopDialog } from "./meds/MedDialogs";
import {
  EVENT_LABEL,
  countPrescribers,
  eventHistory,
  genericLabel,
  nameIsGeneric,
  removeMedication,
  restoreMedication,
  splitMeds,
  stopMedication,
} from "./meds/medRecords";
import "./meds.css";

const HISTORY_PREVIEW = 6;
const CHANGE_KINDS: readonly MedEventKind[] = ["started", "stopped", "dose_changed"];
const RECENT_START_DAYS = 30;

/** Badge tone per flag (words carry the meaning; tone only groups them). */
function flagTone(flag: string): Tone {
  if (flag.startsWith("ACB")) return "info";
  if (flag === "Not checked") return "neutral";
  if (flag === "Watch for") return "info";
  return "caution";
}

const FLAG_TITLE: Record<string, string> = {
  Beers: "Listed in the AGS Beers Criteria® 2023",
  "Beers caution": "Use with caution (AGS Beers Criteria® 2023)",
  Combination: "Part of a medicine combination listed in AGS Beers 2023",
  Kidney: "Has kidney-function criteria (AGS Beers 2023)",
  "Fall risk": "On published lists of medicines linked to falls",
  "Cascade?": "Part of a possible prescribing cascade",
  Duplicate: "Two medicines of the same kind",
  "Watch for": "Has things worth watching for",
  "Not checked": "Not in Kinwise’s reference list, so not reviewed",
};

function scheduleText(m: Medication): string {
  const parts = [m.dose.trim(), m.frequency.trim()].filter(Boolean);
  return parts.join(" · ");
}

function relativeDays(date: ISODate, today: ISODate): string {
  const n = daysBetween(date, today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 60) return `${n} days ago`;
  const months = Math.round(n / 30.4);
  if (months < 24) return `${months} months ago`;
  return `${Math.round(n / 365)} years ago`;
}

const EVENT_ICON: Record<MedEventKind, typeof Pill> = {
  started: CirclePlus,
  stopped: CalendarX2,
  dose_changed: RefreshCw,
  added_to_list: ClipboardCheck,
  corrected: Pencil,
};

export function Medications() {
  const { data, today, update } = useStore();
  const { review } = useDerived();
  const { params } = useRoute();
  const toast = useToast();
  const person = data.profile.preferredName || "They";
  const caregiver = data.profile.caregiverName || "the caregiver";

  // Toast actions run later; they must commit through the latest store binding, not the one captured at render.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [stopping, setStopping] = useState<Medication | null>(null);
  const [removing, setRemoving] = useState<Medication | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyMode, setHistoryMode] = useState<"changes" | "all">("changes");

  const { active, stopped } = useMemo(() => splitMeds(data.medications, today), [data.medications, today]);
  const allHistory = useMemo(() => eventHistory(data.medEvents, data.medications), [data.medEvents, data.medications]);
  // "Medicine changes" = what the timeline uses (starts, stops, dose changes); "All entries" adds list bookkeeping.
  const history = historyMode === "all" ? allHistory : allHistory.filter((h) => CHANGE_KINDS.includes(h.event.kind));
  const promptsFor = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of review.findings) for (const id of f.medIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [review.findings]);
  const otcCount = active.filter((m) => m.otc).length;
  const prescriberCount = countPrescribers(active);
  const flaggedCount = active.filter((m) => (promptsFor.get(m.id) ?? 0) > 0).length;

  const openAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (m: Medication) => {
    setEditing(m);
    setEditorOpen(true);
  };

  // Deep links: #/c/meds?add=1 opens the drawer; ?edit=<id> opens that medicine (used by the review page).
  const addParam = params.get("add");
  const editParam = params.get("edit");
  useEffect(() => {
    if (addParam === "1") {
      setEditing(null);
      setEditorOpen(true);
      navigate("/c/meds", {}, { replace: true });
    } else if (editParam) {
      const m = data.medications.find((x) => x.id === editParam);
      if (m) {
        setEditing(m);
        setEditorOpen(true);
      }
      navigate("/c/meds", {}, { replace: true });
    }
    // Run when the deep-link params change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addParam, editParam]);

  const onSaved = (r: MedEditorResult) => {
    setEditorOpen(false);
    if (r.mode === "added") {
      toast.show({
        tone: "success",
        title: `${r.med.name} added`,
        description:
          r.med.ingredientIds.length === 0
            ? "Saved. It isn’t in Kinwise’s reference list, so it wasn’t reviewed."
            : r.addedPrompts > 0
              ? `${r.addedPrompts} new review prompt${r.addedPrompts === 1 ? "" : "s"} to look at.`
              : r.joinedPrompts > 0
                ? `No new review prompts — it joins ${r.joinedPrompts} existing one${r.joinedPrompts === 1 ? "" : "s"}.`
                : "No new review prompts from the criteria Kinwise checks.",
        action: r.addedPrompts + r.joinedPrompts > 0 ? { label: "Open review", onClick: () => navigate("/c/review", { med: r.med.id }) } : undefined,
      });
    } else {
      toast.show({ tone: "success", title: `${r.med.name} updated` });
    }
  };

  const confirmStop = (input: { lastDay: ISODate; note: string }): string | null => {
    const med = stopping;
    if (!med) return null;
    const res = update("caregiver", (prev) => stopMedication(prev, med.id, input, { today, now: new Date().toISOString(), actorName: caregiver }));
    if (!res.ok) return res.error;
    setStopping(null);
    toast.show({
      tone: "success",
      title: `${med.name}: stop recorded`,
      description:
        input.lastDay < today
          ? `Last taken ${formatShort(input.lastDay)}. The timeline will compare the days after with the days before.`
          : `Last dose today — it moves to “Stopped” tomorrow.`,
      action: { label: "See timeline", onClick: () => navigate("/c/timeline", { med: med.id }) },
    });
    return null;
  };

  const confirmRemove = (med: Medication) => {
    // Snapshot what will be removed (for Undo) from the current record, then commit.
    const snapshot = removeMedication(data, med.id).removed;
    const res = update("caregiver", (prev) => removeMedication(prev, med.id).data);
    setRemoving(null);
    if (!res.ok) {
      toast.show({ tone: "attention", title: "Couldn’t remove it", description: res.error });
      return;
    }
    toast.show({
      title: `${med.name} removed from the list`,
      durationMs: 8000,
      action: snapshot
        ? {
            label: "Undo",
            onClick: () => {
              updateRef.current("caregiver", (prev) => restoreMedication(prev, snapshot));
            },
          }
        : undefined,
    });
  };

  return (
    <div className="cg-meds">
      <PageHeader
        eyebrow={`${data.profile.preferredName || "Patient"} · medicines`}
        title="Medications"
        subtitle={`Everything ${person} takes, including over-the-counter products. Kinwise checks this list against published criteria for older adults.`}
        actions={
          <Button variant="primary" iconLeft={<Plus size={18} aria-hidden="true" />} onClick={openAdd} data-tour="meds-add">
            Add medication
          </Button>
        }
      />

      {data.medications.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<Pill size={28} />}
            title="No medicines on the list yet"
            action={
              <Button variant="primary" iconLeft={<Plus size={18} aria-hidden="true" />} onClick={openAdd}>
                Add the first medicine
              </Button>
            }
          >
            <p>
              Add everything {person} takes — prescriptions, over-the-counter products and supplements. Kinwise then checks the list against
              published criteria geriatric clinicians use.
            </p>
          </EmptyState>
        </Card>
      ) : (
        <>
          <section className="cg-meds-summary" aria-label="List summary">
            <dl className="cg-meds-summary__facts">
              <div>
                <dt>Taking now</dt>
                <dd className="ui-num">{active.length}</dd>
              </div>
              <div>
                <dt>Over the counter</dt>
                <dd className="ui-num">{otcCount}</dd>
              </div>
              <div>
                <dt>Prescribers</dt>
                <dd className="ui-num">{prescriberCount}</dd>
              </div>
            </dl>
            <div className="cg-meds-summary__review">
              <p className="cg-meds-summary__review-text">
                <strong className="ui-num">{review.findings.length}</strong> review prompt{review.findings.length === 1 ? "" : "s"} involve{" "}
                <strong className="ui-num">{flaggedCount}</strong> of {active.length} medicines
              </p>
              <ButtonLink href={href("/c/review")} variant="secondary" size="sm" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
                Open medication review
              </ButtonLink>
            </div>
          </section>

          <Card as="section" padding="none" className="cg-meds-card" aria-labelledby="cg-meds-active">
            <CardHeader
              id="cg-meds-active"
              title="Taking now"
              subtitle="Flags come from the medication review — each one is a question for the doctor or pharmacist, not an instruction."
              className="cg-meds-card__header"
            />
            {active.length === 0 ? (
              <p className="cg-meds-card__empty">No medicines are active right now. Stopped medicines are listed below.</p>
            ) : (
              <table className="cg-med-table">
                <thead>
                  <tr>
                    <th scope="col">Medicine</th>
                    <th scope="col">Dose &amp; schedule</th>
                    <th scope="col">For</th>
                    <th scope="col">Prescriber</th>
                    <th scope="col">Started</th>
                    <th scope="col">Review flags</th>
                    <th scope="col">
                      <span className="ui-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((m) => (
                    <MedRow
                      key={m.id}
                      med={m}
                      today={today}
                      flags={findingSummaryForMed(review, m.id)}
                      prompts={promptsFor.get(m.id) ?? 0}
                      onEdit={() => openEdit(m)}
                      onStop={() => setStopping(m)}
                      onRemove={() => setRemoving(m)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {stopped.length > 0 && (
            <Disclosure variant="card" className="cg-meds-stopped" summary={`Stopped medicines (${stopped.length})`}>
              <ul className="cg-stopped-list" role="list">
                {stopped.map((m) => (
                  <li key={m.id} className="cg-stopped">
                    <div className="cg-stopped__main">
                      <p className="cg-stopped__name">{m.name}</p>
                      <p className="cg-stopped__meta">
                        Taken {formatShort(m.startDate)} – {formatShort(m.endDate ?? m.startDate)}
                        {scheduleText(m) && ` · ${scheduleText(m)}`}
                        {m.reason && ` · for ${m.reason.toLowerCase()}`}
                      </p>
                    </div>
                    <div className="cg-stopped__actions">
                      <ButtonLink href={href("/c/timeline", { med: m.id })} variant="ghost" size="sm" iconLeft={<Activity size={16} aria-hidden="true" />}>
                        Timeline
                      </ButtonLink>
                      <IconButton label={`Edit ${m.name}`} title="Edit" icon={<Pencil size={18} aria-hidden="true" />} onClick={() => openEdit(m)} />
                    </div>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          <Card as="section" aria-labelledby="cg-meds-history" className="cg-history">
            <CardHeader
              id="cg-meds-history"
              icon={<History size={20} />}
              title="Medication history"
              subtitle={historyMode === "all" ? "Every entry in the record — newest first." : "Starts, stops and dose changes — newest first."}
              actions={
                <Segmented
                  label="Show"
                  hideLabel
                  value={historyMode}
                  onChange={(v) => {
                    setHistoryMode(v);
                    setShowAllHistory(false);
                  }}
                  options={[
                    { value: "changes", label: "Medicine changes" },
                    { value: "all", label: "All entries" },
                  ]}
                  className="cg-history__mode"
                />
              }
            />
            {history.length === 0 ? (
              <p className="ui-muted cg-history__empty">No changes recorded yet.</p>
            ) : (
              <>
                <ol className="cg-history__list" role="list">
                  {(showAllHistory ? history : history.slice(0, HISTORY_PREVIEW)).map(({ event, med }) => {
                    const Icon = EVENT_ICON[event.kind] ?? Pill;
                    const onTimeline = event.kind === "started" || event.kind === "stopped" || event.kind === "dose_changed";
                    return (
                      <li key={event.id} className={cx("cg-history__item", `cg-history__item--${event.kind}`)}>
                        <time className="cg-history__date ui-num" dateTime={event.date}>
                          {formatShort(event.date)}
                        </time>
                        <span className="cg-history__icon" aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <div className="cg-history__text">
                          <p>
                            <strong>{med.name}</strong> · {EVENT_LABEL[event.kind] ?? event.kind}
                          </p>
                          {event.detail && <p className="cg-history__detail">{event.detail}</p>}
                        </div>
                        {onTimeline && (
                          <a className="cg-history__link" href={href("/c/timeline", { med: med.id })}>
                            Timeline<span className="ui-visually-hidden"> for {med.name}</span>
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {history.length > HISTORY_PREVIEW && (
                  <Button variant="ghost" size="sm" className="cg-history__more" onClick={() => setShowAllHistory((v) => !v)} aria-expanded={showAllHistory}>
                    {showAllHistory ? "Show fewer" : `Show all ${history.length} changes`}
                  </Button>
                )}
              </>
            )}
          </Card>
        </>
      )}

      <MedEditor open={editorOpen} editing={editing} onClose={() => setEditorOpen(false)} onSaved={onSaved} />
      <StopDialog med={stopping} today={today} person={person} onClose={() => setStopping(null)} onConfirm={confirmStop} />
      <RemoveDialog
        med={removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        onStopInstead={(m) => {
          setRemoving(null);
          setStopping(m);
        }}
      />
    </div>
  );
}

interface MedRowProps {
  med: Medication;
  today: ISODate;
  flags: string[];
  prompts: number;
  onEdit: () => void;
  onStop: () => void;
  onRemove: () => void;
}

function MedRow({ med, today, flags, prompts, onEdit, onStop, onRemove }: MedRowProps) {
  const generic = genericLabel(med.ingredientIds);
  const recent = daysBetween(med.startDate, today) <= RECENT_START_DAYS;
  const endsToday = med.endDate !== null && med.endDate === today;
  const schedule = scheduleText(med);
  return (
    <tr className={cx("cg-med-row", recent && "cg-med-row--recent")}>
      <td className="cg-med-row__name" data-label="Medicine">
        <p className="cg-med-row__title">{med.name}</p>
        <p className="cg-med-row__generic">
          {generic ? (
            !nameIsGeneric(med.name, med.ingredientIds) && <span>{generic}</span>
          ) : (
            <span className="cg-med-row__unmatched">Not in reference list</span>
          )}
        </p>
        {(med.otc || med.asNeeded || endsToday) && (
          <p className="cg-med-row__tags">
            {med.otc && <Badge size="sm">OTC</Badge>}
            {med.asNeeded && <Badge size="sm">As needed</Badge>}
            {endsToday && (
              <Badge size="sm" tone="info">
                Last dose today
              </Badge>
            )}
          </p>
        )}
      </td>
      <td data-label="Dose & schedule">
        {schedule || <span className="ui-muted">Not recorded</span>}
        {med.asNeeded && schedule && !/as needed|prn/i.test(schedule) && <span className="cg-med-row__sub">as needed</span>}
      </td>
      <td data-label="For">{med.reason || <span className="ui-muted">—</span>}</td>
      <td data-label="Prescriber">{med.prescriber || <span className="ui-muted">—</span>}</td>
      <td data-label="Started" className="cg-med-row__started">
        <time dateTime={med.startDate} className="ui-num">
          {formatShort(med.startDate)}
        </time>
        <span className={cx("cg-med-row__sub", recent && "cg-med-row__sub--recent")}>{relativeDays(med.startDate, today)}</span>
      </td>
      <td data-label="Review flags" className="cg-med-row__flags">
        {flags.length > 0 ? (
          <>
            <span className="cg-med-row__badges">
              {flags.map((f) => (
                <Badge key={f} size="sm" tone={flagTone(f)} title={FLAG_TITLE[f] ?? (f.startsWith("ACB") ? "Anticholinergic burden score for this medicine" : undefined)}>
                  {f}
                </Badge>
              ))}
            </span>
            {prompts > 0 && (
              <a className="cg-med-row__prompts" href={href("/c/review", { med: med.id })}>
                {prompts} prompt{prompts === 1 ? "" : "s"}
                <span className="ui-visually-hidden"> for {med.name}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </a>
            )}
          </>
        ) : (
          <span className="cg-med-row__none">No prompts</span>
        )}
      </td>
      <td className="cg-med-row__actions">
        <IconButton label={`Edit ${med.name}`} title="Edit" icon={<Pencil size={18} aria-hidden="true" />} onClick={onEdit} />
        <IconButton label={`Record that ${med.name} was stopped`} title="Record a stop" icon={<CalendarX2 size={18} aria-hidden="true" />} onClick={onStop} />
        <IconButton label={`Remove ${med.name} from the list`} title="Remove" icon={<Trash2 size={18} aria-hidden="true" />} onClick={onRemove} />
      </td>
    </tr>
  );
}
