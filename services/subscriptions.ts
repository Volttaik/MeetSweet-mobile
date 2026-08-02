import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type SubscriptionTier = 'free' | 'normal' | 'premium' | 'vip';

/** Naira price for each paid tier */
export const TIER_PRICES: Record<SubscriptionTier, number> = {
  free:    0,
  normal:  200,
  premium: 500,
  vip:     1000,
};

export interface Subscription {
  id: string;
  creator_id: string;
  tier: SubscriptionTier;
  status: 'active' | 'expired' | 'cancelled';
  amount: number;
  started_at: string;
  expires_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSubscription(raw: any): Subscription {
  return {
    id:         raw.id,
    creator_id: raw.creator_id ?? raw.creatorId ?? '',
    tier:       (raw.tier ?? 'normal') as SubscriptionTier,
    status:     raw.status ?? 'active',
    amount:     raw.amount ?? 0,
    started_at: raw.started_at ?? raw.startedAt ?? '',
    expires_at: raw.expires_at ?? raw.expiresAt ?? '',
  };
}

export async function getSubscriptions(): Promise<{ subscriptions: Subscription[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ subscriptions: unknown[] }>('/subscriptions', {
    headers: authHeader(token),
  }).catch(() => ({ subscriptions: [] }));
  return {
    subscriptions: Array.isArray(raw?.subscriptions)
      ? raw.subscriptions.map(normalizeSubscription)
      : [],
  };
}

/** Subscribe to a creator at a specific tier. Wallet is debited server-side. */
export async function subscribeTier(
  creator_id: string,
  tier: SubscriptionTier,
): Promise<{ subscription_id: string; subscription: Subscription }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ subscription_id?: string; subscription?: unknown; id?: string }>('/subscriptions', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ creator_id, tier }),
  });
  const sub = raw.subscription
    ? normalizeSubscription(raw.subscription)
    : {
        id:         raw.subscription_id ?? raw.id ?? `sub_${Date.now()}`,
        creator_id,
        tier,
        status:     'active' as const,
        amount:     TIER_PRICES[tier],
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
  return { subscription_id: sub.id, subscription: sub };
}

/** Legacy subscribe (kept for compatibility) */
export async function subscribe(creator_id: string): Promise<{ subscription_id: string }> {
  return subscribeTier(creator_id, 'normal');
}

/** Upgrade a subscription to a higher tier. Wallet charged the difference. */
export async function upgradeSubscription(
  subscriptionId: string,
  newTier: SubscriptionTier,
): Promise<{ subscription: Subscription }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ subscription?: unknown }>(`/subscriptions/${subscriptionId}/upgrade`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ tier: newTier }),
  }).catch(() => ({ subscription: null }));
  const sub = raw.subscription
    ? normalizeSubscription(raw.subscription)
    : {
        id:         subscriptionId,
        creator_id: '',
        tier:       newTier,
        status:     'active' as const,
        amount:     TIER_PRICES[newTier],
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
  return { subscription: sub };
}

/** Downgrade a subscription to a lower tier. Takes effect at end of billing period. */
export async function downgradeSubscription(
  subscriptionId: string,
  newTier: SubscriptionTier,
): Promise<{ subscription: Subscription }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ subscription?: unknown }>(`/subscriptions/${subscriptionId}/downgrade`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ tier: newTier }),
  }).catch(() => ({ subscription: null }));
  const sub = raw.subscription
    ? normalizeSubscription(raw.subscription)
    : {
        id:         subscriptionId,
        creator_id: '',
        tier:       newTier,
        status:     'active' as const,
        amount:     TIER_PRICES[newTier],
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
  return { subscription: sub };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: authHeader(token),
  });
}
