/**
 * Compose Private Message — paid correspondence between a creator and their
 * subscriber, in either direction.
 *
 * Fan → creator (`mode` omitted or "fan", `creatorId` param): the recipient is
 * a creator; the server-authoritative delivery price (if any) is shown and the
 * wallet debit happens server-side in one atomic transaction. The client only
 * displays what the server reports and never dictates pricing.
 *
 * Creator → subscriber (`mode: "creator"`, `recipientId` param): the recipient
 * is one of the sender's own subscribers. Delivery is free; the creator can
 * attach images/videos and optionally place a pay-to-unlock price on each one.
 * Prices are validated server-side — a fan's attachments are always forced free.
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
import { T, AppGradients } from '@/constants/theme';
import { goBack } from '@/lib/safe-back';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { dialogs } from '@/components/MsGlobalDialogs';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientText } from '@/components/GradientText';
import { LinearGradient } from 'expo-linear-gradient';
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
  /** Optional pay-to-unlock price (Naira) — creators pricing media only. */
  price: string;
}

function toInboxMediaType(result: AttachmentResult): InboxMediaType | null {
  if (result.type === 'image' || result.type === 'gif') return 'image';
  if (result.type === 'video') return 'video';
  if (result.type === 'document') return 'file';
  return null;
}

