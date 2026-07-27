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
  likedByMe: boolean;
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
  likedByMe: boolean;
  subscribedToCreator: boolean;
  createdAt: string;
  creator: ContentCreator;
}

export interface ContentPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

function creatorFrom(raw: any): ContentCreator {
  const source = raw.creator ?? raw.author ?? raw;
  return {
    id: source.id ?? raw.creator_id ?? '',
    name: source.full_name ?? source.display_name ?? source.name ?? raw.creator_display_name ?? raw.creator_username ?? 'Creator',
    username: source.username ?? raw.creator_username ?? '',
    avatarUrl: source.avatar_url ?? source.avatarUrl ?? raw.creator_avatar ?? null,
    isVerified: Boolean(source.is_verified ?? source.isVerified ?? raw.creator_is_verified),
  };
}

function commentFrom(raw: any, index = 0, contentId = 'content'): ContentComment {
  return {
    id: raw.id ?? `${contentId}-comment-${index}`,
    body: raw.body ?? raw.text ?? raw.content ?? '',
    createdAt: raw.created_at ?? raw.createdAt ?? '',
    likeCount: raw.like_count ?? raw.likeCount ?? 0,
    author: creatorFrom(raw.author ?? raw),
  };
}

function numberFrom(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function videoFrom(raw: any): LongFormVideo {
  const media = raw.media?.[0] ?? raw;
  const creator = creatorFrom(raw);
  return {
    id: raw.id,
    title: raw.title ?? raw.caption ?? '',
    description: raw.description ?? raw.caption ?? '',
    videoUrl: raw.video_url ?? raw.videoUrl ?? media.url ?? null,
    thumbnailUrl: raw.thumbnail_url ?? raw.thumbnailUrl ?? media.thumbnail_url ?? null,
    durationSecs: numberFrom(raw.duration_secs ?? raw.durationSecs ?? media.duration_secs),
    viewCount: numberFrom(raw.view_count ?? raw.viewCount),
    likeCount: numberFrom(raw.like_count ?? raw.likeCount),
    commentCount: numberFrom(raw.comment_count ?? raw.commentCount),
    shareCount: numberFrom(raw.share_count ?? raw.shareCount),
    isPremium: Boolean(raw.is_premium ?? raw.isPremium ?? raw.visibility === 'subscribers'),
    likedByMe: Boolean(raw.liked_by_me ?? raw.likedByMe),
    subscribedToCreator: Boolean(raw.subscribed_to_creator ?? raw.subscribedToCreator),
    createdAt: raw.created_at ?? raw.createdAt ?? '',
    creator,
    commentsPreview: Array.isArray(raw.comments_preview)
      ? raw.comments_preview.slice(0, 2).map((item: any, index: number) => commentFrom(item, index, raw.id))
      : [],
  };
}

function shortFrom(raw: any): Short {
  const media = raw.media?.[0] ?? raw;
  return {
    id: raw.id,
    caption: raw.caption ?? raw.title ?? '',
    videoUrl: raw.video_url ?? raw.videoUrl ?? media.url ?? null,
    thumbnailUrl: raw.thumbnail_url ?? raw.thumbnailUrl ?? media.thumbnail_url ?? null,
    durationSecs: numberFrom(raw.duration_secs ?? raw.durationSecs ?? media.duration_secs),
    viewCount: numberFrom(raw.view_count ?? raw.viewCount),
    likeCount: numberFrom(raw.like_count ?? raw.likeCount),
    commentCount: numberFrom(raw.comment_count ?? raw.commentCount),
    shareCount: numberFrom(raw.share_count ?? raw.shareCount),
    isPremium: Boolean(raw.is_premium ?? raw.isPremium),
    likedByMe: Boolean(raw.liked_by_me ?? raw.likedByMe),
    subscribedToCreator: Boolean(raw.subscribed_to_creator ?? raw.subscribedToCreator),
    createdAt: raw.created_at ?? raw.createdAt ?? '',
    creator: creatorFrom(raw),
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem('@ms_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pageFrom<T>(raw: any, keys: string[], normalize: (item: any) => T): ContentPage<T> {
  const source = keys.find((key) => Array.isArray(raw?.[key]));
  const values = source ? raw[source] : [];
  const nextCursor = raw?.next_cursor ?? raw?.nextCursor ?? null;
  return {
    items: values.map(normalize),
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

export async function getVideoFeed(cursor?: string | null): Promise<ContentPage<LongFormVideo>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : '?limit=20';
  const raw = await apiFetch<any>(`/videos${query}`, { headers: await authHeaders() });
  return pageFrom(raw, ['videos', 'items'], videoFrom);
}

export async function getVideo(id: string): Promise<LongFormVideo> {
  const raw = await apiFetch<any>(`/videos/${encodeURIComponent(id)}`, { headers: await authHeaders() });
  return videoFrom(raw?.video ?? raw);
}

export async function getVideoRecommendations(id?: string): Promise<LongFormVideo[]> {
  const suffix = id ? `?video_id=${encodeURIComponent(id)}` : '';
  const raw = await apiFetch<any>(`/videos/recommendations${suffix}`, { headers: await authHeaders() });
  return pageFrom(raw, ['videos', 'items'], videoFrom).items;
}

export async function getShortsFeed(cursor?: string | null): Promise<ContentPage<Short>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : '?limit=20';
  const raw = await apiFetch<any>(`/shorts/feed${query}`, { headers: await authHeaders() });
  return pageFrom(raw, ['shorts', 'items'], shortFrom);
}

export async function getShort(id: string): Promise<Short> {
  const raw = await apiFetch<any>(`/shorts/${encodeURIComponent(id)}`, { headers: await authHeaders() });
  return shortFrom(raw?.short ?? raw);
}

export async function getShortRecommendations(id?: string): Promise<Short[]> {
  const suffix = id ? `?short_id=${encodeURIComponent(id)}` : '';
  const raw = await apiFetch<any>(`/shorts/recommendations${suffix}`, { headers: await authHeaders() });
  return pageFrom(raw, ['shorts', 'items'], shortFrom).items;
}

export async function getContentComments(kind: ContentKind, id: string): Promise<ContentComment[]> {
  const raw = await apiFetch<any>(`/${kind === 'video' ? 'videos' : 'shorts'}/${encodeURIComponent(id)}/comments`, {
    headers: await authHeaders(),
  });
  const values = Array.isArray(raw?.comments) ? raw.comments : [];
  return values.map((item: any, index: number) => commentFrom(item, index, id));
}

export async function addContentComment(kind: ContentKind, id: string, body: string): Promise<ContentComment> {
  const raw = await apiFetch<any>(`/${kind === 'video' ? 'videos' : 'shorts'}/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  return commentFrom(raw?.comment ?? raw, 0, id);
}

export async function likeContent(kind: ContentKind, id: string, liked: boolean) {
  const resource = kind === 'video' ? 'videos' : 'shorts';
  const raw = await apiFetch<any>(`/${resource}/${encodeURIComponent(id)}/like`, {
    method: liked ? 'DELETE' : 'POST',
    headers: await authHeaders(),
  });
  return {
    liked: Boolean(raw?.liked ?? !liked),
    likeCount: numberFrom(raw?.like_count ?? raw?.likeCount),
  };
}

export async function trackShortView(id: string, watchDurationSecs: number) {
  return apiFetch<any>(`/shorts/${encodeURIComponent(id)}/view`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ watch_duration_secs: Math.round(watchDurationSecs) }),
  });
}

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
  return useQuery({ queryKey: ['video', id], queryFn: () => getVideo(id), enabled: Boolean(id), staleTime: 60_000 });
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
  return useQuery({ queryKey: ['short', id], queryFn: () => getShort(id), enabled: Boolean(id), staleTime: 30_000 });
}

// ─── Create endpoints (frontend contracts; backend will implement) ─────────────

export interface CreateShortParams {
  caption: string;
  visibility: 'public' | 'subscribers' | 'draft';
  media_ids?: string[];
  categories?: string[];
  tags?: string[];
  unlock_price?: number;
}

export async function createShort(params: CreateShortParams): Promise<{ id: string }> {
  const raw = await apiFetch<any>('/shorts', {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return { id: raw?.id ?? raw?.short?.id ?? '' };
}

export interface CreateLongFormVideoParams {
  title?: string;
  description?: string;
  caption?: string;
  visibility: 'public' | 'subscribers' | 'draft';
  media_ids?: string[];
  categories?: string[];
  tags?: string[];
  unlock_price?: number;
}

export async function createLongFormVideo(params: CreateLongFormVideoParams): Promise<{ id: string }> {
  const raw = await apiFetch<any>('/videos', {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return { id: raw?.id ?? raw?.video?.id ?? '' };
}