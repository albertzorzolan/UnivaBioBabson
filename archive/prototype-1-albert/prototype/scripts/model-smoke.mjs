import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
const page = await browser.newPage();
const errors = [];
const network = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => network.push(r.url()));
page.on("console", (m) => {
  if (m.type() === "error") console.log("Browser:", m.text().slice(0, 400));
});
await page.goto("http://127.0.0.1:5173");
const operations = process.env.MODEL_OPS?.split(",") ?? [
  "capture",
  "record_summary",
  "visit_brief",
];
const result = await page.evaluate(async (operations) => {
  try {
    const ai = await import("/src/ai.ts");
    const d = await import("/src/domain.ts");
    const start = performance.now();
    await ai.loadModel();
    const loadMs = performance.now() - start;
    const source = JSON.parse(localStorage.getItem("medwatch.demo.source"));
    const from = d.shiftDate(d.localDate(), -13),
      to = d.localDate();
    const evidence = d
      .factsFor(source, from, to)
      .map((f) => ({ id: f.id, text: f.text }));
    const results = [];
    for (const test of [
      {
        operation: "capture",
        role: "patient",
        rawStory:
          "My energy was 2 out of 5. I had no falls or near-falls today.",
        answers: d.EMPTY,
      },
      { operation: "record_summary", role: "caregiver", evidence },
      { operation: "visit_brief", role: "caregiver", evidence },
    ].filter((test) => operations.includes(test.operation))) {
      try {
        let trace;
        try {
          const result = await ai.runAI(
            { source, from, to, ...test },
            (candidate, errors) => {
              trace = { candidate: structuredClone(candidate), errors };
            },
          );
          results.push({ operation: test.operation, result, trace });
        } catch (e) {
          results.push({ operation: test.operation, error: String(e), trace });
        }
      } catch (e) {
        results.push({ operation: test.operation, error: String(e) });
      }
    }
    return { loadMs, results };
  } catch (e) {
    return { error: String(e), stack: e.stack };
  }
}, operations);
mkdirSync("test-results", { recursive: true });
writeFileSync(
  "test-results/model-smoke.json",
  JSON.stringify(
    {
      ...result,
      errors,
      externalRequests: network.filter(
        (u) =>
          !u.startsWith("http://127.0.0.1:5173") &&
          !u.startsWith("blob:http://127.0.0.1:5173"),
      ),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      ...result,
      results: result.results?.map((r) => ({
        operation: r.operation,
        error: r.error,
        payload: r.result?.payload,
        trace: r.trace?.candidate?.payload,
        durationMs: r.result?.durationMs,
      })),
    },
    null,
    2,
  ),
);
await browser.close();
