/**
 * MsTierBadge — simple pill badge for MeetSweet content tiers.
 *
 * free            → grey globe pill  "Free"
 * subscriber      → accent Users pill  "Subscriber"
 * subscriber_plus → gold Star pill   "Subscriber+"
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe, Users, Star } from 'phosphor-react-native';
import type { ContentTier } from '@/constants/tiers';

interface MsTierBadgeProps {
  tier: ContentTier;
  /** xs = tiny (post card); sm = standard */
  size?: 'xs' | 'sm';
}

const CONFIG: Record<ContentTier, { label: string; color: string; bg: string; icon: 'globe' | 'users' | 'star' }> = {
  free:            { label: 'Free',        color: '#888888', bg: 'rgba(136,136,136,0.16)', icon: 'globe'  },
  subscriber:      { label: 'Subscriber',  color: '#C45A72', bg: 'rgba(196,90,114,0.15)',  icon: 'users'  },
  subscriber_plus: { label: 'Subscriber+', color: '#E8A020', bg: 'rgba(232,160,32,0.15)',  icon: 'star'   },
};

export function MsTierBadge({ tier, size = 'sm' }: MsTierBadgeProps) {
  // Gracefully handle any stale/unknown tier value
  const cfg = CONFIG[tier] ?? CONFIG.subscriber;
  const xs  = size === 'xs';
  const iconSize = xs ? 9  : 11;
  const fontSize = xs ? 9  : 11;

  const IconComp =
    cfg.icon === 'globe' ? Globe :
    cfg.icon === 'star'  ? Star  : Users;

  return (
    <View style={[
      styles.pill,
      {
        backgroundColor:  cfg.bg,
        paddingHorizontal: xs ? 5  : 8,
        paddingVertical:   xs ? 2  : 4,
        gap:               xs ? 3  : 4,
      },
    ]}>
      <IconComp size={iconSize} color={cfg.color} weight="fill" />
      <Text style={[styles.label, { color: cfg.color, fontSize }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   99,
    alignSelf:      'flex-start',
  },
  label: {
    fontFamily: 'System',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
