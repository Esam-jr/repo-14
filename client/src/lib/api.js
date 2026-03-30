export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function apiFetch(path, options = {}) {
  const token = options.token;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include"
  });

  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch (_e) { return { raw: text }; } })() : {};

  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export function decodeJwt(token) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  } catch (_e) {
    return null;
  }
}

function safeGetStorageValue(storage, key) {
  try {
    return storage.getItem(key);
  } catch (_e) {
    return null;
  }
}

function safeSetStorageValue(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (_e) {
    // Ignore storage write failures.
  }
}

function safeRemoveStorageValue(storage, key) {
  try {
    storage.removeItem(key);
  } catch (_e) {
    // Ignore storage removal failures.
  }
}

export function getStoredToken() {
  const sessionValue = safeGetStorageValue(sessionStorage, "cohortbridge_token");
  if (sessionValue) {
    return sessionValue;
  }
  // Backward compatibility with older localStorage sessions.
  return safeGetStorageValue(localStorage, "cohortbridge_token") || "";
}

export function storeToken(token) {
  // Prefer sessionStorage to reduce persistence on shared devices.
  // Security note: production-grade auth should use HttpOnly secure cookies
  // for token transport/storage to reduce XSS token exfiltration risk.
  safeSetStorageValue(sessionStorage, "cohortbridge_token", token);
  // Keep legacy localStorage mirror for compatibility during transition.
  safeSetStorageValue(localStorage, "cohortbridge_token", token);
}

export function clearStoredToken() {
  safeRemoveStorageValue(sessionStorage, "cohortbridge_token");
  safeRemoveStorageValue(localStorage, "cohortbridge_token");
}

export function hasRole(authLike, allowedRoles) {
  if (!authLike) return false;
  const role = typeof authLike === "string" ? authLike : authLike.role;
  if (!role) return false;
  const set = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return set.includes(role);
}
