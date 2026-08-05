import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PostAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  isVerified: boolean;
  isCreator: boolean;
}

export interface Post {
  id: string;
  caption: string;
  visibility: 'public' | 'subscribers' | 'draft';
  /**
   * Content tier — free / subscriber / subscriber_plus.
   * Derived from visibility when the backend doesn't store it explicitly.
   */
  tier?: import('@/constants/tiers').ContentTier;
  /** Backend content_type field — 'post' | 'video' | 'short' | 'album' | null */
  contentType: 'post' | 'video' | 'short' | 'album' | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  thumbnailUrl: string | null;
  durationSecs: number | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  likeCount: number;
  commentCount: number;
  bookmarkCount: number;
  /**
   * True when visibility === 'subscribers'. Used to show a subtle
   * "Subscribers only" indicator — NOT a paywall or per-post purchase gate.
   */
  isPremium: boolean;
  createdAt: string;
  publishedAt?: string;
  author: PostAuthor;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  updatedAt?: string;
  /** Title field — used by videos */
  title?: string;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  likeCount: number;
  replyCount: number;
  parentId: string | null;
  likedByMe: boolean;
  author: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
  };
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePost(raw: any): Post {
  const media = Array.isArray(raw.media) ? raw.media : [];
  const firstMedia = media[0] ?? null;
  // Map backend content_type to our enum; fall back based on media type
  const rawContentType = raw.content_type ?? raw.contentType ?? null;
  // Video-media inference MUST come before the 'post' fallback: the backend may tag
  // video-attachment posts as content_type:'post'. Honouring 'post' first would put
  // them in the Posts feed tab instead of Videos, and make the card try to load a
  // video URL as an image (spinner forever, no play button).
  const contentType: Post['contentType'] =
    rawContentType === 'short' ? 'short'
    : rawContentType === 'video' ? 'video'
    : rawContentType === 'album' ? 'album'
    : firstMedia?.type === 'video' ? 'video'   // video media wins over 'post' label
    : rawContentType === 'post'  ? 'post'
    : null;

  // VideoObject/ShortObject have a nested `creator` field;
  // PostObject uses flat creator_* fields.
  const creatorObj = raw.creator as any ?? null;
  const creatorId =       creatorObj?.id       ?? raw.creator_id ?? '';
  const creatorName =     creatorObj?.name      ?? raw.creator_display_name ?? raw.creator_username ?? 'Unknown';
  const creatorUsername = creatorObj?.username  ?? raw.creator_username ?? '';
  const creatorAvatar =   creatorObj?.avatarUrl ?? creatorObj?.avatar_url ?? raw.creator_avatar ?? null;
  const creatorVerified = creatorObj?.isVerified ?? creatorObj?.is_verified ?? raw.creator_is_verified ?? false;

  // Media URL: VideoObject exposes video_url/videoUrl at top level in addition to media[]
  const mediaUrl =      firstMedia?.url          ?? raw.video_url   ?? raw.videoUrl   ?? null;
  const mediaType =     firstMedia?.type         ?? (mediaUrl ? 'video' : null);
  const thumbnailUrl =  firstMedia?.thumbnail_url ?? raw.thumbnail_url ?? raw.thumbnailUrl ?? null;
  const durationSecs =  firstMedia?.duration_secs ?? raw.duration_secs ?? raw.durationSecs ?? null;

  return {
    id: raw.id,
    caption: raw.caption ?? '',
    visibility: raw.visibility ?? 'public',
    contentType,
    mediaUrl,
    mediaType,
    thumbnailUrl,
    durationSecs,
    fileSize: firstMedia?.file_size ?? null,
    width:    firstMedia?.width     ?? null,
    height:   firstMedia?.height    ?? null,
    likeCount:     raw.like_count    ?? raw.likeCount    ?? 0,
    commentCount:  raw.comment_count ?? raw.commentCount ?? 0,
    bookmarkCount: raw.save_count    ?? raw.saveCount    ?? 0,
    // Shorts are always free per product rules — no subscriber gate
    isPremium: contentType !== 'short' && (raw.visibility === 'subscribers' || raw.visibility === 'subscribers_plus'),
    // Derive tier from backend value — maps to free / subscriber / subscriber_plus only
    tier: (() => {
      const t = raw.tier;
      if (!t) return raw.visibility === 'public' ? 'free' : 'subscriber';
      if (t === 'subscriber_plus') return 'subscriber_plus';
      if (t === 'free') return 'free';
      return 'subscriber';
    })(),
    createdAt:   raw.created_at   ?? raw.createdAt   ?? raw.published_at ?? new Date().toISOString(),
    publishedAt: raw.published_at ?? raw.publishedAt ?? raw.created_at,
    updatedAt:   raw.updated_at   ?? raw.updatedAt,
    title: raw.title ?? null,
    author: {
      id:         creatorId,
      name:       creatorName,
      username:   creatorUsername,
      avatarUrl:  creatorAvatar,
      isVerified: creatorVerified,
      isCreator:  true,
    },
    likedByMe:     raw.liked_by_me    ?? raw.likedByMe    ?? false,
    bookmarkedByMe: raw.bookmarked_by_me ?? raw.bookmarkedByMe ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeComment(raw: any): Comment {
  return {
    id: raw.id,
    body: raw.body ?? '',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    likeCount: raw.like_count ?? 0,
    replyCount: raw.reply_count ?? 0,
    parentId: raw.parent_id ?? null,
    likedByMe: raw.liked_by_me ?? false,
    author: {
      id: raw.author_id ?? raw.author?.id ?? '',
      name: raw.author_display_name ?? raw.author?.name ?? raw.author_username ?? '',
      username: raw.author_username ?? raw.author?.username ?? '',
      avatarUrl: raw.author_avatar ?? raw.author?.avatar_url ?? null,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ─── Feed & Posts ─────────────────────────────────────────────────────────────

export async function getFeed(cursor?: string): Promise<{ posts: Post[]; hasMore: boolean; nextCursor: string | null }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : '?limit=20';
  const raw = await apiFetch<{ posts: unknown[]; next_cursor?: string | null }>(
    `/posts${qs}`,
    { headers },
  );
  const posts = Array.isArray(raw?.posts) ? raw.posts.map(normalizePost) : [];
  const nextCursor = raw?.next_cursor ?? (posts.length === 20 ? posts[posts.length - 1]?.createdAt ?? null : null);
  return { posts, hasMore: posts.length === 20, nextCursor };
}

/**
 * Home feed — assembled from subscribed creators' content.
 *
 * Per the spec, the backend has no single home-feed endpoint.
 * We assemble it by:
 *  1. Fetching the user's subscriptions
 *  2. For each subscribed creator, fetching their posts from GET /api/creators/:id/posts
 *  3. Merging and sorting by published_at descending
 *
 * Returns empty array when the user has no subscriptions.
 */
export async function getHomeFeed(): Promise<{ posts: Post[]; hasMore: boolean; nextCursor: string | null }> {
  const token = await getToken();
  if (!token) return { posts: [], hasMore: false, nextCursor: null };

  // 0. Resolve the current user's own ID so we can include their own posts
  let selfId: string | null = null;
  try {
    const meRaw = await apiFetch<Record<string, unknown>>('/users/me', { headers: authHeader(token) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meData = (meRaw as any)?.user ?? meRaw;
    selfId = String(meData?.id ?? '').trim() || null;
  } catch {
    // Non-fatal — just skip own posts if we can't determine self
  }

  // 1. Fetch subscriptions
  let creatorIds: string[] = [];
  try {
    const subRaw = await apiFetch<{ subscriptions: Array<{ creator_id?: string; creatorId?: string }> }>(
      '/subscriptions?type=subscribed',
      { headers: authHeader(token) },
    );
    creatorIds = (subRaw?.subscriptions ?? [])
      .map((s) => s.creator_id ?? s.creatorId ?? '')
      .filter(Boolean);
  } catch {
    // Network failure — still show own posts if possible
  }

  // Always include the user's own creator ID so their own posts appear in Home
  if (selfId && !creatorIds.includes(selfId)) {
    creatorIds = [selfId, ...creatorIds];
  }

  if (creatorIds.length === 0) {
    return { posts: [], hasMore: false, nextCursor: null };
  }

  // 2. Fetch all posts for each subscribed creator using the working /posts?creator_id=:id endpoint.
  //    Shorts are intentionally excluded — they live only in the Shorts tab, never the home feed.
  //    NOTE: /creators/:id/posts does not exist on this backend; /posts?creator_id=:id is the correct endpoint.
  const allPosts: Post[] = [];
  await Promise.allSettled(
    creatorIds.slice(0, 10).map((creatorId) =>
      apiFetch<{ posts: unknown[]; next_cursor?: string | null }>(
        `/posts?creator_id=${encodeURIComponent(creatorId)}&limit=20`,
        { headers: authHeader(token) },
      ).then((raw) => {
        const posts = Array.isArray(raw?.posts) ? raw.posts.map(normalizePost) : [];
        // Filter out shorts — they live exclusively in the Shorts tab
        allPosts.push(...posts.filter((p) => p.contentType !== 'short'));
      }).catch(() => {}),
    ),
  );

  // 3. Sort descending by publishedAt / createdAt, deduplicate
  allPosts.sort((a, b) => {
    const ta = new Date(a.publishedAt ?? a.createdAt).getTime();
    const tb = new Date(b.publishedAt ?? b.createdAt).getTime();
    return tb - ta;
  });

  const seen = new Set<string>();
  const unique = allPosts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  return { posts: unique.slice(0, 60), hasMore: false, nextCursor: null };
}

/**
 * Fetch posts by a specific creator.
 * Backend: GET /api/posts?creator_id=:id
 */
export async function getPostsByCreator(
  creatorId: string,
  cursor?: string,
): Promise<{ posts: Post[]; hasMore: boolean; nextCursor: string | null }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const qs = cursor
    ? `?creator_id=${encodeURIComponent(creatorId)}&cursor=${encodeURIComponent(cursor)}&limit=20`
    : `?creator_id=${encodeURIComponent(creatorId)}&limit=20`;

  // Fetch regular posts/videos AND shorts in parallel — the backend excludes shorts
  // from the default /posts?creator_id=:id response, so we fetch them separately.
  const [mainRaw, shortsRaw] = await Promise.allSettled([
    apiFetch<{ posts: unknown[]; next_cursor?: string | null }>(`/posts${qs}`, { headers }),
    apiFetch<{ posts: unknown[] }>(
      `/posts?creator_id=${encodeURIComponent(creatorId)}&content_type=short&limit=50`,
      { headers },
    ),
  ]);

  const mainPosts =
    mainRaw.status === 'fulfilled' && Array.isArray(mainRaw.value?.posts)
      ? mainRaw.value.posts.map(normalizePost)
      : [];
  const shortsPosts =
    shortsRaw.status === 'fulfilled' && Array.isArray(shortsRaw.value?.posts)
      ? shortsRaw.value.posts.map(normalizePost)
      : [];

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const all: Post[] = [];
  for (const p of [...mainPosts, ...shortsPosts]) {
    if (!seen.has(p.id)) { seen.add(p.id); all.push(p); }
  }

  const nextCursor =
    (mainRaw.status === 'fulfilled' ? mainRaw.value?.next_cursor : null) ??
    (mainPosts.length >= 20 ? mainPosts[mainPosts.length - 1]?.createdAt ?? null : null);

  return { posts: all, hasMore: mainPosts.length >= 20, nextCursor };
}

export async function getPost(id: string): Promise<{ post: Post }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const raw = await apiFetch<Record<string, unknown>>(`/posts/${id}`, { headers });
  // Backend may wrap as { post: {...} } after envelope unwrap — handle both shapes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postData = (raw as any)?.post ?? raw;
  return { post: normalizePost(postData) };
}

export async function getBookmarkedPosts(page = 1): Promise<{ posts: Post[]; hasMore: boolean }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const raw = await apiFetch<{ posts: unknown[]; page: number; limit: number }>(
    `/posts?bookmarked=true&page=${page}&limit=20`,
    { headers },
  );
  const posts = Array.isArray(raw?.posts) ? raw.posts.map(normalizePost) : [];
  return { posts, hasMore: posts.length === 20 };
}

// ─── Create / Edit / Delete ───────────────────────────────────────────────────

/** A single media item passed inline when creating a post. */
export interface PostMediaInput {
  /** Public CDN or R2 URL of the uploaded file. */
  url: string;
  /** R2 object key (blob_path) issued by the credentials broker. */
  blob_path: string;
  type: 'image' | 'video';
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  duration_seconds?: number;
  /** Public URL of a custom thumbnail image (videos only). */
  thumbnail_url?: string;
}

export interface CreatePostData {
  caption?: string;
  visibility?: 'public' | 'subscribers' | 'draft';
  /** Inline media objects — preferred over media_ids for new posts. */
  media?: PostMediaInput[];
  /** Media IDs from POST /api/media — preferred over inline media. */
  media_ids?: string[];
  preview_duration?: number;
  categories?: string[];
  tags?: string[];
  /** Backend content_type — drives which feed/tab the post appears in. */
  content_type?: 'post' | 'video' | 'short' | 'album';
  /** Video title (for content_type: 'video') */
  title?: string;
  /** Video description (for content_type: 'video') */
  description?: string;
  /**
   * Content tier — free / subscriber / subscriber_plus.
   */
  tier?: import('@/constants/tiers').ContentTier;
  /**
   * Thumbnail URL for video posts. Sent alongside media_ids so the
   * backend can associate the thumbnail even if the separate PATCH fails.
   */
  thumbnail_url?: string;
}

export async function createPost(data: CreatePostData): Promise<{ id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ id: string }>('/posts', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
  return raw;
}

export async function editPost(
  id: string,
  data: {
    caption?: string;
    visibility?: 'public' | 'subscribers' | 'draft';
    is_pinned?: boolean;
    preview_duration?: number | null;
    expires_at?: string | null;
  },
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function deletePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function publishPost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}/publish`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function archivePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}/archive`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function restorePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}/restore`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

// ─── Interactions ─────────────────────────────────────────────────────────────

export async function likePost(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ liked: boolean; like_count: number }>(`/posts/${id}/like`, {
    method: 'POST',
    headers: authHeader(token),
  });
  return { liked: raw.liked, likeCount: raw.like_count ?? 0 };
}

export async function unlikePost(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ liked: boolean; like_count: number }>(`/posts/${id}/like`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
  return { liked: raw.liked, likeCount: raw.like_count ?? 0 };
}

export async function bookmarkPost(id: string): Promise<{ bookmarked: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${id}/bookmark`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function unbookmarkPost(id: string): Promise<{ bookmarked: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${id}/bookmark`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function reportPost(
  id: string,
  reason = 'inappropriate',
  description?: string,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}/report`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ reason, description }),
  });
}

