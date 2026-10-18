<!--
Before pasting (for the team only; this block is not part of the Devpost page)
- Paste each section below into the matching Devpost field: the tagline into "Elevator pitch", everything from
  "Try it in 30 seconds" to "Team and how we used AI" into "About the project", and "Built with" into the
  "Built with" tags.
- Upload the demo video to YouTube (unlisted is fine). Put that link in the Devpost video field and in the
  "Demo video" line below. Never point judges at the .mp4 inside the repo.
- Upload the gallery images listed in the comment at the bottom, thumbnail first.
- If the Devpost preview does not render a table, turn its rows into bullets.

What the visible page relies on (checked 2026-10-17 against git HEAD 375e1e0 = medwatch-v2 = the live demo):
- Only evidence committed on medwatch-v2: eval/results/nlp-eval.json (held-out micro-F1 0.942),
  eval/results/meds-eval.json (57/57, 295/295), eval/results/ai-live.json (0 external requests; the 6 flawed
  sentences), docs/samples/kinwise-fhir-validation.json (0 errors), src/kb/data/meta.json (KB counts),
  src/engine/timeline/rules.ts ("about 1 in 10"), kb-src/research/market-evidence.md and regulatory.md,
  submission/kinwise-code-tour.pdf.
- NOT on medwatch-v2 or the live demo (on branch kinwise-final, not yet merged into medwatch-v2 or deployed):
  - the hardened claim checker: src/engine/brief/verify.ts, src/ai/tasks.ts;
  - the red team: eval/verifier-redteam.json, eval/verifier.eval.test.ts, eval/verifier-baseline.config.ts,
    eval/results/verifier-redteam.json, eval/VERIFIER-REDTEAM.md;
  - the ablations: eval/meds.ablation.test.ts, eval/medsRunner.ts, eval/ablations/, eval/results/meds-ablation.json;
  - the NLP CI and baseline: the update to eval/results/nlp-eval.json;
  - the timeline null study: src/engine/timeline/signals.null.test.ts, rules.ts, eval/results/timeline-null.json;
  - the README's 5-minute walkthrough.
- Either/or. ONLY IF all of the above is committed, pushed to a branch, the live demo is redeployed from that
  branch, and the Code link below is changed to that branch, swap in the upgrade text below (re-check every number
  against its file first). Otherwise paste the page exactly as it is. Never use the upgrade rows alone: the
  163-of-163 result must always appear together with the held-out probe result (12 of 20) and the post-fix probe
  result (1 of 18 before tuning, 4 of 18 now).

Upgrade text (only after commit + push + redeploy). eval/results/verifier-redteam.json has been regenerated several
times; re-check its generatedAt and every number below against the files before pasting (numbers as in the files
at 2026-10-17 21:30 EDT):
- AI table, symptom-extraction result: "micro-F1 (one score combining missed and wrong answers) 0.942, 95% CI
  0.907–0.971, on 116 fields; word-list-only baseline with ConText off: 0.703 (0.625–0.778)"
  [nlp-eval.json heldout.ci95, heldout.baseline, heldout.baselineCi95]
- AI table, medication-review result, append: "Stub engines with knowledge removed fail cases: 33/57 pass with ACB
  scores zeroed, 49/57 without cascades, 54/57 without the Beers falls rule" [meds-ablation.json]
- AI table, new row "Claim-checker red team (written by an AI agent; not clinician-reviewed)": "The submitted
  checker caught 72 of 163 harmful sentences; after hardening, 163 of 163, and it wrongly rejects 0 of 87 valid
  ones. On 18 paraphrases written after the first fixes, it caught 1 of 18 before any rule was tuned on them; after
  a second round of rules written with those items in view, it catches 4 of 18. On a further 20 written after the
  latest rules and not used to change any rule, it caught 12 of 20 and wrongly rejected 0 of 10 valid ones"
  [verifier-redteam.json before.caught, caught, falseRejects, postFixProbe, postFixProbeAfterTuning, postFixProbe2]
- Method note, append: "163/163 shows the checker blocks the sentences it was fixed against; the 12-of-20 held-out
  result shows that new causal, advice and prediction wording still gets through. That is why AI text is optional,
  labelled and reviewed by the caregiver."
- AI table, timeline result: "at least one moderate-or-strong signal on 11.2% of changes with independent days
  (19.2% with frequent symptoms); 85.8% when each answer repeats the previous day's 80% of the time"
  [timeline-null.json independent, additional frequent stay 0, clustered]; source file: eval/results/timeline-null.json
