// Accessibility gate for Kinwise (SPEC §9 "axe: no serious/critical violations"). npm run test:a11y
//
// Runs axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on every route for both roles, in light and dark themes, plus
// the states a judge actually sees: open drawers and dialogs, the patient's "Here's what I heard" panel, Ask
// answers, the brief evidence drawer, the guided tour card and the How-it-works results. Fails on any serious or
// critical violation; moderate/minor ones are listed but do not fail. Starts its own Vite dev server unless
// BASE_URL is set. Report: test-results/a11y/report.json, screenshots alongside.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilderModule from "@axe-core/playwright";
import { STORE_KEY, go, instrument, launchBrowser, newContext, newSink, outDir, printTable, selectedChecks, settle, startServer } from "./browser-harness.mjs";

const AxeBuilder = AxeBuilderModule.default ?? AxeBuilderModule;
const OUT = outDir("a11y");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const FAIL_IMPACTS = new Set(["serious", "critical"]);

const ROUTES = {
  public: ["/", "/how-it-works"],
  patient: ["/p/today", "/p/week", "/p/meds"],
  caregiver: ["/c/overview", "/c/meds", "/c/review", "/c/timeline", "/c/ask", "/c/brief", "/c/settings"],
};

/** Scenarios: { id, role, route, theme?, prepare?(page) } — prepare opens the drawer / state to scan. */
function scenarios() {
  const list = [];
  for (const theme of ["light", "dark"]) {
    for (const r of ROUTES.public) list.push({ id: `${theme}:public:${r}`, role: null, route: r, theme });
    for (const r of ROUTES.patient) list.push({ id: `${theme}:patient:${r}`, role: "patient", route: r, theme });
    for (const r of ROUTES.caregiver) list.push({ id: `${theme}:caregiver:${r}`, role: "caregiver", route: r, theme });
  }
  const states = [
    {
      id: "patient:/p/today+heard",
      role: "patient",
      route: "/p/today",
      prepare: async (page) => {
        await page.getByRole("button", { name: "A wobbly morning" }).click();
        await page.locator("#pt-heard-title").waitFor();
      },
    },
    {
      id: "patient:/p/today+confirm-dialog",
      role: "patient",
      route: "/p/today",
      prepare: async (page) => {
        await page.getByRole("button", { name: "A wobbly morning" }).click();
        await page.getByRole("button", { name: /Save today.s check-in/ }).click();
        await page.getByRole("dialog", { name: "Is this right?" }).waitFor();
      },
    },
    {
      id: "patient:/p/today+saved",
      role: "patient",
      route: "/p/today",
      prepare: async (page) => {
        await page.getByRole("button", { name: "A wobbly morning" }).click();
        await page.getByRole("button", { name: /Save today.s check-in/ }).click();
        await page.getByRole("dialog", { name: "Is this right?" }).getByRole("button", { name: /Yes, save/ }).click();
        await page.locator("#pt-saved-title").waitFor();
      },
    },
    {
      id: "caregiver:/c/overview+records-drawer",
      role: "caregiver",
      route: "/c/overview",
      prepare: async (page) => {
        await page.getByRole("button", { name: "Show the records" }).first().click();
        await page.getByRole("dialog").first().waitFor();
      },
    },
    {
      id: "caregiver:/c/overview+chart-day-drawer",
      role: "caregiver",
      route: "/c/overview",
      prepare: async (page) => {
        await page.getByRole("button", { name: /Open the day.s records/ }).last().click();
        await page.getByRole("dialog").first().waitFor();
      },
    },
    {
      id: "caregiver:/c/overview+chart-table",
      role: "caregiver",
      route: "/c/overview",
      prepare: async (page) => {
        await page.getByRole("button", { name: "View as table" }).first().click();
        await page.locator("table").first().waitFor();
      },
    },
    {
      id: "caregiver:/c/meds+add-drawer",
      role: "caregiver",
      route: "/c/meds",
      prepare: async (page) => {
        await page.getByRole("button", { name: "Add medication" }).first().click();
        const d = page.getByRole("dialog", { name: /Add a medicine/ });
        await d.waitFor();
        await d.getByRole("combobox", { name: "Medicine name" }).fill("tylenol");
        await page.waitForTimeout(300);
      },
    },
    {
      id: "caregiver:/c/meds+fuzzy-prompt",
      role: "caregiver",
      route: "/c/meds",
      prepare: async (page) => {
        await page.getByRole("button", { name: "Add medication" }).first().click();
        const d = page.getByRole("dialog", { name: /Add a medicine/ });
        await d.waitFor();
        await d.getByRole("combobox", { name: "Medicine name" }).fill("Gabapentn");
        await d.locator(".cg-match__title", { hasText: /Did you mean/ }).waitFor();
      },
    },
    {
      id: "caregiver:/c/meds+stop-dialog",
      role: "caregiver",
      route: "/c/meds",
      prepare: async (page) => {
        await page.getByRole("button", { name: /Record that .* was stopped/ }).first().click();
        await page.getByRole("dialog").first().waitFor();
      },
    },
    {
      id: "caregiver:/c/review+why-and-decision",
      role: "caregiver",
      route: "/c/review",
      prepare: async (page) => {
        const card = page.locator('[data-tour="review-finding"]').first();
        await card.getByRole("button", { name: "Why this matters" }).click();
        await card.getByRole("radio", { name: "To discuss" }).click();
        await page.waitForTimeout(200);
      },
    },
    {
      id: "caregiver:/c/review+records-drawer",
      role: "caregiver",
      route: "/c/review",
      prepare: async (page) => {
        await page.getByRole("button", { name: /show the records/ }).first().click();
        await page.getByRole("dialog").first().waitFor();
      },
    },
    {
      id: "caregiver:/c/timeline+day-drawer",
      role: "caregiver",
      route: "/c/timeline",
      prepare: async (page) => {
        await page.getByRole("button", { name: /Open the day.s records/ }).last().click();
        await page.getByRole("dialog").first().waitFor();
      },
    },
    {
      id: "caregiver:/c/timeline+how-it-works-disclosure",
      role: "caregiver",
      route: "/c/timeline",
      prepare: async (page) => {
        await page.getByRole("button", { name: "How this comparison works" }).click();
        await page.waitForTimeout(200);
      },
    },
    {
      id: "caregiver:/c/ask+answers",
      role: "caregiver",
      route: "/c/ask",
      prepare: async (page) => {
        await page.getByRole("button", { name: "How many near-falls since lorazepam started?" }).click();
        await page.locator(".cg-ask-a").last().waitFor();
        await page.getByRole("textbox", { name: /Ask/ }).fill("Should she stop taking the lorazepam?");
        await page.getByRole("button", { name: "Ask", exact: true }).click();
        await page.locator(".cg-ask-a--redirect").last().waitFor();
      },
    },
    {
      id: "caregiver:/c/brief+evidence-drawer",
      role: "caregiver",
      route: "/c/brief",
      prepare: async (page) => {
        await page.getByRole("button", { name: /^Show the record:/ }).first().click();
        await page.getByRole("dialog").first().waitFor();
      },
    },
    {
      id: "caregiver:/c/brief+fhir-preview",
      role: "caregiver",
      route: "/c/brief",
      prepare: async (page) => {
        await page.getByRole("button", { name: "Preview the JSON" }).click();
        await page.waitForTimeout(300);
      },
    },
    {
      id: "caregiver:/c/brief+edit-sentence",
      role: "caregiver",
      route: "/c/brief",
      prepare: async (page) => {
        // The sentence tools appear on hover / focus, like a person would reveal them.
        const edit = page.getByRole("button", { name: /^Edit What we.ve noticed, sentence 1/ });
        await edit.focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
      },
    },
    {
      id: "caregiver:/c/settings+restore-dialog",
      role: "caregiver",
      route: "/c/settings",
      prepare: async (page) => {
        await page.getByRole("button", { name: "Restore demo" }).click();
        await page.getByRole("alertdialog").or(page.getByRole("dialog")).first().waitFor();
      },
    },
    {
      id: "public:/how-it-works+eval-results",
      role: null,
      route: "/how-it-works",
      prepare: async (page) => {
        await page.getByRole("button", { name: "Run the extraction benchmark now" }).click();
        await page.getByText(/micro-F1 over/).first().waitFor({ timeout: 60000 });
        await page.getByRole("button", { name: "Run the medication-review suite" }).click();
        await page.locator(".pub-how-tile", { hasText: "Cases fully passed" }).waitFor({ timeout: 60000 });
      },
    },
    {
      id: "public:/+wrong-password",
      role: null,
      route: "/",
      prepare: async (page) => {
        // The demo sign-in form is collapsed by default (Welcome.tsx disclosure); open it to scan its error state.
        await page.getByRole("button", { name: "Have the demo credentials? Sign in" }).click();
        await page.getByLabel("Username").fill("babson");
        await page.getByLabel("Password").fill("nope");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.getByText(/don.t match/).waitFor();
      },
    },
    {
      id: "caregiver:tour-step-1",
      role: "caregiver",
      route: "/c/overview?tour=1",
      prepare: async (page) => {
        await page.locator(".tour-card").waitFor();
        await page.waitForTimeout(400);
      },
    },
    {
      id: "caregiver:tour-step-2(patient)",
      role: "caregiver",
      route: "/c/overview?tour=1",
      prepare: async (page) => {
        await page.locator(".tour-card").waitFor();
        await page.locator(".tour-card").getByRole("button", { name: /^Next/ }).click();
        await page.locator(".tour-card").getByText("Step 2 of 8").waitFor();
        await page.locator('[data-tour="checkin-heard"]').waitFor({ timeout: 8000 });
        await page.waitForTimeout(400);
      },
    },
  ];
  for (const s of states) list.push({ theme: "light", ...s, id: `light:${s.id}` });
  return list;
}

