// Auto-recorded, narrated demo video for the Kinwise submission (docs/DEMO-SCRIPT.md is the human-readable
// version of the SHOTS table below — keep the two in sync).
//
//   node scripts/submission/record-demo.mjs                 # starts its own Vite dev server on 127.0.0.1:5229
//   BASE_URL=http://127.0.0.1:5174/ node scripts/submission/record-demo.mjs   # reuse a running server
//   HEADED=1 node scripts/submission/record-demo.mjs        # watch it (the recording is the same)
//   VOICE="Shelley (English (US))" node scripts/submission/record-demo.mjs
//   NO_AI=1 node scripts/submission/record-demo.mjs         # template-only cut (no on-device model, other narration)
//   OUT_DIR=tmp/demo-video-test NO_AI=1 PORT=5465 node scripts/submission/record-demo.mjs   # test render, outside submission/
//   NARRATION_DIR=tmp/voice node scripts/submission/record-demo.mjs   # use a teammate's recorded clips instead of `say`
//   PLAN=1 node scripts/submission/record-demo.mjs          # no browser: check the script sync, print the planned length
//   CAPTIONS=0 node scripts/submission/record-demo.mjs      # no burned-in captions (the .srt is still written)
//
// What it does:
//   0. Checks that docs/DEMO-SCRIPT.md contains every narration line below, word for word (fails unless
//      ALLOW_MISMATCH=1), that the hook card's statistics (Gandhi et al., NEJM 2003; CDC falls) are still in
//      kb-src/research/market-evidence.md, that the null study still supports "more than one in ten"
//      (eval/results/timeline-null.json), that the hand-off note still matches the How it works status table, and
//      that every atPhrase cue is in its shot's narration. The evaluation numbers in the narration are read from
//      eval/results/*.json at startup.
//   1. Writes each shot's narration to an .aiff with macOS `say` (or takes NARRATION_DIR/<shot id>[.<variant>].wav,
//      .m4a or .aiff when that file exists) and measures it with ffprobe FIRST, so every shot stays on screen at
//      least as long as its narration. A shot's optional `spoken` text (phonetic respellings such as "fire" for
//      FHIR) is only what `say` reads; captions always show `narration`.
//   2. Drives the app in system Chrome (Playwright channel "chrome", 1440x900 page area, pixel ratio 1) with WebGPU
//      enabled, in a persistent profile (tmp/demo-video-profile: ephemeral contexts have storage quotas too small
//      to cache the multi-GB model). The app's localStorage is cleared first, so the seeded demo record is
//      created fresh. Before the clock starts (off camera) the optional on-device model (Qwen2.5 3B Instruct) is
//      loaded from the local copy in public/models/resolve/ through Settings and warmed up with one question; it
//      then drafts a short summary in the Ask shot. Every other screen is deterministic code (the visit brief
//      uses the standard template). Requests to model hosts are blocked, so nothing is downloaded from the
//      internet. If the local model files are missing, or NO_AI=1, the template-only narration is used instead.
//      Every route the video visits is also opened once off camera (warmRoutes), so no lazily loaded page shows its
//      loading skeleton on camera. A shot that changes page does so in its ENTER step, before its clock starts, and
//      every shot waits for the page's main heading and for no loading skeleton (waitForScreen) before its chapter
//      label and narration begin, so the narration never plays over a half-loaded page.
//      A visible cursor is injected so viewers can follow the clicks, plus recorder-only overlays (never app code):
//      a highlight ring and short zoom-ins ("punch-ins") timed to the narration, a chapter label at each shot start,
//      an optional on-screen note off the content (the hand-off note, in the empty part of the caregiver sidebar)
//      and one-line burned-in captions for muted viewers.
//      They live in one popover in the browser's top layer, so they also show above the app's modal dialogs. The
//      cursor is hidden over the title and end cards.
//   3. Logs each shot's start/end relative to the start of the final video.
//   4. Playwright's screencast does not play back at wall-clock speed (about 8-20% slow here), so a 10x10 px
//      sync marker in the bottom-right corner changes colour at every shot start and cursor move. ffmpeg finds
//      those changes in the raw frames, retimes each segment back to real time (setpts), paints the marker out
//      (delogo), converts to H.264 mp4 (yuv420p, 30 fps, crf 20), places each narration clip at its shot start
//      (adelay + amix normalize=0), normalises the loudness to -16 LUFS with -1.5 dBTP peaks (loudnorm, the usual
//      level for online video; the `say` mix was about -19 dB) and muxes.
//   5. Writes kinwise-demo.mp4 and kinwise-demo.srt to OUT_DIR (default submission/) and timings.json to the
//      working folder, which is always under tmp/ (see WORK below).
//
// Every number spoken in the narration is checked on screen during the recording (see `expectText`); if the
// app shows something different the run stops instead of producing a video whose narration is wrong.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { CODE_URL as CODE_LINK, DEMO_URL, REPO_BRANCH, shortUrl } from "./lib.mjs";

// Health-language guard for anything the on-device model writes on screen during the recording (SPEC §3).
const BANNED_ON_SCREEN = /\b(caus(e|ed|es|ing)|due to the|safe|unsafe|dangerous|urgent|stop taking|start taking|should (stop|start|change)|diagnos)/i;
// Stricter, for the one place the video quotes AI text the app's check removed (verify shot): any medicine-change
// verb, e.g. "pause the lorazepam". Such a sentence is never zoomed (zoomRemovedSentence); its reason line is.
const ADVICE_ON_SCREEN = /\b(stop|pause|hold|skip|switch|swap|replac|reduc|lower|increas|raise|cut|taper|wean|chang|discontinu|resum|restart|avoid)\w*/i;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// OUT_DIR (relative to the repo root, or absolute) sends a test render somewhere other than submission/. The working
// files (audio, raw video, timings.json; hundreds of MB) always stay under the git-ignored tmp/: in OUT_DIR/work when
// OUT_DIR is itself inside tmp/, in tmp/demo-video for the default submission/ folder (also when OUT_DIR names it),
// and in tmp/demo-video-<OUT_DIR's folder name> for any other folder. So a render never leaves intermediates in a
// folder that could be committed. PLAN=1 only writes narration clips, to tmp/demo-video-plan.
const PLAN_ONLY = !!process.env.PLAN; // check sync + measure narration, then stop (no browser)
const DEFAULT_OUT = join(ROOT, "submission");
const OUT_DIR = process.env.OUT_DIR ? resolve(ROOT, process.env.OUT_DIR) : DEFAULT_OUT;
const WORK = PLAN_ONLY
  ? join(ROOT, "tmp", "demo-video-plan")
  : OUT_DIR === DEFAULT_OUT
    ? join(ROOT, "tmp", "demo-video")
    : OUT_DIR.startsWith(join(ROOT, "tmp") + sep)
      ? join(OUT_DIR, "work")
      : join(ROOT, "tmp", `demo-video-${basename(OUT_DIR)}`);
const OUT_MP4 = join(OUT_DIR, "kinwise-demo.mp4");
const OUT_SRT = join(OUT_DIR, "kinwise-demo.srt");
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
const PORT = Number(process.env.PORT ?? 5229);
const PROFILE = join(ROOT, "tmp", "demo-video-profile");
const AI_MODEL_DIR = join(ROOT, "public", "models", "resolve", "Qwen2.5-3B-Instruct-q4f16_1-MLC");
const USE_AI = !process.env.NO_AI && existsSync(join(AI_MODEL_DIR, "mlc-chat-config.json"));
// A teammate's recorded narration: NARRATION_DIR/<shot id>[.<variant>].(wav|m4a|aiff), see clipFor().
const NARRATION_DIR = process.env.NARRATION_DIR ? resolve(ROOT, process.env.NARRATION_DIR) : null;
const CAPTIONS = process.env.CAPTIONS !== "0"; // burned-in captions for muted viewers
const VIEW = { width: 1440, height: 900 };
// Words per minute for `say`. Samantha's rate only changes in steps (160 to 181 read alike; 185 is the next step,
// about 4% faster than the earlier 175), and 185 keeps the plan inside PLAN_LIMIT_SEC.
const RATE = Number(process.env.RATE ?? 185);
const LEAD_IN = 0.3; // s between a shot's start and its narration
const TAIL = 0.4; // s of breathing room after a shot's narration (a shot can override it with `tail`)
const PLAN_LIMIT_SEC = 175; // the narration-bound plan may not exceed this (renders run about 10-15 s longer)
// Loudness normalisation for the mixed narration (ffmpeg loudnorm: -16 LUFS integrated, -1.5 dBTP true peak).
export const AUDIO_LOUDNORM = "loudnorm=I=-16:TP=-1.5";
const SESSION_KEY = "kinwise.v1.session";
const SCRIPT_DOC = join(ROOT, "docs", "DEMO-SCRIPT.md");

// End card. The links come from scripts/submission/lib.mjs (the same constants the PDFs print), so the video cannot
// drift from them. The code link names REPO_BRANCH (medwatch-v2, the branch the live demo is built from), because
// the repository's default branch still holds the first prototype.
const LIVE_URL = shortUrl(DEMO_URL);
const CODE_URL = shortUrl(CODE_LINK);
export const TEAM_LINE = "Albert Zorzolan and Neil Shah, Babson College";
// The end card's one call to action: the same words as the Welcome screen's button and the "Try it" line of
// submission/DEVPOST.md (record-demo.test.mjs checks DEVPOST still says it).
export const END_CTA = "Take the 2-minute guided tour";

/**
 * Evaluation numbers for the evals shot, read from the committed result files (the same files
 * scripts/submission/facts.mjs reads for the PDFs), so rerunning an evaluation cannot leave the narration behind.
 * The live page reruns both suites during the recording and expectText checks it shows the same numbers.
 */
function readEvalNumbers() {
  const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  const nlp = read("eval/results/nlp-eval.json");
  const meds = read("eval/results/meds-eval.json");
  const nullStudy = read("eval/results/timeline-null.json");
  return {
    heldoutF1Pct: (nlp.heldout.micro.f1 * 100).toFixed(1), // same rounding as facts.mjs pct(): 0.9422 → "94.2"
    heldoutStories: nlp.heldout.cases,
    medsPassed: meds.summary.casesPassed,
    medsCases: meds.summary.cases,
    // Share of simulated medicine changes with NO real effect that still got a moderate-or-strong flag, with
    // independent days (the most favourable scenario; clustered days are higher). checkTimelineNull() requires it
    // above 0.1 for the timeline shot's "more than one in ten".
    nullFlaggedRate: nullStudy.independent?.moderateRate,
  };
}
const EVAL = readEvalNumbers();

/**
 * "More than one in ten medicine changes with no real effect still get flagged" (timeline shot) must still be what
 * eval/results/timeline-null.json measured: the independent-days share flagged moderate or strong must be above
 * 0.1. That is the lowest of the study's scenarios, so "more than" stays true for the clustered ones too (0.858).
 */
export function checkTimelineNull(rate = EVAL.nullFlaggedRate) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error("timeline: eval/results/timeline-null.json has no independent.moderateRate; update the timeline narration");
  }
  if (!(rate > 0.1)) throw new Error(`timeline: the null-study rate (${rate}) no longer supports "more than one in ten"`);
}

/**
 * HANDOFF_NOTE's source: the How it works status table must still mark the patient-to-caregiver hand-off Partial as
 * "one shared browser today, or a backup file" and list family sharing as Planned. `src` defaults to
 * src/views/public/howStatus.ts (the test passes text).
 */
export function checkHandoffSource(src = readFileSync(join(ROOT, "src", "views", "public", "howStatus.ts"), "utf8")) {
  const partial = src.slice(src.indexOf('status: "partial"'), src.indexOf('status: "planned"'));
  const planned = src.slice(src.indexOf('status: "planned"'));
  if (!/hand-off[^\n]*one shared browser today, or a backup file/i.test(partial)) {
    throw new Error("overview note: howStatus.ts no longer marks the hand-off Partial (one shared browser or a backup file); update HANDOFF_NOTE");
  }
  if (!/family sharing/i.test(planned)) throw new Error("overview note: howStatus.ts no longer lists family sharing as Planned; update HANDOFF_NOTE");
}

/**
 * The seed's pinned runs check for dizziness, for when the Timeline does not show the runs check itself: the seed
 * test (src/engine/timeline/seed.timeline.test.ts, part of npm test) must still pin dizziness runsCheck.passed = true,
 * i.e. shuffling whole runs of days leaves its strength unchanged. `src` defaults to that file (the test passes text).
 */
export function seedRunsCheckPassed(src = readFileSync(join(ROOT, "src", "engine", "timeline", "seed.timeline.test.ts"), "utf8")) {
  return /expect\(runs\.dizziness\)\.toEqual\(\{[^}]*\bpassed: true\b[^}]*\}\)/.test(src);
}

// ---------------------------------------------------------------------------------------------------------------
// Narration. Health-language rules (docs/SPEC.md §3): no causal claims, no safe/unsafe, no stop/start/change
// advice, numerators AND denominators, questions for the clinician, honest about finished vs planned.
// Sources for every number: the hook is Gandhi et al., NEJM 2003 (kb-src/research/market-evidence.md row 7: of the
// ameliorable adverse drug events in primary care, 37% were attributed to the patient not telling the physician;
// "more than a third" is that 37%, "could have been eased" is the paper's "ameliorable", and "were linked to" stays
// no stronger than the paper's "attributed to"). The 19-of-51 counts behind it are deliberately not used
// (market-evidence.md notes they were not re-checked). The hook card adds the CDC falls figure, "less than half tell
// their doctor" (market-evidence.md row 4), on the card only. Margaret 78, eight medicines, urgent-care sleeping pill
// (seed, src/model/seed.ts: lorazepam started at an urgent care visit for "my nerves and the not sleeping"; on screen
// in her medicine list, "Prescribed by Urgent care"); 9 of 14 / 2 of 19, 1 fall + 2 near-falls, 2 of 14 near-fall
// days (seed + live app); Fisher's exact test p = 0.0023 for dizziness 9 of 14 vs 2 of 19
// (src/engine/timeline/stats.ts fisherExact, shown by the live timeline); "nine items compared" (the timeline's
// "of 9 compared diary items", checked on screen); "more than one in ten" changes with no real effect flagged
// (eval/results/timeline-null.json independent.moderateRate, read by readEvalNumbers()); "still holds when whole runs
// of days are shuffled" (the runs check, see CHOOSE.timeline); ACB 7 (live app, src/model/seed.test.ts);
// "three-billion-parameter" is Qwen2.5 3B Instruct, the model the Ask badge names; 270 FHIR resources (live app,
// docs/samples/kinwise-fhir-bundle.json); held-out micro-F1 and story count (eval/results/nlp-eval.json) and cases
// passed (eval/results/meds-eval.json), read by readEvalNumbers(). The on-device model's text is never quoted in the
// narration; the recorder checks what it puts on screen passed the app's checks and contains no banned wording
// (BANNED_ON_SCREEN).
//
// Order (judges mostly watch the first minute): the problem, the people, her check-in, what Alex sees, then the
// medication review (from about 0:50) with the AI safety net, the statistics, the on-device AI draft in Ask, the
// brief, the live evaluation, the honest status and the end card.
//
// Fields: `title` is the chapter label shown at the shot's start; `spoken` (optional) is what `say` reads instead
// of `narration`; `narrationNoAi` replaces `narration` in the template-only cut; `aiOnly` shots are left out of
// that cut; `variants` holds alternative narrations, one of which CHOOSE[id] picks from the screen just before the
// shot starts (audio for every variant is made up front); `tail` and `minSec` adjust how long the shot holds;
// `note` is a short on-screen remark (not spoken, not in the .srt) that the shot's ACTIONS step puts up with
// showNote, in a spot off the app's content; `captionsPinned` keeps the captions at the bottom for the whole shot.

/**
 * On screen as Margaret's view hands over to Alex's (overview shot), so a viewer does not assume two synced phones.
 * Its source is the How it works status table (src/views/public/howStatus.ts): Partial "Patient-to-caregiver
 * hand-off: one shared browser today, or a backup file" and Planned "Encrypted family sharing"; checkHandoffSource
 * stops the run if either row changes.
 */
export const HANDOFF_NOTE = "Today both views share one device, or a backup file; family sharing is planned.";

/**
 * The verify shot's lines for a "What the check removed" list on the review card: the first reason shown (the
 * plain words of src/ai/tasks.ts plainIssue, as "Reason: …" or "Blocked: …") picks the line that names it. Each line
 * is true whichever way the explanation went: code removed that sentence (and, when too few passed, hid the rest).
 */
