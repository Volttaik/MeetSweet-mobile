/**
 * Creators Service — Public profile data and creator lists.
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
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
  whoCanMessage: 'everyone' | 'subscribers' | 'none';
  subscriptionPrice: number;
  subscriptionPlusPrice: number;
}

export async function getCreatorProfile(username: string): Promise<{
  creator: User;
  posts: Post[];
  albums: AlbumCardData[];
}> {
  const resp = await apiFetch<any>(`/creators/${encodeURIComponent(username)}`).catch(() => ({}));
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
  const resp = await apiFetch<any>(`/creators/${encodeURIComponent(usernameOrId)}`).catch(() => ({}));
  const rawUser = resp.creator || resp.user || resp;
  const user = normalizeUser(rawUser);
  return {
    userId: rawUser.id || user.id || usernameOrId,
    name: user.name || rawUser.name || rawUser.username || usernameOrId,
    username: user.username || rawUser.username || usernameOrId,
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
    whoCanMessage: (rawUser.who_can_message as 'everyone' | 'subscribers' | 'none') ?? 'everyone',
    subscriptionPrice: Number(rawUser.subscription_price ?? rawUser.subscriptionPrice ?? 0),
    subscriptionPlusPrice: Number(rawUser.subscription_plus_price ?? rawUser.subscriptionPlusPrice ?? 0),
  };
}

export async function getCreatorContentPosts(creatorId: string): Promise<{ posts: Post[] }> {
  const resp = await apiFetch<any>(`/creators/${encodeURIComponent(creatorId)}/posts`).catch(() => []);
  const list = Array.isArray(resp) ? resp : resp.posts || [];
  return { posts: list.map(normalizePost) };
}

export async function getCreatorContentVideos(creatorId: string): Promise<Post[]> {
  const resp = await apiFetch<any>(`/creators/${encodeURIComponent(creatorId)}/videos`).catch(() => []);
  const list = Array.isArray(resp) ? resp : resp.videos || [];
  return list.map(normalizePost);
}

export async function getCreatorContentShorts(creatorId: string): Promise<Post[]> {
  const resp = await apiFetch<any>(`/creators/${encodeURIComponent(creatorId)}/shorts`).catch(() => []);
  const list = Array.isArray(resp) ? resp : resp.shorts || [];
  return list.map(normalizePost);
}

export async function getCreatorContentAlbums(creatorId: string): Promise<AlbumCardData[]> {
  const resp = await apiFetch<any>(`/albums?creator_id=${encodeURIComponent(creatorId)}`).catch(() => []);
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
