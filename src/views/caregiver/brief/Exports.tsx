// Visit brief exports: the FHIR R4 bundle for the clinic (with a structural validity check run in the browser) and
// the CMS-style Personal Medication List (on screen and on paper).
import { useMemo, useState } from "react";
import { CircleCheck, CircleAlert, Download } from "lucide-react";
import type { ISODate, MedReview, StoreData, VisitBrief } from "../../../model/types";
import { bundleToJson, fhirFileName, toFhirBundle, validateBundle } from "../../../engine/brief";
import type { PersonalMedicationList } from "../../../engine/brief";
import { Button, Card, CardHeader, Disclosure, cx } from "../../../ui";

/** Order in which resource counts are listed. */
const TYPE_ORDER = ["Composition", "Patient", "RelatedPerson", "Device", "Medication", "MedicationStatement", "Observation", "DetectedIssue"];

/** Trigger a download of text content (no network involved). */
export function downloadText(name: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface FhirExportProps {
  data: StoreData;
  review: MedReview;
  brief: VisitBrief | null;
  today: ISODate;
  onDownloaded: (fileName: string, resources: number) => void;
}

export function FhirExportCard({ data, review, brief, today, onDownloaded }: FhirExportProps) {
  const [preview, setPreview] = useState(false);
  const result = useMemo(() => {
    try {
      const bundle = toFhirBundle({ data, review, brief, today });
      const errors = validateBundle(bundle);
      const byType: Record<string, number> = {};
      for (const e of bundle.entry ?? []) byType[e.resource.resourceType] = (byType[e.resource.resourceType] ?? 0) + 1;
      return { bundle, errors, byType, count: bundle.entry?.length ?? 0, error: null as string | null };
    } catch (e) {
      return { bundle: null, errors: [], byType: {}, count: 0, error: e instanceof Error ? e.message : "The export could not be built." };
    }
  }, [data, review, brief, today]);
  const json = useMemo(() => (result.bundle && preview ? bundleToJson(result.bundle) : ""), [result.bundle, preview]);
  const valid = Boolean(result.bundle) && result.errors.length === 0;
  const types = Object.entries(result.byType).sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a[0]);
    const ib = TYPE_ORDER.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const download = () => {
    if (!result.bundle) return;
    const name = fhirFileName(data, today);
    downloadText(name, bundleToJson(result.bundle), "application/fhir+json");
    onDownloaded(name, result.count);
  };

  return (
    <Card as="section" className="cg-vb-panel cg-vb-fhir" aria-labelledby="cg-vb-fhir-title" data-tour="brief-fhir">
      <CardHeader level={2} id="cg-vb-fhir-title" title="Export for clinician" eyebrow="HL7® FHIR® R4" />
      <p className="cg-vb-panel__text">
        The format clinic record systems exchange. One file with this brief as a document, the medicine list, each diary answer as an
        observation and each review prompt as a flagged issue.
      </p>
      <p className={cx("cg-vb-valid", valid ? "is-valid" : "is-invalid")} role="status">
        {valid ? <CircleCheck size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
        <span>
          {valid
            ? `Valid FHIR R4 Bundle · ${result.count} resources`
            : result.error
              ? `Export unavailable: ${result.error}`
              : `${result.errors.length} structural ${result.errors.length === 1 ? "problem" : "problems"} found`}
        </span>
      </p>
      {types.length > 0 && (
        <ul className="cg-vb-types" role="list" aria-label="Resources in the bundle">
          {types.map(([t, n]) => (
            <li key={t}>
              <span className="ui-num">{n}</span> {t}
            </li>
          ))}
        </ul>
      )}
      {brief && !brief.reviewedAt && <p className="cg-vb-panel__hint">Exported as “preliminary” until you mark the brief reviewed.</p>}
      <Button variant="secondary" iconLeft={<Download size={17} aria-hidden="true" />} onClick={download} disabled={!result.bundle} block>
        Download FHIR JSON
      </Button>
      {result.errors.length > 0 && (
        <Disclosure summary="What failed the check">
          <ul className="cg-vb-errors">
            {result.errors.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Disclosure>
      )}
      {result.bundle && (
        <Disclosure summary="Preview the JSON" open={preview} onOpenChange={setPreview}>
          <pre className="cg-vb-json" tabIndex={0} aria-label="FHIR bundle JSON (first 120 lines)">
            {json.split("\n").slice(0, 120).join("\n")}
            {json.split("\n").length > 120 ? "\n…" : ""}
          </pre>
        </Disclosure>
      )}
    </Card>
  );
}

/** The Personal Medication List, laid out like the CMS Part D MTM form (screen + print). */
export function PmlSheet({ pml, isDemo }: { pml: PersonalMedicationList; isDemo: boolean }) {
  return (
    <div className="cg-vb-pml" data-theme="light">
      <header className="cg-vb-pml__head">
        <p className="cg-vb-pml__kind">Personal Medication List</p>
        <h2 className="cg-vb-pml__name">{pml.patientName}</h2>
        <p className="cg-vb-pml__meta">
          Age {pml.age} · prepared {pml.preparedOn} by {pml.preparedBy}
          {isDemo ? " · fictional demo data" : ""}
        </p>
        <p className="cg-vb-pml__allergies">
          <strong>Allergies and side effects I’ve had:</strong> {pml.allergies}
        </p>
      </header>
      <table className="cg-vb-table cg-vb-pml__table">
        <thead>
          <tr>
            {pml.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pml.rows.map((r) => (
            <tr key={r.medId}>
              <th scope="row">
                {r.medication}
                {r.notReviewed && <span className="cg-vb-pml__note">Not in Kinwise’s reference set</span>}
              </th>
              <td>{r.howITakeIt}</td>
              <td>{r.whyIUseIt}</td>
              <td>{r.prescriber}</td>
              <td className="cg-vb-nowrap">{r.started}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pml.stoppedRecently.length > 0 && (
        <p className="cg-vb-pml__stopped">
          <strong>Stopped recently:</strong> {pml.stoppedRecently.map((r) => `${r.medication} (last taken ${r.stopped})`).join("; ")}
        </p>
      )}
      <div className="cg-vb-pml__notes">
        <h3>My notes and questions</h3>
        {pml.notes.concerns.length + pml.notes.questions.length === 0 ? (
          <p className="cg-vb-muted">No saved questions yet.</p>
        ) : (
          <ul>
            {pml.notes.concerns.map((c) => (
              <li key={`c-${c}`}>
                <strong>Concern:</strong> {c}
              </li>
            ))}
            {pml.notes.questions.map((q) => (
              <li key={`q-${q}`}>{q}</li>
            ))}
          </ul>
        )}
        <h3>{pml.notes.symptomsHeading}</h3>
        {pml.notes.symptoms.length === 0 ? (
          <p className="cg-vb-muted">None of the diary symptoms were recorded in this period.</p>
        ) : (
          <ul>
            {pml.notes.symptoms.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
      <footer className="cg-vb-pml__foot">
        {pml.footer.map((f) => (
          <p key={f}>{f}</p>
        ))}
      </footer>
    </div>
  );
}
