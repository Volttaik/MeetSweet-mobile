import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Spinner } from 'heroui-native';
import { MsShimmer, MsShimmerUserRow } from '@/components/MsShimmer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PencilSimple,
  Plus,
  MagnifyingGlass,
  X,
  Image,
  VideoCamera,
  Microphone,
  Paperclip,
  type Icon,
} from 'phosphor-react-native';
import { router, useFocusEffect } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsRoomCreationLoader } from '@/components/chat/MsRoomCreationLoader';
import {
  getChatRoomList,
  getOrCreateChatRoom,
  archiveChatRoom,
  deleteChatRoom,
  markRoomRead,
  type ChatRoom,
  type RoomParticipant,
} from '@/services/room-service';
import { searchUsers } from '@/services/users';
import { ApiError } from '@/services/api';
import { getCreatorMessagingSettings } from '@/services/subscriptions';
import {
  getCachedChatRooms,
  cacheChatRooms,
} from '@/services/chat-cache';
import { reportNetworkSuccess, reportNetworkError } from '@/hooks/useNetwork';
import { useAuth } from '@/contexts/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const MSG_TABS = ['All', 'Archived'] as const;
type MsgTab = typeof MSG_TABS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

/**
 * Deterministic chat-room ordering — newest activity first, with a stable
 * tie-break on chatRoomId so the list NEVER rearranges between cache, API,
 * and poll refreshes. Every code path that sets `chatRooms` MUST use this.
 */
function sortRooms(rooms: ChatRoom[]): ChatRoom[] {
  return [...rooms].sort((a, b) => {
    const ta = new Date(a.lastMessageAt ?? a.createdAt).getTime();
    const tb = new Date(b.lastMessageAt ?? b.createdAt).getTime();
    if (tb !== ta) return tb - ta;
    return a.chatRoomId < b.chatRoomId ? -1 : a.chatRoomId > b.chatRoomId ? 1 : 0;
  });
}

// ─── Chat Room row ────────────────────────────────────────────────────────────

