import { describe, expect, it } from "vitest";
import type { ModelRecord } from "@mlc-ai/web-llm";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, getModelOption, localModelUrl, resolveModelSource } from "./models";

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
