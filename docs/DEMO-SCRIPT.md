# Kinwise demo video — shot-by-shot script

The submitted video is `submission/kinwise-demo.mp4` (2:56, 176.25 s, 1440×900, H.264 + AAC, captions in
`submission/kinwise-demo.srt`). It is recorded automatically from the working app by
`scripts/submission/record-demo.mjs`. This document is the human-readable version of that script, so the team can
re-record it by hand (screen recorder + your own voice) or change it and re-run the script.

- **Narration:** 425 words, macOS voice "Samantha" at 175 wpm, about 164 s of speech.
- **App state:** a fresh browser profile with the seeded fictional demo record (Margaret Rivera, 78, and her daughter
  Alex). All data is fictional.
- **On-device model:** the optional on-device language model (Qwen2.5 3B Instruct, q4f16, through WebLLM on WebGPU)
  is loaded off camera before the recording starts, from the local copy in `public/models/resolve/` (git-ignored;
  `node scripts/download-model.mjs`). It appears in one place only: in the Ask shot it drafts a plainer answer under
  the records answer, labelled "AI draft · on this device", with its "Checked against the records" line. Every
  other answer, finding, count and brief sentence on screen comes from the deterministic engines, and the visit
  brief uses the standard template. Requests to model hosts are blocked during the run, and the recorder stops if
  one is attempted. The model's draft is not quoted in the narration. The recorder checks that the draft passed
  the app's checks and contains no causal, safety, advice or urgency wording, and saves its text in
  `tmp/demo-video/timings.json`. Without the local model files (or with `NO_AI=1`) the script records a
  template-only cut whose narration says the model is not used.
- **Dates:** the seed is relative to the recording date (lorazepam starts 16 days before "today"). Recorded on
  Oct 11, 2026, so the screen shows "Sep 25". The narration never says a calendar date, so it stays correct on any day.
  The counts (9 of 14, 2 of 19, …) do not change with the date.

## Re-recording

```bash
node scripts/submission/record-demo.mjs        # starts its own Vite dev server on 127.0.0.1:5229 (~5 min)
BASE_URL=http://127.0.0.1:5174/ node scripts/submission/record-demo.mjs   # reuse a running dev server
VOICE="Shelley (English (US))" node scripts/submission/record-demo.mjs   # another voice
NO_AI=1 node scripts/submission/record-demo.mjs                          # template-only cut, no model
```

What the script does:

1. It writes each shot's narration with `say` and measures the clip with `ffprobe` first. A shot then stays on
   screen for at least as long as its narration (0.3 s lead-in plus 0.45 s tail).
2. It drives system Chrome through Playwright (`channel: "chrome"`, 1440×900, deviceScaleFactor 1, WebGPU enabled)
   in a persistent profile, `tmp/demo-video-profile`, because a throwaway context's storage quota is too small to
   cache the model. The app's localStorage is cleared first, so the seeded demo record is created fresh. Off camera,
   it signs in as Alex, loads the model from Settings, asks one warm-up question and signs out. A visible cursor
   with a click ripple is injected, and check-in text is typed key by key. Requests to the model hosts are blocked.
3. **Every number spoken is checked on screen during the run.** Examples: "9 of 14 answered days", "270 resources",
   "94.2%", "57 of 57". If the app shows something else, the run stops instead of producing a video with wrong
   narration.
4. It retimes the video to wall-clock speed. Playwright's screencast does not play back in real time here: 175.8 s
   of real time became 190.3 s of raw video in the last run. So the page shows a 10×10 px marker in the bottom-right corner whose
   colour changes at each shot start and each cursor move (61 events). ffmpeg finds those colour changes, retimes
   each segment linearly back to real time with `setpts`, and paints the marker out with `delogo`.
5. It converts to H.264 (yuv420p, 30 fps, CRF 20). Each narration clip is placed at its shot start with
   `adelay` + `amix normalize=0`, and the result is muxed.
