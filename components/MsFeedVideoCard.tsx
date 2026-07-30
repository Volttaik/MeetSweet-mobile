/**
 * MsFeedVideoCard — the single canonical video card for Explore and Creator pages.
 *
 * Visually identical to the home-feed video presentation:
 *   • MsPremiumContent handles the thumbnail → play → stream lifecycle
 *   • Preserves natural aspect ratio (falls back to 16:9)
 *   • Premium lock overlay built-in
 *   • Creator info row + engagement stats below the thumbnail
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
import { ChatCircle, Clock, Heart, SealCheck } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsPremiumContent } from '@/components/MsPremiumContent';

// ─── Data interface (replaces ExploreVideoCardData) ──────────────────────────

export interface MsFeedVideoCardData {
  id: string;
  title: string;
  /** Formatted like count, e.g. "1.2K" */
  likes: string;
  /** Formatted comment count, e.g. "48" */
  comments: string;
  uploadDate?: string;
  isPremium: boolean;
  kind: 'video' | 'audio' | string;
  lockedLabel?: string;
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
  onUnlockPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  /**
   * Whether the video preview should be playing.
   * Driven by FlatList viewability — true when card is on screen, false when off.
   * Defaults to true.
   */
  videoPreviewActive?: boolean;
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
  onUnlockPress,
  onLongPress,
  style,
  videoPreviewActive = true,
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
      style={[styles.card, style]}
    >
      {/* ── Media area — identical to MsPostCard video block ── */}
      <View style={styles.mediaWrap}>
        <MsPremiumContent
          uri={card.isPremium ? null : (card.mediaUrl ?? null)}
          posterUri={card.thumbnailUrl ?? null}
          videoThumbnailUri={!card.thumbnailUrl && card.mediaUrl ? card.mediaUrl : null}
          mediaType="video"
          locked={card.isPremium}
          unlocked={!card.isPremium}
          price={
            card.lockedLabel
              ? parseInt(card.lockedLabel.match(/\d+/)?.[0] ?? '0', 10)
              : 0
          }
          aspectRatio={aspectRatio}
          onUnlock={onUnlockPress ?? onPress}
          previewMode
          active={videoPreviewActive}
          style={styles.media}
        />

        {/* Duration badge — bottom-right overlay */}
        {card.duration ? (
          <View style={styles.durationBadge} pointerEvents="none">
            <Clock size={10} color="#fff" />
            <Text style={styles.durationText}>{card.duration}</Text>
          </View>
        ) : null}

        {/* Premium badge — top-right */}
        {card.isPremium ? (
          <View style={styles.premiumBadge} pointerEvents="none">
            <Text style={styles.premiumText}>PREMIUM</Text>
          </View>
        ) : null}
      </View>

      {/* ── Info row (matches MsPostCard author row style) ── */}
      <View style={styles.infoRow}>
        <TouchableOpacity
          onPress={onCreatorPress ?? onPress}
          style={styles.creatorLeft}
          activeOpacity={0.75}
          hitSlop={6}
        >
          <MsAvatar
            size={34}
            initials={card.creatorInitials}
            imageUri={card.creatorAvatarUrl ?? undefined}
            showOnline={card.creatorIsOnline}
          />
          <View style={styles.creatorCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <SealCheck size={13} color={T.TEXT} weight="fill" />
              )}
            </View>
            {card.creatorHandle ? (
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
              <Heart size={12} color={T.TEXT_3} />
              <Text style={styles.statText}>{formatStats(card.likes)}</Text>
            </View>
          ) : null}
          {card.comments ? (
            <View style={styles.statItem}>
              <ChatCircle size={12} color={T.TEXT_3} />
              <Text style={styles.statText}>{formatStats(card.comments)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Title */}
      {card.title ? (
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

  mediaWrap: {
    position: 'relative',
  },

  media: {
    width: '100%',
    backgroundColor: T.SURFACE_2,
    borderRadius: 0,
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

  // Premium badge top-right
  premiumBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: T.RADIUS.xs,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  premiumText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 9,
    letterSpacing: 0.8,
  },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
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
    fontSize: 13,
    flexShrink: 1,
  },
  creatorHandle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 11,
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
    fontSize: 11,
  },

  title: {
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
  },
});
