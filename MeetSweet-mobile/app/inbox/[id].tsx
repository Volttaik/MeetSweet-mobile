/**
 * Private Thread — email-style correspondence view.
 *
 * The whole thread renders as one vertical correspondence: the paid original
 * at the top, then every reply in order (replies to replies included). Each
 * message shows a compact reference to the message it answers — tap it to
 * jump to that message. Either participant may reply to any message; only
 * the creator can price reply attachments. Locked attachments never receive
 * a URL from the server; unlocked ones render inline and open in a viewer.
 *
 * Waiting messages (sender muted) show an approval banner instead of the
 * composer until the recipient approves or allows the sender.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
  DotsThreeVertical,
  Hourglass,
  Lock,
  Play,
  Plus,
  Prohibit,
  UserCheck,
  X,
} from 'phosphor-react-native';
import { T, alpha, AppGradients, MEDIA_BG } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { useScrollMotion } from '@/lib/scroll-motion';
import { goBack } from '@/lib/safe-back';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { MsAttachmentSheet, type AttachmentResult } from '@/components/MsAttachmentSheet';
import { MsMediaLoader } from '@/components/MsMediaLoader';
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
    if (!message || !body.trim() || sending) return;
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
      <Pressable key={`${keyPrefix}-${a.id}`} style={styles.lockedCard} onPress={() => unlock(a.id)}>
        <View style={styles.lockedIcon}>
          <BrandGradientFill />
          <Lock size={16} color="#FFFFFF" weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.lockedTitle}>Paid content</Text>
          <Text style={styles.lockedSub}>Tap to unlock for ₦{a.price.toLocaleString()}</Text>
        </View>
        <View style={styles.unlockBtn}>
          <BrandGradientFill />
          <Text style={styles.unlockBtnText}>Unlock</Text>
        </View>
      </Pressable>
    ) : a.media_url ? (
      <UnlockedAttachment
        key={`${keyPrefix}-${a.id}`}
        attachment={a}
        onPress={() => setViewer({ uri: a.media_url!, isVideo: a.media_type === 'video' })}
      />
    ) : (
      <Text key={`${keyPrefix}-${a.id}`} style={styles.attachmentNote}>Attachment ({a.media_type})</Text>
    );

  const renderMessage = (msg: PrivateMessage) => {
    const mine = msg.sender_id === user?.id;
    // Replies tuck in toward the centre under their parent so the thread
    // relationship reads at a glance; the side still shows who sent what.
    const depth = Math.min(threadDepths.get(msg.id) ?? 0, 3);
    const senderLabel = mine ? 'You' : (msg.sender_name ?? msg.sender_username ?? 'Sender');
    const referenced = threadRows.find((t) => t.id === msg.parent_message_id);
    const time = new Date(msg.created_at).toLocaleString();
    // Delivery fee only ever applies to the paid original, never to replies.
    const paidNote =
      !msg.parent_message_id && msg.price_paid > 0
        ? ` · ₦${msg.price_paid.toLocaleString()} delivery`
        : '';
    return (
      <View
        key={msg.id}
        onLayout={(e) => layoutY.current.set(msg.id, e.nativeEvent.layout.y)}
        style={[
          styles.msgWrap,
          mine ? styles.msgMine : styles.msgTheirs,
          depth > 0 && { marginLeft: depth * 16 },
        ]}
      >
        {msg.parent_message_id && referenced ? (
          <Pressable
            style={styles.reference}
            onPress={() => jumpTo(referenced.id)}
            accessibilityRole="button"
            accessibilityLabel={`Jump to the message this replies to`}
          >
            <ArrowBendUpLeft size={13} color={T.TEXT_3} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.referenceName} numberOfLines={1}>
                Replying to {referenced.sender_id === user?.id ? 'yourself' : (referenced.sender_name ?? referenced.sender_username ?? 'message')}
              </Text>
              <Text style={styles.referenceBody} numberOfLines={1}>{referenced.body}</Text>
            </View>
          </Pressable>
        ) : null}
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
          <View style={styles.bubbleHeader}>
            <Text
              style={[styles.senderLabel, mine ? styles.senderLabelMine : styles.senderLabelTheirs]}
              numberOfLines={1}
            >
              {senderLabel}
            </Text>
            {msg.status === 'waiting' ? (
              <View style={styles.waitingChip}>
                <Hourglass size={10} color="#FFFFFF" weight="fill" />
                <Text style={styles.waitingChipText}>Waiting approval</Text>
              </View>
            ) : null}
            <Text style={styles.time} numberOfLines={1}>
              {time}{paidNote}
            </Text>
          </View>
          <Text style={styles.body}>{msg.body}</Text>
          {msg.attachments.map((a) => renderAttachment(a, msg.id))}
          {!mine && !isWaiting ? (
            <Pressable
              style={styles.replyLink}
              onPress={() => setReplyTo(msg)}
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${senderLabel}`}
            >
              <ArrowBendUpLeft size={14} color={T.PRIMARY_LIGHT} />
              <Text style={styles.replyLinkText}>Reply</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={T.PRIMARY_LIGHT} />
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
  const canCompose = !isWaiting; // waiting must be approved before replying

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={22} color={T.TEXT} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>{otherName}</Text>
          <Text style={styles.subtitle}>
            {isWaiting ? 'Waiting for your approval' : 'Private correspondence'}
          </Text>
        </View>
        <Pressable onPress={openDeleteMenu} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Delete correspondence">
          <DotsThreeVertical size={20} color={T.TEXT} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        ref={scrollRef}
        {...useScrollMotion()}
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

        {/* The thread — original then replies, oldest first */}
        {threadRows.map((msg) => renderMessage(msg))}

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

        {/* Reply composer — either participant may reply to any message */}
        {canCompose ? (
          <>
            <View style={styles.threadLine} />
            {replyTo ? (
              <View style={styles.replyToBanner}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={styles.replyToName} numberOfLines={1}>
                    Replying to {replyTo.sender_id === user?.id ? 'yourself' : (replyTo.sender_name ?? replyTo.sender_username ?? 'message')}
                  </Text>
                  <Text style={styles.replyToBody} numberOfLines={1}>{replyTo.body}</Text>
                </View>
                <Pressable hitSlop={10} onPress={() => setReplyTo(null)} accessibilityRole="button" accessibilityLabel="Cancel reply">
                  <X size={15} color={T.TEXT_3} />
                </Pressable>
              </View>
            ) : null}
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={5000}
              placeholder={amRecipient ? 'Write a reply…' : 'Write a follow-up…'}
              placeholderTextColor={T.TEXT_3}
              selectionColor={T.CARET}
              style={styles.input}
              textAlignVertical="top"
            />

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

            <View style={styles.composerActions}>
              <Pressable style={styles.attachBtn} onPress={() => setSheetVisible(true)} disabled={attachments.length >= 10}>
                <Plus size={17} color={T.TEXT_2} />
                <Text style={styles.attachBtnText}>Attach</Text>
              </Pressable>
              <Pressable
                style={[styles.sendBtn, (!body.trim() || sending) && styles.disabled]}
                onPress={sendReply}
                disabled={!body.trim() || sending}
              >
                <BrandGradientFill />
                {sending ? <ActivityIndicator color={T.ACCENT_FG} /> : <Text style={styles.sendBtnText}>Send Reply</Text>}
              </Pressable>
            </View>
          </>
        ) : null}
      </KeyboardAwareScrollViewCompat>

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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: T.SURFACE },
  headerCenter: { flex: 1, alignItems: 'center', marginHorizontal: 10 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16 },
  subtitle: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular, marginTop: 1 },

  content: { gap: 14, paddingHorizontal: 18, paddingBottom: 48 },

  // Two-sided correspondence: received messages left, sent messages right.
  // Replies additionally indent (depth × 16) so the thread chain stays clear.
  msgWrap: { maxWidth: '84%', gap: 8 },
  msgMine: { alignSelf: 'flex-end' },
  msgTheirs: { alignSelf: 'flex-start' },

  reference: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderLeftWidth: 2,
    borderLeftColor: T.ACCENT,
  },
  referenceName: { color: T.TEXT_2, fontSize: 10.5, fontFamily: T.FONT.semibold },
  referenceBody: { color: T.TEXT_3, fontSize: 11.5, fontFamily: T.FONT.regular },

  bubble: {
    padding: 14,
    borderRadius: T.RADIUS.lg,
    gap: 10,
    overflow: 'hidden',
  },
  bubbleMine: {
    backgroundColor: alpha(T.PRIMARY, 0.16),
    borderWidth: 1,
    borderColor: alpha(T.PRIMARY_LIGHT, 0.32),
  },
  bubbleTheirs: {
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  focused: { borderColor: T.PRIMARY_LIGHT, borderWidth: 1.5 },
  bubbleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  senderLabel: { fontSize: 11.5, fontFamily: T.FONT.semibold, flexShrink: 1 },
  senderLabelMine: { color: T.PRIMARY_LIGHT },
  senderLabelTheirs: { color: T.TEXT_2 },
  time: { color: T.TEXT_3, fontSize: 10.5, fontFamily: T.FONT.regular, flexShrink: 0 },
  waitingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.SECONDARY,
    overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: T.RADIUS.full,
    flexShrink: 0,
  },
  waitingChipText: { color: '#FFFFFF', fontSize: 9, fontFamily: T.FONT.bold, letterSpacing: 0.3 },

  body: { color: T.TEXT, fontSize: 15, lineHeight: 23, fontFamily: T.FONT.regular },
  replyLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingTop: 2 },
  replyLinkText: { color: T.PRIMARY_LIGHT, fontSize: 12, fontFamily: T.FONT.semibold },

  threadLine: { alignSelf: 'flex-start', marginLeft: 24, width: 1.5, height: 14, backgroundColor: T.BORDER_2 },

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

  // Reply composer
  replyToBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderLeftWidth: 2, borderLeftColor: T.ACCENT,
  },
  replyToName: { color: T.PRIMARY_LIGHT, fontSize: 11, fontFamily: T.FONT.semibold },
  replyToBody: { color: T.TEXT_3, fontSize: 11.5, fontFamily: T.FONT.regular },

  sectionLabel: { color: T.TEXT_3, fontSize: 12, fontFamily: T.FONT.medium, marginTop: 4 },
  input: {
    minHeight: 110,
    padding: 14,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    color: T.TEXT,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: T.FONT.regular,
    textAlignVertical: 'top',
  },

  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
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

  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
  },
  pendingThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: T.SURFACE_2 },
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
    height: 34,
  },
  naira: { color: T.TEXT_2, fontSize: 13, fontFamily: T.FONT.medium },
  priceInput: { flex: 1, color: T.TEXT, fontSize: 14, fontFamily: T.FONT.medium, paddingVertical: 0 },

  composerActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  attachBtn: {
    width: 88,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 12,
  },
  attachBtnText: { color: T.TEXT_2, fontSize: 11, fontFamily: T.FONT.medium },
  sendBtn: {
    flex: 1,
    borderRadius: T.RADIUS.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  disabled: { opacity: 0.5 },
  sendBtnText: { color: T.ACCENT_FG, fontFamily: T.FONT.semibold, fontSize: 15 },

  viewerClose: { position: 'absolute', top: 48, right: 18, zIndex: 10 },
});
