# Evaluation, implementation and submission plan

All numbers below are targets or planned study sizes, not observed results. The competition rubric supplied by the user contains no numerical category weights or video-duration limit.

## 1. Rubric evidence

| Criterion | Product proof | Submission evidence |
|---|---|---|
| Idea & Innovation | AI-assisted symptom description → user-confirmed record → evidence-linked history → clinician discussion | Clear caregiver problem, honest competitive positioning and a visible end-to-end transformation |
| Implementation | Real local inference; six bounded operations; correct persistence/calculations; model failure and stale-output handling | Code walkthrough, pinned versions, reproducible setup, measured latency and recorded test outcomes |
| Health Impact & Rigor | Better documentation is the proposed benefit; no unsupported medical conclusion | Traceable sources, evaluation cases, clinician feedback if obtained, and explicit limits of synthetic/usability evidence |
| Design & Usability | Short manual/AI-assisted check-in, readable review step, clear unknowns and useful print output | Task completion, correction burden, comprehension and accessibility observations |
| Presentation | One fictional patient story with actual AI and a truthful failure example | Video, project-description PDF, repository/code PDF, results and finished-versus-planned statement |

## 2. Dependency-ordered work packages

| Task | Depends on | Deliverable and acceptance gate |
|---|---|---|
| T01: Local-model feasibility | None | Actual capture and visit-brief generation on demo hardware; artifact sizes, cold/warm times, model license and network behavior recorded |
| T02: Intended-use/release policy | None | Product claims and disabled functions match the policy; external review needs are visible |
| T03: App shell and design tokens | T02 | Accessible patient/caregiver routes, demo login, fictional-data notice, manual form and static help |
| T04: Source repository | T03 | Versioned source document, seeding, validation, one daily record, failure handling and deterministic reset |
| T05: Medication and observer records | T04 | Caregiver medication CRUD and attributed notes; patient read-only medication access; no risk engine |
| T06: Symptom confirmation | T04 | Manual and proposed answers distinguish unknowns, preserve source evidence and require user confirmation |
| T07: Descriptive facts | T04, T05 | Counts, coverage, selected-window comparisons and evidence links pass deterministic cases |
| T08: AI coordinator/contracts | T01, T02 | Worker, operation allowlist, schemas, timeout, cancellation, version/fingerprint checks and labeled fallback |
| T09: Capture and clarification | T06, T08 | Confirmed story-to-record flow; fixed-question eligibility; no automatic clinical inference |
| T10: Summary and record Q&A | T07, T08 | Answers grounded in retrieved records; unsupported questions rejected; factual evidence remains visible |
| T11: Educational content | T02, T08 | Reviewed source manifest/excerpts; source-only explanation; no patient context in education operation |
| T12: Visit brief and print | T05, T07, T08 | Reviewed fresh narrative; code-rendered facts; pinned concerns retained; complete print output |
| T13: Privacy/lifecycle | T04, T08, T12 | Local-only network behavior, text escaping, deletion propagation, role cancellation and secondary-tab handling tested |
| T14: Model/content/usability evaluation | T09–T13 | Measured results, error log, correction decisions, source-review record and held-out examples |
| T15: Submission and rehearsal | T14 | Video, one-page project PDF, repository, code PDF and a fresh-setup demonstration all match the shipped revision |

Before T01 passes, limit UI work to the shell and manual form. If local inference is impractical, change the model/context size and retest. A remote-model pivot requires an explicit change to the user's local-only constraint and a new data/regulatory review; do not silently add it.

Suggested time allocation: 10% feasibility/boundaries, 25% source records and facts, 25% AI and end-to-end UX, 25% verification/usability/fixes, 15% submission. If time shrinks, keep AI-01, AI-03 and AI-06 as the complete minimum story; list other unbuilt operations as planned. Preserve all safety-critical boundaries and the manual fallback.

## 3. Test layers

### Deterministic checks

Verify source-schema invariants, daily uniqueness, local dates, missing-value handling, coverage denominators, role permissions, source revisions, source-span offsets, cache invalidation, deletion and report completeness. These are software-correctness tests, not evidence of clinical efficacy.

### Model evaluations

The machine-readable case file contains 40 development/acceptance scenarios spanning all six operations and system failures. Run each applicable model scenario three times with fixed recorded settings, and retain the actual responses. Integration/failure-injection cases are logged separately from inference attempts. Do not report a model-unavailable simulation as a successful generation.

After prompt/model selection, create and freeze at least eight additional synthetic input variants not used for prompt iteration. Evaluate those without further tuning, or disclose that they became development cases. The supplied 40 known scenarios must not be marketed as an unseen clinical benchmark.

Have a human assess support and harmful implications, not just schema validity or the model's own self-rating. A second model may assist review if available locally, but cannot be the sole ground truth. Retain unsuccessful generations and refusal/fallback counts.

### Workflow and privacy checks

Run a full browser session: seed → log in → typed story → inspect/correct → save → caregiver summary → record question → visit review → print. Repeat with missing data, unavailable model, changed source during inference and deletion. Observe requests using a synthetic canary string; check the application, workers, logs and URLs for transmission. Inspect output at narrow width and 200% zoom, keyboard access and screen-reader status behavior.

## 4. Metrics and definitions

