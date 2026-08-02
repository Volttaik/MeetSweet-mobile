/**
 * MsTierBadge — compact coloured badge that shows a post's subscription tier.
 *
 * Tier → colour map:
 *   free    → Bronze  (#B87333)
 *   normal  → Blue    (#4A9EF5)
 *   premium → Gold    (#EAB308)
 *   vip     → Purple  (#A855F7)
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Crown, Diamond, Lock, Star } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export type PostTier = 'free' | 'normal' | 'premium' | 'vip';

interface TierConfig {
  color: string;
  bg: string;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; weight: 'regular' | 'fill' }>;
  weight: 'regular' | 'fill';
}

const TIER_CONFIG: Record<PostTier, TierConfig> = {
  free:    { color: '#B87333', bg: 'rgba(184,115,51,0.16)', label: 'Free',    Icon: Lock,   weight: 'regular' },
  normal:  { color: '#4A9EF5', bg: 'rgba(74,158,245,0.15)', label: 'Normal',  Icon: Star,   weight: 'fill'    },
  premium: { color: '#EAB308', bg: 'rgba(234,179,8,0.15)',  label: 'Gold',    Icon: Crown,  weight: 'fill'    },
  vip:     { color: '#A855F7', bg: 'rgba(168,85,247,0.15)', label: 'VIP',     Icon: Diamond, weight: 'fill'   },
};

interface MsTierBadgeProps {
  tier: PostTier;
  /** 'sm' = standard size, 'xs' = very compact (for post card header) */
  size?: 'sm' | 'xs';
}

export function MsTierBadge({ tier, size = 'sm' }: MsTierBadgeProps) {
  const cfg = TIER_CONFIG[tier];
  const iconSize = size === 'xs' ? 8 : 10;

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }, size === 'xs' && styles.badgeXs]}>
      <cfg.Icon size={iconSize} color={cfg.color} weight={cfg.weight} />
      <Text style={[styles.label, { color: cfg.color }, size === 'xs' && styles.labelXs]}>
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: T.RADIUS.pill,
  },
  badgeXs: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  label: {
    fontSize: 9,
    fontFamily: T.FONT.bold,
    letterSpacing: 0.3,
  },
  labelXs: {
    fontSize: 8,
  },
});
