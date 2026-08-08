/**
 * Creator service — public creator profiles and content.
 *
 * Uses the current user/profile and posts endpoints. Creator-specific routes
 * from the original import are not available on the deployed API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { Post } from './posts';
import type { AlbumCardData } from './albums';
import { normalizeAlbumCard as _normalizeAlbumCard } from './albums';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatorProfileFull {
  id: string;
  /** Canonical user id used by direct-room creation. */
  userId?: string;
  username: string;
  name: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  website: string | null;
  location: string | null;
  isVerified: boolean;
  isCreator: boolean;
  isVerifiedCreator: boolean;
  role: string;
  subscriberCount: number;
  postCount: number;
  videoCount: number;
  shortCount: number;
  albumCount: number;
  subscriptionPrice: number | null;
  subscriptionPlusPrice?: number | null;
  whoCanMessage: 'everyone' | 'subscribers' | 'none';
  allowDms: boolean;
  /** Whether the currently authenticated user is subscribed to this creator */
  subscribedToCreator: boolean;
  createdAt: string;
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
  subscriber_count: number;
  post_count: number;
  total_likes: number;
  average_rating: number | null;
  review_count: number;
}

// Keep old type alias for backward compat with code that imports CreatorProfile
export type CreatorProfile = CreatorProfileFull & {
  subscription_price: number | null;
  subscriber_count: number;
  post_count: number;
  is_verified: boolean;
  is_online: boolean;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  category: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCreatorProfile(raw: any): CreatorProfileFull {
  return {
    id:                 raw.id ?? '',
    userId:             raw.user_id ?? raw.userId ?? raw.id ?? '',
    username:           raw.username ?? '',
    name:               raw.full_name ?? raw.display_name ?? raw.name ?? '',
    displayName:        raw.display_name ?? null,
    bio:                raw.bio ?? null,
    avatarUrl:          raw.avatar_url ?? null,
    bannerUrl:          raw.banner_url ?? null,
    website:            raw.website ?? null,
    location:           raw.location ?? null,
    isVerified:         raw.is_verified ?? false,
    isCreator:          raw.is_creator ?? true,
    isVerifiedCreator:  raw.is_verified_creator ?? false,
    role:               raw.role ?? 'user',
    subscriberCount:    raw.subscriber_count ?? 0,
    postCount:          raw.post_count ?? 0,
    videoCount:         raw.video_count ?? raw.videoCount ?? 0,
    shortCount:         raw.short_count ?? raw.shortCount ?? 0,
    albumCount:         raw.album_count ?? raw.albumCount ?? 0,
    subscriptionPrice:  raw.subscription_price ?? null,
    subscriptionPlusPrice: raw.subscription_plus_price ?? raw.subscriptionPlusPrice ?? null,
    whoCanMessage:      raw.who_can_message ?? raw.whoCanMessage ?? 'everyone',
    allowDms:           raw.allow_dms ?? raw.allowDms ?? true,
    subscribedToCreator: raw.subscribed_to_creator ?? false,
    createdAt:          raw.created_at ?? new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePostItem(raw: any): Post {
  // Inline lightweight normalizer for creator content items
  const media = Array.isArray(raw.media) ? raw.media : [];
  const firstMedia = media[0] ?? null;
  const rawContentType = raw.content_type ?? raw.contentType ?? null;
  const contentType: Post['contentType'] =
    rawContentType === 'short' ? 'short'
    : rawContentType === 'video' ? 'video'
    : rawContentType === 'album' ? 'album'
    : rawContentType === 'post'  ? 'post'
    : firstMedia?.type === 'video' ? 'video'
    : null;

  const creatorObj = raw.creator as any ?? null;
  const mediaUrl     = firstMedia?.url ?? raw.video_url ?? raw.videoUrl ?? null;
  const thumbnailUrl = firstMedia?.thumbnail_url ?? raw.thumbnail_url ?? raw.thumbnailUrl ?? null;

  return {
    id:           raw.id,
    caption:      raw.caption ?? '',
    visibility:   raw.visibility ?? 'public',
    contentType,
    mediaUrl,
    mediaType:    firstMedia?.type ?? (mediaUrl ? 'video' : null),
    thumbnailUrl,
    durationSecs: firstMedia?.duration_secs ?? raw.duration_secs ?? raw.durationSecs ?? null,
    fileSize:     firstMedia?.file_size ?? null,
    width:        firstMedia?.width  ?? null,
    height:       firstMedia?.height ?? null,
    likeCount:    raw.like_count    ?? raw.likeCount    ?? 0,
    commentCount: raw.comment_count ?? raw.commentCount ?? 0,
    bookmarkCount: raw.save_count   ?? 0,
    isLocked:     raw.is_locked ?? raw.isLocked ?? false,
    createdAt:    raw.created_at ?? raw.createdAt ?? raw.published_at ?? new Date().toISOString(),
    publishedAt:  raw.published_at ?? raw.publishedAt ?? raw.created_at,
    updatedAt:    raw.updated_at   ?? raw.updatedAt,
    title:        raw.title ?? null,
    author: {
      id:         creatorObj?.id      ?? raw.creator_id ?? '',
      name:       creatorObj?.name    ?? raw.creator_display_name ?? raw.creator_username ?? 'Unknown',
      username:   creatorObj?.username ?? raw.creator_username ?? '',
      avatarUrl:  creatorObj?.avatarUrl ?? creatorObj?.avatar_url ?? raw.creator_avatar ?? null,
      isVerified: creatorObj?.isVerified ?? creatorObj?.is_verified ?? raw.creator_is_verified ?? false,
      isCreator:  true,
    },
    likedByMe:     raw.liked_by_me ?? raw.likedByMe ?? false,
    bookmarkedByMe: raw.bookmarked_by_me ?? raw.bookmarkedByMe ?? false,
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * GET /api/creators/:username-or-id
 *
 * Creator pages are addressed by either a username or a user UUID. The
 * response's `id` is the participant ID required by POST /chat-rooms.
 */
export async function getCreatorById(id: string): Promise<CreatorProfileFull> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const raw = await apiFetch<unknown>(`/creators/${encodeURIComponent(id)}`, { headers });
  // Backend returns { creator: {...} } after the standard envelope unwrap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (raw as any)?.creator ?? (raw as any)?.user ?? raw;
  return normalizeCreatorProfile(data);
}

/**
 * GET /api/posts?creator_id=:id
 * Subscribed users get public + subscribers content.
 * Non-subscribers get public content only.
 */
export async function getCreatorContentPosts(
  id: string,
  cursor?: string | null,
): Promise<{ posts: Post[]; nextCursor: string | null; hasMore: boolean }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  try {
    const raw = await apiFetch<{ posts?: unknown[]; next_cursor?: string | null; has_more?: boolean }>(
      `/posts?creator_id=${encodeURIComponent(id)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}&limit=20`,
      { headers },
    );
    const posts = Array.isArray(raw?.posts) ? raw.posts.map(normalizePostItem) : [];
    return { posts, nextCursor: raw?.next_cursor ?? null, hasMore: raw?.has_more ?? posts.length === 20 };
  } catch {
    return { posts: [], nextCursor: null, hasMore: false };
  }
}

/**
 * GET /api/posts?creator_id=:id&content_type=video
 */
export async function getCreatorContentVideos(id: string): Promise<Post[]> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  try {
    const raw = await apiFetch<{ posts?: unknown[]; videos?: unknown[]; items?: unknown[] }>(
      `/posts?creator_id=${encodeURIComponent(id)}&content_type=video&limit=20`,
      { headers },
    );
    const items = Array.isArray(raw?.posts)
      ? raw.posts
      : Array.isArray(raw?.videos)
        ? raw.videos
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
    return items.map(normalizePostItem);
  } catch {
    return [];
  }
}

/**
 * GET /api/posts?creator_id=:id&content_type=short
 */
export async function getCreatorContentShorts(id: string): Promise<Post[]> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  try {
    const raw = await apiFetch<{ posts?: unknown[]; shorts?: unknown[]; items?: unknown[] }>(
      `/posts?creator_id=${encodeURIComponent(id)}&content_type=short&limit=20`,
      { headers },
    );
    const items = Array.isArray(raw?.posts)
      ? raw.posts
      : Array.isArray(raw?.shorts)
        ? raw.shorts
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
    return items.map(normalizePostItem);
  } catch {
    return [];
  }
}

/**
 * GET /api/albums?creator_id=:id
 */
export async function getCreatorContentAlbums(id: string): Promise<AlbumCardData[]> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  try {
    const raw = await apiFetch<{ albums?: unknown[] }>(
      `/albums?creator_id=${encodeURIComponent(id)}`,
      { headers },
    );
    const albums = Array.isArray(raw?.albums) ? raw.albums : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return albums.map((a: any) => _normalizeAlbumCard(a));
  } catch {
    return [];
  }
}

