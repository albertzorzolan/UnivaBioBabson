// Shared plumbing for scripts/submission/make-pdfs.mjs: dev server, system Chrome, fonts, small helpers.
//
// The server: BASE_URL wins (reuse a running app). Otherwise a Vite dev server is started on PORT (default 5222);
// if that port is taken, a free 127.0.0.1 port is used instead. The server is always stopped on exit.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Where the PDFs go. PDF_OUT_DIR (relative to the repo root) sends a trial build to e.g. tmp/ instead of submission/. */
export const OUT_DIR = process.env.PDF_OUT_DIR ? resolve(ROOT, process.env.PDF_OUT_DIR) : join(ROOT, "submission");
/** Intermediate HTML + screenshots (gitignored via tmp/). BUILD_DIR overrides it, also relative to the repo root. */
export const BUILD_DIR = process.env.BUILD_DIR ? resolve(ROOT, process.env.BUILD_DIR) : join(ROOT, "tmp", "submission-build");
export const STORE_KEY = "kinwise.v1.store";
export const SESSION_KEY = "kinwise.v1.session";

// Public links printed in the submission materials. Keep them in this one place.
export const REPO_URL = "https://github.com/albertzorzolan/UnivaBioBabson";
/** The submitted code lives on this branch; the repo's default branch ("main") still holds the older Prototype 1. */
export const REPO_BRANCH = "medwatch-v2";
/** Link judges should use for the code: the branch view, not the repo root (which opens the default branch). */
export const CODE_URL = `${REPO_URL}/tree/${REPO_BRANCH}`;
/** Live demo on GitHub Pages, deployed from medwatch-v2 (live since 2026-10-11). */
export const DEMO_URL = "https://albertzorzolan.github.io/UnivaBioBabson/";
/** Public video link (e.g. YouTube). A person uploads the video, so it is passed in: VIDEO_URL="https://…". */
export const VIDEO_URL = process.env.VIDEO_URL?.trim() || null;
export const DEFAULT_TEAM = "Albert Zorzolan and Neil Shah, Babson College";
export const PLANNED_DEMO_URL = DEMO_URL; // deprecated alias, codetour.mjs migrates in P2

/** A URL without its scheme or trailing slash, for printing ("github.com/…"). */
export function shortUrl(url) {
  return String(url).replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

export function readJsonIfExists(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

function portFree(port) {
  return new Promise((res) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", () => res(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => res(true)));
  });
}

function anyFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function waitForHttp(url, ms, proc) {
  const until = Date.now() + ms;
  let last = "";
  while (Date.now() < until) {
    if (proc && proc.exitCode !== null) throw new Error(`dev server exited early (code ${proc.exitCode})`);
    try {
      const r = await fetch(url);
      if (r.ok) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = String(e?.message ?? e);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server did not answer at ${url} within ${ms} ms (${last})`);
}

/** Start (or reuse via BASE_URL) the app. Returns { base, stop }; base ends with "/". */
export async function startServer() {
  if (process.env.BASE_URL) {
    const base = process.env.BASE_URL.endsWith("/") ? process.env.BASE_URL : `${process.env.BASE_URL}/`;
    await waitForHttp(base, 15000);
    return { base, stop: async () => {} };
  }
  const wanted = Number(process.env.PORT ?? 5222);
  const port = (await portFree(wanted)) ? wanted : await anyFreePort();
  const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const proc = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0" },
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}/`;
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

export async function launchBrowser() {
  return chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
}

/** Wait until a lazy route has rendered its <h1> and the network is quiet. */
export async function settle(page, timeout = 15000) {
  await page.waitForFunction(() => document.querySelector("#main-content h1, main h1"), null, { timeout }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
}

/** Page count of a PDF buffer (counts /Type /Page objects, not /Pages). */
export function pdfPageCount(buf) {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** file:// URL for a path, for fonts and images referenced from generated HTML. */
export function fileUrl(p) {
  return pathToFileURL(p).href;
}

/** The app's bundled fonts (OFL, public/fonts), so the PDFs match the product. */
export function fontFaceCss() {
  const f = (name) => fileUrl(join(ROOT, "public", "fonts", name));
  return `
@font-face { font-family: "DM Sans"; font-weight: 400; src: url("${f("dm-sans-0.ttf")}") format("truetype"); }
@font-face { font-family: "DM Sans"; font-weight: 500; src: url("${f("dm-sans-1.ttf")}") format("truetype"); }
@font-face { font-family: "DM Sans"; font-weight: 600; src: url("${f("dm-sans-2.ttf")}") format("truetype"); }
@font-face { font-family: "DM Sans"; font-weight: 700; src: url("${f("dm-sans-3.ttf")}") format("truetype"); }
@font-face { font-family: "Source Serif 4"; font-style: normal; font-weight: 400 700; src: url("${f("source-serif-4-latin-var.woff2")}") format("woff2"); }
@font-face { font-family: "Source Serif 4"; font-style: italic; font-weight: 400 700; src: url("${f("source-serif-4-latin-italic-var.woff2")}") format("woff2"); }
`;
}

/** Brand tokens (light theme) copied from src/ui/tokens.css so the PDFs use the app's palette. */
export const TOKENS_CSS = `
:root {
  --bg: #f7f5ef; --surface: #fffdf9; --surface-sunken: #efece3; --surface-tint: #eef2ea;
  --ink: #1f2a26; --ink-muted: #5e6a64; --line: #e3e0d6; --line-strong: #7f8882;
  --primary: #25584a; --primary-soft: #e3ede7; --primary-soft-ink: #1e4a3e;
  --accent: #a9573a; --accent-soft: #f6e6dc; --accent-bright: #c8734f;
  --caution: #b7791f; --caution-soft: #f8edd8; --caution-ink: #7d5210;
  --info: #2f5f8a; --info-soft: #e6eef5;
  --success: #4f7f5e; --success-soft: #e5efe6;
  --font-sans: "DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-serif: "Source Serif 4", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}`;

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Short git info for footers (best effort; the PDFs do not depend on it). */
export function gitInfo() {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
    return { sha };
  } catch {
    return { sha: null };
  }
}

/** Render a page in print media to PNG previews of its first pages (for visual checks). */
export async function pngOfHtml(browser, htmlPath, outPng, { width = 816, height = 1056, full = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(fileUrl(htmlPath));
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outPng, fullPage: full });
  await ctx.close();
}
