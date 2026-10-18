// Unit tests for scripts/submission/screenshots.mjs (pure logic, no dev server or browser) and for the Devpost gallery
// comment it feeds:
//   node --test scripts/submission/screenshots.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
import { GALLERY_ORDER, PATIENT_STORY, galleryProblems, overviewProblems, taglineFromDevpost, thumbnailHtml } from "./screenshots.mjs";

const DEVPOSTS = ["submission/DEVPOST.md", "submission/DEVPOST-if-not-pushed.md"];
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** Visible Overview text in the shape the current app renders (fictional demo record). */
const OVERVIEW_OK =
  "What Kinwise noticed\nDizziness and daytime drowsiness recorded more often since Lorazepam (Ativan) started on Oct 2\n" +
  "Before vs after · answered days only\nDizziness\nLarge difference\nBefore\n2 of 19 days\nAfter\n9 of 14 days\n" +
  "Shows a change in what was recorded, not what caused it.";

test("overviewProblems: passes the current Overview and names each missing piece", () => {
  assert.deepEqual(overviewProblems(OVERVIEW_OK), []);
  // The retired badge fails, even next to everything else.
  assert.match(overviewProblems(`${OVERVIEW_OK}\nPattern strength: strong`).join("\n"), /Pattern strength/);
  assert.match(overviewProblems(OVERVIEW_OK.replace("Large difference", "Clear difference")).join("\n"), /Large difference/);
  assert.match(overviewProblems(OVERVIEW_OK.replace("9 of 14", "8 of 14")).join("\n"), /9 of 14/);
  assert.match(overviewProblems(OVERVIEW_OK.replace("2 of 19", "2 of 20")).join("\n"), /2 of 19/);
  assert.match(overviewProblems(OVERVIEW_OK.replace("not what caused it", "nothing else")).join("\n"), /not what caused it/);
  // "19 of 140" must not pass for "9 of 14".
  assert.match(overviewProblems(OVERVIEW_OK.replace("9 of 14", "19 of 140")).join("\n"), /9 of 14/);
});

test("galleryProblems: only the retired badge is a problem on the other screens", () => {
  assert.deepEqual(galleryProblems("Timeline", "Large difference (Fisher's exact test, p = 0.0023)"), []);
  assert.equal(galleryProblems("Timeline", "pattern strength: moderate").length, 1);
});

test("taglineFromDevpost: reads the Elevator pitch paragraph; both Devpost texts share it", () => {
  assert.equal(taglineFromDevpost("# K\n\n## Elevator pitch (Devpost tagline)\n\nOne line.\n\n## About\n"), "One line.");
  assert.throws(() => taglineFromDevpost("# K\n\n## About\n\ntext\n"), /Elevator pitch/);
  const taglines = DEVPOSTS.map((p) => taglineFromDevpost(read(p)));
  assert.ok(taglines[0].length > 40, taglines[0]);
  assert.equal(taglines[1], taglines[0]);
});

test("thumbnailHtml: escapes the tagline, keeps the app's chip and uses only app tokens", () => {
  const { css, html } = thumbnailHtml({
    tagline: 'Notice <what> & "why"',
    logoHtml: '<span class="ui-logo">Kinwise</span>',
    chipHtml: '<button class="ui-demo-chip__trigger"><span>Fictional demo data</span></button>',
    cardSrc: "data:image/png;base64,AAAA",
  });
  assert.ok(html.includes("Notice &lt;what&gt; &amp; &quot;why&quot;"));
  assert.ok(html.includes("Fictional demo data"));
  assert.ok(html.includes('src="data:image/png;base64,AAAA"'));
  // Colours and fonts come from the app's tokens (var(--…)), never hard-coded hex values or other font families.
  assert.doesNotMatch(css, /(color|background|border)[^;{]*(#[0-9a-f]{3,8}\b|rgb\()/i);
  assert.doesNotMatch(css, /font-family:(?!\s*var\()/);
  assert.match(css, /width: 1500px; height: 1000px/);
});

test("PATIENT_STORY: fictional words that show each kind of highlight", () => {
  for (const words of ["woozy", "nearly went over", "Slept badly", "fell off her bike", "water pill"]) assert.ok(PATIENT_STORY.includes(words), words);
});

test("Devpost gallery comment: the thumbnail first, then every regenerated screen once, each file present", () => {
  for (const rel of DEVPOSTS) {
    const md = read(rel);
    const start = md.lastIndexOf("<!--\nGallery");
    assert.ok(start > 0, `${rel}: no gallery comment`);
    const block = md.slice(start, md.indexOf("-->", start));
    const listed = [...block.matchAll(/^\d+\. docs\/screenshots\/(\S+\.png) - (.+)$/gm)];
    assert.deepEqual(listed.map((m) => m[1]), GALLERY_ORDER, `${rel}: gallery order`);
    assert.equal(listed[0][1], "00-thumbnail.png");
    for (const [, file, caption] of listed) {
      assert.ok(existsSync(join(ROOT, "docs", "screenshots", file)), `${rel}: docs/screenshots/${file} is missing`);
      assert.ok(caption.length > 20, `${rel}: caption for ${file} is too short`);
      assert.doesNotMatch(caption, /Pattern strength|caus(e|ed|es) (the|her)|safe|dangerous/i, `${rel}: caption for ${file}`);
    }
  }
});

test("make-pdfs: --only=screens exists and the default run includes the screenshots", () => {
  const src = read("scripts/submission/make-pdfs.mjs");
  assert.match(src, /"onepager,brief,code,screens"/);
  assert.match(src, /ONLY\.has\("screens"\)/);
  assert.match(src, /captureGallery\(/);
});
