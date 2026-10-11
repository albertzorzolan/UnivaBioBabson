# MedWatch code audit (October 10, 2026)

Scope: `/Users/mb_pro/Desktop/UnivaBio Hackathon/prototype` (branch `codex/prototype-1-albert`, commit 30543d7) and the teammate's earlier app on `origin/main` (repo root `src/`, commit fc2c5d5 "Prototype V1"). This audit modified nothing in the repository, and `git status` was clean when the audit finished at about 18:05. At 18:07 another process created new untracked files at the repo root (`package.json`, `src/{ai,app,engine,kb,model,ui,views}`, `public/`, `eval/`, `docs/`) and changed `.gitignore`. Those changes are not part of this audit and were not reviewed. All outputs are in `scratchpad/research/`:

- `screens/*.png`: 53 screenshots (1440 px and 390 px, plus 1280x620 and 720x450 viewport checks)
- `screens/audit-log.json`: page metrics, axe results, tab order, console and network log
- `screens/brief-template-print.pdf`: print-media PDF of the template visit brief
- `audit-screens.mjs`, `probe/probe.ts`, `probe/scroll.mjs`: the scripts used (re-runnable)
- `audit-dist/`: production build output (the copied 845 MB model folder was deleted afterwards)

All facts in this document come from reading the code or running it. Clinical-content remarks about the teammate's risk table are marked **UNVERIFIED** because this audit did not check them against the AGS Beers Criteria 2023 text. The research workstream must do that check.

---

## 0. Executive summary (TL;DR)

1. **Engineering quality is high.** The data layer is strong: one versioned source document, revision-checked commits, a single-writer tab lock, null meaning "unknown", denominators that count only answered days, per-answer provenance with exact quote spans, correction history and corrupt-data recovery. Keep this foundation.
2. **The product value is thin, and judges will see it.** Today the app is a 7-field symptom diary plus a visit brief. The app has no medication knowledge (no Beers, interaction, anticholinergic or fall-risk logic). The one meaningful signal in the seed data (dizziness on 1/10 answered days before atorvastatin vs 4/12 after) is hidden at the bottom of the Medication list, behind a dropdown. It covers dizziness only and never reaches the visit brief.
3. **The AI is a weak point.** It is regex-gated, so the 845 MB LLM can only propose answers that pre- and post-regexes already found. Its summaries and briefs copy the deterministic fact sentences word for word (see `docs/model-evaluation.json`), with 15–22 s latency on an M1 Pro. It needs WebGPU plus a local 845 MB download, so judges can't try it from a link. Several validators are too strict (they reject "I slept badly last night. My sleep was 2 out of 5.") and others too lax (they accept "Atorvastatin is making her dizzy.").
4. **The visit brief is clinically thin.** It has 4 counts, a 3-column medication table (no start dates, indication or prescriber), one generic template question and the pinned notes. It has no medication review, no symptom-to-medication timeline and no FHIR export.
5. **The teammate's `origin/main` app has the missing product pieces.** It has a medication-risk rule engine (`flags.ts` + `riskTable.ts`), per-medication before/after analysis across 6 symptoms (`correlation.ts`), a much stronger seed story (lorazepam started 14 days ago), a one-page "doctor summary" layout, a day-grid symptom strip, hash routing, a live flag preview while adding a medication, and a large-target patient check-in. Its data layer is weak: no validation, no unknown values, and severity labels that sound like urgency. **Recommended merge:** use Albert's data, provenance and validation layer with the teammate's medication-review engine and summary structure, rebuilt on cited Beers 2023 content.
6. **There are concrete bugs to fix.** On short screens and at 200% zoom, the fixed sidebar clips "Need help now?" and "Sign out" so they can't be reached. The mobile top nav is not sticky (`inset: auto` cancels `top: 0`). Page changes keep the old scroll position. The browser Back button leaves the app. Settings text fails contrast (2.89–3.64:1). The patient sees third-person copy ("The rhythm of her days"). Correcting a medication's start date leaves the old start marker in place. Every patient-draft save is wiped by any commit.

---

## 1. Verification results

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` (vitest 3.2.4) | **20/20 passed** in 50 ms (`src/domain.test.ts`, the only test file) |
| Type check | `npx tsc -p tsconfig.json --noEmit` | **Passed, exit 0** |
| Unused-symbol check | `tsc --noEmit --noUnusedLocals --noUnusedParameters` | 23 unused imports (App.tsx: 13, e.g. `ArrowDownToLine`, `EMPTY`, `newDay`; ai.ts:3 `responseSchema`; Records.tsx, Settings.tsx, VisitBrief.tsx, Capture.tsx, test file). Cosmetic, but visible in the code PDF. |
| Production bundle | `npx vite build --outDir scratchpad/research/audit-dist` | **Built in 4.75 s.** Main chunk 688 kB (195 kB gzip). Lazy WebLLM chunk 6.05 MB and worker 6.04 MB. **`public/models` (845 MB) is copied into `dist/`**, so the build output was 886 MB. It can't be deployed as-is to GitHub Pages, Netlify or Vercel. |
| Note on `npm run build` | — | Not run on purpose: `prebuild` regenerates the tracked file `src/contracts/validators.ts` (126 KB, `@ts-nocheck`). Running the normal build changes a tracked file. |
| Browser run (dev server, Chrome headless, no model) | `audit-screens.mjs` | Every screen rendered for both roles. **0 page errors, 0 console errors, 0 third-party requests.** |
| axe WCAG 2.0/2.1/2.2 A/AA | `audit-screens.mjs` | Login, check-in, history, overview, daily records, medications and brief: 0 violations. **Settings: 22 `color-contrast` (serious) violations** (see UX-12). |
| Existing validation record | `docs/validation.md` | Claims 20 unit tests, 16 browser assertions, 9/9 model scenarios (1 repeat each), median generation 16.16 s (5.49–21.71 s), model init 6.14 s on an M1 Pro. The 40-case blueprint suite was not run. |

Local AI was not loaded during this audit, as instructed. Model behaviour comes from reading code and from `prototype/docs/model-evaluation.json`.

---

## 2. Architecture summary (current prototype)

### 2.1 Stack and size
- React 19.1.1, TypeScript 5.9.2, Vite 7.1.7, Recharts 3.2.1, lucide-react 0.468, Ajv 8.17 (precompiled), @mlc-ai/web-llm 0.2.85. Model: Qwen2.5-1.5B-Instruct q4f16_1, served from `public/models/resolve/qwen2.5-1.5b/`.
- Hand-written source is about 4,800 lines of TS/TSX, plus 3,478 lines of `style.css` (57 KB) and the 126 KB generated validator. `App.tsx` (931 lines) holds the login, shell, overview page and chart.
- There is no router. Page state is `useState<Page>` in `App.tsx:248`, so the URL never changes.
- `index.html:7` sets a strict CSP: `connect-src 'self' ws://127.0.0.1:5173`. This blocks any external API (openFDA, RxNav) and any CDN-hosted model. COOP/COEP headers are set only for the dev and preview servers (`vite.config.ts`).

