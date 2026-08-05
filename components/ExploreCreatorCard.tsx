/**
 * ExploreCreatorCard — Full-width creator profile card for the Creators feed.
 *
 * Replaces MsPreviewCard in the Creators mode. Shows a rich, tappable creator
 * identity card: avatar, name, handle, bio, follower count, content summary,
 * and a subscribe button.  Background is toned from the creator's gradient.
 *
 * Used in the mixed Creators feed alongside ExploreVideoCard and CreatorImageCard.
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
  Check,
  Images,
  Star,
  Users,
  VideoCamera,
} from 'phosphor-react-native';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { T } from '@/constants/theme';
import type { Creator } from '@/lib/api-client-react';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TONE: Record<string, string> = {
  violet:  '#1B1128',
  rose:    '#1C0E13',
  amber:   '#1C1508',
  teal:    '#091A18',
  indigo:  '#0E0F1E',
  emerald: '#0B1A12',
  sky:     '#091520',
  fuchsia: '#1A0E1C',
};
function toneColor(gradient: string) {
  return TONE[gradient] ?? T.SURFACE_2;
}

export interface ExploreCreatorCardProps {
  creator: Creator;
  onPress: () => void;
  onSubscribe?: () => void;
  onLongPress?: () => void;
  /** Photo count shown in the stats row */
  imageCount?: number;
  /** Video count shown in the stats row */
  videoCount?: number;
}

export function ExploreCreatorCard({
  creator,
  onPress,
  onSubscribe,
  onLongPress,
  imageCount = 0,
  videoCount = 0,
}: ExploreCreatorCardProps) {
  const hasBanner = Boolean(creator.bannerUrl);
  const hasContent = imageCount > 0 || videoCount > 0;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: toneColor(creator.gradient) }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${creator.name}'s creator profile`}
    >
      {/* ── Banner strip ────────────────────────────────────── */}
      {hasBanner && (
        <>
          <MsMediaLoader
            uri={creator.bannerUrl!}
            style={styles.banner}
            resizeMode="cover"
            accessibleLabel={`${creator.name} banner`}
            errorMessage=""
            fallback={null}
          />
          {/* Heavy scrim so banner doesn't compete with content */}
          <View style={styles.bannerScrim} pointerEvents="none" />
        </>
      )}

      {/* ── Main content row ─────────────────────────────────── */}
      <View style={styles.contentRow}>
        {/* Avatar — left anchor */}
        <View style={styles.avatarCol}>
          <MsAvatar
            size={58}
            initials={creator.initials}
            imageUri={creator.avatarUrl ?? undefined}
            showOnline={creator.isOnline}
          />
          {creator.isOnline && (
            <Text style={styles.onlineText}>● Online</Text>
          )}
        </View>

        {/* Info — fills remaining space */}
        <View style={styles.infoCol}>
          {/* Name + verified */}
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {creator.name}
            </Text>
            {creator.isVerified && (
              <Check size={14} color={T.TEXT} weight="fill" />
            )}
          </View>

          {/* Handle · category */}
          <Text style={styles.handle} numberOfLines={1}>
            {creator.handle}
            {creator.category ? <Text style={styles.dot}> · {creator.category}</Text> : null}
          </Text>

          {/* Bio */}
          {creator.bio ? (
            <Text style={styles.bio} numberOfLines={2}>{creator.bio}</Text>
          ) : null}

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Users size={11} color={T.TEXT_3} />
              <Text style={styles.statText}>{creator.followers} subscribers</Text>
            </View>
            {videoCount > 0 && (
              <View style={styles.statItem}>
                <VideoCamera size={11} color={T.TEXT_3} />
                <Text style={styles.statText}>{videoCount} video{videoCount !== 1 ? 's' : ''}</Text>
              </View>
            )}
            {imageCount > 0 && (
              <View style={styles.statItem}>
                <Images size={11} color={T.TEXT_3} />
                <Text style={styles.statText}>{imageCount} photo{imageCount !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Footer: price + subscribe ─────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <View style={styles.freePill}>
            <Text style={styles.freePillText}>SUBSCRIBE</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.subscribeBtn}
          onPress={onSubscribe ?? onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Subscribe to ${creator.name}`}
        >
          <Text style={styles.subscribeBtnText}>Subscribe</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH - 24,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    ...T.SHADOWS.hard,
  },

  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  bannerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(6,4,10,0.72)',
  },

  contentRow: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    // enough top padding to clear banner when present
    marginTop: 0,
  },

  avatarCol: {
    alignItems: 'center',
    gap: 5,
    paddingTop: 2,
  },
  onlineText: {
    color: T.SUCCESS,
    fontFamily: T.FONT.medium,
    fontSize: 9,
    letterSpacing: 0.2,
  },

  infoCol: { flex: 1, gap: 3, minWidth: 0 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 16,
    letterSpacing: -0.3,
    flexShrink: 1,
  },

  handle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },
  dot: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },

  bio: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 7,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 11 },
  priceTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 11 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    marginTop: 2,
    // Subtle separator via opacity-tinted background line
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  pricePillText: { color: T.TEXT_2, fontFamily: T.FONT.semibold, fontSize: 11 },

  freePill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  freePillText: {
    color: T.TEXT_3,
    fontFamily: T.FONT.bold,
    fontSize: 9,
    letterSpacing: 1,
  },

  subscribeBtn: {
    height: 34,
    paddingHorizontal: 20,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  subscribeBtnText: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 12,
    letterSpacing: 0.1,
  },
});
