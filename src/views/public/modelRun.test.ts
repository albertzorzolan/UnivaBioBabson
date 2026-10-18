// How it works › "See a real model run": everything the panel shows must come from eval/results/ai-live.json,
// quoted as recorded. Labels are ours; quotes, timings, the date, the model and the machine are the file's.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { RECORDED_RUN, RED_TEAM, readRedTeam, redTeamSentence } from "./modelRun";

const raw = readFileSync(new URL("../../../eval/results/ai-live.json", import.meta.url), "utf8");
const file = JSON.parse(raw);
const strings: string[] = [];
(function collect(v: unknown) {
  if (typeof v === "string") strings.push(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === "object") Object.values(v).forEach(collect);
})(file);
/** A quote is genuine when it is (part of) a string recorded in the file. */
const recorded = (q: string) => strings.some((s) => s.includes(q));

describe("recorded model run", () => {
  it("dates the run and names the model and machine from the file", () => {
    expect(RECORDED_RUN.date).toBe(file.generatedAt);
    expect(RECORDED_RUN.dateLabel).toBe("Oct 11, 2026");
    expect(file.model.startsWith(RECORDED_RUN.model)).toBe(true);
    expect(RECORDED_RUN.machine).toContain(file.machine.cpu);
    expect(RECORDED_RUN.machine).toContain(`${file.machine.memoryGB} GB`);
    expect(RECORDED_RUN.externalRequests).toBe(file.externalRequests.length);
  });

  it("shows one Ask answer that passed the check and one that was blocked, and counts the routed ones", () => {
    const { passed, blocked } = RECORDED_RUN.ask;
    expect(passed.status).toBe("done");
    expect(blocked.status).toBe("failed");
    for (const a of [passed, blocked]) {
      expect(file.ask.some((x: { q: string }) => x.q === a.question)).toBe(true);
      for (const line of a.lines) expect(recorded(line), line).toBe(true);
    }
    const routed = file.ask.filter((x: { aiStatus: string }) => /routed out of scope/.test(x.aiStatus));
    expect(RECORDED_RUN.routedOutOfScope).toBe(routed.length);
    expect(RECORDED_RUN.routedOutOfScope).toBeGreaterThan(0);
  });

  it("quotes the brief, the blocked explanation and every flawed output verbatim", () => {
    const { brief, blockedExplain, flawed } = RECORDED_RUN;
    expect(recorded(brief.notice)).toBe(true);
    expect(brief.evidenceChips).toBe(file.brief.evidenceChips);
    expect(recorded(blockedExplain.finding)).toBe(true);
    expect(recorded(blockedExplain.message)).toBe(true);
    expect(blockedExplain.message).toMatch(/didn.t pass the source check/);
    expect(flawed).toHaveLength(3);
    for (const f of flawed) expect(recorded(f.quote), f.quote).toBe(true);
    expect(RECORDED_RUN.verdict).toBe(file.verdict);
  });

  it("includes the explanation the guard flagged for “cause” among the flawed outputs", () => {
    const flagged = file.explain.find((e: { forbidden: string[] }) => e.forbidden.length > 0);
    expect(RECORDED_RUN.flawed.some((f) => flagged.ai.includes(f.quote))).toBe(true);
  });

  it("says plainly that the “can cause” explanation also floated replacing medicines, which the check missed in that run", () => {
    const cause = RECORDED_RUN.flawed.find((f) => /can cause/.test(f.where))!;
    expect(cause.quote).toMatch(/replace some with medicines/);
    expect(cause.where).toMatch(/floated replacing medicines, which the code check did not catch in this run/);
  });
});

