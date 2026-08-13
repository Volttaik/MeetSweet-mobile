/**
 * Settings Service — Communicates with MeetSweet backend for account, privacy, notification, and content settings.
 */
import { getAccessToken } from '@/lib/session-storage';
import { apiFetch, authFetch } from './api';

export interface PrivacySettings {
  private_account?: boolean;
  online_status?: boolean;
  read_receipts?: boolean;
  typing_indicator?: boolean;
  allow_dms?: boolean;
  allow_mentions?: boolean;
  allow_tags?: boolean;
  profile_visibility?: 'everyone' | 'subscribers' | 'nobody';
  message_perm?: 'everyone' | 'subscribers' | 'nobody';
}

export interface NotificationSettings {
  notif_messages?: boolean;
  notif_comments?: boolean;
  notif_likes?: boolean;
  notif_mentions?: boolean;
  notif_marketing?: boolean;
  push_notifications?: boolean;
}

export interface UserAppSettings {
  push_notifications?: boolean;
  autoplay_media?: boolean;
  data_saver?: boolean;
  high_quality_media?: boolean;
  sensitive_content?: boolean;
  language?: string;
  theme?: string;
}

async function getToken(): Promise<string | null> {
  return getAccessToken();
}

async function authedRequest<T>(
  path: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  return authFetch<T>(path, token, options);
}

export async function getPrivacySettings(): Promise<PrivacySettings> {
  try {
    return await authedRequest<PrivacySettings>('/users/me/privacy');
  } catch {
    return {
      private_account: false,
      online_status: true,
      read_receipts: true,
      typing_indicator: true,
      allow_dms: true,
      allow_mentions: true,
      allow_tags: true,
      profile_visibility: 'everyone',
      message_perm: 'everyone',
    };
  }
}

export async function updatePrivacySettings(patch: Partial<PrivacySettings>): Promise<PrivacySettings> {
  return authedRequest<PrivacySettings>('/users/me/privacy', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    return await authedRequest<NotificationSettings>('/users/me/notifications');
  } catch {
    return {
      notif_messages: true,
      notif_comments: true,
      notif_likes: true,
      notif_mentions: true,
      notif_marketing: false,
      push_notifications: true,
    };
  }
}

export async function updateNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  return authedRequest<NotificationSettings>('/users/me/notifications', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getSettings(): Promise<UserAppSettings> {
  try {
    return await authedRequest<UserAppSettings>('/users/me/settings');
  } catch {
    return {
      push_notifications: true,
      autoplay_media: true,
      data_saver: false,
      high_quality_media: true,
      sensitive_content: false,
      language: 'English',
      theme: 'dark',
    };
  }
}

export async function updateSettings(patch: Partial<UserAppSettings>): Promise<UserAppSettings> {
  return authedRequest<UserAppSettings>('/users/me/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteAccount(password: string): Promise<void> {
  await authedRequest<void>('/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}

export async function logoutAllDevices(): Promise<void> {
  await authedRequest<void>('/auth/logout-all', {
    method: 'POST',
  });
}

export async function updatePassword(data: {
  current_password?: string;
  new_password?: string;
}): Promise<void> {
  await authedRequest<void>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
