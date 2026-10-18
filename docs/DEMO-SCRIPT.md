# Kinwise demo video — shot-by-shot script

The submitted video is `submission/kinwise-demo.mp4` (1440×900, H.264 + AAC, captions in
`submission/kinwise-demo.srt`). It is recorded automatically from the working app by
`scripts/submission/record-demo.mjs`. This document is the human-readable version of that script's `SHOTS` table,
so the team can re-record it by hand (screen recorder + your own voice), drop in their own voice clips, or change it
and re-run the script.

**Keep this file in sync with `SHOTS`.** At startup the recorder checks that every narration line below appears
here word for word (including the variants and the template-only lines). It stops if one is missing, unless
`ALLOW_MISMATCH=1` is set for a test render. `node --test scripts/submission/record-demo.test.mjs` runs the same
check without recording.

- **Length:** must stay under 3:00. The narration alone plans 2:37.7 for the cut with the on-device model and
  2:23.2 for the template-only cut (`PLAN=1`, macOS voice "Samantha" at 185 wpm; Samantha's rate only changes in
  steps, and 160 to 181 wpm all read at the same speed as the earlier 175). The recorder refuses a plan over 175 s.
  Page changes happen between shots, off the narration, and add about a second each; the model's Ask draft takes a
  varying time. Renders come out longer than planned (an earlier render of 2026-10-18, `blocked` verify line, ran
  2:39.4 for a 2:29 plan). This script adds a few seconds of on-screen actions (Margaret's medicine list, one confirm
  click, waiting for toasts): the current submission/kinwise-demo.mp4 (rendered 2026-10-18 with the on-device model,
  `removedBlocked` verify line, `runs` timeline line, `model` honesty line) runs 2:49.9 for the 2:37.7 plan.
  On-screen actions can only make a shot longer. Each render writes the real start, end and narration
  time of every shot to `timings.json` (see [Re-recording](#re-recording)), and prints a warning if the result is
  over 3:00.
- **Order:** judges mostly watch the first minute, so the problem, what Kinwise is and the people, her check-in and
  what Alex sees come first, and the medication review starts at about 0:55 (planned 0:51.7 plus page changes). The
  statistics, the on-device AI draft, the brief, the live evaluation and the honest status follow.
- **What Kinwise is, early:** the first sentence after the hook (about 0:06) says it: "Kinwise helps families notice
  what changes after a medicine change, and bring one clear, sourced question to the doctor." It plays over the
  Welcome headline, which says the same.
- **App state:** a fresh browser profile with the seeded fictional demo record (Margaret Rivera, 78, on eight
  medicines, and her daughter Alex). All data is fictional.
- **On-device model:** the optional on-device language model (Qwen2.5 3B Instruct, q4f16, through WebLLM on WebGPU)
  is loaded off camera before the recording starts, from the local copy in `public/models/resolve/` (git-ignored;
  `node scripts/download-model.mjs`). It appears in two places. In the review shot, "Explain in simpler words" is
  clicked on the cascade finding, and the verify shot shows how the code check came out (see shot 7). In the Ask
  shot it drafts a short summary under the records answer, labelled "AI draft · on this device · Qwen2.5 3B
  Instruct"; the recorder rings that label with the draft's first sentence as the model is named, then zooms the
  whole "AI draft · on this device" block as "drafts a short summary" is said. The narration says "a short summary",
  not "a plainer answer": the draft restates part of the records answer (in the last render it left out the fall),
  and the records answer above it stays the reference. Every other answer, finding, count and brief sentence on
  screen comes from the deterministic engines, and the visit brief uses the standard template. Requests to model
  hosts are blocked during the run, and the recorder stops if one is attempted. The model's text is never quoted
  in the narration. The recorder checks that what the
  model put on screen passed the app's checks and contains no causal, safety, advice or urgency wording, and saves
  it in `timings.json` (`aiExplainOnScreen`, `aiDraftOnScreen`). Without the local model files (or with `NO_AI=1`)
  the script records a template-only cut: the verify shot is left out and the Ask line changes (marked "NO_AI"
  below).
- **No loading skeletons on camera:** before the clock starts, the recorder opens every page the video visits once
  (except the visit brief, which would save a first brief), so their code is already loaded. A shot that changes
  page does it before its clock starts, and every shot waits until the page's main heading is on screen and no
  loading placeholder (`.view-loading`, `.ui-skeleton`) is visible before its chapter label and narration begin.
- **Recorder overlays (not app code):** a visible cursor with a click ripple; a highlight ring that glides to
  whatever the narration names; short punch-ins (a zoomed copy of a card, with the page dimmed behind it) on the key
  numbers; a chapter label (the shot's title) for the first 2.8 s of each shot, opaque, in the **top-right** corner
  so it never covers the Kinwise logo at the top left; an on-screen **note** when a shot has one (only the hand-off
  to Alex: "Today both views share one device, or a backup file; family sharing is planned.", not spoken and not in
  the `.srt`), placed in the empty part of the caregiver sidebar between the main nav and the "How Kinwise works"
  footer, measured on screen so it covers no app text (the run stops if it does not fit there); and one-line burned-in captions for muted viewers (the same text as
  the `.srt`). Captions sit at the bottom and move to the top only while the cursor works near the bottom edge; in
  the heard shot they stay at the bottom, so they never cover the panel's "CHECK WHAT I FOUND" heading. The cursor
  is hidden over the hook card and the end card. All of this is injected into the recording browser only.
- **Dates:** the seed is relative to the recording date (lorazepam starts 16 days before "today"). The narration
  never says a calendar date, so it stays correct on any day. The counts (9 of 14, 2 of 19, …) and the p-value do
  not change with the date.

## Re-recording

```bash
node scripts/submission/record-demo.mjs        # starts its own Vite dev server on 127.0.0.1:5229 (~5 min)
PLAN=1 node scripts/submission/record-demo.mjs # no browser: check this file is in sync, print the planned length
OUT_DIR=tmp/demo-video-test NO_AI=1 PORT=5465 node scripts/submission/record-demo.mjs   # test render, outside submission/
BASE_URL=http://127.0.0.1:5174/ node scripts/submission/record-demo.mjs   # reuse a running dev server
NARRATION_DIR=tmp/voice node scripts/submission/record-demo.mjs          # a teammate's recorded clips instead of `say`
VOICE="Shelley (English (US))" node scripts/submission/record-demo.mjs   # another macOS voice (RATE=175 sets wpm)
NO_AI=1 node scripts/submission/record-demo.mjs                          # template-only cut, no model
HEADED=1 node scripts/submission/record-demo.mjs                         # watch the browser (same recording)
CAPTIONS=0 node scripts/submission/record-demo.mjs                       # no burned-in captions (.srt still written)
node --test scripts/submission/record-demo.test.mjs                      # captions, hook source, script sync (no browser)
```

- `OUT_DIR` (relative to the repo root, or absolute) is where `kinwise-demo.mp4` and `kinwise-demo.srt` go. The
  default is `submission/`. The working files (audio, raw video, `timings.json`; hundreds of MB) always stay under the
  git-ignored `tmp/`: in `OUT_DIR/work` when `OUT_DIR` is inside `tmp/`, in `tmp/demo-video/` for `submission/`
  (default or named), and in `tmp/demo-video-<folder name>/` for any other folder. The recorder refuses an `OUT_DIR`
  inside `archive/`, `tmp/submitted-2026-10-16-backup/`, `node_modules/` or `public/models/`.
- `ALLOW_MISMATCH=1` turns the sync check and the on-screen number checks into warnings. It is for test renders
  only: the recorder refuses it when `OUT_DIR` is `submission/`.
- `ALLOW_UNDEPLOYED=1` lets a render into `submission/` go ahead even though the code it shows differs from the
  `medwatch-v2` branch the end card links to (see the note under the shot list). Without it the recorder stops; for
  any other `OUT_DIR` it only prints a warning. The result of this check is saved in `timings.json` (`codeCheck`).
- Captions are burned in by default. The `.srt` is for players that cannot show burned-in text: do not upload it
  as YouTube CC for a video rendered with burned-in captions (viewers would see two caption bars), or render with
  `CAPTIONS=0` if you want YouTube CC.
- **Audio:** the narration clips are mixed and then loudness-normalised with ffmpeg
  `loudnorm=I=-16:TP=-1.5` (−16 LUFS integrated, peaks at most −1.5 dBTP, the usual level for online video; the
  earlier `say` mix measured about −19 dB mean). This applies to recorded clips too, so a quiet or loud recording
  comes out at the same level.
- **Captions:** each line is cut into sentences, and long sentences into the fewest near-even chunks of at most 64
  characters, so every burned-in caption is **one line** (about 900 px at 28 px; the bar never wraps) and never
  grows into a two-line block over a card. A chunk of one or two words ("passed.", "after amlodipine.") is merged
  into the cue before it (a line's first chunk, such as "Kinwise.", into the cue after it) when the two together
  stay within 72 characters, still one line, so no caption flashes up for half a second.

### Recording your own narration (`NARRATION_DIR`)

A human voice is warmer than `say`, and it is the recommended voice for the submitted video. One teammate records
one clip per shot, and the recorder uses those clips instead of `say`, then paces each shot to the clip's real
length (measured with `ffprobe`):

1. Make a folder, e.g. `tmp/voice/` (tmp/ is never committed).
2. For each shot, record the **Narration (exact)** text from the table below, word for word, because the captions
   and the `.srt` show that text. Read numbers naturally: "p = 0.0023" as "p equals zero point zero zero two
   three", "AGS" as "A G S", "HL7 FHIR R4" as "H L 7 fire R 4", "94.2" as "ninety-four point two". Use QuickTime
   Player (File › New Audio Recording) or Voice Memos, in a quiet room, about 20 cm from the microphone. Speak a
   little slower than conversation (the `say` voice runs at 185 words per minute; aim for 165–185). Trim the
   silence at the start and end; do not normalise or compress the clip, the recorder levels the whole mix.
3. Save each clip as `<shot id>.wav`, `.m4a` or `.aiff`, named by the id in the table: `hook`, `who`, `checkin`,
   `heard`, `overview`, `review`, `ask`, `brief`, `evals`, `close`. Shots with variants need one clip per variant:
   `verify.draft`, `verify.blocked`, `verify.removedNumber`, `verify.removedCount`, `verify.removedMedicine`,
   `verify.removedCondition`, `verify.removedHowOften`, `verify.removedBlocked`, `timeline.runs`, `timeline.plain`,
   `honesty.model`, `honesty.kb` (the recorder picks the variant from the screen during the run; the `removed*` lines
   are only used when the review card shows a "What the check removed" list). For the template-only cut, the
   changed line is `ask.noai`.
4. Run `PLAN=1 NARRATION_DIR=tmp/voice node scripts/submission/record-demo.mjs` to see the planned length with your
   clips (the recorder refuses a plan over 175 s; the hook should stay under about 8 s), then record with
   `NARRATION_DIR=tmp/voice`.

A missing clip falls back to `say`, and the recorder warns when it mixes the two voices. Record every shot for a
consistent voice.

### Pronunciation for `say` (`spoken`)

A shot can have an optional `spoken` field in `SHOTS`: that text is what `say` reads, while the captions and this
script keep `narration`. It holds phonetic respellings only, so the words stay the same: "A I" and "A G S" in the
review shot, "p equals" for "p =" in both timeline lines, and "H L 7 fire" for HL7 FHIR in the brief shot. Recorded
clips ignore it.

### What the script does

1. It checks this file is in sync, and that the hook's statistics are still in
   `kb-src/research/market-evidence.md`: the Gandhi et al. (NEJM 2003) row with the share of ameliorable events
   attributed to the patient not telling the physician (37%, which must stay above a third for the spoken "more
   than a third"), and the CDC falls row. It reads the evaluation numbers for the evals shot from
   `eval/results/nlp-eval.json` and `eval/results/meds-eval.json` at startup, so rerunning an evaluation cannot leave
   the narration behind (this file must then be updated too, which the sync check enforces). It checks that
   `eval/results/timeline-null.json` still gives a null-study flag rate above 0.1 (`independent.moderateRate`, the
   timeline shot's "more than one in ten"), and that the How it works status table (`src/views/public/howStatus.ts`)
   still marks the hand-off "one shared browser today, or a backup file" (Partial) and family sharing as Planned
   (the hand-off note).
2. It writes each shot's narration with `say` (or takes the recorded clip) and measures the clip with `ffprobe`
   first. A shot then stays on screen for at least as long as its narration (0.3 s lead-in plus 0.45 s tail).
3. It drives system Chrome through Playwright (`channel: "chrome"`, 1440×900, device pixel ratio 1, WebGPU enabled)
   in a persistent profile, `tmp/demo-video-profile`, because a throwaway context's storage quota is too small to
   cache the model. The app's localStorage is cleared first, so the seeded demo record is created fresh. Off camera,
   it opens each page of the video once (as Margaret, then as Alex), loads the model from Settings, asks one warm-up
   question and signs out. Check-in text is typed key by key. Highlights and punch-ins are timed to the narration
   (from each phrase's position in the line).
4. **Every number spoken is checked on screen during the run, or read from a results file.** Examples: "9 of 14
   answered days", "Fisher's exact test, p = 0.0023", "of 9 compared diary items" (nine items), "270 resources",
   the held-out micro-F1 and story count, "57 of 57"; "more than one in ten" comes from
   `eval/results/timeline-null.json`. If the app shows something else, the run stops instead of producing a video
   with wrong narration.
5. It retimes the video to wall-clock speed. Playwright's screencast does not play back in real time (the raw video
   runs longer than the wall clock; each run's `timings.json` records `rawVideoSec` and `totalSec`). So the page
   shows a 10×10 px marker in the bottom-right corner whose colour changes at each shot start and each cursor move.
   ffmpeg finds those colour changes, retimes each segment linearly back to real time with `setpts`, and paints the
   marker out with `delogo`.
6. It converts to H.264 (yuv420p, 30 fps, CRF 20). Each narration clip is placed at its shot start with
   `adelay` + `amix normalize=0`, the mix is normalised with `loudnorm=I=-16:TP=-1.5`, and the result is muxed.
7. It writes `kinwise-demo.mp4`, `kinwise-demo.srt` and `timings.json`.

To record by hand, follow the table below at a calm pace. Use a 1440×900 browser window and a fresh profile, or
Settings › Restore demo. Open each page once before you start recording, so no page shows its loading
placeholders on camera, and read each line once the screen shows what it describes.

## Shot list

"≈ Length" is the planned, narration-bound length with the `say` voice (`PLAN=1`); "≈ Start" adds them up (page
changes between shots add about a second each on top). The real times of each render are in its `timings.json`.
**Bold** words in the actions column are buttons or links that are clicked.

| # | Id · chapter label | ≈ Start · length | Screen / route | On-screen actions | Narration (exact) |
|---|--------------------|------------------|----------------|-------------------|-------------------|
| 1 | `hook` · (no label) | 0:00 · 5.5 s | Title card over Welcome (`#/`) | No cursor on the card (hidden until the next shot). Card: "More than **a third** of medicine side effects that could have been eased were linked to **the doctor never being told**." Source: Gandhi et al., NEJM 2003 · 4 Boston primary-care practices · 37% of ameliorable adverse drug events. As the narration reaches "the doctor never being told", a second line fades in: "Of older adults who fall, **less than half** tell their doctor." Source: CDC, Facts About Older Adult Falls · cdc.gov/falls. | More than a third of medicine side effects that could have been eased were linked to the doctor never being told. |
| 2 | `who` · Margaret and Alex | 0:05 · 15.3 s | Welcome `#/` → Patient Today `#/p/today` → My medicines `#/p/meds` | Card fades to the live Welcome screen; ring on its headline "Notice what changes after a medicine change, and bring a clear question to the visit." (checked) as Kinwise is introduced. At "Meet Margaret" the cursor appears and the ring moves to "Margaret Rivera (78) and her daughter Alex are fictional". Just before "Urgent care", click **Try as Margaret**, then her **My medicines** tab; ring on the Lorazepam (Ativan) card, "Prescribed by Urgent care" (checked). | Kinwise helps families notice what changes after a medicine change, and bring one clear, sourced question to the doctor. Meet Margaret, seventy-eight, on eight medicines, and her daughter Alex, both fictional. Urgent care started a new sleeping pill. |
| 3 | `checkin` · Her check-in, in her own words | 0:21 · 6.0 s | Patient Today `#/p/today` | Before the shot: **Today** tab, scrolled to "Tell me about your day". Click the text box and type: *"Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. Slept badly. My granddaughter Sofia fell off her bike, poor thing. No ankle swelling."* Ring on **Fill in my check-in**. | Margaret describes her day in her own words. A clinical language engine reads it on her device. |
| 4 | `heard` · Language engine, on her device | 0:27 · 10.7 s | Today › "Here's what I heard" | Click **Fill in my check-in**. The ring moves span by span as each is named: woozy → *Dizzy*, nearly went over → *Near-fall*, No ankle swelling → *No swelling*, fell off her bike → *Someone else*. Scroll to **Things I didn't add**: "that's about someone else". At "Margaret confirms", click **Yes, that's right** on the reading's best guess (sleep, "My best guess — please check"); the recorder checks the button is gone afterwards. Nothing is saved. Captions stay at the bottom in this shot. | Woozy becomes dizziness, nearly went over a near-fall, and no ankle swelling stays a no. Sofia's fall is set aside as someone else's. Margaret confirms each answer. |
| 5 | `overview` · What Alex sees | 0:37 · 14.4 s | Caregiver Overview `#/c/overview` | Before the shot: **Demo: switch to Alex's view** (found by its name wherever the patient header puts it; if it is missing, **Sign out** → **Try as Alex**). Only visible text is checked and ringed (the engine's full sentence "Dizziness was recorded on 9 of 14 answered days …" sits in the collapsed "How reliable is this?" disclosure): the recorder checks the headline "Dizziness … recorded more often since Lorazepam (Ativan) started …" and the before/after bars ("answered days only"; Dizziness Before 2 of 19 days, After 9 of 14 days) before the first ring. Once the card is scrolled into view, an on-screen note in the empty part of the caregiver sidebar (under Settings, above "How Kinwise works") says for 5 s: "Today both views share one device, or a backup file; family sharing is planned." (not spoken; checked against the How it works status table). Ring on the headline, then on the before/after bars; punch-in on the bars (2 of 19 days → 9 of 14 days). Ring and punch-in on the falls line "1 fall … and 2 near-falls … on 14 answered days". Punch-in on "Shows a change in what was recorded, not what caused it." | Since lorazepam started, dizziness was recorded on 9 of 14 answered days, compared with 2 of 19 before. One fall and two near-falls were recorded on those 14 days. It shows a change in what was recorded, not what caused it. |
| 6 | `review` · Medication review: code, with sources | 0:52 · 20.1 s | Medication review `#/c/review` | Before the shot: sidebar → **Medication review**. Ring on the anticholinergic burden card, punch-in on its "Total score 7". Ring on Medicines linked to falls, then Beers Criteria prompts. Scroll to the first finding, "Possible prescribing cascade: Amlodipine → ankle swelling → Furosemide (Lasix)". With the model: click **Explain in simpler words** ("Writing a simpler version on this device…"). Open **Why this matters**; ring on the source link, then on the question for the doctor or pharmacist. | Deterministic code, not AI, checks her eight medicines against AGS Beers 2023, anticholinergic burden, where she scores 7, fall-risk lists, and possible prescribing cascades, like furosemide for ankle swelling after amlodipine. Each finding ends in a sourced question for her doctor or pharmacist. |
| 7 | `verify` · The safety net: AI wording checked by code (model cut only) | 1:12 · 6.8 s | Review › cascade finding | The recorder waits for the explanation, reads the outcome off the screen and picks the matching line. If the card shows a **"What the check removed"** list, it opens it (before the narration) and picks the `removed*` line that names the **first reason shown** (only the first of several "; "-joined reasons counts; "Reason: has a number that is not in the finding or its reference text" → `removedNumber`, "… count that does not match …" → `removedCount`, "names a medicine this finding is not about" (or, in the brief, "… that is not on the list") → `removedMedicine`, "names a condition …" → `removedCondition`, "says how often …" → `removedHowOften`, "Blocked: …" → `removedBlocked`); it rings the outcome note, then zooms the removed item (the quoted AI sentence and its reason) only when that sentence is neutral. For `removedBlocked`, or a quoted sentence with causal, safety or medicine-change wording (e.g. "pause the lorazepam"), it rings and zooms only the reason line, so AI text that could read like advice is never magnified away from the app's "These sentences are not advice" caution. The quoted sentence is saved in `timings.json`. A reason with no line stops the run. Without the list: **`draft`** (shown, and free of banned wording): ring on the clinical wording, then a punch-in on the plain-language draft, then the ring on "Checked by code against the finding and the reference text". **`blocked`** (the outcome of the last renders): punch-in on "The code check rejected the AI wording, so only the records-based text is shown.", then the ring on the original plain text. | `verify.draft`: The on-device model rewrites the wording in plain language; code checks every sentence against the source first. <br>`verify.blocked`: The safety net: here the model's wording failed the source check, so code hides it and the original text stays. <br>`verify.removedNumber`: The safety net: code checked the model's wording and removed a sentence with a number the sources don't have. <br>`verify.removedCount`: The safety net: code checked the model's wording and removed a sentence whose count doesn't match the sources. <br>`verify.removedMedicine`: The safety net: code checked the model's wording and removed a sentence naming a medicine this finding isn't about. <br>`verify.removedCondition`: The safety net: code checked the model's wording and removed a sentence naming a condition the sources don't mention. <br>`verify.removedHowOften`: The safety net: code checked the model's wording and removed a sentence saying how often, which the sources don't. <br>`verify.removedBlocked`: The safety net: code checked the model's wording and removed a sentence with wording its rules block. |
| 8 | `timeline` · The statistics behind it | 1:19 · 15.8 s (`plain` 13.0 s) | Symptoms & timeline `#/c/timeline` | Before the shot: sidebar → **Symptoms & timeline**; the recorder checks the dizziness row (2 of 19 days → 9 of 14 days, "Fisher's exact test, p = 0.0023", found by those numbers rather than its size words) and the lead "… of 9 compared diary items changed enough to be flagged", then picks the line. **`runs`** when the runs check holds: the row shows its runs check ("runs check p = 0.007") below the bar of the row's own size word (Large difference 0.01, Clear difference 0.05, the engine's gate bars), or, if the row does not show it, the seed test still pins dizziness `runsCheck.passed: true` (`src/engine/timeline/seed.timeline.test.ts`). Otherwise **`plain`**, without the clause. Ring on the row, punch-in on it as the test is named; with `runs` on screen, ring on the runs check at "it still holds". At "With nine items compared", ring on the lead line, punch-in on it at "more than one in ten". | `timeline.runs`: Dizziness: Fisher's exact test, p = 0.0023, and it still holds when whole runs of days are shuffled. With nine items compared, more than one in ten medicine changes with no real effect still get flagged, so it stays a question. <br>`timeline.plain`: Dizziness: Fisher's exact test, p = 0.0023. With nine items compared, more than one in ten medicine changes with no real effect still get flagged, so it stays a question. |
| 9 | `ask` · Ask Kinwise, with an on-device AI draft | 1:34 · 17.8 s (NO_AI 10.2 s) | Ask Kinwise `#/c/ask` | Before the shot: sidebar → **Ask Kinwise**. Click the chip "How many near-falls since lorazepam started?" Ring and punch-in on the *From the records* answer "Near-falls were recorded on 2 of 14 answered days…". With the model: the recorder waits for the draft and stops unless it passed the app's checks; at "A three-billion-parameter model" the ring spans the **"AI draft · on this device · Qwen2.5 3B Instruct · n s" header and the draft's first sentence**; at "drafts a short summary" the whole AI draft block is zoomed (the same punch-in callout as the overview, verify and timeline shots, held 2.2 s); at "code checks every number" the ring moves to "Checked against the records". Then type "Should she stop taking the lorazepam?" → the redirect card "That's a question for Margaret's doctor or pharmacist" → **Add to visit questions**. | `ask`: Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. A three-billion-parameter model on this laptop's GPU drafts a short summary; code checks every number and medicine name before it is shown. Treatment questions are redirected to her doctor or pharmacist. <br>`ask` (NO_AI): Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. Treatment questions are redirected to her doctor or pharmacist. |
| 10 | `brief` · Visit brief and FHIR export | 1:52 · 10.3 s | Visit brief `#/c/brief` | Before the shot: sidebar → **Visit brief** (the recorder waits out its loading state). **Use the standard template**. The recorder dismisses the toasts ("Brief rebuilt from the records", Ask's "Added to visit questions") and waits until none is on screen, so none covers At a glance. Ring on "What we've noticed" (before/after strip 2/19 → 9/14). If a "What the check removed" list is on screen (only after an AI brief run, so usually not), it is ringed briefly, without narration. Back to top, tick **I've reviewed this brief**, click **Print / Save as PDF**. Scroll to "Export for clinician": ring on "Valid FHIR R4 Bundle · 270 resources", then **Preview the JSON**. | The visit brief puts it on one page. Alex must mark it reviewed before it prints, and it exports as an HL7 FHIR R4 bundle of 270 resources. |
| 11 | `evals` · Live evaluation | 2:03 · 11.4 s | How Kinwise works `#/how-it-works` › Live evaluation | Before the shot: sidebar → **How Kinwise works**, scrolled to the live evaluation section (`#how-evaluation`). **Run the extraction benchmark now**: ring on the held-out set score (94.2% micro-F1, 70 stories). Then **Run the medication-review suite**: ring on "Cases fully passed 57 of 57". | Both test suites rerun live: 94.2 percent micro-F1 on 70 held-out fictional diary stories, and 57 of 57 synthetic medication cases passed. |
| 12 | `honesty` · Finished, partial, planned | 2:14 · 15.6 s (`kb` 15.0 s) | How it works › Finished vs planned | The section is found by its id (`#how-honesty`) or its heading, and opened if it is collapsed. The ring spans the "Working in this demo" row(s), glides to the Partial row(s), then scrolls to the Planned row(s); the recorder checks the planned validation study, pharmacy import and family sharing are listed. Before the shot it reads the Working and Partial rows and picks the line that fits them: the Working row must name the check-in, timeline, medication review, Ask Kinwise and visit brief; the knowledge-base coverage row must be Partial with "no dose or allergy checks" and the interaction limit ("interactions limited to the AGS Beers 2023 combination table"); **`model`** also needs the on-device model row with "the code check is not airtight" (the current table), **`kb`** is for a table where the model is not Partial. Other Partial rows (the timeline runs check, the hand-off, FHIR, English only) are fine. Anything else stops the run. | `honesty.model`: Working today: the check-in, timeline, review, Ask and brief you saw. Partial: the model's code check isn't airtight; no dose, allergy or full interaction checks yet. Planned: a validation study, pharmacy import and family sharing. <br>`honesty.kb`: Working today: the check-in, timeline, review, Ask and brief you saw. Partial: knowledge-base coverage; no dose, allergy or full interaction checks yet. Planned: a validation study, pharmacy import and family sharing. |
| 13 | `close` · (no label) | 2:30 · 8.0 s | End card | No cursor. "Notice what changes after a medicine change, and bring a clear question to the visit." One call to action, the same as the Devpost text and the Welcome button: **Take the 2-minute guided tour →** albertzorzolan.github.io/UnivaBioBabson (no sign-up · fictional data). Code: github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2. Albert Zorzolan and Neil Shah, Babson College. Footer: "Fictional demo data. Not medical advice. Knowledge base not yet clinician-reviewed." plus, in the model cut, "On-device model (Qwen2.5 3B Instruct, WebGPU) used only for the review explanation (shown only if it passes the source check) and the Ask Kinwise draft; the visit brief uses the standard template." (true whichever way shot 7 went), or "Template mode shown (on-device model not loaded)." | Kinwise. Records stay in your browser. Not yet clinician-reviewed; not medical advice. Try it at the link on screen. |

Planned total with the model: 2:37.7 (`say`); the 2026-10-18 render with page changes, the Ask draft and the on-screen
actions runs 2:49.9; template-only cut 2:23.2 (planned). The earlier
cut's Add-medication preview and "What is AI here" shots are no longer in the video, to reach the medication review
sooner; the app still has both (Medications › Add medication, and How it works › "The right tool for each job"). Their
points are said elsewhere: "Deterministic code, not AI" (review), "code checks every number and medicine name"
(Ask) and "Records stay in your browser" (end card).

The end card shows the live demo, https://albertzorzolan.github.io/UnivaBioBabson/ (deployed from the `medwatch-v2`
branch, live since Oct 11, 2026), and links the code on that branch, because the repository's default branch still
holds the first prototype. The links come from `scripts/submission/lib.mjs` (`DEMO_URL`, `CODE_URL`, the same ones
the PDFs print). **Release order:** render the submitted video only after the code it shows is on the end-card
branch and the live demo has been redeployed from it; otherwise the links show older code than the video. The
recorder checks this (read-only git) and stops for `submission/` unless `ALLOW_UNDEPLOYED=1` is set.

## Where every number comes from

| Spoken (or on the card) | Source |
|-------------------------|--------|
| "More than a third of medicine side effects that could have been eased were linked to the doctor never being told" (card: 37% of ameliorable adverse drug events) | Gandhi et al., NEJM 2003, 4 Boston primary-care practices (https://pubmed.ncbi.nlm.nih.gov/12700376/): of the ameliorable adverse drug events, 63% were attributed to the physician not responding to medication-related symptoms and 37% to the patient not telling the physician. "Could have been eased" is the paper's "ameliorable" (severity or duration could have been reduced); "were linked to" is no stronger than the paper's "attributed to". Recorded in `kb-src/research/market-evidence.md` (row 7); the recorder checks the row is still there and the share is still above a third. Only the percentages are used: the event counts behind them were not re-checked against the paper (market-evidence.md). |
| "Of older adults who fall, less than half tell their doctor" (card only, not spoken) | CDC, Facts About Older Adult Falls (https://www.cdc.gov/falls/data-research/facts-stats/index.html). `market-evidence.md` row 4; checked the same way. |
| "Kinwise helps families notice what changes after a medicine change, and bring one clear, sourced question to the doctor" | What the product does, as the Welcome headline says it ("Notice what changes after a medicine change, and bring a clear question to the visit.", checked on screen). "Sourced": every review finding cites its source (shot 6). |
| Margaret, seventy-eight; eight medicines; urgent care started a new sleeping pill | Seed record `src/model/seed.ts` (8 medicines; Lorazepam 0.5 mg at bedtime, prescriber "Urgent care", reason "Anxiety / sleep"). On screen: Welcome ("Margaret Rivera (78)", checked), her medicine list (Lorazepam card "Prescribed by Urgent care", checked) and Medication review ("Kinwise checked Margaret's 8 medicines", checked). |
| On-screen note: "Today both views share one device, or a backup file; family sharing is planned." | How it works › Finished vs planned (`src/views/public/howStatus.ts`): Partial "Patient-to-caregiver hand-off: one shared browser today, or a backup file"; Planned "Encrypted family sharing". The recorder checks both rows at startup (`checkHandoffSource`). |
| Dizziness 9 of 14 answered days vs 2 of 19 before; 1 fall and 2 near-falls on those 14 answered days | Seed record, pinned by `src/model/seed.test.ts`. On screen: Overview and the timeline before/after card. Checked on screen by the recorder. |
| Fisher's exact test, p = 0.0023 (dizziness, 9 of 14 vs 2 of 19) | `src/engine/timeline/stats.ts`: `fisherExact(9, 5, 2, 17)` = 0.00226, shown by `formatPValue` as "p = 0.0023". On screen: the timeline row "(Fisher's exact test, p = 0.0023)", checked, and the recorder checks that row is the 2 of 19 → 9 of 14 row. |
| "It still holds when whole runs of days are shuffled" (`timeline.runs` only) | The runs check (`src/engine/timeline/blockPermutation.ts`: 4-day runs shuffled 999 times, seeded). For the seed's dizziness row it gives p = 0.007, under the 0.01 bar of its "Large difference", so the strength is unchanged (`runsCheck.passed: true`, pinned in `src/engine/timeline/seed.timeline.test.ts`). The recorder reads it off the Timeline row when the row shows it, else checks the seed test's pin; otherwise it uses `timeline.plain`. The runs check is reported, not yet used to decide flags (How it works marks it Partial). |
| "With nine items compared, more than one in ten medicine changes with no real effect still get flagged" | Nine: the Timeline lead "5 of 9 compared diary items changed enough to be flagged" (checked on screen; `MULTIPLE_COMPARISONS_NOTE` in `src/engine/timeline/rules.ts` says the same). More than one in ten: `eval/results/timeline-null.json`, `independent.moderateRate` 0.112 (1,000 simulated changes with no real effect, independent days), checked above 0.1 at startup. It is the study's lowest rate: with clustered days it is 0.858, so "more than one in ten" is a floor, not an estimate. |
| Anticholinergic burden: she scores 7 | Live app, Medication review ACB card, "Total score 7" (checked): Oxybutynin 3 + diphenhydramine in Tylenol PM 3 + Furosemide 1. |
| Possible prescribing cascade: furosemide for ankle swelling after amlodipine | Live app, Review finding "Possible prescribing cascade: Amlodipine → ankle swelling → Furosemide" (checked), source Savage et al., JAMA Intern Med 2020. |
| "Deterministic code, not AI, checks her eight medicines" | The review comes from the rule engine (`src/engine/meds`) over the compiled knowledge base (`kb-src/build_kb.py` → `src/kb/data`); no model is involved. The optional AI explanation is shown separately and checked (shot 7). |
| The model's explanation passed or failed the source check (shot 7) | Read off the screen during the run, never assumed; the outcome and the on-screen text are saved in `timings.json` (`aiExplainOnScreen`). In an earlier live run the source check blocked this exact explanation (`eval/results/ai-live.json`, `explain[0]`). |
| Near-falls on 2 of 14 answered days | Live app, Ask Kinwise answer. Checked on screen. |
| "A three-billion-parameter model on this laptop's GPU drafts a short summary"; "code checks every number and medicine name before it is shown" | The model is Qwen2.5 3B Instruct (the Ask badge "AI draft · on this device · Qwen2.5 3B Instruct", checked on screen), run through WebLLM on WebGPU on the recording laptop. The checks are `src/engine/brief/verify.ts` rules 2 (numbers) and 3 (medicine names), run on every Ask draft sentence before it is shown (`src/ai/tasks.ts`); the recorder stops unless the draft passed and is free of banned wording. |
| The `verify.removed*` reasons (only when the review card lists "What the check removed") | Read off the screen: the first "Reason: …" / "Blocked: …" line of the list, in the plain words of `plainIssue` (`src/ai/tasks.ts`); `record-demo.test.mjs` checks every line still matches a wording `plainIssue` can show. |
| FHIR R4 bundle of 270 resources | Live app, "Valid FHIR R4 Bundle · 270 resources" (checked). Matches `docs/samples/kinwise-fhir-bundle.json` (270 entries). |
| 94.2 percent micro-F1 on 70 held-out fictional diary stories | Read at startup from `eval/results/nlp-eval.json` (`heldout.micro.f1` 0.9422, `heldout.cases` 70), rounded like `scripts/submission/facts.mjs`; re-run live on How it works and checked on screen. The stories are fictional, written separately by an AI agent directed by the team, working from `eval/ANNOTATION-GUIDE.md` without access to the extractor or the dev corpus, and not clinician-reviewed (`docs/EVALUATION.md` corpus table; the file's `author` field records that it was written without access to the extractor or the dev corpus). |
| 57 of 57 synthetic medication cases | Read at startup from `eval/results/meds-eval.json` (`summary.casesPassed` of `summary.cases`); re-run live on How it works and checked on screen. The cases are synthetic, written for the team by an AI agent it directed, separately from the engine, and not clinician-reviewed (`eval/MED-CASES-METHOD.md`). 57 of 57 shows the code meets this written specification; it is not clinical validation. |
| Working, Partial and Planned items; "the check-in, timeline, review, Ask and brief"; "the code check is not airtight"; "no dose, allergy or full interaction checks" | How it works › "Finished vs planned" table (`src/views/public/howStatus.ts`), read off the screen during the run; the Working and Partial rows' text is saved in `timings.json` (`workingOnScreen`, `partialOnScreen`). "Working today" names only the five things the video showed (the model is Partial, so not "everything you saw"). The verifier gap behind "not airtight" is `eval/results/ai-live.json` (`verdict`); "no dose or allergy checks" and "interactions limited to the AGS Beers 2023 combination table (not a full drug-interaction checker)" are the knowledge-base coverage row. |
| "Records stay in your browser" | The app has no backend: records are kept in this browser's storage (`src/app/StoreProvider.tsx`), and How it works › "Privacy" says so. |

## Wording rules the narration follows (SPEC §3)

- It makes no causal claim about Margaret's medicines. The only use of "caused" is the app's own caveat: "a change
  in what was recorded, not what caused it". The hook reports what a published study attributed ("were linked to the
  doctor never being told", no stronger than the paper's "attributed to"), about patients in that study, not about
  anyone in the demo.
- It never calls a medicine safe, unsafe or dangerous, and gives no stop, start or change advice. The treatment
  question shown on screen is redirected to the doctor or pharmacist.
- Every count comes with its denominator ("9 of 14 answered days", "2 of 19", "57 of 57"), and the p-value is said
  together with its test and with how often chance alone gets flagged ("with nine items compared, more than one in
  ten medicine changes with no real effect still get flagged, so it stays a question").
- Findings are framed as questions for her doctor or pharmacist.
- It makes no FDA, HIPAA or clinical-validation claim. Both benchmark numbers are said to be on fictional or
  synthetic cases, the cascade is called "possible", as the finding on screen calls it, and the honesty shot says
  there are no dose or allergy checks. It says the knowledge base is not yet clinician-reviewed, that Kinwise is not
  medical advice, and lists the validation study as planned.
- It says what the on-device model does in the recording (rewrites wording and drafts a short summary, both checked
  by code) and that the medication review is deterministic code. It does not claim the checks are perfect: the
  verify shot shows whichever way the source check went, the honesty shot says the code check is not airtight, and
  in the recorded live run the checks let at least 6 flawed AI sentences (from 5 outputs) through (counted in
  `eval/results/verifier-redteam.json`, the same phrase `scripts/submission/facts.mjs` prints), which is why the model
  stays optional and labelled.

If you change a line, keep these rules, update this file, and re-run the script: its sync check catches a line that
differs from this file, and its on-screen checks catch numbers that no longer match the app.
