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
 * FOUR IDENTIFIERS — never confuse them:
 *
 *   chatRoomId  — the permanent room (ROOM_123). ONE per user pair. Both users
 *                 share the same chatRoomId. Server-owned.
 *   contextId   — identifies ONE participant's context inside the room
 *                 (CONTEXT_A for USER_A, CONTEXT_B for USER_B in ROOM_123).
 *                 It does NOT contain messages and does NOT authorize them; it
 *                 only names the context. Server-owned, per (room, user).
 *   contextAuth — the SERVER-CONTROLLED message membership map for a context:
 *                 the set of messageIds currently belonging to that user's
 *                 context (CONTEXT_A → [MSG_001, MSG_002, ...]). NOT a room id,
 *                 NOT a context id, NOT a login token. Mobile only mirrors it.
 *   messageId   — identifies one exact message (MSG_001). Server-owned.
 *
 * REQUIRED BACKEND CONTRACT (backend is being migrated after mobile; see
 * docs/backend-requirements.md for the full request/response spec):
 *
 *   POST   /api/chat-rooms                     { participant_id }
 *          → { chat_room_id, created, context_id, participants, other_user, ... }
 *   GET    /api/chat-rooms?tab=all|archived    → { chat_rooms: [...] }
 *   GET    /api/chat-rooms/:chatRoomId         → { chat_room: {...} }
 *   GET    /api/chat-rooms/:chatRoomId/context?since=<marker>
 *          → { chat_room_id, context_id, context_auth:
 *               { message_ids?, removed_message_ids?, marker? } }
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
 * around the room model. The context endpoint (/context) is the ONE exception:
 * it returns null when not yet shipped so the existing message flow keeps
 * working during the migration; context sync is additive, never required.
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
  /** The current user's context id inside this room (CONTEXT_A / CONTEXT_B).
   *  Server-assigned per (room, user); identifies the requesting participant's
   *  context. The mobile app never generates it. null until the server returns
   *  one. The OTHER participant has a different contextId in the same room. */
  contextId?: string | null;
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
  /** The current user's context inside this room (CONTEXT_A / CONTEXT_B).
   *  Server-assigned; identifies WHICH participant's context this message row
   *  belongs to in the local replica. The mobile app never generates it. */
  contextId?: string | null;
  body: string | null;
  mediaUrl: string | null;
  /** MESSAGE TYPE — how the item behaves as a message (image / video / audio /
   *  document). This is the message category, NOT the on-disk file format.
   *  The on-disk file format is `fileType`. */
  mediaType: 'image' | 'video' | 'audio' | 'document' | null;
  /** FILE TYPE — the actual stored file format (e.g. 'jpeg', 'png', 'mp4',
   *  'mov', 'mp3', 'm4a', 'pdf', 'docx', 'zip', ...). Derived from mimeType /
   *  mediaUrl so the renderer and storage layer never have to guess. null for
   *  pure-text messages. */
  fileType?: string | null;
  /** True when an `audio` message is a VOICE NOTE (inline waveform bubble)
   *  rather than an uploaded audio FILE attachment (rendered as a file card).
   *  Preserves the message-type-vs-file-type distinction the Auth Tree needs:
   *  both are `mediaType: 'audio'`, but they require different UI behavior. */
  isVoiceNote?: boolean;
  audioDuration?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  /** Persistent local file URI for this message's media (Expo FileSystem).
   *  Populated by the chat-media layer; null on web or when not yet downloaded. */
  localUri?: string | null;
  isDeleted: boolean;
  isEdited?: boolean;
  caption?: string;
  createdAt: string;
  sender: RoomParticipant;
  isOwn: boolean;
  /** Reaction state for this message (server-authoritative). Each entry maps
   *  an emoji to the user ids that reacted. Stays associated with this messageId. */
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  /** The message this one replies to/quotes. Server stores the relationship;
   *  mobile only renders it. `id` is the quoted message's messageId. */
  replyTo?: {
    id: string;
    body?: string | null;
    mediaType?: 'image' | 'video' | 'audio' | 'document' | null;
    /** Remote URL of the quoted message's media, when the server includes it.
     *  Used only for the reply-preview thumbnail. Optional because not every
     *  backend payload carries the quoted media URL. */
    mediaUrl?: string | null;
    senderName?: string;
  } | null;
}

/** Incremental change-check result. */
export interface RoomChanges {
  changed: boolean;
  /** Marker to pass back as `since` on the next check. */
  marker: string | null;
  /** New messages since the marker (only when `after` style fetch is used). */
  messages?: RoomMessage[];
}

/**
 * contextAuth — the SERVER-CONTROLLED message membership map for one user's
 * context inside a room. This is NOT a room id, NOT a context id, and NOT a
 * login token. It is a reference index: the set of messageIds that currently
 * belong to this user's context (CONTEXT_A's tree of MSG_001/002/...).
 *
 * - `messageIds`: the full/snapshot membership (authoritative when present).
 * - `removedMessageIds`: incremental removals the server is telling the client
 *   to drop from the local replica (e.g. "remove MSG_002 from User A's context"
 *   on delete-for-me / delete-for-everyone / clear).
 * - `marker`: optional cursor for incremental sync of the membership itself.
 *
 * The mobile app must NEVER invent or modify the authoritative version of this
 * structure — it only mirrors the server's response into SQLite.
 */
