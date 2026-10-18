// Settings → "Cancel download" calls unloadModel() while loadModel() is still running. These tests pin
// that a cancelled load never leaves a Web Worker running (it would keep downloading ~1.7 GB and then hold
// GPU memory with nothing in the app owning it). The WebLLM runtime, WebGPU, storage and Worker are stubbed.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
const OTHER = "Qwen2.5-3B-Instruct-q4f16_1-MLC";

// Never settles unless a test resolves it: stands in for a model download that is still in progress.
const createEngine = vi.fn((..._args: unknown[]) => new Promise<never>(() => {}));
vi.mock("@mlc-ai/web-llm", () => ({
  prebuiltAppConfig: { model_list: [MODEL, OTHER].map((id) => ({ model: `https://huggingface.co/mlc-ai/${id}`, model_id: id, model_lib: "lib.wasm" })) },
  hasModelInCache: async () => false,
  CreateWebWorkerMLCEngine: (...args: unknown[]) => createEngine(...args),
}));

class FakeWorker {
  static all: FakeWorker[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  terminate() {
    this.terminated = true;
  }
}
const alive = () => FakeWorker.all.filter((w) => !w.terminated);

/** navigator.storage.estimate(); a test can replace it to act while the storage check is pending. */
let estimate: () => Promise<{ quota: number; usage: number }> = async () => ({ quota: 1e12, usage: 0 });
vi.stubGlobal("navigator", {
  gpu: { requestAdapter: async () => ({ features: { has: () => true } }) },
  storage: { estimate: () => estimate() },
});
vi.stubGlobal("location", { origin: "http://localhost" });
vi.stubGlobal("Worker", FakeWorker);

const { loadModel, unloadModel, getLLMState } = await import("./llm");

beforeEach(async () => {
  await unloadModel();
  FakeWorker.all = [];
  estimate = async () => ({ quota: 1e12, usage: 0 });
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("loadModel cancellation", () => {
  it("cancelled during the storage check: rejects 'cancelled' and never creates a worker", async () => {
    estimate = async () => {
      await unloadModel(); // the user presses Cancel while "Preparing…" is showing
      return { quota: 1e12, usage: 0 };
    };
    await expect(loadModel(MODEL, { preferRemote: true })).rejects.toMatchObject({ code: "cancelled" });
    expect(FakeWorker.all).toHaveLength(0);
    expect(createEngine).not.toHaveBeenCalled();
    expect(getLLMState().status).toBe("idle");
  });

  it("cancelled during the download: rejects 'cancelled' and its worker is terminated", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const pending = loadModel(MODEL, { preferRemote: true });
      const outcome = pending.catch((e: unknown) => e);
      await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(1));
      await unloadModel();
      await vi.advanceTimersByTimeAsync(2_000); // the watchdog notices the cancel and ends the race
      expect(await outcome).toMatchObject({ code: "cancelled" });
      expect(alive()).toHaveLength(0);
      expect(getLLMState().status).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a second load replaces the first without leaving the first worker alive", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const first = loadModel(MODEL, { preferRemote: true }).catch((e: unknown) => e);
      await vi.waitFor(() => expect(FakeWorker.all).toHaveLength(1));
      void loadModel(OTHER, { preferRemote: true }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await first).toMatchObject({ code: "cancelled" });
      expect(FakeWorker.all[0].terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
