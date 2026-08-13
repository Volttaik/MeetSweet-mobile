/**
 * Subscriptions Service — Subscribe to creators and check creator messaging rules.
 */
import { getAccessToken } from '@/lib/session-storage';
import { authFetch } from './api';

export async function subscribe(creatorId: string, plan = 'subscriber'): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  await authFetch<void>(`/creators/${creatorId}/subscribe`, token, {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export async function getCreatorMessagingSettings(creatorId: string): Promise<any> {
  const token = await getAccessToken();
  if (!token) return { who_can_message: 'everyone' };
  try {
    return await authFetch<any>(`/creators/${creatorId}/messaging-settings`, token);
  } catch {
    return { who_can_message: 'everyone' };
  }
}
