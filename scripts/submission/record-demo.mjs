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
//      ALLOW_MISMATCH=1), that the hook card's statistics are still in kb-src/research/market-evidence.md, and that
//      every atPhrase cue is in its shot's narration. The evaluation numbers in the narration are read from
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
//      then drafts the plainer answer in the Ask shot. Every other screen is deterministic code (the visit brief
//      uses the standard template). Requests to model hosts are blocked, so nothing is downloaded from the
//      internet. If the local model files are missing, or NO_AI=1, the template-only narration is used instead.
//      A visible cursor is injected so viewers can follow the clicks, plus recorder-only overlays (never app code):
//      a highlight ring and short zoom-ins ("punch-ins") timed to the narration, a chapter label at each shot start
//      and burned-in captions for muted viewers. They live in one popover in the browser's top layer, so they also
//      show above the app's modal dialogs.
//   3. Logs each shot's start/end relative to the start of the final video.
//   4. Playwright's screencast does not play back at wall-clock speed (about 8-20% slow here), so a 10x10 px
//      sync marker in the bottom-right corner changes colour at every shot start and cursor move. ffmpeg finds
//      those changes in the raw frames, retimes each segment back to real time (setpts), paints the marker out
//      (delogo), converts to H.264 mp4 (yuv420p, 30 fps, crf 20), places each narration clip at its shot start
//      (adelay + amix normalize=0) and muxes.
//   5. Writes kinwise-demo.mp4 and kinwise-demo.srt to OUT_DIR (default submission/) and timings.json to the
//      working folder, which is always under tmp/ (see WORK below).
//
// Every number spoken in the narration is checked on screen during the recording (see `expectText`); if the
// app shows something different the run stops instead of producing a video whose narration is wrong.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { CODE_URL as CODE_LINK, DEMO_URL, REPO_BRANCH, shortUrl } from "./lib.mjs";

// Health-language guard for anything the on-device model writes on screen during the recording (SPEC §3).
const BANNED_ON_SCREEN = /\b(caus(e|ed|es|ing)|due to the|safe|unsafe|dangerous|urgent|stop taking|start taking|should (stop|start|change)|diagnos)/i;

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
const RATE = Number(process.env.RATE ?? 175); // words per minute for `say`
const LEAD_IN = 0.3; // s between a shot's start and its narration
const TAIL = 0.45; // s of breathing room after a shot's narration (a shot can override it with `tail`)
const SESSION_KEY = "kinwise.v1.session";
const SCRIPT_DOC = join(ROOT, "docs", "DEMO-SCRIPT.md");

// End card. The links come from scripts/submission/lib.mjs (the same constants the PDFs print), so the video cannot
// drift from them. The code link names REPO_BRANCH (medwatch-v2, the branch the live demo is built from), because
// the repository's default branch still holds the first prototype.
const LIVE_URL = shortUrl(DEMO_URL);
const CODE_URL = shortUrl(CODE_LINK);
const TEAM_LINE = "Albert Zorzolan &middot; Neil Shah &mdash; Babson College";

/**
 * Evaluation numbers for the evals shot, read from the committed result files (the same files
 * scripts/submission/facts.mjs reads for the PDFs), so rerunning an evaluation cannot leave the narration behind.
 * The live page reruns both suites during the recording and expectText checks it shows the same numbers.
 */
function readEvalNumbers() {
  const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  const nlp = read("eval/results/nlp-eval.json");
  const meds = read("eval/results/meds-eval.json");
  return {
    heldoutF1Pct: (nlp.heldout.micro.f1 * 100).toFixed(1), // same rounding as facts.mjs pct(): 0.9422 → "94.2"
    heldoutStories: nlp.heldout.cases,
    medsPassed: meds.summary.casesPassed,
    medsCases: meds.summary.cases,
  };
}
const EVAL = readEvalNumbers();

