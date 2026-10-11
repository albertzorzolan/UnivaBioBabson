# MedWatch data flow and process architecture

> Archived version 2. Superseded by [the current blueprint](../README.md). Its personalized risk engine and urgency-label paths are not active requirements.

This is the revised proposed architecture for the UnivaBio hackathon prototype. It adds real, local language-model inference to the original rules-based design. All application logic and patient records live in one browser. There is no application server, cloud database, remote authentication service, or remote model API. Patient and caregiver accounts share one fictional patient record in the same browser profile and site origin. This document specifies planned behavior; it does not claim that the app or AI has been implemented or evaluated.

The competition-facing feature is an evidence-linked caregiver brief: deterministic code computes facts and flags, while a local AI model drafts accessible explanations and personalized doctor questions from those facts. See [the archived competition build plan](competition-build-plan-v2.md) for this superseded version's scope, evaluation targets and submission milestones.

Rectangles represent processes, cylinders represent stored data, and labeled arrows identify exchanged data or actions. Dashed arrows identify optional integrations. The numbered diagrams progressively expand the same system.

## 1. Complete system map

```mermaid
flowchart TB
    U["Patient and caregiver"]

    subgraph B["BROWSER — all application processing and storage"]
        AUTH["1. Session service<br/>Check demo credentials; restore role; log out"]
        SESSION[("Session<br/>Role only; no saved password")]
        GUARD["2. Role and input checks<br/>Authorize action; validate submitted fields"]
        WRITE["3. Record services<br/>Medication changes; daily check-in; flag review"]
        REPO["4. Local repository<br/>Load; validate; migrate; save; increment revision"]
        BOOT["Startup and seed loader<br/>Seed only a genuinely new store"]
        DATA[("Source records<br/>Medications and change history<br/>Daily symptoms; flag review states<br/>Settings; schema and source revision")]
        RULES["Bundled reference data<br/>Medication aliases; risk and interaction rules<br/>Rule sources; question templates"]

        subgraph ENGINES["5. Recompute from one saved source revision"]
            RISK["Risk engine<br/>Single-drug and pair checks<br/>Reconcile flags with review states"]
            CORR["Timeline analysis<br/>Before and after medication start<br/>Coverage checks and explained comparisons"]
            TREND["Symptom aggregation<br/>Weekly summaries and chart series"]
        end

        CACHE[("Generated results<br/>Flags; correlations; symptom trends<br/>Source revision and engine versions")]
        VIEW["6. Dashboard selectors<br/>Patient: simple trends and read-only medications<br/>Caregiver: history, charts and reviewed flags"]
        EVIDENCE["7. Evidence builder<br/>Known facts and source IDs<br/>Coverage limits; optional caregiver concern"]
        MODEL["8. Local language model in worker<br/>Explain changes; draft doctor questions<br/>No tools or external inference"]
        CHECK["9. Output checks and caregiver review<br/>Schema; known evidence IDs; current revision<br/>Clinical facts rendered from source records"]
        DRAFTS[("AI drafts<br/>Model, prompt and evidence versions<br/>Review state and source revision")]
        FALLBACK["Explicit template fallback<br/>AI unavailable or output rejected"]
        REPORT["10. Summary builder<br/>Current facts and reviewed AI draft<br/>Or explicitly labeled template output"]
        REPORTS[("Saved summary snapshots<br/>Content; generated time; source revision")]
        HTML["One-page print layout"]
    end

    PDF["Browser print dialog<br/>Paper or user-saved PDF"]

    U -->|"username and password"| AUTH
    AUTH -->|"valid role; clear on logout"| SESSION
    SESSION -->|"active role"| GUARD
    U -->|"medication, symptom, review or report action"| GUARD
    GUARD -->|"allowed, valid record change"| WRITE
    WRITE -->|"candidate source records"| REPO
    BOOT -->|"validated existing records or initial sample records"| REPO
    DATA -->|"persisted records"| REPO
    REPO -->|"successful save"| DATA
    REPO -->|"medications and review states"| RISK
    REPO -->|"medication timeline and daily logs"| CORR
    REPO -->|"daily logs"| TREND
    RULES -->|"versioned rules and aliases"| RISK
    RISK -->|"explained flags and review status"| CACHE
    CORR -->|"comparisons or insufficient-data states"| CACHE
    TREND -->|"chart points and plain-language trends"| CACHE
    REPO -->|"current source records"| VIEW
    CACHE -->|"results matching current revision"| VIEW
    GUARD -->|"caregiver selects Explain changes"| EVIDENCE
    REPO -->|"current source snapshot"| EVIDENCE
    CACHE -->|"facts from matching source revision"| EVIDENCE
    RULES -->|"matched reference excerpts and source IDs"| EVIDENCE
    EVIDENCE -->|"bounded evidence package"| MODEL
    MODEL -->|"structured draft"| CHECK
    EVIDENCE -->|"allowed facts and reference IDs"| CHECK
    CHECK -->|"accepted draft plus review state"| DRAFTS
    DRAFTS -->|"current draft for caregiver review"| VIEW
    MODEL -->|"unavailable, canceled or timed out"| FALLBACK
    CHECK -->|"invalid output"| FALLBACK
    GUARD -->|"caregiver summary request"| REPORT
    REPO -->|"current medication and symptom snapshot"| REPORT
    CACHE -->|"fresh flags, comparisons and trends"| REPORT
    RULES -->|"question templates"| REPORT
    DRAFTS -->|"current caregiver-reviewed draft"| REPORT
    FALLBACK -->|"explicitly labeled baseline content"| REPORT
    REPORT -->|"immutable generated snapshot"| REPORTS
    REPORT -->|"formatted summary content"| HTML
    HTML -->|"user selects Print"| PDF
```

