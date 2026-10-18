import { interfaceText } from "./productLanguage";

function apiBaseUrl() {
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
}

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

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const method = (options.method || "GET").toUpperCase();
  const protectedMutation = path === "/login/" || path === "/logout/" || path.startsWith("/api/prescription/")
    || path.startsWith("/approve-doctor/") || path.startsWith("/reject-doctor/");
  if (protectedMutation && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    // Fetch a fresh token: Django rotates it on login, and another tab may log in.
    const session = await getSession({ signal: options.signal });
    headers.set("X-CSRFToken", session.csrfToken);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...options, headers, credentials: "include", cache: "no-store",
  });
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(errorMessage(data) || `Request failed with status ${response.status}`, response.status);
  }
  return data;
}

export async function getSession(options: Pick<RequestInit, "signal"> = {}): Promise<{ user: SessionUser | null; csrfToken: string }> {
  return apiRequest("/session/", options);
}

export async function logoutUser() {
  await apiRequest("/logout/", { method: "POST" });
  localStorage.removeItem("meditrack_user");
}
