/**
 * Explore service.
 *
 * Uses GET /api/explore — the backend's dedicated public discovery endpoint.
 * Returns a ranked mix of public posts, videos, shorts, featured creators,
 * and album cards. Only visibility:"public" content appears here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type {
  ExploreCatalog,
  Creator,
  ContentPreview,
  TrendingCollection,
} from '@/lib/api-client-react';

// ── Deterministic helpers ─────────────────────────────────────────────────────

const GRADIENTS = ['violet', 'rose', 'amber', 'teal', 'indigo', 'emerald', 'sky', 'fuchsia'];

function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function gradientFor(id: string): string {
  return GRADIENTS[hashStr(id) % GRADIENTS.length];
}

function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name ?? '??').substring(0, 2).toUpperCase();
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function fmtLikes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (n === 0) return '0';
  return String(n);
}

/** Returns a relative time string like "2h ago", "3d ago", "just now". */
export function fmtTimeAgo(iso: string | undefined | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function fmtDuration(secs: number | null | undefined): string {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Response shapes from GET /api/explore ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeItem(raw: any): { preview: ContentPreview; creator: Creator } | null {
  try {
    const media = Array.isArray(raw.media) ? raw.media : [];
    const firstMedia = media[0] ?? null;

    const rawCT = raw.content_type ?? raw.contentType ?? null;
    // Detect video from multiple signals: explicit content_type, media array, or top-level video_url
    const hasVideoMedia = firstMedia?.type === 'video' || Boolean(raw.video_url ?? raw.videoUrl);
    const contentType: string | null =
      rawCT === 'short' ? 'short'
      : rawCT === 'video' ? 'video'
      : rawCT === 'album' ? 'album'
      : rawCT === 'post'  ? 'post'
      : hasVideoMedia ? 'video'   // infer video from media type when content_type absent
      : 'post';

    const isVideo = contentType === 'video' || contentType === 'short';
    const thumbnailUrl =
      raw.thumbnail_url ?? raw.thumbnailUrl ??
      firstMedia?.thumbnail_url ??
      (firstMedia?.type === 'image' ? firstMedia?.url : null) ??
      null;
    const mediaUrl = raw.video_url ?? raw.videoUrl ?? firstMedia?.url ?? null;
    const durationSecs = raw.duration_secs ?? raw.durationSecs ?? firstMedia?.duration_secs ?? null;

    const creatorId = raw.creator_id ?? raw.creator?.id ?? '';
    const creatorName = raw.creator_display_name ?? raw.creator?.name ?? raw.creator?.full_name ?? raw.creator_username ?? 'Creator';
    const creatorUsername = raw.creator_username ?? raw.creator?.username ?? '';
    const creatorAvatar = raw.creator_avatar ?? raw.creator?.avatar_url ?? raw.creator?.avatarUrl ?? null;
    const creatorVerified = raw.creator_is_verified ?? raw.creator?.is_verified ?? raw.creator?.isVerified ?? false;

    const creator: Creator = {
      id: creatorId,
      name: creatorName,
      handle: `@${creatorUsername}`,
      initials: initials(creatorName),
      bio: '',
      category: '',
      followers: '',
      subscriberCount: 0,
      monthlyCredits: 0,
      isVerified: creatorVerified,
      isOnline: false,
      gradient: gradientFor(creatorId),
      avatarUrl: creatorAvatar,
      bannerUrl: null,
    };

    const preview: ContentPreview = {
      id: raw.id,
      creatorId,
      title: (raw.title ?? raw.caption ?? '').substring(0, 80),
      category: 'Lifestyle',
      kind: isVideo ? 'video' : 'photo',
      duration: fmtDuration(durationSecs),
      likes: fmtLikes(raw.like_count ?? raw.likeCount ?? 0),
      likeCount: raw.like_count ?? raw.likeCount ?? 0,
      commentCount: raw.comment_count ?? raw.commentCount ?? 0,
      isPremium: false, // Explore only shows public content — never locked
      gradient: gradientFor(raw.id),
      lockedLabel: 'Free',
      thumbnailUrl,
      mediaUrl,
      createdAt: raw.created_at ?? raw.createdAt ?? raw.published_at,
      contentType,
      // Tier from backend — bronze means free/public (no badge shown on Explore)
      tier: raw.tier ?? null,
    };

    return { preview, creator };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeUser(raw: any): Creator {
  const name = raw.full_name ?? raw.name ?? raw.username ?? 'Creator';
  return {
    id: raw.id,
    name,
    handle: `@${raw.username ?? ''}`,
    initials: initials(name),
    bio: raw.bio ?? '',
    category: '',
    followers: fmtFollowers(raw.follower_count ?? 0),
    subscriberCount: 0,
    monthlyCredits: 0,
    isVerified: raw.is_verified ?? raw.isVerified ?? false,
    isOnline: false,
    gradient: gradientFor(raw.id),
    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? null,
    bannerUrl: null,
  };
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

// ── Paginated explore feed ────────────────────────────────────────────────────

export interface ExploreFeedPage {
  creators: Creator[];
  previews: ContentPreview[];
  featuredUsers: Creator[];
  nextPage: number | null;
  hasMore: boolean;
}

export async function fetchExplorePage(page = 1): Promise<ExploreFeedPage> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiFetch<any>(
    `/explore?page=${page}&limit=20`,
    { headers },
  );

  // items is the engagement-ranked mix of posts/videos/shorts
  const items: unknown[] = Array.isArray(raw?.items) ? raw.items : [];

  const creatorMap = new Map<string, Creator>();
  const previews: ContentPreview[] = [];

  for (const item of items) {
    const result = normalizeItem(item);
    if (!result) continue;
    const { preview, creator } = result;
    if (!creatorMap.has(creator.id)) creatorMap.set(creator.id, creator);
    previews.push(preview);
  }

  // Featured users from the /explore response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const featuredUsers: Creator[] = (Array.isArray(raw?.users) ? raw.users : []).map((u: any) => normalizeUser(u));

  // Also add featured users to the creator map
  for (const u of featuredUsers) {
    if (!creatorMap.has(u.id)) creatorMap.set(u.id, u);
  }

  const hasMore = raw?.has_more ?? raw?.hasMore ?? false;
  const nextPage = (raw?.next_page ?? raw?.nextPage) ?? (hasMore ? page + 1 : null);

  return {
    creators:     Array.from(creatorMap.values()),
    previews,
    featuredUsers,
    nextPage:     hasMore ? (nextPage ?? page + 1) : null,
    hasMore,
  };
}

// ── Full catalog builder (for single-load screens like content/[id].tsx) ──────

export async function buildExploreCatalog(): Promise<ExploreCatalog> {
  const page = await fetchExplorePage(1);

  const ids = page.creators.map((c) => c.id);
  const featuredCreatorIds    = ids.slice(0, Math.min(3, ids.length));
  const recommendedCreatorIds = ids.slice(Math.min(3, ids.length));

  return {
    creditBalance: 0,
    categories: [],
    trendingSearches: [],
    featuredCreatorIds,
    recommendedCreatorIds,
    creators: page.creators,
    previews: page.previews,
    collections: [] as TrendingCollection[],
  };
}

// ── React Query hooks ─────────────────────────────────────────────────────────

export const EXPLORE_CATALOG_KEY = ['explore-catalog-local'] as const;
export const EXPLORE_FEED_KEY    = ['explore-feed'] as const;

/** Single-load catalog — used by content/[id].tsx for id→preview/creator lookups. */
export function useLocalExploreCatalog() {
  return useQuery({
    queryKey: EXPLORE_CATALOG_KEY,
    queryFn: buildExploreCatalog,
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}

/** Infinite-scroll feed — used by the Explore tab. */
export function useExploreFeed() {
  return useInfiniteQuery({
    queryKey: EXPLORE_FEED_KEY,
    queryFn: ({ pageParam }) => fetchExplorePage(pageParam as number),
    initialPageParam: 1 as number,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextPage ? lastPage.nextPage : undefined,
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}

/** @deprecated Kept for backwards-compat — alias for fetchExplorePage */
export async function fetchExplorePosts(_cursor?: string | null): Promise<ExploreFeedPage> {
  return fetchExplorePage(1);
}
