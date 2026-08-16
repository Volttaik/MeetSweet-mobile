/**
 * Sharing Service — Create and resolve share tokens and links.
 */
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch, authFetch } from './api';

export async function createShareLink(type: string, id: string): Promise<{ url: string }> {
  const token = await getAccessToken();
  // Errors propagate so callers fall back to a plain-text share instead of
  // silently sharing a fabricated (broken) deep link. The share `token` is a
  // random value, not the content id, so we must never substitute the id.
  const resp = token
    ? await authFetch<any>('/share/create', token, {
        method: 'POST',
        body: JSON.stringify({ type, target_id: id }),
      })
    : await apiFetch<any>('/share/create', {
        method: 'POST',
        body: JSON.stringify({ type, target_id: id }),
      });
  const url = resp.share_url || resp.url || (resp.token ? `https://meetsweet.space/s/${resp.token}` : '');
  if (!url) throw new Error('The share link was not returned.');
  return { url };
}

export async function resolveShareLink(shareToken: string): Promise<any> {
  return apiFetch<any>(`/share/resolve/${shareToken}`);
}
