/**
 * Posts & Feed Service - Handles feed, post creation, post likes, comments.
 */

import { apiFetch, authFetch } from './api';
import { Post, Comment } from '../types';
import { normalizeUser } from './users';

export function normalizePost(raw: any): Post {
  return {
    id: String(raw.id || raw.post_id),
    caption: raw.caption || raw.content || raw.body || '',
    mediaUrls: Array.isArray(raw.media_urls || raw.mediaUrls)
      ? (raw.media_urls || raw.mediaUrls)
      : raw.media_url || raw.mediaUrl
      ? [raw.media_url || raw.mediaUrl]
      : [],
    mediaType: raw.media_type || raw.mediaType || 'image',
    likesCount: Number(raw.likes_count || raw.likesCount || 0),
    commentsCount: Number(raw.comments_count || raw.commentsCount || 0),
    isLiked: Boolean(raw.is_liked || raw.isLiked),
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    author: normalizeUser(raw.author || raw.user || {}),
    isExclusive: Boolean(raw.is_exclusive || raw.isExclusive),
    price: raw.price ? Number(raw.price) : undefined,
    unlocked: Boolean(raw.unlocked || !raw.is_exclusive),
  };
}

export function normalizeComment(raw: any): Comment {
  return {
    id: String(raw.id || raw.comment_id),
    body: raw.body || raw.content || '',
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    user: normalizeUser(raw.user || raw.author || {}),
    likesCount: Number(raw.likes_count || raw.likesCount || 0),
    isLiked: Boolean(raw.is_liked || raw.isLiked),
  };
}

export async function getFeed(page = 1): Promise<Post[]> {
  const resp = await authFetch<any>(`/posts/feed?page=${page}`).catch(() => []);
  const list = resp.posts || (Array.isArray(resp) ? resp : []);
  return list.map(normalizePost);
}

export async function createPost(payload: {
  caption: string;
  mediaUrls?: string[];
  isExclusive?: boolean;
  price?: number;
}): Promise<Post> {
  const resp = await authFetch<any>('/posts', undefined, {
    method: 'POST',
    body: JSON.stringify({
      caption: payload.caption,
      media_urls: payload.mediaUrls || [],
      is_exclusive: payload.isExclusive,
      price: payload.price,
    }),
  });
  return normalizePost(resp.post || resp);
}

export async function toggleLikePost(postId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  const resp = await authFetch<any>(`/posts/${postId}/like`, undefined, {
    method: 'POST',
  });
  return {
    isLiked: Boolean(resp.is_liked ?? resp.isLiked),
    likesCount: Number(resp.likes_count ?? resp.likesCount),
  };
}

export async function getPostComments(postId: string): Promise<Comment[]> {
  const resp = await apiFetch<any>(`/posts/${postId}/comments`).catch(() => []);
  const list = resp.comments || (Array.isArray(resp) ? resp : []);
  return list.map(normalizeComment);
}

export async function addPostComment(postId: string, body: string): Promise<Comment> {
  const resp = await authFetch<any>(`/posts/${postId}/comments`, undefined, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  return normalizeComment(resp.comment || resp);
}
