/**
 * MsChatBubble — main bubble router for renderBubble in the Chat component.
 *
 * Routes by message type:
 *   text      → MsTextBubble
 *   image/vid → MsMediaCard
 *   audio     → MsVoiceBubble (voice note) / MsFileCard (audio file)
 *   document  → MsFileCard
 *
 * Max-width lives here (fixed px, not %) so child percentage widths
 * resolve against the screen, not a chained percentage.
 *
 * Entrance animation: opacity + scale (0.97→1) + translateY — 200 ms.
 */
import React, { useCallback, useEffect } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Check, Checks, Clock } from 'phosphor-react-native';
import type { BubbleProps } from '@kesha-antonov/react-native-chat';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';
import { MsTextBubble }         from './MsTextBubble';
import { MsMediaCard }          from './MsMediaCard';
import { MsVoiceBubble }        from './MsVoiceBubble';
import { MsFileCard }           from './MsFileCard';
import { MsLinkPreviewCard }    from './MsLinkPreviewCard';
import { MsReactionStrip }      from './MsReactionStrip';
import { MsReplyPreviewBubble } from './MsReplyPreviewBubble';

const SCREEN_W   = Dimensions.get('window').width;
// Fixed pixel max-width avoids percentage-of-percentage sizing bugs
const MAX_BUBBLE = SCREEN_W * 0.84;

function formatTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface MsChatBubbleProps extends Omit<BubbleProps<MsMessage>, 'currentMessage' | 'onLongPressMessage'> {
  currentMessage: MsMessage;
  currentUserId?:    string;
  onMediaPress?:     (message: MsMessage) => void;
  onMediaDownload?:  (message: MsMessage) => void;
  onLongPressMessage?: (context?: any, message?: any) => void;
  onReactionPress?:  (message: MsMessage, emoji: string) => void;
  /** Called when the user taps the quoted-reply preview above a bubble.
   *  Receives the quoted message's id so the screen can scroll to it. */
  onQuotePress?:     (messageId: string) => void;
  /** Briefly true after scroll-to-message/search-jump lands on this bubble,
   *  so it can flash a highlight background. */
  highlighted?:      boolean;
  /** 0–1 upload progress while this pending media message is uploading.
   *  Rendered as an overlay on the bubble until the server confirms. */
  uploadProgress?:   number;
}

