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
  row therefore adds "(The runs check is in our newer code, not in the Oct 16 build linked here.)" right after it.
- Why there is no number for the flawed AI sentences here: the canonical count ("at least 6 … (from 5 outputs)") is
  counted from the live-escape items in eval/verifier-redteam.json, which does not exist at 375e1e0. The sentences
  themselves are in the branch's eval/results/ai-live.json, so they are described without a count, as on the
  fallback one-pager.
- Checked 2026-10-18 against 375e1e0 (read-only `git show`). Paste each section into the matching Devpost field as
  described at the top of submission/DEVPOST.md: everything under "About the project" (from "The doctor sees the
  medicine list" to the end of "Team") goes into "About the project". check-facts fails if an HTML comment appears in
  that region. Put the YouTube link in the Devpost video field, and upload the code tour PDF with the submission (the
  text below refers to it as uploaded).

TODO(team):
1. Under "Team", add one true line per teammate about the modules you can walk judges through (for example
   "Albert: …", "Neil: …"; no roles or titles). Word budget: the paste region is about 1,370 words as rendered,
   and submission.test.mjs allows up to 1,450, so the bound includes about 50 words for these teammate lines. An
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

**The doctor sees the medicine list, the family sees the symptoms, and nobody lines them up.** In one primary-care study, 37% of medication side effects whose harm could have been reduced were attributed to the patient not telling the doctor ([Gandhi, NEJM 2003](https://pubmed.ncbi.nlm.nih.gov/12700376/)). Kinwise lines up an older adult's own check-ins with her medicine changes and cited geriatric criteria, and gives the family one reviewed page of questions for the clinician, all in the browser with no backend.

## Try it in 30 seconds

- **Live demo:** [albertzorzolan.github.io/UnivaBioBabson](https://albertzorzolan.github.io/UnivaBioBabson/) → **Take the 2-minute guided tour**. No sign-up; all data is fictional. The live demo is the build submitted on Oct 16; its status table still lists the on-device model as working; we now rate it Partial.
- **Demo video:** in the video field above.
- **Code:** [github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2](https://github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2); the code tour PDF uploaded with this submission walks through it.
- **The AI path:** load the on-device model in **Settings** (desktop Chrome or Edge with WebGPU; about 1.7 GB on first use), then open **Visit brief › Draft with on-device AI**; the app says how many sentences the code checker removed. A brief draft took 57.6 s in our recorded run on an Apple M1 Pro (`eval/results/ai-live.json`). Everything else works without it.

## What a judge should see

- **A recorded change, not a cause.** Dizziness on 9 of 14 answered days after lorazepam started vs 2 of 19 before (Fisher p = 0.0023). The timeline also shows her sleep ratings as higher after the start, so the family sees a welcome change as well as the unwelcome ones.
- **Ask redirects.** Ask Kinwise answers from the record with evidence chips; questions about treatment, doses, diagnosis or cause get a fixed redirect to the clinician before any model call.
- **The checker hides failed AI wording.** A failing AI sentence is removed, and if the draft fails the check the code-written template is shown instead.
- **Review gate and export.** The brief prints only after the caregiver marks it reviewed; the record exports as FHIR.

## What it does

- **Check-ins in her own words.** On-device language processing turns "Felt woozy and nearly went over in the kitchen" into proposed answers she confirms, quoting the words behind each.
- **Before/after counts** around every medicine started or stopped, with answered-day denominators (Fisher's exact test). It says what was recorded, never why.
- **A cited medication review:** AGS Beers Criteria® 2023, anticholinergic burden, fall-risk drugs, prescribing cascades and what-to-watch-for signs, each phrased as a question for the clinician.
- **A one-page visit brief**, a medication list and an HL7 FHIR R4 export (HAPI validator: 0 errors against base R4; codes not terminology-checked).

## AI and rigor at a glance

**Rules decide; the model only rewords.** A deterministic engine over a cited knowledge base (427 medicines, 89 Beers rules, 26 cascades) computes every flag and number; an optional on-device LLM (Qwen2.5-3B, WebGPU) may reword them, and a code checker is designed to drop unsupported, causal or advice sentences. All test data is synthetic and not clinician-reviewed.

| Measured | Result | Source file |
|---|---|---|
| Symptom extraction, 70 held-out stories never used for tuning | micro-F1 0.942 on 116 fields | `eval/results/nlp-eval.json` |
| Medication review vs a written case file | 57/57 synthetic medication cases (a written spec, not a blind test: the case file was available during engine development) | `eval/results/meds-eval.json` |
| Timeline chance rate (simulated, no real change, independent days) | about 1 in 10 medicine changes still showed a moderate signal, more if symptoms come in runs of days (not measured), so a flag is only ever a question | `src/engine/timeline/rules.ts` |
| Live AI run, real WebGPU | 0 external requests during the run (model files served from a local copy; no diary data is sent); the checker is not airtight (see Status) | `eval/results/ai-live.json` |

## Who it's for

An adult child caring for a parent on five or more medicines, before an Annual Wellness Visit or a pharmacist's medication review.

- **The picture is split across prescribers.** Demo patient Margaret has four prescribers; her primary-care doctor does not know urgent care started lorazepam. In one outpatient study, 76% of patients had at least one discrepancy between their chart and what they took (Bedell, Arch Intern Med 2000).
- **The visits already ask for what the family sees.** The Annual Wellness Visit's cognitive check must consider concerns raised by family members or caretakers (42 CFR 410.15); a Part D pharmacist may do the Comprehensive Medication Review with the caregiver when cognitive impairment keeps the patient from taking part (42 CFR 423.153).
- **Beers is not the whole story.** Medicines on Beers-based avoid or high-risk lists were implicated in under 2% of emergency care for medication harm in older adults (Budnitz 2011; Shehab 2016); blood thinners and diabetes medicines lead (Budnitz 2021), so Kinwise also shows what to watch for with them.

**Reasons to test, not proof.** In EMPOWER (cluster RCT, n=303), a direct-to-patient brochure with a taper plan led to 27% vs 5% benzodiazepine discontinuation at 6 months; in MedSafer, rule-based flags increased deprescribing without reducing 30-day adverse drug events. So we aim for better-informed conversations (untested), not fewer adverse events. Kinwise never suggests stopping a medicine; it tells families not to stop or change any medicine without the prescriber, and that a regularly used benzodiazepine is reduced gradually rather than stopped suddenly (FDA 2020 boxed warning).

## Path to users (hypothesis, not validated)

- Part D MTM pharmacists already run Comprehensive Medication Reviews and could take the brief as input.
- Caregiver organisations as distribution; free for families.
- The cheapest test that could prove this wrong: one pharmacist reading the [sample brief](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/submission/kinwise-sample-visit-brief.pdf). We have not run it yet.

Check-ins stay light: one typed sentence, answers she only confirms, and "You've checked in on N of the last 7 days" (voice input is planned).

## How it differs

Vendor pages checked 2026-10-10 ([market-evidence.md](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/kb-src/research/market-evidence.md) §2; "not documented" is not proof of absence): diary and reminder apps (MyTherapy, CareClinic, Medisafe) do not document symptoms lined up with medicine start dates or geriatric criteria; clinician tools (MedStopper, MedSafer) have the criteria but not the family's observations. Kinwise has both, on the family's own device.

## Status

| | |
|---|---|
| **Working** | Public live demo; check-in with on-device language processing; medicine matching (brands, misspellings); cited review; before/after timeline; Ask Kinwise; visit brief with review gate; medication list; FHIR export; backup and delete-all |
| **Partial** | On-device AI: desktop Chrome or Edge with WebGPU, tested on one Apple M1 Pro, checker not airtight; the default Qwen2.5-3B has a research-only (non-commercial) licence, and Apache-2.0 models are selectable in Settings. Patient-to-caregiver hand-off: one shared device today, or a backup file. FHIR: no receiving system yet. Knowledge base: not clinician-reviewed, no dose or allergy checks; interactions limited to the AGS Beers 2023 combination table (not a full drug-interaction checker). Timeline runs check: computed for every comparison, not yet gating. (The runs check is in our newer code, not in the Oct 16 build linked here.) English only |
| **Planned** | Encrypted family sharing; encryption of the local record; pharmacist review of the knowledge base; a validation pilot; pharmacy and portal import; voice and Spanish |

**The checker is not airtight.** In a recorded live run, flawed AI sentences got past it, among them a garbled sentence, a "can cause" explanation and one predicting "another fall" (`eval/results/ai-live.json`). So AI text stays optional and labelled, and the caregiver reviews every brief.

Kinwise is not FDA-reviewed or cleared. Its rules and templates record, display and prompt questions for the clinician; they never recommend changing a medicine, never diagnose and never say a medicine caused a symptom. The optional AI is checked for the same, but the check is not airtight (above). Emergencies go to 911.

## What's next

**Planned, not started:** pharmacist review of the knowledge base, then a pre-registered pilot in which pharmacists rate briefs from consenting caregivers' diaries (primary endpoint: visits where the clinician discusses a flagged medicine). Kinwise has not been tested with real patients, caregivers or clinicians.

## Team

Albert Zorzolan and Neil Shah, Babson College.

We used AI coding assistants (Claude Code) extensively, as the organizers encourage, under our direction for code, tests and synthetic test data. The design decisions were ours: rules decide and the model only rewords; answered-day denominators; showing the false-alarm rate; the review gate. We walk judges through the code with the code tour PDF uploaded with this submission.

## Built with

React, TypeScript, Vite, Recharts, lucide-react, WebLLM, WebGPU, Qwen2.5, Web Workers, Python, HL7 FHIR R4, RxNorm, SNOMED CT, LOINC, AGS Beers Criteria 2023, Vitest, Playwright, axe-core

<!--
Gallery (upload in this order; the first image is the thumbnail). Regenerate all seven from the current app with
`node scripts/submission/screenshots.mjs` (also part of `node scripts/submission/make-pdfs.mjs`); the dates on screen
follow the day it runs. All data is fictional.
1. docs/screenshots/00-thumbnail.png - Thumbnail (3:2): the tagline above the app's real Overview card, dizziness on 9 of 14 answered days after lorazepam started vs 2 of 19 before.
2. docs/screenshots/02-caregiver-overview.png - Caregiver Overview: the before/after counts, the falls and a question for the doctor side by side, with "Shows a change in what was recorded, not what caused it."
3. docs/screenshots/03-timeline.png - Symptoms & timeline: each diary item before vs after lorazepam started, as answered-day counts with a size label, the test's p-value and a runs check.
4. docs/screenshots/04-review.png - Medication review: anticholinergic (ACB) total, medicines on fall-risk lists and AGS Beers 2023 prompts, each a question for her doctor or pharmacist.
5. docs/screenshots/05-visit-brief.png - Visit brief for the clinician: an "At a glance" box, the family's pinned concern and the recorded changes; it prints only after the caregiver ticks "I've reviewed this brief".
6. docs/screenshots/06-patient-today-390.png - Patient check-in on a phone: her own words, read on the device, with the words behind each proposed answer highlighted and her granddaughter's fall set aside.
7. docs/screenshots/01-welcome.png - Welcome: the 2-minute guided tour, or one click to try the demo as Margaret (patient) or Alex (caregiver).
-->
