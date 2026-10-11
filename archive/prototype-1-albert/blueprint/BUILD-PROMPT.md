# Implementation handoff

Copy the instruction below into the coding task with access to this workspace. This is an instruction for the future implementation; it has not been executed as part of the blueprint deliverable.

> Build the local interactive prototype specified by blueprint/README.md and its linked version 3 documents. Read the product, architecture, AI workflow, regulatory/safety and evaluation specifications before implementation. Version 2 files under blueprint/history and the original pasted prompt are superseded wherever they conflict with version 3.
>
> Use React, TypeScript and Vite. Implement one fictional patient dataset with browser-local source storage, large accessible patient controls, caregiver medication editing, source-attributed observer notes, deterministic symptom history and a user-reviewed printable visit document. Keep the hardcoded role credentials explicitly marked as demo behavior. No real patient data, remote patient database, real auth, telemetry, cloud inference, online speech recognition, wearable sync or OpenFDA lookup is enabled.
>
> First complete the local-AI feasibility milestone on the actual demo machine. Select and pin a licensed model supported by the chosen browser runtime. Serve all model/runtime artifacts locally. Run actual capture and visit-brief generation using synthetic inputs; inspect source spans, structured responses, latency and network behavior. If this fails, reduce model/context/output size and retest. Do not replace actual generation with canned text or add a remote model without a separately authorized architecture change.
>
> Implement the six bounded operations from blueprint/03-ai-workflows-and-prompts.md: capture, clarify, record_summary, record_qa, education and visit_brief. The minimum complete demonstration uses capture, record_summary and visit_brief. Respect the role/operation allowlist in blueprint/release-policy.json. The model has no tools, storage writes or network access. Use the response and source-record schemas as host-side validation contracts, even if a runtime's constrained-generation schema supports only a subset.
>
> Keep proposed fields separate from confirmed records. Preserve negation, speaker, date, ambiguity and exact source spans. Require the patient to confirm before saving. Never infer a symptom absence, score, diagnosis, treatment, clinical urgency, medication causation or adherence. Use approved question IDs and static wording for clarification. Preserve unknown answers and use actual answered-day denominators. Calculate dates/counts and render medication values in code.
>
> Build deterministic evidence retrieval and full request fingerprints. Reject mismatched, stale, unauthorized and unsupported outputs. Do not stream unchecked model prose into the UI. Content checks are not proof of safety; evaluate support manually. Require narrative review before the print report, keep user-pinned concerns visible and label AI, cached and template output accurately. Source education requires a reviewed general-information excerpt and must receive no patient context.
>
> Do not implement the earlier personalized medication-risk engine, drug-interaction severity, “discuss soon” labels, diagnosis, disease prediction, treatment/dosing advice or automated symptom triage. Always-available static help must work without the model, and users must know nobody is monitoring their entries. General medication-list management and source browsing stay in scope.
>
> Implement robust local persistence, source revisions, dataset IDs, cancellation, role changes, corruption/quota handling, bounded model timeouts, manual fallback, deletion of dependent records/drafts/reports, and no automatic external delivery. Do not put raw health text in URLs or logs. Escape all user/model text. Validate network behavior and preserve the distinction between local records and model caches.
>
> Follow T01–T15 in the evaluation/delivery plan. Turn the 40 supplied scenarios into meaningful tests/evaluations, record actual outputs and denominators, and create fresh held-out variants after prompt selection. Do not fabricate results or describe structural schema checks as app, clinical or legal validation. Perform accessibility/print checks and a small fictional-case usability exercise if testers are available.
>
> Deliver reproducible source/setup instructions, pinned model/prompt/policy provenance, honest evaluation results and a working/planned/limitations list. Prepare the demo video, one-page project-description PDF, repository and code PDF from the final implemented revision. The doctor-visit PDF is a separate product output. Flag unanswered external clinical/regulatory review items without claiming FDA approval, HIPAA compliance or medical effectiveness.

## Handoff completion record

The implementing team should report the app revision, model/runtime/prompt versions, supported demo device/browser, working operations, test/evaluation results, known failures, external-review status and submission-file locations. Any scope change must update the product description, release policy, prompts, tests and presentation consistently.
