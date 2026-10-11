# Kinwise: Devpost write-up

## Inspiration

43.0% of US adults 65+ used five or more prescription drugs in the past 30 days (NCHS, 2017–March 2020). In primary care, over a third of fixable
adverse drug events persisted because the patient never told the doctor about the symptom (Gandhi, NEJM 2003), and
fewer than half of older adults who fall tell their doctor (CDC). Families notice the change first ("Mom seems
foggier since the new sleeping pill"), but by the visit it is a vague worry, not a clear question.
Clinician tools have the geriatric criteria but not the home observations; diary apps have the observations but not
the criteria. We wanted to connect the two, without sending a family's health data to anyone.

## What it does

Kinwise is a private, in-browser co-pilot for families caring for an older adult on many medicines.

- **The patient checks in in her own words.** "Felt woozy and nearly went over in the kitchen." On-device clinical
  language processing proposes diary answers, highlights the words behind each one, and sets aside "my granddaughter
  fell off her bike". She confirms every answer.
- **The caregiver sees what changed around each medicine change**, with denominators: in the demo, dizziness was
  recorded on 9 of 14 answered days after lorazepam started, compared with 2 of 19 before (Fisher's exact test). The
  app says this describes what was recorded, not why.
- **A cited medication review** checks the list against the AGS Beers Criteria® 2023, the anticholinergic burden
  (ACB) scale, fall-risk drug lists and prescribing cascades, such as amlodipine → ankle swelling → furosemide.
  Every finding is a question for the clinician, never an instruction.
- **Ask Kinwise** answers questions about the record and redirects treatment or dose questions to the clinician.
- **A one-page visit brief**, reviewed by the caregiver before printing, plus a CMS-style medication list and an HL7
  FHIR R4 export.

## Try it

Planned live demo (not yet deployed): https://albertzorzolan.github.io/UnivaBioBabson/. Code:
https://github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2. Locally: `npm ci && npm run dev`, then open
http://127.0.0.1:5174/. On the Welcome screen click **Try as Alex** (caregiver) or **Try as Margaret** (patient), or
sign in with babson1/babson1 or babson/babson. All data is fictional. Video: submission/kinwise-demo.mp4.

## How we built it

React 19 + TypeScript, no backend; everything runs in the browser. The design rule is "rules decide, the model
writes":

- A **deterministic review engine** over a knowledge base we compiled with a Python build script: 427 medicines,
  766 brand names, 89 Beers rules, 26 cascades, each traceable to a source.
- **Timeline statistics**: Fisher and Mann–Whitney tests checked against R reference values, plus a simulation
  measuring how often a change with no real effect still produces a signal (about 1 in 10, nearly 1 in 5 for
  frequently recorded symptoms). The app shows that rate.
- **Clinical NLP** with a ConText implementation for negation, time and who a symptom belongs to.
- An **optional on-device LLM** (Qwen2.5-3B via WebLLM and WebGPU) that only rewords verified evidence. A code-only
  claim verifier is designed to drop sentences with an unsupported number, an unknown medicine, missing citations,
  or causal, advice or urgency wording. Without the model, deterministic templates do everything.
- A **FHIR document Bundle** that returned 0 errors from the public HAPI R4 validator.

## Challenges we ran into

- **Keeping a small model honest.** In our smoke test our checks dropped model sentences that said something
  caused a symptom, called something "safe" or predicted risk, and suggestions that turned a near-fall into a fall.
  We accepted that the template is often the better output.
- **The verifier is not airtight.** In a live in-app run the verifier still let through 3 flawed outputs (a garbled
  reason sentence, a dizziness suggestion quoted from "Slept like a log", and an explanation saying two of her
  medicines "can cause" confusion and falls), so the model stays optional, every AI output is labelled, and nothing
  reaches the brief without the caregiver's review.
- **Multiple comparisons.** Comparing 9 diary items per medicine change creates false alarms. We measured the rate by
  simulation and require both a p-value and an effect size instead of hiding it.
- **Reading the criteria correctly.** Oxybutynin is not a Beers "avoid" drug; it matters through anticholinergic
  rules. Our independent test author (an AI agent working from the primary tables) caught details like this.
- **Everyday negation**: "didn't fall" vs "nearly fell", "no better", "my sister was dizzy".

## Accomplishments that we're proud of

- An independent medication-review suite: 57 of 57 cases and 295 of 295 expectations pass, and we showed it fails
  when we remove knowledge (for example 33 of 57 with ACB scores zeroed).
- Symptom extraction scores micro-F1 0.942 on a 70-story held-out set never used for tuning.
- 1,245 passing tests, 20 of 20 end-to-end checks, 46 axe accessibility scans with 0 violations reported (the gate fails on serious or critical).
- The How it works page re-runs both evaluations in the browser and lists what is finished vs planned.

## What we learned

- LLMs are useful for wording and unreliable for drug-safety judgements, which matches the literature (Gallifant
  2025; Socrates 2025). Deterministic rules plus a verifier gave us something we can test.
- Honest numbers need denominators; honest statistics need their false-alarm rate on screen.
- FDA's 2026 CDS guidance treats recommendations to caregivers as device functions, so we designed every caregiver
  screen to record, display and prompt questions, never to recommend.

## What's next

- Knowledge-base review by geriatric pharmacists; a usability and accuracy study with caregivers.
- End-to-end encrypted sharing between family members and encryption of the local record.
- Import from pharmacies and patient portals (SMART on FHIR, Medicare Blue Button).
- Voice check-ins and Spanish.
- A Form FDA 3500B (MedWatch) draft the family submits themselves.
- Publishing the live demo (planned at https://albertzorzolan.github.io/UnivaBioBabson/).

Honest limits: all data is fictional, the knowledge base has not been clinician-reviewed, it does not check doses or
allergies, and Kinwise has not been reviewed or cleared by the FDA. We designed it toward FDA's published examples
of record-keeping tools and caregiver medication-information reports, some of which FDA treats as devices under
enforcement discretion.

## Built with

React, TypeScript, Vite, Recharts, lucide-react, WebLLM, WebGPU, Qwen2.5, Web Workers, Python, HL7 FHIR R4, RxNorm,
SNOMED CT, LOINC, AGS Beers Criteria 2023, Vitest, Playwright, axe-core
