// How it works › "See a real model run (recorded, not live)".
//
// Most judges' browsers cannot run the optional on-device model (it needs WebGPU and a 1.7 GB download), so
// this panel shows one real run instead, read from the committed log eval/results/ai-live.json. Nothing here
// is computed or reworded: the date, model, machine, timings and every quoted sentence are the file's. Only the
// labels ("Ask Kinwise", "Flawed output we let through") are ours. Named imports keep the bundle to these fields.
import { ask, brief, explain, externalRequests, generatedAt, machine, model, patientRefine, verdict } from "../../../eval/results/ai-live.json";

export interface RecordedAsk {
  question: string;
  /** aiStatus as recorded: "done", "failed", "none (routed out of scope)"… */
  status: string;
  /** The AI panel's text lines as recorded (empty when no AI ran). */
  lines: string[];
}

export interface RecordedRun {
  date: string;
  dateLabel: string;
  /** Model id, e.g. Qwen2.5-3B-Instruct-q4f16_1-MLC. */
  model: string;
  machine: string;
  externalRequests: number;
  ask: { passed: RecordedAsk; blocked: RecordedAsk };
  /**
   * Questions the app routed to the clinician without running the AI. Counted, not quoted: their wording ("stop
   * taking…", "…causing the falls") is exactly what the page's language rules keep off screen.
   */
  routedOutOfScope: number;
  brief: { notice: string; evidenceChips: number; reasonSentence: string };
  blockedExplain: { finding: string; message: string };
  /** The flawed outputs the verdict names, each with the text the app showed. */
  flawed: { where: string; quote: string }[];
  verdict: string;
}

function askFor(match: (q: (typeof ask)[number]) => boolean): RecordedAsk {
  const a = ask.find(match) ?? ask[0];
  return { question: a.q, status: a.aiStatus, lines: a.aiText ?? [] };
}

/** "2026-10-11" → "Oct 11, 2026" without time-zone drift (the date is a calendar day, not an instant). */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// The verdict names three flawed outputs; these are the texts the app showed for each.
const causeExplain = explain.find((e) => e.forbidden.length > 0);
const sleptSuggestion = patientRefine.flatMap((p) => p.aiSuggestions).find((s) => /Slept like a log/.test(s));
const blocked = explain.find((e) => e.ai.some((t) => /didn.t pass the source check/.test(t)));

export const RECORDED_RUN: RecordedRun = {
  date: generatedAt,
  dateLabel: dayLabel(generatedAt),
  model: model.split(" (")[0],
  machine: `${machine.cpu}, ${machine.memoryGB} GB memory`,
  externalRequests: externalRequests.length,
  ask: {
    passed: askFor((a) => a.aiStatus === "done" && /near-falls/.test(a.q)),
    blocked: askFor((a) => a.aiStatus === "failed"),
  },
  routedOutOfScope: ask.filter((a) => /routed out of scope/.test(a.aiStatus)).length,
  brief: { notice: brief.notice.split("\n\n").pop() ?? brief.notice, evidenceChips: brief.evidenceChips, reasonSentence: brief.aiReasonSentence },
  blockedExplain: { finding: blocked?.finding ?? "", message: blocked?.ai[0] ?? "" },
  flawed: [
    { where: "Visit brief, “Why we’re coming in” (garbled)", quote: brief.aiReasonSentence },
    {
      where: "Check-in suggestion: dizziness marked Yes, quoted from these words",
      quote: sleptSuggestion?.match(/Slept like a log[^\n]*/)?.[0] ?? "",
    },
    {
      where: "Explanation using “can cause” (it also floated replacing medicines, which the code check did not catch in this run)",
      quote: causeExplain?.ai.find((t) => /can cause/.test(t)) ?? "",
    },
  ],
  verdict,
};

// ---------------------------------------------------------------------------------------------
// Optional: the claim-checker red team (npm test runs eval/verifier.eval.test.ts, which writes this file). Read
// through import.meta.glob so the page builds whether or not the results file exists in this checkout.

