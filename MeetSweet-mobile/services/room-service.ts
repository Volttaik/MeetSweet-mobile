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
 * IDENTIFIERS — never confuse them:
 *
 *   chatRoomId  — the permanent room (ROOM_123). ONE per user pair. Both users
 *                 share the same chatRoomId. Server-owned.
 *   messageId   — identifies one exact message (MSG_001). Server-owned.
 *
 * HTTP CONTRACT (initial loads + settings only):
 *
 *   POST   /api/chat-rooms                     { participant_id }
 *          → { chat_room_id, created, participants, other_user, ... }
 *   GET    /api/chat-rooms?tab=all|archived    → { chat_rooms: [...] }
 *   GET    /api/chat-rooms/:chatRoomId         → { chat_room: {...} }
 *   PUT    /api/chat-rooms/:chatRoomId/mute       { muted }
 *   PUT    /api/chat-rooms/:chatRoomId/archive    { archived }
 *   DELETE /api/chat-rooms/:chatRoomId
 *
 * SWEETSOCKET CONTRACT (all live messaging — the single source of truth):
 *
 *   Commands  chat.send | chat.history | chat.read | chat.clear
 *             message.edit | message.delete | message.reaction
 *   Events    messages:upsert | messages:update | messages:delete
 *             messages:reaction | message:read | typing:* | presence:*
 *
 * There is NO HTTP messaging path: send/edit/delete/react/read/clear and
 * history all flow through the socket. Turso is the durable source and the
 * socket keeps the screen current — WhatsApp-style. HTTP is reserved for room
 * discovery, mute/archive/delete settings, and media upload.
 *
 * Message command payload: { body, mediaUrl, mediaType, caption, fileName,
 *   fileSize, mimeType, audioDuration, replyToId }
 */

import { apiFetch } from './api';
import { realtime } from './realtime';
import { enqueueChatMessage } from './chat-outbox';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A user as seen inside a room (participant). */
export interface RoomParticipant {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  isVerified?: boolean;
  isCreator?: boolean;
  isOnline?: boolean;
}

/** Chat Room row — used by the chat list and the chat header. */
export interface ChatRoom {
  chatRoomId: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  isMuted: boolean;
  isArchived: boolean;
  isBlocked?: boolean;
  unreadCount: number;
  /** The OTHER participant, resolved by the backend for the current user. */
  otherUser: RoomParticipant;
  /** All participants in the room — the chat header resolves the other user
   *  from this + currentUser.id, never from navigation params. */
  participants: RoomParticipant[];
  /** Change marker — backend increments this when room content changes. */
  updatedAt?: string;
  /** Latest message id for local ordering and reconciliation. */
  lastMessageId?: string | null;
  /** Media type of the latest message (chat list contextual preview). */
  lastMessageMediaType?: 'image' | 'video' | 'audio' | 'document' | 'gif' | null;
  /** Sender id of the latest message (chat list "You:" prefix). */
  lastMessageSenderId?: string | null;
  /** User IDs currently typing in this room. */
  typingUserIds?: string[];
}

/** A message inside a Chat Room. Destination is chatRoomId; sender is author. */
export interface RoomMessage {
  id: string;
  chatRoomId: string;
  body: string | null;
  mediaUrl: string | null;
  /** MESSAGE TYPE — how the item behaves as a message (image / video / audio /
   *  document / gif). This is the message category, NOT the on-disk file
   *  format. The on-disk file format is `fileType`. gif = animated image in a
   *  compact bubble. */
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'gif' | null;
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
  /** True once the message is persisted server-side (server-confirmed send). */
  delivered?: boolean;
  /** True when the RECIPIENT has read past this message (other member's
   *  last_read_at >= created_at). Honest read state — never inferred. */
  read?: boolean;
  /** Reaction state for this message (server-authoritative). Each entry maps
   *  an emoji to the user ids that reacted. Stays associated with this messageId. */
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  /** Rich link preview metadata for URLs in the message body. Resolved
   *  server-side once and persisted with the message, so the client renders
   *  the card from the payload — no re-fetch on chat open. */
  linkPreview?: LinkPreview | null;
  /** The message this one replies to/quotes. Server stores the relationship;
   *  mobile only renders it. `id` is the quoted message's messageId. */
  replyTo?: {
    id: string;
    body?: string | null;
    mediaType?: 'image' | 'video' | 'audio' | 'document' | 'gif' | null;
    /** Remote URL of the quoted message's media, when the server includes it.
     *  Used only for the reply-preview thumbnail. Optional because not every
     *  backend payload carries the quoted media URL. */
    mediaUrl?: string | null;
    senderName?: string;
  } | null;
}

