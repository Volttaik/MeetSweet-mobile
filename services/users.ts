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
    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? raw.profile_picture_url ?? null,
    bannerUrl: raw.banner_url ?? raw.bannerUrl ?? null,
    website: raw.website ?? null,
    location: raw.location ?? null,
    isVerified: raw.is_verified ?? false,
    isCreator: raw.is_creator ?? false,
    isVerifiedCreator: raw.is_verified_creator ?? false,
    role: raw.role ?? 'user',
    subscriberCount: raw.subscriber_count ?? 0,
    subscribingCount: raw.subscription_count ?? 0,
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
  displayName?: string;
  username?: string;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  phone?: string | null;
}): Promise<{ user: User }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const payload = {
    // spec field names for PATCH /users/me
    ...(data.name !== undefined ? { full_name: data.name } : {}),
    ...(data.displayName !== undefined ? { display_name: data.displayName } : {}),
    ...(data.username !== undefined ? { username: data.username } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    ...(data.website !== undefined ? { website: data.website } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.avatarUrl !== undefined ? { avatar_url: data.avatarUrl } : {}),
    ...(data.bannerUrl !== undefined ? { banner_url: data.bannerUrl } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
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
): Promise<{ user: User }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const raw = await apiFetch<{ user: unknown }>(
    `/users/${encodeURIComponent(username)}`,
    { headers },
  );
  return {
    user: normalizeUser(raw?.user ?? raw),
  };
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
        name: u.name ?? u.full_name ?? u.display_name ?? u.displayName ?? '',
        username: u.username ?? '',
        avatarUrl: u.avatarUrl ?? u.avatar_url ?? u.profile_picture_url ?? null,
        isVerified: u.isVerified ?? u.is_verified ?? false,
      }))
    : [];
  return { users };
}

export async function blockUser(username: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/users/${encodeURIComponent(username)}/block`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function unblockUser(username: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/users/${encodeURIComponent(username)}/block`, {
    method: 'DELETE',
    headers: authHeader(token),
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

/** Update the authenticated user's avatar. Pass the R2 object URL after upload. */
export async function updateAvatar(_userId: string, avatarUrl: string): Promise<{ avatarUrl: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ user: unknown }>('/users/me', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ avatar_url: avatarUrl }),
  });
  const user = normalizeUser(raw?.user ?? raw);
  return { avatarUrl: user.avatarUrl ?? avatarUrl };
}

/** Update the authenticated user's banner. Pass the R2 object URL after upload. */
export async function updateBanner(_userId: string, bannerUrl: string): Promise<{ bannerUrl: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ user: unknown }>('/users/me', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ banner_url: bannerUrl }),
  });
  const user = normalizeUser(raw?.user ?? raw);
  return { bannerUrl: user.bannerUrl ?? bannerUrl };
}

export async function getCreatorSettings(_userId?: string): Promise<{
  subscription_price: number | null;
  allow_dms: boolean;
  allow_comments: boolean;
  welcome_message: string | null;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/creator/settings', {
    headers: authHeader(token),
  });
}

export async function updateCreatorSettings(
  _userId: string | undefined,
  data: { subscription_price?: number; allow_dms?: boolean; allow_comments?: boolean; welcome_message?: string | null },
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/creator/settings', {
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
