/**
 * MeetSweet Chat Screen — complete rebuild.
 * WhatsApp-quality UX: animated input bar, voice→send, camera slide,
 * reply preview, full bottom sheets, SQLite caching, offline support.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Camera,
  DotsThree,
  Paperclip,
  PaperPlaneRight,
  Phone,
  Smiley,
  Microphone,
  LockSimple,
  ArrowBendUpLeft,
  Copy as CopyIcon,
  Trash,
  ArrowUUpRight,
  Info,
  VideoCamera,
  X,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoClipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmojiPicker } from '@/components/MsEmojiPicker';
import { MsAttachmentSheet } from '@/components/MsAttachmentSheet';
import type { AttachmentResult } from '@/components/MsAttachmentSheet';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMessages,
  sendMessage,
  deleteMessage,
  getConversations,
  type ChatMessage,
} from '@/services/messages';
import { uploadMedia } from '@/services/media';
import {
  getCachedMessages,
  cacheMessages,
  deleteCachedMessage,
  getCachedConversations,
  cacheConversations,
} from '@/services/chat-cache';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const ICON_ANIM_DURATION = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

type Reaction = { emoji: string; count: number; byMe: boolean };
type MessageReactions = Record<string, Reaction>;
type ReplyTarget = { id: string; body: string | null; senderName: string } | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function needsDateSep(curr: ChatMessage, prev?: ChatMessage): boolean {
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
    <View style={[rs.row, isOwn ? rs.own : rs.other]}>
      {entries.map(([emoji, r]) => (
        <TouchableOpacity
          key={emoji}
          style={[rs.pill, r.byMe && rs.pillActive]}
          onPress={() => onReact(emoji)}
          activeOpacity={0.75}
        >
          <Text style={rs.emoji}>{emoji}</Text>
          {r.count > 1 && <Text style={rs.count}>{r.count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const rs = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, marginHorizontal: 12 },
  own: { justifyContent: 'flex-end' },
  other: { justifyContent: 'flex-start' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 12, backgroundColor: T.SURFACE,
    borderWidth: 1, borderColor: T.BORDER,
  },
  pillActive: { borderColor: T.ACCENT, backgroundColor: T.ACCENT_LIGHT },
  emoji: { fontSize: 13, lineHeight: 17 },
  count: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2 },
});

// ─── Date separator ───────────────────────────────────────────────────────────

function DateSep({ label }: { label: string }) {
  return (
    <View style={ds.wrap}>
      <View style={ds.line} />
      <View style={ds.badge}>
        <Text style={ds.text}>{label}</Text>
      </View>
      <View style={ds.line} />
    </View>
  );
}

const ds = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 16, gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: T.BORDER },
  badge: { backgroundColor: T.SURFACE_2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  text: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_3, letterSpacing: 0.3 },
});

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: ChatMessage;
  reactions: MessageReactions;
  replyTo?: { body: string | null; senderName: string } | null;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onUnlockPaid?: () => void;
}

function MessageBubble({ message, reactions, replyTo, onLongPress, onReact, onUnlockPaid }: BubbleProps) {
  const isOwn = message.isOwn;
  const isPaidLocked = !!(message as any).isPaid && !(message as any).isUnlocked;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 200 }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={280}
        style={[bs.wrap, isOwn ? bs.wrapOwn : bs.wrapOther]}
      >
        <View style={{ maxWidth: '78%' }}>
          {/* Reply quote */}
          {replyTo && (
            <View style={[bs.replyQuote, isOwn ? bs.replyQuoteOwn : bs.replyQuoteOther]}>
              <View style={bs.replyAccent} />
              <View style={{ flex: 1 }}>
                <Text style={bs.replyName} numberOfLines={1}>{replyTo.senderName}</Text>
                <Text style={bs.replyBody} numberOfLines={1}>
                  {replyTo.body ?? '📎 Media'}
                </Text>
              </View>
            </View>
          )}

          {message.isDeleted ? (
            <View style={[bs.bubble, bs.bubbleDeleted]}>
              <Text style={bs.deletedText}>🚫 Message deleted</Text>
            </View>
          ) : isPaidLocked ? (
            <TouchableOpacity style={bs.bubblePaid} onPress={onUnlockPaid} activeOpacity={0.8}>
              <View><LockSimple size={18} color={T.ACCENT} /></View>
              <Text style={bs.paidLabel}>Paid content</Text>
              <Text style={bs.paidSub}>Tap to unlock with credits</Text>
            </TouchableOpacity>
          ) : (
            <>
              {message.mediaUrl && message.mediaType === 'image' && (
                <Image
                  source={{ uri: message.mediaUrl }}
                  style={[
                    bs.bubbleImage,
                    isOwn ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 },
                  ]}
                  resizeMode="cover"
                />
              )}
              {message.body ? (
                <View style={[bs.bubble, isOwn ? bs.bubbleOwn : bs.bubbleOther]}>
                  <Text style={[bs.text, isOwn ? bs.textOwn : bs.textOther]}>
                    {message.body}
                  </Text>
                  {/* Timestamp inside bubble */}
                  <Text style={[bs.timeInline, isOwn ? bs.timeOwn : bs.timeOther]}>
                    {formatTime(message.createdAt)}
                    {isOwn ? '  ✓✓' : ''}
                  </Text>
                </View>
              ) : null}
            </>
          )}

          {/* Timestamp below image messages */}
          {message.mediaUrl && !message.body && (
            <Text style={[bs.timeBelow, isOwn ? bs.timeBelowOwn : bs.timeBelowOther]}>
              {formatTime(message.createdAt)}{isOwn ? '  ✓✓' : ''}
            </Text>
          )}
        </View>
      </Pressable>

      <ReactionRow reactions={reactions} isOwn={isOwn} onReact={onReact} />
    </Animated.View>
  );
}

