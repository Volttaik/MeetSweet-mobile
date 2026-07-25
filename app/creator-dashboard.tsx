/**
 * Creator Dashboard screen.
 * Balance and transactions are fetched from the live GET /wallet endpoint.
 * Creator-specific analytics (views, subscribers by period) require backend
 * implementation — documented in BACKEND_REQUIRED.md.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  TrendUp,
  Users,
  CurrencyDollar,
  Eye,
  ArrowDown,
  ArrowRight,
  Star,
  type Icon,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsSkeletonCard } from '@/components/MsSkeletonCard';
import { MsEmptyState } from '@/components/MsEmptyState';
import { toast } from '@/components/MsToast';
import { useAuth } from '@/contexts/AuthContext';
import { getWallet, type Transaction } from '@/services/wallet';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  Icon,
  label,
  value,
  sub,
  accent = false,
}: {
  Icon: Icon;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <View style={styles.statIcon}>
        <Icon size={16} color={accent ? T.TEXT : T.TEXT_2} />
      </View>
      <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'credit';
  return (
    <View style={styles.txRow}>
      <View style={[styles.txDot, { backgroundColor: isCredit ? T.SUCCESS : T.BORDER_2 }]} />
      <View style={styles.txInfo}>
        <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
        <Text style={styles.txDate}>
          {new Date(tx.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>
      <Text style={[styles.txAmount, { color: isCredit ? T.SUCCESS : T.TEXT_2 }]}>
        {isCredit ? '+' : '-'}${tx.amount.toFixed(2)}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreatorDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getWallet();
      setBalance(data.balance ?? 0);
      setTransactions(data.transactions ?? []);
    } catch {
      toast.error('Could not load wallet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  // Derive simple stats from wallet transactions
  const totalEarned = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  const recentTx = transactions.slice(0, 5);

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

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={T.TEXT}
          />
        }
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          {loading ? (
            <MsSkeletonCard height={48} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.balanceAmount}>${(balance ?? 0).toFixed(2)}</Text>
          )}
          <Text style={styles.balanceSub}>
            Lifetime earnings: ${totalEarned.toFixed(2)}
          </Text>
          <TouchableOpacity
            style={styles.withdrawBtn}
            onPress={() => router.push('/creator-payout')}
            activeOpacity={0.85}
          >
            <ArrowDown size={14} color={T.BG} />
            <Text style={styles.withdrawLabel}>Withdraw Funds</Text>
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <Text style={styles.sectionTitle}>Overview</Text>
        {loading ? (
          <View style={styles.statsGrid}>
            {[1, 2, 3, 4].map((i) => (
              <MsSkeletonCard key={i} height={90} style={{ flex: 1, minWidth: '44%' }} />
            ))}
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard
              Icon={Users}
              label="Subscribers"
              value={String(user?.subscriberCount ?? 0)}
              sub="total"
              accent
            />
            <StatCard
              Icon={Users}
              label="Followers"
              value={String(user?.followerCount ?? 0)}
              sub="total"
            />
            <StatCard
              Icon={Eye}
              label="Profile Views"
              value="—"
              sub="requires analytics"
            />
            <StatCard
              Icon={TrendUp}
              label="Engagement"
              value="—"
              sub="requires analytics"
            />
          </View>
        )}

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Creator Tools</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/creator-payout')}
            activeOpacity={0.8}
          >
            <CurrencyDollar size={20} color={T.TEXT_2} />
            <Text style={styles.actionLabel}>Payouts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/become-creator')}
            activeOpacity={0.8}
          >
            <Star size={20} color={T.TEXT_2} />
            <Text style={styles.actionLabel}>Plans</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/create-post')}
            activeOpacity={0.8}
          >
            <TrendUp size={20} color={T.TEXT_2} />
            <Text style={styles.actionLabel}>New Post</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => toast.info('Analytics coming soon')}
            activeOpacity={0.8}
          >
            <Eye size={20} color={T.TEXT_2} />
            <Text style={styles.actionLabel}>Analytics</Text>
          </TouchableOpacity>
        </View>

        {/* Recent transactions */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {transactions.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/creator-payout')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.txList}>
            {[1, 2, 3].map((i) => (
              <MsSkeletonCard key={i} height={56} />
            ))}
          </View>
        ) : recentTx.length === 0 ? (
          <MsEmptyState
            title="No transactions yet"
            message="Your earnings and activity will appear here once you start receiving payments."
          />
        ) : (
          <View style={styles.txList}>
            {recentTx.map((tx) => <TxRow key={tx.id} tx={tx} />)}
          </View>
        )}

        {/* Analytics coming soon */}
        <View style={styles.analyticsPlaceholder}>
          <Text style={styles.analyticsTitle}>Advanced Analytics</Text>
          <Text style={styles.analyticsText}>
            Detailed revenue charts, subscriber growth, content performance,
            and audience insights are available once the analytics backend
            is implemented. See BACKEND_REQUIRED.md for the full specification.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    width: 38,
    height: 38,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
    textAlign: 'center',
  },

  scroll: { paddingTop: 8 },

  balanceCard: {
    margin: 20,
    padding: 24,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    alignItems: 'center',
    gap: 6,
  },
  balanceLabel: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 42,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -1.5,
    marginVertical: 4,
  },
  balanceSub: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
  },
  withdrawLabel: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },

  sectionTitle: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
  },
  seeAll: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    paddingBottom: 4,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    padding: 14,
    gap: 4,
  },
  statCardAccent: {
    borderColor: 'rgba(255,255,255,0.2)',
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: T.RADIUS.sm,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },
  statLabelAccent: { color: T.TEXT_2 },
  statValue: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.5,
  },
  statValueAccent: { color: T.TEXT },
  statSub: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  actionCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  txList: {
    marginHorizontal: 20,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    overflow: 'hidden',
    gap: 0,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  txDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  txInfo: { flex: 1 },
  txDesc: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  txDate: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 13,
    fontFamily: T.FONT.bold,
  },

  analyticsPlaceholder: {
    margin: 20,
    marginTop: 12,
    padding: 20,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    gap: 8,
  },
  analyticsTitle: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  analyticsText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    lineHeight: 20,
  },
});
