import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { FlashList } from '@shopify/flash-list';
import { Spinner } from 'heroui-native';
import { MsShimmer, MsShimmerUserRow } from '@/components/MsShimmer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PencilSimple,
  Plus,
  MagnifyingGlass,
  X,
  DotsThreeVertical,
  Image,
  VideoCamera,
  Microphone,
  Paperclip,
  Sparkle,
  type Icon,
} from 'phosphor-react-native';
import { router } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
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
  cacheChatRooms,
  getCachedChatRooms,
} from '@/services/chat-cache';
import {
  restoreChatHistory,
  type RestoreProgress,
} from '@/services/chat-restore';
import { reportNetworkSuccess, reportNetworkError } from '@/hooks/useNetwork';
import { useAuth } from '@/contexts/AuthContext';
import { dialogs } from '@/components/MsGlobalDialogs';
import { realtime } from '@/services/realtime';
import { useSweetStore, sweetStore } from '@/services/sweet-store';

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
 * and realtime refreshes. Every code path that sets `chatRooms` MUST use this.
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
    <MsPressable
      style={styles.convoRow}
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
        showOnline={isOtherOnline}
      />
      <View style={styles.convoContent}>
        <Text style={[styles.convoName, isUnread && styles.bold]} numberOfLines={1}>
          {item.otherUser.name}
        </Text>
        <View style={styles.convoMsgRow}>
          {showMediaIcon && !isOtherTyping ? (
            <PreviewIcon size={13} color={T.TEXT_2} />
          ) : null}
          <Text
            style={[
              styles.convoMsg,
              isUnread && styles.convoMsgUnread,
              isOtherTyping && { color: T.ACCENT, fontStyle: 'italic' as const },
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
    </MsPressable>
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
    try {
      // Check the recipient's current policy before opening a room. The
      // backend repeats this check, but doing it here prevents empty rooms and
      // gives the user a useful subscription/privacy explanation.
      const access = await getCreatorMessagingSettings(user.id);
      if (!access.can_message) {
        if (access.who_can_message === 'subscribers') {
          dialogs.alert({
            title: 'Subscription Required',
            message: 'You need to subscribe to this creator before sending a message.',
            confirmLabel: user.isCreator ? 'View Creator' : 'OK',
            onClose: user.isCreator ? () => router.push(`/creator/${user.username}`) : undefined,
          });
        } else {
          dialogs.alert({ title: 'Cannot Message', message: 'This user is not accepting messages right now.' });
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
        dialogs.alert({
          title: 'Subscription Required',
          message: 'Subscribe to this creator before sending a message.',
          confirmLabel: 'View Creator',
          onClose: () => router.push(`/creator/${redirectTarget}`),
        });
        return;
      }
      const message = error instanceof Error ? error.message : '';
      dialogs.alert({ variant: 'error', title: 'Could not open chat', message: message || 'Please try again.' });
    } finally {
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalBg}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Message</Text>
          <MsPressable onPress={onClose} style={styles.modalClose}>
            <X size={20} color={T.TEXT} />
          </MsPressable>
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
                <MsPressable
                  style={styles.userRow}
                              onPress={() => handleSelect(item)}
                >
                  <MsAvatar size={42} initials={initials(item.name)} imageUri={userAvatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userHandle}>@{item.username}</Text>
                  </View>
                </MsPressable>
              );
            }}
          />
        ) : q.length >= 2 ? (
          <MsEmptyState title="No users found" message={`No one matches "${q}"`} />
        ) : (
          <Text style={styles.modalHint}>Type at least 2 characters to search</Text>
        )}
      </View>

    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<MsgTab>('All');
  // ── SweetStore is the canonical chat-list state ─────────────────────────
  // SweetSocket events (chats:upsert on the user channel, message events on
  // subscribed chat channels) update the store; this screen just renders it.
  // A NEW conversation arrives as a chats:upsert and appears WITHOUT any HTTP
  // refetch. HTTP list loading remains an explicit refresh / restore path.
  const { rooms: storeRooms, typingByRoom, presence, unreadByRoom } = useSweetStore();
  const [archivedRooms, setArchivedRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Local-first: the chat list paints from its local replica. Live room
  // metadata arrives over SweetSocket; HTTP is reserved for explicit refresh
  // and historical restoration.
  const [showMenu, setShowMenu] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);

  // ── List shimmer — crossfades into the real conversation list instead of
  // hard-cutting, so the chat list transition is stable (no flash/rearrange).
  const listShimmerOpacity = useRef(new Animated.Value(1)).current;
  const [listShimmerVisible, setListShimmerVisible] = useState(true);
  useEffect(() => {
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
  const [menuRoom, setMenuRoom] = useState<ChatRoom | null>(null);

  const load = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);

      const tab = activeTab === 'Archived' ? 'archived' : 'all';

      // LOCAL-FIRST: the All tab paints exclusively from the local persistent
      // store — never from the backend. The cache is namespaced per user
      // (SQLite chat_rooms_cache, keyed by user_id), so a different account
      // can never render the previous user's rooms. Opening Messages is
      // instant, works offline, and a fresh install stays fresh (empty state)
      // instead of silently restoring the entire conversation history.
      if (activeTab === 'All') {
        try {
          const cached = await getCachedChatRooms(user?.id);
          if (cached.length > 0) {
            sweetStore.hydrateRooms(cached);
            setListShimmerVisible(false);
          }
        } catch {
          // Cache read failure is non-fatal — fall through.
        }
        // Normal open is local-only. The only network path for the All tab
        // is an explicit pull-to-refresh.
        if (!showRefresh) {
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }

      // Explicit refresh (pull-to-refresh / Archived tab): fetch the latest
      // room metadata and mirror it locally so the next open stays instant.
      try {
        const data = await getChatRoomList(tab);
        if (activeTab === 'All') {
          sweetStore.hydrateRooms(data.chatRooms);
        } else {
          setArchivedRooms(sortRooms(data.chatRooms));
        }
        reportNetworkSuccess();
        // Mirror the server list to local storage so the next open is instant.
        if (activeTab === 'All') {
          cacheChatRooms(data.chatRooms, user?.id).catch(() => {});
        }
      } catch {
        reportNetworkError();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, user?.id],
  );

  useEffect(() => {
    // Never wipe already-available rooms — clearing the list on every tab
    // switch is what caused the "show → disappear → loader → re-render" flash.
    // The All tab paints from the SweetStore (already populated by the cache
    // hydration), so the existing conversations stay on screen.
    if (activeTab !== 'All') {
      setArchivedRooms([]);
      setLoading(true);
    }
    load();
  }, [activeTab]);

  // ── Realtime chat list (SweetSocket → SweetStore) ────────────────────────
  // The store is the canonical chat-list state: chats:upsert (user channel)
  // brings NEW conversations in, message events patch previews, typing and
  // presence arrive as ephemeral events — all without HTTP. The only reason
  // this screen still subscribes to each visible room's chat channel is to
  // receive typing/presence relays; the store listens for the rest on the
  // user channel.
  const visibleRooms = activeTab === 'All'
    ? storeRooms.filter((r) => !r.isArchived)
    : archivedRooms;
  const roomIdsRef = useRef<string[]>([]);
  useEffect(() => {
    // Resubscribe whenever the visible room set changes.
    const ids = visibleRooms.map((r) => r.chatRoomId).filter(Boolean);
    const prev = roomIdsRef.current;
    for (const id of ids) if (!prev.includes(id)) realtime.subscribe(`chat:${id}`);
    for (const id of prev) if (!ids.includes(id)) realtime.unsubscribe(`chat:${id}`);
    roomIdsRef.current = ids;
  }, [visibleRooms]);

  // Decorate rooms with live store state (typing + presence + unread) so the
  // rows render ephemeral signals that never touch the database.
  const decoratedRooms = visibleRooms.map((r) => ({
    ...r,
    typingUserIds: typingByRoom[r.chatRoomId] ?? r.typingUserIds,
    unreadCount: unreadByRoom[r.chatRoomId] ?? r.unreadCount ?? 0,
    otherUser: r.otherUser
      ? { ...r.otherUser, isOnline: presence[r.otherUser.id] ?? r.otherUser.isOnline }
      : r.otherUser,
  }));
  // ── "Load Chat History" — EXPLICIT restore ─────────────────────────────
  // The one and only path that fetches the user's previous conversations from
  // the backend. Local-first means normal Chat access never does this; this is
  // a deliberate user action (Chat menu) and may take time, so a progress
  // overlay is shown while it runs. Everything fetched is persisted locally
  // (SQLite) so future opens are instant and local-only.
  const handleLoadChatHistory = useCallback(async () => {
    setShowMenu(false);
    if (restoring) return;
    setRestoring(true);
    setRestoreProgress(null);
    try {
      const result = await restoreChatHistory(user?.id, (p) => setRestoreProgress(p));
      // Repaint from the local store — restored conversations are now local.
      const cached = await getCachedChatRooms(user?.id).catch(() => []);
      if (cached.length > 0) {
        sweetStore.hydrateRooms(cached);
        setListShimmerVisible(false);
      }
      dialogs.alert({
        variant: 'success',
        title: 'Chat history restored',
        message:
          result.rooms > 0
            ? `Restored ${result.rooms} conversation${result.rooms === 1 ? '' : 's'} locally.`
            : 'No previous conversations found on this account.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      dialogs.alert({
        variant: 'error',
        title: 'Could not restore chat history',
        message: message || 'Please try again.',
      });
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
    }
  }, [restoring, user?.id]);

  const filtered = searchText.trim()
    ? decoratedRooms.filter(
        (c) =>
          c.otherUser.name.toLowerCase().includes(searchText.toLowerCase()) ||
          c.otherUser.username.toLowerCase().includes(searchText.toLowerCase()),
      )
    : decoratedRooms;

  // Long-press room actions — every mutation is mirrored into the SweetStore
  // so the list updates immediately and stays in sync with the server.
  const roomActions = (room: ChatRoom): ActionItem[] => [
    {
      label: 'Mark as Read',
      onPress: () => {
        sweetStore.markRoomRead(room.chatRoomId);
        markRoomRead(room.chatRoomId).catch(() => {});
      },
    },
    {
      label: room.isArchived ? 'Unarchive' : 'Archive',
      onPress: async () => {
        const next = !room.isArchived;
        sweetStore.patchRoom(room.chatRoomId, { isArchived: next });
        try {
          await archiveChatRoom(room.chatRoomId, next);
        } catch {
          sweetStore.patchRoom(room.chatRoomId, { isArchived: room.isArchived });
        }
      },
    },
    {
      label: 'Delete',
      destructive: true,
      onPress: () => {
        // Optimistic remove from the store.
        sweetStore.removeRoom(room.chatRoomId);
        deleteChatRoom(room.chatRoomId).catch(() => {
          // If deletion fails restore the room.
          sweetStore.upsertRoom(room);
          dialogs.alert({ variant: 'error', title: 'Could not delete chat room', message: 'Please try again.' });
        });
      },
    },
  ];

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <View style={styles.headerActions}>
          <MsPressable
            style={styles.iconBtn}
                  onPress={() => setShowMenu(true)}
          >
            <DotsThreeVertical size={18} color={T.TEXT} />
          </MsPressable>
          <MsPressable
            style={styles.iconBtn}
                  onPress={() => setShowNewMsg(true)}
          >
            <PencilSimple size={18} color={T.TEXT} />
          </MsPressable>
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
          <MsPressable
            onPress={() => setSearchText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={14} color={T.TEXT_3} />
          </MsPressable>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {MSG_TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <MsPressable
              key={tab}
              style={[styles.tabChip, isActive && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
                    >
              <Text style={[styles.tabChipLabel, isActive && styles.tabChipLabelActive]}>
                {tab}
              </Text>
            </MsPressable>
          );
        })}
      </View>

      {/* Content — the list is ALWAYS mounted; the shimmer sits on top and
          crossfades out when loading completes (no hard cut / flash). */}
      <View style={{ flex: 1 }}>
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.chatRoomId}
          renderItem={({ item }) => (
            <ChatRoomRow item={item} onLongPress={setMenuRoom} currentUserId={user?.id ?? ''} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={refreshing}
          onRefresh={() => load(true)}
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
          >
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
          </Animated.View>
        )}
      </View>

      {/* FAB */}
      <MsPressable
        style={styles.fab}
          onPress={() => setShowNewMsg(true)}
      >
        <Plus size={22} color="#000000" />
      </MsPressable>

      <NewMessageModal visible={showNewMsg} onClose={() => setShowNewMsg(false)} />

      {/* Room long-press action sheet */}
      <MsActionSheet
        visible={!!menuRoom}
        title={menuRoom?.otherUser.name}
        subtitle={menuRoom ? `@${menuRoom.otherUser.username}` : undefined}
        actions={menuRoom ? roomActions(menuRoom) : []}
        onClose={() => setMenuRoom(null)}
      />

      {/* Chat menu — explicit "Load Chat History" restore (the ONLY path
          that fetches previous conversations from the backend) */}
      <MsActionSheet
        visible={showMenu}
        title="Messages"
        subtitle="Restore previous conversations to this device"
        actions={[
          {
            label: 'Load Chat History',
            onPress: handleLoadChatHistory,
          },
        ]}
        onClose={() => setShowMenu(false)}
      />

      {/* Restore-in-progress overlay — the user explicitly asked for this, so
          a progress state is appropriate here (normal chat access is instant). */}
      <Modal visible={restoring} transparent animationType="fade">
        <View style={styles.restoreOverlay}>
          <View style={styles.restoreCard}>
            <Spinner size="sm" color={T.ACCENT as any} />
            <Text style={styles.restoreTitle}>Restoring chat history…</Text>
            <Text style={styles.restoreSub}>
              {restoreProgress
                ? `${restoreProgress.done} of ${restoreProgress.total} conversations`
                : 'Fetching your conversations from the server…'}
            </Text>
          </View>
        </View>
      </Modal>
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
  restoreOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreCard: {
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    paddingHorizontal: 28,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
    maxWidth: 280,
  },
  restoreTitle: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    textAlign: 'center',
  },
  restoreSub: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
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
  // Opaque shimmer overlay that crossfades into the conversation list.
  listShimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.BG,
    paddingTop: 4,
  },
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
  // Preview text uses medium weight — slightly bolder than the 400 base so
  // previews are readable at 13px without becoming heavy. Unread rows step up
  // to semibold to keep the emphasis hierarchy.
  convoMsg: { fontSize: 13, fontFamily: T.FONT.medium, color: T.TEXT_2, flexShrink: 1 },
  convoMsgRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  convoMsgUnread: { color: T.TEXT, fontFamily: T.FONT.semibold },
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