/**
 * useWalletBalance — fetches the user's Naira wallet balance,
 * caches in AsyncStorage, and returns the current value.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch } from '@/services/api';

const BALANCE_KEY = '@ms_wallet_balance';

export function useWalletBalance(): { balance: number; refreshWallet: () => Promise<void> } {
  const [balance, setBalance] = useState(0);

  const refreshWallet = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const raw = await apiFetch<any>('/wallet', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const bal = Number(raw?.balance ?? raw?.data?.balance ?? 0);
      setBalance(bal);
      await AsyncStorage.setItem(BALANCE_KEY, String(bal));
    } catch {
      // silently use cached
    }
  };

  useEffect(() => {
    // Load cached value immediately for instant display
    AsyncStorage.getItem(BALANCE_KEY)
      .then((v) => { if (v) setBalance(Number(v)); })
      .catch(() => {});

    refreshWallet();
  }, []);

  return { balance, refreshWallet };
}
