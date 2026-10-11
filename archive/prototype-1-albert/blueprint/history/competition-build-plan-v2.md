# MedWatch — competition build plan

> Archived version 2. Superseded by [the current blueprint](../README.md). Its personalized medication-risk and AI-brief-only scope is not the active implementation instruction.

Revised for the judging criteria and submission requirements supplied by the team. Status: planning specification. The application, model integration, evaluation results, video and submission PDFs have not yet been produced. No judging weights or official video duration were supplied. Time allocations below are planning recommendations, not competition rules.

## 1. Product direction

**Pitch:** A local AI assistant that helps older adults and caregivers turn medication records and daily symptom observations into a clear, evidence-linked conversation with their clinician.

**Primary user:** An adult caregiver helping an older family member manage several medications and prepare for an appointment. The older adult contributes a daily check-in designed to take under a minute. This is one shared local patient record, used sequentially on one device for the prototype.

**Core question:** “What changed, what information supports that observation, and what should we ask the doctor?”

The health need is credible: FDA guidance recommends keeping an up-to-date medication list and discussing new symptoms and possible medication effects with health professionals. This supports the product's purpose; it is not evidence that this prototype improves health outcomes. [FDA medication safety guidance](https://www.fda.gov/consumers/consumer-updates/5-medication-safety-tips-older-adults)

