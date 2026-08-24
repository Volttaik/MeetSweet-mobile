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
 */
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

const MAX_PART_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Resolve the picker/recorder URI into a Blob-like body plus its byte size.
 * Native uses expo-file-system's File (reads the on-disk file lazily).
 */
async function resolveBody(uri: string, mimeType: string): Promise<Blob> {
  const file = new File(uri);
  if (file.size === 0) {
    throw new Error('The selected file could not be read. Please select it again.');
  }
  return file as unknown as Blob;
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
  body: Blob,
  mimeType: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (!session.upload_url) throw new Error('Upload authorization is missing its upload URL.');

  onProgress?.(clampProgress(0.3));

  // The presigned URL's signature covers Content-Type, so it MUST match the
  // mime type the server signed (otherwise R2 returns 403 SignatureDoesNotMatch).
  const resp = await expoFetch(session.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body,
  });

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
  chunk: Blob,
  urlByPart: Map<number, string>,
): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_PART_ATTEMPTS; attempt++) {
    let url = urlByPart.get(partNumber);
    if (!url) {
      url = await reissuePartUrl(token, session.id, partNumber);
      urlByPart.set(partNumber, url);
    }

    try {
      const resp = await expoFetch(url, {
        method: 'PUT',
        body: chunk,
      });

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
      lastError = e;
    }

    if (attempt < MAX_PART_ATTEMPTS - 1) {
      await sleep(Math.min(500 * 2 ** attempt, 4000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Part ${partNumber} failed.`);
}

/** Multipart: slice the body into parts, upload each directly to R2, collect ETags. */
async function uploadMultipart(
  token: string,
  session: CreateSessionResponse,
  body: Blob,
  mimeType: string,
  onProgress?: (progress: number) => void,
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
    const partNumber = i + 1;
    const start = i * partSize;
    const end = Math.min(body.size, start + partSize);

    const chunk = body.slice(start, end, mimeType);
    const etag = await uploadPartWithRetry(token, session, partNumber, chunk, urlByPart);
    uploaded.push({ partNumber, etag });

    onProgress?.(clampProgress(uploaded.length / partCount));
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
export async function uploadMedia(
  uri: string,
  mimeType = 'image/jpeg',
  fileName = 'upload.jpg',
  onProgress?: (progress: number) => void,
  meta?: UploadMediaMeta,
  /** Request server-side transcoding (Cloudflare Stream) for long-form videos. */
  transcode?: boolean,
): Promise<UploadMediaResult> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  onProgress?.(clampProgress(0.05));

  const body = await resolveBody(uri, mimeType);

  // 1. Authorize — metadata only, no bytes through the API body.
  const session = await createSession(token, mimeType, fileName, body.size, transcode === true);
  onProgress?.(clampProgress(0.1));

  let sessionId: string | null = session.id;
  try {
    // 2. Upload bytes directly to R2.
    let parts: Array<{ partNumber: number; etag: string }> = [];
    if (session.mode === 'multipart') {
      parts = await uploadMultipart(token, session, body, mimeType, onProgress);
    } else {
      await uploadSingle(session, body, mimeType, onProgress);
    }

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
    // Cancel any in-flight multipart upload in R2 so a failed/abandoned upload
    // never leaves billable orphan parts behind. Safe no-op if already done.
    if (sessionId) {
      await abortSession(token, sessionId);
    }
    throw e;
  }
}
