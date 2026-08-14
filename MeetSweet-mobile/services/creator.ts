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
  try {
    return await authedRequest<CreatorDashboard>('/creator/dashboard');
  } catch {
    // Graceful fallback for initial layout
    return {
      total_revenue: 0,
      active_subscribers: 0,
      total_posts: 0,
      period_stats: [
        { period: 'This Month', views: 0, likes: 0, new_subscribers: 0, revenue: 0 },
      ],
    };
  }
}

export async function getCreatorSettings(): Promise<CreatorSettings> {
  try {
    return await authedRequest<CreatorSettings>('/creator/settings');
  } catch {
    return {
      who_can_message: 'everyone',
      allow_comments: true,
      who_can_comment: 'everyone',
      who_can_see: 'everyone',
      subscriptions_enabled: true,
      subscription_price: 0,
      subscription_plus_price: 0,
    };
  }
}

export async function updateCreatorSettings(patch: Partial<CreatorSettings>): Promise<CreatorSettings> {
  return authedRequest<CreatorSettings>('/creator/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getCreatorSubscribers(page = 1): Promise<{ subscribers: CreatorSubscriber[] }> {
  try {
    return await authedRequest<{ subscribers: CreatorSubscriber[] }>(`/creator/subscribers?page=${page}`);
  } catch {
    return { subscribers: [] };
  }
}