export async function hidePost(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}/hide`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function getComments(
  postId: string,
  page = 1,
): Promise<{ comments: Comment[] }> {
  const raw = await apiFetch<{ comments: unknown[]; page: number; limit: number }>(
    `/posts/${postId}/comments?page=${page}&limit=20`,
  );
  return { comments: Array.isArray(raw?.comments) ? raw.comments.map(normalizeComment) : [] };
}

export async function addComment(postId: string, body: string): Promise<{ comment: Comment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ id: string }>(`/posts/${postId}/comments`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ body }),
  });
  // Backend returns just {id} on create — return minimal comment
  return {
    comment: {
      id: raw.id,
      body,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      replyCount: 0,
      parentId: null,
      likedByMe: false,
      author: { id: '', name: '', username: '', avatarUrl: null },
    },
  };
}

export async function addReply(
  postId: string,
  parentCommentId: string,
  body: string,
): Promise<{ comment: Comment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ id: string }>(
    `/posts/${postId}/comments/${parentCommentId}/replies`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ body }),
    },
  );
  return {
    comment: {
      id: raw.id,
      body,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      replyCount: 0,
      parentId: parentCommentId,
      likedByMe: false,
      author: { id: '', name: '', username: '', avatarUrl: null },
    },
  };
}

export async function getReplies(
  postId: string,
  commentId: string,
  page = 1,
): Promise<{ comments: Comment[] }> {
  const raw = await apiFetch<{ replies: unknown[] }>(
    `/posts/${postId}/comments/${commentId}/replies?page=${page}&limit=20`,
  );
  return { comments: Array.isArray(raw?.replies) ? raw.replies.map(normalizeComment) : [] };
}

export async function editComment(
  postId: string,
  commentId: string,
  body: string,
): Promise<{ comment: Comment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ comment: unknown }>(
    `/posts/${postId}/comments/${commentId}`,
    {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify({ body }),
    },
  );
  return { comment: normalizeComment(raw?.comment ?? { id: commentId, body }) };
}

export async function deleteComment(postId: string, commentId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function likeComment(
  postId: string,
  commentId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ liked: boolean; like_count?: number; likeCount?: number }>(
    `/posts/${postId}/comments/${commentId}/like`,
    { method: 'POST', headers: authHeader(token) },
  );
  return { liked: raw.liked, likeCount: raw.like_count ?? raw.likeCount ?? 0 };
}

export async function unlikeComment(
  postId: string,
  commentId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ liked: boolean; like_count?: number; likeCount?: number }>(
    `/posts/${postId}/comments/${commentId}/like`,
    { method: 'DELETE', headers: authHeader(token) },
  );
  return { liked: raw.liked, likeCount: raw.like_count ?? raw.likeCount ?? 0 };
}


export async function reportComment(commentId: string, reason: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/comments/${commentId}/report`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ reason }),
  });
}
