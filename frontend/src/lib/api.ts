import { interfaceText } from "./productLanguage";

export function apiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  // Keep local frontend and backend on the same host for SameSite session cookies.
  const host = typeof window === "undefined" ? "127.0.0.1" : window.location.hostname;
  return `http://${host}:8000`;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(interfaceText(message));
    this.name = "ApiError";
  }
}

export interface SessionUser {
  id: number;
  username: string;
  role: string;
  doctorID: string | null;
  lab_name: string | null;
  license_id: string | null;
  lab_address: string | null;
  officer_id?: string | null;
  assigned_area?: string | null;
  moh_office?: string | null;
  designation?: string | null;
}

// Memory only. Django still authenticates every protected request and validates
// this token. A token rotated by another login is refreshed on a CSRF rejection.
let currentCsrfToken: string | null = null;

function errorMessage(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(errorMessage).join(" ");
  if (data && typeof data === "object") {
    const fields = data as Record<string, unknown>;
    if (fields.error || fields.detail || fields.message) {
      return errorMessage(fields.error || fields.detail || fields.message);
    }
    return Object.entries(fields).map(([key, value]) => `${key}: ${errorMessage(value)}`).join(" ");
  }
  return "";
}

export async function apiRequest(endpoint: string, options: RequestInit = {}, csrfMode: "fresh" | "reuse" = "fresh") {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const method = (options.method || "GET").toUpperCase();
  const protectedMutation = path === "/login/" || path === "/logout/" || path.startsWith("/api/prescription/")
    || path.startsWith("/approve-doctor/") || path.startsWith("/reject-doctor/");
  let reusedToken = false;
  if (protectedMutation && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (csrfMode === "reuse" && currentCsrfToken) {
      headers.set("X-CSRFToken", currentCsrfToken);
      reusedToken = true;
    } else {
      const session = await getSession({ signal: options.signal });
      headers.set("X-CSRFToken", session.csrfToken);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...options, headers, credentials: "include", cache: "no-store",
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Failed to fetch";
    throw new ApiError(`Unable to connect to the server (${message}). Please ensure the backend is running.`, 0);
  }
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    if (reusedToken && response.status === 403 && /csrf/i.test(errorMessage(data))) {
      currentCsrfToken = null;
      // Only explicit read-only preview callers opt into reuse. CSRF rejection
      // happens before the view; refresh once, with the original abort signal.
      return apiRequest(path, options, "fresh");
    }
    throw new ApiError(errorMessage(data) || `Request failed with status ${response.status}`, response.status);
  }
  return data;
}

export async function getSession(options: Pick<RequestInit, "signal"> = {}): Promise<{ user: SessionUser | null; csrfToken: string }> {
  const session = await apiRequest("/session/", options);
  currentCsrfToken = typeof session?.csrfToken === "string" ? session.csrfToken : null;
  return session;
}

export async function logoutUser() {
  await apiRequest("/logout/", { method: "POST" });
  currentCsrfToken = null;
  localStorage.removeItem("meditrack_user");
}
