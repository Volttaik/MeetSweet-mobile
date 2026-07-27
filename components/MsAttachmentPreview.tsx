/**
 * MsAttachmentPreview — intercepts every attachment before sending.
 *
 * Shows a polished preview composer positioned above the message input.
 * Supports: images, videos, audio files, voice notes, documents.
 * For images and videos, exposes an optional "Make this paid content" toggle.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio, Video, ResizeMode } from 'expo-av';
import {
  X,
  Play,
  Pause,
  LockSimple,
  CurrencyDollar,
  File,
  ArrowClockwise,
  PaperPlaneRight,
  Trash,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Pre-computed waveform bars for voice note display
const VOICE_BARS = Array.from({ length: 28 }, (_, i) =>
  4 + Math.abs(Math.sin(i * 1.7 + 0.5) * Math.cos(i * 0.9)) * 16,
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

export interface PendingAttachment {
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  duration?: number; // seconds, for audio/video/voice
}

export interface ConfirmedAttachment extends PendingAttachment {
  caption?: string;
  isPaid?: boolean;
  paidPrice?: number;
}

interface Props {
  attachment: PendingAttachment | null;
  onSend: (confirmed: ConfirmedAttachment) => void;
  onCancel: () => void;
  onReRecord?: () => void; // only for voice
}

export function MsAttachmentPreview({ attachment, onSend, onCancel, onReRecord }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const [caption, setCaption] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [paidPrice, setPaidPrice] = useState('');

  // Audio/voice playback state
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);

  useEffect(() => {
    if (attachment) {
      setCaption('');
      setIsPaid(false);
      setPaidPrice('');
      setIsPlaying(false);
      setAudioPosition(0);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [!!attachment]);

  // Cleanup audio on unmount / change
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const togglePlayback = async () => {
    if (!attachment) return;
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: attachment.uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setAudioPosition(Math.floor((status.positionMillis ?? 0) / 1000));
            if (status.didJustFinish) {
              setIsPlaying(false);
              setAudioPosition(0);
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
      Alert.alert('Playback error', 'Could not play the audio.');
    }
  };

  const handleSend = () => {
    if (!attachment) return;
    const price = parseFloat(paidPrice);
    if (isPaid && (isNaN(price) || price <= 0)) {
      Alert.alert('Invalid price', 'Please enter a valid credit price for paid content.');
      return;
    }
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    onSend({
      ...attachment,
      caption: caption.trim() || undefined,
      isPaid,
      paidPrice: isPaid ? price : undefined,
    });
  };

  const handleCancel = () => {
    soundRef.current?.stopAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    setIsPlaying(false);
    onCancel();
  };

  if (!attachment) return null;

  const canBePaid = attachment.type === 'image' || attachment.type === 'video';
  const isAudio = attachment.type === 'audio' || attachment.type === 'voice';
  const duration = attachment.duration ?? 0;
  const progress = duration > 0 ? Math.min(audioPosition / duration, 1) : 0;

  return (
    <Modal
      visible={!!attachment}
      transparent
      animationType="none"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View style={s.backdrop}>
        <Animated.View
          style={[
            s.sheet,
            { paddingBottom: Math.max(insets.bottom, 20) },
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* ── Header ── */}
          <View style={s.header}>
            <TouchableOpacity style={s.headerBtn} onPress={handleCancel} activeOpacity={0.7}>
              <X size={18} color={T.TEXT} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>
              {attachment.type === 'voice' ? 'Voice Note'
                : attachment.type === 'audio' ? 'Audio'
                : attachment.type === 'document' ? 'Document'
                : attachment.type === 'video' ? 'Video'
                : 'Photo'}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Media preview ── */}
            {attachment.type === 'image' && (
              <View style={s.imageWrap}>
                <Image
                  source={{ uri: attachment.uri }}
                  style={s.imagePreview}
                  resizeMode="contain"
                />
              </View>
            )}

            {attachment.type === 'video' && (
              <View style={s.videoWrap}>
                <Video
                  source={{ uri: attachment.uri }}
                  style={s.videoPreview}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={false}
                />
              </View>
            )}

            {isAudio && (
              <View style={s.audioCard}>
                {/* Waveform */}
                <View style={s.waveRow}>
                  {VOICE_BARS.map((h, i) => {
                    const filled = i / VOICE_BARS.length <= progress;
                    return (
                      <View
                        key={i}
                        style={[
                          s.waveBar,
                          { height: h },
                          filled
                            ? { backgroundColor: T.ACCENT }
                            : { backgroundColor: T.BORDER_2 },
                        ]}
                      />
                    );
                  })}
                </View>
                {/* Controls row */}
                <View style={s.audioControls}>
                  <TouchableOpacity style={s.playBtn} onPress={togglePlayback} activeOpacity={0.8}>
                    {isPlaying
                      ? <Pause size={18} color="#fff" weight="fill" />
                      : <Play size={18} color="#fff" weight="fill" />
                    }
                  </TouchableOpacity>
                  <Text style={s.audioDuration}>
                    {formatDuration(isPlaying ? audioPosition : duration)}
                  </Text>
                  {attachment.type === 'voice' && onReRecord && (
                    <TouchableOpacity
                      style={s.rerecordBtn}
                      onPress={() => { handleCancel(); onReRecord(); }}
                      activeOpacity={0.7}
                    >
                      <ArrowClockwise size={16} color={T.TEXT_2} />
                      <Text style={s.rerecordText}>Re-record</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {attachment.type === 'document' && (
              <View style={s.docCard}>
                <View style={s.docIcon}>
                  <File size={32} color={T.ACCENT} weight="duotone" />
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

            {/* ── Caption (all types except document) ── */}
            {attachment.type !== 'document' && !isAudio && (
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

            {/* ── Paid content toggle (images & videos only) ── */}
            {canBePaid && (
              <View style={s.paidSection}>
                <TouchableOpacity
                  style={s.paidToggleRow}
                  onPress={() => setIsPaid((v) => !v)}
                  activeOpacity={0.8}
                >
                  <View style={s.paidToggleLeft}>
                    <View style={s.paidIcon}>
                      <LockSimple size={16} color={T.ACCENT} />
                    </View>
                    <View>
                      <Text style={s.paidLabel}>Make this paid content</Text>
                      <Text style={s.paidSub}>Subscribers pay to unlock this media</Text>
                    </View>
                  </View>
                  <View style={[s.toggle, isPaid && s.toggleActive]}>
                    <View style={[s.toggleThumb, isPaid && s.toggleThumbActive]} />
                  </View>
                </TouchableOpacity>

                {isPaid && (
                  <View style={s.priceRow}>
                    <View style={s.priceIcon}>
                      <CurrencyDollar size={16} color={T.TEXT_2} />
                    </View>
                    <TextInput
                      style={s.priceInput}
                      placeholder="Credits (e.g. 50)"
                      placeholderTextColor={T.TEXT_3}
                      value={paidPrice}
                      onChangeText={setPaidPrice}
                      keyboardType="numeric"
                      selectionColor="#888"
                      maxLength={6}
                    />
                    <Text style={s.priceSuffix}>credits</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* ── Action buttons ── */}
          <View style={s.actions}>
            {(attachment.type === 'voice') && (
              <TouchableOpacity style={s.deleteBtn} onPress={handleCancel} activeOpacity={0.7}>
                <Trash size={18} color={T.ERROR} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.sendBtn} onPress={handleSend} activeOpacity={0.8}>
              <PaperPlaneRight size={18} color="#fff" weight="fill" />
              <Text style={s.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_H * 0.88,
    minHeight: 280,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 16,
  },

  // Image preview
  imageWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    maxHeight: SCREEN_H * 0.42,
  },
  imagePreview: {
    width: '100%',
    height: SCREEN_H * 0.4,
    borderRadius: 20,
  },

  // Video preview
  videoWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    height: SCREEN_H * 0.3,
  },
  videoPreview: {
    width: '100%',
    height: '100%',
  },

  // Audio / voice
  audioCard: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    height: 28,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  audioControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioDuration: {
    flex: 1,
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  rerecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
  },
  rerecordText: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },

  // Document
  docCard: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  docIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docName: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
    marginBottom: 4,
  },
  docMeta: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  // Caption
  captionWrap: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  captionInput: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    minHeight: 44,
    paddingVertical: 12,
    lineHeight: 22,
  },

  // Paid content
  paidSection: {
    backgroundColor: T.SURFACE,
    borderRadius: 20,
    overflow: 'hidden',
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

  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.ACCENT,
    borderRadius: T.RADIUS.pill,
    paddingVertical: 14,
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  sendBtnText: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: '#fff',
  },
});
