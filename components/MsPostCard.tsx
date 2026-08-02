import React, { useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Heart, ChatCircle, Bookmark, DotsThree, SealCheck, LockOpen, Lock, Crown, Diamond } from 'phosphor-react-native';
import { T, TIERS } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsPremiumContent } from '@/components/MsPremiumContent';
import type { Post } from '@/services/posts';
import {
  likePost,
  unlikePost,
  bookmarkPost,
  unbookmarkPost,
  deletePost,
  reportPost,
} from '@/services/posts';
import { usePostActions } from '@/contexts/PostActionsContext';
import { MsShareSheet } from '@/components/MsShareSheet';
import { tapLight, tapMedium, tapHeavy } from '@/lib/haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/hooks/useNetwork';
import { enqueueOfflineAction, updateCachedPost } from '@/lib/posts-db';

// ── Spring presets ────────────────────────────────────────────────────────────
const SPRING_PRESS  = { damping: 14, stiffness: 380, mass: 1 };
const SPRING_BOUNCE = { damping: 10, stiffness: 320, mass: 1 };
const SPRING_HEART  = { damping: 8,  stiffness: 260, mass: 1 };

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
      <TouchableOpacity
        activeOpacity={1}
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
      </TouchableOpacity>
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
      <TouchableOpacity
        style={[baseActionStyles.btn, style]}
        onPress={onPress}
        activeOpacity={1}
        onPressIn={() => { scale.value = withSpring(0.82, SPRING_PRESS); }}
        onPressOut={() => { scale.value = withSpring(1, SPRING_BOUNCE); }}
      >
        {children}
      </TouchableOpacity>
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
  onDeleted?: (id: string) => void;
  currentUserId?: string;
  onEditPress?: (post: Post) => void;
  onAnalyticsPress?: (post: Post) => void;
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
}

