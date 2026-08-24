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

export async function checkEmailAvailability(email: string): Promise<{ available: boolean }> {
  // apiFetch throws on non-2xx (e.g. before this route is deployed) — the
  // caller treats a thrown error as "couldn't verify" and never claims the
  // email is available on a failed check.
  const resp = await apiFetch<{ available?: boolean; ok?: boolean }>(
    `/users/check-email?email=${encodeURIComponent(email)}`,
  );
  if (resp && typeof resp.available === 'boolean') {
    return { available: resp.available };
  }
  throw new Error('Could not check email availability');
}

export async function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  // apiFetch throws on non-2xx — callers treat a thrown error as "couldn't
  // verify" (neutral/error state) rather than claiming the username is free.
  const resp = await apiFetch<{ available?: boolean; ok?: boolean }>(
    `/users/check-username?username=${encodeURIComponent(username)}`,
  );
  if (resp && typeof resp.available === 'boolean') {
    return { available: resp.available };
  }
  throw new Error('Could not check username availability');
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

