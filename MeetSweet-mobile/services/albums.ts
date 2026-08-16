/**
 * Albums service — backend API layer.
 *
 * Albums are a first-class content type with their own dedicated endpoints.
 * All data comes from the backend; nothing is derived from posts.
 *
 * Backend endpoints expected:
 *   GET  /albums              → { albums: RawAlbum[], next_cursor: string | null, has_more: boolean }
 *   GET  /albums/:id          → { album: RawAlbum }
 *   GET  /albums?creator_id=  → albums filtered by creator
 *   POST /albums              → { id: string }
 *   PUT  /albums/:id          → { album: RawAlbum }
 *   DELETE /albums/:id        → 204
 *   POST /albums/:id/purchase → { purchased: boolean }  ← wallet-based album purchase
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AlbumItem {
  id: string;
  type: 'image' | 'video';
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  isLocked: boolean;
  caption: string | null;
  createdAt: string;
}

export interface Album {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  previewUrls: string[];
  items: AlbumItem[];
  itemCount: number;
  /** True when the album requires a wallet purchase to access. */
  requiresPurchase: boolean;
  /** Album price in Naira (₦). Zero means free. */
  price: number;
  gradient: string;
  isUnlockedByMe: boolean;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight shape used by MsAlbumCard in feed lists. */
export interface AlbumCardData {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  previewUrls: string[];
  itemCount: number;
  /** True when the album requires a wallet purchase to access. */
  requiresPurchase: boolean;
  /** Album price in Naira (₦). Zero means free. */
  price: number;
  gradient: string;
  isUnlockedByMe: boolean;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorInitials: string;
  creatorIsVerified: boolean;
  creatorIsOnline: boolean;
  creatorAvatarUrl: string | null;
}

