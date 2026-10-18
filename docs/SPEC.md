# MedWatch v2 — product & technical specification (build contract)

> **Numbers, file names and AI roles in this contract are pre-build targets; results as built are in [EVALUATION.md](EVALUATION.md) and [ARCHITECTURE.md](ARCHITECTURE.md).**
>
> **Note (Oct 11 2026):** this is the original build contract, written under the working name "MedWatch". The product is
> now **Kinwise** (see §13 of SPEC.md); the app's user-facing text says Kinwise, and "MedWatch" there refers only to
> FDA's adverse-event reporting program. Kinwise is not affiliated with the FDA.
>
> **Note (Oct 17 2026):** the UnivaBio deadline below was later extended to **Oct 20 2026, 11:45 PM EDT**. The module
> layout in §4 is the original plan; [ARCHITECTURE.md](ARCHITECTURE.md) describes the modules as built.

Status: authoritative contract for the v2 build (branch `medwatch-v2`). Deadline at the time of writing: UnivaBio, Oct 13 2026 11:45 PM EDT (since extended to Oct 20 2026, 11:45 PM EDT).
All implementation agents MUST follow this document and the TypeScript contracts in `src/model/types.ts` and `src/kb/types.ts`.

## 1. Product in one paragraph

MedWatch is a private, on-device AI co-pilot that helps families caring for an older adult on many medicines **notice
possible medication side effects early and bring a clear, evidence-backed medication question to the doctor or pharmacist.**
The older adult describes their day in their own words; on-device clinical NLP turns that into a structured, confirmed
symptom diary. A deterministic, citation-backed medication-review engine (AGS Beers Criteria® 2023, Anticholinergic
Cognitive Burden scale, fall-risk-increasing drugs, drug–drug interactions, prescribing cascades) checks the medication list
and connects it with what the diary shows over time ("dizziness recorded on 2 of 13 days before lorazepam started vs 8 of 14
days after"). An on-device language model drafts a one-page clinician brief and answers questions about the records — every
sentence linked to evidence and checked by code. Nothing leaves the device unless the family prints or exports it.

Tagline candidates: "Catch medication side effects before they become falls." / "From 'Mom seems off' to a clear question for her doctor."

## 2. Users & story (fictional seed data — keep consistent everywhere)

- **Margaret Rivera, 78** (fictional patient; patient login `babson`/`babson`). Lives alone, sees 3 prescribers.
  Conditions recorded by caregiver: hypertension, type 2 diabetes, overactive bladder, insomnia, osteoarthritis.
- **Alex Rivera** (her daughter, caregiver login `babson1`/`babson1`).
- Clinician audience: primary-care physician, Medicare Annual Wellness Visit, or pharmacist Comprehensive Medication Review.

Seed medication list (dates relative to "today"; IDs stable):
| id | name as entered | generic(s) | dose / schedule | reason | prescriber | start |
|---|---|---|---|---|---|---|
| med-amlodipine | Amlodipine | amlodipine | 10 mg once daily | Blood pressure | Dr. Okafor (cardiology) | today-140 |
| med-furosemide | Furosemide (Lasix) | furosemide | 20 mg once daily | Ankle swelling | Dr. Lee (primary care) | today-95 |
| med-metformin | Metformin | metformin | 500 mg twice daily | Diabetes | Dr. Lee | today-900 |
| med-atorvastatin | Atorvastatin | atorvastatin | 20 mg nightly | Cholesterol | Dr. Lee | today-900 |
| med-omeprazole | Omeprazole | omeprazole | 20 mg daily | Heartburn | Dr. Lee | today-400 |
| med-oxybutynin | Oxybutynin | oxybutynin | 5 mg twice daily | Bladder | Dr. Shah (urology) | today-210 |
| med-tylenolpm | Tylenol PM (OTC) | acetaminophen + diphenhydramine | 2 caplets at bedtime as needed | Sleep | self (OTC) | today-180 |
| med-lorazepam | Lorazepam (Ativan) | lorazepam | 0.5 mg at bedtime | Anxiety / sleep | Urgent care | today-16 |

Engine results this list must produce (acceptance test for the seed):
- Beers PIM: lorazepam (benzodiazepine – avoid), diphenhydramine (first-gen antihistamine – avoid), oxybutynin (strong anticholinergic – in Beers lists as antimuscarinic for urinary incontinence ... verify in KB), omeprazole (PPI > 8 weeks – avoid unless high-risk), plus any others the KB supports.
- Anticholinergic burden: ACB total ≥ 6 (diphenhydramine 3, oxybutynin 3, furosemide 1, …) → "high".
- Drug–drug: ≥2 anticholinergics together (Beers Table 5) ; CNS-active combos if applicable.
- Fall-risk drugs: lorazepam, diphenhydramine, furosemide (diuretic), amlodipine (antihypertensive), oxybutynin (per STOPPFall/STEADI if listed).
- Prescribing cascade: amlodipine (CCB) → peripheral edema → furosemide (loop diuretic), furosemide started 45 days after amlodipine, reason "ankle swelling".
- Drug–disease: once a fall/near-fall is recorded, "history of falls" activates benzodiazepine/antihistamine-related Beers drug–disease rules.
- Timeline signal: lorazepam start (today-16) → dizziness, near-falls, drowsiness and confusion recorded more often after vs before; energy lower.

Seed diary: ~45 days of check-ins with realistic gaps (missing ~15% of days), stories in Margaret's voice for ~1/3 of days
(colloquial: "woozy", "nearly went over in the kitchen", "my granddaughter fell off her bike" (experiencer=other),
"no dizziness today", "slept like a log", "didn't feel like eating"), ankle swelling present early (after amlodipine) and less after furosemide.
After lorazepam start: dizziness on ~55–60% of answered days (vs ~15% before), 2 near-falls + 1 fall in last 16 days (0–1 before),
drowsiness frequent, confusion on a few days. Caregiver notes: 3–4, one pinned concern: "Mom seems foggier in the mornings since
urgent care started the new sleeping pill. She almost fell in the bathroom on Tuesday."

## 3. Scope boundaries (enforced in code + copy)

DO: medication list, symptom diary, citation-backed review prompts, descriptive timeline statistics, grounded AI drafts,
clinician brief, FHIR export, Q&A about the person's own records, general drug information from the KB.
DO NOT: diagnose, recommend starting/stopping/changing a dose, assign urgency/triage, say a drug *caused* a symptom,
say anything is "safe", claim clinical validation/FDA clearance/HIPAA compliance, send data anywhere automatically.
Every review finding ends in a **question for the clinician/pharmacist**, never an instruction. The persistent safety line:
"Don't stop or change any medicine without talking to the prescriber. If something feels like an emergency, call 911."

Language rules for UI + AI: "recorded on N of M answered days", "started on <date>", "is listed in the AGS Beers Criteria as a
medicine older adults should generally avoid because…", "worth asking about". Banned: "caused", "is causing", "dangerous",
"safe", "you should stop", "urgent", "diagnosis", "risk score" (we show "anticholinergic burden score (ACB)", which is a published scale).

## 4. Architecture

React 19 + TypeScript (strict) + Vite 7, hash router, CSS design system (no Tailwind), Recharts, lucide-react, vitest,
Playwright. Static SPA; deployable to GitHub Pages (base `/UnivaBioBabson/` when `GITHUB_PAGES=1`). No backend.

Original planned layout (Oct 10). Some planned files were never created or were merged: for example, the medication
rules live in `src/engine/meds/rules/` (`acb.ts`, `beers.ts`, `cascades.ts`, `falls.ts`, `duplicates.ts`,
`monitoring.ts`), and there is no `frids.ts`, `ddi.ts` or top-level `acb.ts`; Beers Table 5 interactions are in
`beers.ts`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the actual modules.

```
src/
  model/        types.ts (domain contracts), store.ts (persistence, revisions, migrations), seed.ts, dates.ts, ids.ts
  kb/           types.ts, data/*.json (compiled KB), index.ts (lookup API), normalize.ts (drug-name matching), sources.ts
  engine/
    meds/       review.ts (findings), acb.ts, cascades.ts, frids.ts, beers.ts, ddi.ts — pure functions + tests
    nlp/        lexicon.ts, context.ts (ConText/NegEx), extract.ts, numbers.ts — pure + tests + benchmark
    timeline/   windows.ts, stats.ts (Fisher exact), signals.ts — pure + tests
    brief/      evidence.ts (evidence package + IDs), template.ts, fhir.ts, verify.ts (claim checker) — pure + tests
  ai/           llm.ts (WebLLM worker client, status store), worker.ts, prompts.ts, tasks.ts (brief/qa/extract/explain), guard.ts
  ui/           design system: tokens.css, base.css, components (Button, Card, Badge, Chip, Field, Modal, Drawer, Tabs, Toast,
                Meter, EmptyState, Disclosure, SourceCitation, EvidenceLink, Sparkline...), icons
  views/
    public/     Welcome (login + one-click demo), HowItWorks (architecture + live evaluation runner + sources)
    patient/    Today (check-in), MyWeek, MyMedicines, Help
    caregiver/  Overview, Medications (+ editor), Review (findings), Timeline (charts + signals + entries), Ask (Q&A),
                VisitBrief (builder + print + FHIR), Settings (profile/conditions, AI, data)
  app/          App.tsx, router.ts, session.ts, layout (Shell, Sidebar, PatientShell), Tour (guided demo overlay)
  main.tsx
eval/           nlp-corpus.dev.json, nlp-corpus.heldout.json, med-cases.json, run-nlp-eval.ts, run-med-eval.ts, results/*.json
scripts/        download-model.mjs, browser-test.mjs, a11y.mjs, llm-eval.mjs, record-demo.mjs, make-pdfs.py, make-code-pdf.py
docs/           ARCHITECTURE.md, EVALUATION.md, CLINICAL-SOURCES.md, REGULATORY.md, DEMO-SCRIPT.md, screenshots/
submission/     one-page PDF, code PDF, sample visit brief PDF, demo video
archive/        prototype-v1-neil/, prototype-1-albert/ (previous work, unchanged)
```

Pure engines (`src/engine/**`, `src/kb/**`, `src/model/**` except storage glue) must not import React or browser-only APIs,
so they run in vitest/node and in the in-app evaluation runner.

## 5. Knowledge base (src/kb)

Compiled from verified research into JSON under `src/kb/data/`:
- `drugs.json` — canonical drug entries: `{ id (lowercase generic), display, brands[], aliases[], classes[] (internal class ids),
  rxcui?, otc?, acb (0-3), frid?: string (class id), commonEffects: SymptomKey[] (labeled adverse effects relevant to diary) }`.
  Combination products (e.g. "tylenol pm") map to multiple ingredient ids via `combos.json`.
- `classes.json` — class ids → display names (e.g. `benzodiazepine`, `first_gen_antihistamine`, `ccb_dihydropyridine`, `loop_diuretic`).
- `beers.json` — PIM rules (Table 2), drug–disease (Table 3), use-with-caution (Table 4), DDIs (Table 5), renal (Table 6),
  each `{ id, table, appliesTo: {drugs?:[], classes?:[]}, condition?, plain, clinician, recommendation, quality, strength, sourceId }`.
- `cascades.json` — `{ id, index: {drugs?, classes?}, adverseEffect, marker: {drugs?, classes?}, plain, clinician, sourceId, windowDays? }`.
- `frids.json` — fall-risk classes `{ classId, plain, sourceId }`.
- `sources.json` — source register `{ id, citation, url, doi?, year, publisher, usedFor }`.
Every finding the app shows carries `sourceId`s that resolve in `sources.json`; UI renders them as citations.
KB must state its coverage honestly (N drugs, which tables) — shown on the How-it-works page.

## 6. Engines (pure, deterministic, unit-tested)

### 6.1 Drug normalization (`kb/normalize.ts`)
`matchDrug(input) → { ingredientIds[], confidence: 'exact'|'brand'|'alias'|'fuzzy'|'none', suggestion? }` — case/whitespace/
punctuation-insensitive, strips dose text ("Lorazepam 0.5mg" → lorazepam), brand→generic, combos, fuzzy (Damerau-Levenshtein ≤2
for len≥6) returns a *suggestion* requiring user confirmation. Unknown drugs → "not in MedWatch's reference set" (never "safe").

### 6.2 Medication review (`engine/meds/review.ts`)
`reviewMedications({ meds, profile, checkIns, today }) → MedReview` (types in model/types.ts). Finding categories:
`beers_avoid`, `beers_caution`, `beers_condition` (drug–disease; conditions come from profile + diary-derived
`history_of_falls` when any fall/near-fall recorded in last 12 months), `beers_interaction`, `beers_renal` (only if CrCl known),
`anticholinergic_burden` (ACB total ≥3 → one finding listing contributors), `fall_risk` (≥1 FRID; combined finding listing them,
emphasised when diary shows falls/near-falls/dizziness), `prescribing_cascade` (index started before marker, marker within
window, or reason text mentions the adverse effect), `duplicate_class` (2+ active drugs in same therapeutic class),
`cns_active_combo` (Beers: ≥3 CNS-active drugs). Each finding: stable `key`, `title`, `medIds`, `plain` (≤2 sentences, 8th-grade),
`clinician` (≤2 sentences), `question` (for the visit), `sourceIds`, `evidenceGrade?` ("Beers 2023: strong recommendation,
moderate-quality evidence"), `relatedSymptoms` (diary symptoms that are known effects AND were recorded in last 30 days),
`signalIds` (timeline signals for the same med). Sorted: findings linked to recorded symptoms first, then by category order
above. Only active meds (no endDate or endDate ≥ today). Age < 65 → Beers findings suppressed with a notice.

### 6.3 Timeline signals (`engine/timeline`)
For each medication start (and stop) event within the last 180 days and each diary metric: before window = up to 21 days
before start, after window = start..min(start+21, today). Rates use **answered** days as denominator. Requirements: ≥5 answered
days in each window and ≥5 days since start; otherwise status `insufficient` with the exact reason. Binary metrics: Fisher's exact
test (two-sided) on 2×2 counts; mean metrics (energy, sleep 1–5): difference in means + Mann–Whitney U (or permutation test)
p-value. Strength: `strong` if p<0.01 and abs diff ≥ 30 pts (rates) / ≥1.0 (means); `moderate` if p<0.05; `weak` if p<0.2 and
diff meaningful; else `none` (not shown as a signal). Each signal records `overlapping` med changes within ±21 days (confounders)
and `knownEffect` (KB lists metric as an effect of that drug). Text template: "Dizziness was recorded on 8 of 14 answered days
after lorazepam started on Sep 24, compared with 2 of 13 before." + "This shows a change in recorded frequency; it does not show
the medicine caused it." Also `weeklySummary(checkIns, today)` for patient view (this week vs last week, plain language,
"not enough entries" when <3 answered days).

### 6.4 Clinical NLP (`engine/nlp`)
`extractCheckIn(story, { meds, today }) → Extraction` — runs synchronously in <10 ms.
1. Sentence/clause segmentation with exact UTF-16 offsets.
2. Concept lexicon (SymptomKey + extra concepts with SNOMED CT codes): dizziness (dizzy, lightheaded, woozy, room spinning,
   unsteady?…), drowsiness (drowsy, sleepy all day, groggy, nodding off), confusion (confused, foggy, muddled, forgetful, mixed up,
   memory fog), fall (fell, took a tumble, fell down, ended up on the floor), nearFall (nearly fell, almost fell, lost my balance,
   caught myself, tripped but…), swelling (swollen ankles/feet, puffy ankles), nausea, constipation, dry mouth, headache, cough,
   blurred vision, urinary problems, low mood, anxiety, pain… Energy & sleep & appetite value extraction:
   explicit ratings ("energy was 2 out of 5", "sleep 4/5", "a 3 for energy") → explicit; qualitative ("exhausted", "no energy",
   "full of beans", "slept badly", "slept like a log", "didn't feel like eating", "ate well") → `inferred` suggestion with mapped value
   that the user must confirm (energy: exhausted→1, tired→2, ok→3, good→4, great→5; sleep similarly; appetite worse/same/better).
   Severity words for dizziness: slight/a little/mild→1, quite/moderate→2, very/really bad/severe→3 (inferred).
3. ConText (Harkema 2009): negation triggers (pre: no, not, never, without, denies, didn't, haven't, wasn't, free of; post: "was
   gone", "went away"? careful; pseudo-negation: "no better", "not only", "no change"? -> treat as not negating), scope until
   termination terms (but, however, although, though, except, aside from, which, ;, sentence end), historical (yesterday, last
   week/night/month, used to, in the past, years ago, before — note "yesterday" is historical relative to the check-in day),
   hypothetical (if, in case, worried that, might, could, afraid I'll), experiencer-other (my sister/husband/granddaughter/friend/
   neighbour/he/she as subject). A negated mention yields `present:false` (explicit) ; historical/hypothetical/other → not mapped
   to today's answers but kept as `mentions` with reason shown ("mentioned for someone else").
4. "fall" vs "nearFall": "nearly/almost fell", "caught myself", "lost my balance but didn't fall" → nearFall=true; "didn't fall"
   alone → fall=false only (NOT nearFall=false).
5. Medication mentions: match active med names/brands in text; detect "missed/forgot/skipped" dose phrases → `medNotes`.
6. Output proposals ≤ one per field; conflicts (both affirmed and negated in different clauses) → `conflict` certainty, user decides.
Every proposal has ≥1 span; tests assert `story.slice(start,end)===quote`.
Benchmark: `eval/nlp-corpus.dev.json` (~120 cases) and `eval/nlp-corpus.heldout.json` (~60 cases written independently,
never used for tuning). Metrics: per-field precision/recall/F1, negation accuracy, experiencer/temporal false-positive rate.
Runnable via `npm run eval:nlp` and in-app on How-it-works ("Run evaluation now").

### 6.5 Evidence package, template brief, verification, FHIR (`engine/brief`)
- `buildEvidence(store, range, review, signals) → EvidencePackage` with stable IDs: `fact:*` (coverage, counts),
  `sig:*` (signals), `find:*` (review findings), `med:*` (meds), `note:*`/`concern:*` (caregiver/patient notes), `entry:*` (check-ins).
  Each item: `{ id, kind, text (one factual sentence, code-rendered), data }`.
- `templateBrief(pkg) → BriefContent` — fully deterministic brief (always available).
- `verifyClaims(text, cited: EvidenceItem[]) → Issue[]` — every number in an AI sentence must appear in the cited evidence text;
  medication names mentioned must be in the med list; banned phrases (causal/advice/urgency/safety) rejected; cited IDs must exist.
- `toFhirBundle(store, brief) → FHIR R4 Bundle (type "collection")` with Patient (fictional, no identifiers), MedicationStatement
  per med (RxNorm coding when rxcui known, text otherwise), Observation per symptom-day (SNOMED codes; valueBoolean/valueInteger;
  effectiveDateTime), DetectedIssue per review finding (code + detail + evidence references), Communication or Composition for
  questions/concerns. Must validate structurally (resourceType, ids, references resolve within bundle). Provide `meta.tag`
  "fictional-demo-data".

### 6.6 Brief content shape (rendered on screen + print)
Header (patient display name, age, period, prepared by, date, "Prepared with MedWatch — a family-kept record, not a clinical
assessment"); 1) Why we're coming in (caregiver concern, pinned); 2) What we've noticed (top signals with counts + mini chart);
3) Medication review prompts (top findings with citation short-form, e.g. "AGS Beers 2023"); 4) Our questions (3–5, editable);
5) Current medication list (code-rendered table, flags column); 6) Diary coverage & limitations; footer with generation provenance
(template vs AI model id, prompt version, KB version, reviewed-by + timestamp). Must fit one US-Letter page for the seed data;
longer lists continue onto page 2 (never truncate silently).