function ChatRoomRow({
  item,
  onLongPress,
  currentUserId,
}: {
  item: ChatRoom;
  onLongPress: (item: ChatRoom) => void;
  currentUserId: string;
}) {
  const isUnread = item.unreadCount > 0;
  // Set when a long-press fires; suppresses the tap that may follow its
  // release so a long-press NEVER opens the conversation (it only shows the
  // action menu). Cleared shortly after the touch ends.
  const suppressTapRef = useRef(false);
  const avatarUrl = item.otherUser?.avatarUrl as string | undefined;

  // Contextual preview label per feature doc §1.2 (media messages show vector
  // icons + labels: Photo, Video, Voice message, Document).
  const previewLabel = (() => {
    if (item.lastMessageMediaType === 'image') return 'Photo';
    if (item.lastMessageMediaType === 'video') return 'Video';
    if (item.lastMessageMediaType === 'audio') return 'Voice message';
    if (item.lastMessageMediaType === 'document') return 'Document';
    return item.lastMessageBody ?? 'Say hello';
  })();
  const PreviewIcon: Icon | null =
    item.lastMessageMediaType === 'image' ? Image :
    item.lastMessageMediaType === 'video' ? VideoCamera :
    item.lastMessageMediaType === 'audio' ? Microphone :
    item.lastMessageMediaType === 'document' ? Paperclip : null;
  const showMediaIcon = PreviewIcon !== null && !item.lastMessageBody;

  const isOwnLast = !!item.lastMessageSenderId && item.lastMessageSenderId === currentUserId;
  const previewText = item.lastMessageBody
    ? (isOwnLast ? `You: ${item.lastMessageBody}` : item.lastMessageBody)
    : previewLabel;

  return (
    <TouchableOpacity
      style={styles.convoRow}
      activeOpacity={0.7}
      onPress={() => {
        if (suppressTapRef.current) return;
        router.push(`/chat-room/${item.chatRoomId}`);
      }}
      onLongPress={() => {
        suppressTapRef.current = true;
        onLongPress(item);
      }}
      onPressOut={() => {
        // Release after a long-press must not navigate; clear the guard shortly
        // after the touch ends so the next genuine tap still opens the chat.
        setTimeout(() => {
          suppressTapRef.current = false;
        }, 150);
      }}
      delayLongPress={350}
    >
      <MsAvatar
        size={50}
        initials={initials(item.otherUser.name)}
        imageUri={avatarUrl}
      />
      <View style={styles.convoContent}>
        <Text style={[styles.convoName, isUnread && styles.bold]} numberOfLines={1}>
          {item.otherUser.name}
        </Text>
        <View style={styles.convoMsgRow}>
          {showMediaIcon && PreviewIcon ? (
            <PreviewIcon size={13} color={T.TEXT_2} />
          ) : null}
          <Text
            style={[styles.convoMsg, isUnread && styles.convoMsgUnread]}
            numberOfLines={1}
          >
            {previewText}
          </Text>
        </View>
      </View>
      <View style={styles.convoRight}>
        <Text style={styles.convoTime}>{formatTime(item.lastMessageAt)}</Text>
        {isUnread ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {item.unreadCount > 9 ? '9+' : item.unreadCount}
            </Text>
          </View>
        ) : (
          <View style={{ width: 18 }} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── New message modal ────────────────────────────────────────────────────────

function NewMessageModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<RoomParticipant[]>([]);
  const [searching, setSearching] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (text: string) => {
    setQ(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchUsers(text.trim());
        setResults(data as any);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelect = async (user: RoomParticipant) => {
    setCreatingRoom(true);
    try {
      // Check the recipient's current policy before opening a room. The
      // backend repeats this check, but doing it here prevents empty rooms and
      // gives the user a useful subscription/privacy explanation.
      const access = await getCreatorMessagingSettings(user.id);
      if (!access.can_message) {
        setCreatingRoom(false);
        if (access.who_can_message === 'subscribers') {
          Alert.alert(
            'Subscription Required',
            'You need to subscribe to this creator before sending a message.',
            [
              { text: 'Cancel', style: 'cancel' },
              ...(user.isCreator
                ? [{
                    text: 'View Creator',
                    onPress: () => router.push(`/creator/${user.username}`),
                  }]
                : []),
            ],
          );
        } else {
          Alert.alert('Cannot Message', 'This user is not accepting messages right now.');
        }
        return;
      }

      // Messaging is free — ask the backend to create/find the Chat Room.
      const { chatRoomId } = await getOrCreateChatRoom(user.id);
      onClose();
      setQ('');
      setResults([]);
      router.push({
        pathname: '/chat-room/[chatRoomId]',
        params: { chatRoomId },
      });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      const errorData = (apiError?.data as { data?: { username?: string; redirect_to?: string } } | undefined)?.data;
      const redirectTarget = errorData?.username ?? user.username;
      if (apiError?.code === 'subscription_required' && redirectTarget) {
        onClose();
        setQ('');
        setResults([]);
        setCreatingRoom(false);
        Alert.alert(
          'Subscription Required',
          'Subscribe to this creator before sending a message.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Creator', onPress: () => router.push(`/creator/${redirectTarget}`) },
          ],
        );
        return;
      }
      const message = error instanceof Error ? error.message : '';
      Alert.alert('Could not open chat', message || 'Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalBg}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Message</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalClose} activeOpacity={0.7}>
            <X size={20} color={T.TEXT} />
          </TouchableOpacity>
        </View>
        <View style={styles.modalSearch}>
          <MagnifyingGlass size={15} color={T.TEXT_2} />
          <TextInput
            placeholder="Search by name or username…"
            placeholderTextColor={T.TEXT_3}
            style={styles.modalSearchInput}
            value={q}
            onChangeText={handleSearch}
            autoFocus
          />
        </View>
        {searching ? (
          <View style={{ paddingTop: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <MsShimmerUserRow key={i} />
            ))}
          </View>
        ) : results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => {
              const userAvatar = (item as any)?.avatarUrl as string | undefined;
              return (
                <TouchableOpacity
                  style={styles.userRow}
                  activeOpacity={0.7}
                  onPress={() => handleSelect(item)}
                >
                  <MsAvatar size={42} initials={initials(item.name)} imageUri={userAvatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userHandle}>@{item.username}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        ) : q.length >= 2 ? (
          <MsEmptyState title="No users found" message={`No one matches "${q}"`} />
        ) : (
          <Text style={styles.modalHint}>Type at least 2 characters to search</Text>
        )}
      </View>

      {/* Full-screen Chat Room creation loader */}
      <MsRoomCreationLoader visible={creatingRoom} />
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<MsgTab>('All');
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [menuRoom, setMenuRoom] = useState<ChatRoom | null>(null);

  const load = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);

      // 1. Load from SQLite cache for instant display (all tab only)
      if (!showRefresh && activeTab === 'All') {
        const cached = await getCachedChatRooms();
        if (cached.length > 0) {
          setChatRooms(sortRooms(cached));
          setLoading(false);
        }
      }

      // 2. Fetch from API — lightweight room metadata only
      try {
        const tab = activeTab === 'Archived' ? 'archived' : 'all';
        const data = await getChatRoomList(tab);
        setChatRooms(sortRooms(data.chatRooms));
        reportNetworkSuccess();
        // Cache room list (only for 'all' tab)
        if (activeTab === 'All') {
          cacheChatRooms(data.chatRooms).catch(() => {});
        }
      } catch {
        reportNetworkError();
        // Cached data is still visible — no error state needed
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    setLoading(true);
    setChatRooms([]);
    load();
  }, [activeTab]);

  // Refresh the chat list whenever the tab regains focus (e.g. returning from
  // a chat after sending a message) so the latest message / unread badge shows
  // immediately instead of waiting for the next 15s poll or a manual pull.
  // Only fires on an actual unfocused → focused transition (not on tab switch
  // while already focused, which would double-fetch with the activeTab effect).
  const isFocusedRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!isFocusedRef.current && activeTab === 'All') {
        load();
      }
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
    }, [activeTab]),
  );

  // Lightweight room-metadata refresh — the chat list polls ONLY room metadata
  // (other user, latest message, timestamp, unread count, chatRoomId), never
  // downloading every room's messages.
  useEffect(() => {
    if (activeTab !== 'All') return;
    const interval = setInterval(() => {
      getChatRoomList('all')
        .then((data) => {
          setChatRooms((prev) => {
            const map = new Map(prev.map((r) => [r.chatRoomId, r]));
            for (const room of data.chatRooms) map.set(room.chatRoomId, room);
            return sortRooms(Array.from(map.values()));
          });
          cacheChatRooms(data.chatRooms).catch(() => {});
        })
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const filtered = searchText.trim()
    ? chatRooms.filter(
        (c) =>
          c.otherUser.name.toLowerCase().includes(searchText.toLowerCase()) ||
          c.otherUser.username.toLowerCase().includes(searchText.toLowerCase()),
      )
    : chatRooms;

  // Long-press room actions
  const roomActions = (room: ChatRoom): ActionItem[] => [
    {
      label: 'Mark as Read',
      onPress: () => {
        setChatRooms((prev) =>
          prev.map((c) => (c.chatRoomId === room.chatRoomId ? { ...c, unreadCount: 0 } : c)),
        );
        markRoomRead(room.chatRoomId).catch(() => {});
      },
    },
    {
      label: room.isArchived ? 'Unarchive' : 'Archive',
      onPress: async () => {
        const next = !room.isArchived;
        setChatRooms((prev) => prev.filter((c) => c.chatRoomId !== room.chatRoomId));
        try {
          await archiveChatRoom(room.chatRoomId, next);
        } catch {
          setChatRooms((prev) => [...prev, { ...room, isArchived: next }]);
        }
      },
    },
    {
      label: 'Delete',
      destructive: true,
      onPress: () => {
        // Optimistic remove
        setChatRooms((prev) => prev.filter((c) => c.chatRoomId !== room.chatRoomId));
        deleteChatRoom(room.chatRoomId).catch(() => {
          // If deletion fails restore the room
          setChatRooms((prev) => [room, ...prev]);
          Alert.alert('Error', 'Could not delete chat room. Please try again.');
        });
      },
    },
  ];

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.7}
          onPress={() => setShowNewMsg(true)}
        >
          <PencilSimple size={18} color={T.TEXT} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <MagnifyingGlass size={15} color={T.TEXT_2} />
        <TextInput
          placeholder="Search chats…"
          placeholderTextColor={T.TEXT_3}
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={14} color={T.TEXT_3} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {MSG_TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, isActive && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabChipLabel, isActive && styles.tabChipLabelActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading && chatRooms.length === 0 ? (
        <View style={{ paddingTop: 4 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
              <MsShimmer width={48} height={48} borderRadius={24} />
              <View style={{ flex: 1, gap: 7 }}>
                <MsShimmer width="55%" height={13} />
                <MsShimmer width="70%" height={11} />
              </View>
              <MsShimmer width={32} height={10} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.chatRoomId}
          renderItem={({ item }) => (
            <ChatRoomRow item={item} onLongPress={setMenuRoom} currentUserId={user?.id ?? ''} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={T.TEXT}
            />
          }
          ListEmptyComponent={
            <MsEmptyState
              title={
                activeTab === 'Archived'
                  ? 'No archived chats'
                  : searchText
                  ? 'No results'
                  : 'Start your first conversation'
              }
              message={
                activeTab === 'Archived'
                  ? 'Archived chats will appear here.'
                  : searchText
                  ? `No chats matching "${searchText}".`
                  : 'Tap the pencil icon above to message a creator you love.'
              }
              actionLabel={!activeTab && !searchText ? 'New Message' : undefined}
              onAction={!activeTab && !searchText ? () => setShowNewMsg(true) : undefined}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => setShowNewMsg(true)}
      >
        <Plus size={22} color="#000000" />
      </TouchableOpacity>

      <NewMessageModal visible={showNewMsg} onClose={() => setShowNewMsg(false)} />

      {/* Room long-press action sheet */}
      <MsActionSheet
        visible={!!menuRoom}
        title={menuRoom?.otherUser.name}
        subtitle={menuRoom ? `@${menuRoom.otherUser.username}` : undefined}
        actions={menuRoom ? roomActions(menuRoom) : []}
        onClose={() => setMenuRoom(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: T.BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { fontSize: 22, fontFamily: T.FONT.bold, color: T.TEXT, letterSpacing: -0.4 },
  iconBtn: {
    width: 38, height: 38, borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.full,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 14,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
  },
  tabChipActive: { backgroundColor: T.TEXT },
  tabChipLabel: { fontFamily: T.FONT.medium, fontSize: 13, color: T.TEXT_2 },
  tabChipLabelActive: { color: T.BG },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  convoContent: { flex: 1, gap: 3 },
  convoName: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT },
  bold: { fontFamily: T.FONT.semibold },
  convoMsg: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_2, flexShrink: 1 },
  convoMsgRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  convoMsgUnread: { color: T.TEXT, fontFamily: T.FONT.medium },
  convoRight: { alignItems: 'flex-end', gap: 4 },
  convoTime: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3 },
  unreadBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: T.ACCENT, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: { fontSize: 10, fontFamily: T.FONT.bold, color: '#fff' },
  separator: { height: 1, backgroundColor: T.SURFACE, marginLeft: 78 },
  fab: {
    position: 'absolute',
    bottom: 96,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.SHADOWS.medium,
  },
  // Modal
  modalBg: { flex: 1, backgroundColor: T.BG },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 20,
  },
  modalTitle: { fontSize: 17, fontFamily: T.FONT.semibold, color: T.TEXT },
  modalClose: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center',
  },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 12,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.full,
    gap: 8,
  },
  modalSearchInput: { flex: 1, color: T.TEXT, fontFamily: T.FONT.regular, fontSize: 14 },
  modalHint: {
    textAlign: 'center',
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    marginTop: 24,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  userName: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT },
  userHandle: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },
});