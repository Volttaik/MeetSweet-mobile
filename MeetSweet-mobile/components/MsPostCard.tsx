import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Heart, ChatCircle, Bookmark, DotsThree, SealCheck, Play, Images, LockSimple } from 'phosphor-react-native';
import { MsTierBadge } from '@/components/MsTierBadge';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import type { Post } from '@/services/posts';
import { TIERS, type ContentTier } from '@/constants/tiers';
import {
  likePost,
  unlikePost,
  bookmarkPost,
  unbookmarkPost,
  deletePost,
  reportPost,
  hidePost,
  hideCreator,
} from '@/services/posts';
import { MsFeedbackModal, type FeedbackVariant } from '@/components/MsFeedbackModal';
import { dialogs } from '@/components/MsGlobalDialogs';
import { toast } from '@/components/MsToast';
import { setCommentsEnabled } from '@/services/comment-room-service';
import { usePostActions } from '@/contexts/PostActionsContext';
import { realtime, REALTIME_EVENT } from '@/services/realtime';
import { MsShareSheet } from '@/components/MsShareSheet';
import { tapLight, tapMedium, tapHeavy } from '@/lib/haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { enqueueOfflineAction, removeCachedPost, updateCachedPost } from '@/lib/posts-db';

// ── Spring presets ────────────────────────────────────────────────────────────
const SPRING_PRESS  = { damping: 14, stiffness: 380, mass: 1 };
const SPRING_BOUNCE = { damping: 10, stiffness: 320, mass: 1 };
const SPRING_HEART  = { damping: 8,  stiffness: 260, mass: 1 };

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Duration badge label — always from the backend's real media metadata
 * (viewPost.durationSecs), never guessed or hardcoded client-side.
 * Returns null when no duration is known so no fake badge is rendered.
 */
