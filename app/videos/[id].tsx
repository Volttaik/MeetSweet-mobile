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
import {
  ArrowLeft,
  Bookmark,
  ChatCircle,
  Heart,
  ShareNetwork,
  UserPlus,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsAvatar } from '@/components/MsAvatar';
import { MsContentComments } from '@/components/MsContentComments';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsLongFormPlayer } from '@/components/MsLongFormPlayer';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsPaymentSheet } from '@/components/MsPaymentSheet';
import { MsShareSheet } from '@/components/MsShareSheet';
import { getPost, likePost, unlikePost, bookmarkPost, type Post } from '@/services/posts';
import { getVideoRecommendations, type LongFormVideo } from '@/services/content';
import { T } from '@/constants/theme';

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<Post | null>(null);
  const [recommendations, setRecommendations] = useState<LongFormVideo[]>([]);
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
    Promise.all([getPost(id), getVideoRecommendations(id)])
      .then(([{ post: p }, recs]) => {
        setPost(p);
        setLiked(p.likedByMe);
        setBookmarked(p.bookmarkedByMe ?? false);
        setLikeCount(p.likeCount);
        setRecommendations(recs);
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
      if (next) await bookmarkPost(post.id);
      // Note: unbookmark not imported here; use bookmarkPost DELETE variant if needed
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
      <View style={styles.center}>
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
  const isPremium = post.isPremium;

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Video</Text>
        <Pressable style={styles.iconButton} onPress={() => setShareVisible(true)}>
          <ShareNetwork size={19} color={T.TEXT} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Video player */}
        <MsLongFormPlayer
          videoId={post.id}
          uri={videoMedia}
          posterUri={post.thumbnailUrl}
          isPremium={isPremium}
          previewDuration={post.isLocked ? 3 : undefined}
          onPremiumRequired={() => setPremiumSheetVisible(true)}
        />

        {/* Title & meta */}
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{post.caption || 'Untitled video'}</Text>
          <Text style={styles.meta}>
            {formatCount(post.likeCount)} likes · {timeAgo(post.createdAt)}
          </Text>
        </View>

        {/* Creator row */}
        <View style={styles.creatorRow}>
          <Pressable
            style={styles.creatorPress}
            onPress={() => router.push(`/creator/${post.author.id}`)}
          >
            <MsAvatar
              size={42}
              initials={(post.author.name || post.author.username).slice(0, 2).toUpperCase()}
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

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>More videos</Text>
            {recommendations.map((item) => (
              <Pressable
                key={item.id}
                style={styles.recommendation}
                onPress={() => router.push(`/videos/${item.id}`)}
              >
                <View style={styles.recThumb}>
                  {item.thumbnailUrl ? (
                    <MsMediaLoader
                      uri={item.thumbnailUrl}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                      accessibleLabel={item.title}
                      errorMessage=""
                      fallback={null}
                    />
                  ) : null}
                </View>
                <View style={styles.recCopy}>
                  <Text style={styles.recTitle} numberOfLines={2}>
                    {item.title || 'Untitled'}
                  </Text>
                  <Text style={styles.recMeta}>
                    {item.creator.name} · {formatCount(item.viewCount)} views
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Comments sheet */}
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

  titleWrap: { padding: 18, paddingBottom: 8 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 20, lineHeight: 28 },
  meta: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 6 },

  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
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
    paddingVertical: 12,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12 },

  sectionTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 16,
    padding: 18,
    paddingBottom: 10,
  },
  recommendation: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  recThumb: {
    width: 126,
    aspectRatio: 16 / 9,
    borderRadius: 9,
    backgroundColor: T.SURFACE_2,
    overflow: 'hidden',
  },
  recCopy: { flex: 1, paddingTop: 2 },
  recTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13, lineHeight: 18 },
  recMeta: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 10, marginTop: 5 },
});
