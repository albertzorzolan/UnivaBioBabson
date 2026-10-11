# Product and experience specification

## 1. Intended use and claim boundary

MedWatch is an adult-facing, local documentation and communication prototype. It helps users record self-reported symptoms, review their recorded history, keep a medication list, read selected general health information, and prepare a user-reviewed clinician discussion document. It does not assess whether a person has a disease, determine a medication's safety for that person, prescribe a response, decide clinical urgency, monitor continuously or contact a professional.

The exact FDA status of each implemented function remains to be assessed. These boundaries are product requirements, not a declaration that every AI documentation function is exempt from regulation. See the regulatory design document before changing intended use, prompts or marketing.

Use only fictional patient data in the competition build and evaluation. The intended future audience is older adults and their adult caregivers; the competition's age eligibility is not a pediatric-use authorization.

## 2. Core experience: describe, confirm, understand, prepare

1. A patient types a short account of the day, or fills out the original quick form.
2. Local AI suggests structured answers, showing the words behind each suggestion.
3. The app asks at most two optional clarification questions drawn from an approved documentation question bank. The remaining required answers stay in a short manual form.
4. The patient corrects and confirms the record. Unanswered fields remain unknown rather than silently becoming “no.”
5. Deterministic code creates descriptive history and coverage statistics. Local AI explains those facts in accessible language.
6. The caregiver reviews observations, asks bounded questions about records, adds a visit concern and generates an evidence-linked visit brief.
7. The caregiver reviews the draft and prints a source-linked summary. Nothing is sent automatically.

## 3. Six AI capabilities

| ID | Capability | User-facing action | Model contribution | Required boundary |
|---|---|---|---|---|
| AI-01 | Symptom capture | Help me fill this in | Extract candidate fields and supporting text spans from the person's words | Patient confirms; no diagnosis, severity inference, invented measurements or automatic save |
| AI-02 | Clarification | Add a little detail | Choose useful missing-field questions from an approved bank | Code filters choices; no diagnostic branching or urgency assessment |
| AI-03 | Record summary | Explain my week | Turn calculated facts and confirmed notes into readable prose | Preserve missing data; no “you are safe,” clinical stability or causal claims |
| AI-04 | Record questions | Ask about my records | Answer questions such as “What did I record about dizziness last week?” | Retrieve from a selected date range; no external medical reasoning or general medical chat |
| AI-05 | General source explanation | Explain this information | Simplify a selected, reviewed educational excerpt | Source-only explanation; no personal suitability, interactions, treatment or dosing advice |
| AI-06 | Visit preparation | Prepare my visit | Organize recorded experiences and draft clinician questions around a caregiver concern | No treatment suggestions disguised as questions; all relevant source records remain available |

AI-01, AI-03 and AI-06 form the minimum complete judging story. AI-02, AI-04 and AI-05 complete the specified capability set, after the minimum flow passes its acceptance gates. Voice transcription, camera medication recognition and multilingual translation are later extensions requiring their own local-runtime and accuracy evaluation.

## 4. Screens and acceptance behavior

### Login and demo notice

- One username/password form: patient `babson` / `babson`; caregiver `babson1` / `babson1`. Credentials determine the role.
- Clearly identify sample data and explain that both roles share this browser's records.
- Wrong credentials produce an inline error. Logout clears the active session and cancels in-flight AI, but retains saved records.
- Do not describe this login as secure authentication. Display “Fictional-data prototype — do not enter real health information” in the demo shell.

### Patient home: today's check-in

- Three main destinations: Check-in, My history, My medicines. Help and logout are secondary accessible controls.
- Offer “Use the quick form” and “Describe my day.” Neither requires a model to finish loading before manual entry.
- Core fields: energy 1–5; dizziness yes/no/unknown and self-selected severity if present; confusion/memory fog yes/no/unknown; appetite better/same/worse/unknown; sleep 1–5; falls or near-falls yes/no/unknown.
- Symptom capture suggestions show the exact input phrase. “Lightheaded” can be proposed as dizziness with visible evidence; it must not become a diagnosis such as orthostatic hypotension.
- Vague words such as “bad” do not become a numeric severity. The person selects a score or leaves it unknown.
- AI must preserve negation, historical timing and who experienced the symptom. A relative's fall is not the patient's fall.
- Save only after explicit confirmation. Editing today's check-in replaces the current version for that local date and retains an edit event.
- Allow users to save an incomplete but confirmed check-in; missing values are explicit and must reduce the relevant analysis denominators.
- Patient-origin observations drive the daily statistics. A caregiver can add a separate observation note, visibly attributed; it does not overwrite patient answers or silently enter patient-report denominators.

