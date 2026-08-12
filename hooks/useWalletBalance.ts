/**
 * useWalletBalance — fetches the user's Naira wallet balance,
 * caches in AsyncStorage, and returns the current value.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/services/api';

const BALANCE_KEY = '@ms_wallet_balance';

export function useWalletBalance(): number {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    // Load cached value immediately for instant display
    AsyncStorage.getItem(BALANCE_KEY)
      .then((v) => { if (v) setBalance(Number(v)); })
      .catch(() => {});

    // Fetch fresh value from API
    (async () => {
      try {
        const token = await AsyncStorage.getItem('@ms_access_token');
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
    })();
  }, []);

  return balance;
}
