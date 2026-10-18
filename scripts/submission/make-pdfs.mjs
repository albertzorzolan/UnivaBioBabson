// Builds the three submission PDFs into submission/:
//
//   kinwise-one-pager.pdf            one US-Letter page: problem, links (live demo, video, code branch), one screenshot,
//                                    users and setting, flow, how it works, evidence, working / partial / planned, team
//   kinwise-one-pager-if-not-pushed.pdf   the same page with only the evidence that exists at REPO_BRANCH (built only
//                                    while this work is not on that branch; see "Two one-pagers" below)
//   kinwise-sample-visit-brief.pdf   the real app output: one-click caregiver sign-in → Visit brief → standard template
//                                    (no LLM) → "I've reviewed this brief" → printed with the app's own print CSS
//   kinwise-code-tour.pdf            curated, syntax-highlighted listings with contents, repo map and test counts
//   docs/screenshots/*.png           ("screens") the README / Devpost gallery and the 3:2 Devpost thumbnail, from the
//                                    current app (screenshots.mjs; checked before anything is overwritten)
//
// Usage (from the repo root):
//   node scripts/submission/make-pdfs.mjs                      # all three PDFs and the gallery screenshots
//   node scripts/submission/make-pdfs.mjs --only=onepager,brief,code,screens
//   node scripts/submission/make-pdfs.mjs --only=screens       # only docs/screenshots/ (same as screenshots.mjs)
//   node scripts/submission/make-pdfs.mjs --linked-branch-only   # only kinwise-one-pager-if-not-pushed.pdf
//   BASE_URL=http://127.0.0.1:5174/ node scripts/submission/make-pdfs.mjs   # reuse a running dev server
//   TEAM="Name (role), Name (role)" …     # team line; default DEFAULT_TEAM in lib.mjs (Albert Zorzolan and Neil Shah)
//   VIDEO_URL="https://youtu.be/…" …      # public demo-video link; without it the one-pager points to the Devpost page
//   SKIP_VITEST=1 …                       # reuse <BUILD_DIR>/vitest-report.json instead of running the suite
//   PDF_OUT_DIR=tmp/pdf-trial BUILD_DIR=tmp/pdf-trial/build …   # trial build that leaves submission/ untouched
//                                                              # (and writes the screenshots to <PDF_OUT_DIR>/screenshots)
//
// Release gate (warning only, read-only git): the PDFs link the code at REPO_BRANCH and the live demo deployed from it,
// but their evidence is read from this working tree. If some of that evidence is not on REPO_BRANCH, a loud warning
// lists it: do not upload the PDFs until a person has merged this work into REPO_BRANCH and redeployed.
//
// Two one-pagers: while evidenceNotOnBranch(REPO_BRANCH) reports gaps, the one-pager build also writes
// kinwise-one-pager-if-not-pushed.pdf from branchOnlyFacts() (every bullet whose source is missing at REPO_BRANCH is
// dropped; the rest falls back to what the branch records) and prints which file to upload in which case. Once there
// are no gaps (this work is on REPO_BRANCH), only kinwise-one-pager.pdf is built and an old fallback file is removed.
//
// It starts Vite on port 5222 (or a free port if 5222 is busy) and stops it on exit, drives the system Chrome via
// Playwright (channel "chrome"), and writes intermediate HTML, screenshots and PNG previews to tmp/submission-build/.
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD_DIR, DEFAULT_TEAM, OUT_DIR, REPO_BRANCH, ROOT, ensureDir, fileUrl, launchBrowser, pdfPageCount, startServer } from "./lib.mjs";
import { captureScreens, sampleBrief } from "./capture.mjs";
import { SHOTS_DIR, captureGallery } from "./screenshots.mjs";
import { branchOnlyFacts, collectFacts, evidenceNotOnBranch, testRunProblems } from "./facts.mjs";
import { onePagerHtml, overflowProbe } from "./onepager.mjs";
import { codeTourHtml } from "./codetour.mjs";

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
/** --linked-branch-only: build just the fallback one-pager (implies --only=onepager). */
const LINKED_BRANCH_ONLY = process.argv.includes("--linked-branch-only");
const ONLY = new Set((LINKED_BRANCH_ONLY ? "onepager" : onlyArg ? onlyArg.slice(7) : "onepager,brief,code,screens").split(",").map((s) => s.trim()));
const ONE_PAGER = "kinwise-one-pager.pdf";
const FALLBACK_ONE_PAGER = "kinwise-one-pager-if-not-pushed.pdf";
/** Team line on the one-pager. There is no placeholder any more: onePagerHtml throws on an empty team. */
const TEAM = process.env.TEAM?.trim() || DEFAULT_TEAM;
/** The gallery goes to docs/screenshots/ (or SHOTS_OUT_DIR); a trial build (PDF_OUT_DIR elsewhere) keeps it beside its PDFs. */
const SCREENS_DIR = OUT_DIR === join(ROOT, "submission") ? SHOTS_DIR : join(OUT_DIR, "screenshots");

