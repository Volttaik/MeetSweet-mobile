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
import { Linking, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Checks, Clock } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { MsMessage } from '@/types/chat-message';

// ── URL detection ─────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[\w\-]+(\.[\w\-]+)+[\w\-.,@?^=%&:/~+#]*|www\.[\w\-]+(\.[\w\-]+)+[\w\-.,@?^=%&:/~+#]*/gi;

/**
 * Parse a string into segments of plain text and tappable links.
 * Returns an array of { text, isLink, url } objects.
 */
function parseLinks(text: string): Array<{ text: string; isLink: boolean; url?: string }> {
  if (!text) return [];
  const segments: Array<{ text: string; isLink: boolean; url?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isLink: false });
    }
    const raw = match[0];
    // Ensure the URL has a protocol for linking
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    segments.push({ text: raw, isLink: true, url });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isLink: false });
  }
  return segments;
}

// ── Bubble colours (ash-shadow gray, never pink) ───────────────────────────────
// Lifted a step off the #0C0C0F wallpaper so bubbles read as solid objects
// instead of blending into the background.
const BG_OWN   = '#2B2B33'; // outgoing — elevated solid gray
const BG_OTHER = '#23232B'; // incoming — solid deep gray

interface Props {
  message: MsMessage;
  position: 'left' | 'right';
  showEdited?: boolean;
  showDeleted?: boolean;
  timeString?: string;
  showReadReceipt?: boolean;
  /** Device-delivery receipt (recipient's device acked over the socket).
   *  Renders a dim double-check — distinct from read (accent double-check). */
  showDelivered?: boolean;
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
  showDelivered,
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
              {parseLinks(message.text ?? '').map((seg, i) =>
                seg.isLink ? (
                  <Text
                    key={i}
                    style={[styles.textLink, isOwn ? styles.textLinkOwn : styles.textLinkOther]}
                    onPress={() => {
                      if (seg.url) Linking.openURL(seg.url).catch(() => {});
                    }}
                  >
                    {seg.text}
                  </Text>
                ) : (
                  <Text key={i}>{seg.text}</Text>
                )
              )}
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
              <StatusIcon
                isPending={isPending}
                isFailed={isFailed}
                isRead={showReadReceipt}
                isDelivered={showDelivered}
              />
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
  isDelivered,
}: {
  isPending?: boolean;
  isFailed?: boolean;
  isRead?: boolean;
  isDelivered?: boolean;
}) {
  if (isFailed) return null; // retry row handles failed state
  if (isPending) {
    return (
      <View style={styles.statusIcon}>
        <Clock size={9} color="rgba(255,255,255,0.38)" weight="regular" />
      </View>
    );
  }
  if (isRead) {
    // Blue/accent tint double check = read by the recipient
    return (
      <View style={styles.statusIcon}>
        <Checks size={9} color={T.ACCENT} weight="bold" />
      </View>
    );
  }
  if (isDelivered) {
    // Device delivered (live socket receipt, not yet read) — dim double check
    return (
      <View style={styles.statusIcon}>
        <Checks size={9} color="rgba(255,255,255,0.45)" weight="bold" />
      </View>
    );
  }
  // Sent (server-confirmed, not yet delivered to the device) — single muted check
  return (
    <View style={styles.statusIcon}>
      <Check size={9} color="rgba(255,255,255,0.45)" weight="bold" />
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
    marginLeft: 10,
  },
  containerRight: {
    alignSelf: 'flex-end',
    marginRight: 10,
  },

  bubble: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 7,
    // Small floor so a bare short message never collapses into a sliver,
    // but the bubble otherwise wraps its content tightly.
    minHeight: 40,
    justifyContent: 'center',
    // Hairline border + soft depth: the bubble is a solid object sitting
    // above the wallpaper, not text floating on the background.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 5,
    elevation: 2,
    // No minWidth — let content dictate size.
    // The meta row (time + icon) sets the floor naturally.
  },
  bubbleLeft: {
    backgroundColor: BG_OTHER,
    // Incoming sits deeper so it gets a touch more edge light to stay
    // equally defined against the wallpaper.
    borderColor: 'rgba(255,255,255,0.10)',
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
    fontSize: 17,
    lineHeight: 25,
    fontFamily: T.FONT.medium,
    letterSpacing: 0.1,
  },
  textOwn:   { color: '#FFFFFF' },
  textOther: { color: T.TEXT },
  textLink: { textDecorationLine: 'underline' },
  textLinkOwn: { color: '#7CB8FF' },
  textLinkOther: { color: '#60A5FA' },

  caption: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: T.FONT.regular,
    marginTop: 6,
    opacity: 0.75,
  },
  captionOwn:   { color: 'rgba(255,255,255,0.8)' },
  captionOther: { color: T.TEXT_2 },

  deletedText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
    color: T.TEXT_3,
  },

  meta: {
    flexDirection: 'row',
    flexWrap: 'nowrap',        // ← prevents timestamp line-break
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  metaLeft:  { justifyContent: 'flex-start' },
  metaRight: { justifyContent: 'flex-end' },

  time: {
    fontSize: 9,
    fontFamily: T.FONT.regular,
    lineHeight: 12,
    flexShrink: 0,             // ← never compress the timestamp
  },
  timeOwn:   { color: 'rgba(255,255,255,0.42)' },
  timeOther: { color: 'rgba(255,255,255,0.34)' },

  editedLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: T.FONT.regular,
    fontStyle: 'italic',
    flexShrink: 0,
  },
  editedOwn:   { color: 'rgba(255,255,255,0.34)' },
  editedOther: { color: 'rgba(255,255,255,0.32)' },

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
