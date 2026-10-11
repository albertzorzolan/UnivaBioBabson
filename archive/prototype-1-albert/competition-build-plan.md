# MedWatch competition build plan — current version

The complete implementation-ready blueprint is [blueprint/README.md](blueprint/README.md). It supersedes the earlier medication-risk and AI-brief-only plans. Version 2 is retained in [history](blueprint/history/competition-build-plan-v2.md).

## Competition strategy

Demonstrate a local AI symptom-documentation workflow: user description → evidence-backed field suggestions → user correction and confirmation → descriptive history → evidence-linked answers → reviewed clinician-visit brief.

AI is specified across six bounded operations: symptom capture, documentation clarification, record summaries, record Q&A, general source explanation and visit preparation. The model does not diagnose, determine treatment, assign clinical urgency or write source records automatically.

## Important scope correction

The original personalized medication-risk engine, interaction severity and “discuss soon” labels are deferred pending function-specific clinical and regulatory assessment. Medication-list management and general source browsing remain. Descriptive timelines do not establish medication causation. The active build uses fictional data and must not claim FDA authorization, HIPAA compliance or clinical validation.

## Where to start

1. Read the [product requirements](blueprint/01-product-and-experience.md) and [regulatory design](blueprint/04-regulatory-and-safety.md).
2. Prove capture and visit-brief inference with a local model on the intended demo hardware.
3. Implement the [architecture and data contracts](blueprint/02-architecture-and-data.md).
4. Integrate the [six AI workflows and prompts](blueprint/03-ai-workflows-and-prompts.md).
5. Execute the [evaluation and delivery plan](blueprint/05-evaluation-and-delivery.md), including the 40 supplied synthetic acceptance scenarios.

The package includes machine-readable response/record schemas, a release policy and an unfilled results template. These are specifications; no app or model tests have been run and no submission artifacts are yet completed.
