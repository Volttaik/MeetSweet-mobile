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
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
  Info,
  PencilSimple,
  Trash,
  Copy as CopyIcon,
  ArrowBendUpLeft,
} from 'phosphor-react-native';

import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmojiPicker } from '@/components/MsEmojiPicker';
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
import { MsTypingIndicator } from '@/components/chat/MsTypingIndicator';
import { MsDateSeparator } from '@/components/chat/MsDateSeparator';
import type { SendPayload } from '@/components/chat/MsChatInputBar';
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
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
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
    id: '', name: '', username: '', avatarUrl: null,
  });
  const [isFollowing, setIsFollowing] = useState(false);

  // ── Sheets / modals ──────────────────────────────────────────────────────────
  const [menuMsg, setMenuMsg] = useState<MsMessage | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [fullscreenVideoUri, setFullscreenVideoUri] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

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

    // ── Text message ─────────────────────────────────────────────────────────
    if (payload.text) {
      const optimistic: MsMessage = {
        _id: tempId,
        text: payload.text,
        createdAt: now,
        user: { _id: user?.id ?? '', name: user?.name ?? '', avatar: user?.avatarUrl ?? undefined },
        sent: false,
        pending: true,
        replyMessage: replyMessage ?? undefined,
      };
      setMessages((prev) => Chat.append(prev, [optimistic]));
      setReplyMessage(null);
      setInputText('');
      try {
        const res = await sendMessage(conversationId, payload.text);
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
        const confirmed = toMsMessage(res.message, user?.id ?? '');
        setMessages((prev) =>
          prev.map((m) => m._id === tempId ? { ...confirmed, pending: false, sent: true } : m),
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
    const { uri, type: mediaType, isPaid, paidPrice } = confirmed;
    const tempId = `temp_${Date.now()}`;
    const now = new Date();
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
    setMenuMsg(msg);
    setMenuVisible(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!menuMsg) return;
    setMenuVisible(false);
    const id = String(menuMsg._id);
    setMessages((prev) => prev.filter((m) => m._id !== menuMsg._id));
    await deleteCachedMessage(id).catch(() => {});
    try { await deleteMessage(id); } catch {/* */}
    setMenuMsg(null);
  }, [menuMsg, conversationId]);

  const handleEdit = useCallback(() => {
    if (!menuMsg) return;
    setMenuVisible(false);
    setEditingMsg(menuMsg);
    setInputText(menuMsg.text ?? '');
    setMenuMsg(null);
  }, [menuMsg]);

  const handleCopy = useCallback(async () => {
    if (!menuMsg?.text) return;
    setMenuVisible(false);
    await ExpoClipboard.setStringAsync(menuMsg.text);
    setMenuMsg(null);
  }, [menuMsg]);

  const handleMenuReply = useCallback(() => {
    if (!menuMsg) return;
    setMenuVisible(false);
    setReplyMessage(toReplyMessage(menuMsg));
    setMenuMsg(null);
  }, [menuMsg]);

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
    Alert.alert('Unlock', `Unlock for ${msg.msPaidPrice ?? 0} credits?`, [
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
    if (msg.video || msg.msMediaType === 'video') setFullscreenVideoUri(msg.video ?? null);
    else if (msg.image || msg.msMediaType === 'image') setFullscreenImageUri(msg.image ?? null);
  }, []);

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

  // ── Attachment sheet pick ─────────────────────────────────────────────────────
  const handleAttachmentResult = useCallback((result: AttachmentResult) => {
    setShowAttach(false);
    setPendingAttachment({
      uri: result.uri,
      type: result.type,
      mimeType: result.mimeType,
      fileName: result.fileName,
      fileSize: result.fileSize,
      duration: result.duration,
    });
  }, []);

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
        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowProfileSheet(true)}>
          <Info size={22} color={T.TEXT_2} />
        </TouchableOpacity>
      </View>

      {/* ── Chat Component ───────────────────────────────────────────────────── */}
      <Chat<MsMessage>
        messages={messagesWithReactions}
        user={{ _id: currentUserId }}
        colorScheme="dark"
        isTyping={isTyping}
        isInverted
        disableKeyboardProvider
        keyboardAvoidingViewProps={{
          behavior: Platform.OS === 'ios' ? 'padding' : undefined,
          keyboardVerticalOffset: insets.top + 56,
        }}
        loadEarlierMessagesProps={{
          isAvailable: hasMore,
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
            replyMessage={replyMessage}
            onClearReply={() => setReplyMessage(null)}
            editingMessage={editingMsg}
            onCancelEdit={() => { setEditingMsg(null); setInputText(''); }}
            onEmojiPress={() => setShowEmoji(true)}
            onAttachPress={() => setShowAttach(true)}
            disabled={uploadingMedia}
          />
        )}

        renderChatFooter={() => isTyping ? <MsTypingIndicator /> : null}

        messagesContainerStyle={styles.msgContainer}
      />

      {/* ── Emoji picker ─────────────────────────────────────────────────────── */}
      {showEmoji && (
        <MsEmojiPicker
          visible={showEmoji}
          onClose={() => setShowEmoji(false)}
          onEmojiSelect={(emoji) => {
            setInputText((t) => t + emoji);
            setShowEmoji(false);
          }}
        />
      )}

      {/* ── Attachment sheet ─────────────────────────────────────────────────── */}
      {showAttach && (
        <MsAttachmentSheet
          visible={showAttach}
          onClose={() => setShowAttach(false)}
          onResult={handleAttachmentResult}
        />
      )}

      {/* ── Attachment preview ───────────────────────────────────────────────── */}
      {pendingAttachment && (
        <MsAttachmentPreview
          attachment={pendingAttachment}
          onSend={handleAttachmentConfirmed}
          onCancel={() => setPendingAttachment(null)}
        />
      )}

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

      {/* ── Long-press context menu ──────────────────────────────────────────── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            {/* Quick reactions */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reactRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactBtn}
                  onPress={() => {
                    if (menuMsg) handleReaction(menuMsg, emoji);
                    setMenuVisible(false);
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
            {String(menuMsg?.user?._id) === currentUserId && (
              <MenuItem
                icon={<Trash size={18} color={T.DANGER} />}
                label="Delete"
                labelStyle={{ color: T.DANGER }}
                onPress={handleDelete}
              />
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Fullscreen image viewer (swipe-down to dismiss) ─────────────────── */}
      {fullscreenImageUri ? (
        <FullscreenImageViewer
          uri={fullscreenImageUri}
          onClose={() => setFullscreenImageUri(null)}
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
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenVideoUri(null)}>
            <Text style={styles.fullscreenCloseText}>✕</Text>
          </TouchableOpacity>
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

// ─── Fullscreen Image Viewer ──────────────────────────────────────────────────

function FullscreenImageViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dy) > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_e, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
          opacity.setValue(Math.max(0, 1 - gs.dy / 300));
        }
      },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy > 90 || gs.vy > 0.8) {
          Animated.parallel([
            Animated.timing(translateY, { toValue: Dimensions.get('window').height, duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(onClose);
        } else {
          Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 300 }),
            Animated.spring(opacity, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 300 }),
          ]).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.fullscreenBg, { opacity }]}>
        <TouchableOpacity
          style={[styles.fullscreenClose, { top: insets.top + 12 }]}
          onPress={onClose}
        >
          <Text style={styles.fullscreenCloseText}>✕</Text>
        </TouchableOpacity>
        <Animated.View
          style={{ transform: [{ translateY }], flex: 1, width: '100%', justifyContent: 'center' }}
          {...panResponder.panHandlers}
        >
          <Image
            source={{ uri }}
            style={styles.fullscreenImg}
            resizeMode="contain"
          />
        </Animated.View>
        <Text style={[styles.swipeHint, { bottom: insets.bottom + 20 }]}>Swipe down to dismiss</Text>
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
    backgroundColor: T.BG,
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

  fullscreenBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
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
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.3,
  },
});
