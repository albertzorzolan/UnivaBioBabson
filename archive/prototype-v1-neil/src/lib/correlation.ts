import type { Medication, SymptomLog } from '../types'
import { addDays, daysBetween, formatDate, todayISO } from './dates'

/**
 * Simple, explainable before/after comparison. For each medication we compare
 * symptom logs from the 14 days before its start date with the (up to) 14 days
 * after. No models, no black boxes — just counts and averages.
 */

export type SymptomKey = 'dizziness' | 'confusion' | 'fall' | 'appetite' | 'energy' | 'sleep'

interface MetricDef {
  key: SymptomKey
  label: string
  /** rate = share of logged days with the symptom (higher is worse);
   *  avg = mean of a 1–5 score (lower is worse) */
  kind: 'rate' | 'avg'
  value: (log: SymptomLog) => number
}

export const METRICS: MetricDef[] = [
  { key: 'dizziness', label: 'dizziness', kind: 'rate', value: (l) => (l.dizziness ? 1 : 0) },
  { key: 'confusion', label: 'confusion or memory fog', kind: 'rate', value: (l) => (l.confusion ? 1 : 0) },
  { key: 'fall', label: 'falls or near-falls', kind: 'rate', value: (l) => (l.fall ? 1 : 0) },
  { key: 'appetite', label: 'a worse appetite', kind: 'rate', value: (l) => (l.appetite === 'worse' ? 1 : 0) },
  { key: 'energy', label: 'energy', kind: 'avg', value: (l) => l.energy },
  { key: 'sleep', label: 'sleep quality', kind: 'avg', value: (l) => l.sleep },
]

export const WINDOW_DAYS = 14
export const MIN_LOGS_PER_WINDOW = 5
const MIN_DAYS_ON_MED = 7
const RATE_THRESHOLD = 0.2
const AVG_THRESHOLD = 0.75

export interface WindowStats {
  from: string
  to: string
  logged: number
  /** For rate metrics: number of days the symptom was reported */
  count: number
  /** Rate (0–1) or average (1–5) */
  value: number
}

export interface Insight {
  medId: string
  medName: string
  startDate: string
  metric: SymptomKey
  direction: 'worse' | 'better'
  before: WindowStats
  after: WindowStats
  text: string
}

export type MedAnalysisStatus = 'ok' | 'too-early' | 'insufficient' | 'future'

export interface MedAnalysis {
  med: Medication
  status: MedAnalysisStatus
  beforeLogged: number
  afterLogged: number
  insights: Insight[]
  /** Other meds started within the comparison window — worth naming for honesty */
  overlapping: Medication[]
}

function logsBetween(logs: SymptomLog[], from: string, to: string): SymptomLog[] {
  return logs.filter((l) => l.date >= from && l.date <= to)
}

function stats(logs: SymptomLog[], metric: MetricDef, from: string, to: string): WindowStats {
  const values = logs.map(metric.value)
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    from,
    to,
    logged: logs.length,
    count: metric.kind === 'rate' ? sum : 0,
    value: logs.length ? sum / logs.length : 0,
  }
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const one = (v: number) => v.toFixed(1)

function describe(med: Medication, metric: MetricDef, before: WindowStats, after: WindowStats, direction: 'worse' | 'better'): string {
  const since = `Since starting ${med.name} on ${formatDate(med.startDate)}`
  if (metric.kind === 'rate') {
    const verb = direction === 'worse' ? 'increased' : 'decreased'
    return `${since}, ${metric.label} reports ${verb} from ${before.count} of ${before.logged} days (${pct(before.value)}) to ${after.count} of ${after.logged} days (${pct(after.value)}).`
  }
  const verb = direction === 'worse' ? 'dropped' : 'improved'
  return `${since}, average ${metric.label} ${verb} from ${one(before.value)} to ${one(after.value)} (out of 5).`
}

