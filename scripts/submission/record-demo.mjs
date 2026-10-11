// Auto-recorded, narrated demo video for the Kinwise submission (docs/DEMO-SCRIPT.md is the human-readable
// version of the SHOTS table below — keep the two in sync).
//
//   node scripts/submission/record-demo.mjs                 # starts its own Vite dev server on 127.0.0.1:5229
//   BASE_URL=http://127.0.0.1:5174/ node scripts/submission/record-demo.mjs   # reuse a running server
//   HEADED=1 node scripts/submission/record-demo.mjs        # watch it (the recording is the same)
//   VOICE="Shelley (English (US))" node scripts/submission/record-demo.mjs
//   NO_AI=1 node scripts/submission/record-demo.mjs         # template-only cut (no on-device model, other narration)
//
// What it does:
//   1. Writes each shot's narration to an .aiff with macOS `say` and measures it with ffprobe FIRST, so every
//      shot stays on screen at least as long as its narration.
//   2. Drives the app in system Chrome (Playwright channel "chrome", 1440x900 page area, pixel ratio 1) with WebGPU
//      enabled, in a persistent profile (tmp/demo-video-profile: ephemeral contexts have storage quotas too small
//      to cache the multi-GB model). The app's localStorage is cleared first, so the seeded demo record is
//      created fresh. Before the clock starts (off camera) the optional on-device model (Qwen2.5 3B Instruct) is
//      loaded from the local copy in public/models/resolve/ through Settings and warmed up with one question; it
//      then drafts the plainer answer in the Ask shot. Every other screen is deterministic code (the visit brief
//      uses the standard template). Requests to model hosts are blocked, so nothing is downloaded from the
//      internet. If the local model files are missing, or NO_AI=1, the template-only narration is used instead.
//      A visible cursor is injected so viewers can follow the clicks.
//   3. Logs each shot's start/end relative to the start of the final video.
//   4. Playwright's screencast does not play back at wall-clock speed (about 8-20% slow here), so a 10x10 px
//      sync marker in the bottom-right corner changes colour at every shot start and cursor move. ffmpeg finds
//      those changes in the raw frames, retimes each segment back to real time (setpts), paints the marker out
//      (delogo), converts to H.264 mp4 (yuv420p, 30 fps, crf 20), places each narration clip at its shot start
//      (adelay + amix normalize=0) and muxes.
//   5. Writes submission/kinwise-demo.mp4, submission/kinwise-demo.srt and tmp/demo-video/timings.json.
//
// Every number spoken in the narration is checked on screen during the recording (see `expectText`); if the
// app shows something different the run stops instead of producing a video whose narration is wrong.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Health-language guard for anything the on-device model writes on screen during the recording (SPEC §3).
const BANNED_ON_SCREEN = /\b(caus(e|ed|es|ing)|due to the|safe|unsafe|dangerous|urgent|stop taking|start taking|should (stop|start|change)|diagnos)/i;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORK = join(ROOT, "tmp", "demo-video");
const OUT_DIR = join(ROOT, "submission");
const OUT_MP4 = join(OUT_DIR, "kinwise-demo.mp4");
const OUT_SRT = join(OUT_DIR, "kinwise-demo.srt");
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
const PORT = Number(process.env.PORT ?? 5229);
const PROFILE = join(ROOT, "tmp", "demo-video-profile");
const AI_MODEL_DIR = join(ROOT, "public", "models", "resolve", "Qwen2.5-3B-Instruct-q4f16_1-MLC");
const USE_AI = !process.env.NO_AI && existsSync(join(AI_MODEL_DIR, "mlc-chat-config.json"));
const VIEW = { width: 1440, height: 900 };
const RATE = 175; // words per minute for `say`
const LEAD_IN = 0.3; // s between a shot's start and its narration
const TAIL = 0.45; // s of breathing room after a shot's narration
const SESSION_KEY = "kinwise.v1.session";

