/**
 * Explore & Search Service - Search creators, explore categories, trending creators.
 */

import { apiFetch, authFetch } from './api';
import { User, Post, Album } from '../types';
import { normalizeUser } from './users';
import { normalizePost } from './posts';

export interface Category {
  id: string;
  name: string;
  icon?: string;
  count?: number;
}

export async function getExploreCategories(): Promise<Category[]> {
  const resp = await apiFetch<any>('/explore/categories').catch(() => [
    { id: '1', name: 'Models & Fashion', icon: 'Sparkles', count: 1240 },
    { id: '2', name: 'Fitness & Health', icon: 'Dumbbell', count: 850 },
    { id: '3', name: 'Cosplay & Anime', icon: 'Gamepad2', count: 960 },
    { id: '4', name: 'Lifestyle & Vlogs', icon: 'Camera', count: 2100 },
    { id: '5', name: 'Art & Photography', icon: 'Palette', count: 640 },
  ]);
  return resp.categories || resp;
}

export async function getTrendingCreators(): Promise<User[]> {
  const resp = await apiFetch<any>('/explore/creators').catch(() => []);
  const list = resp.creators || (Array.isArray(resp) ? resp : []);
  return list.map(normalizeUser);
}

export async function getTrendingPosts(): Promise<Post[]> {
  const resp = await apiFetch<any>('/explore/trending-posts').catch(() => []);
  const list = resp.posts || (Array.isArray(resp) ? resp : []);
  return list.map(normalizePost);
}
