import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
  CreditCard,
  FilmStrip,
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
import { blockUser } from '@/services/users';
import { Chip } from 'heroui-native';
import MsInput from '@/components/MsInput';
import {
  MsCatalogSkeleton,
  MsCollectionCard,
  MsFeaturedCreatorCard,
  MsPreviewCard,
  MsRecommendedCreatorRow,
} from '@/components/MsExploreVisual';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsSectionHeader } from '@/components/MsSectionHeader';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsCreatorPreview, type CreatorPreviewData } from '@/components/MsCreatorPreview';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsVideoCard, type VideoCardData } from '@/components/MsVideoCard';
import { T } from '@/constants/theme';

// ─── Category lists ────────────────────────────────────────────────────────────

const CREATOR_CATEGORIES = [
  { id: 'all',               label: 'All' },
  { id: 'trending',          label: 'Trending' },
  { id: 'new',               label: 'New Creators' },
  { id: 'premium',           label: 'Premium' },
  { id: 'lifestyle',         label: 'Lifestyle' },
  { id: 'fashion',           label: 'Fashion' },
  { id: 'fitness',           label: 'Fitness' },
  { id: 'models',            label: 'Models' },
  { id: 'photography',       label: 'Photography' },
  { id: 'gaming',            label: 'Gaming' },
  { id: 'music',             label: 'Music' },
  { id: 'dance',             label: 'Dance' },
  { id: 'comedy',            label: 'Comedy' },
  { id: 'education',         label: 'Education' },
  { id: 'art',               label: 'Art' },
  { id: 'cooking',           label: 'Cooking' },
  { id: 'travel',            label: 'Travel' },
  { id: 'technology',        label: 'Technology' },
  { id: 'cars',              label: 'Cars' },
  { id: 'luxury',            label: 'Luxury' },
  { id: 'behind-the-scenes', label: 'Behind the Scenes' },
];

const VIDEO_CATEGORIES = [
  { id: 'all',      label: 'All' },
  { id: 'trending', label: 'Trending' },
  { id: 'premium',  label: 'Premium' },
  { id: 'free',     label: 'Free' },
  { id: 'video',    label: 'Video' },
  { id: 'photo',    label: 'Photo' },
  { id: 'audio',    label: 'Audio' },
];

// ─── View mode toggle ─────────────────────────────────────────────────────────