The diagram's stores are logical collections. For this prototype, use one versioned localStorage document for source records, a separate session key, and separate derived-result, AI-draft and summary keys. This keeps a source edit together in one storage write. Large model files belong in the model runtime's browser cache, not localStorage. IndexedDB can implement the source repository contract later without changing the services.

## 2. Startup, login and role permissions

```mermaid
flowchart TB
    START["App opens"] --> READ["Read source document and schema version"]
    READ --> STATE{"Store state?"}
    STATE -->|"Key absent"| SEED["Create fictional sample dataset<br/>3–4 medications; 28 daily logs<br/>Mark dataset as demo data"]
    STATE -->|"Present, including intentionally empty"| VALID["Parse and validate schema"]
    STATE -->|"Storage cannot be read"| ERROR["Show local-storage error<br/>Offer explicit recovery; preserve existing data"]
    VALID -->|"Supported older version"| MIGRATE["Migrate records without reseeding"]
    VALID -->|"Current version"| READY["Hydrate application state"]
    VALID -->|"Corrupt or unsupported"| ERROR
    SEED --> SAVE["Persist source document"]
    MIGRATE --> SAVE
    SAVE -->|"Success"| READY
    SAVE -->|"Failure"| ERROR
    READY --> FRESH["Check source revision and engine versions<br/>Recompute stale or missing derived results"]
    FRESH --> RESTORE["Read saved role; allow only patient or caregiver"]
    RESTORE -->|"Valid role"| ROUTE["Route to role dashboard"]
    RESTORE -->|"No valid role"| LOGIN["Single login form"]
    LOGIN --> CHECK{"Credential match?"}
    CHECK -->|"babson / babson"| PAT["Save patient role"]
    CHECK -->|"babson1 / babson1"| CARE["Save caregiver role"]
    CHECK -->|"Neither"| BAD["Inline error; keep login form"]
    PAT --> ROUTE
    CARE --> ROUTE
    ROUTE --> LOGOUT["Log out action"]
    LOGOUT --> CLEAR["Clear session and in-memory role<br/>Keep medications, symptoms and reports"]
    CLEAR --> LOGIN
```

