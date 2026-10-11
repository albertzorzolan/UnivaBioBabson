// Developer harness for the on-device AI layer (open /ai-harness.html on the dev server).
// Loads a chosen model and runs every task on the fixed Margaret fixture, showing raw output, what
// survived verification, dropped sentences with reasons, and timings. scripts/llm-smoke.mjs drives
// the same functions headlessly through window.__kinwiseHarness.

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { BriefSentence } from "../model/types";
import { ADAPTER_STATUS } from "./adapters";
import { MARGARET_FINDINGS, MARGARET_MED_NAMES, MARGARET_PACKAGE, MARGARET_TEMPLATE, QA_CASES, REFINE_CASES } from "./fixtures";
import { getLLMState, loadModel, unloadModel, useLLM, cancel, generateJSON, LLMError } from "./llm";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS } from "./models";
import { aliasEvidence, buildNoticedPrompt, selectEvidence } from "./prompts";
import { noticedSchema } from "./schemas";
import { AIValidationError, aiAnswer, aiDraftBrief, aiExplainFinding, aiRefineExtraction, type DroppedSentence, type HostEdit } from "./tasks";

export interface HarnessResult {
  model: string;
  task: "brief" | "answer" | "refine" | "explain";
  caseId: string;
  ok: boolean;
  error: string | null;
  ms: number;
  kept: number;
  dropped: number;
  droppedDetail: DroppedSentence[];
  output: unknown;
  raw: string;
  promptTokens: number | null;
  completionTokens: number | null;
  salvaged: boolean;
  /** Task-specific scoring (refine: expected fields found / forbidden fields added). */
  score?: Record<string, unknown>;
  /** Host-side edits before verification (softened question wording, completed citations). */
  edits?: HostEdit[];
  /** WebLLM throughput for this request. */
  perf?: unknown;
}

const opts = { medNames: MARGARET_MED_NAMES, patientNames: ["Margaret", "Mom"] };

function failure(model: string, task: HarnessResult["task"], caseId: string, err: unknown, started: number): HarnessResult {
  const dropped = err instanceof AIValidationError ? err.dropped : [];
  const raw = err instanceof AIValidationError ? err.raw : err instanceof LLMError ? (err.raw ?? "") : "";
  return {
    model,
    task,
    caseId,
    ok: false,
    error: `${err instanceof Error ? err.name : "Error"}: ${err instanceof Error ? err.message : String(err)}`,
    ms: Math.round(performance.now() - started),
    kept: 0,
    dropped: dropped.length,
    droppedDetail: dropped,
    output: null,
    raw,
    promptTokens: null,
    completionTokens: null,
    salvaged: false,
  };
}

async function runBrief(model: string): Promise<HarnessResult> {
  const started = performance.now();
  try {
    const r = await aiDraftBrief(MARGARET_PACKAGE, MARGARET_TEMPLATE, opts);
    if (!r) throw new Error("model not ready");
    const c = r.content;
    return {
      model,
      task: "brief",
      caseId: "margaret",
      ok: true,
      error: null,
      ms: r.info.durationMs ?? 0,
      kept: c.reason.length + c.noticed.length + c.questions.length,
      dropped: r.info.droppedSentences,
      droppedDetail: r.report.dropped,
      output: { reason: c.reason, noticed: c.noticed, questions: c.questions },
      raw: r.report.raw,
      promptTokens: r.report.promptTokens,
      completionTokens: r.report.completionTokens,
      salvaged: r.report.salvaged,
      perf: r.report.perf,
      edits: r.report.edits,
    };
  } catch (err) {
    return failure(model, "brief", "margaret", err, started);
  }
}

async function runAnswers(model: string): Promise<HarnessResult[]> {
  const out: HarnessResult[] = [];
  for (const c of QA_CASES) {
    const started = performance.now();
    try {
      const items = MARGARET_PACKAGE.items.filter((i) => c.itemIds.includes(i.id));
      const r = await aiAnswer(c.question, items, MARGARET_PACKAGE, opts);
      if (!r) throw new Error("model not ready");
      out.push({
        model,
        task: "answer",
        caseId: c.id,
        ok: c.id === "not-in-records" ? r.status === "not_in_records" : r.status === "answered" && r.sentences.length > 0,
        error: null,
        ms: r.ms,
        kept: r.sentences.length,
        dropped: r.dropped,
        droppedDetail: r.report.dropped,
        output: { question: c.question, status: r.status, sentences: r.sentences },
        raw: r.report.raw,
        promptTokens: r.report.promptTokens,
        completionTokens: r.report.completionTokens,
        salvaged: r.report.salvaged,
      perf: r.report.perf,
      });
    } catch (err) {
      out.push(failure(model, "answer", c.id, err, started));
    }
  }
  return out;
}

