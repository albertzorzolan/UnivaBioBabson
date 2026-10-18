<!--
Use only if medwatch-v2 was NOT fast-forwarded to kinwise-final; pair with submission/kinwise-one-pager-if-not-pushed.pdf.

For the team only; this block is not part of the Devpost page.
- The primary text is submission/DEVPOST.md. Paste THIS file instead only if medwatch-v2 (commit 375e1e0, which the
  live demo and the Code link serve) was not updated. Every claim below can be checked at 375e1e0 with
  `git show 375e1e0:<path>`; it leaves out everything that exists only on kinwise-final: the confidence intervals and
  the ConText-off baseline, the ablations, the claim-checker red team and its counted list of live escapes, the
  timeline null study (timeline-null.json), the runs check, the lying-and-standing blood-pressure question, the
  static safety-net line, the Ask tests with several patient names, and the README's 5-minute walkthrough.
- Why there is no number for the flawed AI sentences here: the canonical count ("at least 6 … (from 5 outputs)") is
  counted from the live-escape items in eval/verifier-redteam.json, which does not exist at 375e1e0. The sentences
  themselves are in the branch's eval/results/ai-live.json, so they are described without a count, as on the
  fallback one-pager.
- Checked 2026-10-18 against 375e1e0 (read-only `git show`). Paste each section into the matching Devpost field as
  described at the top of submission/DEVPOST.md; put the YouTube link in the Devpost video field.
-->

# Kinwise

## Elevator pitch (Devpost tagline)

A private, in-browser co-pilot that helps families notice what changes after a medicine change in an older parent and bring one clear, cited question to the doctor.

## Try it in 30 seconds

