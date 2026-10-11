// Demo-only role selection. The hardcoded credentials pick a role for the fictional dataset;
// they are NOT authentication and must never protect real health information.
import { useSyncExternalStore } from "react";
import type { Role } from "../model/types";
import { SESSION_KEY } from "../model/store";

export const DEMO_ACCOUNTS: { username: string; password: string; role: Role; label: string }[] = [
  { username: "babson", password: "babson", role: "patient", label: "Margaret (patient)" },
  { username: "babson1", password: "babson1", role: "caregiver", label: "Alex (caregiver)" },
];

let role: Role | null = readInitial();
const listeners = new Set<() => void>();

function readInitial(): Role | null {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v === "patient" || v === "caregiver" ? v : null;
  } catch {
    return null;
  }
}

function setRole(next: Role | null) {
  role = next;
  try {
    if (next) sessionStorage.setItem(SESSION_KEY, next);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* session persistence is optional */
  }
  listeners.forEach((l) => l());
}

/** Returns the role for valid demo credentials, otherwise null. */
export function login(username: string, password: string): Role | null {
  const account = DEMO_ACCOUNTS.find((a) => a.username === username.trim().toLowerCase() && a.password === password);
  if (!account) return null;
  setRole(account.role);
  return account.role;
}

export function loginAs(next: Role): void {
  setRole(next);
}

export function logout(): void {
  setRole(null);
}

export function useSession(): Role | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => role,
  );
}
