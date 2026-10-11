# MedWatch (working name): regulatory, privacy, interoperability and real-world deployment research

Prepared 2026-10-10 for the UnivaBio hackathon revamp (deadline 2026-10-13 23:45 EDT).
Scope: a local-first, in-browser caregiver co-pilot for older adults on many medicines. It keeps a medication list, runs a deterministic, cited medication review (Beers 2023, interactions, anticholinergic burden, fall-risk-increasing drugs, prescribing cascades), records daily symptoms from the person's own words using on-device NLP/LLM, lines symptom timelines up against medication start and stop dates without making causal claims, and produces a reviewed, printable visit brief (and optionally a FHIR export).

**This is research for a student project. It is not legal advice.** Every factual claim has a source URL. Claims I could not confirm from a primary source are marked **UNVERIFIED**. Primary documents were downloaded and read in full where noted (cached copies are in `research/regsrc/`).

---

## 0. TL;DR for the team (read this first)

1. **FDA positioning (the most important finding).** FDA's current CDS guidance (reissued **29 Jan 2026**) says it plainly: *"Software functions that support or provide recommendations to patients or caregivers – not HCPs – meet the definition of a device."* So the caregiver-facing parts **cannot** claim the "Non-Device CDS" statutory exclusion. They have to fit somewhere else:
   - **Not a device:** "simple tools to organize and record their health information", provided the software makes *no recommendations to alter or change a previously prescribed treatment*. Tools "marketed to help patients document, show, or communicate to health care professionals" also count (MMA guidance Appendix A, examples 12-13).
   - **Device, but FDA enforcement discretion:** "Software functions that provide patients and/or caregivers information about drug-drug interactions and relevant safety information … as a report based on demographic data (for example, age, sex), clinical information (current diagnosis), and current medications" (Appendix B, example 18). Also medication tracking, trend display and "patient-specific screening, counseling and preventive recommendations from well-known and established authorities" (examples 6, 11, 12, 13). **A Beers-flag "report to discuss with your clinician" fits example 18 almost word for word.**
   - **The clinician-facing visit brief** can be designed to meet all 4 Non-Device CDS criteria, because its intended user is an HCP. It must show its basis: the rule, the source with version and date, the inputs and any missing data. FDA lists "Patient data reports and summaries" and "drug-drug interaction … notifications" among the outputs that meet criterion 3.
2. **Red lines.** Any of these pushes MedWatch into actively regulated device territory: dose calculation or dose-change suggestions, "stop" or "taper" instructions to the caregiver, a statement that a symptom is probably *caused by* a drug, symptom-triggered urgency triage, personalized risk scores or predictions, or analysis of sensor or wearable signals. FDA's own device examples include *"analyzes a patient's symptoms … to assess a patient's likelihood for digoxin toxicity"* and a patient-facing insulin dose calculator ("does not meet Criterion 3 because it is not intended for an HCP").
3. **Privacy.** A direct-to-consumer app that the consumer chooses for themselves is generally **not** a HIPAA covered entity or business associate (HHS OCR scenarios). It **is** within reach of FTC Act §5 and, if it can draw data from multiple sources, the **FTC Health Breach Notification Rule** (2024 amendments, effective 29 Jul 2024, up to $53,088 per violation). Under that rule, an "unauthorized disclosure" such as a tracking pixel counts as a breach. Washington's **My Health My Data Act** covers "use or purchase of prescribed medication" and "symptoms", and gives consumers a private right of action. Keeping data local and encrypted on the device removes most of this exposure. The remaining duties are: no third-party trackers, no telemetry that contains health data, sharing only when the user explicitly asks, and a published consumer-health-data privacy policy.
4. **Rename the product.** "MedWatch" has been FDA's adverse-event reporting program since 1993 (Kessler, JAMA 1993). There are also live USPTO filings: **MedWatch, LLC** filed "MEDWATCH" applications in Aug and Dec 2025 covering health-information and health-assessment services, Class 44. The confusion and trademark risk is high, and the name will look odd beside a "help me prepare an FDA MedWatch report" feature. Pick a new name and do a knockout search before submission. If the name has to stay for the deadline, add a visible "not affiliated with FDA or its MedWatch program" notice.
5. **FDA MedWatch feature.** Form FDA 3500B says *"You can fill out this form yourself or have someone fill it out for you."* So a caregiver-prepared **draft** that the user submits personally (online, by mail or by fax) is legitimate. Do not auto-submit.
6. **Interoperability.** Export a FHIR R4 `Bundle` of type `document`, with a Composition modeled on the International Patient Summary (IPS v2.0.1) as the first entry, plus MedicationStatement (`informationSource` = RelatedPerson caregiver), Observation (SNOMED symptom codes), Condition (`health-concern`) and DetectedIssue (the Beers flag, with its `reference` URI). An example in this file was validated against HAPI R4 `$validate` with 0 errors. Future import paths are SMART on FHIR patient-facing APIs (certified EHRs must support browser "public clients") and CMS Blue Button v2/v3 for Part D claims. Blue Button needs a confidential client, so it requires a small backend-for-frontend.
7. **Where it plugs into the real world.** It fits the Medicare Part D MTM **Comprehensive Medication Review**. The CMS-mandated "Medication List" format has these columns: Medication | How I take it | Why I use it | Prescriber, plus Allergies, Side effects, and My notes and questions. 42 CFR 423.153 explicitly lets the CMR be done with a **caregiver** when the beneficiary is cognitively impaired. It also fits the **Annual Wellness Visit** (the health risk assessment can be self-administered before the visit; medication and supplement history; cognitive-impairment detection that weighs "concerns raised by family members … caretakers"; functional ability and fall safety), **CDC STEADI** (the 3 key questions), brown-bag reviews, and deprescribing conversations. Evidence: direct-to-patient Beers education produced 27% vs 5% benzodiazepine discontinuation (EMPOWER) and 43% vs 12% discontinuation of inappropriate medicines (D-PRESCRIBE).

**Positioning statement (paste into the Devpost and the one-pager):**
> [Name] is a caregiver's preparation and documentation tool, not a diagnostic or treatment tool. It helps an older adult and their caregiver keep an accurate medication list, record day-to-day symptoms in their own words, and see published medication-safety information, such as which medicines appear in the American Geriatrics Society Beers Criteria® 2023. Each item comes with its source so the family can bring the right questions to their pharmacist or doctor. It never tells anyone to start, stop or change a medicine, never says a symptom was caused by a medicine, and never decides how urgent something is. All data stays on the user's device unless they choose to print or export it. Modeled on FDA's published examples of patient/caregiver medication-safety reports and record-keeping tools; no FDA clearance is claimed or required for this prototype. In an emergency, call 911.

---

## 1. FDA: is any of this a regulated medical device?

### 1.1 Framework and which documents are current (checked 2026-10-10)

