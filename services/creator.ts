import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

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

export async function getCreatorDashboard(): Promise<CreatorDashboard> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/creator/dashboard', { headers: authHeader(token) });
}

export async function getCreatorAnalytics(): Promise<{
  period_stats: PeriodStat[];
  active_subscribers: number;
  total_posts: number;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/creator/analytics', { headers: authHeader(token) });
}

export async function getCreatorRevenue(): Promise<{
  total_revenue: number;
  transactions: unknown[];
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/creator/revenue', { headers: authHeader(token) });
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
  return apiFetch(`/creator/subscribers?page=${page}&limit=20`, {
    headers: authHeader(token),
  });
}

export async function becomeCreator(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
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
