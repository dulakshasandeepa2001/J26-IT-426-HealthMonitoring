/**
 * Authentication & Session Management Helper
 * Uses sessionStorage so credentials/session are strictly scoped to the active browser tab/session.
 * Closing the browser or opening the site in a fresh session will not automatically keep users logged in.
 */

export interface StoredUser {
  id?: number;
  username: string;
  role: string;
  doctorID?: string;
  lab_name?: string;
  license_id?: string;
  lab_address?: string;
  [key: string]: any;
}

const STORAGE_KEY = "meditrack_user";

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;

  // Clean legacy persistent localStorage so old/stale sessions don't persist
  try {
    if (localStorage.getItem(STORAGE_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.username) {
      return parsed;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser): void {
  if (typeof window === "undefined") return;
  try {
    // Clear any localStorage residue
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

export function clearStoredUser(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
