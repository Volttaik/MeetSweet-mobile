/**
 * Explore Service — Catalog items, categories, feed, time helpers.
 *
 * All data is sourced from the real backend:
 *   - GET /explore        → mixed post/video/short items + featured creators
 *   - GET /categories     → category list
 *
 * The old local stubs (hardcoded categories, empty previews) have been removed.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type {
  Creator,
  ContentPreview,
  ExploreCatalog,
  ExploreCategory,
} from '@/lib/api-client-react';

export function fmtTimeAgo(dateString: string): string {
  if (!dateString) return 'recently';
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function numberFrom(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

// Deterministic visual tone key (decorative card background) derived from the
// entity id — not fabricated content, just stable theming.
function toneForId(id: string): string {
  const tones = ['violet', 'rose', 'amber', 'teal', 'indigo', 'emerald', 'sky', 'fuchsia'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

function initialsFor(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDuration(secs: number): string {
  if (!secs || secs <= 0) return '';
  const s = Math.round(secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function creatorFromExplore(raw: any): Creator {
  const name = raw.name ?? raw.full_name ?? raw.display_name ?? raw.username ?? '';
  return {
    id: raw.id ?? '',
    name,
    handle: `@${raw.username ?? ''}`,
    initials: initialsFor(name),
    bio: raw.bio ?? '',
    category: '',
    subscriberCount: numberFrom(raw.subscriber_count ?? raw.subscriberCount),
    isVerified: Boolean(
      raw.is_verified ?? raw.isVerified ?? raw.is_verified_creator ?? false,
    ),
    isOnline: false, // presence is not implemented server-side
    gradient: toneForId(raw.id ?? raw.username ?? ''),
    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? null,
    bannerUrl: raw.banner_url ?? raw.bannerUrl ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function previewFromExplore(raw: any): ContentPreview {
  const media = Array.isArray(raw.media) ? raw.media : [];
  const contentType: string | null = raw.content_type ?? null;
  const isVideo =
    contentType === 'video' ||
    contentType === 'short' ||
    media.some((m: { type?: string }) => m.type === 'video');
  const first = media[0];
  const durationSecs = numberFrom(first?.duration_secs ?? raw.duration_secs ?? raw.duration_sec);
  const likeCount = numberFrom(raw.like_count);
  const title = raw.title ?? raw.caption ?? '';
  return {
    id: raw.id ?? '',
    creatorId: raw.creator_id ?? raw.creatorId ?? raw.creator?.id ?? '',
    title,
    category: '',
    kind: isVideo ? 'video' : 'photo',
    duration: formatDuration(durationSecs),
    likes: formatCount(likeCount),
    isPremium:
      raw.tier === 'subscriber' || raw.tier === 'subscriber_plus' || raw.is_locked === true,
    gradient: toneForId(raw.id ?? ''),
    thumbnailUrl: first?.thumbnail_url ?? raw.thumbnail_url ?? null,
    mediaUrl: raw.video_url ?? raw.videoUrl ?? first?.url ?? raw.media_url ?? null,
    createdAt: raw.published_at ?? raw.created_at ?? undefined,
    likeCount,
    commentCount: numberFrom(raw.comment_count),
    contentType,
    tier: raw.tier ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function creatorEmbeddedInItem(item: any): Creator | null {
  // The backend includes creator_* fields on every explore item. When the
  // creator is not part of the separate (capped) `users` list, build a Creator
  // from the embedded fields so the item is never dropped on the client.
  // Some content builders only carry the nested `creator` object — fall back to
  // it so the author is never lost.
  //
  // IMPORTANT: when flat `creator_id` is present, `item.id` is the POST id, not
  // the creator id. Using `item.id` here made every embedded creator get keyed by
  // the post id, so previews (which resolve their author by `creator_id`) never
  // matched and the whole feed was silently dropped.
  const src = item && item.creator_id ? item : (item?.creator ?? null);
  if (!src) return null;
  const id = src.creator_id ?? src.creatorId ?? src.id;
  if (!id) return null;
  return creatorFromExplore({
    id,
    username: src.username ?? src.creator_username,
    display_name: src.display_name ?? src.creator_display_name,
    name: src.display_name ?? src.creator_display_name ?? src.username ?? src.creator_username,
    avatar_url: src.avatar_url ?? src.creator_avatar,
    is_verified: src.is_verified ?? src.creator_is_verified,
    is_verified_creator: src.is_verified ?? src.creator_is_verified,
  });
}

/** Merge the capped `users` list with creators embedded on each item. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeItemCreators(users: any[], items: any[]): Creator[] {
  const map = new Map<string, Creator>();
  for (const u of users) {
    const c = creatorFromExplore(u);
    if (c.id) map.set(c.id, c);
  }
  for (const item of items) {
    const embedded = creatorEmbeddedInItem(item);
    if (embedded?.id && !map.has(embedded.id)) map.set(embedded.id, embedded);
  }
  return Array.from(map.values());
}

// ─── Explore feed (paginated mixed content) ───────────────────────────────────

export interface ExplorePage {
  creators: Creator[];
  previews: ContentPreview[];
  nextPage: number | null;
  hasMore: boolean;
}

export async function getExplorePage(page = 1): Promise<ExplorePage> {
  const raw = await apiFetch<Record<string, unknown>>(`/explore?page=${page}&limit=20`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = Array.isArray((raw as any)?.users) ? (raw as any).users : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = Array.isArray((raw as any)?.items) ? (raw as any).items : [];
  return {
    creators: mergeItemCreators(users, items),
    previews: items.map(previewFromExplore),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nextPage: (raw as any)?.next_page ?? (raw as any)?.nextPage ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasMore: Boolean((raw as any)?.has_more ?? (raw as any)?.hasMore ?? false),
  };
}

export function useExploreFeed() {
  return useInfiniteQuery({
    queryKey: ['explore', 'feed'],
    queryFn: ({ pageParam }) => getExplorePage(pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextPage ? lastPage.nextPage : undefined,
    staleTime: 60_000,
    retry: 2,
  });
}

// ─── Explore catalog (creators mode) ─────────────────────────────────────────

export async function getExploreCatalog(): Promise<ExploreCatalog> {
  const [exploreRaw, catRaw] = await Promise.all([
    apiFetch<Record<string, unknown>>('/explore?page=1&limit=20'),
    apiFetch<{ categories?: Array<{ id?: string; slug?: string; name?: string; label?: string; post_count?: number }> }>(
      '/categories',
    ).catch(() => ({ categories: [] })),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = Array.isArray((exploreRaw as any)?.users) ? (exploreRaw as any).users : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = Array.isArray((exploreRaw as any)?.items) ? (exploreRaw as any).items : [];
  const creators: Creator[] = mergeItemCreators(users, items);
  const previews: ContentPreview[] = items.map(previewFromExplore);

  const categories: ExploreCategory[] = (catRaw?.categories ?? []).map((c) => ({
    id: String(c.id ?? c.slug ?? ''),
    label: c.name ?? c.label ?? '',
    count: numberFrom(c.post_count),
  }));

  const creatorIds = creators.map((c) => c.id);

  return {
    categories,
    trendingSearches: [],
    featuredCreatorIds: creatorIds,
    recommendedCreatorIds: creatorIds,
    creators,
    previews,
    collections: [],
  };
}

export function useLocalExploreCatalog() {
  return useQuery({
    queryKey: ['explore', 'catalog'],
    queryFn: getExploreCatalog,
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}
