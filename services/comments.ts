/**
 * Comments service — wired to real backend routes.
 *
 * Backend routes (all verified):
 *   GET    /posts/:id/comments                         → getComments
 *   POST   /posts/:id/comments                         → createComment
 *   PATCH  /posts/:id/comments/:commentId              → editComment
 *   DELETE /posts/:id/comments/:commentId              → deleteComment
 *   POST   /posts/:id/comments/:commentId/like         → likeComment
 *   DELETE /posts/:id/comments/:commentId/like         → unlikeComment
 *   GET    /posts/:id/comments/:commentId/replies      → getReplies
 *   POST   /posts/:id/comments/:commentId/replies      → createReply
 *
 * Backend request/response field names are documented inline.
 * All normalizers handle both snake_case (backend) and camelCase (future) fields.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  body: string;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
}

export interface CommentReply {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAuthor(raw: any): CommentAuthor {
  return {
    id: raw?.id ?? '',
    name: raw?.name ?? raw?.full_name ?? '',
    username: raw?.username ?? '',
    avatarUrl: raw?.avatar_url ?? raw?.avatarUrl ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeComment(raw: any): Comment {
  return {
    id: raw.id,
    body: raw.body ?? '',
    isPinned: raw.is_pinned ?? raw.isPinned ?? false,
    likeCount: raw.like_count ?? raw.likeCount ?? 0,
    replyCount: raw.reply_count ?? raw.replyCount ?? 0,
    likedByMe: raw.liked_by_me ?? raw.likedByMe ?? false,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
    author: normalizeAuthor(raw.author),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReply(raw: any): CommentReply {
  return {
    id: raw.id,
    body: raw.body ?? '',
    likeCount: raw.like_count ?? raw.likeCount ?? 0,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
    author: normalizeAuthor(raw.author),
  };
}

// ─── API calls ─────────────────────────────────────────────────────────────────

/**
 * GET /posts/:postId/comments
 * Auth optional — backend checks for liked_by_me if authenticated.
 */
export async function getComments(
  postId: string,
  limit = 20,
): Promise<{ comments: Comment[] }> {
  const token = await getToken();
  const headers: Record<string, string> = token ? authHeader(token) : {};
  const raw = await apiFetch<{ comments: unknown[] }>(
    `/posts/${postId}/comments?limit=${limit}`,
    { headers },
  );
  return {
    comments: Array.isArray(raw?.comments) ? raw.comments.map(normalizeComment) : [],
  };
}

/**
 * POST /posts/:postId/comments
 * Body: { body: string }
 * Response: { comment: {...} }
 */
export async function createComment(
  postId: string,
  body: string,
): Promise<{ comment: Comment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ comment: unknown }>(
    `/posts/${postId}/comments`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ body }),
    },
  );
  return { comment: normalizeComment(raw?.comment ?? {}) };
}

/**
 * PATCH /posts/:postId/comments/:commentId
 * Body: { body: string }
 * Response: { comment: {...} }
 */
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
  return { comment: normalizeComment(raw?.comment ?? {}) };
}

/**
 * DELETE /posts/:postId/comments/:commentId
 * Response: { deleted: true }
 */
export async function deleteComment(
  postId: string,
  commentId: string,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

/**
 * POST /posts/:postId/comments/:commentId/like
 * Response: { liked: true, like_count: number }
 */
export async function likeComment(
  postId: string,
  commentId: string,
): Promise<{ likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ liked: boolean; like_count: number }>(
    `/posts/${postId}/comments/${commentId}/like`,
    { method: 'POST', headers: authHeader(token) },
  );
  return { likeCount: raw?.like_count ?? 0 };
}

/**
 * DELETE /posts/:postId/comments/:commentId/like
 * Response: { liked: false, like_count: number }
 */
export async function unlikeComment(
  postId: string,
  commentId: string,
): Promise<{ likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ liked: boolean; like_count: number }>(
    `/posts/${postId}/comments/${commentId}/like`,
    { method: 'DELETE', headers: authHeader(token) },
  );
  return { likeCount: raw?.like_count ?? 0 };
}

/**
 * GET /posts/:postId/comments/:commentId/replies
 * Response: { replies: [...] }
 */
export async function getReplies(
  postId: string,
  commentId: string,
  limit = 20,
): Promise<{ replies: CommentReply[] }> {
  const token = await getToken();
  const headers: Record<string, string> = token ? authHeader(token) : {};
  const raw = await apiFetch<{ replies: unknown[] }>(
    `/posts/${postId}/comments/${commentId}/replies?limit=${limit}`,
    { headers },
  );
  return {
    replies: Array.isArray(raw?.replies) ? raw.replies.map(normalizeReply) : [],
  };
}

/**
 * POST /posts/:postId/comments/:commentId/replies
 * Body: { body: string, mention_id?: string }
 * Response: { reply: {...} }
 */
export async function createReply(
  postId: string,
  commentId: string,
  body: string,
  mentionId?: string,
): Promise<{ reply: CommentReply }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ reply: unknown }>(
    `/posts/${postId}/comments/${commentId}/replies`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({
        body,
        ...(mentionId ? { mention_id: mentionId } : {}),
      }),
    },
  );
  return { reply: normalizeReply(raw?.reply ?? {}) };
}
