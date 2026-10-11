// Shared plumbing for scripts/browser-test.mjs (npm run test:e2e) and scripts/a11y.mjs (npm run test:a11y).
//
// Build-independent: unless BASE_URL is set, it starts its own Vite dev server on a free 127.0.0.1 port, drives
// the system Chrome (Playwright channel "chrome") headless, and saves screenshots under test-results/ (gitignored).
//
//   BASE_URL=http://127.0.0.1:5174/ npm run test:e2e     # reuse a server that is already running
//   HEADED=1 npm run test:e2e                            # watch it
//   ONLY=fhir,brief npm run test:e2e                     # run checks whose id contains one of these words
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const STORE_KEY = "kinwise.v1.store";
export const SESSION_KEY = "kinwise.v1.session";

export function outDir(name) {
  const dir = join(ROOT, "test-results", name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function freePort() {
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

/** Start (or reuse via BASE_URL) the app server. Returns { base, stop }. base ends with "/". */
export async function startServer() {
  if (process.env.BASE_URL) {
    const base = process.env.BASE_URL.endsWith("/") ? process.env.BASE_URL : `${process.env.BASE_URL}/`;
    await waitForHttp(base, 15000);
    return { base, stop: async () => {} };
  }
  const port = await freePort();
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

/**
 * New isolated context (fresh localStorage = the seeded demo record). `role` pre-signs the demo in via
 * sessionStorage before any app code runs. Every request is checked against the server origin.
 */
export async function newContext(browser, base, { role = null, viewport = { width: 1280, height: 900 }, colorScheme = "light", reducedMotion = "reduce", extraInit = null } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme, reducedMotion, acceptDownloads: true, locale: "en-US" });
  if (role) {
    await ctx.addInitScript(
      ([key, r]) => {
        // Only on the very first document of this context, so a test can sign out / switch roles later.
        try {
          if (!sessionStorage.getItem("__kw_e2e_seeded")) {
            sessionStorage.setItem(key, r);
            sessionStorage.setItem("__kw_e2e_seeded", "1");
          }
        } catch {
          /* ignore */
        }
      },
      [SESSION_KEY, role],
    );
  }
  if (extraInit) await ctx.addInitScript(extraInit);
  return ctx;
}

/** Attach console / page-error / network recorders to a page. */
export function instrument(page, base, sink) {
  const origin = new URL(base).origin;
  page.on("console", (m) => {
    if (m.type() === "error") sink.consoleErrors.push({ url: page.url(), text: m.text() });
    else if (m.type() === "warning") sink.consoleWarnings.push({ url: page.url(), text: m.text() });
  });
  page.on("pageerror", (e) => sink.consoleErrors.push({ url: page.url(), text: `pageerror: ${e.message}` }));
  page.on("request", (req) => {
    const u = req.url();
    if (u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) return;
    let o = "";
    try {
      o = new URL(u).origin;
    } catch {
      o = u;
    }
    if (o !== origin) sink.foreignRequests.push({ from: page.url(), url: u });
  });
  return page;
}

export function newSink() {
  return { consoleErrors: [], consoleWarnings: [], foreignRequests: [] };
}

/** Navigate to a hash route ("/c/overview") and wait for the app to settle. */
export async function go(page, base, route) {
  const url = `${base}#${route}`;
  if (page.url() === "about:blank") await page.goto(url);
  else {
    await page.goto(url);
  }
  await page.waitForLoadState("domcontentloaded");
  await settle(page);
}

/** Wait until the lazy route has rendered its <h1> and the network is quiet. */
export async function settle(page, timeout = 15000) {
  await page.waitForFunction(() => document.querySelector("#main-content h1, main h1"), null, { timeout }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
}

export function selectedChecks(all) {
  const only = (process.env.ONLY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!only.length) return all;
  return all.filter((c) => only.some((w) => c.id.includes(w)));
}

/** Print a PASS/FAIL table. results: [{ id, title, ok, ms, detail }] */
export function printTable(title, results) {
  const w1 = Math.max(4, ...results.map((r) => r.id.length));
  const line = "─".repeat(Math.min(140, w1 + 80));
  console.log(`\n${title}\n${line}`);
  console.log(`${"RESULT".padEnd(7)} ${"CHECK".padEnd(w1)}  ${"TIME".padStart(7)}  DETAIL`);
  console.log(line);
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    const t = `${(r.ms / 1000).toFixed(1)}s`.padStart(7);
    const detail = String(r.detail ?? "").split("\n");
    console.log(`${tag.padEnd(7)} ${r.id.padEnd(w1)}  ${t}  ${detail[0]}`);
    for (const d of detail.slice(1)) console.log(`${"".padEnd(7)} ${"".padEnd(w1)}  ${"".padStart(7)}  ${d}`);
  }
  console.log(line);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed} passed, ${failed} failed\n`);
  return failed;
}

/** Tiny assertion helper that produces readable failure details. */
export function expect(cond, message) {
  if (!cond) throw new Error(message);
}
