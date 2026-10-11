import { describe, expect, it } from "vitest";
import { layoutStory, type StoryMark } from "./highlight";

const m = (start: number, end: number, kind: StoryMark["kind"], label: string, key = label): StoryMark => ({ start, end, kind, label, key });

describe("layoutStory", () => {
  it("splits text around marks and keeps every character", () => {
    const story = "Felt woozy, no falls.";
    const segs = layoutStory(story, [m(5, 10, "yes", "Dizzy"), m(12, 20, "no", "No fall")]);
    expect(segs.map((s) => s.text).join("")).toBe(story);
    expect(segs.filter((s) => s.type === "mark").map((s) => s.text)).toEqual(["woozy", "no falls"]);
  });

  it("merges nested or overlapping marks, most important first", () => {
    const story = "I was quite dizzy today";
    const segs = layoutStory(story, [m(12, 17, "yes", "Dizzy", "p:dizziness"), m(6, 17, "value", "How strong", "p:dizzinessSeverity")]);
    const mark = segs.find((s) => s.type === "mark");
    expect(mark).toMatchObject({ text: "quite dizzy", kind: "yes", labels: ["Dizzy", "How strong"] });
    expect(mark && mark.type === "mark" ? mark.keys.sort() : []).toEqual(["p:dizziness", "p:dizzinessSeverity"]);
  });

  it("ignores spans outside the story", () => {
    expect(layoutStory("abc", [m(2, 9, "yes", "x"), m(-1, 1, "yes", "y")])).toEqual([{ type: "text", text: "abc" }]);
  });
});
