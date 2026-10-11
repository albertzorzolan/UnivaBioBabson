# MedWatch — current data flow

This diagram reflects the version 3 [implementation blueprint](blueprint/README.md). The earlier diagram is preserved in [history](blueprint/history/medwatch-data-flow-v2.md); its personalized risk-engine and urgency-label paths are not active requirements.

## End-to-end application flow

```mermaid
flowchart TB
    USER["Patient or caregiver"] --> SESSION["Demo login and role checks"]
    SESSION --> INPUT["Symptom story or manual check-in"]
    INPUT --> CAPTURE["Local AI symptom extraction<br/>Source words and approved clarification IDs"]
    CAPTURE --> CONFIRM["Patient corrects and confirms answers"]
    INPUT -->|"Manual path"| CONFIRM
    CONFIRM --> REPO["Validated source write<br/>Dataset ID and source revision"]
    SESSION --> MEDS["Caregiver medication editing<br/>Attributed observation notes and concerns"]
    MEDS --> REPO
    BOOT["Startup validation and first-use sample seed"] --> REPO
    REPO <--> DATA[("Local confirmed records<br/>Symptoms, medications, notes and provenance")]
    DATA --> FACTS["Deterministic descriptive facts<br/>Counts, coverage, dates and comparison windows"]
    FACTS --> EVIDENCE["Operation-specific evidence package<br/>Known IDs and explicit limitations"]
    CONTENT["Reviewed local educational excerpts"] --> EVIDENCE
    USER -->|"Summary, record question, source explanation or visit request"| EVIDENCE
    EVIDENCE --> MODEL["Local AI worker<br/>Bounded operation; no tools or external inference"]
    MODEL --> CHECK["Strict contract and evidence checks<br/>Content checks and freshness validation"]
    EVIDENCE --> CHECK
    CHECK --> REVIEW["Patient or caregiver review<br/>Underlying facts remain visible"]
    REVIEW --> DRAFTS[("Local drafts and review metadata<br/>Model, prompt, evidence and source versions")]
    DRAFTS --> VIEWS["Accessible patient history<br/>Caregiver timeline and evidence views"]
    DATA --> VIEWS
    FACTS --> VIEWS
    DRAFTS --> REPORT["Visit-summary assembly"]
    DATA --> REPORT
    FACTS --> REPORT
    REPORT --> PDF["Print preview<br/>User prints or saves locally"]
    CHECK -->|"Rejected or unavailable"| FALLBACK["Explicit manual or template fallback"]
    HELP["Always-available static help<br/>No automated triage or clinician notification"]
```

## Data authority and boundaries

- User-confirmed source records are authoritative for the app. AI suggestions and narrative drafts are separate collections.
- Code calculates dates, counts and denominators. The model explains supplied records and selected reference material; it does not establish a clinical interpretation.
- A changed record invalidates dependent drafts. Patient confirmation is required before a proposed symptom field becomes source data. Narrative review is required before AI text enters the visit document.
- The role service, repository, operation policy and request fingerprint are enforced outside the model.
- Static help remains available without AI. There is no inference of whether a user is safe to wait.
- No active clinical risk score, diagnosis, drug-interaction recommendation, medication change, wearable connection, remote model or patient-data server is included.

The [architecture specification](blueprint/02-architecture-and-data.md) includes the module tree, service contracts, records, storage/error handling, lifecycle state diagram, deletion flow and print consistency rules. The [regulatory design brief](blueprint/04-regulatory-and-safety.md) explains why the active scope changed and what remains unassessed.
