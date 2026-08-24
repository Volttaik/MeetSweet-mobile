/**
 * Creator Service — Handles Creator Dashboard stats, settings, subscriber list, and profile.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, authFetch } from './api';

export interface PeriodStat {
  period: string;
  views: number;
  likes: number;
  new_subscribers: number;
  revenue: number;
}

export interface CreatorDashboard {
  total_revenue: number;
  active_subscribers: number;
  total_posts: number;
  period_stats: PeriodStat[];
}

export interface CreatorSettings {
  who_can_message?: 'everyone' | 'subscribers' | 'none';
  allow_comments?: boolean;
  who_can_comment?: 'everyone' | 'subscribers' | 'none';
  who_can_see?: 'everyone' | 'subscribers' | 'none';
  subscriptions_enabled?: boolean;
  subscription_price?: number;
  subscription_plus_price?: number;
}

export interface CreatorSubscriber {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  subscribed_at: string;
}

import { getAccessToken } from '@/lib/session-storage';

async function getToken(): Promise<string | null> {
  return getAccessToken();
}

async function authedRequest<T>(
  path: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return authFetch<T>(path, token, options);
}

export async function getCreatorDashboard(): Promise<CreatorDashboard> {
  // Real data only — no fabricated zero rows. Errors propagate so the screen
  // can show a proper error/empty state instead of invented analytics.
  return authedRequest<CreatorDashboard>('/creator/dashboard');
}

/**
 * Promote the authenticated account to a creator (server-authoritative).
 * The server flips users.is_creator/role and seeds creator_settings with the
 * default subscription price. The caller should then refresh the auth user so
 * the UI renders creator state from the server. Throws on failure (including
 * 409 when the account is already a creator).
 *
 * Requires creator_activation_paid = true first.
 */
export async function becomeCreator(): Promise<{ is_creator: boolean }> {
  return authedRequest<{ is_creator: boolean }>('/creator/become', {
    method: 'POST',
  });
}

/**
 * Initiate the ₦1,000 creator activation payment via Paystack.
 * Returns the authorization_url for the Paystack checkout.
 *
 * `email` is forwarded to the backend when the signed-in user has one, so the
 * Paystack checkout is created against a real email and the activation never
 * fails with a spurious "Email is required" error.
 */
export async function initiateActivation(email?: string | null): Promise<{
  transactionId: string;
  reference: string;
  authorizationUrl: string;
  amount: number;
}> {
  return authedRequest('/creator/activation', {
    method: 'POST',
    body: email ? JSON.stringify({ email }) : undefined,
  });
}

/**
 * Verify the creator activation payment with the server.
 * The server verifies the Paystack transaction — never trust client-side.
 */
export async function verifyActivation(
  transactionId: string,
  reference?: string,
): Promise<{ activated: boolean; is_creator: boolean; creator_activation_paid: boolean }> {
  return authedRequest('/creator/activation/verify', {
    method: 'POST',
    body: JSON.stringify({ transactionId, reference }),
  });
}

export async function getCreatorSettings(): Promise<CreatorSettings> {
  return authedRequest<CreatorSettings>('/creator/settings');
}

export async function updateCreatorSettings(patch: Partial<CreatorSettings>): Promise<CreatorSettings> {
  return authedRequest<CreatorSettings>('/creator/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getCreatorSubscribers(page = 1): Promise<{ subscribers: CreatorSubscriber[] }> {
  return authedRequest<{ subscribers: CreatorSubscriber[] }>(`/creator/subscribers?page=${page}`);
}
