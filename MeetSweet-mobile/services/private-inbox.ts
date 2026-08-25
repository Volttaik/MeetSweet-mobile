import { authFetch } from '@/services/api';
import { getAccessToken } from '@/lib/session-storage';

export type Attachment = {
  id: string;
  media_id: string;
  media_type: 'image' | 'video' | 'file';
  media_url: string | null;
  thumbnail_url?: string | null;
  price: number;
  is_locked: boolean;
  purchased_by_me: boolean;
};

export type PrivateMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  parent_message_id: string | null;
  body: string;
  status: 'sent' | 'read' | 'replied';
  price_paid: number;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
  sender_name: string | null;
  sender_username: string | null;
  sender_avatar: string | null;
  recipient_name: string | null;
  recipient_username: string | null;
  recipient_avatar: string | null;
  attachments: Attachment[];
  reply: PrivateMessage | null;
};

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw new Error('Not authenticated');
  return value;
}

export async function listPrivateMessages(box: 'inbox' | 'outbox', before?: string): Promise<PrivateMessage[]> {
  const qs = new URLSearchParams({ box });
  if (before) qs.set('before', before);
  const result = await authFetch<{ messages: PrivateMessage[] }>(`/private-messages?${qs}`, await token());
  return result.messages ?? [];
}

export async function getPrivateMessage(id: string): Promise<PrivateMessage> {
  const result = await authFetch<{ message: PrivateMessage }>(`/private-messages/${encodeURIComponent(id)}`, await token());
  return result.message;
}

export async function getMessagingSettings(creatorId: string): Promise<{ enabled: boolean; can_message: boolean; price: number; blocked?: boolean; subscribed?: boolean }> {
  return authFetch(`/creators/${encodeURIComponent(creatorId)}/messaging-settings`, await token());
}

export async function sendPrivateMessage(input: { recipientId: string; body: string; idempotencyKey: string; attachments?: Array<{ media_id: string; media_type: 'image' | 'video' | 'file' }> }) {
  return authFetch<{ message: PrivateMessage; balance: number; alreadyExisted: boolean }>('/private-messages', await token(), {
    method: 'POST',
    body: JSON.stringify({ recipient_id: input.recipientId, body: input.body, idempotency_key: input.idempotencyKey, attachments: input.attachments }),
  });
}

export async function replyToPrivateMessage(id: string, body: string, attachments?: Array<{ media_id: string; media_type: 'image' | 'video' | 'file'; price?: number }>) {
  return authFetch<{ message: PrivateMessage }>(`/private-messages/${encodeURIComponent(id)}`, await token(), {
    method: 'POST',
    body: JSON.stringify({ body, attachments }),
  });
}

export async function markPrivateMessageRead(id: string) {
  return authFetch(`/private-messages/${encodeURIComponent(id)}/read`, await token(), { method: 'POST' });
}

export async function purchasePrivateAttachment(id: string) {
  return authFetch<{ attachment: Attachment; balance: number }>(`/private-message-attachments/${encodeURIComponent(id)}/purchase`, await token(), { method: 'POST' });
}
