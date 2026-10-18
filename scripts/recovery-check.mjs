// Browser check for the "saved data couldn't be read" recovery notice (src/app/layouts/RecoveryNotice.tsx).
//
//   node scripts/recovery-check.mjs          # standalone: starts its own Vite server (or uses BASE_URL)
//
// RECOVERY_CHECK has the same shape as the entries of CHECKS in scripts/browser-test.mjs, so that file can run it
// as part of npm run test:e2e with `import { RECOVERY_CHECK } from "./recovery-check.mjs"` and one CHECKS entry.
// Flow: break the stored record, reload, and expect (a) a copy under kinwise.v1.store.unreadable-<time>, (b) the
// notice in the patient shell and, after the in-app demo role switch, in the caregiver shell, (c) "Download the copy"
// to download the unreadable text, and (d) the notice gone after "Dismiss this message".
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  STORE_KEY,
  expect,
  go,
  instrument,
  launchBrowser,
  newContext,
  newSink,
  outDir,
  printTable,
  settle,
  startServer,
} from "./browser-harness.mjs";

const TITLE = "Saved data couldn’t be read, so the demo record was loaded.";
const UNREADABLE_PREFIX = `${STORE_KEY}.unreadable-`;

export const RECOVERY_CHECK = {
  id: "store-recovery-notice",
  title: "Unreadable saved record: copy kept, notice shown in both shells, copy downloadable, notice dismissible",
  async run({ open, base }) {
    const { page } = await open("patient");
    await go(page, base, "/p/today");
    await page.evaluate((k) => localStorage.setItem(k, "{not json"), STORE_KEY);
    await page.reload();
    await settle(page);

    // (a) The broken text was copied before the demo record replaced it.
    const copies = await page.evaluate((prefix) => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix)) out.push([k, localStorage.getItem(k)]);
      }
      return out;
    }, UNREADABLE_PREFIX);
    expect(copies.length === 1, `expected one ${UNREADABLE_PREFIX}* key, found ${copies.length}`);
    expect(copies[0][1] === "{not json", `the copy holds ${JSON.stringify(copies[0][1])}`);

    // (b) Patient shell shows the notice, and the app still works (the demo record loaded).
    const notice = page.getByText(TITLE);
    await notice.waitFor({ timeout: 8000 });
    expect(await page.getByText("A copy of the unreadable data was kept in this browser.").isVisible(), "no line about the copy");
    const h1 = (await page.locator("h1").first().innerText()).trim();
    expect(/day been/i.test(h1), `patient h1 was "${h1}"`);
    await page.screenshot({ path: join(outDir("e2e"), "recovery-patient.png") }).catch(() => {});

    // (c) The copy downloads as a file.
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.getByRole("button", { name: "Download the copy" }).click()]);
    const file = dl.suggestedFilename();
    expect(/^kinwise-unreadable-.+\.json$/.test(file), `download named "${file}"`);

    // In-app role switch (no reload, so the notice state carries over) → caregiver shell shows it too.
    await page.getByRole("button", { name: /^Demo: switch to .+ view$/ }).first().click();
    await page.waitForURL(/#\/c\/overview/, { timeout: 8000 });
    await settle(page);
    await notice.waitFor({ timeout: 8000 });
    await page.screenshot({ path: join(outDir("e2e"), "recovery-caregiver.png") }).catch(() => {});

    // (d) Dismiss hides it.
    await page.getByRole("button", { name: "Dismiss this message" }).click();
    await notice.waitFor({ state: "detached", timeout: 5000 });
    return `copy ${copies[0][0].slice(STORE_KEY.length + 1)} · download ${file} · shown in both shells · dismissed`;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Standalone runner (only when this file is executed directly, not when imported by browser-test.mjs).

async function main() {
  const server = await startServer();
  const browser = await launchBrowser();
  const sink = newSink();
  const contexts = [];
  const open = async (role = null, opts = {}) => {
    const ctx = await newContext(browser, server.base, { role, ...opts });
    contexts.push(ctx);
    return { ctx, page: instrument(await ctx.newPage(), server.base, sink) };
  };
  const results = [];
  const start = Date.now();
  try {
    const detail = await RECOVERY_CHECK.run({ open, base: server.base, sink });
    results.push({ id: RECOVERY_CHECK.id, title: RECOVERY_CHECK.title, ok: true, ms: Date.now() - start, detail });
  } catch (e) {
    results.push({ id: RECOVERY_CHECK.id, title: RECOVERY_CHECK.title, ok: false, ms: Date.now() - start, detail: String(e?.message ?? e) });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.stop();
  }
  const errs = sink.consoleErrors;
  results.push({
    id: "no-console-errors",
    title: "No console errors or uncaught exceptions",
    ok: errs.length === 0,
    ms: 0,
    detail: errs.length ? errs.map((e) => e.text.slice(0, 200)).join("\n") : "0 errors",
  });
  const failed = printTable("Kinwise recovery check", results);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
