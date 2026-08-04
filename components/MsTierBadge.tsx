/**
 * MsTierBadge — content tier indicator shown on post cards.
 *
 * Bronze  → subtle golden dot only (public / free — no label needed)
 * Silver  → frosted pill: medal icon + "SILVER"
 * Gold    → frosted pill: crown icon + "GOLD"
 * Diamond → frosted pill: diamond icon + "DIAMOND"
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Medal, Crown, Diamond } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { TIERS, type ContentTier } from '@/constants/tiers';

type IconComponent = React.ComponentType<{ size: number; color: string; weight: 'fill' }>;

const TIER_ICON: Partial<Record<ContentTier, IconComponent>> = {
  silver:  Medal,
  gold:    Crown,
  diamond: Diamond,
};

interface MsTierBadgeProps {
  tier: ContentTier;
  /** xs = post card header (tiny); sm = standard (tooltips, detail views) */
  size?: 'xs' | 'sm';
}

export function MsTierBadge({ tier, size = 'sm' }: MsTierBadgeProps) {
  const cfg     = TIERS[tier];
  const Icon    = TIER_ICON[tier];
  const isXs    = size === 'xs';
  const iconSz  = isXs ? 9 : 11;
  const textSz  = isXs ? 8 : 10;

  if (tier === 'bronze') {
    return (
      <View
        style={[
          styles.dot,
          {
            width:           isXs ? 7 : 9,
            height:          isXs ? 7 : 9,
            borderRadius:    isXs ? 3.5 : 4.5,
            backgroundColor: cfg.color,
            shadowColor:     cfg.color,
            shadowOpacity:   0.6,
            shadowRadius:    4,
            shadowOffset:    { width: 0, height: 0 },
            elevation:       2,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: cfg.bgColor,
          paddingHorizontal: isXs ? 6 : 8,
          paddingVertical:   isXs ? 2 : 3,
          gap:               isXs ? 3 : 4,
        },
      ]}
    >
      {Icon && <Icon size={iconSz} color={cfg.color} weight="fill" />}
      <Text
        style={[
          styles.label,
          {
            color:    cfg.color,
            fontSize: textSz,
          },
        ]}
      >
        {cfg.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    // size/colour applied inline
  },
  pill: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   T.RADIUS.pill,
  },
  label: {
    fontFamily:    T.FONT.bold,
    letterSpacing: 0.5,
  },
});
