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

export async function fetchVerifiedSession(token) {
  if (!token) return null;
  const data = await apiFetch("/auth/me", { token });
  const user = data && data.user ? data.user : null;
  if (!user || !user.id || !user.role) {
    return null;
  }
  return {
    userId: Number(user.id),
    role: user.role,
    scopes: user.scopes || {},
    email: user.email || ""
  };
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
  return safeGetStorageValue(sessionStorage, "cohortbridge_token") || "";
}

export function storeToken(token) {
  // Keep access token in session scope only; avoid localStorage persistence.
  // Security note: production-grade auth should use HttpOnly secure cookies
  // for token transport/storage to reduce XSS token exfiltration risk.
  safeSetStorageValue(sessionStorage, "cohortbridge_token", token);
}

export function clearStoredToken() {
  safeRemoveStorageValue(sessionStorage, "cohortbridge_token");
  // Defensive cleanup for older clients that may have persisted this key.
  safeRemoveStorageValue(localStorage, "cohortbridge_token");
}

export function hasRole(authLike, allowedRoles) {
  if (!authLike) return false;
  const role = typeof authLike === "string" ? authLike : authLike.role;
  if (!role) return false;
  const set = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return set.includes(role);
}
