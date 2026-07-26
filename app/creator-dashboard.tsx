import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChartBar,
  CurrencyDollar,
  TrendUp,
  Users,
  ArrowCircleUp,
  type Icon,
} from 'phosphor-react-native';
import { Spinner } from 'heroui-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import {
  getCreatorDashboard,
  getCreatorSubscribers,
  type CreatorDashboard,
  type PeriodStat,
} from '@/services/creator';

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
            ${stat.revenue.toFixed(2)}
          </Text>
          <Text style={styles.activityStatLabel}>Revenue</Text>
        </View>
      </View>
    </View>
  );
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

  const load = async () => {
    try {
      const [dash, subs] = await Promise.all([
        getCreatorDashboard(),
        getCreatorSubscribers(1),
      ]);
      setDashboard(dash);
      setSubscribers(subs.subscribers ?? []);
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

  const monthRevenue = dashboard?.period_stats?.[0]?.revenue ?? 0;
  const totalRevenue = dashboard?.total_revenue ?? 0;
  const subscribers_count = dashboard?.active_subscribers ?? 0;
  const total_posts = dashboard?.total_posts ?? 0;
  const recent_stats = dashboard?.period_stats?.slice(0, 6) ?? [];

  const STATS = [
    { IconComp: CurrencyDollar, label: 'This Month', value: `$${monthRevenue.toFixed(2)}`, change: totalRevenue > 0 ? `$${totalRevenue.toFixed(2)} total` : '—', positive: totalRevenue > 0 },
    { IconComp: Users,          label: 'Subscribers', value: subscribers_count.toString(), change: subscribers_count > 0 ? 'Active' : '—', positive: subscribers_count > 0 },
    { IconComp: TrendUp,        label: 'Posts',       value: total_posts.toString(), change: total_posts > 0 ? 'Published' : '—', positive: total_posts > 0 },
    { IconComp: ChartBar,       label: 'Engagement',  value: recent_stats[0] ? `${((recent_stats[0].likes / Math.max(recent_stats[0].views, 1)) * 100).toFixed(1)}%` : '0%', change: '—', positive: true },
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
              <Text style={styles.bannerTitle}>Creator Hub ✦</Text>
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
                {recent_stats.map((s, i) => (
                  <ActivityRow key={i} stat={s} />
                ))}
              </View>
            </>
          )}

          {/* Recent subscribers */}
          {subscribers.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Recent Subscribers</Text>
              <View style={styles.subsCard}>
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
              </View>
            </>
          )}

          {/* Quick actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/create-post')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionEmoji}>📸</Text>
              <Text style={styles.actionLabel}>New Post</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/creator-payout')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionEmoji}>💳</Text>
              <Text style={styles.actionLabel}>Payout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/settings')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionEmoji}>⚙️</Text>
              <Text style={styles.actionLabel}>Settings</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      )}
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
    borderWidth: 1, borderColor: T.BORDER_2,
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
    borderWidth: 1, borderColor: T.BORDER_2,
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
    borderWidth: 1, borderColor: T.BORDER_2,
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
    borderWidth: 1, borderColor: T.BORDER_2,
    paddingVertical: 18,
    alignItems: 'center', gap: 8,
  },
  actionEmoji: { fontSize: 24 },
  actionLabel: { fontSize: 12, fontFamily: T.FONT.semibold, color: T.TEXT },
});
