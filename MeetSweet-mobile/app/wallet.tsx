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
 *   GET  /api/wallet                              → { balance, transactions: [...] }
 *   POST /api/payments/initiate-paystack { amount }   → { transactionId, accountNumber, bankName, amount }
 *   POST /api/payments/verify-paystack { transactionId } → { success, amountAdded, newBalance }
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Redirect } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  ArrowLeft,
  CaretDown,
  CaretUp,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Wallet,
  Warning,
} from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { T, alpha, RoseGradient, AppGradients } from '@/constants/theme';
import { GradientBorder } from '@/components/GradientBorder';
import { useScrollMotion } from '@/lib/scroll-motion';
import { GradientText } from '@/components/GradientText';
import { toast } from '@/components/MsToast';
import { MsShimmer } from '@/components/MsShimmer';
import { MsEmptyState } from '@/components/MsEmptyState';
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

// Transaction types that represent money IN (credits) vs money OUT (debits).
// Creator earning types (subscription_earn / album_unlock_earn) and referral
// rewards (referral_reward, +₦200 into the wallet) are credits too, otherwise
// a creator's wallet would show their earnings/rewards as a debit.
const INCOMING_TYPES = new Set([
  'credit',
  'deposit', // legacy deposit rows
  'subscription_earn',
  'album_unlock_earn',
  'referral_reward',
]);
function isIncoming(type: string): boolean {
  return INCOMING_TYPES.has(type);
}

function statusLabel(status: string): string {
  if (status === 'success' || status === 'completed') return 'Completed';
  if (status === 'failed' || status === 'reversed') return 'Failed';
  if (status === 'processing') return 'Processing';
  return 'Pending';
}

// ─── Single transaction row ───────────────────────────────────────────────────

