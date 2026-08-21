/**
 * WalletContext — single authoritative client-side source for the user's
 * Naira wallet balance.
 *
 * WHY THIS EXISTS (fixes the stale-header bug):
 * The old `useWalletBalance` hook kept a private `useState` copy per caller.
 * The Home header mounted once, fetched once, and never learned about the new
 * balance after a deposit — it only caught up after an app restart. With this
 * context, EVERY consumer (Home header badge, wallet page, subscribe sheet,
 * creator profile) reads the SAME state, so any confirmed balance change
 * re-renders them all immediately.
 *
 * SERVER REMAINS AUTHORITATIVE:
 * The client never fabricates a balance. Values enter this store only from:
 *   - `refreshWallet()` — a fresh GET /wallet response, or
 *   - `setBalance(n)` — a balance returned by a server-confirmed mutation
 *     (e.g. verify-paystack returns `newBalance`).
 * The cached copy in AsyncStorage is a hydration hint for instant display,
 * always revalidated against the server.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch } from '@/services/api';
import { useAuth } from './AuthContext';

const BALANCE_KEY = '@ms_wallet_balance';

interface WalletContextValue {
  /** Current balance in Naira (0 before the first load). */
  balance: number;
  /** True once the cached balance has been hydrated from storage. */
  loaded: boolean;
  /** Fetch the authoritative balance from the server and update all consumers. */
  refreshWallet: () => Promise<void>;
  /** Apply a balance returned by a server-confirmed mutation. */
  setBalance: (balance: number) => void;
  /** Clear the balance (e.g. on logout) so the next user never sees it. */
  resetWallet: () => void;
}

const WalletContext = createContext<WalletContextValue>({
  balance: 0,
  loaded: false,
  refreshWallet: async () => {},
  setBalance: () => {},
  resetWallet: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [balance, setBalanceState] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const lastAuthRef = useRef(isAuthenticated);

  const persist = useCallback((value: number) => {
    AsyncStorage.setItem(BALANCE_KEY, String(value)).catch(() => {});
  }, []);

  const setBalance = useCallback(
    (value: number) => {
      setBalanceState(value);
      persist(value);
    },
    [persist],
  );

  const refreshWallet = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const raw = await apiFetch<any>('/wallet', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const bal = Number(raw?.balance ?? raw?.data?.balance ?? 0);
      setBalance(bal);
    } catch {
      // Keep the cached value on transient failures — never blank the balance.
    }
  }, [setBalance]);

  const resetWallet = useCallback(() => {
    setBalanceState(0);
    AsyncStorage.removeItem(BALANCE_KEY).catch(() => {});
  }, []);

  // Hydrate the cached balance immediately so the first paint is instant.
  useEffect(() => {
    AsyncStorage.getItem(BALANCE_KEY)
      .then((v) => {
        if (v !== null) setBalanceState(Number(v));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Keep the balance in sync with the session: refresh on login, clear on
  // logout so a different account can never see the previous user's balance.
  useEffect(() => {
    if (lastAuthRef.current === isAuthenticated) return;
    lastAuthRef.current = isAuthenticated;
    if (isAuthenticated) {
      refreshWallet();
    } else {
      resetWallet();
    }
  }, [isAuthenticated, refreshWallet, resetWallet]);

  // Self-heal on foreground: re-fetch the authoritative balance whenever the
  // app returns to the foreground with an active session (e.g. a payment
  // confirmed while the app was backgrounded). In-session mutations update the
  // store instantly via setBalance/refreshWallet, so this is just a safety net.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated) {
        refreshWallet();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, refreshWallet]);

  return (
    <WalletContext.Provider
      value={{ balance, loaded, refreshWallet, setBalance, resetWallet }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  return useContext(WalletContext);
}
