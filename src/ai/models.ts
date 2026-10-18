// Model registry and model-source resolution for the on-device language model (SPEC §7).
//
// Privacy: loading a model only *downloads model files* (weights, tokenizer, compiled WebGPU library).
// Nothing about the person — no records, stories, notes or questions — is ever sent anywhere. All
// prompts run inside a Web Worker in this browser tab on the local GPU (WebGPU).
//
// Where the files come from:
//   1. Local copy (development / offline demos): `${BASE_URL}models/resolve/<folder>/` populated by
//      `node scripts/download-model.mjs <model_id>` (public/models is git-ignored). The `resolve/`
//      path segment is required: WebLLM appends "resolve/main/" to any model URL that lacks one.
//   2. Otherwise WebLLM's prebuilt registry: weights from the official mlc-ai Hugging Face repos and
//      the compiled model library from the mlc-ai/binary-mlc-llm-libs GitHub repo.
// Either way the files are cached in IndexedDB, so the second load works offline.
//
// The local probe (1) runs only in development (or a build made with VITE_LOCAL_MODELS=1): the hosted demo
// never ships model files, so probing there would only produce 404s. See localModelsEnabled().

import type { ModelRecord } from "@mlc-ai/web-llm";

export interface ModelOption {
  /** WebLLM model_id. */
  id: string;
  label: string;
  family: "Qwen2.5" | "Qwen3" | "Qwen3.5" | "Llama 3.2" | "Phi-4";
  params: string;
  /** Approximate download size of weights + library (MB, from the published tensor-cache manifests). */
  sizeMB: number;
  /** GPU memory WebLLM reports as required (MB). */
  vramMB: number;
  /** Default choice in Settings. Exactly one option is recommended. */
  recommended?: boolean;
  /**
   * Hybrid-thinking model (Qwen3 / Qwen3.5): requests are sent with `enable_thinking: false`, which
   * makes WebLLM prefill an empty <think></think> block (the models' official non-thinking format), and
   * any <think> text is stripped defensively before parsing.
   */
  thinking: boolean;
  /** Folder under public/models/resolve/ when a local copy may exist. */
  localFolder: string;
  license: string;
  /** One line for the Settings screen. */
  note: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 3B Instruct",
    family: "Qwen2.5",
    params: "3B",
    sizeMB: 1660,
    vramMB: 2505,
    recommended: true,
    thinking: false,
    localFolder: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    license: "Qwen Research License",
    // Default: best rule-adherence in eval/results/llm-smoke.json (brief 9/9 sentences verified,
    // record Q&A 4/4, no forbidden extraction proposals) at ~45–60 s per brief on an M1 Pro.
    note: "Best results in our on-device tests: every brief sentence and record answer passed verification.",
  },
  {
    id: "Qwen3.5-2B-q4f16_1-MLC",
    label: "Qwen3.5 2B",
    family: "Qwen3.5",
    params: "2B",
    sizeMB: 1015,
    vramMB: 2245,
    thinking: true,
    localFolder: "Qwen3.5-2B-q4f16_1-MLC",
    license: "Apache-2.0",
    // Fast (hybrid attention keeps decoding quick at long context) but, with greedy decoding, often
    // returned empty answers and no extraction proposals in our tests.
    note: "Fastest, but often leaves answers empty in our tests.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B Instruct",
    family: "Qwen2.5",
    params: "1.5B",
    sizeMB: 835,
    vramMB: 1630,
    thinking: false,
    localFolder: "qwen2.5-1.5b",
    license: "Apache-2.0",
    note: "Smallest download; good for laptops with less memory (somewhat less reliable briefs).",
  },
  {
    id: "Qwen3-4B-q4f16_1-MLC",
    label: "Qwen3 4B",
    family: "Qwen3",
    params: "4B",
    sizeMB: 2165,
    vramMB: 3432,
    thinking: true,
    localFolder: "Qwen3-4B-q4f16_1-MLC",
    license: "Apache-2.0",
    note: "Larger model; slower, needs more GPU memory.",
  },
  {
    id: "Qwen3.5-4B-q4f16_1-MLC",
    label: "Qwen3.5 4B",
    family: "Qwen3.5",
    params: "4B",
    sizeMB: 2265,
    vramMB: 3868,
    thinking: true,
    localFolder: "Qwen3.5-4B-q4f16_1-MLC",
    license: "Apache-2.0",
    note: "Larger model; slower, needs more GPU memory.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B Instruct",
    family: "Llama 3.2",
    params: "3B",
    sizeMB: 1730,
    vramMB: 2264,
    thinking: false,
    localFolder: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    license: "Llama 3.2 Community License",
    note: "Alternative 3B model.",
  },
  {
    id: "Phi-4-mini-instruct-q4f16_1-MLC",
    label: "Phi-4 mini Instruct",
    family: "Phi-4",
    params: "3.8B",
    sizeMB: 2065,
    vramMB: 3438,
    thinking: false,
    localFolder: "Phi-4-mini-instruct-q4f16_1-MLC",
    license: "MIT",
    note: "Alternative 3.8B model.",
  },
];

