# MedWatch revamp: AI stack and deployment research

Prepared 2026-10-10 for the UnivaBio hackathon revamp (deadline 2026-10-13, 11:45 PM EDT).
Scope: on-device LLM choice (WebLLM), public hosting, speech input, pill-label OCR, non-LLM clinical NLP (NegEx/ConText), PDF generation and charting.

How this was checked:
- Package versions and dates come from the npm registry (`npm view <pkg> version time --json`), run on 2026-10-10.
- The WebLLM model list was dumped from the installed `@mlc-ai/web-llm@0.2.85` bundle (`prebuiltAppConfig`). Raw dump: `research/webllm-0.2.85-models.jsonl`.
- Download sizes come from the Hugging Face tree API (`https://huggingface.co/api/models/mlc-ai/<id>/tree/main`), summed over files.
- **We ran our own benchmark on the team's MacBook Pro** (Apple M1 Pro, 16 GB, Chrome 154 headless, WebGPU on Metal). It covers 5 candidate models × 3 prompt/case sets × 2 repeats. The harness and raw results are in `scratchpad/bench/` (`entry.js`, `run.mjs`, `results-*.json`, `summary.json`). The `profile/` folder there is a 7.8 GB model cache and can be deleted.
- Anything marked **UNVERIFIED** could not be confirmed from a primary source or by our own test.

---

## 0. Where the prototype stands today (read from the repo)

| Item | Current state | Source |
|---|---|---|
| Runtime | `@mlc-ai/web-llm` **0.2.85**, run in a Web Worker (`src/ai.worker.ts` uses `WebWorkerMLCEngineHandler`) | `prototype/package.json`, `src/ai.ts` |
| Model | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` at HF revision `9bd564b0…`. The library is `v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm` at commit `025bcaf3…` | `scripts/download-model.mjs` |
| Model serving | Served only from the app's own origin (`/models/resolve/qwen2.5-1.5b/`). `loadModel()` refuses to load if `manifest.json` is missing | `src/ai.ts` |
| Structured output | `response_format: { type: "json_object", schema: JSON.stringify(grammar) }`, followed by Ajv validation and span/number checks | `src/ai.ts` |
| Measured latency | **15–22 s per capture or summary call**, 6.1 s model load (M1 Pro). Source: the team's own eval | `prototype/docs/model-evaluation.json` |
| Build output | `dist/` is **857 MB** because `public/models/` (845 MB) is copied into the build. `public/models/` is git-ignored | `du -sh`, `prototype/.gitignore` |
| Headers | Vite dev and preview servers set COOP `same-origin` and COEP `require-corp`. `index.html` has a meta CSP with `connect-src 'self' ws://127.0.0.1:5173` | `vite.config.ts`, `index.html` |
| Absolute paths that break under a sub-path | `fetch("/models/resolve/...")` and `new URL("/models/...", location.origin)` in `ai.ts`, plus `@import url("/fonts/fonts.css")` in `style.css` | `src/ai.ts`, `src/style.css` |
| Repo / Pages | `github.com/albertzorzolan/UnivaBioBabson` is **public**. Pages is **not enabled** | `gh api repos/albertzorzolan/UnivaBioBabson` |

**The latency is mostly the prompt, not the model.** On the same machine and model (Qwen2.5-1.5B), our compact prompt took a median of 2.0–3.0 s per call, against 15–22 s in the app. The app's user message embeds `requiredPayload` (the full JSON schema), the `data` echo, `sourceSpans`, and a schema whose enums list every sentence span. That inflates both prefill and grammar compilation. This is an inference: we did not instrument the app itself. Check it by logging `reply.usage.prompt_tokens` and `reply.usage.extra.grammar_init_s`.

---

## 1. WebLLM: version, models, structured output, recommendation

### 1.1 Version and API compatibility

- **Latest stable is 0.2.85, published 2026-09-08**, and it is the `latest` dist-tag. The prototype already pins it, so no upgrade is needed and none is possible.
  - Sources: `npm view @mlc-ai/web-llm version time --json`; https://github.com/mlc-ai/web-llm/releases/tag/v0.2.85
- 0.2.85 release notes: OPFS sync access handles, worker state recovery, and a fix for hangs on invalid structural tags. It reuses the `v0_2_84/base` model libraries ("No new model binaries are required").
  - Source: https://github.com/mlc-ai/web-llm/releases/tag/v0.2.85
- Every API the app uses still exists in the 0.2.85 typings (`lib/index.d.ts`): `CreateWebWorkerMLCEngine`, `WebWorkerMLCEngineHandler`, `deleteModelAllInfoInCache` and `hasModelInCache`.
- `engine.resetChat()` and `chat.completions.create()` also still exist.
- WebLLM's schema-constrained mode is `response_format: { type: "json_object", schema: "<JSON string>" }`. This is **not** OpenAI's `type: "json_schema"`. Other modes are `type: "grammar"` (EBNF) and `type: "structural_tag"`.
  - Source: `node_modules/@mlc-ai/web-llm/lib/openai_api_protocols/chat_completion.d.ts` (`ResponseFormat`)
- Cache backends are `"cache"` (the default, "most well-tested"), `"indexeddb"`, `"opfs"` and `"cross-origin"`. `ModelRecord.integrity` lets you pin SRI hashes for the config, the WASM library and the tokenizer files, but not for weight shards.
  - Source: `lib/config.d.ts`, `lib/integrity.d.ts`
- WebLLM normalises a `model` URL by appending `resolve/main/` unless the URL already matches `/.+\/resolve\/.+\//`. You can therefore pin a Hugging Face commit with `https://huggingface.co/mlc-ai/<id>/resolve/<sha>/`. The local folder name `/models/resolve/...` was chosen for the same reason.
  - Source: `cleanModelUrl()` in `lib/index.js`

Open issues and risks with 0.2.85:

