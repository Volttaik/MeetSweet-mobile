/**
 * Compose Private Message — paid correspondence to a creator.
 *
 * Flow: pick a creator (creatorId param) → see the server-authoritative
 * delivery price → write the message → optionally attach media → confirm.
 * The wallet debit happens server-side in one atomic transaction; the client
 * only displays what the server reports and never dictates pricing.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  PaperPlaneTilt,
  Plus,
  Lock,
  X,
} from 'phosphor-react-native';
import { T, alpha, AppGradients } from '@/constants/theme';
import { goBack } from '@/lib/safe-back';
import { dialogs } from '@/components/MsGlobalDialogs';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { MsAttachmentSheet, type AttachmentResult } from '@/components/MsAttachmentSheet';
import { getMessagingSettings, sendPrivateMessage } from '@/services/private-inbox';
import { uploadMedia } from '@/services/media';
import { useWalletBalance } from '@/hooks/useWalletBalance';

/** Attachment types the Private Inbox accepts (server-validated). */
type InboxMediaType = 'image' | 'video' | 'file';

interface PendingAttachment {
  /** Local URI for the preview chip before/after upload. */
  localUri: string;
  /** Set once the upload completes — this is what the API needs. */
  mediaId: string | null;
  mediaType: InboxMediaType;
}

function toInboxMediaType(result: AttachmentResult): InboxMediaType | null {
  if (result.type === 'image' || result.type === 'gif') return 'image';
  if (result.type === 'video') return 'video';
  // Audio / documents ride along as generic files (stored as `document` media).
  if (result.type === 'audio' || result.type === 'document') return 'file';
  return null;
}

