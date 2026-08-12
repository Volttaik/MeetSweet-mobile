/**
 * MsChatInputBar - Rich message input bar with voice note simulation, attachments, quote/edit banners.
 */

import React, { useState } from 'react';
import { Send, Paperclip, Mic, Image, X, Square } from 'lucide-react';
import { RoomMessage } from '../../types';

interface MsChatInputBarProps {
  onSend: (data: {
    body?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    isVoiceNote?: boolean;
    audioDuration?: number;
    replyToId?: string;
  }) => void;
  replyToMessage?: RoomMessage | null;
  onClearReply?: () => void;
  editingMessage?: RoomMessage | null;
  onClearEdit?: () => void;
  onUpdateMessage?: (body: string) => void;
}

export const MsChatInputBar: React.FC<MsChatInputBarProps> = ({
  onSend,
  replyToMessage,
  onClearReply,
  editingMessage,
  onClearEdit,
  onUpdateMessage,
}) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  React.useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.body || '');
    }
  }, [editingMessage]);

  React.useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleSend = () => {
    if (editingMessage) {
      if (text.trim()) {
        onUpdateMessage?.(text.trim());
        setText('');
        onClearEdit?.();
      }
      return;
    }

    if (!text.trim()) return;

    onSend({
      body: text.trim(),
      replyToId: replyToMessage?.id,
    });

    setText('');
    onClearReply?.();
  };

  const handleStopVoiceNote = () => {
    setIsRecording(false);
    onSend({
      mediaUrl: 'https://actions.google.com/sounds/v1/ambiences/outdoor_rain.ogg',
      mediaType: 'audio',
      isVoiceNote: true,
      audioDuration: Math.max(recordingSeconds, 3),
      replyToId: replyToMessage?.id,
    });
    onClearReply?.();
  };

  const handleSelectSampleMedia = (type: 'image' | 'video' | 'document') => {
    setShowAttachmentMenu(false);
    const mediaUrls = {
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800',
      video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      document: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    };

    onSend({
      body: text.trim() || undefined,
      mediaUrl: mediaUrls[type],
      mediaType: type,
      replyToId: replyToMessage?.id,
    });
    setText('');
    onClearReply?.();
  };

  return (
    <div className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2 sm:p-3 relative">
      {/* Edit Banner */}
      {editingMessage && (
        <div className="flex items-center justify-between px-3 py-1.5 mb-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <span className="font-semibold">Editing message...</span>
          <button type="button" onClick={onClearEdit} className="p-1 hover:text-amber-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Quoted Reply Banner */}
      {replyToMessage && !editingMessage && (
        <div className="flex items-center justify-between px-3 py-1.5 mb-2 bg-rose-50 dark:bg-rose-950/40 rounded-xl text-xs text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          <div className="truncate">
            <span className="font-semibold">Replying to {replyToMessage.sender.name}: </span>
            <span className="opacity-80 truncate">{replyToMessage.body || 'Media'}</span>
          </div>
          <button type="button" onClick={onClearReply} className="p-1 hover:text-rose-900 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachment Selector Popup */}
      {showAttachmentMenu && (
        <div className="absolute bottom-16 left-4 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl p-2 flex gap-3 z-30">
          <button
            type="button"
            onClick={() => handleSelectSampleMedia('image')}
            className="flex flex-col items-center gap-1 p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl text-xs font-medium text-stone-700 dark:text-stone-300"
          >
            <Image className="w-5 h-5 text-rose-500" />
            <span>Image</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectSampleMedia('video')}
            className="flex flex-col items-center gap-1 p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl text-xs font-medium text-stone-700 dark:text-stone-300"
          >
            <Image className="w-5 h-5 text-purple-500" />
            <span>Video</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectSampleMedia('document')}
            className="flex flex-col items-center gap-1 p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl text-xs font-medium text-stone-700 dark:text-stone-300"
          >
            <Paperclip className="w-5 h-5 text-blue-500" />
            <span>Doc</span>
          </button>
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
          className="p-2 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {isRecording ? (
          <div className="flex-1 flex items-center justify-between px-4 py-2 bg-rose-50 dark:bg-rose-950/50 rounded-full border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400">
            <div className="flex items-center gap-2 text-xs font-semibold animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
              <span>Recording Voice Note... 0:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}</span>
            </div>
            <button
              type="button"
              onClick={handleStopVoiceNote}
              className="p-1 rounded-full bg-rose-600 text-white hover:bg-rose-700"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Write a message..."
            className="flex-1 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm rounded-full px-4 py-2.5 outline-none border border-transparent focus:border-rose-400"
          />
        )}

        {text.trim() || editingMessage ? (
          <button
            type="button"
            onClick={handleSend}
            className="p-2.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 shadow-sm active:scale-95 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          !isRecording && (
            <button
              type="button"
              onClick={() => setIsRecording(true)}
              className="p-2.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors"
            >
              <Mic className="w-5 h-5" />
            </button>
          )
        )}
      </div>
    </div>
  );
};
