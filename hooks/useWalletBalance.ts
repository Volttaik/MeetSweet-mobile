/**
 * useWalletBalance — fetches the user's Naira wallet balance from the API,
 * caches the last known value in AsyncStorage and returns it as a number.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWallet } from '@/services/wallet';

const WALLET_KEY = '@ms_wallet_balance';

export function useWalletBalance(): number {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    // Restore cached balance immediately (no flash)
    AsyncStorage.getItem(WALLET_KEY)
      .then((v) => { if (v) setBalance(Number(v)); })
      .catch(() => {});

    // Fetch fresh balance from API
    getWallet()
      .then(({ balance: b }) => {
        setBalance(b);
        AsyncStorage.setItem(WALLET_KEY, String(b)).catch(() => {});
      })
      .catch(() => {});
  }, []);

  return balance;
}
