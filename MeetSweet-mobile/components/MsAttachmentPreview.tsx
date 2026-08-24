/**
 * MsAttachmentPreview — intercepts every attachment before sending.
 *
 * Glassmorphic full-screen composer above the message input.
 * Supports: images, videos, audio files, voice notes, documents.
 * - Images / Videos: large crisp previews + optional paid toggle
 * - Audio / Voice: waveform player + re-record option
 * - Documents: rich file card
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { dialogs } from '@/components/MsGlobalDialogs';
import {
  X,
  Play,
  Pause,
  File,
  ArrowClockwise,
  PaperPlaneRight,
  Trash,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');

// Pre-computed waveform bars
const VOICE_BARS = Array.from({ length: 30 }, (_, i) =>
  6 + Math.abs(Math.sin(i * 1.7 + 0.5) * Math.cos(i * 0.9)) * 22,
);

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A single waveform bar whose scaleY pulse runs as a Reanimated worklet. */
function PlayingBar({ scale, style }: { scale: SharedValue<number>; style: any }) {
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Reanimated.View style={[style, animatedStyle]} />;
}

export interface PendingAttachment {
  // 'gif' is supported as a media-first type (renders through the image path);
  // the preview modal renders it with expo-image which animates GIFs.
  // 'sticker' is the same pipeline with an animated WebP file.
  type: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'gif' | 'sticker';
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  duration?: number;
}

export interface ConfirmedAttachment extends PendingAttachment {
  caption?: string;
}

interface Props {
  attachment: PendingAttachment | null;
  onSend: (confirmed: ConfirmedAttachment) => void;
  onCancel: () => void;
  onReRecord?: () => void;
}

