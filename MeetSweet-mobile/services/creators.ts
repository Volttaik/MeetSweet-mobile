/**
 * Creators Service — Public profile data and creator lists.
 */
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
    userId: user.id || usernameOrId,
    name: user.name || 'Creator',
    username: user.username || usernameOrId,
    bio: user.bio || null,
    avatarUrl: user.avatarUrl || null,
    bannerUrl: user.bannerUrl || null,
    subscriberCount: user.subscriberCount || 0,
    postCount: user.postCount || (resp.posts ? resp.posts.length : 0),
    videoCount: resp.video_count || 0,
    shortCount: resp.short_count || 0,
    albumCount: resp.album_count || (resp.albums ? resp.albums.length : 0),
    isVerified: user.isVerified || false,
    subscribedToCreator: Boolean(resp.subscribed || resp.subscribed_to_creator || false),
    whoCanMessage: resp.who_can_message || 'everyone',
    subscriptionPrice: Number(resp.subscription_price || 200),
    subscriptionPlusPrice: Number(resp.subscription_plus_price || 500),
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

export function useCreatorReviews(_creatorId: string) {
  return {
    isLoading: false,
    data: {
      reviews: [] as CreatorReview[],
      total: 0,
      average_rating: null as number | null,
    },
  };
}