### 2.2 Data model (`src/types.ts`)
- `Source` is **one JSON document** in `localStorage["medwatch.demo.source"]` with `schemaVersion`, `datasetId` (rotated on reset), `sourceRevision`, `days[]`, `revisions[]` (superseded Day versions), `medications[]`, `medicationEvents[]` and `notes[]`.
- `Day` holds one confirmed record per local date. Its `answers` have 7 fields: energy 1–5, dizziness bool, dizzinessSeverity 1–3, confusion ("Memory fog") bool, appetite better/same/worse, sleep 1–5 and fallsOrNearFalls bool. Each field may be `null`. A Day also stores `rawStory` (≤2,000 chars), per-field `answerProvenance` (`manual | ai_suggested | user_skipped | seed_fixture`, with `sourceSpans` {start, end, quote}), `confirmationMethod`, `timezone` and `recordRevision`.
- `Medication` has id, name, dose, schedule, reason (shown as "List note"), prescriber, startDate and endDate. It has **no indication semantics, drug class, RxNorm/ATC code, route, PRN flag or OTC flag**.
- `MedEvent` has kind `started | stopped | record_corrected | added_to_list`, a date and a label. It is append-only.
- `Note` has role, text, date and a `pinned` flag. A pinned note goes into the visit brief.
- Other keys: `medwatch.demo.session` (sessionStorage role) and `medwatch.demo.drafts` (patient check-in draft). `medwatch.demo.derived` and `.reports` are cleared but **never written** (dead code: `domain.ts:30-36, 447`; `App.tsx:340`; `Settings.tsx:278`).

### 2.3 Storage and integrity (`src/domain.ts`)
- `validSource` (37–126): structural checks. It runs the precompiled Ajv `validDay` on every day and revision, checks dates are real calendar dates, checks that provenance quotes equal `rawStory.slice`, and checks that dates and ids are unique.
- `sourceCommit` (402–450) does the following:
  - validates the next document
  - rejects stale writes by comparing datasetId and revision in storage
  - enforces role boundaries: only the patient changes days, only the caregiver changes medications, and each role edits only its own notes
  - bumps the revision, writes one key, then clears drafts
- The single-writer lock uses `navigator.locks` (`App.tsx:267-290`). A second tab becomes read-only, with a banner.
- Recovery: unreadable or invalid stored data renders `<Recovery>` (`Settings.tsx:296-346`). The user can download a recovery copy or reset, and the bad data is never silently overwritten.
- Seed (`domain.ts:195-297`): 25 days over the previous 28 (gaps on days 4, 12 and 19). Dizziness on days 2, 3, 7, 9, 15 and 23, a near-fall on day 9, and three medications: lisinopril (-90 d), metformin (-60 d) and atorvastatin (-17 d, the only "started" event). Two caregiver notes. Patient "Margaret Rivera, 72". Caregiver "Alex" is hard-coded.

### 2.4 Deterministic analytics
- `countField` counts answered and positive days. `factsFor` returns 4 facts: coverage (X of N calendar days), dizziness (positive of answered), average energy, and falls. Each fact carries `entryIds` for drill-down.
- `compareWindows` compares the 14 days before and after an event, excluding the start day. It needs ≥7 answered days per window. It computes `relativeChange` (unused anywhere in the UI). The UI only ever passes the default field, **dizziness**.
- On the current seed, the atorvastatin marker gives dizziness 1/10 before vs 4/12 after, confusion 0/10 vs 2/12, and falls 0/10 vs 1/12. The UI shows only the dizziness line (`probe/probe.ts` output).

### 2.5 AI pipeline (`src/ai.ts`, `ai.worker.ts`, `AIPanel.tsx`)
- **Loading:** `loadModel()` checks for a WebGPU adapter, checks the local manifest, spawns a dedicated module worker and runs `CreateWebWorkerMLCEngine`. Context window is 4,096 and the cache backend is IndexedDB.
- **Operations:**
  - `capture`: story to field proposals
  - `clarify`: pick fixed question IDs
  - `record_summary`
  - `record_qa`
  - `visit_brief`
  - `education`: hard-disabled
  - Role gates: capture and clarify are patient only; visit_brief is caregiver only.
- **Request flow:**
  - Evidence is a list of `{id, text}` built from facts, entries and notes.
  - The host hashes the request data (SHA-256) and puts an identity block (`requestId`, `sourceRevision`, `evidenceHash`) into the grammar as `const` values.
  - The response grammar is JSON Schema passed to WebLLM `response_format`. Quote spans are limited by enum to the story's sentence spans, so the model can only cite real sentences, which is a nice grounding trick.
  - Settings: temperature 0, 520–550 max tokens, 40 s timeout (the worker is terminated on timeout), one request in flight at a time.
- **Pre-filter:** `possibleFields` (`ai.ts:422-447`) uses regexes to decide which fields the model may propose. If none match, `maxItems` is 0.
- **Post-validation:**
  - Envelope check: Ajv `validEnvelope`, then identity echo, freshness (role in sessionStorage, source revision in localStorage) and a fingerprint.
  - `supportedProposal` (`ai.ts:216-268`): per-field regex support check plus a story-wide veto on words like "yesterday", "last night" or "sister".
  - `validateNarrative` (`ai.ts:269-296`): a banned-phrase regex (`PROHIBITED`), the evidence IDs must exist, and every number must appear somewhere in the linked evidence text.
  - `isClinicalRequest` (`ai.ts:209-213`): a regex that blocks record questions which look clinical.
- **Cancellation:** `cancelGeneration()` **terminates the worker** if a request is running, which forces a full model reload. It is called on every field click (`Capture.tsx:162`), every keystroke in the story box (`resetDraft`) and the record-question box (`Records.tsx:294`), on page unmount, and on any source revision change (`App.tsx:328-330`).
- **Output use:** results stay in memory only, and no AI output is saved without user confirmation or review.

### 2.6 Validation and test assets
- `contracts/ai-response.schema.json` and `symptom-record.schema.json` are compiled to `validators.ts` by `scripts/compile-validators.mjs` (no runtime `eval`, so it works under the strict CSP).
- `contracts/source-register.json` holds 10 reference links. The status is "reference_metadata_only_not_a_reviewed_clinical_library" and no clinical reviewer is listed.
- Scripts (all need the dev server on port 5173):

  | Script | What it checks |
  |---|---|
  | `browser-test.mjs` | 16 assertions on manual flows, roles, read-only tab, mobile overflow, reset and recovery |
  | `accessibility.mjs` | axe scan of 6 views |
  | `print-test.mjs` | Sample PDF and a 32-medication overflow |
  | `model-evaluation.mjs` | 9 cases |
  | `model-smoke.mjs` | Model smoke test |
  | `cancellation-test.mjs` | Cancelling a running request |
  | `record-demo.mjs` | Captioned demo video, **no audio** |
  | `download-model.mjs` | Pinned HF revision with a sha256 manifest |
  | `create-submission-pdfs.py` | ReportLab: one-page description and code PDF |

