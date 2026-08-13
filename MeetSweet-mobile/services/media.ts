/**
 * Media Service — File and image uploads to backend.
 */
import { getAccessToken } from '@/lib/session-storage';
import { authFetch } from './api';

export async function uploadMedia(
  uri: string,
  mimeType = 'image/jpeg',
  fileName = 'upload.jpg',
  onProgress?: (progress: number) => void,
): Promise<{ id: string; url: string; media_type?: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('file', {
    uri,
    type: mimeType,
    name: fileName,
  } as any);

  if (onProgress) onProgress(0.3);

  const resp = await authFetch<any>('/upload', token, {
    method: 'POST',
    body: formData as any,
  });

  if (onProgress) onProgress(1.0);

  const url = resp.url || resp.file_url || resp.data?.url || uri;
  const id = resp.id || resp.media_id || resp.data?.id || url;

  return {
    id,
    url,
    media_type: resp.media_type || (mimeType.startsWith('video') ? 'video' : 'image'),
  };
}
