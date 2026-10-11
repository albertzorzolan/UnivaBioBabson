// End-to-end browser test for Kinwise (SPEC §9 "Playwright E2E"). npm run test:e2e
//
// Starts its own Vite dev server (or uses BASE_URL), drives system Chrome headless, prints a PASS/FAIL table,
// saves screenshots to test-results/e2e/, and exits non-zero if any check fails. Every check runs in a fresh
// browser context, so each one starts from the seeded demo record.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  STORE_KEY,
  SESSION_KEY,
  expect,
  go,
  instrument,
  launchBrowser,
  newContext,
  newSink,
  outDir,
  printTable,
  selectedChecks,
  settle,
  startServer,
} from "./browser-harness.mjs";

const SHOTS = outDir("e2e");
const ALL_ROUTES = {
  public: ["/", "/how-it-works"],
  patient: ["/p/today", "/p/week", "/p/meds"],
  caregiver: ["/c/overview", "/c/meds", "/c/review", "/c/timeline", "/c/ask", "/c/brief", "/c/settings"],
};

/** Read the persisted record from localStorage. */
async function readStore(page) {
  return page.evaluate((k) => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? "null");
    } catch {
      return null;
    }
  }, STORE_KEY);
}

async function localToday(page) {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

async function switchRole(page, base, role, route) {
  // A fresh document load re-reads the session (a hash change alone would hit the role guard first).
  await page.evaluate(([k, r]) => sessionStorage.setItem(k, r), [SESSION_KEY, role]);
  await page.goto("about:blank");
  await page.goto(`${base}#${route}`);
  await settle(page);
  const hash = new URL(page.url()).hash;
  expect(hash.startsWith(`#${route}`), `switching to ${role} landed on ${hash}`);
}

async function shot(page, name) {
  const file = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

// ---------------------------------------------------------------------------------------------------------------
// Checks. Each returns a short detail string on success and throws on failure.

const CHECKS = [
  {
    id: "login-oneclick-patient",
    title: "Welcome › Try as Margaret opens the patient Today screen",
    async run({ open, base }) {
      const { page } = await open();
      await go(page, base, "/");
      await page.getByRole("button", { name: /Try as Margaret/ }).click();
      await page.waitForURL(/#\/p\/today/);
      await settle(page);
      const h1 = (await page.locator("h1").first().innerText()).trim();
      expect(/day been/i.test(h1), `h1 was "${h1}"`);
      const role = await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY);
      expect(role === "patient", `session role = ${role}`);
      await shot(page, "login-patient-today");
      return `#/p/today · h1 "${h1}"`;
    },
  },
  {
    id: "login-oneclick-caregiver",
    title: "Welcome › Try as Alex opens the caregiver Overview",
    async run({ open, base }) {
      const { page } = await open();
      await go(page, base, "/");
      await page.getByRole("button", { name: /Try as Alex/ }).click();
      await page.waitForURL(/#\/c\/overview/);
      await settle(page);
      const h1 = (await page.locator("h1").first().innerText()).trim();
      expect(/glance/i.test(h1), `h1 was "${h1}"`);
      await shot(page, "login-caregiver-overview");
      return `#/c/overview · h1 "${h1}"`;
    },
  },
  {
    id: "login-credentials",
    title: "Sign in with babson/babson and babson1/babson1",
    async run({ open, base }) {
      const out = [];
      for (const [u, p, want] of [
        ["babson", "babson", /#\/p\/today/],
        ["babson1", "babson1", /#\/c\/overview/],
      ]) {
        const { page } = await open();
        await go(page, base, "/");
        await page.getByLabel("Username").fill(u);
        await page.getByLabel("Password").fill(p);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.waitForURL(want, { timeout: 8000 });
        await settle(page);
        out.push(`${u} → ${new URL(page.url()).hash}`);
      }
      return out.join(" · ");
    },
  },
  {
    id: "login-wrong-password",
    title: "Wrong password shows an error and does not sign in",
    async run({ open, base }) {
      const { page } = await open();
      await go(page, base, "/");
      await page.getByLabel("Username").fill("babson1");
      await page.getByLabel("Password").fill("wrong-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const err = page.getByText(/don.t match a demo account/i);
      await err.waitFor({ timeout: 5000 });
      const role = await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY);
      expect(role === null, `session role became ${role}`);
      const hash = new URL(page.url()).hash;
      expect(hash === "" || hash === "#/" || hash.startsWith("#/?"), `navigated to ${hash}`);
      // Guard: a caregiver URL without a session must not render caregiver data.
      await page.goto(`${base}#/c/overview`);
      await settle(page);
      const h1 = (await page.locator("h1").first().innerText()).trim();
      expect(!/glance/i.test(h1), "caregiver overview rendered without a session");
      await shot(page, "login-wrong-password");
      return `error shown, no session; signed-out #/c/overview → "${h1.slice(0, 40)}…"`;
    },
  },
  {
    id: "patient-nlp-checkin",
    title: "Patient story → proposals → accept → save → My week + caregiver timeline/day table",
    async run({ open, base }) {
      const { page } = await open("patient");
      await go(page, base, "/p/today");
      const today = await localToday(page);
      const story =
        "Felt woozy getting up this morning and nearly went over in the kitchen, caught myself on the counter. " +
        "Slept badly. My granddaughter Sofia fell off her bike, poor thing. No ankle swelling. E2E-marmalade.";
      await page.getByRole("textbox", { name: /Tell me about/ }).fill(story);
      await page.getByRole("button", { name: "Fill in my check-in" }).click();
      const proposals = page.getByRole("list", { name: "Answers I found" }).getByRole("listitem");
      await proposals.first().waitFor({ timeout: 8000 });
      const nProps = await proposals.count();
      expect(nProps >= 3, `only ${nProps} proposals`);
      const heard = await page.locator("#pt-heard-title").locator("xpath=ancestor::section[1]").innerText();
      expect(/someone else/i.test(heard), "Sofia's fall was not listed as about someone else");
      // Accept every explicit suggestion that is still waiting.
      let accepted = 0;
      for (let i = 0; i < 12; i++) {
        const btn = page.getByRole("button", { name: /^Yes, that.s right/ }).first();
        if (!(await btn.count())) break;
        await btn.click();
        accepted++;
      }
      // Conflicts / inferred: answer "Yes" where offered so nothing blocks saving.
      await shot(page, "checkin-heard");
      await page.getByRole("button", { name: /Save today.s check-in/ }).click();
      const dialog = page.getByRole("dialog", { name: "Is this right?" });
      await dialog.waitFor({ timeout: 5000 });
      const confirmText = await dialog.innerText();
      expect(/Dizz/i.test(confirmText), "confirmation does not list dizziness");
      await shot(page, "checkin-confirm");
      await dialog.getByRole("button", { name: /Yes, save/ }).click();
      await page.locator("#pt-saved-title").waitFor({ timeout: 5000 });
      const store = await readStore(page);
      const saved = store?.checkIns?.find((c) => c.date === today);
      expect(saved, `no check-in stored for ${today}`);
      expect(saved.story.includes("E2E-marmalade"), "stored story differs from what was typed");
      expect(saved.answers.dizziness === true, `stored dizziness = ${saved.answers.dizziness}`);
      expect(saved.answers.nearFall === true, `stored nearFall = ${saved.answers.nearFall}`);
      expect(saved.answers.fall !== true, "Sofia's fall was stored as Margaret's fall");
      await shot(page, "checkin-saved");

      // My week shows today as entered ("Change" instead of "Add").
      await go(page, base, "/p/week");
      const weekText = await page.locator("#main-content").innerText();
      const changeToday = page.getByRole("button", { name: /^Change .*/ }).first();
      expect(await changeToday.count(), "no Change button in My week");
      expect(!(await page.getByRole("button", { name: /^Add .*/ }).count()), "My week still offers to Add today");
      expect(weekText.includes("E2E-marmalade"), "My week does not show today's words");
      await shot(page, "checkin-myweek");

      // Caregiver timeline: chart day button no longer says "no check-in"; day table lists the story.
      await switchRole(page, base, "caregiver", "/c/timeline");
      const tl = await page.locator("#main-content").innerText();
      // Day table ("Every check-in", newest first): today's row carries her words (excerpt) and the dizziness answer.
      const d0 = new Date(`${today}T12:00:00`);
      const rowLabel = d0.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const ti = tl.indexOf("Every check-in");
      const rowAt = tl.indexOf(rowLabel, ti);
      const row = rowAt >= 0 ? tl.slice(rowAt, rowAt + 400) : "";
      expect(ti >= 0 && rowAt >= 0, `no "${rowLabel}" row in the caregiver day table`);
      expect(row.includes(story.slice(0, 40)), `today's row lacks her words: "${row.slice(0, 160)}"`);
      expect(/Dizzy/.test(row.split("\n“")[0]), `today's row does not record dizziness: "${row.slice(0, 120)}"`);
      const todayCell = await page
        .locator("#main-content button[aria-label]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter((l) => /no check-in/.test(l ?? "")));
      const d = new Date(`${today}T12:00:00`);
      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      expect(!todayCell.some((l) => l.startsWith(label)), `chart still says "${label}: no check-in"`);
      await shot(page, "checkin-caregiver-timeline");
      return `${nProps} proposals, ${accepted} accepted; saved ${today}; visible in My week + caregiver timeline`;
    },
  },
  {
    id: "med-add-brand-fuzzy-unknown",
    title: "Add medication: Ativan → lorazepam, fuzzy confirm, unknown name saved but not reviewed",
    async run({ open, base }) {
      const { page } = await open("caregiver");
      await go(page, base, "/c/meds");
      const before = (await readStore(page))?.medications?.length ?? 0;
      const drawerFor = async () => {
        await page.getByRole("button", { name: "Add medication" }).first().click();
        const d = page.getByRole("dialog", { name: /Add a medicine/ });
        await d.waitFor();
        return d;
      };
      const out = [];

      // 1. Brand name → generic
      let d = await drawerFor();
      const name = d.getByRole("combobox", { name: "Medicine name" });
      await name.fill("Ativan");
      const brand = d.locator(".cg-match__title").first();
      await brand.waitFor();
      const brandText = (await brand.innerText()).trim();
      expect(/Matched:.*lorazepam/i.test(brandText), `Ativan match said "${brandText}"`);
      const dup = await d.locator(".cg-med-form__dup").count();
      out.push(`Ativan → "${brandText}"${dup ? " (+duplicate warning)" : ""}`);
      await shot(page, "med-ativan");
      await d.getByRole("button", { name: "Cancel" }).click();
      await d.waitFor({ state: "hidden" });

      // 2. Misspelling → "Did you mean …?" → confirm → save
      d = await drawerFor();
      await d.getByRole("combobox", { name: "Medicine name" }).fill("Gabapentn");
      await d.locator(".cg-match__title", { hasText: /Did you mean gabapentin/i }).waitFor({ timeout: 5000 });
      await d.getByRole("button", { name: /Yes, it.s gabapentin/i }).click();
      const conf = (await d.locator(".cg-match__title").first().innerText()).trim();
      expect(/Matched:.*gabapentin/i.test(conf), `after confirm: "${conf}"`);
      await shot(page, "med-fuzzy-confirmed");
      await d.getByRole("button", { name: "Save medication" }).click();
      await d.waitFor({ state: "hidden", timeout: 5000 });
      let s = await readStore(page);
      const gaba = s.medications.find((m) => /gabapent/i.test(m.name));
      expect(gaba, "gabapentin not saved");
      expect(gaba.match === "fuzzy_confirmed" && gaba.ingredientIds.length > 0, `gabapentin stored as match=${gaba.match} ids=${gaba.ingredientIds}`);
      out.push(`Gabapentn → confirmed (${gaba.ingredientIds.join("+")})`);

      // 3. Unknown name → saved, not reviewed
      d = await drawerFor();
      await d.getByRole("combobox", { name: "Medicine name" }).fill("Zorblaxin");
      await d.locator(".cg-match__title", { hasText: /Not in Kinwise.s reference list/ }).waitFor({ timeout: 5000 });
      await d.getByRole("button", { name: "Save medication" }).click();
      await d.waitFor({ state: "hidden", timeout: 5000 });
      s = await readStore(page);
      expect(s.medications.length === before + 2, `medications ${before} → ${s.medications.length}, expected +2`);
      const listText = await page.locator("#main-content").innerText();
      expect(/Zorblaxin/.test(listText) && /Gabapentn/i.test(listText), "new medicines not shown in the list");
      await go(page, base, "/c/review");
      const rv = await page.locator("#main-content").innerText();
      expect(/Zorblaxin/.test(rv), "review page does not mention the unreviewed medicine");
      await shot(page, "med-review-not-reviewed");
      out.push("Zorblaxin → not in list, saved, shown as not reviewed");
      return out.join("\n");
    },
  },
  {
    id: "review-finding-citation",
    title: "Medication review shows a finding with a source citation and a question",
    async run({ open, base }) {
      const { page } = await open("caregiver");
      await go(page, base, "/c/review");
      const card = page.locator('[data-tour="review-finding"]').first();
      await card.waitFor();
      const title = (await card.locator("h3").first().innerText()).trim();
      await card.getByRole("button", { name: "Why this matters" }).click();
      const links = await card.locator('a[href^="http"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      expect(links.length > 0, "no http citation link inside the finding");
      const q = (await card.locator(".cg-finding__question-text").innerText()).trim();
      expect(q.endsWith("?"), `question does not end with "?": "${q}"`);
      await shot(page, "review-finding");
      return `"${title.slice(0, 60)}…" · ${links.length} citation link(s) · question ends with "?"`;
    },
  },
  {
    id: "review-decision-persists",
    title: "Review decision (To discuss) survives a reload",
    async run({ open, base }) {
      const { page } = await open("caregiver");
      await go(page, base, "/c/review");
      const card = page.locator('[data-tour="review-finding"]').first();
      const radio = card.getByRole("radio", { name: "To discuss" });
      await radio.click();
      expect((await radio.getAttribute("aria-checked")) === "true", "radio not checked after click");
      const key = await card.evaluate((el) => el.querySelector("input[id^=note-]")?.id?.replace(/^note-/, "") ?? null);
      await page.reload();
      await settle(page);
      const card2 = page.locator('[data-tour="review-finding"]').first();
      const state = await card2.getByRole("radio", { name: "To discuss" }).getAttribute("aria-checked");
      expect(state === "true", `after reload aria-checked=${state}`);
      const s = await readStore(page);
      const dec = s.reviewDecisions.find((d) => d.status === "to_discuss");
      expect(dec, "no to_discuss decision in store");
      return `decision ${dec.findingKey}${key && key !== dec.findingKey ? ` (card key ${key})` : ""} persisted`;
    },
  },
  {
    id: "timeline-signal",
    title: "Timeline before/after card shows counts with denominators",
    async run({ open, base }) {
      const { page } = await open("caregiver");
      await go(page, base, "/c/timeline");
      const card = page.locator('[data-tour="timeline-compare"]');
      await card.waitFor();
      const t = await card.innerText();
      expect(/Lorazepam/i.test(t), "comparison is not about lorazepam");
      const ratios = t.match(/\b\d+\s+of\s+\d+\b/g) ?? [];
      expect(ratios.length >= 2, `found ${ratios.length} "N of M" counts`);
      expect(/caus/i.test(t) === false || /not what caused/i.test(t), "card uses 'caused' outside the caveat");
      await shot(page, "timeline-compare");
      return `${ratios.length} "N of M" counts, e.g. ${ratios.slice(0, 3).join(", ")}`;
    },
  },
  {
    id: "ask-flow",
    title: "Ask: suggested question answered from records; out-of-scope redirect; add to visit questions",
    async run({ open, base }) {
      const { page } = await open("caregiver");
      await go(page, base, "/c/ask");
      await page.getByRole("button", { name: "How many near-falls since lorazepam started?" }).click();
      const ans = page.locator(".cg-ask-a").last();
      await ans.waitFor({ timeout: 8000 });
      const at = await ans.innerText();
      expect(/From the records/i.test(at), "answer not labelled 'From the records'");
      expect(/\d/.test(at), "answer has no numbers");
      const out = [`near-falls → "${at.replace(/\s+/g, " ").slice(18, 110)}…"`];
      const box = page.getByRole("textbox", { name: /Ask/ });
      const q = "Should she stop taking the lorazepam?";
      await box.fill(q);
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      const red = page.locator(".cg-ask-a--redirect").last();
      await red.waitFor({ timeout: 8000 });
      await red.getByRole("button", { name: "Add to visit questions" }).click();
      await red.getByText("Added to visit questions").waitFor({ timeout: 3000 });
      const s = await readStore(page);
      expect(s.savedQuestions.some((x) => /lorazepam/i.test(x.text)), "redirected question not in savedQuestions");
      await go(page, base, "/c/brief");
      const builder = await page.locator("#main-content").innerText();
      expect(builder.includes(q), "saved question does not appear on the visit brief");
      await shot(page, "ask-redirect");
      out.push("out-of-scope → redirect card → saved to visit questions");
      return out.join("\n");
    },
  },
  {
    id: "brief-template-print",
    title: "Brief: template generation, review checkbox gates print, print shows only the brief",
    async run({ open, base }) {
      const { page } = await open("caregiver", {
        extraInit: () => {
          window.__printCalls = 0;
          window.print = () => {
            window.__printCalls++;
          };
        },
      });
      await go(page, base, "/c/brief");
      await page.getByRole("button", { name: "Use the standard template" }).click();
      const doc = page.locator('[data-tour="brief-doc"]');
      await doc.waitFor();
      const dt = await doc.innerText();
      for (const h of ["WHY WE", "WHAT WE", "MEDICATION REVIEW", "OUR QUESTIONS", "CURRENT MEDICATION LIST"]) {
        expect(dt.toUpperCase().includes(h), `brief has no "${h}" section`);
      }
      const review = page.getByRole("checkbox", { name: /reviewed this brief/i });
      if (await review.isChecked()) await review.uncheck();
      // Unreviewed: Print must not open the print dialog.
      await page.getByRole("button", { name: "Print / Save as PDF" }).click();
      await page.waitForTimeout(300);
      expect((await page.evaluate(() => window.__printCalls)) === 0, "print() was called for an unreviewed brief");
      // Unreviewed print media shows the notice only.
      await page.emulateMedia({ media: "print" });
      const unrev = await printVisibleText(page);
      expect(/(not|n.t) (been )?reviewed/i.test(unrev) && !/OUR QUESTIONS/i.test(unrev), `unreviewed print output: "${unrev.slice(0, 120)}"`);
      await page.emulateMedia({ media: "screen" });

      await review.check();
      await page.getByRole("button", { name: "Print / Save as PDF" }).click();
      await page.waitForTimeout(200);
      expect((await page.evaluate(() => window.__printCalls)) === 1, "print() not called after review");
      await page.emulateMedia({ media: "print" });
      const vis = await page.evaluate(() => {
        const shown = [...document.body.children].filter((el) => getComputedStyle(el).display !== "none");
        return shown.map((el) => el.className || el.id || el.tagName);
      });
      expect(vis.length === 1 && String(vis[0]).includes("cg-vb-print-root"), `visible in print: ${JSON.stringify(vis)}`);
      const printed = await printVisibleText(page);
      expect(/Margaret Rivera/.test(printed) && /OUR QUESTIONS/i.test(printed), "print root does not contain the brief");
      expect(!/Use the standard template|Download FHIR JSON/.test(printed), "builder controls leak into print");
      await page.screenshot({ path: join(SHOTS, "brief-print-emulated.png"), fullPage: true });
      const pdf = await page.pdf({ format: "Letter", preferCSSPageSize: true });
      writeFileSync(join(SHOTS, "brief.pdf"), pdf);
      const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      await page.emulateMedia({ media: "screen" });
      await shot(page, "brief-screen");
      return `template OK; print gated until reviewed; print media shows only the brief; PDF ${pages} page(s)`;
    },
  },
  {
    id: "fhir-export",
    title: "FHIR export downloads a valid Bundle whose references resolve",
    async run({ open, base }) {
      const { page } = await open("caregiver");
      await go(page, base, "/c/brief");
      const panel = page.locator('[data-tour="brief-fhir"]');
      await panel.waitFor();
      const indicator = (await panel.innerText()).match(/Valid FHIR R4 Bundle · (\d+) resources/);
      expect(indicator, `no validity indicator in panel: "${(await panel.innerText()).slice(0, 200)}"`);
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), panel.getByRole("button", { name: "Download FHIR JSON" }).click()]);
      const file = join(SHOTS, dl.suggestedFilename() || "bundle.json");
      await dl.saveAs(file);
      const bundle = JSON.parse(readFileSync(file, "utf8"));
      expect(bundle.resourceType === "Bundle", `resourceType = ${bundle.resourceType}`);
      const entries = bundle.entry ?? [];
      expect(entries.length > 5, `only ${entries.length} entries`);
      expect(entries.length === Number(indicator[1]), `indicator says ${indicator[1]} but file has ${entries.length}`);
      const known = new Set();
      for (const e of entries) {
        if (e.fullUrl) known.add(e.fullUrl);
        if (e.resource?.id) known.add(`${e.resource.resourceType}/${e.resource.id}`);
      }
      const refs = [];
      // Reference.reference strings only (DetectedIssue.reference at the resource root is a uri, not a Reference).
      const walk = (v) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            if (k === "reference" && typeof x === "string" && !("resourceType" in v)) refs.push(x);
            else walk(x);
          }
        }
      };
      walk(entries);
      const dangling = refs.filter((r) => !known.has(r) && !r.startsWith("#"));
      expect(dangling.length === 0, `${dangling.length} unresolved references, e.g. ${dangling.slice(0, 3).join(", ")}`);
      const types = {};
      entries.forEach((e) => (types[e.resource?.resourceType] = (types[e.resource?.resourceType] ?? 0) + 1));
      return `${dl.suggestedFilename()} · ${entries.length} entries · ${refs.length} refs all resolve · ${Object.entries(types)
        .map(([k, n]) => `${k}×${n}`)
        .join(" ")}`;
    },
  },
  {
    id: "how-it-works-eval",
    title: "How it works: live NLP benchmark F1 + medication suite pass counts",
    async run({ open, base }) {
      const { page } = await open();
      await go(page, base, "/how-it-works");
      await page.getByRole("button", { name: "Run the extraction benchmark now" }).click();
      await page.getByText(/micro-F1 over/).first().waitFor({ timeout: 60000 });
      const f1 = await page.locator(".pub-how-score").evaluateAll((els) =>
        els.map((e) => `${e.querySelector(".pub-how-score__title")?.textContent?.trim()}: F1 ${e.querySelector(".pub-how-score__big")?.textContent?.trim()}`),
      );
      expect(f1.length >= 1 && f1.every((s) => /\d/.test(s)), `F1 cards: ${JSON.stringify(f1)}`);
      await page.getByRole("button", { name: "Run the medication-review suite" }).click();
      const tile = page.locator(".pub-how-tile", { hasText: "Cases fully passed" });
      await tile.waitFor({ timeout: 60000 });
      const t = (await tile.locator("dd").innerText()).replace(/\s+/g, " ").trim();
      const m = t.match(/(\d+) of (\d+)/);
      expect(m, `tile text "${t}"`);
      await shot(page, "how-eval");
      expect(m[1] === m[2], `medication suite: ${m[1]} of ${m[2]} cases fully passed`);
      return `${f1.join(" · ")} · med suite ${m[1]}/${m[2]} cases`;
    },
  },
  {
    id: "guided-tour",
    title: "Guided tour runs all 8 steps without errors",
    async run({ open, base, sink }) {
      const { page } = await open();
      const errBefore = sink.consoleErrors.length;
      await go(page, base, "/");
      await page.getByRole("button", { name: /guided tour/i }).click();
      const seen = [];
      for (let i = 1; i <= 8; i++) {
        const card = page.locator(".tour-card");
        await card.getByText(`Step ${i} of 8`).waitFor({ timeout: 10000 });
        await settle(page);
        await page.waitForTimeout(400);
        const title = (await card.locator(".tour-card__title").innerText()).trim();
        const hash = new URL(page.url()).hash.split("?")[0];
        const spot = await page.locator(".tour-spot").count();
        seen.push(`${i}:${hash}${spot ? "*" : ""}`);
        await page.screenshot({ path: join(SHOTS, `tour-step-${i}.png`) });
        if (i === 2) {
          // The patient check-in step auto-reads an example story.
          await page.locator('[data-tour="checkin-heard"]').waitFor({ timeout: 8000 }).catch(() => {
            throw new Error("tour step 2 did not show the extraction ('checkin-heard')");
          });
        }
        expect(title.length > 0, `step ${i} has no title`);
        await card.getByRole("button", { name: i === 8 ? /Finish tour/ : /^Next/ }).click();
      }
      await page.locator(".tour-card").waitFor({ state: "detached", timeout: 5000 });
      const errs = sink.consoleErrors.slice(errBefore);
      expect(errs.length === 0, `console errors during tour: ${errs.map((e) => e.text).join(" | ").slice(0, 300)}`);
      return seen.join(" ");
    },
  },
  {
    id: "settings-reset-demo",
    title: "Settings › Restore demo resets changes",
    async run({ open, base }) {
      const { page } = await open("caregiver");
      await go(page, base, "/c/review");
      const seed = await readStore(page);
      await page.locator('[data-tour="review-finding"]').first().getByRole("radio", { name: "Discussed" }).click();
      await page.locator('[data-tour="review-finding"]').first().getByRole("button", { name: "Add to visit questions" }).click();
      const dirty = await readStore(page);
      expect(dirty.reviewDecisions.length > seed.reviewDecisions.length, "setup: decision was not stored");
      await go(page, base, "/c/settings");
      await page.getByRole("button", { name: "Restore demo" }).click();
      const dlg = page.getByRole("alertdialog").or(page.getByRole("dialog")).first();
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Restore demo record" }).click();
      await page.waitForTimeout(400);
      const after = await readStore(page);
      expect(after.reviewDecisions.length === seed.reviewDecisions.length, `decisions ${after.reviewDecisions.length} vs seed ${seed.reviewDecisions.length}`);
      expect(after.savedQuestions.length === seed.savedQuestions.length, `saved questions ${after.savedQuestions.length} vs seed ${seed.savedQuestions.length}`);
      expect(after.checkIns.length === seed.checkIns.length && after.medications.length === seed.medications.length, "check-ins/meds differ from seed");
      await shot(page, "settings-restored");
      return `decisions ${dirty.reviewDecisions.length}→${after.reviewDecisions.length}, questions ${dirty.savedQuestions.length}→${after.savedQuestions.length}`;
    },
  },
  {
    id: "routes-no-console-errors",
    title: "Every route, both roles: renders an h1 with no console errors",
    async run({ open, base, sink }) {
      const problems = [];
      let visited = 0;
      for (const [role, routes] of [
        [null, ALL_ROUTES.public],
        ["patient", [...ALL_ROUTES.public, ...ALL_ROUTES.patient]],
        ["caregiver", [...ALL_ROUTES.public, ...ALL_ROUTES.caregiver]],
      ]) {
        const { page } = await open(role);
        for (const r of routes) {
          const before = sink.consoleErrors.length;
          await go(page, base, r);
          await page.waitForTimeout(300);
          visited++;
          const h1 = await page.locator("h1").count();
          if (!h1) problems.push(`${role ?? "public"} ${r}: no h1`);
          const errs = sink.consoleErrors.slice(before);
          if (errs.length) problems.push(`${role ?? "public"} ${r}: ${errs.map((e) => e.text.slice(0, 160)).join(" | ")}`);
          await page.screenshot({ path: join(SHOTS, `route-${role ?? "public"}-${r.replace(/\W+/g, "_") || "home"}.png`) });
        }
      }
      expect(problems.length === 0, problems.join("\n"));
      return `${visited} route visits clean`;
    },
  },
  {
    id: "language-rules",
    title: "SPEC §3 wording: no 'caused', 'safe', 'dangerous', 'urgent', 'stop taking', 'diagnosis', 'risk score' outside allowed contexts",
    async run({ open, base }) {
      const RX = /[^.\n]{0,80}\b(caus(?:ed|ing)|safe|unsafe|dangerous|urgent(?:ly)?|should stop|stop taking|diagnos(?:is|e|ed)|risk score)\b[^.\n]{0,60}/gi;
      // Allowed: negated caveats the SPEC requires, the 911 line, quoted place names ("urgent care"), and meta-copy
      // that names a rule ("we never give stop instructions").
      const ALLOW = [
        /not what caused/i,
        /doesn.t say a medicine caused/i,
        /does not show cause/i,
        /urgent care/i,
        /not mean a medicine is safe/i,
        /is safe get a kind redirect/i,
        /Questions about diagnosis/i,
        /cause-and-effect claims/i,
        /drug-safety judg/i,
      ];
      const problems = [];
      const scan = async (page, where) => {
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
        const t = await page.evaluate(() => document.body.innerText);
        for (const m of t.matchAll(RX)) {
          const hit = m[0].trim();
          if (!ALLOW.some((a) => a.test(hit))) problems.push(`${where}: "…${hit}…"`);
        }
      };
      for (const [role, routes] of [
        [null, ALL_ROUTES.public],
        ["patient", ALL_ROUTES.patient],
        ["caregiver", ALL_ROUTES.caregiver],
      ]) {
        const { page } = await open(role);
        for (const r of routes) {
          await go(page, base, r);
          await scan(page, r);
        }
        if (role === "patient") {
          await go(page, base, "/p/today");
          await page.getByRole("button", { name: "A wobbly morning" }).click();
          await page.locator("#pt-heard-title").waitFor();
          await scan(page, "/p/today (heard)");
        }
        if (role === "caregiver") {
          await go(page, base, "/c/brief");
          await page.getByRole("button", { name: "Use the standard template" }).click();
          await scan(page, "/c/brief (template)");
          await go(page, base, "/c/ask");
          for (const q of ["When did the dizziness start?", "Which medicines are on the Beers list?", "What changed in the last two weeks?"]) {
            await page.getByRole("button", { name: q }).click();
            await page.waitForTimeout(150);
          }
          await scan(page, "/c/ask (answers)");
        }
      }
      expect(problems.length === 0, [...new Set(problems)].slice(0, 12).join("\n"));
      return "no forbidden wording on any route, brief, check-in reading or Ask answer";
    },
  },
  {
    id: "mobile-390-no-overflow",
    title: "390px wide: no horizontal page scroll on any route",
    async run({ open, base }) {
      const problems = [];
      for (const [role, routes] of [
        [null, ALL_ROUTES.public],
        ["patient", ALL_ROUTES.patient],
        ["caregiver", ALL_ROUTES.caregiver],
      ]) {
        const { page } = await open(role, { viewport: { width: 390, height: 844 } });
        for (const r of routes) {
          await go(page, base, r);
          const o = await page.evaluate(() => {
            const sw = document.documentElement.scrollWidth;
            const cw = document.documentElement.clientWidth;
            let worst = null;
            if (sw > cw + 1) {
              for (const el of document.querySelectorAll("body *")) {
                const rc = el.getBoundingClientRect();
                if (rc.right > cw + 1 && rc.width > 0 && getComputedStyle(el).position !== "fixed") {
                  if (!worst || rc.right > worst.right) worst = { right: Math.round(rc.right), sel: `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}` };
                }
              }
            }
            return { sw, cw, worst };
          });
          if (o.sw > o.cw + 1) problems.push(`${r}: scrollWidth ${o.sw} > ${o.cw}${o.worst ? ` (widest: ${o.worst.sel} → ${o.worst.right}px)` : ""}`);
          await page.screenshot({ path: join(SHOTS, `m390-${r.replace(/\W+/g, "_") || "home"}.png`), fullPage: true });
        }
      }
      expect(problems.length === 0, problems.join("\n"));
      return "all routes fit 390px";
    },
  },
];

/** Text of whatever is visible under print media. */
async function printVisibleText(page) {
  return page.evaluate(() => {
    const shown = [...document.body.children].filter((el) => getComputedStyle(el).display !== "none");
    return shown.map((el) => el.innerText).join("\n");
  });
}

// ---------------------------------------------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const server = await startServer();
  const browser = await launchBrowser();
  const sink = newSink();
  const results = [];
  const checks = selectedChecks(CHECKS);
  console.log(`Kinwise E2E · ${server.base} · system Chrome ${browser.version()} · ${checks.length} checks`);
  try {
    for (const c of checks) {
      const contexts = [];
      let lastPage = null;
      const open = async (role = null, opts = {}) => {
        const ctx = await newContext(browser, server.base, { role, ...opts });
        contexts.push(ctx);
        const page = instrument(await ctx.newPage(), server.base, sink);
        lastPage = page;
        return { ctx, page };
      };
      const start = Date.now();
      let r;
      try {
        const detail = await c.run({ open, base: server.base, sink });
        r = { id: c.id, title: c.title, ok: true, ms: Date.now() - start, detail };
      } catch (e) {
        const file = lastPage ? await shot(lastPage, `FAIL-${c.id}`) : null;
        r = { id: c.id, title: c.title, ok: false, ms: Date.now() - start, detail: `${String(e?.message ?? e).split("\n").slice(0, 8).join("\n")}${file ? `\nscreenshot: ${file}` : ""}` };
      }
      results.push(r);
      process.stdout.write(`${r.ok ? "PASS" : "FAIL"}  ${c.id}\n`);
      for (const ctx of contexts) await ctx.close().catch(() => {});
    }
    // Global gates, aggregated over every page every check opened.
    const foreign = [...new Set(sink.foreignRequests.map((r) => r.url))];
    results.push({
      id: "no-foreign-network",
      title: "No request to any origin other than the dev server",
      ok: foreign.length === 0,
      ms: 0,
      detail: foreign.length ? `${foreign.length} foreign URL(s):\n${foreign.slice(0, 10).join("\n")}` : "all requests same-origin",
    });
    const errs = sink.consoleErrors;
    results.push({
      id: "no-console-errors-overall",
      title: "No console errors or uncaught exceptions across all flows",
      ok: errs.length === 0,
      ms: 0,
      detail: errs.length
        ? `${errs.length} error(s):\n${[...new Set(errs.map((e) => `${new URL(e.url).hash || "/"}: ${e.text.slice(0, 200)}`))].slice(0, 8).join("\n")}`
        : `0 errors (${sink.consoleWarnings.length} warnings)`,
    });
  } finally {
    await browser.close().catch(() => {});
    await server.stop();
  }
  writeFileSync(join(SHOTS, "results.json"), JSON.stringify({ ranAt: new Date().toISOString(), results, warnings: sink.consoleWarnings.slice(0, 50) }, null, 2));
  const failed = printTable(`Kinwise E2E results (${((Date.now() - t0) / 1000).toFixed(0)}s) — screenshots in test-results/e2e/`, results);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
