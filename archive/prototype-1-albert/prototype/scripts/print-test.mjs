import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
mkdirSync("output/pdf", { recursive: true });
mkdirSync("tmp/pdfs", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "Caregiver demo" }).click();
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visit brief", exact: true })
    .click();
  await page.getByRole("button", { name: "Use a simple template" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".report-header")).not.toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("I reviewed the facts and wording.").check();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "output/pdf/MedWatch-Sample-Visit-Brief.pdf",
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("medwatch.demo.source"));
    const original = s.medications[0];
    s.medications = Array.from({ length: 32 }, (_, i) => ({
      ...original,
      id: `print-med-${i}`,
      name: `Fictional print test medicine ${i + 1}`,
    }));
    s.medicationEvents = [];
    s.sourceRevision++;
    localStorage.setItem("medwatch.demo.source", JSON.stringify(s));
  });
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visit brief", exact: true })
    .click();
  await page.getByRole("button", { name: "Use a simple template" }).click();
  await page.getByLabel("I reviewed the facts and wording.").check();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "tmp/pdfs/overflow-32-medicines.pdf",
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });
  writeFileSync(
    "test-results/print.json",
    JSON.stringify(
      {
        unreviewedPrintHidden: true,
        overflowMedicines: 32,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Created sample and 32-row overflow print test.");
} finally {
  await browser.close();
}
