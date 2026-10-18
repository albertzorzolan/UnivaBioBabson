# Kinwise: intended use, regulatory positioning, privacy and safety language

Condensed from the team's research notes in
[kb-src/research/regulatory.md](../kb-src/research/regulatory.md) (sources checked 2026-10-10; cached copies of
primary documents in `kb-src/research/regsrc/`). **This is a student hackathon analysis, not legal advice.** Kinwise
has not been reviewed by the FDA or by regulatory counsel, and we do not claim that it is exempt from regulation.

## 1. Intended use

> Kinwise is a preparation and documentation tool for families caring for an older adult who takes several
> medicines. It helps the older adult and their caregiver keep a medication list, record day-to-day symptoms in
> their own words, see when recorded symptoms changed around medicine start and stop dates, and see published
> medication information, such as which medicines appear in the AGS Beers Criteria® 2023, each with its source, so
> that they can bring clear questions to their pharmacist or doctor. It produces a visit brief that the caregiver
> reviews before sharing with the clinician.
>
> Kinwise does not diagnose, does not tell anyone to start, stop or change a medicine or dose, does not say that a
> medicine caused a symptom, does not assess how urgent something is, and does not produce a personal risk
> prediction. All decisions are made by the clinician with the patient and family. If something feels like an
> emergency, call 911.

**Intended users:** family caregivers and the older adult (record keeping and preparation); the receiving
clinician or pharmacist (the visit brief and FHIR export). **Not intended for:** emergencies, triage, dosing,
hospital or long-term-care use, or use without a clinician.

## 2. FDA: how we designed the product to fit published categories

Intended use is judged from labeling, advertising and other statements (21 CFR 801.4), so the product copy, not
only the code, decides where software falls. Three FDA documents matter:

- **Policy for Device Software Functions and Mobile Medical Applications** (Sept 2022, current as of 2026-10-10) with
  its lists of examples that are *not* devices (Appendix A) and those where FDA intends to exercise *enforcement
  discretion* (Appendix B). https://www.fda.gov/media/80958/download
- **Clinical Decision Support Software** guidance (final, issued 29 Jan 2026). https://www.fda.gov/media/109618/download
- **General Wellness: Policy for Low Risk Devices** (final, 6 Jan 2026). https://www.fda.gov/media/90652/download

### 2.1 Why the caregiver-facing parts are not positioned as "Non-Device CDS"

Under FD&C Act §520(o)(1)(E), software is excluded from the device definition only if it meets **all four**
criteria (CDS guidance §II):

1. it does not acquire, process or analyze a medical image, an IVD signal, or a pattern or signal from a
   signal-acquisition system;
2. it displays, analyzes or prints medical information about a patient or other medical information (such as
   clinical practice guidelines);
3. it supports or provides recommendations **to a health care professional** about prevention, diagnosis or
   treatment;
4. it enables that professional to **independently review the basis** of the recommendations, so they do not rely
   primarily on them.

The 2026 guidance states that software functions that support or provide recommendations to patients or caregivers,
not HCPs, meet the definition of a device. So the screens Alex sees **cannot** rely on criterion 3. Instead we
designed each caregiver-facing function toward FDA's published examples:

| Kinwise function | Closest published FDA example | Guardrail in Kinwise |
|---|---|---|
| Medication list, symptom diary | Appendix A #12: simple tools to organize and record health information, without recommendations to change a prescribed treatment | Records only; no suggestion to change therapy anywhere in the app |
| Diary extraction from the person's own words | Appendix A #12 (recording events and emotional state) | Extraction only; the person confirms each answer; no interpretation or severity triage |
| Before/after timeline | Appendix B #12–13: trending and displaying personal health incidents | Counts with answered-day denominators; a fixed caveat that it describes a change in what was recorded; no alerts; no likelihood or causal language |
| Beers, ACB, fall-risk and cascade prompts | Appendix B #18: information about drug interactions and relevant safety information as a report based on age, clinical information and current medications; #6: screening information from well-known authorities | Phrased as information to discuss, with source and version on every prompt, and the line "Don't stop or change any medicine without talking to the prescriber" |
| "Questions to ask" and the visit brief as a communication aid | Appendix A #3 (help patients ask appropriate questions) and #13 (help patients document and communicate to health care professionals) | Neutral, open questions only |
| FHIR export, backup file | Appendix A #8–9 (transferring, storing and displaying data) | User-initiated only |
| "Call 911" line | Appendix A #3 (emergency hotline information) | Static; never triggered by what was recorded |

The timeline's statistical tests and "moderate"/"strong" labels go further than simple trend display. Together with
the cascade prompts, this is the function we would most need a regulatory assessment for. It reports a difference in
what was recorded, with counts and the measured false-alarm rate, and never a likelihood that a medicine is
responsible.

Appendix B functions may still be devices; enforcement discretion is a statement of FDA's current intent, not an
exemption. The cascade prompts sit closest to the edge of #18, so they describe published patterns and ask the
clinician whether one applies, rather than stating that it happened.

