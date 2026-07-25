/**
 * Creator Payout screen.
 * Balance is fetched from GET /wallet (live endpoint).
 * Withdrawal request requires backend implementation — see BACKEND_REQUIRED.md.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowDown, Bank, CheckCircle, Clock, XCircle } from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsSkeletonCard } from '@/components/MsSkeletonCard';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { toast } from '@/components/MsToast';
import { getWallet, type Transaction } from '@/services/wallet';

const MIN_WITHDRAWAL = 20; // USD

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type TxStatus = 'completed' | 'pending' | 'rejected';

function statusOf(tx: Transaction): TxStatus {
  const desc = tx.description.toLowerCase();
  if (desc.includes('pending')) return 'pending';
  if (desc.includes('rejected') || desc.includes('failed')) return 'rejected';
  return 'completed';
}

function StatusBadge({ status }: { status: TxStatus }) {
  const config = {
    completed: { color: T.SUCCESS, label: 'Completed' },
    pending: { color: '#F59E0B', label: 'Pending' },
    rejected: { color: T.ERROR, label: 'Rejected' },
  }[status];

  return (
    <View style={[badge.wrap, { backgroundColor: `${config.color}18` }]}>
      <Text style={[badge.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.RADIUS.full,
  },
  label: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
  },
});

// ─── Transaction row ──────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'credit';
  const status = statusOf(tx);

  return (
    <View style={styles.txRow}>
      <View
        style={[
          styles.txIcon,
          { backgroundColor: isCredit ? `${T.SUCCESS}18` : `${T.ERROR}18` },
        ]}
      >
        {status === 'completed' ? (
          <CheckCircle
            size={18}
            color={isCredit ? T.SUCCESS : T.ERROR}
            weight="fill"
          />
        ) : status === 'pending' ? (
          <Clock size={18} color="#F59E0B" weight="fill" />
        ) : (
          <XCircle size={18} color={T.ERROR} weight="fill" />
        )}
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txDesc} numberOfLines={1}>
          {tx.description}
        </Text>
        <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
      </View>
      <View style={styles.txRight}>
        <Text
          style={[
            styles.txAmount,
            { color: isCredit ? T.SUCCESS : T.TEXT_2 },
          ]}
        >
          {isCredit ? '+' : '-'}
          {formatCurrency(tx.amount)}
        </Text>
        <StatusBadge status={status} />
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreatorPayoutScreen() {
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawConfirm, setWithdrawConfirm] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getWallet();
      setBalance(data.balance);
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

  const handleWithdraw = () => {
    const bal = balance ?? 0;
    if (bal < MIN_WITHDRAWAL) {
      Alert.alert(
        'Minimum Withdrawal',
        `You need at least ${formatCurrency(MIN_WITHDRAWAL)} to make a withdrawal. Your current balance is ${formatCurrency(bal)}.`,
        [{ text: 'OK' }],
      );
      return;
    }
    setWithdrawConfirm(true);
  };

  const doWithdraw = async () => {
    setWithdrawConfirm(false);
    // POST /creator/withdraw — not yet implemented on backend
    toast.info('Withdrawal request submitted. Processing in 3–5 business days.');
  };

  const handleAddPaymentMethod = () => {
    Alert.alert(
      'Payment Method',
      'Connect your bank account or PayPal to receive payouts.\n\nThis feature requires backend implementation (see BACKEND_REQUIRED.md).',
      [{ text: 'OK' }],
    );
  };

  const canWithdraw = (balance ?? 0) >= MIN_WITHDRAWAL;

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
        <Text style={styles.headerTitle}>Payouts</Text>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={T.TEXT}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View>
            {/* Balance card */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              {loading ? (
                <MsSkeletonCard height={44} style={{ marginVertical: 8 }} />
              ) : (
                <Text style={styles.balanceAmount}>
                  {formatCurrency(balance ?? 0)}
                </Text>
              )}
              <Text style={styles.balanceNote}>
                Minimum withdrawal: {formatCurrency(MIN_WITHDRAWAL)}
              </Text>

              <TouchableOpacity
                style={[styles.withdrawBtn, !canWithdraw && styles.withdrawBtnDisabled]}
                onPress={handleWithdraw}
                activeOpacity={0.85}
              >
                <ArrowDown size={16} color={canWithdraw ? T.BG : T.TEXT_3} />
                <Text
                  style={[
                    styles.withdrawLabel,
                    !canWithdraw && { color: T.TEXT_3 },
                  ]}
                >
                  Withdraw Funds
                </Text>
              </TouchableOpacity>
            </View>

            {/* Payment method */}
            <TouchableOpacity
              style={styles.paymentCard}
              onPress={handleAddPaymentMethod}
              activeOpacity={0.8}
            >
              <View style={styles.paymentIcon}>
                <Bank size={20} color={T.TEXT_2} />
              </View>
              <View style={styles.paymentText}>
                <Text style={styles.paymentTitle}>Payment Method</Text>
                <Text style={styles.paymentSub}>Add bank account or PayPal</Text>
              </View>
              <Text style={styles.paymentAdd}>+ Add</Text>
            </TouchableOpacity>

            {/* History header */}
            <Text style={styles.sectionTitle}>Transaction History</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: 20, gap: 10 }}>
              <MsSkeletonCard height={60} />
              <MsSkeletonCard height={60} />
              <MsSkeletonCard height={60} />
            </View>
          ) : (
            <MsEmptyState
              title="No transactions yet"
              message="Your earnings and withdrawals will appear here once you start receiving payments."
            />
          )
        }
        renderItem={({ item }) => <TransactionRow tx={item} />}
        ItemSeparatorComponent={() => <View style={styles.txSeparator} />}
      />

      {/* Withdrawal confirm */}
      <MsConfirmDialog
        visible={withdrawConfirm}
        title="Withdraw Funds"
        message={`Request a withdrawal of ${formatCurrency(balance ?? 0)} to your connected payment method? Processing takes 3–5 business days.`}
        confirmLabel="Request Withdrawal"
        onConfirm={doWithdraw}
        onCancel={() => setWithdrawConfirm(false)}
      />
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
    fontSize: 40,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -1.5,
    marginVertical: 4,
  },
  balanceNote: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
  },
  withdrawBtnDisabled: {
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER_2,
  },
  withdrawLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },

  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    gap: 14,
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentText: { flex: 1 },
  paymentTitle: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  paymentSub: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginTop: 2,
  },
  paymentAdd: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_2,
  },

  sectionTitle: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: { flex: 1 },
  txDesc: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  txDate: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 2,
  },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: {
    fontSize: 14,
    fontFamily: T.FONT.bold,
  },
  txSeparator: {
    height: 1,
    backgroundColor: T.BORDER,
    marginLeft: 70,
  },
});
