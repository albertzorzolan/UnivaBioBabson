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

// ---------------------------------------------------------------------------
// Load errors in plain words

/** A download that never arrived: blocked by the network, offline, or the host was unreachable. */
export const LOAD_FAILED_NETWORK =
  "Couldn’t download the model; your network may block huggingface.co or GitHub. Everything else in Kinwise works without it. Try again on another network.";
/** Any other load failure (out of graphics memory, a lost GPU device, an engine bug). */
export const LOAD_FAILED = "The on-device model didn’t load this time. Everything else in Kinwise works without it. Try again, or choose a smaller model.";

// How browsers and WebLLM word a failed download: Chrome "Failed to fetch", Firefox "NetworkError when attempting to
// fetch resource.", Safari "Load failed", WebLLM's cache layer "Failed to store <url> …" (seen in the runtime audit
// when huggingface.co was blocked). Matched anywhere in the text, so llm.ts's "could not load: …" prefix is fine.
const NETWORK_ERROR = /failed to fetch|failed to store|networkerror|network error|load failed|err_internet_disconnected|err_name_not_resolved/i;

/**
 * The plain message Settings shows for a failed model load. Pure: takes the thrown error or the status message and
 * never returns the raw text (Settings keeps that under "Technical details").
 */
export function friendlyLoadError(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : typeof err === "string" ? err : "";
  return NETWORK_ERROR.test(text) ? LOAD_FAILED_NETWORK : LOAD_FAILED;
}
