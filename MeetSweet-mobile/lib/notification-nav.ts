/**
 * notification-nav — the ONE place that decides where a notification leads.
 *
 * Two independent concerns live here and must never be confused elsewhere:
 *   • READ STATE  → handled by the Notifications screen on open (auto-read-all).
 *   • NAVIGATION  → resolved here. "View" only navigates; it never touches
 *                   read state and never needs to.
 *
 * Both the in-app notification list and the push-tap handler call
 * `resolveNotificationTarget`, so a destination can never drift between the
 * two entry points.
 */

export type NotificationTarget =
  | string
  | { pathname: string; params?: Record<string, string> }
  | null;

interface ResolveInput {
  type?: string | null;
  /** Raw fields from the normalized notification (top-level + data block). */
  contentType?: string | null;
  contentId?: string | null;
  postId?: string | null;
  videoId?: string | null;
  shortId?: string | null;
  albumId?: string | null;
  privateMessageId?: string | null;
  actorId?: string | null;
  commentId?: string | null;
  data?: Record<string, unknown> | null;
}

/** Pick a value from the normalized notification OR its raw data block. */
function pick(...keys: Array<string | undefined | null>): string | undefined {
  for (const k of keys) {
    if (k) return k;
  }
  return undefined;
}

/** Wallet / money notifications all land on the wallet screen. */
const WALLET_TYPES = new Set([
  'wallet',
  'payout',
  'withdrawal',
  'payment',
  'purchase',
  'referral_reward',
  'subscription_renewed',
  'subscription_renewal_failed',
]);

/** Creator / subscription notifications land on the actor's profile. */
const PROFILE_TYPES = new Set(['subscribe', 'creator', 'subscription']);

/** Private-message notifications land on the exact message thread. */
const MESSAGE_TYPES = new Set(['private_message', 'private_message_reply']);

/**
 * Resolve a notification to its destination. Returns null when the payload
 * does not carry enough to navigate — callers then simply do nothing rather
 * than guess.
 */
export function resolveNotificationTarget(input: ResolveInput): NotificationTarget {
  const data = input.data ?? {};
  const type = input.type ?? String(data.type ?? '');

  // 1. Wallet / money events → wallet screen.
  if (WALLET_TYPES.has(type)) {
    return '/wallet';
  }

  // 2. Private messages → the exact thread (thread id, not the message id).
  if (MESSAGE_TYPES.has(type)) {
    const threadId =
      input.privateMessageId ??
      pick(
        data.private_message_id as string | undefined,
        data.privateMessageId as string | undefined,
        input.contentId,
      );
    if (threadId) return `/inbox/${threadId}`;
    return null;
  }

  // 3. Subscriptions / creator activity → the actor's profile.
  if (PROFILE_TYPES.has(type)) {
    const actorId =
      input.actorId ??
      pick(
        data.actor_id as string | undefined,
        data.actorId as string | undefined,
        data.creator_id as string | undefined,
      );
    if (actorId) return `/creator/${actorId}`;
    return null;
  }

  // 4. Content notifications (like / comment / reply / mention / new_post) →
  //    the specific content, routed by content_type.
  const contentType =
    input.contentType ??
    pick(data.content_type as string | undefined, data.contentType as string | undefined);
  const id =
    input.contentId ??
    input.postId ??
    pick(data.content_id as string | undefined, data.post_id as string | undefined);
  if (id) {
    if (contentType === 'video') {
      return `/videos/${input.videoId ?? id}`;
    }
    if (contentType === 'short') {
      return { pathname: '/shorts', params: { startId: input.shortId ?? id } };
    }
    if (contentType === 'album') {
      return `/album/${input.albumId ?? id}`;
    }
    return `/post/${id}`;
  }

  return null;
}