export interface AlbumPage {
  albums: AlbumCardData[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateAlbumData {
  title: string;
  description?: string;
  visibility?: 'public' | 'subscribers' | 'draft';
  /** Album price in Naira — omit or pass 0 for free albums. */
  price?: number;
  cover_media_id?: string;
  media_ids?: string[];
  categories?: string[];
}

// ── Raw shapes from backend (snake_case) ─────────────────────────────────────

interface RawAlbumItem {
  id: string;
  type?: string;
  media_type?: string;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  media_url?: string | null;
  mediaUrl?: string | null;
  is_locked?: boolean;
  caption?: string | null;
  created_at?: string;
  createdAt?: string;
}

interface RawAlbumCreator {
  id?: string;
  creator_id?: string;
  full_name?: string;
  display_name?: string;
  name?: string;
  username?: string;
  creator_username?: string;
  avatar_url?: string | null;
  creator_avatar?: string | null;
  is_verified?: boolean;
  creator_is_verified?: boolean;
  is_online?: boolean;
}

interface RawAlbum {
  id: string;
  title?: string;
  description?: string;
  cover_url?: string | null;
  coverUrl?: string | null;
  preview_urls?: string[] | null;
  previewUrls?: string[] | null;
  items?: RawAlbumItem[];
  item_count?: number;
  itemCount?: number;
  is_premium?: boolean;
  isPremium?: boolean;
  unlock_price?: number;
  unlockPrice?: number;
  price_credits?: number;
  priceCredits?: number;
  gradient?: string;
  is_unlocked_by_me?: boolean;
  isUnlockedByMe?: boolean;
  // The server reports the viewer's access state as `unlocked`/`is_unlocked`
  // (true for the owner, free albums, and purchased albums). The client must
  // honour that signal — dropping it made owned/purchased albums render as
  // locked (purchase CTA shown to the creator / buyer on every open).
  unlocked?: boolean;
  is_unlocked?: boolean;
  creator?: RawAlbumCreator;
  creator_id?: string;
  creator_username?: string;
  creator_display_name?: string;
  creator_avatar?: string | null;
  creator_is_verified?: boolean;
  creator_is_online?: boolean;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

// ── Normalizers ───────────────────────────────────────────────────────────────

const GRADIENTS = ['violet', 'rose', 'amber', 'teal', 'indigo', 'emerald', 'sky', 'fuchsia'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

/** Fallback gradient derived from id when backend doesn't supply one. */
function defaultGradient(id: string): string {
  return GRADIENTS[hashStr(id) % GRADIENTS.length];
}

function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name ?? '??').substring(0, 2).toUpperCase();
}

function normalizeItem(raw: RawAlbumItem): AlbumItem {
  const rawType = raw.type ?? raw.media_type ?? 'image';
  return {
    id: raw.id,
    type: rawType === 'video' ? 'video' : 'image',
    thumbnailUrl: raw.thumbnail_url ?? raw.thumbnailUrl ?? null,
    mediaUrl: raw.media_url ?? raw.mediaUrl ?? null,
    isLocked: raw.is_locked ?? false,
    caption: raw.caption ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? '',
  };
}

export function normalizeAlbumCard(raw: RawAlbum): AlbumCardData {
  const creator = raw.creator ?? {} as RawAlbumCreator;
  const creatorId = creator.id ?? raw.creator_id ?? '';
  const creatorName =
    creator.full_name ?? creator.display_name ?? creator.name ??
    raw.creator_display_name ?? raw.creator_username ?? 'Creator';
  const creatorUsername =
    creator.username ?? raw.creator_username ?? '';
  const creatorAvatarUrl =
    creator.avatar_url ?? raw.creator_avatar ?? null;
  const creatorIsVerified =
    creator.is_verified ?? raw.creator_is_verified ?? false;
  const creatorIsOnline =
    creator.is_online ?? raw.creator_is_online ?? false;

  const price =
    raw.price_credits ?? raw.priceCredits ??
    raw.unlock_price ?? raw.unlockPrice ?? 0;

  return {
    id: raw.id,
    title: raw.title ?? 'Untitled Album',
    description: raw.description ?? '',
    coverUrl: raw.cover_url ?? raw.coverUrl ?? null,
    previewUrls: raw.preview_urls ?? raw.previewUrls ?? [],
    itemCount: raw.item_count ?? raw.itemCount ?? 0,
    requiresPurchase: raw.is_premium ?? raw.isPremium ?? price > 0,
    price,
    gradient: raw.gradient ?? defaultGradient(raw.id),
    // Server-authoritative access: owned albums and paid albums the viewer has
    // unlocked come back as `unlocked`/`is_unlocked` — never default to false.
    isUnlockedByMe:
      raw.is_unlocked_by_me ?? raw.isUnlockedByMe ??
      raw.is_unlocked ?? raw.unlocked ?? false,
    creatorId,
    creatorName,
    creatorHandle: creatorUsername ? `@${creatorUsername}` : '',
    creatorInitials: initials(creatorName),
    creatorIsVerified,
    creatorIsOnline,
    creatorAvatarUrl,
  };
}

export function normalizeAlbum(raw: RawAlbum): Album {
  const card = normalizeAlbumCard(raw);
  return {
    ...card,
    items: Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [],
    createdAt: raw.created_at ?? raw.createdAt ?? '',
    updatedAt: raw.updated_at ?? raw.updatedAt ?? '',
  };
}

// ── Auth helper ───────────────────────────────────────────────────────────────

import { getAccessToken } from '@/lib/session-storage';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Fetch a paginated list of albums.
 * Optionally filter by creator_id.
 */
export async function getAlbums(options?: {
  cursor?: string | null;
  creatorId?: string;
  limit?: number;
}): Promise<AlbumPage> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.creatorId) params.set('creator_id', options.creatorId);
  params.set('limit', String(options?.limit ?? 20));

  const raw = await apiFetch<{
    albums?: RawAlbum[];
    next_cursor?: string | null;
    has_more?: boolean;
  }>(`/albums?${params.toString()}`, { headers: await authHeaders() });

  const albums = Array.isArray(raw?.albums) ? raw.albums.map(normalizeAlbumCard) : [];
  const nextCursor = raw?.next_cursor ?? null;

  return {
    albums,
    nextCursor,
    hasMore: raw?.has_more ?? Boolean(nextCursor),
  };
}

/** Fetch a single album with its full item list. */
export async function getAlbum(id: string): Promise<Album> {
  const raw = await apiFetch<{ album?: RawAlbum } | RawAlbum>(
    `/albums/${encodeURIComponent(id)}`,
    { headers: await authHeaders() },
  );
  const data = (raw as any)?.album ?? (raw as RawAlbum);
  return normalizeAlbum(data);
}

