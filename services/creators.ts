/**
 * Creators Service — Public profile data and creator lists.
 */
import { apiFetch } from './api';
import { normalizeUser, User } from './users';
import { normalizeAlbum, AlbumCardData } from './albums';
import { Post } from './posts';

export async function getCreatorProfile(username: string): Promise<{
  creator: User;
  posts: Post[];
  albums: AlbumCardData[];
}> {
  const resp = await apiFetch<any>(`/creators/${encodeURIComponent(username)}`).catch(() => ({}));
  const creator = normalizeUser(resp.creator || resp.user || { username });
  const posts = resp.posts || [];
  const rawAlbums = resp.albums || [];
  const albums = rawAlbums.map((a: any) => normalizeAlbum(a));
  return { creator, posts, albums };
}

export async function getCreators(): Promise<User[]> {
  const resp = await apiFetch<any>('/creators').catch(() => []);
  const list = resp.creators || (Array.isArray(resp) ? resp : []);
  return list.map((c: any) => normalizeUser(c));
}
