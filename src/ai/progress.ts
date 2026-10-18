// Load progress for the on-device model, as labelled phases that only ever move forward.
//
// WebLLM reports one 0–1 number per pass, and it runs three passes in order (0.2.85, lib/index.js):
//   "Fetching param cache[i/n]"       downloading weights into the browser cache (skipped when already cached)
//   "Loading model from cache[i/n]"   copying the cached weights to the graphics card (restarts at 0)
//   "Loading GPU shader modules[i/n]" compiling the WebGPU shaders (restarts at 0)
// Shown as one bar, that number jumped backwards (97% → 87% → 0%). Here the last two passes form one
// "prepare" phase, every value is clamped so it never decreases, and `overall` is a single forward-only
// figure for short status text elsewhere ("The on-device AI is loading (40%)").

export type LoadPhase = "download" | "prepare";

export interface LoadTracker {
  /** null until WebLLM reports its first recognised pass. */
  phase: LoadPhase | null;
  /** 0–1 within the current phase; never decreases while the phase stays the same. */
  phaseProgress: number;
  /** 0–1 across the whole load; never decreases. */
  overall: number;
  /** Whether a download pass happened (it then takes most of the overall bar). */
  downloaded: boolean;
}

export const LOAD_START: LoadTracker = { phase: null, phaseProgress: 0, overall: 0, downloaded: false };

/** Share of the "prepare" phase taken by copying weights; shader compilation takes the rest. */
const COPY_SHARE = 0.75;
/** Share of the overall figure taken by the download, when there is one. */
const DOWNLOAD_SHARE = 0.9;

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0);

/** Fold one WebLLM progress report into the tracker. Pure; unknown texts leave it unchanged. */
export function trackLoad(prev: LoadTracker, report: { progress: number; text: string }): LoadTracker {
  const p = clamp(report.progress);
  let phase: LoadPhase;
  let value: number;
  if (/^Fetching param cache/i.test(report.text)) [phase, value] = ["download", p];
  else if (/^Loading model from cache/i.test(report.text)) [phase, value] = ["prepare", COPY_SHARE * p];
  else if (/^Loading GPU shader/i.test(report.text)) [phase, value] = ["prepare", COPY_SHARE + (1 - COPY_SHARE) * p];
  else if (/^Finish loading/i.test(report.text)) [phase, value] = ["prepare", 1];
  else return prev;

  // Phases only move forward: a late download report after preparation started is ignored.
  if (prev.phase === "prepare" && phase === "download") return prev;
  const phaseProgress = phase === prev.phase ? Math.max(prev.phaseProgress, value) : value;
  const downloaded = prev.downloaded || phase === "download";
  const overall = phase === "download" ? DOWNLOAD_SHARE * phaseProgress : downloaded ? DOWNLOAD_SHARE + (1 - DOWNLOAD_SHARE) * phaseProgress : phaseProgress;
  return { phase, phaseProgress, overall: Math.max(prev.overall, overall), downloaded };
}
