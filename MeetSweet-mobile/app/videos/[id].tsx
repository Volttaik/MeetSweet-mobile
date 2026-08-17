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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
import { CommentsModal } from '@/components/MsCommentsSheet';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsPostCard } from '@/components/MsPostCard';
import { MsPostSkeleton } from '@/components/MsSkeletonCard';
import { PressScale } from '@/components/motion/PressScale';
import { FlyingHeart, useHeartBurst } from '@/components/motion/FlyingHeart';
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
import { MOTION } from '@/constants/motion';
import { useAuth } from '@/contexts/AuthContext';
import { useScreenProtection } from '@/lib/screen-protection';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Animated action button ───────────────────────────────────────────────────

function ActionBtn({
  onPress,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <PressScale
      style={styles.actionBtn}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </PressScale>
  );
}

export default function VideoWatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [post,                setPost]                = useState<Post | null>(null);
  const [loading,             setLoading]             = useState(true);
  const [liked,               setLiked]               = useState(false);
  const [bookmarked,          setBookmarked]          = useState(false);
  const [likeCount,           setLikeCount]           = useState(0);
  const [commentsVisible,     setCommentsVisible]     = useState(false);
  const [shareVisible,        setShareVisible]        = useState(false);
  const [premiumSheetVisible, setPremiumSheetVisible] = useState(false);

  // Flying hearts from like button
  const { hearts, spawnHeart } = useHeartBurst();
  const likeBarRef = useRef<View>(null);
  const scrollRef  = useRef<ScrollView>(null);

  // ── Like button bounce animation ─────────────────────────────────────────
  const likeScale   = useSharedValue(1);
  const likeStyle   = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));

  // ── Screen focus — pause playback when navigating away ───────────────────
  const screenActiveRef = useRef(true);
  const [screenActive,  setScreenActive] = useState(true);

  useFocusEffect(
    useCallback(() => {
      screenActiveRef.current = true;
      setScreenActive(true);
      return () => {
        screenActiveRef.current = false;
        setScreenActive(false);
      };
    }, []),
  );

  const catalogQuery = useLocalExploreCatalog();
  const catalog      = catalogQuery.data;

  // Native capture protection (Android FLAG_SECURE) while viewing
  // subscriber-gated video content — this screen shows the actual protected
  // media (or its premium preview), so screenshots/recording are blocked at
  // the OS level. Restored automatically when leaving this screen.
  useScreenProtection(Boolean(post?.tier));

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    // Jump back to the top so the newly-selected video's player is visible —
    // router.replace reuses this screen instance, so the ScrollView would
    // otherwise stay scrolled to the related-videos list.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    getPost(id)
      .then((p) => {
        if (cancelled) return;
        setPost(p);
        setLiked(p.likedByMe);
        setBookmarked(p.bookmarkedByMe ?? false);
        setLikeCount(p.likeCount);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggleLike = async () => {
    if (!post) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((n) => Math.max(0, n + (nextLiked ? 1 : -1)));

    // Bounce + flying hearts on like
    if (nextLiked) {
      likeScale.value = withSequence(
        withSpring(1.35, { damping: 5, stiffness: 320 }),
        withSpring(1.0,  { damping: 10, stiffness: 220 }),
      );
      // Spawn hearts around the like bar
      likeBarRef.current?.measure((_x, _y, _w, h, px, py) => {
        const cx = px + 28; // approximate centre of like button
        const cy = py + h / 2;
        spawnHeart(cx, cy);
        spawnHeart(cx + 14, cy - 10);
      });
    } else {
      likeScale.value = withSequence(
        withTiming(0.85, { duration: MOTION.PRESS_DOWN, easing: MOTION.EASE_EXIT }),
        withTiming(1.0,  { duration: MOTION.PRESS_UP,   easing: MOTION.EASE_ENTER }),
      );
    }

    try {
      if (nextLiked) {
        await likePost(post.id);
      } else {
        await unlikePost(post.id);
      }
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
  // Deduplicate both by post ID and by creator ID so each creator only appears once.
  const relatedVideos = useMemo<Post[]>(() => {
    if (!catalog) return [];
    const previews  = catalog.previews  ?? [];
    const creators  = catalog.creators  ?? [];
    const seenPostIds    = new Set<string>();
    const seenCreatorIds = new Set<string>();
    return previews
      .filter((p: any) => {
        if (p.id === id) return false;
        const isVid = p.kind === 'video' || p.kind === 'audio' || p.contentType === 'video' || p.mediaType === 'video';
        if (!isVid) return false;
        if (seenPostIds.has(p.id)) return false;
        // Only one card per creator — prevents the same avatar/name showing twice
        if (seenCreatorIds.has(p.creatorId)) return false;
        seenPostIds.add(p.id);
        seenCreatorIds.add(p.creatorId);
        return true;
      })
      .slice(0, 10)
      .flatMap((p: any) => {
        const creator = creators.find((c: any) => c.id === p.creatorId);
        if (!creator) return [];
        const post: Post = {
          id:            p.id,
          caption:       p.title || '',
          visibility:    'public',
          contentType:   (p.contentType as Post['contentType']) ?? 'video',
          mediaUrl:      p.mediaUrl ?? undefined,
          mediaType:     'video',
          thumbnailUrl:  p.thumbnailUrl ?? undefined,
          durationSecs:  null,
          fileSize:      null,
          width:         null,
          height:        null,
          likeCount:     0,
          likes_count:   0,
          commentCount:  p.commentCount ?? 0,
          comments_count: p.commentCount ?? 0,
          bookmarkCount: 0,
          createdAt:     p.createdAt ?? '',
          created_at:    p.createdAt ?? '',
          author: {
            id:         creator.id,
            name:       creator.name,
            username:   creator.handle.replace('@', ''),
            avatarUrl:  creator.avatarUrl ?? null,
            isVerified: creator.isVerified ?? false,
            isCreator:  true,
          },
          likedByMe:      false,
          is_liked:       false,
          bookmarkedByMe: false,
          is_bookmarked:  false,
        };
        return [post];
      });
  }, [catalog, id]);

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <PressScale
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <ArrowLeft size={19} color={T.TEXT} weight="bold" />
          </PressScale>
        </View>
        <MsPostSkeleton />
        <MsPostSkeleton />
        <MsPostSkeleton />
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
  const openProfile = (authorId: string, username: string) => {
    const isSelf = user?.id === authorId || (!!user?.username && user.username === username);
    router.push(isSelf ? '/(tabs)/profile' : `/creator/${authorId}`);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Floating hearts (spawned by like button) ──────────────────────── */}
      {hearts.map(h => (
        <FlyingHeart key={h.id} x={h.x} y={h.y} />
      ))}

      {/* ── Top bar — back button ─────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <PressScale
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <ArrowLeft size={19} color={T.TEXT} weight="bold" />
        </PressScale>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* ── Video player (aspect-ratio, custom controls) ──────────────── */}
        <MsLongFormPlayer
          videoId={post.id}
          uri={videoMedia ?? null}
          posterUri={post.thumbnailUrl}
          qualities={post.qualities}
          isPremium={post.isLocked ?? false}
          autoPlay
          active={screenActive}
          initialAspectRatio={
            post.width && post.height ? post.width / post.height : 16 / 9
          }
          onPremiumRequired={() => setPremiumSheetVisible(true)}
        />

        {/* ── Title & upload date ───────────────────────────────────────── */}
        <View style={styles.meta}>
          <Text style={styles.titleText} numberOfLines={4}>
            {post.title || post.caption || 'Untitled'}
          </Text>
          <Text style={styles.uploadDate}>{uploadDateStr}</Text>
        </View>

        {/* ── Action bar: Like / Comment / Save / Share ─────────────────── */}
        <View ref={likeBarRef} style={styles.actionBar} collapsable={false}>
          {/* Like button — animated bounce + flying hearts */}
          <ActionBtn onPress={toggleLike} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
            <Animated.View style={[styles.actionBtnInner, likeStyle]}>
              <Heart
                size={17}
                color={liked ? '#EF4444' : T.TEXT_2}
                weight={liked ? 'fill' : 'regular'}
              />
              <Text style={[styles.actionLabel, liked && styles.actionLabelLiked]}>
                {likeCount > 0 ? formatCount(likeCount) : 'Like'}
              </Text>
            </Animated.View>
          </ActionBtn>

          <ActionBtn
            onPress={() => setCommentsVisible(true)}
            accessibilityLabel="Comments"
          >
            <View style={styles.actionBtnInner}>
              <ChatCircle size={17} color={T.TEXT_2} />
              <Text style={styles.actionLabel}>
                {post.commentCount > 0 ? formatCount(post.commentCount) : 'Comment'}
              </Text>
            </View>
          </ActionBtn>

          <ActionBtn
            onPress={toggleBookmark}
            accessibilityLabel={bookmarked ? 'Unsave' : 'Save'}
          >
            <View style={styles.actionBtnInner}>
              <Bookmark
                size={17}
                color={bookmarked ? T.TEXT : T.TEXT_2}
                weight={bookmarked ? 'fill' : 'regular'}
              />
              <Text style={[styles.actionLabel, bookmarked && styles.actionLabelSaved]}>
                {bookmarked ? 'Saved' : 'Save'}
              </Text>
            </View>
          </ActionBtn>

          <ActionBtn
            onPress={() => setShareVisible(true)}
            accessibilityLabel="Share"
          >
            <View style={styles.actionBtnInner}>
              <ShareNetwork size={17} color={T.TEXT_2} />
              <Text style={styles.actionLabel}>Share</Text>
            </View>
          </ActionBtn>
        </View>

        {/* ── Creator card ─────────────────────────────────────────────── */}
        <PressScale style={styles.creatorCard}>
          <Pressable
            style={styles.creatorCardInner}
            onPress={() => openProfile(post.author.id, post.author.username)}
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
                  <SealCheck size={14} color={T.TEXT} weight="fill" />
                )}
              </View>
              <Text style={styles.creatorHandle}>@{post.author.username}</Text>
            </View>
            <PressScale
              style={styles.subscribeBtn}
               onPress={() => openProfile(post.author.id, post.author.username)}
              hitSlop={6}
              accessibilityLabel="Subscribe"
            >
              <UserPlus size={13} color={T.BG} />
              <Text style={styles.subscribeBtnText}>Subscribe</Text>
            </PressScale>
          </Pressable>
        </PressScale>

        {/* ── Comments preview ─────────────────────────────────────────── */}
        {post.commentCount > 0 && (
          <PressScale style={styles.commentsPreview}>
            <Pressable
              style={styles.commentsPreviewInner}
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
          </PressScale>
        )}

        {/* ── Related videos ────────────────────────────────────────────── */}
        {catalogQuery.isLoading ? (
          <View style={styles.relatedSection}>
            <MsPostSkeleton />
            <MsPostSkeleton />
          </View>
        ) : relatedVideos.length > 0 ? (
          <View style={styles.relatedSection}>
            {relatedVideos.map((video) => (
              <MsPostCard
                key={video.id}
                post={video}
                onAuthorPress={() => openProfile(video.author.id, video.author.username)}
                onPress={() => router.replace(`/videos/${video.id}`)}
                onMediaPress={() => router.replace(`/videos/${video.id}`)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Sheets ───────────────────────────────────────────────────────── */}
      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        postId={post.id}
      />

      <MsShareSheet
        visible={shareVisible}
        contentType="video"
        contentId={post.id}
        title={post.caption || 'Video'}
        onClose={() => setShareVisible(false)}
      />

      {/* Premium gate: subscription-based — route to creator page to subscribe */}
      {premiumSheetVisible && (
        <Pressable
          style={styles.premiumGate}
          onPress={() => { setPremiumSheetVisible(false); router.push(`/creator/${post.author.id}`); }}
        >
          <View style={styles.premiumCard}>
            <Text style={styles.premiumTitle}>Subscribers Only</Text>
            <Text style={styles.premiumSub}>Subscribe to this creator to watch this video.</Text>
            <View style={styles.premiumBtn}>
              <Text style={styles.premiumBtnLabel}>View Creator</Text>
            </View>
          </View>
        </Pressable>
      )}
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
    paddingVertical: 10,
    paddingHorizontal: 4,
    ...T.SHADOWS.soft,
  },
  actionBtn: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 54,
    borderRadius: T.RADIUS.lg,
  },
  actionBtnInner: {
    alignItems: 'center',
    gap: 5,
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
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    ...T.SHADOWS.soft,
    overflow: 'hidden',
  },
  creatorCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
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
    ...T.SHADOWS.soft,
    overflow: 'hidden',
  },
  commentsPreviewInner: {
    padding: 14,
    gap: 6,
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
    marginTop: 20,
    paddingHorizontal: 14,
  },
  relatedTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 16,
    marginBottom: 10,
  },
  relatedCard: {
    marginBottom: 6,
  },
  premiumGate: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 10,
  },
  premiumCard: {
    width: '82%',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...T.SHADOWS.hard,
  },
  premiumTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 18,
  },
  premiumSub: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  premiumBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
  },
  premiumBtnLabel: {
    color: T.BG,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
  },
});
