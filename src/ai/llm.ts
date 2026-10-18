// On-device language model runtime (SPEC §7, §10): WebLLM in a Web Worker, a status store for React,
// a single-flight request queue, cancellation and timeouts.
//
// Guarantees the rest of the app relies on:
//   - Nothing about the person leaves the device. The only network traffic is the one-time download of
//     model files (see models.ts); prompts and outputs stay in this tab.
//   - One generation at a time. Requests queue in order; cancel() clears the queue and interrupts the
//     running request.
//   - Timeouts interrupt generation cleanly (engine.interruptGenerate()). Only if the engine does not
//     settle within 3 s is the worker terminated and the model reloaded, so a slow request never leaves
//     the model unusable.
//   - Output is parsed defensively (guard.ts) and returned with latency; callers verify the content.
//   - Generation is streamed internally (for interrupts and progress), but no unchecked text is ever
//     published: the status line only reports how much has been written.

import { useSyncExternalStore } from "react";
import type {
  ChatCompletionChunk,
  ChatCompletionRequestStreaming,
  InitProgressReport,
  MLCEngineInterface,
  ResponseFormat,
} from "@mlc-ai/web-llm";
import { parseModelJSON, LLMParseError } from "./guard";
import {
  DEFAULT_MODEL_ID,
  cachedModelUrls,
  getModelOption,
  isModelInBrowserCache,
  localModelsEnabled,
  resolveModelSource,
  type ModelSource,
} from "./models";
import { LOAD_START, trackLoad, type LoadPhase, type LoadTracker } from "./progress";

// SPEC §10 lists the model registry under llm.ts; it lives in models.ts and is re-exported here.
export { MODEL_OPTIONS, DEFAULT_MODEL_ID, getModelOption, type ModelOption } from "./models";
import { schemaToEBNF, stripLengthLimits, type JSONSchema } from "./schemas";

// ---------------------------------------------------------------------------
// Status store

export type LLMStatus = "unsupported" | "idle" | "loading" | "ready" | "generating" | "error";

export interface LLMState {
  status: LLMStatus;
  /** 0–1 while loading, across the whole load; never decreases (for short status text). */
  progress: number;
  /** The labelled step of the load: downloading files, then preparing them on the graphics card. */
  phase: LoadPhase | null;
  /** 0–1 within `phase`; never decreases while the phase stays the same (for the Settings progress bar). */
  phaseProgress: number;
  /** One human-readable status line (safe to show; never contains model output). */
  message: string;
  /** Loaded (or loading) model id. */
  model: string | null;
  /** Latency of the last completed generation (ms). */
  lastMs: number | null;
  /** Where the model files came from. */
  source: ModelSource["kind"] | null;
  /** Time the last load took (ms). */
  loadMs: number | null;
  /** Requests waiting behind the running one. */
  queued: number;
  /** WebLLM's raw progress text while loading (for a details disclosure / diagnostics). */
  detail: string | null;
}

let state: LLMState = {
  status: "idle",
  progress: 0,
  phase: null,
  phaseProgress: 0,
  message: "On-device AI is off. Everything else works without it.",
  model: null,
  lastMs: null,
  source: null,
  loadMs: null,
  queued: 0,
  detail: null,
};
const listeners = new Set<() => void>();

function publish(next: Partial<LLMState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function getLLMState(): LLMState {
  return state;
}

export function subscribeLLM(listener: () => void): () => void {
  listeners.add(listener);
  if (!probed) void probeWebGPU();
  return () => {
    listeners.delete(listener);
  };
}

/** React hook: live AI status for badges, Settings and aria-live regions. */
export function useLLM(): LLMState {
  return useSyncExternalStore(subscribeLLM, getLLMState, getLLMState);
}

/** True when a model is loaded (idle or busy). Tasks return null otherwise. */
export function isModelReady(): boolean {
  return state.status === "ready" || state.status === "generating";
}

// ---------------------------------------------------------------------------
// Errors

export type LLMErrorCode = "unsupported" | "not_ready" | "cancelled" | "timeout" | "parse" | "engine";

export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly raw: string | null;
  constructor(code: LLMErrorCode, message: string, raw: string | null = null) {
    super(message);
    this.name = "LLMError";
    this.code = code;
    this.raw = raw;
  }
}

