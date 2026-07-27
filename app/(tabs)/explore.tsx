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
  FilmStrip,
  Images,
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
import { Chip } from 'heroui-native';
import MsInput from '@/components/MsInput';
import {
  MsCatalogSkeleton,
  MsCollectionCard,
  MsFeaturedCreatorCard,
  MsRecommendedCreatorRow,
  MsPreviewCard,
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
// Half-width image cards: 12px outer padding each side, 10px gap between the two
const CREATOR_IMG_WIDTH = Math.floor((SCREEN_WIDTH - 24 - 10) / 2);

// ─── Category lists ────────────────────────────────────────────────────────────

const CREATOR_CATEGORIES = [
  { id: 'all',               label: 'All' },
  { id: 'trending',          label: 'Trending' },
  { id: 'new',               label: 'New' },
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

const CONTENT_CATEGORIES = [
  { id: 'all',      label: 'All' },
  { id: 'trending', label: 'Trending' },
  { id: 'premium',  label: 'Premium' },
  { id: 'free',     label: 'Free' },
  { id: 'video',    label: 'Video' },
  { id: 'photo',    label: 'Photo' },
  { id: 'audio',    label: 'Audio' },
];

const ALBUM_CATEGORIES = [
  { id: 'all',      label: 'All' },
  { id: 'premium',  label: 'Premium' },
  { id: 'free',     label: 'Free' },
  { id: 'trending', label: 'Trending' },
];

// ─── View mode toggle ─────────────────────────────────────────────────────────

type ViewMode = 'creators' | 'content' | 'albums';

function DiscoveryHubLinks() {
  const links = [
    { label: 'Posts', detail: 'Photos & carousels', icon: '▦', route: '/(tabs)/index' as const },
    { label: 'Videos', detail: 'Long-form watching', icon: '▶', route: '/videos' as const },
    { label: 'Shorts', detail: 'Swipe to discover', icon: '↕', route: '/shorts' as const },
    { label: 'Albums', detail: 'Curated collections', icon: '▧', route: null },
  ];
  return (
    <View style={hubStyles.wrap}>
      <Text style={hubStyles.eyebrow}>DISCOVERY HUB</Text>
      <Text style={hubStyles.title}>Choose your experience</Text>
      <Text style={hubStyles.copy}>Posts, long-form videos, Shorts, albums, and creators each have their own way to explore.</Text>
      <View style={hubStyles.grid}>
        {links.map((link) => (
          <Pressable
            key={link.label}
            style={hubStyles.card}
            onPress={() => link.route ? router.push(link.route as any) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Explore ${link.label}`}
          >
            <Text style={hubStyles.icon}>{link.icon}</Text>
            <Text style={hubStyles.label}>{link.label}</Text>
            <Text style={hubStyles.detail}>{link.detail}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const tabs: { id: ViewMode; label: string; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
    { id: 'creators', label: 'Creators', Icon: Users },
    { id: 'content',  label: 'Feed',     Icon: FilmStrip },
    { id: 'albums',   label: 'Albums',   Icon: Images },
  ];

  return (
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
    gap: 5,
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
    fontSize: 12,
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

// ─── Shared header component ───────────────────────────────────────────────────

interface HeaderProps {
  search: string;
  onSearchChange: (v: string) => void;
  trendingSearches: string[];
  onTrendingPress: (t: string) => void;
  viewMode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  activeCategory: string;
  onCategoryChange: (c: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  creditBalance: number;
  categories: typeof CREATOR_CATEGORIES;
}

function ExploreHeader({
  search,
  onSearchChange,
  trendingSearches,
  onTrendingPress,
  viewMode,
  onModeChange,
  activeCategory,
  onCategoryChange,
  isLoading,
  isError,
  onRetry,
  creditBalance,
  categories,
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
              : viewMode === 'content'
              ? 'Search videos, images, creators'
              : 'Search creators, categories, content'
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
            onPress={() => onTrendingPress(tag)}
            style={styles.trendChip}
          >
            <Chip.Label style={styles.trendLabel}>#{tag.replaceAll(' ', '')}</Chip.Label>
          </Chip>
        ))}
      </ScrollView>

      {/* Mode toggle */}
      <ModeToggle mode={viewMode} onChange={onModeChange} />

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

      {/* Wallet banner + categories */}
      {!isLoading && !isError && (
        <>
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
                  onPress={() => onCategoryChange(category.id)}
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
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('creators');
  const [activeCategory, setActiveCategory] = useState('all');
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

      if (activeCategory === 'premium' && !p.isPremium) continue;
      if (activeCategory === 'free' && p.isPremium) continue;
      if (
        activeCategory !== 'all' &&
        activeCategory !== 'premium' &&
        activeCategory !== 'free' &&
        activeCategory !== 'trending'
      ) {
        if (p.kind.toLowerCase() !== activeCategory) continue;
      }

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
        // Images — never get video UI, play buttons, or video metadata
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

      // After every 5th item, inject a horizontal album row (2 albums)
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
  }, [allPreviews, allCreators, activeCategory, search, albumsQuery.data]);

  // ── Catalog-mode data ─────────────────────────────────────────────────────────
  const catalogCreators       = catalog?.creators ?? [];
  const catalogPreviews       = catalog?.previews ?? [];
  const featuredCreatorIds    = catalog?.featuredCreatorIds ?? [];
  const recommendedCreatorIds = catalog?.recommendedCreatorIds ?? [];
  const trendingSearches      = catalog?.trendingSearches ?? ['slow living', 'new creators', 'exclusive'];
  const creditBalance         = Number(catalog?.creditBalance ?? 0);

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

  // ── Albums mode data ──────────────────────────────────────────────────────────
  const allAlbums = albumsQuery.data ?? [];
  const visibleAlbums = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allAlbums.filter((a) => {
      if (activeCategory === 'premium' && !a.isPremium) return false;
      if (activeCategory === 'free' && a.isPremium) return false;
      if (needle) {
        const text = `${a.title} ${a.creatorName} ${a.description}`.toLowerCase();
        return text.includes(needle);
      }
      return true;
    });
  }, [allAlbums, activeCategory, search]);

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

  const isLoading =
    viewMode === 'creators' ? catalogQuery.isLoading
    : viewMode === 'albums'  ? albumsQuery.isLoading
    : feedQuery.isLoading;

  const isError =
    viewMode === 'creators' ? catalogQuery.isError
    : viewMode === 'albums'  ? albumsQuery.isError
    : feedQuery.isError;

  const categories =
    viewMode === 'creators' ? CREATOR_CATEGORIES
    : viewMode === 'albums'  ? ALBUM_CATEGORIES
    : CONTENT_CATEGORIES;

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
    trendingSearches,
    onTrendingPress: setSearch,
    viewMode,
    onModeChange: handleModeChange,
    activeCategory,
    onCategoryChange: setActiveCategory,
    isLoading,
    isError,
    onRetry: () => { catalogQuery.refetch(); feedQuery.refetch(); albumsQuery.refetch(); },
    creditBalance,
    categories,
  };

  // ── CONTENT MODE — mixed FlatList ─────────────────────────────────────────────
  if (viewMode === 'content') {
    const loadingMore = feedQuery.isFetchingNextPage;

    const handleEndReached = () => {
      if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
        feedQuery.fetchNextPage();
      }
    };

    const renderFeedItem = ({ item }: { item: FeedItem }) => {
      if (item.type === 'image') {
        return (
          // Image card: 16px horizontal breathing room — photographs need space
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
          // Video card: 12px horizontal padding — wider cinematic presentation
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
                message="Try a different filter or check back later for new content."
                actionLabel={activeCategory !== 'all' ? 'Show all' : undefined}
                onAction={activeCategory !== 'all' ? () => setActiveCategory('all') : undefined}
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
                    ? 'Try clearing your search or filter.'
                    : 'Albums are curated collections from your favourite creators.'
                }
                actionLabel={search || activeCategory !== 'all' ? 'Clear filters' : undefined}
                onAction={() => { setSearch(''); setActiveCategory('all'); }}
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

  // ── CREATORS MODE — ScrollView ────────────────────────────────────────────────
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
            <DiscoveryHubLinks />
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
                  actionLabel="See all"
                  onAction={() => setSearch('')}
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

            {/* Trending collections */}
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
              <View style={styles.recommendedWrap}>
                {visibleCreators.slice(-3).map((creator) => (
                  <MsRecommendedCreatorRow
                    key={creator.id}
                    creator={creator}
                    onPress={() => openCreator(creator)}
                    onLongPress={() => setMenuCreator(creator)}
                    onAvatarPress={() => openAvatarPreview(creator)}
                  />
                ))}
              </View>
            ) : (
              <MsEmptyState
                title="No creators match that search"
                message="Try a trending tag or clear your filters to keep discovering."
                actionLabel="Clear search"
                onAction={() => { setSearch(''); setActiveCategory('all'); }}
              />
            )}
          </>
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

  sectionHeader: { paddingTop: 24, paddingBottom: 12 },
  featuredRow: { gap: 12, paddingHorizontal: 20, paddingBottom: 3 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  collectionRow: { gap: 12, paddingHorizontal: 20 },
  recommendedWrap: { backgroundColor: T.SURFACE, marginHorizontal: 20, borderRadius: T.RADIUS.xl, overflow: 'hidden', ...T.SHADOWS.soft },
  bottomSpace: { height: 28 },

  // Feed list
  feedItemWrap:  { paddingHorizontal: 16, paddingBottom: 16 },
  // Video cards get a bit more width — 12px each side instead of 16
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

  // Album highlight row in creators mode — wider cards, more breathing room
  albumHighlightCard: { width: SCREEN_WIDTH - 72 },

  // Loading more
  loadMoreWrap: { paddingVertical: 20, alignItems: 'center' },
});

const hubStyles = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginTop: 6, marginBottom: 8, padding: 16, borderRadius: T.RADIUS.xl, backgroundColor: T.SURFACE, ...T.SHADOWS.soft },
  eyebrow: { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 9, letterSpacing: 1.3 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 18, marginTop: 4 },
  copy: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, lineHeight: 18, marginTop: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  card: { width: '48%', minHeight: 78, padding: 11, borderRadius: T.RADIUS.lg, backgroundColor: T.SURFACE_2 },
  icon: { color: T.ACCENT, fontFamily: T.FONT.bold, fontSize: 16 },
  label: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13, marginTop: 5 },
  detail: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10, marginTop: 2 },
});