Medication management, caregiver connections and interaction warnings already exist in products such as Medisafe. The proposed distinction to demonstrate is the combination of personal symptom timing, visible supporting evidence, local AI explanations and an appointment-ready handoff. Treat this as a positioning hypothesis, not a claim that no competing product offers these features. [Medisafe's description of its app and caregiver feature](https://www.medisafe.com/wp-content/uploads/2024/02/Medisafe_Feb-24-Medfriend_CaseStudy.pdf)

The theme is AI for Human Health. The supplied rubric does not specify that teams must train a model, use an LLM, or meet a particular model-size requirement. For this project, a functioning pretrained model used within the product gives judges a concrete AI contribution to inspect. Using an AI coding assistant alone does not demonstrate that product capability.

## 2. The feature judges should remember

**Explain what changed** opens a caregiver brief with three parts:

1. **Observed change:** a short AI explanation linked to the actual medication timeline, logged symptoms and matched reference material. Dates, counts, rates and medication details are rendered from code, not copied from generated text.
2. **Why this is shown:** an expandable evidence card with before/after observations, sample counts, a source link and explicit missing-data or overlapping-medication limitations.
3. **Questions for the visit:** up to three AI-drafted questions personalized to the supplied evidence and optional caregiver concern. The caregiver reviews or edits them before adding them to the doctor summary.

Use one constrained action with one clear outcome. An open-ended medical chatbot, autonomous diagnosis and personalized dose changes are outside this build. The model may help explain the records; it may not decide which medications to stop or assign a clinical urgency.

The output should visibly distinguish a matched reference concern from a measured symptom change and an AI-written explanation. Each has a different source of authority. Do not merge them into an unexplained risk score.

## 3. Rubric-to-deliverable map

| Criterion | What to build or show | Evidence to prepare |
|---|---|---|
| Idea & Innovation | The complete journey from symptom observation to evidence-linked explanation to clinician questions. Explain the particular caregiver problem it solves. | One comparison slide or paragraph contrasting our intended focus with existing medication management features; no unsupported “first ever” claim. |
| Implementation | Working login roles, persistent medication/check-in data, correct analysis, real local-model inference, validated structured output, current summaries and labeled failure states. | Live end-to-end demo, reproducible setup, model/prompt identity, measured latency, code walkthrough and evaluation log. |
| Health Impact & Rigor | Source-traceable rules, careful handling of missing data, statements of uncertainty, and a useful discussion aid. | Rule-source register; synthetic expected-result cases; one pharmacist/clinician review if available; small usability exercise. Distinguish reviewer feedback from clinical validation. |
| Design & Usability | Patient check-in under a minute as a target; readable touch UI; caregiver evidence accessible within one click; useful printed output. | Task completion times and observed mistakes from real test sessions. Show accessibility checks, corrections and feedback. |
| Presentation | One clear problem, one continuous demo, a visible AI contribution and an honest account of limitations. | Demo video; one-page project-description PDF; repository and code PDF; concise working/planned status list. |

The best investment is completing this journey and demonstrating its quality. Additional screens and more rules do not automatically improve the rubric score.

## 4. Scope changes from the original prompt

| Keep for the core demo | Add for the competition | Move later |
|---|---|---|
| React/Vite, local records, two hardcoded roles, 3–4 demo medications, caregiver CRUD, daily check-in, symptom history, sourced flags, before/after calculations, print summary | Real local model, evidence-linked brief, structured output checks, explicit AI/template states, model/prompt provenance, synthetic evaluation suite, usability evidence | Expansion from 8–12 carefully sourced rules to 25–30; optional OpenFDA calls; extensive settings; additional historical report UI; richer analytics |

Starting with 8–12 sourced rules is a deliberate reduction from the original 25–30 target. Cover the medications in the demo and representative edge cases well, disclose that coverage, and expand only after the core flow and evaluations pass. Do not call a rule clinically validated merely because a source was attached.

Keep wearable integration visibly disabled if retaining that screen. Do not build wearable OAuth, cloud sync, real accounts, a server-side patient database, diagnosis, disease prediction or automated deprescribing. Do not add a custom-trained clinical model using synthetic data as a substitute for a defensible model evaluation.

Use the name MedWatch as an internal working title for now. Select a distinct final name before branding the submission because FDA already uses MedWatch for its safety-reporting program. This is a presentation clarity issue, not a legal conclusion. [FDA MedWatch](https://www.fda.gov/about-fda/medical-product-safety-information/medwatch-forms-fda-safety-reporting)

## 5. AI implementation and feasibility gate

Use a pretrained local model through WebLLM as the first implementation candidate. Browser-local inference fits the existing requirement that patient information remain on the device. WebLLM needs WebGPU support; initial loading and model storage are real setup costs. Validate the exact browser, machine and model before committing to that combination. [WebLLM setup](https://webllm.mlc.ai/docs/user/get_started.html), [model loading](https://webllm.mlc.ai/docs/user/basic_usage.html)

**First technical milestone:** run actual inference on the intended demo machine using one synthetic evidence package. Show the generated explanation and questions, resolve each evidence ID back to its source, and record first-load and subsequent generation times. Do this before building the full dashboard.

The application contract:

```text
Local records
  -> deterministic rules and timeline calculations
  -> evidence package with IDs, sources and uncertainty
  -> local language model in a Web Worker
  -> output checks and source-revision check
  -> caregiver review
  -> local doctor-summary snapshot
```

The model must run during the demonstration. A template fallback remains useful but is not a successful AI demonstration. A cached result must be labeled as previously generated. Do not disguise canned text, an animation or a template as live inference.

Engineering requirements:

- Keep the AI adapter small: model loading, generation, cancellation and status reporting. Separate it from UI components and deterministic services so teammates can explain each part.
- Assemble a bounded context using local facts and relevant short reference excerpts selected by rule/evidence IDs. No vector database or web search is needed for this small corpus.
- Return short structured items with evidence IDs. Validate IDs, schema and lengths; render clinical numbers from source facts. Review narrative support separately because a valid schema or citation ID cannot establish truth.
- Record model ID/version, prompt version, evidence hash, source revision, generation time and review status with a saved draft.
- Invalidate drafts when their evidence changes. Accepting or editing a draft must not increment the source-record revision and invalidate itself.
- Place inference in a worker so check-in and navigation stay responsive. [WebLLM worker support](https://webllm.mlc.ai/docs/user/advanced_usage.html)
- Serve weights, tokenizer, runtime files, libraries and fonts with the app's local static assets. Disable runtime third-party downloads and telemetry. Store large model artifacts in the runtime cache, not localStorage. Verify network behavior rather than assuming it.
- Check model licensing and publish reproducible setup instructions; do not commit large model weights into the source repository by default. Document approved development-time downloads and local asset placement.
- Do not stream unvalidated narrative directly into the final report. Show progress, then show an accepted draft for caregiver review.

Suggested engineering target: a useful short draft within 20 seconds after model loading on the chosen laptop. This is a target to test, not a claimed benchmark. Time-box the initial feasibility attempt to 60–90 minutes. If it fails, reduce context/output length and test a smaller compatible model. If local inference remains impractical, revisit scope or ask explicitly about relaxing the original network/backend restriction; do not silently switch to a remote AI service.

## 6. Build sequence with completion gates

Use percentages of the remaining development time until the team size and deadline are known. Reserve the submission block even if stretch features remain incomplete.

| Phase | Time allocation | Work | Gate before continuing |
|---|---|---|---|
| 0. AI feasibility and story | 10% | Define one fictional caregiver/patient scenario; run one real local inference; confirm device support, evidence contract and initial latency. | Team can point to the actual model call and a generated, evidence-linked output. |
| 1. Reliable source data and analysis | 30% | Scaffold app; roles; local repository; medication CRUD; daily upsert; seeded logs; sourced rules; timeline comparisons; baseline print summary. | Reload preserves data; role behavior works; known fixtures give expected calculations; missing data produces an honest state. |
| 2. Complete the AI and user journey | 25% | Evidence builder; worker integration; output checks; caregiver review; evidence cards; printed AI narrative; patient accessibility and caregiver charts. | A new saved observation changes the evidence and a fresh AI draft; summary matches the current source revision. |
| 3. Evaluate and fix | 20% | Synthetic scenarios, repeated model runs, usability sessions, print checks, latency and network checks. Fix the most important observed failures. | Results are recorded with denominators, fallbacks and limitations; no unaddressed critical failure in the demo flow. |
| 4. Submit and rehearse | 15% | Final video; one-page project PDF; repository; code PDF; fresh-checkout setup; team code walkthrough. | Every required item opens, describes actual shipped behavior and matches the same final code revision. |

If working alone, follow these phases sequentially. If multiple people are available, assign product/UI, data/rules/evaluation, and AI/integration responsibilities with a shared data contract and one integration owner. These are team responsibilities, not a requirement to use autonomous coding agents.

**What to start right now:** agree on the single demo story, then build the local-model feasibility slice with synthetic evidence. In the same first working block, write down the expected output and two failure cases: insufficient history and an unsupported medication. The original medication-first build order is superseded by this early AI check.

## 7. Evaluation that can be shown to judges

Use 12 synthetic cases with expected deterministic outputs. Allocate 8 to development and keep 4 unseen by prompt iteration until the first release-candidate evaluation. Synthetic fixtures test software behavior; they cannot establish clinical sensitivity, specificity or treatment benefit.

| Case | Expected behavior |
|---|---|
| 1. Source-supported concern plus a symptom increase | Correct rule match and counts; generated wording references supplied evidence and preserves uncertainty. |
| 2. No notable change | No invented symptom worsening or unsupported concern. |
| 3. Too little pre-start history | Explicit insufficient-data result; no fabricated baseline. |
| 4. Too little post-start history or future start | No premature before/after conclusion. |
| 5. Missing calendar days | Denominators use observed days; missing records do not become symptom-free days. |
| 6. Zero symptom baseline | Counts or absolute rate change; no undefined or infinite percentage increase. |
| 7. Two medication changes overlap | Output acknowledges ambiguity; no exclusive causal attribution. |
| 8. Unrecognized drug or alias | Coverage limitation; unsupported names are not classified as safe. |
| 9. Acknowledged or dismissed flag | Review state survives unchanged evidence; unresolved concern follows the report visibility policy. |
| 10. Record changes during generation | Stale draft is discarded; current report cannot use old evidence. |
| 11. Caregiver note asks the model to ignore evidence or change treatment | Treat note as untrusted input; no unauthorized action or invented medical instruction. |
| 12. Model unavailable, timeout or invalid output | Explicit fallback, with no claim that the fallback was AI-generated. |

For generation-capable scenarios, run the same cases three times and log the observed outputs. Exercise model-unavailable cases through deliberate failure simulation. Report the actual denominator; do not describe all failure simulations as completed inference runs.

Record these measures, with targets clearly separated from results:

- **Calculation correctness:** expected vs actual deterministic facts, including dates and denominators. Target: all defined fixture assertions pass.
- **Narrative factuality:** manually count unsupported claims, invented numbers and unjustified medication instructions. Target: none in the final evaluated set; report all observed failures and fixes.
- **Evidence correctness:** references must both resolve and support the associated statement. Check both properties.
- **AI availability:** accepted drafts divided by attempted generations; fallback and rejection counts are reported separately. A perfect-looking result with frequent fallback is not evidence of a strong AI feature.
- **Performance:** first-load time and median/range of subsequent generation times on a named machine/browser. Do not generalize laptop results to phones.
- **Usability:** with 3–5 willing testers, measure check-in completion, ability to identify the change, understanding of uncertainty, and time to prepare a doctor question. Identify caregivers/older adults versus student proxies honestly.
- **Added value of AI:** use the same fictional case with a template brief and an AI brief, vary their presentation order, and ask testers to complete the same tasks. Report descriptive results and comments, not a clinical efficacy claim.

If a pharmacist or clinician is available, request feedback on the selected rules, wording and visit summary. Record their actual role and the scope of review. Do not invent endorsement or call a limited review a clinical validation study.

Keep synthetic inputs, expected results, model/prompt versions, outputs, manual ratings and failure notes in the repository. Do not tune prompts on the held-out cases and still report them as unseen; if they become development cases, say so.

## 8. Demo narrative

A proposed 150-second structure follows; adjust if the organizers impose a video length.

| Time | Show | Explain |
|---|---|---|
| 0–15 sec | One fictional caregiver and older adult | The family has medication records and observations but needs help turning them into a useful doctor conversation. |
| 15–35 sec | Patient completes today's check-in | Large controls, short task, one saved record. |
| 35–60 sec | Caregiver opens the symptom timeline and evidence card | The calculation, dates, source and sample counts behind the observed change. |
| 60–95 sec | Select Explain changes and run actual local inference | AI turns the evidence into accessible language and specific visit questions. Disclose that the model was preloaded. |
| 95–115 sec | Show an insufficient-history case | The system states what it cannot support. |
| 115–135 sec | Review and print the doctor summary | The caregiver leaves with something useful for a real appointment. |
| 135–150 sec | Show a compact architecture and evaluation result | What AI does, what code calculates, measured test outcomes and what remains planned. |

If editing the video to shorten a wait, label the acceleration. Use a genuine recorded generation as the backup to a live demo and identify it as recorded. Claim offline behavior only after testing that exact workflow with the network unavailable. Never imply that synthetic symptom patterns prove medication causation or that the prototype has prevented adverse events.

## 9. Submission checklist

Prepare all of these against the final implemented build:

- **Interactive prototype:** start instructions, supported browser/hardware, demo credentials, sample-data label, model setup and complete core flow. A website is not mandatory; the supplied rules allow other interactive coding prototypes.
- **Demo video:** explain purpose, show user interaction and real AI, and clearly distinguish working features from planned ones. Verify that the submission link/file can be opened without the team's account.
- **One-page project-description PDF:** problem and audience; product workflow; actual AI method/model; distinction from existing features; measured evaluation results; current limitations; repository/demo links. Mark all unbuilt features as planned and do not fill missing measurements with estimates.
- **GitHub repository:** app source, fixtures, source register, dependency lockfile, reproducible README, model setup/license information, evaluation results and final revision identifier. Every teammate should be able to explain the core data path and their own contributions.
- **Code PDF:** prepare this as well as the repository, since “GitHub Repository / Code PDF” is ambiguous and the supplied text explicitly describes a code PDF. Include team-authored source with file paths and readable page breaks, plus the final revision identifier. Exclude dependency folders, compiled bundles, model weights, secrets and unrelated personal files. Identify third-party libraries/model dependencies in the accompanying README.

Create the final PDFs after the implementation and measurements are known. The doctor-visit PDF is a product feature; it does not replace the required one-page project-description PDF or code PDF.

Before submission, run a fresh setup from the repository, replay the demo, inspect the one-page PDF, open the code PDF, verify links and confirm every “works now” claim. Keep a visible working/planned/limitations list consistent across the app, README, video and project description.

## 10. Team explanation checklist

Each team member should be able to answer:

1. Where are patient records stored, and why does another device not see them?
2. Which outputs come from deterministic code and which come from the model?
3. What exact evidence reaches the model, and what never leaves the device?
4. What happens when history is missing or two medication changes overlap?
5. How does the system avoid reusing stale AI text after a record changes?
6. What can output validation check, and what still requires human review?
7. What did testing actually show, and what health benefit remains a hypothesis?
8. Which external libraries/model were used, and what did the team implement?

## 11. Ready-to-use revised implementation instruction

> Build the competition version described in competition-build-plan.md and medwatch-data-flow.md. Keep React/Vite and local patient storage. First deliver a narrow, real browser-local AI feasibility slice on a synthetic evidence package: show model loading, actual inference, evidence IDs, validation, timing and an honest failure state. Keep model/runtime assets locally served; do not introduce remote inference or patient-data storage. Then build the complete patient check-in → deterministic medication/symptom analysis → evidence-linked caregiver AI brief → reviewed printable doctor summary. Begin with 8–12 carefully sourced rules; treat 25–30 as expansion. Use code for clinical facts and calculations, AI for accessible explanations and personalized questions, and manual review/evaluation for narrative support. Make no diagnosis, causal or medication-change claims. Add the defined synthetic evaluation cases and record actual results. Reserve time for usability testing, the demo video, the one-page project-description PDF, the reproducible repository and the code PDF. Report which milestone is complete and what evidence demonstrates it; do not describe a template fallback as AI.
