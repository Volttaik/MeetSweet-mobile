/**
 * useWalletBalance — shared Naira wallet balance.
 *
 * Thin wrapper over WalletContext: every caller reads the SAME authoritative
 * balance, so a server-confirmed change (deposit verified, subscription
 * charged, album purchased) re-renders the Home header badge, the wallet page,
 * and the subscribe sheet at once — no app restart required.
 *
 * The return shape is kept compatible with the previous hook so existing call
 * sites (Home header, creator profile, new-user-welcome) work unchanged.
 */
import { useWallet } from '@/contexts/WalletContext';

export function useWalletBalance(): { balance: number; refreshWallet: () => Promise<void> } {
  const { balance, refreshWallet } = useWallet();
  return { balance, refreshWallet };
}
