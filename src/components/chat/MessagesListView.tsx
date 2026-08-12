/**
 * MessagesListView - List of chat rooms with tab filter ("All" / "Archived") and recipient search modal.
 */

import React, { useState, useEffect } from 'react';
import { Search, Plus, Archive, MessageSquare, ShieldCheck, RefreshCw } from 'lucide-react';
import { ChatRoom, User } from '../../types';
import { getChatRooms, getOrCreateChatRoom } from '../../services/room-service';
import { searchUsers } from '../../services/users';

interface MessagesListViewProps {
  currentUserId: string;
  onSelectRoom: (room: ChatRoom) => void;
}

export const MessagesListView: React.FC<MessagesListViewProps> = ({
  currentUserId,
  onSelectRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'archived'>('all');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const list = await getChatRooms(activeTab);
      setRooms(list);
    } catch {
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [activeTab]);

  const handleSearchUsers = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setUserSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const results = await searchUsers(q);
      setUserSearchResults(results);
    } catch {
      setUserSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartChatWithUser = async (user: User) => {
    try {
      setIsLoading(true);
      const room = await getOrCreateChatRoom(user.id);
      setShowNewChatModal(false);
      onSelectRoom(room);
    } catch (err: any) {
      alert(err.message || 'Failed to create chat room');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRooms = rooms.filter((r) => {
    if (!searchQuery.trim()) return true;
    const name = r.otherUser.name.toLowerCase();
    const username = r.otherUser.username.toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || username.includes(query);
  });

  return (
    <div className="flex flex-col h-full bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 dark:border-stone-800 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Messages</h1>
          <button
            type="button"
            onClick={() => setShowNewChatModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shadow-xs transition-transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none border border-transparent focus:border-rose-400"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'all'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            All Chats
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'archived'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/60">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-stone-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-stone-400 space-y-2">
            <MessageSquare className="w-10 h-10 text-stone-300 dark:text-stone-700" />
            <p className="font-semibold text-sm text-stone-600 dark:text-stone-300">No chat rooms found</p>
            <p className="text-xs max-w-xs text-stone-400">
              Start a new chat with a creator or user to begin messaging.
            </p>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const timeFormatted = room.lastMessageAt
              ? new Date(room.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <div
                key={room.chatRoomId}
                onClick={() => onSelectRoom(room)}
                className="flex items-center gap-3 p-4 hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer transition-colors"
              >
                <div className="relative">
                  <img
                    src={room.otherUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={room.otherUser.name}
                    className="w-12 h-12 rounded-full object-cover border border-stone-200 dark:border-stone-700"
                    referrerPolicy="no-referrer"
                  />
                  {room.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
                      {room.unreadCount}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate">
                        {room.otherUser.name}
                      </span>
                      {room.otherUser.isCreator && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white uppercase">
                          Creator
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-stone-400 shrink-0">{timeFormatted}</span>
                  </div>

                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    {room.lastMessageBody || 'Photo/Media attachment'}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowNewChatModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">Start New Chat</h3>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                onChange={(e) => handleSearchUsers(e.target.value)}
                placeholder="Search name or username..."
                className="w-full bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
              {userSearchResults.map((user) => (
                <div
                  key={user.id}
                  onClick={() => handleStartChatWithUser(user)}
                  className="flex items-center gap-3 p-3 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-xl cursor-pointer"
                >
                  <img
                    src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={user.name}
                    className="w-9 h-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-stone-900 dark:text-stone-100 truncate">{user.name}</p>
                    <p className="text-[11px] text-stone-400 truncate">@{user.username}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
