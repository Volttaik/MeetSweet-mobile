import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  Animated,
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
import { createShareLink } from '@/services/sharing';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CaretRight,
  Check,
  SealCheck,
  ChatCircle,
  Lock,
  Sparkle,
  Star,
  Users,
  UserPlus,
  X,
} from 'phosphor-react-native';
import { blockUser, reportUser, searchUsers } from '@/services/users';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { subscribe, cancelSubscription } from '@/services/subscriptions';
import { getCachedCreatorProfile, cacheCreatorProfile } from '@/lib/posts-db';
import { Spinner } from 'heroui-native';
import type { Creator } from '@/lib/api-client-react';
import { useLocalExploreCatalog } from '@/services/explore';
import {
  useCreatorReviews,
  getCreatorById,
  getCreatorContentPosts,
  getCreatorContentVideos,
  getCreatorContentShorts,
  getCreatorContentAlbums,
  type CreatorReview,
  type CreatorProfileFull,
} from '@/services/creators';
import { useAuth } from '@/contexts/AuthContext';
import type { Post } from '@/services/posts';
import type { AlbumCardData } from '@/services/albums';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsAvatar } from '@/components/MsAvatar';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { MsFeedbackModal, type FeedbackVariant } from '@/components/MsFeedbackModal';
import { dialogs } from '@/components/MsGlobalDialogs';
import { toast } from '@/components/MsToast';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsPostCard } from '@/components/MsPostCard';
import { MsAlbumCard } from '@/components/MsAlbumCard';
import { MsPostSkeleton } from '@/components/MsSkeletonCard';
import { T } from '@/constants/theme';
import { shouldShowOnboarding, completeOnboarding } from '@/services/onboarding';
import { MsOnboardingModal, type OnboardingScreen } from '@/components/MsOnboardingModal';
import { wasOpenedViaShareLink } from '@/lib/deep-link';

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

// ─── Subscribe sheet (2-plan selection) ───────────────────────────────────────

type SubscribePlan = 'subscriber' | 'subscriber_plus';

const PLANS: Array<{
  key: SubscribePlan;
  label: string;
  tagline: string;
  color: string;
  bg: string;
  priceKey: 'subscriptionPrice' | 'subscriptionPlusPrice';
  perks: string[];
}> = [
  {
    key:      'subscriber',
    label:    'Subscriber',
    tagline:  'Perfect for fans',
    color:    '#C45A72',
    bg:       'rgba(196,90,114,0.10)',
    priceKey: 'subscriptionPrice',
    perks:    ['All subscriber posts & videos', 'Direct messaging', 'Exclusive subscriber feed'],
  },
  {
    key:      'subscriber_plus',
    label:    'Subscriber+',
    tagline:  'For the biggest supporters',
    color:    '#D4A017',
    bg:       'rgba(212,160,23,0.10)',
    priceKey: 'subscriptionPlusPrice',
    perks:    ['Everything in Subscriber', 'Exclusive Subscriber+ content', 'Priority support & access'],
  },
];

