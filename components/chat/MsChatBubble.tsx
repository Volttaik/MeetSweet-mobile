/**
 * MsChatBubble — main bubble router for the Chat component's renderBubble prop.
 *
 * Routes to the appropriate sub-component based on message type:
 *   text      → MsTextBubble (pill, ~50px radius)
 *   image     → MsMediaCard  (~5px radius)
 *   video     → MsMediaCard  (~5px radius) with play overlay
 *   audio     → MsVoiceBubble (pill with waveform)
 *   document  → MsFileCard   (~5px radius)
 *   paid      → wraps any of above with MsPaidOverlay
 *
 * Also renders reaction bar and reply preview inline.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😍', '😢', '😮', '👏'];

function formatTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface MsChatBubbleProps extends Omit<BubbleProps<MsMessage>, 'currentMessage'> {
  currentMessage: MsMessage;
  /** Called when user taps a paid unlock */
  onUnlockPaid?: (message: MsMessage) => Promise<void>;
  /** Called when user taps a media message */
  onMediaPress?: (message: MsMessage) => void;
}

export function MsChatBubble({
  currentMessage,
  position,
  onLongPressMessage,
  onUnlockPaid,
  onMediaPress,
}: MsChatBubbleProps) {
  const msg = currentMessage;
  const isOwn = position === 'right';
  const [unlocking, setUnlocking] = useState(false);

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

  // ── Reply preview (if this message is replying to another) ─────────────────
  const replyMsg = msg.replyMessage;

  // ── Reactions strip ────────────────────────────────────────────────────────
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
    // Default: text bubble
    bubble = (
      <MsTextBubble
        message={msg}
        position={position ?? 'left'}
        showEdited={msg.msIsEdited}
        timeString={timeString}
        showReadReceipt={isOwn && msg.received}
      />
    );
  }

  return (
    <View style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}>
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
          <Text style={[styles.mediaTime, isOwn ? styles.mediaTimeRight : styles.mediaTimeLeft]}>
            {timeString}
            {msg.msIsEdited ? ' · edited' : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: 3,
    paddingHorizontal: 8,
  },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },

  column: { maxWidth: '85%' },

  mediaBubbleWrap: {
    position: 'relative',
  },

  mediaTime: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  mediaTimeLeft: { textAlign: 'left' },
  mediaTimeRight: { textAlign: 'right' },
});
