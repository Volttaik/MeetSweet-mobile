/**
 * Chat Room Screen — /chat-room/[chatRoomId]
 *
 * A Chat Room is a standalone sandbox between two users. The chatRoomId
 * identifies the room; messages belong to the ROOM. The other participant's
 * identity (name, username, avatar) is resolved from the room itself via
 * getChatRoom — never from navigation params. The screen is opened with
 * ONLY a chatRoomId.
 *
 * Architecture:
 * - Chat component from the library handles message list, keyboard, swipe-to-reply,
 *   reactions, scroll, date separators, typing indicator.
 * - renderBubble → MsChatBubble (our fully custom pill/card design)
 * - renderInputToolbar → MsChatInputBar (full-featured input)
 * - renderDay → MsDateSeparator
 * - All data stays wired to the existing MeetSweet backend (room-service.ts)
 *
 * DO NOT TOUCH: auth, backend APIs, navigation, uploads, payments.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Linking,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MsPressable } from '@/components/MsPressable';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ExpoClipboard from 'expo-clipboard';
import { Image as ExpoImage } from 'expo-image';

import {
  Chat,
  type ReplyMessage,
  type MessageReaction,
  type DayProps,
} from '@kesha-antonov/react-native-chat';

import {
  ArrowLeft,
  Check,
  Checks,
  DotsThreeVertical,
  Info,
  PencilSimple,
  Trash,
  Copy as CopyIcon,
  ArrowBendUpLeft,
  DownloadSimple,
  UserMinus,
  X,
} from 'phosphor-react-native';
import { MsChatHeaderMenu } from '@/components/chat/MsChatHeaderMenu';
import { MsChatSearch }     from '@/components/chat/MsChatSearch';
import { MsChatBgPicker }   from '@/components/chat/MsChatBgPicker';
import {
  getChatBackground,
  setChatBackground as persistChatBackground,
  type ChatBackground,
} from '@/services/chat-background';

import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';

import { MsAttachmentSheet } from '@/components/MsAttachmentSheet';
import type { AttachmentResult } from '@/components/MsAttachmentSheet';
import { MsAttachmentPreview } from '@/components/MsAttachmentPreview';
import type { PendingAttachment, ConfirmedAttachment } from '@/components/MsAttachmentPreview';
import { MsUserProfileSheet } from '@/components/MsUserProfileSheet';
import { dialogs } from '@/components/MsGlobalDialogs';
import type { ProfileSheetUser } from '@/components/MsUserProfileSheet';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';

import { useAuth } from '@/contexts/AuthContext';
import { setActiveChatRoomId } from '@/contexts/NotificationsContext';
import {
  getChatRoom,
  sendRoomMessage,
  deleteRoomMessage,
  editRoomMessage,
  markRoomRead,
  clearChatRoom,
  deleteChatRoom,
  toggleRoomReaction,
  muteChatRoom,
  deriveFileType,
  normalizeMessage,
  fetchRoomHistory,
  type RoomMessage,
} from '@/services/room-service';
import { realtime, REALTIME_EVENT } from '@/services/realtime';
import { sweetStore } from '@/services/sweet-store';
import { blockUser, unblockUser } from '@/services/users';
import { uploadMedia } from '@/services/media';
import {
  getCachedMessages,
  cacheMessages,
  removeCachedMessage,
  clearCachedMessages,
  updateCachedMessage,
  getCachedChatRooms,
  setCachedMessageLocalUri,
  removeCachedRoom,
} from '@/services/chat-cache';
import {
  persistLocalMedia,
  downloadRoomMedia,
  resolveLocalMedia,
  localMediaExists,
  deleteRoomMedia,
  clearRoomMedia,
} from '@/services/chat-media';

import { MsChatBubble } from '@/components/chat/MsChatBubble';
import { MsChatInputBar } from '@/components/chat/MsChatInputBar';
import { MsChatBackground } from '@/components/chat/MsChatBackground';
import { MsTypingIndicator } from '@/components/chat/MsTypingIndicator';
import { MsRecordingIndicator } from '@/components/chat/MsRecordingIndicator';
import { playMessageReceived, playMessageSent } from '@/services/chat-sounds';
import { MsDateSeparator } from '@/components/chat/MsDateSeparator';
import type { SendPayload, PendingVoice, InlineAttachment, AttachmentSendPayload } from '@/components/chat/MsChatInputBar';
import {
  toMsMessage,
  toReplyMessage,
  type LinkPreview,
  type MsMessage,
} from '@/types/chat-message';

// ─── Constants ─────────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😍', '😢', '😮', '👏'];
// Peer presence expires after this long without a refresh (heartbeat model).
const PRESENCE_EXPIRY_MS = 60_000;
// Delete-for-everyone recall window — must match the server constant.
const DELETE_FOR_EVERYONE_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatDateLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * Real message id for server operations (delete / react / reconciliation).
 * A confirmed optimistic message keeps its local `_id` (stable list key — no
 * remount/flash) but stores the real server id in `msServerId`.
 */
function realMessageId(m: { _id: string; msServerId?: string }): string {
  return String(m.msServerId ?? m._id);
}

/**
 * Drop duplicate bubbles that share a server message id, preferring the
 * non-pending (server-confirmed) copy and the copy keyed by its real id. This
 * guards against realtime delivery racing the send confirmation: the socket
 * can deliver a sender's own confirmed message before the HTTP confirmation
 * resolves, which would otherwise leave a visible duplicate.
 */
function dedupeMessages(msgs: MsMessage[]): MsMessage[] {
  const byId = new Map<string, MsMessage>();
  for (const m of msgs) {
    const key = realMessageId(m);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, m);
      continue;
    }
    const existingPending = existing.pending !== false;
    const mPending = m.pending !== false;
    const existingCanonical = existing._id === key;
    const mCanonical = m._id === key;
    if (existingPending && !mPending) { byId.set(key, m); continue; }
    if (!existingPending && mPending) continue;
    if (!existingCanonical && mCanonical) { byId.set(key, m); continue; }
  }
  return Array.from(byId.values());
}

/**
 * Turn a server-confirmed message into the object that replaces the optimistic
 * one WITHOUT changing its list key: `_id` stays the temp id (so the bubble
 * never remounts → no send flash), while `id`/`msServerId` carry the real id.
 *
 * `fallbackReply` is the reply preview captured on the optimistic message.
 * The send response may omit the resolved reply (the backend resolves
 * reply_to only when it can look the quoted message up), so the local reply
 * relationship is preserved — the "Replying to…" quote must never disappear
 * after send or require a leave/re-enter to reappear.
 */
function finalizeTemp(
  confirmed: MsMessage,
  tempId: string,
  fallbackReply?: MsMessage['replyMessage'],
): MsMessage {
  return {
    ...confirmed,
    _id: tempId,
    id: confirmed.id || tempId,
    msServerId: confirmed.id || tempId,
    pending: false,
    sent: true,
    replyMessage: confirmed.replyMessage ?? fallbackReply,
  };
}

/**
 * Chronological comparator — newest first (index 0 = newest). The Chat list is
 * inverted, so the data array must be sorted descending by createdAt or the
 * bubbles render in the wrong order.
 */
function messageCursor(message: MsMessage): string {
  const createdAt = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : new Date(message.createdAt).toISOString();
  return `${createdAt}::${realMessageId(message)}`;
}