function SubscribeSheet({
  visible,
  creator,
  creatorProfile,
  walletBalance,
  isSubscribed = false,
  currentTier = null,
  subscribing = false,
  unsubscribing = false,
  onConfirm,
  onWallet,
  onUnsubscribe,
  onClose,
}: {
  visible: boolean;
  creator: Creator;
  creatorProfile: CreatorProfileFull | null;
  walletBalance: number;
  isSubscribed?: boolean;
  currentTier?: SubscribePlan | null;
  subscribing?: boolean;
  unsubscribing?: boolean;
  onConfirm: (plan: SubscribePlan) => void;
  onWallet: () => void;
  onUnsubscribe?: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Default to subscriber_plus if user is already subscriber, so they see the upgrade option
  const [selectedPlan, setSelectedPlan] = useState<SubscribePlan>(
    isSubscribed && currentTier === 'subscriber' ? 'subscriber_plus' : 'subscriber',
  );

  useEffect(() => {
    if (isSubscribed && currentTier === 'subscriber') {
      setSelectedPlan('subscriber_plus');
    }
  }, [isSubscribed, currentTier]);

  const planCfg  = PLANS.find((p) => p.key === selectedPlan)!;
  // Real prices only — no fabricated fallback amounts. A creator without a
  // configured price shows "Free" rather than an invented ₦200/₦500 figure.
  const price    = selectedPlan === 'subscriber'
    ? (creatorProfile?.subscriptionPrice ?? 0)
    : (creatorProfile?.subscriptionPlusPrice ?? 0);
  const canAfford = walletBalance >= price || price === 0;

  const isCurrentPlan = isSubscribed && (
    (currentTier === 'subscriber_plus' && selectedPlan === 'subscriber_plus') ||
    (currentTier === 'subscriber' && selectedPlan === 'subscriber')
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={shStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={[shStyles.sheet, { paddingBottom: Math.max(insets.bottom + 12, 28) }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* Drag handle */}
          <View style={shStyles.handle} />

          {/* Header */}
          <View style={shStyles.headerWrap}>
            <Text style={shStyles.title}>
              {isSubscribed ? 'Manage Subscription for' : 'Subscribe to'}
            </Text>
            <Text style={shStyles.creatorName}>{creator.name}</Text>
            <Text style={shStyles.subtitle}>
              {isSubscribed
                ? 'Upgrade to Subscriber+ for priority support & exclusive content.'
                : 'Choose a plan to unlock exclusive content and connect directly.'}
            </Text>
          </View>

          {/* Plan cards */}
          <View style={shStyles.plansWrap}>
            {PLANS.map((plan) => {
              const active = selectedPlan === plan.key;
              const isUserTier = isSubscribed && (
                (currentTier === 'subscriber_plus' && plan.key === 'subscriber_plus') ||
                (currentTier === 'subscriber' && plan.key === 'subscriber')
              );
              const planPrice = plan.key === 'subscriber'
                ? (creatorProfile?.subscriptionPrice ?? 0)
                : (creatorProfile?.subscriptionPlusPrice ?? 0);
              return (
                <TouchableOpacity
                  key={plan.key}
                  style={[
                    shStyles.tierCard,
                    { borderColor: active ? plan.color : T.BORDER },
                    active && { backgroundColor: plan.bg },
                  ]}
                  onPress={() => setSelectedPlan(plan.key)}
                  activeOpacity={0.85}
                >
                  {/* Top row */}
                  <View style={shStyles.tierTop}>
                    <View style={[shStyles.tierBadge, { backgroundColor: plan.bg }]}>
                      {plan.key === 'subscriber_plus' ? (
                        <UserPlus size={17} color={plan.color} weight="fill" />
                      ) : (
                        <Users size={17} color={plan.color} weight="fill" />
                      )}
                    </View>
                    <View style={shStyles.tierLabelWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[shStyles.tierName, active && { color: plan.color }]}>
                          {plan.label}
                        </Text>
                        {isUserTier && (
                          <View style={shStyles.currentBadge}>
                            <Text style={shStyles.currentBadgeText}>CURRENT PLAN</Text>
                          </View>
                        )}
                      </View>
                      <Text style={shStyles.tierTagline}>{plan.tagline}</Text>
                    </View>
                    <View style={shStyles.tierPriceWrap}>
                      <Text style={[shStyles.tierPriceMain, active && { color: plan.color }]}>
                        {planPrice > 0 ? `₦${planPrice.toLocaleString()}` : 'Free'}
                      </Text>
                      {planPrice > 0 && <Text style={shStyles.tierPriceSub}>/month</Text>}
                    </View>
                  </View>

                  {/* Perks — always visible */}
                  <View style={shStyles.perksWrap}>
                    {plan.perks.map((perk) => (
                      <View key={perk} style={shStyles.perkRow}>
                        <View style={[shStyles.perkDot, { backgroundColor: active ? plan.color : T.TEXT_3 }]} />
                        <Text style={[shStyles.perkText, active && { color: T.TEXT }]}>{perk}</Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Wallet row */}
          <View style={shStyles.walletRow}>
            <View style={shStyles.walletLeft}>
              <Text style={shStyles.walletLabel}>Wallet balance</Text>
              {!canAfford && !isCurrentPlan && (
                <Text style={shStyles.walletInsuff}>Insufficient funds</Text>
              )}
            </View>
            <Text style={[shStyles.walletAmt, !canAfford && !isCurrentPlan && { color: T.ERROR }]}>
              ₦{walletBalance.toLocaleString()}
            </Text>
          </View>

          {/* CTA */}
          {isCurrentPlan ? (
            <View style={[shStyles.primaryBtn, { backgroundColor: T.SURFACE_2, borderWidth: 1, borderColor: T.BORDER }]}>
              <Text style={[shStyles.primaryLabel, { color: T.TEXT_2 }]}>Current Active Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                shStyles.primaryBtn,
                canAfford ? { backgroundColor: planCfg.color } : shStyles.primaryBtnOutline,
                (subscribing || !canAfford) && { opacity: 0.85 },
              ]}
              activeOpacity={0.85}
              disabled={subscribing}
              onPress={canAfford ? () => onConfirm(selectedPlan) : onWallet}
            >
              {subscribing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Spinner size="sm" color="default" />
                  <Text style={shStyles.primaryLabel}>Processing payment…</Text>
                </View>
              ) : (
                <Text style={[shStyles.primaryLabel, !canAfford && { color: T.ACCENT }]}>
                  {canAfford
                    ? (price === 0
                        ? (isSubscribed && selectedPlan === 'subscriber_plus'
                            ? 'Upgrade to Subscriber+ — Free'
                            : 'Subscribe — Free')
                        : (isSubscribed && selectedPlan === 'subscriber_plus'
                            ? `Upgrade to Subscriber+ — ₦${price.toLocaleString()}/mo`
                            : `Subscribe — ₦${price.toLocaleString()}/mo`))
                    : 'Top up wallet to subscribe'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {isSubscribed && onUnsubscribe ? (
            <TouchableOpacity
              style={shStyles.unsubscribeBtn}
              onPress={onUnsubscribe}
              disabled={subscribing || unsubscribing}
              activeOpacity={0.7}
            >
              <Text style={shStyles.unsubscribeLabel}>
                {unsubscribing ? 'Cancelling subscription…' : 'Unsubscribe'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={shStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={shStyles.cancelLabel}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const shStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 14,
    gap: 14,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 6,
  },
  headerWrap: { gap: 4, alignItems: 'center', paddingBottom: 4 },
  title: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2, letterSpacing: 0.2 },
  creatorName: { fontSize: 22, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.5 },
  subtitle: {
    fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2,
    textAlign: 'center', lineHeight: 19, marginTop: 2,
  },

  plansWrap: { gap: 10 },
  tierCard: {
    borderRadius: T.RADIUS.lg,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  tierTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierBadge: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  tierLabelWrap: { flex: 1, gap: 1 },
  tierName: { fontSize: 15, fontFamily: T.FONT.bold, color: T.TEXT },
  currentBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 9,
    fontFamily: T.FONT.bold,
    color: T.TEXT_2,
    letterSpacing: 0.3,
  },
  tierTagline: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3 },
  tierPriceWrap: { alignItems: 'flex-end' },
  tierPriceMain: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.5 },
  tierPriceSub: { fontSize: 10, fontFamily: T.FONT.regular, color: T.TEXT_3 },
  perksWrap: { gap: 6, paddingLeft: 4 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkDot: { width: 5, height: 5, borderRadius: 2.5 },
  perkText: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, flex: 1 },

  walletRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: T.BORDER,
  },
  walletLeft: { gap: 2 },
  walletLabel: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  walletInsuff: { fontSize: 11, fontFamily: T.FONT.medium, color: T.ERROR },
  walletAmt: { fontSize: 17, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.3 },

  primaryBtn: {
    height: 54, borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnOutline: {
    backgroundColor: 'rgba(196,90,114,0.1)',
    borderWidth: 1.5, borderColor: T.ACCENT,
  },
  primaryLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelLabel: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_3 },
  unsubscribeBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  unsubscribeLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.DANGER,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'posts' | 'videos' | 'shorts' | 'albums' | 'reviews' | 'about';

export default function CreatorProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('posts');
  const [refreshing, setRefreshing] = useState(false);
  // Subscription onboarding state
  const [showSubscriptionOnboarding, setShowSubscriptionOnboarding] = useState(false);

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [currentTier, setCurrentTier] = useState<SubscribePlan | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [unsubscribeConfirm, setUnsubscribeConfirm] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: FeedbackVariant;
    title: string;
    message?: string;
  } | null>(null);
  // Full creator profile from /api/creators/:id
  const [creatorFullProfile, setCreatorFullProfile] = useState<CreatorProfileFull | null>(null);

  // Content per tab
  const [creatorVideos, setCreatorVideos] = useState<Post[]>([]);
  const [creatorShorts, setCreatorShorts] = useState<Post[]>([]);
  const [creatorAlbums, setCreatorAlbums] = useState<AlbumCardData[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [shortsLoading, setShortsLoading] = useState(false);
  const [albumsLoading, setAlbumsLoading] = useState(false);

  // Check for subscription onboarding on mount. When the profile was opened
  // straight from a shared link, the recipient must see the profile itself —
  // never the subscribe-onboarding modal popping over the shared destination.
  useEffect(() => {
    wasOpenedViaShareLink().then((viaShare) => {
      if (viaShare) return;
      shouldShowOnboarding('subscription_onboarded').then((shouldShow) => {
        if (shouldShow) setShowSubscriptionOnboarding(true);
      });
    });
  }, []);

  const handleSubscriptionOnboardingComplete = async () => {
    await completeOnboarding('subscription_onboarded');
    setShowSubscriptionOnboarding(false);
    // Open the subscribe sheet after onboarding
    setSheetOpen(true);
  };

  // Subscription onboarding screens
  const SUBSCRIPTION_ONBOARDING: OnboardingScreen[] = [
    {
      title: 'Subscribe to Creators',
      subtitle: 'Unlock exclusive content, private messages, and more by subscribing to your favorite creators.',
      icon: 'star',
      buttonLabel: 'Next',
    },
    {
      title: 'All Access',
      subtitle: 'One subscription unlocks all of a creator\'s subscriber-only content and direct messages.',
      icon: 'money',
      buttonLabel: 'Subscribe Now',
    },
  ];

  // Handle subscribe button with onboarding
  const handleSubscribePress = () => {
    setSheetOpen(true);
  };

  const openPrivateMessage = () => {
    if (id) router.push({ pathname: '/compose-private-message', params: { creatorId: id } } as any);
  };

  // Open a piece of content. Locked (subscriber-gated) content routes to the
  // subscribe sheet instead of the detail screen so the user can unlock it.
  const openPost = (post: Post) => {
    if (post.isLocked || post.is_locked) {
      handleSubscribePress();
      return;
    }
    if (post.contentType === 'short') {
      router.push({ pathname: '/shorts', params: { startId: post.id } });
    } else if (post.contentType === 'video') {
      router.push(`/videos/${post.id}`);
    } else {
      router.push(`/post/${post.id}`);
    }
  };

  // ── Data sources ─────────────────────────────────────────────────────────────
  // Profile + posts data
  const reviewsQuery = useCreatorReviews(id);
  const [realProfile, setRealProfile] = useState<{
    name: string; username: string; bio?: string | null;
    avatarUrl?: string | null; bannerUrl?: string | null;
    subscriberCount?: number; isVerified?: boolean;
    category?: string | null; isOnline?: boolean;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [creatorPosts, setCreatorPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // Fetch the canonical creator profile.
  const creatorUUID = creatorFullProfile?.userId ?? id;
  const creatorLookup = id;

  // Own profile: the creator screen is normally redirected to the personal
  // profile tab when the viewer IS the creator, but guard explicitly so a
  // UUID-based navigation never shows Subscribe/Message on your own profile.
  const isOwnProfile = Boolean(
    currentUser && creatorFullProfile && currentUser.id === creatorFullProfile.userId,
  );

  // Realtime: when the viewer IS the creator, live subscription events update
  // Creator-profile access model: the profile is subscriber-gated. When the
  // server reports content_locked (viewer not subscribed and not the owner),
  // NO content may be shown here — header/subscribe only. The owner and
  // subscribed viewers get the full profile. Authoritative from the server.
  const contentLocked = !isOwnProfile && Boolean(creatorFullProfile?.contentLocked);

  // Fade the content section in when a subscription unlocks the profile.
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const prevLockedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevLockedRef.current === null) {
      prevLockedRef.current = contentLocked;
      if (!contentLocked) contentOpacity.setValue(1);
      return;
    }
    if (prevLockedRef.current && !contentLocked) {
      Animated.timing(contentOpacity, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    }
    prevLockedRef.current = contentLocked;
  }, [contentLocked, contentOpacity]);

  // Apply a CreatorProfileFull response to all creator-profile state. Single
  // source of truth for mount / refresh / post-subscribe sync so the UI never
  // shows stale subscriber counts or subscription state.
  const applyProfile = useCallback((profile: CreatorProfileFull) => {
    setCreatorFullProfile(profile);
    setIsSubscribed(profile.subscribedToCreator);
    setCurrentTier(profile.subscriptionTier ?? null);
    setRealProfile({
      name:            profile.name,
      username:        profile.username,
      bio:             profile.bio,
      avatarUrl:       profile.avatarUrl,
      bannerUrl:       profile.bannerUrl,
      subscriberCount: profile.subscriberCount,
      isVerified:      profile.isVerified,
      category:        profile.category,
      isOnline:        profile.isOnline,
    });
  }, []);

  // Unsubscribe flow — success is only reported after the server confirms the
  // subscription row was cancelled ({ cancelled: true }).
  const handleUnsubscribe = useCallback(async () => {
    const subId = creatorFullProfile?.subscriptionId;
    if (!subId) {
      setUnsubscribeConfirm(false);
      setFeedback({
        variant: 'error',
        title: 'Could not unsubscribe',
        message: 'No active subscription was found for this creator.',
      });
      return;
    }
    setUnsubscribeConfirm(false);
    setUnsubscribing(true);
    try {
      const res = await cancelSubscription(subId);
      if (!res.cancelled) throw new Error('Could not cancel the subscription.');
      setIsSubscribed(false);
      setCurrentTier(null);
      setSheetOpen(false);
      setFeedback({
        variant: 'success',
        title: 'Unsubscribed',
        message: `You are no longer subscribed to ${creatorFullProfile?.name ?? 'this creator'}.`,
      });
      // Re-fetch the authoritative profile so subscription state + counts
      // reflect the server everywhere.
      getCreatorById(creatorLookup)
        .then((profile: CreatorProfileFull) => {
          applyProfile(profile);
          cacheCreatorProfile(currentUser?.id ?? 'guest', creatorLookup, profile).catch(() => {});
        })
        .catch(() => {});
    } catch (err) {
      setFeedback({
        variant: 'error',
        title: 'Could not unsubscribe',
        message: (err as Error).message ?? 'Please try again.',
      });
    } finally {
      setUnsubscribing(false);
    }
  }, [creatorFullProfile, creatorLookup, currentUser?.id, applyProfile]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    // 1. Paint the cached profile immediately for instant continuity, then
    //    revalidate against the server so the server stays authoritative.
    const viewerId = currentUser?.id ?? 'guest';
    getCachedCreatorProfile(viewerId, creatorLookup)
      .then((cached) => {
        if (!cancelled && cached) {
          applyProfile(cached as CreatorProfileFull);
          setProfileLoading(false);
        }
      })
      .catch(() => {});

    setProfileLoading(true);
    getCreatorById(creatorLookup)
      .then((profile: CreatorProfileFull) => {
        if (cancelled) return;
        applyProfile(profile);
        cacheCreatorProfile(viewerId, creatorLookup, profile).catch(() => {});
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setProfileLoading(false); });

    return () => { cancelled = true; };
  }, [id, creatorLookup, applyProfile, currentUser?.id]);

  // Redirect to own profile immediately if slug matches username — no API wait needed
  useEffect(() => {
    if (!currentUser || !id) return;
    if (currentUser.username === id) {
      router.replace('/(tabs)/profile');
    }
  }, [currentUser, id]);

  // Secondary redirect once real profile loads — handles UUID-based navigation
  useEffect(() => {
    if (!currentUser || !realProfile) return;
    if (currentUser.username === realProfile.username) {
      router.replace('/(tabs)/profile');
    }
  }, [currentUser, realProfile]);

  // Fetch posts for this creator. Locked profiles (unsubscribed viewer) never
  // fetch content — the server would deny it anyway (locked: true).
  useEffect(() => {
    if (!creatorUUID || contentLocked) return;
    setPostsLoading(true);
    getCreatorContentPosts(creatorUUID)
      .then(({ posts }: { posts: Post[] }) => setCreatorPosts(posts))
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, [creatorUUID, contentLocked]);

  /**
   * Resolved creator profile data.
   */
  const creator: Creator | null = useMemo(() => {
    if (!realProfile) return null;
    const profile = realProfile;

    const resolvedName     = profile.name?.trim() || 'Creator';
    const resolvedHandle   = profile.username ? `@${profile.username}` : '';
    const resolvedInitials = initials(resolvedName);
    const resolvedBio      = profile.bio ?? '';
    const resolvedIsVerified = profile.isVerified ?? false;
    const resolvedSubscriberCount = profile.subscriberCount ?? 0;

    return {
      id: id!,
      name:            resolvedName,
      handle:          resolvedHandle,
      initials:        resolvedInitials,
      bio:             resolvedBio,
      category:        profile.category ?? '',
      subscriberCount: resolvedSubscriberCount,
      isVerified:      resolvedIsVerified,
      isOnline:        profile.isOnline ?? false,
      gradient:        'violet',
      avatarUrl:       profile.avatarUrl,
      bannerUrl:       profile.bannerUrl,
    };
  }, [id, realProfile]);

  const { balance: walletBalance, refreshWallet } = useWalletBalance();

  // Reviews (always empty — backend has no reviews endpoint)
  const reviews      = reviewsQuery.data?.reviews ?? [];
  const totalReviews = reviewsQuery.data?.total ?? 0;
  const avgRating    = reviewsQuery.data?.average_rating ?? null;

  // ── Lazy-load tab content ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!creatorUUID || contentLocked) return;
    if (activeTab === 'videos' && creatorVideos.length === 0 && !videosLoading) {
      setVideosLoading(true);
      getCreatorContentVideos(creatorUUID)
        .then(setCreatorVideos)
        .catch(() => {})
        .finally(() => setVideosLoading(false));
    }
    if (activeTab === 'shorts' && creatorShorts.length === 0 && !shortsLoading) {
      setShortsLoading(true);
      getCreatorContentShorts(creatorUUID)
        .then(setCreatorShorts)
        .catch(() => {})
        .finally(() => setShortsLoading(false));
    }
    if (activeTab === 'albums' && creatorAlbums.length === 0 && !albumsLoading) {
      setAlbumsLoading(true);
      getCreatorContentAlbums(creatorUUID)
        .then(setCreatorAlbums)
        .catch(() => {})
        .finally(() => setAlbumsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, creatorUUID, contentLocked]);

  // ── Refresh ───────────────────────────────────────────────────────────────────
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        getCreatorById(creatorLookup)
          .then((profile: CreatorProfileFull) => {
            applyProfile(profile);
            cacheCreatorProfile(currentUser?.id ?? 'guest', creatorLookup, profile).catch(() => {});
          })
          .catch(() => {}),
        getCreatorContentPosts(creatorUUID)
          .then(({ posts }: { posts: Post[] }) => setCreatorPosts(posts)).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  const isInitialLoading = profileLoading && !realProfile;

  if (isInitialLoading) {
    return <View style={styles.center}><Spinner color="default" size="lg" /></View>;
  }

  if (!creator && !profileLoading) {
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
    { key: 'posts',   label: `Posts (${creatorFullProfile?.postCount ?? creatorPosts.length})` },
    { key: 'videos',  label: `Videos (${creatorFullProfile?.videoCount ?? creatorVideos.length})` },
    { key: 'shorts',  label: `Shorts (${creatorFullProfile?.shortCount ?? creatorShorts.length})` },
    { key: 'albums',  label: `Albums (${creatorFullProfile?.albumCount ?? creatorAlbums.length})` },
    { key: 'reviews', label: `Reviews (${reviewsQuery.isLoading ? '…' : totalReviews})` },
    { key: 'about',   label: 'About' },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => goBack()} accessibilityLabel="Back">
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
            {creator.isVerified && <SealCheck size={16} color={T.TEXT} weight="fill" />}
            {isOwnProfile && (
              <View style={styles.youBadge}>
                <Text style={styles.youBadgeText}>You</Text>
              </View>
            )}
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

          {/* Metrics — a locked (unsubscribed) profile shows subscriber
              information only; content counts that imply browsing the
              creator's posts stay hidden until subscription. */}
          <View style={styles.metrics}>
            <View>
              <Text style={styles.metricValue}>{fmtCount(creator.subscriberCount ?? 0) || '—'}</Text>
              <Text style={styles.metricLabel}>Subscribers</Text>
            </View>
            {!contentLocked && (
              <>
                <View style={styles.metricDivider} />
                <View>
                  <Text style={styles.metricValue}>{creatorFullProfile?.postCount ?? creatorPosts.length}</Text>
                  <Text style={styles.metricLabel}>Drops</Text>
                </View>
              </>
            )}
          </View>

          {/* Subscribe button — reflects the authoritative server state: price
              when unsubscribed, current state + Upgrade when a base subscriber,
              and the highest tier with no upgrade when Subscriber+. Never shown
              on your own profile, and never shown on a profile that is not an
              actual creator (plain users keep normal profile functionality). */}
          {!isOwnProfile && creatorFullProfile?.isCreator && (
          <View style={styles.subscribeRow}>
            <TouchableOpacity
              style={[
                styles.subscribeButton,
                isSubscribed && styles.subscribeButtonSubscribed,
                currentTier === 'subscriber_plus' && styles.subscribeButtonPlus,
              ]}
              onPress={handleSubscribePress}
              activeOpacity={0.85}
            >
              {currentTier === 'subscriber_plus' ? (
                <>
                  <Star size={16} color="#E8A020" weight="fill" />
                  <Text style={styles.subscribeBtnLabelPlus}>Subscriber+</Text>
                </>
              ) : isSubscribed ? (
                <>
                  <Check size={16} color={T.TEXT_2} weight="bold" />
                  <Text style={styles.subscribeBtnLabelSubscribed}>Subscribed</Text>
                </>
              ) : (
                <>
                  <Lock size={16} color={T.BG} />
                  <Text style={styles.subscribeBtnLabel}>Subscribe</Text>
                  {(creatorFullProfile?.subscriptionPrice ?? 0) > 0 && (
                    <Text style={styles.subscribeBtnPrice}>
                      · ₦{(creatorFullProfile?.subscriptionPrice ?? 0).toLocaleString()}/mo
                    </Text>
                  )}
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.messageButton}
              onPress={openPrivateMessage}
              activeOpacity={0.85}
            >
              <ChatCircle size={16} color={T.TEXT} />
              <Text style={styles.messageBtnLabel}>Private message</Text>
            </TouchableOpacity>

            {isSubscribed && currentTier === 'subscriber' && (
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={handleSubscribePress}
                activeOpacity={0.85}
              >
                <Star size={16} color="#E8A020" weight="fill" />
                <Text style={styles.upgradeBtnLabel}>Upgrade</Text>
              </TouchableOpacity>
            )}
          </View>
          )}

        </View>

        {/* ── Subscriber gate (unsubscribed viewer) ── */}
        {contentLocked ? (
          <View style={styles.lockPanel}>
            <View style={styles.lockIcon}>
              <Lock size={26} color={T.ACCENT} weight="fill" />
            </View>
            <Text style={styles.lockTitle}>Subscriber-only content</Text>
            <Text style={styles.lockText}>
              Subscribe to {creator.name} to unlock their posts, videos, shorts,
              albums, and direct messaging.
            </Text>
            {(creatorFullProfile?.subscriptionPrice ?? 0) > 0 && (
              <Text style={styles.lockPrice}>
                From ₦{(creatorFullProfile?.subscriptionPrice ?? 0).toLocaleString()}/month
              </Text>
            )}
            <TouchableOpacity
              style={styles.lockBtn}
              onPress={handleSubscribePress}
              activeOpacity={0.85}
            >
              <Lock size={15} color={T.BG} weight="fill" />
              <Text style={styles.lockBtnText}>Subscribe to unlock</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View style={{ opacity: contentOpacity }}>

        {/* ── Tabs (visible after subscription / for the owner) ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
          style={styles.tabs}
        >
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
        </ScrollView>

        {/* ── Posts tab ── */}
        {activeTab === 'posts' && (
          <View style={styles.tabContent}>
            {postsLoading ? (
              <View style={styles.dropsGrid}>
                <MsPostSkeleton /><MsPostSkeleton /><MsPostSkeleton />
              </View>
            ) : creatorPosts.length > 0 ? (
              <View style={styles.dropsGrid}>
                {creatorPosts.map((post) => (
                  <MsPostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser?.id}
                    onAuthorPress={() => undefined}
                    onSubscribe={handleSubscribePress}
                    onPress={() => openPost(post)}
                    onEditPress={(p) => router.push(`/edit-post/${p.id}`)}
                    // Discovery actions (Not Interested / Hide Creator) never
                    // appear for creators the viewer already subscribes to.
                    subscribedToAuthor={isSubscribed}
                    onDeleted={(id) => setCreatorPosts((prev) => prev.filter((p) => p.id !== id))}
                    onCreatorHidden={(creatorId) => {
                      setCreatorPosts([]);
                      setCreatorVideos([]);
                      setCreatorShorts([]);
                      goBack();
                    }}
                  />
                ))}
              </View>
            ) : (
              <MsEmptyState title="No posts yet" message="This creator hasn't published any posts yet." />
            )}
          </View>
        )}

        {/* ── Videos tab ── */}
        {activeTab === 'videos' && (
          <View style={styles.tabContent}>
            {videosLoading ? (
              <View style={styles.dropsGrid}><MsPostSkeleton /><MsPostSkeleton /></View>
            ) : creatorVideos.length > 0 ? (
              <View style={styles.dropsGrid}>
                {creatorVideos.map((v) => (
                  <MsPostCard
                    key={v.id}
                    post={v}
                    currentUserId={currentUser?.id}
                    onAuthorPress={() => undefined}
                    onSubscribe={handleSubscribePress}
                    onPress={() => openPost(v)}
                    onEditPress={(p) => router.push(`/edit-post/${p.id}`)}
                    subscribedToAuthor={isSubscribed}
                    onDeleted={(id) => setCreatorVideos((prev) => prev.filter((p) => p.id !== id))}
                    onCreatorHidden={(creatorId) => {
                      setCreatorPosts([]);
                      setCreatorVideos([]);
                      setCreatorShorts([]);
                      goBack();
                    }}
                  />
                ))}
              </View>
            ) : (
              <MsEmptyState title="No videos yet" message="This creator hasn't published any videos yet." />
            )}
          </View>
        )}

        {/* ── Shorts tab ── */}
        {activeTab === 'shorts' && (
          <View style={styles.tabContent}>
            {shortsLoading ? (
              <View style={styles.dropsGrid}><MsPostSkeleton /><MsPostSkeleton /></View>
            ) : creatorShorts.length > 0 ? (
              <View style={styles.dropsGrid}>
                {creatorShorts.map((s) => (
                  <MsPostCard
                    key={s.id}
                    post={s}
                    currentUserId={currentUser?.id}
                    onAuthorPress={() => undefined}
                    onSubscribe={handleSubscribePress}
                    onPress={() => openPost(s)}
                    onEditPress={(p) => router.push(`/edit-post/${p.id}`)}
                    subscribedToAuthor={isSubscribed}
                    onDeleted={(id) => setCreatorShorts((prev) => prev.filter((p) => p.id !== id))}
                    onCreatorHidden={(creatorId) => {
                      setCreatorPosts([]);
                      setCreatorVideos([]);
                      setCreatorShorts([]);
                      goBack();
                    }}
                  />
                ))}
              </View>
            ) : (
              <MsEmptyState title="No shorts yet" message="This creator hasn't published any shorts yet." />
            )}
          </View>
        )}

        {/* ── Albums tab ── */}
        {activeTab === 'albums' && (
          <View style={styles.tabContent}>
            {albumsLoading ? (
              <View style={styles.dropsGrid}><MsPostSkeleton /><MsPostSkeleton /></View>
            ) : creatorAlbums.length > 0 ? (
              <View style={styles.dropsGrid}>
                {creatorAlbums.map((album) => (
                  <MsAlbumCard
                    key={album.id}
                    album={album}
                    onPress={() => router.push(`/album/${album.id}`)}
                    onUnlockPress={() => router.push(`/album/${album.id}`)}
                  />
                ))}
              </View>
            ) : (
              <MsEmptyState title="No albums yet" message="This creator hasn't published any albums yet." />
            )}
          </View>
        )}

        {/* ── Reviews tab ── */}
        {activeTab === 'reviews' && (
          <View style={styles.tabContent}>
            {reviewsQuery.isLoading ? (
              <View style={styles.reviewLoading}><Spinner color="default" size="sm" /></View>
            ) : reviews.length > 0 ? (
              <>
                {avgRating != null && (
                  <View style={styles.ratingCard}>
                    <Text style={styles.ratingBig}>{avgRating.toFixed(1)}</Text>
                    <StarRow rating={avgRating} size={20} />
                    <Text style={styles.ratingCardSub}>
                      {totalReviews} subscriber {totalReviews === 1 ? 'review' : 'reviews'}
                    </Text>
                  </View>
                )}
                {reviews.map((r: CreatorReview) => <ReviewCard key={r.id} review={r} />)}
              </>
            ) : (
              <MsEmptyState title="No reviews yet" message="Subscribers haven't left reviews yet." />
            )}
          </View>
        )}

        {/* ── About tab ── */}
        {activeTab === 'about' && (
          <View style={styles.tabContent}>
            <View style={styles.aboutCard}>
              <Users size={18} color={T.TEXT_2} />
              <View style={styles.aboutCopy}>
                <Text style={styles.aboutTitle}>A closer connection</Text>
                <Text style={styles.aboutText}>
                  Subscribe for the full feed, exclusive drops, and direct messaging.
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
              {creatorFullProfile?.subscriptionPrice != null && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Subscription price</Text>
                    <Text style={styles.infoValue}>₦{creatorFullProfile.subscriptionPrice.toLocaleString()}/mo</Text>
                  </View>
                  <View style={styles.infoDivider} />
                </>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Verified</Text>
                {creator.isVerified ? (
                  <View style={styles.verifiedValueRow}>
                    <SealCheck size={14} color={T.ACCENT} weight="fill" />
                    <Text style={styles.infoValue}>Verified creator</Text>
                  </View>
                ) : (
                  <Text style={styles.infoValue}>Not verified</Text>
                )}
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 35 }} />
          </Animated.View>
        )}
      </ScrollView>

      {/* Subscribe sheet */}
      <SubscribeSheet
        visible={sheetOpen}
        creator={creator}
        creatorProfile={creatorFullProfile}
        walletBalance={walletBalance}
        isSubscribed={isSubscribed}
        currentTier={currentTier}
        subscribing={subscribing}
        onConfirm={async (plan) => {
          setSubscribing(true);
          try {
            // Server confirms the subscription; its response carries the
            // authoritative tier + subscriber count. Never fake local state.
            const result = await subscribe(creatorUUID || creator.id, plan);
            setIsSubscribed(true);
            setCurrentTier(result.tier === 'subscriber_plus' ? 'subscriber_plus' : 'subscriber');

            // The subscription debits the wallet — refresh the shared balance so
            // the header badge and subscribe sheet reflect it immediately.
            refreshWallet();

            // Apply the authoritative subscriber count immediately (no stale 0).
            const count = result.subscriber_count ?? result.subscriberCount;
            if (typeof count === 'number') {
              setRealProfile((p) => (p ? { ...p, subscriberCount: count } : p));
              setCreatorFullProfile((p) => (p ? { ...p, subscriberCount: count } : p));
            }

            setSheetOpen(false);
            setFeedback(
              plan === 'subscriber_plus'
                ? {
                    variant: 'success',
                    title: 'Upgraded to Subscriber+',
                    message: `You now have access to ${creator.name}'s content.`,
                  }
                : {
                    variant: 'success',
                    title: 'Subscribed',
                    message: `You are now subscribed to ${creator.name}.`,
                  },
            );

            // Re-fetch the authoritative profile so subscription state, counts,
            // and unlocked content all reflect the server (persists across tabs),
            // and update the cached profile so the next open is instant + correct.
            getCreatorById(creatorLookup)
              .then((profile: CreatorProfileFull) => {
                applyProfile(profile);
                cacheCreatorProfile(currentUser?.id ?? 'guest', creatorLookup, profile).catch(() => {});
              })
              .catch(() => {});

            // Refresh the creator's content so subscriber-gated posts appear
            // immediately — the profile tab was previously showing only free
            // content. Reset the lazily-loaded tabs so they re-fetch too.
            getCreatorContentPosts(creatorUUID)
              .then(({ posts }: { posts: Post[] }) => setCreatorPosts(posts))
              .catch(() => {});
            setCreatorVideos([]);
            setCreatorShorts([]);
            setCreatorAlbums([]);
          } catch (err) {
            const code = (err as { code?: string }).code;
            setFeedback({
              variant: 'error',
              title: 'Could not subscribe',
              message:
                code === 'INSUFFICIENT_BALANCE'
                  ? 'Insufficient wallet balance. Top up to subscribe.'
                  : ((err as Error).message ?? 'Subscription failed. Please try again.'),
            });
          } finally {
            setSubscribing(false);
          }
        }}
        onWallet={() => { setSheetOpen(false); router.push('/wallet'); }}
        onUnsubscribe={() => setUnsubscribeConfirm(true)}
        unsubscribing={unsubscribing}
        onClose={() => setSheetOpen(false)}
      />

      {/* Unsubscribe confirmation */}
      <MsConfirmDialog
        visible={unsubscribeConfirm}
        title="Unsubscribe?"
        message={`You will lose access to ${creator.name}'s subscriber content and messaging.`}
        confirmLabel={unsubscribing ? 'Cancelling…' : 'Unsubscribe'}
        destructive
        onConfirm={handleUnsubscribe}
        onCancel={() => setUnsubscribeConfirm(false)}
      />

      {/* Subscription / pricing feedback (styled modal) */}
      <MsFeedbackModal
        visible={Boolean(feedback)}
        variant={feedback?.variant ?? 'info'}
        title={feedback?.title ?? ''}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
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
              toast.success(`${creator.handle} copied to clipboard.`);
            },
          },
          {
            label: 'Share Profile',
            onPress: async () => {
              setMoreSheetOpen(false);
              try {
                const shareLink = await createShareLink(
                  'creator',
                  creatorFullProfile?.userId ?? creator.id,
                );
                const url = shareLink.url || `https://meetsweet.space/${creator.handle}`;
                await Share.share({
                  title: creator.name,
                  message: `Check out ${creator.name} ${creator.handle} on MeetSweet!\n${url}`,
                  url,
                });
              } catch {
                await Share.share({
                  title: creator.name,
                  message: `Check out ${creator.name} ${creator.handle} on MeetSweet!`,
                });
              }
            },
          },
          {
            label: 'Report',
            onPress: () => {
              setMoreSheetOpen(false);
              dialogs.confirm({
                title: 'Report Creator',
                message: 'Are you sure you want to report this creator?',
                confirmLabel: 'Report',
                destructive: true,
                onConfirm: async () => {
                  try {
                    await reportUser(creator.handle.replace('@', ''), 'inappropriate_content');
                    toast.success('Reported — thank you. We will review this profile.');
                  } catch {
                    dialogs.alert({ variant: 'error', title: 'Could not submit report', message: 'Please try again.' });
                  }
                },
              });
            },
          },
          {
            label: 'Block',
            destructive: true,
            onPress: () => {
              setMoreSheetOpen(false);
              dialogs.confirm({
                title: 'Block Creator',
                message: `Block ${creator.name}? You won't see their content anymore.`,
                confirmLabel: 'Block',
                destructive: true,
                onConfirm: async () => {
                  try {
                    await blockUser(creator.handle.replace('@', ''));
                    toast.success(`${creator.name} has been blocked.`);
                    goBack();
                  } catch {
                    dialogs.alert({ variant: 'error', title: 'Could not block this user', message: 'Please try again.' });
                  }
                },
              });
            },
          },
        ] satisfies ActionItem[]}
        onClose={() => setMoreSheetOpen(false)}
      />

      {/* Subscription onboarding modal */}
      <MsOnboardingModal
        visible={showSubscriptionOnboarding}
        screens={SUBSCRIPTION_ONBOARDING}
        onComplete={handleSubscriptionOnboardingComplete}
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
  youBadge: {
    backgroundColor: 'rgba(196,90,114,0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.full,
  },
  youBadgeText: {
    color: T.ACCENT,
    fontFamily: T.FONT.bold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
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
    color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 10,
    textAlign: 'center', marginTop: 3, letterSpacing: 0.3,
  },
  metricDivider: { width: 1, height: 24, backgroundColor: T.BORDER_2 },

  subscribeRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  subscribeButton: {
    flex: 1,
    height: 52,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subscribeBtnLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },
  subscribeBtnPrice: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.BG },
  subscribeButtonSubscribed: {
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  subscribeBtnLabelSubscribed: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT_2 },
  subscribeButtonPlus: {
    backgroundColor: 'rgba(232,160,32,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(232,160,32,0.45)',
  },
  subscribeBtnLabelPlus: { fontSize: 15, fontFamily: T.FONT.semibold, color: '#E8A020' },
  upgradeButton: {
    height: 52,
    paddingHorizontal: 20,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(232,160,32,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,160,32,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  upgradeBtnLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: '#E8A020' },

  // Message button
  messageButton: {
    width: '100%', marginTop: 10, height: 52,
    borderRadius: T.RADIUS.full, backgroundColor: T.SURFACE_2,
    borderWidth: 1, borderColor: T.BORDER_2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  messageButtonDisabled: {
    backgroundColor: T.SURFACE,
    borderColor: T.BORDER,
  },
  messageBtnLabel: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.BG },
  messageBtnLabelLocked: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.ACCENT },
  messageBtnLabelDisabled: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT_3 },

  // Subscriber gate (locked profile)
  lockPanel: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
    gap: 12,
  },
  lockIcon: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(196,90,114,0.12)',
    borderWidth: 1, borderColor: 'rgba(196,90,114,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  lockTitle: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 19, letterSpacing: -0.4 },
  lockText: {
    color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 20,
    textAlign: 'center', maxWidth: 300,
  },
  lockPrice: { color: T.TEXT_3, fontFamily: T.FONT.medium, fontSize: 12 },
  lockBtn: {
    marginTop: 8, height: 50, borderRadius: T.RADIUS.full, backgroundColor: T.ACCENT,
    paddingHorizontal: 30,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  lockBtnText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 15 },

  // Tabs — horizontal scroll to fit Posts/Videos/Shorts/Albums/Reviews/About
  tabs: {
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
    marginTop: 28,
  },
  tabsScroll: {
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  tab: {
    paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: T.ACCENT },
  tabLabel: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  tabLabelActive: { color: T.ACCENT, fontFamily: T.FONT.semibold },

  tabContent: { padding: 20 },

  // Drops (kept for grid compat)
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Albums tab
  albumRow: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    padding: 14,
    gap: 4,
    marginBottom: 10,
  },
  albumRowTitle: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  albumRowMeta: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },

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
  verifiedValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },

  // Drops tab — vertical list of full-width content cards
  dropsGrid: { gap: 16 },
});