const bs = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 2, paddingHorizontal: 12 },
  wrapOwn: { justifyContent: 'flex-end' },
  wrapOther: { justifyContent: 'flex-start' },

  replyQuote: {
    flexDirection: 'row',
    borderRadius: 10,
    marginBottom: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
    gap: 8,
  },
  replyQuoteOwn: { backgroundColor: 'rgba(255,255,255,0.1)' },
  replyQuoteOther: { backgroundColor: T.SURFACE_2 },
  replyAccent: { width: 3, borderRadius: 2, backgroundColor: T.ACCENT },
  replyName: { fontSize: 11, fontFamily: T.FONT.semibold, color: T.ACCENT, marginBottom: 1 },
  replyBody: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingTop: 8,
    paddingBottom: 5,
    maxWidth: '100%',
  },
  bubbleOwn: {
    backgroundColor: T.ACCENT,
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
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  deletedText: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_3, fontStyle: 'italic' },

  bubblePaid: {
    backgroundColor: T.ACCENT_LIGHT,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    minWidth: 150,
  },
  paidLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.ACCENT },
  paidSub: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2 },

  text: { fontSize: 15, lineHeight: 21, fontFamily: T.FONT.regular },
  textOwn: { color: '#fff' },
  textOther: { color: T.TEXT },

  timeInline: { fontSize: 10, fontFamily: T.FONT.regular, marginTop: 3, alignSelf: 'flex-end' },
  timeOwn: { color: 'rgba(255,255,255,0.6)' },
  timeOther: { color: T.TEXT_3 },

  bubbleImage: { width: Math.min(SCREEN_W * 0.62, 260), height: 200, borderRadius: 18, marginBottom: 3 },
  timeBelow: { fontSize: 10, fontFamily: T.FONT.regular, marginTop: 2, paddingHorizontal: 4 },
  timeBelowOwn: { color: T.TEXT_3, textAlign: 'right' },
  timeBelowOther: { color: T.TEXT_3 },
});

// ─── Reply preview bar ────────────────────────────────────────────────────────

function ReplyBar({ reply, onDismiss }: { reply: ReplyTarget; onDismiss: () => void }) {
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const opacAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reply) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -60, duration: 180, useNativeDriver: true }),
        Animated.timing(opacAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [reply]);

  if (!reply) return null;

  return (
    <Animated.View style={[rbs.wrap, { transform: [{ translateY: slideAnim }], opacity: opacAnim }]}>
      <View style={rbs.accent} />
      <View style={{ flex: 1 }}>
        <Text style={rbs.name} numberOfLines={1}>{reply.senderName}</Text>
        <Text style={rbs.body} numberOfLines={1}>{reply.body ?? '📎 Media'}</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={rbs.closeBtn} activeOpacity={0.7}>
        <X size={14} color={T.TEXT_2} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const rbs = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
  },
  accent: { width: 3, height: 36, borderRadius: 2, backgroundColor: T.ACCENT },
  name: { fontSize: 12, fontFamily: T.FONT.semibold, color: T.ACCENT },
  body: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  closeBtn: { padding: 4 },
});

