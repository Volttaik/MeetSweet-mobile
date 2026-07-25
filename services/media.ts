import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from './api';

export interface UploadedMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumbnailUrl: string | null;
}

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/heic': 'image/jpeg',
  'image/heif': 'image/jpeg',
  'video/x-m4v': 'video/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
};

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
]);

function extensionOf(filename: string): string {
  return filename.split('.').pop()?.trim().toLowerCase() ?? '';
}

function normalizeMimeType(mimeType: string | undefined, filename: string): string {
  const suppliedMime = mimeType?.split(';', 1)[0].trim().toLowerCase() ?? '';
  const aliasedMime = MIME_ALIASES[suppliedMime] ?? suppliedMime;

  if (ALLOWED_MIME_TYPES.has(aliasedMime)) {
    return aliasedMime;
  }

  const extensionMime = MIME_BY_EXTENSION[extensionOf(filename)];
  if (extensionMime) {
    return extensionMime;
  }

  throw new Error(
    'Unsupported file type. Allowed: image/jpeg, image/png, image/webp, image/gif, ' +
      'video/mp4, video/quicktime, video/webm, audio/mpeg, audio/wav, audio/ogg, ' +
      'audio/mp4, audio/webm',
  );
}

export async function uploadMedia(
  uri: string,
  mimeType: string,
  filename: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedMedia> {
  const token = await AsyncStorage.getItem('@ms_access_token');
  if (!token) throw new Error('Not authenticated');

  const normalizedMime = normalizeMimeType(mimeType, filename);
  let normalizedName = filename;
  if (normalizedMime === 'image/jpeg' && /\.(heic|heif)$/i.test(filename)) {
    normalizedName = filename.replace(/\.(heic|heif)$/i, '.jpg');
  }

  const formData = new FormData();
  formData.append('file', {
    uri,
    type: normalizedMime,
    name: normalizedName,
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
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          // Unwrap the { ok, data } envelope if present
          const data = parsed?.data ?? parsed;
          resolve({
            id: data.id ?? '',
            url: data.url ?? '',
            type: data.type ?? 'image',
            thumbnailUrl: data.thumbnail_url ?? null,
          });
        } else {
          const msg = parsed?.error ?? parsed?.message ?? `Upload failed: HTTP ${xhr.status}`;
          reject(new Error(msg));
        }
      } catch {
        reject(new Error('Failed to parse upload response'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

    xhr.timeout = 120_000;
    xhr.send(formData);
  });
}
