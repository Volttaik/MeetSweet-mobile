/**
 * Media Service — direct-to-storage uploads (Cloudflare R2).
 *
 * The old architecture POSTed the whole file as multipart/form-data to
 * `/api/upload`, which buffered the entire media file in the Vercel serverless
 * request body and hit the platform body limit (HTTP 413) for anything above a
 * few MB. That path is removed.
 *
 * The new flow never sends media bytes through the MeetSweet API:
 *
 *   1. POST /api/uploads              → authorize the upload; the server issues
 *       a presigned R2 PUT (small files) or a multipart upload id + presigned
 *       part URLs (large files).
 *   2. PUT bytes directly to R2       → single object, or per-part with ETag
 *       tracking and per-part retry.
 *   3. POST /api/uploads/:id/complete → the server validates ownership + parts,
 *       finalizes the object in R2, and only then creates the media record.
 *
 * The API handles authorization, metadata and database rows; R2 handles the
 * actual bytes. No R2 access/secret keys ever reach the client.
 *
 * MEMORY: native byte ranges are read straight from disk with a FileHandle
 * (one part at a time), so memory stays constant no matter how large the
 * file is. The previous implementation used `File.slice()`, whose
 * expo-file-system implementation calls `bytesSync()` — reading the ENTIRE
 * file into the JS heap for EVERY part (Android OOMs above ~100 MB on its
 * 256 MB Hermes heap). See the `UploadSource` helper below.
 */
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { getAccessToken } from '@/lib/session-storage';
import { ApiError, authFetch } from './api';

/**
 * Optional media metadata captured at upload time (from the picker asset).
 * Sent to the server so playback can size/seek correctly immediately instead
 * of waiting for the first decoded frame. Best-effort — never blocks publish.
 */
export interface UploadMediaMeta {
  width?: number;
  height?: number;
  durationSecs?: number;
}

// ─── Server contract types ────────────────────────────────────────────────────

interface UploadPartAuth {
  partNumber: number;
  uploadUrl: string;
}

interface CreateSessionResponse {
  id: string;
  key: string;
  mode: 'single' | 'multipart';
  upload_url?: string;
  upload_id?: string;
  part_size?: number;
  part_count?: number;
  parts?: UploadPartAuth[];
  expires_in?: number;
  session_expires_in?: number;
  max_bytes?: number;
}

interface CompleteSessionResponse {
  media?: { id?: string; url?: string; type?: string };
  id?: string;
  media_id?: string;
  url?: string;
  media_type?: string;
  key?: string;
}

export interface UploadMediaResult {
  id: string;
  url: string;
  media_type?: string;
}

/**
 * Raised when the upload is cancelled by the user (never a network/server
 * failure). The upload pipeline treats it specially: the R2 session is aborted
 * server-side and the job is removed instead of being marked "failed".
 */
export class UploadCancelledError extends Error {
  constructor(message = 'Upload cancelled') {
    super(message);
    this.name = 'UploadCancelledError';
  }
}

/**
 * Raised when the upload can NEVER succeed by retrying — the local source file
 * is missing/unreadable. Retrying the same job is pointless, so the manager
 * marks the job unrecoverable and the UI offers "select another video" instead
 * of a Retry button.
 */
export class UploadSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadSourceError';
  }
}

/**
 * True when retrying the same job can never succeed (missing source file, or a
 * server rejection that a new attempt will repeat, e.g. file too large or an
 * unsupported format). Network failures and expired sessions stay recoverable.
 */
export function isUnrecoverableUploadError(e: unknown): boolean {
  if (e instanceof UploadSourceError) return true;
  if (e instanceof ApiError) {
    return e.code === 'FILE_TOO_LARGE' || e.code === 'UNSUPPORTED_MIME';
  }
  return false;
}

const MAX_PART_ATTEMPTS = 4;

// expo/fetch (like RN fetch) has NO timeout of its own — a stalled connection
// rejects never, so a dead part would hang the upload forever with progress
// frozen (the "stuck at 8%" symptom). Every byte-transfer request gets a hard
// deadline so a hung connection fails, hits the existing retry/backoff, and
// eventually surfaces a real "Upload failed" state instead of freezing.
const PART_REQUEST_TIMEOUT_MS = 90_000;   // one 10 MiB part, slow-but-working connections included
const SINGLE_PUT_TIMEOUT_MS   = 300_000;  // whole-file PUT (files ≤ 20 MB)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new UploadCancelledError();
}

/**
 * expo/fetch wrapper that combines the caller's cancel signal with a hard
 * timeout. Returns the response, or rejects (AbortError on timeout, the
 * fetch's own error on cancel) — the caller distinguishes the two via
 * `signal.aborted`.
 */
