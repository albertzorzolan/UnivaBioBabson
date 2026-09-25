import type { Role, Session } from '../types'
import { KEYS, load, remove, save } from './storage'

// Hackathon prototype only: hardcoded demo credentials, no real auth.
const DEMO_USERS: Record<string, { password: string; role: Role }> = {
  babson: { password: 'babson', role: 'patient' },
  babson1: { password: 'babson1', role: 'caregiver' },
}

export function login(username: string, password: string): Session | null {
  const user = DEMO_USERS[username.trim().toLowerCase()]
  if (!user || user.password !== password) return null
  const session: Session = {
    role: user.role,
    username: username.trim().toLowerCase(),
    loggedInAt: new Date().toISOString(),
  }
  save(KEYS.session, session)
  return session
}

export function getSession(): Session | null {
  return load<Session | null>(KEYS.session, null)
}

export function logout(): void {
  remove(KEYS.session)
}
