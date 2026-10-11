#!/usr/bin/env node
// On-device LLM smoke test + mini evaluation (SPEC §9 "LLM (local WebGPU on the M1 Pro)").
//
// Starts a Vite dev server, opens /ai-harness.html in headless Chrome with WebGPU enabled, loads each
// model from public/models/resolve/<folder>/ and runs every AI task on the fixed Margaret fixture:
// brief draft, 4 record questions, 4 extraction-refinement stories (incl. a prompt-injection story),
// 3 finding explanations. Every output goes through the same verification code as the app.
// Writes eval/results/llm-smoke.json (model, task, ok, kept, dropped, ms, raw, …) and prints a summary.
//
// Usage:
//   node scripts/llm-smoke.mjs [--models id1,id2] [--tasks brief,answer,refine,explain] [--download] [--port 5187]
//   --download  fetch missing models first (only when a speed probe shows ≥ 20 MB/s)

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Long unattended runs: keep macOS from idle-sleeping (which freezes Chrome and Node mid-run and
// was observed to stretch a 40 s task to 17 minutes of wall time). Ends with this process.
if (process.platform === "darwin") {
  spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref();
}
const LEGACY_FOLDERS = { "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": "qwen2.5-1.5b" };
const folderOf = (id) => LEGACY_FOLDERS[id] ?? id;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const models = arg("models", "Qwen2.5-1.5B-Instruct-q4f16_1-MLC,Qwen3.5-2B-q4f16_1-MLC,Qwen2.5-3B-Instruct-q4f16_1-MLC").split(",");
const tasks = arg("tasks", "brief,answer,refine,explain").split(",");
const port = Number(arg("port", "5187"));
const allowDownload = process.argv.includes("--download");

/** Download speed probe: one ~30 MB shard. Returns MB/s or 0 on failure. */
function probeSpeed() {
  const url = "https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/main/params_shard_1.bin";
  const r = spawnSync("curl", ["-sL", "--max-time", "30", "-o", "/dev/null", "-w", "%{speed_download}", url], { encoding: "utf8" });
  return r.status === 0 ? Number(r.stdout) / 1e6 : 0;
}

const isLocal = (id) => existsSync(path.join(ROOT, "public/models/resolve", folderOf(id), "mlc-chat-config.json"));
const missing = models.filter((m) => !isLocal(m));
const skipped = {};
if (missing.length) {
  const speed = allowDownload ? probeSpeed() : 0;
  for (const m of missing) {
    if (allowDownload && speed >= 20) {
      console.log(`Downloading ${m} (probe ${speed.toFixed(1)} MB/s)…`);
      const r = spawnSync("node", ["scripts/download-model.mjs", m], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) skipped[m] = "download failed";
    } else {
      skipped[m] = allowDownload ? `download too slow (${speed.toFixed(1)} MB/s < 20 MB/s)` : "not downloaded (pass --download)";
    }
  }
}
const runModels = models.filter((m) => !skipped[m]);

// Pre-bundle the heavy dependencies so Vite does not re-optimise (and reload the page) mid-run.
const server = await createServer({
  root: ROOT,
  logLevel: "warn",
  // No HMR / file watching: other work in the repo must not reload the page mid-evaluation.
  server: { port, strictPort: true, host: "127.0.0.1", hmr: false, watch: null },
  optimizeDeps: { include: ["@mlc-ai/web-llm", "react", "react-dom/client"], entries: ["ai-harness.html"] },
});
await server.listen();
const origin = `http://127.0.0.1:${port}`;
// A persistent profile (like a real user's Chrome): ephemeral contexts have small storage quotas,
// which stall multi-GB model caching. tmp/ is git-ignored. The model cache persists between runs.
const PROFILE = path.join(ROOT, "tmp", "llm-smoke-profile");
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=metal", "--ignore-gpu-blocklist"],
});