export const DEFAULT_MODEL_ID: string = (MODEL_OPTIONS.find((m) => m.recommended) ?? MODEL_OPTIONS[0]).id;

export function getModelOption(id: string | null | undefined): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.id === id);
}

/** Context window used for every model (prompts are budgeted to fit; see prompts.ts). */
export const CONTEXT_WINDOW = 4096;

// ---------------------------------------------------------------------------
// Source resolution

export interface ModelSource {
  kind: "local" | "remote";
  /** WebLLM model record to put in appConfig.model_list. */
  record: ModelRecord;
  /** Human-readable origin for the status line ("this computer" / "huggingface.co"). */
  origin: string;
}

export interface ResolveOptions {
  /** Vite base URL (import.meta.env.BASE_URL), e.g. "/" or "/UnivaBioBabson/". */
  baseUrl: string;
  /** Page origin used to build absolute URLs (location.origin). */
  origin: string;
  /** WebLLM's prebuiltAppConfig.model_list (passed in so this module stays free of the 6 MB runtime). */
  prebuilt: ModelRecord[];
  fetchFn?: typeof fetch;
  /** Skip the local probe. llm.ts sets it in production builds (see localModelsEnabled). */
  preferRemote?: boolean;
}

/** The manifest written by scripts/download-model.mjs next to a local copy. */
interface LocalManifest {
  modelId?: string;
  modelLib?: string;
}

/** URL of the local model folder for a given option. */
export function localModelUrl(option: Pick<ModelOption, "localFolder">, baseUrl: string, origin: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`${base}models/resolve/${option.localFolder}/`, origin).href;
}

