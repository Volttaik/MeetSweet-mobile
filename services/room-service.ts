/**
 * Room Service — centralized Chat Room client (USER → ROOM → CONTENT).
 *
 * A Chat Room is a private 1-to-1 messaging container. The BACKEND owns room
 * creation and the authoritative chatRoomId — mobile NEVER generates a room ID.
 * Mobile provides a participantId; the backend returns the existing room or
 * creates a new one. There is exactly ONE room between two users (A+B == B+A) —
 * the backend deduplicates. All content (messages, media, read state, clear
 * state) belongs to the ROOM.
 *
 * REQUIRED BACKEND CONTRACT (backend is being migrated after mobile; see
 * docs/backend-requirements.md for the full request/response spec):
 *
 *   POST   /api/chat-rooms                     { participant_id }
 *          → { chat_room_id, created, participants, other_user, ... }
 *   GET    /api/chat-rooms?tab=all|archived    → { chat_rooms: [...] }
 *   GET    /api/chat-rooms/:chatRoomId         → { chat_room: {...} }
 *   GET    /api/chat-rooms/:chatRoomId/messages?before=&after=
 *          → { messages: [...], has_more }
 *   POST   /api/chat-rooms/:chatRoomId/messages            → { message: {...} }
 *   POST   /api/chat-rooms/:chatRoomId/read
 *   POST   /api/chat-rooms/:chatRoomId/clear
 *   GET    /api/chat-rooms/:chatRoomId/changes?since=<marker>
 *          → { changed, marker, messages?: [...] }
 *   DELETE /api/chat-rooms/:chatRoomId/messages/:messageId
 *   PATCH  /api/chat-rooms/:chatRoomId/messages/:messageId  { body }
 *   POST   /api/chat-rooms/:chatRoomId/messages/:messageId/reactions  { emoji }
 *   PUT    /api/chat-rooms/:chatRoomId/mute       { muted }
 *   PUT    /api/chat-rooms/:chatRoomId/archive    { archived }
 *   DELETE /api/chat-rooms/:chatRoomId
 *
 * Message POST body: { body, media_url, media_type, caption, file_name,
 *   file_size, mime_type, audio_duration, reply_to_id }
 *
 * The mobile app calls these room endpoints directly — there is NO fallback to
 * a conversation architecture. If the backend has not shipped a route yet, the
 * request fails loudly (surfaced to the user) rather than silently routing
 * around the room model.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A user as seen inside a room (participant). */
export interface RoomParticipant {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  isVerified?: boolean;
  isCreator?: boolean;
}

/** Chat Room row — used by the chat list and the chat header. */
export interface ChatRoom {
  chatRoomId: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
  /** The OTHER participant, resolved by the backend for the current user. */
  otherUser: RoomParticipant;
  /** All participants in the room — the chat header resolves the other user
   *  from this + currentUser.id, never from navigation params. */
  participants: RoomParticipant[];
  /** Change marker — backend increments this when room content changes. */
  updatedAt?: string;
  /** Latest message id — used as an incremental marker for polling. */
  lastMessageId?: string | null;
  /** Media type of the latest message (chat list contextual preview). */
  lastMessageMediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  /** Sender id of the latest message (chat list "You:" prefix). */
  lastMessageSenderId?: string | null;
}

/** A message inside a Chat Room. Destination is chatRoomId; sender is author. */
export interface RoomMessage {
  id: string;
  chatRoomId: string;
  body: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'document' | null;
  audioDuration?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  isDeleted: boolean;
  isEdited?: boolean;
  caption?: string;
  createdAt: string;
  sender: RoomParticipant;
  isOwn: boolean;
}

/** Incremental change-check result. */
export interface RoomChanges {
  changed: boolean;
  /** Marker to pass back as `since` on the next check. */
  marker: string | null;
  /** New messages since the marker (only when `after` style fetch is used). */
  messages?: RoomMessage[];
}

