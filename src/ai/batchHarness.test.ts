// The batch harness's bookkeeping (src/ai/batchHarness.ts): the prompt check runs the app's routing and retrieval on
// the demo record, and with a scripted engine in place of WebLLM every sentence is counted once (shown, blocked or not
// shown), with the harness's re-check agreeing with what the app's tasks reported.
import { afterEach, describe, expect, it } from "vitest";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { attachEngineForTesting, cancel } from "./llm";
import { findingKeys, numberSentences, planBatch, runBatch, type BatchPrompts } from "./batchHarness";

const TODAY = "2026-10-11";

/** A stand-in for WebLLM's engine that answers every request with `reply(system prompt)`. */
function scriptedEngine(reply: (system: string) => string): MLCEngineInterface {
  const engine = {
    resetChat: async () => undefined,
    unload: async () => undefined,
    interruptGenerate: async () => undefined,
    chat: {
      completions: {
        create: async (req: { messages: { content: string }[] }) => {
          const text = reply(req.messages[0].content);
          return (async function* () {
            yield { choices: [{ delta: { content: text }, finish_reason: null }] };
            yield { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, extra: {} } };
          })();
        },
      },
    },
  };
  return engine as unknown as MLCEngineInterface;
}

afterEach(() => {
  cancel("test cleanup");
  attachEngineForTesting(null, null);
});

describe("numberSentences", () => {
  it("numbers shown, then blocked, then not-shown sentences, and keeps what each cites", () => {
    const out = numberSentences(
      "ask-x",
      {
        shown: [{ section: "answer", s: { text: "Dizziness was recorded on 9 of 14 days.", evidenceIds: ["sig:1"] } }],
        blocked: [{ section: "answer", text: "She should stop the lorazepam.", issues: ["banned: advice"] }],
        notShown: [{ section: "answer", s: { text: "A fall was recorded on Oct 6.", evidenceIds: ["fact:falls"] }, why: "not shown: repeated" }],
      },
      () => ["record text"],
    );
    expect(out.map((s) => [s.id, s.verdict])).toEqual([
      ["ask-x#1", "shown"],
      ["ask-x#2", "blocked"],
      ["ask-x#3", "not_shown"],
    ]);
    expect(out[0].cited).toEqual(["record text"]);
    expect(out[1].issues).toEqual(["banned: advice"]);
    expect(out[2].issues).toEqual(["not shown: repeated"]);
  });
});

describe("planBatch", () => {
  it("runs a question through the app's routing and retrieval on the demo record", () => {
    const keys = findingKeys(TODAY);
    expect(keys.length).toBeGreaterThan(4);
    const rows = planBatch({
      today: TODAY,
      ask: [
        { id: "in", question: "When did the dizziness start?" },
        { id: "out", question: "Should she stop taking lorazepam?" },
      ],
      brief: [{ id: "b", days: 14, concerns: false }],
      explain: [
        { id: "x", findingKey: keys[0].key },
        { id: "missing", findingKey: "no-such-finding" },
      ],
    });
    expect(rows.map((r) => [r.id, r.ok])).toEqual([
      ["in", true],
      ["out", false],
      ["b", true],
      ["x", true],
      ["missing", false],
    ]);
    expect(rows[1].note).toMatch(/routed out/);
  });
});

describe("runBatch with a scripted engine", () => {
  it("records a blocked Ask draft and a shown explanation, and its re-check agrees with the app", async () => {
    const benzo = findingKeys(TODAY).find((k) => k.key.startsWith("pim-benzodiazepine"))!;
    attachEngineForTesting(
      scriptedEngine((system) =>
        /explain/i.test(system)
          ? JSON.stringify({
              sentences: [
                { text: "Lorazepam (Ativan) is a benzodiazepine." },
                { text: "The AGS Beers Criteria 2023 list benzodiazepines as medicines older adults should generally avoid." },
                { text: "Lorazepam can cause falls, so she should stop taking it." },
              ],
            })
          : JSON.stringify({ answer: [{ text: "She should stop taking lorazepam.", evidenceIds: [] }] }),
      ),
      "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    );
    const prompts: BatchPrompts = { today: TODAY, ask: [{ id: "a", question: "When did the dizziness start?" }], brief: [], explain: [{ id: "x", findingKey: benzo.key }] };
    const [ask, explain] = await runBatch(prompts);

    expect(ask.modelRan).toBe(true);
    expect(ask.sentences.map((s) => s.verdict)).toEqual(["blocked"]);
    expect(ask.error).toMatch(/AIValidationError/);
    expect(ask.error).not.toMatch(/mismatch/);

    expect(explain.error).toBeNull();
    expect(explain.sentences.filter((s) => s.verdict === "shown")).toHaveLength(2);
    expect(explain.sentences.filter((s) => s.verdict === "blocked").map((s) => s.text)).toEqual(["Lorazepam can cause falls, so she should stop taking it."]);
    // Explanations are audited against the finding text they were checked against.
    expect(explain.sentences[0].cited.join(" ")).toContain("benzodiazepine");
  });
});
