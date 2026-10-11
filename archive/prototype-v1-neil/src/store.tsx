import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { analyzeAll, type MedAnalysis } from './lib/correlation'
import { todayISO } from './lib/dates'
import { computeFlags } from './lib/flags'
import { DEMO_PROFILE, clearAllData, writeDemoData } from './lib/seed'
import { KEYS, load, newId, save } from './lib/storage'
import type { Flag, FlagReview, FlagStatus, Medication, Profile, SymptomLog } from './types'

interface DataContextValue {
  profile: Profile
  meds: Medication[]
  logs: SymptomLog[]
  flags: Flag[]
  analyses: MedAnalysis[]
  flagStatus: (flag: Flag) => FlagStatus
  todayLog: SymptomLog | undefined
  saveMed: (med: Omit<Medication, 'id'> & { id?: string }) => void
  deleteMed: (id: string) => void
  saveLog: (log: Omit<SymptomLog, 'recordedAt'>) => void
  reviewFlag: (flagId: string, status: FlagStatus) => void
  updateProfile: (p: Profile) => void
  resetDemo: () => void
  clearAll: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

function readAll() {
  return {
    profile: load<Profile>(KEYS.profile, DEMO_PROFILE),
    meds: load<Medication[]>(KEYS.meds, []),
    logs: load<SymptomLog[]>(KEYS.logs, []),
    reviews: load<Record<string, FlagReview>>(KEYS.flagReviews, {}),
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readAll)
  const { profile, meds, logs, reviews } = state

  // Persist on every change
  useEffect(() => save(KEYS.profile, profile), [profile])
  useEffect(() => save(KEYS.meds, meds), [meds])
  useEffect(() => save(KEYS.logs, logs), [logs])
  useEffect(() => save(KEYS.flagReviews, reviews), [reviews])

  // Pick up changes made in another tab (e.g. patient and caregiver side by side)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('mw.') && e.key !== KEYS.session) setState(readAll())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const today = todayISO()
  const flags = useMemo(() => computeFlags(meds, today), [meds, today])
  useEffect(() => save(KEYS.flags, flags), [flags])
  const analyses = useMemo(() => analyzeAll(meds, logs, today), [meds, logs, today])
  const todayLog = logs.find((l) => l.date === today)

  const flagStatus = useCallback((flag: Flag): FlagStatus => reviews[flag.id]?.status ?? 'open', [reviews])

  const saveMed: DataContextValue['saveMed'] = (med) =>
    setState((s) => {
      const id = med.id ?? newId()
      const next = { ...med, id }
      const exists = s.meds.some((m) => m.id === id)
      return { ...s, meds: exists ? s.meds.map((m) => (m.id === id ? next : m)) : [...s.meds, next] }
    })

  const deleteMed = (id: string) => setState((s) => ({ ...s, meds: s.meds.filter((m) => m.id !== id) }))

  const saveLog: DataContextValue['saveLog'] = (log) =>
    setState((s) => {
      const entry: SymptomLog = { ...log, recordedAt: new Date().toISOString() }
      const others = s.logs.filter((l) => l.date !== log.date)
      return { ...s, logs: [...others, entry].sort((a, b) => a.date.localeCompare(b.date)) }
    })

  const reviewFlag = (flagId: string, status: FlagStatus) =>
    setState((s) => {
      const reviews = { ...s.reviews }
      if (status === 'open') delete reviews[flagId]
      else reviews[flagId] = { status, at: new Date().toISOString() }
      return { ...s, reviews }
    })

  const updateProfile = (p: Profile) => setState((s) => ({ ...s, profile: p }))

  const resetDemo = () => {
    writeDemoData()
    setState(readAll())
  }

  const clearAll = () => {
    clearAllData()
    setState(readAll())
  }

  const value: DataContextValue = {
    profile,
    meds,
    logs,
    flags,
    analyses,
    flagStatus,
    todayLog,
    saveMed,
    deleteMed,
    saveLog,
    reviewFlag,
    updateProfile,
    resetDemo,
    clearAll,
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}
