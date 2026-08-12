/**
 * User Service - Handles authentication, user profile, user search, block/unblock.
 */

import { apiFetch, authFetch } from './api';
import { User } from '../types';

export function normalizeUser(raw: any): User {
  if (!raw) return { id: 'unknown', username: 'unknown', name: 'User', avatarUrl: null };
  return {
    id: raw.id || raw.user_id || 'unknown',
    name: raw.full_name || raw.name || raw.display_name || raw.username || 'User',
    username: raw.username || 'user',
    email: raw.email || undefined,
    bio: raw.bio || null,
    avatarUrl: raw.avatar_url || raw.avatarUrl || raw.profile_picture_url || null,
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

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const resp = await apiFetch<any>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const accessToken = resp.access_token || resp.token || resp.data?.access_token;
  const refreshToken = resp.refresh_token || resp.data?.refresh_token;

  if (accessToken) {
    localStorage.setItem('@ms_access_token', accessToken);
  }
  if (refreshToken) {
    localStorage.setItem('@ms_refresh_token', refreshToken);
  }

  const user = normalizeUser(resp.user || resp.data?.user || resp);
  return { token: accessToken, user };
}

export async function register(data: {
  email: string;
  password: string;
  username: string;
  fullName: string;
}): Promise<{ token: string; user: User }> {
  const resp = await apiFetch<any>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: data.email,
      password: data.password,
      username: data.username,
      full_name: data.fullName,
    }),
  });

  const accessToken = resp.access_token || resp.token || resp.data?.access_token;
  if (accessToken) {
    localStorage.setItem('@ms_access_token', accessToken);
  }

  const user = normalizeUser(resp.user || resp.data?.user || resp);
  return { token: accessToken, user };
}

export async function getMe(): Promise<User> {
  const resp = await authFetch<any>('/users/me');
  return normalizeUser(resp.user || resp);
}

export async function getUserProfile(username: string): Promise<User> {
  const resp = await apiFetch<any>(`/users/${encodeURIComponent(username)}`);
  return normalizeUser(resp.user || resp);
}

export async function searchUsers(q: string): Promise<User[]> {
  if (!q.trim()) return [];
  const resp = await authFetch<any>(`/users/search?q=${encodeURIComponent(q)}`);
  const list = resp.users || (Array.isArray(resp) ? resp : []);
  return list.map((u: any) => normalizeUser(u));
}

export async function blockUser(username: string): Promise<void> {
  await authFetch<void>(`/users/${encodeURIComponent(username)}/block`, undefined, {
    method: 'POST',
  });
}

export async function unblockUser(username: string): Promise<void> {
  await authFetch<void>(`/users/${encodeURIComponent(username)}/block`, undefined, {
    method: 'DELETE',
  });
}
