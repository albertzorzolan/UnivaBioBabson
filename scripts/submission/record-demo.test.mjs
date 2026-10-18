// Unit tests for the demo recorder's pure logic (no browser, no dev server, no `say`):
//   node --test scripts/submission/record-demo.test.mjs
// Importing record-demo.mjs does not record anything: main() only runs when the file is invoked as a script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
import {
  ALL_SHOTS,
  AUDIO_LOUDNORM,
  CAPTION_MAX_CHARS,
  END_CARD,
  END_CTA,
  HANDOFF_NOTE,
  HOOK_CARD,
  ORPHAN_MERGE_CHARS,
  TEAM_LINE,
  VERIFY_REASONS,
  assertCaptionWords,
  captionChunks,
  checkHandoffSource,
  checkHookSources,
  checkPhraseCues,
  checkTimelineNull,
  BLOCKED_NOTE_ON_SCREEN,
  honestyVariant,
  plannedMissing,
  runsCheckVerdict,
  scriptLinesMissing,
  seedRunsCheckPassed,
  verifyReasonVariant,
  zoomRemovedSentence,
} from "./record-demo.mjs";
// The status table itself (plain TypeScript with no imports, so Node loads it with type stripping).
import { statusGroups } from "../../src/views/public/howStatus.ts";

const evidence = readFileSync(join(ROOT, "kb-src", "research", "market-evidence.md"), "utf8");
const shot = (id) => ALL_SHOTS.find((s) => s.id === id);
/** Every narration line of every shot (main line, NO_AI line, variants). */
const allLines = ALL_SHOTS.flatMap((s) => [s.narration, s.narrationNoAi, ...Object.values(s.variants ?? {}).map((v) => v.narration)].filter(Boolean));
const words = (t) => t.split(/\s+/).filter(Boolean);

test("captions: no cue of 2 words or fewer when it fits into a neighbouring cue", () => {
  for (const text of allLines) {
    const cues = captionChunks(text, 0, 10);
    assertCaptionWords([{ narration: text }], cues); // nothing dropped or reordered
    cues.forEach((c, i) => {
      if (words(c.text).length > 2) return;
      const neighbour = i === 0 ? cues[1] : cues[i - 1];
      if (!neighbour) return; // a one-cue line
      assert.ok(`${neighbour.text} ${c.text}`.length > ORPHAN_MERGE_CHARS, `orphan cue "${c.text}" in: ${text}`);
    });
  }
  // The narration as it is today has no such cue at all.
  for (const text of allLines) assert.ok(captionChunks(text, 0, 10).every((c) => words(c.text).length > 2), text);
});

test("captions: a short first chunk joins the one after it", () => {
  const close = captionChunks(shot("close").narration, 0, 7.6).map((c) => c.text);
  assert.equal(close[0], "Kinwise. Records stay in your browser.");
});

test("captions: the orphans from the last render are merged", () => {
  const review = captionChunks(shot("review").narration, 0, 20).map((c) => c.text);
  assert.ok(!review.includes("after amlodipine."), review.join(" | "));
  assert.ok(review.some((c) => c.endsWith("after amlodipine.")));
  const evals = captionChunks(shot("evals").narration, 0, 11).map((c) => c.text);
  assert.ok(!evals.includes("passed."), evals.join(" | "));
});

test("captions: cues stay timed back to back across the narration", () => {
  const cues = captionChunks(shot("ask").narration, 2, 17.5);
  assert.equal(cues[0].start, 2);
  for (let i = 1; i < cues.length; i++) assert.ok(Math.abs(cues[i].start - cues[i - 1].end) < 1e-9);
  assert.ok(Math.abs(cues.at(-1).end - 19.5) < 1e-9);
});

test("captions: a short chunk is not merged when the cue would get too long", () => {
  const long = "word ".repeat(20).trim() + " end. Tail two.";
  const cues = captionChunks(long, 0, 5).map((c) => c.text);
  assert.ok(cues.every((c) => c.length <= ORPHAN_MERGE_CHARS), cues.join(" | "));
});

test("captions: every cue is one line (at most CAPTION_MAX_CHARS, or ORPHAN_MERGE_CHARS after an orphan merge)", () => {
  for (const text of allLines) {
    for (const c of captionChunks(text, 0, 10)) assert.ok(c.text.length <= ORPHAN_MERGE_CHARS, `"${c.text}" (${c.text.length})`);
  }
  // A long sentence is cut into near-even lines, not one full line and a stub.
  const review = captionChunks(shot("review").narration, 0, 20).map((c) => c.text.length);
  assert.ok(review.every((n) => n <= CAPTION_MAX_CHARS), review.join(", "));
  assert.ok(Math.min(...review) >= 30, review.join(", "));
});

