/**
 * Albums service — local data layer.
 *
 * Albums are a curated collection content type. This module derives
 * album data from the existing explore feed (grouping posts by creator)
 * so the UI has real content immediately. Backend agents will discover
 * these types and build the matching API routes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { fetchExplorePosts } from './explore';
import { apiFetch } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AlbumItem {
  id: string;
  type: 'image' | 'video';
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  isLocked: boolean;
}

export interface Album {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  previewUrls: string[];
  items: AlbumItem[];
  itemCount: number;
  isPremium: boolean;
  priceCredits: number;
  gradient: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl: string | null;
  createdAt?: string;
}

/** Lightweight shape used by MsAlbumCard in feed lists. */
export interface AlbumCardData {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  previewUrls: string[];
  itemCount: number;
  isPremium: boolean;
  priceCredits: number;
  gradient: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl: string | null;
}

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

function gradientFor(id: string) {
  return GRADIENTS[hashStr(id) % GRADIENTS.length];
}

const ALBUM_TITLES = [
  'Golden Hour',
  'Studio Sessions',
  'Exclusive Drops',
  'Behind The Lens',
  'Late Night Vibes',
  'Summer Series',
  'Premium Collection',
  'Private Archives',
  'The Edit',
  'Signature Set',
  'Unfiltered',
  'Intimate Series',
];

const ALBUM_DESCS = [
  'A curated selection of my best work.',
  'Exclusive content for true fans.',
  'Behind the scenes and more.',
  'Premium drops — limited access.',
  'My most intimate collection yet.',
];

// ── Local catalog builder ─────────────────────────────────────────────────────

/**
 * Groups explore posts by creator to build album cards.
 * Each creator with ≥ 2 posts becomes one album.
 */
export async function buildLocalAlbumCatalog(): Promise<AlbumCardData[]> {
  const page = await fetchExplorePosts(null);

  // Group previews by creator
  const byCreator = new Map<string, typeof page.previews>();
  for (const p of page.previews) {
    if (!byCreator.has(p.creatorId)) byCreator.set(p.creatorId, []);
    byCreator.get(p.creatorId)!.push(p);
  }

  const albums: AlbumCardData[] = [];
  let titleIdx = 0;

  for (const [creatorId, previews] of byCreator) {
    if (previews.length < 2) continue;
    const creator = page.creators.find((c) => c.id === creatorId);
    if (!creator) continue;

    const h = hashStr(creatorId);
    const isPremium = (h % 3) !== 0;
    const priceCredits = isPremium ? [25, 50, 75, 100][h % 4] : 0;

    const thumbs = previews
      .map((p) => p.thumbnailUrl ?? p.mediaUrl)
      .filter(Boolean) as string[];

    albums.push({
      id: `album-${creatorId}`,
      title: ALBUM_TITLES[titleIdx % ALBUM_TITLES.length],
      description: ALBUM_DESCS[h % ALBUM_DESCS.length],
      coverUrl: thumbs[0] ?? null,
      previewUrls: thumbs.slice(0, 3),
      itemCount: previews.length,
      isPremium,
      priceCredits,
      gradient: gradientFor(creatorId),
      creatorId,
      creatorName: creator.name,
      creatorHandle: creator.handle,
      creatorInitials: creator.initials,
      creatorIsVerified: creator.isVerified,
      creatorIsOnline: creator.isOnline,
      creatorAvatarUrl: creator.avatarUrl ?? null,
    });

    titleIdx++;
    if (albums.length >= 12) break;
  }

  return albums;
}

/** Build full Album for the detail screen. */
export async function buildLocalAlbum(albumId: string): Promise<Album | null> {
  const catalog = await buildLocalAlbumCatalog();
  const card = catalog.find((a) => a.id === albumId);
  if (!card) return null;

  const page = await fetchExplorePosts(null);
  const creatorPreviews = page.previews.filter((p) => p.creatorId === card.creatorId);

  const items: AlbumItem[] = creatorPreviews.map((p) => ({
    id: p.id,
    type: (p.kind === 'video' ? 'video' : 'image') as 'image' | 'video',
    thumbnailUrl: p.thumbnailUrl ?? null,
    mediaUrl: p.mediaUrl ?? null,
    isLocked: card.isPremium,
  }));

  return { ...card, items, createdAt: creatorPreviews[0]?.createdAt };
}

// ── Album creation ────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface CreateAlbumData {
  title: string;
  description?: string;
  visibility?: 'public' | 'subscribers' | 'draft';
  unlock_price?: number;
  cover_media_id?: string;
  media_ids?: string[];
  categories?: string[];
}

/**
 * Create a new album via the backend.
 * POST /albums — may 404 until backend implements it; error is surfaced to user.
 */
export async function createAlbum(data: CreateAlbumData): Promise<{ id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ id: string }>('/albums', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
  return raw;
}

// ── React Query hooks ─────────────────────────────────────────────────────────

export const ALBUMS_CATALOG_KEY = ['albums-catalog-local'] as const;

export function useLocalAlbumCatalog() {
  return useQuery({
    queryKey: ALBUMS_CATALOG_KEY,
    queryFn: buildLocalAlbumCatalog,
    staleTime: 3 * 60 * 1000,
    retry: 2,
  });
}

export function useAlbum(albumId: string) {
  return useQuery({
    queryKey: ['album', albumId],
    queryFn: () => buildLocalAlbum(albumId),
    staleTime: 3 * 60 * 1000,
    retry: 2,
    enabled: Boolean(albumId),
  });
}
