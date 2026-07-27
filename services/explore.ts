/**
 * Local explore catalog service.
 *
 * The live backend does not yet have a GET /api/explore endpoint.
 * This module builds an equivalent ExploreCatalog by fetching public posts
 * and deriving creator and preview data from them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
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
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function fmtLikes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (n === 0) return '0';
  return String(n);
}

// ── Static catalog fixtures ───────────────────────────────────────────────────

const TRENDING_SEARCHES = ['golden hour', 'exclusive', 'new creators', 'studio', 'lifestyle'];

const STATIC_COLLECTIONS: TrendingCollection[] = [
  { id: 'col-1', title: 'Golden Hour',     subtitle: 'Best lighting drops',  itemCount: 24, gradient: 'amber'   },
  { id: 'col-2', title: 'Studio Sessions', subtitle: 'Behind the lens',      itemCount: 18, gradient: 'violet'  },
  { id: 'col-3', title: 'Exclusive Drops', subtitle: 'Subscribers only',     itemCount: 31, gradient: 'rose'    },
  { id: 'col-4', title: 'New Creators',    subtitle: 'Fresh faces this week', itemCount: 12, gradient: 'teal'   },
];

// ── Raw post shape from GET /api/posts ───────────────────────────────────────

interface RawPost {
  id: string;
  creator_id: string;
  creator_username: string;
  creator_display_name: string;
  creator_avatar: string | null;
  creator_avatar_url?: string | null;
  creator_is_verified: boolean;
  caption: string | null;
  unlock_price: number | null;
  like_count: number;
  media: Array<{ url: string; type: string; thumbnail_url?: string | null }>;
  visibility: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildExploreCatalog(): Promise<ExploreCatalog> {
  const token = await AsyncStorage.getItem('@ms_access_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const raw = await apiFetch<{ posts: RawPost[] }>('/posts?limit=50', { headers });
  const posts: RawPost[] = Array.isArray(raw?.posts) ? raw.posts : [];

  // ── Build unique creator map ──────────────────────────────────────────────
  const creatorMap = new Map<string, Creator>();
  const creatorMaxPrice = new Map<string, number>();

  for (const post of posts) {
    const { creator_id, creator_display_name, creator_username, creator_is_verified, unlock_price } = post;
    if (!creatorMap.has(creator_id)) {
      const h = hashStr(creator_id);
      const avatarRaw = post.creator_avatar ?? post.creator_avatar_url ?? null;
      creatorMap.set(creator_id, {
        id: creator_id,
        name: creator_display_name ?? creator_username ?? 'Creator',
        handle: `@${creator_username ?? 'creator'}`,
        initials: initials(creator_display_name ?? creator_username ?? '??'),
        bio: 'Exclusive content, behind-the-scenes access, and premium drops.',
        category: 'Lifestyle',
        followers: fmtFollowers(500 + (h % 9500)),
        subscriberCount: 50 + (h % 450),
        monthlyCredits: 0,
        isVerified: creator_is_verified ?? false,
        isOnline: (h % 3) === 0,
        gradient: gradientFor(creator_id),
        avatarUrl: avatarRaw,
      });
    }
    // Track the highest unlock_price per creator to use as monthlyCredits
    if (unlock_price && unlock_price > (creatorMaxPrice.get(creator_id) ?? 0)) {
      creatorMaxPrice.set(creator_id, unlock_price);
    }
  }

  // Backfill monthlyCredits from posts
  for (const [id, credits] of creatorMaxPrice) {
    const c = creatorMap.get(id);
    if (c) creatorMap.set(id, { ...c, monthlyCredits: credits });
  }

  const creators = Array.from(creatorMap.values());

  // ── Build content previews ────────────────────────────────────────────────
  const KIND: Record<string, string> = { image: 'photo', video: 'video', audio: 'audio' };

  const previews: ContentPreview[] = posts
    .filter((p) => creatorMap.has(p.creator_id))
    .map((p) => {
      const firstMedia = p.media?.[0];
      const kind = firstMedia ? (KIND[firstMedia.type] ?? 'photo') : 'photo';
      const isPremium = (p.unlock_price ?? 0) > 0;
      return {
        id: p.id,
        creatorId: p.creator_id,
        title: (p.caption ?? 'Exclusive drop').substring(0, 60),
        category: 'Lifestyle',
        kind,
        duration: '0:30',
        likes: fmtLikes(p.like_count ?? 0),
        isPremium,
        gradient: gradientFor(p.id),
        lockedLabel: isPremium ? `${p.unlock_price} credits` : 'Free',
      };
    });

  // ── Featured / recommended splits ────────────────────────────────────────
  const ids = creators.map((c) => c.id);
  const featuredCreatorIds   = ids.slice(0, Math.min(3, ids.length));
  const recommendedCreatorIds = ids.slice(Math.min(3, ids.length));

  return {
    creditBalance: 0,
    categories: [],
    trendingSearches: TRENDING_SEARCHES,
    featuredCreatorIds,
    recommendedCreatorIds,
    creators,
    previews,
    collections: STATIC_COLLECTIONS,
  };
}

// ── React Query hook ──────────────────────────────────────────────────────────

export const EXPLORE_CATALOG_KEY = ['explore-catalog-local'] as const;

export function useLocalExploreCatalog() {
  return useQuery({
    queryKey: EXPLORE_CATALOG_KEY,
    queryFn: buildExploreCatalog,
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}