export default function ComposePrivateMessage() {
  const { creatorId } = useLocalSearchParams<{ creatorId?: string }>();
  const insets = useSafeAreaInsets();
  const { balance } = useWalletBalance();

  const [body, setBody] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [canMessage, setCanMessage] = useState(true);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(creatorId));
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  /**
   * One idempotency key per compose session: a retry after a network failure
   * reuses it, so the server returns the already-paid message instead of
   * charging twice. A fresh key is issued only after a confirmed send.
   */
  const idempotencyKeyRef = useRef(
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    if (!creatorId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMessagingSettings(creatorId)
      .then((s) => {
        if (cancelled) return;
        setPrice(s.price);
        setCanMessage(s.can_message);
        if (!s.can_message) {
          setBlockedReason(
            s.blocked
              ? 'You cannot message this creator.'
              : s.subscribed === false
                ? 'Subscribe to this creator to send them a private message.'
                : 'This creator is not accepting private messages.',
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCanMessage(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  const onAttachmentPicked = useCallback((result: AttachmentResult) => {
    const mediaType = toInboxMediaType(result);
    if (!mediaType) return;
    if (attachments.length >= 10) {
      dialogs.alert({ title: 'Limit reached', message: 'Up to 10 attachments per message.' });
      return;
    }
    const entry: PendingAttachment = {
      localUri: result.uri,
      mediaId: null,
      mediaType,
    };
    setAttachments((prev) => [...prev, entry]);
    setUploadingCount((n) => n + 1);
    uploadMedia(result.uri, result.mimeType, result.fileName)
      .then((uploaded) => {
        setAttachments((prev) =>
          prev.map((a) => (a === entry ? { ...a, mediaId: uploaded.id } : a)),
        );
      })
      .catch(() => {
        setAttachments((prev) => prev.filter((a) => a !== entry));
        dialogs.alert({ variant: 'error', title: 'Upload failed', message: 'The attachment could not be uploaded. Please try again.' });
      })
      .finally(() => setUploadingCount((n) => Math.max(0, n - 1)));
  }, [attachments.length]);

  const readyAttachments = attachments.filter((a): a is PendingAttachment & { mediaId: string } => a.mediaId !== null);
  const canSend =
    Boolean(creatorId) && canMessage && body.trim().length > 0 && sending === false && uploadingCount === 0;

  const insufficient = price !== null && balance < price;

  const send = async () => {
    if (!creatorId || !body.trim() || !canMessage || sending) return;
    // Block send until every attachment finished uploading.
    if (readyAttachments.length !== attachments.length) return;
    setSending(true);
    try {
      await sendPrivateMessage({
        recipientId: creatorId,
        body: body.trim(),
        idempotencyKey: idempotencyKeyRef.current,
        attachments: readyAttachments.map((a) => ({
          media_id: a.mediaId,
          media_type: a.mediaType,
        })),
      });
      // Consumed — the next message gets its own key.
      idempotencyKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      dialogs.alert({
        variant: 'success',
        title: 'Sent',
        message: 'Your private message was delivered.',
        onClose: () => router.replace('/messages' as any),
      });
    } catch (e) {
      dialogs.alert({
        variant: 'error',
        title: 'Could not send',
        message: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => goBack()} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={22} color={T.TEXT} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>New Private Message</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={T.PRIMARY_LIGHT} />
        </View>
      ) : !creatorId ? (
        <View style={styles.center}>
          <Text style={styles.notice}>Choose a creator first.</Text>
        </View>
      ) : !canMessage ? (
        <View style={styles.center}>
          <Text style={styles.notice}>{blockedReason ?? 'This creator is not accepting private messages.'}</Text>
        </View>
      ) : (
        <>
          {/* Price summary */}
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Delivery price</Text>
              <Text style={styles.priceValue}>₦{(price ?? 0).toLocaleString()}</Text>
            </View>
            <View style={[styles.priceRow, styles.balanceRow]}>
              <Text style={styles.priceLabel}>Your balance</Text>
              <Text style={[styles.balanceValue, insufficient && styles.balanceInsufficient]}>
                ₦{balance.toLocaleString()}
              </Text>
            </View>
            {insufficient ? (
              <Pressable style={styles.topUpHint} onPress={() => router.push('/wallet' as any)}>
                <Lock size={13} color={T.GOLD} />
                <Text style={styles.topUpHintText}>Balance too low — top up your wallet to send</Text>
              </Pressable>
            ) : null}
          </View>

          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
            placeholder="Write your correspondence…"
            placeholderTextColor={T.TEXT_3}
            style={styles.input}
            textAlignVertical="top"
          />

          {/* Attachment chips */}
          {attachments.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {attachments.map((a, i) => (
                <View key={`${a.localUri}-${i}`} style={styles.chip}>
                  {a.mediaType === 'image' ? (
                    <Image source={{ uri: a.localUri }} style={styles.chipThumb} />
                  ) : (
                    <View style={[styles.chipThumb, styles.chipThumbFallback]}>
                      <Text style={styles.chipThumbFallbackText}>{a.mediaType.toUpperCase()}</Text>
                    </View>
                  )}
                  {!a.mediaId ? (
                    <View style={styles.chipOverlay}>
                      <ActivityIndicator size="small" color={T.ACCENT_FG} />
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.chipRemove}
                    hitSlop={6}
                    onPress={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    accessibilityRole="button"
                    accessibilityLabel="Remove attachment"
                  >
                    <X size={11} color={T.ACCENT_FG} weight="bold" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {/* Actions */}
          <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable style={styles.attachBtn} onPress={() => setSheetVisible(true)} disabled={attachments.length >= 10}>
              <Plus size={18} color={T.TEXT_2} />
              <Text style={styles.attachBtnText}>Attach</Text>
            </Pressable>
            <Pressable
              disabled={!canSend}
              onPress={send}
              style={[styles.sendBtn, !canSend && styles.disabled]}
            >
              <BrandGradientFill />
              {sending ? (
                <ActivityIndicator color={T.ACCENT_FG} />
              ) : (
                <>
                  <PaperPlaneTilt size={17} color={T.ACCENT_FG} weight="fill" />
                  <Text style={styles.sendBtnText}>Confirm and Send</Text>
                </>
              )}
            </Pressable>
          </View>
        </>
      )}

      <MsAttachmentSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onResult={onAttachmentPicked} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: T.SURFACE },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 17, flex: 1, textAlign: 'center', marginHorizontal: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  notice: { color: T.TEXT_2, fontSize: 14, textAlign: 'center', lineHeight: 21 },

  priceCard: {
    marginHorizontal: 18,
    marginBottom: 14,
    padding: 16,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    gap: 10,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { color: T.TEXT_2, fontSize: 13, fontFamily: T.FONT.regular },
  // Coral delivery price — premium/money accent in the six-colour system.
  priceValue: { color: T.GOLD, fontSize: 17, fontFamily: T.FONT.bold },
  balanceRow: { paddingTop: 10, borderTopWidth: 1, borderTopColor: T.BORDER },
  balanceValue: { color: T.TEXT_2, fontSize: 14, fontFamily: T.FONT.semibold },
  balanceInsufficient: { color: T.ERROR },
  topUpHint: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  topUpHintText: { color: T.PRIMARY_LIGHT, fontSize: 12, fontFamily: T.FONT.medium, flex: 1 },

  input: {
    minHeight: 160,
    marginHorizontal: 18,
    padding: 16,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.lg,
    color: T.TEXT,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: T.FONT.regular,
    textAlignVertical: 'top',
  },

  chips: { gap: 10, paddingHorizontal: 18, paddingTop: 14 },
  chip: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: T.SURFACE_2 },
  chipThumb: { width: '100%', height: '100%' },
  chipThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  chipThumbFallbackText: { color: T.TEXT_3, fontSize: 9, fontFamily: T.FONT.bold, letterSpacing: 0.5 },
  chipOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  chipRemove: {
    position: 'absolute', top: 3, right: 3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 14,
    marginTop: 'auto',
  },
  attachBtn: {
    width: 92,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 14,
  },
  attachBtnText: { color: T.TEXT_2, fontSize: 12, fontFamily: T.FONT.medium },
  sendBtn: {
    flex: 1,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.ACCENT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 15,
  },
  disabled: { opacity: 0.5 },
  sendBtnText: { color: T.ACCENT_FG, fontFamily: T.FONT.semibold, fontSize: 15 },
});
