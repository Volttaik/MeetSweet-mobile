import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  ArrowCircleUp,
  Camera,
  CaretDown,
  CaretRight,
  ChatText,
  CurrencyNgn,
  GearSix,
  Star,
  Users,
  Wallet,
  type Icon,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { T } from '@/constants/theme';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { MsShimmer } from '@/components/MsShimmer';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsFeedbackModal, type FeedbackVariant } from '@/components/MsFeedbackModal';
import { dialogs } from '@/components/MsGlobalDialogs';
import {
  getCreatorDashboard,
  getCreatorSettings,
  updateCreatorSettings,
  getCreatorSubscribers,
  type CreatorDashboard,
  type PeriodStat,
} from '@/services/creator';
import { getMyReferralLink, type MyReferralLink } from '@/services/referrals';
import { shouldShowOnboarding, completeOnboarding } from '@/services/onboarding';
import { MsOnboardingModal, type OnboardingScreen } from '@/components/MsOnboardingModal';

const MIN_WITHDRAWAL = 1000;

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatNaira(n: number): string {
  return '₦' + (n ?? 0).toLocaleString('en-NG');
}

/** "2026-08" → "Aug"; anything else → truncated label. */
function shortPeriod(period: string): string {
  const m = period?.match(/^(\d{4})-(\d{2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString('en-US', { month: 'short' });
  }
  return period && period.length > 9 ? period.slice(0, 9) : period;
}

// ─── Performance chart (real period_stats only) ───────────────────────────────

function PerformanceChart({ stats }: { stats: PeriodStat[] }) {
  const Svg = require('react-native-svg').default;
  const { Line, Circle, G, Path, Defs, LinearGradient, Stop } = require('react-native-svg');
  const { useWindowDimensions } = require('react-native');

  // Newest-first from the API; render chronologically left → right.
  const ascending = [...stats].reverse();
  const totalViews = ascending.reduce((s, p) => s + p.views, 0);

  if (totalViews === 0) {
    return (
      <View style={styles.chartCard}>
        <MsEmptyState
          title="No analytics yet"
          message="Views, likes and revenue for each period will appear here once your content gets engagement."
        />
      </View>
    );
  }

  const maxViews = Math.max(...ascending.map((s) => s.views), 1);
  const CHART_H = 120;
  const CHART_PAD_X = 8;
  const CHART_PAD_Y = 16;
  const dotR = 4;

  // Build SVG path points
  const points = ascending.map((s, i) => {
    const x = ascending.length === 1
      ? 0.5
      : (i / (ascending.length - 1));
    const y = 1 - (s.views / maxViews);
    return { x, y, views: s.views, period: s.period };
  });

  const lineD = points.map((p, i) => {
    const px = p.x * 100;
    const py = CHART_PAD_Y + p.y * (CHART_H - CHART_PAD_Y * 2);
    return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
  }).join(' ');

  // Smooth curve: catmull-rom spline approximation
  const smoothD = (() => {
    if (points.length < 2) return lineD;
    const pts = points.map((p) => ({
      x: p.x * 100,
      y: CHART_PAD_Y + p.y * (CHART_H - CHART_PAD_Y * 2),
    }));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  })();

  // Gradient fill path (area under the curve)
  const fillD = (() => {
    const pts = points.map((p) => ({
      x: p.x * 100,
      y: CHART_PAD_Y + p.y * (CHART_H - CHART_PAD_Y * 2),
    }));
    if (pts.length === 0) return '';
    const curve = (() => {
      if (pts.length < 2) return `L ${pts[0].x} ${pts[0].y}`;
      let d = '';
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
      }
      return d;
    })();
    return `M ${pts[0].x} ${CHART_H} L ${pts[0].x} ${pts[0].y}${curve} L ${pts[pts.length - 1].x} ${CHART_H} Z`;
  })();

  return (
    <View style={styles.chartCard}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C45A72" stopOpacity="0.25" />
            <Stop offset="1" stopColor="#C45A72" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {/* Gradient fill under the line */}
        {fillD ? <Path d={fillD} fill="url(#lineGrad)" /> : null}
        {/* Smooth line */}
        <Path d={smoothD} fill="none" stroke="#C45A72" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Data points */}
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={p.x * 100}
            cy={CHART_PAD_Y + p.y * (CHART_H - CHART_PAD_Y * 2)}
            r={dotR}
            fill="#C45A72"
            stroke="#0C0C0F"
            strokeWidth="1.5"
          />
        ))}
      </Svg>
      {/* Period labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        {points.map((p, i) => (
          <Text key={i} style={styles.chartPeriod} numberOfLines={1}>
            {shortPeriod(p.period)}
          </Text>
        ))}
      </View>
      {/* Value labels on top */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        {points.map((p, i) => (
          <Text key={i} style={[styles.chartValue, { fontSize: 10, minWidth: 24, textAlign: 'center' }]} numberOfLines={1}>
            {p.views >= 1000 ? `${(p.views / 1000).toFixed(1)}k` : p.views}
          </Text>
        ))}
      </View>
      <Text style={styles.chartCaption}>Views per period</Text>
    </View>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ stat }: { stat: PeriodStat }) {
  return (
    <View style={styles.activityRow}>
      <View style={styles.activityPeriodWrap}>
        <Text style={styles.activityPeriod}>{shortPeriod(stat.period)}</Text>
      </View>
      <View style={styles.activityStats}>
        <View style={styles.activityStat}>
          <Text style={styles.activityValue}>{stat.views.toLocaleString()}</Text>
          <Text style={styles.activityStatLabel}>Views</Text>
        </View>
        <View style={styles.activityDivider} />
        <View style={styles.activityStat}>
          <Text style={styles.activityValue}>{stat.likes.toLocaleString()}</Text>
          <Text style={styles.activityStatLabel}>Likes</Text>
        </View>
        <View style={styles.activityDivider} />
        <View style={styles.activityStat}>
          <Text style={styles.activityValue}>{stat.new_subscribers}</Text>
          <Text style={styles.activityStatLabel}>New subs</Text>
        </View>
        <View style={styles.activityDivider} />
        <View style={styles.activityStat}>
          <Text style={[styles.activityValue, { color: T.SUCCESS }]}>
            {formatNaira(stat.revenue)}
          </Text>
          <Text style={styles.activityStatLabel}>Revenue</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Skeleton loading state ───────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <MsShimmer width="100%" height={168} borderRadius={20} />
      <View style={styles.skeletonGrid}>
        <MsShimmer width="47%" height={108} borderRadius={16} />
        <MsShimmer width="47%" height={108} borderRadius={16} />
        <MsShimmer width="47%" height={108} borderRadius={16} />
        <MsShimmer width="47%" height={108} borderRadius={16} />
      </View>
      <MsShimmer width="100%" height={190} borderRadius={16} />
      <MsShimmer width="100%" height={150} borderRadius={16} />
    </View>
  );
}