async function runRefine(model: string): Promise<HarnessResult[]> {
  const out: HarnessResult[] = [];
  for (const c of REFINE_CASES) {
    const started = performance.now();
    try {
      const r = await aiRefineExtraction(c.story, c.base, { meds: [], today: "2026-10-10" });
      if (!r) throw new Error("model not ready");
      const found = c.expect.filter((e) => r.added.some((a) => a.field === e.field && a.value === e.value)).length;
      const forbidden = r.added.filter((a) => c.mustNot.includes(a.field)).map((a) => a.field);
      out.push({
        model,
        task: "refine",
        caseId: c.id,
        ok: forbidden.length === 0,
        error: null,
        ms: r.ms,
        kept: r.added.length,
        dropped: r.rejected,
        droppedDetail: r.report.dropped,
        output: r.added.map((a) => ({ field: a.field, value: a.value, certainty: a.certainty, quote: a.spans[0]?.quote })),
        raw: r.report.raw,
        promptTokens: r.report.promptTokens,
        completionTokens: r.report.completionTokens,
        salvaged: r.report.salvaged,
      perf: r.report.perf,
        score: { expected: c.expect.length, found, forbiddenAdded: forbidden },
      });
    } catch (err) {
      out.push(failure(model, "refine", c.id, err, started));
    }
  }
  return out;
}

async function runExplain(model: string): Promise<HarnessResult[]> {
  const out: HarnessResult[] = [];
  for (const f of MARGARET_FINDINGS) {
    const started = performance.now();
    try {
      const r = await aiExplainFinding(f, { medNames: MARGARET_MED_NAMES });
      if (!r) throw new Error("model not ready");
      out.push({
        model,
        task: "explain",
        caseId: f.key,
        ok: true,
        error: null,
        ms: r.ms,
        kept: r.sentences.length,
        dropped: r.dropped,
        droppedDetail: r.report.dropped,
        output: r.sentences,
        raw: r.report.raw,
        promptTokens: r.report.promptTokens,
        completionTokens: r.report.completionTokens,
        salvaged: r.report.salvaged,
      perf: r.report.perf,
      });
    } catch (err) {
      out.push(failure(model, "explain", f.key, err, started));
    }
  }
  return out;
}

export async function runAll(tasks: HarnessResult["task"][] = ["brief", "answer", "refine", "explain"]): Promise<HarnessResult[]> {
  const model = getLLMState().model ?? "none";
  const results: HarnessResult[] = [];
  let mark = performance.now();
  const log = (rs: HarnessResult[]) => {
    const wall = Math.round(performance.now() - mark);
    mark = performance.now();
    for (const r of rs) console.info(`[harness] ${r.task} ${r.caseId} ${r.ok ? "ok" : "FAIL"} ${r.ms} ms kept ${r.kept} dropped ${r.dropped}${r.error ? ` ${r.error}` : ""}`);
    console.info(`[harness] ${rs[0]?.task} wall ${wall} ms for ${rs.length} case(s)`);
    results.push(...rs);
  };
  if (tasks.includes("brief")) log([await runBrief(model)]);
  if (tasks.includes("answer")) log(await runAnswers(model));
  if (tasks.includes("refine")) log(await runRefine(model));
  if (tasks.includes("explain")) log(await runExplain(model));
  return results;
}

declare global {
  interface Window {
    __kinwiseHarness?: {
      load: (modelId: string) => Promise<{ loadMs: number | null; source: string | null }>;
      unload: () => Promise<void>;
      runAll: typeof runAll;
      generate: typeof generateJSON;
      /** Diagnostics: the exact brief step-1 request the app would send for the fixture. */
      briefRequest: () => { system: string; user: string; schema: object };
      state: typeof getLLMState;
      adapters: typeof ADAPTER_STATUS;
    };
  }
}

window.__kinwiseHarness = {
  load: async (modelId: string) => {
    await loadModel(modelId);
    const s = getLLMState();
    return { loadMs: s.loadMs, source: s.source };
  },
  unload: unloadModel,
  runAll,
  generate: generateJSON,
  briefRequest: () => {
    const aliased = aliasEvidence(selectEvidence(MARGARET_PACKAGE.items));
    return { ...buildNoticedPrompt(MARGARET_PACKAGE, aliased.items), schema: noticedSchema(aliased.items.map((i) => i.id)) };
  },
  state: getLLMState,
  adapters: ADAPTER_STATUS,
};

// ---------------------------------------------------------------------------
// UI

function Sentences({ items }: { items: BriefSentence[] }) {
  return (
    <ul>
      {items.map((s, i) => (
        <li key={i}>
          {s.text} <span className="muted">[{s.evidenceIds.join(", ")}]</span>
        </li>
      ))}
    </ul>
  );
}