describe("claim-checker red team line", () => {
  it("quotes eval/results/verifier-redteam.json when it exists, and is absent otherwise", () => {
    const url = new URL("../../../eval/results/verifier-redteam.json", import.meta.url);
    if (!existsSync(url)) {
      expect(RED_TEAM).toBeNull();
      return;
    }
    const r = JSON.parse(readFileSync(url, "utf8"));
    expect(RED_TEAM).toMatchObject({ harmfulTotal: r.harmfulTotal, caught: r.caught, validTotal: r.validTotal, falseRejects: r.falseRejects });
  });

  it("refuses a malformed file instead of showing a partial number", () => {
    expect(readRedTeam(undefined)).toBeNull();
    expect(readRedTeam({ harmfulTotal: 10, caught: "7", validTotal: 5, falseRejects: 0 })).toBeNull();
  });

  const base = { harmfulTotal: 10, caught: 10, validTotal: 5, falseRejects: 0 };

  it("reads the pre-hardening score and the post-fix probe when present, null when absent or malformed", () => {
    const full = readRedTeam({ ...base, before: { caught: 4, harmfulTotal: 10 }, postFixProbe: { total: 6, caught: 2 } });
    expect(full?.before).toEqual({ caught: 4, harmfulTotal: 10 });
    expect(full?.postFixProbe).toEqual({ total: 6, caught: 2, heldOut: true });
    expect(readRedTeam({ ...base, postFixProbe: { total: 6, caught: 2, heldOut: false } })?.postFixProbe?.heldOut).toBe(false);
    const p2 = readRedTeam({ ...base, postFixProbe2: { total: 20, caught: 12, validTotal: 10, falseRejects: 0 } });
    expect(p2?.postFixProbe2).toEqual({ total: 20, caught: 12, validTotal: 10, falseRejects: 0 });
    const bare = readRedTeam(base);
    expect(bare?.before).toBeNull();
    expect(bare?.postFixProbe).toBeNull();
    expect(bare?.postFixProbe2).toBeNull();
    expect(readRedTeam({ ...base, postFixProbe: { total: "6", caught: 2 } })?.postFixProbe).toBeNull();
  });

  it("calls the score a regression test and always quotes the post-fix probe next to it", () => {
    const s = redTeamSentence(readRedTeam({ ...base, before: { caught: 4, harmfulTotal: 10 }, postFixProbe: { total: 6, caught: 2 } }));
    expect(s).toMatch(/hardened against/);
    expect(s).toMatch(/catches 10 of 10 of those sentences \(up from 4 before\)/);
    expect(s).toMatch(/wrongly rejects 0 of 5 valid ones/);
    expect(s).toMatch(/regression test, not proof the checker is airtight/);
    expect(s).toMatch(/6 paraphrases written after the fixes.*caught only 2/);
    expect(s).toMatch(/not clinician-reviewed/);
  });

  it("leaves the line out when the file has no post-fix probe, and drops “up from” when there is no before score", () => {
    expect(redTeamSentence(readRedTeam(base))).toBeNull();
    expect(redTeamSentence(null)).toBeNull();
    const s = redTeamSentence(readRedTeam({ ...base, postFixProbe: { total: 6, caught: 2 } }));
    expect(s).not.toMatch(/up from/);
    expect(s).toMatch(/caught only 2/);
  });

  it("never calls a probe the file marks as tuned on (heldOut: false) held out, and prefers the second probe", () => {
    const tuned = { ...base, postFixProbe: { total: 18, caught: 1, heldOut: false } };
    expect(redTeamSentence(readRedTeam(tuned))).toBeNull();
    const s = redTeamSentence(readRedTeam({ ...tuned, postFixProbe2: { total: 20, caught: 12, validTotal: 10, falseRejects: 0 } }));
    expect(s).not.toMatch(/never used for tuning/);
    expect(s).not.toMatch(/18 paraphrases/);
    expect(s).toMatch(/further 20 paraphrases written after the latest rules and not used to change any rule, it caught 12/);
    expect(s).toMatch(/wrongly rejected 0 of 10 valid sentences/);
  });

  it("the page's summary of the real file includes the post-fix probe whenever the file has one", () => {
    const url = new URL("../../../eval/results/verifier-redteam.json", import.meta.url);
    if (!existsSync(url)) return;
    const r = JSON.parse(readFileSync(url, "utf8"));
    const s = redTeamSentence(RED_TEAM);
    if (typeof r.before?.caught === "number" && s) expect(s).toContain(`up from ${r.before.caught} before`);
    if (r.postFixProbe?.heldOut === false) expect(s ?? "").not.toMatch(/never used for tuning/);
    if (typeof r.postFixProbe2?.total === "number") {
      expect(s).toContain(`further ${r.postFixProbe2.total} paraphrases`);
      expect(s).toContain(`it caught ${r.postFixProbe2.caught}`);
      return;
    }
    if (typeof r.postFixProbe?.total !== "number" || r.postFixProbe.heldOut === false) {
      expect(s).toBeNull();
      return;
    }
    expect(s).toContain(`${r.postFixProbe.total} paraphrases`);
    expect(s).toContain(`caught only ${r.postFixProbe.caught}`);
  });
});
