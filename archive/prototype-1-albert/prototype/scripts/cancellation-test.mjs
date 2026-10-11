import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:5173");
  const result = await page.evaluate(async () => {
    const ai = await import("/src/ai.ts");
    const d = await import("/src/domain.ts");
    await ai.loadModel();
    const source = JSON.parse(localStorage.getItem("medwatch.demo.source"));
    const today = d.localDate();
    let cancelled = false;
    const pending = ai.runAI({
      operation: "capture",
      role: "patient",
      source,
      from: today,
      to: today,
      rawStory: "My energy was 2 out of 5.",
      answers: d.EMPTY,
    });
    setTimeout(() => ai.cancelGeneration(), 100);
    try {
      await pending;
    } catch (e) {
      cancelled = /cancelled|context changed/.test(String(e));
    }
    const unchanged =
      localStorage.getItem("medwatch.demo.source") === JSON.stringify(source);
    // Cancellation clears the worker; the user explicitly reloads local AI.
    await ai.loadModel();
    const followup = await ai.runAI({
      operation: "clarify",
      role: "patient",
      source,
      from: today,
      to: today,
      answers: { ...d.EMPTY, dizziness: true },
      questionIds: ["dizziness_severity"],
    });
    ai.cancelGeneration();
    return {
      cancelled,
      sourceUnchanged: unchanged,
      reloadedAfterCancellation: true,
      nextRequestWorks: followup.status === "ok",
      questionIds: followup.payload.questionIds,
    };
  });
  writeFileSync(
    "docs/cancellation-results.json",
    JSON.stringify({ testedAt: new Date().toISOString(), ...result }, null, 2),
  );
  console.log(result);
  if (!result.cancelled || !result.sourceUnchanged || !result.nextRequestWorks)
    throw new Error("Cancellation behavior did not pass.");
} finally {
  await browser.close();
}
