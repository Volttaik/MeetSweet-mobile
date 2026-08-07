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
  mediaType: 'image' | 'video' | 'audio' | 'document' | null;
  /** Duration in seconds — only present for audio messages */
  audioDuration?: number;
  /** File name — only present for document messages */
  fileName?: string;
  /** File size in bytes — only present for document messages */
  fileSize?: number;
  /** MIME type — for documents */
  mimeType?: string;
  isDeleted: boolean;
  /** Whether this message has been edited by the sender */
  isEdited?: boolean;
  /** Optional caption for media messages */
  caption?: string;
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

function inferMediaType(raw: any): ChatMessage['mediaType'] {
  // Check explicit media_type field (sent by client on create)
  const explicit = raw.mediaType ?? raw.media_type;
  if (explicit === 'image' || explicit === 'video' || explicit === 'audio' || explicit === 'document') {
    return explicit;
  }
  // Backend stores message category as `type`: "text" | "media".
  // When type==="media" we fall through to URL-based inference below.
  // No early return for "text"/"media" — they are not media-type values.
  const mediaUrl = raw.mediaUrl ?? raw.media_url ?? '';
  if (!mediaUrl) return null;
  const source = String(mediaUrl).toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|webp|gif|heic)$/.test(source)) return 'image';
  if (/\.(mp4|mov|m4v|webm|3gp|quicktime)$/.test(source)) return 'video';
  if (/\.(mp3|m4a|wav|ogg|oga|webm)$/.test(source)) return 'audio';
  // If URL has no recognisable extension but the message category is "media",
  // default to image so the card renders instead of showing nothing.
  if (raw.type === 'media') return 'image';
  return null;
}

// ─── Normalizers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeConversation(raw: any): Conversation {
  // Backend returns snake_case `other_user`; camelCase `otherUser` is a fallback
  // for any future normalised responses.
  const ou = raw.other_user ?? raw.otherUser ?? null;
  return {
    id: raw.id,
    lastMessageBody: raw.lastMessageBody ?? raw.last_message_body ?? null,
    lastMessageAt: raw.lastMessageAt ?? raw.last_message_at ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    isMuted: raw.isMuted ?? raw.is_muted ?? false,
    isArchived: raw.isArchived ?? raw.is_archived ?? false,
    unreadCount: raw.unreadCount ?? raw.unread_count ?? 0,
    otherUser: ou
      ? {
          id: ou.id,
          name: ou.name ?? ou.full_name ?? '',
          username: ou.username ?? '',
          avatarUrl: ou.avatarUrl ?? ou.avatar_url ?? null,
          isVerified: ou.isVerified ?? ou.is_verified ?? false,
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
    mediaType: inferMediaType(raw),
    audioDuration: raw.audioDuration ?? raw.audio_duration ?? undefined,
    fileName: raw.fileName ?? raw.file_name ?? undefined,
    fileSize: raw.fileSize ?? raw.file_size ?? undefined,
    mimeType: raw.mimeType ?? raw.mime_type ?? undefined,
    isDeleted: raw.isDeleted ?? raw.is_deleted ?? raw.is_recalled ?? false,
    isEdited: raw.isEdited ?? raw.is_edited ?? false,
    caption: raw.caption ?? undefined,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    sender: raw.sender
      ? {
          id: raw.sender.id,
          name: raw.sender.name ?? raw.sender.full_name ?? '',
          username: raw.sender.username ?? '',
          avatarUrl: raw.sender.avatarUrl ?? raw.sender.avatar_url ?? null,
        }
      : { id: '', name: 'Unknown', username: '', avatarUrl: null },
    isOwn: raw.isOwn ?? raw.is_own ?? false,
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
  // Backend schema: { user_id: string } (snake_case)
  const raw = await apiFetch<{ conversation_id?: string; conversationId?: string; created?: boolean }>(
    '/conversations',
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ user_id: userId }),
    },
  );
  return {
    conversationId: raw?.conversation_id ?? raw?.conversationId ?? '',
    created: raw?.created ?? true,
  };
}

export async function getMessages(
  conversationId: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const qs = before ? `?before=${encodeURIComponent(before)}` : '';
  const raw = await apiFetch<{ messages: unknown[]; hasMore?: boolean; has_more?: boolean }>(
    `/conversations/${conversationId}/messages${qs}`,
    { headers: authHeader(token) },
  );
  return {
    messages: Array.isArray(raw?.messages) ? raw.messages.map(normalizeMessage) : [],
    hasMore: raw?.hasMore ?? raw?.has_more ?? false,
  };
}

export async function sendMessage(
  conversationId: string,
  body?: string,
  mediaUrl?: string,
  mediaType?: string,
  opts?: {
    caption?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    audioDuration?: number;
    /** ID of the message being replied to — sent as reply_to_id */
    replyToId?: string;
  },
): Promise<{ message: ChatMessage }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  // Backend accepts "image" | "video" | "audio" | "document" — send exactly what was given.
  // Only coerce truly unknown types to null.
  const wireMediaType =
    mediaType === 'image' || mediaType === 'video' || mediaType === 'audio' || mediaType === 'document'
      ? mediaType
      : null;
  const raw = await apiFetch<{ message: unknown }>(
    `/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({
        body,
        media_url: mediaUrl,
        media_type: wireMediaType,
        ...(opts?.replyToId ? { reply_to_id: opts.replyToId } : {}),
      }),
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
  // Spec: DELETE /messages/:id — recall/delete own message
  await apiFetch(`/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const token = await getToken();
  if (!token) return; // silently skip if not authenticated
  // Spec: POST /api/messages/conversations/:conversationId/read
  await apiFetch(`/messages/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: authHeader(token),
  }).catch(() => {
    // Silently fail — read receipts are best-effort
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

export async function deleteConversation(conversationId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function clearConversation(conversationId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/conversations/${conversationId}/clear`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function toggleReaction(messageId: string, emoji: string): Promise<{ reactions: Array<{ emoji: string; userIds: string[] }> }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ emoji }),
  });
}

export async function muteConversation(conversationId: string, muted: boolean): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/conversations/${conversationId}/mute`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ muted }),
  });
}
