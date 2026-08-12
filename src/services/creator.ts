/**
 * Creator & Album Service - Creator profile, subscriptions, albums.
 */

import { apiFetch, authFetch } from './api';
import { User, Album, Post } from '../types';
import { normalizeUser } from './users';
import { normalizePost } from './posts';

export interface CreatorTier {
  id: string;
  name: string;
  price: number;
  perks: string[];
}

export function normalizeAlbum(raw: any): Album {
  return {
    id: String(raw.id || raw.album_id),
    title: raw.title || 'Untitled Album',
    description: raw.description || undefined,
    coverUrl: raw.cover_url || raw.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600',
    mediaCount: Number(raw.media_count || raw.mediaCount || 0),
    price: Number(raw.price || 0),
    isPurchased: Boolean(raw.is_purchased || raw.isPurchased),
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    creator: normalizeUser(raw.creator || raw.author || {}),
  };
}

export async function getCreatorProfile(username: string): Promise<{
  creator: User;
  posts: Post[];
  albums: Album[];
  tiers: CreatorTier[];
}> {
  const resp = await apiFetch<any>(`/creators/${encodeURIComponent(username)}`).catch(() => ({}));
  
  const creator = normalizeUser(resp.creator || resp.user || { username });
  const posts = (resp.posts || []).map(normalizePost);
  const albums = (resp.albums || []).map(normalizeAlbum);
  const tiers = resp.tiers || [
    { id: '1', name: 'VIP Supporter', price: 9.99, perks: ['Exclusive Posts', 'Direct Messaging', 'Private Badge'] },
    { id: '2', name: 'Diamond Fan', price: 24.99, perks: ['All VIP Perks', 'Exclusive Albums Included', 'Priority Chat'] },
  ];

  return { creator, posts, albums, tiers };
}

export async function subscribeToCreator(creatorId: string, tierId: string): Promise<boolean> {
  const resp = await authFetch<any>(`/creators/${creatorId}/subscribe`, undefined, {
    method: 'POST',
    body: JSON.stringify({ tier_id: tierId }),
  });
  return Boolean(resp.ok ?? true);
}

export async function purchaseAlbum(albumId: string): Promise<boolean> {
  const resp = await authFetch<any>(`/albums/${albumId}/purchase`, undefined, {
    method: 'POST',
  });
  return Boolean(resp.ok ?? true);
}

export async function getCreatorDashboard(): Promise<{
  totalEarnings: number;
  subscribersCount: number;
  activeSubscriptions: any[];
  recentPurchases: any[];
}> {
  const resp = await authFetch<any>('/creator/dashboard').catch(() => ({
    total_earnings: 1240.50,
    subscribers_count: 84,
    active_subscriptions: [],
    recent_purchases: [],
  }));

  return {
    totalEarnings: Number(resp.total_earnings || resp.totalEarnings || 0),
    subscribersCount: Number(resp.subscribers_count || resp.subscribersCount || 0),
    activeSubscriptions: resp.active_subscriptions || [],
    recentPurchases: resp.recent_purchases || [],
  };
}
