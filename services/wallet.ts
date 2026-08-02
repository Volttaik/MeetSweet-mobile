import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

export interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
}

/** Quick-add amounts for the wallet top-up UI (Naira) */
export const WALLET_QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];

export const NIGERIAN_BANKS = [
  'Access Bank',
  'First Bank',
  'GTBank',
  'UBA',
  'Zenith Bank',
  'Sterling Bank',
  'Fidelity Bank',
  'FCMB',
  'Union Bank',
  'Stanbic IBTC',
  'Ecobank',
  'Heritage Bank',
  'Keystone Bank',
  'Polaris Bank',
  'Providus Bank',
  'Wema Bank',
  'Opay',
  'Kuda Bank',
  'Moniepoint',
  'PalmPay',
];

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTransaction(raw: any): Transaction {
  return {
    id: raw.id,
    type: raw.type,
    amount: raw.amount,
    description: raw.description ?? '',
    status: raw.status ?? 'success',
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeWithdrawal(raw: any): WithdrawalRecord {
  return {
    id: raw.id,
    amount: raw.amount,
    status: raw.status ?? 'pending',
    bankName: raw.bank_name ?? raw.bankName ?? '',
    accountNumber: raw.account_number ?? raw.accountNumber ?? '',
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  };
}

// ─── Wallet balance & history ──────────────────────────────────────────────────

export async function getWallet(): Promise<{ balance: number; transactions: Transaction[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const [walletRaw, txRaw] = await Promise.all([
    apiFetch<{ balance: number }>('/wallet', { headers: authHeader(token) }).catch(() => ({ balance: 0 })),
    apiFetch<{ transactions: unknown[] }>('/transactions?limit=20', { headers: authHeader(token) }).catch(() => ({ transactions: [] })),
  ]);
  return {
    balance: walletRaw?.balance ?? 0,
    transactions: Array.isArray(txRaw?.transactions)
      ? txRaw.transactions.map(normalizeTransaction)
      : [],
  };
}

export async function getTransactions(limit = 20): Promise<{ transactions: Transaction[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ transactions: unknown[] }>(`/transactions?limit=${limit}`, {
    headers: authHeader(token),
  });
  return {
    transactions: Array.isArray(raw?.transactions)
      ? raw.transactions.map(normalizeTransaction)
      : [],
  };
}

// ─── Wallet deposit via Paystack (Naira) ─────────────────────────────────────

export interface DepositInitResult {
  transactionId: string;
  accountNumber: string;
  bankName: string;
  amount: number;
  reference: string;
  expiresAt?: string;
}

export async function initiateWalletDeposit(amountNaira: number): Promise<DepositInitResult> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{
    transactionId?: string;
    transaction_id?: string;
    accountNumber?: string;
    account_number?: string;
    bankName?: string;
    bank_name?: string;
    amount?: number;
    reference?: string;
    expiresAt?: string;
    expires_at?: string;
  }>('/payments/initiate-paystack', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ amount: amountNaira }),
  });
  return {
    transactionId: raw.transactionId ?? raw.transaction_id ?? `txn_${Date.now()}`,
    accountNumber:  raw.accountNumber  ?? raw.account_number ?? '',
    bankName:       raw.bankName       ?? raw.bank_name      ?? 'Paystack Bank',
    amount:         raw.amount         ?? amountNaira,
    reference:      raw.reference      ?? `ref_${Date.now()}`,
    expiresAt:      raw.expiresAt      ?? raw.expires_at,
  };
}

export interface DepositVerifyResult {
  success: boolean;
  amountAdded: number;
  newBalance: number;
  message?: string;
}

export async function verifyWalletDeposit(transactionId: string): Promise<DepositVerifyResult> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{
    success?: boolean;
    credits?: number;
    amount?: number;
    amount_added?: number;
    new_balance?: number;
    newBalance?: number;
    message?: string;
  }>('/payments/verify-paystack', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ transactionId }),
  });
  return {
    success:     raw.success    ?? false,
    amountAdded: raw.amount_added ?? raw.amount ?? raw.credits ?? 0,
    newBalance:  raw.newBalance ?? raw.new_balance ?? 0,
    message:     raw.message,
  };
}

// ─── Creator withdrawal (Naira) ───────────────────────────────────────────────

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface WithdrawalRecord {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bankName: string;
  accountNumber: string;
  createdAt: string;
}

interface BalanceResponse {
  balance?: number;
  pending_withdrawals?: number;
  pendingWithdrawals?: number;
  available_for_withdrawal?: number;
  availableForWithdrawal?: number;
}

export async function getCreatorBalance(): Promise<{
  balance: number;
  pendingWithdrawals: number;
  availableForWithdrawal: number;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw: BalanceResponse = await apiFetch<BalanceResponse>('/payments/balance', {
    headers: authHeader(token),
  }).catch((): BalanceResponse => ({ balance: 0 }));
  const balance = raw?.balance ?? 0;
  const pending = raw?.pendingWithdrawals ?? raw?.pending_withdrawals ?? 0;
  return {
    balance,
    pendingWithdrawals:     pending,
    availableForWithdrawal: raw?.availableForWithdrawal ?? raw?.available_for_withdrawal ?? Math.max(0, balance - pending),
  };
}

export async function saveBankDetails(details: BankDetails): Promise<{ success: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ success: boolean }>('/payments/save-bank-details', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      bankName:      details.bankName,
      accountNumber: details.accountNumber,
      accountName:   details.accountName,
    }),
  });
  return { success: raw?.success ?? true };
}

export async function requestWithdrawal(
  amountNaira: number,
  bankDetails: BankDetails,
): Promise<{ success: boolean; withdrawalId: string; status: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{
    success?: boolean;
    withdrawalId?: string;
    withdrawal_id?: string;
    status?: string;
  }>('/payments/withdraw', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      amount:      amountNaira,
      bankDetails: {
        bankName:      bankDetails.bankName,
        accountNumber: bankDetails.accountNumber,
        accountName:   bankDetails.accountName,
      },
    }),
  });
  return {
    success:      raw?.success     ?? true,
    withdrawalId: raw?.withdrawalId ?? raw?.withdrawal_id ?? `wd_${Date.now()}`,
    status:       raw?.status      ?? 'pending',
  };
}

export async function getWithdrawalHistory(): Promise<{ withdrawals: WithdrawalRecord[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ withdrawals: unknown[] }>('/payments/withdrawal-history', {
    headers: authHeader(token),
  }).catch(() => ({ withdrawals: [] }));
  return {
    withdrawals: Array.isArray(raw?.withdrawals)
      ? raw.withdrawals.map(normalizeWithdrawal)
      : [],
  };
}

// ─── Legacy payment helpers (kept for compatibility) ──────────────────────────

export async function initializePayment(amount: number): Promise<{
  authorization_url: string;
  reference: string;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/credentials/payment', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ amount }),
  });
}

export async function verifyPayment(reference: string): Promise<{
  status: 'success' | 'failed';
  transaction: Transaction;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ status: string; transaction: unknown }>(
    `/payments/verify?reference=${encodeURIComponent(reference)}`,
    { headers: authHeader(token) },
  );
  return {
    status: raw.status as 'success' | 'failed',
    transaction: normalizeTransaction(raw.transaction),
  };
}
