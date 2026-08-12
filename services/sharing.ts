/**
 * Sharing Service — Create and resolve share tokens and links.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, authFetch } from './api';

export async function createShareLink(type: string, id: string): Promise<string> {
  const token = await AsyncStorage.getItem('@ms_access_token');
  try {
    const resp = token
      ? await authFetch<any>('/share/create', token, {
          method: 'POST',
          body: JSON.stringify({ type, target_id: id }),
        })
      : await apiFetch<any>('/share/create', {
          method: 'POST',
          body: JSON.stringify({ type, target_id: id }),
        });
    return resp.share_url || resp.url || `https://meetsweet.com/s/${resp.token || id}`;
  } catch {
    return `https://meetsweet.com/s/${id}`;
  }
}

export async function resolveShareLink(shareToken: string): Promise<any> {
  return apiFetch<any>(`/share/resolve/${shareToken}`);
}
