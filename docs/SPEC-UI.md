# MedWatch v2 — screen-by-screen UI specification (Phase B contract)

> **Numbers, file names and AI roles in this contract are pre-build targets; results as built are in [EVALUATION.md](EVALUATION.md) and [ARCHITECTURE.md](ARCHITECTURE.md).**
>
> **Note (Oct 11 2026):** this is the original build contract, written under the working name "MedWatch". The product is
> now **Kinwise** (see §13 of SPEC.md); the app's user-facing text says Kinwise, and "MedWatch" there refers only to
> FDA's adverse-event reporting program. Kinwise is not affiliated with the FDA.

Read with docs/SPEC.md. Data comes from `useStore()` (record + `update(actor, fn)`), `useDerived()` (review, timeline,
weekly, active meds) and `useSession()`. Design system components live in `src/ui/components`. Every number shown must be
code-rendered from the record and offer "Show the records" (evidence drawer listing the contributing check-ins/meds).
Voice: warm, plain, specific, never alarming. Never say "caused", "safe", "urgent", "stop taking".

## Patient app (Margaret, tablet-first, 20px base, ≥56px targets) — PatientShell tabs: Today · My week · My medicines

### Today (`/p/today`) — the hero interaction for judges
1. Greeting: "Good afternoon, Margaret" + date + streak-free progress note ("You've checked in 4 of the last 7 days — thank you").
   If today is already saved: a calm "Today is saved" summary card with "Change today's answers".
2. **"Tell me about your day"** big textarea (placeholder in her voice: "e.g. Felt a bit woozy getting up this morning, slept
   badly, no falls."), 3 example chips that fill the box (for the demo), a mic button only if supported (optional, see SPEC §7 — skip if
   not implemented) and a primary button **"Fill in my check-in"**.
   - Runs `extractCheckIn` instantly (no model needed). Shows a "Here's what I heard" panel:
     * story rendered with **highlighted spans** (color + underline + small label, not color-only) for each proposal;
     * list of proposed answers as cards: field label, proposed value in words ("Dizziness: Yes — a little"), certainty tag
       ("You said this" for explicit / "My best guess — please check" for inferred / "You said both — please choose" for conflict),
       the quote, and Accept / Change buttons (Accept is default-on for explicit, off for inferred);
     * "Things I didn't add" (skipped mentions with reasons: "Sofia fell off her bike — that's about someone else");
     * other symptoms detected (nausea, dry mouth…) as chips she can keep or remove; medication notes ("forgot my water pill").
   - If the on-device LLM is loaded (caregiver can load it in Settings; patient sees a small "Smarter suggestions available" toggle
     only when ready), offer "Check with on-device AI" → `aiRefineExtraction` adds proposals marked "AI suggestion".
3. **Quick form** (always visible below, pre-filled from accepted proposals): Energy (1–5 with faces/words: "Very low…Great"),
   Sleep last night (1–5), Appetite (Less than usual / Usual / More than usual), Dizzy or light-headed? (No / Yes → how strong?
   A little / Quite / Very), Drowsy during the day?, Confused or foggy?, Fall today?, Near-fall (lost balance) today?, Ankle swelling?
   Each Yes/No/Not sure; "Not sure / skip" leaves it unanswered (never stored as No). Fields filled by suggestions show a small
   "from your words" tag with the quote on hover/focus.
4. **"Save today's check-in"** → confirmation sheet listing the answers in words ("Not answered" for skipped) → Save → success state
   with a gentle sentence from weeklyTrends and "Anything else for Alex or the doctor?" (adds a patient note, optional pin).
5. If a fall is saved: show a calm, static callout: "Falls are worth telling your doctor about, even small ones. If you are hurt or
   hit your head, get help now (call 911)." — static text, not triage.

### My week (`/p/week`)
- Big plain-language cards from `weeklyTrends` ("You noted dizziness on 4 of 6 days this week, up from 1 of 5 last week.") with
  simple icon rows (7 day dots per symptom: filled = yes, hollow = no, dash = no entry) — no axes charts.
- "Your entries" list (date, her words in serif quotes, answers summary) with "Change this day" (opens Today for that date if within
  7 days).
