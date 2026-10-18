import { describe, expect, it } from "vitest";
import type { ModelRecord } from "@mlc-ai/web-llm";
import {
  DEFAULT_MODEL_ID,
  MODEL_OPTIONS,
  cachedModelUrls,
  getModelOption,
  isTensorCacheComplete,
  localModelUrl,
  localModelsEnabled,
  remoteModelUrl,
  resolveModelSource,
  webllmModelBase,
} from "./models";

const PREBUILT: ModelRecord[] = [
  {
    model: "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    model_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm",
    vram_required_MB: 1629.75,
    low_resource_required: true,
    overrides: { context_window_size: 4096 },
  },
];

/** Minimal fetch double: a map of URL → { status, type, body }. Unknown URLs return index.html (like Vite). */
function fakeFetch(files: Record<string, { type: string; body?: string }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const f = files[url];
    if (!f) return new Response("<!doctype html><title>app</title>", { status: 200, headers: { "content-type": "text/html" } });
    return new Response(f.body ?? "", { status: 200, headers: { "content-type": f.type } });
  }) as typeof fetch;
}

describe("MODEL_OPTIONS", () => {
  it("has exactly one recommended model and it is the default", () => {
    expect(MODEL_OPTIONS.filter((m) => m.recommended)).toHaveLength(1);
    expect(getModelOption(DEFAULT_MODEL_ID)?.recommended).toBe(true);
  });
  it("marks hybrid-thinking families", () => {
    for (const m of MODEL_OPTIONS) expect(m.thinking).toBe(m.family === "Qwen3" || m.family === "Qwen3.5");
  });
  it("ids are unique", () => {
    expect(new Set(MODEL_OPTIONS.map((m) => m.id)).size).toBe(MODEL_OPTIONS.length);
  });
});

describe("resolveModelSource", () => {
  const origin = "http://127.0.0.1:5174";
  const id = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
  const folder = localModelUrl(getModelOption(id)!, "/", origin);

  it("builds a local URL containing /resolve/ (WebLLM appends resolve/main otherwise)", () => {
    expect(folder).toBe("http://127.0.0.1:5174/models/resolve/qwen2.5-1.5b/");
    expect(localModelUrl(getModelOption(id)!, "/UnivaBioBabson/", origin)).toBe("http://127.0.0.1:5174/UnivaBioBabson/models/resolve/qwen2.5-1.5b/");
  });

  it("uses a complete local copy when present", async () => {
    const src = await resolveModelSource(id, {
      baseUrl: "/",
      origin,
      prebuilt: PREBUILT,
      fetchFn: fakeFetch({
        [`${folder}mlc-chat-config.json`]: { type: "application/json", body: '{"model_type":"qwen2","conv_template":{}}' },
        [`${folder}manifest.json`]: { type: "application/json", body: '{"modelId":"x"}' },
        [`${folder}model.wasm`]: { type: "application/wasm" },
      }),
    });
    expect(src.kind).toBe("local");
    expect(src.record.model).toBe(folder);
    expect(src.record.model_lib).toBe(`${folder}model.wasm`);
    expect(src.record.overrides?.context_window_size).toBe(4096);
  });

  it("honours a custom library file name from the manifest", async () => {
    const src = await resolveModelSource(id, {
      baseUrl: "/",
      origin,
      prebuilt: PREBUILT,
      fetchFn: fakeFetch({
        [`${folder}mlc-chat-config.json`]: { type: "application/json", body: '{"conv_template":{}}' },
        [`${folder}manifest.json`]: { type: "application/json", body: '{"modelLib":"lib.wasm"}' },
        [`${folder}lib.wasm`]: { type: "application/wasm" },
      }),
    });
    expect(src.record.model_lib).toBe(`${folder}lib.wasm`);
  });

  it("falls back to the prebuilt record when the dev server answers with index.html", async () => {
    const src = await resolveModelSource(id, { baseUrl: "/", origin, prebuilt: PREBUILT, fetchFn: fakeFetch({}) });
    expect(src.kind).toBe("remote");
    expect(src.record.model).toContain("huggingface.co/mlc-ai/");
    expect(src.record.model_lib).toContain("binary-mlc-llm-libs");
  });

  it("falls back when the local library is missing", async () => {
    const src = await resolveModelSource(id, {
      baseUrl: "/",
      origin,
      prebuilt: PREBUILT,
      fetchFn: fakeFetch({ [`${folder}mlc-chat-config.json`]: { type: "application/json", body: '{"conv_template":{}}' } }),
    });
    expect(src.kind).toBe("remote");
  });

  it("can be forced to use the remote source", async () => {
    let called = false;
    const src = await resolveModelSource(id, {
      baseUrl: "/",
      origin,
      prebuilt: PREBUILT,
      preferRemote: true,
      fetchFn: (async () => {
        called = true;
        return new Response("{}");
      }) as typeof fetch,
    });
    expect(src.kind).toBe("remote");
    expect(called).toBe(false);
  });

  it("errors for a model that is neither local nor prebuilt", async () => {
    await expect(resolveModelSource("Nope-1B", { baseUrl: "/", origin, prebuilt: PREBUILT, fetchFn: fakeFetch({}) })).rejects.toThrow(/not available/);
  });
});

