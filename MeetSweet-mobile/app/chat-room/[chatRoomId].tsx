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
  AppState,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
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
import { toast } from '@/components/MsToast';
import type { ProfileSheetUser } from '@/components/MsUserProfileSheet';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';

import { useAuth } from '@/contexts/AuthContext';
import {
  getRoomMessages,
  getChatRoom,
  getRoomContext,
  sendRoomMessage,
  deleteRoomMessage,
  editRoomMessage,
  markRoomRead,
  clearChatRoom,
  deleteChatRoom,
  toggleRoomReaction,
  checkRoomChanges,
  muteChatRoom,
  deriveFileType,
  broadcastTyping,
  clearTyping,
  normalizeMessage,
  type RoomMessage,
} from '@/services/room-service';
import { realtime, REALTIME_EVENT } from '@/services/realtime';
import { ApiError } from '@/services/api';
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
  cacheRoomContext,
  getCachedRoomContext,
  applyContextAuthRemovals,
  clearCachedRoomContext,
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

import { MsShimmerChatList } from '@/components/MsShimmer';
import { MsChatBubble } from '@/components/chat/MsChatBubble';
import { MsChatInputBar } from '@/components/chat/MsChatInputBar';
import { MsChatBackground } from '@/components/chat/MsChatBackground';
import { MsTypingIndicator } from '@/components/chat/MsTypingIndicator';
import { MsDateSeparator } from '@/components/chat/MsDateSeparator';
import type { SendPayload, PendingVoice, InlineAttachment, AttachmentSendPayload } from '@/components/chat/MsChatInputBar';
import {
  toMsMessage,
  toReplyMessage,
  type MsMessage,
} from '@/types/chat-message';

// ─── Constants ─────────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😍', '😢', '😮', '👏'];

function formatDateLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * Real message id for server operations (delete / react / poll reconciliation).
 * A confirmed optimistic message keeps its local `_id` (stable list key — no
 * remount/flash) but stores the real server id in `msServerId`.
 */
function realMessageId(m: { _id: string; msServerId?: string }): string {
  return String(m.msServerId ?? m._id);
}