export function analyzeMedication(med: Medication, logs: SymptomLog[], allMeds: Medication[], today = todayISO()): MedAnalysis {
  const daysOn = daysBetween(med.startDate, today)
  const beforeFrom = addDays(med.startDate, -WINDOW_DAYS)
  const beforeTo = addDays(med.startDate, -1)
  const afterFrom = med.startDate
  const afterEnd = addDays(med.startDate, WINDOW_DAYS - 1)
  const afterTo = afterEnd < today ? afterEnd : today

  const beforeLogs = logsBetween(logs, beforeFrom, beforeTo)
  const afterLogs = daysOn >= 0 ? logsBetween(logs, afterFrom, afterTo) : []
  const overlapping = allMeds.filter(
    (m) => m.id !== med.id && m.startDate >= beforeFrom && m.startDate <= afterEnd,
  )

  const base = { med, beforeLogged: beforeLogs.length, afterLogged: afterLogs.length, overlapping, insights: [] }
  if (daysOn < 0) return { ...base, status: 'future' }
  if (daysOn < MIN_DAYS_ON_MED) return { ...base, status: 'too-early' }
  if (beforeLogs.length < MIN_LOGS_PER_WINDOW || afterLogs.length < MIN_LOGS_PER_WINDOW) {
    return { ...base, status: 'insufficient' }
  }

  const insights: Insight[] = []
  for (const metric of METRICS) {
    const before = stats(beforeLogs, metric, beforeFrom, beforeTo)
    const after = stats(afterLogs, metric, afterFrom, afterTo)
    let direction: 'worse' | 'better' | null = null
    if (metric.kind === 'rate') {
      const diff = after.value - before.value
      if (diff >= RATE_THRESHOLD && after.count >= 2) direction = 'worse'
      else if (diff <= -RATE_THRESHOLD && before.count >= 2) direction = 'better'
    } else {
      const diff = after.value - before.value
      if (diff <= -AVG_THRESHOLD) direction = 'worse'
      else if (diff >= AVG_THRESHOLD) direction = 'better'
    }
    if (direction) {
      insights.push({
        medId: med.id,
        medName: med.name,
        startDate: med.startDate,
        metric: metric.key,
        direction,
        before,
        after,
        text: describe(med, metric, before, after, direction),
      })
    }
  }
  // Worsening first — that's what a caregiver needs to see
  insights.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'worse' ? -1 : 1))
  return { ...base, status: 'ok', insights }
}

export function analyzeAll(meds: Medication[], logs: SymptomLog[], today = todayISO()): MedAnalysis[] {
  return [...meds]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((m) => analyzeMedication(m, logs, meds, today))
}

// ---------------------------------------------------------------------------
// Week-over-week trend for the patient's "How am I doing?" view

export type TrendDirection = 'better' | 'worse' | 'same' | 'not-enough'

export interface WeekTrend {
  metric: SymptomKey
  direction: TrendDirection
  thisWeek: number
  lastWeek: number
  thisWeekLogged: number
}

export function weekTrends(logs: SymptomLog[], today = todayISO()): WeekTrend[] {
  const thisWeek = logsBetween(logs, addDays(today, -6), today)
  const lastWeek = logsBetween(logs, addDays(today, -13), addDays(today, -7))
  return METRICS.map((metric) => {
    const now = stats(thisWeek, metric, '', '')
    const prev = stats(lastWeek, metric, '', '')
    let direction: TrendDirection = 'same'
    if (thisWeek.length < 3 || lastWeek.length < 3) direction = 'not-enough'
    else {
      const diff = now.value - prev.value
      const threshold = metric.kind === 'rate' ? 0.15 : 0.5
      // For rate metrics higher is worse; for averages higher is better.
      const worse = metric.kind === 'rate' ? diff >= threshold : diff <= -threshold
      const better = metric.kind === 'rate' ? diff <= -threshold : diff >= threshold
      direction = worse ? 'worse' : better ? 'better' : 'same'
    }
    return { metric: metric.key, direction, thisWeek: now.value, lastWeek: prev.value, thisWeekLogged: thisWeek.length }
  })
}
