import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
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

/**
 * GET /search/trending
 * Returns trending search terms. Returns an empty array when the endpoint
 * is unavailable (404 / 501 / network error) — no hardcoded fallbacks.
 */
export async function getTrendingSearches(): Promise<string[]> {
  const token = await getToken();
  try {
    const raw = await apiFetch<{ trending?: unknown[]; searches?: unknown[]; terms?: unknown[] }>(
      '/search/trending',
      { headers: token ? authHeader(token) : {} },
    );
    const list = raw?.trending ?? raw?.searches ?? raw?.terms ?? [];
    if (!Array.isArray(list)) return [];
    return list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) =>
        typeof item === 'string' ? item : (item.query ?? item.term ?? item.label ?? ''),
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * React Query hook for trending searches.
 * Returns an empty array while the backend endpoint is pending implementation.
 */
export function useTrendingSearches() {
  return useQuery({
    queryKey: ['search-trending'] as const,
    queryFn: getTrendingSearches,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
