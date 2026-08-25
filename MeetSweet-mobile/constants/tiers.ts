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
 *
 * All colour values are drawn from the central design-token system
 * (constants/theme.ts) so they stay consistent with every other screen.
 */

import { T, alpha } from '@/constants/theme';

export type ContentTier = 'free' | 'subscriber' | 'subscriber_plus';

export const TIERS = {
  free: {
    label:       'Free',
    color:       T.TEXT_3,
    bgColor:     alpha(T.TEXT_3, 0.15),
    description: 'Free · Visible on Explore',
    /** Backend visibility value */
    visibility:  'public' as const,
  },
  subscriber: {
    label:       'Subscriber',
    color:       T.SUBSCRIPTION,
    bgColor:     T.ACCENT_LIGHT,
    description: 'For your subscribers only',
    visibility:  'subscribers' as const,
  },
  subscriber_plus: {
    label:       'Subscriber+',
    color:       T.GOLD,
    bgColor:     alpha(T.GOLD, 0.16),
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