- Blueprint `release-policy.json` lists as **disabled**: `medication_causation`, `personalized_drug_interaction_risk`, `polypharmacy_risk_score`, `deprescribing_plan`, `openfda_lookup`, `remote_model_inference` and others. **The new product direction conflicts with this policy.** The policy, the blueprint docs (01, 04) and the `PROHIBITED` regex (which bans "interaction", "side effect" and "recommend") all need rewriting to fit a clinician-facing, citation-backed medication-review aid.

---

## 3. What works well (keep)

1. **Null is not false.** Every field can be "Not recorded". Denominators count only answered days and the UI shows them ("5 of 12 answered days"). This is good scientific practice and rare in hackathon entries.
2. **Provenance and correction history.** Each answer records how it was entered and the exact quote that supports it. Corrections keep earlier versions, and the Evidence dialog shows version history (`w1440-15-patient-day-evidence.png`).
3. **Evidence drill-down.** Every count opens the list of contributing days (`w1440-16-patient-fact-evidence.png`). This "show your work" pattern is exactly what the Health Impact & Rigor judges reward.
4. **Robust local persistence:** revision-checked commits, stale-write rejection, role boundaries enforced outside the UI, a single-writer lock, a recovery screen, an empty state that survives reload, and a dataset-ID rotation that makes old AI drafts invalid.
5. **Safe AI plumbing:** the worker is isolated, the grammar is constrained with identity echo, quote spans are limited by enum, freshness is checked, and no unreviewed AI text reaches the brief. The CSP blocks third-party traffic, and the network log confirmed zero external requests.
6. **Print guard:** an unreviewed brief prints as a single "please review" line (`print-guard.css`), and any edit unchecks "reviewed" (`VisitBrief.tsx:283, 315`).
7. **Visual polish:** a calm sage palette, a serif display face and a professional login page (`w1440-01-login.png`). The brief layout prints cleanly (`w1440-39-caregiver-brief-print-media.png`).
8. **Honest documentation:** `docs/validation.md` clearly separates what was tested from what was not. The Presentation criterion rewards this.
9. **Test infrastructure** already exists: Vitest, Playwright, axe and a print test. It should be extended, not rebuilt.

---

## 4. Bugs found (with file:line)

Severity: **H** = visible in a demo or wrong output; **M** = data or UX correctness; **L** = minor or cosmetic.

### 4.1 Layout, navigation and accessibility
| # | Sev | Location | Bug | Evidence |
|---|---|---|---|---|
| B1 | H | `style.css:236-246` | `.sidebar` is `position: fixed; inset: 0 auto 0 0` with **no `overflow-y`**. When the viewport is shorter than about 730 px, the bottom block ("Made for your device", **"Need help now?"**, **"Sign out"**) is cut off and can't be reached. Measured: sidebar content height 726 px vs viewport 620 px at 1280x620, and 723 vs 450 at 720x450 (200% zoom). The emergency-help entry point disappears, which fails WCAG 1.4.10 Reflow. | `w1280x620-50-caregiver-overview-viewport.png`, `w720-51-caregiver-overview-200pct-zoom-viewport.png`, `audit-log.json` metrics |
| B2 | M | `style.css:1482-1484` | In the ≤700 px media query, `position: sticky; top: 0;` is followed by `inset: auto;`, which resets `top` to `auto`. **The mobile top nav never sticks.** Measured sidebar `top = -1200` after scrolling 1,200 px. | `w390-61-scrolled-nav-not-sticky-viewport.png` |
| B3 | M | `App.tsx:248, 351-355, 396` | Navigation doesn't reset scroll. After scrolling Daily records and clicking "Medication list", scrollY stays at 460 and the H1 is off-screen (top = -288). Login also keeps the login page's scroll position: 307 px on mobile, so the app opens mid-page. | `w1440-60-nav-keeps-scroll-viewport.png`, `w1280x620-50-…` (heading cut off) |
| B4 | M | `App.tsx` (no router) | The browser **Back button leaves the app** (to `about:blank` in the test). Reload always returns to the role's default page. Pages can't be deep-linked, for example in a demo video. | `probe/scroll.mjs` output |
| B5 | M | `style.css:2768, 2785, 2806` | Settings body text `#7c8f68` on white is 3.51:1, `dt` `#8c9e76` is 2.89:1, and `#778d62` is 3.64:1. All fail AA 4.5:1. axe reports 22 nodes. | `w1440-20-patient-settings.png`, `audit-log.json` |
| B6 | L | `Capture.tsx:66-81` | With an empty value, the "Not sure / skip" button matches `v === value` (both null), so it renders **selected** (`aria-pressed=true`, green) on all 6 fields by default. It reads as if the user had already answered "Not sure" everywhere, and screen readers announce "pressed". | `w1440-10-patient-checkin.png` |
| B7 | L | `App.tsx:831` | The chart title "The rhythm of her days" also appears in the **patient's** own My history. | `w1440-17-patient-question-typed.png` |
| B8 | L | `VisitBrief.tsx:173-175` | Grammar: "All 1 pinned concern is included…". | `w1440-38-caregiver-brief-template.png` |
| B9 | L | `App.tsx:376-389` | The "Margaret's space" button has a ChevronDown icon but no menu; it only navigates home. This is a false affordance. | all desktop screens |
| B10 | L | `App.tsx:572` + `domain.ts:348` | "2.8 / 5" is followed by "out of 5 · 12 answered days", so "/5" appears twice. | `w1440-30-caregiver-overview.png` |
| B11 | L | `App.tsx:792` | A stray `{" "}` text node is rendered between the dialogs. | — |
| B12 | L | top-bar icons ≤700 px | Settings, help and sign-out tap targets are 30x32 px. That passes the WCAG 2.2 minimum of 24 px, but it's small for older adults. Mobile nav labels are 10 px (`style.css`, `.sidebar nav button { font-size: 10px }`). | `probe/scroll.mjs` output |
| B13 | L | Full-page screenshots | The fixed sidebar draws only in the first viewport, or at the current scroll offset, in full-page captures. The **README hero image `prototype/docs/screenshots/overview.png` shows the sidebar ending at about 1,050 px with a grey void below.** In a live browser at 1440x900 the sidebar is fine. This is what makes the sidebar "appear at the wrong vertical position on long pages", and the submission assets show it. | `w1440-35-caregiver-med-comparison.png` (sidebar drawn starting at y≈660), `w1440-10-…`, `docs/screenshots/overview.png` |

