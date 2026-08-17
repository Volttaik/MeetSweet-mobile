/**
 * Creators Service — Public profile data and creator lists.
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch, authFetch } from './api';
import { getAccessToken } from '@/lib/session-storage';
import { normalizeUser, User } from './users';
import { normalizeAlbum, AlbumCardData } from './albums';
import { Post, normalizePost } from './posts';

export interface CreatorReview {
  id: string;
  reviewer_username: string;
  reviewer_display_name?: string | null;
  rating: number;
  body?: string | null;
  created_at: string;
}

export interface CreatorProfileFull {
  userId: string;
  name: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: number;
  postCount: number;
  videoCount?: number;
  shortCount?: number;
  albumCount?: number;
  isVerified: boolean;
  subscribedToCreator: boolean;
  /** The viewer's active subscription tier (null when not subscribed). */
  subscriptionTier?: 'subscriber' | 'subscriber_plus' | null;
  /** The viewer's active subscription id for this creator (null when not
   *  subscribed) — used to offer Unsubscribe from the profile. */
  subscriptionId?: string | null;
  whoCanMessage: 'everyone' | 'subscribers' | 'none';
  subscriptionPrice: number;
  subscriptionPlusPrice: number;
  category: string | null;
  isOnline: boolean;
  /** Creator-profile access model: when true, the viewer (not subscribed, not
   *  the owner) must NOT see any of this creator's content on the profile.
   *  Authoritative from the server — never derived from local state. */
  contentLocked: boolean;
}

/**
 * Authenticated-aware fetch for creator endpoints. The server keys
 * `subscribed_to_creator` / `subscription_tier` / `is_locked` off the
 * Authorization header, so an unauthenticated profile/content request would
 * always report "not subscribed" and lock every subscriber-gated item even for
 * a logged-in subscriber. Include the token whenever a session exists.
 */
async function creatorFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  return token ? authFetch<T>(path, token) : apiFetch<T>(path);
}

export async function getCreatorProfile(username: string): Promise<{
  creator: User;
  posts: Post[];
  albums: AlbumCardData[];
}> {
  const resp = await creatorFetch<any>(`/creators/${encodeURIComponent(username)}`).catch(() => ({}));
  const creator = normalizeUser(resp.creator || resp.user || { username });
  const posts = resp.posts || [];
  const rawAlbums = resp.albums || [];
  const albums = rawAlbums.map((a: any) => normalizeAlbum(a));
  return { creator, posts, albums };
}

export async function getCreators(): Promise<User[]> {
  const resp = await apiFetch<any>('/creators').catch(() => []);
  const list = resp.creators || (Array.isArray(resp) ? resp : []);
  return list.map((c: any) => normalizeUser(c));
}

export async function getCreatorById(usernameOrId: string): Promise<CreatorProfileFull> {
  // Do NOT swallow failures with `{}` — a failed/404 lookup would otherwise
  // produce a fake "Creator" profile (name placeholder, 0 price, 0 subscribers)
  // and mask the real error. Throw so the screen can show a proper error state.
  const resp = await creatorFetch<any>(`/creators/${encodeURIComponent(usernameOrId)}`);
  const rawUser = resp?.creator || resp?.user || resp;
  if (!rawUser || typeof rawUser !== 'object' || (!rawUser.id && !rawUser.username)) {
    throw new Error('Creator not found');
  }
  const user = normalizeUser(rawUser);
  return {
    userId: rawUser.id || user.id || usernameOrId,
    // Never fall back to the route param (an internal id) for user-facing
    // fields — a missing name/username must render a neutral label, not an ID.
    name: user.name || rawUser.name || rawUser.display_name || rawUser.username || 'Creator',
    username: user.username || rawUser.username || '',
    bio: user.bio || rawUser.bio || null,
    avatarUrl: user.avatarUrl || rawUser.avatar_url || null,
    bannerUrl: user.bannerUrl || rawUser.banner_url || null,
    subscriberCount: Number(rawUser.subscriber_count ?? rawUser.subscriberCount ?? user.subscriberCount ?? 0),
    postCount: Number(rawUser.post_count ?? rawUser.postCount ?? user.postCount ?? 0),
    videoCount: Number(rawUser.video_count ?? rawUser.videoCount ?? 0),
    shortCount: Number(rawUser.short_count ?? rawUser.shortCount ?? 0),
    albumCount: Number(rawUser.album_count ?? rawUser.albumCount ?? 0),
    isVerified: Boolean(rawUser.is_verified ?? rawUser.isVerified ?? user.isVerified ?? false),
    subscribedToCreator: Boolean(
      rawUser.subscribed_to_creator ?? rawUser.subscribedToCreator ?? rawUser.is_subscribed ?? false,
    ),
    subscriptionTier:
      (rawUser.subscription_tier ?? rawUser.subscriptionTier ?? null) as
        | 'subscriber'
        | 'subscriber_plus'
        | null,
    subscriptionId: rawUser.subscription_id ?? rawUser.subscriptionId ?? null,
    whoCanMessage: (rawUser.who_can_message as 'everyone' | 'subscribers' | 'none') ?? 'everyone',
    subscriptionPrice: Number(rawUser.subscription_price ?? rawUser.subscriptionPrice ?? 0),
    subscriptionPlusPrice: Number(rawUser.subscription_plus_price ?? rawUser.subscriptionPlusPrice ?? 0),
    category: rawUser.category ? String(rawUser.category) : null,
    isOnline: Boolean(rawUser.is_online ?? rawUser.isOnline ?? false),
    contentLocked: Boolean(rawUser.content_locked ?? rawUser.contentLocked ?? false),
  };
}

