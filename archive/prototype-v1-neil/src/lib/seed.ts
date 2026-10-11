import type { Appetite, DizzinessSeverity, Medication, Profile, SymptomLog } from '../types'
import { addDays, todayISO } from './dates'
import { KEYS, has, remove, save } from './storage'

/**
 * Demo dataset for a fictional patient. Dates are relative to "today" so the
 * story always looks current: Margaret started lorazepam for sleep two weeks
 * ago and dizziness, confusion and low energy have crept up since.
 */

export const DEMO_PROFILE: Profile = {
  patientName: 'Margaret',
  patientAge: 78,
  caregiverName: 'Daniel',
}

function demoMeds(today: string): Medication[] {
  return [
    {
      id: 'seed-lisinopril',
      name: 'Lisinopril',
      dosage: '10 mg',
      frequency: 'Once daily, morning',
      reason: 'High blood pressure',
      startDate: addDays(today, -60),
      doctor: 'Dr. Anita Patel',
    },
    {
      id: 'seed-omeprazole',
      name: 'Omeprazole',
      dosage: '20 mg',
      frequency: 'Once daily, before breakfast',
      reason: 'Heartburn',
      startDate: addDays(today, -62),
      doctor: 'Dr. Anita Patel',
    },
    {
      id: 'seed-metformin',
      name: 'Metformin',
      dosage: '500 mg',
      frequency: 'Twice daily with meals',
      reason: 'Type 2 diabetes',
      startDate: addDays(today, -52),
      doctor: 'Dr. Anita Patel',
    },
    {
      id: 'seed-lorazepam',
      name: 'Lorazepam',
      dosage: '0.5 mg',
      frequency: 'At bedtime',
      reason: 'Trouble sleeping',
      startDate: addDays(today, -14),
      doctor: 'Dr. James Okafor',
    },
  ]
}

// 27 days of logs: index 0 = 27 days ago, index 26 = yesterday.
// Lorazepam starts at index 13 (14 days ago). Today is left blank for a live check-in.
const S = 'same' as Appetite
const W = 'worse' as Appetite
const B = 'better' as Appetite
const PATTERN = {
  //            |------------ before lorazepam (13 days) ------------|------------- after lorazepam (14 days) -------------|
  energy:     [4, 3, 4, 4, 3, 4, 3, 4, 4, 3, 4, 4, 3, 3, 3, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2, 2],
  sleep:      [2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4],
  dizzy:      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  dizzySev:   [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 2, 0, 1, 0, 2, 2, 0, 2, 3, 2, 2],
  confusion:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  fall:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  appetite:   [S, S, B, S, S, S, S, S, S, S, S, S, S, S, S, S, S, W, S, S, S, S, S, W, S, S, S],
}

function demoLogs(today: string): SymptomLog[] {
  const n = PATTERN.energy.length
  return PATTERN.energy.map((energy, i) => {
    const date = addDays(today, i - n)
    const dizziness = PATTERN.dizzy[i] === 1
    return {
      date,
      recordedAt: `${date}T09:${String(10 + (i % 40)).padStart(2, '0')}:00`,
      energy,
      dizziness,
      dizzinessSeverity: dizziness ? (PATTERN.dizzySev[i] as DizzinessSeverity) : undefined,
      confusion: PATTERN.confusion[i] === 1,
      appetite: PATTERN.appetite[i],
      sleep: PATTERN.sleep[i],
      fall: PATTERN.fall[i] === 1,
    }
  })
}

export function writeDemoData(): void {
  const today = todayISO()
  save(KEYS.profile, DEMO_PROFILE)
  save(KEYS.meds, demoMeds(today))
  save(KEYS.logs, demoLogs(today))
  save(KEYS.flagReviews, {})
  save(KEYS.seeded, today)
}

/** Seed only on first load, when there's no existing data. */
export function seedIfEmpty(): void {
  if (has(KEYS.seeded) || has(KEYS.meds) || has(KEYS.logs)) return
  writeDemoData()
}

export function clearAllData(): void {
  for (const key of Object.values(KEYS)) {
    if (key !== KEYS.session && key !== KEYS.seeded) remove(key)
  }
  // Mark as seeded so an empty app doesn't silently re-seed on reload.
  save(KEYS.seeded, 'cleared')
  save(KEYS.meds, [])
  save(KEYS.logs, [])
}
