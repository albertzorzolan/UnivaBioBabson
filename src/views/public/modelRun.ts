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

export interface FlawedSentence {
  /** Where the app showed it and what is wrong with it (our label). */
  where: string;
  /** The sentence exactly as recorded. */
  quote: string;
  /** Which AI output it came from (two sentences share the anticholinergic explanation). */
  output: string;
  /** For a sentence from a longer explanation: the finding it explained and the whole recorded paragraph. */
  full?: { finding: string; text: string };
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
  /**
   * The flawed sentences found in the run, one item each: the six live escapes of eval/verifier-redteam.json
   * (live-01…06), from five AI outputs. `output` groups the sentences of one output; `full` is that output's
   * whole recorded text when the quote is only part of it (the two explanations).
   */
  flawed: FlawedSentence[];
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

// The flawed outputs, found by their recorded text. The verdict names three; the red-team set's live escapes
// (eval/verifier-redteam.json live-01…06) add three more sentences from the same log: the "replace" advice, the
// "another fall" prediction and the tiredness-to-sleep suggestion.
/** The finding an explanation was for and its recorded AI paragraph (the line matching `re`). */
function explanation(pick: (e: (typeof explain)[number]) => boolean, re: RegExp): { finding: string; text: string } {
  const e = explain.find(pick);
  return { finding: e?.finding ?? "", text: e?.ai.find((t) => re.test(t)) ?? "" };
}
const causeExplain = explanation((e) => e.forbidden.length > 0, /can cause/);
const fallExplain = explanation((e) => /history of falls/.test(e.finding), /another fall/);
const suggestions = patientRefine.flatMap((p) => p.aiSuggestions);
const blocked = explain.find((e) => e.ai.some((t) => /didn.t pass the source check/.test(t)));

/** The sentence of `text` that matches `re` (sentences end at . ! or ?), or "" when none does. */
function sentenceWith(text: string, re: RegExp): string {
  return text.split(/(?<=[.!?])\s+/).find((t) => re.test(t)) ?? "";
}

/** The diary words a recorded suggestion card quoted ("From your words:" and the next line). */
function quotedWords(match: RegExp): string {
  const card = suggestions.find((s) => match.test(s)) ?? "";
  return card.match(/From your words:\n([^\n]+)/)?.[1] ?? "";
}

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
    { where: "Visit brief, “Why we’re coming in” (garbled)", quote: brief.aiReasonSentence, output: "brief" },
    {
      where: "Check-in suggestion: dizziness marked Yes, quoted from these words",
      quote: quotedWords(/Slept like a log/),
      output: "refine-dizzy",
    },
    {
      where: "Check-in suggestion: last night’s sleep marked “Very badly (1 of 5)”, quoted from words about tiredness",
      quote: quotedWords(/Pretty tired today/),
      output: "refine-sleep",
    },
    {
      where: "Explanation using “can cause” (states a cause)",
      quote: sentenceWith(causeExplain.text, /can cause/),
      output: "explain-anticholinergic",
      full: causeExplain,
    },
    {
      where: "Same explanation: says some medicines “might be” replaced (treatment advice)",
      quote: sentenceWith(causeExplain.text, /might be able to replace/),
      output: "explain-anticholinergic",
      full: causeExplain,
    },
    {
      where: "Explanation predicting “another fall”",
      quote: sentenceWith(fallExplain.text, /another fall/),
      output: "explain-falls",
      full: fallExplain,
    },
  ],
  verdict,
};

// ---------------------------------------------------------------------------------------------
// Optional: the claim-checker red team (npm test runs eval/verifier.eval.test.ts, which writes this file). Read
// through import.meta.glob so the page builds whether or not the results file exists in this checkout.

/** A post-fix probe's counts. `heldOut` is false once the file says its items were in view when a rule was written. */
export interface ProbeSummary {
  total: number;
  caught: number;
  validTotal: number | null;
  falseRejects: number | null;
  heldOut: boolean;
}

export interface RedTeamSummary {
  generatedAt: string;
  author: string;
  harmfulTotal: number;
  caught: number;
  validTotal: number;
  falseRejects: number;
  /** The same set run on the checks as submitted, before they were hardened against it (null when absent). */
  before: { caught: number; harmfulTotal: number } | null;
  /** The first post-fix probe (null when absent). */
  postFixProbe: ProbeSummary | null;
  /** The second post-fix probe (null when absent). */
  postFixProbe2: ProbeSummary | null;
  /**
   * The third post-fix probe as recorded (null when absent), written by an AI agent after the medicine-action rule
   * was designed and before it was run. `corrected` is the same run with one label corrected in review.
   */
  postFixProbe3: (ProbeSummary & { corrected: { total: number; caught: number; validTotal: number; falseRejects: number } | null }) | null;
}

const redTeamFiles = import.meta.glob<Record<string, unknown>>("../../../eval/results/verifier-redteam.json", { eager: true, import: "default" });

