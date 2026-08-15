/**
 * Content service — videos and shorts.
 *
 * Content types are first-class on the backend: posts, videos, shorts and
 * albums are distinguished by the `content_type` column on the posts table
 * (a video is NOT merely "a post whose media is a video"). The dedicated
 * /api/videos and /api/shorts endpoints exist for creation, while reads are
 * routed through /api/posts (with an explicit content_type filter) or the
 * /api/shorts/feed endpoint.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/services/api';

export type ContentKind = 'video' | 'short';

export interface ContentCreator {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface ContentComment {
  id: string;
  body: string;
  createdAt: string;
  likeCount: number;
  author: ContentCreator;
}

export interface LongFormVideo {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSecs: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  /** True when this content is gated behind a subscription tier. */
  isLocked?: boolean;
  /** Content tier — free / subscriber / subscriber_plus */
  tier?: 'free' | 'subscriber' | 'subscriber_plus';
  previewDuration: number | null;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  subscribedToCreator: boolean;
  createdAt: string;
  creator: ContentCreator;
  commentsPreview: ContentComment[];
}

export interface Short {
  id: string;
  caption: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSecs: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  /** Shorts are always free — isLocked is always false */
  isLocked: false;
  previewDuration: null;
  likedByMe: boolean;
  createdAt: string;
  creator: ContentCreator;
}

export interface ContentPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

import { getAccessToken } from '@/lib/session-storage';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function creatorFrom(raw: any): ContentCreator {
  return {
    id: raw.creator_id ?? raw.id ?? '',
    name: raw.creator_display_name ?? raw.creator_username ?? raw.full_name ?? raw.name ?? 'Creator',
    username: raw.creator_username ?? raw.username ?? '',
    avatarUrl: raw.creator_avatar ?? raw.avatar_url ?? null,
    isVerified: Boolean(raw.creator_is_verified ?? raw.is_verified ?? false),
  };
}