/**
 * GET /api/creators/:id/reviews
 */
export async function getCreatorReviews(
  id: string,
  _page = 1,
): Promise<{ reviews: CreatorReview[]; total: number; average_rating: number | null }> {
  // There is no reviews route in the current API. Do not probe the old
  // /creators/:id/reviews endpoint on every profile visit.
  return { reviews: [], total: 0, average_rating: null };
}

/**
 * GET /api/creator/statistics  (authenticated — returns stats for the current creator)
 * Response: { period_stats, active_subscribers, total_posts, total_revenue, statistics }
 */
export async function getCreatorStats(_id?: string): Promise<CreatorStats | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const raw = await apiFetch<{
      active_subscribers?: number;
      total_posts?: number;
      total_revenue?: number;
      period_stats?: Array<{ views?: number; likes?: number; new_subscribers?: number }>;
    }>('/creator/statistics', { headers: authHeader(token) });
    const periodStats = raw?.period_stats ?? [];
    const totalLikes = periodStats.reduce((sum, p) => sum + (p.likes ?? 0), 0);
    return {
      subscriber_count: raw?.active_subscribers ?? 0,
      post_count: raw?.total_posts ?? 0,
      total_likes: totalLikes,
      average_rating: null,
      review_count: 0,
    };
  } catch {
    return null;
  }
}

