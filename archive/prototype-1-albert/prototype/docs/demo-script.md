# MedWatch demo walkthrough

Suggested length: 2–3 minutes. Use only the fictional profile. Load local AI once before a live presentation, then use fresh text in front of the judges. Keep a recorded demo available if the presentation browser lacks WebGPU.

1. **The problem.** “The details between appointments are easy to forget. MedWatch helps an older adult capture their own experience and a caregiver bring a clearer record to a visit.” Show the role-specific login and fictional-data label.
2. **Actual AI, on the device.** Sign in as the patient. Load local AI. Type a new fictional story, for example “My energy was 2 out of 5. I had no falls or near-falls today.” Generate suggestions. Point to the original quote beneath each field. Select the suggestions and confirm the complete check-in. Explain that skipped answers remain unknown.
3. **Human control.** Show that the story is preserved, the form works without AI, and a correction keeps a previous version. Do not portray an AI miss or rejected draft as a success.
4. **The shared picture.** Sign out and enter the caregiver view. Show the recent chart and its gaps, then open a count's supporting records. Describe the difference between an answered day and a calendar day.
5. **Useful questions.** Ask “What was my average energy?” or “Which days did I record dizziness?” Open the supporting record. Explain that causes, diagnosis and treatment questions are outside this prototype's scope.
6. **A visit, prepared.** Pin a caregiver observation, generate a visit brief with local AI, review the wording and sources, and print/save the PDF. Highlight that the medication and numeric tables are produced directly from records, while AI helps with the discussion draft.
7. **Honest limits.** “This is a fictional-data student prototype. Source explanations await qualified review. It does not diagnose, recommend medication changes, assess urgency, or monitor a patient. Our automated and synthetic-model checks are development evidence, not proof of clinical benefit or legal compliance.”

## Judging alignment

- **Idea & innovation:** private, evidence-linked documentation that preserves the patient's own words and missing information.
- **Implementation:** show actual local inference, confirmed persistence, linked source evidence, role-specific editing, and a printed brief.
- **Health impact & rigor:** state the intended adult/caregiver audience and the visit-preparation hypothesis; distinguish tested software behavior from unmeasured health outcomes.
- **Design & usability:** large patient controls, a manual route, clear confirmation, date filters, visible model state and accessible emergency help.
- **Presentation:** explain one coherent journey; show fresh input and actual output; identify completed features and gated work clearly.

## Code explanation practice

Be ready to explain why `null` is not `false`, why source revision changes invalidate drafts, why source spans use JavaScript UTF-16 offsets, why a medication record does not confirm adherence, and why local storage with hardcoded passwords is suitable only for the fictional demo.
