import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * MeetSweet subscription tier model.
 *
 * Creators offer up to three paid tiers:
 *   Silver  — entry-level: unlocks all silver & below content
 *   Gold    — mid-level:   unlocks all gold & below content
 *   Diamond — top-level:   unlocks ALL subscriber content
 *
 * Bronze content is always free / public — no subscription needed.
 *
 * The backend currently collapses all three to a single subscription per
 * creator (one row in the subscriptions table).  The tier is tracked on
 * the frontend and will be sent to the API once the backend supports it.
 *
 * @deprecated SubscriptionTier (free/normal/premium/vip) is the legacy
 * type kept for backwards-compat only.  Use ContentSubscriptionTier.
 */
export type SubscriptionTier = 'free' | 'normal' | 'premium' | 'vip';

/** The three purchasable subscription tiers (excludes bronze / free). */
export type ContentSubscriptionTier = 'silver' | 'gold' | 'diamond';

/**
 * Default monthly prices (₦) for each subscription tier.
 * Creators can override these in their dashboard settings.
 */
export const SUBSCRIPTION_TIER_PRICES: Record<ContentSubscriptionTier, number> = {
  silver:  500,
  gold:    1500,
  diamond: 3000,
};

/**
 * What content a subscriber can see at each tier (cumulative / inclusive).
 */
export const SUBSCRIPTION_TIER_ACCESS: Record<ContentSubscriptionTier, ContentSubscriptionTier[]> = {
  silver:  ['silver'],
  gold:    ['silver', 'gold'],
  diamond: ['silver', 'gold', 'diamond'],
};

export interface Subscription {
  id: string;
  creator_id: string;
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
    status:     raw.status ?? 'active',
    amount:     raw.amount ?? 0,
    started_at: raw.started_at ?? raw.startedAt ?? '',
    expires_at: raw.expires_at ?? raw.expiresAt ?? '',
  };
}

/** GET /api/subscriptions?type=subscribed — creators I am subscribed to */
export async function getSubscriptions(): Promise<{ subscriptions: Subscription[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ subscriptions: unknown[] }>('/subscriptions?type=subscribed', {
    headers: authHeader(token),
  }).catch(() => ({ subscriptions: [] }));
  return {
    subscriptions: Array.isArray(raw?.subscriptions)
      ? raw.subscriptions.map(normalizeSubscription)
      : [],
  };
}

/**
 * Subscribe to a creator.
 * POST /api/subscriptions  { creator_id }
 * There is only one subscription tier — you either subscribe or you don't.
 */
export async function subscribe(
  creator_id: string,
): Promise<{ subscription_id: string; subscription: Subscription }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ subscription_id?: string; subscription?: unknown; id?: string }>('/subscriptions', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ creator_id }),
  });
  const sub = raw.subscription
    ? normalizeSubscription(raw.subscription)
    : {
        id:         raw.subscription_id ?? raw.id ?? `sub_${Date.now()}`,
        creator_id,
        status:     'active' as const,
        amount:     0,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
  return { subscription_id: sub.id, subscription: sub };
}

/** @deprecated Use subscribe() instead. Kept for backwards-compat. */
export async function subscribeTier(
  creator_id: string,
  _tier?: SubscriptionTier,
): Promise<{ subscription_id: string; subscription: Subscription }> {
  return subscribe(creator_id);
}

/** @deprecated Use subscribe() instead. Kept for backwards-compat. */
export const TIER_PRICES: Record<SubscriptionTier, number> = {
  free:    0,
  normal:  0,
  premium: 0,
  vip:     0,
};

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

/** Check if user is subscribed to a specific creator */
export async function isSubscribedTo(creatorId: string): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  try {
    // Try the combined check endpoint first
    const result = await apiFetch<{
      subscribed: boolean;
    }>(`/subscriptions/check/${creatorId}`, {
      headers: authHeader(token),
    });
    return result.subscribed;
  } catch {
    // Fall back to listing subscriptions and checking
    try {
      const { subscriptions } = await getSubscriptions();
      return subscriptions.some(
        (s) => s.creator_id === creatorId && s.status === 'active',
      );
    } catch {
      return false;
    }
  }
}

/** Get creator's messaging settings */
export async function getCreatorMessagingSettings(
  creatorId: string,
): Promise<{ who_can_message: 'everyone' | 'subscribers' | 'none' }> {
  const token = await getToken();
  if (!token) return { who_can_message: 'everyone' };

  try {
    const result = await apiFetch<{
      who_can_message: 'everyone' | 'subscribers' | 'none';
      subscribed: boolean;
      can_message: boolean;
    }>(`/subscriptions/check/${creatorId}`, {
      headers: { ...authHeader(token) },
    });
    return { who_can_message: result.who_can_message };
  } catch {
    return { who_can_message: 'everyone' };
  }
}
