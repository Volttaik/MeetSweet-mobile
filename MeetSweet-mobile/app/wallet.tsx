/**
 * Wallet — Naira wallet for MeetSweet.
 *
 * Features:
 *   1. View Naira balance & transaction history
 *   2. Add money via Paystack bank transfer
 *   3. Quick-add amounts: ₦500, ₦1,000, ₦2,000, ₦5,000, ₦10,000
 *   4. Custom amount input
 *
 * Backend routes:
 *   GET  /api/wallet                              → { balance }
 *   GET  /api/transactions?limit=N                → { transactions: [...] }
 *   POST /api/payments/initiate-paystack { amount }   → { transactionId, accountNumber, bankName, amount }
 *   POST /api/payments/verify-paystack { transactionId } → { success, amountAdded, newBalance }
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Wallet,
  Warning,
} from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import { T } from '@/constants/theme';
import { toast } from '@/components/MsToast';
import { MsShimmer } from '@/components/MsShimmer';
import {
  WALLET_QUICK_AMOUNTS,
  getWallet,
  type Transaction,
  initiateWalletDeposit,
  verifyWalletDeposit,
  type DepositInitResult,
} from '@/services/wallet';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(n: number): string {
  return '₦' + n.toLocaleString('en-NG');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Quick-amount chip ────────────────────────────────────────────────────────

function AmountChip({
  amount,
  selected,
  onSelect,
  label,
}: {
  amount: number;
  selected: boolean;
  onSelect: () => void;
  label?: string;
}) {
  return (
    <Pressable
      style={[chipStyles.chip, selected && chipStyles.chipActive]}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text style={[chipStyles.label, selected && chipStyles.labelActive]}>
        {label ?? formatNaira(amount)}
      </Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.BORDER,
    minWidth: 80,
  },
  chipActive: {
    borderColor: T.TEXT,
    backgroundColor: T.SURFACE_2,
  },
  label: {
    color: T.TEXT_2,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
  },
  labelActive: {
    color: T.TEXT,
  },
});

// ─── Payment pending screen ────────────────────────────────────────────────────

type VerifyState = 'idle' | 'checking' | 'success' | 'failed';

function PaymentPendingView({
  result,
  amount,
  onVerify,
  onBack,
  verifyState,
}: {
  result: DepositInitResult;
  amount: number;
  onVerify: () => void;
  onBack: () => void;
  verifyState: VerifyState;
}) {
  const [copied, setCopied] = useState(false);
  const hasBankTransfer = Boolean(result.accountNumber && result.bankName);

  const copyAccount = async () => {
    if (!result.accountNumber) return;
    await Clipboard.setStringAsync(result.accountNumber);
    setCopied(true);
    toast.success('Account number copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const openPayment = async () => {
    if (!result.authorizationUrl) return;
    try {
      await Linking.openURL(result.authorizationUrl);
    } catch {
      toast.error('Could not open the payment page.');
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pendStyles.scroll}>
      <View style={pendStyles.iconWrap}>
        <Clock size={32} color={T.TEXT} weight="duotone" />
      </View>

      <Text style={pendStyles.title}>Complete Payment</Text>
      <Text style={pendStyles.subtitle}>
        Complete your {formatNaira(result.amount)} payment securely, then return here to confirm.
      </Text>

      {hasBankTransfer && (
        <View style={pendStyles.card}>
          <View style={pendStyles.cardRow}>
            <Text style={pendStyles.cardKey}>BANK</Text>
            <Text style={pendStyles.cardVal}>{result.bankName}</Text>
          </View>
          <View style={pendStyles.separator} />
          <View style={pendStyles.cardRow}>
            <Text style={pendStyles.cardKey}>ACCOUNT NUMBER</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={pendStyles.cardValLarge}>{result.accountNumber}</Text>
              <TouchableOpacity onPress={copyAccount} hitSlop={8}>
                {copied
                  ? <CheckCircle size={18} color={T.SUCCESS} weight="fill" />
                  : <Copy size={18} color={T.TEXT_2} />
                }
              </TouchableOpacity>
            </View>
          </View>
          <View style={pendStyles.separator} />
          <View style={pendStyles.cardRow}>
            <Text style={pendStyles.cardKey}>AMOUNT</Text>
            <Text style={[pendStyles.cardValLarge, { color: T.SUCCESS }]}>
              {formatNaira(result.amount)}
            </Text>
          </View>
        </View>
      )}

      {hasBankTransfer && (
        <View style={pendStyles.infoRow}>
          <Warning size={14} color={T.TEXT_3} />
          <Text style={pendStyles.infoText}>
            Transfer the exact amount shown. Partial or incorrect amounts cannot be confirmed automatically.
          </Text>
        </View>
      )}

      {result.authorizationUrl && (
        <TouchableOpacity
          style={[pendStyles.paidBtn, { backgroundColor: T.SURFACE_2, borderWidth: 1, borderColor: T.BORDER }]}
          onPress={openPayment}
          activeOpacity={0.85}
        >
          <Text style={[pendStyles.paidLabel, { color: T.TEXT }]}>Continue to payment</Text>
        </TouchableOpacity>
      )}

      {verifyState === 'failed' && (
        <View style={pendStyles.failBox}>
          <Text style={pendStyles.failText}>
            Payment not confirmed yet. Please wait a few minutes and try again, or contact support.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[pendStyles.paidBtn, verifyState === 'checking' && pendStyles.paidBtnLoading]}
        onPress={onVerify}
        activeOpacity={0.85}
        disabled={verifyState === 'checking'}
      >
        {verifyState === 'checking' ? (
          <ActivityIndicator color={T.BG} size="small" />
        ) : (
          <Text style={pendStyles.paidLabel}>I have paid</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={pendStyles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Text style={pendStyles.backLabel}>Back to wallet</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const pendStyles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20, marginTop: 8,
  },
  title: {
    color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 22,
    letterSpacing: -0.5, textAlign: 'center',
  },
  subtitle: {
    color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13,
    textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 24,
  },
  card: {
    backgroundColor: T.SURFACE, borderRadius: T.RADIUS.xl,
    borderWidth: 1, borderColor: T.BORDER, overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  separator: { height: 1, backgroundColor: T.BORDER, marginHorizontal: 18 },
  cardKey: { color: T.TEXT_3, fontFamily: T.FONT.semibold, fontSize: 10, letterSpacing: 0.6 },
  cardVal: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 13 },
  cardValLarge: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 17, letterSpacing: -0.3 },
  infoRow: {
    flexDirection: 'row', gap: 8, marginTop: 16, padding: 13,
    backgroundColor: T.SURFACE, borderRadius: T.RADIUS.md, alignItems: 'flex-start',
  },
  infoText: { flex: 1, color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11, lineHeight: 17 },
  failBox: { marginTop: 16, padding: 14, backgroundColor: `${T.ERROR}14`, borderRadius: T.RADIUS.md },
  failText: { color: T.ERROR, fontFamily: T.FONT.regular, fontSize: 12, lineHeight: 18 },
  paidBtn: {
    height: 52, borderRadius: T.RADIUS.full, backgroundColor: T.TEXT,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  paidBtnLoading: { opacity: 0.7 },
  paidLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 15 },
  backBtn: { alignItems: 'center', paddingVertical: 16 },
  backLabel: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13 },
});

// ─── Success screen ────────────────────────────────────────────────────────────

function SuccessView({
  amountAdded,
  balance,
  onDone,
}: {
  amountAdded: number;
  balance: number;
  onDone: () => void;
}) {
  return (
    <View style={successStyles.wrap}>
      <View style={successStyles.iconWrap}>
        <CheckCircle size={48} color={T.SUCCESS} weight="fill" />
      </View>
      <Text style={successStyles.title}>Money Added!</Text>
      <Text style={successStyles.sub}>
        {formatNaira(amountAdded)} has been added to your wallet.
      </Text>
      <View style={successStyles.balanceRow}>
        <Wallet size={16} color={T.TEXT_2} />
        <Text style={successStyles.balanceText}>New balance: {formatNaira(balance)}</Text>
      </View>
      <TouchableOpacity style={successStyles.btn} onPress={onDone} activeOpacity={0.85}>
        <Text style={successStyles.btnLabel}>Back to Wallet</Text>
      </TouchableOpacity>
    </View>
  );
}

const successStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap: { marginBottom: 20 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 26, letterSpacing: -0.5 },
  sub: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  balanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 20,
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: T.SURFACE, borderRadius: T.RADIUS.full,
  },
  balanceText: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  btn: {
    marginTop: 32, height: 52, paddingHorizontal: 40,
    borderRadius: T.RADIUS.full, backgroundColor: T.TEXT,
    alignItems: 'center', justifyContent: 'center',
  },
  btnLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 15 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

type ScreenStep = 'wallet' | 'pending' | 'success';
const CUSTOM_ID = -1;

export default function WalletScreen() {
  const insets = useSafeAreaInsets();

  const [step, setStep]                   = useState<ScreenStep>('wallet');
  const [selectedAmount, setSelectedAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount]   = useState('');
  const [isCustom, setIsCustom]           = useState(false);
  const [balance, setBalance]             = useState<number | null>(null);
  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [initiating, setInitiating]       = useState(false);
  const [depositResult, setDepositResult] = useState<DepositInitResult | null>(null);
  const [verifyState, setVerifyState]     = useState<VerifyState>('idle');
  const [addedAmount, setAddedAmount]     = useState(0);
  const [newBalance, setNewBalance]       = useState(0);

  useEffect(() => {
    getWallet()
      .then(({ balance: b, transactions: t }) => {
        setBalance(b);
        setTransactions(t);
      })
      .catch(() => {})
      .finally(() => setLoadingWallet(false));
  }, []);

  const effectiveAmount = isCustom
    ? Math.max(0, parseInt(customAmount.replace(/\D/g, ''), 10) || 0)
    : selectedAmount;

  const handleAddMoney = async () => {
    const amt = effectiveAmount;
    if (amt < 500) {
      toast.error('Minimum deposit is ₦500');
      return;
    }
    if (initiating) return;
    setInitiating(true);
    try {
      const result = await initiateWalletDeposit(amt);
      setDepositResult(result);
      setStep('pending');
      setVerifyState('idle');
    } catch {
      toast.error('Could not initiate payment. Please try again.');
    } finally {
      setInitiating(false);
    }
  };

  const handleVerify = async () => {
    if (!depositResult || verifyState === 'checking') return;
    setVerifyState('checking');
    try {
      const res = await verifyWalletDeposit(depositResult.transactionId);
      if (res.success) {
        setAddedAmount(res.amountAdded);
        setNewBalance(res.newBalance);
        setBalance(res.newBalance);
        setStep('success');
      } else {
        setVerifyState('failed');
      }
    } catch {
      setVerifyState('failed');
    }
  };

  if (step === 'success') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => setStep('wallet')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={styles.placeholder} />
        </View>
        <SuccessView amountAdded={addedAmount} balance={newBalance} onDone={() => setStep('wallet')} />
      </View>
    );
  }

  if (step === 'pending' && depositResult) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => setStep('wallet')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
          <Text style={styles.headerTitle}>Transfer Payment</Text>
          <View style={styles.placeholder} />
        </View>
        <PaymentPendingView
          result={depositResult}
          amount={effectiveAmount}
          onVerify={handleVerify}
          onBack={() => setStep('wallet')}
          verifyState={verifyState}
        />
      </View>
    );
  }

  // ── Wallet screen ─────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Balance card */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceBg}>
              <Wallet size={80} color="rgba(255,255,255,0.06)" weight="fill" />
            </View>
            <View style={styles.walletIconWrap}>
              <Wallet size={22} color="#fff" weight="fill" />
            </View>
            <Text style={styles.balanceLabel}>WALLET BALANCE</Text>
            {loadingWallet ? (
              <MsShimmer width="55%" height={40} borderRadius={8} style={{ marginTop: 6 }} />
            ) : (
              <Text style={styles.balance}>{formatNaira(balance ?? 0)}</Text>
            )}
            <Text style={styles.balanceHint}>Your Naira balance for subscriptions</Text>
          </View>

          {/* Transaction history */}
          {!loadingWallet && (
            <>
              <Text style={styles.sectionTitle}>Transaction History</Text>
              {transactions.length === 0 ? (
                <View style={[styles.transactions, { paddingVertical: 20, alignItems: 'center' }]}>
                  <Text style={{ color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 13 }}>
                    No transactions yet
                  </Text>
                </View>
              ) : (
              <View style={styles.transactions}>
                {transactions.slice(0, 10).map((tx, idx) => (
                  <View key={tx.id}>
                    {idx > 0 && <View style={styles.txDivider} />}
                    <View style={styles.txRow}>
                      <View style={styles.txLeft}>
                        <Text style={styles.txDesc}>{tx.description}</Text>
                        <Text style={styles.txDate}>{formatTime(tx.createdAt)}</Text>
                      </View>
                      <View style={styles.txRight}>
                        <Text style={[
                          styles.txAmount,
                          tx.type === 'credit' ? styles.txCredit : styles.txDebit,
                        ]}>
                          {tx.type === 'credit' ? '+' : '-'}{formatNaira(tx.amount)}
                        </Text>
                        <Text style={[
                          styles.txStatus,
                          tx.status === 'success' ? styles.txStatusSuccess : tx.status === 'failed' ? styles.txStatusFailed : styles.txStatusPending,
                        ]}>
                          {tx.status === 'success' ? 'Completed' : tx.status === 'failed' ? 'Failed' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              )}
            </>
          )}

          {/* Add money section */}
          <View style={styles.addSection}>
            <Text style={styles.sectionTitle}>Add Money</Text>
            <View style={styles.sectionMeta}>
              <CreditCard size={11} color={T.TEXT_3} />
              <Text style={styles.poweredBy}>Powered by Paystack</Text>
            </View>
          </View>

          {/* Quick-add chips — 2 rows of 3 */}
          <View style={styles.chipsGrid}>
            {WALLET_QUICK_AMOUNTS.map((amt) => (
              <AmountChip
                key={amt}
                amount={amt}
                selected={!isCustom && selectedAmount === amt}
                onSelect={() => { setIsCustom(false); setSelectedAmount(amt); }}
              />
            ))}
            <AmountChip
              amount={CUSTOM_ID}
              selected={isCustom}
              onSelect={() => setIsCustom(true)}
              label="Custom"
            />
          </View>

          {/* Custom amount input */}
          {isCustom && (
            <View style={styles.customRow}>
              <Text style={styles.currencySign}>₦</Text>
              <TextInput
                style={styles.customInput}
                value={customAmount}
                onChangeText={(v) => setCustomAmount(v.replace(/\D/g, ''))}
                placeholder="Enter amount (min ₦500)"
                placeholderTextColor={T.TEXT_3}
                keyboardType="numeric"
                maxLength={8}
                autoFocus
              />
            </View>
          )}

          <View style={styles.infoRow}>
            <Warning size={13} color={T.TEXT_3} />
            <Text style={styles.infoText}>Minimum deposit is ₦500. Funds appear within minutes after transfer confirmation.</Text>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, (initiating || effectiveAmount < 500) && styles.addBtnDisabled]}
            onPress={handleAddMoney}
            activeOpacity={0.85}
            disabled={initiating || effectiveAmount < 500}
          >
            {initiating ? (
              <ActivityIndicator color={T.BG} size="small" />
            ) : (
              <Text style={styles.addLabel}>
                Add {effectiveAmount >= 500 ? formatNaira(effectiveAmount) : 'Money'} to Wallet
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.secureText}>Secure payment via Paystack bank transfer</Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: {
    height: 60, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: T.BORDER,
  },
  back: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center', color: T.TEXT,
    fontFamily: T.FONT.semibold, fontSize: 15,
  },
  placeholder: { width: 36 },
  content: { padding: 20, paddingBottom: 48, gap: 0 },

  balanceCard: {
    backgroundColor: '#1B4332',
    borderRadius: T.RADIUS.xl,
    padding: 22,
    minHeight: 160,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 24,
  },
  balanceBg: {
    position: 'absolute', top: -10, right: -10,
    transform: [{ scale: 2 }],
  },
  walletIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  balanceLabel: {
    color: 'rgba(134,239,172,0.75)',
    fontFamily: T.FONT.semibold, fontSize: 9,
    letterSpacing: 1.4, marginTop: 16,
  },
  balance: {
    color: '#D1FAE5', fontFamily: T.FONT.bold,
    fontSize: 34, letterSpacing: -1, marginTop: 2,
  },
  balanceHint: {
    color: 'rgba(134,239,172,0.55)',
    fontFamily: T.FONT.regular, fontSize: 11, marginTop: 8, lineHeight: 17,
  },

  transactions: {
    borderRadius: T.RADIUS.md, borderWidth: 1,
    borderColor: T.BORDER, overflow: 'hidden',
    backgroundColor: T.SURFACE, marginBottom: 24,
  },
  txDivider: { height: 1, backgroundColor: T.BORDER },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  txLeft: { flex: 1 },
  txDesc: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT },
  txDate: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 2 },
  txAmount: { fontSize: 13, fontFamily: T.FONT.semibold },
  txCredit: { color: T.SUCCESS },
  txDebit: { color: T.TEXT_2 },
  txStatus: { fontSize: 10, fontFamily: T.FONT.regular },
  txStatusSuccess: { color: T.SUCCESS },
  txStatusFailed: { color: T.ERROR },
  txStatusPending: { color: T.TEXT_3 },

  addSection: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  sectionTitle: {
    color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15, marginBottom: 12,
  },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  poweredBy: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },

  chipsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },

  customRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.SURFACE, borderRadius: T.RADIUS.md,
    paddingHorizontal: 16, paddingVertical: 4,
    marginBottom: 12, borderWidth: 1, borderColor: T.BORDER_2,
  },
  currencySign: {
    color: T.TEXT_2, fontFamily: T.FONT.semibold, fontSize: 18, marginRight: 4,
  },
  customInput: {
    flex: 1, height: 48, fontSize: 18,
    fontFamily: T.FONT.medium, color: T.TEXT,
  },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, marginBottom: 20, padding: 12,
    backgroundColor: T.SURFACE, borderRadius: T.RADIUS.md,
  },
  infoText: { flex: 1, color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11, lineHeight: 17 },

  addBtn: {
    height: 54, borderRadius: T.RADIUS.full, backgroundColor: T.TEXT,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.45 },
  addLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 15 },

  secureText: {
    textAlign: 'center', color: T.TEXT_3,
    fontFamily: T.FONT.regular, fontSize: 11, marginTop: 12,
  },
});
