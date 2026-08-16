import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowUp, ArrowLeft, ChatCircle, SealCheck, Heart, ShareNetwork, Users } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsAvatar } from '@/components/MsAvatar';
import { CommentsModal } from '@/components/MsCommentsSheet';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsShareSheet } from '@/components/MsShareSheet';
import { MsShortsPlayer } from '@/components/MsShortsPlayer';
import { PressScale } from '@/components/motion/PressScale';
import { FlyingHeart, useHeartBurst } from '@/components/motion/FlyingHeart';
import { getShortsFeed, likeContent, trackShortView, type Short } from '@/services/content';
import { getCachedPosts, cachePosts } from '@/lib/posts-db';
import { reportNetworkSuccess, reportNetworkError } from '@/hooks/useNetwork';
import { useAuth } from '@/contexts/AuthContext';
import { T } from '@/constants/theme';
import { MOTION } from '@/constants/motion';
import type { Post } from '@/services/posts';
import { shouldShowOnboarding, completeOnboarding } from '@/services/onboarding';
import { MsOnboardingModal, type OnboardingScreen } from '@/components/MsOnboardingModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');


/** Map a cached Post (from posts-db) into the Short shape content.ts expects */
function postToShort(post: Post): Short {
  return {
    id: post.id,
    caption: post.caption ?? '',
    videoUrl: post.mediaUrl ?? '',
    thumbnailUrl: post.thumbnailUrl ?? null,
    durationSecs: post.durationSecs ?? 0,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    shareCount: 0,
    viewCount: 0,
    likedByMe: post.likedByMe,
    isLocked: false,
    previewDuration: null,
    createdAt: post.createdAt,
    creator: {
      id: post.author.id,
      name: post.author.name,
      username: post.author.username,
      avatarUrl: post.author.avatarUrl ?? null,
      isVerified: post.author.isVerified ?? false,
    },
  };
}

