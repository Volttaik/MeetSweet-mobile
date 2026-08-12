/**
 * MsMessageContextMenu - Popup / Submenu for message options.
 * FIXED ISSUE-004: Accessible via long-press or click trigger on any bubble.
 */

import React from 'react';
import { Reply, Edit3, Copy, Trash2, Info, X } from 'lucide-react';
import { RoomMessage } from '../../types';

interface MsMessageContextMenuProps {
  message: RoomMessage;
  isOpen: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: (message: RoomMessage) => void;
  onEdit: (message: RoomMessage) => void;
  onCopy: (text: string) => void;
  onDeleteForMe: (messageId: string) => void;
  onDeleteForEveryone: (messageId: string) => void;
  currentUserId?: string;
}

const EMOJI_REACTIONS = ['❤️', '👍', '🔥', '😂', '😮', '😢', '👏', '🙏'];

export const MsMessageContextMenu: React.FC<MsMessageContextMenuProps> = ({
  message,
  isOpen,
  onClose,
  onReact,
  onReply,
  onEdit,
  onCopy,
  onDeleteForMe,
  onDeleteForEveryone,
  currentUserId,
}) => {
  if (!isOpen) return null;

  const isOwn = currentUserId ? message.sender.id === currentUserId : message.isOwn;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2">
          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Message Options</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Reaction Bar */}
        <div className="flex items-center justify-between gap-1 p-2 bg-stone-50 dark:bg-stone-800/60 rounded-xl">
          {EMOJI_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji);
                onClose();
              }}
              className="text-xl hover:scale-125 transition-transform p-1 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Action Menu */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              onReply(message);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <Reply className="w-4 h-4 text-stone-500" />
            <span>Reply to Message</span>
          </button>

          {message.body && (
            <button
              type="button"
              onClick={() => {
                onCopy(message.body || '');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <Copy className="w-4 h-4 text-stone-500" />
              <span>Copy Text</span>
            </button>
          )}

          {isOwn && message.body && (
            <button
              type="button"
              onClick={() => {
                onEdit(message);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <Edit3 className="w-4 h-4 text-stone-500" />
              <span>Edit Message</span>
            </button>
          )}

          <div className="my-1 border-t border-stone-100 dark:border-stone-800" />

          <button
            type="button"
            onClick={() => {
              onDeleteForMe(message.id);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete for Me</span>
          </button>

          {isOwn && (
            <button
              type="button"
              onClick={() => {
                onDeleteForEveryone(message.id);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete for Everyone</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