- Gentle footer: "These are your own notes. They don't explain why something happens — that's a conversation for your doctor."

### My medicines (`/p/meds`)
- Large cards: name (as entered) + generic, dose, when, what it's for (reason), prescriber, started date. Read-only.
- "Things to mention to your doctor if you notice them" per medicine from KB effects (e.g. lorazepam → "feeling dizzy, sleepy or
  unsteady") — phrased as information, linked source short name. Never shows flags/scores to the patient (the caregiver view does).
- Footer: "Don't stop or change a medicine without talking to the person who prescribed it."

## Caregiver app (Alex, desktop-first + responsive) — CaregiverShell

### Overview (`/c/overview`)
- PageHeader: "Margaret's week at a glance" + period selector (14/30/60 days) + primary "Prepare visit brief".
- **"What MedWatch noticed"** (top card, the core insight): up to 3 items combining signals + findings, e.g.
  "Since lorazepam started (Sep 24): dizziness 8 of 13 answered days vs 2 of 15 before · near-falls 2 · fall 1" with a mini
  before/after bar + "Lorazepam is on the AGS Beers list (avoid in older adults)" + actions "See timeline" / "Add to visit questions".
- Row of Stats: Check-ins (N of M days), Dizziness days, Falls & near-falls, Anticholinergic burden (Meter with ACB total + band),
  Medicines (count, with OTC count).
- **Symptom timeline chart** (Recharts): daily strip/heat rows for dizziness, drowsiness, confusion, near-fall/fall, swelling +
  energy/sleep lines, with vertical medication start markers labelled ("Lorazepam started") — the most important visual.
- "Today": today's check-in status (saved / not yet) and latest story quote.
- Medication review summary: count by category with link; "To discuss" decisions count.
- Pinned concerns list.
- Guided tour entry (if `?tour=1` or not completed).

### Medications (`/c/meds`)
- Table/cards of active meds: name (+ matched generic + "OTC"), dose & schedule, reason, prescriber, started, flags column (small
  badges: "Beers", "ACB 3", "Fall risk", "Cascade?"), actions (edit, stop, remove). Stopped meds in a collapsed section.
- **Add medication** drawer: name field with autocomplete from `searchDrugs` (brands + generics + combos, e.g. typing "tylenol pm"
  shows "Tylenol PM → acetaminophen + diphenhydramine"); live match indicator ("Matched: lorazepam (Ativan)" / "Did you mean
  lorazepam?" / "Not in MedWatch's reference list — it will be saved, but not reviewed"); dose, frequency, as-needed, OTC, reason,
  prescriber, start date. **Live review preview**: before saving, show which new findings this medicine would add (run
  reviewMedications on the hypothetical list) — "Adding this would raise the anticholinergic burden from 7 to 10".
- Stop medication: date + optional note → creates "stopped" event (timeline then shows stop marker and dechallenge comparison).
- Medication history (events list).

### Medication review (`/c/review`)
- Intro: "MedWatch checked Margaret's 8 medicines against published criteria geriatric clinicians use. These are questions to bring
  to her doctor or pharmacist — not instructions. Don't stop or change any medicine without talking to the prescriber."
- ACB meter card (contributors listed with scores) + Fall-risk medicines card + Beers summary.
- Findings list grouped by category (filter chips), each card: title, involved meds, plain explanation, "Why this matters" disclosure
  with clinician rationale + evidence grade + source citation(s) (SourceCitation → URL), **"Recorded in Margaret's diary"** links
  (relatedSymptoms + signalIds with counts), the suggested question with "Add to visit questions" (adds to savedQuestions), and status
  controls: To discuss / Discussed / Not relevant (with optional note) → reviewDecisions. On-device AI (if loaded): "Explain in
  simpler words" → aiExplainFinding (labelled AI draft).
- "Not reviewed" section: meds not in the reference set ("MedWatch has no reference information for X — that doesn't mean anything
  about X; ask the pharmacist").
- Coverage note from KB (what's included, version, sources).

### Symptoms & timeline (`/c/timeline`)
- Medication event selector (default: strongest signal's medication); **before/after comparison card** for every metric with counts,
  denominators, p-value presented as "Pattern strength: strong / moderate / weak (Fisher's exact test, p = 0.004)" + plain caveat
  ("Shows a change in what was recorded, not what caused it. Other changes in this period: none / furosemide dose change").
- Full timeline chart (same as overview, larger, zoomable period) + day table (date, answers, story excerpt, edited marker) with
  evidence drawer for a day (all answers with provenance: "from her words: 'nearly went over in the kitchen'", revision history).
- Insufficient-data states shown explicitly with the reason text.

### Ask MedWatch (`/c/ask`)
- Chat-like but bounded Q&A about the records. Suggested questions chips: "When did the dizziness start?", "How many near-falls
  since lorazepam started?", "What did Mom say about sleep this week?", "Which medicines are on the Beers list?",
  "What changed in the last two weeks?".
- Flow: routeQuestion → out-of-scope → fixed redirect card ("That's a question for her doctor — MedWatch can't advise on
  treatment. Add it to your visit questions?" + button). In-scope → retrieveForQuestion → deterministic answer immediately (labelled
  "From the records"), then if LLM ready → aiAnswer (labelled "AI draft · on this device · Xs") with evidence chips that open the
  drawer. Dropped/failed AI → keep the deterministic answer.

### Visit brief (`/c/brief`)
- Left column (builder): period, included concerns (pinned notes, checkbox), saved questions (checkbox), findings to include
  (default: findings with status open/to_discuss, linked symptoms first), "Draft with on-device AI" (if ready; else explain how to
  load it) and "Use the standard template" (always). Editable sentences (contentEditable textareas) with evidence chips; editing a
  sentence marks it "edited by Alex". "I've reviewed this brief" checkbox (required for print; editing unchecks it).
- Right column: the **printable one-page brief** (SPEC §6.6) — styled like a clinical document: header band, sections numbered,
  mini before/after chart, medication table with flag column, questions, footer provenance. Print CSS: only the brief prints;
  unreviewed brief prints a "not reviewed yet" notice instead.
- Actions: Print / Save as PDF; **Export for clinician (FHIR R4 JSON)** download with a short explainer and a validity indicator
  (validateBundle → "Valid FHIR R4 Bundle · N resources"; the demo record's sample bundle has 270, see docs/samples/README.md); Copy as text (for patient-portal message).

### Settings (`/c/settings`)
- Margaret's profile: age, conditions (checkbox list with plain labels), kidney function (CrCl optional with explainer), names.
- On-device AI: model picker (MODEL_OPTIONS with size/VRAM), Load/Unload, status/progress, "What the AI does and doesn't do",
  "Model files download once from Hugging Face; your records never leave this device."
- Display: text size, theme. Data: export record (JSON), import, reset demo data (confirm), delete everything (confirm).
- Privacy statement.

## Public
### How MedWatch works (`/how-it-works`) — for judges
- Architecture diagram (inline SVG): Story → Clinical NLP (ConText) → confirmed diary → Timeline statistics + Medication review
  (Beers/ACB/FRID/cascades KB) → evidence package → on-device LLM (optional) → verifier → human review → brief / FHIR.
  "What is AI here?" table: NLP (rule-based clinical NLP), LLM (language only), deterministic engines (all safety logic) — with the
  research justification (Gallifant 2025, Socrates 2025, Ong 2025).
- **Live evaluation**: "Run the extraction benchmark now" → runs the NLP engine over dev + held-out corpora in the browser and shows
  P/R/F1 per field + errors table; medication-engine case suite results; numbers match eval/results.
- Knowledge base coverage + source register (citations with links), limitations, regulatory positioning summary, privacy.
- Team + "What's finished vs planned" table (honesty criterion).

### Guided tour (`?tour=1`)
8 steps with a floating card (Back/Next/Skip), navigating between routes and highlighting elements via data-tour attributes:
1 Welcome/problem → 2 Patient check-in NLP demo (auto-fills an example story and runs extraction) → 3 Overview "What MedWatch noticed"
→ 4 Timeline before/after → 5 Medication review finding with citation → 6 Visit brief → 7 FHIR export → 8 How it works / honesty.
