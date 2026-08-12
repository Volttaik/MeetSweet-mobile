/**
 * Room Service — Chat Room & Messages API service.
 * Handles Chat Room creation, message list, sending with fileType/isVoiceNote,
 * reaction toggles, edits, deletes, and room polling reconciliation.
 */

import { apiFetch, authFetch } from './api';
import { ChatRoom, RoomMessage, RoomParticipant } from '../types';

export interface SendMessageOptions {
  body?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  fileType?: string | null;
  isVoiceNote?: boolean;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  audioDuration?: number;
  replyToId?: string | null;
}

export function normalizeParticipant(p: any): RoomParticipant {
  return {
    id: p?.id || p?.user_id || 'unknown',
    name: p?.name || p?.full_name || p?.username || 'User',
    username: p?.username || 'user',
    avatarUrl: p?.avatarUrl || p?.avatar_url || null,
    isVerified: Boolean(p?.isVerified || p?.is_verified),
    isCreator: Boolean(p?.isCreator || p?.is_creator),
  };
}

export function normalizeMessage(raw: any, currentUserId?: string): RoomMessage {
  const sender = normalizeParticipant(raw.sender || raw.author || {});
  const isOwn = currentUserId ? sender.id === currentUserId : Boolean(raw.is_own || raw.isOwn);

  let mediaType: 'image' | 'video' | 'audio' | 'document' | null = raw.mediaType || raw.media_type || null;
  if (!mediaType && raw.mediaUrl) {
    const url = (raw.mediaUrl || raw.media_url || '').toLowerCase();
    if (url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/)) mediaType = 'image';
    else if (url.match(/\.(mp4|webm|mov|m4v)$/)) mediaType = 'video';
    else if (url.match(/\.(mp3|wav|m4a|aac|ogg)$/)) mediaType = 'audio';
    else mediaType = 'document';
  }

  return {
    id: String(raw.id || raw.message_id || raw._id),
    chatRoomId: String(raw.chatRoomId || raw.chat_room_id),
    contextId: raw.contextId || raw.context_id || null,
    body: raw.body || null,
    mediaUrl: raw.mediaUrl || raw.media_url || null,
    mediaType,
    fileType: raw.fileType || raw.file_type || (raw.mimeType?.split('/')[1]) || null,
    isVoiceNote: Boolean(raw.isVoiceNote || raw.is_voice_note || (mediaType === 'audio' && raw.audioDuration)),
    audioDuration: raw.audioDuration || raw.audio_duration || undefined,
    fileName: raw.fileName || raw.file_name || undefined,
    fileSize: raw.fileSize || raw.file_size || undefined,
    mimeType: raw.mimeType || raw.mime_type || undefined,
    isDeleted: Boolean(raw.isDeleted || raw.is_deleted),
    isEdited: Boolean(raw.isEdited || raw.is_edited),
    caption: raw.caption || undefined,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    sender,
    isOwn,
    reactions: raw.reactions ? raw.reactions.map((r: any) => ({
      emoji: r.emoji,
      userIds: Array.isArray(r.userIds || r.user_ids) ? (r.userIds || r.user_ids) : []
    })) : [],
    replyTo: raw.replyTo || raw.reply_to ? {
      id: String(raw.replyTo?.id || raw.reply_to?.id || raw.replyTo || raw.reply_to),
      body: raw.replyTo?.body || raw.reply_to?.body || null,
      mediaType: raw.replyTo?.mediaType || raw.reply_to?.media_type || null,
      mediaUrl: raw.replyTo?.mediaUrl || raw.reply_to?.media_url || null,
      senderName: raw.replyTo?.senderName || raw.reply_to?.sender_name || 'User',
    } : null,
  };
}

export function normalizeChatRoom(raw: any, currentUserId?: string): ChatRoom {
  const participants = Array.isArray(raw.participants)
    ? raw.participants.map(normalizeParticipant)
    : [];
  
  let otherUser = raw.otherUser || raw.other_user;
  if (!otherUser && participants.length > 0 && currentUserId) {
    otherUser = participants.find((p) => p.id !== currentUserId) || participants[0];
  }

  return {
    chatRoomId: String(raw.chatRoomId || raw.chat_room_id || raw.id),
    contextId: raw.contextId || raw.context_id || null,
    lastMessageBody: raw.lastMessageBody || raw.last_message_body || null,
    lastMessageAt: raw.lastMessageAt || raw.last_message_at || raw.createdAt || raw.created_at || new Date().toISOString(),
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    isMuted: Boolean(raw.isMuted || raw.is_muted),
    isArchived: Boolean(raw.isArchived || raw.is_archived),
    unreadCount: Number(raw.unreadCount || raw.unread_count || 0),
    otherUser: normalizeParticipant(otherUser || {}),
    participants,
    lastMessageId: raw.lastMessageId || raw.last_message_id || null,
    lastMessageMediaType: raw.lastMessageMediaType || raw.last_message_media_type || null,
    lastMessageSenderId: raw.lastMessageSenderId || raw.last_message_sender_id || null,
    isBlocked: Boolean(raw.isBlocked || raw.is_blocked),
  };
}

