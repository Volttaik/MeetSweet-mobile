/**
 * Video Detail Screen — full-screen long-form video experience.
 *
 * The video is the primary element (fills the entire screen).
 * Creator info, back button and comments are all overlaid on the player.
 * No ScrollView — nothing sits below the video.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Bookmark,
  Heart,
  ShareNetwork,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsLongFormPlayer } from '@/components/MsLongFormPlayer';
import { MsContentComments } from '@/components/MsContentComments';
import { MsPaymentSheet } from '@/components/MsPaymentSheet';
import { MsShareSheet } from '@/components/MsShareSheet';
import { getPost, likePost, unlikePost, bookmarkPost, type Post } from '@/services/posts';
import { T } from '@/constants/theme';

export default function VideoDetailScreen() {
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
      <View style={styles.center}>
        <ActivityIndicator color={T.TEXT_2} size="large" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <MsEmptyState
          title="Video unavailable"
          message="This video could not be loaded."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const videoMedia = post.mediaType === 'video' ? post.mediaUrl : null;

  return (
    <View style={styles.screen}>
      {/* ── Full-screen player — the primary element ───────────────────── */}
      <MsLongFormPlayer
        videoId={post.id}
        uri={videoMedia}
        posterUri={post.thumbnailUrl}
        isPremium={post.isPremium}
        autoPlay
        fillContainer
        initialAspectRatio={
          post.width && post.height ? post.width / post.height : 16 / 9
        }
        onPremiumRequired={() => setPremiumSheetVisible(true)}
        onBack={() => router.back()}
        onCommentsPress={() => setCommentsVisible(true)}
        commentCount={post.commentCount}
        creator={{
          avatarUrl: post.author.avatarUrl,
          name: post.author.name || post.author.username,
          username: post.author.username,
          onSubscribePress: () => router.push(`/creator/${post.author.id}`),
        }}
      />

      {/* ── Floating action bar (likes / bookmark / share) ────────────── */}
      <View
        style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}
        pointerEvents="box-none"
      >
        {/* Title snippet */}
        {!!post.caption && (
          <Text style={styles.titleSnippet} numberOfLines={1}>
            {post.caption}
          </Text>
        )}

        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={toggleLike} hitSlop={8}>
            <Heart
              size={20}
              color={liked ? '#EF4444' : 'rgba(255,255,255,0.75)'}
              weight={liked ? 'fill' : 'regular'}
            />
            {likeCount > 0 && (
              <Text style={[styles.actionText, liked && styles.actionLiked]}>
                {formatCount(likeCount)}
              </Text>
            )}
          </Pressable>

          <Pressable style={styles.action} onPress={toggleBookmark} hitSlop={8}>
            <Bookmark
              size={20}
              color={bookmarked ? T.ACCENT : 'rgba(255,255,255,0.75)'}
              weight={bookmarked ? 'fill' : 'regular'}
            />
          </Pressable>

          <Pressable style={styles.action} onPress={() => setShareVisible(true)} hitSlop={8}>
            <ShareNetwork size={20} color="rgba(255,255,255,0.75)" />
          </Pressable>
        </View>
      </View>

      {/* Comments bottom sheet */}
      <MsContentComments
        kind="video"
        contentId={post.id}
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        count={post.commentCount}
      />

      {/* Share sheet */}
      <MsShareSheet
        visible={shareVisible}
        contentType="video"
        contentId={post.id}
        title={post.caption || 'Video'}
        onClose={() => setShareVisible(false)}
      />

      {/* Premium paywall */}
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

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050506',
  },
  center: {
    flex: 1,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating action bar — overlaid above the player at the very bottom
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    // extra scrim so actions read against any video frame
    backgroundColor: 'rgba(0,0,0,0.0)',
  },
  titleSnippet: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: T.FONT.semibold,
    fontSize: 13,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: T.FONT.medium,
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  actionLiked: { color: '#EF4444' },
});