// ---------------------------------------------------------------------------------------------------------------
// Narration. Health-language rules (docs/SPEC.md §3): no causal claims, no safe/unsafe, no stop/start/change
// advice, numerators AND denominators, questions for the clinician, honest about finished vs planned.
// Sources for every number: CDC Older Adult Falls (kb-src/research/market-evidence.md row 4); 9 of 14 / 2 of 19,
// 1 fall + 2 near-falls, 2 of 14 near-fall days (seed, src/model/seed.ts + live app); ACB 7 (live app,
// src/model/seed.test.ts); 3 new prompts for Advil PM (live preview); 270 FHIR resources (live app,
// docs/samples/kinwise-fhir-bundle.json); 94.2% micro-F1 on 70 held-out stories (eval/results/nlp-eval.json);
// 57 of 57 cases (eval/results/meds-eval.json). The on-device model's draft in the Ask shot is not quoted in the
// narration; the recorder checks it passed the app's checks and contains no banned wording (BANNED_ON_SCREEN).

const SHOTS = [
  {
    id: "hook",
    title: "Problem hook",
    route: "#/ (title card over Welcome)",
    narration:
      "More than one in four older adults fall each year, and less than half tell their doctor, according to the CDC. " +
      "When a parent takes many medicines, a new side effect is easy to miss.",
  },
  {
    id: "who",
    title: "Who it is for",
    route: "#/",
    narration:
      "Kinwise helps families notice those changes. Meet Margaret, seventy-eight, and her daughter Alex, both fictional.",
  },
  {
    id: "checkin",
    title: "Patient check-in in her own words",
    route: "#/p/today",
    narration: "Margaret describes her day in her own words. A clinical language engine reads it on her device.",
  },
  {
    id: "heard",
    title: "NLP turns her words into answers",
    route: "#/p/today (Here's what I heard)",
    narration:
      "Woozy becomes dizziness, nearly went over becomes a near-fall, and no ankle swelling stays a no. " +
      "My granddaughter Sofia fell is set aside as someone else. Margaret confirms every answer before anything is saved.",
  },
  {
    id: "overview",
    title: "Caregiver overview",
    route: "#/c/overview",
    narration:
      "Now Alex signs in. Since lorazepam was started, dizziness was recorded on 9 of 14 answered days, " +
      "compared with 2 of 19 before. One fall and two near-falls were recorded on those 14 days. " +
      "It shows a change in what was recorded, not what caused it.",
  },
  {
    id: "timeline",
    title: "Timeline before and after",
    route: "#/c/timeline",
    narration:
      "The timeline compares answered days before and after, with Fisher's exact and Mann-Whitney tests. " +
      "Falls are listed by date, because a few events are too few to test.",
  },
  {
    id: "review",
    title: "Medication review",
    route: "#/c/review",
    narration:
      "The review checks her eight medicines against AGS Beers 2023, the anticholinergic burden scale, " +
      "where her list adds up to 7, fall-risk lists, and prescribing cascades, like furosemide started for ankle swelling after amlodipine. " +
      "Each finding ends in a question for her doctor or pharmacist, with its source.",
  },
  {
    id: "addmed",
    title: "Add a medicine: live preview",
    route: "#/c/meds (Add medication)",
    narration:
      "Before adding a medicine, Alex sees what would change: Advil PM would add three review prompts, " +
      "including a second product with diphenhydramine. Nothing is saved until Alex chooses Save.",
  },
  {
    id: "ask",
    title: "Ask Kinwise",
    route: "#/c/ask",
    narration:
      "Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. " +
      "The optional on-device model, running on this laptop's GPU, adds a plainer draft. " +
      "Code checks its numbers and medicine names against the records. " +
      "A treatment question is redirected to her doctor or pharmacist.",
    narrationNoAi:
      "Ask Kinwise answers from the records: near-falls on 2 of 14 answered days since lorazepam started. " +
      "A treatment question is redirected to her doctor or pharmacist.",
  },
  {
    id: "brief",
    title: "Visit brief and FHIR export",
    route: "#/c/brief",
    narration:
      "The visit brief puts it on one page. Alex must mark it reviewed before it prints, " +
      "and it exports as an HL7 FHIR R4 bundle of 270 resources.",
  },
  {
    id: "evals",
    title: "Live evaluation",
    route: "#/how-it-works (Live evaluation)",
    narration:
      "Anyone can rerun both test suites in the browser: 94.2 percent micro-F1 on 70 held-out diary stories, " +
      "and 57 of 57 medication-review test cases passed.",
  },
  {
    id: "ai-privacy",
    title: "What is AI here, and privacy",
    route: "#/how-it-works (What is AI here? · Privacy)",
    narration: "All safety logic is deterministic code with cited sources; the model only handles wording. Records stay in this browser.",
    narrationNoAi:
      "All safety logic is deterministic code with cited sources. An optional on-device model only drafts wording, " +
      "checked against the records. This recording uses the standard template, without the model. " +
      "Records stay in this browser.",
  },
  {
    id: "honesty",
    title: "Finished vs planned",
    route: "#/how-it-works (Finished vs planned)",
    narration:
      "Working today: check-in, timeline, review, visit brief and FHIR export. " +
      "Planned: a validation study with pharmacists and caregivers, pharmacy import, and family sharing. " +
      "The knowledge base is not yet clinician-reviewed, and Kinwise gives no medical advice.",
  },
  {
    id: "close",
    title: "Close",
    route: "end card",
    narration: "Kinwise. Notice what changes after a medicine change, and bring a clear question to the visit.",
  },
];

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

