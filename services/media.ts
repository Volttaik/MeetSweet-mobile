/**
 * Media upload service — presigned R2 direct-upload with server-side registration.
 *
 * Flow:
 *   1. GET /api/credentials/upload-url  → presigned R2 PUT URL + object_key
 *   2. PUT file blob directly to R2 via fetch() (works on native without CORS restrictions;
 *      on web depends on R2 bucket CORS config)
 *   3. POST /api/media  → register the file with the API server → get a stable media ID
 *
 * The media ID from step 3 is what goes into createPost({ media_ids: [...] }).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '@/services/api';
import {
  requestUploadUrl,
  requestDownloadUrl,
  getBrokerConfig,
} from '@/services/credentials';

export { normaliseMime, isAcceptedMime, extFromMime } from '@/services/storage/upload';
import { normaliseMime, extFromMime } from '@/services/storage/upload';

export interface UploadedMedia {
  /** Stable media record ID from POST /api/media — pass to createPost as media_id */
  id: string;
  /** R2 object key issued by the broker. */
  objectKey: string;
  /** MIME type used for the upload. */
  mimeType: string;
  /** Number of bytes uploaded. */
  sizeBytes: number;
  /** Public URL for display */
  url: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
  thumbnailUrl: string | null;
}

function mediaType(mime: string): UploadedMedia['type'] {
  if (mime.startsWith('image/'))  return 'image';
  if (mime.startsWith('video/'))  return 'video';
  if (mime.startsWith('audio/'))  return 'audio';
  if (
    mime === 'application/pdf' ||
    mime.startsWith('application/vnd.') ||
    mime === 'text/plain' ||
    mime === 'application/rtf' ||
    mime === 'application/msword'
  ) return 'document';
  return 'other';
}

/**
 * Upload a media file.
 *
 * @param uri        - Local file URI from expo-image-picker / expo-document-picker
 * @param mimeType   - Raw MIME type from the OS (auto-normalised)
 * @param filename   - Original filename (extension inferred from MIME if missing)
 * @param onProgress - Optional progress callback (0–1); currently fires 0 then 1
 */
export async function uploadMedia(
  uri: string,
  mimeType: string,
  filename?: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedMedia> {
  const mime = normaliseMime(mimeType);
  const ext  = extFromMime(mime);
  const name = filename?.includes('.') ? filename : `${filename ?? 'media'}.${ext}`;
  const type = mediaType(mime);

  const token = await AsyncStorage.getItem('@ms_access_token');
  if (!token) throw new Error('Not authenticated');

  onProgress?.(0);

  // ── Step 1: get presigned R2 PUT URL ───────────────────────────────────────
  const folder = type === 'image' || type === 'video' || type === 'audio'
    ? 'posts' as const
    : 'documents' as const;
  const { upload_url, object_key, max_bytes } = await requestUploadUrl(mime, folder);

  // ── Step 2: fetch local file as blob ───────────────────────────────────────
  let blob: Blob;
  try {
    const fileRes = await fetch(uri);
    if (!fileRes.ok) throw new Error(`Could not read file (status ${fileRes.status})`);
    blob = await fileRes.blob();
  } catch (err) {
    throw new Error(
      `Could not read the selected file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (blob.size > max_bytes) {
    const limitMb = (max_bytes / 1024 / 1024).toFixed(0);
    throw new Error(`File is too large. Maximum size for this type is ${limitMb} MB.`);
  }

  // ── Step 3: PUT blob directly to R2 ───────────────────────────────────────
  // Using fetch() instead of XHR: avoids the XHR CORS limitation that causes
  // "network error" on the Expo web preview. On native, fetch() never enforces
  // browser CORS rules so it works unconditionally.
  try {
    const putRes = await fetch(upload_url, {
      method:  'PUT',
      headers: { 'Content-Type': mime },
      body:    blob,
    });
    if (!putRes.ok) {
      throw new Error(`R2 upload rejected: HTTP ${putRes.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // CORS on web shows up as "Failed to fetch" with no status code
    if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) {
      throw new Error(
        'Upload blocked by browser security policy. ' +
        'Please test using the Expo Go app on your device instead of the web preview.',
      );
    }
    throw new Error(`Upload to storage failed: ${msg}`);
  }

  onProgress?.(0.85);

  // ── Step 4: build public URL and register the media with the API server ────
  let publicUrl = '';
  try {
    const cfg = await getBrokerConfig();
    if (cfg.r2_public_base_url) {
      publicUrl = `${cfg.r2_public_base_url.replace(/\/+$/, '')}/${object_key}`;
    }
  } catch {
    // Fall back to a broker-signed download URL below.
  }

  if (!publicUrl) {
    const download = await requestDownloadUrl(object_key);
    publicUrl = download.url;
  }

  // POST /api/media to create a media record and get a stable ID
  let mediaId = object_key; // fallback: use object_key if registration fails
  let registeredUrl = publicUrl;

  const mediaRecord = await authFetch<Record<string, unknown>>(
    '/media',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        url:        publicUrl,
        blob_path:  object_key,
        type:       type === 'image' ? 'image' : type === 'video' ? 'video' : 'image',
        mime_type:  mime,
        size_bytes: blob.size,
      }),
    },
  );
  // Unwrap: authFetch already unwraps {ok,data} so mediaRecord is { media: { id, url, ... } }
  const rec = (mediaRecord as Record<string, unknown>);
  const inner = (rec.media ?? rec) as Record<string, unknown>;
  if (!inner.id) throw new Error('Upload completed but media registration returned no ID');
  mediaId = String(inner.id);
  if (inner.url) registeredUrl = String(inner.url);

  onProgress?.(1);

  return {
    id:           mediaId,
    objectKey:    object_key,
    mimeType:     mime,
    sizeBytes:    blob.size,
    url:          registeredUrl || publicUrl,
    type,
    thumbnailUrl: null,
  };
}