/** Reads the named number fields of an object, or null when it is missing or any field is not a number. */
function numbers<K extends string>(x: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!keys.every((k) => typeof o[k] === "number")) return null;
  return Object.fromEntries(keys.map((k) => [k, o[k]])) as Record<K, number>;
}

/** One probe block: null when absent or malformed. A probe is held out unless the file says `heldOut: false`. */
function readProbe(x: unknown): ProbeSummary | null {
  const head = numbers(x, ["total", "caught"] as const);
  if (!head) return null;
  const valid = numbers(x, ["validTotal", "falseRejects"] as const);
  return {
    ...head,
    validTotal: valid?.validTotal ?? null,
    falseRejects: valid?.falseRejects ?? null,
    heldOut: (x as { heldOut?: unknown }).heldOut !== false,
  };
}

/** Null when the file is missing or a headline field is not a number: the page then leaves the line out. */
export function readRedTeam(x: Record<string, unknown> | undefined): RedTeamSummary | null {
  const head = numbers(x, ["harmfulTotal", "caught", "validTotal", "falseRejects"] as const);
  if (!x || !head) return null;
  const p3 = readProbe(x.postFixProbe3);
  return {
    generatedAt: typeof x.generatedAt === "string" ? x.generatedAt : "",
    author: typeof x.author === "string" ? x.author : "",
    ...head,
    before: numbers(x.before, ["caught", "harmfulTotal"] as const),
    postFixProbe: readProbe(x.postFixProbe),
    postFixProbe2: readProbe(x.postFixProbe2),
    postFixProbe3: p3 && {
      ...p3,
      corrected: numbers((x.postFixProbe3 as { withCorrectedLabel?: unknown }).withCorrectedLabel, [
        "total",
        "caught",
        "validTotal",
        "falseRejects",
      ] as const),
    },
  };
}

/** " (and wrongly rejected 0 of 12 valid sentences written with them)", or "" when the probe has no valid set. */
function validClause(p: ProbeSummary, extra = ""): string {
  return p.validTotal !== null && p.falseRejects !== null
    ? ` (and wrongly rejected ${p.falseRejects} of ${p.validTotal} valid sentences written with them${extra})`
    : "";
}

/**
 * The page's one-paragraph summary of the red team, or null (line left out) when the file has no held-out probe.
 * The checker was hardened against this same AI-written set, so its score is a regression test; a probe written
 * after the fixes and not tuned on is the honest measure of what it still misses, and the two are never shown apart.
 * The held-out probe is the newest one the file does not mark as tuned on (heldOut: false): the third, then the
 * second, then the first. A tuned-on probe is never called held out; its first-run score is still listed, so the
 * page never shows only the best probe.
 */
export function redTeamSentence(r: RedTeamSummary | null): string | null {
  if (!r) return null;
  const p1 = r.postFixProbe;
  const p2 = r.postFixProbe2;
  const p3 = r.postFixProbe3;
  let probe: string;
  let used: ProbeSummary;
  if (p3?.heldOut) {
    used = p3;
    const c = p3.corrected;
    const corrected = c ? `; ${c.caught} of ${c.total} and ${c.falseRejects} of ${c.validTotal} after one label was corrected in review` : "";
    probe =
      `on the newest probe, ${p3.total} paraphrases written by an AI agent after the latest rule was designed and ` +
      `before it was run (not independent of the team), it caught ${p3.caught}` +
      (validClause(p3, corrected) || (c ? ` (${c.caught} of ${c.total} after one label was corrected in review)` : ""));
  } else if (p2?.heldOut) {
    used = p2;
    probe =
      `on a further ${p2.total} paraphrases written after the latest rules and not used to change any rule, it ` +
      `caught ${p2.caught}` +
      validClause(p2);
  } else if (p1?.heldOut) {
    used = p1;
    probe = `on a fresh set of ${p1.total} paraphrases written after the fixes and never used for tuning, it caught only ${p1.caught}`;
  } else {
    return null;
  }
  // First-run scores of the earlier probes that were later used to change rules, oldest first.
  const earlier = [p1, p2].filter((p): p is ProbeSummary => !!p && p !== used && !p.heldOut);
  const earlierText = earlier.length
    ? ` Earlier probes, later used to change the rules, caught ${earlier.map((p) => `${p.caught} of ${p.total}`).join(" and ")} when first run.`
    : "";
  const upFrom = r.before ? ` (up from ${r.before.caught} before)` : "";
  return (
    `After the code check was hardened against an AI-written red-team set (written by the AI agent that then hardened ` +
    `the checker, not clinician-reviewed), it catches ${r.caught} of ${r.harmfulTotal} of those sentences${upFrom} and ` +
    `wrongly rejects ${r.falseRejects} of ${r.validTotal} valid ones. This is a regression test, not proof the checker ` +
    `is airtight: ${probe}.${earlierText}`
  );
}

export const RED_TEAM = readRedTeam(Object.values(redTeamFiles)[0]);
export const RED_TEAM_SENTENCE = redTeamSentence(RED_TEAM);
