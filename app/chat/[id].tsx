/**
 * MeetSweet Chat Screen — production-ready rebuild.
 *
 * Features:
 * - Text, image, video, audio, voice note, document messages
 * - Attachment preview composer before sending (MsAttachmentPreview)
 * - Voice note: record → preview → cancel/re-record/send
 * - Paid media with lock overlay and unlock flow
 * - Message editing + deletion (for everyone)
 * - Profile bottom sheet on header tap
 * - 50px pill bubble radius, comfortable spacing
 * - Optimistic sends, offline cache, upload progress
 * - Reactions, reply, long-press menu
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import {
  ArrowLeft,
  Camera,
  DotsThree,
  Paperclip,
  PaperPlaneRight,
  Smiley,
  Microphone,
  LockSimple,
  ArrowBendUpLeft,
  Copy as CopyIcon,
  Trash,
  ArrowUUpRight,
  Info,
  X,
  Play,
  Pause,
  File,
  PencilSimple,
  CheckCircle,
} from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoClipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { router, useLocalSearchParams } from 'expo-router';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmojiPicker } from '@/components/MsEmojiPicker';
import { MsAttachmentSheet } from '@/components/MsAttachmentSheet';
import type { AttachmentResult } from '@/components/MsAttachmentSheet';
import { MsAttachmentPreview } from '@/components/MsAttachmentPreview';
import type { PendingAttachment, ConfirmedAttachment } from '@/components/MsAttachmentPreview';
import { MsUserProfileSheet } from '@/components/MsUserProfileSheet';
import type { ProfileSheetUser } from '@/components/MsUserProfileSheet';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMessages,
  sendMessage,
  deleteMessage,
  editMessage,
  getConversations,
  type ChatMessage,
} from '@/services/messages';
import { getUser, followUser, unfollowUser } from '@/services/users';
import { uploadMedia } from '@/services/media';
import {
  getCachedMessages,
  cacheMessages,
  deleteCachedMessage,
  removeCachedMessage,
  getCachedConversations,
  cacheConversations,
} from '@/services/chat-cache';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const ICON_ANIM_DURATION = 200;

// Pre-computed waveform bar heights
const VOICE_BARS = Array.from({ length: 22 }, (_, i) =>
  4 + Math.abs(Math.sin(i * 1.7 + 0.5) * Math.cos(i * 0.9)) * 14,
);

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Reaction = { emoji: string; count: number; byMe: boolean };
type MessageReactions = Record<string, Reaction>;
type ReplyTarget = { id: string; body: string | null; senderName: string } | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function needsDateSep(curr: ChatMessage, prev?: ChatMessage): boolean {
  if (!prev) return true;
  return new Date(curr.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Voice note bubble ────────────────────────────────────────────────────────

function VoiceNoteBubble({
  uri,
  duration,
  isOwn,
}: {
  uri: string;
  duration: number;
  isOwn: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPosition(Math.floor((status.positionMillis ?? 0) / 1000));
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
              soundRef.current?.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          },
        );
        soundRef.current = sound;
      } else {
        await soundRef.current.playAsync();
      }
      setIsPlaying(true);
    } catch {
      Alert.alert('Playback error', 'Could not play the voice message.');
    }
  };

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <View style={[vn.wrap, isOwn ? vn.wrapOwn : vn.wrapOther]}>
      <TouchableOpacity style={vn.playBtn} onPress={togglePlayback} activeOpacity={0.8}>
        {isPlaying
          ? <Pause size={14} color="#fff" weight="fill" />
          : <Play size={14} color="#fff" weight="fill" />
        }
      </TouchableOpacity>
      <View style={vn.waveRow}>
        {VOICE_BARS.map((h, i) => {
          const filled = i / VOICE_BARS.length <= progress;
          return (
            <View
              key={i}
              style={[
                vn.bar,
                { height: h },
                filled
                  ? { backgroundColor: isOwn ? 'rgba(255,255,255,0.9)' : T.ACCENT }
                  : { backgroundColor: isOwn ? 'rgba(255,255,255,0.28)' : T.BORDER_2 },
              ]}
            />
          );
        })}
      </View>
      <Text style={[vn.dur, isOwn ? vn.durOwn : vn.durOther]}>
        {formatDuration(isPlaying ? position : duration)}
      </Text>
    </View>
  );
}

const vn = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 50,
    minWidth: 200,
    maxWidth: 260,
  },
  wrapOwn: { backgroundColor: T.ACCENT, borderBottomRightRadius: 6 },
  wrapOther: { backgroundColor: T.SURFACE, borderBottomLeftRadius: 6 },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  waveRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  dur: { fontSize: 11, fontFamily: T.FONT.regular, flexShrink: 0 },
  durOwn: { color: 'rgba(255,255,255,0.7)' },
  durOther: { color: T.TEXT_3 },
});

// ─── Document bubble ──────────────────────────────────────────────────────────

function DocumentBubble({
  message,
  isOwn,
}: {
  message: ChatMessage;
  isOwn: boolean;
}) {
  const ext = message.fileName?.split('.').pop()?.toUpperCase() ?? 'FILE';
  return (
    <View style={[doc.wrap, isOwn ? doc.wrapOwn : doc.wrapOther]}>
      <View style={doc.iconBox}>
        <File size={20} color={isOwn ? '#fff' : T.ACCENT} weight="duotone" />
      </View>
      <View style={doc.info}>
        <Text style={[doc.name, isOwn ? doc.textOwn : doc.textOther]} numberOfLines={2}>
          {message.fileName ?? 'Document'}
        </Text>
        <Text style={[doc.meta, isOwn ? doc.metaOwn : doc.metaOther]}>
          {ext}
          {message.fileSize ? `  ·  ${formatFileSize(message.fileSize)}` : ''}
        </Text>
      </View>
    </View>
  );
}

const doc = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 50,
    minWidth: 180,
    maxWidth: 260,
  },
  wrapOwn: { backgroundColor: T.ACCENT, borderBottomRightRadius: 6 },
  wrapOther: { backgroundColor: T.SURFACE, borderBottomLeftRadius: 6 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: { flex: 1 },
  name: { fontSize: 13, fontFamily: T.FONT.semibold, lineHeight: 18 },
  meta: { fontSize: 11, fontFamily: T.FONT.regular, marginTop: 2 },
  textOwn: { color: '#fff' },
  textOther: { color: T.TEXT },
  metaOwn: { color: 'rgba(255,255,255,0.65)' },
  metaOther: { color: T.TEXT_3 },
});

// ─── Reaction row ─────────────────────────────────────────────────────────────

function ReactionRow({
  reactions,
  isOwn,
  onReact,
}: {
  reactions: MessageReactions;
  isOwn: boolean;
  onReact: (emoji: string) => void;
}) {
  const entries = Object.entries(reactions).filter(([, r]) => r.count > 0);
  if (entries.length === 0) return null;
  return (
    <View style={[rs.row, isOwn ? rs.own : rs.other]}>
      {entries.map(([emoji, r]) => (
        <TouchableOpacity
          key={emoji}
          style={[rs.pill, r.byMe && rs.pillActive]}
          onPress={() => onReact(emoji)}
          activeOpacity={0.75}
        >
          <Text style={rs.emoji}>{emoji}</Text>
          {r.count > 1 && <Text style={rs.count}>{r.count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const rs = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, marginHorizontal: 16 },
  own: { justifyContent: 'flex-end' },
  other: { justifyContent: 'flex-start' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 12, backgroundColor: T.SURFACE,
    borderWidth: 1, borderColor: T.BORDER,
  },
  pillActive: { borderColor: T.ACCENT, backgroundColor: T.ACCENT_LIGHT },
  emoji: { fontSize: 13, lineHeight: 17 },
  count: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2 },
});

// ─── Date separator ───────────────────────────────────────────────────────────

function DateSep({ label }: { label: string }) {
  return (
    <View style={ds.wrap}>
      <View style={ds.line} />
      <View style={ds.badge}>
        <Text style={ds.text}>{label}</Text>
      </View>
      <View style={ds.line} />
    </View>
  );
}

const ds = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 16, gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: T.BORDER },
  badge: { backgroundColor: T.SURFACE_2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  text: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_3, letterSpacing: 0.3 },
});

// ─── Sending skeleton ─────────────────────────────────────────────────────────

function UploadingBubble() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  return (
    <View style={[bs.wrap, bs.wrapOwn]}>
      <Animated.View style={[bs.uploadSkeleton, { opacity: pulse }]}>
        <View style={bs.uploadSkeletonInner} />
      </Animated.View>
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: ChatMessage;
  reactions: MessageReactions;
  replyTo?: { body: string | null; senderName: string } | null;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onUnlockPaid?: () => void;
  showTimestamp?: boolean;
  onTap?: () => void;
  onImagePress?: (uri: string) => void;
  onVideoPress?: (uri: string) => void;
}

function MessageBubble({
  message,
  reactions,
  replyTo,
  onLongPress,
  onReact,
  onUnlockPaid,
  showTimestamp,
  onTap,
  onImagePress,
  onVideoPress,
}: BubbleProps) {
  const isOwn = message.isOwn;
  const isPaidLocked = !!(message.isPaid) && !(message.isUnlocked) && !isOwn;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 200 }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onTap}
        onLongPress={onLongPress}
        delayLongPress={280}
        style={[bs.wrap, isOwn ? bs.wrapOwn : bs.wrapOther]}
      >
        <View style={{ maxWidth: '78%' }}>
          {/* Reply quote */}
          {replyTo && (
            <View style={[bs.replyQuote, isOwn ? bs.replyQuoteOwn : bs.replyQuoteOther]}>
              <View style={bs.replyAccent} />
              <View style={{ flex: 1 }}>
                <Text style={bs.replyName} numberOfLines={1}>{replyTo.senderName}</Text>
                <Text style={bs.replyBody} numberOfLines={1}>
                  {replyTo.body ?? '📎 Media'}
                </Text>
              </View>
            </View>
          )}

          {message.isDeleted ? (
            <View style={[bs.bubble, bs.bubbleDeleted]}>
              <Text style={bs.deletedText}>🚫 Message deleted</Text>
            </View>
          ) : isPaidLocked ? (
            /* ── Locked paid content (receiver) ── */
            <TouchableOpacity style={bs.bubblePaid} onPress={onUnlockPaid} activeOpacity={0.8}>
              <View><LockSimple size={20} color={T.ACCENT} /></View>
              <Text style={bs.paidLabel}>Paid content</Text>
              <Text style={bs.paidSub}>
                {message.paidPrice ? `${message.paidPrice} credits to unlock` : 'Tap to unlock with credits'}
              </Text>
            </TouchableOpacity>
          ) : message.mediaType === 'audio' && message.mediaUrl ? (
            /* ── Voice note ── */
            <VoiceNoteBubble
              uri={message.mediaUrl}
              duration={message.audioDuration ?? 0}
              isOwn={isOwn}
            />
          ) : message.mediaType === 'document' ? (
            /* ── Document ── */
            <DocumentBubble message={message} isOwn={isOwn} />
          ) : (
            <>
              {/* ── Image ── */}
              {message.mediaUrl && message.mediaType === 'image' && (
                <View style={[bs.mediaCap, isOwn ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                  {(message.isPaid && isOwn) && (
                    <View style={bs.paidBadge}>
                      <LockSimple size={11} color="#fff" />
                      <Text style={bs.paidBadgeText}>
                        {message.paidPrice ? `${message.paidPrice} cr` : 'Paid'}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => onImagePress?.(message.mediaUrl!)}
                    accessibilityRole="button"
                    accessibilityLabel="Open image fullscreen"
                  >
                    <MsMediaLoader
                      uri={message.mediaUrl}
                      style={[
                        bs.bubbleImage,
                        isOwn ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 },
                      ]}
                      resizeMode="cover"
                      accessibleLabel="Message image"
                    />
                  </TouchableOpacity>
                </View>
              )}
              {/* ── Video ── */}
              {message.mediaUrl && message.mediaType === 'video' && (
                <View style={[bs.mediaCap, isOwn ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                  {(message.isPaid && isOwn) && (
                    <View style={bs.paidBadge}>
                      <LockSimple size={11} color="#fff" />
                      <Text style={bs.paidBadgeText}>
                        {message.paidPrice ? `${message.paidPrice} cr` : 'Paid'}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => onVideoPress?.(message.mediaUrl!)}
                    accessibilityRole="button"
                    accessibilityLabel="Open video fullscreen"
                  >
                    <View
                      style={[
                        bs.bubbleImage,
                        bs.videoBubble,
                        isOwn ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 },
                      ]}
                    >
                      <Video
                        source={{ uri: message.mediaUrl }}
                        style={StyleSheet.absoluteFill}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={false}
                        useNativeControls={false}
                        pointerEvents="none"
                      />
                      <View style={bs.videoPlayOverlay}>
                        <View style={bs.videoPlayButton}>
                          <Play size={22} color="#fff" weight="fill" />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
              {/* ── Caption or body ── */}
              {(message.body || message.caption) ? (
                <View style={[bs.bubble, isOwn ? bs.bubbleOwn : bs.bubbleOther]}>
                  <Text style={[bs.text, isOwn ? bs.textOwn : bs.textOther]}>
                    {message.body ?? message.caption}
                  </Text>
                  <View style={bs.timeRow}>
                    {message.isEdited && (
                      <Text style={[bs.editedLabel, isOwn ? bs.timeOwn : bs.timeOther]}>edited · </Text>
                    )}
                    <Text style={[bs.timeInline, isOwn ? bs.timeOwn : bs.timeOther]}>
                      {formatTime(message.createdAt)}
                      {isOwn ? '  ✓✓' : ''}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          )}

          {/* Timestamp below standalone media */}
          {message.mediaUrl && !message.body && !message.caption &&
           message.mediaType !== 'audio' && message.mediaType !== 'document' && (
            <View style={bs.timeBelowRow}>
              {message.isEdited && (
                <Text style={[bs.editedLabel, isOwn ? bs.timeBelowOwn : bs.timeBelowOther]}>edited · </Text>
              )}
              <Text style={[bs.timeBelow, isOwn ? bs.timeBelowOwn : bs.timeBelowOther]}>
                {formatTime(message.createdAt)}{isOwn ? '  ✓✓' : ''}
              </Text>
            </View>
          )}

          {/* Tap-to-reveal full date+time */}
          {showTimestamp && (
            <Text style={[bs.fullTimestamp, isOwn ? bs.fullTimestampOwn : bs.fullTimestampOther]}>
              {new Date(message.createdAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
              })}
            </Text>
          )}
        </View>
      </Pressable>

      <ReactionRow reactions={reactions} isOwn={isOwn} onReact={onReact} />
    </Animated.View>
  );
}

const bs = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 3, paddingHorizontal: 16 },
  wrapOwn: { justifyContent: 'flex-end' },
  wrapOther: { justifyContent: 'flex-start' },

  replyQuote: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    overflow: 'hidden',
    gap: 8,
  },
  replyQuoteOwn: { backgroundColor: 'rgba(255,255,255,0.1)' },
  replyQuoteOther: { backgroundColor: T.SURFACE_2 },
  replyAccent: { width: 3, borderRadius: 2, backgroundColor: T.ACCENT },
  replyName: { fontSize: 11, fontFamily: T.FONT.semibold, color: T.ACCENT, marginBottom: 1 },
  replyBody: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },

  bubble: {
    borderRadius: 7,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    maxWidth: '100%',
  },
  bubbleOwn: {
    backgroundColor: T.ACCENT,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: T.SURFACE,
    borderBottomLeftRadius: 6,
  },
  bubbleDeleted: {
    backgroundColor: T.SURFACE_2,
    borderRadius: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  deletedText: { fontSize: 13, fontFamily: T.FONT.regular, color: T.TEXT_3, fontStyle: 'italic' },

  bubblePaid: {
    backgroundColor: T.ACCENT_LIGHT,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: T.ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 5,
    minWidth: 160,
  },
  paidLabel: { fontSize: 14, fontFamily: T.FONT.semibold, color: T.ACCENT },
  paidSub: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_2, textAlign: 'center' },

  // Paid badge on sender's view
  mediaCap: { position: 'relative' },
  paidBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  paidBadgeText: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },

  text: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: T.FONT.regular,
    flexShrink: 1,
    includeFontPadding: false,
    ...Platform.select({ android: { textBreakStrategy: 'simple' as const } }),
  },
  textOwn: { color: '#fff' },
  textOther: { color: T.TEXT },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  timeInline: { fontSize: 10, fontFamily: T.FONT.regular, alignSelf: 'flex-end' },
  timeOwn: { color: 'rgba(255,255,255,0.6)' },
  timeOther: { color: T.TEXT_3 },
  editedLabel: { fontSize: 10, fontFamily: T.FONT.regular, fontStyle: 'italic' },

  bubbleImage: {
    width: Math.min(SCREEN_W * 0.68, 300),
    height: 210,
    borderRadius: 7,
    marginBottom: 3,
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
  },
  videoBubble: { position: 'relative' },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  videoPlayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  timeBelowRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, paddingHorizontal: 4 },
  timeBelow: { fontSize: 10, fontFamily: T.FONT.regular },
  timeBelowOwn: { color: T.TEXT_3, textAlign: 'right' },
  timeBelowOther: { color: T.TEXT_3 },

  fullTimestamp: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    marginTop: 4,
    paddingHorizontal: 4,
    color: T.TEXT_3,
  },
  fullTimestampOwn: { textAlign: 'right' },
  fullTimestampOther: { textAlign: 'left' },

  // Upload skeleton
  uploadSkeleton: {
    width: Math.min(SCREEN_W * 0.62, 260),
    height: 200,
     borderRadius: 7,
    borderBottomRightRadius: 6,
    backgroundColor: T.SURFACE,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadSkeletonInner: {
    width: '60%',
    height: 3,
    backgroundColor: T.BORDER_2,
    borderRadius: 2,
  },
});

