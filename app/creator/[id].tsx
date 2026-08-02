import React, { useRef, useMemo, useState, useEffect } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CaretRight,
  Check,
  Clock,
  Lock,
  Play,
  Sparkle,
  Star,
  Users,
} from 'phosphor-react-native';
import { blockUser, reportUser, followUser, unfollowUser } from '@/services/users';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { TIER_PRICES, type SubscriptionTier, subscribeTier } from '@/services/subscriptions';
import { Spinner } from 'heroui-native';
import type { Creator } from '@/lib/api-client-react';
import { useLocalExploreCatalog } from '@/services/explore';
import { useCreatorReviews, type CreatorReview } from '@/services/creators';
import { getUser } from '@/services/users';
import { useAuth } from '@/contexts/AuthContext';
import { getPostsByCreator, type Post } from '@/services/posts';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsFeedVideoCard, type MsFeedVideoCardData } from '@/components/MsFeedVideoCard';
import { ExploreImageCard, type ExploreImageCardData } from '@/components/ExploreImageCard';
import { T } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function fmtTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name ?? '??').substring(0, 2).toUpperCase();
}

// ─── Star display ─────────────────────────────────────────────────────────────

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color={n <= Math.round(rating) ? '#FFB800' : T.BORDER_2}
          weight={n <= Math.round(rating) ? 'fill' : 'regular'}
        />
      ))}
    </View>
  );
}

// ─── Review card (real data) ──────────────────────────────────────────────────

function ReviewCard({ review }: { review: CreatorReview }) {
  const displayName =
    review.reviewer_display_name?.trim() || review.reviewer_username || 'Subscriber';
  const reviewInitials = initials(displayName);
  const dateLabel = fmtTimeAgo(review.created_at);

  return (
    <View style={revStyles.card}>
      <View style={revStyles.header}>
        <View style={revStyles.avatar}>
          <Text style={revStyles.avatarInitial}>{reviewInitials}</Text>
        </View>
        <View style={revStyles.meta}>
          <Text style={revStyles.name}>{displayName}</Text>
          {dateLabel ? <Text style={revStyles.date}>{dateLabel}</Text> : null}
        </View>
        <StarRow rating={review.rating} size={13} />
      </View>
      {review.body ? <Text style={revStyles.body}>{review.body}</Text> : null}
    </View>
  );
}

const revStyles = StyleSheet.create({
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER,
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 12, fontFamily: T.FONT.bold, color: T.TEXT_2 },
  meta: { flex: 1 },
  name: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  date: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 1 },
  body: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, lineHeight: 20 },
});

// ─── Subscribe sheet ──────────────────────────────────────────────────────────

const SUBSCRIBE_TIERS: { tier: SubscriptionTier; label: string; price: number; color: string; desc: string }[] = [
  { tier: 'normal',  label: 'Normal',  price: TIER_PRICES.normal,  color: '#4B9EFF', desc: 'Full premium feed' },
  { tier: 'premium', label: 'Premium', price: TIER_PRICES.premium, color: '#FFB800', desc: 'Exclusive drops' },
  { tier: 'vip',     label: 'VIP',     price: TIER_PRICES.vip,     color: '#C45A72', desc: 'All access + DMs' },
];