describe("localModelsEnabled", () => {
  it("probes the local folder in development only", () => {
    expect(localModelsEnabled({ DEV: true })).toBe(true);
    expect(localModelsEnabled({ DEV: false })).toBe(false);
  });
  it("can be switched on for a production build with VITE_LOCAL_MODELS=1", () => {
    expect(localModelsEnabled({ DEV: false, VITE_LOCAL_MODELS: "1" })).toBe(true);
    expect(localModelsEnabled({ DEV: false, VITE_LOCAL_MODELS: "0" })).toBe(false);
  });
});

describe("browser-cache check without the WebLLM runtime", () => {
  const origin = "https://albertzorzolan.github.io";
  const id = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
  const option = getModelOption(id)!;

  it("uses the same Hugging Face URL as WebLLM's prebuilt record for every model", async () => {
    const { prebuiltAppConfig } = await import("@mlc-ai/web-llm");
    for (const m of MODEL_OPTIONS) {
      const rec = prebuiltAppConfig.model_list.find((r) => r.model_id === m.id);
      expect(rec, m.id).toBeDefined();
      expect(remoteModelUrl(m.id)).toBe(rec!.model);
    }
  });

  it("cleans model URLs the way WebLLM does (trailing slash, resolve/main/ when missing)", () => {
    expect(webllmModelBase("https://huggingface.co/mlc-ai/X-MLC")).toBe("https://huggingface.co/mlc-ai/X-MLC/resolve/main/");
    expect(webllmModelBase("https://huggingface.co/mlc-ai/X-MLC/")).toBe("https://huggingface.co/mlc-ai/X-MLC/resolve/main/");
    expect(webllmModelBase("http://127.0.0.1:5174/models/resolve/qwen2.5-1.5b/")).toBe("http://127.0.0.1:5174/models/resolve/qwen2.5-1.5b/");
  });

  it("checks only the Hugging Face copy when local models are off (production)", () => {
    expect(cachedModelUrls(option, { baseUrl: "/UnivaBioBabson/", origin, local: false })).toEqual([`https://huggingface.co/mlc-ai/${id}`]);
  });

  it("also checks the local folder when local models are on (development)", () => {
    expect(cachedModelUrls(option, { baseUrl: "/", origin, local: true })).toEqual([`${origin}/models/resolve/qwen2.5-1.5b/`, `https://huggingface.co/mlc-ai/${id}`]);
  });

  /** In-memory stand-in for WebLLM's IndexedDB "urls" store: url → stored value. */
  function store(entries: Record<string, unknown>) {
    return { keys: async () => new Set(Object.keys(entries)), json: async (key: string) => entries[key] ?? null };
  }
  const base = `https://huggingface.co/mlc-ai/${id}/resolve/main/`;
  const manifest = { records: [{ dataPath: "params_shard_0.bin" }, { dataPath: "params_shard_1.bin" }] };

  it("is complete when the manifest and every shard it lists are stored", async () => {
    const s = store({ [`${base}tensor-cache.json`]: manifest, [`${base}params_shard_0.bin`]: 1, [`${base}params_shard_1.bin`]: 1 });
    expect(await isTensorCacheComplete(`https://huggingface.co/mlc-ai/${id}`, s)).toBe(true);
  });

  it("is incomplete when a shard is missing (an interrupted download)", async () => {
    const s = store({ [`${base}tensor-cache.json`]: manifest, [`${base}params_shard_0.bin`]: 1 });
    expect(await isTensorCacheComplete(`https://huggingface.co/mlc-ai/${id}`, s)).toBe(false);
  });

  it("is incomplete without a manifest, or with an unreadable one", async () => {
    expect(await isTensorCacheComplete(`https://huggingface.co/mlc-ai/${id}`, store({}))).toBe(false);
    expect(await isTensorCacheComplete(`https://huggingface.co/mlc-ai/${id}`, store({ [`${base}tensor-cache.json`]: { nope: 1 } }))).toBe(false);
    expect(await isTensorCacheComplete(`https://huggingface.co/mlc-ai/${id}`, store({ [`${base}tensor-cache.json`]: { records: [] } }))).toBe(false);
  });
});

describe("model notes (shown in Settings) match the recorded runs", () => {
  it("the recommended model's note does not claim every sentence passed (eval/results/llm-batch.json blocks some)", () => {
    const note = getModelOption(DEFAULT_MODEL_ID)!.note;
    expect(note).toBe("Best rule-following in our on-device tests; the code check still removes some sentences (see How it works).");
    expect(note).not.toMatch(/\bevery\b|\ball\b|passed verification/);
  });
});