// ─── Expandable settings section ─────────────────────────────────────────────

function SettingsSection({
  IconComp,
  title,
  children,
  defaultOpen = false,
}: {
  IconComp: Icon;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.settingsCard}>
      <MsPressable
        style={styles.settingsHeader}
        onPress={() => setOpen((v) => !v)}
        >
        <View style={styles.settingsIconWrap}>
          <IconComp size={18} color={T.TEXT_2} />
        </View>
        <Text style={styles.settingsTitle}>{title}</Text>
        <CaretDown
          size={16}
          color={T.TEXT_3}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </MsPressable>
      {open && <View style={styles.settingsBody}>{children}</View>}
    </View>
  );
}

// ─── Settings row helpers ────────────────────────────────────────────────────

function SettingsRow({
  label,
  value,
  onPress,
  icon: RowIcon,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: Icon;
}) {
  return (
    <MsPressable
      style={styles.settingsRow}
      onPress={onPress}
    >
      <View style={styles.settingsRowLabelWrap}>
        {RowIcon ? <RowIcon size={16} color={T.TEXT_2} /> : null}
        <Text style={styles.settingsRowLabel}>{label}</Text>
      </View>
      <View style={styles.settingsRowRight}>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
        <CaretRight size={13} color={T.TEXT_3} />
      </View>
    </MsPressable>
  );
}

function SettingsToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsRowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: T.SURFACE_2, true: T.ACCENT }}
        thumbColor="#fff"
      />
    </View>
  );
}

