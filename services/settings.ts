import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface AppSettings {
  push_notifications: boolean;
  email_notifications: boolean;
  dark_mode: boolean;
  data_saver: boolean;
  autoplay_media: boolean;
  biometric_login: boolean;
}

export async function getSettings(): Promise<AppSettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/settings', { headers: authHeader(token) });
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/settings', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function updatePassword(data: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/auth/change-password', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      currentPassword: data.current_password,
      newPassword: data.new_password,
    }),
  });
}

export async function toggleBiometric(biometric_login: boolean): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/auth/biometric', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ biometric_login }),
  });
}

export async function deleteAccount(password: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/auth/delete-account', {
    method: 'DELETE',
    headers: authHeader(token),
    body: JSON.stringify({ password }),
  });
}

export async function logoutAllDevices(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch('/auth/logout-all', {
    method: 'POST',
    headers: authHeader(token),
  });
}

// ─── Privacy Settings ─────────────────────────────────────────────────────────

export interface PrivacySettings {
  private_account: boolean;
  online_status: boolean;
  activity_status: boolean;
  typing_indicator: boolean;
  read_receipts: boolean;
  allow_dms: boolean;
  allow_mentions: boolean;
  allow_tags: boolean;
  search_visible: boolean;
  birthday_visible: boolean;
  phone_visible: boolean;
  sensitive_blur: boolean;
  qr_discovery: boolean;
  auto_archive: boolean;
}

export async function getPrivacySettings(): Promise<PrivacySettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/settings/privacy', { headers: authHeader(token) });
}

export async function updatePrivacySettings(data: Partial<PrivacySettings>): Promise<PrivacySettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/settings/privacy', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

// ─── Notification Settings ────────────────────────────────────────────────────

export interface NotificationSettings {
  notif_messages: boolean;
  notif_comments: boolean;
  notif_mentions: boolean;
  notif_likes: boolean;
  notif_new_subscribers: boolean;
  notif_creator_updates: boolean;
  notif_marketing: boolean;
  notif_vibration: boolean;
  notif_sound: boolean;
  notif_preview: boolean;
  notif_quiet_hours: boolean;
  notif_quiet_start: string;
  notif_quiet_end: string;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/settings/notifications', { headers: authHeader(token) });
}

export async function updateNotificationSettings(data: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/settings/notifications', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}
