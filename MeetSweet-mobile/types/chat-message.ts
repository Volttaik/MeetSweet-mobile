/**
 * Chat Message Types — Authoritative specification for MeetSweet Mobile.
 *
 * Distinguishes Message Type (text, image, video, audio, voice, file, system)
 * from File Type (image, video, audio, document).
 */

export type MessageType =
  | 'text'
  | 'image'
  | 'gif'
  | 'video'
  | 'audio'
  | 'voice'
  | 'file'
  | 'system';

export type FileType = 'image' | 'video' | 'audio' | 'document';

export interface MessageReaction {
  emoji: string;
  count?: number;
  userIds: (string | number)[]; // User IDs who reacted with this emoji
}

export interface QuotedMessage {
  id: string;
  _id: string;
  senderId?: string;
  senderName?: string;
  text: string;
  body?: string;
  mediaUrl?: string | null;
  mediaType?: MessageType | null;
  messageType?: MessageType;
  user: MsUser;
  image?: string;
  video?: string;
  audio?: string;
  /** True when the quoted original was deleted/recalled — the preview must
   *  render "Original message deleted" instead of stale content. */
  deleted?: boolean;
}

export interface MsUser {
  _id: string;
  name?: string;
  avatar?: string;
  username?: string;
}

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

export interface MsMessage {
  _id: string;
  id: string;
  /** Real server message id when `_id` is still a local temp id (optimistic
   *  send that has been confirmed). Keeps the list key stable so confirmed
   *  messages don't remount and flash. */
  msServerId?: string;
  chatRoomId: string;
  contextId?: string | null;
  text: string;
  createdAt: Date | number;
  user: MsUser;
  messageType: MessageType;
  msMediaType?: MessageType | null;
  fileType?: FileType | string | null;
  msFileType?: string | null;
  isVoiceNote?: boolean;
  msIsVoiceNote?: boolean;
  mediaUrl?: string | null;
  msMediaUrl?: string | null;
  localUri?: string | null;
  thumbnailUrl?: string | null;
  fileName?: string | null;
  msFileName?: string | null;
  fileSize?: number | null;
  msFileSize?: number | null;
  mimeType?: string | null;
  msMimeType?: string | null;
  msMediaStatus?: 'local' | 'downloading' | 'failed' | 'remote';
  duration?: number | null;
  audioDuration?: number | null;
  msAudioDuration?: number | null;
  caption?: string | null;
  msCaption?: string | null;
  reactions?: MessageReaction[];
  /** Rich link preview for URLs in the message body (server-resolved). */
  linkPreview?: LinkPreview | null;
  quotedMessage?: QuotedMessage;
  replyToId?: string | null;
  replyMessage?: QuotedMessage;
  isEdited?: boolean;
  msIsEdited?: boolean;
  isDeleted?: boolean;
  msIsDeleted?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  pending?: boolean;
  sent?: boolean;
  /** True once the server has confirmed persistence ("delivered" tick). The
   *  read state is tracked separately via `received`. */
  delivered?: boolean;
  received?: boolean;
  image?: string;
  video?: string;
  audio?: string;
}

/**
 * Convert a room service RoomMessage to an MsMessage component model.
 */
