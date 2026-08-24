/**
 * MsFeedVideoCard — the single canonical video card for Explore and Creator pages.
 *
 * Shows a thumbnail with a play-button overlay. Tapping navigates to the video
 * watch page. There is no per-video purchase or lock overlay — content is either
 * free (public) or subscription-gated at the creator level (subscribers).
 *
 * Replace ExploreVideoCard everywhere. Do not create new video card variants.
 */
import React from 'react';
import {
  StyleSheet,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ChatCircle, Clock, Heart, Play, SealCheck } from 'phosphor-react-native';
import { MsTierBadge } from '@/components/MsTierBadge';
import { Image } from 'expo-image';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';

// ─── Data interface (replaces ExploreVideoCardData) ──────────────────────────

export interface MsFeedVideoCardData {
  id: string;
  title: string;
  /** Formatted like count, e.g. "1.2K" */
  likes: string;
  /** Formatted comment count, e.g. "48" */
  comments: string;
  uploadDate?: string;
  /** Content tier — free shows no badge, subscriber/subscriber_plus show tier pill */
  tier?: 'free' | 'subscriber' | 'subscriber_plus';
  kind: 'video' | 'audio' | string;
  thumbnailUrl?: string | null;
  /** Full video URL — null means locked/unavailable */
  mediaUrl?: string | null;
  /** Natural video width for aspect ratio (optional) */
  width?: number | null;
  /** Natural video height for aspect ratio (optional) */
  height?: number | null;
  /** "0:00" formatted duration badge */
  duration?: string;
  gradient?: string;
  // Creator fields
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline?: boolean;
  creatorAvatarUrl?: string | null;
}

interface MsFeedVideoCardProps {
  card: MsFeedVideoCardData;
  onPress: () => void;
  onCreatorPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  /**
   * Whether the video preview should be playing.
   * Driven by FlatList viewability — true when card is on screen, false when off.
   * Defaults to true.
   */
  videoPreviewActive?: boolean;
  /**
   * Denser presentation for lists that show many cards at once (e.g. Related
   * Videos). Shrinks avatar, spacing and type scale without changing the
   * media aspect ratio.
   */
  compact?: boolean;
}

// ─── Scale-press wrapper (matches MsPostCard) ─────────────────────────────────

function ScalePressable({
  children,
  onPress,
  onLongPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[animStyle, style]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: 80, easing: Easing.out(Easing.cubic) });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.back(1.4)) });
        }}
        delayLongPress={400}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function formatStats(n: string | number): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MsFeedVideoCard({
  card,
  onPress,
  onCreatorPress,
  onLongPress,
  style,
  videoPreviewActive = true,
  compact = false,
}: MsFeedVideoCardProps) {
  // Prefer natural dimensions; fall back to 16:9 (standard video)
  const aspectRatio =
    card.width && card.height && card.height > 0
      ? card.width / card.height
      : 16 / 9;

  return (
    <ScalePressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, compact && styles.cardCompact, style]}
    >
      {/* ── Media area — thumbnail with play-button overlay ── */}
      <View style={[styles.mediaWrap, { aspectRatio }]}>
        <Image
          source={{ uri: card.thumbnailUrl ?? card.mediaUrl ?? undefined }}
          style={styles.media}
          contentFit="cover"
          cachePolicy="memory-disk"
        />

        {/* Play button overlay */}
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playButton}>
            <Play size={compact ? 18 : 22} color="#fff" weight="fill" />
          </View>
        </View>

        {/* Duration badge — bottom-right overlay */}
        {card.duration ? (
          <View style={[styles.durationBadge, compact && styles.durationBadgeCompact]} pointerEvents="none">
            <Clock size={10} color="#fff" />
            <Text style={styles.durationText}>{card.duration}</Text>
          </View>
        ) : null}

        {/* Tier badge — top-right for subscriber-gated content */}
        {card.tier && card.tier !== 'free' ? (
          <View style={styles.tierBadgeWrap} pointerEvents="none">
            <MsTierBadge tier={card.tier} size="xs" />
          </View>
        ) : null}
      </View>

      {/* ── Info row (matches MsPostCard author row style) ── */}
      <View style={[styles.infoRow, compact && styles.infoRowCompact]}>
        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.();
            (onCreatorPress ?? onPress)();
          }}
          style={styles.creatorLeft}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <MsAvatar
            size={compact ? 24 : 34}
            initials={card.creatorInitials}
            imageUri={card.creatorAvatarUrl ?? undefined}
            showOnline={card.creatorIsOnline}
          />
          <View style={styles.creatorCopy}>
            <View style={styles.nameRow}>
              <Text style={[styles.creatorName, compact && styles.creatorNameCompact]} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <SealCheck size={compact ? 11 : 13} color={T.TEXT} weight="fill" />
              )}
            </View>
            {card.creatorHandle && !compact ? (
              <Text style={styles.creatorHandle} numberOfLines={1}>
                @{card.creatorHandle}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {/* Stats — right side */}
        <View style={styles.stats}>
          {card.likes ? (
            <View style={styles.statItem}>
              <Heart size={11} color={T.TEXT_3} />
              <Text style={styles.statText}>{formatStats(card.likes)}</Text>
            </View>
          ) : null}
          {card.comments ? (
            <View style={styles.statItem}>
              <ChatCircle size={11} color={T.TEXT_3} />
              <Text style={styles.statText}>{formatStats(card.comments)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Title */}
      {card.title && !compact ? (
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
      ) : null}
    </ScalePressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },
  cardCompact: {
    borderRadius: T.RADIUS.lg,
    ...T.SHADOWS.soft,
  },

  mediaWrap: {
    position: 'relative',
  },

  media: {
    width: '100%',
    height: '100%',
    backgroundColor: T.SURFACE_2,
    borderRadius: 0,
  },

  // Play button centered over thumbnail
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Duration badge overlaid bottom-right of the thumbnail
  durationBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: T.RADIUS.xs,
  },
  durationText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
  durationBadgeCompact: {
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },

  // Tier badge top-right
  tierBadgeWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
  },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
  },
  infoRowCompact: {
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 7,
    gap: 6,
  },
  creatorLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  creatorCopy: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creatorName: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 15,
    flexShrink: 1,
  },
  creatorNameCompact: {
    fontSize: 13,
  },
  creatorHandle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    marginTop: 1,
  },

  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },

  title: {
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
  },
});
