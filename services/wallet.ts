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
    createdAt: raw.created_at,
  };
}

export async function getWallet(): Promise<{ balance: number; transactions: Transaction[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Spec: GET /wallet returns balance; GET /transactions returns transaction list
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

export async function initializePayment(amount: number): Promise<{
  authorization_url: string;
  reference: string;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Spec: POST /credentials/payment — Paystack payment initialisation via broker
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
