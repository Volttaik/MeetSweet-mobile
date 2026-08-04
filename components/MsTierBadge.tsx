/**
 * MsTierBadge — compact coloured badge that shows a post's content tier.
 *
 * Uses the canonical ContentTier type (bronze/silver/gold/diamond) from
 * constants/tiers.ts. The legacy PostTier (free/normal/premium/vip) is gone.
 *
 * Bronze  → small coloured dot only (public / free content)
 * Silver  → pill badge with medal icon
 * Gold    → pill badge with crown icon
 * Diamond → pill badge with diamond icon
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Medal, Crown, Diamond } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { TIERS, type ContentTier } from '@/constants/tiers';

interface TierConfig {
  Icon?: React.ComponentType<{ size: number; color: string; weight: 'regular' | 'fill' }>;
  weight: 'regular' | 'fill';
}

const TIER_ICONS: Partial<Record<ContentTier, TierConfig>> = {
  silver:  { Icon: Medal,   weight: 'fill' },
  gold:    { Icon: Crown,   weight: 'fill' },
  diamond: { Icon: Diamond, weight: 'fill' },
};

interface MsTierBadgeProps {
  tier: ContentTier;
  /** 'sm' = standard size, 'xs' = very compact (for post card header) */
  size?: 'sm' | 'xs';
}

export function MsTierBadge({ tier, size = 'sm' }: MsTierBadgeProps) {
  const cfg = TIERS[tier];
  const iconCfg = TIER_ICONS[tier];
  const iconSize = size === 'xs' ? 8 : 10;

  if (tier === 'bronze') {
    // Bronze = small dot only (public content — no text label needed)
    return (
      <View style={[styles.dot, { backgroundColor: cfg.color }]} />
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bgColor }, size === 'xs' && styles.badgeXs]}>
      {iconCfg?.Icon && (
        <iconCfg.Icon size={iconSize} color={cfg.color} weight={iconCfg.weight} />
      )}
      <Text style={[styles.label, { color: cfg.color }, size === 'xs' && styles.labelXs]}>
        {cfg.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
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
