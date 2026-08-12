/**
 * Notifications Service — Fetch, read, delete, and manage push/in-app notifications with live backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, authFetch } from './api';

export interface NotificationActor {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  read: boolean;
  createdAt: string;
  actor?: NotificationActor;
  postId?: string;
  contentId?: string;
  contentType?: string;
  chatRoomId?: string;
  videoId?: string;
  shortId?: string;
  albumId?: string;
  data?: Record<string, any>;
}

export interface GetNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

export function normalizeNotification(raw: any): Notification {
  if (!raw) {
    return {
      id: String(Math.random()),
      type: 'system',
      title: 'Notification',
      body: '',
      isRead: true,
      read: true,
      createdAt: new Date().toISOString(),
    };
  }

  const isRead = Boolean(raw.isRead ?? raw.read ?? raw.is_read);
  const data = raw.data || {};

  const actorRaw = raw.actor || raw.sender || raw.user;
  const actor: NotificationActor | undefined = actorRaw
    ? {
        id: actorRaw.id || actorRaw.user_id || 'unknown',
        name: actorRaw.name || actorRaw.full_name || actorRaw.display_name || actorRaw.username || 'User',
        username: actorRaw.username || 'user',
        avatarUrl: actorRaw.avatarUrl || actorRaw.avatar_url || actorRaw.profile_picture_url || null,
      }
    : undefined;

  return {
    id: String(raw.id || raw.notification_id || Math.random()),
    type: raw.type || data.type || 'system',
    title: raw.title || data.title || 'Notification',
    body: raw.body || raw.message || data.body || '',
    isRead,
    read: isRead,
    createdAt: raw.createdAt || raw.created_at || raw.timestamp || new Date().toISOString(),
    actor,
    postId: raw.postId || raw.post_id || data.postId || data.post_id,
    contentId: raw.contentId || raw.content_id || data.contentId || data.content_id,
    contentType: raw.contentType || raw.content_type || data.contentType || data.content_type,
    chatRoomId: raw.chatRoomId || raw.chat_room_id || data.chatRoomId || data.chat_room_id,
    videoId: raw.videoId || raw.video_id || data.videoId || data.video_id,
    shortId: raw.shortId || raw.short_id || data.shortId || data.short_id,
    albumId: raw.albumId || raw.album_id || data.albumId || data.album_id,
    data,
  };
}

export async function getNotifications(page = 1): Promise<GetNotificationsResult> {
  const token = await getToken();
  if (!token) {
    return { notifications: [], unreadCount: 0 };
  }

  try {
    const resp = await authFetch<any>(`/notifications?page=${page}`, token);
    const rawList = resp.notifications || resp.items || (Array.isArray(resp) ? resp : []);
    const notifications = rawList.map((n: any) => normalizeNotification(n));
    const unreadCount =
      typeof resp.unreadCount === 'number'
        ? resp.unreadCount
        : typeof resp.unread_count === 'number'
        ? resp.unread_count
        : notifications.filter((n) => !n.isRead).length;

    return { notifications, unreadCount };
  } catch {
    return { notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await authFetch<void>(`/notifications/${id}/read`, token, { method: 'POST' }).catch(() => {});
}

export async function markAllNotificationsRead(): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await authFetch<void>('/notifications/read-all', token, { method: 'POST' }).catch(() => {});
}

export async function deleteNotification(id: string): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await authFetch<void>(`/notifications/${id}`, token, { method: 'DELETE' }).catch(() => {});
}

export async function registerPushTokenToBackend(token: string, platform: string): Promise<void> {
  const accessToken = await getToken();
  if (!accessToken) return;
  try {
    await authFetch<void>('/notifications/push-token', accessToken, {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  } catch {
    // Non-fatal registration
  }
}