function SettingsDivider() {
  return <View style={styles.settingsDivider} />;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreatorDashboardScreen() {
  const insets = useSafeAreaInsets();

  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [subscribers, setSubscribers] = useState<Array<{
    id: string; username: string; display_name: string | null;
    avatar_url: string | null; subscribed_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [referral, setReferral] = useState<MyReferralLink | null>(null);
  const [referralBusy, setReferralBusy] = useState(false);

  // ── Local settings state ────────
  const [subsEnabled, setSubsEnabled] = useState(true);
  const [subscriberPrice, setSubscriberPrice] = useState(0);
  const [subscriberPlusPrice, setSubscriberPlusPrice] = useState(0);
  const [editingPrice, setEditingPrice] = useState<'subscriber' | 'subscriber_plus' | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [feedback, setFeedback] = useState<{
    variant: FeedbackVariant;
    title: string;
    message?: string;
  } | null>(null);
  const [whoCanMessage, setWhoCanMessage] = useState<'everyone' | 'subscribers' | 'none'>('everyone');
  const [whoCanComment, setWhoCanComment] = useState<'everyone' | 'subscribers' | 'none'>('everyone');
  const [whoCanSee, setWhoCanSee] = useState<'everyone' | 'subscribers' | 'none'>('subscribers');

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check for creator onboarding on mount
  useEffect(() => {
    shouldShowOnboarding('creator_onboarded').then((shouldShow) => {
      if (shouldShow) setShowOnboarding(true);
    });
  }, []);

  const handleOnboardingComplete = async () => {
    await completeOnboarding('creator_onboarded');
    setShowOnboarding(false);
  };

  // Creator onboarding screens
  const CREATOR_ONBOARDING: OnboardingScreen[] = [
    {
      title: 'Welcome, Creator!',
      subtitle: 'You\'re now a creator on MeetSweet. Here\'s how to start earning.',
      icon: 'rocket',
      buttonLabel: 'Next',
      imageSource: require('../assets/onboarding/creator-welcome.jpg'),
    },
    {
      title: 'Create Content',
      subtitle: 'Create Posts, Albums, Videos, and Shorts to share with your audience.',
      icon: 'video',
      buttonLabel: 'Next',
      imageSource: require('../assets/onboarding/creator-content.jpg'),
    },
    {
      title: 'Set Up Subscriptions',
      subtitle: 'Enable subscriptions and set your monthly price to start earning from subscribers.',
      icon: 'money',
      buttonLabel: 'Next',
      imageSource: require('../assets/onboarding/creator-subscribe.jpg'),
    },
    {
      title: 'Withdraw Earnings',
      subtitle: 'Once you have ₦1,000 or more, withdraw directly to your bank account.',
      icon: 'piggy',
      buttonLabel: 'Get Started',
      imageSource: require('../assets/onboarding/creator-withdraw.jpg'),
    },
  ];

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dash, subs, settings, referralLink] = await Promise.all([
        getCreatorDashboard(),
        getCreatorSubscribers(1).catch(() => ({ subscribers: [] as typeof subscribers })),
        getCreatorSettings().catch(() => null),
        getMyReferralLink().catch(() => null),
      ]);
      setDashboard(dash);
      setSubscribers(subs.subscribers ?? []);
      if (referralLink) setReferral(referralLink);
      if (settings) {
        setWhoCanMessage(settings.who_can_message ?? 'everyone');
        setWhoCanComment(settings.who_can_comment ?? (settings.allow_comments === false ? 'none' : 'everyone'));
        setWhoCanSee(settings.who_can_see ?? 'subscribers');
        setSubsEnabled(settings.subscriptions_enabled ?? true);
        setSubscriberPrice(settings.subscription_price ?? 0);
        setSubscriberPlusPrice(settings.subscription_plus_price ?? 0);
      }
      setError('');
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = () => { setRefreshing(true); load(true); };

  const beginPriceEdit = (plan: 'subscriber' | 'subscriber_plus') => {
    setEditingPrice(plan);
    setPriceDraft(String(plan === 'subscriber' ? subscriberPrice : subscriberPlusPrice));
  };

  const savePrice = async (plan: 'subscriber' | 'subscriber_plus') => {
    const price = Math.max(0, Number(priceDraft.replace(/[^0-9.]/g, '')) || 0);
    try {
      const next = await updateCreatorSettings(
        plan === 'subscriber'
          ? { subscription_price: price }
          : { subscription_plus_price: price },
      );
      if (plan === 'subscriber') setSubscriberPrice(next.subscription_price ?? price);
      else setSubscriberPlusPrice(next.subscription_plus_price ?? price);
      setEditingPrice(null);
      setFeedback({
        variant: 'success',
        title: 'Price updated',
        message: `Your ${plan === 'subscriber' ? 'Subscriber' : 'Subscriber+'} price is now ₦${price.toLocaleString()}/mo.`,
      });
    } catch {
      setFeedback({
        variant: 'error',
        title: 'Could not save price',
        message: 'Please try again.',
      });
    }
  };

  const monthRevenue = dashboard?.period_stats?.[0]?.revenue ?? 0;
  const totalRevenue = dashboard?.total_revenue ?? 0;
  const subscribers_count = dashboard?.active_subscribers ?? 0;
  const total_posts = dashboard?.total_posts ?? 0;
  const recent_stats = dashboard?.period_stats?.slice(0, 6) ?? [];
  const latestPeriod = dashboard?.period_stats?.[0]?.period;

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <MsPressable
          onPress={() => router.back()}
          style={styles.backBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={T.TEXT} />
        </MsPressable>
        <Text style={styles.headerTitle}>Creator Dashboard</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <View style={styles.errorWrap}>
          <MsEmptyState
            title="Could not load dashboard"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={load}
          />
        </View>
      ) : (
        <KeyboardAwareScrollViewCompat
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.TEXT} />
          }
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        >
          {/* ── Earnings hero (dark ash surface, not a white banner) ──────── */}
          <LinearGradient colors={['#251319', '#121014']} style={styles.hero}>
            <View style={styles.heroGlow} pointerEvents="none" />
            <View style={styles.heroTop}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>TOTAL EARNINGS</Text>
                <Text style={styles.heroValue}>{formatNaira(totalRevenue)}</Text>
                <Text style={styles.heroSub}>
                  {latestPeriod ? `${shortPeriod(latestPeriod)}: ${formatNaira(monthRevenue)}` : 'No earnings recorded yet'}
                </Text>
              </View>
              <MsPressable
                style={styles.withdrawBtn}
                onPress={() => router.push('/creator-payout')}
                        >
                <ArrowCircleUp size={16} color="#fff" weight="fill" />
                <Text style={styles.withdrawLabel}>Withdraw</Text>
              </MsPressable>
            </View>

            <View style={styles.heroMetaRow}>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaValue}>{subscribers_count}</Text>
                <Text style={styles.heroMetaLabel}>Subscribers</Text>
              </View>
              <View style={styles.heroMetaDivider} />
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaValue}>{total_posts}</Text>
                <Text style={styles.heroMetaLabel}>Posts</Text>
              </View>
              <View style={styles.heroMetaDivider} />
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaValue}>
                  {recent_stats[0] ? `${((recent_stats[0].likes / Math.max(recent_stats[0].views, 1)) * 100).toFixed(0)}%` : '—'}
                </Text>
                <Text style={styles.heroMetaLabel}>Engagement</Text>
              </View>
            </View>

            {/* Withdrawal progress — real balance toward the real minimum */}
            <View style={styles.withdrawProgressWrap}>
              <View style={styles.withdrawProgressTrack}>
                <View
                  style={[
                    styles.withdrawProgressFill,
                    { width: `${Math.min(100, (totalRevenue / MIN_WITHDRAWAL) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.withdrawProgressText}>
                {totalRevenue >= MIN_WITHDRAWAL
                  ? 'Ready to withdraw — tap Withdraw above'
                  : `${formatNaira(Math.max(0, MIN_WITHDRAWAL - totalRevenue))} until minimum withdrawal (${formatNaira(MIN_WITHDRAWAL)})`}
              </Text>
            </View>
          </LinearGradient>

          {/* ── Performance chart (real data) ─────────────────────────────── */}
          <Text style={styles.sectionTitle}>Performance</Text>
          {recent_stats.length > 0 ? (
            <PerformanceChart stats={recent_stats} />
          ) : (
            <View style={styles.chartCard}>
              <MsEmptyState
                title="No analytics yet"
                message="Views, likes and revenue for each period will appear here once your content gets engagement."
              />
            </View>
          )}

          {/* ── Period breakdown ──────────────────────────────────────────── */}
          {recent_stats.length > 1 && (
            <>
              <Text style={styles.sectionTitle}>Period Breakdown</Text>
              <View style={styles.activityCard}>
                {recent_stats.map((s) => (
                  <ActivityRow key={s.period} stat={s} />
                ))}
              </View>
            </>
          )}

          {/* ── Recent subscribers ────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Recent Subscribers</Text>
          <View style={styles.subsCard}>
            {subscribers.length > 0 ? (
              <>
                {subscribers.slice(0, 5).map((sub) => (
                  <View key={sub.id} style={styles.subRow}>
                    <View style={styles.subAvatar}>
                      <Text style={styles.subInitial}>
                        {(sub.display_name ?? sub.username)?.[0]?.toUpperCase() ?? 'U'}
                      </Text>
                    </View>
                    <View style={styles.subInfo}>
                      <Text style={styles.subName}>{sub.display_name ?? `@${sub.username}`}</Text>
                      <Text style={styles.subDate}>
                        Subscribed {new Date(sub.subscribed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                ))}
                {subscribers.length > 5 && (
                  <Text style={styles.moreSubsText}>+{subscribers.length - 5} more subscribers</Text>
                )}
              </>
            ) : (
              <MsEmptyState
                title="No subscribers yet"
                message="When people subscribe to you, they'll show up here."
              />
            )}
          </View>

          {/* ── Quick actions ─────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <MsPressable
              style={styles.actionCard}
              onPress={() => router.push('/create-post')}
                    >
              <View style={styles.actionIconWrap}>
                <Camera size={22} color={T.TEXT_2} />
              </View>
              <Text style={styles.actionLabel}>New Post</Text>
            </MsPressable>
            <MsPressable
              style={styles.actionCard}
              onPress={() => router.push('/creator-payout')}
                    >
              <View style={styles.actionIconWrap}>
                <Wallet size={22} color={T.TEXT_2} />
              </View>
              <Text style={styles.actionLabel}>Payout</Text>
            </MsPressable>
            <MsPressable
              style={styles.actionCard}
              onPress={() => router.push('/settings')}
                    >
              <View style={styles.actionIconWrap}>
                <GearSix size={22} color={T.TEXT_2} />
              </View>
              <Text style={styles.actionLabel}>Settings</Text>
            </MsPressable>
          </View>

              {/* ── Referral link ─────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Referral Link</Text>
          <View style={styles.referralCard}>
            <Text style={styles.referralTitle}>Invite someone to MeetSweet</Text>
            <Text style={styles.referralDescription}>
              Share your creator link. You receive ₦200 when a referred user pays the one-time ₦1,000 creator activation fee.
            </Text>
            <View style={styles.referralUrlBox}>
              <Text style={styles.referralUrl} numberOfLines={1}>{referral?.url ?? 'Loading referral link…'}</Text>
            </View>
            <View style={styles.referralActions}>
              <MsPressable
                style={styles.referralAction}
                disabled={!referral?.url || referralBusy}
                onPress={async () => {
                  if (!referral?.url) return;
                  setReferralBusy(true);
                  await Clipboard.setStringAsync(referral.url);
                  setReferralBusy(false);
                  setFeedback({ variant: 'success', title: 'Referral link copied', message: 'Share it anywhere to invite a new creator.' });
                }}
              >
                <Text style={styles.referralActionText}>Copy Link</Text>
              </MsPressable>
              <MsPressable
                style={[styles.referralAction, styles.referralActionPrimary]}
                disabled={!referral?.url || referralBusy}
                onPress={() => referral?.url && Share.share({ title: 'Join MeetSweet', message: `Join MeetSweet with my referral link: ${referral.url}`, url: referral.url })}
              >
                <Text style={[styles.referralActionText, styles.referralActionPrimaryText]}>Share</Text>
              </MsPressable>
            </View>
          </View>

          {/* ── Settings Sections ─────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Creator Settings</Text>

          {/* Subscription Settings */}
          <SettingsSection IconComp={Users} title="Subscription Plans">
            <SettingsToggleRow
              label="Enable subscriptions"
              value={subsEnabled}
              onChange={async (v) => {
                const prev = subsEnabled;
                setSubsEnabled(v);
                try {
                  await updateCreatorSettings({ subscriptions_enabled: v });
                } catch {
                  setSubsEnabled(prev);
                  dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' });
                }
              }}
            />
            <SettingsDivider />
            {/* Subscriber plan */}
            {editingPrice === 'subscriber' ? (
              <View style={styles.priceEditor}>
                <View style={styles.priceEditorLabelRow}>
                  <Users size={15} color={T.TEXT_2} />
                  <Text style={styles.priceEditorLabel}>Subscriber price</Text>
                </View>
                <View style={styles.priceEditorControls}>
                  <Text style={styles.nairaPrefix}>₦</Text>
                  <TextInput
                    value={priceDraft}
                    onChangeText={setPriceDraft}
                    keyboardType="numeric"
                    style={styles.priceInput}
                    autoFocus
                    selectTextOnFocus
                  />
                  <MsPressable style={styles.priceSave} onPress={() => savePrice('subscriber')}>
                    <Text style={styles.priceSaveText}>Save</Text>
                  </MsPressable>
                  <MsPressable onPress={() => setEditingPrice(null)} hitSlop={8}>
                    <Text style={styles.priceCancelText}>Cancel</Text>
                  </MsPressable>
                </View>
              </View>
            ) : (
              <SettingsRow
                label="Subscriber price"
                icon={Users}
                value={subscriberPrice > 0 ? `${formatNaira(subscriberPrice)}/mo` : 'Not set'}
                onPress={() => beginPriceEdit('subscriber')}
              />
            )}
            <SettingsDivider />
            {/* Subscriber+ plan */}
            {editingPrice === 'subscriber_plus' ? (
              <View style={styles.priceEditor}>
                <View style={styles.priceEditorLabelRow}>
                  <Star size={15} color="#E8A020" weight="fill" />
                  <Text style={styles.priceEditorLabel}>Subscriber+ price</Text>
                </View>
                <View style={styles.priceEditorControls}>
                  <Text style={styles.nairaPrefix}>₦</Text>
                  <TextInput
                    value={priceDraft}
                    onChangeText={setPriceDraft}
                    keyboardType="numeric"
                    style={styles.priceInput}
                    autoFocus
                    selectTextOnFocus
                  />
                  <MsPressable style={styles.priceSave} onPress={() => savePrice('subscriber_plus')}>
                    <Text style={styles.priceSaveText}>Save</Text>
                  </MsPressable>
                  <MsPressable onPress={() => setEditingPrice(null)} hitSlop={8}>
                    <Text style={styles.priceCancelText}>Cancel</Text>
                  </MsPressable>
                </View>
              </View>
            ) : (
              <SettingsRow
                label="Subscriber+ price"
                icon={Star}
                value={subscriberPlusPrice > 0 ? `${formatNaira(subscriberPlusPrice)}/mo` : 'Not set'}
                onPress={() => beginPriceEdit('subscriber_plus')}
              />
            )}
          </SettingsSection>

          {/* Messaging & Privacy */}
          <SettingsSection IconComp={ChatText} title="Messaging & Privacy">
            <SettingsRow
              label="Who can message me"
              value={whoCanMessage === 'everyone' ? 'Everyone' : whoCanMessage === 'subscribers' ? 'Subscribers only' : 'No one'}
              onPress={() =>
                dialogs.options({
                  title: 'Who can message you?',
                  actions: [
                    { label: 'Everyone', onPress: async () => {
                      const prev = whoCanMessage;
                      setWhoCanMessage('everyone');
                      try { await updateCreatorSettings({ who_can_message: 'everyone' }); }
                      catch { setWhoCanMessage(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                    { label: 'Subscribers only', onPress: async () => {
                      const prev = whoCanMessage;
                      setWhoCanMessage('subscribers');
                      try { await updateCreatorSettings({ who_can_message: 'subscribers' }); }
                      catch { setWhoCanMessage(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                    { label: 'No one', onPress: async () => {
                      const prev = whoCanMessage;
                      setWhoCanMessage('none');
                      try { await updateCreatorSettings({ who_can_message: 'none' }); }
                      catch { setWhoCanMessage(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                  ],
                })
              }
            />
            <SettingsDivider />
            <SettingsRow
              label="Who can comment"
              value={whoCanComment === 'everyone' ? 'Everyone' : whoCanComment === 'subscribers' ? 'Subscribers only' : 'No one'}
              onPress={() =>
                dialogs.options({
                  title: 'Who can comment?',
                  actions: [
                    { label: 'Everyone', onPress: async () => {
                      const prev = whoCanComment;
                      setWhoCanComment('everyone');
                      try { await updateCreatorSettings({ allow_comments: true, who_can_comment: 'everyone' }); }
                      catch { setWhoCanComment(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                    { label: 'Subscribers only', onPress: async () => {
                      const prev = whoCanComment;
                      setWhoCanComment('subscribers');
                      try { await updateCreatorSettings({ allow_comments: true, who_can_comment: 'subscribers' }); }
                      catch { setWhoCanComment(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                    { label: 'No one', onPress: async () => {
                      const prev = whoCanComment;
                      setWhoCanComment('none');
                      try { await updateCreatorSettings({ allow_comments: false, who_can_comment: 'none' }); }
                      catch { setWhoCanComment(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                  ],
                })
              }
            />
            <SettingsDivider />
            <SettingsRow
              label="Who can see my posts"
              value={whoCanSee === 'everyone' ? 'Everyone' : whoCanSee === 'subscribers' ? 'Subscribers only' : 'No one'}
              onPress={() =>
                dialogs.options({
                  title: 'Who can see your posts?',
                  actions: [
                    { label: 'Everyone', onPress: async () => {
                      const prev = whoCanSee;
                      setWhoCanSee('everyone');
                      try { await updateCreatorSettings({ who_can_see: 'everyone' }); }
                      catch { setWhoCanSee(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                    { label: 'Subscribers only', onPress: async () => {
                      const prev = whoCanSee;
                      setWhoCanSee('subscribers');
                      try { await updateCreatorSettings({ who_can_see: 'subscribers' }); }
                      catch { setWhoCanSee(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                    { label: 'No one', onPress: async () => {
                      const prev = whoCanSee;
                      setWhoCanSee('none');
                      try { await updateCreatorSettings({ who_can_see: 'none' }); }
                      catch { setWhoCanSee(prev); dialogs.alert({ variant: 'error', title: 'Could not update', message: 'Please try again.' }); }
                    }},
                  ],
                })
              }
            />
          </SettingsSection>

          {/* Payout & Earnings */}
          <SettingsSection IconComp={CurrencyNgn} title="Payout & Earnings">
            <SettingsRow
              label="Manage Payouts & Bank Details"
              value="View Balance"
              onPress={() => router.push('/creator-payout')}
            />
            <SettingsDivider />
            <View style={styles.settingsRow}>
              <Text style={styles.settingsRowLabel}>Minimum withdrawal</Text>
              <Text style={styles.settingsRowValue}>{formatNaira(MIN_WITHDRAWAL)}</Text>
            </View>
          </SettingsSection>

        </KeyboardAwareScrollViewCompat>
      )}

      {/* Creator onboarding modal */}
      <MsOnboardingModal
        visible={showOnboarding}
        screens={CREATOR_ONBOARDING}
        onComplete={handleOnboardingComplete}
      />

      {/* Pricing feedback (styled modal) */}
      <MsFeedbackModal
        visible={Boolean(feedback)}
        variant={feedback?.variant ?? 'info'}
        title={feedback?.title ?? ''}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
    gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT,
    letterSpacing: -0.3, textAlign: 'center',
  },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },

  scrollContent: { paddingTop: 8 },

  // ── Earnings hero ──────────────────────────────────────────────────────────
  hero: {
    margin: 20,
    padding: 20,
    borderRadius: T.RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(196,90,114,0.18)',
    overflow: 'hidden',
    position: 'relative',
    gap: 16,
  },
  heroGlow: {
    position: 'absolute',
    top: -80, right: -60,
    width: 200, height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(196,90,114,0.14)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroCopy: { flex: 1 },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: T.FONT.semibold, fontSize: 10,
    letterSpacing: 1.5,
  },
  heroValue: {
    color: '#FFFFFF', fontFamily: T.FONT.bold,
    fontSize: 32, letterSpacing: -1, marginTop: 4,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.42)',
    fontFamily: T.FONT.regular, fontSize: 12, marginTop: 4,
  },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
    ...T.SHADOWS.soft,
  },
  withdrawLabel: { fontSize: 12, fontFamily: T.FONT.semibold, color: '#fff' },

  heroMetaRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: T.RADIUS.md,
    paddingVertical: 12,
  },
  heroMeta: { flex: 1, alignItems: 'center', gap: 2 },
  heroMetaValue: { fontSize: 15, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.3 },
  heroMetaLabel: { fontSize: 10, fontFamily: T.FONT.regular, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3 },
  heroMetaDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.08)' },

  withdrawProgressWrap: { gap: 6 },
  withdrawProgressTrack: {
    height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  withdrawProgressFill: {
    height: '100%', borderRadius: 3,
    backgroundColor: T.ACCENT,
  },
  withdrawProgressText: {
    color: 'rgba(255,255,255,0.42)',
    fontFamily: T.FONT.regular, fontSize: 11,
  },

  // ── Section titles ─────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, letterSpacing: -0.2,
  },

  // ── Performance chart ──────────────────────────────────────────────────────
  chartCard: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    padding: 18,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    height: 150,
  },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' },
  chartValue: { fontSize: 11, fontFamily: T.FONT.semibold, color: T.TEXT_2 },
  chartTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: 22,
    borderRadius: 6,
    backgroundColor: T.ACCENT,
    opacity: 0.85,
  },
  chartPeriod: { fontSize: 10, fontFamily: T.FONT.medium, color: T.TEXT_3 },
  chartCaption: {
    fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3,
    marginTop: 12, textAlign: 'center',
  },

  // ── Activity rows ──────────────────────────────────────────────────────────
  activityCard: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
  },
  activityPeriodWrap: { width: 64 },
  activityPeriod: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_2 },
  activityStats: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  activityStat: { flex: 1, alignItems: 'center' },
  activityValue: { fontSize: 13, fontFamily: T.FONT.bold, color: T.TEXT },
  activityStatLabel: { fontSize: 9, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 2, letterSpacing: 0.3 },
  activityDivider: { width: 1, height: 24, backgroundColor: T.BORDER_2 },

  // ── Subscribers ────────────────────────────────────────────────────────────
  subsCard: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
  },
  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
  },
  subAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  subInitial: { fontSize: 16, fontFamily: T.FONT.bold, color: T.TEXT_2 },
  subInfo: { flex: 1 },
  subName: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  subDate: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 2 },
  moreSubsText: {
    fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2,
    textAlign: 'center', paddingVertical: 12,
  },

  // ── Quick actions ──────────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, marginBottom: 8,
  },
  actionCard: {
    flex: 1,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    paddingVertical: 18,
    alignItems: 'center', gap: 8,
  },
  actionIconWrap: {
    width: 40, height: 40, borderRadius: T.RADIUS.sm,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, fontFamily: T.FONT.semibold, color: T.TEXT },

  referralCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(196,90,114,0.22)',
    gap: 10,
  },
  referralTitle: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  referralDescription: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, lineHeight: 18 },
  referralUrlBox: { backgroundColor: T.SURFACE_2, borderRadius: T.RADIUS.md, paddingHorizontal: 12, paddingVertical: 11 },
  referralUrl: { fontSize: 12, fontFamily: T.FONT.medium, color: T.ACCENT },
  referralActions: { flexDirection: 'row', gap: 10 },
  referralAction: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: T.RADIUS.md, backgroundColor: T.SURFACE_2 },
  referralActionPrimary: { backgroundColor: T.ACCENT },
  referralActionText: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  referralActionPrimaryText: { color: '#fff' },

  // ── Settings sections ──────────────────────────────────────────────────────
  settingsCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  settingsIconWrap: {
    width: 32, height: 32, borderRadius: T.RADIUS.sm,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: -0.1,
  },
  settingsBody: {
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 46,
  },
  settingsRowLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },
  settingsRowLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsRowValue: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: T.BORDER,
    marginHorizontal: 16,
  },
  priceEditor: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  priceEditorLabel: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
  },
  priceEditorLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  priceEditorControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nairaPrefix: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 16,
  },
  priceInput: {
    flex: 1,
    minHeight: 42,
    color: T.TEXT,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 12,
    fontFamily: T.FONT.medium,
    fontSize: 14,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  priceSave: {
    backgroundColor: T.ACCENT,
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  priceSaveText: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
  priceCancelText: {
    color: T.TEXT_3,
    fontFamily: T.FONT.medium,
    fontSize: 12,
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skeletonWrap: {
    padding: 20,
    gap: 16,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