### 4.2 Data and logic
| # | Sev | Location | Bug |
|---|---|---|---|
| B14 | M | `domain.ts:447-448` | `sourceCommit` deletes `KEYS.drafts` on **every** commit by any role. A patient's half-typed check-in draft is erased whenever anyone pins a note or edits a medication in that browser. Verified in `probe/probe.ts`. |
| B15 | M | `Medicines.tsx:268-289` | Medication events are append-only. When a caregiver corrects `startDate` (kind `record_corrected`), the original `started` event keeps the **old date**. The chart marker and the before/after comparison then use the wrong date. |
| B16 | M | `Medicines.tsx:42, 81, 212-213`; `App.tsx:877-883` | A newly added medication defaults to kind `added_to_list`. Only `started` events become chart markers or comparison options, so new medications never show up in any timeline analysis unless the user picks the obscure option "Recording a start that already happened". `stopped` events are never charted either. |
| B17 | M | `Medicines.tsx:65` | The comparison is hard-coded to dizziness (`compareWindows(before, after)` uses the default field). Confusion, falls, energy and sleep are ignored even though the seed shows confusion 0/10→2/12 and falls 0/10→1/12. `relativeChange` is computed but never shown. |
| B18 | M | `VisitBrief.tsx:49-57` | The AI visit-brief evidence contains only the 4 facts and up to 4 pinned notes. **No medications, medication events or comparisons are passed in**, so the brief can never mention timing around a medication change, which is the product's key value. |
| B19 | M | `VisitBrief.tsx:75-88` | Template mode produces 0 observations and one generic question: "What other details would be useful to record before our next visit?" A clinician gets nothing actionable from this. |
| B20 | L | `VisitBrief.tsx:189-190`, `App.tsx:499`, `Capture.tsx:274` | Patient name, age, caregiver name ("Alex") and the patient's first name are hard-coded. There is no profile. |
| B21 | L | `Evidence.tsx:60` | Drilling from a fact into a day replaces the dialog content and **offers no "Back to list"**, so the user has to close and reopen. |
| B22 | L | `Evidence.tsx:125-170` | "Delete this day" stays available while an earlier version is shown, and it deletes the current record. |
| B23 | L | `Capture.tsx:113-125` | A restored draft brings back answers but not their AI provenance. Origins come from the saved day or are rebuilt as `manual`. After a reload, AI-suggested answers are saved as `manual`, `savedByAI` resets to false, and `confirmationMethod` is wrong. |
| B24 | L | `App.tsx:291-303` | The cross-tab `storage` listener applies another tab's source **without calling `validSource`**. |
| B25 | L | `Records.tsx:112-116` | Any source revision change, including just pinning a note, clears the AI summary or answer currently on screen. |
| B26 | L | `Records.tsx:427-431` | Notes are listed in reverse insertion order, not by date. A note recorded later for an earlier date appears in the wrong place. |
| B27 | L | `App.tsx:554` | Overview shows only `facts.slice(0, 3)`, so falls and near-falls never appear on the caregiver overview. |

### 4.3 AI-specific (from `probe/probe.ts`; `true` means the proposal is accepted)
| # | Sev | Location | Bug |
|---|---|---|---|
| B28 | H | `ai.ts:225-229` | A **story-wide veto**: if the story contains anywhere `yesterday`, `last night`, `last week`, `sister`, `brother`, `mother`, `father`, `husband`, `wife`, `not myself` or `cannot remember which`, every proposal for that story is rejected. "I slept badly last night. My sleep was 2 out of 5." → sleep rejected. "My sister visited. I felt dizzy this afternoon." → dizziness rejected. "Last night" is the natural way to describe sleep. |
| B29 | H | `ai.ts:235` | Negation is checked by token presence in the whole sentence. "I felt dizzy and had no appetite." → dizziness=true rejected. |
| B30 | M | `ai.ts:236-266`, `422-447` | The vocabulary is very narrow, and these were all rejected or never offered: "wobbly", "foggy and forgetful", "appetite was poor", "didn't feel like eating", "two out of five", and any energy or sleep description without an explicit "N out of 5". In practice, capture works only for sentences that look like the placeholder text. |
| B31 | M | `ai.ts:209-213` | `isClinicalRequest` blocks harmless record questions such as "When did I start atorvastatin?", "How was my sleep since starting atorvastatin?", "Why are there gaps in my records?" and "Which days did I stop recording?". It matches any word starting with `start`, `stop`, `why`, `heart` or `risk`. |
| B32 | M | `ai.ts:215, 274-293` | `PROHIBITED` misses causal phrasing. "Atorvastatin is making her dizzy." and "Dizziness was more frequent after atorvastatin started." both pass `validateNarrative`. The number check only asks whether the number appears anywhere in the linked evidence, so "Dizziness on 1 of 25 days" passes when the evidence says "7 of 25 days with 1 fall". |
| B33 | M | `ai.ts:138-155` + callers | Cancelling a running request terminates the worker. Clicking any form choice, typing in the story box or the question box, navigating, or any commit while a draft is running unloads the model. The next request needs a full reload (6 s+). |
| B34 | L | `ai.ts:560-563` | Duplicate `publish({status:"generating"})`. `ai.ts:3` imports `responseSchema`, which is unused. |
| B35 | L | `Settings.tsx:111, 122`; `ai.ts:85, 93` | User-facing copy says "served from this Mac" and "Use current Chrome on this Mac". That is wrong on any other device or a hosted site. |

### 4.4 Build, repo and docs
| # | Sev | Location | Issue |
|---|---|---|---|
| B36 | H | `public/models` + `vite build` | The 845 MB of model weights are bundled into `dist/`. No static host will take that, so there is **no hosted interactive prototype**, and judges must clone, run `npm ci` and download 845 MB to try the AI. |
| B37 | M | `index.html:7` | The CSP `connect-src 'self' ws://127.0.0.1:5173` hard-codes the dev websocket. It forbids CDN model loading and any optional API. It must be revised for whatever hosting is chosen. |
| B38 | M | `prototype/README.md:8`; root `README.md:15` | Stale paths: `/Users/mb_pro/Documents/ChatGPT/...` and `UnivaBioBabson/prototypes/Prototype-1-Albert/prototype`. On this branch the app lives at `prototype/`. |
| B39 | M | git | On this branch, compared with `origin/main`, the teammate's app is deleted from the repo root (`git diff --stat origin/main HEAD`: 134 files, −7,296 lines). Merging as-is would wipe the teammate's code. |
| B40 | L | `package.json` `prebuild` | `npm run build` rewrites the tracked file `src/contracts/validators.ts`. |
| B41 | L | git | Binaries are committed: the zip (4.4 MB), webm (9.4 MB), mp4 (3.5 MB) and PDFs. The demo video **has no audio** (`docs/demo-recording.json`: `audio:false`). |

---

## 5. UX and design issues (with screenshots)

