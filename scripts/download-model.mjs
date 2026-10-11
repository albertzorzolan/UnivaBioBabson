#!/usr/bin/env node
// Download a WebLLM (MLC) model into public/models/resolve/<folder>/ for local development, offline demos
// and the LLM smoke test. Development-only: the deployed app downloads weights straight from Hugging Face
// in the browser (see src/ai/models.ts). public/models/ is git-ignored.
//
// Usage:
//   node scripts/download-model.mjs <model_id> [--folder <name>] [--revision <sha|main>] [--concurrency 4]
//   node scripts/download-model.mjs --list
//
// What it fetches (the same files WebLLM would fetch):
//   mlc-chat-config.json, tensor-cache.json, tokenizer files, every params_shard_*.bin, and the compiled
//   WebGPU library (saved as model.wasm). The Hugging Face revision is pinned to a commit sha.
// Resumable: finished files are skipped (size-checked); partial downloads continue with curl -C -.
// Integrity: every file gets a sha256 in manifest.json; large (LFS) files are checked against the
// sha256 that Hugging Face publishes for them (x-linked-etag).

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = path.join(ROOT, "public", "models", "resolve");
/** Folder names that differ from the model id (must match localFolder in src/ai/models.ts). */
const LEGACY_FOLDERS = { "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": "qwen2.5-1.5b" };

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const { prebuiltAppConfig } = await import("@mlc-ai/web-llm");

if (process.argv.includes("--list")) {
  for (const r of prebuiltAppConfig.model_list) {
    if (/q4f16_1/.test(r.model_id) && !/embed/i.test(r.model_id)) console.log(`${r.model_id}  (${Math.round(r.vram_required_MB ?? 0)} MB VRAM)`);
  }
  process.exit(0);
}

const modelId = process.argv[2];
if (!modelId || modelId.startsWith("--")) {
  console.error("Usage: node scripts/download-model.mjs <model_id> [--folder <name>] [--revision <sha|main>]\n       node scripts/download-model.mjs --list");
  process.exit(2);
}
const record = prebuiltAppConfig.model_list.find((r) => r.model_id === modelId);
if (!record) {
  console.error(`${modelId} is not in WebLLM's prebuilt model list. Run with --list to see options.`);
  process.exit(2);
}

const folder = arg("folder", LEGACY_FOLDERS[modelId] ?? modelId);
const concurrency = Number(arg("concurrency", "4"));
const dir = path.join(MODELS_DIR, folder);
const repo = record.model.replace(/\/+$/, "").replace(/\/resolve\/.*$/, "");
const repoName = repo.replace("https://huggingface.co/", "");

async function resolveRevision() {
  const requested = arg("revision", "main");
  if (/^[0-9a-f]{40}$/.test(requested)) return requested;
  const res = await fetch(`https://huggingface.co/api/models/${repoName}/revision/${requested}`);
  if (!res.ok) throw new Error(`Could not resolve ${repoName}@${requested}: HTTP ${res.status}`);
  return (await res.json()).sha;
}