test("hook: about medicine side effects not reaching the doctor, from Gandhi's percentages only", () => {
  const hook = shot("hook").narration;
  assert.match(hook, /medicine side effects/);
  assert.match(hook, /^More than a third/);
  // "linked to", no stronger than the paper's "attributed to".
  assert.match(hook, /were linked to the doctor never being told\.$/);
  // The card's headline is the spoken sentence, word for word.
  const headline = HOOK_CARD.match(/<p[^>]*font-size:58px[^>]*>([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  assert.equal(headline, hook);
  // The 19 and 51 counts behind the percentages were not re-checked (market-evidence.md), so they are not used.
  assert.doesNotMatch(hook, /\b(19|51)\b/);
  assert.doesNotThrow(() => checkHookSources(evidence));
});

test("hook source check fails when the evidence no longer supports the line", () => {
  assert.throws(() => checkHookSources(evidence.replace(/\*\*37%\*\* to the patient not telling/, "**30%** to the patient not telling")), /more than a third/);
  assert.throws(() => checkHookSources(evidence.replace(/Gandhi et al\., NEJM 2003/g, "removed")), /Gandhi/);
  assert.throws(() => checkHookSources(evidence.replace(/less than half tell their doctor/g, "removed")), /CDC/);
});

test("docs/DEMO-SCRIPT.md quotes every narration line, and every atPhrase cue is in its narration", () => {
  const missing = scriptLinesMissing(readFileSync(join(ROOT, "docs", "DEMO-SCRIPT.md"), "utf8"));
  assert.deepEqual(missing.map(([label]) => label), []);
  assert.doesNotThrow(() => checkPhraseCues());
});

test("order: the medication review comes before the timeline, Ask, brief and evaluation", () => {
  const ids = ALL_SHOTS.map((s) => s.id);
  assert.deepEqual(ids, ["hook", "who", "checkin", "heard", "overview", "review", "verify", "timeline", "ask", "brief", "evals", "honesty", "close"]);
});

test("narration: health-language rules and the end line", () => {
  for (const t of allLines) {
    // The only allowed "caused" is the app's own caveat (docs/DEMO-SCRIPT.md, wording rules).
    assert.doesNotMatch(t.replace("not what caused it", ""), /\b(caus(e|ed|es|ing)|unsafe|dangerous|stop taking|start taking|diagnos)/i, t);
    assert.doesNotMatch(t, /link below/, t);
  }
  assert.match(shot("close").narration, /at the link on screen\.$/);
  // The AI moment names the model the Ask badge shows (Qwen2.5 3B Instruct), says it drafts a short summary (not "a
  // plainer answer": the draft can leave things out), and what code checks before it is shown.
  assert.match(shot("ask").narration, /three-billion-parameter model on this laptop's GPU drafts a short summary; code checks every number and medicine name before it is shown\./);
  assert.doesNotMatch(shot("ask").narration, /plainer answer/);
});

test("first 15 seconds: the narration says what Kinwise is within the first two shots", () => {
  const [hook, who] = ALL_SHOTS;
  assert.equal(who.id, "who");
  assert.match(`${hook.narration} ${who.narration}`, /Kinwise helps families notice what changes after a medicine change, and bring one clear, sourced question to the doctor\./);
  assert.match(who.narration, /^Kinwise helps families/);
});

test("heard: the confirm line is shown with a click, and its captions stay at the bottom", () => {
  assert.match(shot("heard").narration, /Margaret confirms each answer\.$/);
  assert.equal(shot("heard").captionsPinned, true);
});

test("hand-off note: one device or a backup file today, family sharing planned, as the status table says", () => {
  assert.equal(shot("overview").note, HANDOFF_NOTE);
  assert.match(HANDOFF_NOTE, /one device, or a backup file; family sharing is planned/);
  const src = readFileSync(join(ROOT, "src", "views", "public", "howStatus.ts"), "utf8");
  assert.doesNotThrow(() => checkHandoffSource(src));
  assert.throws(() => checkHandoffSource(src.replace("one shared browser today, or a backup file", "synced across devices")), /hand-off/);
  assert.throws(() => checkHandoffSource(src.replace("Encrypted family sharing", "Encrypted sync")), /family sharing/);
});

test("timeline: multiplicity from the null study and the runs-check clause only when it holds", () => {
  const { runs, plain } = shot("timeline").variants;
  for (const v of [runs, plain]) {
    assert.match(v.narration, /Fisher's exact test, p = 0\.0023/);
    assert.match(v.narration, /With nine items compared, more than one in ten medicine changes with no real effect still get flagged, so it stays a question\./);
  }
  assert.match(runs.narration, /it still holds when whole runs of days are shuffled/);
  assert.doesNotMatch(plain.narration, /runs of days/);
  // "more than one in ten" is the independent-days rate in eval/results/timeline-null.json.
  const nullStudy = JSON.parse(readFileSync(join(ROOT, "eval", "results", "timeline-null.json"), "utf8"));
  assert.ok(nullStudy.independent.moderateRate > 0.1);
  assert.doesNotThrow(() => checkTimelineNull());
  assert.throws(() => checkTimelineNull(0.1), /more than one in ten/);
  assert.throws(() => checkTimelineNull(null), /moderateRate/);
  // The seed test still pins dizziness runsCheck.passed = true (the fallback when the Timeline row does not show it).
  const seed = readFileSync(join(ROOT, "src", "engine", "timeline", "seed.timeline.test.ts"), "utf8");
  assert.equal(seedRunsCheckPassed(seed), true);
  assert.equal(seedRunsCheckPassed(seed.replace(/(runs\.dizziness\)\.toEqual\(\{[^}]*)passed: true/, "$1passed: false")), false);
});

test("timeline: the runs check on screen holds only below the bar of the row's own size word", () => {
  const row = (size, runs) => `Dizziness worse Before 2 of 19 days After 9 of 14 days ${size} (Fisher's exact test, p = 0.0023${runs})`;
  assert.deepEqual(runsCheckVerdict(row("Large difference", "")), { onScreen: false, holds: false });
  const long = " · runs check (4-day runs shuffled 999 times): p = 0.007";
  assert.deepEqual(runsCheckVerdict(row("Large difference", long)), { onScreen: true, holds: true, p: 0.007, bar: 0.01 });
  assert.equal(runsCheckVerdict(row("Large difference", " · runs check p = 0.011")).holds, false); // drowsiness-like
  assert.equal(runsCheckVerdict(row("Clear difference", " · runs check p = 0.011")).holds, true);
  assert.equal(runsCheckVerdict(row("Large difference", " · runs check p < 0.001")).holds, true);
  assert.equal(runsCheckVerdict(row("Not flagged", " · runs check p = 0.001")).holds, false); // unknown size word
  assert.equal(runsCheckVerdict(row("Large difference", " · runs check: not computed")).holds, false);
});

test("verify: every 'What the check removed' line names a reason the app can show, and unknown reasons fail closed", () => {
  const tasks = readFileSync(join(ROOT, "src", "ai", "tasks.ts"), "utf8");
  const body = tasks.slice(tasks.indexOf("export function plainIssue"), tasks.indexOf("/** A host-side edit"));
  const shown = [...body.matchAll(/return [`"]([^`"]+)[`"]/g)].map((m) => `Reason: ${m[1]}`);
  for (const r of VERIFY_REASONS) {
    assert.ok(shot("verify").variants[r.variant].narration === r.narration, r.variant);
    assert.match(r.narration, /^The safety net: code checked the model's wording and removed a sentence /);
    if (r.variant === "removedBlocked") continue; // "Blocked: …" comes from reasonLine (CheckRemoved.tsx)
    assert.ok(shown.some((line) => r.reason.test(line)), `${r.variant}: no plainIssue wording matches ${r.reason}`);
  }
  assert.equal(verifyReasonVariant("Reason: has a number that is not in the records it cites"), "removedNumber");
  assert.equal(verifyReasonVariant('Reason: names a medicine that is not on the list ("warfarin")'), "removedMedicine");
  // The review card's own wording (CheckRemoved.tsx cardIssue), which is where the verify shot reads it.
  assert.equal(verifyReasonVariant('Reason: names a medicine this finding is not about ("lorazepam")'), "removedMedicine");
  assert.equal(verifyReasonVariant('Reason: names a condition the finding or its reference text do not mention ("gout")'), "removedCondition");
  assert.equal(verifyReasonVariant("Reason: has a count that does not match the finding or its reference text"), "removedCount");
  assert.equal(verifyReasonVariant("Blocked: names a medicine together with an action word (\"pause\")"), "removedBlocked");
  assert.equal(verifyReasonVariant("Reason: repeats an earlier sentence"), null);
  assert.equal(verifyReasonVariant(""), null);
});

test("verify: only the first of several reasons picks the line, as the viewer reads it", () => {
  // reasonLine (CheckRemoved.tsx) joins reasons with "; ": the medicine comes first here, so the medicine line is
  // spoken, although removedNumber comes earlier in VERIFY_REASONS.
  assert.equal(
    verifyReasonVariant('Reason: names a medicine that is not on the list ("warfarin"); has a number that is not in the records it cites'),
    "removedMedicine",
  );
  assert.equal(verifyReasonVariant("Reason: repeats an earlier sentence; has a number that is not in the records it cites"), null);
  // A "Blocked:" line's first reason is the blocked wording, whatever follows it.
  assert.equal(verifyReasonVariant('Blocked: names a medicine together with an action word ("pause"); has a number that is not in the records it cites'), "removedBlocked");
});

test("verify: a removed sentence is zoomed only when it is neutral; blocked or advice-like text never is", () => {
  assert.equal(zoomRemovedSentence("removedBlocked", "Dizziness was recorded on 11 of 14 answered days."), false);
  assert.equal(zoomRemovedSentence("removedNumber", "You could pause the lorazepam."), false);
  assert.equal(zoomRemovedSentence("removedMedicine", "This caused her dizziness."), false);
  assert.equal(zoomRemovedSentence("removedCount", "Is it safe to keep taking it?"), false);
  assert.equal(zoomRemovedSentence("removedMedicine", "Ask whether to switch to warfarin."), false);
  assert.equal(zoomRemovedSentence("removedNumber", ""), false);
  assert.equal(zoomRemovedSentence("removedNumber", "Dizziness was recorded on 11 of 14 answered days."), true);
  assert.equal(zoomRemovedSentence("removedCount", "Near-falls were recorded on 3 of 14 answered days."), true);
});

test("honesty: names only what the video showed as working, and the status table on screen fits the model line", () => {
  for (const v of Object.values(shot("honesty").variants)) {
    assert.doesNotMatch(v.narration, /everything you saw/);
    assert.match(v.narration, /^Working today: the check-in, timeline, review, Ask and brief you saw\./);
    assert.match(v.narration, /no dose, allergy or full interaction checks yet\./);
  }
  // The rows as How it works renders them: one row per status, "badge item detail item detail …".
  const groups = statusGroups({ drugs: 120, beersRules: 80 });
  const rowText = (status, badge) =>
    [badge, ...groups.find((g) => g.status === status).items.flatMap((i) => [i.item, i.detail ?? ""])].join(" ");
  const working = rowText("working", "Working in this demo");
  const partial = rowText("partial", "Partial");
  assert.equal(honestyVariant(working, partial), "model");
  // The spoken planned items are in the Planned row, and only there.
  const planned = rowText("planned", "Planned");
  assert.deepEqual(plannedMissing(planned), []);
  assert.deepEqual(plannedMissing(planned.replace("Encrypted family sharing", "")), ["family sharing"]);
  assert.deepEqual(plannedMissing(partial), ["validation study", "pharmacy import", "family sharing"]);
  // It still needs "no dose or allergy checks", the interaction limit and the five working items on screen.
  assert.equal(honestyVariant(working, partial.replace("no dose or allergy checks", "dose checks")), null);
  assert.equal(honestyVariant(working, partial.replace(/interactions limited to[^)]*\)/, "")), null);
  assert.equal(honestyVariant(working.replace("Ask Kinwise", "Ask"), partial), null);
  assert.equal(honestyVariant(working, partial.replace("the code check is not airtight; ", "")), null);
  // Without the model row, the knowledge-base line; the timeline runs check and other Partial items are tolerated.
  const noModel = partial.replace(/On-device language model.*?Apache-2\.0 models in Settings\)/, "");
  assert.match(partial, /Timeline runs check/);
  assert.equal(honestyVariant(working, noModel), "kb");
});

test("end card: one call to action, the same as DEVPOST, with the live link, the branch link and the team", () => {
  assert.equal(END_CTA, "Take the 2-minute guided tour");
  assert.equal(END_CARD.split(END_CTA).length - 1, 1);
  assert.doesNotMatch(END_CARD, /Try as Alex|Try it now/);
  assert.match(END_CARD, /albertzorzolan\.github\.io\/UnivaBioBabson/);
  assert.match(END_CARD, /github\.com\/albertzorzolan\/UnivaBioBabson\/tree\/medwatch-v2/);
  assert.equal(TEAM_LINE, "Albert Zorzolan and Neil Shah, Babson College");
  assert.ok(END_CARD.includes(TEAM_LINE));
  const devpost = readFileSync(join(ROOT, "submission", "DEVPOST.md"), "utf8");
  assert.ok(devpost.includes(`**${END_CTA}**`), "DEVPOST's Try it line names the same call to action");
});

test("audio: the mix is loudness-normalised", () => {
  assert.equal(AUDIO_LOUDNORM, "loudnorm=I=-16:TP=-1.5");
});

test("verify: the blocked-note pattern matches the review card's current note (FindingCard.tsx BLOCKED_NOTE)", () => {
  const src = readFileSync(join(ROOT, "src", "views", "caregiver", "meds", "FindingCard.tsx"), "utf8");
  const note = /export const BLOCKED_NOTE = "([^"]+)"/.exec(src)?.[1];
  assert.ok(note, "BLOCKED_NOTE not found in FindingCard.tsx");
  assert.match(note, BLOCKED_NOTE_ON_SCREEN);
});