| # | Issue | Screens |
|---|---|---|
| UX-1 | **The core insight is buried.** The only medication-related signal (atorvastatin start → dizziness 1/10 → 4/12) sits at the bottom of Medication list, behind a "Choose a start marker" dropdown. The Overview and the Brief don't show it. | `w1440-35-caregiver-med-comparison.png`, `w1440-30-caregiver-overview.png` |
| UX-2 | **The Overview spends its best space on marketing copy.** A large green hero ("Small observations. More meaningful conversations.") plus an "Assisted, not assumed" teaser take up the fold. There is no "needs attention" area, no medication flags and no change summary. The teammate's overview ("Needs attention" + "What the check-ins show") is far more useful. | `w1440-30-…`, `w390-30-…` |
| UX-3 | **Daily records is a 25-row wall** (4,339 px desktop, 6,074 px mobile; patient view 5,559 px). Each row shows only energy and dizziness, so confusion, falls, sleep and appetite are hidden until a row is opened. Notes and visit concerns sit under the whole list. A day-grid strip (teammate's `EventStrip`) or a heatmap would show all symptoms at once. | `w1440-32-…`, `w1440-14-…` |
| UX-4 | **The chart leaves out the key symptom.** "The rhythm of her days" plots only energy and sleep. Dizziness, falls and confusion aren't plotted. The medication marker says "List change" instead of "Atorvastatin started", and it shows only when the start date falls inside the window (it's absent on the 14-day overview). | `w1440-30-…`, `w1440-17-…` |
| UX-5 | **The AI looks broken until a large download finishes.** "Suggest answers from my story", "Help me fill a gap", "Summarize this period", "Ask" and "Draft with local AI" are all greyed out with no reason until "Load local AI" is clicked. On a judge's machine without the model files, loading fails ("Local model files are missing. Run npm run model:download"). A tooltip, or a deterministic path that always works, is needed. | `w1440-10-…`, `w1440-37-…` |
| UX-6 | **Too many disclaimers.** The source contains 25 uses of "fictional" and 17 more hedging phrases. Every page repeats the "Fictional demo" badge, the banner and the footer ("No continuous monitoring"). There are page-level notices plus per-section limitations, and the Medication page alone has 3 ("not prescribing advice", "does not confirm a dose", "Timing alone does not establish…"). A rough regex count found 28 hedging phrases on Daily records. Judges will read this as a lack of confidence. Use **one** clear scope statement and inline "how this was calculated" links. | all |
| UX-7 | **Jargon and system language** for older adults and caregivers: "Recorded list changes", "What does this edit represent? → Correcting the list, no regimen change / Adding an already existing medicine to the list", "Source revision", "Confirmation method", "user skipped", "seed fixture", "Dataset". | `w1440-36-caregiver-add-med-modal.png`, `w1440-15-…`, `w1440-20-…` |
| UX-8 | **Adding a medication** is a free-text name with no autocomplete or normalization. "List note" stands in for indication. Prescriber is free text. There's no PRN/OTC flag and no warning about duplicates or interactions. The teammate's form shows "new flags this medicine would create" live, a strong "wow" moment that is missing here. | `w1440-36-…` |
| UX-9 | **Medication cards don't scale for polypharmacy.** One card is about 470 px tall. A real list of 8–12 medications would fill several screens. A dense table (as in the teammate's version) works better for caregivers and pharmacists. | `w1440-34-…` |
| UX-10 | **The visit brief gives a clinician little to use:** no start dates, indications or prescribers in the medication table, no medication-review findings, no timeline, a single meaningless template question, and half a printed page of whitespace. On mobile, the "I reviewed…" checkbox and Print button come **before** the report itself, so users confirm a review before they see the content. | `w1440-38-…`, `w1440-39-…`, `w390-38-…` |
| UX-11 | **Clarifications are passive.** AI-selected follow-up questions appear as plain text with "Use the date and answer controls below". The user can't answer them in place. | `Capture.tsx:396-410` |
| UX-12 | **Low-contrast, small type for an older audience.** There are 146 CSS declarations with 9–12 px font sizes, including 9 px eyebrows ("YOUR SPACE", "A MOMENT FOR YOURSELF"), 10 px mobile nav labels and 11–12 px meta text. Settings fails contrast (B5). The teammate's patient UI uses 34 px icons, labelled choices ("Very tired… Great") and large type, which is better for older adults. | `w1440-10-…`, `w390-10-…` |
| UX-13 | **Check-in numbers have no labels.** The 1–5 buttons for energy and sleep carry no wording ("1 = low · 5 = high" sits in small text). Compare the teammate's icon and word scale. | `w1440-10-…` |
| UX-14 | **Login takes two clicks per demo role.** The user selects the "Patient demo" row and then presses "Enter your space". A one-click "Enter as patient / caregiver" would help judges. | `w1440-01-login.png` |
| UX-15 | **Toasts last 6.5 s and float over content.** The "Your check-in is saved" toast covers the question input on the next page. | `w1440-17-…`, `w1440-20-…` |
| UX-16 | **Dead-end and "coming soon" elements:** the "Wearable sync · coming soon" badge inside Demo controls, three external links to FDA/911 pages in Settings, and "AI education · awaiting content review". These read as unfinished. | `w1440-20-…` |
| UX-17 | **The patient can't make or see a brief**, and the caregiver can't pin a patient's concern. The caregiver role can't record a symptom on the patient's behalf (a common real-world case with cognitive impairment), and the patient can't edit their own medication list (common for independent older adults). These role rules come from the blueprint, not from user needs. | `Records.tsx:448`, `domain.ts:423-435` |
| UX-18 | **No skip link and no URL-based navigation.** Keyboard focus starts in the sidebar, then goes to the banner link, then the content. Combined with B4, there are no shareable states. | `audit-log.json` tab order |
| UX-19 | **The mobile overview stat cards are cramped** (3 columns at 390 px, with wrapped detail text). The mobile header combines a 4-tab nav, breadcrumb, icon row and banner, which pushes content down about 200 px. | `w390-30-…` |

---

## 6. Technical debt

1. **`App.tsx` is a 931-line god component.** It contains the login, shell, overview page, `Trend` chart and both evidence dialogs. Features import `Trend` through props (`Records.tsx:88`).
2. **`style.css` is 3,478 lines and one global namespace.** Tokens are defined twice (`--muted` at lines 15 and 1796), there are repeated media-query blocks (`max-width: 1180px` at lines 1391 and 2896; `970px` at 1441 and 2939; `700px` at 1478 and 2985), and many one-off colours are hard-coded instead of using tokens.
3. **Generated validators** (126 KB, `@ts-nocheck`) are committed and regenerated in `prebuild`. They are large for two schemas and show up in the code PDF.
4. **Dead or unused code:** the `derived` and `reports` keys, `relativeChange`, 23 unused imports, `webmcp.ts` (feature-detected, never available in the tested browser, with no visible value for judges) and the `education` operation (always throws).
5. **The AI layer is tied to one model and a local file layout** (`/models/resolve/qwen2.5-1.5b/`). There is no adapter for a smaller model or a CDN, and no deterministic fallback for capture.
6. **Regex-heavy safety and NLP** (`supportedProposal`, `isClinicalRequest`, `PROHIBITED`) can't be tested against a realistic corpus. There is no test corpus beyond 9 hand cases and about 10 unit examples.
7. **No routing, profile or settings model.** Names are hard-coded.
8. **No schema migration path.** Only `"1.0"` is accepted. Any data-model change for the medication-review direction makes stored data unreadable and sends the user to the Recovery screen. A migration step is needed.
9. **The blueprint, release policy and docs contradict the new direction.** They explicitly disable medication-risk functions. The validation docs and PDFs describe the old product.

---

## 7. Teammate's `origin/main` version: what to reuse

Stack: React 19.2, Vite ^8.3, TS ~6.0, lucide ^1.48 and Recharts ^3.10, with hash routing, a context store and per-key localStorage (`mw.*`). About 3,550 lines of TS/TSX plus 1,755 lines of CSS. It has no AI and no tests.

