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

- **Length:** must stay under 2:55. The narration alone plans about 2:29 for the cut with the on-device model and
  about 2:15 for the template-only cut (`PLAN=1`, macOS voice "Samantha" at 175 wpm). Page changes happen between
  shots, off the narration, and add about a second each; the model's Ask draft takes a varying time. So an AI
  render comes out about 10 s longer than planned: the test render of 2026-10-17 (`tmp/r2-video-test`, `blocked`
  verify line) ran 2:39.6, with the medication review starting at 0:51.5.
  On-screen actions can only make a shot longer. Each render writes the real start, end and narration time of every
  shot to `timings.json` (see [Re-recording](#re-recording)), and prints a warning if the result is over 3:00.
- **Order:** judges mostly watch the first minute, so the problem, the people, her check-in and what Alex sees come
  first and the medication review starts at about 0:50 (planned 0:49 plus page changes; 0:51.5 in the test render). The statistics, the
  on-device AI draft, the brief, the live evaluation and the honest status follow.
- **App state:** a fresh browser profile with the seeded fictional demo record (Margaret Rivera, 78, on eight
  medicines, and her daughter Alex). All data is fictional.
- **On-device model:** the optional on-device language model (Qwen2.5 3B Instruct, q4f16, through WebLLM on WebGPU)
  is loaded off camera before the recording starts, from the local copy in `public/models/resolve/` (git-ignored;
  `node scripts/download-model.mjs`). It appears in two places. In the review shot, "Explain in simpler words" is
  clicked on the cascade finding, and the verify shot shows how the code check came out (see shot 7). In the Ask
  shot it drafts a plainer answer under the records answer, labelled "AI draft · on this device · Qwen2.5 3B
  Instruct"; the recorder rings that label with the draft's first sentence and zooms them as the narration names the
  model. Every other answer, finding, count and brief sentence on screen comes from the deterministic engines, and
  the visit brief uses the standard template. Requests to model hosts are blocked during the run, and the recorder
  stops if one is attempted. The model's text is never quoted in the narration. The recorder checks that what the
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
  so it never covers the Kinwise logo at the top left; and burned-in captions for muted viewers (the same text as
  the `.srt`). They are injected into the recording browser only.
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
- **Captions:** each line is cut into sentences, and long sentences into chunks of about 84 characters. A chunk of
  one or two words ("passed.", "after amlodipine.") is merged into the cue before it (a line's first chunk, such as
  "Kinwise.", into the cue after it) when the two together stay within about 90 characters, so no caption flashes
  up for half a second.

### Recording your own narration (`NARRATION_DIR`)

A human voice is warmer than `say`, and it is the recommended voice for the submitted video. One teammate records
one clip per shot, and the recorder uses those clips instead of `say`, then paces each shot to the clip's real
length (measured with `ffprobe`):

1. Make a folder, e.g. `tmp/voice/` (tmp/ is never committed).
2. For each shot, record the **Narration (exact)** text from the table below, word for word, because the captions
   and the `.srt` show that text. Read numbers naturally: "p = 0.0023" as "p equals zero point zero zero two
   three", "AGS" as "A G S", "HL7 FHIR R4" as "H L 7 fire R 4", "94.2" as "ninety-four point two". Use QuickTime
   Player (File › New Audio Recording) or Voice Memos, in a quiet room, about 20 cm from the microphone. Speak a
   little slower than conversation (the `say` voice runs at 175 words per minute; aim for 160–175). Trim the
   silence at the start and end; do not normalise or compress the clip, the recorder levels the whole mix.
3. Save each clip as `<shot id>.wav`, `.m4a` or `.aiff`, named by the id in the table: `hook`, `who`, `checkin`,
   `heard`, `overview`, `review`, `timeline`, `ask`, `brief`, `evals`, `close`. Shots with variants need one clip per
   variant: `verify.draft`, `verify.blocked`, `honesty.model`, `honesty.kb` (the recorder picks the variant from
   the screen during the run). For the template-only cut, the changed line is `ask.noai`.
4. Run `PLAN=1 NARRATION_DIR=tmp/voice node scripts/submission/record-demo.mjs` to see the planned length with your
   clips (a slow read can push it towards 2:55; the hook should stay under about 8 s), then record with
   `NARRATION_DIR=tmp/voice`.

A missing clip falls back to `say`, and the recorder warns when it mixes the two voices. Record every shot for a
consistent voice.

### Pronunciation for `say` (`spoken`)

A shot can have an optional `spoken` field in `SHOTS`: that text is what `say` reads, while the captions and this
script keep `narration`. It holds phonetic respellings only, so the words stay the same: "A I" and "A G S" in the
review shot, "p equals" for "p =" in the timeline shot, and "H L 7 fire" for HL7 FHIR in the brief shot. Recorded
clips ignore it.

### What the script does

1. It checks this file is in sync, and that the hook's statistics are still in
   `kb-src/research/market-evidence.md`: the Gandhi et al. (NEJM 2003) row with the share of ameliorable events
   attributed to the patient not telling the physician (37%, which must stay above a third for the spoken "more
   than a third"), and the CDC falls row. It reads the evaluation numbers for the evals shot from
   `eval/results/nlp-eval.json` and `eval/results/meds-eval.json` at startup, so rerunning an evaluation cannot leave
   the narration behind (this file must then be updated too, which the sync check enforces).
2. It writes each shot's narration with `say` (or takes the recorded clip) and measures the clip with `ffprobe`
   first. A shot then stays on screen for at least as long as its narration (0.3 s lead-in plus 0.45 s tail).
3. It drives system Chrome through Playwright (`channel: "chrome"`, 1440×900, device pixel ratio 1, WebGPU enabled)
   in a persistent profile, `tmp/demo-video-profile`, because a throwaway context's storage quota is too small to
   cache the model. The app's localStorage is cleared first, so the seeded demo record is created fresh. Off camera,
   it opens each page of the video once (as Margaret, then as Alex), loads the model from Settings, asks one warm-up
   question and signs out. Check-in text is typed key by key. Highlights and punch-ins are timed to the narration
   (from each phrase's position in the line).
4. **Every number spoken is checked on screen during the run.** Examples: "9 of 14 answered days",
   "Fisher's exact test, p = 0.0023", "270 resources", the held-out micro-F1 and story count, "57 of 57". If the
   app shows something else, the run stops instead of producing a video with wrong narration.
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
| 1 | `hook` · (no label) | 0:00 · 7.5 s | Title card over Welcome (`#/`) | Card: "More than **a third** of medicine side effects that could have been eased went on because **the doctor was never told**." Source: Gandhi et al., NEJM 2003 · 4 Boston primary-care practices · 37% of ameliorable adverse drug events. As the narration reaches "because the doctor was never told", a second line fades in: "Of older adults who fall, **less than half** tell their doctor." Source: CDC, Facts About Older Adult Falls · cdc.gov/falls. | In a primary-care study, more than a third of medicine side effects that could have been eased went on because the doctor was never told. |
| 2 | `who` · Margaret and Alex | 0:08 · 8.6 s | Welcome `#/` → Patient Today `#/p/today` | Card fades to the live Welcome screen. Ring on "Margaret Rivera (78) and her daughter Alex are fictional". At "Urgent care", click **Try as Margaret**; her Today screen scrolls to "Tell me about your day". | Meet Margaret, seventy-eight, on eight medicines, and her daughter Alex, both fictional. Urgent care started a new sleeping pill. |
| 3 | `checkin` · Her check-in, in her own words | 0:16 · 6.2 s | Patient Today `#/p/today` | Click the text box and type: *"Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. Slept badly. My granddaughter Sofia fell off her bike, poor thing. No ankle swelling."* Ring on **Fill in my check-in**. | Margaret describes her day in her own words. A clinical language engine reads it on her device. |
| 4 | `heard` · Language engine, on her device | 0:22 · 11.9 s | Today › "Here's what I heard" | Click **Fill in my check-in**. The ring moves span by span as each is named: woozy → *Dizzy*, nearly went over → *Near-fall*, No ankle swelling → *No swelling*, fell off her bike → *Someone else*. Scroll to **Things I didn't add**: "that's about someone else". Nothing is saved. | Woozy becomes dizziness, nearly went over a near-fall, and no ankle swelling stays a no. Sofia's fall is set aside as someone else's. Margaret confirms each answer before saving. |
| 5 | `overview` · What Alex sees | 0:34 · 14.9 s | Caregiver Overview `#/c/overview` | Before the shot: **Demo: switch to Alex's view** (found by its name wherever the patient header puts it; if it is missing, **Sign out** → **Try as Alex**). Ring on "Dizziness was recorded on 9 of 14 answered days … compared with 2 of 19". Punch-in on the before/after bars (2 of 19 days → 9 of 14 days). Ring and punch-in on the falls line "1 fall … and 2 near-falls … on 14 answered days". Punch-in on "Shows a change in what was recorded, not what caused it." | Since lorazepam started, dizziness was recorded on 9 of 14 answered days, compared with 2 of 19 before. One fall and two near-falls were recorded on those 14 days. It shows a change in what was recorded, not what caused it. |
| 6 | `review` · Medication review: code, with sources | 0:49 · 20.9 s | Medication review `#/c/review` | Before the shot: sidebar → **Medication review**. Ring on the anticholinergic burden card, punch-in on its "Total score 7". Ring on Medicines linked to falls, then Beers Criteria prompts. Scroll to the first finding, "Possible prescribing cascade: Amlodipine → ankle swelling → Furosemide (Lasix)". With the model: click **Explain in simpler words** ("Writing a simpler version on this device…"). Open **Why this matters**; ring on the source link, then on the question for the doctor or pharmacist. | Deterministic code, not AI, checks her eight medicines against AGS Beers 2023, anticholinergic burden, where she scores 7, fall-risk lists, and possible prescribing cascades, like furosemide for ankle swelling after amlodipine. Each finding ends in a sourced question for her doctor or pharmacist. |
| 7 | `verify` · The safety net: AI wording checked by code (model cut only) | 1:10 · 7.1 s | Review › cascade finding | The recorder waits for the explanation, reads the outcome off the screen and picks the matching line. **`draft`** (shown, and free of banned wording): ring on the clinical wording, then a punch-in on the plain-language draft, then the ring on "Checked by code against the finding and the reference text". **`blocked`** (the outcome of the last renders): punch-in on "The AI wording didn't pass the source check, so it isn't shown. The original text above stays.", then the ring on the original plain text. | `verify.draft`: The on-device model rewrites the wording in plain language; code checks every sentence against the source first. <br>`verify.blocked`: The safety net: here the model's wording failed the source check, so code hides it and the original text stays. |
| 8 | `timeline` · The statistics behind it | 1:17 · 10.7 s | Symptoms & timeline `#/c/timeline` | Before the shot: sidebar → **Symptoms & timeline**. In the before/after card, the ring goes round the dizziness row (2 of 19 days → 9 of 14 days, "Fisher's exact test, p = 0.0023"), found by those numbers rather than its size words; punch-in on that row as the test is named. Then the "Falls and near-falls, listed by date" box. | The timeline tests the change in dizziness: Fisher's exact test, p = 0.0023. Falls are listed by date: too few to test. |
| 9 | `ask` · Ask Kinwise, with an on-device AI draft | 1:28 · 18.3 s (NO_AI 10.6 s) | Ask Kinwise `#/c/ask` | Before the shot: sidebar → **Ask Kinwise**. Click the chip "How many near-falls since lorazepam started?" Ring and punch-in on the *From the records* answer "Near-falls were recorded on 2 of 14 answered days…". With the model: the recorder waits for the draft and stops unless it passed the app's checks; at "A 3-billion-parameter model" the ring spans the **"AI draft · on this device · Qwen2.5 3B Instruct · n s" header and the draft's first sentence**, at "drafts a plainer answer" they are zoomed, and at "code checks every number" the ring moves to "Checked against the records". Then type "Should she stop taking the lorazepam?" → the redirect card "That's a question for Margaret's doctor or pharmacist" → **Add to visit questions**. | `ask`: Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. A 3-billion-parameter model running on this laptop's GPU drafts a plainer answer; code checks every number and medicine name first. Treatment questions are redirected to her doctor or pharmacist. <br>`ask` (NO_AI): Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. Treatment questions are redirected to her doctor or pharmacist. |
| 10 | `brief` · Visit brief and FHIR export | 1:46 · 10.7 s | Visit brief `#/c/brief` | Before the shot: sidebar → **Visit brief** (the recorder waits out its loading state). **Use the standard template**. Ring on "What we've noticed" (before/after strip 2/19 → 9/14). If a "What the check removed" list is on screen (only after an AI brief run, so usually not), it is ringed briefly, without narration. Back to top, tick **I've reviewed this brief**, click **Print / Save as PDF**. Scroll to "Export for clinician": ring on "Valid FHIR R4 Bundle · 270 resources", then **Preview the JSON**. | The visit brief puts it on one page. Alex must mark it reviewed before it prints, and it exports as an HL7 FHIR R4 bundle of 270 resources. |
| 11 | `evals` · Live evaluation | 1:57 · 11.9 s | How Kinwise works `#/how-it-works` › Live evaluation | Before the shot: sidebar → **How Kinwise works**, scrolled to the live evaluation section (`#how-evaluation`). **Run the extraction benchmark now**: ring on the held-out set score (94.2% micro-F1, 70 stories). Then **Run the medication-review suite**: ring on "Cases fully passed 57 of 57". | Both test suites rerun live: 94.2 percent micro-F1 on 70 held-out fictional diary stories, and 57 of 57 synthetic medication cases passed. |
| 12 | `honesty` · Finished, partial, planned | 2:09 · 12.4 s (`kb` 11.7 s) | How it works › Finished vs planned | The section is found by its id (`#how-honesty`) or its heading, and opened if it is collapsed. The ring spans the "Working in this demo" row(s), glides to the Partial row(s), then scrolls to the Planned row(s); the recorder checks the planned validation study, pharmacy import and family sharing are listed. Before the shot it reads the Partial rows and picks the line whose Partial items the page really marks Partial. Both lines need the knowledge-base coverage row with "no dose or allergy checks" on screen; **`model`** also needs the on-device model row with "the code check is not airtight" (the current table), **`kb`** is for a table where the model is not Partial. Anything else stops the run. | `honesty.model`: Working today: everything you saw. Partial: the model's code check isn't airtight; no dose or allergy checks yet. Planned: a validation study, pharmacy import and family sharing. <br>`honesty.kb`: Working today: everything you saw. Partial: knowledge-base coverage; no dose or allergy checks yet. Planned: a validation study, pharmacy import and family sharing. |
| 13 | `close` · (no label) | 2:21 · 8.4 s | End card | "Notice what changes after a medicine change, and bring a clear question to the visit." **Try it now: albertzorzolan.github.io/UnivaBioBabson → Try as Alex** (no sign-up, fictional data). Code: github.com/albertzorzolan/UnivaBioBabson/tree/medwatch-v2. Albert Zorzolan · Neil Shah — Babson College. Footer: "Fictional demo data. Not medical advice. Knowledge base not yet clinician-reviewed." plus, in the model cut, "On-device model (Qwen2.5 3B Instruct, WebGPU) used only for the review explanation (shown only if it passes the source check) and the Ask Kinwise draft; the visit brief uses the standard template." (true whichever way shot 7 went), or "Template mode shown (on-device model not loaded)." | Kinwise. Records stay in your browser. Not yet clinician-reviewed; not medical advice. Try it at the link on screen. |

Planned total with the model: 2:29 (`say`), about 2:40 once page changes and the Ask draft are added. The earlier
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
| "More than a third of medicine side effects that could have been eased went on because the doctor was never told" (card: 37% of ameliorable adverse drug events) | Gandhi et al., NEJM 2003, 4 Boston primary-care practices (https://pubmed.ncbi.nlm.nih.gov/12700376/): of the ameliorable adverse drug events, 63% were attributed to the physician not responding to medication-related symptoms and 37% to the patient not telling the physician. "Could have been eased" is the paper's "ameliorable" (severity or duration could have been reduced). Recorded in `kb-src/research/market-evidence.md` (row 7); the recorder checks the row is still there and the share is still above a third. Only the percentages are used: the event counts behind them were not re-checked against the paper (market-evidence.md). |
| "Of older adults who fall, less than half tell their doctor" (card only, not spoken) | CDC, Facts About Older Adult Falls (https://www.cdc.gov/falls/data-research/facts-stats/index.html). `market-evidence.md` row 4; checked the same way. |
| Margaret, seventy-eight; eight medicines; urgent care started a new sleeping pill | Seed record `src/model/seed.ts` (8 medicines; Lorazepam 0.5 mg at bedtime, prescriber "Urgent care", reason "Anxiety / sleep"). On screen: Welcome ("Margaret Rivera (78)", checked) and Medication review ("Kinwise checked Margaret's 8 medicines", checked). |
| Dizziness 9 of 14 answered days vs 2 of 19 before; 1 fall and 2 near-falls on those 14 answered days | Seed record, pinned by `src/model/seed.test.ts`. On screen: Overview and the timeline before/after card. Checked on screen by the recorder. |
| Fisher's exact test, p = 0.0023 (dizziness, 9 of 14 vs 2 of 19) | `src/engine/timeline/stats.ts`: `fisherExact(9, 5, 2, 17)` = 0.00226, shown by `formatPValue` as "p = 0.0023". On screen: the timeline row "(Fisher's exact test, p = 0.0023)", checked, and the recorder checks that row is the 2 of 19 → 9 of 14 row. |
| Anticholinergic burden: she scores 7 | Live app, Medication review ACB card, "Total score 7" (checked): Oxybutynin 3 + diphenhydramine in Tylenol PM 3 + Furosemide 1. |
| Possible prescribing cascade: furosemide for ankle swelling after amlodipine | Live app, Review finding "Possible prescribing cascade: Amlodipine → ankle swelling → Furosemide" (checked), source Savage et al., JAMA Intern Med 2020. |
| "Deterministic code, not AI, checks her eight medicines" | The review comes from the rule engine (`src/engine/meds`) over the compiled knowledge base (`kb-src/build_kb.py` → `src/kb/data`); no model is involved. The optional AI explanation is shown separately and checked (shot 7). |
| The model's explanation passed or failed the source check (shot 7) | Read off the screen during the run, never assumed; the outcome and the on-screen text are saved in `timings.json` (`aiExplainOnScreen`). In an earlier live run the source check blocked this exact explanation (`eval/results/ai-live.json`, `explain[0]`). |
| Near-falls on 2 of 14 answered days | Live app, Ask Kinwise answer. Checked on screen. |
| "A 3-billion-parameter model running on this laptop's GPU"; "code checks every number and medicine name first" | The model is Qwen2.5 3B Instruct (the Ask badge "AI draft · on this device · Qwen2.5 3B Instruct", checked on screen), run through WebLLM on WebGPU on the recording laptop. The checks are `src/engine/brief/verify.ts` rules 2 (numbers) and 3 (medicine names), run on every Ask draft sentence (`src/ai/tasks.ts`); the recorder stops unless the draft passed and is free of banned wording. |
| FHIR R4 bundle of 270 resources | Live app, "Valid FHIR R4 Bundle · 270 resources" (checked). Matches `docs/samples/kinwise-fhir-bundle.json` (270 entries). |
| 94.2 percent micro-F1 on 70 held-out fictional diary stories | Read at startup from `eval/results/nlp-eval.json` (`heldout.micro.f1` 0.9422, `heldout.cases` 70), rounded like `scripts/submission/facts.mjs`; re-run live on How it works and checked on screen. The stories are fictional, written by members of the team with AI assistance (`docs/EVALUATION.md`). |
| 57 of 57 synthetic medication cases | Read at startup from `eval/results/meds-eval.json` (`summary.casesPassed` of `summary.cases`); re-run live on How it works and checked on screen. The cases are synthetic, written for the team by an AI agent it directed, separately from the engine, and not clinician-reviewed (`eval/MED-CASES-METHOD.md`). 57 of 57 shows the code meets this written specification; it is not clinical validation. |
| Working, Partial and Planned items; "the code check is not airtight"; "no dose or allergy checks" | How it works › "Finished vs planned" table (`src/views/public/howStatus.ts`), read off the screen during the run; the Partial rows' text is saved in `timings.json` (`partialOnScreen`). The verifier gap behind "not airtight" is `eval/results/ai-live.json` (`verdict`); "no dose or allergy checks" is the knowledge-base coverage row. |
| "Records stay in your browser" | The app has no backend: records are kept in this browser's storage (`src/app/StoreProvider.tsx`), and How it works › "Privacy" says so. |

## Wording rules the narration follows (SPEC §3)

- It makes no causal claim about Margaret's medicines. The only use of "caused" is the app's own caveat: "a change
  in what was recorded, not what caused it". The hook reports what a published study attributed ("went on because
  the doctor was never told"), about patients in that study, not about anyone in the demo.
- It never calls a medicine safe, unsafe or dangerous, and gives no stop, start or change advice. The treatment
  question shown on screen is redirected to the doctor or pharmacist.
- Every count comes with its denominator ("9 of 14 answered days", "2 of 19", "57 of 57"), and the p-value is said
  together with its test.
- Findings are framed as questions for her doctor or pharmacist.
- It makes no FDA, HIPAA or clinical-validation claim. Both benchmark numbers are said to be on fictional or
  synthetic cases, the cascade is called "possible", as the finding on screen calls it, and the honesty shot says
  there are no dose or allergy checks. It says the knowledge base is not yet clinician-reviewed, that Kinwise is not
  medical advice, and lists the validation study as planned.
- It says what the on-device model does in the recording (rewrites wording and drafts a plainer answer, both checked
  by code) and that the medication review is deterministic code. It does not claim the checks are perfect: the
  verify shot shows whichever way the source check went, the honesty shot says the code check is not airtight, and
  in the recorded live run the checks let at least 6 flawed AI sentences (from 5 outputs) through (counted in
  `eval/results/verifier-redteam.json`, the same phrase `scripts/submission/facts.mjs` prints), which is why the model
  stays optional and labelled.

If you change a line, keep these rules, update this file, and re-run the script: its sync check catches a line that
differs from this file, and its on-screen checks catch numbers that no longer match the app.
