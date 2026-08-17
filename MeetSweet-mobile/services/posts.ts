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

  // ── Media array (backend shape) ───────────────────────────────────────────
  // The backend returns media as an array of { url, type, thumbnail_url, ... }.
  // Derive the flat media fields the UI consumes from that array, while still
  // honouring any explicit top-level fields a caller may provide.
  const mediaList: Array<Record<string, unknown>> = Array.isArray(raw.media) ? raw.media : [];
  const firstMedia = mediaList[0] ?? null;
  const mediaUrls =
    raw.media_urls ??
    raw.mediaUrls ??
    (mediaList.length > 0 ? mediaList.map((m) => m?.url).filter(Boolean) : []);
  const mediaUrl = raw.mediaUrl ?? raw.media_url ?? mediaUrls[0] ?? undefined;

  // ── Content type — ALWAYS from metadata, never guessed from URL shape ─────
  const contentType = raw.contentType ?? raw.content_type ?? null;
  const mediaType =
    raw.mediaType ??
    raw.media_type ??
    (contentType === 'video' || contentType === 'short'
      ? 'video'
      : firstMedia?.type === 'video'
        ? 'video'
        : mediaList.length > 0
          ? 'image'
          : mediaUrl
            ? 'image'
            : undefined);

  // ── Author — backend returns flat creator_* fields (not an author object) ──
  const author: PostAuthor = {
    id: raw.author?.id ?? raw.author_id ?? raw.creator_id ?? '',
    name:
      raw.author?.name ??
      raw.creator_display_name ??
      raw.creator_username ??
      raw.full_name ??
      raw.author?.username ??
      'Anonymous',
    username: raw.author?.username ?? raw.creator_username ?? raw.username ?? '',
    avatar_url: raw.author?.avatar_url ?? raw.author?.avatarUrl ?? raw.creator_avatar ?? null,
    avatarUrl: raw.author?.avatar_url ?? raw.author?.avatarUrl ?? raw.creator_avatar ?? null,
    is_creator: raw.author?.is_creator ?? raw.author?.isCreator ?? raw.creator_is_creator ?? false,
    isCreator: raw.author?.is_creator ?? raw.author?.isCreator ?? raw.creator_is_creator ?? false,
    is_verified:
      raw.author?.is_verified ??
      raw.author?.isVerified ??
      raw.creator_is_verified ??
      false,
    isVerified:
      raw.author?.is_verified ??
      raw.author?.isVerified ??
      raw.creator_is_verified ??
      false,
  };

  const likesCount = raw.likes_count ?? raw.likeCount ?? 0;
  const commentsCount = raw.comments_count ?? raw.commentCount ?? 0;
  const bookmarksCount = raw.bookmarks_count ?? raw.bookmarkCount ?? 0;
  const isLiked = raw.is_liked ?? raw.likedByMe ?? false;
  const isBookmarked = raw.is_bookmarked ?? raw.bookmarkedByMe ?? false;
  const createdAt = raw.created_at ?? raw.createdAt ?? new Date().toISOString();
  const thumbnailUrl =
    raw.thumbnail_url ??
    raw.thumbnailUrl ??
    (firstMedia?.thumbnail_url as string | null | undefined) ??
    null;

  return {
    ...raw,
    id: String(raw.id),
    author,
    content: raw.content ?? raw.caption,
    caption: raw.caption ?? raw.content,
    contentType,
    content_type: contentType,
    media_urls: mediaUrls,
    mediaUrls,
    mediaUrl,
    media_url: mediaUrl,
    media_type: mediaType,
    mediaType,
    width: raw.width ?? firstMedia?.width ?? undefined,
    height: raw.height ?? firstMedia?.height ?? undefined,
    durationSecs: raw.durationSecs ?? raw.duration_secs ?? firstMedia?.duration_secs ?? null,
    fileSize: raw.fileSize ?? raw.file_size ?? firstMedia?.file_size ?? null,
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

export interface HomeFeedResult {
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
  page: number;
}

/**
 * Fetch the authenticated Home feed (subscription-aware, includes the user's
 * own published content). Returns the full envelope so the screen can drive
 * cursor-based pagination and pull-to-refresh without losing metadata.
 */
export async function getHomeFeed(
  page = 1,
  cursor?: string | null,
): Promise<HomeFeedResult> {
  const token = await getToken();
  const params = new URLSearchParams({ page: String(page) });
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  const resp = token
    ? await authFetch<any>(`/posts/feed?${qs}`, token)
    : await apiFetch<any>(`/posts/feed?${qs}`);
  const rawPosts = resp?.posts || (Array.isArray(resp) ? resp : []);
  const nextCursor = resp?.next_cursor ?? resp?.nextCursor ?? null;
  return {
    posts: rawPosts.map((p: any) => normalizePost(p)),
    nextCursor,
    hasMore: Boolean(nextCursor) || rawPosts.length >= 20,
    page,
  };
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

/**
 * Hide a post (Not Interested) — persists server-side; the post is excluded
 * from every feed for this account.
 * Backend: POST /api/posts/:id/hide
 */
export async function hidePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/posts/${encodeURIComponent(id)}/hide`, token, { method: 'POST' });
}

/**
 * Hide a creator (Hide Creator) — persists server-side via a mute record;
 * all of the creator's content is excluded from feeds for this account.
 * Backend: POST /api/users/:username/mute
 */
export async function hideCreator(username: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/users/${encodeURIComponent(username.replace('@', ''))}/mute`, token, { method: 'POST' });
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

