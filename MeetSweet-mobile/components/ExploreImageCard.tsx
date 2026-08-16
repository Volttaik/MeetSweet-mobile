/**
 * ExploreImageCard — Dedicated card for IMAGE posts only.
 *
 * This component is exclusively for photo/image content.
 * It NEVER renders video UI, play buttons, or duration badges.
 * The image is the hero — large, breathing, photographic.
 *
 * Creator identity, caption, and engagement stats are shown below.
 * Tier badge (Subscriber / Subscriber+) is shown when content is gated.
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
import {
  ChatCircle,
  SealCheck,
  Heart,
} from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsTierBadge } from '@/components/MsTierBadge';
import { T } from '@/constants/theme';
import type { ContentTier } from '@/constants/tiers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
// Tall, photographic 4:5-ish ratio — images deserve vertical space
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * 1.05);

export interface ExploreImageCardData {
  id: string;
  /** Caption or title for the post */
  caption: string;
  likes: string;
  comments: string;
  uploadDate: string;
  /** Content tier — free shows no badge, subscriber/subscriber_plus show tier pill */
  tier?: ContentTier;
  /** Actual image URL */
  imageUrl?: string | null;
  /** Fallback background colour key */
  gradient: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl?: string | null;
}

interface ExploreImageCardProps {
  card: ExploreImageCardData;
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

export function ExploreImageCard({
  card,
  onPress,
  onCreatorPress,
  onLongPress,
}: ExploreImageCardProps) {
  const showTierBadge = card.tier && card.tier !== 'free';

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Photo by ${card.creatorName}${card.caption ? `: ${card.caption}` : ''}`}
    >
      {/* ── Hero image ────────────────────────────────────── */}
      <View style={[styles.imageWrap, { backgroundColor: bg(card.gradient) }]}>

        {/* Real image */}
        {card.imageUrl ? (
          <MsMediaLoader
            uri={card.imageUrl}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibleLabel={card.caption || 'Photo'}
            errorMessage=""
            fallback={null}
          />
        ) : null}

        {/* Gradient scrim — bottom fade for creator chip legibility */}
        <View style={styles.bottomScrim} pointerEvents="none" />

        {/* Creator chip — bottom left, always visible */}
        <View style={styles.imageFooter} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.creatorChip}
            onPress={onCreatorPress ?? onPress}
            activeOpacity={0.85}
            hitSlop={6}
          >
            <MsAvatar
              size={28}
              initials={card.creatorInitials}
              imageUri={card.creatorAvatarUrl ?? undefined}
              showOnline={card.creatorIsOnline}
            />
            <View style={styles.creatorChipInner}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <SealCheck size={13} color={T.TEXT} weight="fill" />
              )}
            </View>
          </TouchableOpacity>

          {/* Tier badge — only shown for gated content */}
          {showTierBadge && (
            <MsTierBadge tier={card.tier!} size="xs" />
          )}
        </View>
      </View>

      {/* ── Caption + engagement ──────────────────────────── */}
      <View style={styles.body}>
        {/* Handle + time */}
        <View style={styles.metaTopRow}>
          <Text style={styles.handle}>{card.creatorHandle}</Text>
          <Text style={styles.uploadDate}>{card.uploadDate}</Text>
        </View>

        {/* Caption */}
        {card.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {card.caption}
          </Text>
        ) : null}

        {/* Engagement */}
        <View style={styles.engagementRow}>
          <View style={styles.engagementItem}>
            <Heart size={13} color={T.TEXT_3} />
            <Text style={styles.engagementText}>{card.likes || '0'}</Text>
          </View>
          <View style={styles.engagementItem}>
            <ChatCircle size={13} color={T.TEXT_3} />
            <Text style={styles.engagementText}>{card.comments || '0'}</Text>
          </View>
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
    height: 100,
    backgroundColor: 'rgba(0,0,0,0)',
  },

  imageFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  creatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: T.RADIUS.full,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
  },
  creatorChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  creatorName: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
    maxWidth: 140,
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 6,
  },
  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  handle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 12,
  },
  uploadDate: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
  },
  caption: {
    color: T.TEXT,
    fontFamily: T.FONT.medium,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 2,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  engagementText: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },
});