function profileRoute(
  currentUser: { id?: string; username?: string } | null,
  creator: { id: string; username: string },
) {
  const isSelf =
    currentUser?.id === creator.id ||
    (!!currentUser?.username && currentUser.username === creator.username);
  return isSelf ? '/(tabs)/profile' : `/creator/${creator.id}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShortsScreen() {
  const insets = useSafeAreaInsets();
  const { startId } = useLocalSearchParams<{ startId?: string }>();
  const { user } = useAuth();
  const listRef = useRef<FlatList>(null);

  const [shorts, setShorts]     = useState<Short[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [commentsId, setCommentsId] = useState<string | null>(null);
  const [shareId, setShareId]   = useState<string | null>(null);
  const [pageHeight, setPageHeight] = useState(SCREEN_HEIGHT);
  const viewConfig = useRef({ itemVisiblePercentThreshold: 75 });

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check for shorts onboarding on mount
  useEffect(() => {
    shouldShowOnboarding('shorts_onboarded').then((shouldShow) => {
      if (shouldShow) setShowOnboarding(true);
    });
  }, []);

  const handleOnboardingComplete = async () => {
    await completeOnboarding('shorts_onboarded');
    setShowOnboarding(false);
  };

  // Shorts onboarding screens
  const SHORTS_ONBOARDING: OnboardingScreen[] = [
    {
      title: 'Welcome to Shorts',
      subtitle: 'Watch and create short-form videos from your favorite creators.',
      icon: 'video',
      buttonLabel: 'Next',
      imageSource: require('../../assets/onboarding/shorts-welcome.jpg'),
    },
    {
      title: 'Swipe to Navigate',
      subtitle: 'Swipe up for the next short. Swipe down to go back.',
      icon: 'globe',
      buttonLabel: 'Next',
      imageSource: require('../../assets/onboarding/shorts-swipe.jpg'),
    },
    {
      title: 'Double Tap to Like',
      subtitle: 'Double tap anywhere on the video to like it. Tap the heart icon anytime.',
      icon: 'star',
      buttonLabel: 'Start Watching',
      imageSource: require('../../assets/onboarding/shorts-like.jpg'),
    },
  ];

  const load = useCallback(async () => {
    setLoading(true);

    // 1. Load cached shorts for instant display
    const cached = await getCachedPosts('shorts', user?.id ?? 'guest', 10);
    if (cached.length > 0) {
      setShorts(cached.map(postToShort));
      setLoading(false);
    }

    // 2. Fetch from API
    try {
      const page = await getShortsFeed();
      setShorts(page.items);
      setError(false);
      reportNetworkSuccess();
      // Cache: convert Short → Post-like shape for storage
      const postsToCache: Post[] = page.items.map((s) => ({
        id: s.id,
        caption: s.caption ?? '',
        visibility: 'public' as const,  // shorts are always public/free
        contentType: 'short' as const,
        mediaUrl: s.videoUrl ?? undefined,
        mediaType: 'video' as const,
        thumbnailUrl: s.thumbnailUrl ?? undefined,
        durationSecs: s.durationSecs ?? null,
        fileSize: null,
        width: null,
        height: null,
        likeCount: s.likeCount,
        likes_count: s.likeCount,
        commentCount: s.commentCount,
        comments_count: s.commentCount,
        bookmarkCount: 0,
        isLocked: false,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        author: {
          id: s.creator.id,
          name: s.creator.name,
          username: s.creator.username,
          avatarUrl: s.creator.avatarUrl,
          isVerified: s.creator.isVerified,
          isCreator: true,
        },
        likedByMe: s.likedByMe,
        is_liked: s.likedByMe,
        bookmarkedByMe: false,
        is_bookmarked: false,
      }));
      cachePosts(postsToCache, 'shorts', user?.id ?? 'guest').catch(() => {});
    } catch {
      reportNetworkError();
      if (shorts.length === 0) setError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Scroll to startId once list is loaded
  useEffect(() => {
    if (!startId || !shorts.length) return;
    const idx = shorts.findIndex((s) => s.id === startId);
    if (idx > 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
        setActiveIndex(idx);
      }, 100);
    }
  }, [startId, shorts]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const index = viewableItems[0]?.index;
    if (typeof index === 'number') setActiveIndex(index);
  }).current;

  if (loading && shorts.length === 0) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <ActivityIndicator color={T.TEXT} size="large" />
      <Text style={styles.loadingText}>Loading Shorts</Text>
    </View>
  );
  if (error && shorts.length === 0) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <MsEmptyState title="Shorts unavailable" message="The Shorts service could not be reached." actionLabel="Try again" onAction={load} />
    </View>
  );
  if (!shorts.length) return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <MsEmptyState title="No Shorts yet" message="Short-form videos from creators will appear here." actionLabel="Back to Explore" onAction={() => router.replace('/(tabs)/explore')} />
    </View>
  );

  return (
    <View
      style={styles.screen}
      onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
    >
      <FlatList
        ref={listRef}
        data={shorts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ShortPage
            item={item}
            active={index === activeIndex}
            prebuffer={Math.abs(index - activeIndex) === 1}
            topInset={insets.top}
            bottomInset={insets.bottom}
            pageHeight={pageHeight}
            currentUser={user}
            isFirst={index === 0}
            isLast={index === shorts.length - 1}
            onComment={() => setCommentsId(item.id)}
            onShare={() => setShareId(item.id)}
            onViewProgress={(seconds) => { if (seconds > 0) trackShortView(item.id, seconds).catch(() => {}); }}
          />
        )}
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={pageHeight}
        snapToAlignment="start"
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewConfig.current}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        removeClippedSubviews
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        bounces
        overScrollMode="always"
      />
      {commentsId ? (
        <CommentsModal
          visible
          onClose={() => setCommentsId(null)}
          postId={commentsId}
        />
      ) : null}
      {shareId ? (
        <MsShareSheet
          visible
          contentType="short"
          contentId={shareId}
          title="Share Short"
          onClose={() => setShareId(null)}
        />
      ) : null}

      {/* Shorts onboarding modal */}
      <MsOnboardingModal
        visible={showOnboarding}
        screens={SHORTS_ONBOARDING}
        onComplete={handleOnboardingComplete}
      />
    </View>
  );
}

// ─── Individual Short page ────────────────────────────────────────────────────

function ShortPage({
  item,
  active,
  prebuffer = false,
  topInset,
  bottomInset,
  pageHeight,
  currentUser,
  isFirst,
  isLast,
  onComment,
  onShare,
  onViewProgress,
}: {
  item: Short;
  active: boolean;
  prebuffer?: boolean;
  topInset: number;
  bottomInset: number;
  pageHeight: number;
  currentUser: { id: string; username: string } | null;
  isFirst: boolean;
  isLast: boolean;
  onComment: () => void;
  onShare: () => void;
  onViewProgress: (seconds: number) => void;
}) {
  const [liked,     setLiked]     = useState(item.likedByMe);
  const [likeCount, setLikeCount] = useState(item.likeCount);

  const { hearts, spawnHeart } = useHeartBurst();
  const likeScale = useSharedValue(1);
  const likeStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));
  const likeBtnRef = useRef<View>(null);

  // Double-tap detection for like gesture
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));

    if (next) {
      likeScale.value = withSequence(
        withSpring(1.18, { damping: 5, stiffness: 340 }),
        withSpring(1.0,  { damping: 10, stiffness: 220 }),
      );
      const cx = SCREEN_WIDTH / 2;
      const cy = SCREEN_HEIGHT * 0.45;
      spawnHeart(cx - 10, cy);
      spawnHeart(cx + 10, cy - 14);
    } else {
      likeScale.value = withSequence(
        withTiming(0.82, { duration: MOTION.PRESS_DOWN, easing: MOTION.EASE_EXIT }),
        withTiming(1.0,  { duration: MOTION.PRESS_UP,   easing: MOTION.EASE_ENTER }),
      );
    }

    try {
      const result = await likeContent('short', item.id, liked);
      setLikeCount(result.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount(item.likeCount);
    }
  };

  const handleVideoAreaTap = useCallback((evt: { nativeEvent: { locationX: number; locationY: number } }) => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      if (tapCountRef.current >= 2 && !liked) {
        // Double-tap = like
        void toggleLike();
      }
      tapCountRef.current = 0;
    }, 250);
  }, [liked, toggleLike]);

  return (
    <View style={[styles.page, { height: pageHeight }]}>
      {hearts.map(h => <FlyingHeart key={h.id} x={h.x} y={h.y} />)}

      <Pressable style={styles.videoTapZone} onPress={handleVideoAreaTap}>
        <MsShortsPlayer
          item={item}
          active={active}
          prebuffer={prebuffer}
          pageHeight={pageHeight}
          onViewProgress={onViewProgress}
        />
      </Pressable>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topInset + 12 }]}>
        <PressScale style={styles.topButton} onPress={() => router.back()} accessibilityLabel="Close Shorts">
          <ArrowLeft size={21} color="#fff" />
        </PressScale>
        <View style={styles.topTitle}>
          <Text style={styles.topEyebrow}>MEETSWEET</Text>
          <Text style={styles.topText}>Shorts</Text>
        </View>
        <View style={{ minWidth: 40 }} />
      </View>

      {/* Bottom scrim — keeps captions & actions legible over bright video */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.62)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Bottom content */}
      <View style={styles.content}>
        <Pressable
          style={styles.creatorLine}
          onPress={() => router.push(profileRoute(currentUser, item.creator) as any)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.creator.name}'s profile`}
        >
          <MsAvatar size={38} initials={item.creator.name.slice(0, 2).toUpperCase()} imageUri={item.creator.avatarUrl ?? undefined} />
          <Text style={styles.creatorName}>{item.creator.name}</Text>
          {item.creator.isVerified ? <SealCheck size={15} color="#fff" weight="fill" /> : null}
          <PressScale style={styles.subscribe} onPress={() => router.push(profileRoute(currentUser, item.creator) as any)}>
            <Users size={12} color={T.BG} />
            <Text style={styles.subscribeText}>Subscribe</Text>
          </PressScale>
        </Pressable>
        {item.caption ? <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text> : null}
        <Text style={styles.views}>{formatCount(item.viewCount)} views</Text>
        
        {/* Swipe up indicator - TikTok style */}
        {!isLast && (
          <View style={styles.swipeIndicator}>
            <ArrowUp size={16} color="rgba(255,255,255,0.7)" weight="bold" />
            <Text style={styles.swipeText}>Swipe up for more</Text>
          </View>
        )}
      </View>

      {/* Side actions */}
      <View style={[styles.actions, { paddingBottom: bottomInset + 20 }]}>
        <View style={styles.actionButton} ref={likeBtnRef} collapsable={false}>
          <PressScale style={styles.actionCircleWrap} onPress={toggleLike} hitSlop={8} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
            <Animated.View style={[styles.actionCircle, liked && styles.actionCircleActive, likeStyle]}>
              <Heart size={20} color="#fff" weight={liked ? 'fill' : 'regular'} />
            </Animated.View>
          </PressScale>
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </View>

        <PressScale style={styles.actionButton} onPress={onComment} hitSlop={8} accessibilityLabel="Comment">
          <View style={styles.actionCircle}>
            <ChatCircle size={20} color="#fff" />
          </View>
          <Text style={styles.actionCount}>{formatCount(item.commentCount)}</Text>
        </PressScale>

        <PressScale style={styles.actionButton} onPress={onShare} hitSlop={8} accessibilityLabel="Share">
          <View style={styles.actionCircle}>
            <ShareNetwork size={20} color="#fff" />
          </View>
          <Text style={styles.actionCount}>{formatCount(item.shareCount)}</Text>
        </PressScale>
      </View>

    </View>
  );
}