export const VERIFY_REASONS = [
  {
    variant: "removedNumber",
    reason: /has a number that is not in/i,
    narration: "The safety net: code checked the model's wording and removed a sentence with a number the sources don't have.",
  },
  {
    variant: "removedCount",
    reason: /has a count that does not match/i,
    narration: "The safety net: code checked the model's wording and removed a sentence whose count doesn't match the sources.",
  },
  {
    variant: "removedMedicine",
    // A review card says "this finding is not about" (CheckRemoved.tsx cardIssue): its check only knows the finding's
    // medicines, not her whole list, so the line says the same. The brief's "not on the list" wording also matches.
    reason: /names a medicine (?:that is not on the list|this finding is not about)/i,
    narration: "The safety net: code checked the model's wording and removed a sentence naming a medicine this finding isn't about.",
  },
  {
    variant: "removedCondition",
    reason: /names a condition (?:the records it cites|the finding or its reference text) do not mention/i,
    narration: "The safety net: code checked the model's wording and removed a sentence naming a condition the sources don't mention.",
  },
  {
    variant: "removedHowOften",
    reason: /says how often/i,
    narration: "The safety net: code checked the model's wording and removed a sentence saying how often, which the sources don't.",
  },
  {
    variant: "removedBlocked",
    reason: /^Blocked:/i,
    narration: "The safety net: code checked the model's wording and removed a sentence with wording its rules block.",
  },
];

/**
 * The review card's note when the check rejected the AI explanation (FindingCard.tsx BLOCKED_NOTE, "The code check
 * rejected the AI wording, so only the records-based text is shown."); the older wording is still accepted.
 */
export const BLOCKED_NOTE_ON_SCREEN = /code check rejected the AI wording|didn.t pass the source check/i;

/**
 * The VERIFY_REASONS line for one reason line read off the screen ("Reason: …" / "Blocked: …"), or null. Only the
 * first reason counts: the app joins several with "; " (CheckRemoved.tsx reasonLine), and the narration must name
 * the one the viewer reads first. A "Blocked:" line's first reason is always the blocked wording.
 */
export function verifyReasonVariant(reasonLine) {
  const line = String(reasonLine ?? "").replace(/\s+/g, " ").trim();
  const prefix = /^(Reason|Blocked):\s*/i.exec(line);
  if (prefix && /^Blocked/i.test(prefix[1])) return "removedBlocked";
  const first = (prefix ? line.slice(prefix[0].length) : line).split("; ")[0];
  return VERIFY_REASONS.find((r) => r.variant !== "removedBlocked" && r.reason.test(first))?.variant ?? null;
}

/**
 * Whether the verify shot may zoom a whole removed item, quoted AI sentence included. The list quotes the removed
 * text word for word, and blocked text can read like advice ("pause the lorazepam"); the app's "These sentences are
 * not advice" caution sits above the list, outside the zoom. So a `removedBlocked` item, or any quoted sentence
 * with causal, safety or medicine-change wording (BANNED_ON_SCREEN, ADVICE_ON_SCREEN), is not zoomed: only its
 * reason line is.
 */
export function zoomRemovedSentence(variant, text) {
  if (variant === "removedBlocked") return false;
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > 0 && !BANNED_ON_SCREEN.test(t) && !ADVICE_ON_SCREEN.test(t);
}

export const ALL_SHOTS = [
  {
    id: "hook",
    title: "The problem",
    route: "#/ (title card over Welcome)",
    narration: "More than a third of medicine side effects that could have been eased were linked to the doctor never being told.",
    tail: 0.15,
    chapter: false,
  },
  {
    // The first sentence says what Kinwise is (over the Welcome headline that says the same), so a judge who stops
    // after 20 s still knows the product. The last sentence plays over Margaret's own medicine list, ringed on the
    // lorazepam card with "Prescribed by Urgent care" (ACTIONS.who), not over an empty form.
    id: "who",
    title: "Margaret and Alex",
    route: "#/ → #/p/today → #/p/meds",
    narration:
      "Kinwise helps families notice what changes after a medicine change, and bring one clear, sourced question to the doctor. " +
      "Meet Margaret, seventy-eight, on eight medicines, and her daughter Alex, both fictional. " +
      "Urgent care started a new sleeping pill.",
  },
  {
    // ENTER.checkin goes back to the Today tab and its "Tell me about your day" box, off the narration.
    id: "checkin",
    title: "Her check-in, in her own words",
    route: "#/p/today",
    narration: "Margaret describes her day in her own words. A clinical language engine reads it on her device.",
  },
  {
    // "Margaret confirms each answer" is shown, not only said: the recorder clicks one "Yes, that's right" (the
    // reading's best guess about her sleep) as it is spoken. Captions stay at the bottom in this shot
    // (captionsPinned), so they never cover the panel's "CHECK WHAT I FOUND" heading.
    id: "heard",
    title: "Language engine, on her device",
    route: "#/p/today (Here's what I heard)",
    captionsPinned: true,
    narration:
      "Woozy becomes dizziness, nearly went over a near-fall, and no ankle swelling stays a no. " +
      "Sofia's fall is set aside as someone else's. Margaret confirms each answer.",
  },
  {
    // ENTER.overview switches to Alex with the in-app "Demo: switch to Alex's view" control, off the narration;
    // ACTIONS.overview then puts up HANDOFF_NOTE (on screen, not spoken) in the empty part of the caregiver sidebar,
    // so the switch is not read as a second device and no app text is covered.
    id: "overview",
    title: "What Alex sees",
    route: "#/c/overview",
    note: HANDOFF_NOTE,
    narration:
      "Since lorazepam started, dizziness was recorded on 9 of 14 answered days, " +
      "compared with 2 of 19 before. One fall and two near-falls were recorded on those 14 days. " +
      "It shows a change in what was recorded, not what caused it.",
  },
  {
    id: "review",
    title: "Medication review: code, with sources",
    route: "#/c/review",
    narration:
      "Deterministic code, not AI, checks her eight medicines against AGS Beers 2023, anticholinergic burden, " +
      "where she scores 7, fall-risk lists, and possible prescribing cascades, like furosemide for ankle swelling after amlodipine. " +
      "Each finding ends in a sourced question for her doctor or pharmacist.",
    spoken:
      "Deterministic code, not A I, checks her eight medicines against A G S Beers 2023, anticholinergic burden, " +
      "where she scores 7, fall-risk lists, and possible prescribing cascades, like furosemide for ankle swelling after amlodipine. " +
      "Each finding ends in a sourced question for her doctor or pharmacist.",
  },
  {
    // AI cut only. "Explain in simpler words" is clicked on the cascade finding during the review shot; CHOOSE.verify
    // reads the outcome off the screen and picks the matching narration (generation is temperature 0, but the
    // recorder never assumes which way it goes). The blocked outcome is the one the last renders showed.
    // When the card has a "What the check removed" list (the AI sentences the check dropped, each with its reason),
    // CHOOSE.verify opens it and picks the removed* line that names the first reason shown (VERIFY_REASONS; only
    // the first of several "; "-joined reasons counts); a reason with no line stops the run. Without the list it
    // falls back to draft / blocked as before.
    id: "verify",
    title: "The safety net: AI wording checked by code",
    route: "#/c/review (Explain in simpler words)",
    aiOnly: true,
    variants: {
      draft: {
        narration:
          "The on-device model rewrites the wording in plain language; code checks every sentence against the source first.",
      },
      blocked: {
        narration: "The safety net: here the model's wording failed the source check, so code hides it and the original text stays.",
      },
      ...Object.fromEntries(VERIFY_REASONS.map((r) => [r.variant, { narration: r.narration }])),
    },
  },
  {
    // CHOOSE.timeline picks `runs` only when the runs check is shown to hold for this row: its p on screen clears the
    // row's own bar, or (when the Timeline does not show it) the seed test pins dizziness runsCheck.passed = true.
    // Otherwise `plain` leaves the clause out. "nine items" is checked on screen ("of 9 compared diary items"), and
    // "more than one in ten" comes from eval/results/timeline-null.json (readEvalNumbers, checked at startup).
    id: "timeline",
    title: "The statistics behind it",
    route: "#/c/timeline",
    variants: {
      runs: {
        narration:
          "Dizziness: Fisher's exact test, p = 0.0023, and it still holds when whole runs of days are shuffled. " +
          "With nine items compared, more than one in ten medicine changes with no real effect still get flagged, so it stays a question.",
        spoken:
          "Dizziness: Fisher's exact test, p equals 0.0023, and it still holds when whole runs of days are shuffled. " +
          "With nine items compared, more than one in ten medicine changes with no real effect still get flagged, so it stays a question.",
      },
      plain: {
        narration:
          "Dizziness: Fisher's exact test, p = 0.0023. " +
          "With nine items compared, more than one in ten medicine changes with no real effect still get flagged, so it stays a question.",
        spoken:
          "Dizziness: Fisher's exact test, p equals 0.0023. " +
          "With nine items compared, more than one in ten medicine changes with no real effect still get flagged, so it stays a question.",
      },
    },
  },
  {
    id: "ask",
    title: "Ask Kinwise, with an on-device AI draft",
    route: "#/c/ask",
    narration:
      "Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. " +
      "A three-billion-parameter model on this laptop's GPU drafts a short summary; code checks every number and medicine name before it is shown. " +
      "Treatment questions are redirected to her doctor or pharmacist.",
    narrationNoAi:
      "Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. " +
      "Treatment questions are redirected to her doctor or pharmacist.",
  },
  {
    id: "brief",
    title: "Visit brief and FHIR export",
    route: "#/c/brief",
    narration:
      "The visit brief puts it on one page. Alex must mark it reviewed before it prints, " +
      "and it exports as an HL7 FHIR R4 bundle of 270 resources.",
    spoken:
      "The visit brief puts it on one page. Alex must mark it reviewed before it prints, " +
      "and it exports as an H L 7 fire R4 bundle of 270 resources.",
  },
  {
    id: "evals",
    title: "Live evaluation",
    route: "#/how-it-works (Live evaluation)",
    narration:
      `Both test suites rerun live: ${EVAL.heldoutF1Pct} percent micro-F1 on ${EVAL.heldoutStories} held-out fictional diary stories, ` +
      `and ${EVAL.medsPassed} of ${EVAL.medsCases} synthetic medication cases passed.`,
  },
  {
    // The "Partial" sentence only names items the page marks Partial: CHOOSE.honesty reads the Partial rows off the
    // screen before the shot, so the narration cannot claim a status or a gap the How it works table does not show.
    // `model` fits the table where the on-device model ("the code check is not airtight") and knowledge-base
    // coverage ("no dose or allergy checks", "interactions limited to the AGS Beers 2023 combination table") are
    // both Partial; `kb` fits a table where only knowledge-base coverage is Partial. Both name the missing dose,
    // allergy and full interaction checks, the gaps a pharmacist most needs to hear. "Working today" names only the
    // five things the video showed, and CHOOSE.honesty checks each is in a Working row (not "everything you saw":
    // the video also shows the model, which is Partial).
    id: "honesty",
    title: "Finished, partial, planned",
    route: "#/how-it-works (Finished vs planned)",
    variants: {
      model: {
        narration:
          "Working today: the check-in, timeline, review, Ask and brief you saw. " +
          "Partial: the model's code check isn't airtight; no dose, allergy or full interaction checks yet. " +
          "Planned: a validation study, pharmacy import and family sharing.",
      },
      kb: {
        narration:
          "Working today: the check-in, timeline, review, Ask and brief you saw. " +
          "Partial: knowledge-base coverage; no dose, allergy or full interaction checks yet. " +
          "Planned: a validation study, pharmacy import and family sharing.",
      },
    },
  },
  {
    id: "close",
    title: "Try it",
    route: "end card",
    // The clinician-review and no-advice caveat is spoken here, over the end card that also shows it in writing.
    // "On screen", not "below": the link is on the end card while this plays (and there may be no text below).
    narration: "Kinwise. Records stay in your browser. Not yet clinician-reviewed; not medical advice. Try it at the link on screen.",
    minSec: 6.5,
    chapter: false,
  },
];

// The shots in this cut: the template-only cut leaves out the AI-only shots.
const SHOTS = ALL_SHOTS.filter((s) => USE_AI || !s.aiOnly);

// ---------------------------------------------------------------------------------------------------------------
// Helpers: shell, voice, audio durations

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20, ...opts });
}

