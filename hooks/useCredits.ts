/**
 * useCredits — fetches the user's credit balance from the API,
 * caches in AsyncStorage, and returns the current value.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/services/api';

const CREDITS_KEY = '@ms_credit_balance';

export function useCredits(): number {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    // Load cached value immediately for instant display
    AsyncStorage.getItem(CREDITS_KEY)
      .then((v) => { if (v) setBalance(Number(v)); })
      .catch(() => {});

    // Fetch fresh value from API
    (async () => {
      try {
        const token = await AsyncStorage.getItem('@ms_access_token');
        if (!token) return;
        const raw = await apiFetch<any>('/users/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const credits = Number(
          raw?.data?.credits ?? raw?.credits ?? raw?.user?.credits ?? 0
        );
        setBalance(credits);
        await AsyncStorage.setItem(CREDITS_KEY, String(credits));
      } catch {
        // silently use cached
      }
    })();
  }, []);

  return balance;
}
