/**
 * MsChatBubble — main bubble router for the Chat component's renderBubble prop.
 *
 * Routes to the appropriate sub-component based on message type:
 *   text      → MsTextBubble (7px radius, dark-gray)
 *   image     → MsMediaCard  (5px radius)
 *   video     → MsMediaCard  (5px radius) with play overlay
 *   audio     → MsVoiceBubble (7px radius with waveform)
 *   document  → MsFileCard   (5px radius)
 *   paid      → wraps any of above with MsPaidOverlay
 *
 * Entrance animation: subtle fade + gentle slide-up per bubble.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Clock } from 'phosphor-react-native';
import type { BubbleProps } from '@kesha-antonov/react-native-chat';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';
import { MsTextBubble } from './MsTextBubble';
import { MsMediaCard } from './MsMediaCard';
import { MsVoiceBubble } from './MsVoiceBubble';
import { MsFileCard } from './MsFileCard';
import { MsPaidOverlay } from './MsPaidOverlay';
import { MsReactionStrip } from './MsReactionStrip';
import { MsReplyPreviewBubble } from './MsReplyPreviewBubble';

function formatTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface MsChatBubbleProps extends Omit<BubbleProps<MsMessage>, 'currentMessage'> {
  currentMessage: MsMessage;
  onUnlockPaid?: (message: MsMessage) => Promise<void>;
  onMediaPress?: (message: MsMessage) => void;
  onRetry?: (message: MsMessage) => void;
}

export function MsChatBubble({
  currentMessage,
  position,
  onLongPressMessage,
  onUnlockPaid,
  onMediaPress,
  onRetry,
}: MsChatBubbleProps) {
  const msg = currentMessage;
  const isOwn = position === 'right';
  const [unlocking, setUnlocking] = useState(false);

  // ── Entrance animation: soft fade + 5px slide-up ──────────────────────────
  const entryAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entryAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, []);

  const timeString = msg.createdAt
    ? formatTime(msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt))
    : '';

  const handleUnlock = useCallback(async () => {
    if (!onUnlockPaid || unlocking) return;
    setUnlocking(true);
    try {
      await onUnlockPaid(msg);
    } finally {
      setUnlocking(false);
    }
  }, [onUnlockPaid, msg, unlocking]);

  const handleMediaPress = useCallback(() => {
    onMediaPress?.(msg);
  }, [onMediaPress, msg]);

  const handleRetry = useCallback(() => {
    onRetry?.(msg);
  }, [onRetry, msg]);

  // ── Determine bubble type ──────────────────────────────────────────────────
  const mediaType = msg.msMediaType;
  const hasAudio = mediaType === 'audio' || !!msg.audio;
  const hasImage = mediaType === 'image' || (!!msg.image && mediaType !== 'video');
  const hasVideo = mediaType === 'video' || (!!msg.video && mediaType !== 'image');
  const hasDoc = mediaType === 'document';
  const isDeleted = msg.msIsDeleted ?? false;
  const isPaid = msg.msIsPaid ?? false;
  const isUnlocked = msg.msIsUnlocked ?? false;
  const shouldShowLock = isPaid && !isUnlocked;
  const isFailed = msg.sent === false && msg.pending === false;

  const replyMsg = msg.replyMessage;
  const reactions = msg.reactions ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────
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
  } else if (hasAudio) {
    bubble = (
      <View style={styles.mediaBubbleWrap}>
        <MsVoiceBubble
          uri={msg.audio ?? ''}
          duration={msg.msAudioDuration ?? 0}
          position={position ?? 'left'}
        />
        {shouldShowLock && (
          <MsPaidOverlay
            price={msg.msPaidPrice ?? 0}
            isUnlocking={unlocking}
            onUnlock={handleUnlock}
          />
        )}
      </View>
    );
  } else if (hasImage || hasVideo) {
    bubble = (
      <View style={styles.mediaBubbleWrap}>
        <MsMediaCard
          message={msg}
          position={position ?? 'left'}
          onPress={handleMediaPress}
          isLocked={shouldShowLock}
        />
        {shouldShowLock && (
          <MsPaidOverlay
            price={msg.msPaidPrice ?? 0}
            isUnlocking={unlocking}
            onUnlock={handleUnlock}
          />
        )}
      </View>
    );
  } else if (hasDoc) {
    bubble = (
      <View style={styles.mediaBubbleWrap}>
        <MsFileCard
          message={msg}
          position={position ?? 'left'}
          onPress={handleMediaPress}
        />
        {shouldShowLock && (
          <MsPaidOverlay
            price={msg.msPaidPrice ?? 0}
            isUnlocking={unlocking}
            onUnlock={handleUnlock}
          />
        )}
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

  return (
    <Animated.View
      style={[
        styles.row,
        isOwn ? styles.rowRight : styles.rowLeft,
        {
          opacity: entryAnim,
          transform: [
            {
              translateY: entryAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [5, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.column}>
        {/* Reply preview inline above bubble */}
        {replyMsg ? (
          <MsReplyPreviewBubble reply={replyMsg} position={position ?? 'left'} />
        ) : null}

        {/* Main bubble */}
        {bubble}

        {/* Reactions strip below bubble */}
        {reactions.length > 0 ? (
          <MsReactionStrip
            reactions={reactions}
            position={position ?? 'left'}
          />
        ) : null}

        {/* Time for media (text bubbles show time inside) */}
        {!isDeleted && (hasAudio || hasImage || hasVideo || hasDoc) ? (
          <View style={[styles.mediaMetaRow, isOwn ? styles.mediaMetaRight : styles.mediaMetaLeft]}>
            <Text style={styles.mediaTime}>
              {timeString}
              {msg.msIsEdited ? ' · edited' : ''}
            </Text>
            {msg.pending && isOwn && (
              <View style={styles.mediaStatusIcon}>
                <Clock size={10} color={T.TEXT_3} weight="regular" />
              </View>
            )}
            {isFailed && isOwn && (
              <Text style={styles.failedStatus}>Not delivered</Text>
            )}
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
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },

  column: { maxWidth: '85%' },

  mediaBubbleWrap: {
    position: 'relative',
  },

  mediaMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    paddingHorizontal: 4,
  },
  mediaMetaLeft: { justifyContent: 'flex-start' },
  mediaMetaRight: { justifyContent: 'flex-end' },

  mediaTime: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
  mediaStatusIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedStatus: {
    fontSize: 10,
    fontFamily: T.FONT.medium,
    color: '#EF4444',
  },
});
