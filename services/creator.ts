import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { Creator, ContentPreview } from '@/lib/api-client-react';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface PeriodStat {
  period: string;
  views: number;
  likes: number;
  new_subscribers: number;
  revenue: number;
}

export interface CreatorDashboard {
  wallet_balance: number;
  active_subscribers: number;
  total_posts: number;
  period_stats: PeriodStat[];
  total_revenue: number;
  recent_transactions: unknown[];
}

// ─── Creator Settings (GET /creator/settings, PATCH /creator/settings) ────────

export interface CreatorSettings {
  subscription_price: number | null;
  allow_dms: boolean;
  allow_comments: boolean;
  who_can_message: 'everyone' | 'subscribers' | 'none';
  welcome_message: string | null;
}

export async function getCreatorSettings(): Promise<CreatorSettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/creator/settings', { headers: authHeader(token) });
}

export async function updateCreatorSettings(data: Partial<CreatorSettings>): Promise<CreatorSettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/creator/settings', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

// ─── Creator Statistics (GET /creator/statistics) ─────────────────────────────

export async function getCreatorStatistics(period?: string): Promise<{
  period_stats: PeriodStat[];
  active_subscribers: number;
  total_posts: number;
  total_revenue: number;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return apiFetch(`/creator/statistics${qs}`, { headers: authHeader(token) });
}

// ─── Creator Dashboard (aggregated from spec endpoints) ───────────────────────

export async function getCreatorDashboard(): Promise<CreatorDashboard> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Aggregate from the two spec endpoints that cover dashboard data
  const [stats, wallet] = await Promise.all([
    apiFetch<{
      period_stats: PeriodStat[];
      active_subscribers: number;
      total_posts: number;
      total_revenue: number;
    }>('/creator/statistics', { headers: authHeader(token) }).catch(() => null),
    apiFetch<{ balance: number }>('/wallet', { headers: authHeader(token) }).catch(() => null),
  ]);
  return {
    wallet_balance: wallet?.balance ?? 0,
    active_subscribers: stats?.active_subscribers ?? 0,
    total_posts: stats?.total_posts ?? 0,
    period_stats: stats?.period_stats ?? [],
    total_revenue: stats?.total_revenue ?? 0,
    recent_transactions: [],
  };
}

export async function getCreatorSubscribers(page = 1): Promise<{
  subscribers: Array<{
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    subscribed_at: string;
    expires_at: string;
  }>;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Spec: GET /subscriptions?type=subscribers
  const raw = await apiFetch<{ subscriptions: unknown[] }>(
    `/subscriptions?type=subscribers&limit=20`,
    { headers: authHeader(token) },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscribers = Array.isArray(raw?.subscriptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? raw.subscriptions.map((s: any) => ({
        id: s.id,
        user_id: s.user_id ?? s.subscriber_id ?? '',
        username: s.username ?? s.subscriber_username ?? '',
        display_name: s.display_name ?? s.subscriber_display_name ?? null,
        avatar_url: s.avatar_url ?? s.subscriber_avatar ?? null,
        subscribed_at: s.started_at ?? s.subscribed_at ?? s.created_at ?? '',
        expires_at: s.expires_at ?? '',
      }))
    : [];
  return { subscribers };
}

export async function becomeCreator(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Not in current spec — will gracefully 404 until backend adds it
  await apiFetch('/creator/become', {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function requestVerification(data: {
  id_type: string;
  id_number: string;
}): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Not in current spec — will gracefully 404 until backend adds it
  await apiFetch('/creator/verification', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function requestWithdrawal(data: {
  amount: number;
  bank_code: string;
  account_number: string;
}): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/creator/withdraw', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}
