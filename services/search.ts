import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function search(
  q: string,
  type: 'all' | 'users' | 'creators' | 'posts' = 'all',
  page = 1,
): Promise<{ users: unknown[]; posts: unknown[] }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  return apiFetch(
    `/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}&limit=20`,
    { headers },
  );
}

export async function getRecentSearches(): Promise<
  Array<{ id: string; query: string; created_at: string }>
> {
  const token = await getToken();
  if (!token) return [];
  const raw = await apiFetch<Array<{ id: string; query: string; created_at: string }>>('/search/recent', {
    headers: authHeader(token),
  });
  return Array.isArray(raw) ? raw : [];
}

export async function clearSearchHistory(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/search/recent', {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function getExplore(page = 1): Promise<{ users: unknown[]; posts: unknown[] }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  return apiFetch(`/explore?page=${page}&limit=20`, { headers });
}