// ---------------------------------------------------------------------------
// WebGPU support

let probed = false;
let webgpuOk: boolean | null = null;

interface GPUAdapterLike {
  features: { has(name: string): boolean };
}
interface NavigatorGPU {
  gpu?: { requestAdapter(opts?: { powerPreference?: string }): Promise<GPUAdapterLike | null> };
}

/** Check for a WebGPU adapter with 16-bit float shaders (required by q4f16 models). */
export async function probeWebGPU(): Promise<boolean> {
  if (webgpuOk !== null) return webgpuOk;
  probed = true;
  const nav = (typeof navigator !== "undefined" ? navigator : undefined) as (Navigator & NavigatorGPU) | undefined;
  let reason = "";
  try {
    const adapter = nav?.gpu ? await nav.gpu.requestAdapter({ powerPreference: "high-performance" }) : null;
    if (!nav?.gpu) reason = "This browser does not support WebGPU. Use a recent Chrome or Edge on a laptop or desktop.";
    else if (!adapter) reason = "No WebGPU graphics adapter is available on this device.";
    else if (!adapter.features.has("shader-f16")) reason = "This device's GPU lacks 16-bit shader support needed by the on-device models.";
  } catch {
    reason = "WebGPU could not be started in this browser.";
  }
  webgpuOk = reason === "";
  if (!webgpuOk && state.status === "idle") {
    // Just the reason: Settings adds what still works, so the page says each thing once.
    publish({ status: "unsupported", message: reason });
  }
  return webgpuOk;
}

// ---------------------------------------------------------------------------
// Engine lifecycle

/**
 * Probe public/models/resolve/ for a local model copy only in the dev server (or a VITE_LOCAL_MODELS=1 build).
 * The hosted demo has no model files, so probing there only produced one 404 per model.
 */
const LOCAL_MODELS = localModelsEnabled(import.meta.env);

type WebLLMRuntime = typeof import("@mlc-ai/web-llm");
/** The WebLLM runtime (~6 MB), imported only once the user chooses to load or remove a model. */
let runtime: WebLLMRuntime | null = null;
async function importRuntime(): Promise<WebLLMRuntime> {
  runtime ??= await import("@mlc-ai/web-llm");
  return runtime;
}

let engine: MLCEngineInterface | null = null;
let worker: Worker | null = null;
let loading: Promise<void> | null = null;
let loadingModel: string | null = null;
/** Increments on every load/unload; stale async work checks it and bails out. */
let epoch = 0;

function terminateWorker(): void {
  try {
    worker?.terminate();
  } catch {
    /* already gone */
  }
  worker = null;
  engine = null;
}

/** Label of a load phase, e.g. for the Settings progress bar ("Downloading model files"). */
export function loadPhaseLabel(phase: LoadPhase, source: ModelSource["kind"] | null): string {
  if (phase === "prepare") return "Preparing on your graphics card";
  return source === "local" ? "Loading model files from this computer" : "Downloading model files";
}

/** Status line while loading: "Downloading model files — 42%", or the model's name before the first phase. */
function describeProgress(t: LoadTracker, source: ModelSource, label: string): string {
  if (!t.phase) return `Preparing ${label}…`;
  return `${loadPhaseLabel(t.phase, source.kind)} — ${Math.round(t.phaseProgress * 100)}%`;
}

/** Thrown to a loadModel() caller whose load was replaced or cancelled (unloadModel, Settings → Cancel). */
function cancelledLoad(): LLMError {
  return new LLMError("cancelled", "Loading the on-device model was cancelled.");
}

/** No load progress for this long means the load has stalled. */
const LOAD_STALL_MS = 90_000;

