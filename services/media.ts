import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from './api';

export interface UploadedMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumbnailUrl: string | null;
}

export async function uploadMedia(
  uri: string,
  mimeType: string,
  filename: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedMedia> {
  const token = await AsyncStorage.getItem('@ms_access_token');
  if (!token) throw new Error('Not authenticated');

  // Normalize HEIC/HEIF to JPEG (iOS quirk)
  let normalizedMime = mimeType;
  let normalizedName = filename;
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    normalizedMime = 'image/jpeg';
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