function SubscribeSheet({
  visible,
  creator,
  walletBalance,
  onConfirm,
  onWallet,
  onClose,
}: {
  visible: boolean;
  creator: Creator;
  walletBalance: number;
  onConfirm: (tier: SubscriptionTier) => void;
  onWallet: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('normal');
  const price = TIER_PRICES[selectedTier];
  const canAfford = walletBalance >= price;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={shStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[shStyles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={shStyles.handle} />
          <Text style={shStyles.title}>Subscribe to {creator.name}</Text>
          <Text style={shStyles.subtitle}>Choose a tier to unlock their content</Text>

          {/* Tier cards */}
          <View style={shStyles.tierRow}>
            {SUBSCRIBE_TIERS.map(({ tier, label, price: p, color, desc }) => {
              const active = selectedTier === tier;
              return (
                <TouchableOpacity
                  key={tier}
                  style={[shStyles.tierCard, active && { borderColor: color }]}
                  onPress={() => setSelectedTier(tier)}
                  activeOpacity={0.8}
                >
                  <Text style={[shStyles.tierLabel, active && { color }]}>{label}</Text>
                  <Text style={[shStyles.tierPrice, active && { color }]}>₦{p}</Text>
                  <Text style={shStyles.tierDesc}>{desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Wallet balance */}
          <View style={shStyles.walletRow}>
            <Text style={shStyles.walletLabel}>Wallet balance</Text>
            <Text style={[shStyles.walletAmt, !canAfford && { color: T.ERROR }]}>
              ₦{walletBalance.toLocaleString()}
            </Text>
          </View>

          <TouchableOpacity
            style={[shStyles.primaryBtn, !canAfford && shStyles.primaryBtnOutline]}
            activeOpacity={0.85}
            onPress={canAfford ? () => onConfirm(selectedTier) : onWallet}
          >
            <Text style={[shStyles.primaryLabel, !canAfford && { color: T.ACCENT }]}>
              {canAfford ? `Subscribe · ₦${price.toLocaleString()}` : 'Top up wallet'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={shStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={shStyles.cancelLabel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const shStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, gap: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 4,
  },
  title: { fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT, textAlign: 'center', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center', marginTop: -4 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierCard: {
    flex: 1, borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderWidth: 2, borderColor: 'transparent',
    padding: 10, alignItems: 'center', gap: 2,
  },
  tierLabel: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  tierPrice: { fontSize: 16, fontFamily: T.FONT.bold, color: T.TEXT },
  tierDesc: { fontSize: 10, fontFamily: T.FONT.regular, color: T.TEXT_3, textAlign: 'center', marginTop: 2 },
  walletRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 4, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: T.BORDER,
  },
  walletLabel: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  walletAmt: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  primaryBtn: {
    height: 52, borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnOutline: {
    backgroundColor: T.SURFACE_2,
    borderWidth: 1.5, borderColor: T.ACCENT,
  },
  primaryLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'drops' | 'reviews' | 'about';

export default function CreatorProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('drops');
  const [refreshing, setRefreshing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // ── Data sources ─────────────────────────────────────────────────────────────
  // 1. Explore catalog: gives us the basic creator shell (name, handle, avatar)
  //    derived from the posts feed.  Used as a fast-path while the profile loads.
  const catalogQuery  = useLocalExploreCatalog();
  // Reviews: backend has no /creators/:id/reviews — always empty
  const reviewsQuery  = useCreatorReviews(id);

  // Real profile: GET /api/users/:username
  // Real posts:   GET /api/posts?creator_id=:id
  const [realProfile, setRealProfile] = useState<{ name: string; username: string; bio?: string | null; avatarUrl?: string | null; bannerUrl?: string | null; followerCount?: number; isVerified?: boolean } | null>(null);
  const [creatorPosts, setCreatorPosts] = useState<Post[]>([]);

  // Catalog lookup: try by UUID (from explore), then by username/handle (from post navigation)
  const catalogCreator = useMemo(() => {
    if (!catalogQuery.data) return null;
    return (
      catalogQuery.data.creators?.find((c) => c.id === id) ??
      catalogQuery.data.creators?.find((c) => c.handle === `@${id}`) ??
      null
    );
  }, [id, catalogQuery.data]);

  // Username for API: from catalog handle (strip @), or treat id as username
  const username = catalogCreator?.handle?.replace('@', '') ?? id;

  useEffect(() => {
    if (!username) return;
    getUser(username)
      .then(({ user }) => {
        setRealProfile({
          name:         user.name ?? '',
          username:     user.username ?? '',
          bio:          user.bio ?? null,
          avatarUrl:    user.avatarUrl ?? null,
          bannerUrl:    user.bannerUrl ?? null,
          followerCount: user.followerCount ?? 0,
          isVerified:   user.isVerified ?? false,
        });
      })
      .catch(() => {});
  }, [username]);

  // Fetch real posts by this creator. Use the UUID from catalog if available;
  // fall back to the id param (may already be a UUID for logged-in creators).
  const creatorUUID = catalogCreator?.id ?? id;
  useEffect(() => {
    if (!creatorUUID) return;
    getPostsByCreator(creatorUUID)
      .then(({ posts }) => setCreatorPosts(posts))
      .catch(() => {});
  }, [creatorUUID]);

  /**
   * Map backend posts → the preview shape expected by the Drops tab cards.
   * Derived directly from real backend data — no placeholder content.
   */
  const creatorPreviews = useMemo(() => creatorPosts.map((post) => ({
    id:           post.id,
    creatorId:    creatorUUID ?? id ?? '',
    title:        post.caption || '',
    category:     '',
    kind:         post.mediaType === 'video' ? 'video' : 'photo' as string,
    contentType:  post.contentType,
    duration:     '',
    likes:        String(post.likeCount),
    isPremium:    post.isPremium,
    lockedLabel:  post.priceCredits ? `${post.priceCredits} credits` : 'Locked',
    thumbnailUrl: post.thumbnailUrl ?? null,
    mediaUrl:     post.mediaUrl ?? null,
    createdAt:    post.createdAt,
    commentCount: post.commentCount,
    gradient:     'violet',
  })), [creatorPosts, creatorUUID, id]);

  /**
   * Merge the explore-catalog shell with the real profile data.
   */
  const creator: Creator | null = useMemo(() => {
    if (!catalogCreator && !realProfile) return null;
    const base = catalogCreator;
    const profile = realProfile;

    const resolvedName     = profile?.name?.trim() || base?.name || 'Creator';
    const resolvedHandle   = base?.handle || (profile?.username ? `@${profile.username}` : '');
    const resolvedInitials = initials(resolvedName);
    const resolvedBio      = profile?.bio ?? base?.bio ?? '';
    const resolvedFollowers = profile
      ? fmtCount(profile.followerCount ?? 0)
      : (base?.followers ?? '');
    const resolvedIsVerified = profile?.isVerified ?? base?.isVerified ?? false;

    return {
      id: id!,
      name:            resolvedName,
      handle:          resolvedHandle,
      initials:        resolvedInitials,
      bio:             resolvedBio,
      category:        base?.category ?? '',
      followers:       resolvedFollowers,
      subscriberCount: base?.subscriberCount ?? 0,
      monthlyCredits:  base?.monthlyCredits ?? 0,
      isVerified:      resolvedIsVerified,
      isOnline:        base?.isOnline ?? false,
      gradient:        base?.gradient ?? 'violet',
      avatarUrl:       profile?.avatarUrl ?? base?.avatarUrl,
      bannerUrl:       profile?.bannerUrl ?? base?.bannerUrl,
    };
  }, [id, catalogCreator, realProfile]);

  const walletBalance = useWalletBalance();

  // Reviews (always empty — backend has no reviews endpoint)
  const reviews      = reviewsQuery.data?.reviews ?? [];
  const totalReviews = reviewsQuery.data?.total ?? 0;
  const avgRating    = reviewsQuery.data?.average_rating ?? null;

  // ── Refresh ───────────────────────────────────────────────────────────────────
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        catalogQuery.refetch(),
        getUser(username).then(({ user }) => setRealProfile({
          name: user.name, username: user.username, bio: user.bio,
          avatarUrl: user.avatarUrl, bannerUrl: user.bannerUrl,
          followerCount: user.followerCount, isVerified: user.isVerified,
        })).catch(() => {}),
        getPostsByCreator(creatorUUID).then(({ posts }) => setCreatorPosts(posts)).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  const isInitialLoading = catalogQuery.isLoading && !catalogCreator && !realProfile;

  if (isInitialLoading) {
    return <View style={styles.center}><Spinner color="default" size="lg" /></View>;
  }

  if ((catalogQuery.isError && !catalogCreator && !realProfile) || (!creator && !catalogQuery.isLoading)) {
    return (
      <View style={styles.center}>
        <MsEmptyState
          title="Creator not found"
          message="This profile may have moved. Head back to Explore to keep discovering."
          actionLabel="Back to Explore"
          onAction={() => router.replace('/(tabs)/explore')}
        />
      </View>
    );
  }

  if (!creator) {
    return <View style={styles.center}><Spinner color="default" size="lg" /></View>;
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'drops',   label: `Drops (${creatorPosts.length})` },
    { key: 'reviews', label: `Reviews (${reviewsQuery.isLoading ? '…' : totalReviews})` },
    { key: 'about',   label: 'About' },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Creator profile</Text>
        <Pressable style={styles.moreButton} onPress={() => setMoreSheetOpen(true)}>
          <Sparkle size={17} color={T.TEXT_2} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.TEXT} />
        }
      >
        {/* Hero */}
        <View style={styles.profileHero}>
          <View style={styles.avatarWrap}>
            <MsAvatar
              size={84}
              initials={creator.initials}
              showOnline={creator.isOnline}
              imageUri={creator.avatarUrl ?? undefined}
            />
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{creator.name}</Text>
            {creator.isVerified && <Check size={16} color={T.ACCENT} />}
          </View>
          <Text style={styles.handle}>
            {creator.handle}
            {creator.category ? ` · ${creator.category}` : ''}
          </Text>

          {/* Rating summary — only shown when the backend returns real data */}
          {avgRating != null && (
            <View style={styles.ratingRow}>
              <StarRow rating={avgRating} size={15} />
              <Text style={styles.ratingText}>
                {avgRating.toFixed(1)} ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
              </Text>
            </View>
          )}

          {creator.bio ? <Text style={styles.bio}>{creator.bio}</Text> : null}

          {/* Metrics */}
          <View style={styles.metrics}>
            <View>
              <Text style={styles.metricValue}>{creator.followers || '—'}</Text>
              <Text style={styles.metricLabel}>Followers</Text>
            </View>
            <View style={styles.metricDivider} />
            <View>
              <Text style={styles.metricValue}>{creator.subscriberCount > 0 ? fmtCount(creator.subscriberCount) : '—'}</Text>
              <Text style={styles.metricLabel}>Subscribers</Text>
            </View>
            <View style={styles.metricDivider} />
            <View>
              <Text style={styles.metricValue}>{creatorPreviews.length}</Text>
              <Text style={styles.metricLabel}>Drops</Text>
            </View>
          </View>

          {/* Follow button (shown when viewing another user's profile) */}
          {currentUser && currentUser.username !== (realProfile?.username ?? id) && (
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followButtonActive]}
              onPress={async () => {
                if (followLoading) return;
                setFollowLoading(true);
                const target = realProfile?.username ?? id;
                try {
                  if (isFollowing) {
                    await unfollowUser(target);
                    setIsFollowing(false);
                    setRealProfile((p) => p ? { ...p, followerCount: Math.max(0, (p.followerCount ?? 1) - 1) } : p);
                  } else {
                    await followUser(target);
                    setIsFollowing(true);
                    setRealProfile((p) => p ? { ...p, followerCount: (p.followerCount ?? 0) + 1 } : p);
                  }
                } catch {
                  /* revert silently */
                  setIsFollowing((f) => !f);
                } finally {
                  setFollowLoading(false);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.followBtnLabel, isFollowing && styles.followBtnLabelActive]}>
                {followLoading ? '…' : (isFollowing ? 'Following' : 'Follow')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Subscribe button */}
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => setSheetOpen(true)}
            activeOpacity={0.85}
          >
            <Lock size={16} color={T.BG} />
            <Text style={styles.subscribeBtnLabel}>Subscribe</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs ── */}
        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab content ── */}
        {activeTab === 'drops' && (
          <View style={styles.tabContent}>
            {creatorPreviews.length > 0 ? (
              <View style={styles.dropsGrid}>
                {creatorPreviews.map((preview) => {
                  const creatorBase = {
                    creatorId:         creator.id,
                    creatorName:       creator.name,
                    creatorHandle:     creator.handle,
                    creatorInitials:   creator.initials,
                    creatorIsVerified: creator.isVerified ?? false,
                    creatorIsOnline:   creator.isOnline  ?? false,
                    creatorAvatarUrl:  creator.avatarUrl ?? null,
                  };
                  const uploadDate = fmtTimeAgo(preview.createdAt ?? null);
                  const comments   = String(preview.commentCount ?? 0);

                  if (preview.kind === 'video' || preview.kind === 'audio') {
                    const card: MsFeedVideoCardData = {
                      id:           preview.id,
                      title:        preview.title || 'Untitled',
                      duration:     preview.duration,
                      likes:        preview.likes,
                      comments,
                      uploadDate,
                      gradient:     preview.gradient,
                      isPremium:    preview.isPremium,
                      kind:         preview.kind,
                      lockedLabel:  preview.lockedLabel,
                      thumbnailUrl: preview.thumbnailUrl ?? null,
                      mediaUrl:     preview.isPremium ? null : (preview.mediaUrl ?? null),
                      ...creatorBase,
                    };
                    const navToVideo = () => {
                      if (preview.contentType === 'short') {
                        router.push({ pathname: '/shorts', params: { startId: preview.id } });
                      } else {
                        router.push(`/videos/${preview.id}`);
                      }
                    };
                    return (
                      <MsFeedVideoCard
                        key={preview.id}
                        card={card}
                        onPress={navToVideo}
                        onCreatorPress={() => undefined}
                        onUnlockPress={navToVideo}
                      />
                    );
                  }

                  const imgCard: ExploreImageCardData = {
                    id:           preview.id,
                    caption:      preview.title || '',
                    likes:        preview.likes,
                    comments,
                    uploadDate,
                    isPremium:    preview.isPremium,
                    lockedLabel:  preview.lockedLabel,
                    imageUrl:     preview.thumbnailUrl ?? preview.mediaUrl ?? null,
                    gradient:     preview.gradient,
                    ...creatorBase,
                  };
                  return (
                    <ExploreImageCard
                      key={preview.id}
                      card={imgCard}
                      onPress={() => router.push(`/content/${preview.id}`)}
                      onCreatorPress={() => undefined}
                      onUnlockPress={() => router.push(`/content/${preview.id}`)}
                    />
                  );
                })}
              </View>
            ) : (
              <MsEmptyState
                title="No drops yet"
                message="This creator hasn't published any premium content yet."
              />
            )}
          </View>
        )}

        {activeTab === 'reviews' && (
          <View style={styles.tabContent}>
            {reviewsQuery.isLoading ? (
              <View style={styles.reviewLoading}>
                <Spinner color="default" size="sm" />
              </View>
            ) : reviews.length > 0 ? (
              <>
                {/* Rating summary card */}
                {avgRating != null && (
                  <View style={styles.ratingCard}>
                    <Text style={styles.ratingBig}>{avgRating.toFixed(1)}</Text>
                    <StarRow rating={avgRating} size={20} />
                    <Text style={styles.ratingCardSub}>
                      {totalReviews} subscriber {totalReviews === 1 ? 'review' : 'reviews'}
                    </Text>
                  </View>
                )}
                {reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </>
            ) : (
              <MsEmptyState
                title="No reviews yet"
                message="Subscribers haven't left reviews for this creator yet."
              />
            )}
          </View>
        )}

        {activeTab === 'about' && (
          <View style={styles.tabContent}>
            <View style={styles.aboutCard}>
              <Users size={18} color={T.TEXT_2} />
              <View style={styles.aboutCopy}>
                <Text style={styles.aboutTitle}>A closer connection</Text>
                <Text style={styles.aboutText}>
                  Subscribe for the full feed, private drops, and monthly creator notes.
                </Text>
              </View>
              <CaretRight size={17} color={T.TEXT_3} />
            </View>

            <View style={styles.infoCard}>
              {creator.category ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Category</Text>
                    <Text style={styles.infoValue}>{creator.category}</Text>
                  </View>
                  <View style={styles.infoDivider} />
                </>
              ) : null}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Subscription</Text>
                <Text style={styles.infoValue}>From ₦{TIER_PRICES.normal}/mo</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Availability</Text>
                <View style={styles.onlineRow}>
                  <View style={[styles.onlineDot, { backgroundColor: creator.isOnline ? T.SUCCESS : T.TEXT_3 }]} />
                  <Text style={styles.infoValue}>{creator.isOnline ? 'Online now' : 'Offline'}</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Verified</Text>
                <Text style={styles.infoValue}>{creator.isVerified ? '✓ Verified creator' : 'Not verified'}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 35 }} />
      </ScrollView>

      {/* Subscribe sheet */}
      <SubscribeSheet
        visible={sheetOpen}
        creator={creator}
        walletBalance={walletBalance}
        onConfirm={async (selectedTier) => {
          setSheetOpen(false);
          try {
            await subscribeTier(creator.id, selectedTier);
            Alert.alert('Subscribed!', `You are now subscribed to ${creator.name} on the ${selectedTier} tier.`);
          } catch (err) {
            Alert.alert('Subscription failed', (err as Error).message ?? 'Please try again.');
          }
        }}
        onWallet={() => { setSheetOpen(false); router.push('/wallet'); }}
        onClose={() => setSheetOpen(false)}
      />

      {/* More (sparkle) action sheet */}
      <MsActionSheet
        visible={moreSheetOpen}
        title={creator.name}
        subtitle={creator.handle}
        actions={[
          {
            label: 'Copy Username',
            onPress: async () => {
              setMoreSheetOpen(false);
              await Clipboard.setStringAsync(creator.handle);
              Alert.alert('Copied', `${creator.handle} copied to clipboard.`);
            },
          },
          {
            label: 'Share Profile',
            onPress: async () => {
              setMoreSheetOpen(false);
              await Share.share({
                title: creator.name,
                message: `Check out ${creator.name} ${creator.handle} on MeetSweet!`,
              });
            },
          },
          {
            label: 'Report',
            onPress: () => {
              setMoreSheetOpen(false);
              Alert.alert(
                'Report Creator',
                'Are you sure you want to report this creator?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Report',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await reportUser(creator.handle.replace('@', ''), 'inappropriate_content');
                        Alert.alert('Reported', 'Thank you. We will review this profile.');
                      } catch {
                        Alert.alert('Error', 'Could not submit report. Please try again.');
                      }
                    },
                  },
                ],
              );
            },
          },
          {
            label: 'Block',
            destructive: true,
            onPress: () => {
              setMoreSheetOpen(false);
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
                        router.back();
                      } catch {
                        Alert.alert('Error', 'Could not block this user. Please try again.');
                      }
                    },
                  },
                ],
              );
            },
          },
        ] satisfies ActionItem[]}
        onClose={() => setMoreSheetOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    height: 62, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
  },
  moreButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15,
  },

  content: { paddingBottom: 35 },

  profileHero: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 28 },
  avatarWrap: { marginBottom: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 24, letterSpacing: -0.6 },
  handle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 4 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ratingText: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },

  bio: {
    color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 20,
    textAlign: 'center', marginTop: 14, maxWidth: 320,
  },
  metrics: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 25, paddingVertical: 16,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.BORDER,
  },
  metricValue: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16, textAlign: 'center' },
  metricLabel: {
    color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 9,
    textAlign: 'center', marginTop: 3, letterSpacing: 0.3,
  },
  metricDivider: { width: 1, height: 24, backgroundColor: T.BORDER_2 },

  followButton: {
    width: '100%', marginTop: 14, height: 44,
    borderRadius: T.RADIUS.full, backgroundColor: T.SURFACE,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  followButtonActive: { backgroundColor: T.ACCENT_LIGHT },
  followBtnLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  followBtnLabelActive: { color: T.ACCENT },

  subscribeButton: {
    width: '100%', marginTop: 10, height: 52,
    borderRadius: T.RADIUS.full, backgroundColor: T.ACCENT,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  subscribeBtnLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
    marginTop: 28,
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: T.ACCENT },
  tabLabel: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  tabLabelActive: { color: T.ACCENT, fontFamily: T.FONT.semibold },

  tabContent: { padding: 20 },

  // Drops
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Reviews
  reviewLoading: { alignItems: 'center', paddingVertical: 40 },
  ratingCard: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg, borderWidth: 1, borderColor: T.BORDER,
    padding: 20, alignItems: 'center', gap: 8, marginBottom: 16,
  },
  ratingBig: { fontSize: 48, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -2 },
  ratingCardSub: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 4 },

  // About
  aboutCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE, borderWidth: 1, borderColor: T.BORDER,
    marginBottom: 12,
  },
  aboutCopy: { flex: 1 },
  aboutTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12 },
  aboutText: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, lineHeight: 17, marginTop: 3 },

  infoCard: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg, borderWidth: 1, borderColor: T.BORDER,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  infoDivider: { height: 1, backgroundColor: T.BORDER, marginHorizontal: 16 },
  infoLabel: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  infoValue: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },

  // Drops tab — vertical list of full-width content cards
  dropsGrid: { gap: 16 },
});