export interface RedTeamSummary {
  generatedAt: string;
  author: string;
  harmfulTotal: number;
  caught: number;
  validTotal: number;
  falseRejects: number;
  /** The same set run on the checks as submitted, before they were hardened against it (null when absent). */
  before: { caught: number; harmfulTotal: number } | null;
  /**
   * The first post-fix probe (null when absent). `heldOut` is false once the file says its items were in view when
   * later rules were written; it is then never described as held out.
   */
  postFixProbe: { total: number; caught: number; heldOut: boolean } | null;
  /** The second probe, written after the latest rules and not used to change any rule (null when absent). */
  postFixProbe2: { total: number; caught: number; validTotal: number | null; falseRejects: number | null } | null;
}

const redTeamFiles = import.meta.glob<Record<string, unknown>>("../../../eval/results/verifier-redteam.json", { eager: true, import: "default" });

/** Reads the named number fields of an object, or null when it is missing or any field is not a number. */
function numbers<K extends string>(x: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!keys.every((k) => typeof o[k] === "number")) return null;
  return Object.fromEntries(keys.map((k) => [k, o[k]])) as Record<K, number>;
}

/** Null when the file is missing or a headline field is not a number: the page then leaves the line out. */
export function readRedTeam(x: Record<string, unknown> | undefined): RedTeamSummary | null {
  const head = numbers(x, ["harmfulTotal", "caught", "validTotal", "falseRejects"] as const);
  if (!x || !head) return null;
  const probe1 = numbers(x.postFixProbe, ["total", "caught"] as const);
  const probe2 = numbers(x.postFixProbe2, ["total", "caught"] as const);
  const probe2Valid = numbers(x.postFixProbe2, ["validTotal", "falseRejects"] as const);
  return {
    generatedAt: typeof x.generatedAt === "string" ? x.generatedAt : "",
    author: typeof x.author === "string" ? x.author : "",
    ...head,
    before: numbers(x.before, ["caught", "harmfulTotal"] as const),
    postFixProbe: probe1 && { ...probe1, heldOut: (x.postFixProbe as { heldOut?: unknown }).heldOut !== false },
    postFixProbe2: probe2 && {
      ...probe2,
      validTotal: probe2Valid?.validTotal ?? null,
      falseRejects: probe2Valid?.falseRejects ?? null,
    },
  };
}

/**
 * The page's one-paragraph summary of the red team, or null (line left out) when the file has no held-out probe.
 * The checker was hardened against this same AI-written set, so its score is a regression test; a probe written
 * after the fixes and not tuned on is the honest measure of what it still misses, and the two are never shown apart.
 * The held-out probe is postFixProbe2 when present; the first probe is used only while the file does not mark it
 * as tuned on (heldOut: false), so a tuned-on probe is never called held out.
 */
export function redTeamSentence(r: RedTeamSummary | null): string | null {
  if (!r) return null;
  const p2 = r.postFixProbe2;
  const p1 = r.postFixProbe?.heldOut ? r.postFixProbe : null;
  if (!p2 && !p1) return null;
  const upFrom = r.before ? ` (up from ${r.before.caught} before)` : "";
  const probe = p2
    ? `on a further ${p2.total} paraphrases written after the latest rules and not used to change any rule, it ` +
      `caught ${p2.caught}` +
      (p2.validTotal !== null && p2.falseRejects !== null
        ? ` (and wrongly rejected ${p2.falseRejects} of ${p2.validTotal} valid sentences written with them)`
        : "")
    : `on a fresh set of ${p1!.total} paraphrases written after the fixes and never used for tuning, it caught only ${p1!.caught}`;
  return (
    `After the code check was hardened against an AI-written red-team set (written by the AI agent that then hardened ` +
    `the checker, not clinician-reviewed), it catches ${r.caught} of ${r.harmfulTotal} of those sentences${upFrom} and ` +
    `wrongly rejects ${r.falseRejects} of ${r.validTotal} valid ones. This is a regression test, not proof the checker ` +
    `is airtight: ${probe}.`
  );
}

export const RED_TEAM = readRedTeam(Object.values(redTeamFiles)[0]);
export const RED_TEAM_SENTENCE = redTeamSentence(RED_TEAM);