/**
 * Before downloading, make sure the browser will let us store the model. Private/incognito windows
 * and some embedded browsers have quotas far below a 1–2 GB model, which otherwise shows up as a
 * download that silently stops part-way.
 */
async function checkStorage(modelId: string, alreadyCached: boolean): Promise<void> {
  if (alreadyCached || typeof navigator === "undefined" || !navigator.storage?.estimate) return;
  const option = getModelOption(modelId);
  if (!option) return;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota === undefined) return;
    const freeMB = (quota - (usage ?? 0)) / 2 ** 20;
    const needMB = option.sizeMB * 1.05;
    if (freeMB < needMB) {
      throw new LLMError(
        "unsupported",
        `This browser window can store about ${Math.max(0, Math.floor(freeMB))} MB, but ${option.label} needs about ${Math.ceil(needMB)} MB. Private/incognito windows have small limits — open Kinwise in a normal window, or choose a smaller model.`,
      );
    }
  } catch (err) {
    if (err instanceof LLMError) throw err;
  }
}

/**
 * Load a model into a fresh Web Worker. Resolves when it is ready. Safe to call repeatedly: an
 * already-loaded or loading model is reused; a different model replaces the current one.
 */
export async function loadModel(modelId: string = DEFAULT_MODEL_ID, opts: { preferRemote?: boolean } = {}): Promise<void> {
  if (!(await probeWebGPU())) {
    throw new LLMError("unsupported", state.message);
  }
  if (engine && state.model === modelId && isModelReady()) return;
  if (loading && loadingModel === modelId) return loading;
  if (engine || loading) await unloadModel();

  const myEpoch = ++epoch;
  loadingModel = modelId;
  const label = getModelOption(modelId)?.label ?? modelId;
  publish({ status: "loading", progress: 0, phase: null, phaseProgress: 0, model: modelId, message: `Preparing ${label}…`, source: null });
  const started = performance.now();

  loading = (async () => {
    let watchdog: ReturnType<typeof setInterval> | null = null;
    // This load's own worker. Kept outside the try so a cancelled load can always terminate it: once a newer
    // load (or Cancel) has run, the global `worker` may already point elsewhere.
    let w: Worker | null = null;
    try {
      const webllm = await importRuntime();
      const source = await resolveModelSource(modelId, {
        baseUrl: import.meta.env.BASE_URL,
        origin: location.origin,
        prebuilt: webllm.prebuiltAppConfig.model_list,
        preferRemote: opts.preferRemote ?? !LOCAL_MODELS,
      });
      if (myEpoch !== epoch) throw cancelledLoad();
      publish({ source: source.kind });
      const appConfig = { model_list: [source.record], cacheBackend: "indexeddb" as const };
      await checkStorage(modelId, await webllm.hasModelInCache(modelId, appConfig).catch(() => false));
      // Cancel may have been pressed during the awaits above. unloadModel() found no worker to stop then, so
      // bail before creating one; nothing between this check and `worker = w` awaits.
      if (myEpoch !== epoch) throw cancelledLoad();

      w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "kinwise-llm" });
      worker = w;
      // Watchdog: if loading stops making progress (e.g. storage writes stall), fail clearly instead of
      // leaving the UI on a frozen progress bar. It also ends a cancelled load: unloadModel() terminates the
      // worker, after which WebLLM's promise would never settle.
      let lastProgressAt = performance.now();
      let tracker: LoadTracker = LOAD_START;
      const stalled = new Promise<never>((_, reject) => {
        watchdog = setInterval(() => {
          if (myEpoch !== epoch) reject(cancelledLoad());
          else if (performance.now() - lastProgressAt > LOAD_STALL_MS) {
            reject(new LLMError("engine", "Loading stopped making progress. Check the connection and free disk space, avoid private/incognito windows, then try again."));
          }
        }, 2_000);
      });
      const e = await Promise.race([
        webllm.CreateWebWorkerMLCEngine(w, modelId, {
          appConfig,
          initProgressCallback: (r: InitProgressReport) => {
            lastProgressAt = performance.now();
            if (myEpoch !== epoch) return;
            tracker = trackLoad(tracker, r);
            publish({
              progress: tracker.overall,
              phase: tracker.phase,
              phaseProgress: tracker.phaseProgress,
              message: describeProgress(tracker, source, label),
              detail: r.text,
            });
          },
        }),
        stalled,
      ]);
      if (myEpoch !== epoch) throw cancelledLoad(); // the catch below terminates w
      engine = e;
      const loadMs = Math.round(performance.now() - started);
      publish({
        status: "ready",
        progress: 1,
        phase: null,
        phaseProgress: 0,
        loadMs,
        message: `${label} is ready · runs on this device · loaded from ${source.origin}`,
      });
    } catch (err) {
      // Replaced or cancelled: unloadModel() has already reset the state. Still terminate this load's own
      // worker (unloadModel() may have run before it existed, or a newer load may own `worker` now), then
      // tell the caller.
      if (myEpoch !== epoch) {
        w?.terminate();
        if (worker === w) worker = null;
        throw cancelledLoad();
      }
      terminateWorker();
      const message = err instanceof Error ? err.message : String(err);
      publish({ status: "error", progress: 0, phase: null, phaseProgress: 0, message: `The on-device model could not load: ${message}` });
      throw err instanceof LLMError ? err : new LLMError("engine", message);
    } finally {
      if (watchdog) clearInterval(watchdog);
      if (myEpoch === epoch) {
        loading = null;
        loadingModel = null;
      }
    }
  })();
  return loading;
}