### 2.2 The clinician-facing brief

The visit brief and FHIR export are addressed to the clinician or pharmacist, so we designed them toward the four
Non-Device CDS criteria: no images or signals (1); patient information plus cited guideline material (2); output
for an HCP, of the kinds FDA lists under criterion 3 such as "patient data reports and summaries" and matching
patient information to clinical guidelines (3); and the basis shown for every item: the rule, the source with
version, the records each number comes from, data limitations, and that the data are family-reported and
unverified (4). The 2026 guidance treats time-critical outputs as failing criterion 4; Kinwise produces none.
Whether the brief actually meets the criteria is FDA's determination, not ours.

### 2.3 General Wellness does not fit

The 2026 General Wellness guidance excludes products whose labeling or functions reference specific diseases,
clinical conditions or treatment guidance. Kinwise names specific medicines and conditions, so we do **not**
position it as a general-wellness product. Only a stripped-down sleep, energy and appetite journal with no
medication link could be argued to fit there.

### 2.4 Red lines we stay away from

Each of these would move Kinwise toward actively regulated device territory, and each is blocked in code or copy:

- dose calculation, kidney-function dose adjustment or taper schedules (Kinwise uses CrCl only to decide whether a
  published kidney rule applies, and never suggests a dose);
- "stop", "switch" or "start" directives to a lay user;
- statements that a symptom is likely caused by a medicine, or a likelihood score (FDA's own device example
  analyzes symptoms to assess a patient's likelihood of digoxin toxicity);
- urgency triage driven by symptom content;
- personalized risk predictions;
- analysis of sensor or wearable signals;
- marketing claims that it prevents falls, reduces adverse drug events or detects side effects.

### 2.5 AI disclosure

The 2026 CDS guidance does not specifically address generative AI. FDA's Digital Health Advisory Committee
(Nov 2025) discussed clear disclosure that the user is interacting with AI and defined limits. Kinwise labels every
AI output ("AI draft · on this device · model · time"), restricts the model to rewording verified evidence, and
requires human review before anything reaches the brief.

## 3. Privacy

### 3.1 Architecture

- No Kinwise server, account, analytics, pixels or error telemetry. The record lives in the browser's
  `localStorage` on the user's device.
- The only network requests the app can make beyond its own files are downloads of the optional model files from
  Hugging Face and GitHub, which carry no personal data. The Content Security Policy in `index.html` blocks other
  destinations, and the end-to-end test fails on any request to another origin (with the AI off).
- Data leaves the device only when the user prints, downloads the FHIR file or exports a backup.
- Settings offers export, import and "Delete everything".

### 3.2 HIPAA

HIPAA applies to covered entities (health plans, clearinghouses, most providers) and their business associates.
Under HHS OCR's health-app scenarios, a developer of an app that a consumer selects and controls for their own data
is generally not a business associate, including when the consumer sends data to their provider. That would change
if a health plan, pharmacy or provider **contracted** with us to offer Kinwise to its members; HIPAA Security Rule
obligations and a business associate agreement would then apply to that offering.
https://www.hhs.gov/sites/default/files/ocr-health-app-developer-scenarios-2-2016.pdf

We make **no HIPAA-compliance claim**. The accurate statement is: no server, no account, data stays on this device.

### 3.3 Other rules that can apply to consumer health apps

- **FTC Act §5 and the FTC Health Breach Notification Rule** (16 CFR Part 318, amended 2024): may cover apps that
  can draw health data from multiple sources; an unauthorized disclosure, such as a tracking pixel, counts as a
  breach. Having no trackers and no server removes most of this exposure.
- **Washington My Health My Data Act** (RCW 19.373): covers data about medication use and symptoms; requires
  consent for collection and separate consent for sharing, plus a consumer health data privacy policy.
- **California CMIA §56.06(b)**: software that keeps medical information for the individual's own management is
  treated as a provider of health care for confidentiality purposes.

### 3.4 What is still missing for real users

- Encryption of the local record at rest (today it is plain JSON in `localStorage`) and an optional passcode for
  shared devices.
- A published consumer health data privacy policy linked from the start screen.
- End-to-end encrypted sharing between family members (today the record is in one browser).
- Subresource Integrity for any third-party file, and a review of the model download path.

## 4. Health-language rules (SPEC §3)

These rules apply to every user-facing string: UI copy, knowledge-base text, engine output and AI output.

| We write | We never write |
|---|---|
| "Dizziness was recorded on 9 of 14 answered days after lorazepam was started, compared with 2 of 19 before." | that a medicine caused or is causing a symptom |
| "Listed in the AGS Beers Criteria® 2023 as a medicine older adults should generally avoid. Worth asking about." | that a medicine or combination is safe, unsafe or dangerous |
| "Could the lorazepam started on Sep 25 be contributing to the dizziness recorded since then?" (a question for the clinician) | stop, start or change advice; dose advice |
| "Don't stop or change any medicine without talking to the prescriber. If something feels like an emergency, call 911." | "urgent", triage levels or deadlines |
| "Anticholinergic burden score (ACB)" (a published scale applied to the medicine list) | a diagnosis, or a "risk score" for the person |
| "not in Kinwise's reference set" for an unknown medicine | anything implying an unflagged medicine is free of risk |
| | claims of FDA clearance, HIPAA compliance or clinical validation |

Where they are enforced:

- `kb-src/build_kb.py` refuses to build a knowledge base containing banned wording.
- The review engine runs `guardLanguage` over every finding (`src/engine/meds/text.ts`).
- The claim verifier (`src/engine/brief/verify.ts`, `BANNED_PATTERNS`) is designed to drop AI sentences with causal, advice,
  urgency, reassurance, diagnosis, regulatory-claim or risk-score wording.
- Ask routes treatment, dose, diagnosis, cause, safety, urgency and prediction questions to a fixed redirect
  (`src/engine/brief/qa.ts`).
- The end-to-end test `language-rules` scans the rendered app for the banned words.

Known gap: the 2026-10-11 live AI run found one AI explanation that said "can cause" about the person's medicines
and suggested they "might be able to replace some" of them "to reduce these risks"; neither was caught (see [EVALUATION.md](EVALUATION.md) §5).

## 5. Other real-world issues

- **Beers Criteria licensing.** "AGS Beers Criteria®" is a registered mark, and AGS limits electronic reproduction.
  For this educational, non-commercial prototype the KB stores drug names, classes, thresholds and ratings with
  Kinwise's own paraphrased rationale and cites the publication (doi:10.1111/jgs.18372). A real product would need
  an AGS licence or partner, or openly licensed sources such as FDA labeling via DailyMed.
- **Name.** The product was renamed from its working name "MedWatch" because FDA MedWatch is FDA's adverse-event
  reporting program and there are third-party trademark filings for that name. Kinwise is not affiliated with the
  FDA or its MedWatch program. A future feature could prepare a Form FDA 3500B draft that the family submits
  themselves (the form allows someone else to fill it in); it is an idea only (not built, and not on the Planned
  row of the Status table in README.md), and it would never submit automatically.
- **Model licence.** The default on-device model, Qwen2.5-3B-Instruct, is under the Qwen Research License; commercial
  use would need a different model or licence.

## 6. What would be needed before real-world use

1. **Clinician review of the knowledge base** by geriatric pharmacists and physicians, with a documented update
   process when the Beers Criteria, labels or cascade evidence change.
2. **A validation pilot (planned, not started; listed as "a validation pilot" in the Planned row of submission/DEVPOST.md's Status table).** Kinwise has not
   been tested with real patients, caregivers or clinicians. The design below would be pre-registered (sample size,
   analysis plan and endpoints) before enrolment, with consent and ethics review:
   - **Step 1, accuracy and usefulness:** pharmacists rate the accuracy and usefulness of briefs built from
     consenting caregivers' diaries (with extraction accuracy measured on that real writing, and usability testing
     with the caregivers).
   - **Step 2, endpoints:** primary, the share of visits in which the clinician discusses at least one flagged
     medicine; secondary, pharmacy-fill changes for flagged Beers medicines at 6 months, the 6-month endpoint used by
     EMPOWER (benzodiazepine discontinuation) and D-PRESCRIBE (no longer filling the inappropriate prescription).
   - **Safety (planned):** adverse events after any change the clinician makes (for example withdrawal symptoms,
     falls, ED visits) are recorded and reviewed; any change is the clinician's decision, never Kinwise's.
   - **Path to users (planned):** pharmacists doing Medicare Part D Comprehensive Medication Reviews (42 CFR 423.153;
     kb-src/research/regulatory.md §5.1: the CMR may be done with the caregiver when the beneficiary cannot take part
     because of cognitive impairment), and caregiver organisations.

   Outcome claims (fewer falls, fewer adverse drug events) would need a separate trial; the evidence base for the
   approach (for example EMPOWER, 27% vs 5% benzodiazepine discontinuation, and D-PRESCRIBE, 43% vs 12%
   discontinuation of potentially inappropriate medicines, after education aimed at patients (EMPOWER; the booklet included a stepwise taper plan) or at patients plus a
   pharmaceutical opinion sent to their physicians (D-PRESCRIBE)) is a reason to study it, not proof that Kinwise
   works. Kinwise gives no taper plan; that stays with the clinician.
3. **A regulatory assessment** by qualified counsel of each function against the current FDA guidance, the
   Digital Health Policy Navigator, and, if needed, a pre-submission discussion with FDA.
4. **Privacy and security work** listed in §3.4, plus a threat model and a third-party security review.
5. **Licensing** of the Beers Criteria (or an alternative source) and of the language model.
6. **Labeling and support**: intended-use statement, instructions, limitations and a route for users to report
   problems.
7. **Quality management** proportionate to the final regulatory classification (design controls, risk
   management, change control for the knowledge base and the model).

Until then, Kinwise is a hackathon prototype for fictional demo data only.