// The creator-profile content endpoints are subscriber-gated server-side: an
// unsubscribed viewer receives { locked: true } with an empty list. Return an
// empty list in that case (the screen renders its own lock gate), never a
// partial/leaked payload.
async function unlockedList(resp: any, key: 'posts' | 'videos' | 'shorts'): Promise<Post[]> {
  if (!resp || resp.locked) return [];
  const list = Array.isArray(resp) ? resp : resp[key] || [];
  return list.map(normalizePost);
}

export async function getCreatorContentPosts(creatorId: string): Promise<{ posts: Post[] }> {
  const resp = await creatorFetch<any>(`/creators/${encodeURIComponent(creatorId)}/posts`).catch(() => ({}));
  return { posts: await unlockedList(resp, 'posts') };
}

export async function getCreatorContentVideos(creatorId: string): Promise<Post[]> {
  const resp = await creatorFetch<any>(`/creators/${encodeURIComponent(creatorId)}/videos`).catch(() => ({}));
  return unlockedList(resp, 'videos');
}

export async function getCreatorContentShorts(creatorId: string): Promise<Post[]> {
  const resp = await creatorFetch<any>(`/creators/${encodeURIComponent(creatorId)}/shorts`).catch(() => ({}));
  return unlockedList(resp, 'shorts');
}

export async function getCreatorContentAlbums(creatorId: string): Promise<AlbumCardData[]> {
  const resp = await creatorFetch<any>(`/albums?creator_id=${encodeURIComponent(creatorId)}`).catch(() => []);
  const list = Array.isArray(resp) ? resp : resp.albums || [];
  return list.map(normalizeAlbum);
}

export async function getCreatorReviews(creatorId: string): Promise<{
  reviews: CreatorReview[];
  total: number;
  average_rating: number | null;
}> {
  const resp = await apiFetch<{
    reviews?: Array<{
      id: string;
      reviewer_username: string;
      reviewer_display_name?: string | null;
      rating: number;
      body?: string | null;
      created_at: string;
    }>;
    total?: number;
    average_rating?: number | null;
  }>(`/creators/${encodeURIComponent(creatorId)}/reviews`);

  return {
    reviews: (resp?.reviews ?? []).map((r) => ({
      id: r.id,
      reviewer_username: r.reviewer_username,
      reviewer_display_name: r.reviewer_display_name ?? null,
      rating: r.rating,
      body: r.body ?? null,
      created_at: r.created_at,
    })),
    total: resp?.total ?? 0,
    average_rating: resp?.average_rating ?? null,
  };
}

export function useCreatorReviews(creatorId: string) {
  return useQuery({
    queryKey: ['creator-reviews', creatorId],
    queryFn: () => getCreatorReviews(creatorId),
    enabled: Boolean(creatorId),
    staleTime: 60_000,
    retry: 2,
  });
}
