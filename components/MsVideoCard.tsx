/**
 * MsVideoCard — YouTube-style video card for the Explore feed.
 *
 * Shows a real thumbnail with a tappable play button that opens the
 * full MsVideoPlayer. Premium posts show a lock overlay instead.
 */
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Clock, Heart, Lock, Play } from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { T } from '@/constants/theme';

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

export function MsVideoCard({
  video,
  onPress,
  onCreatorPress,
  onLongPress,
}: MsVideoCardProps) {
  const [playerVisible, setPlayerVisible] = useState(false);

  const canPlay = Boolean(video.mediaUrl) && !video.isPremium;

  const handlePlayPress = () => {
    if (canPlay) {
      setPlayerVisible(true);
    } else {
      // Locked/premium — navigate to the content/creator page
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
          {/* Real thumbnail — fades in when loaded */}
          {video.thumbnailUrl ? (
            <MsMediaLoader
              uri={video.thumbnailUrl}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibleLabel={`Thumbnail for ${video.title}`}
              errorMessage=""
              fallback={null}
            />
          ) : null}

          {/* Duration badge */}
          {video.duration ? (
            <View style={styles.durationBadge}>
              <Clock size={9} color={T.TEXT} />
              <Text style={styles.durationText}>{video.duration}</Text>
            </View>
          ) : null}

          {/* Kind badge */}
          <View style={styles.kindBadge}>
            <Text style={styles.kindText}>{video.kind.toUpperCase()}</Text>
          </View>

          {/* Play button (free + has media) or subscribe prompt */}
          {!video.isPremium ? (
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Play video"
              hitSlop={8}
            >
              <Play size={20} color={T.BG} weight="fill" />
            </TouchableOpacity>
          ) : (
            <View style={styles.lockOverlay}>
              <View style={styles.lockCircle}>
                <Lock size={14} color={T.TEXT} weight="bold" />
              </View>
              <Text style={styles.lockLabel}>Subscribe to view</Text>
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
              size={34}
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
              {video.isPremium && (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.premiumBadge}>PREMIUM</Text>
                </>
              )}
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
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },

  thumbnail: {
    height: 210,
    justifyContent: 'flex-end',
    padding: 12,
    position: 'relative',
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
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
  },
  durationText: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 10 },

  kindBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 7,
    paddingVertical: 3,
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
    // centre the button on the thumbnail
    top: '50%',
    left: '50%',
    marginTop: -26,
    marginLeft: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.medium,
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,6,14,0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  lockLabel: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 12,
  },

  infoRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    paddingTop: 10,
  },
  textGroup: { flex: 1, gap: 3 },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creatorName: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },
  metaDot:  { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },
  premiumBadge: {
    color: T.ACCENT,
    fontFamily: T.FONT.semibold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
});
