import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
});
mkdirSync("output/video", { recursive: true });
mkdirSync("tmp/video", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: "tmp/video", size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
const timings = [];
const start = Date.now();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function caption(title, text) {
  timings.push({ seconds: (Date.now() - start) / 1000, title, text });
  await page.evaluate(
    ({ title, text }) => {
      let box = document.getElementById("demo-caption");
      if (!box) {
        box = document.createElement("div");
        box.id = "demo-caption";
        Object.assign(box.style, {
          position: "fixed",
          bottom: "22px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "850px",
          maxWidth: "90vw",
          background: "#243f34",
          color: "white",
          padding: "17px 23px",
          borderRadius: "10px",
          fontFamily: "Arial,sans-serif",
          fontSize: "16px",
          lineHeight: "1.5",
          boxShadow: "0 8px 30px #0002",
          zIndex: "9999",
          pointerEvents: "none",
        });
        document.body.appendChild(box);
      }
      box.replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = title;
      strong.style.display = "block";
      strong.style.fontSize = "17px";
      const sub = document.createElement("div");
      sub.textContent = text;
      sub.style.color = "#e0eadd";
      box.append(strong, sub);
    },
    { title, text },
  );
}
const pause = (ms) => page.waitForTimeout(ms);
const nav = (name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
try {
  await page.goto("http://127.0.0.1:5173");
  await caption(
    "MedWatch · A clearer story between care visits",
    "A fictional-data prototype for older adults and caregivers. Capture the details, then bring a better record to a visit.",
  );
  await pause(5500);
  await page.getByRole("button", { name: "Patient demo" }).click();
  await page.getByRole("button", { name: "Enter your space" }).click();
  await caption(
    "Start with the patient’s own words",
    "The full manual check-in always works. AI can suggest answers, but the patient chooses what to keep.",
  );
  await pause(3500);
  await page
    .getByRole("button", { name: "Load local AI", exact: true })
    .click();
  await expect(page.locator(".ai-status")).toContainText("Model loaded", {
    timeout: 120000,
  });
  await page
    .locator("textarea")
    .fill("My energy was 2 out of 5. I had no falls or near-falls today.");
  await pause(2000);
  await caption(
    "Real AI, running on this device",
    "Qwen2.5 runs in a WebGPU worker. These fresh prompts and records do not go to a cloud AI service.",
  );
  await page
    .getByRole("button", { name: "Suggest answers from my story" })
    .click();
  await expect(page.locator(".capture-review")).toBeVisible({ timeout: 45000 });
  await page.locator(".capture-review").scrollIntoViewIfNeeded();
  await caption(
    "Every suggestion comes with its evidence",
    "The host checks the response and source quotes. Nothing has been saved yet.",
  );
  await pause(6500);
  const boxes = page.locator(".proposal input[type=checkbox]:enabled");
  expect(await boxes.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: "Use selected suggestions" }).click();
  await page.getByRole("button", { name: "Review & save check-in" }).click();
  await caption(
    "The patient confirms the final record",
    "Unanswered fields stay unknown. A correction preserves the earlier version instead of creating a duplicate day.",
  );
  await pause(5000);
  await page.getByRole("button", { name: "Confirm & save check-in" }).click();
  await pause(1500);
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await page.getByRole("button", { name: "Caregiver demo" }).click();
  await page.getByRole("button", { name: "Enter your space" }).click();
  await caption(
    "A shared picture for the caregiver",
    "Descriptive counts and charts come from confirmed answers. Missing days remain visible as gaps.",
  );
  await pause(5500);
  await page.locator(".trend").scrollIntoViewIfNeeded();
  await pause(4500);
  await nav("Daily records");
  await page.locator(".facts-strip>button").nth(1).click();
  await caption(
    "Follow a finding back to the original record",
    "Answered days form the denominator. Caregiver notes are kept separate from patient answers.",
  );
  await pause(5000);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator(".record-ai").scrollIntoViewIfNeeded();
  await page
    .getByLabel("Ask about the recorded observations")
    .fill("What was my average energy?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".narrative-result")).toBeVisible({
    timeout: 45000,
  });
  await page.locator(".narrative-result").scrollIntoViewIfNeeded();
  await caption(
    "Ask what the record actually shows",
    "AI wording includes source links. Diagnosis, medication decisions and care timing are outside this tool’s scope.",
  );
  await pause(6000);
  await nav("Visit brief");
  await page.getByRole("button", { name: "Draft with local AI" }).click();
  await expect(page.locator(".report-editable")).not.toHaveCount(0, {
    timeout: 45000,
  });
  await page.locator(".report-editable").first().scrollIntoViewIfNeeded();
  await caption(
    "Prepare a conversation, with review built in",
    "AI drafts discussion wording. Code renders the medication list and numerical facts. Pinned concerns stay in the author’s own words.",
  );
  await pause(7000);
  await page.getByLabel("I reviewed the facts and wording.").check();
  await page
    .getByRole("button", { name: "Print / save as PDF" })
    .scrollIntoViewIfNeeded();
  await caption(
    "Reviewed and ready to print",
    "The user can save a PDF locally. Nothing is sent to a clinician and no one is monitoring the app.",
  );
  await pause(6000);
  await page
    .getByRole("button", { name: "Privacy & local AI", exact: true })
    .click();
  await page.evaluate(() => scrollTo(0, 0));
  await caption(
    "Working prototype. Honest boundaries.",
    "Local AI and records are working. Source explanations await qualified review; real-patient use and clinical validation are not part of this demo.",
  );
  await pause(7000);
  await page.screenshot({ path: "test-results/demo-final-frame.png" });
  expect(errors).toEqual([]);
} catch (e) {
  await page.screenshot({
    path: "test-results/demo-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  const video = page.video();
  await context.close();
  await video?.saveAs("output/video/MedWatch-Demo.webm");
  writeFileSync(
    "docs/demo-recording.json",
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        timings,
        errors,
        captioned: true,
        audio: false,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
