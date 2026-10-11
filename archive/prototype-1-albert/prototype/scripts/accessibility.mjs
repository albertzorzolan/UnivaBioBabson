import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const results = [];
try {
  await page.goto("http://127.0.0.1:5173");
  for (const view of [
    "login",
    "overview",
    "Daily records",
    "Medication list",
    "Visit brief",
    "patient",
  ]) {
    if (view === "overview") {
      await page.getByRole("button", { name: "Caregiver demo" }).click();
      await page.getByRole("button", { name: "Enter your space" }).click();
    } else if (view === "patient") {
      await page
        .locator(".sidebar-bottom")
        .getByRole("button", { name: "Sign out", exact: true })
        .click();
      await page.getByRole("button", { name: "Patient demo" }).click();
      await page.getByRole("button", { name: "Enter your space" }).click();
    } else if (view !== "login") {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: view, exact: true })
        .click();
    }
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    results.push({
      view,
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  }
  writeFileSync(
    "test-results/accessibility.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    results.map((r) => ({
      view: r.view,
      issues: r.violations.map((v) => ({ id: v.id, count: v.nodes.length })),
    })),
  );
} finally {
  await browser.close();
}