| Module | What it does | Verdict |
|---|---|---|
| `src/data/riskTable.ts` | 31 drug-group entries: generic and brand names, classes (`benzo`, `z-drug`, `anticholinergic`, `opioid`, `gabapentinoid`, `nsaid`, `anticoagulant`, `antiplatelet`, `raas`, `diuretic`, `bp-lowering`, `cns`, `antidepressant`, …), plain-language concern, "ask the doctor" question, optional `minDays` (PPI >56 days). Matching is a normalized substring match (`matchRiskEntries`). | **KEEP the structure; REWRITE the content** against AGS Beers 2023 with per-rule citations and a recommendation category (Avoid / Use with caution / Avoid in specific condition / DDI / Renal). The data model needs a strength or quality-of-evidence field and an indication-aware exception. Content issues to verify (**UNVERIFIED**): sulfonylureas and warfarin carry only "next-visit"/"monitor" labels where the 2023 Beers recommendations may be stronger; DOACs (rivaroxaban, dabigatran) have no single-drug entry; clonidine sits only in "other-bp"; `metoclopramide` and `promethazine` are tagged `cns`, but the Beers CNS-active combination list may differ; "bayer" as a brand token is ambiguous. |
| `src/lib/flags.ts` | A deterministic engine. (1) Single-drug flags, (2) duplicates within a group, (3) combination rules: opioid+sedative, opioid+gabapentinoid, ≥3 CNS-active, ≥2 anticholinergic, NSAID+anticoagulant/antiplatelet, "triple whammy" NSAID+RAAS+diuretic, antidepressant+anticoagulant, ≥3 BP-lowering, (4) polypharmacy ≥5. Flag IDs are stable (`ruleId:medIds`) and flags are sorted by severity. | **KEEP the engine pattern** (pure, testable, explainable, stable IDs, so review state persists). **FIX:** replace the severity labels "Discuss soon / next visit / worth monitoring", which read as urgency triage and the blueprint flagged as a regulatory concern, with source-based categories (for example "Beers 2023: Avoid", "Use with caution"), each with a citation. Mark which rules are Beers and which come from elsewhere (the triple whammy is not a Beers rule, **UNVERIFIED**). Add an anticholinergic burden score (ACB scale), fall-risk-increasing drugs (STEADI/FRIDs) and prescribing-cascade patterns. Unit-test every rule. |
| `src/lib/correlation.ts` | For each medication, compares 14 days before and after its start across **6 metrics** (dizziness, confusion, falls, worse appetite as rates; energy and sleep as averages). Statuses are `too-early` (<7 days on the drug), `insufficient` (<5 logs per window) and `future`. It **names overlapping medication starts** ("can't be attributed to one medicine alone") and has a `weekTrends` function for the patient. | **KEEP, but adapt** to Albert's nullable answers (count answered days only, show denominators). Exclude the start day as Albert does (the teammate counts it in the after window). Handle stop dates and de-challenge. Show absolute percentage-point differences. Use descriptive wording only ("was recorded on 1 of 10 answered days before vs 4 of 12 after"), not "increased since starting". The arbitrary thresholds (0.2 rate, 0.75 average) should be documented as display rules. |
| `src/lib/seed.ts` | Margaret, 78, with lisinopril, omeprazole (-62 d, so the PPI >8 weeks rule fires), metformin and **lorazepam 0.5 mg at bedtime started -14 d** (a Beers benzodiazepine). Dizziness, confusion and low energy rise after the start. A 27-day patterned dataset. | **ADAPT.** It's a far stronger demo story than atorvastatin. Extend it to realistic polypharmacy (8–10 medications including OTC diphenhydramine "PM", oxybutynin and a prescribing cascade) and add realistic missing days and nulls. |
| `src/caregiver/Summary.tsx` | A one-page "Doctor-visit summary": medication table with dose, schedule, **indication, start date and prescriber**; medication concerns with explanations; a last-14 vs prior-14 symptom table; changes around start dates; numbered questions to ask; "Notes from the visit" lines; a print button. | **PORT the structure** into the new brief, then add Albert's review gate, evidence links, citations, patient quotes and limitations. **FIX** the auto-generated "Could X be contributing to…" questions so they stay neutral and cited. |
| `src/caregiver/Symptoms.tsx` (`EventStrip`) | A day-by-day grid for confusion, falls and worse appetite with "no check-in" cells, medication-start columns, and labels that don't depend on colour. It also has a full log table and per-medication `AnalysisCard`s. | **PORT** the EventStrip and AnalysisCard. They solve UX-3 and UX-4. |
| `src/caregiver/charts.tsx`, `chartData.ts` | Energy and sleep lines plus a dizziness-severity bar chart. Medication markers are labelled "**Lorazepam started**". A custom tooltip shows "No check-in". The palette was checked for CVD and contrast. | **PORT, with a fix:** `connectNulls` is on (`charts.tsx`, both `Line`s), so lines are drawn across missing days and hide gaps. Set it to false, as Albert does. |
| `src/caregiver/Medications.tsx` | A medication table with group labels per medication, the top flag severity per medication, an "FDA label" panel and edit/delete. **The MedForm shows a live preview of the new flags the medication would create before saving.** | **PORT the live flag preview and the table layout.** This is the best "AI/automation for health" demo moment available. |
| `src/caregiver/FlagsPage.tsx`, `shared.tsx` (`FlagCard`) | Flags grouped by severity, with Acknowledge, Dismiss and Reopen, status filters and related symptom changes on each flag. | **PORT** the review workflow (pharmacist-style "addressed / not applicable" with a reason). Rename the severities as above. |
| `src/patient/CheckIn.tsx` | Six large-target radio groups with icons and word labels, a dizziness-severity follow-up, "N of 6 answered" progress and a gentle fall follow-up message. | **PORT the interaction design**, but keep Albert's "Not sure / skip" so answers can be null, and keep the story-capture box. The teammate requires all 6 answers. |
| `src/patient/HowAmIDoing.tsx` | Week-over-week plain-language cards ("You've felt dizzy more often this week", "Worth mentioning"). | **OPTIONAL PORT** as a patient "This week" view. Copy must avoid giving reassurance. |
| `src/patient/PatientMeds.tsx` | Large readable medication cards with "What it's for" and "When". | **PORT** for the patient medication view. |
| `src/lib/router.ts` | A minimal hash router with scroll-to-top on change. | **PORT.** It fixes B3 and B4. |
| `src/store.tsx` | React context, memoized `flags` and `analyses`, persistence per key and cross-tab sync. | **DON'T port the storage approach.** It has no validation, no revisions and no unknown values, and `load()` just casts parsed JSON. Use Albert's `Source` and `sourceCommit`, and port only the derived-selector idea (memoized flags and analyses). |
| `src/lib/openfda.ts` | An optional live label lookup that sends only the drug name, with a cache. | **DROP or make opt-in.** It breaks "no network" privacy and needs a CSP change. Label text is long and generic. Prefer a bundled, cited rule dataset. If kept, show it as "Official label (opens FDA site)". |
| `src/components/common.tsx` `TrackerPlaceholder` | A disabled "Connect a health tracker · Coming soon" card. | **DROP.** It's another unfinished-looking element. |
| `src/lib/auth.ts` | Hard-coded demo users, with the session stored in localStorage (it survives a browser restart). | Albert's sessionStorage version is fine. Either works for a demo. |

