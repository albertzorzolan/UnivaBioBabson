import { useState } from "react";
import {
  BookOpen,
  Download,
  ExternalLink,
  HardDrive,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Source } from "./types";
import {
  cancelGeneration,
  MODEL,
  removeModelCache,
  unloadModel,
  useAI,
} from "./ai";
import { AIStatus } from "./AIPanel";
import sources from "./contracts/source-register.json";
import { KEYS, localDate, seedSource } from "./domain";
import { Badge, Button, Modal } from "./ui";
export function downloadJSON(value: unknown, name: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Settings({
  source,
  replace,
  notify,
}: {
  source: Source;
  replace: (s: Source) => boolean;
  notify: (s: string) => void;
}) {
  const [action, setAction] = useState<"clear" | "reset" | null>(null);
  const [error, setError] = useState("");
  const ai = useAI();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE MORE TRANSPARENCY</span>
          <h1>Privacy & local AI</h1>
          <p>
            Know what is stored, what AI does, and what this prototype can’t do.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <span className="round-icon">
            <HardDrive size={21} />
          </span>
          <h2>Your records live here</h2>
          <p>
            Fictional check-ins, medication entries and notes are saved in this
            browser on this device. There is no cloud sync or analytics.
          </p>
          <dl className="settings-details">
            <div>
              <dt>Dataset</dt>
              <dd>One fictional profile</dd>
            </div>
            <div>
              <dt>Source revision</dt>
              <dd>{source.sourceRevision}</dd>
            </div>
            <div>
              <dt>Confirmed entries</dt>
              <dd>{source.days.length}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>Browser localStorage</dd>
            </div>
          </dl>
          <div className="notice">
            Demo passwords are not a security boundary. People using this
            browser profile can access these records. Please use fictional
            information only.
          </div>
          <Button
            variant="ghost"
            onClick={() =>
              downloadJSON(
                source,
                `medwatch-fictional-records-${localDate()}.json`,
              )
            }
          >
            <Download size={16} /> Export fictional records
          </Button>
        </section>
        <section className="panel">
          <span className="round-icon">
            <Sparkles size={21} />
          </span>
          <h2>AI, on this device</h2>
          <p>
            The language model runs in a browser worker using WebGPU. The model
            files are served from this Mac. No prompt or record is sent to a
            remote AI service.
          </p>
          <AIStatus />
          <dl className="settings-details">
            <div>
              <dt>Model</dt>
              <dd>{MODEL}</dd>
            </div>
            <div>
              <dt>Model assets</dt>
              <dd>About 844 MiB · separate browser cache</dd>
            </div>
            <div>
              <dt>Generation limit</dt>
              <dd>40 seconds per draft</dd>
            </div>
            <div>
              <dt>Last generation</dt>
              <dd>
                {ai.lastMs
                  ? `${(ai.lastMs / 1000).toFixed(1)} seconds`
                  : "Not generated this session"}
              </dd>
            </div>
          </dl>
          <div className="row wrap">
            <Button
              variant="ghost"
              disabled={ai.status === "loading"}
              onClick={() => {
                void unloadModel().catch((e) => setError(e.message));
              }}
            >
              Unload model
            </Button>
            <Button
              variant="ghost"
              disabled={ai.status === "loading"}
              onClick={() => {
                void removeModelCache()
                  .then(() =>
                    notify(
                      "Browser model cache cleared. Local files remain on this Mac.",
                    ),
                  )
                  .catch((e) => setError(e.message));
              }}
            >
              Clear model cache
            </Button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
        <section className="panel">
          <span className="round-icon">
            <ShieldCheck size={21} />
          </span>
          <h2>Documentation, with boundaries</h2>
          <p>
            AI can suggest form answers, select fixed follow-up prompts,
            describe confirmed records, and draft visit notes. You review its
            wording and confirm every source write.
          </p>
          <ul className="plain-list">
            <li>Unknown answers remain unknown.</li>
            <li>Medication changes are recorded, never recommended.</li>
            <li>
              There is no diagnosis, personalized risk score, or clinical
              urgency assessment.
            </li>
            <li>No one is monitoring records or notifying a clinician.</li>
          </ul>
          <p className="small muted">
            This student prototype has not been clinically validated. It makes
            no claim of FDA approval, HIPAA compliance, or a legal determination
            about regulatory classification.
          </p>
        </section>
        <section className="panel">
          <span className="round-icon">
            <BookOpen size={21} />
          </span>
          <h2>References & source review</h2>
          <p>
            General source explanations are gated until qualified content review
            is complete. An official source alone is not a review of its use in
            this app.
          </p>
          <Badge tone="sand">AI education · awaiting content review</Badge>
          <div className="source-links">
            {sources.sources
              .filter((s) =>
                [
                  "source:fda-medication-list",
                  "source:911-help",
                  "source:fda-cds-faq",
                ].includes(s.id),
              )
              .map((s) => (
                <a href={s.url} key={s.id} target="_blank" rel="noreferrer">
                  <span>
                    <strong>{s.title}</strong>
                    <small>{s.publisher} · external website</small>
                  </span>
                  <ExternalLink size={15} />
                </a>
              ))}
          </div>
          <p className="small muted">
            Links open only when you select them. No record data is added to the
            link.
          </p>
        </section>
        <section className="panel wide">
          <div className="row between">
            <div>
              <h2>Demo controls</h2>
              <p>
                Reset the fictional story for a demo, or start with empty
                records.
              </p>
            </div>
            <Badge tone="outline">Wearable sync · coming soon</Badge>
          </div>
          <div className="row wrap">
            <Button variant="ghost" onClick={() => setAction("reset")}>
              <RefreshCw size={16} /> Reset fictional demo
            </Button>
            <Button variant="danger" onClick={() => setAction("clear")}>
              <Trash2 size={16} /> Clear all records
            </Button>
          </div>
        </section>
      </div>
      {action && (
        <Modal
          title={
            action === "reset"
              ? "Reset the fictional demo?"
              : "Clear all records in this browser?"
          }
          onClose={() => setAction(null)}
        >
          <p>
            {action === "reset"
              ? "This replaces your changes with a fresh 28-day fictional history."
              : "This removes check-ins, correction history, notes, medication entries and generated drafts. The record stays empty until you add information or reset the demo."}
          </p>
          <p className="small muted">
            This clears local drafts and rotates the dataset identity. Exported
            PDFs or JSON files cannot be recalled. The model cache is managed
            separately.
          </p>
          <Button
            variant={action === "clear" ? "danger" : "primary"}
            onClick={() => {
              cancelGeneration();
              const s = seedSource();
              if (action === "clear") {
                s.days = [];
                s.revisions = [];
                s.medications = [];
                s.medicationEvents = [];
                s.notes = [];
              }
              if (replace(s)) {
                for (const k of [KEYS.drafts, KEYS.derived, KEYS.reports])
                  localStorage.removeItem(k);
                setAction(null);
                notify(
                  action === "clear"
                    ? "All local records were cleared."
                    : "The fictional demo was reset.",
                );
              }
            }}
          >
            {action === "clear" ? "Clear these records" : "Reset the demo"}
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Recovery({ writer }: { writer: boolean }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="recovery">
      <ShieldCheck size={34} />
      <h1>Your saved record needs attention.</h1>
      <p>
        The local record is unreadable or uses an unsupported version. It has
        not been overwritten.
      </p>
      <div className="row wrap">
        <Button
          variant="ghost"
          onClick={() => {
            const raw = localStorage.getItem(KEYS.source);
            downloadJSON({ raw }, "medwatch-recovery-copy.json");
          }}
        >
          Download a recovery copy
        </Button>
        <Button
          variant="danger"
          disabled={!writer}
          onClick={() => setConfirm(true)}
        >
          Reset this browser’s demo
        </Button>
      </div>
      {confirm && (
        <Modal
          title="Replace the unreadable record?"
          onClose={() => setConfirm(false)}
        >
          <p>
            This replaces the saved record with fictional seed data. Download a
            recovery copy first if you want to keep the old contents.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              for (const k of Object.values(KEYS)) localStorage.removeItem(k);
              location.reload();
            }}
          >
            Replace with a fresh demo
          </Button>
        </Modal>
      )}
    </div>
  );
}
