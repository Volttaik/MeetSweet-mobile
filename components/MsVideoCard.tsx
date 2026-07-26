/**
 * MsVideoCard — YouTube-style video card for the Explore feed.
 *
 * Shows a thumbnail area (with play button or lock overlay for premium),
 * creator identity, and metadata row. Tapping calls onPress; tapping
 * the creator avatar/name calls onCreatorPress.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Clock, Eye, Lock, Play } from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { T } from '@/constants/theme';

const TONE: Record<string, string> = {
  'mono-sand':    '#343434',
  'mono-mist':    '#242424',
  'mono-slate':   '#1D2227',
  'mono-ink':     '#151515',
  'mono-cloud':   '#3B3B3B',
  'mono-charcoal':'#202020',
  'mono-stone':   '#2C2A28',
  'mono-fog':     '#292929',
};

function tone(gradient: string) {
  return TONE[gradient] ?? T.SURFACE_2;
}

export interface VideoCardData {
  id: string;
  title: string;
  duration: string;
  views: string;
  uploadDate: string;
  gradient: string;
  isPremium: boolean;
  kind: string;
  lockedLabel?: string;
  /** Creator info */
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
}

interface MsVideoCardProps {
  video: VideoCardData;
  onPress: () => void;
  onCreatorPress?: () => void;
  onLongPress?: () => void;
}

export function MsVideoCard({
  video,
  onPress,
  onCreatorPress,
  onLongPress,
}: MsVideoCardProps) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {/* ── Thumbnail ─────────────────────────────────────── */}
      <View style={[styles.thumbnail, { backgroundColor: tone(video.gradient) }]}>
        {/* Abstract "video" lines */}
        <View style={styles.thumbLines}>
          <View style={styles.lineWide} />
          <View style={styles.lineShort} />
          <View style={styles.lineWide} />
          <View style={styles.lineShort2} />
        </View>

        {/* Duration badge */}
        <View style={styles.durationBadge}>
          <Clock size={9} color={T.TEXT} />
          <Text style={styles.durationText}>{video.duration}</Text>
        </View>

        {/* Kind badge (top-left) */}
        <View style={styles.kindBadge}>
          <Text style={styles.kindText}>{video.kind.toUpperCase()}</Text>
        </View>

        {/* Play button (free) */}
        {!video.isPremium && (
          <View style={styles.playButton}>
            <Play size={18} color={T.BG} weight="fill" />
          </View>
        )}

        {/* Lock overlay (premium) */}
        {video.isPremium && (
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
        {/* Creator avatar */}
        <TouchableOpacity
          onPress={onCreatorPress ?? onPress}
          hitSlop={6}
          activeOpacity={0.8}
        >
          <MsAvatar
            size={34}
            initials={video.creatorInitials}
            showOnline={video.creatorIsOnline}
          />
        </TouchableOpacity>

        {/* Title + meta */}
        <View style={styles.textGroup}>
          <Text style={styles.title} numberOfLines={2}>
            {video.title}
          </Text>

          {/* Creator name */}
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

          {/* Metadata */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Eye size={10} color={T.TEXT_3} />
              <Text style={styles.metaText}>{video.views} views</Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{video.uploadDate}</Text>
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
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
    ...T.SHADOWS.medium,
  },

  // Thumbnail
  thumbnail: {
    height: 196,
    justifyContent: 'flex-end',
    padding: 12,
    position: 'relative',
  },
  thumbLines: {
    position: 'absolute',
    top: 48,
    left: 24,
    right: 24,
    gap: 8,
  },
  lineWide:  { height: 6, width: '72%', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 3 },
  lineShort: { height: 6, width: '44%', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 3 },
  lineShort2:{ height: 6, width: '58%', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3 },

  durationBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
  },
  durationText: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 10 },

  kindBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    right: 12,
    bottom: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,8,15,0.72)',
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

  // Info row
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

  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorName: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 11,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
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
