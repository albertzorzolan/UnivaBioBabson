// How it works › Finished vs planned: the canonical Working / Partial / Planned table (same split as README.md and
// submission/DEVPOST.md) and the limitations list, including the verifier gap from the recorded live run.
import { describe, expect, it } from "vitest";
import { LIMITATIONS, statusGroups, VERIFIER_GAP_LIMITATION } from "./howStatus";
import { RECORDED_RUN } from "./modelRun";

const groups = statusGroups({ drugs: 427, beersRules: 89 });
const items = (s: string) => groups.find((g) => g.status === s)!.items.map((i) => `${i.item} ${i.detail ?? ""}`).join(" | ");
const plain = (s: string) => s.replace(/[’‘]/g, "'");

describe("finished vs planned", () => {
  it("has exactly one group per status, in reading order", () => {
    expect(groups.map((g) => g.status)).toEqual(["working", "partial", "planned"]);
    for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
  });

  it("marks the public live demo as working", () => {
    expect(items("working")).toMatch(/Public live demo/);
  });

  it("marks the language model, knowledge-base coverage and the hand-off as partial", () => {
    const partial = items("partial");
    expect(partial).toMatch(/On-device language model/);
    expect(partial).toMatch(/Knowledge-base coverage/);
    expect(partial).toMatch(/Patient-to-caregiver hand-off/);
    // None of them may also be claimed as working.
    expect(items("working")).not.toMatch(/language model|Knowledge-base coverage|hand-off/i);
  });

  it("counts the knowledge base from the coverage it is given", () => {
    expect(items("partial")).toMatch(/427 medicines and 89 Beers rules/);
  });

  it("keeps family sharing and validation planned", () => {
    const planned = items("planned");
    expect(planned).toMatch(/family sharing/i);
    expect(planned).toMatch(/validation pilot/i);
  });

  it("lists the verifier gap from the recorded live run among the limitations", () => {
    expect(plain(VERIFIER_GAP_LIMITATION)).toBe(
      "In our recorded live run the code check let at least 6 flawed AI sentences (from 5 outputs) through; AI text is always labelled, the template stays the default, and nothing reaches the brief without the caregiver's review.",
    );
    expect(LIMITATIONS).toContain(VERIFIER_GAP_LIMITATION);
  });

  it("matches the recorded-run panel's own count of flawed sentences and outputs", () => {
    const outputs = new Set(RECORDED_RUN.flawed.map((f) => f.output));
    expect(VERIFIER_GAP_LIMITATION).toContain(`at least ${RECORDED_RUN.flawed.length} flawed AI sentences (from ${outputs.size} outputs)`);
  });

  it("says who wrote the benchmarks: separate AI agents directed by the team, not clinicians", () => {
    const line = LIMITATIONS.find((l) => /benchmarks/.test(l))!;
    expect(line).toMatch(/written by separate AI agents directed by the team; not clinician-reviewed/);
    expect(line).not.toMatch(/written by the team \(/);
  });

  it("never claims what the product must not", () => {
    const all = [...groups.flatMap((g) => g.items.map((i) => `${i.item} ${i.detail ?? ""}`)), ...LIMITATIONS].join(" ");
    expect(all).not.toMatch(/\bsafe\b|dangerous|diagnos(es|ing)\b|FDA[- ]cleared|HIPAA[- ]compliant/i);
  });
});
