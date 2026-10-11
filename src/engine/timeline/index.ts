// Timeline engine public API: descriptive before/after statistics around medication changes (SPEC §6.3).
//
//   rules.ts     thresholds, fixed wording (caveat, method summary, multiple-comparisons note)
//   stats.ts     Fisher's exact test, Mann–Whitney U (exact + normal), p-value formatting
//   metrics.ts   the 9 diary metrics, answered-day window summaries
//   windows.ts   medication starts/stops, before/after windows, overlapping changes
//   sentinel.ts  falls and near-falls listed by date (never tested)
//   signals.ts   per-change comparisons → signals, timeline analysis, weekly view, chart rows
export {
  fisherExact,
  mannWhitneyU,
  MANN_WHITNEY_EXACT_LIMIT,
  erfc,
  normalCdf,
  normalTwoSidedP,
  logFactorial,
  formatPValue,
} from "./stats";
export type { MannWhitneyResult, MannWhitneyOptions } from "./stats";

export {
  METRICS,
  getMetric,
  metricValue,
  windowStat,
  windowStatFromDays,
  summarizeValues,
  valuesInWindow,
  latestCheckInPerDate,
} from "./metrics";
export type { MetricDef } from "./metrics";

export {
  TIMELINE_RULES,
  TIMELINE_METHOD_SUMMARY,
  SIGNAL_CAVEAT,
  MULTIPLE_COMPARISONS_NOTE,
  SENTINEL_NOTE,
  STRENGTH_LABEL,
} from "./rules";

export { eventsForMed, eventWindows, overlappingChanges, nearbyDoseChanges } from "./windows";
export type { ChangeKind, DateWindow, EventWindows, MedChange } from "./windows";

export { SENTINEL_METRICS, MAX_SENTENCE_LENGTH, sentinelEvents, sentinelSentence } from "./sentinel";
export type { SentinelCount, SentinelEvents, SentinelMetric } from "./sentinel";

export { medName, MAX_MED_NAME_LENGTH } from "./text";

export {
  analyzeTimeline,
  analyzeEvent,
  timelineSentinels,
  compareMetric,
  classifyStrength,
  isSignalStrength,
  isAdverseConsistent,
  compareSignals,
  signalSentence,
  describeSignal,
  weeklyTrends,
  weeklySummary,
  dailySeries,
} from "./signals";
export type {
  AnalyzeTimelineInput,
  AnalyzeEventInput,
  DailyRow,
  EventAnalysis,
  MetricComparison,
  SentinelReport,
  SignalDescription,
  TimelineReport,
} from "./signals";
