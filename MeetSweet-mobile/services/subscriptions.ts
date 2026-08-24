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

/**
 * Cancel an active subscription. Server flips the subscription to "cancelled"
 * and returns { cancelled: true } only after the row was updated — an error
 * throws and the client must NOT report success.
 */
export async function cancelSubscription(subscriptionId: string): Promise<{ cancelled: boolean }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return authFetch<{ cancelled?: boolean }>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    token,
    { method: 'POST' },
  ).then((raw) => ({ cancelled: Boolean(raw?.cancelled ?? false) }));
}