function byNewestFirst(a: MsMessage, b: MsMessage): number {
  const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
  const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
  if (tb !== ta) return tb - ta;
  // Deterministic tie-break for same-millisecond messages. The server orders
  // ties by `id DESC`; we mirror that here so the client never wobbles between
  // renders or reconnects, and convergences identically to the server's
  // canonical order. Identity is only used for ordering, never produced here.
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  // The screen is opened with ONLY a chatRoomId. The other participant's
  // identity is resolved from the room (getChatRoom) — never from navigation
  // params.
  const { chatRoomId: routeChatRoomId } = useLocalSearchParams<{ chatRoomId?: string }>();
  const [chatRoomId, setChatRoomId] = useState(routeChatRoomId ?? '');
  const { user } = useAuth();

  useEffect(() => {
    if (routeChatRoomId && routeChatRoomId !== chatRoomId) {
      setChatRoomId(routeChatRoomId);
    }
  }, [routeChatRoomId]);

  const sendToRoom = useCallback(async (
    body?: string,
    mediaUrl?: string,
    mediaType?: string,
    opts?: Parameters<typeof sendRoomMessage>[1],
  ): ReturnType<typeof sendRoomMessage> => {
    return sendRoomMessage(chatRoomId, {
      body,
      mediaUrl,
      mediaType: (mediaType as 'image' | 'video' | 'audio' | 'document' | 'gif' | null | undefined),
      caption: opts?.caption,
      fileName: opts?.fileName,
      fileSize: opts?.fileSize,
      mimeType: opts?.mimeType,
      audioDuration: opts?.audioDuration,
      replyToId: opts?.replyToId,
      fileType: opts?.fileType,
      isVoiceNote: opts?.isVoiceNote,
      clientMessageId: opts?.clientMessageId,
      userId: user?.id,
    });
  }, [chatRoomId, user?.id]);

  // ── Message state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<MsMessage[]>([]);

  const createClientMessageId = useCallback(
    () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
    [],
  );
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Realtime: the other participant is recording a voice note.
  const [isRecording, setIsRecording] = useState(false);
  const recordingExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Presence is a heartbeat, not a latch — the peer's "online" indicator
  // expires if no refresh arrives (crash, kill, lost relay).
  const presenceExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Typing debounce ref ────────────────────────────────────────────────────
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingBroadcastRef = useRef(false);
  const playedIncomingIdsRef = useRef(new Set<string>());

  // ── Input state ──────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('');

  // ── Reply / Edit state ───────────────────────────────────────────────────────
  const [replyMessage, setReplyMessage] = useState<ReplyMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<MsMessage | null>(null);

  // ── Reactions (optimistic, local) ────────────────────────────────────────────
  const [localReactions, setLocalReactions] = useState<Record<string, MessageReaction[]>>({});

  // ── Other user info ──────────────────────────────────────────────────────────
  // Initialized empty until the actual participant data is loaded from the
  // room. Never use chatRoomId as a temporary user id.
  const [otherUser, setOtherUser] = useState<ProfileSheetUser & { isOnline?: boolean }>({
    id: '',
    name: '',
    username: '',
    avatarUrl: null,
    isOnline: false,
  });

  // ── Context menu animation — Reanimated worklets on the UI thread ────────────
  const menuScaleAnim = useSharedValue(0.88);
  const menuOpacityAnim = useSharedValue(0);

  const menuCardStyle = useAnimatedStyle(() => ({
    opacity: menuOpacityAnim.value,
    transform: [{ scale: menuScaleAnim.value }],
  }));
  const menuOverlayStyle = useAnimatedStyle(() => ({
    opacity: menuOpacityAnim.value,
  }));
  const menuHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref to the Chat's FlatList so tapping a quoted reply can scroll to the
  // original message. The list is inverted (newest at bottom); scrollToMessage
  // (defined after the messages memo) maps message id → item index.
  const messagesListRef = useRef<FlatList<MsMessage>>(null);

  const showMenu = useCallback((msg: MsMessage) => {
    // Physical long-press feedback (native haptic engine).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMenuMsg(msg);
    setMenuVisible(true);
  }, []);

  const hideMenu = useCallback(() => {
    menuOpacityAnim.value = withTiming(0, { duration: 120 });
    menuScaleAnim.value = withTiming(0.92, { duration: 120 });
    if (menuHideTimerRef.current) clearTimeout(menuHideTimerRef.current);
    menuHideTimerRef.current = setTimeout(() => setMenuVisible(false), 120);
  }, [menuOpacityAnim, menuScaleAnim]);

  useEffect(() => () => {
    if (menuHideTimerRef.current) clearTimeout(menuHideTimerRef.current);
  }, []);

  // ── Sheets / modals ──────────────────────────────────────────────────────────
  const [menuMsg, setMenuMsg] = useState<MsMessage | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Start the context-menu entrance AFTER the Modal mounts so the scale/fade
  // animation is visible in full (starting it before mount made the menu appear
  // already partway through its animation).
  useEffect(() => {
    if (menuVisible) {
      menuScaleAnim.value = 0.88;
      menuOpacityAnim.value = 0;
      menuOpacityAnim.value = withTiming(1, { duration: 160 });
      menuScaleAnim.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.3)) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuVisible]);
  const [showAttach, setShowAttach] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [inlineAttachment, setInlineAttachment] = useState<InlineAttachment | null>(null);
  const [showInlineImagePreview, setShowInlineImagePreview] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [fullscreenImageIsOwn, setFullscreenImageIsOwn] = useState(false);
  const [fullscreenVideoUri, setFullscreenVideoUri] = useState<string | null>(null);
  const [fullscreenVideoIsOwn, setFullscreenVideoIsOwn] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  // 0–1 progress of the in-flight media upload, scoped to its optimistic bubble.
  const [uploadProgress, setUploadProgress] = useState<{ tempId: string; progress: number } | null>(null);

  // ── Delete confirmation state ────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MsMessage | null>(null);
  // Delete-for-everyone is only available inside the recall window (24h).
  const deleteForEveryoneExpired = deleteTarget
    ? Date.now() - new Date(deleteTarget.createdAt).getTime() > DELETE_FOR_EVERYONE_WINDOW_MS
    : false;

  // ── Block / room state ───────────────────────────────────────────────────────
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // ── Message info modal ───────────────────────────────────────────────────────
  const [infoMsg, setInfoMsg] = useState<MsMessage | null>(null);
  const [showMsgInfo, setShowMsgInfo] = useState(false);

  // ── Scroll-to-message highlight (brief background flash on the target) ──────
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashHighlight = useCallback((id: string) => {
    setHighlightedMsgId(id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedMsgId(null), 1600);
  }, []);
  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  // ── Chat header menu ─────────────────────────────────────────────────────────
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [showBgPicker,   setShowBgPicker]   = useState(false);
  const [chatBackground, setChatBackground] = useState<ChatBackground>({ type: 'default' });
  // Restore the persisted background for this (user, room) — survives leaving
  // the chat and app restarts. Keyed by the current user so a different
  // account on the same device never inherits the previous user's background.
  useEffect(() => {
    if (!chatRoomId) return;
    getChatBackground(chatRoomId, user?.id)
      .then((bg) => setChatBackground(bg))
      .catch(() => {});
  }, [chatRoomId, user?.id]);
  const handleBgSelect = useCallback((bg: ChatBackground) => {
    // Apply immediately (the wallpaper re-renders on the next frame) and
    // persist so it survives leaving the chat / app restart.
    setChatBackground(bg);
    if (chatRoomId) {
      persistChatBackground(chatRoomId, user?.id, bg).catch(() => {});
    }
  }, [chatRoomId, user?.id]);    // ── Resolve already-downloaded media without downloading remote files ──

  // For every message with a remote mediaUrl:
  //  • If it already has a cached localUri, verify it and keep it.
  //  • Otherwise resolve an existing local file if one is present.
  //  • Never download remote media during room hydration. Receivers download
  //    explicitly from the media bubble, which prevents large files and images
  //    from flashing through intermediate renderer states.
  //
  // State updates are BATCHED into at most two setMessages calls (one to flip
  // pending downloads to 'downloading', one to apply the final local/failed
  // patches) instead of one update per message — this avoids a render storm
  // when a room page contains many media messages.
  const ensureMediaLocal = useCallback(async (roomMsgs: RoomMessage[]) => {
    if (!chatRoomId) return;
    const uid = user?.id ?? '';
    const idOf = (msg: MsMessage) => String(msg.msServerId ?? msg._id);

    const mediaPatch = (m: RoomMessage, local: string): Partial<MsMessage> => {
      const mediaType = m.mediaType;
      return {
        localUri: local,
        msMediaStatus: 'local' as const,
        // gif carries its media in the image field — the local copy must patch
        // it or cached animated GIFs would lose their source.
        image: (mediaType === 'image' || mediaType === 'gif') ? local : undefined,
        video: mediaType === 'video' ? local : undefined,
        audio: mediaType === 'audio' ? local : undefined,
      };
    };

    const applyPatches = (patches: Array<{ id: string; patch: Partial<MsMessage> }>) => {
      if (!patches.length) return;
      setMessages((prev) =>
        prev.map((msg) => {
          const hit = patches.find((p) => p.id === idOf(msg));
          return hit ? { ...msg, ...hit.patch } : msg;
        }),
      );
    };

    const patches: Array<{ id: string; patch: Partial<MsMessage> }> = [];
    for (const m of roomMsgs) {
      if (!m.mediaUrl || !m.mediaType) continue;
      const id = String(m.id);

      // (a) Cached localUri present — verify the file is still on disk.
      if (m.localUri) {
        const stillThere = await localMediaExists(m.localUri).catch(() => false);
        if (stillThere) {
          // Local file is good — make sure the rendered message uses it.
          patches.push({ id, patch: mediaPatch(m, m.localUri) });
          continue;
        }
        // File was removed out-of-band — mark unavailable locally and fall
        // through to the download path so it can be recovered.
        m.localUri = null;
        setCachedMessageLocalUri(chatRoomId, id, null, uid).catch(() => {});
      }

      // (b) No (valid) localUri — resolve an existing local file if present.
      let local = await resolveLocalMedia(chatRoomId, id, {
        mime: m.mimeType,
        mediaType: m.mediaType,
        url: m.mediaUrl,
      }).catch(() => null);
      if (local) {
        m.localUri = local;
        setCachedMessageLocalUri(chatRoomId, id, local, uid).catch(() => {});
        patches.push({ id, patch: mediaPatch(m, local) });
      }
    }

    applyPatches(patches);
  }, [chatRoomId, user?.id]);

  // ── Load messages ─────────────────────────────────────────────────────
  // LOCAL-FIRST: cached messages are painted before any network work. A room
  // with no local representation performs one normal history request to seed
  // the cache; subsequent opens do not fetch history just to render it. Live
  // changes (new/edit/delete/reaction/clear) are delivered by SweetSocket
  // events and older pages are explicit scroll pagination — WhatsApp-style:
  // Turso is the durable source, the socket keeps the screen current, and no
  // separate context/membership API is consulted on open.
  // LOCAL-FIRST: cached messages are painted before any network work. A room
  // with no local representation performs one normal history request to seed
  // the cache; subsequent opens do not fetch history just to render it. Live
  // changes are delivered by SweetSocket and older pages are explicit scroll
  // pagination.
  const loadMessages = useCallback(async (before?: string) => {
    if (!chatRoomId) return;
    const uid = user?.id ?? '';

    // ── Local-first initial open (no `before` cursor) ────────────────────
    if (!before) {
      try {
        const cached = await getCachedMessages(chatRoomId, uid).catch(() => []);
        if (cached.length > 0) {
          setMessages(
            cached
              .map((m: RoomMessage) => toMsMessage(m, uid))
              .sort(byNewestFirst),
          );
          // Local content is on screen — never show the loading shimmer.
          setLoading(false);
          // Background maintenance is silent; rendering does not wait for it:
          // 1) resolve/persist local media for cached messages missing a
          //    local file (recovery after a failed download), 2) mark read.
          // (Removals/deletions converge via SweetSocket messages:delete and
          // chat:clear events — no context API.)
          ensureMediaLocal(cached).catch(() => {});
          markRoomRead(chatRoomId).catch(() => {});
          return;
        }
      } catch {
        // ignore — fall through to the fresh empty state below
      }
      // First open on this device: seed the local replica once. Subsequent
      // opens render from SQLite and do not fetch history merely to paint it.
      // History comes over the persistent socket (chat.history → history:set)
      // with no HTTP realtime fallback and no polling loop.
      try {
        const result = await fetchRoomHistory(chatRoomId);
        const fresh = result.messages;
        setMessages(fresh.map((m: RoomMessage) => toMsMessage(m, uid)).sort(byNewestFirst));
        setHasMore(result.hasMore ?? false);
        await cacheMessages(chatRoomId, result.messages, uid).catch(() => {});
        ensureMediaLocal(fresh).catch(() => {});
        markRoomRead(chatRoomId).catch(() => {});
      } catch {
        // Keep the empty local view available while offline.
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Explicit pagination (user scrolled up) — socket history ──
    try {
      const result = await fetchRoomHistory(chatRoomId, { before });
      const msgs = result.messages
        .map((m: RoomMessage) => toMsMessage(m, uid))
        .sort(byNewestFirst);
      // Pagination: prepend the older page to the existing list.
      setMessages((prev) => (Chat.prepend as any)(prev, msgs));
      await cacheMessages(chatRoomId, result.messages, uid).catch(() => {});
      setHasMore(result.hasMore ?? false);
      ensureMediaLocal(result.messages).catch(() => {});
    } catch {
      // Network failure: the already-rendered content stays visible.
    } finally {
      setLoading(false);
    }
  }, [chatRoomId, user?.id, ensureMediaLocal]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ── Merge incoming messages from SweetSocket ─────────────────────────
  // Live events reconcile into the visible list, persist to SQLite, and
  // resolve media without a follow-up history request.
  const handleIncomingMessages = useCallback(async (fresh: RoomMessage[], persist = true) => {
    if (!fresh?.length) return;
    const uid = user?.id ?? '';

    // Realtime events are already authorized by SweetSocket. Context membership
    // is synchronized on local hydration and explicit history operations; do not
    // perform an HTTP context read for every live event.
    const removedIds = new Set<string>();
    const incomingMap = new Map<string, MsMessage>();
    for (const m of fresh) {
      const realId = String(m.id);
      incomingMap.set(realId, toMsMessage(m, uid));
      // The server's provisional (accepted) event is keyed by the clientMessageId
      // and the persisted event by the real message id. Register the persisted
      // message under BOTH keys so it reconciles the optimistic bubble IN PLACE
      // (stable _id → no remount/flash) instead of being prepended as a
      // duplicate while the optimistic copy is still on screen. The alias entry
      // keeps `_id` = clientMessageId and `id` = real id so a stale alias can
      // never be rendered as a duplicate of its real entry.
      const clientMessageId = (m as { clientMessageId?: string }).clientMessageId;
      if (clientMessageId && clientMessageId !== realId) {
        // The alias entry keeps `_id` = clientMessageId (matches the
        // optimistic bubble's stable key) and reports the real id via
        // msServerId, so realMessageId(alias) resolves to the real id and the
        // canonical entry is dropped instead of prepended as a duplicate.
        incomingMap.set(clientMessageId, {
          ...toMsMessage(m, uid),
          _id: clientMessageId,
          msServerId: realId,
        });
      }
    }

    setMessages((prev) => {
      // 1. Filter out deleted/removed context messages
      let updated = prev.filter((m) => !removedIds.has(realMessageId(m)));

      // 2. Reconcile existing messages with updated fresh data
      updated = updated.map((m) => {
        const key = realMessageId(m);
        const freshMsg = incomingMap.get(key);
        if (freshMsg) {
          // If we matched through the clientMessageId alias (the optimistic
          // bubble keyed by its temp id), also drop the real-id entry so the
          // same message is never prepended again as a duplicate.
          if (key !== realMessageId(freshMsg)) incomingMap.delete(realMessageId(freshMsg));
          incomingMap.delete(key);
          return {
            ...m,
            ...freshMsg,
            // Keep the stable list key (temp id) and attach the server id so
            // future ops (delete/react/reconcile) use the real id.
            _id: m._id,
            msServerId: freshMsg.msServerId ?? freshMsg.id ?? m.msServerId,
            localUri: m.localUri ?? freshMsg.localUri ?? null,
            image: m.image ?? freshMsg.image,
            video: m.video ?? freshMsg.video,
            audio: m.audio ?? freshMsg.audio,
            msMediaStatus: m.msMediaStatus === 'local' ? 'local' : freshMsg.msMediaStatus,
            // Never drop the local reply relationship when the incremental
            // payload omits it (e.g. the server couldn't resolve the quoted
            // message) — the quote must stay visible.
            replyMessage: freshMsg.replyMessage ?? m.replyMessage,
          };
        }
        return m;
      });

      // 3. Prepend any newly arrived messages, newest first. The changes
      //    endpoint returns them oldest-first (ASC), so they must be re-sorted
      //    or the inverted list shows them reversed. Skip alias entries whose
      //    real entry is also in the map (the alias was registered but nothing
      //    matched it — render the canonical copy only).
      const newOnes = Array.from(incomingMap.values())
        .filter((ms) => !(ms._id !== ms.id && incomingMap.has(String(ms.id))))
        .sort(byNewestFirst);
      if (newOnes.length > 0) {
        updated = [...newOnes, ...updated];
      }

      // 4. Realtime can deliver a sender's own confirmed message before the
      //    HTTP confirmation resolves — dedupe so no visible duplicate forms.
      updated = dedupeMessages(updated);

      // 5. Deterministic ordering: the list is inverted (newest first), so it
      //    must be sorted by createdAt desc after every merge. Relying on
      //    "prepend the new ones" alone puts an incoming message with an older
      //    timestamp (clock skew, re-delivered history, edit payloads) in the
      //    wrong position. Server timestamps are authoritative; the optimistic
      //    temp messages they confirm keep their key, so this only fixes
      //    position, never identity.
      updated = updated.sort(byNewestFirst);

      if (persist) cacheMessages(chatRoomId, fresh, uid).catch(() => {});
      return updated;
    });

    // Persist media for newly received messages.
    ensureMediaLocal(fresh).catch(() => {});

    // The user is actively viewing this conversation, so a message from the
    // other participant is read the moment it arrives — advance the server's
    // last_read_at (drives the other side's read receipts) and keep the chat
    // list's unread count honest. No polling: this is the realtime path.
    if (fresh.some((m) => m.sender?.id && m.sender.id !== uid)) {
      markRoomRead(chatRoomId).catch(() => {});
    }
  }, [chatRoomId, user?.id, ensureMediaLocal]);

  // ── Realtime (SweetSocket) — live channel for this conversation ─────────
  // Messages, typing, recording, read receipts, reactions and presence arrive
  // over the single application-wide connection. HTTP is reserved for
  // explicit history pagination and durable mutations.
  useEffect(() => {
    if (!chatRoomId) return;
    const channel = `chat:${chatRoomId}`;
    realtime.subscribe(channel);

    const offMessage = realtime.on(REALTIME_EVENT.chatMessageCreated, (event) => {
      const raw = (event.payload as { message?: unknown })?.message;
      if (!raw) return;
      const msg = normalizeMessage(raw, user?.id);
      const eventRoomId = event.roomId ?? String((event.payload as { roomId?: unknown })?.roomId ?? msg?.chatRoomId ?? '');
      if (!msg?.id || eventRoomId !== chatRoomId) return;
      // The server sends clientMessageId on the event payload — attach it so
      // the persisted event can reconcile the optimistic bubble (keyed by that
      // temp id) IN PLACE instead of being prepended as a duplicate.
      const payload = event.payload as { clientMessageId?: string; status?: string };
      if (payload.clientMessageId) (msg as { clientMessageId?: string }).clientMessageId = payload.clientMessageId;
      // A delivered message from the other user clears their typing indicator.
      if (msg.sender?.id && msg.sender.id !== user?.id) {
        setIsTyping(false);
        const soundId = String(msg.id ?? payload.clientMessageId ?? '');
        if (payload.status === 'accepted' && soundId && !playedIncomingIdsRef.current.has(soundId)) {
          playedIncomingIdsRef.current.add(soundId);
          playMessageReceived();
        }
      }
      void handleIncomingMessages([msg], payload.status !== 'accepted');
    });
    const offAck = realtime.on(REALTIME_EVENT.chatMessageAck, (event) => {
      const raw = (event.payload as { message?: unknown })?.message;
      if (!raw) return;
      const msg = normalizeMessage(raw, user?.id);
      const eventRoomId = event.roomId ?? String((event.payload as { roomId?: unknown })?.roomId ?? msg?.chatRoomId ?? '');
      if (!msg?.id || eventRoomId !== chatRoomId) return;
      const payload = event.payload as { clientMessageId?: string };
      if (payload.clientMessageId) (msg as { clientMessageId?: string }).clientMessageId = payload.clientMessageId;
      void handleIncomingMessages([msg]);
    });
    const offFailed = realtime.on(REALTIME_EVENT.chatMessageFailed, (event) => {
      const payload = event.payload as { clientMessageId?: string; error?: string };
      if (!payload.clientMessageId) return;
      setMessages((prev) => prev.map((m) =>
        m._id === payload.clientMessageId || m.msServerId === payload.clientMessageId
          ? { ...m, pending: false, sent: false, status: 'failed' as const }
          : m,
      ));
    });
    const offUpdated = realtime.on(REALTIME_EVENT.chatMessageUpdated, (event) => {
      const p = event.payload as {
        messageId?: string;
        body?: string;
        caption?: string | null;
        isEdited?: boolean;
        linkPreview?: LinkPreview | null;
      };
      if (!p.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          realMessageId(m) === p.messageId
            ? {
                ...m,
                text: p.body ?? m.text,
                msCaption: p.caption !== undefined ? p.caption : m.msCaption,
                caption: p.caption !== undefined ? p.caption : m.caption,
                msIsEdited: p.isEdited ?? m.msIsEdited,
                // The server resolves link metadata asynchronously after the
                // send — merge the card in place when it arrives. Never let a
                // stale card survive an edit that removed the URL (null).
                linkPreview: p.linkPreview !== undefined ? p.linkPreview : m.linkPreview,
              }
            : m,
        ),
      );
      // Persist only the fields the server actually changed — a caption-only
      // edit must never clobber the cached body (or vice versa).
      const cachePatch: Partial<RoomMessage> = { isEdited: true };
      if (p.body !== undefined) cachePatch.body = p.body;
      if (p.caption !== undefined) cachePatch.caption = p.caption ?? undefined;
      if (p.linkPreview !== undefined) cachePatch.linkPreview = p.linkPreview as never;
      updateCachedMessage(chatRoomId, p.messageId, cachePatch, user?.id).catch(() => {});
    });
    const offDeleted = realtime.on(REALTIME_EVENT.chatMessageDeleted, (event) => {
      const p = event.payload as { messageId?: string; scope?: string; userId?: string };
      if (!p.messageId) return;
      // delete-for-me only affects the actor; recall affects everyone. Keep the
      // timeline row and replace its content with the durable placeholder.
      const affectsMe = p.scope === 'everyone' || (p.scope === 'me' && p.userId === user?.id);
      if (!affectsMe) return;
      setMessages((prev) => prev.map((m) => {
        if (realMessageId(m) === p.messageId) {
          return { ...m, text: '', msIsDeleted: true, isDeleted: true, pending: false, sent: true };
        }
        // Replies quoting the deleted message lose their preview content — the
        // quote renders "Original message deleted" instead of stale text/media.
        if (m.replyMessage && String(m.replyMessage.id) === p.messageId) {
          return { ...m, replyMessage: { ...m.replyMessage, text: '', body: '', deleted: true } };
        }
        return m;
      }));
      updateCachedMessage(chatRoomId, p.messageId, { body: null, isDeleted: true }, user?.id).catch(() => {});
      deleteRoomMedia(chatRoomId, p.messageId).catch(() => {});
    });
    const offTypingStart = realtime.on(REALTIME_EVENT.chatTypingStarted, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (!who || who === user?.id) return;
      setIsTyping(true);
      if (typingExpiryRef.current) clearTimeout(typingExpiryRef.current);
      typingExpiryRef.current = setTimeout(() => setIsTyping(false), 3500);
    });
    const offTypingStop = realtime.on(REALTIME_EVENT.chatTypingStopped, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (!who || who === user?.id) return;
      if (typingExpiryRef.current) clearTimeout(typingExpiryRef.current);
      typingExpiryRef.current = null;
      setIsTyping(false);
    });
    const offRecStart = realtime.on(REALTIME_EVENT.chatRecordingStarted, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (!who || who === user?.id) return;
      setIsRecording(true);
      if (recordingExpiryRef.current) clearTimeout(recordingExpiryRef.current);
      recordingExpiryRef.current = setTimeout(() => setIsRecording(false), 8000);
    });
    const offRecStop = realtime.on(REALTIME_EVENT.chatRecordingStopped, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (!who || who === user?.id) return;
      if (recordingExpiryRef.current) clearTimeout(recordingExpiryRef.current);
      recordingExpiryRef.current = null;
      setIsRecording(false);
    });
    const offReceipt = realtime.on(REALTIME_EVENT.messageReceipt, (event) => {
      const p = event.payload as { messageId?: string; roomId?: string; status?: 'sent' | 'delivered' | 'read' };
      if (!p.messageId || (p.roomId && p.roomId !== chatRoomId)) return;
      setMessages((prev) => prev.map((m) =>
        realMessageId(m) === p.messageId
          ? {
              ...m,
              status: p.status ?? m.status,
              delivered: p.status === 'delivered' || p.status === 'read' ? true : m.delivered,
              received: p.status === 'read' ? true : m.received,
            }
          : m,
      ));
      if (p.status) {
        updateCachedMessage(chatRoomId, p.messageId, {
          delivered: p.status === 'delivered' || p.status === 'read',
          read: p.status === 'read',
        }, user?.id).catch(() => {});
      }
    });
    const offRead = realtime.on(REALTIME_EVENT.chatMessageRead, (event) => {
      const p = event.payload as { userId?: string; lastReadAt?: string };
      if (!p.userId || p.userId === user?.id || !p.lastReadAt) return;
      const readThrough = new Date(p.lastReadAt).getTime();
      setMessages((prev) =>
        prev.map((m) =>
          m.user._id === user?.id && new Date(m.createdAt).getTime() <= readThrough
            ? { ...m, received: true, status: 'read' as const }
            : m,
        ),
      );
    });
    const offReaction = realtime.on(REALTIME_EVENT.messagesReaction, (event) => {
      const p = event.payload as {
        messageId?: string;
        reactions?: Array<{ emoji: string; userIds: string[] }>;
      };
      if (!p.messageId) return;
      const authoritative = p.reactions ?? [];
      setMessages((prev) =>
        prev.map((m) =>
          realMessageId(m) === p.messageId ? { ...m, reactions: authoritative } : m,
        ),
      );
      setLocalReactions((prev) => ({ ...prev, [p.messageId!]: authoritative }));
      updateCachedMessage(chatRoomId, p.messageId, { reactions: authoritative }, user?.id).catch(() => {});
    });
    const offPresence = realtime.on(REALTIME_EVENT.chatPresenceUpdated, (event) => {
      const p = event.payload as { userId?: string; online?: boolean };
      if (!p.userId || p.userId === user?.id) return;
      if (presenceExpiryRef.current) clearTimeout(presenceExpiryRef.current);
      if (p.online) {
        setOtherUser((prev) => (prev.id === p.userId ? { ...prev, isOnline: true } : prev));
        // Presence is a heartbeat, not a latch — if the peer vanishes without
        // an offline relay (crash, force-kill, lost frame), the indicator must
        // not stick forever. Each refresh resets the expiry.
        presenceExpiryRef.current = setTimeout(() => {
          presenceExpiryRef.current = null;
          setOtherUser((prev) => (prev.id === p.userId ? { ...prev, isOnline: false } : prev));
        }, PRESENCE_EXPIRY_MS);
      } else {
        setOtherUser((prev) => (prev.id === p.userId ? { ...prev, isOnline: false } : prev));
      }
    });

    // chat:open / chat:close — the server knows this user is actively viewing
    // the room (drives presence, read receipts and future room subscription
    // optimization). Presence is announced with the same open/close relay so
    // the other participant's isOnline indicator stays live.
    const announce = (open: boolean) => {
      realtime.relay(channel, open ? REALTIME_EVENT.chatOpen : REALTIME_EVENT.chatClose, {
        roomId: chatRoomId,
        userId: user?.id,
      });
      realtime.relay(channel, REALTIME_EVENT.chatPresenceUpdated, { userId: user?.id, online: open });
    };
    announce(true);
    sweetStore.setRoomFocused(chatRoomId);

    return () => {
      realtime.unsubscribe(channel);
      offMessage(); offAck(); offFailed(); offUpdated(); offDeleted();
      offTypingStart(); offTypingStop();
      offRecStart(); offRecStop(); offReceipt(); offRead(); offReaction(); offPresence();
      if (typingExpiryRef.current) clearTimeout(typingExpiryRef.current);
      if (recordingExpiryRef.current) clearTimeout(recordingExpiryRef.current);
      if (presenceExpiryRef.current) clearTimeout(presenceExpiryRef.current);
      announce(false);
      sweetStore.setRoomFocused(null);
    };
  }, [chatRoomId, user?.id, handleIncomingMessages]);

  // ── App-level presence ────────────────────────────────────────────────────
  // Presence follows the CONNECTION, not just screen focus: when the socket
  // (re)connects while this chat is open, announce online; when it drops or the
  // app backgrounds (socket suspends → closed), announce offline. Combined with
  // the receiving-side expiry, the peer's indicator reflects real liveness.
  useEffect(() => {
    if (!chatRoomId) return;
    const offStatus = realtime.onStatus((status) => {
      const channel = `chat:${chatRoomId}`;
      if (status === 'open') {
        realtime.relay(channel, REALTIME_EVENT.chatPresenceUpdated, { userId: user?.id, online: true });
      } else if (status === 'closed' || status === 'reconnecting') {
        realtime.relay(channel, REALTIME_EVENT.chatPresenceUpdated, { userId: user?.id, online: false });
      }
    });
    return offStatus;
  }, [chatRoomId, user?.id]);

  // ── Notification suppression ──────────────────────────────────────────────
  // While this chat is on screen, pushes for THIS room are suppressed (the
  // message is already arriving over the socket); every other notification
  // still banners normally.
  useEffect(() => {
    setActiveChatRoomId(chatRoomId ?? null);
    return () => setActiveChatRoomId(null);
  }, [chatRoomId]);

  // ── Typing broadcast (client → server) ──────────────────────────────────
  // When the user types, fire a debounced ephemeral event over the shared
  // SweetSocket connection. No database or HTTP change-check is involved.
  const sendTypingBroadcast = useCallback(() => {
    if (!chatRoomId) return;
    realtime.relay(`chat:${chatRoomId}`, REALTIME_EVENT.chatTypingStarted, {
      userId: user?.id,
    });
  }, [chatRoomId, user?.id]);

  const sendTypingStop = useCallback(() => {
    if (!chatRoomId) return;
    realtime.relay(`chat:${chatRoomId}`, REALTIME_EVENT.chatTypingStopped, {
      userId: user?.id,
    });
  }, [chatRoomId, user?.id]);

  useEffect(() => {
    if (!chatRoomId || isBlocked) return;
    if (inputText.trim().length === 0) {
      if (typingBroadcastRef.current) {
        typingBroadcastRef.current = false;
        sendTypingStop();
      }
      return;
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingBroadcastRef.current = true;
      sendTypingBroadcast();
    }, 250);

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [inputText, chatRoomId, isBlocked, sendTypingBroadcast, sendTypingStop]);

  // ── Clear typing on unmount (leaving the conversation) ────────────────────
  useEffect(() => {
    return () => {
      if (typingBroadcastRef.current) {
        typingBroadcastRef.current = false;
        sendTypingStop();
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [chatRoomId, sendTypingStop]);

  // ── Resolve the other participant FROM THE ROOM (not navigation params) ──
  // Local-first: seed from the SQLite room cache immediately so the header
  // never flashes a placeholder identity, then overwrite with fresh server
  // truth when the HTTP fetch resolves.
  useEffect(() => {
    if (!chatRoomId) return;
    let cancelled = false;
    (async () => {
      // 1. Seed instantly from local cache (SQLite read — no network wait).
      const cached = await getCachedChatRooms(user?.id).catch(() => []);
      const cachedRoom = cached.find((r) => r.chatRoomId === chatRoomId);
      if (cancelled) return;
      if (cachedRoom?.otherUser?.id) {
        setOtherUser({
          id: cachedRoom.otherUser.id,
          name: cachedRoom.otherUser.name || 'Chat',
          username: cachedRoom.otherUser.username,
          avatarUrl: cachedRoom.otherUser.avatarUrl ?? null,
          isOnline: cachedRoom.otherUser.isOnline ?? false,
        });
        if (cachedRoom.isMuted !== undefined) setIsMuted(Boolean(cachedRoom.isMuted));
      }

      // 2. Fetch fresh server truth and overwrite (never downgrade the header).
      try {
        const room = await getChatRoom(chatRoomId);
        if (cancelled) return;
        // Hydrate room-level flags the backend already knows, so the header
        // menu reflects the server truth on open (not a stale local default).
        setIsMuted(Boolean(room.isMuted));
        if (room.isBlocked !== undefined) {
          setIsBlocked(Boolean(room.isBlocked));
        }
        const participants = room.participants ?? [];
        const other =
          participants.find((p) => p.id !== user?.id) ??
          (room.otherUser?.id ? room.otherUser : undefined);
        if (other) {
          setOtherUser({
            id: other.id,
            name: other.name || 'Chat',
            username: other.username,
            avatarUrl: other.avatarUrl ?? null,
            isOnline: other.isOnline ?? false,
          });
        }
      } catch {
        // Cache already seeded — keep whatever local identity we have.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatRoomId, user?.id]);

  // ── Hydrate block status from local store ───────────────────────────────────
  // The backend User/Room payloads don't expose "is this user blocked by me",
  // and Task 11 adds no backend changes, so we track block status client-side:
  // block/unblock writes a flag keyed by username; on mount we read it so the
  // banner + disabled input reflect the persisted state across reloads.
  // chatRoomId is never affected by blocking — the room container survives.
  useEffect(() => {
    if (!otherUser.username || !user?.id) return;
    (async () => {
      try {
        // Keyed by CURRENT user id so a block is per-account — Account B can
        // never inherit Account A's block state for the same person.
        const raw = await AsyncStorage.getItem(`@ms_blocked_${user.id}_${otherUser.username}`);
        setIsBlocked(raw === '1');
      } catch {
        // ignore — defaults to not blocked
      }
    })();
  }, [otherUser.username, user?.id]);

  // ── Load earlier (older) messages ────────────────────────────────────────────
  const handleLoadEarlier = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1];
    await loadMessages(messageCursor(oldest));
    setLoadingMore(false);
  }, [hasMore, loadingMore, messages, loadMessages]);

  // ── Camera press — direct camera launch ──────────────────────────────────────
  const handleCameraPress = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        dialogs.alert({ title: 'Permission required', message: 'Please allow camera access to take photos.' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        handleAttachmentResult({
          uri: asset.uri,
          type: (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video',
          mimeType: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
          fileName: asset.fileName ?? (asset.type === 'video' ? 'video.mp4' : 'photo.jpg'),
        });
      }
    } catch {
      // user cancelled or camera unavailable
    }
  }, []);

  // ── Send handler ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (payload: SendPayload) => {
    if (!chatRoomId) return;
    // A blocked room is inactive — no messages may leave the device. The
    // input is also disabled, but this guard is the authoritative gate so a
    // stray send cannot bypass it.
    if (isBlocked) return;

    // ── Edit mode ────────────────────────────────────────────────────────────
    if (editingMsg) {
      const editId = String(editingMsg._id);
      const isCaptionEdit = Boolean(
        editingMsg.msMediaType || editingMsg.msIsVoiceNote || editingMsg.image || editingMsg.video || editingMsg.audio,
      );
      const newText = payload.text ?? '';
      const prevText = isCaptionEdit ? (editingMsg.msCaption ?? '') : (editingMsg.text ?? '');
      const prevCaption = editingMsg.msCaption ?? null;
      const prevEdited = editingMsg.msIsEdited ?? false;
      // Optimistic: update the visible message immediately. A caption edit
      // changes only the caption — the media body stays untouched.
      setMessages((prev) =>
        prev.map((m) =>
          m._id === editingMsg._id
            ? isCaptionEdit
              ? { ...m, msCaption: newText, caption: newText, msIsEdited: true }
              : { ...m, text: newText, msIsEdited: true }
            : m,
        ),
      );
      setEditingMsg(null);
      setInputText('');
      try {
        await editRoomMessage(
          chatRoomId,
          editId,
          isCaptionEdit ? undefined : newText,
          isCaptionEdit ? newText : undefined,
        );
        // Server confirmed — mirror the edit into SQLite by messageId. Do NOT
        // create a new message; the row is preserved, only its body changes.
        const cachePatch: Partial<RoomMessage> = { isEdited: true };
        if (isCaptionEdit) cachePatch.caption = newText;
        else cachePatch.body = newText;
        await updateCachedMessage(chatRoomId, editId, cachePatch, user?.id).catch(() => {});
      } catch {
        // Revert the visible + cached state — the server did not confirm.
        setMessages((prev) =>
          prev.map((m) =>
            m._id === editingMsg._id
              ? isCaptionEdit
                ? { ...m, msCaption: prevCaption ?? '', caption: prevCaption, msIsEdited: prevEdited }
                : { ...m, text: prevText, msIsEdited: prevEdited }
              : m,
          ),
        );
        dialogs.alert({ variant: 'error', title: 'Could not edit message' });
      }
      return;
    }

    const tempId = createClientMessageId();
    const now = new Date();

    // ── Text message ─────────────────────────────────────────────────────────
    if (payload.text) {
      const capturedReply = replyMessage;
      const optimistic: MsMessage = {
        _id: tempId,
        id: tempId,
        chatRoomId: chatRoomId ?? '',
        messageType: 'text',
        text: payload.text,
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        sent: false,
        pending: true,
        replyMessage: capturedReply
          ? {
              id: String(capturedReply._id || ''),
              _id: String(capturedReply._id || ''),
              text: capturedReply.text,
              user: {
                ...capturedReply.user,
                _id: String(capturedReply.user._id),
                avatar: typeof capturedReply.user.avatar === 'string' ? capturedReply.user.avatar : undefined,
              },
            }
          : undefined,
      } as any;
      setMessages((prev) => Chat.append(prev, [optimistic]));
      playMessageSent();
      setReplyMessage(null);
      setInputText('');
      try {
        const res = await sendToRoom(payload.text, undefined, undefined, {
          replyToId: capturedReply ? String(capturedReply._id) : undefined,
          clientMessageId: tempId,
        });
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        // The HTTP response is the authoritative server confirmation — persist
        // it into SQLite IMMEDIATELY, independent of the WebSocket echo.
        // Relying on the echo alone meant a message could vanish on re-entry
        // whenever the echo was missed (socket down, reconnect gap): local
        // durability must not depend on realtime delivery.
        cacheMessages(chatRoomId, [res.message], user?.id ?? '').catch(() => {});
        // Pass the optimistic reply preview as the fallback so the quote stays
        // visible even if the send response omits the resolved reply.
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? finalizeTemp(confirmed, tempId, optimistic.replyMessage)
              : m,
          ),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
        );
      }
      return;
    }

    // ── Voice message ────────────────────────────────────────────────────────
    if (payload.voice) {
      const { uri, duration } = payload.voice;
      const optimistic: MsMessage = {
        _id: tempId,
        id: tempId,
        chatRoomId: chatRoomId ?? '',
        messageType: 'audio',
        text: '',
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        audio: uri,
        msMediaType: 'audio',
        // A voice note is an audio MESSAGE (inline waveform), distinct from an
        // uploaded audio FILE attachment. Flag it so the renderer picks the
        // voice bubble, not the file card.
        msIsVoiceNote: true,
        msFileType: 'm4a',
        msMediaStatus: 'local',
        msAudioDuration: duration,
        sent: false,
        pending: true,
      };
      setMessages((prev) => (Chat.append as any)(prev, [optimistic]));
      playMessageSent();
      try {
        setUploadingMedia(true);
        const uploaded = await uploadMedia(uri, 'audio/m4a', 'voice.m4a', (progress) => {
          setUploadProgress({ tempId, progress });
        });
        setUploadProgress(null);
        const res = await sendToRoom(undefined, uploaded.url, 'audio', {
          audioDuration: duration,
          isVoiceNote: true,
          fileType: 'm4a',
          clientMessageId: tempId,
        });
        // Server returns media_type: null for audio — preserve local audio metadata.
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        // Authoritative server confirmation — persist the message row NOW (see
        // the text path for why local durability must not depend on the echo).
        cacheMessages(chatRoomId, [res.message], user?.id ?? '').catch(() => {});
        // Persist the original local recording into the room's media dir.
        const localAudio = await persistLocalMedia(chatRoomId, String(res.message.id), uri, {
          mime: 'audio/m4a',
          mediaType: 'audio',
        }).catch(() => null);
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? {
                  ...finalizeTemp(confirmed, tempId),
                  msMediaType: 'audio' as const,
                  msIsVoiceNote: true,
                  msFileType: 'm4a',
                  msMediaStatus: 'local' as const,
                  localUri: localAudio ?? uri,
                  audio: localAudio ?? uri,
                  msAudioDuration: duration,
                }
              : m,
          ),
        );
        if (localAudio) {
          setCachedMessageLocalUri(chatRoomId, String(res.message.id), localAudio, user?.id).catch(() => {});
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
        );
      } finally {
        setUploadingMedia(false);
      }
    }
  }, [chatRoomId, isBlocked, editingMsg, replyMessage, user]);

  // ── Attachment confirmed ──────────────────────────────────────────────────────
  const handleAttachmentConfirmed = useCallback(async (confirmed: ConfirmedAttachment) => {
    setPendingAttachment(null);
    if (!chatRoomId) return;
    const { uri, type: attachType } = confirmed;
    const tempId = createClientMessageId();
    const now = new Date();

    // ── Voice / audio from MsAttachmentPreview ────────────────────────────
    // Voice notes (type==='voice') are inline audio MESSAGES → waveform bubble.
    // Uploaded audio files (type==='audio') are audio FILE attachments → file
    // card. Both share mediaType 'audio'; the isVoiceNote flag distinguishes
    // them so the Auth Tree preserves message-type-vs-file-type. Both must
    // always be treated as audio — never as video.
    if (attachType === 'voice' || attachType === 'audio') {
      const isVoiceNote = attachType === 'voice';
      const duration = confirmed.duration ?? 0;
      const optimistic: MsMessage = {
        _id: tempId,
        id: tempId,
        chatRoomId: chatRoomId ?? '',
        messageType: 'audio',
        text: '',
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        audio: uri,
        msMediaType: 'audio',
        msIsVoiceNote: isVoiceNote,
        msFileType: isVoiceNote ? 'm4a' : (confirmed.fileName?.split('.').pop()?.toLowerCase() ?? 'mp3'),
        msMediaStatus: 'local',
        msAudioDuration: duration,
        // An uploaded audio file attachment carries a filename (file-attachment UI);
        // a voice note does not (inline waveform).
        msFileName: isVoiceNote ? undefined : confirmed.fileName,
        sent: false,
        pending: true,
      };
      setMessages((prev) => (Chat.append as any)(prev, [optimistic]));
      playMessageSent();
      try {
        setUploadingMedia(true);
        // Always upload with correct audio MIME — never video/mp4
        const mime = confirmed.mimeType?.startsWith('audio/') ? confirmed.mimeType : 'audio/m4a';
        const uploaded = await uploadMedia(uri, mime, confirmed.fileName, (progress) => {
          setUploadProgress({ tempId, progress });
        });
        setUploadProgress(null);
        const res = await sendToRoom(
          undefined,
          uploaded.url,
          'audio',
          {
            audioDuration: duration,
            // Preserve client-side Auth Tree metadata through the round trip.
            isVoiceNote,
            fileType: optimistic.msFileType ?? undefined,
            fileName: isVoiceNote ? undefined : confirmed.fileName,
            mimeType: mime,
            clientMessageId: tempId,
          },
        );
        // Server sends back media_type: null for audio. Preserve the local
        // audio metadata so the bubble renders correctly (voice waveform OR
        // audio file card) regardless of the server's media_type.
        const conf = toMsMessage(res.message, user?.id ?? '');
        // Authoritative server confirmation — persist the message row NOW (see
        // the text path for why local durability must not depend on the echo).
        cacheMessages(chatRoomId, [res.message], user?.id ?? '').catch(() => {});
        // Persist the original local audio file into the room's media dir.
        const localAudio = await persistLocalMedia(chatRoomId, String(res.message.id), uri, {
          mime: mime,
          mediaType: 'audio',
        }).catch(() => null);
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? {
                  ...finalizeTemp(conf, tempId),
                  msMediaType: 'audio' as const,
                  msIsVoiceNote: isVoiceNote,
                  msFileType: optimistic.msFileType,
                  msMediaStatus: 'local' as const,
                  msFileName: isVoiceNote ? undefined : (conf.msFileName ?? confirmed.fileName),
                  localUri: localAudio ?? uri,
                  audio: localAudio ?? uri,
                  msAudioDuration: duration,
                }
              : m,
          ),
        );
        if (localAudio) {
          setCachedMessageLocalUri(chatRoomId, String(res.message.id), localAudio, user?.id).catch(() => {});
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
        );
      } finally {
        setUploadingMedia(false);
      }
      return;
    }

    // ── Image / GIF / Sticker / Video / Document ────────────────────────────
    // GIF is a media-first type: the picker returns type 'gif' with an
    // animated asset; it uploads as image/gif, persists as a .gif local file
    // (animation survives caching), and renders as a compact animated bubble.
    // Stickers ride the same pipeline but carry their real on-disk format:
    // they travel as mediaType 'gif' (the server schema has no 'sticker'
    // type), while the MIME/file type stays image/webp so the local file keeps
    // the webp extension and the renderer shows an animated image without the
    // GIF badge.
    const isSticker = attachType === 'sticker';
    const mediaType = (isSticker ? 'gif' : attachType) as 'image' | 'video' | 'gif' | 'document';
    const isGif = mediaType === 'gif';
    // FILE TYPE for this message — derived from the attachment's MIME/filename
    // so the Auth Tree carries the on-disk format alongside the message type.
    const sendFileType =
      isGif && !isSticker ? 'gif'
      : deriveFileType(confirmed.mimeType, confirmed.fileName) ??
        (mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : null);
    const optimistic: MsMessage = {
      _id: tempId,
      id: tempId,
      chatRoomId: chatRoomId ?? '',
      messageType: (mediaType as MsMessage['messageType']) || 'file',
      text: confirmed.caption ?? '',
      msCaption: confirmed.caption ?? undefined,
      createdAt: now,
      user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
      image: (mediaType === 'image' || isGif) ? uri : undefined,
      video: mediaType === 'video' ? uri : undefined,
      msMediaType: mediaType as MsMessage['msMediaType'],
      msFileType: sendFileType,
      msMediaStatus: 'local',
      msFileName: mediaType === 'document' ? confirmed.fileName : undefined,
      msFileSize: mediaType === 'document' ? confirmed.fileSize : undefined,
      msMimeType: (mediaType === 'document' || isGif) ? confirmed.mimeType : undefined,
      sent: false,
      pending: true,
    };
    setMessages((prev) => (Chat.append as any)(prev, [optimistic]));
    playMessageSent();
    try {
      setUploadingMedia(true);
      const mime =
        mediaType === 'image'
          ? (confirmed.mimeType?.startsWith('image/') ? confirmed.mimeType : 'image/jpeg')
        : isGif ? (confirmed.mimeType || 'image/gif')
        : mediaType === 'video' ? 'video/mp4'
        : (confirmed.mimeType || 'application/octet-stream');
      const uploaded = await uploadMedia(uri, mime, confirmed.fileName, (progress) => {
        setUploadProgress({ tempId, progress });
      });
      setUploadProgress(null);
        const res = await sendToRoom(
          confirmed.caption,
          uploaded.url,
          mediaType,
          {
            fileType: sendFileType ?? undefined,
            fileName: confirmed.fileName,
            fileSize: confirmed.fileSize,
            mimeType: mime,
            clientMessageId: tempId,
          },
        );
      const conf = toMsMessage(res.message, user?.id ?? '');
      // Authoritative server confirmation — persist the message row NOW (see
      // the text path for why local durability must not depend on the echo).
      // Without this, a confirmed image could vanish on re-entry whenever the
      // socket echo was missed — the exact "image disappears / only appears
      // after another text message" bug.
      cacheMessages(chatRoomId, [res.message], user?.id ?? '').catch(() => {});
      // Persist the original local picker file into the room's media dir
      // instead of discarding the temporary URI.
      const localFile = await persistLocalMedia(chatRoomId, String(res.message.id), uri, {
        mime,
        mediaType: mediaType,
      }).catch(() => null);
      // Keep the message keyed by its temp id (finalizeTemp) and keep rendering
      // the ORIGINAL picker file for the rest of this session — switching to the
      // persisted copy (a different path) mid-send is what caused the image
      // flash/glitch. The persisted copy is still cached for future sessions.
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId
            ? {
                ...finalizeTemp(conf, tempId),
                msFileType: sendFileType,
                msMediaStatus: 'local' as const,
                localUri: localFile ?? uri,
                image: (mediaType === 'image' || isGif) ? (localFile ?? uri) : conf.image,
                video: mediaType === 'video' ? (localFile ?? uri) : conf.video,
                msFileName: mediaType === 'document' ? (conf.msFileName ?? confirmed.fileName) : conf.msFileName,
                msFileSize: mediaType === 'document' ? (conf.msFileSize ?? confirmed.fileSize) : conf.msFileSize,
                msMimeType: mediaType === 'document' ? (conf.msMimeType ?? mime) : conf.msMimeType,
              }
            : m,
        ),
      );
      if (localFile) {
        setCachedMessageLocalUri(chatRoomId, String(res.message.id), localFile, user?.id).catch(() => {});
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
      );
    } finally {
      setUploadingMedia(false);
    }
  }, [chatRoomId, user]);

  // ── Long-press menu ───────────────────────────────────────────────────────────
  const handleLongPress = useCallback((_ctx: unknown, msg: MsMessage) => {
    showMenu(msg);
  }, [showMenu]);

  // ── Show delete confirmation ───────────────────────────────────────────────
  const handleDeletePress = useCallback(() => {
    if (!menuMsg) return;
    hideMenu();
    setDeleteTarget(menuMsg);
    setMenuMsg(null);
    setShowDeleteConfirm(true);
  }, [menuMsg, hideMenu]);

  const handleDelete = useCallback(async (forEveryone = false) => {
    setShowDeleteConfirm(false);
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    const id = realMessageId(target);
    const scope: 'me' | 'everyone' = forEveryone ? 'everyone' : 'me';

    // Keep a stable placeholder while the server confirms the delete.
    setMessages((prev) =>
      prev.map((m) => (m._id === target._id
        ? { ...m, text: '', msIsDeleted: true, isDeleted: true, pending: false, sent: true }
        : m)),
    );

    try {
      await deleteRoomMessage(chatRoomId, id, scope);
      // Server confirmed — keep the chronological placeholder in both the
      // visible list and the local replica. Media may be removed locally.
      await updateCachedMessage(chatRoomId, id, { body: null, isDeleted: true }, user?.id).catch(() => {});
      await deleteRoomMedia(chatRoomId, id).catch(() => {});
      // Drop the optimistic-reaction entry for this message so the
      // localReactions map doesn't accumulate stale ids for deleted messages.
      setLocalReactions((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      // Revert the soft-delete appearance because the server rejected it.
      setMessages((prev) =>
        prev.map((m) => (m._id === target._id ? { ...m, msIsDeleted: false, isDeleted: false } : m)),
      );
      dialogs.alert({ variant: 'error', title: 'Could not delete', message: forEveryone ? 'The message could not be deleted for everyone. Please try again.' : 'The message could not be deleted for you. Please try again.' });
    }
  }, [deleteTarget, chatRoomId, user?.id]);

  // ── Message Info ──────────────────────────────────────────────────────────
  const handleMsgInfo = useCallback(() => {
    if (!menuMsg) return;
    hideMenu();
    setInfoMsg(menuMsg);
    setMenuMsg(null);
    setShowMsgInfo(true);
  }, [menuMsg, hideMenu]);

  // ── Mute / unmute room (per doc §1.7, §11.6) ──────────────────────────────
  const handleMuteUser = useCallback(() => {
    setShowProfileSheet(false);
    const next = !isMuted;
    setIsMuted(next);
    muteChatRoom(chatRoomId, next).catch(() => {
      setIsMuted(isMuted);
      dialogs.alert({ variant: 'error', title: 'Could not update chat', message: `Could not ${next ? 'mute' : 'unmute'} this chat.` });
    });
  }, [isMuted, chatRoomId]);

  // ── Block user ────────────────────────────────────────────────────────────
  const handleBlockUser = useCallback(() => {
    setShowProfileSheet(false);
    dialogs.confirm({
      title: isBlocked ? 'Unblock User' : 'Block User',
      message: isBlocked
        ? `Unblock ${otherUser.name}? They will be able to message you again.`
        : `Block ${otherUser.name}? You will not be able to send or receive messages.`,
      confirmLabel: isBlocked ? 'Unblock' : 'Block',
      destructive: true,
      onConfirm: async () => {
        const username = otherUser.username;
        const next = !isBlocked;
        setIsBlocked(next);
        try {
          if (next) {
            await blockUser(username);
          } else {
            await unblockUser(username);
          }
          // Persist the block flag client-side so it survives reloads.
          // chatRoomId is untouched — blocking only gates this client.
          // Keyed by CURRENT user id: the block state is per-account and
          // must never leak across a logout → different-account login.
          if (username && user?.id) {
            await AsyncStorage.setItem(
              `@ms_blocked_${user.id}_${username}`,
              next ? '1' : '0',
            );
          }
        } catch {
          // revert on failure
          setIsBlocked(isBlocked);
          dialogs.alert({ variant: 'error', title: 'Could not update user', message: `Could not ${next ? 'block' : 'unblock'} user. Please try again.` });
        }
      },
    });
  }, [isBlocked, otherUser.name, otherUser.username, user?.id]);

  // ── Delete chat room from list ────────────────────────────────────────
  const handleDeleteRoom = useCallback(() => {
    setShowProfileSheet(false);
    dialogs.confirm({
      title: 'Delete Chat',
      message: 'This will remove the chat from your chat list. Messages will not be deleted for the other person.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        if (chatRoomId) {
          try {
            await deleteChatRoom(chatRoomId);
            await removeCachedRoom(chatRoomId, user?.id).catch(() => {});
            await clearCachedMessages(chatRoomId, user?.id).catch(() => {});
            await clearRoomMedia(chatRoomId).catch(() => {});
            router.back();
          } catch {
            dialogs.alert({ variant: 'error', title: 'Could not delete chat room', message: 'Please try again.' });
          }
        }
      },
    });
  }, [chatRoomId, user?.id]);

  // ── Clear chat (room-level; the room stays the permanent container) ────
  const handleClearRoom = useCallback(() => {
    setShowProfileSheet(false);
    dialogs.confirm({
      title: 'Clear Chat',
      message: 'All messages in this chat will be permanently cleared for you. This cannot be undone.',
      confirmLabel: 'Clear All',
      destructive: true,
      onConfirm: async () => {
        if (chatRoomId) {
          try {
            await clearChatRoom(chatRoomId);
            setMessages([]);
            setLocalReactions({});
            await clearCachedMessages(chatRoomId, user?.id).catch(() => {});
            await clearRoomMedia(chatRoomId).catch(() => {});
          } catch {
            dialogs.alert({ variant: 'error', title: 'Could not clear chat room', message: 'Please try again.' });
          }
        }
      },
    });
  }, [chatRoomId, user?.id]);

  const handleEdit = useCallback(() => {
    if (!menuMsg) return;
    // Text messages edit their body; media messages with a caption edit the
    // caption. Messages with neither have nothing to edit — guard here so
    // Edit can never be triggered through another route even if the menu
    // button is hidden.
    const isCaptionEdit = Boolean(
      menuMsg.msMediaType || menuMsg.msIsVoiceNote || menuMsg.image || menuMsg.video || menuMsg.audio,
    );
    if (isCaptionEdit) {
      if (!menuMsg.msCaption) return;
      hideMenu();
      setEditingMsg(menuMsg);
      setInputText(menuMsg.msCaption ?? '');
      setMenuMsg(null);
      return;
    }
    if (!menuMsg.text) return;
    hideMenu();
    setEditingMsg(menuMsg);
    setInputText(menuMsg.text ?? '');
    setMenuMsg(null);
  }, [menuMsg, hideMenu]);

  const handleCopy = useCallback(async () => {
    if (!menuMsg?.text) return;
    hideMenu();
    await ExpoClipboard.setStringAsync(menuMsg.text);
    setMenuMsg(null);
  }, [menuMsg, hideMenu]);

  const handleMenuReply = useCallback(() => {
    if (!menuMsg) return;
    hideMenu();
    setReplyMessage(toReplyMessage(menuMsg) as any);
    setMenuMsg(null);
  }, [menuMsg, hideMenu]);

  // ── Reaction handler ──────────────────────────────────────────────────────────
  const handleReaction = useCallback((msg: MsMessage, emoji: string) => {
    const userId = user?.id ?? '';
    const msgId = realMessageId(msg);

    // Optimistic update immediately
    setLocalReactions((prev) => {
      const curr = prev[msgId] ?? msg.reactions ?? [];
      const existing = curr.find((r) => r.emoji === emoji);
      let next: MessageReaction[];
      if (existing) {
        const ids = existing.userIds.filter((id) => id !== userId);
        next = ids.length === 0
          ? curr.filter((r) => r.emoji !== emoji)
          : curr.map((r) => r.emoji === emoji ? { ...r, userIds: ids } : r);
      } else {
        next = [...curr, { emoji, userIds: [userId] }];
      }
      return { ...prev, [msgId]: next };
    });

    // Persist only messages that already have a durable server identity.
    if (!msg.pending && !msgId.startsWith('msg_')) {
      toggleRoomReaction(chatRoomId, msgId, emoji).then((result) => {
        // Sync server reaction state
        if (result?.reactions) {
          const serverReactions = result.reactions.map((r: any) => ({
            emoji: r.emoji,
            userIds: (r.user_ids ?? r.userIds ?? []) as string[],
          }));
          setLocalReactions((prev) => ({
            ...prev,
            [msgId]: serverReactions,
          }));
          // Mirror the server-authoritative reaction state into SQLite by
          // messageId so it survives reload. Reaction state stays associated
          // with this specific messageId.
          updateCachedMessage(chatRoomId, msgId, {
            reactions: serverReactions,
          }, user?.id).catch(() => {});
        }
      }).catch(() => {
        // Already optimistically updated — revert on failure
        setLocalReactions((prev) => {
          const curr = prev[msgId] ?? [];
          const existing = curr.find((r) => r.emoji === emoji);
          let reverted: MessageReaction[];
          if (existing) {
            // Was added → remove it back
            const ids = existing.userIds.filter((id) => id !== userId);
            reverted = ids.length === 0
              ? curr.filter((r) => r.emoji !== emoji)
              : curr.map((r) => r.emoji === emoji ? { ...r, userIds: ids } : r);
          } else {
            // Was removed → add it back
            reverted = [...curr, { emoji, userIds: [userId] }];
          }
          return { ...prev, [msgId]: reverted };
        });
      });
    }
  }, [user?.id]);


  // ── Open a document/audio-file attachment ──────────────────────────────────
  // Local-first: if the persistent local copy already exists, open it; if not,
  // download it once (surfacing a 'downloading' status so the file card shows a
  // loading state), persist the localUri, then open from the local file. This
  // implements Task §8/§9 — the receiver downloads on demand and reuses the
  // local file afterward, never re-downloading the same file.
  const handleOpenFile = useCallback(async (msg: MsMessage) => {
    if (!chatRoomId) return;
    const id = realMessageId(msg);

    const openUri = async (uri: string) => {
      try {
        await Linking.openURL(uri);
      } catch {
        dialogs.alert({ title: 'Cannot open file', message: 'No app is available to open this file type.' });
      }
    };

    // Already have a local file — verify it's still on disk, then open it.
    if (msg.localUri && (await localMediaExists(msg.localUri).catch(() => false))) {
      openUri(msg.localUri);
      return;
    }

    // No local copy (or it was manually removed) — download on demand. The
    // remote source URL lives on msMediaUrl (documents/audio-files don't use
    // the library image/video/audio fields).
    const remoteUrl = msg.msMediaUrl ?? msg.image ?? msg.video ?? msg.audio ?? null;
    const mediaType = msg.msMediaType;
    if (!mediaType || !remoteUrl) return;

    // Mark downloading so MsFileCard shows a loading indicator.
    setMessages((prev) =>
      prev.map((m) => (String(m._id) === id ? { ...m, msMediaStatus: 'downloading' as const } : m)),
    );

    // Resolve an existing local file first (cheap), else download.
    let local = await resolveLocalMedia(chatRoomId, id, {
      mime: msg.msMimeType,
      mediaType: (mediaType === 'text' ? null : mediaType) as any,
      url: remoteUrl,
    }).catch(() => null);
    if (!local) {
      local = await downloadRoomMedia(chatRoomId, id, remoteUrl, {
        mime: msg.msMimeType,
        mediaType: (mediaType === 'text' ? null : mediaType) as any,
      }).catch(() => null);
    }

    if (local) {
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === id
            ? {
                ...m,
                localUri: local,
                msMediaStatus: 'local' as const,
                image: m.msMediaType === 'image' ? local : m.image,
                video: m.msMediaType === 'video' ? local : m.video,
                audio: m.msMediaType === 'audio' ? local : m.audio,
              }
            : m,
        ),
      );
      setCachedMessageLocalUri(chatRoomId, id, local, user?.id).catch(() => {});
      openUri(local);
    } else {
      // Download failed — surface a retry affordance and try the remote URL
      // directly as a last resort (some files open from a remote URL).
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === id ? { ...m, msMediaStatus: 'failed' as const } : m)),
      );
      if (remoteUrl) openUri(remoteUrl);
    }
  }, [chatRoomId]);

  // ── Explicit media download ────────────────────────────────────────────────
  // Remote media remains a stable message until the receiver asks for it. The
  // local file is then keyed by the stable server message id and merged in
  // place, so the bubble never changes identity or flashes through empty data.
  const handleMediaDownload = useCallback(async (msg: MsMessage) => {
    if (!chatRoomId) return;
    const id = realMessageId(msg);
    const remoteUrl = msg.msMediaUrl ?? msg.image ?? msg.video ?? msg.audio ?? null;
    const mediaType = msg.msMediaType;
    if (!remoteUrl || !mediaType) return;

    setMessages((prev) => prev.map((m) =>
      realMessageId(m) === id ? { ...m, msMediaStatus: 'downloading' as const } : m,
    ));
    const local = await downloadRoomMedia(chatRoomId, id, remoteUrl, {
      mime: msg.msMimeType,
      mediaType: mediaType as 'image' | 'video' | 'audio' | 'document' | 'gif',
    }).catch(() => null);

    if (!local) {
      setMessages((prev) => prev.map((m) =>
        realMessageId(m) === id ? { ...m, msMediaStatus: 'failed' as const } : m,
      ));
      return;
    }

    setMessages((prev) => prev.map((m) => realMessageId(m) === id ? {
      ...m,
      localUri: local,
      msMediaStatus: 'local' as const,
      image: mediaType === 'image' || mediaType === 'gif' ? local : m.image,
      video: mediaType === 'video' ? local : m.video,
      audio: mediaType === 'audio' ? local : m.audio,
    } : m));
    setCachedMessageLocalUri(chatRoomId, id, local, user?.id).catch(() => {});
  }, [chatRoomId, user?.id]);

  // ── Media press ───────────────────────────────────────────────────────────────
  const handleMediaPress = useCallback((msg: MsMessage) => {
    const isOwn = msg.user._id === (user?.id ?? '');
    if (msg.video || msg.msMediaType === 'video') {
      setFullscreenVideoUri(msg.localUri ?? msg.video ?? null);
      setFullscreenVideoIsOwn(isOwn);
    } else if (msg.image || msg.msMediaType === 'image') {
      if (!msg.localUri && msg.msMediaUrl) {
        void handleMediaDownload(msg);
        return;
      }
      setFullscreenImageUri(msg.localUri ?? msg.image ?? null);
      setFullscreenImageIsOwn(isOwn);
    } else if ((msg.msMediaType as string) === 'document' || msg.msMediaType === 'audio') {
      // Document / audio-file attachment. Local-first: if the persistent local
      // copy exists, open it; otherwise download it on demand (Task §8/§9 —
      // receiver downloads once, then renders/opens from the local file). The
      // actual download is delegated to ensureDocumentLocal below; opening
      // uses the OS linker so no extra file-viewer dependency is required.
      handleOpenFile(msg);
    }
  }, [user?.id, handleMediaDownload]);

  /* obsolete manual retry path removed: queued messages are retried by SweetSocket */
  /*
    if (!chatRoomId) return;

    const mediaType = failedMsg.msMediaType ?? null;
    const isMedia = !!mediaType && (
      !!failedMsg.image || !!failedMsg.video || !!failedMsg.audio || !!failedMsg.localUri
    );

    // Text retry — only requires the text body.
    if (!isMedia) {
      if (!failedMsg.text) return;
      const clientMessageId = failedMsg.msServerId ?? failedMsg._id;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === failedMsg._id
            ? { ...m, pending: true, sent: false }
            : m,
        ),
      );
      try {
        const res = await sendToRoom(failedMsg.text, undefined, undefined, {
          clientMessageId,
          replyToId: failedMsg.replyToId ?? undefined,
        });
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        setMessages((prev) =>
          prev.map((m) => m._id === failedMsg._id ? finalizeTemp(confirmed, failedMsg._id, failedMsg.replyMessage) : m),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => m._id === failedMsg._id ? { ...m, pending: false, sent: false } : m),
        );
      }
      return;
    }

    // Media retry. The failed bubble may already have a remote `mediaUrl`
    // (upload succeeded, send failed) — in that case just re-send. Otherwise
    // re-upload from the local URI, then send.
    const localSrc = failedMsg.localUri ?? failedMsg.image ?? failedMsg.video ?? failedMsg.audio;
    const existingRemote =
      (mediaType === 'image' || mediaType === 'gif') ? failedMsg.image
      : mediaType === 'video' ? failedMsg.video
      : mediaType === 'audio' ? failedMsg.audio
      : null;

    const clientMessageId = failedMsg.msServerId ?? failedMsg._id;
    setMessages((prev) =>
      prev.map((m) =>
        m._id === failedMsg._id
          ? { ...m, pending: true, sent: false }
          : m,
      ),
    );

    try {
      let mediaUrl = existingRemote ?? null;
      let mime = failedMsg.msMimeType ?? null;
      if (!mediaUrl && localSrc) {
        if (!mime) {
          mime =
            mediaType === 'image' ? 'image/jpeg'
            : mediaType === 'gif' ? 'image/gif'
            : mediaType === 'video' ? 'video/mp4'
            : mediaType === 'audio' ? 'audio/m4a'
            : 'application/octet-stream';
        }
        setUploadingMedia(true);
        const uploaded = await uploadMedia(localSrc, mime, undefined, (progress) => {
          setUploadProgress({ tempId: failedMsg._id, progress });
        });
        setUploadProgress(null);
        mediaUrl = uploaded.url;
      }
      if (!mediaUrl) throw new Error('No media source available for retry');

      const res = await sendToRoom(
        failedMsg.text || undefined,
        mediaUrl,
        mediaType ?? undefined,
        {
          caption: failedMsg.msCaption ?? undefined,
          fileName: failedMsg.msFileName ?? undefined,
          fileSize: failedMsg.msFileSize ?? undefined,
          mimeType: mime ?? undefined,
          audioDuration: failedMsg.msAudioDuration ?? undefined,
          fileType: failedMsg.msFileType ?? undefined,
          isVoiceNote: failedMsg.msIsVoiceNote,
          clientMessageId,
        },
      );
      const conf = toMsMessage(res.message, user?.id ?? '');
      // Preserve local-first media + custom metadata so the bubble renders
      // with the local file immediately, matching the original send path.
      setMessages((prev) =>
        prev.map((m) =>
          m._id === failedMsg._id
            ? {
                ...finalizeTemp(conf, failedMsg._id, failedMsg.replyMessage),
                msMediaType: (mediaType ?? conf.msMediaType) as MsMessage['msMediaType'],
                localUri: failedMsg.localUri ?? conf.localUri ?? null,
                image: (mediaType === 'image' || mediaType === 'gif') ? (failedMsg.localUri ?? conf.image ?? undefined) : conf.image,
                video: mediaType === 'video' ? (failedMsg.localUri ?? conf.video ?? undefined) : conf.video,
                audio: mediaType === 'audio' ? (failedMsg.localUri ?? conf.audio ?? undefined) : conf.audio,
              }
            : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => m._id === failedMsg._id ? { ...m, pending: false, sent: false } : m),
      );
    } finally {
      setUploadingMedia(false);
    }
  }, [chatRoomId, user?.id]);

  */

  // ── Voice ready — handled internally by MsChatInputBar; no-op here ───────────
  const handleVoiceReady = useCallback((_voice: PendingVoice) => {
    // Voice is staged inside MsChatInputBar as a VoiceCompactBar above the input.
    // It is dispatched via onSend({ voice }) — no modal needed.
  }, []);

  // ── Attachment sheet pick — route to inline bar above input ───────────────────
  const handleAttachmentResult = useCallback((result: AttachmentResult) => {
    setShowAttach(false);
    setInlineAttachment({
      type: result.type as InlineAttachment['type'],
      uri: result.uri,
      mimeType: result.mimeType,
      fileName: result.fileName,
      fileSize: result.fileSize,
      duration: result.duration,
    });
  }, []);


  // ── Send with inline attachment — upload and dispatch ────────────────────────
  const handleSendWithAttachment = useCallback(async (payload: AttachmentSendPayload) => {
    // Keep the staged attachment + send button VISIBLE while the upload runs
    // (the optimistic bubble is appended immediately by
    // handleAttachmentConfirmed). Clearing inlineAttachment here would flip
    // `hasContent` to false mid-upload — the mic would replace the send
    // button and the composer would look broken for the whole upload. It is
    // cleared only when the send settles (success or failure).
    try {
      await handleAttachmentConfirmed({
        uri: payload.uri,
        type: payload.type,
        mimeType: payload.mimeType,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        duration: payload.duration,
        caption: payload.caption,
      });
    } finally {
      setInlineAttachment(null);
    }
  }, [handleAttachmentConfirmed]);

  // ── Merge local reactions into messages ───────────────────────────────────────
  const messagesWithReactions = useMemo(() =>
    dedupeMessages(
      messages.map((m) => ({
        ...m,
        reactions: Object.prototype.hasOwnProperty.call(localReactions, realMessageId(m))
          ? localReactions[realMessageId(m)]
          : (m.reactions ?? []),
      })),
    ),
    [messages, localReactions],
  );

  const currentUserId = user?.id ?? '';

  // ── Stable input-bar callbacks ──────────────────────────────────────────────
  // MsChatInputBar is memoized, so every prop MUST be referentially stable
  // between renders. Passing inline arrows here would re-render the entire
  // composer on EVERY realtime message / keystroke — the source of the
  // "attaching an image makes the composer laggy and unstable" bug. All
  // handlers below are hoisted into useCallback and reused in renderInputToolbar.
  const onClearReplyPress = useCallback(() => setReplyMessage(null), []);
  const onCancelEditPress = useCallback(() => {
    setEditingMsg(null);
    setInputText('');
  }, []);
  const onAttachPress = useCallback(() => setShowAttach(true), []);
  const onRemoveInlineAttachment = useCallback(() => setInlineAttachment(null), []);
  const onEditInlineAttachment = useCallback(() => setShowInlineImagePreview(true), []);
  const onRecordingStateChange = useCallback((recording: boolean) => {
    if (!chatRoomId) return;      // Realtime: the other participant sees the recording state immediately

    // (ephemeral, no DB write). No HTTP fallback — recording is purely live
    // state.
    realtime.relay(`chat:${chatRoomId}`, recording
      ? REALTIME_EVENT.chatRecordingStarted
      : REALTIME_EVENT.chatRecordingStopped, { userId: user?.id });
  }, [chatRoomId, user?.id]);

  // Scroll the chat to a specific message by id (best-effort). Used when the
  // user taps a quoted-reply preview or a search match to locate the original.
  // If the target isn't in the currently-loaded window, load one page older
  // and retry — once. A brief highlight flash marks the located message.
  const scrollToMessage = useCallback(
    async (messageId: string) => {
      const targetId = String(messageId);
      const tryScroll = (): boolean => {
        const list = messagesListRef.current;
        if (!list) return false;
        const idx = messagesWithReactions.findIndex(
          (m) => realMessageId(m) === targetId,
        );
        if (idx === -1) return false;
        try {
          list.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
          flashHighlight(targetId);
          return true;
        } catch {
          // Index may be out of range while layout settles — retry once on the
          // next frame so layout has a chance to settle.
          requestAnimationFrame(() => {
            try {
              list.scrollToIndex({ index: idx, animated: false, viewPosition: 0.5 });
              flashHighlight(targetId);
            } catch {
              // give up silently
            }
          });
          return true;
        }
      };

      if (tryScroll()) return;
      // Not loaded yet — load one older page (if available) then retry once.
      if (hasMore && !loadingMore) {
        await handleLoadEarlier().catch(() => {});
        // After prepend, refs/indexes update on next render; defer the retry.
        setTimeout(() => { tryScroll(); }, 60);
      }
    },
    [messagesWithReactions, flashHighlight, hasMore, loadingMore, handleLoadEarlier],
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.fill, { backgroundColor: T.BG }]}>
      <MsChatBackground background={chatBackground} />
      <StatusBar barStyle="light-content" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <MsPressable style={styles.headerBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={T.TEXT} />
        </MsPressable>
        <Pressable style={styles.headerCenter} onPress={() => setShowProfileSheet(true)} hitSlop={8}>
          <MsAvatar
            size={36}
            initials={(otherUser.name || 'U').substring(0, 2).toUpperCase()}
            imageUri={otherUser.avatarUrl ?? undefined}
          />
          <View>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherUser.name || 'Chat'}
            </Text>
            {otherUser.isOnline ? (
              <Text style={[styles.headerUsername, { color: T.SUCCESS }]}>Online</Text>
            ) : otherUser.username ? (
              <Text style={styles.headerUsername}>@{otherUser.username}</Text>
            ) : null}
          </View>
        </Pressable>
        <MsPressable
          style={styles.headerBtn}
          onPress={() => setShowHeaderMenu(true)}
        >
          <DotsThreeVertical size={22} color={T.TEXT_2} weight="bold" />
        </MsPressable>
      </View>

      {/* ── Chat search bar (slides in below header) ─────────────────────── */}
      <MsChatSearch
        visible={showChatSearch}
        topOffset={insets.top + 58}
        messages={messagesWithReactions as any}
        onClose={() => setShowChatSearch(false)}
        onJump={(msgId) => scrollToMessage(String(msgId))}
      />

      {/* ── Empty-chat state — shown once loading finishes with no messages ── */}
      {!loading && !isBlocked && messagesWithReactions.length === 0 && (
        <View pointerEvents="none" style={styles.emptyOverlay}>
          <MsAvatar
            size={72}
            initials={(otherUser.name || 'U').substring(0, 2).toUpperCase()}
            imageUri={otherUser.avatarUrl ?? undefined}
          />
          <Text style={styles.emptyTitle}>
            {otherUser.name ? `${otherUser.name}` : 'New chat'}
          </Text>
          <Text style={styles.emptyHint}>
            {otherUser.username
              ? `Say hi to @${otherUser.username}`
              : 'Send the first message to start the conversation'}
          </Text>
        </View>
      )}

      {/* ── Chat Component — always mounted: header/input/controls are UI,
           not loading data; only the message list shows the skeleton above ── */}
      <Chat<MsMessage>
        messages={messagesWithReactions}
        // The library's AnimatedList is a gesture-handler FlatList; cast to the
        // prop type so we can call scrollToIndex on the underlying list ref.
        messagesContainerRef={messagesListRef as any}
        user={{ _id: currentUserId }}
        colorScheme="dark"
        isInverted
        disableKeyboardProvider
        keyboardAvoidingViewProps={{
          // Do NOT override `behavior` — the library defaults to
          // 'translate-with-padding' from react-native-keyboard-controller,
          // which works correctly on both iOS and Android.
          // Only provide the vertical offset so the KAV knows how tall our
          // custom header is (status bar + 4px padding + 44px buttons + 10px bottom).
          keyboardVerticalOffset: insets.top + 58,
        }}
        renderLoadEarlier={() => null}
        loadEarlierMessagesProps={{
          isAvailable: hasMore,
          isInfiniteScrollEnabled: true,
          onPress: handleLoadEarlier,
          isLoading: loadingMore,
        }}

        reply={{
          message: replyMessage,
          onClear: () => setReplyMessage(null),
          swipe: {
            isEnabled: true,
            onSwipe: (msg) => setReplyMessage(toReplyMessage(msg)),
          },
        }}

        reactions={{
          isEnabled: true,
          emojis: QUICK_REACTIONS,
          onReactionPress: handleReaction,
        }}

        renderBubble={(props) => {
          const cm = props.currentMessage as MsMessage;
          return (
            <MsChatBubble
              {...(props as any)}
              currentMessage={cm}
              currentUserId={currentUserId}
              highlighted={highlightedMsgId === realMessageId(cm)}
              uploadProgress={uploadProgress?.tempId === cm._id ? uploadProgress.progress : undefined}
              onLongPressMessage={handleLongPress}
              onReactionPress={(msg, emoji) => handleReaction(msg, emoji)}
              onMediaPress={handleMediaPress}
              onMediaDownload={handleMediaDownload}
              onQuotePress={(id) => scrollToMessage(id)}
            />
          );
        }}

        renderDay={(props: DayProps) => (
          <MsDateSeparator
            label={props.createdAt
              ? formatDateLabel(
                  typeof props.createdAt === 'number'
                    ? new Date(props.createdAt)
                    : props.createdAt,
                )
              : ''}
          />
        )}

        renderInputToolbar={() => (
          <MsChatInputBar
            text={inputText}
            onChangeText={setInputText}
            onSend={handleSend}
            onVoiceReady={handleVoiceReady}
            replyMessage={replyMessage}
            onClearReply={onClearReplyPress}
            editingMessage={editingMsg}
            onCancelEdit={onCancelEditPress}
            onAttachPress={onAttachPress}
            onCameraPress={handleCameraPress}
            disabled={isBlocked}
            sending={uploadingMedia}
            inlineAttachment={inlineAttachment}
            onRemoveInlineAttachment={onRemoveInlineAttachment}
            onEditInlineAttachment={onEditInlineAttachment}
            onSendWithAttachment={handleSendWithAttachment}
            onRecordingStateChange={onRecordingStateChange}
          />
        )}

        // Keep the library's own typing flag off: the footer below is the
        // single independent presence indicator, so two message-like bubbles
        // can never be rendered for one typing event.
        isTyping={false}
        renderChatFooter={() => isRecording
          ? <MsRecordingIndicator />
          : isTyping
            ? <MsTypingIndicator />
            : null}

        messagesContainerStyle={styles.msgContainer}
      />

      {/* ── Attachment sheet ─────────────────────────────────────────────────── */}
      <MsAttachmentSheet
        visible={showAttach}
        onClose={() => setShowAttach(false)}
        onResult={handleAttachmentResult}
      />

      {/* ── Attachment preview (legacy modal for voice/audio previews) ─────────── */}
      {pendingAttachment && (
        <MsAttachmentPreview
          attachment={pendingAttachment}
          onSend={handleAttachmentConfirmed}
          onCancel={() => setPendingAttachment(null)}
        />
      )}

      {/* ── Inline image/video preview — opened by pen icon on staged attachment ── */}
      <Modal
        visible={showInlineImagePreview && !!inlineAttachment}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setShowInlineImagePreview(false)}
        statusBarTranslucent
      >
        <View style={styles.imgPreviewRoot}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          {/* Close button */}
          <MsPressable
            style={[styles.imgPreviewClose, { top: insets.top + 12 }]}
            onPress={() => setShowInlineImagePreview(false)}
            hitSlop={12}
          >
            <View style={styles.imgPreviewCloseBtn}>
              <X size={18} color="#fff" weight="bold" />
            </View>
          </MsPressable>

          {/* Full-resolution image (expo-image animates GIFs) */}
          {inlineAttachment && (inlineAttachment.type === 'image' || inlineAttachment.type === 'video' || inlineAttachment.type === 'gif') && (
            <ExpoImage
              source={{ uri: inlineAttachment.uri }}
              style={styles.imgPreviewImg}
              contentFit="contain"
            />
          )}

          {/* Caption hint */}
          <View style={[styles.imgPreviewFooter, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.imgPreviewHint}>
              {inlineAttachment?.type === 'video' ? 'Video ready to send' : 'Image ready to send'}
            </Text>
            <Text style={styles.imgPreviewSubHint}>Tap the send button in the input to send</Text>
          </View>
        </View>
      </Modal>

      {/* ── Blocked banner ───────────────────────────────────────────────────── */}
      {isBlocked && (
        <View style={styles.blockedBanner}>
          <UserMinus size={14} color="#EF4444" />
          <Text style={styles.blockedBannerText}>
            You've blocked this user. Tap to unblock.
          </Text>
          <MsPressable onPress={handleBlockUser} hitSlop={8}>
            <Text style={styles.blockedUnblockBtn}>Unblock</Text>
          </MsPressable>
        </View>
      )}

      {/* ── Chat header menu ─────────────────────────────────────────────────── */}
      <MsChatHeaderMenu
        visible={showHeaderMenu}
        onClose={() => setShowHeaderMenu(false)}
        isBlocked={isBlocked}
        isMuted={isMuted}
        otherName={otherUser.name || 'User'}
        onBackground={() => setShowBgPicker(true)}
        onSearch={() => setShowChatSearch(true)}
        onProfile={() => setShowProfileSheet(true)}
        onMute={handleMuteUser}
        onBlock={handleBlockUser}
        onClear={handleClearRoom}
        onDelete={handleDeleteRoom}
      />

      {/* ── Chat background picker ───────────────────────────────────────────── */}
      <MsChatBgPicker
        visible={showBgPicker}
        current={chatBackground}
        onSelect={handleBgSelect}
        onClose={() => setShowBgPicker(false)}
      />

      {/* ── User profile sheet ───────────────────────────────────────────────── */}
      {showProfileSheet && (
        <MsUserProfileSheet
          visible={showProfileSheet}
          user={otherUser}
          onClose={() => setShowProfileSheet(false)}
        />
      )}

      {/* ── Room actions accessible from header Info button ──────────────── */}
      {/* Actions are triggered from the profile sheet (handleBlockUser,
          handleDeleteRoom, handleClearRoom */}

      {/* ── Delete confirmation sheet ────────────────────────────────────────── */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setShowDeleteConfirm(false)}
        >
          <View style={styles.deleteSheet}>
            <Text style={styles.deleteSheetTitle}>Delete this message?</Text>
            <View style={styles.deleteSheetDivider} />
            <MsPressable
              style={styles.deleteSheetBtn}
              onPress={() => handleDelete(false)}
            >
              <Text style={styles.deleteSheetBtnText}>Delete for me</Text>
            </MsPressable>
            {/* "Delete for everyone" is only permitted for the current user's
                own messages — it removes the message from BOTH users' contexts. */}
            {String(deleteTarget?.user?._id) === currentUserId && (
              <>
                <View style={styles.deleteSheetDivider} />
                {deleteForEveryoneExpired ? (
                  <View style={styles.deleteSheetBtnDisabled}>
                    <Text style={[styles.deleteSheetBtnText, { color: T.TEXT_3 }]}>
                      Delete for everyone
                    </Text>
                    <Text style={styles.deleteSheetHint}>
                      Only available for 24 hours after sending
                    </Text>
                  </View>
                ) : (
                  <MsPressable
                    style={styles.deleteSheetBtn}
                    onPress={() => handleDelete(true)}
                  >
                    <Text style={[styles.deleteSheetBtnText, { color: T.DANGER }]}>
                      Delete for everyone
                    </Text>
                  </MsPressable>
                )}
              </>
            )}
            <View style={styles.deleteSheetDivider} />
            <MsPressable
              style={styles.deleteSheetBtn}
              onPress={() => setShowDeleteConfirm(false)}
            >
              <Text style={[styles.deleteSheetBtnText, { color: T.TEXT_3 }]}>Cancel</Text>
            </MsPressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Message Info modal ───────────────────────────────────────────────── */}
      <Modal
        visible={showMsgInfo && !!infoMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMsgInfo(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setShowMsgInfo(false)}
        >
          <View style={styles.msgInfoCard}>
            <Text style={styles.msgInfoTitle}>Message Info</Text>
            <View style={styles.msgInfoRow}>
              <Text style={styles.msgInfoLabel}>Sent</Text>
              <Text style={styles.msgInfoValue}>
                {infoMsg?.createdAt
                  ? (infoMsg.createdAt instanceof Date
                    ? infoMsg.createdAt
                    : new Date(infoMsg.createdAt as number)
                  ).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                  })
                  : '—'}
              </Text>
            </View>
            {infoMsg?.msIsEdited && (
              <View style={styles.msgInfoRow}>
                <Text style={styles.msgInfoLabel}>Status</Text>
                <Text style={[styles.msgInfoValue, { color: T.ACCENT }]}>Edited</Text>
              </View>
            )}
            <View style={styles.msgInfoRow}>
              <Text style={styles.msgInfoLabel}>Delivered</Text>
              {infoMsg?.sent ? (
                <Check size={15} color={T.SUCCESS} weight="bold" />
              ) : (
                <Text style={styles.msgInfoValue}>Pending</Text>
              )}
            </View>
            <View style={styles.msgInfoRow}>
              <Text style={styles.msgInfoLabel}>Read</Text>
              {infoMsg?.received ? (
                <Checks size={15} color={T.SUCCESS} weight="bold" />
              ) : (
                <Text style={styles.msgInfoValue}>—</Text>
              )}
            </View>
            {infoMsg?.msMediaType && (
              <View style={styles.msgInfoRow}>
                <Text style={styles.msgInfoLabel}>Type</Text>
                <Text style={styles.msgInfoValue}>{infoMsg.msMediaType}</Text>
              </View>
            )}
            {infoMsg?.msFileSize ? (
              <View style={styles.msgInfoRow}>
                <Text style={styles.msgInfoLabel}>Size</Text>
                <Text style={styles.msgInfoValue}>
                  {infoMsg.msFileSize < 1024 * 1024
                    ? `${(infoMsg.msFileSize / 1024).toFixed(1)} KB`
                    : `${(infoMsg.msFileSize / (1024 * 1024)).toFixed(1)} MB`}
                </Text>
              </View>
            ) : null}
            <MsPressable
              style={styles.msgInfoClose}
              onPress={() => setShowMsgInfo(false)}
            >
              <Text style={styles.msgInfoCloseText}>Close</Text>
            </MsPressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Long-press context menu (scale + fade animation) ─────────────────── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="none"
        onRequestClose={hideMenu}
        statusBarTranslucent
      >
        <Reanimated.View style={[styles.menuOverlay, menuOverlayStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={hideMenu} />
          <Reanimated.View style={[styles.menuCard, menuCardStyle]}>
            {/* Quick reactions */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reactRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <MsPressable
                  key={emoji}
                  style={styles.reactBtn}
                  scale={0.85}
                  pressOpacity={0.7}
                  haptic
                  onPress={() => {
                    if (menuMsg) handleReaction(menuMsg, emoji);
                    hideMenu();
                    setMenuMsg(null);
                  }}
                >
                  <Text style={styles.reactEmoji}>{emoji}</Text>
                </MsPressable>
              ))}
            </ScrollView>
            <View style={styles.menuDivider} />
            <MenuItem icon={<ArrowBendUpLeft size={18} color={T.TEXT} />} label="Reply" onPress={handleMenuReply} />
            {String(menuMsg?.user?._id) === currentUserId &&
              (!menuMsg?.msMediaType && !menuMsg?.msIsVoiceNote && !menuMsg?.image && !menuMsg?.video && !menuMsg?.audio
                ? !!menuMsg?.text
                : !!menuMsg?.msCaption) && (
                <MenuItem
                  icon={<PencilSimple size={18} color={T.TEXT} />}
                  label={menuMsg?.msMediaType || menuMsg?.msIsVoiceNote ? 'Edit Caption' : 'Edit'}
                  onPress={handleEdit}
                />
              )}
            {!!menuMsg?.text && (
              <MenuItem icon={<CopyIcon size={18} color={T.TEXT} />} label="Copy" onPress={handleCopy} />
            )}
            <MenuItem icon={<Info size={18} color={T.TEXT_2} />} label="Message Info" onPress={handleMsgInfo} />
            {/* Delete is available for ALL messages: "Delete for me" removes
                the message from the current user's context only; "Delete for
                everyone" (own messages only) removes it from both contexts. */}
            <MenuItem
              icon={<Trash size={18} color={T.DANGER} />}
              label="Delete"
              labelStyle={{ color: T.DANGER }}
              onPress={handleDeletePress}
            />
          </Reanimated.View>
        </Reanimated.View>
      </Modal>

      {/* ── Fullscreen image viewer (swipe-down to dismiss) ─────────────────── */}
      {fullscreenImageUri ? (
        <FullscreenImageViewer
          uri={fullscreenImageUri}
          onClose={() => setFullscreenImageUri(null)}
          isOwn={fullscreenImageIsOwn}
        />
      ) : null}

      {/* ── Fullscreen video viewer ──────────────────────────────────────────── */}
      <Modal
        visible={!!fullscreenVideoUri}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenVideoUri(null)}
        statusBarTranslucent
      >
        <View style={styles.fullscreenBg}>
          <View style={[styles.fsvHeader, { paddingTop: insets.top + 12 }]}>
            <MsPressable style={styles.fsvBtn} onPress={() => setFullscreenVideoUri(null)}>
              <X size={18} color="#fff" weight="bold" />
            </MsPressable>
            {!fullscreenVideoIsOwn && fullscreenVideoUri ? (
              <MsPressable
                style={styles.fsvBtn}
                onPress={() => Share.share({ url: fullscreenVideoUri, message: fullscreenVideoUri })}
                accessibilityLabel="Save video"
              >
                <DownloadSimple size={20} color="#fff" weight="bold" />
              </MsPressable>
            ) : <View style={styles.fsvBtn} />}
          </View>
          {fullscreenVideoUri ? (
            <MsVideoPlayer
              videoId={`chat-fullscreen-${fullscreenVideoUri}`}
              uri={fullscreenVideoUri}
              fillContainer
              onClose={() => setFullscreenVideoUri(null)}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

// ─── Fullscreen Image Viewer — pinch-to-zoom, double-tap, swipe-down, share ──

function FullscreenImageViewer({ uri, onClose, isOwn }: { uri: string; onClose: () => void; isOwn: boolean }) {
  const insets = useSafeAreaInsets();
  const SCREEN = Dimensions.get('window');  // Pan + swipe-down
  const translateX   = useRef(new Animated.Value(0)).current;
  const translateY   = useRef(new Animated.Value(0)).current;
  const bgOpacity    = useRef(new Animated.Value(1)).current;
  // Pinch zoom
  const scaleAnim    = useRef(new Animated.Value(1)).current;
  const scaleRef     = useRef(1);
  const lastScaleRef = useRef(1);
  const isZoomedRef  = useRef(false);

  // ── Native gestures (react-native-gesture-handler) ─────────────────────────
  // Pinch, pan and double-tap run through the native gesture system on the
  // UI thread — the old PanResponder handled touches on the JS thread.

  const toggleZoom = useCallback(() => {
    // Double-tap: toggle zoom, resetting any pan offset.
    const targetScale = isZoomedRef.current ? 1 : 2.5;
    isZoomedRef.current = !isZoomedRef.current;
    scaleRef.current = targetScale;
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: targetScale, useNativeDriver: true, damping: 20, stiffness: 280 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 280 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 280 }),
    ]).start();
  }, [scaleAnim, translateX, translateY]);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    // Pinch natively requires two pointers (default minPointers = 2).
    .onStart(() => {
      lastScaleRef.current = scaleRef.current;
    })
    .onUpdate((e) => {
      const newScale = Math.max(0.85, Math.min(5, lastScaleRef.current * e.scale));
      scaleRef.current = newScale;
      scaleAnim.setValue(newScale);
    })
    .onEnd(() => {
      // Keep the current scale (spring settles it) — mirrors the old
      // release path's zoomed branch.
      Animated.spring(scaleAnim, { toValue: scaleRef.current, useNativeDriver: true, damping: 22, stiffness: 300 }).start();
    }), [scaleAnim]);

  const panGesture = useMemo(() => Gesture.Pan()
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onUpdate((e) => {
      const s = scaleRef.current;
      if (s > 1.05) {
        // Pan while zoomed
        translateX.setValue(e.translationX);
        translateY.setValue(e.translationY);
      } else if (e.translationY > 0) {
        // Swipe-down at 1× — drag + dim
        translateY.setValue(e.translationY);
        bgOpacity.setValue(Math.max(0, 1 - e.translationY / 350));
      }
    })
    .onEnd((e) => {
      const s = scaleRef.current;
      // Swipe-down dismiss at scale ~1
      if (s <= 1.05 && (e.translationY > 100 || e.velocityY > 0.9)) {
        Animated.parallel([
          Animated.timing(translateY, { toValue: SCREEN.height, duration: 220, useNativeDriver: true }),
          Animated.timing(bgOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]).start(onClose);
        return;
      }
      // Snap back to center if scale ~1
      if (s <= 1.05) {
        scaleRef.current = 1;
        isZoomedRef.current = false;
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 300 }),
          Animated.spring(bgOpacity, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 300 }),
          Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 300 }),
        ]).start();
      } else {
        // Keep panned position when zoomed
        Animated.spring(scaleAnim, { toValue: s, useNativeDriver: true, damping: 22, stiffness: 300 }).start();
      }
    }), [scaleAnim, translateX, translateY, bgOpacity, onClose, SCREEN.height]);

  const doubleTapGesture = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd(() => toggleZoom()), [toggleZoom]);

  const viewerGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture),
    [pinchGesture, panGesture, doubleTapGesture],
  );

  const handleShare = async () => {
    try {
      await Share.share({ url: uri, message: uri });
    } catch {/* user cancelled */}
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View style={[styles.fullscreenBg, { opacity: bgOpacity }]}>

        {/* Header bar — close + share */}
        <View style={[styles.fsvHeader, { paddingTop: insets.top + 8 }]}>
          <MsPressable style={styles.fsvBtn} onPress={onClose} accessibilityLabel="Close image viewer">
            <X size={18} color="#fff" weight="bold" />
          </MsPressable>
          {!isOwn && (
            <MsPressable style={styles.fsvBtn} onPress={handleShare} accessibilityLabel="Save image">
              <DownloadSimple size={20} color="#fff" weight="bold" />
            </MsPressable>
          )}
        </View>

        {/* Image — native pinch, pan, double-tap gestures */}
        <GestureDetector gesture={viewerGesture}>
          <Animated.View
            style={[
              styles.fsvImgWrap,
              {
                transform: [
                  { scale: scaleAnim },
                  { translateX },
                  { translateY },
                ],
              },
            ]}
          >
            <ExpoImage
              source={{ uri }}
              style={{ width: SCREEN.width, height: SCREEN.height * 0.85 }}
              contentFit="contain"
              accessibilityLabel="Full screen image"
            />
          </Animated.View>
        </GestureDetector>

        {/* Hint */}
        <Text style={[styles.swipeHint, { bottom: insets.bottom + 16 }]}>
          Pinch to zoom · Double-tap · Swipe down to close
        </Text>
      </Animated.View>
    </Modal>
  );
}

