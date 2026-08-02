/**
 * Public creator profile service.
 *
 * Uses the live /api/users/:username endpoint for profile data.
 * Creator posts are fetched via /api/posts?creator_id=:id.
 *
 * NOTE: The backend has no /api/creators/:id endpoint.
 * Profile lookups are done via GET /api/users/:username.
 */
import { useQuery } from '@tanstack/react-query';
import { getUser } from './users';
import { getPostsByCreator } from './posts';
import type { Post } from './posts';
import type { User } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Re-export User as CreatorProfile for backward compat */
export type CreatorProfile = User & {
  subscription_price: number | null;
  follower_count: number;
  subscriber_count: number;
  post_count: number;
  is_verified: boolean;
  is_online: boolean;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  category: string | null;
};

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
 * GET /api/users/:username
 * Returns null when the endpoint is unavailable (404 / network error).
 */
export async function getCreatorByUsername(username: string): Promise<CreatorProfile | null> {
  try {
    const result = await getUser(username);
    const u = result.user;
    return {
      ...u,
      subscription_price: null,
      follower_count: u.followerCount ?? 0,
      subscriber_count: u.subscriberCount ?? 0,
      post_count: u.postCount ?? 0,
      is_verified: u.isVerified,
      is_online: false,
      display_name: u.name,
      avatar_url: u.avatarUrl,
      banner_url: u.bannerUrl,
      category: null,
    } as CreatorProfile;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use getCreatorByUsername instead.
 * Kept for backward compat — returns null immediately since /creators/:id doesn't exist.
 */
export async function getCreatorProfile(_id: string): Promise<CreatorProfile | null> {
  return null;
}

/**
 * GET /api/posts?creator_id=:id
 * Returns empty on error.
 */
export async function getCreatorPosts(
  creatorId: string,
  cursor?: string | null,
): Promise<{ posts: Post[]; next_cursor: string | null }> {
  try {
    const result = await getPostsByCreator(creatorId, cursor ?? undefined);
    return {
      posts: result.posts,
      next_cursor: result.nextCursor,
    };
  } catch {
    return { posts: [], next_cursor: null };
  }
}

/**
 * Reviews are not supported by the backend.
 * Returns an empty list for graceful degradation.
 */
export async function getCreatorReviews(
  _id: string,
  _page = 1,
): Promise<{ reviews: CreatorReview[]; total: number; average_rating: number | null }> {
  return { reviews: [], total: 0, average_rating: null };
}

/**
 * Stats are not supported by a dedicated endpoint.
 * Returns null for graceful degradation.
 */
export async function getCreatorStats(_id: string): Promise<CreatorStats | null> {
  return null;
}

// ─── React Query hooks ────────────────────────────────────────────────────────

/**
 * Fetches the creator profile by username from GET /api/users/:username.
 * Returns null while loading or when the user is not found.
 *
 * @param username - The creator's username (without @).
 */
export function useCreatorProfileByUsername(username: string | undefined) {
  return useQuery({
    queryKey: ['creator-profile', username],
    queryFn: () => getCreatorByUsername(username!),
    enabled: Boolean(username),
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });
}

/**
 * @deprecated Use useCreatorProfileByUsername instead.
 * Kept for backward compat — always returns null since /creators/:id doesn't exist.
 */
export function useCreatorProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['creator-profile-id', id],
    queryFn: async () => null as CreatorProfile | null,
    enabled: Boolean(id),
    staleTime: 3 * 60 * 1000,
  });
}

/**
 * Reviews are not supported. Returns an empty result.
 */
export function useCreatorReviews(_id: string | undefined, _page = 1) {
  return useQuery({
    queryKey: ['creator-reviews-empty'],
    queryFn: async (): Promise<{ reviews: CreatorReview[]; total: number; average_rating: number | null }> => ({ reviews: [] as CreatorReview[], total: 0, average_rating: null }),
    staleTime: Infinity,
  });
}

/**
 * Stats are not supported by a dedicated endpoint. Returns null.
 */
export function useCreatorStats(_id: string | undefined) {
  return useQuery({
    queryKey: ['creator-stats-empty'],
    queryFn: async () => null as CreatorStats | null,
    staleTime: Infinity,
  });
}
