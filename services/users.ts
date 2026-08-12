/**
 * User Service — Handles profile updates, username checks, user profile retrieval, block/unblock, and search.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, authFetch } from './api';

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  isVerified?: boolean;
  isCreator?: boolean;
  creatorTier?: string;
  followersCount?: number;
  followingCount?: number;
  subscribersCount?: number;
  postsCount?: number;
  createdAt?: string;
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

export function normalizeUser(raw: any): User {
  if (!raw) return { id: 'unknown', username: 'unknown', name: 'User', avatarUrl: null };
  return {
    id: raw.id || raw.user_id || 'unknown',
    name: raw.full_name || raw.name || raw.display_name || raw.username || 'User',
    username: raw.username || 'user',
    email: raw.email || undefined,
    phone: raw.phone || undefined,
    bio: raw.bio || null,
    avatarUrl: raw.avatar_url || raw.avatarUrl || raw.profile_picture_url || null,
    bannerUrl: raw.banner_url || raw.bannerUrl || null,
    isVerified: Boolean(raw.is_verified || raw.isVerified),
    isCreator: Boolean(raw.is_creator || raw.isCreator || raw.is_verified_creator),
    creatorTier: raw.creator_tier || raw.creatorTier || undefined,
    followersCount: Number(raw.followers_count || raw.followersCount || 0),
    followingCount: Number(raw.following_count || raw.followingCount || 0),
    subscribersCount: Number(raw.subscribers_count || raw.subscriber_count || 0),
    postsCount: Number(raw.posts_count || raw.post_count || 0),
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
  };
}

export async function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  try {
    const resp = await apiFetch<{ available?: boolean; ok?: boolean }>(
      `/users/check-username?username=${encodeURIComponent(username)}`,
    );
    if (resp && typeof resp.available === 'boolean') {
      return { available: resp.available };
    }
    return { available: true };
  } catch {
    // Basic client validation if endpoint fails
    const isValidLength = username.length >= 3 && username.length <= 30;
    const isValidChars = /^[a-zA-Z0-9_]+$/.test(username);
    return { available: isValidLength && isValidChars };
  }
}

export async function updateMe(fields: Record<string, any>): Promise<{ user: User }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const resp = await authFetch<any>('/users/me', token, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });

  const updatedRaw = resp.user || resp.data?.user || resp;
  const user = normalizeUser(updatedRaw);

  // Update cached user in AsyncStorage
  try {
    const stored = await AsyncStorage.getItem('@ms_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      await AsyncStorage.setItem('@ms_user', JSON.stringify({ ...parsed, ...user }));
    }
  } catch {}

  return { user };
}

export async function getMe(): Promise<User> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const resp = await authFetch<any>('/users/me', token);
  return normalizeUser(resp.user || resp);
}

export async function getUserProfile(username: string): Promise<User> {
  const resp = await apiFetch<any>(`/users/${encodeURIComponent(username)}`);
  return normalizeUser(resp.user || resp);
}

export async function searchUsers(q: string): Promise<User[]> {
  if (!q.trim()) return [];
  const token = await getToken();
  const resp = token
    ? await authFetch<any>(`/users/search?q=${encodeURIComponent(q)}`, token)
    : await apiFetch<any>(`/users/search?q=${encodeURIComponent(q)}`);
  const list = resp.users || (Array.isArray(resp) ? resp : []);
  return list.map((u: any) => normalizeUser(u));
}

export async function blockUser(username: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/users/${encodeURIComponent(username)}/block`, token, {
    method: 'POST',
  });
}

export async function unblockUser(username: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/users/${encodeURIComponent(username)}/block`, token, {
    method: 'DELETE',
  });
}

export async function reportUser(username: string, reason: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/users/${encodeURIComponent(username)}/report`, token, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