async function fetchJSON<T>(fetchFn: typeof fetch, url: string): Promise<T | null> {
  try {
    const res = await fetchFn(url, { cache: "no-store" });
    if (!res.ok) return null;
    // Dev servers answer unknown paths with index.html (200), so parse rather than trust the status.
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function exists(fetchFn: typeof fetch, url: string): Promise<boolean> {
  try {
    const res = await fetchFn(url, { method: "HEAD", cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    return res.ok && !type.includes("text/html");
  } catch {
    return false;
  }
}

/**
 * Decide where to load a model from. Prefers a complete local copy (config + library present),
 * otherwise falls back to WebLLM's prebuilt (Hugging Face + GitHub) record.
 */
export async function resolveModelSource(modelId: string, opts: ResolveOptions): Promise<ModelSource> {
  const option = getModelOption(modelId);
  const prebuilt = opts.prebuilt.find((r) => r.model_id === modelId);
  const fetchFn = opts.fetchFn ?? fetch;
  const overrides = { ...(prebuilt?.overrides ?? {}), context_window_size: CONTEXT_WINDOW };

  if (option && !opts.preferRemote) {
    const folder = localModelUrl(option, opts.baseUrl, opts.origin);
    const config = await fetchJSON<Record<string, unknown>>(fetchFn, new URL("mlc-chat-config.json", folder).href);
    if (config && ("conv_template" in config || "model_type" in config)) {
      const manifest = await fetchJSON<LocalManifest>(fetchFn, new URL("manifest.json", folder).href);
      const libName = manifest?.modelLib ?? "model.wasm";
      const lib = new URL(libName, folder).href;
      if (await exists(fetchFn, lib)) {
        return {
          kind: "local",
          origin: "this computer",
          record: {
            model: folder,
            model_id: modelId,
            model_lib: lib,
            overrides,
            vram_required_MB: prebuilt?.vram_required_MB ?? option.vramMB,
            low_resource_required: prebuilt?.low_resource_required ?? false,
          },
        };
      }
    }
  }
  if (!prebuilt) {
    throw new Error(`${modelId} is not available in this version of WebLLM and no local copy was found.`);
  }
  return { kind: "remote", origin: "huggingface.co", record: { ...prebuilt, overrides } };
}

/**
 * Whether to look for a local model copy in public/models/resolve/. True in the Vite dev server (the demo
 * recorder and scripts/llm-smoke.mjs load the local copy that way), false in production builds unless the
 * build sets VITE_LOCAL_MODELS=1. Callers pass import.meta.env.
 */
export function localModelsEnabled(env: { DEV?: boolean; VITE_LOCAL_MODELS?: string }): boolean {
  return Boolean(env.DEV) || env.VITE_LOCAL_MODELS === "1";
}

// ---------------------------------------------------------------------------
// Browser-cache check without the WebLLM runtime
//
// Settings shows a "Downloaded" badge per model. WebLLM's own hasModelInCache() needs its ~6 MB runtime and a
// resolved model record, so asking it on page load cost a 2 MB download (gzip) and, on the hosted demo, one 404
// per model. Instead we read WebLLM's IndexedDB store directly. The layout below is WebLLM 0.2.85's
// (node_modules/@mlc-ai/web-llm/lib/index.js: ArtifactIndexedDBCache, hasTensorInCache, cleanModelUrl); a
// test pins the Hugging Face URLs to its prebuilt registry, so a WebLLM upgrade that changes them fails CI.

/** IndexedDB database WebLLM stores model weights in (cacheBackend "indexeddb", scope "webllm/model"). */
export const WEBLLM_MODEL_DB = "webllm/model";
/** Its single object store: { url, data } rows keyed by the file URL. */
const WEBLLM_STORE = "urls";

/** The Hugging Face repo of a prebuilt model (identical to WebLLM's prebuiltAppConfig record.model). */
export function remoteModelUrl(modelId: string): string {
  return `https://huggingface.co/mlc-ai/${modelId}`;
}

/** The base URL WebLLM caches a model's files under (its cleanModelUrl: trailing slash, then "resolve/main/" if missing). */
export function webllmModelBase(modelUrl: string): string {
  let url = modelUrl.endsWith("/") ? modelUrl : `${modelUrl}/`;
  if (!/.+\/resolve\/.+\//.test(url)) url += "resolve/main/";
  return new URL(url).href;
}

/** Model URLs a cached copy can be stored under: the local folder (only when local models are on), then Hugging Face. */
export function cachedModelUrls(option: Pick<ModelOption, "id" | "localFolder">, opts: { baseUrl: string; origin: string; local: boolean }): string[] {
  return [...(opts.local ? [localModelUrl(option, opts.baseUrl, opts.origin)] : []), remoteModelUrl(option.id)];
}

/** Read access to WebLLM's cache rows (an in-memory stand-in in tests). */
export interface CacheRows {
  /** Every stored URL (keys only: the values are tens of MB each). */
  keys(): Promise<Set<string>>;
  /** The stored value of one small JSON row, or null. */
  json(url: string): Promise<unknown>;
}

/** True when a model's manifest (tensor-cache.json) and every weight shard it lists are stored — WebLLM's own rule. */
export async function isTensorCacheComplete(modelUrl: string, rows: CacheRows): Promise<boolean> {
  const base = webllmModelBase(modelUrl);
  const manifestUrl = new URL("tensor-cache.json", base).href;
  const keys = await rows.keys();
  if (!keys.has(manifestUrl)) return false;
  const records = ((await rows.json(manifestUrl)) as { records?: { dataPath?: unknown }[] } | null)?.records;
  if (!Array.isArray(records) || records.length === 0) return false;
  return records.every((r) => typeof r.dataPath === "string" && keys.has(new URL(r.dataPath, base).href));
}

function settle<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Whether any of `modelUrls` is completely in WebLLM's IndexedDB cache. Never creates the database: if it does
 * not exist yet, the open is aborted during its upgrade step. Rejects if IndexedDB is unavailable.
 */
export async function isModelInBrowserCache(modelUrls: string[], idb: IDBFactory = indexedDB): Promise<boolean> {
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const req = idb.open(WEBLLM_MODEL_DB);
    let created = false;
    req.onupgradeneeded = () => {
      // No database yet means nothing was ever downloaded; leave creating it to WebLLM.
      created = true;
      req.transaction?.abort();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => {
      e.preventDefault();
      if (created) resolve(null);
      else reject(req.error);
    };
  });
  if (!db) return false;
  try {
    if (!db.objectStoreNames.contains(WEBLLM_STORE)) return false;
    const store = () => db.transaction(WEBLLM_STORE, "readonly").objectStore(WEBLLM_STORE);
    const rows: CacheRows = {
      keys: async () => new Set((await settle(store().getAllKeys())).map(String)),
      json: async (url) => ((await settle(store().get(url))) as { data?: unknown } | undefined)?.data ?? null,
    };
    for (const url of modelUrls) {
      if (await isTensorCacheComplete(url, rows)) return true;
    }
    return false;
  } finally {
    db.close();
  }
}
