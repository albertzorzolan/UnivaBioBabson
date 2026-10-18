// Drives the real app (system Chrome) for the submission PDFs:
//   - captureScreens: fresh screenshots for the one-pager (Overview "Before vs after" card; Margaret's check-in
//                     "Here's what I heard"; reviewed Visit brief);
//   - sampleBrief:    signs in as Alex (one-click), builds the visit brief with the standard template (no LLM),
//                     marks it reviewed and prints it with the app's own print CSS via page.pdf().
// Every run uses a fresh browser context, so the app starts from its seeded demo record (fictional data).
//
// The browser clock is fixed to today at 10:30 local time (REVIEW_HOUR/REVIEW_MINUTE). The seed is relative to
// today, so the dates are unchanged, but "Reviewed by Alex on <date>, 10:30 AM" never shows the hour the build
// happened to run (an overnight build printed 3:53 AM). Timers keep running, so the app behaves normally.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pdfPageCount, settle } from "./lib.mjs";

const REVIEW_HOUR = 10;
const REVIEW_MINUTE = 30;
/** Matches the time the brief prints for the fixed clock ("10:30 AM" in en-US). */
const REVIEW_TIME_RE = /\b10:30\s?AM\b/i;

/** Today at 10:30 in the machine's local time zone (the browser context uses the same zone). */
export function fixedCaptureTime(now = new Date()) {
  const d = new Date(now);
  d.setHours(REVIEW_HOUR, REVIEW_MINUTE, 0, 0);
  return d;
}

async function newPage(browser, { width = 1280, height = 900, scale = 2 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
  });
  const page = await ctx.newPage();
  // Before the first navigation, so the seed, the check-in times and the review stamp all see the same "now".
  await page.clock.setFixedTime(fixedCaptureTime());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { ctx, page, errors };
}

