/**
 * Comment Room Service — container for comments belonging to a specific post
 * (USER → ROOM → CONTENT). Every post has a Comment Room; comments belong to
 * commentRoomId, never to user-to-user conversations.
 *
 * REQUIRED BACKEND CONTRACT (backend is being migrated after mobile; see
 * docs/backend-requirements.md for the full request/response spec):
 *
 *   GET  /api/posts/:postId                  → post includes comment_room_id
 *   GET  /api/comment-rooms/:commentRoomId   → { comment_room: { comment_room_id,
 *                                                post_id, comments_enabled, ... } }
 *   GET  /api/comment-rooms/:commentRoomId/comments?after=<marker>
 *        → { comments: [...], has_more }
 *   POST /api/comment-rooms/:commentRoomId/comments
 *        → { comment: {...} }   (body: { body })
 *   GET  /api/comment-rooms/:commentRoomId/comments/changes?since=<marker>
 *        → { changed, marker, comments?: [...] }
 *   PUT  /api/posts/:postId/comments-enabled   { enabled }   (post owner only)
 *
 * The Comment Room is NEVER deleted when comments are disabled — it stays
 * associated with the post so it can be re-enabled later.
 *
 * COMMENT IDENTITY RULE: mobile gets commentRoomId from the POST DATA (the
 * post endpoint returns comment_room_id). Mobile never guesses or derives it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommentRoomAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

export interface CommentRoomComment {
  id: string;
  commentRoomId: string;
  body: string;
  isPinned: boolean;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
  author: CommentRoomAuthor;
}

export interface CommentRoom {
  commentRoomId: string;
  postId: string;
  commentsEnabled: boolean;
  commentCount: number;
  /** Change marker — increments when comments change. */
  updatedAt?: string;
}

