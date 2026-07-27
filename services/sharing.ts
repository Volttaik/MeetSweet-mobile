import { apiFetch } from '@/services/api';

export type ShareableContent = 'post' | 'video' | 'short' | 'album' | 'creator';

export interface ShareLink {
  token: string;
  url: string;
  expiresAt?: string | null;
}

export async function createShareLink(contentType: ShareableContent, contentId: string): Promise<ShareLink> {
  const raw = await apiFetch<{ token?: string; url?: string; share_url?: string; expires_at?: string }>('/shares', {
    method: 'POST',
    body: JSON.stringify({ content_type: contentType, content_id: contentId }),
  });
  return {
    token: raw.token ?? '',
    url: raw.url ?? raw.share_url ?? '',
    expiresAt: raw.expires_at ?? null,
  };
}

export async function resolveShareLink(token: string) {
  return apiFetch<{ content_type: ShareableContent; content_id: string }>(`/shares/${encodeURIComponent(token)}`);
}