import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import type { Field, Role, Source } from "./types";
import { dateLabel, displayValue, factsFor, LABELS } from "./domain";
import { Badge, Button, Modal } from "./ui";
export function EvidenceDialog({
  id,
  from,
  to,
  source,
  role,
  onClose,
  commit,
  notify,
}: {
  id: string;
  from: string;
  to: string;
  source: Source;
  role: Role;
  onClose: () => void;
  commit: (s: Source) => boolean;
  notify: (m: string) => void;
}) {
  const [detail, setDetail] = useState(id);
  const [confirm, setConfirm] = useState(false);
  const [oldIndex, setOldIndex] = useState(-1);
  const fact = factsFor(source, from, to).find((f) => f.id === detail);
  const current = source.days.find((d) => `entry:${d.id}` === detail);
  const revisions = source.revisions.filter((d) => d.id === current?.id);
  const day = oldIndex >= 0 ? revisions[oldIndex] : current;
  const note = source.notes.find(
    (n) => `concern:${n.id}` === detail || `note:${n.id}` === detail,
  );
  return (
    <Modal
      title={
        day
          ? dateLabel(day.dateLocal, true)
          : fact
            ? "Behind this observation"
            : "Original note"
      }
      onClose={onClose}
    >
      {fact ? (
        <>
          <Badge>Calculated from confirmed patient answers</Badge>
          <h3 className="evidence-fact">{fact.text}</h3>
          <p className="small muted">
            {dateLabel(from, true)} – {dateLabel(to, true)}. Each date
            contributes at most one current answer. Missing answers are excluded
            from the denominator.
          </p>
          <div className="evidence-day-list">
            {fact.entryIds.length ? (
              fact.entryIds.map((entryId) => {
                const d = source.days.find((d) => `entry:${d.id}` === entryId);
                return (
                  <button key={entryId} onClick={() => setDetail(entryId)}>
                    <FileText size={14} />
                    {d && dateLabel(d.dateLocal, true)}
                    <span>View original</span>
                  </button>
                );
              })
            ) : (
              <p>No patient answers are available for this fact.</p>
            )}
          </div>
        </>
      ) : day ? (
        <>
          <div className="row between">
            <Badge tone={oldIndex >= 0 ? "sand" : "sage"}>
              {oldIndex >= 0 ? "Earlier version" : "Patient-confirmed record"}
            </Badge>
            <Badge tone="outline">Version {day.recordRevision}</Badge>
          </div>
          <p className="record-story">
            {day.rawStory
              ? `“${day.rawStory}”`
              : "No written note for this day."}
          </p>
          <div className="evidence-grid">
            {Object.entries(day.answers).map(([f, v]) => (
              <div key={f}>
                <small>{LABELS[f as Field]}</small>
                <strong>{displayValue(f as Field, v)}</strong>
                <span className="provenance-label">
                  {day.answerProvenance[f as Field].origin.replaceAll("_", " ")}
                </span>
                {day.answerProvenance[f as Field].sourceSpans.map((s, i) => (
                  <q className="provenance-quote" key={i}>
                    {s.quote}
                  </q>
                ))}
              </div>
            ))}
          </div>
          <p className="small muted">
            Confirmed {new Date(day.confirmedAt).toLocaleString()} ·{" "}
            {day.timezone}.{" "}
            {day.confirmationMethod === "seed_fixture"
              ? "Fictional seed entry."
              : "Patient reviewed and saved."}
          </p>
          {!!revisions.length && (
            <label className="form-label">
              Correction history
              <select
                value={oldIndex}
                onChange={(e) => setOldIndex(Number(e.target.value))}
              >
                <option value={-1}>Current version</option>
                {revisions.map((r, i) => (
                  <option value={i} key={i}>
                    Version {r.recordRevision} ·{" "}
                    {new Date(r.confirmedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {role === "patient" && (
            <>
              {confirm ? (
                <div className="notice">
                  <p>
                    Delete this day, its correction history, and related drafts?
                    Exported copies cannot be recalled.
                  </p>
                  <div className="row wrap">
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          commit({
                            ...source,
                            days: source.days.filter(
                              (d) => d.id !== current!.id,
                            ),
                            revisions: source.revisions.filter(
                              (d) => d.id !== current!.id,
                            ),
                          })
                        ) {
                          onClose();
                          notify(
                            "The day and its correction history were deleted.",
                          );
                        }
                      }}
                    >
                      Confirm deletion
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirm(false)}>
                      Keep record
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-button danger-text"
                  onClick={() => setConfirm(true)}
                >
                  <Trash2 size={14} /> Delete this day
                </button>
              )}
            </>
          )}
        </>
      ) : note ? (
        <>
          <Badge tone="outline">
            {note.role === "caregiver"
              ? "Caregiver observation"
              : "Patient concern"}{" "}
            · {dateLabel(note.dateLocal, true)}
          </Badge>
          <p className="record-story">“{note.text}”</p>
          <p className="small muted">
            This note is not counted as a patient answer or included in chart
            denominators.
          </p>
        </>
      ) : (
        <p>
          This source is no longer available. Generate a new draft from the
          current record.
        </p>
      )}
    </Modal>
  );
}