| Action | Patient | Caregiver |
|---|---|---|
| Read current medication list | Yes | Yes |
| Add, edit, remove medications | No | Yes |
| Create or edit today's symptom check-in | Yes | Not required by the brief |
| Read simple personal trends | Yes | Yes |
| Read full log history and chart data | Not required by the brief | Yes |
| Acknowledge, dismiss or restore flags | No | Yes |
| Generate or review AI explanations and questions | No in MVP | Yes |
| Generate and print doctor summary | No | Yes |
| Log out | Yes | Yes |

Apply role checks inside the record services as well as navigation. These hardcoded accounts and browser-side checks are demo behavior, not a security boundary or production authentication. Both roles use the same local dataset; logging in on another device does not transfer records.

## 3. Medication management and flag lifecycle

```mermaid
flowchart TB
    EDIT["Caregiver adds, edits or removes medication"] --> VALID["Check caregiver role and validate fields<br/>Name; dosage; frequency; reason; start date"]
    VALID -->|"Invalid"| ERR["Inline field errors<br/>No record change"]
    VALID -->|"Valid"| NORMAL["Keep entered name and normalize lookup key<br/>Apply known generic and brand aliases"]
    NORMAL --> CHANGE["Assign stable ID for new medication<br/>Record change; preserve prior timeline<br/>Removal hides current entry but retains history"]
    CHANGE --> SAVE["Repository saves next source revision"]
    SAVE -->|"Failure"| FAIL["Keep prior committed state<br/>Show unsaved error and allow retry"]
    SAVE -->|"Success"| SNAP["Read current medication snapshot"]
    RULES["Local versioned rules<br/>Drug or class match; pair conditions<br/>Severity; explanation; source reference"] --> MATCH["Match single-drug rules and medication pairs"]
    SNAP --> MATCH
    MATCH --> BUILD["Build deterministic flag identities<br/>Rule ID plus sorted medication IDs<br/>Include matched evidence fingerprint"]
    REVIEWS[("Saved flag review states")] --> RECON["Reconcile generated flags and review states"]
    BUILD --> RECON
    RECON --> FLAGS[("Current generated flags<br/>Active, acknowledged, dismissed or resolved")]
    FLAGS --> DISPLAY["Caregiver flags panel<br/>Severity, concern, source and review state"]
    DISPLAY --> ACTION["Acknowledge, dismiss or restore"]
    ACTION --> UPDATE["Validate role; save review state<br/>Use same repository save path"]
    UPDATE --> REVIEWS
    UPDATE --> RECON
    SAVE -->|"Successful medication change"| INVALIDATE["Refresh timeline analysis<br/>Mark prior summaries as older snapshots"]
```

Flag reconciliation rules:

- Keep review state when the same rule matches the same medications with the same relevant evidence.
- A changed dose, drug or other matched condition can create a new evidence fingerprint and require a new review.
- Resolve a generated flag when its condition no longer matches; keep its past review record.
- Acknowledgment records that the concern was seen. Dismissal changes visibility. Neither alters medication records or establishes that a medication is safe.
- An unrecognized medication yields an explicit coverage message, rather than an assertion that there are no risks.
- The dashboard and doctor summary use the same reconciled flag records and documented display policy.

## 4. Symptom logging, trends and timeline comparisons

