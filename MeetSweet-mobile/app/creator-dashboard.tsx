import React, { useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
import { T } from '@/constants/theme';
import { MsShimmer } from '@/components/MsShimmer';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsFeedbackModal, type FeedbackVariant } from '@/components/MsFeedbackModal';
import {
  getCreatorDashboard,
  getCreatorSettings,
  updateCreatorSettings,
  getCreatorSubscribers,
  type CreatorDashboard,
  type PeriodStat,
} from '@/services/creator';
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

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartRow}>
        {ascending.map((s) => {
          const barHeight = Math.max(6, Math.round((s.views / maxViews) * 110));
          return (
            <View key={s.period} style={styles.chartCol}>
              <Text style={styles.chartValue} numberOfLines={1}>
                {s.views >= 1000 ? `${(s.views / 1000).toFixed(1)}k` : s.views}
              </Text>
              <View style={styles.chartTrack}>
                <View style={[styles.chartBar, { height: barHeight }]} />
              </View>
              <Text style={styles.chartPeriod} numberOfLines={1}>
                {shortPeriod(s.period)}
              </Text>
            </View>
          );
        })}
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
      <TouchableOpacity
        style={styles.settingsHeader}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.75}
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
      </TouchableOpacity>
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
    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingsRowLabelWrap}>
        {RowIcon ? <RowIcon size={16} color={T.TEXT_2} /> : null}
        <Text style={styles.settingsRowLabel}>{label}</Text>
      </View>
      <View style={styles.settingsRowRight}>
        {value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
        <CaretRight size={13} color={T.TEXT_3} />
      </View>
    </TouchableOpacity>
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
      const [dash, subs, settings] = await Promise.all([
        getCreatorDashboard(),
        getCreatorSubscribers(1).catch(() => ({ subscribers: [] as typeof subscribers })),
        getCreatorSettings().catch(() => null),
      ]);
      setDashboard(dash);
      setSubscribers(subs.subscribers ?? []);
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
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={T.TEXT} />
        </TouchableOpacity>
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
        <ScrollView
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
              <TouchableOpacity
                style={styles.withdrawBtn}
                onPress={() => router.push('/creator-payout')}
                activeOpacity={0.85}
              >
                <ArrowCircleUp size={16} color="#fff" weight="fill" />
                <Text style={styles.withdrawLabel}>Withdraw</Text>
              </TouchableOpacity>
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
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/create-post')}
              activeOpacity={0.8}
            >
              <View style={styles.actionIconWrap}>
                <Camera size={22} color={T.TEXT_2} />
              </View>
              <Text style={styles.actionLabel}>New Post</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/creator-payout')}
              activeOpacity={0.8}
            >
              <View style={styles.actionIconWrap}>
                <Wallet size={22} color={T.TEXT_2} />
              </View>
              <Text style={styles.actionLabel}>Payout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/settings')}
              activeOpacity={0.8}
            >
              <View style={styles.actionIconWrap}>
                <GearSix size={22} color={T.TEXT_2} />
              </View>
              <Text style={styles.actionLabel}>Settings</Text>
            </TouchableOpacity>
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
                  Alert.alert('Could not update', 'Please try again.');
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
                  <TouchableOpacity style={styles.priceSave} onPress={() => savePrice('subscriber')}>
                    <Text style={styles.priceSaveText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingPrice(null)} hitSlop={8}>
                    <Text style={styles.priceCancelText}>Cancel</Text>
                  </TouchableOpacity>
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
                  <TouchableOpacity style={styles.priceSave} onPress={() => savePrice('subscriber_plus')}>
                    <Text style={styles.priceSaveText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingPrice(null)} hitSlop={8}>
                    <Text style={styles.priceCancelText}>Cancel</Text>
                  </TouchableOpacity>
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
                Alert.alert('Who can message you?', undefined, [
                  { text: 'Everyone', onPress: async () => {
                    const prev = whoCanMessage;
                    setWhoCanMessage('everyone');
                    try { await updateCreatorSettings({ who_can_message: 'everyone' }); }
                    catch { setWhoCanMessage(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'Subscribers only', onPress: async () => {
                    const prev = whoCanMessage;
                    setWhoCanMessage('subscribers');
                    try { await updateCreatorSettings({ who_can_message: 'subscribers' }); }
                    catch { setWhoCanMessage(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'No one', onPress: async () => {
                    const prev = whoCanMessage;
                    setWhoCanMessage('none');
                    try { await updateCreatorSettings({ who_can_message: 'none' }); }
                    catch { setWhoCanMessage(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            />
            <SettingsDivider />
            <SettingsRow
              label="Who can comment"
              value={whoCanComment === 'everyone' ? 'Everyone' : whoCanComment === 'subscribers' ? 'Subscribers only' : 'No one'}
              onPress={() =>
                Alert.alert('Who can comment?', undefined, [
                  { text: 'Everyone', onPress: async () => {
                    const prev = whoCanComment;
                    setWhoCanComment('everyone');
                    try { await updateCreatorSettings({ allow_comments: true, who_can_comment: 'everyone' }); }
                    catch { setWhoCanComment(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'Subscribers only', onPress: async () => {
                    const prev = whoCanComment;
                    setWhoCanComment('subscribers');
                    try { await updateCreatorSettings({ allow_comments: true, who_can_comment: 'subscribers' }); }
                    catch { setWhoCanComment(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'No one', onPress: async () => {
                    const prev = whoCanComment;
                    setWhoCanComment('none');
                    try { await updateCreatorSettings({ allow_comments: false, who_can_comment: 'none' }); }
                    catch { setWhoCanComment(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            />
            <SettingsDivider />
            <SettingsRow
              label="Who can see my posts"
              value={whoCanSee === 'everyone' ? 'Everyone' : whoCanSee === 'subscribers' ? 'Subscribers only' : 'No one'}
              onPress={() =>
                Alert.alert('Who can see your posts?', undefined, [
                  { text: 'Everyone', onPress: async () => {
                    const prev = whoCanSee;
                    setWhoCanSee('everyone');
                    try { await updateCreatorSettings({ who_can_see: 'everyone' }); }
                    catch { setWhoCanSee(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'Subscribers only', onPress: async () => {
                    const prev = whoCanSee;
                    setWhoCanSee('subscribers');
                    try { await updateCreatorSettings({ who_can_see: 'subscribers' }); }
                    catch { setWhoCanSee(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'No one', onPress: async () => {
                    const prev = whoCanSee;
                    setWhoCanSee('none');
                    try { await updateCreatorSettings({ who_can_see: 'none' }); }
                    catch { setWhoCanSee(prev); Alert.alert('Could not update', 'Please try again.'); }
                  }},
                  { text: 'Cancel', style: 'cancel' },
                ])
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

        </ScrollView>
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