---

## 8. KEEP / FIX / REWRITE per module (current prototype)

| Module | Verdict | Rationale and action |
|---|---|---|
| `src/types.ts` | **REWRITE / extend** | New model needed: medications with an `indication`, normalized `ingredient`/code, `classes`, `route`, `prn`, `otc`, `status` and start/stop events; a richer symptom set (add e.g. drowsiness, constipation, dry mouth, falls split into fall and near-fall, low mood); `Profile` (name, age, conditions or eGFR range if used); `FlagReview`; a `BriefSnapshot`. Bump `schemaVersion` and add a migration from 1.0. |
| `src/domain.ts` | **KEEP core, FIX** | Keep `localDate`/`shiftDate`, `countField`, the `factsFor` and evidence-ID pattern, `sourceCommit` (revision, stale write, role guard) and `validSource`. Fix B14 (clear only the drafts of the role that committed, or none), generalize `compareWindows` to all fields with absolute differences, remove dead keys, and replace the seed. |
| `src/contracts/*`, `scripts/compile-validators.mjs` | **KEEP approach, regenerate** | Precompiled Ajv works under the strict CSP. Add schemas for the new entities. Drop the AI envelope schema if the LLM is reduced to optional. Stop `prebuild` from rewriting a tracked file, or accept it consciously. |
| `src/ai.ts` | **REWRITE** | Keep the worker isolation, grammar-constrained JSON, `const` identity, quote-span enum, freshness and fingerprint checks, and the timeout. Replace regex capture with a **deterministic on-device clinical NLP pipeline**: a symptom lexicon with synonyms, NegEx-style negation scope, temporal cues ("last night", "yesterday", "since Tuesday") mapped to dates, and experiencer detection ("my sister"). Make the LLM an **optional enhancer** whose proposals must agree with the deterministic extractor or be shown as low-confidence. Narrow `isClinicalRequest` and strengthen causal-claim detection (B28–B33). Stop terminating the worker on every keystroke (B33). |
| `src/ai.worker.ts` | **KEEP** | 3 lines, correct. |
| `src/AIPanel.tsx` | **FIX** | Explain why buttons are disabled. Check device capability first (WebGPU, memory). Show "AI optional" so the deterministic path is always the primary demo. Fix the "this Mac" copy. |
| `src/App.tsx` | **REWRITE the shell; KEEP Login** | Split into `Shell`, `Overview` and `charts/Trend`. Add a hash router with scroll reset (B3, B4), a profile instead of hard-coded names, and a scrollable sidebar (B1). Replace the hero with "Needs attention" (medication-review flags plus symptom changes around medication starts) and a symptom×day strip. Keep the Login design (it's attractive) but add one-click demo entry. |
| `src/Capture.tsx` | **FIX (substantial)** | Keep the story box, quote-backed proposals, select-to-apply, the review-and-confirm modal and correction history. Fix B6 (no default selection), B23 and passive clarifications (UX-11). Adopt the teammate's large icon/word scales. Add more symptoms. Run capture deterministically on every story, with no model required. |
| `src/Records.tsx` | **FIX** | Keep the range toolbar, facts strip with "View evidence", notes and concerns with pinning. Replace the 25-row list with the teammate's EventStrip or a heatmap plus an expandable table (UX-3). Move notes above the log. Replace the regex question router with deterministic query templates (answers computed by code, optionally phrased by the LLM). Fix B25 and B26. |
| `src/Evidence.tsx` | **KEEP + FIX** | The provenance dialog is a differentiator. Add a "Back to list" (B21), hide Delete on old versions (B22), and add a medication-event evidence view ("why was this flag raised: rule, source, citation"). |
| `src/Medicines.tsx` | **REWRITE** | A table layout. Autocomplete from a bundled generic/brand dictionary that maps to classes. Required indication. Start and stop as explicit actions that keep events in sync (B15, B16). Per-medication flags and a live flag preview (teammate). A per-medication before/after analysis for all symptoms (teammate's `correlation.ts` with Albert's null-aware counts, B17). |
| `src/VisitBrief.tsx` | **REWRITE content; KEEP review gate and print** | New sections: (1) patient header (name, age, prepared by, period); (2) medication list with indication, start date, prescriber and OTC/PRN; (3) **medication review findings** (each one cited: Beers 2023 category, DDI, anticholinergic burden score, fall-risk drugs, possible prescribing cascade), each with Acknowledged/Not applicable status; (4) **symptom timeline relative to medication changes** (counts and denominators, overlapping changes named, no causal claims); (5) the patient's own words (quotes); (6) caregiver concerns; (7) neutral questions for the clinician or pharmacist; (8) method and limitations, kept short. Keep the "I reviewed" guard and the print CSS. Add an **optional FHIR R4 Bundle export** (MedicationStatement + Observation + DetectedIssue) for the EHR-vendor judge. Fix B8, B18, B19 and B20. |
| `src/Settings.tsx` | **FIX** | Keep export, reset, clear and model controls. Fix contrast (B5). Remove "Wearable · coming soon" and "awaiting content review" (UX-16) and the Mac-specific copy. Add profile fields and JSON import. Add an "About the rules" page listing every rule source (citations) — better value than the 3 FDA/911 links. |
| `src/ui.tsx` | **KEEP** | The native `<dialog>` modal, Button and Badge are fine. |
| `src/webmcp.ts` | **DROP** (or keep, hidden) | It has no visible value for judges and adds explanation burden. |
| `src/print-guard.css` | **KEEP** | Small and effective. |
| `src/style.css` | **FIX / refactor** | Fix B1, B2 and B5. Deduplicate tokens and media queries. Raise the minimum text size to 14 px for patient views and 13 px for meta. Consider per-feature CSS files. |
| `src/domain.test.ts` | **KEEP + extend** | Add tests for every medication rule (positive and negative), the NLP extractor (negation, time, experiencer, synonyms) with a corpus of 60–100 sentences, the timeline analysis, the FHIR export shape and migrations. |
| `scripts/browser-test.mjs`, `accessibility.mjs`, `print-test.mjs` | **KEEP, update selectors** | Add short-viewport and 200% zoom checks (B1), a sticky-nav check (B2) and a back-button check (B4). |
| `scripts/model-evaluation.mjs`, `model-smoke.mjs`, `cancellation-test.mjs`, `download-model.mjs` | **KEEP only if the LLM stays** | Expand the evaluation to a held-out sentence set, scoring precision and recall versus the deterministic extractor. |
| `scripts/record-demo.mjs` | **KEEP** | Useful for a reproducible demo video. Add a voice-over afterwards (the current video is silent). |
| `scripts/create-submission-pdfs.py` | **KEEP, update content** | Regenerate the one-pager and code PDF for the new product. Excluding `validators.ts` from the code PDF would make it more readable. |
| `blueprint/`, `release-policy.json`, `docs/validation.md`, READMEs | **REWRITE** | They describe the old scope and explicitly disable the new features. Fix stale paths (B38). Decide how to handle the teammate's code on `main` (B39). |

---

## 9. Screens: inventory and purpose

Roles come from fixed credentials: patient `babson/babson`, caregiver `babson1/babson1`. Each screen was captured at 1440 px and 390 px (`screens/w1440-*`, `screens/w390-*`).

| # | Screen | Role | What it does | Screenshot(s) |
|---|---|---|---|---|
| 1 | **Login** | — | Split layout: brand story and sample quote card on the left; on the right, username and password plus "Patient demo" / "Caregiver demo" rows that prefill credentials; a fictional-data notice. Wrong credentials show an inline alert. | `w1440-01-login.png`, `w1440-02-login-error.png`, `w390-01-login.png` |
| 2 | **My check-in** | Patient (landing) | Date picker; "In your own words" story box (≤2,000 chars); "Suggest answers from my story" (needs the AI); proposals with quotes and checkboxes; "Help me fill a gap" (AI clarifications); a 7-field form (energy and sleep 1–5, dizziness with conditional severity, memory fog, appetite, falls/near-falls, each with "Not sure / skip"); "Review & save" opens a confirmation modal. Re-entering an existing date creates a correction. | `w1440-10-…`, `w1440-12-…`, `w1440-13-patient-review-modal.png`, `w390-10-…` |
| 3 | **My history** / **Daily records** | Patient / Caregiver | From–to range and 7/14/28-day presets; 4 fact tiles (coverage, dizziness, average energy, falls) each with "View evidence"; energy and sleep chart with a "List change" marker; an AI panel (summarize period, ask a record question, 3 sample chips); a check-in list filterable by all / dizziness / with note; "Correct entry" (patient); notes and visit concerns with pin/unpin and delete (own notes only); "Add a visit concern" (patient) or "Add an observer note" (caregiver) modal. | `w1440-14-…`, `w1440-17-…`, `w1440-18-patient-concern-modal.png`, `w1440-32-…`, `w1440-33-caregiver-note-modal.png`, `w390-14-…`, `w390-32-…` |
| 4 | **Evidence dialog** | Both | Three modes. Fact: the sentence plus the list of contributing dates. Day: the patient's story, 7 answers with provenance and quotes, a version history selector and "Delete this day" (patient). Note: the note text. | `w1440-15-patient-day-evidence.png`, `w1440-16-patient-fact-evidence.png` |
| 5 | **My medicines** | Patient | Read-only medication cards: name, dose, schedule, recorded start, prescriber, list note; "Include stopped entries"; recorded list changes; the before/after explorer. | `w1440-19-patient-medicines.png`, `w390-19-…` |
| 6 | **Overview** | Caregiver (landing) | "Good to see you, Alex"; "Prepare a visit brief"; hero card; 7/14/28-day selector with 3 fact tiles; energy and sleep chart; the last 2 patient quotes; patient card (today's check-in recorded or not); AI teaser; mini medication list. | `w1440-30-caregiver-overview.png`, `w1440-31-…-scrolled-viewport.png`, `w390-30-…` |
| 7 | **Medication list** | Caregiver | Medication cards with Edit and Delete; "Add to the list" modal (name, dose, schedule, prescriber, list note, start date, "What does this edit represent?" with 4 event kinds, stop date); "Recorded list changes" event list; "Explore records around a recorded start" giving dizziness before/after counts (14-day windows, ≥7 answered days rule). | `w1440-34-…`, `w1440-35-caregiver-med-comparison.png`, `w1440-36-caregiver-add-med-modal.png`, `w390-34/35/36-…` |
| 8 | **Visit brief** | Caregiver | Period select (7/14/28); "Draft with local AI" or "Use a simple template"; "I reviewed the facts and wording" gate before "Print / save as PDF" (browser print); report preview with header, 4 fact tiles with "Check source", medication table (name, dose, schedule), observations and discussion questions (editable textareas), pinned concerns quoted, footer with mode and review state. Unreviewed print shows only "Please review…". | `w1440-37-caregiver-brief-empty.png`, `w1440-38-caregiver-brief-template.png`, `w1440-39-caregiver-brief-print-media.png`, `brief-template-print.pdf`, `w390-37/38-…` |
| 9 | **Privacy & local AI** (Settings) | Both (via the sidebar card, "About this prototype", or the mobile gear icon) | Storage facts (dataset, revision, entry count) and Export JSON; AI panel (model name, size, 40 s limit, last generation time, Unload, Clear cache); "Documentation, with boundaries" bullets; "References & source review" (3 external links); Demo controls (Reset demo, Clear all records) with confirmation modals. | `w1440-20-patient-settings.png`, `w1440-40-caregiver-settings.png`, `w390-20/40-…` |
| 10 | **Need help now?** modal | Both | Static 911 guidance, a `tel:911` button, the non-US note and a link to 911.gov. No triage. | `w1440-21-help-modal.png`, `w390-21-…` |
| 11 | **Recovery** | — | Shown when stored data is unreadable or invalid. Offers "Download a recovery copy" and "Reset this browser's demo" (writer tab only). | Not captured (exercised by `browser-test.mjs`) |
| 12 | **Read-only tab banner** | Both | Shown when another tab holds the writer lock. Commits are blocked with a toast. | Not captured (exercised by `browser-test.mjs`) |

---

## 10. Recommendations for the revamp (engineering view)

1. **Make the deterministic medication review the product's core.** It works in any browser with no download. Merge the teammate's `flags.ts` engine pattern with cited Beers 2023, DDI, ACB, fall-risk and prescribing-cascade content, plus Albert's evidence-link and provenance UI. Every flag gets "why" (the rule), "source" (the citation) and "which medications" (links).
2. **Make symptom capture deterministic first.** Use a lexicon with NegEx-style negation, temporal and experiencer rules, so "I slept badly last night" and "a bit wobbly" work immediately. The LLM becomes an optional "enhanced extraction" toggle whose disagreements are shown. That makes the AI claim credible and testable (precision and recall on a sentence corpus), and the demo doesn't depend on WebGPU.
3. **Use one timeline view** in the style of the teammate's EventStrip: rows are symptoms, columns are days, medication start and stop lines are labelled with the drug name, and missing days are shown as missing. Add a per-medication before/after card with denominators and named overlapping changes.
4. **Use a brief built for a pharmacist or clinician**: medications with indication and start date, cited findings, the timeline table, patient quotes, caregiver concerns and neutral questions. Keep the review gate. Add a FHIR R4 export (valuable for the EHR-vendor judge; the resource choices still need to be verified by the research workstream).
5. **Make it hostable.** Move model weights out of `public/` (or load them from a CDN only when the user opts in, with a revised CSP) so `dist/` is a few MB and can go on GitHub Pages, Netlify or Vercel. Judges should be able to click a link and use the app immediately.
6. **Fix B1–B5 and B14–B17 regardless of direction.** Each fix is small.
7. **Cut disclaimers to one scope statement** plus inline "How this was calculated" and "Source" links. Remove "coming soon" items.
8. **Update the docs and assets:** README paths, blueprint and policy, the validation record, new screenshots (taken as viewport screenshots or with the sidebar made non-fixed for capture, to avoid B13), and a narrated demo video.
