/**
 * Central API service.
 * All API calls from the Expo app go through this module.
 *
 * Backend: the deployed MeetSweet Next.js API.
 * Override EXPO_PUBLIC_API_URL only when pointing at another environment.
 *
 * All service calls use paths like /auth/login, /posts, /users/me — this
 * function appends /api so they resolve to the correct Vercel routes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_API_ROOT = 'https://meetsweet-server.quizmi.space';
const ACCESS_TOKEN_KEY = '@ms_access_token';
const REFRESH_TOKEN_KEY = '@ms_refresh_token';

let authExpiredHandler: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function getApiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_ROOT;
  const root = configured.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${root}/api`;
}

export function setAuthExpiredHandler(handler: (() => void) | null): void {
  authExpiredHandler = handler;
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
 * Authenticated fetch wrapper. Prepends the API base URL automatically.
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

  // Strip Content-Type for FormData (browser sets correct multipart boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(url, { ...options, headers });
  let data = await parseJsonResponse(response);

  // Retry one time after refreshing an expired access token. The refresh call
  // uses fetch directly so a bad refresh token cannot recurse through here.
  if (response.status === 401 && !path.includes('/auth/refresh')) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      const retryResponse = await fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${refreshedToken}` },
      });
      data = await parseJsonResponse(retryResponse);
      if (retryResponse.ok) return unwrapEnvelope<T>(data);
    } else {
      authExpiredHandler?.();
    }
  }

  if (!response.ok) {
    const message =
      (data as Record<string, string>)?.error ??
      (data as Record<string, string>)?.message ??
      `HTTP ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return unwrapEnvelope<T>(data);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function unwrapEnvelope<T>(value: unknown): T {
  if (
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).ok === true &&
    Object.prototype.hasOwnProperty.call(value, 'data')
  ) {
    return (value as { data: T }).data;
  }
  return value as T;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    const response = await fetch(`${getApiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, refresh_token: refreshToken }),
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
      return null;
    }

    const data = unwrapEnvelope<Record<string, unknown>>(payload);
    const accessToken = String(data?.accessToken ?? data?.access_token ?? '');
    const nextRefreshToken = String(
      data?.refreshToken ?? data?.refresh_token ?? refreshToken,
    );
    if (!accessToken) return null;

    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
    return accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Authenticated fetch with Bearer token injected from AsyncStorage.
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
