import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Edit3,
  Pill,
  Plus,
  Trash2,
} from "lucide-react";
import type { MedEvent, Medication, Role, Source } from "./types";
import {
  compareWindows,
  dateLabel,
  localDate,
  rangeDays,
  shiftDate,
} from "./domain";
import { Badge, Button, Modal } from "./ui";
const blank = (): Medication => ({
  id: crypto.randomUUID(),
  name: "",
  dose: "",
  schedule: "",
  reason: "",
  prescriber: "",
  startDate: localDate(),
  endDate: null,
});
export function Medicines({
  source,
  role,
  commit,
  notify,
}: {
  source: Source;
  role: Role;
  commit: (s: Source) => boolean;
  notify: (s: string) => void;
}) {
  const [editing, setEditing] = useState<Medication | null>(null);
  const [kind, setKind] = useState<MedEvent["kind"]>("added_to_list");
  const [deleting, setDeleting] = useState<Medication | null>(null);
  const [showStopped, setShowStopped] = useState(false);
  const [marker, setMarker] = useState("");
  const [error, setError] = useState("");
  const meds = source.medications.filter((m) =>
    showStopped ? true : !m.endDate,
  );
  const selected = source.medicationEvents.find((e) => e.id === marker);
  const before = selected
    ? rangeDays(
        source,
        shiftDate(selected.dateLocal, -14),
        shiftDate(selected.dateLocal, -1),
      )
    : [];
  const after = selected
    ? rangeDays(
        source,
        shiftDate(selected.dateLocal, 1),
        shiftDate(selected.dateLocal, 14),
      )
    : [];
  const comparison = compareWindows(before, after);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A RECORD TO BRING ALONG</span>
          <h1>{role === "patient" ? "My medicines" : "Medication list"}</h1>
          <p>
            Keep the names and recorded instructions together for your next
            visit.
          </p>
        </div>
        {role === "caregiver" && (
          <Button
            onClick={() => {
              setEditing(blank());
              setKind("added_to_list");
              setError("");
            }}
          >
            <Plus size={17} /> Add to the list
          </Button>
        )}
      </div>
      <div className="notice subtle">
        <Pill size={19} />
        <span>
          This is a fictional medication record, not prescribing advice. Listing
          a medicine does not confirm a dose was taken.
          {role === "patient" && " Your caregiver can update this list."}
        </span>
      </div>
      <div className="section-title">
        <h2>
          {showStopped
            ? "All recorded medicines"
            : "Current recorded medicines"}{" "}
          <span className="muted">({meds.length})</span>
        </h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showStopped}
            onChange={(e) => setShowStopped(e.target.checked)}
          />{" "}
          Include stopped entries
        </label>
      </div>
      {!meds.length ? (
        <div className="empty-state">
          <Pill size={28} />
          <h3>No medicines in this view</h3>
          <p>Entries added by the caregiver will appear here.</p>
        </div>
      ) : (
        <div className="medicine-grid">
          {meds.map((m) => (
            <section className="panel medication" key={m.id}>
              <div className="row between">
                <span className="round-icon">
                  <Pill size={22} />
                </span>
                <Badge tone={m.endDate ? "outline" : "sage"}>
                  {m.endDate ? "Recorded as stopped" : "On the list"}
                </Badge>
              </div>
              <h2>{m.name}</h2>
              <h3>{m.dose}</h3>
              <p>{m.schedule}</p>
              <div className="divider" />
              <dl className="med-details">
                <div>
                  <dt>Recorded start</dt>
                  <dd>{dateLabel(m.startDate, true)}</dd>
                </div>
                {m.endDate && (
                  <div>
                    <dt>Recorded stop</dt>
                    <dd>{dateLabel(m.endDate, true)}</dd>
                  </div>
                )}
                <div>
                  <dt>Prescriber</dt>
                  <dd>{m.prescriber || "Not recorded"}</dd>
                </div>
                {m.reason && (
                  <div>
                    <dt>List note</dt>
                    <dd>{m.reason}</dd>
                  </div>
                )}
              </dl>
              {role === "caregiver" && (
                <div className="med-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      setEditing({ ...m });
                      setKind("record_corrected");
                      setError("");
                    }}
                  >
                    <Edit3 size={14} /> Edit record
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${m.name} record`}
                    onClick={() => setDeleting(m)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      <section className="panel med-timeline">
        <div className="section-title">
          <div>
            <span className="eyebrow">DATES ADD CONTEXT</span>
            <h2>Recorded list changes</h2>
          </div>
          <CalendarDays size={21} />
        </div>
        <p className="small muted">
          These markers show recorded events. Timing alone does not establish a
          medication effect.
        </p>
        {source.medicationEvents.length === 0 ? (
          <p className="empty-inline">No change events recorded.</p>
        ) : (
          <div className="event-list">
            {[...source.medicationEvents].reverse().map((e) => (
              <div key={e.id}>
                <span className="event-point" />
                <span className="event-date">{dateLabel(e.dateLocal)}</span>
                <strong>{e.label}</strong>
                <Badge tone="outline">{e.kind.replaceAll("_", " ")}</Badge>
              </div>
            ))}
          </div>
        )}
        <label className="form-label">
          Explore records around a recorded start
          <select value={marker} onChange={(e) => setMarker(e.target.value)}>
            <option value="">Choose a start marker</option>
            {source.medicationEvents
              .filter((e) => e.kind === "started")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} · {dateLabel(e.dateLocal)}
                </option>
              ))}
          </select>
        </label>
        {selected && (
          <div className="comparison">
            <div>
              <small>14 days before · excluding start day</small>
              <strong>
                {comparison.before.positive} / {comparison.before.answered}
              </strong>
              <span>answered days with dizziness</span>
            </div>
            <ArrowRight size={20} />
            <div>
              <small>14 days after · excluding start day</small>
              <strong>
                {comparison.after.positive} / {comparison.after.answered}
              </strong>
              <span>answered days with dizziness</span>
            </div>
            <p>
              {comparison.sufficient
                ? "Descriptive counts only. Other changes and missing answers may affect the comparison. No cause is inferred."
                : "Not enough answered days for a comparison. At least 7 answered days in each window are required by this prototype."}
            </p>
          </div>
        )}
      </section>
      {editing && (
        <Modal
          title={
            source.medications.some((m) => m.id === editing.id)
              ? "Edit the recorded list"
              : "Add a fictional medicine"
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (editing.endDate && editing.endDate < editing.startDate) {
                setError(
                  "The recorded stop date must be on or after the start date.",
                );
                return;
              }
              const exists = source.medications.some(
                (m) => m.id === editing.id,
              );
              const evt: MedEvent = {
                id: crypto.randomUUID(),
                medicationId: editing.id,
                dateLocal:
                  kind === "started"
                    ? editing.startDate
                    : kind === "stopped"
                      ? (editing.endDate ?? localDate())
                      : localDate(),
                kind,
                label: `${editing.name} · ${kind === "started" ? "recorded start date" : kind === "stopped" ? "recorded stop date" : kind === "record_corrected" ? "list correction" : "added to the recorded list"}`,
              };
              if (
                commit({
                  ...source,
                  medications: exists
                    ? source.medications.map((m) =>
                        m.id === editing.id ? editing : m,
                      )
                    : [...source.medications, editing],
                  medicationEvents: [...source.medicationEvents, evt],
                })
              ) {
                setEditing(null);
                notify(
                  "Medication record saved. No treatment recommendation was made.",
                );
              }
            }}
          >
            <p className="small muted">
              Transcribe an existing fictional regimen. This form does not tell
              anyone to start, stop, or change a medicine.
            </p>
            <div className="form-grid">
              {[
                ["name", "Medicine name", "e.g. Lisinopril"],
                ["dose", "Recorded dose", "e.g. 10 mg"],
                ["schedule", "Recorded schedule", "e.g. Once daily · morning"],
                ["prescriber", "Prescriber (optional)", "e.g. Dr. Jordan Lee"],
              ].map(([key, label, placeholder]) => (
                <label className="form-label" key={key}>
                  {label}
                  <input
                    value={String(editing[key as keyof Medication] ?? "")}
                    required={key !== "prescriber"}
                    maxLength={120}
                    placeholder={placeholder}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="form-label">
              List note (optional)
              <input
                value={editing.reason}
                maxLength={160}
                onChange={(e) =>
                  setEditing({ ...editing, reason: e.target.value })
                }
              />
            </label>
            <label className="form-label">
              Recorded start date
              <input
                type="date"
                value={editing.startDate}
                max={localDate()}
                required
                onChange={(e) =>
                  setEditing({ ...editing, startDate: e.target.value })
                }
              />
            </label>
            <label className="form-label">
              What does this edit represent?
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MedEvent["kind"])}
              >
                <option value="record_corrected">
                  Correcting the list, no regimen change
                </option>
                <option value="added_to_list">
                  Adding an already existing medicine to the list
                </option>
                <option value="started">
                  Recording a start that already happened
                </option>
                <option value="stopped">
                  Recording a stop that already happened
                </option>
              </select>
            </label>
            {(kind === "stopped" || editing.endDate) && (
              <label className="form-label">
                Recorded stop date
                <input
                  type="date"
                  required
                  value={editing.endDate ?? ""}
                  min={editing.startDate}
                  max={localDate()}
                  onChange={(e) =>
                    setEditing({ ...editing, endDate: e.target.value || null })
                  }
                />
              </label>
            )}
            {error && <p className="error">{error}</p>}
            <Button type="submit">
              Save medication record <Check size={17} />
            </Button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={`Delete ${deleting.name} from the record?`}
          onClose={() => setDeleting(null)}
        >
          <p>
            This removes the stored list entry and its date markers. Deleting a
            record is not an instruction to stop taking a medicine.
          </p>
          <p className="small muted">
            Related drafts will be cleared. Exported copies cannot be recalled.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              if (
                commit({
                  ...source,
                  medications: source.medications.filter(
                    (m) => m.id !== deleting.id,
                  ),
                  medicationEvents: source.medicationEvents.filter(
                    (e) => e.medicationId !== deleting.id,
                  ),
                })
              ) {
                setDeleting(null);
                setMarker("");
                notify("The stored medication record was deleted.");
              }
            }}
          >
            Delete this record
          </Button>
        </Modal>
      )}
    </>
  );
}
