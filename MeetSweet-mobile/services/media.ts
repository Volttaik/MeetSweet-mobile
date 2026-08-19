/**
 * Media Service — File and image uploads to backend.
 *
 * Uploads POST multipart/form-data with a `file` field to /api/upload
 * (the server rejects the request with 'Missing "file" field in form data'
 * when the file part is absent or not a real file).
 */
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { getAccessToken } from '@/lib/session-storage';
import { ApiError, getApiBase, refreshAccessToken, apiFetch } from './api';

const CLIENT_APP_ID = 'meetsweet-mobile';

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

export async function uploadMedia(
  uri: string,
  mimeType = 'image/jpeg',
  fileName = 'upload.jpg',
  onProgress?: (progress: number) => void,
  meta?: UploadMediaMeta,
  /** Request server-side transcoding (Cloudflare Stream) for long-form videos. */
  transcode?: boolean,
): Promise<{ id: string; url: string; media_type?: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const uploaded = await uploadOnce(uri, mimeType, fileName, token, onProgress, meta, false, transcode);

  // Best-effort: attach width/height/duration to the media record so the API
  // can return real aspect ratio + duration (instant sizing, no layout jump).
  if (uploaded.id && (meta?.width || meta?.height || meta?.durationSecs)) {
    try {
      const patchToken = await getAccessToken();
      if (patchToken) {
        await apiFetch(`/media/${uploaded.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${patchToken}` },
          body: JSON.stringify({
            width: meta?.width ? Math.round(meta.width) : undefined,
            height: meta?.height ? Math.round(meta.height) : undefined,
            duration_seconds: meta?.durationSecs ? Math.round(meta.durationSecs) : undefined,
          }),
        });
      }
    } catch {
      // Non-critical — playback still works, just with default sizing.
    }
  }

  return uploaded;
}

async function uploadOnce(
  uri: string,
  mimeType: string,
  fileName: string,
  token: string,
  onProgress?: (progress: number) => void,
  _meta?: UploadMediaMeta,
  _retried = false,
  transcode?: boolean,
): Promise<{ id: string; url: string; media_type?: string }> {
  const formData = new FormData();
  if (transcode) formData.append('transcode', '1');

  if (Platform.OS === 'web') {
    // Web: expo-image-picker returns a blob:/data: URI. Browser FormData
    // cannot upload a { uri, type, name } object (it stringifies it to
    // "[object Object]"), so resolve the URI into a real Blob first.
    const blob = await (await fetch(uri)).blob();
    formData.append('file', blob.type ? blob : new Blob([blob], { type: mimeType }), fileName);
  } else {
    // Native — Expo SDK 54: append the file as a native `File` (a Blob).
    // React Native's legacy { uri, type, name } FormData object can silently
    // drop the file part on Android (the server then rejects with
    // 'Missing "file" field in form data'). expo/fetch converts the native
    // File by reading its bytes, so the part is always present.
    const file = new File(uri);
    if (file.size === 0) {
      throw new Error('The selected file could not be read. Please select it again.');
    }
    formData.append('file', file, fileName);
  }

  if (onProgress) onProgress(0.3);

  const resp = await expoFetch(`${getApiBase()}/upload`, {
    method: 'POST',
    headers: {
      'X-Client-App-Id': CLIENT_APP_ID,
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (onProgress) onProgress(1.0);

  let parsed: unknown = null;
  try {
    const text = await resp.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  // Retry once after a transparent token refresh on 401 (parity with apiFetch).
  if (resp.status === 401 && !_retried) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return uploadOnce(uri, mimeType, fileName, newToken, onProgress, _meta, true, transcode);
    }
  }

  if (!resp.ok) {
    const p = parsed as Record<string, string> | null;
    const message = p?.error ?? p?.message ?? `HTTP ${resp.status}`;
    throw new ApiError(resp.status, message, p?.code, parsed);
  }

  // Unwrap the standard { ok: true, data: ... } envelope.
  const envelope = parsed as { ok?: boolean; data?: unknown } | null;
  const data = envelope && typeof envelope === 'object' && 'ok' in envelope ? envelope.data : parsed;
  const res = (data ?? parsed) as Record<string, unknown> & {
    url?: string;
    file_url?: string;
    id?: string;
    media_id?: string;
    media_type?: string;
    data?: { url?: string; id?: string };
  };

  const url = res.url || res.file_url || res.data?.url || uri;
  const id = res.id || res.media_id || res.data?.id || url;

  return {
    id,
    url,
    media_type: res.media_type || (mimeType.startsWith('video') ? 'video' : 'image'),
  };
}
