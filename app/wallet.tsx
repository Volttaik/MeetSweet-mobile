/**
 * Credit Wallet — buy credits with Paystack (Naira).
 *
 * Flow:
 *   1. View balance & select package
 *   2. Tap "Buy Credits" → backend generates unique bank account
 *   3. User transfers exact amount → taps "I have paid"
 *   4. Backend verifies → credits added
 *
 * Backend placeholders (define for backend team):
 *   POST /api/payments/initiate-paystack  { package, amount } → { transactionId, accountNumber, bankName, amount }
 *   POST /api/payments/verify-paystack    { transactionId }   → { success, credits, newBalance }
 *   GET  /api/payments/credit-history                         → { transactions: [...] }
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  Diamond,
  Wallet,
  Warning,
} from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import { T } from '@/constants/theme';
import { toast } from '@/components/MsToast';
import { MsShimmer, MsShimmerUserRow } from '@/components/MsShimmer';
import {
  CREDIT_PACKAGES,
  type CreditPackage,
  getWallet,
  type Transaction,
  initiatePaystackCredit,
  verifyPaystackCredit,
  type PaystackInitResult,
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

// ─── Package card ─────────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: CreditPackage;
  selected: boolean;
  onSelect: () => void;
}) {
  const isPopular = pkg.id === '50_credits';
  const perCredit = (pkg.priceNaira / pkg.credits).toFixed(0);

  return (
    <Pressable
      style={[pkgStyles.card, selected && pkgStyles.cardActive]}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      {isPopular && (
        <View style={pkgStyles.badge}>
          <Text style={pkgStyles.badgeText}>POPULAR</Text>
        </View>
      )}

      <View style={pkgStyles.topRow}>
        <View style={[pkgStyles.radio, selected && pkgStyles.radioActive]}>
          {selected && <Check size={11} color={T.BG} weight="bold" />}
        </View>
        <Text style={pkgStyles.label}>{pkg.label}</Text>
        <Text style={pkgStyles.perCredit}>₦{perCredit}/credit</Text>
      </View>

      <View style={pkgStyles.bottomRow}>
        <View>
          <Text style={pkgStyles.credits}>{pkg.credits.toLocaleString()}</Text>
          <Text style={pkgStyles.unit}>credits</Text>
        </View>
        <Text style={pkgStyles.price}>{formatNaira(pkg.priceNaira)}</Text>
      </View>
    </Pressable>
  );
}

const pkgStyles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: T.RADIUS.lg,
    borderWidth: 1,
    borderColor: T.BORDER,
    backgroundColor: T.SURFACE,
    position: 'relative',
    overflow: 'hidden',
  },
  cardActive: {
    borderColor: T.TEXT,
    backgroundColor: T.SURFACE_2,
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: T.TEXT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
  },
  badgeText: {
    color: T.BG,
    fontFamily: T.FONT.bold,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: T.BORDER_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: T.TEXT, borderColor: T.TEXT },
  label: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12, flex: 1 },
  perCredit: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  credits: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  unit: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 1 },
  price: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 16 },
});

// ─── Payment pending screen ────────────────────────────────────────────────────

type VerifyState = 'idle' | 'checking' | 'success' | 'failed';

function PaymentPendingView({
  result,
  pkg,
  onVerify,
  onBack,
  verifyState,
}: {
  result: PaystackInitResult;
  pkg: CreditPackage;
  onVerify: () => void;
  onBack: () => void;
  verifyState: VerifyState;
}) {
  const [copied, setCopied] = useState(false);

  const copyAccount = async () => {
    await Clipboard.setStringAsync(result.accountNumber);
    setCopied(true);
    toast.success('Account number copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pendStyles.scroll}>
      {/* Status icon */}
      <View style={pendStyles.iconWrap}>
        <Clock size={32} color={T.TEXT} weight="duotone" />
      </View>

      <Text style={pendStyles.title}>Transfer Funds</Text>
      <Text style={pendStyles.subtitle}>
        Transfer exactly {formatNaira(result.amount)} to the account below, then tap &quot;I have paid&quot;.
      </Text>

      {/* Account details card */}
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
        <View style={pendStyles.separator} />

        <View style={pendStyles.cardRow}>
          <Text style={pendStyles.cardKey}>PACKAGE</Text>
          <Text style={pendStyles.cardVal}>{pkg.credits} credits — {pkg.label}</Text>
        </View>
      </View>

      <View style={pendStyles.infoRow}>
        <Warning size={14} color={T.TEXT_3} />
        <Text style={pendStyles.infoText}>
          Transfer the exact amount shown. Partial or incorrect amounts cannot be confirmed automatically.
        </Text>
      </View>

      {/* Result feedback */}
      {verifyState === 'failed' && (
        <View style={pendStyles.failBox}>
          <Text style={pendStyles.failText}>
            Payment not confirmed yet. Please wait a few minutes and try again, or contact support.
          </Text>
        </View>
      )}

      {/* CTA */}
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
        <Text style={pendStyles.backLabel}>Back to packages</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const pendStyles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  title: {
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  card: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  separator: { height: 1, backgroundColor: T.BORDER, marginHorizontal: 18 },
  cardKey: {
    color: T.TEXT_3,
    fontFamily: T.FONT.semibold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  cardVal: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 13 },
  cardValLarge: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 17, letterSpacing: -0.3 },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    padding: 13,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
    lineHeight: 17,
  },
  failBox: {
    marginTop: 16,
    padding: 14,
    backgroundColor: `${T.ERROR}14`,
    borderRadius: T.RADIUS.md,
  },
  failText: { color: T.ERROR, fontFamily: T.FONT.regular, fontSize: 12, lineHeight: 18 },
  paidBtn: {
    height: 52,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  paidBtnLoading: { opacity: 0.7 },
  paidLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 15 },
  backBtn: { alignItems: 'center', paddingVertical: 16 },
  backLabel: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 13 },
});

