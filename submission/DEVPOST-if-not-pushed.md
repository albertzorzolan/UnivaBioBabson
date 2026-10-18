<!--
Use only if medwatch-v2 was NOT fast-forwarded to kinwise-final; pair with submission/kinwise-one-pager-if-not-pushed.pdf.

For the team only; this block is not part of the Devpost page.
- The primary text is submission/DEVPOST.md. Paste THIS file instead only if medwatch-v2 (commit 375e1e0, which the
  live demo and the Code link serve) was not updated. Every claim below can be checked at 375e1e0 with
  `git show 375e1e0:<path>`; it leaves out everything that exists only on kinwise-final: the confidence intervals and
  the lexicon-only baseline, the ablations, the claim-checker red team and its counted list of live escapes, the
  timeline null study (timeline-null.json) and the runs check's p-values, the brief's sleep line with its averages,
  the lying-and-standing blood-pressure question, the static safety-net line, the Ask tests with several patient
  names, and the README's 5-minute walkthrough. Exception: the Partial row of the Status table keeps the same canonical
  text as in DEVPOST.md (check-facts requires it), so it names the runs check although 375e1e0 does not have it; the
  row therefore adds "(Runs check: not in the Oct 16 build.)" right after it.
- Why there is no number for the flawed AI sentences here: the canonical count ("at least 6 … (from 5 outputs)") is
  counted from the live-escape items in eval/verifier-redteam.json, which does not exist at 375e1e0. The sentences
  themselves are in the branch's eval/results/ai-live.json, so they are described without a count, as on the
  fallback one-pager.
