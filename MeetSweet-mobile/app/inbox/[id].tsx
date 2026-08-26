/**
 * Private Thread — chat-style correspondence view.
 *
 * Rebuilt from the old DM chat UI (UI recovery only): the thread now reads
 * like a real chat screen while the underlying system stays the simplified
 * Private Message model (original + replies, inbox/outbox/waiting, paid
 * delivery, paid media). Nothing from the removed chat backend was restored.
 *
 * Visual language (recovered from the pre-removal chat UI, rebuilt on the
 * current MeetSweet design system):
 *   • Sent bubbles right, received bubbles left — immediately obvious.
 *   • Compact tail-corner bubbles (12px radius, 4px tail) that wrap tightly
 *     around their content; sent bubbles carry the faint platform-gradient
 *     wash, received bubbles sit on the plain app surface.
 *   • Timestamp + delivery status on one non-wrapping line inside the bubble
 *     (single check = sent, accent double-check = read).
 *   • Centred date pills separate message groups by day.
 *   • Replies carry a tappable quote preview above the bubble (accent bar,
 *     "Replying to X" + preview) and indent under the message they answer —
 *     tapping jumps to and highlights the original.
 *   • Composer is a fixed bottom bar that rides the keyboard (keyboard-
 *     controller), expands for longer text, and keeps the gradient send
 *     button one tap away.
 *
 * Real-time: the screen subscribes to the existing SweetSocket stream
 * (services/realtime) — new replies, read/status changes, approvals and
 * deletions arrive as events and update the thread in place. No polling.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowBendUpLeft,
  ArrowLeft,
  Check,
  Checks,
  DotsThreeVertical,
  Hourglass,
  Lock,
  PaperPlaneRight,
  Play,
  Plus,
  Prohibit,
  UserCheck,
  X,
} from 'phosphor-react-native';
import { T, alpha, AppGradients, MEDIA_BG } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { goBack } from '@/lib/safe-back';
import { useScrollMotion } from '@/lib/scroll-motion';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { MsAttachmentSheet, type AttachmentResult } from '@/components/MsAttachmentSheet';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsShimmerChatList } from '@/components/MsShimmer';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { useAuth } from '@/contexts/AuthContext';
import {
  allowPrivateSender,
  approvePrivateMessage,
  deletePrivateMessage,
  getPrivateMessage,
  markPrivateMessageRead,
  purchasePrivateAttachment,
  replyToPrivateMessage,
  type Attachment,
  type PrivateMessage,
} from '@/services/private-inbox';
import { blockUser } from '@/services/users';
import { uploadMedia } from '@/services/media';
import { realtime } from '@/services/realtime';

type InboxMediaType = 'image' | 'video' | 'file';

interface PendingAttachment {
  localUri: string;
  mediaId: string | null;
  mediaType: InboxMediaType;
  /** Optional unlock price (Naira) the creator places on this content. */
  price: string;
}

function toInboxMediaType(result: AttachmentResult): InboxMediaType | null {
  if (result.type === 'image' || result.type === 'gif') return 'image';
  if (result.type === 'video') return 'video';
  if (result.type === 'document') return 'file';
  return null;
}

// ─── Time / day helpers ───────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

// ─── URL detection (recovered from the old chat text bubble) ─────────────────

const URL_RE = /https?:\/\/[\w-]+(\.[\w-]+)+[\w-.,@?^=%&:/~+#]*|www\.[\w-]+(\.[\w-]+)+[\w-.,@?^=%&:/~+#]*/gi;

function parseLinks(text: string): Array<{ text: string; isLink: boolean; url?: string }> {
  if (!text) return [];
  const segments: Array<{ text: string; isLink: boolean; url?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isLink: false });
    }
    const raw = match[0];
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    segments.push({ text: raw, isLink: true, url });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isLink: false });
  }
  return segments;
}

/**
 * Sent-message bubble fill — a very subtle diagonal wash of the MeetSweet
 * brand gradient (magenta → amber → violet at low opacity). Just enough to
 * mark the sender's side without shouting; received bubbles stay on the plain
 * app surface so the two sides read at a glance.
 */
const SENT_BUBBLE_GRADIENT = [
  'rgba(255,140,0,0.13)',
  'rgba(255,20,147,0.15)',
  'rgba(128,0,128,0.17)',
] as const;

