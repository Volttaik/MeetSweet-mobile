/**
 * Explore Service — Catalog items, categories, search, time helpers.
 */
import { apiFetch } from './api';

export function fmtTimeAgo(dateString: string): string {
  if (!dateString) return 'recently';
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function useLocalExploreCatalog() {
  const cats = [
    { id: '1', name: 'Trending' },
    { id: '2', name: 'Music' },
    { id: '3', name: 'Fitness' },
    { id: '4', name: 'Lifestyle' },
    { id: '5', name: 'Art' },
  ];
  return {
    categories: cats,
    data: {
      categories: cats,
      previews: [] as any[],
      creators: [] as any[],
      collections: [] as any[],
      featuredCreatorIds: [] as string[],
      recommendedCreatorIds: [] as string[],
    },
    isLoading: false,
    isError: false,
    refetch: async () => {},
  };
}

export async function getExploreFeed(category?: string): Promise<any[]> {
  const url = category ? `/explore?category=${encodeURIComponent(category)}` : '/explore';
  try {
    const resp = await apiFetch<any>(url);
    return resp.items || (Array.isArray(resp) ? resp : []);
  } catch {
    return [];
  }
}

export function useExploreFeed() {
  return {
    data: {
      pages: [] as { creators: any[]; previews: any[] }[],
    },
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: async () => {},
    isError: false,
    refetch: async () => {},
  };
}
