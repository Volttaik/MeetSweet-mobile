/**
 * MsTextBubble — compact modern text message bubble.
 * 6px corner radius, dark-gray theme, phosphor check icons for status.
 */
import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Checks, Clock } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';

// ── Bubble colours ─────────────────────────────────────────────────────────────
// Outgoing: elevated ash-shadow gray (not pink)
const BG_OWN   = '#28282F';
// Incoming: slightly darker surface
const BG_OTHER = '#1C1C23';

interface Props {
  message: MsMessage;
  position: 'left' | 'right';
  showEdited?: boolean;
  showDeleted?: boolean;
  timeString?: string;
  showReadReceipt?: boolean;
  isPending?: boolean;
  isFailed?: boolean;
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
            {isOwn && (
              <StatusIcon
                isPending={isPending}
                isFailed={isFailed}
                isRead={showReadReceipt}
              />
            )}
          </View>
        ) : null}
      </View>

      {/* Failed send — retry affordance */}
      {isFailed && isOwn && onRetry ? (
        <TouchableOpacity style={styles.retryRow} onPress={onRetry} activeOpacity={0.7}>
          <Text style={styles.retryText}>Not delivered · Tap to retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Status icon component ──────────────────────────────────────────────────────
function StatusIcon({
  isPending,
  isFailed,
  isRead,
}: {
  isPending?: boolean;
  isFailed?: boolean;
  isRead?: boolean;
}) {
  if (isFailed) return null; // handled by retry row
  if (isPending) {
    return (
      <View style={styles.statusIcon}>
        <Clock size={10} color="rgba(255,255,255,0.35)" weight="regular" />
      </View>
    );
  }
  if (isRead) {
    return (
      <View style={styles.statusIcon}>
        <Checks size={12} color={T.ACCENT} weight="bold" />
      </View>
    );
  }
  // Sent / delivered
  return (
    <View style={styles.statusIcon}>
      <Checks size={12} color="rgba(255,255,255,0.45)" weight="bold" />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginVertical: 1,
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
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    minWidth: 56,
  },
  bubbleLeft: {
    backgroundColor: BG_OTHER,
    borderBottomLeftRadius: 3,
  },
  bubbleRight: {
    backgroundColor: BG_OWN,
    borderBottomRightRadius: 3,
  },
  bubbleDeleted: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bubbleFailed: {
    opacity: 0.65,
  },

  text: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: T.FONT.regular,
    letterSpacing: 0.08,
  },
  textOwn: {
    color: '#FFFFFF',
  },
  textOther: {
    color: T.TEXT,
  },

  caption: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    marginTop: 3,
    opacity: 0.75,
  },
  captionOwn: { color: 'rgba(255,255,255,0.8)' },
  captionOther: { color: T.TEXT_2 },

  deletedText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
    color: T.TEXT_3,
  },

  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 3,
  },
  metaLeft: { justifyContent: 'flex-start' },
  metaRight: { justifyContent: 'flex-end' },

  time: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    lineHeight: 13,
  },
  timeOwn: { color: 'rgba(255,255,255,0.4)' },
  timeOther: { color: T.TEXT_3 },

  editedLabel: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
  },
  editedOwn: { color: 'rgba(255,255,255,0.35)' },
  editedOther: { color: T.TEXT_3 },

  statusIcon: {
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  retryRow: {
    marginTop: 3,
    alignSelf: 'flex-end',
    paddingHorizontal: 4,
  },
  retryText: {
    fontSize: 10,
    fontFamily: T.FONT.medium,
    color: '#EF4444',
  },
});
