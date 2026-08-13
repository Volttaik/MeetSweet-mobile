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
import {
  ArrowLeft,
  ArrowCircleUp,
  Bell,
  Broadcast,
  Camera,
  CaretDown,
  CaretRight,
  ChartBar,
  ChatText,
  CurrencyNgn,
  Eye,
  Gear,
  GearSix,
  TrendUp,
  Users,
  type Icon,
} from 'phosphor-react-native';
import { Spinner } from 'heroui-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
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

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  IconComp,
  label,
  value,
  change,
  positive,
}: {
  IconComp: Icon;
  label: string;
  value: string;
  change: string;
  positive: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <IconComp size={18} color={T.TEXT_2} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statChange, { color: positive ? T.SUCCESS : T.ERROR }]}>
        {change}
      </Text>
    </View>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ stat }: { stat: PeriodStat }) {
  return (
    <View style={styles.activityRow}>
      <View style={styles.activityPeriodWrap}>
        <Text style={styles.activityPeriod}>{stat.period}</Text>
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
            ₦{stat.revenue.toLocaleString()}
          </Text>
          <Text style={styles.activityStatLabel}>Revenue</Text>
        </View>
      </View>
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
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.settingsRowLabel}>{label}</Text>
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
  const [subscriberPrice, setSubscriberPrice] = useState(200);
  const [subscriberPlusPrice, setSubscriberPlusPrice] = useState(500);
  const [editingPrice, setEditingPrice] = useState<'subscriber' | 'subscriber_plus' | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
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

  const load = async () => {
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
        setWhoCanComment(settings.allow_comments ? 'everyone' : 'none');
        setSubsEnabled(true);
        setSubscriberPrice(settings.subscription_price && settings.subscription_price > 0 ? settings.subscription_price : 200);
        setSubscriberPlusPrice(
          settings.subscription_plus_price && settings.subscription_plus_price > 0
            ? settings.subscription_plus_price
            : 500,
        );
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

  const handleRefresh = () => { setRefreshing(true); load(); };

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
    } catch {
      Alert.alert('Could not save price', 'Please try again.');
    }
  };

  const monthRevenue = dashboard?.period_stats?.[0]?.revenue ?? 0;
  const totalRevenue = dashboard?.total_revenue ?? 0;
  const subscribers_count = dashboard?.active_subscribers ?? 0;
  const total_posts = dashboard?.total_posts ?? 0;
  const recent_stats = dashboard?.period_stats?.slice(0, 6) ?? [];

  const STATS = [
    { IconComp: CurrencyNgn, label: 'This Month', value: `₦${monthRevenue.toLocaleString()}`, change: totalRevenue > 0 ? `₦${totalRevenue.toLocaleString()} total` : '—', positive: totalRevenue > 0 },
    { IconComp: Users,       label: 'Subscribers', value: subscribers_count.toString(), change: subscribers_count > 0 ? 'Active' : '—', positive: subscribers_count > 0 },
    { IconComp: TrendUp,     label: 'Posts',       value: total_posts.toString(), change: total_posts > 0 ? 'Published' : '—', positive: total_posts > 0 },
    { IconComp: ChartBar,    label: 'Engagement',  value: recent_stats[0] ? `${((recent_stats[0].likes / Math.max(recent_stats[0].views, 1)) * 100).toFixed(1)}%` : '0%', change: '—', positive: true },
  ];

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
        <View style={styles.loadingWrap}>
          <Spinner size="lg" color="default" />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.8}>
            <Text style={styles.retryLabel}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.TEXT} />
          }
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        >
          {/* Creator Hub banner */}
          <View style={styles.banner}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>Creator Hub</Text>
              <Text style={styles.bannerSubtitle}>
                Track your earnings, subscribers, and content performance.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => router.push('/creator-payout')}
              activeOpacity={0.8}
            >
              <ArrowCircleUp size={16} color={T.BG} />
              <Text style={styles.withdrawLabel}>Withdraw</Text>
            </TouchableOpacity>
          </View>

          {/* Stats grid */}
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            {STATS.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </View>

          {/* Period performance */}
          {recent_stats.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Content Performance</Text>
              <View style={styles.activityCard}>
                {recent_stats.map((s) => (
                  <ActivityRow key={s.period} stat={s} />
                ))}
              </View>
            </>
          )}

          {/* Recent subscribers */}
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
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_3 }}>
                  No active subscribers yet
                </Text>
              </View>
            )}
          </View>

          {/* Quick actions */}
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
                <CurrencyNgn size={22} color={T.TEXT_2} />
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
                setSubsEnabled(v);
                await updateCreatorSettings({ subscriptions_enabled: v }).catch(() => {});
              }}
            />
            <SettingsDivider />
            {/* Subscriber plan */}
            {editingPrice === 'subscriber' ? (
              <View style={styles.priceEditor}>
                <Text style={styles.priceEditorLabel}>👥 Subscriber price</Text>
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
                label="👥 Subscriber price"
                value={`₦${subscriberPrice.toLocaleString()}/mo`}
                onPress={() => beginPriceEdit('subscriber')}
              />
            )}
            <SettingsDivider />
            {/* Subscriber+ plan */}
            {editingPrice === 'subscriber_plus' ? (
              <View style={styles.priceEditor}>
                <Text style={styles.priceEditorLabel}>⭐ Subscriber+ price</Text>
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
                label="⭐ Subscriber+ price"
                value={`₦${subscriberPlusPrice.toLocaleString()}/mo`}
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
                    setWhoCanMessage('everyone');
                    await updateCreatorSettings({ who_can_message: 'everyone' });
                  }},
                  { text: 'Subscribers only', onPress: async () => {
                    setWhoCanMessage('subscribers');
                    await updateCreatorSettings({ who_can_message: 'subscribers' });
                  }},
                  { text: 'No one', onPress: async () => {
                    setWhoCanMessage('none');
                    await updateCreatorSettings({ who_can_message: 'none' });
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
                  { text: 'Everyone', onPress: async () => { setWhoCanComment('everyone'); await updateCreatorSettings({ allow_comments: true, who_can_comment: 'everyone' }).catch(() => {}); } },
                  { text: 'Subscribers only', onPress: async () => { setWhoCanComment('subscribers'); await updateCreatorSettings({ allow_comments: true, who_can_comment: 'subscribers' }).catch(() => {}); } },
                  { text: 'No one', onPress: async () => { setWhoCanComment('none'); await updateCreatorSettings({ allow_comments: false, who_can_comment: 'none' }).catch(() => {}); } },
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
                  { text: 'Everyone', onPress: async () => { setWhoCanSee('everyone'); await updateCreatorSettings({ who_can_see: 'everyone' }).catch(() => {}); } },
                  { text: 'Subscribers only', onPress: async () => { setWhoCanSee('subscribers'); await updateCreatorSettings({ who_can_see: 'subscribers' }).catch(() => {}); } },
                  { text: 'No one', onPress: async () => { setWhoCanSee('none'); await updateCreatorSettings({ who_can_see: 'none' }).catch(() => {}); } },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            />
          </SettingsSection>

          {/* Analytics */}
          <SettingsSection IconComp={ChartBar} title="Analytics">
            <View style={styles.analyticsRow}>
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsValue}>
                  {recent_stats.reduce((s, p) => s + p.views, 0).toLocaleString()}
                </Text>
                <Text style={styles.analyticsLabel}>Total Views</Text>
              </View>
              <View style={styles.analyticsDivider} />
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsValue}>{subscribers_count}</Text>
                <Text style={styles.analyticsLabel}>Subscribers</Text>
              </View>
            </View>
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
              <Text style={styles.settingsRowValue}>₦1,000</Text>
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

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  errorText: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: T.RADIUS.full, backgroundColor: T.ACCENT,
  },
  retryLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.BG },

  scrollContent: { paddingTop: 8 },

  banner: {
    margin: 20,
    padding: 20,
    backgroundColor: T.TEXT,
    borderRadius: T.RADIUS.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerLeft: { flex: 1 },
  bannerTitle: { fontSize: 17, fontFamily: T.FONT.bold, color: T.BG, letterSpacing: -0.3 },
  bannerSubtitle: {
    fontSize: 12, fontFamily: T.FONT.regular, color: 'rgba(0,0,0,0.6)',
    lineHeight: 18, marginTop: 4,
  },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.ACCENT,
  },
  withdrawLabel: { fontSize: 12, fontFamily: T.FONT.semibold, color: T.BG },

  sectionTitle: {
    fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, letterSpacing: -0.2,
  },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 20, gap: 12, marginBottom: 8,
  },
  statCard: {
    width: '47%',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    padding: 16, gap: 4,
  },
  statIcon: {
    width: 34, height: 34, borderRadius: T.RADIUS.sm,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  statLabel: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  statValue: { fontSize: 20, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.5, marginTop: 2 },
  statChange: { fontSize: 12, fontFamily: T.FONT.medium, marginTop: 2 },

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

  // ── Settings sections ────────────────────────────────────────────────────────
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
  },
  priceSave: {
    backgroundColor: T.ACCENT,
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  priceSaveText: {
    color: T.BG,
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
  priceCancelText: {
    color: T.TEXT_3,
    fontFamily: T.FONT.medium,
    fontSize: 12,
  },

  // Analytics inside settings section
  analyticsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  analyticsItem: { flex: 1, alignItems: 'center', gap: 4 },
  analyticsValue: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.4 },
  analyticsLabel: { fontSize: 10, fontFamily: T.FONT.regular, color: T.TEXT_3, letterSpacing: 0.2 },
  analyticsDivider: { width: 1, height: 36, backgroundColor: T.BORDER_2 },
});
