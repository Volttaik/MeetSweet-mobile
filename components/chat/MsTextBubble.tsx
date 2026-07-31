/**
 * MsTextBubble — premium pill-shaped text message bubble.
 * ~50px border radius, floating capsule appearance.
 * Used for text-only messages in both Chat and Comments.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';

interface Props {
  message: MsMessage;
  position: 'left' | 'right';
  /** Show "Edited" label */
  showEdited?: boolean;
  /** Show "Deleted" state */
  showDeleted?: boolean;
  /** Optional time string */
  timeString?: string;
  /** Show read receipt */
  showReadReceipt?: boolean;
  /** Message is in-flight (optimistic) */
  isPending?: boolean;
  /** Message send failed */
  isFailed?: boolean;
  /** Called when user taps Retry on a failed send */
  onRetry?: () => void;
}

export function MsTextBubble({
  message,
  position,
  showEdited,
  showDeleted,
  timeString,
  showReadReceipt,
  isPending,
  isFailed,
  onRetry,
}: Props) {
  const isOwn = position === 'right';
  const isDeleted = showDeleted || message.msIsDeleted;

  return (
    <View style={[styles.container, isOwn ? styles.containerRight : styles.containerLeft]}>
      <View
        style={[
          styles.bubble,
          isOwn ? styles.bubbleRight : styles.bubbleLeft,
          isDeleted && styles.bubbleDeleted,
          isFailed && styles.bubbleFailed,
        ]}
      >
        {isDeleted ? (
          <Text style={styles.deletedText}>This message was deleted</Text>
        ) : (
          <>
            <Text
              style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}
              selectable
            >
              {message.text}
            </Text>
            {message.msCaption ? (
              <Text style={[styles.caption, isOwn ? styles.captionOwn : styles.captionOther]}>
                {message.msCaption}
              </Text>
            ) : null}
          </>
        )}

        {/* Time + status row inside bubble */}
        {timeString && !isDeleted ? (
          <View style={[styles.meta, isOwn ? styles.metaRight : styles.metaLeft]}>
            {showEdited && (
              <Text style={[styles.editedLabel, isOwn ? styles.editedOwn : styles.editedOther]}>
                edited ·{' '}
              </Text>
            )}
            <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}>
              {timeString}
            </Text>
            {isOwn && isPending && !isFailed && (
              <Text style={styles.statusPending}>⏳</Text>
            )}
            {isOwn && !isPending && !isFailed && showReadReceipt && (
              <Text style={styles.receipt}>✓✓</Text>
            )}
            {isOwn && !isPending && !isFailed && !showReadReceipt && (
              <Text style={styles.sent}>✓</Text>
            )}
          </View>
        ) : null}
      </View>

      {/* Failed send — retry affordance */}
      {isFailed && isOwn && onRetry ? (
        <TouchableOpacity style={styles.retryRow} onPress={onRetry} activeOpacity={0.7}>
          <Text style={styles.retryText}>⚠ Not delivered · Tap to retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
    maxWidth: '80%',
  },
  containerLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  containerRight: {
    alignSelf: 'flex-end',
    marginRight: 8,
  },

  bubble: {
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 60,
  },
  bubbleLeft: {
    backgroundColor: T.SURFACE_2,
    borderBottomLeftRadius: 8,
  },
  bubbleRight: {
    backgroundColor: T.ACCENT,
    borderBottomRightRadius: 8,
  },
  bubbleDeleted: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bubbleFailed: {
    opacity: 0.7,
  },

  text: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: T.FONT.regular,
    letterSpacing: 0.1,
  },
  textOwn: {
    color: '#fff',
  },
  textOther: {
    color: T.TEXT,
  },

  caption: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    marginTop: 4,
    opacity: 0.8,
  },
  captionOwn: { color: 'rgba(255,255,255,0.85)' },
  captionOther: { color: T.TEXT_2 },

  deletedText: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
    color: T.TEXT_3,
  },

  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  metaLeft: { justifyContent: 'flex-start' },
  metaRight: { justifyContent: 'flex-end' },

  time: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
  },
  timeOwn: { color: 'rgba(255,255,255,0.65)' },
  timeOther: { color: T.TEXT_3 },

  editedLabel: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
  },
  editedOwn: { color: 'rgba(255,255,255,0.55)' },
  editedOther: { color: T.TEXT_3 },

  receipt: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 2,
  },
  sent: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginLeft: 2,
  },
  statusPending: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 2,
  },

  retryRow: {
    marginTop: 4,
    alignSelf: 'flex-end',
    paddingHorizontal: 4,
  },
  retryText: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: '#EF4444',
  },
});
