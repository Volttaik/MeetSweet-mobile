import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  Clock,
  Heart,
  Lock,
  Play,
  Users,
} from 'phosphor-react-native';
import { useLocalExploreCatalog, fmtTimeAgo } from '@/services/explore';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsEmptyState } from '@/components/MsEmptyState';
import { T } from '@/constants/theme';

export default function ContentViewerScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Use the local catalog — never the generated stub that hits a missing endpoint
  const query = useLocalExploreCatalog();

  const preview = useMemo(
    () => query.data?.previews.find((item) => item.id === id),
    [id, query.data],
  );
  const creator = useMemo(
    () => query.data?.creators.find((item) => item.id === preview?.creatorId),
    [preview, query.data],
  );

  // Loading
  if (query.isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={T.TEXT_2} />
      </View>
    );
  }

  // Error or content not found
  if (query.isError || !preview || !creator) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <MsEmptyState
          title="Preview unavailable"
          message="This drop is no longer available or couldn't be loaded."
          actionLabel="Back to Explore"
          onAction={() => router.replace('/(tabs)/explore')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Preview</Text>
        {/* Right spacer keeps title centred */}
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* ── Media art / thumbnail ──────────────────────────── */}
        <View style={styles.artWrap}>
          {/* Real thumbnail if available — fades in over the solid bg */}
          {preview.thumbnailUrl ? (
            <MsMediaLoader
              uri={preview.thumbnailUrl}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibleLabel={`Thumbnail for ${preview.title}`}
              errorMessage="Could not load media"
            />
          ) : (
            /* Decorative glow for gradient-only fallback */
            <View style={styles.artGlow} />
          )}

          {/* Kind + duration badge */}
          <View style={styles.artCopy}>
            <Text style={styles.artKind}>
              {preview.kind.toUpperCase()}
              {preview.duration ? ` · ${preview.duration}` : ''}
            </Text>
            <Text style={styles.artTitle} numberOfLines={3}>
              {preview.title}
            </Text>
          </View>

          {preview.isPremium ? (
            <View style={styles.lock}>
              <Lock size={18} color={T.TEXT} />
              <Text style={styles.lockText}>PREMIUM PREVIEW</Text>
            </View>
          ) : (
            <View style={styles.play}>
              <Play size={21} color={T.BG} weight="fill" />
            </View>
          )}
        </View>

        {/* ── Creator row ────────────────────────────────────── */}
        <View style={styles.creatorRow}>
          <Pressable
            style={styles.creatorPress}
            onPress={() => router.push(`/creator/${creator.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`View ${creator.name}'s profile`}
          >
            <MsAvatar
              size={44}
              initials={creator.initials}
              imageUri={creator.avatarUrl ?? undefined}
              showOnline={creator.isOnline}
            />
            <View style={styles.creatorCopy}>
              <View style={styles.creatorNameRow}>
                <Text style={styles.creatorName} numberOfLines={1}>
                  {creator.name}
                </Text>
                {creator.isVerified && (
                  <Check size={13} color={T.TEXT_3} weight="fill" />
                )}
              </View>
              <Text style={styles.creatorMeta} numberOfLines={1}>
                {creator.handle}
                {creator.followers ? ` · ${creator.followers} followers` : ''}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.likeButton}
            accessibilityRole="button"
            accessibilityLabel="Like"
          >
            <Heart size={19} color={T.TEXT} />
          </Pressable>
        </View>

        {/* ── Stats row ──────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {preview.likes ? (
            <View style={styles.statItem}>
              <Heart size={13} color={T.TEXT_3} />
              <Text style={styles.statText}>{preview.likes} likes</Text>
            </View>
          ) : null}
          {preview.createdAt ? (
            <View style={styles.statItem}>
              <Clock size={13} color={T.TEXT_3} />
              <Text style={styles.statText}>{fmtTimeAgo(preview.createdAt)}</Text>
            </View>
          ) : null}
          {creator.followers ? (
            <View style={styles.statItem}>
              <Users size={13} color={T.TEXT_3} />
              <Text style={styles.statText}>{creator.followers}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Description ────────────────────────────────────── */}
        <Text style={styles.description}>
          {preview.isPremium
            ? 'Subscribe to unlock the full drop and access a growing archive of premium content from this creator.'
            : 'A closer look at what makes this creator\'s work worth following. Follow to stay up to date with new drops.'}
        </Text>

        {/* ── Unlock / follow card ───────────────────────────── */}
        <View style={styles.unlockCard}>
          <View style={styles.unlockCopy}>
            <Text style={styles.unlockEyebrow}>
              {preview.isPremium ? 'UNLOCK THIS DROP' : 'DISCOVER THE FULL FEED'}
            </Text>
            <Text style={styles.unlockTitle}>{preview.lockedLabel}</Text>
          </View>
          <Pressable
            style={styles.unlockBtn}
            onPress={() => router.push(`/creator/${creator.id}`)}
            accessibilityRole="button"
            accessibilityLabel={preview.isPremium ? 'Subscribe' : 'View profile'}
          >
            <Text style={styles.unlockBtnText}>
              {preview.isPremium ? 'Subscribe' : 'View profile'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const ART_HEIGHT = 390;
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: {
    flex: 1,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },

  // Content
  content: { paddingBottom: 40 },

  // Art
  artWrap: {
    height: ART_HEIGHT,
    margin: 20,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: TONE['violet'],
    justifyContent: 'flex-end',
    padding: 20,
    ...T.SHADOWS.hard,
  },
  artGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.06)',
    right: -50,
    top: 45,
  },
  artCopy: { zIndex: 1 },
  artKind: {
    color: T.TEXT_2,
    fontFamily: T.FONT.semibold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  artTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 28,
    letterSpacing: -0.7,
    marginTop: 8,
  },
  lock: {
    position: 'absolute',
    left: 20,
    top: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  lockText: { color: T.TEXT_2, fontFamily: T.FONT.semibold, fontSize: 9, letterSpacing: 1 },
  play: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },

  // Creator row
  creatorRow: {
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creatorPress: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  creatorCopy: { flex: 1 },
  creatorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  creatorName: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14, flexShrink: 1 },
  creatorMeta: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 3 },
  likeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12 },

  // Description
  description: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 21,
    marginHorizontal: 20,
    marginTop: 18,
  },

  // Unlock card
  unlockCard: {
    margin: 20,
    marginTop: 24,
    padding: 18,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    ...T.SHADOWS.medium,
  },
  unlockCopy: { flex: 1 },
  unlockEyebrow: {
    color: T.TEXT_3,
    fontFamily: T.FONT.semibold,
    fontSize: 8,
    letterSpacing: 1,
  },
  unlockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
    marginTop: 5,
  },
  unlockBtn: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  unlockBtnText: {
    color: T.BG,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
  },
});
