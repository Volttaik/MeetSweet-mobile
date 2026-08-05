/**
 * MeetSweet content tier system.
 *
 * free            — public, visible to everyone on Explore.
 * subscriber      — requires a Subscriber subscription (1× creator price).
 * subscriber_plus — requires a Subscriber Plus subscription (2× creator price).
 *
 * Backend visibility mapping:
 *   free            → "public"
 *   subscriber      → "subscribers"
 *   subscriber_plus → "subscribers" (same visibility column, gated by tier field)
 *
 * Once subscribed to a creator the user gets all content at or below their
 * tier — no per-post unlocking. The only à-la-carte purchase is albums.
 */

export type ContentTier = 'free' | 'subscriber' | 'subscriber_plus';

export const TIERS = {
  free: {
    label:       'Free',
    color:       '#888888',
    bgColor:     'rgba(136,136,136,0.15)',
    description: 'Free · Visible on Explore',
    /** Backend visibility value */
    visibility:  'public' as const,
  },
  subscriber: {
    label:       'Subscriber',
    color:       '#C45A72',
    bgColor:     'rgba(196,90,114,0.15)',
    description: 'For your subscribers only',
    visibility:  'subscribers' as const,
  },
  subscriber_plus: {
    label:       'Subscriber+',
    color:       '#E8A020',
    bgColor:     'rgba(232,160,32,0.15)',
    description: 'For Subscriber Plus members only',
    visibility:  'subscribers' as const,
  },
} as const satisfies Record<ContentTier, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
  visibility: 'public' | 'subscribers';
}>;

export const TIER_ORDER: ContentTier[] = ['free', 'subscriber', 'subscriber_plus'];

/**
 * Map backend tier strings to a valid ContentTier.
 * Called in post normalisers so the UI always gets a known value.
 */
export function normalizeTier(raw: string | null | undefined): ContentTier | undefined {
  if (!raw) return undefined;
  if (raw === 'free') return 'free';
  if (raw === 'subscriber') return 'subscriber';
  if (raw === 'subscriber_plus') return 'subscriber_plus';
  return undefined;
}
