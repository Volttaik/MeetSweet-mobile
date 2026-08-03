/**
 * MeetSweet Chat Screen — rebuilt on @kesha-antonov/react-native-chat.
 *
 * Architecture:
 * - Chat component from the library handles message list, keyboard, swipe-to-reply,
 *   reactions, scroll, date separators, typing indicator.
 * - renderBubble → MsChatBubble (our fully custom pill/card design)
 * - renderInputToolbar → MsChatInputBar (full-featured input)
 * - renderDay → MsDateSeparator
 * - All data stays wired to the existing MeetSweet backend (services/messages.ts)
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
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ExpoClipboard from 'expo-clipboard';

import {
  Chat,
  type ReplyMessage,
  type MessageReaction,
  type DayProps,
} from '@kesha-antonov/react-native-chat';

import {
  ArrowLeft,
  DotsThreeVertical,
  Info,
  PencilSimple,
  Trash,
  Copy as CopyIcon,
  ArrowBendUpLeft,
  DownloadSimple,
  UserMinus,
} from 'phosphor-react-native';
import { MsChatHeaderMenu } from '@/components/chat/MsChatHeaderMenu';
import { MsChatSearch }     from '@/components/chat/MsChatSearch';
import { MsChatBgPicker }   from '@/components/chat/MsChatBgPicker';
import type { ChatBackground } from '@/components/chat/MsChatBgPicker';

import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';

import { MsAttachmentSheet } from '@/components/MsAttachmentSheet';
import type { AttachmentResult } from '@/components/MsAttachmentSheet';
import { MsAttachmentPreview } from '@/components/MsAttachmentPreview';
import type { PendingAttachment, ConfirmedAttachment } from '@/components/MsAttachmentPreview';
import { MsUserProfileSheet } from '@/components/MsUserProfileSheet';
import type { ProfileSheetUser } from '@/components/MsUserProfileSheet';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { MsMediaLoader } from '@/components/MsMediaLoader';

import { useAuth } from '@/contexts/AuthContext';
import {
  getMessages,
  sendMessage,
  deleteMessage,
  editMessage,
  markConversationRead,
  type ChatMessage,
} from '@/services/messages';
import { getUser, followUser, unfollowUser } from '@/services/users';
import { uploadMedia } from '@/services/media';
import {
  getCachedMessages,
  cacheMessages,
  deleteCachedMessage,
  getCachedConversations,
} from '@/services/chat-cache';

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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { id: conversationId, name: paramName, username: paramUsername, avatarUrl: paramAvatarUrl } = useLocalSearchParams<{ id: string; name?: string; username?: string; avatarUrl?: string }>();
  const { user } = useAuth();

  // ── Message state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<MsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isTyping] = useState(false);

  // ── Input state ──────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('');

  // ── Reply / Edit state ───────────────────────────────────────────────────────
  const [replyMessage, setReplyMessage] = useState<ReplyMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<MsMessage | null>(null);

  // ── Reactions (optimistic, local) ────────────────────────────────────────────
  const [localReactions, setLocalReactions] = useState<Record<string, MessageReaction[]>>({});

  // ── Other user info ──────────────────────────────────────────────────────────
  const [otherUser, setOtherUser] = useState<ProfileSheetUser>({
    id:        conversationId ?? '',
    name:      paramName     ?? '',
    username:  paramUsername  ?? '',
    avatarUrl: paramAvatarUrl ?? null,
  });
  const [isFollowing, setIsFollowing] = useState(false);

  // ── Context menu animation ────────────────────────────────────────────────────
  const menuScaleAnim = useRef(new Animated.Value(0)).current;
  const menuOpacityAnim = useRef(new Animated.Value(0)).current;

  const showMenu = useCallback((msg: MsMessage) => {
    setMenuMsg(msg);
    setMenuVisible(true);
    menuScaleAnim.setValue(0.88);
    menuOpacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(menuOpacityAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(menuScaleAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
    ]).start();
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

  // ── Block / conversation state ───────────────────────────────────────────────
  const [isBlocked, setIsBlocked] = useState(false);

  // ── Message info modal ───────────────────────────────────────────────────────
  const [infoMsg, setInfoMsg] = useState<MsMessage | null>(null);
  const [showMsgInfo, setShowMsgInfo] = useState(false);

  // ── Chat header menu ─────────────────────────────────────────────────────────
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [showBgPicker,   setShowBgPicker]   = useState(false);
  const [chatBackground, setChatBackground] = useState<ChatBackground>({ type: 'default' });

  // ── Load messages ────────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (before?: string) => {
    if (!conversationId) return;
    try {
      const cached = await getCachedMessages(conversationId);
      if (cached.length && !before) {
        setMessages(cached.map((m) => toMsMessage(m, user?.id ?? '')));
        setLoading(false);
      }
      const result = await getMessages(conversationId, before);
      const msgs = result.messages.map((m: ChatMessage) => toMsMessage(m, user?.id ?? ''));
      if (before) {
        setMessages((prev) => Chat.prepend(prev, msgs));
      } else {
        setMessages(msgs);
        await cacheMessages(conversationId, result.messages).catch(() => {});
      }
      setHasMore(result.hasMore ?? false);
      markConversationRead(conversationId).catch(() => {});
    } catch {
      // graceful — cached messages still visible
    } finally {
      setLoading(false);
    }
  }, [conversationId, user?.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ── Poll for new messages every 10 s (fallback for missing WebSocket) ────────
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(() => {
      getMessages(conversationId).then((result) => {
        if (!result.messages?.length) return;
        const incoming = result.messages.map((m: ChatMessage) => toMsMessage(m, user?.id ?? ''));
        setMessages((prev) => {
          // Merge: keep existing messages, append any new ones not already in list
          const existingIds = new Set(prev.map((m) => String(m._id)));
          const newOnes = incoming.filter((m: MsMessage) => !existingIds.has(String(m._id)));
          if (newOnes.length === 0) return prev;
          cacheMessages(conversationId, result.messages).catch(() => {});
          return [...newOnes, ...prev];
        });
      }).catch(() => {/* polling failure is silent */});
    }, 10_000);
    return () => clearInterval(interval);
  }, [conversationId, user?.id]);

  // ── Load other user from cached conversations ────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        const cached = await getCachedConversations();
        const conv = cached.find((c) => c.id === conversationId);
        if (conv?.otherUser) {
          setOtherUser({
            id: conv.otherUser.id,
            name: conv.otherUser.name,
            username: conv.otherUser.username,
            avatarUrl: conv.otherUser.avatarUrl,
          });
        }
      } catch {/* */}
    })();
  }, [conversationId]);

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
        Alert.alert('Permission required', 'Please allow camera access to take photos.');
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
    if (!conversationId) return;

    // ── Edit mode ────────────────────────────────────────────────────────────
    if (editingMsg) {
      const newText = payload.text ?? '';
      setMessages((prev) =>
        prev.map((m) => m._id === editingMsg._id ? { ...m, text: newText, msIsEdited: true } : m),
      );
      setEditingMsg(null);
      setInputText('');
      try {
        await editMessage(String(editingMsg._id), newText);
      } catch {
        Alert.alert('Error', 'Could not edit message.');
      }
      return;
    }

    const tempId = `temp_${Date.now()}`;
    const now = new Date();

    // ── Sticker (emoji sent as text) ─────────────────────────────────────────
    if (payload.sticker) {
      const optimistic: MsMessage = {
        _id: tempId,
        text: payload.sticker,
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        sent: false,
        pending: true,
      };
      setMessages((prev) => Chat.append(prev, [optimistic]));
      try {
        const res = await sendMessage(conversationId, payload.sticker);
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...confirmed, pending: false, sent: true } : m),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
        );
      }
      return;
    }

    // ── Text message ─────────────────────────────────────────────────────────
    if (payload.text) {
      const capturedReply = replyMessage;
      const optimistic: MsMessage = {
        _id: tempId,
        text: payload.text,
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        sent: false,
        pending: true,
        replyMessage: capturedReply ?? undefined,
      };
      setMessages((prev) => Chat.append(prev, [optimistic]));
      setReplyMessage(null);
      setInputText('');
      try {
        const res = await sendMessage(conversationId, payload.text, undefined, undefined, {
          replyToId: capturedReply ? String(capturedReply._id) : undefined,
        });
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...confirmed, pending: false, sent: true } : m),
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
        text: '',
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        audio: uri,
        msMediaType: 'audio',
        msAudioDuration: duration,
        sent: false,
        pending: true,
      };
      setMessages((prev) => Chat.append(prev, [optimistic]));
      try {
        setUploadingMedia(true);
        const uploaded = await uploadMedia(uri, 'audio/m4a');
        const res = await sendMessage(conversationId, undefined, uploaded.url, 'audio', { audioDuration: duration });
        // Server returns media_type: null for audio — preserve local audio metadata.
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? {
                  ...confirmed,
                  msMediaType: 'audio' as const,
                  audio: confirmed.audio ?? uploaded.url,
                  msAudioDuration: duration,
                  pending: false,
                  sent: true,
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
    }
  }, [conversationId, editingMsg, replyMessage, user]);

  // ── Attachment confirmed ──────────────────────────────────────────────────────
  const handleAttachmentConfirmed = useCallback(async (confirmed: ConfirmedAttachment) => {
    setPendingAttachment(null);
    if (!conversationId) return;
    const { uri, type: attachType, isPaid, paidPrice } = confirmed;
    const tempId = `temp_${Date.now()}`;
    const now = new Date();

    // ── Voice / audio from MsAttachmentPreview ────────────────────────────
    // Voice notes (type==='voice') and uploaded audio files (type==='audio')
    // must always be treated as audio — never as video.
    if (attachType === 'voice' || attachType === 'audio') {
      const duration = confirmed.duration ?? 0;
      const optimistic: MsMessage = {
        _id: tempId,
        text: '',
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        audio: uri,
        msMediaType: 'audio',
        msAudioDuration: duration,
        sent: false,
        pending: true,
      };
      setMessages((prev) => Chat.append(prev, [optimistic]));
      try {
        setUploadingMedia(true);
        // Always upload with correct audio MIME — never video/mp4
        const mime = confirmed.mimeType?.startsWith('audio/') ? confirmed.mimeType : 'audio/m4a';
        const uploaded = await uploadMedia(uri, mime);
        const res = await sendMessage(
          conversationId,
          undefined,
          uploaded.url,
          'audio',
          { audioDuration: duration },
        );
        // Server sends back media_type: null for audio (backend only accepts image/video).
        // Preserve local audio metadata so the bubble always renders as voice.
        const conf = toMsMessage(res.message, user?.id ?? '');
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? {
                  ...conf,
                  msMediaType: 'audio' as const,
                  audio: conf.audio ?? uploaded.url,
                  msAudioDuration: duration,
                  pending: false,
                  sent: true,
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
      return;
    }

    // ── Image / Video ──────────────────────────────────────────────────────
    const mediaType = attachType as 'image' | 'video' | 'document';
    const optimistic: MsMessage = {
      _id: tempId,
      text: confirmed.caption ?? '',
      createdAt: now,
      user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
      image: mediaType === 'image' ? uri : undefined,
      video: mediaType === 'video' ? uri : undefined,
      msMediaType: mediaType as MsMessage['msMediaType'],
      msIsPaid: isPaid,
      msPaidPrice: paidPrice,
      sent: false,
      pending: true,
    };
    setMessages((prev) => Chat.append(prev, [optimistic]));
    try {
      setUploadingMedia(true);
      const mime = mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
      const uploaded = await uploadMedia(uri, mime);
      const res = await sendMessage(
        conversationId,
        confirmed.caption,
        uploaded.url,
        mediaType,
        { isPaid, paidPrice: isPaid ? paidPrice : undefined },
      );
      const conf = toMsMessage(res.message, user?.id ?? '');
      setMessages((prev) =>
        prev.map((m) => m._id === tempId ? { ...conf, pending: false, sent: true } : m),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
      );
    } finally {
      setUploadingMedia(false);
    }
  }, [conversationId, user]);

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
    const id = String(target._id);
    // Animate collapse + fade
    setMessages((prev) => prev.map((m) =>
      m._id === target._id ? { ...m, msIsDeleted: true } : m,
    ));
    await deleteCachedMessage(id).catch(() => {});
    try { await deleteMessage(id); } catch {/* */}
  }, [deleteTarget]);

  // ── Message Info ──────────────────────────────────────────────────────────
  const handleMsgInfo = useCallback(() => {
    if (!menuMsg) return;
    hideMenu();
    setInfoMsg(menuMsg);
    setMenuMsg(null);
    setShowMsgInfo(true);
  }, [menuMsg, hideMenu]);

  // ── Block user ────────────────────────────────────────────────────────────
  const handleBlockUser = useCallback(() => {
    setShowProfileSheet(false);
    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Unblock ${otherUser.name}? They will be able to message you again.`
        : `Block ${otherUser.name}? You will not be able to send or receive messages.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: 'destructive',
          onPress: () => setIsBlocked(!isBlocked),
        },
      ],
    );
  }, [isBlocked, otherUser.name]);

  // ── Delete conversation ───────────────────────────────────────────────────
  const handleDeleteConversation = useCallback(() => {
    setShowProfileSheet(false);
    Alert.alert(
      'Delete Conversation',
      'This will remove the conversation from your chat list. Messages will not be deleted for the other person.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ],
    );
  }, []);

  // ── Clear conversation ────────────────────────────────────────────────────
  const handleClearConversation = useCallback(() => {
    setShowProfileSheet(false);
    Alert.alert(
      'Clear Conversation',
      'All messages in this conversation will be permanently deleted for you. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setMessages([]);
            if (conversationId) {
              await deleteCachedMessage(conversationId).catch(() => {});
            }
          },
        },
      ],
    );
  }, [conversationId]);

  const handleEdit = useCallback(() => {
    if (!menuMsg) return;
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
    setReplyMessage(toReplyMessage(menuMsg));
    setMenuMsg(null);
  }, [menuMsg, hideMenu]);

  // ── Reaction handler ──────────────────────────────────────────────────────────
  const handleReaction = useCallback((msg: MsMessage, emoji: string) => {
    const userId = user?.id ?? '';
    setLocalReactions((prev) => {
      const curr = prev[String(msg._id)] ?? [];
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
      return { ...prev, [String(msg._id)]: next };
    });
  }, [user?.id]);

  // ── Unlock paid content ───────────────────────────────────────────────────────
  const handleUnlockPaid = useCallback(async (msg: MsMessage) => {
    Alert.alert('Unlock', `Unlock for ₦${(msg.msPaidPrice ?? 0).toLocaleString()}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlock',
        onPress: () =>
          setMessages((prev) =>
            prev.map((m) => m._id === msg._id ? { ...m, msIsUnlocked: true } : m),
          ),
      },
    ]);
  }, []);

  // ── Media press ───────────────────────────────────────────────────────────────
  const handleMediaPress = useCallback((msg: MsMessage) => {
    const isOwn = msg.user._id === (user?.id ?? '');
    if (msg.video || msg.msMediaType === 'video') {
      setFullscreenVideoUri(msg.video ?? null);
      setFullscreenVideoIsOwn(isOwn);
    } else if (msg.image || msg.msMediaType === 'image') {
      setFullscreenImageUri(msg.image ?? null);
      setFullscreenImageIsOwn(isOwn);
    }
  }, [user?.id]);

  // ── Retry failed send ────────────────────────────────────────────────────────
  const handleRetry = useCallback(async (failedMsg: MsMessage) => {
    if (!conversationId || !failedMsg.text) return;
    // Replace the failed optimistic message with a new pending one
    const tempId = `temp_${Date.now()}`;
    setMessages((prev) =>
      prev.map((m) =>
        m._id === failedMsg._id
          ? { ...m, _id: tempId, pending: true, sent: false }
          : m,
      ),
    );
    try {
      const res = await sendMessage(conversationId, failedMsg.text);
      const confirmed = toMsMessage(res.message, user?.id ?? '');
      setMessages((prev) =>
        prev.map((m) => m._id === tempId ? { ...confirmed, pending: false, sent: true } : m),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => m._id === tempId ? { ...m, pending: false, sent: false } : m),
      );
    }
  }, [conversationId, user?.id]);

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
    messages.map((m) => ({
      ...m,
      reactions: localReactions[String(m._id)] ?? m.reactions ?? [],
    })),
    [messages, localReactions],
  );

  const currentUserId = user?.id ?? '';

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: T.BG }]}>
        <ActivityIndicator color={T.ACCENT} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: T.BG }]}>
      <MsChatBackground />
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
            {otherUser.username ? (
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

      {/* ── Chat search bar (slides in below header) ─────────────────────────── */}
      <MsChatSearch
        visible={showChatSearch}
        messages={messagesWithReactions}
        onClose={() => setShowChatSearch(false)}
        onJump={() => {/* Flash highlight TODO */}}
      />

      {/* ── Chat Component ───────────────────────────────────────────────────── */}
      <Chat<MsMessage>
        messages={messagesWithReactions}
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

        renderBubble={(props) => (
          <MsChatBubble
            {...(props as any)}
            currentMessage={props.currentMessage as MsMessage}
            onLongPressMessage={handleLongPress}
            onUnlockPaid={handleUnlockPaid}
            onMediaPress={handleMediaPress}
            onRetry={handleRetry}
          />
        )}

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
            disabled={uploadingMedia}
            inlineAttachment={inlineAttachment}
            onRemoveInlineAttachment={() => setInlineAttachment(null)}
            onEditInlineAttachment={() => setShowInlineImagePreview(true)}
            onSendWithAttachment={handleSendWithAttachment}
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
              <Text style={styles.imgPreviewCloseX}>✕</Text>
            </View>
          </TouchableOpacity>

          {/* Full-resolution image */}
          {inlineAttachment && (inlineAttachment.type === 'image' || inlineAttachment.type === 'video') && (
            <Image
              source={{ uri: inlineAttachment.uri }}
              style={styles.imgPreviewImg}
              resizeMode="contain"
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
        otherName={otherUser.name || 'User'}
        onBackground={() => setShowBgPicker(true)}
        onSearch={() => setShowChatSearch(true)}
        onProfile={() => setShowProfileSheet(true)}
        onBlock={handleBlockUser}
        onClear={handleClearConversation}
        onDelete={handleDeleteConversation}
      />

      {/* ── Chat background picker ───────────────────────────────────────────── */}
      <MsChatBgPicker
        visible={showBgPicker}
        current={chatBackground}
        onSelect={(bg) => setChatBackground(bg)}
        onClose={() => setShowBgPicker(false)}
      />

      {/* ── User profile sheet ───────────────────────────────────────────────── */}
      {showProfileSheet && (
        <MsUserProfileSheet
          visible={showProfileSheet}
          user={otherUser}
          isFollowing={isFollowing}
          onFollow={async () => {
            try { await followUser(otherUser.username); setIsFollowing(true); } catch {/**/}
          }}
          onUnfollow={async () => {
            try { await unfollowUser(otherUser.username); setIsFollowing(false); } catch {/**/}
          }}
          onClose={() => setShowProfileSheet(false)}
        />
      )}

      {/* ── Conversation action sheet (block, delete, clear) ─────────────────── */}
      <Modal
        visible={showProfileSheet === false && false}
        transparent
        animationType="none"
        onRequestClose={() => {}}
      >
        <View />
      </Modal>

      {/* ── Conversation actions accessible from header Info button ─────────── */}
      {/* Actions are triggered from Alert dialogs via handleBlockUser,
          handleDeleteConversation, handleClearConversation */}

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
            <View style={styles.deleteSheetDivider} />
            <TouchableOpacity
              style={styles.deleteSheetBtn}
              onPress={() => handleDelete(true)}
            >
              <Text style={[styles.deleteSheetBtnText, { color: T.DANGER }]}>
                Delete for everyone
              </Text>
            </TouchableOpacity>
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
              <Text style={styles.msgInfoValue}>{infoMsg?.sent ? '✓' : 'Pending'}</Text>
            </View>
            <View style={styles.msgInfoRow}>
              <Text style={styles.msgInfoLabel}>Read</Text>
              <Text style={styles.msgInfoValue}>{infoMsg?.received ? '✓✓' : '—'}</Text>
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
            {String(menuMsg?.user?._id) === currentUserId && (
              <MenuItem icon={<PencilSimple size={18} color={T.TEXT} />} label="Edit" onPress={handleEdit} />
            )}
            {!!menuMsg?.text && (
              <MenuItem icon={<CopyIcon size={18} color={T.TEXT} />} label="Copy" onPress={handleCopy} />
            )}
            <MenuItem icon={<Info size={18} color={T.TEXT_2} />} label="Message Info" onPress={handleMsgInfo} />
            {String(menuMsg?.user?._id) === currentUserId && (
              <MenuItem
                icon={<Trash size={18} color={T.DANGER} />}
                label="Delete"
                labelStyle={{ color: T.DANGER }}
                onPress={handleDeletePress}
              />
            )}
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
              <Text style={styles.fullscreenCloseText}>✕</Text>
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
            <Text style={styles.fullscreenCloseText}>✕</Text>
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
          <Image
            source={{ uri }}
            style={{ width: SCREEN.width, height: SCREEN.height * 0.85 }}
            resizeMode="contain"
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
  imgPreviewCloseX: { color: '#fff', fontSize: 18, fontFamily: T.FONT.regular },
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
  fullscreenClose: {
    position: 'absolute',
    right: 18,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenCloseText: { color: '#fff', fontSize: 18 },
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
