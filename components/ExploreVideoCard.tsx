/**
 * ExploreVideoCard — Dedicated card for VIDEO posts only.
 *
 * This component is exclusively for video content.
 * It is larger than the image card — videos deserve more space.
 * The play button is the centrepiece: large, frosted, unmistakable.
 * A "VIDEO" stamp and duration badge immediately communicate content type.
 *
 * Premium videos blur the preview and show unlock price.
 * Tapping unlocks navigation to the content detail screen.
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
  CheckCircle,
  Clock,
  Heart,
  Lock,
  Play,
  Star,
  VideoCamera,
} from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Slightly wider card — videos take up more space
const CARD_WIDTH = SCREEN_WIDTH - 24;
// Cinematic 16:9 aspect ratio
const THUMB_HEIGHT = Math.round(CARD_WIDTH * (9 / 16));

export interface ExploreVideoCardData {
  id: string;
  title: string;
  duration: string;
  /** Formatted like count e.g. "1.2K" */
  likes: string;
  /** Formatted comment count e.g. "48" */
  comments: string;
  uploadDate: string;
  gradient: string;
  isPremium: boolean;
  kind: 'video' | 'audio' | string;
  lockedLabel?: string;
  thumbnailUrl?: string | null;
  /** Full video URL — null means locked/unavailable */
  mediaUrl?: string | null;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl?: string | null;
}

