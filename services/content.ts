/**
 * Content service — videos and shorts.
 *
 * The backend has a single content type: posts.
 * "Videos" are posts whose first media item has type === 'video'.
 * "Shorts" are also video posts (vertical / short-form is a UI concept only).
 *
 * All read/write operations are routed through the /api/posts endpoints.
 * There are no /api/videos or /api/shorts endpoints on this backend.
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
  isPremium: boolean;
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
  isPremium: boolean;
  previewDuration: number | null;
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

async function authHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem('@ms_access_token');
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
  return {
    id: raw.id,
    title: raw.caption ?? '',
    description: raw.caption ?? '',
    videoUrl: media?.url ?? null,
    thumbnailUrl: media?.thumbnail_url ?? null,
    durationSecs: numberFrom(media?.duration_secs),
    viewCount: numberFrom(raw.view_count),
    likeCount: numberFrom(raw.like_count),
    commentCount: numberFrom(raw.comment_count),
    shareCount: numberFrom(raw.share_count),
    isPremium: raw.visibility === 'subscribers',
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
  return {
    id: raw.id,
    caption: raw.caption ?? '',
    videoUrl: media?.url ?? null,
    thumbnailUrl: media?.thumbnail_url ?? null,
    durationSecs: numberFrom(media?.duration_secs),
    viewCount: numberFrom(raw.view_count),
    likeCount: numberFrom(raw.like_count),
    commentCount: numberFrom(raw.comment_count),
    shareCount: numberFrom(raw.share_count),
    isPremium: raw.visibility === 'subscribers',
    previewDuration: raw.preview_duration ?? null,
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
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : '?limit=20';
  const raw = await apiFetch<{ posts: unknown[]; nextCursor?: string | null; next_cursor?: string | null }>(
    `/posts${qs}`,
    { headers: await authHeaders() },
  );
  const posts = Array.isArray(raw?.posts) ? raw.posts : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoPosts = posts.filter((p: any) => isVideoPost(p));
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
        .filter((p: any) => p.id !== videoId && isVideoPost(p))
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
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : '?limit=20';
  const raw = await apiFetch<{ posts: unknown[]; next_cursor?: string | null }>(
    `/posts${qs}`,
    { headers: await authHeaders() },
  );
  const posts = Array.isArray(raw?.posts) ? raw.posts : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoPosts = posts.filter((p: any) => isVideoPost(p));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextCursor = raw?.next_cursor ?? (posts.length >= 20 ? (posts[posts.length - 1] as any)?.created_at ?? null : null);
  return {
    items: videoPosts.map(shortFrom),
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
