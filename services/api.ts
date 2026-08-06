/**
 * Central API fetch utility.
 *
 * All backend calls from the Expo app go through this module.
 * Every request automatically includes:
 *   - X-Client-App-Id: meetsweet-mobile  (required by all server routes)
 *   - Authorization: Bearer <token>      (when the caller uses authFetch)
 *
 * On 401 responses the interceptor transparently refreshes the access token
 * and retries the original request once.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLIENT_APP_ID = 'meetsweet-mobile';

export function getApiBase(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url) return `${url.replace(/\/+$/, '')}/api`;
  return 'https://meetsweet.space/api';
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Session-expired callback ──────────────────────────────────────────────────
// AuthContext registers this so the API layer can trigger a logout without
// creating a circular import (api.ts → AuthContext → api.ts).
let _onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: () => void): void {
  _onSessionExpired = fn;
}

// ── Token refresh state ───────────────────────────────────────────────────────

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

async function _doRefresh(): Promise<string | null> {
  try {
    const refreshToken = await AsyncStorage.getItem('@ms_refresh_token');
    if (!refreshToken) return null;

    const base = getApiBase();
    const resp = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-App-Id': CLIENT_APP_ID,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!resp.ok) return null;

    const text = await resp.text();
    const parsed = text ? JSON.parse(text) : null;
    // Unwrap { ok, data } envelope if present
    const envelope = (parsed?.ok !== undefined && parsed?.data) ? parsed.data : parsed;

    if (!envelope?.access_token) return null;

    await AsyncStorage.setItem('@ms_access_token', envelope.access_token);
    if (envelope.refresh_token) {
      await AsyncStorage.setItem('@ms_refresh_token', envelope.refresh_token);
    }
    return envelope.access_token;
  } catch {
    return null;
  }
}

async function _refreshOnce(): Promise<string | null> {
  if (_isRefreshing) {
    // Queue until the in-flight refresh resolves
    return new Promise((resolve) => {
      _refreshQueue.push(resolve);
    });
  }
  _isRefreshing = true;
  const token = await _doRefresh();
  _refreshQueue.forEach((cb) => cb(token));
  _refreshQueue = [];
  _isRefreshing = false;
  return token;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Internal fetch that does NOT retry on 401.
 * Used by _doRefresh to avoid infinite loops.
 */
async function _rawFetch(url: string, options: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
  const headers: Record<string, string> = Object.assign(
    { 'Content-Type': 'application/json', 'X-Client-App-Id': CLIENT_APP_ID },
    options.headers ?? {},
  );

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  return fetch(url, { ...options, headers });
}

/**
 * Fetch wrapper. Prepends the API base URL automatically.
 * Unwraps the standard { ok, data } envelope on successful responses.
 * Retries once after a transparent token refresh on 401.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  _retry = false,
): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await _rawFetch(url, options);

  // ── 401: attempt token refresh ────────────────────────────────────────────
  if (response.status === 401 && !_retry) {
    const newToken = await _refreshOnce();
    if (newToken) {
      return apiFetch<T>(path, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        },
      }, true);
    }
    // Refresh failed — clear tokens and notify AuthContext so it can redirect to login
    await AsyncStorage.multiRemove(['@ms_access_token', '@ms_refresh_token']);
    _onSessionExpired?.();
    throw new ApiError(401, 'Session expired. Please log in again.', 'SESSION_EXPIRED');
  }

  let parsed: unknown;
  try {
    const text = await response.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const p = parsed as Record<string, string> | null;
    const message = p?.error ?? p?.message ?? `HTTP ${response.status}`;
    const code    = p?.code ?? undefined;
    throw new ApiError(response.status, message, code, parsed);
  }

  // Unwrap the standard { ok: true, data: ... } envelope
  const envelope = parsed as { ok?: boolean; data?: unknown } | null;
  if (envelope && typeof envelope === 'object' && 'ok' in envelope && 'data' in envelope) {
    return envelope.data as T;
  }

  return parsed as T;
}

/**
 * Authenticated fetch — injects a Bearer token.
 */
export async function authFetch<T = unknown>(
  path: string,
  token: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}