/**
 * Attach an already-created engine (unit tests use a scripted fake; nothing in the app calls this).
 * Lets the queue, cancellation, timeout and parsing logic be tested in Node without WebGPU.
 */
export function attachEngineForTesting(e: MLCEngineInterface | null, modelId: string | null, opts: { interruptGraceMs?: number } = {}): void {
  epoch++;
  interruptGraceMs = opts.interruptGraceMs ?? INTERRUPT_GRACE_MS;
  engine = e;
  worker = null;
  publish(e ? { status: "ready", model: modelId, message: "test engine attached", queued: 0 } : { status: "idle", model: null, queued: 0 });
}

/**
 * Unload the model, cancel all requests and free GPU memory. During a load this is "Cancel download": the
 * epoch bump makes the pending load bail (its caller gets an LLMError "cancelled") and terminating the worker
 * stops the download. Weight shards already saved stay cached, so a later load continues from them.
 */
export async function unloadModel(): Promise<void> {
  epoch++;
  cancel("The on-device model was turned off.");
  const e = engine;
  loading = null;
  loadingModel = null;
  if (e) {
    // Give the engine a moment to release GPU buffers; terminate regardless.
    await Promise.race([e.unload().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  }
  terminateWorker();
  publish({
    status: webgpuOk === false ? "unsupported" : "idle",
    progress: 0,
    phase: null,
    phaseProgress: 0,
    model: null,
    source: null,
    queued: 0,
    message: "On-device AI is off. Everything else works without it.",
  });
}

/** Remove a model's downloaded files from the browser cache (Settings → "Remove downloaded model"). */
export async function removeModelCache(modelId: string = DEFAULT_MODEL_ID): Promise<void> {
  const webllm = await importRuntime();
  const sources: ModelSource[] = [];
  // Both copies in development; only the Hugging Face one in production (no local probe, so no 404s).
  for (const preferRemote of LOCAL_MODELS ? [false, true] : [true]) {
    try {
      sources.push(
        await resolveModelSource(modelId, {
          baseUrl: import.meta.env.BASE_URL,
          origin: location.origin,
          prebuilt: webllm.prebuiltAppConfig.model_list,
          preferRemote,
        }),
      );
    } catch {
      /* not available from this source */
    }
  }
  for (const s of sources) {
    await webllm.deleteModelAllInfoInCache(modelId, { model_list: [s.record], cacheBackend: "indexeddb" }).catch(() => undefined);
  }
}

/**
 * Whether a model's files are already in the browser cache (so loading needs no download). Without WebGPU the
 * answer is false and nothing is read. Otherwise WebLLM's IndexedDB store is read directly (models.ts), so
 * opening Settings fetches neither the runtime nor any model URL. Only if IndexedDB cannot be read, and the
 * user has already loaded the runtime, is WebLLM itself asked.
 */
export async function isModelCached(modelId: string = DEFAULT_MODEL_ID): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
  if (!(await probeWebGPU())) return false;
  const option = getModelOption(modelId);
  if (!option) return false;
  try {
    return await isModelInBrowserCache(cachedModelUrls(option, { baseUrl: import.meta.env.BASE_URL, origin: location.origin, local: LOCAL_MODELS }));
  } catch {
    if (!runtime) return false;
    try {
      const s = await resolveModelSource(modelId, {
        baseUrl: import.meta.env.BASE_URL,
        origin: location.origin,
        prebuilt: runtime.prebuiltAppConfig.model_list,
        preferRemote: !LOCAL_MODELS,
      });
      return await runtime.hasModelInCache(modelId, { model_list: [s.record], cacheBackend: "indexeddb" });
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Request queue

interface Job {
  id: number;
  label: string;
  /** Set when cancelled or timed out; the reason is reported to the caller. */
  stop: { code: "cancelled" | "timeout"; message: string } | null;
  running: boolean;
  /** Called by cancel()/timeout to stop a running job. */
  interrupt?: () => void;
  rejectQueued?: (e: LLMError) => void;
}

let nextJobId = 1;
let tail: Promise<unknown> = Promise.resolve();
const jobs = new Set<Job>();

function updateQueued(): void {
  const queued = [...jobs].filter((j) => !j.running).length;
  if (queued !== state.queued) publish({ queued });
}

/**
 * Cancel the running request and everything queued behind it. The model stays loaded.
 * (Safe to call at any time, e.g. on navigation or when the source records change.)
 */
export function cancel(reason = "Cancelled."): void {
  for (const job of jobs) {
    if (job.stop) continue;
    job.stop = { code: "cancelled", message: reason };
    if (job.running) job.interrupt?.();
    else job.rejectQueued?.(new LLMError("cancelled", reason));
  }
}

export interface GenerateRequest {
  system: string;
  user: string;
  /** JSON Schema for WebLLM's grammar-constrained decoding. */
  schema: object;
  maxTokens?: number;
  /** Default 60 s. */
  timeoutMs?: number;
  /** Short label for the status line, e.g. "Drafting the visit brief". */
  label?: string;
  /** Hybrid-thinking override; defaults to the model registry's flag. */
  disableThinking?: boolean;
  /**
   * Force a response-format level (diagnostics): 0 = compact EBNF with bounded strings, 1 = compact
   * EBNF, 2 = WebLLM JSON-schema mode, 3 = no grammar (raw text; output is still parsed defensively).
   */
  formatLevel?: 0 | 1 | 2 | 3;
}

export interface GenerateResult<T> {
  value: T;
  /** Wall-clock latency of this request, excluding time spent queued (ms). */
  ms: number;
  /** Raw model output (for the developer harness and evaluation logs; never shown to families). */
  raw: string;
  model: string;
  finishReason: string | null;
  /** True when truncated output was repaired by keeping only complete items. */
  salvaged: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Runtime throughput reported by WebLLM (tokens/s) and time to first token (s). */
  perf: { prefillTokPerS: number | null; decodeTokPerS: number | null; ttftS: number | null; grammarInitS: number | null } | null;
  /** Which response format was used (0 compact EBNF, 1 EBNF unbounded strings, 2 JSON schema). */
  formatLevel: number;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
/** How long an interrupted generation may take to settle before the worker is replaced. */
const INTERRUPT_GRACE_MS = 3_000;
let interruptGraceMs = INTERRUPT_GRACE_MS;

/**
 * Generate JSON that conforms to `schema` (grammar-constrained decoding), deterministically
 * (temperature 0). Requests run one at a time in call order.
 */
export function generateJSON<T>(req: GenerateRequest): Promise<GenerateResult<T>> {
  if (!isModelReady() || !engine) {
    return Promise.reject(new LLMError("not_ready", "The on-device model is not loaded."));
  }
  const job: Job = { id: nextJobId++, label: req.label ?? "Writing a draft", stop: null, running: false };
  jobs.add(job);
  updateQueued();

  const queuedGate = new Promise<never>((_, reject) => {
    job.rejectQueued = reject;
  });
  const run = tail.then(
    () => runJob<T>(job, req),
    () => runJob<T>(job, req),
  );
  tail = run.catch(() => undefined);
  // A queued job can be rejected by cancel() before it starts; a running one settles via runJob.
  return Promise.race([run, queuedGate]).finally(() => {
    jobs.delete(job);
    updateQueued();
  });
}

/**
 * Response formats from strictest to most lenient: compact-JSON EBNF with bounded strings, the same
 * without string bounds, then WebLLM's own JSON-schema mode (free whitespace).
 */
function responseFormats(schema: JSONSchema): ResponseFormat[] {
  const out: ResponseFormat[] = [];
  try {
    out.push({ type: "grammar", grammar: schemaToEBNF(schema) });
    out.push({ type: "grammar", grammar: schemaToEBNF(schema, { boundedStrings: false }) });
  } catch {
    /* unsupported schema shape: use the JSON-schema mode only */
  }
  out.push({ type: "json_object", schema: JSON.stringify(stripLengthLimits(schema)) });
  return out;
}
/**
 * Index into responseFormats() of the level to start from. Level 0 (bounded strings via `{0,N}`
 * repetition) is correct but measured ~5 s grammar compile and ~2.7 tok/s decode on the brief in
 * WebLLM 0.2.85, so the default starts at level 1 (compact EBNF; lengths are enforced host-side).
 */
let grammarLevel = 1;

function stopOf(job: Job): Job["stop"] {
  return job.stop;
}

async function runJob<T>(job: Job, req: GenerateRequest): Promise<GenerateResult<T>> {
  if (job.stop) throw new LLMError(job.stop.code, job.stop.message);
  const e = engine;
  const modelId = state.model;
  if (!e || !modelId || !isModelReady()) throw new LLMError("not_ready", "The on-device model is not loaded.");
  job.running = true;
  job.rejectQueued = undefined;
  updateQueued();
  const myEpoch = epoch;
  publish({ status: "generating", message: `${job.label} on this device…` });

  const option = getModelOption(modelId);
  const disableThinking = req.disableThinking ?? option?.thinking ?? false;
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = performance.now();

  const request = (format: ResponseFormat | null): ChatCompletionRequestStreaming => ({
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0,
    top_p: 1,
    repetition_penalty: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: req.maxTokens ?? 700,
    ...(format ? { response_format: format } : {}),
    ...(disableThinking ? { extra_body: { enable_thinking: false } } : {}),
  });

  let hardStopReject: ((err: LLMError) => void) | null = null;
  const hardStop = new Promise<never>((_, reject) => {
    hardStopReject = reject;
  });
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  job.interrupt = () => {
    void e.interruptGenerate();
    graceTimer = setTimeout(() => {
      // The engine did not settle: replace the worker and reload the same model in the background.
      const stop = job.stop ?? { code: "timeout" as const, message: "The on-device model stopped responding." };
      hardStopReject?.(new LLMError(stop.code, `${stop.message} The model is being restarted.`));
      if (myEpoch === epoch) {
        terminateWorker();
        publish({ status: "idle", message: "Restarting the on-device model…" });
        void loadModel(modelId).catch(() => undefined);
      }
    }, interruptGraceMs);
  };
  const timer = setTimeout(() => {
    if (job.stop) return;
    job.stop = { code: "timeout", message: `The on-device model took longer than ${Math.round(timeoutMs / 1000)} seconds.` };
    job.interrupt?.();
  }, timeoutMs);

  const consume = async (format: ResponseFormat | null) => {
    await e.resetChat();
    const stream = (await e.chat.completions.create(request(format))) as AsyncIterable<ChatCompletionChunk>;
    let raw = "";
    let finishReason: string | null = null;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let perf: GenerateResult<unknown>["perf"] = null;
    let lastPublish = 0;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      raw += choice?.delta?.content ?? "";
      finishReason = choice?.finish_reason ?? finishReason;
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
        const x = (chunk.usage as { extra?: Record<string, unknown> }).extra ?? {};
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
        perf = { prefillTokPerS: num(x.prefill_tokens_per_s), decodeTokPerS: num(x.decode_tokens_per_s), ttftS: num(x.time_to_first_token_s), grammarInitS: num(x.grammar_init_s) };
      }
      const now = performance.now();
      if (now - lastPublish > 400 && myEpoch === epoch && !job.stop) {
        lastPublish = now;
        publish({ message: `${job.label} on this device… ${Math.round((now - started) / 1000)} s` });
      }
    }
    return { raw, finishReason, promptTokens, completionTokens, perf };
  };

  try {
    // Try the strictest grammar the engine accepts; remember the level that worked.
    const formats: (ResponseFormat | null)[] = [...responseFormats(req.schema as JSONSchema), null];
    let out: Awaited<ReturnType<typeof consume>> | null = null;
    let usedLevel = req.formatLevel ?? grammarLevel;
    // Level 3 (no grammar) is only ever used when explicitly requested for diagnostics.
    const lastLevel = req.formatLevel === 3 ? 3 : formats.length - 2;
    for (let level = usedLevel; level <= lastLevel && out === null; level++) {
      try {
        out = await Promise.race([consume(formats[level]), hardStop]);
        usedLevel = level;
        if (req.formatLevel === undefined) grammarLevel = level;
      } catch (err) {
        const grammarProblem = err instanceof Error && /grammar|ebnf|schema/i.test(`${err.name} ${err.message}`);
        if (!grammarProblem || stopOf(job) || level === lastLevel) throw err;
      }
    }
    if (out === null) throw new LLMError("engine", "No response format was accepted by the model runtime.");
    // job.stop is set asynchronously by cancel()/timeout, so read it through a function (no stale narrowing).
    const stopped = stopOf(job);
    if (stopped) throw new LLMError(stopped.code, stopped.message, out.raw);
    const ms = Math.round(performance.now() - started);
    let parsed: { value: T; salvaged: boolean };
    try {
      parsed = parseModelJSON<T>(out.raw);
    } catch (err) {
      throw new LLMError("parse", err instanceof LLMParseError ? err.message : "The model output could not be read.", out.raw);
    }
    if (myEpoch === epoch) publish({ lastMs: ms });
    return {
      value: parsed.value,
      ms,
      raw: out.raw,
      model: modelId,
      finishReason: out.finishReason,
      salvaged: parsed.salvaged,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      perf: out.perf,
      formatLevel: usedLevel,
    };
  } catch (err) {
    if (err instanceof LLMError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const stopped = stopOf(job);
    throw new LLMError(stopped?.code ?? "engine", stopped?.message ?? `The on-device model failed: ${message}`);
  } finally {
    clearTimeout(timer);
    if (graceTimer) clearTimeout(graceTimer);
    job.running = false;
    if (myEpoch === epoch && engine) {
      const busy = [...jobs].some((j) => j !== job && !j.stop);
      if (!busy) {
        const label = getModelOption(modelId)?.label ?? modelId;
        publish({ status: "ready", message: `${label} is ready · runs on this device` });
      }
    }
  }
}