// ─── Success screen ────────────────────────────────────────────────────────────

function SuccessView({ credits, balance, onDone }: { credits: number; balance: number; onDone: () => void }) {
  return (
    <View style={successStyles.wrap}>
      <View style={successStyles.iconWrap}>
        <CheckCircle size={48} color={T.SUCCESS} weight="fill" />
      </View>
      <Text style={successStyles.title}>Credits Added!</Text>
      <Text style={successStyles.sub}>
        {credits} credits have been added to your wallet.
      </Text>
      <View style={successStyles.balanceRow}>
        <Wallet size={16} color={T.TEXT_2} />
        <Text style={successStyles.balanceText}>New balance: {balance.toLocaleString()} credits</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.full,
  },
  balanceText: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  btn: {
    marginTop: 32,
    height: 52,
    paddingHorizontal: 40,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 15 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

type ScreenStep = 'packages' | 'pending' | 'success';

export default function WalletScreen() {
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<ScreenStep>('packages');
  const [selectedIdx, setSelectedIdx] = useState(1);
  const [balance, setBalance]         = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [initiating, setInitiating]   = useState(false);
  const [paystackResult, setPaystackResult] = useState<PaystackInitResult | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [addedCredits, setAddedCredits] = useState(0);
  const [newBalance, setNewBalance]   = useState(0);

  useEffect(() => {
    getWallet()
      .then(({ balance: b, transactions: t }) => {
        setBalance(b);
        setTransactions(t);
      })
      .catch(() => {})
      .finally(() => setLoadingWallet(false));
  }, []);

  const selectedPkg = CREDIT_PACKAGES[selectedIdx];

  const handleBuy = async () => {
    if (initiating) return;
    setInitiating(true);
    try {
      const result = await initiatePaystackCredit(selectedPkg.id, selectedPkg.priceNaira);
      setPaystackResult(result);
      setStep('pending');
      setVerifyState('idle');
    } catch {
      toast.error('Could not initiate payment. Please try again.');
    } finally {
      setInitiating(false);
    }
  };

  const handleVerify = async () => {
    if (!paystackResult || verifyState === 'checking') return;
    setVerifyState('checking');
    try {
      const res = await verifyPaystackCredit(paystackResult.transactionId);
      if (res.success) {
        setAddedCredits(res.credits);
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
          <Pressable style={styles.back} onPress={() => { setStep('packages'); }}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
          <Text style={styles.headerTitle}>Credits</Text>
          <View style={styles.placeholder} />
        </View>
        <SuccessView
          credits={addedCredits}
          balance={newBalance}
          onDone={() => setStep('packages')}
        />
      </View>
    );
  }

  if (step === 'pending' && paystackResult) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => setStep('packages')}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
          <Text style={styles.headerTitle}>Transfer Payment</Text>
          <View style={styles.placeholder} />
        </View>
        <PaymentPendingView
          result={paystackResult}
          pkg={selectedPkg}
          onVerify={handleVerify}
          onBack={() => setStep('packages')}
          verifyState={verifyState}
        />
      </View>
    );
  }

  // ── Packages screen ───────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Buy Credits</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Balance card */}
        <View style={styles.balanceCard}>
          {/* Diamond icon top-right */}
          <View style={styles.diamondWrap}>
            <Diamond size={22} color="rgba(0,0,0,0.55)" weight="fill" />
          </View>
          <View style={styles.walletIcon}>
            <Diamond size={22} color="#B45309" weight="fill" />
          </View>
          <Text style={styles.balanceLabel}>CREDIT BALANCE</Text>
          {loadingWallet ? (
            <MsShimmer width="50%" height={36} borderRadius={8} style={{ marginTop: 6 }} />
          ) : (
            <Text style={styles.balance}>
              {(balance ?? 0).toLocaleString()}{' '}
              <Text style={styles.balanceUnit}>credits</Text>
            </Text>
          )}
          <Text style={styles.balanceHint}>
            Credits unlock premium content and creator subscriptions.
          </Text>
        </View>

        {/* Transaction history */}
        {transactions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 12 }]}>
              Recent Transactions
            </Text>
            <View style={styles.transactions}>
              {transactions.slice(0, 5).map((tx) => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={styles.txLeft}>
                    <Text style={styles.txDesc}>{tx.description}</Text>
                    <Text style={styles.txDate}>{formatTime(tx.createdAt)}</Text>
                  </View>
                  <Text style={[
                    styles.txAmount,
                    tx.type === 'credit' ? styles.txCredit : styles.txDebit,
                  ]}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.amount}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Get credits */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Get More Credits</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <CreditCard size={11} color={T.TEXT_3} />
            <Text style={styles.secure}>Powered by Paystack</Text>
          </View>
        </View>

        <View style={styles.packages}>
          {CREDIT_PACKAGES.map((pkg, index) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              selected={index === selectedIdx}
              onSelect={() => setSelectedIdx(index)}
            />
          ))}
        </View>

        <View style={styles.note}>
          <Diamond size={15} color="#B45309" weight="fill" />
          <Text style={styles.noteText}>
            Credits never expire and go directly toward creator subscriptions and premium content.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.buyButton, initiating && styles.buyButtonLoading]}
          onPress={handleBuy}
          activeOpacity={0.85}
          disabled={initiating}
        >
          {initiating ? (
            <ActivityIndicator color={T.BG} size="small" />
          ) : (
            <Text style={styles.buyLabel}>
              Buy {selectedPkg.credits} Credits — {formatNaira(selectedPkg.priceNaira)}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.poweredBy}>
          Secure payment via Paystack bank transfer
        </Text>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 15,
  },
  placeholder: { width: 36 },
  content: { padding: 20, paddingBottom: 48 },

  balanceCard: {
    backgroundColor: '#78350F',
    borderRadius: T.RADIUS.xl,
    padding: 22,
    minHeight: 160,
    position: 'relative',
    overflow: 'hidden',
  },
  diamondWrap: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.3,
    transform: [{ scale: 3 }],
  },
  walletIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,220,100,0.75)',
    fontFamily: T.FONT.semibold,
    fontSize: 9,
    letterSpacing: 1.4,
    marginTop: 16,
  },
  balance: {
    color: '#FEF3C7',
    fontFamily: T.FONT.bold,
    fontSize: 34,
    letterSpacing: -1,
    marginTop: 2,
  },
  balanceUnit: { fontFamily: T.FONT.medium, fontSize: 14, color: '#FDE68A' },
  balanceHint: {
    color: 'rgba(255,220,100,0.55)',
    fontFamily: T.FONT.regular,
    fontSize: 11,
    marginTop: 8,
    lineHeight: 17,
  },

  transactions: {
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  txLeft: { flex: 1 },
  txDesc: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT },
  txDate: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
  txAmount: { fontSize: 13, fontFamily: T.FONT.semibold },
  txCredit: { color: T.SUCCESS },
  txDebit: { color: T.TEXT_2 },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },
  secure: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10 },

  packages: { gap: 9 },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 18,
    padding: 13,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
  },
  noteText: {
    flex: 1,
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 11,
    lineHeight: 17,
  },

  buyButton: {
    height: 54,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buyButtonLoading: { opacity: 0.7 },
  buyLabel: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 15 },

  poweredBy: {
    textAlign: 'center',
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 11,
    marginTop: 12,
  },
});
