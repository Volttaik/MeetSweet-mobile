/**
 * MsTierBadge — simple pill badge for MeetSweet content tiers.
 *
 * free            → neutral dark pill      "Free"
 * subscriber      → brand-gradient pill    "Subscriber"
 * subscriber_plus → brand-gradient pill    "Subscriber+"
 *
 * Brand rule: every coloured element is a continuous mesh gradient of
 * amber → magenta → violet, with pure-white heavy text on top. Only
 * black/white/neutral elements stay flat.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe, Users, Star } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import type { ContentTier } from '@/constants/tiers';

interface MsTierBadgeProps {
  tier: ContentTier;
  /** xs = tiny (post card); sm = standard */
  size?: 'xs' | 'sm';
}

const CONFIG: Record<ContentTier, { label: string; color: string; icon: 'globe' | 'users' | 'star' }> = {
  free:            { label: 'Free',        color: T.TEXT_3, icon: 'globe'  },
  subscriber:      { label: 'Subscriber',  color: T.ACCENT_FG, icon: 'users'  },
  subscriber_plus: { label: 'Subscriber+', color: T.ACCENT_FG, icon: 'star'   },
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

  const isGradient = tier !== 'free';

  return (
    <View style={[
      styles.pill,
      isGradient && styles.pillGradient,
      {
        paddingHorizontal: xs ? 5  : 8,
        paddingVertical:   xs ? 2  : 4,
        gap:               xs ? 3  : 4,
      },
    ]}>
      {isGradient && <BrandGradientFill />}
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
    backgroundColor: alpha(T.TEXT_3, 0.16),
  },
  pillGradient: {
    backgroundColor: T.SECONDARY,
    overflow: 'hidden',
  },
  label: {
    fontFamily: 'System',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});

function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.slice(0, 6).padEnd(6, '0');
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
