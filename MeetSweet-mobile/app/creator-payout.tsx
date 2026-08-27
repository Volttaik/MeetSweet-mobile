/**
 * Creator Payout — withdraw earnings in Naira.
 *
 * Flow:
 *   1. View Naira balance
 *   2. Add / edit bank details (Nigerian banks)
 *   3. Enter withdrawal amount → request withdrawal
 *   4. See withdrawal history with status tracking
 *
 * Backend routes:
 *   GET  /api/creator/wallet/balance               → { balance, pendingWithdrawals, availableForWithdrawal }
 *   POST /api/creator/wallet/bank-details          { bankName, accountNumber, accountName } → { success }
 *   POST /api/creator/wallet/withdraw              { amount, bankDetails } → { success, withdrawalId, status }
 *   GET  /api/creator/wallet/withdrawals           → { withdrawals: [...] }
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { goBack } from '@/lib/safe-back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDown,
  ArrowLeft,
  Bank,
  Check,
  CheckCircle,
  Clock,
  PencilSimple,
  Warning,
  X,
  XCircle,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { toast } from '@/components/MsToast';
import { MsShimmer } from '@/components/MsShimmer';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { MsEmptyState } from '@/components/MsEmptyState';
import {
  type BankDetails,
  type BankOption,
  type WithdrawalRecord,
  getCreatorBalance,
  getBankDetails,
  getBanks,
  resolveAccountName,
  saveBankDetails,
  requestWithdrawal,
  finalizeWithdrawal,
  getWithdrawalHistory,
} from '@/services/wallet';

const MIN_WITHDRAWAL_NAIRA = 1000;
const MAX_FRACTION_DIGITS = 0;

function formatNaira(n: number): string {
  return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: MAX_FRACTION_DIGITS });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type WdStatus = WithdrawalRecord['status'];

function StatusBadge({ status }: { status: WdStatus }) {
  const config: Record<WdStatus, { color: string; label: string }> = {
    completed:  { color: T.SUCCESS,   label: 'Completed' },
    processing: { color: T.INFO,   label: 'Processing' },
    pending:    { color: T.WARNING,   label: 'Pending' },
    failed:     { color: T.ERROR,     label: 'Failed' },
  };
  const { color, label } = config[status] ?? config.pending;
  return (
    <View style={[badge.wrap, { backgroundColor: `${color}18` }]}>
      <Text style={[badge.label, { color }]}>{label}</Text>
    </View>
  );
}

function StatusIcon({ status }: { status: WdStatus }) {
  const props = { size: 18, weight: 'fill' as const };
  if (status === 'completed')  return <CheckCircle {...props} color={T.SUCCESS} />;
  if (status === 'processing') return <Clock {...props} color={T.INFO} />;
  if (status === 'pending')    return <Clock {...props} color={T.WARNING} />;
  return <XCircle {...props} color={T.ERROR} />;
}

const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.RADIUS.full },
  label: { fontSize: 11, fontFamily: T.FONT.semibold },
});

// ─── Withdrawal record row ─────────────────────────────────────────────────────

function WithdrawalRow({ item }: { item: WithdrawalRecord }) {
  return (
    <View style={rowS.row}>
      <View style={[rowS.icon, { backgroundColor: `${item.status === 'completed' ? T.SUCCESS : item.status === 'failed' ? T.ERROR : T.WARNING}18` }]}>
        <StatusIcon status={item.status} />
      </View>
      <View style={rowS.info}>
        <Text style={rowS.bank}>{item.bankName} ···{item.accountNumber.slice(-4)}</Text>
        <Text style={rowS.date}>{formatDate(item.createdAt)}</Text>
      </View>
      <View style={rowS.right}>
        <Text style={rowS.amount}>{formatNaira(item.amount)}</Text>
        <StatusBadge status={item.status} />
      </View>
    </View>
  );
}

const rowS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  bank: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT },
  date: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 5 },
  amount: { fontSize: 14, fontFamily: T.FONT.bold, color: T.TEXT },
});

// ─── Bank details sheet ────────────────────────────────────────────────────────

function BankDetailsSheet({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: BankDetails | null;
  onSave: (details: BankDetails) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [bankName, setBankName]           = useState(initial?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? '');
  const [accountName, setAccountName]     = useState(initial?.accountName ?? '');
  const [bankCode, setBankCode]           = useState(initial?.bankCode ?? '');
  const [banks, setBanks]                 = useState<BankOption[]>([]);
  const [banksLoading, setBanksLoading]   = useState(false);
  const [resolvingName, setResolvingName] = useState(false);
  const [showBanks, setShowBanks]         = useState(false);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (visible) {
      setBankName(initial?.bankName ?? '');
      setAccountNumber(initial?.accountNumber ?? '');
      setAccountName(initial?.accountName ?? '');
      setBankCode(initial?.bankCode ?? '');
      // Authoritative bank list from Paystack — never a hardcoded list.
      setBanksLoading(true);
      getBanks()
        .then(setBanks)
        .catch(() => setBanks([]))
        .finally(() => setBanksLoading(false));
    }
  }, [visible, initial]);

  // Auto-resolve the account-holder name from Paystack once both the account
  // number and bank are known, so a withdrawal never trusts a typed name.
  useEffect(() => {
    if (!visible || accountNumber.length !== 10 || !bankCode) return;
    let cancelled = false;
    setResolvingName(true);
    resolveAccountName(accountNumber, bankCode)
      .then((name) => { if (!cancelled && name) setAccountName(name); })
      .catch(() => { if (!cancelled) setAccountName(''); })
      .finally(() => { if (!cancelled) setResolvingName(false); });
    return () => { cancelled = true; };
  }, [visible, accountNumber, bankCode]);

  const handleSave = async () => {
    if (!bankName || !accountNumber || !accountName || !bankCode) {
      toast.error('Please fill all bank details');
      return;
    }
    if (accountNumber.length < 10) {
      toast.error('Account number must be 10 digits');
      return;
    }
    setSaving(true);
    try {
      await saveBankDetails({ bankName, accountNumber, accountName, bankCode });
      onSave({ bankName, accountNumber, accountName, bankCode });
      toast.success('Bank details saved!');
    } catch {
      toast.error('Could not save bank details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      {/* iOS pads; Android resizes the window natively (softwareKeyboardLayoutMode=resize) */}
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
      >
        <View style={[bankS.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={bankS.handle} />
          <View style={bankS.titleRow}>
            <Text style={bankS.title}>Bank Details</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={18} color={T.TEXT_2} />
            </TouchableOpacity>
          </View>

          {/* Bank picker */}
          <TouchableOpacity style={bankS.field} onPress={() => setShowBanks(true)} activeOpacity={0.8}>
            <Text style={bankS.fieldLabel}>Bank Name</Text>
            <View style={bankS.fieldRow}>
              <Text style={[bankS.fieldValue, !bankName && bankS.placeholder]}>
                {bankName || 'Select bank'}
              </Text>
              <ArrowDown size={14} color={T.TEXT_2} />
            </View>
          </TouchableOpacity>

          {/* Account number */}
          <View style={bankS.field}>
            <Text style={bankS.fieldLabel}>Account Number</Text>
            <TextInput
              style={bankS.input}
              value={accountNumber}
              onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit account number"
              placeholderTextColor={T.TEXT_3}
              selectionColor={T.CARET}
              keyboardType="numeric"
              maxLength={10}
            />
          </View>

          {/* Account name — auto-resolved from Paystack */}
          <View style={bankS.field}>
            <Text style={bankS.fieldLabel}>Account Name</Text>
            <TextInput
              style={bankS.input}
              value={accountName}
              onChangeText={setAccountName}
              placeholder={resolvingName ? 'Resolving account name…' : 'Account name'}
              placeholderTextColor={T.TEXT_3}
              selectionColor={T.CARET}
              autoCapitalize="words"
              editable={!resolvingName}
            />
            {resolvingName ? (
              <Text style={bankS.resolveHint}>Verifying with your bank…</Text>
            ) : accountName ? (
              <Text style={[bankS.resolveHint, { color: T.SUCCESS }]}>Account name verified</Text>
            ) : accountNumber.length === 10 && bankCode ? (
              <Text style={[bankS.resolveHint, { color: T.ERROR }]}>Could not verify account — check the number</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[bankS.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <BrandGradientFill />
            {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={bankS.saveBtnLabel}>Save Details</Text>}
          </TouchableOpacity>
        </View>

        {/* Bank list modal */}
        {showBanks && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowBanks(false)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowBanks(false)}>
              <View style={bankS.bankList}>
                <Text style={bankS.bankListTitle}>Select Bank</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {banksLoading ? (
                    <View style={bankS.bankLoading}><ActivityIndicator color={T.TEXT_2} /></View>
                  ) : banks.length === 0 ? (
                    <Text style={bankS.bankEmpty}>Could not load banks — check your connection and try again.</Text>
                  ) : (
                    banks.map((b) => (
                      <TouchableOpacity
                        key={b.code}
                        style={bankS.bankRow}
                        onPress={() => { setBankName(b.name); setBankCode(b.code); setShowBanks(false); }}
                        activeOpacity={0.7}
                      >
                        <Text style={bankS.bankName}>{b.name}</Text>
                        {bankName === b.name && <Check size={15} color={T.TEXT} weight="bold" />}
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const bankS = StyleSheet.create({
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 4,
    maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 18 },
  field: { marginBottom: 16 },
  fieldLabel: { color: T.TEXT_3, fontFamily: T.FONT.semibold, fontSize: 11, letterSpacing: 0.4, marginBottom: 7 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldValue: { color: T.TEXT, fontFamily: T.FONT.medium, fontSize: 14 },
  placeholder: { color: T.TEXT_3 },
  input: {
    height: 46,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 14,
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 14,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  saveBtn: {
    height: 52,
    borderRadius: T.RADIUS.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnLabel: { color: '#FFFFFF', fontFamily: T.FONT.bold, fontSize: 15 },
  bankList: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    marginHorizontal: 16,
    marginTop: 80,
    maxHeight: '70%',
    padding: 20,
  },
  bankListTitle: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16, marginBottom: 16 },
  bankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.BORDER },
  bankName: { color: T.TEXT, fontFamily: T.FONT.regular, fontSize: 14 },
  bankLoading: { paddingVertical: 24, alignItems: 'center' },
  bankEmpty: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 13, textAlign: 'center', paddingVertical: 24, lineHeight: 20 },
  resolveHint: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 6 },
});

// ─── Withdrawal amount sheet ───────────────────────────────────────────────────

function WithdrawAmountSheet({
  visible,
  availableBalance,
  bankDetails,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  availableBalance: number;
  bankDetails: BankDetails;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const parsed = parseInt(amount.replace(/,/g, ''), 10) || 0;
  const isValid = parsed >= MIN_WITHDRAWAL_NAIRA && parsed <= availableBalance;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      {/* iOS pads; Android resizes the window natively (softwareKeyboardLayoutMode=resize) */}
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
      >
        <View style={[amtS.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={amtS.handle} />
          <View style={amtS.titleRow}>
            <Text style={amtS.title}>Withdraw Funds</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={18} color={T.TEXT_2} />
            </TouchableOpacity>
          </View>

          <Text style={amtS.availLabel}>
            Available: <Text style={amtS.availAmount}>{formatNaira(availableBalance)}</Text>
          </Text>

          {/* Amount input */}
          <View style={amtS.amountWrap}>
            <Text style={amtS.currency}>₦</Text>
            <TextInput
              style={amtS.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={T.TEXT_3}
              selectionColor={T.CARET}
              keyboardType="numeric"
              autoFocus
            />
          </View>

          {parsed > 0 && parsed < MIN_WITHDRAWAL_NAIRA && (
            <View style={amtS.hint}>
              <Warning size={12} color={T.ERROR} />
              <Text style={[amtS.hintText, { color: T.ERROR }]}>
                Minimum withdrawal is {formatNaira(MIN_WITHDRAWAL_NAIRA)}
              </Text>
            </View>
          )}
          {parsed > availableBalance && (
            <View style={amtS.hint}>
              <Warning size={12} color={T.ERROR} />
              <Text style={[amtS.hintText, { color: T.ERROR }]}>Exceeds available balance</Text>
            </View>
          )}

          {/* Bank summary */}
          <View style={amtS.bankSummary}>
            <Bank size={15} color={T.TEXT_2} />
            <Text style={amtS.bankText}>
              {bankDetails.bankName} · ···{bankDetails.accountNumber.slice(-4)} · {bankDetails.accountName}
            </Text>
          </View>

          <TouchableOpacity
            style={[amtS.withdrawBtn, !isValid && amtS.withdrawBtnDisabled]}
            onPress={() => isValid && onConfirm(parsed)}
            disabled={!isValid}
            activeOpacity={0.85}
          >
            {/* Gradient only while enabled — the disabled state is the plain
                design-system surface (never the old gold theme). */}
            {isValid ? <BrandGradientFill /> : null}
            <Text style={[amtS.withdrawLabel, !isValid && { color: T.TEXT_3 }]}>
              {isValid ? `Withdraw ${formatNaira(parsed)}` : 'Enter valid amount'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const amtS = StyleSheet.create({
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 18 },
  availLabel: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 12, marginBottom: 20 },
  availAmount: { color: T.TEXT, fontFamily: T.FONT.semibold },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  currency: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 32 },
  amountInput: {
    flex: 1,
    color: T.TEXT,
    fontFamily: T.FONT.bold,
    fontSize: 40,
    letterSpacing: -1,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  hintText: { fontFamily: T.FONT.regular, fontSize: 12 },
  bankSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    marginBottom: 20,
  },
  bankText: { flex: 1, color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  withdrawBtn: {
    height: 52,
    borderRadius: T.RADIUS.full,
    // No backgroundColor — the MeetSweet platform gradient (BrandGradientFill)
    // IS the button's background. The old gold theme was removed so it can
    // never paint over the gradient at runtime.
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawBtnDisabled: { backgroundColor: T.SURFACE_2, borderWidth: 1, borderColor: T.BORDER_2 },
  withdrawLabel: { color: T.ACCENT_FG, fontFamily: T.FONT.bold, fontSize: 15 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreatorPayoutScreen() {
  const insets = useSafeAreaInsets();
  const [balance, setBalance]             = useState<number | null>(null);
  const [available, setAvailable]         = useState<number>(0);
  const [withdrawals, setWithdrawals]     = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [error, setError]                 = useState(false);
  const [bankDetails, setBankDetails]     = useState<BankDetails | null>(null);
  const [showBankSheet, setShowBankSheet] = useState(false);
  const [showWithdrawAmt, setShowWithdrawAmt] = useState(false);
  const [withdrawing, setWithdrawing]     = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState<number | null>(null);
  const [pendingTransferCode, setPendingTransferCode] = useState<string | null>(null);
  const [showOtpSheet, setShowOtpSheet] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [balData, histData, bankData] = await Promise.all([
        getCreatorBalance(),
        getWithdrawalHistory(),
        getBankDetails(),
      ]);
      setBalance(balData.balance);
      setAvailable(balData.availableForWithdrawal);
      setWithdrawals(histData.withdrawals);
      if (bankData) setBankDetails(bankData);
      setError(false);
    } catch {
      setError(true);
      toast.error('Could not load payout data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(true); };

  const handleWithdrawRequest = (amount: number) => {
    setShowWithdrawAmt(false);
    setConfirmWithdraw(amount);
  };

  const doWithdraw = async () => {
    const amount = confirmWithdraw;
    setConfirmWithdraw(null);
    if (!amount || !bankDetails) return;
    setWithdrawing(true);
    try {
      const res = await requestWithdrawal(amount, bankDetails);
      if (res.success) {
        if (res.otpRequired && res.transferCode) {
          // Paystack requires an OTP to finalize the transfer.
          setPendingTransferCode(res.transferCode);
          setOtpValue('');
          setShowOtpSheet(true);
        } else {
          toast.success('Withdrawal request submitted!');
          load(true);
        }
      } else {
        toast.error('Could not process withdrawal. Try again.');
      }
    } catch {
      toast.error('Withdrawal failed. Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  const doFinalize = async () => {
    if (!pendingTransferCode || otpValue.length < 4) return;
    setFinalizing(true);
    try {
      const res = await finalizeWithdrawal(pendingTransferCode, otpValue);
      if (res.success) {
        toast.success('Withdrawal confirmed!');
        setShowOtpSheet(false);
        setPendingTransferCode(null);
        load(true);
      } else {
        toast.error('Could not confirm withdrawal. Try again.');
      }
    } catch {
      toast.error('Confirmation failed. Please try again.');
    } finally {
      setFinalizing(false);
    }
  };

  const canWithdraw = available >= MIN_WITHDRAWAL_NAIRA;

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft size={22} color={T.TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payouts</Text>
        <View style={{ width: 38 }} />
      </View>

      {error && !loading ? (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <MsEmptyState
            title="Couldn't load payouts"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => load()}
          />
        </View>
      ) : (
      <FlatList
        data={withdrawals}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.TEXT} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View>
            {/* Balance card */}
            <View style={styles.balanceCard}>
              {loading ? (
                <>
                  <MsShimmer width="45%" height={13} />
                  <MsShimmer width="65%" height={44} borderRadius={10} style={{ marginTop: 10 }} />
                  <MsShimmer width="55%" height={11} style={{ marginTop: 8 }} />
                </>
              ) : (
                <>
                  <Text style={styles.balanceLabel}>AVAILABLE FOR WITHDRAWAL</Text>
                  <Text style={styles.balanceAmount}>{formatNaira(available)}</Text>
                  <Text style={styles.balanceNote}>
                    Total balance: {formatNaira(balance ?? 0)} · Min. withdrawal: {formatNaira(MIN_WITHDRAWAL_NAIRA)}
                  </Text>
                </>
              )}

              <TouchableOpacity
                style={[styles.withdrawBtn, (!canWithdraw || withdrawing) && styles.withdrawBtnDisabled]}
                onPress={() => {
                  if (!canWithdraw) return;
                  if (!bankDetails) { setShowBankSheet(true); return; }
                  setShowWithdrawAmt(true);
                }}
                activeOpacity={0.85}
                disabled={!canWithdraw || withdrawing}
              >
                {/* Gradient while enabled OR loading (the platform gradient is
                    the loading state's on-brand treatment). The purely disabled
                    state (no balance) uses the plain design-system surface —
                    never the old gold theme. */}
                {canWithdraw || withdrawing ? <BrandGradientFill /> : null}
                {withdrawing ? (
                  <ActivityIndicator color={T.ACCENT_FG} size="small" />
                ) : (
                  <>
                    <ArrowDown size={15} color={canWithdraw ? T.ACCENT_FG : T.TEXT_3} />
                    <Text style={[styles.withdrawLabel, !canWithdraw && { color: T.TEXT_3 }]}>
                      Withdraw Funds
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Processing note — the product promise every payout must state */}
            <View style={styles.processingNote}>
              <View style={styles.processingIcon}>
                <BrandGradientFill />
                <Clock size={14} color="#FFFFFF" weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.processingTitle}>Processing may take up to 24 hours</Text>
                <Text style={styles.processingSub}>
                  Withdrawals are sent to your bank once processed. Funds stay reserved until then.
                </Text>
              </View>
            </View>

            {/* Bank account card */}
            <TouchableOpacity
              style={styles.bankCard}
              onPress={() => setShowBankSheet(true)}
              activeOpacity={0.8}
            >
              <View style={styles.bankIcon}>
                <Bank size={20} color={T.TEXT_2} />
              </View>
              <View style={styles.bankInfo}>
                {bankDetails ? (
                  <>
                    <Text style={styles.bankTitle}>{bankDetails.bankName}</Text>
                    <Text style={styles.bankSub}>
                      {bankDetails.accountName} · ···{bankDetails.accountNumber.slice(-4)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.bankTitle}>Add Bank Account</Text>
                    <Text style={styles.bankSub}>Required to withdraw funds</Text>
                  </>
                )}
              </View>
              <PencilSimple size={15} color={T.TEXT_2} />
            </TouchableOpacity>

            {/* History header */}
            {withdrawals.length > 0 && (
              <Text style={styles.sectionTitle}>Withdrawal History</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: 20, gap: 12, paddingTop: 4 }}>
              {[60, 60, 60].map((h, i) => <MsShimmer key={i} width="100%" height={h} borderRadius={T.RADIUS.md} />)}
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No withdrawals yet</Text>
                <Text style={styles.emptySub}>
                  Once you withdraw earnings, your history will appear here.
                </Text>
              </View>
            </View>
          )
        }
        renderItem={({ item }) => <WithdrawalRow item={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      )}

      {/* Bank details sheet */}
      <BankDetailsSheet
        visible={showBankSheet}
        initial={bankDetails}
        onSave={(d) => { setBankDetails(d); setShowBankSheet(false); }}
        onClose={() => setShowBankSheet(false)}
      />

      {/* Withdrawal amount sheet */}
      {bankDetails && (
        <WithdrawAmountSheet
          visible={showWithdrawAmt}
          availableBalance={available}
          bankDetails={bankDetails}
          onConfirm={handleWithdrawRequest}
          onClose={() => setShowWithdrawAmt(false)}
        />
      )}

      {/* Confirm dialog */}
      <MsConfirmDialog
        visible={confirmWithdraw !== null}
        title="Confirm Withdrawal"
        message={`Withdraw ${confirmWithdraw !== null ? formatNaira(confirmWithdraw) : ''} to ${bankDetails?.bankName ?? ''} ···${(bankDetails?.accountNumber ?? '').slice(-4)}?\n\nProcessing takes 1–3 business days.`}
        confirmLabel="Confirm Withdrawal"
        onConfirm={doWithdraw}
        onCancel={() => setConfirmWithdraw(null)}
      />

      {/* Paystack OTP sheet (transfer requires finalizing) */}
      <Modal visible={showOtpSheet} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowOtpSheet(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        >
          <View style={[amtS.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={amtS.handle} />
            <View style={amtS.titleRow}>
              <Text style={amtS.title}>Confirm Transfer</Text>
              <TouchableOpacity onPress={() => setShowOtpSheet(false)} hitSlop={12}>
                <X size={18} color={T.TEXT_2} />
              </TouchableOpacity>
            </View>
            <Text style={amtS.availLabel}>
              Enter the one-time password (OTP) emailed to you by Paystack to complete this transfer.
            </Text>
            <TextInput
              style={[amtS.amountInput, { fontSize: 26, letterSpacing: 6, textAlign: 'center' }]}
              value={otpValue}
              onChangeText={(t) => setOtpValue(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="••••••"
              placeholderTextColor={T.TEXT_3}
              selectionColor={T.CARET}
              keyboardType="number-pad"
              autoFocus
            />
            <TouchableOpacity
              style={[amtS.withdrawBtn, (!otpValue || finalizing) && amtS.withdrawBtnDisabled]}
              onPress={() => { if (otpValue && !finalizing) doFinalize(); }}
              disabled={!otpValue || finalizing}
              activeOpacity={0.85}
            >
              {/* Gradient only while enabled — the disabled state is the plain
                  design-system surface (never the old gold theme). */}
              {otpValue && !finalizing ? <BrandGradientFill /> : null}
              {finalizing ? <ActivityIndicator color={T.ACCENT_FG} size="small" /> : <Text style={[amtS.withdrawLabel, !otpValue && { color: T.TEXT_3 }]}>Confirm & Send</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    padding: 22,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    gap: 6,
  },
  balanceLabel: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 38,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -1.5,
    marginVertical: 2,
  },
  balanceNote: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    lineHeight: 17,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: T.RADIUS.full,
    // No backgroundColor — the MeetSweet platform gradient (BrandGradientFill)
    // IS the button's background. The old gold theme was removed so it can
    // never paint over the gradient at runtime.
    overflow: 'hidden',
  },
  withdrawBtnDisabled: { backgroundColor: T.SURFACE_2, borderWidth: 1, borderColor: T.BORDER_2 },
  withdrawLabel: { fontSize: 14, fontFamily: T.FONT.bold, color: T.ACCENT_FG },

  processingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 10,
    padding: 12,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  processingIcon: {
    width: 30, height: 30, borderRadius: 15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  processingTitle: { color: T.TEXT, fontSize: 12.5, fontFamily: T.FONT.semibold },
  processingSub: {
    color: T.TEXT_3,
    fontSize: 11,
    fontFamily: T.FONT.regular,
    lineHeight: 16,
    marginTop: 1,
  },

  bankCard: {
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
  bankIcon: {
    width: 40,
    height: 40,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankInfo: { flex: 1 },
  bankTitle: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.TEXT },
  bankSub: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },

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

  separator: { height: 1, backgroundColor: T.BORDER, marginLeft: 72 },

  emptyBox: {
    padding: 24,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  emptySub: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_3, textAlign: 'center', lineHeight: 20 },
});
