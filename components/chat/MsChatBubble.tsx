/**
 * MsChatBubble — main bubble router for renderBubble in the Chat component.
 *
 * Routes by message type:
 *   text      → MsTextBubble  (or large-emoji/sticker render if single emoji)
 *   image/vid → MsMediaCard
 *   audio     → MsVoiceBubble
 *   document  → MsFileCard
 *   paid      → above + MsPaidOverlay
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
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Clock } from 'phosphor-react-native';
import type { BubbleProps } from '@kesha-antonov/react-native-chat';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';
import { MsTextBubble }         from './MsTextBubble';
import { MsMediaCard }          from './MsMediaCard';
import { MsVoiceBubble }        from './MsVoiceBubble';
import { MsFileCard }           from './MsFileCard';
import { MsPaidOverlay }        from './MsPaidOverlay';
import { MsReactionStrip }      from './MsReactionStrip';
import { MsReplyPreviewBubble } from './MsReplyPreviewBubble';

const SCREEN_W   = Dimensions.get('window').width;
// Fixed pixel max-width avoids percentage-of-percentage sizing bugs
const MAX_BUBBLE = SCREEN_W * 0.84;

// Detects if a string is composed entirely of emoji characters (1–4 of them).
const EMOJI_RE = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F){1,4}$/u;
function isStickerText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 16) return false;
  return EMOJI_RE.test(t);
}

function formatTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface MsChatBubbleProps extends Omit<BubbleProps<MsMessage>, 'currentMessage'> {
  currentMessage: MsMessage;
  onUnlockPaid?: (message: MsMessage) => Promise<void>;
  onMediaPress?:  (message: MsMessage) => void;
  onRetry?:       (message: MsMessage) => void;
}

export function MsChatBubble({
  currentMessage,
  position,
  onUnlockPaid,
  onMediaPress,
  onRetry,
}: MsChatBubbleProps) {
  const msg   = currentMessage;
  const isOwn = position === 'right';
  const [unlocking, setUnlocking] = useState(false);

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

  const handleUnlock = useCallback(async () => {
    if (!onUnlockPaid || unlocking) return;
    setUnlocking(true);
    try { await onUnlockPaid(msg); } finally { setUnlocking(false); }
  }, [onUnlockPaid, msg, unlocking]);

  const handleMediaPress = useCallback(() => onMediaPress?.(msg), [onMediaPress, msg]);
  const handleRetry      = useCallback(() => onRetry?.(msg),      [onRetry, msg]);

  // ── Type detection ─────────────────────────────────────────────────────────
  const mediaType = msg.msMediaType;
  const hasAudio  = mediaType === 'audio'    || !!msg.audio;
  const hasImage  = mediaType === 'image'    || (!!msg.image && mediaType !== 'video');
  const hasVideo  = mediaType === 'video'    || (!!msg.video && mediaType !== 'image');
  const hasDoc    = mediaType === 'document';
  const isDeleted = msg.msIsDeleted  ?? false;
  const isPaid    = msg.msIsPaid     ?? false;
  const isUnlocked= msg.msIsUnlocked ?? false;
  const showLock  = isPaid && !isUnlocked;
  const isFailed  = msg.sent === false && msg.pending === false;

  // Sticker: text-only, no media, matches emoji pattern
  const isSticker = !isDeleted && !hasAudio && !hasImage && !hasVideo && !hasDoc
    && isStickerText(msg.text ?? '');

  // Image sticker: sent from sticker panel as a floating image (no card background)
  const isStickerImage = !isDeleted && !!msg.msStickerImage && !!msg.image;

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
      />
    );
  } else if (isStickerImage) {
    // Floating image sticker — no card background, transparent, 120px
    bubble = (
      <View
        style={[styles.stickerWrap, isOwn ? styles.stickerRight : styles.stickerLeft]}
        accessibilityLabel="Image sticker"
      >
        <Image
          source={{ uri: msg.image }}
          style={styles.stickerImage}
          resizeMode="contain"
          accessibilityLabel="Sticker"
        />
        <Text style={[styles.stickerTime, isOwn ? styles.stickerTimeRight : styles.stickerTimeLeft]}>
          {timeString}
        </Text>
      </View>
    );
  } else if (isSticker) {
    // Large emoji sticker — no bubble background, floats in chat
    bubble = (
      <View
        style={[styles.stickerWrap, isOwn ? styles.stickerRight : styles.stickerLeft]}
        accessibilityLabel={`Sticker: ${msg.text?.trim()}`}
      >
        <Text style={styles.stickerEmoji}>{msg.text?.trim()}</Text>
        <Text style={[styles.stickerTime, isOwn ? styles.stickerTimeRight : styles.stickerTimeLeft]}>
          {timeString}
        </Text>
      </View>
    );
  } else if (hasAudio) {
    bubble = (
      <View style={styles.mediaWrap}>
        <MsVoiceBubble
          uri={msg.audio ?? ''}
          duration={msg.msAudioDuration ?? 0}
          position={position ?? 'left'}
        />
        {showLock && <MsPaidOverlay price={msg.msPaidPrice ?? 0} isUnlocking={unlocking} onUnlock={handleUnlock} />}
      </View>
    );
  } else if (hasImage || hasVideo) {
    bubble = (
      <View style={styles.mediaWrap}>
        <MsMediaCard message={msg} position={position ?? 'left'} onPress={handleMediaPress} isLocked={showLock} />
        {showLock && <MsPaidOverlay price={msg.msPaidPrice ?? 0} isUnlocking={unlocking} onUnlock={handleUnlock} />}
      </View>
    );
  } else if (hasDoc) {
    bubble = (
      <View style={styles.mediaWrap}>
        <MsFileCard message={msg} position={position ?? 'left'} onPress={handleMediaPress} />
        {showLock && <MsPaidOverlay price={msg.msPaidPrice ?? 0} isUnlocking={unlocking} onUnlock={handleUnlock} />}
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
      <View style={[styles.column, { maxWidth: isSticker ? undefined : MAX_BUBBLE }]}>

        {replyMsg ? (
          <MsReplyPreviewBubble reply={replyMsg} position={position ?? 'left'} />
        ) : null}

        {bubble}

        {reactions.length > 0 ? (
          <MsReactionStrip reactions={reactions} position={position ?? 'left'} />
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

  mediaWrap: { position: 'relative' },

  // Sticker: large emoji, no background
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
