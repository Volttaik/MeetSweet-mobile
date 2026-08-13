/**
 * Posts Service — Feed, post detail, like, bookmark, report, post creation & editing.
 */
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch, authFetch } from './api';

export interface PostAuthor {
  id: string;
  name: string;
  username: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  is_creator?: boolean;
  isCreator?: boolean;
  isVerified?: boolean;
  is_verified?: boolean;
}

export interface Post {
  id: string;
  author: PostAuthor;
  title?: string;
  contentType?: string;
  tier?: string;
  content?: string;
  caption?: string;
  media_urls?: string[];
  mediaUrls?: string[];
  mediaUrl?: string;
  media_type?: 'image' | 'video' | 'album';
  mediaType?: 'image' | 'video' | 'album';
  width?: number | null;
  height?: number | null;
  durationSecs?: number | null;
  fileSize?: number | null;
  visibility?: string;
  isLocked?: boolean;
  is_locked?: boolean;
  likes_count: number;
  likeCount: number;
  comments_count: number;
  commentCount: number;
  bookmarks_count?: number;
  bookmarkCount?: number;
  is_liked: boolean;
  likedByMe: boolean;
  is_bookmarked: boolean;
  bookmarkedByMe: boolean;
  is_subscribers_only?: boolean;
  isSubscribersOnly?: boolean;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  created_at: string;
  createdAt: string;
  commentRoomId?: string | null;
  commentsEnabled?: boolean;
}

export function normalizePost(raw: any): Post {
  if (!raw) return raw;
  const author: PostAuthor = {
    id: raw.author?.id ?? raw.author_id ?? '',
    name: raw.author?.name ?? 'Anonymous',
    username: raw.author?.username ?? '',
    avatar_url: raw.author?.avatar_url ?? raw.author?.avatarUrl ?? null,
    avatarUrl: raw.author?.avatar_url ?? raw.author?.avatarUrl ?? null,
    is_creator: raw.author?.is_creator ?? raw.author?.isCreator ?? false,
    isCreator: raw.author?.is_creator ?? raw.author?.isCreator ?? false,
    is_verified: raw.author?.is_verified ?? raw.author?.isVerified ?? false,
    isVerified: raw.author?.is_verified ?? raw.author?.isVerified ?? false,
  };

  const likesCount = raw.likes_count ?? raw.likeCount ?? 0;
  const commentsCount = raw.comments_count ?? raw.commentCount ?? 0;
  const bookmarksCount = raw.bookmarks_count ?? raw.bookmarkCount ?? 0;
  const isLiked = raw.is_liked ?? raw.likedByMe ?? false;
  const isBookmarked = raw.is_bookmarked ?? raw.bookmarkedByMe ?? false;
  const createdAt = raw.created_at ?? raw.createdAt ?? new Date().toISOString();
  const thumbnailUrl = raw.thumbnail_url ?? raw.thumbnailUrl ?? null;
  const mediaUrls = raw.media_urls ?? raw.mediaUrls ?? [];
  const mediaUrl = raw.mediaUrl ?? raw.media_url ?? mediaUrls[0];
  const mediaType = raw.media_type ?? raw.mediaType ?? 'image';

  return {
    ...raw,
    id: String(raw.id),
    author,
    content: raw.content ?? raw.caption,
    caption: raw.caption ?? raw.content,
    media_urls: mediaUrls,
    mediaUrls,
    mediaUrl,
    media_type: mediaType,
    mediaType,
    width: raw.width ? Number(raw.width) : undefined,
    height: raw.height ? Number(raw.height) : undefined,
    likes_count: likesCount,
    likeCount: likesCount,
    comments_count: commentsCount,
    commentCount: commentsCount,
    bookmarks_count: bookmarksCount,
    bookmarkCount: bookmarksCount,
    is_liked: isLiked,
    likedByMe: isLiked,
    is_bookmarked: isBookmarked,
    bookmarkedByMe: isBookmarked,
    is_subscribers_only: raw.is_subscribers_only ?? raw.isSubscribersOnly ?? false,
    isSubscribersOnly: raw.is_subscribers_only ?? raw.isSubscribersOnly ?? false,
    thumbnail_url: thumbnailUrl,
    thumbnailUrl,
    created_at: createdAt,
    createdAt,
    commentRoomId: raw.commentRoomId ?? raw.comment_room_id ?? null,
    commentsEnabled: raw.comments_enabled ?? raw.commentsEnabled ?? true,
  };
}

async function getToken(): Promise<string | null> {
  return getAccessToken();
}

export async function getHomeFeed(page = 1): Promise<Post[]> {
  const token = await getToken();
  const resp = token
    ? await authFetch<any>(`/posts/feed?page=${page}`, token)
    : await apiFetch<any>(`/posts/feed?page=${page}`);
  const rawPosts = resp.posts || (Array.isArray(resp) ? resp : []);
  return rawPosts.map((p: any) => normalizePost(p));
}

export const getFeed = getHomeFeed;

export async function getPostsByCreator(creatorId: string): Promise<Post[]> {
  const token = await getToken();
  const resp = token
    ? await authFetch<any>(`/posts?creatorId=${encodeURIComponent(creatorId)}`, token)
    : await apiFetch<any>(`/posts?creatorId=${encodeURIComponent(creatorId)}`);
  const rawPosts = resp.posts || (Array.isArray(resp) ? resp : []);
  return rawPosts.map((p: any) => normalizePost(p));
}

export async function getBookmarkedPosts(): Promise<Post[]> {
  const token = await getToken();
  if (!token) return [];
  const resp = await authFetch<any>('/posts/bookmarks', token);
  const rawPosts = resp.posts || (Array.isArray(resp) ? resp : []);
  return rawPosts.map((p: any) => normalizePost(p));
}

export async function getPost(id: string): Promise<Post> {
  const token = await getToken();
  const resp = token
    ? await authFetch<any>(`/posts/${id}`, token)
    : await apiFetch<any>(`/posts/${id}`);
  return normalizePost(resp.post || resp);
}

export async function likePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/posts/${id}/like`, token, { method: 'POST' });
}

export async function unlikePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/posts/${id}/like`, token, { method: 'DELETE' });
}

export async function bookmarkPost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/posts/${id}/bookmark`, token, { method: 'POST' });
}

export async function unbookmarkPost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/posts/${id}/bookmark`, token, { method: 'DELETE' });
}

export async function reportPost(id: string, reason: string = 'general_inappropriate'): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/posts/${id}/report`, token, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function createPost(data: {
  content?: string;
  caption?: string;
  title?: string;
  content_type?: 'post' | 'video' | 'short' | 'album';
  visibility?: string;
  tier?: string;
  media_urls?: string[];
  media_ids?: string[];
  thumbnail_url?: string;
  categories?: string[];
  category_id?: string;
  tags?: string[];
  is_subscribers_only?: boolean;
  comments_enabled?: boolean;
}): Promise<Post> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const resp = await authFetch<any>('/posts', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return normalizePost(resp.post || resp);
}

export async function editPost(
  id: string,
  data: { content?: string; caption?: string; is_subscribers_only?: boolean; visibility?: string; tier?: string },
): Promise<Post> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const resp = await authFetch<any>(`/posts/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return normalizePost(resp.post || resp);
}

export async function deletePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/posts/${id}`, token, { method: 'DELETE' });
}

