import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';
import type { User } from '@/contexts/AuthContext';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Normalise camelCase / snake_case user objects returned by the backend. */
function normalizeUser(raw: any): User {
  return {
    id: String(raw.id),
    name: raw.name ?? raw.full_name ?? raw.display_name ?? '',
    username: raw.username ?? '',
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    bio: raw.bio ?? null,
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? null,
    bannerUrl: raw.bannerUrl ?? raw.banner_url ?? null,
    isVerified: raw.isVerified ?? raw.is_verified ?? false,
    isCreator: raw.isCreator ?? raw.is_creator ?? false,
    credits: raw.credits ?? raw.credit_balance ?? 0,
    followerCount: raw.followerCount ?? raw.follower_count ?? 0,
    followingCount: raw.followingCount ?? raw.following_count ?? 0,
    subscriberCount: raw.subscriberCount ?? raw.subscriber_count ?? 0,
    postCount: raw.postCount ?? raw.post_count ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date(0).toISOString(),
  };
}

export async function getMe(): Promise<{ user: User }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const data = await apiFetch<any>('/users/me', { headers: authHeader(token) });
  const raw = data?.user ?? data;
  return { user: normalizeUser(raw) };
}

export async function updateMe(data: {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
}): Promise<{ user: User }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Send both camelCase and snake_case for maximum backend compatibility
  const body = {
    name: data.name,
    bio: data.bio,
    avatarUrl: data.avatarUrl,
    bannerUrl: data.bannerUrl,
    avatar_url: data.avatarUrl,
    banner_url: data.bannerUrl,
  };
  const result = await apiFetch<any>('/users/me', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(body),
  });
  const raw = result?.user ?? result;
  return { user: normalizeUser(raw) };
}

export async function getUser(username: string): Promise<{ user: User; isFollowing: boolean }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const data = await apiFetch<any>(`/users/${username}`, { headers });
  const raw = data?.user ?? data;
  return {
    user: normalizeUser(raw),
    isFollowing: data?.isFollowing ?? data?.is_following ?? false,
  };
}

export async function followUser(username: string): Promise<{ following: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const data = await apiFetch<any>(`/users/${username}/follow`, {
    method: 'POST',
    headers: authHeader(token),
  });
  return { following: data?.following ?? data?.is_following ?? true };
}

export async function unfollowUser(username: string): Promise<{ following: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const data = await apiFetch<any>(`/users/${username}/follow`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
  return { following: data?.following ?? data?.is_following ?? false };
}
