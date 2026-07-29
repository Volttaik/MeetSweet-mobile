/**
 * Video Watch Page — YouTube-style watch experience.
 *
 * Video player at the top (aspect-ratio mode, native controls).
 * Metadata, actions, creator card, and comments preview below.
 * Related videos scroll beneath.
 *
 * The native Expo player handles play/pause, seek, volume and fullscreen.
 * No custom gesture interception or overlay controls.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bookmark,
  ChatCircle,
  Heart,
  SealCheck,
  ShareNetwork,
  UserPlus,
} from 'phosphor-react-native';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsLongFormPlayer } from '@/components/MsLongFormPlayer';
import { MsContentComments } from '@/components/MsContentComments';
import { MsPaymentSheet } from '@/components/MsPaymentSheet';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsFeedVideoCard, type MsFeedVideoCardData } from '@/components/MsFeedVideoCard';
import {
  getPost,
  likePost,
  unlikePost,
  bookmarkPost,
  unbookmarkPost,
  type Post,
} from '@/services/posts';
import { useLocalExploreCatalog, fmtTimeAgo } from '@/services/explore';
import { T } from '@/constants/theme';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function VideoWatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [post,                setPost]                = useState<Post | null>(null);
  const [loading,             setLoading]             = useState(true);
  const [liked,               setLiked]               = useState(false);
  const [bookmarked,          setBookmarked]          = useState(false);
  const [likeCount,           setLikeCount]           = useState(0);
  const [commentsVisible,     setCommentsVisible]     = useState(false);
  const [shareVisible,        setShareVisible]        = useState(false);
  const [premiumSheetVisible, setPremiumSheetVisible] = useState(false);

  const catalogQuery = useLocalExploreCatalog();
  const catalog      = catalogQuery.data;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPost(id)
      .then(({ post: p }) => {
        setPost(p);
        setLiked(p.likedByMe);
        setBookmarked(p.bookmarkedByMe ?? false);
        setLikeCount(p.likeCount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const toggleLike = async () => {
    if (!post) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((n) => Math.max(0, n + (nextLiked ? 1 : -1)));
    try {
      const result = nextLiked
        ? await likePost(post.id)
        : await unlikePost(post.id);
      setLikeCount(result.likeCount);
      setLiked(result.liked);
    } catch {
      setLiked(!nextLiked);
      setLikeCount((n) => Math.max(0, n + (nextLiked ? -1 : 1)));
    }
  };

  const toggleBookmark = async () => {
    if (!post) return;
    const next = !bookmarked;
    setBookmarked(next);
    try {
      if (next) await bookmarkPost(post.id);
      else await unbookmarkPost(post.id);
    } catch {
      setBookmarked(!next);
    }
  };

  // Build related videos from the explore catalog (exclude the current post).
  const relatedVideos = useMemo<MsFeedVideoCardData[]>(() => {
    if (!catalog) return [];
    const previews  = catalog.previews  ?? [];
    const creators  = catalog.creators  ?? [];
    return previews
      .filter((p) => p.id !== id && (p.kind === 'video' || p.kind === 'audio'))
      .slice(0, 10)
      .flatMap((p) => {
        const creator = creators.find((c) => c.id === p.creatorId);
        if (!creator) return [];
        const card: MsFeedVideoCardData = {
          id:               p.id,
          title:            p.title || 'Untitled',
          duration:         p.duration,
          likes:            p.likes,
          comments:         String(p.commentCount ?? 0),
          uploadDate:       fmtTimeAgo(p.createdAt ?? ''),
          gradient:         p.gradient,
          isPremium:        p.isPremium,
          kind:             p.kind,
          lockedLabel:      p.lockedLabel,
          thumbnailUrl:     p.thumbnailUrl  ?? null,
          mediaUrl:         p.isPremium ? null : (p.mediaUrl ?? null),
          creatorId:        creator.id,
          creatorName:      creator.name,
          creatorHandle:    creator.handle,
          creatorInitials:  creator.initials,
          creatorIsVerified: creator.isVerified ?? false,
          creatorIsOnline:  creator.isOnline   ?? false,
          creatorAvatarUrl: creator.avatarUrl  ?? null,
        };
        return [card];
      });
  }, [catalog, id]);

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator color={T.TEXT_2} size="large" />
        </View>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <MsEmptyState
            title="Video unavailable"
            message="This video could not be loaded."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const videoMedia       = post.mediaType === 'video' ? post.mediaUrl : null;
  const creatorInitials  = post.author.name
    .split(' ')
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
  const uploadDateStr = new Date(post.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Top bar — back button ─────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <ArrowLeft size={19} color={T.TEXT} weight="bold" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* ── Video player (aspect-ratio, native controls) ──────────────── */}
        <MsLongFormPlayer
          videoId={post.id}
          uri={videoMedia}
          posterUri={post.thumbnailUrl}
          isPremium={post.isPremium}
          autoPlay
          initialAspectRatio={
            post.width && post.height ? post.width / post.height : 16 / 9
          }
          onPremiumRequired={() => setPremiumSheetVisible(true)}
        />

        {/* ── Title & upload date ───────────────────────────────────────── */}
        <View style={styles.meta}>
          <Text style={styles.titleText} numberOfLines={4}>
            {post.caption || 'Untitled'}
          </Text>
          <Text style={styles.uploadDate}>{uploadDateStr}</Text>
        </View>

        {/* ── Action bar: Like / Comment / Save / Share ─────────────────── */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={toggleLike}
            activeOpacity={0.75}
            accessibilityLabel={liked ? 'Unlike' : 'Like'}
          >
            <Heart
              size={20}
              color={liked ? '#EF4444' : T.TEXT_2}
              weight={liked ? 'fill' : 'regular'}
            />
            <Text style={[styles.actionLabel, liked && styles.actionLabelLiked]}>
              {likeCount > 0 ? formatCount(likeCount) : 'Like'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setCommentsVisible(true)}
            activeOpacity={0.75}
            accessibilityLabel="Comments"
          >
            <ChatCircle size={20} color={T.TEXT_2} />
            <Text style={styles.actionLabel}>
              {post.commentCount > 0 ? formatCount(post.commentCount) : 'Comment'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={toggleBookmark}
            activeOpacity={0.75}
            accessibilityLabel={bookmarked ? 'Unsave' : 'Save'}
          >
            <Bookmark
              size={20}
              color={bookmarked ? T.TEXT : T.TEXT_2}
              weight={bookmarked ? 'fill' : 'regular'}
            />
            <Text style={[styles.actionLabel, bookmarked && styles.actionLabelSaved]}>
              {bookmarked ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShareVisible(true)}
            activeOpacity={0.75}
            accessibilityLabel="Share"
          >
            <ShareNetwork size={20} color={T.TEXT_2} />
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* ── Creator card ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.creatorCard}
          onPress={() => router.push(`/creator/${post.author.id}`)}
          activeOpacity={0.82}
          accessibilityLabel={`View ${post.author.name}'s profile`}
        >
          {post.author.avatarUrl ? (
            <Image source={{ uri: post.author.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{creatorInitials}</Text>
            </View>
          )}
          <View style={styles.creatorInfo}>
            <View style={styles.creatorNameRow}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {post.author.name || post.author.username}
              </Text>
              {post.author.isVerified && (
                <SealCheck size={14} color={T.ACCENT} weight="fill" />
              )}
            </View>
            <Text style={styles.creatorHandle}>@{post.author.username}</Text>
          </View>
          <Pressable
            style={styles.subscribeBtn}
            onPress={() => router.push(`/creator/${post.author.id}`)}
            hitSlop={6}
            accessibilityLabel="Subscribe"
          >
            <UserPlus size={13} color={T.BG} />
            <Text style={styles.subscribeBtnText}>Subscribe</Text>
          </Pressable>
        </TouchableOpacity>

        {/* ── Comments preview ─────────────────────────────────────────── */}
        {post.commentCount > 0 && (
          <Pressable
            style={styles.commentsPreview}
            onPress={() => setCommentsVisible(true)}
            accessibilityLabel="View comments"
          >
            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>Comments</Text>
              <View style={styles.commentsBadge}>
                <Text style={styles.commentsBadgeText}>
                  {formatCount(post.commentCount)}
                </Text>
              </View>
            </View>
            <Text style={styles.commentsPrompt}>Tap to view all comments →</Text>
          </Pressable>
        )}

        {/* ── Related videos ────────────────────────────────────────────── */}
        {relatedVideos.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>More Videos</Text>
            {relatedVideos.map((video) => (
              <View key={video.id} style={styles.relatedCard}>
                <MsFeedVideoCard
                  card={video}
                  onPress={() => router.push(`/videos/${video.id}`)}
                  onCreatorPress={() => router.push(`/creator/${video.creatorId}`)}
                  onUnlockPress={() => router.push(`/videos/${video.id}`)}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Sheets ───────────────────────────────────────────────────────── */}
      <MsContentComments
        kind="video"
        contentId={post.id}
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        count={post.commentCount}
      />

      <MsShareSheet
        visible={shareVisible}
        contentType="video"
        contentId={post.id}
        title={post.caption || 'Video'}
        onClose={() => setShareVisible(false)}
      />

      <MsPaymentSheet
        visible={premiumSheetVisible}
        amount={post.priceCredits ?? 0}
        onClose={() => setPremiumSheetVisible(false)}
        onConfirm={() => {
          setPremiumSheetVisible(false);
          router.push(`/creator/${post.author.id}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Top bar ──────────────────────────────────────────────────────────────────
  topBar: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },

  scroll: { flex: 1 },

  // ── Metadata ─────────────────────────────────────────────────────────────────
  meta: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 2,
    gap: 4,
  },
  titleText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 16,
    lineHeight: 24,
  },
  uploadDate: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
    marginTop: 2,
  },

  // ── Action bar ───────────────────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    paddingVertical: 14,
    paddingHorizontal: 8,
    ...T.SHADOWS.soft,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 58,
  },
  actionLabel: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 11,
  },
  actionLabelLiked: { color: '#EF4444' },
  actionLabelSaved: { color: T.TEXT },

  // ── Creator card ─────────────────────────────────────────────────────────────
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 14,
    ...T.SHADOWS.soft,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 16,
  },
  creatorInfo: { flex: 1 },
  creatorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  creatorName: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
    flexShrink: 1,
  },
  creatorHandle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    marginTop: 1,
  },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: T.TEXT,
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  subscribeBtnText: {
    color: T.BG,
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },

  // ── Comments preview ──────────────────────────────────────────────────────────
  commentsPreview: {
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 14,
    gap: 6,
    ...T.SHADOWS.soft,
  },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentsTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
  commentsBadge: {
    backgroundColor: T.SURFACE_2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: T.RADIUS.full,
  },
  commentsBadgeText: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 11,
  },
  commentsPrompt: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
  },

  // ── Related videos ────────────────────────────────────────────────────────────
  relatedSection: {
    marginTop: 28,
    paddingHorizontal: 14,
  },
  relatedTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 17,
    marginBottom: 14,
  },
  relatedCard: {
    marginBottom: 16,
  },
});
