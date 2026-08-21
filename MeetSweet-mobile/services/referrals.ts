import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch, apiFetch } from '@/services/api';
import { getAccessToken } from '@/lib/session-storage';

const PENDING_REFERRAL_KEY = '@meetsweet_pending_referral_code';

export interface ReferralReferrer {
  id: string;
  name: string;
  username: string;
}

export interface ReferralLookup {
  code: string;
  referrer: ReferralReferrer;
}

export interface MyReferralLink {
  code: string;
  url: string;
  referral_link: string;
  is_creator: boolean;
  referrer: ReferralReferrer | null;
}

export async function savePendingReferralCode(code: string | null | undefined): Promise<void> {
  const normalized = code?.trim().toUpperCase();
  if (normalized && /^[A-Z0-9]{6,32}$/.test(normalized)) {
    await AsyncStorage.setItem(PENDING_REFERRAL_KEY, normalized);
  }
}

export async function getPendingReferralCode(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_REFERRAL_KEY);
}

export async function clearPendingReferralCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
}

export async function lookupReferral(code: string): Promise<ReferralLookup> {
  return apiFetch<ReferralLookup>(`/referrals/${encodeURIComponent(code)}`);
}

export async function getMyReferralLink(): Promise<MyReferralLink> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return authFetch<MyReferralLink>('/referrals/me', token);
}