// ---------------------------------------------------------------------------------------------------------------
// Narration. Health-language rules (docs/SPEC.md §3): no causal claims, no safe/unsafe, no stop/start/change
// advice, numerators AND denominators, questions for the clinician, honest about finished vs planned.
// Sources for every number: CDC Older Adult Falls, "more than 1 in 4 … less than half tell their doctor"
// (kb-src/research/market-evidence.md row 4) and NCHS Health, United States, 43.0% of adults 65+ on 5 or more
// prescription drugs, 2017–March 2020 (market-evidence.md row 1), both on the hook card only; Margaret 78, eight
// medicines, urgent-care sleeping pill (seed, src/model/seed.ts: lorazepam started at an urgent care visit for
// "my nerves and the not sleeping"); 9 of 14 / 2 of 19, 1 fall + 2 near-falls, 2 of 14 near-fall days (seed +
// live app); ACB 7 (live app, src/model/seed.test.ts); 3 new prompts for Advil PM (live preview); 270 FHIR
// resources (live app, docs/samples/kinwise-fhir-bundle.json); held-out micro-F1 and story count
// (eval/results/nlp-eval.json) and cases passed (eval/results/meds-eval.json), read by readEvalNumbers(). The
// on-device model's text is never quoted in the narration; the recorder checks what it puts on screen passed the
// app's checks and contains no banned wording (BANNED_ON_SCREEN).
//
// Fields: `title` is the chapter label shown at the shot's start; `spoken` (optional) is what `say` reads instead
// of `narration`; `narrationNoAi` replaces `narration` in the template-only cut; `aiOnly` shots are left out of
// that cut; `variants` holds alternative narrations, one of which CHOOSE[id] picks from the screen just before the
// shot starts (audio for every variant is made up front); `tail` and `minSec` adjust how long the shot holds.