/**
 * @deprecated Use getCreatorById instead.
 */
export async function getCreatorByUsername(username: string): Promise<CreatorProfile | null> {
  try {
    const profile = await getCreatorById(username);
    return {
      ...profile,
      subscription_price: profile.subscriptionPrice,
      subscriber_count:   profile.subscriberCount,
      post_count:         profile.postCount,
      is_verified:        profile.isVerified,
      is_online:          false,
      display_name:       profile.name,
      avatar_url:         profile.avatarUrl,
      banner_url:         profile.bannerUrl,
      category:           null,
    } as CreatorProfile;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use getCreatorById instead.
 */
export async function getCreatorProfile(_id: string): Promise<CreatorProfile | null> {
  try {
    return await getCreatorByUsername(_id);
  } catch {
    return null;
  }
}

/**
 * @deprecated Use getCreatorContentPosts instead.
 */
export async function getCreatorPosts(
  creatorId: string,
  cursor?: string | null,
): Promise<{ posts: Post[]; next_cursor: string | null }> {
  const result = await getCreatorContentPosts(creatorId, cursor);
  return { posts: result.posts, next_cursor: result.nextCursor };
}

// ─── React Query hooks ────────────────────────────────────────────────────────

export function useCreatorProfileByUsername(username: string | undefined) {
  return useQuery({
    queryKey: ['creator-profile', username],
    queryFn: () => getCreatorById(username!),
    enabled: Boolean(username),
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });
}

/** @deprecated Use useCreatorProfileByUsername instead. */
export function useCreatorProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['creator-profile-id', id],
    queryFn: async () => null as CreatorProfile | null,
    enabled: Boolean(id),
    staleTime: 3 * 60 * 1000,
  });
}

export function useCreatorReviews(id: string | undefined, _page = 1) {
  return useQuery({
    queryKey: ['creator-reviews', id],
    queryFn: () => getCreatorReviews(id ?? ''),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useCreatorStats(id: string | undefined) {
  return useQuery({
    queryKey: ['creator-stats', id],
    queryFn: () => getCreatorStats(id),
    enabled: Boolean(id),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}