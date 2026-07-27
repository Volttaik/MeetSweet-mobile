import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
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
  CaretRight,
  Compass,
  FilmStrip,
  Images,
  Lightning,
  MagnifyingGlass as SearchIcon,
  Users,
  Wallet,
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
import { ExploreCreatorCard } from '@/components/ExploreCreatorCard';
import { CreatorImageCard } from '@/components/CreatorImageCard';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsSectionHeader } from '@/components/MsSectionHeader';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsCreatorPreview, type CreatorPreviewData } from '@/components/MsCreatorPreview';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { ExploreImageCard, type ExploreImageCardData } from '@/components/ExploreImageCard';
import { ExploreVideoCard, type ExploreVideoCardData } from '@/components/ExploreVideoCard';
import { ExploreAlbumCard } from '@/components/ExploreAlbumCard';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CREATOR_IMG_WIDTH = Math.floor((SCREEN_WIDTH - 24 - 10) / 2);

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPreviewData(creator: Creator): CreatorPreviewData {
  return {
    id: creator.id,
    name: creator.name,
    handle: creator.handle,
    bio: creator.bio,
    initials: creator.initials,
    isVerified: creator.isVerified,
    isOnline: creator.isOnline,
    followers: creator.followers,
    monthlyCredits: creator.monthlyCredits,
    category: creator.category,
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
  creditBalance: number;
}

function ExploreHeader({
  search,
  onSearchChange,
  viewMode,
  onModeChange,
  isLoading,
  isError,
  onRetry,
  creditBalance,
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
              : 'Search videos, images, creators'
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

      {/* Loading skeleton */}
      {isLoading && (
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

      {/* Wallet banner */}
      {!isLoading && !isError && (
        <Pressable style={styles.creditBanner} onPress={() => router.push('/wallet')}>
          <View style={styles.creditIcon}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.creditLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.creditCopy}>
            <Text style={styles.creditEyebrow}>YOUR CREATOR WALLET</Text>
            <Text style={styles.creditBalance}>
              {creditBalance.toLocaleString()}
              <Text style={styles.creditUnit}> credits</Text>
            </Text>
          </View>
          <View style={styles.creditAction}>
            <Text style={styles.creditActionText}>Top up</Text>
            <CaretRight size={15} color={T.BG} />
          </View>
        </Pressable>
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
  const [previewCreator, setPreviewCreator] = useState<CreatorPreviewData | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

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

  // ── Feed items — image + video cards with album rows injected every 5 items ──
  type FeedItem =
    | { type: 'video';     data: ExploreVideoCardData; id: string }
    | { type: 'image';     data: ExploreImageCardData; id: string }
    | { type: 'album-row'; albums: AlbumCardData[];    id: string };

  const feedItems = useMemo<FeedItem[]>(() => {
    const needle = search.trim().toLowerCase();
    const raw: (FeedItem & { type: 'video' | 'image' })[] = [];

    for (const p of allPreviews) {
      const creator = findCreatorInFeed(p.creatorId);
      if (!creator) continue;

      const titleSearch = `${p.title} ${creator.name} ${p.kind}`.toLowerCase();
      if (needle && !titleSearch.includes(needle)) continue;

      const uploadDate = fmtTimeAgo(p.createdAt);
      const fmtComments = String(p.commentCount ?? 0);

      if (p.kind === 'video' || p.kind === 'audio') {
        const card: ExploreVideoCardData = {
          id: p.id,
          title: p.title || 'Untitled',
          duration: p.duration,
          likes: p.likes,
          comments: fmtComments,
          uploadDate,
          gradient: p.gradient,
          isPremium: p.isPremium,
          kind: p.kind,
          lockedLabel: p.lockedLabel,
          thumbnailUrl: p.thumbnailUrl,
          mediaUrl: p.isPremium ? null : (p.mediaUrl ?? null),
          creatorId: creator.id,
          creatorName: creator.name,
          creatorHandle: creator.handle,
          creatorInitials: creator.initials,
          creatorIsVerified: creator.isVerified,
          creatorIsOnline: creator.isOnline,
          creatorAvatarUrl: creator.avatarUrl,
        };
        raw.push({ type: 'video', data: card, id: p.id });
      } else {
        const card: ExploreImageCardData = {
          id: p.id,
          caption: p.title || '',
          likes: p.likes,
          comments: fmtComments,
          uploadDate,
          isPremium: p.isPremium,
          lockedLabel: p.lockedLabel,
          imageUrl: p.thumbnailUrl ?? p.mediaUrl ?? null,
          gradient: p.gradient,
          creatorId: creator.id,
          creatorName: creator.name,
          creatorHandle: creator.handle,
          creatorInitials: creator.initials,
          creatorIsVerified: creator.isVerified,
          creatorIsOnline: creator.isOnline,
          creatorAvatarUrl: creator.avatarUrl,
        };
        raw.push({ type: 'image', data: card, id: p.id });
      }
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
  const creditBalance         = Number(catalog?.creditBalance ?? 0);

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

  const openAvatarPreview = (creator: Creator) => {
    setPreviewCreator(toPreviewData(creator));
    setPreviewVisible(true);
  };

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
        <Pressable style={styles.walletButton} onPress={() => router.push('/wallet')}>
          <Wallet size={16} color={T.BG} />
          <Text style={styles.walletButtonText}>{creditBalance.toLocaleString()}</Text>
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
    creditBalance,
  };

  // ── EXPLORE MODE — primary discovery feed (mixed video + image cards) ─────────
  if (viewMode === 'explore') {
    const loadingMore = feedQuery.isFetchingNextPage;

    const handleEndReached = () => {
      if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
        feedQuery.fetchNextPage();
      }
    };

    const renderFeedItem = ({ item }: { item: FeedItem }) => {
      if (item.type === 'image') {
        return (
          <View style={styles.feedItemWrap}>
            <ExploreImageCard
              card={item.data}
              onPress={() => router.push(`/content/${item.id}`)}
              onCreatorPress={() => router.push(`/creator/${item.data.creatorId}`)}
              onUnlockPress={() => router.push(`/content/${item.id}`)}
            />
          </View>
        );
      }

      if (item.type === 'video') {
        return (
          <View style={styles.videoItemWrap}>
            <ExploreVideoCard
              card={item.data}
              onPress={() => router.push(`/content/${item.id}`)}
              onCreatorPress={() => router.push(`/creator/${item.data.creatorId}`)}
              onUnlockPress={() => router.push(`/content/${item.id}`)}
            />
          </View>
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
          ListHeaderComponent={<ExploreHeader {...headerProps} />}
          ListEmptyComponent={
            isLoading ? null : (
              <MsEmptyState
                title="No posts found"
                message="Try searching or check back later for new content."
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

        <MsCreatorPreview
          visible={previewVisible}
          creator={previewCreator}
          onClose={() => setPreviewVisible(false)}
          onViewProfile={() => { if (previewCreator) router.push(`/creator/${previewCreator.id}`); }}
          onSubscribe={() => { if (previewCreator) router.push(`/creator/${previewCreator.id}`); }}
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
                      onAvatarPress={() => openAvatarPreview(creator)}
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
                      onAvatarPress={() => openAvatarPreview(creator)}
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
                    const card: ExploreVideoCardData = {
                      id:          preview.id,
                      title:       preview.title || 'Untitled',
                      duration:    preview.duration,
                      likes:       preview.likes,
                      comments,
                      uploadDate,
                      gradient:    preview.gradient,
                      isPremium:   preview.isPremium,
                      kind:        preview.kind,
                      lockedLabel: preview.lockedLabel,
                      thumbnailUrl: preview.thumbnailUrl ?? null,
                      mediaUrl:    preview.isPremium ? null : (preview.mediaUrl ?? null),
                      ...creatorBase,
                    };
                    return (
                      <View key={preview.id} style={styles.videoItemWrap}>
                        <ExploreVideoCard
                          card={card}
                          onPress={() => router.push(`/content/${preview.id}`)}
                          onCreatorPress={() => router.push(`/creator/${creator.id}`)}
                          onUnlockPress={() => router.push(`/content/${preview.id}`)}
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
                    isPremium:   preview.isPremium,
                    lockedLabel: preview.lockedLabel,
                    imageUrl:    preview.thumbnailUrl ?? preview.mediaUrl ?? null,
                    gradient:    preview.gradient,
                    ...creatorBase,
                  };
                  return (
                    <View key={preview.id} style={styles.feedItemWrap}>
                      <ExploreImageCard
                        card={imgCard}
                        onPress={() => router.push(`/content/${preview.id}`)}
                        onCreatorPress={() => router.push(`/creator/${creator.id}`)}
                        onUnlockPress={() => router.push(`/content/${preview.id}`)}
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
                      onAvatarPress={() => openAvatarPreview(creator)}
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

      <MsCreatorPreview
        visible={previewVisible}
        creator={previewCreator}
        onClose={() => setPreviewVisible(false)}
        onViewProfile={() => { if (previewCreator) router.push(`/creator/${previewCreator.id}`); }}
        onSubscribe={() => { if (previewCreator) router.push(`/creator/${previewCreator.id}`); }}
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
  walletButton: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 19,
    backgroundColor: T.TEXT,
    ...T.SHADOWS.soft,
  },
  walletButtonText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 11 },

  scrollContent: { paddingTop: 16, paddingBottom: 0 },
  feedListContent: { paddingTop: 16, paddingBottom: 24 },

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

  creditBanner: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: T.TEXT,
    minHeight: 78,
    borderRadius: T.RADIUS.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    ...T.SHADOWS.medium,
  },
  creditIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  creditLogo: {
    width: 30,
    height: 30,
  },
  creditCopy: { flex: 1 },
  creditEyebrow: {
    color: 'rgba(0,0,0,0.55)',
    fontFamily: T.FONT.semibold,
    fontSize: 8,
    letterSpacing: 1.1,
  },
  creditBalance: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  creditUnit: { fontFamily: T.FONT.medium, fontSize: 11 },
  creditAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  creditActionText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 11 },

  sectionHeader: { paddingTop: 24, paddingBottom: 12 },
  featuredRow: { gap: 12, paddingHorizontal: 20, paddingBottom: 3 },
  collectionRow: { gap: 12, paddingHorizontal: 20 },
  recommendedWrap: { backgroundColor: T.SURFACE, marginHorizontal: 20, borderRadius: T.RADIUS.xl, overflow: 'hidden', ...T.SHADOWS.soft },
  bottomSpace: { height: 28 },

  // Feed list
  feedItemWrap:  { paddingHorizontal: 16, paddingBottom: 16 },
  videoItemWrap: { paddingHorizontal: 12, paddingBottom: 16 },

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
