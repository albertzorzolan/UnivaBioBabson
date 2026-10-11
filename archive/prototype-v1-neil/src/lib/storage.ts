/**
 * Thin localStorage wrapper. Everything MedWatch stores lives on this device;
 * nothing is sent to a server.
 */

export const KEYS = {
  session: 'mw.session',
  profile: 'mw.profile',
  meds: 'mw.medications',
  logs: 'mw.symptomLogs',
  flags: 'mw.flags',
  flagReviews: 'mw.flagReviews',
  fdaCache: 'mw.fdaCache',
  seeded: 'mw.seeded',
} as const

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked — the app keeps working in memory.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function has(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
