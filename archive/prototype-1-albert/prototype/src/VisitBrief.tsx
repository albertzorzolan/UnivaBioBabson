import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  FileText,
  Pin,
  Printer,
  Sparkles,
} from "lucide-react";
import { cancelGeneration, runAI, useAI } from "./ai";
import { AIStatus, DraftMeta } from "./AIPanel";
import { dateLabel, factsFor, localDate, shiftDate } from "./domain";
import type { AIResult, Evidence, Narrative, Source } from "./types";
import { Badge, Button } from "./ui";
export function VisitBrief({
  source,
  onEvidence,
}: {
  source: Source;
  onEvidence: (id: string, from?: string, to?: string) => void;
}) {
  const today = localDate();
  const [period, setPeriod] = useState(14);
  const from = shiftDate(today, -period + 1);
  const facts = useMemo(
    () => factsFor(source, from, today),
    [source, from, today],
  );
  const pinned = source.notes.filter((n) => n.pinned);
  const [result, setResult] = useState<AIResult | null>(null);
  const [mode, setMode] = useState<"none" | "template" | "ai">("none");
  const [observations, setObservations] = useState<Narrative[]>([]);
  const [questions, setQuestions] = useState<Narrative[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const ai = useAI();
  useEffect(() => {
    cancelGeneration();
    setResult(null);
    setMode("none");
    setReviewed(false);
    setObservations([]);
    setQuestions([]);
  }, [source.sourceRevision, source.datasetId, period, from, today]);
  useEffect(() => () => cancelGeneration(), []);
  const build = async () => {
    setError("");
    setReviewed(false);
    const evidence: Evidence[] = [
      ...facts.map((f) => ({ id: f.id, text: f.text })),
      ...pinned
        .slice(0, 4)
        .map((n) => ({
          id: `concern:${n.id}`,
          text: `${n.role} concern ${n.dateLocal}: ${n.text.slice(0, 500)}`,
        })),
    ];
    try {
      const r = await runAI({
        operation: "visit_brief",
        source,
        role: "caregiver",
        from,
        to: today,
        evidence,
      });
      setResult(r);
      setObservations(r.payload.observations ?? []);
      setQuestions(r.payload.questions ?? []);
      setMode("ai");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const template = () => {
    cancelGeneration();
    setError("");
    setResult(null);
    setMode("template");
    setReviewed(false);
    setObservations([]);
    setQuestions([
      {
        text: "What other details would be useful to record before our next visit?",
        evidenceIds: ["fact:coverage"],
      },
    ]);
  };
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <span className="eyebrow">MAKE THE MOST OF THE CONVERSATION</span>
          <h1>A visit brief, in your words.</h1>
          <p>
            Bring a concise record. Leave clinical decisions to the
            conversation.
          </p>
        </div>
        <select
          aria-label="Visit brief period"
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          {[7, 14, 28].map((n) => (
            <option value={n} key={n}>
              Last {n} days
            </option>
          ))}
        </select>
      </div>
      <div className="brief-layout">
        <aside className="brief-controls no-print">
          <section className="panel">
            <span className="eyebrow">01 · BRING IT TOGETHER</span>
            <h2>Choose your starting point</h2>
            <p className="small muted">
              The facts and medication table are drawn directly from confirmed
              records.
            </p>
            <AIStatus />
            <Button
              className="full"
              disabled={ai.status !== "ready" || !source.days.length}
              onClick={() => void build()}
            >
              <Sparkles size={17} /> Draft with local AI
            </Button>
            <Button className="full" variant="ghost" onClick={template}>
              <FileText size={17} /> Use a simple template
            </Button>
            <p className="small muted">
              The template uses fixed text and record data. It is not AI
              generated.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
          <section className="panel">
            <span className="eyebrow">02 · CHECK THE DETAILS</span>
            <h2>Review before sharing</h2>
            <p className="small muted">
              Edit the draft, check the source links, and keep your pinned
              concerns.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={mode === "none"}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              I reviewed the facts and wording.
            </label>
            <Button
              className="full"
              disabled={!reviewed || mode === "none"}
              onClick={() => window.print()}
            >
              <Printer size={17} /> Print / save as PDF
            </Button>
            <small className="muted">
              Your browser’s print dialog can save a PDF. Nothing is sent to a
              clinician.
            </small>
          </section>
          <div className="report-note">
            <Pin size={17} />
            <span>
              All {pinned.length} pinned concern
              {pinned.length === 1 ? " is" : "s are"} included, even when
              outside this date range.
            </span>
          </div>
        </aside>
        <article
          className={`report-page ${mode === "none" ? "report-preview" : ""} ${!reviewed ? "report-unreviewed" : ""}`}
        >
          <header className="report-header">
            <div className="row">
              <span className="report-brand">
                MedWatch<span> Care conversation brief</span>
              </span>
              <Badge tone="outline">Fictional demo</Badge>
            </div>
            <h1>Margaret Rivera</h1>
            <p>Prepared by Alex, caregiver · {dateLabel(today, true)}</p>
            <div className="report-period">
              Record period: {dateLabel(from)} – {dateLabel(today, true)}
            </div>
          </header>
          <div className="report-section">
            <h2>
              <span>01</span> What the records show
            </h2>
            <div className="report-facts">
              {facts.map((f) => (
                <div key={f.id}>
                  <strong>{f.value}</strong>
                  <span>{f.label}</span>
                  <small>{f.detail}</small>
                  <button
                    className="text-button no-print"
                    onClick={() => onEvidence(f.id, from, today)}
                  >
                    Check source
                  </button>
                </div>
              ))}
            </div>
            <p className="report-limitation">
              Only confirmed patient answers are counted. Missing days and
              unanswered fields remain unknown. Caregiver notes are separate.
              These are descriptive records, not a clinical assessment.
            </p>
          </div>
          <div className="report-section">
            <h2>
              <span>02</span> Current recorded medication list
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Recorded dose</th>
                  <th>Recorded schedule</th>
                </tr>
              </thead>
              <tbody>
                {source.medications
                  .filter((m) => !m.endDate)
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.dose}</td>
                      <td>{m.schedule}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!source.medications.some((m) => !m.endDate) && (
              <p>No current medicines on the recorded list.</p>
            )}
            <p className="report-limitation">
              Transcribed list only. Presence on this list does not confirm
              adherence or a dose taken.
            </p>
          </div>
          <div className="report-section">
            <h2>
              <span>03</span> Observations & discussion questions
            </h2>
            {mode === "none" ? (
              <div className="report-placeholder">
                <Sparkles size={21} />
                <p>Your discussion draft will appear here.</p>
                <small>
                  Choose local AI or the simple template, then review.
                </small>
              </div>
            ) : (
              <>
                {result ? (
                  <div className="no-print">
                    <DraftMeta result={result} />
                  </div>
                ) : (
                  <Badge tone="outline">Template · not AI generated</Badge>
                )}
                {observations.map((item, i) => (
                  <div className="report-editable" key={`obs-${i}`}>
                    <label className="no-print">
                      Observation {i + 1}
                      <textarea
                        aria-label={`Edit observation ${i + 1}`}
                        value={item.text}
                        maxLength={400}
                        rows={3}
                        onChange={(e) => {
                          setReviewed(false);
                          setObservations((a) =>
                            a.map((x, j) =>
                              i === j ? { ...x, text: e.target.value } : x,
                            ),
                          );
                        }}
                      />
                    </label>
                    <p className="print-only">{item.text}</p>
                    <div className="evidence-links no-print">
                      {item.evidenceIds.map((id) => (
                        <button
                          onClick={() => onEvidence(id, from, today)}
                          key={id}
                        >
                          <FileText size={12} /> Supporting record
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {questions.map((item, i) => (
                  <div className="report-editable" key={`q-${i}`}>
                    <label className="no-print">
                      Discussion question {i + 1}
                      <textarea
                        aria-label={`Edit discussion question ${i + 1}`}
                        value={item.text}
                        maxLength={400}
                        rows={2}
                        onChange={(e) => {
                          setReviewed(false);
                          setQuestions((a) =>
                            a.map((x, j) =>
                              i === j ? { ...x, text: e.target.value } : x,
                            ),
                          );
                        }}
                      />
                    </label>
                    <p className="print-only">• {item.text}</p>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="report-section">
            <h2>
              <span>04</span> Pinned concerns, in the author’s words
            </h2>
            {pinned.length ? (
              pinned.map((n) => (
                <div className="report-concern" key={n.id}>
                  <span>
                    {n.role === "caregiver"
                      ? "Caregiver observation"
                      : "Patient concern"}{" "}
                    · {dateLabel(n.dateLocal, true)}
                  </span>
                  <p>“{n.text}”</p>
                </div>
              ))
            ) : (
              <p className="small muted">
                No pinned concerns. You can add one in Daily records.
              </p>
            )}
          </div>
          <footer className="report-footer">
            <span>
              {mode === "ai"
                ? "AI-assisted wording, editable by caregiver."
                : mode === "template"
                  ? "Fixed template; no AI-generated narrative."
                  : "Draft preview."}{" "}
              {reviewed
                ? "Reviewed by caregiver in this prototype."
                : "Not yet reviewed."}
            </span>
            <p>
              Fictional-data competition prototype. No diagnosis, medication
              advice, or continuous monitoring. This document has not been
              clinically validated.
            </p>
          </footer>
        </article>
      </div>
    </>
  );
}