type ViewMode = 'creators' | 'videos';

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <View style={toggleStyles.wrap}>
      <Pressable
        style={[toggleStyles.tab, mode === 'creators' && toggleStyles.tabActive]}
        onPress={() => onChange('creators')}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'creators' }}
      >
        <Users size={14} color={mode === 'creators' ? T.BG : T.TEXT_2} />
        <Text style={[toggleStyles.label, mode === 'creators' && toggleStyles.labelActive]}>
          Creators
        </Text>
      </Pressable>
      <Pressable
        style={[toggleStyles.tab, mode === 'videos' && toggleStyles.tabActive]}
        onPress={() => onChange('videos')}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === 'videos' }}
      >
        <FilmStrip size={14} color={mode === 'videos' ? T.BG : T.TEXT_2} />
        <Text style={[toggleStyles.label, mode === 'videos' && toggleStyles.labelActive]}>
          Videos
        </Text>
      </Pressable>
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.full,
    padding: 3,
    marginHorizontal: 20,
    ...T.SHADOWS.soft,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: T.RADIUS.full,
  },
  tabActive: {
    backgroundColor: T.TEXT,
    ...T.SHADOWS.soft,
  },
  label: {
    color: T.TEXT_2,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
  },
  labelActive: {
    color: T.BG,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function creatorMatchesCategory(creator: Creator, categoryId: string): boolean {
  if (categoryId === 'all') return true;
  if (categoryId === 'trending') return true;
  if (categoryId === 'new') return true;
  if (categoryId === 'premium') return Number(creator.monthlyCredits ?? 0) > 0;
  const cat = String(creator.category ?? '').toLowerCase();
  const normalized = categoryId.replace(/-/g, ' ');
  return cat.includes(normalized) || cat === categoryId;
}

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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('creators');
  const [activeCategory, setActiveCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Context menus
  const [menuCreator, setMenuCreator] = useState<Creator | null>(null);
  const [previewCreator, setPreviewCreator] = useState<CreatorPreviewData | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  // ── Single-load catalog for creators mode ──────────────────────────────────
  const catalogQuery = useLocalExploreCatalog();
  const catalog = catalogQuery.data;

  // ── Infinite feed for videos mode ──────────────────────────────────────────
  const feedQuery = useExploreFeed();

  // Merge all feed pages, deduplicate by id
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

  // ── Video cards ─────────────────────────────────────────────────────────────
  const videoCards = useMemo<VideoCardData[]>(() => {
    const needle = search.trim().toLowerCase();
    return allPreviews
      .map((p) => {
        const creator = findCreatorInFeed(p.creatorId);
        if (!creator) return null;
        const card: VideoCardData = {
          id: p.id,
          title: p.title || 'Untitled',
          duration: p.duration,
          views: p.likes,
          uploadDate: fmtTimeAgo(p.createdAt),
          gradient: p.gradient,
          isPremium: p.isPremium,
          kind: p.kind,
          lockedLabel: p.lockedLabel,
          thumbnailUrl: p.thumbnailUrl,
          creatorId: creator.id,
          creatorName: creator.name,
          creatorHandle: creator.handle,
          creatorInitials: creator.initials,
          creatorIsVerified: creator.isVerified,
          creatorIsOnline: creator.isOnline,
          creatorAvatarUrl: creator.avatarUrl,
        };
        return card;
      })
      .filter((v): v is VideoCardData => {
        if (!v) return false;
        if (activeCategory === 'premium' && !v.isPremium) return false;
        if (activeCategory === 'free' && v.isPremium) return false;
        if (
          activeCategory !== 'all' &&
          activeCategory !== 'premium' &&
          activeCategory !== 'free' &&
          activeCategory !== 'trending'
        ) {
          if (v.kind.toLowerCase() !== activeCategory) return false;
        }
        if (needle && !`${v.title} ${v.creatorName} ${v.kind}`.toLowerCase().includes(needle)) {
          return false;
        }
        return true;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPreviews, allCreators, activeCategory, search]);

  // ── Catalog-mode data ───────────────────────────────────────────────────────
  const catalogCreators    = catalog?.creators ?? [];
  const catalogPreviews    = catalog?.previews ?? [];
  const featuredCreatorIds = catalog?.featuredCreatorIds ?? [];
  const recommendedCreatorIds = catalog?.recommendedCreatorIds ?? [];
  const trendingSearches   = catalog?.trendingSearches ?? ['slow living', 'new creators', 'exclusive'];
  const creditBalance      = Number(catalog?.creditBalance ?? 0);

  const visibleCreators = useMemo(() => {
    if (!catalog) return [];
    const needle = search.trim().toLowerCase();
    return catalogCreators.filter((creator) => {
      const categoryMatch = creatorMatchesCategory(creator, activeCategory);
      const searchMatch =
        !needle ||
        `${creator.name ?? ''} ${creator.handle ?? ''} ${creator.bio ?? ''} ${creator.category ?? ''}`
          .toLowerCase()
          .includes(needle);
      return categoryMatch && searchMatch;
    });
  }, [activeCategory, catalog, catalogCreators, search]);

  const featured = featuredCreatorIds
    .map((id) => catalogCreators.find((c) => c.id === id))
    .filter(Boolean) as Creator[];

  const recommended = recommendedCreatorIds
    .map((id) => catalogCreators.find((c) => c.id === id))
    .filter(Boolean) as Creator[];

  const filteredPreviews = catalogPreviews.filter((preview) => {
    const creator = catalogCreators.find((c) => c.id === preview.creatorId);
    return (
      creator &&
      (activeCategory === 'all' || creatorMatchesCategory(creator, activeCategory))
    );
  });

  // ── Actions ─────────────────────────────────────────────────────────────────
  const openCreator = (creator: Creator) => router.push(`/creator/${creator.id}`);

  const openAvatarPreview = (creator: Creator) => {
    setPreviewCreator(toPreviewData(creator));
    setPreviewVisible(true);
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([catalogQuery.refetch(), feedQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [catalogQuery, feedQuery]);

  const handleModeChange = (m: ViewMode) => {
    setViewMode(m);
    setActiveCategory('all');
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

  const isLoading = viewMode === 'creators' ? catalogQuery.isLoading : feedQuery.isLoading;
  const isError   = viewMode === 'creators' ? catalogQuery.isError   : feedQuery.isError;
  const categories = viewMode === 'videos' ? VIDEO_CATEGORIES : CREATOR_CATEGORIES;

  // ── Shared header rendered above both modes ─────────────────────────────────
  const renderHeader = () => (
    <>
      {/* Search */}
      <View style={styles.searchField}>
        <SearchIcon size={16} color={T.TEXT_2} />
        <MsInput
          value={search}
          onChangeText={setSearch}
          placeholder={
            viewMode === 'videos'
              ? 'Search videos, creators, categories'
              : 'Search creators, categories, content'
          }
          style={styles.searchInput}
          compact
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={10}>
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        )}
      </View>

      {/* Trending tags */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.trendingRow}
      >
        {trendingSearches.map((tag) => (
          <Chip
            key={tag}
            variant="soft"
            color="default"
            size="sm"
            onPress={() => setSearch(tag)}
            style={styles.trendChip}
          >
            <Chip.Label style={styles.trendLabel}>#{tag.replaceAll(' ', '')}</Chip.Label>
          </Chip>
        ))}
      </ScrollView>

      {/* Mode toggle */}
      <ModeToggle mode={viewMode} onChange={handleModeChange} />

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
          onAction={() => {
            catalogQuery.refetch();
            feedQuery.refetch();
          }}
        />
      )}

      {/* Wallet banner + categories — only when data is loaded */}
      {!isLoading && !isError && (
        <>
          <Pressable style={styles.creditBanner} onPress={() => router.push('/wallet')}>
            <View style={styles.creditIcon}>
              <CreditCard size={18} color={T.BG} />
            </View>
            <View style={styles.creditCopy}>
              <Text style={styles.creditEyebrow}>YOUR CREATOR WALLET</Text>
              <Text style={styles.creditBalance}>
                {creditBalance.toLocaleString()}{' '}
                <Text style={styles.creditUnit}>credits</Text>
              </Text>
            </View>
            <View style={styles.creditAction}>
              <Text style={styles.creditActionText}>Top up</Text>
              <CaretRight size={15} color={T.BG} />
            </View>
          </Pressable>

          <View style={styles.categoryHeader}>
            <Text style={styles.sectionTitle}>Browse by category</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {categories.map((category) => {
              const active = category.id === activeCategory;
              return (
                <Chip
                  key={category.id}
                  variant={active ? 'primary' : 'soft'}
                  color="default"
                  size="sm"
                  onPress={() => setActiveCategory(category.id)}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                >
                  <Chip.Label style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                    {category.label}
                  </Chip.Label>
                </Chip>
              );
            })}
          </ScrollView>
        </>
      )}
    </>
  );

  // ── VIDEO MODE — virtualized FlatList ────────────────────────────────────────
  if (viewMode === 'videos') {
    const loadingMore = feedQuery.isFetchingNextPage;

    const handleEndReached = () => {
      if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
        feedQuery.fetchNextPage();
      }
    };

    const renderVideoItem = ({ item }: { item: VideoCardData }) => (
      <MsVideoCard
        video={item}
        onPress={() => {
          if (!item.id) return;
          router.push(`/content/${item.id}`);
        }}
        onCreatorPress={() => {
          if (!item.creatorId) return;
          router.push(`/creator/${item.creatorId}`);
        }}
      />
    );

    const renderEmpty = () => {
      if (isLoading) return null;
      return (
        <MsEmptyState
          title="No videos found"
          message="Try a different filter or check back later for new content."
          actionLabel={activeCategory !== 'all' ? 'Show all' : undefined}
          onAction={activeCategory !== 'all' ? () => setActiveCategory('all') : undefined}
        />
      );
    };

    return (
      <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header */}
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

        <FlatList
          data={videoCards}
          keyExtractor={(item) => item.id}
          renderItem={renderVideoItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreWrap}>
                <ActivityIndicator size="small" color={T.TEXT_2} />
              </View>
            ) : null
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          contentContainerStyle={styles.videoListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.TEXT} />
          }
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={5}
          initialNumToRender={6}
          getItemLayout={(_data, index) => ({
            length: 290,
            offset: 290 * index,
            index,
          })}
        />

        {/* Creator long-press sheet */}
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
          onViewProfile={() => {
            if (previewCreator) router.push(`/creator/${previewCreator.id}`);
          }}
          onSubscribe={() => {
            if (previewCreator) router.push(`/creator/${previewCreator.id}`);
          }}
        />
      </MsAmbientBackground>
    );
  }

  // ── CREATORS MODE — ScrollView ───────────────────────────────────────────────
  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.TEXT} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {renderHeader()}

        {!isLoading && !isError && catalog && (
          <>
            {/* Featured creators */}
            {featured.length > 0 && (
              <>
                <MsSectionHeader
                  title="Featured creators"
                  actionLabel="View all"
                  onAction={() => setActiveCategory('all')}
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

            {/* Recommended */}
            {recommended.length > 0 && (
              <>
                <MsSectionHeader
                  title="Recommended for you"
                  actionLabel="See all"
                  onAction={() => setSearch('')}
                  style={styles.sectionHeader}
                />
                <View>
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

            {/* Premium previews */}
            <MsSectionHeader
              title="Premium previews"
              actionLabel="Latest"
              style={styles.sectionHeader}
            />
            {filteredPreviews.length > 0 ? (
              <View style={styles.previewGrid}>
                {filteredPreviews.map((preview) => {
                  const creator = catalogCreators.find((c) => c.id === preview.creatorId);
                  return creator ? (
                    <MsPreviewCard
                      key={preview.id}
                      preview={preview}
                      creator={creator}
                      onPress={() => router.push(`/content/${preview.id}`)}
                      onLongPress={() => setMenuCreator(creator)}
                    />
                  ) : null;
                })}
              </View>
            ) : (
              <MsEmptyState
                title="Discover creators you'll love"
                message="Try a different category or search to find your next favourite creator."
                actionLabel="Show all"
                onAction={() => setActiveCategory('all')}
              />
            )}

            {/* Collections */}
            <MsSectionHeader
              title="Trending collections"
              actionLabel="Explore all"
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

            {/* Recently joined */}
            <MsSectionHeader
              title="Recently joined"
              actionLabel="Meet the newest"
              style={styles.sectionHeader}
            />
            {visibleCreators.length > 0 ? (
              visibleCreators.slice(-3).map((creator) => (
                <MsRecommendedCreatorRow
                  key={creator.id}
                  creator={creator}
                  onPress={() => openCreator(creator)}
                  onLongPress={() => setMenuCreator(creator)}
                  onAvatarPress={() => openAvatarPreview(creator)}
                />
              ))
            ) : (
              <MsEmptyState
                title="No creators match that search"
                message="Try a trending tag or clear your filters to keep discovering."
                actionLabel="Clear search"
                onAction={() => {
                  setSearch('');
                  setActiveCategory('all');
                }}
              />
            )}
          </>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* Creator long-press action sheet */}
      <MsActionSheet
        visible={!!menuCreator}
        title={menuCreator?.name}
        subtitle={menuCreator?.handle}
        actions={menuCreator ? creatorMenuActions(menuCreator) : []}
        onClose={() => setMenuCreator(null)}
      />

      {/* Creator avatar-tap preview card */}
      <MsCreatorPreview
        visible={previewVisible}
        creator={previewCreator}
        onClose={() => setPreviewVisible(false)}
        onViewProfile={() => {
          if (previewCreator) router.push(`/creator/${previewCreator.id}`);
        }}
        onSubscribe={() => {
          if (previewCreator) router.push(`/creator/${previewCreator.id}`);
        }}
      />
    </MsAmbientBackground>
  );
}

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

  scrollContent: { paddingTop: 16, gap: 0 },

  searchField: {
    marginHorizontal: 20,
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

  trendingRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 13 },
  trendChip: { backgroundColor: T.SURFACE },
  trendLabel: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 11 },

  loadingWrap: { paddingTop: 12 },

  creditBanner: {
    marginHorizontal: 20,
    marginTop: 16,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
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

  categoryHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },
  categoryRow: { paddingHorizontal: 20, gap: 7, paddingVertical: 11 },
  categoryChip: { backgroundColor: T.SURFACE },
  categoryChipActive: { backgroundColor: T.TEXT },
  categoryLabel: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 11 },
  categoryLabelActive: { color: T.BG },

  sectionHeader: { paddingTop: 22, paddingBottom: 11 },
  featuredRow: { gap: 12, paddingHorizontal: 20, paddingBottom: 3 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  collectionRow: { gap: 12, paddingHorizontal: 20 },
  bottomSpace: { height: 24 },

  // Video FlatList
  videoListContent: { paddingTop: 16, paddingBottom: 24 },
  videoItemWrap: { paddingHorizontal: 16, paddingBottom: 16 },
  loadMoreWrap: { paddingVertical: 20, alignItems: 'center' },
});
