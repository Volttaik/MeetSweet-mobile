/**
 * MsChatBubble — main bubble router for renderBubble in the Chat component.
 *
 * Routes by message type:
 *   text      → MsTextBubble  (or large-emoji/sticker render if single emoji)
 *   image/vid → MsMediaCard
 *   audio     → MsVoiceBubble
 *   document  → MsFileCard
 *
 * Max-width lives here (fixed px, not %) so child percentage widths
 * resolve against the screen, not a chained percentage.
 *
 * Entrance animation: opacity + scale (0.97→1) + translateY — 200 ms.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, Checks, Clock } from 'phosphor-react-native';
import type { BubbleProps } from '@kesha-antonov/react-native-chat';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';
import { MsTextBubble }         from './MsTextBubble';
import { MsMediaCard }          from './MsMediaCard';
import { MsVoiceBubble }        from './MsVoiceBubble';
import { MsFileCard }           from './MsFileCard';
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
  onRetry?:          (message: MsMessage) => void;
  onLongPressMessage?: (context?: any, message?: any) => void;
  onReactionPress?:  (message: MsMessage, emoji: string) => void;
  /** Called when the user taps the quoted-reply preview above a bubble.
   *  Receives the quoted message's id so the screen can scroll to it. */
  onQuotePress?:     (messageId: string) => void;
  /** Briefly true after scroll-to-message/search-jump lands on this bubble,
   *  so it can flash a highlight background. */
  highlighted?:      boolean;
}

export function MsChatBubble({
  currentMessage,
  currentUserId,
  position,
  onMediaPress,
  onRetry,
  onLongPressMessage,
  onReactionPress,
  onQuotePress,
  highlighted,
}: MsChatBubbleProps) {
  const msg   = currentMessage;
  const isOwn = position === 'right';

  // ── Entrance: fade + scale 0.97→1 + 4px slide-up ─────────────────────────
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue:        1,
      duration:       200,
      easing:         Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  const timeString = msg.createdAt
    ? formatTime(msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt))
    : '';

  const handleMediaPress = useCallback(() => onMediaPress?.(msg), [onMediaPress, msg]);
  const handleRetry      = useCallback(() => onRetry?.(msg),      [onRetry, msg]);

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
    || (!!msg.image && mediaType !== 'video' && mediaType !== 'sticker');
  const hasVideo  = mediaType === 'video'    || (!!msg.video && mediaType !== 'image');
  const hasDoc    = mediaType === 'file' || (mediaType as string) === 'document';
  const isDeleted = msg.msIsDeleted  ?? false;
  const isFailed  = msg.sent === false && msg.pending === false;

  // Stickers are explicit message types. Plain Unicode emoji remains a normal
  // text message and must never be silently reclassified as a sticker.
  const isSticker = !isDeleted && !hasAudio && !hasImage && !hasVideo && !hasDoc
    && (msg.messageType === 'sticker' || msg.msMediaType === 'sticker');

  // Image sticker: sticker media messages (mediaType 'sticker') render as a
  // floating image (no card background) — same as the legacy msStickerImage path.
  const isStickerImage = !isDeleted && (mediaType === 'sticker' || !!msg.msStickerImage) && !!msg.image;

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
  } else if (isStickerImage) {
    // Floating image sticker — no card background, transparent, 120px
    bubble = (
      <Pressable
        delayLongPress={350}
        onLongPress={() => onLongPressMessage?.(null, msg)}
        style={[styles.stickerWrap, isOwn ? styles.stickerRight : styles.stickerLeft]}
        accessibilityLabel="Image sticker"
      >
        <Image
          source={{ uri: msg.localUri ?? msg.image }}
          style={styles.stickerImage}
          resizeMode="contain"
          accessibilityLabel="Sticker"
        />
        <Text style={[styles.stickerTime, isOwn ? styles.stickerTimeRight : styles.stickerTimeLeft]}>
          {timeString}
        </Text>
      </Pressable>
    );
  } else if (isSticker) {
    // Large emoji sticker — no bubble background, floats in chat
    bubble = (
      <Pressable
        delayLongPress={350}
        onLongPress={() => onLongPressMessage?.(null, msg)}
        style={[styles.stickerWrap, isOwn ? styles.stickerRight : styles.stickerLeft]}
        accessibilityLabel={`Sticker: ${msg.text?.trim()}`}
      >
        <Text style={styles.stickerEmoji}>{msg.text?.trim()}</Text>
        <Text style={[styles.stickerTime, isOwn ? styles.stickerTimeRight : styles.stickerTimeLeft]}>
          {timeString}
        </Text>
      </Pressable>
    );
  } else if (isVoice) {
    // Voice note — inline waveform bubble with local-first URI.
    bubble = (
      <View style={styles.mediaWrap}>
        <MsVoiceBubble
          uri={msg.localUri ?? msg.audio ?? ''}
          duration={msg.msAudioDuration ?? 0}
          position={position ?? 'left'}
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
        isPending={msg.pending}
        isFailed={isFailed}
        onRetry={isFailed && isOwn ? handleRetry : undefined}
        onLongPress={() => onLongPressMessage?.(null, msg)}
      />
    );
  }

  const isMedia = !isDeleted && !isSticker && !isStickerImage && (hasAudio || hasImage || hasVideo || hasDoc);

  return (
    <Animated.View
      style={[
        styles.row,
        isOwn ? styles.rowRight : styles.rowLeft,
        {
          opacity: anim,
          transform: [
            {
              scale: anim.interpolate({
                inputRange:  [0, 1],
                outputRange: [0.97, 1],
              }),
            },
            {
              translateY: anim.interpolate({
                inputRange:  [0, 1],
                outputRange: [4, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Fixed-pixel max-width prevents percentage-of-percentage bugs */}
      <View
        style={[
          styles.column,
          { maxWidth: isSticker ? undefined : MAX_BUBBLE },
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

        {reactions.length > 0 ? (
          <MsReactionStrip
            reactions={reactions}
            position={position ?? 'left'}
            currentUserId={currentUserId}
            onPress={(emoji) => onReactionPress?.(msg, emoji)}
          />
        ) : null}

        {/* Media meta row — text/sticker bubbles show time inside themselves */}
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
    </Animated.View>
  );
}

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

  // Explicit text sticker: large emoji, no background
  stickerWrap: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  stickerLeft:  { alignSelf: 'flex-start', marginLeft: 8 },
  stickerRight: { alignSelf: 'flex-end',   marginRight: 8 },
  stickerEmoji: {
    fontSize: 72,
    lineHeight: 88,
    includeFontPadding: false,
  },
  stickerImage: {
    width: 120,
    height: 120,
  },
  stickerTime: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 2,
  },
  stickerTimeLeft:  { textAlign: 'left' },
  stickerTimeRight: { textAlign: 'right' },

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