export function toMsMessage(m: any, currentUserId: string): MsMessage {
  const messageId = String(m.id || m._id || `msg_${Date.now()}`);
  const senderId = String(m.sender?.id || m.user?._id || m.sender_id || '');
  const isOwn = senderId === currentUserId;

  const mediaType: MessageType =
    m.messageType || m.mediaType || m.media_type || (m.isVoiceNote ? 'voice' : m.image ? 'image' : m.video ? 'video' : m.audio ? 'audio' : 'text');
  // GIF is a media-first type: it renders through the image path (animated via
  // expo-image) but keeps its distinct mediaType so the model never degrades
  // it to a generic image.
  const isGifLike = mediaType === 'gif';

  const mediaUrl = m.mediaUrl || m.media_url || m.image || m.video || m.audio || null;
  const fileName = m.fileName || m.file_name || null;
  const fileSize = m.fileSize || m.file_size || null;
  const mimeType = m.mimeType || m.mime_type || null;
  const caption = m.caption || null;
  const isEdited = Boolean(m.isEdited || m.is_edited || m.msIsEdited);
  const isDeleted = Boolean(m.isDeleted || m.is_deleted || m.msIsDeleted);
  const isVoiceNote = Boolean(m.isVoiceNote || m.is_voice_note || m.msIsVoiceNote);
  const audioDuration = m.audioDuration || m.audio_duration || m.duration || m.msAudioDuration || 0;

  const replyObj = m.replyTo || m.reply_to || m.replyMessage || m.quotedMessage || null;
  const replyDeleted = Boolean(replyObj?.deleted || replyObj?.is_recalled);
  const replyMessage: QuotedMessage | null = replyObj
    ? {
        id: String(replyObj.id || replyObj._id || ''),
        _id: String(replyObj.id || replyObj._id || ''),
        senderId: String(replyObj.senderId || replyObj.sender_id || ''),
        senderName: replyObj.senderName || replyObj.sender_name || replyObj.sender?.name || 'User',
        text: replyDeleted ? '' : (replyObj.text || replyObj.body || ''),
        body: replyDeleted ? '' : (replyObj.text || replyObj.body || ''),
        mediaUrl: replyDeleted ? null : (replyObj.mediaUrl || replyObj.media_url || null),
        mediaType: replyDeleted ? null : (replyObj.mediaType || replyObj.media_type || null),
        deleted: replyDeleted || undefined,
        user: {
          _id: String(replyObj.senderId || replyObj.sender_id || replyObj.user?._id || ''),
          name: replyObj.senderName || replyObj.sender_name || replyObj.sender?.name || replyObj.user?.name || 'User',
        },
      }
    : null;

  return {
    _id: messageId,
    id: messageId,
    chatRoomId: m.chatRoomId || m.chat_room_id || '',
    contextId: m.contextId || m.context_id || null,
    text: m.text || m.body || '',
    createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt || m.created_at || Date.now()),
    user: {
      _id: senderId,
      name: m.sender?.name || m.user?.name || (isOwn ? 'You' : 'User'),
      avatar: m.sender?.avatarUrl || m.sender?.avatar_url || m.user?.avatar || undefined,
      username: m.sender?.username || m.user?.username || undefined,
    },
    messageType: mediaType,
    msMediaType: mediaType,
    fileType: m.fileType || m.file_type || null,
    msFileType: m.fileType || m.file_type || null,
    isVoiceNote,
    msIsVoiceNote: isVoiceNote,
    mediaUrl,
    msMediaUrl: mediaUrl,
    localUri: m.localUri || m.local_uri || null,
    thumbnailUrl: m.thumbnailUrl || m.thumbnail_url || null,
    fileName,
    msFileName: fileName,
    fileSize,
    msFileSize: fileSize,
    mimeType,
    msMimeType: mimeType,
    msMediaStatus: m.localUri ? 'local' : mediaUrl ? 'remote' : undefined,
    duration: audioDuration,
    audioDuration,
    msAudioDuration: audioDuration,
    caption,
    msCaption: caption,
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    linkPreview: m.linkPreview ?? m.link_preview ?? null,
    quotedMessage: replyMessage ?? undefined,
    replyMessage: replyMessage ?? undefined,
    replyToId: m.replyToId || m.reply_to_id || replyMessage?.id || null,
    isEdited,
    msIsEdited: isEdited,
    isDeleted,
    msIsDeleted: isDeleted,
    status: m.status || (m.pending ? 'sending' : 'sent'),
    pending: m.pending ?? false,
    sent: m.sent ?? true,
    // Honest read state: only true when the backend reports the recipient has
    // read past this message (other member's last_read_at). Never assumed.
    received: Boolean(m.received ?? m.read ?? m.is_read ?? false),
    // Delivered = the server has persisted the message (its canonical view).
    // Drives the double-gray "delivered" tick; read (received) is separate.
    delivered: Boolean(m.delivered ?? m.is_delivered ?? m.status === 'delivered'),
    // gif carries its media in the image field so the bubble/media fullscreen
    // paths resolve it without special-casing every consumer.
    image: (mediaType === 'image' || isGifLike) ? (m.localUri || mediaUrl) : undefined,
    video: mediaType === 'video' ? (m.localUri || mediaUrl) : undefined,
    audio: mediaType === 'audio' ? (m.localUri || mediaUrl) : undefined,
  };
}

export function toReplyMessage(m: MsMessage): QuotedMessage {
  return {
    id: m.id,
    _id: m._id,
    senderId: m.user._id,
    senderName: m.user.name,
    text: m.text,
    body: m.text,
    mediaUrl: m.mediaUrl || m.image || m.video || m.audio || null,
    mediaType: m.messageType || m.msMediaType || null,
    user: {
      _id: m.user._id,
      name: m.user.name ?? 'User',
      avatar: m.user.avatar,
    },
  };
}

/**
 * Format file sizes in human-readable strings (B, KB, MB, GB).
 */
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i] || 'B'}`;
}

/**
 * Format durations in mm:ss format.
 */
export function formatDuration(seconds?: number | null): string {
  if (seconds == null || isNaN(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