- Checked 2026-10-18 against 375e1e0 (read-only `git show`). Paste each section into the matching Devpost field as
  described at the top of submission/DEVPOST.md: everything under "About the project" (from "The doctor sees the
  medicine list" to the end of "Team") goes into "About the project". check-facts fails if an HTML comment appears in
  that region. Put the YouTube link in the Devpost video field, and upload the code tour PDF with the submission (the
  text below refers to it as uploaded).
- The evaluation table is linked, not pasted: "AI and rigor at a glance" points at the "Evaluation (headline numbers)"
  section of the README at medwatch-v2 (375e1e0), which exists there (the newer "Rigor at a glance" section does not).
- The video is recorded from kinwise-final (scripts/submission/record-demo.mjs), so the text says it was recorded
  from our Oct 18 build while the live demo and the Code link serve the Oct 16 build. If the video is re-recorded
  from another build, change that sentence.

TODO(team):
1. Under "Team", add one true line per teammate about the modules you can walk judges through (for example
   "Albert: …", "Neil: …"; no roles or titles). Word budget: as in DEVPOST.md, the paste region is written to
   650–800 words as rendered (800 now, with the build-date notes) and submission.test.mjs allows up to
   830, which leaves about 30 words for these teammate lines. An
   optional "## What we learned" section (your own words, just before "## Status") fits only if you cut the same
   number of words elsewhere; `node scripts/submission/check-facts.mjs` prints the current count. Draft points, drawn only from results
   recorded at medwatch-v2 (rewrite them, do not paste them as they are):
   - A wording checker blocks the patterns it was written for; the live run showed new wording getting through.
   - Comparing 9 diary items per medicine change produces chance differences.
   - "Dizzy on 9 days" means little without "of 14 answered days".
2. The code-tour rebuild and the removal of the -if-not-pushed files (steps 1 and 3 in DEVPOST.md) apply only once the
   push happens; if it does, paste DEVPOST.md instead of this file.
-->

# Kinwise

## Elevator pitch (Devpost tagline)

A private, in-browser co-pilot that helps families notice what changes after a medicine change in an older parent and bring one clear, cited question to the doctor.

## About the project (Devpost field: paste everything below this heading, through "Team")

**The doctor sees the medicine list, the family sees the symptoms, and nobody lines them up.** In one primary-care study, 37% of medication side effects whose harm could have been reduced were attributed to the patient not telling the doctor ([Gandhi, NEJM 2003](https://pubmed.ncbi.nlm.nih.gov/12700376/)). Kinwise lines up an older adult's own check-ins with her medicine changes and cited geriatric criteria, and gives the family one reviewed page of questions for the clinician, all in the browser.

**Status:** a working prototype on fictional data, not yet tested with real patients, caregivers or clinicians. The knowledge base is not clinician-reviewed, and the optional AI's checker is not airtight.

## Try it in 30 seconds

- **Live demo:** [albertzorzolan.github.io/UnivaBioBabson](https://albertzorzolan.github.io/UnivaBioBabson/) → **Take the 2-minute guided tour**. No sign-up; its status table still calls on-device AI working (now Partial).
- **Demo video:** above. The video was recorded from our Oct 18 build; the live demo and linked code are the Oct 16 build, so a few screens differ.
- **Code:** [github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2](https://github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2); the code tour PDF uploaded with this submission walks through it.
- **Optional AI:** in **Settings**, load the on-device model (about 1.7 GB once), then **Visit brief › Draft with on-device AI**.

## What it does

- **Check-ins in her own words**: "Felt woozy and nearly went over in the kitchen" becomes answers she confirms.
- **A recorded change, not a cause.** Dizziness on 9 of 14 answered days after lorazepam started vs 2 of 19 before, a gap rarely seen by chance in a single comparison; with many comparisons, some flags are chance.
- **A cited medication review** (AGS Beers Criteria® 2023, anticholinergic burden, fall-risk drugs, prescribing cascades), each a question for the clinician.
- **Ask Kinwise** answers from the record; treatment, dose, diagnosis or cause questions get a fixed redirect to the clinician.
- **A one-page visit brief** that prints only after the caregiver reviews it, plus a medication list and an HL7® FHIR® R4 export.

## AI and rigor at a glance

**Rules decide; the model only rewords.** A deterministic engine over a cited knowledge base (427 medicines, 89 Beers rules, 26 cascades) computes every flag and number. An optional on-device LLM may reword them; a code checker is designed to drop unsupported, causal or advice sentences. Symptom extraction: micro-F1 0.942 on 70 held-out synthetic stories. Medication review: 57/57 synthetic medication cases (a written spec, not a blind test). Table and method: [README › Evaluation](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/README.md#evaluation-headline-numbers).

## Who it's for

An adult child caring for a parent on five or more medicines, before an Annual Wellness Visit (its cognitive check weighs family concerns, 42 CFR 410.15) or a Part D medication review (it can include the caregiver if cognitive impairment prevents the patient taking part, 42 CFR 423.153). We aim for better-informed conversations (untested), not fewer adverse events.

## Path to users (hypothesis, not validated)

Part D pharmacists could use the brief in medication reviews; caregiver organisations could distribute it to families. The cheapest test that could disprove this, one pharmacist reading the [sample brief](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/submission/kinwise-sample-visit-brief.pdf), has not been run.

## How it differs

Per vendor pages ([market-evidence.md](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/kb-src/research/market-evidence.md) §2, checked 2026-10-10; "not documented" is not proof of absence), diary apps (MyTherapy, CareClinic, Medisafe) document neither symptoms lined up with medicine start dates nor geriatric criteria; clinician tools (MedStopper, MedSafer) lack the family's observations; general AI assistants (ChatGPT Health) are cloud-based and non-deterministic, with no documented geriatric criteria engine. Kinwise has the family's observations and the criteria, on the family's device.

## Status

| | |
|---|---|
| **Working** | Everything under "What it does"; medicine matching (brands, misspellings); backup and delete-all |
| **Partial** | On-device AI: WebGPU only, tested on one Apple M1 Pro; default model licence research-only (Apache-2.0 options in Settings). Hand-off: shared device or backup file. Knowledge base: not clinician-reviewed, no dose or allergy checks; interactions limited to the AGS Beers 2023 combination table (not a full drug-interaction checker). Timeline runs check: computed for every comparison, not yet gating. (Runs check: not in the Oct 16 build.) English only |
| **Planned** | Encrypted family sharing; encryption of the local record; pharmacist review of the knowledge base; a validation pilot; voice and Spanish |

Kinwise is not FDA-reviewed or cleared and tells families not to stop or change any medicine without the prescriber. Its rules and templates record, display and prompt questions; they never recommend changing a medicine, diagnose or say a medicine caused a symptom. The optional AI is checked for the same, but not airtight: in a recorded live run, flawed AI sentences got past the checker, among them a "can cause" explanation and one predicting "another fall" ([ai-live.json](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/eval/results/ai-live.json)). Emergencies go to 911.

## Team

Albert Zorzolan and Neil Shah, Babson College.

We used AI coding assistants (Claude Code) extensively, under our direction, for code, tests and synthetic data. The design decisions were ours: rules decide and the model only rewords; answered-day denominators; showing the false-alarm rate; the review gate.

## Built with

React, TypeScript, Vite, Recharts, lucide-react, WebLLM, WebGPU, Qwen2.5, Web Workers, Python, HL7 FHIR R4, RxNorm, SNOMED CT, LOINC, AGS Beers Criteria 2023, Vitest, Playwright, axe-core

<!--
Gallery (upload in this order; the first image is the thumbnail). Regenerate all seven from the current app with
`node scripts/submission/screenshots.mjs` (also part of `node scripts/submission/make-pdfs.mjs`); the dates on screen
follow the day it runs. All data is fictional.
1. docs/screenshots/00-thumbnail.png - Thumbnail (3:2): the tagline above the app's real Overview card, dizziness on 9 of 14 answered days after lorazepam started vs 2 of 19 before.
2. docs/screenshots/02-caregiver-overview.png - Caregiver Overview: the before/after counts, the falls and a question for the doctor side by side, with "Shows a change in what was recorded, not what caused it."
3. docs/screenshots/03-timeline.png - Symptoms & timeline: each diary item before vs after lorazepam started, as answered-day counts with a size label; the test's p-value and a runs check are one tap away, under "How reliable is this?".
4. docs/screenshots/04-review.png - Medication review: anticholinergic (ACB) total, medicines on fall-risk lists and AGS Beers 2023 prompts, each a question for her doctor or pharmacist.
5. docs/screenshots/05-visit-brief.png - Visit brief for the clinician: an "At a glance" box, the family's pinned concern and the recorded changes; it prints only after the caregiver ticks "I've reviewed this brief".
6. docs/screenshots/06-patient-today-390.png - Patient check-in on a phone: her own words, read on the device, with the words behind each proposed answer highlighted and her granddaughter's fall set aside.
7. docs/screenshots/01-welcome.png - Welcome: the 2-minute guided tour, or one click to try the demo as Margaret (patient) or Alex (caregiver).
-->
