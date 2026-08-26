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

export interface NotificationPreview {
  /** Media thumbnail for content notifications (post/video/short/album). */
  thumbnail?: string | null;
  title?: string | null;
  caption?: string | null;
  /** Actual message text for private-message notifications. */
  body?: string | null;
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
  /** Server entity reference (entity_id / entity_type) when present. */
  entityId?: string;
  entityType?: string;
  /** Compact preview content rendered on the card (expandable). */
  preview?: NotificationPreview | null;
  data?: Record<string, any>;
}

export interface GetNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
}

import { getAccessToken } from '@/lib/session-storage';

async function getToken(): Promise<string | null> {
  return getAccessToken();
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
  const actorId = actorRaw?.id || actorRaw?.user_id || raw.actor_id || raw.actorId || raw.sender_id || data.actor_id || data.actorId;
  const actorName = actorRaw?.name || actorRaw?.full_name || actorRaw?.display_name || actorRaw?.username || raw.actor_name || data.actor_name || 'MeetSweet User';
  const actorUsername = actorRaw?.username || raw.actor_username || data.actor_username || 'user';
  const actorAvatar = actorRaw?.avatarUrl || actorRaw?.avatar_url || actorRaw?.profile_picture_url || raw.avatar_url || data.avatar_url || data.actor_avatar || null;

  const actor: NotificationActor | undefined = actorId
    ? {
        id: String(actorId),
        name: actorName,
        username: actorUsername,
        avatarUrl: actorAvatar,
      }
    : undefined;

  // The server's canonical entity reference — tag/mention and content
  // notifications carry entity_type + entity_id (the tagged post, video, etc.).
  // These are the fallback target identifiers when the explicit content_* /
  // post_* fields are absent, so tapping the notification opens the exact post.
  // ONLY content entity types qualify: a follow notification's entity is a
  // user, which must never be mistaken for a post id.
  const entityId = raw.entity_id || raw.entityId || data.entity_id || data.entityId;
  const entityType = raw.entity_type || raw.entityType || data.entity_type || data.entityType;
  const isContentEntity =
    entityType === 'post' || entityType === 'video' || entityType === 'short' || entityType === 'album';

  const notifId = raw.id || raw.notification_id || raw._id || data.id || data.notification_id;

  // Preview block: server sends raw.preview on the list + socket payload.
  const previewRaw =
    raw.preview || data.preview || (data.preview_content as Record<string, any> | undefined);
  const preview: NotificationPreview | null = previewRaw
    ? {
        thumbnail: previewRaw.thumbnail ?? null,
        title: previewRaw.title ?? null,
        caption: previewRaw.caption ?? null,
        body: previewRaw.body ?? null,
      }
    : null;

  return {
    id: String(notifId || Math.random()),
    type: raw.type || data.type || 'system',
    title: raw.title || data.title || 'Notification',
    body: raw.body || raw.message || data.body || '',
    isRead,
    read: isRead,
    createdAt: raw.createdAt || raw.created_at || raw.timestamp || new Date().toISOString(),
    actor,
    postId: raw.postId || raw.post_id || data.postId || data.post_id || (entityType === 'post' ? entityId : undefined),
    contentId: raw.contentId || raw.content_id || data.contentId || data.content_id || (isContentEntity ? entityId : undefined),
    contentType: raw.contentType || raw.content_type || data.contentType || data.content_type || (isContentEntity ? entityType : undefined),
    chatRoomId: raw.chatRoomId || raw.chat_room_id || data.chatRoomId || data.chat_room_id,
    videoId: raw.videoId || raw.video_id || data.videoId || data.video_id,
    shortId: raw.shortId || raw.short_id || data.shortId || data.short_id,
    albumId: raw.albumId || raw.album_id || data.albumId || data.album_id,
    entityId: entityId ? String(entityId) : undefined,
    entityType: entityType ? String(entityType) : undefined,
    preview,
    data,
  };
}

export async function getNotifications(page = 1): Promise<GetNotificationsResult> {
  const token = await getToken();
  if (!token) {
    return { notifications: [], unreadCount: 0 };
  }

  const resp = await authFetch<any>(`/notifications?page=${page}`, token);
  const rawList = resp.notifications || resp.items || (Array.isArray(resp) ? resp : []);
  const notifications = rawList.map((n: any) => normalizeNotification(n));
  const unreadCount =
    typeof resp.unreadCount === 'number'
      ? resp.unreadCount
      : typeof resp.unread_count === 'number'
      ? resp.unread_count
      : notifications.filter((n: Notification) => !n.isRead).length;

  return { notifications, unreadCount };
}

export async function markNotificationRead(id: string): Promise<void> {
  const token = await getToken();
  if (!token) return;
  // The server route is PUT; a POST here was a silent 405 that kept per-notification
  // read state permanently stale.
  await authFetch<void>(`/notifications/${id}/read`, token, { method: 'PUT' }).catch(() => {});
}

export async function markAllNotificationsRead(): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await authFetch<void>('/notifications/read-all', token, { method: 'POST' }).catch(() => {});
}

export async function deleteNotification(id: string): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await authFetch<void>(`/notifications/${id}`, token, { method: 'DELETE' });
}

export async function registerPushTokenToBackend(token: string, platform: string): Promise<boolean> {
  const accessToken = await getToken();
  if (!accessToken) return false;
  try {
    await authFetch<void>('/notifications/push-token', accessToken, {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
    return true;
  } catch {
    return false;
  }
}