## 7. AI layer (src/ai) — on-device only

Tier 0 (always on): clinical NLP engine (6.4) + deterministic template brief + rule-based Q&A retrieval.
Tier 1 (opt-in, WebGPU): WebLLM in a Web Worker. Model chosen by research (default candidate Qwen2.5-3B-Instruct-q4f16_1-MLC,
fallback Qwen2.5-1.5B). Load from `./models/...` when present locally (dev), else from the official Hugging Face MLC URLs
(public demo; weights only — no user data is sent). Status store: idle/loading(progress)/ready/generating/error + lastMs.
Tasks (each = prompt + JSON schema + host validation + fallback):
- `draftBrief(pkg)` → `{ summary: [{text, evidenceIds}], questions: [{text, evidenceIds}] }`; validated by verifyClaims; failing
  sentences dropped (and counted) — if fewer than 2 survive, fall back to template with a visible notice.
- `answerQuestion(question, retrieved: EvidenceItem[])` → `{ answer: [{text, evidenceIds}], status }`; deterministic retrieval
  first (keywords→concepts→date ranges); out-of-scope detection (diagnosis/dose/urgency) → fixed redirect + "add to visit questions".
- `refineExtraction(story, extraction)` → extra proposals; each must cite an exact span AND pass ConText re-check; else discarded.
- `explainFinding(finding, kbText)` → 2–3 plain sentences grounded ONLY in KB text (verifyClaims against KB text).
Every AI output displays: "AI draft · on this device · <model> · <ms>", a "Show sources" control, and requires human review
before entering the brief. Cancellation + 60 s timeout. No streaming of unchecked text into the brief.

