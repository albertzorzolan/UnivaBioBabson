export type Role = 'patient' | 'caregiver'

export interface Session {
  role: Role
  username: string
  loggedInAt: string
}

export interface Profile {
  patientName: string
  patientAge: number
  caregiverName: string
}

export interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  reason: string
  /** Local date, YYYY-MM-DD */
  startDate: string
  doctor?: string
}

export type Appetite = 'better' | 'same' | 'worse'
/** 1 = a little, 2 = moderate, 3 = a lot */
export type DizzinessSeverity = 1 | 2 | 3

export interface SymptomLog {
  /** Local date, YYYY-MM-DD — one record per day */
  date: string
  /** ISO timestamp of when the entry was saved */
  recordedAt: string
  energy: number
  dizziness: boolean
  dizzinessSeverity?: DizzinessSeverity
  confusion: boolean
  appetite: Appetite
  sleep: number
  fall: boolean
}

/** Worth monitoring / discuss at next visit / discuss soon */
export type Severity = 'monitor' | 'next-visit' | 'soon'

export interface Flag {
  /** Deterministic: rule id + the medication ids that triggered it */
  id: string
  ruleId: string
  medIds: string[]
  medNames: string[]
  title: string
  explanation: string
  severity: Severity
  question: string
}

export type FlagStatus = 'open' | 'acknowledged' | 'dismissed'

export interface FlagReview {
  status: Exclude<FlagStatus, 'open'>
  at: string
}
