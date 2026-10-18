# Reviewer FAQ: likely questions, with the code to open

The questions a reviewer is most likely to ask about Kinwise, each with a short, honest answer and the place to open
in the code. Each pointer names a file and a symbol in it, such as `src/engine/brief/verify.ts › verifyClaims`, so
it stays correct when lines move: open the file and search for the symbol name. Every number here is copied from
the results file named next to it. Where an answer is uncertain, it says so.

Most UnivaBio judges are software engineers, AI scientists, PMs and founders, so the questions lean towards how the
code works and how we know it works, more than clinical detail.

---

### 1. "How does the before/after comparison work?"

For one diary item it counts **answered** days in the 21 days before a medicine change and up to 21 days after,
needs at least 5 answered days on each side, then runs a two-sided Fisher's exact test (yes/no items) or a
Mann–Whitney U test (1–5 ratings). A difference is flagged only when the p-value **and** the size of the difference
both pass (moderate: p < 0.05 and at least 20 percentage points for yes/no items, or 0.6 points on 1-5 ratings).

- Open: `src/engine/timeline/signals.ts › compareMetric`
- Then: `src/engine/timeline/stats.ts › fisherExact` (Mann–Whitney: `src/engine/timeline/stats.ts › mannWhitneyU`)
- Thresholds: `src/engine/timeline/rules.ts › TIMELINE_RULES` (`windowDays`, `minAnsweredDays`, `thresholds`)
- Proof it is right: `src/engine/timeline/stats.test.ts` checks against R's documented examples and exact fractions.

### 2. "You compare 9 items per change. Isn't that a multiple-comparisons problem?"