| Document | Current version | Source |
|---|---|---|
| Policy for Device Software Functions and Mobile Medical Applications ("MMA guidance") | **Sept 2022** final. It is still the current version on FDA's guidance page as of 2026-10-10. The PDF now carries a QMSR front-note (QMSR effective 2 Feb 2026). FDA's FY2026 CDRH guidance agenda listed a planned revision. **No revised version had been published as of 2026-10-10.** | https://www.fda.gov/regulatory-information/search-fda-guidance-documents/policy-device-software-functions-and-mobile-medical-applications ; PDF https://www.fda.gov/media/80958/download ; FY26 plan cited by Covington https://www.cov.com/en/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance (agenda PDF https://www.fda.gov/media/188993/download) |
| Clinical Decision Support Software ("CDS guidance") | Final, **issued 29 Jan 2026**, which "supersedes 'Clinical Decision Support Software' issued on January 6, 2026". The Jan 6 version in turn replaced the Sept 2022 final. Issued without a comment period. | https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software ; PDF https://www.fda.gov/media/109618/download |
| General Wellness: Policy for Low Risk Devices | Final, **issued 6 Jan 2026**, superseding the 27 Sept 2019 version | https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices ; PDF https://www.fda.gov/media/90652/download |
| Web lists of examples (updated more often than the guidance) | "Examples of Software Functions for Which the FDA Will Exercise Enforcement Discretion" (page dated 30 Jan 2025); "Examples of Software Functions That Are NOT Medical Devices" | https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-which-fda-will-exercise-enforcement-discretion ; https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices |
| CDS FAQ | Updated 29 Jun 2026 | https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs |
| Digital Health Policy Navigator (FDA's interactive decision tool) | live | https://www.fda.gov/medical-devices/digital-health-center-excellence/digital-health-policy-navigator |
| Intended use is judged objectively from "labeling claims, advertising matter, or oral or written statements" (so marketing copy matters) | 21 CFR 801.4 | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-801/subpart-A/section-801.4 |

**What changed from Jan 6 to Jan 29, 2026 in the CDS guidance: UNVERIFIED.** Secondary sources call it a "minor correction" and none describe it. https://www.complizen.ai/post/is-your-clinical-decision-support-software-exempt-from-fda-regulation-what-changed-in-january

### 1.2 MMA guidance: the examples that matter for MedWatch

**The boundary sentence** (MMA guidance §V.A.3, PDF p.13). Device software functions that FDA focuses on include *"software functions that perform patient-specific analysis and provide patient-specific diagnosis or treatment recommendations to patients, caregivers, or other users who are not health care professionals."* (https://www.fda.gov/media/80958/download)

**General enforcement-discretion rule** (§V.B, p.13-14). FDA intends to exercise enforcement discretion for software that helps *"patients (i.e., users) self-manage their disease or conditions without providing specific treatment or treatment suggestions."* Footnote 44 adds that this applies when the software can be used safely without active oversight by a professional and *"is not intended to replace or discourage seeking treatment from a health care professional."*

**NOT medical devices (Appendix A, as listed on FDA's examples page)** relevant to us:
- **#3** Patient education and reference information. These may be patient-specific ("filters information to patient-specific characteristics") but are "intended for increased patient awareness, education, and empowerment". Example: apps that *"Help guide patients to ask appropriate questions to their physician relevant to their particular disease, condition, or concern."* This covers the **"questions to ask" list**.
- **#5** Generic note-taking and communication tools, including audio recording and note-taking.
- **#12** *"Software functions that provide patients with simple tools to organize and record their health information … without providing recommendations to alter or change a previously prescribed treatment or therapy."* Example: tools for people with chronic disease to *"record their events or measurements (… drug intake times, diet, daily routine, or emotional state) and share this information with their health care professional."* This covers the **medication list and symptom diary**.
- **#13** *"Software functions that are specifically marketed to help patients document, show, or communicate to health care professionals regarding potential medical conditions."* This covers the **visit brief as a communication aid**.
- **#8, #9** Transferring, storing, converting or displaying data to or from EHRs and PHRs, and logging data to share with an HCP. This covers the **FHIR export and import**.
- **#11** (HCP-facing) Matching patient information to reference information such as practice guidelines, and *"Drug-drug interaction and drug-allergy contraindication notifications"*, provided the HCP can independently review the basis. Footnoted to the CDS guidance. This covers the **clinician brief**.

Source: https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices

**Enforcement discretion (Appendix B; these may be devices, but FDA does not intend to enforce)** relevant to us:
- **#5** Herb-drug interaction lookup that reports "whether interactions have been seen in the literature and a summary of what type of interaction was reported".
- **#6** *"Software functions that use patient characteristics such as age, sex, and behavioral risk factors to provide patient-specific screening, counseling and preventive recommendations from well-known and established authorities."*
- **#7** Checklist of common signs and symptoms that gives a list of possible conditions and "advice on when to consult a health care professional". MedWatch should **not** need this; it is listed so the team knows where symptom-checker behavior falls.
- **#11** *"Software functions that keep track of medications and provide user-configured reminders for improved medication adherence."*
- **#12, #13** *"historical trending and comparison of vital signs"* and *"aggregate and display trends in personal health incidents."* This covers the **symptom timeline**.
- **#18** *"Software functions that provide patients and/or caregivers information about drug-drug interactions and relevant safety information (side effects, drug interactions, active ingredient) as a report based on demographic data (for example, age, sex), clinical information (current diagnosis), and current medications."* This is the **closest published analog to the caregiver-facing Beers, interaction, anticholinergic and fall-risk report.**

Source: https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-which-fda-will-exercise-enforcement-discretion (also MMA PDF Appendix B)

### 1.3 CDS guidance (Jan 2026): the 4 Non-Device CDS criteria and why caregiver-facing output fails criterion 3

Under FD&C Act §520(o)(1)(E), software is **excluded from the device definition** only if it meets **all four** criteria (CDS guidance §II, PDF p.6):
1. It is not intended to acquire, process or analyze a medical image, a signal from an IVD, or a pattern or signal from a signal-acquisition system.
2. It is intended to display, analyze or print medical information about a patient, or other medical information such as peer-reviewed studies and clinical practice guidelines.
3. It is intended to support or provide **recommendations to a health care professional (HCP)** about prevention, diagnosis or treatment.
4. It is intended to enable that **HCP to independently review the basis** for the recommendations, so the HCP does not rely primarily on them.

**Why patient or caregiver output fails criterion 3** (CDS guidance p.13, quoted): *"Software functions that support or provide recommendations to patients or caregivers – not HCPs – meet the definition of a device. FDA understands the importance of CDS for patients and caregivers … FDA intends to be consistent with existing policies (including … Policy for Device Software Functions and Mobile Medical Applications … and General Wellness …) in the regulation of CDS intended for non-HCPs."* The statute's criterion 3 names an HCP as the recipient, so a caregiver-facing recommendation cannot be "Non-Device CDS". It can still be (a) not a device at all, if it makes no recommendation (record-keeping or communication, Appendix A), or (b) a device under enforcement discretion (Appendix B). Covington confirms the 2026 revision is "silent on consumer-facing tools". Earlier drafts had proposed enforcement discretion for some patient decision support, but that was not adopted. https://www.cov.com/en/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance

**What changed in 2026 (useful for the HCP-facing brief):**
- **Single-recommendation enforcement discretion.** Software that gives only one clinically appropriate output, and otherwise meets the criteria, gets enforcement discretion. Under the 2022 version, a "specific … output or directive" failed criterion 3. (CDS guidance p.10-11; Covington.)
- **"Time-critical" moved from criterion 3 to criterion 4.** FDA "does not consider software functions intended for a critical, time-sensitive task or decision to meet Criterion 4." (p.14; Covington.)
- **More emphasis on usability and "well-understood and accepted sources".** Basis information should be presented "in a manner that promotes usability and avoids information overload". (p.15.)
- **Criterion 4 labeling recommendations.** State the intended HCP user and population; list the required inputs and how to obtain them; give a plain-language description of the algorithm and its sources, with "clinical practice guidelines with the date or version"; describe validation; and show patient-specific "knowns/unknowns … (e.g., missing, corrupted, or unexpected input data values)". (p.14-15.)
- **Footnote 22 (drug-interaction alerts).** *"Information relied upon by the software should be kept up-to-date while prominently displaying the source of the information … software that provides alerts for potential drug-drug interactions should provide a link directly to a trusted and up-to-date source for that information (e.g., DailyMed for drug labeling)."* **Design implication:** every flag should link to its source. Use the Beers 2023 DOI and DailyMed (https://dailymed.nlm.nih.gov) for the specific product label.
- **Criterion 3 examples that MedWatch's HCP brief matches:** "Matching patient-specific medical information … to reference information (e.g., clinical guidelines)"; "Drug-drug interaction and drug-allergy contraindication notifications"; "Duplicate testing or prescription product prevention notifications (e.g., medication reconciliations…)"; "Patient data reports and summaries (e.g., discharge papers)". (p.12-13.)
- **Device examples to stay away from (§V.C):**
  - **#28** A patient-facing bolus-insulin calculator. It "does not meet Criterion 3 because it is not intended for an HCP."
  - **#29** *"analyzes a patient's symptoms, prior diagnosis, and serum digoxin level … to assess a patient's likelihood for digoxin toxicity"*. This is a device. **Our symptom-medication timeline must never become "likelihood that drug X is causing symptom Y".**
  - **#22-25** Anything that analyzes patterns or signals over time, or alerts on deterioration, is a device.
  
  (https://www.fda.gov/media/109618/download)
- **AI.** The 2026 CDS guidance does not address AI or generative AI specifically (Covington). FDA's Digital Health Advisory Committee met on 6 Nov 2025 about patient-facing generative-AI mental-health devices. Members recommended clear disclosure that the user is talking to AI, a defined purpose and limits, and escalation protocols, and judged over-the-counter, patient-facing generative AI as higher risk. https://www.fda.gov/advisory-committees/advisory-committee-calendar/november-6-2025-digital-health-advisory-committee-meeting-announcement-11062025 ; summary https://www.fda.gov/media/189618/download. **Implication:** keep the on-device LLM to *extracting and structuring* the person's own words, which the caregiver then confirms. It must not interpret, diagnose or advise. Label the AI clearly.

### 1.4 General Wellness guidance (Jan 2026): mostly *not* our pathway

- Two factors: (1) intended only for general wellness use, and (2) low risk. There are two categories. The first is general state of health with **no** disease reference: weight, fitness, relaxation and stress, mental acuity, self-esteem, **sleep management**, sexual function. The second is healthy-lifestyle claims that help reduce the risk or impact of certain chronic diseases where the link is well accepted. (https://www.fda.gov/media/90652/download, §III.)
- The 2026 version says products are **not** general wellness if their labeling, UI or functionality includes *"references to specific diseases, clinical conditions, or diagnostic thresholds; … alerts, alarms, or prompts that recommend or require specific clinical action or medical management; … treatment guidance intended to inform or direct medical management"*, or if they are *"intended to provide outputs used to make treatment decisions (e.g., medication dosing)."*
- A wellness product *may* tell a user that "evaluation by a healthcare professional may be helpful", but only if the notice does not name a disease, does not call the output abnormal, contains no thresholds or treatment advice, and involves no ongoing disease-management alerts.
- **Conclusion:** the medication-review core references specific drugs and conditions, so it **does not fit** General Wellness. Use the MMA Appendix A and B framing instead. Only a stripped-down sleep, energy and appetite journal with no medication link could be argued to be general wellness. Commentary: Loeb https://www.loeb.com/en/insights/passle/2026/01/fda-updates-its-general-wellness-device-frameworkwhat-companies-need-to-know ; FDA Law Blog https://www.thefdalawblog.com/2026/01/a-busy-day-in-the-cdrh-neighborhood-updates-to-the-cds-and-general-wellness-guidance-documents/

### 1.5 Function-by-function positioning

| MedWatch function | Audience | Most defensible FDA bucket | Source | Guardrail that keeps it there |
|---|---|---|---|---|
| Medication list (names, strength, how taken, why, prescriber, start/stop dates) | caregiver | Not a device (Appendix A #12) | NOT-device page | No suggestions to change therapy |
| Medication reminders (if added) | caregiver | Enforcement discretion (App. B #11) | ED page | Reminders only for user-configured, pre-set schedules |
| Daily symptom diary from the person's own words (on-device NLP/LLM extraction) | older adult and caregiver | Not a device (App. A #12, "record … emotional state", events) | NOT-device page | Extraction only; the human confirms each entry; no interpretation, diagnosis or severity triage |
| Symptom trends and timeline vs. medication start/stop | both | Enforcement discretion (App. B #12-13, trending personal health incidents) | ED page | Descriptive counts with denominators ("dizziness on 5 of 14 logged days; diphenhydramine started 24 Sep"); no causal or likelihood language; no alerts |
| Beers 2023, interaction, anticholinergic burden and fall-risk-drug report | caregiver | Enforcement discretion (App. B #18; also #6 "well-known and established authorities") | ED page | Phrase as "information to discuss", cite source and version, link to DailyMed and the Beers DOI, and always say "don't stop or change a medicine without talking to your prescriber" (AGS consumer guidance below) |
| Prescribing-cascade patterns | caregiver | Enforcement discretion (App. B #18), at the edge | ED page | Present only as published patterns ("published reports describe X sometimes being prescribed to treat a side effect of Y; ask whether this applies"), never as "this happened to you" |
| "Questions to ask your clinician" | caregiver | Not a device (App. A #3) | NOT-device page | Neutral, open questions |
| Clinician/pharmacist visit brief | HCP | Non-Device CDS **if** all 4 criteria are met (rules shown, sources versioned, inputs and unknowns listed, not time-critical) | CDS guidance p.12-15 | Label the intended HCP user; the "basis" panel is mandatory; mark caregiver-reported data as unverified |
| FHIR export / SMART import / Blue Button import | both | Not a device (App. A #8-9; Non-Device MDDS) | NOT-device page | Transfer and format conversion only |
| FDA MedWatch 3500B draft | caregiver | Not a device (documentation and communication) | Form 3500B | Draft only; the user submits it |
| Static "Emergency? Call 911" banner | all | Not a device (App. A #3, emergency hotlines) | NOT-device page | Static and always visible; **never triggered by symptom content** |

### 1.6 What would push it toward active device regulation (avoid all of these in the prototype and in all copy)

- **Dosing:** calculating doses, renal dose adjustment (e.g., computing CrCl to adjust a dose), "reduce to X mg", taper schedules. See MMA §V.A.3 ("calculate dosage or create a dosage plan"), CDS device example #28, and General Wellness ("medication dosing").
- **Treatment directives to a lay user:** "stop taking", "switch to", "ask for drug Y instead" as personalized directives. Neutral prompts such as "Ask whether a safer alternative exists" are acceptable and mirror AGS consumer materials.
- **Causal or diagnostic inference about this patient:** "your confusion is likely caused by oxybutynin", "possible anticholinergic toxicity", "likelihood score". See CDS device example #29.
- **Urgency triage driven by symptom content:** "seek care within 24 h", red/amber/green based on what was logged. Time-critical outputs fail criterion 4, and this would be patient-facing in any case.
- **Personalized risk prediction:** "fall risk 34%". Compare CDS device example #23 (prediction).
- **Signals and sensors:** phone accelerometer fall detection, wearable heart rate or blood pressure analysis. These fail criterion 1 (pattern or signal).
- **Marketing claims** that it "prevents falls", "reduces adverse drug events" or "detects drug side effects". Intended use is read from claims (21 CFR 801.4). Describe the evidence base of *medication reviews* (Section 5) without claiming that MedWatch itself has been shown to produce outcomes.

### 1.7 Copy rules (do say / don't say)

| Do say | Don't say |
|---|---|
| "Listed in the AGS Beers Criteria® 2023 as potentially inappropriate for many adults 65+. Worth discussing with the prescriber." | "Dangerous", "unsafe for you", "should be stopped" |
| "Dizziness was logged on 5 of 14 days. Diphenhydramine was started on 24 Sep." | "Diphenhydramine is causing the dizziness" |
| "Bring this list to the pharmacist or doctor." | "Do this before your next dose" |
| "Information to discuss, not medical advice. Do not stop or change any medicine without talking to the prescriber." | "Clinically validated", "FDA approved", "HIPAA compliant" (the prototype already avoids these: `prototype/src/Settings.tsx`) |
| "If you think it is an emergency, call 911." (always visible, static) | "Your symptoms suggest you need urgent care" |

AGS consumer guidance supports this framing. Health in Aging (AGS Foundation) says being on the Beers list "does not mean that the medication is unsafe for all adults 65 or older", and advises patients not to stop medicines abruptly but to ask their provider whether a safer option exists. https://www.healthinaging.org/tools-and-tips/ask-expert-what-do-if-medication-you-take-listed-ags-beers-criteriar-potentially ; https://www.healthinaging.org/blog/beers-criteria/

### 1.8 Note on Beers Criteria intellectual property (real-world path)

- The 2023 update is *J Am Geriatr Soc* 2023;71(7):2052-2081, doi:10.1111/jgs.18372, PMID 37139824. The abstract says the criteria should be "applied thoughtfully and in a manner that supports, rather than replaces, shared clinical decision-making". https://pubmed.ncbi.nlm.nih.gov/37139824/
- "AGS Beers Criteria®" is a registered mark. AGS website content may not be reproduced "in any electronic format" without written permission, and permission is limited to educational, non-commercial use. https://www.americangeriatrics.org/about-us/legal-financial-and-government/copyright-permissions
- CSIS Health states it has "an exclusive commercial partnership with the American Geriatrics Society (AGS) to deliver the first electronic version of the AGS Beers Criteria®". https://csishealth.com/ This is a vendor claim; **the terms are UNVERIFIED.**
- **Implication:** for the hackathon (educational, non-commercial), paraphrase the rationale, cite the DOI, store only drug names, classes and recommendation categories (facts), and do not copy the tables. For a real product, budget for an AGS license or partner, or rely on openly licensed sources such as FDA labeling via DailyMed and openFDA. Mention this as "planned" in the presentation; judges value honesty about what is finished versus planned.

---

## 2. Privacy

### 2.1 HIPAA usually does not apply to a direct-to-consumer app the consumer chooses

- HHS OCR, "Health App Use Scenarios & HIPAA" (Feb 2016). A consumer who downloads an app and enters their own data, or uploads data downloaded from their portal, does **not** make the developer a business associate. The same holds when a doctor *recommends* an app, and when the consumer directs an interoperability transfer to the provider's EHR: "The consumer's use of an app to transmit data to a covered entity does not by itself make the app developer a BA". It **does** become a business associate relationship when a provider or health plan **contracts** with the developer for patient-management services. Key self-test: is the app "independently selected by a consumer", does "the consumer control all decisions about whether to transmit her data", and is there no relationship with the third party beyond interoperability? https://www.hhs.gov/sites/default/files/ocr-health-app-developer-scenarios-2-2016.pdf
- **Deployment implication:** if a Part D plan, MTM vendor or pharmacy chain later licenses the product to run CMRs for its members, the developer probably becomes a **business associate** for that offering, which brings in HIPAA Security Rule obligations and a BAA. A separate direct-to-consumer version can remain outside HIPAA if the data are kept separate (same OCR document, last scenario).
- HHS developer portal: https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html

### 2.2 FTC Act §5 and the Health Breach Notification Rule (HBNR, 16 CFR Part 318)

- **Who is covered:** vendors of personal health records (PHRs), PHR-related entities, and their service providers, if they are not covered by HIPAA. A PHR is an electronic record of identifiable health information "that has the technical capacity to draw information from multiple sources and that is managed, shared, and controlled by or primarily for the individual." The FTC's example: an app that takes user input **and** can sync or pull from another source is "probably" a PHR vendor, even if some users never connect it. https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0
- **2024 amendments.** Final rule announced 26 Apr 2024, published in the Federal Register 30 May 2024, effective 60 days later (29 Jul 2024).
  - Revised the definition of "PHR identifiable health information".
  - Added definitions of "covered health care provider" and "health care services or supplies" to make clear that health apps are covered.
  - Clarified that a "breach of security" includes **unauthorized disclosure**, not only hacking.
  - Clarified what "multiple sources" means and allowed email and electronic notice.
  
  Press release: https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-finalizes-changes-health-breach-notification-rule ; FR notice: https://www.govinfo.gov/content/pkg/FR-2024-05-30/pdf/2024-10855.pdf. The vote was 3-2; current Chair Ferguson and Commissioner Holyoak dissented, so enforcement priorities could shift. The rule itself remains in force (**status after 2025 UNVERIFIED beyond the FTC guidance page, edited Jan 2025**).
- **Obligations if a breach occurs:**
  - Notify individuals within 60 days.
  - Notify the FTC at the same time if 500 or more people are affected; otherwise within 60 days after the end of the calendar year.
  - Notify the media if 500 or more residents of one state are affected.
  - The notice must list the type of data involved, e.g., "medication information" and "the individual's use of a health-related mobile app".
  - Penalty: up to **$53,088 per violation** (inflation-adjusted Jan 2025). (FTC guidance page above.)
- **"Unsecured"** means not encrypted or destroyed according to HHS guidance. A lost laptop holding only encrypted PHRs does not trigger notice. https://www.hhs.gov/hipaa/for-professionals/breach-notification/guidance/index.html (linked from the FTC page)
- **Enforcement precedent:**
  - GoodRx (Feb 2023), the first HBNR action: $1.5M civil penalty for sharing health data with Facebook, Google and others via tracking tools without notice. https://www.ftc.gov/news-events/news/press-releases/2023/02/ftc-enforcement-action-bar-goodrx-sharing-consumers-sensitive-health-info-advertising
  - Easy Healthcare / Premom (May 2023): $100,000 penalty (per FTC search summary; **amount UNVERIFIED** against the primary order).
- **FTC tools:** the Mobile Health App Interactive Tool (with HHS, ONC and FDA), https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool, and the Health Products Compliance Guidance (Dec 2022, covering substantiation of health claims, apps included), https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance

### 2.3 State consumer-health-data laws

**Washington My Health My Data Act (RCW 19.373):**
- **"Consumer health data"** means personal information "linked or reasonably linkable to a consumer" that identifies their physical or mental health status. This explicitly includes "(iv) Use or purchase of prescribed medication", "(v) Bodily functions, vital signs, **symptoms**", "(vi) Diagnoses or diagnostic testing, treatment, or **medication**", and **inferences** derived "by any means, including algorithms or machine learning". https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.010
- **"Collect"** includes to "access, retain, receive, acquire, infer, derive, or otherwise process … in any manner". "Process" means "any operation". (§.010(5), (20).)
- **Consent and sharing:** collection is allowed only with consent for a specified purpose, or "to the extent necessary to provide a product or service that the consumer … has requested". **Sharing requires separate consent**, and consent requests must disclose categories, purposes and recipients. https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.030
- **Privacy policy:** a separate Consumer Health Data Privacy Policy, linked prominently from the homepage. https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.020 ; WA AG FAQ https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy
- **Enforcement:** a violation is a per se violation of the WA Consumer Protection Act, enforceable by the Attorney General **and by private action**. https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.090
- **Dates:** effective 31 Mar 2024 (small businesses 30 Jun 2024); the geofencing ban (section 10) applied to all persons from 23 Jul 2023. A small business is one with fewer than 100,000 consumers per year (see RCW 19.373.010(28)).
- **Open question (UNVERIFIED legal interpretation):** if the data never leave the user's device, is the developer a "regulated entity" that "determines the purpose and means of … processing"? The definitions are very broad ("any operation"). The prudent approach is to comply anyway: publish the policy, process only what is "necessary to provide" the service the user asked for, and never share without separate consent.

**Nevada SB 370** (consumer health data, effective 31 Mar 2024, no private right of action). https://www.bassberry.com/news/nevada-consumer-health-data-law-takes-effect-on-march-31-2024/

**New York Health Information Privacy Act (S929)** was vetoed in Dec 2025. A revised bill (A.10357/S.9269) was introduced in 2026; its **status is UNVERIFIED**. https://www.healthcare-brew.com/stories/2026/01/12/new-york-governor-vetoes-health-data-privacy-bill ; https://www.mofo.com/resources/insights/260316-nyhipa-returns-in-2026-revised-bill

**California CMIA, Civ. Code §56.06(b):** a business offering consumers software, "including a mobile application", designed to maintain medical information for the individual's own management is *deemed a provider of health care* for CMIA confidentiality purposes. https://california.public.law/codes/ca_civ_code_section_56.06. The CA AG relied on it against the Glow fertility app: https://oag.ca.gov/sites/default/files/2020%2009-17%20-%20People%20v%20Upward%20Labs%20-%20Complaint.pdf

### 2.4 Why local-only storage matters, and what is still required

| Risk / obligation | Effect of in-browser, on-device processing (WebLLM, IndexedDB) | What is still required |
|---|---|---|
| HIPAA BA status | No PHI is handled on behalf of a covered entity | Keep the B2B version (plan or pharmacy licensed) separate |
| FTC HBNR "breach" (incl. unauthorized disclosure) | The developer never holds the data, so there is no server to breach. Data encrypted at rest with WebCrypto count as "secured" | **No third-party analytics, pixels or session replay; no error telemetry carrying app state** (the GoodRx pattern). Strict CSP and Subresource Integrity. Model weights may come from a CDN, but the request must carry no health data. Exports happen only on an explicit user action |
| WA MHMDA consent and sharing | "Necessary to provide requested service"; no sharing | Consumer Health Data Privacy Policy link; separate consent before any share or sync feature; delete-all button |
| CMIA confidentiality | Nothing to disclose | Same as above |
| Data loss (local-only downside) | Clearing the browser deletes the data | Encrypted export and backup file; printable copy; tell users plainly |
| Shared-device privacy (an older adult's tablet used by family) | n/a | Optional passcode lock; auto-lock |
| Model behavior and AI disclosure | The LLM runs on device | Label AI-extracted entries; the caregiver confirms each one (see §1.3 DHAC) |

**Recommendation: build sharing as user-initiated only.** Offer print/PDF, a FHIR JSON download, and optionally a **SMART Health Link** (§4.6). With an SHL the file is encrypted on the device and the key travels inside the link or QR code, so any host is a "blind intermediary".

---

## 3. FDA MedWatch (the FDA program) and the naming collision

### 3.1 Form FDA 3500B (consumer/patient voluntary report)

Current form: **"FDA Form 3500B MedWatch (09/2025)"**, OMB 0910-0291, expires 30 Sep 2027, 8 pages, estimated 30 minutes to complete. https://www.fda.gov/media/85598/download (linked from https://www.fda.gov/safety/medical-product-safety-information/medwatch-forms-fda-safety-reporting). A Spanish version is at https://www.fda.gov/media/122470/download.

**When to use it:** "You were hurt or had a bad side effect (including new or worsening symptoms) after using a product, drug…"; incorrect use; a quality problem; or problems after "switching from one maker to another". Do **not** use it for vaccines (VAERS), investigational products, food or dietary supplements (use the Safety Reporting Portal), or tobacco.

**Who may fill it in:** *"You can fill out this form yourself or have someone fill it out for you. If you need help, you may want to talk with your health professional."*

**Fields** (paraphrased from the form):
- **A – About the problem:** type of problem; serious outcomes (hospitalization, needed help to prevent permanent harm, disability, birth defect, life-threatening, death, other serious event); date of problem; narrative "what happened, how it happened or why" (max 4,000 characters); relevant tests and labs; additional comments (2,000).
- **B – Product availability:** do you still have the product (do not send it to FDA); photos of all sides.
- **C – About the products:** name as shown on the package; on-going therapy?; manufacturer or compounder; product type (Rx brand/generic, OTC, compounded, CBD, cosmetic…); expiration date; lot number; NDC; strength; quantity; frequency; route; **date started, date stopped, date dose reduced**, duration; reason for use; **did the problem stop after reducing or stopping? did it return on restart?** (dechallenge and rechallenge).
- **D – About the medical device**, if applicable.
- **E – About the person:** initials, sex, age or DOB, weight, race/ethnicity, known conditions, allergies, other important information (tobacco, alcohol, pregnancy), **all OTC medicines, vitamins, supplements and herbals**, and **all current prescription medicines and devices**.
- **F – About the reporter:** name and contact details; whether the manufacturer was told; a box to request that the reporter's identity **not** be disclosed to the manufacturer.

**How to submit:**
- (1) **MedWatch Online Voluntary Reporting** https://www.accessdata.fda.gov/scripts/medwatch/index.cfm?action=reporting.home
- (2) Mail or fax the 3500B to: MedWatch Program, White Oak Campus, Building 22, G0207, 10903 New Hampshire Ave., Silver Spring, MD 20993; **FAX 800-332-0178**.
- Questions: 1-800-332-1088.
- FDA states the reporter's name may be shared with the manufacturer unless the reporter opts out, and that the report goes into a database reviewed by safety evaluators.

**Can a third-party app help prepare a draft?** Yes. The form expressly allows someone else to fill it in, and an earlier precedent exists: FDA collaborated on the **MedWatcher** app (Boston Children's / Epidemico, around 2013-2014), which relayed consumer reports to FDA. https://policymed.com/2014/01/fda-releases-medwatcher-reporting-for-healthcare-providers-patients-and-caregivers.html ; https://www.massdevice.com/news/fdas-new-medwatcher-mobile-app-aims-crowd-source-adverse-event-reporting

**I found no public consumer submission API.** Industry E2B/ESG gateways are for mandatory reporters (UNVERIFIED that no consumer API exists). **Recommended design:**
- A "Prepare a report draft" screen that pre-fills Sections C and E from the medication list, and Section A's dates and narrative from the caregiver's own diary entries. The caregiver edits everything.
- Output a printable summary that mirrors the 3500B section order, plus a "copy narrative" button.
- Deep-link to MedWatch Online.
- Never auto-submit and never assert causation. The form itself says "Submission of a report does not constitute an admission that medical personnel or the product caused or contributed to the event."
- Suggest discussing the problem with the clinician first.
- Whether the 3500B PDF has fillable AcroForm fields that could be filled in the browser is **UNVERIFIED** (it may be XFA).

### 3.2 Name collision: FDA "MedWatch"

- FDA's MedWatch program has existed since June 1993. Kessler DA, "Introducing MEDWatch", *JAMA* 1993;269(21):2765-8, PMID 8492403 (https://pubmed.ncbi.nlm.nih.gov/8492403/). It is FDA's public brand for safety alerts and voluntary reporting (Forms 3500/3500A/3500B, "MedWatch Safety Alerts"). https://www.fda.gov/safety/medical-product-safety-information/medwatch-forms-fda-safety-reporting
- **USPTO filings (via third-party aggregator; verify on USPTO TSDR before relying):** "MEDWATCH" applications by **MedWatch, LLC**:
  - Serial 99362964, filed 28 Aug 2025
  - Serial 99531763, filed 5 Dec 2025
  - Serial 99532323, filed 5 Dec 2025
  
  All are pending in Classes 35, 36, 44 and 45, including "Providing healthcare information; Health assessment services; … disease management programs", and patient-advocate services "coordinating the procurement and administration of medication". Other past or present MEDWATCH marks are held by a hospital (Fresno Community Hospital, Class 41/44, registered), e-Watch Inc. (Class 42) and others. https://gleanmark.com/search?q=MEDWATCH. **Current status UNVERIFIED.**
- 42 U.S.C. §1320b-10 forbids using words such as "Medicare", "Centers for Medicare & Medicaid Services", "Department of Health and Human Services" or "HHS" in a way that suggests HHS or CMS endorsement. "MedWatch" and "FDA" are **not** on that list, but the false-endorsement concern carries over through FTC Act §5 deception and Lanham Act false association (general principle; no specific case found). https://www.govinfo.gov/content/pkg/USCODE-2023-title42/html/USCODE-2023-title42-chap7-subchapXI-partA-sec1320b-10.htm. **Relevant to §5:** do not use "Medicare" in the product name or logo.
- **Risk assessment:** high likelihood of confusion with a well-known federal safety program, made worse because the product touches adverse-event reporting. The trademark risk is moderate to high because of overlapping Class 44 filings. Judges, including one from an EHR vendor, will likely notice.
- **Recommendation:** rename before the demo video. Criteria: no "Med-Watch/Medi-Watch/FDA/Medicare" stems; evokes caregiving or medication review; short; run a USPTO search and a .com/app-store check. Candidate directions (**availability not searched, UNVERIFIED**): "BrownBag" or "Brown Bag Buddy" (from the brown-bag medication review; the term itself is generic), "MedReview Companion", "Polypharm Pal", "CareList". If renaming is impossible before the deadline, add the notice: *"Not affiliated with, endorsed by, or connected to the U.S. FDA or its MedWatch program."*

---

## 4. Interoperability: exporting a caregiver-maintained list, symptom diary and concerns

### 4.1 Standards and versions (checked 2026-10-10)

| Standard | Current version | Why it matters | Source |
|---|---|---|---|
| FHIR | R4 (4.0.1) | Baseline for US Core, IPS and Blue Button | https://hl7.org/fhir/R4/ |
| International Patient Summary (IPS) IG | **v2.0.1, STU 2** | Patient-summary document. **Required** sections: Medication Summary (LOINC 10160-0), Allergies (48765-2), Problems (11450-4). Optional: Patient Story, Functional Status, Plan of Care, Alerts and others. The Medication Summary is "a list of MedicationStatements or MedicationRequests". Composition.type = LOINC 60591-5 | https://hl7.org/fhir/uv/ips/ ; https://hl7.org/fhir/uv/ips/StructureDefinition-Composition-uv-ips.html |
| US Core IG | **v9.0.0, STU 9** | US EHR profiles. There is **no US Core MedicationStatement profile**. US Core represents medication lists with MedicationRequest; for self-prescribed or reported medicines, `requester` "SHOULD" be the Patient or RelatedPerson, using `reported[x]`. Relevant profiles: US Core Observation Screening Assessment, Simple Observation, Condition Problems and Health Concerns, QuestionnaireResponse, RelatedPerson | https://hl7.org/fhir/us/core/ ; https://hl7.org/fhir/us/core/StructureDefinition-us-core-medicationrequest.html ; https://hl7.org/fhir/us/core/profiles-and-extensions.html |
| SMART App Launch | **v2.2.0** | OAuth2 and launch framework for patient-facing apps | https://hl7.org/fhir/smart-app-launch/ |
| SMART Health Cards and Links | **v1.0.0, STU 1** | QR or link sharing. The files are encrypted with a key generated by the sharing app, and the server can be a "blind intermediary"; supports passcode and expiry | https://hl7.org/fhir/uv/smart-health-cards-and-links/ ; https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html |
| ONC certification §170.315(g)(10) | US Core 6.1.0 + SMART 2.0.0 required by 31 Dec 2025; SMART v1 expired 1 Jan 2026 | Certified EHR patient APIs **must support browser-based "public clients"**, so a pure in-browser app can do a SMART standalone patient launch (PKCE) with no backend | https://healthit.gov/regulations/hti-rules/hti-1-final-rule/ ; https://www.federalregister.gov/documents/2024/01/09/2023-28857/health-data-technology-and-interoperability-certification-program-updates-algorithm-transparency-and |

### 4.2 Resource mapping for MedWatch data

| MedWatch concept | FHIR R4 resource | Key elements and codes |
|---|---|---|
| Medication list entry | **MedicationStatement** (IPS); optionally also MedicationRequest (US Core) for US EHR ingestion | `status` (active, completed, stopped, on-hold, not-taken, …), `medicationCodeableConcept` with RxNorm, `effectivePeriod.start/end` (start and stop dates drive the timeline), `dateAsserted`, **`informationSource` → RelatedPerson** (caregiver) or Patient, `dosage.text`, `reasonCode`, `note`. Spec: https://hl7.org/fhir/R4/medicationstatement.html |
| Caregiver | **RelatedPerson** | `relationship` from v3-RoleCode (e.g., `CHILD`), `patient` |
| Daily symptom (one per symptom per day) | **Observation** | `category` = `survey` (http://terminology.hl7.org/CodeSystem/observation-category), `code` = SNOMED symptom with `text` holding the person's own words, `effectiveDateTime`, `performer` (Patient or RelatedPerson), `valueBoolean` (present) or `valueInteger` (0-3 severity) or `valueCodeableConcept`, and a `note` that it was AI-extracted and human-confirmed |
| Whole daily check-in (alternative) | **QuestionnaireResponse** (+ Questionnaire) | Good when the diary is a fixed form. US Core has a QuestionnaireResponse profile |
| Caregiver concern ("more unsteady since September") | **Condition** with category `health-concern` (http://hl7.org/fhir/us/core/CodeSystem/condition-category) | `code.text`, `asserter` = RelatedPerson, `recordedDate` |
| Beers / interaction / anticholinergic / fall-risk flag | **DetectedIssue** | `status` = preliminary, `code` from v3-ActCode (`AGE` Age Alert, `DRG` Drug Interaction Alert, `DUPTHPY` Duplicate Therapy Alert), `severity` (high, moderate, low), **`implicated` → MedicationStatement**, `detail` (plain-language rationale), **`reference` (uri of the authority, e.g., the Beers DOI)**. Spec: https://hl7.org/fhir/R4/detectedissue.html |
| Visit brief document | **Composition** (first entry) in a **Bundle `type: document`** | Bundle invariants: bdl-9 needs `identifier` (system and value), bdl-10 needs `timestamp`, bdl-11 needs Composition as the **first** entry. https://hl7.org/fhir/R4/bundle.html |
| Simple data dump | **Bundle `type: collection`** | "No particular use … is associated with this Bundle"; each entry SHALL contain a resource. Simpler, but has no document semantics |

**Code systems (verified):**
- **RxNorm:** `http://www.nlm.nih.gov/research/umls/rxnorm` (https://hl7.org/fhir/R4/rxnorm.html)
- **SNOMED CT:** `http://snomed.info/sct` (https://hl7.org/fhir/R4/snomedct.html)
- **LOINC:** `http://loinc.org`

**SNOMED CT symptom codes** (displays verified via tx.fhir.org `$lookup`, 2026-10-10):

| Concept | SCTID | FSN / display |
|---|---|---|
| Dizziness | 404640003 | Dizziness (finding) |
| Confusion | 286933003 | Confusional state (disorder). Note the semantic tag is *disorder*; for a lay-reported symptom you may prefer code.text plus this code |
| Fall | 1912002 | Fall (event) |
| Falls (history) | 161898004 | Falls (finding) |
| Fatigue / low energy | 84229001 | Fatigue (finding) |
| Drowsiness | 271782001 | Drowsy (finding) |
| Insomnia / poor sleep | 193462001 | Insomnia |
| Poor appetite | 79890006 | Loss of appetite |
| Constipation | 14760008 | Constipation |
| Dry mouth | 87715008 | Xerostomia |
| Nausea | 422587007 | Nausea |
| Urinary retention | 267064002 | Retention of urine |
| Orthostatic hypotension (clinician-measured only) | 28651003 | Orthostatic hypotension |
| Generic "reported by subject" | 418799008 | Finding reported by subject or history provider |

"Near-fall" has **no code verified**. Use `code.text` with the Fall code, or a local code.

**LOINC (verified):**
- 60591-5 Patient summary Document
- 10160-0 History of Medication use Narrative
- 48765-2 Allergies and adverse reactions Document
- 11450-4 Problem list - Reported
- 75325-1 Symptom
- 81338-6 Patient Goals, preferences, and priorities for care experience

**RxNorm examples** (verified with RxNav, https://rxnav.nlm.nih.gov/REST/):

| Medicine | SCD RxCUI | Ingredient RxCUI |
|---|---|---|
| diphenhydramine hydrochloride 25 MG Oral Capsule | 1049909 | 3498 |
| oxybutynin chloride 5 MG Oral Tablet | 863664 | 32675 |
| zolpidem tartrate 10 MG Oral Tablet | 854873 | 39993 |
| lisinopril 10 MG Oral Tablet | 314076 | 29046 |
| donepezil hydrochloride 10 MG Oral Tablet | 997223 | 135447 |

The RxNav REST API is free and can be called from the browser for name-to-RxCUI normalization. Note that this sends drug *names* (not patient identity) off the device; disclose this, or bundle a local subset.

### 4.3 Minimal example Bundle (validated)

I validated this against `https://hapi.fhir.org/baseR4/Bundle/$validate` on 2026-10-10. Result: **0 errors**. The warnings were only (a) LOINC, RxNorm and US Core code systems not loaded on that server, (b) the dom-6 "should have narrative" best-practice warning, and (c) the DOI reference not being in the bundle (expected). The data are fictional. A copy is saved at `research/regsrc/example-bundle.json`.

```json
{
  "resourceType": "Bundle",
  "id": "visit-brief-2026-10-10",
  "identifier": { "system": "urn:ietf:rfc:3986", "value": "urn:uuid:5b0f3c1e-8a7d-4c1e-9f1a-2d3c4b5a6e70" },
  "type": "document",
  "timestamp": "2026-10-10T14:00:00-04:00",
  "entry": [
    { "fullUrl": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000001",
      "resource": {
        "resourceType": "Composition",
        "status": "preliminary",
        "type": { "coding": [ { "system": "http://loinc.org", "code": "60591-5", "display": "Patient summary Document" } ] },
        "subject": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000002" },
        "date": "2026-10-10T14:00:00-04:00",
        "author": [ { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000003" } ],
        "title": "Caregiver-prepared medication review brief (patient-generated, unverified)",
        "section": [
          { "title": "Medication Summary",
            "code": { "coding": [ { "system": "http://loinc.org", "code": "10160-0" } ] },
            "text": { "status": "generated", "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Medications as reported by caregiver; not reconciled by a clinician.</div>" },
            "entry": [ { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000010" } ] },
          { "title": "Allergies and Intolerances",
            "code": { "coding": [ { "system": "http://loinc.org", "code": "48765-2" } ] },
            "text": { "status": "generated", "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">No allergy information recorded by caregiver.</div>" },
            "emptyReason": { "coding": [ { "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason", "code": "unavailable" } ] } },
          { "title": "Problems and caregiver concerns",
            "code": { "coding": [ { "system": "http://loinc.org", "code": "11450-4" } ] },
            "text": { "status": "generated", "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Caregiver-reported concern: more unsteady on feet since late September.</div>" },
            "entry": [ { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000030" } ] },
          { "title": "Symptom diary (patient-reported, last 14 days)",
            "code": { "coding": [ { "system": "http://loinc.org", "code": "75325-1" } ] },
            "text": { "status": "generated", "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Dizziness reported on 5 of 14 logged days.</div>" },
            "entry": [ { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000020" } ] },
          { "title": "Items to discuss (rule-based, cited)",
            "text": { "status": "generated", "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Diphenhydramine is listed in the AGS Beers Criteria 2023; discuss with clinician. Do not stop medicines without advice.</div>" },
            "entry": [ { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000040" } ] }
        ]
      } },
    { "fullUrl": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000002",
      "resource": { "resourceType": "Patient", "name": [ { "family": "Example", "given": [ "Rosa" ] } ], "gender": "female", "birthDate": "1944-03-02" } },
    { "fullUrl": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000003",
      "resource": { "resourceType": "RelatedPerson",
        "patient": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000002" },
        "relationship": [ { "coding": [ { "system": "http://terminology.hl7.org/CodeSystem/v3-RoleCode", "code": "CHILD", "display": "child" } ] } ],
        "name": [ { "family": "Example", "given": [ "Ana" ] } ] } },
    { "fullUrl": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000010",
      "resource": { "resourceType": "MedicationStatement", "status": "active",
        "medicationCodeableConcept": {
          "coding": [ { "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "1049909", "display": "diphenhydramine hydrochloride 25 MG Oral Capsule" } ],
          "text": "Diphenhydramine 25 mg capsule (OTC sleep aid)" },
        "subject": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000002" },
        "effectivePeriod": { "start": "2026-09-24" },
        "dateAsserted": "2026-10-10",
        "informationSource": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000003" },
        "dosage": [ { "text": "1 capsule by mouth at bedtime as needed (as reported)" } ] } },
    { "fullUrl": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000020",
      "resource": { "resourceType": "Observation", "status": "final",
        "category": [ { "coding": [ { "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "survey" } ] } ],
        "code": { "coding": [ { "system": "http://snomed.info/sct", "code": "404640003", "display": "Dizziness" } ],
                  "text": "Dizziness (patient's words: 'the room spun when I got up')" },
        "subject": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000002" },
        "effectiveDateTime": "2026-10-03T08:15:00-04:00",
        "performer": [ { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000003" } ],
        "valueBoolean": true,
        "note": [ { "text": "Extracted on-device from free text; reviewed and confirmed by caregiver." } ] } },
    { "fullUrl": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000030",
      "resource": { "resourceType": "Condition",
        "category": [ { "coding": [ { "system": "http://hl7.org/fhir/us/core/CodeSystem/condition-category", "code": "health-concern" } ] } ],
        "code": { "text": "Caregiver concern: more unsteady on feet since late September" },
        "subject": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000002" },
        "recordedDate": "2026-10-10",
        "asserter": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000003" } } },
    { "fullUrl": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000040",
      "resource": { "resourceType": "DetectedIssue", "status": "preliminary",
        "code": { "coding": [ { "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AGE", "display": "Age Alert" } ],
                  "text": "Potentially inappropriate medication in adults 65+ (AGS Beers Criteria 2023)" },
        "severity": "moderate",
        "patient": { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000002" },
        "identifiedDateTime": "2026-10-10",
        "implicated": [ { "reference": "urn:uuid:0a1b2c3d-0000-4000-8000-000000000010" } ],
        "detail": "Rule match: first-generation antihistamine listed as potentially inappropriate for older adults. Discussion prompt only; not a recommendation to stop or change therapy.",
        "reference": "https://doi.org/10.1111/jgs.18372" } }
  ]
}
```

Implementation notes:
- Generate `urn:uuid:` fullUrls with `crypto.randomUUID()`.
- Keep Composition.status `preliminary` until a clinician reviews the data.
- To claim IPS conformance you would add `meta.profile` (e.g., `http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips`) and meet IPS must-support rules. **This example is "IPS-inspired" and not IPS-validated.**
- For US EHR import, also emit US Core MedicationRequest with `intent` = `plan`, `reportedBoolean` = true and `requester` = RelatedPerson. Exact intent conventions are **UNVERIFIED**.

### 4.4 SMART on FHIR (future import from patient portals)

- Under ONC (g)(10), certified EHR APIs must support SMART App Launch 2.0, US Core 6.1.0, and browser "public clients". A local-first web app can therefore do a **standalone patient launch** with PKCE and pull MedicationRequest, AllergyIntolerance, Condition and Observation directly into the browser, with no backend. (HTI-1 links above.)
- Practical caveat: each EHR vendor still requires app registration and a client ID (e.g., Epic's patient-app registration). Per-vendor steps are **UNVERIFIED**.

### 4.5 CMS Blue Button and payer Patient Access APIs (future import of Part D fills)

- **Blue Button API:** Medicare Parts A, B and **D** claims for more than 60 million beneficiaries. FHIR R4, CARIN Blue Button IG, OAuth 2.0.
  - **v3** has data timeliness of about one day for Part A/B shared-systems claims (Part D only once fully adjudicated), implements SMART App Launch v2.2 with resource-level consent, and lets the beneficiary withhold substance-use-disorder claims.
  - Scopes include `patient/ExplanationOfBenefit.rs`, `patient/Coverage.rs` and `patient/Patient.rs`.
  - Access duration categories: 1 hour, 13 months, or research.
  - **Blue Button requires a confidential client with PKCE (S256)**. It does **not** support public clients or the implicit grant, and recommends a **Backend-for-Frontend** proxy. A purely in-browser app would therefore need a small stateless token broker. Design it to pass tokens and data straight through to the browser, with no logging or storage.
  
  Sources: https://bluebutton.cms.gov/ ; https://bluebutton.cms.gov/api-documentation/ ; https://bluebutton.cms.gov/api-documentation/authorization/ ; https://bluebutton.cms.gov/api-documentation/v3-faq/
- **Patient Access API (CMS-9115-F, 2020):** Medicare Advantage, Medicaid/CHIP and Marketplace QHP issuers must expose claims, encounters and clinical data through FHIR APIs, within one business day of adjudication. MA-PD plans must also expose formulary data. CMS-0057-F (2024) adds prior-authorization information. https://www.cms.gov/files/document/cms-9115-f.pdf ; https://www.cms.gov/priorities/burden-reduction/overview/interoperability/frequently-asked-questions/patient-access-api
- **Value for MedWatch:** Part D pharmacy-claim `ExplanationOfBenefit` records give fill dates and NDCs. These can (a) pre-populate the medication list, (b) supply start dates for the timeline, and (c) reveal OTC gaps, since OTC medicines are not in claims and the caregiver must add them.

### 4.6 CMS Health Tech Ecosystem / Medicare App Library (2025-2026): an ecosystem fit

- CMS launched the voluntary Health Tech Ecosystem ("Make Health Tech Great Again", July 2025). EHRs, networks and apps pledged to adopt a CMS Interoperability Framework, including "kill the clipboard" sharing of patient data via QR codes or SMART Health Cards/Links at check-in. https://www.cms.gov/health-tech-ecosystem ; https://www.healthcaredive.com/news/trump-administration-cms-data-sharing-health-tech-ecosystem/756377/
- **The Medicare App Library launched in April 2026.** Initial use cases include conversational AI assistants and "kill the clipboard" apps. Per KFF, as of June 2026 it listed 5 available apps and 8 coming soon. KFF also reports that 78% of beneficiaries aged 65+ used a health-care app or website in the past year. https://www.kff.org/medicare/digital-health-tools-and-technologies-an-overview-of-cms-recent-efforts-to-expand-their-use-in-medicare/
- Entry reportedly requires the pledge, identity proofing (ID.me or CLEAR), connection to a CMS Aligned Network, and a DiMe Seal or CARIN evaluation (**secondary sources; UNVERIFIED** against a CMS criteria document). https://hooperlundy.com/cms-announces-medicare-app-library/ ; https://dimesociety.org/newsroom/press-releases/cms-selects-the-dime-seal-as-required-credential-for-entry-into-medicare-app-library-paving-the-way-for-national-medicare-app-launch/
- **Pitch angle:** "Our export is a FHIR document bundle that can be carried as a SMART Health Link QR code, which is the same mechanism CMS's 'kill the clipboard' pledge uses. A caregiver hands the pharmacist a QR code instead of a shoebox." The Medicare App Library is a credible **future** distribution path; it is not claimed as done.

---

## 5. Real-world deployment channels

### 5.1 Medicare Part D Medication Therapy Management (MTM) and the Comprehensive Medication Review (CMR)

**Eligibility** (42 CFR 423.153(d)(2), eCFR current text; changes effective 1 Jan 2025 under the April 2024 final rule). https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-423/subpart-D/section-423.153

A beneficiary is targeted if they meet **all** of (i)(A)-(C), **or** are an "at-risk beneficiary" (drug management program, mainly opioids/benzodiazepines):
- **(A) Multiple chronic diseases.** A plan may require **at most 3**; sponsors may set the minimum at 2 or 3.
  - Plans **must include** all 10 core diseases: Alzheimer's disease; bone disease-arthritis (osteoporosis, osteoarthritis, RA); chronic CHF; diabetes; dyslipidemia; ESRD; **HIV/AIDS (added for 2025)**; hypertension; mental health (depression, schizophrenia, bipolar, other); respiratory disease (asthma, COPD, other).
- **(B) Multiple Part D drugs.** A plan may require **at most 8**, and from 2025 must count **all Part D maintenance drugs**.
- **(C) Cost threshold.** Likely to incur annual covered Part D costs at or above the threshold, which from 2025 equals the **average annual cost of 8 generic drugs**:

| Year | Threshold | Source |
|---|---|---|
| 2025 | **$1,623** | CY2025 memo https://www.cms.gov/files/document/memo-contract-year-2025-medication-therapy-management-mtm-program-submission-v050624.pdf |
| 2026 | **$1,276** | CY2026 memo https://www.cms.gov/files/document/memo-contract-year-2026-medication-therapy-management-mtm-program-submission-v05062025.pdf |
| 2027 | **$1,340** | CY2027 memo dated 1 May 2026 https://www.cms.gov/files/document/memo-contract-year-2027-medication-therapy-management-mtm-program-submission-v-05-04-2026.pdf |

- Enrollment is **opt-out**, and targeting must run at least quarterly. ((d)(1)(v)-(vi).)

**Required services** ((d)(1)(vii)):
- Interventions for beneficiaries and prescribers.
- **An annual CMR with a written summary.** The CMR "must include an interactive consultation, performed by a pharmacist or other qualified provider, that is either in person or performed via synchronous telehealth" and "may result in a recommended medication action plan".
- **(d)(1)(vii)(B)(2):** *"If a beneficiary is offered the annual comprehensive medication review and is unable to accept the offer to participate due to cognitive impairment, the pharmacist or other qualified provider may perform the comprehensive medication review with the beneficiary's prescriber, **caregiver**, or other authorized individual."* This is a direct regulatory hook for a caregiver tool.
- Quarterly targeted medication reviews (TMRs).
- Standardized action plans and summaries.
- Safe-disposal information for controlled substances.

**CMS Standardized Format** (Form CMS-10396, OMB 0938-1154, approved through 31 Dec 2027; current version 12/17/2024). Download: https://www.cms.gov/files/zip/mtm-standardized-format-and-technical-instructions-12172024.zip (from https://www.cms.gov/medicare/coverage/prescription-drug-coverage-contracting/medication-therapy-management). Components, from the downloaded .docx:
1. **Cover letter.**
2. **"Recommended To-Do List"** (formerly the Medication Action Plan): "What we talked about" / "What I should do", up to 4 topics. "Bring your To-Do List when you go to your doctor. And, share it with your family or caregivers."
3. **Safe-disposal page.**
4. **"Medication List"** (formerly the Personal Medication List). Columns: **Medication** (generic and brand name, strength, dosage form) | **How I take it** (regimen, devices, instructions) | **Why I use it** (indication) | **Prescriber**. There are blank rows to "Add new medications, over-the-counter drugs, herbals, vitamins, or minerals", followed by **Allergies**, **Side effects I have had**, **Other information**, and **My notes and questions**. Instructions say: "Bring your Medication List when you go to the doctor, hospital, or emergency room… Note any changes… Cross out medications when you no longer use them."

**How MedWatch feeds the CMR concretely:**
- **Before:** the caregiver exports a "CMR prep packet". It contains the Medication List **in the exact CMS column layout**, with OTC and supplement rows filled in (the most commonly missed items). "Side effects I have had" is populated from diary counts, e.g., "dizziness 5/14 days since 24 Sep", stated descriptively. "My notes and questions" holds the cited Beers, interaction and anticholinergic discussion prompts plus the caregiver's own concerns.
- **During:** the pharmacist reconciles the packet against Part D claims (plans have claims, but not OTC medicines or symptoms). Time otherwise spent on discovery goes to the review itself.
- **After:** the caregiver enters the pharmacist's To-Do items. The app tracks whether each was done and what symptoms followed, and this feeds the quarterly TMR.

### 5.2 Medicare Annual Wellness Visit (AWV)

From the 42 CFR 410.15 definitions (eCFR current). https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-410/subpart-B/section-410.15

- The AWV must take into account a **Health Risk Assessment**. The HRA "can be administered independently by the beneficiary … prior to or as part of the AWV encounter", must take no more than 20 minutes, and covers:
  - self-assessed health status and frailty;
  - psychosocial risks including **pain and fatigue**;
  - behavioral risks including **home safety**;
  - **ADLs including "physical ambulation (including balance/risk of falls)"**;
  - IADLs.
  
  The app can pre-fill a draft of this from the diary.
- Medical history must include **"Use or exposure to medications and supplements, including calcium and vitamins."** The app's medication list covers this.
- "Detection of any cognitive impairment" means assessment "with due consideration of information obtained by way of patient report, **concerns raised by family members, friends, caretakers or others**." The caregiver's concern log and confusion diary entries feed this directly.
- Other required elements: review of functional ability and level of safety; personalized advice and referrals for **fall prevention**; review of **current opioid prescriptions**; screening for substance-use-disorder risk.

### 5.3 CDC STEADI (fall prevention)

- STEADI = Screen, Assess, Intervene. It implements the American and British Geriatrics Societies' fall-prevention guideline. "More than one out of four people 65 and older falls each year, and over 3 million are treated in emergency departments annually for fall injuries." https://www.cdc.gov/steadi/about/index.html
- **Three key screening questions:** fallen in the past year? feels unsteady when standing or walking? worries about falling? Any "yes" is a positive screen. If the person has fallen, ask how many times and whether they were injured. The algorithm also includes a **medication review** for fall-risk-increasing drugs. https://www.cdc.gov/steadi/media/pdfs/STEADI-Algorithm-508.pdf
- **STEADI-Rx** (community pharmacists): screen with the 3 questions, review the profile for fall-risk medicines, and communicate with the provider via a consult form. https://www.cdc.gov/steadi/pdf/provider/steadi-rx/STEADI-Algorithm-508.pdf
- Clinical resources: https://www.cdc.gov/steadi/hcp/clinical-resources/index.html
- **Product hook:** ask the 3 STEADI questions in the diary, e.g., monthly. Record falls and near-falls as events with date and injury yes/no. Put the answers on the visit brief with the citation. The app *records* the answers and does not score or triage them.

### 5.4 "Brown bag" medication reviews

- In a brown-bag review the patient brings every medicine, OTC product and supplement to a pharmacist for review.
  - **O'Connell et al., JAGS 2015** (n=85, aged 60+, taking 5 or more medicines): a mean of 4.3 drug-related problems per participant, about 59% of them rated "significant"; most participants implemented the recommendations by 3 months. PMID 26313706, https://psnet.ahrq.gov/issue/drug-related-problem-outcomes-and-program-satisfaction-comprehensive-brown-bag-medication
  - **German community-pharmacy study** (n=1,090): drug-related problems in 84.2% of patients. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8452550/
- **Product hook:** a "digital brown bag". The caregiver photographs or enters every bottle, including OTC and supplements, so the pharmacist starts from a complete list. Bottle-label OCR on device is a possible future feature (**planned, not built**).

### 5.5 Deprescribing evidence and networks

- **EMPOWER** (Tannenbaum et al., *JAMA Intern Med* 2014; cluster RCT, n=303, aged 65-95, long-term benzodiazepine users). A **direct-to-patient** educational brochure led to 62% of participants starting a conversation about stopping, and to **27% vs 5% discontinuation** at 6 months (risk difference 23%, NNT 4). doi:10.1001/jamainternmed.2014.949, https://pubmed.ncbi.nlm.nih.gov/24733354/
- **D-PRESCRIBE** (Martin et al., *JAMA* 2018; cluster RCT, n=489, mean age 75, taking one of 4 **Beers** medicine classes: sedative-hypnotics, first-generation antihistamines, glyburide, NSAIDs). A consumer-targeted, pharmacist-led educational intervention led to **43% vs 12%** no longer filling the inappropriate prescription at 6 months. doi:10.1001/jama.2018.16131, https://pubmed.ncbi.nlm.nih.gov/30422193/
- **These trials are the strongest evidence that a patient- or caregiver-facing, Beers-based discussion prompt can change prescribing.** Their mechanism, education that triggers a conversation with the prescriber, is exactly the FDA-safe positioning above. MedWatch is **not** proven to replicate these effects; say "inspired by", not "proven".
- **US Deprescribing Research Network (USDeN):** NIA-funded (R24, then R33), led from UCSF and Johns Hopkins. Mission: to increase the quality, quantity and real-world impact of deprescribing research for older adults. It offers pilot grants, stakeholder engagement, an annual meeting and resources. https://deprescribingresearch.org ; https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12307437/ ; https://geriatrics.ucsf.edu/news/announcing-launch-us-deprescribing-research-network. **Realistic path:** a USDeN pilot grant for a caregiver-mediated deprescribing-conversation study (planned).

### 5.6 One-paragraph real-world story (for the pitch)

> Two weeks before Mom's Medicare Annual Wellness Visit, or before her Part D plan's pharmacist calls for the yearly Comprehensive Medication Review, her daughter enters every bottle, including the OTC sleep aid. Mom answers a 30-second daily check-in in her own words. On the day of the visit, the daughter prints a one-page brief. It has the medication list in the CMS "Medication List" layout; Mom's STEADI fall questions; descriptive symptom counts lined up against medication start dates; and three cited discussion prompts, for example "Diphenhydramine is listed in the AGS Beers Criteria® 2023, so ask whether a safer sleep option exists." The pharmacist or doctor makes every decision. If Mom cannot take part because of cognitive impairment, CMS rules already let the pharmacist do the review with the caregiver, and this is the caregiver's preparation tool for that conversation.

---

## 6. Build checklist derived from this research (for the product team)

1. **Rename** and add a "not affiliated with FDA MedWatch" notice if needed (§3.2).
2. Put a **source chip on every flag**: rule ID, source title, version and year, a DOI link, and a DailyMed link for the product (CDS footnote 22).
3. **Banned-phrases lint** in the UI and in LLM outputs: cause, likely due to, stop, reduce, dose, urgent, safe, unsafe, diagnose. The prototype already has filters in `prototype/src/ai.ts`; keep them and add tests.
4. Show symptom-medication alignment with **counts and denominators only**, and display "Association is not causation".
5. **Two audiences, two views.**
   - The **caregiver view** says "Information to discuss" and includes the AGS "don't stop on your own" line.
   - The **clinician brief** shows an intended-user label ("For the reviewing clinician or pharmacist"), a "Basis" panel listing inputs, rules and sources, and a **"Data limitations / unknowns"** panel: caregiver-reported, unverified, missing allergies, missing kidney function, OTC completeness unknown (CDS criterion 4(d)).
6. A **static** emergency banner, never triggered by content (§1.6).
7. **Privacy:** no third-party scripts, analytics, pixels or error telemetry. CSP. IndexedDB encrypted with a passphrase-derived key (WebCrypto). Encrypted export and backup. Delete-all. A one-page "Consumer Health Data Privacy Policy" linked from the start screen (MHMDA style). Disclose that model weights are downloaded and that drug-name lookups to RxNav (if used) leave the device.
8. **Exports:** (a) a print/PDF brief, (b) a CMS-format Medication List, (c) a FHIR R4 document Bundle (§4.3), (d) a Form 3500B draft summary, and (e) optionally a SMART Health Link QR code (planned).
9. **Presentation honesty:** label the Blue Button/SMART import, SHL QR, AGS license, Medicare App Library and clinical validation as **planned**. Label the deterministic rules, on-device extraction, brief and FHIR export as **built**, and only if they are in fact built.

---

## 7. Sources (all accessed 2026-10-10)

**FDA**
- MMA guidance page and PDF: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/policy-device-software-functions-and-mobile-medical-applications ; https://www.fda.gov/media/80958/download
- Enforcement-discretion examples: https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-which-fda-will-exercise-enforcement-discretion
- Not-device examples: https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices
- CDS guidance (29 Jan 2026): https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software ; https://www.fda.gov/media/109618/download
- CDS FAQ: https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs
- General Wellness (6 Jan 2026): https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices ; https://www.fda.gov/media/90652/download
- Digital Health Policy Navigator: https://www.fda.gov/medical-devices/digital-health-center-excellence/digital-health-policy-navigator
- 21 CFR 801.4: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-801/subpart-A/section-801.4
- DHAC Nov 2025: https://www.fda.gov/advisory-committees/advisory-committee-calendar/november-6-2025-digital-health-advisory-committee-meeting-announcement-11062025 ; https://www.fda.gov/media/189618/download
- MedWatch forms: https://www.fda.gov/safety/medical-product-safety-information/medwatch-forms-fda-safety-reporting
- Form 3500B: https://www.fda.gov/media/85598/download
- MedWatch Online: https://www.accessdata.fda.gov/scripts/medwatch/index.cfm?action=reporting.home
- Commentary: Covington https://www.cov.com/en/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance ; FDA Law Blog https://www.thefdalawblog.com/2026/01/a-busy-day-in-the-cdrh-neighborhood-updates-to-the-cds-and-general-wellness-guidance-documents/ ; Cooley https://www.cooley.com/news/insight/2026/2026-01-20-automation-bias-and-clinical-practice-fda-makes-incremental-updates-to-clinical-decision-support-software-guidance ; Loeb https://www.loeb.com/en/insights/passle/2026/01/fda-updates-its-general-wellness-device-frameworkwhat-companies-need-to-know

**Privacy**
- HHS OCR app scenarios: https://www.hhs.gov/sites/default/files/ocr-health-app-developer-scenarios-2-2016.pdf
- HHS health apps: https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html
- HHS breach guidance (unsecured PHI): https://www.hhs.gov/hipaa/for-professionals/breach-notification/guidance/index.html
- FTC HBNR: https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0 ; https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-finalizes-changes-health-breach-notification-rule ; https://www.govinfo.gov/content/pkg/FR-2024-05-30/pdf/2024-10855.pdf
- FTC GoodRx: https://www.ftc.gov/news-events/news/press-releases/2023/02/ftc-enforcement-action-bar-goodrx-sharing-consumers-sensitive-health-info-advertising
- FTC tools: https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool ; https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance
- WA MHMDA: https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.010 ; …19.373.020 ; …19.373.030 ; …19.373.090 ; https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy
- NV SB 370: https://www.bassberry.com/news/nevada-consumer-health-data-law-takes-effect-on-march-31-2024/
- NY: https://www.healthcare-brew.com/stories/2026/01/12/new-york-governor-vetoes-health-data-privacy-bill ; https://www.mofo.com/resources/insights/260316-nyhipa-returns-in-2026-revised-bill
- CA CMIA 56.06: https://california.public.law/codes/ca_civ_code_section_56.06 ; https://oag.ca.gov/sites/default/files/2020%2009-17%20-%20People%20v%20Upward%20Labs%20-%20Complaint.pdf

**Naming and IP**
- Kessler 1993: https://pubmed.ncbi.nlm.nih.gov/8492403/
- Trademark aggregator: https://gleanmark.com/search?q=MEDWATCH
- 42 USC 1320b-10: https://www.govinfo.gov/content/pkg/USCODE-2023-title42/html/USCODE-2023-title42-chap7-subchapXI-partA-sec1320b-10.htm
- MedWatcher: https://policymed.com/2014/01/fda-releases-medwatcher-reporting-for-healthcare-providers-patients-and-caregivers.html
- Beers 2023: https://pubmed.ncbi.nlm.nih.gov/37139824/
- AGS permissions: https://www.americangeriatrics.org/about-us/legal-financial-and-government/copyright-permissions
- CSIS: https://csishealth.com/
- Health in Aging: https://www.healthinaging.org/tools-and-tips/ask-expert-what-do-if-medication-you-take-listed-ags-beers-criteriar-potentially

**Interoperability**
- FHIR R4 core: https://hl7.org/fhir/R4/medicationstatement.html ; https://hl7.org/fhir/R4/bundle.html ; https://hl7.org/fhir/R4/detectedissue.html ; https://hl7.org/fhir/R4/rxnorm.html ; https://hl7.org/fhir/R4/snomedct.html
- IPS: https://hl7.org/fhir/uv/ips/
- US Core: https://hl7.org/fhir/us/core/
- SMART App Launch: https://hl7.org/fhir/smart-app-launch/
- SMART Health Cards and Links: https://hl7.org/fhir/uv/smart-health-cards-and-links/
- Terminology lookups: https://tx.fhir.org ; https://rxnav.nlm.nih.gov/REST/
- ONC HTI-1: https://healthit.gov/regulations/hti-rules/hti-1-final-rule/
- Blue Button: https://bluebutton.cms.gov/api-documentation/ ; https://bluebutton.cms.gov/api-documentation/authorization/ ; https://bluebutton.cms.gov/api-documentation/v3-faq/
- CMS-9115-F: https://www.cms.gov/files/document/cms-9115-f.pdf
- CMS Health Tech Ecosystem: https://www.cms.gov/health-tech-ecosystem
- KFF: https://www.kff.org/medicare/digital-health-tools-and-technologies-an-overview-of-cms-recent-efforts-to-expand-their-use-in-medicare/

**Deployment**
- 42 CFR 423.153: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-423/subpart-D/section-423.153
- CMS MTM page: https://www.cms.gov/medicare/coverage/prescription-drug-coverage-contracting/medication-therapy-management
- CY2025-2027 MTM memos: URLs in §5.1
- Standardized Format zip: https://www.cms.gov/files/zip/mtm-standardized-format-and-technical-instructions-12172024.zip
- 42 CFR 410.15: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-410/subpart-B/section-410.15
- CDC STEADI: https://www.cdc.gov/steadi/about/index.html ; https://www.cdc.gov/steadi/media/pdfs/STEADI-Algorithm-508.pdf ; https://www.cdc.gov/steadi/pdf/provider/steadi-rx/STEADI-Algorithm-508.pdf
- EMPOWER: https://pubmed.ncbi.nlm.nih.gov/24733354/
- D-PRESCRIBE: https://pubmed.ncbi.nlm.nih.gov/30422193/
- Brown bag: https://psnet.ahrq.gov/issue/drug-related-problem-outcomes-and-program-satisfaction-comprehensive-brown-bag-medication ; https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8452550/
- USDeN: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12307437/
