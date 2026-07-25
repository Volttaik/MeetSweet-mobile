import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

// Re-export searchUsers so the Messages screen can import it from one place
export { searchUsers } from './users';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ConversationUser {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface Conversation {
  id: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
  otherUser: ConversationUser;
}

export interface ChatMessage {
  id: string;
  body: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  isDeleted: boolean;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
  };
  isOwn: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ─── Normalizers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeConversation(raw: any): Conversation {
  return {
    id: raw.id,
    lastMessageBody: raw.lastMessageBody ?? raw.last_message_body ?? null,
    lastMessageAt: raw.lastMessageAt ?? raw.last_message_at ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    isMuted: raw.isMuted ?? raw.is_muted ?? false,
    isArchived: raw.isArchived ?? raw.is_archived ?? false,
    unreadCount: raw.unreadCount ?? raw.unread_count ?? 0,
    otherUser: raw.otherUser
      ? {
          id: raw.otherUser.id,
          name: raw.otherUser.name ?? raw.otherUser.full_name ?? '',
          username: raw.otherUser.username ?? '',
          avatarUrl: raw.otherUser.avatarUrl ?? raw.otherUser.avatar_url ?? null,
          isVerified: raw.otherUser.isVerified ?? raw.otherUser.is_verified ?? false,
        }
      : { id: '', name: 'Unknown', username: '', avatarUrl: null, isVerified: false },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMessage(raw: any): ChatMessage {
  return {
    id: raw.id,
    body: raw.body ?? null,
    mediaUrl: raw.mediaUrl ?? raw.media_url ?? null,
    mediaType: raw.mediaType ?? raw.media_type ?? null,
    isDeleted: raw.isDeleted ?? raw.is_deleted ?? false,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    sender: raw.sender
      ? {
          id: raw.sender.id,
          name: raw.sender.name ?? raw.sender.full_name ?? '',
          username: raw.sender.username ?? '',
          avatarUrl: raw.sender.avatarUrl ?? raw.sender.avatar_url ?? null,
        }
      : { id: '', name: 'Unknown', username: '', avatarUrl: null },
    isOwn: raw.isOwn ?? false,
  };
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export async function getConversations(
  tab: 'all' | 'archived' = 'all',
): Promise<{ conversations: Conversation[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ conversations: unknown[] }>(
    `/conversations?tab=${tab}`,
    { headers: authHeader(token) },
  );
  return {
    conversations: Array.isArray(raw?.conversations)
      ? raw.conversations.map(normalizeConversation)
      : [],
  };
}

export async function createConversation(
  userId: string,
): Promise<{ conversationId: string; created: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/conversations', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ userId }),
  });
}

export async function getMessages(
  conversationId: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const qs = before ? `?before=${encodeURIComponent(before)}` : '';
  const raw = await apiFetch<{ messages: unknown[]; hasMore: boolean }>(
    `/conversations/${conversationId}/messages${qs}`,
    { headers: authHeader(token) },
  );
  return {
    messages: Array.isArray(raw?.messages) ? raw.messages.map(normalizeMessage) : [],
    hasMore: raw?.hasMore ?? false,
  };
}

export async function sendMessage(
  conversationId: string,
  body?: string,
  mediaUrl?: string,
  mediaType?: string,
): Promise<{ message: ChatMessage }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ message: unknown }>(
    `/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ body, mediaUrl, mediaType }),
    },
  );
  return { message: normalizeMessage(raw?.message ?? {}) };
}

export async function deleteMessage(messageId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function editMessage(messageId: string, body: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ body }),
  });
}

export async function recallMessage(messageId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/messages/${messageId}/recall`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/messages/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function archiveConversation(
  conversationId: string,
  archived: boolean,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/conversations/${conversationId}/archive`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ archived }),
  });
}