function summarize(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
    sample: v.nodes[0]?.failureSummary?.split("\n").slice(0, 3).join(" ").slice(0, 220),
  }));
}

async function main() {
  const t0 = Date.now();
  const server = await startServer();
  const browser = await launchBrowser();
  const sink = newSink();
  const all = selectedChecks(scenarios());
  console.log(`Kinwise a11y · ${server.base} · axe ${TAGS.join(",")} · ${all.length} scans`);
  const results = [];
  const report = [];
  try {
    for (const s of all) {
      const start = Date.now();
      const ctx = await newContext(browser, server.base, { role: s.role, colorScheme: s.theme ?? "light" });
      const page = instrument(await ctx.newPage(), server.base, sink);
      let r;
      try {
        await go(page, server.base, s.route);
        if (s.theme === "dark") {
          // The seed pins theme "light"; switch the saved display setting (what Settings › Dark does) and reload.
          await page.evaluate((k) => {
            const d = JSON.parse(localStorage.getItem(k));
            d.settings.theme = "dark";
            localStorage.setItem(k, JSON.stringify(d));
          }, STORE_KEY);
          await page.goto("about:blank");
          await go(page, server.base, s.route);
          const t = await page.evaluate(() => document.documentElement.dataset.theme);
          if (t !== "dark") throw new Error(`dark theme not applied (data-theme=${t})`);
        }
        if (s.prepare) await s.prepare(page);
        await page.waitForTimeout(250);
        // Scan from the top so sticky headers don't "obscure" content the user scrolled past (axe target-size).
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
        const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const v = summarize(axe.violations);
        const bad = v.filter((x) => FAIL_IMPACTS.has(x.impact));
        const minor = v.filter((x) => !FAIL_IMPACTS.has(x.impact));
        const file = join(OUT, `${s.id.replace(/[^a-z0-9]+/gi, "_")}.png`);
        await page.screenshot({ path: file, fullPage: true }).catch(() => {});
        report.push({ id: s.id, violations: v, passes: axe.passes.length });
        const detail = bad.length
          ? bad.map((x) => `${x.impact} ${x.id} ×${x.nodes}: ${x.help} — ${x.targets.slice(0, 2).join(" | ")}`).join("\n")
          : `0 serious/critical · ${axe.passes.length} rules passed${minor.length ? ` · ${minor.length} moderate/minor (${minor.map((x) => x.id).join(", ")})` : ""}`;
        r = { id: s.id, ok: bad.length === 0, ms: Date.now() - start, detail };
      } catch (e) {
        await page.screenshot({ path: join(OUT, `ERROR-${s.id.replace(/[^a-z0-9]+/gi, "_")}.png`) }).catch(() => {});
        r = { id: s.id, ok: false, ms: Date.now() - start, detail: `could not prepare/scan: ${String(e?.message ?? e).split("\n")[0]}` };
        report.push({ id: s.id, error: r.detail });
      }
      results.push(r);
      process.stdout.write(`${r.ok ? "PASS" : "FAIL"}  ${s.id}\n`);
      await ctx.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
    await server.stop();
  }
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ ranAt: new Date().toISOString(), tags: TAGS, report }, null, 2));
  const failed = printTable(`Kinwise a11y results (${((Date.now() - t0) / 1000).toFixed(0)}s) — report in test-results/a11y/report.json`, results);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