### Patient history

- Display diary facts: “Dizziness was recorded on 3 of 5 answered days.” Numeric statements are rendered from computed data.
- Explain the selected period in short language. “Your condition is improving” and “nothing to worry about” are outside scope.
- Offer “View my entries” and “Correct an entry.” Show coverage and gaps without guilt, streak penalties or false reassurance.
- A patient can accept a readable summary of their own records. The app labels AI text and keeps the underlying entries accessible.

### My medicines

- Patient read-only list with name, dosage, frequency, reason, start date and optional prescriber exactly as the caregiver entered them.
- Caregiver can add, edit and remove entries. Preserve corrections and actual regimen-change events separately.
- Unknown names are “Reference information not available in this prototype,” not “safe.”
- Do not recommend a dose, stop date or substitution. Do not infer adherence from a medication's presence on the list.

### Caregiver overview and timeline

- Show latest confirmed check-in, unanswered fields, user-pinned concerns, recorded history and medication date markers.
- The main list is “Observations to review,” ordered by user selection and date. Do not assign clinical priority, risk scores or “discuss soon” timing.
- A user can choose two date windows or a medication-start marker to compare recorded symptom frequencies. Caption: “This compares recorded days; it does not explain the cause of a change.”
- View evidence exposes exact entries, denominators, calculation definitions, observer attribution and source versions.
- Keep the complete record available even when an AI summary selects only a few observations. User-pinned notes must appear in the visit bundle or be explicitly deselected by the user.

### Record questions and educational sources

- Offer examples: “Summarize my sleep entries this week,” “Which days mention dizziness?” and “What information is missing from these entries?”
- Reject unsupported clinical questions with a fixed explanation and an action to add the concern to the visit notes. Do not produce a differential diagnosis or personalized advice.
- A selected source may be explained in simpler language with its title, publisher, version/date and link. Keep source text separate from the person's record; source content must not become an inferred personal finding.
- External source links are user-initiated navigation with no record data in URLs and no referrer. Core functionality uses bundled excerpts and requires no external lookup.

### Visit brief

- Sections: current medication list; user-selected concerns; confirmed symptom observations and coverage; AI-assisted plain-language narrative; user-reviewed questions; source references and generation date.
- Medication values and calculated facts are inserted by code. AI organizes narrative and questions.
- Show “AI draft,” “Reviewed by patient/caregiver,” and “Template summary” accurately. “Reviewed” does not mean reviewed by a clinician.
- Questions request assessment rather than assert a diagnosis: “What might explain these changes, and what else would be useful to record?” Do not lead with “Should I halve medication X?”
- Print one readable page for the demo dataset. Allow continuation pages for larger records; never silently omit medications or shrink text excessively.

### Help, privacy and data controls

- Keep an always-available “Need help now?” action independent of AI. It opens static, source-reviewed help information; it does not score urgency.
- Explain that entries are not monitored and no clinician is notified. No notification badge may imply clinical surveillance.
- Local settings expose deletion of an entry, all records/drafts, and model cache separately. Confirm destructive deletion and explain that previously exported PDFs cannot be recalled.
- Do not collect identifiers, location, contacts or dates of birth in the prototype. Save user-selected display preferences only.

## 5. Accessibility requirements

Patient body text starts at 18px, touch targets at 48px, with generous spacing and no color-only meanings. Use semantic labels, keyboard access, clear focus, reduced motion and legible contrast verified on the actual colors. Use familiar wording and a persistent progress indicator for the short check-in. AI suggestions must be distinguishable from confirmed answers without relying on hue.

Read progress updates through restrained live regions. Do not announce every generated token. Never move focus unexpectedly when inference finishes. Forms retain input after errors and allow a manual path. Test a narrow phone layout, tablet layout, keyboard-only use and zoom at 200%; a responsive layout does not establish that a small device can run the model.

## 6. Competitive demonstration

Use a fictional patient's short description containing a negation and an ambiguous detail. Show the AI suggestions, correct one, and save. Switch to the caregiver on the same device; show the updated factual history and a source-backed record answer. Generate a fresh visit brief and print it. Then show insufficient history and an out-of-scope request handled honestly.

The evidence for competition strength is a working transformation plus measured extraction fidelity, source support and user comprehension. Claims about fewer falls, earlier diagnoses, safer prescriptions or clinical effectiveness require separate evidence and are not part of the submission claim.