export interface ContextAuth {
  /** Snapshot of messageIds currently in this context (when the server sends a
   *  full membership list). */
  messageIds?: string[];
  /** Incremental removals to apply to the local replica. */
  removedMessageIds?: string[];
  /** Cursor for incremental membership sync; pass back on the next request. */
  marker?: string | null;
}

/**
 * RoomContext — the requesting user's context inside a Chat Room.
 *
 *   chatRoomId  = ROOM_123   (the permanent room — shared by both users)
 *   contextId   = CONTEXT_A  (this user's context inside ROOM_123)
 *   userId      = USER_A     (the requesting participant)
 *   contextAuth = { messageIds: [MSG_001, MSG_002, ...] }
 *
 * The other participant (USER_B) has their OWN contextId (CONTEXT_B) and their
 * OWN contextAuth for the same ROOM_123. The local SQLite replica stores one
 * RoomContext per (chatRoomId, currentUserId) so the two participants' contexts
 * never collide on a shared device.
 */
export interface RoomContext {
  chatRoomId: string;
  contextId: string | null;
  userId: string;
  contextAuth: ContextAuth;
  updatedAt?: string | null;
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
  /** Client-side Auth Tree metadata — preserved through SQLite round-trip so
   *  the renderer can distinguish message type from file type without re-deriving.
   *  The backend ignores unknown fields; mobile re-reads them from the response. */
  fileType?: string | null;
  isVoiceNote?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { getAccessToken } from '@/lib/session-storage';

async function getToken(): Promise<string | null> {
  return getAccessToken();
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
    // Server-assigned context id for the REQUESTING user (this user's context
    // inside the room). The other participant gets a different contextId.
    contextId:
      source.context_id ??
      source.contextId ??
      null,
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

/**
 * Derive the on-disk FILE TYPE (lowercase extension) for a message from its
 * MIME type and/or media URL. This is the actual stored file format — distinct
 * from `mediaType`, which is the message category. Returns null when there's no
 * media. Exported so the chat-media layer and send paths can reuse it.
 */
export function deriveFileType(
  mime?: string | null,
  url?: string | null,
): string | null {
  const m = (mime ?? '').toLowerCase();
  if (m) {
    // Common MIME → ext map (subset of chat-media's mimeToExt, kept here so the
    // Auth Tree metadata is derivable without importing expo-file-system).
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/heic': 'heic',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/3gpp': '3gp',
      'video/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'm4a',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'aac',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'application/x-zip-compressed': 'zip',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'text/plain': 'txt',
    };
    if (map[m]) return map[m];
  }
  const u = (url ?? '').split('?')[0].split('#')[0];
  if (u) {
    const match = u.toLowerCase().match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) return match[1];
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMessage(raw: any): RoomMessage {
  const mediaUrl = raw.mediaUrl ?? raw.media_url ?? null;
  const mimeType = raw.mimeType ?? raw.mime_type ?? undefined;
  const mediaType = inferMediaType(raw);
  return {
    id: raw.id,
    chatRoomId: raw.chatRoomId ?? raw.chat_room_id ?? '',
    // The context this message belongs to in the requesting user's replica.
    // Server-assigned; mobile never generates it.
    contextId: raw.contextId ?? raw.context_id ?? null,
    body: raw.body ?? null,
    mediaUrl,
    mediaType,
    // FILE TYPE — the actual stored file format, derived from mime/url. Kept
    // on the Auth Tree metadata so renderers/storage never guess from a URL.
    fileType: raw.fileType ?? raw.file_type ?? deriveFileType(mimeType, mediaUrl),
    // isVoiceNote: a voice-note message renders as an inline waveform bubble;
    // an uploaded audio FILE attachment renders as a file card. The backend
    // may carry this explicitly; otherwise we infer: an audio message with a
    // duration and no fileName is a voice note, an audio message with a
    // fileName is a file attachment.
    isVoiceNote:
      raw.isVoiceNote ??
      raw.is_voice_note ??
      (mediaType === 'audio'
        ? !(raw.fileName ?? raw.file_name) && !!(raw.audioDuration ?? raw.audio_duration)
        : undefined),
    audioDuration: raw.audioDuration ?? raw.audio_duration ?? undefined,
    fileName: raw.fileName ?? raw.file_name ?? undefined,
    fileSize: raw.fileSize ?? raw.file_size ?? undefined,
    mimeType,
    localUri: raw.localUri ?? raw.local_uri ?? null,
    isDeleted: raw.isDeleted ?? raw.is_deleted ?? raw.is_recalled ?? false,
    isEdited: raw.isEdited ?? raw.is_edited ?? false,
    caption: raw.caption ?? undefined,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    sender: raw.sender
      ? normalizeParticipant(raw.sender)
      : { id: '', name: 'Unknown', username: '', avatarUrl: null },
    isOwn: raw.isOwn ?? raw.is_own ?? false,
    reactions: normalizeReactions(raw.reactions),
    replyTo: normalizeReplyTo(raw.reply_to ?? raw.replyTo),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReactions(raw: any): Array<{ emoji: string; userIds: string[] }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((r: any) => ({
      emoji: String(r?.emoji ?? ''),
      userIds: Array.isArray(r?.user_ids)
        ? r.user_ids.map(String)
        : Array.isArray(r?.userIds)
          ? r.userIds.map(String)
          : [],
    }))
    .filter((r: { emoji: string }) => r.emoji);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReplyTo(raw: any): RoomMessage['replyTo'] {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ?? raw.message_id ?? raw.messageId;
  if (!id) return null;
  return {
    id: String(id),
    body: raw.body ?? raw.text ?? null,
    mediaType: raw.media_type ?? raw.mediaType ?? null,
    mediaUrl: raw.media_url ?? raw.mediaUrl ?? null,
    senderName: raw.sender_name ?? raw.senderName ?? raw.sender?.name ?? undefined,
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
 * Fetch the requesting user's context for a room: contextId + contextAuth
 * (the server-controlled message membership map for THIS user's context).
 *
 *   GET /api/chat-rooms/:chatRoomId/context
 *     → { chat_room_id, context_id, context_auth: { message_ids?, removed_message_ids?, marker? } }
 *
 * This is what the server uses to say, for example, "remove MSG_002 from User
 * A's context". The mobile app mirrors the result into SQLite and removes the
 * referenced local message rows — it never invents or modifies the
 * authoritative membership.
 *
 * `since` is an optional membership cursor passed back from a previous
 * `contextAuth.marker` for incremental sync.
 *
 * Returns null when the backend has not shipped the endpoint yet (404/405) so
 * the existing message flow keeps working unchanged during the migration.
 */
export async function getRoomContext(
  chatRoomId: string,
  since?: string | null,
): Promise<RoomContext | null> {
  const token = await getToken();
  if (!token) return null;
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  try {
    const raw = await apiFetch<Record<string, unknown>>(
      `/chat-rooms/${encodeURIComponent(chatRoomId)}/context${qs}`,
      { headers: authHeader(token) },
    );
    return normalizeRoomContext(raw, chatRoomId);
  } catch (err: any) {
    // Only degrade gracefully if endpoint is not found (404/405)
    if (err?.status === 404 || err?.status === 405 || err?.statusCode === 404 || err?.statusCode === 405) {
      return null;
    }
    // For network/auth failures, log warning and return null so message loading can proceed safely
    console.warn('[room-service] getRoomContext request error:', err);
    return null;
  }
}

/** Parse the server's context payload into a RoomContext. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRoomContext(raw: any, chatRoomId: string): RoomContext {
  const auth =
    raw?.context_auth ??
    raw?.contextAuth ??
    raw?.auth ??
    {};
  const messageIds =
    auth.message_ids ??
    auth.messageIds ??
    (Array.isArray(auth) ? auth : undefined);
  const removedMessageIds =
    auth.removed_message_ids ??
    auth.removedMessageIds ??
    undefined;
  return {
    chatRoomId: raw?.chat_room_id ?? raw?.chatRoomId ?? chatRoomId,
    contextId: raw?.context_id ?? raw?.contextId ?? null,
    userId: raw?.user_id ?? raw?.userId ?? '',
    contextAuth: {
      messageIds: Array.isArray(messageIds) ? messageIds.map(String) : undefined,
      removedMessageIds: Array.isArray(removedMessageIds)
        ? removedMessageIds.map(String)
        : undefined,
      marker: auth.marker ?? null,
    },
    updatedAt: raw?.updated_at ?? raw?.updatedAt ?? null,
  };
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
        file_type: payload.fileType,
        is_voice_note: payload.isVoiceNote,
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
 * Delete/recall a message inside a room.
 *
 * `scope` tells the backend which Context Auth tree(s) to update:
 *   - 'me'       → remove the message from the CURRENT user's context only.
 *                  The other participant's context is untouched. (Delete for me)
 *   - 'everyone' → remove/deactivate the message for BOTH users' contexts.
 *                  (Delete for everyone)
 *
 * The backend performs the correct operation on the appropriate Context Auth
 * tree and returns success; mobile then mirrors the result into SQLite. Mobile
 * never assumes success until the server confirms it.
 *
 * DELETE /api/chat-rooms/:chatRoomId/messages/:messageId?scope=me|everyone
 */
export async function deleteRoomMessage(
  chatRoomId: string,
  messageId: string,
  scope: 'me' | 'everyone' = 'me',
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  await apiFetch(
    `/chat-rooms/${encodeURIComponent(chatRoomId)}/messages/${messageId}?scope=${scope}`,
    {
      method: 'DELETE',
      headers: authHeader(token),
    },
  );
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