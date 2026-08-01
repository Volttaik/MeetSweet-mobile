/**
 * Post detail screen — handles both image and video posts.
 *
 * Fetches the real post from GET /api/posts/:id.
 * For video posts: renders the production video player (MsLongFormPlayer).
 * For image posts: renders the full-resolution image.
 * Shows creator info, likes, comments, and paywall for premium content.
 */
import React, { useEffect, useState } from 'react';
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
  Bookmark,
  ChatCircle,
  Heart,
  ShareNetwork,
  UserPlus,
} from 'phosphor-react-native';
import { getPost, likePost, unlikePost, bookmarkPost, type Post } from '@/services/posts';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsLongFormPlayer } from '@/components/MsLongFormPlayer';
import { CommentsModal } from '@/components/MsCommentsSheet';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsPaymentSheet } from '@/components/MsPaymentSheet';
import { MsEmptyState } from '@/components/MsEmptyState';
import { T } from '@/constants/theme';

export default function ContentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [premiumSheetVisible, setPremiumSheetVisible] = useState(false);

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
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleLike = async () => {
    if (!post) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((n) => Math.max(0, n + (nextLiked ? 1 : -1)));
    try {
      const result = nextLiked ? await likePost(post.id) : await unlikePost(post.id);
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
      await bookmarkPost(post.id);
    } catch {
      setBookmarked(!next);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={T.TEXT_2} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <MsEmptyState
          title="Content unavailable"
          message="This post could not be loaded."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const isVideo = post.mediaType === 'video';
  const isPremium = post.isPremium;

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>{isVideo ? 'Video' : 'Post'}</Text>
        <Pressable style={styles.iconButton} onPress={() => setShareVisible(true)}>
          <ShareNetwork size={19} color={T.TEXT} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Media */}
        {isVideo ? (
          <MsLongFormPlayer
            videoId={post.id}
            uri={post.mediaUrl}
            posterUri={post.thumbnailUrl}
            isPremium={isPremium}
            onPremiumRequired={() => setPremiumSheetVisible(true)}
          />
        ) : post.mediaUrl ? (
          <View style={styles.imageWrap}>
            <MsMediaLoader
              uri={post.mediaUrl}
              style={styles.image}
              resizeMode="cover"
              accessibleLabel={post.caption || 'Post image'}
              errorMessage="Could not load image"
            />
          </View>
        ) : null}

        {/* Caption */}
        {post.caption ? (
          <Text style={styles.caption}>{post.caption}</Text>
        ) : null}

        {/* Creator row */}
        <View style={styles.creatorRow}>
          <Pressable
            style={styles.creatorPress}
            onPress={() => router.push(`/creator/${post.author.id}`)}
          >
            <MsAvatar
              size={42}
              initials={(post.author.name || post.author.username || 'U').slice(0, 2).toUpperCase()}
              imageUri={post.author.avatarUrl ?? undefined}
            />
            <View style={styles.creatorCopy}>
              <Text style={styles.creatorName}>
                {post.author.name || post.author.username}
                {post.author.isVerified ? '  ✓' : ''}
              </Text>
              <Text style={styles.creatorHandle}>@{post.author.username}</Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.subscribe}
            onPress={() => router.push(`/creator/${post.author.id}`)}
          >
            <UserPlus size={14} color={T.BG} />
            <Text style={styles.subscribeText}>Subscribe</Text>
          </Pressable>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={toggleLike}>
            <Heart
              size={18}
              color={liked ? T.ACCENT : T.TEXT_2}
              weight={liked ? 'fill' : 'regular'}
            />
            <Text style={styles.actionText}>{formatCount(likeCount)}</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => setCommentsVisible(true)}>
            <ChatCircle size={18} color={T.TEXT_2} />
            <Text style={styles.actionText}>{formatCount(post.commentCount)}</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={toggleBookmark}>
            <Bookmark
              size={18}
              color={bookmarked ? T.ACCENT : T.TEXT_2}
              weight={bookmarked ? 'fill' : 'regular'}
            />
            <Text style={styles.actionText}>{bookmarked ? 'Saved' : 'Save'}</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => setShareVisible(true)}>
            <ShareNetwork size={18} color={T.TEXT_2} />
            <Text style={styles.actionText}>Share</Text>
          </Pressable>
        </View>

        {/* Meta */}
        <Text style={styles.metaText}>{timeAgo(post.createdAt)}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Sheets */}
      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        postId={post.id}
      />
      <MsShareSheet
        visible={shareVisible}
        contentType={isVideo ? 'video' : 'post'}
        contentId={post.id}
        title={post.caption || 'Post'}
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
    </MsAmbientBackground>
  );
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function timeAgo(value: string) {
  if (!value) return '';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : `${days}d ago`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    height: 62,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingBottom: 40 },

  imageWrap: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: T.RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
    aspectRatio: 4 / 5,
  },
  image: { width: '100%', height: '100%' },

  caption: {
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
  },

  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  creatorPress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  creatorCopy: { flex: 1 },
  creatorName: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13 },
  creatorHandle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 2 },
  subscribe: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    backgroundColor: T.TEXT,
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  subscribeText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 11 },

  actions: {
    flexDirection: 'row',
    gap: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12 },

  metaText: {
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
});
