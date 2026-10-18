import { cpSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the project under /<repo>/; local dev and preview serve from /.
const base = process.env.GITHUB_PAGES ? "/UnivaBioBabson/" : "/";

// public/models holds optional local copies of the on-device model weights (gigabytes) for development and
// offline demos. They are served by the dev server but never copied into the production build: the hosted
// demo downloads the weights from Hugging Face only when a user chooses to load the AI.
function copyPublicExceptModels(): Plugin {
  let outDir = "dist";
  return {
    name: "kinwise-copy-public-except-models",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const publicDir = resolve(__dirname, "public");
      for (const entry of readdirSync(publicDir)) {
        if (entry === "models") continue;
        cpSync(resolve(publicDir, entry), resolve(outDir, entry), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), copyPublicExceptModels()],
  worker: { format: "es" },
  build: {
    target: "es2022",
    // The WebLLM runtime (~6 MB, ~2 MB gzip) is its own chunk. It is fetched only when a user loads (or removes)
    // an on-device model in Settings: opening Settings reads the model cache from IndexedDB without it, and
    // without WebGPU nothing is read at all (src/ai/llm.ts isModelCached).
    chunkSizeWarningLimit: 6500,
    copyPublicDir: false,
    rollupOptions: { output: { manualChunks: (id) => (id.includes("@mlc-ai/web-llm") ? "webllm" : undefined) } },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "eval/**/*.test.ts"],
  },
});