```mermaid
flowchart TB
    FORM["Patient daily check-in<br/>Energy; dizziness and severity; confusion<br/>Appetite; sleep; falls or near-falls"] --> VALID["Check role; validate answers and ranges<br/>Assign local calendar date and timestamps"]
    VALID -->|"Invalid"| ERR["Show field errors<br/>Do not save partial answers as healthy days"]
    VALID -->|"Valid"| UPSERT["Upsert one record per local date<br/>Editing today replaces today's answers"]
    UPSERT --> SAVE["Repository saves next source revision"]
    SAVE -->|"Failure"| FAIL["Keep previous saved log<br/>Show unsaved error and allow retry"]
    SAVE -->|"Success"| LOGS[("Timestamped daily symptom records")]
    MEDS[("Medication records and timeline")] --> WINDOWS["For each medication start<br/>Select before and after calendar windows"]
    LOGS --> WINDOWS
    WINDOWS --> COVERAGE["For each symptom separately<br/>Count actual valid observations in each window"]
    COVERAGE --> ENOUGH{"Enough observations<br/>in both windows?"}
    ENOUGH -->|"No"| PENDING["Not enough data yet<br/>Show coverage; invite continued logging"]
    ENOUGH -->|"Yes"| METRICS["Compute rates or scale summaries<br/>Use observed-day denominators<br/>Apply correct direction for each scale"]
    METRICS --> COMPARE["Compare before and after values<br/>Apply documented prototype thresholds"]
    COMPARE --> INSIGHTS["Explain measured change or no notable increase<br/>Include dates, sample counts and limitations<br/>Association does not establish causation"]
    LOGS --> AGG["Aggregate recent and historical symptoms<br/>Missing dates remain gaps"]
    AGG --> WEEK["Simple weekly trend statements<br/>Coverage-aware patient wording"]
    AGG --> CHART["Caregiver chart series and log history<br/>Medication date markers"]
    PENDING --> CACHE[("Derived results with source revision<br/>and analysis algorithm version")]
    INSIGHTS --> CACHE
    WEEK --> CACHE
    CHART --> CACHE
    CACHE --> VIEWS["Patient trends; caregiver dashboard<br/>Doctor-summary inputs"]
```

Proposed implementation defaults, where the brief leaves behavior open:

- Use 14 calendar days before and 14 calendar days after a medication's start date. Exclude the start day because the check-in has no reliable before-dose/after-dose ordering.
- Require at least 7 valid daily observations for the individual symptom in each window. These are prototype coverage settings, not clinically validated cutoffs.
- For yes/no measures, compare symptom-positive days divided by observed days. For ordinal scales, report a clearly defined scale summary; do not imply equal clinical distance between scores.
- Keep dizziness frequency separate from severity on days with dizziness. Report the denominator for each.
- Lower energy or sleep scores and a worse appetite mean a worsening direction; handle each metric explicitly.
- Do not replace missing records with zero. When a baseline is zero, report counts and an absolute change instead of an undefined percentage increase.
- Use a documented, configurable rule for deciding which increases to highlight. Keep it separate from medical risk severity and identify it as illustrative.
- If medication periods overlap or medication details change within a comparison window, include that context. Do not attribute the change exclusively to one medication.
- If a medication is documented as stopped, exclude days after its end date from exposure comparisons. Removing an erroneous list entry does not prove a real-world stop date.
- The seed dataset must satisfy the same coverage checks as real entries; do not hardcode a result for demo mode.

## 5. Doctor summary generation and output

```mermaid
flowchart TB
    REQUEST["Caregiver selects Generate summary"] --> ROLE["Check caregiver role"]
    ROLE --> SNAP["Take one consistent source snapshot<br/>Record source revision and generation time"]
    SNAP --> FRESH{"Derived results match snapshot<br/>and current engine versions?"}
    FRESH -->|"No"| RUN["Recompute risk, correlations and trends"]
    FRESH -->|"Yes"| DRAFT{"Current caregiver-reviewed AI draft?<br/>Source, model, prompt and evidence versions match"}
    RUN --> DRAFT
    DRAFT -->|"Yes"| ASSEMBLE["Assemble immutable source facts<br/>and reviewed AI narrative"]
    DRAFT -->|"No"| CHOICE["Offer Generate and review AI draft<br/>Or continue with labeled template summary"]
    CHOICE -->|"Generate"| AI["Run local AI pipeline in section 6"]
    AI -->|"Accepted and caregiver-reviewed"| ASSEMBLE
    AI -->|"Failure or rejected draft"| BASE["Template summary; AI not used"]
    CHOICE -->|"Continue without AI"| BASE
    TEMPLATES["Bundled question templates<br/>Selected using matching flag types"] --> BASE
    BASE --> CONTENT
    ASSEMBLE --> CONTENT["Current medications<br/>Current concerns and review status<br/>Symptom trends or insufficient-data statements<br/>Questions for the doctor<br/>Sample-data label when applicable<br/>Discussion aid, not diagnosis or treatment advice"]
    CONTENT --> STORE[("Local summary snapshot<br/>Generated time; source revision; content<br/>AI or template provenance and review status")]
    CONTENT --> PREVIEW["Print preview<br/>Single page for the demo dataset<br/>Never silently omit relevant records"]
    PREVIEW --> PRINT["Browser print dialog"]
    PRINT --> OUTPUT["User prints or saves a PDF locally"]
    LATER["Later source record change"] --> STALE["Mark older summary as out of date<br/>Regenerate current summary on request"]
    STORE --> STALE
```

