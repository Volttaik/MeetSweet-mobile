/**
 * Video Detail Screen — full-screen long-form video experience.
 *
 * The video is the primary element (fills the entire screen).
 * Creator info, back button, and all actions are overlaid on the player.
 * No ScrollView — nothing sits below the video.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
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
      {/* ── Full-screen player — actions embedded in player top bar ──────── */}
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
        // Action buttons in top bar
        onLike={toggleLike}
        isLiked={liked}
        likeCount={likeCount}
        onCommentsPress={() => setCommentsVisible(true)}
        commentCount={post.commentCount}
        onSave={toggleBookmark}
        isSaved={bookmarked}
        onShare={() => setShareVisible(true)}
        // Creator info at bottom
        creator={{
          avatarUrl: post.author.avatarUrl,
          name: post.author.name || post.author.username,
          username: post.author.username,
          onSubscribePress: () => router.push(`/creator/${post.author.id}`),
        }}
      />

      {/* Comments bottom sheet — opened when onCommentsPress fires */}
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
});
