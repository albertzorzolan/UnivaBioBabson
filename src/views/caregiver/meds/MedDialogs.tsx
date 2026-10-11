// Stop and Remove confirmations for the Medications screen.
import { useState, type FormEvent } from "react";
import { addDays, formatShort } from "../../../model/dates";
import type { ISODate, Medication } from "../../../model/types";
import { Button, Modal, TextArea, TextInput } from "../../../ui";
import { validateStop } from "./medRecords";

export interface StopDialogProps {
  med: Medication | null;
  today: ISODate;
  person: string;
  onClose: () => void;
  onConfirm: (input: { lastDay: ISODate; note: string }) => string | null;
}

/** Default "last day taken": yesterday (so the stop counts from today), never before the start date. */
function defaultLastDay(med: Medication, today: ISODate): ISODate {
  const y = addDays(today, -1);
  return y < med.startDate ? today : y;
}

export function StopDialog({ med, today, person, onClose, onConfirm }: StopDialogProps) {
  return (
    <Modal
      open={med !== null}
      onClose={onClose}
      size="sm"
      title={med ? `Record that ${med.name} was stopped` : "Record a stop"}
      description="This updates the record only. Any change to a medicine should be agreed with the prescriber."
    >
      {med && <StopForm key={med.id} med={med} today={today} person={person} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}

function StopForm({ med, today, person, onClose, onConfirm }: Omit<StopDialogProps, "med"> & { med: Medication }) {
  const [lastDay, setLastDay] = useState<ISODate>(() => defaultLastDay(med, today));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateStop(med, lastDay, today, person);
    if (problem) {
      setError(problem);
      return;
    }
    const saveError = onConfirm({ lastDay, note });
    if (saveError) setError(saveError);
  };

  return (
    <form className="cg-stop-form" noValidate onSubmit={submit}>
      <TextInput
        label="Last day taken"
        hint={`Started ${formatShort(med.startDate)}. The timeline compares the diary before and after this date.`}
        type="date"
        min={med.startDate}
        max={today}
        value={lastDay}
        onChange={(e) => {
          setLastDay(e.target.value);
          setError(null);
        }}
        error={error ?? undefined}
      />
      <TextArea
        label="Note"
        optional
        rows={3}
        maxLength={240}
        placeholder="e.g. Dr. Lee suggested tapering off at the October visit"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="cg-dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Record stop
        </Button>
      </div>
    </form>
  );
}

export interface RemoveDialogProps {
  med: Medication | null;
  onClose: () => void;
  onStopInstead: (med: Medication) => void;
  onConfirm: (med: Medication) => void;
}

export function RemoveDialog({ med, onClose, onStopInstead, onConfirm }: RemoveDialogProps) {
  return (
    <Modal
      open={med !== null}
      onClose={onClose}
      size="sm"
      role="alertdialog"
      title={med ? `Remove ${med.name} from the list?` : "Remove from the list?"}
      description="Use this only if it was added by mistake. Its history is removed too."
    >
      {med && (
        <div className="cg-remove">
          <p className="cg-remove__text">
            If it was taken and then stopped, choose <strong>Record a stop</strong> instead — that keeps the dates the timeline needs.
          </p>
          {/* Phones stack these full-width: Record a stop, Remove, Cancel (see meds.css). */}
          <div className="cg-dialog-actions cg-dialog-actions--remove">
            <Button variant="ghost" className="cg-dialog-actions__cancel" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="secondary" className="cg-dialog-actions__stop" onClick={() => onStopInstead(med)}>
              Record a stop
            </Button>
            <Button variant="danger-quiet" className="cg-dialog-actions__remove" onClick={() => onConfirm(med)}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
