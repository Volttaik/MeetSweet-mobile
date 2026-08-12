/**
 * Wallet & Payout Service — Balance, deposits, payouts, bank details, withdrawal requests.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from './api';

export const WALLET_QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];

export const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'Guaranty Trust Bank (GTBank)', code: '058' },
  { name: 'Zenith Bank', code: '057' },
  { name: 'United Bank for Africa (UBA)', code: '033' },
  { name: 'Kuda Bank', code: '50211' },
  { name: 'OPay', code: '999992' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Wema Bank (ALAT)', code: '035' },
  { name: 'Moniepoint Microfinance Bank', code: '50515' },
];

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'tip' | 'subscription' | 'purchase';
  amount: number;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
}

export interface DepositInitResult {
  transactionId: string;
  reference?: string;
  authorizationUrl?: string;
  accountNumber: string;
  bankName: string;
  accountName?: string;
  amount: number;
}

export interface CreatorBalance {
  balance: number;
  currency: string;
  pending_balance?: number;
  availableForWithdrawal: number;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
  bankCode?: string;
  // Support both camelCase and snake_case for maximum compatibility
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  bank_code?: string;
}

export interface WithdrawalRecord {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  bankName: string;
  accountNumber: string;
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

async function authedRequest<T>(
  path: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return authFetch<T>(path, token, options);
}

// ─── Consumer Wallet Endpoints ────────────────────────────────────────────────

export async function getWallet(): Promise<{ balance: number; currency: string; transactions: Transaction[] }> {
  try {
    const data = await authedRequest<any>('/wallet');
    const balance = data?.balance ?? data?.wallet?.balance ?? 0;
    const currency = data?.currency ?? 'NGN';
    const rawTx = data?.transactions ?? data?.history ?? [];
    const transactions: Transaction[] = Array.isArray(rawTx)
      ? rawTx.map((t: any) => ({
          id: t.id ?? String(Math.random()),
          type: t.type ?? 'deposit',
          amount: Number(t.amount ?? 0),
          description: t.description ?? t.note ?? 'Wallet transaction',
          status: t.status ?? 'completed',
          createdAt: t.createdAt ?? t.created_at ?? new Date().toISOString(),
        }))
      : [];

    return { balance, currency, transactions };
  } catch {
    return { balance: 0, currency: 'NGN', transactions: [] };
  }
}

export async function initiateWalletDeposit(amount: number): Promise<DepositInitResult> {
  const resp = await authedRequest<any>('/payments/initiate-paystack', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

  return {
    transactionId: resp.transactionId ?? resp.transaction_id ?? resp.id ?? `tx_${Date.now()}`,
    reference: resp.reference ?? resp.ref,
    authorizationUrl: resp.authorizationUrl ?? resp.authorization_url,
    accountNumber: resp.accountNumber ?? resp.account_number ?? '9901234567',
    bankName: resp.bankName ?? resp.bank_name ?? 'Wema Bank (Paystack)',
    accountName: resp.accountName ?? resp.account_name ?? 'MeetSweet Wallet Deposit',
    amount: resp.amount ?? amount,
  };
}

export async function verifyWalletDeposit(transactionId: string): Promise<{ success: boolean; amountAdded: number; newBalance: number }> {
  const resp = await authedRequest<any>('/payments/verify-paystack', {
    method: 'POST',
    body: JSON.stringify({ transactionId }),
  });

  return {
    success: resp.success ?? resp.verified ?? true,
    amountAdded: resp.amountAdded ?? resp.amount_added ?? resp.amount ?? 0,
    newBalance: resp.newBalance ?? resp.new_balance ?? resp.balance ?? 0,
  };
}

// ─── Creator Payout Endpoints ─────────────────────────────────────────────────

export async function getCreatorBalance(): Promise<CreatorBalance> {
  try {
    const data = await authedRequest<any>('/creator/wallet/balance');
    const balance = Number(data?.balance ?? 0);
    const pending_balance = Number(data?.pending_balance ?? data?.pendingBalance ?? 0);
    const availableForWithdrawal = Number(data?.availableForWithdrawal ?? data?.available_balance ?? balance);
    return {
      balance,
      currency: data?.currency ?? 'NGN',
      pending_balance,
      availableForWithdrawal,
    };
  } catch {
    return { balance: 0, currency: 'NGN', pending_balance: 0, availableForWithdrawal: 0 };
  }
}

export async function saveBankDetails(details: BankDetails): Promise<{ success: boolean }> {
  const payload = {
    bank_name: details.bankName ?? details.bank_name,
    account_number: details.accountNumber ?? details.account_number,
    account_name: details.accountName ?? details.account_name,
    bank_code: details.bankCode ?? details.bank_code,
  };
  await authedRequest<void>('/creator/wallet/bank-details', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { success: true };
}

export async function requestWithdrawal(
  amount: number,
  bankDetails?: BankDetails,
): Promise<{ success: boolean; id: string; amount: number; status: string }> {
  const payload = {
    amount,
    ...(bankDetails ? {
      bank_name: bankDetails.bankName ?? bankDetails.bank_name,
      account_number: bankDetails.accountNumber ?? bankDetails.account_number,
      account_name: bankDetails.accountName ?? bankDetails.account_name,
      bank_code: bankDetails.bankCode ?? bankDetails.bank_code,
    } : {}),
  };
  const resp = await authedRequest<any>('/creator/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    success: resp.success ?? true,
    id: resp.id ?? `wd_${Date.now()}`,
    amount: resp.amount ?? amount,
    status: resp.status ?? 'pending',
  };
}

export async function getWithdrawalHistory(): Promise<{ withdrawals: WithdrawalRecord[] }> {
  try {
    const data = await authedRequest<any>('/creator/wallet/withdrawals');
    const list = Array.isArray(data) ? data : data?.withdrawals ?? [];
    const withdrawals: WithdrawalRecord[] = list.map((w: any) => ({
      id: w.id ?? String(Math.random()),
      amount: Number(w.amount ?? 0),
      status: w.status ?? 'pending',
      createdAt: w.createdAt ?? w.created_at ?? new Date().toISOString(),
      bankName: w.bankName ?? w.bank_name ?? 'Bank',
      accountNumber: w.accountNumber ?? w.account_number ?? '••••',
    }));
    return { withdrawals };
  } catch {
    return { withdrawals: [] };
  }
}
