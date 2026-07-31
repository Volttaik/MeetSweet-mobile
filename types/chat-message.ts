/**
 * MeetSweet extended IMessage type.
 * Bridges @kesha-antonov/react-native-chat's IMessage with our backend fields.
 */
import { IMessage, ReplyMessage } from '@kesha-antonov/react-native-chat';
import type { ChatMessage } from '@/services/messages';

export interface MsMessage extends IMessage {
  /** Explicit media type from backend (image/video/audio/document) */
  msMediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  /** Filename for document messages */
  msFileName?: string;
  /** File size in bytes */
  msFileSize?: number;
  /** MIME type string */
  msMimeType?: string;
  /** Audio/voice note duration in seconds */
  msAudioDuration?: number;
  /** Media caption */
  msCaption?: string;
  /** Soft-deleted — show "This message was deleted" */
  msIsDeleted?: boolean;
  /** Whether the sender has edited this message */
  msIsEdited?: boolean;
  /** Paid/locked content */
  msIsPaid?: boolean;
  /** Whether the viewer has paid to unlock */
  msIsUnlocked?: boolean;
  /** Credit price to unlock */
  msPaidPrice?: number;
}

/** Map our ChatMessage → MsMessage for the Chat component */
export function toMsMessage(raw: ChatMessage, currentUserId: string): MsMessage {
  return {
    _id: raw.id,
    text: raw.body ?? '',
    createdAt: new Date(raw.createdAt),
    user: {
      _id: raw.sender.id,
      name: raw.sender.name,
      avatar: raw.sender.avatarUrl ?? undefined,
    },
    // Standard library fields — used for built-in render fallbacks
    image: raw.mediaType === 'image' ? (raw.mediaUrl ?? undefined) : undefined,
    video: raw.mediaType === 'video' ? (raw.mediaUrl ?? undefined) : undefined,
    audio: raw.mediaType === 'audio' ? (raw.mediaUrl ?? undefined) : undefined,
    sent: true,
    received: raw.sender.id !== currentUserId,
    pending: false,
    // Reply
    replyMessage: undefined,
    // Custom MeetSweet fields
    msMediaType: raw.mediaType,
    msFileName: raw.fileName,
    msFileSize: raw.fileSize,
    msMimeType: raw.mimeType,
    msAudioDuration: raw.audioDuration,
    msCaption: raw.caption,
    msIsDeleted: raw.isDeleted,
    msIsEdited: raw.isEdited,
    msIsPaid: raw.isPaid,
    msIsUnlocked: raw.isUnlocked,
    msPaidPrice: raw.paidPrice,
  };
}

/** Build a ReplyMessage from a MsMessage */
export function toReplyMessage(msg: MsMessage): ReplyMessage {
  return {
    _id: msg._id,
    text: msg.text,
    user: msg.user,
    image: msg.image,
    audio: msg.audio,
  };
}

/** Format file size bytes → human-readable string */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format seconds → m:ss */
export function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
