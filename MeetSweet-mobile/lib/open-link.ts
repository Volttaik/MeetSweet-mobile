/**
 * open-link — in-app navigation for MeetSweet links.
 *
 * When a user taps a shared MeetSweet link (in chat, or from a link preview
 * card), the app should open the corresponding screen directly instead of
 * bouncing the user to a browser. External links open in the OS browser.
 */
import { router } from 'expo-router';
import { Linking } from 'react-native';
import type { LinkPreview } from '@/types/chat-message';

/**
 * Open a link preview's destination. Internal MeetSweet links navigate to the
 * matching screen (profile → creator, post/video/short → content, album →
 * album). Anything else opens in the browser via Linking.
 */
export function openLinkPreview(preview: LinkPreview): void {
  const kind = preview.kind;
  const resourceId = preview.resourceId;

  if (kind !== 'external' && resourceId) {
    switch (kind) {
      case 'profile':
        router.push(`/creator/${resourceId}`);
        return;
      case 'post':
        router.push(`/post/${resourceId}`);
        return;
      case 'video':
        router.push(`/videos/${resourceId}`);
        return;
      case 'short':
        router.push({ pathname: '/shorts', params: { startId: resourceId } });
        return;
      case 'album':
        router.push(`/album/${resourceId}`);
        return;
    }
  }

  // External (or unresolvable) — hand off to the OS browser.
  const url = preview.url;
  if (url) {
    Linking.openURL(url).catch(() => {});
  }
}

/** True when a preview points at an internal MeetSweet resource. */
export function isInternalPreview(preview: LinkPreview): boolean {
  return preview.kind !== 'external' && !!preview.resourceId;
}

/**
 * Open a raw URL that may be a MeetSweet deep link. Share links go through the
 * /s/:token resolver screen; known content paths navigate directly; anything
 * else opens in the OS browser.
 */
export function openRawLink(url: string): void {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'meetsweet.space' || host === 'meetsweet.app') {
      const path = parsed.pathname;
      const share = path.match(/^\/s\/([^/]+)\/?$/);
      if (share) {
        router.push(`/s/${decodeURIComponent(share[1])}`);
        return;
      }
      const profile = path.match(/^\/creator\/([^/?#]+)\/?$/);
      if (profile) { router.push(`/creator/${profile[1]}`); return; }
      const post = path.match(/^\/post\/([^/?#]+)\/?$/);
      if (post) { router.push(`/post/${post[1]}`); return; }
      const video = path.match(/^\/videos\/([^/?#]+)\/?$/);
      if (video) { router.push(`/videos/${video[1]}`); return; }
      const short = path.match(/^\/shorts\/([^/?#]+)\/?$/);
      if (short) { router.push({ pathname: '/shorts', params: { startId: short[1] } }); return; }
      const album = path.match(/^\/album\/([^/?#]+)\/?$/);
      if (album) { router.push(`/album/${album[1]}`); return; }
    }
  } catch {
    // Fall through to the browser.
  }
  Linking.openURL(url).catch(() => {});
}