// ─── Long-press action sheet ──────────────────────────────────────────────────

interface LPSheetProps {
  visible: boolean;
  message: ChatMessage | null;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onForward: () => void;
  onReact: (emoji: string) => void;
  onInfo: () => void;
}

function LongPressSheet(props: LPSheetProps) {
  const { visible, message, onClose } = props;
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!message) return null;

  const canDelete = message.isOwn && !message.isDeleted;
  const canCopy = !!(message.body && !message.isDeleted);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={lps.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[lps.sheet, { paddingBottom: Math.max(insets.bottom, 16) }, { transform: [{ translateY: slideAnim }] }]}>
        <View style={lps.handle} />

        {/* Quick reactions */}
        <View style={lps.emojiRow}>
          {QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={lps.emojiBtn}
              onPress={() => { props.onReact(emoji); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={lps.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={lps.emojiBtn}
            onPress={() => { props.onReact('picker'); onClose(); }}
            activeOpacity={0.7}
          >
            <Smiley size={22} color={T.TEXT_2} />
          </TouchableOpacity>
        </View>

        <View style={lps.divider} />

        {/* Actions */}
        <LPAction icon={<ArrowBendUpLeft size={18} color={T.TEXT} />} label="Reply" onPress={() => { props.onReply(); onClose(); }} />
        {canCopy && (
          <LPAction icon={<CopyIcon size={18} color={T.TEXT} />} label="Copy" onPress={() => { props.onCopy(); onClose(); }} />
        )}
        <LPAction icon={<ArrowUUpRight size={18} color={T.TEXT} />} label="Forward" onPress={() => { props.onForward(); onClose(); }} />
        <LPAction icon={<Info size={18} color={T.TEXT} />} label="Message info" onPress={() => { props.onInfo(); onClose(); }} />
        {canDelete && (
          <LPAction icon={<Trash size={18} color={T.ERROR} />} label="Delete" labelColor={T.ERROR} onPress={() => { props.onDelete(); onClose(); }} />
        )}
        {!message.isOwn && (
          <LPAction
            icon={<Trash size={18} color={T.ERROR} />}
            label="Report"
            labelColor={T.ERROR}
            onPress={() => { Alert.alert('Reported', 'Message reported. Our team will review it.'); onClose(); }}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

function LPAction({ icon, label, onPress, labelColor }: { icon: React.ReactNode; label: string; onPress: () => void; labelColor?: string }) {
  return (
    <TouchableOpacity style={lps.action} onPress={onPress} activeOpacity={0.7}>
      <View style={lps.actionIcon}>{icon}</View>
      <Text style={[lps.actionLabel, labelColor ? { color: labelColor } : {}]}>{label}</Text>
    </TouchableOpacity>
  );
}

const lps = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 14 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, marginBottom: 6 },
  emojiBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 22 },
  divider: { height: 1, backgroundColor: T.BORDER, marginBottom: 4 },
  action: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14, borderBottomWidth: 1, borderBottomColor: T.BORDER },
  actionIcon: { width: 24, alignItems: 'center' },
  actionLabel: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT },
});

