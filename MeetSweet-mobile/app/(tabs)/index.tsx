import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Compass, MagnifyingGlass } from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsCreatorCard } from '@/components/MsCreatorCard';
import { getCreators } from '@/services/creators';
import { MsWalletBadge } from '@/components/MsWalletBadge';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { MsPostSkeleton } from '@/components/MsSkeletonCard';
import { MsSectionHeader } from '@/components/MsSectionHeader';
import { MsPostCard } from '@/components/MsPostCard';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsSearchModal } from '@/components/MsSearchModal';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { useAuth } from '@/contexts/AuthContext';
import { usePostActions } from '@/contexts/PostActionsContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { getHomeFeed, likePost, unlikePost, bookmarkPost, unbookmarkPost, type Post } from '@/services/posts';
import {
  getCachedPosts,
  cachePosts,
  updateCachedPost,
  enqueueOfflineAction,
} from '@/lib/posts-db';
import { useNetwork, reportNetworkSuccess, reportNetworkError } from '@/hooks/useNetwork';

function greetingText(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Discovery empty state ────────────────────────────────────────────────────

function DiscoveryState() {
  const [recommendedCreators, setRecommendedCreators] = useState<import('@/components/MsCreatorCard').MsCreatorCardData[]>([]);

  useEffect(() => {
    getCreators().then((list) => {
      const top20 = (list || []).slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name || c.username || 'Creator',
        handle: c.username ? `@${c.username}` : '@creator',
        bio: c.bio || undefined,
        category: c.category ?? undefined,
        subscriberCount: c.subscriberCount ? `${c.subscriberCount}` : undefined,
        subscriptionPrice: c.subscriptionPrice,
        isOnline: c.isOnline,
        isVerified: c.isVerified,
        avatarUrl: c.avatarUrl,
      }));
      setRecommendedCreators(top20);
    }).catch(() => {});
  }, []);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={discoveryStyles.container}
    >
      <View style={discoveryStyles.hero}>
        <View style={discoveryStyles.heroIcon}>
          <Compass size={36} color={T.ACCENT} weight="duotone" />
        </View>
        <Text style={discoveryStyles.heroTitle}>Discover creators to subscribe to</Text>
        <Text style={discoveryStyles.heroSubtitle}>
          Your feed shows posts from creators you're subscribed to.
          Subscribe to a creator to see their latest content here.
        </Text>
      </View>

      {/* Top 20 Recommended Creators */}
      {recommendedCreators.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 16, fontFamily: T.FONT.semibold, color: T.TEXT, letterSpacing: -0.2 }}>
            Top Creators for You
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {recommendedCreators.map((c) => (
              <MsCreatorCard
                key={c.id}
                creator={c}
                variant="featured"
                onPress={() => router.push(`/creator/${c.id}`)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <TouchableOpacity
        style={discoveryStyles.exploreBtn}
        activeOpacity={0.85}
        onPress={() => router.push('/(tabs)/explore')}
      >
        <Compass size={18} color={T.BG} />
        <Text style={discoveryStyles.exploreBtnLabel}>Explore All Creators</Text>
      </TouchableOpacity>
      <View style={discoveryStyles.howCard}>
        <Text style={discoveryStyles.howTitle}>How the Posts feed works</Text>
        <View style={discoveryStyles.howRow}>
          <View style={discoveryStyles.howStep}><Text style={discoveryStyles.howNum}>1</Text></View>
          <Text style={discoveryStyles.howText}>Browse creators to find content you love</Text>
        </View>
        <View style={discoveryStyles.howRow}>
          <View style={discoveryStyles.howStep}><Text style={discoveryStyles.howNum}>2</Text></View>
          <Text style={discoveryStyles.howText}>Subscribe to a creator to unlock their content</Text>
        </View>
        <View style={discoveryStyles.howRow}>
          <View style={discoveryStyles.howStep}><Text style={discoveryStyles.howNum}>3</Text></View>
          <Text style={discoveryStyles.howText}>Their posts appear here as soon as they're published</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const discoveryStyles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 20 },
  hero: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4, ...T.SHADOWS.soft,
  },
  heroTitle: { fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.4, textAlign: 'center' },
  heroSubtitle: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  exploreBtn: {
    height: 50, borderRadius: T.RADIUS.pill, backgroundColor: T.ACCENT,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, ...T.SHADOWS.medium,
  },
  exploreBtnLabel: { fontFamily: T.FONT.semibold, fontSize: 15, color: T.BG },
  howCard: { backgroundColor: T.SURFACE, borderRadius: T.RADIUS.xl, padding: 18, gap: 14, ...T.SHADOWS.soft },
  howTitle: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT, letterSpacing: -0.1, marginBottom: 2 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howStep: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.ACCENT_LIGHT, alignItems: 'center', justifyContent: 'center' },
  howNum: { fontSize: 13, fontFamily: T.FONT.bold, color: T.ACCENT },
  howText: { flex: 1, fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, lineHeight: 19 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const { deletedIds } = usePostActions();
  const { notifUnread } = useNotifications();

  const userId = user?.id ?? '';

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  // ── Video preview viewability ──────────────────────────────────────────────
  const [visiblePostIds, setVisiblePostIds] = useState<ReadonlySet<string>>(() => new Set());
  const feedViewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 150 }).current;
  const onFeedViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ key: string }> }) => {
    setVisiblePostIds(new Set(viewableItems.map((v) => v.key)));
  }).current;

  /** Deduplicate any posts array by id — guards against API returning the same post twice. */
  const dedupPosts = useCallback((items: Post[]): Post[] => {
    const seen = new Set<string>();
    return items.filter((p) => (seen.has(p.id) ? false : !!seen.add(p.id)));
  }, []);

  // ── Initial load: cached → API ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      // 1. Show cached posts immediately (user-scoped)
      const cached = await getCachedPosts('feed', userId, 20);
      if (cached.length > 0 && !cancelled) {
        setPosts(dedupPosts(cached));
        setLoading(false);
      }

      // 2. Refresh from API in background
      try {
        const data: any = await getHomeFeed();
        const fetchedPosts: Post[] = Array.isArray(data) ? data : (data?.posts ?? []);
        if (!cancelled) {
          reportNetworkSuccess();
          setPosts(dedupPosts(fetchedPosts));
          setCursor(data?.nextCursor ?? null);
          setHasMore(data?.hasMore ?? (fetchedPosts.length > 0));
          setError(false);
          cachePosts(fetchedPosts, 'feed', userId).catch(() => {});
        }
      } catch {
        if (!cancelled) {
          reportNetworkError();
          if (cached.length === 0) setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const loadFeed = useCallback(async (reset = false) => {
    try {
      // Cursor-based pagination: first page (or refresh) has no cursor; every
      // subsequent page passes the previous page's nextCursor so the backend
      // returns the NEXT slice instead of repeating page 1.
      const data: any = await getHomeFeed(1, reset ? null : cursor);
      const fetchedPosts: Post[] = Array.isArray(data) ? data : (data?.posts ?? []);
      reportNetworkSuccess();
      if (reset) {
        setPosts(dedupPosts(fetchedPosts));
        cachePosts(fetchedPosts, 'feed', userId).catch(() => {});
      } else {
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...fetchedPosts.filter((p) => !seen.has(p.id))];
        });
        cachePosts(fetchedPosts, 'feed', userId).catch(() => {});
      }
      setCursor(data?.nextCursor ?? null);
      setHasMore(data?.hasMore ?? (fetchedPosts.length > 0));
      setError(false);
    } catch {
      reportNetworkError();
      if (posts.length === 0) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [cursor, userId, posts.length, dedupPosts]);

  const handleRefresh = () => { setRefreshing(true); loadFeed(true); };
  const handleLoadMore = () => {
    if (!loadingMore && hasMore && !loading) { setLoadingMore(true); loadFeed(); }
  };

  // ── Optimistic like — offline-queue aware ──────────────────────────────────
  const handleLike = useCallback(async (post: Post) => {
    const wasLiked = post.likedByMe;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;

    // Optimistic update
    setPosts((prev) => prev.map((p) =>
      p.id === post.id ? { ...p, likedByMe: nextLiked, likeCount: Math.max(0, p.likeCount + delta) } : p,
    ));
    updateCachedPost(post.id, userId, {
      likedByMe: nextLiked,
      likeCount: Math.max(0, post.likeCount + delta),
    }).catch(() => {});

    if (!isOnline) {
      // Queue for later — already reflected in UI/cache optimistically
      enqueueOfflineAction({ type: 'like_post', postId: post.id, liked: nextLiked }, userId).catch(() => {});
      return;
    }

    try {
      if (nextLiked) await likePost(post.id);
      else await unlikePost(post.id);
    } catch {
      // Revert on API failure
      setPosts((prev) => prev.map((p) =>
        p.id === post.id ? { ...p, likedByMe: wasLiked, likeCount: Math.max(0, p.likeCount - delta) } : p,
      ));
      updateCachedPost(post.id, userId, {
        likedByMe: wasLiked,
        likeCount: Math.max(0, post.likeCount - delta),
      }).catch(() => {});
    }
  }, [isOnline, userId]);

  // ── Optimistic bookmark — offline-queue aware ──────────────────────────────
  const handleBookmark = useCallback(async (post: Post) => {
    const wasSaved = post.bookmarkedByMe;
    const nextSaved = !wasSaved;
    const delta = nextSaved ? 1 : -1;

    setPosts((prev) => prev.map((p) =>
      p.id === post.id ? { ...p, bookmarkedByMe: nextSaved, bookmarkCount: Math.max(0, (p.bookmarkCount ?? 0) + delta) } : p,
    ));
    updateCachedPost(post.id, userId, {
      bookmarkedByMe: nextSaved,
      bookmarkCount: Math.max(0, (post.bookmarkCount ?? 0) + delta),
    }).catch(() => {});

    if (!isOnline) {
      enqueueOfflineAction({ type: 'save_post', postId: post.id, saved: nextSaved }, userId).catch(() => {});
      return;
    }

    try {
      if (nextSaved) await bookmarkPost(post.id);
      else await unbookmarkPost(post.id);
    } catch {
      setPosts((prev) => prev.map((p) =>
        p.id === post.id ? { ...p, bookmarkedByMe: wasSaved, bookmarkCount: Math.max(0, (p.bookmarkCount ?? 0) - delta) } : p,
      ));
      updateCachedPost(post.id, userId, {
        bookmarkedByMe: wasSaved,
        bookmarkCount: Math.max(0, (post.bookmarkCount ?? 0) - delta),
      }).catch(() => {});
    }
  }, [isOnline, userId]);

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
    : 'U';
  const walletBalance = useWalletBalance();

  return (
    <MsAmbientBackground style={[styles.bg, { paddingTop: insets.top }]}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <Text style={styles.topAppName}>MeetSweet</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.topActions}>
          <MsWalletBadge balance={walletBalance.balance} />
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => router.push('/notifications')}>
            <View style={{ position: 'relative' }}>
              <Bell size={20} color={T.TEXT} />
              {notifUnread > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{notifUnread > 9 ? '9+' : notifUnread}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => setSearchVisible(true)}>
            <MagnifyingGlass size={20} color={T.TEXT} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.75} onPress={() => router.push('/(tabs)/profile')}>
            <MsAvatar size={34} initials={initials} imageUri={user?.avatarUrl ?? undefined} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Feed ── */}
      {loading && posts.length === 0 ? (
        <View style={styles.skeletons}>
          {[1, 2, 3].map((id) => <MsPostSkeleton key={id} />)}
        </View>
      ) : error && posts.length === 0 ? (
        <MsEmptyState
          title="Feed unavailable"
          message="Couldn't load posts. Pull down to try again."
          actionLabel="Retry"
          onAction={handleRefresh}
        />
      ) : posts.length === 0 ? (
        <DiscoveryState />
      ) : (
        <FlatList
          data={posts.filter((p) => !deletedIds.includes(p.id))}
          keyExtractor={(item) => item.id}
          viewabilityConfig={feedViewabilityConfig}
          onViewableItemsChanged={onFeedViewableItemsChanged}
          renderItem={({ item }) => (
            <MsPostCard
              post={item}
              tier={item.tier as import('@/constants/tiers').ContentTier | undefined}
              videoPreviewActive={visiblePostIds.has(item.id)}
              onPress={() => {
                if (item.contentType === 'short') {
                  // Shorts only live in the Shorts player — shouldn't reach here after
                  // home feed filtering, but guard just in case
                  router.push({ pathname: '/shorts', params: { startId: item.id } });
                } else if (item.contentType === 'video') {
                  router.push(`/videos/${item.id}`);
                } else if (item.contentType === 'album') {
                  router.push(`/album/${item.id}`);
                } else {
                  router.push(`/post/${item.id}`);
                }
              }}
              onMediaPress={() => {
                if (item.contentType === 'short') {
                  router.push({ pathname: '/shorts', params: { startId: item.id } });
                } else if (item.mediaType === 'video') {
                  router.push(`/videos/${item.id}`);
                } else if (item.mediaUrl) {
                  router.push({
                    pathname: '/post-media',
                    params: {
                      uri: item.mediaUrl,
                      type: 'image',
                      postId: item.id,
                      aspectRatio: item.width && item.height ? String(item.width / item.height) : '',
                    },
                  });
                } else {
                  router.push(`/post/${item.id}`);
                }
              }}
              currentUserId={user?.id}
              onAuthorPress={() => router.push(`/creator/${item.author.id || item.author.username}`)}
              onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.TEXT} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={<MsSectionHeader title="Home Feed" />}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                {[1, 2].map((id) => <MsPostSkeleton key={id} />)}
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* ── Search modal ── */}
      <MsSearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} />
    </MsAmbientBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
  topAppName: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 20, letterSpacing: -0.5 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center',
  },
  skeletons: { flex: 1 },
  footer: {},
  bellBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: T.BG,
  },
  bellBadgeText: {
    fontSize: 8,
    fontFamily: T.FONT.bold,
    color: '#FFFFFF',
    lineHeight: 11,
  },
});