- Challenges, replace "These are being fixed." with: "The 6 listed outputs are now regression tests the checker
  rejects, but it still misses 8 of 20 paraphrases written after the latest rules: pattern checks narrow what the
  model can say but do not guarantee it." [verifier-redteam.json liveEscapes.nowBlocked 6/6, postFixProbe2]
- Team, replace the last sentence with: "The code tour PDF and the README's 5-minute walkthrough are how we walk
  judges through the code."
-->

# Kinwise

## Elevator pitch (Devpost tagline)

A private, in-browser co-pilot that helps families notice what changes after a medicine change in an older parent and bring one clear, cited question to the doctor.

## Try it in 30 seconds

- **Live demo:** [albertzorzolan.github.io/UnivaBioBabson](https://albertzorzolan.github.io/UnivaBioBabson/) → click **Try as Alex** (no sign-up, fictional data).
- **Demo video:** (YouTube link in the video field above)
- **Code:** [github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2](https://github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2)
- Optional on-device AI: desktop Chrome or Edge with WebGPU, about 1.7 GB on first use; everything else works in any modern browser.
- Demo dates follow today's date; the counts match the video.

## Inspiration

Alex, our fictional demo caregiver, writes: *"Mom seems foggier in the mornings since urgent care started the new sleeping pill. She almost fell in the bathroom on Wednesday."*

43.0% of US adults 65+ used five or more prescription drugs in the past 30 days ([NCHS](https://www.cdc.gov/nchs/hus/topics/rx-drug-use.htm)). In primary care, 19 of 51 (37%) ameliorable adverse drug events (harm that could have been reduced) were attributed to the patient not telling the physician about the symptoms ([Gandhi, NEJM 2003](https://pubmed.ncbi.nlm.nih.gov/12700376/)). Less than half of older adults who fall tell their doctor ([CDC](https://www.cdc.gov/falls/data-research/facts-stats/index.html)).

## What it does

- **Check-ins in her own words.** On-device language processing turns "Felt woozy and nearly went over in the kitchen" into proposed answers she confirms, quoting the words behind each.
- **Before/after counts.** In the demo, dizziness was recorded on 9 of 14 answered days after lorazepam started vs 2 of 19 before (Fisher's exact test). Kinwise says what was recorded, never why.
- **A cited medication review:** AGS Beers Criteria® 2023 (medicines that are potentially inappropriate for many older adults), anticholinergic burden, fall-risk drugs and prescribing cascades (a side effect mistaken for a new condition and treated with another drug), each phrased as a question for the clinician.
- **Ask Kinwise** answers from the record and says treatment questions are for the clinician (it contacts no one).
- **A one-page visit brief**, printed only after the caregiver reviews it, plus a medication list and an HL7 FHIR R4 export (a standard health-data format).

## How it differs

From vendor pages checked 2026-10-10 ([market-evidence.md](https://github.com/albertzorzolan/UnivaBioBabson/blob/medwatch-v2/kb-src/research/market-evidence.md) §2); "not documented" is not proof of absence.

| Tools | Not documented on vendor pages |
|---|---|
| Reminder and interaction apps (Medisafe, Apple Health) | Symptoms lined up with medicine start dates; geriatric criteria |
| Symptom diaries (MyTherapy, CareClinic) | Before/after counts around a medicine start |
| Clinician Beers/STOPP and deprescribing tools (MedStopper, MedSafer, deprescribing.org) | What the family observes at home |
| Cloud chatbots for appointment prep (e.g. ChatGPT Health) | A deterministic timeline method or geriatric criteria engine |

The gap: home observations lined up with medicine start dates, with denominators, beside cited geriatric criteria phrased as clinician questions, on the family's device.

## Who it's for and why it could help

- **For:** an adult child caring for a parent on five or more medicines (55% of US family caregivers give medicines, pills or injections; AARP & NAC 2025).
- **When:** before a Medicare Annual Wellness Visit or a Part D pharmacist's Comprehensive Medication Review, which CMS lets the pharmacist do with the caregiver when the beneficiary cannot take part because of cognitive impairment.
- **The clinician gets** one page with the cited criterion and home counts, and decides.
- **Reasons to test Kinwise, not proof it works.** EMPOWER (cluster RCT, n=303): a direct-to-patient educational brochure led to 27% vs 5% benzodiazepine discontinuation at 6 months; the brochure included a taper plan, which Kinwise leaves to the clinician. D-PRESCRIBE (cluster RCT, n=489): a consumer-targeted, pharmacist-led educational intervention (education to patients plus a pharmaceutical opinion sent to their physicians) led to 43% vs 12% no longer filling the inappropriate prescription at 6 months.
- **Caution:** in the MedSafer trial, rule-based flags increased deprescribing without reducing 30-day adverse drug events. We claim better-informed conversations, not fewer adverse events.
- Kinwise has not been tested with real patients, caregivers or clinicians.

## How we built it

React 19 + TypeScript, no backend. **Rules decide; the model writes:**

- A **deterministic review engine** (same input, same output) over a compiled knowledge base: 427 medicines, 766 brand names, 89 Beers rules, 26 cascades, each traced to a source.
- **Statistics** (Fisher, Mann–Whitney) tested against R's documented examples; **language processing** with ConText (a published method for negation, timing and whose symptom it is).
- An **optional on-device LLM** (Qwen2.5-3B via WebLLM on WebGPU) only rewords verified evidence; a code-only claim checker is designed to drop unsupported numbers, medicines or citations and causal, advice or urgency wording. Without the model, templates do everything.
- **FHIR:** the R4 export is interoperability readiness; today the clinician gets the printed brief and medication list.

## AI and rigor at a glance

| Measured | Result | Source file |
|---|---|---|
| Symptom extraction, 70 held-out stories not used for tuning | micro-F1 0.942 on 116 fields (one score for missed and wrong answers) | `eval/results/nlp-eval.json` |
| Medication review vs a written case file | 57/57 cases, 295/295 expectations | `eval/results/meds-eval.json` |
| Timeline false alarms (simulated, no real change, independent days) | about 1 in 10 medicine changes still showed at least one moderate-or-strong signal | `src/engine/timeline/rules.ts` |
| Live AI run, real WebGPU | 0 external requests during the run (model files from a local copy; the live demo downloads the weights from huggingface.co once) | `eval/results/ai-live.json` |
| FHIR sample, HAPI R4 validator | 0 errors | `docs/samples/kinwise-fhir-validation.json` |

A separate AI agent wrote the synthetic medication cases from the primary sources without seeing the engine code; not clinician-reviewed. The case file was available during engine development, so 57/57 shows the code meets a written spec, not clinical validity.

## Challenges we ran into

- **The claim checker is not airtight.** In a live in-app run, at least 6 flawed AI outputs got through, among them a garbled sentence, diary suggestions quoted from unrelated words, a "can cause" explanation, a suggestion that some medicines "might be" replaced, and one predicting "another fall" (`eval/results/ai-live.json`). These are being fixed; meanwhile the model stays optional.
- **Multiple comparisons and confounding.** Comparing 9 diary items per medicine change creates false alarms, so we measure their rate and require a sizeable difference with p < 0.05. That measurement treats days as independent, but symptoms come in runs, a medicine may start during a bad spell, and doses are not logged. So Kinwise reports a difference, never a cause.

## Status

| | |
|---|---|
| **Working** | Public live demo; check-in with on-device language processing; medicine matching (brands, misspellings); cited review; before/after timeline; Ask Kinwise; visit brief with review gate; medication list; FHIR export; backup and delete-all |
| **Partial** | On-device AI: desktop Chrome or Edge with WebGPU, tested on one Apple M1 Pro, checker not airtight; the default Qwen2.5-3B has a research-only (non-commercial) licence, and Apache-2.0 models are selectable in Settings. Patient-to-caregiver hand-off: one shared device today, or a backup file. FHIR: no receiving system yet. Knowledge base: not clinician-reviewed, no dose or allergy checks. English only |
| **Planned** | Encrypted family sharing; encryption of the local record; pharmacist review of the knowledge base; a validation pilot; pharmacy and portal import; voice and Spanish |

Kinwise is not FDA-reviewed or cleared. Its rules and templates record, display and prompt questions, and never recommend starting, stopping or changing a medicine. The optional AI is instructed and checked not to, but in testing some advice-like wording got past the checker (see Challenges), so AI text is labelled and nothing reaches the brief without caregiver review.

## What's next

- End-to-end encrypted family sharing, so patient and caregiver each use their own device.
- A validation pilot with geriatric pharmacists and caregivers, with n and endpoints set before we start.

## Team and how we used AI

Albert Zorzolan and Neil Shah, Babson College.

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
