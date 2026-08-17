import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import {
  Bell,
  Compass,
  Images,
  Lightning,
  MagnifyingGlass as SearchIcon,
  Users,
} from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import type { Creator } from '@/lib/api-client-react';
import {
  useExploreFeed,
  useLocalExploreCatalog,
  fmtTimeAgo,
} from '@/services/explore';
import { useLocalAlbumCatalog } from '@/services/albums';
import type { AlbumCardData } from '@/services/albums';
import { blockUser } from '@/services/users';
import { subscribe } from '@/services/subscriptions';
import { hideCreator } from '@/services/posts';
import { usePostActions } from '@/contexts/PostActionsContext';
import {
  MsCatalogSkeleton,
  MsCollectionCard,
  MsFeaturedCreatorCard,
  MsRecommendedCreatorRow,
} from '@/components/MsExploreVisual';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsSectionHeader } from '@/components/MsSectionHeader';
import { MsFeedbackModal } from '@/components/MsFeedbackModal';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { ExploreAlbumCard } from '@/components/ExploreAlbumCard';
import { MsPostCard } from '@/components/MsPostCard';
import { MsPostSkeleton } from '@/components/MsSkeletonCard';
import type { Post } from '@/services/posts';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── View mode toggle ─────────────────────────────────────────────────────────

