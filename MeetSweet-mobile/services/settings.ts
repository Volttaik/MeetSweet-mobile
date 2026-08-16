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
  // Errors propagate so the settings screen can fall back to the user's last
  // saved local prefs instead of silently resetting to defaults.
  return authedRequest<PrivacySettings>('/users/me/privacy');
}

export async function updatePrivacySettings(patch: Partial<PrivacySettings>): Promise<PrivacySettings> {
  return authedRequest<PrivacySettings>('/users/me/privacy', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  // Errors propagate so the settings screen can fall back to the user's last
  // saved local prefs instead of silently resetting to defaults.
  return authedRequest<NotificationSettings>('/users/me/notifications');
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
  // Errors propagate so the settings screen can fall back to the user's last
  // saved local prefs instead of silently resetting to defaults.
  return authedRequest<UserAppSettings>('/users/me/settings');
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
