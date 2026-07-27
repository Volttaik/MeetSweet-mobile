import React, { useMemo, useState } from 'react';
import {
  Alert,
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
  CaretRight,
  CreditCard,
  FilmStrip,
  MagnifyingGlass as SearchIcon,
  Users,
  Wallet,
} from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import type { Creator } from '@/lib/api-client-react';
import { useLocalExploreCatalog } from '@/services/explore';
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

// ─── Category list ────────────────────────────────────────────────────────────

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
  { id: 'all',       label: 'All' },
  { id: 'trending',  label: 'Trending' },
  { id: 'premium',   label: 'Premium' },
  { id: 'free',      label: 'Free' },
  { id: 'video',     label: 'Video' },
  { id: 'photo',     label: 'Photo' },
  { id: 'audio',     label: 'Audio' },
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
      >
        <Users size={14} color={mode === 'creators' ? T.BG : T.TEXT_2} />
        <Text style={[toggleStyles.label, mode === 'creators' && toggleStyles.labelActive]}>
          Creators
        </Text>
      </Pressable>
      <Pressable
        style={[toggleStyles.tab, mode === 'videos' && toggleStyles.tabActive]}
        onPress={() => onChange('videos')}
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

const UPLOAD_DATES = ['2h ago', '5h ago', '1d ago', '2d ago', '3d ago', '1w ago'];
const VIEW_COUNTS  = ['1.2K', '3.4K', '842', '12.1K', '4.7K', '927', '6.3K', '2.1K'];

function makeVideoCard(
  preview: { id: string; creatorId: string; title: string; kind: string; duration: string; likes: string; isPremium: boolean; gradient: string; lockedLabel: string },
  creator: Creator,
  index: number,
): VideoCardData {
  return {
    id: preview.id,
    title: preview.title,
    duration: preview.duration,
    views: VIEW_COUNTS[index % VIEW_COUNTS.length],
    uploadDate: UPLOAD_DATES[index % UPLOAD_DATES.length],
    gradient: preview.gradient,
    isPremium: preview.isPremium,
    kind: preview.kind,
    lockedLabel: preview.lockedLabel,
    creatorId: creator.id,
    creatorName: creator.name,
    creatorHandle: creator.handle,
    creatorInitials: creator.initials,
    creatorIsVerified: creator.isVerified,
    creatorIsOnline: creator.isOnline,
  };
}

function findCreator(creators: Creator[], id: string) {
  return creators.find((c) => c.id === id);
}

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

// ─── Video Feed ───────────────────────────────────────────────────────────────

function VideoFeed({
  videos,
  onVideoPress,
  onCreatorPress,
}: {
  videos: VideoCardData[];
  onVideoPress: (v: VideoCardData) => void;
  onCreatorPress: (v: VideoCardData) => void;
}) {
  if (videos.length === 0) {
    return (
      <MsEmptyState
        title="No videos found"
        message="Try a different filter or check back later for new content."
      />
    );
  }

  return (
    <View style={feedStyles.wrap}>
      {videos.map((video) => (
        <MsVideoCard
          key={video.id}
          video={video}
          onPress={() => onVideoPress(video)}
          onCreatorPress={() => onCreatorPress(video)}
        />
      ))}
    </View>
  );
}

