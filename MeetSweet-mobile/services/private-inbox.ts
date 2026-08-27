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
  status: 'sent' | 'read' | 'replied' | 'waiting';
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
  /** The thread's creator participant — only they may price attachments. */
  thread_creator_id: string | null;
  attachments: Attachment[];
  reply_count: number;
  reply: PrivateMessage | null;
  /** Full thread oldest → newest — only present on the thread endpoint. */
  thread?: PrivateMessage[];
};

export type InboxBox = 'inbox' | 'outbox' | 'waiting';

// ─── Locally-confirmed thread replies ───────────────────────────────────────
// The server emits `private_message.reply_created` for BOTH participants, and
// the open thread appends from it — but live fan-out is only guaranteed when
// the request lands on the same instance as the socket (Vercel pins a socket
// to one Function instance; durable replay only happens on reconnect). The
// sender's own device already holds the server-CONFIRMED reply (the API
// response), so we also hand it straight to the open thread through this tiny
// in-process channel — same data the event would carry, appended via the same
// dedup check, so a late server event can never duplicate it. No polling, no
// reload — the sender's media appears the moment the send confirms.
export interface ThreadReplyConfirmed {
  /** The thread root message id — matches the open thread screen's param. */
  threadId: string;
  message: PrivateMessage;
}

type ThreadReplyListener = (e: ThreadReplyConfirmed) => void;
const threadReplyListeners = new Set<ThreadReplyListener>();

/** Notify open thread screens that the server confirmed a new reply. */
export function notifyThreadReplyConfirmed(e: ThreadReplyConfirmed): void {
  threadReplyListeners.forEach((l) => {
    try {
      l(e);
    } catch {
      // A listener must never break the others.
    }
  });
}

/** Subscribe to locally-confirmed replies. Returns an unsubscribe function. */
export function onThreadReplyConfirmed(l: ThreadReplyListener): () => void {
  threadReplyListeners.add(l);
  return () => {
    threadReplyListeners.delete(l);
  };
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw new Error('Not authenticated');
  return value;
}

export async function listPrivateMessages(box: InboxBox, before?: string): Promise<PrivateMessage[]> {
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

export async function sendPrivateMessage(input: { recipientId: string; body: string; idempotencyKey: string; attachments?: Array<{ media_id: string; media_type: 'image' | 'video' | 'file'; price?: number }> }) {
  return authFetch<{ message: PrivateMessage; balance: number; alreadyExisted: boolean }>('/private-messages', await token(), {
    method: 'POST',
    body: JSON.stringify({ recipient_id: input.recipientId, body: input.body, idempotency_key: input.idempotencyKey, attachments: input.attachments }),
  });
}

/** Reply to the message `id` (any message in a thread). Either participant
 * may reply; retries with the same idempotency key never duplicate it. */
export async function replyToPrivateMessage(input: { id: string; body: string; idempotencyKey: string; attachments?: Array<{ media_id: string; media_type: 'image' | 'video' | 'file'; price?: number }> }) {
  return authFetch<{ message: PrivateMessage }>(`/private-messages/${encodeURIComponent(input.id)}`, await token(), {
    method: 'POST',
    body: JSON.stringify({ body: input.body, idempotency_key: input.idempotencyKey, attachments: input.attachments }),
  });
}

export async function markPrivateMessageRead(id: string) {
  return authFetch(`/private-messages/${encodeURIComponent(id)}/read`, await token(), { method: 'POST' });
}

export async function purchasePrivateAttachment(id: string) {
  return authFetch<{ attachment: Attachment; balance: number }>(`/private-message-attachments/${encodeURIComponent(id)}/purchase`, await token(), { method: 'POST' });
}

/**
 * Delete a thread by ownership:
 *  • the SENDER deleting removes it for BOTH participants,
 *  • the RECEIVER deleting hides it only from their own inbox.
 */
export async function deletePrivateMessage(id: string) {
  return authFetch<{ thread_id: string; deleted_for_both: boolean }>(`/private-messages/${encodeURIComponent(id)}`, await token(), { method: 'DELETE' });
}

/** Approve a waiting message into the recipient's normal inbox. */
export async function approvePrivateMessage(id: string) {
  return authFetch<{ message: PrivateMessage }>(`/private-messages/${encodeURIComponent(id)}`, await token(), { method: 'PATCH' });
}

/** Restrict a sender — their future messages queue in your Waiting section. */
export async function restrictPrivateSender(userId: string) {
  return authFetch<{ restricted: boolean }>('/private-messages/restrictions', await token(), {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

/** Allow a sender again — lifts the restriction and approves their pending messages. */
export async function allowPrivateSender(userId: string) {
  const qs = new URLSearchParams({ user_id: userId });
  return authFetch<{ restricted: boolean; approved: number }>(`/private-messages/restrictions?${qs}`, await token(), { method: 'DELETE' });
}
