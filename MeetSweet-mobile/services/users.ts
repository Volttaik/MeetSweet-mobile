/**
 * User Service — Handles profile updates, username checks, user profile retrieval, block/unblock, and search.
 */
import { apiFetch, authFetch } from './api';
import { type User, normalizeUser } from '@/contexts/AuthContext';
import { getAccessToken, saveSessionUser } from '@/lib/session-storage';

export type { User };
export { normalizeUser };

async function getToken(): Promise<string | null> {
  return getAccessToken();
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

  // Update cached user in session storage
  try {
    await saveSessionUser(user);
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

