/**
 * Media Service — File and image uploads to backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from './api';

export async function uploadMedia(
  uri: string,
  mimeType = 'image/jpeg',
  fileName = 'upload.jpg',
): Promise<{ url: string; media_type?: string }> {
  const token = await AsyncStorage.getItem('@ms_access_token');
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('file', {
    uri,
    type: mimeType,
    name: fileName,
  } as any);

  const resp = await authFetch<any>('/upload', token, {
    method: 'POST',
    body: formData as any,
  });

  return {
    url: resp.url || resp.file_url || resp.data?.url || uri,
    media_type: resp.media_type || (mimeType.startsWith('video') ? 'video' : 'image'),
  };
}