function MsChatBubbleView({
  currentMessage,
  currentUserId,
  position,
  onMediaPress,
  onMediaDownload,
  onLongPressMessage,
  onReactionPress,
  onQuotePress,
  highlighted,
  uploadProgress,
}: MsChatBubbleProps) {
  const msg   = currentMessage;
  const isOwn = position === 'right';

  // ── Entrance: fade + scale 0.97→1 + 4px slide-up — Reanimated worklet on
  //     the UI thread (no JS-thread orchestration).
  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [entrance]);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { scale: 0.97 + entrance.value * 0.03 },
      { translateY: (1 - entrance.value) * 4 },
    ],
  }));

  const timeString = msg.createdAt
    ? formatTime(msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt))
    : '';

  const handleMediaPress = useCallback(() => onMediaPress?.(msg), [onMediaPress, msg]);

  // ── Type detection ─────────────────────────────────────────────────────────
  const mediaType = msg.msMediaType;
  // Audio splits into two rendering paths:
  //  • VOICE NOTE (isVoiceNote) → inline waveform bubble (MsVoiceBubble)
  //  • AUDIO FILE attachment (e.g. an uploaded MP3) → file card (MsFileCard)
  // Both share mediaType 'audio'; the Auth Tree's isVoiceNote flag decides.
  const isVoice   = mediaType === 'audio' && (msg.msIsVoiceNote ?? false);
  const hasAudio  = isVoice || mediaType === 'audio' || !!msg.audio;
  // gif messages are images (animated) — they route to MsMediaCard which
  // detects the gif container and renders it as a compact animated bubble.
  const hasImage  = mediaType === 'image' || mediaType === 'gif'
    || (!!msg.image && mediaType !== 'video');
  const hasVideo  = mediaType === 'video'    || (!!msg.video && mediaType !== 'image');
  const hasDoc    = mediaType === 'file' || (mediaType as string) === 'document';
  const isDeleted = msg.msIsDeleted  ?? false;
  const isFailed  = msg.sent === false && msg.pending === false;

  const replyMsg  = msg.replyMessage;
  const reactions = msg.reactions ?? [];

  // ── Build bubble node ──────────────────────────────────────────────────────
  let bubble: React.ReactNode;

  if (isDeleted) {
    bubble = (
      <MsTextBubble
        message={msg}
        position={position ?? 'left'}
        showDeleted
        timeString={timeString}
        onLongPress={() => onLongPressMessage?.(null, msg)}
      />
    );
  } else if (isVoice) {
    // Voice note — inline waveform bubble with local-first URI.
    bubble = (
      <View style={styles.mediaWrap}>
        <MsVoiceBubble
          uri={msg.localUri ?? msg.audio ?? msg.msMediaUrl ?? ''}
          duration={msg.msAudioDuration ?? 0}
          position={position ?? 'left'}
          onDownload={() => onMediaDownload?.(msg)}
          onLongPress={() => onLongPressMessage?.(null, msg)}
        />
      </View>
    );
  } else if (hasAudio) {
    // Audio FILE attachment (uploaded MP3, etc.) — NOT a voice note. Render as
    // a file attachment card so it gets file-attachment UI, distinct from the
    // inline voice waveform. Falls through to MsFileCard which handles any
    // document/file, including audio files.
    bubble = (
      <View style={styles.mediaWrap}>
        <MsFileCard
          message={msg}
          position={position ?? 'left'}
          onPress={handleMediaPress}
          onDownload={() => onMediaDownload?.(msg)}
          onLongPress={() => onLongPressMessage?.(null, msg)}
        />
      </View>
    );
  } else if (hasImage || hasVideo) {
    bubble = (
      <View style={styles.mediaWrap}>
        <MsMediaCard
          message={msg}
          position={position ?? 'left'}
          onPress={handleMediaPress}
          onDownload={() => onMediaDownload?.(msg)}
          onLongPress={() => onLongPressMessage?.(null, msg)}
        />
      </View>
    );
  } else if (hasDoc) {
    bubble = (
      <View style={styles.mediaWrap}>
        <MsFileCard
          message={msg}
          position={position ?? 'left'}
          onPress={handleMediaPress}
          onDownload={() => onMediaDownload?.(msg)}
          onLongPress={() => onLongPressMessage?.(null, msg)}
        />
      </View>
    );
  } else {
    bubble = (
      <MsTextBubble
        message={msg}
        position={position ?? 'left'}
        showEdited={msg.msIsEdited}
        timeString={timeString}
        showReadReceipt={isOwn && msg.received}
        showDelivered={isOwn && !msg.received && msg.delivered}
        isPending={msg.pending}
        isFailed={isFailed}
        onLongPress={() => onLongPressMessage?.(null, msg)}
      />
    );
  }

  const isMedia = !isDeleted && (hasAudio || hasImage || hasVideo || hasDoc);

  // Upload progress overlay — only on this bubble while its media is uploading.
  const uploadOverlay =
    msg.pending && uploadProgress !== undefined ? (
      <View style={styles.uploadOverlay} pointerEvents="none">
        <Text style={styles.uploadText}>
          Uploading {Math.max(0, Math.min(99, Math.round(uploadProgress * 100)))}%
        </Text>
      </View>
    ) : null;

  return (
    <Reanimated.View
      style={[
        styles.row,
        isOwn ? styles.rowRight : styles.rowLeft,
        entranceStyle,
      ]}
    >
      {/* Fixed-pixel max-width prevents percentage-of-percentage bugs */}
      <View
        style={[
          styles.column,
          { maxWidth: MAX_BUBBLE },
          highlighted ? styles.highlighted : null,
        ]}
      >

        {replyMsg ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jump to replied message"
            onPress={() => {
              const replyId = replyMsg._id;
              if (replyId !== undefined && replyId !== null) {
                onQuotePress?.(String(replyId));
              }
            }}
            hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
          >
            <MsReplyPreviewBubble reply={replyMsg as any} position={position ?? 'left'} />
          </Pressable>
        ) : null}

        <Pressable
          delayLongPress={350}
          onLongPress={() => onLongPressMessage?.(null, msg)}
        >
          {bubble}
        </Pressable>

        {isMedia ? uploadOverlay : null}

        {/* Rich link preview — server-resolved metadata shipped with the
            message; renders from the payload (no re-fetch on chat open). */}
        {!isDeleted && msg.linkPreview ? (
          <MsLinkPreviewCard
            preview={msg.linkPreview}
            position={position ?? 'left'}
          />
        ) : null}

        {reactions.length > 0 ? (
          <MsReactionStrip
            reactions={reactions}
            position={position ?? 'left'}
            currentUserId={currentUserId}
            onPress={(emoji) => onReactionPress?.(msg, emoji)}
          />
        ) : null}

        {/* Media meta row — text bubbles show time inside themselves */}
        {isMedia ? (
          <View style={[styles.mediaMeta, isOwn ? styles.mediaMetaRight : styles.mediaMetaLeft]}>
            <Text numberOfLines={1} style={styles.mediaTime}>
              {timeString}{msg.msIsEdited ? ' · edited' : ''}
            </Text>
            {msg.pending && isOwn ? (
              <View style={styles.mediaStatusIcon}>
                <Clock size={10} color={T.TEXT_3} weight="regular" />
              </View>
            ) : null}
            {!msg.pending && !isFailed && isOwn && msg.sent ? (
              <View style={styles.mediaStatusIcon}>
                {msg.received ? (
                  <Checks size={11} color={T.ACCENT} weight="bold" />
                ) : msg.delivered ? (
                  <Checks size={11} color="rgba(255,255,255,0.45)" weight="bold" />
                ) : (
                  <Check size={11} color="rgba(255,255,255,0.40)" weight="bold" />
                )}
              </View>
            ) : null}
            {isFailed && isOwn ? (
              <Text style={styles.failedText}>Not delivered</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Reanimated.View>
  );
}

export const MsChatBubble = React.memo(MsChatBubbleView, (prev, next) => {
  const a = prev.currentMessage;
  const b = next.currentMessage;
  return a._id === b._id
    && a.text === b.text
    && a.msIsEdited === b.msIsEdited
    && a.msIsDeleted === b.msIsDeleted
    && a.pending === b.pending
    && a.sent === b.sent
    && a.delivered === b.delivered
    && a.received === b.received
    && a.localUri === b.localUri
    && a.msMediaStatus === b.msMediaStatus
    && a.reactions === b.reactions
    && prev.position === next.position
    && prev.highlighted === next.highlighted
    && prev.uploadProgress === next.uploadProgress;
});

const styles = StyleSheet.create({
  row: {
    marginVertical: 2,
    paddingHorizontal: 6,
  },
  rowLeft:  { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },

  // column: maxWidth applied inline (dynamic, based on screen width)
  column: {},

  // Brief flash when scroll-to-message/search-jump lands on this bubble.
  highlighted: {
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderRadius: 12,
  },

  mediaWrap: { position: 'relative' },

  uploadOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    alignItems: 'center',
  },
  uploadText: {
    backgroundColor: 'rgba(0,0,0,0.62)',
    color: '#fff',
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },

  mediaMeta: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  mediaMetaLeft:  { justifyContent: 'flex-start' },
  mediaMetaRight: { justifyContent: 'flex-end' },

  mediaTime: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    flexShrink: 0,
  },
  mediaStatusIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  failedText: {
    fontSize: 10,
    fontFamily: T.FONT.medium,
    color: '#EF4444',
    flexShrink: 0,
  },
});
