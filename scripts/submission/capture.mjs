// Drives the real app (system Chrome) for the submission PDFs:
//   - captureScreens: the one-pager's screenshot, one wide crop of the caregiver Overview's first "What Kinwise
//                     noticed" card (the counts, the before/after bars, the caveat, the falls and the "Question for
//                     the visit" box);
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

/** The union of several boxes ({ x, y, width, height }), grown by `pad` CSS px on each side. */
export function unionBox(boxes, pad = 0) {
  const left = Math.min(...boxes.map((b) => b.x)) - pad;
  const top = Math.min(...boxes.map((b) => b.y)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return { x: Math.max(0, left), y: Math.max(0, top), width: right - Math.max(0, left), height: bottom - Math.max(0, top) };
}

/**
 * Viewport for the Overview crop. The app's content column stops growing at about 1,080 px, so at 1560 px the card
 * reaches its widest, flattest layout (the lead fits on 3 lines), which keeps the crop about 3 : 1 and its text legible
 * at the one-pager's full width. Scale 3 keeps it sharp when the PDF is zoomed.
 */
const CARD_VIEWPORT = { width: 1560, height: 1000, scale: 3 };

/**
 * One wide crop of the first "What Kinwise noticed" card on the caregiver Overview: the lead sentence with its counts,
 * the "Before vs after" bars, the caveat ("Shows a change in what was recorded, not what caused it."), the falls box and
 * the "Question for the visit". The crop is the union of those elements' boxes: one contiguous piece of the real screen
 * with nothing hidden, so the card's two buttons, which sit beside the caveat, are in it too. The card title is above
 * the crop; the one-pager's caption names the card instead.
 */
export async function captureScreens(browser, base, outDir) {
  const { ctx, page, errors } = await newPage(browser, CARD_VIEWPORT);
  try {
    await signInAsAlex(page, base);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600); // let charts finish their (reduced-motion) render
    await page.screenshot({ path: join(outDir, "screen-overview-full.png") });
    // The first insight is the featured one (question beside the evidence); fail loudly if the layout changed.
    const card = page.locator(".cg-ov-insight").first();
    const parts = {
      lead: card.locator(".cg-ov-insight__lead"),
      bars: card.locator(".cg-ov-insight__aside"),
      caveat: card.locator(".cg-ov-insight__caveat"),
      falls: card.locator(".cg-ov-falls"),
      question: card.locator(".cg-ov-question"),
    };
    const boxes = {};
    for (const [name, loc] of Object.entries(parts)) {
      if ((await loc.count()) !== 1) throw new Error(`capture: the Overview card has ${await loc.count()} "${name}" elements, expected 1`);
      boxes[name] = await loc.boundingBox();
    }
    const barsText = await parts.bars.innerText();
    if (!/Dizziness[\s\S]*\d+ of \d+ days[\s\S]*\d+ of \d+ days/.test(barsText)) throw new Error(`capture: unexpected Before vs after bars: ${barsText}`);
    const questionText = (await parts.question.innerText()).trim();
    if (!/^Question for the visit/i.test(questionText)) throw new Error(`capture: unexpected question box: ${questionText}`);
    // The question must sit beside the bars (featured layout); stacked, the crop would be a tall strip.
    if (boxes.question.x < boxes.bars.x + boxes.bars.width) throw new Error("capture: the question is not beside the bars (viewport too narrow?)");
    const clip = unionBox(Object.values(boxes), 8);
    const visitCard = join(outDir, "screen-visit-card.png");
    await page.screenshot({ path: visitCard, clip });
    const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
    const visitCardText = [await text(parts.lead), await text(parts.bars), await text(parts.caveat), await text(parts.falls), questionText.replace(/\s+/g, " ")].join(" ");
    return { visitCard, visitCardText, width: clip.width, height: clip.height, errors };
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