/** Create a new album. */
export async function createAlbum(data: CreateAlbumData): Promise<{ id: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const body: Record<string, unknown> = { ...data };
  // The backend stores the price as unlock_price — send it under that name so
  // a purchase-only album is never created free (a stray `price` field would
  // be stripped by the API schema).
  if (body.price !== undefined) {
    body.unlock_price = body.price;
    delete body.price;
  }
  return apiFetch<{ id: string }>('/albums', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Update an album's metadata or item list. */
export async function updateAlbum(
  id: string,
  data: Partial<CreateAlbumData>,
): Promise<Album> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ album?: RawAlbum } | RawAlbum>(`/albums/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const data2 = (raw as any)?.album ?? (raw as RawAlbum);
  return normalizeAlbum(data2);
}

/** Delete an album (owner only). */
export async function deleteAlbum(id: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/albums/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface PurchaseAlbumResult {
  /** True only when the backend confirmed the unlock was recorded (paid
   *  transaction committed, or the album was already unlocked / free / owned). */
  purchased: boolean;
  /** True when no NEW transaction was charged — the album was already
   *  unlocked (owner, free, or a prior purchase). The UI must not report a
   *  fresh "Purchase completed" for these. */
  alreadyUnlocked: boolean;
}

/**
 * Purchase an album from the user's wallet balance.
 * Backend deducts the album price and marks the album as purchased for the current user.
 * Spec: POST /api/albums/:id/purchase
 *
 * Success is ONLY reported when the server confirms the unlock inside its
 * atomic transaction (debit + credit + album_unlocks row). A failed balance
 * check throws ApiError(402, 'Insufficient wallet balance') and never resolves.
 */
export async function purchaseAlbum(id: string): Promise<PurchaseAlbumResult> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ unlocked?: boolean; purchased?: boolean; already_unlocked?: boolean }>(
    `/albums/${encodeURIComponent(id)}/purchase`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const unlocked = Boolean(raw?.unlocked ?? raw?.purchased ?? false);
  return {
    purchased: unlocked,
    alreadyUnlocked: Boolean(raw?.already_unlocked ?? false),
  };
}

/**
 * Fetch albums the current user has purchased (unlocked).
 * Passes purchased=true to the backend; also filters client-side on isUnlockedByMe
 * as a safeguard until the backend supports the param.
 */
export async function getPurchasedAlbums(): Promise<AlbumCardData[]> {
  const raw = await apiFetch<{ albums?: RawAlbum[] }>(
    '/albums?purchased=true&limit=50',
    { headers: await authHeaders() },
  );
  const all = Array.isArray(raw?.albums) ? raw.albums.map(normalizeAlbumCard) : [];
  return all.filter((a) => a.isUnlockedByMe);
}

// ── React Query hooks ─────────────────────────────────────────────────────────

export const ALBUMS_CATALOG_KEY = ['albums'] as const;

/**
 * Infinite-scroll hook for the albums catalog.
 * Drop-in for the old useLocalAlbumCatalog — same shape returned per page.
 */
export function useAlbumCatalog(creatorId?: string) {
  return useInfiniteQuery({
    queryKey: [...ALBUMS_CATALOG_KEY, { creatorId }],
    queryFn: ({ pageParam }) =>
      getAlbums({ cursor: pageParam as string | null, creatorId }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Alias kept for backward compatibility with explore.tsx.
 * Returns first-page albums as a flat array (same contract as the old local hook).
 */
export function useLocalAlbumCatalog() {
  return useQuery({
    queryKey: [...ALBUMS_CATALOG_KEY, 'first-page'],
    queryFn: () => getAlbums({ limit: 20 }).then((p) => p.albums),
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}

/** Purchased albums — albums the current user has unlocked. */
export function usePurchasedAlbums() {
  return useQuery({
    queryKey: [...ALBUMS_CATALOG_KEY, 'purchased'],
    queryFn: getPurchasedAlbums,
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}

/** Single album detail — used by /album/[id].tsx. */
export function useAlbum(albumId: string) {
  return useQuery({
    queryKey: ['album', albumId],
    queryFn: () => getAlbum(albumId),
    staleTime: 2 * 60 * 1000,
    retry: 2,
    enabled: Boolean(albumId),
  });
}


