import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PencilSimple,
  MagnifyingGlass,
  X,
  Image,
  VideoCamera,
  Microphone,
  Paperclip,
  Sparkle,
  type Icon,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsActionSheet } from '@/components/MsActionSheet';
import { MsRoomCreationLoader } from '@/components/chat/MsRoomCreationLoader';
import { useAuth } from '@/contexts/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const MSG_TABS = ['All', 'Archived'] as const;
type MsgTab = typeof MSG_TABS[number];

// ─── UI-only room model ───────────────────────────────────────────────────────
// The chat backend has been removed (clean slate). This is the visual shape the
// list rows render from; the next messaging architecture will repopulate it.

export interface ChatListParticipant {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  isOnline?: boolean;
}

export interface ChatListRoom {
  chatRoomId: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
  otherUser: ChatListParticipant;
  lastMessageMediaType?: 'image' | 'video' | 'audio' | 'document' | 'gif' | 'sticker' | null;
  lastMessageSenderId?: string | null;
  typingUserIds?: string[];
}

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
 * tie-break on chatRoomId so the list NEVER rearranges between refreshes.
 */
function sortRooms(rooms: ChatListRoom[]): ChatListRoom[] {
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
  currentUserId,
}: {
  item: ChatListRoom;
  currentUserId: string;
}) {
  const isUnread = item.unreadCount > 0;
  const avatarUrl = item.otherUser?.avatarUrl as string | undefined;
  const displayName = item.otherUser?.name
    || (item.otherUser?.username ? `@${item.otherUser.username}` : 'Chat');

  // ── Typing / Online indicators ──────────────────────────────────────────
  const typingUserIds = item.typingUserIds ?? [];
  const isOtherTyping = typingUserIds.length > 0 && typingUserIds[0] !== currentUserId;
  const isOtherOnline = item.otherUser?.isOnline === true;

  // Contextual preview label per feature doc §1.2 (media messages show vector
  // icons + labels: Photo, GIF, Video, Voice message, Document).
  const previewLabel = (() => {
    if (item.lastMessageMediaType === 'image') return 'Photo';
    if (item.lastMessageMediaType === 'gif') return 'GIF';
    if (item.lastMessageMediaType === 'video') return 'Video';
    if (item.lastMessageMediaType === 'audio') return 'Voice message';
    if (item.lastMessageMediaType === 'document') return 'Document';
    return item.lastMessageBody ?? 'Say hello';
  })();
  const PreviewIcon: Icon | null =
    item.lastMessageMediaType === 'image' ? Image :
    item.lastMessageMediaType === 'gif' ? Sparkle :
    item.lastMessageMediaType === 'video' ? VideoCamera :
    item.lastMessageMediaType === 'audio' ? Microphone :
    item.lastMessageMediaType === 'document' ? Paperclip : null;
  const showMediaIcon = PreviewIcon !== null && !item.lastMessageBody;

  const isOwnLast = !!item.lastMessageSenderId && item.lastMessageSenderId === currentUserId;
  const previewText = isOtherTyping
    ? 'Typing...'
    : item.lastMessageBody
      ? (isOwnLast ? `You: ${item.lastMessageBody}` : item.lastMessageBody)
      : previewLabel;

  return (
    <TouchableOpacity
      style={styles.convoRow}
      activeOpacity={0.7}
      onPress={() => {}}
      delayLongPress={350}
    >
      <MsAvatar
        size={50}
        initials={initials(displayName)}
        imageUri={avatarUrl}
        showOnline={isOtherOnline}
      />
      <View style={styles.convoContent}>
        <Text style={[styles.convoName, isUnread && styles.bold]} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={styles.convoMsgRow}>
          {showMediaIcon && !isOtherTyping ? (
            <PreviewIcon size={13} color={T.TEXT_2} />
          ) : null}
          <Text
            style={[
              styles.convoMsg,
              isUnread && styles.convoMsgUnread,
              isOtherTyping && styles.convoMsgTyping,
            ]}
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

// ─── New message modal (UI shell — backend removed) ───────────────────────────

function NewMessageModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (text: string) => {
    setQ(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Messaging backend removed — no user search until the new architecture
    // lands. The composer UI is preserved for that phase.
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
        {q.length >= 2 ? (
          <MsEmptyState title="No users found" message={`No one matches "${q}"`} />
        ) : (
          <Text style={styles.modalHint}>Type at least 2 characters to search</Text>
        )}
      </View>

      {/* Full-screen Chat Room creation loader */}
      <MsRoomCreationLoader visible={false} />
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<MsgTab>('All');
  // UI-only chat list. The old chat backend has been removed; this stays empty
  // until the next messaging architecture repopulates it.
  const [rooms] = useState<ChatListRoom[]>([]);
  const [loading] = useState(false);

  // ── List shimmer — crossfades into the real conversation list instead of
  // hard-cutting, so the chat list transition is stable (no flash/rearrange).
  const listShimmerOpacity = useRef(new Animated.Value(1)).current;
  const [listShimmerVisible, setListShimmerVisible] = useState(true);
  React.useEffect(() => {
    if (!loading) {
      Animated.timing(listShimmerOpacity, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start(() => setListShimmerVisible(false));
    }
  }, [loading, listShimmerOpacity]);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [searchText, setSearchText] = useState('');

  const visibleRooms = activeTab === 'All' ? rooms.filter((r) => !r.isArchived) : rooms;
  const filtered = searchText.trim()
    ? visibleRooms.filter(
        (c) =>
          (c.otherUser.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
          (c.otherUser.username || '').toLowerCase().includes(searchText.toLowerCase()),
      )
    : visibleRooms;

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => setShowNewMsg(true)}
          >
            <PencilSimple size={18} color={T.TEXT} />
          </TouchableOpacity>
        </View>
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

      {/* Content — the list is ALWAYS mounted; the shimmer sits on top and
          crossfades out when loading completes (no hard cut / flash). */}
      <View style={{ flex: 1 }}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.chatRoomId}
          renderItem={({ item }) => (
            <ChatRoomRow item={item} currentUserId={user?.id ?? ''} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
              actionLabel={activeTab === 'All' && !searchText ? 'New Message' : undefined}
              onAction={activeTab === 'All' && !searchText ? () => setShowNewMsg(true) : undefined}
            />
          }
        />

        {listShimmerVisible && (
          <Animated.View
            pointerEvents={loading ? 'auto' : 'none'}
            style={[styles.listShimmerOverlay, { opacity: listShimmerOpacity }]}
          />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => setShowNewMsg(true)}
      >
        <PencilSimple size={22} color="#000000" weight="fill" />
      </TouchableOpacity>

      <NewMessageModal visible={showNewMsg} onClose={() => setShowNewMsg(false)} />

      {/* Room long-press action sheet — backend removed; sheet kept for the next
          architecture to wire into */}
      <MsActionSheet visible={false} actions={[]} onClose={() => {}} />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  listShimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.BG,
  },
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  convoContent: { flex: 1, gap: 3 },
  convoName: { fontSize: 16, fontFamily: T.FONT.bold, color: T.TEXT },
  bold: { fontFamily: T.FONT.bold },
  convoMsg: { fontSize: 14, fontFamily: T.FONT.medium, color: T.TEXT_2, flexShrink: 1 },
  convoMsgRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  convoMsgUnread: { color: T.TEXT, fontFamily: T.FONT.semibold },
  convoMsgTyping: { color: T.ACCENT, fontFamily: T.FONT.semibold },
  convoRight: { alignItems: 'flex-end', gap: 4 },
  convoTime: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_3 },
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
  modalSearchInput: {
    flex: 1,
    color: T.TEXT,
    fontFamily: T.FONT.regular,
    fontSize: 14,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modalHint: {
    textAlign: 'center',
    color: T.TEXT_3,
    fontFamily: T.FONT.regular,
    fontSize: 13,
    marginTop: 24,
  },
});
