/**
 * useCredits — legacy hook kept for compatibility.
 * Now returns wallet balance (Naira) instead of credits.
 * @deprecated Use useWalletBalance from hooks/useWalletBalance instead.
 */
export { useWalletBalance as useCredits } from '@/hooks/useWalletBalance';