/** HEAD without following redirects, to read Hugging Face's LFS sha256 and size. */
async function lfsInfo(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    const etag = res.headers.get("x-linked-etag");
    const size = res.headers.get("x-linked-size") ?? res.headers.get("content-length");
    const sha = etag && /^"?[0-9a-f]{64}"?$/.test(etag) ? etag.replace(/"/g, "") : null;
    return { sha256: sha, size: size ? Number(size) : null };
  } catch {
    return { sha256: null, size: null };
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

async function size(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return -1;
  }
}

function curl(url, out) {
  return new Promise((resolve, reject) => {
    const p = spawn("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "4", "--retry-delay", "2", "-C", "-", "-o", out, url], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`curl exited ${code} for ${url}`))));
  });
}

/** Download url → file unless an identical file is already there. Returns { bytes, sha256, verified }. */
async function download(url, file, expected = {}) {
  const target = path.join(dir, file);
  const info = expected.sha256 || expected.size ? expected : await lfsInfo(url);
  const have = await size(target);
  if (have > 0 && (info.size === null || info.size === undefined || have === info.size)) {
    const sha = await sha256File(target);
    if (!info.sha256 || sha === info.sha256) return { file, bytes: have, sha256: sha, verified: info.sha256 ? "hf-lfs-sha256" : "none", skipped: true };
    console.warn(`  ${file}: checksum mismatch, downloading again`);
    await rm(target);
  }
  const partial = `${target}.partial`;
  await curl(url, partial);
  const sha = await sha256File(partial);
  if (info.sha256 && sha !== info.sha256) {
    await rm(partial);
    throw new Error(`${file}: sha256 ${sha} does not match Hugging Face's ${info.sha256}`);
  }
  await rename(partial, target);
  return { file, bytes: await size(target), sha256: sha, verified: info.sha256 ? "hf-lfs-sha256" : "none", skipped: false };
}

const revision = await resolveRevision();
const base = `${repo}/resolve/${revision}/`;
await mkdir(dir, { recursive: true });
console.log(`Downloading ${modelId}\n  from ${repo} @ ${revision.slice(0, 12)}\n  into ${path.relative(ROOT, dir)}/`);
const started = Date.now();

const artifacts = [];
artifacts.push(await download(`${base}mlc-chat-config.json`, "mlc-chat-config.json"));
let cacheFile = "tensor-cache.json";
try {
  artifacts.push(await download(`${base}tensor-cache.json`, cacheFile));
} catch {
  // Older MLC repos ship ndarray-cache.json; WebLLM 0.2.85 reads tensor-cache.json.
  cacheFile = "ndarray-cache.json";
  const a = await download(`${base}ndarray-cache.json`, cacheFile);
  artifacts.push(a);
  await writeFile(path.join(dir, "tensor-cache.json"), await readFile(path.join(dir, cacheFile)));
}
const config = JSON.parse(await readFile(path.join(dir, "mlc-chat-config.json"), "utf8"));
const cache = JSON.parse(await readFile(path.join(dir, cacheFile), "utf8"));
const shardSizes = new Map();
for (const r of cache.records) shardSizes.set(r.dataPath, r.nbytes);

const queue = [
  ...(config.tokenizer_files ?? ["tokenizer.json"]).map((f) => ({ url: `${base}${f}`, file: f })),
  ...[...shardSizes.keys()].map((f) => ({ url: `${base}${f}`, file: f })),
];
let done = 0;
let index = 0;
const total = queue.length;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (index < queue.length) {
      const job = queue[index++];
      const a = await download(job.url, job.file);
      artifacts.push(a);
      done++;
      process.stdout.write(`\r  ${done}/${total} files${a.skipped ? " (resumed)" : ""}   `);
    }
  }),
);
process.stdout.write("\n");
const lib = await download(record.model_lib, "model.wasm", { sha256: null, size: null });
artifacts.push(lib);

const totalBytes = artifacts.reduce((s, a) => s + a.bytes, 0);
const manifest = {
  modelId,
  folder,
  runtime: "@mlc-ai/web-llm@0.2.85",
  hfRepo: repo,
  revision,
  modelLib: "model.wasm",
  modelLibUrl: record.model_lib,
  downloadedAt: new Date().toISOString(),
  totalBytes,
  note: "Model files only. Kinwise never sends personal data anywhere; prompts run on this device.",
  artifacts: artifacts.map(({ skipped: _s, ...a }) => a).sort((a, b) => a.file.localeCompare(b.file, "en", { numeric: true })),
};
await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const secs = (Date.now() - started) / 1000;
console.log(
  `Ready: ${(totalBytes / 1048576).toFixed(0)} MiB in ${secs.toFixed(0)} s · ${artifacts.filter((a) => a.verified !== "none").length}/${artifacts.length} files checked against Hugging Face sha256.`,
);
