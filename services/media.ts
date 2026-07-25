import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from './api';

export interface UploadedMedia {
  url: string;
  thumbnailUrl: string | null;
  type: 'image' | 'video';
  size: number;
  filename: string;
  originalName: string;
  mimeType: string;
}

/**
 * Backend allowed: image/jpeg, image/png, image/webp, image/gif,
 *                  video/mp4, video/quicktime, video/webm,
 *                  audio/mpeg, audio/wav, audio/ogg, audio/mp4
 * Normalise any device MIME type to one the backend will accept.
 */
function normalizeMime(raw: string, uri: string): string {
  const m = raw.toLowerCase().trim();
  // ── Images ──────────────────────────────────────────────────────────────
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  if (m === 'image/gif') return 'image/gif';
  if (
    m === 'image/jpeg' ||
    m === 'image/jpg' ||
    m === 'image/heic' ||
    m === 'image/heif' ||
    m === 'image/heic-sequence' ||
    m === 'image/heif-sequence' ||
    m.startsWith('image/')
  ) return 'image/jpeg';
  // ── Videos ──────────────────────────────────────────────────────────────
  if (m === 'video/quicktime' || m === 'video/mov') return 'video/quicktime';
  if (m === 'video/webm') return 'video/webm';
  if (
    m === 'video/mp4' ||
    m === 'video/x-m4v' ||
    m === 'video/avi' ||
    m === 'video/x-msvideo' ||
    m === 'video/3gpp' ||
    m.startsWith('video/')
  ) return 'video/mp4';
  // ── Audio ────────────────────────────────────────────────────────────────
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'audio/mpeg';
  if (m === 'audio/wav' || m === 'audio/x-wav') return 'audio/wav';
  if (m === 'audio/ogg') return 'audio/ogg';
  if (m === 'audio/mp4' || m === 'audio/m4a') return 'audio/mp4';
  if (m.startsWith('audio/')) return 'audio/mpeg';
  // ── Fallback: guess from URI extension ───────────────────────────────────
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'heic', 'heif'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (['mp4', 'avi', 'mkv', '3gp'].includes(ext)) return 'video/mp4';
  if (['mov', 'qt'].includes(ext)) return 'video/quicktime';
  // Default to JPEG for unknown types
  return 'image/jpeg';
}

/** Match a filename extension to the given MIME type. */
function normalizeFilename(name: string, mime: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
  };
  const wantExt = extMap[mime];
  if (!wantExt) return name;
  // Replace any non-matching image extension (heic, heif, jpg → jpg)
  const cleaned = name.replace(/\.(heic|heif)$/i, `.${wantExt}`);
  if (!/\.[a-z0-9]+$/i.test(cleaned)) return `${cleaned}.${wantExt}`;
  return cleaned;
}

export async function uploadMedia(
  uri: string,
  mimeType: string,
  filename: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedMedia> {
  const token = await AsyncStorage.getItem('@ms_access_token');
  if (!token) throw new Error('Not authenticated');

  // Normalise here as a safety net — catches any path that didn't
  // normalise before calling uploadMedia (avatar uploads, etc.)
  const safeMime = normalizeMime(mimeType || '', uri);
  const safeFilename = normalizeFilename(filename || `media-${Date.now()}`, safeMime);

  const formData = new FormData();
  formData.append('file', {
    uri,
    type: safeMime,
    name: safeFilename,
  } as unknown as Blob);

  const base = getApiBase();
  const url = `${base}/media/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const raw = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          // Unwrap {ok, data} envelope if present — backend wraps all responses
          const body = (raw?.ok === true && raw?.data) ? raw.data : raw;
          // Normalise field names — backend may use snake_case or camelCase
          const media: UploadedMedia = {
            url: body.url ?? body.media_url ?? body.file_url ?? '',
            thumbnailUrl: body.thumbnailUrl ?? body.thumbnail_url ?? null,
            type: (body.type ?? body.media_type ?? 'image') as 'image' | 'video',
            size: body.size ?? body.file_size ?? 0,
            filename: body.filename ?? body.file_name ?? filename,
            originalName:
              body.originalName ??
              body.original_name ??
              body.filename ??
              body.file_name ??
              filename,
            mimeType: body.mimeType ?? body.mime_type ?? mimeType,
          };
          resolve(media);
        } else {
          reject(
            new Error(
              raw?.error ??
                raw?.message ??
                raw?.data?.error ??
                `Upload failed: HTTP ${xhr.status}`,
            ),
          );
        }
      } catch {
        reject(new Error('Failed to parse upload response'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

    xhr.timeout = 120_000; // 2 min timeout
    xhr.send(formData);
  });
}