export function MsPostCard({
  post,
  onPress,
  onMediaPress,
  onAuthorPress,
  onDeleted,
  currentUserId,
  onEditPress,
  onAnalyticsPress,
  doubleTapToOpen = false,
  videoPreviewActive = true,
}: MsPostCardProps) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liking, setLiking] = useState(false);
  const [bookmarked, setBookmarked] = useState(post.bookmarkedByMe ?? false);
  const [bookmarkCount, setBookmarkCount] = useState(post.bookmarkCount ?? 0);
  const [bookmarking, setBookmarking] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const userId = user?.id ?? '';

  const isOwn = Boolean(currentUserId && currentUserId === post.author.id);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    const wasLiked = liked;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    setLiked(nextLiked);
    setLikeCount((c) => Math.max(0, c + delta));
    tapMedium();

    // Update SQLite cache optimistically
    updateCachedPost(post.id, userId, {
      likedByMe: nextLiked,
      likeCount: Math.max(0, post.likeCount + delta),
    }).catch(() => {});

    if (!isOnline) {
      enqueueOfflineAction({ type: 'like_post', postId: post.id, liked: nextLiked }, userId).catch(() => {});
      setLiking(false);
      return;
    }

    try {
      if (wasLiked) {
        const res = await unlikePost(post.id);
        setLikeCount(res.likeCount);
      } else {
        const res = await likePost(post.id);
        setLikeCount(res.likeCount);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount((c) => Math.max(0, c - delta));
      updateCachedPost(post.id, userId, {
        likedByMe: wasLiked,
        likeCount: Math.max(0, post.likeCount - delta),
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
    setBookmarked(next);
    setBookmarkCount((c) => Math.max(0, c + delta));
    tapLight();

    // Update SQLite cache optimistically
    updateCachedPost(post.id, userId, {
      bookmarkedByMe: next,
      bookmarkCount: Math.max(0, bookmarkCount + delta),
    }).catch(() => {});

    if (!isOnline) {
      enqueueOfflineAction({ type: 'save_post', postId: post.id, saved: next }, userId).catch(() => {});
      setBookmarking(false);
      return;
    }

    try {
      if (was) await unbookmarkPost(post.id);
      else await bookmarkPost(post.id);
    } catch {
      setBookmarked(was);
      setBookmarkCount((c) => Math.max(0, c - delta));
      updateCachedPost(post.id, userId, {
        bookmarkedByMe: was,
        bookmarkCount: Math.max(0, bookmarkCount - delta),
      }).catch(() => {});
    } finally {
      setBookmarking(false);
    }
  };

  const { markDeleted } = usePostActions();

  const doDelete = () => {
    tapHeavy();
    Alert.alert('Delete Post', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            markDeleted(post.id);
            onDeleted?.(post.id);
          } catch {
            Alert.alert('Error', 'Could not delete post.');
          }
        },
      },
    ]);
  };

  const doReport = (reason: string) =>
    reportPost(post.id, reason).catch(() =>
      Alert.alert('Error', 'Could not report post.'),
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
      label: 'View Analytics',
      onPress: () => {
        setSheetVisible(false);
        onAnalyticsPress?.(post);
      },
    },
    { label: 'Delete Post', destructive: true, onPress: doDelete },
  ];

  const guestActions: ActionItem[] = [
    { label: 'Save Post', onPress: () => handleBookmark() },
    { label: 'Share Post', onPress: () => setShareVisible(true) },
    { label: 'Not Interested', onPress: () => {} },
    { label: 'Hide Creator', onPress: () => {} },
    { label: 'Report', destructive: true, onPress: () => doReport('inappropriate') },
  ];

  const inits = post.author.name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const openSheet = () => { tapLight(); setSheetVisible(true); };

  return (
    <View style={styles.card}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <TouchableOpacity
          onPress={onAuthorPress}
          style={styles.authorLeft}
          activeOpacity={0.75}
          onLongPress={openSheet}
          delayLongPress={400}
        >
          <MsAvatar
            size={38}
            initials={inits}
            imageUri={post.author.avatarUrl ?? undefined}
          />
          <View style={styles.authorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {post.author.name}
              </Text>
              {post.author.isVerified && (
                <SealCheck size={14} color={T.TEXT} weight="fill" />
              )}
            </View>
            <Text style={styles.authorMeta}>
              @{post.author.username} · {formatTime(post.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.authorRight}>
          {/* Tier badge — always shown (Free=bronze, Normal=blue, Premium=gold, VIP=purple) */}
          {(() => {
            const tier = post.tier ?? 'free';
            const def = TIERS[tier];
            const Icon = tier === 'free' ? LockOpen : tier === 'normal' ? Lock : tier === 'vip' ? Diamond : Crown;
            return (
              <View style={[styles.tierBadge, { backgroundColor: def.bg }]}>
                <Icon size={10} color={def.color} weight="fill" />
                <Text style={[styles.tierText, { color: def.color }]}>{def.label.toUpperCase()}</Text>
              </View>
            );
          })()}
          <TouchableOpacity
            style={styles.moreBtn}
            activeOpacity={0.7}
            onPress={openSheet}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <DotsThree size={18} color={T.TEXT_2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption
          feedMode (doubleTapToOpen): double-tap navigates, single tap = nothing.
          Other screens: single tap navigates (original behaviour).
      */}
      {!!post.caption && (
        doubleTapToOpen ? (
          <ScalePressable
            onPress={undefined}
            onDoubleTap={onPress}
            onLongPress={openSheet}
            style={styles.captionPressable}
          >
            <Text style={styles.caption} numberOfLines={3}>
              {post.caption}
            </Text>
          </ScalePressable>
        ) : (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            onLongPress={openSheet}
            delayLongPress={400}
          >
            <Text style={styles.caption} numberOfLines={3}>
              {post.caption}
            </Text>
          </TouchableOpacity>
        )
      )}

      {/* Media — image
          feedMode: single tap = nothing, double-tap = open Full View.
          Other screens: single tap = open Full View, double-tap = like.
      */}
      {post.mediaUrl && post.mediaType === 'image' && (
        <ScalePressable
          onPress={doubleTapToOpen ? undefined : (onMediaPress ?? onPress)}
          onLongPress={openSheet}
          onDoubleTap={doubleTapToOpen ? (onMediaPress ?? onPress) : handleLike}
        >
          <MsPremiumContent
            uri={post.mediaUrl}
            mediaType="image"
            locked={Boolean(post.isLocked)}
            unlocked={!post.isLocked}
            price={post.priceCredits ?? 0}
            aspectRatio={post.width && post.height ? post.width / post.height : 1}
            borderRadius={T.RADIUS.xl}
            onUnlock={onMediaPress ?? onPress}
            style={styles.media}
          />
        </ScalePressable>
      )}

      {/* Media — video
          Feed preview mode: auto-playing muted 3-second loop.
          No play button is shown in feeds. Tapping anywhere on the card opens
          the dedicated Video Post page — the feed is never the primary player.
          Long-press opens the action sheet for save/share/report.
      */}
      {post.mediaUrl && post.mediaType === 'video' && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={onMediaPress ?? onPress}
          onLongPress={openSheet}
          delayLongPress={400}
        >
          <MsPremiumContent
            uri={post.mediaUrl}
            posterUri={post.thumbnailUrl}
            mediaType="video"
            locked={Boolean(post.isLocked)}
            unlocked={!post.isLocked}
            price={post.priceCredits ?? 0}
            aspectRatio={post.width && post.height ? post.width / post.height : 16 / 9}
            borderRadius={T.RADIUS.xl}
            onUnlock={onMediaPress ?? onPress}
            onPlayPress={onMediaPress ?? onPress}
            previewMode
            active={videoPreviewActive}
            style={styles.videoPlaceholder}
          />
        </TouchableOpacity>
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
        <ActionButton onPress={onPress} style={styles.actionBtn}>
          <ChatCircle size={18} color={T.TEXT_2} />
          {post.commentCount > 0 && (
            <Text style={styles.actionCount}>{formatCount(post.commentCount)}</Text>
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
        title={isOwn ? 'Your Post' : post.author.name}
        subtitle={isOwn ? undefined : `@${post.author.username}`}
        actions={isOwn ? ownActions : guestActions}
        onClose={() => setSheetVisible(false)}
      />
      <MsShareSheet
        visible={shareVisible}
        contentType="post"
        contentId={post.id}
        title={post.caption || 'MeetSweet post'}
        onClose={() => setShareVisible(false)}
      />
    </View>
  );
}

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
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: T.RADIUS.xs,
  },
  tierText: {
    fontSize: 8,
    fontFamily: T.FONT.bold,
    letterSpacing: 0.5,
  },
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
  caption: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },

  media: { width: '100%', aspectRatio: 1, backgroundColor: T.SURFACE },

  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: T.RADIUS.sm,
  },
  actionCount: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  actionCountLiked: { color: '#EF4444' },

  cardSpacing: { height: 6 },
});
