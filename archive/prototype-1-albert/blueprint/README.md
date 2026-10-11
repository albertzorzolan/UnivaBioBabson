# MedWatch: implementation-ready competition blueprint

Version 3 · prepared 25 September 2026 · working project name

**Product promise:** Help older adults and caregivers capture symptom experiences accurately, understand what their records say, and prepare a clear conversation with a clinician using local AI.

**Deliverable status:** Complete design specification, schemas, release policy and evaluation cases. The application, model integration and evaluation results are not implemented. No clinical benefit, regulatory classification, FDA authorization or HIPAA compliance has been established.

## Read and build in this order

| Document | Implementation decisions it owns |
|---|---|
| [Product and experience](01-product-and-experience.md) | Intended use, users, screens, capability scope, patient and caregiver journeys, accessibility, competitive demonstration |
| [Architecture and data](02-architecture-and-data.md) | Modules, data flows, domain records, storage, versioning, permissions, worker lifecycle, deletion and failure behavior |
| [AI workflows and prompts](03-ai-workflows-and-prompts.md) | Six bounded AI operations, prompt instructions, evidence contracts, validation, review and fallback behavior |
| [Regulatory and safety design](04-regulatory-and-safety.md) | U.S. source review, limits of the analysis, feature boundaries, privacy controls, claims and release gates |
| [Evaluation and delivery](05-evaluation-and-delivery.md) | Build sequence, implementation tasks, traceability, test cases, targets, usability study, demo and submission artifacts |
| [Release policy](release-policy.json) | Machine-readable permitted operations and disabled functions; enforce in service code |
| [Symptom record schema](schemas/symptom-record.schema.json) | A confirmed daily record and the provenance of individual answers |
| [AI response schema](schemas/ai-response.schema.json) | The response envelope and six operation payloads |
| [Evaluation cases](evaluation/cases.json) | Synthetic scenarios and expected behavior; these are not test results |
| [Results template](evaluation/results-template.json) | Honest reporting of model, prompt, environment, outcomes, failures and human ratings |
| [Source register](content/source-register.json) | Source metadata and explicit review status; no unreviewed item is released as approved clinical content |
| [Build handoff](BUILD-PROMPT.md) | A ready-to-use implementation instruction for the team or coding assistant |
| [Blueprint validator](validate_blueprint.py) | Structural checks for this specification, not tests of an implemented app or clinical safety |
| [Validation record](validation-record.md) | What was actually checked and what has not been tested |

This version supersedes the original build prompt and version 2 planning documents wherever they conflict. The earlier plans are preserved in `history/` for provenance and must not be treated as current implementation instructions.

## Decisions that materially change the previous plan

1. **AI starts at symptom entry.** It drafts structured answers from the user's own words, selects approved clarification questions, summarizes confirmed records, answers questions about those records, explains selected educational material and drafts a visit brief.
2. **Users confirm what AI extracts.** No inferred symptom, inferred severity, inferred medication usage or generated claim enters the source record automatically.
3. **Medication safety scoring is not an active consumer function.** The earlier personal interaction-risk engine and urgency labels are deferred pending function-specific clinical and regulatory assessment. Replacing a label with “educational” would not resolve the underlying issue. General reference browsing and medication-list management remain in scope.
4. **Record comparisons describe observations.** Dates and counts are calculated; the product does not infer a cause, diagnose a condition, predict deterioration or tell a user when care can safely wait.
5. **The demo uses fictional data only.** Patient records stay in one browser. The hardcoded login is explicitly a role demonstration, not protection appropriate for real patient data.
6. **No automatic patient-data transmission.** Inference and assets are local; no analytics, hosted model, online transcription, remote error payloads or background reference lookups. Any later change requires a new privacy and regulatory assessment.
7. **Compliance remains an assessment, not a guarantee.** This blueprint recommends a deliberately narrower intended use and concrete safeguards. It cannot certify the finished implementation or every federal/state obligation.

## Why this can be competitive

The distinctive demo is the transformation of a short, imperfect symptom description into a user-corrected record, a transparent longitudinal summary and a useful clinician handoff. Judges see AI performing language understanding and grounded communication at several steps, plus the team's ability to measure errors and explain limitations.

Do not claim this combination is unique in the market without a broader competitor review. The innovation claim should describe exactly what the team built and what the demonstration establishes.

## First milestone

On the actual demo laptop, run the `capture` operation against the synthetic sentence “I felt lightheaded after breakfast. My energy was 2 out of 5. I did not fall.” Show extracted suggestions beside their exact supporting words, ask for any missing required answer, and require confirmation before saving. Then run a fresh `visit_brief` from confirmed evidence. Record latency, inspect network activity, and retain both outputs for evaluation.

This is an AI feasibility milestone, not a health-safety or regulatory approval milestone. Keep the manual form usable if inference fails.