// ─── Reply preview bar ────────────────────────────────────────────────────────

function ReplyBar({ reply, onDismiss }: { reply: ReplyTarget; onDismiss: () => void }) {
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const opacAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reply) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -60, duration: 180, useNativeDriver: true }),
        Animated.timing(opacAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [reply]);

  if (!reply) return null;

  return (
    <Animated.View style={[rbs.wrap, { transform: [{ translateY: slideAnim }], opacity: opacAnim }]}>
      <View style={rbs.accent} />
      <View style={{ flex: 1 }}>
        <Text style={rbs.name} numberOfLines={1}>{reply.senderName}</Text>
        <Text style={rbs.body} numberOfLines={1}>{reply.body ?? '📎 Media'}</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={rbs.closeBtn} activeOpacity={0.7}>
        <X size={14} color={T.TEXT_2} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const rbs = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  accent: { width: 3, height: 36, borderRadius: 2, backgroundColor: T.ACCENT },
  name: { fontSize: 12, fontFamily: T.FONT.semibold, color: T.ACCENT },
  body: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2 },
  closeBtn: { padding: 4 },
});

// ─── Edit bar ─────────────────────────────────────────────────────────────────

function EditBar({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={[rbs.wrap]}>
      <View>
        <PencilSimple size={16} color={T.ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={rbs.name}>Editing message</Text>
        <Text style={rbs.body} numberOfLines={1}>Make your changes and press send</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={rbs.closeBtn} activeOpacity={0.7}>
        <X size={14} color={T.TEXT_2} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Long-press action sheet ──────────────────────────────────────────────────

interface LPSheetProps {
  visible: boolean;
  message: ChatMessage | null;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onForward: () => void;
  onReact: (emoji: string) => void;
  onInfo: () => void;
  onEdit: () => void;
  onDeleteForMe: () => void;
}

function LongPressSheet(props: LPSheetProps) {
  const { visible, message, onClose } = props;
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!message) return null;

  const canDelete = message.isOwn && !message.isDeleted;
  const canEdit = message.isOwn && !message.isDeleted && !!message.body;
  const canCopy = !!(message.body && !message.isDeleted);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={lps.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[lps.sheet, { paddingBottom: Math.max(insets.bottom, 16) }, { transform: [{ translateY: slideAnim }] }]}>
        <View style={lps.handle} />

        {/* Quick reactions */}
        <View style={lps.emojiRow}>
          {QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={lps.emojiBtn}
              onPress={() => { props.onReact(emoji); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={lps.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={lps.emojiBtn}
            onPress={() => { props.onReact('picker'); onClose(); }}
            activeOpacity={0.7}
          >
            <Smiley size={22} color={T.TEXT_2} />
          </TouchableOpacity>
        </View>

        <View style={lps.divider} />

        <LPAction icon={<ArrowBendUpLeft size={18} color={T.TEXT} />} label="Reply" onPress={() => { props.onReply(); onClose(); }} />
        {canEdit && (
          <LPAction icon={<PencilSimple size={18} color={T.TEXT} />} label="Edit" onPress={() => { props.onEdit(); onClose(); }} />
        )}
        {canCopy && (
          <LPAction icon={<CopyIcon size={18} color={T.TEXT} />} label="Copy" onPress={() => { props.onCopy(); onClose(); }} />
        )}
        <LPAction icon={<ArrowUUpRight size={18} color={T.TEXT} />} label="Forward" onPress={() => { props.onForward(); onClose(); }} />
        <LPAction icon={<Info size={18} color={T.TEXT} />} label="Message info" onPress={() => { props.onInfo(); onClose(); }} />
         <LPAction
           icon={<Trash size={18} color={T.TEXT_2} />}
           label="Delete for me"
           onPress={() => { props.onDeleteForMe(); onClose(); }}
         />
        {canDelete && (
          <LPAction
            icon={<Trash size={18} color={T.ERROR} />}
            label="Delete for everyone"
            labelColor={T.ERROR}
            onPress={() => { props.onDelete(); onClose(); }}
          />
        )}
        {!message.isOwn && (
          <LPAction
            icon={<Info size={18} color={T.ERROR} />}
            label="Report"
            labelColor={T.ERROR}
            onPress={() => { Alert.alert('Reported', 'Message reported. Our team will review it.'); onClose(); }}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

function LPAction({ icon, label, onPress, labelColor }: { icon: React.ReactNode; label: string; onPress: () => void; labelColor?: string }) {
  return (
    <TouchableOpacity style={lps.action} onPress={onPress} activeOpacity={0.7}>
      <View style={lps.actionIcon}>{icon}</View>
      <Text style={[lps.actionLabel, labelColor ? { color: labelColor } : {}]}>{label}</Text>
    </TouchableOpacity>
  );
}

const lps = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 14 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, marginBottom: 6 },
  emojiBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 22 },
  divider: { height: 1, backgroundColor: T.BORDER, marginBottom: 4 },
  action: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  actionIcon: { width: 24, alignItems: 'center' },
  actionLabel: { fontSize: 15, fontFamily: T.FONT.medium, color: T.TEXT },
});

// ─── Offline banner ───────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <View style={ofl.wrap}>
      <Text style={ofl.text}>⚡ Offline — showing cached messages</Text>
    </View>
  );
}
const ofl = StyleSheet.create({
  wrap: { backgroundColor: T.SURFACE_2, paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  text: { fontSize: 12, fontFamily: T.FONT.medium, color: T.TEXT_2 },
});

// ─── Animated Input Bar ───────────────────────────────────────────────────────

interface InputBarProps {
  text: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onEmojiToggle: () => void;
  onAttachToggle: () => void;
  onCameraPress: () => void;
  sending: boolean;
  reply: ReplyTarget;
  onDismissReply: () => void;
  paddingBottom: number;
  isRecording: boolean;
  recordingDuration: number;
  onVoiceStart: () => void;
  onVoiceEnd: () => void;
  isEditing: boolean;
  onDismissEdit: () => void;
}

function InputBar(props: InputBarProps) {
  const {
    text, onChangeText, onSend,
    onEmojiToggle, onAttachToggle, onCameraPress,
    sending, reply, onDismissReply, paddingBottom,
    isRecording, recordingDuration, onVoiceStart, onVoiceEnd,
    isEditing, onDismissEdit,
  } = props;

  const hasText = text.trim().length > 0;
  const [inputHeight, setInputHeight] = useState(22);
  const cameraAnim = useRef(new Animated.Value(1)).current;
  const micAnim = useRef(new Animated.Value(1)).current;
  const sendAnim = useRef(new Animated.Value(0)).current;
  const recordingPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cameraAnim, { toValue: hasText ? 0 : 1, duration: ICON_ANIM_DURATION, useNativeDriver: false }),
      Animated.timing(micAnim, { toValue: hasText ? 0 : 1, duration: 160, useNativeDriver: true }),
      Animated.timing(sendAnim, { toValue: hasText ? 1 : 0, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [hasText]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingPulse, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(recordingPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      recordingPulse.stopAnimation();
      recordingPulse.setValue(1);
    }
  }, [isRecording]);

  const cameraWidth = cameraAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });
  const cameraOpacity = cameraAnim;

  if (isRecording) {
    return (
      <View style={ib.wrapper}>
        <View style={[ib.row, { paddingBottom }]}>
          <View style={[ib.pill, ib.pillRecording]}>
            <Animated.View style={{ transform: [{ scale: recordingPulse }] }}>
              <View style={ib.recDot} />
            </Animated.View>
            <Text style={ib.recText}>Recording… {formatDuration(recordingDuration)}</Text>
            <Text style={ib.recHint}>Release to stop</Text>
          </View>
          <Animated.View style={{ transform: [{ scale: recordingPulse }] }}>
            <TouchableOpacity
              style={[ib.actionBtn, ib.actionBtnRecording]}
              onPressOut={onVoiceEnd}
              activeOpacity={0.8}
            >
              <Microphone size={20} color="#fff" weight="fill" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={ib.wrapper}>
      {/* Reply preview */}
      {reply && !isEditing && <ReplyBar reply={reply} onDismiss={onDismissReply} />}
      {/* Edit indicator */}
      {isEditing && <EditBar onDismiss={onDismissEdit} />}

      <View style={[ib.row, { paddingBottom }]}>
        <View style={ib.pill}>
          <TouchableOpacity style={ib.pillIcon} onPress={onEmojiToggle} activeOpacity={0.7}>
            <Smiley size={22} color={T.TEXT_2} />
          </TouchableOpacity>

          <TextInput
            style={ib.input}
            placeholder={isEditing ? 'Edit message…' : 'Message…'}
            placeholderTextColor={T.TEXT_3}
            value={text}
            onChangeText={onChangeText}
            multiline
            scrollEnabled={inputHeight >= 116}
            onContentSizeChange={(event) => {
              setInputHeight(Math.min(116, Math.max(22, event.nativeEvent.contentSize.height)));
            }}
            textAlignVertical="top"
            underlineColorAndroid="transparent"
            selectionColor="#888"
            returnKeyType="default"
            blurOnSubmit={false}
          />

          {!isEditing && (
            <TouchableOpacity style={ib.pillIcon} onPress={onAttachToggle} activeOpacity={0.7}>
              <Paperclip size={22} color={T.TEXT_2} />
            </TouchableOpacity>
          )}

          <Animated.View style={{ width: cameraWidth, overflow: 'hidden', opacity: cameraOpacity }}>
            <TouchableOpacity style={ib.pillIcon} onPress={onCameraPress} activeOpacity={0.7}>
              <Camera size={22} color={T.TEXT_2} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={ib.rightBtn}>
          {!isEditing && (
            <Animated.View style={[ib.btnAbsolute, { opacity: micAnim, transform: [{ scale: micAnim }] }]}>
              <TouchableOpacity
                style={ib.actionBtn}
                onLongPress={onVoiceStart}
                delayLongPress={150}
                onPressOut={() => { if (isRecording) onVoiceEnd(); }}
                activeOpacity={0.8}
              >
                <Microphone size={20} color="#fff" weight="fill" />
              </TouchableOpacity>
            </Animated.View>
          )}
          <Animated.View style={[ib.btnAbsolute, {
            opacity: isEditing ? 1 : sendAnim,
            transform: [{ scale: isEditing ? 1 : sendAnim }],
          }]}>
            <TouchableOpacity
              style={[ib.actionBtn, isEditing && ib.actionBtnEdit]}
              onPress={onSend}
              activeOpacity={0.8}
              disabled={!hasText || sending}
            >
              {isEditing
                ? <CheckCircle size={20} color="#fff" weight="fill" />
                : <PaperPlaneRight size={20} color="#fff" weight="fill" />
              }
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const ib = StyleSheet.create({
  wrapper: { backgroundColor: T.BG },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 50,
  },
  pillIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    includeFontPadding: false,
  },
  rightBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  btnAbsolute: { position: 'absolute' },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  actionBtnRecording: {
    backgroundColor: '#EF4444',
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  actionBtnEdit: {
    backgroundColor: T.SUCCESS,
  },
  pillRecording: {
    backgroundColor: T.SURFACE_2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recText: {
    flex: 1,
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  recHint: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const flatRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');

  const [otherUser, setOtherUser] = useState<ProfileSheetUser>({
    id: '', name: '', username: '', avatarUrl: null,
  });
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOnline] = useState(false);

  const [reactions, setReactions] = useState<Record<string, MessageReactions>>({});
  const [replyTargets] = useState<Record<string, { body: string | null; senderName: string }>>({});

  // Sheets
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);

  // Reply / Edit
  const [replyTarget, setReplyTarget] = useState<ReplyTarget>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);

  // Attachment preview
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [fullscreenVideoUri, setFullscreenVideoUri] = useState<string | null>(null);

  // Upload tracking
  const [uploadingImage, setUploadingImage] = useState(false);

  // Voice recording
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Floating scroll-date badge
  const [scrollDateLabel, setScrollDateLabel] = useState('');
  const [scrollDateVisible, setScrollDateVisible] = useState(false);
  const scrollHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tap-to-reveal timestamp
  const [tappedMsgId, setTappedMsgId] = useState<string | null>(null);
  const handleMsgTap = useCallback((id: string) => {
    setTappedMsgId((prev) => (prev === id ? null : id));
  }, []);

  // ── Load other user info ─────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const cached = await getCachedConversations();
      const conv = cached.find((c) => c.id === conversationId);
      if (conv) {
        setOtherUser({
          id: conv.otherUser.id,
          name: conv.otherUser.name,
          username: conv.otherUser.username,
          avatarUrl: conv.otherUser.avatarUrl,
          isVerified: conv.otherUser.isVerified,
        });
      }
      try {
        const data = await getConversations('all');
        const found = data.conversations.find((c) => c.id === conversationId);
        if (found) {
          setOtherUser({
            id: found.otherUser.id,
            name: found.otherUser.name,
            username: found.otherUser.username,
            avatarUrl: found.otherUser.avatarUrl,
            isVerified: found.otherUser.isVerified,
          });
          if (found.otherUser.username) {
            try {
              const profile = await getUser(found.otherUser.username);
              setOtherUser((current) => ({
                ...current,
                bio: profile.user.bio,
                followerCount: profile.user.followerCount,
                followingCount: profile.user.followingCount,
                isVerified: profile.user.isVerified,
              }));
              setIsFollowing(profile.isFollowing);
            } catch {
              // Conversation data remains a valid fallback when profile lookup fails.
            }
          }
        }
        await cacheConversations(data.conversations);
      } catch {}
    })();
  }, [conversationId]);

  // ── Load messages ────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (before?: string) => {
    try {
      const data = await getMessages(conversationId, before);
      if (before) {
        setMessages((prev) => {
          const byId = new Map<string, ChatMessage>();
          [...data.messages, ...prev].forEach((message) => byId.set(message.id, message));
          return [...byId.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
      } else {
        const byId = new Map<string, ChatMessage>();
        data.messages.forEach((message) => byId.set(message.id, message));
        setMessages(
          [...byId.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
        );
      }
      setHasMore(data.hasMore);
      setOffline(false);
      await cacheMessages(conversationId, data.messages);
    } catch {
      if (!before) {
        const cached = await getCachedMessages(conversationId);
        if (cached.length > 0) {
          setMessages(cached);
          setOffline(true);
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversationId]);

  useEffect(() => { loadMessages(); }, [conversationId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadMessages();
    } finally {
      setRefreshing(false);
    }
  }, [loadMessages]);

  const scrollToEnd = (animated = true) => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated }), 60);
  };

  // ── Send / Edit ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;

    // ─ Editing mode ─
    if (editingMsg) {
      const id = editingMsg.id;
      setText('');
      setEditingMsg(null);
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, body, isEdited: true } : m));
      try {
        await editMessage(id, body);
      } catch {
        // Revert on failure
        setMessages((prev) => prev.map((m) => m.id === id ? editingMsg : m));
        setText(body);
        setEditingMsg(editingMsg);
        Alert.alert('Error', 'Could not edit the message. Please try again.');
      }
      return;
    }

    // ─ New message ─
    setText('');
    setSending(true);
    setReplyTarget(null);

    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      body,
      mediaUrl: null,
      mediaType: null,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: user?.id ?? '',
        name: user?.name ?? '',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
      isOwn: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    scrollToEnd();

    try {
      const { message } = await sendMessage(conversationId, body);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)));
      await cacheMessages(conversationId, [message]);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(body);
      if (error instanceof Error && error.message.includes('does not support')) {
        Alert.alert('Media type unavailable', error.message);
      }
    } finally {
      setSending(false);
    }
  };

  // ── Attachment result from sheet ─────────────────────────────────────────
  // We no longer send immediately — show the preview composer first.

  const handleAttachmentResult = (result: AttachmentResult) => {
    setPendingAttachment({
      type: result.type,
      uri: result.uri,
      mimeType: result.mimeType,
      fileName: result.fileName,
      fileSize: result.fileSize,
      duration: result.duration,
    });
  };

  // ── Confirmed send from attachment preview ───────────────────────────────

  const handleConfirmedAttachment = async (confirmed: ConfirmedAttachment) => {
    setPendingAttachment(null);
    setUploadingImage(true);

    // Map our internal type to the ChatMessage mediaType
    const msgMediaType: ChatMessage['mediaType'] =
      confirmed.type === 'image'    ? 'image' :
      confirmed.type === 'video'    ? 'video' :
      confirmed.type === 'audio'    ? 'audio' :
      confirmed.type === 'voice'    ? 'audio' :
      confirmed.type === 'document' ? 'document' : null;

    const optimistic: ChatMessage = {
      id: `opt-att-${Date.now()}`,
      body: confirmed.caption ?? null,
      mediaUrl: confirmed.uri,
      mediaType: msgMediaType,
      audioDuration: confirmed.duration,
      fileName: confirmed.fileName,
      fileSize: confirmed.fileSize,
      mimeType: confirmed.mimeType,
      isPaid: confirmed.isPaid,
      isUnlocked: true, // sender always sees their own content
      paidPrice: confirmed.paidPrice,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: user?.id ?? '',
        name: user?.name ?? '',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
      },
      isOwn: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    scrollToEnd();

    try {
      const apiMimeType = confirmed.type === 'voice' ? 'audio/m4a' : confirmed.mimeType;
      const apiFileName = confirmed.type === 'voice'
        ? `voice-${Date.now()}.m4a`
        : confirmed.fileName;

      const uploaded = await uploadMedia(confirmed.uri, apiMimeType, apiFileName);
      const remoteUrl = uploaded.url ?? confirmed.uri;

      const { message } = await sendMessage(
        conversationId,
        confirmed.caption,
        remoteUrl,
        msgMediaType ?? undefined,
        {
          caption: confirmed.caption,
          isPaid: confirmed.isPaid,
          paidPrice: confirmed.paidPrice,
          fileName: confirmed.fileName,
          fileSize: confirmed.fileSize,
          mimeType: confirmed.mimeType,
          audioDuration: confirmed.duration,
        },
      );

      // Merge back local fields the backend may not echo
      const merged: ChatMessage = {
        ...message,
        mediaType: msgMediaType,
        audioDuration: confirmed.duration,
        fileName: confirmed.fileName,
        fileSize: confirmed.fileSize,
        mimeType: confirmed.mimeType,
        isPaid: confirmed.isPaid,
        isUnlocked: true,
        paidPrice: confirmed.paidPrice,
        caption: confirmed.caption,
      };
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? merged : m)));
      await cacheMessages(conversationId, [merged]);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      const detail = error instanceof Error ? error.message : '';
      Alert.alert(
        'Attachment unavailable',
        detail.includes('422') || detail.includes('does not support')
          ? 'The live messaging API does not currently support this attachment type. Images and videos are supported.'
          : 'Could not send the attachment. Please try again.',
      );
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Camera quick photo ───────────────────────────────────────────────────

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingAttachment({
        type: 'image',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? 'photo.jpg',
        fileSize: asset.fileSize,
      });
    }
  };

  // ── Reactions ────────────────────────────────────────────────────────────

  const handleReact = (messageId: string, emoji: string) => {
    setReactions((prev) => {
      const msgR = { ...(prev[messageId] ?? {}) };
      const ex = msgR[emoji];
      if (ex) {
        msgR[emoji] = { ...ex, count: ex.byMe ? ex.count - 1 : ex.count + 1, byMe: !ex.byMe };
      } else {
        msgR[emoji] = { emoji, count: 1, byMe: true };
      }
      return { ...prev, [messageId]: msgR };
    });
  };

  // ── Long press ───────────────────────────────────────────────────────────

  const handleLongPress = (msg: ChatMessage) => {
    setMenuMsg(msg);
    setMenuVisible(true);
  };

  const handleDelete = async () => {
    if (!menuMsg) return;
    await deleteMessage(menuMsg.id);
    await deleteCachedMessage(menuMsg.id);
    setMessages((prev) =>
      prev.map((m) => (m.id === menuMsg.id ? { ...m, isDeleted: true, body: null } : m)),
    );
  };

  const handleCopy = () => {
    if (!menuMsg?.body) return;
    ExpoClipboard.setStringAsync(menuMsg.body).catch(() => {
      try { Clipboard.setString(menuMsg.body ?? ''); } catch {}
    });
  };

  const handleReply = () => {
    if (!menuMsg) return;
    setReplyTarget({
      id: menuMsg.id,
      body: menuMsg.body,
      senderName: menuMsg.isOwn ? 'You' : menuMsg.sender.name,
    });
  };

  const handleEdit = () => {
    if (!menuMsg?.body) return;
    setEditingMsg(menuMsg);
    setText(menuMsg.body);
  };

  const handleDeleteForMe = async () => {
    if (!menuMsg) return;
    const messageId = menuMsg.id;
    setMenuVisible(false);
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
    await removeCachedMessage(conversationId, messageId);
  };

  const handleForward = () => {
    Alert.alert('Forward', 'Forward message: coming soon.');
  };

  const handleInfo = () => {
    Alert.alert(
      'Message Info',
      `Sent: ${menuMsg ? formatTime(menuMsg.createdAt) : '—'}`,
    );
  };

  // ── Paid unlock ──────────────────────────────────────────────────────────

  const handleUnlockPaid = (msg: ChatMessage) => {
    const price = msg.paidPrice ?? 0;
    Alert.alert(
      'Unlock Content',
      price > 0
        ? `Spend ${price} credits to unlock this content?`
        : 'Spend credits to unlock this content?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Unlock${price > 0 ? ` (${price} cr)` : ''}`,
          onPress: () => {
            setMessages((prev) =>
              prev.map((m) => m.id === msg.id ? { ...m, isUnlocked: true } : m),
            );
          },
        },
      ],
    );
  };

  const handleFollow = async () => {
    if (!otherUser.username) return;
    setIsFollowing(true);
    try {
      await followUser(otherUser.username);
    } catch {
      setIsFollowing(false);
      Alert.alert('Could not follow', 'Please try again.');
    }
  };

  const handleUnfollow = async () => {
    if (!otherUser.username) return;
    setIsFollowing(false);
    try {
      await unfollowUser(otherUser.username);
    } catch {
      setIsFollowing(true);
      Alert.alert('Could not unfollow', 'Please try again.');
    }
  };

  // ── Voice recording ──────────────────────────────────────────────────────

  const startVoiceRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow microphone access to send voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopVoiceRecording = async () => {
    if (!recordingRef.current) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    const recording = recordingRef.current;
    recordingRef.current = null;
    const duration = recordingDuration;
    setRecordingDuration(0);

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      if (!uri || duration < 1) return; // ignore sub-second clips

      // Show preview instead of sending immediately
      setPendingAttachment({
        type: 'voice',
        uri,
        mimeType: 'audio/m4a',
        fileName: `voice-${Date.now()}.m4a`,
        duration,
      });
    } catch {
      Alert.alert('Error', 'Could not process the voice recording. Please try again.');
    }
  };

  // ── Viewability — floating scroll-date badge ─────────────────────────────

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: ChatMessage }> }) => {
    if (viewableItems.length > 0) {
      const item = viewableItems[0].item;
      setScrollDateLabel(formatDateLabel(item.createdAt));
      setScrollDateVisible(true);
      if (scrollHideRef.current) clearTimeout(scrollHideRef.current);
      scrollHideRef.current = setTimeout(() => setScrollDateVisible(false), 1200);
    }
  }).current;

  // ── Load more ────────────────────────────────────────────────────────────

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    loadMessages(messages[0]?.createdAt);
  };

  // ── Emoji insert ─────────────────────────────────────────────────────────

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    setShowEmoji(false);
  };

  // ── Render item ──────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const prev = messages[index - 1];
      const showDate = needsDateSep(item, prev);
      const msgReactions = reactions[item.id] ?? {};
      const rTarget = replyTargets[item.id] ?? null;

      return (
        <View>
          {showDate && <DateSep label={formatDateLabel(item.createdAt)} />}
          <MessageBubble
            message={item}
            reactions={msgReactions}
            replyTo={rTarget}
            onLongPress={() => handleLongPress(item)}
            onReact={(emoji) => handleReact(item.id, emoji)}
            onTap={() => handleMsgTap(item.id)}
            showTimestamp={tappedMsgId === item.id}
            onUnlockPaid={() => handleUnlockPaid(item)}
            onImagePress={setFullscreenImageUri}
            onVideoPress={setFullscreenVideoUri}
          />
        </View>
      );
    },
     [messages, reactions, replyTargets, tappedMsgId, handleMsgTap],
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={[sc.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={sc.header}>
        <TouchableOpacity
          style={sc.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={T.TEXT} />
        </TouchableOpacity>

        {/* Tappable avatar + name → opens profile sheet */}
        <TouchableOpacity
          style={sc.headerUser}
          onPress={() => setShowProfileSheet(true)}
          activeOpacity={0.75}
        >
          <MsAvatar
            size={38}
            initials={initials(otherUser.name || '?')}
            imageUri={otherUser.avatarUrl ?? undefined}
          />
          <View style={sc.headerInfo}>
            <View style={sc.headerNameRow}>
              <Text style={sc.headerName} numberOfLines={1}>
                {otherUser.name || '…'}
              </Text>
              {otherUser.isVerified && (
                <CheckCircle size={14} color={T.ACCENT} weight="fill" />
              )}
            </View>
            <Text style={sc.headerStatus}>
              {isOnline ? '🟢 Online' : 'Tap to view profile'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={sc.headerActions}>
          <TouchableOpacity style={sc.headerActionBtn} activeOpacity={0.7}>
            <DotsThree size={20} color={T.TEXT} />
          </TouchableOpacity>
        </View>
      </View>

      {offline && <OfflineBanner />}

      {/* ── Messages ── */}
      <View style={{ flex: 1 }}>
        {scrollDateVisible && scrollDateLabel ? (
          <View style={sc.floatDateWrap}>
            <View style={sc.floatDateBadge}>
              <Text style={sc.floatDateText}>{scrollDateLabel}</Text>
            </View>
          </View>
        ) : null}

        {loading ? (
          <View style={sc.loadingWrap}>
            <View style={sc.loadingDots}>
              <Text style={sc.loadingText}>Loading…</Text>
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={sc.msgList}
             refreshControl={
               <RefreshControl
                 refreshing={refreshing}
                 onRefresh={handleRefresh}
                 tintColor={T.TEXT_2}
                 colors={[T.ACCENT]}
               />
             }
            onLayout={() => scrollToEnd(false)}
            onStartReachedThreshold={0.3}
            onStartReached={handleLoadMore}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            ListHeaderComponent={
              loadingMore ? (
                <View style={{ alignItems: 'center', marginVertical: 12 }}>
                  <Text style={{ color: T.TEXT_3, fontSize: 12, fontFamily: T.FONT.regular }}>Loading more…</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={sc.emptyWrap}>
                <MsAvatar
                  size={70}
                  initials={initials(otherUser.name || '?')}
                  imageUri={otherUser.avatarUrl ?? undefined}
                />
                <Text style={sc.emptyName}>{otherUser.name}</Text>
                <Text style={sc.emptyHint}>No messages yet — say hello! 👋</Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Upload skeleton */}
        {uploadingImage && <UploadingBubble />}
      </View>

      {/* ── Input bar ── */}
      <InputBar
        text={text}
        onChangeText={setText}
        onSend={handleSend}
        onEmojiToggle={() => { Keyboard.dismiss(); setShowEmoji(true); }}
        onAttachToggle={() => { Keyboard.dismiss(); setShowAttach(true); }}
        onCameraPress={handleCamera}
        sending={sending || uploadingImage}
        reply={replyTarget}
        onDismissReply={() => setReplyTarget(null)}
        paddingBottom={Math.max(insets.bottom, 10)}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onVoiceStart={startVoiceRecording}
        onVoiceEnd={stopVoiceRecording}
        isEditing={!!editingMsg}
        onDismissEdit={() => { setEditingMsg(null); setText(''); }}
      />

      {/* ── Sheets ── */}
      <MsEmojiPicker
        visible={showEmoji}
        onClose={() => setShowEmoji(false)}
        onEmojiSelect={handleEmojiSelect}
      />

      <MsAttachmentSheet
        visible={showAttach}
        onClose={() => setShowAttach(false)}
        onResult={handleAttachmentResult}
      />

      {/* Attachment preview composer */}
      <MsAttachmentPreview
        attachment={pendingAttachment}
        onSend={handleConfirmedAttachment}
        onCancel={() => setPendingAttachment(null)}
        onReRecord={() => {
          setPendingAttachment(null);
          // Small delay to ensure state is clear before starting new recording
          setTimeout(startVoiceRecording, 300);
        }}
      />

      {/* Profile bottom sheet */}
      <MsUserProfileSheet
        visible={showProfileSheet}
        user={otherUser}
        isFollowing={isFollowing}
        onFollow={handleFollow}
        onUnfollow={handleUnfollow}
        onClose={() => setShowProfileSheet(false)}
      />

      <Modal
        visible={!!fullscreenImageUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenImageUri(null)}
      >
        <View style={sc.fullscreenBackdrop}>
          <TouchableOpacity
            style={sc.fullscreenClose}
            onPress={() => setFullscreenImageUri(null)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Close fullscreen image"
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>
          {fullscreenImageUri && (
            <ScrollView
              style={sc.fullscreenScroll}
              contentContainerStyle={sc.fullscreenImageContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri: fullscreenImageUri }}
                style={sc.fullscreenImage}
                resizeMode="contain"
              />
            </ScrollView>
          )}
        </View>
      </Modal>

      <MsVideoPlayer
        visible={!!fullscreenVideoUri}
        uri={fullscreenVideoUri ?? ''}
        onClose={() => setFullscreenVideoUri(null)}
      />

      {/* Long-press menu */}
      <LongPressSheet
        visible={menuVisible}
        message={menuMsg}
        onClose={() => setMenuVisible(false)}
        onReply={handleReply}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onDeleteForMe={handleDeleteForMe}
        onForward={handleForward}
        onEdit={handleEdit}
        onReact={(emoji) => {
          if (menuMsg) {
            if (emoji === 'picker') return;
            handleReact(menuMsg.id, emoji);
          }
        }}
        onInfo={handleInfo}
      />
    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  headerUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerInfo: { flex: 1 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerName: { fontSize: 15, fontFamily: T.FONT.semibold, color: T.TEXT, flexShrink: 1 },
  headerStatus: { fontSize: 11, fontFamily: T.FONT.regular, color: T.TEXT_3, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 2, flexShrink: 0 },
  headerActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingDots: { padding: 16 },
  loadingText: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_3 },

  msgList: { paddingVertical: 8, flexGrow: 1 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  emptyName: { fontSize: 18, fontFamily: T.FONT.bold, color: T.TEXT, marginTop: 4 },
  emptyHint: { fontSize: 14, fontFamily: T.FONT.regular, color: T.TEXT_2 },

  floatDateWrap: {
    position: 'absolute', top: 8, left: 0, right: 0, zIndex: 9, alignItems: 'center',
  },
  floatDateBadge: {
    backgroundColor: 'rgba(20,17,40,0.88)',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12,
  },
  floatDateText: { fontSize: 11, fontFamily: T.FONT.medium, color: T.TEXT_2, letterSpacing: 0.2 },

  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenScroll: { flex: 1, width: '100%' },
  fullscreenImageContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: SCREEN_W,
    height: Dimensions.get('window').height * 0.82,
  },
  fullscreenClose: {
    position: 'absolute',
    top: 48,
    right: 18,
    zIndex: 4,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