// ─── MenuItem helper ──────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  onPress,
  labelStyle,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  labelStyle?: object;
}) {
  return (
    <MsPressable style={styles.menuItem} onPress={onPress} scale={0.97} pressOpacity={0.8} haptic>
      {icon}
      <Text style={[styles.menuItemText, labelStyle]}>{label}</Text>
    </MsPressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    backgroundColor: T.BG,
    gap: 4,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  headerName: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    flexShrink: 1,
  },
  headerUsername: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  msgContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },

  // Message-area shimmer — absolute overlay confined to the conversation
  // region (below the header, above the input bar which paints over it).
  // The chat UI renders immediately; only messages are loading.
  msgShimmerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.BG,
  },

  // Empty-chat state — centered overlay above the chat background
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
  },

  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  menuCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    ...T.SHADOWS.hard,
  },
  reactRow: { paddingVertical: 12, paddingHorizontal: 8 },
  reactBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  reactEmoji: { fontSize: 24 },
  menuDivider: { height: 1, backgroundColor: T.BORDER, marginHorizontal: 16 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  menuItemText: {
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },

  // Inline image/video preview modal (pen icon from staged attachment)
  imgPreviewRoot: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgPreviewClose: {
    position: 'absolute',
    right: 18,
    zIndex: 10,
  },
  imgPreviewCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgPreviewImg: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.75,
  },
  imgPreviewFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  imgPreviewHint: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  imgPreviewSubHint: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.45)',
  },

  fullscreenBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fullscreen image viewer header
  fsvHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    zIndex: 20,
  },
  fsvBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsvImgWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImg: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.82,
  },
  swipeHint: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Blocked banner
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  blockedBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: '#EF4444',
  },
  blockedUnblockBtn: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: '#EF4444',
    textDecorationLine: 'underline',
  },

  // Delete confirmation sheet
  deleteSheet: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 320,
    ...T.SHADOWS.hard,
  },
  deleteSheetTitle: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    textAlign: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  deleteSheetDivider: { height: 1, backgroundColor: T.BORDER },
  deleteSheetBtn: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  deleteSheetBtnDisabled: {
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  deleteSheetHint: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  deleteSheetBtnText: {
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },

  // Message info card
  msgInfoCard: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    gap: 0,
    ...T.SHADOWS.hard,
  },
  msgInfoTitle: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    marginBottom: 16,
    textAlign: 'center',
  },
  msgInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  msgInfoLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  msgInfoValue: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    maxWidth: '65%',
    textAlign: 'right',
  },
  msgInfoClose: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.sm,
  },
  msgInfoCloseText: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
});