/**
 * MeetSweet Web - Shared Type Definitions
 */

export interface User {
  id: string;
  username: string;
  name: string;
  email?: string;
  avatarUrl: string | null;
  bio?: string | null;
  isVerified?: boolean;
  isCreator?: boolean;
  creatorTier?: string;
  followersCount?: number;
  followingCount?: number;
  subscribersCount?: number;
  postsCount?: number;
  createdAt?: string;
}

export interface RoomParticipant {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  isVerified?: boolean;
  isCreator?: boolean;
}

export interface ChatRoom {
  chatRoomId: string;
  contextId?: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
  otherUser: RoomParticipant;
  participants: RoomParticipant[];
  updatedAt?: string;
  lastMessageId?: string | null;
  lastMessageMediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  lastMessageSenderId?: string | null;
  isBlocked?: boolean;
}

export interface RoomMessage {
  id: string;
  chatRoomId: string;
  contextId?: string | null;
  body: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'document' | null;
  fileType?: string | null;
  isVoiceNote?: boolean;
  audioDuration?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  localUri?: string | null;
  isDeleted: boolean;
  isEdited?: boolean;
  caption?: string;
  createdAt: string;
  sender: RoomParticipant;
  isOwn: boolean;
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  replyTo?: {
    id: string;
    body?: string | null;
    mediaType?: 'image' | 'video' | 'audio' | 'document' | null;
    mediaUrl?: string | null;
    senderName?: string;
  } | null;
}

export interface Post {
  id: string;
  caption: string;
  mediaUrls: string[];
  mediaType?: 'image' | 'video' | 'album';
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
  createdAt: string;
  author: User;
  isExclusive?: boolean;
  price?: number;
  unlocked?: boolean;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: User;
  likesCount?: number;
  isLiked?: boolean;
}

export interface CreatorProfile extends User {
  coverUrl?: string;
  subscriptionPrice?: number;
  featuredAlbums?: Album[];
  exclusivePosts?: Post[];
}

export interface Album {
  id: string;
  title: string;
  description?: string;
  coverUrl: string;
  mediaCount: number;
  price: number;
  isPurchased?: boolean;
  createdAt: string;
  creator: User;
}

export interface WalletState {
  balance: number;
  currency: string;
  transactions: Array<{
    id: string;
    type: 'deposit' | 'withdrawal' | 'subscription' | 'album_purchase' | 'tip';
    amount: number;
    description: string;
    createdAt: string;
    status: 'completed' | 'pending' | 'failed';
  }>;
}

export interface NotificationItem {
  id: string;
  type: 'like' | 'comment' | 'message' | 'subscribe' | 'purchase';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  sender?: User;
  targetId?: string;
}
