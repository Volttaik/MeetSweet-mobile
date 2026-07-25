import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface Subscription {
  id: string;
  creator_id: string;
  status: 'active' | 'expired' | 'cancelled';
  amount: number;
  started_at: string;
  expires_at: string;
}

export async function getSubscriptions(): Promise<{ subscriptions: Subscription[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/subscriptions', { headers: authHeader(token) });
}

export async function subscribe(creator_id: string): Promise<{ subscription_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/subscriptions', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ creator_id }),
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: authHeader(token),
  });
}
