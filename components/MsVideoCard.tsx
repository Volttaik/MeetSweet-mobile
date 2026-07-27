/**
 * MsVideoCard — YouTube-style video card for the Explore feed.
 *
 * Shows a real thumbnail with duration, creator info, and engagement stats.
 * Premium posts show a blurred thumbnail, the credit price, and an Unlock
 * button — the actual media URL is never passed for premium content.
 */
import React, { useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Clock, Heart, Lock, Play, Star } from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const THUMB_HEIGHT = Math.round(CARD_WIDTH * 0.58);

export interface VideoCardData {
  id: string;
  title: string;
  duration: string;
  /** Formatted like count e.g. "1.2K" */
  views: string;
  /** Relative time string e.g. "2h ago" */
  uploadDate: string;
  /** Colour gradient key — used as bg fallback when no thumbnail */
  gradient: string;
  isPremium: boolean;
  kind: string;
  lockedLabel?: string;
  /** Thumbnail shown in the card before play */
  thumbnailUrl?: string | null;
  /** Full video URL for playback — null means locked/unavailable */
  mediaUrl?: string | null;
  /** Creator info */
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl?: string | null;
}

interface MsVideoCardProps {
  video: VideoCardData;
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

function bg(gradient: string) {
  return FALLBACK[gradient] ?? T.SURFACE_2;
}

function priceLabel(lockedLabel?: string): string {
  if (!lockedLabel) return '';
  const match = lockedLabel.match(/(\d+)/);
  return match ? `${match[1]} cr` : lockedLabel;
}

export function MsVideoCard({
  video,
  onPress,
  onCreatorPress,
  onUnlockPress,
  onLongPress,
}: MsVideoCardProps) {
  const [playerVisible, setPlayerVisible] = useState(false);

  const canPlay = Boolean(video.mediaUrl) && !video.isPremium;

  const handlePlayPress = () => {
    if (canPlay) {
      setPlayerVisible(true);
    } else {
      onPress();
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
        accessibilityLabel={`${video.title} by ${video.creatorName}`}
      >
        {/* ── Thumbnail ─────────────────────────────────────── */}
        <View style={[styles.thumbnail, { backgroundColor: bg(video.gradient) }]}>

          {/* Real thumbnail — dimmed if premium */}
          {video.thumbnailUrl ? (
            <MsMediaLoader
              uri={video.thumbnailUrl}
              style={[StyleSheet.absoluteFill, video.isPremium && styles.dimmedThumb]}
              resizeMode="cover"
              accessibleLabel={video.isPremium ? 'Locked video' : `Thumbnail for ${video.title}`}
              errorMessage=""
              fallback={null}
            />
          ) : null}

          {/* Kind badge — top left */}
          <View style={styles.kindBadge}>
            <Text style={styles.kindText}>{video.kind.toUpperCase()}</Text>
          </View>

          {/* Duration badge — bottom right */}
          {video.duration ? (
            <View style={styles.durationBadge}>
              <Clock size={9} color={T.TEXT} />
              <Text style={styles.durationText}>{video.duration}</Text>
            </View>
          ) : null}

          {/* Free: centred play button */}
          {!video.isPremium ? (
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Play video"
              hitSlop={8}
            >
              <Play size={22} color={T.BG} weight="fill" />
            </TouchableOpacity>
          ) : (
            /* Premium: lock overlay with price + unlock button */
            <View style={styles.lockOverlay}>
              <View style={styles.lockCircle}>
                <Lock size={18} color={T.TEXT} weight="bold" />
              </View>
              <View style={styles.lockInfo}>
                <Text style={styles.lockTitle}>Premium Video</Text>
                {video.lockedLabel && video.lockedLabel !== 'Free' ? (
                  <View style={styles.lockPriceRow}>
                    <Star size={11} color={T.ACCENT} weight="fill" />
                    <Text style={styles.lockPrice}>{priceLabel(video.lockedLabel)}</Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.unlockButton}
                onPress={onUnlockPress ?? onPress}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Unlock this video"
              >
                <Lock size={11} color={T.BG} weight="bold" />
                <Text style={styles.unlockText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Info Row ──────────────────────────────────────── */}
        <View style={styles.infoRow}>
          <TouchableOpacity
            onPress={onCreatorPress ?? onPress}
            hitSlop={6}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`View ${video.creatorName}'s profile`}
          >
            <MsAvatar
              size={36}
              initials={video.creatorInitials}
              imageUri={video.creatorAvatarUrl ?? undefined}
              showOnline={video.creatorIsOnline}
            />
          </TouchableOpacity>

          <View style={styles.textGroup}>
            <Text style={styles.title} numberOfLines={2}>
              {video.title}
            </Text>

            <TouchableOpacity
              onPress={onCreatorPress ?? onPress}
              activeOpacity={0.8}
              style={styles.creatorRow}
            >
              <Text style={styles.creatorName} numberOfLines={1}>
                {video.creatorName}
              </Text>
              {video.creatorIsVerified && (
                <Check size={11} color={T.TEXT_3} weight="fill" />
              )}
            </TouchableOpacity>

            <View style={styles.metaRow}>
              {video.views ? (
                <View style={styles.metaItem}>
                  <Heart size={10} color={T.TEXT_3} />
                  <Text style={styles.metaText}>{video.views}</Text>
                </View>
              ) : null}
              {video.views && video.uploadDate ? (
                <Text style={styles.metaDot}>·</Text>
              ) : null}
              {video.uploadDate ? (
                <Text style={styles.metaText}>{video.uploadDate}</Text>
              ) : null}
              {video.isPremium && video.lockedLabel && video.lockedLabel !== 'Free' ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Star size={9} color={T.ACCENT} weight="fill" />
                  <Text style={styles.priceTag}>{priceLabel(video.lockedLabel)}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>

      {/* Fullscreen video player — mounted only when open */}
      {playerVisible && video.mediaUrl ? (
        <MsVideoPlayer
          visible={playerVisible}
          uri={video.mediaUrl}
          posterUri={video.thumbnailUrl}
          onClose={() => setPlayerVisible(false)}
        />
      ) : null}
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
    justifyContent: 'flex-end',
    padding: 12,
    position: 'relative',
  },

  dimmedThumb: {
    opacity: 0.22,
  },

  durationBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: T.RADIUS.xs,
  },
  durationText: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 10 },

  kindBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: T.RADIUS.xs,
  },
  kindText: {
    color: T.TEXT_2,
    fontFamily: T.FONT.semibold,
    fontSize: 8,
    letterSpacing: 0.8,
  },

  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.medium,
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,5,14,0.64)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  lockCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  lockInfo: {
    alignItems: 'center',
    gap: 5,
  },
  lockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  lockPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lockPrice: {
    color: T.ACCENT,
    fontFamily: T.FONT.bold,
    fontSize: 15,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.TEXT,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: T.RADIUS.full,
    marginTop: 4,
    ...T.SHADOWS.soft,
  },
  unlockText: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 13,
  },

  infoRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    paddingTop: 12,
  },
  textGroup: { flex: 1, gap: 4 },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creatorName: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11 },
  metaDot:  { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11 },
  priceTag: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
});