export async function getOrCreateChatRoom(participantId: string): Promise<ChatRoom> {
  const resp = await authFetch<any>('/chat-rooms', undefined, {
    method: 'POST',
    body: JSON.stringify({ participant_id: participantId }),
  });
  return normalizeChatRoom(resp.chat_room || resp);
}

export async function getChatRooms(tab: 'all' | 'archived' = 'all'): Promise<ChatRoom[]> {
  const resp = await authFetch<any>(`/chat-rooms?tab=${tab}`);
  const list = resp.chat_rooms || resp.chatRooms || (Array.isArray(resp) ? resp : []);
  return list.map((r: any) => normalizeChatRoom(r));
}

export async function getChatRoom(chatRoomId: string): Promise<ChatRoom> {
  const resp = await authFetch<any>(`/chat-rooms/${chatRoomId}`);
  return normalizeChatRoom(resp.chat_room || resp);
}

export async function getRoomMessages(
  chatRoomId: string,
  options: { before?: string; after?: string; limit?: number } = {}
): Promise<{ messages: RoomMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.before) params.append('before', options.before);
  if (options.after) params.append('after', options.after);
  if (options.limit) params.append('limit', String(options.limit));

  const query = params.toString() ? `?${params.toString()}` : '';
  const resp = await authFetch<any>(`/chat-rooms/${chatRoomId}/messages${query}`);
  const list = resp.messages || (Array.isArray(resp) ? resp : []);
  return {
    messages: list.map((m: any) => normalizeMessage(m)),
    hasMore: Boolean(resp.has_more || resp.hasMore),
  };
}

/**
 * FIXED ISSUE-011:
 * Serializes `file_type` and `is_voice_note` explicitly in JSON payload
 */
export async function sendRoomMessage(
  chatRoomId: string,
  payload: SendMessageOptions
): Promise<RoomMessage> {
  const bodyData: Record<string, any> = {
    body: payload.body || null,
    media_url: payload.mediaUrl || null,
    media_type: payload.mediaType || null,
    file_type: payload.fileType || null,
    is_voice_note: Boolean(payload.isVoiceNote),
    caption: payload.caption || null,
    file_name: payload.fileName || null,
    file_size: payload.fileSize || null,
    mime_type: payload.mimeType || null,
    audio_duration: payload.audioDuration || null,
    reply_to_id: payload.replyToId || null,
  };

  const resp = await authFetch<any>(`/chat-rooms/${chatRoomId}/messages`, undefined, {
    method: 'POST',
    body: JSON.stringify(bodyData),
  });

  return normalizeMessage(resp.message || resp);
}

/**
 * FIXED ISSUE-005: Toggle Reaction endpoint
 */
export async function toggleRoomReaction(
  chatRoomId: string,
  messageId: string,
  emoji: string
): Promise<RoomMessage> {
  const resp = await authFetch<any>(`/chat-rooms/${chatRoomId}/messages/${messageId}/reactions`, undefined, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
  return normalizeMessage(resp.message || resp);
}

export async function editRoomMessage(
  chatRoomId: string,
  messageId: string,
  body: string
): Promise<RoomMessage> {
  const resp = await authFetch<any>(`/chat-rooms/${chatRoomId}/messages/${messageId}`, undefined, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
  return normalizeMessage(resp.message || resp);
}

export async function deleteRoomMessage(
  chatRoomId: string,
  messageId: string,
  scope: 'me' | 'everyone' = 'me'
): Promise<void> {
  await authFetch<void>(`/chat-rooms/${chatRoomId}/messages/${messageId}?scope=${scope}`, undefined, {
    method: 'DELETE',
  });
}

/**
 * FIXED ISSUE-009: Clear room - caller must wait for server confirmation
 */
export async function clearChatRoom(chatRoomId: string): Promise<void> {
  await authFetch<void>(`/chat-rooms/${chatRoomId}/clear`, undefined, {
    method: 'POST',
  });
}

/**
 * FIXED ISSUE-010: Delete chat room - caller verifies server before removing UI
 */
export async function deleteChatRoom(chatRoomId: string): Promise<void> {
  await authFetch<void>(`/chat-rooms/${chatRoomId}`, undefined, {
    method: 'DELETE',
  });
}

export async function setRoomMuted(chatRoomId: string, muted: boolean): Promise<void> {
  await authFetch<void>(`/chat-rooms/${chatRoomId}/mute`, undefined, {
    method: 'PUT',
    body: JSON.stringify({ muted }),
  });
}

export async function setRoomArchived(chatRoomId: string, archived: boolean): Promise<void> {
  await authFetch<void>(`/chat-rooms/${chatRoomId}/archive`, undefined, {
    method: 'PUT',
    body: JSON.stringify({ archived }),
  });
}

export async function checkRoomChanges(
  chatRoomId: string,
  sinceMarker?: string
): Promise<{ changed: boolean; messages?: RoomMessage[]; marker?: string }> {
  const query = sinceMarker ? `?since=${encodeURIComponent(sinceMarker)}` : '';
  const resp = await authFetch<any>(`/chat-rooms/${chatRoomId}/changes${query}`);
  const list = resp.messages || [];
  return {
    changed: Boolean(resp.changed),
    messages: list.map((m: any) => normalizeMessage(m)),
    marker: resp.marker || undefined,
  };
}