const feedStyles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});

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

  const query = useLocalExploreCatalog();
  const catalog = query.data;
  const creators = catalog?.creators ?? [];
  const previewsData = catalog?.previews ?? [];
  const featuredCreatorIds = catalog?.featuredCreatorIds ?? [];
  const recommendedCreatorIds = catalog?.recommendedCreatorIds ?? [];
  const trendingSearches = catalog?.trendingSearches ?? ['slow living', 'new creators', 'exclusive'];
  const creditBalance = Number(catalog?.creditBalance ?? 0);

  // ── Creator filtering ──────────────────────────────────────────────────────
  const visibleCreators = useMemo(() => {
    if (!catalog) return [];
    const needle = search.trim().toLowerCase();
    return creators.filter((creator) => {
      const categoryMatch = creatorMatchesCategory(creator, activeCategory);
      const searchMatch =
        !needle ||
        `${creator.name ?? ''} ${creator.handle ?? ''} ${creator.bio ?? ''} ${creator.category ?? ''}`
          .toLowerCase()
          .includes(needle);
      return categoryMatch && searchMatch;
    });
  }, [activeCategory, catalog, creators, search]);

  const featured = featuredCreatorIds
    .map((id) => findCreator(creators, id))
    .filter(Boolean) as Creator[];

  const recommended = recommendedCreatorIds
    .map((id) => findCreator(creators, id))
    .filter(Boolean) as Creator[];

  const previews = previewsData.filter((preview) => {
    const creator = findCreator(creators, preview.creatorId);
    return (
      creator &&
      (activeCategory === 'all' || creatorMatchesCategory(creator, activeCategory))
    );
  });

  // ── Video filtering ────────────────────────────────────────────────────────
  const videoCards = useMemo<VideoCardData[]>(() => {
    if (!catalog) return [];
    const needle = search.trim().toLowerCase();
    return previewsData
      .map((p, i) => {
        const creator = findCreator(creators, p.creatorId);
        if (!creator) return null;
        return makeVideoCard(p, creator, i);
      })
      .filter((v): v is VideoCardData => {
        if (!v) return false;
        if (activeCategory === 'premium' && !v.isPremium) return false;
        if (activeCategory === 'free' && v.isPremium) return false;
        if (activeCategory !== 'all' && activeCategory !== 'premium' && activeCategory !== 'free') {
          if (activeCategory !== 'trending' && v.kind.toLowerCase() !== activeCategory) return false;
        }
        if (needle && !`${v.title} ${v.creatorName} ${v.kind}`.toLowerCase().includes(needle)) return false;
        return true;
      });
  }, [activeCategory, catalog, creators, previewsData, search]);

  const openCreator = (creator: Creator) => router.push(`/creator/${creator.id}`);
  const openAvatarPreview = (creator: Creator) => {
    setPreviewCreator(toPreviewData(creator));
    setPreviewVisible(true);
  };

  const refresh = async () => {
    setRefreshing(true);
    try { await query.refetch(); } finally { setRefreshing(false); }
  };

  // Reset category when switching modes
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
            {
              text: 'Mute',
              onPress: () => Alert.alert('Muted', `${creator.name} has been muted.`),
            },
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

  const categories = viewMode === 'videos' ? VIDEO_CATEGORIES : CREATOR_CATEGORIES;

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ───────────────────────────────────────── */}
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
        {/* ── Search ───────────────────────────────────────── */}
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

        {/* ── Trending tags ─────────────────────────────────── */}
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

        {/* ── Mode toggle ───────────────────────────────────── */}
        <ModeToggle mode={viewMode} onChange={handleModeChange} />

        {/* ── Loading ───────────────────────────────────────── */}
        {query.isLoading && (
          <View style={styles.loadingWrap}>
            <MsCatalogSkeleton />
          </View>
        )}

        {/* ── Error ─────────────────────────────────────────── */}
        {query.isError && (
          <MsEmptyState
            title="Explore is taking a moment"
            message="We couldn't load content. Pull down to try again."
            actionLabel="Retry"
            onAction={() => query.refetch()}
          />
        )}

        {/* ── Content ───────────────────────────────────────── */}
        {!query.isLoading && !query.isError && catalog && (
          <>
            {/* Wallet banner */}
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
                <CaretRight size={15} color={T.TEXT} />
              </View>
            </Pressable>

            {/* Categories */}
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

            {/* ═══════ VIDEO FEED MODE ═══════ */}
            {viewMode === 'videos' && (
              <>
                <MsSectionHeader
                  title="Video Feed"
                  style={styles.sectionHeader}
                />
                <VideoFeed
                  videos={videoCards}
                  onVideoPress={(v) => router.push(`/content/${v.id}`)}
                  onCreatorPress={(v) => router.push(`/creator/${v.creatorId}`)}
                />
              </>
            )}

            {/* ═══════ CREATORS MODE ═══════ */}
            {viewMode === 'creators' && (
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
                {previews.length > 0 ? (
                  <View style={styles.previewGrid}>
                    {previews.map((preview) => {
                      const creator = findCreator(catalog.creators, preview.creatorId);
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
          </>
        )}
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
    backgroundColor: T.TEXT,
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
});
