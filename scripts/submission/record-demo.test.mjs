// Unit tests for the demo recorder's pure logic (no browser, no dev server, no `say`):
//   node --test scripts/submission/record-demo.test.mjs
// Importing record-demo.mjs does not record anything: main() only runs when the file is invoked as a script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
import { ALL_SHOTS, AUDIO_LOUDNORM, assertCaptionWords, captionChunks, checkHookSources, checkPhraseCues, scriptLinesMissing } from "./record-demo.mjs";

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
      assert.ok(`${neighbour.text} ${c.text}`.length > 90, `orphan cue "${c.text}" in: ${text}`);
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
  assert.ok(cues.every((c) => c.length <= 90), cues.join(" | "));
});

test("hook: about medicine side effects not reaching the doctor, from Gandhi's percentages only", () => {
  const hook = shot("hook").narration;
  assert.match(hook, /medicine side effects/);
  assert.match(hook, /more than a third/);
  assert.match(hook, /doctor was never told/);
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
  // The AI moment names the model the Ask badge shows (Qwen2.5 3B Instruct) and what code checks.
  assert.match(shot("ask").narration, /3-billion-parameter model .* code checks every number and medicine name first/);
});

test("audio: the mix is loudness-normalised", () => {
  assert.equal(AUDIO_LOUDNORM, "loudnorm=I=-16:TP=-1.5");
});