## 8. UX & design

Visual language: warm, calm, trustworthy. Cream background (#F7F5EF), deep green primary (#25584A / #2F6B5A), terracotta accent
(#C8734F) for CTAs sparingly, ink #1F2A26, muted #5E6A64, lines #E3E0D6, success sage, caution amber (#B7791F, desaturated),
"attention" rust (#B5523B) — never fire-engine red. Fonts: DM Sans (bundled) for UI; Source Serif 4 or system serif for
patient quotes/headlines (bundle if possible, OFL). 8-pt spacing, 14–16px radii, soft shadows. Light + dark themes via tokens.
Patient view: ≥18px body, ≥48px targets, max 3 tabs (Today, My week, My medicines) + Help button, one task per screen, big
tap-cards with icons + words (no color-only meaning), voice-friendly copy. Caregiver: sidebar nav (Overview, Medications,
Medication review, Symptoms & timeline, Ask MedWatch, Visit brief, Settings) + "How MedWatch works" link; responsive to 390px
(bottom nav on mobile). Every number has a "Show the records" evidence drawer. Accessibility: WCAG 2.2 AA contrast, focus
rings, semantic landmarks, aria-live for AI status, reduced motion, 200% zoom. Persistent but compact "Fictional demo data" chip.
Welcome screen: product value prop + "Try as Margaret (patient)" / "Try as Alex (caregiver)" one-click buttons + credential form
+ "Take the 2-minute guided tour" + privacy line. Guided tour: 8-step overlay that navigates the app (check-in with NLP → review
→ timeline signal → visit brief → FHIR → how it works).

## 9. Quality gates

- `npm test` (vitest) green; engines ≥90% statement coverage; `npm run build` with zero TS errors.
- NLP benchmark: report real numbers; target held-out field F1 ≥ 0.90 and zero critical negation/experiencer errors on dev set.
- Med engine: seed acceptance test (section 2) + independent case file `eval/med-cases.json` all pass.
- Playwright E2E: login both roles, NLP check-in save, med add with brand-name match, review finding visible, timeline signal,
  brief template generation + print preview, FHIR export downloads valid JSON, How-it-works eval runner.
- axe: no serious/critical violations on main screens. Mobile 390px screenshots reviewed.
- LLM (local WebGPU on the M1 Pro): brief + QA scenarios run; record validation pass rate, dropped sentences, latency.
- No network requests except same-origin assets (and HF model weights only when the user loads AI on the hosted demo).

## 10. Module APIs (contracts between agents — implement exactly these exports; add more if needed)

Already written by the lead (do not rewrite; small fixes OK): `src/model/types.ts`, `src/kb/types.ts`, `src/model/dates.ts`,
`src/model/ids.ts`, `src/model/store.ts` (validateStore/loadStore/saveStore/commitStore), `src/app/StoreProvider.tsx`
(`<StoreProvider>`, `useStore() → {data, today, loadStatus, update(actor, updater), resetDemo(), replaceAll(data)}`),
`src/app/session.ts` (`DEMO_ACCOUNTS, login(u,p), loginAs(role), logout(), useSession()`).

```ts
// src/model/seed.ts
export const DEMO_TODAY_OFFSETS: Record<string, number>;          // documented offsets used by the seed (e.g. lorazepamStart: -16)
export function createSeed(today: ISODate): StoreData;            // deterministic for a given `today` (seeded PRNG), section 2 story

// src/kb/index.ts
export const KB: KnowledgeBase;
export function getDrug(id: string): KbDrug | undefined;
export function getSource(id: string): KbSource | undefined;
export function classesOf(ingredientId: string): string[];        // transitive (includes parents)
export function selectorMatches(ingredientIds: string[], sel: DrugSelector): boolean;
export function searchDrugs(query: string, limit?: number): { label: string; detail: string; ingredientIds: string[]; kind: "drug" | "brand" | "combo" }[];
export function knownEffect(ingredientIds: string[], metric: MetricKey): boolean;
// src/kb/normalize.ts
export function matchDrug(input: string): DrugMatch;

// src/engine/meds/review.ts
export function reviewMedications(input: { meds: Medication[]; profile: PatientProfile; checkIns: CheckIn[]; today: ISODate; signals?: Signal[] }): MedReview;
export function activeMeds(meds: Medication[], today: ISODate): Medication[];
export const CATEGORY_LABEL: Record<FindingCategory, string>;

// src/engine/timeline/stats.ts
export function fisherExact(a: number, b: number, c: number, d: number): number;   // two-sided p
export function mannWhitneyU(x: number[], y: number[]): { u: number; p: number }; // two-sided, normal approx w/ tie correction; exact for small n optional
// src/engine/timeline/metrics.ts
export const METRICS: { key: MetricKey; label: string; kind: "boolean" | "scale"; higherIsWorse: boolean; short: string }[];
export function metricValue(c: CheckIn, m: MetricKey): number | null;  // boolean → 1/0, scale → 1..5, null if unanswered
export function windowStat(checkIns: CheckIn[], m: MetricKey, from: ISODate, to: ISODate): WindowStat;
// src/engine/timeline/signals.ts
export function analyzeTimeline(input: { checkIns: CheckIn[]; meds: Medication[]; today: ISODate; isKnownEffect?: (med: Medication, m: MetricKey) => boolean }): TimelineAnalysis;
export function weeklyTrends(checkIns: CheckIn[], today: ISODate): WeeklyTrend[];
export function dailySeries(checkIns: CheckIn[], from: ISODate, to: ISODate): { date: ISODate; [k: string]: number | null | string }[]; // chart rows

// src/engine/nlp/extract.ts
export function extractCheckIn(story: string, ctx: { meds: Medication[]; today: ISODate }): Extraction;
export function applyProposals(answers: DiaryAnswers, proposals: Proposal[], accepted: DiaryField[]): DiaryAnswers;
// src/engine/nlp/context.ts  (ConText) — exported for tests + explanation UI
export function analyzeContext(sentence: string, target: { start: number; end: number }): { negated: boolean; temporality: Mention["temporality"]; experiencer: Mention["experiencer"]; triggers: Span[] };

// src/engine/brief/evidence.ts
export function buildEvidence(input: { data: StoreData; from: ISODate; to: ISODate; review: MedReview; timeline: TimelineAnalysis; includedConcernIds?: string[] }): EvidencePackage;
// src/engine/brief/template.ts
export function templateBrief(pkg: EvidencePackage, input: { data: StoreData; review: MedReview; timeline: TimelineAnalysis }): BriefContent;
// src/engine/brief/verify.ts
export const BANNED_PATTERNS: { pattern: RegExp; reason: string }[];
export function verifySentence(s: BriefSentence, pkg: EvidencePackage, opts?: { medNames?: string[] }): { ok: boolean; issues: string[] };
// src/engine/brief/fhir.ts
export function toFhirBundle(input: { data: StoreData; review: MedReview; brief: VisitBrief | null; today: ISODate }): FhirBundle; // + validateBundle(b): string[]
// src/engine/brief/qa.ts
export function routeQuestion(q: string): { inScope: true } | { inScope: false; reason: string; redirect: string };
export function retrieveForQuestion(q: string, input: { data: StoreData; pkg: EvidencePackage; today: ISODate }): { items: EvidenceItem[]; deterministicAnswer: BriefSentence[]; range: { from: ISODate; to: ISODate } };

// src/ai/llm.ts
export const MODEL_OPTIONS: { id: string; label: string; sizeMB: number; vramMB: number; recommended?: boolean }[];
export function useLLM(): { status: "unsupported" | "idle" | "loading" | "ready" | "generating" | "error"; progress: number; message: string; model: string | null; lastMs: number | null };
export function loadModel(modelId?: string): Promise<void>;
export function unloadModel(): Promise<void>;
export function cancel(): void;
export function generateJSON<T>(req: { system: string; user: string; schema: object; maxTokens?: number; timeoutMs?: number }): Promise<{ value: T; ms: number; raw: string }>;
// src/ai/tasks.ts  (each returns null when the model is not ready; throws on validation failure)
export function aiDraftBrief(pkg: EvidencePackage, template: BriefContent): Promise<{ content: BriefContent; info: GenerationInfo }>;
export function aiAnswer(question: string, items: EvidenceItem[], pkg: EvidencePackage): Promise<{ sentences: BriefSentence[]; dropped: number; ms: number }>;
export function aiRefineExtraction(story: string, base: Extraction, ctx: { meds: Medication[]; today: ISODate }): Promise<{ added: Proposal[]; rejected: number; ms: number }>;
export function aiExplainFinding(f: Finding): Promise<{ text: string; ms: number }>;
export const PROMPT_VERSION: string;

// src/app/useDerived.ts
export function useDerived(): { review: MedReview; timeline: TimelineAnalysis; weekly: WeeklyTrend[]; active: Medication[] }; // memoized on data.revision + today
// src/app/router.ts — hash routes
export type Route = "/" | "/how-it-works" | "/p/today" | "/p/week" | "/p/meds" | "/c/overview" | "/c/meds" | "/c/review" | "/c/timeline" | "/c/ask" | "/c/brief" | "/c/settings";
export function useRoute(): { path: Route; params: URLSearchParams }; export function navigate(path: Route, params?: Record<string,string>): void;
```

## 11. Conventions
TypeScript strict; double quotes; semicolons; 2-space indent; named exports (default export only for App); function components +
hooks; no new runtime dependencies without the lead's approval (available: react, react-dom, recharts, lucide-react,
@mlc-ai/web-llm). CSS: tokens in `src/ui/tokens.css` (CSS custom properties, light + dark), base in `src/ui/base.css`,
shared components in `src/ui/components.css`, per-area files `src/views/<area>/<area>.css`. Class names are kebab-case with an
area prefix (`ui-`, `pt-` patient, `cg-` caregiver, `pub-` public). No inline styles except dynamic values. Every interactive
element keyboard-accessible with visible focus. Tests: `*.test.ts` next to the module (vitest, node env). Never use
`Date.now()`-dependent logic in pure engines — always take `today` as input. Never write raw user text into URLs, logs or innerHTML.

## 12. Addendum (after evidence research, Oct 10)
- Beers "avoid" drugs drive only ~1–2% of acute ADE ED visits; anticoagulants, diabetes agents (insulin, sulfonylureas),
  oral antiplatelets and opioids drive most (Budnitz NEJM 2011; JAMA 2021). The review engine therefore adds a non-alarming
  `monitoring` finding category ("What to watch for") driven by `KnowledgeBase.monitoring` rules (anticoagulants: unusual
  bruising/bleeding, black stools; insulin & sulfonylureas: shakiness, sweating, confusion (possible low blood sugar);
  opioids: drowsiness, constipation, confusion; antiplatelets: bruising/bleeding; digoxin: nausea, vision changes, confusion).
  New ConceptIds: bleeding_or_bruising, black_stools, shakiness_or_sweating (NLP lexicon must cover them).
- Positioning sentence for all copy: "Clinician tools have the criteria but not the home observations. Diary apps have the
  observations but not the criteria. MedWatch connects the two for the visit." Problem anchor: in primary care, 63% of
  ameliorable ADEs persisted because medication-related symptoms weren't acted on and 37% because the patient never told the
  doctor (Gandhi, NEJM 2003).
- Architecture justification (cite on How-it-works): LLMs are unreliable at drug-safety judgments (DDI detection <26%,
  Gallifant 2025; degrades with longer med lists, Blotske 2026; deprescribing criteria found but misapplied, Socrates 2025);
  grounded LLM + human works best (Ong 2025). Hence deterministic rules decide; the on-device LLM handles language only.

## 13. Product name: **Kinwise** (decided Oct 10 by the team)
The product is renamed from "MedWatch" to **Kinwise** because "MedWatch" is FDA's adverse-event reporting program and has
third-party USPTO filings. All new UI copy, docs and code comments use "Kinwise". Storage keys: `kinwise.v1.store`,
`kinwise.v1.session`. The lead will sweep remaining "MedWatch" strings during integration. Mention FDA MedWatch only when
referring to FDA's program (e.g. "you can report a suspected side effect to FDA MedWatch").