6. It writes `submission/kinwise-demo.mp4`, `submission/kinwise-demo.srt` and `tmp/demo-video/timings.json`. The
   timings file holds the exact start, end and narration time for every shot.

To record by hand, follow the table below at a calm pace. Use a 1440×900 browser window and a fresh profile, or
Settings › Restore demo. Read each line once the screen shows what it describes.

## Shot list

Timecodes are from the current `submission/kinwise-demo.mp4`.

| # | Time | Screen / route | On-screen actions | Narration (exact) |
|---|------|----------------|-------------------|-------------------|
| 1 | 0:00.0–0:11.5 | Title card over Welcome (`#/`) | Card: "More than **1 in 4** older adults fall each year — and **less than half** tell their doctor." Source line: CDC, Facts About Older Adult Falls · cdc.gov/falls. | More than one in four older adults fall each year, and less than half tell their doctor, according to the CDC. When a parent takes many medicines, a new side effect is easy to miss. |
| 2 | 0:11.5–0:19.4 | Welcome `#/` | Card fades out. Cursor points at "Margaret Rivera (78) and her daughter Alex are fictional", then moves to **Try as Margaret — patient view**. | Kinwise helps families notice those changes. Meet Margaret, seventy-eight, and her daughter Alex, both fictional. |
| 3 | 0:19.4–0:25.6 | Patient Today `#/p/today` | Click **Try as Margaret**. Scroll to "Tell me about your day". Type: *"Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. Slept badly. My granddaughter Sofia fell off her bike, poor thing. No ankle swelling."* Cursor moves to **Fill in my check-in**. | Margaret describes her day in her own words. A clinical language engine reads it on her device. |
| 4 | 0:25.6–0:39.1 | Today › "Here's what I heard" | Click **Fill in my check-in**. The panel shows highlighted spans: woozy → *Dizzy*, nearly went over / caught myself → *Near-fall*, No ankle swelling → *No swelling*, fell off her bike → *Someone else*. Cursor visits each span. Because the model is loaded, a **Check with on-device AI** button shows under the panel; it is not pressed. Scroll to **Things I didn't add**: "fell off her bike, poor thing — that's about someone else". Nothing is saved. | Woozy becomes dizziness, nearly went over becomes a near-fall, and no ankle swelling stays a no. My granddaughter Sofia fell is set aside as someone else. Margaret confirms every answer before anything is saved. |
| 5 | 0:39.1–0:55.7 | Caregiver Overview `#/c/overview` | **Sign out**, then **Try as Alex — caregiver view**. "What Kinwise noticed" card. Cursor on "Dizziness was recorded on 9 of 14 answered days … compared with 2 of 19 answered days in the 21 days before". Then the falls line "1 fall … and 2 near-falls … on 14 answered days". Then "Shows a change in what was recorded, not what caused it." | Now Alex signs in. Since lorazepam was started, dizziness was recorded on 9 of 14 answered days, compared with 2 of 19 before. One fall and two near-falls were recorded on those 14 days. It shows a change in what was recorded, not what caused it. |
| 6 | 0:55.7–1:06.4 | Symptoms & timeline `#/c/timeline` | Sidebar → **Symptoms & timeline**. Scroll to the "Before and after" card (Lorazepam (Ativan)). Cursor on "9 of 14 days", then on a "Mann–Whitney U test" row, then the "Falls and near-falls, listed by date" box. | The timeline compares answered days before and after, with Fisher's exact and Mann-Whitney tests. Falls are listed by date, because a few events are too few to test. |
| 7 | 1:06.4–1:27.1 | Medication review `#/c/review` | Sidebar → **Medication review**. Cursor moves over the ACB card (total 7), Medicines linked to falls, and Beers Criteria prompts. Scroll to the first finding, "Possible prescribing cascade: Amlodipine → ankle swelling → Furosemide (Lasix)". Open **Why this matters** (source *Savage 2020*). Cursor rests on the "Question for the doctor or pharmacist". | The review checks her eight medicines against AGS Beers 2023, the anticholinergic burden scale, where her list adds up to 7, fall-risk lists, and prescribing cascades, like furosemide started for ankle swelling after amlodipine. Each finding ends in a question for her doctor or pharmacist, with its source. |
| 8 | 1:27.1–1:39.2 | Medications `#/c/meds` › Add medication drawer | Sidebar → **Medications** → **Add medication**. Type "Advil PM" and pick **Advil PM → ibuprofen + diphenhydramine**. Live review preview: "Adding this would add 3 new review prompts", starting with "The same ingredient in 2 medicines: diphenhydramine". Cursor moves to **Save medication**, then **Cancel** (nothing saved). | Before adding a medicine, Alex sees what would change: Advil PM would add three review prompts, including a second product with diphenhydramine. Nothing is saved until Alex chooses Save. |
| 9 | 1:39.2–1:58.6 | Ask Kinwise `#/c/ask` | Sidebar → **Ask Kinwise**. Click the chip "How many near-falls since lorazepam started?" The answer is labelled *From the records*: "Near-falls were recorded on 2 of 14 answered days…". Under it, "Drafting a plainer answer on this device…", then the on-device model's draft appears, labelled "AI draft · on this device · Qwen2.5 3B Instruct · 4.9 s", with evidence chips and "Checked against the records. If anything differs, the records-based answer above is the reference." In this recording the draft read: "2 near-falls were recorded on 14 answered days since Sep 25, compared with 1 near-fall on 20 answered days before." Type "Should she stop taking the lorazepam?" → the redirect card "That's a question for Margaret's doctor or pharmacist" appears → click **Add to visit questions**. | Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. The optional on-device model, running on this laptop's GPU, adds a plainer draft. Code checks its numbers and medicine names against the records. A treatment question is redirected to her doctor or pharmacist. |
| 10 | 1:58.6–2:10.6 | Visit brief `#/c/brief` | Sidebar → **Visit brief** → **Use the standard template**. Scroll to "What we've noticed" (before/after strip 2/19 → 9/14). Back to top, tick **I've reviewed this brief**, click **Print / Save as PDF**. Scroll to "Export for clinician": "Valid FHIR R4 Bundle · 270 resources", then **Preview the JSON**. | The visit brief puts it on one page. Alex must mark it reviewed before it prints, and it exports as an HL7 FHIR R4 bundle of 270 resources. |
| 11 | 2:10.6–2:23.2 | How Kinwise works `#/how-it-works` › Live evaluation | Sidebar → **How Kinwise works** → **Run the live evaluation** → **Run the extraction benchmark now**. The held-out set shows 94.2% micro-F1 over 116 labelled answers in 70 stories. Then **Run the medication-review suite**: "Cases fully passed 57 of 57". | Anyone can rerun both test suites in the browser: 94.2 percent micro-F1 on 70 held-out diary stories, and 57 of 57 medication-review test cases passed. |
| 12 | 2:23.2–2:31.2 | How it works › What is AI here? · Privacy | Scroll to "The right tool for each job". Cursor on **All safety logic** (deterministic engines), then **Language only** (on-device language model). Scroll to "Privacy by architecture": "Records are stored in this browser on this device…". | All safety logic is deterministic code with cited sources; the model only handles wording. Records stay in this browser. |
| 13 | 2:31.2–2:49.2 | How it works › Finished vs planned | Scroll to "What's finished, what's planned, and the limits". Cursor on "Visit brief, print and FHIR R4 export — Working in this demo", then "Clinical validation — Planned", then "Sharing between family members — Planned". | Working today: check-in, timeline, review, visit brief and FHIR export. Planned: a validation study with pharmacists and caregivers, pharmacy import, and family sharing. The knowledge base is not yet clinician-reviewed, and Kinwise gives no medical advice. |
| 14 | 2:49.2–2:56.3 | End card | "Notice what changes after a medicine change, and bring a clear question to the visit." The card also shows the code URL github.com/albertzorzolan/UnivaBioBabson and this footer: "Fictional demo data. Not medical advice. Knowledge base not yet clinician-reviewed. On-device model (Qwen2.5 3B Instruct, WebGPU) shown in Ask Kinwise only; the visit brief uses the standard template." | Kinwise. Notice what changes after a medicine change, and bring a clear question to the visit. |

