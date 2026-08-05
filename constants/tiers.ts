/**
 * MeetSweet content tier system.
 *
 * free           — free / public. Visible to everyone on Explore.
 * subscriber     — requires a Subscriber subscription.
 * subscriber_plus — requires a Subscriber Plus subscription.
 *
 * Backend mapping: free → visibility "public",
 *                  subscriber → visibility "subscribers",
 *                  subscriber_plus → visibility "subscribers_plus" (backend pending)
 *
 * Legacy values bronze/silver/gold/diamond are still handled for backward
 * compat with the old backend and are mapped at normalisation time.
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
 * Map old backend tier strings (bronze/silver/gold/diamond) to the new 3-tier system.
 * Called in post normalisers so the UI always gets a valid ContentTier.
 */
export function normalizeTier(raw: string | null | undefined): ContentTier | undefined {
  if (!raw) return undefined;
  if (raw === 'bronze' || raw === 'free') return 'free';
  if (raw === 'silver' || raw === 'gold' || raw === 'subscriber') return 'subscriber';
  if (raw === 'diamond' || raw === 'subscriber_plus') return 'subscriber_plus';
  return undefined;
}
