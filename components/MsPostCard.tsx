import React, { useState } from 'react';
import {
  Alert,
  Image,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, ChatCircle, Bookmark, DotsThree, SealCheck, Play, Share as ShareIcon } from 'phosphor-react-native';
import { T, AppGradients } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import type { Post } from '@/services/posts';
import {
  likePost,
  unlikePost,
  bookmarkPost,
  unbookmarkPost,
  deletePost,
  reportPost,
} from '@/services/posts';

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

function ScalePressable({
  children,
  onPress,
  style,
  onLongPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: any;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[animStyle, style]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          scale.value = withTiming(0.96, { duration: 90, easing: Easing.out(Easing.cubic) });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        }}
        delayLongPress={400}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

interface MsPostCardProps {
  post: Post;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onDeleted?: (id: string) => void;
  currentUserId?: string;
}

export function MsPostCard({
  post,
  onPress,
  onAuthorPress,
  onDeleted,
  currentUserId,
}: MsPostCardProps) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liking, setLiking] = useState(false);
  const [bookmarked, setBookmarked] = useState(post.bookmarkedByMe ?? false);
  const [bookmarking, setBookmarking] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const heartScale = useSharedValue(1);

  const isOwn = Boolean(currentUserId && currentUserId === post.author.id);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));
    if (!wasLiked) {
      heartScale.value = withSpring(1.35, { damping: 10, stiffness: 300 }, () => {
        heartScale.value = withSpring(1, { damping: 14, stiffness: 260 });
      });
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
      setLikeCount((c) => (wasLiked ? c + 1 : Math.max(0, c - 1)));
    } finally {
      setLiking(false);
    }
  };

  const handleBookmark = async () => {
    if (bookmarking) return;
    setBookmarking(true);
    const was = bookmarked;
    setBookmarked(!was);
    try {
      if (was) await unbookmarkPost(post.id);
      else await bookmarkPost(post.id);
    } catch {
      setBookmarked(was);
    } finally {
      setBookmarking(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [reportConfirm, setReportConfirm] = useState(false);

  const doDelete = async () => {
    try {
      await deletePost(post.id);
      onDeleted?.(post.id);
    } catch {
      Alert.alert('Error', 'Could not delete post.');
    }
  };

  const doReport = () =>
    reportPost(post.id, 'inappropriate').catch(() => {});

  const doShare = () => {
    Share.share({
      message: post.caption ?? `Check out this post on MeetSweet!`,
      title: post.author.name,
    }).catch(() => {});
  };

  const ownActions: ActionItem[] = [
    { label: 'Share Post', onPress: doShare },
    { label: 'Edit Post', onPress: () => {} },
    { label: 'Archive Post', onPress: () => {} },
    { label: 'Delete Post', destructive: true, onPress: () => setDeleteConfirm(true) },
  ];

  const guestActions: ActionItem[] = [
    { label: bookmarked ? 'Remove Saved' : 'Save Post', onPress: () => handleBookmark() },
    { label: 'Share Post', onPress: doShare },
    { label: 'Copy Link', onPress: doShare },
    { label: 'Not Interested', onPress: () => {} },
    { label: 'Mute Creator', onPress: () => {} },
    { label: 'Report', destructive: true, onPress: () => setReportConfirm(true) },
  ];

  const inits = post.author.name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <View style={styles.card}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <TouchableOpacity
          onPress={onAuthorPress}
          style={styles.authorLeft}
          activeOpacity={0.75}
          onLongPress={() => setSheetVisible(true)}
          delayLongPress={400}
        >
          <MsAvatar
            size={40}
            initials={inits}
            imageUri={post.author.avatarUrl ?? undefined}
          />
          <View style={styles.authorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {post.author.name}
              </Text>
              {post.author.isVerified && (
                <SealCheck size={14} color={T.ROSE} weight="fill" />
              )}
            </View>
            <Text style={styles.authorMeta}>
              @{post.author.username} · {formatTime(post.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.authorRight}>
          {post.isPremium && (
            <LinearGradient
              colors={AppGradients.rosePurple}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.premiumBadge}
            >
              <Text style={styles.premiumText}>✦ PREMIUM</Text>
            </LinearGradient>
          )}
          <TouchableOpacity
            style={styles.moreBtn}
            activeOpacity={0.7}
            onPress={() => setSheetVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <DotsThree size={18} color={T.TEXT_2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption */}
      {!!post.caption && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPress}
          onLongPress={() => setSheetVisible(true)}
          delayLongPress={400}
        >
          <Text style={styles.caption} numberOfLines={3}>
            {post.caption}
          </Text>
        </TouchableOpacity>
      )}

      {/* Media — image */}
      {post.mediaUrl && post.mediaType === 'image' && (
        <ScalePressable onPress={onPress} onLongPress={() => setSheetVisible(true)}>
          <Image source={{ uri: post.mediaUrl }} style={styles.media} resizeMode="cover" />
        </ScalePressable>
      )}

      {/* Media — video */}
      {post.mediaUrl && post.mediaType === 'video' && (
        <ScalePressable onPress={onPress} onLongPress={() => setSheetVisible(true)}>
          <View style={styles.videoPlaceholder}>
            <LinearGradient
              colors={['rgba(14,11,18,0.2)', 'rgba(14,11,18,0.7)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.videoOverlay}>
              <View style={styles.playBtn}>
                <LinearGradient
                  colors={AppGradients.rosePurple}
                  style={styles.playGradient}
                >
                  <Play size={22} color={T.TEXT} weight="fill" />
                </LinearGradient>
              </View>
              {post.durationSecs != null && (
                <View style={styles.durationPill}>
                  <Text style={styles.duration}>
                    {Math.floor(post.durationSecs / 60)}:{String(post.durationSecs % 60).padStart(2, '0')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScalePressable>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {/* Like */}
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike} activeOpacity={0.7}>
          <Animated.View style={heartStyle}>
            <Heart
              size={19}
              color={liked ? T.ROSE : T.TEXT_2}
              weight={liked ? 'fill' : 'regular'}
            />
          </Animated.View>
          {likeCount > 0 && (
            <Text style={[styles.actionCount, liked && styles.actionCountLiked]}>
              {formatCount(likeCount)}
            </Text>
          )}
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
          <ChatCircle size={19} color={T.TEXT_2} />
          {post.commentCount > 0 && (
            <Text style={styles.actionCount}>{formatCount(post.commentCount)}</Text>
          )}
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity style={styles.actionBtn} onPress={doShare} activeOpacity={0.7}>
          <ShareIcon size={19} color={T.TEXT_2} />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Bookmark */}
        <TouchableOpacity style={styles.actionBtn} onPress={handleBookmark} activeOpacity={0.7}>
          <Bookmark
            size={19}
            color={bookmarked ? T.ROSE : T.TEXT_2}
            weight={bookmarked ? 'fill' : 'regular'}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <MsActionSheet
        visible={sheetVisible}
        title={isOwn ? 'Your Post' : post.author.name}
        subtitle={isOwn ? undefined : `@${post.author.username}`}
        actions={isOwn ? ownActions : guestActions}
        onClose={() => setSheetVisible(false)}
      />

      <MsConfirmDialog
        visible={deleteConfirm}
        title="Delete post?"
        message="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
        onCancel={() => setDeleteConfirm(false)}
      />

      <MsConfirmDialog
        visible={reportConfirm}
        title="Report this post?"
        message="We'll review it and take appropriate action."
        confirmLabel="Report"
        onConfirm={() => { doReport(); setReportConfirm(false); }}
        onCancel={() => setReportConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: T.BG },

  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  authorLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorName: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    flexShrink: 1,
  },
  authorMeta: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginTop: 2,
  },
  authorRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  premiumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  premiumText: {
    fontSize: 8,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: 0.6,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.BORDER,
  },

  caption: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    lineHeight: 22,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },

  media: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: T.SURFACE,
    marginBottom: 2,
  },

  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoOverlay: { alignItems: 'center', gap: 12 },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: T.ROSE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  playGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.full,
  },
  duration: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: T.RADIUS.sm,
  },
  actionCount: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  actionCountLiked: { color: T.ROSE },

  divider: { height: 1, backgroundColor: T.BORDER, marginTop: 2 },
});
