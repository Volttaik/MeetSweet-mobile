/**
 * Credential Broker Client
 *
 * Talks to the MeetSweet credential broker backend.
 * The broker only handles: auth, credential issuance, scoped upload/download
 * URLs, and safe named database queries. It never exposes raw secrets.
 *
 * Backend: deployed Next.js app (credential broker).
 * Set EXPO_PUBLIC_BROKER_URL to override the default.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLIENT_APP_ID = 'meetsweet-mobile';

export function getBrokerBase(): string {
  const url = process.env.EXPO_PUBLIC_BROKER_URL ?? process.env.EXPO_PUBLIC_API_URL;
  if (url) return `${url.replace(/\/+$/, '')}/api`;
  return 'https://meetsweet.space/api';
}

export class BrokerError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'BrokerError';
  }
}

async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

async function brokerFetch<T>(
  path: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${getBrokerBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-App-Id': CLIENT_APP_ID,
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body instanceof FormData) delete headers['Content-Type'];
  const response = await fetch(url, { ...options, headers });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const msg =
      (parsed as Record<string, string>)?.error ??
      (parsed as Record<string, string>)?.message ??
      `HTTP ${response.status}`;
    const code = (parsed as Record<string, string>)?.code;
    throw new BrokerError(response.status, msg, code);
  }
  const env = parsed as { ok?: boolean; data?: unknown } | null;
  if (env && typeof env === 'object' && 'ok' in env) {
    if (env.ok === false) {
      const errorEnvelope = env as { error?: string; code?: string };
      throw new BrokerError(
        response.status,
        errorEnvelope.error ?? 'The server rejected the request.',
        errorEnvelope.code,
      );
    }
    if ('data' in env) return env.data as T;
  }
  return parsed as T;
}

async function authedBrokerFetch<T>(
  path: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new BrokerError(401, 'Not authenticated');
  return brokerFetch<T>(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// ─── Upload URL ───────────────────────────────────────────────────────────────

export interface UploadUrlResult {
  upload_url: string;
  object_key: string;
  expires_in: number;
  max_bytes: number;
}

/**
 * Request a presigned R2 PUT URL from the broker.
 * The app then uploads directly to R2 — permanent secrets never leave the broker.
 */
export async function requestUploadUrl(
  mimeType: string,
  folder: 'uploads' | 'avatars' | 'posts' | 'documents' = 'uploads',
  sizeBytes?: number,
): Promise<UploadUrlResult> {
  const qs = new URLSearchParams({ mime_type: mimeType, folder });
  if (sizeBytes !== undefined) qs.set('size_bytes', String(sizeBytes));
  const raw = await authedBrokerFetch<Record<string, unknown>>(
    `/credentials/upload-url?${qs}`,
  );
  const uploadUrl = raw.upload_url ?? raw.uploadUrl;
  const objectKey = raw.object_key ?? raw.key;
  const expiresIn = raw.expires_in ?? raw.expiresIn;
  const maxBytes = raw.max_bytes ?? raw.maxBytes;

  if (
    typeof uploadUrl !== 'string' ||
    typeof objectKey !== 'string' ||
    typeof expiresIn !== 'number' ||
    typeof maxBytes !== 'number'
  ) {
    throw new BrokerError(502, 'Upload service returned an invalid upload URL response');
  }

  return {
    upload_url: uploadUrl,
    object_key: objectKey,
    expires_in: expiresIn,
    max_bytes: maxBytes,
  };
}

// ─── Download URL ─────────────────────────────────────────────────────────────

export interface DownloadUrlResult {
  url: string;
  expires_in: number;
}

/**
 * Request a presigned R2 GET URL for an object key the broker issued.
 */
export async function requestDownloadUrl(objectKey: string): Promise<DownloadUrlResult> {
  const raw = await authedBrokerFetch<Record<string, unknown>>(
    `/credentials/download-url?key=${encodeURIComponent(objectKey)}`,
  );
  const url = raw.url;
  const expiresIn = raw.expires_in ?? raw.expiresIn;
  if (typeof url !== 'string' || typeof expiresIn !== 'number') {
    throw new BrokerError(502, 'Download service returned an invalid URL response');
  }
  return { url, expires_in: expiresIn };
}

// ─── Named Database Queries ───────────────────────────────────────────────────

export type NamedQuery = 'get_profile' | 'get_settings' | 'get_account';

export async function runDatabaseQuery<T = unknown>(
  query: NamedQuery,
): Promise<{ query: NamedQuery; data: T }> {
  return authedBrokerFetch<{ query: NamedQuery; data: T }>('/credentials/database', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

// ─── Broker Config ────────────────────────────────────────────────────────────

export interface BrokerConfig {
  r2_public_base_url: string | null;
  app_id: string;
  upload_limits: { image: number; video: number; audio: number; document: number };
  allowed_mime_types: {
    image: string[];
    video: string[];
    audio: string[];
    document: string[];
  };
}

let _configCache: BrokerConfig | null = null;
let _configFetchedAt = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000;

export async function getBrokerConfig(): Promise<BrokerConfig> {
  if (_configCache && Date.now() - _configFetchedAt < CONFIG_TTL_MS) {
    return _configCache;
  }
  const cfg = await authedBrokerFetch<BrokerConfig>('/credentials/config');
  _configCache = cfg;
  _configFetchedAt = Date.now();
  return cfg;
}

// ─── Scoped Token ─────────────────────────────────────────────────────────────

export type BrokerScope = 'r2:upload' | 'r2:download';

export interface ScopedToken {
  credential: string;
  credential_id: string;
  expires_at: string;
  expires_in: number;
  scopes: BrokerScope[];
}

export async function requestScopedToken(
  scopes: BrokerScope[],
  ttlSeconds = 300,
): Promise<ScopedToken> {
  return authedBrokerFetch<ScopedToken>('/credentials/token', {
    method: 'POST',
    body: JSON.stringify({ scopes, ttl_seconds: ttlSeconds }),
  });
}

export async function revokeScopedToken(credential: string): Promise<void> {
  await authedBrokerFetch('/credentials/revoke', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}