/** Payload for sending a message into a room. */
export interface SendRoomMessagePayload {
  body?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  audioDuration?: number;
  replyToId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('@ms_access_token');
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeParticipant(raw: any): RoomParticipant {
  return {
    id: raw?.id ?? raw?.user_id ?? '',
    name: raw?.name ?? raw?.full_name ?? raw?.display_name ?? raw?.displayName ?? '',
    username: raw?.username ?? '',
    avatarUrl: raw?.avatarUrl ?? raw?.avatar_url ?? raw?.profile_picture_url ?? null,
    isVerified: raw?.isVerified ?? raw?.is_verified ?? false,
    isCreator: raw?.isCreator ?? raw?.is_creator ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeChatRoom(raw: any): ChatRoom {
  const source = raw?.chat_room ?? raw ?? {};
  const ou =
    source.other_user ??
    source.otherUser ??
    source.participant ??
    null;
  const lastMessage = source.last_message ?? source.lastMessage ?? null;
  const participants = Array.isArray(source.participants)
    ? source.participants.map(normalizeParticipant)
    : ou
      ? [normalizeParticipant(ou)]
      : [];

  return {
    chatRoomId:
      source.chat_room_id ??
      source.chatRoomId ??
      source.id ??
      '',
    lastMessageBody:
      source.lastMessageBody ??
      source.last_message_body ??
      lastMessage?.body ??
      null,
    lastMessageAt:
      source.lastMessageAt ??
      source.last_message_at ??
      lastMessage?.created_at ??
      lastMessage?.createdAt ??
      null,
    createdAt: source.createdAt ?? source.created_at ?? new Date().toISOString(),
    isMuted: source.isMuted ?? source.is_muted ?? false,
    isArchived: source.isArchived ?? source.is_archived ?? false,
    unreadCount: source.unreadCount ?? source.unread_count ?? 0,
    otherUser: ou
      ? normalizeParticipant(ou)
      : { id: '', name: 'Unknown', username: '', avatarUrl: null, isVerified: false },
    participants,
    updatedAt: source.updatedAt ?? source.updated_at ?? undefined,
    lastMessageId: source.lastMessageId ?? source.last_message_id ?? null,
    lastMessageMediaType:
      source.lastMessageMediaType ??
      source.last_message_media_type ??
      lastMessage?.media_type ??
      null,
    lastMessageSenderId:
      source.lastMessageSenderId ??
      source.last_message_sender_id ??
      lastMessage?.sender_id ??
      null,
  };
}

function inferMediaType(raw: any): RoomMessage['mediaType'] {
  const explicit = raw.mediaType ?? raw.media_type;
  if (explicit === 'image' || explicit === 'video' || explicit === 'audio' || explicit === 'document') {
    return explicit;
  }
  const mediaUrl = raw.mediaUrl ?? raw.media_url ?? '';
  if (!mediaUrl) return null;
  const source = String(mediaUrl).toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|webp|gif|heic)$/.test(source)) return 'image';
  if (/\.(mp4|mov|m4v|webm|3gp|quicktime)$/.test(source)) return 'video';
  if (/\.(mp3|m4a|wav|ogg|oga)$/.test(source)) return 'audio';
  if (raw.type === 'media') return 'image';
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMessage(raw: any): RoomMessage {
  return {
    id: raw.id,
    chatRoomId: raw.chatRoomId ?? raw.chat_room_id ?? '',
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
      ? normalizeParticipant(raw.sender)
      : { id: '', name: 'Unknown', username: '', avatarUrl: null },
    isOwn: raw.isOwn ?? raw.is_own ?? false,
  };
}

// ─── Chat Room API ────────────────────────────────────────────────────────────

/**
 * Open (or create) the chat room for a participant.
 * POST /api/chat-rooms { participant_id }
 * Backend returns the authoritative chatRoomId (existing OR new — one room per
 * pair, never duplicates). Mobile never generates the room ID.
 */
export async function getOrCreateChatRoom(
  participantId: string,
): Promise<{ chatRoomId: string; created: boolean; chatRoom: ChatRoom }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  if (!participantId) {
    throw new Error('A recipient user ID is required to open a chat room.');
  }
  const raw = await apiFetch<unknown>('/chat-rooms', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ participant_id: participantId }),
  });
  const chatRoom = normalizeChatRoom(raw);
  if (!chatRoom.chatRoomId) {
    throw new Error('Chat room was not created: the server returned no chat_room_id.');
  }
  return {
    chatRoomId: chatRoom.chatRoomId,
    created: (raw as { created?: boolean })?.created ?? true,
    chatRoom,
  };
}

/**
 * List chat rooms (chat list source). Lightweight metadata only — the backend
 * must NOT return full message bodies for every room.
 * GET /api/chat-rooms?tab=all|archived
 */
export async function getChatRoomList(tab: 'all' | 'archived' = 'all'): Promise<{ chatRooms: ChatRoom[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ chat_rooms?: unknown[]; chatRooms?: unknown[] }>(
    `/chat-rooms?tab=${tab}`,
    { headers: authHeader(token) },
  );
  const list = Array.isArray(raw?.chat_rooms) ? raw.chat_rooms : Array.isArray(raw?.chatRooms) ? raw.chatRooms : [];
  return { chatRooms: list.map(normalizeChatRoom) };
}

/**
 * GET a single chat room — the authoritative source for participants.
 * The chat screen resolves the other participant from THIS, never from
 * navigation params.
 * GET /api/chat-rooms/:chatRoomId
 */
export async function getChatRoom(chatRoomId: string): Promise<ChatRoom> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<unknown>(`/chat-rooms/${encodeURIComponent(chatRoomId)}`, {
    headers: authHeader(token),
  });
  return normalizeChatRoom(raw);
}

/**
 * GET messages for a room. `before` = older pagination cursor,
 * `after` = incremental fetch cursor (see checkRoomChanges).
 * GET /api/chat-rooms/:chatRoomId/messages?before=&after=
 */
