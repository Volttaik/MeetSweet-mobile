/**
 * MeetSweet content tier system.
 *
 * Bronze  — free / public. Visible to everyone on Explore.
 * Silver  — requires a Silver (or higher) subscription.
 * Gold    — requires a Gold (or higher) subscription.
 * Diamond — requires a Diamond subscription.
 *
 * Backend mapping: Bronze → visibility "public", Silver/Gold/Diamond → visibility "subscribers".
 * Shorts are always free and never carry a tier.
 */

export type ContentTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export const TIERS = {
  bronze: {
    label:       'Bronze',
    color:       '#CD7F32',
    bgColor:     'rgba(205,127,50,0.18)',
    description: 'Free · Visible on Explore',
    /** Backend visibility value */
    visibility:  'public' as const,
  },
  silver: {
    label:       'Silver',
    color:       '#C0C0C0',
    bgColor:     'rgba(192,192,192,0.18)',
    description: 'Silver subscribers & above',
    visibility:  'subscribers' as const,
  },
  gold: {
    label:       'Gold',
    color:       '#FFD700',
    bgColor:     'rgba(255,215,0,0.18)',
    description: 'Gold subscribers & above',
    visibility:  'subscribers' as const,
  },
  diamond: {
    label:       'Diamond',
    color:       '#7FFFD4',
    bgColor:     'rgba(127,255,212,0.18)',
    description: 'Diamond subscribers only',
    visibility:  'subscribers' as const,
  },
} as const satisfies Record<ContentTier, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
  visibility: 'public' | 'subscribers';
}>;

export const TIER_ORDER: ContentTier[] = ['bronze', 'silver', 'gold', 'diamond'];