export interface CommentRoomChanges {
  changed: boolean;
  marker: string | null;
  comments?: CommentRoomComment[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAuthor(raw: any): CommentRoomAuthor {
  return {
    id: raw?.id ?? '',
    name: raw?.name ?? raw?.full_name ?? '',
    username: raw?.username ?? '',
    avatarUrl: raw?.avatar_url ?? raw?.avatarUrl ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeComment(raw: any, commentRoomId: string): CommentRoomComment {
  return {
    id: raw.id,
    commentRoomId: raw.commentRoomId ?? raw.comment_room_id ?? commentRoomId,
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
function normalizeCommentRoom(raw: any): CommentRoom {
  const source = raw?.comment_room ?? raw ?? {};
  return {
    commentRoomId: source.comment_room_id ?? source.commentRoomId ?? source.id ?? '',
    postId: source.post_id ?? source.postId ?? '',
    commentsEnabled: source.comments_enabled ?? source.commentsEnabled ?? true,
    commentCount: source.comment_count ?? source.commentCount ?? 0,
    updatedAt: source.updated_at ?? source.updatedAt ?? undefined,
  };
}

// ─── Comment Room API ─────────────────────────────────────────────────────────

/**
 * Resolve the Comment Room for a post. The commentRoomId comes from the POST
 * DATA (post.commentRoomId) — never guessed or derived client-side.
 * GET /api/comment-rooms/:commentRoomId
 */
export async function getCommentRoom(commentRoomId: string): Promise<CommentRoom> {
  const token = await getToken();
  const headers: Record<string, string> = token ? authHeader(token) : {};
  const raw = await apiFetch<unknown>(`/comment-rooms/${encodeURIComponent(commentRoomId)}`, {
    headers,
  });
  return normalizeCommentRoom(raw);
}

/**
 * GET comments for a Comment Room. `after` = incremental marker (lastCommentId
 * / updatedAt): "give me comments after #50" returns only #51, #52.
 * GET /api/comment-rooms/:commentRoomId/comments?after=
 */
export async function getRoomComments(
  commentRoomId: string,
  opts?: { after?: string },
): Promise<{ comments: CommentRoomComment[]; hasMore: boolean }> {
  const token = await getToken();
  const headers: Record<string, string> = token ? authHeader(token) : {};
  const qs = opts?.after ? `?after=${encodeURIComponent(opts.after)}` : '';
  const raw = await apiFetch<{ comments: unknown[]; has_more?: boolean; hasMore?: boolean }>(
    `/comment-rooms/${encodeURIComponent(commentRoomId)}/comments${qs}`,
    { headers },
  );
  return {
    comments: Array.isArray(raw?.comments)
      ? raw.comments.map((c) => normalizeComment(c, commentRoomId))
      : [],
    hasMore: raw?.has_more ?? raw?.hasMore ?? false,
  };
}

/**
 * Submit a comment into a Comment Room. Comment contains authorId but the
 * destination is commentRoomId. Backend MUST reject when comments are disabled
 * (security); the UI also blocks submission (UX).
 * POST /api/comment-rooms/:commentRoomId/comments
 */
export async function submitRoomComment(
  commentRoomId: string,
  body: string,
): Promise<{ comment: CommentRoomComment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ comment: unknown }>(
    `/comment-rooms/${encodeURIComponent(commentRoomId)}/comments`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ body }),
    },
  );
  return { comment: normalizeComment(raw?.comment ?? {}, commentRoomId) };
}

/**
 * Lightweight change check for ONE Comment Room. Poll ONLY the currently
 * viewed room — never every post. "New comments appear without manual refresh."
 * GET /api/comment-rooms/:commentRoomId/comments/changes?since=<marker>
 */
export async function checkCommentRoomChanges(
  commentRoomId: string,
  marker: string | null,
): Promise<CommentRoomChanges> {
  const token = await getToken();
  if (!token) return { changed: false, marker };
  const qs = marker ? `?since=${encodeURIComponent(marker)}` : '';
  const raw = await apiFetch<
    CommentRoomChanges & { has_changes?: boolean }
  >(
    `/comment-rooms/${encodeURIComponent(commentRoomId)}/comments/changes${qs}`,
    { headers: authHeader(token) },
  ).catch((): CommentRoomChanges => ({ changed: false, marker }));
  const changed = raw?.changed ?? (raw as { has_changes?: boolean }).has_changes ?? false;
  return {
    changed: Boolean(changed),
    marker: raw?.marker ?? marker,
    comments: raw?.comments ?? undefined,
  };
}

/**
 * Set whether comments are enabled for a post (post owner only).
 * PUT /api/posts/:postId/comments-enabled  { enabled }
 * The Comment Room is NOT deleted when disabled — it stays associated so it
 * can be re-enabled later. Backend MUST enforce the flag on submission.
 */
export async function setCommentsEnabled(postId: string, enabled: boolean): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${encodeURIComponent(postId)}/comments-enabled`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ enabled }),
  });
}

// ─── Comment lifecycle (per-comment ops stay under the room) ──────────────────

/**
 * PATCH /api/comment-rooms/:commentRoomId/comments/:commentId
 */
export async function editRoomComment(
  commentRoomId: string,
  commentId: string,
  body: string,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/comment-rooms/${encodeURIComponent(commentRoomId)}/comments/${commentId}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ body }),
  });
}

/**
 * DELETE /api/comment-rooms/:commentRoomId/comments/:commentId
 */
export async function deleteRoomComment(
  commentRoomId: string,
  commentId: string,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/comment-rooms/${encodeURIComponent(commentRoomId)}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

/**
 * POST /api/comment-rooms/:commentRoomId/comments/:commentId/like
 */
export async function likeRoomComment(
  commentRoomId: string,
  commentId: string,
): Promise<{ likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ like_count?: number; likeCount?: number }>(
    `/comment-rooms/${encodeURIComponent(commentRoomId)}/comments/${commentId}/like`,
    { method: 'POST', headers: authHeader(token) },
  );
  return { likeCount: raw?.like_count ?? raw?.likeCount ?? 0 };
}

/**
 * DELETE /api/comment-rooms/:commentRoomId/comments/:commentId/like
 */
export async function unlikeRoomComment(
  commentRoomId: string,
  commentId: string,
): Promise<{ likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ like_count?: number; likeCount?: number }>(
    `/comment-rooms/${encodeURIComponent(commentRoomId)}/comments/${commentId}/like`,
    { method: 'DELETE', headers: authHeader(token) },
  );
  return { likeCount: raw?.like_count ?? raw?.likeCount ?? 0 };
}