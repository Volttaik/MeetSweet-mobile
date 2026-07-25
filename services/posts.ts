import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

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
  previewMediaUrl?: string | null;
  previewMediaType?: 'image' | 'video' | null;
  previewDurationSecs?: number | null;
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

type RawPost = {
  id: string;
  caption?: string | null;
  visibility?: Post['visibility'];
  like_count?: number;
  comment_count?: number;
  save_count?: number;
  created_at?: string;
  updated_at?: string;
  published_at?: string;
  creator_id?: string;
  creator_username?: string;
  creator_display_name?: string;
  creator_avatar?: string | null;
  creator_is_verified?: boolean;
  media?: Array<{
    url?: string;
    media_url?: string;
    type?: 'image' | 'video';
    media_type?: 'image' | 'video';
    thumbnail_url?: string | null;
    duration_secs?: number | null;
    file_size?: number | null;
    width?: number | null;
    height?: number | null;
  }>;
  liked_by_me?: boolean;
  bookmarked_by_me?: boolean;
};

function normalizePost(raw: RawPost): Post {
  const media = raw.media?.[0];
  const username = raw.creator_username ?? 'creator';
  return {
    id: raw.id,
    caption: raw.caption ?? '',
    visibility: raw.visibility ?? 'public',
    mediaUrl: media?.url ?? media?.media_url ?? null,
    mediaType: media?.type ?? media?.media_type ?? null,
    thumbnailUrl: media?.thumbnail_url ?? null,
    durationSecs: media?.duration_secs ?? null,
    fileSize: media?.file_size ?? null,
    width: media?.width ?? null,
    height: media?.height ?? null,
    likeCount: raw.like_count ?? 0,
    commentCount: raw.comment_count ?? 0,
    bookmarkCount: raw.save_count ?? 0,
    isPremium: raw.visibility === 'subscribers',
    priceCredits: null,
    createdAt: raw.created_at ?? raw.published_at ?? new Date(0).toISOString(),
    updatedAt: raw.updated_at,
    author: {
      id: raw.creator_id ?? username,
      name: raw.creator_display_name ?? username,
      username,
      avatarUrl: raw.creator_avatar ?? null,
      isVerified: raw.creator_is_verified ?? false,
      isCreator: true,
    },
    likedByMe: raw.liked_by_me ?? false,
    bookmarkedByMe: raw.bookmarked_by_me ?? false,
  };
}

function normalizeComment(raw: Record<string, any>): Comment {
  const author = raw.author ?? raw.user ?? {};
  return {
    id: String(raw.id),
    body: raw.body ?? raw.content ?? '',
    createdAt: raw.created_at ?? raw.createdAt ?? new Date(0).toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt,
    likeCount: raw.like_count ?? raw.likeCount ?? 0,
    replyCount: raw.reply_count ?? raw.replyCount ?? 0,
    parentId: raw.parent_id ?? raw.parentId ?? null,
    likedByMe: raw.liked_by_me ?? raw.likedByMe ?? false,
    author: {
      id: String(author.id ?? ''),
      name: author.name ?? author.display_name ?? 'User',
      username: author.username ?? '',
      avatarUrl: author.avatar_url ?? author.avatarUrl ?? null,
    },
  };
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function getFeed(page = 1): Promise<{ posts: Post[]; hasMore: boolean }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const data = await apiFetch<{ posts: RawPost[]; page?: number; limit?: number }>(
    `/posts?page=${page}&limit=20`,
    { headers },
  );
  return {
    posts: (data.posts ?? []).map(normalizePost),
    hasMore: (data.posts?.length ?? 0) >= (data.limit ?? 20),
  };
}

export async function getUserPosts(userId: string, page = 1): Promise<{ posts: Post[]; hasMore: boolean }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const data = await apiFetch<{ posts: RawPost[]; limit?: number }>(
    `/posts?userId=${encodeURIComponent(userId)}&page=${page}&limit=20`,
    { headers },
  );
  return {
    posts: (data.posts ?? []).map(normalizePost),
    hasMore: (data.posts?.length ?? 0) >= (data.limit ?? 20),
  };
}

export async function getPost(id: string): Promise<{ post: Post }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  const data = await apiFetch<RawPost>(`/posts/${id}`, { headers });
  return { post: normalizePost(data) };
}

export interface CreatePostData {
  caption?: string;
  visibility?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  durationSecs?: number;
  fileSize?: number;
  width?: number;
  height?: number;
  isPremium?: boolean;
  priceCredits?: number;
  categories?: string[];
  tags?: string[];
  previewMediaUrl?: string;
  previewMediaType?: string;
  previewDurationSecs?: number;
}

export async function createPost(data: CreatePostData): Promise<{ post: Post }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/posts', {
    method: 'POST',
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

export async function likePost(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${id}/like`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function unlikePost(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${id}/like`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function getComments(postId: string, parentId?: string): Promise<{ comments: Comment[] }> {
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
  const data = await apiFetch<{ comments?: Record<string, any>[] }>(
    `/posts/${postId}/comments${query}`,
  );
  return { comments: (data.comments ?? []).map(normalizeComment) };
}

export async function addComment(postId: string, body: string): Promise<{ comment: Comment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${postId}/comments`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ body }),
  });
}

export async function addReply(postId: string, parentId: string, body: string): Promise<{ comment: Comment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${postId}/comments`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ body, parentId }),
  });
}

export async function editComment(postId: string, commentId: string, body: string): Promise<{ comment: Comment }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${postId}/comments/${commentId}`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ body }),
  });
}

export async function editPost(id: string, data: { caption?: string; visibility?: string }): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/posts/${id}`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
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
  return apiFetch(`/posts/${postId}/comments/${commentId}/like`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function unlikeComment(
  postId: string,
  commentId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${postId}/comments/${commentId}/like`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
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

export async function reportPost(id: string, reason = 'inappropriate'): Promise<{ reported: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/posts/${id}/report`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ reason }),
  });
}

export async function getBookmarkedPosts(
  page = 1,
): Promise<{ posts: Post[]; hasMore: boolean }> {
  const token = await getToken();
  const headers = token ? authHeader(token) : {};
  return apiFetch(`/posts?bookmarked=true&page=${page}&limit=20`, { headers });
}
