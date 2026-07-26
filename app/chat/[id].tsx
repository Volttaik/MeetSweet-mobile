import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Spinner } from 'heroui-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  DotsThree,
  Image as ImageIcon,
  LockSimple,
  PaperPlaneRight,
  Smiley,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMessages,
  sendMessage,
  deleteMessage,
  type ChatMessage,
} from '@/services/messages';
import { getConversations } from '@/services/messages';
import { uploadMedia } from '@/services/media';

// ─── Types ────────────────────────────────────────────────────────────────────

type Reaction = { emoji: string; count: number; byMe: boolean };
type MessageReactions = Record<string, Reaction>;

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👏'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function needsDateSeparator(curr: ChatMessage, prev: ChatMessage | undefined): boolean {
  if (!prev) return true;
  return new Date(curr.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

// ─── Reaction row ─────────────────────────────────────────────────────────────

function ReactionRow({
  reactions,
  isOwn,
  onReact,
}: {
  reactions: MessageReactions;
  isOwn: boolean;
  onReact: (emoji: string) => void;
}) {
  const entries = Object.entries(reactions).filter(([, r]) => r.count > 0);
  if (entries.length === 0) return null;

  return (
    <View style={[rstyles.row, isOwn ? rstyles.rowOwn : rstyles.rowOther]}>
      {entries.map(([emoji, r]) => (
        <TouchableOpacity
          key={emoji}
          style={[rstyles.pill, r.byMe && rstyles.pillActive]}
          onPress={() => onReact(emoji)}
          activeOpacity={0.75}
        >
          <Text style={rstyles.emoji}>{emoji}</Text>
          {r.count > 1 && <Text style={rstyles.count}>{r.count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const rstyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginHorizontal: 4 },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start', marginLeft: 36 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: T.SURFACE,
    borderWidth: 1, borderColor: T.BORDER,
  },
  pillActive: { borderColor: T.ACCENT, backgroundColor: T.ACCENT_LIGHT },
  emoji: { fontSize: 14, lineHeight: 18 },
  count: { fontSize: 11, fontFamily: 'System', color: T.TEXT_2 },
});

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  reactions,
  isOwn,
  onLongPress,
  onReact,
  onUnlockPaid,
}: {
  message: ChatMessage;
  reactions: MessageReactions;
  isOwn: boolean;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onUnlockPaid?: () => void;
}) {
  const isPaidLocked = !!(message as any).isPaid && !(message as any).isUnlocked;

  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.8}
        onLongPress={onLongPress}
        style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}
      >
        {!isOwn && (
          <MsAvatar
            size={28}
            initials={initials(message.sender.name)}
            imageUri={message.sender.avatarUrl ?? undefined}
          />
        )}
        <View style={{ maxWidth: '70%' }}>
          {message.isDeleted ? (
            <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, styles.bubbleDeleted]}>
              <Text style={styles.bubbleDeletedText}>Message deleted</Text>
            </View>
          ) : isPaidLocked ? (
            <TouchableOpacity
              style={[styles.bubble, styles.bubblePaid]}
              onPress={onUnlockPaid}
              activeOpacity={0.8}
            >
              <LockSimple size={18} color={T.ACCENT} />
              <Text style={styles.paidText}>Paid content</Text>
              <Text style={styles.paidSub}>Tap to unlock with credits</Text>
            </TouchableOpacity>
          ) : (
            <>
              {message.mediaUrl && message.mediaType === 'image' && (
                <Image
                  source={{ uri: message.mediaUrl }}
                  style={[styles.bubbleImage, isOwn ? { borderTopRightRadius: 2 } : { borderTopLeftRadius: 2 }]}
                  resizeMode="cover"
                />
              )}
              {(message.body) ? (
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
                    {message.body}
                  </Text>
                </View>
              ) : null}
            </>
          )}
          <Text style={[styles.bubbleTime, isOwn ? styles.bubbleTimeOwn : styles.bubbleTimeOther]}>
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Reactions */}
      <ReactionRow reactions={reactions} isOwn={isOwn} onReact={onReact} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const flatRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [otherUserName, setOtherUserName] = useState('');
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);

  // Reactions: messageId → { emoji → {emoji, count, byMe} }
  const [reactions, setReactions] = useState<Record<string, MessageReactions>>({});

  // Long-press menu
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Emoji picker for a specific message
  const [emojiTargetId, setEmojiTargetId] = useState<string | null>(null);
  const [emojiVisible, setEmojiVisible] = useState(false);

  // Image upload
  const [uploadingImage, setUploadingImage] = useState(false);

  const loadMessages = useCallback(async (before?: string) => {
    try {
      const data = await getMessages(conversationId, before);
      if (before) {
        setMessages((prev) => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages);
      }
      setHasMore(data.hasMore);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversationId]);

  useEffect(() => {
    getConversations('all').then((data) => {
      const conv = data.conversations.find((c) => c.id === conversationId);
      if (conv) {
        setOtherUserName(conv.otherUser.name);
        setOtherUserAvatar(conv.otherUser.avatarUrl);
      }
    }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);

    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      body,
      mediaUrl: null,
      mediaType: null,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: user?.id ?? '',
        name: user?.name ?? '',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
      isOwn: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const { message } = await sendMessage(conversationId, body);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? message : m)),
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(body);
    } finally {
      setSending(false);
    }
  };

  // ─── Image sending ────────────────────────────────────────────────────────

  const handleSendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your media library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingImage(true);

    const optimistic: ChatMessage = {
      id: `opt-img-${Date.now()}`,
      body: null,
      mediaUrl: asset.uri,
      mediaType: 'image',
      isDeleted: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: user?.id ?? '',
        name: user?.name ?? '',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
      isOwn: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const uploaded = await uploadMedia(asset.uri, mime, asset.fileName ?? 'photo.jpg');
      const { message } = await sendMessage(conversationId, undefined, uploaded.url ?? asset.uri, 'image');
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      Alert.alert('Failed', 'Could not send image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // ─── Reactions ────────────────────────────────────────────────────────────

  const handleReact = (messageId: string, emoji: string) => {
    setReactions((prev) => {
      const msgReactions = { ...(prev[messageId] ?? {}) };
      const existing = msgReactions[emoji];
      if (existing) {
        if (existing.byMe) {
          // Toggle off
          msgReactions[emoji] = { ...existing, count: existing.count - 1, byMe: false };
        } else {
          msgReactions[emoji] = { ...existing, count: existing.count + 1, byMe: true };
        }
      } else {
        msgReactions[emoji] = { emoji, count: 1, byMe: true };
      }
      return { ...prev, [messageId]: msgReactions };
    });
    setEmojiVisible(false);
    setEmojiTargetId(null);
  };

  // ─── Long-press menu ─────────────────────────────────────────────────────

  const handleLongPress = (msg: ChatMessage) => {
    setMenuMsg(msg);
    setMenuVisible(true);
  };

  const handleMenuDelete = async () => {
    if (!menuMsg) return;
    setMenuVisible(false);
    await deleteMessage(menuMsg.id);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === menuMsg.id ? { ...m, isDeleted: true, body: null } : m,
      ),
    );
  };

  const handleMenuReact = () => {
    if (!menuMsg) return;
    setMenuVisible(false);
    setEmojiTargetId(menuMsg.id);
    setEmojiVisible(true);
  };

  const handleMenuReport = () => {
    setMenuVisible(false);
    Alert.alert('Report', 'Message reported. Our team will review it.');
  };

  // ─── Load more ────────────────────────────────────────────────────────────

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    loadMessages(messages[0]?.createdAt);
  };

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const prev = messages[index - 1];
    const showDate = needsDateSeparator(item, prev);
    const msgReactions = reactions[item.id] ?? {};

    return (
      <View>
        {showDate && (
          <View style={styles.dateSep}>
            <View style={styles.dateSepLine} />
            <Text style={styles.dateSepText}>{formatDateLabel(item.createdAt)}</Text>
            <View style={styles.dateSepLine} />
          </View>
        )}
        <MessageBubble
          message={item}
          reactions={msgReactions}
          isOwn={item.isOwn}
          onLongPress={() => handleLongPress(item)}
          onReact={(emoji) => handleReact(item.id, emoji)}
          onUnlockPaid={() => {
            Alert.alert('Unlock', 'Spend credits to unlock this content?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Unlock', onPress: () => {/* implement unlock */} },
            ]);
          }}
        />
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={T.TEXT} />
        </TouchableOpacity>
        <MsAvatar
          size={36}
          initials={initials(otherUserName || '?')}
          imageUri={otherUserAvatar ?? undefined}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherUserName || 'Loading…'}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerMore} activeOpacity={0.7}>
          <DotsThree size={20} color={T.TEXT_2} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <Spinner size="lg" color="default" />
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.messageList}
            onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
            onStartReachedThreshold={0.3}
            onStartReached={handleLoadMore}
            ListHeaderComponent={
              loadingMore ? (
                <View style={{ alignItems: 'center', marginVertical: 16 }}>
                  <Spinner size="sm" color="default" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <MsAvatar
                  size={64}
                  initials={initials(otherUserName || '?')}
                  imageUri={otherUserAvatar ?? undefined}
                />
                <Text style={styles.emptyChatName}>{otherUserName}</Text>
                <Text style={styles.emptyChatHint}>No messages yet. Say hello! 👋</Text>
              </View>
            }
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Image picker button */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={handleSendImage}
            activeOpacity={0.7}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <Spinner size="sm" color="default" />
            ) : (
              <ImageIcon size={20} color={T.TEXT_2} />
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={T.TEXT_3}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            selectionColor={T.ACCENT}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <Spinner size="sm" color="default" />
            ) : (
              <PaperPlaneRight size={18} color={T.BG} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Long-press menu modal ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={menuStyles.overlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[menuStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={menuStyles.handle} />

            {/* Quick reaction row */}
            <View style={menuStyles.emojiRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={menuStyles.emojiBtn}
                  onPress={() => {
                    if (menuMsg) handleReact(menuMsg.id, emoji);
                    setMenuVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={menuStyles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={menuStyles.emojiBtn}
                onPress={handleMenuReact}
                activeOpacity={0.7}
              >
                <Smiley size={22} color={T.TEXT_2} />
              </TouchableOpacity>
            </View>

            <View style={menuStyles.divider} />

            {menuMsg?.isOwn && !menuMsg?.isDeleted && (
              <TouchableOpacity style={menuStyles.action} onPress={handleMenuDelete} activeOpacity={0.7}>
                <Text style={[menuStyles.actionLabel, { color: T.ERROR }]}>Delete message</Text>
              </TouchableOpacity>
            )}

            {!menuMsg?.isOwn && (
              <TouchableOpacity style={menuStyles.action} onPress={handleMenuReport} activeOpacity={0.7}>
                <Text style={menuStyles.actionLabel}>Report message</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={menuStyles.action} onPress={() => setMenuVisible(false)} activeOpacity={0.7}>
              <Text style={[menuStyles.actionLabel, { color: T.TEXT_2 }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Emoji picker modal ── */}
      <Modal
        visible={emojiVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEmojiVisible(false)}
      >
        <TouchableOpacity
          style={menuStyles.overlay}
          activeOpacity={1}
          onPress={() => setEmojiVisible(false)}
        >
          <View style={[menuStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={menuStyles.handle} />
            <Text style={menuStyles.emojiPickerTitle}>React with</Text>
            <View style={menuStyles.emojiGrid}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={menuStyles.emojiGridBtn}
                  onPress={() => emojiTargetId && handleReact(emojiTargetId, emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={menuStyles.emojiGridText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
    gap: 10,
  },
  headerBack: {
    width: 36, height: 36, borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  headerMore: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },

  bubbleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 2,
  },
  bubbleWrapOwn: { justifyContent: 'flex-end' },
  bubbleWrapOther: { justifyContent: 'flex-start' },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: '100%',
  },
  bubbleOwn: {
    backgroundColor: T.TEXT,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: T.SURFACE,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  bubbleDeleted: {
    backgroundColor: T.SURFACE_2,
    borderStyle: 'dashed',
  },
  bubbleDeletedText: {
    fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_3, fontStyle: 'italic',
  },
  bubblePaid: {
    backgroundColor: T.ACCENT_LIGHT,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: T.ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    minWidth: 140,
  },
  paidText: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.ACCENT },
  paidSub: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  bubbleText: { fontSize: 15, lineHeight: 22, fontFamily: T.FONT.regular },
  bubbleTextOwn: { color: T.BG },
  bubbleTextOther: { color: T.TEXT },
  bubbleImage: {
    width: 200, height: 200, borderRadius: 18, marginBottom: 4,
  },
  bubbleTime: { fontSize: 10, fontFamily: T.FONT.regular, marginTop: 3 },
  bubbleTimeOwn: { color: T.TEXT_3, textAlign: 'right' },
  bubbleTimeOther: { color: T.TEXT_3, textAlign: 'left', marginLeft: 4 },

  dateSep: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10,
  },
  dateSepLine: { flex: 1, height: 1, backgroundColor: T.BORDER },
  dateSepText: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_3, letterSpacing: 0.4 },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyChatName: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, marginTop: 4 },
  emptyChatHint: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
    gap: 8,
    backgroundColor: T.BG,
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  input: {
    flex: 1,
    minHeight: 42, maxHeight: 120,
    backgroundColor: T.SURFACE,
    borderRadius: 21,
    borderWidth: 1, borderColor: T.BORDER_2,
    paddingHorizontal: 16,
    paddingTop: 10, paddingBottom: 10,
    fontSize: 15, fontFamily: T.FONT.regular, color: T.TEXT,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: T.TEXT,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: T.SURFACE_2 },
});

const menuStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center', marginBottom: 16,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    marginBottom: 8,
  },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: T.BG,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },
  divider: { height: 1, backgroundColor: T.BORDER, marginBottom: 4 },
  action: {
    paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: T.BORDER,
    alignItems: 'center',
  },
  actionLabel: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT },
  emojiPickerTitle: {
    fontSize: 16, fontFamily: T.FONT.semibold, color: T.TEXT,
    textAlign: 'center', marginBottom: 16,
  },
  emojiGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 12,
    paddingBottom: 16,
  },
  emojiGridBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: T.BG,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiGridText: { fontSize: 28 },
});
