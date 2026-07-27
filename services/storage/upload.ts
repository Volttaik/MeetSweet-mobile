/**
 * Upload Service — Presigned R2 Direct Upload
 *
 * Flow:
 *   1. App calls requestUploadUrl() on the credential broker → gets a presigned PUT URL
 *   2. App PUTs the file bytes directly to R2 using that URL
 *   3. App stores the returned object_key (never the raw R2 URL)
 *   4. App calls requestDownloadUrl(objectKey) to get a readable URL when needed
 *
 * Features:
 *   - Progress reporting
 *   - Retry with exponential back-off
 *   - Abort / cancellation via AbortController
 *   - Automatic MIME normalisation (handles Android/iOS variants)
 *   - Automatic extension detection
 *   - Graceful error messages — no "Unsupported File Type" crashes
 */

import { requestUploadUrl } from '@/services/credentials';

// ─── MIME normalisation ───────────────────────────────────────────────────────

/** Maps platform-variant MIME types to the canonical accepted MIME. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg':       'image/jpeg',
  'image/heic':      'image/jpeg',  // iOS HEIC → re-encoded by expo-image-picker
  'image/heif':      'image/jpeg',
  'image/tiff':      'image/jpeg',
  'image/bmp':       'image/png',
  'video/mov':       'video/quicktime',
  'video/x-m4v':     'video/mp4',
  'video/mpeg':      'video/mp4',
  'video/x-msvideo': 'video/mp4',
  'video/3gpp':      'video/mp4',
  'video/3gpp2':     'video/mp4',
  'audio/mp3':       'audio/mpeg',
  'audio/x-m4a':     'audio/mp4',
  'audio/m4a':       'audio/mp4',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg':    'jpg',
  'image/png':     'png',
  'image/webp':    'webp',
  'image/gif':     'gif',
  'video/mp4':     'mp4',
  'video/quicktime': 'mov',
  'video/webm':    'webm',
  'audio/mpeg':    'mp3',
  'audio/wav':     'wav',
  'audio/ogg':     'ogg',
  'audio/mp4':     'm4a',
  'audio/webm':    'webm',
  'application/pdf':  'pdf',
  'text/plain':    'txt',
  'application/rtf': 'rtf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Accepted top-level categories and their canonical MIME sets. */
const ACCEPTED_MIME_PREFIXES = ['image/', 'video/', 'audio/'] as const;
const ACCEPTED_MIME_EXACT = new Set([
  'application/pdf',
  'text/plain',
  'application/rtf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function normaliseMime(raw: string): string {
  const lower = (raw ?? '').toLowerCase().trim();
  return MIME_ALIASES[lower] ?? lower;
}

export function isAcceptedMime(mime: string): boolean {
  const m = normaliseMime(mime);
  if (ACCEPTED_MIME_PREFIXES.some((p) => m.startsWith(p))) return true;
  if (ACCEPTED_MIME_EXACT.has(m)) return true;
  return false;
}

export function extFromMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'bin';
}

export function folderFromMime(
  mime: string,
): 'posts' | 'avatars' | 'documents' | 'uploads' {
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/'))
    return 'posts';
  if (ACCEPTED_MIME_EXACT.has(mime)) return 'documents';
  return 'uploads';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadOptions {
  /** 0–1 progress callback */
  onProgress?: (progress: number) => void;
  /** Optional AbortController signal to cancel the upload */
  signal?: AbortSignal;
  /** Override the folder (default is auto-detected from MIME) */
  folder?: 'posts' | 'avatars' | 'documents' | 'uploads';
  /** Number of retry attempts on network failure (default 2) */
  retries?: number;
}

export interface UploadResult {
  /** R2 object key — store this, pass to requestDownloadUrl() to display */
  objectKey: string;
  /** MIME type that was actually used for the upload */
  mimeType: string;
  /** File category */
  category: 'image' | 'video' | 'audio' | 'document' | 'other';
}

// ─── Core upload ─────────────────────────────────────────────────────────────

function categoryFromMime(mime: string): UploadResult['category'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (ACCEPTED_MIME_EXACT.has(mime)) return 'document';
  return 'other';
}

/**
 * Upload a file directly to R2 via a broker-issued presigned PUT URL.
 *
 * @param uri     - Local file URI (from expo-image-picker or expo-document-picker)
 * @param rawMime - MIME type as reported by the OS (will be normalised)
 * @param options - Progress, cancellation, retry settings
 */
export async function uploadFile(
  uri: string,
  rawMime: string,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const { onProgress, signal, retries = 2 } = options;

  const mime = normaliseMime(rawMime);

  // Graceful rejection — never crash with "Unsupported File Type"
  if (!isAcceptedMime(mime)) {
    throw new Error(
      `The file type "${rawMime}" is not supported. Please use JPEG, PNG, WebP, GIF, MP4, MOV, WebM, MP3, WAV, PDF, DOCX, or XLSX.`,
    );
  }

  const folder = options.folder ?? folderFromMime(mime);

  // Step 1 — request presigned PUT URL from the broker
  const { upload_url, object_key, max_bytes } = await requestUploadUrl(mime, folder);

  // Step 2 — fetch the local file blob
  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();

  if (blob.size > max_bytes) {
    const limitMb = (max_bytes / 1024 / 1024).toFixed(0);
    throw new Error(`File is too large. The maximum size for this type is ${limitMb} MB.`);
  }

  // Step 3 — upload directly to R2 with retries
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new Error('Upload cancelled');
    try {
      await putToR2(upload_url, blob, mime, onProgress, signal);
      return {
        objectKey: object_key,
        mimeType: mime,
        category: categoryFromMime(mime),
      };
    } catch (err) {
      if (signal?.aborted) throw new Error('Upload cancelled');
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        // Exponential back-off: 500ms, 1000ms, …
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error('Upload failed after multiple attempts');
}

/** PUT the blob to R2 using XHR for progress support. */
function putToR2(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new Error('Upload cancelled'));
      });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    });

    xhr.addEventListener('load', () => {
      // R2 presigned PUT returns 200 on success
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () =>
      reject(new Error('Network error during upload. Check your connection and try again.')),
    );
    xhr.addEventListener('timeout', () =>
      reject(new Error('Upload timed out. Please try again.')),
    );

    xhr.timeout = 180_000; // 3 minutes
    xhr.send(blob);
  });
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Upload a media file (image or video) for use in a post.
 * Returns the object_key to store in the post record.
 */
export async function uploadPostMedia(
  uri: string,
  rawMime: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  return uploadFile(uri, rawMime, { ...options, folder: 'posts' });
}

/**
 * Upload an avatar image.
 */
export async function uploadAvatar(
  uri: string,
  rawMime: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  return uploadFile(uri, rawMime, { ...options, folder: 'avatars' });
}

/**
 * Upload a document.
 */
export async function uploadDocument(
  uri: string,
  rawMime: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  return uploadFile(uri, rawMime, { ...options, folder: 'documents' });
}