function formatCount(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K`
    : String(value);
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  page: { width: SCREEN_WIDTH, backgroundColor: '#050506' },
  videoTapZone: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13, marginTop: 14 },
  bottomScrim: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: 230,
  },
  topBar: {
    position: 'absolute', left: 16, right: 16, top: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topButton: {
    minWidth: 40, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
  },
  topTitle: { alignItems: 'center' },
  topEyebrow: { color: 'rgba(255,255,255,0.62)', fontFamily: T.FONT.semibold, fontSize: 8, letterSpacing: 1.3 },
  topText: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 15, marginTop: 1 },
  content: { position: 'absolute', left: 18, right: 78, bottom: 36, gap: 9 },
  creatorLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creatorName: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 14 },
  subscribe: {
    marginLeft: 4, flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: T.RADIUS.full, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 7,
  },
  subscribeText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 10 },
  caption: { color: '#fff', fontFamily: T.FONT.regular, fontSize: 14, lineHeight: 21 },
  views: { color: 'rgba(255,255,255,0.68)', fontFamily: T.FONT.medium, fontSize: 11 },
  swipeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  swipeText: { color: 'rgba(255,255,255,0.7)', fontFamily: T.FONT.medium, fontSize: 10 },
  actions: { position: 'absolute', right: 14, bottom: 0, alignItems: 'center', gap: 18 },
  actionButton: { alignItems: 'center', gap: 4 },
  actionCircleWrap: { alignItems: 'center', justifyContent: 'center' },
  actionCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center',
  },
  actionCircleActive: { backgroundColor: T.ACCENT },
  actionCount: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 10 },
});
