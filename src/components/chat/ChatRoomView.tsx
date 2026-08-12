/**
 * ChatRoomView - Complete interactive Chat Room component.
 * Fixes all issues identified in report.md (001-016).
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Phone, Video, MoreVertical, Trash2, Shield, AlertTriangle, RefreshCw } from 'lucide-react';
import { ChatRoom, RoomMessage, RoomParticipant } from '../../types';
import {
  getRoomMessages,
  sendRoomMessage,
  toggleRoomReaction,
  editRoomMessage,
  deleteRoomMessage,
  clearChatRoom,
  deleteChatRoom,
  checkRoomChanges,
} from '../../services/room-service';
import { blockUser, unblockUser } from '../../services/users';
import { MsChatBubble } from './MsChatBubble';
import { MsChatInputBar } from './MsChatInputBar';
import { MsMessageContextMenu } from './MsMessageContextMenu';
import { MsUserProfileSheet } from './MsUserProfileSheet';

interface ChatRoomViewProps {
  chatRoom: ChatRoom;
  currentUserId: string;
  onBack: () => void;
  onOpenProfile: (username: string, isCreator: boolean) => void;
  onRoomDeleted?: () => void;
}

export const ChatRoomView: React.FC<ChatRoomViewProps> = ({
  chatRoom,
  currentUserId,
  onBack,
  onOpenProfile,
  onRoomDeleted,
}) => {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<RoomMessage | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<RoomMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<RoomMessage | null>(null);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isBlocked, setIsBlocked] = useState(Boolean(chatRoom.isBlocked));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const participant = chatRoom.otherUser;

  // Load Initial Messages
  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await getRoomMessages(chatRoom.chatRoomId);
      setMessages(res.messages);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [chatRoom.chatRoomId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // FIXED ISSUE-002 & ISSUE-007: Polling interval with full message reconciliation
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const latestId = messages.length > 0 ? messages[messages.length - 1].id : undefined;
        const changes = await checkRoomChanges(chatRoom.chatRoomId, latestId);

        if (changes.changed && changes.messages && changes.messages.length > 0) {
          setMessages((prev) => {
            const updated = [...prev];
            changes.messages!.forEach((newMsg) => {
              const idx = updated.findIndex((m) => m.id === newMsg.id);
              if (idx >= 0) {
                // Reconcile edit, reaction, or removal changes (ISSUE-007)
                updated[idx] = newMsg;
              } else {
                // Add new message
                updated.push(newMsg);
              }
            });
            return updated;
          });
        }
      } catch {
        // Polling failure silently ignored
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [chatRoom.chatRoomId, messages]);

  // Send Message
  const handleSend = async (data: {
    body?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    isVoiceNote?: boolean;
    audioDuration?: number;
    replyToId?: string;
  }) => {
    if (isBlocked) return;

    // Optimistic UI Row
    const tempId = `temp-${Date.now()}`;
    const tempMsg: RoomMessage = {
      id: tempId,
      chatRoomId: chatRoom.chatRoomId,
      body: data.body || null,
      mediaUrl: data.mediaUrl || null,
      mediaType: data.mediaType || null,
      isVoiceNote: data.isVoiceNote,
      audioDuration: data.audioDuration,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId,
        name: 'You',
        username: 'you',
        avatarUrl: null,
      },
      isOwn: true,
      replyTo: replyToMessage
        ? {
            id: replyToMessage.id,
            body: replyToMessage.body,
            mediaType: replyToMessage.mediaType,
            senderName: replyToMessage.sender.name,
          }
        : null,
    };

    setMessages((prev) => [...prev, tempMsg]);

    try {
      const realMsg = await sendRoomMessage(chatRoom.chatRoomId, {
        body: data.body,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        isVoiceNote: data.isVoiceNote,
        audioDuration: data.audioDuration,
        replyToId: data.replyToId,
      });

      // Replace temp row with server-confirmed message
      setMessages((prev) => prev.map((m) => (m.id === tempId ? realMsg : m)));
    } catch (err: any) {
      // Revert temp row on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setErrorMessage(err.message || 'Failed to send message');
    }
  };

  // FIXED ISSUE-005: Toggle Reaction
  const handleReact = async (messageId: string, emoji: string) => {
    try {
      const updatedMsg = await toggleRoomReaction(chatRoom.chatRoomId, messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updatedMsg : m)));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update reaction');
    }
  };

  // Edit Message
  const handleUpdateMessage = async (body: string) => {
    if (!editingMessage) return;
    const msgId = editingMessage.id;
    try {
      const updated = await editRoomMessage(chatRoom.chatRoomId, msgId, body);
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updated : m)));
      setEditingMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to edit message');
    }
  };

  // Delete Message (for me or everyone)
  const handleDeleteMessage = async (messageId: string, scope: 'me' | 'everyone') => {
    try {
      await deleteRoomMessage(chatRoom.chatRoomId, messageId, scope);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete message');
    }
  };

  // FIXED ISSUE-009: Clear Chat (Verifies server confirmation)
  const handleClearChat = async () => {
    if (!window.confirm('Are you sure you want to clear all messages in this room?')) return;
    try {
      setIsRefreshing(true);
      await clearChatRoom(chatRoom.chatRoomId);
      setMessages([]);
      setShowHeaderMenu(false);
    } catch (err: any) {
      // FIXED ISSUE-009: Do NOT clear local state if server fails!
      setErrorMessage(`Failed to clear chat on server: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // FIXED ISSUE-010: Delete Chat Room
  const handleDeleteRoom = async () => {
    if (!window.confirm('Delete this entire chat room?')) return;
    try {
      setIsRefreshing(true);
      await deleteChatRoom(chatRoom.chatRoomId);
      setShowHeaderMenu(false);
      onRoomDeleted ? onRoomDeleted() : onBack();
    } catch (err: any) {
      // FIXED ISSUE-010: Do NOT remove UI if server fails!
      setErrorMessage(`Failed to delete room on server: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle Block
  const handleToggleBlock = async (username: string) => {
    try {
      if (isBlocked) {
        await unblockUser(username);
        setIsBlocked(false);
      } else {
        await blockUser(username);
        setIsBlocked(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update block state');
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 relative overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 shadow-2xs z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div
            onClick={() => setShowProfileSheet(true)}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative">
              <img
                src={participant.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt={participant.name}
                className="w-10 h-10 rounded-full object-cover border border-stone-200 dark:border-stone-700 group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-stone-900" />
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-rose-600 transition-colors">
                  {participant.name}
                </h2>
                {participant.isCreator && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white uppercase">
                    Creator
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">@{participant.username}</p>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 relative">
          <button
            type="button"
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            className="p-2 rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showHeaderMenu && (
            <div className="absolute top-12 right-0 w-48 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-2 z-30">
              <button
                type="button"
                onClick={() => {
                  setShowHeaderMenu(false);
                  setShowProfileSheet(true);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                View Profile
              </button>
              <button
                type="button"
                onClick={handleClearChat}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Clear Chat
              </button>
              <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
              <button
                type="button"
                onClick={handleDeleteRoom}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                Delete Chat Room
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="bg-rose-500 text-white text-xs px-4 py-2 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Blocked Banner */}
      {isBlocked && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2 text-center font-medium z-20">
          Messaging is disabled because this user is blocked.
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-stone-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-stone-400 p-6 space-y-2">
            <Shield className="w-10 h-10 text-stone-300 dark:text-stone-700" />
            <p className="font-semibold text-sm text-stone-600 dark:text-stone-300">
              End-to-End Private Chat Room
            </p>
            <p className="text-xs max-w-xs text-stone-400">
              Send a text, voice note, photo, or file attachment to start the conversation with @{participant.username}.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MsChatBubble
              key={msg.id}
              message={msg}
              currentUserId={currentUserId}
              onLongPressMessage={(m) => setSelectedMessage(m)}
              onReactionPress={handleReact}
              onQuotePress={(id) => {
                const el = document.getElementById(`msg-${id}`);
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Bar */}
      {!isBlocked && (
        <MsChatInputBar
          onSend={handleSend}
          replyToMessage={replyToMessage}
          onClearReply={() => setReplyToMessage(null)}
          editingMessage={editingMessage}
          onClearEdit={() => setEditingMessage(null)}
          onUpdateMessage={handleUpdateMessage}
        />
      )}

      {/* Context Menu Modal (FIXED ISSUE-004) */}
      {selectedMessage && (
        <MsMessageContextMenu
          message={selectedMessage}
          isOpen={Boolean(selectedMessage)}
          onClose={() => setSelectedMessage(null)}
          onReact={(emoji) => handleReact(selectedMessage.id, emoji)}
          onReply={(m) => setReplyToMessage(m)}
          onEdit={(m) => setEditingMessage(m)}
          onCopy={(text) => navigator.clipboard.writeText(text)}
          onDeleteForMe={(id) => handleDeleteMessage(id, 'me')}
          onDeleteForEveryone={(id) => handleDeleteMessage(id, 'everyone')}
          currentUserId={currentUserId}
        />
      )}

      {/* User Profile Sheet (FIXED ISSUE-013) */}
      {showProfileSheet && (
        <MsUserProfileSheet
          participant={participant}
          isOpen={showProfileSheet}
          onClose={() => setShowProfileSheet(false)}
          onOpenFullProfile={onOpenProfile}
          onToggleBlock={handleToggleBlock}
          isBlocked={isBlocked}
        />
      )}
    </div>
  );
};
