/**
 * MsChatBubble - Message bubble component supporting Text, Voice Notes, Media, and Files.
 * FIXED ISSUE-004: Consumes onLongPressMessage / context menu trigger.
 * FIXED ISSUE-005: Wires reaction strip toggle callback.
 */

import React, { useState } from 'react';
import { RoomMessage } from '../../types';
import { MsVoiceBubble } from './MsVoiceBubble';
import { MsMediaCard, MsFileCard } from './MsMediaCard';
import { MsReactionStrip } from './MsReactionStrip';
import { CornerDownRight, MoreVertical } from 'lucide-react';

interface MsChatBubbleProps {
  message: RoomMessage;
  currentUserId?: string;
  onLongPressMessage?: (msg: RoomMessage) => void;
  onReactionPress?: (msgId: string, emoji: string) => void;
  onQuotePress?: (replyToId: string) => void;
}

export const MsChatBubble: React.FC<MsChatBubbleProps> = ({
  message,
  currentUserId,
  onLongPressMessage,
  onReactionPress,
  onQuotePress,
}) => {
  const [showOptionsBtn, setShowOptionsBtn] = useState(false);
  const isOwn = currentUserId ? message.sender.id === currentUserId : message.isOwn;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onLongPressMessage?.(message);
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`group relative flex flex-col my-1 max-w-[82%] sm:max-w-[70%] ${
        isOwn ? 'ml-auto items-end' : 'mr-auto items-start'
      }`}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowOptionsBtn(true)}
      onMouseLeave={() => setShowOptionsBtn(false)}
    >
      {/* Sender Name if group/non-own */}
      {!isOwn && (
        <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-0.5 ml-1">
          {message.sender.name}
        </span>
      )}

      {/* Quoted Message Preview */}
      {message.replyTo && (
        <div
          onClick={() => message.replyTo?.id && onQuotePress?.(message.replyTo.id)}
          className={`flex items-start gap-1.5 px-3 py-1.5 rounded-lg mb-1 text-xs cursor-pointer border-l-2 opacity-90 transition-opacity hover:opacity-100 ${
            isOwn
              ? 'bg-rose-900/30 border-rose-300 text-rose-100'
              : 'bg-stone-200/80 dark:bg-stone-800 border-rose-500 text-stone-700 dark:text-stone-300'
          }`}
        >
          <CornerDownRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div className="truncate">
            <p className="font-semibold text-[10px] uppercase opacity-75">{message.replyTo.senderName || 'Replying'}</p>
            <p className="truncate">{message.replyTo.body || 'Media attachment'}</p>
          </div>
        </div>
      )}

      {/* Main Bubble Container */}
      <div
        className={`relative rounded-2xl p-3 shadow-2xs transition-all ${
          isOwn
            ? 'bg-rose-600 text-white rounded-br-xs'
            : 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-200/80 dark:border-stone-800 rounded-bl-xs'
        }`}
      >
        {/* Quick Action Trigger Button */}
        {showOptionsBtn && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLongPressMessage?.(message);
            }}
            className={`absolute top-1/2 -translate-y-1/2 p-1 rounded-full shadow-xs bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:text-rose-600 border border-stone-200 dark:border-stone-700 ${
              isOwn ? '-left-8' : '-right-8'
            }`}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Media Attachments */}
        {message.mediaUrl && (
          <div>
            {message.mediaType === 'audio' || message.isVoiceNote ? (
              <MsVoiceBubble mediaUrl={message.mediaUrl} duration={message.audioDuration} isOwn={isOwn} />
            ) : message.mediaType === 'document' ? (
              <MsFileCard mediaUrl={message.mediaUrl} fileName={message.fileName} fileSize={message.fileSize} />
            ) : (
              <MsMediaCard mediaUrl={message.mediaUrl} mediaType={message.mediaType} caption={message.caption} />
            )}
          </div>
        )}

        {/* Text Body */}
        {message.body && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed break-words font-normal">
            {message.body}
          </p>
        )}

        {/* Footer Meta (Time & Status) */}
        <div className={`flex items-center gap-1 mt-1 text-[10px] ${isOwn ? 'text-rose-100 justify-end' : 'text-stone-400 justify-end'}`}>
          {message.isEdited && <span className="italic">edited</span>}
          <span>{formattedTime}</span>
        </div>
      </div>

      {/* Reaction Strip */}
      <MsReactionStrip
        reactions={message.reactions}
        currentUserId={currentUserId}
        isOwn={isOwn}
        onPress={(emoji) => onReactionPress?.(message.id, emoji)}
      />
    </div>
  );
};
