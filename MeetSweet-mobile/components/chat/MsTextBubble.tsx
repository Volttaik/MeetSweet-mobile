/**
 * MsTextBubble — compact modern text message bubble.
 *
 * Design rules:
 * • 8px corner radius (3px on the "tail" corner)
 * • Dark-gray theme — NO pink backgrounds
 * • Bubble width wraps tightly around its content
 * • Timestamp + status always on ONE non-wrapping line
 * • Status icons via phosphor (Clock / Checks)
 *
 * Sizing note:
 * Max-width is owned by the parent MsChatBubble column.
 * This component does NOT set its own maxWidth so it never
 * fights the parent for percentage calculations.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Checks, Clock } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';

// ── Bubble colours (ash-shadow gray, never pink) ───────────────────────────────
const BG_OWN   = '#28282F'; // outgoing — slightly elevated dark gray
const BG_OTHER = '#1C1C23'; // incoming — deeper dark gray

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
  onPress?: () => void;
  onLongPress?: () => void;
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
  onPress,
  onLongPress,
}: Props) {
  const isOwn = position === 'right';
  const isDeleted = showDeleted || message.msIsDeleted;

  return (
    <View style={[styles.container, isOwn ? styles.containerRight : styles.containerLeft]}>
      <Pressable
        delayLongPress={350}
        onPress={onPress}
        onLongPress={onLongPress}
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
            <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
              {message.text}
            </Text>
            {message.msCaption ? (
              <Text style={[styles.caption, isOwn ? styles.captionOwn : styles.captionOther]}>
                {message.msCaption}
              </Text>
            ) : null}
          </>
        )}

        {/* ── Timestamp + status — always ONE horizontal line ──────────────── */}
        {timeString && !isDeleted ? (
          <View style={[styles.meta, isOwn ? styles.metaRight : styles.metaLeft]}>
            {showEdited ? (
              <Text
                numberOfLines={1}
                style={[styles.editedLabel, isOwn ? styles.editedOwn : styles.editedOther]}
              >
                edited ·{' '}
              </Text>
            ) : null}
            {/* numberOfLines + flexShrink prevent "1:25 P\nM" wrapping */}
            <Text
              numberOfLines={1}
              style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}
            >
              {timeString}
            </Text>
            {isOwn ? (
              <StatusIcon isPending={isPending} isFailed={isFailed} isRead={showReadReceipt} />
            ) : null}
          </View>
        ) : null}
      </Pressable>

      {/* Failed — retry affordance below bubble */}
      {isFailed && isOwn && onRetry ? (
        <TouchableOpacity style={styles.retryRow} onPress={onRetry} activeOpacity={0.7}>
          <Text style={styles.retryText}>Not delivered · Tap to retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Status icon ────────────────────────────────────────────────────────────────
function StatusIcon({
  isPending,
  isFailed,
  isRead,
}: {
  isPending?: boolean;
  isFailed?: boolean;
  isRead?: boolean;
}) {
  if (isFailed) return null; // retry row handles failed state
  if (isPending) {
    return (
      <View style={styles.statusIcon}>
        <Clock size={10} color="rgba(255,255,255,0.32)" weight="regular" />
      </View>
    );
  }
  if (isRead) {
    // Blue/accent tint double check = read by the recipient
    return (
      <View style={styles.statusIcon}>
        <Checks size={11} color={T.ACCENT} weight="bold" />
      </View>
    );
  }
  // Sent / delivered (server-confirmed, not yet read) — single muted check
  return (
    <View style={styles.statusIcon}>
      <Check size={11} color="rgba(255,255,255,0.40)" weight="bold" />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    // No maxWidth here — parent MsChatBubble column owns the constraint.
    // alignSelf collapses width to content.
    marginVertical: 1,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 5,
    // No minWidth — let content dictate size.
    // The meta row (time + icon) sets the floor naturally.
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
    opacity: 0.60,
  },

  text: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: T.FONT.regular,
    letterSpacing: 0.06,
  },
  textOwn:   { color: '#FFFFFF' },
  textOther: { color: T.TEXT },

  caption: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    marginTop: 3,
    opacity: 0.75,
  },
  captionOwn:   { color: 'rgba(255,255,255,0.8)' },
  captionOther: { color: T.TEXT_2 },

  deletedText: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
    color: T.TEXT_3,
  },

  meta: {
    flexDirection: 'row',
    flexWrap: 'nowrap',        // ← prevents timestamp line-break
    alignItems: 'center',
    marginTop: 2,
    gap: 3,
  },
  metaLeft:  { justifyContent: 'flex-start' },
  metaRight: { justifyContent: 'flex-end' },

  time: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    lineHeight: 13,
    flexShrink: 0,             // ← never compress the timestamp
  },
  timeOwn:   { color: 'rgba(255,255,255,0.38)' },
  timeOther: { color: T.TEXT_3 },

  editedLabel: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
    flexShrink: 0,
  },
  editedOwn:   { color: 'rgba(255,255,255,0.30)' },
  editedOther: { color: T.TEXT_3 },

  statusIcon: {
    flexShrink: 0,
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
