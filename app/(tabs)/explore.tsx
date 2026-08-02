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
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import MsInput from '@/components/MsInput';
import {
  MsCatalogSkeleton,
  MsCollectionCard,
  MsFeaturedCreatorCard,
  MsRecommendedCreatorRow,
} from '@/components/MsExploreVisual';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsSectionHeader } from '@/components/MsSectionHeader';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { ExploreImageCard, type ExploreImageCardData } from '@/components/ExploreImageCard';
import { MsFeedVideoCard, type MsFeedVideoCardData } from '@/components/MsFeedVideoCard';
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
  const contentType: Post['contentType'] =
    preview.contentType === 'short' ? 'short' :
    isVideo ? 'video' :
    preview.kind === 'album' ? 'album' : 'post';
  return {
    id: preview.id,
    caption: preview.title ?? '',
    visibility: 'public',
    contentType,
    mediaUrl: preview.mediaUrl ?? null,
    mediaType: isVideo ? 'video' : (preview.thumbnailUrl || preview.mediaUrl ? 'image' : null),
    thumbnailUrl: preview.thumbnailUrl ?? null,
    durationSecs: null,
    fileSize: null,
    width: null,
    height: null,
    likeCount: preview.likeCount ?? 0,
    commentCount: preview.commentCount ?? 0,
    bookmarkCount: 0,
    isPremium: preview.isPremium ?? false,
    priceCredits: null,
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
    bookmarkedByMe: false,
    tier: 'free' as const,
  };
}

// ─── Shared header component ───────────────────────────────────────────────────

interface HeaderProps {
  search: string;
  onSearchChange: (v: string) => void;
  viewMode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Whether to show MsCatalogSkeleton (false for explore mode — uses MsPostSkeleton instead) */
  showCatalogSkeleton?: boolean;
}

