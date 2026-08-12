/**
 * MeetSweet App Entry Point
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { FeedView } from './components/feed/FeedView';
import { ExploreView } from './components/explore/ExploreView';
import { CreatorProfileView } from './components/creator/CreatorProfileView';
import { ShortsView } from './components/shorts/ShortsView';
import { MessagesListView } from './components/chat/MessagesListView';
import { ChatRoomView } from './components/chat/ChatRoomView';
import { WalletView } from './components/wallet/WalletView';
import { ChatRoom } from './types';
import { getOrCreateChatRoom } from './services/room-service';

function MainContent() {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<'feed' | 'explore' | 'shorts' | 'messages' | 'wallet' | 'profile'>('feed');
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [activeCreatorUsername, setActiveCreatorUsername] = useState<string | null>(null);

  const currentUserId = user?.id || 'demo-user-123';

  const handleOpenCreator = (username: string) => {
    setActiveCreatorUsername(username);
  };

  const handleOpenChatWithUser = async (userId: string) => {
    try {
      const room = await getOrCreateChatRoom(userId);
      setActiveChatRoom(room);
      setCurrentTab('messages');
    } catch {
      alert('Unable to open chat room.');
    }
  };

  return (
    <AppLayout
      currentTab={currentTab}
      onSelectTab={(tab) => {
        setCurrentTab(tab);
        setActiveChatRoom(null);
        setActiveCreatorUsername(null);
      }}
    >
      {activeCreatorUsername ? (
        <CreatorProfileView
          username={activeCreatorUsername}
          onBack={() => setActiveCreatorUsername(null)}
          onOpenChatWithUser={handleOpenChatWithUser}
        />
      ) : currentTab === 'messages' && activeChatRoom ? (
        <ChatRoomView
          chatRoom={activeChatRoom}
          currentUserId={currentUserId}
          onBack={() => setActiveChatRoom(null)}
          onOpenProfile={(username) => handleOpenCreator(username)}
          onRoomDeleted={() => setActiveChatRoom(null)}
        />
      ) : currentTab === 'messages' ? (
        <MessagesListView
          currentUserId={currentUserId}
          onSelectRoom={(room) => setActiveChatRoom(room)}
        />
      ) : currentTab === 'explore' ? (
        <ExploreView onOpenCreator={handleOpenCreator} />
      ) : currentTab === 'shorts' ? (
        <ShortsView />
      ) : currentTab === 'wallet' ? (
        <WalletView />
      ) : currentTab === 'profile' && user ? (
        <CreatorProfileView
          username={user.username}
          onBack={() => setCurrentTab('feed')}
          onOpenChatWithUser={handleOpenChatWithUser}
        />
      ) : (
        <FeedView
          onOpenCreator={handleOpenCreator}
          onOpenChatWithUser={handleOpenChatWithUser}
        />
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
