/**
 * MsImageCard — Wide image card for photo posts in the Explore feed.
 *
 * Full-width 4:3 image preview with creator identity overlaid at the bottom.
 * Tier badge (Subscriber / Subscriber+) shown when content is subscriber-gated.
 */
import React from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Heart } from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsTierBadge } from '@/components/MsTierBadge';
import { T } from '@/constants/theme';
import type { ContentTier } from '@/constants/tiers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * 0.72);

export interface ImageCardData {
  id: string;
  title: string;
  likes: string;
  uploadDate: string;
  /** Content tier — free shows no badge, subscriber/subscriber_plus show tier pill */
  tier?: ContentTier;
  /** Actual image URL */
  imageUrl?: string | null;
  /** Fallback solid background colour key */
  gradient: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl?: string | null;
}

interface MsImageCardProps {
  card: ImageCardData;
  onPress: () => void;
  onCreatorPress?: () => void;
  onLongPress?: () => void;
}

const FALLBACK: Record<string, string> = {
  violet:  '#1B1128',
  rose:    '#1C0E13',
  amber:   '#1C1508',
  teal:    '#091A18',
  indigo:  '#0E0F1E',
  emerald: '#0B1A12',
  sky:     '#091520',
  fuchsia: '#1A0E1C',
};

function bg(gradient: string) {
  return FALLBACK[gradient] ?? T.SURFACE_2;
}

export function MsImageCard({
  card,
  onPress,
  onCreatorPress,
  onLongPress,
}: MsImageCardProps) {
  const showTierBadge = card.tier && card.tier !== 'free';

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${card.title} by ${card.creatorName}`}
    >
      {/* ── Image area ─────────────────────────────────────── */}
      <View style={[styles.imageWrap, { backgroundColor: bg(card.gradient) }]}>

        {/* Real image */}
        {card.imageUrl ? (
          <MsMediaLoader
            uri={card.imageUrl}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel={card.title}
            errorMessage=""
            fallback={null}
          />
        ) : null}

        {/* Gradient scrim — bottom fade for legibility */}
        <View style={styles.bottomScrim} pointerEvents="none" />

        {/* Bottom: creator chip + tier badge */}
        <View style={styles.imageFooter}>
          <TouchableOpacity
            style={styles.creatorChip}
            onPress={onCreatorPress ?? onPress}
            activeOpacity={0.85}
            hitSlop={6}
          >
            <MsAvatar
              size={26}
              initials={card.creatorInitials}
              imageUri={card.creatorAvatarUrl ?? undefined}
              showOnline={card.creatorIsOnline}
            />
            <View style={styles.creatorChipText}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <Check size={10} color="rgba(255,255,255,0.75)" weight="fill" />
              )}
            </View>
          </TouchableOpacity>

          {showTierBadge && (
            <MsTierBadge tier={card.tier!} size="xs" />
          )}
        </View>
      </View>

      {/* ── Caption + meta ─────────────────────────────────── */}
      <View style={styles.body}>
        {card.title ? (
          <Text style={styles.caption} numberOfLines={2}>
            {card.title}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {card.likes ? (
            <View style={styles.metaItem}>
              <Heart size={11} color={T.TEXT_3} />
              <Text style={styles.metaText}>{card.likes}</Text>
            </View>
          ) : null}
          {card.likes && card.uploadDate ? <Text style={styles.metaDot}>·</Text> : null}
          {card.uploadDate ? (
            <Text style={styles.metaText}>{card.uploadDate}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },

  imageWrap: {
    height: IMAGE_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end',
  },

  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  imageFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 3,
  },
  creatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: T.RADIUS.full,
    paddingRight: 10,
    paddingLeft: 4,
    paddingVertical: 3,
  },
  creatorChipText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorName: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
    maxWidth: 130,
  },

  body: {
    padding: 14,
    gap: 6,
  },
  caption: {
    color: T.TEXT,
    fontFamily: T.FONT.medium,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11 },
  metaDot:  { color: T.TEXT_3, fontSize: 11 },
});
