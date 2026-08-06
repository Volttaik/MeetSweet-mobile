import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  postId: string | null;
  contentType: 'post' | 'video' | 'short' | 'album' | null;
  contentId: string | null;
  videoId: string | null;
  shortId: string | null;
  albumId: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
  } | null;
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeNotification(raw: any): Notification {
  const data = raw.data ?? {};
  return {
    id: raw.id,
    type: raw.type ?? '',
    title: raw.title ?? '',
    body: raw.body ?? '',
    isRead: raw.is_read ?? false,
    postId: data.post_id ?? data.postId ?? null,
    contentType: data.content_type ?? data.contentType ?? null,
    contentId: data.content_id ?? data.contentId ?? data.entity_id ?? data.entityId ?? null,
    videoId: data.video_id ?? data.videoId ?? null,
    shortId: data.short_id ?? data.shortId ?? null,
    albumId: data.album_id ?? data.albumId ?? null,
    createdAt: raw.created_at,
    actor: data.actor_id || data.actorId
      ? {
          id: data.actor_id ?? data.actorId ?? '',
          name: data.actor_name ?? data.actorName ?? 'MeetSweet',
          username: data.actor_username ?? data.actorUsername ?? '',
          avatarUrl: data.actor_avatar ?? data.actorAvatar ?? null,
        }
      : null,
  };
}

export async function getNotifications(page = 1): Promise<{
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ notifications: unknown[]; unread_count: number }>(
    `/notifications?page=${page}&limit=20`,
    { headers: authHeader(token) },
  );
  const notifications = Array.isArray(raw?.notifications)
    ? raw.notifications.map(normalizeNotification)
    : [];
  return {
    notifications,
    unreadCount: raw?.unread_count ?? 0,
    hasMore: notifications.length === 20,
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/notifications/${id}/read`, {
    method: 'PUT',
    headers: authHeader(token),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/notifications/read-all', {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function deleteNotification(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/notifications/${id}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}
