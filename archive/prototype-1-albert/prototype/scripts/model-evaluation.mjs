import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
const context = await browser.newContext();
const page = await context.newPage();
const external = [];
page.on("request", (r) => {
  if (
    !r.url().startsWith("http://127.0.0.1:5173") &&
    !r.url().startsWith("blob:")
  )
    external.push(r.url());
});
try {
  await page.goto("http://127.0.0.1:5173");
  const result = await page.evaluate(async () => {
    const ai = await import("/src/ai.ts");
    const d = await import("/src/domain.ts");
    const source = JSON.parse(localStorage.getItem("medwatch.demo.source"));
    const today = d.localDate(),
      from = d.shiftDate(today, -13);
    const start = performance.now();
    await ai.loadModel();
    const loadMs = performance.now() - start;
    const cases = [
      {
        id: "C01",
        operation: "capture",
        role: "patient",
        rawStory:
          "My energy was 2 out of 5. I had no falls or near-falls today.",
        expected: { energy: 2, fallsOrNearFalls: false },
      },
      {
        id: "C02",
        operation: "capture",
        role: "patient",
        rawStory:
          "I was not dizzy today and did not have any memory fog or confusion.",
        expected: { dizziness: false, confusion: false },
      },
      {
        id: "C06",
        operation: "capture",
        role: "patient",
        rawStory: "I slept for five hours.",
        expected: {},
      },
      {
        id: "C07",
        operation: "capture",
        role: "patient",
        rawStory: "I did not fall today.",
        expected: {},
      },
      {
        id: "C10",
        operation: "capture",
        role: "patient",
        rawStory: "I wrote 🌿. My energy is 2 out of 5.",
        expected: { energy: 2 },
      },
      {
        id: "C11",
        operation: "clarify",
        role: "patient",
        answers: { ...d.EMPTY, dizziness: true },
        questionIds: ["dizziness_severity"],
        expectedQuestions: ["dizziness_severity"],
      },
      {
        id: "summary-demo",
        operation: "record_summary",
        role: "caregiver",
        evidence: d
          .factsFor(source, from, today)
          .map((f) => ({ id: f.id, text: f.text })),
      },
      {
        id: "qa-demo",
        operation: "record_qa",
        role: "caregiver",
        question: "What was my average energy?",
        evidence: d
          .factsFor(source, from, today)
          .filter((f) => f.id === "fact:energy")
          .map((f) => ({ id: f.id, text: f.text })),
      },
      {
        id: "visit-demo",
        operation: "visit_brief",
        role: "caregiver",
        evidence: [
          ...d
            .factsFor(source, from, today)
            .map((f) => ({ id: f.id, text: f.text })),
          ...source.notes
            .filter((n) => n.pinned)
            .map((n) => ({
              id: `concern:${n.id}`,
              text: `Caregiver concern: ${n.text}`,
            })),
        ],
      },
    ];
    const results = [];
    for (const test of cases) {
      let trace;
      try {
        const r = await ai.runAI(
          {
            source,
            from: test.operation === "capture" ? today : from,
            to: today,
            answers: d.EMPTY,
            ...test,
          },
          (candidate, errors) => {
            trace = { candidate: structuredClone(candidate), errors };
          },
        );
        const values = Object.fromEntries(
          (r.payload.proposals ?? []).map((p) => [p.field, p.value]),
        );
        const passed =
          test.operation === "capture"
            ? Object.keys(values).length ===
                Object.keys(test.expected).length &&
              Object.entries(test.expected).every(([f, v]) => values[f] === v)
            : test.expectedQuestions
              ? JSON.stringify(r.payload.questionIds) ===
                JSON.stringify(test.expectedQuestions)
              : r.status === "ok";
        results.push({
          id: test.id,
          operation: test.operation,
          passed,
          result: r,
          trace,
        });
      } catch (e) {
        results.push({
          id: test.id,
          operation: test.operation,
          passed: false,
          error: String(e),
          trace,
        });
      }
    }
    return {
      model: ai.MODEL,
      promptVersion: ai.PROMPT_VERSION,
      loadMs,
      results,
    };
  });
  mkdirSync("docs", { recursive: true });
  writeFileSync(
    "docs/model-evaluation.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        hardware: "Apple M1 Pro, 16 GB RAM; Chrome headless with WebGPU/Metal",
        repeats: 1,
        scope:
          "Nine selected synthetic development scenarios, not an unseen benchmark or clinical validation",
        ...result,
        externalRequests: external,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        loadMs: result.loadMs,
        results: result.results.map((r) => ({
          id: r.id,
          passed: r.passed,
          error: r.error,
          ms: r.result?.durationMs,
        })),
        external,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