Yes, and we measured it instead of hiding it. In simulated diaries with no real change and independent days,
11.2% of medicine changes still show at least one moderate-or-strong signal. With days that come in runs (each
answer repeats yesterday's with an assumed probability of 0.3 or 0.8) it is 34.6% and 85.8%. We have **not**
measured how clustered real diaries are. That is why a signal is only ever a question for the clinician and the
screen says it shows a change in what was recorded, not why.

- Open: `src/engine/timeline/signals.null.test.ts` (the simulation; it fails if the app's wording drifts from the
  rates) and `eval/results/timeline-null.json` (the numbers).
- The sentence the app shows: `src/engine/timeline/rules.ts › MULTIPLE_COMPARISONS_NOTE`

### 3. "What is the runs check, and why isn't it on?"

It shuffles the diary in whole 4-day blocks instead of single days, so a bad week stays together, and asks how often
the shuffled diary shows a difference as large. It is computed and stored with every comparison, but it does not
yet change which differences are flagged (`gate: false`). Measured: at stay 0.8 it would cut chance signals from
85.8% to 57.2% (11.2% → 7.3% with independent days), at a power cost of 37.6% → 23.3% (39.2% → 32.5%). Turning it
on would also change the demo's strengths, which several tests pin. So it is Partial: it reduces the problem, it
does not remove it.

- Open: `src/engine/timeline/blockPermutation.ts › blockPermutationTest`
- Where it would gate: `src/engine/timeline/signals.ts › gatedStrength`
- The switch: `src/engine/timeline/rules.ts › runsCheck` (inside `TIMELINE_RULES`:
  `{ blockDays: 4, permutations: 999, gate: false }`)
- Numbers: `eval/results/timeline-null.json` (`gated` fields, `power`); write-up in `docs/EVALUATION.md` §3.

### 4. "How does the medication review decide what to flag?"

Deterministic rules over a compiled knowledge base: 427 medicines, 89 Beers rules, 26 prescribing cascades, the ACB
scale and fall-risk classes (`src/kb/data/meta.json`). Same input, same output. Every finding has sources and ends
in a question for the clinician. Pipeline: Beers, cascades, duplicates, watch-for rules, ACB, fall risk → dedupe →
language guard → stable sort. Drug–drug interactions are limited to the AGS Beers 2023 combination table; it is not
a full interaction checker, and it does not check doses or allergies.

- Open: `src/engine/meds/engine.ts › reviewWithKb`
- A cascade, e.g. amlodipine → ankle swelling → furosemide: `src/engine/meds/rules/cascades.ts › cascadeFindings`
  (a "marker" medicine started after an "index" medicine whose known effect it may be treating)
- The lying-and-standing blood-pressure question: `src/engine/meds/rules/falls.ts › fallRisk`
- The knowledge base is built by `kb-src/build_kb.py`; check it with `python3 -I kb-src/build_kb.py --check`.

### 5. "57 of 57: isn't that just testing against your own answers?"

Partly, and we say so. The 57 cases are synthetic, written by a separate AI agent from the primary sources without
reading the engine, but the case file was available during engine development. So 57/57 shows the code meets a
written spec, not clinical validity. To show the suite can fail, stub engines with one piece of knowledge removed
pass only 54, 49 or 33 of 57.

- Open: `eval/meds.eval.test.ts` (runner), `eval/med-cases.json` (cases), `eval/MED-CASES-METHOD.md`
- Ablations: `eval/meds.ablation.test.ts`, `eval/ablations/*.ts`, `eval/results/meds-ablation.json`

### 6. "How does the NLP know 'didn't fall' is not a fall, or 'my granddaughter fell' is not her?"

ConText (Harkema et al. 2009): trigger words for negation, history, hypotheticals and "someone else" govern a scope
inside the sentence, and a mention inside that scope is not taken as the patient's current symptom. On 70 held-out
stories, micro-F1 is 0.942 (95% CI 0.907–0.971); with ConText switched off, the same word list scores 0.703
(0.625–0.778). The held-out set is small, so read the interval.

- Open: `src/engine/nlp/context.ts › analyzeInSentence`
- Caregiver vs patient voice: `src/engine/nlp/context.ts › detectVoice`
- Entry point: `src/engine/nlp/extract.ts › extractCheckIn` (the baseline is the `noContext` option)
- Scoring and the bootstrap CI: `src/engine/nlp/evaluate.ts › evaluateCorpus` and
  `src/engine/nlp/evaluate.ts › compareWithBaseline`

### 7. "How do you stop the language model from making things up?"

The model never decides anything. It may only reword evidence that code already computed. Each sentence it writes
is split, matched to the evidence ids it cites, and dropped if a number, date, "N of M" pair or medicine is not in
that evidence, or if it matches banned causal, advice, urgency or reassurance patterns. If too little survives, the
template brief is used.

- Open: `src/ai/tasks.ts › verifySection`, which calls `src/engine/brief/verify.ts › verifyClaims`
- Banned wording: `src/engine/brief/verify.ts › BANNED_PATTERNS`; a medicine as the object of an action word
  ("pause the lorazepam") is caught structurally by `src/engine/brief/verify.ts › medicineAction`.
- The brief task that uses it: `src/ai/tasks.ts › aiDraftBrief`

### 8. "Does the checker actually work?"

Not perfectly, and we say so. In one recorded live run, at least 6 flawed AI sentences (from 5 outputs) got past
the checker (`eval/results/ai-live.json`; listed as `live-01`…`live-06` in `eval/verifier-redteam.json`). In an
offline red team written by an AI agent, the submitted checker caught 72 of 163 harmful sentences; after fixes tuned
on that set it catches 163 of 163 and rejects 0 of 87 valid ones. On probes written after the rules, when first run:
1 of 18 (first probe, written after the first fixes; later used for tuning), 12 of 20 (second probe; two of its
items were later used to design one rule, so it is no longer held out) and 10 of 22 (held-out third probe, written
after the rules and run once; 10 of 23 after one label correction), 0 valid ones rejected. Tuned scores are
in-sample; the first-run probe scores are the honest ones. That is why AI text is optional, labelled, and reviewed
by the caregiver before anything prints.

- Open: `eval/results/verifier-redteam.json` (`before`, `caught`, `postFixProbe`, `postFixProbe2`, `postFixProbe3`),
  `eval/VERIFIER-REDTEAM.md`, `eval/verifier.eval.test.ts`

### 9. "Why do rules decide and the model only reword? Why not let the LLM do the review?"

Three reasons. (1) Reproducibility: the same record must give the same flags, so they can be tested (57/57) and
cited. (2) Safety: a 3B model on a laptop is not reliable enough to decide clinical prompts; even rewording, it
produced the flawed sentences above. (3) Regulation: Kinwise records, displays and prompts questions; it must never
recommend starting, stopping or changing a medicine, and code can enforce that while a model cannot promise it.
Without the model, everything works from templates.

- Open: `src/engine/brief/template.ts › templateBrief` (the deterministic brief) and `docs/REGULATORY.md` §2.

### 10. "What happens if someone asks 'Should Mom stop her lorazepam?'"

Before any model call, ordered keyword and pattern rules route questions about treatment, doses, diagnosis, cause or
prediction to a fixed redirect to the clinician, with an "add to visit questions" button; emergency words get the
911 line instead (no button). Looking up the recorded dose is still answered from the list. The rules take the
profile's names and medicines, and are tested with several fictional patient names and medicines. Kinwise never
suggests stopping a medicine: every signed-in page says not to stop or change any medicine without talking to the
prescriber (`src/app/layouts/ShellParts.tsx › SafetyFooter`), and the benzodiazepine review finding says a change
after regular use is made gradually with the prescriber (FDA 2020 boxed warning for benzodiazepines; source in
`kb-src/research/beers-2023-notes.md`).

- Open: `src/engine/brief/qa.ts › routeQuestion`; the rules themselves: `src/engine/brief/qa.ts › SCOPE_RULES`
- Tests: `src/engine/brief/qa.test.ts` (the table with Margaret, Robert and "grandpa")

### 11. "Is any of this real patient data? How do you know it works on real people?"

No real data anywhere. Every story and case is synthetic, written by separate AI agents directed by the team (labels
follow `eval/ANNOTATION-GUIDE.md`); not clinician-reviewed. Real older adults write differently, so the held-out
score is likely optimistic. Kinwise has not been tested with real patients, caregivers or clinicians. The first
step would be a pre-registered pilot (planned, not started): pharmacists rate briefs built from consenting
caregivers' diaries; primary endpoint, the share of visits where the clinician discusses at least one flagged
medicine.

- Open: `docs/EVALUATION.md` (limitations under each section), `docs/REGULATORY.md` §6 item 2 (the pilot).

### 12. "Why is the whole v2 build one commit?"

The v2 rebuild was developed with AI coding assistants and committed in one commit (`375e1e0`, 2026-10-11) from
Albert's `Mendrapp` git identity, so the git history does not show the step-by-step work. Later commits on
`kinwise-final` hold the fixes made after submission, round by round. Our earlier separate prototypes are kept
unchanged in `archive/` (`prototype-v1-neil`, `prototype-1-albert`). History is not rewritten to look otherwise;
instead, ask us to walk through any module.

- Open: `git log --oneline`, `archive/README.md`

### 13. "Is it a medical device? Is it FDA-cleared?"

No clearance or exemption is claimed. It is designed toward FDA's published examples of record-keeping and
communication tools: it records, displays and prompts questions, never diagnoses, never asserts causation and
never recommends a medicine change. The safety-net line is static (the same wording for every record; only the name
changes), so the app does not triage.

- Open: `docs/REGULATORY.md` §2, `src/engine/brief/safetyNet.ts › safetyNetLine`

### 14. "How private is it?"

No Kinwise server, account or analytics; the record is in the browser's `localStorage` (not encrypted). The
Content Security Policy limits network access to same-origin files plus the hosts that serve the optional model
files. The recorded live AI run made 0 external requests (model files from a local copy); the live demo downloads the
model files once (weights from huggingface.co, the compiled library from GitHub), and no diary data is sent.
Sharing happens only when the user prints or exports.

- Open: `index.html` (CSP), `src/model/store.ts › STORAGE_KEY`, `eval/results/ai-live.json` (`externalRequests`)

### 15. "Is the FHIR export real?"

A sample Bundle (270 resources) was validated against base R4 structure with the HAPI validator: 0 errors; codes
not terminology-checked (25 warnings); no US Core/IPS profile. The sample is a pre-review export from the demo window
of 2026-09-12 to 2026-10-11 ([docs/samples/README.md](samples/README.md)). No system receives it yet; today the
clinician gets the printed brief.

- Open: `src/engine/brief/fhir.ts › toFhirBundle`, `docs/samples/kinwise-fhir-validation.json`