function numberFrom(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function videoFrom(raw: any): LongFormVideo {
  const media = Array.isArray(raw.media) ? raw.media[0] : null;
  // Title: backend may return a separate `title` field distinct from `caption`
  const title = raw.title ?? raw.caption ?? '';
  // Video URL: top-level video_url/videoUrl takes precedence; media[0].url as fallback
  const videoUrl = raw.video_url ?? raw.videoUrl ?? media?.url ?? null;
  // Thumbnail: check media object first, then top-level fields the backend may return
  const thumbnailUrl = media?.thumbnail_url ?? raw.thumbnail_url ?? raw.thumbnailUrl ?? null;
  return {
    id: raw.id,
    title,
    description: raw.caption ?? raw.description ?? '',
    videoUrl,
    thumbnailUrl,
    durationSecs: numberFrom(media?.duration_secs ?? raw.duration_secs),
    viewCount: numberFrom(raw.view_count),
    likeCount: numberFrom(raw.like_count),
    commentCount: numberFrom(raw.comment_count),
    shareCount: 0,
    isLocked: raw.is_locked ?? raw.isLocked ?? false,
    tier: raw.tier ?? (raw.visibility === 'subscribers' ? 'subscriber' : 'free'),
    previewDuration: raw.preview_duration ?? null,
    likedByMe: Boolean(raw.liked_by_me),
    bookmarkedByMe: Boolean(raw.bookmarked_by_me),
    subscribedToCreator: false,
    createdAt: raw.published_at ?? raw.created_at ?? '',
    creator: creatorFrom(raw),
    commentsPreview: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shortFrom(raw: any): Short {
  const media = Array.isArray(raw.media) ? raw.media[0] : null;
  const videoUrl = raw.video_url ?? raw.videoUrl ?? media?.url ?? null;
  const thumbnailUrl = media?.thumbnail_url ?? raw.thumbnail_url ?? raw.thumbnailUrl ?? null;
  return {
    id: raw.id,
    caption: raw.caption ?? '',
    videoUrl,
    thumbnailUrl,
    durationSecs: numberFrom(media?.duration_secs ?? raw.duration_secs),
    viewCount: numberFrom(raw.view_count),
    likeCount: numberFrom(raw.like_count),
    commentCount: numberFrom(raw.comment_count),
    shareCount: 0,
    isLocked: false,         // shorts are always free
    previewDuration: null,   // no preview gates for shorts
    likedByMe: Boolean(raw.liked_by_me),
    createdAt: raw.published_at ?? raw.created_at ?? '',
    creator: creatorFrom(raw),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isVideoPost(raw: any): boolean {
  const media = Array.isArray(raw.media) ? raw.media : [];
  return media.some((m: { type: string }) => m.type === 'video');
}

// ─── Feed functions ───────────────────────────────────────────────────────────

/**
 * Fetch a page of video posts from the backend.
 * Videos = published posts that have at least one video media item.
 */
export async function getVideoFeed(cursor?: string | null): Promise<ContentPage<LongFormVideo>> {
  // Ask the backend for long-form videos only — shorts never enter this feed.
  const qs = cursor
    ? `?content_type=video&cursor=${encodeURIComponent(cursor)}&limit=20`
    : '?content_type=video&limit=20';
  const raw = await apiFetch<{ posts: unknown[]; nextCursor?: string | null; next_cursor?: string | null }>(
    `/posts${qs}`,
    { headers: await authHeaders() },
  );
  const posts = Array.isArray(raw?.posts) ? raw.posts : [];
  // Exclude shorts (content_type === 'short') from the long-form video feed as
  // a client-side guard; the backend filter above is the primary control.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoPosts = posts.filter((p: any) => isVideoPost(p) && p.content_type !== 'short');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextCursor = raw?.next_cursor ?? raw?.nextCursor ?? (posts.length >= 20 ? (posts[posts.length - 1] as any)?.created_at ?? null : null);
  return {
    items: videoPosts.map(videoFrom),
    nextCursor,
    hasMore: Boolean(nextCursor) || posts.length >= 20,
  };
}

/**
 * Fetch a single post and return it as a LongFormVideo.
 * Backend: GET /api/posts/:id
 */
export async function getVideo(id: string): Promise<LongFormVideo> {
  const raw = await apiFetch<unknown>(`/posts/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
  });
  return videoFrom(raw);
}

/**
 * Fetch recommendations for a video — posts from the same creator.
 * Backend: GET /api/posts?creator_id=:id&limit=10
 */
export async function getVideoRecommendations(videoId?: string): Promise<LongFormVideo[]> {
  if (!videoId) {
    // Fetch general feed and return video posts
    const page = await getVideoFeed();
    return page.items.slice(0, 5);
  }

  // First get the video to find creator_id
  try {
    const raw = await apiFetch<{ creator_id?: string; media?: unknown[] }>(
      `/posts/${encodeURIComponent(videoId)}`,
      { headers: await authHeaders() },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creatorId = (raw as any)?.creator_id;
    if (creatorId) {
      const relatedRaw = await apiFetch<{ posts: unknown[] }>(
        `/posts?creator_id=${encodeURIComponent(creatorId)}&limit=10`,
        { headers: await authHeaders() },
      );
      const posts = Array.isArray(relatedRaw?.posts) ? relatedRaw.posts : [];
      return posts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => p.id !== videoId && isVideoPost(p) && p.content_type !== 'short')
        .map(videoFrom)
        .slice(0, 5);
    }
  } catch {
    // Fall through to generic feed
  }

  const page = await getVideoFeed();
  return page.items.filter((v) => v.id !== videoId).slice(0, 5);
}

/**
 * Fetch a page of shorts (short-form video posts).
 * Backend: GET /api/posts — same endpoint as videos (no server-side distinction).
 */
export async function getShortsFeed(cursor?: string | null): Promise<ContentPage<Short>> {
  // Send content_type=short to the backend so it can filter server-side; the client
  // filter below still guards against any non-short items slipping through.
  const base = cursor
    ? `?content_type=short&cursor=${encodeURIComponent(cursor)}&limit=20`
    : '?content_type=short&limit=20';
  const raw = await apiFetch<{ posts: unknown[]; next_cursor?: string | null }>(
    `/posts${base}`,
    { headers: await authHeaders() },
  );
  const posts = Array.isArray(raw?.posts) ? raw.posts : [];
  // Only include posts where the backend explicitly tagged content_type === 'short'.
  // isVideoPost() alone would pull in long-form video posts as well.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shortPosts = posts.filter((p: any) => p.content_type === 'short' && isVideoPost(p));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextCursor = raw?.next_cursor ?? (posts.length >= 20 ? (posts[posts.length - 1] as any)?.created_at ?? null : null);
  return {
    items: shortPosts.map(shortFrom),
    nextCursor,
    hasMore: Boolean(nextCursor) || posts.length >= 20,
  };
}

/**
 * Fetch a single post as a Short.
 * Backend: GET /api/posts/:id
 */
export async function getShort(id: string): Promise<Short> {
  const raw = await apiFetch<unknown>(`/posts/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
  });
  return shortFrom(raw);
}

// ─── Interactions ─────────────────────────────────────────────────────────────

/**
 * Like or unlike a piece of content.
 * Backend: POST/DELETE /api/posts/:id/like
 *
 * @param _kind  - 'video' or 'short' (both route to the same posts endpoint)
 * @param id     - post ID
 * @param liked  - current like state (true = currently liked → sends DELETE to unlike)
 */
export async function likeContent(
  _kind: ContentKind,
  id: string,
  liked: boolean,
): Promise<{ liked: boolean; likeCount: number }> {
  const headers = await authHeaders();
  const raw = await apiFetch<{ liked?: boolean; like_count?: number }>(
    `/posts/${encodeURIComponent(id)}/like`,
    { method: liked ? 'DELETE' : 'POST', headers },
  );
  return {
    liked: raw?.liked ?? !liked,
    likeCount: numberFrom(raw?.like_count),
  };
}

/**
 * Track a short view.
 * Backend: POST /api/posts/:id/view
 */
export async function trackShortView(id: string, _watchDurationSecs: number): Promise<void> {
  const headers = await authHeaders();
  try {
    await apiFetch<unknown>(`/posts/${encodeURIComponent(id)}/view`, {
      method: 'POST',
      headers,
    });
  } catch {
    // View tracking is best-effort; never throw
  }
}

// ─── Comments (routed through posts API) ─────────────────────────────────────

export async function getContentComments(_kind: ContentKind, id: string): Promise<ContentComment[]> {
  const raw = await apiFetch<{ comments?: unknown[] }>(
    `/posts/${encodeURIComponent(id)}/comments`,
    { headers: await authHeaders() },
  );
  const list = Array.isArray(raw?.comments) ? raw.comments : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return list.map((item: any, index: number) => ({
    id: item.id ?? `comment-${index}`,
    body: item.body ?? '',
    createdAt: item.created_at ?? '',
    likeCount: numberFrom(item.like_count),
    author: {
      id: item.author_id ?? item.author?.id ?? '',
      name: item.author_display_name ?? item.author?.name ?? item.author_username ?? '',
      username: item.author_username ?? item.author?.username ?? '',
      avatarUrl: item.author_avatar ?? item.author?.avatar_url ?? null,
      isVerified: false,
    },
  }));
}

export async function addContentComment(
  _kind: ContentKind,
  id: string,
  body: string,
): Promise<ContentComment> {
  const headers = await authHeaders();
  const raw = await apiFetch<{ comment?: { id: string }; id?: string }>(
    `/posts/${encodeURIComponent(id)}/comments`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ body }),
    },
  );
  const commentId = raw?.comment?.id ?? raw?.id ?? '';
  return {
    id: commentId,
    body,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    author: { id: '', name: '', username: '', avatarUrl: null, isVerified: false },
  };
}

// ─── React Query hooks ────────────────────────────────────────────────────────

export function useVideoFeed() {
  return useInfiniteQuery({
    queryKey: ['videos', 'feed'],
    queryFn: ({ pageParam }) => getVideoFeed(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 60_000,
  });
}

export function useVideo(id: string) {
  return useQuery({
    queryKey: ['video', id],
    queryFn: () => getVideo(id),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useShortsFeed() {
  return useInfiniteQuery({
    queryKey: ['shorts', 'feed'],
    queryFn: ({ pageParam }) => getShortsFeed(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 30_000,
  });
}

export function useShort(id: string) {
  return useQuery({
    queryKey: ['short', id],
    queryFn: () => getShort(id),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