/** Injected into every document: a visible cursor that follows the (synthetic) mouse, with a click pulse. */
function cursorInit() {
  const install = () => {
    if (document.getElementById("__kw_cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__kw_cursor{position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
        background:rgba(169,87,58,.22);border:2px solid rgba(169,87,58,.95);box-shadow:0 1px 6px rgba(0,0,0,.25);
        pointer-events:none;z-index:2147483647;transition:transform .12s ease, background .12s ease;transform:translate(-100px,-100px)}
      #__kw_cursor.down{background:rgba(169,87,58,.5)}
      .__kw_ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid rgba(169,87,58,.9);
        pointer-events:none;z-index:2147483646;animation:__kw_r .55s ease-out forwards}
      @keyframes __kw_r{to{transform:scale(3.2);opacity:0}}`;
    document.documentElement.appendChild(style);
    const c = document.createElement("div");
    c.id = "__kw_cursor";
    c.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(c);
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
        document.documentElement.appendChild(r);
        setTimeout(() => r.remove(), 700);
      },
      true,
    );
    addEventListener("mouseup", () => c.classList.remove("down"), true);
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

const HOOK_CARD = `
  <div style="max-width:980px;padding:0 64px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:56px">${LOGO}
      <span style="font-size:30px;font-weight:600;letter-spacing:-.01em">Kinwise<span style="color:#a9573a">.</span></span></div>
    <p style="font-family:var(--font-serif,Georgia);font-size:60px;line-height:1.12;margin:0 0 28px;letter-spacing:-.01em">
      More than <b style="color:#25584a">1 in 4</b> older adults fall each year &mdash;
      and <b style="color:#25584a">less than half</b> tell their doctor.</p>
    <p style="font-size:22px;color:var(--ink-muted,#5e6a64);margin:0 0 40px">Source: CDC, Facts About Older Adult Falls
      &middot; cdc.gov/falls</p>
    <p style="font-size:24px;line-height:1.45;margin:0;max-width:820px">For a parent on many medicines, a new side effect
      &mdash; dizziness, a near-fall, new fogginess &mdash; is easy to miss between visits.</p>
  </div>`;

const END_AI_NOTE = USE_AI
  ? "On-device model (Qwen2.5 3B Instruct, WebGPU) shown in Ask Kinwise only; the visit brief uses the standard template."
  : "Template mode shown (on-device model not loaded).";

const END_CARD = `
  <div style="max-width:980px;padding:0 64px;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:14px;margin-bottom:36px">${LOGO}
      <span style="font-size:34px;font-weight:600">Kinwise<span style="color:#a9573a">.</span></span></div>
    <p style="font-family:var(--font-serif,Georgia);font-size:52px;line-height:1.15;margin:0 0 36px">
      Notice what changes after a medicine change, <i style="color:#25584a">and bring a clear question to the visit.</i></p>
    <p style="font-size:21px;color:var(--ink-muted,#5e6a64);margin:0 0 10px">Private &middot; runs in the browser &middot;
      deterministic, cited medication review &middot; optional on-device AI</p>
    <p style="font-size:21px;color:var(--ink-muted,#5e6a64);margin:0 0 28px">Code: github.com/albertzorzolan/UnivaBioBabson</p>
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
  async hook({ page, base }) {
    // The card is put up before the clock starts (see main); just hold it.
    void page;
    void base;
  },

  async who({ page }) {
    await hideCard(page);
    await sleep(500);
    const hero = page.locator("h1").first();
    await expectText(hero, /Notice what changes/i, "welcome hero");
    await expectText(page.locator("body"), /Margaret Rivera \(78\) and her daughter Alex are fictional/i, "persona line");
    await moveTo(page, page.getByText(/Margaret Rivera \(78\)/).first(), { steps: 30 });
    await sleep(1600);
    await moveTo(page, page.getByRole("button", { name: /Try as Margaret/ }), { steps: 20 });
  },

  async checkin({ page }) {
    await page.getByRole("button", { name: /Try as Margaret/ }).click();
    await page.waitForURL(/#\/p\/today/);
    await settle(page);
    const box = page.getByRole("textbox", { name: /Tell me about/ });
    await scrollTo(page, page.locator("#pt-tell-title"), 120);
    await clickOn(page, box, { scroll: false });
    await box.pressSequentially(STORY, { delay: 10 });
    await sleep(300);
    await moveTo(page, page.getByRole("button", { name: "Fill in my check-in" }), { steps: 18 });
  },

  async heard({ page }) {
    await page.getByRole("button", { name: "Fill in my check-in" }).click();
    const heard = page.locator("#pt-heard-title").locator("xpath=ancestor::section[1]");
    await heard.waitFor({ timeout: 8000 });
    await sleep(900);
    await scrollTo(page, page.locator("#pt-heard-title"), 120);
    await expectText(heard, /woozy.*Dizzy/i, "woozy → Dizzy");
    await expectText(heard, /nearly went over.*Near-fall/i, "near-fall");
    await expectText(heard, /fell off her bike.*Someone else/i, "Sofia = someone else");
    await expectText(heard, /Ankle swelling No/i, "ankle swelling = No");
    // Point at the spans the narration names, in order.
    await moveTo(page, heard.getByText("woozy", { exact: true }).first(), { steps: 18, scroll: false });
    await sleep(1400);
    await moveTo(page, heard.getByText("nearly went over", { exact: true }).first(), { steps: 18, scroll: false });
    await sleep(1200);
    await moveTo(page, heard.getByText(/No ankle swelling/).first(), { steps: 18, scroll: false });
    await sleep(1000);
    await moveTo(page, heard.getByText(/fell off her bike/).first(), { steps: 18, scroll: false });
    await sleep(1300);
    // "Things I didn't add" lists Sofia's fall with the reason.
    const skipped = heard.getByText(/Things I didn.t add/).first();
    await scrollTo(page, skipped, 330);
    await expectText(heard, /that's about someone else/i, "skipped reason");
    await moveTo(page, heard.getByText(/that's about someone else/i).first(), { steps: 18, scroll: false });
  },

  async overview({ page }) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await clickOn(page, page.getByRole("button", { name: "Sign out" }).first(), { scroll: false, steps: 14 });
    const alex = page.getByRole("button", { name: /Try as Alex/ });
    await alex.waitFor({ timeout: 8000 });
    await clickOn(page, alex, { steps: 14 });
    await page.waitForURL(/#\/c\/overview/);
    await page.getByRole("heading", { name: /What Kinwise noticed/ }).waitFor({ timeout: 15000 });
    const card = page.getByText(/Dizziness was recorded on \d+ of \d+ answered days/).first();
    await expectText(card, /9 of 14 answered days.*2 of 19 answered days/, "overview 9 of 14 vs 2 of 19");
    await scrollTo(page, page.getByRole("heading", { name: /What Kinwise noticed/ }), 20);
    await moveTo(page, card, { steps: 24, scroll: false });
    await sleep(2400);
    const falls = page.getByText(/1 fall \(.*\) and 2 near-falls/).first();
    await expectText(falls.locator("xpath=.."), /1 fall .* 2 near-falls .* on 14 answered days/, "falls line");
    await moveTo(page, falls, { steps: 20, scroll: false });
    await sleep(1800);
    await moveTo(page, page.getByText(/Shows a change in what was recorded, not what caused it/).first(), { steps: 20, scroll: false });
  },

  async timeline({ page }) {
    await nav(page, "Symptoms & timeline", /#\/c\/timeline/, /Symptoms & timeline/);
    const cmp = page.locator('[data-tour="timeline-compare"]');
    await cmp.waitFor();
    await expectText(cmp, /2 of 19 days.*9 of 14 days/, "timeline dizziness row");
    await expectText(cmp, /Fisher.s exact test/, "Fisher");
    await expectText(cmp, /Mann.Whitney/, "Mann-Whitney");
    await scrollTo(page, cmp, 16);
    await sleep(500);
    await moveTo(page, cmp.getByText("9 of 14 days").first(), { steps: 22, scroll: false });
    await sleep(1800);
    await moveTo(page, cmp.getByText(/Mann.Whitney U test/).first(), { steps: 22, scroll: false });
    await sleep(1500);
    const fallsBox = cmp.getByText(/Falls and near-falls, listed by date/).first();
    await scrollTo(page, fallsBox, 300);
    await moveTo(page, fallsBox, { steps: 20, scroll: false });
  },

  async review({ page }) {
    await nav(page, "Medication review", /#\/c\/review/, /Medication review/);
    const main = page.locator("#main-content");
    await expectText(main, /checked Margaret.s 8 medicines/, "8 medicines");
    await expectText(main, /Anticholinergic burden Total score 7/, "ACB 7");
    await moveTo(page, page.getByText("Anticholinergic burden", { exact: true }).first(), { steps: 22, scroll: false });
    await sleep(1500);
    await moveTo(page, page.getByText("Medicines linked to falls", { exact: true }).first(), { steps: 22, scroll: false });
    await sleep(900);
    await moveTo(page, page.getByText("Beers Criteria prompts", { exact: true }).first(), { steps: 22, scroll: false });
    await sleep(900);
    const card = page.locator('[data-tour="review-finding"]').first();
    await expectText(card, /Amlodipine → ankle swelling → Furosemide/i, "cascade finding first");
    await scrollTo(page, card, 16);
    await sleep(1200);
    await clickOn(page, card.getByRole("button", { name: "Why this matters" }), { scroll: false });
    await sleep(400);
    await scrollTo(page, card.getByRole("button", { name: "Why this matters" }), 380);
    await moveTo(page, card.locator('a[href^="http"]').first(), { steps: 20, scroll: false });
    await sleep(1200);
    await moveTo(page, card.locator(".cg-finding__question-text"), { steps: 22, scroll: false });
  },

  async addmed({ page }) {
    await nav(page, "Medications", /#\/c\/meds/, /^Medications$/);
    await clickOn(page, page.getByRole("button", { name: "Add medication" }).first(), { scroll: false });
    const d = page.getByRole("dialog", { name: /Add a medicine/ });
    await d.waitFor();
    const name = d.getByRole("combobox", { name: "Medicine name" });
    await clickOn(page, name, { scroll: false });
    await name.pressSequentially("Advil PM", { delay: 90 });
    const opt = d.getByRole("option", { name: /^Advil PM\b(?! Liqui)/ }).first();
    await opt.waitFor({ timeout: 5000 });
    await sleep(500);
    await clickOn(page, opt, { scroll: false });
    const pv = d.getByRole("region", { name: "Live review preview" }).or(d.locator(".cg-pv")).first();
    await expectText(pv, /would add 3 new review prompts/, "Advil PM adds 3 prompts");
    await expectText(pv, /same ingredient in 2 medicines: diphenhydramine/i, "duplicate diphenhydramine");
    await sleep(500);
    await scrollTo(page, pv, 140);
    await moveTo(page, pv.getByText(/would add 3 new review prompts/), { steps: 20, scroll: false });
    await sleep(1300);
    await moveTo(page, pv.getByText(/diphenhydramine/).first(), { steps: 18, scroll: false });
    await sleep(1200);
    await moveTo(page, d.getByRole("button", { name: "Save medication" }), { steps: 22, scroll: false });
    await sleep(900);
    // Close without saving: the medication list stays as seeded.
    await clickOn(page, d.getByRole("button", { name: "Cancel" }), { scroll: false });
    await d.waitFor({ state: "hidden", timeout: 5000 });
  },

  async ask({ page, shot }) {
    await nav(page, "Ask Kinwise", /#\/c\/ask/, /Ask Kinwise/);
    await clickOn(page, page.getByRole("button", { name: "How many near-falls since lorazepam started?" }));
    const ans = page.locator(".cg-ask-a").last();
    await ans.waitFor({ timeout: 8000 });
    await expectText(ans, /From the records.*Near-falls were recorded on 2 of 14 answered days/, "Ask near-falls");
    if (USE_AI) {
      // The on-device model drafts a plainer answer under the records answer (about 5 s once warm).
      const ai = ans.locator(".cg-ask-ai");
      await ai.waitFor({ timeout: 5000 });
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
      await moveTo(page, ai.locator(".cg-ask-sent").first(), { steps: 20, scroll: false });
      await sleep(1200);
      await moveTo(page, ai.locator(".cg-ask-ai__note"), { steps: 18, scroll: false });
      await atPhrase(shot, "A treatment question", 1.6);
    } else {
      await sleep(2600);
    }
    const box = page.getByRole("textbox", { name: /Ask/ });
    await clickOn(page, box);
    await box.pressSequentially("Should she stop taking the lorazepam?", { delay: 38 });
    await clickOn(page, page.getByRole("button", { name: "Ask", exact: true }), { scroll: false });
    const red = page.locator(".cg-ask-a--redirect").last();
    await red.waitFor({ timeout: 8000 });
    await expectText(red, /question for Margaret.s doctor or pharmacist/i, "redirect");
    await scrollTo(page, red, 260);
    await sleep(600);
    await clickOn(page, red.getByRole("button", { name: "Add to visit questions" }), { scroll: false });
    await red.getByText("Added to visit questions").waitFor({ timeout: 3000 });
  },

  async brief({ page }) {
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
    await scrollTo(page, doc.getByText(/What we.ve noticed/i).first(), 120);
    await sleep(1100);
    await scrollTo(page, page.locator("body"), 0);
    const review = page.getByRole("checkbox", { name: /reviewed this brief/i });
    await clickOn(page, review, { scroll: false });
    await sleep(400);
    await clickOn(page, page.getByRole("button", { name: "Print / Save as PDF" }), { scroll: false });
    const printed = await page.evaluate(() => window.__kwPrinted ?? 0);
    if (!printed) throw new Error("Print was not reached after marking the brief reviewed");
    const fhir = page.locator('[data-tour="brief-fhir"]');
    await expectText(fhir, /Valid FHIR R4 Bundle · 270 resources/, "FHIR 270 resources");
    await scrollTo(page, fhir, 120);
    await moveTo(page, fhir.getByText(/Valid FHIR R4 Bundle/), { steps: 22, scroll: false });
    await sleep(600);
    const preview = fhir.getByText("Preview the JSON");
    if (await preview.count()) {
      await clickOn(page, preview, { scroll: false });
      await sleep(400);
    }
  },

  async evals({ page }) {
    await nav(page, "How Kinwise works", /#\/how-it-works/, /Private by design/);
    await sleep(600);
    await clickOn(page, page.getByRole("button", { name: "Run the live evaluation" }), { scroll: false });
    await sleep(1100);
    const runNlp = page.getByRole("button", { name: "Run the extraction benchmark now" });
    await clickOn(page, runNlp);
    await page.getByText(/micro-F1 over/).first().waitFor({ timeout: 60000 });
    const held = page.locator(".pub-how-score", { hasText: "Held-out set" });
    await expectText(held, /70 stories.*94\.2%/, "held-out 94.2% on 70");
    await scrollTo(page, page.getByText(/Does it hear her correctly/).first(), 120);
    await moveTo(page, held.locator(".pub-how-score__big"), { steps: 22, scroll: false });
    await sleep(1500);
    const runMed = page.getByRole("button", { name: "Run the medication-review suite" });
    await scrollTo(page, runMed, 260);
    await clickOn(page, runMed, { scroll: false });
    const tile = page.locator(".pub-how-tile", { hasText: "Cases fully passed" });
    await tile.waitFor({ timeout: 60000 });
    await expectText(tile, /57 of 57/, "57 of 57 cases");
    await scrollTo(page, page.getByText(/Does it flag what the criteria say/).first(), 120);
    await moveTo(page, tile, { steps: 20, scroll: false });
  },

  async "ai-privacy"({ page }) {
    await scrollTo(page, page.locator("#how-ai"), 10);
    await expectText(page.locator("#how-ai"), /Language only/, "AI table");
    await moveTo(page, page.getByText("All safety logic", { exact: false }).first(), { steps: 24, scroll: false });
    await sleep(USE_AI ? 1500 : 2200);
    await moveTo(page, page.getByText(/^Language only/).first(), { steps: 22, scroll: false });
    await sleep(USE_AI ? 1200 : 2400);
    const privacy = page.getByText("Privacy by architecture", { exact: true }).first();
    await scrollTo(page, privacy, 110);
    await moveTo(page, page.getByText(/Records are stored in this browser on this device/).first(), { steps: 24, scroll: false });
  },

  async honesty({ page }) {
    const sec = page.locator("#how-honesty");
    await scrollTo(page, sec, 10);
    await sleep(700);
    const planned = page.getByText("Clinical validation", { exact: true }).first();
    await scrollTo(page, planned, 420);
    await moveTo(page, page.getByText("Visit brief, print and FHIR R4 export", { exact: true }).first(), { steps: 22, scroll: false });
    await sleep(1800);
    await moveTo(page, planned, { steps: 22, scroll: false });
    await sleep(1600);
    await moveTo(page, page.getByText("Sharing between family members", { exact: true }).first(), { steps: 22, scroll: false });
  },

  async close({ page }) {
    await page.mouse.move(VIEW.width - 40, VIEW.height - 40, { steps: 10 });
    await showCard(page, END_CARD);
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
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(join(WORK, "audio"), { recursive: true });
  mkdirSync(join(WORK, "video"), { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // 0. Template-only cut: swap in the narration that says the model is not used.
  if (!USE_AI) for (const s of SHOTS) if (s.narrationNoAi) s.narration = s.narrationNoAi;
  console.log(USE_AI ? `On-device model: ${AI_MODEL_DIR}` : "On-device model: not used (template-only cut)");

  // 1. Narration audio first, so the browser can be paced to it.
  const voice = pickVoice();
  const words = SHOTS.reduce((n, s) => n + s.narration.split(/\s+/).length, 0);
  console.log(`Voice: ${voice} @ ${RATE} wpm · ${SHOTS.length} shots · ${words} words of narration`);
  for (const [i, s] of SHOTS.entries()) {
    s.audio = join(WORK, "audio", `shot${String(i + 1).padStart(2, "0")}-${s.id}.aiff`);
    sh("say", ["-v", voice, "-r", String(RATE), "-o", s.audio, s.narration]);
    s.narrDur = duration(s.audio);
  }
  const speech = SHOTS.reduce((n, s) => n + s.narrDur, 0);
  console.log(`Narration audio: ${speech.toFixed(1)} s total`);

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
    await page.mouse.move(VIEW.width / 2, VIEW.height - 60);
    await showCard(page, HOOK_CARD);
    await sleep(300);
    const c0 = performance.now();
    SYNC.clock = () => (performance.now() - c0) / 1000;
    const now = SYNC.clock;

    for (const [i, s] of SHOTS.entries()) {
      if (await page.evaluate(() => !!document.querySelector("dialog[open]"))) throw new Error(`shot ${s.id} starts with a dialog open`);
      await mark(page, { force: true });
      s.syncIndex = SYNC.events.length - 1;
      s.clockStart = SYNC.events[s.syncIndex].real;
      process.stdout.write(`  [${String(i + 1).padStart(2)}] ${s.id.padEnd(11)} ${s.clockStart.toFixed(2).padStart(7)} s  `);
      await ACTIONS[s.id]({ page, base: server.base, shot: s });
      const need = s.clockStart + LEAD_IN + s.narrDur + TAIL;
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
    voice,
    rateWpm: RATE,
    words,
    onDeviceModel: USE_AI ? "Qwen2.5-3B-Instruct-q4f16_1-MLC (local copy, WebGPU)" : null,
    leadInSec: LEAD_IN,
    totalSec: Number(total.toFixed(2)),
    rawVideoSec: Number(rawDur.toFixed(2)),
    syncEvents: ev.length,
    shots: SHOTS.map((s, i) => ({
      n: i + 1,
      id: s.id,
      title: s.title,
      route: s.route,
      start: Number(s.start.toFixed(2)),
      end: Number(s.end.toFixed(2)),
      narrationStart: Number((s.start + LEAD_IN).toFixed(2)),
      narrationSec: Number(s.narrDur.toFixed(2)),
      narrationEnd: Number((s.start + LEAD_IN + s.narrDur).toFixed(2)),
      narration: s.narration,
      ...(s.aiDraft ? { aiDraftOnScreen: s.aiDraft } : {}),
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