async function fetchWithTimeout(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: Blob | ArrayBuffer },
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  throwIfAborted(signal);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await expoFetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    // A user cancel is not a failure — the upload pipeline turns it into
    // UploadCancelledError (removed, not marked failed).
    if (signal?.aborted) throw new UploadCancelledError();
    // A hard timeout (dead connection) is a real, retryable failure with a
    // human-readable message, not a bare "aborted" DOMException.
    if (timedOut) throw new Error('Upload timed out. Check your connection and try again.');
    // A bare network failure (TypeError "Network request failed" / DNS
    // resolution failure) must never reach the user as raw developer text —
    // normalise it into the same friendly, retryable app-level error.
    if (e instanceof TypeError) {
      throw new ApiError(0, 'Network error. Check your connection and try again.', 'NETWORK_ERROR');
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * A lazily-read upload source.
 *
 * Native: byte ranges are read straight from disk via a FileHandle, so memory
 * stays CONSTANT — one part at a time — never the whole file. This is what
 * makes 100–200 MB uploads work: `File.slice()` (the previous approach)
 * materialises the ENTIRE file into the JS heap on every part through
 * `bytesSync()`, which throws java.lang.OutOfMemoryError above ~100 MB on
 * Android's 256 MB Hermes heap.
 *
 * Web: a real Blob, whose `.slice()` is a cheap view rather than a copy.
 */
interface UploadSource {
  /** Total byte size of the file. */
  size: number;
  /** Read exactly `length` bytes starting at `start`. */
  readPart(start: number, length: number): Promise<Blob | ArrayBuffer>;
  /** Read the whole file (single-PUT path — files are ≤ 20 MB there). */
  readWhole(): Promise<Blob | ArrayBuffer>;
}

/** Read a byte range from a native file with constant memory. */
function readNativeRange(file: File, start: number, length: number): ArrayBuffer {
  const handle = file.open();
  try {
    handle.offset = start;
    const bytes = handle.readBytes(length);
    // readBytes may hand back a reused buffer — slice() detaches a fresh copy
    // so the chunk stays valid after the handle is closed. Peak memory is 2×
    // the part size, constant regardless of how large the file is.
    return bytes.slice().buffer;
  } finally {
    handle.close();
  }
}

async function resolveSource(uri: string, mimeType: string): Promise<UploadSource> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const typed = blob.type ? blob : new Blob([blob], { type: mimeType });
    return {
      size: typed.size,
      readPart: (start, length) => Promise.resolve(typed.slice(start, start + length, mimeType)),
      readWhole: () => Promise.resolve(typed),
    };
  }
  const file = new File(uri);
  if (file.size === 0) {
    throw new UploadSourceError('The selected file could not be read. Please select it again.');
  }
  return {
    size: file.size,
    readPart: async (start, length) => readNativeRange(file, start, length),
    readWhole: async () => readNativeRange(file, 0, file.size),
  };
}

/**
 * Authorize an upload with the server. Returns a single presigned PUT or a
 * multipart session. No bytes are sent here — only metadata.
 */
async function createSession(
  token: string,
  mimeType: string,
  fileName: string,
  sizeBytes: number,
  transcode: boolean,
): Promise<CreateSessionResponse> {
  return authFetch<CreateSessionResponse>('/uploads', token, {
    method: 'POST',
    body: JSON.stringify({
      mime_type: mimeType,
      file_name: fileName,
      size_bytes: sizeBytes,
      transcode,
    }),
  });
}

/** Re-issue a fresh presigned URL for a single part (expired-URL recovery). */
async function reissuePartUrl(
  token: string,
  sessionId: string,
  partNumber: number,
): Promise<string> {
  const part = await authFetch<{ partNumber: number; uploadUrl: string }>(
    `/uploads/${sessionId}/parts/${partNumber}`,
    token,
    { method: 'POST' },
  );
  if (!part?.uploadUrl) {
    throw new ApiError(502, 'Failed to re-issue part upload URL', 'PART_URL_FAILED');
  }
  return part.uploadUrl;
}

/** Abort an in-flight session (best-effort cleanup on failure/cancel). */
async function abortSession(token: string, sessionId: string): Promise<void> {
  try {
    await authFetch<unknown>(`/uploads/${sessionId}`, token, { method: 'DELETE' });
  } catch {
    // Best-effort — never mask the original upload error.
  }
}