async function htmlToPdf(browser, htmlPath, pdfPath, { waitFor = null, previewPages = [1], tagged = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
  await page.goto(fileUrl(htmlPath), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  let info = null;
  if (waitFor) {
    await page.waitForFunction(waitFor, null, { timeout: 180000 });
    info = await page.evaluate(() => window.__tour ?? null);
  }
  // PNG previews of chosen pages (rendered like print) for a visual check.
  await page.emulateMedia({ media: "print" });
  const previews = [];
  const pages = page.locator(".page");
  const count = await pages.count();
  for (const n of previewPages) {
    if (n > count) continue;
    const out = pdfPath.replace(/\.pdf$/, "").replace(OUT_DIR, BUILD_DIR) + `-p${n}.png`;
    await pages.nth(n - 1).screenshot({ path: out });
    previews.push(out);
  }
  const pdf = await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true, tagged, outline: tagged });
  writeFileSync(pdfPath, pdf);
  await ctx.close();
  return { pages: pdfPageCount(pdf), bytes: pdf.length, errors, info, previews };
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(BUILD_DIR);
  const needFacts = ONLY.has("onepager") || ONLY.has("code");
  const needApp = ONLY.has("onepager") || ONLY.has("brief") || ONLY.has("screens");
  const facts = needFacts ? collectFacts() : null;
  if (facts) writeFileSync(join(BUILD_DIR, "facts.json"), JSON.stringify(facts, null, 2));
  // Which one-pagers to build: the normal one (unless --linked-branch-only) and, while this work is not on the linked
  // branch, the fallback with only the evidence that exists there.
  const branch = ONLY.has("onepager") ? evidenceNotOnBranch(REPO_BRANCH) : null;
  const buildNormal = ONLY.has("onepager") && !LINKED_BRANCH_ONLY;
  const buildFallback = ONLY.has("onepager") && (LINKED_BRANCH_ONLY || Boolean(branch?.gaps?.length));
  if (LINKED_BRANCH_ONLY && branch?.gaps == null) throw new Error(`make-pdfs: cannot compare with ${REPO_BRANCH} (git unavailable or branch missing), so no fallback one-pager can be built`);
  const fallbackFacts = buildFallback ? branchOnlyFacts(facts, { branch: REPO_BRANCH, gapKeys: branch.keys }) : null;
  if (fallbackFacts) writeFileSync(join(BUILD_DIR, "facts-linked-branch.json"), JSON.stringify(fallbackFacts, null, 2));
  // The normal one-pager prints the last e2e/a11y results. A partial or failing run must never reach submission/: stop
  // before anything is written there; a trial build (PDF_OUT_DIR elsewhere) still renders but exits non-zero. (The
  // fallback prints the counts the branch recorded, not these runs.)
  const runProblems = buildNormal ? testRunProblems(facts.tests) : [];
  if (runProblems.length) {
    const msg = `make-pdfs: the last browser-test results cannot go on the one-pager:\n  - ${runProblems.join("\n  - ")}`;
    if (OUT_DIR === join(ROOT, "submission")) throw new Error(`${msg}\nRe-run npm run test:e2e and npm run test:a11y, then build again.`);
    console.error(msg);
  }

  const server = needApp ? await startServer() : null;
  const browser = await launchBrowser();
  const report = [];
  let failed = runProblems.length > 0;
  try {
    if (ONLY.has("brief")) {
      const out = join(OUT_DIR, "kinwise-sample-visit-brief.pdf");
      const r = await sampleBrief(browser, server.base, out);
      report.push({ file: out, pages: r.pages, bytes: r.bytes, errors: r.errors });
      if (r.pages > 2) failed = true;
    }
    if (ONLY.has("screens")) {
      // Checked before anything is overwritten (screenshots.mjs): on a failed check docs/screenshots/ stays as it was,
      // the PDFs are still built, and the run exits non-zero.
      try {
        const r = await captureGallery(browser, server.base, SCREENS_DIR);
        report.push({ screenshots: r.files, errors: r.errors });
      } catch (e) {
        console.error(String(e?.stack ?? e));
        failed = true;
      }
    }
    if (ONLY.has("onepager")) {
      const shots = await captureScreens(browser, server.base, BUILD_DIR);
      const builds = [
        buildNormal && { facts, file: ONE_PAGER, html: "one-pager.html", linkedBranchOnly: false },
        buildFallback && { facts: fallbackFacts, file: FALLBACK_ONE_PAGER, html: "one-pager-if-not-pushed.html", linkedBranchOnly: true },
      ].filter(Boolean);
      for (const b of builds) {
        const r = await onePagerPdf(browser, { ...b, shots });
        report.push(r);
        if (!r.fits) failed = true;
      }
      // After the push there is nothing to fall back to: remove an old fallback so it cannot be uploaded by mistake.
      const stale = join(OUT_DIR, FALLBACK_ONE_PAGER);
      if (buildNormal && !buildFallback && branch?.gaps?.length === 0 && existsSync(stale)) {
        rmSync(stale);
        console.log(`make-pdfs: removed ${stale} (all printed evidence is on ${REPO_BRANCH} now; upload ${ONE_PAGER})`);
      }
    }
    if (ONLY.has("code")) {
      const html = codeTourHtml({ facts });
      const htmlPath = join(BUILD_DIR, "code-tour.html");
      writeFileSync(htmlPath, html);
      const out = join(OUT_DIR, "kinwise-code-tour.pdf");
      const r = await htmlToPdf(browser, htmlPath, out, { waitFor: () => window.__tour?.done === true, previewPages: [1, 2, 3, 4, 5, 6, 7], tagged: true });
      report.push({ file: out, pages: r.pages, laidOut: r.info?.total, overflowPages: r.info?.overflow, bytes: r.bytes, errors: r.errors, previews: r.previews });
      if (r.info?.overflow?.length || r.pages !== r.info?.total) failed = true;
    }
  } finally {
    await browser.close();
    if (server) await server.stop();
  }
  for (const r of report) console.log(JSON.stringify(r, null, 2));
  if (facts) warnBranchGaps();
  if (buildNormal && buildFallback) uploadAdvice();
  if (ONLY.has("onepager")) console.log(`make-pdfs: one-pager team line: "${TEAM}"${process.env.VIDEO_URL ? "" : "; no VIDEO_URL, so it says the demo video is on the Devpost page"}`);
  if (failed) {
    console.error("make-pdfs: a check failed (see above)");
    process.exitCode = 1;
  }
}