function TransactionRow({ tx, first }: { tx: Transaction; first?: boolean }) {
  return (
    <View>
      {!first && <View style={styles.txDivider} />}
      <View style={styles.txRow}>
        <View style={styles.txLeft}>
          <Text style={styles.txDesc}>{tx.description}</Text>
          <Text style={styles.txDate}>{formatTime(tx.createdAt)}</Text>
        </View>
        <View style={styles.txRight}>
          <Text style={[
            styles.txAmount,
            isIncoming(tx.type) ? styles.txCredit : styles.txDebit,
          ]}>
            {isIncoming(tx.type) ? '+' : '-'}{formatNaira(tx.amount)}
          </Text>
          <Text style={[
            styles.txStatus,
            tx.status === 'success' || tx.status === 'completed' ? styles.txStatusSuccess : tx.status === 'failed' || tx.status === 'reversed' ? styles.txStatusFailed : styles.txStatusPending,
          ]}>
            {statusLabel(tx.status)}
          </Text>
        </View>
      </View>
    </View>
  );
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
    // Compact: size to the label, not stretched across the row.
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.BORDER,
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
  const [openingPayment, setOpeningPayment] = useState(false);
  const hasBankTransfer = Boolean(result.accountNumber && result.bankName);

  const copyAccount = async () => {
    if (!result.accountNumber) return;
    await Clipboard.setStringAsync(result.accountNumber);
    setCopied(true);
    toast.success('Account number copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const openPayment = async () => {
    if (!result.authorizationUrl || openingPayment) return;
    setOpeningPayment(true);
    try {
      // In-app browser (Android Custom Tabs / iOS Safari View Controller) —
      // keeps the Paystack hosted checkout inside MeetSweet instead of
      // launching the external Chrome app. The real payment still completes
      // on Paystack and is confirmed via verify-paystack below.
      await WebBrowser.openBrowserAsync(result.authorizationUrl, {
        toolbarColor: T.BG,
        controlsColor: T.ACCENT,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch {
      toast.error('Could not open the payment page.');
    } finally {
      setOpeningPayment(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} contentContainerStyle={pendStyles.scroll}>
      <View style={pendStyles.iconWrap}>
        <Clock size={32} color={T.TEXT} weight="duotone" />
      </View>

      <Text style={pendStyles.title}>Complete Payment</Text>
      <Text style={pendStyles.subtitle}>
        Complete your {formatNaira(result.amount)} payment securely, then return here to confirm.
      </Text>

      {hasBankTransfer && (
        <GradientBorder radius={T.RADIUS.xl} surface={T.SURFACE} style={pendStyles.card}>
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
        </GradientBorder>
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
          style={[pendStyles.primaryBtnWrap, openingPayment && pendStyles.primaryBtnLoading]}
          onPress={openPayment}
          activeOpacity={0.85}
          disabled={openingPayment}
        >
          {/* Brand gradient CTA — purple → crimson, the primary payment action */}
          <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} style={pendStyles.primaryBtn}>
            {openingPayment ? (
              <>
                <ActivityIndicator size="small" color={T.ACCENT_FG} />
                <Text style={[pendStyles.primaryLabel, { marginLeft: 8 }]}>Opening Paystack…</Text>
              </>
            ) : (
              <Text style={pendStyles.primaryLabel}>Continue to payment</Text>
            )}
          </LinearGradient>
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
        style={[pendStyles.secondaryBtn, verifyState === 'checking' && pendStyles.paidBtnLoading]}
        onPress={onVerify}
        activeOpacity={0.85}
        disabled={verifyState === 'checking'}
      >
        {verifyState === 'checking' ? (
          <ActivityIndicator color={T.BG} size="small" />
        ) : (
          <Text style={[pendStyles.paidLabel, { color: T.TEXT }]}>I have paid</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={pendStyles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Text style={pendStyles.backLabel}>Back to wallet</Text>
      </TouchableOpacity>
    </KeyboardAwareScrollViewCompat>
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
    borderRadius: T.RADIUS.xl,
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
  primaryBtnWrap: {
    height: 52, borderRadius: T.RADIUS.full,
    marginTop: 24, overflow: 'hidden',
    ...T.SHADOWS.soft,
  },
  primaryBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
  },
  primaryBtnLoading: { opacity: 0.85 },
  primaryLabel: { color: T.ACCENT_FG, fontFamily: T.FONT.semibold, fontSize: 15 },
  secondaryBtn: {
    height: 52, borderRadius: T.RADIUS.full, backgroundColor: T.SURFACE_2,
    borderWidth: 1, borderColor: T.BORDER,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
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
  const { isAuthenticated, isLoading, user } = useAuth();

  const [step, setStep]                   = useState<ScreenStep>('wallet');
  const [selectedAmount, setSelectedAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount]   = useState('');
  const [isCustom, setIsCustom]           = useState(false);
  // Balance comes from the shared WalletContext — one authoritative source for
  // this page, the Home header badge, and every other balance-dependent UI.
  const { balance, refreshWallet, setBalance } = useWallet();
  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [walletError, setWalletError]     = useState(false);
  const [initiating, setInitiating]       = useState(false);
  const [depositResult, setDepositResult] = useState<DepositInitResult | null>(null);
  const [verifyState, setVerifyState]     = useState<VerifyState>('idle');
  const [addedAmount, setAddedAmount]     = useState(0);
  const [newBalance, setNewBalance]       = useState(0);
  // Collapsible transaction list: two most recent by default, expandable to all.
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);

  const loadWallet = () => {
    setLoadingWallet(true);
    setWalletError(false);
    Promise.all([
      // Refresh the shared balance (updates the header badge + this page).
      refreshWallet(),
      getWallet().then(({ transactions: t }) => setTransactions(t)),
    ])
      .catch(() => setWalletError(true))
      .finally(() => setLoadingWallet(false));
  };

  useEffect(() => {
    loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SweetSocket is the live source for wallet and transaction changes. The
  // initial GET above hydrates history; these handlers patch only the affected
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
        // Server-confirmed new balance → publish to the shared wallet store so
        // the Home header badge (and any other balance UI) updates instantly.
        setBalance(res.newBalance);
        setStep('success');
      } else {
        setVerifyState('failed');
      }
    } catch {
      setVerifyState('failed');
    }
  };

  // Authenticated screen only — a logged-out visit (stale navigation history
  // or a direct web URL) must land on Login, never a placeholder shell.
  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: T.BG }} />;
  }
  if (!isAuthenticated) {
    return <Redirect href="/auth" />;
  }

  if (step === 'success') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => setStep('wallet')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
          <GradientText text="Wallet" style={styles.headerTitle} />
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
        <Pressable style={styles.back} onPress={() => goBack()}>
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <GradientText text="Wallet" style={styles.headerTitle} />
        <View style={styles.placeholder} />
      </View>

      <KeyboardAwareScrollViewCompat {...useScrollMotion()} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Balance card */}
          <LinearGradient colors={[RoseGradient.colors[0], RoseGradient.colors[2]]} style={styles.balanceCard}>
            <View style={styles.balanceGlow} pointerEvents="none" />
            <View style={styles.balanceTopRow}>
              <View style={styles.walletIconWrap}>
                <Wallet size={20} color={T.ACCENT_FG} weight="fill" />
              </View>
              <LinearGradient
                colors={AppGradients.brand}
                locations={AppGradients.brandLocs}
                start={AppGradients.brandStart}
                end={AppGradients.brandEnd}
                style={styles.balanceMethodPill}
              >
                <CreditCard size={11} color="#FFFFFF" weight="fill" />
                <Text style={styles.balanceMethodText}>Paystack</Text>
              </LinearGradient>
            </View>
            <Text style={styles.balanceLabel}>WALLET BALANCE</Text>
            {loadingWallet ? (
              <MsShimmer width="55%" height={42} borderRadius={8} style={{ marginTop: 4 }} />
            ) : walletError ? (
              <Text style={styles.balance}>—</Text>
            ) : (
              <Text style={styles.balance}>{formatNaira(balance ?? 0)}</Text>
            )}
            <Text style={styles.balanceHint}>Your Naira balance for subscriptions</Text>
          </LinearGradient>

          {/* Recent transactions — two by default, expandable to all */}
          {!loadingWallet && (
            <>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              {walletError ? (
                <View style={styles.transactions}>
                  <MsEmptyState
                    title="Couldn't load wallet"
                    message="Check your connection and try again."
                    actionLabel="Retry"
                    onAction={loadWallet}
                  />
                </View>
              ) : transactions.length === 0 ? (
                <View style={styles.transactions}>
                  <MsEmptyState
                    title="No transactions yet"
                    message="Your deposits and purchases will show up here."
                  />
                </View>
              ) : (
              <View style={styles.transactions}>
                {transactions.slice(0, 2).map((tx, i) => (
                  <TransactionRow key={tx.id} tx={tx} first={i === 0} />
                ))}

                {/* Expanded list — bounded height, scrolls independently so the
                    Add Money controls below stay visible without scrolling
                    through every transaction. */}
                {transactionsExpanded && transactions.length > 2 && (
                  <ScrollView
                    style={styles.txExpandedScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {transactions.slice(2).map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} />
                    ))}
                  </ScrollView>
                )}

                {transactions.length > 2 && (
                  <>
                    <View style={styles.txDivider} />
                    <TouchableOpacity
                      style={styles.txToggleBtn}
                      onPress={() => setTransactionsExpanded((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.txToggleLabel}>
                        {transactionsExpanded
                          ? 'Collapse'
                          : `View all (${transactions.length})`}
                      </Text>
                      {transactionsExpanded
                        ? <CaretUp size={14} color={T.TEXT_2} weight="bold" />
                        : <CaretDown size={14} color={T.TEXT_2} weight="bold" />}
                    </TouchableOpacity>
                  </>
                )}
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
                selectionColor={T.CARET}
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

        </KeyboardAwareScrollViewCompat>
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
    borderRadius: T.RADIUS.xl,
    padding: 22,
    minHeight: 168,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: alpha(T.ACCENT, 0.18),
  },
  balanceGlow: {
    position: 'absolute',
    top: -70, right: -50,
    width: 190, height: 190,
    borderRadius: 95,
    backgroundColor: alpha(T.ACCENT, 0.16),
  },
  balanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  walletIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: alpha(T.SECONDARY, 0.22),
    alignItems: 'center', justifyContent: 'center',
  },
  balanceMethodPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: T.RADIUS.full,
    // Brand gradient fill — the platform gradient is the pill's identity.
    overflow: 'hidden',
  },
  balanceMethodText: {
    color: '#FFFFFF', fontFamily: T.FONT.semibold, fontSize: 10,
    letterSpacing: 0.4,
  },
  balanceLabel: {
    color: alpha(T.ACCENT_FG, 0.5),
    fontFamily: T.FONT.semibold, fontSize: 10,
    letterSpacing: 1.5,
  },
  balance: {
    color: T.ACCENT_FG, fontFamily: T.FONT.bold,
    fontSize: 36, letterSpacing: -1, marginTop: 4,
  },
  balanceHint: {
    color: alpha(T.ACCENT_FG, 0.42),
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
  txExpandedScroll: { maxHeight: 260 },
  txToggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  txToggleLabel: {
    color: T.TEXT_2, fontFamily: T.FONT.semibold, fontSize: 12,
  },

  addSection: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  sectionTitle: {
    color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15, marginBottom: 12,
  },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  poweredBy: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11 },

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
    // Keep the digits optically centred next to the ₦ sign on Android
    // (TextInput's default internal padding otherwise pushes text down).
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
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