/** Single PUT: the whole object goes straight to R2 via the presigned URL. */
async function uploadSingle(
  session: CreateSessionResponse,
  source: UploadSource,
  mimeType: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!session.upload_url) throw new Error('Upload authorization is missing its upload URL.');

  onProgress?.(clampProgress(0.3));

  const body = await source.readWhole();
  throwIfAborted(signal);

  // The presigned URL's signature covers Content-Type, so it MUST match the
  // mime type the server signed (otherwise R2 returns 403 SignatureDoesNotMatch).
  // A plain Uint8Array body (native) is never auto-overridden by expo/fetch —
  // only Blob bodies get their Content-Type replaced — so the header survives.
  const resp = await fetchWithTimeout(
    session.upload_url,
    { method: 'PUT', headers: { 'Content-Type': mimeType }, body },
    SINGLE_PUT_TIMEOUT_MS,
    signal,
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ApiError(resp.status, text || `Upload failed (HTTP ${resp.status})`, 'R2_UPLOAD_FAILED');
  }

  onProgress?.(clampProgress(0.95));
}

/**
 * Upload one multipart part with independent retry. On a 403 (expired presigned
 * URL) the URL is re-issued and the same part retried — the rest of the upload
 * is never restarted.
 */
async function uploadPartWithRetry(
  token: string,
  session: CreateSessionResponse,
  partNumber: number,
  chunk: Blob | ArrayBuffer,
  urlByPart: Map<number, string>,
  signal?: AbortSignal,
): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_PART_ATTEMPTS; attempt++) {
    // A user cancel must stop immediately — never retry an aborted part.
    throwIfAborted(signal);

    let url = urlByPart.get(partNumber);
    if (!url) {
      url = await reissuePartUrl(token, session.id, partNumber);
      urlByPart.set(partNumber, url);
    }

    try {
      // Hard deadline per attempt: a hung connection fails here (and retries
      // below) instead of freezing the upload at its last reported progress.
      const resp = await fetchWithTimeout(
        url,
        { method: 'PUT', body: chunk },
        PART_REQUEST_TIMEOUT_MS,
        signal,
      );

      if (resp.ok) {
        // R2/S3 return the part ETag (quoted). It must be forwarded verbatim
        // to CompleteMultipartUpload, quotes included.
        const etag = resp.headers.get('ETag') ?? resp.headers.get('etag');
        if (!etag) {
          throw new Error(`Part ${partNumber} completed without an ETag.`);
        }
        return etag;
      }

      if (resp.status === 403 || resp.status === 400) {
        // Presigned URL expired or was invalidated — drop it so the next
        // attempt re-issues a fresh one.
        urlByPart.delete(partNumber);
      }

      const text = await resp.text().catch(() => '');
      lastError = new ApiError(
        resp.status,
        text || `Part ${partNumber} failed (HTTP ${resp.status})`,
        'PART_UPLOAD_FAILED',
      );
    } catch (e) {
      // A caller cancel is not a transient failure — propagate immediately.
      if (signal?.aborted) throw new UploadCancelledError();
      lastError = e;
    }

    if (attempt < MAX_PART_ATTEMPTS - 1) {
      await sleep(Math.min(500 * 2 ** attempt, 4000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Part ${partNumber} failed.`);
}

/** Multipart: read each part with constant memory, upload directly to R2, collect ETags. */
async function uploadMultipart(
  token: string,
  session: CreateSessionResponse,
  source: UploadSource,
  mimeType: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<Array<{ partNumber: number; etag: string }>> {
  const partCount = session.part_count ?? 0;
  const partSize = session.part_size ?? 0;
  const parts = session.parts ?? [];

  if (!partCount || !partSize || parts.length !== partCount) {
    throw new Error('Multipart upload authorization is incomplete.');
  }

  const urlByPart = new Map<number, string>(
    parts.map((p) => [p.partNumber, p.uploadUrl]),
  );

  const uploaded: Array<{ partNumber: number; etag: string }> = [];
  for (let i = 0; i < partCount; i++) {
    throwIfAborted(signal);

    const partNumber = i + 1;
    const start = i * partSize;
    const length = Math.min(source.size - start, partSize);

    // Constant memory: reads ONLY this part from disk (native FileHandle) or
    // slices a Blob view (web) — the whole file is never materialised at once.
    const chunk = await source.readPart(start, length);
    const etag = await uploadPartWithRetry(token, session, partNumber, chunk, urlByPart, signal);
    uploaded.push({ partNumber, etag });

    // BYTE-accurate progress: report how many bytes have actually been stored
    // in R2, mapped into the transfer band (0.1 → 0.95). Because it is driven
    // by completed bytes — not an arbitrary estimate — it advances smoothly
    // per part and never regresses below the pre-transfer milestones.
    const bytesDone = Math.min(source.size, (i + 1) * partSize);
    onProgress?.(clampProgress(0.1 + 0.85 * (bytesDone / source.size)));
  }

  return uploaded;
}

/**
 * Finalize the upload. The server validates ownership and the reported parts,
 * completes the multipart upload (or HEADs the single object), then creates the
 * media record. A media row only ever exists after the bytes are in storage.
 */
async function completeSession(
  token: string,
  sessionId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<CompleteSessionResponse> {
  return authFetch<CompleteSessionResponse>(`/uploads/${sessionId}/complete`, token, {
    method: 'POST',
    body: JSON.stringify({ parts }),
  });
}

/**
 * Upload a media file directly to R2 and register it with the server.
 *
 * Signature and return shape are unchanged from the legacy implementation so
 * every caller (posts, shorts, albums, chat media, avatars/banners) migrates
 * without modification.
 */
export interface UploadMediaOptions {
  /** Abort the upload (user cancel). In-flight requests are aborted and the
   *  R2 session is aborted server-side so no orphan parts are left behind. */
  signal?: AbortSignal;
  /** Called with the server session id once the upload is authorized, so the
   *  caller can abort the R2 multipart upload on cancel. */
  onSession?: (sessionId: string) => void;
}

export async function uploadMedia(
  uri: string,
  mimeType = 'image/jpeg',
  fileName = 'upload.jpg',
  onProgress?: (progress: number) => void,
  meta?: UploadMediaMeta,
  /** Request server-side transcoding (Cloudflare Stream) for long-form videos. */
  transcode?: boolean,
  options?: UploadMediaOptions,
): Promise<UploadMediaResult> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  // Progress is strictly MONOTONIC: it can only move forward. The multipart
  // path reports per-part byte progress that can otherwise land BELOW the
  // pre-transfer milestone (e.g. 1/12 parts → 8% after the 10% "authorized"
  // step), which visibly makes the bar crawl backwards and appear stuck.
  let lastProgress = 0;
  const report = (p: number): void => {
    const clamped = clampProgress(p);
    if (clamped > lastProgress) {
      lastProgress = clamped;
      onProgress?.(clamped);
    }
  };

  report(0.05);

  const source = await resolveSource(uri, mimeType);

  // 1. Authorize — metadata only, no bytes through the API body.
  const session = await createSession(token, mimeType, fileName, source.size, transcode === true);
  report(0.1);
  options?.onSession?.(session.id);

  let sessionId: string | null = session.id;
  try {
    // 2. Upload bytes directly to R2.
    let parts: Array<{ partNumber: number; etag: string }> = [];
    if (session.mode === 'multipart') {
      parts = await uploadMultipart(token, session, source, mimeType, report, options?.signal);
    } else {
      await uploadSingle(session, source, mimeType, report, options?.signal);
    }

    throwIfAborted(options?.signal);

    // 3. Finalize — server validates + creates the media record.
    const result = await completeSession(token, session.id, parts);
    sessionId = null; // completed — no abort needed below

    const id = result.id || result.media_id || result.media?.id || '';
    const url = result.url || result.media?.url || '';

    if (!id) {
      throw new ApiError(502, 'Server completed the upload but returned no media id.', 'MISSING_MEDIA_ID');
    }

    const uploaded: UploadMediaResult = {
      id,
      url,
      media_type: result.media_type || (mimeType.startsWith('video') ? 'video' : 'image'),
    };

    // Best-effort: attach width/height/duration to the media record so the API
    // can return real aspect ratio + duration (instant sizing, no layout jump).
    if (meta?.width || meta?.height || meta?.durationSecs) {
      try {
        await authFetch(`/media/${id}`, token, {
          method: 'PATCH',
          body: JSON.stringify({
            width: meta?.width ? Math.round(meta.width) : undefined,
            height: meta?.height ? Math.round(meta.height) : undefined,
            duration_seconds: meta?.durationSecs ? Math.round(meta.durationSecs) : undefined,
          }),
        });
      } catch {
        // Non-critical — playback still works, just with default sizing.
      }
    }

    return uploaded;
  } catch (e) {
    // A user cancel aborts the R2 multipart upload server-side so no orphan
    // parts are ever left behind. Failed uploads do the same cleanup.
    if (sessionId) {
      await abortSession(token, sessionId);
    }
    // Surface cancellations as such so the caller can distinguish them from
    // real failures (a cancelled job is removed, never shown as "failed").
    if (options?.signal?.aborted || e instanceof UploadCancelledError) {
      throw new UploadCancelledError();
    }
    throw e;
  }
}
