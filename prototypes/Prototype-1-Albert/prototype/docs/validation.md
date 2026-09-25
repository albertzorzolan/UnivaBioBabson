# Development verification · September 25, 2026

This is evidence about a fictional-data software prototype. It is not clinical validation, a legal classification, or a statement that the model is medically safe.

## Results on this Mac

| Check                           | Observed result                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript + production bundle  | Passed; production route and local model manifest also checked in Chrome                                                                    |
| Unit / contract tests           | 20 passed                                                                                                                                   |
| Browser workflow assertions     | 16 passed, with no page errors or third-party runtime requests in those flows                                                               |
| Axe WCAG A/AA scan              | No violations reported on login, overview, daily records, medication list, visit brief, and patient check-in at the tested desktop viewport |
| Mobile workflow                 | Patient and brief views fit a 390 px viewport; static help remained accessible                                                              |
| Local model scenarios           | 9 of 9 selected synthetic development scenarios passed, one run each                                                                        |
| Local model initialization      | 6.14 seconds in the final evaluation run                                                                                                    |
| Local generation latency        | Median 16.16 seconds; range 5.49–21.71 seconds across the nine scenarios                                                                    |
| Network during model evaluation | No third-party requests observed; all assets and inference remained local                                                                   |
| Active AI cancellation          | Passed: cancelled draft rejected, source unchanged, worker reloaded, subsequent clarification generated successfully                         |
| Sample visit brief              | One Letter page, visually inspected                                                                                                         |
| Long medication list            | All 32 rows present across two pages; no sidebar or controls in print                                                                       |
| Print review guard              | Unreviewed report content hidden in print media                                                                                             |
| Optional WebMCP integration     | Feature-detected; unavailable in the tested browser, so no end-to-end native WebMCP execution is claimed                                    |

Hardware: Apple M1 Pro, 16 GB RAM. Automated browser: Chrome 153, headless, with WebGPU/Metal enabled for local-model tests. A warm-generation target of 15 seconds for capture and 20 seconds for a brief was not consistently reached. Device/browser performance will vary.

## What the model scenarios establish

The final run used prompt version `medwatch-local-1.6.0`, Qwen2.5-1.5B-Instruct-q4f16_1-MLC, WebLLM 0.2.85, and the pinned local artifacts in `model-manifest.json`.

- C01: explicit energy rating and combined no-falls/no-near-falls statement.
- C02: explicit negation for dizziness and memory fog.
- C06: sleep duration does not become a sleep-quality score.
- C07: “I did not fall” does not imply no near-falls.
- C10: source offsets remain correct with an emoji in the original string.
- C11: an eligible fixed clarification ID is selected.
- A summary of supplied aggregate facts.
- A record question about average energy, using retrieved facts.
- A caregiver visit draft with a pinned concern in context.

These are development cases used while adjusting the implementation, not an unseen test set. “Passed” means the implemented acceptance check passed after host validation. It does not imply general semantic reliability. Earlier development candidates included formatting errors and unsupported rating suggestions; those were withheld by validation, and the prompt/grammar were revised. The current evaluation preserves the raw synthetic candidate beside the accepted result for inspection.

The 40-case blueprint suite and its planned three repeats per model case have **not** been fully executed. Additional work includes broader language/ambiguity coverage, adversarial semantic review, broader cancellation/reset fault injection, screen-reader and human usability studies, independent content review, and clinical/regulatory/privacy assessment before any real-patient use.

The final targeted cancellation check found that WebLLM could retain interrupted generation state. Active cancellation now rejects the pending request and terminates the worker. The user reloads local AI before another request. The retest passed and source records were unchanged; the nine-case evaluation above preceded this cancellation-only fix.

## Test records

- `model-evaluation.json`: final inputs/scenario IDs, model outputs, acceptance results, timings and request observations.
- `browser-results.json`: completed browser assertions.
- `accessibility-results.json`: per-screen automated scan results.
- `print-results.json`: print guard and overflow scenario metadata.
- `cancellation-results.json`: real-model cancellation and subsequent-request check.
- `code-pdf-manifest.json`: source files included in the code PDF.

No automated scan proves overall accessibility, privacy, clinical safety or regulatory compliance. Real healthcare deployment remains outside the implemented release profile.