const external = new Set();
const runs = [];
let gpu = null;
try {
  for (const model of runModels) {
    const page = await browser.newPage();
    page.on("request", (r) => {
      const u = r.url();
      if (!u.startsWith(origin) && !u.startsWith("blob:") && !u.startsWith("data:")) external.add(u);
    });
    page.on("console", (m) => {
      const text = m.text();
      if (m.type() === "error" && !/Failed to load resource/.test(text)) console.log(`  [browser] ${text.slice(0, 300)}`);
      if (text.startsWith("[harness]")) console.log(`  ${text.slice(0, 200)}`);
    });
    page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message.slice(0, 300)}`));
    const open = async () => {
      await page.goto(`${origin}/ai-harness.html?model=${encodeURIComponent(model)}`);
      await page.waitForFunction(() => Boolean(window.__kinwiseHarness), null, { timeout: 60_000 });
    };
    await open();
    gpu ??= await page.evaluate(async () => {
      const a = await navigator.gpu?.requestAdapter();
      return a ? { vendor: a.info?.vendor ?? null, architecture: a.info?.architecture ?? null, shaderF16: a.features.has("shader-f16") } : null;
    });
    console.log(`\n▶ ${model}: loading…`);
    let load;
    try {
      try {
        load = await page.evaluate((id) => window.__kinwiseHarness.load(id), model);
      } catch (err) {
        // A dev-server reload (dependency optimisation) destroys the page context: reopen once.
        if (!/context was destroyed|navigation/i.test(String(err))) throw err;
        await open();
        load = await page.evaluate((id) => window.__kinwiseHarness.load(id), model);
      }
    } catch (err) {
      console.log(`  load failed: ${String(err).slice(0, 400)}`);
      runs.push({ model, error: String(err), results: [] });
      await page.close();
      continue;
    }
    console.log(`  loaded from ${load.source} in ${load.loadMs} ms; running ${tasks.join(", ")}…`);
    const adapters = await page.evaluate(() => window.__kinwiseHarness.adapters);
    const t0 = Date.now();
    const results = await page.evaluate((t) => window.__kinwiseHarness.runAll(t), tasks);
    console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    for (const r of results) {
      console.log(`  ${r.ok ? "✓" : "✗"} ${r.task.padEnd(8)} ${r.caseId.padEnd(52).slice(0, 52)} ${String(r.ms).padStart(6)} ms  kept ${r.kept}  dropped ${r.dropped}${r.error ? `  ${r.error.slice(0, 120)}` : ""}`);
    }
    await page.evaluate(() => window.__kinwiseHarness.unload());
    await page.close();
    runs.push({ model, source: load.source, loadMs: load.loadMs, adapters, results });
  }
} finally {
  await browser.close();
  await server.close();
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}
function summarize(run) {
  const by = {};
  for (const r of run.results) {
    const t = (by[r.task] ??= { cases: 0, ok: 0, kept: 0, dropped: 0, ms: [] });
    t.cases++;
    if (r.ok) t.ok++;
    t.kept += r.kept;
    t.dropped += r.dropped;
    t.ms.push(r.ms);
  }
  const out = {};
  for (const [task, t] of Object.entries(by)) {
    out[task] = {
      cases: t.cases,
      ok: t.ok,
      sentencesKept: t.kept,
      sentencesDropped: t.dropped,
      sentenceValidityRate: t.kept + t.dropped ? Number((t.kept / (t.kept + t.dropped)).toFixed(3)) : null,
      medianMs: median(t.ms),
      maxMs: Math.max(...t.ms),
    };
  }
  const refine = run.results.filter((r) => r.task === "refine" && r.score);
  if (refine.length) {
    out.refine.expectedFound = refine.reduce((s, r) => s + r.score.found, 0);
    out.refine.expectedTotal = refine.reduce((s, r) => s + r.score.expected, 0);
    out.refine.forbiddenAdded = refine.flatMap((r) => r.score.forbiddenAdded);
  }
  return out;
}

const report = {
  generatedAt: new Date().toISOString(),
  runtime: "@mlc-ai/web-llm 0.2.85 (WebGPU, Web Worker), temperature 0, JSON-schema grammar",
  machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? null, memoryGB: Math.round(os.totalmem() / 2 ** 30), gpu },
  fixture: "src/ai/fixtures.ts (fictional Margaret story, 27 evidence items)",
  tasks,
  skipped,
  externalRequests: [...external],
  models: runs.map((r) => ({ model: r.model, source: r.source ?? null, loadMs: r.loadMs ?? null, error: r.error ?? null, adapters: r.adapters ?? null, summary: summarize(r), results: r.results })),
};
await mkdir(path.join(ROOT, "eval/results"), { recursive: true });
await writeFile(path.join(ROOT, "eval/results/llm-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nWrote eval/results/llm-smoke.json${Object.keys(skipped).length ? ` (skipped: ${JSON.stringify(skipped)})` : ""}`);
for (const m of report.models) console.log(`${m.model}: ${JSON.stringify(m.summary)}`);
if (external.size) console.log(`External requests: ${[...external].join(", ")}`);
