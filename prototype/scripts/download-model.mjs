// Development-only download. The running app never fetches model files from third parties.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
const root = path.resolve("public/models/resolve/qwen2.5-1.5b");
const revision = "9bd564b064631febf14deadcac492efb761d60c3";
const libRevision = "025bcaf3780fa8254f5e5efd3bfea0a5397248f4";
const base = `https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/${revision}/`;
await mkdir(root, { recursive: true });
async function download(url, file) {
  try {
    if ((await stat(file)).size > 0) return;
  } catch {}
  await new Promise((resolve, reject) => {
    const p = spawn(
      "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--retry",
        "3",
        url,
        "-o",
        file + ".partial",
      ],
      { stdio: "inherit" },
    );
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Download failed (${code}): ${url}`)),
    );
  });
  const { rename } = await import("node:fs/promises");
  await rename(file + ".partial", file);
}
await download(
  base + "ndarray-cache.json",
  path.join(root, "ndarray-cache.json"),
);
const cache = JSON.parse(
  await readFile(path.join(root, "ndarray-cache.json"), "utf8"),
);
const files = [
  "tensor-cache.json",
  "mlc-chat-config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "merges.txt",
  "README.md",
  ...cache.records.map((x) => x.dataPath),
];
let index = 0,
  done = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (index < files.length) {
      const file = files[index++];
      await download(base + file, path.join(root, file));
      console.log(`${++done}/${files.length} ${file}`);
    }
  }),
);
await download(
  `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${libRevision}/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm`,
  path.join(root, "model.wasm"),
);
await download(
  "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/raw/main/LICENSE",
  path.join(root, "LICENSE"),
);
const artifacts = [];
for (const file of ["ndarray-cache.json", ...files, "model.wasm", "LICENSE"]) {
  const data = await readFile(path.join(root, file));
  artifacts.push({
    file,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}
const manifest = {
  modelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  runtime: "@mlc-ai/web-llm@0.2.85",
  revision,
  libRevision,
  downloadedAt: new Date().toISOString(),
  license: "Apache-2.0",
  totalBytes: artifacts.reduce((a, b) => a + b.bytes, 0),
  artifacts,
};
await writeFile(
  path.join(root, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/model-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Model ready: ${(manifest.totalBytes / 1024 / 1024).toFixed(0)} MiB. All runtime assets are local.`,
);
