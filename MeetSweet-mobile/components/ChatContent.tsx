/**
 * ChatContent — the private-thread message list (ChatScreen's content area).
 *
 * Part of the chat screen's persistent UI shell: the wallpaper, header and
 * composer render around it from the very first frame, and this component only
 * owns the scrolling conversation surface. While the thread payload loads it
 * shows a lightweight inline indicator (or cached rows when the thread was
 * already opened on this device); once data arrives the rows paint in place.
 *
 * Performance: every message row is a React.memo component keyed by message id.
 * Incoming WebSocket events append/update ONLY the affected rows — existing
 * rows keep their identity and are never destroyed or re-animated, so media
 * already on screen stays visually stable while a new message arrives.
 */
import React, { memo, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Check, Checks, Hourglass, Prohibit, UserCheck } from 'phosphor-react-native';
import { T, alpha, AppGradients } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { ChatAttachment } from '@/components/ChatAttachment';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import type { PrivateMessage } from '@/services/private-inbox';
import { useScrollMotion } from '@/lib/scroll-motion';

// ─── Time / day helpers ───────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

// ─── URL detection ────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[\w-]+(\.[\w-]+)+[\w-.,@?^=%&:/~+#]*|www\.[\w-]+(\.[\w-]+)+[\w-.,@?^=%&:/~+#]*/gi;

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
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    segments.push({ text: raw, isLink: true, url });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isLink: false });
  }
  return segments;
}

/**
 * Sent-message bubble fill — a very subtle diagonal wash of the MeetSweet
 * brand gradient (magenta → amber → violet at low opacity). Just enough to
 * mark the sender's side without shouting; received bubbles stay on the plain
 * app surface so the two sides read at a glance.
 */
const SENT_BUBBLE_GRADIENT = [
  'rgba(255,140,0,0.13)',
  'rgba(255,20,147,0.15)',
  'rgba(128,0,128,0.17)',
] as const;

/** Soft entrance for each message row — fade + 4px rise. */
function Entrance({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 200,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Centred day pill between message groups. */
function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateWrap}>
      <View style={styles.datePill}>
        <Text style={styles.dateText}>{label}</Text>
      </View>
    </View>
  );
}

/** Delivery status — single check (sent) / accent double-check (read). */
function StatusIcon({ msg, mine }: { msg: PrivateMessage; mine: boolean }) {
  if (!mine || msg.status === 'waiting') return null;
  const read = !!msg.read_at || msg.status === 'read' || msg.status === 'replied';
  return read ? (
    <Checks size={11} color={T.PRIMARY_LIGHT} weight="bold" />
  ) : (
    <Check size={11} color={T.TEXT_3} weight="bold" />
  );
}

// ─── One message row (memoized — stable identity across thread updates) ──────

interface MessageRowProps {
  msg: PrivateMessage;
  mine: boolean;
  index: number;
  userId?: string | null;
  onLongPress: (msg: PrivateMessage) => void;
  onUnlock: (attachmentId: string) => void;
  onOpenMedia: (uri: string, isVideo: boolean) => void;
}

const MessageRow = memo(function MessageRow({
  msg,
  mine,
  index,
  userId,
  onLongPress,
  onUnlock,
  onOpenMedia,
}: MessageRowProps) {
  const time = formatTime(msg.created_at);
  const text = (msg.body ?? '').trim();
  const hasMedia = msg.attachments.length > 0;

  const renderSegments = (value: string) =>
    parseLinks(value).map((seg, i) =>
      seg.isLink ? (
        <Text
          key={i}
          style={styles.bodyLink}
          onPress={() => {
            if (seg.url) Linking.openURL(seg.url).catch(() => {});
          }}
        >
          {seg.text}
        </Text>
      ) : (
        <Text key={i}>{seg.text}</Text>
      ),
    );

  return (
    <Entrance key={msg.id} delay={Math.min(index * 25, 200)}>
      <View style={[styles.msgWrap, mine ? styles.msgMine : styles.msgTheirs]}>
        {/* The bubble — long-press opens message actions. NO accessibilityRole
            here: on web that renders <button>, and the bubble legitimately
            contains interactive children (media tap, unlock), which must not
            nest inside another <button>. */}
        <Pressable
          onLongPress={() => onLongPress(msg)}
          delayLongPress={350}
          accessibilityLabel={`Message from ${mine ? 'you' : 'the other person'}. Long press for actions.`}
        >
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            {/* Sent bubbles carry a faint platform-gradient wash; received ones
                stay on the plain app surface. */}
            {mine ? (
              <LinearGradient
                colors={SENT_BUBBLE_GRADIENT}
                start={AppGradients.brandStart}
                end={AppGradients.brandEnd}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            ) : null}

            {/* Media first, caption below — one cohesive message card */}
            {hasMedia ? (
              <View style={styles.mediaStack}>
                {msg.attachments.map((a) => (
                  <ChatAttachment
                    key={`${msg.id}-${a.id}`}
                    attachment={a}
                    messageId={msg.id}
                    userId={userId}
                    onUnlock={() => onUnlock(a.id)}
                    onOpen={onOpenMedia}
                  />
                ))}
                {text ? <Text style={styles.caption}>{renderSegments(text)}</Text> : null}
              </View>
            ) : text ? (
              <Text style={styles.body}>{renderSegments(text)}</Text>
            ) : null}

            {/* Meta — timestamp + status always on ONE non-wrapping line */}
            <View style={[styles.meta, mine ? styles.metaRight : styles.metaLeft]}>
              {msg.status === 'waiting' ? (
                <View style={styles.waitingChip}>
                  <Hourglass size={10} color="#FFFFFF" weight="fill" />
                  <Text style={styles.waitingChipText}>Waiting approval</Text>
                </View>
              ) : null}
              <Text style={styles.time} numberOfLines={1}>
                {time}
              </Text>
              <StatusIcon msg={msg} mine={mine} />
            </View>
          </View>
        </Pressable>
      </View>
    </Entrance>
  );
});

