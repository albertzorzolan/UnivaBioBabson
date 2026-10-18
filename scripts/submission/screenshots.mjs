// Regenerates the README / Devpost gallery screenshots in docs/screenshots/ from the current build:
//
//   00-thumbnail.png              1500x1000 (3:2) Devpost thumbnail: the app's logo, the Devpost tagline, a crop of the
//                                 Overview's first "What Kinwise noticed" card (the one-pager's crop) and the app's
//                                 "Fictional demo data" chip, laid out in the app's own page with its fonts and tokens
//   01-welcome.png                Welcome screen (the one-click "Try as Margaret" / "Try as Alex" entries)
//   02-caregiver-overview.png     Alex's Overview: the lorazepam before/after finding (README hero)
//   03-timeline.png               Symptoms & timeline, scrolled to the "Before and after" comparison
//   04-review.png                 Medication review (ACB, fall-risk lists, Beers prompts)
//   05-visit-brief.png            Visit brief built with the standard template (no LLM), not yet reviewed
//   06-patient-today-390.png      Margaret's Today at 390x844: a check-in in her own words, read on the device
//
// The desktop shots are 1280x860 CSS px at pixel ratio 2 (2560x1720 files); 06 is 390x844 at ratio 2.
//
// Usage (from the repo root):
//   node scripts/submission/screenshots.mjs                     # starts Vite on PORT (default 5222) or a free port
//   BASE_URL=http://127.0.0.1:5174/ node scripts/submission/screenshots.mjs   # reuse a running dev server
//   SHOTS_OUT_DIR=tmp/shots-trial node scripts/submission/screenshots.mjs     # trial run that leaves docs/ untouched
//   node scripts/submission/make-pdfs.mjs --only=screens       # the same, from the artifact build (also in its default run)
//
// Every screen comes from a fresh browser context, so the app starts from its seeded demo record (fictional data), and
// the browser clock is fixed to today at 10:30 (fixedCaptureTime, as for the PDFs). The seed is relative to today, so
// the dates on screen follow the day the script runs. The guided tour and any toast are dismissed before each shot.
//
// Before anything is written the screens are checked (galleryProblems / overviewProblems): the Overview must show the
// size badge "Large difference", the counts "9 of 14" and "2 of 19" and the caveat "... not what caused it", and no
// screen may show the retired "Pattern strength" badge. If a check fails, nothing in the output folder is changed and
// the script exits non-zero, so the README never shows a screen that disagrees with the narration and the PDFs.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BUILD_DIR, ROOT, ensureDir, escapeHtml, launchBrowser, settle, startServer } from "./lib.mjs";
import { captureScreens, fixedCaptureTime } from "./capture.mjs";

/** Where the gallery goes. SHOTS_OUT_DIR (relative to the repo root) sends a trial run somewhere else. */
export const SHOTS_DIR = process.env.SHOTS_OUT_DIR ? resolve(ROOT, process.env.SHOTS_OUT_DIR) : join(ROOT, "docs", "screenshots");

/** The files this script owns, in the Devpost gallery order (thumbnail first; see the comment at the end of DEVPOST.md). */
export const GALLERY_ORDER = [
  "00-thumbnail.png",
  "02-caregiver-overview.png",
  "03-timeline.png",
  "04-review.png",
  "05-visit-brief.png",
  "06-patient-today-390.png",
  "01-welcome.png",
];

const DESKTOP = { width: 1280, height: 860, scale: 2 };
const PHONE = { width: 390, height: 844, scale: 2 };
const THUMB = { width: 1500, height: 1000, scale: 1 };

/** The check-in typed on Margaret's Today for 06 (fictional; the same words as the first gallery version). */
export const PATIENT_STORY =
  "Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. " +
  "Slept badly. My granddaughter Sofia fell off her bike, poor thing. Forgot my water pill.";

/** The retired badge wording ("Pattern strength: strong"); no gallery screen may show it. */
const RETIRED_BADGE = /Pattern strength/i;

/** Problems with the visible text of any gallery screen (empty when it is fine). */
export function galleryProblems(name, text) {
  return RETIRED_BADGE.test(text) ? [`${name}: shows the retired "Pattern strength" badge`] : [];
}

/**
 * Problems with the Overview's visible text: the numbers and wording the README caption, the Devpost text and the video
 * narration all repeat. Visible text only (innerText), so a sentence inside a closed disclosure does not count.
 */
