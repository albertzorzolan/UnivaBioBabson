import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [],
  external = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (
    !r.url().startsWith("http://127.0.0.1:5173") &&
    !r.url().startsWith("blob:")
  )
    external.push(r.url());
});
mkdirSync("test-results", { recursive: true });
const source = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("medwatch.demo.source")));
const check = (s) => {
  checks.push(s);
  console.log("PASS:", s);
};
const login = async (role) => {
  await page
    .getByRole("button", {
      name: role === "patient" ? "Patient demo" : "Caregiver demo",
    })
    .click();
  await page.getByRole("button", { name: "Enter your space" }).click();
  await expect(page.locator(".readonly")).toHaveCount(0);
};
const nav = async (name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
try {
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Username", { exact: true }).fill("wrong");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Enter your space" }).click();
  await expect(page.getByRole("alert")).toContainText("do not match");
  check("Invalid credentials show an inline error");
  await login("patient");
  await page
    .locator("textarea")
    .fill("My energy was 2 out of 5. I enjoyed sitting in the garden.");
  await page
    .locator("#field-energy")
    .getByRole("button", { name: "2", exact: true })
    .click();
  await page
    .locator("#field-dizziness")
    .getByRole("button", { name: "Yes", exact: true })
    .click();
  await page
    .locator("#field-dizzinessSeverity")
    .getByRole("button", { name: "Mild", exact: true })
    .click();
  await page.getByRole("button", { name: "Review & save check-in" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const before = (await source()).days.length;
  await page.getByRole("button", { name: "Confirm & save check-in" }).click();
  expect((await source()).days.length).toBe(before + 1);
  const saved = (await source()).days.at(-1);
  expect(saved.answers).toMatchObject({
    energy: 2,
    dizziness: true,
    dizzinessSeverity: 1,
    confusion: null,
    sleep: null,
  });
  check(
    "Patient can review and confirm a partial check-in; unknown answers stay null",
  );
  await page.reload();
  await nav("My history");
  expect((await source()).days).toHaveLength(26);
  await expect(page.locator(".history-day")).toHaveCount(25);
  check("Confirmed check-in survives a reload");
  await page.getByRole("button", { name: "Correct entry" }).first().click();
  await page
    .locator("#field-energy")
    .getByRole("button", { name: "3", exact: true })
    .click();
  await page.getByRole("button", { name: "Review & save check-in" }).click();
  await page.getByRole("button", { name: "Confirm & save check-in" }).click();
  const corrected = await source();
  expect(corrected.days.length).toBe(26);
  expect(corrected.revisions).toHaveLength(1);
  expect(corrected.days.at(-1).recordRevision).toBe(2);
  check("Corrections preserve one current day and the previous version");
  await nav("My medicines");
  await expect(
    page.getByRole("button", { name: "Add to the list" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit record" })).toHaveCount(
    0,
  );
  check("Patient medication view has no edit controls");
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:5173");
  await second.getByRole("button", { name: "Caregiver demo" }).click();
  await second.getByRole("button", { name: "Enter your space" }).click();
  await expect(second.locator(".readonly")).toBeVisible();
  await second.close();
  check("A second tab is read-only while the writer tab is active");
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await login("caregiver");
  await nav("Medication list");
  await page.getByRole("button", { name: "Add to the list" }).click();
  await page
    .getByLabel("Medicine name", { exact: true })
    .fill("Fictional medicine");
  await page.getByLabel("Recorded dose", { exact: true }).fill("5 mg");
  await page
    .getByLabel("Recorded schedule", { exact: true })
    .fill("Recorded once daily");
  await page.getByRole("button", { name: "Save medication record" }).click();
  expect((await source()).medications).toHaveLength(4);
  await page
    .locator(".medication")
    .filter({ hasText: "Fictional medicine" })
    .getByRole("button", { name: "Edit record" })
    .click();
  await page.getByLabel("Recorded dose", { exact: true }).fill("6 mg");
  await page.getByRole("button", { name: "Save medication record" }).click();
  expect((await source()).medications.at(-1).dose).toBe("6 mg");
  expect((await source()).medicationEvents.at(-1).kind).toBe(
    "record_corrected",
  );
  check("Medication creation and correction persist with separate event types");
  await page
    .getByRole("button", { name: "Delete Fictional medicine record" })
    .click();
  await page
    .getByRole("button", { name: "Delete this record", exact: true })
    .click();
  expect((await source()).medications).toHaveLength(3);
  check("Deleting a medication also removes its date markers");
  await nav("Daily records");
  const patientBefore = JSON.stringify((await source()).days);
  await page.getByRole("button", { name: "Add an observer note" }).click();
  await page
    .getByLabel("What did you observe?")
    .fill("Fictional demo concern: please discuss the garden note.");
  await page.getByLabel("Include this note in the visit brief").check();
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  expect(JSON.stringify((await source()).days)).toBe(patientBefore);
  check("Pinned caregiver notes do not change patient answers or denominators");
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await page.locator(".facts-strip>button").nth(1).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Each date contributes at most one current answer.",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  check("Fact evidence drawer opens for the selected date range");
  await nav("Visit brief");
  await page.getByRole("button", { name: "Use a simple template" }).click();
  await expect(page.locator(".report-page")).toContainText(
    "Fictional demo concern",
  );
  await expect(
    page.getByRole("button", { name: "Print / save as PDF" }),
  ).toBeDisabled();
  await page.getByLabel("I reviewed the facts and wording.").check();
  await expect(
    page.getByRole("button", { name: "Print / save as PDF" }),
  ).toBeEnabled();
  await page
    .getByLabel("Edit discussion question 1")
    .fill("What additional details would help explain these records?");
  await expect(
    page.getByRole("button", { name: "Print / save as PDF" }),
  ).toBeDisabled();
  check(
    "Visit brief preserves pinned concerns and requires fresh review after an edit",
  );
  await page.getByLabel("I reviewed the facts and wording.").check();
  await page.screenshot({
    path: "test-results/visit-brief-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/visit-brief-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Need help now", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No one is monitoring this app",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  check("Mobile layout fits the viewport and emergency help remains available");
  await page.getByRole("button", { name: "Help and settings" }).click();
  await page
    .getByRole("button", { name: "Clear all records", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear these records", exact: true })
    .click();
  expect((await source()).days).toHaveLength(0);
  await page.reload();
  expect((await source()).days).toHaveLength(0);
  check("Intentional empty state survives reload without reseeding");
  await page.getByRole("button", { name: "Help and settings" }).click();
  await page
    .getByRole("button", { name: "Reset fictional demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset the demo", exact: true })
    .click();
  expect((await source()).days).toHaveLength(25);
  check("Reset restores a fresh fictional dataset");
  await page.evaluate(() =>
    localStorage.setItem("medwatch.demo.source", "{broken"),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your saved record needs attention." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("medwatch.demo.source")),
  ).toBe("{broken");
  check("Corrupt source triggers recovery without overwriting the saved value");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  check("No page errors or third-party runtime requests during tested flows");
} catch (e) {
  await page.screenshot({
    path: "test-results/browser-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  writeFileSync(
    "test-results/browser.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks, errors, external },
      null,
      2,
    ),
  );
  await browser.close();
}