// ─── Content component ────────────────────────────────────────────────────────

export interface ChatContentProps {
  message: PrivateMessage | null;
  loading: boolean;
  threadRows: PrivateMessage[];
  amRecipient: boolean;
  isWaiting: boolean;
  blockedOther: boolean;
  listBottomPadding: number;
  scrollRef: React.RefObject<ScrollView | null>;
  userId?: string | null;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: () => void;
  onMessageLongPress: (msg: PrivateMessage) => void;
  onUnlock: (attachmentId: string) => void;
  onOpenMedia: (uri: string, isVideo: boolean) => void;
  onApprove: () => void;
  onAllowSender: () => void;
  onBlockSender: () => void;
}

export function ChatContent({
  message,
  loading,
  threadRows,
  amRecipient,
  isWaiting,
  blockedOther,
  listBottomPadding,
  scrollRef,
  userId,
  onScroll,
  onContentSizeChange,
  onMessageLongPress,
  onUnlock,
  onOpenMedia,
  onApprove,
  onAllowSender,
  onBlockSender,
}: ChatContentProps) {
  const scrollMotion = useScrollMotion();

  // No payload yet (first open, nothing cached) — lightweight inline spinner
  // inside the already-rendered shell; never a blank screen.
  if (!message && loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={T.TEXT_2} />
        <Text style={styles.loadingText}>Loading conversation…</Text>
      </View>
    );
  }

  // Thread could not be loaded and nothing was cached — graceful notice (the
  // shell stays; the header/composer area renders its own empty state).
  if (!message) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Message not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat
      ref={scrollRef}
      {...scrollMotion}
      onScroll={(e) => {
        scrollMotion.onScroll(e);
        onScroll(e);
      }}
      onContentSizeChange={onContentSizeChange}
      contentContainerStyle={[styles.content, { paddingBottom: listBottomPadding }]}
    >
      {/* Waiting approval banner */}
      {isWaiting && amRecipient ? (
        <View style={styles.approveBanner}>
          <View style={styles.approveIcon}>
            <BrandGradientFill />
            <Hourglass size={16} color="#FFFFFF" weight="fill" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.approveTitle}>This message is waiting</Text>
            <Text style={styles.approveSub}>
              Approve it to move it to your inbox, or allow the sender so future messages arrive normally.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Blocked notice — replaces the composer so the thread never looks
          like it can still receive messages from a blocked sender. */}
      {blockedOther && amRecipient ? (
        <View style={styles.approveBanner}>
          <View style={[styles.approveIcon, styles.blockedIcon]}>
            <Prohibit size={16} color="#FFFFFF" weight="fill" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.approveTitle}>You blocked this sender</Text>
            <Text style={styles.approveSub}>
              They can't send you private messages. Unblock them from their profile to message again.
            </Text>
          </View>
        </View>
      ) : null}

      {/* The thread — original then replies, oldest first, day pills between groups */}
      {threadRows.map((msg, i) => {
        const showDay = i === 0 || dayKey(msg.created_at) !== dayKey(threadRows[i - 1].created_at);
        return (
          <React.Fragment key={msg.id}>
            {showDay ? <DateSeparator label={dayLabel(msg.created_at)} /> : null}
            <MessageRow
              msg={msg}
              mine={msg.sender_id === userId}
              index={i}
              userId={userId}
              onLongPress={onMessageLongPress}
              onUnlock={onUnlock}
              onOpenMedia={onOpenMedia}
            />
          </React.Fragment>
        );
      })}

      {/* Approval actions (waiting only) */}
      {isWaiting && amRecipient ? (
        <View style={styles.approveActions}>
          <Pressable style={styles.approveBtn} onPress={onApprove}>
            <BrandGradientFill />
            <Check size={15} color="#FFFFFF" weight="bold" />
            <Text style={styles.approveBtnText}>Approve</Text>
          </Pressable>
          <Pressable style={styles.allowBtn} onPress={onAllowSender}>
            <UserCheck size={15} color={T.PRIMARY_LIGHT} weight="bold" />
            <Text style={styles.allowBtnText}>Allow sender</Text>
          </Pressable>
          <Pressable style={styles.blockBtn} onPress={onBlockSender}>
            <Prohibit size={15} color={T.SECONDARY} weight="bold" />
            <Text style={styles.blockBtnText}>Block</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 14 },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 80,
  },
  loadingText: { color: T.TEXT_3, fontSize: 12.5, fontFamily: T.FONT.regular },

  // Two-sided chat: received left, sent right. No reply indentation.
  msgWrap: { maxWidth: '80%', marginBottom: 2 },
  msgMine: { alignSelf: 'flex-end' },
  msgTheirs: { alignSelf: 'flex-start' },

  // Chat bubble — compact, tail corner on the sending side, wraps tightly.
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: T.RADIUS.md,
    gap: 4,
    overflow: 'hidden',
    borderWidth: 1,
  },
  bubbleMine: {
    backgroundColor: alpha(T.PRIMARY, 0.16),
    borderColor: alpha(T.PRIMARY_LIGHT, 0.32),
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: T.SURFACE,
    borderColor: T.BORDER,
    borderBottomLeftRadius: 4,
  },
  body: { color: T.TEXT, fontSize: 15, lineHeight: 21, fontFamily: T.FONT.semibold },
  caption: { color: T.TEXT, fontSize: 15, lineHeight: 21, fontFamily: T.FONT.semibold },
  bodyLink: { color: T.PRIMARY_LIGHT, textDecorationLine: 'underline' },

  // Media-first card: media on top, caption below — one cohesive message.
  mediaStack: { gap: 6 },

  meta: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 4, marginTop: 2 },
  metaLeft: { justifyContent: 'flex-start' },
  metaRight: { justifyContent: 'flex-end' },
  time: { color: T.TEXT_3, fontSize: 10, fontFamily: T.FONT.regular, flexShrink: 0 },
  waitingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.SECONDARY,
    overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: T.RADIUS.full,
    flexShrink: 0,
  },
  waitingChipText: { color: '#FFFFFF', fontSize: 9, fontFamily: T.FONT.bold, letterSpacing: 0.3 },

  // Centred date pill between message groups.
  dateWrap: { alignItems: 'center', marginVertical: 12 },
  datePill: {
    backgroundColor: T.SURFACE_2,
    borderWidth: 1,
    borderColor: T.BORDER,
    paddingHorizontal: 13,
    paddingVertical: 4,
    borderRadius: T.RADIUS.full,
  },
  dateText: { fontSize: 10.5, fontFamily: T.FONT.medium, color: T.TEXT_3, letterSpacing: 0.2 },

  // Waiting approval banner + actions
  approveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER,
    marginBottom: 4,
    marginTop: 6,
  },
  approveIcon: {
    width: 38, height: 38, borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  blockedIcon: { backgroundColor: alpha(T.SECONDARY, 0.18) },
  approveTitle: { color: T.TEXT, fontSize: 13.5, fontFamily: T.FONT.semibold },
  approveSub: { color: T.TEXT_2, fontSize: 11.5, lineHeight: 17, fontFamily: T.FONT.regular },
  approveActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: T.RADIUS.full, overflow: 'hidden',
    backgroundColor: T.ACCENT,
  },
  approveBtnText: { color: '#FFFFFF', fontSize: 13, fontFamily: T.FONT.semibold },
  allowBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: T.RADIUS.full, backgroundColor: T.SURFACE,
    borderWidth: 1, borderColor: T.BORDER,
  },
  allowBtnText: { color: T.PRIMARY_LIGHT, fontSize: 12.5, fontFamily: T.FONT.semibold },
  blockBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, borderRadius: T.RADIUS.full, backgroundColor: alpha(T.SECONDARY, 0.1),
  },
  blockBtnText: { color: T.SECONDARY, fontSize: 12.5, fontFamily: T.FONT.semibold },
});
