/**
 * Private Thread — email-style correspondence view.
 *
 * Original message → (optional) creator reply, rendered as a thread. The
 * creator replies once, optionally attaching media — each attachment may
 * carry a price the original sender must pay to unlock. Locked attachments
 * never receive a URL from the server; unlocked ones render inline and open
 * in a fullscreen viewer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  Lock,
  Play,
  Plus,
  X,
} from 'phosphor-react-native';
import { T, alpha, MEDIA_BG } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientBorder } from '@/components/GradientBorder';
import { useScrollMotion } from '@/lib/scroll-motion';
import { goBack } from '@/lib/safe-back';
import { MsAttachmentSheet, type AttachmentResult } from '@/components/MsAttachmentSheet';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { useAuth } from '@/contexts/AuthContext';
import {
  getPrivateMessage,
  markPrivateMessageRead,
  purchasePrivateAttachment,
  replyToPrivateMessage,
  type Attachment,
  type PrivateMessage,
} from '@/services/private-inbox';
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
  if (result.type === 'audio' || result.type === 'document') return 'file';
  return null;
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

export default function PrivateThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [message, setMessage] = useState<PrivateMessage | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  // Viewer state: which attachment is open fullscreen.
  const [viewer, setViewer] = useState<{ uri: string; isVideo: boolean } | null>(null);

  const amRecipient = message?.recipient_id === user?.id;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const m = await getPrivateMessage(id);
      setMessage(m);
      // The recipient opening the thread marks it read (server notifies the sender).
      if (m.recipient_id === user?.id) await markPrivateMessageRead(id).catch(() => {});
    } catch {
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

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
      setMessage((m) =>
        m
          ? {
              ...m,
              reply: m.reply
                ? { ...m.reply, attachments: m.reply.attachments.map((x) => (x.id === attachmentId ? r.attachment : x)) }
                : m.reply,
            }
          : m,
      );
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
    const ready = attachments.filter((a): a is PendingAttachment & { mediaId: string } => a.mediaId !== null);
    if (ready.length !== attachments.length) return; // uploads still in flight
    setSending(true);
    try {
      const result = await replyToPrivateMessage(
        message.id,
        body.trim(),
        ready.map((a) => ({
          media_id: a.mediaId,
          media_type: a.mediaType,
          ...(a.price.trim() ? { price: Math.max(0, Number(a.price.replace(/[^0-9.]/g, '')) || 0) } : {}),
        })),
      );
      setMessage((m) => (m ? { ...m, reply: result.message, status: 'replied' } : m));
      setBody('');
      setAttachments([]);
    } catch (e) {
      Alert.alert('Could not reply', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={22} color={T.TEXT} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>{otherName}</Text>
          <Text style={styles.subtitle}>Private correspondence</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView {...useScrollMotion()} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Original message */}
        <Text style={styles.date}>{new Date(message.created_at).toLocaleString()}</Text>
        <GradientBorder radius={T.RADIUS.lg} surface={T.SURFACE} style={styles.cardBorder}>
        <View style={styles.card}>
          <Text style={styles.body}>{message.body}</Text>
          {message.attachments.map((a) => renderAttachment(a, 'orig'))}
          {message.price_paid > 0 ? (
            <Text style={styles.paidTag}>₦{message.price_paid.toLocaleString()} delivery</Text>
          ) : null}
        </View>
        </GradientBorder>

        {/* Reply — threaded under the original */}
        {message.reply ? (
          <>
            <View style={styles.threadLine} />
            <Text style={styles.date}>{new Date(message.reply.created_at).toLocaleString()}</Text>
            <GradientBorder radius={T.RADIUS.lg} surface={T.SURFACE} style={styles.cardBorder}>
            <View style={[styles.card, styles.replyCard]}>
              <Text style={styles.body}>{message.reply.body}</Text>
              {message.reply.attachments.map((a) => renderAttachment(a, 'reply'))}
            </View>
            </GradientBorder>
          </>
        ) : amRecipient ? (
          /* Reply composer — creators only, one reply per message */
          <>
            <View style={styles.threadLine} />
            <Text style={styles.sectionLabel}>Your reply</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={5000}
              placeholder="Write a reply…"
              placeholderTextColor={T.TEXT_3}
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
                  ) : (
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
                          style={styles.priceInput}
                        />
                      </View>
                    </View>
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
        ) : (
          <Text style={styles.waitingNote}>Waiting for a reply…</Text>
        )}
      </ScrollView>

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

  content: { gap: 10, paddingHorizontal: 18, paddingBottom: 48 },
  date: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular, marginTop: 6 },
  cardBorder: {
    borderRadius: T.RADIUS.lg,
  },
  card: {
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    gap: 12,
  },
  body: { color: T.TEXT, fontSize: 15, lineHeight: 23, fontFamily: T.FONT.regular },

  replyCard: { borderLeftWidth: 2, borderLeftColor: T.ACCENT },
  sectionLabel: { color: T.TEXT_3, fontSize: 12, fontFamily: T.FONT.medium, marginTop: 4 },
  threadLine: { alignSelf: 'flex-start', marginLeft: 24, width: 1.5, height: 14, backgroundColor: T.BORDER_2 },

  paidTag: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.medium },
  waitingNote: { color: T.TEXT_3, fontSize: 12, textAlign: 'center', marginTop: 8 },

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
    backgroundColor: T.GOLD,
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