function ResultCard({ r }: { r: HarnessResult }) {
  const out = r.output as { reason?: BriefSentence[]; noticed?: BriefSentence[]; questions?: BriefSentence[]; sentences?: BriefSentence[] } | null;
  return (
    <div className="card">
      <div>
        <strong>{r.task}</strong> · {r.caseId} · <span className={r.ok ? "ok" : "fail"}>{r.ok ? "OK" : "FAIL"}</span> · {r.ms} ms · kept {r.kept} · dropped {r.dropped}
        {r.completionTokens !== null && <span className="muted"> · {r.promptTokens} prompt / {r.completionTokens} output tokens</span>}
        {r.salvaged && <span className="issue"> · truncated output salvaged</span>}
      </div>
      {r.error && <p className="fail">{r.error}</p>}
      {r.score && <p className="muted">Score: {JSON.stringify(r.score)}</p>}
      {r.edits && r.edits.length > 0 && (
        <p className="issue">
          Host edits: {r.edits.map((e) => `${e.kind} [${e.section}] "${e.before}" → "${e.after}"`).join(" · ")}
        </p>
      )}
      <div className="row">
        <div>
          <h3>Verified output</h3>
          {r.task === "brief" && out ? (
            <>
              <h4>Why we're coming in</h4>
              <Sentences items={out.reason ?? []} />
              <h4>What we've noticed</h4>
              <Sentences items={out.noticed ?? []} />
              <h4>Our questions</h4>
              <Sentences items={out.questions ?? []} />
            </>
          ) : (
            <pre>{JSON.stringify(r.output, null, 2)}</pre>
          )}
          {r.droppedDetail.length > 0 && (
            <>
              <h4>Dropped by verification</h4>
              <ul>
                {r.droppedDetail.map((d, i) => (
                  <li key={i}>
                    <span className="drop">[{d.section}] {d.text}</span>
                    <div className="issue">{d.issues.join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <h3>Raw model output</h3>
          <pre>{r.raw || "(none)"}</pre>
        </div>
      </div>
    </div>
  );
}

function Harness() {
  const llm = useLLM();
  const params = new URLSearchParams(location.search);
  const [model, setModel] = useState(params.get("model") ?? DEFAULT_MODEL_ID);
  const [results, setResults] = useState<HarnessResult[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async (tasks: HarnessResult["task"][]) => {
    setBusy(true);
    try {
      const r = await runAll(tasks);
      setResults((prev) => [...r, ...prev]);
    } finally {
      setBusy(false);
    }
  };
  const ready = llm.status === "ready";
  return (
    <main>
      <h1>Kinwise · on-device AI harness</h1>
      <p className="muted">
        Fixed fictional fixture (Margaret, lorazepam started Sep 24). Every model sentence is verified by code; dropped sentences are shown with reasons. Context
        check: {ADAPTER_STATUS.context}. Drug vocabulary: {ADAPTER_STATUS.kb}.
      </p>
      <div className="bar">
        <label>
          Model{" "}
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={llm.status === "loading"}>
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.sizeMB} MB{m.recommended ? " · recommended" : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => void loadModel(model).catch(() => undefined)} disabled={llm.status === "loading" || llm.status === "unsupported"}>
          Load
        </button>
        <button onClick={() => void unloadModel()}>Unload</button>
        <button onClick={() => cancel("Cancelled from the harness.")}>Cancel</button>
      </div>
      <div className="status" role="status" aria-live="polite">
        <strong>{llm.status}</strong> · {llm.message}
        {llm.status === "loading" && ` (${Math.round(llm.progress * 100)}%)`}
        {llm.loadMs !== null && <span className="muted"> · load {llm.loadMs} ms</span>}
        {llm.lastMs !== null && <span className="muted"> · last {llm.lastMs} ms</span>}
        {llm.queued > 0 && <span className="muted"> · {llm.queued} queued</span>}
      </div>
      <div className="bar">
        <button disabled={!ready || busy} onClick={() => void run(["brief"])}>Draft brief</button>
        <button disabled={!ready || busy} onClick={() => void run(["answer"])}>Q&amp;A ({QA_CASES.length})</button>
        <button disabled={!ready || busy} onClick={() => void run(["refine"])}>Refine extraction ({REFINE_CASES.length})</button>
        <button disabled={!ready || busy} onClick={() => void run(["explain"])}>Explain findings ({MARGARET_FINDINGS.length})</button>
        <button className="primary" disabled={!ready || busy} onClick={() => void run(["brief", "answer", "refine", "explain"])}>Run all</button>
        <button onClick={() => setResults([])}>Clear</button>
      </div>
      {results.length > 0 && (
        <>
          <h2>Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Task</th>
                <th>Case</th>
                <th>OK</th>
                <th>ms</th>
                <th>Kept</th>
                <th>Dropped</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.model}</td>
                  <td>{r.task}</td>
                  <td>{r.caseId}</td>
                  <td className={r.ok ? "ok" : "fail"}>{r.ok ? "yes" : "no"}</td>
                  <td>{r.ms}</td>
                  <td>{r.kept}</td>
                  <td>{r.dropped}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Details</h2>
          {results.map((r, i) => (
            <ResultCard key={i} r={r} />
          ))}
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