function fmtDuration(secs: number | null | undefined): string | null {
  if (!secs || secs <= 0 || !isFinite(secs)) return null;
  const s  = Math.floor(secs);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
  return `${m}:${String(sc).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

// ── ScalePressable — spring physics press wrapper ─────────────────────────────

function ScalePressable({
  children,
  onPress,
  style,
  onLongPress,
  onDoubleTap,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  onDoubleTap?: () => void;
  style?: any;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef = useRef(0);

  const handlePress = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    tapTimerRef.current = setTimeout(() => {
      if (tapCountRef.current >= 2) {
        onDoubleTap?.();
      } else {
        onPress?.();
      }
      tapCountRef.current = 0;
    }, 230);
  };

  return (
    <Animated.View style={[animStyle, style]}>
      <MsPressable
        onPress={handlePress}
        onLongPress={onLongPress}
        onPressIn={() => {
          scale.value = withSpring(0.96, SPRING_PRESS);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING_BOUNCE);
        }}
        delayLongPress={400}
      >
        {children}
      </MsPressable>
    </Animated.View>
  );
}

// ── AnimatedHeart — spring burst on like ─────────────────────────────────────

function AnimatedHeart({ liked }: { liked: boolean }) {
  const scale = useSharedValue(1);
  const prevLiked = useRef(liked);

  if (liked && !prevLiked.current) {
    scale.value = withSequence(
      withSpring(1.5, SPRING_HEART),
      withSpring(1,   { damping: 12, stiffness: 400, mass: 1 }),
    );
  }
  prevLiked.current = liked;

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <Heart
        size={18}
        color={liked ? '#EF4444' : T.TEXT_2}
        weight={liked ? 'fill' : 'regular'}
      />
    </Animated.View>
  );
}

// ── ActionButton — spring-press wrapper for action row icons ──────────────────

function ActionButton({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <MsPressable
        style={[baseActionStyles.btn, style]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.82, SPRING_PRESS); }}
        onPressOut={() => { scale.value = withSpring(1, SPRING_BOUNCE); }}
      >
        {children}
      </MsPressable>
    </Animated.View>
  );
}

const baseActionStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: T.RADIUS.sm,
  },
});

// ── MsPostCard ────────────────────────────────────────────────────────────────

interface MsPostCardProps {
  post: Post;
  onPress?: () => void;
  onMediaPress?: () => void;
  onAuthorPress?: () => void;
  /**
   * Dedicated handler for the comment action. When provided, the comment button
   * opens this (e.g. the comment sheet on the post detail screen) instead of
   * falling back to `onPress` navigation.
   */
  onCommentsPress?: () => void;
  onDeleted?: (id: string) => void;
  /** Called after Hide Creator succeeds — lets the parent drop all cards. */
  onCreatorHidden?: (creatorId: string) => void;
  currentUserId?: string;
  onEditPress?: (post: Post) => void;
  onAnalyticsPress?: (post: Post) => void;
  /**
   * True when the viewer is subscribed to this post's author. Discovery
   * actions (Not Interested / Hide Creator) are then hidden to respect the
   * subscription relationship.
   */
  subscribedToAuthor?: boolean;
  /**
   * Home-Feed mode: double-tap anywhere on the post opens Full View;
   * single tap on media does NOT navigate (play button still works inline).
   * All other screens leave this false / undefined for single-tap behaviour.
   */
  doubleTapToOpen?: boolean;
  /**
   * Whether the video preview should be actively playing.
   * Driven by FlatList viewability — true when card is on screen, false when off.
   * Defaults to true (plays immediately when mounted).
   */
  videoPreviewActive?: boolean;
  /**
   * Content tier badge shown next to the author name.
   * free = no badge (public/Explore content).
   * subscriber = Subscriber pill badge.
   * subscriber_plus = Subscriber+ pill badge.
   * Omit to derive from viewPost.tier.
   */
  tier?: ContentTier;
  /**
   * Force the card into a locked state (subscriber-gated content). When true,
   * media is replaced by a lock overlay + subscribe CTA. Defaults to deriving
   * from viewPost.isLocked / viewPost.is_locked.
   */
  locked?: boolean;
  /** Called when the user taps the locked content's subscribe CTA. */
  onSubscribe?: () => void;
}

export const MsPostCard = React.memo(function MsPostCard({
  post,
  onPress,
  onMediaPress,
  onAuthorPress,
  onCommentsPress,
  onDeleted,
  onCreatorHidden,
  currentUserId,
  onEditPress,
  onAnalyticsPress,
  subscribedToAuthor = false,
  doubleTapToOpen = false,
  videoPreviewActive = true,
  tier,
  locked,
  onSubscribe,
}: MsPostCardProps) {
  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: FeedbackVariant;
    title: string;
    message?: string;
  } | null>(null);

  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const userId = user?.id ?? '';

  // Like/bookmark state comes from the shared post-actions store (with the
  // server-fetched post fields as fallback), so a like performed on ANY screen
  // is reflected on every mounted card of this post immediately.
  const {
    markDeleted,
    markHidden,
    markCreatorHidden,
    likeOverrides,
    bookmarkOverrides,
    commentCounts,
    editedPosts,
    markLiked,
    markBookmarked,
  } = usePostActions();
  // Use the shared edit mirror immediately while feeds/detail screens catch up
  // with their next durable load. This keeps post text consistent everywhere.
  const viewPost: Post = { ...post, ...(editedPosts[post.id] ?? {}) };
  const likeOverride = likeOverrides[viewPost.id];
  const bookmarkOverride = bookmarkOverrides[viewPost.id];
  const liked = likeOverride?.likedByMe ?? viewPost.likedByMe;
  const likeCount = likeOverride?.likeCount ?? viewPost.likeCount;
  const bookmarked = bookmarkOverride?.bookmarkedByMe ?? viewPost.bookmarkedByMe ?? false;
  const bookmarkCount = bookmarkOverride?.bookmarkCount ?? viewPost.bookmarkCount ?? 0;
  const commentCount = commentCounts[viewPost.id] ?? viewPost.commentCount ?? viewPost.comments_count ?? 0;

  const isOwn = Boolean(currentUserId && currentUserId === viewPost.author.id);
  const isLocked = Boolean(locked ?? viewPost.isLocked ?? viewPost.is_locked);

  // ── Realtime: live like counts for this post (feeds update in place) ────
  // Subscribing to post:{id} while this card is mounted lets other users'
  // likes/unlikes reflect immediately without a refresh or poll. The viewer's
  // own liked state is preserved — only the authoritative count is applied.
  const likedRef = useRef(liked);
  useEffect(() => {
    likedRef.current = liked;
  }, [liked]);
  useEffect(() => {
    const channel = `post:${viewPost.id}`;
    realtime.subscribe(channel);
    const off = realtime.on(REALTIME_EVENT.postLikeUpdated, (event) => {
      if (event.resourceId !== viewPost.id) return;
      const p = event.payload as { likeCount?: number };
      if (typeof p.likeCount !== 'number') return;
      markLiked(viewPost.id, likedRef.current, p.likeCount);
      updateCachedPost(viewPost.id, userId, { likeCount: p.likeCount }).catch(() => {});
    });
    return () => {
      realtime.unsubscribe(channel);
      off();
    };
  }, [viewPost.id, markLiked, userId]);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    const wasLiked = liked;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    const nextCount = Math.max(0, likeCount + delta);
    // Publish optimistically — every mounted view of this post updates now.
    markLiked(viewPost.id, nextLiked, nextCount);
    tapMedium();

    // Update SQLite cache optimistically
    updateCachedPost(viewPost.id, userId, {
      likedByMe: nextLiked,
      likeCount: nextCount,
    }).catch(() => {});

    if (!isOnline) {
      enqueueOfflineAction({ type: 'like_post', postId: viewPost.id, liked: nextLiked }, userId).catch(() => {});
      setLiking(false);
      return;
    }

    try {
      if (wasLiked) {
        await unlikePost(viewPost.id);
      } else {
        await likePost(viewPost.id);
      }
      // Server confirmed — keep the shared state authoritative.
      markLiked(viewPost.id, nextLiked, nextCount);
    } catch {
      // Revert on API failure
      markLiked(viewPost.id, wasLiked, Math.max(0, likeCount - delta));
      updateCachedPost(viewPost.id, userId, {
        likedByMe: wasLiked,
        likeCount: Math.max(0, likeCount - delta),
      }).catch(() => {});
    } finally {
      setLiking(false);
    }
  };

  const handleBookmark = async () => {
    if (bookmarking) return;
    setBookmarking(true);
    const was = bookmarked;
    const next = !was;
    const delta = next ? 1 : -1;
    const nextCount = Math.max(0, bookmarkCount + delta);
    markBookmarked(viewPost.id, next, nextCount);
    tapLight();

    // Update SQLite cache optimistically
    updateCachedPost(viewPost.id, userId, {
      bookmarkedByMe: next,
      bookmarkCount: nextCount,
    }).catch(() => {});

    if (!isOnline) {
      enqueueOfflineAction({ type: 'save_post', postId: viewPost.id, saved: next }, userId).catch(() => {});
      setBookmarking(false);
      return;
    }

    try {
      if (was) await unbookmarkPost(viewPost.id);
      else await bookmarkPost(viewPost.id);
      markBookmarked(viewPost.id, next, nextCount);
    } catch {
      markBookmarked(viewPost.id, was, Math.max(0, bookmarkCount - delta));
      updateCachedPost(viewPost.id, userId, {
        bookmarkedByMe: was,
        bookmarkCount: Math.max(0, bookmarkCount - delta),
      }).catch(() => {});
    } finally {
      setBookmarking(false);
    }
  };

  const doDelete = () => {
    tapHeavy();
    dialogs.confirm({
      title: 'Delete Post',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await deletePost(viewPost.id);
          markDeleted(viewPost.id);
          // Purge the server-confirmed deleted post from the local feed cache
          // so it can never reappear from stale cache/local state.
          removeCachedPost(viewPost.id, userId).catch(() => {});
          onDeleted?.(viewPost.id);
        } catch {
          dialogs.alert({ variant: 'error', title: 'Could not delete post' });
        }
      },
    });
  };

  const doReport = (reason: string) =>
    reportPost(viewPost.id, reason).catch(() =>
      dialogs.alert({ variant: 'error', title: 'Could not report post' }),
    );

  const ownActions: ActionItem[] = [
    {
      label: 'Edit Post',
      onPress: () => {
        setSheetVisible(false);
        onEditPress?.(post);
      },
    },
    {
      label: (viewPost.commentsEnabled ?? true) ? 'Turn Off Comments' : 'Turn On Comments',
      onPress: async () => {
        setSheetVisible(false);
        const nextState = !(viewPost.commentsEnabled ?? true);
        try {
          await setCommentsEnabled(viewPost.id, nextState);
          viewPost.commentsEnabled = nextState;
          toast.success(
            nextState ? 'Comments turned on' : 'Comments turned off',
          );
        } catch {
          dialogs.alert({ variant: 'error', title: 'Could not update comment settings' });
        }
      },
    },
    {
      label: 'View Analytics',
      onPress: () => {
        setSheetVisible(false);
        onAnalyticsPress?.(post);
      },
    },
    { label: 'Delete Post', destructive: true, onPress: doDelete },
  ];

  // Not Interested — persist server-side (excluded from every feed) + drop the
  // post from the current list immediately.
  const doNotInterested = () => {
    setSheetVisible(false);
    setFeedback({ variant: 'info', title: 'Noted', message: "We'll show you less of this content." });
    hidePost(viewPost.id)
      .then(() => {
        markHidden(viewPost.id);
        onDeleted?.(viewPost.id);
      })
      .catch(() => setFeedback({ variant: 'error', title: 'Could not hide', message: 'Please try again.' }));
  };

  // Hide Creator — persist server-side (mute) + drop ALL of the creator's
  // cards from the current list immediately.
  const doHideCreator = () => {
    setSheetVisible(false);
    hideCreator(viewPost.author.username)
      .then(() => {
        markCreatorHidden(viewPost.author.id);
        onCreatorHidden?.(viewPost.author.id);
        onDeleted?.(viewPost.id);
        setFeedback({
          variant: 'success',
          title: 'Creator hidden',
          message: `${viewPost.author.name}'s content will no longer appear in your feeds.`,
        });
      })
      .catch(() => setFeedback({ variant: 'error', title: 'Could not hide creator', message: 'Please try again.' }));
  };

  const guestActions: ActionItem[] = [
    { label: 'Save Post', onPress: () => handleBookmark() },
    { label: 'Share Post', onPress: () => setShareVisible(true) },
    // Discovery-only actions — never shown for creators the viewer already
    // subscribes to.
    ...(!subscribedToAuthor
      ? [
          { label: 'Not Interested', onPress: doNotInterested },
          { label: 'Hide Creator', onPress: doHideCreator },
        ]
      : []),
    { label: 'Report', destructive: true, onPress: () => doReport('inappropriate') },
  ];

  const inits = viewPost.author.name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const openSheet = () => { tapLight(); setSheetVisible(true); };

  return (
    <MsPressable
      onPress={doubleTapToOpen ? undefined : onPress}
      disabled={!onPress || doubleTapToOpen}
      style={styles.card}
    >
      {/* Author row */}
      <View style={styles.authorRow}>
        <MsPressable
          onPress={onAuthorPress}
          style={styles.authorLeft}
            onLongPress={openSheet}
          delayLongPress={400}
        >
          <MsAvatar
            size={38}
            initials={inits}
            imageUri={viewPost.author.avatarUrl ?? undefined}
          />
          <View style={styles.authorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {viewPost.author.name}
              </Text>
              {viewPost.author.isVerified && (
                <SealCheck size={14} color={T.TEXT} weight="fill" />
              )}
            </View>
            <Text style={styles.authorMeta}>
              @{viewPost.author.username} · {formatTime(viewPost.createdAt)}
            </Text>
          </View>
        </MsPressable>

        <View style={styles.authorRight}>
          {/* Tier badge — prefer explicit prop, then viewPost.tier (skip free — no badge for public posts). */}
          {(() => {
            const effectiveTier = tier ?? viewPost.tier;
            // New tier system
            if (effectiveTier === 'subscriber' || effectiveTier === 'subscriber_plus') {
              return <MsTierBadge tier={effectiveTier} size="xs" />;
            }
            return null;
          })()}
          <MsPressable
            style={styles.moreBtn}
                onPress={openSheet}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <DotsThree size={18} color={T.TEXT_2} />
          </MsPressable>
        </View>
      </View>

      {/* Video title — shown for video/short posts that carry a title from the backend */}
      {!!(viewPost.title && (viewPost.contentType === 'video' || viewPost.contentType === 'short' || viewPost.mediaType === 'video')) && (
        <MsPressable
            onPress={onPress}
          onLongPress={openSheet}
          delayLongPress={400}
        >
          <Text style={styles.videoTitle} numberOfLines={2}>
            {viewPost.title}
          </Text>
        </MsPressable>
      )}

      {/* Caption
          feedMode (doubleTapToOpen): double-tap navigates, single tap = nothing.
          Other screens: single tap navigates (original behaviour).
          For video/short posts the description is shown below the title.
      */}
      {!!viewPost.caption && (
        doubleTapToOpen ? (
          <ScalePressable
            onPress={undefined}
            onDoubleTap={onPress}
            onLongPress={openSheet}
            style={styles.captionPressable}
          >
            <Text style={styles.caption} numberOfLines={3}>
              {viewPost.caption}
            </Text>
          </ScalePressable>
        ) : (
          <MsPressable
                onPress={onPress}
            onLongPress={openSheet}
            delayLongPress={400}
          >
            <Text style={styles.caption} numberOfLines={3}>
              {viewPost.caption}
            </Text>
          </MsPressable>
        )
      )}

      {/* Media — album
          Stack-of-cards effect: two offset cards behind the main cover.
          Tapping always opens the album detail page.
      */}
      {viewPost.contentType === 'album' && (
        <MsPressable
            onPress={() => router.push(`/album/${viewPost.id}`)}
          onLongPress={openSheet}
          delayLongPress={400}
        >
          <View style={styles.albumStack}>
            {/* Card 3 — furthest back */}
            <View style={[styles.albumCard, styles.albumCardBack2, { borderRadius: T.RADIUS.xl }]} />
            {/* Card 2 — middle */}
            <View style={[styles.albumCard, styles.albumCardBack1, { borderRadius: T.RADIUS.xl }]} />
            {/* Card 1 — front (actual cover) */}
            <View style={[styles.albumCard, { borderRadius: T.RADIUS.xl, overflow: 'hidden', zIndex: 3 }]}>
              {viewPost.mediaUrl ? (
                <MsMediaLoader
                  uri={viewPost.mediaUrl}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  accessibleLabel="Album cover"
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1F' }]} />
              )}
              {/* Bottom gradient overlay with price/item info */}
              <View style={styles.albumOverlay}>
                <View style={styles.albumBadge}>
                  <Images size={12} color="#fff" weight="bold" />
                  <Text style={styles.albumBadgeText}>
                    {'Album'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </MsPressable>
      )}

      {/* Locked media — subscriber-gated content shows a lock state with a
          subscribe CTA instead of the media itself. */}
      {isLocked && (
        <MsPressable
            onPress={onSubscribe ?? onMediaPress ?? onPress}
          onLongPress={openSheet}
          delayLongPress={400}
          accessibilityLabel={viewPost.tier === 'subscriber_plus' ? 'Subscriber+ locked content' : 'Subscriber locked content'}
        >
          <View style={styles.lockedMedia}>
            <View style={styles.lockedIcon}>
              <LockSimple size={20} color={T.TEXT_2} weight="bold" />
            </View>
            <Text style={styles.lockedTitle}>
              {viewPost.tier === 'subscriber_plus' ? 'Subscriber+ only' : 'Subscribers only'}
            </Text>
            <Text style={styles.lockedSub}>Subscribe to unlock this content</Text>
            <View style={styles.lockedCta}>
              <Text style={styles.lockedCtaLabel}>Subscribe</Text>
            </View>
          </View>
        </MsPressable>
      )}

      {/* Media — image
          feedMode: single tap = nothing, double-tap = open Full View.
          Other screens: single tap = open Full View, double-tap = like.
      */}
      {!isLocked && viewPost.mediaUrl && viewPost.mediaType === 'image' && viewPost.contentType !== 'album' && (
        <ScalePressable
          onPress={doubleTapToOpen ? undefined : (onMediaPress ?? onPress)}
          onLongPress={openSheet}
          onDoubleTap={doubleTapToOpen ? (onMediaPress ?? onPress) : handleLike}
        >
          <View style={[
            styles.media,
            { borderRadius: T.RADIUS.xl, overflow: 'hidden' },
            viewPost.width && viewPost.height ? { aspectRatio: viewPost.width / viewPost.height } : undefined,
          ]}>
            <MsMediaLoader
              uri={viewPost.mediaUrl}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibleLabel="Post image"
            />
          </View>
        </ScalePressable>
      )}

      {/* Media — video
          Feed: shows static thumbnail + play button overlay immediately.
          Tapping opens the dedicated Video Post page.
          Long-press opens the action sheet for save/share/report.
          Note: we render the card even when mediaUrl is null (Explore preview objects
          may only carry thumbnailUrl), because the card taps navigate to /videos/:id.
      */}
      {!isLocked && viewPost.mediaType === 'video' && (
        <MsPressable
            onPress={onMediaPress ?? onPress}
          onLongPress={openSheet}
          delayLongPress={400}
        >
          <View style={[
            styles.videoPlaceholder,
            { borderRadius: T.RADIUS.xl, overflow: 'hidden' },
            viewPost.width && viewPost.height ? { aspectRatio: viewPost.width / viewPost.height } : undefined,
          ]}>
            {(viewPost.thumbnailUrl || viewPost.thumbnail_url) ? (
              <MsMediaLoader
                uri={(viewPost.thumbnailUrl || viewPost.thumbnail_url)!}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibleLabel="Video thumbnail"
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1F' }]} />
            )}
            {/* Play button overlay — decorative, tap is handled by the card press */}
            <View style={styles.videoPlayOverlay} pointerEvents="none">
              <View style={styles.videoPlayBtn}>
                <Play size={20} color="#fff" weight="fill" />
              </View>
            </View>
            {/* Duration badge — real media metadata (e.g. 0:42 / 12:38) */}
            {fmtDuration(viewPost.durationSecs) && (
              <View style={styles.durationBadge} pointerEvents="none">
                <Text style={styles.durationBadgeText}>{fmtDuration(viewPost.durationSecs)}</Text>
              </View>
            )}
          </View>
        </MsPressable>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {/* Like — spring heart burst */}
        <ActionButton onPress={handleLike} style={styles.actionBtn}>
          <AnimatedHeart liked={liked} />
          {likeCount > 0 && (
            <Text style={[styles.actionCount, liked && styles.actionCountLiked]}>
              {formatCount(likeCount)}
            </Text>
          )}
        </ActionButton>

        {/* Comment */}
        <ActionButton onPress={onCommentsPress ?? onPress} style={styles.actionBtn}>
          <ChatCircle size={18} color={T.TEXT_2} />
          {commentCount > 0 && (
            <Text style={styles.actionCount}>{formatCount(commentCount)}</Text>
          )}
        </ActionButton>

        <View style={{ flex: 1 }} />

        {/* Bookmark */}
        <ActionButton onPress={handleBookmark} style={styles.actionBtn}>
          <Bookmark
            size={18}
            color={bookmarked ? T.TEXT : T.TEXT_2}
            weight={bookmarked ? 'fill' : 'regular'}
          />
        </ActionButton>
      </View>

      <View style={styles.cardSpacing} />

      {/* Context menu */}
      <MsActionSheet
        visible={sheetVisible}
        title={isOwn ? 'Your Post' : viewPost.author.name}
        subtitle={isOwn ? undefined : `@${viewPost.author.username}`}
        actions={isOwn ? ownActions : guestActions}
        onClose={() => setSheetVisible(false)}
      />
      <MsShareSheet
        visible={shareVisible}
        contentType={viewPost.contentType || (viewPost.mediaType === 'video' ? 'video' : 'post')}
        contentId={viewPost.id}
        title={viewPost.caption || 'MeetSweet post'}
        preview={{
          title: viewPost.caption || viewPost.author.name || 'MeetSweet post',
          subtitle: viewPost.author.username ? `@${viewPost.author.username}` : undefined,
          imageUrl: viewPost.thumbnailUrl || viewPost.mediaUrl || undefined,
          avatarUrl: undefined,
        }}
        onClose={() => setShareVisible(false)}
      />

      {/* Styled action feedback (success / info / error) — never a toast */}
      <MsFeedbackModal
        visible={Boolean(feedback)}
        variant={feedback?.variant ?? 'info'}
        title={feedback?.title ?? ''}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
    </MsPressable>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: T.BG },

  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  authorLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  authorName: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    flexShrink: 1,
  },
  authorMeta: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginTop: 1,
  },
  authorRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  moreBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  captionPressable: {
    // Allows the ScalePressable wrapper for caption double-tap to fill width
  },
  videoTitle: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  caption: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },

  media: { width: '100%', aspectRatio: 1, backgroundColor: T.SURFACE },

  lockedMedia: {
    width: '100%',
    height: 220,
    backgroundColor: '#1A1A1F',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
  },
  lockedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  lockedTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  lockedSub: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  lockedCta: {
    marginTop: 8,
    paddingHorizontal: 20,
    height: 34,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedCtaLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 12 },

  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationBadgeText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 10,
    letterSpacing: 0.3,
  },

  albumStack: {
    // Extra bottom padding so the offset back-cards are visible
    paddingBottom: 10,
    paddingHorizontal: 6,
  },
  albumCard: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#1A1A1F',
  },
  albumCardBack1: {
    position: 'absolute',
    bottom: 4,
    left: 12,
    right: 12,
    top: 4,
    backgroundColor: '#2A2A30',
    zIndex: 2,
  },
  albumCardBack2: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    top: 8,
    backgroundColor: '#1E1E24',
    zIndex: 1,
  },
  albumOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
  },
  albumBadgeText: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: T.RADIUS.sm,
    minHeight: 34,
  },
  actionCount: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  actionCountLiked: { color: '#EF4444' },

  cardSpacing: { height: 6 },
});
