/**
 * Subscriptions Service — Subscribe to creators and check creator messaging rules.
 */
import { getAccessToken } from '@/lib/session-storage';
import { authFetch } from './api';

export interface SubscribeResult {
  subscribed: boolean;
  tier: 'subscriber' | 'subscriber_plus';
  subscription_id: string;
  subscriber_count?: number;
  subscriberCount?: number;
}

/**
 * Subscribe (or re-confirm an existing subscription) to a creator.
 * Idempotent server-side: re-subscribing an active subscription returns the
 * existing one without a second charge. The response carries the authoritative
 * `subscriber_count` so the client can sync the creator profile immediately.
 */
export async function subscribe(
  creatorId: string,
  plan = 'subscriber',
): Promise<SubscribeResult> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return authFetch<SubscribeResult>(`/creators/${creatorId}/subscribe`, token, {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export async function getCreatorMessagingSettings(creatorId: string): Promise<any> {
  const token = await getAccessToken();
  // Fallback shape must stay consistent with the real response so the
  // messaging gate never silently blocks a user on a transient error.
  // The backend still enforces restrictions on room creation/message send.
  const fallback = { who_can_message: 'everyone', subscribed: false, can_message: true };
  if (!token) return fallback;
  try {
    return await authFetch<any>(`/creators/${creatorId}/messaging-settings`, token);
  } catch {
    return fallback;
  }
}
