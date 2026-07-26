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
