/**
 * Central API fetch utility.
 *
 * All backend calls from the Expo app go through this module.
 * Feature endpoints (posts, users, comments, …) continue to use the
 * EXPO_PUBLIC_API_URL base. The credential broker endpoints are handled
 * separately in services/credentials/.
 *
 * Set EXPO_PUBLIC_API_URL to your broker deployment URL,
 * e.g. https://your-broker.vercel.app
 */
export function getApiBase(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url) return `${url.replace(/\/+$/, '')}/api`;
  return 'https://meetsweet-server.quizmi.space/api';
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch wrapper. Prepends the API base URL automatically.
 * Unwraps the standard { ok, data } envelope on successful responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Strip Content-Type for FormData (browser sets the correct multipart boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(url, { ...options, headers });

  let parsed: unknown;
  try {
    const text = await response.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      (parsed as Record<string, string>)?.error ??
      (parsed as Record<string, string>)?.message ??
      `HTTP ${response.status}`;
    throw new ApiError(response.status, message, parsed);
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