export default function ComposePrivateMessage() {
  const { creatorId, recipientId, mode } = useLocalSearchParams<{
    creatorId?: string;
    recipientId?: string;
    mode?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { balance } = useWalletBalance();

  const isCreatorMode = mode === 'creator';
  const recipient = recipientId ?? creatorId;

  const [body, setBody] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [canMessage, setCanMessage] = useState(true);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(recipient));
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
    // Creator → subscriber: delivery is free and the subscriber is chosen from
    // the sender's own subscriber list, so there is no inbox setting to load.
    if (isCreatorMode) {
      setLoading(false);
      setCanMessage(true);
      return;
    }
    if (!recipient) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMessagingSettings(recipient)
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
  }, [recipient, isCreatorMode]);

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
      price: '',
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
    Boolean(recipient) && canMessage && body.trim().length > 0 && sending === false && uploadingCount === 0;

  const insufficient = price !== null && balance < price;

  const send = async () => {
    if (!recipient || !body.trim() || !canMessage || sending) return;
    // Block send until every attachment finished uploading.
    if (readyAttachments.length !== attachments.length) return;
    setSending(true);
    try {
      await sendPrivateMessage({
        recipientId: recipient,
        body: body.trim(),
        idempotencyKey: idempotencyKeyRef.current,
        attachments: readyAttachments.map((a) => ({
          media_id: a.mediaId,
          media_type: a.mediaType,
          // Only a creator pricing media for their subscriber sends a price;
          // the server forces every other attachment free.
          ...(isCreatorMode && a.price.trim()
            ? { price: Math.max(0, Number(a.price.replace(/[^0-9.]/g, '')) || 0) }
            : {}),
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
        <Text style={styles.title} numberOfLines={1}>
          {isCreatorMode ? 'Message a Subscriber' : 'New Private Message'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {/* KeyboardAvoidingView keeps the input + send actions above the
          keyboard on iOS; Android's resize mode already lifts the window. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={T.PRIMARY_LIGHT} />
        </View>
      ) : !recipient ? (
        <View style={styles.center}>
          <Text style={styles.notice}>Choose a recipient first.</Text>
        </View>
      ) : !canMessage ? (
        <View style={styles.center}>
          <Text style={styles.notice}>{blockedReason ?? 'This creator is not accepting private messages.'}</Text>
        </View>
      ) : (
        <>
          {/* ── Delivery summary ─────────────────────────────────────────────
              Fan → creator: free by default, paid only when the creator
              explicitly enabled paid messaging with a per-message price.
              Creator → subscriber: always free; the creator monetizes via
              priced attachments instead. The card wears the platform gradient
              accent + gradient price so it reads as native MeetSweet. */}
          {isCreatorMode ? (
            <View style={styles.creatorNote}>
              <View style={styles.creatorNoteIcon}>
                <BrandGradientFill />
                <PaperPlaneTilt size={13} color="#FFFFFF" weight="bold" />
              </View>
              <Text style={styles.creatorNoteText}>
                Free delivery to your subscriber — they only pay if you price an attachment below.
              </Text>
            </View>
          ) : price !== null && price > 0 ? (
            <View style={styles.priceCard}>
              <LinearGradient
                colors={AppGradients.brand}
                locations={AppGradients.brandLocs}
                start={AppGradients.brandStart}
                end={AppGradients.brandEnd}
                style={styles.priceAccent}
              />
              <View style={{ flex: 1, gap: 10 }}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Delivery price</Text>
                  <GradientText text={`₦${price.toLocaleString()}`} style={styles.priceValue} />
                </View>
                <View style={[styles.priceRow, styles.balanceRow]}>
                  <Text style={styles.priceLabel}>Your balance</Text>
                  <Text style={[styles.balanceValue, insufficient && styles.balanceInsufficient]}>
                    ₦{balance.toLocaleString()}
                  </Text>
                </View>
                {insufficient ? (
                  <Pressable style={styles.topUpHint} onPress={() => router.push('/wallet' as any)}>
                    <View style={styles.topUpIcon}>
                      <BrandGradientFill />
                      <Lock size={13} color="#FFFFFF" weight="bold" />
                    </View>
                    <Text style={styles.topUpHintText}>Balance too low — top up your wallet to send</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.priceCard}>
              <LinearGradient
                colors={AppGradients.brand}
                locations={AppGradients.brandLocs}
                start={AppGradients.brandStart}
                end={AppGradients.brandEnd}
                style={styles.priceAccent}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Delivery</Text>
                  <View style={styles.freeChip}>
                    <BrandGradientFill />
                    <Text style={styles.freeChipText}>Free</Text>
                  </View>
                </View>
                <Text style={styles.freeHint}>
                  This creator accepts private messages for free. No wallet charge on send.
                </Text>
              </View>
            </View>
          )}

          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
            placeholder={isCreatorMode ? 'Write your message…' : 'Write your correspondence…'}
            selectionColor={T.CARET}
            placeholderTextColor={T.TEXT_3}
            style={styles.input}
            textAlignVertical="top"
          />

          {/* Attachment previews — chips for fans; rows with a per-attachment
              price input for creators (price is shown clearly before sending). */}
          {attachments.length > 0 ? (
            isCreatorMode ? (
              <View style={styles.rows}>
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
                              selectionColor={T.CARET}
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
              </View>
            ) : (
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
            )
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
      </KeyboardAvoidingView>

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

  // Delivery price card — platform gradient accent bar + gradient price text.
  priceCard: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginBottom: 14,
    padding: 16,
    paddingLeft: 19,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    gap: 14,
    overflow: 'hidden',
  },
  priceAccent: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  priceLabel: { color: T.TEXT_2, fontSize: 13, fontFamily: T.FONT.regular },
  priceValue: { fontSize: 17, fontFamily: T.FONT.bold },
  freeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: T.RADIUS.full,
    overflow: 'hidden',
  },
  freeChipText: { color: '#FFFFFF', fontSize: 12.5, fontFamily: T.FONT.bold, letterSpacing: 0.3 },
  freeHint: { color: T.TEXT_3, fontSize: 12, lineHeight: 18, fontFamily: T.FONT.regular, marginTop: 2 },
  balanceRow: { paddingTop: 10, borderTopWidth: 1, borderTopColor: T.BORDER },
  balanceValue: { color: T.TEXT_2, fontSize: 14, fontFamily: T.FONT.semibold },
  balanceInsufficient: { color: T.ERROR },
  topUpHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  topUpIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topUpHintText: { color: T.TEXT_2, fontSize: 12, fontFamily: T.FONT.medium, flex: 1 },

  // Creator-mode free-delivery note.
  creatorNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 14,
    padding: 13,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  creatorNoteIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorNoteText: { color: T.TEXT_2, fontSize: 12.5, lineHeight: 18, fontFamily: T.FONT.regular, flex: 1 },

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

  // Creator-mode attachment rows with per-attachment price input.
  rows: { gap: 10, paddingHorizontal: 18, paddingTop: 14 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
  },
  pendingThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: T.SURFACE_2 },
  pendingThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  pendingFallbackText: { color: T.TEXT_3, fontSize: 9, fontFamily: T.FONT.bold },
  pendingUploading: { color: T.TEXT_3, fontSize: 12, fontFamily: T.FONT.regular },
  priceRowLabel: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.sm,
    paddingHorizontal: 10,
    height: 34,
  },
  naira: { color: T.TEXT_2, fontSize: 13, fontFamily: T.FONT.medium },
  priceInput: { flex: 1, color: T.TEXT, fontSize: 14, fontFamily: T.FONT.medium, paddingVertical: 0 },

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