The end card gives only the repository link. The planned live demo URL
(https://albertzorzolan.github.io/UnivaBioBabson/) is **not deployed yet** and is not shown in the video. Add it to
the end card only after the deployment is live.

## Where every number comes from

| Spoken | Source |
|--------|--------|
| "More than one in four older adults fall each year, and less than half tell their doctor" | CDC, Facts About Older Adult Falls. Recorded in `kb-src/research/market-evidence.md` (row 4) and shown on How it works › The problem. |
| Margaret, 78; eight medicines | Seed record `src/model/seed.ts`. On screen: Welcome and Medication review ("Kinwise checked Margaret's 8 medicines"). |
| Dizziness 9 of 14 answered days vs 2 of 19 before; 1 fall and 2 near-falls on those 14 answered days | Seed record, pinned by `src/model/seed.test.ts`. On screen: Overview and timeline before/after card. Checked on screen by the recorder. |
| Fisher's exact and Mann–Whitney tests | `src/engine/timeline`. On screen: the timeline card ("Fisher's exact test, p = 0.0023", "Mann–Whitney U test"). |
| Anticholinergic burden adds up to 7 | Live app, Medication review ACB card (Oxybutynin 3 + diphenhydramine in Tylenol PM 3 + Furosemide 1). |
| Furosemide started for ankle swelling after amlodipine (cascade) | Live app, Review finding "Possible prescribing cascade…", source Savage et al., JAMA Intern Med 2020. |
| Advil PM would add three review prompts | Live review preview in the Add medication drawer. Checked on screen by the recorder. |
| Near-falls on 2 of 14 answered days | Live app, Ask Kinwise answer. Checked on screen. |
| FHIR R4 bundle of 270 resources | Live app, "Valid FHIR R4 Bundle · 270 resources". Matches `docs/samples/kinwise-fhir-bundle.json` (270 entries). |
| The on-device model's draft (on screen, not spoken) | Live app, Ask Kinwise, model Qwen2.5-3B-Instruct-q4f16_1-MLC from the local copy. Its text is saved in `tmp/demo-video/timings.json` (`aiDraftOnScreen`). The same answer and a 5.1 s run on this machine are in `eval/results/ai-live.json` (`ask`). The "laptop's GPU" is the recording machine, an Apple M1 Pro MacBook Pro (`eval/results/ai-live.json` `machine`). |
| 94.2 percent micro-F1 on 70 held-out stories | `eval/results/nlp-eval.json` (heldout: 70 cases, micro F1 0.9422), re-run live on How it works. |
| 57 of 57 medication-review test cases | `eval/results/meds-eval.json` (casesPassed 57 of 57), re-run live on How it works. |
| Finished vs planned items | How it works › "What's finished, what's planned, and the limits" table. |

## Wording rules the narration follows (SPEC §3)

- It makes no causal claim. The only use of "caused" is the app's own caveat: "a change in what was recorded, not
  what caused it".
- It never calls a medicine safe, unsafe or dangerous, and gives no stop, start or change advice. The treatment
  question shown on screen is redirected to the doctor or pharmacist.
- Every count comes with its denominator ("9 of 14 answered days", "2 of 19", "57 of 57").
- Findings are framed as questions for her doctor or pharmacist.
- It makes no FDA, HIPAA or clinical-validation claim. It says the knowledge base is not yet clinician-reviewed and
  lists the validation study as planned.
- It says what the on-device model does in the recording (drafts a plainer answer in Ask, checked by code against the
  records) and that all safety logic is deterministic code. It does not claim the checks are perfect: in an earlier
  live run (`eval/results/ai-live.json`, `verdict`) the checks let 3 flawed outputs through, which is why the model
  stays optional and labelled.

If you change a line, keep these rules. Then re-run the script: its on-screen checks catch numbers that no longer
match the app.