/**
 * Drop duplicate bubbles that share a server message id, preferring the
 * non-pending (server-confirmed) copy and the copy keyed by its real id. This
 * guards against realtime/poll delivery racing the send confirmation: the
 * socket can deliver a sender's own confirmed message before the HTTP
 * confirmation resolves, which would otherwise leave a visible duplicate.
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
function byNewestFirst(a: MsMessage, b: MsMessage): number {
  const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
  const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
  return tb - ta;
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
      mediaType: (mediaType as 'image' | 'video' | 'audio' | 'document' | 'gif' | 'sticker' | null | undefined),
      caption: opts?.caption,
      fileName: opts?.fileName,
      fileSize: opts?.fileSize,
      mimeType: opts?.mimeType,
      audioDuration: opts?.audioDuration,
      replyToId: opts?.replyToId,
      fileType: opts?.fileType,
      isVoiceNote: opts?.isVoiceNote,
    });
  }, [chatRoomId]);

  // ── Message state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<MsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  // Realtime: the other participant is recording a voice note.
  const [isRecording, setIsRecording] = useState(false);

  // ── Typing debounce ref ────────────────────────────────────────────────────
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingBroadcastRef = useRef(false);

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

  // ── Context menu animation ────────────────────────────────────────────────────
  const menuScaleAnim = useRef(new Animated.Value(0)).current;
  const menuOpacityAnim = useRef(new Animated.Value(0)).current;

  // ── Message-area shimmer — the chat UI (header, input bar, all controls)
  // renders immediately; ONLY the conversation region may show a skeleton,
  // and only when there is genuinely NO cached conversation to paint (first
  // open of a room, or after a cache wipe). Once a conversation has been
  // loaded, reopening renders the cached messages instantly with NO shimmer
  // at all — not even one frame — while the server syncs in the background
  // (loadMessages' cache-first paint sets showShimmer(false) synchronously).
  // When the shimmer IS shown (uncached first open), it fades out cleanly on
  // arrival instead of unmounting with a hard cut.
  const shimmerOpacity = useRef(new Animated.Value(1)).current;
  const [showShimmer, setShowShimmer] = useState(false);
  useEffect(() => {
    if (!loading && showShimmer) {
      Animated.timing(shimmerOpacity, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start(() => setShowShimmer(false));
    }
  }, [loading, showShimmer, shimmerOpacity]);

  // Ref to the Chat's FlatList so tapping a quoted reply can scroll to the
  // original message. The list is inverted (newest at bottom); scrollToMessage
  // (defined after the messages memo) maps message id → item index.
  const messagesListRef = useRef<FlatList<MsMessage>>(null);

  const showMenu = useCallback((msg: MsMessage) => {
    setMenuMsg(msg);
    setMenuVisible(true);
  }, []);

  const hideMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(menuOpacityAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(menuScaleAnim, { toValue: 0.92, duration: 120, useNativeDriver: true }),
    ]).start(() => setMenuVisible(false));
  }, []);

  // ── Sheets / modals ──────────────────────────────────────────────────────────
  const [menuMsg, setMenuMsg] = useState<MsMessage | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Start the context-menu entrance AFTER the Modal mounts so the scale/fade
  // animation is visible in full (starting it before mount made the menu appear
  // already partway through its animation).
  useEffect(() => {
    if (menuVisible) {
      menuScaleAnim.setValue(0.88);
      menuOpacityAnim.setValue(0);
      Animated.parallel([
        Animated.timing(menuOpacityAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(menuScaleAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.back(1.3)),
          useNativeDriver: true,
        }),
      ]).start();
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

  // ── Delete confirmation state ────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MsMessage | null>(null);

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
  }, [chatRoomId, user?.id]);

  // ── Ensure each media message has a persistent local file ────────────────
  // For every message with a remote mediaUrl:
  //  • If it already has a cached localUri, VERIFY the file still exists on
  //    disk. If the user manually cleared device storage (OS cleanup, app
  //    cache wipe), the cached URI is stale — clear it and re-download so the
  //    renderer never points at a missing file (Task §12: offline/manual-
  //    deletion detection).
  //  • Otherwise resolve an existing local file, else download it, then
  //    persist the localUri onto the cached message + rendered message and
  //    flip msMediaStatus to 'local' so the UI renders the local file.
  //  • Never download the same file twice.
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
        // gif / sticker carry their media in the image field — the local copy
        // must patch it or cached animated GIFs would lose their source.
        image: (mediaType === 'image' || mediaType === 'gif' || mediaType === 'sticker') ? local : undefined,
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

    // Mark every media message without a valid local copy as 'downloading' in
    // one pass so the UI shows a loading state while files are fetched.
    const needsDownload: string[] = [];
    for (const m of roomMsgs) {
      if (m.mediaUrl && m.mediaType && !m.localUri) needsDownload.push(String(m.id));
    }
    if (needsDownload.length) {
      setMessages((prev) =>
        prev.map((msg) =>
          needsDownload.includes(idOf(msg))
            ? { ...msg, msMediaStatus: 'downloading' as const }
            : msg,
        ),
      );
    }

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

      // (b) No (valid) localUri — try to resolve an existing local file
      // first (cheap, avoids re-downloading), otherwise download.
      let local = await resolveLocalMedia(chatRoomId, id, {
        mime: m.mimeType,
        mediaType: m.mediaType,
        url: m.mediaUrl,
      }).catch(() => null);
      if (!local) {
        local = await downloadRoomMedia(chatRoomId, id, m.mediaUrl, {
          mime: m.mimeType,
          mediaType: m.mediaType,
        }).catch(() => null);
      }
      if (local) {
        m.localUri = local;
        setCachedMessageLocalUri(chatRoomId, id, local, uid).catch(() => {});
        patches.push({ id, patch: mediaPatch(m, local) });
      } else {
        // Download failed — mark so the UI can show a retry affordance.
        patches.push({ id, patch: { msMediaStatus: 'failed' as const } });
      }
    }

    applyPatches(patches);
  }, [chatRoomId, user?.id]);

  // ── Sync this user's context (contextId + contextAuth membership) ──────
  // The server is authoritative. Before displaying server-fetched messages,
  // ask for the current user's context and mirror it into SQLite. If the
  // server says "remove MSG_002 from this context", the local replica is
  // updated (message row + membership entry) BEFORE rendering, so the UI
  // never shows messages that no longer belong to this user's context.
  // Returns the removed messageIds so the caller can drop them from the
  // rendered list. No user-initiated action happens here — pure mirror.
  const syncRoomContext = useCallback(
    async (serverMessages: RoomMessage[]): Promise<string[]> => {
      const uid = user?.id ?? '';
      if (!chatRoomId || !uid) return [];
      // Pass the cached marker so the server can return an incremental
      // context diff (only removed/added ids since the last sync) instead of
      // a full membership snapshot every time. Falls back to a full fetch when
      // no marker is cached yet (first open, or after a cache wipe).
      const cachedCtx = await getCachedRoomContext(chatRoomId, uid).catch(() => null);
      const sinceMarker = cachedCtx?.contextAuth.marker ?? null;
      const ctx = await getRoomContext(chatRoomId, sinceMarker).catch(() => null);
      if (!ctx) {
        // Backend hasn't shipped /context yet — nothing to mirror; the plain
        // message fetch path remains the source of truth.
        return [];
      }
      // Persist the authoritative contextId + membership for this user.
      await cacheRoomContext(chatRoomId, uid, ctx).catch(() => {});
      const removed = ctx.contextAuth.removedMessageIds ?? [];
      if (removed.length) {
        await applyContextAuthRemovals(chatRoomId, uid, removed).catch(() => {});
      }
      // If the server sent a full membership snapshot, reconcile: any locally
      // cached message for this room that is NOT in the snapshot (and isn't in
      // the just-fetched server page) is no longer part of this context and is
      // removed from the local replica. This keeps SQLite mirroring the server.
      const snapshot = ctx.contextAuth.messageIds;
      if (Array.isArray(snapshot)) {
        const keep = new Set<string>(snapshot);
        for (const m of serverMessages) keep.add(m.id);
        const cached = await getCachedMessages(chatRoomId, uid).catch(() => []);
        const stale = cached.filter((m) => !keep.has(m.id)).map((m) => m.id);
        if (stale.length) {
          await applyContextAuthRemovals(chatRoomId, uid, stale).catch(() => {});
          for (const id of stale) removed.push(id);
        }
      }
      return removed;
    },
    [chatRoomId, user?.id],
  );

  // ── Load messages ─────────────────────────────────────────────────────
  // LOCAL-FIRST: the local persistent store (SQLite) is the presentation
  // layer. Opening a conversation NEVER fetches the conversation's history
  // from the server — the network is used only for background synchronization
  // (the incremental changes poll below) and for explicit pagination when the
  // user scrolls up. New messages arrive via the poll; restorations of
  // previously-downloaded history happen ONLY through the explicit "Load Chat
  // History" action in the Chat menu. No shimmer, no network wait, no
  // visible reconstruction.
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
              .filter((m: RoomMessage) => !m.isDeleted)
              .map((m: RoomMessage) => toMsMessage(m, uid))
              .sort(byNewestFirst),
          );
          // Local content is on screen — never show the loading shimmer.
          setLoading(false);
          setShowShimmer(false);
          // Seed the incremental poll marker from the newest locally-cached
          // message's TIMESTAMP (the server compares `since` against
          // created_at) so the background poll only asks for what's actually
          // new — never re-downloading already-cached history.
          const newest = [...cached]
            .filter((m: RoomMessage) => !m.isDeleted)
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )[0];
          if (newest?.createdAt) pollMarkerRef.current = newest.createdAt;
          // Background synchronization — ALL silent, NO full history fetch:
          // 1) mirror the server's context membership (removals/deletions),
          // 2) resolve/persist local media for cached messages missing a
          //    local file (recovery after a failed download), 3) mark read.
          syncRoomContext(cached).catch(() => {});
          ensureMediaLocal(cached).catch(() => {});
          markRoomRead(chatRoomId).catch(() => {});
          return;
        }
      } catch {
        // ignore — fall through to the fresh empty state below
      }
      // No local representation of this conversation (first-ever open on this
      // device, or the cache was wiped). Show the fresh empty state — do NOT
      // fetch the conversation's history from the server. Previous
      // conversations are restored only through the explicit "Load Chat
      // History" action in the Chat menu. The poll marker is seeded with
      // "now" so messages that arrive WHILE the user is viewing (new
      // messages, not history) still synchronize in the background.
      pollMarkerRef.current = new Date().toISOString();
      setShowShimmer(false);
      setLoading(false);
      return;
    }

    // ── Explicit pagination (user scrolled up) — server fetch allowed ────
    try {
      const result = await getRoomMessages(chatRoomId, { before });
      const msgs = result.messages
        .filter((m: RoomMessage) => !m.isDeleted)
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
  }, [chatRoomId, user?.id, ensureMediaLocal, syncRoomContext]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ── Merge incoming messages (shared by the realtime socket + poll) ──────
  // Both the WebSocket and the changes-poll fallback funnel fresh messages
  // through here: mirror the context membership, reconcile into the visible
  // list (dropping server-removed messages), persist to SQLite, resolve media.
  const handleIncomingMessages = useCallback(async (fresh: RoomMessage[]) => {
    if (!fresh?.length) return;
    const uid = user?.id ?? '';

    // Sync context auth removals if any
    const removedIds = new Set(await syncRoomContext(fresh).catch(() => []));
    const incomingMap = new Map<string, MsMessage>();
    for (const m of fresh) {
      incomingMap.set(String(m.id), toMsMessage(m, uid));
    }

    setMessages((prev) => {
      // 1. Filter out deleted/removed context messages
      let updated = prev.filter((m) => !removedIds.has(realMessageId(m)));

      // 2. Reconcile existing messages with updated fresh data
      updated = updated.map((m) => {
        const freshMsg = incomingMap.get(realMessageId(m));
        if (freshMsg) {
          // Delete by the SAME key the map was built with (real message id).
          // Deleting by m._id misses confirmed optimistic messages (whose _id
          // is still the temp id), leaving a duplicate in the list.
          incomingMap.delete(realMessageId(m));
          return {
            ...m,
            ...freshMsg,
            localUri: m.localUri ?? freshMsg.localUri ?? null,
            image: freshMsg.image ?? m.image,
            video: freshMsg.video ?? m.video,
            audio: freshMsg.audio ?? m.audio,
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
      //    or the inverted list shows them reversed.
      const newOnes = Array.from(incomingMap.values()).sort(byNewestFirst);
      if (newOnes.length > 0) {
        updated = [...newOnes, ...updated];
      }

      // 4. Realtime can deliver a sender's own confirmed message before the
      //    HTTP confirmation resolves — dedupe so no visible duplicate forms.
      updated = dedupeMessages(updated);

      cacheMessages(chatRoomId, fresh, uid).catch(() => {});
      return updated;
    });

    // Persist media for newly received messages.
    ensureMediaLocal(fresh).catch(() => {});
  }, [chatRoomId, user?.id, ensureMediaLocal, syncRoomContext]);

  // ── Poll fallback (incremental changes, ONLY when the socket is down) ──
  // The WebSocket is the primary realtime path; this poll keeps working when
  // it is unavailable (offline, unsupported network, server without WS).
  const pollMarkerRef = useRef<string | null>(null);
  const pollActiveRef = useRef(true);

  const pollRoom = useCallback(async () => {
    if (!chatRoomId || !pollActiveRef.current) return;
    const changes = await checkRoomChanges(chatRoomId, pollMarkerRef.current).catch(() => null);
    if (!changes) return;

    // ── Typing state (fallback) ────────────────────────────────────────
    const typingUsers = changes.typing ?? [];
    const otherIsTyping = typingUsers.some((id) => id !== user?.id);
    setIsTyping(otherIsTyping);

    // Always adopt the server's marker (a fresh timestamp) — even when this
    // check found nothing — so the next poll only asks for what arrived since
    // the last check. This keeps the marker self-healing: it never stays
    // stale, which would otherwise re-download or miss content.
    pollMarkerRef.current = changes.marker ?? pollMarkerRef.current;
    if (!changes.changed) return;
    await handleIncomingMessages(changes.messages ?? []);
  }, [chatRoomId, user?.id, pollActiveRef, handleIncomingMessages]);

  useEffect(() => {
    if (!chatRoomId) return;
    const interval = setInterval(() => {
      // The realtime socket is the primary path — only poll when it's down.
      if (realtime.isOpen()) return;
      void pollRoom();
    }, 10_000);
    return () => clearInterval(interval);
  }, [chatRoomId, pollRoom]);

  // ── Realtime (WebSocket) — live channel for this conversation ──────────
  // Messages, typing, recording, read receipts, reactions and presence arrive
  // instantly over the socket. The poll above is the fallback.
  useEffect(() => {
    if (!chatRoomId) return;
    const channel = `chat:${chatRoomId}`;
    realtime.subscribe(channel);

    const offMessage = realtime.on(REALTIME_EVENT.chatMessageCreated, (event) => {
      const raw = (event.payload as { message?: unknown })?.message;
      if (!raw) return;
      const msg = normalizeMessage(raw);
      if (!msg?.id) return;
      // A delivered message from the other user clears their typing indicator.
      if (msg.sender?.id && msg.sender.id !== user?.id) setIsTyping(false);
      void handleIncomingMessages([msg]);
    });
    const offUpdated = realtime.on(REALTIME_EVENT.chatMessageUpdated, (event) => {
      const p = event.payload as { messageId?: string; body?: string; isEdited?: boolean };
      if (!p.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          realMessageId(m) === p.messageId
            ? { ...m, text: p.body ?? m.text, msIsEdited: p.isEdited ?? m.msIsEdited }
            : m,
        ),
      );
      if (p.body !== undefined) {
        updateCachedMessage(chatRoomId, p.messageId, { body: p.body, isEdited: true }, user?.id).catch(() => {});
      }
    });
    const offDeleted = realtime.on(REALTIME_EVENT.chatMessageDeleted, (event) => {
      const p = event.payload as { messageId?: string; scope?: string; userId?: string };
      if (!p.messageId) return;
      // delete-for-me only affects the actor; recall affects everyone.
      const affectsMe = p.scope === 'everyone' || (p.scope === 'me' && p.userId === user?.id);
      if (!affectsMe) return;
      setMessages((prev) => prev.filter((m) => realMessageId(m) !== p.messageId));
      removeCachedMessage(chatRoomId, p.messageId, user?.id).catch(() => {});
      deleteRoomMedia(chatRoomId, p.messageId).catch(() => {});
    });
    const offTypingStart = realtime.on(REALTIME_EVENT.chatTypingStarted, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (who && who !== user?.id) setIsTyping(true);
    });
    const offTypingStop = realtime.on(REALTIME_EVENT.chatTypingStopped, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (!who || who !== user?.id) setIsTyping(false);
    });
    const offRecStart = realtime.on(REALTIME_EVENT.chatRecordingStarted, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (who && who !== user?.id) setIsRecording(true);
    });
    const offRecStop = realtime.on(REALTIME_EVENT.chatRecordingStopped, (event) => {
      const who = (event.payload as { userId?: string })?.userId;
      if (!who || who !== user?.id) setIsRecording(false);
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
    const offReaction = realtime.on(REALTIME_EVENT.chatReactionUpdated, (event) => {
      const p = event.payload as {
        messageId?: string;
        reactions?: Array<{ emoji: string; userIds: string[] }>;
      };
      if (!p.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          realMessageId(m) === p.messageId ? { ...m, reactions: p.reactions ?? m.reactions } : m,
        ),
      );
    });
    const offPresence = realtime.on(REALTIME_EVENT.chatPresenceUpdated, (event) => {
      const p = event.payload as { userId?: string; online?: boolean };
      if (!p.userId || p.userId === user?.id) return;
      setOtherUser((prev) => (prev.id === p.userId ? { ...prev, isOnline: p.online ?? false } : prev));
    });

    // Presence: announce online while viewing this conversation (and offline
    // on leave). Best-effort — the room-metadata fetch remains the fallback.
    const announce = (online: boolean) => {
      realtime.relay(channel, REALTIME_EVENT.chatPresenceUpdated, { userId: user?.id, online });
    };
    announce(true);

    return () => {
      realtime.unsubscribe(channel);
      offMessage(); offUpdated(); offDeleted();
      offTypingStart(); offTypingStop();
      offRecStart(); offRecStop(); offRead(); offReaction(); offPresence();
      announce(false);
    };
  }, [chatRoomId, user?.id, handleIncomingMessages]);

  // ── Typing broadcast (client → server) ──────────────────────────────────
  // When the user types, fire a debounced "I'm typing" broadcast. Prefers the
  // realtime socket (ephemeral relay — instant, no DB write); falls back to
  // the HTTP endpoint when the socket is unavailable.
  const sendTypingBroadcast = useCallback(() => {
    if (!chatRoomId) return;
    const sent = realtime.relay(`chat:${chatRoomId}`, REALTIME_EVENT.chatTypingStarted, {
      userId: user?.id,
    });
    if (!sent) broadcastTyping(chatRoomId);
  }, [chatRoomId, user?.id]);

  const sendTypingStop = useCallback(() => {
    if (!chatRoomId) return;
    const sent = realtime.relay(`chat:${chatRoomId}`, REALTIME_EVENT.chatTypingStopped, {
      userId: user?.id,
    });
    if (!sent) clearTyping(chatRoomId);
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

  // ── Pause polling while the app is backgrounded; resume on foreground ────
  // Avoids hitting the server every 10s while the chat isn't visible. On
  // resume we fire one immediate poll so freshly-arrived messages show up
  // without waiting for the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      if (active === pollActiveRef.current) return;
      pollActiveRef.current = active;
      if (active) pollRoom().catch(() => {});
    });
    return () => sub.remove();
  }, [pollRoom]);

  // ── Resolve the other participant FROM THE ROOM (not navigation params) ──
  useEffect(() => {
    if (!chatRoomId) return;
    (async () => {
      try {
        const room = await getChatRoom(chatRoomId);
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
        // Fall back to local cache — stale but better than nothing
        const cached = await getCachedChatRooms(user?.id).catch(() => []);
        const room = cached.find((r) => r.chatRoomId === chatRoomId);
        if (room?.isMuted !== undefined) setIsMuted(Boolean(room.isMuted));
        if (room?.otherUser?.id) {
          setOtherUser({
            id: room.otherUser.id,
            name: room.otherUser.name || 'Chat',
            username: room.otherUser.username,
            avatarUrl: room.otherUser.avatarUrl ?? null,
            isOnline: room.otherUser.isOnline ?? false,
          });
        }
      }
    })();
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
    const cursor = oldest.createdAt instanceof Date
      ? oldest.createdAt.toISOString()
      : new Date(oldest.createdAt as number).toISOString();
    await loadMessages(cursor);
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
    // stray send (e.g. sticker quick-action) cannot bypass it.
    if (isBlocked) return;

    // ── Edit mode ────────────────────────────────────────────────────────────
    if (editingMsg) {
      const editId = String(editingMsg._id);
      const newText = payload.text ?? '';
      const prevText = editingMsg.text ?? '';
      const prevEdited = editingMsg.msIsEdited ?? false;
      // Optimistic: update the visible message immediately.
      setMessages((prev) =>
        prev.map((m) => m._id === editingMsg._id ? { ...m, text: newText, msIsEdited: true } : m),
      );
      setEditingMsg(null);
      setInputText('');
      try {
        await editRoomMessage(chatRoomId, editId, newText);
        // Server confirmed — mirror the edit into SQLite by messageId. Do NOT
        // create a new message; the row is preserved, only its body changes.
        await updateCachedMessage(chatRoomId, editId, {
          body: newText,
          isEdited: true,
        }, user?.id).catch(() => {});
      } catch {
        // Revert the visible + cached state — the server did not confirm.
        setMessages((prev) =>
          prev.map((m) =>
            m._id === editingMsg._id ? { ...m, text: prevText, msIsEdited: prevEdited } : m,
          ),
        );
        dialogs.alert({ variant: 'error', title: 'Could not edit message' });
      }
      return;
    }

    const tempId = `temp_${Date.now()}`;
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
      setReplyMessage(null);
      setInputText('');
      try {
        const res = await sendToRoom(payload.text, undefined, undefined, {
          replyToId: capturedReply ? String(capturedReply._id) : undefined,
        });
        const confirmed = toMsMessage(res.message, user?.id ?? '');
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
      try {
        setUploadingMedia(true);
        const uploaded = await uploadMedia(uri, 'audio/m4a');
        const res = await sendToRoom(undefined, uploaded.url, 'audio', {
          audioDuration: duration,
          isVoiceNote: true,
          fileType: 'm4a',
        });
        // Server returns media_type: null for audio — preserve local audio metadata.
        const confirmed = toMsMessage(res.message, user?.id ?? '');
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
                  localUri: null,
                  audio: uri,
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
    const tempId = `temp_${Date.now()}`;
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
      try {
        setUploadingMedia(true);
        // Always upload with correct audio MIME — never video/mp4
        const mime = confirmed.mimeType?.startsWith('audio/') ? confirmed.mimeType : 'audio/m4a';
        const uploaded = await uploadMedia(uri, mime);
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
          },
        );
        // Server sends back media_type: null for audio. Preserve the local
        // audio metadata so the bubble renders correctly (voice waveform OR
        // audio file card) regardless of the server's media_type.
        const conf = toMsMessage(res.message, user?.id ?? '');
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
                  localUri: null,
                  audio: uri,
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

    // ── Image / GIF / Video / Document ──────────────────────────────────────
    // GIF is a media-first type: the picker returns type 'gif' with an
    // animated asset; it uploads as image/gif, persists as a .gif local file
    // (animation survives caching), and renders as a compact animated bubble.
    const mediaType = attachType as 'image' | 'video' | 'gif' | 'document';
    const isGif = mediaType === 'gif';
    // FILE TYPE for this message — derived from the attachment's MIME/filename
    // so the Auth Tree carries the on-disk format alongside the message type.
    const sendFileType =
      isGif ? 'gif'
      : deriveFileType(confirmed.mimeType, confirmed.fileName) ??
        (mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : null);
    const optimistic: MsMessage = {
      _id: tempId,
      id: tempId,
      chatRoomId: chatRoomId ?? '',
      messageType: (mediaType as MsMessage['messageType']) || 'file',
      text: confirmed.caption ?? '',
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
    try {
      setUploadingMedia(true);
      const mime =
        mediaType === 'image'
          ? (confirmed.mimeType?.startsWith('image/') ? confirmed.mimeType : 'image/jpeg')
        : isGif ? (confirmed.mimeType || 'image/gif')
        : mediaType === 'video' ? 'video/mp4'
        : (confirmed.mimeType || 'application/octet-stream');
      const uploaded = await uploadMedia(uri, mime, isGif ? 'photo.gif' : undefined);
        const res = await sendToRoom(
          confirmed.caption,
          uploaded.url,
          mediaType,
          {
            fileType: sendFileType ?? undefined,
            fileName: confirmed.fileName,
            fileSize: confirmed.fileSize,
            mimeType: mime,
          },
        );
      const conf = toMsMessage(res.message, user?.id ?? '');
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
                localUri: null,
                image: (mediaType === 'image' || isGif) ? uri : conf.image,
                video: mediaType === 'video' ? uri : conf.video,
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

    // Never assume success until the server confirms it. We keep the message
    // visible (with a soft-deleted appearance) while the request is in flight,
    // then remove it from the local context only on success.
    setMessages((prev) =>
      prev.map((m) => (m._id === target._id ? { ...m, msIsDeleted: true } : m)),
    );

    try {
      await deleteRoomMessage(chatRoomId, id, scope);
      // Server confirmed — remove the message from this user's SQLite context
      // (the row + the contextAuth membership entry) and from the visible list.
      // For 'me' the other participant's context is untouched; for 'everyone'
      // the backend updated both contexts and the other client syncs via poll.
      const uid = user?.id ?? '';
      await removeCachedMessage(chatRoomId, id, uid).catch(() => {});
      if (uid) {
        await applyContextAuthRemovals(chatRoomId, uid, [id]).catch(() => {});
      }
      // Remove the local media file for this message so it doesn't linger
      // on disk after the user no longer sees the message.
      await deleteRoomMedia(chatRoomId, id).catch(() => {});
      setMessages((prev) => prev.filter((m) => realMessageId(m) !== id));
      // Drop the optimistic-reaction entry for this message so the
      // localReactions map doesn't accumulate stale ids for deleted messages.
      setLocalReactions((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      // Revert the soft-delete appearance — the server did not confirm.
      setMessages((prev) =>
        prev.map((m) => (m._id === target._id ? { ...m, msIsDeleted: false } : m)),
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
            const uid = user?.id ?? '';
            await removeCachedRoom(chatRoomId, user?.id).catch(() => {});
            if (uid) {
              await clearCachedRoomContext(chatRoomId, uid).catch(() => {});
            }
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
        const uid = user?.id ?? '';
        if (chatRoomId) {
          try {
            await clearChatRoom(chatRoomId);
            setMessages([]);
            setLocalReactions({});
            if (uid) {
              await clearCachedRoomContext(chatRoomId, uid).catch(() => {});
            } else {
              await clearCachedMessages(chatRoomId, user?.id).catch(() => {});
            }
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
    // Editing only applies to TEXT messages. Audio/voice/image/video/document
    // messages have no editable body — guard here so Edit can never be
    // triggered through another route even if the menu button is hidden.
    if (
      menuMsg.msMediaType ||
      menuMsg.msIsVoiceNote ||
      menuMsg.image ||
      menuMsg.video ||
      menuMsg.audio
    ) return;
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
      const curr = prev[msgId] ?? [];
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

    // Persist to backend — tempId messages (optimistic) have no real ID yet
    if (!msgId.startsWith('temp_')) {
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

  // ── Media press ───────────────────────────────────────────────────────────────
  const handleMediaPress = useCallback((msg: MsMessage) => {
    const isOwn = msg.user._id === (user?.id ?? '');
    if (msg.video || msg.msMediaType === 'video') {
      setFullscreenVideoUri(msg.localUri ?? msg.video ?? null);
      setFullscreenVideoIsOwn(isOwn);
    } else if (msg.image || msg.msMediaType === 'image') {
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
  }, [user?.id]);

  // ── Retry failed send ────────────────────────────────────────────────────────
  const handleRetry = useCallback(async (failedMsg: MsMessage) => {
    if (!chatRoomId) return;

    const mediaType = failedMsg.msMediaType ?? null;
    const isMedia = !!mediaType && (
      !!failedMsg.image || !!failedMsg.video || !!failedMsg.audio || !!failedMsg.localUri
    );

    // Text retry — only requires the text body.
    if (!isMedia) {
      if (!failedMsg.text) return;
      const tempId = `temp_${Date.now()}`;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === failedMsg._id
            ? { ...m, _id: tempId, pending: true, sent: false }
            : m,
        ),
      );
      try {
        const res = await sendToRoom(failedMsg.text);
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? finalizeTemp(confirmed, tempId) : m),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
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

    const tempId = `temp_${Date.now()}`;
    setMessages((prev) =>
      prev.map((m) =>
        m._id === failedMsg._id
          ? { ...m, _id: tempId, pending: true, sent: false }
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
        const uploaded = await uploadMedia(localSrc, mime);
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
        },
      );
      const conf = toMsMessage(res.message, user?.id ?? '');
      // Preserve local-first media + custom metadata so the bubble renders
      // with the local file immediately, matching the original send path.
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId
            ? {
                ...finalizeTemp(conf, tempId),
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
        prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
      );
    } finally {
      setUploadingMedia(false);
    }
  }, [chatRoomId, user?.id]);

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

  // ── Sticker pick — send the emoji immediately as a sticker message ─────────────
  // A single-emoji text message renders as a floating large-emoji sticker
  // (MsChatBubble → isSticker). Sending through handleSend keeps the same
  // optimistic path as any text message: instant, server-confirmed in the
  // background, persisted in the local cache, available on reopen.
  const handleStickerPick = useCallback((emoji: string) => {
    setShowAttach(false);
    handleSend({ text: emoji });
  }, [handleSend]);

  // ── Send with inline attachment — upload and dispatch ────────────────────────
  const handleSendWithAttachment = useCallback(async (payload: AttachmentSendPayload) => {
    setInlineAttachment(null);
    // Re-use the confirmed attachment flow with the payload data
    await handleAttachmentConfirmed({
      uri: payload.uri,
      type: payload.type,
      mimeType: payload.mimeType,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      duration: payload.duration,
      caption: payload.caption,
    });
  }, [handleAttachmentConfirmed]);

  // ── Merge local reactions into messages ───────────────────────────────────────
  const messagesWithReactions = useMemo(() =>
    dedupeMessages(
      messages.map((m) => ({
        ...m,
        reactions: localReactions[realMessageId(m)] ?? m.reactions ?? [],
      })),
    ),
    [messages, localReactions],
  );

  const currentUserId = user?.id ?? '';

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
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={T.TEXT} />
        </TouchableOpacity>
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
            {isTyping ? (
              <Text style={[styles.headerUsername, { color: T.ACCENT }]}>Typing...</Text>
            ) : isRecording ? (
              <Text style={[styles.headerUsername, { color: T.ACCENT }]}>Recording voice note...</Text>
            ) : otherUser.isOnline ? (
              <Text style={[styles.headerUsername, { color: T.SUCCESS }]}>Online</Text>
            ) : otherUser.username ? (
              <Text style={styles.headerUsername}>@{otherUser.username}</Text>
            ) : null}
          </View>
        </Pressable>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setShowHeaderMenu(true)}
        >
          <DotsThreeVertical size={22} color={T.TEXT_2} weight="bold" />
        </TouchableOpacity>
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

      {/* ── Message-area shimmer — ONLY the conversation region loads. The
           header, input bar, voice-note, attachment and all other controls
           render immediately; this skeleton sits BEHIND the Chat component
           (whose opaque input bar paints over its bottom edge), so only the
           empty message list area shows the shimmer. It only ever appears
           when there is no cached conversation to paint (first open), and
           fades out cleanly when the first messages arrive — no layout jump,
           no full-screen spinner, no skeleton over buttons. ─────────────── */}
      {showShimmer && (
        <Animated.View
          pointerEvents={loading ? 'auto' : 'none'}
          style={[
            styles.msgShimmerWrap,
            { top: insets.top + 58, opacity: shimmerOpacity },
          ]}
        >
          <MsShimmerChatList />
        </Animated.View>
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
        isTyping={isTyping}
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
              onLongPressMessage={handleLongPress}
              onReactionPress={(msg, emoji) => handleReaction(msg, emoji)}
              onMediaPress={handleMediaPress}
              onRetry={handleRetry}
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
            onClearReply={() => setReplyMessage(null)}
            editingMessage={editingMsg}
            onCancelEdit={() => { setEditingMsg(null); setInputText(''); }}
            onAttachPress={() => setShowAttach(true)}
            onCameraPress={handleCameraPress}
            disabled={uploadingMedia || isBlocked}
            inlineAttachment={inlineAttachment}
            onRemoveInlineAttachment={() => setInlineAttachment(null)}
            onEditInlineAttachment={() => setShowInlineImagePreview(true)}
            onSendWithAttachment={handleSendWithAttachment}
            onRecordingStateChange={(recording) => {
              if (!chatRoomId) return;
              // Realtime: the other participant sees the recording state
              // immediately (ephemeral, no DB write). No HTTP fallback —
              // recording is purely live state.
              realtime.relay(`chat:${chatRoomId}`, recording
                ? REALTIME_EVENT.chatRecordingStarted
                : REALTIME_EVENT.chatRecordingStopped, { userId: user?.id });
            }}
          />
        )}

        renderChatFooter={() => isTyping ? <MsTypingIndicator /> : null}

        messagesContainerStyle={styles.msgContainer}
      />

      {/* ── Attachment sheet ─────────────────────────────────────────────────── */}
      {showAttach && (
        <MsAttachmentSheet
          visible={showAttach}
          onClose={() => setShowAttach(false)}
          onResult={handleAttachmentResult}
          onSticker={handleStickerPick}
        />
      )}

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
          <TouchableOpacity
            style={[styles.imgPreviewClose, { top: insets.top + 12 }]}
            onPress={() => setShowInlineImagePreview(false)}
            hitSlop={12}
          >
            <View style={styles.imgPreviewCloseBtn}>
              <X size={18} color="#fff" weight="bold" />
            </View>
          </TouchableOpacity>

          {/* Full-resolution image (expo-image animates GIFs) */}
          {inlineAttachment && (inlineAttachment.type === 'image' || inlineAttachment.type === 'video') && (
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
          <TouchableOpacity onPress={handleBlockUser} hitSlop={8}>
            <Text style={styles.blockedUnblockBtn}>Unblock</Text>
          </TouchableOpacity>
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
            <TouchableOpacity
              style={styles.deleteSheetBtn}
              onPress={() => handleDelete(false)}
            >
              <Text style={styles.deleteSheetBtnText}>Delete for me</Text>
            </TouchableOpacity>
            {/* "Delete for everyone" is only permitted for the current user's
                own messages — it removes the message from BOTH users' contexts. */}
            {String(deleteTarget?.user?._id) === currentUserId && (
              <>
                <View style={styles.deleteSheetDivider} />
                <TouchableOpacity
                  style={styles.deleteSheetBtn}
                  onPress={() => handleDelete(true)}
                >
                  <Text style={[styles.deleteSheetBtnText, { color: T.DANGER }]}>
                    Delete for everyone
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.deleteSheetDivider} />
            <TouchableOpacity
              style={styles.deleteSheetBtn}
              onPress={() => setShowDeleteConfirm(false)}
            >
              <Text style={[styles.deleteSheetBtnText, { color: T.TEXT_3 }]}>Cancel</Text>
            </TouchableOpacity>
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
            <TouchableOpacity
              style={styles.msgInfoClose}
              onPress={() => setShowMsgInfo(false)}
            >
              <Text style={styles.msgInfoCloseText}>Close</Text>
            </TouchableOpacity>
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
        <Animated.View style={[styles.menuOverlay, { opacity: menuOpacityAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={hideMenu} />
          <Animated.View style={[styles.menuCard, { transform: [{ scale: menuScaleAnim }] }]}>
            {/* Quick reactions */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reactRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactBtn}
                  onPress={() => {
                    if (menuMsg) handleReaction(menuMsg, emoji);
                    hideMenu();
                    setMenuMsg(null);
                  }}
                >
                  <Text style={styles.reactEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.menuDivider} />
            <MenuItem icon={<ArrowBendUpLeft size={18} color={T.TEXT} />} label="Reply" onPress={handleMenuReply} />
            {String(menuMsg?.user?._id) === currentUserId &&
              !menuMsg?.msMediaType &&
              !menuMsg?.msIsVoiceNote &&
              !menuMsg?.image &&
              !menuMsg?.video &&
              !menuMsg?.audio && (
                <MenuItem icon={<PencilSimple size={18} color={T.TEXT} />} label="Edit" onPress={handleEdit} />
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
          </Animated.View>
        </Animated.View>
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
          <View style={[styles.fsvHeader, { paddingTop: 48 }]}>
            <TouchableOpacity style={styles.fsvBtn} onPress={() => setFullscreenVideoUri(null)}>
              <X size={18} color="#fff" weight="bold" />
            </TouchableOpacity>
            {!fullscreenVideoIsOwn && fullscreenVideoUri ? (
              <TouchableOpacity
                style={styles.fsvBtn}
                onPress={() => Share.share({ url: fullscreenVideoUri, message: fullscreenVideoUri })}
                accessibilityLabel="Save video"
              >
                <DownloadSimple size={20} color="#fff" weight="bold" />
              </TouchableOpacity>
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
  const SCREEN = Dimensions.get('window');

  // Pan + swipe-down
  const translateX   = useRef(new Animated.Value(0)).current;
  const translateY   = useRef(new Animated.Value(0)).current;
  const bgOpacity    = useRef(new Animated.Value(1)).current;
  // Pinch zoom (using manual two-touch tracking)
  const scaleAnim    = useRef(new Animated.Value(1)).current;
  const scaleRef     = useRef(1);
  const lastScaleRef = useRef(1);
  const prevDistRef  = useRef<number | null>(null);
  // Double-tap
  const lastTapRef   = useRef(0);
  const isZoomedRef  = useRef(false);

  function dist(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }) {
    const dx = t1.pageX - t2.pageX;
    const dy = t1.pageY - t2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gs) => {
        const touches = (_e.nativeEvent as any).touches;
        if (touches?.length >= 2) return true;
        const s = scaleRef.current;
        if (s > 1) return true;
        return Math.abs(gs.dy) > 8;
      },

      onPanResponderGrant: (e) => {
        const touches = (e.nativeEvent as any).touches;
        if (touches?.length >= 2) {
          prevDistRef.current = dist(touches[0], touches[1]);
          lastScaleRef.current = scaleRef.current;
        }
        // Double-tap detection
        const now = Date.now();
        if (touches?.length === 1) {
          if (now - lastTapRef.current < 280) {
            // Double-tap: toggle zoom
            const targetScale = isZoomedRef.current ? 1 : 2.5;
            isZoomedRef.current = !isZoomedRef.current;
            scaleRef.current = targetScale;
            Animated.parallel([
              Animated.spring(scaleAnim, { toValue: targetScale, useNativeDriver: true, damping: 20, stiffness: 280 }),
              Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 280 }),
              Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 280 }),
            ]).start();
          }
          lastTapRef.current = now;
        }
      },

      onPanResponderMove: (e, gs) => {
        const touches = (e.nativeEvent as any).touches;
        // Pinch
        if (touches?.length >= 2 && prevDistRef.current !== null) {
          const d = dist(touches[0], touches[1]);
          const ratio  = d / prevDistRef.current;
          const newScale = Math.max(0.85, Math.min(5, lastScaleRef.current * ratio));
          scaleRef.current = newScale;
          scaleAnim.setValue(newScale);
          return;
        }
        // Pan (while zoomed) or swipe-down (at 1×)
        const s = scaleRef.current;
        if (s > 1.05) {
          translateX.setValue(gs.dx);
          translateY.setValue(gs.dy);
        } else if (gs.dy > 0) {
          translateY.setValue(gs.dy);
          bgOpacity.setValue(Math.max(0, 1 - gs.dy / 350));
        }
      },

      onPanResponderRelease: (_e, gs) => {
        prevDistRef.current = null;
        const s = scaleRef.current;
        // Swipe-down dismiss at scale ~1
        if (s <= 1.05 && (gs.dy > 100 || gs.vy > 0.9)) {
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
      },

      onPanResponderTerminate: () => {
        prevDistRef.current = null;
      },
    }),
  ).current;

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
          <TouchableOpacity style={styles.fsvBtn} onPress={onClose} accessibilityLabel="Close image viewer">
            <X size={18} color="#fff" weight="bold" />
          </TouchableOpacity>
          {!isOwn && (
            <TouchableOpacity style={styles.fsvBtn} onPress={handleShare} accessibilityLabel="Save image">
              <DownloadSimple size={20} color="#fff" weight="bold" />
            </TouchableOpacity>
          )}
        </View>

        {/* Image — supports pinch, pan, double-tap */}
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
          {...panResponder.panHandlers}
        >
          <ExpoImage
            source={{ uri }}
            style={{ width: SCREEN.width, height: SCREEN.height * 0.85 }}
            contentFit="contain"
            accessibilityLabel="Full screen image"
          />
        </Animated.View>

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
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      {icon}
      <Text style={[styles.menuItemText, labelStyle]}>{label}</Text>
    </TouchableOpacity>
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