/** Soft entrance for each message row — fade + 4px rise, like the old chat. */
function Entrance({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 200,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Centred day pill between message groups (recovered date-separator pattern). */
function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateWrap}>
      <View style={styles.datePill}>
        <Text style={styles.dateText}>{label}</Text>
      </View>
    </View>
  );
}

/** Delivery status — single check (sent) / accent double-check (read). */
function StatusIcon({ msg, mine }: { msg: PrivateMessage; mine: boolean }) {
  if (!mine || msg.status === 'waiting') return null;
  const read = !!msg.read_at || msg.status === 'read' || msg.status === 'replied';
  return read ? (
    <Checks size={11} color={T.PRIMARY_LIGHT} weight="bold" />
  ) : (
    <Check size={11} color={T.TEXT_3} weight="bold" />
  );
}

// ─── Unlocked attachment rendering ────────────────────────────────────────────

function UnlockedAttachment({
  attachment,
  onPress,
}: {
  attachment: Attachment;
  onPress: () => void;
}) {
  const isVideo = attachment.media_type === 'video';
  const uri = isVideo ? (attachment.thumbnail_url ?? attachment.media_url) : attachment.media_url;
  if (!uri) return null;
  return (
    <Pressable onPress={onPress} style={styles.media}>
      <MsMediaLoader uri={uri} style={StyleSheet.absoluteFill} resizeMode="cover" accessibleLabel="" errorMessage="" fallback={null} />
      {isVideo ? (
        <View style={styles.playBadge}>
          <Play size={12} color={T.ACCENT_FG} weight="fill" />
        </View>
      ) : null}
      {/* Paid + purchased — show it was unlocked */}
      {attachment.price > 0 ? (
        <View style={styles.unlockedBadge}>
          <BrandGradientFill />
          <Check size={9} color="#FFFFFF" weight="bold" />
          <Text style={styles.unlockedBadgeText}>Unlocked</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Locked paid media — never exposes the content until purchased/unlocked. */
function LockedAttachment({ attachment, onUnlock }: { attachment: Attachment; onUnlock: () => void }) {
  return (
    <Pressable style={styles.lockedCard} onPress={onUnlock} accessibilityRole="button" accessibilityLabel={`Unlock paid media for ₦${attachment.price.toLocaleString()}`}>
      <View style={styles.lockedIcon}>
        <BrandGradientFill />
        <Lock size={16} color="#FFFFFF" weight="fill" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.lockedTitle}>Paid media</Text>
        <Text style={styles.lockedSub}>Tap to unlock for ₦{attachment.price.toLocaleString()}</Text>
      </View>
      <View style={styles.unlockBtn}>
        <BrandGradientFill />
        <Text style={styles.unlockBtnText}>Unlock</Text>
      </View>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PrivateThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [message, setMessage] = useState<PrivateMessage | null>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<PrivateMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  // Viewer state: which attachment is open fullscreen.
  const [viewer, setViewer] = useState<{ uri: string; isVideo: boolean } | null>(null);
  // Jump-to + highlight a referenced message.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const layoutY = useRef<Map<string, number>>(new Map());
  // One idempotency key per reply draft: retries after a network failure
  // never duplicate the reply; a fresh key is minted after success.
  const idempotencyKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  // Follow new messages: jump to the newest row on first paint, then animate
  // down only when the row count grows (a reply arrived while open).
  const lastRowCount = useRef(0);

  const amRecipient = message?.recipient_id === user?.id;
  const isWaiting = message?.status === 'waiting';
  // Only the thread's creator participant prices media — server-authoritative
  // (thread_creator_id), correct in both thread directions: fan-initiated
  // (creator = recipient) and creator-initiated (creator = sender).
  const canPriceAttachments = message?.thread_creator_id === user?.id;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const m = await getPrivateMessage(id);
      setMessage(m);
      // The recipient opening the thread marks their unread rows read
      // (server notifies the sender). Waiting rows are not marked until
      // approved.
      if (m.recipient_id === user?.id && m.status !== 'waiting') {
        await markPrivateMessageRead(id).catch(() => {});
      }
    } catch {
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Thread rows oldest → newest, with a legacy fallback for cached shapes. */
  const threadRows: PrivateMessage[] = message?.thread?.length
    ? message.thread
    : message
      ? [message, ...(message.reply ? [message.reply] : [])]
      : [];

  /**
   * Thread depth per message id (0 = original). Replies indent under the
   * message they answer, so the original → reply → further-reply chain stays
   * visually connected even though each message also sits on its own side.
   */
  const threadDepths = useMemo(() => {
    const depths = new Map<string, number>();
    const byId = new Map(threadRows.map((m) => [m.id, m]));
    for (const m of threadRows) {
      if (m.parent_message_id && byId.has(m.parent_message_id)) {
        depths.set(m.id, (depths.get(m.parent_message_id) ?? 0) + 1);
      } else {
        depths.set(m.id, 0);
      }
    }
    return depths;
  }, [threadRows]);

  // ── SweetSocket — the thread is live. New replies, read/status changes,
  //    approvals and deletions arrive as events; the UI updates in place.
  //    One subscription, cleaned up on unmount — no polling, no duplicates.
  useEffect(() => {
    return realtime.on((event) => {
      switch (event.type) {
        case 'private_message.reply_created': {
          const payload = event.payload as { original_id?: string; parent_id?: string; reply?: PrivateMessage };
          const reply = payload.reply;
          if (!reply) return;
          const belongsToThread =
            payload.original_id === id || payload.parent_id === id || reply.id === id || reply.parent_message_id === id;
          if (!belongsToThread) return;
          setMessage((prev) => {
            if (!prev) return prev;
            const rows = prev.thread?.length ? prev.thread : [prev, ...(prev.reply ? [prev.reply] : [])];
            if (rows.some((r) => r.id === reply.id) || prev.id === reply.id) return prev;
            return {
              ...prev,
              status: prev.recipient_id === user?.id ? 'replied' : prev.status,
              replied_at: reply.created_at,
              reply_count: (prev.reply_count ?? 0) + 1,
              thread: [...rows, reply],
            };
          });
          break;
        }
        case 'private_message.read': {
          const payload = event.payload as { message_id?: string; read_at?: string };
          const mid = payload.message_id ?? event.resourceId;
          if (!mid) return;
          setMessage((prev) => {
            if (!prev) return prev;
            const patch = (m: PrivateMessage): PrivateMessage =>
              m.id === mid
                ? { ...m, read_at: payload.read_at ?? m.read_at, status: m.status === 'sent' ? 'read' : m.status }
                : m;
            return { ...patch(prev), thread: prev.thread?.map(patch) };
          });
          break;
        }
        case 'private_message.updated': {
          const payload = event.payload as { message?: PrivateMessage };
          if (event.resourceId === id && payload.message) {
            setMessage((prev) => (prev ? { ...prev, ...payload.message! } : prev));
          }
          break;
        }
        case 'private_message.approved': {
          const payload = event.payload as { message_id?: string };
          if (payload.message_id !== id && event.resourceId !== id) return;
          setMessage((prev) => (prev && prev.status === 'waiting' ? { ...prev, status: 'sent' } : prev));
          break;
        }
        case 'private_message.deleted': {
          const payload = event.payload as { thread_id?: string };
          if (payload.thread_id === id || event.resourceId === id) goBack();
          break;
        }
        default:
          break;
      }
    });
  }, [id, user?.id]);

  const onAttachmentPicked = useCallback((result: AttachmentResult) => {
    const mediaType = toInboxMediaType(result);
    if (!mediaType) return;
    const entry: PendingAttachment = { localUri: result.uri, mediaId: null, mediaType, price: '' };
    setAttachments((prev) => [...prev, entry]);
    uploadMedia(result.uri, result.mimeType, result.fileName)
      .then((uploaded) => {
        setAttachments((prev) => prev.map((a) => (a === entry ? { ...a, mediaId: uploaded.id } : a)));
      })
      .catch(() => {
        setAttachments((prev) => prev.filter((a) => a !== entry));
        Alert.alert('Upload failed', 'The attachment could not be uploaded. Please try again.');
      });
  }, []);

  /** Purchase a priced reply attachment — server debits once atomically. */
  const unlock = async (attachmentId: string) => {
    try {
      const r = await purchasePrivateAttachment(attachmentId);
      const patch = (m: PrivateMessage | null): PrivateMessage | null => {
        if (!m) return m;
        const fixed = (msg: PrivateMessage): PrivateMessage => ({
          ...msg,
          attachments: msg.attachments.map((x) => (x.id === attachmentId ? r.attachment : x)),
        });
        return { ...fixed(m), thread: m.thread?.map(fixed) };
      };
      setMessage(patch);
      const fresh = r.attachment;
      if (!fresh.is_locked && fresh.media_url) {
        setViewer({ uri: fresh.media_url, isVideo: fresh.media_type === 'video' });
      }
    } catch (e) {
      Alert.alert('Could not unlock', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const sendReply = async () => {
    if (!message || sending) return;
    // A reply needs text, media, or both.
    if (!body.trim() && attachments.length === 0) return;
    const target = replyTo ?? message;
    const ready = attachments.filter((a): a is PendingAttachment & { mediaId: string } => a.mediaId !== null);
    if (ready.length !== attachments.length) return; // uploads still in flight
    setSending(true);
    try {
      const result = await replyToPrivateMessage({
        id: target.id,
        body: body.trim(),
        idempotencyKey: idempotencyKeyRef.current,
        attachments: ready.map((a) => ({
          media_id: a.mediaId,
          media_type: a.mediaType,
          ...(canPriceAttachments && a.price.trim() ? { price: Math.max(0, Number(a.price.replace(/[^0-9.]/g, '')) || 0) } : {}),
        })),
      });
      // Optimistic append — the follow-up load() reconciles with the server.
      setMessage((prev) => {
        if (!prev) return prev;
        const rows = prev.thread?.length ? prev.thread : [prev, ...(prev.reply ? [prev.reply] : [])];
        if (rows.some((r) => r.id === result.message.id) || prev.id === result.message.id) return prev;
        return {
          ...prev,
          status: prev.recipient_id === user?.id ? 'replied' : prev.status,
          replied_at: result.message.created_at,
          reply_count: (prev.reply_count ?? 0) + 1,
          thread: [...rows, result.message],
        };
      });
      await load();
      setBody('');
      setAttachments([]);
      setReplyTo(null);
      idempotencyKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (e) {
      Alert.alert('Could not reply', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const approve = async () => {
    if (!message) return;
    try {
      await approvePrivateMessage(message.id);
      await load();
    } catch (e) {
      Alert.alert('Could not approve', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const allowSender = async () => {
    if (!message) return;
    try {
      const r = await allowPrivateSender(message.sender_id);
      Alert.alert(
        'Allowed',
        r.approved > 0 ? `${r.approved} pending message${r.approved === 1 ? '' : 's'} moved to your inbox.` : 'This sender is allowed again.',
      );
      await load();
    } catch (e) {
      Alert.alert('Could not allow', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const blockSender = () => {
    if (!message) return;
    const senderName = message.sender_name ?? message.sender_username ?? 'this sender';
    Alert.alert(
      `Block ${senderName}?`,
      'They will no longer be able to send you private messages. You can unblock them later from their profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(message.sender_username ?? message.sender_id);
              Alert.alert('Blocked', `You can no longer receive private messages from ${senderName}.`);
            } catch (e) {
              Alert.alert('Could not block', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const openDeleteMenu = () => {
    if (!message) return;
    const senderInitiated = message.sender_id === user?.id;
    Alert.alert(
      'Delete this correspondence?',
      senderInitiated
        ? 'You sent the original message, so deleting removes it for BOTH you and the other person. This cannot be undone.'
        : 'This hides the correspondence from your inbox only. The sender keeps their copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: senderInitiated ? 'Delete for both' : 'Delete for me',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePrivateMessage(message.id);
              goBack();
            } catch (e) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const jumpTo = (msgId: string) => {
    const y = layoutY.current.get(msgId);
    setFocusedId(msgId);
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
    }
    setTimeout(() => setFocusedId(null), 1400);
  };

  const renderAttachment = (a: Attachment, keyPrefix: string) =>
    a.is_locked ? (
      <LockedAttachment key={`${keyPrefix}-${a.id}`} attachment={a} onUnlock={() => unlock(a.id)} />
    ) : a.media_url ? (
      <UnlockedAttachment
        key={`${keyPrefix}-${a.id}`}
        attachment={a}
        onPress={() => setViewer({ uri: a.media_url!, isVideo: a.media_type === 'video' })}
      />
    ) : (
      <Text key={`${keyPrefix}-${a.id}`} style={styles.attachmentNote}>Attachment ({a.media_type})</Text>
    );

  const renderMessage = (msg: PrivateMessage, index: number) => {
    const mine = msg.sender_id === user?.id;
    // Replies tuck in toward the centre under their parent so the thread
    // relationship reads at a glance; the side still shows who sent what.
    const depth = Math.min(threadDepths.get(msg.id) ?? 0, 3);
    const referenced = threadRows.find((t) => t.id === msg.parent_message_id);
    const time = formatTime(msg.created_at);
    // Delivery fee only ever applies to the paid original, never to replies.
    const paidNote =
      !msg.parent_message_id && msg.price_paid > 0
        ? ` · ₦${msg.price_paid.toLocaleString()} delivery`
        : '';
    return (
      <Entrance key={msg.id} delay={Math.min(index * 25, 200)}>
        <View
          onLayout={(e) => layoutY.current.set(msg.id, e.nativeEvent.layout.y)}
          style={[
            styles.msgWrap,
            mine ? styles.msgMine : styles.msgTheirs,
            depth > 0 && { marginLeft: depth * 16 },
          ]}
        >
          {/* Reply quote — the message this one answers, tap to jump */}
          {msg.parent_message_id && referenced ? (
            <Pressable
              style={styles.reference}
              onPress={() => jumpTo(referenced.id)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to the message this replies to`}
            >
              <View style={styles.referenceAccent} />
              <ArrowBendUpLeft size={13} color={T.TEXT_3} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.referenceName} numberOfLines={1}>
                  Replying to {referenced.sender_id === user?.id ? 'yourself' : (referenced.sender_name ?? referenced.sender_username ?? 'message')}
                </Text>
                <Text style={styles.referenceBody} numberOfLines={1}>{referenced.body || (referenced.attachments.length ? 'Attachment' : '')}</Text>
              </View>
            </Pressable>
          ) : null}

          {/* The bubble */}
          <View
            style={[
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleTheirs,
              focusedId === msg.id && styles.focused,
            ]}
          >
            {/* Sent bubbles carry a faint platform-gradient wash; received ones
                stay on the plain app surface. The structure is identical. */}
            {mine ? (
              <LinearGradient
                colors={SENT_BUBBLE_GRADIENT}
                start={AppGradients.brandStart}
                end={AppGradients.brandEnd}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            ) : null}

            <Text style={styles.body}>
              {parseLinks(msg.body || '').map((seg, i) =>
                seg.isLink ? (
                  <Text
                    key={i}
                    style={styles.bodyLink}
                    onPress={() => {
                      if (seg.url) Linking.openURL(seg.url).catch(() => {});
                    }}
                  >
                    {seg.text}
                  </Text>
                ) : (
                  <Text key={i}>{seg.text}</Text>
                )
              )}
            </Text>

            {msg.attachments.map((a) => renderAttachment(a, msg.id))}

            {/* Meta — timestamp + status always on ONE non-wrapping line */}
            <View style={[styles.meta, mine ? styles.metaRight : styles.metaLeft]}>
              {msg.status === 'waiting' ? (
                <View style={styles.waitingChip}>
                  <Hourglass size={10} color="#FFFFFF" weight="fill" />
                  <Text style={styles.waitingChipText}>Waiting approval</Text>
                </View>
              ) : null}
              <Text style={styles.time} numberOfLines={1}>
                {time}{paidNote}
              </Text>
              <StatusIcon msg={msg} mine={mine} />
            </View>

            {/* Reply affordance — received messages only */}
            {!mine && !isWaiting ? (
              <Pressable
                style={styles.replyLink}
                onPress={() => setReplyTo(msg)}
                accessibilityRole="button"
                accessibilityLabel={`Reply to ${msg.sender_name ?? msg.sender_username ?? 'sender'}`}
              >
                <ArrowBendUpLeft size={13} color={T.PRIMARY_LIGHT} />
                <Text style={styles.replyLinkText}>Reply</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Entrance>
    );
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.iconBtn} />
          <View style={styles.headerCenter} />
          <View style={styles.iconBtn} />
        </View>
        <MsShimmerChatList count={6} />
      </View>
    );
  }
  if (!message) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notice}>Message not found.</Text>
      </View>
    );
  }

  const otherName = amRecipient
    ? message.sender_name ?? message.sender_username ?? 'User'
    : message.recipient_name ?? message.recipient_username ?? 'Creator';
  const otherAvatar = amRecipient ? message.sender_avatar : message.recipient_avatar;
  const canCompose = !isWaiting; // waiting must be approved before replying

  const readyCount = attachments.filter((a) => a.mediaId !== null).length;
  const canSend = !sending && (body.trim().length > 0 || attachments.length > 0) && readyCount === attachments.length;

  // Follow the newest message: first paint jumps, later additions animate.
  const onContentSizeChange = useCallback(() => {
    const count = threadRows.length;
    if (lastRowCount.current === 0 && count > 0) {
      lastRowCount.current = count;
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    } else if (count > lastRowCount.current) {
      lastRowCount.current = count;
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [threadRows.length]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header — chat-style: back, avatar + name, actions */}
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} style={styles.iconBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={22} color={T.TEXT} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIdentity}>
            <MsAvatar size={34} initials={(otherName || 'U').slice(0, 2).toUpperCase()} imageUri={otherAvatar ?? undefined} />
            <View style={{ flex: 1, gap: 0 }}>
              <Text style={styles.title} numberOfLines={1}>{otherName}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {isWaiting ? 'Waiting for your approval' : 'Private correspondence'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable onPress={openDeleteMenu} style={styles.iconBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Delete correspondence">
          <DotsThreeVertical size={20} color={T.TEXT} />
        </Pressable>
      </View>

      {/* KeyboardAvoidingView lifts the composer above the keyboard (iOS);
          Android's resize mode already lifts the window. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <KeyboardAwareScrollViewCompat
          ref={scrollRef}
          {...useScrollMotion()}
          onContentSizeChange={onContentSizeChange}
          contentContainerStyle={styles.content}
        >
          {/* Waiting approval banner */}
          {isWaiting && amRecipient ? (
            <View style={styles.approveBanner}>
              <View style={styles.approveIcon}>
                <BrandGradientFill />
                <Hourglass size={16} color="#FFFFFF" weight="fill" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.approveTitle}>This message is waiting</Text>
                <Text style={styles.approveSub}>
                  Approve it to move it to your inbox, or allow the sender so future messages arrive normally.
                </Text>
              </View>
            </View>
          ) : null}

          {/* The thread — original then replies, oldest first, day pills between groups */}
          {threadRows.map((msg, i) => {
            const showDay = i === 0 || dayKey(msg.created_at) !== dayKey(threadRows[i - 1].created_at);
            return (
              <React.Fragment key={msg.id}>
                {showDay ? <DateSeparator label={dayLabel(msg.created_at)} /> : null}
                {renderMessage(msg, i)}
              </React.Fragment>
            );
          })}

          {/* Approval actions (waiting only) */}
          {isWaiting && amRecipient ? (
            <View style={styles.approveActions}>
              <Pressable style={styles.approveBtn} onPress={approve}>
                <BrandGradientFill />
                <Check size={15} color="#FFFFFF" weight="bold" />
                <Text style={styles.approveBtnText}>Approve</Text>
              </Pressable>
              <Pressable style={styles.allowBtn} onPress={allowSender}>
                <UserCheck size={15} color={T.PRIMARY_LIGHT} weight="bold" />
                <Text style={styles.allowBtnText}>Allow sender</Text>
              </Pressable>
              <Pressable style={styles.blockBtn} onPress={blockSender}>
                <Prohibit size={15} color={T.SECONDARY} weight="bold" />
                <Text style={styles.blockBtnText}>Block</Text>
              </Pressable>
            </View>
          ) : null}
        </KeyboardAwareScrollViewCompat>

        {/* Composer — fixed bottom bar, rides the keyboard, expands naturally */}
        {canCompose ? (
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            {replyTo ? (
              <View style={styles.replyToBanner}>
                <View style={styles.replyToAccent} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={styles.replyToName} numberOfLines={1}>
                    Replying to {replyTo.sender_id === user?.id ? 'yourself' : (replyTo.sender_name ?? replyTo.sender_username ?? 'message')}
                  </Text>
                  <Text style={styles.replyToBody} numberOfLines={1}>
                    {replyTo.body || (replyTo.attachments.length ? 'Attachment' : '')}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={() => setReplyTo(null)} accessibilityRole="button" accessibilityLabel="Cancel reply">
                  <X size={15} color={T.TEXT_3} />
                </Pressable>
              </View>
            ) : null}

            {/* Staged attachments (with creator price input) */}
            {attachments.length > 0 ? (
              <View style={styles.stagedWrap}>
                {attachments.map((a, i) => (
                  <View key={`${a.localUri}-${i}`} style={styles.pendingRow}>
                    {a.mediaType === 'image' ? (
                      <Image source={{ uri: a.localUri }} style={styles.pendingThumb} />
                    ) : (
                      <View style={[styles.pendingThumb, styles.pendingThumbFallback]}>
                        <Text style={styles.pendingFallbackText}>{a.mediaType.toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 6 }}>
                      {!a.mediaId ? (
                        <Text style={styles.pendingUploading}>Uploading…</Text>
                      ) : canPriceAttachments ? (
                        <View style={styles.priceRow}>
                          <Text style={styles.priceRowLabel}>Price (leave empty for free)</Text>
                          <View style={styles.priceInputWrap}>
                            <Text style={styles.naira}>₦</Text>
                            <TextInput
                              value={a.price}
                              onChangeText={(v) =>
                                setAttachments((prev) => prev.map((x, idx) => (idx === i ? { ...x, price: v } : x)))
                              }
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor={T.TEXT_3}
                              selectionColor={T.CARET}
                              style={styles.priceInput}
                            />
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.pendingUploading}>Ready to attach</Text>
                      )}
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                      accessibilityRole="button"
                      accessibilityLabel="Remove attachment"
                    >
                      <X size={16} color={T.TEXT_3} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Input row — pill + attach + gradient send */}
            <View style={styles.inputRow}>
              <View style={styles.pill}>
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={5000}
                  placeholder={amRecipient ? 'Write a reply…' : 'Write a follow-up…'}
                  placeholderTextColor={T.TEXT_3}
                  selectionColor={T.CARET}
                  style={styles.input}
                  underlineColorAndroid="transparent"
                  textAlignVertical="center"
                />
              </View>

              <Pressable
                style={styles.attachBtn}
                onPress={() => setSheetVisible(true)}
                disabled={attachments.length >= 10}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Attach media"
              >
                <Plus size={20} color={T.TEXT_2} weight="bold" />
              </Pressable>

              <Pressable
                style={[styles.sendBtn, !canSend && styles.disabled]}
                onPress={sendReply}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <BrandGradientFill />
                {sending ? (
                  <ActivityIndicator color={T.ACCENT_FG} />
                ) : (
                  <PaperPlaneRight size={20} color={T.ACCENT_FG} weight="fill" />
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Fullscreen media viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: MEDIA_BG }}>
          <Pressable style={styles.viewerClose} onPress={() => setViewer(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <X size={22} color={T.ACCENT_FG} weight="bold" />
          </Pressable>
          {viewer?.isVideo ? (
            <MsVideoPlayer videoId={`pm-${message.id}-${viewer.uri.slice(-16)}`} uri={viewer.uri} fillContainer />
          ) : (
            <MsMediaLoader uri={viewer?.uri ?? ''} style={StyleSheet.absoluteFill} resizeMode="contain" accessibleLabel="" errorMessage="" fallback={null} />
          )}
        </View>
      </Modal>

      <MsAttachmentSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onResult={onAttachmentPicked} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center', padding: 32 },
  notice: { color: T.TEXT_2, fontSize: 14, textAlign: 'center' },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: T.SURFACE },
  headerCenter: { flex: 1, marginHorizontal: 10 },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },
  subtitle: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular, marginTop: 1 },

  // ── Message area ──────────────────────────────────────────────────────────
  content: { paddingHorizontal: 14, paddingBottom: 24 },

  // Two-sided chat: received left, sent right. Replies additionally indent
  // (depth × 16) so the thread chain stays clear.
  msgWrap: { maxWidth: '84%', gap: 6, marginBottom: 6 },
  msgMine: { alignSelf: 'flex-end' },
  msgTheirs: { alignSelf: 'flex-start' },

  // Reply quote above the bubble — accent bar + "Replying to X" + preview.
  reference: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
  },
  referenceAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: T.ACCENT, flexShrink: 0 },
  referenceName: { color: T.PRIMARY_LIGHT, fontSize: 10.5, fontFamily: T.FONT.semibold },
  referenceBody: { color: T.TEXT_3, fontSize: 11.5, fontFamily: T.FONT.regular },

  // Chat bubble — compact, tail corner on the sending side, wraps tightly.
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: T.RADIUS.md,
    gap: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  bubbleMine: {
    backgroundColor: alpha(T.PRIMARY, 0.16),
    borderColor: alpha(T.PRIMARY_LIGHT, 0.32),
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: T.SURFACE,
    borderColor: T.BORDER,
    borderBottomLeftRadius: 4,
  },
  focused: { borderColor: T.PRIMARY_LIGHT, borderWidth: 1.5 },

  body: { color: T.TEXT, fontSize: 15, lineHeight: 23, fontFamily: T.FONT.regular },
  bodyLink: { color: T.PRIMARY_LIGHT, textDecorationLine: 'underline' },

  // Timestamp + status — one non-wrapping line.
  meta: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 4, marginTop: 1 },
  metaLeft: { justifyContent: 'flex-start' },
  metaRight: { justifyContent: 'flex-end' },
  time: { color: T.TEXT_3, fontSize: 10, fontFamily: T.FONT.regular, flexShrink: 0 },
  waitingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.SECONDARY,
    overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: T.RADIUS.full,
    flexShrink: 0,
  },
  waitingChipText: { color: '#FFFFFF', fontSize: 9, fontFamily: T.FONT.bold, letterSpacing: 0.3 },

  replyLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingTop: 1 },
  replyLinkText: { color: T.PRIMARY_LIGHT, fontSize: 12, fontFamily: T.FONT.semibold },

  // Centred date pill between message groups.
  dateWrap: { alignItems: 'center', marginVertical: 12 },
  datePill: {
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
    paddingHorizontal: 13,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  dateText: { fontSize: 10.5, fontFamily: T.FONT.medium, color: T.TEXT_3, letterSpacing: 0.2 },

  // Waiting approval banner + actions
  approveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    marginBottom: 4,
    marginTop: 6,
  },
  approveIcon: {
    width: 38, height: 38, borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  approveTitle: { color: T.TEXT, fontSize: 13.5, fontFamily: T.FONT.semibold },
  approveSub: { color: T.TEXT_2, fontSize: 11.5, lineHeight: 17, fontFamily: T.FONT.regular },
  approveActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: T.RADIUS.full, overflow: 'hidden',
    backgroundColor: T.ACCENT,
  },
  approveBtnText: { color: '#FFFFFF', fontSize: 13, fontFamily: T.FONT.semibold },
  allowBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: T.RADIUS.full, backgroundColor: T.SURFACE,
    borderWidth: 1, borderColor: T.BORDER,
  },
  allowBtnText: { color: T.PRIMARY_LIGHT, fontSize: 12.5, fontFamily: T.FONT.semibold },
  blockBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: T.RADIUS.full, backgroundColor: alpha(T.SECONDARY, 0.1),
  },
  blockBtnText: { color: T.SECONDARY, fontSize: 12.5, fontFamily: T.FONT.semibold },

  // ── Composer ──────────────────────────────────────────────────────────────
  composer: {
    backgroundColor: T.BG,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  replyToBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
    overflow: 'hidden',
    marginBottom: 8,
  },
  replyToAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: T.ACCENT, flexShrink: 0 },
  replyToName: { color: T.PRIMARY_LIGHT, fontSize: 11, fontFamily: T.FONT.semibold },
  replyToBody: { color: T.TEXT_3, fontSize: 11.5, fontFamily: T.FONT.regular },

  stagedWrap: { gap: 8, marginBottom: 8 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 11,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  pendingThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: T.SURFACE_2 },
  pendingThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  pendingFallbackText: { color: T.TEXT_3, fontSize: 9, fontFamily: T.FONT.bold },
  pendingUploading: { color: T.TEXT_3, fontSize: 12, fontFamily: T.FONT.regular },
  priceRow: { gap: 4 },
  priceRowLabel: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.sm,
    paddingHorizontal: 10,
    height: 32,
  },
  naira: { color: T.TEXT_2, fontSize: 13, fontFamily: T.FONT.medium },
  priceInput: { flex: 1, color: T.TEXT, fontSize: 14, fontFamily: T.FONT.medium, paddingVertical: 0 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    borderWidth: 1,
    borderColor: T.BORDER,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    includeFontPadding: false,
    maxHeight: 110,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  disabled: { opacity: 0.5 },

  // ── Media ─────────────────────────────────────────────────────────────────
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  lockedIcon: {
    width: 36, height: 36, borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  lockedTitle: { color: T.TEXT, fontSize: 13, fontFamily: T.FONT.semibold },
  lockedSub: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular, marginTop: 1 },
  unlockBtn: {
    backgroundColor: T.ACCENT,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
  },
  unlockBtnText: {
    color: T.ACCENT_FG,
    fontSize: 12,
    fontFamily: T.FONT.bold,
  },

  media: { width: '100%', aspectRatio: 4 / 3, borderRadius: T.RADIUS.md, overflow: 'hidden', backgroundColor: MEDIA_BG },
  playBadge: {
    position: 'absolute', left: 8, bottom: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  unlockedBadge: {
    position: 'absolute', right: 8, top: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  unlockedBadgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: T.FONT.bold, letterSpacing: 0.5 },
  attachmentNote: { color: T.TEXT_2, fontSize: 12, fontFamily: T.FONT.regular },

  viewerClose: { position: 'absolute', top: 48, right: 18, zIndex: 10 },
});