/** Welcome → "Try as Alex" (the one-click caregiver demo button) → Overview. */
async function signInAsAlex(page, base) {
  await page.goto(`${base}#/`);
  await settle(page);
  await page.getByRole("button", { name: /Try as Alex/ }).click();
  await page.waitForURL(/#\/c\/overview/, { timeout: 15000 });
  await settle(page);
}

/** Welcome → "Try as Margaret" (the one-click patient demo button) → her check-in page. */
async function signInAsMargaret(page, base) {
  await page.goto(`${base}#/`);
  await settle(page);
  await page.getByRole("button", { name: /Try as Margaret/ }).click();
  await page.waitForURL(/#\/p\/today/, { timeout: 15000 });
  await settle(page);
}

/** Open the Visit brief through the sidebar, as a person would. */
async function openBrief(page, base) {
  const nav = page.getByRole("link", { name: /^Visit brief/ }).first();
  if (await nav.count()) await nav.click();
  else await page.goto(`${base}#/c/brief`);
  await page.waitForURL(/#\/c\/brief/, { timeout: 15000 });
  await settle(page);
}

async function buildTemplateBrief(page) {
  await page.getByRole("button", { name: "Use the standard template" }).click();
  await page.locator('[data-tour="brief-doc"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
}

/** Screenshot a locator's box grown by `pad` CSS px on each side (keeps edge glyphs from being clipped). */
async function shotWithPad(page, locator, path, pad = 0) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const b = await locator.boundingBox();
  if (!b) throw new Error(`capture: no box for ${path}`);
  await page.screenshot({ path, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad } });
  return path;
}

/** Viewport for the patient crop: narrow enough that her story wraps into a block that stays legible when scaled
 *  into the one-pager's middle column, wide enough to keep the desktop layout. */
const HEARD_VIEWPORT = { width: 860, height: 900 };

/** Margaret's check-in after she taps the first example story ("A wobbly morning"): the highlighted story from
 *  "Here's what I heard" (data-tour="checkin-heard" .pt-story), i.e. what the on-device NLP took from her words. */
async function captureHeard(browser, base, outDir) {
  const { ctx, page, errors } = await newPage(browser, { ...HEARD_VIEWPORT, scale: 3 });
  try {
    await signInAsMargaret(page, base);
    await page.getByRole("button", { name: "A wobbly morning" }).click();
    const story = page.locator('[data-tour="checkin-heard"] .pt-story');
    await story.waitFor({ timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const heardText = await story.innerText();
    // The labels the one-pager caption describes: her dizziness and near-fall, and her granddaughter's fall skipped.
    if (!/woozy[\s\S]*Dizzy/.test(heardText) || !/Near-fall/.test(heardText) || !/Someone else/.test(heardText)) {
      throw new Error(`capture: unexpected "Here's what I heard" story: ${heardText}`);
    }
    // The patient tab bar is sticky; hide it so it cannot sit on top of the crop.
    await page.addStyleTag({ content: ".pt-tabs, .ui-toasts { visibility: hidden !important; }" });
    const heard = await shotWithPad(page, story, join(outDir, "screen-heard.png"), 4);
    return { heard, heardText, errors };
  } finally {
    await ctx.close();
  }
}

/** One-pager screenshots, whole cards only (no mid-sentence crops), at 3× so the PDF stays sharp when zoomed:
 *  - the caregiver Overview's "Before vs after" card for the lorazepam finding (all three bar pairs);
 *  - the patient check-in's "Here's what I heard" story (captureHeard);
 *  - the Visit brief after "I've reviewed this brief" is ticked: its header band (status badge) and the
 *    day-by-day strip from section 2.
 * At 1440 px the app lays the caregiver views out in their compact desktop form (card beside the finding, strip
 * beside the text). */
export async function captureScreens(browser, base, outDir) {
  const patient = await captureHeard(browser, base, outDir);
  const { ctx, page, errors } = await newPage(browser, { width: 1440, height: 900, scale: 3 });
  errors.push(...patient.errors);
  try {
    await signInAsAlex(page, base);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600); // let charts finish their (reduced-motion) render
    await page.screenshot({ path: join(outDir, "screen-overview-full.png") });
    const aside = page.locator(".cg-ov-insight__aside").first();
    const asideText = await aside.innerText();
    if (!/Dizziness[\s\S]*\d+ of \d+ days[\s\S]*\d+ of \d+ days/.test(asideText)) throw new Error(`capture: unexpected Before vs after card: ${asideText}`);
    const beforeAfter = await shotWithPad(page, aside, join(outDir, "screen-before-after.png"));

    await openBrief(page, base);
    await buildTemplateBrief(page);
    const review = page.getByRole("checkbox", { name: /reviewed this brief/i });
    if (!(await review.isChecked())) await review.check();
    // Close the "Brief rebuilt" toast so it does not cover the document.
    for (const b of await page.getByRole("button", { name: "Dismiss notification" }).all()) await b.click().catch(() => {});
    await page.waitForTimeout(400);
    const doc = page.locator('[data-tour="brief-doc"]');
    const status = await doc.locator(".cg-vb-doc__status").innerText();
    if (!/^Reviewed by/.test(status.trim())) throw new Error(`capture: brief not marked reviewed (status "${status}")`);
    await assertReviewTime(doc);
    const briefDoc = join(outDir, "screen-brief-doc.png");
    await doc.screenshot({ path: briefDoc });
    const briefBand = await shotWithPad(page, doc.locator(".cg-vb-doc__band").first(), join(outDir, "screen-brief-band.png"), 4);
    const briefStrip = await shotWithPad(page, doc.locator(".cg-vb-strip").first(), join(outDir, "screen-brief-strip.png"), 6);
    return { beforeAfter, heard: patient.heard, heardText: patient.heardText, briefBand, briefStrip, briefDoc, asideText, briefStatus: status.trim(), errors };
  } finally {
    await ctx.close();
  }
}

/** The reviewed brief must carry the fixed review time, never the wall-clock hour of the build. */
async function assertReviewTime(doc) {
  const text = await doc.innerText();
  const line = text.split("\n").find((l) => /Reviewed by/i.test(l) && /\d:\d\d/.test(l)) ?? "";
  if (!REVIEW_TIME_RE.test(line)) throw new Error(`capture: review time is not 10:30 AM ("${line || text.slice(0, 160)}")`);
}

export async function sampleBrief(browser, base, outPdf) {
  const { ctx, page, errors } = await newPage(browser, { width: 1280, height: 900, scale: 1 });
  try {
    await signInAsAlex(page, base);
    await openBrief(page, base);
    await buildTemplateBrief(page);

    const review = page.getByRole("checkbox", { name: /reviewed this brief/i });
    if (!(await review.isChecked())) await review.check();
    if (!(await review.isChecked())) throw new Error("could not mark the brief as reviewed");
    await assertReviewTime(page.locator('[data-tour="brief-doc"]'));

    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    // Sanity: under print media only the app's print root is visible and it holds the reviewed brief.
    const printed = await page.evaluate(() => {
      const shown = [...document.body.children].filter((el) => getComputedStyle(el).display !== "none");
      return { classes: shown.map((el) => String(el.className)), text: shown.map((el) => el.innerText).join("\n") };
    });
    if (printed.classes.length !== 1 || !printed.classes[0].includes("cg-vb-print-root")) {
      throw new Error(`unexpected print output: ${JSON.stringify(printed.classes)}`);
    }
    if (!/OUR QUESTIONS/i.test(printed.text) || /not (been )?reviewed/i.test(printed.text.slice(0, 200))) {
      throw new Error(`print root does not hold a reviewed brief: ${printed.text.slice(0, 200)}`);
    }
    const pdf = await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true });
    writeFileSync(outPdf, pdf);
    return { pages: pdfPageCount(pdf), bytes: pdf.length, errors, text: printed.text };
  } finally {
    await ctx.close();
  }
}
