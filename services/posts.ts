/**
 * Posts Service — Feed, post detail, like, bookmark, report, post creation & editing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, authFetch } from './api';

export interface PostAuthor {
  id: string;
  name: string;
  username: string;
  avatar_url?: string | null;
  is_creator?: boolean;
}

export interface Post {
  id: string;
  author: PostAuthor;
  content?: string;
  caption?: string;
  media_urls?: string[];
  media_type?: 'image' | 'video' | 'album';
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  is_subscribers_only?: boolean;
  created_at: string;
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

export async function getHomeFeed(page = 1): Promise<Post[]> {
  const token = await getToken();
  const resp = token
    ? await authFetch<any>(`/posts/feed?page=${page}`, token)
    : await apiFetch<any>(`/posts/feed?page=${page}`);
  const posts = resp.posts || (Array.isArray(resp) ? resp : []);
  return posts;
}

export async function getPost(id: string): Promise<Post> {
  const token = await getToken();
  const resp = token
    ? await authFetch<any>(`/posts/${id}`, token)
    : await apiFetch<any>(`/posts/${id}`);
  return resp.post || resp;
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

export async function reportPost(id: string, reason: string): Promise<void> {
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
  media_urls?: string[];
  category_id?: string;
  is_subscribers_only?: boolean;
}): Promise<Post> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const resp = await authFetch<any>('/posts', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return resp.post || resp;
}

export async function editPost(
  id: string,
  data: { content?: string; caption?: string; is_subscribers_only?: boolean },
): Promise<Post> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const resp = await authFetch<any>(`/posts/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return resp.post || resp;
}