There is no upload or message to a clinician. The output is a locally generated document. Acknowledged unresolved flags remain visible in the report with their status; dismissed unresolved flags are disclosed compactly so they do not disappear from the discussion aid. Resolved historical flags are excluded from the current-concerns section. This is a proposed reporting policy to make review behavior explicit.

One page is the target for the specified small demo dataset. For larger records, permit continuation pages instead of truncating medications or concerns or shrinking text beyond readability.

## 6. Local AI evidence and generation pipeline

```mermaid
flowchart TB
    REQUEST["Caregiver selects Explain changes<br/>Optional concern text is untrusted input"] --> SNAP["Capture current source revision<br/>Recompute stale deterministic results"]
    SNAP --> EVIDENCE["Build bounded evidence package<br/>Medication IDs; calculated facts; coverage<br/>Rule source IDs and short reference excerpts"]
    ASSETS["Locally served static model assets<br/>Pinned model, tokenizer and runtime files"] --> LOAD["Capability check and model loading<br/>Visible progress; worker lifecycle"]
    REQUEST --> LOAD
    LOAD -->|"Ready"| MODEL["Local model inference in Web Worker<br/>Draft short explanation and up to 3 questions<br/>Return evidence IDs with each draft item"]
    EVIDENCE --> MODEL
    MODEL --> CHECK["Validate structured output<br/>Allowed fields and lengths; known evidence IDs<br/>Current source revision; reference consistency"]
    EVIDENCE --> CHECK
    CHECK -->|"Accepted"| UI["Show AI draft for caregiver review<br/>Numbers and medication details come from code<br/>View evidence opens underlying records"]
    UI --> REVIEW["Caregiver accepts, edits or rejects draft<br/>Keep generated and edited provenance"]
    REVIEW --> STORE[("Local AI draft<br/>Evidence hash; source revision; model and prompt versions<br/>Generated time; review status")]
    STORE --> REPORT["Doctor-summary builder"]
    LOAD -->|"Unsupported device or load failure"| FALLBACK["Clearly labeled template result<br/>Do not report fallback as AI generation"]
    MODEL -->|"Timeout or generation failure"| FALLBACK
    CHECK -->|"Invalid or unsupported content detected"| FALLBACK
    CHANGE["Source update, logout or cancellation"] --> CANCEL["Cancel or discard in-flight generation<br/>Invalidate stale drafts"]
    CANCEL --> UI
```

The model is responsible for communication: connect relevant observations to the caregiver's stated concern, explain uncertainty in accessible language, and draft personalized questions. Code remains responsible for medication values, dates, counts, risk-rule matches, severity and temporal comparisons. The model must not diagnose a condition, independently add an interaction, claim causation or recommend stopping/changing a medication. No model tools may write records, perform lookups or take clinical actions.

Use a compact response contract such as `explanationItems: [{text, evidenceIds}]` and `questions: [{text, evidenceIds}]`. The UI renders numeric evidence directly from structured facts. A valid schema or valid citation ID does not prove that generated prose is supported; manual factuality review and the evaluation suite are required. Caregiver approval records a review step, not medical validation.