/** Payload for sending a message into a room. */
export interface SendRoomMessagePayload {
  /** Stable ID generated before rendering the optimistic message. */
  clientMessageId?: string;
  /** Authenticated owner used to scope the persistent outbound queue. */
  userId?: string;
  body?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'gif' | null;
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
    isOnline: raw?.isOnline ?? raw?.is_online ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeChatRoom(raw: any): ChatRoom {
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
    isBlocked: source.isBlocked ?? source.is_blocked ?? undefined,
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
    typingUserIds:
      source.typingUserIds ??
      source.typing_user_ids ??
      undefined,
  };
}

function inferMediaType(raw: any): RoomMessage['mediaType'] {
  const explicit = raw.mediaType ?? raw.media_type;
  if (
    explicit === 'image' || explicit === 'video' || explicit === 'audio' ||
    explicit === 'document' || explicit === 'gif'
  ) {
    return explicit;
  }
  const mediaUrl = raw.mediaUrl ?? raw.media_url ?? '';
  if (!mediaUrl) return null;
  const source = String(mediaUrl).toLowerCase().split('?')[0];
  // A .gif URL is a GIF message (animated), not a plain image.
  if (/\.gif($|\?)/.test(source)) return 'gif';
  if (/\.(png|jpe?g|webp|heic)$/.test(source)) return 'image';
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
export function normalizeMessage(raw: any, currentUserId?: string): RoomMessage {
  const mediaUrl = raw.mediaUrl ?? raw.media_url ?? null;
  const mimeType = raw.mimeType ?? raw.mime_type ?? undefined;
  const mediaType = inferMediaType(raw);
  return {
    id: raw.id,
    chatRoomId: raw.chatRoomId ?? raw.chat_room_id ?? '',
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
    // Ownership is always derived from the authenticated mobile session. The
    // server may build a payload from another viewer's perspective, so trusting
    // a serialized is_own flag can mark every recipient message as "You".
    isOwn: currentUserId ? String(raw.sender?.id ?? raw.sender_id ?? '') === currentUserId : Boolean(raw.isOwn ?? raw.is_own ?? false),
    delivered: raw.delivered ?? raw.is_delivered ?? undefined,
    read: raw.read ?? raw.is_read ?? undefined,
    reactions: normalizeReactions(raw.reactions),
    replyTo: normalizeReplyTo(raw.reply_to ?? raw.replyTo),
    linkPreview: normalizeLinkPreview(raw.link_preview ?? raw.linkPreview),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface LinkPreview {
  url: string;
  kind: 'profile' | 'post' | 'album' | 'short' | 'video' | 'external';
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  name?: string | null;
  username?: string | null;
  domain?: string | null;
  resourceId?: string | null;
  resourceType?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLinkPreview(raw: any): LinkPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind;
  if (kind !== 'profile' && kind !== 'post' && kind !== 'album' && kind !== 'short' && kind !== 'video' && kind !== 'external') return null;
  return {
    url: String(raw.url ?? ''),
    kind,
    title: raw.title ?? raw.name ?? null,
    description: raw.description ?? null,
    imageUrl: raw.imageUrl ?? raw.image_url ?? null,
    name: raw.name ?? null,
    username: raw.username ?? null,
    domain: raw.domain ?? null,
    resourceId: raw.resourceId ?? raw.resource_id ?? null,
    resourceType: raw.resourceType ?? raw.resource_type ?? null,
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
 * Fetch room history over SweetSocket. The server reads durable history from
 * Turso and answers with a `history:set` event plus the command ack; there is
 * no HTTP history fallback.
 */
export async function fetchRoomHistory(
  chatRoomId: string,
  opts?: { before?: string },
): Promise<{ messages: RoomMessage[]; hasMore: boolean }> {
  // STRICT TRANSPORT RULE: history comes over SweetSocket (chat.history →
  // history:set) only — no silent HTTP GET /messages fallback. If the socket is
  // unavailable this rejects visibly; the live screen surfaces that rather than
  // swapping to the HTTP transport. (chat-restore.ts owns the explicit
  // explicit restoration path also uses this socket command.)
  const ack = await realtime.emit(
    'chat.history',
    { before: opts?.before, limit: 30 },
    { channel: `chat:${chatRoomId}` },
  );
  const payload = ack.event?.payload as { messages?: unknown[]; hasMore?: boolean } | undefined;
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  return {
    messages: messages.map((m) => normalizeMessage(m)),
    hasMore: payload?.hasMore === true,
  };
}

/**
 * Send a message into a room. Messages store author + chatRoomId destination.
 * SweetSocket `message.send`
 */
export async function sendRoomMessage(
  chatRoomId: string,
  payload: SendRoomMessagePayload,
): Promise<{ message: RoomMessage }> {
  // Generate a client-side identity for idempotent optimistic send. The server
  // reconciles this clientMessageId into the authoritative server message id.
  const clientMessageId = payload.clientMessageId
    ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;  // SweetSocket is the only message transport. A disconnected socket enters
  // the durable outbound queue; it is never replaced by HTTP or a retry button.
  const queued = enqueueChatMessage({
    clientMessageId,
    chatRoomId,
    payload: { ...payload, clientMessageId },
    userId: payload.userId,
  });
  const message = await queued;
  return { message: normalizeMessage(message) };
}

/**
 * Mark the current user's unread state as read FOR THIS ROOM.
 * SweetSocket `chat.read`
 */
export async function markRoomRead(chatRoomId: string): Promise<void> {
  // STRICT TRANSPORT RULE: read propagates over SweetSocket only. No HTTP /read
  // fallback — if the socket is unavailable this rejects and the caller's
  // catch handles it (read is best-effort; the store's local markRoomRead still
  // zeroes the badge optimistically). The caller must never treat this as sent
  // unless the socket path resolves.
  await realtime.emit('chat.read', {}, { channel: `chat:${chatRoomId}` });
}

/**
 * Clear the current user's chat state for this room. The ROOM remains the
 * permanent container — the relationship and the other user are NOT deleted.
 * SweetSocket `chat.clear`
 */
export async function clearChatRoom(chatRoomId: string): Promise<void> {
  // STRICT TRANSPORT RULE: chat clearing propagates over SweetSocket only (the
  // server persists cleared_at and emits a durable chat:clear). No HTTP /clear
  // fallback.
  await realtime.emit('chat.clear', {}, { channel: `chat:${chatRoomId}` });
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
 * SweetSocket `message.delete`
 */
export async function deleteRoomMessage(
  chatRoomId: string,
  messageId: string,
  scope: 'me' | 'everyone' = 'me',
): Promise<void> {
  // STRICT TRANSPORT RULE: deletion propagates over SweetSocket only. The
  // server validates ownership/permission, persists, and broadcasts
  // messages:delete. No HTTP DELETE fallback.
  await realtime.emit('message.delete', { messageId, scope }, { channel: `chat:${chatRoomId}` });
}

/**
 * Edit a message body and/or caption inside a room. Pass `body` for a text
 * edit, `caption` for a media-caption edit, or both. The server persists each
 * provided field independently (a caption edit never clobbers the body).
 * SweetSocket `message.edit`
 */
export async function editRoomMessage(
  chatRoomId: string,
  messageId: string,
  body?: string,
  caption?: string,
): Promise<void> {
  // STRICT TRANSPORT RULE: edits propagate over SweetSocket only (server
  // validates author, persists is_edited, broadcasts messages:update). No HTTP
  // PATCH fallback.
  const payload: Record<string, unknown> = { messageId };
  if (body !== undefined) payload.body = body;
  if (caption !== undefined) payload.caption = caption;
  await realtime.emit('message.edit', payload, { channel: `chat:${chatRoomId}` });
}

/**
 * Toggle a reaction on a room message.
 *
 * STRICT TRANSPORT RULE: reactions propagate over SweetSocket only (server
 * persists + broadcasts messages:reaction). No HTTP POST fallback. Returns the
 * authoritative reaction list from the command ack.
 */
export async function toggleRoomReaction(
  chatRoomId: string,
  messageId: string,
  emoji: string,
): Promise<{ reactions: Array<{ emoji: string; userIds: string[] }> }> {
  const ack = await realtime.emit('message.reaction', { messageId, emoji }, { channel: `chat:${chatRoomId}` });
  const reactions = (ack.event?.payload?.reactions ?? []) as Array<{ emoji: string; userIds: string[] }>;
  return { reactions };
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