- **Live demo:** [albertzorzolan.github.io/UnivaBioBabson](https://albertzorzolan.github.io/UnivaBioBabson/) → click **Take the 2-minute guided tour** (or **Try as Alex** to explore). No sign-up; all data is fictional.
- **Demo video:** (YouTube link in the video field above) <!-- TODO(team): after uploading the video to YouTube, you may also paste its link here. -->
- **Code:** [github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2](https://github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2)
- The optional on-device AI needs desktop Chrome or Edge with WebGPU and about 1.7 GB on first use; everything else runs in the browser (tested in desktop Chrome).
- Demo dates follow today's date; the counts match the video.

## What a judge should see

- **The click path:** the 8-step guided tour goes from Margaret's check-in to Alex's Overview, the before/after timeline, the cited medication review and the one-page visit brief, and ends on How it works, where **Run the extraction benchmark now** re-runs our NLP benchmark in your browser.
- **A recorded change, not a cause:** dizziness was recorded on 9 of 14 answered days after lorazepam started, vs 2 of 19 in the 21 days before. Kinwise shows the counts and asks the clinician a question; it never says the medicine did it.
- **Measured:** 57/57 synthetic medication-review cases pass (synthetic cases; a written spec, not clinical validity; the case file was available during engine development). On 70 held-out stories never used for tuning, symptom extraction scores micro-F1 0.942 on 116 fields.
- **The AI only rewords checked evidence:** rules decide every flag and number; an on-device 3B model may reword them, and a code checker drops unsupported sentences. It is not airtight: in one recorded live run, flawed AI sentences got past it (see Challenges), so the template stays the default.
- **Honest status:** the Working / Partial / Planned table below; the app shows what is finished and planned under How it works › Finished vs planned.

## Inspiration

Alex, our fictional demo caregiver, writes: *"Mom seems foggier in the mornings since urgent care started the new sleeping pill."*

Kinwise lined that note up with her mother's check-ins: dizziness on 9 of 14 answered days since lorazepam started vs 2 of 19 before, next to the AGS Beers Criteria® 2023 entry that lists lorazepam among medicines older adults should generally avoid. Alex took the brief's question to the visit: *"Is Lorazepam (Ativan) still the best option for sleep or anxiety, and are there alternatives with less effect on balance and memory?"*

43.0% of US adults 65+ used five or more prescription drugs in the past 30 days ([NCHS](https://www.cdc.gov/nchs/hus/topics/rx-drug-use.htm)). In primary care, 37% of ameliorable adverse drug events (harm that could have been reduced) were attributed to the patient not telling the physician about symptoms, and 63% to the physician not acting on them ([Gandhi, NEJM 2003](https://pubmed.ncbi.nlm.nih.gov/12700376/)). Less than half of older adults who fall tell their doctor ([CDC](https://www.cdc.gov/falls/data-research/facts-stats/index.html)).

## What it does

- **Check-ins in her own words.** On-device language processing turns "Felt woozy and nearly went over in the kitchen" into proposed answers she confirms, quoting the words behind each.
- **Before/after counts.** In the demo, dizziness was recorded on 9 of 14 answered days after lorazepam started vs 2 of 19 before (Fisher's exact test). Kinwise says what was recorded, never why.
- **A cited medication review:** AGS Beers Criteria® 2023 (medicines that are potentially inappropriate for many older adults), anticholinergic burden, fall-risk drugs, prescribing cascades (a side effect mistaken for a new condition and treated with another drug) and what-to-watch-for signs, each phrased as a question for the clinician.
- **Ask Kinwise** answers from the record. Before any model call, keyword and pattern rules send treatment, dose, diagnosis and cause questions to a fixed redirect to the clinician, and emergency words to the 911 line (it contacts no one).
- **A one-page visit brief**, printed only after the caregiver reviews it, plus a medication list and an HL7 FHIR R4 export (a standard health-data format).

## Who it's for and why it could help

For an adult child caring for a parent on five or more medicines (55% of US family caregivers give medicines, pills or injections; AARP & NAC 2025), before a Medicare Annual Wellness Visit or a pharmacist's medication review. The clinician gets one page and decides.

- **The picture is split across prescribers.** In the demo, Margaret has four prescribers (primary care, cardiology, urology, urgent care) plus an over-the-counter sleep aid, and Alex notes that her primary-care doctor does not know urgent care started lorazepam. In one outpatient study, 76% of patients had at least one discrepancy between their chart and what they actually took (Bedell, Arch Intern Med 2000).
- **The visit already asks for what the family sees.** The Medicare Annual Wellness Visit must assess cognitive impairment with due consideration of concerns raised by family members or caretakers, and covers fall risk and medication use (42 CFR 410.15). A Part D pharmacist may do the Comprehensive Medication Review with the caregiver when the beneficiary cannot take part because of cognitive impairment (42 CFR 423.153).
- **Fall prevention already includes a medication review.** CDC STEADI includes a review of fall-risk medicines, which Kinwise's fall-risk list prepares for.
- **Beers is not the whole story.** Medicines on Beers-based avoid or high-risk lists were implicated in under 2% of emergency care for medication harm in older adults (1.2% of emergency hospitalizations for Beers-type high-risk medicines, Budnitz 2011; 1.8% of ED visits for Beers "always avoid" medicines, Shehab 2016); the most common causes are blood thinners and diabetes medicines (Budnitz 2021). So Kinwise also shows cited what-to-watch-for signs for blood thinners, diabetes medicines, opioids and digoxin.
- **Reasons to test Kinwise, not proof it works.** EMPOWER (cluster RCT, n=303): a direct-to-patient educational brochure led to 27% vs 5% benzodiazepine discontinuation at 6 months; the brochure included a taper plan, which Kinwise leaves to the clinician. D-PRESCRIBE (cluster RCT, n=489): a consumer-targeted, pharmacist-led educational intervention led to 43% vs 12% no longer filling the inappropriate prescription at 6 months. In the MedSafer trial, rule-based flags increased deprescribing without reducing 30-day adverse drug events, so we claim better-informed conversations, not fewer adverse events.

## How it differs

From vendor pages checked 2026-10-10 ([market-evidence.md](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/kb-src/research/market-evidence.md) §2); "not documented" is not proof of absence.

| Tools | Not documented on vendor pages |
|---|---|
| Reminder and interaction apps (Medisafe, Apple Health) | Symptoms lined up with medicine start dates; geriatric criteria |
| Symptom diaries (MyTherapy, CareClinic) | Before/after counts around a medicine start |
| Clinician Beers/STOPP and deprescribing tools (MedStopper, MedSafer, deprescribing.org) | What the family observes at home |
| Cloud chatbots for appointment prep (e.g. ChatGPT Health) | A deterministic timeline method or geriatric criteria engine |

The gap: home observations lined up with medicine start dates, with denominators, beside cited geriatric criteria phrased as clinician questions, on the family's device.

## How we built it

React 19 + TypeScript, no backend. **Rules decide; the model only rewords:**

- A **deterministic review engine** (same input, same output) over a compiled knowledge base: 427 medicines, 766 brand names, 89 Beers rules, 26 cascades, each traced to a source.
- **Statistics** (Fisher, Mann–Whitney) tested against R's documented examples; **language processing** with ConText (a published method for negation, timing and whose symptom it is).
- An **optional on-device LLM** (Qwen2.5-3B via WebLLM on WebGPU) only rewords verified evidence; a code-only claim checker is designed to drop unsupported numbers, medicines or citations and causal, advice or urgency wording. Without the model, templates do everything.
- **FHIR:** validated against base R4 structure with the HAPI validator: 0 errors; codes not terminology-checked (25 warnings); no US Core/IPS profile. Today the clinician gets the printed brief and medication list.

## AI and rigor at a glance

All test data is synthetic: the stories and cases were written by separate AI agents directed by the team (labels follow `eval/ANNOTATION-GUIDE.md`); not clinician-reviewed.

| Measured | Result | Source file |
|---|---|---|
| Symptom extraction, 70 held-out stories not used for tuning | micro-F1 0.942 on 116 fields (one score for missed and wrong answers) | `eval/results/nlp-eval.json` |
| Medication review vs a written case file | 57/57 synthetic cases, 295/295 expectations (a written spec, not clinical validity; the case file was available during engine development) | `eval/results/meds-eval.json` |
| Timeline false alarms (simulated, no real change, independent days) | about 1 in 10 medicine changes still showed at least one moderate-or-strong signal | `src/engine/timeline/rules.ts` |
| Live AI run, real WebGPU | 0 external requests during the run (model files served from a local copy; the live demo downloads the model files once, weights from huggingface.co and the compiled library from GitHub, and no diary data is sent) | `eval/results/ai-live.json` |
| On-device model smoke test | one brief draft: 9 of 9 sentences kept, about 60 s (n = 1) | `eval/results/llm-smoke.json` |
| FHIR sample, HAPI R4 validator | 0 errors | `docs/samples/kinwise-fhir-validation.json` |

## Accomplishments that we're proud of

- The benchmarks re-run live in the demo: How it works runs the NLP benchmark and the medication-review suite in your browser.
- A 3B language model on WebGPU in the browser, with 0 external requests in a recorded run (model files served from a local copy; the live demo downloads the model files once, weights from huggingface.co and the compiled library from GitHub, and no diary data is sent).
- An HL7 FHIR R4 export, HAPI-validated with 0 errors.
- 427 medicines, 89 Beers rules and 26 cascades traced to their sources (`src/kb/data/meta.json`).

## What we learned

<!-- TODO(team): these are drawn only from results recorded at medwatch-v2; rewrite them in your own words if you like. -->
- A wording checker blocks the patterns it was written for, and the live run showed new wording getting through, so the deterministic template stays the default and AI text stays optional.
- Comparing 9 diary items per medicine change means that, in simulations with independent days, about 1 in 10 changes with no real effect still shows a signal (more if symptoms come in runs, which we have not measured), so a signal can only ever be a question.
- Denominators matter: "dizzy on 9 days" means little without "of 14 answered days".

## Challenges we ran into

- **The claim checker is not airtight.** In a recorded live in-app run, flawed AI sentences got past it, among them a garbled sentence, diary suggestions quoted from unrelated words, a "can cause" explanation, a suggestion that some medicines "might be" replaced, and one predicting "another fall" (`eval/results/ai-live.json`). Meanwhile the model stays optional.
- **Multiple comparisons and confounding.** Comparing 9 diary items per medicine change creates false alarms, so we measure their rate and require a sizeable difference with p < 0.05. That measurement treats days as independent, but symptoms come in runs, a medicine may start during a bad spell, and doses are not logged. A flagged difference is a prompt for the clinician, never evidence about the medicine.

## Status

| | |
|---|---|
| **Working** | Public live demo; check-in with on-device language processing; medicine matching (brands, misspellings); cited review; before/after timeline; Ask Kinwise; visit brief with review gate; medication list; FHIR export; backup and delete-all |
| **Partial** | On-device AI: desktop Chrome or Edge with WebGPU, tested on one Apple M1 Pro, checker not airtight; the default Qwen2.5-3B has a research-only (non-commercial) licence, and Apache-2.0 models are selectable in Settings. Patient-to-caregiver hand-off: one shared device today, or a backup file. FHIR: no receiving system yet. Knowledge base: not clinician-reviewed, no dose or allergy checks. English only |
| **Planned** | Encrypted family sharing; encryption of the local record; pharmacist review of the knowledge base; a validation pilot; pharmacy and portal import; voice and Spanish |

Kinwise is not FDA-reviewed or cleared. Its rules and templates record, display and prompt questions, and never recommend starting, stopping or changing a medicine. The optional AI is instructed and checked not to, but in testing some advice-like wording got past the checker (see Challenges), so AI text is labelled and nothing reaches the brief without caregiver review.

## What's next

**Planned, not started: a pilot, pre-registered before enrolment.**

1. Pharmacists rate the accuracy and usefulness of briefs built from consenting caregivers' diaries.
2. Primary endpoint: the share of visits in which the clinician discusses at least one flagged medicine. Secondary endpoint: pharmacy-fill changes for flagged Beers medicines at 6 months, the endpoint used by EMPOWER and D-PRESCRIBE. Safety (planned): adverse events after any change the clinician makes (for example withdrawal symptoms, falls, ED visits) would be recorded and reviewed; any change is the clinician's decision.

Kinwise has not been tested with real patients, caregivers or clinicians.

**Planned path to users:** pharmacists doing Medicare Part D Comprehensive Medication Reviews, and caregiver organisations. Before that: pharmacist review of the knowledge base, and end-to-end encrypted family sharing so patient and caregiver can each use their own device.

## Team

Albert Zorzolan and Neil Shah, Babson College.

<!-- TODO(team): add one true line each about which modules you can walk judges through (e.g. "Albert: …",
"Neil: …"). Do not add roles or titles. -->

We used AI coding assistants (Claude Code) extensively, as the organizers encourage, to write code, tests and synthetic evaluation data under our direction. The design decisions were ours: rules decide and the model only rewords; answered-day denominators; measuring and showing the false-alarm rate; the caregiver review gate; no causal or advice wording. The [code tour PDF](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/submission/kinwise-code-tour.pdf) is how we walk judges through the code.

## Built with

React, TypeScript, Vite, Recharts, lucide-react, WebLLM, WebGPU, Qwen2.5, Web Workers, Python, HL7 FHIR R4, RxNorm, SNOMED CT, LOINC, AGS Beers Criteria 2023, Vitest, Playwright, axe-core

<!--
Gallery (upload in this order; the first image is the thumbnail)
1. docs/screenshots/02-caregiver-overview.png - Caregiver overview: dizziness on 9 of 14 answered days after lorazepam started vs 2 of 19 before.
2. docs/screenshots/01-welcome.png - Welcome screen: one click to try the fictional demo as Alex or Margaret.
3. docs/screenshots/06-patient-today-390.png - Patient check-in on a phone: her own words, with the words behind each answer highlighted.
4. docs/screenshots/04-review.png - Medication review: ACB total, fall-risk list and Beers prompts, each cited and phrased as a question.
5. docs/screenshots/05-visit-brief.png - One-page visit brief for the clinician, printed only after the caregiver reviews it.
-->
