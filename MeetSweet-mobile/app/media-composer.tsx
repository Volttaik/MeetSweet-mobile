/**
 * Media Composer — dedicated composition screen for private-message media.
 *
 * Flow:  pick media → THIS screen → preview → caption → free/paid + price
 *        (creators only) → Send → upload → create message → back to thread.
 *
 * Nothing is uploaded or sent until the user presses Send. The picked asset is
 * passed via params (uri/mimeType/fileName/mediaType) — on web expo-image-picker
 * returns a blob: URI, on native a file:// URI, both short enough for params.
 *
 * mode "reply" → replies to the message `targetId` (thread screen).
 * mode "new"   → new private message to `targetId` (recipient id, compose screen).
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Lock, PaperPlaneTilt, PlayCircle } from 'phosphor-react-native';
import { T, alpha } from '@/constants/theme';
import { goBack } from '@/lib/safe-back';
import { toast } from '@/components/MsToast';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientText } from '@/components/GradientText';
import { uploadMedia } from '@/services/media';
import {
  notifyThreadReplyConfirmed,
  replyToPrivateMessage,
  sendPrivateMessage,
} from '@/services/private-inbox';
import { registerLocalChatMedia } from '@/services/chat-media';
import { useAuth } from '@/contexts/AuthContext';

type ComposerMediaType = 'image' | 'video' | 'file';

export default function MediaComposer() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    mode?: string;
    targetId?: string;
    threadId?: string;
    canPrice?: string;
    uri?: string;
    mimeType?: string;
    fileName?: string;
    mediaType?: string;
  }>();

  const mode = params.mode === 'new' ? 'new' : 'reply';
  const targetId = params.targetId ?? '';
  // The thread root id (passed by the thread screen) — echoed back via
  // notifyThreadReplyConfirmed so the still-mounted thread appends the
  // confirmed media reply immediately, without waiting on the realtime event.
  const threadId = params.threadId ?? '';
  const canPrice = params.canPrice === '1';
  const mediaType = (params.mediaType as ComposerMediaType) || 'image';
  const uri = params.uri ?? '';
  const mimeType = params.mimeType ?? (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
  const fileName = params.fileName ?? (mediaType === 'video' ? 'video.mp4' : 'photo.jpg');

  const [caption, setCaption] = useState('');
  const [paid, setPaid] = useState(false);
  const [price, setPrice] = useState('');
  const [sending, setSending] = useState(false);

  const priceNumber =
    price.trim().length > 0 ? Math.max(0, Number(price.replace(/[^0-9.]/g, '')) || 0) : 0;
  const canSend = !sending && targetId.length > 0 && uri.length > 0 && (!paid || priceNumber > 0);

  /** Best-effort: point the sent attachment at the picked local file. */
  const registerSentMediaLocally = async (
    sentMessage: { id: string; attachments?: Array<{ id: string; media_url: string | null }> },
    mediaType: ComposerMediaType,
    localUri: string,
  ) => {
    const first = sentMessage.attachments?.[0];
    if (!first || !user?.id) return;
    await registerLocalChatMedia({
      attachmentId: first.id,
      userId: user.id,
      messageId: sentMessage.id,
      mediaType,
      localUri,
      remoteUrl: first.media_url ?? undefined,
    }).catch(() => {});
  };

  const send = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      // Upload happens ONLY now, on Send — never on selection.
      const uploaded = await uploadMedia(uri, mimeType, fileName);
      const attachments = [
        {
          media_id: uploaded.id,
          media_type: mediaType,
          ...(paid && priceNumber > 0 ? { price: priceNumber } : {}),
        },
      ];
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (mode === 'reply') {
        const result = await replyToPrivateMessage({
          id: targetId,
          body: caption.trim(),
          idempotencyKey,
          attachments,
        });
        // Hand the server-confirmed reply to the open thread BEFORE popping
        // back — the sender sees their own media immediately, no reload, no
        // dependence on the realtime event's live fan-out.
        if (threadId) {
          notifyThreadReplyConfirmed({ threadId, message: result.message });
        }
        // The sender already HAS this file on device — register it in the local
        // media cache so the thread renders it from the local file immediately
        // instead of downloading their own upload back from the server.
        void registerSentMediaLocally(result.message, mediaType, uri);
        toast.success('Media sent');
        goBack();
      } else {
        const result = await sendPrivateMessage({
          recipientId: targetId,
          body: caption.trim(),
          idempotencyKey,
          attachments,
        });
        void registerSentMediaLocally(result.message, mediaType, uri);
        toast.success('Private message sent');
        router.replace('/messages' as any);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the media');
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
        <GradientText text="Media message" style={styles.title} />
        <View style={styles.backBtn} />
      </View>

      {/* Media preview — prominent, no upload has happened yet */}
      <View style={styles.body}>
        <View style={styles.previewWrap}>
          {mediaType === 'image' ? (
            <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
          ) : (
            <View style={styles.videoPreview}>
              <PlayCircle size={44} color="#FFFFFF" weight="fill" />
              <Text style={styles.videoLabel}>Video ready to send</Text>
            </View>
          )}
        </View>

        {/* Caption — attached to the media, renders under the media card */}
        <View style={styles.captionWrap}>
          <Text style={styles.fieldLabel}>Caption (optional)</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={5000}
            placeholder="Add text to accompany this media…"
            placeholderTextColor={T.TEXT_3}
            selectionColor={T.CARET}
            style={styles.captionInput}
            textAlignVertical="top"
          />
        </View>

        {/* Free / paid — creators only */}
        {canPrice ? (
          <View style={styles.pricingCard}>
            <Text style={styles.fieldLabel}>Media access</Text>
            <View style={styles.segmented}>
              <Pressable
                style={[styles.segment, !paid && styles.segmentActive]}
                onPress={() => setPaid(false)}
                accessibilityRole="button"
                accessibilityLabel="Free media"
              >
                <Text style={[styles.segmentText, !paid && styles.segmentTextActive]}>Free</Text>
              </Pressable>
              <Pressable
                style={[styles.segment, paid && styles.segmentActive]}
                onPress={() => setPaid(true)}
                accessibilityRole="button"
                accessibilityLabel="Paid media"
              >
                <Lock size={13} color={paid ? '#FFFFFF' : T.TEXT_2} weight="bold" />
                <Text style={[styles.segmentText, paid && styles.segmentTextActive]}>Paid</Text>
              </Pressable>
            </View>

            {paid ? (
              <View style={styles.priceRow}>
                <Text style={styles.priceHint}>Recipients unlock this media by paying:</Text>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.naira}>₦</Text>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={T.TEXT_3}
                    selectionColor={T.CARET}
                    style={styles.priceInput}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Send — the ONLY thing that uploads */}
        <Pressable
          disabled={!canSend}
          onPress={send}
          style={[styles.sendBtn, !canSend && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Send media message"
        >
          <BrandGradientFill />
          {sending ? (
            <ActivityIndicator color={T.ACCENT_FG} />
          ) : (
            <>
              <PaperPlaneTilt size={17} color={T.ACCENT_FG} weight="fill" />
              <Text style={styles.sendBtnText}>Send</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.BORDER,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
  },
  body: { flex: 1, padding: 20, gap: 16 },
  previewWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: T.RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
  },
  previewImage: { width: '100%', height: '100%' },
  videoPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: alpha(T.PRIMARY, 0.25),
  },
  videoLabel: { color: T.TEXT_2, fontSize: 12.5, fontFamily: T.FONT.medium },
  captionWrap: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.TEXT_3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  captionInput: {
    minHeight: 84,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    padding: 14,
    color: T.TEXT,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    lineHeight: 21,
  },
  pricingCard: {
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    padding: 14,
    gap: 10,
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: T.RADIUS.md,
    borderWidth: 1,
    borderColor: T.BORDER,
    backgroundColor: T.SURFACE_2,
  },
  segmentActive: {
    backgroundColor: T.ACCENT,
    borderColor: T.ACCENT,
  },
  segmentText: { color: T.TEXT_2, fontSize: 13.5, fontFamily: T.FONT.semibold },
  segmentTextActive: { color: '#FFFFFF' },
  priceRow: { gap: 6 },
  priceHint: { color: T.TEXT_2, fontSize: 12.5, fontFamily: T.FONT.regular },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
    paddingHorizontal: 12,
  },
  naira: { color: T.TEXT_2, fontSize: 15, fontFamily: T.FONT.bold },
  priceInput: {
    flex: 1,
    color: T.TEXT,
    fontSize: 16,
    fontFamily: T.FONT.bold,
    paddingVertical: 12,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: T.RADIUS.full,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  sendBtnText: { color: T.ACCENT_FG, fontSize: 15, fontFamily: T.FONT.bold },
  disabled: { opacity: 0.5 },
});