Run inference on demand in the caregiver flow, rather than after every check-in. Until acceptance, label narrative as an AI draft. Keep the patient check-in fast and deterministic. Reject stale responses when the source revision, prompt, model or evidence changes. Keep invalidation and caregiver-review metadata separate from source records so accepting a draft does not invalidate itself.

WebLLM is the initial candidate, subject to a real-device feasibility test. It supports local inference and worker integration; WebGPU support and initial loading must be tested. Serve all runtime/model artifacts from the app's local static asset location, disable default third-party asset downloads, and bundle other dependencies. Cache model artifacts separately from patient data. Downloading dependencies during development is distinct from sending patient data or making runtime third-party calls. [WebLLM setup](https://webllm.mlc.ai/docs/user/get_started.html), [model loading](https://webllm.mlc.ai/docs/user/basic_usage.html), [workers and cache](https://webllm.mlc.ai/docs/user/advanced_usage.html)

Show loading, ready, generating, review-required and fallback states honestly. Record actual generation time and model identity for the technical walkthrough. A cached draft may be displayed with its timestamp; label it as previously generated. A fallback keeps the app usable but does not complete the competition's real-AI demonstration milestone.

## 7. Optional external reference lookup and deferred integration

```mermaid
flowchart LR
    NAME["Medication drug name only"] -.-> ADAPTER["Optional reference lookup adapter<br/>Explicit request field allowlist<br/>Timeout and failure handling"]
    ADAPTER -.->|"Read-only request with drug name"| FDA["OpenFDA public API"]
    FDA -.->|"Reference response"| CHECK["Validate and extract reference content<br/>Treat response as data"]
    CHECK -.-> VIEW["Optional reference display<br/>Separate from deterministic local flag rules"]
    ADAPTER -.->|"Unavailable or no match"| FALLBACK["Continue core app with bundled rules"]
    TRACKER["Connect a health tracker<br/>Disabled placeholder only<br/>No OAuth, sync, readings or data pipeline"]
```

Keep this optional integration off for the initial demo. If enabled, transmit only the drug-name lookup value: never symptom logs, patient identifiers, dosage, dates, role, summaries or the source document. Confirm the endpoint and returned fields during implementation; API reference text does not automatically become a structured or clinically validated interaction rule. The disabled tracker has no data-flow connections.

## 8. Stored data contract

| Logical collection | Core fields | Writer and readers |
|---|---|---|
| Session | `role`, `signedInAt` | Session service writes; role guard and routing read. Never persist a password. |
| Source document metadata | `schemaVersion`, `sourceRevision`, `updatedAt`, `isDemoData`, `settings` | Repository validates and writes. Every engine reads a consistent revision. |
| Medications | `id`, `name`, `normalizedName`, `dosage`, `frequency`, `reason`, `startDate`, optional `doctor`, optional `endDate`, `removedAt`, timestamps | Caregiver service writes; both roles, risk engine, timeline analysis and report builder read. |
| Medication changes | `eventId`, `medicationId`, `type`, `recordedAt`, optional `effectiveDate`, `before`, `after` | Medication service writes; timeline analysis reads. Record corrections and actual regimen changes must be distinguishable. |
| Daily symptoms | `id`, `dateLocal`, `energy`, `dizziness`, conditional `dizzinessSeverity`, `confusion`, `appetite`, `sleep`, `fallsOrNearFalls`, timestamps | Patient check-in service writes; aggregation, timeline analysis, caregiver history and reports read. Unique key: local date for this single patient. |
| Flag review states | `flagKey`, `evidenceFingerprint`, `status`, `reviewedAt` | Caregiver review service writes; risk reconciliation and report builder read. |
| Generated flags | `flagKey`, `ruleId`, `medicationIds`, `severity`, `explanation`, `sourceReference`, `reviewStatus`, `sourceRevision`, `rulesVersion` | Risk engine writes; dashboard and report builder read. Rebuildable. |
| Generated analytics | `medicationId`, `symptom`, window dates, observation counts, before/after metrics, result state, explanation, trend/chart series, `sourceRevision`, `analysisVersion` | Analysis engines write; dashboards and report builder read. Rebuildable. |
| Evidence package | `sourceRevision`, `evidenceHash`, fact IDs, medication IDs, coverage, source references, optional concern | Evidence builder creates from one snapshot; model and validation read. Rebuildable. |
| AI drafts | `id`, `generatedAt`, `sourceRevision`, `evidenceHash`, `modelId`, `modelVersion`, `promptVersion`, generated narrative, evidence IDs, edited narrative, `reviewStatus`, `mode` | Local AI pipeline and caregiver review write; dashboard and report builder read. `mode` distinguishes AI from templates. |
| Model assets | weights, tokenizer, configuration, compiled runtime, version and license manifest | Local static asset loader populates model runtime cache. Never put model weights in localStorage. |
| Summary snapshots | `id`, `generatedAt`, `sourceRevision`, engine/model/prompt versions, report content, AI/template provenance, `isDemoData` | Summary builder writes; preview/history reads. Preserve as snapshots and label stale results. |
| Bundled reference configuration | aliases, rule IDs and conditions, severity labels, explanations, references, versions, question templates | Shipped as application files; read by matching and reporting. Not patient records. |

