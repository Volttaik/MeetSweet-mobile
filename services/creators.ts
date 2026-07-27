/**
 * Public creator profile service.
 *
 * Covers all endpoints under /creators/:id — profile, posts, albums,
 * reviews, and stats.  Every function is intentionally defensive: a 404
 * or network error returns an empty/null value instead of throwing, so
 * the frontend degrades gracefully while the backend implements these
 * endpoints.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Full creator profile as returned by GET /creators/:id */
export interface CreatorProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  category: string | null;
  follower_count: number;
  subscriber_count: number;
  post_count: number;
  is_verified: boolean;
  is_online: boolean;
  /** Subscription price in credits (null means not a paid creator) */
  subscription_price: number | null;
}

/** A single review left by a subscriber */
export interface CreatorReview {
  id: string;
  reviewer_id: string;
  reviewer_username: string;
  reviewer_display_name: string | null;
  reviewer_avatar_url: string | null;
  /** 1–5 integer rating */
  rating: number;
  body: string;
  created_at: string;
}

/** Aggregate performance stats for a creator */
export interface CreatorStats {
  follower_count: number;
  subscriber_count: number;
  post_count: number;
  total_likes: number;
  average_rating: number | null;
  review_count: number;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * GET /creators/:id
 * Returns null when the endpoint is unavailable (404 / 501 / network error).
 */
export async function getCreatorProfile(id: string): Promise<CreatorProfile | null> {
  const token = await getToken();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await apiFetch(
      `/creators/${encodeURIComponent(id)}`,
      { headers: authHeaders(token) },
    );
    // The backend may wrap in { creator: {...} } or return the object directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = raw?.creator ?? raw;
    if (!d?.id) return null;
    return {
      id: d.id,
      username: d.username ?? '',
      display_name: d.display_name ?? d.name ?? '',
      bio: d.bio ?? null,
      avatar_url: d.avatar_url ?? d.avatarUrl ?? null,
      banner_url: d.banner_url ?? d.bannerUrl ?? null,
      category: d.category ?? null,
      follower_count: Number(d.follower_count ?? d.followers ?? 0),
      subscriber_count: Number(d.subscriber_count ?? d.subscriberCount ?? 0),
      post_count: Number(d.post_count ?? d.total_posts ?? 0),
      is_verified: Boolean(d.is_verified ?? d.isVerified ?? false),
      is_online: Boolean(d.is_online ?? d.isOnline ?? false),
      subscription_price:
        d.subscription_price != null ? Number(d.subscription_price) :
        d.subscriptionPrice != null  ? Number(d.subscriptionPrice)  :
        null,
    };
  } catch {
    return null;
  }
}

/**
 * GET /creators/:id/reviews?page=&limit=
 * Returns an empty list when the endpoint is unavailable.
 */
export async function getCreatorReviews(
  id: string,
  page = 1,
): Promise<{ reviews: CreatorReview[]; total: number; average_rating: number | null }> {
  const token = await getToken();
  try {
    const raw = await apiFetch<{
      reviews?: unknown[];
      total?: number;
      average_rating?: number | null;
    }>(
      `/creators/${encodeURIComponent(id)}/reviews?page=${page}&limit=20`,
      { headers: authHeaders(token) },
    );
    const list = Array.isArray(raw?.reviews) ? raw.reviews : [];
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reviews: list.map((r: any) => ({
        id: r.id ?? '',
        reviewer_id: r.reviewer_id ?? r.user_id ?? '',
        reviewer_username: r.reviewer_username ?? r.username ?? '',
        reviewer_display_name: r.reviewer_display_name ?? r.display_name ?? null,
        reviewer_avatar_url: r.reviewer_avatar_url ?? r.avatar_url ?? null,
        rating: Number(r.rating ?? 0),
        body: r.body ?? r.content ?? r.text ?? '',
        created_at: r.created_at ?? '',
      })),
      total: raw?.total ?? list.length,
      average_rating: raw?.average_rating != null ? Number(raw.average_rating) : null,
    };
  } catch {
    return { reviews: [], total: 0, average_rating: null };
  }
}

/**
 * GET /creators/:id/stats
 * Returns null when the endpoint is unavailable.
 */
export async function getCreatorStats(id: string): Promise<CreatorStats | null> {
  const token = await getToken();
  try {
    const raw = await apiFetch<Record<string, unknown>>(
      `/creators/${encodeURIComponent(id)}/stats`,
      { headers: authHeaders(token) },
    );
    if (!raw) return null;
    return {
      follower_count: Number(raw.follower_count ?? raw.followers ?? 0),
      subscriber_count: Number(raw.subscriber_count ?? raw.subscribers ?? 0),
      post_count: Number(raw.post_count ?? raw.posts ?? 0),
      total_likes: Number(raw.total_likes ?? raw.likes ?? 0),
      average_rating: raw.average_rating != null ? Number(raw.average_rating) : null,
      review_count: Number(raw.review_count ?? raw.reviews ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * GET /creators/:id/posts?cursor=&limit=
 * Returns empty on error so the profile drops tab shows an empty state.
 */
export async function getCreatorPosts(
  id: string,
  cursor?: string | null,
): Promise<{ posts: unknown[]; next_cursor: string | null }> {
  const token = await getToken();
  const qs = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=20`
    : '?limit=20';
  try {
    const raw = await apiFetch<{ posts?: unknown[]; next_cursor?: string | null }>(
      `/creators/${encodeURIComponent(id)}/posts${qs}`,
      { headers: authHeaders(token) },
    );
    return {
      posts: Array.isArray(raw?.posts) ? raw.posts : [],
      next_cursor: raw?.next_cursor ?? null,
    };
  } catch {
    return { posts: [], next_cursor: null };
  }
}

/**
 * GET /creators/:id/albums
 * Returns empty on error.
 */
export async function getCreatorAlbums(id: string): Promise<unknown[]> {
  const token = await getToken();
  try {
    const raw = await apiFetch<{ albums?: unknown[] }>(
      `/creators/${encodeURIComponent(id)}/albums`,
      { headers: authHeaders(token) },
    );
    return Array.isArray(raw?.albums) ? raw.albums : [];
  } catch {
    return [];
  }
}

// ─── React Query hooks ────────────────────────────────────────────────────────

/**
 * Fetches the full creator profile from GET /creators/:id.
 * Returns null while loading or when the endpoint is pending implementation.
 */
export function useCreatorProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['creator-profile', id] as const,
    queryFn: () => getCreatorProfile(id!),
    enabled: Boolean(id),
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Fetches subscriber reviews from GET /creators/:id/reviews.
 * Returns an empty list while the endpoint is pending implementation.
 */
export function useCreatorReviews(id: string | undefined, page = 1) {
  return useQuery({
    queryKey: ['creator-reviews', id, page] as const,
    queryFn: () => getCreatorReviews(id!, page),
    enabled: Boolean(id),
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Fetches aggregate creator stats from GET /creators/:id/stats.
 * Returns null while the endpoint is pending implementation.
 */
export function useCreatorStats(id: string | undefined) {
  return useQuery({
    queryKey: ['creator-stats', id] as const,
    queryFn: () => getCreatorStats(id!),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
