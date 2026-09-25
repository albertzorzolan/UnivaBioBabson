import { addDays, daysBetween, formatDate } from '../lib/dates'
import type { SymptomLog } from '../types'

/**
 * Chart palette: brand teal/terracotta nudged to pass the categorical
 * validator (chroma floor, CVD separation, 3:1 contrast on the card surface).
 */
export const CHART = {
  energy: '#00879E',
  sleep: '#C4744E',
  dizziness: '#B8862B',
  grid: '#EDE6DB',
  axis: '#938A82',
  marker: '#8C837B',
}

export interface DayPoint {
  date: string
  label: string
  energy: number | null
  sleep: number | null
  dizziness: number | null
  logged: boolean
}

export function buildSeries(logs: SymptomLog[], from: string, to: string): DayPoint[] {
  const byDate = new Map(logs.map((l) => [l.date, l]))
  const n = daysBetween(from, to)
  const out: DayPoint[] = []
  for (let i = 0; i <= n; i++) {
    const date = addDays(from, i)
    const log = byDate.get(date)
    out.push({
      date,
      label: formatDate(date),
      energy: log ? log.energy : null,
      sleep: log ? log.sleep : null,
      dizziness: log ? (log.dizziness ? (log.dizzinessSeverity ?? 1) : 0) : null,
      logged: !!log,
    })
  }
  return out
}