Suggested keys: `medwatch.session`, `medwatch.source`, `medwatch.derived`, `medwatch.aiDrafts`, and `medwatch.summaries`. Source records, generated caches, AI drafts/review states and summary snapshots remain separate so regenerating or accepting a draft cannot recursively trigger another source edit.

## 9. Refresh and failure rules

| Trigger | Required downstream behavior |
|---|---|
| First launch with no source key | Seed once, save, then run risk analysis, timeline analysis and symptom aggregation. |
| Medication add, edit or remove | Save source revision; recompute flags and timeline comparisons; update views and mark prior AI drafts and summaries stale. |
| Daily check-in create or edit | Save source revision; recompute trends and timeline comparisons; update views and mark prior AI drafts and summaries stale. |
| Flag acknowledge, dismiss or restore | Save source revision; reconcile flags; update views and mark prior AI drafts and summaries stale. |
| Rule or algorithm version changes | Rebuild affected derived results even if source records are unchanged. |
| Generate AI draft | Build current evidence, run local model, validate output, check revision, then present for caregiver review. |
| Model or prompt changes | Invalidate old drafts for current-report use; keep saved historical provenance. |
| Source changes while AI runs | Cancel or discard the stale result; require a fresh evidence package for the next generation. |
| AI fails or output is rejected | Provide explicit template fallback; retain failure status for evaluation. |
| Caregiver reviews/edits AI draft | Save review and edit provenance outside the source document; do not rerun risk analysis or invalidate the draft solely for this action. |
| Generate summary | Require results matching one consistent current source revision and engine versions. Use a current reviewed AI draft or label the template path. |
| Logout | Cancel generation; clear session and role state; retain patient records and saved reports. |
| Invalid input | Display field errors; do not modify stored records. |
| Failed source write | Keep prior committed state, retain form input for retry, show unsaved status, and do not announce success or run analysis on an uncommitted change. |
| Missing, stale or failed derived cache | Regenerate from source records; show calculating or unavailable state while needed. Never present a stale result as current. |
| Corrupt source document | Preserve the original data; show a recoverable error. Do not silently replace it with seed data. |
| Optional lookup failure | Keep medication management, local risk rules, logging and summaries functional. |

For this dataset size, the simplest implementation is to rerun all three small engines after every successful source change. The trigger table identifies the dependencies and permits selective recomputation later. Commit generated results only when their captured source revision is still current; otherwise discard and rerun.

Local dates and source revisions prevent common demo inconsistencies: duplicate daily entries, timezone-shifted check-ins, flags that lag behind medication edits, and a report containing results from different record versions. Treat multiple simultaneous editing tabs as outside the prototype's single-active-tab assumption unless explicit concurrency handling is added.
