# FHIR samples

Two files that show what Kinwise's FHIR R4 export looks like and how it was checked. Both are fixed snapshots from
2026-10-11. Builds and the normal test run never rewrite them; `src/engine/brief/fhir.test.ts` only checks that the
sample still passes the app's structural validation and that the saved OperationOutcome has no errors. To
regenerate them on purpose, follow the two commands in the comment above the opt-in "sample export" block in
`src/engine/brief/index.test.ts` (write the Bundle, then validate it on the public HAPI R4 server).

| File | What it is |
|---|---|
| [kinwise-fhir-bundle.json](kinwise-fhir-bundle.json) | One HL7® FHIR® R4 document Bundle (270 resources: 1 Composition, 246 Observations, 11 DetectedIssues, 8 MedicationStatements, 1 Medication, 1 Patient, 1 RelatedPerson, 1 Device) exported from the fictional demo record of Margaret Rivera |
| [kinwise-fhir-validation.json](kinwise-fhir-validation.json) | The OperationOutcome from the public HAPI FHIR R4 server's `$validate` for that Bundle, checked against base R4 structure on 2026-10-11: 0 errors, 25 warnings, 11 information messages |

## What the sample is, and is not

- **A pre-review sample.** It covers the demo window of 2026-09-12 to 2026-10-11 and was exported before the visit
  brief was marked as reviewed, so its Composition has `status: "preliminary"` (the title, "Kinwise visit brief:
  Margaret Rivera, Sep 12 through Oct 11", does not carry the status).
- **Structure only.** The 25 warnings say that LOINC (16) and RxNorm (9) codes could not be checked, because the
  validator had no terminology server for those code systems; the 11 information messages note citation links to
  outside sources (DOI, PubMed, CDC and other web pages) that are not resources in the Bundle. No US Core or IPS profile was claimed or checked.
- **No receiving system.** No clinic system has imported it. Today the clinician receives the printed brief; FHIR is
  interoperability readiness.
- **Fictional data.** Every person, medicine list and diary answer in it is from the seeded demo record.

## How it differs from the export in the app today

The app builds a new Bundle each time from the record as it stands: the current visit-brief window (demo dates are
relative to the day the app is opened, so they will not be 2026-09-12 to 2026-10-11) and the brief on screen. The
Composition is exported as `preliminary` until the caregiver marks the brief as reviewed, and as `final` after that.
The resource count therefore changes with the record; the Visit brief screen shows it next to the in-browser
validity check ("Valid FHIR R4 Bundle · N resources").

Code: `src/engine/brief/fhir.ts › toFhirBundle` (build) and `src/engine/brief/fhir.ts › validateBundle` (the
in-browser structural check); the export card is `src/views/caregiver/brief/Exports.tsx › FhirExportCard`.