export async function getRoomMessages(
  chatRoomId: string,
  opts?: { before?: string; after?: string },
): Promise<{ messages: RoomMessage[]; hasMore: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const params: string[] = [];
  if (opts?.before) params.push(`before=${encodeURIComponent(opts.before)}`);
  if (opts?.after) params.push(`after=${encodeURIComponent(opts.after)}`);
  const qs = params.length > 0 ? `?${params.join('&')}` : '';
  const raw = await apiFetch<{ messages: unknown[]; hasMore?: boolean; has_more?: boolean }>(
    `/chat-rooms/${encodeURIComponent(chatRoomId)}/messages${qs}`,
    { headers: authHeader(token) },
  );
  return {
    messages: Array.isArray(raw?.messages) ? raw.messages.map(normalizeMessage) : [],
    hasMore: raw?.hasMore ?? raw?.has_more ?? false,
  };
}

/**
 * Send a message into a room. Messages store author + chatRoomId destination.
 * POST /api/chat-rooms/:chatRoomId/messages
 */
export async function sendRoomMessage(
  chatRoomId: string,
  payload: SendRoomMessagePayload,
): Promise<{ message: RoomMessage }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const raw = await apiFetch<{ message: unknown }>(
    `/chat-rooms/${encodeURIComponent(chatRoomId)}/messages`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({
        body: payload.body,
        media_url: payload.mediaUrl,
        media_type: payload.mediaType,
        caption: payload.caption,
        file_name: payload.fileName,
        file_size: payload.fileSize,
        mime_type: payload.mimeType,
        audio_duration: payload.audioDuration,
        ...(payload.replyToId ? { reply_to_id: payload.replyToId } : {}),
      }),
    },
  );
  return { message: normalizeMessage(raw?.message ?? {}) };
}

/**
 * Mark the current user's unread state as read FOR THIS ROOM.
 * POST /api/chat-rooms/:chatRoomId/read
 */
export async function markRoomRead(chatRoomId: string): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}/read`, {
    method: 'POST',
    headers: authHeader(token),
  }).catch(() => {
    // Read receipts are best-effort
  });
}

/**
 * Clear the current user's chat state for this room. The ROOM remains the
 * permanent container — the relationship and the other user are NOT deleted.
 * POST /api/chat-rooms/:chatRoomId/clear
 */
export async function clearChatRoom(chatRoomId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}/clear`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

/**
 * Lightweight change check for ONE room. Serverless philosophy: no typing
 * indicators, no presence, no live cursor — only the currently-viewed room is
 * polled, and only this cheap endpoint is hit. Returns whether new content
 * exists since the caller's marker (lastMessageId / updatedAt).
 * GET /api/chat-rooms/:chatRoomId/changes?since=<marker>
 */
export async function checkRoomChanges(
  chatRoomId: string,
  marker: string | null,
): Promise<RoomChanges> {
  const token = await getToken();
  if (!token) return { changed: false, marker };

  const qs = marker ? `?since=${encodeURIComponent(marker)}` : '';
  const raw = await apiFetch<RoomChanges & { has_changes?: boolean }>(
    `/chat-rooms/${encodeURIComponent(chatRoomId)}/changes${qs}`,
    { headers: authHeader(token) },
  ).catch((): RoomChanges => ({ changed: false, marker }));

  const changed = raw?.changed ?? (raw as { has_changes?: boolean }).has_changes ?? false;
  return {
    changed: Boolean(changed),
    marker: raw?.marker ?? marker,
    messages: raw?.messages ?? undefined,
  };
}

// ─── Room-scoped message lifecycle (per-message ops stay under the room) ──────

/**
 * Recall/delete a message inside a room.
 * DELETE /api/chat-rooms/:chatRoomId/messages/:messageId
 */
export async function deleteRoomMessage(chatRoomId: string, messageId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

/**
 * Edit a message body inside a room.
 * PATCH /api/chat-rooms/:chatRoomId/messages/:messageId
 */
export async function editRoomMessage(chatRoomId: string, messageId: string, body: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ body }),
  });
}

/**
 * Toggle a reaction on a room message.
 * POST /api/chat-rooms/:chatRoomId/messages/:messageId/reactions
 */
export async function toggleRoomReaction(
  chatRoomId: string,
  messageId: string,
  emoji: string,
): Promise<{ reactions: Array<{ emoji: string; userIds: string[] }> }> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ emoji }),
  });
}

/**
 * Mute a room for the current user.
 * PUT /api/chat-rooms/:chatRoomId/mute
 */
export async function muteChatRoom(chatRoomId: string, muted: boolean): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}/mute`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ muted }),
  });
}

/**
 * Archive/unarchive a room for the current user.
 * PUT /api/chat-rooms/:chatRoomId/archive
 */
export async function archiveChatRoom(chatRoomId: string, archived: boolean): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}/archive`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ archived }),
  });
}

/**
 * Remove the room from the current user's chat list (does not delete the
 * other user's copy or the underlying room for the pair).
 * DELETE /api/chat-rooms/:chatRoomId
 */
export async function deleteChatRoom(chatRoomId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(`/chat-rooms/${encodeURIComponent(chatRoomId)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

// ─── Re-exported user search (room entry points use the same user search) ─────
export { searchUsers } from './users';