/**
 * One single-page PDF from onePagerHtml: renders it, checks that it is one page and that nothing overflows (no element
 * past the page's padding box, no evidence bullet past the margin or wrapped), and returns a report row.
 */
async function onePagerPdf(browser, { facts, shots, file, html, linkedBranchOnly }) {
  const htmlPath = join(BUILD_DIR, html);
  writeFileSync(htmlPath, onePagerHtml({ facts, shots, team: TEAM, linkedBranchOnly }));
  const out = join(OUT_DIR, file);
  const r = await htmlToPdf(browser, htmlPath, out);
  const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 } });
  const p = await ctx.newPage();
  await p.goto(fileUrl(htmlPath));
  await p.evaluate(() => document.fonts.ready);
  await p.emulateMedia({ media: "print" });
  const fit = await p.evaluate(overflowProbe);
  await ctx.close();
  // Every element must end inside the page's padding box (a flexed column could otherwise spill unnoticed).
  const overflow = fit.overBottom > 0 || fit.overRight > 0 || fit.evClipped > 0 || fit.evWrapped > 0;
  return {
    file: out,
    pages: r.pages,
    bytes: r.bytes,
    slackPx: fit.slack,
    overBottomPx: fit.overBottom,
    overRightPx: fit.overRight,
    evidenceNotOneLine: fit.evClipped + fit.evWrapped,
    errors: [...shots.errors, ...r.errors],
    previews: r.previews,
    fits: r.pages === 1 && !overflow,
  };
}

/** Which one-pager to upload, printed whenever both were built. */
function uploadAdvice() {
  const bar = "=".repeat(100);
  console.log(
    [
      bar,
      "make-pdfs: TWO one-pagers were built. Upload exactly one of them to Devpost:",
      `  - ${join(OUT_DIR, ONE_PAGER)}`,
      `      if ${REPO_BRANCH} has been fast-forwarded to this work (pushed) and the live demo redeployed from it;`,
      `  - ${join(OUT_DIR, FALLBACK_ONE_PAGER)}`,
      `      if ${REPO_BRANCH} is still the submitted version: it prints only evidence a judge can reproduce there.`,
      "After the push, run this script again: it then builds only the first file and removes the second.",
      bar,
    ].join("\n"),
  );
}

/** Loud, non-fatal: evidence printed in the PDFs that a judge cannot reproduce from the linked branch. */
function warnBranchGaps() {
  const { branch, gaps } = evidenceNotOnBranch(REPO_BRANCH);
  if (gaps == null) {
    console.warn(`make-pdfs: WARNING could not compare the evidence with branch ${branch} (git unavailable or branch missing)`);
    return;
  }
  if (!gaps.length) return;
  const bar = "!".repeat(100);
  console.warn(
    [
      bar,
      `make-pdfs: WARNING the PDFs link ${branch}, but this evidence is not on ${branch}:`,
      ...gaps.map((g) => `  - ${g}`),
      `Do not upload these PDFs until a person merges this work into ${branch} and redeploys the live demo` +
        (ONLY.has("onepager") ? ` (for the one-pager, ${FALLBACK_ONE_PAGER} is the version to upload until then).` : "."),
      bar,
    ].join("\n"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