function ExploreHeader({
  search,
  onSearchChange,
  viewMode,
  onModeChange,
  isLoading,
  isError,
  onRetry,
  showCatalogSkeleton = true,
}: HeaderProps) {
  return (
    <>
      {/* Search */}
      <View style={styles.searchField}>
        <SearchIcon size={16} color={T.TEXT_2} />
        <MsInput
          value={search}
          onChangeText={onSearchChange}
          placeholder={
            viewMode === 'albums'
              ? 'Search albums, creators'
              : viewMode === 'creators'
              ? 'Search creators, categories'
              : 'Search posts, creators'
          }
          style={styles.searchInput}
          compact
        />
        {search.length > 0 && (
          <Pressable onPress={() => onSearchChange('')} hitSlop={10}>
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        )}
      </View>

      {/* Mode toggle */}
      <View style={styles.modeToggleWrap}>
        <ModeToggle mode={viewMode} onChange={onModeChange} />
      </View>

      {/* Loading skeleton (catalog/albums/creators modes) */}
      {isLoading && showCatalogSkeleton && (
        <View style={styles.loadingWrap}>
          <MsCatalogSkeleton />
        </View>
      )}

      {/* Error state */}
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
  }, [allPreviews, allCreators, search, albumsQuery.data]);

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
    .filter(Boolean) as Creator[];

  const recommended = recommendedCreatorIds
    .map((id) => catalogCreators.find((c) => c.id === id))
    .filter(Boolean) as Creator[];

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

  // ── Actions ────────────────────────────────────────────────────────────────────
  const openCreator = (creator: Creator) => router.push(`/creator/${creator.id}`);

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

  const creatorMenuActions = (creator: Creator): ActionItem[] => [
    { label: 'View Profile',  onPress: () => openCreator(creator) },
    { label: 'Subscribe',     onPress: () => router.push(`/creator/${creator.id}`) },
    {
      label: 'Copy Username',
      onPress: async () => {
        setMenuCreator(null);
        await Clipboard.setStringAsync(creator.handle);
        Alert.alert('Copied', `${creator.handle} copied to clipboard.`);
      },
    },
    {
      label: 'Share Profile',
      onPress: async () => {
        setMenuCreator(null);
        await Share.share({
          title: creator.name,
          message: `Check out ${creator.name} ${creator.handle} on MeetSweet!`,
        });
      },
    },
    {
      label: 'Mute',
      onPress: () => {
        setMenuCreator(null);
        Alert.alert(
          'Mute Creator',
          `Mute ${creator.name}? Their posts won't appear in your feed.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Mute', onPress: () => Alert.alert('Muted', `${creator.name} has been muted.`) },
          ],
        );
      },
    },
    {
      label: 'Block',
      destructive: true,
      onPress: () => {
        setMenuCreator(null);
        Alert.alert(
          'Block Creator',
          `Block ${creator.name}? You won't see their content anymore.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                try {
                  await blockUser(creator.handle.replace('@', ''));
                  Alert.alert('Blocked', `${creator.name} has been blocked.`);
                } catch {
                  Alert.alert('Error', 'Could not block this user. Please try again.');
                }
              },
            },
          ],
        );
      },
    },
  ];

  const isLoading =
    viewMode === 'creators' ? catalogQuery.isLoading
    : viewMode === 'albums'  ? albumsQuery.isLoading
    : feedQuery.isLoading;

  const isError =
    viewMode === 'creators' ? catalogQuery.isError
    : viewMode === 'albums'  ? albumsQuery.isError
    : feedQuery.isError;

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
          <Bell size={19} color={T.TEXT} />
          <View style={styles.notificationDot} />
        </Pressable>
      </View>
    </View>
  );

  const headerProps: HeaderProps = {
    search,
    onSearchChange: setSearch,
    viewMode,
    onModeChange: handleModeChange,
    isLoading,
    isError,
    onRetry: () => { catalogQuery.refetch(); feedQuery.refetch(); albumsQuery.refetch(); },
    showCatalogSkeleton: viewMode !== 'explore',
  };

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
            onAuthorPress={() => router.push(`/creator/${item.post.author.id}`)}
          />
        );
      }

      if (item.type === 'album-row') {
        return (
          <View style={styles.albumRowWrap}>
            <View style={styles.albumRowHeader}>
              <Images size={13} color={T.TEXT_2} />
              <Text style={styles.albumRowLabel}>Premium Albums</Text>
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
                    onCreatorPress={() => router.push(`/creator/${album.creatorId}`)}
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

        <FlatList
          data={feedItems}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedItem}
          ListHeaderComponent={
            <>
              <ExploreHeader {...headerProps} />
              {/* Post skeletons while loading — matches Home feed exactly */}
              {isLoading && feedItems.length === 0 && (
                <View style={{ marginTop: 8 }}>
                  <MsPostSkeleton />
                  <MsPostSkeleton />
                  <MsPostSkeleton />
                </View>
              )}
            </>
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
                <ActivityIndicator size="small" color={T.TEXT_2} />
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

        <FlatList
          data={visibleAlbums}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.feedItemWrap}>
              <ExploreAlbumCard
                album={item}
                onPress={() => router.push(`/album/${item.id}`)}
                onCreatorPress={() => router.push(`/creator/${item.creatorId}`)}
                onUnlockPress={() => router.push(`/album/${item.id}`)}
              />
            </View>
          )}
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
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* Albums highlight row */}
            {allAlbums.length > 0 && (
              <>
                <MsSectionHeader
                  title="Premium albums"
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
                        onCreatorPress={() => router.push(`/creator/${album.creatorId}`)}
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

                  const uploadDate = fmtTimeAgo(preview.createdAt ?? '');
                  const comments   = String(preview.commentCount ?? 0);
                  const creatorBase = {
                    creatorId:          creator.id,
                    creatorName:        creator.name,
                    creatorHandle:      creator.handle,
                    creatorInitials:    creator.initials,
                    creatorIsVerified:  creator.isVerified ?? false,
                    creatorIsOnline:    creator.isOnline  ?? false,
                    creatorAvatarUrl:   creator.avatarUrl ?? null,
                  };

                  if (preview.kind === 'video' || preview.kind === 'audio') {
                    const card: MsFeedVideoCardData = {
                      id:          preview.id,
                      title:       preview.title || 'Untitled',
                      duration:    preview.duration,
                      likes:       preview.likes,
                      comments,
                      uploadDate,
                      gradient:    preview.gradient,
                      isPremium:   false,
                      kind:        preview.kind,
                      lockedLabel: undefined,
                      thumbnailUrl: preview.thumbnailUrl ?? null,
                      mediaUrl:    preview.mediaUrl ?? null,
                      ...creatorBase,
                    };
                    return (
                      <View key={preview.id} style={styles.videoItemWrap}>
                        <MsFeedVideoCard
                          card={card}
                          onPress={() => router.push(`/videos/${preview.id}`)}
                          onCreatorPress={() => router.push(`/creator/${creator.id}`)}
                          onUnlockPress={() => router.push(`/videos/${preview.id}`)}
                        />
                      </View>
                    );
                  }

                  const imgCard: ExploreImageCardData = {
                    id:          preview.id,
                    caption:     preview.title || '',
                    likes:       preview.likes,
                    comments,
                    uploadDate,
                    isPremium:   false,
                    lockedLabel: undefined,
                    imageUrl:    preview.thumbnailUrl ?? preview.mediaUrl ?? null,
                    gradient:    preview.gradient,
                    ...creatorBase,
                  };
                  return (
                    <View key={preview.id} style={styles.feedItemWrap}>
                      <ExploreImageCard
                        card={imgCard}
                        onPress={() => router.push(`/post/${preview.id}`)}
                        onCreatorPress={() => router.push(`/creator/${creator.id}`)}
                        onUnlockPress={() => router.push(`/post/${preview.id}`)}
                      />
                    </View>
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
            {(catalog.collections ?? []).length > 0 && (
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
                  {(catalog.collections ?? []).map((collection) => (
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

    </MsAmbientBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  header: {
    minHeight: 72,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: { color: T.TEXT_3, fontFamily: T.FONT.semibold, fontSize: 9, letterSpacing: 1.5 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 28, letterSpacing: -0.8, marginTop: 2 },
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
    top: 8,
    right: 9,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: T.ACCENT,
  },
  scrollContent: { paddingTop: 16, paddingBottom: 0 },
  feedListContent: { paddingTop: 12, paddingBottom: 24 },

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