// ─── Offline banner ───────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <View style={ofl.wrap}>
      <Text style={ofl.text}>⚡ Offline — showing cached messages</Text>
    </View>
  );
}
const ofl = StyleSheet.create({
  wrap: { backgroundColor: T.SURFACE_2, paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  text: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
});

// ─── Animated Input Bar ───────────────────────────────────────────────────────

interface InputBarProps {
  text: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onEmojiToggle: () => void;
  onAttachToggle: () => void;
  onCameraPress: () => void;
  sending: boolean;
  reply: ReplyTarget;
  onDismissReply: () => void;
  paddingBottom: number;
}

function InputBar(props: InputBarProps) {
  const {
    text, onChangeText, onSend,
    onEmojiToggle, onAttachToggle, onCameraPress,
    sending, reply, onDismissReply, paddingBottom,
  } = props;

  const hasText = text.trim().length > 0;

  // Camera slides out of the pill when typing
  const cameraAnim = useRef(new Animated.Value(1)).current; // 1 = visible
  // Mic → Send transition (outside pill)
  const micAnim = useRef(new Animated.Value(1)).current;
  const sendAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cameraAnim, {
        toValue: hasText ? 0 : 1,
        duration: ICON_ANIM_DURATION,
        useNativeDriver: false, // drives width
      }),
      Animated.timing(micAnim, {
        toValue: hasText ? 0 : 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sendAnim, {
        toValue: hasText ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [hasText]);

  const cameraWidth = cameraAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });
  const cameraOpacity = cameraAnim;

  return (
    <View style={ib.wrapper}>
      {/* Reply preview */}
      <ReplyBar reply={reply} onDismiss={onDismissReply} />

      <View style={[ib.row, { paddingBottom }]}>
        {/* ── Pill: emoji | input | paperclip | camera ── */}
        <View style={ib.pill}>
          {/* Emoji — left inside pill */}
          <TouchableOpacity style={ib.pillIcon} onPress={onEmojiToggle} activeOpacity={0.7}>
            <Smiley size={20} color={T.TEXT_2} />
          </TouchableOpacity>

          {/* Text input — grows, no cap */}
          <TextInput
            style={ib.input}
            placeholder="Message…"
            placeholderTextColor={T.TEXT_3}
            value={text}
            onChangeText={onChangeText}
            multiline
            scrollEnabled={false}
            underlineColorAndroid="transparent"
            selectionColor={T.ACCENT}
            returnKeyType="default"
            blurOnSubmit={false}
          />

          {/* Paperclip — right inside pill */}
          <TouchableOpacity style={ib.pillIcon} onPress={onAttachToggle} activeOpacity={0.7}>
            <Paperclip size={20} color={T.TEXT_2} />
          </TouchableOpacity>

          {/* Camera — slides out of pill when typing */}
          <Animated.View style={{ width: cameraWidth, overflow: 'hidden', opacity: cameraOpacity }}>
            <TouchableOpacity style={ib.pillIcon} onPress={onCameraPress} activeOpacity={0.7}>
              <Camera size={20} color={T.TEXT_2} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* ── Mic ↔ Send (outside the pill) ── */}
        <View style={ib.rightBtn}>
          <Animated.View style={[ib.btnAbsolute, { opacity: micAnim, transform: [{ scale: micAnim }] }]}>
            <TouchableOpacity
              style={ib.actionBtn}
              onPress={() => Alert.alert('Voice note', 'Hold to record a voice message.')}
              activeOpacity={0.8}
            >
              <Microphone size={18} color="#fff" weight="fill" />
            </TouchableOpacity>
          </Animated.View>
          <Animated.View style={[ib.btnAbsolute, { opacity: sendAnim, transform: [{ scale: sendAnim }] }]}>
            <TouchableOpacity
              style={ib.actionBtn}
              onPress={onSend}
              activeOpacity={0.8}
              disabled={!hasText || sending}
            >
              <PaperPlaneRight size={18} color="#fff" weight="fill" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const ib = StyleSheet.create({
  wrapper: {
    backgroundColor: T.BG,
    // No border — transparent top
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  // One pill containing all icons + text
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 2,
    paddingVertical: 2,
    minHeight: 36,
  },
  pillIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingHorizontal: 4,
    paddingTop: 5,
    paddingBottom: 5,
    // Remove Android's extra internal font spacing so text sits centred
    includeFontPadding: false,
  },
  rightBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  btnAbsolute: { position: 'absolute' },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const flatRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');

  const [otherUserName, setOtherUserName] = useState('');
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);
  const [isOnline] = useState(false); // future: real presence

  const [reactions, setReactions] = useState<Record<string, MessageReactions>>({});
  const [replyTargets] = useState<Record<string, { body: string | null; senderName: string }>>({});

  // Sheets
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);

  // Reply
  const [replyTarget, setReplyTarget] = useState<ReplyTarget>(null);

  // Image uploading
  const [uploadingImage, setUploadingImage] = useState(false);

  // ── Load conversations to get other user info ──────────────────────────────

  useEffect(() => {
    (async () => {
      // Try cache first
      const cached = await getCachedConversations();
      const conv = cached.find((c) => c.id === conversationId);
      if (conv) {
        setOtherUserName(conv.otherUser.name);
        setOtherUserAvatar(conv.otherUser.avatarUrl);
      }
      // Then server
      try {
        const data = await getConversations('all');
        const found = data.conversations.find((c) => c.id === conversationId);
        if (found) {
          setOtherUserName(found.otherUser.name);
          setOtherUserAvatar(found.otherUser.avatarUrl);
        }
        await cacheConversations(data.conversations);
      } catch {}
    })();
  }, [conversationId]);

  // ── Load messages ──────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (before?: string) => {
    try {
      const data = await getMessages(conversationId, before);
      if (before) {
        setMessages((prev) => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages);
      }
      setHasMore(data.hasMore);
      setOffline(false);
      await cacheMessages(conversationId, data.messages);
    } catch {
      if (!before) {
        // Fall back to cache
        const cached = await getCachedMessages(conversationId);
        if (cached.length > 0) {
          setMessages(cached);
          setOffline(true);
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversationId]);

  useEffect(() => { loadMessages(); }, [conversationId]);

  const scrollToEnd = (animated = true) => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated }), 60);
  };

  // ── Send text ──────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);
    setReplyTarget(null);

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
    scrollToEnd();

    try {
      const { message } = await sendMessage(conversationId, body);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)));
      await cacheMessages(conversationId, [message]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(body);
    } finally {
      setSending(false);
    }
  };

  // ── Attachment result ──────────────────────────────────────────────────────

  const handleAttachmentResult = async (result: AttachmentResult) => {
    setUploadingImage(true);
    const optimistic: ChatMessage = {
      id: `opt-att-${Date.now()}`,
      body: null,
      mediaUrl: result.uri,
      mediaType: result.type === 'image' ? 'image' : 'video',
      isDeleted: false,
      createdAt: new Date().toISOString(),
      sender: { id: user?.id ?? '', name: user?.name ?? '', username: user?.username ?? '', avatarUrl: user?.avatarUrl ?? null },
      isOwn: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToEnd();

    try {
      const uploaded = await uploadMedia(result.uri, result.mimeType, result.fileName);
      const mediaType = result.type === 'image' ? 'image' : 'video';
      const { message } = await sendMessage(conversationId, undefined, uploaded.url ?? result.uri, mediaType);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)));
      await cacheMessages(conversationId, [message]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      Alert.alert('Upload failed', 'Could not send media. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Camera quick photo ─────────────────────────────────────────────────────

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await handleAttachmentResult({
        type: 'image',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? 'photo.jpg',
      });
    }
  };

  // ── Reactions ──────────────────────────────────────────────────────────────

  const handleReact = (messageId: string, emoji: string) => {
    setReactions((prev) => {
      const msgR = { ...(prev[messageId] ?? {}) };
      const ex = msgR[emoji];
      if (ex) {
        msgR[emoji] = { ...ex, count: ex.byMe ? ex.count - 1 : ex.count + 1, byMe: !ex.byMe };
      } else {
        msgR[emoji] = { emoji, count: 1, byMe: true };
      }
      return { ...prev, [messageId]: msgR };
    });
  };

  // ── Long press ─────────────────────────────────────────────────────────────

  const handleLongPress = (msg: ChatMessage) => {
    setMenuMsg(msg);
    setMenuVisible(true);
  };

  const handleDelete = async () => {
    if (!menuMsg) return;
    await deleteMessage(menuMsg.id);
    await deleteCachedMessage(menuMsg.id);
    setMessages((prev) =>
      prev.map((m) => (m.id === menuMsg.id ? { ...m, isDeleted: true, body: null } : m)),
    );
  };

  const handleCopy = () => {
    if (!menuMsg?.body) return;
    ExpoClipboard.setStringAsync(menuMsg.body).catch(() => {
      try { Clipboard.setString(menuMsg.body ?? ''); } catch {}
    });
  };

  const handleReply = () => {
    if (!menuMsg) return;
    setReplyTarget({
      id: menuMsg.id,
      body: menuMsg.body,
      senderName: menuMsg.isOwn ? 'You' : menuMsg.sender.name,
    });
  };

  const handleForward = () => {
    Alert.alert('Forward', 'Forward message: coming soon.');
  };

  const handleInfo = () => {
    Alert.alert(
      'Message Info',
      `Sent: ${menuMsg ? formatTime(menuMsg.createdAt) : '—'}`,
    );
  };

  // ── Load more ──────────────────────────────────────────────────────────────

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    loadMessages(messages[0]?.createdAt);
  };

  // ── Emoji insert ───────────────────────────────────────────────────────────

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    setShowEmoji(false);
  };

  // ── Render item ────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const prev = messages[index - 1];
      const showDate = needsDateSep(item, prev);
      const msgReactions = reactions[item.id] ?? {};
      const rTarget = replyTargets[item.id] ?? null;

      return (
        <View>
          {showDate && <DateSep label={formatDateLabel(item.createdAt)} />}
          <MessageBubble
            message={item}
            reactions={msgReactions}
            replyTo={rTarget}
            onLongPress={() => handleLongPress(item)}
            onReact={(emoji) => handleReact(item.id, emoji)}
            onUnlockPaid={() =>
              Alert.alert('Unlock', 'Spend credits to unlock this content?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unlock', onPress: () => {} },
              ])
            }
          />
        </View>
      );
    },
    [messages, reactions, replyTargets],
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={[sc.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={sc.header}>
        <TouchableOpacity style={sc.backBtn} onPress={() => router.back()} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft size={20} color={T.TEXT} />
        </TouchableOpacity>

        <MsAvatar
          size={38}
          initials={initials(otherUserName || '?')}
          imageUri={otherUserAvatar ?? undefined}
        />

        <View style={sc.headerInfo}>
          <Text style={sc.headerName} numberOfLines={1}>
            {otherUserName || '…'}
          </Text>
          <Text style={sc.headerStatus}>
            {isOnline ? '🟢 Online' : 'Tap for info'}
          </Text>
        </View>

        <View style={sc.headerActions}>
          <TouchableOpacity
            style={sc.headerActionBtn}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Voice call', 'Voice calls are coming soon.')}
          >
            <Phone size={20} color={T.TEXT} />
          </TouchableOpacity>
          <TouchableOpacity
            style={sc.headerActionBtn}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Video call', 'Video calls are coming soon.')}
          >
            <VideoCamera size={20} color={T.TEXT} />
          </TouchableOpacity>
          <TouchableOpacity style={sc.headerActionBtn} activeOpacity={0.7}>
            <DotsThree size={20} color={T.TEXT} />
          </TouchableOpacity>
        </View>
      </View>

      {offline && <OfflineBanner />}

      {/* ── Messages ── */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={sc.loadingWrap}>
            <View style={sc.loadingDots}>
              <Text style={sc.loadingText}>Loading…</Text>
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={sc.msgList}
            onLayout={() => scrollToEnd(false)}
            onStartReachedThreshold={0.3}
            onStartReached={handleLoadMore}
            ListHeaderComponent={
              loadingMore ? (
                <View style={{ alignItems: 'center', marginVertical: 12 }}>
                  <Text style={{ color: T.TEXT_3, fontSize: 12, fontFamily: T.FONT.regular }}>Loading more…</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={sc.emptyWrap}>
                <MsAvatar
                  size={70}
                  initials={initials(otherUserName || '?')}
                  imageUri={otherUserAvatar ?? undefined}
                />
                <Text style={sc.emptyName}>{otherUserName}</Text>
                <Text style={sc.emptyHint}>No messages yet — say hello! 👋</Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      {/* ── Input bar ── */}
      <InputBar
        text={text}
        onChangeText={setText}
        onSend={handleSend}
        onEmojiToggle={() => { Keyboard.dismiss(); setShowEmoji(true); }}
        onAttachToggle={() => { Keyboard.dismiss(); setShowAttach(true); }}
        onCameraPress={handleCamera}
        sending={sending || uploadingImage}
        reply={replyTarget}
        onDismissReply={() => setReplyTarget(null)}
        paddingBottom={Math.max(insets.bottom, 10)}
      />

      {/* ── Sheets ── */}
      <MsEmojiPicker
        visible={showEmoji}
        onClose={() => setShowEmoji(false)}
        onEmojiSelect={handleEmojiSelect}
      />

      <MsAttachmentSheet
        visible={showAttach}
        onClose={() => setShowAttach(false)}
        onResult={handleAttachmentResult}
      />

      {/* ── Long-press menu ── */}
      <LongPressSheet
        visible={menuVisible}
        message={menuMsg}
        onClose={() => setMenuVisible(false)}
        onReply={handleReply}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onForward={handleForward}
        onReact={(emoji) => {
          if (menuMsg) {
            if (emoji === 'picker') return; // future: open full picker
            handleReact(menuMsg.id, emoji);
          }
        }}
        onInfo={handleInfo}
      />
    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT },
  headerStatus: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 2 },
  headerActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingDots: { padding: 16 },
  loadingText: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_3 },

  msgList: { paddingVertical: 8, flexGrow: 1 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  emptyName: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, marginTop: 4 },
  emptyHint: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2 },
});
