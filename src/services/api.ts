/**
 * MeetSweet API Service - Central fetch utility
 * Points to live backend at https://meetsweet.space/api
 */

const CLIENT_APP_ID = 'meetsweet-mobile';

export function getApiBase(): string {
  const url = (import.meta as any).env?.VITE_API_URL || 'https://meetsweet.space';
  return `${url.replace(/\/+$/, '')}/api`;
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

let _onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: () => void): void {
  _onSessionExpired = fn;
}

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

async function _doRefresh(): Promise<string | null> {
  try {
    const refreshToken = localStorage.getItem('@ms_refresh_token');
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
    const envelope = (parsed?.ok !== undefined && parsed?.data) ? parsed.data : parsed;

    if (!envelope?.access_token) return null;

    localStorage.setItem('@ms_access_token', envelope.access_token);
    if (envelope.refresh_token) {
      localStorage.setItem('@ms_refresh_token', envelope.refresh_token);
    }
    return envelope.access_token;
  } catch {
    return null;
  }
}

async function _refreshOnce(): Promise<string | null> {
  if (_isRefreshing) {
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

export async function apiFetch<T = unknown>(
  path: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  _retry = false,
): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  try {
    const response = await _rawFetch(url, options);

    const hasAccessToken = Object.keys(options.headers ?? {}).some(
      (key) => key.toLowerCase() === 'authorization',
    );

    if (response.status === 401 && !_retry && hasAccessToken) {
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
      localStorage.removeItem('@ms_access_token');
      localStorage.removeItem('@ms_refresh_token');
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
      const code = p?.code ?? undefined;
      throw new ApiError(response.status, message, code, parsed);
    }

    const envelope = parsed as { ok?: boolean; data?: unknown; error?: string; code?: string } | null;
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok === false) {
        throw new ApiError(
          response.status,
          envelope.error ?? 'The server rejected the request.',
          envelope.code,
          parsed,
        );
      }
      if ('data' in envelope) return envelope.data as T;
    }

    return parsed as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, (err as Error).message || 'Network request failed');
  }
}

export async function authFetch<T = unknown>(
  path: string,
  token?: string | null,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const authToken = token || localStorage.getItem('@ms_access_token');
  if (!authToken) {
    throw new ApiError(401, 'Unauthenticated. Please log in.');
  }

  return apiFetch<T>(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  });
}