export function MsAttachmentPreview({ attachment, onSend, onCancel, onReRecord }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;

  const [caption, setCaption] = useState('');

  // Audio/voice playback (expo-audio)
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status  = useAudioPlayerStatus(player);
  const isPlaying  = status.playing;
  const audioPosition = Math.floor(status.currentTime ?? 0);

  // Waveform bar pulse — Reanimated worklets on the UI thread
  const barScales = useRef(VOICE_BARS.map(() => useSharedValue(1))).current;

  useEffect(() => {
    if (isPlaying) {
      barScales.forEach((v, i) => {
        v.value = withRepeat(
          withSequence(
            withDelay(i * 22, withTiming(1.5, { duration: 300 + (i % 5) * 40, easing: Easing.inOut(Easing.sin) })),
            withTiming(1,   { duration: 300 + (i % 5) * 40, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        );
      });
    } else {
      barScales.forEach((v) => { cancelAnimation(v); v.value = 1; });
    }
  }, [isPlaying]);

  // Point the shared player at the current attachment whenever it changes.
  useEffect(() => {
    if (attachment && (attachment.type === 'audio' || attachment.type === 'voice')) {
      player.replace(attachment.uri);
    }
  }, [attachment?.uri]);

  useEffect(() => {
    if (attachment) {
      setCaption('');
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 200,
        }),
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_H,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [!!attachment]);

  useEffect(() => () => {
    barScales.forEach((v) => cancelAnimation(v));
    player.remove();
  }, []);

  const togglePlayback = async () => {
    if (!attachment) return;
    try {
      if (isPlaying) {
        player.pause();
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true });
      if (status.didJustFinish) await player.seekTo(0);
      player.play();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      dialogs.alert({ variant: 'error', title: 'Playback error', message: 'Could not play the audio.' });
    }
  };

  const handleSend = () => {
    if (!attachment) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    player.pause();
    onSend({
      ...attachment,
      caption: caption.trim() || undefined,
    });
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    player.pause();
    onCancel();
  };

  if (!attachment) return null;

  const isAudio   = attachment.type === 'audio' || attachment.type === 'voice';
  const duration  = attachment.duration ?? 0;
  const progress  = duration > 0 ? Math.min(audioPosition / duration, 1) : 0;

  const typeLabel = attachment.type === 'voice' ? 'Voice Note'
    : attachment.type === 'audio' ? 'Audio'
    : attachment.type === 'document' ? 'Document'
    : attachment.type === 'video' ? 'Video'
    : attachment.type === 'gif' ? 'GIF'
    : 'Photo';

  return (
    <Modal
      visible={!!attachment}
      transparent
      animationType="none"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      {/* Animated dark backdrop with blur tint */}
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: bgAnim }]} />

      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: Math.max(insets.bottom, 20) },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Glass border at top edge */}
        <View style={s.glassBorder} />

        {/* ── Header ── */}
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <MsPressable style={s.headerBtn} onPress={handleCancel}>
            <X size={18} color={T.TEXT} />
          </MsPressable>
          <Text style={s.headerTitle}>{typeLabel}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── IMAGE preview — large, full-width ── */}
          {attachment.type === 'image' && (
            <View style={s.imageWrap}>
              <Image
                source={{ uri: attachment.uri }}
                style={s.imagePreview}
                resizeMode="cover"
              />
              {/* Subtle overlay gradient at bottom for caption legibility */}
              <View style={s.imageGradient} />
            </View>
          )}

          {/* ── VIDEO preview — large ── */}
          {attachment.type === 'video' && (
            <View style={s.videoWrap}>
              <MsVideoPlayer
                videoId={attachment.uri}
                uri={attachment.uri}
                fillContainer
                mode="standard"
              />
              {/* Duration badge */}
              {duration > 0 && (
                <View style={s.durationBadge}>
                  <Text style={s.durationBadgeText}>{formatDuration(duration)}</Text>
                </View>
              )}
              {/* File size badge */}
              {attachment.fileSize ? (
                <View style={s.sizeBadge}>
                  <Text style={s.sizeBadgeText}>{formatFileSize(attachment.fileSize)}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ── AUDIO / VOICE preview ── */}
          {isAudio && (
            <View style={s.audioCard}>
              {/* Waveform bars */}
              <View style={s.waveRow}>
                {VOICE_BARS.map((h, i) => {
                  const filled = i / VOICE_BARS.length <= progress;
                  const style = [
                    s.waveBar,
                    {
                      height: h,
                      backgroundColor: filled ? T.ACCENT : 'rgba(255,255,255,0.12)',
                    },
                  ];
                  return isPlaying && filled
                    ? <PlayingBar key={i} scale={barScales[i]} style={style} />
                    : <View key={i} style={style} />;
                })}
              </View>

              {/* Controls */}
              <View style={s.audioControls}>
                <MsPressable style={s.playBtn} onPress={togglePlayback}>
                  {isPlaying
                    ? <Pause size={20} color="#fff" weight="fill" />
                    : <Play size={20} color="#fff" weight="fill" />
                  }
                </MsPressable>
                <Text style={s.audioDuration}>
                  {isPlaying ? formatDuration(audioPosition) : formatDuration(duration)}
                </Text>
                {attachment.type === 'voice' && onReRecord && (
                  <MsPressable
                    style={s.rerecordBtn}
                    onPress={() => { handleCancel(); onReRecord(); }}
                  >
                    <ArrowClockwise size={16} color={T.TEXT_2} />
                    <Text style={s.rerecordText}>Re-record</Text>
                  </MsPressable>
                )}
              </View>
            </View>
          )}

          {/* ── DOCUMENT preview ── */}
          {attachment.type === 'document' && (
            <View style={s.docCard}>
              <View style={s.docIcon}>
                <File size={36} color={T.ACCENT} weight="duotone" />
              </View>
              <View style={s.docInfo}>
                <Text style={s.docName} numberOfLines={2}>{attachment.fileName}</Text>
                <Text style={s.docMeta}>
                  {attachment.mimeType.split('/')[1]?.toUpperCase() ?? 'FILE'}
                  {attachment.fileSize ? `  ·  ${formatFileSize(attachment.fileSize)}` : ''}
                </Text>
              </View>
            </View>
          )}

          {/* ── Caption (images & videos) ── */}
          {(attachment.type === 'image' || attachment.type === 'video') && (
            <View style={s.captionWrap}>
              <TextInput
                style={s.captionInput}
                placeholder="Add a caption…"
                placeholderTextColor={T.TEXT_3}
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={500}
                selectionColor="#888"
              />
            </View>
          )}

        </ScrollView>

        {/* ── Action buttons ── */}
        <View style={s.actions}>
          {isAudio && (
            <MsPressable style={s.deleteBtn} onPress={handleCancel}>
              <Trash size={18} color={T.ERROR} />
            </MsPressable>
          )}
          <MsPressable style={s.sendBtn} onPress={handleSend}>
            <PaperPlaneRight size={18} color="#fff" weight="fill" />
            <Text style={s.sendBtnText}>Send</Text>
          </MsPressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(14,14,18,0.97)',
  },
  glassBorder: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: 0.2,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 16,
  },

  // ── Image ──
  imageWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
    height: SCREEN_H * 0.5,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },

  // ── Video ──
  videoWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
    height: SCREEN_H * 0.42,
    position: 'relative',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durationBadgeText: {
    fontSize: 12,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },
  sizeBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sizeBadgeText: {
    fontSize: 11,
    fontFamily: T.FONT.medium,
    color: 'rgba(255,255,255,0.8)',
  },

  // ── Audio / Voice ──
  audioCard: {
    backgroundColor: T.SURFACE,
    borderRadius: 24,
    padding: 24,
    gap: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 52,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  audioControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  audioDuration: {
    flex: 1,
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    letterSpacing: 0.4,
  },
  rerecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
  },
  rerecordText: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  // ── Document ──
  docCard: {
    backgroundColor: T.SURFACE,
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  docIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docName: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    marginBottom: 4,
  },
  docMeta: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  // ── Caption ──
  captionWrap: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  captionInput: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    minHeight: 44,
    paddingVertical: 12,
    lineHeight: 22,
    // Kill Android's extra internal font padding so the glyphs line up with
    // the fixed lineHeight (keeps multiline captions from sitting low).
    includeFontPadding: false,
  },

  // ── Paid content ──
  paidSection: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  paidToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  paidToggleLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paidIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  paidSub: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginTop: 1,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: T.SURFACE_2,
    padding: 3,
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleActive: { backgroundColor: T.ACCENT },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: T.TEXT_3,
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: T.BORDER,
    paddingTop: 12,
  },
  priceIcon: { width: 28, alignItems: 'center' },
  priceInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priceSuffix: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
  },

  // ── Actions ──
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.ACCENT,
    borderRadius: T.RADIUS.pill,
    paddingVertical: 15,
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.40,
    shadowRadius: 12,
    elevation: 8,
  },
  sendBtnText: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: '#fff',
    letterSpacing: 0.3,
  },
});
