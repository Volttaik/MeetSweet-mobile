/**
 * Local explore catalog service.
 *
 * The live backend does not have a GET /api/explore endpoint.
 * This module builds equivalent data by fetching public posts from /api/posts
 * and deriving creator and content-card data from them.
 *
 * Two hooks are exported:
 *   useLocalExploreCatalog  — single-page, for screens that need a lookup map
 *                             (e.g. content/[id].tsx)
 *   useExploreFeed          — infinite-query, for the paginated video feed
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

// ── Remote catalog fixtures ───────────────────────────────────────────────────

/** GET /collections — curated collection tiles shown in Explore. */
async function fetchCollections(): Promise<TrendingCollection[]> {
  try {
    const raw = await apiFetch<{ collections?: unknown[] }>('/collections');
    if (!Array.isArray(raw?.collections)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.collections.map((c: any) => ({
      id: c.id ?? '',
      title: c.title ?? '',
      subtitle: c.subtitle ?? c.description ?? '',
      itemCount: c.item_count ?? c.itemCount ?? 0,
      gradient: c.gradient ?? 'violet',
    }));
  } catch {
    return [];
  }
}

/** GET /search/trending — trending search terms shown in Explore. */
async function fetchTrendingSearches(): Promise<string[]> {
  try {
    const raw = await apiFetch<{ trending?: unknown[]; searches?: unknown[] }>('/search/trending');
    const list = raw?.trending ?? raw?.searches ?? [];
    if (!Array.isArray(list)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return list.map((item: any) => (typeof item === 'string' ? item : item.query ?? item.term ?? '')).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Raw post shape from GET /api/posts ────────────────────────────────────────

interface RawPost {
  id: string;
  creator_id: string;
  creator_username: string;
  creator_display_name: string;
  creator_avatar: string | null;
  creator_avatar_url?: string | null;
  creator_is_verified: boolean;
  caption: string | null;
  content_type?: string | null;
  unlock_price: number | null;
  like_count: number;
  comment_count?: number;
  created_at?: string;
  published_at?: string;
  media: Array<{ url: string; type: string; thumbnail_url?: string | null; duration_secs?: number | null }>;
  visibility: string;
}

// ── Builder helpers ───────────────────────────────────────────────────────────

const KIND: Record<string, string> = { image: 'photo', video: 'video', audio: 'audio' };

function fmtDuration(secs: number | null | undefined): string {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function creatorFromPost(post: RawPost): Creator {
  const avatarRaw = post.creator_avatar ?? post.creator_avatar_url ?? null;
  const firstMedia = post.media?.[0];
  // Use the first post's image/thumbnail as the creator's banner
  const bannerRaw =
    firstMedia?.thumbnail_url ??
    (firstMedia?.type === 'image' ? firstMedia?.url : null) ??
    null;
  return {
    id: post.creator_id,
    name: post.creator_display_name ?? post.creator_username ?? 'Creator',
    handle: `@${post.creator_username ?? 'creator'}`,
    initials: initials(post.creator_display_name ?? post.creator_username ?? '??'),
    // Fields below are not available from the posts feed.
    // They will be populated with real values from GET /creators/:id
    // when the creator profile page is opened.
    bio: '',
    category: '',
    followers: '',
    subscriberCount: 0,
    monthlyCredits: 0,
    isVerified: post.creator_is_verified ?? false,
    isOnline: false,
    gradient: gradientFor(post.creator_id),
    avatarUrl: avatarRaw,
    bannerUrl: bannerRaw,
  };
}

function previewFromPost(post: RawPost): ContentPreview {
  const firstMedia = post.media?.[0];
  const kind = firstMedia ? (KIND[firstMedia.type] ?? 'photo') : 'photo';
  const isPremium = (post.unlock_price ?? 0) > 0;
  const durationSecs = firstMedia?.duration_secs ?? null;
  // Thumbnail: prefer explicit thumbnail_url; for images the full url doubles as thumbnail
  const thumbnailUrl =
    firstMedia?.thumbnail_url ??
    (firstMedia?.type === 'image' ? firstMedia?.url : null) ??
    null;
  // mediaUrl: the full-resolution source — used for video playback and image lightbox
  const mediaUrl = firstMedia?.url ?? null;

  // Determine content_type for correct routing client-side
  const rawCT = post.content_type ?? null;
  const contentType: string | null =
    rawCT === 'short' ? 'short'
    : rawCT === 'video' ? 'video'
    : rawCT === 'album' ? 'album'
    : rawCT === 'post'  ? 'post'
    : firstMedia?.type === 'video' ? 'video'
    : null;

  return {
    id: post.id,
    creatorId: post.creator_id,
    title: (post.caption ?? 'Exclusive drop').substring(0, 80),
    category: 'Lifestyle',
    kind,
    duration: fmtDuration(durationSecs),
    likes: fmtLikes(post.like_count ?? 0),
    likeCount: post.like_count ?? 0,
    commentCount: post.comment_count ?? 0,
    isPremium,
    gradient: gradientFor(post.id),
    lockedLabel: isPremium ? `₦${post.unlock_price?.toLocaleString()}` : 'Free',
    thumbnailUrl,
    mediaUrl,
    createdAt: post.created_at ?? post.published_at,
    contentType,
  };
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

// ── Paginated post fetcher ────────────────────────────────────────────────────

export interface ExploreFeedPage {
  creators: Creator[];
  previews: ContentPreview[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function fetchExplorePosts(cursor?: string | null): Promise<ExploreFeedPage> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const qs = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=20`
    : '?limit=50'; // bigger first load

  const raw = await apiFetch<{ posts: RawPost[]; next_cursor?: string | null }>(
    `/posts${qs}`,
    { headers },
  );

  const posts: RawPost[] = Array.isArray(raw?.posts) ? raw.posts : [];

  // Deduplicate posts by id (guard against server sending duplicates)
  const seen = new Set<string>();
  const uniquePosts = posts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Build creator map (unique per page)
  const creatorMap = new Map<string, Creator>();
  const creatorMaxPrice = new Map<string, number>();

  for (const post of uniquePosts) {
    if (!creatorMap.has(post.creator_id)) {
      creatorMap.set(post.creator_id, creatorFromPost(post));
    }
    if (post.unlock_price && post.unlock_price > (creatorMaxPrice.get(post.creator_id) ?? 0)) {
      creatorMaxPrice.set(post.creator_id, post.unlock_price);
    }
  }

  // monthlyCredits is intentionally left as 0 here.
  // The real subscription price will be fetched per-creator from GET /creators/:id
  // (see services/creators.ts — useCreatorProfile) when the profile screen is opened.
  // Do not derive this field from post unlock_prices; that is not the subscription price.
  void creatorMaxPrice; // suppress unused-variable lint warning

  const creators = Array.from(creatorMap.values());
  const previews = uniquePosts
    .filter((p) => creatorMap.has(p.creator_id))
    .map(previewFromPost);

  const nextCursor = raw?.next_cursor ?? null;
  const hasMore = Boolean(nextCursor) || posts.length >= 20;

  return { creators, previews, nextCursor, hasMore };
}

// ── Full catalog builder (for single-load screens like content/[id].tsx) ──────

export async function buildExploreCatalog(): Promise<ExploreCatalog> {
  const [page, collections, trendingSearches] = await Promise.all([
    fetchExplorePosts(null),
    fetchCollections(),
    fetchTrendingSearches(),
  ]);

  const ids = page.creators.map((c) => c.id);
  const featuredCreatorIds    = ids.slice(0, Math.min(3, ids.length));
  const recommendedCreatorIds = ids.slice(Math.min(3, ids.length));

  return {
    creditBalance: 0,
    categories: [],
    trendingSearches,
    featuredCreatorIds,
    recommendedCreatorIds,
    creators: page.creators,
    previews: page.previews,
    collections,
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

/** Infinite-scroll feed — used by the Explore tab video feed and creator grid. */
export function useExploreFeed() {
  return useInfiniteQuery({
    queryKey: EXPLORE_FEED_KEY,
    queryFn: ({ pageParam }) => fetchExplorePosts(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}