| Issue | What happens | Status | Relevance |
|---|---|---|---|
| [#844](https://github.com/mlc-ai/web-llm/issues/844) | Starting in 0.2.83, a `shapeCache` LRU disposes ShapeTuples that are still in use. Result: "Object has already been disposed" and a GPU device hang once prompts exceed about 120 tokens. Reported on an **AMD integrated GPU under Windows** with Qwen3-1.7B/0.6B and Qwen3.5-2B | Closed 2026-10-04 as "fixed by apache/tvm#20501". That fix was merged 2026-10-02, **after** 0.2.85, whose TVM runtime is built from commit `7e06fc6` (2026-09-06). The LRU code is still in the 0.2.85 bundle (`lib/index.js` line ~5142) | Judges on Windows laptops with AMD iGPUs may hit it. We saw no failures in 240 calls on Apple Silicon. **Mitigation:** catch errors, terminate and recreate the worker, and fall back to deterministic mode |
| [#807](https://github.com/mlc-ai/web-llm/issues/807) / [xgrammar#611](https://github.com/mlc-ai/xgrammar/issues/611) | The XGrammar matcher crashes with an "invalid token id" in JSON or JSON-schema mode. Reported with Qwen3-0.6B and reproduced with Qwen3-1.7B, mostly on Chinese input and occasionally on English | Open | We had 0 errors in 48 constrained calls each for Qwen3-1.7B and Qwen3-4B. Still, wrap calls in try/catch with one retry |
| [#868](https://github.com/mlc-ai/web-llm/issues/868) | Qwen3.5-4B with a `"type":"string"` field whose value is numeric-looking ends with EOS inside the string, or emits whitespace until `max_tokens` | Open (2026-10-07) | Avoid free-text string fields where an enum or integer works. Keep `max_tokens` tight and treat `finish_reason === "length"` as a failure |
| Grammar whitespace | WebLLM compiles schemas with `compileJSONSchema(schema)`, and the defaults are `anyWhitespace = true` with no cap on whitespace (`lib/index.js` around lines 9361 and 10836). This is the mechanism behind the whitespace runaway | By design | Same mitigations as above. `type: "grammar"` (EBNF) can forbid free whitespace if ever needed |
| Image input (VLM) | [#863](https://github.com/mlc-ai/web-llm/pull/863) adds image input for manifest models | Merged 2026-10-03, **unreleased** | Not usable for the hackathon |

### 1.2 Prebuilt instruct models of about 4B parameters or fewer in 0.2.85

0.2.85 ships **163** prebuilt entries. The `model_lib` URLs all point to `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/…`.

How to read the table:
- **VRAM** is the `vram_required_MB` value in `prebuiltAppConfig`.
- **Ctx** is the context window that WebLLM sets through `overrides` (the native window is larger). "1k" variants exist for low-VRAM devices.
- **Download** is the summed Hugging Face repo size. It includes two copies of `ndarray-cache.json`/`tensor-cache.json` (about 0.1 MB each) and excludes the 5–6 MB WASM library.
- Licences come from Hugging Face model tags. IFEval is the model makers' published score: "strict-prompt, non-thinking" unless noted.

| model_id (q4f16_1 unless noted) | VRAM MB | low_resource | Ctx | Download | Licence | Published IFEval | Notes |
|---|---|---|---|---|---|---|---|
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | 945 | yes | 4096 | 276 MiB | Apache-2.0 | 27.9 [Q25] | Too weak |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (current) | 1630 | yes | 4096 | 840 MiB | Apache-2.0 | 42.5 [Q25][Q3] | The lib reuses the `Qwen2-1.5B` WASM |
| `Qwen2.5-3B-Instruct-q4f16_1-MLC` | 2505 | yes | 4096 | 1667 MiB | **Qwen Research License (non-commercial)** | 58.2 [Q3] | The licence is a real-world blocker |
| `Qwen3-0.6B-q4f16_1-MLC` | 1403 | yes | 4096 | 335 MiB | Apache-2.0 | 54.5 [Q3] | Hybrid thinking model. Issue #807 was reported on this model |
| **`Qwen3-1.7B-q4f16_1-MLC`** | 2037 | yes | 4096 | **939 MiB** | Apache-2.0 | **68.2** [Q3] | Needs `extra_body.enable_thinking:false` |
| **`Qwen3-4B-q4f16_1-MLC`** | 3432 | yes | 4096 | **2174 MiB** | Apache-2.0 | **81.2** [Q3] | Same note as Qwen3-1.7B |
| `Qwen3.5-0.8B-q4f16_1-MLC` | 1629 | yes | 4096 | 426 MiB | Apache-2.0 | 52.1 [Q35] | New hybrid architecture (Gated DeltaNet). The MLC builds of 0.8B and 2B are text-only: `mlc-chat-config.json` has `vision_config: null` |
| `Qwen3.5-2B-q4f16_1-MLC` | 2245 | **no** | 4096 | 1032 MiB | Apache-2.0 | 61.2 [Q35] | MLC repo created 2026-03-29, so it is the least battle-tested. `max_history_size: 1` |
| `Qwen3.5-4B-q4f16_1-MLC` | 3868 | no | 4096 | 2280 MiB | Apache-2.0 | n/a | Issue #868 |
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 879 | yes | 4096 | 672 MiB | Llama 3.2 Community | 59.5* [L32] | *Average of loose and strict scores, so not comparable |
| `Llama-3.2-3B-Instruct-q4f16_1-MLC` | 2264 | yes | 4096 | 1733 MiB | Llama 3.2 Community | 77.4* [L32] | Requires "Built with Llama" attribution |
| `Hermes-3-Llama-3.2-3B-q4f16_1-MLC` | 2264 | yes | 4096 | n/m | Llama 3.2 | n/a | Not in `functionCallingModelIds`. That list covers only Hermes-2-Pro-Llama-3-8B, Hermes-2-Pro-Mistral-7B and Hermes-3-Llama-3.1-8B, so no small model has official tool calling |
| `Phi-3.5-mini-instruct-q4f16_1-MLC` / `-1k` | 3672 / 2520 | no / yes | 4096 / 1024 | 2053 MiB | MIT | 52.1 [Q25] | Heavy for its quality |
| `Phi-4-mini-instruct-q4f16_1-MLC` | 3438 | no | 4096 | 2079 MiB | MIT | 68.6 [Q3] | Weaker per GB than Qwen3-4B |
| `gemma-2-2b-it-q4f16_1-MLC` / `-1k` | 1895 / 1583 | no / yes | 4096 / 1024 | 1424 MiB | Gemma terms | 51.0 [Q25] | Requires `shader-f16` |
| `gemma3-1b-it-q4f16_1-MLC` | 711 | yes | 4096 | 574 MiB | Gemma terms | 54.5 [Q3] | **No Gemma-3 2B exists**. WebLLM ships only the 1B. Hugging Face has `google/gemma-3-{270m,1b,4b,12b,27b}-it`; `gemma-3-2b-it` returns 401/not found |
| `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | 1774 | yes | 4096 | 922 MiB | Apache-2.0 | n/a | Requires `shader-f16` |
| `SmolLM2-360M-Instruct-q4f16_1-MLC` | 376 | yes | 4096 | n/m | Apache-2.0 | n/a | Toy model |
| `Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC` | 2864 | yes | 4096 | 1856 MiB | Apache-2.0 | n/a | Not evaluated |
| `Phi-3.5-vision-instruct-q4f16_1-MLC` (VLM, `model_type: 2`) | 3952 | yes | 4096 | 2643 MiB | MIT | n/a | The only VLM in 0.2.85 |

Benchmark sources:
- [Q3] Qwen3 Technical Report, Tables 18 and 20 (non-thinking): https://arxiv.org/abs/2505.09388 (HTML: https://arxiv.org/html/2505.09388). Values: Gemma-3-1B 54.5, Phi-4-mini 68.6, Qwen2.5-1.5B 42.5, Qwen2.5-3B 58.2, Qwen3-0.6B 54.5, Qwen3-1.7B 68.2, Qwen3-4B 81.2.
- [Q35] Qwen3.5-2B model card, "Instruct (Non-Thinking) Mode": https://huggingface.co/Qwen/Qwen3.5-2B. Values: Qwen3.5-2B 61.2, Qwen3.5-0.8B 52.1, Qwen3-1.7B 68.2.
- [Q25] Qwen2.5 blog: https://qwenlm.github.io/blog/qwen2.5-llm/. Values: Qwen2.5-1.5B 42.5, 0.5B 27.9, Gemma2-2B 51.0, Phi3.5-mini 52.1, Qwen2.5-3B 58.2.
- [L32] Llama 3.2 model card: https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md. IFEval is the average of prompt and instruction accuracy, loose and strict. Values: 1B 59.5, 3B 77.4.

Licence sources:
- Qwen2.5-3B: https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE ("FOR NON-COMMERCIAL PURPOSES ONLY").
- Other licences: Hugging Face API tags for each `Qwen/*`, `meta-llama/*`, `microsoft/*`, `google/*`, `HuggingFaceTB/*` and `mistralai/*` repo.

### 1.3 JSON-schema and grammar-constrained output: which models are reliable?

- **Constrained decoding in WebLLM is model-agnostic.** XGrammar masks tokens for any LLM in the list, so syntactic validity does not depend on the model, apart from the bugs above.
  - Sources: XGrammar paper, https://arxiv.org/abs/2411.15100; `ResponseFormat` docs in `chat_completion.d.ts`
- What does vary by model is whether the *content* is right, plus the runaway behaviours (#868, #807).
- WebLLM's own docs warn that you **must** also describe the JSON shape in the prompt. Without it, the model may emit whitespace until `max_tokens`.
  - Source: the `ResponseFormat` doc comment in `chat_completion.d.ts`
- **Qwen3 and Qwen3.5 gotcha (verified in our runs).** With `extra_body: { enable_thinking: false }`, WebLLM pushes `"<think>\n\n</think>\n\n"` into `outputIds`. As a result, **`message.content` starts with that prefix**, and the current `JSON.parse(reply.choices[0].message.content)` in `ai.ts` would throw.
  - Strip the prefix with `content.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "")` before parsing.
  - Sources: `lib/index.js` around line 10868; issue #868 output; our results files (`thinkPrefix: true` for every Qwen3/3.5 call)

### 1.4 Our benchmark (M1 Pro 16 GB, Chrome 154 headless, WebGPU/Metal, WebLLM 0.2.85, temperature 0)

**Task:** extract symptom findings from one colloquial check-in sentence pair. Each finding has `symptom` (10-value enum), `status` (present or absent), `when`, `experiencer` (patient or someone_else) and a verbatim `evidence` string. The schema is enforced with `json_object`+`schema`, `max_tokens` is 300, and each run is 2 repeats; outputs were identical across repeats for every model.

**Prompts:**
- v1 is a short instruction.
- v2 adds explicit rules plus one example: list negated symptoms, a reporter is not the experiencer, "fine" means do not list.
- "Dev" is 8 cases (14 gold tuples) that v2 was written against.
- "Held-out" is 8 new cases (11 gold tuples) written afterwards and never tuned on.

**Metrics:**
- Recall counts a hit when (symptom, status, experiencer) match.
- "False present" counts findings marked *present for the patient* that are not in gold. These are the harmful ones.
- Latency is per call, after the model is loaded.

| Model | Recall dev v1 | Recall dev v2 | **Recall held-out v2** | False "present" held-out (of 2 reps) | Median / max ms per call (held-out) | Decode / prefill tok/s | Cold load incl. download¹ |
|---|---|---|---|---|---|---|---|
| Qwen2.5-1.5B (current) | 10/28 | 18/28 | **10/22** | 12 | 2766 / 6073 | 46 / 461 | (local) 5.3 s |
| Qwen3-1.7B | 12/28 | 22/28 | **16/22** | 4 | **1953** / 5996 | **50 / 443** | 42 s |
| Qwen3.5-2B | 16/28 | 20/28 | **10/22** | 6 | 2787 / 9238 | 37 / 291 | 33 s |
| Llama-3.2-3B | 12/28 | 22/28 | **14/22** | 8 | 3888 / 8382 | 36 / 227 | 61 s |
| **Qwen3-4B** | 18/28 | **28/28** | **18/22** | 4 | 5602 / 7972 | 27 / 172 | 72 s |
| Deterministic ConText-style sketch (§5.4) | n/a | 14/14 (written against these cases) | **6/11** | 0 | <1 ms | n/a | n/a |

¹ Cold load includes downloading the weights from the Hugging Face CDN at about 15 MB/s (measured with curl). A warm load from the browser cache took 1.8–4.0 s.

Other observations from the same runs:
- **No crashes and no invalid JSON** in 240 constrained calls (5 models × 48). Every `finish_reason` was `stop`.
- The first call after loading is slower, at 6–12 s, because of grammar compilation and warm-up.
- Verbatim `evidence` strings (case-insensitive substring of the input):
  - Qwen3-1.7B: 50/52
  - Qwen3-4B: 56/62
  - Qwen2.5-1.5B with v2: 42/56
  - Llama-3.2-3B with v2: 56/60
- **Grounded summary test.** Five evidence facts (E1–E5), asked for "2 sentences, cite IDs, no causes, diagnoses or treatment":
  - **Qwen2.5-1.5B violated the constraint both times.** It wrote "The pharmacist should monitor the patient for signs of orthostatic hypotension, as amlodipine 10 mg may cause dizziness…"
  - Qwen3-1.7B, Qwen3.5-2B and Qwen3-4B stayed factual and cited `[E1]` and the other fact IDs.
  - Llama-3.2-3B added a preamble, dropped the citations and garbled one fact.
  - Summary latency: Qwen3-1.7B 1.0 s, Qwen3-4B 3.2 s.
- Typical errors that remain:
  - "Slept like a log" was labelled poor_sleep present (Qwen3-1.7B and Qwen3-4B).
  - "sleepy" was mapped to poor_sleep instead of fatigue.
  - "I don't remember that" was read as negating confusion (Qwen3-1.7B).
  - Qwen3-4B once added a "dizziness absent" finding that the text never mentions.
  - **So user confirmation and deterministic cross-checks remain essential** (§5.5).

Caveat: these are 16 hand-written English sentences. This is a smoke test for choosing between models, not a validated benchmark and not clinical evidence. Present it that way to the judges.

### 1.5 Recommendation (LLM)

1. **Default to `Qwen3-4B-q4f16_1-MLC` on capable devices and the demo machine.** Use **`Qwen3-1.7B-q4f16_1-MLC` as the "light" fallback.** Drop Qwen2.5-1.5B.
   - **Qwen3-4B** had the best extraction (28/28 on dev, 18/22 held-out) and the best grounded summaries, at 5–6 s per call. It is 2.2 GB to download and needs about 3.4 GB of VRAM.
   - **Qwen3-1.7B** is the best quality per second: 16/22 held-out at about 2 s per call, with constraint-respecting summaries. It is about 0.94 GB to download, roughly the same as today's Qwen2.5-1.5B, and needs 2.0 GB of VRAM.
   - Both are Apache-2.0, unlike Qwen2.5-3B, so the "real-world applicability" story holds. Both are `low_resource_required: true`.
   - Pick the tier at runtime:
     - If `adapter.features.has("shader-f16")` is false, use the `q4f32_1` variants: `Qwen3-1.7B-q4f32_1-MLC` (2635 MB VRAM) or `Qwen3-4B-q4f32_1-MLC` (4328 MB).
     - Offer "Light (0.9 GB)" and "Best (2.2 GB)" in Settings.
   - Our M1 Pro adapter reports `shader-f16` and `subgroups`, and `maxBufferSize` is about 4 GB.
2. **Use the LLM for two narrow jobs only:**
   - (a) mapping colloquial phrases to the symptom enum, with negation, time and experiencer, *after* a deterministic pass;
   - (b) a 2–3 sentence plain-language summary over pre-computed, ID'd facts.
   - Keep the medication review (Beers, interactions, anticholinergic burden, FRIDs, cascades) and the symptom-medication timeline **fully deterministic**.
3. **Prompt diet:**
   - Send a short system prompt that names the field rules and gives 1–2 examples (as in our v2 prompt), plus only the raw user text.
   - Do **not** put the schema into the user message as well; a one-line shape description is enough.
   - Keep enums in the schema, not in prose.
   - Set `max_tokens` to 300 or less.
   - This alone should take capture from about 15–20 s to about 2–6 s, based on our measurements on the same machine.
4. **Code changes in `ai.ts` when switching to Qwen3:**
   - Add `extra_body: { enable_thinking: false }`.
   - Strip the `<think>` prefix before `JSON.parse`.
   - Treat `finish_reason !== "stop"` as a failure.
   - On any engine error, terminate the worker, mark the AI as unavailable and fall back to the deterministic output (this already exists for timeouts).
   - Replace the `MODEL` constant with a `ModelChoice` and update `PROMPT_VERSION`.
5. **Do not change the WebLLM version.** 0.2.85 is the latest. Rolling back to 0.2.82 to avoid #844 would change the library set to `v0_2_80` and is not worth the risk this week.

### 1.6 Loading: Hugging Face CDN for the public demo, local copy for offline

Verified network facts (curl with `Origin: https://<user>.github.io`):
- `https://huggingface.co/mlc-ai/<id>/resolve/<rev>/<file>`:
  - echoes `Access-Control-Allow-Origin: <origin>`;
  - redirects shards with a 302 to `https://us.aws.cdn.hf.co/xet-bridge-us/...`, which returns `access-control-allow-origin: *`;
  - redirects small JSON with a 307 to `/api/resolve-cache/...`.
- `raw.githubusercontent.com` (the model library) returns `access-control-allow-origin: *` and `cross-origin-resource-policy: cross-origin`.
- Biggest shard: 155.6 MB for Qwen3-1.7B (30 shards) and 194.5 MB for Qwen3-4B (74 shards). That is far above GitHub's 100 MiB file limit and Cloudflare Pages' 25 MiB limit. **Weights cannot be self-hosted on any of the free static hosts. Use the Hugging Face CDN.**
  - Sources: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github; https://developers.cloudflare.com/pages/platform/limits/

Pinned revisions to use:

| model_id | HF revision (sha) | model_lib (binary-mlc-llm-libs @ `025bcaf3780fa8254f5e5efd3bfea0a5397248f4`, 2026-05-19 "[WASM] Add v0_2_84 WASMs") |
|---|---|---|
| `Qwen3-1.7B-q4f16_1-MLC` | `80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc` | `web-llm-models/v0_2_84/base/Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm` (5.57 MB) |
| `Qwen3-4B-q4f16_1-MLC` | `a5c9fab855e3ccbdfed2e7e69683d75f30332161` | `web-llm-models/v0_2_84/base/Qwen3-4B-q4f16_1_cs1k-webgpu.wasm` (5.85 MB) |
| `Qwen3-1.7B-q4f32_1-MLC` | `bddd4d584cabe19113f7e4ff46fd9e73b4d3dc89` | same pattern, `q4f32_1` |
| `Qwen3-4B-q4f32_1-MLC` | `b7e4eb1ba80728187fb5df44055cc1a7c32310e0` | same pattern, `q4f32_1` |

Sources: `https://huggingface.co/api/models/mlc-ai/<id>` (`sha`); https://github.com/mlc-ai/binary-mlc-llm-libs/commits/main/web-llm-models/v0_2_84/base

Sketch of dual-source resolution. Same worker and engine as today; only the URLs change:

```ts
const LIB_REV = "025bcaf3780fa8254f5e5efd3bfea0a5397248f4";
const MODELS = {
  light: { id: "Qwen3-1.7B-q4f16_1-MLC", rev: "80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc", lib: "Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm", dir: "qwen3-1.7b", vramMB: 2037, downloadMB: 939 },
  best:  { id: "Qwen3-4B-q4f16_1-MLC",   rev: "a5c9fab855e3ccbdfed2e7e69683d75f30332161", lib: "Qwen3-4B-q4f16_1_cs1k-webgpu.wasm",   dir: "qwen3-4b",   vramMB: 3432, downloadMB: 2174 },
} as const;
async function modelRecord(m: (typeof MODELS)[keyof typeof MODELS]) {
  const localBase = new URL(`${import.meta.env.BASE_URL}models/resolve/${m.dir}/`, location.href).href;
  const local = await fetch(localBase + "manifest.json").then(r => r.ok && (r.headers.get("content-type") ?? "").includes("json")).catch(() => false);
  return local
    ? { model_id: m.id, model: localBase, model_lib: localBase + "model.wasm", overrides: { context_window_size: 4096 } }
    : { model_id: m.id,
        model: `https://huggingface.co/mlc-ai/${m.id}/resolve/${m.rev}/`,
        model_lib: `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${LIB_REV}/web-llm-models/v0_2_84/base/${m.lib}`,
        overrides: { context_window_size: 4096 } };
}
```

Notes:
- `scripts/download-model.mjs` needs three changes: the repo name, the revision, `root` and the WASM file name. The file list (`ndarray-cache.json`, `tensor-cache.json`, `tokenizer.json`, `tokenizer_config.json`, `vocab.json`, `merges.txt`, `mlc-chat-config.json`, shards) matches the Qwen3 repos.
- Licence file: https://huggingface.co/Qwen/Qwen3-1.7B (Apache-2.0).
- UX:
  - Show the exact size before download.
  - Call `navigator.storage.persist()`.
  - Use `hasModelInCache()` to show "Already on this device".
  - Chromium origins can store up to 60% of total disk (https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- CSP: the meta CSP **does not govern the Web Worker**. Workers use the CSP delivered with the worker script's own response (https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy). Model fetches made inside the worker are therefore not blocked by `connect-src 'self'`. For honesty and defence in depth, list the hosts explicitly in the meta CSP: `connect-src 'self' https://huggingface.co https://*.hf.co https://raw.githubusercontent.com`. Remove `ws://127.0.0.1:5173` in production builds.
- The privacy claim to make: patient data never leaves the browser. The only network traffic is model and library files, fetched once and cached.
- Browser support: WebGPU ships in Chrome/Edge 113+ (Windows, macOS, ChromeOS) and on Android from Chrome 121; Firefox 141 on Windows and Firefox 145 on Apple-silicon macOS; Safari 26 (https://web.dev/blog/webgpu-supported-major-browsers). WebLLM on Safari 26 is **UNVERIFIED**, so recommend Chrome or Edge desktop in the README and video.

---

## 2. Hosting the public demo

| | GitHub Pages (Actions) | Cloudflare Pages | Netlify | Vercel |
|---|---|---|---|---|
| Custom response headers (CSP, COOP/COEP) | **No** | Yes, `_headers` file (https://developers.cloudflare.com/pages/configuration/headers/) | Yes, `_headers` or `netlify.toml` (https://docs.netlify.com/manage/routing/headers/) | Yes, `vercel.json` `headers` (https://vercel.com/docs/project-configuration/vercel-json#headers) |
| Size limits | Site ≤ 1 GB; soft bandwidth 100 GB/month; deploy timeout 10 min (https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) | ≤ 20,000 files; **25 MiB per asset** (link above) | n/a for our ~12 MB app | n/a for our ~12 MB app |
| Origin isolation | **All project sites of a user share `https://<user>.github.io`**, so they share localStorage and IndexedDB (an origin is scheme+host+port: https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy) | Own `*.pages.dev` origin | Own `*.netlify.app` origin | Own `*.vercel.app` origin |
| Effort | Zero new accounts; repo is already on GitHub and public | New account, connect repo | New account | New account |

Answers to the specific questions:
- **Does WebLLM need COOP/COEP or SharedArrayBuffer?** No. The 0.2.85 bundle contains **zero** references to `SharedArrayBuffer` or `crossOriginIsolated` (`grep -c` on `lib/index.js`). Our benchmark page was served by a plain static server with no COOP/COEP (`crossOriginIsolated: false`) and still ran all 5 models.
  - COOP/COEP would only matter if we added multi-threaded WASM, such as onnxruntime-web CPU threads. WebGPU paths do not need it.
  - **So GitHub Pages' lack of custom headers is not a blocker.** Drop COOP/COEP from `vite.config.ts` too, so that dev matches production. Our curl checks show that the Hugging Face and GitHub raw hosts satisfy CORS either way.
- **Vite base path:** for `https://<user>.github.io/<repo>/`, set `base: '/<repo>/'`, here `'/UnivaBioBabson/'`.
  - Vite rewrites JS-imported asset URLs, CSS `url()` references and `.html` asset references automatically (https://vite.dev/guide/build#public-base-path; https://vite.dev/guide/static-deploy#github-pages).
  - Runtime string URLs in `ai.ts` must use `import.meta.env.BASE_URL`.
  - **UNVERIFIED** whether Vite rewrites the `@import url("/fonts/fonts.css")` that points into `public/`. Safer to move `fonts.css` into `src/` and import it, or use a relative path. Check the built CSS.
- **Model files never reach Pages.** `public/models/` is git-ignored, so the CI checkout has no models and `dist/` is about 12 MB. The runtime falls back to the Hugging Face CDN (§1.6).
- **Workflow** (from the Vite guide; the action versions are the latest releases):
  - `actions/configure-pages` v6.0.0 (2026-03-25), `actions/upload-pages-artifact` v5.0.0 (2026-04-10), `actions/deploy-pages` v5.0.1 (2026-09-01).
  - The app lives in `prototype/`, so set `defaults.run.working-directory: prototype` and upload `prototype/dist`.
  - Enable Pages with Settings → Pages → Source: GitHub Actions.
- **Pages caveat:** GitHub says Pages "shouldn't be used for sensitive transactions" (limits page above). MedWatch sends nothing to the server, but the demo must use **synthetic data only** and say so.
- **SPA routing:** the app does not use `pushState` or a router (grep found none), so no 404 fallback is needed.
- **Do not upgrade Vite** (7.1.7 → 8.3.4, which changes the bundler) during the hackathon.

**Hosting recommendation:** GitHub Pages via Actions at `https://albertzorzolan.github.io/UnivaBioBabson/`. It is free, sits next to the required GitHub repo, and the judges get one URL. Use Cloudflare Pages or Netlify only if you want a real CSP header covering the worker, or a private origin.

---

## 3. In-browser speech-to-text ("speak your check-in")

What exists, and how private it is:
- **Web Speech API by default is server-based.** "Your audio is sent to a web service for recognition processing" (https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API).
- **Chrome on-device recognition (Chrome 139+, desktop).**
  - Chrome 139 added availability checks, language-pack install, and "choose between on-device or cloud-based speech recognition … ensure that audio and transcribed speech are not sent to a third-party service" (https://developer.chrome.com/blog/new-in-chrome-139#on-device-web-speech-api).
  - API: set `recognition.processLocally = true`; call `SpeechRecognition.available({ langs: ["en-US"], processLocally: true, quality })`, which returns `"available" | "downloadable" | "downloading" | "unavailable"`; then call `SpeechRecognition.install({ langs, quality })`.
  - `quality` is `"command"` (the default: short phrases), `"dictation"` or `"conversation"`.
  - Contextual biasing through `recognition.phrases` arrived in Chrome 142.
  - Sources: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally; https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static; MDN browser-compat-data `api/SpeechRecognition.json`: processLocally, available and install in Chrome 139, `false` for Chrome Android and Safari; phrases in Chrome 142.
  - Edge's local recognition model is available only in **Edge Canary or Dev 150.0.4076+, behind the flag "Speech Recognition with on-device model"** (https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api). Treat Edge stable as not supported.
  - **Our probe on this Mac (Chrome 154 headless):**
    - `available({langs:["en-US"], processLocally:true})` returned `"downloadable"` (command quality).
    - The same call with `quality:"dictation"` returned **`"unavailable"`**.
    - Without `processLocally` it returned `"available"`, meaning the cloud.
    - So free-form on-device dictation may not be offered on this machine. Re-check in normal, non-headless Chrome before promising it.
  - Real-world rough edges: Brave reports `available()` stuck on "downloading" (https://github.com/brave/brave-browser/issues/55414).
- **Safari:** speech recognition is "powered by the same speech engine as Siri" and needs Siri enabled (https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/). There is no `processLocally` support (BCD). Whether audio stays on the device is **UNVERIFIED**, so treat it as possibly server-processed.
- **OS dictation (zero code):** macOS lets users check in Keyboard settings whether general text dictation "is processed on your device and not sent to Siri servers" (https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac). The keyboard mic on iOS and Android works in any textarea. This is outside our control, but it is a legitimate hint for the UI.
- **Whisper via Transformers.js:** `@huggingface/transformers` 4.3.1 (2026-10-06); v4 has a rewritten WebGPU runtime, and 4.3 added Safari 26 WebGPU support (https://github.com/huggingface/transformers.js/releases).
  - `onnx-community/whisper-tiny.en`: encoder 32.9 MB (fp32) or 16.5 MB (fp16); `decoder_model_merged` int8 30.7 MB or q4 86.7 MB. About 47–120 MB total depending on dtype.
  - `whisper-base.en`: encoder 41–83 MB plus decoder 54–124 MB.
  - Moonshine-tiny is smaller (encoder 7–31 MB, decoder 20–78 MB).
  - Sizes come from the Hugging Face tree API.
  - Per-module dtypes (fp32 encoder, q4 decoder) are recommended because Whisper encoders are quantization-sensitive (https://huggingface.co/blog/transformersjs-v3).
  - Latency on our hardware is **UNVERIFIED**. The only public number found is about 1.9 s per warm inference for `Xenova/whisper-base` on WebGPU, clip length unstated (https://huggingface.co/datasets/whitphx/transformersjs-performance-leaderboard-results/commit/6c9bbe6b31b16df778906b61b660916437745cf9).
  - It would add a second ML runtime (onnxruntime-web, with WASM fetched from a CDN by default) that competes with WebLLM for GPU memory.

**Speech recommendation:**
- Ship an optional microphone button **only** on the on-device path: Chrome 139+ desktop (Edge only in Canary/Dev behind a flag).
- Show it when `SpeechRecognition.available({langs:['en-US'], processLocally:true})` is anything except `"unavailable"`. Call `install()` on the first click, set `processLocally = true`, and label it "Speech stays on this device". **Never silently fall back to cloud recognition.**
- Otherwise hide the button and show the hint "You can also use your keyboard's dictation".
- Skip Whisper for this 3-day build. It is a good stretch goal, and the right place to name it is the "planned" section of the presentation.
- Older adults benefit from voice, so it is worth demoing if it works on the demo machine. Test that first.

```ts
const SR = (window as any).SpeechRecognition;
export async function onDeviceSpeechStatus() {
  if (!SR?.available) return "unsupported";
  return SR.available({ langs: ["en-US"], processLocally: true }); // "available" | "downloadable" | "downloading" | "unavailable"
}
export async function startOnDevice(onText: (t: string) => void) {
  if ((await onDeviceSpeechStatus()) !== "available" && !(await SR.install({ langs: ["en-US"] }))) throw new Error("On-device speech not available");
  const r = new SR(); r.lang = "en-US"; r.processLocally = true; r.interimResults = true; r.continuous = false;
  r.onresult = (e: any) => onText(Array.from(e.results).map((x: any) => x[0].transcript).join(" "));
  r.start(); return () => r.stop();
}
```

---

## 4. Pill-bottle OCR: is it worth it for the demo?

- **Tesseract.js 7.0.0** was released 2025-12-15. It is 15–35% faster than v6 and adds a `relaxedsimd` build (https://github.com/naptha/tesseract.js/releases/tag/v7.0.0).
  - Core WASM is about 2.86 MB plus about 3.9 MB of JS glue per variant (jsDelivr listing for `tesseract.js-core@7.0.0`).
  - English traineddata: `@tesseract.js-data/eng/4.0.0/eng.traineddata.gz` is 10.9 MB; the `4.0.0_best_int` file is 2.95 MB.
  - v6 fixed a long-standing memory leak and turned off non-text outputs by default (v6.0.0 release notes).
- **Accuracy on curved labels:** Tesseract's own guidance says it works best on horizontal text lines at 300 dpi or more, and that skew "severely impacts" line segmentation. Dewarping is left to external tools such as `page_dewarp` (https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html). Curved, glossy, small-font bottle labels are close to the worst case. No quantitative bottle-label benchmark was found (**UNVERIFIED**). Expect partial reads that need manual correction.
- **VLM alternatives:**
  - The only VLM in WebLLM 0.2.85 is `Phi-3.5-vision-instruct-q4f16_1-MLC`: 3952 MB VRAM and a 2643 MiB download. Too heavy next to the text LLM.
  - Image input for other models is merged but unreleased (#863).
  - `onnx-community/Florence-2-base-ft` (MIT) in Transformers.js has an `<OCR>` task. That is about 357 MB with an fp16 vision encoder, fp16 embeddings and q4 encoder and decoder. Its accuracy on bottles is **UNVERIFIED**.
- Barcode: `BarcodeDetector` exists in Chrome on this Mac (probe: `hasBarcodeDetector: true`). Pharmacy dispensing-label barcodes do not reliably encode the NDC (**UNVERIFIED**), so it is not a dependable shortcut.

**OCR recommendation: skip it.** It would be the flakiest part of a live demo and does not support the core value proposition, which is the medication review and visit brief. Instead:
- build a fast type-ahead over the bundled curated drug list (generic and brand names);
- add strength and frequency pickers;
- add a "paste from pharmacy printout" box parsed with the same deterministic lexicon.

List "label scanning" as planned work.

---

## 5. Clinical-ish NLP without an LLM: NegEx and ConText

### 5.1 Sources

- **NegEx:** Chapman WW, Bridewell W, Hanbury P, Cooper GF, Buchanan BG. *A simple algorithm for identifying negated findings and diseases in discharge summaries.* J Biomed Inform 2001;34(5):301–310. doi:10.1006/jbin.2001.1029. https://pubmed.ncbi.nlm.nih.gov/12123149/
- **ConText:** Harkema H, Dowling JN, Thornblade T, Chapman WW. *ConText: An algorithm for determining negation, experiencer, and temporal status from clinical reports.* J Biomed Inform 2009;42(5):839–851. doi:10.1016/j.jbi.2009.05.002. https://pmc.ncbi.nlm.nih.gov/articles/PMC2757457/
- **Reference trigger files:** https://github.com/chapmanbe/negex, exported from code.google.com/p/negex. The Java GenNegEx README states Apache-2.0. `genConText/negex_triggers.txt` has tags **[PREN] 125, [POST] 15, [PREP] 21, [POSP] 14, [PSEU] 17, [CONJ] 89**. `history_triggers.txt` adds **[ONEW]** one-word-scope triggers; `experiencer_triggers.txt` and `hypothetical_triggers.txt` use [PREN], [PSEU] and [CONJ].
- **medspaCy ConText rules (MIT):** https://github.com/medspacy/medspacy/blob/master/resources/en/context_rules.json. 102 English rules. Categories: NEGATED_EXISTENCE (43 forward, 15 backward, 11 terminate), POSSIBLE_EXISTENCE, HISTORICAL, HYPOTHETICAL and FAMILY, with directions FORWARD, BACKWARD and TERMINATE.

### 5.2 The algorithm, precise enough to implement

Paraphrased from Harkema 2009 §3:

1. **Input:** a sentence in which target conditions are already found by a lexicon. Each target gets default values: Negation = *affirmed*, Temporality = *recent*, Experiencer = *patient*.
2. **Mark up** every trigger term, pseudo-trigger and termination term in the sentence.
3. **Trigger types:**
   - *Pre-triggers* (NegEx [PREN], [PREP]; medspaCy FORWARD) act on targets to their **right**.
   - *Post-triggers* (NegEx [POST], [POSP]; medspaCy BACKWARD; ConText has 14 "left-looking" negation post-triggers, such as "is ruled out" and "negative") act on targets to their **left**, back to the start of the sentence.
   - The P- variants mark *possible* rather than definite negation.
4. **Pseudo-triggers** ([PSEU]) contain a trigger word but must not fire, as in "no increase" or "history and physical". When one matches, the overlapping trigger is skipped.
5. **Scope:**
   - In ConText, a trigger's scope runs from the trigger to the end of the sentence, or to the first **termination term**, whichever comes first.
   - NegEx instead caps the scope at a **six-token window** (multi-word concepts count as one token), or six tokens to the left for post-triggers. ConText's sentence-or-termination scope gave higher recall, mainly for historical and hypothetical enumerations (Harkema §3.1.4 and §4.2).
   - Termination classes are shared across properties. Examples from Harkema Table 1: presentation ("presents", "comes in with"), "but" or "aside from", "because" or "since", etiology ("secondary to"), "which", "and" or "so".
6. **Special scopes in ConText:**
   - A few historical triggers ("pre-existing", "status post", "s/p") cover only **one** condition to their right (NegEx [ONEW]).
   - A historical trigger in a **section title** covers the whole section.
7. **Properties and values:**
   - Negation: affirmed or negated, plus "possible" in NegEx.
   - Temporality: recent, *historical* (defined as starting more than **2 weeks** before the encounter) or *hypothetical* (for example "if", "return").
   - Experiencer: patient or *other* (for example "mother", "brother").
8. **Reported performance** (clinical notes, not lay text):
   - Negation: about 97% recall and 97% precision in the initial ED study.
   - Historical: F about 0.73–0.84.
   - Hypothetical: "if" and "return" covered most cases.
   - Experiencer was rare.
   - Source: Harkema §3 and §5.

### 5.3 JavaScript implementations

- `npm view negex` returns **404**, so there is no such package.
- The closest is `negation@0.0.2` (MIT, last published 2014; https://github.com/hdcue/negation). It is stale and negation-only.
- **No maintained JS ConText exists.** Writing one takes about 120 lines (§5.4).
- Helpers if needed:
  - `compromise` 14.18.0 (MIT, about 250 KB minified; `.verbs().isNegative()`; https://github.com/spencermountain/compromise)
  - `wink-nlp` 2.4.0 (MIT)
  - `fuse.js` 7.5.0 (Apache-2.0, 9 KB gzip) for fuzzy drug-name type-ahead
- None of these is required for the core feature.

### 5.4 Tested TypeScript sketch, with lay-language triggers written from scratch

- File: `research/context-sketch/context.ts`, with its test in `test.ts`. Run it with `node test.ts`; Node 26 strips types natively.
- Design:
  - A lexicon maps lay phrases to the enum ("woozy" or "light-headed" to dizziness, "muddled" or "foggy" to confusion, "nearly fell" to near_fall, "wobbly" to unsteadiness, and so on).
  - Rules have `{cat, dir, re}`, with categories NEGATED, PSEUDO, TERMINATE, HISTORICAL, YESTERDAY, TODAY, OTHER_PERSON, REPORTER and HYPOTHETICAL.
  - Scope is the sentence and stops at a termination term ("but", "however", "although", "except", "I'm", ",", ";").
  - A negation word inside the target phrase ("no energy", "didn't sleep") belongs to the target, not to a modifier.
  - One finding per symptom and status per sentence. Every finding carries character offsets.
- Results: **14/14 on the dev cases it was written against, and 6/11 on the 8 held-out cases.** The held-out misses show what a production lexicon needs:
  - **Generic negation:** "didn't/did not + any verb".
  - **Other-person subject:** "my <relation> <verb>", not only "my X has/is".
  - **Wider lexicon:** "washed out", "sleepy", "grab(bed) the counter" or "stopped myself going over" as a near-fall.
  - A note on gold labels: "Slept like a log" should mean nothing is flagged.

### 5.5 How to combine rules and the LLM (recommended)

1. Run the **deterministic pass first**. It is instant, explainable and offline, and it pre-fills the check-in chips with offsets highlighted.
2. Run the **LLM pass**, if loaded, with the v2-style prompt and enum schema. It proposes extra or alternative findings, each with a verbatim `evidence` quote.
3. **Accept an LLM finding automatically only if both checks pass:**
   - (a) the evidence is an exact substring of the input;
   - (b) the deterministic negation and experiencer check on that span agrees, or is silent.
   Otherwise mark it **"Please confirm"**.
4. The older adult or caregiver confirms every chip before it is saved. That matches the "discussion aid" positioning and catches the errors seen in §1.4. Log `source: "rules" | "ai" | "user"` per field for the visit brief.

---

## 6. Client-side PDF for a one-page clinician brief

| Option | Version / size (bundlephobia min+gzip) | Pros | Cons |
|---|---|---|---|
| **Print CSS + `window.print()`** | 0 KB | Already in the app (`VisitBrief.tsx` calls `window.print()`, and `style.css` has `@media print` and `@page`). Text stays vector and selectable, so it is accessible. Recharts' SVG prints as vector | The user picks "Save as PDF" in the print dialog. Layout varies slightly by browser |
| jsPDF | 4.2.1 (2026-03-17), 127 KB gz | Programmatic; `html()` uses optional html2canvas | HTML paths are raster (html2canvas), which means blurry, untagged text. Manual layout otherwise |
| pdf-lib | 1.17.1, 173 KB gz | Low-level, good for filling or modifying PDFs | **Last release 2021-11-06.** Everything is manual |
| @react-pdf/renderer | 4.9.0 (2026-08-27), 432 KB gz | React components to a real vector PDF with one-click download. Supports React 19 since v4.1.0 (https://react-pdf.org/compatibility). Has SVG primitives: `Svg`, `Line`, `Polyline`, `Rect`, `Path` (https://react-pdf.org/svg) | Cannot render DOM or Recharts, so the chart must be redrawn from the same data with its primitives. Lazy-load it |

**PDF recommendation:**
- Keep **print CSS** as the primary path. It is zero-risk and already tested by `npm run test:print`.
  - Use `@page { size: Letter; margin: 12mm }`, `print-color-adjust: exact` for status colours, and `break-inside: avoid` on sections.
  - Render the chart at a **fixed width and height** in the print layout, for example 680×170 px, not inside `ResponsiveContainer`, with `isAnimationActive={false}`.
  - Add a printed footer: "Generated on-device by MedWatch · discussion aid, not medical advice · sources: AGS Beers 2023 …".
- Add "Download PDF" with `@react-pdf/renderer` only if time remains on day 3, behind a dynamic `import()`.
- Avoid the jsPDF+html2canvas raster path.

---

## 7. Charting: Recharts 3.2.1

- 3.2.1 (2025-09-16) declares peer dependencies `react ^19`, `react-dom ^19` and `react-is ^19`. `react-is@19.3.0` is installed, so the React 19 setup is fine.
- The latest release is 3.10.1 (2026-07-25). Releases since 3.2.1 that are relevant to us:
  - 3.3.0: a `responsive` prop on every chart.
  - 3.7.0: `Cell` deprecated.
  - 3.10.0: Legend `position`/`offset` and XAxis `height="auto"`.
  - Source: https://github.com/recharts/recharts/releases
- No blocking issue for our use. An upgrade within 3.x is optional and low risk, but unnecessary this week.
- Things to know:
  - In 3.x, `accessibilityLayer` is **on by default**, which gives keyboard and ARIA support (https://github.com/recharts/recharts/wiki/3.0-migration-guide).
  - `ResponsiveContainer` sizes from the parent through ResizeObserver. In print it can keep the screen width, or render 0×0 inside hidden or `display:none` parents. Use fixed dimensions for the printed brief.
  - The app already sets `isAnimationActive={false}`, so print never captures mid-animation.
  - Bundle cost is about 148 KB gz for 3.10.1.
- Chart pattern for the "descriptive, not causal" story:
  - Use a symptom-days `Bar` or dot strip per day, with `ReferenceLine x={startDate}` labelled "Amlodipine 10 mg started".
  - Add a text annotation with the counts and denominators ("dizziness 4/7 days after vs 1/7 days before"), not a trend line.
  - Keep colours colour-blind-safe and also encode with text, since printouts may be greyscale.

---

## 8. Recommended stack (3-day build)

| Layer | Choice | Version / ID | Why |
|---|---|---|---|
| App | React + TypeScript + Vite (keep) | react 19.1.1, vite 7.1.7 (do **not** move to Vite 8 this week) | Works; avoid churn |
| On-device LLM runtime | WebLLM in a Web Worker (keep) | `@mlc-ai/web-llm@0.2.85` (latest) | Same APIs; no SharedArrayBuffer needed |
| Model "Best" (demo default on capable GPUs) | **`Qwen3-4B-q4f16_1-MLC`** @ `a5c9fab8…` | 2174 MiB, ~3.4 GB VRAM, Apache-2.0 | Best extraction (28/28 dev, 18/22 held-out) and grounded summaries in our test; IFEval 81.2 |
| Model "Light" (fallback / slower machines) | **`Qwen3-1.7B-q4f16_1-MLC`** @ `80b3abce…` | 939 MiB, ~2.0 GB VRAM, Apache-2.0 | About the size of today's model; 16/22 held-out at about 2 s per call; IFEval 68.2 versus 42.5 for the current model |
| No-`shader-f16` devices | `Qwen3-{1.7B,4B}-q4f32_1-MLC` | 2635 / 4328 MB VRAM | Automatic fallback |
| Model hosting | Hugging Face CDN at the pinned revision; model lib from `binary-mlc-llm-libs@025bcaf3`; local `public/models/` copy still preferred when present | n/a | Shards of 155–195 MB cannot live on any free static host |
| Structured output | `response_format: {type:"json_object", schema}` with enums, `max_tokens` ≤ 300, `extra_body:{enable_thinking:false}`, strip `<think>…</think>`, Ajv validate, verbatim-evidence check | n/a | Measured: 0/240 invalid outputs |
| Symptom NLP | **Deterministic ConText-style extractor first** (TypeScript, about 150 lines, our own lay lexicon); LLM second; user confirms every chip | Sketch in `research/context-sketch/` | Instant, explainable, offline; the LLM covers lexicon gaps |
| Medication review and timeline | Deterministic rules with citations (no LLM) | n/a | Rigor and reproducibility |
| Speech (optional) | Web Speech API **only with `processLocally=true`** (Chrome 139+ desktop; Edge stable not yet); otherwise hide the button and hint at OS dictation | n/a | Keeps the no-audio-leaves-device promise. Skip Whisper this week |
| OCR | **Skip.** Use type-ahead over the curated drug list instead (optional `fuse.js@7.5.0`) | n/a | Tesseract struggles on curved labels; VLMs are too heavy |
| PDF | Print CSS (keep and polish); optional `@react-pdf/renderer@4.9.0` lazy "Download PDF" | n/a | Vector, accessible, zero-dependency |
| Charts | Recharts 3.2.1 (keep); fixed-size chart in the print layout | n/a | Works with React 19; a11y layer on by default |
| Hosting | **GitHub Pages via Actions**: `base: '/UnivaBioBabson/'`, working dir `prototype/`, upload `prototype/dist`; remove dev COOP/COEP; CSP `connect-src` lists the HF and GitHub raw hosts | configure-pages v6, upload-pages-artifact v5, deploy-pages v5 | Free, next to the required repo; no custom headers needed |

Integration checklist, in order:
1. Switch to `MODELS.light` and `MODELS.best` with dual-source URLs (§1.6).
2. Add `enable_thinking:false`, the think-strip and `finish_reason` checks.
3. Slim the prompts, then rerun `npm run test:ai`. Record `usage.prompt_tokens` and latency, and expect a few seconds per call instead of 15–22 s.
4. Add the deterministic ConText pass and the hybrid acceptance rule (§5.5).
5. Fix absolute paths (`BASE_URL`, `fonts.css`).
6. Add the GitHub Actions Pages workflow. Verify a cold load from the Hugging Face CDN on the Pages URL in a fresh Chrome profile. Expect about 40–75 s for the first download at about 15 MB/s, then 2–4 s warm.
7. Run deterministic-only mode on a machine without WebGPU to prove graceful degradation.
8. Polish the print layout with a fixed-size chart.
9. Optional extras: the on-device speech button (test `available()` first), then react-pdf download.

Be honest about these in the submission (finished versus planned):
- The model comparison is a 16-sentence smoke test on one Mac.
- Windows/AMD iGPU users may hit WebLLM #844.
- Speech is Chrome-only and on-device only.
- OCR and Whisper are planned work.
