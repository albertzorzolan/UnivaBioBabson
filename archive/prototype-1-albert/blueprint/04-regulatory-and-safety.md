# U.S. regulatory and safety design brief

Reviewed 25 September 2026. This is a product-design risk assessment based on primary public sources, not a legal opinion, clinical validation, FDA determination or guarantee of compliance. Applicable obligations depend on the implemented functions, intended use, claims, business relationships, data flows and jurisdictions. Obtain qualified U.S. healthcare regulatory/legal review and clinical review before real-patient use or public health-advice claims.

## 1. Findings that change this design

### FDA: assess each intended function

FDA evaluates software by function and intended use across platforms. Its policies distinguish non-device functions, device functions under enforcement discretion, and functions subject to active device oversight. A browser or local model does not settle the classification. A “not medical advice” notice cannot substitute for examining actual behavior and claims. The last statement is our design inference from the function-based framework. [FDA software overview](https://www.fda.gov/medical-devices/digital-health-center-excellence/device-software-functions-including-mobile-medical-applications)

FDA's Clinical Decision Support guidance issued January 29, 2026 describes an exclusion with four criteria, including recommendations to healthcare professionals and their ability to independently review the basis. A consumer/caregiver medical-advice function does not automatically qualify merely because it cites sources or is later shown to a doctor. [FDA CDS guidance](https://www.fda.gov/media/109618/download)

Failing the CDS exclusion does not by itself establish that every function is a regulated device: other exclusions and enforcement policies can apply. FDA specifically discusses simple tools for documenting and communicating health information. Whether the added AI behavior remains within such a category requires reviewing the actual function. [FDA CDS FAQs, particularly Q1 and Q4](https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs)

The January 2026 general-wellness guidance concerns low-risk healthy-lifestyle functions and relevant statutory exclusions. Do not assume a medication/symptom interpretation product qualifies simply by calling it wellness. [FDA general-wellness guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)

FDA guidance describes agency thinking and is generally nonbinding; underlying statutes and regulations can impose binding obligations. This blueprint therefore uses “proposed lower-risk scope,” not “FDA compliant,” “FDA exempt” or “FDA approved.” No hackathon or synthetic-data label is assumed to provide a blanket legal exemption.

### HIPAA: organizational relationships matter

HIPAA analysis depends on covered-entity/business-associate relationships and what the developer does on their behalf. An individual choosing an app does not automatically create a business-associate relationship. Provider-sponsored operation can change that analysis. Local-only storage is not a HIPAA certification and does not settle applicability. [HHS app relationship guidance](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-a-covered-entity-to-enter-into-a-business-associate-agreement.html)

The prototype has no provider contract or clinical workflow integration specified, so HIPAA status remains a documented assessment item, not an assumed blanket exemption. Hardcoded credentials and unencrypted application storage are not suitable evidence for a HIPAA-compliance claim.

### FTC: privacy and health claims still require attention

Certain non-HIPAA health apps may fall under the FTC Health Breach Notification Rule. Coverage includes consideration of whether an identifiable personal health record has the technical capacity to draw from multiple sources; unauthorized disclosure can matter as well as hacking. Applicability and any incident-response duties must be assessed for actual deployment. [FTC HBNR business guidance](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0)

In September 2026, FTC withdrew the older 2021 policy statement while explaining that the 2024 rule amendments already covered the relevant health-app issue. Do not interpret that withdrawal as removal of the amended rule. [FTC announcement](https://www.ftc.gov/news-events/news/press-releases/2026/09/ftc-withdraws-obsolete-policy-statement)

Health-product marketing must be truthful, not misleading and appropriately substantiated, considering express and implied messages. A prototype cannot claim prevented falls, accurate diagnosis or clinical effectiveness from synthetic tests or a few usability sessions. [FTC Health Products Compliance Guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance)

### State scope remains open

State consumer-health privacy laws can cover information outside HIPAA; Washington's My Health My Data Act is one example to assess against actual collection, users and operations. It is not the only jurisdiction to consider. Professional-practice, consumer-protection and AI-disclosure issues also belong in a deployment-specific legal review; this memo is not a 50-state survey. [Washington Attorney General privacy hub](https://www.atg.wa.gov/data-privacy)

## 2. Function decisions for this prototype

The following are conservative project decisions, not FDA classifications or statements that a deferred function is always unlawful.

| Function | Active design | Reason and outstanding assessment |
|---|---|---|
| User-entered diary and medication list | Included with explicit confirmation | Documentation purpose; inspect any derived interpretation separately |
| AI transcription of typed symptom descriptions into draft fields | Included as a reviewed draft | Meaning can change through extraction; preserve source text and never infer diagnosis |
| Adaptive documentation questions | Included from a fixed question bank | No diagnostic interview, medical-risk ranking or triage recommendation |
| Descriptive symptom counts and selected-window comparisons | Included with denominators and uncertainty | Present observations only; do not market as adverse-event detection or causal inference |
| AI summaries and record Q&A | Included within supplied record evidence | Grounding and user review reduce errors but do not establish a legal classification |
| General educational source explanation | Included without patient context | Do not transform general content into a personalized safety recommendation |
| AI-generated visit narrative/questions | Included after review | No recommended drug, test, dose, diagnosis or care timeframe, including within a question |
| Personalized interaction or polypharmacy risk engine | Deferred; disabled in active release | Needs specific clinical and regulatory analysis; remove prior severity-tier output |
| Symptom checker producing likely conditions | Deferred; disabled | Different clinical intended use from documentation |
| “Seek care in X hours,” clinical urgency score or reassurance | Deferred; disabled | No personalized triage or inferred permission to wait |
| General user-initiated emergency help | Included as static content | Available independently of inference; no promise of detection or clinician notification |
| Dose changes, deprescribing plan or treatment recommendations | Deferred; disabled | Not within this prototype's intended use |
| Continuous monitoring, wearable analysis or EHR decision support | Deferred; disabled | Requires a new system, evidence, privacy and regulatory assessment |

The previous plan's “worth monitoring / discuss next visit / discuss soon” risk tiers must not survive as renamed urgency cards. General source material may be browsed without producing a personal severity label. No clinical scoring service is wired into the release build. Future regulated functions must not be enabled by a cosmetic settings toggle.

## 3. User-facing safety copy and behavior

Copy below is proposed for review; it is not an approved clinical protocol.

- **Demo notice:** “Fictional-data prototype. Please do not enter real health information.”
- **Check-in boundary:** “Record what you noticed. This tool does not diagnose symptoms or choose treatment.”
- **Model proposal:** “Suggested from your words. Please check before saving.”
- **Record comparison:** “This compares recorded days. It does not show what caused a change.”
- **No records:** “There are not enough answered entries for this comparison.” Never substitute “No concerns found.”
- **Visit document:** “Prepared from user-entered records with AI assistance. Reviewed by [patient/caregiver role]. For discussion with a healthcare professional.”
- **Always-visible monitoring limit:** “No one is monitoring these entries. This app does not contact a clinician.”
- **Help panel:** “If you think this is a medical emergency, call 911 in the U.S. Do not wait for this app.” Keep emergency assistance independent of model completion. [911.gov](https://www.911.gov/calling-911/)
- **Treatment request:** Explain that the tool can record the concern and prepare questions but cannot choose treatment or medication changes. Offer those actions without generating a clinical answer.

Do not infer whether a symptom is or is not an emergency. There is no “passed emergency screen” state. A model cannot hide or downgrade the help control, and its failure cannot prevent access to the static help information.

## 4. Risk register and required controls

| Hazard | Control | Verification evidence |
|---|---|---|
| H01: AI changes negation, speaker, date or severity | Source spans; unknown values; clarification; patient confirmation | Capture fixtures including negation, relatives, historical statements and ambiguity |
| H02: Missing answers become healthy values | Nullable fields; per-metric denominators | Incomplete and zero-baseline cases |
| H03: AI introduces diagnosis, cause, treatment or urgency | Bounded operations; no such schema fields; content checks; rejected-output fallback | Adversarial advice and causal-attribution cases plus manual semantic review |
| H04: A false claim has a valid citation ID | Check whether evidence supports meaning, not merely ID existence | Human support ratings and wrong-reference fixtures |
| H05: Stale text enters the report | Request fingerprint; source invalidation; immutable report snapshot | Editing, deletion, role-switch and reset during generation |
| H06: A summarized record omits a user concern | Code includes pinned notes separately; full history accessible | Pinned-concern coverage case |
| H07: User thinks the app watches for emergencies | Persistent monitoring limit; static help; no clinical alerts | UI comprehension test and model-failure scenario |
| H08: Private text leaves the browser | Local artifacts, no telemetry, fixed sources, no remote model | Network observation and canary data test |
| H09: A model command modifies data or leaks content | No tools; fixed operation allowlist; text escaping; user confirmation | Prompt-injection, unknown-key, HTML and unauthorized-action cases |
| H10: Deletion leaves sensitive derivatives | Dependency cleanup across drafts, reports, indexes and memory | Delete-and-inspect scenario; exported-file limit disclosed |
| H11: Prototype role switch appears to be secure authentication | Demo-only framing; synthetic-data restriction | Copy review and deployment gate |
| H12: Marketing overstates accuracy, novelty or health benefit | Claim register; implemented/planned distinction; documented evidence | Review app, video, README and PDF against measured results |

Residual risks remain, including subtle hallucination, user misunderstanding, missed ambiguity and device/browser failures. Do not describe content filtering or user confirmation as eliminating these risks.

## 5. Data controls

No real patient information is used for development, model evaluation, recordings or usability tasks in this release. Synthetic examples are labeled. No analytics SDK, advertising identifier, location access, remote error reporter, online speech service or session replay is included.

Store minimal records, disclose local persistence and shared-device limitations, provide deletion and identify the limits of clearing exported files/backups. Model assets and patient data have separate caches. Do not log raw stories, prompts or generated health text in production-like browser consoles. Use synthetic-only evaluation files.

Before any real-data pilot, document threat model, access control, storage protection, consent/authorization, caregiver access, retention/deletion, security testing, incident response, provider relationships and applicable state/federal obligations. A new cloud component, wearable connector, clinical partner or child audience reopens that review.

## 6. Release gates and ownership

| Gate | Owner | Evidence required | Current status |
|---|---|---|---|
| G0: Intended use and feature boundary | Product lead | This spec, UI claims and release policy agree | Specified; not implemented |
| G1: Technical safeguards | Engineering lead | Contract, role, freshness, storage, network and deletion tests | Not run |
| G2: Clinical content and wording | Qualified clinical reviewer | Reviewed source register, question bank, help text and documented feedback | Not reviewed |
| G3: Regulatory/privacy assessment | Qualified U.S. counsel/regulatory advisor | Function-by-function determination and jurisdiction/data-flow review | Not assessed |
| G4: Evaluation and usability | Evaluation lead | Recorded results, failures and changes; clear limitations | Not run |
| G5: Competition release | Team | Fictional-data build; truthful submissions; known-limit disclosure | Not built |
| G6: Any real-patient deployment | Product, clinical, legal and security owners | Actual applicable requirements fulfilled, including any needed FDA pathway and validated controls | Out of current scope |

Competition release planning does not authorize a real-patient pilot. If the team cannot obtain external review before the event, say that plainly, retain the fictional-data scope, and avoid claiming clinical validation or legal compliance. Whether any additional obligations apply even to distribution of the prototype is a fact-specific question for review.

## 7. Claim register

Permissible only when actually demonstrated: “runs the model locally,” “turns typed descriptions into user-confirmed draft records,” “links summaries to their inputs,” “supports a printable discussion document,” and accurately reported task times/test outcomes.

Do not claim: “FDA approved,” “HIPAA certified,” “fully compliant,” “detects dangerous interactions,” “predicts falls,” “prevents hospitalization,” “diagnoses medication overload,” “clinically validated,” or “safe to use for medical decisions” without the specific evidence and authorization each claim requires. Do not imply these claims through warning colors, urgency labels, a “medical assessment” title or an AI accuracy percentage based only on synthetic cases.

Keep the working name MedWatch internal until a distinct presentation name is selected; FDA uses MedWatch for its own safety-reporting program. Avoid implying affiliation. [FDA MedWatch](https://www.fda.gov/about-fda/medical-product-safety-information/medwatch-forms-fda-safety-reporting)
