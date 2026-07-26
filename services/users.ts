import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';
import type { User } from '@/contexts/AuthContext';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeUser(raw: any): User {
  return {
    id: raw.id,
    name: raw.full_name ?? raw.name ?? raw.display_name ?? '',
    username: raw.username ?? '',
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    bio: raw.bio ?? null,
    avatarUrl: raw.avatar_url ?? null,
    bannerUrl: raw.banner_url ?? null,
    website: raw.website ?? null,
    location: raw.location ?? null,
    isVerified: raw.is_verified ?? false,
    isCreator: raw.is_creator ?? false,
    isVerifiedCreator: raw.is_verified_creator ?? false,
    role: raw.role ?? 'user',
    followerCount: raw.follower_count ?? 0,
    followingCount: raw.following_count ?? 0,
    postCount: raw.post_count ?? 0,
    createdAt: raw.created_at ?? new Date().toISOString(),
  };
}

export async function getMe(): Promise<{ user: User }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<unknown>('/users/me', { headers: authHeader(token) });
  return { user: normalizeUser(raw) };
}

export async function updateMe(data: {
  name?: string;
  username?: string;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}): Promise<{ user: User }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const payload = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.username !== undefined ? { username: data.username } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    ...(data.website !== undefined ? { website: data.website } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.avatarUrl !== undefined ? { avatar_url: data.avatarUrl } : {}),
    ...(data.bannerUrl !== undefined ? { banner_url: data.bannerUrl } : {}),
  };
  const raw = await apiFetch<{ user: unknown }>('/users/me', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
  return { user: normalizeUser(raw?.user ?? raw) };
}

export async function getUser(
  username: string,
): Promise<{ user: User; isFollowing: boolean }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const raw = await apiFetch<{ user: unknown; isFollowing?: boolean }>(
    `/users/${encodeURIComponent(username)}`,
    { headers },
  );
  return {
    user: normalizeUser(raw?.user ?? raw),
    isFollowing: raw?.isFollowing ?? false,
  };
}

export async function followUser(username: string): Promise<{ following: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/users/${encodeURIComponent(username)}/follow`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function unfollowUser(username: string): Promise<{ following: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/users/${encodeURIComponent(username)}/follow`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function searchUsers(
  q: string,
): Promise<{ users: Array<{ id: string; name: string; username: string; avatarUrl: string | null; isVerified: boolean }> }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ users: unknown[] }>(`/users/search?q=${encodeURIComponent(q)}`, {
    headers: authHeader(token),
  });
  const users = Array.isArray(raw?.users)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? raw.users.map((u: any) => ({
        id: u.id,
        name: u.name ?? u.full_name ?? '',
        username: u.username ?? '',
        avatarUrl: u.avatarUrl ?? u.avatar_url ?? null,
        isVerified: u.isVerified ?? u.is_verified ?? false,
      }))
    : [];
  return { users };
}

export async function blockUser(blockedId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/users/block', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ blocked_id: blockedId }),
  });
}

export async function unblockUser(blockedId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/users/block', {
    method: 'DELETE',
    headers: authHeader(token),
    body: JSON.stringify({ blocked_id: blockedId }),
  });
}

export async function reportUser(
  username: string,
  reason: string,
  description?: string,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/users/${encodeURIComponent(username)}/report`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ reason, description }),
  });
}

export async function updateAvatar(userId: string, formData: FormData): Promise<{ avatarUrl: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ avatar_url: string }>(`/profiles/${userId}/avatar`, {
    method: 'PUT',
    headers: authHeader(token),
    body: formData,
  });
  return { avatarUrl: raw.avatar_url };
}

export async function updateBanner(userId: string, formData: FormData): Promise<{ bannerUrl: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ banner_url: string }>(`/profiles/${userId}/banner`, {
    method: 'PUT',
    headers: authHeader(token),
    body: formData,
  });
  return { bannerUrl: raw.banner_url };
}

export async function getCreatorSettings(userId: string): Promise<{
  subscription_price: number | null;
  allow_dms: boolean;
  welcome_message: string | null;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/profiles/${userId}/creator-settings`, {
    headers: authHeader(token),
  });
}

export async function updateCreatorSettings(
  userId: string,
  data: { subscription_price?: number; allow_dms?: boolean; welcome_message?: string | null },
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/profiles/${userId}/creator-settings`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function checkUsernameAvailability(
  username: string,
): Promise<{ available: boolean }> {
  return apiFetch(
    `/auth/username-availability?username=${encodeURIComponent(username)}`,
  );
}
