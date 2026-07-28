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
  isPremium: boolean;
  priceCredits: number | null;
  createdAt: string;
  author: PostAuthor;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  isLocked?: boolean;
  updatedAt?: string;
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
  return {
    id: raw.id,
    caption: raw.caption ?? '',
    visibility: raw.visibility ?? 'public',
    mediaUrl: firstMedia?.url ?? null,
    mediaType: firstMedia?.type ?? null,
    thumbnailUrl: firstMedia?.thumbnail_url ?? null,
    durationSecs: firstMedia?.duration_secs ?? null,
    fileSize: firstMedia?.file_size ?? null,
    width: firstMedia?.width ?? null,
    height: firstMedia?.height ?? null,
    likeCount: raw.like_count ?? 0,
    commentCount: raw.comment_count ?? 0,
    bookmarkCount: raw.save_count ?? 0,
    isPremium: raw.visibility === 'subscribers',
    priceCredits: raw.unlock_price ?? null,
    createdAt: raw.created_at ?? raw.published_at ?? new Date().toISOString(),
    updatedAt: raw.updated_at,
    author: {
      id: raw.creator_id ?? '',
      name: raw.creator_display_name ?? raw.creator_username ?? 'Unknown',
      username: raw.creator_username ?? '',
      avatarUrl: raw.creator_avatar ?? null,
      isVerified: raw.creator_is_verified ?? false,
      isCreator: true,
    },
    likedByMe: raw.liked_by_me ?? false,
    bookmarkedByMe: raw.bookmarked_by_me ?? false,
    isLocked: raw.unlock_price != null && raw.unlock_price > 0,
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
  const raw = await apiFetch<{ posts: unknown[]; next_cursor?: string | null }>(
    `/posts${qs}`,
    { headers },
  );
  const posts = Array.isArray(raw?.posts) ? raw.posts.map(normalizePost) : [];
  const nextCursor = raw?.next_cursor ?? (posts.length >= 20 ? posts[posts.length - 1]?.createdAt ?? null : null);
  return { posts, hasMore: posts.length >= 20, nextCursor };
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
  unlock_price?: number;
  preview_duration?: number;
  categories?: string[];
  tags?: string[];
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
  data: { caption?: string; visibility?: string; preview_duration?: number | null; expires_at?: string | null },
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
  const raw = await apiFetch<{ liked: boolean; likeCount: number }>(
    `/posts/${postId}/comments/${commentId}/like`,
    { method: 'POST', headers: authHeader(token) },
  );
  return { liked: raw.liked, likeCount: raw.likeCount ?? 0 };
}

export async function unlikeComment(
  postId: string,
  commentId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ liked: boolean; likeCount: number }>(
    `/posts/${postId}/comments/${commentId}/like`,
    { method: 'DELETE', headers: authHeader(token) },
  );
  return { liked: raw.liked, likeCount: raw.likeCount ?? 0 };
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
