/**
 * Sharing Service — Create and resolve share tokens and links.
 */
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch, authFetch } from './api';

export interface ShareableContent {
  type: 'post' | 'creator' | 'album' | 'short' | 'video';
  id: string;
  title?: string;
}

export async function createShareLink(type: string, id: string): Promise<{ url: string }> {
  const token = await getAccessToken();
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
    const url = resp.share_url || resp.url || `https://meetsweet.space/s/${resp.token || id}`;
    return { url };
  } catch {
    return { url: `https://meetsweet.space/s/${id}` };
  }
}

export async function resolveShareLink(shareToken: string): Promise<any> {
  return apiFetch<any>(`/share/resolve/${shareToken}`);
}