export function overviewProblems(text) {
  const t = String(text).replace(/\s+/g, " ");
  const problems = galleryProblems("Overview", t);
  if (!/Large difference/.test(t)) problems.push('Overview: no "Large difference" size badge');
  if (!/\b9 of 14\b/.test(t)) problems.push('Overview: the "9 of 14" after count is missing');
  if (!/\b2 of 19\b/.test(t)) problems.push('Overview: the "2 of 19" before count is missing');
  if (!/not what caused it/i.test(t)) problems.push('Overview: the caveat "... not what caused it" is missing');
  return problems;
}

/** The Devpost tagline: the paragraph under "## Elevator pitch" in submission/DEVPOST.md. */
export function taglineFromDevpost(md) {
  const m = String(md).match(/^## Elevator pitch[^\n]*\n+([^\n#][^\n]*)/m);
  if (!m) throw new Error('screenshots: no tagline under "## Elevator pitch" in submission/DEVPOST.md');
  return m[1].trim();
}

/**
 * The thumbnail's markup and style, appended to the app's own page (so `var(--…)` and the bundled fonts are the app's).
 * logoHtml and chipHtml are the app's rendered logo and "Fictional demo data" chip, copied from the Welcome page;
 * cardSrc is the Overview crop as a data: URL. One column: brand row, tagline, then the real card at full width on
 * the bottom margin.
 */
export function thumbnailHtml({ tagline, logoHtml, chipHtml, cardSrc }) {
  const css = `
#kw-thumb { position: fixed; inset: 0; z-index: 2147483647; box-sizing: border-box; width: ${THUMB.width}px; height: ${THUMB.height}px;
  padding: 64px 72px 0; display: flex; flex-direction: column; gap: 36px; overflow: hidden;
  background: linear-gradient(180deg, var(--bg) 0%, var(--bg) 55%, var(--surface-tint) 100%); color: var(--ink); font-family: var(--font-sans); }
#kw-thumb .kw-thumb__top { display: flex; align-items: center; justify-content: space-between; }
#kw-thumb .kw-thumb__logo { zoom: 1.9; }
#kw-thumb .kw-thumb__chip { zoom: 1.6; }
#kw-thumb .kw-thumb__chip .ui-demo-chip__trigger { pointer-events: none; }
#kw-thumb .kw-thumb__tagline { margin: 0; max-width: 1240px; font-family: var(--font-serif); font-weight: 600; font-size: 54px;
  line-height: 1.16; letter-spacing: -0.012em; text-wrap: balance; }
/* The real card (a crop of the live screen, never scaled up), sitting on the bottom margin; the free space goes above it. */
#kw-thumb .kw-thumb__shot { margin: auto 0 64px; border: 1px solid var(--line); border-radius: var(--radius-xl);
  background: var(--surface); box-shadow: var(--shadow-3); padding: 14px; }
#kw-thumb .kw-thumb__shot img { display: block; width: 100%; height: auto; border-radius: var(--radius-md); }
`;
  return {
    css,
    html: `
<div class="kw-thumb__top">
  <div class="kw-thumb__logo">${logoHtml}</div>
  <div class="kw-thumb__chip">${chipHtml}</div>
</div>
<p class="kw-thumb__tagline">${escapeHtml(tagline)}</p>
<div class="kw-thumb__shot"><img alt="" src="${cardSrc}"></div>`,
  };
}

async function newPage(browser, { width, height, scale }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(fixedCaptureTime());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { ctx, page, errors };
}

/** Close the guided tour if it is open and every toast on screen, then wait until neither is visible. */
async function dismissOverlays(page) {
  const close = page.getByRole("button", { name: "Close the tour" });
  if (await close.isVisible().catch(() => false)) await close.click();
  await page.evaluate(() => document.querySelectorAll(".ui-toast__close").forEach((b) => b.click())).catch(() => {});
  await page.waitForFunction(
    () => {
      const shown = (sel) => [...document.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0);
      return !shown(".ui-toast") && !shown(".tour-card");
    },
    null,
    { timeout: 6000 },
  );
  // No hover state or focus ring left on whatever was clicked last.
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.waitForTimeout(150);
}

/** Wait for the route's heading, fonts and charts, then dismiss overlays. */
async function ready(page) {
  await settle(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500); // charts finish their (reduced-motion) render
  await dismissOverlays(page);
}

/** Scroll so `loc` sits `offset` CSS px below the top of the viewport (the app scrolls the window). */
async function scrollToTop(page, loc, offset) {
  await loc.waitFor({ timeout: 15000 });
  const y = await loc.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((top) => window.scrollTo(0, Math.max(0, top)), y - offset);
  await page.waitForTimeout(250);
}

const visibleText = (page) => page.locator("body").innerText();

/** Welcome → one-click demo entry ("Try as Alex" / "Try as Margaret") → that role's home. */
async function tryAs(page, base, who, homeRx) {
  await page.goto(`${base}#/`);
  await settle(page);
  await page.getByRole("button", { name: new RegExp(`Try as ${who}`) }).click();
  await page.waitForURL(homeRx, { timeout: 15000 });
  await ready(page);
}

/** Open a caregiver page through the sidebar, as a person would. */
async function openCaregiverPage(page, name, hashRx) {
  await page.locator(".cg-sidebar").getByRole("link", { name, exact: true }).first().click();
  await page.waitForURL(hashRx, { timeout: 15000 });
  await ready(page);
}

/**
 * Capture every screen into `stage` (nothing in the output folder is touched yet). Returns { problems, errors }.
 * Each screen's visible text is checked; the Overview also against overviewProblems.
 */
async function captureAll(browser, base, stage) {
  const problems = [];
  const errors = [];
  const shot = async (page, name) => {
    problems.push(...galleryProblems(name, await visibleText(page)));
    await page.screenshot({ path: join(stage, name) });
  };

  // 01: Welcome, at the top of the page.
  {
    const { ctx, page, errors: e } = await newPage(browser, DESKTOP);
    try {
      await page.goto(`${base}#/`);
      await ready(page);
      await page.getByRole("button", { name: /Try as Alex/ }).waitFor({ timeout: 15000 });
      await shot(page, "01-welcome.png");
    } finally {
      errors.push(...e);
      await ctx.close();
    }
  }

  // 02-05: Alex (caregiver), one context, in the order a person would click through.
  {
    const { ctx, page, errors: e } = await newPage(browser, DESKTOP);
    try {
      await tryAs(page, base, "Alex", /#\/c\/overview/);
      await page.getByRole("heading", { name: /What Kinwise noticed/ }).waitFor({ timeout: 15000 });
      problems.push(...overviewProblems(await page.locator("#main-content, main").first().innerText()));
      // The badge and the caveat must be on screen, not only somewhere in the page.
      for (const [what, rx] of [["Large difference", /Large difference/], ["not what caused it", /not what caused it/]]) {
        const loc = page.getByText(rx).first();
        if (!(await loc.isVisible().catch(() => false))) problems.push(`Overview: "${what}" is not visible`);
      }
      await shot(page, "02-caregiver-overview.png");

      await openCaregiverPage(page, "Symptoms & timeline", /#\/c\/timeline/);
      await scrollToTop(page, page.locator('[data-tour="timeline-compare"]'), 24);
      await shot(page, "03-timeline.png");

      await openCaregiverPage(page, "Medication review", /#\/c\/review/);
      await shot(page, "04-review.png");

      await openCaregiverPage(page, "Visit brief", /#\/c\/brief/);
      await page.getByRole("button", { name: "Use the standard template" }).click();
      const doc = page.locator('[data-tour="brief-doc"]');
      await doc.waitFor({ timeout: 15000 });
      await ready(page);
      // The review gate ("I've reviewed this brief", unticked) just above the brief, as in the first version.
      const gate = page.getByRole("checkbox", { name: /reviewed this brief/i });
      await scrollToTop(page, (await gate.count()) ? gate : doc, 28);
      await dismissOverlays(page);
      await shot(page, "05-visit-brief.png");
    } finally {
      errors.push(...e);
      await ctx.close();
    }
  }

  // 06: Margaret (patient) on a phone: type a check-in, let the on-device reading fill it in, show what it heard.
  {
    const { ctx, page, errors: e } = await newPage(browser, PHONE);
    try {
      await tryAs(page, base, "Margaret", /#\/p\/today/);
      await page.getByRole("textbox", { name: /Tell me about/ }).fill(PATIENT_STORY);
      await page.getByRole("button", { name: "Fill in my check-in" }).click();
      const title = page.locator("#pt-heard-title");
      await title.waitFor({ timeout: 10000 });
      const heard = title.locator("xpath=ancestor::section[1]");
      const heardText = (await heard.innerText()).replace(/\s+/g, " ");
      for (const rx of [/woozy[\s\S]*Dizzy/i, /fell off her bike[\s\S]*Someone else/i]) {
        if (!rx.test(heardText)) problems.push(`Patient Today: the check-in reading does not show ${rx}`);
      }
      await page.waitForTimeout(900); // the app scrolls to the reading itself; let that finish first
      await dismissOverlays(page);
      await scrollToTop(page, heard, 36);
      await shot(page, "06-patient-today-390.png");
    } finally {
      errors.push(...e);
      await ctx.close();
    }
  }

  // 00: the thumbnail. The card crop is the one-pager's plus the card title (captureScreens checks the featured layout).
  {
    const crop = await captureScreens(browser, base, stage);
    errors.push(...crop.errors);
    problems.push(...galleryProblems("Overview card crop", `${crop.title} ${crop.visitCardText}`));
    const tagline = taglineFromDevpost(readFileSync(join(ROOT, "submission", "DEVPOST.md"), "utf8"));
    const cardSrc = `data:image/png;base64,${readFileSync(crop.visitCardTitled).toString("base64")}`;
    const { ctx, page, errors: e } = await newPage(browser, THUMB);
    try {
      await page.goto(`${base}#/`);
      await ready(page);
      // The app's own rendered logo and demo-data chip (Welcome header), so the thumbnail cannot drift from the app.
      const logoHtml = await page.locator(".pub-header__brand .ui-logo, header .ui-logo").first().evaluate((el) => el.outerHTML);
      const chipHtml = await page.locator(".ui-demo-chip__trigger").first().evaluate((el) => el.outerHTML);
      const { css, html } = thumbnailHtml({ tagline, logoHtml, chipHtml, cardSrc });
      await page.evaluate(
        ([cssText, inner]) => {
          const style = document.createElement("style");
          style.textContent = cssText;
          document.head.append(style);
          const root = document.createElement("div");
          root.id = "kw-thumb";
          root.innerHTML = inner;
          document.body.append(root);
          document.documentElement.style.overflow = "hidden";
          window.scrollTo(0, 0);
        },
        [css, html],
      );
      await page.locator("#kw-thumb img").evaluate((img) => (img.complete ? null : new Promise((r) => (img.onload = r))));
      await page.evaluate(() => document.fonts.ready);
      const thumbText = await page.locator("#kw-thumb").innerText();
      problems.push(...galleryProblems("Thumbnail", thumbText));
      if (!/Fictional demo data/.test(thumbText)) problems.push('Thumbnail: no "Fictional demo data" chip');
      if (!thumbText.includes(tagline)) problems.push("Thumbnail: the tagline is not the one in DEVPOST.md");
      // Nothing may spill past the 1500x1000 frame or overlap the tagline.
      const spill = await page.evaluate(() => {
        const r = document.querySelector("#kw-thumb .kw-thumb__tagline").getBoundingClientRect();
        const top = document.querySelector("#kw-thumb .kw-thumb__top").getBoundingClientRect();
        const shot = document.querySelector("#kw-thumb .kw-thumb__shot").getBoundingClientRect();
        return { tagline: r.right > 1500 - 72 + 1, top: top.right > 1500 - 72 + 1, shotTop: shot.top, shotBottom: shot.bottom, taglineBottom: r.bottom };
      });
      if (spill.tagline || spill.top) problems.push("Thumbnail: the header or tagline runs past the right margin");
      if (spill.shotBottom > 1000 || spill.shotTop < spill.taglineBottom + 24) problems.push("Thumbnail: the card does not fit under the tagline (tagline too long?)");
      await page.screenshot({ path: join(stage, "00-thumbnail.png"), clip: { x: 0, y: 0, width: THUMB.width, height: THUMB.height } });
    } finally {
      errors.push(...e);
      await ctx.close();
    }
  }
  return { problems, errors };
}

/**
 * Capture the gallery into a staging folder, check it, and only then move the files into `outDir`. Throws (and
 * changes nothing in outDir) if any check fails. Returns a report row per file.
 */
export async function captureGallery(browser, base, outDir = SHOTS_DIR) {
  const stage = join(BUILD_DIR, "screenshots-stage");
  rmSync(stage, { recursive: true, force: true });
  ensureDir(stage);
  const { problems, errors } = await captureAll(browser, base, stage);
  if (problems.length) throw new Error(`screenshots: not written, the screens are not as expected:\n  - ${problems.join("\n  - ")}`);
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const name of GALLERY_ORDER) {
    const to = join(outDir, name);
    writeFileSync(to, readFileSync(join(stage, name)));
    files.push(to);
  }
  return { files, errors };
}

async function main() {
  ensureDir(BUILD_DIR);
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    const r = await captureGallery(browser, server.base, SHOTS_DIR);
    console.log(JSON.stringify({ written: r.files, consoleErrors: r.errors }, null, 2));
  } finally {
    await browser.close();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