const ALL_SHOTS = [
  {
    id: "hook",
    title: "The problem",
    route: "#/ (title card over Welcome)",
    narration: "More than one in four older adults fall each year, and less than half tell their doctor.",
    tail: 0.15,
    chapter: false,
  },
  {
    id: "who",
    title: "Who it is for",
    route: "#/",
    narration:
      "Meet Margaret, seventy-eight, on eight medicines, and her daughter Alex, both fictional. " +
      "After urgent care started a new sleeping pill, Alex thinks Mom seems foggier. " +
      "Kinwise helps families notice what changes after a medicine change, and bring a clear question to the doctor.",
  },
  {
    id: "checkin",
    title: "Check-in in her own words",
    route: "#/p/today",
    narration: "Margaret describes her day in her own words. A clinical language engine reads it on her device.",
  },
  {
    id: "heard",
    title: "Language engine, on her device",
    route: "#/p/today (Here's what I heard)",
    narration:
      "Woozy becomes dizziness, nearly went over a near-fall, and no ankle swelling stays a no. " +
      "Sofia's fall is set aside as someone else's. Margaret confirms each answer before saving.",
  },
  {
    id: "overview",
    title: "What Alex sees",
    route: "#/c/overview",
    narration:
      "Alex signs in. Since lorazepam started, dizziness was recorded on 9 of 14 answered days, " +
      "compared with 2 of 19 before. One fall and two near-falls were recorded on those 14 days. " +
      "It shows a change in what was recorded, not what caused it.",
  },
  {
    id: "timeline",
    title: "Before and after, with statistics",
    route: "#/c/timeline",
    narration:
      "The timeline compares answered days before and after, with Fisher's exact and Mann-Whitney tests. " +
      "Falls are listed by date: too few to test.",
  },
  {
    id: "review",
    title: "Medication review, with sources",
    route: "#/c/review",
    narration:
      "The review checks her eight medicines against AGS Beers 2023, anticholinergic burden, " +
      "where she scores 7, fall-risk lists, and possible prescribing cascades, like furosemide for ankle swelling after amlodipine. " +
      "Each finding ends in a sourced question for her doctor or pharmacist.",
    spoken:
      "The review checks her eight medicines against A G S Beers 2023, anticholinergic burden, " +
      "where she scores 7, fall-risk lists, and possible prescribing cascades, like furosemide for ankle swelling after amlodipine. " +
      "Each finding ends in a sourced question for her doctor or pharmacist.",
  },
  {
    // AI cut only. "Explain in simpler words" is clicked on the cascade finding during the review shot; CHOOSE.verify
    // reads the outcome off the screen and picks the matching narration (generation is temperature 0, but the
    // recorder never assumes which way it goes).
    id: "verify",
    title: "AI wording, checked by code",
    route: "#/c/review (Explain in simpler words)",
    aiOnly: true,
    variants: {
      draft: {
        narration:
          "The on-device model rewrites the wording in plain language; code checks every sentence against the source first.",
      },
      blocked: {
        narration: "Here the model's wording failed the source check, so code hides it and the original text stays.",
      },
    },
  },
  {
    id: "addmed",
    title: "Preview before adding a medicine",
    route: "#/c/meds (Add medication)",
    narration:
      "Before adding a medicine, Alex sees what would change: Advil PM adds three review prompts, " +
      "including a second diphenhydramine product. Nothing is saved until Alex saves.",
  },
  {
    id: "ask",
    title: "Ask Kinwise",
    route: "#/c/ask",
    narration:
      "Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. " +
      "A plainer AI draft is checked by code first. " +
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
    id: "ai-privacy",
    title: "What is AI here, and privacy",
    route: "#/how-it-works (What is AI here? · Privacy)",
    narration: "All safety logic is deterministic code with cited sources; the model only handles wording. Records stay in this browser.",
    narrationNoAi:
      "All safety logic is deterministic code with cited sources. An optional on-device model only drafts wording; " +
      "this recording does not use it. Records stay in this browser.",
  },
  {
    // The "Partial" sentence only names items the page marks Partial: CHOOSE.honesty reads the Partial rows off the
    // screen before the shot, so the narration cannot claim a status or a gap the How it works table does not show.
    // `model` fits the table where the on-device model ("the code check is not airtight") and knowledge-base
    // coverage ("no dose or allergy checks") are both Partial; `kb` fits the earlier table where only knowledge-base
    // coverage was Partial. Both name the missing dose and allergy checks, the gap a pharmacist most needs to hear.
    id: "honesty",
    title: "Finished, partial, planned",
    route: "#/how-it-works (Finished vs planned)",
    variants: {
      model: {
        narration:
          "Working today: everything you saw. Partial: the model's code check isn't airtight; no dose or allergy checks yet. " +
          "Planned: a validation study, pharmacy import and family sharing.",
      },
      kb: {
        narration:
          "Working today: everything you saw. Partial: knowledge-base coverage; no dose or allergy checks yet. " +
          "Planned: a validation study, pharmacy import and family sharing.",
      },
    },
  },
  {
    id: "close",
    title: "Try it",
    route: "end card",
    // The clinician-review and no-advice caveat is spoken here, over the end card that also shows it in writing.
    narration: "Kinwise. Not yet clinician-reviewed; not medical advice. Try it in your browser at the link below.",
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
  const norm = (t) => t.replace(/\s+/g, " ").trim();
  const doc = norm(readFileSync(SCRIPT_DOC, "utf8"));
  const missing = ALL_SHOTS.flatMap(narrationTexts).filter(([, text]) => !doc.includes(norm(text)));
  if (!missing.length) return console.log(`docs/DEMO-SCRIPT.md quotes all ${ALL_SHOTS.flatMap(narrationTexts).length} narration lines`);
  const msg =
    `docs/DEMO-SCRIPT.md is out of sync with the SHOTS table; these narration lines are not in it word for word:\n` +
    missing.map(([label, text]) => `  - ${label}: "${text}"`).join("\n");
  if (!process.env.ALLOW_MISMATCH) throw new Error(`${msg}\nUpdate the doc (or set ALLOW_MISMATCH=1 for a test render).`);
  console.warn(`\n${"!".repeat(100)}\nWARNING ${msg}\n${"!".repeat(100)}\n`);
}

/**
 * The hook card's two statistics must still be in the research file they are quoted from (the card itself is
 * recorder HTML, so expectText cannot check it against the app).
 */
function checkHookSources() {
  const md = readFileSync(join(ROOT, "kb-src", "research", "market-evidence.md"), "utf8");
  for (const [what, rx] of [
    ["CDC falls row", /More than 1 in 4\*\* older adults fall each year, but \*\*less than half tell their doctor/],
    ["NCHS polypharmacy row", /\*\*43\.0%\*\* of US adults 65\+ used 5 or more prescription drugs/],
  ]) {
    if (!rx.test(md)) throw new Error(`hook card: ${what} no longer found in kb-src/research/market-evidence.md; update HOOK_CARD`);
  }
}

/**
 * Every `atPhrase(shot, "…")` cue in a shot's action must be in one of that shot's narration lines (a variant or the
 * NO_AI line counts), so an edited narration fails here in a second instead of minutes into a render.
 */
function checkPhraseCues() {
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
      #__kw_chapter{position:fixed;left:22px;top:18px;z-index:40;display:flex;align-items:center;gap:12px;padding:9px 18px 10px 14px;
        border-radius:12px;background:rgba(31,42,38,.92);color:#fff;font-size:24px;font-weight:600;letter-spacing:-.005em;
        box-shadow:0 6px 20px rgba(0,0,0,.18);opacity:0;transform:translateY(-10px);transition:opacity .3s ease,transform .3s ease}
      #__kw_chapter.on{opacity:1;transform:none}
      #__kw_chapter b{display:block;width:6px;height:26px;border-radius:3px;background:#d98a6a}
      #__kw_caption{position:fixed;left:50%;bottom:26px;z-index:50;max-width:1080px;width:max-content;transform:translateX(-50%);
        padding:8px 20px 10px;border-radius:10px;background:rgba(20,28,25,.86);color:#fff;font-size:28px;line-height:1.3;
        font-weight:500;text-align:center;opacity:0;transition:opacity .12s ease}
      #__kw_caption.on{opacity:1}
      #__kw_caption.top{bottom:auto;top:86px}`;
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
    const caption = el("__kw_caption");
    const c = el("__kw_cursor");
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
      // Captions step out of the way when the cursor works near the bottom of the screen.
      const p = window.__kwCursorPos;
      caption.classList.toggle("top", !!p && p.y > innerHeight - 150 && p.x > 150 && p.x < innerWidth - 150);
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

    // Chapter label (top left) for the first seconds of a shot. Top left on purpose: the bottom of the frame holds the
    // burned-in captions (one or two lines), and a lower-third label would collide with two-line captions. It covers
    // the app's logo for about 2.8 s per shot.
    let chapterTimer = 0;
    window.__kwChapter = (title, ms = 2800) => {
      clearTimeout(chapterTimer);
      chapter.innerHTML = "<b></b>";
      chapter.appendChild(document.createTextNode(title));
      chapter.classList.add("on");
      chapterTimer = setTimeout(() => chapter.classList.remove("on"), ms);
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

// Hook card: two problem statistics, each with its source (kb-src/research/market-evidence.md rows 4 and 1). It is
// on screen for the hook shot only (under 6 s). The card goes up about a second before the clock starts, so the
// second statistic stays hidden until ACTIONS.hook adds the "in" class just before the narration's "and less than
// half" (about 2.4 s into the video), so it lands after "fall each year" and stays up for the rest of the card.
const HOOK_CARD = `
  <style>@keyframes __kw_in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    #__kw_hook2{opacity:0} #__kw_hook2.in{animation:__kw_in .6s ease both}</style>
  <div style="max-width:1060px;padding:0 72px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:48px">${LOGO}
      <span style="font-size:30px;font-weight:600;letter-spacing:-.01em">Kinwise<span style="color:#a9573a">.</span></span></div>
    <p style="font-family:var(--font-serif,Georgia);font-size:64px;line-height:1.1;margin:0 0 18px;letter-spacing:-.01em">
      More than <b style="color:#25584a">1 in 4</b> older adults fall each year &mdash;
      <b style="color:#25584a">less than half</b> tell their doctor.</p>
    <p style="font-size:22px;color:var(--ink-muted,#5e6a64);margin:0 0 44px">CDC, Facts About Older Adult Falls &middot; cdc.gov/falls</p>
    <div id="__kw_hook2">
      <p style="font-family:var(--font-serif,Georgia);font-size:40px;line-height:1.15;margin:0 0 14px">
        <b style="color:#a9573a">43.0%</b> of US adults 65+ used 5 or more prescription drugs in the past 30 days.</p>
      <p style="font-size:22px;color:var(--ink-muted,#5e6a64);margin:0">NCHS, Health, United States &middot; past 30 days, 2017&ndash;March 2020</p>
    </div>
  </div>`;

const END_AI_NOTE = USE_AI
  ? "On-device model (Qwen2.5 3B Instruct, WebGPU) used only for the review explanation (shown only if it passes the source " +
    "check) and the Ask Kinwise draft; the visit brief uses the standard template."
  : "Template mode shown (on-device model not loaded).";

const END_CARD = `
  <div style="max-width:1120px;padding:0 64px;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:14px;margin-bottom:26px">${LOGO}
      <span style="font-size:34px;font-weight:600">Kinwise<span style="color:#a9573a">.</span></span></div>
    <p style="font-family:var(--font-serif,Georgia);font-size:34px;line-height:1.2;margin:0 0 34px;color:var(--ink-muted,#5e6a64)">
      Notice what changes after a medicine change, <i style="color:#25584a">and bring a clear question to the visit.</i></p>
    <p style="font-size:24px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#a9573a;margin:0 0 8px">Try it now</p>
    <p style="font-size:44px;font-weight:700;margin:0 0 8px;color:#25584a">${LIVE_URL}</p>
    <p style="font-size:26px;margin:0 0 30px">&rarr; <b>Try as Alex</b> (no sign-up, fictional data)</p>
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

// ---------------------------------------------------------------------------------------------------------------
// Shot actions. Each receives { page, base } and must leave the screen in the state the narration describes.

const STORY =
  "Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. " +
  "Slept badly. My granddaughter Sofia fell off her bike, poor thing. No ankle swelling.";

const ACTIONS = {
  async hook({ page, shot }) {
    // The card is put up before the clock starts (see main). Fade in the second statistic once the first is read.
    await atPhrase(shot, "and less than half", 0.7);
    await page.evaluate(() => document.getElementById("__kw_hook2")?.classList.add("in"));
  },

  async who({ page, shot }) {
    await hideCard(page);
    const hero = page.locator("h1").first();
    await expectText(hero, /Notice what changes/i, "welcome hero");
    await expectText(page.locator("body"), /Margaret Rivera \(78\) and her daughter Alex are fictional/i, "persona line");
    // "eight medicines" is checked on screen in the review shot ("checked Margaret's 8 medicines").
    const persona = page.getByText(/Margaret Rivera \(78\)/).first();
    await moveTo(page, persona, { steps: 30 });
    await ring(page, persona, 6);
    await atPhrase(shot, "Kinwise helps families");
    await ring(page, hero, 14);
    await atPhrase(shot, "and bring a clear question", 0.2);
    await moveTo(page, page.getByRole("button", { name: /Try as Margaret/ }), { steps: 20 });
  },

  async checkin({ page }) {
    await page.getByRole("button", { name: /Try as Margaret/ }).click();
    await page.waitForURL(/#\/p\/today/);
    await settle(page);
    const box = page.getByRole("textbox", { name: /Tell me about/ });
    await scrollTo(page, page.locator("#pt-tell-title"), 120);
    await clickOn(page, box, { scroll: false });
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
  },

  async overview({ page, shot }) {
    await ring(page, null);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await clickOn(page, page.getByRole("button", { name: "Sign out" }).first(), { scroll: false, steps: 14 });
    const alex = page.getByRole("button", { name: /Try as Alex/ });
    await alex.waitFor({ timeout: 8000 });
    await clickOn(page, alex, { steps: 14 });
    await page.waitForURL(/#\/c\/overview/);
    await page.getByRole("heading", { name: /What Kinwise noticed/ }).waitFor({ timeout: 15000 });
    const main = page.locator("#main-content, main").first();
    const card = page.getByText(/Dizziness was recorded on \d+ of \d+ answered days/).first();
    await expectText(card, /9 of 14 answered days.*2 of 19 answered days/, "overview 9 of 14 vs 2 of 19");
    const falls = page.getByText(/1 fall \(.*\) and 2 near-falls/).first();
    await expectText(falls.locator("xpath=.."), /1 fall .* 2 near-falls .* on 14 answered days/, "falls line");
    await scrollTo(page, page.getByRole("heading", { name: /What Kinwise noticed/ }), 20);
    await atPhrase(shot, "dizziness was recorded", 0.5);
    await moveTo(page, card, { steps: 24, scroll: false });
    await ring(page, card, 6);
    // The before/after bars ("9 of 14 days"), zoomed while the comparison is spoken.
    const bars = await innermost(main, [/before vs after/i, /9 of 14 days/, /2 of 19 days/], "before/after bars");
    await expectText(bars, /2 of 19 days.*9 of 14 days/, "bars 2 of 19 → 9 of 14");
    await atPhrase(shot, "compared with 2 of 19", 0.8);
    await punch(page, bars, { scale: 1.45, hold: 1300 });
    await atPhrase(shot, "One fall", 0.4);
    const fallsLine = falls.locator("xpath=..");
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
    await ring(page, null);
    await nav(page, "Symptoms & timeline", /#\/c\/timeline/, /Symptoms & timeline/);
    const cmp = page.locator('[data-tour="timeline-compare"]');
    await cmp.waitFor();
    await expectText(cmp, /2 of 19 days.*9 of 14 days/, "timeline dizziness row");
    await expectText(cmp, /Fisher.s exact test/, "Fisher");
    await expectText(cmp, /Mann.Whitney/, "Mann-Whitney");
    await scrollTo(page, cmp, 16);
    await sleep(300);
    const nine = cmp.getByText("9 of 14 days").first();
    await moveTo(page, nine, { steps: 22, scroll: false });
    await ring(page, nine, 6);
    await atPhrase(shot, "Mann-Whitney", 0.6);
    const mw = cmp.getByText(/Mann.Whitney U test/).first();
    await moveTo(page, mw, { steps: 22, scroll: false });
    await ring(page, mw, 6);
    await atPhrase(shot, "Falls are listed", 0.4);
    const fallsBox = cmp.getByText(/Falls and near-falls, listed by date/).first();
    await scrollTo(page, fallsBox, 300);
    await moveTo(page, fallsBox, { steps: 20, scroll: false });
    await ring(page, fallsBox, 8);
  },

  async review({ page, shot }) {
    await ring(page, null);
    await nav(page, "Medication review", /#\/c\/review/, /Medication review/);
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
      await expectText(ai, /didn.t pass the source check/i, "source check blocked the AI wording");
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

  async addmed({ page, shot }) {
    await ring(page, null);
    await nav(page, "Medications", /#\/c\/meds/, /^Medications$/);
    await clickOn(page, page.getByRole("button", { name: "Add medication" }).first(), { scroll: false });
    const d = page.getByRole("dialog", { name: /Add a medicine/ });
    await d.waitFor();
    const name = d.getByRole("combobox", { name: "Medicine name" });
    await clickOn(page, name, { scroll: false });
    await name.pressSequentially("Advil PM", { delay: 70 });
    const opt = d.getByRole("option", { name: /^Advil PM\b(?! Liqui)/ }).first();
    await opt.waitFor({ timeout: 5000 });
    await sleep(400);
    await clickOn(page, opt, { scroll: false });
    const pv = d.getByRole("region", { name: "Live review preview" }).or(d.locator(".cg-pv")).first();
    await expectText(pv, /would add 3 new review prompts/, "Advil PM adds 3 prompts");
    await expectText(pv, /same ingredient in 2 medicines: diphenhydramine/i, "duplicate diphenhydramine");
    await sleep(300);
    await scrollTo(page, pv, 140);
    await atPhrase(shot, "Advil PM adds", 0.5);
    const head = pv.getByText(/would add 3 new review prompts/);
    await moveTo(page, head, { steps: 20, scroll: false });
    await ring(page, pv, 4);
    await punch(page, pv, { scale: 1.25, hold: 1500, maxHeight: 250 });
    await atPhrase(shot, "including a second", 0.4);
    const dup = pv.getByText(/same ingredient in 2 medicines/i).first();
    await moveTo(page, dup, { steps: 18, scroll: false });
    await ring(page, dup, 6);
    await atPhrase(shot, "Nothing is saved", 0.3);
    const save = d.getByRole("button", { name: "Save medication" });
    await moveTo(page, save, { steps: 22, scroll: false });
    await ring(page, save, 6);
    await sleep(600);
    // Close without saving: the medication list stays as seeded.
    await ring(page, null);
    await clickOn(page, d.getByRole("button", { name: "Cancel" }), { scroll: false });
    await d.waitFor({ state: "hidden", timeout: 5000 });
  },

  async ask({ page, shot }) {
    await nav(page, "Ask Kinwise", /#\/c\/ask/, /Ask Kinwise/);
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
      // The on-device model drafts a plainer answer under the records answer (about 5 s once warm).
      const ai = ans.locator(".cg-ask-ai");
      await ai.waitFor({ timeout: 5000 });
      await atPhrase(shot, "A plainer AI draft", 0.3);
      await moveTo(page, ai, { steps: 20, scroll: false });
      await ans.locator(".cg-ask-ai--done, .cg-ask-ai--failed, .cg-ask-ai--empty").first().waitFor({ timeout: 60000 });
      const t = (await ai.innerText()).replace(/\s+/g, " ").trim();
      if (!(await ans.locator(".cg-ask-ai--done").count())) throw new Error(`the on-device AI draft did not pass its checks: "${t}"`);
      await expectText(ai, /AI draft · on this device · Qwen2\.5 3B Instruct/, "AI badge");
      await expectText(ai, /Checked against the records/, "AI checked line");
      const draft = t.replace(/^.*?Instruct · [\d.]+ s\s*/, "").replace(/Checked against the records.*$/, "").trim();
      if (BANNED_ON_SCREEN.test(draft)) throw new Error(`AI draft contains banned wording: "${draft}"`);
      shot.aiDraft = t;
      await scrollTo(page, ans, 150);
      await ring(page, ai, 6);
      await moveTo(page, ai.locator(".cg-ask-ai__note"), { steps: 18, scroll: false });
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
    await ring(page, null);
    await nav(page, "Visit brief", /#\/c\/brief/, /Visit brief/);
    await clickOn(page, page.getByRole("button", { name: "Use the standard template" }));
    const doc = page.locator('[data-tour="brief-doc"]');
    await doc.waitFor();
    // Dismiss the "Brief rebuilt" toast so it does not cover the document.
    await sleep(500);
    const toastClose = page.locator('[role="status"] button, .ui-toast button').filter({ has: page.locator("svg") }).first();
    if (await toastClose.isVisible().catch(() => false)) await toastClose.click().catch(() => {});
    await expectText(doc, /WHY WE.RE COMING IN/i, "brief sections");
    await expectText(doc, /9\/14/, "brief strip 9/14");
    const noticed = doc.getByText(/What we.ve noticed/i).first();
    await scrollTo(page, noticed, 120);
    await ring(page, noticed, 8);
    await sleep(600);
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
    await ring(page, null);
    await nav(page, "How Kinwise works", /#\/how-it-works/, /Private by design/);
    await sleep(500);
    await clickOn(page, page.getByRole("button", { name: "Run the live evaluation" }), { scroll: false });
    await sleep(900);
    const runNlp = page.getByRole("button", { name: "Run the extraction benchmark now" });
    await clickOn(page, runNlp);
    await page.getByText(/micro-F1 over/).first().waitFor({ timeout: 60000 });
    const held = page.locator(".pub-how-score", { hasText: "Held-out set" });
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expectText(held, new RegExp(`${EVAL.heldoutStories} stories.*${esc(EVAL.heldoutF1Pct)}%`), `held-out ${EVAL.heldoutF1Pct}% on ${EVAL.heldoutStories}`);
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

  async "ai-privacy"({ page }) {
    await ring(page, null);
    await scrollTo(page, page.locator("#how-ai"), 10);
    await expectText(page.locator("#how-ai"), /Language only/, "AI table");
    const logic = page.getByText("All safety logic", { exact: false }).first();
    await moveTo(page, logic, { steps: 24, scroll: false });
    await ring(page, logic, 6);
    await sleep(USE_AI ? 1500 : 2200);
    const lang = page.getByText(/^Language only/).first();
    await moveTo(page, lang, { steps: 22, scroll: false });
    await ring(page, lang, 6);
    await sleep(USE_AI ? 1200 : 2400);
    const privacy = page.getByText("Privacy by architecture", { exact: true }).first();
    await scrollTo(page, privacy, 110);
    const stays = page.getByText(/Records are stored in this browser on this device/).first();
    await moveTo(page, stays, { steps: 24, scroll: false });
    await ring(page, stays, 6);
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
    await page.mouse.move(VIEW.width - 40, VIEW.height - 40, { steps: 10 });
    // The cursor overlay sits above the card layer, so hide it rather than leave it in the corner of the end card.
    await page.evaluate(() => {
      const c = document.getElementById("__kw_cursor");
      if (c) c.style.opacity = "0";
    });
    await showCard(page, END_CARD);
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
 * The rows (table row, list item or ARIA row) of the honesty section whose status is Partial, as plain text. Text
 * nodes are joined with spaces (a badge "Partial" next to "On-device…" would otherwise read "PartialOn-device"), and
 * textContent also reads a collapsed <details>.
 */
async function partialRows(page) {
  const sec = await honestySection(page);
  if (!(await sec.count())) throw new Error("How it works: no Finished vs planned section found");
  return sec.evaluate((root) =>
    [...root.querySelectorAll("tr, li, [role='row']")]
      .filter((r) => !r.querySelector("tr, li, [role='row']"))
      .map((r) => {
        const parts = [];
        const walk = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) parts.push(walk.currentNode.nodeValue);
        return parts.join(" ").replace(/\s+/g, " ").trim();
      })
      .filter((t) => /\bPartial\b/.test(t)),
  );
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
      if (!/didn.t pass the source check/i.test(text)) throw new Error(`the on-device model did not finish the explanation: "${text}"`);
      variant = "blocked";
    } else {
      const draft = (await ai.locator(".cg-ai-note__text").innerText()).replace(/\s+/g, " ").trim();
      if (BANNED_ON_SCREEN.test(draft)) throw new Error(`AI explanation contains banned wording: "${draft}"`);
      variant = "draft";
    }
    shot.aiExplain = { variant, onScreen: text };
    return variant;
  },

  // The line whose "Partial:" items the page really marks Partial. Both lines say knowledge-base coverage has no dose
  // or allergy checks, so that must be on screen too; `model` also needs the on-device model with its "not airtight"
  // detail. Anything else stops the run.
  async honesty({ page, shot }) {
    const partial = (await partialRows(page)).join(" ");
    shot.partialOnScreen = partial;
    const kbGap = /knowledge.base coverage/i.test(partial) && /no dose or allergy/i.test(partial);
    const model = /on-device (language )?model/i.test(partial) && /not airtight/i.test(partial);
    if (kbGap && model) return "model";
    if (kbGap && !/on-device (language )?model/i.test(partial)) return "kb";
    const msg = `honesty: no narration variant fits the Partial row on screen: "${partial.slice(0, 300)}"`;
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

/**
 * Split a narration into caption chunks (sentence, then ≤ ~84 chars) timed in proportion to their length.
 * Sentences end only at . ! ? followed by whitespace, so decimals such as "94.2" stay inside their sentence, and
 * no text is ever dropped (checked by captionWordsMatch).
 */
function captionChunks(text, start, dur) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks = [];
  for (const s of sentences) {
    if (s.length <= 84) {
      chunks.push(s);
      continue;
    }
    const words = s.split(" ");
    let cur = "";
    const parts = [];
    for (const w of words) {
      if ((cur + " " + w).trim().length > Math.max(60, Math.ceil(s.length / Math.ceil(s.length / 84)))) {
        parts.push(cur.trim());
        cur = w;
      } else cur = `${cur} ${w}`;
    }
    if (cur.trim()) parts.push(cur.trim());
    chunks.push(...parts);
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
function assertCaptionWords(shots, cues) {
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
  checkPhraseCues();
  console.log(`Eval numbers (eval/results): held-out micro-F1 ${EVAL.heldoutF1Pct}% on ${EVAL.heldoutStories} stories · ${EVAL.medsPassed} of ${EVAL.medsCases} cases`);
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
  const hookSec = plannedSec(SHOTS[0]);
  if (hookSec > 6) console.warn(`WARN: the hook card would hold ${hookSec.toFixed(2)} s (target: at most 6 s)`);
  if (planned > 180) throw new Error(`planned length ${fmt(planned)} is over 3:00; shorten the narration`);
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
        ["patient", ["/p/today"]],
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
    if (USE_AI) await preloadModel(page);
    await ensureViewport();
    let reloads = 0;
    page.on("load", () => reloads++);
    // Cursor parked at the right edge, clear of the hook card's text and of the bottom caption bar.
    await page.mouse.move(VIEW.width - 90, VIEW.height / 2);
    await showCard(page, HOOK_CARD);
    await sleep(300);
    const c0 = performance.now();
    SYNC.clock = () => (performance.now() - c0) / 1000;
    const now = SYNC.clock;

    for (const [i, s] of SHOTS.entries()) {
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
      await page.evaluate(([title, cs]) => {
        if (title) window.__kwChapter?.(title);
        window.__kwCaptions?.(cs);
      }, [s.chapter === false ? null : s.title, cues]);
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
  filters.push(`${SHOTS.map((_, i) => `[a${i}]`).join("")}amix=inputs=${SHOTS.length}:normalize=0:dropout_transition=0,apad[aout]`);
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

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