type ViewMode = 'explore' | 'creators' | 'albums' | 'shorts';

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const tabs: { id: ViewMode; label: string; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
    { id: 'explore',  label: 'Explore',  Icon: Compass },
    { id: 'creators', label: 'Creators', Icon: Users },
    { id: 'albums',   label: 'Albums',   Icon: Images },
    { id: 'shorts',   label: 'Shorts',   Icon: Lightning },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={toggleStyles.scrollWrap}
    >
      <View style={toggleStyles.wrap}>
        {tabs.map(({ id, label, Icon }) => {
          const active = mode === id;
          return (
            <Pressable
              key={id}
              style={[toggleStyles.tab, active && toggleStyles.tabActive]}
              onPress={() => onChange(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Icon size={13} color={active ? T.BG : T.TEXT_2} />
              <Text style={[toggleStyles.label, active && toggleStyles.labelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const toggleStyles = StyleSheet.create({
  scrollWrap: {
    paddingHorizontal: 20,
  },
  wrap: {
    flexDirection: 'row',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.full,
    padding: 3,
    ...T.SHADOWS.soft,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: T.RADIUS.full,
  },
  tabActive: {
    backgroundColor: T.TEXT,
    ...T.SHADOWS.soft,
  },
  label: {
    color: T.TEXT_2,
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
  labelActive: {
    color: T.BG,
  },
});

// ─── Map explore ContentPreview + Creator → Post shape for MsPostCard ─────────

function previewToPost(preview: import('@/lib/api-client-react').ContentPreview, creator: import('@/lib/api-client-react').Creator): Post {
  const isVideo = preview.kind === 'video' || preview.kind === 'audio';
  // IMPORTANT: use preview.contentType (the canonical backend value) for type dispatch,
  // NOT preview.kind — normalizeItem sets kind to 'video'|'photo' only, never 'album',
  // so checking preview.kind === 'album' always falls through to 'post'.
  const contentType: Post['contentType'] =
    preview.contentType === 'short' ? 'short' :
    preview.contentType === 'album' ? 'album' :
    isVideo ? 'video' : 'post';

  // Only show a tier badge for paid tiers — never for free/public content.
  const rawTier = preview.tier as import('@/constants/tiers').ContentTier | null | undefined;
  const tier: import('@/constants/tiers').ContentTier | undefined =
    rawTier === 'subscriber' || rawTier === 'subscriber_plus' ? rawTier : undefined;

  // For video/short posts, title and caption are separate fields.
  // Setting caption = title would cause the title to render twice in MsPostCard
  // (once as videoTitle block, once as caption). Use the raw description as caption
  // and leave caption empty for video posts that have no description.
  const exploreCaption = isVideo ? '' : (preview.title ?? '');

  return {
    id: preview.id,
    caption: exploreCaption,
    title: preview.title ?? undefined,
    visibility: 'public',
    tier,
    contentType,
    // For video posts: always set mediaType='video' so MsPostCard renders the video card.
    // mediaUrl may be null for Explore previews — the card still renders using thumbnailUrl
    // and taps navigate to /videos/:id.  Never fall through to 'image' for a video post.
    mediaUrl: preview.mediaUrl ?? undefined,
    mediaType: isVideo ? 'video' : (preview.thumbnailUrl || preview.mediaUrl ? 'image' : undefined),
    thumbnailUrl: preview.thumbnailUrl ?? null,
    durationSecs: null,
    fileSize: null,
    width: null,
    height: null,
    likeCount: preview.likeCount ?? 0,
    likes_count: preview.likeCount ?? 0,
    commentCount: preview.commentCount ?? 0,
    comments_count: preview.commentCount ?? 0,
    bookmarkCount: 0,
    created_at: preview.createdAt ?? new Date().toISOString(),
    createdAt: preview.createdAt ?? new Date().toISOString(),
    author: {
      id: creator.id,
      name: creator.name ?? '',
      username: (creator.handle ?? '').replace('@', ''),
      avatarUrl: creator.avatarUrl ?? null,
      isVerified: creator.isVerified ?? false,
      isCreator: true,
    },
    likedByMe: false,
    is_liked: false,
    bookmarkedByMe: false,
    is_bookmarked: false,
  };
}

// ─── Shared content-state header (loading / error only — search+toggle are sticky) ──

interface HeaderProps {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  showCatalogSkeleton?: boolean;
}

function ExploreHeader({ isLoading, isError, onRetry, showCatalogSkeleton = true }: HeaderProps) {
  return (
    <>
      {isLoading && showCatalogSkeleton && (
        <View style={styles.loadingWrap}>
          <MsCatalogSkeleton />
        </View>
      )}
      {isError && (
        <MsEmptyState
          title="Explore is taking a moment"
          message="We couldn't load content. Pull down to try again."
          actionLabel="Retry"
          onAction={onRetry}
        />
      )}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  // Default to the new primary discovery tab
  const [viewMode, setViewMode] = useState<ViewMode>('explore');
  const [refreshing, setRefreshing] = useState(false);

  const [menuCreator, setMenuCreator] = useState<Creator | null>(null);
  const { hiddenIds, hiddenCreatorIds, markCreatorHidden } = usePostActions();

  // Subscription state — server-confirmed. `subscribedIds` reflects creators the
  // user subscribed to during THIS session; `creator.subscribedToCreator` is the
  // authoritative state returned by /explore on load/refetch.
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  // ── Data hooks ───────────────────────────────────────────────────────────────
  const catalogQuery = useLocalExploreCatalog();
  const feedQuery    = useExploreFeed();
  const albumsQuery  = useLocalAlbumCatalog();

  const catalog = catalogQuery.data;

  // Merge all feed pages — deduplicate by id
  const { allCreators, allPreviews } = useMemo(() => {
    const pages = feedQuery.data?.pages ?? [];
    const creatorMap = new Map<string, Creator>();
    const previewIds = new Set<string>();
    const previews: typeof pages[0]['previews'] = [];

    for (const page of pages) {
      for (const c of page.creators) {
        if (!creatorMap.has(c.id)) creatorMap.set(c.id, c);
      }
      for (const p of page.previews) {
        if (!previewIds.has(p.id)) {
          previewIds.add(p.id);
          previews.push(p);
        }
      }
    }
    return { allCreators: Array.from(creatorMap.values()), allPreviews: previews };
  }, [feedQuery.data]);

  function findCreatorInFeed(id: string) {
    return allCreators.find((c) => c.id === id);
  }

  // Live subscription state for a creator id (server flag OR this session's
  // subscribe action) — used to gate discovery actions on cards.
  const isSubscribedCreator = useCallback(
    (id: string) =>
      subscribedIds.has(id) || Boolean(allCreators.find((c) => c.id === id)?.subscribedToCreator),
    [allCreators, subscribedIds],
  );

  // ── Feed items — MsPostCard items (same as home feed) with album rows every 5 ─
  type FeedItem =
    | { type: 'post';      post: Post; id: string; contentType?: string | null }
    | { type: 'album-row'; albums: AlbumCardData[]; id: string };

  const feedItems = useMemo<FeedItem[]>(() => {
    const needle = search.trim().toLowerCase();
    const raw: (FeedItem & { type: 'post' })[] = [];

    for (const p of allPreviews) {
      const creator = findCreatorInFeed(p.creatorId);
      if (!creator) continue;
      // Hidden posts (Not Interested) and hidden/blocked creators never render.
      if (hiddenIds.includes(p.id) || hiddenCreatorIds.includes(p.creatorId)) continue;

      const titleSearch = `${p.title} ${creator.name} ${p.kind}`.toLowerCase();
      if (needle && !titleSearch.includes(needle)) continue;

      raw.push({ type: 'post', post: previewToPost(p, creator), id: p.id, contentType: p.contentType });
    }

    // Inject album rows every 5 content items for visual variety
    const albums = albumsQuery.data ?? [];
    const result: FeedItem[] = [];
    let albumIdx = 0;

    for (let i = 0; i < raw.length; i++) {
      result.push(raw[i]);
      if ((i + 1) % 5 === 0 && albumIdx < albums.length) {
        const rowAlbums = albums.slice(albumIdx, albumIdx + 2);
        if (rowAlbums.length > 0) {
          result.push({
            type: 'album-row',
            albums: rowAlbums,
            id: `album-row-${albumIdx}`,
          });
          albumIdx += 2;
        }
      }
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPreviews, allCreators, search, albumsQuery.data, hiddenIds, hiddenCreatorIds]);

  // ── Catalog-mode data ─────────────────────────────────────────────────────────
  const catalogCreators       = catalog?.creators ?? [];
  const catalogPreviews       = catalog?.previews ?? [];
  const featuredCreatorIds    = catalog?.featuredCreatorIds ?? [];
  const recommendedCreatorIds = catalog?.recommendedCreatorIds ?? [];
  const visibleCreators = useMemo(() => {
    if (!catalog) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return catalogCreators;
    return catalogCreators.filter((creator) =>
      `${creator.name ?? ''} ${creator.handle ?? ''} ${creator.bio ?? ''} ${creator.category ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [catalog, catalogCreators, search]);

  const featured = featuredCreatorIds
    .map((id) => catalogCreators.find((c) => c.id === id))
    .filter((c): c is Creator => c !== undefined && !hiddenCreatorIds.includes(c.id));

  const recommended = recommendedCreatorIds
    .map((id) => catalogCreators.find((c) => c.id === id))
    .filter((c): c is Creator => c !== undefined && !hiddenCreatorIds.includes(c.id));

  // ── Albums mode data ──────────────────────────────────────────────────────────
  const allAlbums = albumsQuery.data ?? [];
  const visibleAlbums = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allAlbums;
    return allAlbums.filter((a) => {
      const text = `${a.title} ${a.creatorName} ${a.description}`.toLowerCase();
      return text.includes(needle);
    });
  }, [allAlbums, search]);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const { user: currentUser } = useAuth();
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'error' | 'info';
    title: string;
    message?: string;
  } | null>(null);

  /** Navigate to a creator page — but redirect to own profile if it's the current user */
  const navToCreatorId = useCallback((creatorId: string, creatorHandle?: string) => {
    if (currentUser) {
      if (currentUser.id === creatorId) { router.push('/(tabs)/profile'); return; }
      if (creatorHandle && currentUser.username === creatorHandle.replace('@', '')) {
        router.push('/(tabs)/profile'); return;
      }
    }
    router.push(`/creator/${creatorId}`);
  }, [currentUser]);

  // ── Actions ────────────────────────────────────────────────────────────────────
  const openCreator = (creator: Creator) => navToCreatorId(creator.id, creator.handle);

  // Subscribe from the Creators section. State is ONLY updated after the server
  // confirms the subscription (subscribe() returns the authoritative tier +
  // subscriber count) — never optimistically.
  const handleSubscribe = useCallback(
    async (creator: Creator) => {
      if (subscribingId) return;
      // Already subscribed — route to the creator profile so the user can
      // manage (upgrade / unsubscribe) instead of re-triggering a subscribe
      // call from the feed.
      const alreadySubscribed =
        Boolean(creator.subscribedToCreator) || subscribedIds.has(creator.id);
      if (alreadySubscribed) {
        navToCreatorId(creator.id, creator.handle);
        return;
      }
      setSubscribingId(creator.id);
      try {
        await subscribe(creator.id, 'subscriber');
        setSubscribedIds((prev) => {
          const next = new Set(prev);
          next.add(creator.id);
          return next;
        });
        setFeedback({
          variant: 'success',
          title: 'Subscribed',
          message: `You are now subscribed to ${creator.name}.`,
        });
        // Re-fetch authoritative catalog state so the subscriber count and
        // subscribed flag stay correct when the user returns later.
        catalogQuery.refetch();
      } catch (err) {
        const code = (err as { code?: string }).code;
        setFeedback({
          variant: 'error',
          title: 'Could not subscribe',
          message:
            code === 'INSUFFICIENT_BALANCE'
              ? 'Insufficient wallet balance. Top up to subscribe.'
              : (err as Error).message || 'Could not subscribe. Please try again.',
        });
      } finally {
        setSubscribingId(null);
      }
    },
    [subscribingId, catalogQuery, subscribedIds, navToCreatorId],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        catalogQuery.refetch(),
        feedQuery.refetch(),
        albumsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [catalogQuery, feedQuery, albumsQuery]);

  const handleModeChange = (m: ViewMode) => {
    if (m === 'shorts') {
      router.push('/shorts');
      return;
    }
    setViewMode(m);
    setSearch('');
  };

  const creatorMenuActions = (creator: Creator): ActionItem[] => {
    const isSubscribed = isSubscribedCreator(creator.id);
    return [
      { label: 'View Profile', onPress: () => openCreator(creator) },
      // Subscribe only makes sense for creators the viewer is NOT subscribed to.
      ...(!isSubscribed
        ? [{ label: 'Subscribe', onPress: () => navToCreatorId(creator.id, creator.handle) }]
        : []),
      {
        label: 'Copy Username',
        onPress: async () => {
          setMenuCreator(null);
          await Clipboard.setStringAsync(creator.handle);
          setFeedback({ variant: 'success', title: 'Copied', message: `${creator.handle} copied to clipboard.` });
        },
      },
      {
        label: 'Share Profile',
        onPress: async () => {
          setMenuCreator(null);
          try {
            const { createShareLink } = await import('@/services/sharing');
            const shareLink = await createShareLink('creator', creator.id);
            const url = shareLink.url || `https://meetsweet.space/${creator.handle}`;
            await Share.share({ title: creator.name, message: `Check out ${creator.name} ${creator.handle} on MeetSweet!\n${url}`, url });
          } catch {
            await Share.share({ title: creator.name, message: `Check out ${creator.name} ${creator.handle} on MeetSweet!` });
          }
        },
      },
      // Hide Creator — a discovery action; NEVER offered for creators the
      // viewer is already subscribed to. Persists server-side (mute) and drops
      // the creator from every list immediately.
      ...(!isSubscribed
        ? [
            {
              label: 'Hide Creator',
              onPress: () => {
                setMenuCreator(null);
                hideCreator(creator.handle.replace('@', ''))
                  .then(() => {
                    markCreatorHidden(creator.id);
                    setFeedback({
                      variant: 'success',
                      title: 'Creator hidden',
                      message: `${creator.name}'s content will no longer appear in your feeds.`,
                    });
                  })
                  .catch(() =>
                    setFeedback({ variant: 'error', title: 'Could not hide creator', message: 'Please try again.' }),
                  );
              },
            },
          ]
        : []),
      {
        label: 'Block',
        destructive: true,
        onPress: () => {
          setMenuCreator(null);
          blockUser(creator.handle.replace('@', ''))
            .then(() => {
              markCreatorHidden(creator.id);
              setFeedback({
                variant: 'success',
                title: 'Blocked',
                message: `${creator.name} has been blocked.`,
              });
            })
            .catch(() =>
              setFeedback({ variant: 'error', title: 'Could not block', message: 'Please try again.' }),
            );
        },
      },
    ];
  };

  const isLoading =
    viewMode === 'creators' ? catalogQuery.isLoading
    : viewMode === 'albums'  ? albumsQuery.isLoading
    : feedQuery.isLoading;

  const isError =
    viewMode === 'creators' ? catalogQuery.isError
    : viewMode === 'albums'  ? albumsQuery.isError
    : feedQuery.isError;

  const { notifUnread } = useNotifications();

  // ── Shared page header ────────────────────────────────────────────────────────
  const pageHeader = (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>DISCOVER</Text>
        <Text style={styles.title}>Explore</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.push('/notifications')}
          accessibilityLabel="Notifications"
        >
          <View style={{ position: 'relative' }}>
            <Bell size={19} color={T.TEXT} />
            {notifUnread > 0 && (
              <View style={styles.notificationDot}>
                <Text style={{ color: '#fff', fontSize: 8, fontFamily: T.FONT.bold, lineHeight: 11 }}>
                  {notifUnread > 9 ? '9+' : notifUnread}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );

  const headerProps: HeaderProps = {
    isLoading,
    isError,
    onRetry: () => { catalogQuery.refetch(); feedQuery.refetch(); albumsQuery.refetch(); },
    showCatalogSkeleton: viewMode !== 'explore',
  };

  // ── Sticky search + mode toggle — rendered outside every scroll container ───
  const stickyControls = (
    <View style={styles.stickyBar}>
      <View style={styles.searchField}>
        <SearchIcon size={16} color={T.TEXT_2} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={
            viewMode === 'albums'   ? 'Search albums, creators'
            : viewMode === 'creators' ? 'Search creators, categories'
            : 'Search posts, creators'
          }
          placeholderTextColor={T.TEXT_3}
          selectionColor="#888"
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={10}>
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.modeToggleWrap}>
        <ModeToggle mode={viewMode} onChange={handleModeChange} />
      </View>
    </View>
  );

  // ── EXPLORE MODE — same MsPostCard feed as Home (single-column) ───────────────
  if (viewMode === 'explore') {
    const loadingMore = feedQuery.isFetchingNextPage;

    const handleEndReached = () => {
      if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
        feedQuery.fetchNextPage();
      }
    };

    const renderFeedItem = ({ item }: { item: FeedItem }) => {
      if (item.type === 'post') {
        const navToContent = () => {
          if (item.contentType === 'short') {
            router.push({ pathname: '/shorts', params: { startId: item.id } });
          } else if (item.post.mediaType === 'video') {
            router.push(`/videos/${item.id}`);
          } else {
            router.push(`/post/${item.id}`);
          }
        };
        return (
          <MsPostCard
            post={item.post}
            onPress={navToContent}
            onMediaPress={navToContent}
            onAuthorPress={() => navToCreatorId(item.post.author.id, item.post.author.username)}
            tier={item.post.tier as import('@/constants/tiers').ContentTier | undefined}
            onCreatorHidden={(creatorId) => markCreatorHidden(creatorId)}
            subscribedToAuthor={isSubscribedCreator(item.post.author.id)}
          />
        );
      }

      if (item.type === 'album-row') {
        return (
          <View style={styles.albumRowWrap}>
            <View style={styles.albumRowHeader}>
              <Images size={13} color={T.TEXT_2} />
              <Text style={styles.albumRowLabel}>Albums</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.albumRowScroll}
            >
              {item.albums.map((album) => (
                <View key={album.id} style={styles.albumRowCard}>
                  <ExploreAlbumCard
                    album={album}
                    onPress={() => router.push(`/album/${album.id}`)}
                    onCreatorPress={() => navToCreatorId(album.creatorId)}
                    onUnlockPress={() => router.push(`/album/${album.id}`)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        );
      }

      return null;
    };

    return (
      <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
        {pageHeader}
        {stickyControls}

        <FlatList
          data={feedItems}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedItem}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            isLoading && feedItems.length === 0 ? (
              <View style={{ marginTop: 8 }}>
                <MsPostSkeleton />
                <MsPostSkeleton />
                <MsPostSkeleton />
              </View>
            ) : null
          }
          ListEmptyComponent={
            isLoading ? null : (
              <MsEmptyState
                title="No posts yet"
                message="Check back later to discover new content from creators."
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreWrap}>
                <MsPostSkeleton />
              </View>
            ) : null
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          contentContainerStyle={styles.feedListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.TEXT} />
          }
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={4}
          initialNumToRender={5}
        />

        <MsActionSheet
          visible={!!menuCreator}
          title={menuCreator?.name}
          subtitle={menuCreator?.handle}
          actions={menuCreator ? creatorMenuActions(menuCreator) : []}
          onClose={() => setMenuCreator(null)}
        />

      </MsAmbientBackground>
    );
  }

  // ── ALBUMS MODE — flat grid of album cards ────────────────────────────────────
  if (viewMode === 'albums') {
    return (
      <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
        {pageHeader}
        {stickyControls}

        <FlatList
          data={visibleAlbums}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.feedItemWrap}>
              <ExploreAlbumCard
                album={item}
                onPress={() => router.push(`/album/${item.id}`)}
                onCreatorPress={() => navToCreatorId(item.creatorId)}
                onUnlockPress={() => router.push(`/album/${item.id}`)}
              />
            </View>
          )}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<ExploreHeader {...headerProps} />}

          ListEmptyComponent={
            isLoading ? null : (
              <MsEmptyState
                title={search ? 'No albums match that search' : 'No albums yet'}
                message={
                  search
                    ? 'Try clearing your search.'
                    : 'Albums are curated collections from your favourite creators.'
                }
                actionLabel={search ? 'Clear search' : undefined}
                onAction={() => setSearch('')}
              />
            )
          }
          contentContainerStyle={styles.feedListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.TEXT} />
          }
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={4}
          initialNumToRender={4}
        />
      </MsAmbientBackground>
    );
  }

  // ── CREATORS MODE — creator cards + their content ────────────────────────────────────────────
  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      {pageHeader}
      {stickyControls}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.TEXT} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <ExploreHeader {...headerProps} />

        {!isLoading && !isError && catalog && (
          <>
            {/* Featured creators */}
            {featured.length > 0 && (
              <>
                <MsSectionHeader
                  title="Featured creators"
                  actionLabel="View all"
                  onAction={() => {}}
                  style={styles.sectionHeader}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.featuredRow}
                >
                  {featured.map((creator) => (
                    <MsFeaturedCreatorCard
                      key={creator.id}
                      creator={creator}
                      onPress={() => openCreator(creator)}
                      onLongPress={() => setMenuCreator(creator)}
                      onAvatarPress={() => openCreator(creator)}
                      onSubscribe={() => handleSubscribe(creator)}
                      isSubscribed={Boolean(creator.subscribedToCreator) || subscribedIds.has(creator.id)}
                      subscribing={subscribingId === creator.id}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* Albums highlight row */}
            {allAlbums.length > 0 && (
              <>
                <MsSectionHeader
                  title="Albums"
                  actionLabel="See all"
                  onAction={() => handleModeChange('albums')}
                  style={styles.sectionHeader}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.featuredRow}
                >
                  {allAlbums.slice(0, 4).map((album) => (
                    <View key={album.id} style={styles.albumHighlightCard}>
                      <ExploreAlbumCard
                        album={album}
                        onPress={() => router.push(`/album/${album.id}`)}
                        onCreatorPress={() => navToCreatorId(album.creatorId)}
                        onUnlockPress={() => router.push(`/album/${album.id}`)}
                      />
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Recommended creators */}
            {recommended.length > 0 && (
              <>
                <MsSectionHeader
                  title="Recommended for you"
                  style={styles.sectionHeader}
                />
                <View style={styles.recommendedWrap}>
                  {recommended.map((creator) => (
                    <MsRecommendedCreatorRow
                      key={creator.id}
                      creator={creator}
                      onPress={() => openCreator(creator)}
                      onLongPress={() => setMenuCreator(creator)}
                      onAvatarPress={() => openCreator(creator)}
                      onSubscribe={() => handleSubscribe(creator)}
                      isSubscribed={Boolean(creator.subscribedToCreator) || subscribedIds.has(creator.id)}
                      subscribing={subscribingId === creator.id}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Creator content — video and image cards from real posts */}
            <MsSectionHeader
              title="Creator content"
              style={styles.sectionHeader}
            />
            {catalogPreviews.length > 0 ? (
              <View style={styles.creatorContentList}>
                {catalogPreviews.map((preview) => {
                  const creator = catalogCreators.find((c) => c.id === preview.creatorId);
                  if (!creator) return null;

                  // Filter by search
                  if (search.trim()) {
                    const needle = search.trim().toLowerCase();
                    const haystack = `${preview.title} ${creator.name} ${creator.handle}`.toLowerCase();
                    if (!haystack.includes(needle)) return null;
                  }

                  const post: Post = previewToPost(preview, creator);

                  const navToCreatorContent = () => {
                    if (preview.contentType === 'short') {
                      router.push({ pathname: '/shorts', params: { startId: preview.id } });
                    } else if (preview.kind === 'video') {
                      router.push(`/videos/${preview.id}`);
                    } else {
                      router.push(`/post/${preview.id}`);
                    }
                  };

                  return (
                    <MsPostCard
                      key={preview.id}
                      post={post}
                      onPress={navToCreatorContent}
                      onMediaPress={navToCreatorContent}
                      onAuthorPress={() => navToCreatorId(creator.id, creator.handle)}
                    />
                  );
                })}
              </View>
            ) : (
              <MsEmptyState
                title="Discover creators you'll love"
                message="No creator content yet. Check back after more creators join."
              />
            )}

            {/* Trending collections */}
            {((catalog as any)?.collections ?? []).length > 0 && (
              <>
                <MsSectionHeader
                  title="Trending collections"
                  style={styles.sectionHeader}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.collectionRow}
                >
                  {((catalog as any)?.collections ?? []).map((collection: any) => (
                    <MsCollectionCard
                      key={collection.id}
                      collection={collection}
                      onPress={() => setSearch(collection.title)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* All creators */}
            {visibleCreators.length > 0 && (
              <>
                <MsSectionHeader
                  title="All creators"
                  style={styles.sectionHeader}
                />
                <View style={styles.recommendedWrap}>
                  {visibleCreators.map((creator) => (
                    <MsRecommendedCreatorRow
                      key={creator.id}
                      creator={creator}
                      onPress={() => openCreator(creator)}
                      onLongPress={() => setMenuCreator(creator)}
                      onAvatarPress={() => openCreator(creator)}
                      onSubscribe={() => handleSubscribe(creator)}
                      isSubscribed={Boolean(creator.subscribedToCreator) || subscribedIds.has(creator.id)}
                      subscribing={subscribingId === creator.id}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {!isLoading && !isError && !catalog && (
          <MsEmptyState
            title="No creators yet"
            message="Come back soon to discover creators."
          />
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      <MsActionSheet
        visible={!!menuCreator}
        title={menuCreator?.name}
        subtitle={menuCreator?.handle}
        actions={menuCreator ? creatorMenuActions(menuCreator) : []}
        onClose={() => setMenuCreator(null)}
      />

      {/* Subscription feedback (styled modal) */}
      <MsFeedbackModal
        visible={Boolean(feedback)}
        variant={feedback?.variant ?? 'info'}
        title={feedback?.title ?? ''}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />

    </MsAmbientBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  stickyBar: {
    backgroundColor: T.BG,
    zIndex: 10,
  },

  header: {
    minHeight: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: { color: T.TEXT_3, fontFamily: T.FONT.semibold, fontSize: 8, letterSpacing: 1.3 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 21, letterSpacing: -0.6, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.soft,
  },
  notificationDot: {
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
  scrollContent: { paddingTop: 16, paddingBottom: 0 },
  feedListContent: { paddingTop: 12, paddingBottom: 100 },

  modeToggleWrap: {
    marginVertical: 13,
  },

  searchField: {
    marginHorizontal: 20,
    marginTop: 4,
    height: 46,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 9,
    ...T.SHADOWS.soft,
  },
  searchInput: {
    flex: 1,
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    height: 44,
    paddingHorizontal: 0,
    // Vertically centre the caret + text inside the 44px search field on Android.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  clearSearch: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 22, lineHeight: 22 },

  loadingWrap: { paddingTop: 12 },

  sectionHeader: { paddingTop: 24, paddingBottom: 12 },
  featuredRow: { gap: 12, paddingHorizontal: 20, paddingBottom: 3 },
  collectionRow: { gap: 12, paddingHorizontal: 20 },
  recommendedWrap: { backgroundColor: T.SURFACE, marginHorizontal: 20, borderRadius: T.RADIUS.xl, overflow: 'hidden', ...T.SHADOWS.soft },
  bottomSpace: { height: 28 },

  // Feed list — compact 8px spacing
  feedItemWrap:  { paddingHorizontal: 12, paddingBottom: 12 },
  videoItemWrap: { paddingHorizontal: 10, paddingBottom: 12 },

  // Album row injected into content feed
  albumRowWrap: { paddingBottom: 20 },
  albumRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  albumRowLabel: {
    color: T.TEXT_2,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
  },
  albumRowScroll: { paddingHorizontal: 20, gap: 16, paddingRight: 20 },
  albumRowCard: { width: SCREEN_WIDTH - 80 },

  // Album highlight row in creators mode
  albumHighlightCard: { width: SCREEN_WIDTH - 72 },

  // Creator content cards
  creatorContentList: { gap: 0 },

  // Loading more
  loadMoreWrap: { paddingVertical: 20, alignItems: 'center' },
});