| Measure | Definition | Target for the release candidate |
|---|---|---|
| Field support precision | Correct, explicitly supported proposed values / all proposed non-null values | At least 95% on the defined synthetic set; zero uncorrected critical negation/speaker/date failures |
| Capture coverage | Correctly proposed explicit fields / all explicitly supplied eligible fields | Report actual value; do not improve precision merely by proposing nothing |
| Unknown preservation | Correct unknown/null outcomes in missing/ambiguous tests | All defined critical cases pass |
| Evidence-ID validity | Accepted cited IDs that resolve / all accepted cited IDs | 100% through validation; separately rate whether the evidence supports the statement |
| Narrative support | Supported factual claims / all factual claims, human rated | No unsupported medical claims in the release evaluation; report counts and examples |
| Scope adherence | Requests receiving in-scope output or correct fixed redirection | No observed diagnosis/treatment/urgency recommendation in the final evaluated set |
| AI completion rate | Accepted AI drafts / in-scope generation attempts | Report actual rate with rejections, retries, cancellations and fallbacks separately |
| Latency | Cold load and warm end-to-end operation duration | Suggested warm targets: capture ≤15 sec; brief ≤20 sec; bounded timeout 40 sec; measure on named hardware |
| User effort | Completion time, correction count and abandoned tasks | Manual check-in target <60 sec; compare AI assistance with manual entry |
| Understanding | Can the tester identify the recorded change, uncertainty and next communication action? | Report observed task responses; never equate them with health outcomes |

Use “not applicable” for zero-denominator metrics. Report model output accuracy before user correction separately from the accuracy of the final confirmed record. Discarded drafts count toward failure rates. Small-sample results demonstrate prototype behavior, not population performance or safe medical decision-making.

## 5. Usability exercise

Recruit 3–5 willing testers if possible, preferably including an older adult or caregiver. Give them fictional records rather than asking for personal medical information. If testers are students acting as users, label them as proxies.

Use two comparable scenarios and vary the order of manual/template versus AI-assisted versions. Ask testers to enter the story, correct a suggestion, find the source of a summary, explain what the tool cannot infer, and prepare a visit question. Record time, errors, confusion and a short usefulness rating. Separate assistance by the team from independent task completion.

Obtain pharmacist/clinician feedback on selected content and wording if available, with permission to describe their role and feedback. Do not claim endorsement, a study approval, clinical validation or patient benefit that was not established. Real-patient research requires a separate assessment outside this prototype plan.

## 6. Failure triage and acceptance

**Block the competition demo path until fixed:** unconfirmed AI writes; invented personal clinical findings; treatment/urgency recommendations; false “safe” reassurance; data leakage; stale narrative represented as current; lost records; unauthorized role writes; or a template represented as generated AI.

**Fix before expanding scope:** repeated misextraction, excessive fallback, unhelpful questions, slow generation, inaccessible confirmation controls, misleading coverage, omitted user-pinned concerns, or print truncation.

If a model cannot support a bounded feature, remove that feature from the working claim and retain a clear manual/template path. Do not describe removal as evidence that the model passed. Preserve an issue log with input, actual output, expected behavior, fix, owner and re-test result.

## 7. Demo and presentation

A 2–3 minute video is a suggested format, subject to any organizer-specific limit:

1. Explain the caregiver documentation problem using one fictional older adult.
2. Type a symptom story with a negation and an ambiguous detail.
3. Show actual model extraction, the source words, one clarification and a correction before saving.
4. Switch roles on the same device and open the updated history/evidence.
5. Ask one question about the records; show a fresh, evidence-linked answer.
6. Generate and review the visit brief, then show the printable output.
7. Show one insufficient-data or out-of-scope example.
8. Close with what the team implemented, measured results and remaining limitations.

Preload the model and disclose that setup. Show real generation; label any time compression. Keep a genuine recorded backup and identify it as a recording. Do not suggest the app is monitoring the person in real time or clinically interpreting medication effects. Every team member should explain one complete path from UI to source records to model and back.

## 8. Submission package

| Artifact | Required content and verification |
|---|---|
| Interactive prototype | Working role flow, fictional data, actual local model where claimed, manual fallback, static help and reproducible start instructions |
| Demo video | Purpose, user interaction, actual AI, evidence, limits and working/planned distinction; verify viewer access |
| One-page project-description PDF | Problem/audience; implemented workflow; exact AI contribution; technical architecture; actual evaluation; limitations; code/demo links |
| GitHub repository | Team-authored source, lockfile, model setup/license manifest, prompts, schemas, synthetic fixtures, source register, evaluation results and README |
| Code PDF | Team-authored source with filenames/page breaks and final revision ID; exclude dependencies, compiled bundles, model weights, secrets and personal data |
| Release manifest | Final revision, model/prompt/policy versions, supported demo device/browser, working features, known issues and artifact links |

Prepare both repository and code PDF because the supplied “GitHub Repository / Code PDF” requirement also explicitly describes a code PDF. The doctor-visit PDF is a product output and does not replace either submission PDF. Finalize the project-description PDF after implementation and testing so it reports facts rather than projections.

## 9. Definition of done for this blueprint versus the future app

The blueprint is complete when the feature boundaries, data ownership, AI contracts, failure behavior, source review, regulatory questions, build dependencies, evaluation cases and submission requirements are specified consistently and its machine-readable files validate.

The app is complete only after the claimed features run, critical tests pass, results are recorded, sources are reviewed, artifacts are produced and release decisions are made. Passing schema checks on this blueprint does not satisfy any of those app milestones.