interface ExploreVideoCardProps {
  card: ExploreVideoCardData;
  onPress: () => void;
  onCreatorPress?: () => void;
  onUnlockPress?: () => void;
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

function bgColor(gradient: string) {
  return FALLBACK[gradient] ?? T.SURFACE_2;
}

function priceLabel(lockedLabel?: string): string {
  if (!lockedLabel) return '';
  const match = lockedLabel.match(/(\d+)/);
  return match ? `${match[1]} cr` : lockedLabel;
}

export function ExploreVideoCard({
  card,
  onPress,
  onCreatorPress,
  onUnlockPress,
  onLongPress,
}: ExploreVideoCardProps) {
  const canPlay = Boolean(card.mediaUrl) && !card.isPremium;

  const handlePlayPress = () => {
    if (canPlay) {
      onPress();
    } else {
      onUnlockPress?.() ?? onPress();
    }
  };

  return (
    <>
      <Pressable
        style={styles.card}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`Video: ${card.title} by ${card.creatorName}`}
      >
        {/* ── Cinematic Thumbnail ─────────────────────────── */}
        <View style={[styles.thumbnail, { backgroundColor: bgColor(card.gradient) }]}>

          {/* Thumbnail image — dimmed for premium */}
          {card.thumbnailUrl ? (
            <MsMediaLoader
              uri={card.thumbnailUrl}
              style={[StyleSheet.absoluteFill, card.isPremium && styles.blurredThumb]}
              resizeMode="cover"
              accessibleLabel={card.isPremium ? 'Locked video' : `Thumbnail: ${card.title}`}
              errorMessage=""
              fallback={null}
            />
          ) : null}

          {/* Cinematic dark vignette overlay */}
          <View style={styles.vignette} pointerEvents="none" />

          {/* VIDEO badge — top left, prominent */}
          <View style={styles.videoBadge}>
            <VideoCamera size={11} color="#fff" weight="fill" />
            <Text style={styles.videoBadgeText}>VIDEO</Text>
          </View>

          {/* Duration badge — bottom right */}
          {card.duration ? (
            <View style={styles.durationBadge}>
              <Clock size={10} color={T.TEXT} />
              <Text style={styles.durationText}>{card.duration}</Text>
            </View>
          ) : null}

          {/* ── Free: large centred play button ─────────── */}
          {!card.isPremium ? (
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayPress}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Play video"
              hitSlop={12}
            >
              {/* Outer glow ring */}
              <View style={styles.playRing} />
              {/* Inner frosted circle */}
              <View style={styles.playCircle}>
                <Play size={26} color={T.BG} weight="fill" />
              </View>
            </TouchableOpacity>
          ) : (
            /* ── Premium: dark overlay with lock + price ── */
            <View style={styles.lockOverlay}>
              <View style={styles.lockCircle}>
                <Lock size={20} color={T.TEXT} weight="bold" />
              </View>
              <Text style={styles.lockTitle}>Premium Video</Text>
              {card.lockedLabel && card.lockedLabel !== 'Free' ? (
                <View style={styles.lockPriceRow}>
                  <Star size={12} color={T.ACCENT} weight="fill" />
                  <Text style={styles.lockPrice}>{priceLabel(card.lockedLabel)}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.unlockButton}
                onPress={onUnlockPress ?? onPress}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Unlock this video"
              >
                <Lock size={12} color={T.BG} weight="bold" />
                <Text style={styles.unlockText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Creator chip overlaid on the thumbnail — bottom */}
          {!card.isPremium && (
            <TouchableOpacity
              style={styles.thumbnailCreatorChip}
              onPress={onCreatorPress ?? onPress}
              activeOpacity={0.85}
            >
              <MsAvatar
                size={24}
                initials={card.creatorInitials}
                imageUri={card.creatorAvatarUrl ?? undefined}
                showOnline={card.creatorIsOnline}
              />
              <Text style={styles.thumbnailCreatorName} numberOfLines={1}>
                {card.creatorName}
              </Text>
              {card.creatorIsVerified && (
                <CheckCircle size={12} color="rgba(255,255,255,0.8)" weight="fill" />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Info Row ──────────────────────────────────────── */}
        <View style={styles.infoRow}>
          {/* Avatar */}
          <TouchableOpacity
            onPress={onCreatorPress ?? onPress}
            hitSlop={6}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`View ${card.creatorName}'s profile`}
          >
            <MsAvatar
              size={38}
              initials={card.creatorInitials}
              imageUri={card.creatorAvatarUrl ?? undefined}
              showOnline={card.creatorIsOnline}
            />
          </TouchableOpacity>

          {/* Title + meta */}
          <View style={styles.textGroup}>
            <Text style={styles.title} numberOfLines={2}>
              {card.title}
            </Text>

            {/* Handle + verified */}
            <TouchableOpacity
              onPress={onCreatorPress ?? onPress}
              activeOpacity={0.8}
              style={styles.creatorRow}
            >
              <Text style={styles.handle}>{card.creatorHandle}</Text>
              {card.creatorIsVerified && (
                <CheckCircle size={12} color={T.TEXT_3} weight="fill" />
              )}
            </TouchableOpacity>

            {/* Engagement stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Heart size={11} color={T.TEXT_3} />
                <Text style={styles.statText}>{card.likes || '0'}</Text>
              </View>
              <View style={styles.statItem}>
                <ChatCircle size={11} color={T.TEXT_3} />
                <Text style={styles.statText}>{card.comments || '0'}</Text>
              </View>
              {card.uploadDate ? (
                <>
                  <Text style={styles.statDot}>·</Text>
                  <Text style={styles.statText}>{card.uploadDate}</Text>
                </>
              ) : null}
              {card.isPremium && card.lockedLabel && card.lockedLabel !== 'Free' ? (
                <>
                  <Text style={styles.statDot}>·</Text>
                  <Star size={9} color={T.ACCENT} weight="fill" />
                  <Text style={styles.priceTag}>{priceLabel(card.lockedLabel)}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>

    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },

  thumbnail: {
    height: THUMB_HEIGHT,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },

  blurredThumb: {
    opacity: 0.15,
  },

  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },

  // VIDEO type badge
  videoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  videoBadgeText: {
    color: '#fff',
    fontFamily: T.FONT.bold,
    fontSize: 9,
    letterSpacing: 1.2,
  },

  // Duration badge
  durationBadge: {
    position: 'absolute',
    right: 12,
    bottom: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: T.RADIUS.xs,
  },
  durationText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },

  // Large centred play button
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
  },
  playRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  playCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    // Slight right offset on play icon is handled by the Play icon itself
    paddingLeft: 3,
    ...T.SHADOWS.hard,
  },

  // Creator chip overlaid on thumbnail
  thumbnailCreatorChip: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: T.RADIUS.full,
    paddingRight: 10,
    paddingLeft: 4,
    paddingVertical: 3,
  },
  thumbnailCreatorName: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 11,
    maxWidth: 120,
  },

  // Premium lock overlay
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,5,14,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  lockCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  lockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  lockPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockPrice: {
    color: T.ACCENT,
    fontFamily: T.FONT.bold,
    fontSize: 16,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: T.TEXT,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: T.RADIUS.full,
    marginTop: 4,
    ...T.SHADOWS.soft,
  },
  unlockText: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 13,
  },

  // Info row below thumbnail
  infoRow: {
    flexDirection: 'row',
    gap: 11,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 14,
  },
  textGroup: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  handle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 1,
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
  statDot: {
    color: T.TEXT_3,
    fontSize: 11,
  },
  priceTag: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
});
