import { afterEach, describe, expect, it } from "vitest";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { LLMError, attachEngineForTesting, cancel, generateJSON, getLLMState } from "./llm";

interface FakeOptions {
  /** Output text, streamed in chunks of `chunk` characters. */
  output: string | ((req: Record<string, unknown>) => string);
  delayMs?: number;
  chunk?: number;
  /** Ignore interruptGenerate() (simulates a stuck engine). */
  ignoreInterrupt?: boolean;
  /** Throw this error from create() for grammar requests. */
  rejectGrammar?: boolean;
}

/** A scripted stand-in for WebLLM's engine: streams text, honours interrupts, records requests. */
function fakeEngine(o: FakeOptions) {
  const calls: Record<string, unknown>[] = [];
  const log: string[] = [];
  let interrupted = false;
  const engine = {
    resetChat: async () => undefined,
    unload: async () => undefined,
    interruptGenerate: async () => {
      log.push("interrupt");
      if (!o.ignoreInterrupt) interrupted = true;
    },
    chat: {
      completions: {
        create: async (req: Record<string, unknown>) => {
          calls.push(req);
          const fmt = req.response_format as { type?: string } | undefined;
          if (o.rejectGrammar && fmt?.type === "grammar") throw new Error("GrammarMatcherInitError: unsupported");
          interrupted = false;
          const text = typeof o.output === "function" ? o.output(req) : o.output;
          const size = o.chunk ?? 4;
          log.push(`start ${calls.length}`);
          return (async function* () {
            for (let i = 0; i < text.length; i += size) {
              if (interrupted) break;
              await new Promise((r) => setTimeout(r, o.delayMs ?? 0));
              yield { choices: [{ delta: { content: text.slice(i, i + size) }, finish_reason: null }] };
            }
            log.push(`end ${calls.length}`);
            yield { choices: [{ delta: {}, finish_reason: interrupted ? "abort" : "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, extra: { decode_tokens_per_s: 42.5 } } };
          })();
        },
      },
    },
  };
  return { engine: engine as unknown as MLCEngineInterface, calls, log };
}

const req = { system: "s", user: "u", schema: { type: "object", properties: { a: { type: "integer", enum: [1] } }, required: ["a"], additionalProperties: false } };

afterEach(() => {
  cancel("test cleanup");
  attachEngineForTesting(null, null);
});

describe("generateJSON", () => {
  it("rejects with not_ready when no model is loaded", async () => {
    await expect(generateJSON(req)).rejects.toMatchObject({ code: "not_ready" });
  });

  it("streams, parses and reports latency, tokens and throughput with a compact-JSON grammar", async () => {
    const f = fakeEngine({ output: '<think>\n\n</think>\n\n{"a":1}' });
    attachEngineForTesting(f.engine, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    const r = await generateJSON<{ a: number }>(req);
    expect(r.value).toEqual({ a: 1 });
    expect(r.promptTokens).toBe(10);
    expect(r.perf?.decodeTokPerS).toBe(42.5);
    expect(r.formatLevel).toBe(1);
    expect((f.calls[0].response_format as { type: string }).type).toBe("grammar");
    expect(f.calls[0].temperature).toBe(0);
    expect(f.calls[0].extra_body).toBeUndefined();
    expect(getLLMState().status).toBe("ready");
    expect(getLLMState().lastMs).not.toBeNull();
  });

  it("disables thinking for hybrid-thinking models", async () => {
    const f = fakeEngine({ output: '{"a":1}' });
    attachEngineForTesting(f.engine, "Qwen3.5-2B-q4f16_1-MLC");
    await generateJSON(req);
    expect(f.calls[0].extra_body).toEqual({ enable_thinking: false });
  });

  it("runs requests one at a time, in order", async () => {
    const f = fakeEngine({ output: '{"a":1}', delayMs: 5 });
    attachEngineForTesting(f.engine, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    await Promise.all([generateJSON(req), generateJSON(req), generateJSON(req)]);
    expect(f.log).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  it("cancel() interrupts the running request and rejects queued ones; the model stays loaded", async () => {
    const f = fakeEngine({ output: `{"a":1}${" ".repeat(400)}`, delayMs: 5, chunk: 1 });
    attachEngineForTesting(f.engine, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    // Settle both promises up front: cancel() rejects the queued one synchronously, before it is awaited.
    const running = generateJSON(req).catch((e: unknown) => e);
    const queued = generateJSON(req).catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 30));
    cancel("user cancelled");
    expect(await running).toMatchObject({ code: "cancelled" });
    expect(await queued).toMatchObject({ code: "cancelled" });
    expect(f.log).toContain("interrupt");
    expect(f.calls).toHaveLength(1);
    expect(getLLMState().status).toBe("ready");
  });

  it("times out by interrupting generation, keeping the model ready", async () => {
    const f = fakeEngine({ output: `{"a":1}${" ".repeat(400)}`, delayMs: 5, chunk: 1 });
    attachEngineForTesting(f.engine, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    const err = await generateJSON(req.schema ? { ...req, timeoutMs: 40 } : req).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("timeout");
    expect(getLLMState().status).toBe("ready");
  });

  it("replaces a stuck engine after the grace period (3 s in the app; 100 ms here)", async () => {
    const f = fakeEngine({ output: `{"a":1}${" ".repeat(4000)}`, delayMs: 5, chunk: 1, ignoreInterrupt: true });
    attachEngineForTesting(f.engine, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", { interruptGraceMs: 100 });
    const err = await generateJSON({ ...req, timeoutMs: 30 }).catch((e) => e);
    expect(err.code).toBe("timeout");
    expect(err.message).toMatch(/restarted/);
    expect(f.log).toContain("interrupt");
    // In Node there is no WebGPU, so the automatic reload ends as "unsupported" instead of "ready".
    expect(["loading", "idle", "unsupported", "error"]).toContain(getLLMState().status);
  });

  it("falls back to WebLLM's JSON-schema mode when the grammar is rejected", async () => {
    const f = fakeEngine({ output: '{"a":1}', rejectGrammar: true });
    attachEngineForTesting(f.engine, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    const r = await generateJSON(req);
    expect(r.formatLevel).toBe(2);
    expect((f.calls.at(-1)!.response_format as { type: string }).type).toBe("json_object");
  });

  it("reports unparseable output as a parse error with the raw text", async () => {
    const f = fakeEngine({ output: "I am sorry, I cannot do that." });
    attachEngineForTesting(f.engine, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
    const err = await generateJSON({ ...req, formatLevel: 1 }).catch((e) => e);
    expect(err.code).toBe("parse");
    expect(err.raw).toContain("sorry");
  });
});
