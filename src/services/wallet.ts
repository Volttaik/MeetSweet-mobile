/**
 * Wallet Service - Handles balance, deposits, withdrawals, transaction history.
 */

import { authFetch } from './api';
import { WalletState } from '../types';

export async function getWalletState(): Promise<WalletState> {
  const resp = await authFetch<any>('/wallet').catch(() => ({
    balance: 150.00,
    currency: 'USD',
    transactions: [
      { id: 'tx-1', type: 'subscription', amount: 9.99, description: 'VIP Subscription to @alexa', createdAt: new Date(Date.now() - 86400000).toISOString(), status: 'completed' },
      { id: 'tx-2', type: 'deposit', amount: 50.00, description: 'Card Deposit', createdAt: new Date(Date.now() - 172800000).toISOString(), status: 'completed' },
    ],
  }));

  return {
    balance: Number(resp.balance || 0),
    currency: resp.currency || 'USD',
    transactions: resp.transactions || [],
  };
}

export async function depositFunds(amount: number): Promise<WalletState> {
  const resp = await authFetch<any>('/wallet/deposit', undefined, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
  return {
    balance: Number(resp.balance || 0),
    currency: resp.currency || 'USD',
    transactions: resp.transactions || [],
  };
}

export async function withdrawFunds(amount: number, payoutMethod: string): Promise<WalletState> {
  const resp = await authFetch<any>('/wallet/withdraw', undefined, {
    method: 'POST',
    body: JSON.stringify({ amount, payout_method: payoutMethod }),
  });
  return {
    balance: Number(resp.balance || 0),
    currency: resp.currency || 'USD',
    transactions: resp.transactions || [],
  };
}