function pickVoice() {
  const list = sh("say", ["-v", "?"]);
  const names = list
    .split("\n")
    .map((l) => l.match(/^(.*?)\s+([a-z]{2}_[A-Z]{2})\s+#/))
    .filter(Boolean)
    .map((m) => ({ name: m[1].trim(), locale: m[2] }));
  const has = (n) => names.some((v) => v.name === n || v.name.startsWith(`${n} (`));
  const prefs = [process.env.VOICE, "Samantha", "Shelley (English (US))", "Reed (English (US))", "Sandy (English (US))", "Flo (English (US))", "Eddy (English (US))", "Kathy"].filter(Boolean);
  for (const p of prefs) if (has(p)) return p;
  // Last resort: first en_US voice that is not one of the novelty voices.
  const novelty = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Junior|Ralph|Fred|Grandma|Grandpa|Rocko)/;
  const any = names.find((v) => v.locale === "en_US" && !novelty.test(v.name));
  if (!any) throw new Error("no usable en_US voice found (say -v '?')");
  return any.name;
}

function duration(file) {
  return Number(sh(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
}

const AUDIO_EXTS = ["wav", "m4a", "aiff"];
let VOICE = null; // picked on first use, so a fully hand-narrated run never needs `say`

/**
 * The narration clip for one shot (and variant): a teammate's recording NARRATION_DIR/<id>[.<variant>].(wav|m4a|aiff)
 * when it exists, otherwise `say` reading `spoken ?? narration`. Returns { file, dur, source }.
 */
function clipFor(n, id, variant, narration, spoken) {
  const base = variant ? `${id}.${variant}` : id;
  if (NARRATION_DIR) {
    for (const ext of AUDIO_EXTS) {
      const f = join(NARRATION_DIR, `${base}.${ext}`);
      if (existsSync(f)) return { file: f, dur: duration(f), source: "recorded" };
    }
  }
  VOICE ??= pickVoice();
  const file = join(WORK, "audio", `shot${String(n).padStart(2, "0")}-${base}.aiff`);
  sh("say", ["-v", VOICE, "-r", String(RATE), "-o", file, spoken ?? narration]);
  return { file, dur: duration(file), source: "say" };
}

/** Every narration line a shot can use, labelled: [["ask", text], ["ask (NO_AI)", text], ["verify.draft", text], …]. */
function narrationTexts(s) {
  const out = [];
  if (s.narration) out.push([s.id, s.narration]);
  if (s.narrationNoAi) out.push([`${s.id} (NO_AI)`, s.narrationNoAi]);
  for (const [v, x] of Object.entries(s.variants ?? {})) out.push([`${s.id}.${v}`, x.narration]);
  return out;
}

/**
 * docs/DEMO-SCRIPT.md must quote every narration line word for word (whitespace aside), including the NO_AI and
 * variant lines and the evaluation numbers as they are in eval/results today. Fails unless ALLOW_MISMATCH is set.
 */
function checkScriptSync() {
  const missing = scriptLinesMissing(readFileSync(SCRIPT_DOC, "utf8"));
  if (!missing.length) return console.log(`docs/DEMO-SCRIPT.md quotes all ${ALL_SHOTS.flatMap(narrationTexts).length} narration lines`);
  const msg =
    `docs/DEMO-SCRIPT.md is out of sync with the SHOTS table; these narration lines are not in it word for word:\n` +
    missing.map(([label, text]) => `  - ${label}: "${text}"`).join("\n");
  if (!process.env.ALLOW_MISMATCH) throw new Error(`${msg}\nUpdate the doc (or set ALLOW_MISMATCH=1 for a test render).`);
  console.warn(`\n${"!".repeat(100)}\nWARNING ${msg}\n${"!".repeat(100)}\n`);
}

/** The [label, text] narration lines (every shot, variant and NO_AI line) that `docText` does not quote word for word. */
export function scriptLinesMissing(docText) {
  const norm = (t) => t.replace(/\s+/g, " ").trim();
  const doc = norm(docText);
  return ALL_SHOTS.flatMap(narrationTexts).filter(([, text]) => !doc.includes(norm(text)));
}

/**
 * The hook's statistics must still be in the research file they are quoted from (the card itself is recorder HTML,
 * so expectText cannot check it against the app). The spoken hook says "more than a third" of the side effects that
 * "could have been eased": that is Gandhi's share of ameliorable events attributed to the patient not telling the
 * physician (37%), so the Gandhi row must still give that share and it must still be above a third. The card's
 * second line is the CDC falls figure. `md` defaults to kb-src/research/market-evidence.md (the test passes text).
 */
export function checkHookSources(md = readFileSync(join(ROOT, "kb-src", "research", "market-evidence.md"), "utf8")) {
  const gandhi = md.match(/of the ameliorable ones,[^|\n]*\*\*(\d+(?:\.\d+)?)%\*\* to the patient not telling the physician\.? \| Gandhi et al\., NEJM 2003/);
  if (!gandhi) throw new Error("hook card: Gandhi et al. (NEJM 2003) row no longer found in kb-src/research/market-evidence.md; update HOOK_CARD");
  if (!(Number(gandhi[1]) > 100 / 3)) throw new Error(`hook: the Gandhi share (${gandhi[1]}%) no longer supports "more than a third"`);
  if (!/More than 1 in 4\*\* older adults fall each year, but \*\*less than half tell their doctor/.test(md)) {
    throw new Error("hook card: CDC falls row no longer found in kb-src/research/market-evidence.md; update HOOK_CARD");
  }
}

/**
 * Every `atPhrase(shot, "…")` cue in a shot's action must be in one of that shot's narration lines (a variant or the
 * NO_AI line counts), so an edited narration fails here in a second instead of minutes into a render.
 */
export function checkPhraseCues() {
  const bad = [];
  for (const s of ALL_SHOTS) {
    const texts = narrationTexts(s).map(([, t]) => t);
    for (const [, p] of String(ACTIONS[s.id] ?? "").matchAll(/atPhrase\(shot, "([^"]+)"/g)) {
      if (!texts.some((t) => t.includes(p))) bad.push(`${s.id}: "${p}"`);
    }
  }
  if (bad.length) throw new Error(`atPhrase cues not found in their shot's narration:\n  ${bad.join("\n  ")}`);
}

/**
 * Refuse output folders the rules keep read-only (the submitted backup, archive/, node_modules/, model weights), and
 * refuse ALLOW_MISMATCH for the submission folder: it turns the narration and on-screen number checks into warnings.
 */
function checkOutDir() {
  if (process.env.ALLOW_MISMATCH && OUT_DIR === DEFAULT_OUT && !PLAN_ONLY) {
    throw new Error("ALLOW_MISMATCH is for test renders only; set OUT_DIR=tmp/... (it never writes submission/)");
  }
  for (const rel of ["archive", join("tmp", "submitted-2026-10-16-backup"), "node_modules", join("public", "models")]) {
    const p = join(ROOT, rel);
    if (OUT_DIR === p || OUT_DIR.startsWith(p + sep)) throw new Error(`OUT_DIR ${OUT_DIR} is inside ${rel}/, which must not be modified`);
  }
}

/**
 * Read-only check that the code this video shows is the code the end card links to. The recording is made from the
 * working tree, but the end card points at the live demo (built from REPO_BRANCH) and the code on REPO_BRANCH. If
 * src/ or index.html differ from that branch (uncommitted, unmerged or untracked files), judges who follow the links
 * would see a different app from the video. For the submission folder this stops the run unless ALLOW_UNDEPLOYED=1;
 * for any other OUT_DIR (and PLAN=1) it only warns. Only `git rev-parse`, `git diff --quiet` and `git ls-files` run.
 */
function checkShownCodeMatchesLinks() {
  const paths = ["src", "index.html"];
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let result;
  try {
    const shownCommit = git("rev-parse", "HEAD");
    const branchCommit = git("rev-parse", REPO_BRANCH);
    let differs = false;
    try {
      execFileSync("git", ["diff", "--quiet", REPO_BRANCH, "--", ...paths], { cwd: ROOT, stdio: "ignore" });
    } catch {
      differs = true; // exit code 1 = the working tree differs from the branch
    }
    const untracked = git("ls-files", "--others", "--exclude-standard", "--", ...paths).split("\n").filter(Boolean);
    result = { shownCommit, linksBranch: REPO_BRANCH, branchCommit, differsFromBranch: differs, untrackedFiles: untracked.length };
    result.matches = !differs && untracked.length === 0;
  } catch (e) {
    result = { linksBranch: REPO_BRANCH, matches: false, error: String(e?.message ?? e).split("\n")[0] };
  }
  if (result.matches) {
    console.log(`Code shown matches ${REPO_BRANCH} (${result.branchCommit.slice(0, 7)}), the branch the end card links to`);
    return result;
  }
  const msg =
    `The video would show code that is not yet on ${REPO_BRANCH} or the live demo` +
    (result.error ? ` (git check failed: ${result.error})` : ` (src/ or index.html differ from ${REPO_BRANCH}; ${result.untrackedFiles} untracked file(s))`) +
    `. Merge this branch into ${REPO_BRANCH} and redeploy the live demo before rendering or uploading the submitted video.`;
  if (OUT_DIR === DEFAULT_OUT && !PLAN_ONLY && !process.env.ALLOW_UNDEPLOYED) {
    throw new Error(`${msg}\nFor a test render set OUT_DIR=tmp/...; to render submission/ anyway set ALLOW_UNDEPLOYED=1.`);
  }
  console.warn(`\n${"!".repeat(100)}\nWARNING ${msg}\n${"!".repeat(100)}\n`);
  return result;
}

/** Apply a chosen variant's narration, clip and duration to the shot. */
function useVariant(s, v) {
  if (!s.variants?.[v]) throw new Error(`${s.id}: unknown narration variant "${v}"`);
  s.variant = v;
  s.narration = s.variants[v].narration;
  s.audio = s.clips[v].file;
  s.narrDur = s.clips[v].dur;
  s.narrSource = s.clips[v].source;
}

/** Planned on-screen length of a shot from its narration alone (actions can only make it longer). */
function plannedSec(s, narrDur = s.narrDur) {
  return Math.max(s.minSec ?? 0, LEAD_IN + narrDur + (s.tail ?? TAIL));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sync events: [{ i, real }] — real = seconds on the recording clock when the marker changed colour.
const SYNC = { events: [], clock: null, last: -1 };
const SYNC_CODES = [0b100, 0b010, 0b001, 0b011, 0b101, 0b110]; // r g b c m y as 3-bit rgb codes

/** Change the sync marker (skipped while a modal <dialog> covers it, or if the last change was < 0.35 s ago). */
async function mark(page, { force = false } = {}) {
  if (!SYNC.clock) return;
  const t = SYNC.clock();
  if (!force && t - SYNC.last < 0.35) return;
  const modal = await page.evaluate(() => !!document.querySelector("dialog[open]")).catch(() => true);
  if (modal && !force) return;
  const i = SYNC.events.length;
  const before = SYNC.clock();
  await page.evaluate((n) => window.__kwSync?.(n), i);
  const after = SYNC.clock();
  SYNC.events.push({ i, real: (before + after) / 2 + 0.017 });
  SYNC.last = after;
}

// ---------------------------------------------------------------------------------------------------------------
// Server

async function waitForHttp(url, ms, proc) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (proc && proc.exitCode !== null) throw new Error(`dev server exited early (code ${proc.exitCode})`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`no answer from ${url} within ${ms} ms`);
}

async function startServer() {
  if (process.env.BASE_URL) {
    const base = process.env.BASE_URL.endsWith("/") ? process.env.BASE_URL : `${process.env.BASE_URL}/`;
    await waitForHttp(base, 15000);
    return { base, stop: async () => {} };
  }
  const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const proc = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0" },
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${PORT}/`;
  try {
    await waitForHttp(base, 60000, proc);
  } catch (e) {
    proc.kill("SIGTERM");
    throw new Error(`${e.message}\n--- vite output ---\n${log}`);
  }
  const stop = () =>
    new Promise((res) => {
      if (proc.exitCode !== null) return res();
      proc.once("exit", () => res());
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGKILL");
        res();
      }, 3000).unref();
    });
  return { base, stop };
}

// ---------------------------------------------------------------------------------------------------------------
// In-page helpers: visible cursor, title cards, smooth movement

/**
 * Injected into every document: a visible cursor that follows the (synthetic) mouse, with a click pulse, and the
 * recorder's overlays (highlight ring, punch-in, chapter label, captions). All of them sit in one transparent,
 * click-through layer that is a manual popover, i.e. in the browser's top layer: plain z-index cannot paint above
 * a modal <dialog> (the Add medication drawer), a later top-layer element can. The layer is raised again whenever a
 * dialog opens. None of this is app code; it exists only in the recording browser.
 */
function cursorInit() {
  const install = () => {
    if (document.getElementById("__kw_layer")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__kw_layer{position:fixed;inset:0;width:auto;height:auto;max-width:none;max-height:none;margin:0;padding:0;border:0;
        background:transparent;overflow:visible;pointer-events:none;color:#fff;font-family:var(--font-sans,system-ui)}
      #__kw_layer *{pointer-events:none}
      #__kw_cursor{position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
        background:rgba(169,87,58,.22);border:2px solid rgba(169,87,58,.95);box-shadow:0 1px 6px rgba(0,0,0,.25);
        z-index:60;transition:transform .12s ease, background .12s ease;transform:translate(-100px,-100px)}
      #__kw_cursor.down{background:rgba(169,87,58,.5)}
      .__kw_ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid rgba(169,87,58,.9);
        z-index:59;animation:__kw_r .55s ease-out forwards}
      @keyframes __kw_r{to{transform:scale(3.2);opacity:0}}
      #__kw_dim{position:fixed;inset:0;z-index:10;background:rgba(20,28,25,.2);opacity:0;transition:opacity .35s ease}
      .__kw_punch{position:fixed;z-index:20;transform-origin:0 0;border-radius:10px;background:#fff;
        box-shadow:0 0 0 3px #a9573a,0 18px 50px rgba(0,0,0,.3);transition:transform .38s cubic-bezier(.2,.7,.2,1)}
      #__kw_ring{position:fixed;left:0;top:0;width:0;height:0;z-index:30;box-sizing:border-box;border:3px solid #a9573a;border-radius:12px;
        box-shadow:0 0 0 5px rgba(169,87,58,.2),0 8px 26px rgba(31,42,38,.12);opacity:0;transition:opacity .25s ease}
      #__kw_ring.move{transition:opacity .25s ease,left .32s ease,top .32s ease,width .32s ease,height .32s ease}
      #__kw_layer.punching #__kw_ring{opacity:0 !important}
      #__kw_chapter{position:fixed;right:22px;top:18px;z-index:40;display:flex;align-items:center;gap:12px;padding:9px 18px 10px 14px;
        border-radius:12px;background:#1f2a26;color:#fff;font-size:24px;font-weight:600;letter-spacing:-.005em;
        box-shadow:0 6px 20px rgba(0,0,0,.18);opacity:0;transform:translateY(-10px);transition:opacity .3s ease,transform .3s ease}
      #__kw_chapter.on{opacity:1;transform:none}
      #__kw_chapter b{display:block;width:6px;height:26px;border-radius:3px;background:#d98a6a}
      #__kw_caption{position:fixed;left:50%;bottom:26px;z-index:50;max-width:none;width:max-content;white-space:nowrap;
        transform:translateX(-50%);padding:8px 20px 10px;border-radius:10px;background:rgba(20,28,25,.86);color:#fff;
        font-size:28px;line-height:1.3;font-weight:500;text-align:center;opacity:0;transition:opacity .12s ease}
      #__kw_caption.on{opacity:1}
      #__kw_caption.top{bottom:auto;top:86px}
      #__kw_note{position:fixed;left:0;top:0;z-index:40;box-sizing:border-box;padding:9px 12px 10px;border-radius:12px;
        background:#fffaf2;color:#1f2a26;border:2px solid #d98a6a;font-size:16px;line-height:1.3;font-weight:500;
        box-shadow:0 6px 20px rgba(0,0,0,.14);opacity:0;transform:translateY(-8px);transition:opacity .3s ease,transform .3s ease}
      #__kw_note.on{opacity:1;transform:none}
      #__kw_cursor.off{visibility:hidden}`;
    document.documentElement.appendChild(style);
    const layer = document.createElement("div");
    layer.id = "__kw_layer";
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("popover", "manual");
    document.documentElement.appendChild(layer);
    const raise = () => {
      try {
        if (layer.matches(":popover-open")) layer.hidePopover();
        layer.showPopover();
      } catch {
        // No popover support: fall back to a plain fixed layer (still above everything but modal dialogs).
        layer.removeAttribute("popover");
        layer.style.zIndex = "2147483646";
      }
    };
    raise();
    new MutationObserver((ms) => {
      if (ms.some((m) => m.target.nodeName === "DIALOG")) raise();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["open"], subtree: true });
    const el = (id) => {
      const d = document.createElement("div");
      d.id = id;
      layer.appendChild(d);
      return d;
    };
    const dim = el("__kw_dim");
    const ring = el("__kw_ring");
    const chapter = el("__kw_chapter");
    const note = el("__kw_note");
    const caption = el("__kw_caption");
    const c = el("__kw_cursor");
    // Hidden over the title and end cards (__kwCursor(false)), so no stray cursor sits on them. Kept across page
    // loads like the position.
    if (window.__kwCursorOff) c.classList.add("off");
    window.__kwCursor = (on) => {
      window.__kwCursorOff = !on;
      c.classList.toggle("off", !on);
    };
    const pos = window.__kwCursorPos ?? { x: -100, y: -100 };
    const place = (x, y) => {
      window.__kwCursorPos = { x, y };
      c.style.transform = `translate(${x}px, ${y}px)${c.classList.contains("down") ? " scale(.85)" : ""}`;
    };
    place(pos.x, pos.y);
    addEventListener("mousemove", (e) => place(e.clientX, e.clientY), true);
    addEventListener(
      "mousedown",
      (e) => {
        c.classList.add("down");
        place(e.clientX, e.clientY);
        const r = document.createElement("div");
        r.className = "__kw_ripple";
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        layer.appendChild(r);
        setTimeout(() => r.remove(), 700);
      },
      true,
    );
    addEventListener("mouseup", () => c.classList.remove("down"), true);

    // Highlight ring: follows its element every frame (so it stays put while the page scrolls) and glides when it
    // moves to a new element. Kept clear of the sync marker in the bottom-right corner.
    let ringEl = null;
    let ringEl2 = null;
    let ringPad = 8;
    let ringTimer = 0;
    const placeRing = () => {
      const r = ringEl.getBoundingClientRect();
      const r2 = ringEl2?.isConnected ? ringEl2.getBoundingClientRect() : r;
      const x0 = Math.max(4, Math.min(r.left, r2.left) - ringPad);
      const y0 = Math.max(4, Math.min(r.top, r2.top) - ringPad);
      const x1 = Math.min(innerWidth - 26, Math.max(r.right, r2.right) + ringPad);
      const y1 = Math.min(innerHeight - 26, Math.max(r.bottom, r2.bottom) + ringPad);
      Object.assign(ring.style, { left: `${x0}px`, top: `${y0}px`, width: `${Math.max(0, x1 - x0)}px`, height: `${Math.max(0, y1 - y0)}px` });
    };
    window.__kwRing = (target, pad = 8, to = null) => {
      ringPad = pad;
      clearTimeout(ringTimer);
      if (target && ringEl) {
        ring.classList.add("move");
        ringTimer = setTimeout(() => ring.classList.remove("move"), 380);
      }
      ringEl = target ?? null;
      ringEl2 = to;
      if (ringEl) placeRing();
      ring.style.opacity = ringEl ? "1" : "0";
    };
    const tick = () => {
      if (ringEl && !ringEl.isConnected) window.__kwRing(null);
      else if (ringEl) placeRing();
      // Captions step out of the way when the cursor works near the bottom of the screen, unless the shot pins them
      // to the bottom (__kwCaptionsPinned: its top holds a heading the bar would cover).
      const p = window.__kwCursorPos;
      const up = !window.__kwCaptionsPinned && !!p && p.y > innerHeight - 150 && p.x > 150 && p.x < innerWidth - 150;
      caption.classList.toggle("top", up);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Punch-in: a screenshot of the target (taken by the recorder) laid exactly over it, then zoomed up around its
    // centre with the page dimmed behind it, held, and zoomed back. Clamped inside the frame, clear of the corner.
    window.__kwPunch = (src, clip, scale, hold) =>
      new Promise((done) => {
        const img = new Image();
        img.className = "__kw_punch";
        Object.assign(img.style, { left: `${clip.x}px`, top: `${clip.y}px`, width: `${clip.width}px`, height: `${clip.height}px` });
        img.onload = () => {
          const M = 20;
          const s = Math.max(1, Math.min(scale, (innerWidth - 2 * M - 6) / clip.width, (innerHeight - 2 * M - 10) / clip.height));
          const w = clip.width * s;
          const h = clip.height * s;
          const left = Math.max(M, Math.min(clip.x + clip.width / 2 - w / 2, innerWidth - 28 - w));
          const top = Math.max(M, Math.min(clip.y + clip.height / 2 - h / 2, innerHeight - 30 - h));
          layer.appendChild(img);
          layer.classList.add("punching");
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              dim.style.opacity = "1";
              img.style.transform = `translate(${left - clip.x}px, ${top - clip.y}px) scale(${s})`;
            }),
          );
          setTimeout(() => {
            img.style.transform = "none";
            dim.style.opacity = "0";
            setTimeout(() => {
              img.remove();
              layer.classList.remove("punching");
              done();
            }, 420);
          }, 400 + hold);
        };
        img.onerror = () => done();
        img.src = src;
      });

    // Chapter label (top right, opaque) for the first seconds of a shot. At the top because the bottom of the frame
    // holds the burned-in captions, and a lower-third label would collide with them.
    // On the right because the top left holds the Kinwise logo (the caregiver sidebar and the patient and public top
    // bars), which a top-left label used to cover; the top right holds page actions, covered for about 2.8 s.
    let chapterTimer = 0;
    window.__kwChapter = (title, ms = 2800) => {
      clearTimeout(chapterTimer);
      chapter.innerHTML = "<b></b>";
      chapter.appendChild(document.createTextNode(title));
      chapter.classList.add("on");
      chapterTimer = setTimeout(() => chapter.classList.remove("on"), ms);
    };

    // On-screen note (a shot's `note`): a short remark, not spoken and not in the .srt, placed at `at` ({ left, top,
    // width } in px), a spot the shot has measured to be free of app content (showNote). Returns the note's bottom
    // edge, so the caller can check it still fits there.
    let noteTimer = 0;
    window.__kwNote = (text, ms = 5000, at = null) => {
      clearTimeout(noteTimer);
      if (!text || !at) return note.classList.remove("on"), 0;
      Object.assign(note.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px` });
      note.textContent = text;
      note.classList.add("on");
      noteTimer = setTimeout(() => note.classList.remove("on"), ms);
      return at.top + note.offsetHeight;
    };

    // Burned-in captions: [{ start, end, text }] in seconds from now (the same chunks as the .srt).
    let captionTimers = [];
    window.__kwCaptions = (cues) => {
      captionTimers.forEach(clearTimeout);
      captionTimers = [];
      caption.classList.remove("on");
      for (const q of cues) {
        captionTimers.push(
          setTimeout(() => {
            caption.textContent = q.text;
            caption.classList.add("on");
          }, Math.max(0, q.start * 1000)),
        );
      }
      // Chunks follow each other without a gap; the bar only fades after the shot's last one.
      if (cues.length) captionTimers.push(setTimeout(() => caption.classList.remove("on"), cues[cues.length - 1].end * 1000));
    };
    // Sync marker: a 10x10 block in the bottom-right corner whose colour changes at every timing event, so the
    // post-processing can find each event in the recorded frames (Playwright's screencast does not play back at
    // wall-clock speed). It is painted out of the final video with ffmpeg delogo.
    const m = document.createElement("div");
    m.id = "__kw_sync";
    m.setAttribute("aria-hidden", "true");
    m.style.cssText = "position:fixed;left:1428px;top:888px;width:10px;height:10px;z-index:2147483647;pointer-events:none;background:#000";
    document.documentElement.appendChild(m);
    let idx = -1;
    try {
      idx = Number(sessionStorage.getItem("__kw_sync") ?? "-1");
    } catch {
      /* ignore */
    }
    const COLORS = ["#ff0000", "#00ff00", "#0000ff", "#00ffff", "#ff00ff", "#ffff00"];
    window.__kwSync = (i) => {
      try {
        sessionStorage.setItem("__kw_sync", String(i));
      } catch {
        /* ignore */
      }
      m.style.background = i < 0 ? "#000" : COLORS[i % COLORS.length];
    };
    window.__kwSync(idx);
  };
  if (document.documentElement) install();
  document.addEventListener("DOMContentLoaded", install);
  // window.print() would open a native dialog; the recording only needs the button press.
  window.print = () => {
    window.__kwPrinted = (window.__kwPrinted ?? 0) + 1;
  };
}

async function showCard(page, html) {
  await page.evaluate((inner) => {
    document.getElementById("__kw_card")?.remove();
    const d = document.createElement("div");
    d.id = "__kw_card";
    d.setAttribute("aria-hidden", "true");
    d.style.cssText =
      "position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;" +
      "background:var(--bg,#f7f5ef);color:var(--ink,#1f2a26);font-family:var(--font-sans,system-ui);opacity:0;transition:opacity .6s ease";
    d.innerHTML = inner;
    document.documentElement.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => (d.style.opacity = "1")));
  }, html);
  await sleep(700);
}

async function hideCard(page) {
  await page.evaluate(() => {
    const d = document.getElementById("__kw_card");
    if (!d) return;
    d.style.opacity = "0";
    setTimeout(() => d.remove(), 650);
  });
  await sleep(650);
}

const LOGO =
  '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" rx="10" fill="#25584a"/>' +
  '<path d="M9 23h6l3-7 5 13 4-9 2 3h6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Hook card: the problem in one sentence, with its source (kb-src/research/market-evidence.md row 7, checked by
// checkHookSources), then the CDC falls figure (row 4) as a second line. It is on screen for the hook shot only
// (about 6 s). The card goes up about a second before the clock starts; the second line stays hidden until
// ACTIONS.hook adds the "in" class as the narration reaches "the doctor never being told", so it lands after the
// first statistic has been read and stays up for the rest of the card. "Could have been eased" is Gandhi's
// "ameliorable" (an event whose severity or duration could have been reduced), and "were linked to" is no stronger
// than the paper's "attributed to"; the card names the term in its source line so a reader can look it up. The
// visible cursor is hidden while the card is up (main), so nothing stray sits on it.
export const HOOK_CARD = `
  <style>@keyframes __kw_in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    #__kw_hook2{opacity:0} #__kw_hook2.in{animation:__kw_in .6s ease both}</style>
  <div style="max-width:1120px;padding:0 72px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:44px">${LOGO}
      <span style="font-size:30px;font-weight:600;letter-spacing:-.01em">Kinwise<span style="color:#a9573a">.</span></span></div>
    <p style="font-family:var(--font-serif,Georgia);font-size:58px;line-height:1.12;margin:0 0 18px;letter-spacing:-.01em">
      More than <b style="color:#25584a">a third</b> of medicine side effects that could have been eased were linked to
      <b style="color:#25584a">the doctor never being told</b>.</p>
    <p style="font-size:22px;color:var(--ink-muted,#5e6a64);margin:0 0 40px">Gandhi et al., NEJM 2003 &middot; 4 Boston
      primary-care practices &middot; 37% of ameliorable adverse drug events</p>
    <div id="__kw_hook2">
      <p style="font-family:var(--font-serif,Georgia);font-size:38px;line-height:1.15;margin:0 0 12px">
        Of older adults who fall, <b style="color:#a9573a">less than half</b> tell their doctor.</p>
      <p style="font-size:22px;color:var(--ink-muted,#5e6a64);margin:0">CDC, Facts About Older Adult Falls &middot; cdc.gov/falls</p>
    </div>
  </div>`;

const END_AI_NOTE = USE_AI
  ? "On-device model (Qwen2.5 3B Instruct, WebGPU) used only for the review explanation (shown only if it passes the source " +
    "check) and the Ask Kinwise draft; the visit brief uses the standard template."
  : "Template mode shown (on-device model not loaded).";

export const END_CARD = `
  <div style="max-width:1120px;padding:0 64px;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:14px;margin-bottom:26px">${LOGO}
      <span style="font-size:34px;font-weight:600">Kinwise<span style="color:#a9573a">.</span></span></div>
    <p style="font-family:var(--font-serif,Georgia);font-size:34px;line-height:1.2;margin:0 0 34px;color:var(--ink-muted,#5e6a64)">
      Notice what changes after a medicine change, <i style="color:#25584a">and bring a clear question to the visit.</i></p>
    <p style="font-size:34px;font-weight:700;margin:0 0 10px;color:#a9573a">${END_CTA} &rarr;</p>
    <p style="font-size:44px;font-weight:700;margin:0 0 8px;color:#25584a">${LIVE_URL}</p>
    <p style="font-size:22px;margin:0 0 30px;color:var(--ink-muted,#5e6a64)">No sign-up &middot; fictional data</p>
    <p style="font-size:24px;margin:0 0 10px">Code: <b>${CODE_URL}</b></p>
    <p style="font-size:24px;margin:0 0 30px">${TEAM_LINE}</p>
    <p style="font-size:17px;color:var(--ink-muted,#5e6a64);margin:0">Fictional demo data. Not medical advice. Knowledge base not yet
      clinician-reviewed. ${END_AI_NOTE}</p>
  </div>`;

/** Move the visible cursor smoothly to the centre of `locator` (scrolling it into view first). */
async function moveTo(page, locator, { steps = 22, scroll = true } = {}) {
  await mark(page);
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("moveTo: element has no box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps });
  await sleep(120);
  return { x, y };
}

async function clickOn(page, locator, opts) {
  await moveTo(page, locator, opts);
  await sleep(150);
  await locator.click();
  await sleep(250);
}

/** Smooth scroll so `locator` sits near the top of its scroll container (offset px from the top). */
async function scrollTo(page, locator, offset = 24) {
  await locator.evaluate(
    (el, off) =>
      new Promise((done) => {
        const sc = (() => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
          }
          return document.scrollingElement;
        })();
        const isDoc = sc === document.scrollingElement;
        const top0 = sc.scrollTop;
        const rel = el.getBoundingClientRect().top - (isDoc ? 0 : sc.getBoundingClientRect().top);
        const target = Math.max(0, Math.min(top0 + rel - off, sc.scrollHeight - sc.clientHeight));
        const dist = target - top0;
        const ms = Math.min(1400, Math.max(450, Math.abs(dist) * 0.9));
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          sc.scrollTop = top0 + dist * e;
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    offset,
  );
  await sleep(200);
}

/** `s` as a literal inside a RegExp ("94.2" → "94\.2"). */
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function expectText(locator, rx, what) {
  const t = (await locator.innerText({ timeout: 10000 })).replace(/\s+/g, " ");
  if (!rx.test(t)) {
    const msg = `on-screen check failed (${what}): ${rx} not found in "${t.slice(0, 300)}…"`;
    if (process.env.ALLOW_MISMATCH) console.warn(`WARN ${msg}`);
    else throw new Error(msg);
  }
}

/**
 * Draw the highlight ring around the first element of `locator` (null clears it), or around the span from it to
 * `to` (e.g. a run of table rows). It follows the element(s) on scroll.
 */
async function ring(page, locator, pad = 8, to = null) {
  if (!locator) return page.evaluate(() => window.__kwRing?.(null));
  const toHandle = to ? await to.first().elementHandle() : null;
  await locator.first().evaluate((el, [p, el2]) => window.__kwRing?.(el, p, el2), [pad, toHandle]);
  await toHandle?.dispose();
}

/**
 * Punch-in on `locator`: screenshot its box (at most `maxHeight` px tall, inside the frame), lay the image over it
 * and zoom it to `scale` for `hold` ms, then back. Resolves once the zoom-out has finished. The cursor and ring are
 * left out of the screenshot (for the one frame it takes), so they are not frozen into the zoomed image.
 */
async function punch(page, locator, { scale = 1.3, hold = 1600, pad = 10, maxHeight = 620 } = {}) {
  const box = await locator.first().boundingBox();
  if (!box) throw new Error("punch: element has no box");
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  const clip = {
    x,
    y,
    width: Math.min(VIEW.width - 30, Math.ceil(box.x + box.width + pad)) - x,
    height: Math.min(VIEW.height - 30, Math.ceil(box.y + box.height + pad), y + maxHeight) - y,
  };
  if (clip.width < 8 || clip.height < 8) throw new Error("punch: element is outside the frame");
  const png = await page.screenshot({
    clip,
    caret: "initial",
    style: "#__kw_cursor,.__kw_ripple,#__kw_ring{visibility:hidden !important}",
  });
  await page.evaluate(([src, c, s, h]) => window.__kwPunch?.(src, c, s, h), [`data:image/png;base64,${png.toString("base64")}`, clip, scale, hold]);
}

/**
 * Put up a shot's on-screen `note` in the gap between two elements that stay put on screen (`below` ends above the
 * gap, `above` starts under it), left-aligned with and as wide as `below`. The overview shot uses the empty part of
 * the caregiver sidebar, between the main nav and the "How Kinwise works" footer, so the note covers no app text.
 * Stops the run if the note would not fit in the gap (it would overlap what is under it).
 */
async function showNote(page, text, below, above, ms = 5000) {
  const a = await below.first().boundingBox();
  const b = await above.first().boundingBox();
  if (!a || !b) throw new Error("showNote: an anchor element has no box");
  const at = { left: Math.round(a.x), top: Math.round(a.y + a.height + 10), width: Math.round(a.width) };
  const bottom = await page.evaluate(([t, m, p]) => window.__kwNote?.(t, m, p) ?? 0, [text, ms, at]);
  if (!(bottom > at.top) || bottom > b.y - 4) {
    await page.evaluate(() => window.__kwNote?.(null));
    throw new Error(`showNote: the note (${at.top}–${bottom} px) does not fit above ${Math.round(b.y)} px; move or shorten it`);
  }
}

let TARGETS = 0;
// Targets are tagged with a space-separated list of ids, so one element can be the target of two locators (e.g. the
// first and last row of a run that is a single row) without the second tag replacing the first. (The tagging runs
// inside the page, so each evaluate below spells it out.)
const targetLocator = (page, id) => page.locator(`[data-kw-target~="${id}"]`);

/**
 * The innermost element under `scope` whose text matches every pattern, as a locator (tagged with a data attribute).
 * Used for highlight targets so they survive markup changes as long as the words stay on screen.
 */
async function innermost(scope, patterns, what) {
  const id = `kw${++TARGETS}`;
  const found = await scope.first().evaluate(
    (root, [pats, tag]) => {
      const rx = pats.map(([s, f]) => new RegExp(s, f));
      let best = null;
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const t = (el.textContent ?? "").replace(/\s+/g, " ");
        if (!rx.every((r) => r.test(t)) || !el.getClientRects().length) continue;
        if (!best || t.length <= best.len) best = { el, len: t.length };
      }
      if (best) best.el.setAttribute("data-kw-target", `${best.el.getAttribute("data-kw-target") ?? ""} ${tag}`.trim());
      return !!best;
    },
    [patterns.map((r) => [r.source, r.flags]), id],
  );
  if (!found) throw new Error(`no element on screen matches ${patterns.join(" + ")} (${what})`);
  return targetLocator(scope.page(), id);
}

/** The row (table row, list item or ARIA row) around `locator`, or the element itself, as a tagged locator. */
async function rowOf(locator) {
  const id = `kw${++TARGETS}`;
  await locator.first().evaluate((el, tag) => {
    const row = el.closest("tr, li, [role='row']") ?? el;
    row.setAttribute("data-kw-target", `${row.getAttribute("data-kw-target") ?? ""} ${tag}`.trim());
  }, id);
  return targetLocator(locator.page(), id);
}

/** Wait until the narration of `shot` reaches `phrase` (estimated from its position in the text), less `early` s. */
async function atPhrase(shot, phrase, early = 0.3) {
  const i = shot.narration.indexOf(phrase);
  if (i < 0) throw new Error(`atPhrase: "${phrase}" is not in the ${shot.id} narration`);
  const at = shot.clockStart + LEAD_IN + (shot.narrDur * i) / shot.narration.length - early;
  const wait = at - SYNC.clock();
  if (wait > 0) await sleep(wait * 1000);
}

/**
 * Dismiss every toast on screen (with each toast's own "Dismiss notification" button, clicked in the DOM so the
 * visible cursor does not jump to the corner) and wait until none is left, so no toast covers what is ringed next.
 * Toasts also close on their own after 4.5 s (src/ui/components/Toast.tsx), so the wait is bounded either way.
 */
async function clearToasts(page) {
  await page.evaluate(() => document.querySelectorAll(".ui-toast__close").forEach((b) => b.click())).catch(() => {});
  await page
    .waitForFunction(() => ![...document.querySelectorAll(".ui-toast")].some((t) => t.getClientRects().length > 0), null, { timeout: 6000 })
    .catch(() => console.warn("WARN: a toast was still on screen after 6 s"));
  await sleep(150);
}

async function settle(page) {
  await page.waitForFunction(() => document.querySelector("#main-content h1, main h1"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await sleep(250);
}

/** Click a caregiver sidebar link by its visible name and wait for the route. */
async function nav(page, name, hashRx, h1Rx) {
  const link = page.getByRole("link", { name, exact: true }).first();
  await clickOn(page, link, { scroll: false });
  await page.waitForURL(hashRx, { timeout: 10000 });
  await page.locator("#main-content h1, main h1").filter({ hasText: h1Rx }).first().waitFor({ timeout: 15000 });
  await sleep(250);
}

// Loading placeholders: the route-level fallback (ViewLoading in src/app/layouts/ViewBoundary.tsx) and the Skeleton
// component (src/ui/components/Display.tsx).
const SKELETON_SELECTOR = ".view-loading, .ui-skeleton";

/**
 * Wait until the page's main heading is on screen and no loading skeleton is visible. Every shot waits for this
 * before its chapter label and narration start, so the narration never plays over a half-loaded page; a page that
 * never gets there stops the run.
 */
async function waitForScreen(page, what) {
  try {
    await page.waitForFunction(
      (skeletons) => {
        const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
        const h1 = document.querySelector("#main-content h1, main h1");
        return !!h1 && shown(h1) && ![...document.querySelectorAll(skeletons)].some(shown);
      },
      SKELETON_SELECTOR,
      { timeout: 20000 },
    );
  } catch {
    throw new Error(`${what}: the page's main heading did not appear, or a loading skeleton stayed on screen`);
  }
}

/**
 * Off camera (before the clock starts): open every route the video visits once, in this page, so each lazily loaded
 * view is already in memory and never shows its loading skeleton on camera. Only in-app navigation (hash changes and
 * the app's own buttons) is used, so nothing reloads. Nothing is clicked inside the views, so no record changes.
 * The visit brief is the exception: opening it builds and saves a first brief, so it is not opened here, only its
 * module fetched (dev server only); the brief's ENTER step then waits out its short loading state off the narration.
 */
async function warmRoutes(page) {
  await page.evaluate(() => import("/src/views/caregiver/VisitBrief.tsx").catch(() => {})).catch(() => {});
  const visit = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await waitForScreen(page, `warm-up ${hash}`);
  };
  await page.getByRole("button", { name: /Try as Margaret/ }).click();
  await page.waitForURL(/#\/p\/today/);
  await waitForScreen(page, "warm-up #/p/today");
  await visit("#/p/meds");
  await visit("#/p/today");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.getByRole("button", { name: /Try as Alex/ }).click();
  await page.waitForURL(/#\/c\/overview/);
  for (const r of ["#/c/overview", "#/c/review", "#/c/timeline", "#/c/ask", "#/how-it-works"]) await visit(r);
  await visit("#/c/overview");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.getByRole("button", { name: /Try as Alex/ }).waitFor({ timeout: 10000 });
}

// ---------------------------------------------------------------------------------------------------------------
// Shot actions. Each receives { page, base } and must leave the screen in the state the narration describes.

const STORY =
  "Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. " +
  "Slept badly. My granddaughter Sofia fell off her bike, poor thing. No ankle swelling.";

const ACTIONS = {
  async hook({ page, shot }) {
    // The card is put up before the clock starts (see main). Fade in the CDC line once the first statistic is read.
    await atPhrase(shot, "the doctor never being told", 0.4);
    await page.evaluate(() => document.getElementById("__kw_hook2")?.classList.add("in"));
  },

  async who({ page, shot }) {
    await hideCard(page);
    // What Kinwise is: the Welcome headline says it in the same words as the first sentence.
    const headline = page.locator("main h1, #main-content h1").first();
    await expectText(headline, /Notice what changes after a medicine change/i, "Welcome headline");
    await ring(page, headline, 10);
    await expectText(page.locator("body"), /Margaret Rivera \(78\) and her daughter Alex are fictional/i, "persona line");
    // "eight medicines" is checked on screen in the review shot ("checked Margaret's 8 medicines").
    const persona = page.getByText(/Margaret Rivera \(78\)/).first();
    await atPhrase(shot, "Meet Margaret", 0.5);
    await page.evaluate(() => window.__kwCursor?.(true));
    await moveTo(page, persona, { steps: 26 });
    await ring(page, persona, 6);
    // Into Margaret's view and her own medicine list while the sleeping pill is mentioned: the lorazepam card says
    // "Prescribed by Urgent care". ENTER.checkin then goes back to Today, off the narration.
    const margaret = page.getByRole("button", { name: /Try as Margaret/ });
    await atPhrase(shot, "Urgent care", 1.6);
    await moveTo(page, margaret, { steps: 14 });
    await ring(page, null);
    await clickOn(page, margaret, { scroll: false, steps: 1 });
    await page.waitForURL(/#\/p\/today/);
    await waitForScreen(page, "Margaret's Today");
    const medsTab = page.getByRole("navigation", { name: "Your pages" }).getByRole("link", { name: "My medicines" });
    await clickOn(page, medsTab, { scroll: false, steps: 12 });
    await page.waitForURL(/#\/p\/meds/);
    await waitForScreen(page, "Margaret's medicines");
    const lorazepam = page.locator("li.pt-med").filter({ hasText: /Lorazepam/ }).first();
    await expectText(lorazepam, /Prescribed by Urgent care/i, "lorazepam prescribed by urgent care");
    await scrollTo(page, lorazepam, 110);
    const prescriber = lorazepam.getByText("Urgent care", { exact: true }).first();
    await moveTo(page, prescriber, { steps: 16, scroll: false });
    await ring(page, lorazepam, 6);
  },

  async checkin({ page }) {
    const box = page.getByRole("textbox", { name: /Tell me about/ });
    await clickOn(page, box, { scroll: false, steps: 1 });
    await ring(page, box, 6);
    await box.pressSequentially(STORY, { delay: 10 });
    await sleep(300);
    const fill = page.getByRole("button", { name: "Fill in my check-in" });
    await moveTo(page, fill, { steps: 18 });
    await ring(page, fill, 6);
  },

  async heard({ page, shot }) {
    await ring(page, null);
    await page.getByRole("button", { name: "Fill in my check-in" }).click();
    const heard = page.locator("#pt-heard-title").locator("xpath=ancestor::section[1]");
    await heard.waitFor({ timeout: 8000 });
    await sleep(900);
    await scrollTo(page, page.locator("#pt-heard-title"), 120);
    await expectText(heard, /woozy.*Dizzy/i, "woozy → Dizzy");
    await expectText(heard, /nearly went over.*Near-fall/i, "near-fall");
    await expectText(heard, /fell off her bike.*Someone else/i, "Sofia = someone else");
    await expectText(heard, /Ankle swelling No/i, "ankle swelling = No");
    // Ring each highlighted span as the narration names it.
    for (const [phrase, text] of [
      ["Woozy", "woozy"],
      ["nearly went over", "nearly went over"],
      ["no ankle swelling", /No ankle swelling/],
      ["Sofia's fall", /fell off her bike/],
    ]) {
      await atPhrase(shot, phrase, 0.4);
      const span = heard.getByText(text, typeof text === "string" ? { exact: true } : undefined).first();
      await moveTo(page, span, { steps: 18, scroll: false });
      await ring(page, span, 5);
    }
    // "Things I didn't add" lists Sofia's fall with the reason.
    await atPhrase(shot, "is set aside", 0.3);
    const skipped = heard.getByText(/Things I didn.t add/).first();
    await scrollTo(page, skipped, 330);
    await expectText(heard, /that's about someone else/i, "skipped reason");
    const reason = heard.getByText(/that's about someone else/i).first();
    await moveTo(page, reason, { steps: 18, scroll: false });
    await ring(page, reason, 6);
    // "Margaret confirms each answer": she accepts the reading's best guess (the sleep card, "My best guess — please
    // check") with one "Yes, that's right" click, on camera. Nothing is saved: the check-in is never submitted.
    await atPhrase(shot, "Margaret confirms", 0.5);
    const yes = heard.getByRole("button", { name: /^Yes, that.s right/ }).first();
    const before = await heard.getByRole("button", { name: /^Yes, that.s right/ }).count();
    if (!before) throw new Error("heard: no 'Yes, that's right' button to confirm an answer with");
    await scrollTo(page, yes, 420);
    await moveTo(page, yes, { steps: 18, scroll: false });
    await ring(page, yes, 6);
    await clickOn(page, yes, { scroll: false, steps: 1 });
    await page.waitForFunction(
      ([n]) =>
        [...document.querySelectorAll("button")].filter((b) => /^Yes, that.s right/.test(b.getAttribute("aria-label") ?? b.textContent ?? "")).length < n,
      [before],
      { timeout: 3000 },
    );
  },

  async overview({ page, shot }) {
    // ENTER.overview has already switched to Alex's view. Only visible elements are checked and ringed: the engine's
    // full sentence ("Dizziness was recorded on 9 of 14 answered days …") sits in the collapsed "How reliable is
    // this?" disclosure, so the spoken counts are checked on the before/after bars the viewer actually sees.
    await page.getByRole("heading", { name: /What Kinwise noticed/ }).waitFor({ timeout: 15000 });
    const main = page.locator("#main-content, main").first();
    const headline = page.getByRole("heading", { name: /recorded more often since Lorazepam/ }).first();
    await expectText(headline, /^Dizziness\b.*recorded more often since Lorazepam/, "overview headline");
    const bars = await innermost(main, [/before vs after/i, /9 of 14 days/, /2 of 19 days/], "before/after bars");
    await expectText(bars, /answered days only/, "bars count answered days only");
    await expectText(bars, /Dizziness\b.*?Before 2 of 19 days\s*After 9 of 14 days/, "dizziness bars 2 of 19 → 9 of 14");
    const falls = page.getByText(/1 fall \(.*\) and 2 near-falls/).first();
    const fallsLine = falls.locator("xpath=..");
    await expectText(fallsLine, /1 fall .* 2 near-falls .* on 14 answered days/, "falls line");
    await scrollTo(page, page.getByRole("heading", { name: /What Kinwise noticed/ }), 20);
    // The hand-off note, in the empty part of the sidebar (under Settings, over the "How Kinwise works" footer).
    await showNote(page, shot.note, page.locator(".cg-sidebar .cg-nav"), page.locator(".cg-sidebar__footer"));
    await atPhrase(shot, "dizziness was recorded", 0.5);
    await moveTo(page, headline, { steps: 24, scroll: false });
    await ring(page, headline, 8);
    // The before/after bars ("9 of 14 days"), ringed as the count is said and zoomed while the comparison is spoken.
    await atPhrase(shot, "9 of 14 answered days", 0.3);
    await moveTo(page, bars, { steps: 18, scroll: false });
    await ring(page, bars, 6);
    await atPhrase(shot, "compared with 2 of 19", 0.8);
    await punch(page, bars, { scale: 1.45, hold: 1300 });
    await atPhrase(shot, "One fall", 0.4);
    await moveTo(page, falls, { steps: 20, scroll: false });
    await ring(page, fallsLine, 6);
    await punch(page, fallsLine, { scale: 1.35, hold: 1300 });
    await atPhrase(shot, "It shows a change", 0.4);
    const caveat = page.getByText(/Shows a change in what was recorded, not what caused it/).first();
    await moveTo(page, caveat, { steps: 20, scroll: false });
    await ring(page, caveat, 6);
    await punch(page, caveat, { scale: 1.6, hold: 1500 });
  },

  async timeline({ page, shot }) {
    // ENTER.timeline has opened Symptoms & timeline, and CHOOSE.timeline has already checked the dizziness row, the
    // "of 9 compared diary items" lead and (for `runs`) the runs check. The row is found by its numbers and test
    // name, not by its size words, which other work may rename.
    const cmp = page.locator('[data-tour="timeline-compare"]');
    await scrollTo(page, cmp, 16);
    await sleep(200);
    const row = await rowOf(cmp.getByText(/Fisher.s exact test, p = 0\.0023/).first());
    await moveTo(page, cmp.getByText("9 of 14 days").first(), { steps: 20, scroll: false });
    await ring(page, row, 6);
    // Zoom the row (before/after bars and the test) while the test and p-value are spoken.
    await atPhrase(shot, "Fisher's exact test", 0.6);
    await punch(page, row, { scale: 1.35, hold: 1500, maxHeight: 200 });
    if (shot.variant === "runs" && shot.runsOnScreen) {
      // The runs check is on the row itself: ring it as it is named.
      await atPhrase(shot, "it still holds", 0.3);
      const runs = row.getByText(/runs check/i).first();
      await moveTo(page, runs, { steps: 16, scroll: false });
      await ring(page, runs, 5);
    }
    // "With nine items compared": the lead line "N of 9 compared diary items … changed enough to be flagged", which
    // ends with the card's caveat, ringed and zoomed while the chance rate and "it stays a question" are said.
    await atPhrase(shot, "With nine items compared", 0.4);
    const lead = cmp.locator(".cg-tl-compare__lead").first();
    await moveTo(page, lead, { steps: 18, scroll: false });
    await ring(page, lead, 6);
    await atPhrase(shot, "more than one in ten", 0.3);
    await punch(page, lead, { scale: 1.4, hold: 1800, maxHeight: 160 });
  },

  async review({ page, shot }) {
    // ENTER.review has opened Medication review.
    const main = page.locator("#main-content");
    await expectText(main, /checked Margaret.s 8 medicines/, "8 medicines");
    await expectText(main, /Anticholinergic burden Total score 7/, "ACB 7");
    const acb = await innermost(main, [/Anticholinergic burden/, /Total score/], "ACB card");
    await moveTo(page, page.getByText("Anticholinergic burden", { exact: true }).first(), { steps: 22, scroll: false });
    await ring(page, acb, 4);
    await atPhrase(shot, "where she scores 7", 0.5);
    await punch(page, acb, { scale: 1.3, hold: 1400, maxHeight: 420 });
    await atPhrase(shot, "fall-risk lists", 0.3);
    await moveTo(page, page.getByText("Medicines linked to falls", { exact: true }).first(), { steps: 22, scroll: false });
    await ring(page, await innermost(main, [/Medicines linked to falls/, /fall-risk lists/], "fall-risk card"), 4);
    await sleep(500);
    await moveTo(page, page.getByText("Beers Criteria prompts", { exact: true }).first(), { steps: 22, scroll: false });
    await ring(page, await innermost(main, [/Beers Criteria prompts/, /medicines? appears? in/], "Beers card"), 4);
    await atPhrase(shot, "and possible prescribing cascades", 0.3);
    const card = page.locator('[data-tour="review-finding"]').first();
    await expectText(card, /Amlodipine → ankle swelling → Furosemide/i, "cascade finding first");
    await scrollTo(page, card, 16);
    await ring(page, card.locator("h3").first(), 6);
    if (USE_AI) {
      // Start the on-device explanation now, so it finishes while the rest of this shot plays (about 9 s on the
      // recording laptop); the verify shot shows how it came out.
      const explain = card.getByRole("button", { name: "Explain in simpler words" });
      await explain.waitFor({ timeout: 5000 });
      await clickOn(page, explain);
      await card.getByText(/Writing a simpler version on this device/).waitFor({ timeout: 5000 }).catch(() => {});
    }
    await atPhrase(shot, "Each finding ends", 0.6);
    await clickOn(page, card.getByRole("button", { name: "Why this matters" }), { scroll: false });
    await sleep(300);
    await scrollTo(page, card.getByRole("button", { name: "Why this matters" }), 380);
    const source = card.locator('a[href^="http"]').first();
    await moveTo(page, source, { steps: 20, scroll: false });
    await ring(page, source, 6);
    await sleep(900);
    const question = card.locator(".cg-finding__question-text");
    await moveTo(page, question, { steps: 22, scroll: false });
    await ring(page, question, 8);
  },

  async verify({ page, shot }) {
    // CHOOSE.verify has already read the outcome; show it and the text it was checked against.
    const card = page.locator('[data-tour="review-finding"]').first();
    const ai = card.locator(".cg-finding__ai");
    const note = ai.locator(".cg-ai-note").first();
    if (shot.removedReason && shot.variant.startsWith("removed")) {
      // CHOOSE.verify opened "What the check removed" and picked the line naming its first reason: ring the
      // outcome note, then, as "removed a sentence" is said, zoom the removed item (quoted sentence and reason) when
      // the sentence is neutral, or only its reason line when it is blocked wording or could read like advice
      // (zoomRemovedSentence): the video never magnifies AI text away from the app's "not advice" caution.
      await scrollTo(page, note, 260);
      await moveTo(page, note, { steps: 18, scroll: false });
      await ring(page, note, 6);
      await atPhrase(shot, "and removed a sentence", 0.6);
      const target = shot.removedZoomItem ? shot.removedReason : shot.removedWhy;
      const box = await target.boundingBox();
      if (!box || box.y < 60 || box.y + box.height > VIEW.height - 120) await scrollTo(page, target, 260);
      await moveTo(page, target, { steps: 18, scroll: false });
      await ring(page, target, 6);
      await punch(page, target, { scale: shot.removedZoomItem ? 1.35 : 1.5, hold: 2000, maxHeight: 220 });
      return;
    }
    if (shot.variant === "draft") {
      await expectText(ai, /Checked by code against the finding and the reference text/, "explanation checked line");
      const clinical = card.locator(".cg-finding__clinician");
      if (await clinical.isVisible().catch(() => false)) {
        await moveTo(page, clinical, { steps: 18, scroll: false });
        await ring(page, clinical, 6);
      }
      await atPhrase(shot, "in plain language", 0.5);
      await scrollTo(page, note, 260);
      await moveTo(page, ai.locator(".cg-ai-note__text"), { steps: 18, scroll: false });
      await ring(page, note, 6);
      await punch(page, note, { scale: 1.25, hold: 1500 });
      await atPhrase(shot, "code checks every sentence", 0.3);
      const meta = ai.locator(".cg-ai-note__meta");
      await moveTo(page, meta, { steps: 16, scroll: false });
      await ring(page, meta, 5);
    } else {
      await expectText(ai, BLOCKED_NOTE_ON_SCREEN, "source check blocked the AI wording");
      await scrollTo(page, note, 330);
      await moveTo(page, note, { steps: 18, scroll: false });
      await ring(page, note, 6);
      await punch(page, note, { scale: 1.5, hold: 1600 });
      await atPhrase(shot, "the original text stays", 1.0);
      const plain = card.locator(".cg-finding__plain");
      // Usually still on screen above the note; scroll only if it is not, so the ring gets there in time.
      const box = await plain.boundingBox();
      if (!box || box.y < 60 || box.y + 40 > VIEW.height) await scrollTo(page, plain, 200);
      await moveTo(page, plain, { steps: 18, scroll: false });
      await ring(page, plain, 6);
    }
  },

  async ask({ page, shot }) {
    // ENTER.ask has opened Ask Kinwise.
    await clickOn(page, page.getByRole("button", { name: "How many near-falls since lorazepam started?" }));
    const ans = page.locator(".cg-ask-a").last();
    await ans.waitFor({ timeout: 8000 });
    await expectText(ans, /From the records.*Near-falls were recorded on 2 of 14 answered days/, "Ask near-falls");
    const recordsLine = ans.getByText(/Near-falls were recorded on 2 of 14 answered days/).first();
    await ring(page, recordsLine, 6);
    // Zoom the records answer while its numbers are spoken.
    await atPhrase(shot, "near-falls on 2 of 14", 0.5);
    await punch(page, recordsLine, { scale: 1.4, hold: 1100, maxHeight: 220 });
    if (USE_AI) {
      // The on-device model drafts a short summary under the records answer (about 5 s once warm). The recorder
      // waits for the outcome and stops unless the draft passed the app's checks, so the narration stays true.
      const ai = ans.locator(".cg-ask-ai");
      await ai.waitFor({ timeout: 5000 });
      await ans.locator(".cg-ask-ai--done, .cg-ask-ai--failed, .cg-ask-ai--empty").first().waitFor({ timeout: 60000 });
      const t = (await ai.innerText()).replace(/\s+/g, " ").trim();
      if (!(await ans.locator(".cg-ask-ai--done").count())) throw new Error(`the on-device AI draft did not pass its checks: "${t}"`);
      await expectText(ai, /AI draft · on this device · Qwen2\.5 3B Instruct/, "AI badge");
      await expectText(ai, /Checked against the records/, "AI checked line");
      const draft = t.replace(/^.*?Instruct · [\d.]+ s\s*/, "").replace(/Checked against the records.*$/, "").trim();
      if (BANNED_ON_SCREEN.test(draft)) throw new Error(`AI draft contains banned wording: "${draft}"`);
      shot.aiDraft = t;
      // The AI moment: ring the "AI draft · on this device · Qwen2.5 3B Instruct" header together with the draft's
      // first sentence as the model is named, then the zoom callout the overview, verify and timeline shots use, on
      // the whole "AI draft · on this device" block (header, draft and its check line) as "drafts a short summary" is
      // said, held long enough to read the draft, then ring the "Checked against the records" line as the code check
      // is said. The narration says "a short summary", not "a plainer answer": the draft restates part of the
      // records answer (in the last render it left out the fall), and the records answer above stays the reference.
      const badge = ai.locator(".ui-ai-badge").first();
      const sentence = ai.locator(".cg-ask-sent").first();
      await scrollTo(page, ans, 150);
      await atPhrase(shot, "A three-billion-parameter model", 0.4);
      await moveTo(page, badge, { steps: 18, scroll: false });
      await ring(page, badge, 6, sentence);
      await atPhrase(shot, "drafts a short summary", 0.5);
      await punch(page, ai, { scale: 1.45, hold: 2200, maxHeight: 260 });
      await atPhrase(shot, "code checks every number", 0.3);
      const note = ai.locator(".cg-ask-ai__note").first();
      await moveTo(page, note, { steps: 16, scroll: false });
      await ring(page, note, 6);
      await atPhrase(shot, "Treatment questions", 1.6);
    } else {
      await sleep(700);
    }
    const box = page.getByRole("textbox", { name: /Ask/ });
    await ring(page, null);
    await clickOn(page, box);
    await box.pressSequentially("Should she stop taking the lorazepam?", { delay: 28 });
    await clickOn(page, page.getByRole("button", { name: "Ask", exact: true }), { scroll: false });
    const red = page.locator(".cg-ask-a--redirect").last();
    await red.waitFor({ timeout: 8000 });
    await expectText(red, /question for Margaret.s doctor or pharmacist/i, "redirect");
    await scrollTo(page, red, 260);
    await ring(page, red, 6);
    await sleep(300);
    await clickOn(page, red.getByRole("button", { name: "Add to visit questions" }), { scroll: false });
    await red.getByText("Added to visit questions").waitFor({ timeout: 3000 });
  },

  async brief({ page }) {
    // ENTER.brief has opened the visit brief.
    await clickOn(page, page.getByRole("button", { name: "Use the standard template" }));
    const doc = page.locator('[data-tour="brief-doc"]');
    await doc.waitFor();
    // The "Brief rebuilt" toast (and Ask's "Added to visit questions") sit over the brief's At a glance box: wait
    // until no toast is on screen before the first highlight.
    await page.locator(".ui-toast").filter({ hasText: /Brief rebuilt/ }).first().waitFor({ timeout: 1500 }).catch(() => {});
    await clearToasts(page);
    await expectText(doc, /WHY WE.RE COMING IN/i, "brief sections");
    await expectText(doc, /9\/14/, "brief strip 9/14");
    const noticed = doc.getByText(/What we.ve noticed/i).first();
    await scrollTo(page, noticed, 120);
    await ring(page, noticed, 8);
    await sleep(600);
    // Optional: the "What the check removed" list (AI sentences the claim check dropped) appears only after an AI
    // brief run; this video uses the standard template, so it is usually absent. If it is there, ring it for a
    // moment without opening or narrating it, and carry on either way.
    const removed = page.getByText(/What the check removed/i).first();
    if (await removed.isVisible().catch(() => false)) {
      await scrollTo(page, removed, 200).catch(() => {});
      await ring(page, removed, 6).catch(() => {});
      await sleep(700);
    }
    await ring(page, null);
    await scrollTo(page, page.locator("body"), 0);
    const review = page.getByRole("checkbox", { name: /reviewed this brief/i });
    await clickOn(page, review, { scroll: false });
    await ring(page, review, 10);
    await sleep(300);
    await clickOn(page, page.getByRole("button", { name: "Print / Save as PDF" }), { scroll: false });
    const printed = await page.evaluate(() => window.__kwPrinted ?? 0);
    if (!printed) throw new Error("Print was not reached after marking the brief reviewed");
    const fhir = page.locator('[data-tour="brief-fhir"]');
    await expectText(fhir, /Valid FHIR R4 Bundle · 270 resources/, "FHIR 270 resources");
    await scrollTo(page, fhir, 120);
    const valid = fhir.getByText(/Valid FHIR R4 Bundle/);
    await moveTo(page, valid, { steps: 22, scroll: false });
    await ring(page, valid, 6);
    await sleep(300);
    const preview = fhir.getByText("Preview the JSON");
    if (await preview.count()) {
      await clickOn(page, preview, { scroll: false });
      await sleep(400);
    }
  },

  async evals({ page }) {
    // ENTER.evals has opened How Kinwise works and scrolled to the live evaluation.
    const runNlp = page.getByRole("button", { name: "Run the extraction benchmark now" });
    await clickOn(page, runNlp);
    await page.getByText(/micro-F1 over/).first().waitFor({ timeout: 60000 });
    const held = page.locator(".pub-how-score", { hasText: "Held-out set" });
    await expectText(held, new RegExp(`${EVAL.heldoutStories} stories.*${escapeRx(EVAL.heldoutF1Pct)}%`), `held-out ${EVAL.heldoutF1Pct}% on ${EVAL.heldoutStories}`);
    await scrollTo(page, page.getByText(/Does it hear her correctly/).first(), 120);
    await moveTo(page, held.locator(".pub-how-score__big"), { steps: 22, scroll: false });
    await ring(page, held, 6);
    await sleep(1300);
    const runMed = page.getByRole("button", { name: "Run the medication-review suite" });
    await scrollTo(page, runMed, 260);
    await clickOn(page, runMed, { scroll: false });
    const tile = page.locator(".pub-how-tile", { hasText: "Cases fully passed" });
    await tile.waitFor({ timeout: 60000 });
    await expectText(tile, new RegExp(`${EVAL.medsPassed} of ${EVAL.medsCases}`), `${EVAL.medsPassed} of ${EVAL.medsCases} cases`);
    await scrollTo(page, page.getByText(/Does it flag what the criteria say/).first(), 120);
    await moveTo(page, tile, { steps: 20, scroll: false });
    await ring(page, tile, 6);
  },

  async honesty({ page, shot }) {
    await ring(page, null);
    const sec = await honestySection(page);
    const planned = sec.getByText(/^Planned$/);
    if (!(await planned.first().isVisible().catch(() => false))) {
      const trigger = sec.locator('summary, button[aria-expanded="false"]').first();
      if (await trigger.count()) {
        await scrollTo(page, trigger, 200);
        await clickOn(page, trigger, { scroll: false });
        await sleep(300);
      }
    }
    await expectText(sec, /Working/, "status: working");
    await expectText(sec, /Partial/, "status: partial");
    await expectText(sec, /Planned/, "status: planned");
    // The three planned items the narration names.
    await expectText(sec, /validation/i, "planned: validation study");
    await expectText(sec, /(pharmacy|portal).*import|import.*(pharmacy|portal)/i, "planned: pharmacy import");
    await expectText(sec, /family/i, "planned: family sharing");
    // The status badges ("Working in this demo", "Partial", "Planned"); not /^Finished/, which is the heading.
    const working = sec.getByText(/^Working\b/);
    const partial = sec.getByText(/^Partial$/);
    const firstWorking = await rowOf(working.first());
    await scrollTo(page, firstWorking, 150);
    await moveTo(page, firstWorking, { steps: 20, scroll: false });
    await ring(page, firstWorking, 4, await rowOf(working.last()));
    await atPhrase(shot, "Partial:", 0.8);
    const firstPartial = await rowOf(partial.first());
    await scrollTo(page, firstPartial, 330);
    await moveTo(page, firstPartial, { steps: 18, scroll: false });
    await ring(page, firstPartial, 4, await rowOf(partial.last()));
    await atPhrase(shot, "Planned:", 0.8);
    const firstPlanned = await rowOf(planned.first());
    await scrollTo(page, firstPlanned, 300);
    await moveTo(page, firstPlanned, { steps: 20, scroll: false });
    await ring(page, firstPlanned, 4, await rowOf(planned.last()));
  },

  async close({ page }) {
    await ring(page, null);
    // The cursor overlay sits above the card layer, so hide it rather than leave it on the end card.
    await page.evaluate(() => window.__kwCursor?.(false));
    await showCard(page, END_CARD);
  },
};

/**
 * Page changes, run just before a shot's clock starts (off the narration, the previous shot's picture stays up):
 * each opens the shot's page, and the loop then waits for its heading and for no loading skeleton (waitForScreen),
 * so the chapter label and narration begin on a finished page.
 */
const ENTER = {
  async checkin({ page }) {
    // Back from her medicine list (who shot) to Today and its "Tell me about your day" box.
    await ring(page, null);
    const today = page.getByRole("navigation", { name: "Your pages" }).getByRole("link", { name: "Today" });
    await clickOn(page, today, { scroll: false, steps: 12 });
    await page.waitForURL(/#\/p\/today/);
    await waitForScreen(page, "Margaret's Today");
    await scrollTo(page, page.locator("#pt-tell-title"), 120);
    await moveTo(page, page.getByRole("textbox", { name: /Tell me about/ }), { steps: 14, scroll: false });
  },
  async overview({ page }) {
    // The in-app demo role switch on Margaret's screen ("Demo: switch to Alex's view"), found by its accessible name
    // so it still works if the patient header moves it. Fallback: sign out and choose Alex on Welcome.
    await ring(page, null);
    const toAlex = page.getByRole("button", { name: /switch to Alex/i }).first();
    if (await toAlex.count()) {
      await clickOn(page, toAlex, { steps: 16 });
    } else {
      console.warn("WARN: no 'Demo: switch to Alex's view' control found; signing out and choosing Alex instead");
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await clickOn(page, page.getByRole("button", { name: "Sign out" }).first(), { scroll: false, steps: 14 });
      const alex = page.getByRole("button", { name: /Try as Alex/ });
      await alex.waitFor({ timeout: 8000 });
      await clickOn(page, alex, { steps: 14 });
    }
    await page.waitForURL(/#\/c\/overview/, { timeout: 10000 });
  },
  async review({ page }) {
    await ring(page, null);
    await nav(page, "Medication review", /#\/c\/review/, /Medication review/);
  },
  async timeline({ page }) {
    await ring(page, null);
    await nav(page, "Symptoms & timeline", /#\/c\/timeline/, /Symptoms & timeline/);
  },
  async ask({ page }) {
    await ring(page, null);
    await nav(page, "Ask Kinwise", /#\/c\/ask/, /Ask Kinwise/);
  },
  async brief({ page }) {
    await ring(page, null);
    await clearToasts(page); // Ask's "Added to visit questions", so it does not ride along into the brief
    await nav(page, "Visit brief", /#\/c\/brief/, /Visit brief/);
  },
  async evals({ page }) {
    await ring(page, null);
    await nav(page, "How Kinwise works", /#\/how-it-works/, /./);
    // The live evaluation section (#how-evaluation today; #live-evaluation accepted too), in view before the
    // narration starts.
    const section = page.locator("#live-evaluation, #how-evaluation").first();
    await section.waitFor({ timeout: 10000 });
    await scrollTo(page, section, 20);
  },
};

/**
 * The "Finished vs planned" section of How it works: found by id, else by its heading, so a reshaped page still
 * works. (The action opens it if it is collapsed; textContent below reads it either way.)
 */
async function honestySection(page) {
  const byId = page.locator("#how-honesty");
  if (await byId.count()) return byId;
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /finished|planned/i }) })
    .first();
}

/**
 * The rows (table row, list item or ARIA row) of the honesty section whose status badge matches `status` (e.g.
 * /\bPartial\b/, /\bWorking\b/), as plain text. Text nodes are joined with spaces (a badge "Partial" next to
 * "On-device…" would otherwise read "PartialOn-device"), and textContent also reads a collapsed <details>.
 */
async function statusRows(page, status) {
  const sec = await honestySection(page);
  if (!(await sec.count())) throw new Error("How it works: no Finished vs planned section found");
  const rows = await sec.evaluate((root) =>
    [...root.querySelectorAll("tr, li, [role='row']")]
      .filter((r) => !r.querySelector("tr, li, [role='row']"))
      .map((r) => {
        const parts = [];
        const walk = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) parts.push(walk.currentNode.nodeValue);
        return parts.join(" ").replace(/\s+/g, " ").trim();
      }),
  );
  return rows.filter((t) => status.test(t));
}

/**
 * The planned items the honesty narration names ("Planned: a validation study, pharmacy import and family sharing"),
 * each required inside a row the page marks Planned (not just anywhere in the section, so an item moved to Partial
 * or Working stops the run). Returns the labels missing from `planned` (the joined Planned rows). Exported for the
 * tests.
 */
export const PLANNED_SPOKEN = [
  ["validation study", /validation/i],
  ["pharmacy import", /pharmacy[^.]*import/i],
  ["family sharing", /family sharing/i],
];
export function plannedMissing(planned) {
  return PLANNED_SPOKEN.filter(([, re]) => !re.test(planned)).map(([label]) => label);
}

/**
 * Which honesty line fits the status table on screen, from the text of its Working and Partial rows: `model`,
 * `kb`, or null (no line fits; the caller stops the run). Every line says "Working today: the check-in, timeline,
 * review, Ask and brief", so each of the five must be in a Working row. Both lines say "no dose, allergy or full
 * interaction checks", so knowledge-base coverage must be Partial with "no dose or allergy checks" and the
 * interaction limit ("interactions limited to the AGS Beers 2023 combination table" / "not a full drug-interaction
 * checker"); `model` also needs the on-device model Partial with "not airtight". Other Partial items (the timeline
 * runs check, the hand-off, FHIR, English only) are allowed: the line names the gaps, not every row. Exported for
 * the tests.
 */
export function honestyVariant(working, partial) {
  const w = String(working ?? "");
  const p = String(partial ?? "");
  const shown = [/check-in/i, /timeline/i, /medication review/i, /Ask Kinwise/i, /visit brief/i].every((rx) => rx.test(w));
  const kbGap =
    /knowledge.base coverage/i.test(p) &&
    /no dose or allergy/i.test(p) &&
    /interactions limited to|not a full drug.interaction/i.test(p);
  const modelPartial = /on-device (language )?model/i.test(p);
  if (!shown || !kbGap) return null;
  if (modelPartial) return /not airtight/i.test(p) ? "model" : null;
  return "kb";
}

/**
 * Does the runs check shown on a Timeline row support "it still holds when whole runs of days are shuffled"? `text`
 * is the row's text, e.g. "… Large difference (Fisher's exact test, p = 0.0023 · runs check (4-day runs shuffled 999
 * times): p = 0.007)". It holds when the runs check's p clears the bar of the row's own size word, the same bars the
 * engine's gate uses (src/engine/timeline/signals.ts gatedStrength: strong 0.01 = "Large difference", moderate 0.05 =
 * "Clear difference"). Anything it cannot read counts as not holding. Exported for the tests.
 */
export function runsCheckVerdict(text) {
  const t = String(text ?? "").replace(/\s+/g, " ");
  if (!/runs check/i.test(t)) return { onScreen: false, holds: false };
  const m = /runs check\b.*?\bp\s*([=<])\s*(\d*\.\d+|\d+)/i.exec(t);
  const bar = /Large difference/i.test(t) ? 0.01 : /Clear difference/i.test(t) ? 0.05 : null;
  if (!m || bar === null) return { onScreen: true, holds: false, p: m ? Number(m[2]) : null, bar };
  const p = Number(m[2]);
  // "p < 0.001" is an upper bound: it holds if the bound itself is under the bar.
  const holds = m[1] === "<" ? p <= bar : p < bar;
  return { onScreen: true, holds, p, bar };
}

/**
 * The review card's "What the check removed" list, if the card has one: opened (a native <details> or the app's
 * Disclosure button) and read. Returns null when there is none, else { reason, text, locator, why }: the first
 * "Reason: …" / "Blocked: …" line, the AI sentence that item quotes (its <q> / .cg-vb-removed__text, else the item's
 * text without the reason line), and locators for the item and for its reason line (ringed in the verify shot).
 */
async function openCheckRemoved(page, card) {
  const title = card.getByText(/What the check removed/i).first();
  if (!(await title.count()) || !(await title.isVisible().catch(() => false))) return null;
  const trigger = title.locator("xpath=ancestor-or-self::*[self::summary or self::button][1]");
  const box = title.locator("xpath=ancestor::*[self::details or contains(concat(' ', @class, ' '), ' ui-disclosure ')][1]");
  const isOpen = async () =>
    box.evaluate((el) => (el.tagName === "DETAILS" ? el.open : el.classList.contains("is-open"))).catch(() => false);
  if ((await trigger.count()) && !(await isOpen())) {
    await clickOn(page, trigger.first(), { steps: 14 });
    await sleep(300);
  }
  if (!(await isOpen())) throw new Error("verify: the 'What the check removed' list did not open");
  const lines = (await box.innerText()).split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  const reason = lines.find((l) => /^(Reason|Blocked):/i.test(l));
  if (!reason) throw new Error(`verify: 'What the check removed' shows no reason line: "${lines.join(" | ").slice(0, 300)}"`);
  const why = await innermost(box, [new RegExp(escapeRx(reason.slice(0, 60)))], "removed reason");
  const locator = await rowOf(why);
  const quote = locator.locator("q, .cg-vb-removed__text").first();
  const raw = (await quote.count()) ? await quote.innerText() : (await locator.innerText()).replace(reason, " ");
  return { reason, text: raw.replace(/\s+/g, " ").trim(), locator, why };
}

/**
 * Narration pickers for shots with `variants`, run just before the shot starts (its narration clip must be chosen
 * before it plays). Each reads the outcome from the screen and returns the variant name.
 */
const CHOOSE = {
  async verify({ page, shot }) {
    const card = page.locator('[data-tour="review-finding"]').first();
    const ai = card.locator(".cg-finding__ai");
    await ai.locator(".cg-ai-note:not(.cg-ai-note--loading)").first().waitFor({ timeout: 90000 });
    const text = (await ai.innerText()).replace(/\s+/g, " ").trim();
    let variant;
    if (await ai.locator(".cg-ai-note--error").count()) {
      if (!BLOCKED_NOTE_ON_SCREEN.test(text)) throw new Error(`the on-device model did not finish the explanation: "${text}"`);
      variant = "blocked";
    } else {
      const draft = (await ai.locator(".cg-ai-note__text").innerText()).replace(/\s+/g, " ").trim();
      if (BANNED_ON_SCREEN.test(draft)) throw new Error(`AI explanation contains banned wording: "${draft}"`);
      variant = "draft";
    }
    shot.outcome = variant;
    // A "What the check removed" list on the card (the dropped AI sentences, each with "Reason: …" or "Blocked: …"):
    // open it and name the first reason it shows. A reason with no VERIFY_REASONS line stops the run (fail closed).
    const removed = await openCheckRemoved(page, card);
    if (removed) {
      const pick = verifyReasonVariant(removed.reason);
      shot.aiExplain = { variant: pick ?? variant, onScreen: text, removedReason: removed.reason, removedTextOnScreen: removed.text };
      if (pick) {
        // The whole item (quoted sentence and reason) is zoomed only when the sentence is neutral; else just the
        // reason line (zoomRemovedSentence).
        shot.removedReason = removed.locator;
        shot.removedWhy = removed.why;
        shot.removedZoomItem = zoomRemovedSentence(pick, removed.text);
        shot.aiExplain.removedZoom = shot.removedZoomItem ? "item" : "reason line";
        return pick;
      }
      const msg = `verify: no narration line names the reason on screen: "${removed.reason}"`;
      if (!process.env.ALLOW_MISMATCH) throw new Error(`${msg} (add it to VERIFY_REASONS and DEMO-SCRIPT.md)`);
      console.warn(`WARN ${msg}`);
      return variant;
    }
    shot.aiExplain = { variant, onScreen: text };
    return variant;
  },

  // `runs` only when the runs check is shown to hold for the dizziness row (see the timeline shot); else `plain`.
  // Both lines need the dizziness row with p = 0.0023 and the lead "of 9 compared diary items" on screen.
  async timeline({ page, shot }) {
    const cmp = page.locator('[data-tour="timeline-compare"]');
    await cmp.waitFor();
    await expectText(cmp, /2 of 19 days.*9 of 14 days/, "timeline dizziness row");
    await expectText(cmp, /Fisher.s exact test, p = 0\.0023/, "Fisher's exact test, p = 0.0023");
    await expectText(cmp.locator(".cg-tl-compare__lead").first(), /\bof 9 compared diary items\b/, "nine items compared");
    const row = await rowOf(cmp.getByText(/Fisher.s exact test, p = 0\.0023/).first());
    await expectText(row, /2 of 19 days.*9 of 14 days/, "p-value row is the dizziness row");
    const rowText = (await row.innerText()).replace(/\s+/g, " ");
    const verdict = runsCheckVerdict(rowText);
    shot.runsCheck = verdict;
    if (verdict.onScreen) {
      shot.runsOnScreen = true;
      return verdict.holds ? "runs" : "plain";
    }
    // Not on the Timeline row: the seed test's pinned result (the record shown is the seed, as the numbers above
    // confirm) decides, and anything else leaves the clause out.
    shot.runsCheck.seedPassed = seedRunsCheckPassed();
    return shot.runsCheck.seedPassed ? "runs" : "plain";
  },

  // The line whose "Working" and "Partial:" items the page really shows with those statuses (honestyVariant).
  // Anything else stops the run.
  async honesty({ page, shot }) {
    const working = (await statusRows(page, /\bWorking\b/)).join(" ");
    const partial = (await statusRows(page, /\bPartial\b/)).join(" ");
    const planned = (await statusRows(page, /\bPlanned\b/)).join(" ");
    shot.partialOnScreen = partial;
    shot.workingOnScreen = working;
    shot.plannedOnScreen = planned;
    // The spoken "Planned:" items must sit in Planned rows, as the Working and Partial items do in theirs.
    const missing = plannedMissing(planned);
    if (missing.length) {
      const pmsg = `honesty: the narration names as planned ${missing.join(", ")}, but no Planned row on screen does: "${planned.slice(0, 300)}"`;
      if (!process.env.ALLOW_MISMATCH) throw new Error(`${pmsg} (update the honesty narration and DEMO-SCRIPT.md)`);
      console.warn(`WARN ${pmsg}`);
    }
    const variant = honestyVariant(working, partial);
    if (variant) return variant;
    const msg = `honesty: no narration variant fits the Working / Partial rows on screen: "${working.slice(0, 200)}" / "${partial.slice(0, 300)}"`;
    if (!process.env.ALLOW_MISMATCH) throw new Error(`${msg} (add a variant to the honesty shot and DEMO-SCRIPT.md)`);
    console.warn(`WARN ${msg}`);
    return "kb";
  },
};

// ---------------------------------------------------------------------------------------------------------------
// SRT

function srtTime(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
}

// Burned-in captions are one line (the bar is `white-space: nowrap`), so a two-line bar never covers a card. At the
// 28 px caption size a line of CAPTION_MAX_CHARS characters is about 900 px wide, well inside the 1440 px frame.
// A caption chunk of at most ORPHAN_WORDS words is an orphan ("passed.", "after amlodipine."): too short to read
// before it is gone. It joins the chunk before it when the two together stay within ORPHAN_MERGE_CHARS, which is
// still one line (about 1000 px).
export const CAPTION_MAX_CHARS = 64;
export const ORPHAN_WORDS = 2;
export const ORPHAN_MERGE_CHARS = 72;

/**
 * One long sentence as the fewest caption lines of at most CAPTION_MAX_CHARS characters, as even as word breaks
 * allow: a 100-character sentence becomes two lines of about 50, not one of 64 and one of 36. The line length starts
 * at the even share and grows until the words fit in that many lines (a single word longer than the limit gets a
 * line of its own).
 */
function splitSentence(s) {
  const words = s.split(" ");
  const lines = Math.ceil(s.length / CAPTION_MAX_CHARS);
  const fill = (limit) => {
    const parts = [];
    let cur = "";
    for (const w of words) {
      if (cur && `${cur} ${w}`.length > limit) {
        parts.push(cur);
        cur = w;
      } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) parts.push(cur);
    return parts;
  };
  for (let limit = Math.ceil(s.length / lines); limit < CAPTION_MAX_CHARS; limit++) {
    const parts = fill(limit);
    if (parts.length <= lines) return parts;
  }
  return fill(CAPTION_MAX_CHARS);
}

/**
 * Split a narration into caption chunks (sentence, then ≤ CAPTION_MAX_CHARS chars, cut into near-equal parts)
 * timed in proportion to their length. Sentences end only at . ! ? followed by whitespace, so decimals such as
 * "94.2" stay inside their sentence, and no text is ever dropped (checked by assertCaptionWords). A chunk of
 * ORPHAN_WORDS words or fewer is merged into the chunk before it (the first chunk: into the one after it) when the
 * result stays within ORPHAN_MERGE_CHARS characters. Exported for the tests.
 */
export function captionChunks(text, start, dur) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks = [];
  for (const s of sentences) {
    if (s.length <= CAPTION_MAX_CHARS) {
      chunks.push(s);
      continue;
    }
    chunks.push(...splitSentence(s));
  }
  // Orphans: fold a chunk of one or two words into the one before it, if that does not make a cue too long to read.
  // The first chunk has nothing before it ("Kinwise." on the end card), so it joins the chunk after it instead.
  const short = (c) => c.split(" ").length <= ORPHAN_WORDS;
  for (let k = chunks.length - 1; k > 0; k--) {
    const merged = `${chunks[k - 1]} ${chunks[k]}`;
    if (short(chunks[k]) && merged.length <= ORPHAN_MERGE_CHARS) chunks.splice(k - 1, 2, merged);
  }
  if (chunks.length > 1 && short(chunks[0]) && `${chunks[0]} ${chunks[1]}`.length <= ORPHAN_MERGE_CHARS) {
    chunks.splice(0, 2, `${chunks[0]} ${chunks[1]}`);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let t = start;
  return chunks.map((c) => {
    const d = (dur * c.length) / total;
    const out = { start: t, end: t + d, text: c };
    t += d;
    return out;
  });
}

/** Throws unless the captions contain exactly the narration's words, in order. */
export function assertCaptionWords(shots, cues) {
  const norm = (t) => t.split(/\s+/).filter(Boolean);
  const said = shots.flatMap((s) => norm(s.narration));
  const shown = cues.flatMap((c) => norm(c.text));
  const bad = said.findIndex((w, i) => shown[i] !== w);
  if (said.length !== shown.length || bad >= 0) {
    throw new Error(`captions do not match the narration (${shown.length} vs ${said.length} words; first difference at word ${bad}: "${said[bad]}" vs "${shown[bad]}")`);
  }
}

// ---------------------------------------------------------------------------------------------------------------

/** Find each sync event in the raw recording: returns the video time (s) of the first frame showing event i's colour. */
function detectSync(webm, count) {
  const rate = sh(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", webm]).trim();
  const [num, den] = rate.split("/").map(Number);
  const fps = num / (den || 1);
  const buf = execFileSync(FFMPEG, ["-v", "error", "-i", webm, "-vf", "crop=6:6:1430:890,scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], {
    maxBuffer: 1 << 28,
  });
  const n = Math.floor(buf.length / 3);
  // 3-bit colour code per frame, or -1 when any channel sits in the dead zone (e.g. dimmed under a modal backdrop).
  const codes = new Int8Array(n);
  for (let f = 0; f < n; f++) {
    let code = 0;
    for (let c = 0; c < 3; c++) {
      const v = buf[f * 3 + c];
      if (v >= 170) code |= 1 << (2 - c);
      else if (v > 85) {
        code = -1;
        break;
      }
    }
    codes[f] = code;
  }
  const times = [];
  let f = 0;
  for (let e = 0; e < count; e++) {
    const want = SYNC_CODES[e % SYNC_CODES.length];
    while (f < n - 1 && !(codes[f] === want && codes[f + 1] === want)) f++;
    if (f >= n - 1) throw new Error(`sync event ${e} (code ${want}) not found in the recording (found ${times.length} of ${count})`);
    times.push(f / fps);
    f++;
  }
  return { times, fps, frames: n };
}

/**
 * Off camera (before the clock starts): sign in as Alex, load the on-device model from Settings, warm it up with one
 * question in Ask, then sign out again. Only in-app navigation is used, so the model's worker stays alive.
 */
async function preloadModel(page) {
  const t0 = Date.now();
  await page.getByRole("button", { name: /Try as Alex/ }).click();
  await page.waitForURL(/#\/c\/overview/);
  await settle(page);
  await page.evaluate(() => (location.hash = "#/c/settings"));
  const loadBtn = page.getByRole("button", { name: /^(Download and load|Load) Qwen2\.5 3B Instruct/ });
  await loadBtn.waitFor({ timeout: 15000 });
  await loadBtn.click();
  await page.getByText(/Qwen2\.5 3B Instruct is ready · runs on this device/).first().waitFor({ timeout: 15 * 60000 });
  console.log(`Model loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.evaluate(() => (location.hash = "#/c/ask"));
  await page.getByRole("button", { name: "When did the dizziness start?" }).click();
  const t1 = Date.now();
  await page.locator(".cg-ask-ai--done, .cg-ask-ai--failed, .cg-ask-ai--empty").first().waitFor({ timeout: 180000 });
  console.log(`Warm-up answer in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  await page.evaluate(() => (location.hash = "#/c/overview"));
  await settle(page);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.getByRole("button", { name: /Try as Alex/ }).waitFor({ timeout: 10000 });
  // Let any toast finish before the title card goes up.
  await sleep(6000);
}

async function main() {
  const t00 = Date.now();
  checkOutDir();
  const codeCheck = checkShownCodeMatchesLinks();
  checkScriptSync();
  checkHookSources();
  checkTimelineNull();
  checkHandoffSource();
  checkPhraseCues();
  console.log(
    `Eval numbers (eval/results): held-out micro-F1 ${EVAL.heldoutF1Pct}% on ${EVAL.heldoutStories} stories · ` +
      `${EVAL.medsPassed} of ${EVAL.medsCases} cases · null-study flag rate ${EVAL.nullFlaggedRate} (independent days)`,
  );
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(join(WORK, "audio"), { recursive: true });
  mkdirSync(join(WORK, "video"), { recursive: true });
  if (!PLAN_ONLY) mkdirSync(OUT_DIR, { recursive: true });

  // 0. Template-only cut: swap in the narration that says the model is not used (clip variant "noai").
  if (!USE_AI) {
    for (const s of SHOTS) {
      if (!s.narrationNoAi) continue;
      s.narration = s.narrationNoAi;
      s.spoken = s.spokenNoAi;
      s.clipVariant = "noai";
    }
  }
  console.log(USE_AI ? `On-device model: ${AI_MODEL_DIR}` : "On-device model: not used (template-only cut)");

  // 1. Narration audio first, so the browser can be paced to it. A shot with variants gets a clip for each.
  for (const [i, s] of SHOTS.entries()) {
    if (s.variants) {
      s.clips = Object.fromEntries(Object.entries(s.variants).map(([v, x]) => [v, clipFor(i + 1, s.id, v, x.narration, x.spoken)]));
    } else {
      const clip = clipFor(i + 1, s.id, s.clipVariant, s.narration, s.spoken);
      Object.assign(s, { audio: clip.file, narrDur: clip.dur, narrSource: clip.source });
    }
  }
  const recorded = SHOTS.flatMap((s) => (s.clips ? Object.values(s.clips) : [{ source: s.narrSource }])).filter((c) => c.source === "recorded").length;
  console.log(`Narration: ${VOICE ? `macOS voice ${VOICE} @ ${RATE} wpm` : "no `say` voice needed"}` + (NARRATION_DIR ? ` · ${recorded} recorded clip(s) from ${NARRATION_DIR}` : ""));
  if (NARRATION_DIR && recorded && VOICE) console.warn("WARN: mixing recorded clips with the `say` voice; record every shot for a consistent voice.");

  // Planned length from the narration alone (variant shots: the longer variant). Actions can only add to it.
  let planned = 0;
  console.log("Planned shot lengths (narration-bound):");
  for (const [i, s] of SHOTS.entries()) {
    const durs = s.clips ? Object.entries(s.clips).map(([v, c]) => [v, c.dur]) : [[null, s.narrDur]];
    const sec = Math.max(...durs.map(([, d]) => plannedSec(s, d)));
    planned += sec;
    const detail = durs.map(([v, d]) => `${v ? `${v} ` : ""}${d.toFixed(2)} s`).join(" / ");
    console.log(`  ${String(i + 1).padStart(2)}. ${s.id.padEnd(11)} ${sec.toFixed(2).padStart(6)} s  (narration ${detail})`);
  }
  console.log(`Planned total: ${planned.toFixed(1)} s (${fmt(planned)})`);
  // The hook is one sourced sentence (about 7 s with `say`); more than 8 s would delay the product too long.
  const hookSec = plannedSec(SHOTS[0]);
  if (hookSec > 8) console.warn(`WARN: the hook card would hold ${hookSec.toFixed(2)} s (target: at most 8 s)`);
  // Page changes, the Ask draft and on-screen actions add about 10 s to a render, so the plan keeps that margin.
  if (planned > PLAN_LIMIT_SEC) throw new Error(`planned length ${fmt(planned)} is over ${fmt(PLAN_LIMIT_SEC)}; shorten the narration (the video must stay under 3:00)`);
  if (PLAN_ONLY) return;

  // 2. Warm the dev server (Vite transforms every lazy route once) in a throwaway, unrecorded context.
  const server = await startServer();
  console.log(`App: ${server.base}`);
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
  let videoFile = null;
  let total = 0;
  let ctx = null;
  try {
    {
      const warm = await browser.newContext({ viewport: VIEW });
      const wp = await warm.newPage();
      await wp.goto(server.base);
      await settle(wp);
      for (const [role, routes] of [
        ["patient", ["/p/today", "/p/meds"]],
        ["caregiver", ["/c/overview", "/c/timeline", "/c/review", "/c/meds", "/c/ask", "/c/brief", "/how-it-works"]],
      ]) {
        await wp.evaluate(([k, r]) => sessionStorage.setItem(k, r), [SESSION_KEY, role]);
        await wp.goto("about:blank");
        for (const r of routes) {
          await wp.goto(`${server.base}#${r}`);
          await settle(wp);
        }
      }
      await warm.close();
    }

    await browser.close();

    // 3. Record in a persistent profile with WebGPU (the model cache needs a real profile's storage quota).
    mkdirSync(PROFILE, { recursive: true });
    ctx = await chromium.launchPersistentContext(PROFILE, {
      channel: "chrome",
      headless: !process.env.HEADED,
      args: ["--window-size=1440,900", ...(USE_AI ? ["--enable-unsafe-webgpu", "--use-angle=metal", "--ignore-gpu-blocklist"] : [])],
      // No viewport emulation: in a persistent context it is dropped after the first cross-origin navigation
      // (the page then renders at the window's 1440x757 and the video gets a grey band). The real window is
      // sized instead (ensureViewport), so the page is exactly 1440x900 at device pixel ratio 1.
      viewport: null,
      locale: "en-US",
      colorScheme: "light",
      reducedMotion: "no-preference",
      recordVideo: { dir: join(WORK, "video"), size: VIEW },
    });
    await ctx.addInitScript(cursorInit);
    // Nothing is fetched from model hosts: the model comes from the local copy served by the dev server.
    const external = new Set();
    await ctx.route(/huggingface\.co|raw\.githubusercontent\.com|hf\.co/, (r) => {
      external.add(r.request().url());
      return r.abort();
    });
    // The dev server's hot-reload socket is answered by a silent stand-in (never connected to Vite), so an edit
    // saved in the working tree during a render cannot reload the page mid-shot. The app itself uses no sockets.
    const devHost = new URL(server.base).host;
    await ctx.routeWebSocket((u) => u.host === devHost, () => {});
    const page = await ctx.newPage();
    for (const p of ctx.pages()) if (p !== page) await p.close();
    // Size the real browser window so the page area is exactly VIEW (checked again before the clock starts).
    const cdp = await ctx.newCDPSession(page);
    const ensureViewport = async () => {
      for (let k = 0; k < 4; k++) {
        const [w, h, dpr] = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
        if (dpr !== 1) throw new Error(`device pixel ratio is ${dpr}, expected 1`);
        if (w === VIEW.width && h === VIEW.height) return;
        const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: bounds.width + VIEW.width - w, height: bounds.height + VIEW.height - h } });
        await sleep(300);
      }
      const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
      throw new Error(`page area is ${w}x${h}, expected ${VIEW.width}x${VIEW.height}`);
    };
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    // Fresh record: clear this origin's app storage (the model cache in IndexedDB is kept), then reload to seed.
    await page.goto(server.base);
    await settle(page);
    await ensureViewport();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await settle(page);
    await warmRoutes(page);
    if (USE_AI) await preloadModel(page);
    await ensureViewport();
    let reloads = 0;
    page.on("load", () => reloads++);
    // No cursor on the hook card: parked in the bottom-left corner, off the card's text, and hidden until the who
    // shot moves to the persona line (ACTIONS.who shows it again).
    await page.mouse.move(40, VIEW.height - 40);
    await page.evaluate(() => window.__kwCursor?.(false));
    await showCard(page, HOOK_CARD);
    await sleep(300);
    const c0 = performance.now();
    SYNC.clock = () => (performance.now() - c0) / 1000;
    const now = SYNC.clock;

    for (const [i, s] of SHOTS.entries()) {
      // Change page first (off the narration), then wait for a finished page: heading on screen, no skeleton.
      if (ENTER[s.id]) await ENTER[s.id]({ page, shot: s });
      await waitForScreen(page, `shot ${s.id}`);
      // A shot with variants picks its narration from the screen first (the previous shot stays on camera).
      if (s.variants) useVariant(s, await CHOOSE[s.id]({ page, shot: s }));
      if (await page.evaluate(() => !!document.querySelector("dialog[open]"))) throw new Error(`shot ${s.id} starts with a dialog open`);
      await mark(page, { force: true });
      s.syncIndex = SYNC.events.length - 1;
      s.clockStart = SYNC.events[s.syncIndex].real;
      process.stdout.write(`  [${String(i + 1).padStart(2)}] ${(s.variant ? `${s.id}.${s.variant}` : s.id).padEnd(15)} ${s.clockStart.toFixed(2).padStart(7)} s  `);
      // Overlays for this shot: chapter label, and the captions timed from now (same chunks as the .srt).
      const since = now() - s.clockStart;
      const cues = CAPTIONS ? captionChunks(s.narration, LEAD_IN - since, s.narrDur) : [];
      // (A shot's `note` is put up by its own ACTIONS step, once it has scrolled, in a spot it measures: showNote.)
      await page.evaluate(([title, cs, pinned]) => {
        if (title) window.__kwChapter?.(title);
        window.__kwNote?.(null);
        window.__kwCaptionsPinned = pinned;
        window.__kwCaptions?.(cs);
      }, [s.chapter === false ? null : s.title, cues, !!s.captionsPinned]);
      await ACTIONS[s.id]({ page, base: server.base, shot: s });
      const need = s.clockStart + plannedSec(s);
      const actionsEnd = now();
      if (actionsEnd < need) await sleep((need - actionsEnd) * 1000);
      s.actionSec = actionsEnd - s.clockStart;
      console.log(`→ ${now().toFixed(2).padStart(7)} s  (narration ${s.narrDur.toFixed(2)} s, actions ${s.actionSec.toFixed(2)} s)`);
    }
    await mark(page, { force: true });
    const endIndex = SYNC.events.length - 1;
    await sleep(600);
    if (errors.length) console.warn(`Console/page errors during recording:\n  ${errors.slice(0, 10).join("\n  ")}`);
    if (reloads) throw new Error(`the page reloaded ${reloads} time(s) during the recording`);
    if (external.size) throw new Error(`requests to model hosts during the recording: ${[...external].join(", ")}`);
    const video = page.video();
    await ctx.close();
    ctx = null;
    videoFile = await video.path();
    SHOTS.endIndex = endIndex;
  } finally {
    await ctx?.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.stop();
  }

  // 4. Map the recording back to wall-clock time. Each sync event is found in the frames; between two events the
  //    video is retimed linearly, so the final cut plays at the speed it was performed (and paced) at.
  const ev = SYNC.events;
  const { times: vt, fps, frames } = detectSync(videoFile, ev.length);
  const R = ev.map((e) => e.real - ev[0].real);
  const V = vt;
  total = R[SHOTS.endIndex] + 0.5;
  if (total > 180) console.warn(`\n${"!".repeat(100)}\nWARNING: the video is ${fmt(total)}, over the 3:00 limit; shorten the narration\n${"!".repeat(100)}\n`);
  const rawDur = frames / fps;
  console.log(`Raw video: ${rawDur.toFixed(1)} s at ${fps} fps · ${ev.length} sync events · wall clock ${R[SHOTS.endIndex].toFixed(1)} s, raw span ${(V[SHOTS.endIndex] - V[0]).toFixed(1)} s`);
  // Extend the last segment by the tail so the end card holds.
  const VV = [...V, Math.min(rawDur, V[V.length - 1] + 0.5 * ((V[V.length - 1] - V[0]) / Math.max(1e-6, R[R.length - 1])))];
  const RR = [...R, total];
  const terms = [];
  for (let k = 0; k < VV.length - 1; k++) {
    const dv = VV[k + 1] - VV[k];
    if (dv <= 0) continue;
    const slope = (RR[k + 1] - RR[k]) / dv;
    terms.push(`gte(T,${VV[k].toFixed(4)})*lt(T,${VV[k + 1].toFixed(4)})*(${RR[k].toFixed(4)}+(T-${VV[k].toFixed(4)})*${slope.toFixed(6)})`);
  }
  const setpts = terms.join("+");
  for (const s of SHOTS) {
    s.start = R[s.syncIndex];
  }
  SHOTS.forEach((s, i) => (s.end = i + 1 < SHOTS.length ? SHOTS[i + 1].start : total));

  const inputs = ["-i", videoFile];
  const filters = [
    `[0:v]trim=start=${V[0].toFixed(4)}:end=${VV[VV.length - 1].toFixed(4)},setpts='(${setpts})/TB',fps=30,delogo=x=1424:y=884:w=15:h=15,format=yuv420p[vout]`,
  ];
  SHOTS.forEach((s, i) => {
    inputs.push("-i", s.audio);
    const ms = Math.round((s.start + LEAD_IN) * 1000);
    filters.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
  });
  // Mix, then normalise the loudness to -16 LUFS integrated with peaks at most -1.5 dBTP (loudnorm resamples to
  // 192 kHz internally, so it is brought back to 48 kHz), then pad with silence to the video's length.
  filters.push(
    `${SHOTS.map((_, i) => `[a${i}]`).join("")}amix=inputs=${SHOTS.length}:normalize=0:dropout_transition=0,${AUDIO_LOUDNORM},aresample=48000,apad[aout]`,
  );
  const graphFile = join(WORK, "filtergraph.txt");
  writeFileSync(graphFile, filters.join(";\n"));
  sh(FFMPEG, [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    total.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "20",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    OUT_MP4,
  ]);

  // 5. Captions + timings.
  const cues = SHOTS.flatMap((s) => captionChunks(s.narration, s.start + LEAD_IN, s.narrDur));
  assertCaptionWords(SHOTS, cues);
  writeFileSync(OUT_SRT, cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n"));
  const timings = {
    generatedAt: new Date().toISOString(),
    voice: VOICE,
    rateWpm: RATE,
    narrationDir: NARRATION_DIR,
    words: SHOTS.reduce((n, s) => n + s.narration.split(/\s+/).length, 0),
    onDeviceModel: USE_AI ? "Qwen2.5-3B-Instruct-q4f16_1-MLC (local copy, WebGPU)" : null,
    evalNumbers: EVAL,
    codeCheck,
    captionsBurnedIn: CAPTIONS,
    leadInSec: LEAD_IN,
    totalSec: Number(total.toFixed(2)),
    rawVideoSec: Number(rawDur.toFixed(2)),
    syncEvents: ev.length,
    shots: SHOTS.map((s, i) => ({
      n: i + 1,
      id: s.id,
      title: s.title,
      route: s.route,
      ...(s.variant ? { variant: s.variant } : {}),
      start: Number(s.start.toFixed(2)),
      end: Number(s.end.toFixed(2)),
      narrationStart: Number((s.start + LEAD_IN).toFixed(2)),
      narrationSec: Number(s.narrDur.toFixed(2)),
      narrationEnd: Number((s.start + LEAD_IN + s.narrDur).toFixed(2)),
      narrationSource: s.narrSource,
      narration: s.narration,
      ...(s.aiDraft ? { aiDraftOnScreen: s.aiDraft } : {}),
      ...(s.aiExplain ? { aiExplainOnScreen: s.aiExplain } : {}),
      ...(s.partialOnScreen ? { partialOnScreen: s.partialOnScreen } : {}),
      ...(s.workingOnScreen ? { workingOnScreen: s.workingOnScreen } : {}),
      ...(s.runsCheck ? { runsCheck: s.runsCheck } : {}),
      ...(s.note ? { noteOnScreen: s.note } : {}),
    })),
  };
  writeFileSync(join(WORK, "timings.json"), JSON.stringify(timings, null, 2));

  const info = JSON.parse(
    sh(FFPROBE, ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height,r_frame_rate", "-of", "json", OUT_MP4]),
  );
  const mb = statSync(OUT_MP4).size / 1e6;
  console.log("\nShot list (video time):");
  for (const s of timings.shots) console.log(`  ${String(s.n).padStart(2)}. ${fmt(s.start)}–${fmt(s.end)}  ${s.title}  (${s.route})`);
  console.log(
    `\n${OUT_MP4}\n  ${Number(info.format.duration).toFixed(2)} s · ${mb.toFixed(1)} MB · ` +
      info.streams.map((st) => `${st.codec_name}${st.width ? ` ${st.width}x${st.height} @ ${st.r_frame_rate}` : ""}`).join(" + "),
  );
  console.log(`${OUT_SRT}\n${join(WORK, "timings.json")}\nDone in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

// Run only when invoked as a script (record-demo.test.mjs imports the pure helpers without recording anything).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e?.stack ?? e);
    process.exit(1);
  });
}
