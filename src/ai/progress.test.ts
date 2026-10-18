import { describe, expect, it } from "vitest";
import { LOAD_START, trackLoad, type LoadTracker } from "./progress";

// Report texts below are WebLLM 0.2.85's own strings (node_modules/@mlc-ai/web-llm/lib/index.js).
const fetching = (p: number) => ({ progress: p, text: `Fetching param cache[3/40]: 500MB fetched. ${Math.floor(p * 100)}% completed, 20 secs elapsed.` });
const fromCache = (p: number) => ({ progress: p, text: `Loading model from cache[3/40]: 120MB loaded. ${Math.floor(p * 100)}% completed, 4 secs elapsed.` });
const shaders = (p: number) => ({ progress: p, text: `Loading GPU shader modules[10/80]: ${Math.floor(p * 100)}% completed, 2 secs elapsed.` });

function run(reports: { progress: number; text: string }[]): LoadTracker[] {
  const out: LoadTracker[] = [];
  let t = LOAD_START;
  for (const r of reports) out.push((t = trackLoad(t, r)));
  return out;
}

describe("trackLoad (labelled load phases)", () => {
  it("starts with no phase until WebLLM reports one", () => {
    const [t] = run([{ progress: 0, text: "Start to fetch params" }]);
    expect(t.phase).toBeNull();
    expect(t.overall).toBe(0);
  });

  it("labels the download, then the graphics-card preparation", () => {
    const ts = run([fetching(0.5), fetching(0.97), fromCache(0.1), shaders(0.5), { progress: 1, text: "Finish loading on WebGPU - apple" }]);
    expect(ts.map((t) => t.phase)).toEqual(["download", "download", "prepare", "prepare", "prepare"]);
    expect(ts[1].phaseProgress).toBeCloseTo(0.97);
    expect(ts[4].phaseProgress).toBe(1);
    expect(ts[4].overall).toBe(1);
  });

  it("never moves backwards within a phase or overall (the old bar jumped from 97% to 87%)", () => {
    const ts = run([fetching(0.4), fetching(0.97), fromCache(0), fromCache(0.6), shaders(0), shaders(0.3), fetching(0.2), fromCache(0.1), shaders(1)]);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i].overall).toBeGreaterThanOrEqual(ts[i - 1].overall);
      if (ts[i].phase === ts[i - 1].phase) expect(ts[i].phaseProgress).toBeGreaterThanOrEqual(ts[i - 1].phaseProgress);
    }
    // A late download report does not send the label back to "downloading".
    expect(ts[6].phase).toBe("prepare");
  });

  it("goes straight to preparation when the files are already cached", () => {
    const ts = run([{ progress: 0, text: "Start to fetch params" }, fromCache(0.5), shaders(1)]);
    expect(ts[1].phase).toBe("prepare");
    expect(ts[1].overall).toBeGreaterThan(0);
    expect(ts[2].overall).toBe(1);
  });

  it("keeps the current state for texts it does not recognise", () => {
    const ts = run([fetching(0.3), { progress: 0.01, text: "something new in a later WebLLM" }]);
    expect(ts[1]).toEqual(ts[0]);
  });
});
